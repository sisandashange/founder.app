// BOOK.NOW service worker: keeps the app installable and shows the last loaded page when offline.
// Live data (Supabase) is never cached. Pages are always fetched fresh when online.
const CACHE = "booknow-v1";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin || /admin/i.test(url.pathname)) return;

  event.respondWith(
    fetch(req)
      .then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then(hit => hit || new Response(
        "You're offline. Reconnect to use BOOK.NOW.",
        { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } }
      )))
  );
});
