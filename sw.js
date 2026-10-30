// Offline support: cache the whole app on install, serve cache-first.
// v100: Best vs worst rounds – "Where the strokes go" table split into Best / Worst column groups (Avg ft, GIR, SG) + Gap.
// v99: Change player – move saved rounds to another player (History select mode + round page), Drive files follow.
// v98: Google Drive automatic backup + restore (gdrive.js), one folder per player, multi-phone merge.
// v97: Send round (file or PINHIGH1: code) + Add a round in History (share.js).
// v96: Round stats – Score/To par/Yards/Putts box on top, Quick view, collapsible stat tiles, smaller legend.
const CACHE = 'golf-sg-v100';
const ASSETS = ['./', './img/home-bg.webp', './img/oriole.webp', './index.html', './styles.css', './sg.js', './birdie.js', './voice.js', './courses.js', './bag.js', './wedges.js', './live.js', './share.js', './gdrive.js', './app.js', './config.js', './onedrive.js', './vendor/msal-browser.min.js', './vendor/jspdf.umd.min.js',
  './manifest.webmanifest', './icons/apple-touch-icon.png', './icons/icon-192.png',
  './icons/icon-512.png', './icons/icon-512-maskable.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
// v95: scoring-page wedge dropdown = whole carry ladder for shots ≤100 yd, no preselect.
// v94: Wedges simple view + Edit button; wedge ladder dropdown on the scoring page for 40–110 yd shots.
// v93: Profile (+ menu) with My Bag and a Wedges chart (wedges.js).
// v92: My Bag (bag.js) – clubs, carries, elevation / temperature estimates.
// v90: "Hole out" box keeps the lie of the shot that went in.
// v89: the scorecard photo scanner is gone – this also deletes its old OCR cache ('pinhigh-ocr-v1') along with older app caches.
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // Microsoft sign-in / Graph and the live-sharing database (firebaseio.com): always straight to the network, never cached
  // A live link (?watch=…) and the files it loads come fresh from the network while online, so family always get the current viewer
  // (even if their installed app is an older version); offline they fall back to the cache.
  if ((e.request.mode === 'navigate' && /[?&]watch=/.test(url.search)) || /[?&]watch=/.test(e.request.referrer || '')) {
    e.respondWith(fetch(e.request, { cache: 'no-store' }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(hit => hit || caches.match('./index.html'))));
    return;
  }
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
