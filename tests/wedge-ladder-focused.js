// v94 Wedge ladder. Wedges page: set yardages open a simple 3-line view (Club / Ball position / Club position); the Edit button
// brings back the full editor. Scoring page: a shot 40–110 yd out gets a dropdown of the wedge ladder instead of the club picker,
// preselected to the nearest yardage; picking sets the shot's club and shows the setup under it. Empty ladder → normal picker.
const assert = require('assert'); const { spawn } = require('child_process');
const W = require('../wedges.js');
const OUT = '/workspace/golf-app/screenshots/', PORT = 8832, BASE = 'http://127.0.0.1:' + PORT + '/';
const CHART = { v: 2, updated: '2026-10-28T20:00:00.000Z', rows: {
  50: { club: '58', ball: 'front', pos: 'p1' }, 70: { club: '54', ball: 'middle', lean: '1-2', pos: 'p2', hinge: '90' },
  90: { ball: 'back' }, 75: { club: '56' }, 100: { club: 'PW', ball: 'back', lean: '0', pos: 'p3', hinge: 'full' } },
  low: { 70: { club: '56', ball: 'back', lean: '3-4', pos: 'p1', hinge: '45' }, 60: { club: '58', ball: 'middle', pos: 'p2' } } };
const LABELS = ['–', '50 yd · High · 58° · Front · P1', '60 yd · Low · 58° · Middle · P2', '70 yd · High · 54° · Middle · P2', '70 yd · Low · 56° · Back · P1', '100 yd · High · PW · Back · P3'];
// ---------- data helpers ----------
{
  const L = W.ladder(CHART);
  assert.deepStrictEqual(L.map(e => e.y + e.f), ['50high', '60low', '70high', '70low', '100high'], 'shown yardages with a club, both flights (90 has no club, 75 is hidden)');
  assert.deepStrictEqual(L.map(W.ladderLabel), LABELS.slice(1));
  assert.strictEqual(W.nearest(L, 72).y, 70); assert.strictEqual(W.nearest(L, 72).f, 'high', 'High first'); assert.strictEqual(W.nearest(L, 62).f, 'low', 'Low when only Low is set there'); assert.strictEqual(W.nearest(L, 85).y, 100, 'tie → longer'); assert.strictEqual(W.nearest(L, 40).y, 50);
  assert.strictEqual(W.nearest(L, 95, '54').y, 70, 'by club');
  assert.ok(W.inRange(40) && W.inRange(110) && !W.inRange(39) && !W.inRange(111) && !W.inRange('') && !W.inRange(null));
  assert.deepStrictEqual(W.ladder(W.blank()), []);
  console.log('  ladder helpers ok');
}
(async () => {
  const { chromium } = require('playwright-core');
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: '/workspace/golf-app', stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1500)); const errors = [];
  const br = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  try {
    const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    const page = await ctx.newPage(); page.setDefaultTimeout(20000); page.on('pageerror', e => errors.push(String(e))); page.on('dialog', d => d.accept());
    const shot = n => page.screenshot({ path: OUT + n + '.png' });
    const holeRows = i => page.evaluate(i => JSON.parse(localStorage.getItem('golfsg.rounds.v1'))[0].holes[i].rows, i);
    await page.goto(BASE + '?x=' + Date.now());
    await page.evaluate(() => { const R = (d, l, x) => Object.assign({ dist: d, loc: l, dir: '', pen: false }, x || {});
      const holes = Array.from({ length: 18 }, () => ({ par: 4, rows: [R('', 'tee')] }));
      holes[0] = { par: 4, rows: [R(380, 'tee', { club: 'Driver' }), R(72, 'fairway'), R(12, 'green'), R(2, 'holed')] };
      holes[1] = { par: 4, rows: [R(410, 'tee'), R(150, 'fairway'), R(95, 'rough', { club: '7i' }), R(8, 'green'), R(1, 'holed')] };
      holes[2] = { par: 4, rows: [R(360, 'tee'), R('', 'fairway')] };
      localStorage.clear(); localStorage.setItem('golfsg.player.v1', 'Scott');
      localStorage.setItem('golfsg.rounds.v1', JSON.stringify([{ v: 3, dv: 2, id: 'rw', date: '2026-10-28T17:00:00.000Z', course: 'Wedge test', baseline: 'pga', player: 'Scott', holes }]));
      localStorage.setItem('golfsg.current.v1', 'rw'); });
    const resume = async (i) => { await page.reload(); await page.click('[data-act="resume"]'); await page.waitForSelector('select[data-f="loc"]');
      for (let n = 0; n < (i || 0); n++) await page.click('[aria-label="Next hole"]');
      await page.waitForFunction(i => document.querySelector('.holecard h2').textContent === 'Hole ' + (i + 1), i || 0); };
    // 1. empty ladder → the normal picker everywhere
    await resume(0);
    assert.strictEqual(await page.locator('select[data-f="wladder"]').count(), 0); assert.strictEqual(await page.locator('select[data-f="club"]').count(), 2);
    const sg0 = await page.evaluate(() => SG.analyzeHole(window.__golf.rounds()[0].holes[0], 'pga').sg);
    // 2. with a ladder: the 72 yd shot gets the ladder dropdown, nearest (70) preselected
    await page.evaluate(c => localStorage.setItem('golfsg.wedges.v1', JSON.stringify(c)), CHART);
    await resume(0);
    assert.strictEqual(await page.locator('select[data-f="club"][data-k="0"]').count(), 1, 'tee shot (380) keeps the club picker');
    assert.strictEqual(await page.locator('select[data-f="club"][data-k="1"]').count(), 0, 'no club picker in wedge range');
    assert.deepStrictEqual(await page.$$eval('select[data-f="wladder"][data-k="1"] option', o => o.map(x => x.textContent)), LABELS);
    assert.strictEqual(await page.inputValue('select[data-f="wladder"][data-k="1"]'), 'wh70', 'nearest preselected');
    let hr = await holeRows(0); assert.strictEqual(hr[1].club, '54'); assert.strictEqual(hr[1].wedgeY, 70); assert.strictEqual(hr[1].wedgeF, 'high');
    assert.match(await page.textContent('.clubrow[data-club="1"] .wladet'), /FlightHigh.*Club54°.*BallMiddle.*PositionP2.*Lean 1–2° · Hinge 90°/);
    // Low flight entry at the same yardage
    await page.selectOption('select[data-f="wladder"][data-k="1"]', 'wl70');
    hr = await holeRows(0); assert.deepStrictEqual([hr[1].club, hr[1].wedgeY, hr[1].wedgeF], ['56', 70, 'low']);
    assert.deepStrictEqual(await page.$$eval('.clubrow[data-club="1"] .wladet span', e => e.map(x => x.textContent)), ['FlightLow', 'Club56°', 'BallBack', 'PositionP1']);
    assert.strictEqual(await page.textContent('.clubrow[data-club="1"] .wladet small'), 'Lean 3–4° · Hinge 45°');
    assert.strictEqual(await page.locator('.clubrow.putter').count(), 1, 'putts unchanged');
    // 3. choose another entry → club + details follow; SG unaffected
    await page.selectOption('select[data-f="wladder"][data-k="1"]', 'wh100');
    hr = await holeRows(0); assert.strictEqual(hr[1].club, 'PW'); assert.strictEqual(hr[1].wedgeY, 100); assert.ok(!hr[1].wedgeAuto);
    assert.deepStrictEqual(await page.$$eval('.clubrow[data-club="1"] .wladet span', e => e.map(x => x.textContent)), ['FlightHigh', 'ClubPW', 'BallBack', 'PositionP3']);
    assert.strictEqual(await page.textContent('.clubrow[data-club="1"] .wladet small'), 'Lean 0° · Hinge Full');
    const sg1 = await page.evaluate(() => SG.analyzeHole(window.__golf.rounds()[0].holes[0], 'pga').sg); assert.ok(Math.abs(sg1 - sg0) < 1e-9, 'SG unchanged');
    // club stats still see the club
    assert.ok(await page.evaluate(() => window.__golf.rounds()[0].holes[0].rows[1].club === 'PW'));
    // a typed distance change keeps a chosen club; leaving range shows the normal picker with it
    await page.fill('input[data-row="1"]', '130'); await page.waitForSelector('select[data-f="club"][data-k="1"]');
    assert.strictEqual(await page.inputValue('select[data-f="club"][data-k="1"]'), 'PW');
    await page.fill('input[data-row="1"]', '72'); await page.waitForSelector('select[data-f="wladder"][data-k="1"]');
    assert.strictEqual(await page.inputValue('select[data-f="wladder"][data-k="1"]'), 'wh100', 'your pick sticks');
    // 4. persistence after reload
    await resume(0); assert.strictEqual(await page.inputValue('select[data-f="wladder"][data-k="1"]'), 'wh100'); assert.match(await page.textContent('.wladet'), /ClubPW/);
    // "–" clears the club
    await page.selectOption('select[data-f="wladder"][data-k="1"]', ''); hr = await holeRows(0); assert.ok(!hr[1].club && !hr[1].wedgeY);
    assert.strictEqual(await page.locator('.wladet').count(), 0);
    await page.selectOption('select[data-f="wladder"][data-k="1"]', 'wh70');
    // 5. hole 2: 150 → normal picker; 95 with 7i (not in the ladder) still shows its club
    await resume(1);
    assert.strictEqual(await page.locator('select[data-f="club"][data-k="1"]').count(), 1);
    assert.strictEqual(await page.inputValue('select[data-f="wladder"][data-k="2"]'), 'c:7i'); assert.strictEqual(await page.locator('.clubrow[data-club="2"] .wladet').count(), 0);
    hr = await holeRows(1); assert.strictEqual(hr[2].club, '7i', 'existing club untouched');
    // 6. typing a distance into range picks the nearest for you, focus kept; leaving range clears an auto pick
    await page.click('[aria-label="Next hole"]'); await page.waitForFunction(() => document.querySelector('.holecard h2').textContent === 'Hole 3');
    await page.click('input[data-row="1"]'); await page.keyboard.type('48');
    await page.waitForSelector('select[data-f="wladder"][data-k="1"]'); assert.strictEqual(await page.inputValue('select[data-f="wladder"][data-k="1"]'), 'wh50');
    assert.strictEqual(await page.evaluate(() => document.activeElement.getAttribute('data-row')), '1', 'keyboard stays up');
    hr = await holeRows(2); assert.strictEqual(hr[1].club, '58'); assert.ok(hr[1].wedgeAuto);
    await page.keyboard.press('Backspace'); await page.keyboard.press('Backspace'); await page.keyboard.type('130');
    await page.waitForSelector('select[data-f="club"][data-k="1"]'); hr = await holeRows(2); assert.ok(!hr[1].club, 'auto pick cleared outside range');
    // 7. ladder emptied → the normal picker returns and the chosen club is kept
    await page.evaluate(() => localStorage.removeItem('golfsg.wedges.v1')); await resume(0);
    assert.strictEqual(await page.locator('select[data-f="wladder"]').count(), 0); assert.strictEqual(await page.inputValue('select[data-f="club"][data-k="1"]'), '54');
    // 8. screenshot: ~70 yd shot, ladder + details
    await page.evaluate(c => localStorage.setItem('golfsg.wedges.v1', JSON.stringify(c)), CHART); await resume(0);
    assert.strictEqual(await page.inputValue('select[data-f="wladder"][data-k="1"]'), 'wh70');
    await page.evaluate(() => { const r = document.querySelector('.clubrow[data-club="1"]'); window.scrollTo(0, Math.max(0, r.getBoundingClientRect().top + window.scrollY - 330)); });
    await shot('score-wedge-ladder');
    assert.deepStrictEqual(errors, []); console.log('WEDGE LADDER OK');
  } finally { await br.close(); srv.kill(); }
})().catch(e => { console.error(e); process.exit(1); });
