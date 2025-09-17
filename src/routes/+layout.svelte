<script lang="ts">
  import ServiceWorker from '$lib/comps/ServiceWorker.svelte';
  import '../app.css';

  let { children } = $props();
</script>

<div class="h-full">
  {@render children()}
</div>

<ServiceWorker />
