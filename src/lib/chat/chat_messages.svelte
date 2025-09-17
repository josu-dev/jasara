<script lang="ts">
  import { tick } from 'svelte';
  import { use_chat_ctx } from './chat.svelte.js';
  import Message from './chat_message.svelte';
  import { SENDER_ME, type ChatMessagesProps } from './shared.js';

  const AUTOSCROLL_BOTTOM_OFFSET = 80; // offset in px

  let {}: ChatMessagesProps = $props();

  const chat = use_chat_ctx();
  const messages = $derived(chat.current.messages);

  let container_el: undefined | HTMLElement = $state();

  $effect(() => {
    container_el?.scrollTo(0, container_el.scrollHeight);

    return chat.listen('new_message', (msg) => {
      if (container_el === undefined) return;

      if (msg.sender !== SENDER_ME) {
        const distance_from_bottom = container_el.scrollHeight - (container_el.scrollTop + container_el.offsetHeight);
        if (distance_from_bottom > AUTOSCROLL_BOTTOM_OFFSET) return;
      }

      tick().then(() => {
        container_el?.scrollTo(0, container_el.scrollHeight);
      });
    });
  });
</script>

<div
  bind:this={container_el}
  class="bg-base-200 scrollbar-themed flex-1 overflow-x-clip overflow-y-auto py-2 px-3 sm:p-4"
>
  {#each messages as msg}
    <Message {msg} on_cancel_file={chat.cancel_file} on_download_file={chat.download_file} />
  {/each}
</div>
