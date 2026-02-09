const CACHE_NAME = "symptom-assist-v17";
const RUNTIME_CACHE = "symptom-assist-runtime-v1";
const OFFLINE_ASSETS = [
  "./",
  "./index.html",
  "./chat.html",
  "./history.html",
  "./about.html",
  "./styles.css",
  "./app.js",
];

const RUNTIME_ALLOWLIST = new Set([
  "https://cdn.tailwindcss.com",
  "https://fonts.googleapis.com",
  "https://fonts.gstatic.com",
]);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(OFFLINE_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => ![CACHE_NAME, RUNTIME_CACHE].includes(key))
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  const isSameOrigin = requestUrl.origin === self.location.origin;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      if (!isSameOrigin && RUNTIME_ALLOWLIST.has(requestUrl.origin)) {
        return fetch(event.request)
          .then((response) => {
            const copy = response.clone();
            caches
              .open(RUNTIME_CACHE)
              .then((cache) => cache.put(event.request, copy))
              .catch(() => null);
            return response;
          })
          .catch(() => caches.match(event.request));
      }

      return fetch(event.request)
        .then((response) => {
          if (isSameOrigin && response && response.ok) {
            const copy = response.clone();
            caches
              .open(CACHE_NAME)
              .then((cache) => cache.put(event.request, copy))
              .catch(() => null);
          }
          return response;
        })
        .catch(() => (isSameOrigin ? caches.match("./index.html") : undefined));
    })
  );
});
