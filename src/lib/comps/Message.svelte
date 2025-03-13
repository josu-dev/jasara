<script lang="ts">
	import type { Message } from '$lib/types/types';
	import { format_file_size, format_hs_mm } from '$lib/utils';

	type Props = {
		msg: Message;
		isHost: boolean;
		on_cancel_file: (fileId: string) => void;
		on_download_file: (fileData: string, filename: string) => void;
	};

	let { msg, isHost, on_cancel_file, on_download_file }: Props = $props();
</script>

{#if msg.type === 'system'}
	<div class="mx-auto my-1 max-w-full px-3 py-2 text-center text-sm text-gray-500 italic">
		{msg.text}
	</div>
{:else if msg.type === 'file-transfer'}
	<div
		class="mb-3 rounded-lg px-4 py-3 {msg.sender === 'me'
			? 'ml-auto bg-blue-100'
			: 'bg-green-100'} max-w-[80%]"
	>
		<div class="mb-1 flex justify-between text-sm">
			<span
				class="font-medium {msg.sender === 'me'
					? 'text-blue-700'
					: 'text-green-700'}"
			>
				{msg.sender}
			</span>
			<span class="text-gray-500">{format_hs_mm(msg.ts)}</span>
		</div>
		<div class="mb-1 flex items-center">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="mr-1 h-5 w-5 {msg.sender === 'me'
					? 'text-blue-700'
					: 'text-green-700'}"
				viewBox="0 0 20 20"
				fill="currentColor"
			>
				<path
					fill-rule="evenodd"
					d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z"
					clip-rule="evenodd"
				/>
			</svg>
			<span class={msg.sender === 'me' ? 'text-blue-700' : 'text-green-700'}
				>{msg.filename}</span
			>
			<span class="ml-1 text-gray-500">({format_file_size(msg.fileSize)})</span>
		</div>
		{#if msg.aborted}
			<div class="text-sm text-red-500">Transfer aborted</div>
		{:else}
			<div class="h-2.5 w-full rounded-full bg-gray-200">
				<div class="h-2.5 rounded-full bg-blue-600" style="width: {msg.progress}%"></div>
			</div>
			<div class="mt-1 flex justify-between text-xs text-gray-600">
				<span>{msg.progress}% complete</span>
				{#if msg.sender === 'me' && msg.progress < 100}
					<button
						onclick={() => on_cancel_file(msg.fileId)}
						class="text-red-500 hover:text-red-700"
					>
						Cancel
					</button>
				{/if}
			</div>
		{/if}
	</div>
{:else if msg.type === 'file'}
	<div
		class="mb-3 rounded-lg px-4 py-3 {msg.sender === 'me'
			? 'ml-auto bg-blue-100'
			: 'bg-green-100'} max-w-[80%]"
	>
		<div class="mb-1 flex justify-between text-sm">
			<span
				class="font-medium {msg.sender === 'me'
					? 'text-blue-700'
					: 'text-green-700'}"
			>
				{msg.sender}
			</span>
			<span class="text-gray-500">{format_hs_mm(msg.ts)}</span>
		</div>
		<div class="flex items-center">
			<svg
				xmlns="http://www.w3.org/2000/svg"
				class="mr-1 h-5 w-5 {msg.sender === 'me'
					? 'text-blue-700'
					: 'text-green-700'}"
				viewBox="0 0 20 20"
				fill="currentColor"
			>
				<path
					fill-rule="evenodd"
					d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z"
					clip-rule="evenodd"
				/>
			</svg>
			<span class={msg.sender === 'me' ? 'text-blue-700' : 'text-green-700'}
				>{msg.filename}</span
			>
			{#if msg.fileSize}
				<span class="ml-1 text-gray-500">({format_file_size(msg.fileSize)})</span>
			{/if}
			<button
				onclick={() => on_download_file(msg.fileData, msg.filename)}
				class="ml-2 rounded bg-gray-200 px-2 py-1 text-xs hover:bg-gray-300"
			>
				Download
			</button>
		</div>
	</div>
{:else}
	<div
		class="mb-3 rounded-lg px-4 py-3 {msg.sender === 'me'
			? 'ml-auto bg-blue-100'
			: 'bg-green-100'} max-w-[80%]"
	>
		<div class="mb-1 flex justify-between text-sm">
			<span
				class="font-medium {msg.sender === 'me'
					? 'text-blue-700'
					: 'text-green-700'}"
			>
				{msg.sender}
			</span>
			<span class="text-gray-500">{format_hs_mm(msg.ts)}</span>
		</div>
		<div>{msg.text}</div>
	</div>
{/if}
