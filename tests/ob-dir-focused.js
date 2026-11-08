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
    await page.waitForSelector('select[data-f="loc"][data-k="1"]');
    const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('golfsg.rounds.v1'))[0].holes[0].rows[1]);
    // rough: all 8 directions on
    await page.click('[data-act="dirpick"][data-k="1"]'); assert.strictEqual(await page.$$eval('.dirgrid button:disabled', e => e.length), 0); assert.strictEqual(await page.$('#dirobnote'), null);
    await page.click('.sheet [data-act="dirclose"]'); ok('rough: all directions available');
    // switch to OB: the stored "short" is cleared, Short / Long are off, corners and sides stay
    await page.selectOption('select[data-f="loc"][data-k="1"]', 'ob'); assert.strictEqual((await stored()).dir, '');
    await page.click('[data-act="dirpick"][data-k="1"]');
    assert.deepStrictEqual(await page.$$eval('.dirgrid button:disabled', e => e.map(x => x.dataset.v).sort()), ['long', 'short']);
    assert.ok(await page.$('#dirobnote'));
    await page.click('.sheet [data-act="setdir"][data-v="shortleft"]'); assert.strictEqual((await stored()).dir, 'shortleft');
    ok('OB: short cleared, Short/Long off with a note, Short-left still works');
    // penalty area: all 8 again
    await page.selectOption('select[data-f="loc"][data-k="1"]', 'hazard'); await page.click('[data-act="dirpick"][data-k="1"]');
    assert.strictEqual(await page.$$eval('.dirgrid button:disabled', e => e.length), 0); await page.click('.sheet [data-act="setdir"][data-v="short"]');
    assert.strictEqual((await stored()).dir, 'short'); ok('penalty area: Short still allowed');
    assert.deepStrictEqual(errors, []); console.log('PASS ob-dir-focused');
  } finally { await b.close(); srv.kill(); }
})().catch(e => { console.error(e); process.exit(1); });
