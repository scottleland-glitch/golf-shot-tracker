// v102 Rounds page (was "History"): a tight list like a scorecard app's Scores list instead of the big tiles.
// Covers: 10 sample rounds (Scott + Quincy, one unfinished) → at least 8 whole rows visible at 390x844 without scrolling; header labels;
// score circle tinted by to-par (under / even-to-bogey / over); holes pill flags the unfinished round; mm/dd + year; course + tee/player;
// every user-visible "History" label now says "Rounds"; tapping a row opens its stats; the tiny trash keeps its confirm
// (Cancel keeps the round, OK deletes it); the compact tools still work; select mode (Change player) toggles rows and moves a round.
const { chromium } = require('playwright-core'); const assert = require('assert'); const { spawn } = require('child_process');
const ARC = require('./fixtures/arcade-78.js');
const OUT = '/workspace/golf-app/screenshots/', PORT = 8839, BASE = 'http://127.0.0.1:' + PORT + '/';
const COURSES = ['Arcade Creek', 'Haggin Oaks', 'Bing Maloney', 'Ancil Hoffman', 'Cherry Island', 'Teal Bend', 'Davis Golf Course', 'Wildhorse', 'Valley Hi', 'Mather'];
const TEES = ['Blue', 'White', 'Gold', 'Blue', 'White', '', 'Blue', 'Gold', 'White', 'Blue'];
// more > 0: extra putts on the first holes; more < 0: one shot fewer on the first holes
const rnd = (id, player, date, extra, more) => { const r = Object.assign(ARC.round(), { id, date: date + 'T16:00:00.000Z' }, extra || {});
  if (player) r.player = player; else delete r.player;
  for (let k = 0; k < Math.abs(more || 0); k++) { const h = r.holes[k % 18]; if (more > 0) h.rows.splice(h.rows.length - 1, 0, { dist: 4, loc: 'green', dir: '', pen: false }); else h.rows.splice(1, 1); }
  return r; };

