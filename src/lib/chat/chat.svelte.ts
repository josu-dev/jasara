import { create_context, download_blob, get_human_file_type, now_utc, uuidv4 } from '$lib/utils.js';
import * as message from './message.js';
import * as rtc from './rtc.js';
import type { ConnectionState, MessageFileTransfer, MessageRenderable } from './shared.js';


// Constants for chunked file transfer
const CHUNK_SIZE = 16 * 1024; // 16KB chunks
const BUFFER_FULL_THRESHOLD = 1 * 1024 * 1024; // 1MB buffer threshold
const BUFFER_LOW_THRESHOLD = 512 * 1024; // 512KB low buffer threshold


export function create_text_message<T extends string = string>(text: string, sender: T = 'me' as T): message.MessageText<T> {
    return {
        type: message.MESSAGE_TEXT,
        id: uuidv4(),
        sender: sender,
        ts: now_utc(),
        text: text
    };
}

export function create_file_message(file: File, sender: string = "me"): MessageFileTransfer {
    return {
        type: message.MESSAGE_FILE_META,
        id: uuidv4(),
        ts: now_utc(),
        sender: sender,
        f_id: uuidv4(),
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

        const { data } = await r.json();
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

type ChatCurrentState = {
    connecion_state: ConnectionState;
    room_id: string;
    messages: MessageRenderable[];
    error: undefined | Error;
    is_host: boolean;
    not_connected: boolean;
};

type InitClientOptions = {
    room_id: rtc.RoomId;
};

type ChatInit = {
    messages?: MessageRenderable[];
    room_id?: rtc.RoomId;
};

function create_chat(initial: ChatInit) {
    let connection_state: ConnectionState = "None";
    let room_id: rtc.RoomId = initial.room_id ?? "";
    let is_host = false;
    let error: undefined | Error = void 0;
    const messages: MessageRenderable[] = initial.messages ?? [];
    const file_transfer_id_to_idx: Map<string, number> = new Map();
    const files_transfer = new Map<message.FileId, MessageFileTransfer>();

    const state: ChatCurrentState = $state({
        connecion_state: "None",
        room_id: room_id,
        messages: messages,
        error: void 0,
        is_host: false,
        not_connected: true
    });

    function sync_state() {
        state.connecion_state = connection_state;
        state.error = error;
        state.is_host = is_host;
        state.room_id = room_id;
        state.not_connected = connection_state !== 'Connected';
    }

    function push_message(msg: MessageRenderable) {
        messages.push(msg);
        state.messages.push(msg);
    }

    function push_system_message(text: string) {
        const msg = create_text_message(text, 'system');
        messages.push(msg);
        state.messages.push(msg);
    }

    function update_file(m: MessageFileTransfer) {
        const idx = file_transfer_id_to_idx.get(m.f_id);
        if (idx === undefined) {
            return;
        }

        messages[idx] = m;
        state.messages[idx] = m;
    }

    function on_connection_state(value: ConnectionState) {
        connection_state = value;
        state.connecion_state = value;
        state.not_connected = value !== 'Connected';
    }

    function on_channel_error(error: Error) {
        console.warn(error);
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
                push_message(msg);
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
                files_transfer.set(msg.f_id, transfer);
                push_message(transfer);
                file_transfer_id_to_idx.set(msg.f_id, messages.length - 1);
                break;
            }

            case message.MESSAGE_FILE_CHUNK: {
                const transfer = files_transfer.get(msg.id);
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

                update_file(transfer);
                break;
            }

            case message.MESSAGE_FILE_ABORT: {
                const transfer = files_transfer.get(msg.id);
                if (transfer === undefined) {
                    console.warn('Orphan file abort received:', msg);
                    return;
                }

                transfer.aborted = true;
                transfer.progress = -1;
                update_file(transfer);
                push_system_message(`File transfer '${transfer.f_name}' aborted`);
                break;
            }

            default: {
                console.warn('Received unknown message:', msg);
            }
        }
    }

    async function init_as_host(options: InitClientOptions) {
        room_id = options.room_id;
        is_host = true;

        error = void 0;
        connection_state = rtc.connectionState.Creating;
        sync_state();

        await rtc.init({
            room_id: room_id,
            is_host: true,
            handshake: rtc_handshake,
            on_channel_message: on_channel_message,
            on_connection_state: on_connection_state,
            on_error: on_channel_error,
        });

        // push_system_message(create_text_message(`Room '${id}' created, establishing connection...`, 'system'));
    }

    async function init_as_guest(options: InitClientOptions) {
        room_id = options.room_id;
        is_host = false;
        error = void 0;
        connection_state = rtc.connectionState.Connecting;
        sync_state();

        await rtc.init({
            room_id: room_id,
            is_host: false,
            handshake: rtc_handshake,
            on_channel_message: on_channel_message,
            on_connection_state: on_connection_state,
            on_error: on_channel_error,
        });

        // push_system_message(create_text_message(`Room '${id}' found, establishing connection...`, 'system'));
    }

    function send_text_message(msg: message.MessageText): boolean {
        const encoded = message.encode_text(msg);
        if (encoded === undefined) {
            return false;
        }

        rtc.send_message(encoded);
        return true;
    }

    function send_text(text: string, onsend?: () => void) {
        const msg = create_text_message(text);
        if (!send_text_message(msg)) {
            return;
        }

        push_message(msg);
        onsend?.();
    }

    async function send_file_message(msg: MessageFileTransfer, file: File): Promise<boolean> {
        const data_channel = rtc.get_data_channel();
        if (!data_channel) {
            return false;
        }
        files_transfer.set(msg.f_id, msg);
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
                update_file(msg);
                if (current_chunk_index % 10 === 0) {
                    setTimeout(send_next_chunks, 0);
                    return;
                }
            }

            if (current_chunk_index >= chunks_queue.length) {
                msg.ts_end = now_utc();
                msg.completed = true;
                msg.f_blob = file;
                update_file(msg);
            }
        }

        send_next_chunks();
        return true;
    }

    function send_files(files: File[]) {
        for (const file of files) {
            const msg = create_file_message(file);
            send_file_message(msg, file);

            push_message(msg);
            file_transfer_id_to_idx.set(msg.f_id, messages.length - 1);
        }
    }

    function cancel_file_transfer(file_id: string): boolean {
        const transfer = files_transfer.get(file_id);
        if (!transfer) {
            return true;
        }

        transfer.aborted = true;
        const msg = {
            type: message.MESSAGE_FILE_ABORT,
            id: file_id
        } as const;
        rtc.send_message(message.encode_file_abort(msg)!);

        update_file(transfer);
        return true;
    }

    function download_file(id: string) {
        const file_transfer = files_transfer.get(id);
        if (file_transfer === undefined) {
            return undefined;
        }
        if (!file_transfer.completed) {
            return undefined;
        }

        download_blob(file_transfer.f_blob, file_transfer.f_name);
    }

    async function deinit() {
        // TODO: improve this?
        await rtc.destroy();
    }

    return {
        get current() {
            return state;
        },
        init_as_guest,
        init_as_host,
        deinit,
        send_text,
        create_file_message,
        send_files,
        cancel_file_transfer,
        download_file,
    };
}

type Chat = ReturnType<typeof create_chat>;

const chat_ctx = create_context<Chat>('chat');

export function use_chat_ctx(): Chat;
export function use_chat_ctx(opts: ChatInit): Chat;
export function use_chat_ctx(opts?: ChatInit): Chat {
    if (opts === undefined) {
        return chat_ctx.get();
    }

    return chat_ctx.set(create_chat(opts));
}


// push_system_message(create_text_message(`Connected to room '${room_id}'`, "system"));
// push_system_message(create_text_message(`Disconnected from room '${room_id}'`, "system"));
