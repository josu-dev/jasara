<script lang="ts">
  import { use_chat_ctx } from './chat.svelte.js';
  import type { ChatProviderProps } from './shared.js';

  let { children, initial_messages, initial_room_id }: ChatProviderProps = $props();

  const chat = use_chat_ctx({ messages: initial_messages, room_id: initial_room_id });

  $effect(() => {
    return chat.cleanup;
  });
</script>

{@render children()}
