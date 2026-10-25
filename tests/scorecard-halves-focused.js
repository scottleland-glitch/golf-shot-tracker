// Scorecard in two close photos (v86): front 9 + back 9 read separately and joined into one 18-hole card.
// (1) pure: halfCard / mergeHalves / autoLinks / halfFromCourse, incl. saved real Tesseract output of the synthetic half-card photos;
// (2) phone-size browser flow with the on-device scanner, network blocked: front → back → pick tee → check → save → prefill,
//     re-scan one half (fixes on the other half kept), an unreadable half, skipping a half, matching tees whose names disagree; screenshots.
const assert = require('assert'); const C = require('../courses.js');
const CARD = require('./fixtures/card-data.js'); const TRUE = {}; CARD.rows.forEach(r => { TRUE[r.label.toLowerCase()] = r.vals; });
const TEES = ['black', 'blue', 'white', 'sage', 'manzanita'];
let n = 0; const eq = (a, b, m) => { assert.deepStrictEqual(a, b, m); n++; }; const ok = (v, m) => { assert.ok(v, m); n++; };
const F9 = 'Pebble Creek GC\nHOLE 1 2 3 4 5 6 7 8 9 OUT\n' + ['Black', 'Blue', 'White', 'PAR', 'Sage', 'Manzanita'].map(k => k + ' ' + TRUE[k.toLowerCase()].slice(0, 9).join(' ') + ' ' + C.sum(TRUE[k.toLowerCase()].slice(0, 9))).join('\n') + '\nHandicap ' + TRUE.handicap.slice(0, 9).join(' ');
const B9 = (named) => '10 11 12 13 14 15 16 17 18 IN TOT\n' + ['Black', 'Blue', 'White', 'PAR', 'Sage', 'Manzanita'].map(k => { const v = TRUE[k.toLowerCase()]; return (named || k === 'PAR' ? (named && named[k] || k) + ' ' : '') + v.slice(9).join(' ') + ' ' + C.sum(v.slice(9)) + ' ' + C.sum(v); }).join('\n');
const f = C.halfCard(C.parseCard(F9), 'f'), b = C.halfCard(C.parseCard(B9()), 'b');
eq(f.tees.map(t => t.name), ['Black', 'Blue', 'White', 'Sage', 'Manzanita'], 'front: tees in card order'); eq(f.pars, TRUE.par.slice(0, 9)); eq(f.hcp, TRUE.handicap.slice(0, 9)); eq([f.whole, f.empty], [undefined, false]);
eq(b.tees.map(t => t.unnamed), [true, true, true, true, true], 'back close-up with the names cut off'); eq(b.tees[3].yards, TRUE.sage.slice(9)); eq(b.pars, TRUE.par.slice(9), 'unlabelled par row still found');
let m = C.mergeHalves(f, b);
TEES.forEach(k => eq(m.tees.find(t => t.name.toLowerCase() === k).yards, TRUE[k], k + ' joined by card order')); eq(m.pars, TRUE.par); eq(m.ask, []);
eq(m.hcp.slice(0, 9), TRUE.handicap.slice(0, 9)); eq(m.hcp.slice(9), Array(9).fill(null));
// back photo with its own names (one OCR slip, rows read in a different order) still matches by name
const bn = C.halfCard(C.parseCard(B9({ Sage: 'Sag3', White: 'Wnite' })), 'b'); bn.tees.reverse();
m = C.mergeHalves(f, bn); TEES.forEach(k => eq(m.tees.find(t => t.name.toLowerCase() === k).yards, TRUE[k], k + ' by name')); eq(m.ask, []);
// a name on the back that disagrees with the front (Gold vs Blue) → ask, with the order-based guess preselected
const bg = C.halfCard(C.parseCard(B9({ Blue: 'Gold' })), 'b'); m = C.mergeHalves(f, bg); eq(m.ask, [1]); eq(m.links[1], 1, 'guess: same row');
eq(C.mergeHalves(f, bg, Object.assign({}, m.links, { 1: -1 })).tees.map(t => t.name).sort(), ['Black', 'Blue', 'Gold', 'Manzanita', 'Sage', 'White'], 'kept apart when told');
// fewer rows read on the back than the front → ask
const b4 = Object.assign({}, b, { tees: b.tees.filter((t, i) => i !== 1) }); eq(C.mergeHalves(f, b4).ask.length, 4);
// one half skipped or not read
m = C.mergeHalves(f, null); eq(m.tees.length, 5); eq(m.tees[0].yards.slice(9), Array(9).fill(null)); eq(m.pars.slice(9), Array(9).fill(null));
m = C.mergeHalves(null, b); eq(m.tees.map(t => t.name), ['Tee 1', 'Tee 2', 'Tee 3', 'Tee 4', 'Tee 5']); eq(m.tees[0].yards.slice(0, 9), Array(9).fill(null)); eq(m.tees[0].yards.slice(9), TRUE.black.slice(9));
eq(C.halfCard(C.parseCard('nothing here'), 'f').empty, true); eq(C.halfCard({ tees: [], pars: null }, 'b').empty, true);
eq(C.fromScan(C.mergeHalves(null, null), '').tees.length, 1, 'both skipped: blank card to type in');
// a whole-card photo on the front step is used as is
const whole = C.halfCard(C.parseCard('HOLE 1 2 3 4 5 6 7 8 9 OUT 10 11 12 13 14 15 16 17 18 IN TOT\nBlack ' + TRUE.black.slice(0, 9).join(' ') + ' 3428 ' + TRUE.black.slice(9).join(' ') + ' 3454 6882\nPAR ' + TRUE.par.slice(0, 9).join(' ') + ' 36 ' + TRUE.par.slice(9).join(' ') + ' 36 72'), 'f');
eq(whole.whole, true); eq(whole.card.tees[0].yards, TRUE.black);
// re-scan one half: the other half comes from the card being checked (fixes kept)
const course = C.fromScan(C.mergeHalves(f, b), 'Pebble'); course.tees.find(t => t.name === 'Sage').yards[12] = 999; const keepB = C.halfFromCourse(course, 'b');
m = C.mergeHalves(f, keepB); eq(m.tees.find(t => t.name === 'Sage').yards[12], 999); eq(m.ask, []); eq(m.pars, TRUE.par);
eq(['Ps', 'J', 'Tee 3'].map(nm => C.halfCard({ tees: [{ name: nm, yards: TRUE.blue.slice(0, 9) }] }, 'f').tees[0].unnamed), [true, true, true], 'OCR scraps are not tee names');
ok(C.sameName('Sag3', 'Sage') && C.sameName('manzanta', 'Manzanita') && !C.sameName('Gold', 'Blue') && !C.sameName('Red', 'Rex'), 'near-same names');
eq(C.snapName('Jpiack'), 'Black'); eq(C.snapName('Jpue'), 'Blue');
// saved real Tesseract output of the close-up half photos (tilted, blurred, JPEG): accuracy of the joined card
const rd = nm => { const F = require('./fixtures/ocr-half-' + nm + '.json'); return C.readCard(F.text, F.lines); };
const score = card => { let g = 0, t = 0; ['par'].concat(TEES).forEach(k => { const got = k === 'par' ? card.pars : (card.tees.find(x => x.name.toLowerCase() === k) || {}).yards; TRUE[k].forEach((v, i) => { t++; if (got && got[i] === v) g++; }); }); return g / t; };
const hm = C.mergeHalves(C.halfCard(rd('front-photo'), 'f'), C.halfCard(rd('back-photo'), 'b')); const sc = score(hm);
console.log('  two close photos (saved OCR): ' + (sc * 100).toFixed(1) + '% of cells right (' + hm.tees.map(t => t.name).join(', ') + ')'); ok(sc >= 0.95, 'half photos accuracy ' + sc);
console.log('HALF SCAN PARSER OK – ' + n + ' checks');
if (process.env.UNIT_ONLY) process.exit(0);

