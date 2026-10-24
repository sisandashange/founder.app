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

// ---- Phone alerts sent by the server (they arrive even when the app is closed) ----
self.addEventListener("push", event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; }
  catch (e) { data = { title: "BOOK.NOW", body: event.data ? event.data.text() : "" }; }

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const mine = windows.filter(w => w.url.startsWith(self.registration.scope));
    // If the app is open in front, it refreshes itself and shows its own banner, so skip a second alert
    if (mine.some(w => w.visibilityState === "visible")) {
      mine.forEach(w => w.postMessage({ type: "push", kind: data.tag || "" }));
      return;
    }
    await self.registration.showNotification(data.title || "BOOK.NOW", {
      body: data.body || "",
      icon: "icon-192.png",
      badge: "icon-192.png",
      tag: data.tag || "booknow",
      renotify: true,
      vibrate: [200, 100, 200],
      data: { url: data.url || "founder.html" }
    });
  })());
});

// Tapping an alert opens the app on the right page
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || "founder.html", self.registration.scope).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
      for (const c of list) {
        if (c.url.startsWith(self.registration.scope) && "focus" in c) return c.focus();
      }
      return self.clients.openWindow(target);
    })
  );
});
