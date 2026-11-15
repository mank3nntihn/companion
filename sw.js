// Service Worker: hält die App-Hülle offline bereit.
// Daten und Ticket-Dateien legt die App selbst im Gerätespeicher ab.
//
// Updates: Bei jedem Deployment setzt GitHub Actions VERSION auf den Commit.
// Dadurch ist sw.js neu, der Browser installiert ihn, lädt alle Dateien frisch
// in einen eigenen Cache, übernimmt sofort und die Seite lädt sich neu.

const VERSION = 'tb-shell-v3';
const SHELL = [
  './',
  './index.html',
  './css/app.css',
  './js/app.js',
  './js/config.js',
  './js/core/data.js',
  './js/core/router.js',
  './js/core/theme.js',
  './js/core/time.js',
  './js/core/ui.js',
  './js/modules/index.js',
  './js/modules/travel/index.js',
  './js/modules/travel/extras.js',
  './js/modules/travel/links.js',
  './js/modules/travel/demo.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];
const CDN = [
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js',
];
const RUNTIME = 'tb-runtime-v1';
const DOCS = 'tb-docs-v1';

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    // "reload" umgeht den HTTP-Cache, damit wirklich die neuen Dateien kommen
    await cache.addAll(SHELL.map((u) => new Request(u, { cache: 'reload' })));
    await Promise.all(CDN.map((u) => cache.add(new Request(u, { mode: 'cors' })).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = new Set([VERSION, RUNTIME, DOCS]);
    for (const k of await caches.keys()) if (!keep.has(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Supabase-API und Storage nie über den SW
  if (url.hostname.endsWith('.supabase.co') || url.hostname.endsWith('.supabase.in')) return;

  // Seitenaufrufe: erst Netz, sonst gespeicherte App
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        return await fetch(req, { cache: 'no-store' });
      } catch {
        const cache = await caches.open(VERSION);
        return (await cache.match('./index.html')) || (await cache.match('./')) || Response.error();
      }
    })());
    return;
  }

  // Eigene Dateien: aus dem Cache dieser Version (passt immer zusammen)
  if (url.origin === self.location.origin) {
    event.respondWith((async () => {
      const cache = await caches.open(VERSION);
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    })());
    return;
  }

  // Schriften und Bibliothek vom CDN: Cache zuerst
  if (/^(fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.jsdelivr\.net)$/.test(url.hostname)) {
    event.respondWith((async () => {
      const hit = await caches.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') (await caches.open(RUNTIME)).put(req, res.clone());
      return res;
    })());
  }
});