const { chromium } = require('playwright-core'); const { spawn } = require('child_process');
const make = require('./fixtures/make-half.js'); const PORT = 8814, BASE = `http://127.0.0.1:${PORT}/`, OUT = '/workspace/golf-app/screenshots/';
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: '/workspace/golf-app', stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1500)); const errors = [], outside = [];
  const br = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await br.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await ctx.route('**/*', route => { const u = route.request().url(); if (u.startsWith(BASE) || u.startsWith('data:') || u.startsWith('blob:')) return route.continue(); outside.push(u); return route.abort(); });
  const page = await ctx.newPage(); global.__pg = page; page.on('pageerror', e => errors.push(String(e))); page.on('dialog', d => d.accept());
  const shot = async name => { await page.evaluate(() => { const t = document.getElementById('toast'); if (t) t.className = ''; window.scrollTo(0, 0); }); await page.waitForTimeout(300); await page.screenshot({ path: OUT + name + '.png' }); };
  await page.goto(BASE + '?x=' + Date.now()); await page.evaluate(() => { localStorage.clear(); localStorage.setItem('golfsg.player.v1', 'Quincy'); }); await page.reload();
  const img = async cfg => Buffer.from((await page.evaluate(`(${make})(${JSON.stringify(Object.assign({ card: CARD }, cfg))})`)).split(',')[1], 'base64');
  const front = await img({ half: 'f', photo: true }), back = await img({ half: 'b', labels: false, photo: true });
  if (process.env.SAVE) { require('fs').writeFileSync('/tmp/t-front.jpg', front); require('fs').writeFileSync('/tmp/t-back.jpg', back); }
  const gold = await img({ half: 'b', card: { name: CARD.name, rows: CARD.rows.map(r => Object.assign({}, r, { label: r.label === 'Blue' ? 'Gold' : r.label })) } });
  const blank = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 1200; c.height = 800; const x = c.getContext('2d'); x.fillStyle = '#f4f1e8'; x.fillRect(0, 0, 1200, 800); return c.toDataURL('image/png'); });
  const up = async (buf, nm) => { await page.setInputFiles('#cardfile', { name: nm, mimeType: nm.endsWith('png') ? 'image/png' : 'image/jpeg', buffer: Buffer.isBuffer(buf) ? buf : Buffer.from(buf.split(',')[1], 'base64') }); };
  const grid = () => page.evaluate(() => ({ tee: document.querySelector('[data-cf="tee"]').value, name: document.querySelector('[data-cf="name"]').value,
    par: [...document.querySelectorAll('[data-cf="par"]')].map(e => e.value === '' ? null : +e.value), yd: [...document.querySelectorAll('[data-cf="yd"]')].map(e => e.value === '' ? null : +e.value) }));
  const cells = (a, b2) => a.filter((v, i) => v === b2[i]).length;
  // 1) front 9
  await page.click('#plusbtn'); await page.click('[data-act="newform"]'); await page.click('[data-act="scan"]'); await page.waitForSelector('label[for="cardfile"]');
  assert.match(await page.textContent('.topbar .title'), /Scan front 9/); assert.match(await page.textContent('#halfhint'), /Holes 1–9.*Get close so the numbers fill the screen/i);
  assert.match(await page.textContent('label[for="cardfile"]'), /Scan front 9/); assert.strictEqual(await page.locator('.hstep.on[data-h="f"]').count(), 1);
  await page.waitForFunction(() => window.SCAN && SCAN.ready(), null, { timeout: 60000 }); await shot('scorecard-front9');
  await up(front, 'front.jpg');
  // 2) back 9
  await page.waitForSelector('#halfhint:has-text("10–18")', { timeout: 60000 }); assert.match(await page.textContent('label[for="cardfile"]'), /Scan back 9/);
  assert.strictEqual(await page.locator('.hstep.done[data-h="f"]').count(), 1, 'front 9 ticked'); await shot('scorecard-back9');
  // back button from the back-9 step goes to the front-9 step, not out of the scan
  await page.click('[data-act="cardback"]'); await page.waitForSelector('#halfhint:has-text("1–9")'); await up(front, 'front.jpg');
  await page.waitForSelector('#halfhint:has-text("10–18")', { timeout: 60000 });
  await up(back, 'back.jpg'); await page.waitForSelector('.teebtn', { timeout: 60000 });
  const names = await page.$$eval('.teebtn b', e => e.map(x => x.textContent)); console.log('  tees after front + back photos: ' + names.join(', '));
  eq(names.slice().sort(), ['Black', 'Blue', 'White', 'Sage', 'Manzanita'].sort());
  ok(!(await page.textContent('.teepick')).includes('only'), 'every tee has both halves');
  const all = await page.evaluate(() => JSON.parse(JSON.stringify(window.__golf.card().course)));
  const s = score(all); console.log('  joined card accuracy in the app: ' + (s * 100).toFixed(1) + '%'); ok(s >= 0.95, 'app half accuracy ' + s);
  ok(all.name === 'Pebble Creek GC', 'course name from the front photo: ' + all.name);
  await page.click('.teebtn:has-text("Sage")'); await page.waitForSelector('.revgrid'); let g = await grid();
  eq(g.par, TRUE.par); ok(cells(g.yd, TRUE.sage) >= 17, 'Sage 1-18 in one grid'); ok(await page.locator('.halfbar [data-act="cardre"]').count() === 2, 're-scan either half');
  await shot('scorecard-review-merged');
  // 3) fix a back-9 number, then re-scan the front: the fix stays
  await page.fill('[data-cf="yd"][data-i="12"]', '346'); await page.fill('[data-cf="name"]', 'Pebble Creek');
  await page.click('.halfbar [data-h="b"]'); await page.waitForSelector('#halfhint:has-text("10–18")'); await page.click('[data-act="cardback"]'); await page.waitForSelector('.revgrid'); eq((await grid()).yd[12], 346, 'back out of a re-scan: nothing changed');
  await page.click('.halfbar [data-h="f"]'); await page.waitForSelector('#halfhint:has-text("1–9")'); assert.strictEqual(await page.$('[data-act="cardmanual"]'), null);
  await up(front, 'front2.jpg'); await page.waitForSelector('.teebtn', { timeout: 60000 }); await page.click('.teebtn:has-text("Sage")'); await page.waitForSelector('.revgrid');
  g = await grid(); eq([g.yd[12], g.name], [346, 'Pebble Creek'], 'back-9 fix and typed name kept'); ok(cells(g.yd.slice(0, 9), TRUE.sage.slice(0, 9)) >= 8);
  // 4) save → prefill for every hole
  await page.click('[data-act="cardsave"]'); await page.waitForSelector('#ncourses'); assert.match(await page.textContent('#ntees .sel'), /Sage/);
  await page.click('[data-act="new"]'); await page.waitForSelector('.holecard');
  const rd2 = await page.evaluate(() => JSON.parse(localStorage.getItem('golfsg.rounds.v1'))[0]); eq(rd2.holes.map(x => x.par), TRUE.par); eq(rd2.holes[12].rows[0].dist, 346); eq(rd2.tee, 'Sage');
  // 5) unreadable front photo → message, skip it, back photo alone (names cut off) → typed-in front
  await page.click('[data-act="home"]'); await page.click('#archivepill'); await page.click('[data-act="courses"]'); await page.click('[data-act="scanarch"]'); await page.waitForSelector('label[for="cardfile"]');
  await up(blank, 'blank.png'); await page.waitForSelector('#halfwarn', { timeout: 60000 }); assert.match(await page.textContent('#halfwarn'), /Couldn’t read the front 9/); await shot('scorecard-front9-unread');
  await page.click('[data-act="cardskip"]'); await page.waitForSelector('#halfhint:has-text("10–18")'); assert.strictEqual(await page.locator('.hstep.skip[data-h="f"]').count(), 1);
  await up(back, 'back.jpg'); await page.waitForSelector('.teebtn', { timeout: 60000 }); assert.match(await page.textContent('.teepick'), /back 9 only/);
  await page.click('.teebtn >> nth=0'); await page.waitForSelector('.revgrid'); g = await grid(); eq(g.yd.slice(0, 9), Array(9).fill(null)); ok(cells(g.yd.slice(9), TRUE.black.slice(9)) >= 8);
  assert.match(await page.textContent('#revmiss'), /9 holes to fill/); assert.match(await page.textContent('.halfbar [data-h="f"]'), /typed in/);
  // 6) back photo whose tee name disagrees with the front (Gold vs Blue) → match screen
  await page.click('[data-act="cardback"]'); await page.click('[data-act="scanarch"]'); await page.waitForSelector('#halfhint:has-text("1–9")'); await up(front, 'front.jpg'); await page.waitForSelector('#halfhint:has-text("10–18")', { timeout: 60000 });
  await up(gold, 'gold.png'); await page.waitForSelector('.matchcard', { timeout: 60000 }); assert.match(await page.textContent('.matchrow'), /Gold/);
  assert.match(await page.textContent('.matchrow .frostchip.sel'), /Blue/, 'guess preselected'); await shot('scorecard-match-tees');
  await page.click('.matchrow [data-i="-1"]'); assert.match(await page.textContent('.matchrow .frostchip.sel'), /Its own tee/);
  await page.click('.matchrow .frostchip:has-text("Blue")'); await page.click('[data-act="cardlinked"]'); await page.waitForSelector('.teebtn');
  const n2 = await page.$$eval('.teebtn b', e => e.map(x => x.textContent)); ok(n2.includes('Blue') && !n2.includes('Gold') && n2.length === 5, 'Gold rows joined to Blue: ' + n2);
  // 7) skip both → blank card to type
  await page.click('[data-act="cardretry"]'); await page.click('[data-act="cardskip"]'); await page.click('[data-act="cardskip"]'); await page.waitForSelector('.revgrid'); assert.match(await page.textContent('#revmiss'), /18 holes to fill/);
  eq(outside, [], 'no outside network requests'); eq(errors, []);
  console.log('HALF SCAN UI OK – ' + n + ' checks'); await br.close(); srv.kill();
})().catch(async e => { console.error(e); try { await global.__pg.screenshot({ path: "/tmp/halves-fail.png" }); console.error(await global.__pg.evaluate(() => JSON.stringify({ st: window.__golf.card() && window.__golf.card().stage, h: window.__golf.card() && window.__golf.card().halves }).slice(0, 1500))); } catch (x) {} process.exit(1); });
