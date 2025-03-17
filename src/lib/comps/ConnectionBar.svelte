<script lang="ts">
	import type { ConnectionStatus } from '$lib/client/p2p.js';
	import Activity from '@lucide/svelte/icons/activity';
	import Plus from '@lucide/svelte/icons/plus';
	import Search from '@lucide/svelte/icons/search';

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

<div class="mb-6 rounded-lg">
	<div class="flex gap-x-4">
		<div class="mb-4 max-w-64 flex-1">
			<label for="roomId" class="mb-1 block font-medium">Room ID</label>
			<input
				type="text"
				id="roomId"
				bind:value={room_id}
				class="w-full max-w-md rounded border border-gray-300 px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
			/>
		</div>

		<div class="mb-4 flex items-end gap-x-2">
			{#if connectionStatus === 'Connected'}
				<button
					onclick={on_disconnect}
					class="rounded bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-700 focus:ring-2 focus:ring-red-500 focus:outline-none"
				>
					Disconnect
				</button>
			{:else}
				<button
					onclick={() => {
						on_create(room_id);
					}}
					class="rounded bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:outline-none"
				>
					<span class="sr-only">Create</span>
					<Plus />
				</button>
				<button
					onclick={() => {
						on_connect(room_id);
					}}
					class="rounded bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:outline-none"
				>
					<span class="sr-only">Join</span>
					<Search />
				</button>
			{/if}
		</div>
	</div>

	<div>
		<p class="text-gray-700">
			<span class="sr-only">Status:</span>
			<Activity class="inline-block size-6" />
			<span class="align-middle font-medium">{connectionStatus}</span>
		</p>
		{#if connection_error}
			<p class="mt-1 font-medium text-red-600">{connection_error}</p>
		{/if}
	</div>
</div>
