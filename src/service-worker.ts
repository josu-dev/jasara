/// <reference types="@sveltejs/kit" />
/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />
import { build, files, version } from '$service-worker';


const sw = self as unknown as ServiceWorkerGlobalScope;

const CACHE_NAME = `cache-jasara-${version}`;

const ASSETS = [...build, ...files];

sw.addEventListener('install', (event) => {
    async function create_new_cache() {
        const cache = await caches.open(CACHE_NAME);
        await cache.addAll(ASSETS);
    }

    event.waitUntil(create_new_cache());
});

sw.addEventListener('activate', (event) => {
    async function delete_previous_caches() {
        for (const key of await caches.keys()) {
            if (key !== CACHE_NAME) {
                await caches.delete(key);
            }
        }
    }

    event.waitUntil(delete_previous_caches());
});

sw.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') {
        return;
    }

    async function respond() {
        const url = new URL(event.request.url);
        const cache = await caches.open(CACHE_NAME);

        // `build`/`files` can always be served from the cache
        if (ASSETS.includes(url.pathname)) {
            const response = await cache.match(url.pathname);

            if (response) {
                return response;
            }
        }

        // for everything else, try the network first, but
        // fall back to the cache if we're offline
        try {
            const response = await fetch(event.request);

            // if we're offline, fetch can return a value that is not a Response
            // instead of throwing - and we can't pass this non-Response to respondWith
            if (!(response instanceof Response)) {
                throw new Error('invalid response from fetch');
            }

            // for offline usage, take care of big and stale files
            if (response.status === 200) {
                cache.put(event.request, response.clone());
            }

            return response;
        } catch (err) {
            const response = await cache.match(event.request);

            if (response) {
                return response;
            }

            // if there's no cache, then just error out
            // as there is nothing we can do to respond to this request
            throw err;
        }
    }

    event.respondWith(respond());
});
