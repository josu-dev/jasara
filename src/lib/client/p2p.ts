import type { ChannelMessage, FileId, MessageFileChunk, MessageFileTransfer, MessageText, RoomId } from '$lib/types/types';
import { assert_exists, create_module_logger, get_human_file_type } from '$lib/utils';

export const MESSAGE_TYPE = {
    TEXT: 1,
    FILE: 2,
    FILE_TRANSFER: 3,
    FILE_CHUNK: 4,
    FILE_ABORT: 5
} as const;

export type MessageType = typeof MESSAGE_TYPE;

const connectionStatus = {
    Disconnected: 'Disconnected',
    TimedOut: 'TimedOut',
    Creating: 'Creating',
    Connecting: 'Connecting',
    Connected: 'Connected',
    None: 'None'
} as const;

export type ConnectionStatus = typeof connectionStatus[keyof typeof connectionStatus];

let peer_connection: RTCPeerConnection | undefined = undefined;
let data_channel: RTCDataChannel | undefined = undefined;
let room_id = '';
let is_host = false;
let connection_status: ConnectionStatus = connectionStatus.None;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
let error_message = '';
let on_conn_state_change: (status: ConnectionStatus) => void = () => { };
let on_system_message: (msg: MessageText) => void = () => { };
let on_channel_error: (error: Error) => void = () => { };
let on_channel_message: (msg: ChannelMessage) => void = () => { };
let on_file_update: (msg: MessageFileTransfer) => void = () => { };

type FileTransfer = MessageFileTransfer & {
    chunks: string[];
    chunks_received: number;
    file: File | undefined;
    paused: boolean;
};

const _files_transfer = new Map<FileId, FileTransfer>();

const ANSWER_POLLING_INTERVAL = 1 * 1000;
const ANSWER_POLLING_TRIES = 45;
const ICE_CANDIDATES_POLLING_INTERVAL = 1 * 1000;
const ICE_CANDIDATES_POLLING_TRIES = 45;
// Constants for chunked file transfer
const CHUNK_SIZE = 16 * 1024; // 16KB chunks

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB limit
const BUFFER_FULL_THRESHOLD = 1 * 1024 * 1024; // 1MB buffer threshold
const BUFFER_LOW_THRESHOLD = 512 * 1024; // 512KB low buffer threshold

const mlog = create_module_logger('p2p');

function _create_msg_id(): string {
    return crypto.getRandomValues(new Uint32Array(1))[0].toString(16);
}

function assert_channel_ready(channel?: RTCDataChannel): asserts channel is RTCDataChannel {
    if (!channel || channel.readyState !== 'open') {
        if (!channel) {
            throw new Error('Data channel not initialized');
        }
        if (channel.readyState === 'closed' || channel.readyState === 'closing') {
            throw new Error('Data channel closed');
        }

        throw new Error('Data channel connecting, too early to send');
    }
}

function on_data_cannel_open() {
    // on_conn_state_change(connection_status);
}

function on_data_channel_close() {
    // on_conn_state_change(connection_status);
}

function on_data_channel_error(event: RTCErrorEvent) {
    on_channel_error(event.error);
}

