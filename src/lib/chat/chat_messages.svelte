<script lang="ts">
  import { use_chat_ctx } from './chat.svelte.js';
  import Message from './chat_message.svelte';
  import type { ChatMessagesProps } from './shared.js';

  let {}: ChatMessagesProps = $props();

  const chat = use_chat_ctx();
  const messages = $derived(chat.current.messages);

  let container_el: HTMLElement;

  $effect(() => {
    // subscribes to messages changes taking into count collapsed ones
    // assumes that there is one message always
    messages[(messages.length || 1) - 1];
    container_el.scrollTop = container_el.scrollHeight;
  });
</script>

<div bind:this={container_el} class="bg-base-200 scrollbar-themed flex-1 overflow-x-clip overflow-y-auto p-2 sm:p-4">
  {#each messages as msg}
    <Message {msg} on_cancel_file={chat.cancel_file} on_download_file={chat.download_file} />
  {/each}
</div>
