<script lang="ts">
  import { proccess_data_transfer } from '$lib/utils.js';
  import FileText from '@lucide/svelte/icons/file-text';
  import Image from '@lucide/svelte/icons/image';

  type Props = {
    on_files_drop: (files: File[]) => void;
    on_text_drop?: (text: string) => void;
    drag_disabled?: boolean;
  };

  let { on_files_drop, on_text_drop = () => {}, drag_disabled = false }: Props = $props();

  let doc_drag_counter = 0;
  let is_dragging = $state(false);
  let dragging_in_doc = $state(false);

  function reset_dragging_in_doc() {
    doc_drag_counter = 0;
    dragging_in_doc = false;
    is_dragging = false;
  }

  function doc_ondragenter() {
    if (drag_disabled) return;

    doc_drag_counter++;
    dragging_in_doc = true;
  }

  function doc_ondragleave() {
    if (drag_disabled) return;

    doc_drag_counter--;
    if (doc_drag_counter <= 0) {
      doc_drag_counter = 0;
      dragging_in_doc = false;
    }
  }

  function on_dragenter_dragover(ev: DragEvent) {
    if (drag_disabled) {
      return;
    }

    ev.preventDefault();
    // stopping propagation breaks dragging in document detection
    // ev.stopPropagation();
    is_dragging = true;
  }

  function on_dragleave(ev: DragEvent) {
    if (drag_disabled) {
      return;
    }

    ev.preventDefault();
    // stopping propagation breaks dragging in document detection
    // ev.stopPropagation();
    is_dragging = false;
  }

  function on_drop(ev: DragEvent) {
    if (drag_disabled) {
      return;
    }

    ev.preventDefault();
    // stopping propagation breaks dragging in document detection
    // ev.stopPropagation();
    is_dragging = false;

    proccess_data_transfer(ev.dataTransfer, on_files_drop, on_text_drop);
  }
</script>

<svelte:window onblur={reset_dragging_in_doc} />
<svelte:document
  ondragenter={doc_ondragenter}
  ondragleave={doc_ondragleave}
  ondragend={reset_dragging_in_doc}
  ondrop={reset_dragging_in_doc}
/>

<div
  aria-label="File Drop Area"
  role="region"
  class="data-is-draging:bg-base-100/85 border-primary-100 absolute inset-0 z-10 hidden overflow-hidden rounded border-dashed data-drag-enabled:block data-is-draging:border-2 [&[data-is-draging]_div]:flex"
  data-is-draging={is_dragging ? '' : undefined}
  data-drag-enabled={dragging_in_doc ? '' : undefined}
  ondragenter={on_dragenter_dragover}
  ondragover={on_dragenter_dragover}
  ondragleave={on_dragleave}
  ondrop={on_drop}
>
  <div class="pointer-events-none hidden h-full flex-col items-center justify-center p-6">
    <div class="text-primary-100 grid w-full max-w-md items-center justify-center gap-x-4">
      <div class="-rotate-12">
        <Image size="32" />
      </div>

      <p class="text-center text-xl font-semibold text-pretty">Drop files here to send</p>

      <div class="rotate-12">
        <FileText size="32" />
      </div>
    </div>

    <p class="text-base-700 mt-4 text-sm">All file types are accepted</p>
  </div>
</div>