function on_data_channel_message(event: MessageEvent) {
    let value: any;
    try {
        value = JSON.parse(event.data);
    }
    catch {
        mlog.error('Received invalid message:', event);
        return;
    }
    if (typeof value !== 'object' || value === null || !('type' in value)) {
        mlog.error('Received malformed message:', value);
        return;
    }

    const msg = value as ChannelMessage;
    switch (msg.type) {
        case MESSAGE_TYPE.TEXT: {
            if (msg.sender !== 'system') {
                msg.sender = 'other';
            }
            on_channel_message(msg);
            break;
        }

        case MESSAGE_TYPE.FILE_TRANSFER: {
            const transfer: FileTransfer = {
                type: MESSAGE_TYPE.FILE_TRANSFER,
                id: msg.id,
                ts: msg.ts,
                sender: "other",
                f_type: msg.f_type,
                f_size: msg.f_size,
                f_id: msg.f_id,
                f_name: msg.f_name,
                f_url: undefined,
                ts_start: '',
                ts_end: '',
                progress: 0,
                completed: false,
                paused: false,
                aborted: false,
                chunks: new Array<string>(msg.chunks_total),
                chunks_total: msg.chunks_total,
                chunks_received: 0,
                file: undefined,
            };
            _files_transfer.set(msg.f_id, transfer);
            on_channel_message(msg);
            break;
        }

        case MESSAGE_TYPE.FILE_CHUNK: {
            const transfer = _files_transfer.get(msg.i);
            if (transfer === undefined) {
                mlog.warn('Orphan file chunk received:', msg);
                return;
            }

            transfer.chunks[msg.n] = msg.c;
            transfer.chunks_received++;
            transfer.progress = Math.floor((transfer.chunks_received / transfer.chunks.length) * 100);

            if (transfer.chunks_received === transfer.chunks.length) {
                const f_as_base64 = transfer.chunks.join('');
                transfer.f_url = f_as_base64;
                transfer.ts_end = new Date().toISOString();
                transfer.completed = true;
                transfer.progress = 100;
            }

            on_file_update(transfer);
            break;
        }

        case MESSAGE_TYPE.FILE_ABORT: {
            const transfer = _files_transfer.get(msg.i);
            if (transfer === undefined) {
                mlog.warn('Orphan file abort received:', msg);
                return;
            }

            transfer.aborted = true;
            transfer.progress = -1;
            on_file_update(transfer);
            on_system_message(create_text_message(`File transfer '${transfer.f_name}' aborted`, 'system'));
            break;
        }

        default: {
            mlog.error('Received unknown message:', msg);
        }
    }
}

function init_peer_connection(room_id: RoomId, is_host: boolean = false) {
    // Create RTCPeerConnection without ICE servers (STUN/TURN) for private network
    peer_connection = new RTCPeerConnection();

    peer_connection.onicecandidate = async (event) => {
        const candidate = event.candidate;
        if (candidate === null) {
            return;
        }

        const r = await fetch(`/api/signal/${room_id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'CANDIDATE', is_host: is_host, candidate: candidate })
        });
        if (r.ok) {
            return;
        }
    };

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    peer_connection.onconnectionstatechange = (event) => {
        // TODO: improve this
        switch (peer_connection!.connectionState) {
            case 'connected':
                on_conn_state_change(connectionStatus.Connected);
                on_system_message(create_text_message(`Connected to room '${room_id}'`, "system"));
                break;
            case 'disconnected':
                on_conn_state_change(connectionStatus.Disconnected);
                on_system_message(create_text_message(`Disconnected from room '${room_id}'`, "system"));
                break;
            case 'failed':
            case 'closed':
                break;
            case 'new':
                on_conn_state_change(connectionStatus.None);
                break;
            case 'connecting':
                on_conn_state_change(connectionStatus.Connecting);
                break;
        }
    };

    if (is_host) {
        data_channel = peer_connection.createDataChannel('chat');
        data_channel.onopen = on_data_cannel_open;
        data_channel.onclose = on_data_channel_close;
        data_channel.onerror = on_data_channel_error;
        data_channel.onmessage = on_data_channel_message;
    }
    else {
        peer_connection.ondatachannel = (event) => {
            data_channel = event.channel;
            data_channel.onopen = on_data_cannel_open;
            data_channel.onclose = on_data_channel_close;
            data_channel.onerror = on_data_channel_error;
            data_channel.onmessage = on_data_channel_message;
        };
    }
}

async function poll_ice_candidates(pc: RTCPeerConnection, room_id: RoomId, is_host: boolean) {
    let tries = 0;
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
            const r = await fetch(`/api/signal/${room_id}`);
            if (!r.ok) {
                return;
            }
            const value = await r.json();
            let candidates: RTCIceCandidateInit[];
            if (is_host) {
                candidates = value.data.answer_candidates;
            }
            else {
                candidates = value.data.offer_candidates;
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

async function create_offer() {
    assert_exists(peer_connection, 'Peer connection not initialized');
    const offer = await peer_connection.createOffer();
    await peer_connection.setLocalDescription(offer);

    return peer_connection.localDescription;
}

async function create_room(id: RoomId,) {
    const offer = await create_offer();
    if (offer === null || offer.type !== 'offer') {
        mlog.error(`Failed to create room '${id}'`);
        return;
    }

    const r = await fetch(`/api/signal/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'OFFER', offer: offer })
    });

    if (!r.ok) {
        mlog.error(`Failed to create room '${id}'`);
        return;
    }

    on_system_message(create_text_message(`Room '${id}' created, establishing connection...`, 'system'));

    let tries = 0;
    const intervalId = setInterval(async () => {
        tries += 1;
        if (tries >= ANSWER_POLLING_TRIES) {
            clearInterval(intervalId);
            return;
        }

        try {
            const r = await fetch(`/api/signal/${id}`);
            if (!r.ok) {
                mlog.warn('Bad response for room:', r);
                return;
            }

            const { data: { answer } } = await r.json();
            if (!answer) {
                return;
            }

            clearInterval(intervalId);

            await peer_connection!.setRemoteDescription(new RTCSessionDescription(answer));

            poll_ice_candidates(peer_connection!, id, is_host);
        } catch (ex) {
            mlog.error('Unexpected exception while polling for answer:', ex);
        }
    }, ANSWER_POLLING_INTERVAL);
}

