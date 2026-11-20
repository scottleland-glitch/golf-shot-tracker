// v242 (Scott): first launch → I play → How do you want to track? → Score only → a score per hole (putts optional) → the card → score Stats.
// Score-only rounds stay out of strokes gained. iPhone 390x844. Run: node tests/scoreonly-focused.js
const { chromium } = require('playwright-core'); const assert = require('assert'); const { spawn } = require('child_process');
const PORT = 8878, BASE = 'http://127.0.0.1:' + PORT + '/', ok = m => console.log('  ✓ ' + m), OUT = process.argv[2] || 'screenshots';
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: __dirname + '/..', stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1500)); const errors = [];
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  try {
    const page = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' })).newPage();
    page.setDefaultTimeout(30000); page.on('pageerror', e => errors.push(String(e))); page.on('dialog', d => d.accept());
    await page.goto(BASE + '?x=' + Date.now()); await page.evaluate(() => localStorage.clear()); await page.reload();
    await page.waitForSelector('#welcome'); await page.click('#rolego');
    await page.waitForSelector('#trackpick'); assert.strictEqual(await page.$$eval('#trackpick .trackopt', e => e.length), 3); assert.strictEqual(await page.getAttribute('#trackfull', 'aria-checked'), 'true', 'full is the default');
    await page.click('#trackscore'); await page.screenshot({ path: OUT + '/v242-track.png' }); await page.click('#trackgo');
    await page.waitForSelector('#namesheet'); assert.match(await page.textContent('#trackline'), /Score only/); assert.strictEqual(await page.$('#modepick'), null, 'no practice switches for score only');
    await page.fill('#pname', 'Sam'); await page.click('#namesheet [data-act="setname"]');
    if (await page.$('#tour')) await page.click('#tourskip');
    const st = await page.evaluate(() => [JSON.parse(localStorage.getItem('golfsg.track.v1')), JSON.parse(localStorage.getItem('golfsg.mode.v1') || '{}')]);
    assert.deepStrictEqual(st, [{ sam: 'score' }, { sam: 'stats' }]); ok('I play → Score only → name: tracking set, no practice switches');
    // tabs: Rounds · + · Stats
    assert.deepStrictEqual(await page.$$eval('#tabbar button', e => e.map(x => x.id)), ['tbrounds', 'tbplus', 'tbstats']); ok('tabs: Rounds · + · Stats');
    // a round: + → New round → Start
    await page.click('#tbplus'); await page.waitForSelector('[data-act="new"]'); await page.fill('#course', 'Lakeridge').catch(() => {}); await page.click('[data-act="new"]');
    await page.waitForSelector('#sohole'); assert.strictEqual(await page.textContent('#soscore'), '4', 'starts at par');
    await page.screenshot({ path: OUT + '/v242-hole.png' });
    const scores = [[4, 2], [5, 2], [3, 1], [6, null], [4, 1], [5, 3], [4, 2], [3, 2], [5, 2]];
    for (let i = 0; i < 9; i++) { const [sc, pt] = scores[i];
      for (let k = 4; k < sc; k++) await page.click('#sohole [data-act="soscore"][data-v="1"]'); for (let k = 4; k > sc; k--) await page.click('#sohole [data-act="soscore"][data-v="-1"]');
      if (pt != null) await page.click('#sohole .soput[data-v="' + pt + '"]');
      assert.strictEqual(await page.textContent('#soscore'), String(sc));
      if (i < 8) await page.click('#sonext'); }
    await page.screenshot({ path: OUT + '/v242-hole9.png' });
    await page.click('#sonine'); await page.waitForSelector('#sosum');
    assert.strictEqual(await page.textContent('#sostrokes'), '39'); assert.match(await page.textContent('#sosum .sotot'), /\+3/); assert.match(await page.textContent('#sosum .sotot'), /15Putts \(8 holes\)/); assert.match(await page.textContent('#sosum .sotot'), /5\/8Greens/);
    await page.screenshot({ path: OUT + '/v242-card.png' });
    const r = await page.evaluate(() => window.__golf.rounds()[0]); assert.strictEqual(r.scoreOnly, true); assert.strictEqual(r.holes.length, 9); assert.strictEqual(await page.evaluate(() => localStorage.getItem('golfsg.current.v1')), null);
    ok('9 holes by − / + with putts, End round after 9 → card: 39, +3, 15 putts (8 holes), 5/8 greens');
    // Stats: score stats
    await page.click('#tbstats').catch(async () => { await page.click('#sorounds'); await page.click('#tbstats'); }); await page.waitForSelector('#statspage.sostats');
    assert.strictEqual(await page.textContent('#soavg b'), '78.0', '9 holes doubled'); assert.match(await page.textContent('#soputt b'), /^\d+\.\d$/); assert.strictEqual(await page.textContent('#sogir b'), '63%');
    await page.screenshot({ path: OUT + '/v242-stats.png' }); ok('Stats: average 78.0 (9 doubled), putts a round, 63% greens');
    // switch to Every shot in Settings: the score-only round stays out of strokes gained
    await page.evaluate(() => { window.__golf.view().screen = 'archive'; window.__golf.render(); }); await page.waitForSelector('#trackrow'); assert.strictEqual(await page.$('#setmoderow'), null, 'no practice switches while score only');
    await page.screenshot({ path: OUT + '/v242-settings.png' }); await page.click('#settrackshots'); await page.waitForSelector('#setmoderow');
    await page.evaluate(() => { window.__golf.view().screen = 'history'; window.__golf.render(); }); await page.waitForSelector('#tabbar');
    assert.deepStrictEqual(await page.$$eval('#tabbar button', e => e.map(x => x.id)), ['tbmygame', 'tbrounds', 'tbplus', 'tbtrends', 'tbstats'], 'every shot, practice still off → strokes gained tabs');
    const m = await page.evaluate(() => { const R = window.__golf.rounds(); return MYGAME.shape(R, SG, 'pga').rounds; }); assert.strictEqual(m, 0, 'not in strokes gained');
    ok('switching to Every shot: the score-only round is kept but stays out of strokes gained');
    assert.deepStrictEqual(errors, []); console.log('SCORE ONLY OK');
  } finally { await b.close(); srv.kill(); }
})().catch(e => { console.error(e); process.exit(1); });
