// v202: the read of a putt – the 3×3 pad on a putt's shot card (first putt / over 3 ft), one tap, toggle off, saved, carried onto the analysed putt
const { chromium } = require('playwright-core'); const { spawn } = require('child_process');
const ARC = require('/home/claude/golf-app/tests/fixtures/arcade-78.js');
(async () => {
  const PORT = 8981, OUT = process.argv[2], srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: '/home/claude/golf-app', stdio: 'ignore' }); await new Promise(r => setTimeout(r, 1200));
  const now = Date.now(), day = 864e5, N = +(process.env.N || 22), rounds = [], prac = [];
  const pm = w => 60 + 45 * Math.sin(w / 2.3); // putting practice minutes per week (w = week index, oldest 0)
  let seed = 11; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let w = 0; w < N; w++) {
    const ago = N - 1 - w, eff = (pm(w - 2) - 60) / 45 + (rnd() - .5) * 1.2; // putting quality, practice shows up 2 weeks later
    const r = Object.assign(ARC.round(), { id: 'r' + w, course: ['Paradise Valley', 'Arcade Creek', 'Lakeridge'][w % 3], player: 'Scott', date: new Date(now - (ago * 7 + 1) * day).toISOString(), play: w % 3 ? 'practice' : 'tournament' });
    const k = Math.round(Math.abs(eff) * 3);
    r.holes.forEach((h, hi) => { if (hi >= k) return; const rows = h.rows, g = rows.findIndex(x => x.loc === 'holed');
      if (eff > 0 && g > 1 && rows[g - 1].loc === 'green') rows.splice(g - 1, 1); else if (eff < 0 && g > 0 && rows[g - 1].loc === 'green') rows.splice(g, 0, { dist: 3, loc: 'green', dir: '', pen: false }); });
    rounds.push(r);
    const d = new Date(now - (ago * 7 + 2) * day).toISOString().slice(0, 10);
    prac.push({ id: 'pl' + w, date: d, player: 'Scott', spoke: 'lag', focus: '', min: Math.round(pm(w) * .55), feel: ['great','ok','off'][w % 3], type: w % 2 ? 'game' : 'reps' }, { id: 'ps' + w, date: d, player: 'Scott', spoke: 'short', focus: '', min: Math.round(pm(w) * .45) },
      { id: 'pc' + w, date: d, player: 'Scott', spoke: 'chip', focus: '', min: 20 + (w % 4) * 10 }, { id: 'pd' + w, date: d, player: 'Scott', spoke: 'drive', focus: '', min: 30 + (w % 3) * 15 });
  }
  if (N > 8) ['drive', 'irons', 'wedges'].forEach((sp, j) => prac.push({ id: 'les' + j, date: new Date(now - 17 * day).toISOString().slice(0, 10), player: 'Scott', spoke: sp, focus: 'Lesson · Grip', min: 20, kind: 'lesson', change: 'big', what: 'Grip', coach: 'Jo', lesson: 'L1' }));
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const page = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage(); const errs = []; page.on('pageerror', e => errs.push(String(e)));
  await page.goto('http://127.0.0.1:' + PORT + '/?x=' + now);
  await page.evaluate(({ R, P }) => { localStorage.setItem('golfsg.player.v1', 'Scott'); localStorage.setItem('golfsg.nameasked.v1', '1'); localStorage.setItem('golfsg.rounds.v1', JSON.stringify(R)); localStorage.setItem('golfsg.practice.v1', JSON.stringify(P)); localStorage.setItem('golfsg.mybench.v1', JSON.stringify({ Scott: 'd1w' })); }, { R: rounds, P: prac });
  const assert = require('assert'), ok = m => console.log('  ✓ ' + m);
  // hole 9 of the newest round: 16 ft then a 2 ft tap-in
  await page.evaluate(() => { const R = JSON.parse(localStorage.getItem('golfsg.rounds.v1')), r = R[R.length - 1]; r.holes[8].finished = false; localStorage.setItem('golfsg.rounds.v1', JSON.stringify(R)); localStorage.setItem('golfsg.current.v1', r.id); });
  await page.reload(); await page.click('#resumepill'); await page.waitForTimeout(400); await page.click('text=Edit this hole').catch(() => {}); await page.waitForTimeout(300);
  assert.strictEqual(await page.$$eval('.readpad', e => e.length), 0, 'no pad on the 2 ft tap-in');
  await page.click('text=16 ft'); await page.waitForSelector('.readpad'); assert.match(await page.textContent('.readpad .rphead b'), /tap the read \(optional\)/);
  assert.strictEqual(await page.$$eval('.readpad .rpc', e => e.length), 9, '3×3');
  await page.click('.readpad .rpc[data-v="down-r"]'); await page.waitForTimeout(150);
  assert.strictEqual(await page.textContent('.readpad .rphead b'), 'Downhill, breaks right'); assert.ok(await page.$('.readpad .rpc.on[data-v="down-r"]'));
  const rows = () => page.evaluate(() => { const r = JSON.parse(localStorage.getItem('golfsg.rounds.v1')).slice(-1)[0]; return r.holes[8].rows.map(x => x.rd || ''); });
  assert.deepStrictEqual(await rows(), ['', '', '', 'down-r', '']); ok('one tap saves the read on the putt');
  await page.click('.readpad .rpc[data-v="flat-s"]'); assert.deepStrictEqual(await rows(), ['', '', '', 'flat-s', '']);
  await page.click('.readpad .rpc[data-v="flat-s"]'); assert.deepStrictEqual(await rows(), ['', '', '', '', '']); assert.match(await page.textContent('.readpad .rphead b'), /optional/); ok('change it, tap again to clear (not entered ≠ flat)');
  await page.click('.readpad .rpc[data-v="up-l"]');
  const shot = await page.evaluate(() => { const r = JSON.parse(localStorage.getItem('golfsg.rounds.v1')).slice(-1)[0]; return SG.analyzeHole(r.holes[8]).shots.filter(s => s.cat === 'putting').map(s => s.rd); });
  assert.deepStrictEqual(shot, ['up-l', ''], 'the read is on the analysed putt'); ok('carried onto the analysed putt');
  // a second putt over 3 ft gets the pad too
  await page.evaluate(() => { const R = JSON.parse(localStorage.getItem('golfsg.rounds.v1')), r = R[R.length - 1]; r.holes[8].rows[4].dist = 6; r.holes[8].rows[4].loc = 'green'; r.holes[8].rows.push({ loc: 'holed', dist: 1, dir: '', pen: false }); r.holes[8].finished = false; localStorage.setItem('golfsg.rounds.v1', JSON.stringify(R)); });
  await page.reload(); await page.click('#resumepill'); await page.waitForTimeout(400); await page.click('text=Edit this hole').catch(() => {}); await page.waitForTimeout(300);
  await page.click('text=6 ft').catch(() => {}); await page.waitForTimeout(300); assert.ok(await page.$('.readpad'), 'a 6 ft second putt has the pad'); ok('second putt over 3 ft: pad shown');
  assert.deepStrictEqual(errs, []); await b.close(); srv.kill ? srv.kill() : srv.close(); console.log('PASS putread-focused'); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
