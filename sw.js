const CACHE_NAME = 'estuda-mais-v1';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './manifest.json',
  './app.js',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (e) => {
  self.skipWaiting(); // Força o novo SW a ativar imediatamente
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
});

// Estratégia Network-First: Tenta a internet primeiro; se falhar (offline), usa a cache
self.addEventListener('fetch', (e) => {
  e.respondWith(
    fetch(e.request)
      .then((response) => {
        // Atualiza a cache com a versão mais recente
        const resClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(e.request, resClone));
        return response;
      })
      .catch(() => caches.match(e.request))
  );
});