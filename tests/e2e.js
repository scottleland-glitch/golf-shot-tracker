// Browser flow test at iPhone size. Run from a folder with playwright-core installed:
//   node e2e.js                      (serves /workspace/golf-app on :8765)
//   NO_SERVER=1 BASE_URL=https://scottleland-glitch.github.io/golf-shot-tracker/ node e2e.js
const { chromium } = require(process.env.PW || 'playwright-core');
const assert = require('assert');
const { spawn } = require('child_process');
const fs = require('fs');
const SHOTS = process.env.SHOTS || '/workspace/golf-app/screenshots';
fs.mkdirSync(SHOTS, { recursive: true });
const PORT = 8765, URL = process.env.BASE_URL || `http://127.0.0.1:${PORT}/`;
const ROOT = process.env.SERVE_ROOT || '/workspace/golf-app';
let passed = 0; const ok = (m) => { passed++; console.log('  ✓', m); };

(async () => {
  const srv = process.env.NO_SERVER ? { kill() {} } : spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 800));
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1', acceptDownloads: true });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', d => d.accept());
  const act = (a, v) => page.locator(v == null ? `[data-act="${a}"]` : `[data-act="${a}"][data-v="${v}"]`).first().click();
  const actK = (a, k) => page.locator(`[data-act="${a}"][data-k="${k}"]`).first().click();
  const dist = (k, v) => page.fill(`input[data-row="${k}"]`, String(v));
  const loc = (k, v) => page.selectOption(`select[data-f="loc"][data-k="${k}"]`, v);
  const OLD = { L: 'left', R: 'right', S: 'short', O: 'long' };
  const dir = async (k, v) => { await actK('dirpick', k); await page.locator(`.sheet [data-act="setdir"][data-v="${OLD[v] || v}"]`).click(); };
  const rows = () => page.locator('.srow[data-k]').count();
  const doneText = () => page.textContent('.hole-done');
  const hideToast = () => page.evaluate(() => { document.getElementById('toast').className = ''; });
  const noOverflow = async (label) => { const w = await page.evaluate(() => document.documentElement.scrollWidth); assert.ok(w <= 390, label + ' overflow ' + w); };

  const count = () => page.textContent('#count');
  const finishDisabled = () => page.$eval('[data-act="finish"]', e => e.disabled);
  const hint = () => page.textContent('#hint');
  const header = () => page.textContent('.topbar .title span');

  // Seed Scott's real v2 save: 365 Tee, 100 Fairway L, 6 ft Green, In the hole (no distance)
  await page.goto(URL);
  await page.evaluate(() => {
    localStorage.clear();
    const holes = []; for (let i = 0; i < 18; i++) holes.push({ par: 4, rows: [{ loc: 'tee', dist: '', dir: '', pen: false }] });
    holes[0] = { par: 4, rows: [{ loc: 'tee', dist: 365, dir: '', pen: false }, { loc: 'fairway', dist: 100, dir: 'L', pen: false },
      { loc: 'green', dist: 6, dir: '', pen: false }, { loc: 'holed', dist: '', dir: '', pen: false }] };
    // A finished history round saved with the OLD L/R/S/O codes (v3 rows, before 8-way directions)
    const R = (dist, loc, dir = '') => ({ dist, loc, dir, pen: false });
    const demo = [
      [4, [R(410, 'tee'), R(160, 'fairway'), R(20, 'rough', 'shortright'), R(6, 'green'), R(1, 'holed')]],
      [4, [R(380, 'tee'), R(140, 'fairway'), R(15, 'bunker', 'R'), R(5, 'green'), R(2, 'holed')]],
      [3, [R(180, 'tee'), R(25, 'rough', 'S'), R(8, 'green'), R(1, 'holed')]],
      [4, [R(430, 'tee'), R(190, 'rough', 'L'), R(30, 'rough', 'shortleft'), R(12, 'green'), R(2, 'holed')]],
      [3, [R(200, 'tee'), R(20, 'rough', 'longleft'), R(4, 'green'), R(1, 'holed')]],
      [4, [R(400, 'tee'), R(120, 'fairway'), R(18, 'bunker', 'short'), R(3, 'green'), R(1, 'holed')]],
      [4, [R(390, 'tee'), R(150, 'fairway'), R(25, 'rough', 'right'), R(7, 'green'), R(1, 'holed')]],
      [4, [R(400, 'tee'), R(150, 'fairway'), R(12, 'green', 'longright'), R(2, 'green'), R(1, 'holed')]],
      [3, [R(170, 'tee'), R(22, 'green', 'short'), R(3, 'green'), R(1, 'holed')]],
      [4, [R(360, 'tee'), R(100, 'fairway'), R(6, 'holed', 'left')]],
      [5, [R(520, 'tee'), R(250, 'fairway'), R(80, 'fairway'), R(40, 'green', 'long'), R(4, 'green'), R(1, 'holed')]],
      [4, [R(410, 'tee'), R(170, 'rough', 'R'), R(28, 'green', 'O'), R(3, 'green'), R(1, 'holed')]],
      [4, [R(390, 'tee'), R(130, 'fairway'), R(9, 'holed', 'shortleft')]],
      [3, [R(150, 'tee'), R(15, 'green', 'right'), R(2, 'green'), R(1, 'holed')]]
    ].map(([par, rows]) => ({ par, finished: true, rows }));
    while (demo.length < 18) demo.push({ par: 4, finished: false, rows: [R('', 'tee')] });
    localStorage.setItem('golfsg.rounds.v1', JSON.stringify([{ id: 'rv2', date: '2026-10-08T05:00:00.000Z', course: 'Scott v2 save', holes },
      { v: 3, id: 'rdemo', date: '2026-10-01T20:00:00.000Z', course: 'Lakeridge', baseline: 'pga', holes: demo }]));
    localStorage.setItem('golfsg.current.v1', 'rv2');
  });
  await page.reload(); await page.waitForSelector('text=Golf Shot Tracker');
  const swScope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope); assert.ok(swScope.startsWith(URL), swScope); ok('service worker scope = ' + swScope);
  const mig = await page.evaluate(() => { const rs = JSON.parse(localStorage.getItem('golfsg.rounds.v1')); return [rs[0].holes[0].rows[1].dir, rs[1].holes[1].rows[2].dir, rs[1].holes[2].rows[1].dir, rs[1].holes[11].rows[2].dir, rs[1].holes[3].rows[1].dir, rs[1].dv]; });
  assert.deepStrictEqual(mig, ['left', 'right', 'short', 'long', 'left', 2]); ok('old direction codes migrated: L→Left, R→Right, S→Short, O→Long');
  await act('resume'); await page.waitForSelector('.holecard');
  assert.strictEqual(await page.getAttribute('[data-act="dirpick"][data-k="1"]', 'data-dir'), 'left');
  assert.strictEqual(await page.textContent('[data-act="dirpick"][data-k="1"]'), '←'); ok('row direction shows as ← (Left)');
  assert.match(await count(), /^4 strokes/); ok("Scott's saved hole (365 Tee, 100 F L, 6 G, In the hole) counts 4 strokes");
  assert.ok(await finishDisabled()); assert.match(await hint(), /Missing: distance in row 4/);
  assert.match(await header(), /No holes finished/); ok('…and stays unfinished (Finish disabled, "Missing: distance in row 4"), not in totals');
  assert.ok(!(await page.textContent('.sinfo[data-info="2"]')).includes('in the hole'), 'the 6 ft putt is not marked holed'); ok('6 ft putt is NOT shown as holed');
  await hideToast(); await page.screenshot({ path: `${SHOTS}/10-finish-disabled.png` });
  await dist(3, 1);
  assert.ok(!(await finishDisabled())); ok('entering the last putt distance enables Finish hole');
  await act('finish');
  assert.match(await page.textContent('.hole-done'), /Score 4 \(E\)/); assert.match(await header(), /Total 4 \(E\) thru 1/);
  ok('Finish → Score 4 (E), header Total 4 (E) thru 1');
  await act('home');

  // New round: Scott's example 365 Tee, 130 F, 15 ft G, 3 ft In the hole
  // Baseline picker on the new-round form
  const opts = await page.$$eval('#newbl option', os => os.map(o => o.value + '|' + o.textContent));
  assert.deepStrictEqual(opts, ['pga|PGA Tour', 'lpga|LPGA Tour (estimated)', 'd1m|D1 college men (estimated)', 'd1w|D1 college women (estimated)', 'scm|Scratch men (estimated)', 'scw|Scratch women (estimated)']);
  assert.strictEqual(await page.$eval('#newbl', e => e.value), 'pga'); ok('new-round baseline picker: 6 baselines, default PGA Tour, others marked estimated');
  await page.fill('#course', 'Washoe County GC');
  await page.selectOption('#newbl', 'd1m');
  await hideToast(); await page.screenshot({ path: `${SHOTS}/1-new-round-baseline-picker.png` });
  await act('new');
  assert.match(await header(), /SG vs D1 college men/); ok('round stores its baseline; hole header shows "SG vs D1 college men"');
  assert.ok(await page.evaluate(() => document.activeElement.getAttribute('data-row') === '0')); ok('new hole: cursor in row 1 distance (Tee)');
  await dist(0, 365);
  await act('addShot'); assert.ok(await page.evaluate(() => document.activeElement.getAttribute('data-row') === '1')); ok('Add Shot adds row 2 and focuses its distance');
  await dist(1, 130);
  await act('addShot'); assert.match(await page.textContent('#toast'), /location in row 2/); ok('Add Shot asks for missing location');
  await loc(1, 'fairway');
  assert.match(await page.textContent('.sinfo[data-info="0"]'), /hit 235 yd/); ok('row 1 info: hit 235 yd (365 - 130)');
  await act('addShot'); await loc(2, 'green'); await dist(2, 15);
  assert.match(await page.textContent('[data-unit="2"]'), /ft/); ok('green row in feet');
  await act('addShot');
  assert.strictEqual(await page.$eval('select[data-f="loc"][data-k="3"]', e => e.value), 'green'); ok('row after green defaults to Green');
  await dist(3, 3);
  assert.ok(await finishDisabled()); assert.match(await hint(), /last row "In the hole"/); ok('Finish disabled until last row is In the hole');
  await loc(3, 'holed');
  assert.strictEqual(await page.locator('.hole-done').count(), 0); assert.ok(!(await finishDisabled()));
  ok('choosing In the hole does NOT auto-finish; Finish becomes active');
  assert.match(await count(), /^4 strokes/);
  await hideToast(); await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: `${SHOTS}/7-hole-complete-finish-ready.png` });
  await act('finish');
  assert.match(await page.textContent('.hole-done'), /Score 4 \(E\)/); ok("Scott's example scores 4 (E)");
  await hideToast(); await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: `${SHOTS}/8-hole-finished-score4.png` });
  // Reopen, edit, re-finish
  await act('reopen'); assert.ok(!(await page.$eval('input[data-row="2"]', e => e.disabled))); ok('Edit this hole reopens it');
  await actK('del', 2); assert.match(await count(), /^3 strokes/); await act('finish');
  assert.match(await page.textContent('.hole-done'), /Score 3 \(-1\)/); ok('delete a row + re-finish → 3 (-1)');
  await act('reopen'); await actK('menu', 1); await actK('insAfter', 1);
  assert.ok(await finishDisabled()); await dist(2, 15); await loc(2, 'green'); await act('finish');
  assert.match(await page.textContent('.hole-done'), /Score 4 \(E\)/); ok('insert a row + re-finish → 4 (E)');
  await noOverflow('hole table');

  // Hole 2 via Add Hole
  assert.match(await page.textContent('[data-act="next"].big'), /Add Hole 2/);
  await page.locator('[data-act="next"].big').click();
  assert.match(await page.textContent('.hc-head'), /Hole 2/); ok('Add Hole 2 moves to hole 2');
  await act('par', 3); await dist(0, 165);
  await act('addShot'); await dist(1, 15); await loc(1, 'bunker');
  await actK('dirpick', 1);
  const grid = await page.$$eval('.sheet .dirgrid button', bs => bs.map(b => b.getAttribute('data-v')));
  assert.deepStrictEqual(grid, ['longleft', 'long', 'longright', 'left', '', 'right', 'shortleft', 'short', 'shortright']);
  const names = await page.$$eval('.sheet .dirgrid button', bs => bs.map(b => b.textContent.slice(1)));
  assert.deepStrictEqual(names, ['Long left', 'Long', 'Long right', 'Left', 'None', 'Right', 'Short left', 'Short', 'Short right']);
  ok('direction picker: 3×3 grid, 8 directions + None, Short at the bottom (toward you)');
  await hideToast(); await page.screenshot({ path: `${SHOTS}/13-direction-picker.png` });
  await page.locator('.sheet [data-act="setdir"][data-v="shortleft"]').click();
  assert.strictEqual(await page.textContent('[data-act="dirpick"][data-k="1"]'), '↙');
  await dir(1, 'L');
  assert.strictEqual(await page.textContent('[data-act="dirpick"][data-k="1"]'), '←');
  assert.match(await page.textContent('.sinfo[data-info="0"]'), /left \(missed green\)/); ok('pick Short left → ↙, change to Left → ←; info says "left (missed green)"');
  await act('addShot'); await dist(2, 4); await loc(2, 'green');
  await act('addShot'); await dist(3, 1); await loc(3, 'holed'); await act('finish');
  assert.match(await page.textContent('.hole-done'), /Score 4 \(\+1\)/); ok('hole 2: 165 Tee, 15 Bunker L, 4 ft G, 1 ft In the hole = 4 (+1)');

  // Hole 3: OB re-hit + hazard drop
  await page.locator('[data-act="next"].big').click();
  await act('par', 5); await dist(0, 520);
  await act('addShot'); await loc(1, 'ob'); await dir(1, 'R');
  assert.match(await page.textContent('.srow[data-k="1"]'), /520 yd/);
  assert.match(await page.getAttribute('[data-act="pen"][data-k="1"]', 'class'), /on/); ok('OB re-hit row: same 520 yd spot, +1 automatic');
  await act('addShot'); await dist(2, 250); await loc(2, 'hazard'); await actK('pen', 2); await dir(2, 'L');
  await act('addShot'); await dist(3, 90); await loc(3, 'fairway');
  await act('addShot'); await dist(4, 8); await loc(4, 'green');
  await act('addShot'); await dist(5, 2); await loc(5, 'holed');
  assert.match(await count(), /6 strokes \+ 2 penalty strokes = 8/); ok('count line: 6 strokes + 2 penalty strokes = 8');
  // a row after In the hole blocks Finish
  await actK('menu', 5); await actK('insAfter', 5);
  assert.ok(await finishDisabled()); assert.match(await hint(), /delete the rows after it/); ok('rows after In the hole block Finish');
  await actK('del', 6);
  await act('finish');
  assert.match(await page.textContent('.hole-done'), /Score 8 \(\+3\)/); ok('hole 3 with OB + hazard drop = 8 (+3)');
  await page.screenshot({ path: `${SHOTS}/9-hole-ob-hazard.png`, fullPage: true });
  // back arrows to a finished hole
  await act('prev'); await act('prev');
  assert.match(await page.textContent('.hc-head'), /Hole 1/); assert.match(await page.textContent('.hole-done'), /Score 4/); ok('‹ arrows go back to finished hole 1');

  // Summary
  await page.locator('[data-act="summary"]').first().click();
  const sum = await page.evaluate(() => SG.summarize(window.__golf.rounds()[0]));
  assert.strictEqual(sum.baseline, 'd1m'); assert.strictEqual(await page.$eval('#sumbl', e => e.value), 'd1m');
  assert.match(await page.textContent('#blnote'), /D1 college men – estimated/); ok('summary shows the baseline in use (D1 college men, estimated)');
  assert.strictEqual(sum.strokes, 16); assert.strictEqual(sum.par, 12); assert.strictEqual(sum.penalties, 2);
  assert.strictEqual(sum.putts, 6); assert.strictEqual(sum.fwHit, 1); assert.strictEqual(sum.fwTotal, 2);
  assert.match(await page.textContent('.big-score'), /16\s*\+4 vs par/); ok('summary: 16 (+4) = 4 + 4 + 8, 2 penalties, 6 putts, FW 1/2');
  const card = await page.$$eval('.card button b', els => els.slice(0, 3).map(e => e.textContent));
  assert.deepStrictEqual(card, ['4', '4', '8']); ok('scorecard shows 4, 4, 8');
  await page.locator('[data-act="goHole"][data-i="2"]').click();
  assert.match(await page.textContent('.hc-head'), /Hole 3/); ok('tap scorecard hole opens it');
  await act('reopen'); await page.locator('[data-act="summary"]').first().click();
  assert.match(await page.textContent('.big-score'), /8\s*\+1 vs par · 2 holes/); ok('reopened hole drops out of totals until re-finished');
  await page.locator('[data-act="goHole"][data-i="2"]').click(); await act('finish');
  await page.locator('[data-act="summary"]').first().click();
  const csv = await page.evaluate(() => window.__golf.csvFor([window.__golf.rounds()[0]]));
  const lines = csv.trim().split('\r\n'); assert.strictEqual(lines.length, 1 + 4 + 4 + 6);
  assert.strictEqual(lines[0].split(',').pop(), 'baseline'); assert.ok(lines.slice(1).every(l => l.endsWith(',D1 college men (estimated)'))); ok('CSV has a baseline column');
  const scores = new Set(lines.slice(1).map(l => l.split(',')[20])); assert.deepStrictEqual([...scores].sort(), ['4', '8']);
  ok('CSV: 14 shot rows, hole scores 4/4/8');
  const [dl] = await Promise.all([page.waitForEvent('download'), act('csv')]);
  assert.match(dl.suggestedFilename(), /golf-\d{4}-\d\d-\d\d-Washoe-County-GC\.csv/); ok('CSV download: ' + dl.suggestedFilename());
  await page.screenshot({ path: `${SHOTS}/4-summary.png` });

  // Switch baseline on the summary: instant recalculation + side-by-side comparison
  const expectAll = await page.evaluate(() => SG.BASELINES.map(b => { const S = SG.summarize(window.__golf.rounds()[0], b.id); return [b.id, S.sgTotal, S.cats.tee.sg, S.cats.putting.sg]; }));
  const cmpRows = await page.$$eval('#cmp tr[data-act="setbl"]', trs => trs.map(t => [t.getAttribute('data-v'), t.lastElementChild.textContent]));
  assert.strictEqual(cmpRows.length, 6);
  const f2 = v => { const s = (Math.round(v * 100) / 100).toFixed(2); return (v > 0.004 ? '+' : '') + (s === '-0.00' ? '0.00' : s); };
  cmpRows.forEach((r, i) => { assert.strictEqual(r[0], expectAll[i][0]); assert.strictEqual(r[1], f2(expectAll[i][1])); });
  for (let i = 1; i < 6; i++) assert.ok(expectAll[i][1] > expectAll[0][1], 'weaker baseline → more SG');
  ok('comparison table: same round vs all 6 baselines, totals ' + cmpRows.map(r => r[0] + ' ' + r[1]).join(', '));
  const before = await page.textContent('#sgtotal');
  await page.selectOption('#sumbl', 'scm');
  assert.strictEqual(await page.textContent('#sgtotal'), f2(expectAll[4][1])); assert.notStrictEqual(await page.textContent('#sgtotal'), before);
  assert.strictEqual(await page.evaluate(() => window.__golf.rounds()[0].baseline), 'scm');
  assert.match(await page.textContent('#blnote'), /Scratch men – estimated/);
  assert.strictEqual(await page.getAttribute('#cmp tr.cur', 'data-v'), 'scm');
  ok(`switching baseline recalculates instantly: ${before} (D1 men) → ${f2(expectAll[4][1])} (scratch men), saved with the round`);
  await page.locator('#cmp tr[data-v="pga"]').click();
  assert.strictEqual(await page.$eval('#sumbl', e => e.value), 'pga'); assert.strictEqual(await page.textContent('#sgtotal'), f2(expectAll[0][1]));
  assert.match(await page.textContent('#blnote'), /published PGA Tour data/); ok('tapping a comparison row switches to it (PGA Tour, published)');
  await page.selectOption('#sumbl', 'scm'); await hideToast();
  await page.locator('.blbox').scrollIntoViewIfNeeded(); await page.evaluate(() => window.scrollBy(0, -70));
  await page.screenshot({ path: `${SHOTS}/11-summary-baseline-compare.png` });
  await page.locator('[data-act="goHole"][data-i="0"]').click();
  assert.match(await header(), /SG vs Scratch men/); ok('hole screen follows the switched baseline');
  await page.locator('[data-act="summary"]').first().click();
  await noOverflow('summary');
  // Approach-miss and GIR maps
  assert.match(await page.textContent('[data-act="map"][data-v="miss"]'), /^1\s*Approach misses/); 
  assert.match(await page.textContent('[data-act="map"][data-v="miss"] .mini'), /←1/); ok('Approach misses tile: 1 (←1)');
  await hideToast(); await page.locator('[data-act="map"][data-v="gir"]').scrollIntoViewIfNeeded(); await page.evaluate(() => window.scrollBy(0, 250));
  await page.screenshot({ path: `${SHOTS}/16-summary-map-tiles.png` });
  await page.locator('[data-act="map"][data-v="miss"]').click();
  await page.waitForSelector('#missmap');
  const box = await page.$eval('#mapview', e => { const r = e.getBoundingClientRect(); return [r.width, r.height]; }); assert.deepStrictEqual(box, [390, 844]); ok('miss map opens full-window (390×844)');
  assert.match(await page.textContent('#mapsum'), /1 approach missed the green this round/);
  assert.strictEqual(await page.textContent('#missmap .mcount[data-dir="left"] text'), '1');
  assert.strictEqual(await page.locator('#missmap .mdot').count(), 1);
  assert.strictEqual(await page.textContent('#dirtab tr[data-dir="left"] td.num'), '1'); ok('this round: 1 miss, plotted left of the green, counts table Left 1');
  await act('mapscope', 'all');
  const exp = await page.evaluate(() => window.__golf.rounds().reduce((n, r) => n + SG.summarize(r).apprMiss.length, 0));
  assert.strictEqual(exp, 8);
  assert.match(await page.textContent('#mapsum'), /8 approaches missed the green in 3 rounds/);
  const cnt = await page.$$eval('#missmap .mcount', gs => Object.fromEntries(gs.map(g => [g.getAttribute('data-dir'), +g.textContent])));
  assert.deepStrictEqual(cnt, { long: 0, longright: 0, right: 2, shortright: 1, short: 2, shortleft: 1, left: 1, longleft: 1 });
  assert.strictEqual(await page.locator('#missmap .mdot').count(), 8); ok('all rounds: 8 misses by sector ' + JSON.stringify(cnt));
  await page.screenshot({ path: `${SHOTS}/14-approach-miss-map.png` });
  await page.screenshot({ path: `${SHOTS}/14b-approach-miss-map-full.png`, fullPage: false });
  await page.locator('#mapview').evaluate(e => e.scrollTo(0, e.scrollHeight)); await page.screenshot({ path: `${SHOTS}/14c-approach-miss-map-counts.png` });
  await act('mapclose'); assert.strictEqual(await page.locator('#mapview').count(), 0); ok('Close returns to the summary');
  assert.match(await page.textContent('[data-act="map"][data-v="gir"]'), /^1 \/ 3/);
  await page.locator('[data-act="map"][data-v="gir"]').click(); await page.waitForSelector('#girmap');
  assert.strictEqual(await page.$eval('[data-act="mapscope"][data-v="all"]', e => e.className), 'sel', 'scope remembered');
  await act('mapscope', 'round');
  assert.match(await page.textContent('#mapsum'), /1 green in regulation this round/);
  assert.match(await page.textContent('#dirtab'), /No direction entered \(not plotted\)1/); ok('GIR map this round: 1 GIR (no direction entered → listed, not plotted)');
  const rings = await page.$$eval('#girmap text.ring', ts => ts.map(t => t.textContent));
  assert.deepStrictEqual(rings, ['30 ft', '25 ft', '20 ft', '15 ft', '10 ft', '5 ft']); ok('GIR map: 6 labelled rings 5–30 ft');
  await act('mapscope', 'all');
  assert.match(await page.textContent('#mapsum'), /9 greens in regulation in 3 rounds/);
  const dots = await page.$$eval('#girmap .gdot', cs => cs.map(c => [+c.getAttribute('cx'), +c.getAttribute('cy'), c.getAttribute('fill')]));
  assert.strictEqual(dots.length, 7);
  const near = (p, x, y) => Math.abs(p[0] - x) < 0.6 && Math.abs(p[1] - y) < 0.6;
  assert.ok(dots.some(p => near(p, 180, 200 + 22 * 5)), '22 ft short → straight below the hole');
  assert.ok(dots.some(p => near(p, 180 - 6 * 5, 200)), '6 ft left → left of the hole');
  assert.ok(dots.some(p => near(p, 180 + 12 * 5 * Math.SQRT1_2, 200 - 12 * 5 * Math.SQRT1_2)), '12 ft long right → up-right');
  assert.ok(dots.some(p => near(p, 180, 200 - 33 * 5) && p[2] === '#ffd23f'), '40 ft long → at the edge, yellow');
  assert.ok((await page.textContent('#girmap')).includes('40 ft')); ok('GIR dots: radius = first-putt ft, angle = direction (short ↓, long ↑, left ←); 40 ft drawn at the edge with label');
  assert.match(await page.textContent('.mapview .help'), /par − 2 strokes or fewer/); ok('GIR definition shown on screen');
  await page.screenshot({ path: `${SHOTS}/15-gir-map.png` });
  await page.locator('#mapview').evaluate(e => e.scrollTo(0, e.scrollHeight)); await page.screenshot({ path: `${SHOTS}/15b-gir-map-counts.png` });
  await act('mapclose');
  await noOverflow('summary with tiles');
  // About the numbers
  await act('about');
  const about = await page.textContent('.about');
  assert.match(about, /Table 9/); assert.match(about, /No published expected-strokes table exists/); assert.match(about, /5\.5 strokes per round/);
  assert.strictEqual(await page.locator('.about a[href*="columbia.edu"]').count(), 1);
  assert.strictEqual(await page.locator('.about a[href*="swingu.com"]').count(), 1);
  assert.strictEqual(await page.locator('.about a[href*="clippd.com"]').count(), 1);
  assert.strictEqual(await page.locator('.about table tr').count(), 7);
  ok('About the numbers: cites Broadie Table 9, SwingU, Clippd; 6 baselines listed as Published/Estimated');
  await noOverflow('about');
  await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: `${SHOTS}/12-about-the-numbers.png` });
  await page.screenshot({ path: `${SHOTS}/12b-about-the-numbers-full.png`, fullPage: true });
  await act('aboutBack'); await page.waitForSelector('#sumbl'); ok('About › Back returns to the summary');
  // A past round (saved before baselines existed) can be benchmarked too
  await act('home');
  await page.locator('[data-act="open"][data-id="rv2"]').click();
  assert.strictEqual(await page.$eval('#sumbl', e => e.value), 'pga'); ok('old round defaults to PGA Tour');
  const old = await page.evaluate(() => { const r = window.__golf.rounds().find(x => x.id === 'rv2'); return [SG.summarize(r, 'pga').sgTotal, SG.summarize(r, 'scw').sgTotal]; });
  await page.selectOption('#sumbl', 'scw');
  assert.strictEqual(await page.textContent('#sgtotal'), f2(old[1])); ok(`past round re-benchmarked: ${f2(old[0])} vs PGA → ${f2(old[1])} vs scratch women`);
  await page.selectOption('#sumbl', 'pga');
  await act('home');
  await page.locator('[data-act="open"]').first().click();

  // Persistence + offline
  await page.reload(); await page.waitForSelector('text=Continue round'); ok('rounds persist after reload');
  assert.strictEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('golfsg.rounds.v1'))[0].baseline), 'scm'); ok('switched baseline persists after reload');
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 }).catch(async () => { await page.reload(); await page.waitForFunction(() => !!navigator.serviceWorker.controller); });
  await ctx.setOffline(true);
  await page.reload(); await page.waitForSelector('text=Continue round');
  await act('resume'); await page.waitForSelector('.holecard'); ok('works offline (service worker)');
  await ctx.setOffline(false);
  await act('home');
  const small = await page.evaluate(() => [...document.querySelectorAll('button')].filter(b => b.getBoundingClientRect().height < 44).length);
  assert.strictEqual(small, 0); ok('home buttons ≥ 44px');
  await act('resume');
  const smallH = await page.evaluate(() => [...document.querySelectorAll('button, select, input')].filter(b => { const r = b.getBoundingClientRect(); return r.height < 44 || r.width < (b.classList.contains('c-n') ? 30 : 44); }).map(b => b.outerHTML.slice(0, 60)));
  assert.deepStrictEqual(smallH, []); ok('hole screen tap targets ≥ 44×44px (row-number buttons 30×48)');
  await noOverflow('hole'); ok('no sideways scrolling at 390px');
  assert.deepStrictEqual(errors, []); ok('no JS console errors');
  console.log(`\nE2E: ${passed} checks passed`);
  await browser.close(); srv.kill();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
