/* Face Protocol — service worker (single-page routine).
   Network-first for the page, cache-first for assets. Scope-relative so it
   works under any GitHub Pages subpath. */
var VERSION = "fp-v6";
var SCOPE = self.registration.scope;

var PRECACHE = [
  "", "index.html", "progress.html",
  "assets/css/styles.css",
  "assets/js/main.js",
  "assets/js/routine.js",
  "assets/js/tracker.js",
  "assets/js/sw-register.js",
  "assets/fonts/fraunces-latin.woff2",
  "assets/fonts/inter-latin.woff2",
  "assets/img/icons/icon-192.png",
  "assets/img/icons/icon-512.png"
].map(function (p) { return new URL(p, SCOPE).toString(); });

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(VERSION).then(function (c) {
      return Promise.allSettled(PRECACHE.map(function (u) { return c.add(u); }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== VERSION; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var isHTML = req.mode === "navigate" || (req.headers.get("accept") || "").indexOf("text/html") !== -1;

  if (isHTML) {
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(VERSION).then(function (c) { c.put(req, copy); });
        return res;
      }).catch(function () {
        return caches.match(req).then(function (m) {
          return m || caches.match(new URL("index.html", SCOPE).toString());
        });
      })
    );
    return;
  }

  e.respondWith(
    caches.match(req).then(function (cached) {
      return cached || fetch(req).then(function (res) {
        if (res.ok && res.type === "basic") {
          var copy = res.clone();
          caches.open(VERSION).then(function (c) { c.put(req, copy); });
        }
        return res;
      });
    })
  );
});
