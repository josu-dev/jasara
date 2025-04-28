<script lang="ts">
  import { DragAndDropZone } from '$lib/comps/index.js';
  import { use_chat_ctx } from './chat.svelte.js';
  import type { ChatDropZoneProps } from './shared.js';

  let {}: ChatDropZoneProps = $props();

  const chat = use_chat_ctx();
</script>

<DragAndDropZone
  on_files_drop={chat.send_files}
  on_text_drop={chat.send_text}
  drag_disabled={chat.current.not_connected}
/>
