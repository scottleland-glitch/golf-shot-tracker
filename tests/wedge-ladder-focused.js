// v95 / v229 Wedge yardages on the scoring page. Carry distances, so any shot 100 yd or less (not on the green)
// gets a dropdown of three carries around the pin distance (rounded to the nearest 10, then −10 / +10, slid into 40–110),
// unset ones greyed – with nothing preselected. v229: a single Yardages list (no High/Low groups or labels). Stored
// Low-flight data in old charts is kept but not offered. Picking one sets the shot's club, stores the carry, and shows the setup under it.
// Over 100 yd → the normal club picker. No yardage set at all → the normal club picker.
const assert = require('assert'); const { spawn } = require('child_process');
const W = require('../wedges.js');
const path = require('path');
const OUT = '/tmp/wedge-test-shots/', PORT = 8832, BASE = 'http://127.0.0.1:' + PORT + '/';
const CHART = { v: 3, updated: '2026-10-28T20:00:00.000Z', rows: {
  40: { club: '60', ball: 'back', lean: '1-2', pos: 'p1', hinge: '45' }, 50: { club: '58', ball: 'front', pos: 'p1' },
  70: { club: '54', ball: 'middle', lean: '1-2', pos: 'p2', hinge: '90' }, 90: { ball: 'back' }, 75: { club: '56' },
  100: { club: 'PW', ball: 'back', lean: '0', pos: 'p3', hinge: 'full' } },
  low: { 70: { club: '56', ball: 'back', lean: '3-4', pos: 'p1', hinge: '45' }, 60: { club: '58', ball: 'middle', pos: 'p2' } } };
const LABELS = ['40 yd · 60° · Back · P1', '50 yd · 58° · Front · P1', '60 yd · not set', '70 yd · 54° · Middle · P2',
  '80 yd · not set', '90 yd · not set', '100 yd · PW · Back · P3', '110 yd · not set'];
