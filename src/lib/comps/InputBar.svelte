<script lang="ts">
	import Paperclip from '@lucide/svelte/icons/paperclip';
	import SendHorizontal from '@lucide/svelte/icons/send-horizontal';
	import IconButton from './IconButton.svelte';

	type Props = {
		on_send_text: (text: string, reset: () => void) => void;
		on_send_file: (file: File) => void;
		disabled?: boolean;
	};

	let { on_send_text, on_send_file, disabled = false }: Props = $props();

	let raw_text = $state('');

	function send_text() {
		on_send_text(raw_text, clear_text);
		raw_text = '';
	}

	function clear_text() {
		raw_text = '';
	}

	function on_input(files: FileList | null) {
		if (files == null || files.length === 0) {
			return;
		}

		const file = files[0];
		on_send_file(file);
	}
</script>

<div class="bg-base-100 border-border border-t p-3">
	<div class="flex items-end">
		<label
			for="fileInput"
			title="Attach file"
			class="hover:bg-base-300 grid size-11 cursor-pointer place-items-center rounded-full"
		>
			<span class="sr-only">Attach file</span>
			<Paperclip />
			<input
				type="file"
				id="fileInput"
				{disabled}
				class="hidden"
				oninput={(ev) => {
					on_input(ev.currentTarget.files);
				}}
			/>
		</label>

		<div
			class="grid flex-1 text-sm
    after:invisible after:max-h-[5lh] after:min-h-[1lh] after:border after:px-3.5 after:py-2.5 after:whitespace-pre-wrap after:text-inherit
    after:content-[attr(data-text)_'_'] after:[grid-area:1/1/2/2] [&>textarea]:[grid-area:1/1/2/2]"
		>
			<textarea
				spellcheck="true"
				placeholder="Message"
				rows="1"
				bind:value={raw_text}
				onkeypress={(ev) => {
					if (ev.key === 'Enter' && !ev.shiftKey) {
						ev.preventDefault();
						send_text();
						ev.currentTarget.parentElement!.dataset.text = '';
					}
				}}
				oninput={(ev) => (ev.currentTarget.parentElement!.dataset.text = ev.currentTarget.value)}
				{disabled}
				class=" w-full resize-none overflow-x-hidden overflow-y-auto border-none bg-transparent px-2 py-2 [scrollbar-color:var(--color-fg-100)_transparent] [scrollbar-width:thin] focus:ring-0 focus:outline-none"
			></textarea>
		</div>

		<IconButton onclick={send_text} title="Send file" {disabled}>
			<SendHorizontal />
		</IconButton>
	</div>
</div>
