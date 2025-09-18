import type { AsyncResult, Err, NetworkError, Ok, RetryError } from '$lib/utils.js';
import { err, is_net_ex, net_err, noop, ok } from '$lib/utils.js';


const ANSWER_POLL_INTERVAL = 0.5 * 1000;
const ANSWER_POLL_RETRIES = 60;
const ICE_CANDIDATES_POLL_INTERVAL = 0.5 * 1000;
const ICE_CANDIDATES_POLL_RETRIES = 60;

function exception_is_peer_connection_closed(value: unknown): value is DOMException {
    return value instanceof DOMException && value.name === 'InvalidStateError';
}

const ABORTED_ERROR = 'aborted';
type AbortedError = { tag: typeof ABORTED_ERROR; value?: unknown; };

const OFFER_FAILED_ERROR = 'offer_failed';
type OfferFailerError = { tag: typeof OFFER_FAILED_ERROR; };

const ANSWER_FAILED_ERROR = 'answer_failed';
type AnswerFailedError = { tag: typeof ANSWER_FAILED_ERROR; };

const CANDIDATE_FAILED_ERROR = 'candidate_failed';
type CandidateFailedError = { tag: typeof CANDIDATE_FAILED_ERROR; };

export type RTCSignalingProvider<T extends Record<string, any> = Record<string, any>> = {
    cancel_offer: (
        (args_0: { meta: T; }) => AsyncResult<true, NetworkError>
    );
    get_offer: (
        (args_0: { meta: T; }) => AsyncResult<{ description: RTCSessionDescriptionInit; }, NetworkError>
    );
    send_offer: (
        (args_0: { meta: T; description: RTCSessionDescriptionInit; }) => AsyncResult<true, NetworkError>
    );
    cancel_answer: (
        (args_0: { meta: T; }) => AsyncResult<true, NetworkError>
    );
    get_answer: (
        (args_0: { meta: T; }) => AsyncResult<undefined | { description: RTCSessionDescriptionInit; }, NetworkError>
    );
    send_answer: (
        (args_0: { meta: T; description: RTCSessionDescriptionInit; }) => AsyncResult<true, NetworkError>
    );
    get_ice_candidates: (
        (args_0: { meta: T; }) => AsyncResult<undefined | RTCIceCandidateInit[], NetworkError>
    );
    send_ice_candidate: (
        (args_0: { meta: T; candidate: RTCIceCandidate; }) => AsyncResult<true, NetworkError>
    );
};

export const CONNECTION_STATE = {
    NONE: 'none',
    DISCONNECTED: 'disconnected',
    REMOTE_DISCONNECTED: 'remote_disconnected',
    CREATING: 'creating',
    SEARCHING: 'searching',
    CONNECTING: 'connecting',
    CONNECTED: 'connected',
} as const;

export type ConnectionState = typeof CONNECTION_STATE[keyof typeof CONNECTION_STATE];

export type OnChannelError = (error: RTCError) => void;

export type OnChannelOpen = () => void;

export type OnChannelClose = () => void;

export type ChannelMessage = ArrayBuffer;

export type OnChannelMessage = (data: ChannelMessage) => void;

export type OnConnectionState = (state: ConnectionState) => void;

export type RTCCtx<T extends Record<string, any> = any> = {
    destroyed: boolean;
    pc: RTCPeerConnection;
    dc: RTCDataChannel;
    dc_label: string;
    signaling: RTCSignalingProvider<T>;
    on_channel_error: OnChannelError;
    on_channel_open: OnChannelOpen;
    on_channel_close: OnChannelClose;
    on_channel_message: OnChannelMessage;
    on_connection_state: OnConnectionState;
    meta: T;
};

type CreateRTCCtxOptions<T extends Record<string, any> = Record<string, any>> = {
    signaling: RTCSignalingProvider<T>;
    channel_label: string;
    on_channel_error?: OnChannelError;
    on_channel_open?: OnChannelOpen;
    on_channel_close?: OnChannelClose;
    on_channel_message: OnChannelMessage;
    on_connection_state: OnConnectionState;
    meta?: T;
};

