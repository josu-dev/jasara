import type { PropsNoChildren, PropsWithChildren } from '$lib/utils.js';
import { get_human_file_type, now_utc, uuidv4, } from '$lib/utils.js';
import * as message from './message.js';
import type * as rtc from './rtc.js';


export { CONNECTION_STATE } from './rtc.js';

export type ConnectionState = rtc.ConnectionState;

export type RoomId = string;

export const MESSAGE_TEXT = message.MESSAGE_TEXT;

export const MESSAGE_FILE_TRANSFER = message.MESSAGE_FILE_META;

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
    blob: undefined;
} | {
    completed: true;
    blob: Blob;
});

export type MessageRenderable = message.MessageText | MessageFileTransfer;


export type ChatProviderProps = PropsWithChildren<{
    initial_messages?: MessageRenderable[];
    initial_room_id?: RoomId;
}>;

export type ChatConnectBarProps = PropsNoChildren<object>;

export type ChatDropZoneProps = PropsNoChildren<object>;

export type ChatInputBarProps = PropsNoChildren<object>;

export type ChatMessagesProps = PropsNoChildren<object>;

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
        blob: undefined,
        progress: 0,
        aborted: false
    };
}

export const SENDER_ME = 'me';

export const SENDER_OTHER = 'remote';

export const SENDER_SYSTEM = 'system';
