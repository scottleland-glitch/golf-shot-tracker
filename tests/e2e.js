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
  const dir = (k, v) => page.selectOption(`select[data-f="dir"][data-k="${k}"]`, v);
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
    localStorage.setItem('golfsg.rounds.v1', JSON.stringify([{ id: 'rv2', date: '2026-10-08T05:00:00.000Z', course: 'Scott v2 save', holes }]));
    localStorage.setItem('golfsg.current.v1', 'rv2');
  });
  await page.reload(); await page.waitForSelector('text=Golf Shot Tracker');
  const swScope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope); assert.ok(swScope.startsWith(URL), swScope); ok('service worker scope = ' + swScope);
  await act('resume'); await page.waitForSelector('.holecard');
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
  await page.fill('#course', 'Washoe County GC');
  await act('new');
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
  await act('addShot'); await dist(1, 15); await loc(1, 'bunker'); await dir(1, 'L');
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
  const scores = new Set(lines.slice(1).map(l => l.split(',').pop())); assert.deepStrictEqual([...scores].sort(), ['4', '8']);
  ok('CSV: 14 shot rows, hole scores 4/4/8');
  const [dl] = await Promise.all([page.waitForEvent('download'), act('csv')]);
  assert.match(dl.suggestedFilename(), /golf-\d{4}-\d\d-\d\d-Washoe-County-GC\.csv/); ok('CSV download: ' + dl.suggestedFilename());
  await page.screenshot({ path: `${SHOTS}/4-summary.png` });

  // Persistence + offline
  await page.reload(); await page.waitForSelector('text=Continue round'); ok('rounds persist after reload');
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
