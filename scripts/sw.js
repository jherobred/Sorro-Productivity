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

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(PRE);
    // One failed file must not cancel the rest, so no addAll.
    await Promise.all(PRECACHE.files.map((url) => cache.add(url).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // The new precache holds every page, so last version's runtime copies can go.
    for (const key of await caches.keys()) if (key !== PRE) await caches.delete(key);
    await self.clients.claim();
  })());
});

const fromCache = async (request) =>
  (await caches.match(request, { ignoreSearch: true })) ||
  (request.mode === 'navigate' ? await caches.match('/', { ignoreSearch: true }) : undefined);

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const copy = response.clone();
      // Keyed without the query: RSC fetches add `?_rsc=<random>`.
      const key = new URL(request.url); key.search = '';
      void caches.open(RUNTIME).then((c) => c.put(key.toString(), copy));
    }
    return response;
  } catch {
    return (await fromCache(request)) || Response.error();
  }
}

async function cacheFirst(request) {
  const hit = await caches.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) { const copy = response.clone(); void caches.open(RUNTIME).then((c) => c.put(request, copy)); }
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname === '/sw.js') return;
  event.respondWith(url.pathname.startsWith('/_next/static/') ? cacheFirst(request) : networkFirst(request));
});
