// v148 "Log this drill" on Round stats opens My Game with a way back: ‹ Round (not ‹ Home), and Save / Cancel return to the round. Run: node tests/drill-back-focused.js
const { chromium } = require('playwright-core'); const assert = require('assert'); const { spawn } = require('child_process');
const ARC = require('./fixtures/arcade-78.js');
const PORT = 8873, BASE = 'http://127.0.0.1:' + PORT + '/', ok = m => console.log('  ✓ ' + m);
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: __dirname + '/../', stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1200)); const errors = [];
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  try {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
    const page = await ctx.newPage(); page.setDefaultTimeout(20000); page.on('pageerror', e => errors.push(String(e)));
    await page.goto(BASE + '?x=' + Date.now());
    await page.evaluate(rs => { localStorage.clear(); localStorage.setItem('golfsg.player.v1', 'Scott'); localStorage.setItem('golfsg.nameasked.v1', '1'); localStorage.setItem('golfsg.rounds.v1', JSON.stringify(rs)); }, [Object.assign(ARC.round(), { player: 'Scott' })]);
    await page.reload(); await page.waitForSelector('#home'); if (await page.$('#plusbtn')) await page.click('#navbtn');
    await page.click('[data-act="history"]'); await page.click('#histlist [data-act="open"][data-id="arc78"]'); await page.waitForSelector('#prdrill');
    const toRound = async () => { await page.waitForSelector('#takeaway'); assert.ok(await page.$('#prdrill')); assert.strictEqual(await page.$('#mygame'), null); };
    // ‹ Round
    await page.click('#prdrill'); await page.waitForSelector('#prsheet');
    assert.strictEqual((await page.textContent('#mgback')).trim(), '‹ Round'); assert.strictEqual(await page.$('#mygame [data-act="home"]'), null);
    await page.click('#mgback'); await toRound(); ok('‹ Round goes back to the round');
    // Cancel
    await page.click('#prdrill'); await page.waitForSelector('#prsheet'); await page.click('[data-act="prcancel"]'); await toRound(); ok('Cancel goes back to the round');
    // Save
    await page.click('#prdrill'); await page.waitForSelector('#prsheet'); await page.click('#prsave'); await toRound();
    assert.strictEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('golfsg.practice.v1')).length), 1); ok('Save stores the practice and goes back to the round');
    // Back on the round page, the round's own back button still works (‹ Rounds from history)
    await page.click('#rsmenubtn'); assert.ok(await page.$('#rsmenu [data-act="history"]')); await page.$eval('.rsback', e => e.click()); ok('the round still leads back to Rounds (☰)');
    // My Game opened normally still has ‹ Home
    await (async (P) => { if (!(await P.$('.topbar [data-act="home"]')) && await P.$('#rsmenubtn')) await P.click('#rsmenubtn'); return P.click('.topbar [data-act="home"], #rsmenu [data-act="home"]'); })(page) /* v191: in ☰ on Round stats */; await page.waitForSelector('#home');
    await page.click('#mgcard'); await page.waitForSelector('#mygame'); assert.strictEqual(await page.$('#mgback'), null); assert.ok(await page.$('#mygame .topbar [data-act="home"]')); ok('My Game from Home keeps ‹ Home');
    assert.deepStrictEqual(errors, []); console.log('PASS drill-back-focused');
  } finally { await b.close(); srv.kill(); }
})().catch(e => { console.error(e); process.exit(1); });
