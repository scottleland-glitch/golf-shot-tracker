// v212 coach sharing, end to end: a coach phone and an athlete phone against the stand-in Firebase (tests/fakefirebase.js).
// Coach sets up a team → athlete enters the code once → rounds and practice go up by themselves → the coach taps a name and reviews
// (read-only), switches athletes on the same screen → athlete stops sharing → gone from the coach's list.
const { chromium } = require('playwright-core'); const { spawn } = require('child_process'); const assert = require('assert');
const ARC = require('/home/claude/golf-app/tests/fixtures/arcade-78.js'), FF = require('/home/claude/golf-app/tests/fakefirebase.js'), SYNC = require('/home/claude/golf-app/sync.js');
(async () => {
  const PORT = 8987, FB = 8988, OUT = process.argv[2], srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: '/home/claude/golf-app', stdio: 'ignore' });
  const fb = await FF.start(FB), base = 'http://127.0.0.1:' + FB, cfg = { apiKey: 'test', db: base + '/db', authBase: base + '/auth', tokenBase: base + '/token' };
  await new Promise(r => setTimeout(r, 1200)); const ok = m => console.log('  ✓ ' + m);
  const now = Date.now(), day = 864e5, N = +(process.env.N || 22), rounds = [], prac = [];
  const pm = w => 60 + 45 * Math.sin(w / 2.3); // putting practice minutes per week (w = week index, oldest 0)
  let seed = 11; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  for (let w = 0; w < N; w++) {
    const ago = N - 1 - w, eff = (pm(w - 2) - 60) / 45 + (rnd() - .5) * 1.2; // putting quality, practice shows up 2 weeks later
    const r = Object.assign(ARC.round(), { id: 'r' + w, course: ['Paradise Valley', 'Arcade Creek', 'Lakeridge'][w % 3], player: 'Quincy', date: new Date(now - (ago * 7 + 1) * day).toISOString(), play: w % 3 ? 'practice' : 'tournament' });
    const k = Math.round(Math.abs(eff) * 3);
    r.holes.forEach((h, hi) => { if (hi >= k) return; const rows = h.rows, g = rows.findIndex(x => x.loc === 'holed');
      if (eff > 0 && g > 1 && rows[g - 1].loc === 'green') rows.splice(g - 1, 1); else if (eff < 0 && g > 0 && rows[g - 1].loc === 'green') rows.splice(g, 0, { dist: 3, loc: 'green', dir: '', pen: false }); });
    rounds.push(r);
    const d = new Date(now - (ago * 7 + 2) * day).toISOString().slice(0, 10);
    prac.push({ id: 'pl' + w, date: d, player: 'Quincy', spoke: 'lag', focus: '', min: Math.round(pm(w) * .55), feel: ['great','ok','off'][w % 3], type: w % 2 ? 'game' : 'reps' }, { id: 'ps' + w, date: d, player: 'Quincy', spoke: 'short', focus: '', min: Math.round(pm(w) * .45) },
      { id: 'pc' + w, date: d, player: 'Quincy', spoke: 'chip', focus: '', min: 20 + (w % 4) * 10 }, { id: 'pd' + w, date: d, player: 'Quincy', spoke: 'drive', focus: '', min: 30 + (w % 3) * 15 });
  }
  if (N > 8) ['drive', 'irons', 'wedges'].forEach((sp, j) => prac.push({ id: 'les' + j, date: new Date(now - 17 * day).toISOString().slice(0, 10), player: 'Quincy', spoke: sp, focus: 'Lesson · Grip', min: 20, kind: 'lesson', change: 'big', what: 'Grip', coach: 'Jo', lesson: 'L1' }));

  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] }), errs = [];
  const fs = require('fs'), conf = fs.readFileSync('/home/claude/golf-app/config.js', 'utf8').replace(/firebaseKey: '[^']*'/, "firebaseKey: 'test', authBase: '" + cfg.authBase + "', tokenBase: '" + cfg.tokenBase + "'").replace(/liveDb: '[^']*'/, "liveDb: '" + cfg.db + "'");
  async function phone(name, data) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.route('**/config.js*', r => r.fulfill({ contentType: 'application/javascript', body: conf }));
    const p = await ctx.newPage(); p.on('pageerror', e => errs.push(name + ': ' + e)); await p.goto('http://127.0.0.1:' + PORT + '/?x=' + now);
    await p.evaluate(({ name, data }) => { localStorage.setItem('golfsg.player.v1', name); localStorage.setItem('golfsg.nameasked.v1', '1'); if (data) { localStorage.setItem('golfsg.rounds.v1', JSON.stringify(data.R)); localStorage.setItem('golfsg.practice.v1', JSON.stringify(data.P)); localStorage.setItem('golfsg.mybench.v1', JSON.stringify({ [name]: 'd1w' })); } }, { name, data });
    await p.reload(); await p.waitForSelector('#home'); return p;
  }
  const settings = async (p) => { if (await p.$('#cmhome')) { await p.click('#cmhome'); await p.waitForSelector('#home'); } await p.click('#navbtn'); await p.click('[data-act="archive"]'); await p.waitForSelector('#coachcard'); };
  // 1. the coach sets up a team
  const coach = await phone('Mike'); await settings(coach);
  await coach.click('#coopen'); await coach.waitForSelector('#cosheet'); await coach.fill('#coname', 'Coach Mike'); await coach.fill('#coteam', 'Reno Golf Academy');
  await coach.fill('#coemail', 'mike@example.com'); await coach.fill('#copass', 'secret12'); await coach.click('#cogo');
  await coach.waitForSelector('#cmpage'); await coach.waitForSelector('#cmempty'); const code = (await coach.textContent('#cmcode')).trim();
  assert.match(code, /^[A-Z0-9]{3}-[A-Z0-9]{3}$/); ok('coach: team made, code ' + code + ', empty list says how to invite');
  if (OUT) await coach.screenshot({ path: OUT + '/coach-empty.png' });
  // 2. the athlete connects once
  const ath = await phone('Quincy', { R: rounds, P: prac }); await settings(ath);
  await ath.click('#csopen'); await ath.fill('#cscode', code.toLowerCase().replace('-', ' ')); await ath.click('#csfind');
  await ath.waitForSelector('#csteam'); assert.strictEqual(await ath.textContent('#csteam'), 'Coach Mike · Reno Golf Academy');
  assert.ok(await ath.$eval('#csjoin', x => x.disabled), 'an age answer first'); await ath.click('[data-act="csage"][data-v="parent"]');
  if (OUT) await ath.screenshot({ path: OUT + '/athlete-connect.png' });
  await ath.click('#csjoin'); await ath.waitForSelector('#cshared'); assert.match(await ath.textContent('#cshared'), /Sharing with Coach Mike · Reno Golf Academy/);
  const sentAll = () => { const d = (fb.tree().data || {}); const u = Object.keys(d).find(k => d[k].name === 'Quincy'); return u && d[u].rounds ? Object.keys(d[u].rounds).length : 0; };
  for (let i = 0; i < 40 && sentAll() < rounds.length; i++) await ath.waitForTimeout(250);
  assert.strictEqual(sentAll(), rounds.length, 'every round went up by itself'); ok('athlete: code once → ' + rounds.length + ' rounds sent with no button');
  // a second athlete (from another phone, straight through sync.js)
  const em = SYNC.create({ fetch, storage: { getItem: () => null, setItem() {} }, cfg }); await em.join('Emma', await em.lookup('Emma', code), { parentOk: false });
  await em.flush('Emma', { profile: { bench: 'd1w' }, rounds: rounds.slice(-6).map((r, i) => Object.assign({}, r, { id: 'e' + i, player: 'Emma' })), tests: [], practice: [] });
  // 3. the coach just looks
  await coach.click('#copull'); await coach.waitForSelector('.cmcard >> nth=1');
  const cards = await coach.$$eval('.cmcard', e => e.map(x => [x.querySelector('.cmname').textContent, x.querySelector('.cmscore b').textContent, x.querySelector('.cmflags') ? x.querySelector('.cmflags').textContent : '']));
  assert.deepStrictEqual(cards.map(c => c[0]).sort(), ['Emma', 'Quincy']); assert.ok(cards.every(c => /^\d+\.\d$/.test(c[1])), JSON.stringify(cards)); assert.ok(cards.every(c => /New:/.test(c[2])), 'New badges');
  ok('coach: ' + cards.map(c => c[0] + ' ' + c[1]).join(', '));
  if (OUT) await coach.screenshot({ path: OUT + '/coach-athletes.png' });
  await coach.click('.cmcard[data-name="quincy"]'); await coach.waitForSelector('#mygame'); await coach.waitForSelector('#coswitch');
  assert.match(await coach.textContent('#coswitch'), /^Quincy ▾/); assert.strictEqual(await coach.textContent('#coback'), '‹ Athletes');
  assert.deepStrictEqual(await coach.$$eval('#tabbar span', e => e.map(x => x.textContent).filter(Boolean)), ['My Game', 'Rounds', 'Trends', 'Stats']); assert.strictEqual(await coach.$('#tbplus'), null);
  assert.ok(await coach.$('#mygame .radar'), 'her spider chart'); ok('coach: tap Quincy → her My Game, ‹ Athletes · Quincy ▾, no +');
  if (OUT) await coach.screenshot({ path: OUT + '/coach-quincy.png' });
  await coach.click('#tbhistory').catch(() => coach.click('[data-act="history"]')); await coach.waitForSelector('.histpage');
  assert.ok((await coach.$$('.histpage [data-act="open"]')).length >= rounds.length - 1, 'her rounds');
  await coach.click('#tbtrends').catch(() => {}); await coach.waitForSelector('#trendspage'); assert.match(await coach.textContent('#coswitch'), /Quincy/);
  await coach.click('#coswitch'); await coach.waitForSelector('#coswsheet .cmdrop'); if (OUT) await coach.screenshot({ path: OUT + '/coach-switch.png' });
  await coach.click('#coswsheet [data-act="copick"]:not(.on)'); await coach.waitForSelector('#trendspage'); assert.match(await coach.textContent('#coswitch'), /^Emma ▾/); ok('switcher: Quincy\'s Trends → Emma\'s Trends');
  assert.strictEqual(await coach.evaluate(() => JSON.parse(localStorage.getItem('golfsg.rounds.v1') || '[]').length), 0, 'nothing written to the coach\'s own rounds');
  // remove Emma from the team (from her pages' switcher); her phone notices and stops sending
  await coach.click('#coswitch'); await coach.waitForSelector('#coremove'); await coach.click('#coremove'); await coach.waitForSelector('#cmrm'); await coach.click('#coremoveyes');
  await coach.waitForSelector('#cmpage'); assert.deepStrictEqual(await coach.$$eval('.cmcard .cmname', e => e.map(x => x.textContent)), ['Quincy']);
  assert.strictEqual(await em.check('Emma'), false); assert.strictEqual(em.link('Emma').removed, true); assert.strictEqual((await em.flush('Emma', { rounds: [{ id: 'x' }] })).sent, 0, 'stops sending');
  ok('coach removes Emma → off the list; her phone sees it and stops sending');
  
  // reload: straight back to Athletes, from the phone's copy
  await coach.reload(); await coach.waitForSelector('#cmpage .cmcard'); ok('coach reopens the app → Athletes, at once');
  // 4. the athlete stops sharing
  await ath.click('#csstop'); await ath.click('#csstopyes'); await ath.waitForSelector('#csopen'); assert.strictEqual(sentAll(), 0, 'online copy deleted');
  await coach.click('#copull'); await coach.waitForSelector('#cmempty'); ok('athlete stops sharing → gone from the coach\'s list');
  // 5. coach account: sign out, sign back in on another phone, forgot password
  await settings(coach); if (OUT) await coach.locator('#coachcard').screenshot({ path: OUT + '/coach-account.png' });
  await coach.click('#coout'); await coach.waitForSelector('#coopen');
  const laptop = await phone('Mike2'); await settings(laptop); await laptop.click('#coopen'); await laptop.click('[data-act="cotab"][data-v="in"]');
  await laptop.fill('#coemail', 'mike@example.com'); await laptop.click('#coforgot'); await laptop.waitForSelector('#comsg'); assert.deepStrictEqual(fb.sent.slice(-1)[0], { type: 'PASSWORD_RESET', email: 'mike@example.com' });
  await laptop.fill('#copass', 'wrong'); await laptop.click('#cogo'); await laptop.waitForSelector('#coerr'); assert.match(await laptop.textContent('#coerr'), /doesn't match/);
  await laptop.fill('#copass', 'secret12'); await laptop.click('#cogo'); await laptop.waitForSelector('#cmpage #cmcode'); assert.strictEqual(await laptop.textContent('#cmcode'), code); ok('sign in on another device → same team; forgot password sends the email');
  assert.deepStrictEqual(errs, []); await b.close(); srv.kill(); fb.close(); console.log('coach-sharing OK'); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
