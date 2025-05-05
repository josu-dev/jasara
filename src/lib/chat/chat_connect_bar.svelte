<script lang="ts">
  import { Icon, IconButton } from '$lib/comps/index.js';
  import { ROOM_ID_MAX_LENGTH, ROOM_ID_MIN_LENGTH } from '$lib/constants.js';
  import type { Component } from 'svelte';
  import { use_chat_ctx } from './chat.svelte.js';
  import type { ChatConnectBarProps } from './shared.js';
  import { CONNECTION_STATE } from './shared.js';

  let {}: ChatConnectBarProps = $props();

  const chat = use_chat_ctx();

  let room_id = $state(chat.current.room_id);

  const is_host = $derived(chat.current.is_host);
  const connection_state = $derived(chat.current.connecion_state);
  const is_connected = $derived(connection_state === CONNECTION_STATE.CONNECTED);
  const is_loading = $derived(
    connection_state === CONNECTION_STATE.CONNECTING ||
      connection_state === CONNECTION_STATE.CREATING ||
      connection_state === CONNECTION_STATE.SEARCHING,
  );
  const is_host_loading = $derived(is_host && is_loading);
  const is_guest_loading = $derived(!is_host && is_loading);

  function validate_room_id(value: string): boolean {
    if (value.length < ROOM_ID_MIN_LENGTH || value.length > ROOM_ID_MAX_LENGTH) {
      alert(`Room id must be between ${ROOM_ID_MIN_LENGTH} and ${ROOM_ID_MAX_LENGTH} characters`);
      return false;
    }
    return true;
  }

  function on_create() {
    if (!validate_room_id(room_id)) {
      return;
    }

    chat.connect_host({ room_id });
  }

  function on_join() {
    if (!validate_room_id(room_id)) {
      return;
    }

    chat.connect_guest({ room_id });
  }

  function on_cancel() {
    chat.cancel_connect();
  }

  function on_disconnect() {
    chat.disconnect();
  }
</script>

{#snippet ConnectButton({
  text,
  onclick,
  IconNormal,
  loading,
  hidden,
}: {
  text: string;
  onclick: () => void;
  IconNormal: Component;
  loading: boolean;
  hidden: boolean;
})}
  <IconButton
    {onclick}
    title={text}
    data-hidden={hidden}
    data-loading={loading}
    class="data-[hidden=true]:hidden data-[loading=true]:cursor-default data-[loading=true]:hover:bg-transparent"
  >
    <IconNormal data-hide={loading} class="data-[hide=true]:hidden" />
    <Icon.Ellipsis
      data-show={loading}
      class="hidden translate-y-[3px] *:animate-bounce  data-[show=true]:block *:nth-1:[animation-delay:0s] *:nth-2:[animation-delay:0.15s] *:nth-3:[animation-delay:-0.3s]"
    />
  </IconButton>
{/snippet}

<div class="flex items-center gap-x-2">
  <div class="max-w-40 flex-1 sm:max-w-64">
    <label for="room_id" class="sr-only">Room ID</label>
    <input
      id="room_id"
      type="text"
      placeholder="Room ID"
      minlength="1"
      maxlength="16"
      readonly={is_loading}
      class="border-border w-full rounded border bg-transparent px-2 py-1 autofill:bg-transparent focus:ring-0 focus:outline-none"
      bind:value={room_id}
    />
  </div>

  <div class="flex items-end gap-x-1">
    {#if is_connected}
      <IconButton onclick={on_disconnect} title="Disconnect" class="hover:bg-red-600/50!">
        <Icon.Unplug />
      </IconButton>
    {:else}
      {@render ConnectButton({
        text: 'Create',
        onclick: on_create,
        hidden: is_guest_loading,
        loading: is_host_loading,
        IconNormal: Icon.Plus,
      })}
      <IconButton
        onclick={on_cancel}
        title="Cancel"
        data-show={is_loading}
        class="hidden hover:bg-red-600/50! data-[show=true]:block"
      >
        <Icon.X />
      </IconButton>
      {@render ConnectButton({
        text: 'Join',
        onclick: on_join,
        hidden: is_host_loading,
        loading: is_guest_loading,
        IconNormal: Icon.Search,
      })}
    {/if}
  </div>
</div>