(async () => {
  const R = [];
  for (let i = 0; i < 10; i++) R.push(rnd('t' + i, i % 3 === 1 ? 'Quincy' : 'Scott', '2026-' + String(10 - Math.floor(i / 3)).padStart(2, '0') + '-' + String(28 - i * 2).padStart(2, '0'),
    { course: COURSES[i], tee: TEES[i] || undefined }, i === 2 ? -8 : i === 5 ? 16 : i % 4));
  const unf = R[3]; for (let k = 9; k < 18; k++) { unf.holes[k].rows = []; unf.holes[k].finished = false; } // 9 of 18 played
  R.push(rnd('old', 'Scott', '2025-07-13', { course: 'Bing Maloney', tee: 'White' }, 2)); // 11th round, last year – below the fold

  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: '/workspace/golf-app', stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1500)); const errors = [], dialogs = [];
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  await ctx.route(/^https:\/\/([a-z0-9-]+\.)?(google|googleapis|microsoft|live|microsoftonline)\.com\//, route => { errors.push('unexpected outside call ' + route.request().url()); route.abort(); });
  await ctx.addInitScript(rs => { if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('golfsg.rounds.v1', JSON.stringify(rs));
    localStorage.setItem('golfsg.player.v1', 'Scott'); localStorage.setItem('golfsg.nameasked.v1', '1'); } }, R);
  const P = await ctx.newPage(); P.setDefaultTimeout(30000); P.on('pageerror', e => errors.push(String(e))); P.on('console', m => m.type() === 'error' && errors.push('console: ' + m.text()));
  let answer = false; P.on('dialog', d => { dialogs.push(d.message()); answer ? d.accept() : d.dismiss(); });
  const shot = async name => { await P.waitForFunction(() => !document.querySelector('#toast.show')); await P.waitForTimeout(400); await P.screenshot({ path: OUT + name }); };
  const LR = () => P.evaluate(() => JSON.parse(localStorage.getItem('golfsg.rounds.v1')));
  await P.goto(BASE + 'index.html'); await P.waitForSelector('#plusbtn');

  // ---------- 1. the menu says Rounds ----------
  await P.click('#plusbtn');
  const menu = await P.$$eval('#plusmenu button', bs => bs.map(x => x.textContent.trim()));
  assert(menu.includes('Rounds') && !menu.some(t => /History/.test(t)), 'menu item renamed: ' + menu);
  await P.click('[data-act="history"]'); await P.waitForSelector('#histlist .hrow');
  assert.strictEqual(await P.textContent('.topbar .title b'), 'Rounds');
  assert(!/History/.test(await P.textContent('#app')), 'no "History" left on the page');
  console.log('  rename: menu item + page title say Rounds');

  // ---------- 2. tight list ----------
  assert.deepStrictEqual(await P.$$eval('#hhead span', s => s.map(x => x.textContent.trim()).filter(Boolean)), ['Score', 'Holes', 'Date', 'To parSG', 'Course']);
  const rows = await P.$$eval('#histlist .hrow', rs => rs.map(r => { const b = r.getBoundingClientRect(); return { id: r.dataset.id, top: b.top, bottom: b.bottom, h: b.height,
    circ: r.querySelector('.hcirc').textContent, tint: r.querySelector('.hcirc').className, holes: r.querySelector('.hholes').textContent, unf: r.querySelector('.hholes').classList.contains('unf'),
    date: r.querySelector('.hdate b').textContent, year: r.querySelector('.hdate small').textContent, par: r.querySelector('.hpar b').textContent, sg: r.querySelector('.hpar small').textContent,
    course: r.querySelector('.hmain b').textContent, sub: r.querySelector('.hmain small').textContent, del: !!r.querySelector('.hdel') }; }));
  assert.strictEqual(rows.length, 11);
  const visible = rows.filter(r => r.top >= 0 && r.bottom <= 844).length;
  assert(visible >= 8, 'at least 8 whole rows visible at 390x844, got ' + visible);
  assert(rows.every(r => r.h <= 64), 'rows are thin (≤64px): ' + rows.map(r => r.h));
  const by = id => rows.find(r => r.id === id);
  assert.deepStrictEqual([by('t0').circ, by('t0').par, by('t0').holes, by('t0').date, by('t0').year, by('t0').course, by('t0').sub], ['78', '+6', '18', '10/28', '2026', 'Arcade Creek', 'Blue · Scott']);
  assert(/tp-even/.test(by('t0').tint), 'a +6 is in the neutral band');
  assert(/tp-under/.test(by('t2').tint) && by('t2').par === '-2', 'under par is green: ' + by('t2').tint + ' ' + by('t2').par);
  assert(/tp-over/.test(by('t5').tint), 'a +' + by('t5').par + ' is in the red-ish band');
  assert.deepStrictEqual([by('t3').holes, by('t3').unf, by('t3').sub], ['9', true, 'Unfinished · Blue · Scott'], 'unfinished round flagged');
  assert(rows.filter(r => r.id !== 't3').every(r => !r.unf), 'only one unfinished');
  assert.strictEqual(by('t1').sub, 'White · Quincy');
  assert.deepStrictEqual([by('old').date, by('old').year], ['07/13', '2025']);
  assert(rows.every(r => r.del), 'each row has the tiny trash');
  assert(/^[+−-]?\d/.test(by('t0').sg), 'SG shown small: ' + by('t0').sg);
  const tools = await P.$$eval('#histtools button', bs => bs.map(x => [x.id, x.getBoundingClientRect().height]));
  assert.deepStrictEqual(tools.map(t => t[0]), ['addround', 'chgplayer', 'cmpopen', 'histbz']);
  assert(tools.every(t => t[1] <= 52), 'tools are slim: ' + tools);
  assert(await P.$('#playerchips [data-v="Quincy"]'), 'player filter still there');
  await shot('rounds-tight.png');
  console.log('  list: ' + visible + ' of 11 rows visible, header labels, tints under/even/over, unfinished pill, mm/dd + year, tee · player, compact tools');

  // ---------- 3. tap a row → round stats; back says ‹ Rounds ----------
  await P.click('.hrow[data-id="t1"] .hist'); await P.waitForSelector('[data-act="history"]');
  assert(/Haggin Oaks/.test(await P.textContent('#app')), 'opened the tapped round');
  const back = (await P.textContent('.topbar [data-act="history"]')).trim();
  assert.strictEqual(back, '‹ Rounds');
  await P.click('.topbar [data-act="history"]'); await P.waitForSelector('#histlist');
  console.log('  tap: row opens its stats, back button says ‹ Rounds');

  // ---------- 4. filter ----------
  await P.click('#playerchips [data-v="Quincy"]');
  assert.deepStrictEqual(await P.$$eval('#histlist .hrow', rs => rs.map(r => r.dataset.id)), ['t1', 't4', 't7']);
  await P.click('#playerchips [data-v=""]'); assert.strictEqual((await P.$$('#histlist .hrow')).length, 11);
  console.log('  filter: Quincy shows her 3 rounds, All players shows 11');

  // ---------- 5. delete keeps its confirm ----------
  answer = false; await P.click('.hrow[data-id="t9"] .hdel');
  assert(/Delete the round from .*Mather.* for good\?/.test(dialogs.pop()), 'confirm asked');
  assert((await LR()).some(r => r.id === 't9'), 'Cancel keeps the round');
  answer = true; await P.click('.hrow[data-id="t9"] .hdel'); await P.waitForFunction(() => !document.querySelector('.hrow[data-id="t9"]'));
  assert(!(await LR()).some(r => r.id === 't9'), 'OK deletes it'); answer = false;
  console.log('  delete: tiny trash asks first; Cancel keeps, OK deletes');

  // ---------- 6. select mode ----------
  await P.click('#chgplayer'); await P.waitForSelector('#mvhelp');
  assert(!(await P.$('.hdel')) && !(await P.$('#histtools')), 'trash + tools hidden in select mode');
  await P.click('.hrow[data-id="t0"] .hist'); await P.click('.hrow[data-id="t3"] .hist');
  assert.deepStrictEqual(await P.$$eval('.hrow.mvsel', rs => rs.map(r => r.dataset.id)), ['t0', 't3']);
  assert.strictEqual(await P.getAttribute('.hrow[data-id="t0"] .hist', 'aria-checked'), 'true');
  const sel = await P.$$eval('#histlist .hrow', rs => rs.filter(r => r.getBoundingClientRect().bottom <= 844).length);
  assert(sel >= 7, 'still a tight list in select mode: ' + sel);
  await shot('rounds-select-mode.png');
  await P.click('.hrow[data-id="t3"] .hist'); assert.deepStrictEqual(await P.$$eval('.hrow.mvsel', rs => rs.map(r => r.dataset.id)), ['t0']);
  await P.click('#mvgo'); await P.click('.mvname[data-v="Quincy"]'); await P.click('#mvyes');
  await P.waitForFunction(() => !document.querySelector('.mvon'));
  assert.strictEqual((await LR()).find(r => r.id === 't0').player, 'Quincy');
  assert.strictEqual(await P.textContent('.hrow[data-id="t0"] .hmain small'), 'Blue · Quincy');
  console.log('  select mode: tap toggles rows, trash hidden, moved t0 to Quincy');

  // ---------- 7. Settings (was Archive) button ----------
  await P.click('.topbar [data-act="home"]'); await P.waitForSelector('#plusbtn');
  await P.click('#plusbtn'); await P.click('#plusmenu [data-act="archive"]'); await P.waitForSelector('.histbtn');
  assert(/📋 Rounds/.test(await P.textContent('.histbtn'))); console.log('  Settings: button says 📋 Rounds');

  assert.deepStrictEqual(errors, []);
  await b.close(); srv.kill(); console.log('rounds-tight-focused: OK');
})().catch(e => { console.error(e); process.exit(1); });
