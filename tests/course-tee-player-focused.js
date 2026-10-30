// v88: Course dropdown (+ Add new course first, then saved courses, most recently used first), tee boxes per course (chips, manual naming,
// add a tee box later), migration of older saved courses, and the first-open "Who's playing?" prompt; v89: Player row moved from Home into the New round sheet. iPhone viewport.
const { chromium } = require('playwright-core'); const assert = require('assert'); const { spawn } = require('child_process');
const C = require('../courses.js');
const BASE = 'http://127.0.0.1:8810/', OUT = '/workspace/golf-app/screenshots/';
const Y = (b) => Array.from({ length: 18 }, (_, i) => b + i * 7), P = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 5];
// ---- pure: migration + order ----
{
  const old = [{ id: 'a', name: 'Arcade Creek', pars: P, tees: [{ name: 'Tee', yards: Y(300) }], updated: '2026-10-25T00:00:00Z' },
    { id: 'l', name: 'Lakeridge', pars: P, tees: [{ name: 'Tee 1', yards: Y(310) }], updated: '2026-08-01T00:00:00Z' },
    { id: 'p', name: 'Pebble Creek', pars: P, tees: [{ name: 'Blue', yards: Y(380) }, { name: 'White', yards: Y(350) }, { name: '', yards: Y(300) }], updated: '2026-09-01T00:00:00Z' },
    { id: 'n', name: 'Named', pars: P, tees: [{ name: 'Sage', yards: Y(320) }], updated: '2026-07-01T00:00:00Z' }];
  const M = C.migrate(JSON.parse(JSON.stringify(old)));
  assert.strictEqual(M.changed, true);
  assert.deepStrictEqual(M.courses.map(c => c.tees.map(t => t.name)), [['Main tees'], ['Main tees'], ['Blue', 'White', 'Main tees'], ['Sage']]);
  assert.deepStrictEqual(M.courses.map(c => c.tees.map(t => t.yards)), old.map(c => c.tees.map(t => t.yards)), 'no numbers change');
  assert.strictEqual(C.migrate([M.courses[3]]).courses[0], M.courses[3], 'named course left as is'); assert.strictEqual(C.migrate(M.courses).changed, false, 'second run changes nothing');
  assert.strictEqual(M.courses[0].updated, old[0].updated, 'migration keeps the saved date (restore merge unaffected)');
  const R = [{ id: 'r1', date: '2026-10-20T17:00:00Z', courseId: 'l', course: 'Lakeridge' }, { id: 'r2', date: '2026-10-27T17:00:00Z', course: 'named' }];
  assert.deepStrictEqual(C.byRecent(M.courses, R).map(c => c.id), ['n', 'a', 'l', 'p'], 'recent rounds first (by id or same name), then saved date');
  assert.deepStrictEqual(C.byRecent(M.courses, []).map(c => c.id), ['a', 'p', 'l', 'n']);
  // manual entry: blank tee name saves as Main tees; duplicates get a number; empty extra tee box dropped
  const cl = C.clean({ id: 'x', name: 'X', pars: P, tees: [{ name: '', yards: Y(300) }, { name: 'White', yards: Y(310) }, { name: 'white', yards: Y(320) }, { name: '', yards: C.pad([]) }] });
  assert.deepStrictEqual(cl.tees.map(t => t.name), ['Main tees', 'White', 'white 2']);
  assert.strictEqual(C.blankCourse('Y').tees[0].name, '', 'manual entry starts with an empty tee name to fill in');
  console.log('  pure: migrate / byRecent / clean ok');
}
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', '8810', '--bind', '127.0.0.1'], { cwd: '/workspace/golf-app', stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1500)); const errors = [];
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await ctx.newPage(); page.on('pageerror', e => errors.push(String(e))); page.on('console', m => m.type() === 'error' && !/favicon/.test(m.text()) && errors.push(m.text()));
  const dialogs = []; page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
  const clean = async () => { await page.evaluate(() => { const t = document.getElementById('toast'); if (t) t.className = ''; }); await page.waitForTimeout(350); };
  const shot = async name => { await clean(); await page.screenshot({ path: OUT + name + '.png' }); };
  const store = () => page.evaluate(() => JSON.parse(localStorage.getItem('golfsg.courses.v1')));
  const seed = (o) => page.evaluate(o => { localStorage.clear(); Object.keys(o).forEach(k => localStorage.setItem(k, typeof o[k] === 'string' ? o[k] : JSON.stringify(o[k]))); }, o);
  const OLD = [{ id: 'a', name: 'Arcade Creek', pars: P, tees: [{ name: 'Tee', yards: Y(300) }], updated: '2026-10-25T00:00:00Z' },
    { id: 'l', name: 'Lakeridge', pars: P, tees: [{ name: 'Tee 1', yards: Y(310) }], updated: '2026-08-01T00:00:00Z' },
    { id: 'p', name: 'Pebble Creek', pars: P, tees: [{ name: 'Blue', yards: Y(380) }, { name: 'White', yards: Y(350) }, { name: 'Red', yards: Y(290) }], updated: '2026-09-01T00:00:00Z' }];
  const R1 = { v: 3, dv: 2, id: 'r1', date: '2026-10-20T17:00:00.000Z', course: 'Lakeridge', courseId: 'l', player: 'Scott', baseline: 'pga', holes: Array.from({ length: 18 }, () => ({ par: 4, finished: true, rows: [{ loc: 'tee', dist: 400, dir: '', pen: false }, { loc: 'green', dist: 10, dir: '', pen: false }, { loc: 'holed', dist: 1, dir: '', pen: false }] })) };
  await page.goto(BASE + '?x=' + Date.now()); await seed({ 'golfsg.player.v1': 'Scott', 'golfsg.courses.v1': OLD, 'golfsg.rounds.v1': [R1] }); await page.reload(); await page.waitForSelector('#home');
  // migration on open: unnamed tee sets now "Main tees", numbers kept
  let S = await store(); assert.deepStrictEqual(S.map(c => c.tees.map(t => t.name)), [['Main tees'], ['Main tees'], ['Blue', 'White', 'Red']]);
  assert.deepStrictEqual(S.map(c => c.tees.map(t => t.yards)), OLD.map(c => c.tees.map(t => t.yards)));
  assert.strictEqual(await page.$('#namesheet'), null, 'name saved: no prompt');
  // dropdown: Add new first, then most recently used
  await page.click('#plusbtn'); await page.click('[data-act="newform"]'); await page.waitForSelector('#crspick');
  assert.strictEqual((await page.textContent('#crspicked')).trim(), 'Choose a course'); assert.strictEqual(await page.$('#course'), null, 'no name box until Add new');
  await page.click('#crspick'); await page.waitForSelector('#crslist');
  const opts = () => page.$$eval('#crslist .crsopt', e => e.map(x => x.querySelector('b') ? x.querySelector('b').textContent : x.textContent.trim()));
  assert.deepStrictEqual(await opts(), ['+ Add new course', 'Arcade Creek', 'Lakeridge', 'Pebble Creek']);
  assert.match(await page.textContent('#crslist [data-id="p"] small'), /3 tee boxes · par 72/); assert.match(await page.textContent('#crslist [data-id="a"] small'), /Main tees/);
  await shot('course-dropdown');
  // pick a course with several tee boxes → chips, first chosen; switch to White; round gets White's distances
  await page.click('#crslist [data-id="p"]'); await page.waitForSelector('#ntees'); assert.strictEqual(await page.$('#crslist'), null, 'list closes');
  assert.strictEqual((await page.textContent('#crspicked')).trim(), 'Pebble Creek'); assert.strictEqual((await page.textContent('#teelbl')).trim(), 'Tee box');
  assert.deepStrictEqual(await page.$$eval('#ntees .ntee', e => e.map(x => x.childNodes[0].textContent.trim())), ['Blue', 'White', 'Red', '＋ Add tee box']);
  assert.match(await page.textContent('#ntees .sel'), /^Blue/);
  await page.click('#ntees [data-v="White"]'); assert.match(await page.textContent('#ntees .sel'), /^White/); assert.strictEqual(await page.locator('#ntees .sel').count(), 1);
  await shot('tee-chips');
  await page.click('[data-act="new"]'); await page.waitForSelector('.holecard');
  let rd = await page.evaluate(() => JSON.parse(localStorage.getItem('golfsg.rounds.v1'))[0]);
  assert.deepStrictEqual([rd.course, rd.courseId, rd.tee, rd.holes[0].rows[0].dist, rd.holes[2].par], ['Pebble Creek', 'p', 'White', 350, 3]);
  assert.match(await page.textContent('.topbar .title b'), /Pebble Creek/);
  // just played → Pebble Creek moves to the top
  await page.click('[data-act="home"]'); await page.click('#plusbtn'); await page.click('[data-act="newform"]'); await page.click('#crspick');
  assert.deepStrictEqual(await opts(), ['+ Add new course', 'Pebble Creek', 'Arcade Creek', 'Lakeridge']);
  // one tee box: shown as the one in use; add another tee box with a name from the quick chips
  await page.click('#crslist [data-id="a"]'); assert.strictEqual((await page.textContent('#teelbl')).trim(), 'Playing from');
  assert.deepStrictEqual(await page.$$eval('#ntees .ntee.sel', e => e.map(x => x.childNodes[0].textContent.trim())), ['Main tees']);
  await page.click('[data-act="naddtee"]'); await page.waitForSelector('.revgrid');
  assert.strictEqual(await page.$eval('[data-cf="name"]', e => e.value), 'Arcade Creek'); assert.strictEqual(await page.$eval('[data-cf="tee"]', e => e.value), '');
  assert.ok(await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('data-cf') === 'tee'), 'tee name box focused');
  assert.deepStrictEqual(await page.$$eval('.revtees .frostchip', e => e.map(x => x.textContent)), ['Main tees', 'Tee box 2', '＋ Tee box']);
  assert.strictEqual(await page.$eval('[data-cf="par"][data-i="0"]', e => e.value), '4', 'pars carried over'); assert.strictEqual(await page.$eval('[data-cf="yd"][data-i="0"]', e => e.value), '');
  assert.deepStrictEqual(await page.$$eval('#teequick .tq', e => e.map(x => x.textContent)), ['Black', 'Blue', 'White', 'Gold', 'Red', 'Green']);
  await page.click('#teequick [data-v="Red"]'); assert.strictEqual(await page.$eval('[data-cf="tee"]', e => e.value), 'Red'); assert.match(await page.textContent('#teequick .sel'), /Red/);
  assert.strictEqual(await page.textContent('.revtees [data-i="1"]'), 'Red');
  await page.fill('[data-cf="tee"]', 'Truckee'); assert.strictEqual(await page.textContent('.revtees [data-i="1"]'), 'Truckee'); assert.strictEqual(await page.locator('#teequick .sel').count(), 0);
  await page.click('#teequick [data-v="Red"]');
  for (let i = 0; i < 4; i++) await page.fill(`[data-cf="yd"][data-i="${i}"]`, String(250 + i * 10));
  await page.evaluate(() => window.scrollTo(0, 0)); await shot('tee-name-entry');
  for (let i = 4; i < 18; i++) await page.fill(`[data-cf="yd"][data-i="${i}"]`, String(250 + i * 10));
  await page.click('[data-act="cardsave"]'); await page.waitForSelector('#ntees');
  assert.strictEqual((await page.textContent('#crspicked')).trim(), 'Arcade Creek'); assert.match(await page.textContent('#ntees .sel'), /^Red/, 'new tee box chosen');
  S = await store(); let A = S.find(c => c.id === 'a'); assert.deepStrictEqual(A.tees.map(t => t.name), ['Main tees', 'Red']); assert.deepStrictEqual(A.tees[0].yards, Y(300)); assert.strictEqual(A.tees[1].yards[17], 420);
  assert.strictEqual(S.filter(c => c.id === 'a').length, 1, 'same course, not a copy');
  // a second unnamed tee box with numbers → asked to name it
  await page.click('[data-act="naddtee"]'); await page.waitForSelector('.revgrid'); await page.fill('[data-cf="yd"][data-i="0"]', '199');
  await page.click('[data-act="cardsave"]'); await page.waitForSelector('#toast.show'); assert.match(await page.textContent('#toast'), /Name each tee box/); assert.ok(await page.$('.revgrid'), 'stays on the card');
  await page.fill('[data-cf="tee"]', 'Forward'); await page.click('[data-act="cardsave"]'); await page.waitForSelector('#ntees');
  assert.deepStrictEqual((await store()).find(c => c.id === 'a').tees.map(t => t.name), ['Main tees', 'Red', 'Forward']);
  // Rename via ✎: rename Main tees → White
  await page.click('#ntees [data-v="Main tees"]'); await page.click('[data-act="nedit"]'); await page.waitForSelector('.revgrid'); assert.strictEqual(await page.$eval('[data-cf="tee"]', e => e.value), 'Main tees');
  await page.click('#teequick [data-v="White"]'); await page.click('[data-act="cardsave"]'); await page.waitForSelector('#ntees');
  assert.deepStrictEqual((await store()).find(c => c.id === 'a').tees.map(t => t.name), ['White', 'Red', 'Forward']); assert.match(await page.textContent('#ntees .sel'), /^White/);
  // back out of the editor: the sheet keeps the course chosen
  await page.click('[data-act="naddtee"]'); await page.click('[data-act="cardback"]'); await page.waitForSelector('#ntees'); assert.strictEqual((await page.textContent('#crspicked')).trim(), 'Arcade Creek');
  assert.strictEqual((await store()).find(c => c.id === 'a').tees.length, 3, 'backing out saves nothing');
  // Add new course: name box, then type the card in by hand with no tee name → Main tees
  await page.click('#crspick'); await page.click('[data-act="crsnew"]'); await page.waitForSelector('#course'); assert.strictEqual(await page.$('#ntees'), null);
  assert.strictEqual((await page.textContent('#crspicked')).trim(), '+ Add new course'); assert.strictEqual(await page.$('[data-act="scan"]'), null, 'no scan (v89)'); assert.ok(await page.$('[data-act="cardmanual"]'));
  await page.fill('#course', 'Wolf Run'); await page.click('[data-act="cardmanual"]'); await page.waitForSelector('.revgrid');
  assert.strictEqual(await page.$eval('[data-cf="name"]', e => e.value), 'Wolf Run'); assert.strictEqual(await page.$eval('[data-cf="tee"]', e => e.getAttribute('placeholder')), 'e.g. White, Red, Truckee');
  for (let i = 0; i < 18; i++) { await page.fill(`[data-cf="par"][data-i="${i}"]`, String(P[i])); await page.fill(`[data-cf="yd"][data-i="${i}"]`, String(300 + i)); }
  await page.click('[data-act="cardsave"]'); await page.waitForSelector('#ntees'); assert.strictEqual((await page.textContent('#crspicked')).trim(), 'Wolf Run');
  assert.deepStrictEqual((await store()).find(c => c.name === 'Wolf Run').tees.map(t => t.name), ['Main tees']);
  await page.click('#crspick'); assert.deepStrictEqual((await opts())[0], '+ Add new course'); assert.strictEqual((await opts())[1], 'Wolf Run', 'new course on top');
  // typing a saved course's name (Add new) still uses that course
  await page.click('[data-act="crsnew"]'); await page.fill('#course', 'lakeridge'); await page.click('[data-act="new"]'); await page.waitForSelector('.holecard');
  rd = await page.evaluate(() => JSON.parse(localStorage.getItem('golfsg.rounds.v1'))[0]); assert.deepStrictEqual([rd.course, rd.courseId, rd.tee, rd.holes[0].rows[0].dist], ['Lakeridge', 'l', 'Main tees', 310]);
  // ---- player: first open on a new phone ----
  await seed({}); await page.reload(); await page.waitForSelector('#namesheet');
  assert.strictEqual((await page.textContent('#namesh')).trim(), 'Who’s playing?'); assert.match(await page.textContent('#namehelp'), /Enter the golfer’s name/);
  await shot('player-prompt');
  await page.fill('#pname', 'Quincy'); await page.click('#namesheet [data-act="setname"]'); await page.waitForSelector('#namesheet', { state: 'detached' });
  assert.strictEqual(await page.evaluate(() => localStorage.getItem('golfsg.player.v1')), 'Quincy');
  // v89: Home stays clean – no Player row; the player lives in the New round sheet
  const homeBtns = () => page.$$eval('#home button', e => e.map(x => x.id));
  assert.strictEqual(await page.$('#playerrow'), null, 'no Player row on Home'); assert.deepStrictEqual(await homeBtns(), ['plusbtn', 'archivepill']);
  assert.doesNotMatch(await page.innerText('#home'), /Quincy|Player|golfer/i);
  await shot('home-clean');
  await page.reload(); await page.waitForSelector('#home'); assert.strictEqual(await page.$('#namesheet'), null, 'asked once');
  // New round sheet: Course, Compare my shots against, then Player with the current name
  const openNew = async () => { await page.click('#plusbtn'); await page.click('[data-act="newform"]'); await page.waitForSelector('#nplayer'); };
  await openNew();
  const order = await page.$$eval('#plusmenu .lbl', e => e.map(x => x.textContent.trim())); assert.deepStrictEqual(order, ['Course', 'Compare my shots against', 'Player']);
  assert.strictEqual(await page.textContent('#npname'), 'Quincy'); assert.match(await page.textContent('#nplayer'), /Quincy\s*Change/);
  const nb = await page.$eval('#nplayer', e => e.getBoundingClientRect().toJSON()), bl = await page.$eval('#newbl', e => e.getBoundingClientRect().toJSON());
  assert.ok(nb.top >= bl.bottom - 1 && nb.right <= 393, 'Player row under the benchmark ' + JSON.stringify([nb, bl]));
  await page.fill('#course', 'Test'); await page.waitForTimeout(100); await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await shot('new-round-player');
  // the name goes on new rounds (and so the reports + live viewer)
  await page.click('[data-act="new"]'); await page.waitForSelector('.holecard');
  assert.strictEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('golfsg.rounds.v1'))[0].player), 'Quincy');
  // Change inline: prefilled, Cancel keeps it, Save asks before relabelling; the sheet stays open on New round
  await page.click('[data-act="home"]'); await openNew(); await page.click('#nplayer [data-act="npedit"]'); await page.waitForSelector('#npeditrow');
  assert.strictEqual(await page.$eval('#pname', e => e.value), 'Quincy'); assert.ok(await page.evaluate(() => document.activeElement.id === 'pname'), 'name box focused');
  await page.click('[data-act="npcancel"]'); assert.strictEqual(await page.$('#npeditrow'), null); assert.strictEqual(await page.textContent('#npname'), 'Quincy');
  await page.click('#nplayer [data-act="npedit"]'); await page.fill('#pname', 'Quincy L'); await page.press('#pname', 'Enter'); await page.waitForSelector('#npeditrow', { state: 'detached' });
  assert.match(dialogs[dialogs.length - 1], /Change player name from "Quincy" to "Quincy L"/); assert.strictEqual(await page.textContent('#npname'), 'Quincy L');
  assert.ok(await page.$('#plusmenu #crspick, #plusmenu #course'), 'still on the New round sheet');
  assert.strictEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('golfsg.rounds.v1'))[0].player), 'Quincy L');
  // declining the confirm keeps the old name (never overwritten silently)
  page.removeAllListeners('dialog'); page.once('dialog', d => { dialogs.push(d.message()); d.dismiss(); });
  await page.click('#nplayer [data-act="npedit"]'); await page.fill('#pname', 'Someone'); await page.click('#npeditrow [data-act="setname"]');
  assert.match(dialogs[dialogs.length - 1], /Change player name from "Quincy L" to "Someone"/); assert.strictEqual(await page.evaluate(() => localStorage.getItem('golfsg.player.v1')), 'Quincy L');
  page.removeAllListeners('dialog'); page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
  await page.click('[data-act="npcancel"]');
  // closing the sheet drops an unfinished edit
  await page.click('#nplayer [data-act="npedit"]'); await page.click('.sheet-back', { position: { x: 30, y: 40 } }); await openNew(); assert.strictEqual(await page.$('#npeditrow'), null);
  await page.click('.sheet-back', { position: { x: 30, y: 40 } });
  // Not now: no nagging, Home stays clean, New round offers to add the name
  await seed({}); await page.reload(); await page.waitForSelector('#namesheet'); await page.click('[data-act="nameskip"]');
  assert.strictEqual(await page.$('#namesheet'), null); assert.deepStrictEqual(await homeBtns(), ['plusbtn', 'archivepill']);
  await page.reload(); await page.waitForSelector('#home'); assert.strictEqual(await page.$('#namesheet'), null, 'Not now is remembered');
  await openNew(); assert.match(await page.textContent('#nplayer'), /Add golfer’s name/);
  await page.click('#nplayer'); await page.fill('#pname', 'Quincy'); await page.click('#npeditrow [data-act="setname"]'); assert.strictEqual(await page.textContent('#npname'), 'Quincy');
  assert.strictEqual(await page.evaluate(() => localStorage.getItem('golfsg.player.v1')), 'Quincy');
  // a phone that already has a name is never asked / overwritten
  await seed({ 'golfsg.player.v1': 'Scott Leland' }); await page.reload(); await page.waitForSelector('#home');
  assert.strictEqual(await page.$('#namesheet'), null); await openNew(); assert.strictEqual(await page.textContent('#npname'), 'Scott Leland');
  assert.strictEqual(await page.evaluate(() => localStorage.getItem('golfsg.player.v1')), 'Scott Leland');
  // phone with rounds but no name (older install): no pop-up, New round offers to add it
  await seed({ 'golfsg.rounds.v1': [Object.assign({}, R1, { player: undefined })] }); await page.reload(); await page.waitForSelector('#home');
  assert.strictEqual(await page.$('#namesheet'), null); assert.strictEqual(await page.$('#playerrow'), null); await openNew(); assert.match(await page.textContent('#nplayer'), /Add golfer’s name/);
  const w = await page.evaluate(() => document.documentElement.scrollWidth); assert.ok(w <= 393, 'no sideways scroll ' + w);
  const SWV = require('fs').readFileSync(__dirname + '/../sw.js', 'utf8').match(/golf-sg-v\d+/)[0]; assert.strictEqual(SWV, 'golf-sg-v98');
  assert.deepStrictEqual(errors, []); console.log('COURSE / TEE / PLAYER OK'); await b.close(); srv.kill();
})().catch(e => { console.error(e); process.exit(1); });
