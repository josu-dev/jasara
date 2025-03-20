<script lang="ts">
	import { dev } from '$app/environment';
	import * as p2p from '$lib/client/p2p.js';
	import ConnectionBar from '$lib/comps/ConnectionBar.svelte';
	import DragAndDropZone from '$lib/comps/DragAndDropZone.svelte';
	import InputBar from '$lib/comps/InputBar.svelte';
	import Messages from '$lib/comps/Messages.svelte';
	import type { ChannelMessage, MessageFileTransfer, RenderableMessage } from '$lib/types/types';
	import { download_file } from '$lib/utils';

	let isHost = $state(false);
	let connectionStatus = $state('Disconnected');
	let errorMessage = $state('');
	let messages: ChannelMessage[] = $state(
		dev && false
			? [
					{
						type: p2p.MESSAGE_TYPE.TEXT,
						id: '1',
						sender: 'me',
						text: `\`\`\`
  {#if is_like_link(msg.text)}
    <a href={ensure_protocol(msg.text)} rel="refferer,noopener" class="link">{msg.text}</a>
  {:else}
    <p class="">{msg.text}</p>
  {/if}
			\`\`\``,
						ts: new Date().toISOString()
					},
					{
						type: p2p.MESSAGE_TYPE.TEXT,
						id: '2',
						sender: 'system',
						text: 'Welcome to JASARA chat! Vas a disfrutar de la transferencia? o tal vez no, quien lo sabra',
						ts: new Date().toISOString()
					},
					{
						type: p2p.MESSAGE_TYPE.FILE_TRANSFER,
						sender: 'other',
						id: '3',
						f_id: '1',
						f_name: 'test.txt',
						f_size: 1024,
						f_url: undefined,
						progress: 0,
						chunks_total: 0,
						completed: false,
						ts: new Date().toISOString(),
						aborted: true
					},
					{
						type: p2p.MESSAGE_TYPE.FILE_TRANSFER,
						sender: 'other',
						id: '4',
						f_id: '1',
						f_name: 'values.json',
						f_size: 1024,
						f_url: 'data:application/json;base64mdfoejnmsof',
						f_type: 'text/json',
						progress: 100,
						chunks_total: 64,
						completed: true,
						ts: new Date().toISOString(),
						aborted: false
					},
					{
						type: p2p.MESSAGE_TYPE.FILE_TRANSFER,
						sender: 'me',
						id: '5',
						f_id: '1',
						f_name: 'values.json',
						f_size: 1024,
						f_url: undefined,
						f_type: 'text/json',
						progress: 50,
						chunks_total: 64,
						completed: false,
						ts: new Date().toISOString(),
						aborted: false
					},
					{
						type: p2p.MESSAGE_TYPE.TEXT,
						sender: 'me',
						id: '6',
						ts: new Date().toISOString(),
						text: 'lucide.dev/icons/square-x?search=link'
					}
				]
			: []
	);
	let id_to_idx: Map<string, number> = new Map();

	function on_message(msg: ChannelMessage) {
		switch (msg.type) {
			case p2p.MESSAGE_TYPE.TEXT: {
				if (msg.sender !== 'system') {
					msg.sender = 'other';
				}
				messages.push(msg);
				break;
			}
			case p2p.MESSAGE_TYPE.FILE_TRANSFER: {
				messages.push(msg);
				id_to_idx.set(msg.f_id, messages.length - 1);
				break;
			}
			case p2p.MESSAGE_TYPE.FILE_CHUNK: {
				break;
			}
			case p2p.MESSAGE_TYPE.FILE_ABORT: {
				break;
			}
			default: {
				console.warn('This message type is not supported:', msg);
			}
		}
	}

	function add_system_message(text: string) {
		const msg = p2p.create_text_message(text, 'system');

		messages.push(msg);
	}

	function send_text(text: string, reset?: () => void) {
		const msg = p2p.create_text_message(text);
		if (!p2p.send_text(msg)) {
			return;
		}

		messages.push(msg);
		reset?.();
	}

	function send_file(file: File) {
		const msg = p2p.create_file_message(file);
		p2p.send_file(msg, file);

		messages.push(msg);
	}

	function send_files(files: File[]) {
		for (const file of files) {
			const msg = p2p.create_file_message(file);
			p2p.send_file(msg, file);

			messages.push(msg);
		}
	}

	function cancel_file_transfer(id: string) {
		if (!p2p.cancel_file_transfer(id)) {
			return;
		}

		for (const msg of messages) {
			if (msg.type === p2p.MESSAGE_TYPE.FILE_TRANSFER && msg.f_id === id) {
				msg.aborted = true;
				msg.progress = -1;
				break;
			}
		}

		add_system_message(`File transfer cancelled`);
	}

	function on_conn_state_change(status: p2p.ConnectionStatus): void {
		connectionStatus = status;
	}

	function update_file(m: MessageFileTransfer) {
		for (let i = 0; i < messages.length; i++) {
			const msg = messages[i];
			if (msg.type === p2p.MESSAGE_TYPE.FILE_TRANSFER && msg.id === m.id) {
				messages[i] = m;
				break;
			}
		}
	}

	$effect(() => {
		return () => {
			p2p.disconnect();
			add_system_message('Disconnected from chat');
		};
	});
</script>

<main
	class="mx-auto grid h-full max-w-3xl grid-cols-1 grid-rows-[auto_1fr] overflow-hidden px-1 pb-1 font-sans sm:px-4 sm:pb-4"
>
	<div class="flex flex-none justify-between px-1 py-1 sm:py-2">
		<h1
			class="text-primary-100 self-center text-base leading-none font-extrabold tracking-wider sm:text-4xl"
		>
			JAS<br class="sm:hidden" />ARA
		</h1>

		<ConnectionBar
			connection_status={connectionStatus as any}
			connection_error={errorMessage}
			on_create={(id) =>
				p2p.init_host({
					id,
					on_message,
					on_error: (err) => (errorMessage = err.message || 'Unknown error'),
					on_system_message: on_message,
					on_conn_state_change: on_conn_state_change,
					on_file_update: update_file
				})}
			on_connect={(id) =>
				p2p.init_guest({
					id,
					on_message,
					on_error: (err) => (errorMessage = err.message || 'Unknown error'),
					on_system_message: on_message,
					on_conn_state_change: on_conn_state_change,
					on_file_update: update_file
				})}
			on_disconnect={p2p.disconnect}
		/>
	</div>

	<div class="border-border flex h-full flex-col overflow-hidden rounded-md border">
		<div class="relative grid h-full overflow-hidden">
			<DragAndDropZone
				on_files_drop={send_files}
				on_text_drop={send_text}
				drag_disabled={connectionStatus !== 'Connected' && false}
			/>
			<Messages
				messages={messages as RenderableMessage[]}
				{isHost}
				{cancel_file_transfer}
				{download_file}
			/>
		</div>

		<InputBar
			on_send_files={send_files}
			on_send_text={send_text}
			disabled={connectionStatus !== 'Connected'}
		/>
	</div>
</main>
