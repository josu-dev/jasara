<script lang="ts">
  import { Icon, IconButton } from '$lib/comps/index.js';
  import { is_editable_el, noop, proccess_data_transfer } from '$lib/utils.js';
  import { use_chat_ctx } from './chat.svelte.js';
  import type { ChatInputBarProps } from './shared.js';

  let {}: ChatInputBarProps = $props();

  const chat = use_chat_ctx();

  let textarea_el: HTMLTextAreaElement;
  let disabled = $derived(chat.current.not_connected);

  function send_text() {
    if (disabled) {
      return;
    }

    if (chat.send_text(textarea_el.value)) {
      textarea_el.value = '';
      textarea_el.parentElement!.dataset.text = '';
    }
  }

  function on_file_input(files: FileList | null) {
    if (disabled || files == null || files.length === 0) {
      return;
    }

    chat.send_files([...files]);
  }
</script>

<svelte:window
  onpaste={(ev) => {
    if (disabled || is_editable_el(ev.target)) {
      return;
    }
    proccess_data_transfer(ev.clipboardData, chat.send_files, chat.send_text);
  }}
/>

<div class="bg-base-100 border-border border-t px-3 py-2">
  <div class="grid grid-cols-[auto_1fr_auto] items-end">
    <label
      for="file_input"
      title="Attach file"
      class="not-has-[input[disabled]]:hover:bg-base-400 has-[input[disabled]]:text-base-700 grid size-11 cursor-pointer place-items-center rounded-full has-[input[disabled]]:cursor-not-allowed"
    >
      <span class="sr-only">Attach file(s)</span>
      <Icon.Paperclip />
      <input
        id="file_input"
        type="file"
        accept="*"
        multiple
        class="hidden"
        oninput={(ev) => {
          on_file_input(ev.currentTarget.files);
        }}
        {disabled}
      />
    </label>

    <div
      class="grid flex-1 text-sm
      after:invisible after:max-h-[5lh] after:min-h-[1lh] after:px-3.5 after:py-2.5 after:break-all after:whitespace-break-spaces after:text-inherit
      after:content-[attr(data-text)_'_'] after:[grid-area:1/1/2/2] [&>textarea]:[grid-area:1/1/2/2]"
    >
      <label for="text_input" class="sr-only">Message</label>
      <textarea
        id="text_input"
        placeholder="Message"
        rows="1"
        spellcheck="true"
        class="scrollbar-themed w-full max-w-full resize-none overflow-y-auto border-none bg-transparent px-2 py-2 break-all whitespace-break-spaces focus:ring-0 focus:outline-none disabled:cursor-not-allowed"
        onkeypress={(ev) => {
          if (ev.key === 'Enter' && !ev.shiftKey) {
            ev.preventDefault();
            send_text();
          }
        }}
        oninput={(ev) => (ev.currentTarget.parentElement!.dataset.text = ev.currentTarget.value)}
        onpaste={(ev) => {
          ev.stopPropagation();
          proccess_data_transfer(ev.clipboardData, chat.send_files, noop);
        }}
        bind:this={textarea_el}
      ></textarea>
    </div>

    <IconButton onclick={send_text} title="Send text" {disabled}>
      <Icon.SendHorizontal />
    </IconButton>
  </div>
</div>
