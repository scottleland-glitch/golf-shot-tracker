// Scorecard scan + saved courses: (1) row parser on OCR text (incl. real Tesseract output saved from the synthetic cards) and course helpers,
// (2) phone-size browser flow with the real on-device scanner, network blocked, on a synthetic scorecard image + screenshots.
const assert = require('assert'); const C = require('../courses.js'); const SG = require('../sg.js'); const V = require('../voice.js');
const CARD = require('./fixtures/card-data.js'); const TRUE = {}; CARD.rows.forEach(r => { TRUE[r.label.toLowerCase()] = r.vals; });
let n = 0; const eq = (a, b, m) => { assert.deepStrictEqual(a, b, m); n++; };
const SAMPLE = `Pebble Creek Golf Course
HOLE 1 2 3 4 5 6 7 8 9 OUT 10 11 12 13 14 15 16 17 18 IN TOT
Black 72.4/131 412 385 178 520 401 365 192 545 430 3428 405 168 512 390 377 210 533 418 441 3454 6882
WHITE 70.1/126 390 360 160 498 380 345 170 520 405 3228 385 150 490 370 355 188 510 395 420 3263 6491
Sage | 361 | 331 | 141 | 47O | 352 | 320 | 15l | 495 | 380 | 3001 | 360 | 132 | 466 | 345 | 330 | 165 | 487 | 371 | 398 | 3054 | 6055
PAR 4 4 3 5 4 4 3 5 4 36 4 3 5 4 4 3 5 4 4 36 72
HANDICAP 5 11 17 1 7 13 15 3 9 6 18 2 10 12 16 4 14 8
Manzanita Tees 300 280 110 410 300 270 120 430 320 2540 300 100 410 290 280 130 420 310 330 2570 5110`;
let r = C.parseCard(SAMPLE);
eq(r.tees.map(t => t.name), ['Black', 'White', 'Sage', 'Manzanita'], 'tee names from labels (rating/slope dropped, caps fixed, "Tees" dropped)');
eq(r.tees[0].yards, TRUE.black); eq(r.tees[1].yards, TRUE.white); eq(r.tees[2].yards, TRUE.sage, 'O→0, l→1, | borders'); eq(r.tees[3].yards, TRUE.manzanita);
assert.ok(r.tees.every(t => t.checked === 2), 'OUT and IN totals confirm both nines'); n++;
eq(r.pars, TRUE.par); eq(r.hcp, TRUE.handicap); eq(C.guessName(SAMPLE), 'Pebble Creek Golf Course');
// front and back nine printed as two tables
r = C.parseCard(`Hole 1 2 3 4 5 6 7 8 9 Out\nRed 310 290 120 400 300 280 130 420 330 2580\nGold 350 330 150 450 340 320 160 470 360 2930\nPar 4 4 3 5 4 4 3 5 4 36\nHole 10 11 12 13 14 15 16 17 18 In Tot\nRed 300 110 390 290 270 140 410 320 330 2560 5140\nGold 340 140 440 330 310 170 460 360 370 2920 5850\nPar 4 3 5 4 4 3 5 4 4 36 72`);
eq(r.tees.map(t => t.name), ['Gold', 'Red']); eq(r.tees[1].yards, [310, 290, 120, 400, 300, 280, 130, 420, 330, 300, 110, 390, 290, 270, 140, 410, 320, 330]); eq(r.pars, TRUE.par);
// unreadable number before a confirmed back nine stays an empty hole; rating split from slope is skipped
let h = C.holesOf(C.tokens('Blue 401 372 x9 509 392 356 183 533 418 3333 396 160 501 381 366 199 522 407 430 3362').toks, 50, 700);
eq(h.holes.length, 18); eq(h.holes.slice(9), [396, 160, 501, 381, 366, 199, 522, 407, 430]);
h = C.holesOf(C.tokens('Gold 71.8 / 129 350 330 150 450 340 320 160 470 360 340 140 440 330 310 170 460 360 370').toks, 50, 700); eq(h.holes[0], 350);
eq(['Jbiack', 'Wnite', 'Manzanta', 'Sage', 'Red', 'Bluee'].map(C.snapName), ['Black', 'White', 'Manzanita', 'Sage', 'Red', 'Blue']);
eq(C.cleanName('J Manzanita'), 'Manzanita'); eq(C.cleanName('White Tt Too'), 'White'); eq(C.cleanName("Men's Blue Tees"), 'Blue');
eq(C.parseCard('nothing useful here\n12 cats').tees, []);
// real Tesseract output from tests/fixtures (synthetic card, clean scan and phone-photo version)
const score = card => { let ok = 0, tot = 0; for (const [k, vals] of Object.entries(TRUE)) { const got = k === 'par' ? card.pars : k === 'handicap' ? card.hcp : (card.tees.find(t => t.name.toLowerCase() === k) || card.tees.find(t => t.yards.filter((v, i) => v === vals[i]).length >= 12 && !Object.keys(TRUE).includes(t.name.toLowerCase())) || {}).yards; vals.forEach((v, i) => { tot++; if (got && got[i] === v) ok++; }); } return ok / tot; };
for (const f of ['clean', 'app', 'photo', 'app-photo']) { const F = require('./fixtures/ocr-' + f + '.json'); const c = C.readCard(F.text, F.lines); const s = score(c);
  console.log(`  saved OCR ${f}: ${(s * 100).toFixed(1)}% of cells right (${c.tees.map(t => t.name).join(', ')})`); assert.ok(s >= (f === 'photo' ? 0.8 : f === 'app-photo' ? 0.65 : 0.97), f + ' accuracy ' + s); n++; }
