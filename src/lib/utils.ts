
export function format_hs_mm(ts: string): string {
    const date = new Date(ts);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function format_file_size(bytes: number): string {
    if (bytes < 1024) {
        return bytes + ' bytes';
    }
    if (bytes < 1024 * 1024) {
        return (bytes / 1024).toFixed(1) + ' kb';
    }
    return (bytes / (1024 * 1024)).toFixed(1) + ' mb';
}

export function download_file(url: string, filename: string): void {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
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
