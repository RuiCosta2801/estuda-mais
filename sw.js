const CACHE_NAME = 'estuda-plus-cache';

const FICHEIROS_APP = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './manifest.json',
    './icon-192.png',
    './icon-512.png'
];

self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(FICHEIROS_APP);
        })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((nomesCaches) => {
            return Promise.all(
                nomesCaches
                    .filter((nome) => nome !== CACHE_NAME)
                    .map((nome) => caches.delete(nome))
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;

    event.respondWith(
        fetch(event.request, { cache: 'no-store' })
            .then((respostaRede) => {
                if (respostaRede && respostaRede.status === 200) {
                    const copiaResposta = respostaRede.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, copiaResposta);
                    });
                }
                return respostaRede;
            })
            .catch(() => {
                return caches.match(event.request);
            })
    );
});