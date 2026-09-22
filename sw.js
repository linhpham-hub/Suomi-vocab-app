// Suomen Sanasto service worker -- offline-first caching for a fully static app.
// Bump CACHE_NAME whenever the precached file list changes to force an update.
const CACHE_NAME = "sanasto-cache-v3";

const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./dashboard.html",
  "./manifest.webmanifest",
  "./css/style.css",
  "./js/config.js",
  "./js/app.js",
  "./js/srs.js",
  "./js/sync.js",
  "./js/dashboard.js",
  "./data/vocab.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Cache-first for everything we know about, falling back to network,
// and updating the cache in the background when the network succeeds.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  // Never intercept cross-origin requests (e.g. the Supabase sync/dashboard
  // API calls) -- they should always hit the network fresh, not be served
  // from (or written into) this app-shell cache.
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const networkFetch = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached || caches.match("./index.html"));

      return cached || networkFetch;
    })
  );
});
