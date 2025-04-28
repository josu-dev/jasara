<script lang="ts">
  import { use_chat_ctx } from './chat.svelte.js';
  import type { ChatProviderProps } from './shared.js';

  let { children, default: defaults = {} }: ChatProviderProps = $props();

  const chat = use_chat_ctx({ messages: defaults.messages, room_id: defaults.room_id });

  $effect(() => {
    return chat.deinit;
  });
</script>

{@render children()}
