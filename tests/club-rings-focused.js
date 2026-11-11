// v119: Club performance yardage rings / lines readable on a phone – rings 1.5px darker green-grey (inner dashed, outer solid edge),
// v120: rings in FEET every 10 ft ('10 ft', '20 ft' …; 20 ft rings past 60 ft); labels 11.5px darker with a halo; rings stay above the Gradient view; fairway picture + box plot lines a touch stronger.
const { chromium } = require('playwright-core'); const assert = require('assert'); const { spawn } = require('child_process'); const fs = require('fs');
const PORT = 8870, BASE = 'http://127.0.0.1:' + PORT + '/', OUT = '/workspace/golf-app/screenshots/';
const ok = m => console.log('OK  ' + m);
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: '/workspace/golf-app', stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1500)); const errors = [], outside = [];
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  try {
    const P = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })).newPage();
    P.setDefaultTimeout(60000); P.on('pageerror', e => errors.push(String(e))); P.on('dialog', d => d.accept());
    P.on('request', r => { const u = r.url(); if (!u.startsWith(BASE) && !u.startsWith('data:') && !u.startsWith('blob:')) outside.push(u); });
    await P.goto(BASE + '?x=' + Date.now());
    const fix = fs.readFileSync(__dirname + '/fixtures/club-driver-rounds.js', 'utf8');
    await P.evaluate(src => { const m = { exports: {} }; new Function('module', src)(m); localStorage.clear(); localStorage.setItem('golfsg.player.v1', 'Scott');
      localStorage.setItem('golfsg.rounds.v1', JSON.stringify(m.exports.all())); }, fix);
    await P.reload();
    if (await P.$('#plusbtn')) await P.click('#navbtn'); await P.click('[data-act="history"]'); await P.click('#histlist [data-act="open"][data-id="cd1"]');
    if (!(await P.$('[data-stx="club"].open'))) ((await P.$('[data-act="stx"][data-v="club"]')) && await P.click('[data-act="stx"][data-v="club"]')); await P.click('[data-stx="club"] [data-act="map"][data-v="club"]'); await P.waitForSelector('#mapview');
    const rings = () => P.$$eval('#clubmap .cring', cs => cs.map(c => ({ ft: +c.dataset.ft, w: +c.getAttribute('stroke-width'), dash: c.getAttribute('stroke-dasharray'), col: c.getAttribute('stroke'), op: +getComputedStyle(c).opacity })));
    const labels = () => P.$$eval('#clubmap .cringl', ts => ts.map(t => { const c = getComputedStyle(t), m = c.fill.match(/\d+/g).map(Number); return { txt: t.textContent, size: parseFloat(c.fontSize), wt: +c.fontWeight, lum: (0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]), halo: t.getAttribute('paint-order') === 'stroke' }; }));
    const lum = h => { const n = parseInt(h.slice(1), 16); return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255); };
    const checkRings = (R, L, want) => {
      assert.deepStrictEqual(R.map(r => r.ft), want); assert.ok(R.every(r => r.w >= 1.5 && lum(r.col) < 170 && r.op === 1), JSON.stringify(R));
      assert.ok(R.slice(0, -1).every(r => r.dash), 'inner rings dashed'); assert.strictEqual(R[R.length - 1].dash, null, 'outer ring = solid edge');
      assert.deepStrictEqual(L.map(l => l.txt), want.map(y => y + ' ft')); assert.ok(L.every(l => l.size >= 11 && l.size <= 12 && l.wt <= 400 && l.lum < 100 && l.halo), JSON.stringify(L)); };
    const shot = async (sel, name) => { await P.locator('#mapview').evaluate((e, s) => { const t = document.querySelector(s); e.scrollTop = Math.max(0, t.getBoundingClientRect().top + e.scrollTop - 120); }, sel); await P.screenshot({ path: OUT + name }); };
    // 7i (iron), dots
    await P.click('#clubbtns [data-v="7i"]'); await P.waitForSelector('#clubmap');
    let R = await rings(), L = await labels(); checkRings(R, L, [10, 20, 30, 40, 50]);
    const edge = await P.$eval('#clubmap circle[fill="#e3f0dc"]', c => [+c.getAttribute('stroke-width'), c.getAttribute('stroke')]); assert.ok(edge[0] >= 1.5 && lum(edge[1]) < 180, 'green edge defined');
    const geo = await P.$eval('#clubmap', s => { const rr = [...s.querySelectorAll('.cring')], outer = rr[rr.length - 1], C = [+outer.getAttribute('cx'), +outer.getAttribute('cy')], K = +outer.getAttribute('r') / +outer.dataset.ft;
      return [...s.querySelectorAll('.cdot')].map(d => ({ ft: +d.dataset.hd, u: d.dataset.hu, px: Math.hypot(+d.getAttribute('cx') - C[0], +d.getAttribute('cy') - C[1]) / K })); });
    assert.deepStrictEqual(geo.map(g => g.ft).sort((a, b) => a - b), [8, 20, 30, 45]); assert.ok(geo.every(g => g.u === 'ft' && Math.abs(g.px - g.ft) < 1), JSON.stringify(geo));
    const cells = await P.$$eval('#clubcells .stat b', b => b.map(x => x.textContent)); assert.ok(cells.every(c => /^(\d+ ft (short|long|left|right)|on line)$/.test(c)), cells.join());
    ok('dots sit at their distance in feet (8 / 20 ft on the green, 30 / 45 ft = 10 / 15 yd off it); Avg tiles in feet: ' + cells.join(' · '));
    await shot('#clubdisp', 'club-iron-feet-v120.png'); ok('7i dots: rings 10–50 ft every 10 ft at ' + R[0].w + 'px ' + R[0].col + ' (inner dashed, outer solid); labels ' + L[0].size + 'px weight ' + L[0].wt + ' with halo; green edge ' + edge.join(' '));
    // Gradient view: rings drawn above the heat layer
    await P.click('[data-act="heat"][data-v="grad"]'); await P.waitForSelector('#clubmap.heat');
    const order = await P.$eval('#clubmap', s => { const r = s.querySelector('#clubrings'), hl = s.querySelector('#heatlayer'), blobs = [...hl.querySelectorAll('*')].filter(e => !e.closest('#clubrings') && !e.closest('g[data-n]') && /^(path|circle|rect|image|ellipse)$/.test(e.tagName) && !e.closest('defs')),
      tags = [...hl.querySelectorAll('rect[rx="9"]')]; const after = (a, b) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_PRECEDING);
      return { blobsBelow: blobs.every(x => after(r, x)), tagsAbove: tags.every(t => !after(r, t)), nTags: tags.length, nBlobs: blobs.length }; });
    assert.ok(order.blobsBelow && order.tagsAbove && order.nTags > 0 && order.nBlobs > 0, JSON.stringify(order));
    R = await rings(); L = await labels(); checkRings(R, L, [10, 20, 30, 40, 50]);
    const hm = await P.$eval('#heatmean', e => [e.textContent, +e.dataset.v]); assert.deepStrictEqual(hm, ['26 ft', 25.8]); assert.ok(await P.$$eval('#heatlayer text', t => t.every(x => !/ yd/.test(x.textContent))), 'tags in feet');
    ok('Gradient: Average distance from the hole ' + hm[0] + ' (= the 26 ft Proximity tile), shot tags in feet');
    await shot('#clubdisp', 'club-iron-feet-gradient-v120.png'); ok('7i Gradient: rings + labels drawn above the colour blobs and below the shot tags, same weight');
    // all rounds 7i (more shots) – gradient
    await P.click('[data-act="mapscope"][data-v="all"]'); await P.click('#clubbtns [data-v="7i"]'); await P.waitForSelector('#clubmap');
    R = await rings(); L = await labels(); checkRings(R, L, R.map(r => r.ft)); assert.deepStrictEqual(R.map(r => r.ft), [10, 20, 30, 40, 50, 60]); ok('7i all rounds: rings ' + R.map(r => r.ft).join(' / ') + ' ft readable');
    await P.click('[data-act="mapscope"][data-v="round"]');
    // 56 (wedge) map
    await P.click('#clubbtns [data-v="56"]'); await P.waitForSelector('#clubmap'); R = await rings(); L = await labels(); checkRings(R, L, R.map(r => r.ft));
    await shot('#clubdisp', 'club-wedge-feet-v120.png'); ok('56: rings ' + R.map(r => r.ft).join(' / ') + ' ft, same style');
    // Driver: fairway picture edges + box plot axis
    await P.click('#clubbtns [data-v="Driver"]'); await P.waitForSelector('#clubfw');
    const fw = await P.$$eval('#clubfw .cfwedge', ls => ls.map(l => [parseFloat(getComputedStyle(l).strokeWidth), getComputedStyle(l).stroke])); assert.ok(fw.length === 2 && fw.every(x => x[0] >= 1.5), JSON.stringify(fw));
    const ticks = await P.$$eval('#clubdist .cdt', ts => ts.map(t => parseFloat(getComputedStyle(t).fontSize))); assert.ok(ticks.length && ticks.every(s => s >= 11 && s <= 12));
    await shot('#clubdistcard', 'club-driver-lines-v120.png'); ok('Driver: fairway edges ' + fw[0][0] + 'px, box plot ticks ' + ticks[0] + 'px');
    // large spread (> 60 ft): 20 ft rings so it doesn't crowd
    await P.evaluate(() => { const R = (d, l, dir, club) => Object.assign({ dist: d, loc: l, dir: dir || '', pen: false }, club ? { club } : {});
      const rs = JSON.parse(localStorage.getItem('golfsg.rounds.v1')); rs.push({ v: 3, dv: 2, id: 'cd6', date: '2026-10-27T17:00:00.000Z', course: 'Wide', baseline: 'pga', player: 'Scott', holes: [
        { par: 4, finished: true, rows: [R(400, 'tee', '', 'Driver'), R(160, 'fairway', '', '9i'), R(30, 'rough', 'right', '56'), R(8, 'green', 'short'), R(1, 'holed')] }] });
      localStorage.setItem('golfsg.rounds.v1', JSON.stringify(rs)); });
    await P.reload(); if (await P.$('#plusbtn')) await P.click('#navbtn'); await P.click('[data-act="history"]'); await P.click('#histlist [data-act="open"][data-id="cd6"]');
    if (!(await P.$('[data-stx="club"].open'))) ((await P.$('[data-act="stx"][data-v="club"]')) && await P.click('[data-act="stx"][data-v="club"]')); await P.click('[data-stx="club"] [data-act="map"][data-v="club"]'); await P.click('#clubbtns [data-v="9i"]'); await P.waitForSelector('#clubmap');
    R = await rings(); L = await labels(); checkRings(R, L, [20, 40, 60, 80, 100]); ok('9i finishing 30 yd (90 ft) away: rings switch to every 20 ft (20–100 ft)');
    assert.deepStrictEqual(errors, []); assert.deepStrictEqual(outside, []); ok('no page errors, no outside requests');
    console.log('ALL OK club-rings-focused');
  } finally { await b.close(); srv.kill(); }
})().catch(e => { console.error(e); process.exit(1); });
