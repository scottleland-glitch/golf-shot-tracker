// v231 screenshots: Long greyed out on Fairway, Long active on Rough, Driver box for a through-the-green par 4.
// Do not open the putting data-entry screen. Run: node tests/long-dir-shots.js
const { chromium } = require('playwright-core'); const assert = require('assert'); const { spawn } = require('child_process'); const fs = require('fs');
const ROOT = __dirname + '/../', OUT = '/tmp/long-fix-shots/', PORT = 8878, BASE = 'http://127.0.0.1:' + PORT + '/';
const ok = m => console.log('  ✓ ' + m);
fs.mkdirSync(OUT, { recursive: true });

const R = (d, loc, dir, club, pen) => ({ dist: d, loc, dir: dir || '', pen: !!pen, club: club || '' });
const holes18 = () => Array.from({ length: 18 }, () => ({ par: 4, rows: [{ loc: 'tee', dist: '', dir: '', pen: false }] }));

function liveRound() {
  const holes = holes18();
  holes[0] = { par: 4, finished: false, rows: [R(320, 'tee', '', 'Driver'), R(25, 'fairway', '')] };
  return { v: 3, dv: 2, id: 'live', date: '2026-11-17T18:00:00.000Z', course: 'Test', player: 'Scott', baseline: 'pga', holes };
}
function statsRound() {
  const holes = [
    { par: 4, finished: true, rows: [R(320, 'tee', '', 'Driver'), R(25, 'rough', 'long'), R(8, 'green'), R(2, 'holed')] },
    { par: 4, finished: true, rows: [R(380, 'tee', '', 'Driver'), R(110, 'fairway'), R(18, 'green'), R(2, 'holed')] },
    { par: 3, finished: true, rows: [R(155, 'tee'), R(18, 'green'), R(2, 'holed')] },
    { par: 5, finished: true, rows: [R(520, 'tee', '', 'Driver'), R(240, 'fairway'), R(18, 'green'), R(2, 'holed')] },
    { par: 4, finished: true, rows: [R(365, 'tee', '', 'Driver'), R(90, 'fairway'), R(16, 'green'), R(2, 'holed')] },
    { par: 3, finished: true, rows: [R(140, 'tee'), R(12, 'green'), R(2, 'holed')] },
    { par: 4, finished: true, rows: [R(400, 'tee', '', 'Driver'), R(130, 'fairway'), R(20, 'green'), R(2, 'holed')] },
    { par: 5, finished: true, rows: [R(500, 'tee', '', 'Driver'), R(220, 'fairway'), R(18, 'green'), R(2, 'holed')] },
    { par: 4, finished: true, rows: [R(350, 'tee', '', 'Driver'), R(80, 'fairway'), R(15, 'green'), R(2, 'holed')] }
  ];
  return { v: 3, dv: 2, id: 'drv', date: '2026-11-16T18:00:00.000Z', course: 'Test', nine: true, player: 'Scott', baseline: 'pga', holes };
}