// courses: from a scan, stored shape, round prefill, restore merge, backup file
const scan = C.parseCard(SAMPLE), course = C.clean(C.fromScan(scan, 'Pebble Creek'));
eq(course.tees.length, 4); eq(course.pars, TRUE.par); eq(course.hcp, TRUE.handicap); assert.ok(/^c\d+/.test(course.id)); n++;
const holes = Array.from({ length: 18 }, () => ({ par: 4, finished: false, rows: [{ loc: 'tee', dist: '', dir: '', pen: false }] }));
C.prefill(holes, course, 'White'); eq(holes.map(x => x.par), TRUE.par); eq(holes.map(x => x.rows[0].dist), TRUE.white);
const nine = C.clean({ id: 'c9', name: 'Nine', pars: [3, 4, 5], tees: [{ name: 'Only', yards: [150, 380] }] }); eq(nine.pars.length, 18); eq(nine.tees[0].yards[2], null);
const holes9 = Array.from({ length: 18 }, () => ({ par: 4, rows: [{ loc: 'tee', dist: '', dir: '', pen: false }] })); C.prefill(holes9, nine, 'Only'); eq([holes9[0].par, holes9[0].rows[0].dist, holes9[2].par, holes9[2].rows[0].dist, holes9[5].par], [3, 150, 5, '', 4]);
let M = C.mergeCourses([course], [course, nine]); eq([M.added, M.updated, M.courses.length], [1, 0, 2]);
const newer = Object.assign({}, course, { name: 'Pebble Creek GC', updated: '2999-01-01T00:00:00Z' }); M = C.mergeCourses([course], [newer]); eq([M.updated, M.courses[0].name], [1, 'Pebble Creek GC']);
const old = Object.assign({}, course, { name: 'Old', updated: '2000-01-01T00:00:00Z' }); M = C.mergeCourses([course], [old]); eq(M.courses[0].name, course.name, 'older copy does not overwrite');
const bk = SG.makeBackup([], null, 'Quincy', [course]); eq(bk.courses.length, 1); const pb = SG.parseBackup(JSON.stringify(bk)); eq([pb.rounds.length, pb.courses.length, !!pb.error], [0, 1, false]);
eq(SG.makeBackup([], null, 'Q').courses, undefined, 'no courses key when none saved');
// voice (v81 model): with a prefilled tee distance, "driver 140 fairway" keeps the tee yardage, puts Driver on shot 1 and fills shot 2 (fairway, 140 to the pin)
let a = V.apply({ par: 4, rows: [{ loc: 'tee', dist: 386, dir: '', pen: false }] }, V.parse('driver 140 fairway')); eq([a.rows.length, a.rows[0].dist, a.rows[0].club, a.rows[1].loc, a.rows[1].dist], [2, 386, 'Driver', 'fairway', 140]);
a = V.apply({ par: 4, rows: [{ loc: 'tee', dist: 386, dir: '', pen: false }] }, V.parse('tee shot driver')); eq([a.rows.length, a.rows[0].dist, a.rows[0].club], [1, 386, 'Driver']);
console.log('SCORECARD PARSER OK – ' + n + ' checks');
if (process.env.UNIT_ONLY) process.exit(0);

