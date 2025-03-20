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

<div class="bg-base-100 border-border border-t px-3 py-2">
	<div class="flex items-end">
		<label
			for="file_input"
			title="Attach file"
			class="not-has-[input[disabled]]:hover:bg-base-400 has-[input[disabled]]:text-base-700 grid size-11 cursor-pointer place-items-center rounded-full has-[input[disabled]]:cursor-not-allowed"
		>
			<span class="sr-only">Attach file</span>
			<Paperclip />
			<input
				id="file_input"
				type="file"
				accept="*"
				multiple
				class="hidden"
				oninput={(ev) => {
					on_input(ev.currentTarget.files);
				}}
				{disabled}
			/>
		</label>

		<div
			class="grid flex-1 text-sm
    after:invisible after:max-h-[5lh] after:min-h-[1lh] after:border after:px-3.5 after:py-2.5 after:whitespace-pre-wrap after:text-inherit
    after:content-[attr(data-text)_'_'] after:[grid-area:1/1/2/2] [&>textarea]:[grid-area:1/1/2/2]"
		>
			<label for="text-input" class="sr-only">Message</label>
			<textarea
				id="text_input"
				placeholder="Message"
				rows="1"
				spellcheck="true"
				class="scrollbar-themed w-full resize-none overflow-x-hidden overflow-y-auto border-none bg-transparent px-2 py-2 focus:ring-0 focus:outline-none disabled:cursor-not-allowed"
				onkeypress={(ev) => {
					if (ev.key === 'Enter' && !ev.shiftKey) {
						ev.preventDefault();
						send_text();
						ev.currentTarget.parentElement!.dataset.text = '';
					}
				}}
				oninput={(ev) => (ev.currentTarget.parentElement!.dataset.text = ev.currentTarget.value)}
				{disabled}
				bind:value={raw_text}
			></textarea>
		</div>

		<IconButton onclick={send_text} title="Send file" {disabled}>
			<SendHorizontal />
		</IconButton>
	</div>
</div>
