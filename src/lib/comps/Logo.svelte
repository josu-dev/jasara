<script lang="ts">
  import Rabbit from '@lucide/svelte/icons/rabbit';

  let { class: classes = '', ...rprops } = $props();
</script>

<div class="bg-primary-100 inline-block aspect-square size-8 rounded p-0.5 {classes}">
  <Rabbit {...rprops} class="text-base-100 size-full" />
</div>
