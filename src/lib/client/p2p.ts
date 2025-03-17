import type { ChannelMessage, FileId, MessageFileChunk, MessageFileTransfer, MessageText, RoomId } from '$lib/types/types';
import { assert_exists } from '$lib/utils';

export const MESSAGE_TYPE = {
    TEXT: 1,
    FILE: 2,
    FILE_TRANSFER: 3,
    FILE_CHUNK: 4,
    FILE_ABORT: 5
} as const;

export type MessageType = typeof MESSAGE_TYPE;

const connectionStatus = {
    Disconnected: 'Disconnected',
    TimedOut: 'TimedOut',
    Creating: 'Creating',
    Connecting: 'Connecting',
    Connected: 'Connected',
    None: 'None'
} as const;

export type ConnectionStatus = typeof connectionStatus[keyof typeof connectionStatus];

let peer_connection: RTCPeerConnection | undefined = undefined;
let data_channel: RTCDataChannel | undefined = undefined;
let room_id = '';
let is_host = false;
let connection_status: ConnectionStatus = connectionStatus.None;
let error_message = '';
let on_conn_state_change: (status: ConnectionStatus) => void = () => { };
let on_system_message: (msg: MessageText) => void = () => { };
let on_channel_error: (error: Error) => void = () => { };
let on_channel_message: (msg: ChannelMessage) => void = () => { };
let on_file_update: (msg: MessageFileTransfer) => void = () => { };

type FileTransfer = MessageFileTransfer & {
    chunks: string[];
    chunks_received: number;
    file: File | undefined;
    paused: boolean;
};

const _files_transfer = new Map<FileId, FileTransfer>();

// Constants for chunked file transfer
const CHUNK_SIZE = 16 * 1024; // 16KB chunks

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB limit
const BUFFER_FULL_THRESHOLD = 1 * 1024 * 1024; // 1MB buffer threshold
const BUFFER_LOW_THRESHOLD = 512 * 1024; // 512KB low buffer threshold

function _create_msg_id(): string {
    return crypto.getRandomValues(new Uint32Array(1))[0].toString(16);
}

function assert_channel_ready(channel?: RTCDataChannel): asserts channel is RTCDataChannel {
    if (!channel || channel.readyState !== 'open') {
        if (!channel) {
            throw new Error('Data channel not initialized');
        }
        if (channel.readyState === 'closed' || channel.readyState === 'closing') {
            throw new Error('Data channel closed');
        }

        throw new Error('Data channel connecting, too early to send');
    }
}

function on_data_cannel_open() {
    // on_conn_state_change(connection_status);
}

function on_data_channel_close() {
    // on_conn_state_change(connection_status);
}

function on_data_channel_error(event: RTCErrorEvent) {
    on_channel_error(event.error);
}

