const SHELL_CACHE = 'uniquiz-shell-v3';
const APP_SHELL = [
    './index.html',
    './offline.css',
    './style.css',
    './app.js',
    './manifest.webmanifest',
    './icon.svg'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(SHELL_CACHE)
            .then(cache => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(key => key.startsWith('uniquiz-shell-') && key !== SHELL_CACHE)
                    .map(key => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    const request = event.request;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

    if (request.mode === 'navigate') {
        event.respondWith(
            caches.match('./index.html')
                .then(cached => cached || fetch(request))
                .catch(() => caches.match('./index.html'))
        );
        return;
    }

    event.respondWith(
        caches.match(request).then(cached => {
            if (cached) return cached;
            return fetch(request).then(response => {
                if (!response || !response.ok) return response;
                const copy = response.clone();
                caches.open(SHELL_CACHE).then(cache => cache.put(request, copy));
                return response;
            });
        })
    );
});
