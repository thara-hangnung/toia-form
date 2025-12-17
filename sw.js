/* sw.js */
// 1. Increment the version to force the browser to update the cache
const CACHE_NAME = "form-app-v9"; 

const ASSETS = [
  "./",
  "./index.html",
  "./main.js",
  "./auth.js",
  "./ui.js",
  "./pdf-generator.js",
  "./template.pdf",
  "./DejaVuSans.ttf",
  "./mapping_1.json",
  "./mapping_2.json",
  "./mapping_3.json",
  "./mapping_minor.json",
  "./manifest.json",
  // 2. ADD THESE TWO LINES (Must match your actual filenames)
  "./icon-192x192.png",
  "./icon-512x512.png",
  // -------------------------------------------------------
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
