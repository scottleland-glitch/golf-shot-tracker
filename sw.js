// Offline support: cache the whole app on install, serve cache-first.
const CACHE = 'golf-sg-v33';
const ASSETS = ['./', './index.html', './styles.css', './sg.js', './app.js', './config.js', './onedrive.js', './vendor/msal-browser.min.js', './vendor/jspdf.umd.min.js',
  './manifest.webmanifest', './icons/apple-touch-icon.png', './icons/icon-192.png',
  './icons/icon-512.png', './icons/icon-512-maskable.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // Microsoft sign-in / Graph: always straight to the network
  // config.js (OneDrive client ID) is network-first so editing it takes effect without a new cache version.
  if (url.pathname.endsWith('/config.js')) {
    e.respondWith(fetch(e.request).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put('./config.js', copy)); return res; })
      .catch(() => caches.match('./config.js')));
    return;
  }
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request).then(res => {
    if (res.ok && new URL(e.request.url).origin === location.origin) {
      const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy));
    }
    return res;
  }).catch(() => caches.match('./index.html'))));
});
