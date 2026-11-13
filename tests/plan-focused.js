// v203: the practice plan on the Practice page – the ranked list, Log from an item, it drops after, coach homework, the next tournament
const { chromium } = require('playwright-core'); const { spawn } = require('child_process');
const ARC = require('/home/claude/golf-app/tests/fixtures/arcade-78.js');
(async () => {
  const PORT = 8983, OUT = process.argv[2], srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: '/home/claude/golf-app', stdio: 'ignore' }); await new Promise(r => setTimeout(r, 1200));
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
  await page.reload(); await page.waitForSelector('#home'); await page.click('#tbpractice'); await page.waitForSelector('#plancard');
  assert.deepStrictEqual(await page.$$eval('#prqrow .qbtn span', e => e.map(x => x.textContent)), ['Report', 'Trend'], 'the plan is on the page – no Plan button');
  const items = () => page.$$eval('.planitem', e => e.map(x => ({ k: x.dataset.k, coach: x.classList.contains('coach'), text: x.innerText.replace(/\s+/g, ' ') })));
  let L = await items(); assert.ok(L.length >= 2, JSON.stringify(L)); assert.ok(L[0].coach, 'coach homework first (the grip lesson)'); assert.match(L[0].text, /Coach: Grip \(Jo\)/);
  assert.strictEqual(L.filter(x => x.coach).length, 1, 'one item for the lesson'); L.forEach(x => assert.match(x.text, /\d+ min Log$/)); ok('ranked list, coach homework first, minutes and Log on each');
  assert.match(await page.textContent('#plancard .planhead small'), /^Your usual: .+ a week$/); ok('budget from the last 30 days');
  // Log the first non-coach item → the sheet opens on that area with the minutes in; save → it drops
  const it = L.find(x => !x.coach); await page.click('.planitem[data-k="' + it.k + '"] .plbtn'); await page.waitForSelector('#prsheet');
  const tot = await page.textContent('#prtotal'); assert.ok(!/^0|Nothing/.test(tot), 'minutes filled in: ' + tot); await page.click('#prsave'); await page.waitForSelector('#plancard');
  L = await items(); assert.ok(!L.some(x => x.k === it.k && !x.coach) || L.findIndex(x => x.k === it.k) > 0, 'it dropped down'); assert.match(await page.textContent('#pldone'), new RegExp(it.k === 'chip' ? 'Chipping today' : 'today')); ok('Log from the item; after saving it drops, ✓ today');
  // the next tournament: Big in 4 days → sharpening message; Regular → practice as normal; remove
  await page.click('#tourrow'); await page.waitForSelector('#tourform'); assert.ok(await page.$eval('#toursave', x => x.disabled), 'needs a date');
  const d = await page.evaluate(() => { const t = new Date(Date.now() + 4 * 864e5); return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0'); });
  await page.fill('#tourdate', d); await page.dispatchEvent('#tourdate', 'change'); await page.click('#toursave'); await page.waitForSelector('#planmsg');
  assert.match(await page.textContent('#tourrow'), /Big tournament · .+ · in 4 days/); assert.match(await page.textContent('#planmsg'), /sharpening/); assert.ok(!(await items()).some(x => x.coach), 'no big-change homework in a big week');
  await page.click('#tourrow'); await page.click('[data-act="tourbig"][data-v="reg"]'); await page.click('#toursave'); await page.waitForSelector('#planmsg');
  assert.match(await page.textContent('#planmsg'), /practice as normal/); await page.reload(); await page.click('#tbpractice'); await page.waitForSelector('#tourrow'); assert.match(await page.textContent('#tourrow'), /^🏆 Tournament/, 'kept');
  await page.click('#tourrow'); await page.click('[data-act="tourdel"]'); await page.waitForTimeout(150); assert.match(await page.textContent('#tourrow'), /Add your next tournament/); ok('tournament: Big sharpens, Regular as normal, kept, removed');
  assert.deepStrictEqual(errs, []); await b.close(); srv.kill ? srv.kill() : srv.close(); console.log('PASS plan-focused'); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
