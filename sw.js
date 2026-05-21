// Minimal service worker — exists so Chrome on Android treats widget.html
// as installable and shows the "Add to home screen" prompt automatically.
// Network-first for everything (we always want fresh data); falls back to
// the cached shell if offline.

const CACHE = "bday-widget-shell-v1";
const SHELL = [
  "widget.html",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  // Don't intercept Supabase (auth, function, storage) — always go to the network.
  if (url.hostname.endsWith("supabase.co")) return;
  // Only handle GETs from our own origin.
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(event.request, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
