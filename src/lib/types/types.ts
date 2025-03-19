import type { MessageType } from '$lib/client/p2p.js';

export type RoomId = string;

export type MessageId = string;

export type FileId = string;

export type MessageText<T extends string = string> = {
    type: MessageType['TEXT'];
    id: MessageId;
    ts: string;
    sender: T;
    text: string;
};

export type MessageFileTransfer = {
    type: MessageType['FILE_TRANSFER'];
    id: MessageId;
    ts: string;
    sender: string;
    f_id: FileId;
    f_name: string;
    f_type?: string;
    f_size: number;
    ts_start?: string;
    ts_end?: string;
    chunks_total: number;
    progress: number;
    aborted: boolean;
} & ({
    completed: false;
    f_url: undefined;
} | {
    completed: true;
    f_url: string;
});

export type MessageFileChunk = {
    type: MessageType['FILE_CHUNK'];
    i: FileId;
    n: number;
    c: string;
};

export type MessageFileAbort = {
    type: MessageType['FILE_ABORT'];
    i: FileId;
};

export type ChannelMessage = (MessageText | MessageFileTransfer | MessageFileChunk | MessageFileAbort);

export type ChannelMessageType = ChannelMessage['type'];

export type RenderableMessage = (MessageText | MessageFileTransfer);