export function create_ctx<T extends Record<string, any> = Record<string, any>>(opts: CreateRTCCtxOptions<T>): RTCCtx<T> {
    const out: RTCCtx<T> = {
        destroyed: false,
        pc: undefined as unknown as RTCPeerConnection,
        dc: undefined as unknown as RTCDataChannel,
        dc_label: opts.channel_label,
        signaling: opts.signaling,
        on_channel_error: opts.on_channel_error ?? noop,
        on_channel_open: opts.on_channel_open ?? noop,
        on_channel_message: opts.on_channel_message,
        on_channel_close: opts.on_channel_close ?? noop,
        on_connection_state: opts.on_connection_state,
        meta: opts.meta ?? {} as T,
    };
    return out;
}

export async function destroy_ctx(ctx: undefined | RTCCtx): Promise<void> {
    if (ctx === undefined) {
        return;
    }

    if (ctx.dc !== undefined) {
        ctx.dc.close();
        ctx.dc = undefined as any;
    }

    if (ctx.pc !== undefined) {
        ctx.pc.close();
        ctx.pc = undefined as any;
    }

    ctx.destroyed = true;
}

function set_peer_connection(ctx: RTCCtx, pc: RTCPeerConnection): void {
    pc.onicecandidate = async (event) => {
        const candidate = event.candidate;
        if (candidate === null) {
            return;
        }

        await ctx.signaling.send_ice_candidate({
            meta: ctx.meta,
            candidate
        });
    };

    pc.onconnectionstatechange = (event) => {
        const pc = event.target as RTCPeerConnection;
        // TODO: improve this
        switch (pc.connectionState) {
            case 'connected':
                ctx.on_connection_state(CONNECTION_STATE.CONNECTED);
                break;
            case 'disconnected':
                ctx.on_connection_state(CONNECTION_STATE.DISCONNECTED);
                break;
            case 'failed':
                break;
            case 'closed':
                break;
            case 'new':
                break;
            case 'connecting':
                ctx.on_connection_state(CONNECTION_STATE.CONNECTING);
                break;
        }
    };

    ctx.pc = pc;
}

function set_data_channel(ctx: RTCCtx, dc: RTCDataChannel): void {
    function onerror(event: RTCErrorEvent) {
        const error = event.error;
        // https://datatracker.ietf.org/doc/html/rfc4960#section-3.3.10
        // [Page 43]
        if (error.errorDetail === "sctp-failure" && error.sctpCauseCode === 12) {
            ctx.on_channel_close();
            return;
        }

        ctx.on_channel_error(error);
    }

    function onclose() {
        if (ctx.destroyed) {
            return;
        }

        ctx.on_channel_close();
    }

    function onopen() {
        ctx.on_channel_open();
    }

    function onmessage(event: MessageEvent) {
        const data = event.data;
        if (!(data instanceof ArrayBuffer)) {
            window.reportError(new Error(`Expected ArrayBuffer as data but recived '${Object.getPrototypeOf(data)}' instead`));
            return;
        }

        ctx.on_channel_message(data);
    }

    dc.onerror = onerror;
    dc.onopen = onopen;
    dc.onclose = onclose;
    dc.onmessage = onmessage;
    ctx.dc = dc;
}

function set_on_data_channel(ctx: RTCCtx): void {
    ctx.pc.ondatachannel = ((event) => {
        const dc = event.channel;
        if (dc.label !== ctx.dc_label) {
            const e = new Error(`Recived unknown data channel '${dc.label}'`);
            // @ts-expect-error attach dc for debugging
            e.meta = dc;
            throw e;
        }

        set_data_channel(ctx, dc);
    });
};


async function poll_answer<T = { description: RTCSessionDescriptionInit; }>(
    ctx: RTCCtx
): AsyncResult<T, AbortedError | RetryError | NetworkError> {
    return new Promise((resolve) => {
        let tries = 0;
        const poll_arg = { meta: ctx.meta };

        async function recall() {
            if (ctx.destroyed) {
                return resolve(err({ tag: 'aborted' }));
            }

            tries += 1;

            const result = await ctx.signaling.get_answer(poll_arg);
            if (result.is_err) {
                return resolve(result);
            }
            if (result.value !== undefined) {
                return resolve(result as Ok<T>);
            }
            if (tries > ANSWER_POLL_RETRIES) {
                return resolve(err({ tag: 'retries_exceeded', retries: ANSWER_POLL_RETRIES }));
            }

            setTimeout(recall, ANSWER_POLL_INTERVAL);
        };

        recall();
    });
}

