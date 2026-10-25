// Birdie zone (v85): putt bands, 1-putt ring method, birdie counts, page UI (toggle, fallback, slider, same ball positions as the GIR map), screenshots.
const { chromium } = require('playwright-core'); const assert = require('assert'); const { spawn } = require('child_process'); const fs = require('fs');
const SG = require('../sg.js'); global.SG = SG; const BZ = require('../birdie.js'); const makeRounds = require('./fixtures/birdie-data.js');
const BASE = 'http://127.0.0.1:8803/', OUT = '/workspace/golf-app/screenshots/';
// ---- pure helpers ----
const P = (ft, made) => ({ ft, made });
const rep = (n, ft, made) => Array.from({ length: n }, (_, i) => P(ft, i < made));
{ const b = BZ.bands([P(0.5, true), P(3, true), P(3.5, false), P(6, true), P(30, false), P(31, false)]);
  assert.deepStrictEqual(b.map(x => x.label), ['0–3’', '3–6’', '6–10’', '10–15’', '15–20’', '20–30’', '30’+'], 'band labels');
  assert.deepStrictEqual(b.map(x => x.n), [2, 2, 0, 0, 0, 1, 1], 'band edges: (lo, hi], first band from 0');
  assert.deepStrictEqual(b.map(x => x.pct), [100, 50, null, null, null, 0, 0], 'band make %'); }
assert.strictEqual(BZ.onePutt(rep(19, 2, 19)), null, 'needs ' + BZ.MIN_PUTTS + ' putts');
assert.strictEqual(BZ.onePutt([].concat(rep(10, 2, 10), rep(10, 4, 7), rep(10, 8, 3))).ft, 5, 'stops where the data runs out (gap after 5’)');
assert.strictEqual(BZ.onePutt([].concat(rep(10, 2, 10), rep(10, 4, 7), rep(10, 8, 3), rep(30, 20, 30))).ft, 5, 'a hot streak far out can’t stretch the ring past a gap');
assert.strictEqual(BZ.onePutt([].concat(rep(10, 2, 10), rep(10, 4, 7), rep(10, 6, 2))).ft, 4, 'stops at the first cold distance (5’ window = 45%)');
assert.strictEqual(BZ.onePutt(rep(30, 2, 10)), null, 'no distance at 50%+ → null');
const RS = makeRounds(), ALL = BZ.scope(RS);
const ringAll = BZ.onePutt(ALL.putts).ft, rings = RS.map(r => { const o = BZ.onePutt(BZ.scope([r]).putts); return o && o.ft; });
assert.strictEqual(ALL.holes, 72); assert.strictEqual(ALL.chances.length + ALL.missed, 72, 'GIR + missed = holes');
for (let R = ringAll; R <= 30; R++) { const z = BZ.zone(ALL, R), man = ALL.chances.filter(c => !c.birdie && !c.holed && c.ft <= R).length;
  assert.strictEqual(z.potential, man); assert.strictEqual(z.total, ALL.birdies + man);
  if (R > ringAll) assert.ok(z.total >= BZ.zone(ALL, R - 1).total, 'monotone');
  assert.ok(/^Birdies \d+ → \d+ \(\+\d+\) at \d+’$/.test(BZ.label(z)), BZ.label(z)); }
