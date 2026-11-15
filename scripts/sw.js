/* Sorro offline service worker. `npm run build` prepends PRECACHE (the build's
   version and file list) and writes the result to out/sw.js.

   Pages and RSC payloads are network-first, so an online launch always gets the
   latest deploy, which is how the APK and the desktop app pick up updates.
   Hashed /_next/static files never change, so they are cache-first. Offline,
   everything comes from the cache, and the app's own queue holds writes until
   the connection is back. Supabase and Google calls are never touched here. */
/* global PRECACHE */

const PRE = `sorro-pre-${PRECACHE.version}`;
const RUNTIME = 'sorro-runtime';
// The offline AI's 21 MB runtime (.wasm). Too big to precache, and it must survive deploys.
const MODEL = 'sorro-model';

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(PRE);
    // One failed file must not cancel the rest, so no addAll. `reload` skips the
    // HTTP cache, which can hold a page from the last build that names old chunks.
    await Promise.all(PRECACHE.files.map((url) => cache.add(new Request(url, { cache: 'reload' })).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // The new precache holds every page, so last version's precache and runtime
    // copies can go. Other caches stay: MODEL, and transformers-cache, which
    // holds the downloaded offline AI model.
    for (const key of await caches.keys()) if (key === RUNTIME || (key.startsWith('sorro-pre-') && key !== PRE)) await caches.delete(key);
    await self.clients.claim();
  })());
});

// Next sometimes reloads a page without its trailing slash (`/home`), which the
// cache only holds as `/home/`. Falling back to `/` there loops sign-in -> home.
const fromCache = async (request) =>
  (await caches.match(request, { ignoreSearch: true })) ||
  (request.mode === 'navigate'
    ? (await caches.match(new URL(request.url).pathname.replace(/\/?$/, '/'), { ignoreSearch: true })) || (await caches.match('/', { ignoreSearch: true }))
    : undefined);

// Wi-fi with no internet behind it does not fail a request, it hangs. Past this,
// the saved copy is shown and the network answer still refreshes the cache.
const NETWORK_WAIT = 4000;

async function networkFirst(request, event) {
  const network = fetch(request).then((response) => {
    if (response.ok) {
      const copy = response.clone();
      // Keyed without the query: RSC fetches add `?_rsc=<random>`.
      const key = new URL(request.url); key.search = '';
      event.waitUntil(caches.open(RUNTIME).then((c) => c.put(key.toString(), copy)));
    }
    return response;
  });
  event.waitUntil(network.catch(() => {}));
  try {
    return await Promise.race([network, new Promise((_, no) => setTimeout(no, NETWORK_WAIT))]);
  } catch {
    const hit = await fromCache(request);
    if (hit) return hit;
    // Nothing saved: keep waiting for the network rather than fail early.
    return network.catch(() => Response.error());
  }
}

// Read fully before caching: splitting the 21 MB .wasm stream into two copies
// failed with a network error. waitUntil keeps the worker alive for the write.
async function cacheFirst(request, event) {
  const hit = await caches.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (!response.ok) return response;
  const body = await response.blob();
  const init = { status: response.status, headers: response.headers };
  const name = request.url.endsWith('.wasm') ? MODEL : RUNTIME;
  event.waitUntil(caches.open(name).then((c) => c.put(request, new Response(body, init))));
  return new Response(body, init);
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname === '/sw.js') return;
  event.respondWith(url.pathname.startsWith('/_next/static/') ? cacheFirst(request, event) : networkFirst(request, event));
});
