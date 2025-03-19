<script lang="ts">
	import Message from '$lib/comps/Message.svelte';
	import type { RenderableMessage } from '$lib/types/types';

	type Props = {
		messages: RenderableMessage[];
		isHost: boolean;
		cancel_file_transfer: (id: string) => void;
		download_file: (url: string, filename: string) => void;
	};

	let { messages, isHost, cancel_file_transfer, download_file }: Props = $props();

	let container_el: HTMLElement;

	$effect(() => {
		messages;
		container_el.scrollTop = container_el.scrollHeight;
	});
</script>

<div bind:this={container_el} class="bg-base-200 flex-1 overflow-y-auto p-4">
	{#each messages as msg}
		<Message
			{msg}
			{isHost}
			on_cancel_file={cancel_file_transfer}
			on_download_file={download_file}
		/>
	{/each}
</div>
