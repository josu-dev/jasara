<script lang="ts">
  import { Icon, IconButton } from '$lib/comps/index.js';
  import { use_chat_ctx } from './chat.svelte.js';
  import type { ChatConnectBarProps } from './shared.js';

  let {}: ChatConnectBarProps = $props();

  const chat = use_chat_ctx();
  const connection_state = $derived(chat.current.connecion_state);

  let room_id = $state(chat.current.room_id);

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
      {#if connection_state === 'Connected'}
        <IconButton
          onclick={chat.deinit}
          title="Disconnect"
          class="bg-red-600/25! hover:bg-red-600/50!"
        >
          <Icon.PowerOff />
        </IconButton>
      {:else}
        <IconButton
          onclick={() => {
            if (room_id.length < 1 || room_id.length > 16) {
              alert('No room id must be between 1 and 16 characters');
              return;
            }
            chat.init_as_host({ room_id });
          }}
          title="Create"
        >
          <Icon.Plus />
        </IconButton>
        <IconButton
          onclick={() => {
            if (room_id.length < 1 || room_id.length > 16) {
              alert('No room id must be between 1 and 16 characters');
              return;
            }
            chat.init_as_guest({ room_id });
          }}
          title="Join"
        >
          <Icon.Search />
        </IconButton>
      {/if}
    </div>
  </div>
</div>
