// v89: saved courses are typed in by hand (the scorecard photo scan is gone).
// (1) course helpers: stored shape, round prefill, restore merge, backup file, voice with a prefilled tee distance;
// (2) phone-size browser flow, network blocked: no scan anywhere, type a card in from New round and from Archive › Courses,
//     edit / delete, restore brings courses in; the service worker no longer caches the scanner and deletes its old cache.
const assert = require('assert'); const fs = require('fs'); const C = require('../courses.js'); const SG = require('../sg.js'); const V = require('../voice.js');
const CARD = require('./fixtures/card-data.js'); const TRUE = {}; CARD.rows.forEach(r => { TRUE[r.label.toLowerCase()] = r.vals; });
let n = 0; const eq = (a, b, m) => { assert.deepStrictEqual(a, b, m); n++; };
// no scanner left in the code or the offline file list
for (const k of ['parseCard', 'readCard', 'readHalf', 'mergeHalves', 'halfCard', 'fromScan', 'guessName']) eq(C[k], undefined, 'no ' + k);
const SW = fs.readFileSync(__dirname + '/../sw.js', 'utf8'), IDX = fs.readFileSync(__dirname + '/../index.html', 'utf8');
assert.ok(!/scan\.js|tesseract/.test(SW) && !/scan\.js|tesseract/.test(IDX), 'scanner not loaded or cached'); n++;
assert.ok(!fs.existsSync(__dirname + '/../scan.js') && !fs.existsSync(__dirname + '/../vendor/tesseract'), 'scanner files removed'); n++;
// courses: stored shape, round prefill, restore merge, backup file
const course = C.clean({ id: 'c1', name: 'Pebble Creek', pars: TRUE.par, hcp: TRUE.handicap, tees: ['black', 'blue', 'white'].map(k => ({ name: k[0].toUpperCase() + k.slice(1), yards: TRUE[k] })) });
eq(course.tees.length, 3); eq(course.pars, TRUE.par); eq(course.hcp, TRUE.handicap);
const holes = Array.from({ length: 18 }, () => ({ par: 4, finished: false, rows: [{ loc: 'tee', dist: '', dir: '', pen: false }] }));
C.prefill(holes, course, 'White'); eq(holes.map(x => x.par), TRUE.par); eq(holes.map(x => x.rows[0].dist), TRUE.white);
const nine = C.clean({ id: 'c9', name: 'Nine', pars: [3, 4, 5], tees: [{ name: 'Only', yards: [150, 380] }] }); eq(nine.pars.length, 18); eq(nine.tees[0].yards[2], null);
const holes9 = Array.from({ length: 18 }, () => ({ par: 4, rows: [{ loc: 'tee', dist: '', dir: '', pen: false }] })); C.prefill(holes9, nine, 'Only'); eq([holes9[0].par, holes9[0].rows[0].dist, holes9[2].par, holes9[2].rows[0].dist, holes9[5].par], [3, 150, 5, '', 4]);
let M = C.mergeCourses([course], [course, nine]); eq([M.added, M.updated, M.courses.length], [1, 0, 2]);
const newer = Object.assign({}, course, { name: 'Pebble Creek GC', updated: '2999-01-01T00:00:00Z' }); M = C.mergeCourses([course], [newer]); eq([M.updated, M.courses[0].name], [1, 'Pebble Creek GC']);
const old = Object.assign({}, course, { name: 'Old', updated: '2000-01-01T00:00:00Z' }); M = C.mergeCourses([course], [old]); eq(M.courses[0].name, course.name, 'older copy does not overwrite');
const bk = SG.makeBackup([], null, 'Quincy', [course]); eq(bk.courses.length, 1); const pb = SG.parseBackup(JSON.stringify(bk)); eq([pb.rounds.length, pb.courses.length, !!pb.error], [0, 1, false]);
eq(SG.makeBackup([], null, 'Q').courses, undefined, 'no courses key when none saved');
// voice: with a prefilled tee distance, "driver 140 fairway" keeps the tee yardage, puts Driver on shot 1 and fills shot 2
let a = V.apply({ par: 4, rows: [{ loc: 'tee', dist: 386, dir: '', pen: false }] }, V.parse('driver 140 fairway')); eq([a.rows.length, a.rows[0].dist, a.rows[0].club, a.rows[1].loc, a.rows[1].dist], [2, 386, 'Driver', 'fairway', 140]);
a = V.apply({ par: 4, rows: [{ loc: 'tee', dist: 386, dir: '', pen: false }] }, V.parse('tee shot driver')); eq([a.rows.length, a.rows[0].dist, a.rows[0].club], [1, 386, 'Driver']);
console.log('  course helpers OK – ' + n + ' checks');
if (process.env.UNIT_ONLY) process.exit(0);

