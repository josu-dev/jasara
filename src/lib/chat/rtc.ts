import { assert, assert_exists, create_module_logger, noop } from '$lib/utils.js';


export const connectionState = {
    Disconnected: 'Disconnected',
    TimedOut: 'TimedOut',
    Creating: 'Creating',
    Connecting: 'Connecting',
    Connected: 'Connected',
    None: 'None'
} as const;

export type ConnectionState = typeof connectionState[keyof typeof connectionState];

export type OnChannelError = (error: Error) => void;

export type ChannelMessage = ArrayBuffer;

export type OnChannelMessage = (data: ChannelMessage) => void;

export type OnConnectionState = (status: ConnectionState) => void;

export type RoomId = string;

const ANSWER_POLLING_INTERVAL = 1 * 1000;
const ANSWER_POLLING_TRIES = 45;
const ICE_CANDIDATES_POLLING_INTERVAL = 1 * 1000;
const ICE_CANDIDATES_POLLING_TRIES = 45;

const mlog = create_module_logger('rtc');

type GetIceCandidatesArg = { room_id: RoomId, is_host: boolean; };
type GetIceCandidates = (arg_0: GetIceCandidatesArg) => Promise<undefined | RTCIceCandidateInit[]>;

type SendIceCandidateArg = { room_id: RoomId, is_host: boolean, candidate: RTCIceCandidate; };
type SendIceCandidate = (arg_0: SendIceCandidateArg) => Promise<boolean>;

async function poll_ice_candidates(pc: RTCPeerConnection, room_id: string, is_host: boolean, get_ice_candidate: GetIceCandidates) {
    let tries = 0;
    const get_ice_candidates_arg: GetIceCandidatesArg = {
        room_id,
        is_host,

    };

    const interval_id = setInterval(async () => {
        if (pc.iceConnectionState === 'connected') {
            clearInterval(interval_id);
            return;
        }

        tries += 1;
        if (tries > ICE_CANDIDATES_POLLING_TRIES) {
            clearInterval(interval_id);
            return;
        }

        try {
            const candidates = await get_ice_candidate(get_ice_candidates_arg);
            if (candidates === undefined) {
                return;
            }

            for (const candidate of candidates) {
                const ice_candidate = new RTCIceCandidate(candidate);
                try {
                    await pc.addIceCandidate(ice_candidate);
                } catch (ex) {
                    mlog.error('Error adding candidate:', ex);
                }
            }
        } catch (ex) {
            mlog.error('Unexpected exception while polling for ice candidates:', ex);
        }
    }, ICE_CANDIDATES_POLLING_INTERVAL);
}

type GetOfferArg = { room_id: string; };
type GetOfferOut = undefined | { description: RTCSessionDescriptionInit; };
type GetOffer = (arg_0: GetOfferArg) => Promise<GetOfferOut>;

type SendOfferArg = { room_id: string, description: RTCSessionDescriptionInit; };
type SendOffer = (arg_0: SendOfferArg) => Promise<boolean>;

type GetAnswerArg = { room_id: string; };
type GetAnswerOut = undefined | { description: RTCSessionDescriptionInit; };
type GetAnswer = (arg_0: GetAnswerArg) => Promise<GetAnswerOut>;

type SendAnswerArg = { room_id: string, description: RTCSessionDescriptionInit; };
type SendAnswerOut = boolean;
type SendAnswer = (arg_0: SendAnswerArg) => Promise<SendAnswerOut>;

async function create_room(pc: RTCPeerConnection, room_id: RoomId, send_offer: SendOffer, get_answer: GetAnswer, get_ice_candidates: GetIceCandidates) {
    const description = await pc.createOffer();
    await pc.setLocalDescription(description);

    if (!await send_offer({ room_id, description })) {
        mlog.error(`Failed to create room '${room_id}'`);
        return;
    }


    let tries = 0;
    const intervalId = setInterval(async () => {
        tries += 1;
        if (tries >= ANSWER_POLLING_TRIES) {
            clearInterval(intervalId);
            return;
        }

        try {
            const answer = await get_answer({ room_id });
            if (answer === undefined) {
                return;
            }

            clearInterval(intervalId);

            await pc!.setRemoteDescription(new RTCSessionDescription(answer.description));

            poll_ice_candidates(pc, room_id, true, get_ice_candidates);
        } catch (ex) {
            mlog.error('Unexpected exception while polling for answer:', ex);
        }
    }, ANSWER_POLLING_INTERVAL);
}

