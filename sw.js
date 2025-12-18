/* sw.js */
const CACHE_NAME = "form-app-v10"; // Incremented version

const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  // JS
  "./js/main.js",
  "./js/auth.js",
  "./js/ui.js",
  "./js/pdf-generator.js",
  // Assets
  "./assets/pdf/template.pdf",
  "./assets/fonts/DejaVuSans.ttf",
  "./assets/mappings/mapping_1.json",
  "./assets/mappings/mapping_2.json",
  "./assets/mappings/mapping_3.json",
  "./assets/mappings/mapping_minor.json",
  "./assets/icons/icon-192x192.png",
  "./assets/icons/icon-512x512.png",
  // External
  "https://unpkg.com/@supabase/supabase-js@2/dist/umd/supabase.js",
  "https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js",
  "https://unpkg.com/@pdf-lib/fontkit@1.1.1/dist/fontkit.umd.min.js"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener("fetch", (e) => {
  e.respondWith(
    caches.match(e.request).then((response) => response || fetch(e.request))
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.map((key) => {
        if (key !== CACHE_NAME) return caches.delete(key);
      })
    ))
  );
});