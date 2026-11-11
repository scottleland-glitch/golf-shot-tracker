// v153 Out of bounds needs a side: on an OB row the direction picker turns off Short and Long (corners stay), and switching a row
// to OB clears a plain short/long. Penalty areas keep all 8. Run: node tests/ob-dir-focused.js
const { chromium } = require('playwright-core'); const assert = require('assert'); const { spawn } = require('child_process');
const PORT = 8877, BASE = 'http://127.0.0.1:' + PORT + '/', ok = m => console.log('  ✓ ' + m);
const holes = Array.from({ length: 18 }, () => ({ par: 4, rows: [{ loc: 'tee', dist: '', dir: '', pen: false }] }));
holes[0].rows = [{ loc: 'tee', dist: 380, dir: '', pen: false }, { loc: 'rough', dist: 150, dir: 'short', pen: false }];
const R = { v: 3, dv: 2, id: 'obt', date: '2026-11-07T17:00:00.000Z', course: 'Test', player: 'Scott', baseline: 'pga', holes };
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: __dirname + '/../', stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1200)); const errors = [];
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  try {
    const page = await (await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' })).newPage();
    page.setDefaultTimeout(15000); page.on('pageerror', e => errors.push(String(e)));
    await page.goto(BASE + '?x=' + Date.now());
    await page.evaluate(r => { localStorage.clear(); localStorage.setItem('golfsg.player.v1', 'Scott'); localStorage.setItem('golfsg.nameasked.v1', '1');
      localStorage.setItem('golfsg.rounds.v1', JSON.stringify([r])); localStorage.setItem('golfsg.current.v1', r.id); }, R);
    await page.reload(); await page.waitForSelector('#home'); await page.click('#resumepill');
    await page.waitForSelector('.shotcard[data-k="1"]'); await page.click('.tline[data-k="0"]'); await page.waitForSelector('.shotcard[data-k="0"]'); // v157: shot 1's card – Finished + which way it missed
    const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('golfsg.rounds.v1'))[0].holes[0].rows[1]);
    // v180: Direction is a dropdown under Finished
    const opts = () => page.$$eval('select[data-f="dir"][data-k="1"] option', e => e.map(o => o.value).filter(Boolean));
    // rough: all 8 directions
    assert.strictEqual((await opts()).length, 8); ok('rough: all directions available');
    // switch to OB: the stored "short" is cleared, Short / Long are not offered, corners and sides stay
    await page.selectOption('select[data-f="fin"][data-k="0"]', 'ob'); assert.strictEqual((await stored()).dir, '');
    assert.deepStrictEqual((await opts()).sort(), ['left', 'longleft', 'longright', 'right', 'shortleft', 'shortright']);
    assert.match(await page.textContent('select[data-f="dir"][data-k="1"] option[value=""]'), /Which side/);
    await page.selectOption('select[data-f="dir"][data-k="1"]', 'shortleft'); assert.strictEqual((await stored()).dir, 'shortleft');
    ok('OB: short cleared, Short/Long not offered, Short-left still works');
    // penalty area: all 8 again
    await page.selectOption('select[data-f="fin"][data-k="0"]', 'hazard'); assert.strictEqual((await opts()).length, 8);
    await page.selectOption('select[data-f="dir"][data-k="1"]', 'short'); assert.strictEqual((await stored()).dir, 'short'); ok('penalty area: Short still allowed');
    assert.deepStrictEqual(errors, []); console.log('PASS ob-dir-focused');
  } finally { await b.close(); srv.kill(); }
})().catch(e => { console.error(e); process.exit(1); });
