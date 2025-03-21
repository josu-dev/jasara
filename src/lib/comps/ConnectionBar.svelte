<script lang="ts">
  import type { ConnectionStatus } from '$lib/client/p2p.js';
  import Plus from '@lucide/svelte/icons/plus';
  import PowerOff from '@lucide/svelte/icons/power-off';
  import Search from '@lucide/svelte/icons/search';
  import IconButton from './IconButton.svelte';

  type Props = {
    connection_status: ConnectionStatus;
    connection_error: string;
    default_room_id?: string;
    on_create: (room_id: string) => void;
    on_connect: (room_id: string) => void;
    on_disconnect: () => void;
  };

  let {
    connection_status: connectionStatus,
    connection_error,
    default_room_id = '',
    on_create,
    on_connect,
    on_disconnect
  }: Props = $props();

  let room_id = $state(default_room_id);

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
  <div class="flex items-center gap-x-2">
    <div class="max-w-40 flex-1 sm:max-w-64">
      <label for="room_id" class="sr-only">Room ID</label>
      <input
        id="room_id"
        type="text"
        placeholder="Room ID"
        minlength="1"
        maxlength="16"
        class="border-border w-full rounded border bg-transparent px-2 py-1 focus:ring-0 focus:outline-none"
        bind:value={room_id}
      />
    </div>

    <div class="flex items-end gap-x-1">
      {#if connectionStatus === 'Connected'}
        <IconButton
          onclick={on_disconnect}
          title="Disconnect"
          class="bg-red-600/25! hover:bg-red-600/50!"
        >
          <PowerOff />
        </IconButton>
      {:else}
        <IconButton
          onclick={() => {
            if (room_id.length < 1 || room_id.length > 16) {
              alert('No room id must be between 1 and 16 characters');
              return;
            }
            on_create(room_id);
          }}
          title="Create"
        >
          <Plus />
        </IconButton>
        <IconButton
          onclick={() => {
            if (room_id.length < 1 || room_id.length > 16) {
              alert('No room id must be between 1 and 16 characters');
              return;
            }
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
