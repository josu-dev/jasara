
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
