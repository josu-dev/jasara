<script lang="ts">
	import '../app.css';

	let { children } = $props();
</script>

<div class="bg-base-100 h-full">
	{@render children()}
</div>
