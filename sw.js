const CACHE = "form-app-v3"; // Increment version to force refresh
const ASSETS = [
  "./",
  "./index.html",
  "./app.js",
  "./mapping.json",
  "./template.pdf",
  "./manifest.json"
  // REMOVED: "./DejaVuSans.ttf"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
});

self.addEventListener("fetch", e => {
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request)));
});
