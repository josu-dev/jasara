<script lang="ts">
	import ConnectionBar from '$lib/comps/ConnectionBar.svelte';
	import InputBar from '$lib/comps/InputBar.svelte';
	import Message from '$lib/comps/Message.svelte';

	let peerConnection: RTCPeerConnection;
	let dataChannel: RTCDataChannel | null = $state(null);
	let roomId = $state('');
	let isHost = $state(false);
	let connectionStatus = $state('Disconnected');
	let errorMessage = $state('');
	let messages = $state([]);
	let messageInput = $state('');

	// File transfer related states
	let fileChunks = $state({});
	let fileSendProgress = $state(0);
	let fileReceiveProgress = $state({});
	let isTransferringFile = $state(false);

	// Constants for chunked file transfer
	const CHUNK_SIZE = 16 * 1024; // 16KB chunks
	const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB limit
	const BUFFER_FULL_THRESHOLD = 1 * 1024 * 1024; // 1MB buffer threshold
	const BUFFER_LOW_THRESHOLD = 512 * 1024; // 512KB low buffer threshold

	// Create or join a room
	async function handleRoomAction(roomId: string, isHost: boolean) {
		if (!roomId.trim()) {
			errorMessage = 'Please enter a valid room ID';
			return;
		}

		errorMessage = '';
		connectionStatus = isHost ? 'Creating room...' : 'Joining room...';

		try {
			initializePeerConnection();

			if (isHost) {
				// Create data channel as host
				dataChannel = peerConnection.createDataChannel('chat');
				setupDataChannel();

				await createRoom();
			} else {
				// For peers joining, the datachannel event will be triggered
				await joinRoom();
			}
		} catch (error) {
			errorMessage = `Connection error: ${error.message}`;
			connectionStatus = 'Connection failed';
			console.error(error);
		}
	}

	// Initialize WebRTC peer connection
	function initializePeerConnection() {
		// Create RTCPeerConnection without ICE servers (STUN/TURN)
		// This will only work on a private network
		peerConnection = new RTCPeerConnection();

		// Handle ICE candidates
		peerConnection.onicecandidate = async (event) => {
			if (event.candidate) {
				// Send the ICE candidate to the signaling server
				await fetch(`/api/signal/${roomId}`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ type: 'iceCandidate', iceCandidate: event.candidate })
				});
			}
		};

		// Connection state change handling
		peerConnection.onconnectionstatechange = (event) => {
			connectionStatus = `Connection: ${peerConnection.connectionState}`;
			if (peerConnection.connectionState === 'connected') {
				connectionStatus = 'Connected successfully!';
			}
			dataChannel = dataChannel;
		};

		// For peers joining, listen for the datachannel
		peerConnection.ondatachannel = (event) => {
			dataChannel = event.channel;
			setupDataChannel();
		};
	}

	// Set up data channel event handlers
	function setupDataChannel() {
		dataChannel.onopen = () => {
			connectionStatus = 'Chat channel open!';
			addSystemMessage('Connected to chat');
		};

		dataChannel.onclose = () => {
			connectionStatus = 'Chat channel closed';
			addSystemMessage('Disconnected from chat');
		};

		dataChannel.onerror = (error) => {
			console.error('Data channel error:', error);
			errorMessage = `Chat error: ${error.message || 'Unknown error'}`;
		};

		dataChannel.onmessage = (event) => {
			try {
				if (typeof event.data === 'string') {
					// Parse the message to determine its type
					const data = JSON.parse(event.data);

					// Handle different message types
					switch (data.type) {
						case 'user':
							// Regular text message
							messages = [...messages, data];
							break;

						case 'file-start':
							// Initialize for receiving a file
							fileChunks[data.fileId] = {
								chunks: [],
								receivedChunks: 0,
								totalChunks: data.totalChunks,
								filename: data.filename,
								fileType: data.fileType,
								fileSize: data.fileSize
							};
							fileReceiveProgress[data.fileId] = 0;

							// Add placeholder message
							messages = [
								...messages,
								{
									type: 'file-transfer',
									fileId: data.fileId,
									sender: isHost ? 'me' : 'other', // Opposite of local user
									filename: data.filename,
									fileSize: data.fileSize,
									progress: 0,
									timestamp: new Date().toISOString()
								}
							];
							break;

						case 'file-chunk':
							// Receive a chunk and update progress
							if (fileChunks[data.fileId]) {
								fileChunks[data.fileId].chunks[data.chunkIndex] = data.chunk;
								fileChunks[data.fileId].receivedChunks++;

								// Calculate progress percentage
								const progress = Math.floor(
									(fileChunks[data.fileId].receivedChunks / fileChunks[data.fileId].totalChunks) *
										100
								);
								fileReceiveProgress[data.fileId] = progress;

								// Update message progress
								messages = messages.map((msg) => {
									if (msg.type === 'file-transfer' && msg.fileId === data.fileId) {
										return { ...msg, progress };
									}
									return msg;
								});

								// Check if file transfer is complete
								if (
									fileChunks[data.fileId].receivedChunks === fileChunks[data.fileId].totalChunks
								) {
									completeFileTransfer(data.fileId);
								}
							}
							break;

						case 'file-abort':
							// Handle aborted file transfer
							if (fileChunks[data.fileId]) {
								addSystemMessage(`File transfer "${fileChunks[data.fileId].filename}" was aborted`);
								delete fileChunks[data.fileId];
								delete fileReceiveProgress[data.fileId];

								// Update messages to show aborted state
								messages = messages.map((msg) => {
									if (msg.type === 'file-transfer' && msg.fileId === data.fileId) {
										return { ...msg, aborted: true, progress: -1 };
									}
									return msg;
								});
							}
							break;

						default:
							console.warn('Unknown message type:', data.type);
					}
				}
			} catch (error) {
				console.error('Error processing message:', error);
			}

			// Auto-scroll to bottom
			setTimeout(() => {
				const chatContainer = document.querySelector('.messages-container');
				if (chatContainer) {
					chatContainer.scrollTop = chatContainer.scrollHeight;
				}
			}, 0);
		};
	}

	// Complete file transfer and assemble the file
	function completeFileTransfer(fileId) {
		const fileData = fileChunks[fileId];
		const base64Data = fileData.chunks.join('');

		// Convert to data URL
		const dataUrl = `data:${fileData.fileType};base64,${base64Data}`;

		// Update message with complete file
		messages = messages.map((msg) => {
			if (msg.type === 'file-transfer' && msg.fileId === fileId) {
				return {
					type: 'file',
					sender: msg.sender,
					filename: fileData.filename,
					fileSize: fileData.fileSize,
					timestamp: msg.timestamp,
					fileData: dataUrl
				};
			}
			return msg;
		});

		// Clean up
		delete fileChunks[fileId];
		delete fileReceiveProgress[fileId];

		addSystemMessage(`File "${fileData.filename}" transfer complete`);
	}

	// Add a system message to the chat
	function addSystemMessage(text) {
		messages = [
			...messages,
			{
				type: 'system',
				text,
				timestamp: new Date().toISOString()
			}
		];
	}

	// Create a new room as host
	async function createRoom() {
		// Create offer
		const offer = await peerConnection.createOffer();
		await peerConnection.setLocalDescription(offer);

		// Send offer to signaling server
		const response = await fetch(`/api/signal/${roomId}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ type: 'offer', offer: peerConnection.localDescription })
		});

		if (!response.ok) {
			throw new Error('Failed to create room');
		}

		addSystemMessage('Room created. Waiting for someone to join...');

		// Poll for answer
		pollForAnswer();
	}

	// Join an existing room
	async function joinRoom() {
		// Fetch offer from signaling server
		const response = await fetch(`/api/signal/${roomId}`);

		if (!response.ok) {
			throw new Error('Room not found or no offer available');
		}

		const {
			data: { offer }
		} = await response.json();
		await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));

		// Create answer
		const answer = await peerConnection.createAnswer();
		await peerConnection.setLocalDescription(answer);

		// Send answer to signaling server
		await fetch(`/api/signal/${roomId}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ type: 'answer', answer: peerConnection.localDescription })
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
						await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
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
						await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
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
		peerConnection.onconnectionstatechange = (event) => {
			if (['connected', 'failed', 'closed'].includes(peerConnection.connectionState)) {
				clearInterval(intervalId);
			}
			connectionStatus = `Connection: ${peerConnection.connectionState}`;
		};
	}

	// Send a message
	function sendMessage(messageInput: string) {
		if (!messageInput.trim() || !dataChannel || dataChannel.readyState !== 'open') {
			return;
		}

		const message = {
			type: 'user',
			sender: isHost ? 'me' : 'other',
			text: messageInput,
			timestamp: new Date().toISOString()
		};

		// Add to local messages
		messages = [...messages, message];

		// Send to peer
		dataChannel.send(JSON.stringify(message));

		// Clear input
		messageInput = '';

		// Auto-scroll to bottom
		setTimeout(() => {
			const chatContainer = document.querySelector('.messages-container');
			if (chatContainer) {
				chatContainer.scrollTop = chatContainer.scrollHeight;
			}
		}, 0);
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
				sender: isHost ? 'me' : 'other',
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
	function cancelFileTransfer(fileId: string) {
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

	// Download a file
	function downloadFile(fileData, filename = 'downloaded-file') {
		const link = document.createElement('a');
		link.href = fileData;
		link.download = filename;
		document.body.appendChild(link);
		link.click();
		document.body.removeChild(link);
	}

	// Handle disconnect
	function disconnect() {
		if (dataChannel) {
			dataChannel.close();
		}

		if (peerConnection) {
			peerConnection.close();
			peerConnection = null;
		}

		connectionStatus = 'Disconnected';
		addSystemMessage('Disconnected from chat');

		// Reset file transfer states
		isTransferringFile = false;
		fileChunks = {};
		fileReceiveProgress = {};
		fileSendProgress = 0;
	}

	$effect(() => {
		return () => {
			disconnect();
		};
	});
</script>

<main class="mx-auto max-w-3xl p-4 font-sans">
	<h1 class="mb-4 text-center text-2xl font-bold">JASARA</h1>

	<ConnectionBar
		connection_status={connectionStatus as any}
		connection_error={errorMessage}
		on_create={(id) => ((roomId = id), handleRoomAction(id, true))}
		on_connect={(id) => ((roomId = id), handleRoomAction(id, false))}
		on_disconnect={disconnect}
	/>

	<div class="flex h-96 flex-col overflow-clip rounded-lg border border-gray-300 md:h-[500px]">
		<div class="messages-container flex-1 overflow-y-auto bg-gray-50 p-4">
			{#each messages as msg}
				<Message
					{msg}
					{isHost}
					on_cancel_file={cancelFileTransfer}
					on_download_file={downloadFile}
				/>
			{/each}
		</div>

		<InputBar
			on_send_file={sendFile}
			on_send_text={sendMessage}
			disabled={connectionStatus !== 'Chat channel open!'}
		/>
	</div>
</main>
