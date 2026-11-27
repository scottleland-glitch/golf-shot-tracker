// v266 (Scott: "my 4 hybrid is a 196 club, so a par 5 second shot from 250 should not be included"): Bias and the finish picture only count
// shots that could reach the pin – within the club's bag carry + 15 yd (from 30 yd in / the green always; no carry = the regulation approach).
// Run: node tests/club-reach-focused.js
const { chromium } = require('playwright-core'); const assert = require('assert'); const { spawn } = require('child_process');
const PORT = 8891;
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: __dirname + '/..', stdio: 'ignore' }); await new Promise(r => setTimeout(r, 1200));
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] }); const errors = [];
  try {
    const page = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' })).newPage();
    page.setDefaultTimeout(20000); page.on('pageerror', e => errors.push(String(e)));
    await page.goto('http://127.0.0.1:' + PORT + '/?x=' + Date.now());
    await page.evaluate(() => {
      const R = (d, l, dir, club) => Object.assign({ dist: d, loc: l, dir: dir || '', pen: false }, club ? { club } : {});
      // odd holes: par 5, 4H from 250 (out of reach) finishes 55 yd short in the fairway; even holes: par 4, 4H from 200 (reachable) finishes 8 yd short
      const holes = Array.from({ length: 18 }, (_, i) => i % 2
        ? { par: 5, finished: true, rows: [R(520, 'tee', '', 'Driver'), R(250, 'fairway', '', '4H'), R(55, 'fairway', 'short', '56'), R(6, 'green', 'long'), R(1, 'holed')] }
        : { par: 4, finished: true, rows: [R(420, 'tee', '', 'Driver'), R(200, 'fairway', '', '4H'), R(8, 'rough', 'short', '56'), R(5, 'green', 'long'), R(1, 'holed')] });
      localStorage.clear(); localStorage.setItem('golfsg.player.v1', 'Scott');
      localStorage.setItem('golfsg.bag.v1', JSON.stringify({ clubs: [{ code: 'Driver', cat: 'd', carry: 250 }, { code: '4H', cat: 'hy', carry: 196 }, { code: '56', cat: 'we', carry: 90 }] }));
      localStorage.setItem('golfsg.rounds.v1', JSON.stringify([{ v: 3, dv: 2, id: 'rc', date: '2026-10-10T17:00:00.000Z', course: 'Reach', baseline: 'pga', player: 'Scott', holes }]));
    });
    await page.reload(); if (await page.$('#tbplus')) await page.click('#navbtn'); await page.click('[data-act="history"]'); await page.click('#histlist [data-act="open"][data-id="rc"]');
    if (!(await page.$('[data-stx="club"].open')) && await page.$('[data-act="stx"][data-v="club"]')) await page.click('[data-act="stx"][data-v="club"]');
    await page.click('[data-act="map"][data-v="club"]'); await page.waitForSelector('#clubbtns');
    await page.click('#clubbtns [data-v="4H"]');
    assert.match(await page.textContent('#clubbias'), /4H finishes 8 yd short on average/, 'only the 200-yd shots count');
    assert.match(await page.textContent('#clubrank tr[data-v="4H"]'), /⚠ 8 yd short/);
    assert.match(await page.textContent('#tip-clubdisp'), /9 shot\(s\) from beyond 4H’s reach/);
    assert.deepStrictEqual(errors, []); console.log('CLUB REACH OK');
  } finally { await b.close(); srv.kill(); }
})().catch((e) => { console.error(e); process.exit(1); });
