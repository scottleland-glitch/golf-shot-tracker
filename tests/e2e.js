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
  const tap = (sel) => page.locator(sel).first().click();
  const act = (a, v) => tap(v == null ? `[data-act="${a}"]` : `[data-act="${a}"][data-v="${v}"]`);
  const type = async (num) => { await act('key', 'C'); for (const c of String(num)) await act('key', c); };
  const shot = async (lie, dist, side, pen) => {
    if (pen) await act('pen', pen);
    if (lie) await act('lie', lie);
    if (side) await act('side', side);
    if (dist != null) await type(dist);
    await act('saveShot');
  };
  const setup = async (par, yards) => { await act('par', par); await type(yards); await act('startHole'); };

  await page.goto(URL); await page.waitForSelector('text=Golf Shot Tracker');
  const swScope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope); assert.ok(swScope.startsWith(URL), swScope); ok('service worker scope = ' + swScope);
  ok('home loads');
  // Manifest/meta present
  const meta = await page.evaluate(() => ({ m: !!document.querySelector('link[rel=manifest]'), a: !!document.querySelector('link[rel=apple-touch-icon]'),
    c: document.querySelector('meta[name=apple-mobile-web-app-capable]').content }));
  assert.ok(meta.m && meta.a && meta.c === 'yes'); ok('manifest + apple-touch-icon + iOS meta tags');

  await page.fill('#course', 'Washoe County GC');
  await act('new');
  await act('par', 4); await type(400);
  await page.screenshot({ path: `${SHOTS}/1-hole-setup.png` });
  await act('startHole');
  assert.match(await page.textContent('.topbar'), /Par 4 · 400 yd/); ok('hole 1 set up: par 4, 400 yd');

  // validation: save without lie
  await act('saveShot'); assert.match(await page.textContent('#toast'), /Pick where/); ok('validation: needs lie');
  await act('lie', 'rough'); await type(150); await act('saveShot');
  assert.match(await page.textContent('#toast'), /left or right/); ok('validation: rough needs left/right');
  await act('lie', 'fairway'); await act('saveShot');
  assert.match(await page.textContent('.shots'), /hit 250 yd/); ok('drive 400 → 150 shows "hit 250 yd"');
  // shot 2 - screenshot mid-entry
  await act('lie', 'green'); await type(20);
  assert.match(await page.textContent('#disp'), /20\s*feet/); ok('green distance in feet');
  await act('saveShot');
  // show an entry state for the screenshot: next shot form defaults to green
  const sel = await page.locator('[data-act="lie"].sel').getAttribute('data-v'); assert.strictEqual(sel, 'green'); ok('putt defaults lie to green');
  await act('holed');
  assert.match(await page.textContent('.done'), /3\s+\(-1\)/); ok('hole 1 complete: 3 (-1)');
  await act('next');

  // Hole 2: par 3 with bunker miss left
  await setup(3, 165);
  await act('lie', 'sand'); await act('side', 'L'); await type(15);
  await page.evaluate(() => { window.scrollTo(0, 0); document.getElementById('toast').className = ''; }); await page.screenshot({ path: `${SHOTS}/2-shot-entry.png` });
  const sb = await page.locator('[data-act="saveShot"]').boundingBox(); assert.ok(sb.y + sb.height <= 844, 'save button above fold: ' + (sb.y + sb.height)); ok('Save button visible without scrolling (' + Math.round(sb.y + sb.height) + 'px of 844)');
  await act('saveShot');
  await shot('green', 4); await shot('green', 1); await act('holed');
  assert.match(await page.textContent('.done'), /4\s+\(\+1\)/); ok('hole 2: bunker, 2 putts = 4 (+1)');
  await act('next');

  // Hole 3: par 5, OB right then water drop, etc.
  await setup(5, 520);
  await act('pen', 'ob'); await act('side', 'R'); await act('saveShot');
  assert.match(await page.textContent('.status'), /Shot 2 from 520 yd · Tee/); ok('OB: re-hit from tee (stroke & distance)');
  await shot('rough', 250, 'L', 'water');
  await shot('fairway', 90); await shot('green', 12); await act('holed');
  assert.match(await page.textContent('.done'), /^\s*7/); ok('hole 3 with OB + water = 7');
  // Edit: tap shot 4 (to 12 ft) and change to 8 ft
  await page.locator('[data-act="editShot"][data-i="3"]').click();
  assert.match(await page.textContent('.status'), /Fixing shot 4/);
  await type(8); await act('saveShot');
  assert.match(await page.textContent('.shots'), /8 ft · Green/); ok('edit shot works');
  // Delete then re-add
  await page.locator('[data-act="editShot"][data-i="4"]').click(); await act('delShot');
  assert.strictEqual(await page.locator('.shot').count(), 4); ok('delete shot works');
  await act('holed');
  await page.evaluate(() => { document.getElementById('toast').className = ''; }); await page.screenshot({ path: `${SHOTS}/3-hole-complete.png` });

  // Summary
  await act('summary');
  const sum = await page.evaluate(() => { const r = window.__golf.rounds()[0]; return SG.summarize(r); });
  assert.strictEqual(sum.strokes, 14); assert.strictEqual(sum.par, 12); assert.strictEqual(sum.penalties, 2);
  assert.strictEqual(sum.putts, 4); assert.strictEqual(sum.fwHit, 1); assert.strictEqual(sum.fwTotal, 2);
  assert.strictEqual(sum.gir, 1); assert.strictEqual(sum.teeRight, 1);
  assert.match(await page.textContent('.big-score'), /14\s*\+2 vs par/); ok('summary: 14 strokes, +2, 2 penalties, 4 putts, FW 1/2, GIR 1/3');
  // tap hole in scorecard -> hole screen
  await page.locator('[data-act="goHole"][data-i="1"]').click();
  assert.match(await page.textContent('.topbar'), /Hole 2/); ok('tap scorecard hole opens it');

  // CSV
  const csv = await page.evaluate(() => window.__golf.csvFor(window.__golf.rounds()));
  const lines = csv.trim().split('\r\n'); assert.strictEqual(lines.length, 1 + 3 + 4 + 5); ok(`CSV has ${lines.length - 1} shot rows + header`);
  await act('summary');
  const [dl] = await Promise.all([page.waitForEvent('download'), act('csv')]);
  assert.match(dl.suggestedFilename(), /golf-\d{4}-\d\d-\d\d-Washoe-County-GC\.csv/); ok('CSV download: ' + dl.suggestedFilename());

  // Persistence + offline
  await page.reload(); await page.waitForSelector('text=Continue round'); ok('round persists after reload');
  await page.waitForFunction(() => navigator.serviceWorker.controller || navigator.serviceWorker.ready.then(() => true));
  await page.reload(); await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await ctx.setOffline(true);
  await page.reload(); await page.waitForSelector('text=Continue round'); ok('works offline (service worker)');
  await ctx.setOffline(false);

  // Full 18-hole sample round for a realistic summary screenshot
  await page.evaluate(() => {
    const H = (par, yards, shots) => ({ par, yards, shots: shots.map(s => ({ lie: s[0], dist: s[1] || 0, side: s[2] || '', pen: s[3] || 'none' })) });
    const holes = [
      H(4, 402, [['fairway', 148], ['green', 22], ['green', 3], ['holed']]),
      H(5, 535, [['rough', 260, 'R'], ['fairway', 105], ['green', 14], ['holed']]),
      H(3, 178, [['sand', 12, 'R'], ['green', 6], ['holed']]),
      H(4, 365, [['fairway', 120], ['green', 35], ['green', 4], ['green', 1], ['holed']]),
      H(4, 431, [['ob', 0, 'R', 'ob'], ['fairway', 160], ['rough', 25, 'L'], ['green', 8], ['holed']]),
      H(4, 388, [['rough', 140, 'L'], ['green', 28], ['green', 2], ['holed']]),
      H(3, 152, [['green', 18], ['green', 2], ['holed']]),
      H(5, 548, [['fairway', 280], ['rough', 95, 'L'], ['green', 10], ['holed']]),
      H(4, 420, [['deep', 175, 'R'], ['sand', 18, 'R'], ['green', 9], ['green', 1], ['holed']]),
      H(4, 395, [['fairway', 135], ['green', 16], ['green', 2], ['holed']]),
      H(4, 412, [['rough', 165, 'L', 'lateral'], ['green', 40], ['green', 5], ['holed']]),
      H(3, 196, [['rough', 20, 'L'], ['green', 5], ['holed']]),
      H(5, 512, [['fairway', 245], ['fairway', 60], ['green', 7], ['holed']]),
      H(4, 378, [['fairway', 115], ['green', 12], ['green', 1], ['holed']]),
      H(4, 445, [['recovery', 190, 'R'], ['fairway', 70], ['green', 15], ['green', 2], ['holed']]),
      H(3, 141, [['green', 25], ['green', 3], ['holed']]),
      H(4, 405, [['fairway', 155], ['sand', 22, 'L'], ['green', 6], ['holed']]),
      H(5, 560, [['fairway', 270], ['rough', 120, 'R'], ['green', 20], ['green', 2], ['holed']]),
    ];
    const rs = JSON.parse(localStorage.getItem('golfsg.rounds.v1'));
    rs.unshift({ id: 'rsample', date: '2026-10-04T15:00:00.000Z', course: 'Sample round', holes });
    localStorage.setItem('golfsg.rounds.v1', JSON.stringify(rs));
  });
  await page.reload();
  await page.locator('[data-act="open"][data-id="rsample"]').click();
  await page.waitForSelector('text=Round stats');
  const s2 = await page.evaluate(() => SG.summarize(window.__golf.rounds().find(r => r.id === 'rsample')));
  assert.strictEqual(s2.holesDone, 18); ok(`sample 18 holes: ${s2.strokes} (${s2.toPar >= 0 ? '+' : ''}${s2.toPar}), SG ${s2.sgTotal.toFixed(2)}`);
  await page.screenshot({ path: `${SHOTS}/4-summary.png` });
  await page.screenshot({ path: `${SHOTS}/5-summary-full.png`, fullPage: true });
  await act('home'); await page.screenshot({ path: `${SHOTS}/6-home.png` });

  // tap targets size check
  const small = await page.evaluate(() => [...document.querySelectorAll('button')].filter(b => b.getBoundingClientRect().height < 44).length);
  assert.strictEqual(small, 0); ok('all buttons ≥ 44px tall');
  assert.deepStrictEqual(errors, []); ok('no JS console errors');
  console.log(`\nE2E: ${passed} checks passed`);
  await browser.close(); srv.kill();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
