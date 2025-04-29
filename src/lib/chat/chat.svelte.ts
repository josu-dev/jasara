import { create_context, download_blob, err, get_human_file_type, now_utc, ok, uuidv4 } from '$lib/utils.js';
import * as message from './message.js';
import * as rtc from './rtc.js';
import type { ConnectionState, MessageFileTransfer, MessageRenderable } from './shared.js';


const RTC_BUFFER_FULL_THRESHOLD = 1 * 1024 * 1024; // 1 MB buffer threshold
const RTC_BUFFER_LOW_THRESHOLD = 512 * 1024; // 512 KB low buffer threshold


export function create_text_message(text: string, sender: string): message.MessageText {
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

const rtc_handshake: rtc.RTCHandshakeHooks = {
    get_offer: async ({ room_id }) => {
        const r = await fetch(`/api/signal/${room_id}`);
        if (r.status === 404) {
            return err({ type: 'room_not_found' });
        }
        if (r.status >= 300) {
            return err({ type: 'server_error', status: r.status });
        }

        const { data: { offer } } = await r.json();
        return ok({ description: offer });
    },
    send_offer: async ({ room_id, description }) => {
        const r = await fetch(`/api/signal/${room_id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'OFFER', offer: description })
        });
        if (r.ok) {
            return ok(true);
        }
        if (r.status === 400) {
            return err({ type: 'room_already_exists' });
        }
        return err({ type: 'server_error', status: r.status });
    },
    cancel_offer: async ({ room_id }) => {
        const r = await fetch(`/api/signal/${room_id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'CANCEL' })
        });
        if (r.ok) {
            return ok(true);
        }
        return err({ type: 'server_error', status: r.status });
    },
    get_answer: async ({ room_id, }) => {
        const r = await fetch(`/api/signal/${room_id}`);
        if (r.status === 404) {
            return err({ type: 'room_not_found' });
        }
        if (r.status >= 300) {
            return err({ type: 'server_error', status: r.status });
        }

        const { data: { answer } } = await r.json();
        if (answer == null) {
            return ok();
        }

        return ok({ description: answer });
    },
    send_answer: async ({ room_id, description }) => {
        const r = await fetch(`/api/signal/${room_id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'ANSWER', answer: description })
        });
        if (r.ok) {
            return ok(true);
        }
        if (r.status === 404) {
            return err({ type: 'room_not_found' });
        }
        return err({ 'type': 'exception', value: void 0 });
    },
    get_ice_candidates: async ({ room_id, is_host, }) => {
        const r = await fetch(`/api/signal/${room_id}`);
        if (r.status === 404) {
            return err({ type: 'room_not_found' });
        }
        if (r.status >= 300) {
            return err({ type: 'server_error', status: r.status });
        }

        const { data } = await r.json();
        let out: RTCIceCandidateInit[];
        if (is_host) {
            out = data.answer_candidates;
        }
        else {
            out = data.offer_candidates;
        }

        return ok(out);
    },
    send_ice_candidate: async ({ room_id, is_host, candidate }) => {
        const r = await fetch(`/api/signal/${room_id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'CANDIDATE', is_host: is_host, candidate: candidate })
        });
        if (r.status === 404) {
            return err({ type: 'room_not_found' });
        }
        if (r.status >= 300) {
            return err({ type: 'server_error', status: r.status });
        }
        return ok(true);
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

    function sync_state(): void {
        state.connecion_state = connection_state;
        state.error = error;
        state.is_host = is_host;
        state.room_id = room_id;
        state.not_connected = connection_state !== 'Connected';
    }

    function push_message(msg: MessageRenderable): void {
        messages.push(msg);
        state.messages.push(msg);
    }

    function push_system_message(text: string): void {
        const msg = create_text_message(text, 'system');
        messages.push(msg);
        state.messages.push(msg);
    }

    function update_file(m: MessageFileTransfer): void {
        const idx = file_transfer_id_to_idx.get(m.f_id);
        if (idx === undefined) {
            return;
        }

        messages[idx] = m;
        state.messages[idx] = m;
    }

    function on_connection_state(value: ConnectionState): void {
        const prev = connection_state;
        connection_state = value;

        if (prev !== connection_state) {
            state.connecion_state = value;
            state.not_connected = value !== 'Connected';

            if (value === 'Connecting') {
                push_system_message(`Establishing connection...`);
                return;
            }
            if (value === 'Connected') {
                push_system_message(`Connection established`);
                return;
            }
            if (value === 'Disconnected') {
                push_system_message(`Disconnected`);
                return;
            }
        }
    }

    function on_channel_error(error: RTCError): void {
        window.reportError(error);
    }

    function on_channel_message(data: rtc.ChannelMessage): void {
        const msg = message.decode_message(data);
        if (msg === undefined) {
            throw new Error(`Invalid message recived '${data}'`);
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
                    return;
                }

                transfer.aborted = true;
                transfer.progress = -1;
                update_file(transfer);
                push_system_message(`File transfer '${transfer.f_name}' aborted`);
                break;
            }

            default: {
                throw new Error(`Unhandled message type '${(msg as any).type}'`);
            }
        }
    }

    async function init_rtc(): Promise<void> {
        const r = await rtc.init({
            room_id: room_id,
            is_host: is_host,
            handshake: rtc_handshake,
            on_channel_message: on_channel_message,
            on_connection_state: on_connection_state,
            on_channel_error: on_channel_error,
        });

        if (r.is_err) {
            if (r.error.type === 'stale_error' || room_id === '') {
                return;
            }
            if (is_host) {
                await rtc_handshake.cancel_offer({ room_id });
            }

            connection_state = rtc.connectionState.None;
            state.connecion_state = connection_state;

            switch (r.error.type) {
                case 'room_already_exists': {
                    push_system_message(`Room with id '${room_id}' already exists`);
                    return;
                }
                case 'room_not_found': {
                    push_system_message(`Room with id '${room_id}' not found`);
                    return;
                }
                case 'server_error': {
                    push_system_message(`Something went wrong with the server (status ${r.error.status})`);
                    return;
                }
                case 'exception': {
                    push_system_message(`Unhandled error`);
                    return;
                }
                case 'retries_exceeded': {
                    push_system_message(`Waited for too long`);
                    return;
                }
            }
        }
    }

    async function init_as_host(options: InitClientOptions): Promise<void> {
        room_id = options.room_id;
        is_host = true;
        error = void 0;
        connection_state = rtc.connectionState.Creating;
        sync_state();

        push_system_message(`Creating room with id '${room_id}'...`);

        await init_rtc();
    }


    async function init_as_guest(options: InitClientOptions): Promise<void> {
        room_id = options.room_id;
        is_host = false;
        error = void 0;
        connection_state = rtc.connectionState.Connecting;
        sync_state();

        push_system_message(`Joining room with id '${room_id}'...`);

        await init_rtc();
    }

    async function deinit_rtc(): Promise<void> {
        await rtc.deinit();
        await rtc_handshake.cancel_offer({ room_id });

        if (connection_state === 'Connected') {
            push_system_message(`Disconnected`);
        }

        connection_state = rtc.connectionState.None;
        error = void 0;
        is_host = false;
        room_id = "";
        sync_state();
    }

    function send_text(text: string, onsend?: () => void): void {
        const msg = create_text_message(text, 'me');
        const encoded = message.encode_text(msg);
        if (encoded === undefined) {
            return;
        }

        rtc.send_message(encoded);
        push_message(msg);
        onsend?.();
    }

    async function send_file_message(msg: MessageFileTransfer, file: File): Promise<void> {
        const data_channel = rtc.get_data_channel();
        if (!data_channel) {
            return;
        }
        files_transfer.set(msg.f_id, msg);
        const slice_size = message.FILE_CHUNK_SIZE;
        const chunks_total = Math.ceil(msg.f_size / slice_size);
        msg.f_total_chunks = chunks_total;
        msg.ts_start = now_utc();
        rtc.send_message(message.encode_file_meta(msg)!);
        const f_bytes = new Uint8Array(await file.arrayBuffer());
        const chunks_queue: message.MessageFileChunk[] = [];
        for (let i = 0; i < chunks_total; i++) {
            const chunk = f_bytes.slice(i * slice_size, (i + 1) * slice_size);
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
                if (data_channel!.bufferedAmount > RTC_BUFFER_FULL_THRESHOLD) {
                    is_paused = true;
                    const buffer_low_handler = () => {
                        if (data_channel!.bufferedAmount <= RTC_BUFFER_LOW_THRESHOLD) {
                            data_channel!.removeEventListener('bufferedamountlow', buffer_low_handler);
                            is_paused = false;
                            setTimeout(send_next_chunks, 0);
                        }
                    };

                    data_channel!.bufferedAmountLowThreshold = RTC_BUFFER_LOW_THRESHOLD;
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
        return;
    }

    function send_files(files: File[]): void {
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
        transfer.chunks.length = 0
        transfer.f_blob = undefined;
        transfer.file = undefined;
        const msg = {
            type: message.MESSAGE_FILE_ABORT,
            id: file_id
        } as const;
        rtc.send_message(message.encode_file_abort(msg)!);

        update_file(transfer);
        return true;
    }

    function download_file(file_id: string): boolean {
        const file_transfer = files_transfer.get(file_id);
        if (file_transfer === undefined) {
            return false;
        }
        if (!file_transfer.completed) {
            return false;
        }

        download_blob(file_transfer.f_blob, file_transfer.f_name);
        return true;
    }


    return {
        get current() {
            return state;
        },
        init_as_guest,
        init_as_host,
        deinit: deinit_rtc,
        create_text_message,
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