function on_data_channel_message(event: MessageEvent) {
    let value: any;
    try {
        value = JSON.parse(event.data);
    }
    catch {
        console.error('Received invalid message:', event);
        return;
    }
    if (typeof value !== 'object' || value === null || !('type' in value)) {
        console.error('Received invalid message:', value);
        return;
    }

    const msg = value as ChannelMessage;
    console.log('Received message:', msg);
    // on_channel_message(msg);
    switch (msg.type) {
        case MESSAGE_TYPE.TEXT: {
            if (msg.sender !== 'system') {
                msg.sender = 'other';
            }
            on_channel_message(msg);
            break;
        }
        case MESSAGE_TYPE.FILE_TRANSFER: {
            const transfer: FileTransfer = {
                type: MESSAGE_TYPE.FILE_TRANSFER,
                id: msg.id,
                ts: msg.ts,
                sender: msg.sender,
                f_type: msg.f_type,
                f_size: msg.f_size,
                f_id: msg.f_id,
                f_name: msg.f_name,
                f_url: '',
                ts_start: '',
                ts_end: '',
                progress: 0,
                completed: false,
                paused: false,
                aborted: false,
                chunks: new Array<string>(msg.chunks_total),
                chunks_total: msg.chunks_total,
                chunks_received: 0,
                file: undefined,
            };
            _files_transfer.set(msg.f_id, transfer);
            on_channel_message(msg);
            break;
        }

        case MESSAGE_TYPE.FILE_CHUNK: {
            const transfer = _files_transfer.get(msg.i);
            if (transfer === undefined) {
                console.log('File transfer not found:', msg);
                return;
            }
            transfer.chunks[msg.n] = msg.c;
            transfer.chunks_received++;
            const progress = Math.floor((transfer.chunks_received / transfer.chunks.length) * 100);
            // transfer.msg.progress = progress;
            if (transfer.chunks_received === transfer.chunks.length) {
                const f_as_base64 = `data:${transfer.type};base64,${transfer.chunks.join('')}`;
                console.log('File received:', f_as_base64);
                transfer.f_url = f_as_base64;
                transfer.ts_end = new Date().toISOString();
                transfer.completed = true;
                transfer.progress = 100;
                on_file_update(transfer);
                on_system_message(create_text_message(`File "${transfer.id}" received successfully`, 'system'));
            }
            else {
                transfer.progress = progress;
                on_file_update(transfer);
            }
            break;
        }

        case MESSAGE_TYPE.FILE_ABORT: {
            const transfer = _files_transfer.get(msg.i);
            if (transfer === undefined) {
                console.log('File transfer to abort not found:', msg);
                return;
            }
            transfer.aborted = true;
            transfer.aborted = true;
            transfer.progress = -1;
            on_file_update(transfer);
            on_system_message(create_text_message(`File transfer "${transfer.f_name}" was aborted`, 'system'));
            break;
        }

        default: {
            console.warn('This message type is not supported:', msg);
        }
    }
}

