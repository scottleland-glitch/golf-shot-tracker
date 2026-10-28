// Live sharing (v87): token, snapshot, publisher (debounce, offline queue + catch-up, backoff, stop = delete), viewer HTML,
// then phone-size browser flows with the network MOCKED (no real writes): owner "Share live" → share sheet/link card → live updates →
// offline note → catch-up → stop; viewer (?watch=) rendering, hole shots, birdie oriole, stopped banner, polling fallback, owner data untouched.
// REAL_DB=1 additionally runs one real round-trip against the Firebase database with a throwaway "selftest-…" id (write, read, delete).
const assert = require('assert'); const { chromium } = require('playwright-core'); const { spawn } = require('child_process');
const SG = require('../sg.js'); global.SG = SG; const L = require('../live.js');
const BASE = 'http://127.0.0.1:8807/', OUT = '/workspace/golf-app/screenshots/', DB = 'https://pin-high-live-default-rtdb.firebaseio.com';
const R = (dist, loc, dir, club) => Object.assign({ dist, loc, dir: dir || '', pen: false }, club ? { club } : {});
function makeRound() {
  const holes = Array.from({ length: 18 }, (_, i) => ({ par: [4, 3, 5, 4][i % 4], finished: false, rows: [R('', 'tee')] }));
  holes[0] = { par: 4, finished: true, pin: 'center', rows: [R(380, 'tee', '', 'Driver'), R(140, 'fairway', '', '8i'), R(30, 'green', 'left'), R(12, 'green', 'short'), R(2, 'holed', 'right')] }; // bogey, 3 putts
  holes[1] = { par: 3, finished: true, rows: [R(160, 'tee', '', '7i'), R(8, 'holed', 'short')] }; // birdie
  holes[2] = { par: 5, finished: true, rows: [R(510, 'tee', '', 'Driver'), R(240, 'rough', 'right', '5W'), R(90, 'fairway', '', '52'), R(30, 'bunker', 'short'), R(15, 'green', 'long'), R(3, 'holed', 'left')] }; // bogey
  holes[3] = { par: 4, finished: false, rows: [R(400, 'tee', '', 'Driver'), R(150, 'fairway', 'left')] }; // playing now
  return { v: 3, dv: 2, id: 'rlive', date: '2026-10-25T16:30:00.000Z', course: 'Haggin Oaks', tee: 'Sage', baseline: 'pga', player: 'Quincy', holes };
}
const noNullsInArrays = o => JSON.stringify(o, (k, v) => { if (Array.isArray(v)) { assert.ok(v.length > 0, 'no empty arrays'); v.forEach(x => assert.ok(x != null, 'no nulls in arrays')); } return v; });
// ---------- 1. token ----------
{ const seen = new Set(); for (let i = 0; i < 2000; i++) { const t = L.token(); assert.strictEqual(t.length, 32); assert.ok(/^[A-Za-z0-9]{32}$/.test(t)); seen.add(t); }
  assert.strictEqual(seen.size, 2000, 'tokens unique');
  let calls = 0; const fake = { getRandomValues: a => { calls++; for (let i = 0; i < a.length; i++) a[i] = (i * 37 + calls) % 256; return a; } };
  const t = L.token(fake); assert.ok(calls >= 1 && t.length === 32, 'uses crypto.getRandomValues');
  assert.throws(() => L.token({}), /secure random/, 'no weak fallback');
  assert.strictEqual(L.watchId('?watch=' + t), t); assert.strictEqual(L.watchId('?x=1&watch=short'), null, 'short ids rejected'); assert.strictEqual(L.watchId(''), null);
  assert.strictEqual(L.link(t), 'https://scottleland-glitch.github.io/golf-shot-tracker/?watch=' + t);
  assert.strictEqual(L.dbUrl(DB + '/', t), DB + '/live/' + t + '.json'); }
