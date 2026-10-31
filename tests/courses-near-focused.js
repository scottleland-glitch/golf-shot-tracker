// v113: "📍 Courses near me" – one location reading (or name search) → the OpenGolfAPI finder list (downloaded once, own cache)
// → matched to a GolfCore scorecard → saved as an ordinary course with tee ratings. Location, the list and GolfCore are all mocked;
// nothing outside localhost is called (port 8850 = an origin the relay allows). iPhone 390x844 @3x. Run: node tests/courses-near-focused.js
const { chromium } = require('playwright-core'); const assert = require('assert'); const { spawn } = require('child_process'); const fs = require('fs');
const N = require('../near.js'), C = require('../courses.js');
const ROOT = __dirname + '/../', OUT = '/workspace/golf-app/screenshots/', PORT = 8850, BASE = 'http://localhost:' + PORT + '/';
const FX = ROOT + 'tests/fixtures/', LIST = JSON.parse(fs.readFileSync(FX + 'near-list.json', 'utf8'));
const PEB = JSON.parse(fs.readFileSync(FX + 'golfcore-pebble.json', 'utf8')), DP = JSON.parse(fs.readFileSync(FX + 'golfcore-desplaines.json', 'utf8'));
const ok = m => console.log('  ✓ ' + m), HOME = { lat: 36.5686, lng: -121.9497 }; // Pebble Beach area
// ---- 1. pure helpers (near.js) ----
{
  const R = LIST.courses;
  assert.ok(Math.abs(N.miles(36.5686, -121.9497, 42.0583, -87.8861) - 1835) < 25, 'haversine miles');
  assert.strictEqual(N.fmtMi(0.42), '0.4 mi'); assert.strictEqual(N.fmtMi(12.6), '13 mi');
  const near = N.nearest(R, HOME.lat, HOME.lng, 5); assert.strictEqual(near.length, 5); assert.ok(near.every((x, k) => !k || x.mi >= near[k - 1].mi), 'nearest first');
  assert.strictEqual(R[near[0].i][0], 'The Hay');
  assert.deepStrictEqual(N.search(R, 'des plaines').map(x => R[x.i][0]), ['Golf Center Des Plaines'], 'search by town');
  assert.strictEqual(R[N.search(R, 'pebble', HOME.lat, HOME.lng)[0].i][0], 'Pebble Beach Golf Links', 'search by name');
  assert.strictEqual(N.search(R, 'zzzz').length, 0);
  const g = (slug, name, lat, lng) => ({ slug, name, lat, lng, city: 'Pebble Beach' });
  const row = R.find(r => r[0] === 'Pebble Beach Golf Links'), bch = R.find(r => r[0] === 'Pebble Bch Links');
  const cands = [g('pebble-beach', 'Pebble Beach Golf Links', PEB.lat, PEB.lng), g('poppy-hills', 'Poppy Hills GC', 36.582, -121.94), g('spyglass', 'Spyglass Hill Golf Course', 36.585, -121.95)];
  let M = N.match(row, cands); assert.ok(M.close && M.best.g.slug === 'pebble-beach', 'same name nearby → used without asking');
  M = N.match(bch, cands); assert.ok(!M.close && M.best.g.slug === 'pebble-beach', 'different spelling → asks first');
  M = N.match(row, [g('pebble-beach', 'Pebble Beach Golf Links', 36.80, -121.93)]); assert.ok(!M.close, 'same name but 16 mi away → asks');
  M = N.match(row, [g('a', 'Pebble Beach Golf Links', PEB.lat, PEB.lng), g('b', 'Pebble Beach Golf Links', PEB.lat + .001, PEB.lng)]); assert.ok(!M.close, 'two equal matches → asks');
  assert.strictEqual(N.match(row, []).best, null);
  // conversion keeps par, stroke index, every tee's yards and rating/slope
  const c = C.clean(N.fromGolfCore(PEB, 0, row));
  assert.strictEqual(c.id, 'gc-pebble-beach'); assert.strictEqual(c.src, 'golfcore'); assert.strictEqual(c.gcId, 'pebble-beach'); assert.match(c.gcUrl, /golfcore\.org\/courses\/pebble-beach/);
  assert.strictEqual(c.holes, 18); assert.strictEqual(C.sum(c.pars), 72); assert.strictEqual(c.hcp.length, 18); assert.strictEqual(c.ogKey, N.key(row));
  const blue = c.tees.find(t => t.name === 'Blue'); assert.strictEqual(C.teeTotal(blue), 6802); assert.strictEqual(N.rtText(blue), '74.9/144'); assert.strictEqual(N.gaps(c, 'Blue'), 0);
  assert.strictEqual(c.tees.length, 8);
  const d = C.clean(N.fromGolfCore(DP, 0, null)); assert.strictEqual(d.holes, 9); assert.strictEqual(N.gaps(d, 'White'), 9, 'missing yardages counted'); assert.strictEqual(d.tees[0].total, 2204);
  assert.ok(d.pars.slice(9).every(p => p == null), 'holes not on the card stay blank');
  const re = C.clean(JSON.parse(JSON.stringify(Object.assign(c, { edited: true })))); assert.deepStrictEqual([re.src, re.gcId, re.edited, re.tees.map(t => t.rt)], ['golfcore', 'pebble-beach', true, c.tees.map(t => t.rt)], 'save/restore keeps import details');
  assert.deepStrictEqual(C.migrate([re]).courses[0].tees[0].rt, c.tees[0].rt);
  const TC = C.TEE_COLORS, tc = n => C.teeColors(n);
  assert.deepStrictEqual(tc('Blue'), [TC.blue]); assert.deepStrictEqual(tc('Blue/White'), [TC.blue, TC.white]); assert.deepStrictEqual(tc('Gold/White Combo'), [TC.gold, TC.white]);
  assert.deepStrictEqual(tc("Red (Women's)"), [TC.red]); assert.deepStrictEqual(tc('WHITE 2017-Female'), [TC.white]); assert.deepStrictEqual(tc("Men's Black"), [TC.black]);
  assert.deepStrictEqual(tc('Grey'), [TC.grey]); assert.deepStrictEqual(tc('yellow'), [TC.yellow]); assert.deepStrictEqual(tc('Red/White/Blue'), [TC.red, TC.white], 'two colours at most');
  for (const n of ['1 feather', '2 feather', 'Championship', 'Forward', 'Main tees', 'Redwood', '']) assert.deepStrictEqual(tc(n), [], n + ' → plain circle');
  ok('near.js: distance, nearest, search, matching, GolfCore conversion, gaps; clean keeps import details; tee colour words (combos, Men\'s/Women\'s, none)');
}
// ---- 2. files ----
{
  const sw = fs.readFileSync(ROOT + 'sw.js', 'utf8'), cfg = fs.readFileSync(ROOT + 'config.js', 'utf8');
  assert.ok(sw.includes("'golf-sg-v113'") && sw.includes("'./near.js'") && /pinhigh-courselist-/.test(sw) && /\/data\//.test(sw));
  assert.match(cfg, /GOLFCORE_BASE:\s*'https:\/\/pinhigh-golfcore\.pinhigh\.workers\.dev\/v1'/); assert.ok(!/GOLFCORE_KEY|gc_live_/.test(cfg + fs.readFileSync(ROOT + 'app.js', 'utf8')), 'no GolfCore key anywhere in the app');
  const big = JSON.parse(fs.readFileSync(ROOT + 'data/us-courses.json', 'utf8'));
  assert.ok(big.courses.length > 14000 && /OpenGolfAPI/.test(big.source) && /ODbL/.test(big.source)); assert.deepStrictEqual(big.fields, LIST.fields);
  assert.ok(!big.courses.some(r => /[a-z]tm$/.test(r[0])), 'no run-together tm');
  ok('sw v113 keeps the list cache and skips /data/; config points at the relay, no key in the app; finder list ' + big.courses.length + ' courses');
}
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1500)); const errors = [];
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  try {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, geolocation: { latitude: HOME.lat, longitude: HOME.lng, accuracy: 1500 }, permissions: ['geolocation'] });
    const T = { list: 0, gc: [], gcMode: 'ok', outside: [] };
    await ctx.route('**/*', r => { const u = r.request().url();
      if (u.startsWith(BASE + 'data/us-courses.json')) { T.list++; return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(LIST) }); }
      if (u.startsWith(BASE)) return r.continue(); T.outside.push(u); return r.abort(); });
    await ctx.route('https://pinhigh-golfcore.pinhigh.workers.dev/**', r => { const u = new URL(r.request().url()); T.gc.push(u.pathname + u.search); if (r.request().headers().authorization) T.auth = true;
      if (T.gcMode === 'offline') return r.abort('internetdisconnected');
      if (T.gcMode === '429') return r.fulfill({ status: 429, contentType: 'application/json', body: '{"error":"rate_limited"}' });
      const J = o => r.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': 'http://localhost:' + PORT }, body: JSON.stringify(o) });
      if (u.pathname === '/v1/courses') { const [la, ln] = u.searchParams.get('near').split(',').map(Number);
        const all = [PEB, DP, { slug: 'poppy-hills', name: 'Poppy Hills GC', city: 'Pebble Beach', lat: 36.582, lng: -121.94 }, { slug: 'spyglass-hill', name: 'Spyglass Hill Golf Course', city: 'Pebble Beach', lat: 36.585, lng: -121.95 }]
          .map(x => ({ slug: x.slug, name: x.name, city: x.city, region: x.region, country: 'US', lat: x.lat, lng: x.lng, url: x.url, miles: N.miles(la, ln, x.lat, x.lng) })).filter(x => x.miles <= 3);
        return J({ total: all.length, count: all.length, offset: 0, courses: all }); }
      if (u.pathname === '/v1/courses/pebble-beach') return J(PEB); if (u.pathname === '/v1/courses/golf-center-des-plaines') return J(DP);
      return r.fulfill({ status: 404, body: '{}' }); });
    await ctx.addInitScript(() => { const real = navigator.geolocation; // localStorage 't.geo': real (Playwright location) | deny | hang | none
      Object.defineProperty(Navigator.prototype, 'geolocation', { configurable: true, get() { const m = localStorage.getItem('t.geo') || 'real';
        if (m === 'none') return undefined;
        return { getCurrentPosition(okf, bad, opt) { window.__geoOpt = opt; window.__geoCalls = (window.__geoCalls || 0) + 1;
          if (m === 'deny') return setTimeout(() => bad({ code: 1, message: 'denied' }), 30); if (m === 'hang') return; return real.getCurrentPosition(okf, bad, opt); } }; } }); });
    const page = await ctx.newPage(); page.setDefaultTimeout(20000);
    page.on('pageerror', e => errors.push(String(e))); page.on('console', m => m.type() === 'error' && !/favicon|ERR_INTERNET_DISCONNECTED|Failed to load resource|Failed to fetch/.test(m.text()) && errors.push(m.text()));
    const shot = async name => { await page.evaluate(() => { const t = document.getElementById('toast'); if (t) t.className = ''; }); await page.waitForTimeout(350); await page.screenshot({ path: OUT + name + '.png' }); };
    const store = () => page.evaluate(() => JSON.parse(localStorage.getItem('golfsg.courses.v1') || '[]'));
    const openNew = async () => { await page.click('#plusbtn'); await page.click('[data-act="newform"]'); await page.waitForSelector('#nearbtn'); };
    const light = async sel => { const w = await page.$eval(sel, e => [+getComputedStyle(e).fontWeight, parseFloat(getComputedStyle(e).fontSize)]); assert.ok(w[0] <= 400 && w[1] <= 16.5, sel + ' light/small ' + w); };
    await page.goto(BASE + '?x=' + Date.now());
    await page.evaluate(() => { localStorage.clear(); localStorage.setItem('golfsg.player.v1', 'Scott'); localStorage.setItem('golfsg.nameasked.v1', '1'); });
    await page.reload(); await page.waitForSelector('#home'); await page.evaluate(() => navigator.serviceWorker && navigator.serviceWorker.ready);
    // ---- 3. button + the one-line explanation before any location prompt
    await openNew(); assert.strictEqual((await page.textContent('#nearbtn')).trim(), '📍 Courses near me'); await light('#nearbtn'); await shot('courses-near-picker');
    await page.click('#nearbtn'); await page.waitForSelector('#nearwhy');
    assert.strictEqual(await page.textContent('#nearwhy'), 'Pin High uses your location once to find nearby courses. It isn\'t saved or sent anywhere.');
    assert.strictEqual(await page.evaluate(() => window.__geoCalls || 0), 0, 'no location asked yet'); assert.strictEqual(T.list, 0, 'list not downloaded yet'); await light('#nearwhy');
    await shot('courses-near-permission'); ok('button + plain explanation shown first; nothing asked or downloaded yet');
    // ---- 4. nearest 5, show more, search
    await page.click('[data-act="neargo"]'); await page.waitForSelector('#nearlist');
    const opt = await page.evaluate(() => window.__geoOpt); assert.deepStrictEqual([opt.enableHighAccuracy, opt.timeout], [false, 10000], 'approximate, 10 s');
    let rows = await page.$$eval('#nearlist .nearopt', e => e.map(x => x.querySelector('b').textContent + x.querySelector('small').textContent + ' · ' + x.querySelector('.nmi').textContent));
    assert.strictEqual(rows.length, 5); assert.strictEqual(rows[0], 'The Hay · Pebble Beach, CA · 9 holes · 0.2 mi'); assert.strictEqual(rows[3], 'Pebble Beach Golf Links · Pebble Beach, CA · 18 holes · 1.2 mi');
    await light('#nearlist .nearopt b'); await light('#nearlist .nearopt small');
    await page.click('[data-act="nearmore"]'); assert.strictEqual(await page.$$eval('#nearlist .nearopt', e => e.length), 10);
    const G = await page.$$eval('#nearlist .nearopt', e => e.map(x => { const r = x.getBoundingClientRect(), b = x.querySelector('b'), d = x.querySelector('.nmi').getBoundingClientRect();
      return { h: r.height, bottom: r.bottom, bh: b.getBoundingClientRect().height, dRight: r.right - d.right, wrapped: b.scrollWidth > b.clientWidth + 1 }; }));
    assert.ok(G.every(g => g.h <= 44 && g.bh <= 22), 'one line per row ' + JSON.stringify(G[0]));
    assert.ok(G.filter(g => g.bottom <= 844).length >= 8, 'at least 8 rows on screen at once'); assert.ok(G.every(g => g.dRight <= 14), 'distance at the right edge');
    await shot('courses-near-list');
    await page.fill('#nearq', 'des pla'); await page.waitForSelector('#nearres .nearopt'); assert.match(await page.textContent('#nearres'), /Golf Center Des Plaines.*1835 mi|Golf Center Des Plaines.*18\d\d mi/);
    assert.strictEqual(await page.evaluate(() => document.activeElement.id), 'nearq', 'keyboard stays up while typing');
    await page.fill('#nearq', 'qqqq'); await page.waitForSelector('p#nearres'); await page.fill('#nearq', '');
    assert.strictEqual(T.list, 1); assert.deepStrictEqual(await page.evaluate(async () => (await caches.keys()).filter(k => /courselist/.test(k))), ['pinhigh-courselist-v1']);
    ok('nearest 5 with distance + holes, Show more, search by name or town; list downloaded once into its own cache');
    // ---- 5. pick Pebble → close match → imported with tee ratings
    await page.click('#nearlist .nearopt:nth-child(4)'); await page.waitForSelector('#ntees');
    assert.deepStrictEqual(T.gc, ['/v1/courses?near=36.5607,-121.9296&radius=3&limit=10', '/v1/courses/pebble-beach'], 'two lookups');
    assert.strictEqual((await page.textContent('#crspicked')).trim(), 'Pebble Beach Golf Links');
    const chips = await page.$$eval('#ntees .ntee:not(.naddtee)', e => e.map(x => x.textContent.replace(/\s+/g, ' ').trim()));
    assert.strictEqual(chips.length, 8); assert.ok(chips.some(t => /Blue.*6,?802.*74\.9\/144/.test(t)), chips.join(' / '));
    assert.strictEqual(await page.$('#nmiss'), null, 'complete card: no missing note');
    assert.match(await page.textContent('#gccredit'), /Course data: GolfCore/); assert.strictEqual(await page.getAttribute('#gccredit a', 'href'), 'https://www.golfcore.org/courses/pebble-beach/');
    let S = await store(); const peb = S.find(c => c.id === 'gc-pebble-beach'); assert.ok(peb && peb.src === 'golfcore' && peb.gcId === 'pebble-beach' && peb.tees[0].rt.length);
    await light('#gccredit'); await shot('courses-near-tees');
    await page.click('#ntees [data-v="Blue"]'); await page.click('[data-act="new"]'); await page.waitForSelector('.holecard');
    const rd = await page.evaluate(() => JSON.parse(localStorage.getItem('golfsg.rounds.v1'))[0]);
    assert.deepStrictEqual([rd.course, rd.courseId, rd.tee, rd.holes[0].rows[0].dist, rd.holes[0].par, rd.holes[6].par], ['Pebble Beach Golf Links', 'gc-pebble-beach', 'Blue', 378, 4, 3]);
    ok('Pebble matched (same name, 1.3 mi), saved with src golfcore + 8 tees + ratings; credit links to its GolfCore page; round prefilled');
    // ---- 6. Scott's edits are kept: picking it again never re-imports
    await page.evaluate(() => { const L = JSON.parse(localStorage.getItem('golfsg.courses.v1')); const c = L.find(x => x.id === 'gc-pebble-beach'); c.pars[0] = 5; c.edited = true; localStorage.setItem('golfsg.courses.v1', JSON.stringify(L)); });
    await page.goto(BASE + '?x=' + Date.now()); await page.waitForSelector('#home');
    const before = T.gc.length; await openNew(); await page.click('#nearbtn'); await page.click('[data-act="neargo"]'); await page.waitForSelector('#nearlist');
    assert.match(await page.textContent('#nearlist'), /saved/); assert.strictEqual(T.list, 1, 'list read from its own cache after reload');
    await page.click('#nearlist .nearopt:nth-child(4)'); await page.waitForSelector('#ntees');
    assert.strictEqual(T.gc.length, before, 'no GolfCore call for a saved course'); S = await store(); assert.strictEqual(S.find(c => c.id === 'gc-pebble-beach').pars[0], 5, 'edit kept');
    ok('saved course reused (marked "saved"), no new lookup, edits kept; list from cache after reload');
    // ---- 7. missing holes → note → editor
    await page.goto(BASE + '?x=' + Date.now()); await page.waitForSelector('#home');
    await openNew(); await page.click('#nearbtn'); await page.click('[data-act="neargo"]'); await page.waitForSelector('#nearq');
    await page.fill('#nearq', 'des plaines'); await page.click('#nearres .nearopt'); await page.waitForSelector('#nmiss');
    assert.strictEqual((await page.textContent('#nmiss')).trim(), 'Some holes are missing – tap to fill in'); await light('#nmiss');
    assert.ok((await page.$$eval('#ntees .ntee:not(.naddtee)', e => e.map(x => x.textContent))).some(t => /2,?204.*51\.4\/78/.test(t)), 'yards total + rating when holes are blank');
    await shot('courses-near-missing');
    await page.click('#nmiss'); await page.waitForSelector('.revgrid'); assert.ok(await page.$('#gccredit'), 'credit on the card editor too');
    assert.strictEqual(await page.$eval('[data-cf="yd"][data-i="0"]', e => e.value), '', 'blank stays blank');
    await page.fill('[data-cf="yd"][data-i="0"]', '120'); await page.click('[data-act="cardsave"]'); await page.waitForSelector('#ntees');
    S = await store(); const dp = S.find(c => c.id === 'gc-golf-center-des-plaines'); assert.ok(dp.edited, 'marked edited'); assert.strictEqual(dp.tees.find(t => t.name === 'White').yards[0], 120);
    ok('missing yardages: blank + note opens the editor; save marks the course edited');
    // ---- 8. not-close match → asks; offline → plain message + manual editor; used-up lookups
    await page.goto(BASE + '?x=' + Date.now()); await page.waitForSelector('#home');
    await openNew(); await page.click('#nearbtn'); await page.click('[data-act="neargo"]'); await page.waitForSelector('#nearq');
    T.gcMode = 'offline'; await page.fill('#nearq', 'pebble bch'); await page.click('#nearres .nearopt'); await page.waitForSelector('#nearerr');
    assert.match(await page.textContent('#nearerr'), /No connection right now/); assert.ok(await page.$('[data-act="nearretry"]'));
    T.gcMode = '429'; await page.click('[data-act="nearretry"]'); await page.waitForSelector('#nearerr'); await page.waitForFunction(() => /used up/.test(document.getElementById('nearerr').textContent));
    T.gcMode = 'ok'; await page.click('[data-act="nearretry"]'); await page.waitForSelector('#nearcands');
    assert.match(await page.textContent('#nearask'), /Is it one of these/); const cn = await page.$$eval('#nearcands .nearopt b', e => e.map(x => x.textContent)); assert.strictEqual(cn[0], 'Pebble Beach Golf Links');
    await page.click('[data-act="nearmanual"]'); await page.waitForSelector('.revgrid'); assert.strictEqual(await page.$eval('[data-cf="name"]', e => e.value), 'Pebble Bch Links', 'name filled in');
    ok('offline / used-up: plain message + Try again + type-in; different spelling asks "Is it one of these?"; type-in opens the editor');
    // ---- 9. location turned off / no answer / unsupported → name search
    for (const [m, want] of [['deny', /Location is turned off/], ['none', /Couldn.t get your location/]]) {
      await page.goto(BASE + '?x=' + Date.now()); await page.evaluate(m => localStorage.setItem('t.geo', m), m); await page.reload(); await page.waitForSelector('#home');
      await openNew(); await page.click('#nearbtn'); await page.click('[data-act="neargo"]'); await page.waitForSelector('#nearnote');
      assert.match(await page.textContent('#nearnote'), want); assert.strictEqual(await page.$('#nearlist'), null); assert.strictEqual(await page.evaluate(() => document.activeElement.id), 'nearq', 'search box ready');
    }
    await page.evaluate(() => localStorage.setItem('t.geo', 'hang')); await page.reload(); await page.waitForSelector('#home');
    await openNew(); await page.click('#nearbtn'); await page.click('[data-act="neargo"]'); await page.waitForSelector('#nearnote', { timeout: 15000 }); assert.match(await page.textContent('#nearnote'), /Couldn.t get your location/);
    await page.click('[data-act="nearclose"]'); await page.click('#nearbtn'); await page.click('[data-act="nearname"]'); await page.waitForSelector('#nearq'); assert.strictEqual(await page.$('#nearnote'), null);
    ok('denied, unsupported and no answer (12 s) all fall back to name search; "Search by name instead" skips location');
    // ---- 9b. tee dots: colour names get their colour (two-tone for combos), anything else a plain white circle; same in the course editor
    const DOTS = ['Black', 'Blue/White', 'White', "Red (Women's)", 'Gold', 'Green', 'Silver', 'Orange', '1 feather', '2 feather', '3 feather', 'Championship'];
    await page.evaluate(names => { localStorage.removeItem('t.geo'); const L = JSON.parse(localStorage.getItem('golfsg.courses.v1') || '[]');
      L.unshift({ id: 'dots', name: 'Feather Ridge (test)', pars: [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 5], updated: '2026-10-31T20:00:00Z',
        tees: names.map((n, k) => ({ name: n, yards: Array.from({ length: 18 }, (_, i) => 300 + i * 7 - k * 12) })) });
      localStorage.setItem('golfsg.courses.v1', JSON.stringify(L)); }, DOTS);
    await page.reload(); await page.waitForSelector('#home'); await openNew(); await page.click('#crspick'); await page.click('[data-act="ncourse"][data-id="dots"]'); await page.waitForSelector('#ntees .tdot');
    const D = await page.$$eval('#ntees .ntee:not(.naddtee)', e => e.map(x => { const d = x.querySelector('.tdot'), c = getComputedStyle(d), r = d.getBoundingClientRect();
      return { n: x.querySelector('.tname').textContent, w: d.offsetWidth, h: d.offsetHeight, bg: c.backgroundImage !== 'none' ? 'split' : c.backgroundColor, bd: c.borderTopColor, none: d.classList.contains('tdot-none'), chip: x.getBoundingClientRect().height }; }));
    assert.deepStrictEqual(D.map(d => d.n), DOTS); assert.ok(D.every(d => d.w === 10 && d.h === 10), 'fixed 10px dots ' + JSON.stringify(D.map(d => [d.w, d.h])));
    const bg = n => D.find(d => d.n === n).bg;
    assert.strictEqual(bg('Black'), 'rgb(34, 34, 34)'); assert.strictEqual(bg('Blue/White'), 'split'); assert.strictEqual(bg("Red (Women's)"), 'rgb(208, 68, 58)'); assert.strictEqual(bg('White'), 'rgb(255, 255, 255)');
    for (const n of ['1 feather', '2 feather', '3 feather', 'Championship']) { const d = D.find(x => x.n === n); assert.ok(d.none && d.bg === 'rgb(255, 255, 255)' && d.bd === 'rgb(154, 160, 166)', n + ' white circle, grey outline'); }
    assert.ok(D.every(d => d.chip <= 34), 'compact chips ' + D.map(d => d.chip)); await light('#ntees .ntee:not(.sel)');
    await shot('tee-dots');
    await page.click('[data-act="nedit"]'); await page.waitForSelector('.revtees .tdot'); assert.strictEqual(await page.$$eval('.revtees .frostchip .tdot', e => e.length), DOTS.length, 'dots in the course editor too');
    await page.click('[data-act="cardback"]');
    ok('tee dots: colours, two-tone Blue/White, Women\'s red, white circle for feathers / Championship; fixed 10px, compact chips; also in the course editor');
    // ---- 10. a new app version keeps the downloaded list; Settings credits
    await page.evaluate(async () => { await caches.open('golf-sg-v1'); for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); });
    await page.reload(); await page.evaluate(() => navigator.serviceWorker.ready); await page.waitForFunction(async () => !(await caches.keys()).includes('golf-sg-v1'));
    assert.ok((await page.evaluate(() => caches.keys())).includes('pinhigh-courselist-v1'), 'list cache survives a service worker update');
    await page.waitForSelector('#home'); await page.click('#plusbtn'); await page.click('#plusmenu [data-act="archive"]'); await page.waitForSelector('#credits');
    const cr = await page.textContent('#credits'); assert.match(cr, /GolfCore/); assert.match(cr, /OpenGolfAPI/); assert.match(cr, /ODbL/); assert.match(cr, /OpenStreetMap/); await light('#credits');
    ok('service worker update clears old app caches but keeps the course list; Settings credits GolfCore, OpenGolfAPI (ODbL), OpenStreetMap');
    assert.deepStrictEqual(T.outside, [], 'no outside requests'); assert.ok(!T.auth, 'no key header sent from the app'); assert.deepStrictEqual(errors, []);
    console.log('courses-near-focused: all passed');
  } finally { await b.close(); srv.kill(); }
})().catch(e => { console.error(e); process.exit(1); });