async function create_answer(offer: RTCSessionDescription) {
    assert_exists(peer_connection, 'Peer connection not initialized');
    await peer_connection.setRemoteDescription(offer);

    const answer = await peer_connection.createAnswer();
    await peer_connection.setLocalDescription(answer);

    return peer_connection.localDescription;
}

async function join_room(id: RoomId,) {
    const r = await fetch(`/api/signal/${id}`);

    if (!r.ok) {
        mlog.error(`Failed ro join room '${id}'`);
        return;
    }

    const { data: { offer } } = await r.json();

    const answer = await create_answer(new RTCSessionDescription(offer));
    if (answer === null || answer.type !== 'answer') {
        mlog.error(`Failed to join room '${id}'`);
        return;
    }

    await fetch(`/api/signal/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'ANSWER', answer: answer })
    });

    on_system_message(create_text_message(`Room '${id}' found, establishing connection...`, 'system'));

    poll_ice_candidates(peer_connection!, room_id, false);
}

type InitClientOptions = {
    id: RoomId;
    on_message: (msg: ChannelMessage) => void;
    on_error: (error: Error) => void;
    on_system_message: (msg: MessageText) => void;
    on_conn_state_change: (status: ConnectionStatus) => void;
    on_file_update: (msg: MessageFileTransfer) => void;
};

export async function init_as_host(options: InitClientOptions) {
    room_id = options.id;
    is_host = true;
    on_conn_state_change = options.on_conn_state_change;
    on_system_message = options.on_system_message;
    on_channel_error = options.on_error;
    on_channel_message = options.on_message;
    on_file_update = options.on_file_update;

    error_message = '';
    connection_status = connectionStatus.Creating;

    init_peer_connection(room_id, true);

    await create_room(room_id);
}

export async function init_as_guest(options: InitClientOptions) {
    room_id = options.id;
    is_host = false;
    on_conn_state_change = options.on_conn_state_change;
    on_system_message = options.on_system_message;
    on_channel_error = options.on_error;
    on_channel_message = options.on_message;
    on_file_update = options.on_file_update;

    error_message = '';
    connection_status = connectionStatus.Connecting;

    init_peer_connection(room_id, false);

    await join_room(room_id);
}


function _send_channel_msg(msg: ChannelMessage) {
    assert_exists(data_channel, 'Data channel not initialized or closed');
    data_channel.send(JSON.stringify(msg));
}

export function create_text_message<T extends string = string>(text: string, sender: T = 'me' as T): MessageText<T> {
    return {
        type: MESSAGE_TYPE.TEXT,
        id: _create_msg_id(),
        sender: sender,
        ts: new Date().toISOString(),
        text: text
    };
}

export function send_text(msg: MessageText): boolean {
    if (!data_channel || data_channel.readyState !== 'open') {
        return false;
    }

    _send_channel_msg(msg);
    return true;
}

export function create_file_message(file: File, sender: string = "me"): MessageFileTransfer {
    return {
        type: MESSAGE_TYPE.FILE_TRANSFER,
        id: _create_msg_id(),
        ts: new Date().toISOString(),
        sender: sender,
        f_id: Date.now().toString() + "_" + file.name,
        f_name: file.name,
        f_size: file.size,
        f_type: get_human_file_type(file),
        f_url: undefined,
        chunks_total: 0,
        progress: 0,
        aborted: false,
        completed: false,
    };
}

async function file_to_data_url(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result as string);
        reader.onerror = () => reject;
        reader.readAsDataURL(file);
    });
}

export async function send_file(msg: MessageFileTransfer, file: File): Promise<boolean> {
    assert_channel_ready(data_channel);
    const f_as_base64 = await file_to_data_url(file);
    const chunks_total = Math.ceil(f_as_base64.length / CHUNK_SIZE);

    msg.chunks_total = chunks_total;
    msg.ts_start = new Date().toISOString();
    _send_channel_msg(msg);

    const chunks_queue: MessageFileChunk[] = [];
    for (let i = 0; i < chunks_total; i++) {
        const chunk = f_as_base64.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        chunks_queue.push({
            type: MESSAGE_TYPE.FILE_CHUNK,
            i: msg.f_id,
            n: i,
            c: chunk
        });
    }

    let is_paused = false;
    let current_chunk_index = 0;

    function send_next_chunks() {
        if (is_paused) {
            return;
        }

        while (current_chunk_index < chunks_queue.length) {
            if (data_channel!.bufferedAmount > BUFFER_FULL_THRESHOLD) {
                is_paused = true;
                const buffer_low_handler = () => {
                    if (data_channel!.bufferedAmount <= BUFFER_LOW_THRESHOLD) {
                        data_channel!.removeEventListener('bufferedamountlow', buffer_low_handler);
                        is_paused = false;
                        setTimeout(send_next_chunks, 0);
                    }
                };

                data_channel!.bufferedAmountLowThreshold = BUFFER_LOW_THRESHOLD;
                data_channel!.addEventListener('bufferedamountlow', buffer_low_handler);
                return;
            }

            const chunk_msg = chunks_queue[current_chunk_index];
            _send_channel_msg(chunk_msg);

            current_chunk_index++;
            const progress = Math.floor((current_chunk_index / chunks_total) * 100);
            msg.progress = progress;
            on_file_update(msg);
            if (current_chunk_index % 10 === 0) {
                setTimeout(send_next_chunks, 0);
                return;
            }
        }

        if (current_chunk_index >= chunks_queue.length) {
            msg.ts_end = new Date().toISOString();
            msg.completed = true;
            msg.f_url = f_as_base64;
            on_file_update(msg);
        }
    }

    send_next_chunks();
    return true;
}

export function cancel_file_transfer(file_id: string): boolean {
    assert_exists(data_channel, 'Data channel not initialized');

    _send_channel_msg({
        type: MESSAGE_TYPE.FILE_ABORT,
        i: file_id
    });
    return true;
}

export async function cleanup() {
    if (data_channel !== undefined) {
        data_channel.close();
        data_channel = undefined;
    }

    if (peer_connection !== undefined) {
        peer_connection.close();
        peer_connection = undefined;
    }

    connection_status = connectionStatus.Disconnected;
    on_conn_state_change(connection_status);
    on_system_message(create_text_message(`Disconnected from room '${room_id}'`, "system"));
}

export async function disconnect() {
    cleanup();
}