// ---------- 2. snapshot ----------
const RD = makeRound(), S1 = L.snapshot(RD, SG, { now: 1000 });
{ assert.strictEqual(S1.name, 'Quincy'); assert.strictEqual(S1.course, 'Haggin Oaks'); assert.strictEqual(S1.tee, 'Sage'); assert.strictEqual(S1.date, RD.date);
  assert.deepStrictEqual([S1.thru, S1.strokes, S1.par, S1.toPar, S1.cur, S1.fin, S1.at], [3, 13, 12, 1, 4, 0, 1000]);
  assert.deepStrictEqual(S1.h[0], { par: 4, sc: 5, putts: 3, gir: 1, fw: 1, shots: ['380|tee||Driver', '140|fairway||8i', '30|green|left', '12|green|short', '2|holed|right'] });
  assert.deepStrictEqual(S1.h[1], { par: 3, sc: 2, putts: 1, gir: 1, shots: ['160|tee||7i', '8|holed|short'] }, 'par 3: no fairway');
  assert.strictEqual(S1.h[2].sc, 6); assert.strictEqual(S1.h[2].fw, 0); assert.strictEqual(S1.h[2].gir, 0);
  assert.deepStrictEqual(S1.h[3], { par: 4, live: 2, shots: ['400|tee||Driver', '150|fairway|left'] }, 'hole in progress');
  assert.deepStrictEqual(S1.h[4], { par: 4 }, 'unplayed hole = par only'); assert.strictEqual(S1.h.length, 18);
  noNullsInArrays(S1); assert.ok(JSON.stringify(S1).length < 2500, 'compact: ' + JSON.stringify(S1).length + ' bytes');
  assert.ok(!('id' in S1) && !JSON.stringify(S1).includes('rlive'), 'no local ids');
  const all = makeRound(); all.holes = all.holes.map(() => ({ par: 4, finished: true, rows: [R(400, 'tee'), R(150, 'fairway'), R(10, 'green'), R(1, 'holed')] }));
  const SF = L.snapshot(all, SG); assert.strictEqual(SF.fin, 1, 'all 18 done = finished'); assert.strictEqual(SF.cur, 18); assert.strictEqual(SF.toPar, 0);
  assert.strictEqual(L.snapshot(RD, SG, { fin: 1 }).fin, 1); assert.strictEqual(L.sig(S1), L.sig(L.snapshot(RD, SG, { now: 5 })), 'signature ignores time');
  // Firebase may hand arrays back as objects
  const asObj = JSON.parse(JSON.stringify(S1)); asObj.h = Object.assign({}, asObj.h); asObj.h[0].shots = Object.assign({}, asObj.h[0].shots);
  assert.deepStrictEqual(L.norm(asObj).h[0].shots, S1.h[0].shots); }
