import type { Message, RoomId } from '$lib/types/types';

const connectionStatus = {
    Disconnected: 'Disconnected',
    TimedOut: 'TimedOut',
    Creating: 'Creating',
    Connecting: 'Connecting',
    Connected: 'Connected',
    None: 'None'
} as const;

const connectionStatusToLabel = {
    Disconnected: 'Disconnected',
    TimedOut: 'Connection timed out',
    Connecting: 'Connecting...',
    Creating: 'Creating room...',
    Connected: 'Connected successfully!',
    None: 'None'
} as const;

export type ConnectionStatus = typeof connectionStatus[keyof typeof connectionStatus];

let peer_connection: RTCPeerConnection | undefined = undefined;
let data_channel: RTCDataChannel | undefined = undefined;
let room_id = '';
let is_host = false;
let connection_status: ConnectionStatus = connectionStatus.None;
let error_message = '';

// File transfer related states
let fileChunks = $state({});
let fileSendProgress = $state(0);
let fileReceiveProgress = $state({});
let isTransferringFile = $state(false);

let files = $state<File[]>([]);
let messages = $state<Message[]>([]);
let errorMessage = $state('');

// Constants for chunked file transfer
const CHUNK_SIZE = 16 * 1024; // 16KB chunks
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB limit
const BUFFER_FULL_THRESHOLD = 1 * 1024 * 1024; // 1MB buffer threshold
const BUFFER_LOW_THRESHOLD = 512 * 1024; // 512KB low buffer threshold


function init_peer_connection(room_id: RoomId, data_channel_callbacks: DataChannelCallbacks) {
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

    peer_connection.onconnectionstatechange = function (event) {
        switch (this.connectionState) {
            case 'connected':
                connection_status = connectionStatus.Connected;
                break;
            case 'disconnected':
            case 'failed':
                connection_status = connectionStatus.Disconnected;
                break;
            case 'closed':
                connection_status = connectionStatus.Disconnected;
                break;
            case 'new':
                break;
            case 'connecting':
                connection_status = connectionStatus.Connecting;
        }
        // connection_status = `Connection: ${this.connectionState}`;
        // if (peer_connection.connectionState === 'connected') {
        //     connection_status = 'Connected successfully!';
        // }
    };

    peer_connection.ondatachannel = (event) => {
        data_channel = event.channel;
        for (const key in data_channel_callbacks) {
            data_channel[key] = data_channel_callbacks[key];
        }
    };

}

type DataChannelCallbacks = {
    onopen?: () => void;
    onclose?: () => void;
    onerror?: (error: Error) => void;
    onmessage?: (event: MessageEvent) => void;
};

export async function init_host(id: RoomId, dccbs: DataChannelCallbacks) {
    room_id = id;
    is_host = true;

    error_message = '';
    connection_status = connectionStatus.Creating;

    init_peer_connection(room_id, dccbs);
    data_channel = peer_connection.createDataChannel('chat');

    await create_room(room_id);
}

export async function init_guest(id: RoomId, dccbs: DataChannelCallbacks) {
    room_id = id;
    is_host = false;

    error_message = '';
    connection_status = connectionStatus.Connecting;

    init_peer_connection(room_id, dccbs);

    await join_room(room_id);
}

export async function create_offer() {
    const offer = await peer_connection.createOffer();
    await peer_connection.setLocalDescription(offer);

    return peer_connection.localDescription;
}

