import * as buff from './buffer.js';

const MAX_BUFF_SIZE = 1024; // 1kb

export const MESSAGE_TYPE = {
    TEXT: 1,
    FILE_META: 2,
    FILE_CHUNK: 3,
    FILE_ABORT: 4
} as const;

type MessageType = typeof MESSAGE_TYPE;

export type MessageId = string;

export type FileId = string;

export type MessageText<T extends string = string> = {
    type: MessageType['TEXT'];
    id: MessageId;
    ts: string;
    sender: T;
    text: string;
};

export type MessageFileMeta = {
    type: MessageType['FILE_META'];
    id: MessageId;
    ts: string;
    sender: string;
    f_id: FileId;
    f_name: string;
    f_size: number;
    f_type: string;
    f_total_chunks: number;
};

export type MessageFileChunk = {
    type: MessageType['FILE_CHUNK'];
    id: FileId;
    n: number;
    c: Uint8Array;
};

export type MessageFileAbort = {
    type: MessageType['FILE_ABORT'];
    id: FileId;
};

export type ChannelMessage = (MessageText | MessageFileMeta | MessageFileChunk | MessageFileAbort);

export type ChannelMessageType = ChannelMessage['type'];

export function decode_text(ctx: buff.DecodeCtx): undefined | MessageText {
    const type = buff.read_uint8(ctx) as MessageText['type'];
    const id = buff.read_string(ctx)!;
    const ts = buff.read_string(ctx)!;
    const sender = buff.read_string(ctx)!;
    const text = buff.read_string(ctx)!;
    if (ctx.error) {
        return;
    }

    const out = {
        type,
        id,
        ts,
        sender,
        text
    } satisfies MessageText;
    return out;
}

export function decode_file_meta(ctx: buff.DecodeCtx): undefined | MessageFileMeta {
    const type = buff.read_uint8(ctx) as MessageFileMeta['type'];
    const id = buff.read_string(ctx)!;
    const ts = buff.read_string(ctx)!;
    const sender = buff.read_string(ctx)!;
    const f_id = buff.read_string(ctx)!;
    const f_name = buff.read_string(ctx)!;
    const f_size = buff.read_uint32(ctx)!;
    const f_type = buff.read_string(ctx)!;
    const f_total_chunks = buff.read_uint32(ctx)!;
    if (ctx.error) {
        return;
    }

    const out = {
        type,
        id,
        ts,
        sender,
        f_id,
        f_name,
        f_size,
        f_type,
        f_total_chunks
    } satisfies MessageFileMeta;
    return out;
}

export function decode_file_chunk(ctx: buff.DecodeCtx): undefined | MessageFileChunk {
    const type = buff.read_uint8(ctx) as MessageFileChunk['type'];
    const id = buff.read_string(ctx)!;
    const n = buff.read_uint32(ctx)!;
    const c = buff.read_uint8array(ctx)!;
    if (ctx.error) {
        return;
    }

    const out = {
        type,
        id,
        n,
        c,
    } satisfies MessageFileChunk;
    return out;
}

export function decode_file_abort(ctx: buff.DecodeCtx): undefined | MessageFileAbort {
    const type = buff.read_uint8(ctx) as MessageFileAbort['type'];
    const id = buff.read_string(ctx)!;
    if (ctx.error) {
        return;
    }

    const out = {
        type,
        id,
    } satisfies MessageFileAbort;
    return out;
}

export function decode_message(buffer: ArrayBuffer) {
    const c = buff.decode_ctx(buffer);
    const type = buff.peak_uint8(c);
    if (type === undefined) {
        return;
    }

    switch (type) {
        case MESSAGE_TYPE.TEXT: {
            return decode_text(c);
        }
        case MESSAGE_TYPE.FILE_META: {
            return decode_file_meta(c);
        }
        case MESSAGE_TYPE.FILE_CHUNK: {
            return decode_file_chunk(c);
        }
        case MESSAGE_TYPE.FILE_ABORT: {
            return decode_file_abort(c);
        }
        default: {
            console.warn(`[decode_message] Unknown type recived '${type}'`);
            return;
        }
    }
}

export type MessageEncodeOut = undefined | ArrayBuffer;

export function encode_text(value: MessageText): MessageEncodeOut {
    const c = buff.encode_ctx(MAX_BUFF_SIZE);
    buff.write_uint8(c, value.type);
    buff.write_string(c, value.id);
    buff.write_string(c, value.ts);
    buff.write_string(c, value.sender);
    buff.write_string(c, value.text);
    if (c.error) {
        return;
    }

    const out = buff.encode_ctx_to_arraybuffer(c);
    return out;
}

export function encode_file_meta(value: MessageFileMeta): MessageEncodeOut {
    const c = buff.encode_ctx(MAX_BUFF_SIZE);
    buff.write_uint8(c, value.type);
    buff.write_string(c, value.id);
    buff.write_string(c, value.ts);
    buff.write_string(c, value.sender);
    buff.write_string(c, value.f_id);
    buff.write_string(c, value.f_name);
    buff.write_uint32(c, value.f_size);
    buff.write_string(c, value.f_type);
    buff.write_uint32(c, value.f_total_chunks);
    if (c.error) {
        return;
    }

    const out = buff.encode_ctx_to_arraybuffer(c);
    return out;

}

export function encode_file_chunk(value: MessageFileChunk): MessageEncodeOut {
    const c = buff.encode_ctx(MAX_BUFF_SIZE);
    buff.write_uint8(c, value.type);
    buff.write_string(c, value.id);
    buff.write_uint32(c, value.n);
    buff.write_uint8array(c, value.c);
    if (c.error) {
        console.log(c)
        return;
    }

    const out = buff.encode_ctx_to_arraybuffer(c);
    return out;
}

export function encode_file_abort(value: MessageFileAbort): MessageEncodeOut {
    const c = buff.encode_ctx(MAX_BUFF_SIZE);
    buff.write_uint8(c, value.type);
    buff.write_string(c, value.id);
    if (c.error) {
        return;
    }

    const out = buff.encode_ctx_to_arraybuffer(c);
    return out;
}