async function join_room(pc: RTCPeerConnection, room_id: RoomId, get_offer: GetOffer, send_answer: SendAnswer, get_ice_candidates: GetIceCandidates) {
    const offer = await get_offer({ room_id });
    if (offer === undefined) {
        mlog.error(`Failed to join room '${room_id}'`);
        return;
    }

    await pc.setRemoteDescription(offer.description);

    const description = await pc.createAnswer();
    await pc.setLocalDescription(description);

    if (!await send_answer({ room_id, description })) {
        mlog.error(`Failed to join room '${room_id}'`);
        return;
    }

    await poll_ice_candidates(pc, room_id, false, get_ice_candidates);
}

let peer_connection: RTCPeerConnection | undefined = undefined;
let data_channel: RTCDataChannel | undefined = undefined;
let room_id = '';
let is_host = false;
let connection_status: ConnectionState = connectionState.None;
let on_channel_error: OnChannelError = noop;
let on_channel_message: OnChannelMessage = noop;
let on_connection_state: OnConnectionState = noop;

function data_cannel_on_open() { }

function data_channel_on_close() { }

function data_channel_on_error(event: RTCErrorEvent) {
    on_channel_error(event.error);
}

function data_channel_on_message(event: MessageEvent) {
    const data = event.data;
    assert(data instanceof ArrayBuffer, `Expected ArrayBuffer as data recived '${Object.getPrototypeOf(data)}'`);
    on_channel_message(data);
}

export type InitClientHandshake = {
    get_offer: GetOffer;
    send_offer: SendOffer;
    get_answer: GetAnswer;
    send_answer: SendAnswer;
    get_ice_candidates: GetIceCandidates;
    send_ice_candidate: SendIceCandidate;
};

type InitClientOptions = {
    room_id: RoomId;
    is_host: boolean;
    on_channel_message: OnChannelMessage;
    on_error: OnChannelError;
    on_connection_state: OnConnectionState;
    handshake: InitClientHandshake;
};

export async function init(options: InitClientOptions) {
    room_id = options.room_id;
    is_host = options.is_host;
    on_connection_state = options.on_connection_state;
    on_channel_error = options.on_error;
    on_channel_message = options.on_channel_message;
    const {
        get_offer,
        send_offer,
        get_answer,
        send_answer,
        get_ice_candidates,
        send_ice_candidate
    } = options.handshake;


    if (is_host) {
        connection_status = connectionState.Creating;
    } else {
        connection_status = connectionState.Connecting;
    }
    peer_connection = new RTCPeerConnection();

    peer_connection.onicecandidate = async (event) => {
        const candidate = event.candidate;
        if (candidate === null) {
            return;
        }

        if (await send_ice_candidate({ room_id, is_host, candidate })) {
            // work
        }
        else {
            // didn't work
        }
    };

    peer_connection.onconnectionstatechange = (event) => {
        // TODO: improve this
        switch (peer_connection!.connectionState) {
            case 'connected':
                on_connection_state(connectionState.Connected);
                break;
            case 'disconnected':
                on_connection_state(connectionState.Disconnected);
                break;
            case 'failed':
            case 'closed':
                break;
            case 'new':
                on_connection_state(connectionState.None);
                break;
            case 'connecting':
                on_connection_state(connectionState.Connecting);
                break;
        }
    };

    if (is_host) {
        data_channel = peer_connection.createDataChannel('chat');
        data_channel.onopen = data_cannel_on_open;
        data_channel.onclose = data_channel_on_close;
        data_channel.onerror = data_channel_on_error;
        data_channel.onmessage = data_channel_on_message;
    }
    else {
        peer_connection.ondatachannel = (event) => {
            data_channel = event.channel;
            data_channel.onopen = data_cannel_on_open;
            data_channel.onclose = data_channel_on_close;
            data_channel.onerror = data_channel_on_error;
            data_channel.onmessage = data_channel_on_message;
        };
    }

    if (is_host) {
        await create_room(peer_connection, room_id, send_offer, get_answer, get_ice_candidates);
    }
    else {
        await join_room(peer_connection, room_id, get_offer, send_answer, get_ice_candidates);
    }
}

async function cleanup() {
    if (data_channel !== undefined) {
        data_channel.close();
        data_channel = undefined;
    }

    if (peer_connection !== undefined) {
        peer_connection.close();
        peer_connection = undefined;
    }

    connection_status = connectionState.Disconnected;
    on_connection_state(connection_status);
}

export async function destroy() {
    await cleanup();
}

export function get_data_channel() {
    return data_channel;
}

export function send_message(data: ArrayBuffer): void {
    assert_exists(data_channel, 'Data channel not initialized or closed');
    try {
        data_channel.send(data);
    }
    catch (ex) {
        console.warn(ex);
    }
}
