import { create_context, download_blob, err, get_human_file_type, noop, now_utc, ok } from '$lib/utils.js';
import * as message from './message.js';
import * as rtc from './rtc.js';
import type { ConnectionState, MessageFileTransfer, MessageRenderable, RoomId } from './shared.js';
import { CONNECTION_STATE, create_file_message, create_text_message, MESSAGE_TEXT, SENDER_ME, SENDER_OTHER, SENDER_SYSTEM } from './shared.js';


const RTC_BUFFER_FULL_THRESHOLD = 1 * 1024 * 1024; // 1 MB buffer threshold
const RTC_BUFFER_LOW_THRESHOLD = 512 * 1024; // 512 KB low buffer threshold

const MESSAGE_COLLAPSE_DELTA = 60 * 1000;

type RTCCtxMeta = {
    chat_id: number;
    room_id: RoomId;
    is_host: boolean;
};

const rtc_signaling: rtc.RTCSignalingProvider<RTCCtxMeta> = {
    get_offer: async ({ meta }) => {
        const r = await fetch(`/api/signal/${meta.room_id}`);
        if (r.status !== 200) {
            return err({ tag: 'network', status: r.status });
        }

        const { data: { offer } } = await r.json();
        return ok({ description: offer });
    },
    send_offer: async ({ meta, description }) => {
        const r = await fetch(`/api/signal/${meta.room_id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'OFFER', offer: description })
        });
        if (r.status !== 200) {
            return err({ tag: 'network', status: r.status });
        }

        return ok(true);
    },
    cancel_offer: async ({ meta }) => {
        const r = await fetch(`/api/signal/${meta.room_id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'OFFER_CANCEL' })
        });
        if (r.status !== 200) {
            return err({ tag: 'network', status: r.status });
        }

        return ok(true);
    },
    get_answer: async ({ meta, }) => {
        const r = await fetch(`/api/signal/${meta.room_id}`);
        if (r.status !== 200) {
            return err({ tag: 'network', status: r.status });
        }

        const { data } = await r.json();
        if (data.answer == null) {
            return ok();
        }

        return ok({ description: data.answer });
    },
    send_answer: async ({ meta, description }) => {
        const r = await fetch(`/api/signal/${meta.room_id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'ANSWER', answer: description })
        });
        if (r.status !== 200) {
            return err({ tag: 'network', status: r.status });
        }

        return ok(true);
    },
    cancel_answer: async ({ meta }) => {
        const r = await fetch(`/api/signal/${meta.room_id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'ANSWER_CANCEL' })
        });
        if (r.status !== 200) {
            return err({ tag: 'network', status: r.status });
        }

        return ok(true);
    },
    get_ice_candidates: async ({ meta, }) => {
        const r = await fetch(`/api/signal/${meta.room_id}`);
        if (r.status !== 200) {
            return err({ tag: 'network', status: r.status });
        }

        const { data } = await r.json();
        let out: RTCIceCandidateInit[];
        if (meta.is_host) {
            out = data.answer_candidates;
        }
        else {
            out = data.offer_candidates;
        }

        return ok(out);
    },
    send_ice_candidate: async ({ meta, candidate }) => {
        const r = await fetch(`/api/signal/${meta.room_id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'CANDIDATE', is_host: meta.is_host, candidate: candidate })
        });
        if (r.status !== 200) {
            return err({ tag: 'network', status: r.status });
        }

        return ok(true);
    }
};

type ConnectOptions = {
    room_id: RoomId;
};

type ChatCurrentState = {
    connecion_state: ConnectionState;
    room_id: string;
    messages: MessageRenderable[];
    is_host: boolean;
    not_connected: boolean;
};

type CreateChatOptions = {
    messages?: MessageRenderable[];
    room_id?: RoomId;
};

function chat_id(): number {
    // @ts-expect-error id for tracking chat instances
    (window.__rtcchat ??= {}).uid ??= 1;
    // @ts-expect-error ignore
    return window.__rtcchat.uid++;
}

function is_stale_rtc_ctx(meta: RTCCtxMeta): number {
    // @ts-expect-error ignore
    return meta.chat_id !== (window.__rtcchat.uid - 1);
}

type ChatEventMap = {
    new_message: Array<(msg: MessageRenderable) => void>;
};

function create_chat(initial: CreateChatOptions) {
    let global_rtc_ctx: rtc.RTCCtx<RTCCtxMeta>;
    let connection_state: ConnectionState = CONNECTION_STATE.NONE;
    let room_id: RoomId = initial.room_id ?? '';
    let is_host = false;
    const messages: MessageRenderable[] = initial.messages ?? [];
    const file_transfer_id_to_idx: Map<string, number> = new Map();
    const files_transfer = new Map<message.FileId, MessageFileTransfer>();
    const events_subscribers: ChatEventMap = {
        new_message: []
    };

    const state: ChatCurrentState = $state({
        connecion_state: connection_state,
        room_id: room_id,
        messages: messages,
        is_host: false,
        not_connected: true
    });

    function sync_state(): void {
        state.connecion_state = connection_state;
        state.is_host = is_host;
        state.room_id = room_id;
        state.not_connected = connection_state !== CONNECTION_STATE.CONNECTED;
    }

    function listen<T extends keyof ChatEventMap, L extends ChatEventMap[T][number]>(type: T, listener: L): () => void {
        events_subscribers[type].push(listener);
        return () => {
            const listeners = events_subscribers[type];
            for (let i = listeners.length - 1; i >= 0; i--) {
                if (listeners[i] === listener) {
                    listeners.splice(i, 1);
                }
            }
        };
    }

    function notify<T extends keyof ChatEventMap>(type: T, data: Parameters<ChatEventMap[T][number]>[0]): void {
        for (const sub of events_subscribers[type]) {
            sub(data);
        }
    };

    function add_local_message(msg: MessageRenderable): void {
        messages.push(msg);
        state.messages.push(msg);
        notify('new_message', msg);
    }

    function add_local_system_text(text: string, collapse: boolean = true): void {
        const msg = create_text_message(text, SENDER_SYSTEM);
        const last_index = messages.length - 1;
        if (collapse && last_index > 0) {
            const last = messages[last_index];
            if (last.sender === SENDER_SYSTEM && last.type === MESSAGE_TEXT && (Date.parse(msg.ts) - Date.parse(last.ts) < MESSAGE_COLLAPSE_DELTA)) {
                last.text += '\n' + msg.text;
                last.ts = msg.ts;
                state.messages[last_index] = last;
                notify('new_message', $state.snapshot(last));
                return;
            }
        }

        add_local_message(msg);
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
            state.not_connected = value !== CONNECTION_STATE.CONNECTED;

            if (value === CONNECTION_STATE.NONE) {
                return;
            }
            if (value === CONNECTION_STATE.CREATING) {
                add_local_system_text(`Creating room (${room_id})`, false);
                return;
            }
            if (value === CONNECTION_STATE.SEARCHING) {
                add_local_system_text(`Searching room (${room_id}) `, false);
                return;
            }
            if (value === CONNECTION_STATE.CONNECTING) {
                add_local_system_text(`Connecting`);
                return;
            }
            if (value === CONNECTION_STATE.CONNECTED) {
                add_local_system_text(`Connected`);
                return;
            }
            if (value === CONNECTION_STATE.DISCONNECTED) {
                add_local_system_text(`Disconnected`);
                return;
            }
            if (value === CONNECTION_STATE.REMOTE_DISCONNECTED) {
                add_local_system_text(`Remote disconnected`);
                return;
            }
        }
    }

    function on_channel_error(error: RTCError): void {
        window.reportError(error);
    }

    function on_channel_close(): void {
        if (global_rtc_ctx === undefined) {
            return;
        }

        disconnect();
    }

    function on_channel_open(): void {
    }

    function on_channel_message(data: rtc.ChannelMessage): void {
        const msg = message.decode_message(data);
        if (msg === undefined) {
            throw new Error(`Invalid message recived '${data}'`);
        }

        switch (msg.type) {
            case message.MESSAGE_TEXT: {
                if (msg.sender !== SENDER_SYSTEM) {
                    msg.sender = SENDER_OTHER;
                }
                add_local_message(msg);
                break;
            }

            case message.MESSAGE_FILE_META: {
                const transfer: MessageFileTransfer = {
                    type: message.MESSAGE_FILE_META,
                    id: msg.id,
                    ts: msg.ts,
                    sender: SENDER_OTHER,
                    f_type: msg.f_type,
                    f_size: msg.f_size,
                    f_id: msg.f_id,
                    f_name: msg.f_name,
                    f_type_human: get_human_file_type(msg.f_name, msg.f_type),
                    f_total_chunks: msg.f_total_chunks,
                    blob: undefined,
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
                file_transfer_id_to_idx.set(msg.f_id, messages.length);
                add_local_message(transfer);
                break;
            }

            case message.MESSAGE_FILE_CHUNK: {
                const transfer = files_transfer.get(msg.id);
                if (transfer === undefined || transfer.aborted) {
                    return;
                }

                transfer.chunks[msg.n] = msg.c;
                transfer.chunks_received++;
                transfer.progress = Math.floor((transfer.chunks_received / transfer.chunks.length) * 100);

                if (transfer.chunks_received === transfer.chunks.length) {
                    const f_blob = new Blob(transfer.chunks, { type: transfer.f_type });
                    transfer.chunks.length = 0;
                    transfer.f_total_chunks = 0;
                    transfer.blob = f_blob;
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
                transfer.chunks.length = 0;
                transfer.f_total_chunks = 0;
                update_file(transfer);
                break;
            }

            default: {
                throw new Error(`Unhandled message type '${(msg as any).type}'`);
            }
        }
    }


    async function cleanup() {
        events_subscribers.new_message.length = 0;
        await rtc.destroy_ctx(global_rtc_ctx);
        global_rtc_ctx = undefined as any;
    }

    async function connect_host(options: ConnectOptions): Promise<void> {
        room_id = options.room_id;
        is_host = true;
        sync_state();

        const rtc_ctx = rtc.create_ctx<RTCCtxMeta>({
            channel_label: 'chat',
            signaling: rtc_signaling,
            on_channel_error: on_channel_error,
            on_channel_open: on_channel_open,
            on_channel_close: on_channel_close,
            on_channel_message: on_channel_message,
            on_connection_state: on_connection_state, meta: {
                chat_id: chat_id(),
                room_id: room_id,
                is_host: true
            }
        });
        global_rtc_ctx = rtc_ctx;

        on_connection_state(CONNECTION_STATE.CREATING);

        const r = await rtc.init_host(rtc_ctx);
        if (r.is_err) {
            await rtc.destroy_ctx(rtc_ctx);
            if (r.error.tag === 'aborted' || is_stale_rtc_ctx(rtc_ctx.meta)) {
                return;
            }

            if (r.error.tag === 'offer_failed') {
                add_local_system_text(`Failed to create room`);
            }
            else if (r.error.tag === 'answer_failed') {
                add_local_system_text(`Timeout, no answer received`);
            }
            else if (r.error.tag === 'candidate_failed') {
                add_local_system_text(`Timeout, connection negotation didn't succeed`);
            }
            else if (r.error.tag === 'network_no_internet') {
                add_local_system_text(`Internet connection not available`);
            }
            else {
                console.warn(r.error);
            }

            global_rtc_ctx = undefined as any;
            on_connection_state(CONNECTION_STATE.NONE);
            return;
        }
    }

    async function connect_guest(options: ConnectOptions): Promise<void> {
        room_id = options.room_id;
        is_host = false;
        sync_state();

        const rtc_ctx = rtc.create_ctx<RTCCtxMeta>({
            channel_label: 'chat',
            signaling: rtc_signaling,
            on_channel_error: on_channel_error,
            on_channel_open: on_channel_open,
            on_channel_close: on_channel_close,
            on_channel_message: on_channel_message,
            on_connection_state: on_connection_state, meta: {
                chat_id: chat_id(),
                room_id: room_id,
                is_host: false
            }
        });
        global_rtc_ctx = rtc_ctx;

        on_connection_state(CONNECTION_STATE.SEARCHING);

        const r = await rtc.init_guest(rtc_ctx);
        if (r.is_err) {
            if (rtc_ctx.destroyed) {
                return;
            }

            await rtc.destroy_ctx(rtc_ctx);
            if (r.error.tag === 'aborted' || is_stale_rtc_ctx(rtc_ctx.meta)) {
                return;
            }

            if (r.error.tag === 'offer_failed') {
                add_local_system_text(`Create the room before joining`);
            }
            else if (r.error.tag === 'answer_failed') {
                add_local_system_text(`Something happend to the room`);
            }
            else if (r.error.tag === 'candidate_failed') {
                add_local_system_text(`Timeout, connection negotation didn't succeed`);
            }
            else if (r.error.tag === 'network_no_internet') {
                add_local_system_text(`Internet connection not available`);
            }
            else {
                console.warn(r.error);
            }

            global_rtc_ctx = undefined as any;
            on_connection_state(CONNECTION_STATE.NONE);
            return;
        }
    }

    async function cancel_connect() {
        if (connection_state === CONNECTION_STATE.CONNECTED) {
            return;
        }

        await rtc.destroy_ctx(global_rtc_ctx);
        if (global_rtc_ctx.meta.is_host) {
            await global_rtc_ctx.signaling.cancel_offer({ meta: global_rtc_ctx.meta }).catch(noop);
        }
        global_rtc_ctx = undefined as any;
        add_local_system_text(`Connection cancelled`);
        on_connection_state(CONNECTION_STATE.NONE);
    }

    async function disconnect() {
        await rtc.destroy_ctx(global_rtc_ctx);
        if (global_rtc_ctx.meta.is_host) {
            await global_rtc_ctx.signaling.cancel_offer({ meta: global_rtc_ctx.meta }).catch(noop);
        }
        global_rtc_ctx = undefined as any;
        on_connection_state(CONNECTION_STATE.DISCONNECTED);
    }

    function send_text(text: string): boolean {
        const msg = create_text_message(text, SENDER_ME);
        const encoded = message.encode_text(msg);
        if (encoded === undefined) {
            return false;
        }

        rtc.send_message(global_rtc_ctx, encoded);
        add_local_message(msg);
        return true;
    }

    function send_text_local(text: string, sender: string = SENDER_ME): void {
        const msg = create_text_message(text, sender);
        add_local_message(msg);
    }

    async function send_file_message(msg: MessageFileTransfer, file: File): Promise<void> {
        const dc = global_rtc_ctx.dc;
        if (dc === undefined) {
            return;
        }

        files_transfer.set(msg.f_id, msg);
        const slice_size = message.FILE_CHUNK_SIZE;
        const chunks_total = Math.ceil(msg.f_size / slice_size);
        msg.f_total_chunks = chunks_total;
        msg.ts_start = now_utc();
        rtc.send_message(global_rtc_ctx, message.encode_file_meta(msg)!);
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
                if (dc.bufferedAmount > RTC_BUFFER_FULL_THRESHOLD) {
                    is_paused = true;
                    const buffer_low_handler = () => {
                        if (dc.bufferedAmount <= RTC_BUFFER_LOW_THRESHOLD) {
                            dc.removeEventListener('bufferedamountlow', buffer_low_handler);
                            is_paused = false;
                            setTimeout(send_next_chunks, 0);
                        }
                    };

                    dc.bufferedAmountLowThreshold = RTC_BUFFER_LOW_THRESHOLD;
                    dc.addEventListener('bufferedamountlow', buffer_low_handler);
                    return;
                }

                const chunk_msg = chunks_queue[current_chunk_index];

                rtc.send_message(global_rtc_ctx, message.encode_file_chunk(chunk_msg)!);

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
                msg.blob = file;
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

            add_local_message(msg);
            file_transfer_id_to_idx.set(msg.f_id, messages.length - 1);
        }
    }

    function cancel_file(file_id: string): boolean {
        const transfer = files_transfer.get(file_id);
        if (!transfer) {
            return true;
        }

        const encoded = message.encode_file_abort({
            type: message.MESSAGE_FILE_ABORT,
            id: file_id
        })!;
        rtc.send_message(global_rtc_ctx, encoded);

        // first update because needs idx
        transfer.chunks.length = 0;
        transfer.aborted = true;
        transfer.blob = undefined;
        transfer.file = undefined;
        update_file(transfer);

        // cleanup internal references
        file_transfer_id_to_idx.delete(file_id);
        files_transfer.delete(file_id);
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

        download_blob(file_transfer.blob, file_transfer.f_name);
        return true;
    }


    return {
        cleanup,
        get current() {
            return state;
        },
        connect_host,
        connect_guest,
        cancel_connect,
        disconnect,
        create_text_message,
        send_text,
        send_text_local,
        send_files,
        cancel_file,
        download_file,
        listen,
    };
}

type Chat = ReturnType<typeof create_chat>;

const chat_ctx = create_context<Chat>('chat');

export function use_chat_ctx(): Chat;
export function use_chat_ctx(opts: CreateChatOptions): Chat;
export function use_chat_ctx(opts?: CreateChatOptions): Chat {
    if (opts === undefined) {
        return chat_ctx.get();
    }

    return chat_ctx.set(create_chat(opts));
}