function init_peer_connection(room_id: RoomId, is_host: boolean = false) {
    // Create RTCPeerConnection without ICE servers (STUN/TURN)
    // This will only work on a private network
    peer_connection = new RTCPeerConnection();

    peer_connection.onicecandidate = async (event) => {
        if (event.candidate) {
            // Send the ICE candidate to the signaling server
            await fetch(`/api/signal/${room_id}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'iceCandidate', iceCandidate: event.candidate })
            });
        }
    };

    // peer_connection.onconnectionstatechange = function (event) {
    //     console.log('peer_connection state change:', event);
    //     switch (this.connectionState) {
    //         case 'connected':
    //             connection_status = connectionStatus.Connected;
    //             break;
    //         case 'disconnected':
    //         case 'failed':
    //             connection_status = connectionStatus.Disconnected;
    //             break;
    //         case 'closed':
    //             connection_status = connectionStatus.Disconnected;
    //             break;
    //         case 'new':
    //             break;
    //         case 'connecting':
    //             connection_status = connectionStatus.Connecting;
    //     }
    //     // connection_status = `Connection: ${this.connectionState}`;
    //     // if (peer_connection.connectionState === 'connected') {
    //     //     connection_status = 'Connected successfully!';
    //     // }
    // };

    peer_connection.onconnectionstatechange = (event) => {
        // TODO: improve this
        switch (peer_connection!.connectionState) {
            case 'connected':
                console.log('Connection established');
                // clearInterval(intervalId);
                on_conn_state_change(connectionStatus.Connected);
                break;
            case 'disconnected':
                on_conn_state_change(connectionStatus.Disconnected);
                // clearInterval(intervalId);
                break;
            case 'failed':
            case 'closed':
                break;
            case 'new':
                on_conn_state_change(connectionStatus.None);
                break;
            case 'connecting':
                // clearInterval(intervalId);
                on_conn_state_change(connectionStatus.Connecting);
                break;
        }
    };

    if (is_host) {
        data_channel = peer_connection.createDataChannel('chat');
        data_channel.onopen = on_data_cannel_open;
        data_channel.onclose = on_data_channel_close;
        data_channel.onerror = on_data_channel_error;
        data_channel.onmessage = on_data_channel_message;
    }
    else {
        peer_connection.ondatachannel = (event) => {
            data_channel = event.channel;
            data_channel.onopen = on_data_cannel_open;
            data_channel.onclose = on_data_channel_close;
            data_channel.onerror = on_data_channel_error;
            data_channel.onmessage = on_data_channel_message;
        };
    }
}

type InitClientOptions = {
    id: RoomId;
    on_message: (msg: ChannelMessage) => void;
    on_error: (error: Error) => void;
    on_system_message: (msg: MessageText) => void;
    on_conn_state_change: (status: ConnectionStatus) => void;
    on_file_update: (msg: MessageFileTransfer) => void;
};

export async function init_host(options: InitClientOptions) {
    room_id = options.id;
    is_host = true;
    on_conn_state_change = options.on_conn_state_change;
    on_system_message = options.on_system_message;
    on_channel_error = options.on_error;
    on_channel_message = options.on_message;
    on_file_update = options.on_file_update;

    error_message = '';
    connection_status = connectionStatus.Creating;

    init_peer_connection(room_id, true);

    await create_room(room_id);
}

export async function init_guest(options: InitClientOptions) {
    room_id = options.id;
    is_host = false;
    on_conn_state_change = options.on_conn_state_change;
    on_system_message = options.on_system_message;
    on_channel_error = options.on_error;
    on_channel_message = options.on_message;
    on_file_update = options.on_file_update;

    error_message = '';
    connection_status = connectionStatus.Connecting;

    init_peer_connection(room_id);

    await join_room(room_id);
}

async function create_offer() {
    assert_exists(peer_connection, 'Peer connection not initialized');
    const offer = await peer_connection.createOffer();
    await peer_connection.setLocalDescription(offer);

    return peer_connection.localDescription;
}

async function create_answer(offer: RTCSessionDescription) {
    assert_exists(peer_connection, 'Peer connection not initialized');
    await peer_connection.setRemoteDescription(offer);

    // Create answer
    const answer = await peer_connection.createAnswer();
    await peer_connection.setLocalDescription(answer);

    return peer_connection.localDescription;
}

// Create a new room as host
async function create_room(id: RoomId,) {
    // Create offer
    const offer = await create_offer();

    // Send offer to signaling server
    const response = await fetch(`/api/signal/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'offer', offer: offer })
    });

    if (!response.ok) {
        throw new Error('Failed to create room');
    }

    on_system_message(create_text_message('Room created, waiting for guest to join', 'system'));

    // Poll for answer
    pollForAnswer(id);
}