// ---------- 3. publisher (fake clock, fake network, memory storage) ----------
function rig(o) {
  o = o || {}; const T = { now: 0, timers: [], id: 0 }, calls = [], mem = o.mem || {};
  const env = { online: true, fail: 0, round: o.round || makeRound() };
  const st = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); } };
  const fetch = (url, opt) => { calls.push({ url, method: opt.method, body: opt.body && JSON.parse(opt.body) });
    if (!env.online) return Promise.reject(new TypeError('Failed to fetch'));
    if (env.fail > 0) { env.fail--; return Promise.resolve({ ok: false, status: 503 }); } return Promise.resolve({ ok: true, status: 200 }); };
  const P = L.publisher({ base: DB, fetch, storage: st, key: 'k', online: () => env.online, now: () => T.now, build: rid => rid === 'rlive' ? L.snapshot(env.round, SG, { now: T.now }) : null,
    setTimeout: (fn, ms) => { const t = { id: ++T.id, at: T.now + ms, fn }; T.timers.push(t); return t.id; }, clearTimeout: id => { T.timers = T.timers.filter(t => t.id !== id); } });
  const tick = async ms => { const end = T.now + ms; for (;;) { await new Promise(r => setImmediate(r)); T.timers.sort((a, b) => a.at - b.at); const t = T.timers[0];
    if (!t || t.at > end) break; T.timers.shift(); T.now = t.at; t.fn(); } T.now = end; await new Promise(r => setImmediate(r)); await new Promise(r => setImmediate(r)); };
  return { P, T, calls, env, mem, tick, next: () => T.timers.slice().sort((a, b) => a.at - b.at)[0] };
}
(async () => {
  { const X = rig(), id = X.P.start('rlive'); assert.ok(L.validId(id)); assert.strictEqual(X.P.start('rlive'), id, 'one token per round');
    await X.tick(10); assert.strictEqual(X.calls.length, 1); assert.deepStrictEqual([X.calls[0].method, X.calls[0].url], ['PUT', DB + '/live/' + id + '.json']);
    assert.strictEqual(X.calls[0].body.name, 'Quincy'); assert.strictEqual(X.calls[0].body.toPar, 1); assert.strictEqual(X.P.info('rlive').link, L.link(id)); assert.strictEqual(X.P.info('rlive').waiting, false);
    X.P.touch(); await X.tick(3000); assert.strictEqual(X.calls.length, 1, 'unchanged round → no write');
    X.env.round.holes[3].rows.push(R(20, 'green', 'short')); X.P.touch(); await X.tick(500); X.env.round.holes[3].rows.push(R(2, 'holed', 'left')); X.P.touch(); await X.tick(1000);
    assert.strictEqual(X.calls.length, 1, 'debounced'); await X.tick(600); assert.strictEqual(X.calls.length, 2, 'one write for a burst of edits');
    assert.deepStrictEqual(X.calls[1].body.h[3].shots.slice(-1), ['2|holed|left']);
    // offline: nothing sent, note shown, only the LATEST snapshot goes out when signal returns
    X.env.online = false; X.env.round.holes[3].finished = true; X.P.touch(); await X.tick(1600);
    assert.strictEqual(X.calls.length, 2, 'no request while offline'); assert.strictEqual(X.P.info('rlive').waiting, true, 'waiting for signal');
    X.env.round.holes[4].rows = [R(170, 'tee', '', '6i')]; X.P.touch(); await X.tick(1600); assert.strictEqual(X.calls.length, 2);
    // a restart while offline keeps the queue
    const Y = rig({ mem: X.mem, round: X.env.round }); Y.env.online = false; assert.strictEqual(Y.P.pending(), 1, 'queue survives an app restart'); assert.strictEqual(Y.P.info('rlive').id, id);
    X.env.online = true; await X.P.flush(); await X.tick(1); assert.strictEqual(X.calls.length, 3, 'catch-up = one write'); const cu = X.calls[2].body;
    assert.deepStrictEqual([cu.thru, cu.h[3].sc, cu.h[4].shots], [4, 4, ['170|tee||6i']], 'latest snapshot only'); assert.strictEqual(X.P.info('rlive').waiting, false);
    // server errors: retry with backoff 2 s, 4 s, then success
    X.env.fail = 2; X.env.round.holes[4].rows.push(R(9, 'green')); X.P.touch(); await X.tick(1500); assert.strictEqual(X.calls.length, 4);
    assert.ok(X.P.retryScheduled() && X.next().at - X.T.now === 2000, 'retry in 2 s'); assert.strictEqual(X.P.info('rlive').waiting, true);
    await X.tick(2000); assert.strictEqual(X.calls.length, 5); assert.strictEqual(X.next().at - X.T.now, 4000, 'then 4 s');
    await X.tick(4000); assert.strictEqual(X.calls.length, 6); assert.strictEqual(X.P.pending(), 0); assert.strictEqual(X.P.info('rlive').waiting, false);
    // finish → fin flag; stop → DELETE, token forgotten; a new share gets a new token
    X.P.finish('rlive'); await X.tick(10); assert.strictEqual(X.calls[6].body.fin, 1);
    X.P.stop('rlive'); await X.tick(10); assert.deepStrictEqual([X.calls[7].method, X.calls[7].url], ['DELETE', DB + '/live/' + id + '.json']);
    assert.strictEqual(X.P.info('rlive').on, false); X.P.touch(); await X.tick(2000); assert.strictEqual(X.calls.length, 8, 'no writes after stop');
    const id2 = X.P.start('rlive'); assert.notStrictEqual(id2, id); }
  { const X = rig(), id = X.P.start('rlive'); X.env.online = false; await X.tick(10); X.P.stop('rlive'); await X.tick(10);
    assert.strictEqual(X.calls.length, 0); assert.deepStrictEqual(X.P.state().del, [id], 'stop while offline: delete queued'); assert.deepStrictEqual(Object.keys(X.P.state().q), [], 'snapshot dropped');
    X.env.online = true; await X.P.flush(); await X.tick(1); assert.deepStrictEqual(X.calls.map(c => c.method), ['DELETE']); assert.deepStrictEqual(X.P.state().del, []); }
  console.log('publisher OK');
  // ---------- 4. viewer HTML ----------
  { const h = L.viewerHTML(S1, { state: 'live', now: 1000 + 120000 });
    assert.ok(h.includes('<h1>Quincy</h1>') && h.includes('Haggin Oaks · Sage tees'), 'header'); assert.ok(/id="lvtopar" class="over">\+1</.test(h), 'score vs par');
    assert.ok(h.includes('Thru 3') && h.includes('Now on hole 4 · 2 shots so far') && h.includes('Updated 2 min ago'));
    assert.ok(/data-lh="1"[^]*?<i class="birdie">2<\/i>/.test(h) && /data-lh="0"[^]*?<i class="bogey">5<\/i>/.test(h) && /data-lh="2"[^]*?<i class="bogey">6<\/i>/.test(h), 'color-coded');
    assert.ok(/Out<\/span><span>36<\/span><span>13</.test(h), 'front-9 total (partial)'); assert.ok(!h.includes('lvbanner'), 'no banner while live');
    const o = L.viewerHTML(S1, { open: 0, now: 2000 }); assert.ok(o.includes('Hole 1 <small>Par 4</small>') && o.includes('5 · Bogey') && o.includes('Fairway ✓ · Green in regulation ✓ · 3 putts'));
    assert.ok(o.includes('Tee · 380 yd to the pin <small>Driver</small>') && o.includes('Green · 30 ft to the pin<em>ended short</em>') && o.includes('Green · 12 ft to the pin<em>ended right</em>') && o.includes('In the hole from 2 ft'), 'shot list');
    assert.ok(L.viewerHTML(null, { state: 'gone' }).includes('isn’t available'), 'no round'); assert.ok(L.viewerHTML(null, {}).includes('Loading'));
    assert.ok(L.viewerHTML(S1, { state: 'gone' }).includes('Sharing was stopped')); assert.ok(L.viewerHTML(Object.assign({}, S1, { fin: 1 }), {}).includes('Round finished'));
    const evil = Object.assign({}, S1, { name: '<img src=x onerror=alert(1)>' }); assert.ok(!L.viewerHTML(evil, {}).includes('<img src=x'), 'escaped');
    // streaming events + new birdies
    let c = L.applyEvent(null, 'put', { path: '/', data: S1 }); assert.strictEqual(c.thru, 3);
    c = L.applyEvent(c, 'put', { path: '/h/4', data: { par: 3, sc: 2 } }); assert.strictEqual(c.h[4].sc, 2); c = L.applyEvent(c, 'patch', { path: '/', data: { thru: 5 } }); assert.strictEqual(c.thru, 5);
    assert.deepStrictEqual(L.newBirdies(S1, c), [4]); assert.deepStrictEqual(L.newBirdies(c, c), []); assert.strictEqual(L.applyEvent(c, 'put', { path: '/', data: null }), null); }
  console.log('viewer HTML OK');
  // ---------- 5. browser ----------
  const srv = spawn('python3', ['-m', 'http.server', '8807', '--bind', '127.0.0.1'], { cwd: '/workspace/golf-app', stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1500)); const errors = [];
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  const reqs = []; let netDown = false;
  await ctx.route(/firebaseio\.com/, route => { const q = route.request(); if (netDown) return route.abort('internetdisconnected');
    reqs.push({ method: q.method(), url: q.url(), body: q.postData() && JSON.parse(q.postData()) });
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: q.postData() || 'null' }); });
  await ctx.addInitScript(() => { window.__shared = []; navigator.share = d => { window.__shared.push(d); return Promise.resolve(); }; });
  const page = await ctx.newPage(); page.setDefaultTimeout(20000); page.on('pageerror', e => errors.push(String(e))); page.on('dialog', d => d.accept());
  await page.goto(BASE + '?x=' + Date.now());
  await page.evaluate(r => { localStorage.clear(); localStorage.setItem('golfsg.player.v1', 'Quincy'); localStorage.setItem('golfsg.rounds.v1', JSON.stringify([r])); localStorage.setItem('golfsg.current.v1', r.id); }, makeRound());
  await page.reload(); await page.click('[data-act="resume"]'); await page.waitForSelector('[data-act="liveshare"]');
  assert.match(await page.textContent('.hc-head h2'), /Hole 4/); assert.strictEqual(reqs.length, 0, 'nothing sent before sharing');
  await page.screenshot({ path: OUT + 'live-share-button.png' });
  await page.click('[data-act="liveshare"]'); await page.waitForSelector('.livesheet');
  const shared = await page.evaluate(() => window.__shared); assert.strictEqual(shared.length, 1, 'share sheet opened');
  const tok = L.watchId(new URL(shared[0].url).search); assert.ok(tok && tok.length === 32, shared[0].url);
  assert.ok(shared[0].url.startsWith('https://scottleland-glitch.github.io/golf-shot-tracker/?watch='));
  assert.strictEqual(shared[0].text, 'Watch Quincy’s round live at Haggin Oaks – the scorecard updates hole by hole.');
  assert.strictEqual(await page.inputValue('#livelink'), shared[0].url);
  await page.waitForFunction(() => /Up to date/.test(document.querySelector('.livesheet .livenote').textContent));
  assert.strictEqual(reqs.length, 1); assert.deepStrictEqual([reqs[0].method, reqs[0].url], ['PUT', DB + '/live/' + tok + '.json']); assert.strictEqual(reqs[0].body.cur, 4);
  await page.screenshot({ path: OUT + 'live-share-sheet.png' });
  await page.click('.livesheet [data-act="liveclose"]'); assert.match(await page.textContent('#livebar'), /Sharing live/);
  await page.click('[data-act="livecard"]'); assert.strictEqual(await page.inputValue('#livelink'), shared[0].url, 'tap again re-shows the same link');
  await page.click('.livesheet [data-act="livesend"]'); assert.strictEqual((await page.evaluate(() => window.__shared)).length, 2); assert.strictEqual((await page.evaluate(() => window.__shared))[1].url, shared[0].url);
  await page.click('.livesheet [data-act="liveclose"]');
  // a shot typed → one update after the debounce
  await page.click('[data-act="addShot"]'); await page.fill('input[data-row="2"]', '18'); await page.selectOption('select[data-f="loc"][data-k="2"]', 'green');
  await page.waitForFunction(n => window.__reqN && 0, 0).catch(() => {}); await page.waitForTimeout(2200);
  const ups = reqs.filter(r => r.method === 'PUT'); assert.ok(ups.length >= 2 && ups.length <= 3, 'debounced updates: ' + ups.length);
  assert.deepStrictEqual(ups[ups.length - 1].body.h[3].shots.slice(-1), ['18|green']);
  // offline → note → catch up
  netDown = true; await ctx.setOffline(true); await page.click('[data-act="addShot"]'); await page.fill('input[data-row="3"]', '2'); await page.selectOption('select[data-f="loc"][data-k="3"]', 'holed');
  await page.waitForSelector('#livenote', { timeout: 6000 }); assert.match(await page.textContent('#livenote'), /Waiting for signal – will catch up/);
  const nBefore = reqs.length; netDown = false; await ctx.setOffline(false); await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.waitForFunction(() => !document.getElementById('livenote')); const last = reqs[reqs.length - 1];
  assert.ok(reqs.length > nBefore && last.body.h[3].shots.slice(-1)[0] === '2|holed', 'caught up');
  // finish round → fin flag sent
  await page.click('[data-act="finish"]'); await page.waitForTimeout(1800); assert.strictEqual(reqs[reqs.length - 1].body.h[3].sc, 4);
  // stop sharing → DELETE
  await page.click('[data-act="livecard"]'); await page.click('[data-act="livestop"]'); await page.waitForSelector('[data-act="liveshare"]');
  await page.waitForTimeout(300); assert.deepStrictEqual([reqs[reqs.length - 1].method, reqs[reqs.length - 1].url], ['DELETE', DB + '/live/' + tok + '.json']);
  const nStop = reqs.length; await page.click('[data-act="reopen"]').catch(() => {}); await page.waitForTimeout(1800); assert.strictEqual(reqs.length, nStop, 'no writes after stopping');
  assert.ok(!(await page.evaluate(() => localStorage.getItem('golfsg.rounds.v1'))).includes(tok), 'token is not stored in the round (not in backups)');
  console.log('owner flow OK');
  // ---------- viewer page (fake EventSource driven by the test) ----------
  const V = await ctx.newPage(); V.setDefaultTimeout(20000); V.on('pageerror', e => errors.push(String(e)));
  await V.addInitScript(() => { window.__es = []; window.EventSource = class { constructor(u) { this.url = u; this.readyState = 1; this.l = {}; window.__es.push(this); }
    addEventListener(t, f) { this.l[t] = f; } close() { this.readyState = 2; } emit(t, d) { this.l[t]({ data: JSON.stringify(d) }); } }; });
  const ownerBefore = await page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort().map(k => [k, localStorage.getItem(k)])));
  const VID = 'T' + L.token().slice(1);
  await V.goto(BASE + '?watch=' + VID); await V.waitForSelector('#lvpage'); assert.match(await V.textContent('#lvpage'), /Loading/);
  assert.strictEqual(await V.evaluate(() => window.__es[0].url), DB + '/live/' + VID + '.json');
  assert.strictEqual(await V.$('#home'), null, "owner's own screens not shown");
  const now = Date.now(), SV = L.snapshot(makeRound(), SG, { now: now - 60000 });
  await V.evaluate(s => window.__es[0].emit('put', { path: '/', data: s }), SV); await V.waitForSelector('#lvcard');
  assert.strictEqual(await V.textContent('#lvtopar'), '+1'); assert.strictEqual(await V.textContent('#lvthru'), 'Thru 3'); assert.match(await V.textContent('#lvupd'), /Updated 1 min ago/);
  assert.strictEqual(await V.$('#lvcele'), null, 'no celebration for birdies already on the card');
  await V.screenshot({ path: OUT + 'live-viewer.png', fullPage: true });
  await V.click('[data-lh="2"]'); await V.waitForSelector('#lvshots'); assert.match(await V.textContent('#lvshots'), /Hole 3.*6 · Bogey/);
  assert.strictEqual(await V.locator('#lvshots li').count(), 6); await V.click('[data-lh="2"]'); assert.strictEqual(await V.$('#lvshots'), null, 'tap again closes');
  // a new birdie arrives → oriole
  const R2 = makeRound(); R2.holes[3].rows.push(R(6, 'holed', 'short')); R2.holes[3].finished = true; const SB = L.snapshot(R2, SG, { now });
  await V.evaluate(s => window.__es[0].emit('put', { path: '/', data: s }), SB); await V.waitForSelector('#lvcele');
  assert.match(await V.textContent('#lvcele'), /Birdie on hole 4!Nice one, Quincy!/); assert.strictEqual(await V.textContent('#lvtopar'), 'E');
  assert.ok(await V.$eval('#lvcele img', i => i.complete && i.naturalWidth > 0 && /oriole\.webp$/.test(i.src)), 'oriole image');
  await V.waitForTimeout(600); await V.click('[data-lh="3"]'); await V.screenshot({ path: OUT + 'live-viewer-birdie.png' });
  await V.evaluate(() => window.__es[0].emit('put', { path: '/fin', data: 1 })); assert.match(await V.textContent('#lvbanner'), /Round finished/);
  await V.evaluate(() => window.__es[0].emit('put', { path: '/', data: null })); assert.match(await V.textContent('#lvbanner'), /Sharing was stopped/); assert.strictEqual(await V.textContent('#lvtopar'), 'E', 'last score kept');
  const ownerAfter = await page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort().map(k => [k, localStorage.getItem(k)])));
  assert.strictEqual(ownerAfter, ownerBefore, "viewer didn't touch this phone's data");
  assert.strictEqual(reqs.filter(r => r.method !== 'GET' && r.url.includes(VID)).length, 0, 'viewer never writes');
  // polling fallback (no EventSource)
  const P2 = await ctx.newPage(); await P2.addInitScript(() => { delete window.EventSource; });
  await ctx.route(/firebaseio\.com\/live\/Poll/, route => route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(SV) }));
  await P2.goto(BASE + '?watch=Poll' + L.token().slice(4)); await P2.waitForSelector('#lvcard'); assert.strictEqual(await P2.textContent('#lvtopar'), '+1', 'polling works');
  await P2.goto(BASE + '?watch=short'); await P2.waitForSelector('#app *'); assert.strictEqual(await P2.$('#lvpage'), null, 'bad link → normal app');
  console.log('viewer OK');
  // ---------- 6. one real round-trip (REAL_DB=1) ----------
  if (process.env.REAL_DB) {
    const real = await b.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, serviceWorkers: 'block' });
    const W = await real.newPage(), id = 'selftest-' + L.token(); W.on('pageerror', e => errors.push(String(e))); console.log('real self-test id', id);
    const cleanup = () => fetch(DB + '/live/' + id + '.json', { method: 'DELETE' }).catch(() => {}); try {
    await W.goto(BASE + '?watch=' + id); await W.waitForSelector('#lvpage'); await W.waitForFunction(() => /isn’t available/.test(document.body.textContent), null, { timeout: 15000 });
    const O = await real.newPage(); await O.goto(BASE + '?x=' + Date.now());
    const put = await O.evaluate(async a => { const P = LIVE.publisher({ base: a.db, fetch: (u, o) => fetch(u, o), storage: { getItem: () => null, setItem: () => {} }, build: () => a.s, debounceMs: 0 });
      // use the self-test id instead of a random token
      P.state().rounds.r = { id: a.id, on: true }; P.collect(); for (let i = 0; i < 100 && P.pending(); i++) await new Promise(r => setTimeout(r, 100)); return !P.pending() && P.state().lastOk > 0 && !P.state().err; }, { db: DB, id, s: Object.assign(L.snapshot(makeRound(), SG), { name: 'Self-test' }) });
    assert.ok(put, 'real write ok');
    await W.waitForFunction(() => document.querySelector('#lvpage h1') && document.querySelector('#lvpage h1').textContent === 'Self-test', null, { timeout: 20000 });
    const back = await (await fetch(DB + '/live/' + id + '.json')).json(); assert.strictEqual(back.name, 'Self-test'); assert.strictEqual(L.norm(back).h[0].shots.length, 5);
    const list = await fetch(DB + '/live.json?shallow=true'); assert.strictEqual(list.status, 401, 'nobody can list the shared rounds');
    const other = await fetch(DB + '/selftest.json', { method: 'PUT', body: '1' }); assert.strictEqual(other.status, 401, 'writes outside /live are refused');
    const del = await fetch(DB + '/live/' + id + '.json', { method: 'DELETE' }); assert.ok(del.ok);
    await W.waitForFunction(() => /Sharing was stopped/.test(document.body.textContent), null, { timeout: 20000 });
    assert.strictEqual(await (await fetch(DB + '/live/' + id + '.json')).text(), 'null', 'deleted');
    console.log('REAL DB OK: write → live viewer (EventSource) → read back → delete → viewer shows stopped; list + outside writes refused (401). id', id);
    } finally { await cleanup(); }
    await real.close();
  }
  assert.deepStrictEqual(errors, []); await b.close(); srv.kill(); console.log('live-share-focused: ALL OK');
})().catch(e => { console.error(e); process.exit(1); });
