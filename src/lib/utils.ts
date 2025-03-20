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

export function get_human_file_type(file: File): string {
    const ext_idx = file.name.lastIndexOf('.');
    if (ext_idx >= 0) {
        const ext = file.name.slice(ext_idx + 1);
        if (ext.length > 0) {
            return ext;
        }
    }
    const mimetype = file.type;
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

export async function download_file(url: string, filename: string): Promise<void> {
    const blob = await (await fetch(url)).blob();
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

export function get_codeblock_content(text: string): string {
    const pattern = /^\s*```([\s\S]*?)```\s*$/;
    const match = text.match(pattern);
    return match ? match[1].trim() : '';
}

export function is_like_link(text: string): boolean {
    const urlPattern = /^(https?:\/\/)?([\w-]{1,63}\.)+[\w-]{1,63}(:\d{1,5})?(\/[\w\- ./?%&=#]*)?$/i;
    return urlPattern.test(text);
}

export function ensure_protocol(link: string): string {
    if (/^https?:\/\//i.test(link)) {
        return link;
    }
    return `https://${link}`;
}
