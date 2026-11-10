// v128 Help page (+ menu › Help): Get started lines, video (preload none, loads + seeks, Range requests pass the service worker), guide PDF link (200, new tab),
// nothing under help/ in the app cache. Own Range-capable static server (python http.server has no Range), service worker ON, 390x844, fake data only.
const { chromium } = require('playwright-core');
const assert = require('assert'), http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), OUT = '/workspace/golf-app/screenshots/', PORT = 8890, BASE = 'http://127.0.0.1:' + PORT + '/';
const ARC = require(ROOT + '/tests/fixtures/arcade-78.js');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.pdf': 'application/pdf', '.mp4': 'video/mp4' };
const log = [];
const srv = http.createServer((q, s) => {
  let p = decodeURIComponent(q.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html'; const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { s.writeHead(404); return s.end(); }
  const size = fs.statSync(f).size, type = TYPES[path.extname(f)] || 'application/octet-stream', m = /bytes=(\d*)-(\d*)/.exec(q.headers.range || '');
  if (p.startsWith('/help/')) log.push(q.headers.range ? 'RANGE ' + p + ' ' + q.headers.range : 'GET ' + p);
  if (m) { const a = m[1] ? +m[1] : size - +m[2], e = m[1] && m[2] ? Math.min(+m[2], size - 1) : size - 1;
    s.writeHead(206, { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${a}-${e}/${size}`, 'Content-Length': e - a + 1 }); return fs.createReadStream(f, { start: a, end: e }).pipe(s); }
  s.writeHead(200, { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': size }); fs.createReadStream(f).pipe(s);
}).listen(PORT, '127.0.0.1');
(async () => {
  const errors = [];
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await ctx.route(/^https:\/\/([a-z0-9-]+\.)?(google|googleapis|microsoft|live|microsoftonline|firebaseio)\.com\//, r => r.abort());
  const R = [Object.assign(ARC.round(), { id: 'a1', date: '2026-10-20T16:00:00.000Z', player: 'Alex' })];
  await ctx.addInitScript(rs => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('golfsg.rounds.v1', JSON.stringify(rs));
    localStorage.setItem('golfsg.player.v1', 'Alex'); localStorage.setItem('golfsg.nameasked.v1', '1'); } }, R);
  const P = await ctx.newPage(); P.setDefaultTimeout(30000); P.on('pageerror', e => errors.push(String(e))); P.on('console', m => m.type() === 'error' && errors.push('console: ' + m.text()));
  await P.goto(BASE + 'index.html'); await P.waitForSelector('#plusbtn');
  // let the service worker install + take control, then reload so it handles every request
  await P.evaluate(() => navigator.serviceWorker.ready); await P.reload(); await P.waitForSelector('#plusbtn');
  assert.ok(await P.evaluate(() => !!navigator.serviceWorker.controller), 'service worker controls the page');
  await P.click('#plusbtn'); await P.waitForSelector('#plusmenu');
  const menu = await P.$$eval('#plusmenu button', e => e.map(x => [x.textContent, x.dataset.act]));
  assert.deepStrictEqual(menu, [['New round', 'newform'], ['Rounds', 'history'], ['Stats', 'stats'], ['My Game', 'mygame'], ['Log practice', 'prlog'], ['Short game test', 'sgtopen'], ['My Bag', 'bag'], ['Settings', 'archive'], ['Help', 'help']] /* v140+: My Game and Log practice added */);
  await P.waitForTimeout(400); await P.screenshot({ path: OUT + 'help-plus-menu-v128.png' });
  await P.click('#plusmenu [data-act="help"]'); await P.waitForSelector('#helppage');
  assert.strictEqual(await P.textContent('.topbar .title b'), 'Help');
  assert.strictEqual(await P.$$eval('#hpstart li', e => e.length), 5);
  const V0 = await P.$eval('#hpvid', v => ({ pre: v.getAttribute('preload'), pi: v.hasAttribute('playsinline'), c: v.controls, rs: v.readyState, poster: v.poster }));
  assert.ok(V0.pre === 'none' && V0.pi && V0.c && V0.rs === 0, 'preload none, nothing loaded until tapped ' + JSON.stringify(V0));
  await P.waitForTimeout(800); await P.screenshot({ path: OUT + 'help-page-v128.png' });
  await P.screenshot({ path: OUT + 'help-page-full-v128.png', fullPage: true });
  // video loads + plays (through the SW: /help/ bypass)
  const V = await P.$eval('#hpvid', v => new Promise(res => { v.muted = true; v.addEventListener('loadedmetadata', () => { v.currentTime = 150; }, { once: true });
    v.addEventListener('seeked', () => res({ rs: v.readyState, d: v.duration, w: v.videoWidth, h: v.videoHeight, t: v.currentTime, err: v.error && v.error.code }), { once: true });
    v.addEventListener('error', () => res({ err: v.error && v.error.code }), { once: true }); v.load(); }));
  console.log('video', JSON.stringify(V)); assert.ok(V.rs >= 1 && V.d > 220 && V.d < 222 && V.w === 780 && !V.err, 'video loads + seeks');
  await P.$eval('#hpvid', v => { v.currentTime = 2; v.pause(); }); await P.waitForTimeout(600);
  await (await P.$('#hpvideo')).scrollIntoViewIfNeeded(); await P.waitForTimeout(300); await (await P.$('#hpvideo')).screenshot({ path: OUT + 'help-video-card-v128.png' });
  // PDF link
  const href = await P.$eval('#hppdf', a => ({ h: a.href, t: a.target })); assert.strictEqual(href.t, '_blank');
  const pdf = await P.evaluate(u => fetch(u).then(r => r.blob().then(b => ({ s: r.status, type: r.headers.get('content-type'), n: b.size }))), href.h);
  console.log('pdf', JSON.stringify(pdf)); assert.ok(pdf.s === 200 && pdf.type === 'application/pdf' && pdf.n === fs.statSync(ROOT + '/help/PinHigh-HowTo.pdf').size);
  const [pop] = await Promise.all([ctx.waitForEvent('page'), P.click('#hppdf')]); await pop.waitForLoadState().catch(() => {}); console.log('pdf tab opened', pop.url()); await pop.close();
  // nothing under help/ went into the app cache
  const cached = await P.evaluate(async () => { const out = []; for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) if (/\/help\//.test(r.url)) out.push(k + ' ' + r.url); return out; });
  assert.deepStrictEqual(cached, [], 'help files not cached');
  // back to Home
  await P.click('.topbar [data-act="home"]'); await P.waitForSelector('#home');
  console.log('server log (help/):\n  ' + log.join('\n  '));
  assert.deepStrictEqual(errors.filter(e => !/net::ERR_FAILED|Failed to load resource/.test(e)), [], 'no page errors: ' + errors.join(' | '));
  console.log('help-focused: OK'); await b.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
