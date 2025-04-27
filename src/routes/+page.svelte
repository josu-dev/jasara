<script lang="ts">
  import ConnectionBar from '$lib/comps/ConnectionBar.svelte';
  import DragAndDropZone from '$lib/comps/DragAndDropZone.svelte';
  import InputBar from '$lib/comps/InputBar.svelte';
  import Logo from '$lib/comps/Logo.svelte';
  import Messages from '$lib/comps/Messages.svelte';
  import SEO from '$lib/comps/SEO.svelte';
  import { DEFAULT_MSG, DEFAULT_ROOM_ID } from '$lib/constants.js';
  import * as p2p from '$lib/internal/p2p.svelte.js';
  import { download_file, unreachable } from '$lib/utils.js';

  let connectionStatus = $state('Disconnected');
  let errorMessage = $state('');
  let messages: p2p.MessageRenderable[] = $state([p2p.create_text_message(DEFAULT_MSG, 'system')]);

  const id_to_idx: Map<string, number> = new Map();

  function on_message(msg: p2p.MessageRenderable) {
    switch (msg.type) {
      case p2p.MESSAGE_TEXT: {
        messages.push(msg);
        return;
      }
      case p2p.MESSAGE_FILE_TRANSFER: {
        messages.push(msg);
        id_to_idx.set(msg.f_id, messages.length - 1);
        return;
      }
      default: {
        unreachable(`Unhandled message case '%s'`, msg);
      }
    }
  }

  function add_system_message(text: string) {
    const msg = p2p.create_text_message(text, 'system');

    messages.push(msg);
  }

  function send_text(text: string, reset?: () => void) {
    const msg = p2p.create_text_message(text);
    if (!p2p.send_text_message(msg)) {
      return;
    }

    messages.push(msg);
    reset?.();
  }

  function send_files(files: File[]) {
    for (const file of files) {
      const msg = p2p.create_file_message(file);
      p2p.send_file_message(msg, file);

      messages.push(msg);
    }
  }

  function cancel_file_transfer(id: string) {
    if (!p2p.cancel_file_transfer(id)) {
      return;
    }

    for (const msg of messages) {
      if (msg.type === p2p.MESSAGE_FILE_TRANSFER && msg.f_id === id) {
        msg.aborted = true;
        msg.progress = -1;
        break;
      }
    }

    add_system_message(`File transfer cancelled`);
  }

  function on_download_file(id: string) {
    for (const msg of messages) {
      if (msg.type === p2p.MESSAGE_FILE_TRANSFER && msg.f_id === id && msg.completed) {
        download_file(msg.f_blob, msg.f_name);
        return;
      }
    }
  }

  function on_conn_state_change(status: p2p.ConnectionStatus): void {
    connectionStatus = status;
  }

  function update_file(m: p2p.MessageFileTransfer) {
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (msg.type === p2p.MESSAGE_FILE_TRANSFER && msg.f_id === m.f_id) {
        messages[i] = m;
        break;
      }
    }
  }

  $effect(() => {
    return () => {
      p2p.deinit();
      add_system_message('Disconnected from chat');
    };
  });
</script>

<SEO description="Transfer things between devices, easily" />

<main
  class="mx-auto grid h-full max-w-3xl grid-cols-1 grid-rows-[auto_1fr] overflow-hidden px-1 pb-1 font-sans sm:px-4 sm:pb-4"
>
  <div class="flex flex-none justify-between px-1 py-1 sm:py-2">
    <div class="flex items-center gap-x-1.5 sm:gap-2">
      <Logo class="mb-0.5" />
      <h1
        class="text-primary-100 self-center text-center align-middle text-base leading-none font-extrabold tracking-wider sm:text-4xl"
      >
        JAS<br class="sm:hidden" />ARA
      </h1>
    </div>

    <ConnectionBar
      connection_status={connectionStatus as any}
      connection_error={errorMessage}
      default_room_id={DEFAULT_ROOM_ID}
      on_create={(id) =>
        p2p.init_as_host({
          room_id: id,
          on_message,
          on_error: (err) => (errorMessage = err.message || 'Unknown error'),
          on_system_message: on_message,
          on_conn_state_change: on_conn_state_change,
          on_file_update: update_file
        })}
      on_connect={(id) =>
        p2p.init_as_guest({
          room_id: id,
          on_message,
          on_error: (err) => (errorMessage = err.message || 'Unknown error'),
          on_system_message: on_message,
          on_conn_state_change: on_conn_state_change,
          on_file_update: update_file
        })}
      on_disconnect={p2p.deinit}
    />
  </div>

  <div class="border-border flex h-full flex-col overflow-hidden rounded-md border">
    <div class="relative grid h-full overflow-hidden">
      <DragAndDropZone
        on_files_drop={send_files}
        on_text_drop={send_text}
        drag_disabled={connectionStatus !== 'Connected'}
      />
      <Messages {messages} {cancel_file_transfer} {on_download_file} />
    </div>

    <InputBar
      on_send_files={send_files}
      on_send_text={send_text}
      on_paste_files={send_files}
      disabled={connectionStatus !== 'Connected'}
    />
  </div>
</main>
