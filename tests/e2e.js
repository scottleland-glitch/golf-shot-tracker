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
    // pin locations on some history holes (for the pin-location map)
    Object.assign(demo[0], { pin: 'frontleft' }); Object.assign(demo[1], { pin: 'frontleft' }); Object.assign(demo[2], { pin: 'backright' });
    Object.assign(demo[7], { pin: 'frontleft' }); Object.assign(demo[8], { pin: 'frontleft' }); Object.assign(demo[9], { pin: 'center' });
    Object.assign(demo[12], { pin: 'frontleft' });
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
  // Pin location
  assert.match(await page.textContent('#pinbtn'), /Set pin location/); ok('hole card has "Set pin location" button');
  await page.click('#pinbtn'); await page.waitForSelector('#pinview');
  assert.deepStrictEqual(await page.$eval('#pinview', e => { const r = e.getBoundingClientRect(); return [r.width, r.height]; }), [390, 844]);
  const segs = await page.$$eval('#pingreen button', bs => bs.map(b => b.getAttribute('data-v') + '|' + b.innerText.replace(/\s+/g, ' ').trim()));
  assert.deepStrictEqual(segs, ['backleft|Back left', 'backcenter|Back center', 'backright|Back right', 'midleft|Middle left', 'center|Center', 'midright|Middle right', 'frontleft|Front left', 'frontcenter|Front center', 'frontright|Front right']);
  const fy = await page.$eval('#pingreen [data-v="frontleft"]', e => e.getBoundingClientRect().y), by = await page.$eval('#pingreen [data-v="backleft"]', e => e.getBoundingClientRect().y);
  assert.ok(fy > by, 'front is at the bottom'); ok('pin picker: full window, 3×3 green, back at top, front at bottom');
  await page.click('#pingreen [data-v="frontleft"]');
  assert.strictEqual(await page.getAttribute('#pingreen button.sel', 'data-v'), 'frontleft'); assert.match(await page.textContent('#pincur'), /Front left – saved/);
  assert.strictEqual(await page.evaluate(() => window.__golf.rounds()[0].holes[0].pin), 'frontleft'); ok('tap Front left → highlighted and saved to the hole');
  await hideToast(); await page.screenshot({ path: `${SHOTS}/17-pin-picker.png` });
  await act('pinclose');
  assert.match(await page.textContent('#pinbtn'), /Pin: front left/); ok('button now shows "Pin: front left"');
  await page.click('#pinbtn'); await page.click('#pingreen [data-v="backright"]'); await act('pinclear');
  assert.strictEqual(await page.locator('#pingreen button.sel').count(), 0); assert.strictEqual(await page.evaluate(() => window.__golf.rounds()[0].holes[0].pin), '');
  await page.locator('#pinview [data-act="pinclose"]').last().click();
  assert.match(await page.textContent('#pinbtn'), /Set pin location/); ok('pin can be changed and cleared');
  await page.click('#pinbtn'); await page.click('#pingreen [data-v="backright"]'); await page.locator('#pinview [data-act="pinclose"]').last().click();
  assert.match(await page.textContent('#pinbtn'), /Pin: back right/);
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
  const hdr = lines[0].split(','); assert.deepStrictEqual(hdr.slice(-2), ['baseline', 'pin']);
  assert.ok(lines.slice(1).every(l => l.split(',')[21] === 'D1 college men (estimated)')); ok('CSV has a baseline column');
  assert.deepStrictEqual([...new Set(lines.slice(1).map(l => l.split(',')[2] + ':' + l.split(',')[22]))], ['1:backright', '2:', '3:']); ok('CSV pin column: hole 1 = backright, others blank');
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
  assert.match(await page.textContent('#dirtab'), /No direction entered \(drawn as \?\)1/);
  const nd = await page.$$eval('#girmap .gdot', gs => gs.map(g => [g.getAttribute('data-kind'), +g.getAttribute('data-x'), +g.getAttribute('data-y')]));
  assert.deepStrictEqual(nd, [['nodir', 180, 200 - 15 * 5]]); ok('GIR map this round: 1 GIR with no direction is PLOTTED as "?" at 15 ft, straight up');
  assert.match(await page.textContent('#mapview .legend'), /No direction entered – right distance/);
  const rings = await page.$$eval('#girmap text.ring', ts => ts.map(t => t.textContent));
  assert.deepStrictEqual(rings, ['30 ft', '25 ft', '20 ft', '15 ft', '10 ft', '5 ft']); ok('GIR map: 6 labelled rings 5–30 ft');
  await act('mapscope', 'all');
  assert.match(await page.textContent('#mapsum'), /9 greens in regulation in 3 rounds/);
  const allG = await page.$$eval('#girmap .gdot', gs => gs.map(g => g.getAttribute('data-kind')));
  const tileSum = await page.evaluate(() => window.__golf.rounds().reduce((n, r) => n + SG.summarize(r).gir, 0));
  assert.strictEqual(tileSum, 9); assert.strictEqual(allG.length, 9); assert.deepStrictEqual(allG.filter(k => k === 'nodir').length, 2);
  ok('all rounds: map header 9 = sum of GIR tiles 9 = 9 markers plotted (2 without direction)');
  const dots = await page.$$eval('#girmap circle.gdot', cs => cs.map(c => [+c.getAttribute('cx'), +c.getAttribute('cy'), c.getAttribute('fill')]));
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
  // Fairway (tee shot) map
  assert.match(await page.textContent('[data-act="map"][data-v="fw"]'), /^1 \/ 2\s*Fairways hit/);
  await page.locator('[data-act="map"][data-v="fw"]').click(); await page.waitForSelector('#fwmap');
  await act('mapscope', 'round');
  assert.match(await page.textContent('#mapsum'), /Fairways hit 1 \/ 2 \(50%\) this round/);
  const tr1 = await page.$$eval('#fwmap path.tracer', ps => ps.map(p => p.getAttribute('class').split(' ')[1] + ':' + p.getAttribute('data-kind') + ':' + p.getAttribute('data-side')));
  assert.deepStrictEqual(tr1, ['hit:fairway:', 'miss:ob:R']);
  assert.match(await page.textContent('#fwcounts'), /Missed left 0.*Missed right 1/); ok('fairway map this round: 2 tracers (fairway hit, OB right), 1/2, right 1');
  await act('mapscope', 'all');
  assert.match(await page.textContent('#mapsum'), /Fairways hit 10 \/ 13 \(77%\) in 3 rounds/);
  const tr = await page.$$eval('#fwmap path.tracer', ps => ps.map(p => p.getAttribute('class').split(' ')[1]));
  assert.strictEqual(tr.filter(x => x === 'hit').length, 10); assert.strictEqual(tr.filter(x => x === 'miss').length, 3);
  assert.match(await page.textContent('#fwcounts'), /Missed left 1.*Missed right 2/);
  assert.deepStrictEqual(await page.$$eval('#fwtab tr[data-kind]', rs => rs.map(r => r.getAttribute('data-kind') + ' ' + [...r.querySelectorAll('td.num')].map(t => t.textContent).join('/'))),
    ['rough 1/1/2', 'bunker 0/0/0', 'hazard 0/0/0', 'trees 0/0/0', 'ob 0/1/1']);
  // geometry: misses left end left of the tee, rights to the right, length ∝ distance hit (1.5 px/yd from y=532)
  const ends = await page.$$eval('#fwmap path.tracer', ps => ps.map(p => { const n = p.getAttribute('d').split(/[ MQ]+/).filter(Boolean).map(Number); return [p.getAttribute('data-side'), p.getAttribute('class').split(' ')[1], n[4], n[5]]; }));
  ends.filter(e => e[1] === 'miss').forEach(e => assert.ok(e[0] === 'L' ? e[2] < 140 : e[2] > 220, 'miss side ' + e));
  ends.filter(e => e[1] === 'hit').forEach(e => assert.ok(e[2] > 140 && e[2] < 220, 'hit inside fairway ' + e));
  assert.ok(ends.some(e => Math.abs(e[3] - (532 - 235 * 1.5)) < 0.01), 'Washoe hole 1 drive 235 yd');
  ok('all rounds: 10/13 (77%), left 1 / right 2, tracers end on the correct side at the scaled distance');
  assert.match(await page.textContent('#mapview .legend'), /OB \(length unknown/);
  await page.screenshot({ path: `${SHOTS}/18-fairway-map.png` });
  await page.locator('#mapview').evaluate(e => e.scrollTo(0, e.scrollHeight)); await page.screenshot({ path: `${SHOTS}/18b-fairway-map-counts.png` });
  await act('mapclose'); ok('fairway map closes');
  // Pin-location map
  assert.match(await page.textContent('[data-act="map"][data-v="pin"]'), /^1 \/ 3\s*Pin location/); ok('Pin location tile: 1 / 3 holes with a pin set');
  await page.locator('[data-act="map"][data-v="pin"]').click(); await page.waitForSelector('#pinstats');
  await act('mapscope', 'round');
  assert.match(await page.textContent('#mapsum'), /1 hole with a pin set this round/); assert.match(await page.textContent('#nopin'), /2 finished holes have no pin set – not included/);
  assert.strictEqual(await page.getAttribute('#pinstats [data-v="backright"]', 'data-n'), '1'); ok('this round: Back right badge 1, "2 finished holes have no pin set" note');
  await act('mapscope', 'all');
  const badges = await page.$$eval('#pinstats button', bs => Object.fromEntries(bs.map(b => [b.getAttribute('data-v'), +b.getAttribute('data-n')])));
  assert.deepStrictEqual(badges, { backleft: 0, backcenter: 0, backright: 2, midleft: 0, center: 1, midright: 0, frontleft: 5, frontcenter: 0, frontright: 0 });
  assert.match(await page.textContent('#pinstats [data-v="frontleft"]'), /GIR 3\/5/);
  assert.match(await page.textContent('#mapsum'), /8 holes with a pin set in 3 rounds/); assert.match(await page.textContent('#nopin'), /10 finished holes have no pin set/);
  assert.strictEqual(Object.values(badges).reduce((a, b) => a + b, 0), 8, 'sum of badges = header');
  const gy = await page.$$eval('#pinstats button', bs => bs.filter(b => b.querySelector('small')).map(b => [+b.getAttribute('data-n'), +b.querySelector('small').textContent.split('/')[1]]));
  gy.forEach(([n, y]) => assert.strictEqual(y, n, 'GIR y = badge'));
  ok('all rounds overview: badges ' + JSON.stringify(badges) + ', Front left GIR 3/5, 10 holes without pin noted');
  await page.screenshot({ path: `${SHOTS}/20-pin-map-overview.png` });
  await page.click('#pinstats [data-v="frontleft"]'); await page.waitForSelector('#pinmap');
  assert.match(await page.textContent('#mapsum'), /Pin Front left: 5 holes in 3 rounds/);
  assert.match(await page.textContent('#pinsum'), /Greens hit \(GIR\) 3\s*\+ Missed 2\s*= 5 holes$/);
  const pk = await page.$$eval('#pinmap .pdot', ds => ds.map(d => d.getAttribute('data-kind') + ':' + d.getAttribute('data-hole')));
  assert.deepStrictEqual(pk.sort(), ['gir:13', 'gir:8', 'gir:9', 'miss:1', 'miss:2']);
  const flag = await page.$eval('#pinflag', c => [+c.getAttribute('cx'), +c.getAttribute('cy')]);
  assert.ok(Math.abs(flag[0] - (180 - 0.6 * 110 * 0.85)) < 0.2 && Math.abs(flag[1] - (230 + 0.62 * 140 * 0.85)) < 0.2 && flag[0] < 70 + 220 / 3 && flag[1] > 90 + 280 * 2 / 3, 'flag in the front-left segment ' + flag);
  const g9 = await page.$eval('#pinmap .pdot[data-hole="9"]', c => [+c.getAttribute('cx'), +c.getAttribute('cy')]);
  assert.ok(Math.abs(g9[0] - flag[0]) < 0.2 && g9[1] > flag[1] + 20, '22 ft short = straight below the pin (kept on the green)');
  const g8 = await page.$eval('#pinmap .pdot[data-hole="8"]', c => [+c.getAttribute('cx'), +c.getAttribute('cy')]);
  assert.ok(Math.abs(Math.hypot(g8[0] - flag[0], g8[1] - flag[1]) - 12 * 2.4) < 0.3 && g8[0] > flag[0] && g8[1] < flag[1], '12 ft long right = up-right of the pin at 12 ft');
  const m2 = await page.$eval('#pinmap .pdot[data-hole="2"]', c => +c.getAttribute('cx')); assert.ok(m2 > 290, 'missed right → right of the green');
  const labels = await page.$$eval('#pinmap text.plbl, #pinmap text.mlbl', ts => ts.map(t => t.textContent));
  for (const l of ['12 ft', '22 ft', '9 ft', '20 ydRough', '15 ydBunker']) assert.ok(labels.includes(l), l + ' in ' + labels);
  ok('Front left selected: flag in the segment; 3 white GIR dots by first-putt ft + direction, 2 red misses off the green labelled "20 yd Rough", "15 yd Bunker"');
  assert.match(await page.textContent('#dirtab'), /Short right\s*1/); assert.match(await page.textContent('#dirtab'), /→ Right\s*1/);
  await page.screenshot({ path: `${SHOTS}/21-pin-map-front-left.png` });
  await page.locator('#mapview').evaluate(e => e.scrollTo(0, e.scrollHeight)); await page.screenshot({ path: `${SHOTS}/21b-pin-map-front-left-counts.png` });
  await act('pinseg', ''); await page.waitForSelector('#pinstats'); ok('‹ All pin positions returns to the grid');
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
  // Repro of Scott's real round: GIR tile 5/7 must show 5 markers; hole-outs are not approach misses
  await page.evaluate(() => {
    const R = (dist, loc, dir = '') => ({ dist, loc, dir, pen: false });
    const holes = [
      { par: 4, rows: [R(400, 'tee'), R(150, 'fairway'), R(12, 'green', 'longleft'), R(1, 'holed')] },
      { par: 4, rows: [R(380, 'tee'), R(140, 'fairway'), R(20, 'green'), R(2, 'green'), R(1, 'holed')] },
      { par: 3, rows: [R(170, 'tee'), R(6, 'holed')] },
      { par: 5, rows: [R(520, 'tee'), R(250, 'fairway'), R(90, 'fairway'), R(18, 'green', 'right'), R(3, 'green'), R(1, 'holed')] },
      { par: 4, rows: [R(360, 'tee'), R(110, 'holedx')] },
      { par: 4, rows: [R(420, 'tee'), R(180, 'rough'), R(20, 'rough', 'shortleft'), R(5, 'green'), R(1, 'holed')] },
      { par: 4, rows: [R(410, 'tee'), R(160, 'fairway'), R(12, 'holedx')] }
    ].map(h => Object.assign(h, { finished: true }));
    while (holes.length < 18) holes.push({ par: 4, finished: false, rows: [R('', 'tee')] });
    const rs = JSON.parse(localStorage.getItem('golfsg.rounds.v1'));
    Object.assign(holes[0], { pin: 'center' }); Object.assign(holes[3], { pin: 'center' }); Object.assign(holes[5], { pin: 'center' });
    Object.assign(holes[2], { pin: 'center' }); Object.assign(holes[1], { pin: 'backleft' });
    rs.unshift({ v: 3, dv: 2, id: 'rscott', date: '2026-10-08T18:00:00.000Z', course: 'Repro', baseline: 'pga', holes });
    localStorage.setItem('golfsg.rounds.v1', JSON.stringify(rs));
  });
  await page.reload(); await page.locator('[data-act="open"][data-id="rscott"]').click();
  assert.match(await page.textContent('[data-act="map"][data-v="gir"]'), /^6 \/ 7/);
  assert.match(await page.textContent('[data-act="map"][data-v="miss"]'), /^1\s*Approach misses/);
  assert.ok(!(await page.textContent('[data-act="map"][data-v="miss"]')).includes('?'), 'no "?" misses from hole-outs');
  ok('repro round: GIR tile 6/7; chip-in and eagle hole-out are not approach misses (1 real miss)');
  await page.locator('[data-act="map"][data-v="gir"]').click(); await act('mapscope', 'round');
  assert.match(await page.textContent('#mapsum'), /^6 greens in regulation this round/);
  const kinds = await page.$$eval('#girmap .gdot', gs => gs.map(g => g.getAttribute('data-kind') + ':' + g.getAttribute('data-hole')));
  assert.deepStrictEqual(kinds, ['dir:1', 'nodir:2', 'nodir:3', 'dir:4', 'holed:5', 'holed:7']); ok('GIR map header 6 = tile 6 = 6 markers (2 with direction, 2 "?" without, 2 ★ hole-outs: eagle + chip-in)');
  await page.screenshot({ path: `${SHOTS}/19-gir-map-all-plotted.png` });
  await page.locator('#mapview').evaluate(e => e.scrollTo(0, e.scrollHeight)); await page.screenshot({ path: `${SHOTS}/19b-gir-map-all-plotted-counts.png` });
  await act('mapclose');
  await page.locator('[data-act="map"][data-v="miss"]').click(); await act('mapscope', 'round');
  assert.match(await page.textContent('#mapsum'), /^1 approach missed the green this round/);
  const dsum = await page.$$eval('#dirtab tr[data-dir] td.num', ts => ts.reduce((a, t) => a + +t.textContent, 0)); assert.strictEqual(dsum, 1, 'miss map: direction counts add up to the header');
  await act('mapclose');
  // GIR map: header = tile = direction rows + holed rows
  await page.locator('[data-act="map"][data-v="gir"]').click();
  const gsum = await page.$$eval('#dirtab tr[data-dir] td.num', ts => ts.reduce((a, t) => a + +t.textContent, 0));
  assert.strictEqual(gsum, 6); assert.match(await page.textContent('#mapsum'), /^6 greens/); await act('mapclose');
  ok('GIR map: tile 6 = header 6 = table total 6; miss map: tile 1 = header 1 = table total 1');
  // Pin map on the repro round: counts HOLES (par 5 with two long shots and a missed-then-chip hole count once each)
  assert.match(await page.textContent('[data-act="map"][data-v="pin"]'), /^5 \/ 7/);
  await page.locator('[data-act="map"][data-v="pin"]').click(); await page.waitForSelector('#pinstats');
  const rb = await page.$$eval('#pinstats button', bs => Object.fromEntries(bs.filter(b => +b.getAttribute('data-n')).map(b => [b.getAttribute('data-v'), [+b.getAttribute('data-n'), b.querySelector('small').textContent]])));
  assert.deepStrictEqual(rb, { center: [4, 'GIR 3/4'], backleft: [1, 'GIR 1/1'] });
  assert.match(await page.textContent('#mapsum'), /^5 holes with a pin set this round/); assert.match(await page.textContent('#nopin'), /2 finished holes have no pin set/);
  ok('repro pin map: header 5 = badges 4 + 1; Center GIR 3/4 (y = badge); 2 holes without pin noted');
  await page.screenshot({ path: `${SHOTS}/22-pin-map-holes-overview.png` });
  await page.click('#pinstats [data-v="center"]'); await page.waitForSelector('#pinmap');
  assert.match(await page.textContent('#pinsum'), /Greens hit \(GIR\) 3\s*\+ Missed 1\s*= 4 holes$/);
  const ck = await page.$$eval('#pinmap .pdot', ds => ds.map(d => d.getAttribute('data-kind') + ':' + d.getAttribute('data-hole')).sort());
  assert.deepStrictEqual(ck, ['gir:1', 'gir:4', 'miss:6', 'nodir:3']); ok('Center: 4 dots for 4 holes (par 5 = 1 dot, missed-then-chip = 1 red dot), 3 + 1 = 4');
  await page.screenshot({ path: `${SHOTS}/23-pin-map-holes-center.png` });
  await act('mapclose');
  assert.deepStrictEqual(errors, []); ok('no JS console errors');
  console.log(`\nE2E: ${passed} checks passed`);
  await browser.close(); srv.kill();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
