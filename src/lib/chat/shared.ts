import type { PropsNoChildren, PropsWithChildren } from '$lib/utils.js';
import * as message from './message.js';
import type * as rtc from './rtc.js';


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
    f_blob: undefined;
} | {
    completed: true;
    f_blob: Blob;
});

export type MessageRenderable = message.MessageText | MessageFileTransfer;

export type ConnectionState = rtc.ConnectionState;

export type ChatProviderProps = PropsWithChildren<{
    default?: {
        messages?: MessageRenderable[];
        room_id?: rtc.RoomId;
    };
}>;

export type ChatConnectBarProps = PropsNoChildren<object>;

export type ChatDropZoneProps = PropsNoChildren<object>;

export type ChatInputBarProps = PropsNoChildren<object>;

export type ChatMessagesProps = PropsNoChildren<object>;
