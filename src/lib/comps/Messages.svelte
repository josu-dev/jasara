<script lang="ts">
  import Message from '$lib/comps/Message.svelte';
  import type * as p2p from '$lib/internal/p2p.svelte.js';

  type Props = {
    messages: p2p.MessageRenderable[];
    cancel_file_transfer: (id: string) => void;
    on_download_file: (id: string) => void;
  };

  let { messages, cancel_file_transfer, on_download_file }: Props = $props();

  let container_el: HTMLElement;

  $effect(() => {
    messages.length;
    container_el.scrollTop = container_el.scrollHeight;
  });
</script>

<div
  bind:this={container_el}
  class="bg-base-200 scrollbar-themed flex-1 overflow-x-clip overflow-y-auto p-2 sm:p-4"
>
  {#each messages as msg}
    <Message {msg} on_cancel_file={cancel_file_transfer} {on_download_file} />
  {/each}
</div>
