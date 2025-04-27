import { get_human_file_type, now_utc } from '$lib/utils.js';
import * as message from './message.js';
import * as rtc from './rtc.js';


export const MESSAGE_TEXT = message.MESSAGE_TEXT;

export const MESSAGE_FILE_TRANSFER = message.MESSAGE_FILE_META;

export type MessageRenderable = message.MessageText | MessageFileTransfer;

export type ConnectionStatus = rtc.ConnectionStatus;

export type MessageFileTransfer = message.MessageFileMeta & {
    f_type_human: string;
    chunks: Uint8Array[];
    chunks_received: number;
    file: File | undefined;
    paused: boolean;
    ts_start?: string;
    ts_end?: string;
    progress: number;
    aborted: boolean;
} & ({
    completed: false;
    f_blob: undefined;
} | {
    completed: true;
    f_blob: Blob;
});

let room_id = '';
let is_host = false;
let connection_status: rtc.ConnectionStatus = rtc.connectionStatus.None;
let error_message = '';
let on_conn_state_change: (status: rtc.ConnectionStatus) => void = () => { };
let on_system_message: (msg: message.MessageText) => void = () => { };
let on_message: (msg: MessageRenderable) => void = () => { };
let on_channel_error: (error: Error) => void = () => { };
let on_file_update: (msg: MessageFileTransfer) => void = () => { };

const _files_transfer = new Map<message.FileId, MessageFileTransfer>();

// Constants for chunked file transfer
const CHUNK_SIZE = 16 * 1024; // 16KB chunks
const BUFFER_FULL_THRESHOLD = 1 * 1024 * 1024; // 1MB buffer threshold
const BUFFER_LOW_THRESHOLD = 512 * 1024; // 512KB low buffer threshold


function _uuidv4(): string {
    const out = crypto.randomUUID?.() ?? Array.from(crypto.getRandomValues(new Uint8Array(18)), b => b.toString(16).padStart(2, '0')).join('');
    return out;
}

function on_channel_message(data: rtc.ChannelMessage) {
    const msg = message.decode_message(data);
    if (msg === undefined) {
        console.warn('Received invalid message:', data);
        return;
    }

    switch (msg.type) {
        case message.MESSAGE_TEXT: {
            if (msg.sender !== 'system') {
                msg.sender = 'other';
            }
            on_message(msg);
            break;
        }

        case message.MESSAGE_FILE_META: {
            const transfer: MessageFileTransfer = {
                type: message.MESSAGE_FILE_META,
                id: msg.id,
                ts: msg.ts,
                sender: "other",
                f_type: msg.f_type,
                f_size: msg.f_size,
                f_id: msg.f_id,
                f_name: msg.f_name,
                f_type_human: get_human_file_type(msg.f_name, msg.f_type),
                f_blob: undefined,
                f_total_chunks: msg.f_total_chunks,
                ts_start: '',
                ts_end: '',
                progress: 0,
                completed: false,
                paused: false,
                aborted: false,
                chunks: new Array(msg.f_total_chunks),
                chunks_received: 0,
                file: undefined,
            };
            _files_transfer.set(msg.f_id, transfer);
            on_message(transfer);
            break;
        }

        case message.MESSAGE_FILE_CHUNK: {
            const transfer = _files_transfer.get(msg.id);
            if (transfer === undefined) {
                console.warn('Orphan file chunk received:', msg);
                return;
            }

            transfer.chunks[msg.n] = msg.c;
            transfer.chunks_received++;
            transfer.progress = Math.floor((transfer.chunks_received / transfer.chunks.length) * 100);

            if (transfer.chunks_received === transfer.chunks.length) {
                const f_blob = new Blob(transfer.chunks, { type: transfer.f_type });
                transfer.f_blob = f_blob;
                transfer.ts_end = now_utc();
                transfer.completed = true;
                transfer.progress = 100;
            }

            on_file_update(transfer);
            break;
        }

        case message.MESSAGE_FILE_ABORT: {
            const transfer = _files_transfer.get(msg.id);
            if (transfer === undefined) {
                console.warn('Orphan file abort received:', msg);
                return;
            }

            transfer.aborted = true;
            transfer.progress = -1;
            on_file_update(transfer);
            on_system_message(create_text_message(`File transfer '${transfer.f_name}' aborted`, 'system'));
            break;
        }

        default: {
            console.warn('Received unknown message:', msg);
        }
    }
}

