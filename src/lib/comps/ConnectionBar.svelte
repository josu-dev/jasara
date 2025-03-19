<script lang="ts">
	import type { ConnectionStatus } from '$lib/client/p2p.js';
	import Plus from '@lucide/svelte/icons/plus';
	import Search from '@lucide/svelte/icons/search';
	import IconButton from './IconButton.svelte';

	type Props = {
		connection_status: ConnectionStatus;
		connection_error: string;
		on_create: (room_id: string) => void;
		on_connect: (room_id: string) => void;
		on_disconnect: () => void;
	};

	let {
		connection_status: connectionStatus,
		connection_error,
		on_create,
		on_connect,
		on_disconnect
	}: Props = $props();

	let room_id = $state('');

	const connectionStatusToLabel = {
		Disconnected: 'Disconnected',
		TimedOut: 'Connection timed out',
		Connecting: 'Connecting...',
		Creating: 'Creating room...',
		Connected: 'Connected successfully!',
		None: 'None'
	} as const;
</script>

<div class="">
	<div class="flex gap-x-2">
		<div class="max-w-64 flex-1">
			<label for="roomId" class="sr-only">Room ID</label>
			<input
				type="text"
				id="roomId"
				placeholder="Room ID"
				bind:value={room_id}
				class="border-border w-full max-w-md rounded border bg-transparent px-3 py-2 focus:ring-0 focus:outline-none"
			/>
		</div>

		<div class="flex items-end gap-x-1">
			{#if connectionStatus === 'Connected'}
				<button
					onclick={on_disconnect}
					class="rounded bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-700 focus:ring-2 focus:ring-red-500 focus:outline-none"
				>
					Disconnect
				</button>
			{:else}
				<IconButton
					onclick={() => {
						on_create(room_id);
					}}
					title="Create"
				>
					<Plus />
				</IconButton>
				<IconButton
					onclick={() => {
						on_connect(room_id);
					}}
					title="Join"
				>
					<Search />
				</IconButton>
			{/if}
		</div>
	</div>
</div>
