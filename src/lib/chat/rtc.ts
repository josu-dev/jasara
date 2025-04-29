import type { AsyncResult, ExceptionError, RetryError } from '$lib/utils.js';
import { err, noop, ok, retry_on_undefined } from '$lib/utils.js';


const ANSWER_POLL_INTERVAL = 0.5 * 1000;
const ANSWER_POLL_RETRIES = 60;
const OFFER_POLL_INTERVAL = 0.5 * 1000;
const OFFER_POLL_RETRIES = 60;
const ICE_CANDIDATES_POLL_INTERVAL = 0.5 * 1000;
const ICE_CANDIDATES_POLL_RETRIES = 60;

export const connectionState = {
    Disconnected: 'Disconnected',
    TimedOut: 'TimedOut',
    Creating: 'Creating',
    Connecting: 'Connecting',
    Connected: 'Connected',
    None: 'None'
} as const;

export type ConnectionState = typeof connectionState[keyof typeof connectionState];

export type RoomId = string;


const ROOM_NOT_FOUND_ERROR = 'room_not_found';
const ROOM_ALREADY_EXISTS_ERROR = 'room_already_exists';
const SERVER_ERROR = 'server_error';
const STALE_ERROR = 'stale_error';

type StaleError = { type: typeof STALE_ERROR; value: unknown; };

type RoomNotFoundError = { type: typeof ROOM_NOT_FOUND_ERROR; };

type RoomAlreadyExistsError = { type: typeof ROOM_ALREADY_EXISTS_ERROR; };

type ServerError = { type: typeof SERVER_ERROR, status: number; };

type GetOffer = (args_0: { room_id: RoomId; }) => AsyncResult<{ description: RTCSessionDescriptionInit; }, RoomNotFoundError | ServerError | ExceptionError>;

type SendOffer = (args_0: { room_id: RoomId; description: RTCSessionDescriptionInit; }) => AsyncResult<true, RoomAlreadyExistsError | ServerError | ExceptionError>;

type CancelOffer = (args_0: { room_id: RoomId; }) => AsyncResult<true, ServerError | ExceptionError>;

type GetAnswer = (args_0: { room_id: RoomId; }) => AsyncResult<undefined | { description: RTCSessionDescriptionInit; }, RoomNotFoundError | ServerError | ExceptionError>;

type SendAnswer = (args_0: { room_id: RoomId; description: RTCSessionDescriptionInit; }) => AsyncResult<true, RoomNotFoundError | ServerError | ExceptionError>;

function exception_is_peer_connection_closed(value: unknown) : value is DOMException {
    return value instanceof DOMException && value.name === 'InvalidStateError';
}

async function create_room(pc: RTCPeerConnection, room_id: RoomId, send_offer: SendOffer, get_answer: GetAnswer) {
    const description = await pc.createOffer();
    await pc.setLocalDescription(description);

    const offer = await send_offer({ room_id, description });
    if (offer.is_err) {
        return offer;
    }

    const answer = await retry_on_undefined(get_answer, ANSWER_POLL_RETRIES, ANSWER_POLL_INTERVAL, { room_id });
    if (answer.is_err) {
        return answer;
    }

    await pc.setRemoteDescription(new RTCSessionDescription(answer.value.description));

    return ok(true);
}

async function join_room(pc: RTCPeerConnection, room_id: RoomId, get_offer: GetOffer, send_answer: SendAnswer) {
    const offer = await retry_on_undefined(get_offer, OFFER_POLL_RETRIES, OFFER_POLL_INTERVAL, { room_id });
    if (offer.is_err) {
        return offer;
    }

    await pc.setRemoteDescription(offer.value.description);

    const description = await pc.createAnswer();
    await pc.setLocalDescription(description);

    const answer = await send_answer({ room_id, description });
    if (answer.is_err) {
        return answer;
    }

    return ok(true);
}

type GetIceCandidates = (args_0: { room_id: RoomId, is_host: boolean; }) => AsyncResult<undefined | RTCIceCandidateInit[], RoomNotFoundError | ServerError | ExceptionError>;

type SendIceCandidate = (args_0: { room_id: RoomId, is_host: boolean, candidate: RTCIceCandidate; }) => AsyncResult<true, RoomNotFoundError | ServerError | ExceptionError>;

async function poll_ice_candidates(pc: RTCPeerConnection, room_id: RoomId, is_host: boolean, get_ice_candidates: GetIceCandidates): AsyncResult<true, RetryError | RoomNotFoundError | ServerError | ExceptionError | StaleError> {
    return new Promise((resolve) => {
        let tries = 0;
        const get_arg: Parameters<GetIceCandidates>[0] = {
            room_id,
            is_host,
        };

        async function recall() {
            if (pc.iceConnectionState === 'connected') {
                return resolve(ok(true));
            }

            tries += 1;

            const result = await get_ice_candidates(get_arg);
            if (result.is_err) {
                return resolve(result);
            }

            if (result.value !== undefined) {
                for (const candidate of result.value) {
                    const ice_candidate = new RTCIceCandidate(candidate);
                    try {
                        await pc.addIceCandidate(ice_candidate);
                    } catch (ex) {
                        if (exception_is_peer_connection_closed(ex)) {
                            return resolve(err({ type: 'stale_error', value: ex }));
                        }
    
                        window.reportError(ex);
                    }
                }
            }

            if (tries > ICE_CANDIDATES_POLL_RETRIES) {
                return resolve(err({ type: 'retries_exceeded', retries: ICE_CANDIDATES_POLL_RETRIES }));
            }

            setTimeout(recall, ICE_CANDIDATES_POLL_INTERVAL);
        };

        recall();
    });
}

