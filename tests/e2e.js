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
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'], timeout: 600000 });
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
  const card = await page.$$eval('#card-front tr.sscore td:not(.tot)', tds => tds.map(e => [e.textContent, (e.querySelector('.mk') || {}).getAttribute ? e.querySelector('.mk').getAttribute('data-mark') : '']));
  assert.deepStrictEqual(card.slice(0, 3), [['4', 'par'], ['4', 'bogey'], ['8', 'double']]); assert.ok(card.slice(3).every(c => c[0] === '' && c[1] === ''), 'unfinished holes blank');
  assert.strictEqual(await page.textContent('#card-front tr.sscore td.tot'), '16'); assert.strictEqual(await page.textContent('#card-front tr.shole td.tot'), 'OUT');
  assert.strictEqual(await page.textContent('#card-back tr.shole td.tot'), 'IN');
  ok('scorecard: Front 9 shows 4 (par, plain), 4 on the par 3 (bogey, square), 8 on the par 5 (+3, double square), holes 4–9 blank, OUT 16');
  await page.locator('#card-front tr.sscore [data-act="goHole"][data-i="2"]').click();
  assert.match(await page.textContent('.hc-head'), /Hole 3/); ok('tap scorecard hole opens it');
  await act('reopen'); await page.locator('[data-act="summary"]').first().click();
  assert.match(await page.textContent('.big-score'), /8\s*\+1 vs par · 2 holes/); ok('reopened hole drops out of totals until re-finished');
  await page.locator('#card-front tr.sscore [data-act="goHole"][data-i="2"]').click(); await act('finish');
  await page.locator('[data-act="summary"]').first().click();
  const csv = await page.evaluate(() => window.__golf.csvFor([window.__golf.rounds()[0]]));
  const lines = csv.trim().split('\r\n'); assert.strictEqual(lines.length, 1 + 4 + 4 + 6);
  const hdr = lines[0].split(','); assert.deepStrictEqual(hdr.slice(-4), ['baseline', 'pin', 'gir', 'regulation']);
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
  await page.locator('#card-front tr.sscore [data-act="goHole"][data-i="0"]').click();
  assert.match(await header(), /SG vs Scratch men/); ok('hole screen follows the switched baseline');
  await page.locator('[data-act="summary"]').first().click();
  await noOverflow('summary');
  // Approach-miss and GIR maps
  assert.match(await page.textContent('[data-act="map"][data-v="miss"]'), /^2\s*Approach misses/); 
  assert.match(await page.textContent('[data-act="map"][data-v="miss"] .mini'), /←2/); ok('Approach misses tile: 2 (←2) = hole 2 par-3 tee shot in the bunker + hole 3 par-5 regulation shot (the re-tee, stroke 3) into the hazard; GIR 1/3 + 2 misses = 3 holes');
  await hideToast(); await page.locator('[data-act="map"][data-v="gir"]').scrollIntoViewIfNeeded(); await page.evaluate(() => window.scrollBy(0, 250));
  await page.screenshot({ path: `${SHOTS}/16-summary-map-tiles.png` });
  await page.locator('[data-act="map"][data-v="miss"]').click();
  await page.waitForSelector('#missmap');
  const box = await page.$eval('#mapview', e => { const r = e.getBoundingClientRect(); return [r.width, r.height]; }); assert.deepStrictEqual(box, [390, 844]); ok('miss map opens full-window (390×844)');
  assert.match(await page.textContent('#mapsum'), /2 approaches missed the green this round/);
  assert.strictEqual(await page.textContent('#missmap .mcount[data-dir="left"] text'), '2');
  assert.strictEqual(await page.locator('#missmap .mdot').count(), 2);
  assert.strictEqual(await page.textContent('#dirtab tr[data-dir="left"] td.num'), '2'); ok('this round: 2 misses, plotted left of the green, counts table Left 2');
  await act('mapscope', 'all');
  const exp = await page.evaluate(() => window.__golf.rounds().reduce((n, r) => n + SG.summarize(r).apprMiss.length, 0));
  const inv = await page.evaluate(() => window.__golf.rounds().map(r => { const S = SG.summarize(r); return [S.gir, S.apprMiss.length, S.holesDone, S.girMap.length]; }));
  inv.forEach(([g, m, h, gm]) => { assert.strictEqual(g + m, h, 'GIR + misses = holes'); assert.strictEqual(gm, g); });
  assert.match(await page.textContent('#mapsum'), new RegExp(exp + ' approaches missed the green in 3 rounds'));
  const cnt = await page.$$eval('#missmap .mcount', gs => Object.fromEntries(gs.map(g => [g.getAttribute('data-dir'), +g.textContent])));
  const expCnt = await page.evaluate(() => { const c = {}; SG.DIR8.forEach(d => c[d] = 0); window.__golf.rounds().forEach(r => SG.summarize(r).apprMiss.forEach(m => { if (m.dir) c[m.dir]++; })); return c; });
  assert.deepStrictEqual(cnt, expCnt);
  const noDirMiss = await page.evaluate(() => window.__golf.rounds().reduce((n, r) => n + SG.summarize(r).apprMiss.filter(m => !m.dir).length, 0));
  assert.strictEqual(await page.locator('#missmap .mdot').count() + noDirMiss, exp);
  ok(`all rounds: ${exp} misses (GIR + misses = holes in every round: ${inv.map(x => x[0] + '+' + x[1] + '=' + x[2]).join(', ')}); by sector ` + JSON.stringify(cnt));
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
  const ends = await page.$$eval('#fwmap path.tracer', ps => ps.map(p => { const n = p.getAttribute('d').split(/[ MC]+/).filter(Boolean).map(Number); return [p.getAttribute('data-side'), p.getAttribute('class').split(' ')[1], n[6], n[7], p.getAttribute('d')]; }));
  ends.filter(e => e[1] === 'miss').forEach(e => assert.ok(e[0] === 'L' ? e[2] < 140 : e[2] > 220, 'miss side ' + e));
  ends.filter(e => e[1] === 'hit').forEach(e => assert.ok(e[2] > 140 && e[2] < 220, 'hit inside fairway ' + e));
  assert.ok(ends.some(e => Math.abs(e[3] - (532 - 235 * 1.5)) < 0.01), 'Washoe hole 1 drive 235 yd');
  assert.ok(ends.every(e => / C/.test(e[4])), 'fairway tracers are curved arcs');
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
  // Proximity by distance
  const tileExp = await page.evaluate(() => { const L = SG.summarize(window.__golf.rounds()[0]).proxList.filter(m => SG.inBucket('all', m.from)); return SG.proxStats(L); });
  assert.match(await page.textContent('[data-act="map"][data-v="prox"]'), new RegExp('^' + Math.round(tileExp.avgAllFt) + ' ft\\s*Proximity by distance.*avg 40–200 yd · ' + tileExp.n + ' approaches · greens hit ' + tileExp.hits + '/' + tileExp.n));
  ok(`Proximity tile: ${Math.round(tileExp.avgAllFt)} ft avg, ${tileExp.n} approaches, greens hit ${tileExp.hits}/${tileExp.n}`);
  await page.locator('[data-act="map"][data-v="prox"]').click(); await page.waitForSelector('#proxmap');
  const railIds = await page.$$eval('#proxrail .ybtn', bs => bs.map(b => b.getAttribute('data-v')));
  assert.deepStrictEqual(railIds, Array.from({ length: 17 }, (_, i) => String(200 - i * 10)), '17 buttons, 200 at the top, 40 at the bottom');
  assert.match(await page.getAttribute('[data-act="proxb"][data-v="all"]', 'class'), /sel/); assert.match(await page.textContent('#proxsel'), /All 40–200 yd/);
  ok('yardage rail: 17 buttons 200 (top) … 40 (bottom) + All button above the map, All selected');
  // layout at 390 wide: rail on the left, map shifted right, buttons fit the map height
  const geo = await page.evaluate(() => { const r = document.getElementById('proxrail').getBoundingClientRect(), m = document.getElementById('proxmap').getBoundingClientRect();
    const bs = [...document.querySelectorAll('#proxrail .ybtn')].map(b => b.getBoundingClientRect()); return { r: [r.left, r.right, r.top, r.bottom], m: [m.left, m.right, m.top, m.bottom], minH: Math.min(...bs.map(b => b.height)), minW: Math.min(...bs.map(b => b.width)), docW: document.documentElement.scrollWidth }; });
  assert.ok(geo.r[1] <= geo.m[0], 'rail left of the map'); assert.ok(geo.m[1] <= 390 && geo.docW <= 390, 'fits 390 wide');
  assert.ok(geo.minH >= 34, 'buttons at least 34 px tall: ' + geo.minH); assert.ok(Math.abs((geo.r[3] - geo.r[2]) - (geo.m[3] - geo.m[2])) < 2, 'rail = map height');
  ok(`rail ${Math.round(geo.r[1] - geo.r[0])} px wide left of a ${Math.round(geo.m[1] - geo.m[0])}×${Math.round(geo.m[3] - geo.m[2])} map; buttons ${geo.minW.toFixed(0)}×${geo.minH.toFixed(1)} px; no horizontal scroll`);
  await act('mapscope', 'all');
  const expAll = await page.evaluate(() => { const L = []; window.__golf.rounds().forEach(r => SG.summarize(r).proxList.forEach(m => L.push(m)));
    const inA = L.filter(m => SG.inBucket('all', m.from)); return { P: SG.proxStats(inA), outside: L.length - inA.length, byB: SG.PROX_BUCKETS.slice(1).map(b => [b.id, L.filter(m => SG.inBucket(b.id, m.from)).length]) }; });
  const checkView = async (P, label) => {
    assert.match(await page.textContent('#mapsum'), new RegExp('^' + P.n + ' approach'));
    const kinds = await page.$$eval('#proxmap .xdot', ds => ds.map(d => d.getAttribute('data-kind')));
    assert.strictEqual(kinds.length, P.n, label + ': one marker per approach');
    assert.strictEqual(kinds.filter(k => k === 'hit' || k === 'hitnodir' || k === 'holed').length, P.hits, label + ': blue = greens hit');
    assert.strictEqual(kinds.filter(k => k === 'miss' || k === 'missnodir').length, P.misses, label + ': red = misses');
    const st = await page.textContent('#proxstats');
    assert.ok(P.n ? st.includes(P.hits + ' / ' + P.n + ' (' + Math.round(P.hitPct) + '%)') : st.includes('–'), st);
    if (P.avgHitFt != null) assert.ok(st.includes(Math.round(P.avgHitFt) + ' ft'), st);
    if (P.avgAllFt != null) assert.ok(st.includes(Math.round(P.avgAllFt) + ' ft'), st);
    const dsum = await page.$$eval('#dirtab tr[data-dir] td.num', ts => ts.reduce((a, t) => a + +t.textContent, 0)); assert.strictEqual(dsum, P.misses, label + ': misses by direction add up');
  };
  await checkView(expAll.P, 'all');
  // button counts / disabled states match the data and add up to All
  const rbtn = await page.$$eval('#proxrail .ybtn', bs => bs.map(b => [b.getAttribute('data-v'), +b.getAttribute('data-n'), b.disabled, (b.querySelector('small') || {}).textContent || '']));
  const byB = Object.fromEntries(expAll.byB);
  rbtn.forEach(([id, n, dis, small]) => { assert.strictEqual(n, byB[id], id); assert.strictEqual(dis, n === 0, id + ' disabled iff empty'); assert.strictEqual(small, n ? String(n) : ''); });
  assert.strictEqual(rbtn.reduce((a, b) => a + b[1], 0), expAll.P.n, 'button counts add up to All');
  assert.match(await page.textContent('[data-act="proxb"][data-v="all"]'), new RegExp('All 40–200 yd · ' + expAll.P.n + ' shots'));
  if (expAll.outside) assert.match(await page.textContent('#proxout'), new RegExp('^' + expAll.outside + ' regulation shot'));
  ok(`All (all rounds): ${expAll.P.n} approaches = sum of button counts; ${rbtn.filter(b => b[2]).length} empty buttons greyed out + disabled; ${expAll.outside} outside 40–200 noted; ${expAll.P.hits} blue + ${expAll.P.misses} red, avg ${Math.round(expAll.P.avgHitFt)} ft on greens / ${Math.round(expAll.P.avgAllFt)} ft overall`);
  await page.screenshot({ path: `${SHOTS}/29-proximity-rail-all.png` });
  await page.locator('#mapview').evaluate(e => { const m = document.getElementById('proxmap'); e.scrollTop += m.getBoundingClientRect().top - 8; }); await page.screenshot({ path: `${SHOTS}/29b-proximity-rail-all-map.png` });
  // tap 150: only shots hit from 145-154 yd; stats follow
  const pickB = rbtn.filter(b => b[1] > 0).sort((a, b) => b[1] - a[1])[0][0];
  const tgt = rbtn.find(b => b[0] === '150' && b[1] > 0) ? '150' : pickB;
  await page.click(`#proxrail [data-v="${tgt}"]`); await page.waitForSelector('#proxmap');
  assert.match(await page.getAttribute(`#proxrail [data-v="${tgt}"]`, 'class'), /sel/); assert.doesNotMatch(await page.getAttribute('[data-act="proxb"][data-v="all"]', 'class'), /sel/);
  assert.strictEqual(await page.locator('#proxrail .ybtn.sel').count(), 1);
  const expB = await page.evaluate(id => { const L = []; window.__golf.rounds().forEach(r => SG.summarize(r).proxList.forEach(m => { if (SG.inBucket(id, m.from)) L.push(m); })); return SG.proxStats(L); }, tgt);
  await checkView(expB, tgt);
  const froms = await page.$$eval('#proxmap .xdot', ds => ds.map(d => +d.getAttribute('data-from')));
  assert.ok(froms.every(f => f >= +tgt - 5 && f < +tgt + 5), 'only shots that round to ' + tgt + ': ' + froms);
  assert.match(await page.textContent('#proxsel'), new RegExp(tgt + ' yd \\(' + (tgt - 5) + '–' + (+tgt + 4) + '\\)'));
  const ptr = await page.$$eval('#proxmap path.tracer', ps => ps.map(p => p.getAttribute('stroke')));
  assert.strictEqual(ptr.filter(c => c === '#1e6fd9').length, expB.hits, 'blue tracers = greens hit'); assert.strictEqual(ptr.filter(c => c === '#e0102a').length, expB.misses - (await page.locator('#proxmap .xdot[data-kind="missnodir"]').count()), 'red tracers = misses with a direction');
  ok(`tap ${tgt}: ${expB.n} shots from ${tgt - 5}–${+tgt + 4} yd only (from ${froms.join(', ')}), button highlighted, stats ${expB.hits}/${expB.n} greens, avg ${expB.avgAllFt == null ? '–' : Math.round(expB.avgAllFt) + ' ft'}`);
  await page.locator("#mapview").evaluate(e => e.scrollTo(0, 0)); await page.screenshot({ path: `${SHOTS}/30-proximity-rail-${tgt}.png` });
  await page.locator('#mapview').evaluate(e => { const m = document.getElementById('proxmap'); e.scrollTop += m.getBoundingClientRect().top - 8; }); await page.screenshot({ path: `${SHOTS}/30b-proximity-rail-${tgt}-map.png` });
  // a disabled button can't be selected
  const dis = rbtn.find(b => b[2]);
  if (dis) { assert.ok(await page.locator(`#proxrail [data-v="${dis[0]}"]`).isDisabled()); await page.locator(`#proxrail [data-v="${dis[0]}"]`).click({ force: true }); assert.match(await page.getAttribute(`#proxrail [data-v="${tgt}"]`, 'class'), /sel/); ok(`empty ${dis[0]} button is disabled (tap does nothing)`); }
  // scope switch: this round has fewer yardages; a selection that becomes empty falls back to All
  await act('mapscope', 'round');
  const rnd = await page.$$eval('#proxrail .ybtn', bs => bs.map(b => [b.getAttribute('data-v'), +b.getAttribute('data-n'), b.disabled]));
  const expR = await page.evaluate(() => { const S = SG.summarize(window.__golf.rounds()[0]); return SG.PROX_BUCKETS.slice(1).map(b => [b.id, S.proxList.filter(m => SG.inBucket(b.id, m.from)).length]); });
  assert.deepStrictEqual(rnd.map(b => [b[0], b[1]]), expR.slice().reverse()); rnd.forEach(b => assert.strictEqual(b[2], b[1] === 0));
  if (!Object.fromEntries(expR)[tgt]) assert.match(await page.getAttribute('[data-act="proxb"][data-v="all"]', 'class'), /sel/);
  ok('This round: button counts/disabled states follow the scope; an empty selection falls back to All');
  await act('proxb', 'all'); await act('mapscope', 'all');
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
  await act('history'); await page.locator('[data-act=\"open\"][data-id=\"rv2\"]').click();
  assert.strictEqual(await page.$eval('#sumbl', e => e.value), 'pga'); ok('old round defaults to PGA Tour');
  const old = await page.evaluate(() => { const r = window.__golf.rounds().find(x => x.id === 'rv2'); return [SG.summarize(r, 'pga').sgTotal, SG.summarize(r, 'scw').sgTotal]; });
  await page.selectOption('#sumbl', 'scw');
  assert.strictEqual(await page.textContent('#sgtotal'), f2(old[1])); ok(`past round re-benchmarked: ${f2(old[0])} vs PGA → ${f2(old[1])} vs scratch women`);
  await page.selectOption('#sumbl', 'pga');
  await act('home');
  await act('history'); await page.locator('[data-act="open"]').first().click();

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
  await page.reload(); await act('history'); await page.locator('[data-act=\"open\"][data-id=\"rscott\"]').click();
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
  // Scott's definitive rule: his 7-hole case, 5/7 GIR must show exactly 2 misses everywhere (old rule showed 4)
  await page.evaluate(() => {
    const R = (dist, loc, dir = '', pen = false) => ({ dist, loc, dir, pen });
    const holes = [
      { par: 4, pin: 'center', rows: [R(390, 'tee'), R(140, 'fairway'), R(15, 'green', 'left'), R(2, 'green'), R(1, 'holed')] },
      { par: 4, pin: 'backleft', rows: [R(410, 'tee'), R(160, 'rough', 'right'), R(25, 'green'), R(3, 'green'), R(1, 'holed')] },
      { par: 5, pin: 'center', rows: [R(520, 'tee'), R(240, 'fairway'), R(40, 'rough', 'short'), R(10, 'green', 'long'), R(1, 'holed')] },
      { par: 5, pin: 'frontright', rows: [R(540, 'tee'), R(250, 'fairway'), R(70, 'fairway'), R(18, 'green'), R(2, 'green'), R(1, 'holed')] },
      { par: 3, pin: 'center', rows: [R(165, 'tee'), R(9, 'green', 'right'), R(1, 'holed')] },
      { par: 4, pin: 'center', rows: [R(400, 'tee'), R(150, 'fairway'), R(60, 'rough', 'right'), R(35, 'bunker', 'short'), R(6, 'green'), R(1, 'holed')] },
      { par: 4, pin: 'backleft', rows: [R(380, 'tee'), R(160, 'fairway'), R(15, 'rough', 'left'), R(4, 'green'), R(1, 'holed')] }
    ].map(h => Object.assign(h, { finished: true }));
    while (holes.length < 18) holes.push({ par: 4, finished: false, rows: [R('', 'tee')] });
    const rs = JSON.parse(localStorage.getItem('golfsg.rounds.v1'));
    rs.unshift({ v: 3, dv: 2, id: 'rscott7', date: '2026-10-09T01:00:00.000Z', course: 'Scott 7 holes', baseline: 'pga', holes });
    localStorage.setItem('golfsg.rounds.v1', JSON.stringify(rs));
  });
  await page.reload(); await act('history'); await page.locator('[data-act=\"open\"][data-id=\"rscott7\"]').click();
  assert.match(await page.textContent('[data-act="map"][data-v="gir"]'), /^5 \/ 7/);
  assert.match(await page.textContent('[data-act="map"][data-v="miss"]'), /^2\s*Approach misses/);
  assert.match(await page.textContent('[data-act="map"][data-v="prox"]'), /greens hit 5\/7/);
  const st7 = await page.$$eval('.stat', ss => Object.fromEntries(ss.map(x => [x.querySelector('span').textContent, x.querySelector('b').textContent])));
  assert.strictEqual(st7['Missed greens left / right'], '1 / 1'); assert.strictEqual(st7['Missed greens short / long'], '0 / 0');
  assert.match(await page.textContent('[data-act="map"][data-v="fw"]'), /^\d+ \/ 6/, 'fairways: 6 par-4/5 tee shots (par 3 excluded)');
  ok("Scott's 7-hole case: GIR 5/7 + Approach misses 2 = 7; proximity greens hit 5/7; missed greens L/R 1/1; fairways out of 6 (par 4/5 only)");
  await hideToast(); await page.locator('[data-act="map"][data-v="fw"]').scrollIntoViewIfNeeded(); await page.evaluate(() => window.scrollBy(0, -60));
  await page.screenshot({ path: `${SHOTS}/26-stats-tiles-regulation.png` });
  await page.locator('[data-act="map"][data-v="miss"]').click(); await act('mapscope', 'round');
  assert.match(await page.textContent('#mapsum'), /^2 approaches missed the green this round/);
  assert.strictEqual(await page.locator('#missmap .mdot').count(), 2); await page.screenshot({ path: `${SHOTS}/27-miss-map-regulation.png` }); await act('mapclose');
  await page.locator('[data-act="map"][data-v="gir"]').click();
  assert.match(await page.textContent('#mapsum'), /^5 greens in regulation this round/); assert.strictEqual(await page.locator('#girmap .gdot').count(), 5); await act('mapclose');
  await page.locator('[data-act="map"][data-v="pin"]').click(); await page.waitForSelector('#pinstats');
  const pb7 = await page.$$eval('#pinstats button', bs => bs.reduce((a, b) => a + +b.getAttribute('data-n'), 0)); assert.strictEqual(pb7, 7);
  let ph = 0, pm = 0;
  for (const seg of ['center', 'backleft', 'frontright']) {
    await page.click(`#pinstats [data-v="${seg}"]`); await page.waitForSelector('#pinmap');
    const t = await page.textContent('#pinsum'); ph += +t.match(/GIR\) (\d+)/)[1]; pm += +t.match(/Missed (\d+)/)[1];
    await act('pinseg', '');
  }
  assert.strictEqual(ph, 5); assert.strictEqual(pm, 2); await act('mapclose');
  await page.locator('[data-act="map"][data-v="prox"]').click(); await page.waitForSelector('#proxmap'); await act('mapscope', 'round'); await act('proxb', 'all');
  const pk7 = await page.$$eval('#proxmap .xdot', ds => ds.map(d => d.getAttribute('data-kind')));
  assert.strictEqual(pk7.filter(k => k.startsWith('miss')).length, 2); assert.strictEqual(pk7.length - 2, 5);
  const curved = await page.$$eval('#proxmap path.tracer', ps => ps.every(p => / C/.test(p.getAttribute('d'))));
  assert.ok(curved, 'tracers are curved (cubic arcs)');
  await page.locator('#mapview').evaluate(e => { const m = document.getElementById('proxmap'); e.scrollTop += m.getBoundingClientRect().top - 8; });
  await page.screenshot({ path: `${SHOTS}/28-proximity-curved-tracers.png` }); await act('mapclose');
  ok('7-hole case on every map: miss map 2, GIR map 5, pin map 5 GIR + 2 missed = 7 holes, proximity 5 blue + 2 red; tracers are curved arcs');
  // Starting lies: fairway strip / rough / bunker / tee / other, by-lie table, practice warning, lie filter
  await page.evaluate(() => {
    const R = (dist, loc, dir = '') => ({ dist, loc, dir, pen: false });
    const P4 = (lieRow, end) => ({ par: 4, finished: true, rows: [R(400, 'tee'), lieRow, end, R(1, 'holed')] });
    const holes = [
      P4(R(150, 'fairway'), R(10, 'green', 'left')), P4(R(145, 'fairway'), R(18, 'green', 'longright')), P4(R(140, 'fairway'), R(6, 'green', 'short')),
      { par: 4, finished: true, rows: [R(400, 'tee'), R(150, 'fairway'), R(15, 'rough', 'right'), R(4, 'green'), R(1, 'holed')] },
      { par: 4, finished: true, rows: [R(400, 'tee'), R(150, 'rough', 'left'), R(20, 'rough', 'short'), R(4, 'green'), R(1, 'holed')] },
      { par: 4, finished: true, rows: [R(400, 'tee'), R(155, 'rough', 'left'), R(15, 'bunker', 'left'), R(4, 'green'), R(1, 'holed')] },
      { par: 4, finished: true, rows: [R(400, 'tee'), R(148, 'deep', 'right'), R(25, 'rough', 'shortright'), R(4, 'green'), R(1, 'holed')] },
      { par: 4, finished: true, rows: [R(400, 'tee'), R(152, 'rough'), R(30, 'rough', 'long'), R(4, 'green'), R(1, 'holed')] },
      P4(R(120, 'bunker'), R(8, 'green', 'right')),
      { par: 3, finished: true, rows: [R(160, 'tee'), R(12, 'green', 'left'), R(1, 'holed')] },
      { par: 4, finished: true, rows: [R(400, 'tee'), R(140, 'trees', 'left'), R(25, 'rough', 'short'), R(4, 'green'), R(1, 'holed')] }
    ];
    while (holes.length < 18) holes.push({ par: 4, finished: false, rows: [R('', 'tee')] });
    const rs = JSON.parse(localStorage.getItem('golfsg.rounds.v1'));
    rs.unshift({ v: 3, dv: 2, id: 'rlie', date: '2026-10-09T02:00:00.000Z', course: 'Lie test', baseline: 'pga', holes });
    localStorage.setItem('golfsg.rounds.v1', JSON.stringify(rs));
  });
  await page.reload(); await act('history'); await page.locator('[data-act=\"open\"][data-id=\"rlie\"]').click();
  await page.locator('[data-act="map"][data-v="prox"]').click(); await page.waitForSelector('#proxmap'); await act('mapscope', 'round'); await act('proxb', 'all'); await act('proxlie', 'all');
  const exL = await page.evaluate(() => { const L = SG.summarize(window.__golf.rounds()[0]).proxList; return { L: L.map(m => [m.hole, m.fromGroup, m.fromDir, m.hit]), rows: SG.proxByLie(L).map(r => [r.id, r.n, r.hits]) }; });
  assert.deepStrictEqual(exL.rows, [['fairway', 4, 3], ['rough', 4, 0], ['sand', 1, 1], ['tee', 1, 1], ['other', 1, 0]]);
  const warnT = await page.$$eval('#proxwarn .warnmsg', ps => ps.map(p => p.textContent));
  assert.deepStrictEqual(warnT, ["⚠ From the rough you've missed 4 of 4 greens — worth some practice."]);
  const lt = await page.$$eval('#lietab tr[data-lie]', trs => trs.map(t => [t.getAttribute('data-lie'), t.className.trim(), [...t.querySelectorAll('td')].map(d => d.textContent)]));
  assert.deepStrictEqual(lt.map(r => r[2].slice(0, 3)), [['Fairway', '4', '3/4 (75%)'], ['⚠ Rough', '4', '0/4 (0%)'], ['Bunker', '1', '1/1 (100%)'], ['Tee', '1', '1/1 (100%)'], ['Other', '1', '0/1 (0%)']]);
  assert.strictEqual(lt.find(r => r[0] === 'rough')[1], 'warn'); assert.strictEqual(lt.filter(r => /warn/.test(r[1])).length, 1);
  assert.strictEqual(lt.reduce((a, r) => a + +r[2][1], 0), 11, 'by-lie shots add up to All');
  ok('By lie table (All): Fairway 3/4 (75%), Rough 0/4 (0%) highlighted ⚠, Bunker 1/1, Tee 1/1, Other 0/1; warning "From the rough you\'ve missed 4 of 4 greens — worth some practice."');
  // tracers start from the right lie
  const stx = await page.$$eval('#proxmap path.tracer', ps => ps.map(p => [p.getAttribute('data-start'), +p.getAttribute('data-sx'), +p.getAttribute('data-sy')]));
  assert.strictEqual(stx.length, 11);
  const cntS = {}; stx.forEach(s => cntS[s[0]] = (cntS[s[0]] || 0) + 1);
  assert.deepStrictEqual(cntS, { fairway: 4, 'rough-left': 2, 'rough-right': 2, sand: 1, tee: 1, other: 1 });
  stx.forEach(([g, x, y]) => {
    assert.ok(y > 476, g + ' starts in the strip under the green');
    if (g === 'fairway') assert.ok(x > 104 && x < 196, 'fairway x ' + x);
    if (g === 'rough-left') assert.ok(x < 100, 'rough left x ' + x);
    if (g === 'rough-right') assert.ok(x > 200, 'rough right x ' + x);
    if (g === 'sand') assert.ok(Math.abs(x - 250) < 30 && Math.abs(y - 516) < 12, 'bunker ' + x + ',' + y);
    if (g === 'tee') assert.ok(Math.abs(x - 150) < 25 && y > 596, 'tee ' + x + ',' + y);
    if (g === 'other') assert.ok(x < 62 && y > 578, 'other ' + x + ',' + y);
  });
  assert.strictEqual(await page.locator('#liestrip #lie-sand').count() + await page.locator('#liestrip #lie-tee').count() + await page.locator('#liestrip #lie-other').count(), 3);
  ok('tracers start from the shot\'s lie: 4 fairway (middle strip), rough 2 left + 2 right (left/right from the previous direction, else the emptier side), bunker, tee box, trees/other corner');
  await page.screenshot({ path: `${SHOTS}/31-proximity-lies-all.png` });
  await page.locator('#mapview').evaluate(e => { const m = document.getElementById('proxmap'); e.scrollTop += m.getBoundingClientRect().top - 8; }); await page.screenshot({ path: `${SHOTS}/31b-proximity-lies-map.png` });
  await page.locator('#lietab').scrollIntoViewIfNeeded(); await page.locator('#mapview').evaluate(e => { e.scrollTop += document.getElementById('lietab').getBoundingClientRect().top - 120; }); await page.screenshot({ path: `${SHOTS}/31c-proximity-by-lie-table.png` });
  // lie chips: counts, disabled, filter
  const chipsA = await page.$$eval('#liechips .liebtn', bs => bs.map(b => [b.getAttribute('data-v'), +b.getAttribute('data-n'), b.disabled]));
  assert.deepStrictEqual(chipsA, [['all', 11, false], ['fairway', 4, false], ['rough', 4, false], ['sand', 1, false], ['tee', 1, false], ['other', 1, false]]);
  const chipBox = await page.$$eval('#liechips .liebtn', bs => bs.map(b => { const r = b.getBoundingClientRect(); return [r.right, r.height]; }));
  assert.ok(chipBox.every(c => c[0] <= 390 && c[1] >= 44), 'lie chips fit 390 wide, 44 px tall');
  await act('proxlie', 'rough');
  assert.match(await page.getAttribute('[data-act="proxlie"][data-v="rough"]', 'class'), /sel/);
  assert.match(await page.textContent('#mapsum'), /^4 approaches from All 40–200 yd, Rough this round/);
  const rk = await page.$$eval('#proxmap .xdot', ds => ds.map(d => d.getAttribute('data-kind')));
  assert.strictEqual(rk.length, 4); assert.ok(rk.every(k => k.startsWith('miss')));
  assert.ok((await page.$$eval('#proxmap path.tracer', ps => ps.map(p => p.getAttribute('data-start')))).every(g => g.startsWith('rough')));
  assert.ok((await page.textContent('#proxstats')).includes('0 / 4 (0%)'));
  const railR = await page.$$eval('#proxrail .ybtn', bs => bs.map(b => [b.getAttribute('data-v'), +b.getAttribute('data-n'), b.disabled]));
  assert.strictEqual(railR.reduce((a, b) => a + b[1], 0), 4, 'yardage counts follow the lie filter'); railR.forEach(b => assert.strictEqual(b[2], b[1] === 0));
  assert.deepStrictEqual(railR.filter(b => b[1]).map(b => b[0] + ':' + b[1]), ['160:1', '150:3'], '155 rounds up to 160');
  assert.match((await page.$$eval('#lietab tr.sel', t => t.map(x => x.getAttribute('data-lie')))).join(), /^rough$/);
  ok('Rough filter: 4 red tracers all from the rough, stats 0/4, yardage counts 160:1 + 150:3 (others greyed), Rough row marked');
  await page.locator('#mapview').evaluate(e => e.scrollTo(0, 0)); await page.screenshot({ path: `${SHOTS}/32-proximity-rough-filter.png` });
  // yardage + lie: tap 120 (only the bunker shot) -> the selected rough falls back to All lies
  await act('proxlie', 'all'); await act('proxb', '120');
  const ch120 = await page.$$eval('#liechips .liebtn', bs => bs.map(b => [b.getAttribute('data-v'), +b.getAttribute('data-n'), b.disabled]));
  assert.deepStrictEqual(ch120, [['all', 1, false], ['fairway', 0, true], ['rough', 0, true], ['sand', 1, false], ['tee', 0, true], ['other', 0, true]]);
  const lt120 = await page.$$eval('#lietab tr[data-lie] td:nth-child(2)', ts => ts.reduce((a, t) => a + +t.textContent, 0)); assert.strictEqual(lt120, 1);
  assert.strictEqual(await page.locator('#proxwarn .warnmsg').count(), 0, 'no warning for 120 yd');
  ok('120 yd: lie buttons greyed out except Bunker (1); By-lie table follows the yardage (1 shot); no warning');
  await act('proxb', 'all'); await act('mapclose');
  // Traditional scorecard on a full 18 (17 finished): marks, OUT / IN / TOTAL, fits 390 wide, tap to edit
  await page.evaluate(() => {
    const R = (dist, loc) => ({ dist, loc, dir: '', pen: false });
    const H = (par, yds, n) => ({ par, finished: true, rows: [R(yds, 'tee')].concat(Array.from({ length: n - 2 }, () => R(6, 'green')), [R(1, 'holed')]) });
    const pars = [4, 4, 3, 5, 4, 3, 4, 5, 4, 4, 4, 3, 5, 4, 4, 3, 5, 4], yds = [410, 385, 165, 530, 445, 190, 372, 515, 428, 402, 360, 178, 545, 390, 415, 155, 560, 440];
    const sc = [4, 3, 3, 3, 6, 5, 4, 6, 7, 2, 4, 3, 5, 4, 5, 3, 5, null];
    const holes = pars.map((p, i) => sc[i] == null ? { par: p, finished: false, rows: [R(yds[i], 'tee'), R(150, 'fairway')] } : H(p, yds[i], sc[i]));
    const rs = JSON.parse(localStorage.getItem('golfsg.rounds.v1'));
    rs.unshift({ v: 3, dv: 2, id: 'rcard', date: '2026-10-09T14:00:00.000Z', course: 'Card test', baseline: 'pga', holes });
    localStorage.setItem('golfsg.rounds.v1', JSON.stringify(rs));
  });
  await page.reload(); await act('history'); await page.locator('[data-act=\"open\"][data-id=\"rcard\"]').click();
  const marks = await page.$$eval('.scard tr.sscore td:not(.tot)', tds => tds.map(t => (t.querySelector('.mk') ? t.querySelector('.mk').getAttribute('data-mark') + ':' + t.textContent : 'blank')));
  assert.deepStrictEqual(marks, ['par:4', 'birdie:3', 'par:3', 'eagle:3', 'double:6', 'double:5', 'par:4', 'bogey:6', 'double:7',
    'eagle:2', 'par:4', 'par:3', 'par:5', 'par:4', 'bogey:5', 'par:3', 'par:5', 'blank']);
  ok('marks: birdie ○, eagle ◎ (also a 2 on a par 4), bogey □, double ⧈, triple (7 on a par 4) = double square, par plain, unfinished 18 blank');
  const shapes = await page.$$eval('.scard .mk', ms => Object.fromEntries(ms.map(m => { const c = getComputedStyle(m); return [m.getAttribute('data-mark'), [c.borderTopStyle, c.borderRadius, c.boxShadow !== 'none']]; })));
  assert.deepStrictEqual(shapes.birdie, ['solid', '50%', false]); assert.deepStrictEqual(shapes.eagle, ['solid', '50%', true]);
  assert.deepStrictEqual(shapes.bogey, ['solid', '2px', false]); assert.deepStrictEqual(shapes.double, ['solid', '2px', true]); assert.strictEqual(shapes.par[0], 'none');
  ok('mark shapes: circle / double circle / square / double square / plain');
  const tot = async (id, row) => page.textContent(`#${id} tr.${row} td.tot`);
  assert.strictEqual(await tot('card-front', 'spar'), '36'); assert.strictEqual(await tot('card-front', 'sscore'), '41'); assert.strictEqual(await tot('card-front', 'syds'), '3440');
  assert.strictEqual(await tot('card-back', 'spar'), '36'); assert.strictEqual(await tot('card-back', 'sscore'), '35'); assert.strictEqual(await tot('card-back', 'syds'), '3445');
  const expC = await page.evaluate(() => { const S = SG.summarize(window.__golf.rounds()[0]); return { putts: S.putts, toPar: S.toPar, strokes: S.strokes }; });
  const trow = await page.$$eval('#card-total tr:nth-child(2) td', ts => ts.map(t => t.textContent));
  assert.deepStrictEqual(trow, ['17/18 holes', '6885', '72', '76', '+' + expC.toPar, String(expC.putts)]); assert.strictEqual(expC.strokes, 76); assert.strictEqual(expC.toPar, 8);
  assert.strictEqual(+(await tot('card-front', 'sputts')) + +(await tot('card-back', 'sputts')), expC.putts);
  ok(`OUT: par 36, 3440 yd, score 41; IN: par 36, 3445 yd, score 35 (17 blank); TOTAL 6885 yd, par 72, 76 (+8 on 17 finished holes), putts ${expC.putts} = OUT + IN`);
  const fit = await page.evaluate(() => { const o = {}; ['card-front', 'card-back', 'card-total'].forEach(id => { const t = document.getElementById(id), r = t.getBoundingClientRect(); o[id] = [r.left, r.right, t.scrollWidth <= t.clientWidth + 1]; });
    const cells = [...document.querySelectorAll('#card-front tr.sscore .hc')].map(b => b.getBoundingClientRect()); const mk = [...document.querySelectorAll('.scard .mk')].map(m => m.getBoundingClientRect());
    const tds = [...document.querySelectorAll('#card-front tr.sscore td')].map(t => t.getBoundingClientRect());
    return { o, docW: document.documentElement.scrollWidth, cellW: Math.min(...cells.map(c => c.width)), cellH: Math.min(...cells.map(c => c.height)), mkInside: mk.every(m => tds.some(t => m.left >= t.left - 0.5 && m.right <= t.right + 0.5) || true), font: parseFloat(getComputedStyle(document.querySelector('.scard .mk')).fontSize) }; });
  Object.values(fit.o).forEach(v => { assert.ok(v[0] >= 0 && v[1] <= 390 && v[2], JSON.stringify(v)); }); assert.ok(fit.docW <= 390, 'no sideways scroll');
  assert.ok(fit.cellH >= 44, 'score cells ' + fit.cellH + ' px tall'); assert.ok(fit.font >= 15);
  ok(`scorecard fits 390 px (no sideways scroll); score cells ${fit.cellW.toFixed(0)}×${fit.cellH.toFixed(0)} px`);
  await hideToast(); await page.locator('#card-front').scrollIntoViewIfNeeded(); await page.evaluate(() => window.scrollBy(0, -56));
  await page.screenshot({ path: `${SHOTS}/33-scorecard.png` });
  await page.locator('#card-back tr.sscore [data-act="goHole"][data-i="12"]').click();
  assert.match(await page.textContent('.hc-head'), /Hole 13/); ok('tapping a back-9 score cell opens that hole for editing');
  await page.locator('[data-act="summary"]').first().click();
  await page.locator('#card-back tr.shole [data-act="goHole"][data-i="17"]').click(); assert.match(await page.textContent('.hc-head'), /Hole 18/); ok('tapping the hole number opens it too (unfinished 18)');
  // History: big button on Home, list newest first, open a round's full stats, back to History, delete
  await act('home');
  assert.match(await page.textContent('[data-act="history"].histbtn'), /History\s*7 saved rounds/);
  const hb = await page.$eval('[data-act="history"].histbtn', b => { const r = b.getBoundingClientRect(); return [r.width, r.height]; }); assert.ok(hb[0] > 350 && hb[1] >= 66, 'big History button ' + hb);
  await act('history');
  const hist = await page.$$eval('#histlist .hrow', rs => rs.map(r => [r.getAttribute('data-id'), r.querySelector('.hist').innerText.replace(/\s+/g, ' ')]));
  const expH = await page.evaluate(() => window.__golf.rounds().slice().sort((a, b) => String(b.date).localeCompare(String(a.date))).map(r => { const S = SG.summarize(r); return [r.id, S.holesDone, S.strokes, S.toPar, S.sgTotal]; }));
  assert.deepStrictEqual(hist.map(h => h[0]), expH.map(e => e[0]), 'newest first');
  const tp = n => n === 0 ? 'E' : n > 0 ? '+' + n : String(n), f2s = v => { const t = (Math.round(v * 100) / 100).toFixed(2); return (v > 0.004 ? '+' : '') + (t === '-0.00' ? '0.00' : t); };
  hist.forEach((h, i) => { const e = expH[i]; assert.ok(h[1].includes(e[1] + ' of 18 holes played'), h[1]); if (e[1]) assert.ok(h[1].includes(e[2] + ' (' + tp(e[3]) + ')'), h[1]); assert.ok(h[1].includes('SG ' + f2s(e[4])), h[1]); });
  ok(`History: ${hist.length} rounds newest first (${hist.map(h => h[0]).join(', ')}), each with date, course, score vs par, holes played, SG`);
  await page.screenshot({ path: `${SHOTS}/34-history.png` });
  await page.locator('#histlist [data-act="open"][data-id="rscott7"]').click();
  assert.match(await page.textContent('.topbar'), /‹ History/); assert.match(await page.textContent('[data-act="map"][data-v="gir"]'), /^5 \/ 7/);
  assert.strictEqual(await page.locator('#card-front').count(), 1);
  await page.locator('[data-act="map"][data-v="prox"]').click(); await page.waitForSelector('#proxmap'); await act('mapclose');
  await page.locator('[data-act="map"][data-v="pin"]').click(); await page.waitForSelector('#pinstats'); await act('mapclose');
  await page.locator('#card-front tr.sscore [data-act="goHole"][data-i="2"]').click(); assert.match(await page.textContent('.hc-head'), /Hole 3/);
  await page.locator('[data-act="summary"]').first().click(); assert.match(await page.textContent('.topbar'), /‹ History/);
  await page.locator('.topbar [data-act="history"]').click(); await page.waitForSelector('#histlist');
  ok('History › round: full stats (GIR 5/7, scorecard, proximity + pin maps), scorecard tap opens a hole, Scorecard & stats returns with ‹ History, ‹ History goes back');
  await page.locator('#histlist [data-act="delHist"][data-id="rcard"]').click();
  assert.strictEqual(await page.locator('#histlist .hrow').count(), hist.length - 1); assert.strictEqual(await page.evaluate(() => window.__golf.rounds().some(r => r.id === 'rcard')), false);
  await page.locator('#histlist [data-act="open"][data-id="rlie"]').click(); await act('delRound'); await page.waitForSelector('#histlist');
  assert.strictEqual(await page.locator('#histlist .hrow').count(), hist.length - 2); ok('delete from the History list (🗑, confirm) and from a round opened from History (returns to History)');
  // Backup: share sheet with a File (stubbed) and the download fallback
  await act('home');
  assert.match(await page.textContent('#bkremind'), /haven't backed up/);
  await page.evaluate(() => { window.__shared = null; navigator.canShare = () => true; navigator.share = async d => { window.__shared = { name: d.files[0].name, type: d.files[0].type, text: await d.files[0].text() }; }; });
  await act('backup'); await page.waitForFunction(() => window.__shared);
  const sh = await page.evaluate(() => window.__shared);
  const today = await page.evaluate(() => { const d = new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); });
  assert.strictEqual(sh.name, `golf-rounds-backup-${today}.json`); assert.strictEqual(sh.type, 'application/json');
  const bk = JSON.parse(sh.text); const nNow = await page.evaluate(() => window.__golf.rounds().length);
  assert.strictEqual(bk.kind, 'rounds-backup'); assert.strictEqual(bk.rounds.length, nNow); assert.deepStrictEqual(bk.rounds, await page.evaluate(() => window.__golf.rounds()));
  await page.waitForSelector('#notice'); assert.match(await page.textContent('#notice'), new RegExp('Backup ready: ' + nNow + ' rounds saved'));
  assert.strictEqual(await page.locator('#bkremind').count(), 0, 'reminder gone after a backup');
  ok(`Back up rounds: share sheet gets ${sh.name} (application/json) with all ${nNow} rounds; reminder cleared`);
  await page.evaluate(() => { delete navigator.share; navigator.canShare = undefined; });
  const [bdl] = await Promise.all([page.waitForEvent('download'), act('backup')]);
  assert.strictEqual(bdl.suggestedFilename(), `golf-rounds-backup-${today}.json`); ok('no share sheet → the same file downloads');
  await page.evaluate(() => localStorage.setItem('golfsg.lastBackup.v1', new Date(Date.now() - 20 * 864e5).toISOString())); await act('history'); await act('home');
  assert.match(await page.textContent('#bkremind'), /It's been 20 days since your last backup/); ok('gentle reminder after 14+ days ("It\'s been 20 days …")');
  await page.screenshot({ path: `${SHOTS}/35-home-history-backup.png` });
  // Restore: 1 new, 1 identical, 1 conflict (confirm → replace), plus a duplicate id inside the file
  const back = JSON.parse(JSON.stringify(bk));
  const ws = back.rounds.find(r => r.id !== 'rscott7' && r.id !== 'rscott'), conflict = back.rounds.find(r => r.id === 'rscott');
  conflict.course = 'Repro (edited on another phone)';
  back.rounds = [Object.assign(JSON.parse(JSON.stringify(ws)), {}), conflict, { id: 'rnew1', date: '2026-10-01T16:00:00.000Z', course: 'Restored Course', baseline: 'pga', v: 3, dv: 2, holes: [{ par: 4, finished: true, rows: [{ dist: 380, loc: 'tee', dir: '', pen: false }, { dist: 140, loc: 'fairway', dir: '', pen: false }, { dist: 10, loc: 'green', dir: '', pen: false }, { dist: 1, loc: 'holed', dir: '', pen: false }] }] }];
  back.rounds.push(JSON.parse(JSON.stringify(back.rounds[2])));
  const dlg = []; page.on('dialog', d => dlg.push(d.message()));
  await page.setInputFiles('#restorefile', { name: 'golf-rounds-backup-2026-10-01.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(back)) });
  await page.waitForFunction(() => /Restored/.test((document.getElementById('notice') || {}).textContent || ''));
  assert.strictEqual(await page.textContent('#notice'), `✓ Restored from backup: 1 added, 1 replaced, 1 already here. You now have ${nNow + 1} rounds.`);
  assert.ok(dlg.some(m => /1 round in the backup is different from the copy on this phone/.test(m)), 'asked before overwriting: ' + dlg.join(' | '));
  const after = await page.evaluate(() => window.__golf.rounds().map(r => [r.id, r.course]));
  assert.strictEqual(after.length, nNow + 1); assert.strictEqual(new Set(after.map(a => a[0])).size, after.length, 'no duplicate ids');
  assert.deepStrictEqual(after.find(a => a[0] === 'rscott'), ['rscott', 'Repro (edited on another phone)']);
  ok('Restore: merges by id – 1 added, 1 identical skipped, 1 conflict replaced after asking, duplicate in file ignored; clear success message');
  await page.screenshot({ path: `${SHOTS}/36-restore-success.png` });
  await page.setInputFiles('#restorefile', { name: 'notes.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') });
  await page.waitForSelector('#notice.bad'); assert.match(await page.textContent('#notice'), /not a golf backup/);
  assert.strictEqual(await page.evaluate(() => window.__golf.rounds().length), nNow + 1); ok('a non-backup file is rejected with a plain message, nothing changes');
  await page.reload(); await act('history'); assert.strictEqual(await page.locator('#histlist .hrow').count(), nNow + 1); ok('restored rounds persist after reload and show in History');
  assert.deepStrictEqual(errors, []); ok('no JS console errors');
  console.log(`\nE2E: ${passed} checks passed`);
  await browser.close(); srv.kill();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
