// v200: Home's rotating "next thing" card – which messages show, rotation, pause on touch, buttons, Resume pins, reduced motion
const { chromium } = require('playwright-core'); const { spawn } = require('child_process');
const ARC = require('/home/claude/golf-app/tests/fixtures/arcade-78.js');
(async () => {
  const PORT = 8979, assert = require('assert'), OUT = process.argv[2], srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: '/home/claude/golf-app', stdio: 'ignore' }); await new Promise(r => setTimeout(r, 1200));
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
  const ok = m => console.log('  ✓ ' + m);
  await page.reload(); await page.waitForSelector('#hcard');
  const ks = (await page.$$eval('.hcslide', e => e.map(x => x.dataset.k))).filter(k => k !== 'watch'); assert.deepStrictEqual(ks, ['round', 'game', 'trends', 'test'], 'last round, My Game, Trends, test (never taken)');
  // v201: plain words for the forecast
  assert.match(await page.textContent('.hcslide[data-k="trends"] .hctitle'), /^(Holding steady around \d+|Improving – about \d+ by \w{3} \d+, from \d+ now|Slipping a little – about \d+ by \w{3} \d+, from \d+ now)$/);
  const w = await page.$('.hcslide[data-k="watch"] .hctitle'); if (w) assert.match(await w.textContent(), /^Keep an eye on [a-z0-9+ ]+$/);
  assert.strictEqual(await page.$$eval('.hcslide.on', e => e.length), 1); assert.strictEqual(await page.$$eval('.hcdots i', e => e.length), await page.$$eval('.hcslide', e => e.length)); ok('one showing, a dot each');
  const on = () => page.$eval('.hcslide.on', x => x.dataset.k);
  await page.waitForTimeout(7400); assert.strictEqual(await on(), 'game', 'moves on after ~7 s'); ok('rotates');
  await page.dispatchEvent('#hcard', 'pointerdown'); await page.waitForTimeout(7600); assert.strictEqual(await on(), 'game', 'touching it pauses'); ok('pauses when touched');
  await page.click('.hcslide.on .hcbtn'); await page.waitForSelector('#prsheet'); ok('Log practice opens the log');
  await page.click('[data-act="prcancel"]'); if (!(await page.$('#hcard'))) { await page.click('[data-act="home"]').catch(() => {}); await page.waitForSelector('#hcard'); }
  assert.strictEqual(await on(), 'game', 'comes back on the same message');
  await page.click('.hcslide.on .hctitle'); await page.waitForSelector('#mygame'); ok('tapping the My Game message opens My Game');
  // a round in progress pins Resume – no card
  await page.evaluate(() => localStorage.setItem('golfsg.current.v1', JSON.parse(localStorage.getItem('golfsg.rounds.v1'))[0].id)); await page.reload(); await page.waitForSelector('#resumepill');
  assert.strictEqual(await page.$('#hcard'), null); ok('round in progress: Resume instead of the card');
  // reduced motion: no auto-advance
  await page.evaluate(() => localStorage.removeItem('golfsg.current.v1')); await page.emulateMedia({ reducedMotion: 'reduce' }); await page.reload(); await page.waitForSelector('#hcard');
  const k0 = await on(); await page.waitForTimeout(7600); assert.strictEqual(await on(), k0, 'reduced motion: stays put'); ok('reduced motion: no auto-advance');
  assert.deepStrictEqual(errs, []); await b.close(); srv.kill ? srv.kill() : srv.close(); console.log('PASS homecard-focused'); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