let global_pc: RTCPeerConnection | undefined = undefined;

let global_dc: RTCDataChannel | undefined = undefined;

export type OnChannelError = (error: RTCError) => void;

export type ChannelMessage = ArrayBuffer;

export type OnChannelMessage = (data: ChannelMessage) => void;

export type OnConnectionState = (state: ConnectionState) => void;

let on_channel_error: OnChannelError = noop;
let on_channel_message: OnChannelMessage = noop;
let on_connection_state: OnConnectionState = noop;

function global_dc_on_open() { }

function global_dc_on_close() { }

function global_dc_on_error(event: RTCErrorEvent) {
    on_channel_error(event.error);
}

function global_dc_on_message(event: MessageEvent) {
    const data = event.data;
    if (!(data instanceof ArrayBuffer)) {
        window.reportError(new Error(`Expected ArrayBuffer as data but recived '${Object.getPrototypeOf(data)}' instead`));
        return;
    }

    on_channel_message(data);
}

function init_global_pc(room_id: RoomId, is_host: boolean, send_ice_candidate: SendIceCandidate) {
    const pc = new RTCPeerConnection();
    global_pc = pc;

    pc.onicecandidate = async (event) => {
        const candidate = event.candidate;
        if (candidate === null) {
            return;
        }

        await send_ice_candidate({ room_id, is_host, candidate });
    };

    pc.onconnectionstatechange = (event) => {
        const pc = event.target as RTCPeerConnection;
        // TODO: improve this
        switch (pc.connectionState) {
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
        global_dc = pc.createDataChannel('chat');
        global_dc.onopen = global_dc_on_open;
        global_dc.onclose = global_dc_on_close;
        global_dc.onerror = global_dc_on_error;
        global_dc.onmessage = global_dc_on_message;
    }
    else {
        pc.ondatachannel = (event) => {
            global_dc = event.channel;
            global_dc.onopen = global_dc_on_open;
            global_dc.onclose = global_dc_on_close;
            global_dc.onerror = global_dc_on_error;
            global_dc.onmessage = global_dc_on_message;
        };
    }

    return pc;
}

export type RTCHandshakeHooks = {
    get_offer: GetOffer;
    send_offer: SendOffer;
    cancel_offer: CancelOffer;
    get_answer: GetAnswer;
    send_answer: SendAnswer;
    get_ice_candidates: GetIceCandidates;
    send_ice_candidate: SendIceCandidate;
};

type InitRTCOptions = {
    room_id: RoomId;
    is_host: boolean;
    on_channel_error: OnChannelError;
    on_channel_message: OnChannelMessage;
    on_connection_state: OnConnectionState;
    handshake: RTCHandshakeHooks;
};

export async function init(options: InitRTCOptions) {
    const room_id = options.room_id;
    const is_host = options.is_host;
    on_connection_state = options.on_connection_state;
    on_channel_error = options.on_channel_error;
    on_channel_message = options.on_channel_message;
    const {
        get_offer,
        send_offer,
        cancel_offer,
        get_answer,
        send_answer,
        get_ice_candidates,
        send_ice_candidate
    } = options.handshake;

    const pc = init_global_pc(room_id, is_host, send_ice_candidate);

    try {
        if (is_host) {
            on_connection_state(connectionState.Creating);
            const r = await create_room(pc, room_id, send_offer, get_answer);
            if (r.is_err) {
                await cleanup();
                return r;
            }
        }
        else {
            on_connection_state(connectionState.Connecting);
            const r = await join_room(pc, room_id, get_offer, send_answer);
            if (r.is_err) {
                await cleanup();
                return r;
            }
        }

        const r_ice = await poll_ice_candidates(pc, room_id, is_host, get_ice_candidates);
        if (r_ice.is_err) {
            await cleanup();
        }

        return r_ice;
    }
    catch (ex) {
        if (pc !== global_pc) {
            return err<StaleError>({ type: 'stale_error', value: ex });
        }

        return err<ExceptionError>({ type: 'exception', value: ex });
    }
}

async function cleanup() {
    if (global_dc !== undefined) {
        global_dc.close();
        global_dc = undefined;
    }

    if (global_pc !== undefined) {
        global_pc.close();
        global_pc = undefined;
    }
}

export async function deinit() {
    await cleanup();
}

export function get_data_channel(): undefined | RTCDataChannel {
    return global_dc;
}

export function send_message(data: ArrayBuffer): boolean {
    try {
        global_dc!.send(data);
        return true;
    }
    catch (ex) {
        window.reportError(ex);
        return false;
    }
}
