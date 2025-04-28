<script lang="ts">
  import * as Icon from './icons/index.js';

  let { class: classes = '', ...rprops } = $props();
</script>

<div class="bg-primary-100 inline-block aspect-square size-8 rounded p-0.5 {classes}">
  <Icon.Rabbit {...rprops} class="text-base-100 size-full" />
</div>
