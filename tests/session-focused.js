// v205: your typical week (a starting baseline), "how much time do you have?" → today's session logged in one tap, and this week's bars against each area's target
const { chromium } = require('playwright-core'); const { spawn } = require('child_process');
const ARC = require('/home/claude/golf-app/tests/fixtures/arcade-78.js');
(async () => {
  const PORT = 8986, OUT = process.argv[2], srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: '/home/claude/golf-app', stdio: 'ignore' }); await new Promise(r => setTimeout(r, 1200));
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
  await page.evaluate(() => { localStorage.removeItem('golfsg.typical.v1'); const P = JSON.parse(localStorage.getItem('golfsg.practice.v1')).filter(e => Date.now() - Date.parse(e.date) < 5 * 864e5); localStorage.setItem('golfsg.practice.v1', JSON.stringify(P)); });
  await page.reload(); await page.waitForSelector('#home'); await page.click('#tbpractice'); await page.waitForSelector('#typcard');
  // your typical week: 3.5 h, 4 rounds → the plan says it's blending
  await page.click('[data-act="typh"][data-k="1"]'); assert.match(await page.textContent('#typcard'), /3\.5 h practice/); await page.click('#typsave'); await page.waitForTimeout(150);
  assert.strictEqual(await page.$('#typcard'), null); assert.match(await page.textContent('#plancard .planhead small'), /^(About|Your estimate:) .+ a week ›$/);
  const T = await page.evaluate(() => JSON.parse(localStorage.getItem('golfsg.typical.v1'))); assert.deepStrictEqual([T.scott.weekMin, T.scott.roundsMonth], [210, 4]); ok('typical week saved, the plan blends it with what you log');
  await page.click('.typedit'); await page.waitForSelector('#typcard'); await page.click('[data-act="typcancel"]'); ok('edit it again from the plan header');
  // a session: 45 min → up to 3 items adding up to 45, top of the list first
  const top = await page.$eval('.planitem', x => x.dataset.k); const before = await page.evaluate(() => JSON.parse(localStorage.getItem('golfsg.practice.v1')).length);
  await page.click('#prsess'); await page.waitForSelector('#sesssheet'); assert.match(await page.textContent('#sesssheet .prhead b'), /How much time do you have/); assert.strictEqual(await page.$('#tabbar'), null, 'tab bar hidden');
  await page.click('[data-act="sesst"][data-v="45"]'); await page.waitForSelector('.sesslist');
  const S = await page.$$eval('.sesslist .planitem', e => e.map(x => [x.dataset.k, +x.querySelector('.plmin').textContent.replace(/\D/g, '')]));
  assert.ok(S.length >= 1 && S.length <= 3); assert.strictEqual(S.reduce((t, x) => t + x[1], 0), 45); assert.strictEqual(S[0][0], top, 'starts at the top'); S.forEach(x => assert.ok(x[1] >= 10));
  await page.click('[data-act="sessfeel"][data-v="0|great"]'); await page.click('#sesslog'); await page.waitForSelector('#weekcard');
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem('golfsg.practice.v1'))); assert.strictEqual(after.length, before + S.length); assert.strictEqual(after[before].feel, 'great'); assert.strictEqual(after[before].spoke, S[0][0]);
  ok('45 min → ' + S.map(x => x[0] + ' ' + x[1]).join(' · ') + ', logged in one tap with how it went');
  // custom minutes; under 10 isn't allowed
  await page.click('#prsess'); await page.fill('#sessmin', '5'); await page.click('#sessgo'); assert.ok(await page.$('#sesssheet .sesst'), 'still asking'); await page.fill('#sessmin', '25'); await page.click('#sessgo'); await page.waitForSelector('.sesslist');
  assert.match(await page.textContent('#sesssheet .prhead b'), /25 min/); await page.click('[data-act="sesscancel"]'); ok('type your own minutes (10+)');
  // this week's bars
  const W = await page.$$eval('#weekcard .wkrow', e => e.map(x => x.dataset.k)); assert.strictEqual(W.length, 7); assert.match(await page.textContent('#wktot'), / of /);
  assert.ok(await page.$('#weekcard .wkrow[data-k="' + S[0][0] + '"] .wkfill'), 'bar'); assert.strictEqual(await page.$$eval('#weekcard .wkdots i', e => e.length), 6);
  // v206: swipe – the days of the week stacked by group, then 3 months by week
  assert.strictEqual(await page.$$eval('#wkpages .wkpage', e => e.length), 3); assert.strictEqual(await page.$$eval('#weekcard .wkpdots i', e => e.length), 3);
  assert.ok((await page.$$eval('#wkpages .wkpage[data-p="1"] rect[class^="pg"]', e => e.length)) >= 1, 'today stacked by group'); assert.ok(await page.$('#wkpages .wkpage[data-p="2"] path.band'), '3-month bands');
  assert.deepStrictEqual(await page.$$eval('#wkpages .wkpage[data-p="1"] .pglegend span', e => e.map(x => x.textContent)), ['Putting', 'Short game', 'Wedges', 'Full swing']);
  const ov = await page.evaluate(() => { const c = document.getElementById('weekcard').getBoundingClientRect(); return [...document.querySelectorAll('#weekcard .wkval, #weekcard .planhead > *')].filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.right > c.right + 1 || r.left < c.left - 1); }).length; });
  await page.evaluate(() => { const c = document.getElementById('wkpages'); c.scrollLeft = 2 * c.clientWidth; }); await page.waitForTimeout(300);
  assert.strictEqual(await page.$$eval('#weekcard .wkpdots i', e => e.findIndex(x => x.classList.contains('on'))), 2, 'dots follow the swipe');
  await page.evaluate(() => { document.getElementById('wkpages').scrollLeft = 0; }); await page.waitForTimeout(200);
  assert.strictEqual(ov, 0, 'nothing falls off the card'); ok('swipe: days of the week, 3 months; dots follow; nothing falls off');
  await page.click('[data-act="wkoff"][data-k="1"]'); assert.match(await page.textContent('#weekcard .wknav b'), /Last week/); ok('this week: a bar per area against its target, ‹ › through past weeks, 6 dots');
  assert.deepStrictEqual(errs, []); await b.close(); srv.kill ? srv.kill() : srv.close(); console.log('PASS session-focused'); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
