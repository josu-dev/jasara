<script lang="ts">
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

	function textarea_onkeypress(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			send_text();
		}
	}

	function send_file() {
		const fileInput = document.getElementById('fileInput') as HTMLInputElement;
		if (fileInput.files && fileInput.files.length > 0) {
			const file = fileInput.files[0];
			on_send_file(file);
		}
	}
</script>

<div class="border-t border-gray-300 bg-gray-100 p-3">
	<div class="mb-2 flex">
		<textarea
			bind:value={raw_text}
			onkeypress={textarea_onkeypress}
			placeholder="Message"
			{disabled}
			class="h-16 flex-1 resize-none rounded-l-lg border border-gray-300 p-3 focus:ring-2 focus:ring-blue-500 focus:outline-none"
		></textarea>
		<button
			onclick={send_text}
			{disabled}
			class="rounded-r-lg bg-blue-600 px-4 font-medium text-white focus:ring-2 focus:ring-blue-500 focus:outline-none disabled:bg-gray-400"
		>
			Send
		</button>
	</div>

	<div class="flex items-center">
		<input type="file" id="fileInput" {disabled} class="flex-1" />
		<button
			onclick={send_file}
			{disabled}
			class="rounded bg-gray-600 px-4 py-2 font-medium text-white focus:ring-2 focus:ring-gray-500 focus:outline-none disabled:bg-gray-400"
		>
			Upload
		</button>
	</div>

	<!-- {#if isTransferringFile}
		<div class="mt-2">
			<div class="mb-1 text-sm">Sending file: {fileSendProgress}% complete</div>
			<div class="h-2.5 w-full rounded-full bg-gray-200">
				<div class="h-2.5 rounded-full bg-blue-600" style="width: {fileSendProgress}%"></div>
			</div>
		</div>
	{/if} -->
</div>