export async function create_answer(offer: RTCSessionDescription) {
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

    addSystemMessage('Room created. Waiting for someone to join...');

    // Poll for answer
    pollForAnswer();
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

    // Send answer to signaling server
    await fetch(`/api/signal/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'answer', answer: answer })
    });

    addSystemMessage('Joining room...');

    // Poll for ICE candidates
    pollForIceCandidates();
}

// Poll for an answer (host only)
async function pollForAnswer() {
    const intervalId = setInterval(async () => {
        try {
            const response = await fetch(`/api/signal/${roomId}`);
            if (response.ok) {
                const {
                    data: { answer }
                } = await response.json();
                if (answer) {
                    await peer_connection.setRemoteDescription(new RTCSessionDescription(answer));
                    clearInterval(intervalId);

                    // After receiving answer, poll for ICE candidates
                    pollForIceCandidates();
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
async function pollForIceCandidates() {
    let lastCandidateId = -1;

    const intervalId = setInterval(async () => {
        try {
            const response = await fetch(`/api/signal/${roomId}?since=${lastCandidateId}`);
            if (response.ok) {
                const {
                    data: { iceCandidates }
                } = await response.json();

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

    // Also clear when connection is established
    peer_connection.onconnectionstatechange = (event) => {
        if (['connected', 'failed', 'closed'].includes(peer_connection.connectionState)) {
            clearInterval(intervalId);
        }
        connectionStatus = `Connection: ${peer_connection.connectionState}`;
    };
}

function send_msg(msg: Message) {
    dataChannel.send(JSON.stringify(msg));
}

export function send_text(text: string): boolean {
    if (!dataChannel || dataChannel.readyState !== 'open') {
        return false;
    }

    dataChannel.send(JSON.stringify({
        type: 'text',
        sender: 'other',
        ts: new Date().toISOString(),
        text: text
    } satisfies Extract<Message, { type: 'text'; }>));

    return true
}

async function _send_file(file: File) {
    try {
        // Convert file to array buffer
        const arrayBuffer = await file.arrayBuffer();
        const base64Data = arrayBufferToBase64(arrayBuffer);

        // Calculate total chunks
        const totalChunks = Math.ceil(base64Data.length / CHUNK_SIZE);

        // Send file start message
        const fileStartMessage = {
            type: 'file-start',
            fileId: fileId,
            filename: file.name,
            fileType: file.type,
            fileSize: file.size,
            totalChunks: totalChunks
        };

        dataChannel.send(JSON.stringify(fileStartMessage));

        // Create a message queue
        const messageQueue = [];

        // Prepare all chunks
        for (let i = 0; i < totalChunks; i++) {
            const chunk = base64Data.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
            messageQueue.push({
                type: 'file-chunk',
                fileId: fileId,
                chunkIndex: i,
                chunk: chunk
            });
        }

        let isPaused = false;
        let currentChunkIndex = 0;

        // Function to continue sending chunks
        const sendNextChunks = () => {
            // If paused, do nothing (will be resumed by bufferedamountlow event)
            if (isPaused) return;

            // Send chunks until buffer gets full or we run out of chunks
            while (currentChunkIndex < messageQueue.length) {
                // Check if buffer is getting full
                if (dataChannel.bufferedAmount > BUFFER_FULL_THRESHOLD) {
                    isPaused = true;
                    console.log('Buffer full, pausing transmission');

                    // Set up event listener to resume when buffer is low
                    const bufferLowHandler = () => {
                        if (dataChannel.bufferedAmount <= BUFFER_LOW_THRESHOLD) {
                            console.log('Buffer decreased, resuming transmission');
                            dataChannel.removeEventListener('bufferedamountlow', bufferLowHandler);
                            isPaused = false;
                            setTimeout(sendNextChunks, 0);
                        }
                    };

                    // Set bufferedamountlow threshold and add event listener
                    dataChannel.bufferedAmountLowThreshold = BUFFER_LOW_THRESHOLD;
                    dataChannel.addEventListener('bufferedamountlow', bufferLowHandler);
                    return;
                }

                // Send the next chunk
                const chunkMessage = messageQueue[currentChunkIndex];
                dataChannel.send(JSON.stringify(chunkMessage));

                // Update progress
                currentChunkIndex++;
                fileSendProgress = Math.floor((currentChunkIndex / totalChunks) * 100);

                // Update message with progress
                messages = messages.map((msg) => {
                    if (msg.type === 'file-transfer' && msg.fileId === fileId) {
                        return { ...msg, progress: fileSendProgress };
                    }
                    return msg;
                });

                // Add a small yield every 10 chunks to prevent UI freezing
                if (currentChunkIndex % 10 === 0) {
                    setTimeout(sendNextChunks, 0);
                    return;
                }
            }

            // All chunks sent, update message
            if (currentChunkIndex >= messageQueue.length) {
                // Update message now that file is complete
                messages = messages.map((msg) => {
                    if (msg.type === 'file-transfer' && msg.fileId === fileId) {
                        return {
                            type: 'file',
                            sender: msg.sender,
                            filename: file.name,
                            fileSize: file.size,
                            timestamp: msg.timestamp,
                            fileData: `data:${file.type};base64,${base64Data}`
                        };
                    }
                    return msg;
                });

                addSystemMessage(`File "${file.name}" sent successfully`);
                isTransferringFile = false;
                fileInput.value = '';
            }
        };

        // Start sending chunks
        sendNextChunks();
    } catch (error) {
        console.error('File transfer error:', error);
        errorMessage = `File transfer failed: ${error.message || 'Unknown error'}`;

        // Let peer know the transfer was aborted
        dataChannel.send(
            JSON.stringify({
                type: 'file-abort',
                fileId: fileId
            })
        );

        // Update message to show error
        messages = messages.map((msg) => {
            if (msg.type === 'file-transfer' && msg.fileId === fileId) {
                return { ...msg, aborted: true, progress: -1 };
            }
            return msg;
        });

        isTransferringFile = false;
        fileInput.value = '';
    }
}

export async function send_files(file: File[]): Promise<boolean> {
    if (!dataChannel || dataChannel.readyState !== 'open') {
        return false;
    }

    const promises :Promise<void>[] = [];
    const msgs: Message[] = [];
    for (const f of file) {
        const id = Date.now().toString() +"_" + f.name;
        const message = {
            type: 'file-transfer',
            fileId: id,
            sender: 'other',
            filename: f.name,
            fileSize: f.size,
            progress: 0,
            ts: new Date().toISOString(),
            aborted: false
        } satisfies Extract<Message, { type: 'file-transfer'; }>;

        msgs.push(message);
        promises.push(_send_file(f));
    }

    await Promise.all(promises);
    return true;
}


// Send a file in chunks
async function sendFile() {
    const fileInput = document.getElementById('fileInput');
    if (!fileInput || !fileInput.files || !fileInput.files.length) {
        errorMessage = 'Please select a file first';
        return;
    }

    if (!dataChannel || dataChannel.readyState !== 'open') {
        errorMessage = 'Connection not established';
        return;
    }

    if (isTransferringFile) {
        errorMessage = 'Already transferring a file, please wait';
        return;
    }

    errorMessage = ''; // Clear any previous errors
    const file = fileInput.files[0];

    // if (file.size > MAX_FILE_SIZE) {
    // 	errorMessage = `File too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)`;
    // 	return;
    // }

    isTransferringFile = true;
    fileSendProgress = 0;

    // Generate a unique ID for this file transfer
    const fileId = Date.now().toString();

    // Add a placeholder message for file transfer progress
    messages = [
        ...messages,
        {
            type: 'file-transfer',
            fileId: fileId,
            sender: 'me',
            filename: file.name,
            fileSize: file.size,
            progress: 0,
            timestamp: new Date().toISOString()
        }
    ];

    try {
        // Convert file to array buffer
        const arrayBuffer = await file.arrayBuffer();
        const base64Data = arrayBufferToBase64(arrayBuffer);

        // Calculate total chunks
        const totalChunks = Math.ceil(base64Data.length / CHUNK_SIZE);

        // Send file start message
        const fileStartMessage = {
            type: 'file-start',
            fileId: fileId,
            filename: file.name,
            fileType: file.type,
            fileSize: file.size,
            totalChunks: totalChunks
        };

        dataChannel.send(JSON.stringify(fileStartMessage));

        // Create a message queue
        const messageQueue = [];

        // Prepare all chunks
        for (let i = 0; i < totalChunks; i++) {
            const chunk = base64Data.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
            messageQueue.push({
                type: 'file-chunk',
                fileId: fileId,
                chunkIndex: i,
                chunk: chunk
            });
        }

        let isPaused = false;
        let currentChunkIndex = 0;

        // Function to continue sending chunks
        const sendNextChunks = () => {
            // If paused, do nothing (will be resumed by bufferedamountlow event)
            if (isPaused) return;

            // Send chunks until buffer gets full or we run out of chunks
            while (currentChunkIndex < messageQueue.length) {
                // Check if buffer is getting full
                if (dataChannel.bufferedAmount > BUFFER_FULL_THRESHOLD) {
                    isPaused = true;
                    console.log('Buffer full, pausing transmission');

                    // Set up event listener to resume when buffer is low
                    const bufferLowHandler = () => {
                        if (dataChannel.bufferedAmount <= BUFFER_LOW_THRESHOLD) {
                            console.log('Buffer decreased, resuming transmission');
                            dataChannel.removeEventListener('bufferedamountlow', bufferLowHandler);
                            isPaused = false;
                            setTimeout(sendNextChunks, 0);
                        }
                    };

                    // Set bufferedamountlow threshold and add event listener
                    dataChannel.bufferedAmountLowThreshold = BUFFER_LOW_THRESHOLD;
                    dataChannel.addEventListener('bufferedamountlow', bufferLowHandler);
                    return;
                }

                // Send the next chunk
                const chunkMessage = messageQueue[currentChunkIndex];
                dataChannel.send(JSON.stringify(chunkMessage));

                // Update progress
                currentChunkIndex++;
                fileSendProgress = Math.floor((currentChunkIndex / totalChunks) * 100);

                // Update message with progress
                messages = messages.map((msg) => {
                    if (msg.type === 'file-transfer' && msg.fileId === fileId) {
                        return { ...msg, progress: fileSendProgress };
                    }
                    return msg;
                });

                // Add a small yield every 10 chunks to prevent UI freezing
                if (currentChunkIndex % 10 === 0) {
                    setTimeout(sendNextChunks, 0);
                    return;
                }
            }

            // All chunks sent, update message
            if (currentChunkIndex >= messageQueue.length) {
                // Update message now that file is complete
                messages = messages.map((msg) => {
                    if (msg.type === 'file-transfer' && msg.fileId === fileId) {
                        return {
                            type: 'file',
                            sender: msg.sender,
                            filename: file.name,
                            fileSize: file.size,
                            timestamp: msg.timestamp,
                            fileData: `data:${file.type};base64,${base64Data}`
                        };
                    }
                    return msg;
                });

                addSystemMessage(`File "${file.name}" sent successfully`);
                isTransferringFile = false;
                fileInput.value = '';
            }
        };

        // Start sending chunks
        sendNextChunks();
    } catch (error) {
        console.error('File transfer error:', error);
        errorMessage = `File transfer failed: ${error.message || 'Unknown error'}`;

        // Let peer know the transfer was aborted
        dataChannel.send(
            JSON.stringify({
                type: 'file-abort',
                fileId: fileId
            })
        );

        // Update message to show error
        messages = messages.map((msg) => {
            if (msg.type === 'file-transfer' && msg.fileId === fileId) {
                return { ...msg, aborted: true, progress: -1 };
            }
            return msg;
        });

        isTransferringFile = false;
        fileInput.value = '';
    }
}

// Cancel an ongoing file transfer
function cancelFileTransfer(fileId) {
    if (isTransferringFile) {
        isTransferringFile = false;

        // Let peer know the transfer was aborted
        dataChannel.send(
            JSON.stringify({
                type: 'file-abort',
                fileId: fileId
            })
        );

        // Update message to show aborted state
        messages = messages.map((msg) => {
            if (msg.type === 'file-transfer' && msg.fileId === fileId) {
                return { ...msg, aborted: true, progress: -1 };
            }
            return msg;
        });

        addSystemMessage(`File transfer cancelled`);
    }
}

// Utility function to convert ArrayBuffer to Base64
function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;

    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }

    return window.btoa(binary);
}


export async function cleanup() {
    if (data_channel !== undefined) {
        data_channel.close();
    }

    if (peer_connection !== undefined) {
        peer_connection.close();
        peer_connection = undefined;
    }

    connection_status = connectionStatus.Disconnected;
}

// Handle disconnect
export async function disconnect() {
    cleanup();
}