// ---------- data helpers ----------
{
  const kept = W.norm(CHART);
  assert.strictEqual(kept.low[70].club, '56', 'stored Low-flight data is kept');
  assert.strictEqual(kept.low[60].club, '58');
  const L = W.fullLadder(CHART);
  assert.strictEqual(L.length, 8, '8 High yardages only (hidden 75 not listed; Low not offered)');
  assert.deepStrictEqual(L.map(W.ladderLabel), LABELS);
  assert.deepStrictEqual(L.filter(e => e.set).map(e => e.f + e.y), ['high40', 'high50', 'high70', 'high100'], '90 has no club → not set; Low hidden');
  // three carries: round to the nearest 10 (halves up), then ±10, slid into 40–110
  for (const [d, c] of [[60, [50, 60, 70]], [73, [60, 70, 80]], [77, [70, 80, 90]], [75, [70, 80, 90]], [40, [40, 50, 60]], [45, [40, 50, 60]],
    [105, [90, 100, 110]], [100, [90, 100, 110]], [15, [40, 50, 60]], [20, [40, 50, 60]], [85, [80, 90, 100]]]) assert.deepStrictEqual(W.carries(d), c, 'carries ' + d);
  assert.deepStrictEqual(W.nearLadder(CHART, 73).map(W.ladderLabel), ['60 yd · not set', '70 yd · 54° · Middle · P2', '80 yd · not set']);
  assert.ok(W.inRange(100) && W.inRange(1) && W.inRange(15) && W.inRange(40) && !W.inRange(101) && !W.inRange(0) && !W.inRange('') && !W.inRange(null), 'more than 0, up to 100');
  assert.strictEqual(W.fullLadder(W.blank()).filter(e => e.set).length, 0);
  console.log('  ladder helpers ok');
}
(async () => {
  const { chromium } = require('playwright-core');
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: path.join(__dirname, '..'), stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1500)); const errors = [];
  const br = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  try {
    const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    const page = await ctx.newPage(); page.setDefaultTimeout(20000); page.on('pageerror', e => errors.push(String(e))); page.on('dialog', d => d.accept());
    const shot = n => page.screenshot({ path: OUT + n + '.png' });
    const holeRows = i => page.evaluate(i => JSON.parse(localStorage.getItem('golfsg.rounds.v1'))[0].holes[i].rows, i);
    const sel = k => 'select[data-f="wladder"][data-k="' + k + '"]';
    await page.goto(BASE + '?x=' + Date.now());
    await page.evaluate(() => { const R = (d, l, x) => Object.assign({ dist: d, loc: l, dir: '', pen: false }, x || {});
      const holes = Array.from({ length: 18 }, () => ({ par: 4, rows: [R('', 'tee')] }));
      holes[0] = { par: 4, rows: [R(380, 'tee', { club: 'Driver' }), R(73, 'fairway'), R(12, 'green'), R(2, 'holed')] };
      holes[1] = { par: 4, rows: [R(410, 'tee'), R(101, 'fairway'), R(100, 'rough', { club: '7i' }), R(15, 'fairway'), R(8, 'green'), R(1, 'holed')] };
      holes[2] = { par: 4, rows: [R(360, 'tee'), R('', 'fairway')] };
      holes[3] = { par: 4, rows: [R(350, 'tee'), R(72, 'fairway', { club: '54', wedgeY: 70, wedgeF: 'high', wedgeAuto: true })] }; // a v94 automatic pick
      localStorage.clear(); localStorage.setItem('golfsg.player.v1', 'Scott');
      localStorage.setItem('golfsg.rounds.v1', JSON.stringify([{ v: 3, dv: 2, id: 'rw', date: '2026-10-28T17:00:00.000Z', course: 'Wedge test', baseline: 'pga', player: 'Scott', holes }]));
      localStorage.setItem('golfsg.current.v1', 'rw'); });
    const resume = async (i) => { await page.reload(); await page.click('[data-act="resume"]'); await page.waitForSelector('select[data-f="loc"]');
      for (let n = 0; n < (i || 0); n++) await page.click('[aria-label="Next hole"]');
      await page.waitForFunction(i => document.querySelector('.holecard h2').textContent === 'Hole ' + (i + 1), i || 0); };
    // v115: only the active shot has entry cells – tap a shot's tight line to open it
    const open = async k => { if (await page.$('.tline[data-k="' + k + '"]')) { await page.click('.tline[data-k="' + k + '"]'); await page.waitForSelector('input[data-row="' + k + '"]'); } };
    // 1. no wedge setups yet → the normal picker
    await resume(0);
    assert.strictEqual(await page.locator('select[data-f="wladder"]').count(), 0); await open(0); assert.strictEqual(await page.locator('select[data-f="club"][data-k="0"]').count(), 1);
    await open(1); assert.strictEqual(await page.locator('select[data-f="wladder"]').count(), 0); assert.strictEqual(await page.locator('select[data-f="club"][data-k="1"]').count(), 1);
    const sg0 = await page.evaluate(() => SG.analyzeHole(window.__golf.rounds()[0].holes[0], 'pga').sg);
    // 2. with a chart: the 73 yd shot lists 60/70/80 Yardages, unset greyed, nothing preselected; Low is not listed
    await page.evaluate(c => localStorage.setItem('golfsg.wedges.v1', JSON.stringify(c)), CHART);
    await resume(0);
    const groups = k => page.$$eval(sel(k) + ' optgroup', g => g.map(x => [x.label, [...x.querySelectorAll('option')].map(o => o.value)]));
    await open(0); assert.strictEqual(await page.locator('select[data-f="club"][data-k="0"]').count(), 1, 'tee shot (380) keeps the club picker'); await open(1);
    assert.strictEqual(await page.locator('select[data-f="club"][data-k="1"]').count(), 0, 'no club picker at 100 yd and in');
    assert.strictEqual(await page.inputValue(sel(1)), '', 'nothing preselected'); assert.strictEqual(await page.$eval(sel(1), e => e.options[e.selectedIndex].textContent), 'Choose carry…');
    assert.deepStrictEqual(await groups(1), [['Yardages', ['wh60', 'wh70', 'wh80']]]);
    assert.deepStrictEqual(await page.$$eval(sel(1) + ' optgroup option', o => o.map(x => x.textContent)), ['60 yd · not set', '70 yd · 54° · Middle · P2', '80 yd · not set']);
    assert.deepStrictEqual(await page.$$eval(sel(1) + ' option:disabled', o => o.map(x => x.value)), ['wh60', 'wh80'], 'unset entries greyed');
    assert.strictEqual(await page.$(sel(1) + ' option[value="wl70"]'), null, 'stored Low-flight data is not offered');
    let hr = await holeRows(0); assert.ok(!hr[1].club && !hr[1].wedgeY, 'no club picked for you'); assert.strictEqual(await page.locator('.wladet').count(), 0);
    assert.strictEqual(await page.textContent('.tline[data-k="2"] .t-c'), 'Putter', 'putts unchanged');
    // open-list screenshot (the native picker can't be captured, so show the options as a list for the screenshot only)
    await page.evaluate(s => { const e = document.querySelector(s); e.size = 6; e.style.height = 'auto'; e.style.fontSize = '14px'; e.closest('.clubrow').scrollIntoView({ block: 'start' }); window.scrollBy(0, -220); }, sel(1));
    await shot('score-wedge-ladder-open');
    await page.evaluate(s => { const e = document.querySelector(s); e.size = 0; e.style.height = ''; e.style.fontSize = ''; }, sel(1));
    // 3. pick a carry → club and carry stored, details card (no Flight line); SG unaffected
    await page.selectOption(sel(1), 'wh70');
    hr = await holeRows(0); assert.deepStrictEqual([hr[1].club, hr[1].wedgeY, hr[1].wedgeF], ['54', 70, 'high']); assert.ok(!hr[1].wedgeAuto);
    assert.deepStrictEqual(await page.$$eval('.clubrow[data-club="1"] .wladet span', e => e.map(x => x.textContent)), ['Carry70 yd', 'Club54°', 'BallMiddle', 'PositionP2']);
    assert.strictEqual(await page.textContent('.clubrow[data-club="1"] .wladet small'), 'Lean 1–2° · Hinge 90°');
    const sg1 = await page.evaluate(() => SG.analyzeHole(window.__golf.rounds()[0].holes[0], 'pga').sg); assert.ok(Math.abs(sg1 - sg0) < 1e-9, 'SG unchanged');
    // typing a new distance recomputes the list but never changes the pick; a pick outside the new list stays shown
    await page.fill('input[data-row="1"]', '60'); await page.waitForFunction(s => document.querySelector(s + ' option[value="wh50"]'), sel(1));
    assert.deepStrictEqual(await groups(1), [['Yardages', ['wh50', 'wh60', 'wh70']]]); assert.strictEqual(await page.inputValue(sel(1)), 'wh70');
    await page.fill('input[data-row="1"]', '40'); await page.waitForFunction(s => document.querySelector(s + ' option[value="wh40"]'), sel(1));
    assert.deepStrictEqual(await groups(1), [['Yardages', ['wh40', 'wh50', 'wh60', 'wh70']]], 'chosen 70 kept in the list');
    assert.strictEqual(await page.inputValue(sel(1)), 'wh70'); assert.match(await page.textContent('.clubrow[data-club="1"] .wladet'), /Carry70 yd/);
    await page.fill('input[data-row="1"]', '130'); await page.waitForSelector('select[data-f="club"][data-k="1"]');
    assert.strictEqual(await page.inputValue('select[data-f="club"][data-k="1"]'), '54', '>100 → normal picker, club kept');
    await page.fill('input[data-row="1"]', '73'); await page.waitForSelector(sel(1)); assert.strictEqual(await page.inputValue(sel(1)), 'wh70', 'your pick sticks');
    // 4. persistence after reload – carry, not just the club; no Flight label
    await resume(0); await open(1); assert.strictEqual(await page.inputValue(sel(1)), 'wh70'); assert.match(await page.textContent('.wladet'), /Carry70 yd.*Club54°/);
    assert.ok(!/Flight/.test(await page.textContent('.wladet')));
    await page.evaluate(() => { const r = document.querySelector('.clubrow[data-club="1"]'); window.scrollTo(0, Math.max(0, r.getBoundingClientRect().top + window.scrollY - 330)); });
    await shot('score-wedge-ladder');
    // "Choose carry…" clears it
    await page.selectOption(sel(1), ''); hr = await holeRows(0); assert.ok(!hr[1].club && !hr[1].wedgeY && !hr[1].wedgeF); assert.strictEqual(await page.locator('.wladet').count(), 0);
    assert.strictEqual(await page.inputValue(sel(1)), '', 'stays empty');
    await page.selectOption(sel(1), 'wh70');
    // 5. hole 2: 101 → normal picker; 100 with 7i (not in the chart) keeps it; a 15 yd chip gets the chart too
    await resume(1); await open(1);
    assert.strictEqual(await page.locator('select[data-f="club"][data-k="1"]').count(), 1, '101 yd → club picker');
    await open(2); assert.strictEqual(await page.inputValue(sel(2)), 'c:7i'); assert.strictEqual(await page.locator('.clubrow[data-club="2"] .wladet').count(), 0);
    hr = await holeRows(1); assert.strictEqual(hr[2].club, '7i', 'existing club untouched');
    assert.deepStrictEqual(await groups(2), [['Yardages', ['wh90', 'wh100', 'wh110']]], '100 → 90/100/110');
    await open(3); assert.strictEqual(await page.inputValue(sel(3)), '', '15 yd chip: chart, nothing preselected'); assert.ok(!hr[3].club);
    assert.deepStrictEqual(await groups(3), [['Yardages', ['wh40', 'wh50', 'wh60']]], '15 → 40/50/60');
    // 6. typing a distance into range shows the chart but picks nothing; keyboard stays up
    await page.click('[aria-label="Next hole"]'); await page.waitForFunction(() => document.querySelector('.holecard h2').textContent === 'Hole 3');
    await page.click('input[data-row="1"]'); await page.keyboard.type('48');
    await page.waitForSelector(sel(1)); assert.strictEqual(await page.inputValue(sel(1)), '');
    // v181: Putter is on the wedge-chart list too (putting from the fringe / a tight fairway)
    assert.ok(await page.$(sel(1) + ' option[value="c:Putter"]'));
    assert.strictEqual(await page.evaluate(() => document.activeElement.getAttribute('data-row')), '1', 'keyboard stays up');
    hr = await holeRows(2); assert.ok(!hr[1].club, 'no auto pick');
    for (const [d, c] of [['60', [50, 60, 70]], ['73', [60, 70, 80]], ['77', [70, 80, 90]], ['75', [70, 80, 90]], ['40', [40, 50, 60]], ['15', [40, 50, 60]]]) {
      await page.fill('input[data-row="1"]', d); await page.waitForFunction(([s, v]) => document.querySelector(s + ' optgroup option') && document.querySelector(s + ' optgroup option').value === v, [sel(1), 'wh' + c[0]]);
      assert.deepStrictEqual(await groups(1), [['Yardages', c.map(y => 'wh' + y)]], 'typed ' + d); assert.strictEqual(await page.inputValue(sel(1)), '');
    }
    await page.fill('input[data-row="1"]', '105'); await page.waitForSelector('select[data-f="club"][data-k="1"]'); // over 100 → club picker
    await page.fill('input[data-row="1"]', '101'); await page.waitForSelector('select[data-f="club"][data-k="1"]');
    await page.waitForSelector('select[data-f="club"][data-k="1"]');
    // 7. a v94 automatic pick just keeps its club
    await page.click('[aria-label="Next hole"]'); await page.waitForFunction(() => document.querySelector('.holecard h2').textContent === 'Hole 4');
    assert.strictEqual(await page.inputValue(sel(1)), 'c:54'); assert.strictEqual(await page.locator('.wladet').count(), 0);
    hr = await holeRows(3); assert.strictEqual(hr[1].club, '54');
    // 8. no yardage set → the normal picker returns and the chosen club is kept
    await page.evaluate(() => localStorage.removeItem('golfsg.wedges.v1')); await resume(0); await open(1);
    assert.strictEqual(await page.locator('select[data-f="wladder"]').count(), 0); assert.strictEqual(await page.inputValue('select[data-f="club"][data-k="1"]'), '54');
    assert.deepStrictEqual(errors, []); console.log('WEDGE LADDER OK');
  } finally { await br.close(); srv.kill(); }
})().catch(e => { console.error(e); process.exit(1); });
