<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	type Props = {
		children: Snippet;
		title: string;
	} & HTMLButtonAttributes;

	let { children, class: classes, title, ...rest_props }: Props = $props();
</script>

<button
	{...rest_props}
	{title}
	class="not-disabled:hover:bg-base-400 disabled:text-base-700 grid size-11 cursor-pointer place-items-center rounded-full bg-transparent focus:ring-0 focus:outline-none disabled:cursor-not-allowed {classes}"
>
	<span class="sr-only">{title}</span>
	{@render children()}
</button>