async function poll_ice_candidates(ctx: RTCCtx): AsyncResult<true, AbortedError | RetryError | NetworkError> {
    return new Promise((resolve) => {
        let tries = 0;
        const poll_arg = { meta: ctx.meta };

        async function recall() {
            if (ctx.destroyed) {
                return resolve(err({ tag: 'aborted', value: undefined }));
            }
            if (ctx.pc.iceConnectionState === 'connected') {
                return resolve(ok(true));
            }

            tries += 1;

            const result = await ctx.signaling.get_ice_candidates(poll_arg);
            if (result.is_err) {
                return resolve(result);
            }

            if (result.value !== undefined) {
                for (const candidate of result.value) {
                    const ice_candidate = new RTCIceCandidate(candidate);
                    await ctx.pc.addIceCandidate(ice_candidate);
                }
            }

            if (tries > ICE_CANDIDATES_POLL_RETRIES) {
                return resolve(err({ tag: 'retries_exceeded', retries: ICE_CANDIDATES_POLL_RETRIES }));
            }

            setTimeout(recall, ICE_CANDIDATES_POLL_INTERVAL);
        };

        recall();
    });
}


export async function init_host(ctx: RTCCtx): AsyncResult<true, AbortedError | OfferFailerError | AnswerFailedError | CandidateFailedError | NetworkError> {
    set_peer_connection(ctx, new RTCPeerConnection());
    set_data_channel(ctx, ctx.pc.createDataChannel(ctx.dc_label));

    try {
        const description = await ctx.pc.createOffer();
        const offer = await ctx.signaling.send_offer({
            meta: ctx.meta, description
        });
        if (offer.is_err) {
            return err({ tag: OFFER_FAILED_ERROR });
        }

        // should be after creating room because it auto triggers icecandidate on set
        await ctx.pc.setLocalDescription(description);

        const answer = await poll_answer(ctx);
        if (answer.is_err) {
            if (answer.error.tag === ABORTED_ERROR) {
                return answer as Err<AbortedError>;
            }
            return err({ tag: ANSWER_FAILED_ERROR });
        }

        await ctx.pc.setRemoteDescription(new RTCSessionDescription(answer.value.description));

        const candidates = await poll_ice_candidates(ctx);
        if (candidates.is_err) {
            if (candidates.error.tag === ABORTED_ERROR) {
                return candidates as Err<AbortedError>;
            }
            return err({ tag: CANDIDATE_FAILED_ERROR });
        }

        return ok(true);
    }
    catch (ex) {
        if (is_net_ex(ex)) {
            return net_err(ex);
        }

        console.error('unhandled init_host', ex);
        return err({ tag: ABORTED_ERROR, value: ex });
    }
}

export async function init_guest(ctx: RTCCtx): AsyncResult<true, AbortedError | OfferFailerError | AnswerFailedError | CandidateFailedError | NetworkError> {
    set_peer_connection(ctx, new RTCPeerConnection());
    set_on_data_channel(ctx);

    try {
        const offer = await ctx.signaling.get_offer({ meta: ctx.meta });
        if (offer.is_err) {
            return err({ tag: OFFER_FAILED_ERROR });
        }

        await ctx.pc.setRemoteDescription(offer.value.description);

        const description = await ctx.pc.createAnswer();
        const answer = await ctx.signaling.send_answer(
            { meta: ctx.meta, description }
        );
        if (answer.is_err) {
            return err({ tag: ANSWER_FAILED_ERROR });
        }

        // should be after searching room because it auto triggers icecandidate
        // and also uses send_answer as internet connection guard
        await ctx.pc.setLocalDescription(description);

        const candidates = await poll_ice_candidates(ctx);
        if (candidates.is_err) {
            if (candidates.error.tag === ABORTED_ERROR) {
                return candidates as Err<AbortedError>;
            }
            return err({ tag: CANDIDATE_FAILED_ERROR });
        }

        return ok(true);
    }
    catch (ex) {
        if (is_net_ex(ex)) {
            return net_err(ex);
        }

        console.error('unhandled init_guest', ex);
        return err({ tag: ABORTED_ERROR, value: ex });
    }
}

export function abort_init(ctx: RTCCtx): void {
    destroy_ctx(ctx);
}

export function send_message(ctx: RTCCtx, data: ArrayBuffer): boolean {
    try {
        ctx.dc.send(data);
        return true;
    }
    catch (ex) {
        window.reportError(ex);
        return false;
    }
}
