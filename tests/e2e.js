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

  // Seed an OLD (v1) round to prove migration works
  await page.goto(URL);
  await page.evaluate(() => {
    localStorage.clear();
    const holes = []; for (let i = 0; i < 18; i++) holes.push({ par: null, yards: null, shots: [] });
    holes[0] = { par: 4, yards: 400, shots: [{ lie: 'rough', dist: 0, side: 'R', pen: 'ob' }, { lie: 'rough', dist: 180, side: 'L', pen: 'water' },
      { lie: 'green', dist: 20, side: '', pen: 'none' }, { lie: 'holed', dist: 0, side: '', pen: 'none' }] };
    localStorage.setItem('golfsg.rounds.v1', JSON.stringify([{ id: 'rold', date: '2026-10-01T18:00:00.000Z', course: 'Old v1 round', holes }]));
  });
  await page.reload(); await page.waitForSelector('text=Golf Shot Tracker');
  const swScope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope); assert.ok(swScope.startsWith(URL), swScope); ok('service worker scope = ' + swScope);
  const mig = await page.evaluate(() => { const r = window.__golf.rounds()[0]; return { rows: r.holes[0].rows.length, s: SG.summarize(r) }; });
  assert.strictEqual(mig.rows, 5); assert.strictEqual(mig.s.strokes, 6); assert.strictEqual(mig.s.penalties, 2);
  ok('old saved round migrated to new table format (hole 1: 6 strokes, 2 penalties)');

  await page.fill('#course', 'Washoe County GC');
  await act('new');
  assert.ok(await page.evaluate(() => document.activeElement.getAttribute('data-row') === '0')); ok('new hole: cursor in row 1 distance (tee)');
  assert.match(await page.textContent('.srow[data-k="0"]'), /Tee/);
  // Hole 1 like Scott's screenshot: 365 tee, 125 F R, 15 ft G O, 3 ft G, holed
  await dist(0, 365);
  await act('addShot');
  assert.strictEqual(await rows(), 2);
  assert.ok(await page.evaluate(() => document.activeElement.getAttribute('data-row') === '1')); ok('Add Shot adds row 2 and focuses its distance');
  await dist(1, 125);
  await act('addShot'); assert.match(await page.textContent('#toast'), /Row 2: pick a location/); ok('validation: Add Shot asks for missing location');
  await loc(1, 'fairway'); await dir(1, 'R');
  assert.match(await page.textContent('.sinfo[data-info="0"]'), /hit 240 yd/); ok('row 1 info: hit 240 yd (365 - 125)');
  await act('addShot'); await dist(2, 15); await loc(2, 'green'); await dir(2, 'O');
  assert.match(await page.textContent('.srow[data-k="2"] .u'), /ft/); ok('green row shows feet');
  await act('addShot');
  assert.strictEqual(await page.$eval('select[data-f="loc"][data-k="3"]', e => e.value), 'green'); ok('next row after green defaults to Green');
  await dist(3, 3);
  await hideToast(); await page.screenshot({ path: `${SHOTS}/7-hole-table-entry.png` });
  await noOverflow('hole table');
  await act('addShot'); await loc(4, 'holed');
  assert.match(await doneText(), /Score 4 \(E\)/); ok('"In the hole" finishes hole: 4 (E)');
  // Delete a row
  await actK('del', 3);
  assert.match(await doneText(), /Score 3 \(-1\)/); ok('delete row works (now 3, -1)');
  // Insert a row below row 3
  await actK('menu', 2); await actK('insAfter', 2);
  assert.strictEqual(await rows(), 5);
  await dist(3, 3); await page.locator('h2').first().click();
  await page.evaluate(() => 0);
  await act('par', 4); // triggers re-render
  assert.match(await doneText(), /Score 4 \(E\)/); ok('insert row works (back to 4, E)');
  // Edit a distance in the middle: 125 -> 130
  await dist(1, 130); assert.match(await page.textContent('.sinfo[data-info="0"]'), /hit 235 yd/); ok('editing a distance updates live (hit 235 yd)');
  await hideToast(); await page.screenshot({ path: `${SHOTS}/8-hole-table-done.png` });

  // Hole 2 via Add Hole
  assert.match(await page.textContent('[data-act="next"].big'), /Add Hole 2/);
  await page.locator('[data-act="next"].big').click();
  assert.match(await page.textContent('.hc-head'), /Hole 2/); ok('Add Hole 2 moves to hole 2');
  await act('par', 3); await dist(0, 165);
  await act('addShot'); await dist(1, 15); await loc(1, 'bunker'); await dir(1, 'L');
  await act('addShot'); await dist(2, 4); await loc(2, 'green');
  await act('addShot'); await dist(3, 1);
  await act('addShot'); await loc(4, 'holed');
  assert.match(await doneText(), /Score 4 \(\+1\)/); ok('hole 2 (par 3, bunker, 2 putts) = 4 (+1)');

  // Hole 3: OB, hazard drop
  await page.locator('[data-act="next"].big').click();
  await act('par', 5); await dist(0, 520);
  await act('addShot'); await loc(1, 'ob'); await dir(1, 'R');
  assert.match(await page.textContent('.srow[data-k="1"]'), /520 yd/);
  assert.match(await page.getAttribute('[data-act="pen"][data-k="1"]', 'class'), /on/); ok('OB row: re-hit from 520, penalty auto on');
  await act('addShot'); await dist(2, 250); await loc(2, 'hazard'); await actK('pen', 2); await dir(2, 'L');
  await act('addShot'); await dist(3, 90); await loc(3, 'fairway');
  await act('addShot'); await dist(4, 8); await loc(4, 'green');
  await act('addShot'); await loc(5, 'holed');
  assert.match(await doneText(), /Score 7 \(\+2\)/); ok('hole 3 with OB + hazard drop = 7 (+2)');
  await page.screenshot({ path: `${SHOTS}/9-hole-ob-hazard.png`, fullPage: true });
  // Changing a middle row to "In the hole" trims later rows
  await loc(3, 'holed'); assert.strictEqual(await rows(), 4); ok('setting "In the hole" mid-hole trims later rows');
  await loc(3, 'fairway'); await dist(3, 90); await act('addShot'); await dist(4, 8); await loc(4, 'green'); await act('addShot'); await loc(5, 'holed');
  assert.match(await doneText(), /Score 7/);

  // Summary
  await page.locator('[data-act="summary"]').first().click();
  const sum = await page.evaluate(() => SG.summarize(window.__golf.rounds()[0]));
  assert.strictEqual(sum.strokes, 15); assert.strictEqual(sum.par, 12); assert.strictEqual(sum.penalties, 2);
  assert.strictEqual(sum.putts, 5); assert.strictEqual(sum.fwHit, 1); assert.strictEqual(sum.fwTotal, 2); assert.strictEqual(sum.teeRight, 2);
  assert.strictEqual(sum.apprOver, 1);
  assert.match(await page.textContent('.big-score'), /15\s*\+3 vs par/); ok('summary: 15 (+3), 2 penalties, 5 putts, FW 1/2, approach over 1');
  await page.locator('[data-act="goHole"][data-i="1"]').click();
  assert.match(await page.textContent('.hc-head'), /Hole 2/); ok('tap scorecard hole opens it');
  await page.locator('[data-act="summary"]').first().click();
  const csv = await page.evaluate(() => window.__golf.csvFor([window.__golf.rounds()[0]]));
  assert.strictEqual(csv.trim().split('\r\n').length, 1 + 4 + 4 + 5); ok('CSV: 13 shot rows + header');
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
