<script lang="ts">
  import * as Chat from '$lib/chat/index.js';
  import { Logo, Metadata } from '$lib/comps/index.js';
  import { DEFAULT_ROOM_ID, DEFAULT_SYSTEM_MESSAGE, SITE_REPOSITORY } from '$lib/constants.js';

  const default_messages = [Chat.create_text_message(DEFAULT_SYSTEM_MESSAGE, 'system')];
</script>

<Metadata description="Transfer things between devices, easily" />

<Chat.Provider initial_messages={default_messages} initial_room_id={DEFAULT_ROOM_ID}>
  <main
    class="mx-auto grid h-full max-w-4xl grid-cols-1 grid-rows-[auto_1fr] overflow-hidden font-sans sm:px-4 sm:pb-4"
  >
    <div class="flex flex-none justify-between gap-x-2 py-1 px-2 sm:py-2 sm:px-0">
      <div class="flex items-center">
        <a
          href={SITE_REPOSITORY}
          target="_blank"
          rel="noopener noreferrer"
          title="Github repository"
          class="flex items-center gap-x-1.5 rounded-md outline-offset-4 outline-focus focus-visible:outline sm:gap-2"
        >
          <Logo />
          <h1
            class="-mb-0.5 text-primary-100 text-center text-base leading-none font-extrabold tracking-wider sm:text-4xl"
          >
            JAS<br class="sm:hidden" />ARA
          </h1>
        </a>
      </div>

      <div class="flex gap-x-1">
        <Chat.ConnectBar />
        <Chat.Preferences />
      </div>
    </div>

    <div class="border-border flex h-full flex-col overflow-hidden border-y sm:rounded-md sm:border">
      <div class="relative grid h-full overflow-hidden">
        <Chat.DropZone />
        <Chat.Messages />
      </div>

      <Chat.InputBar />
    </div>
  </main>
</Chat.Provider>
