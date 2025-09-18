<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { HTMLButtonAttributes } from 'svelte/elements';

  type Props = {
    children: Snippet;
    title: string;
  } & HTMLButtonAttributes;

  let { children, class: classes, title, ...restprops }: Props = $props();
</script>

<button
  {...restprops}
  {title}
  class="grid place-items-center rounded-full bg-transparent cursor-pointer focus-themed disabled:cursor-not-allowed disabled:text-base-700 not-disabled:hover:bg-base-400 {classes}"
>
  <span class="sr-only">{title}</span>
  {@render children()}
</button>