const rtc_handshake: rtc.InitClientHandshake = {
    get_offer: async ({ room_id }) => {
        const r = await fetch(`/api/signal/${room_id}`);
        if (!r.ok) {
            return;
        }

        const { data: { offer } } = await r.json();
        return { description: offer };
    },
    send_offer: async ({ room_id, description }) => {
        const r = await fetch(`/api/signal/${room_id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'OFFER', offer: description })
        });
        if (!r.ok) {
            return false;
        }

        return true;
    },
    get_answer: async ({ room_id, }) => {
        const r = await fetch(`/api/signal/${room_id}`);
        if (!r.ok) {
            return;
        }

        const { data: { answer } } = await r.json();
        if (answer == null) {
            return;
        }

        return { description: answer };
    },
    send_answer: async ({ room_id, description }) => {
        const r = await fetch(`/api/signal/${room_id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'ANSWER', answer: description })
        });
        if (r.ok) {
            return true;
        }

        return false;
    },
    get_ice_candidates: async ({ room_id, is_host, }) => {
        const r = await fetch(`/api/signal/${room_id}`);
        if (!r.ok) {
            return;
        }

        const {data} = await r.json();
        let out: RTCIceCandidateInit[];
        if (is_host) {
            out = data.answer_candidates;
        }
        else {
            out = data.offer_candidates;
        }

        return out;
    },
    send_ice_candidate: async ({ room_id, is_host, candidate }) => {
        const r = await fetch(`/api/signal/${room_id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'CANDIDATE', is_host: is_host, candidate: candidate })
        });
        if (r.ok) {
            return true;
        }

        return false;
    }
};

type InitOptions = {
    room_id: rtc.RoomId;
    on_message: (msg: MessageRenderable) => void;
    on_error: (error: Error) => void;
    on_system_message: (msg: message.MessageText) => void;
    on_conn_state_change: (status: rtc.ConnectionStatus) => void;
    on_file_update: (msg: MessageFileTransfer) => void;
};

// on_system_message(create_text_message(`Connected to room '${room_id}'`, "system"));
// on_system_message(create_text_message(`Disconnected from room '${room_id}'`, "system"));

export async function init_as_host(options: InitOptions) {
    room_id = options.room_id;
    is_host = true;
    on_conn_state_change = options.on_conn_state_change;
    on_system_message = options.on_system_message;
    on_channel_error = options.on_error;
    on_message = options.on_message;
    on_file_update = options.on_file_update;

    error_message = '';
    connection_status = rtc.connectionStatus.Creating;

    await rtc.init({
        room_id: room_id,
        is_host: true,
        handshake: rtc_handshake,
        on_channel_message: on_channel_message,
        on_connection_state: on_conn_state_change,
        on_error: on_channel_error,
    });

    // on_system_message(create_text_message(`Room '${id}' created, establishing connection...`, 'system'));
}

export async function init_as_guest(options: InitOptions) {
    room_id = options.room_id;
    is_host = false;
    on_conn_state_change = options.on_conn_state_change;
    on_system_message = options.on_system_message;
    on_channel_error = options.on_error;
    on_message = options.on_message;
    on_file_update = options.on_file_update;

    error_message = '';
    connection_status = rtc.connectionStatus.Connecting;

    await rtc.init({
        room_id: room_id,
        is_host: false,
        handshake: rtc_handshake,
        on_channel_message: on_channel_message,
        on_connection_state: on_conn_state_change,
        on_error: on_channel_error,
    });

    // on_system_message(create_text_message(`Room '${id}' found, establishing connection...`, 'system'));
}

export function create_text_message<T extends string = string>(text: string, sender: T = 'me' as T): message.MessageText<T> {
    return {
        type: message.MESSAGE_TEXT,
        id: _uuidv4(),
        sender: sender,
        ts: now_utc(),
        text: text
    };
}

export function send_text_message(msg: message.MessageText): boolean {
    const encoded = message.encode_text(msg);
    if (encoded === undefined) {
        return false;
    }

    rtc.send_message(encoded);
    return true;
}

export function create_file_message(file: File, sender: string = "me"): MessageFileTransfer {
    return {
        type: message.MESSAGE_FILE_META,
        id: _uuidv4(),
        ts: now_utc(),
        sender: sender,
        f_id: _uuidv4(),
        f_name: file.name,
        f_size: file.size,
        f_type: file.type,
        f_type_human: get_human_file_type(file.name, file.type),
        f_total_chunks: 0,
        chunks: [],
        chunks_received: 0,
        file: undefined,
        paused: false,
        completed: false,
        f_blob: undefined,
        progress: 0,
        aborted: false
    };
}

export async function send_file_message(msg: MessageFileTransfer, file: File): Promise<boolean> {
    const data_channel = rtc.get_data_channel();
    if (!data_channel) {
        return false;
    }

    _files_transfer.set(msg.f_id, msg);
    const chunks_total = Math.ceil(msg.f_size / CHUNK_SIZE);
    msg.f_total_chunks = chunks_total;
    msg.ts_start = now_utc();
    rtc.send_message(message.encode_file_meta(msg)!);
    const f_bytes = new Uint8Array(await file.arrayBuffer());
    const chunks_queue: message.MessageFileChunk[] = [];
    for (let i = 0; i < chunks_total; i++) {
        const chunk = f_bytes.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        chunks_queue.push({
            type: message.MESSAGE_FILE_CHUNK,
            id: msg.f_id,
            n: i,
            c: chunk
        });
    }
    let is_paused = false;
    let current_chunk_index = 0;

    function send_next_chunks() {
        if (is_paused || msg.aborted) {
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

            rtc.send_message(message.encode_file_chunk(chunk_msg)!);

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
            msg.ts_end = now_utc();
            msg.completed = true;
            msg.f_blob = file;
            on_file_update(msg);
        }
    }

    send_next_chunks();
    return true;
}

export function cancel_file_transfer(file_id: string): boolean {
    const transfer = _files_transfer.get(file_id);
    if (!transfer) {
        return true;
    }

    transfer.aborted = true;
    const msg = {
        type: message.MESSAGE_FILE_ABORT,
        id: file_id
    } as const;
    rtc.send_message(message.encode_file_abort(msg)!);

    on_file_update(transfer);
    return true;
}

export async function deinit() {
    // TODO: improve this?
    await rtc.destroy();
}