(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1200));
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const errors = [];
  try {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
    const page = await ctx.newPage(); page.setDefaultTimeout(20000);
    page.on('pageerror', e => errors.push(String(e)));

    await page.goto(BASE + '?x=' + Date.now());
    await page.evaluate(r => { localStorage.clear(); localStorage.setItem('golfsg.player.v1', 'Scott'); localStorage.setItem('golfsg.nameasked.v1', '1');
      localStorage.setItem('golfsg.rounds.v1', JSON.stringify([r])); localStorage.setItem('golfsg.current.v1', r.id); }, liveRound());
    await page.reload(); await page.waitForSelector('#home'); await page.click('#resumepill');
    await page.waitForSelector('.shotcard, .tline[data-k="0"]');
    if (!(await page.$('.shotcard[data-k="0"]'))) {
      await page.click('.tline[data-k="0"]'); await page.waitForSelector('.shotcard[data-k="0"]');
    }
    // no putting pad on this card
    assert.strictEqual(await page.$('.readpad, #readpad, [data-f="rd"]'), null, 'must not show the putting data-entry screen');
    await page.click('#scdirpick, [data-act="dirpick"][data-k="1"]');
    await page.waitForSelector('.dirgrid');
    const fw = await page.$$eval('.dirgrid button', els => els.map(b => ({ v: b.getAttribute('data-v'), dis: b.disabled, sel: b.classList.contains('sel'), t: b.textContent.trim() })));
    const by = Object.fromEntries(fw.map(b => [b.v, b]));
    assert.ok(by.long.dis && by.longleft.dis && by.longright.dis, 'Long family greyed out on Fairway');
    assert.ok(!by.left.dis && !by.short.dis && !by.right.dis, 'other directions stay on');
    assert.match(await page.textContent('#dirfwnnote'), /Long is off on the fairway/);
    await page.screenshot({ path: OUT + 'shot-entry-fairway-long-greyed.png' });
    ok('Fairway: Long greyed out → ' + OUT + 'shot-entry-fairway-long-greyed.png');
    await page.click('[data-act="dirclose"].big');
    await page.waitForSelector('.dirgrid', { state: 'detached' });

    // switching to Fairway after Long on Rough clears Long
    await page.selectOption('select[data-f="fin"][data-k="0"]', 'rough');
    await page.selectOption('select[data-f="dir"][data-k="1"]', 'long');
    assert.strictEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('golfsg.rounds.v1'))[0].holes[0].rows[1].dir), 'long');
    await page.selectOption('select[data-f="fin"][data-k="0"]', 'fairway');
    assert.strictEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('golfsg.rounds.v1'))[0].holes[0].rows[1].dir), '');
    ok('choosing Fairway after Long clears Long');

    await page.selectOption('select[data-f="fin"][data-k="0"]', 'rough');
    await page.selectOption('select[data-f="dir"][data-k="1"]', 'long');
    assert.strictEqual(await page.$('.readpad, #readpad, [data-f="rd"]'), null, 'still not on the putting screen');
    await page.click('#scdirpick, [data-act="dirpick"][data-k="1"]');
    await page.waitForSelector('.dirgrid');
    const rg = await page.$$eval('.dirgrid button', els => els.map(b => ({ v: b.getAttribute('data-v'), dis: b.disabled, sel: b.classList.contains('sel') })));
    const rb = Object.fromEntries(rg.map(b => [b.v, b]));
    assert.ok(!rb.long.dis && rb.long.sel, 'Long is enabled and selected on Rough');
    assert.ok(!rb.longleft.dis && !rb.longright.dis);
    await page.screenshot({ path: OUT + 'shot-entry-rough-long-active.png' });
    ok('Rough: Long active → ' + OUT + 'shot-entry-rough-long-active.png');
    await page.click('[data-act="dirclose"].big');

    // Stats driver box
    await page.evaluate(r => { localStorage.setItem('golfsg.player.v1', 'Scott'); localStorage.setItem('golfsg.nameasked.v1', '1');
      localStorage.setItem('golfsg.rounds.v1', JSON.stringify([r])); localStorage.removeItem('golfsg.current.v1'); }, statsRound());
    await page.goto(BASE + '?x=' + Date.now());
    await page.waitForSelector('#home');
    await page.click('#navbtn'); await page.waitForSelector('#navmenu'); await page.click('#navmenu [data-act="stats"]');
    await page.waitForSelector('#statspage');
    if (await page.$('#stcat-driver .stcath')) {
      const collapsed = await page.$eval('#stcat-driver', el => !el.classList.contains('open') || !!(el.querySelector('.stcatb') || {}).hidden);
      if (collapsed) await page.click('#stcat-driver .stcath');
    }
    await page.waitForSelector('#st-drive', { state: 'visible' });
    await page.locator('#st-drive').scrollIntoViewIfNeeded();
    const driven = await page.textContent('#driven, #driveval, #st-drive');
    assert.match(driven, /345/, 'through-the-green 320+25 drive shows in the Driver box: ' + driven);
    assert.doesNotMatch(driven, /742/);
    await page.screenshot({ path: OUT + 'stats-driver-over-green.png' });
    ok('Stats Driver box → ' + OUT + 'stats-driver-over-green.png');

    assert.deepStrictEqual(errors, [], 'no page errors: ' + errors.join(' | '));
    console.log('PASS long-dir-shots');
  } finally { await b.close(); srv.kill(); }
})().catch(e => { console.error(e); process.exit(1); });
