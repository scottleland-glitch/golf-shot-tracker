// v124 Proximity page: (1) compact controls + the empty sky above the green cropped, so the whole green is on screen
// (390x844) right under the controls; (2) the red dashed ring follows a benchmark – the round's SG baseline by default,
// or the one picked in the page's small selector (this view only; the round's saved baseline is not changed).
// Researched tables for all six (prox-benchmarks.json); a distance a benchmark doesn't cover: no ring, 90 ft, '<name>: no data at this distance';
// a benchmark with no table: 'No proximity benchmark for <name> yet'. Adding / updating a benchmark is data only (PROX_BENCH).
const { chromium } = require('playwright-core'); const assert = require('assert'); const { spawn } = require('child_process'); const fs = require('fs');
const PORT = 8875, BASE = 'http://127.0.0.1:' + PORT + '/', OUT = '/workspace/golf-app/screenshots/';
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: '/workspace/golf-app', stdio: 'ignore' }); await new Promise(r => setTimeout(r, 1500));
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] }); const errors = [], outside = [];
  try {
    const P = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })).newPage();
    P.on('pageerror', e => errors.push(String(e))); P.on('request', r => { if (!r.url().startsWith(BASE) && !r.url().startsWith('data:')) outside.push(r.url()); });
    await P.goto(BASE + '?x=' + Date.now()); const fix = fs.readFileSync(__dirname + '/fixtures/prox-rounds.js', 'utf8');
    // p1 is benchmarked vs D1 women, p2 vs PGA Tour
    await P.evaluate(src => { const m = { exports: {} }; new Function('module', src)(m); const R = m.exports.all(); R.forEach(r => { r.baseline = r.id === 'p1' ? 'd1w' : 'pga'; });
      localStorage.clear(); localStorage.setItem('golfsg.player.v1', 'Scott'); localStorage.setItem('golfsg.rounds.v1', JSON.stringify(R)); }, fix);
    await P.reload();
    const open = async id => { if (await P.$('#mapview')) await P.click('[data-act="mapclose"]'); if (await P.$('#plusbtn')) await P.click('#plusbtn'); await P.click('[data-act="history"]'); await P.click('#histlist [data-act="open"][data-id="' + id + '"]');
      if (!(await P.$('[data-stx="prox"].open'))) await P.click('[data-act="stx"][data-v="prox"]'); await P.click('[data-stx="prox"] [data-act="map"][data-v="prox"]'); await P.waitForSelector('#proxrail'); await P.waitForTimeout(150); };
    const st = () => P.evaluate(() => { const g = document.getElementById('d1ring'), q = s => document.querySelector(s), r = e => e && e.getBoundingClientRect();
      const svg = q('#proxmap'), gr = r(q('#proxmap .pgreen')), sel = q('#proxbench');
      return { ring: g ? g.querySelector('text').textContent : null, bench: g ? g.dataset.bench : null, rft: +q('#proxrings').dataset.rft, sel: sel.value, opts: [...sel.options].map(o => [o.value, o.textContent]),
        leg: (q('#benchleg') || {}).textContent || '', nob: (q('#nobench') || {}).textContent || '', noblab: (q('#nobenchlab') || {}).textContent || '', note: (q('#benchnote') || {}).textContent || '',
        green: [gr.top, gr.bottom, gr.left, gr.right], ctl: r(q('#liechips')).bottom, sel2: r(q('#benchsel')).bottom, tog: r(q('#heattog')).bottom, vb: svg.getAttribute('viewBox'), crop: +(svg.dataset.crop || 0),
        top: q('#mapview').scrollTop, docW: document.documentElement.scrollWidth }; });
    // ---- 1. this round, benchmark = the round's (D1 women)
    await open('p1'); let s = await st();
    assert.strictEqual(s.sel, 'd1w'); assert.strictEqual(s.ring, 'D1 women avg 44\u2019'); assert.strictEqual(s.bench, 'd1w'); assert.strictEqual(s.rft, 54); assert.strictEqual(s.leg, 'D1 women avg'); assert.strictEqual(s.nob, '');
    assert.deepStrictEqual(s.opts, [['pga', 'PGA Tour'], ['lpga', 'LPGA'], ['d1m', 'D1 men'], ['d1w', 'D1 women'], ['scm', 'Scratch men'], ['scw', 'Scratch women']]);
    assert.match(s.note, /this round’s benchmark \(D1 women\)/);
    console.log('✓ this round (D1 women baseline): selector on D1 women, ring "D1 women avg 44’", zoom 54 ft; all six benchmarks listed');
    // ---- 2. the whole green is on screen under the controls, without scrolling
    assert.strictEqual(s.top, 0); assert.ok(s.green[1] < 844, 'green bottom ' + s.green[1]); assert.ok(s.green[0] > s.ctl && s.green[0] > s.tog && s.green[0] > s.sel2, 'green below the controls');
    assert.ok(s.green[0] - s.ctl < 60, 'LEFT / LONG / RIGHT row hugs the green: gap ' + (s.green[0] - s.ctl)); assert.ok(s.crop > 80, 'sky cropped ' + s.vb); assert.ok(s.docW <= 390);
    console.log('✓ 390x844: controls end at ' + Math.round(s.ctl) + ' px, green ' + Math.round(s.green[0]) + '–' + Math.round(s.green[1]) + ' px (fully on screen); viewBox ' + s.vb);
    // compact controls: rail 2 rows, lie chips one row, Dots / Gradient beside "Hit from", tiles short
    const lay = await P.evaluate(() => { const ys = s => [...new Set([...document.querySelectorAll(s)].map(e => Math.round(e.getBoundingClientRect().top)))];
      return { rail: ys('#proxrail button').length, lie: ys('#liechips .liebtn').length, tog: document.getElementById('heattog').parentNode.id, lbl: Math.abs(document.querySelector('.proxctl .proxlbl').getBoundingClientRect().top - document.getElementById('heattog').getBoundingClientRect().top) < 20,
        tile: Math.round(document.querySelector('#proxstats .qv').getBoundingClientRect().height), minH: Math.min(...[...document.querySelectorAll('#proxrail button, #liechips .liebtn')].map(e => e.getBoundingClientRect().height)) }; });
    assert.deepStrictEqual([lay.rail, lay.lie, lay.tog, lay.lbl], [2, 1, 'heatslot', true], JSON.stringify(lay)); assert.ok(lay.tile <= 56, 'tiles ' + lay.tile); assert.ok(lay.minH >= 34, 'tap size ' + lay.minH);
    await P.screenshot({ path: OUT + 'prox-top-v124.png' });
    // Gradient on the cropped map: the heat picture lines up with the cropped viewBox
    await P.click('[data-act="heat"][data-v="grad"]'); const hg = await P.evaluate(() => { const i = document.getElementById('heatgrad'), v = document.getElementById('proxmap').viewBox.baseVal; return [+i.getAttribute('y'), v.y, +i.getAttribute('height'), v.height, document.querySelectorAll('#proxmap .hotspot').length]; });
    assert.strictEqual(hg[0], hg[1]); assert.strictEqual(hg[2], hg[3]); assert.ok(hg[4] > 0); assert.ok((await st()).green[1] < 844); await P.click('[data-act="heat"][data-v="dots"]');
    console.log('✓ compact controls: distance chips 2 rows, lie chips 1 row, Dots / Gradient beside "Hit from"; Gradient layer follows the cropped map');
    // ---- 3. switch benchmarks (this view only): ring label, size and zoom follow; the round keeps its own benchmark
    const exp150 = { pga: ['PGA Tour avg 28\u2019', 38], lpga: ['LPGA avg 32\u2019', 42], d1m: ['D1 men avg 34\u2019', 44], d1w: ['D1 women avg 44\u2019', 54], scm: ['Scratch men avg 54\u2019', 64], scw: ['Scratch women avg 89\u2019', 99] };
    for (const [id, [lab, rft]] of Object.entries(exp150)) { await P.selectOption('#proxbench', id); const t = await st(); assert.deepStrictEqual([t.ring, t.bench, t.rft, t.nob], [lab, id, rft, ''], id + ' ' + JSON.stringify(t));
      const rr = await P.evaluate(() => { const c = document.querySelector('#d1ring circle'), ft = +document.getElementById('d1ring').dataset.ft; return [+c.getAttribute('r'), ft * 117 / (ft + 10)]; }); assert.ok(Math.abs(rr[0] - rr[1]) < 0.11, id + ' ring radius');
      const src = await P.textContent('#benchsrc'); assert.ok(src.startsWith(t.leg.replace(' avg', '') + ':'), id + ' source line ' + src);
      if (id === 'pga' || id === 'scw') { assert.ok(t.green[1] < 844); await P.screenshot({ path: OUT + 'prox-' + id + '-v124.png' }); } }
    assert.match(await P.textContent('#benchsrc'), /^Scratch women: Shot Scope/);
    const saved = await P.evaluate(() => [JSON.parse(localStorage.getItem('golfsg.rounds.v1')).find(r => r.id === 'p1').baseline, window.__golf.rounds().find(r => r.id === 'p1').baseline]); assert.deepStrictEqual(saved, ['d1w', 'd1w']);
    assert.match((await st()).note, /Scratch women, picked above \(just for this view – the round’s own benchmark is D1 women\)/);
    console.log('✓ switching at 150 yd: PGA Tour 28’, LPGA 32’, D1 men 34’, D1 women 44’, Scratch men 54’, Scratch women 89’ (ring size + zoom follow); saved round baseline unchanged');
    // estimates say est.; a distance a benchmark doesn't cover: no ring, 90 ft, note (no extrapolating)
    await P.click('#proxrail [data-v="180"]'); s = await st(); assert.strictEqual(s.ring, 'Scratch women avg 106\u2019 est.'); assert.match(await P.textContent('#d1note'), /175–200 yd \(106.3 ft; est. = estimate: 150–175 yd \(89 ft\) × the Pac-12 men ratio 40.6\/34.0\)/);
    await P.click('#proxrail [data-v="200"]'); s = await st(); assert.deepStrictEqual([s.ring, s.rft, s.nob, s.noblab], [null, 90, 'Scratch women: no data at this distance', 'Scratch women: no data at this distance']);
    await P.screenshot({ path: OUT + 'prox-nobench-v124.png' });
    await P.selectOption('#proxbench', 'lpga'); assert.strictEqual((await st()).ring, 'LPGA avg 47\u2019 est.'); await P.selectOption('#proxbench', 'scm'); assert.strictEqual((await st()).ring, 'Scratch men avg 92\u2019');
    await P.selectOption('#proxbench', 'pga'); assert.strictEqual((await st()).ring, 'PGA Tour avg 41\u2019'); await P.click('#proxrail [data-v="all"]'); assert.deepStrictEqual([(await st()).ring, (await st()).nob], [null, '']);
    const bt = await P.evaluate(() => { const B = window.__golf.proxBench; return [B(40, 'pga'), B(49, 'scw'), B(124, 'pga').from, B(125, 'pga').from, B(199, 'scm').ft, B(250, 'scm').ft, B(200, 'scw'), B(250, 'd1w').from, B(150, 'd1w').to]; });
    assert.deepStrictEqual(bt, [null, null, 100, 125, 54, 92, null, 200, 160]);
    console.log('✓ estimates marked est. (Scratch women 106’ est. at 180, LPGA 47’ est. at 200); Scratch women at 200 yd: no ring, 90 ft, "no data at this distance"');
    // a benchmark with no numbers at all
    await P.click('#proxrail [data-v="150"]'); await P.evaluate(() => { window.__lp = window.__golf.PROX_BENCH.lpga; delete window.__golf.PROX_BENCH.lpga; }); await P.selectOption('#proxbench', 'lpga'); s = await st();
    assert.deepStrictEqual([s.ring, s.rft, s.nob, s.opts[1][1]], [null, 90, 'No proximity benchmark for LPGA yet', 'LPGA (no data)']); assert.match(s.note, /No proximity numbers yet for: LPGA/);
    await P.evaluate(() => { window.__golf.PROX_BENCH.lpga = window.__lp; }); await P.selectOption('#proxbench', 'd1w'); s = await st(); assert.strictEqual(s.ring, 'D1 women avg 44\u2019');
    console.log('✓ a benchmark with no table: no ring, "No proximity benchmark for LPGA yet", marked (no data)');
    // ---- 4. All rounds: the open round's benchmark, said in the legend
    await P.click('#proxrail [data-v="150"]'); await P.click('[data-act="mapscope"][data-v="all"]'); await P.waitForSelector('#proxrail'); await P.click('[data-act="heat"][data-v="dots"]'); await P.locator('#mapview').evaluate(e => e.scrollTop = 0);
    s = await st(); assert.strictEqual(s.ring, 'D1 women avg 44\u2019'); assert.strictEqual(s.leg, 'D1 women avg (this round’s benchmark)'); assert.match(s.note, /the open round’s benchmark \(D1 women\) for every round shown/); assert.ok(s.green[1] < 844, 'all rounds green ' + s.green[1]);
    await P.screenshot({ path: OUT + 'prox-all-top-v124.png' });
    console.log('✓ All rounds: ring = the open round’s benchmark (D1 women), legend says so; green on screen');
    // ---- 5. a PGA Tour round opens on PGA Tour (the page choice is not carried over)
    await open('p2'); s = await st(); assert.strictEqual(s.sel, 'pga'); await P.click('#proxrail [data-v="150"]'); s = await st(); assert.deepStrictEqual([s.ring, s.bench], ['PGA Tour avg 28\u2019', 'pga']);
    console.log('✓ PGA Tour round: selector on PGA Tour, ring "PGA Tour avg 28’"');
    // ---- 6. updating a benchmark is data only: other row shapes work too
    await P.evaluate(() => { window.__pg = window.__golf.PROX_BENCH.pga; window.__golf.PROX_BENCH.pga = { band: 100, rows: [[40, 10], [100, 20, true]] }; });
    await P.selectOption('#proxbench', 'd1w'); await P.selectOption('#proxbench', 'pga'); s = await st();
    assert.strictEqual(s.ring, 'PGA Tour avg 20\u2019 est.'); assert.strictEqual(s.rft, 30);
    await P.evaluate(() => { window.__golf.PROX_BENCH.pga = { band: 25, rows: [[150, [20, 30], 'sourced', 'x']] }; }); await P.selectOption('#proxbench', 'd1w'); await P.selectOption('#proxbench', 'pga'); assert.strictEqual((await st()).ring, 'PGA Tour avg 25\u2019');
    const zt = await P.evaluate(() => [window.__golf.proxZoomFt(150, null, 'scw'), window.__golf.proxZoomFt(200, null, 'scw'), window.__golf.proxZoomFt(150, null, 'd1w')]); assert.deepStrictEqual(zt, [99, 90, 54]);
    await P.evaluate(() => { window.__golf.PROX_BENCH.pga = window.__pg; });
    console.log('✓ data-only: single-number, [lo, hi] and tagged rows all work; zoom = ring + 10 ft, 90 ft with no data');
    // ---- 7. Compare / report map unchanged: full picture, D1 women ring
    const raw = await P.evaluate(() => { const d = document.createElement('div'); d.innerHTML = window.__golf.proxSVG([], 150); const s = d.querySelector('svg'); return [s.getAttribute('viewBox'), d.querySelector('#d1ring').dataset.bench]; });
    assert.deepStrictEqual(raw, ['0 0 300 620', 'd1w']);
    console.log('✓ Compare / PDF map (no page options): full 300×620 picture, D1 women ring as before');
    assert.deepStrictEqual(errors, []); assert.deepStrictEqual(outside, []); console.log('PASS prox-bench-focused');
  } finally { await b.close(); srv.kill(); }
})().catch(e => { console.error(e); process.exit(1); });
