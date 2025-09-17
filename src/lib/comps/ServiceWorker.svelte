<script lang="ts">
  import { dev } from '$app/environment';
  import Button from './Button.svelte';

  let update_available = $state(false);
  let updating_worker = $state(false);
  let waiting_worker: ServiceWorker | null = null;

  async function check_update() {
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration === undefined) return;

    registration.addEventListener('updatefound', () => {
      const new_worker = registration.installing;
      if (new_worker == null) return;

      new_worker.addEventListener('statechange', () => {
        if (new_worker.state === 'installed') {
          waiting_worker = new_worker;
          update_available = true;
        }
      });
    });

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      window.location.reload();
    });
  }

  function update_worker() {
    if (waiting_worker === null || updating_worker) return;

    updating_worker = true;
    waiting_worker.postMessage({ type: 'SKIP_WAITING' });
  }

  function close_update_dialog() {
    update_available = false;
  }

  $effect(() => {
    if (!('serviceWorker' in navigator)) return;

    // https://svelte.dev/docs/kit/service-workers#During-development
    navigator.serviceWorker.register('./service-worker.js', {
      type: dev ? 'module' : 'classic',
    });

    check_update();
  });
</script>

{#if update_available}
  <div class="fixed bottom-8 left-1/2 -translate-x-1/2 z-10 w-full px-2 sm:px-4">
    <div
      class="flex items-center justify-between mx-auto gap-4 px-3 py-3 max-w-md rounded-md border border-border bg-base-100 shadow-lg sm:pl-4"
    >
      <p class="text-sm text-balance">
        {#if updating_worker}
          Updating to the latest version
          <span class="inline-flex gap-1 self-baseline *:size-0.5 *:rounded-full *:bg-current *:animate-pulse">
            <span class=""></span>
            <span class="[animation-delay:150ms]"></span>
            <span class="[animation-delay:300ms]"></span>
          </span>
        {:else}
          A new version is ready. Would you like to update?
        {/if}
      </p>

      <div class="flex gap-x-1">
        <Button onclick={close_update_dialog} disabled={updating_worker}>Skip</Button>
        <Button onclick={update_worker} disabled={updating_worker}>Update</Button>
      </div>
    </div>
  </div>
{/if}
