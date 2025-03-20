<script lang="ts">
	import type { ConnectionStatus } from '$lib/client/p2p.js';
	import Plus from '@lucide/svelte/icons/plus';
	import PowerOff from '@lucide/svelte/icons/power-off';
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
	<div class="flex gap-x-2 items-center">
		<div class="max-w-40 sm:max-w-64 flex-1">
			<label for="roomId" class="sr-only">Room ID</label>
			<input
				type="text"
				id="roomId"
				placeholder="Room ID"
				bind:value={room_id}
				class="border-border w-full rounded border bg-transparent px-2 py-1 focus:ring-0 focus:outline-none"
			/>
		</div>

		<div class="flex items-end gap-x-1">
			{#if connectionStatus === 'Connected'}
				<IconButton onclick={on_disconnect} title="Disconnect" class="bg-red-600/25! hover:bg-red-600/50!">
					<PowerOff />
				</IconButton>
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