const { chromium } = require('playwright-core'); const { spawn } = require('child_process');
const PORT = 8813, BASE = `http://127.0.0.1:${PORT}/`, OUT = '/workspace/golf-app/screenshots/';
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: '/workspace/golf-app', stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1500)); const errors = [], outside = [], loaded = [];
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await ctx.route('**/*', route => { const u = route.request().url(); if (u.startsWith(BASE) || u.startsWith('data:') || u.startsWith('blob:')) { loaded.push(u); return route.continue(); } outside.push(u); return route.abort(); });
  const page = await ctx.newPage(); page.on('pageerror', e => errors.push(String(e))); page.on('dialog', d => d.accept());
  const clean = async () => { await page.evaluate(() => { const t = document.getElementById('toast'); if (t) t.className = ''; }); await page.waitForTimeout(300); };
  const shot = async name => { await clean(); await page.screenshot({ path: OUT + name + '.png' }); };
  await page.goto(BASE + '?x=' + Date.now());
  // an older phone still has the scanner's cache: the new service worker deletes it
  await page.evaluate(() => caches.open('pinhigh-ocr-v1').then(c => c.put('./vendor/tesseract/x.js', new Response('x'))));
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('golfsg.player.v1', 'Quincy'); });
  await page.reload(); await page.evaluate(() => navigator.serviceWorker.ready); await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 }).catch(() => {});
  if (!(await page.evaluate(() => !!navigator.serviceWorker.controller))) { await page.reload(); await page.waitForFunction(() => !!navigator.serviceWorker.controller); }
  const SWV = SW.match(/golf-sg-v\d+/)[0];
  await page.waitForFunction(v => caches.keys().then(k => !k.includes('pinhigh-ocr-v1') && k.includes(v)), SWV, { timeout: 15000 });
  const cached = await page.evaluate(v => caches.open(v).then(c => c.keys()).then(k => k.map(r => r.url)), SWV);
  assert.ok(cached.length > 10 && !cached.some(u => /scan\.js|tesseract/.test(u)), 'offline cache has no scanner'); assert.ok(!loaded.some(u => /scan\.js|tesseract/.test(u)), 'scanner never loaded');
  assert.strictEqual(await page.evaluate(() => typeof window.SCAN), 'undefined');
  // New round sheet, no saved courses: name box + Type in, no scan button or photo input
  await page.click('#plusbtn'); await page.click('[data-act="newform"]'); await page.waitForSelector('#ntype');
  assert.strictEqual(await page.$('#crspick'), null, 'no saved courses yet: no dropdown, just the name box'); assert.ok(await page.$('#course'));
  assert.match(await page.textContent('#ntype'), /Type in par & yardages/);
  const noScan = async () => { assert.strictEqual(await page.$('[data-act="scan"], [data-act="scanarch"], #cardfile, input[type=file][accept^="image"], .halfbar, .halfsteps'), null, 'no scan UI');
    assert.doesNotMatch(await page.innerText('#app'), /scan|photo|camera/i); };
  await noScan();
  await page.fill('#course', 'Pebble Creek'); await page.click('[data-act="cardmanual"]'); await page.waitForSelector('.revgrid'); await noScan();
  assert.strictEqual((await page.textContent('.topbar .title b')).trim(), 'Add a course'); assert.strictEqual(await page.$('[data-act="cardretry"]'), null);
  assert.strictEqual(await page.$eval('[data-cf="name"]', e => e.value), 'Pebble Creek');
  await page.click('#teequick [data-v="White"]');
  for (let i = 0; i < 18; i++) { await page.fill(`[data-cf="par"][data-i="${i}"]`, String(TRUE.par[i])); await page.fill(`[data-cf="yd"][data-i="${i}"]`, String(TRUE.white[i])); }
  assert.match(await page.textContent('#revtot'), /Par 72 · 6,491 yd/);
  // second tee box on the same card
  await page.click('[data-act="cardaddtee"]'); await page.fill('[data-cf="tee"]', 'Truckee');
  for (let i = 0; i < 9; i++) await page.fill(`[data-cf="yd"][data-i="${i}"]`, String(TRUE.blue[i]));
  await page.click('.revtees [data-i="0"]'); await page.evaluate(() => window.scrollTo(0, 0)); await page.evaluate(() => document.activeElement && document.activeElement.blur());
  await shot('manual-course-entry');
  await page.click('[data-act="cardsave"]'); await page.waitForSelector('#ntees');
  assert.match(await page.textContent('#crspicked'), /Pebble Creek/); assert.deepStrictEqual(await page.$$eval('#ntees .ntee:not(.naddtee)', e => e.map(x => (x.querySelector('.tname') || x.childNodes[0]).textContent.trim())), ['White', 'Truckee']);
  await page.click('#ntees [data-v="White"]'); await page.click('[data-act="new"]'); await page.waitForSelector('.holecard');
  assert.strictEqual(await page.$eval('input[data-row="0"]', e => e.value), String(TRUE.white[0])); assert.strictEqual(await page.textContent('.par button.sel'), '4');
  const rd = await page.evaluate(() => JSON.parse(localStorage.getItem('golfsg.rounds.v1'))[0]); assert.strictEqual(rd.tee, 'White'); assert.strictEqual(rd.course, 'Pebble Creek');
  assert.deepStrictEqual(rd.holes.map(x => x.par), TRUE.par);
  // Rename tees or fix numbers from the New round sheet still opens the editor
  await page.click('[data-act="home"]'); await page.click('#plusbtn'); await page.click('[data-act="newform"]'); await page.click('#crspick'); await page.click('#crslist [data-act="ncourse"]');
  await page.click('[data-act="nedit"]'); await page.waitForSelector('.revgrid'); assert.strictEqual((await page.textContent('.topbar .title b')).trim(), 'Edit course'); await noScan();
  await page.fill('[data-cf="tee"]', 'White Tees'); await page.click('[data-act="cardsave"]'); await page.waitForSelector('#ntees'); assert.match(await page.textContent('#ntees .sel'), /White Tees/);
  await page.click('.sheet-back', { position: { x: 30, y: 40 } });
  // Archive › Courses: Add a course (typed in), edit (rename) and delete
  await page.click('#plusbtn'); await page.click('#plusmenu [data-act="archive"]'); await noScan(); await page.click('[data-act="courses"]'); await page.waitForSelector('.crsrow'); await noScan();
  await page.click('[data-act="cardedit"]'); await page.fill('[data-cf="name"]', 'Pebble Creek GC'); await page.click('[data-act="cardsave"]'); await page.waitForSelector('.crsrow');
  assert.match(await page.textContent('.crsrow'), /Pebble Creek GC/);
  assert.match(await page.textContent('[data-act="crsadd"]'), /Add a course/); await page.click('[data-act="crsadd"]'); await page.waitForSelector('.revgrid'); await noScan();
  await page.fill('[data-cf="name"]', 'Par 3 Nine'); await page.fill('[data-cf="tee"]', 'Short');
  for (let i = 0; i < 9; i++) { await page.fill(`[data-cf="par"][data-i="${i}"]`, '3'); await page.fill(`[data-cf="yd"][data-i="${i}"]`, String(90 + i * 10)); }
  assert.match(await page.textContent('#revtot'), /Par 27 · 1,170 yd/); await page.click('[data-act="cardsave"]'); await page.waitForSelector('.crsrow >> nth=1');
  await page.click('.crsrow:has-text("Par 3 Nine") [data-act="coursedel"]'); await page.waitForFunction(() => document.querySelectorAll('.crsrow').length === 1);
  // backup file carries courses; restoring a backup brings its courses in
  const bkJson = await page.evaluate(() => JSON.stringify(SG.makeBackup([], null, 'Quincy', JSON.parse(localStorage.getItem('golfsg.courses.v1')))));
  assert.strictEqual(JSON.parse(bkJson).courses[0].name, 'Pebble Creek GC');
  const other = JSON.stringify(SG.makeBackup([], null, 'Quincy', [{ id: 'cX', name: 'Lakeridge', pars: TRUE.par, tees: [{ name: 'Blue', yards: TRUE.blue }], updated: '2026-01-01T00:00:00Z' }]));
  await page.click('[data-act="archive"]'); await page.setInputFiles('#restorefile', { name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(other) });
  await page.waitForSelector('[data-act="rpgo"]'); await page.click('[data-act="rpgo"]'); await page.waitForSelector('#notice'); assert.match(await page.textContent('#notice'), /1 course/);
  assert.match(await page.textContent('.crsbtn'), /2 saved/);
  // offline: the app (and typing a course in) works with no network
  await ctx.setOffline(true); await page.reload(); await page.waitForSelector('#plusbtn');
  await page.click('#plusbtn'); await page.click('[data-act="newform"]'); await page.click('#crspick'); assert.strictEqual(await page.locator('#crslist [data-act="ncourse"]').count(), 2); await page.click('[data-act="crsnew"]');
  await page.click('[data-act="cardmanual"]'); await page.waitForSelector('.revgrid');
  assert.deepStrictEqual(outside, [], 'no outside network requests'); assert.deepStrictEqual(errors, []);
  console.log('COURSES (TYPED IN) OK'); await b.close(); srv.kill();
})().catch(e => { console.error(e); process.exit(1); });
