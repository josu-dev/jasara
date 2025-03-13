
export type RoomId = string;

export type MessageSystem = {
    type: 'system';
    text: string;
};

export type MessageText = {
    type: 'text';
    sender: string;
    text: string;
};

export type MessageFile = {
    type: 'file';
    sender: string;
    filename: string;
    fileData: string;
    fileSize?: number;
};

export type MessageFileTransfer = {
    type: 'file-transfer';
    sender: string;
    filename: string;
    fileSize: number;
    fileId: string;
    progress: number;
    aborted: boolean;
};

export type Message = {
    ts: string;
} & (MessageSystem | MessageText | MessageFile | MessageFileTransfer);

export type MessageType = Message['type'];