const lastR = RS[RS.length - 1], L = BZ.scope([lastR]);
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', '8803', '--bind', '127.0.0.1'], { cwd: '/workspace/golf-app', stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1500)); const errors = [];
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const page = await (await b.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })).newPage();
  page.setDefaultTimeout(30000); page.on('pageerror', e => errors.push(String(e))); page.on('dialog', d => d.accept());
  const load = async rs => { await page.goto(BASE + '?x=' + Date.now()); await page.evaluate(rs => { localStorage.clear(); localStorage.setItem('golfsg.player.v1', 'Quincy'); localStorage.setItem('golfsg.rounds.v1', JSON.stringify(rs)); }, rs); await page.reload(); };
  const goHist = async () => { if (await page.$('#plusbtn')) await page.click('#plusbtn'); await page.click('[data-act="history"]'); };
  const state = () => page.evaluate(() => ({ count: document.getElementById('bzcount').textContent, ring: +document.getElementById('bzring').getAttribute('r'),
    zone: +document.getElementById('bzzone').getAttribute('r'), zoneVis: document.getElementById('bzzone').getAttribute('visibility'),
    sl: (s => ({ min: +s.min, max: +s.max, v: +s.value }))(document.getElementById('bzslider')),
    sel: document.querySelector('[data-act="bzscope"].sel') && document.querySelector('[data-act="bzscope"].sel').dataset.v,
    balls: [...document.querySelectorAll('#bzmap g.bzball')].map(g => ({ ft: +g.dataset.ft, cls: g.getAttribute('class'), fill: g.querySelector('circle').getAttribute('fill') })),
    stars: document.querySelectorAll('#bzmap .bzholed').length, note: (document.getElementById('bznote') || {}).textContent || '',
    meta: document.getElementById('bzmeta').textContent, bands: [...document.querySelectorAll('#bztab tr')].map(t => t.cells[3].textContent),
    title: document.querySelector('.topbar .title').textContent }));
  await load(RS);
  // From History: all rounds
  await goHist(); await page.click('#histbz'); await page.waitForSelector('#birdie');
  let s = await state();
  assert.strictEqual(s.sel, 'all'); assert.ok(/4 rounds · Quincy/.test(s.title), s.title);
  assert.strictEqual(s.ring, ringAll * 5, 'ring drawn to scale (5 px/ft)'); assert.deepStrictEqual(s.sl, { min: ringAll, max: 30, v: ringAll });
  assert.strictEqual(s.count, BZ.label(BZ.zone(ALL, ringAll))); assert.strictEqual(s.zoneVis, 'hidden');
  assert.strictEqual(s.balls.length + s.stars, ALL.chances.length, 'every GIR plotted'); assert.ok(s.meta.includes(ALL.missed + ' missed'), s.meta);
  assert.deepStrictEqual(s.bands, BZ.bands(ALL.putts).map(x => x.made + '/' + x.n));
  const vert = await page.$eval('#bzslider', e => { const r = e.getBoundingClientRect(), m = document.getElementById('bzmap').getBoundingClientRect(); return { tall: r.height > 3 * r.width, left: r.right <= m.left + 1 }; });
  assert.ok(vert.tall && vert.left, 'vertical slider on the left ' + JSON.stringify(vert));
  const bird = await page.$eval('#bzbird', e => { const r = e.getBoundingClientRect(), c = document.getElementById('bzcount').getBoundingClientRect(); return { ok: e.complete && e.naturalWidth >= 250 && e.naturalWidth <= 320, w: r.width, beside: Math.abs((r.top + r.height / 2) - (c.top + c.height / 2)) < 8 && r.right <= c.left + 1 }; });
  assert.ok(bird.ok && bird.w === 44 && bird.beside, 'oriole beside the birdie count ' + JSON.stringify(bird));
  await page.screenshot({ path: OUT + 'birdie-zone-all.png' });
  // Slider: live update, no re-render, 1 ft steps
  await page.$eval('#bzmap', e => { e.__keep = 1; });
  await page.focus('#bzslider'); await page.keyboard.press('ArrowUp'); s = await state();
  assert.strictEqual(s.sl.v, ringAll + 1, '1 ft step'); assert.strictEqual(s.count, BZ.label(BZ.zone(ALL, ringAll + 1)));
  await page.$eval('#bzbird', e => e.classList.remove('hop'));
  await page.$eval('#bzslider', e => { e.value = 14; e.dispatchEvent(new Event('input', { bubbles: true })); }); s = await state();
  assert.ok(await page.$eval('#bzbird', e => e.classList.contains('hop') && getComputedStyle(e).animationName === 'bzhop'), 'oriole hops when the count goes up');
  await page.$eval('#bzbird', e => e.classList.remove('hop'));
  await page.$eval('#bzslider', e => { e.value = 13; e.dispatchEvent(new Event('input', { bubbles: true })); });
  assert.ok(await page.$eval('#bzbird', e => !e.classList.contains('hop')), 'no hop when the count goes down');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.$eval('#bzslider', e => { e.value = 14; e.dispatchEvent(new Event('input', { bubbles: true })); });
  assert.strictEqual(await page.$eval('#bzbird', e => getComputedStyle(e).animationName), 'none', 'reduced motion: no animation');
  await page.emulateMedia({ reducedMotion: 'no-preference' }); await page.waitForTimeout(500); s = await state();
  assert.strictEqual(await page.$eval('#bzmap', e => e.__keep), 1, 'slider updates in place');
  assert.strictEqual(s.count, BZ.label(BZ.zone(ALL, 14))); assert.strictEqual(s.zone, 70); assert.strictEqual(s.zoneVis, null);
  assert.ok(s.balls.every(x => x.ft <= 14 ? / in/.test(x.cls) && x.fill === '#fff' : / out/.test(x.cls) && x.fill === '#1c1c1e'), 'white inside, black outside');
  assert.ok(BZ.zone(ALL, 14).potential > 0);
  await page.$eval('#bzslider', e => e.blur()); await page.screenshot({ path: OUT + 'birdie-zone-expanded.png' });
  await page.$eval('#bzslider', e => { e.value = 99; e.dispatchEvent(new Event('input', { bubbles: true })); }); assert.strictEqual((await state()).sl.v, 30, 'max 30’');
  // tip
  await page.click('[data-act="info"][data-v="bzring"]'); assert.ok(await page.isVisible('#tip-bzring')); assert.ok((await page.textContent('#tip-bzring')).includes('at least ' + BZ.MIN_WIN + ' putts'));
  // Toggle to this round (newest round)
  await page.click('[data-act="bzscope"][data-v="round"]'); s = await state();
  assert.strictEqual(s.sel, 'round'); assert.strictEqual(s.ring, rings[3] * 5, 'round has its own ring'); assert.strictEqual(s.note, '');
  assert.strictEqual(s.count, BZ.label(BZ.zone(L, rings[3]))); assert.strictEqual(s.balls.length + s.stars, L.chances.length);
  await page.click('[data-act="bzscope"][data-v="all"]'); assert.strictEqual((await state()).sl.v, ringAll, 'toggle resets the slider to the ring');
  // From a round's stats: this round, same ball positions as the GIR map
  await goHist(); await page.click('#histlist [data-act="open"][data-id="bz4"]');
  await page.click('[data-act="map"][data-v="gir"]'); await page.waitForSelector('#girmap');
  const gir = await page.$$eval('#girmap .gdot', a => a.map(e => { const bb = e.getBBox(); return { h: e.dataset.hole, x: Math.round(bb.x + bb.width / 2 - 180), y: Math.round(bb.y + bb.height / 2 - 200) }; }).sort((p, q) => p.h - q.h));
  await page.goto(BASE + '?y=' + Date.now()); await goHist(); await page.click('#histlist [data-act="open"][data-id="bz4"]');
  await page.click('#sumbz'); await page.waitForSelector('#birdie'); s = await state(); assert.strictEqual(s.sel, 'round'); assert.ok(/Bayview/.test(s.title));
  const bz = await page.$$eval('#bzmap .bzball', a => a.map(e => { const c = e.querySelector('circle') || e, bb = c.getBBox(); return { h: e.dataset.hole, x: Math.round(bb.x + bb.width / 2 - 180), y: Math.round(bb.y + bb.height / 2 - 180) }; }).sort((p, q) => p.h - q.h));
  assert.strictEqual(bz.length, gir.length); bz.forEach((p, i) => assert.ok(p.h === gir[i].h && Math.abs(p.x - gir[i].x) <= 2 && Math.abs(p.y - gir[i].y) <= 2, 'same spot as GIR map ' + JSON.stringify([p, gir[i]])));
  await page.screenshot({ path: OUT + 'birdie-zone-round.png' });
  await page.click('[data-act="bzback"]'); assert.ok(await page.$('#sumbz'), 'back to stats');
  // Fallback: a short newest round → all-rounds putting, said so
  const short = JSON.parse(JSON.stringify(RS[0])); short.id = 'bzs'; short.date = '2026-10-15T17:00:00.000Z'; short.holes = short.holes.slice(0, 5);
  await load(RS.concat([short])); await goHist(); await page.click('#histbz'); await page.click('[data-act="bzscope"][data-v="round"]'); s = await state();
  const SS = BZ.scope([short]), ringAll2 = BZ.onePutt(BZ.scope(RS.concat([short])).putts).ft;
  assert.ok(SS.putts.length < BZ.MIN_PUTTS); assert.strictEqual(s.ring, ringAll2 * 5, 'fallback ring = all rounds'); assert.ok(s.note.includes('Only ' + SS.putts.length + ' putts this round') && s.note.includes('all rounds'), s.note);
  assert.ok((await page.textContent('.bzlegend')).includes('(all rounds)')); assert.strictEqual(s.count, BZ.label(BZ.zone(SS, ringAll2)));
  // Brand new player, no data at all → default ring
  await load([short]); await goHist(); await page.click('#histbz'); s = await state(); assert.strictEqual(s.ring, BZ.DEFAULT_FT * 5); assert.ok(s.note.includes('Not enough putts yet'), s.note);
  const sw = fs.readFileSync('/workspace/golf-app/sw.js', 'utf8'); assert.ok(/'golf-sg-v(8[5-9]|9\d|\d{3,})'/.test(sw) && sw.includes("'./birdie.js'") && sw.includes("'./img/oriole.webp'"), 'sw v85+ + birdie.js cached');
  assert.deepStrictEqual(errors, []); await b.close(); srv.kill();
  console.log('birdie zone focused OK · all-rounds ring ' + ringAll + '’ · round rings ' + rings.map(x => x + '’').join(' ') + ' · ' + BZ.label(BZ.zone(ALL, ringAll)) + ' · at 14’: ' + BZ.label(BZ.zone(ALL, 14)));
})().catch(e => { console.error(e); process.exit(1); });
process.on('exit', () => { try { require('child_process').execSync("pkill -f 'http.server 8803'"); } catch (e) {} });
