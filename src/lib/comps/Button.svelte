<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';

  type Props = {
    children: Snippet;
  } & HTMLButtonAttributes;

  let { children, class: classes, ...restprops }: Props = $props();
</script>

<button
  {...restprops}
  class="flex py-3 px-4 rounded-full bg-transparentt text-sm font-medium cursor-pointer focus-themed disabled:cursor-not-allowed disabled:text-base-700 not-disabled:hover:bg-base-400 {classes}"
>
  {@render children()}
</button>
