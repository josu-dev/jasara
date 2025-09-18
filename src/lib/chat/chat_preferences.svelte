<script lang="ts">
  import { Icon, IconButton } from '$lib/comps/index.js';
  import { use_chat_ctx } from './chat.svelte.js';

  const chat = use_chat_ctx();

  let auto_save = $derived(chat.preferences.auto_save);

  function toggle_auto_save() {
    chat.update_preferences({
      auto_save: !auto_save,
    });
  }
</script>

<IconButton
  onclick={toggle_auto_save}
  title={auto_save ? `Disable file auto-save` : `Enable file auto-save`}
  data-true={auto_save ? '' : void 0}
  class="size-9 sm:size-11 text-base-900 data-true:text-primary-50"
>
  <Icon.Save />
</IconButton>
