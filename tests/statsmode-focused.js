// v209: just stats – the first-launch choice, the Practice plan switch, Trends as a tab, fun facts on Home, no practice anywhere
const { chromium } = require('playwright-core'); const { spawn } = require('child_process');
const ARC = require('/home/claude/golf-app/tests/fixtures/arcade-78.js');
(async () => {
  const PORT = 8991, assert = require('assert'), OUT = process.argv[2], srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: '/home/claude/golf-app', stdio: 'ignore' }); await new Promise(r => setTimeout(r, 1200));
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
  // practice on (the default): Practice tab, the + menu, the switch at the bottom of Practice
  await page.reload(); await page.waitForSelector('#hcard');
  assert.ok(await page.$('#tbpractice')); await page.click('#tbpractice'); await page.waitForSelector('#prmode'); assert.match(await page.textContent('#prmode'), /Log practice.*Practice recommendations/);
  // turn it off → Home, Trends instead of Practice, no practice or test nudges, fun facts instead
  // v215: recommendations off, logging on → the log and charts stay; no list, sessions or targets
  await page.click('#prmoderecs'); await page.waitForSelector('#prmode'); await page.waitForTimeout(200);
  assert.strictEqual(await page.evaluate(() => localStorage.getItem('golfsg.mode.v1')), '{"scott":"log"}');
  assert.strictEqual(await page.$('#prsess'), null); assert.strictEqual(await page.$('#plancard'), null); assert.ok(await page.$('#prbig'), 'Log practice stays');
  assert.match(await page.textContent('#wktot'), /logged$/); assert.strictEqual(await page.$('#weekcard .wktgt'), null); assert.strictEqual(await page.$('#wkbal'), null);
  assert.ok(await page.$('#tbpractice'), 'the Practice tab stays'); assert.strictEqual(await page.getAttribute('#prmoderecs', 'aria-checked'), 'false'); ok('recommendations off: log, charts and week card stay; no list, sessions or targets');
  await page.click('#prmodelog'); await page.waitForSelector('#home'); await page.waitForTimeout(300);
  assert.strictEqual(await page.evaluate(() => localStorage.getItem('golfsg.mode.v1')), '{"scott":"stats"}');
  assert.deepStrictEqual(await page.$$eval('#tabbar span', e => e.map(x => x.textContent)), ['My Game', 'Rounds', 'Trends', 'Stats']); ok('off: Trends takes the Practice tab');
  const S = await page.$$eval('.hcslide', e => e.map(x => [x.dataset.k, x.querySelector('.hcbtn').getAttribute('data-act'), x.textContent]));
  assert.ok(!S.some(s => s[0] === 'test' || s[1] === 'prlog' || s[1] === 'sgtopen' || /practi/i.test(s[2])), JSON.stringify(S));
  assert.ok(S.filter(s => ['whatif5', 'three', 'best', 'long', 'streak', 'avg', 'strong', 'addup'].includes(s[0])).length >= 2, 'fun facts: ' + JSON.stringify(S.map(s => s[0])));
  assert.ok(S.length <= 8); ok('Home: ' + S.map(s => s[0]).join(', '));
  await page.click('#tbplus'); await page.waitForSelector('[data-act="new"]'); assert.ok(!(await page.$('[data-act="prlog"]'))); ok('+ goes straight to a new round');
  await page.evaluate(() => document.querySelector('.sheet-back').click()); await page.waitForTimeout(200);
  await page.waitForTimeout(300); await page.click('#tbtrends'); await page.waitForSelector('#trendspage', { timeout: 8000 }).catch(async e => { console.log('ERRS', errs, await page.evaluate(() => document.body.className + ' ' + (document.querySelector('.hsheet') ? 'sheet' : '') + ' ' + !!document.getElementById('tbtrends') + ' ' + (document.activeElement && document.activeElement.id))); await page.screenshot({ path: '/tmp/claude-0/-home-claude/b6d800b2-3e44-56cb-807c-acf9ed20076d/scratchpad/dbg.png' }); throw e; }); assert.ok(await page.$('#tabbar')); assert.strictEqual(await page.$$eval('.trpl.pr', e => e.length), 0, 'no practice panel');
  assert.ok(!/practice/i.test(await page.textContent('#trlede'))); assert.ok(!/Practice vs score/.test(await page.textContent('#trendspage'))); assert.match(await page.textContent('#trback'), /Home/);
  assert.ok(await page.$('.trcard2[data-k="total"] .trband'), 'a forecast from rounds alone'); ok('Trends: from rounds alone, no practice panel');
  await page.click('#tbmygame'); await page.waitForSelector('#mgtilewrap'); assert.ok(!(await page.$('#prcard')), 'no My Practice card'); ok('My Game: no practice card');
  // Settings: turn it back on
  await page.click('#tbstats').catch(() => {}); await page.evaluate(() => { const b = document.querySelector('[data-act="home"]'); if (b) b.click(); }); await page.waitForSelector('#home');
  await page.click('#navbtn'); await page.click('[data-act="archive"]'); await page.waitForSelector('#setmoderow'); await page.click('#setmoderowlog'); await page.waitForTimeout(200);
  assert.strictEqual(await page.evaluate(() => localStorage.getItem('golfsg.mode.v1')), '{"scott":"full"}'); ok('Settings: back on');
  // first launch: the choice is in the "Who's playing?" sheet; Stats + practice is picked unless you change it
  await page.evaluate(() => { localStorage.clear(); }); await page.reload(); await page.waitForSelector('#modepick');
  assert.strictEqual(await page.getAttribute('#firstlog', 'aria-checked'), 'true'); assert.strictEqual(await page.getAttribute('#firstrecs', 'aria-checked'), 'true');
  await page.fill('#pname', 'Amber'); await page.click('#firstlog'); assert.ok(await page.$eval('#firstrecs', x => x.disabled), 'recommendations need logging'); assert.strictEqual(await page.inputValue('#pname'), 'Amber', 'the name survives the choice');
  if (OUT) await page.screenshot({ path: OUT + '/stats-first-launch.png' });
  await page.click('[data-act="setname"]'); await page.waitForTimeout(300);
  assert.strictEqual(await page.evaluate(() => localStorage.getItem('golfsg.mode.v1')), '{"amber":"stats"}'); assert.ok(await page.$('#tbtrends')); ok('first launch: Track my stats');
  assert.deepStrictEqual(errs, []); await b.close(); srv.kill(); console.log('stats-mode OK'); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
