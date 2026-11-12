const { chromium } = require('playwright'); const { spawn } = require('child_process');
const ARC = require('/home/claude/golf-app/tests/fixtures/arcade-78.js');
(async () => {
  const PORT = 8971, assert = require('assert'), srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: '/home/claude/golf-app', stdio: 'ignore' }); await new Promise(r => setTimeout(r, 1200));
  const now = Date.now(), day = 864e5, N = 22, rounds = [], prac = [];
  const pm = w => 60 + 45 * Math.sin(w / 2.3); // putting practice minutes per week (w = week index, oldest 0)
  let seed = 11; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let w = 0; w < N; w++) {
    const ago = N - 1 - w, eff = (pm(w - 2) - 60) / 45 + (rnd() - .5) * 1.2; // putting quality, practice shows up 2 weeks later
    const r = Object.assign(ARC.round(), { id: 'r' + w, player: 'Scott', date: new Date(now - (ago * 7 + 1) * day).toISOString(), play: w % 3 ? 'practice' : 'tournament' });
    const k = Math.round(Math.abs(eff) * 3);
    r.holes.forEach((h, hi) => { if (hi >= k) return; const rows = h.rows, g = rows.findIndex(x => x.loc === 'holed');
      if (eff > 0 && g > 1 && rows[g - 1].loc === 'green') rows.splice(g - 1, 1); else if (eff < 0 && g > 0 && rows[g - 1].loc === 'green') rows.splice(g, 0, { dist: 3, loc: 'green', dir: '', pen: false }); });
    rounds.push(r);
    const d = new Date(now - (ago * 7 + 2) * day).toISOString().slice(0, 10);
    prac.push({ id: 'pl' + w, date: d, player: 'Scott', spoke: 'lag', focus: '', min: Math.round(pm(w) * .55) }, { id: 'ps' + w, date: d, player: 'Scott', spoke: 'short', focus: '', min: Math.round(pm(w) * .45) },
      { id: 'pc' + w, date: d, player: 'Scott', spoke: 'chip', focus: '', min: 20 + (w % 4) * 10 }, { id: 'pd' + w, date: d, player: 'Scott', spoke: 'drive', focus: '', min: 30 + (w % 3) * 15 });
  }
  const b = await chromium.launch({  });
  const page = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage(); const errs = []; page.on('pageerror', e => errs.push(String(e)));
  await page.goto('http://127.0.0.1:' + PORT + '/?x=' + now);
  await page.evaluate(({ R, P }) => { localStorage.setItem('golfsg.player.v1', 'Scott'); localStorage.setItem('golfsg.nameasked.v1', '1'); localStorage.setItem('golfsg.rounds.v1', JSON.stringify(R)); localStorage.setItem('golfsg.practice.v1', JSON.stringify(P)); localStorage.setItem('golfsg.mybench.v1', JSON.stringify({ Scott: 'd1w' })); }, { R: rounds, P: prac });
  await page.reload(); await page.waitForSelector('#home'); await page.click('#mgcard'); await page.waitForSelector('#mygame');
  const ok = m => console.log('  ✓ ' + m);
  await page.click('#pbgotrends'); await page.waitForSelector('#trendspage'); assert.match(await page.textContent('#trback'), /My Game/);
  const keys = await page.$$eval('#trendspage .trcard2', e => e.map(x => x.dataset.k)); assert.strictEqual(keys[0], 'total', 'total practice vs score first'); assert.strictEqual(keys.length, 7, 'total + six areas ' + keys);
  assert.deepStrictEqual(keys.slice(1).sort(), ['bunker', 'chip', 'drive', 'irons', 'putt', 'wedges'].sort());
  const lag = await page.$('#trendspage .trcard2[data-k="putt"]:not(.trnone)'); assert.ok(lag, 'putting has a trend'); assert.ok(await lag.$('.trband, path'), 'forecast band drawn');
  assert.ok(await page.$('#trendspage .trcard2.trnone[data-k="bunker"]'), 'no bunker practice: not ready'); ok('Trends: total first, six areas, putting drawn, bunker not ready');
  await page.click('#trzoom [data-v="8"]'); await page.waitForTimeout(100); assert.ok(await page.$('#trzoom .sel')); ok('zoom');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= 390), 'no sideways scroll');
  await page.click('#trback'); await page.waitForSelector('#mygame'); await page.click('#pbgopractice'); await page.click('#pbgotrends'); await page.waitForSelector('#trendspage'); assert.match(await page.textContent('#trback'), /Practice/);
  await page.click('#trback'); await page.waitForSelector('#practicepage'); ok('‹ back goes where you came from');
  assert.deepStrictEqual(errs, []); await b.close(); srv.kill(); console.log('PASS trends-focused');
})().catch(e => { console.error(e); process.exit(1); });
