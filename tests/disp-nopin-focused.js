// v273 (Scott: "the dispersion page is broken – I chose rounds, deselected down to the last one and now can't get back in"):
// Pin location with rounds picked that have no pin locations (⛳) said nothing useful and failed (pinName undefined), and the saved choice
// kept failing. Now it says so (and app.js / the site start the page fresh if a saved choice ever can't be drawn). Run: node tests/disp-nopin-focused.js
const { chromium } = require('playwright-core'); const { spawn } = require('child_process'); const assert = require('assert'); const path = require('path');
const REPO = path.join(__dirname, '..'), PORT = 8894, ok = m => console.log('  ✓ ' + m);
const FIX = require(REPO + '/tests/fixtures/prox-rounds.js'), ROUNDS = FIX.all();
ROUNDS.forEach((r, ri) => r.holes.forEach((h, i) => { if (ri < ROUNDS.length - 1 && i % 4 !== 3) h.pin = ['frontright', 'center', 'backleft'][i % 3]; })); // the last round: no pin locations
const noPin = ROUNDS[ROUNDS.length - 1].id;
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: REPO, stdio: 'ignore' }); await new Promise(r => setTimeout(r, 1200));
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] }); const errors = [];
  try {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, serviceWorkers: 'block' }), page = await ctx.newPage();
    page.setDefaultTimeout(15000); page.on('pageerror', e => errors.push(String(e)));
    await page.goto('http://127.0.0.1:' + PORT + '/?x=' + Date.now());
    await page.evaluate((R) => { localStorage.clear(); localStorage.setItem('golfsg.player.v1', 'Scott'); localStorage.setItem('golfsg.nameasked.v1', '1'); localStorage.setItem('golfsg.tourdone.v1', '1'); localStorage.setItem('golfsg.rounds.v1', JSON.stringify(R)); }, ROUNDS);
    await page.reload(); await page.waitForSelector('#home'); if (await page.$('#namesheet')) await page.click('[data-act="nameskip"]');
    await page.click('#tbplus'); await page.click('.sheet-item[data-act="dspadd"]'); await page.waitForSelector('#disp');
    await page.click('[data-act="dspsrc"][data-v="pins"]'); await page.waitForSelector('#dsprgrid');
    await page.click('[data-act="dsprplay"][data-v="pick"]'); await page.waitForSelector('#dsppick');
    // pick the no-pin round, then take the others off one by one (the last one can't come off)
    if (!(await page.$eval('.dsprd[data-v="' + noPin + '"]', e => e.classList.contains('sel')))) await page.click('.dsprd[data-v="' + noPin + '"]');
    for (let k = 0; k < 10; k++) { const on = await page.$$eval('.dsprd.sel', e => e.map(x => x.getAttribute('data-v')).filter(v => v !== '' )); const other = on.find(v => v !== noPin); if (!other) break; await page.click('.dsprd[data-v="' + other + '"]'); await page.waitForTimeout(150); }
    await page.waitForSelector('#dspnopin'); assert.match(await page.textContent('#dspnopin'), /The rounds picked don’t have any approaches with a pin location \(⛳ on the hole\) yet\. Pick other rounds, or tap Rounds to see them by distance\./);
    assert.deepStrictEqual(await page.$$eval('.dsprd.sel', e => e.map(x => x.getAttribute('data-v'))), [noPin]); assert.ok(await page.$('#dsppick'), 'the picker stays so you can pick again');
    ok('only rounds without pin locations picked: a plain note, the picker still there');
    await page.click('.dsprd[data-v="' + ROUNDS[0].id + '"]'); await page.waitForSelector('#dspcvwrap'); ok('pick a round with pins: the picture is back');
    assert.deepStrictEqual(errors, []); console.log('PASS disp-nopin-focused');
  } finally { await browser.close(); srv.kill(); }
})().catch(e => { console.error(e); process.exit(1); });
