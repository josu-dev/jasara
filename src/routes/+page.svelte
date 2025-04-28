<script lang="ts">
  import * as Chat from '$lib/chat/index.js';
  import { Logo, Metadata } from '$lib/comps/index.js';
  import { DEFAULT_ROOM_ID, DEFAULT_SYSTEM_MESSAGE } from '$lib/constants.js';

  const default_messages = [Chat.create_text_message(DEFAULT_SYSTEM_MESSAGE, 'system')];
</script>

<Metadata description="Transfer things between devices, easily" />

<Chat.Provider initial_messages={default_messages} initial_room_id={DEFAULT_ROOM_ID}>
  <main
    class="mx-auto grid h-full max-w-4xl grid-cols-1 grid-rows-[auto_1fr] overflow-hidden px-1 pb-1 font-sans sm:px-4 sm:pb-4"
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

      <Chat.ConnectBar />
    </div>

    <div class="border-border flex h-full flex-col overflow-hidden rounded-md border">
      <div class="relative grid h-full overflow-hidden">
        <Chat.DropZone />
        <Chat.Messages />
      </div>

      <Chat.InputBar />
    </div>
  </main>
</Chat.Provider>
