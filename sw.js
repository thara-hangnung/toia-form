const CACHE = "form-app-v1";
const ASSETS = [
  "./",
  "./index.html",
  "./app.js",
  "./pdf-lib.min.js",
  "./mapping.json",
  "./template.pdf",
  "./DejaVuSans.ttf",
  "./manifest.json"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
});

self.addEventListener("fetch", e => {
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
