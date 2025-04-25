export type DecodeCtx = {
    buffer: ArrayBuffer;
    view: DataView;
    u8: Uint8Array;
    offset: number;
    error: boolean;
};

export type EncodeCtx = {
    buffer: ArrayBuffer;
    view: DataView;
    u8: Uint8Array;
    offset: number;
    error: boolean;
};

const text_decoder = new TextDecoder();

export function decode_ctx(buffer: ArrayBuffer): DecodeCtx {
    return {
        buffer,
        view: new DataView(buffer),
        u8: new Uint8Array(buffer),
        offset: 0,
        error: false
    };
}

export function peak_uint8(ctx: DecodeCtx): undefined | number {
    if (ctx.offset + 1 > ctx.buffer.byteLength) {
        return;
    }

    const value = ctx.view.getUint8(ctx.offset);
    return value;
}

export function read_uint8(ctx: DecodeCtx): undefined | number {
    if (ctx.offset + 1 > ctx.buffer.byteLength) {
        ctx.error = true;
        return;
    }

    const value = ctx.view.getUint8(ctx.offset);
    ctx.offset += 1;
    return value;
}

export function read_uint32(ctx: DecodeCtx): undefined | number {
    if (ctx.offset + 4 > ctx.buffer.byteLength) {
        ctx.error = true;
        return;
    }

    const value = ctx.view.getUint32(ctx.offset);
    ctx.offset += 4;
    return value;
}

export function read_string(ctx: DecodeCtx): undefined | string {
    const length = read_uint32(ctx);
    if (length === undefined || ctx.offset + length > ctx.buffer.byteLength) {
        ctx.error = true;
        return;
    }

    const slice = ctx.u8.slice(ctx.offset, ctx.offset + length);
    ctx.offset += length;
    return text_decoder.decode(slice);
}

export function read_uint8array(ctx: DecodeCtx): undefined | Uint8Array {
    const length = read_uint32(ctx);
    if (length === undefined || ctx.offset + length > ctx.buffer.byteLength) {
        ctx.error = true;
        return;
    }
    
    const slice = ctx.u8.slice(ctx.offset, ctx.offset + length);
    ctx.offset += length;
    return slice;
}

const text_encoder = new TextEncoder();

export function encode_ctx(max_size: number): EncodeCtx {
    const buffer = new ArrayBuffer(max_size);
    const out: EncodeCtx = {
        buffer,
        view: new DataView(buffer),
        u8: new Uint8Array(buffer),
        offset: 0,
        error: false
    };
    return out;
}

export function encode_ctx_to_arraybuffer(ctx: EncodeCtx): ArrayBuffer {
    const out = ctx.buffer.slice(0, ctx.offset);
    return out;
}

export function write_uint8(ctx: EncodeCtx, value: number): EncodeCtx {
    if (ctx.offset + 1 > ctx.buffer.byteLength) {
        ctx.error = true;
        return ctx;
    };

    ctx.view.setUint8(ctx.offset, value);
    ctx.offset += 1;
    return ctx;
}

export function write_uint32(ctx: EncodeCtx, value: number): EncodeCtx {
    if (ctx.offset + 4 > ctx.buffer.byteLength) {
        ctx.error = true;
        return ctx;
    };

    ctx.view.setUint32(ctx.offset, value);
    ctx.offset += 4;
    return ctx;
}

export function write_string(ctx: EncodeCtx, value: string): EncodeCtx {
    const bytes = text_encoder.encode(value);
    if (ctx.offset + 4 + bytes.length > ctx.buffer.byteLength) {
        ctx.error = true;
        return ctx;
    };

    ctx.view.setUint32(ctx.offset, bytes.length);
    ctx.offset += 4;
    ctx.u8.set(bytes, ctx.offset);
    ctx.offset += bytes.length;
    return ctx;
}

export function write_uint8array(ctx: EncodeCtx, data: Uint8Array): EncodeCtx {
    if (ctx.offset + 4 + data.byteLength > ctx.buffer.byteLength) {
        ctx.error = true;
        return ctx;
    };

    ctx.view.setUint32(ctx.offset, data.byteLength);
    ctx.offset += 4;
    ctx.u8.set(data, ctx.offset);
    ctx.offset += data.length;
    return ctx;
}