// Join an existing room
async function join_room(id: RoomId,) {
    // Fetch offer from signaling server
    const response = await fetch(`/api/signal/${id}`);

    if (!response.ok) {
        throw new Error('Room not found or no offer available');
    }

    const { data: { offer } } = await response.json();

    const answer = await create_answer(new RTCSessionDescription(offer));

    await fetch(`/api/signal/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'answer', answer: answer })
    });

    on_system_message(create_text_message('Joining room...', 'system'));

    pollForIceCandidates(id);
}

async function pollForAnswer(id: RoomId,) {
    const intervalId = setInterval(async () => {
        assert_exists(peer_connection, 'Peer connection not initialized');
        try {
            const response = await fetch(`/api/signal/${id}`);
            if (response.ok) {
                const {
                    data: { answer }
                } = await response.json();
                if (answer) {
                    await peer_connection.setRemoteDescription(new RTCSessionDescription(answer));
                    clearInterval(intervalId);

                    // After receiving answer, poll for ICE candidates
                    pollForIceCandidates(id);
                }
            }
        } catch (error) {
            console.error('Error polling for answer:', error);
        }
    }, 1000);

    // Clear interval after 60 seconds to prevent infinite polling
    setTimeout(() => clearInterval(intervalId), 60000);
}

// Poll for ICE candidates
async function pollForIceCandidates(id: RoomId,) {
    assert_exists(peer_connection, 'Peer connection not initialized');
    let lastCandidateId = -1;

    const intervalId = setInterval(async () => {
        assert_exists(peer_connection, 'Peer connection not initialized');
        if (peer_connection.iceConnectionState === 'connected') {
            clearInterval(intervalId);
            return;
        }
        try {
            const response = await fetch(`/api/signal/${id}?since=${lastCandidateId}`);
            if (response.ok) {
                const {
                    data: { iceCandidates }
                } = await response.json();
                console.log('Received ICE candidates:', iceCandidates);
                for (const candidate of iceCandidates) {
                    await peer_connection.addIceCandidate(new RTCIceCandidate(candidate));
                    lastCandidateId = candidate.id;
                }
            }
        } catch (error) {
            console.error('Error polling for ICE candidates:', error);
        }
    }, 1000);

    // Clear interval after connection established or timeout
    setTimeout(() => clearInterval(intervalId), 60000);
}

function _send_channel_msg(msg: ChannelMessage) {
    assert_exists(data_channel, 'Data channel not initialized or closed');
    data_channel.send(JSON.stringify(msg));
    console.log('_send_channel_msg:', msg);
}

export function create_text_message<T extends string = string>(text: string, sender: T = 'me' as T): MessageText<T> {
    return {
        type: MESSAGE_TYPE.TEXT,
        id: _create_msg_id(),
        sender: sender,
        ts: new Date().toISOString(),
        text: text
    };
}

export function send_text(msg: MessageText): boolean {
    if (!data_channel || data_channel.readyState !== 'open') {
        return false;
    }

    console.log('send_text 1:', msg);
    _send_channel_msg(msg);
    console.log('send_text 2:', msg);
    return true;
}

export function create_file_message(file: File, sender: string = "me"): MessageFileTransfer {
    return {
        type: MESSAGE_TYPE.FILE_TRANSFER,
        id: _create_msg_id(),
        ts: new Date().toISOString(),
        sender: sender,
        f_id: Date.now().toString() + "_" + file.name,
        f_name: file.name,
        f_size: file.size,
        f_type: file.type,
        f_url: '',
        chunks_total: 0,
        progress: 0,
        aborted: false,
        completed: false,
    };
}

export async function send_file(msg: MessageFileTransfer, file: File): Promise<boolean> {
    assert_channel_ready(data_channel);

    const f_as_base64 = window.btoa(await file.text());
    const chunks_total = Math.ceil(f_as_base64.length / CHUNK_SIZE);

    msg.chunks_total = chunks_total;
    msg.ts_start = new Date().toISOString();
    _send_channel_msg(msg);

    const chunks_queue: MessageFileChunk[] = [];
    for (let i = 0; i < chunks_total; i++) {
        const chunk = f_as_base64.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        chunks_queue.push({
            type: MESSAGE_TYPE.FILE_CHUNK,
            i: msg.f_id,
            n: i,
            c: chunk
        });
    }

    let is_paused = false;
    let current_chunk_index = 0;

    function send_next_chunks() {
        if (is_paused) {
            return;
        }

        while (current_chunk_index < chunks_queue.length) {
            if (data_channel!.bufferedAmount > BUFFER_FULL_THRESHOLD) {
                is_paused = true;
                const buffer_low_handler = () => {
                    if (data_channel!.bufferedAmount <= BUFFER_LOW_THRESHOLD) {
                        data_channel!.removeEventListener('bufferedamountlow', buffer_low_handler);
                        is_paused = false;
                        setTimeout(send_next_chunks, 0);
                    }
                };

                data_channel!.bufferedAmountLowThreshold = BUFFER_LOW_THRESHOLD;
                data_channel!.addEventListener('bufferedamountlow', buffer_low_handler);
                return;
            }

            const chunk_msg = chunks_queue[current_chunk_index];
            _send_channel_msg(chunk_msg);

            current_chunk_index++;
            const progress = Math.floor((current_chunk_index / chunks_total) * 100);
            msg.progress = progress;
            on_file_update(msg);
            if (current_chunk_index % 10 === 0) {
                setTimeout(send_next_chunks, 0);
                return;
            }
        }

        if (current_chunk_index >= chunks_queue.length) {
            msg.ts_end = new Date().toISOString();
            msg.completed = true;
            on_system_message(create_text_message(`File "${msg.f_name}" sent successfully`, 'system'));
            on_file_update(msg);
        }
    }

    send_next_chunks();
    return true;
}

// export async function send_files(msgs: MessageFileTransfer[], on_update: (msg: MessageFileTransfer) => void): Promise<boolean> {
//     if (!data_channel || data_channel.readyState !== 'open') {
//         return false;
//     }

//     const promises: Promise<void>[] = [];
//     const msgs: ChannelMessage[] = [];
//     for (const f of file) {
//         const id = Date.now().toString() + "_" + f.name;
//         const message: MessageFileTransfer = {
//             type: MESSAGE_TYPE.FILE_TRANSFER,
//             f_id: id,
//             sender: 'other',
//             f_name: f.name,
//             f_size: f.size,
//             progress: 0,
//             ts: new Date().toISOString(),
//             aborted: false,
//             completed: false,
//             f_type: f.type,
//             chunks_total: 0
//         };

//         msgs.push(message);
//         promises.push(_send_file(id, f));
//     }

//     await Promise.all(promises);
//     return true;
// }

// Cancel an ongoing file transfer
export function cancel_file_transfer(file_id: string): boolean {
    assert_exists(data_channel, 'Data channel not initialized');

    _send_channel_msg({
        type: MESSAGE_TYPE.FILE_ABORT,
        i: file_id
    });
    return true;
}

export async function cleanup() {
    if (data_channel !== undefined) {
        data_channel.close();
        data_channel = undefined;
    }

    if (peer_connection !== undefined) {
        peer_connection.close();
        peer_connection = undefined;
    }

    connection_status = connectionStatus.Disconnected;
    on_conn_state_change(connection_status);
}

// Handle disconnect
export async function disconnect() {
    cleanup();
}


// async function _send_file(id: FileId, file: File) {
//     try {
//         // Convert file to array buffer
//         const arrayBuffer = await file.arrayBuffer();
//         const base64Data = arrayBufferToBase64(arrayBuffer);

//         // Calculate total chunks
//         const totalChunks = Math.ceil(base64Data.length / CHUNK_SIZE);

//         // Send file start message
//         const fileStartMessage = {
//             type: 'file-start',
//             fileId: id,
//             filename: file.name,
//             fileType: file.type,
//             fileSize: file.size,
//             totalChunks: totalChunks
//         };

//         data_channel.send(JSON.stringify(fileStartMessage));

//         // Create a message queue
//         const messageQueue: MessageFileChunk[] = [];

//         // Prepare all chunks
//         for (let i = 0; i < totalChunks; i++) {
//             const chunk = base64Data.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
//             messageQueue.push({
//                 type: MESSAGE_TYPE.FILE_CHUNK,
//                 f_id: id,
//                 index: i,
//                 chunk: chunk
//             });
//         }

//         let isPaused = false;
//         let currentChunkIndex = 0;

//         // Function to continue sending chunks
//         const sendNextChunks = () => {
//             // If paused, do nothing (will be resumed by bufferedamountlow event)
//             if (isPaused) return;
//             assert_exists(data_channel, 'Data channel not initialized or closed');

//             // Send chunks until buffer gets full or we run out of chunks
//             while (currentChunkIndex < messageQueue.length) {
//                 // Check if buffer is getting full
//                 if (data_channel.bufferedAmount > BUFFER_FULL_THRESHOLD) {
//                     isPaused = true;
//                     console.log('Buffer full, pausing transmission');

//                     // Set up event listener to resume when buffer is low
//                     const bufferLowHandler = () => {
//                         if (data_channel!.bufferedAmount <= BUFFER_LOW_THRESHOLD) {
//                             console.log('Buffer decreased, resuming transmission');
//                             data_channel!.removeEventListener('bufferedamountlow', bufferLowHandler);
//                             isPaused = false;
//                             setTimeout(sendNextChunks, 0);
//                         }
//                     };

//                     // Set bufferedamountlow threshold and add event listener
//                     data_channel.bufferedAmountLowThreshold = BUFFER_LOW_THRESHOLD;
//                     data_channel.addEventListener('bufferedamountlow', bufferLowHandler);
//                     return;
//                 }

//                 // Send the next chunk
//                 const chunkMessage = messageQueue[currentChunkIndex];
//                 data_channel.send(JSON.stringify(chunkMessage));

//                 // Update progress
//                 currentChunkIndex++;
//                 const progress = Math.floor((currentChunkIndex / totalChunks) * 100);
//                 on_file_update(id, progress);

//                 // Add a small yield every 10 chunks to prevent UI freezing
//                 if (currentChunkIndex % 10 === 0) {
//                     setTimeout(sendNextChunks, 0);
//                     return;
//                 }
//             }

//             // All chunks sent, update message
//             if (currentChunkIndex >= messageQueue.length) {
//                 // Update message now that file is complete
//                 messages = messages.map((msg) => {
//                     if (msg.type === 'file-transfer' && msg.f_id === fileId) {
//                         return {
//                             type: 'file',
//                             sender: msg.sender,
//                             f_name: file.name,
//                             f_size: file.size,
//                             timestamp: msg.timestamp,
//                             f_url: `data:${file.type};base64,${base64Data}`
//                         };
//                     }
//                     return msg;
//                 });

//                 addSystemMessage(`File "${file.name}" sent successfully`);
//                 isTransferringFile = false;
//                 fileInput.value = '';
//             }
//         };

//         // Start sending chunks
//         sendNextChunks();
//     } catch (error) {
//         console.error('File transfer error:', error);
//         errorMessage = `File transfer failed: ${error.message || 'Unknown error'}`;

//         // Let peer know the transfer was aborted
//         data_channel.send(
//             JSON.stringify({
//                 type: 'file-abort',
//                 fileId: id
//             })
//         );

//         // Update message to show error
//         messages = messages.map((msg) => {
//             if (msg.type === 'file-transfer' && msg.f_id === fileId) {
//                 return { ...msg, aborted: true, progress: -1 };
//             }
//             return msg;
//         });

//         isTransferringFile = false;
//         fileInput.value = '';
//     }
// }
// // Send a file in chunks
// async function sendFile() {
//     const fileInput = document.getElementById('fileInput');
//     if (!fileInput || !fileInput.files || !fileInput.files.length) {
//         errorMessage = 'Please select a file first';
//         return;
//     }

//     if (!data_channel || data_channel.readyState !== 'open') {
//         errorMessage = 'Connection not established';
//         return;
//     }

//     if (isTransferringFile) {
//         errorMessage = 'Already transferring a file, please wait';
//         return;
//     }

//     errorMessage = ''; // Clear any previous errors
//     const file = fileInput.files[0];

//     // if (file.size > MAX_FILE_SIZE) {
//     // 	errorMessage = `File too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)`;
//     // 	return;
//     // }

//     isTransferringFile = true;
//     fileSendProgress = 0;

//     // Generate a unique ID for this file transfer
//     const fileId = Date.now().toString();

//     // Add a placeholder message for file transfer progress
//     messages = [
//         ...messages,
//         {
//             type: 'file-transfer',
//             f_id: fileId,
//             sender: 'me',
//             f_name: file.name,
//             f_size: file.size,
//             progress: 0,
//             timestamp: new Date().toISOString()
//         }
//     ];

//     try {
//         // Convert file to array buffer
//         const arrayBuffer = await file.arrayBuffer();
//         const base64Data = arrayBufferToBase64(arrayBuffer);

//         // Calculate total chunks
//         const totalChunks = Math.ceil(base64Data.length / CHUNK_SIZE);

//         // Send file start message
//         const fileStartMessage = {
//             type: 'file-start',
//             fileId: fileId,
//             filename: file.name,
//             fileType: file.type,
//             fileSize: file.size,
//             totalChunks: totalChunks
//         };

//         data_channel.send(JSON.stringify(fileStartMessage));

//         // Create a message queue
//         const messageQueue = [];

//         // Prepare all chunks
//         for (let i = 0; i < totalChunks; i++) {
//             const chunk = base64Data.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
//             messageQueue.push({
//                 type: 'file-chunk',
//                 fileId: fileId,
//                 chunkIndex: i,
//                 chunk: chunk
//             });
//         }

//         let isPaused = false;
//         let currentChunkIndex = 0;

//         // Function to continue sending chunks
//         const sendNextChunks = () => {
//             // If paused, do nothing (will be resumed by bufferedamountlow event)
//             if (isPaused) return;

//             // Send chunks until buffer gets full or we run out of chunks
//             while (currentChunkIndex < messageQueue.length) {
//                 // Check if buffer is getting full
//                 if (data_channel.bufferedAmount > BUFFER_FULL_THRESHOLD) {
//                     isPaused = true;
//                     console.log('Buffer full, pausing transmission');

//                     // Set up event listener to resume when buffer is low
//                     const bufferLowHandler = () => {
//                         if (data_channel.bufferedAmount <= BUFFER_LOW_THRESHOLD) {
//                             console.log('Buffer decreased, resuming transmission');
//                             data_channel.removeEventListener('bufferedamountlow', bufferLowHandler);
//                             isPaused = false;
//                             setTimeout(sendNextChunks, 0);
//                         }
//                     };

//                     // Set bufferedamountlow threshold and add event listener
//                     data_channel.bufferedAmountLowThreshold = BUFFER_LOW_THRESHOLD;
//                     data_channel.addEventListener('bufferedamountlow', bufferLowHandler);
//                     return;
//                 }

//                 // Send the next chunk
//                 const chunkMessage = messageQueue[currentChunkIndex];
//                 data_channel.send(JSON.stringify(chunkMessage));

//                 // Update progress
//                 currentChunkIndex++;
//                 fileSendProgress = Math.floor((currentChunkIndex / totalChunks) * 100);

//                 // Update message with progress
//                 messages = messages.map((msg) => {
//                     if (msg.type === 'file-transfer' && msg.f_id === fileId) {
//                         return { ...msg, progress: fileSendProgress };
//                     }
//                     return msg;
//                 });

//                 // Add a small yield every 10 chunks to prevent UI freezing
//                 if (currentChunkIndex % 10 === 0) {
//                     setTimeout(sendNextChunks, 0);
//                     return;
//                 }
//             }

//             // All chunks sent, update message
//             if (currentChunkIndex >= messageQueue.length) {
//                 // Update message now that file is complete
//                 messages = messages.map((msg) => {
//                     if (msg.type === 'file-transfer' && msg.f_id === fileId) {
//                         return {
//                             type: 'file',
//                             sender: msg.sender,
//                             f_name: file.name,
//                             f_size: file.size,
//                             timestamp: msg.timestamp,
//                             f_url: `data:${file.type};base64,${base64Data}`
//                         };
//                     }
//                     return msg;
//                 });

//                 addSystemMessage(`File "${file.name}" sent successfully`);
//                 isTransferringFile = false;
//                 fileInput.value = '';
//             }
//         };

//         // Start sending chunks
//         sendNextChunks();
//     } catch (error) {
//         console.error('File transfer error:', error);
//         errorMessage = `File transfer failed: ${error.message || 'Unknown error'}`;

//         // Let peer know the transfer was aborted
//         data_channel.send(
//             JSON.stringify({
//                 type: 'file-abort',
//                 fileId: fileId
//             })
//         );

//         // Update message to show error
//         messages = messages.map((msg) => {
//             if (msg.type === 'file-transfer' && msg.f_id === fileId) {
//                 return { ...msg, aborted: true, progress: -1 };
//             }
//             return msg;
//         });

//         isTransferringFile = false;
//         fileInput.value = '';
//     }
// }
