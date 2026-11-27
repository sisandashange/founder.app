// BOOK.NOW Founder service worker: cache only the static dashboard shell.
// Live Supabase data is never cached.
const CACHE = "booknow-founder-v3";
const CORE_FILES = ["./", "./index.html", "./founder.html", "./manifest.webmanifest",
  "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png"];
const CORE_PATHS = new Set(CORE_FILES.map(path => new URL(path, self.registration.scope).pathname));

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(CORE_FILES.map(async path => {
      const response = await fetch(path, { cache: "reload" });
      if (!response.ok) throw new Error("Required offline asset unavailable: " + path);
      await cache.put(path, response);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith("booknow-founder-") && k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin
      || /admin/i.test(url.pathname) || !CORE_PATHS.has(url.pathname)) return;

  const cacheKey = new Request(url.origin + url.pathname, { method: "GET" });
  event.respondWith((async () => {
    let response;
    try {
      response = await fetch(req);
    } catch (_) {
      const cached = await caches.match(cacheKey);
      if (cached) return cached;
      if (req.mode === "navigate") {
        const shell = await caches.match(new URL("./founder.html", self.registration.scope).href);
        if (shell) return shell;
      }
      return new Response("You're offline. Reconnect to use BOOK.NOW.", {
        status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" }
      });
    }

    // A cache-write failure must never turn a successful network response into an offline error.
    if (response.ok) {
      try {
        const cache = await caches.open(CACHE);
        await cache.put(cacheKey, response.clone());
      } catch (cacheError) {
        console.warn("BOOK.NOW Founder offline cache update failed:", cacheError);
      }
    }
    return response;
  })());
});

// ---- Phone alerts sent by the server (they arrive even when the app is closed) ----
self.addEventListener("push", event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; }
  catch (e) { data = { title: "BOOK.NOW", body: event.data ? event.data.text() : "" }; }

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const mine = windows.filter(w => w.url.startsWith(self.registration.scope));
    // Open pages are told to refresh. If the shop app is open in front it shows its own banner, so skip a second alert.
    // Customer alerts (data.always) are always shown, because the customer page does not show a banner.
    mine.forEach(w => w.postMessage({ type: "push", kind: data.tag || "" }));
    if (!data.always && mine.some(w => w.visibilityState === "visible")) return;
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
