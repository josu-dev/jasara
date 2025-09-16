import { getContext, setContext, type Snippet } from 'svelte';


export function format_hs_mm(ts: string): string {
    const date = new Date(ts);

    // Extract hours and minutes
    const hours = String(date.getHours()).padStart(2, '0'); // Ensure 2 digits
    const minutes = String(date.getMinutes()).padStart(2, '0'); // Ensure 2 digits

    // Return in HH:MM format
    return `${hours}:${minutes}`;
}

export function format_file_size(bytes: number): string {
    if (bytes < 1024) {
        return bytes + ' bytes';
    }
    if (bytes < 1024 * 1024) {
        return (bytes / 1024).toFixed(1) + ' KB';
    }
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

export function get_human_file_type(name: string, mimetype: string): string {
    const ext_idx = name.lastIndexOf('.');
    if (ext_idx >= 0) {
        const ext = name.slice(ext_idx + 1);
        if (ext.length > 0) {
            return ext;
        }
    }

    if (mimetype.length === 0) {
        return 'unk';
    }
    const slash_idx = mimetype.indexOf('/');
    if (slash_idx < 0) {
        return 'unk';
    }
    const semicolon_idx = mimetype.indexOf(';');
    let subtype: string;
    if (semicolon_idx) {
        subtype = mimetype.slice(slash_idx + 1, semicolon_idx);
    }
    else {
        subtype = mimetype.slice(slash_idx + 1);
    }
    if (subtype.length === 0) {
        return 'unk';
    }
    return subtype;

}

export async function download_blob(blob: Blob, filename: string): Promise<void> {
    const blob_url = URL.createObjectURL(blob);
    try {
        const a = document.createElement('a');
        a.href = blob_url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }
    finally {
        URL.revokeObjectURL(blob_url);
    }
}

export function assert(condition: boolean, message: string): void {
    if (!condition) {
        throw new Error(message);
    }
}

export function assert_exists<T>(value: T, message: string): asserts value is NonNullable<T> {
    if (value == null) {
        throw new Error(message);
    }
}

export function is_codeblock(text: string): boolean {
    const pattern = /^\s*```[\s\S]*?```\s*$/;
    return pattern.test(text);
}

export function parse_codeblock_content(text: string): string {
    const pattern = /^\s*```([\s\S]*?)```\s*$/;
    const match = text.match(pattern);
    return match ? match[1].trim() : '';
}

const link_pattern = /^(https?:\/\/)?([\w-]{1,63}\.)+[\w-]{1,63}(:\d{1,5})?(\/[\w\- .~/?%&$=#]*)?$/i;

export function is_like_link(text: string): boolean {
    return link_pattern.test(text);
}

export function ensure_protocol(link: string): string {
    if (/^https?:\/\//i.test(link)) {
        return link;
    }
    return `https://${link}`;
}

export function proccess_data_transfer(dt: DataTransfer | null, on_files: (files: File[]) => void, on_text: (text: string) => void) {
    if (dt === null || dt.items.length === 0) {
        return;
    }

    const safe_files: File[] = [];
    let safe_text: string = '';

    for (const item of dt.items) {
        if (item.kind === 'string') {
            if (item.type !== 'text/plain') {
                continue;
            }
            safe_text = dt.getData('text/plain');
            continue;
        }

        const entry = item.webkitGetAsEntry();
        if (entry === null) {
            // in case of not being a file system file
            const file_ref = item.getAsFile();
            if (file_ref === null || file_ref.size === 0) {
                continue;
            }
            safe_files.push(file_ref);
            continue;
        }

        if (entry.isFile) {
            const file_ref = item.getAsFile();
            if (file_ref === null) {
                continue;
            }
            safe_files.push(file_ref);
            continue;
        }

        // is a directory
    }

    if (safe_files.length > 0) {
        on_files(safe_files);
        return;
    }

    if (safe_text.length > 0) {
        on_text(safe_text);
        return;
    }
}

export function is_editable_el(el: EventTarget | null): el is HTMLElement {
    if (el === null) {
        return false;
    }
    if (el instanceof HTMLElement && el.isContentEditable) {
        return true;
    }
    if (el instanceof HTMLInputElement) {
        return !(el.disabled || el.readOnly);
    }
    if (el instanceof HTMLTextAreaElement) {
        return !(el.disabled || el.readOnly);
    }
    return false;
}

export function noop() { };

export function now_utc(): string {
    return new Date().toISOString();
}

export function unreachable(message: string, value: never): never {
    throw new Error(`Unreachable branch reached: ${message.replace('%s', JSON.stringify(value, null, 2))}`);
}

export function create_context<T>(key: string) {
    const _key = Symbol(key);

    function set(value: T): T {
        return setContext(_key, value);
    }

    function get(): T {
        return getContext(_key);
    }

    return {
        set: set,
        get: get
    };
}

export function uuidv4(): string {
    const out = crypto.randomUUID?.() ?? Array.from(crypto.getRandomValues(new Uint8Array(18)), b => b.toString(16).padStart(2, '0')).join('');
    return out;
}

export type PropsNoChildren<T extends Record<string, any>> = T;

export type PropsWithChildren<T extends Record<string, any>> = T & {
    children: Snippet;
};

export type Ok<T> = {
    readonly is_ok: true,
    readonly is_err: false,
    readonly value: T;
};

export type Err<T> = {
    readonly is_ok: false,
    readonly is_err: true,
    readonly error: T;
};

export type Result<T, E> = Ok<T> | Err<E>;

export type MaybePromise<T> = T | Promise<T>;

export type ExtractOk<T> =
    T extends (...args: any[]) => MaybePromise<infer R>
    ? R extends Result<any, any>
    ? Extract<R, { is_ok: true; }>
    : never
    :
    T extends MaybePromise<infer R>
    ? R extends Result<any, any>
    ? Extract<R, { is_ok: true; }>
    : never
    :
    never;

export type ExtractErr<T> =
    T extends (...args: any[]) => MaybePromise<infer R>
    ? R extends Result<any, any>
    ? Extract<R, { is_err: true; }>
    : never
    :
    T extends MaybePromise<infer R>
    ? R extends Result<any, any>
    ? Extract<R, { is_err: true; }>
    : never
    :
    never;

export type AsyncResult<T, E> = Promise<Result<T, E>>;

export function ok(): Ok<never>;
export function ok<T>(value: T): Ok<T>;
export function ok<T>(value?: T): Ok<T> {
    return {
        is_ok: true,
        value: value as T,
        is_err: false,
    };
}

export function err(): Err<never>;
export function err<E>(error: E): Err<E>;
export function err<E>(error?: E): Err<E> {
    return {
        is_ok: false,
        is_err: true,
        error: error as E,
    };
}

/**
 * Negative status value means no internet connection
 */
export type NetworkError = {
    tag: 'network';
    status: number;
};

export type NoInternetError = {
    tag: 'network_no_internet';
    value: TypeError;
};

export function is_nointernet_ex(ex: unknown): ex is TypeError {
    return ex instanceof TypeError;
}

export type UnhandledError = {
    tag: 'unhandled';
    value: unknown;
};

export type RetriesExceededError = {
    tag: 'retries_exceeded';
    retries: number;
};

export type RetryError = UnhandledError | RetriesExceededError;

export async function retry_on_undefined<Args extends any[], T, E>(
    fn: (...args: Args) => Promise<Result<T | undefined, E>>,
    retries: number,
    interval: number,
    ...args: Args
): AsyncResult<T, E | RetryError> {
    return new Promise((resolve) => {
        let tries = 0;

        async function recall() {
            tries += 1;

            let result: Result<T | undefined, E>;
            try {
                result = await fn(...args);
            } catch (ex) {
                resolve(err({ tag: 'unhandled', value: ex }));
                return;
            }

            if (result.is_err) {
                return resolve(result);
            }

            if (result.value !== undefined) {
                resolve(result as Ok<T>);
                return;
            }

            if (tries > retries) {
                resolve(err({ tag: 'retries_exceeded', retries: retries }));
                return;
            }

            setTimeout(recall, interval);
        };

        recall();
    });
}
