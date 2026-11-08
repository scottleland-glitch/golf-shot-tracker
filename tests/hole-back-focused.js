// v154 Reviewing a hole has an obvious way back: "‹ Round stats" beside Share live, back to where you were on Round stats.
// A round in progress does not show it (unless the hole was opened from Round stats). Run: node tests/hole-back-focused.js
const { chromium } = require('playwright-core'); const assert = require('assert'); const { spawn } = require('child_process');
const ARC = require('./fixtures/arcade-78.js'); const PORT = 8879, BASE = 'http://127.0.0.1:' + PORT + '/', ok = m => console.log('  ✓ ' + m);
const OUT = process.env.SHOTS || '/workspace/golf-app/screenshots';
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: __dirname + '/../', stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1200)); const errors = [];
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  try {
    const page = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' })).newPage();
    page.setDefaultTimeout(15000); page.on('pageerror', e => errors.push(String(e)));
    await page.goto(BASE + '?x=' + Date.now());
    await page.evaluate(rs => { localStorage.clear(); localStorage.setItem('golfsg.player.v1', 'Scott'); localStorage.setItem('golfsg.nameasked.v1', '1'); localStorage.setItem('golfsg.rounds.v1', JSON.stringify(rs)); }, [Object.assign(ARC.round(), { player: 'Scott' })]);
    await page.reload(); await page.waitForSelector('#home'); if (await page.$('#plusbtn')) await page.click('#plusbtn');
    await page.click('[data-act="history"]'); await page.click('#histlist [data-act="open"][data-id="arc78"]'); await page.waitForSelector('#scorecard');
    await page.locator('#scorecard').scrollIntoViewIfNeeded(); const y0 = await page.evaluate(() => window.scrollY);
    await page.click('#scorecard [data-act="goHole"][data-i="5"]'); await page.waitForSelector('#holeback');
    assert.strictEqual((await page.textContent('#holeback')).trim(), '‹ Round stats');
    await page.screenshot({ path: OUT + '/hole-back-v154.png', clip: { x: 0, y: 0, width: 390, height: 260 } });
    await page.click('[data-act="next"][aria-label="Next hole"]'); assert.ok(await page.$('#holeback'), 'still there on the next hole');
    ok('a hole opened from the scorecard shows ‹ Round stats (and keeps it moving between holes)');
    await page.click('#holeback'); await page.waitForSelector('#scorecard');
    const y1 = await page.evaluate(() => window.scrollY); assert.ok(Math.abs(y1 - y0) < 40, 'back where you were ' + y0 + ' vs ' + y1);
    ok('‹ Round stats goes back to the scorecard where you left it');
    // a round in progress, scored from the hole screen: no button
    await page.evaluate(() => localStorage.setItem('golfsg.current.v1', 'arc78')); await page.reload(); await page.waitForSelector('#home'); await page.click('#resumepill');
    await page.waitForSelector('.holecard'); assert.strictEqual(await page.$('#holeback'), null); ok('round in progress: no extra button');
    assert.deepStrictEqual(errors, []); console.log('PASS hole-back-focused');
  } finally { await b.close(); srv.kill(); }
})().catch(e => { console.error(e); process.exit(1); });