const { chromium } = require('playwright-core'); const { spawn } = require('child_process');
const make = require('./fixtures/make-card.js'); const PORT = 8813, BASE = `http://127.0.0.1:${PORT}/`, OUT = '/workspace/golf-app/screenshots/';
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: '/workspace/golf-app', stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1500)); const errors = [], outside = [];
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await ctx.route('**/*', route => { const u = route.request().url(); if (u.startsWith(BASE) || u.startsWith('data:') || u.startsWith('blob:')) return route.continue(); outside.push(u); return route.abort(); }); // free + on-device: nothing leaves the phone
  const page = await ctx.newPage(); page.on('pageerror', e => errors.push(String(e))); page.on('dialog', d => d.accept());
  const clean = async () => { await page.evaluate(() => { const t = document.getElementById('toast'); if (t) t.className = ''; }); await page.waitForTimeout(300); };
  const shot = async name => { await clean(); await page.screenshot({ path: OUT + name + '.png' }); };
  await page.goto(BASE + '?x=' + Date.now()); await page.evaluate(() => { localStorage.clear(); localStorage.setItem('golfsg.player.v1', 'Quincy'); });
  await page.reload(); await page.evaluate(() => navigator.serviceWorker.ready); await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 }).catch(() => {});
  if (!(await page.evaluate(() => !!navigator.serviceWorker.controller))) { await page.reload(); await page.waitForFunction(() => !!navigator.serviceWorker.controller); }
  const imgs = {}; for (const photo of [false, true]) { const url = await page.evaluate(`(${make})(${JSON.stringify({ photo, card: CARD })})`); imgs[photo ? 'photo' : 'clean'] = Buffer.from(url.split(',')[1], 'base64'); }
  // New round sheet: scan or type a card
  await page.click('#plusbtn'); await page.click('[data-act="newform"]'); await page.waitForSelector('[data-act="scan"]');
  assert.strictEqual(await page.$('#ncourses'), null, 'no saved courses yet'); await shot('scorecard-start');
  await page.click('[data-act="scan"]'); await page.waitForSelector('label[for="cardfile"]'); await shot('scorecard-scan');
  const t0 = Date.now(); await page.setInputFiles('#cardfile', { name: 'card.png', mimeType: 'image/png', buffer: imgs.clean });
  await page.waitForSelector('.teebtn', { timeout: 120000 }); const secs = (Date.now() - t0) / 1000;
  const teeNames = await page.$$eval('.teebtn b', e => e.map(x => x.textContent)); console.log('  scan (clean card): ' + secs.toFixed(1) + ' s, tees ' + teeNames.join(', '));
  ['Black', 'Blue', 'White', 'Sage', 'Manzanita'].forEach(t => assert.ok(teeNames.includes(t), 'tee button ' + t + ' in ' + teeNames));
  assert.match(await page.textContent('.cardnote'), /Par row found/); await shot('scorecard-pick-tee');
  await page.click('.teebtn:has-text("Sage")'); await page.waitForSelector('.revgrid');
  const grid = await page.evaluate(() => ({ name: document.querySelector('[data-cf="name"]').value, tee: document.querySelector('[data-cf="tee"]').value,
    par: [...document.querySelectorAll('[data-cf="par"]')].map(e => e.value === '' ? null : +e.value), yd: [...document.querySelectorAll('[data-cf="yd"]')].map(e => e.value === '' ? null : +e.value) }));
  assert.strictEqual(grid.name, 'Pebble Creek GC'); assert.strictEqual(grid.tee, 'Sage'); assert.deepStrictEqual(grid.par, TRUE.par); assert.deepStrictEqual(grid.yd, TRUE.sage);
  // whole-card accuracy from the app's own result
  const appCard = await page.evaluate(() => { const c = JSON.parse(JSON.stringify(window.__golf.card().course)); return { pars: c.pars, hcp: c.hcp, tees: c.tees }; });
  const sClean = score(appCard); if (process.env.DUMP) require('fs').writeFileSync(__dirname + '/fixtures/ocr-app.json', JSON.stringify(await page.evaluate(() => window.__golf.card().ocr))); console.log('  clean card accuracy: ' + (sClean * 100).toFixed(1) + '%'); assert.ok(sClean >= 0.97);
  // fix a misread in the grid and rename the course
  await page.fill('[data-cf="yd"][data-i="0"]', '36'); await page.fill('[data-cf="yd"][data-i="0"]', '361');
  await page.fill('[data-cf="name"]', 'Pebble Creek'); await page.evaluate(() => window.scrollTo(0, 0)); await shot('scorecard-review');
  await page.click('[data-act="cardsave"]'); await page.waitForSelector('#ncourses');
  assert.match(await page.textContent('#ncourses .sel'), /Pebble Creek/); assert.match(await page.textContent('#ntees .sel'), /Sage/);
  assert.strictEqual(await page.$eval('#course', e => e.value), 'Pebble Creek'); await shot('course-picker');
  await page.click('#ntees [data-v="White"]'); await page.click('[data-act="new"]'); await page.waitForSelector('.holecard');
  assert.strictEqual(await page.$eval('input[data-row="0"]', e => e.value), String(appCard.tees.find(t => t.name === 'White').yards[0]));
  assert.strictEqual(await page.textContent('.par button.sel'), '4');
  const rd = await page.evaluate(() => JSON.parse(localStorage.getItem('golfsg.rounds.v1'))[0]); assert.strictEqual(rd.tee, 'White'); assert.strictEqual(rd.course, 'Pebble Creek');
  assert.deepStrictEqual(rd.holes.map(x => x.par), TRUE.par);
  // Archive → Courses: edit (rename) and delete; manual entry with no photo
  await page.click('[data-act="home"]'); await page.click('#archivepill'); await page.click('[data-act="courses"]'); await page.waitForSelector('.crsrow');
  await page.click('[data-act="cardedit"]'); await page.fill('[data-cf="name"]', 'Pebble Creek GC'); await page.click('[data-act="cardsave"]'); await page.waitForSelector('.crsrow');
  assert.match(await page.textContent('.crsrow'), /Pebble Creek GC/);
  await page.click('[data-act="scanarch"]'); await page.click('[data-act="cardmanual"]'); await page.fill('[data-cf="name"]', 'Par 3 Nine'); await page.fill('[data-cf="tee"]', 'Short');
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
  // offline: reload with no network at all, scan the phone-photo version (scanner comes from the app's offline cache)
  await ctx.setOffline(true); await page.reload(); await page.waitForSelector('#plusbtn');
  await page.click('#plusbtn'); await page.click('[data-act="newform"]'); assert.strictEqual(await page.locator('#ncourses .ncchip').count(), 2);
  await page.click('[data-act="scan"]'); const t1 = Date.now(); await page.setInputFiles('#cardfile', { name: 'photo.jpg', mimeType: 'image/jpeg', buffer: imgs.photo });
  await page.waitForSelector('.teebtn, .revgrid', { timeout: 120000 }); const pCard = await page.evaluate(() => JSON.parse(JSON.stringify(window.__golf.card().course)));
  const sPhoto = score({ pars: pCard.pars, hcp: pCard.hcp, tees: pCard.tees }); if (process.env.DUMP) require('fs').writeFileSync(__dirname + '/fixtures/ocr-app-photo.json', JSON.stringify(await page.evaluate(() => window.__golf.card().ocr))); console.log('  offline photo scan: ' + ((Date.now() - t1) / 1000).toFixed(1) + ' s, accuracy ' + (sPhoto * 100).toFixed(1) + '%, tees ' + pCard.tees.map(t => t.name).join(', '));
  assert.ok(sPhoto >= 0.6, 'photo accuracy ' + sPhoto);
  const SWV = require('fs').readFileSync(__dirname + '/../sw.js', 'utf8').match(/golf-sg-v\d+/)[0];
  assert.ok(await page.evaluate(v => caches.keys().then(k => k.includes('pinhigh-ocr-v1') && k.includes(v)), SWV), 'scanner kept in its own cache');
  assert.deepStrictEqual(outside, [], 'no outside network requests'); assert.deepStrictEqual(errors, []);
  console.log('SCORECARD UI OK'); await b.close(); srv.kill();
})().catch(e => { console.error(e); process.exit(1); });
