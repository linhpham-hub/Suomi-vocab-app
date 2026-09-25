// Suomen Sanasto service worker.
//
// Strategy: NETWORK FIRST, cache as fallback. When online you always get the
// newest files (so a deploy never leaves you with a mix of old and new files,
// which is what caused the blank "Browse glossary" page after an update).
// When offline, the last copy saved in the cache is used.
//
// Bump CACHE_NAME whenever the list of files below changes.
const CACHE_NAME = "sanasto-cache-v5";

const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./dashboard.html",
  "./manifest.webmanifest",
  "./css/style.css",
  "./js/config.js",
  "./js/ui.js",
  "./js/speech.js",
  "./js/srs.js",
  "./js/sync.js",
  "./js/feedback.js",
  "./js/words.js",
  "./js/talk.js",
  "./js/oral.js",
  "./js/progress.js",
  "./js/app.js",
  "./js/dashboard.js",
  "./data/vocab.json",
  "./data/conversations.json",
  "./data/phrases.json",
  "./data/oral.json",
  "./data/links.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
  "./icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
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

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  // Never touch cross-origin requests (Supabase, Microsoft Forms, Wordwall...).
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() =>
        caches.match(event.request, { ignoreSearch: true }).then(
          (cached) => cached || (event.request.mode === "navigate" ? caches.match("./index.html") : undefined)
        )
      )
  );
});
