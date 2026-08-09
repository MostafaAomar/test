const SHELL_CACHE = 'uniquiz-shell-v9';
const APP_SHELL = [
    './index.html',
    './offline.css?v=9',
    './style.css?v=9',
    './app.js?v=9',
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

async function cachedResponseChanged(cached, fresh) {
    if (!cached) return true;
    const cachedEtag = cached.headers.get('etag');
    const freshEtag = fresh.headers.get('etag');
    if (cachedEtag && freshEtag && cachedEtag === freshEtag) return false;

    const [cachedBytes, freshBytes] = await Promise.all([
        cached.clone().arrayBuffer(),
        fresh.clone().arrayBuffer()
    ]);
    if (cachedBytes.byteLength !== freshBytes.byteLength) return true;
    const cachedView = new Uint8Array(cachedBytes);
    const freshView = new Uint8Array(freshBytes);
    for (let index = 0; index < cachedView.length; index++) {
        if (cachedView[index] !== freshView[index]) return true;
    }
    return false;
}

async function refreshAppShellCache() {
    const cache = await caches.open(SHELL_CACHE);
    let changed = false;
    let refreshed = 0;

    for (const path of APP_SHELL) {
        try {
            const request = new Request(new URL(path, self.registration.scope).href, { cache: 'no-store' });
            const cached = await cache.match(request);
            const fresh = await fetch(request);
            if (!fresh || !fresh.ok) continue;
            if (await cachedResponseChanged(cached, fresh)) changed = true;
            await cache.put(request, fresh.clone());
            refreshed++;
        } catch (error) {
            console.warn(`Could not refresh ${path}:`, error);
        }
    }
    return { changed, refreshed };
}

async function notifyOpenClients(message) {
    const openClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    openClients.forEach(client => client.postMessage(message));
}

self.addEventListener('message', event => {
    if (event.data?.type === 'SKIP_WAITING') {
        self.skipWaiting();
        return;
    }
    if (event.data?.type === 'REFRESH_APP_SHELL') {
        event.waitUntil(
            refreshAppShellCache()
                .then(result => {
                    event.ports[0]?.postMessage({ ok: true, ...result });
                    if (result.changed) {
                        return notifyOpenClients({ type: 'APP_SHELL_REFRESHED', changed: true });
                    }
                })
                .catch(error => event.ports[0]?.postMessage({ ok: false, changed: false, message: error.message }))
        );
    }
});

self.addEventListener('periodicsync', event => {
    if (event.tag !== 'uniquiz-daily-update') return;
    event.waitUntil(
        refreshAppShellCache().then(async result => {
            await notifyOpenClients({ type: 'RUN_DAILY_CONTENT_UPDATE' });
            if (result.changed) {
                await notifyOpenClients({ type: 'APP_SHELL_REFRESHED', changed: true });
            }
        })
    );
});

self.addEventListener('fetch', event => {
    const request = event.request;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

    const decodedPath = decodeURIComponent(url.pathname);
    const isLiveContentRequest = decodedPath.endsWith('/content-manifest.json')
        || decodedPath.includes('/First Year/')
        || decodedPath.includes('/Second Year/')
        || decodedPath.includes('/Third Year/')
        || decodedPath.includes('/Fourth Year/');
    if (isLiveContentRequest) {
        event.respondWith(fetch(new Request(request, { cache: 'no-store' })));
        return;
    }

    if (request.mode === 'navigate') {
        event.respondWith(
            fetch(request)
                .then(response => {
                    if (response && response.ok) {
                        const copy = response.clone();
                        caches.open(SHELL_CACHE).then(cache => cache.put('./index.html', copy));
                    }
                    return response;
                })
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
