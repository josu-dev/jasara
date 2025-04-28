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

export function is_like_link(text: string): boolean {
    const urlPattern = /^(https?:\/\/)?([\w-]{1,63}\.)+[\w-]{1,63}(:\d{1,5})?(\/[\w\- .~/?%&=#]*)?$/i;
    return urlPattern.test(text);
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

export function create_module_logger(name: string): {
    info(message: string, ...data: any): void;
    warn(message: string, ...data: any): void;
    error(message: string, ...data: any): void;
    nomodule(message: string, ...data: any): void;
} {
    const prefix_error = ' [' + name + '] ';
    const prefix_info = ' [' + name + '] ';
    const prefix_warn = ' [' + name + '] ';

    return {
        info(message: string, ...data: any): void {
            const prefix = new Date().toLocaleTimeString() + prefix_info;
            console['info'](prefix + message, ...data);
        },
        warn(message: string, ...data: any): void {
            const prefix = new Date().toLocaleTimeString() + prefix_warn;
            console['warn'](prefix + message, ...data);
        },
        error(message: string, ...data: any): void {
            const prefix = new Date().toLocaleTimeString() + prefix_error;
            console['error'](prefix + message, ...data);
        },
        nomodule(message: string, ...data: any): void {
            const prefix = new Date().toLocaleTimeString();
            console['info'](prefix + ' ' + message, ...data);
        }
    };
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
