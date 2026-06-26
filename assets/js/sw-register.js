/* Register the service worker (relative path → works under any GitHub Pages subpath). */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", function () {
    navigator.serviceWorker.register("sw.js").catch(function () { /* offline support is optional */ });
  });
}
