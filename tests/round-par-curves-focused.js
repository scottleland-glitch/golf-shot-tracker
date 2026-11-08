// v147 Round stats: par 3/4/5 scoring curves – the player's other finished rounds in colour, this round dashed. Run: node tests/round-par-curves-focused.js
const { chromium } = require('playwright-core'); const assert = require('assert'); const { spawn } = require('child_process');
const ARC = require('./fixtures/arcade-78.js');
const OUT = '/workspace/golf-app/screenshots/', PORT = 8871, BASE = 'http://127.0.0.1:' + PORT + '/';
const hist = Array.from({ length: 5 }, (_, i) => { const r = Object.assign(ARC.round(), { id: 'h' + i, date: '2026-10-1' + i + 'T17:00:00.000Z', player: 'Scott' });
  // vary history: add a stroke to some holes
  [i, i + 6, i + 11].forEach(k => { const rows = r.holes[k].rows; rows.splice(rows.length - 1, 0, { dist: 4, loc: 'green', dir: '', pen: false }); }); return r; });
const today = Object.assign(ARC.round(), { id: 'today', date: '2026-11-07T17:00:00.000Z', player: 'Scott' });
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: __dirname + '/../', stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1200)); const errors = [];
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  try {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
    const page = await ctx.newPage(); page.on('pageerror', e => errors.push(String(e)));
    const open = async (rounds, id) => { await page.goto(BASE + '?x=' + Date.now());
      await page.evaluate(rs => { localStorage.clear(); localStorage.setItem('golfsg.player.v1', 'Scott'); localStorage.setItem('golfsg.nameasked.v1', '1'); localStorage.setItem('golfsg.rounds.v1', JSON.stringify(rs)); }, rounds);
      await page.reload(); await page.waitForSelector('#home'); if (await page.$('#plusbtn')) await page.click('#plusbtn');
      await page.click('[data-act="history"]'); await page.click('#histlist [data-act="open"][data-id="' + id + '"]'); await page.waitForSelector('#rpcurves'); };
    await open(hist.concat([today]), 'today');
    assert.match(await page.textContent('#rpclegend'), /Your average · 5 other rounds/);
    for (const p of [3, 4, 5]) { assert.ok(await page.$('#rpcurves #par' + p + 'line')); assert.ok(await page.$('#rpcurves #par' + p + 'this')); }
    console.log('val4:', await page.textContent('#rpcurves #par4val'), '| n:', await page.textContent('#rpcurves #par4n'));
    assert.match(await page.getAttribute('#rpcurves #par4this', 'style'), /dasharray/);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth) <= 390);
    await page.locator('#rpcurves').screenshot({ path: OUT + 'round-par-curves.png' });
    await open([today], 'today');
    assert.match(await page.textContent('#rpclegend'), /Finish more rounds/); assert.strictEqual(await page.$('#rpcurves #par4this'), null); assert.ok(await page.$('#rpcurves #par4line'));
    assert.deepStrictEqual(errors, []); console.log('PASS round-par-curves-focused');
  } finally { await b.close(); srv.kill(); }
})().catch(e => { console.error(e); process.exit(1); });
