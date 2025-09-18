<script lang="ts">
  import { Icon, IconButton } from '$lib/comps/index.js';
  import {
    ensure_protocol,
    format_file_size,
    format_hs_mm,
    is_codeblock,
    is_like_link,
    parse_codeblock_content,
  } from '$lib/utils';
  import type { MessageRenderable } from './shared.js';
  import { MESSAGE_FILE_TRANSFER, MESSAGE_TEXT, SENDER_ME } from './shared.js';

  type Props = {
    msg: MessageRenderable;
    on_cancel_file: (file_id: string) => void;
    on_download_file: (file_id: string) => void;
  };

  let { msg, on_cancel_file, on_download_file }: Props = $props();
</script>

<div class="flex items-start gap-2.5">
  <div
    class="bg-base-100 shadow-base-100 relative mb-3 flex max-w-11/12 flex-col px-3 pt-2 pb-1 shadow sm:max-w-[min(80%,40rem)]
    {msg.sender === SENDER_ME
      ? 'ml-auto rounded-l-xl rounded-b-xl'
      : 'rounded-e-xl rounded-es-xl after:rounded-e-xl after:rounded-es-xl'}
    {msg.sender === 'system' ? 'text-yellow-50 italic' : ''}"
  >
    {#if msg.sender !== SENDER_ME}
      <div class="flex justify-between text-sm">
        <span class="text-primary-100 font-medium">
          {msg.sender}
        </span>
      </div>
    {/if}
    {#if msg.type === MESSAGE_TEXT}
      <div class="py-1 text-sm whitespace-break-spaces">
        {#if is_like_link(msg.text)}
          <a href={ensure_protocol(msg.text)} rel="refferer,noopener" class="link break-words">
            {msg.text}
          </a>
        {:else if is_codeblock(msg.text)}
          <pre class="code-block"><code>{parse_codeblock_content(msg.text)}</code></pre>
        {:else}
          <p class="break-words">{msg.text}</p>
        {/if}
      </div>
    {:else if msg.type === MESSAGE_FILE_TRANSFER}
      <div class="-mx-1 min-w-64 py-1 sm:min-w-96">
        <div class="flex rounded p-2 {msg.aborted ? 'bg-red-600/10' : 'bg-base-200'}">
          <div class="grid">
            <Icon.File class="size-10 stroke-1" />
          </div>
          <div class="mx-2">
            <div>
              <span class="flex items-center gap-2 text-sm font-normal break-all sm:break-words">
                {msg.f_name}
              </span>
            </div>
            <div class="text-base-700 flex gap-x-2 py-1 text-xs font-normal">
              {#if msg.f_type}
                <span class="uppercase">{msg.f_type_human}</span>
              {/if}
              <span>{format_file_size(msg.f_size)}</span>
              {#if msg.aborted}
                <span class="sr-only text-xs">(canceled)</span>
              {/if}
            </div>
          </div>
          {#if msg.completed}
            <div class="ml-auto">
              <IconButton
                onclick={() => {
                  on_download_file(msg.f_id);
                }}
                title="Download file"
                class="size-11"
              >
                <Icon.ArrowDownToLine class="size-7 stroke-1" />
              </IconButton>
            </div>
          {:else if msg.aborted}
            <div class="ml-auto">
              <div class="grid size-11 place-items-center">
                <Icon.CircleOff class="size-7 stroke-1" />
              </div>
            </div>
          {:else if msg.progress < 100}
            <div class="ml-auto">
              <IconButton
                onclick={() => {
                  on_cancel_file(msg.f_id);
                }}
                title="Cancel file"
                class="size-11"
              >
                <Icon.X class="size-7 stroke-1" />
              </IconButton>
            </div>
          {/if}
        </div>
        {#if !(msg.completed || msg.aborted)}
          <div class="bg-base-700 my-1 h-0.5 w-full rounded">
            <div class="bg-primary-100 h-0.5" style="width: {msg.progress}%"></div>
          </div>
          <div class="text-base-700 mt-1 ml-1 flex justify-between text-xs">
            <span>{msg.progress}% complete</span>
          </div>
        {/if}
      </div>
    {/if}
    <span class="text-base-700 ml-auto text-xs">{format_hs_mm(msg.ts)}</span>
  </div>
</div>
