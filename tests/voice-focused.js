// Voice entry: (1) parser + row mapping unit tests in Node, (2) hold-to-talk flow in a phone-size browser with a fake recognizer + screenshots.
// Model (v81, Scott's rule): a phrase describes the shot he's ABOUT to hit = one row:
//   [shot number] [club] [distance from the pin] [surface hit from] [miss direction = how the PREVIOUS shot missed] [penalty = previous shot]
// In the app, row k's Dir/P = how shot k (the row above) ended, so the miss and penalty land on the target row itself.
const assert = require('assert'); const V = require('../voice.js');
let n = 0; const P = (t, exp) => { const p = V.parse(t); for (const k of Object.keys(exp)) assert.deepStrictEqual(p[k], exp[k], `"${t}" → ${k}: got ${JSON.stringify(p[k])} want ${JSON.stringify(exp[k])} (${JSON.stringify(p)})`); n++; return p; };
// shot numbers
P('third shot green 25 feet short', { shot: 3, loc: 'green', dist: 25, distUnit: 'ft', dir: 'short', unknown: undefined });
P('shot 3 green 25 feet short', { shot: 3, dist: 25 }); P('shot three green', { shot: 3, loc: 'green' }); P('3rd green 25 feet', { shot: 3, dist: 25 });
P('second shot 7 iron 150 fairway', { shot: 2, club: '7i', dist: 150, loc: 'fairway' }); P('2nd shot rough 140 right', { shot: 2, loc: 'rough', dist: 140, dir: 'right' });
P('shot number 4 bunker 30', { shot: 4, loc: 'bunker', dist: 30 }); P('fourth putt', { shot: 4, putt: true, loc: 'green' });
P('tee shot driver 364', { shot: 1, club: 'Driver', dist: 364 }); P('7 iron 150 fairway', { shot: undefined, club: '7i', dist: 150 });
// clubs, spoken many ways
P('driver fairway', { club: 'Driver', loc: 'fairway' }); P('one wood', { club: 'Driver' });
P('three wood 230 fairway', { club: '3W', dist: 230, loc: 'fairway' }); P('5w 215 rough left', { club: '5W', dist: 215, loc: 'rough', dir: 'left' }); P('seven wood', { club: '7W' });
P('four hybrid one eighty rough right', { club: '4H', dist: 180, loc: 'rough', dir: 'right' }); P('for hybrid 190', { club: '4H', dist: 190 });
P('5 hybrid', { club: '5H' }); P('five iron', { club: '5i' }); P('6-iron', { club: '6i' }); P('ate iron 140', { club: '8i', dist: 140 });
P('pitching wedge 85 rough short', { club: 'PW', dist: 85, loc: 'rough', dir: 'short' }); P('gap wedge', { club: '52' }); P('lob wedge', { club: '60' });
P('sand wedge 30 from the bunker', { club: '56', dist: 30, loc: 'bunker' }); P('56 degree 40 bunker', { club: '56', dist: 40, loc: 'bunker' });
P('fifty six forty bunker', { club: '56', dist: 40, loc: 'bunker' }); P('fifty-six degree, forty yards, bunker', { club: '56', dist: 40, distUnit: 'yd', loc: 'bunker' });
P('54° 60 rough', { club: '54', dist: 60 });
// numbers as words, units
P('seven iron one fifty fairway left', { club: '7i', dist: 150, loc: 'fairway', dir: 'left' }); P('a hundred and twenty fairway', { dist: 120 });
P('one oh five rough', { dist: 105 }); P('green twenty feet', { loc: 'green', dist: 20, distUnit: 'ft' }); P('green ten yards', { dist: 10, distUnit: 'yd' });
// putting / holed
P('putt 12 feet in the hole', { putt: true, dist: 12, distUnit: 'ft', loc: 'holed' }); P('putt 2 feet made it', { putt: true, dist: 2, loc: 'holed' });
P('putt 20 feet long', { putt: true, loc: 'green', dist: 20, dir: 'long' }); P('in the hole', { loc: 'holed' }); P('made it', { loc: 'holed' });
P('lob wedge 20 chip in', { club: '60', dist: 20, loc: 'holed', holedx: true });
// penalties, layups, misses
P('penalty', { pen: true }); P('layup', { layup: true }); P('lay up', { layup: true }); P('drop hazard 140', { pen: true, loc: 'hazard', dist: 140 });
P('out of bounds', { loc: 'ob', pen: undefined }); P('driver OB', { loc: 'ob' }); P('trees right 180', { loc: 'trees', dir: 'right', dist: 180 });
P('deep rough left', { loc: 'deep', dir: 'left' }); P('rough 40 over the green', { loc: 'rough', dir: 'long', offGreen: true });
P('blah blah', { empty: true }); assert.ok(V.parse('green 20 feet banana').unknown.includes('banana')); n++;
const p2 = P('7 iron 150 green 20 feet left', { club: '7i', loc: 'green', dist: 20, distUnit: 'ft' }); assert.deepStrictEqual(p2.extra, [150]); n++;

const R = (dist, loc, x) => Object.assign({ dist, loc, dir: '', pen: false }, x || {});
const A = (rows, t, par) => V.apply({ par: par || 4, rows }, V.parse(t));
const D = (rows, t, par) => { const h = { par: par || 4, rows }, p = V.parse(t); return V.describe(h, V.apply(h, p), p); };
// Scott's live bug: row 3 had 8 yd and no location; the phrase must land on row 3, not a new row 4
const LIVE = () => [R(364, 'tee', { club: 'Driver' }), R(156, 'fairway', { dir: 'right', club: '7i' }), R(8, '')];
let a = A(LIVE(), 'third shot green 25 feet short');
assert.strictEqual(a.rows.length, 3, 'no new row 4'); assert.strictEqual(a.k, 2); assert.deepStrictEqual(a.rows[2], R(25, 'green', { dir: 'short' }));
assert.deepStrictEqual(a.rows.slice(0, 2), LIVE().slice(0, 2), 'rows 1-2 untouched'); n++;
assert.deepStrictEqual(D(LIVE(), 'third shot green 25 feet short'), [['Shot 3', 'Green · 25’'], ['Shot 2 missed', 'Short']]); n++;
// same phrase without the shot number: first row missing distance/location
a = A(LIVE(), 'green 25 feet short'); assert.strictEqual(a.rows.length, 3); assert.deepStrictEqual(a.rows[2], R(25, 'green', { dir: 'short' })); n++;
// explicit shot number overwrites an existing complete row (only the fields said)
a = A([R(364, 'tee'), R(156, 'fairway', { club: '7i' }), R(20, 'green')], 'shot 2 rough 150 left');
assert.deepStrictEqual(a.rows[1], R(150, 'rough', { club: '7i', dir: 'left' })); assert.strictEqual(a.rows.length, 3); assert.ok(/Replaces shot 2/.test(a.notes[0])); n++;
// explicit next number creates it; beyond next is refused
a = A([R(364, 'tee'), R(156, 'fairway')], 'third shot green 25 feet'); assert.strictEqual(a.rows.length, 3); assert.ok(a.created); assert.deepStrictEqual(a.rows[2], R(25, 'green')); n++;
a = A([R(364, 'tee'), R(156, 'fairway')], 'fifth shot green 10 feet'); assert.strictEqual(a.k, -1); assert.ok(/next shot is 3/.test(a.warn[0])); n++;
// no number, all rows complete → next new row
a = A([R(364, 'tee'), R(156, 'fairway')], '9 iron 140 rough right'); assert.strictEqual(a.k, 2); assert.deepStrictEqual(a.rows[2], R(140, 'rough', { club: '9i', dir: 'right' })); n++;
// empty row from Add Shot gets filled
a = A([R(364, 'tee'), R('', '')], 'fairway 150 left 7 iron'); assert.strictEqual(a.rows.length, 2); assert.deepStrictEqual(a.rows[1], R(150, 'fairway', { club: '7i', dir: 'left' })); n++;
// units: feet on the green, yards elsewhere; said unit wins (converted to the row's unit)
a = A([R(364, 'tee'), R(156, 'fairway')], 'green 10 yards'); assert.strictEqual(a.rows[2].dist, 30); n++;
a = A([R(364, 'tee'), R(156, 'fairway')], 'rough 60 feet'); assert.strictEqual(a.rows[2].dist, 20); n++;
a = A([R(364, 'tee'), R(156, 'fairway')], 'rough 20'); assert.strictEqual(a.rows[2].dist, 20); n++;
a = A([R(364, 'tee'), R(156, 'fairway')], 'putt 18'); assert.deepStrictEqual(a.rows[2], R(18, 'green')); n++;
// surface change without a new distance keeps the same real distance (8 yd → 24 ft)
a = A(LIVE(), 'shot 3 green'); assert.deepStrictEqual(a.rows[2], R(24, 'green')); n++;
// tee row: club/distance/layup on shot 1; a surface said for the tee shot is where shot 2 is hit from
a = A([R(364, 'tee')], 'driver fairway'); assert.deepStrictEqual(a.rows, [R(364, 'tee', { club: 'Driver' }), R('', 'fairway')]); n++;
assert.deepStrictEqual(D([R(364, 'tee')], 'driver fairway'), [['Shot 1', 'Tee · 364 yd'], ['Shot 1 club', 'Driver'], ['Shot 2 (new)', 'Fairway']]); n++;
a = A([R(364, 'tee')], 'driver rough 140 right'); assert.deepStrictEqual(a.rows[1], R(140, 'rough', { dir: 'right' })); assert.strictEqual(a.rows[0].dist, 364); n++;
a = A([R('', 'tee')], 'tee shot driver 410'); assert.deepStrictEqual(a.rows, [R(410, 'tee', { club: 'Driver' })]); n++;
a = A([R(520, 'tee')], 'layup', 5); assert.strictEqual(a.rows[0].layup, true); assert.strictEqual(a.rows.length, 1); n++;
a = A([R(170, 'tee')], 'layup', 3); assert.strictEqual(a.rows[0].layup, undefined); assert.ok(a.warn.length); n++;
a = A([R(400, 'tee'), R(150, 'fairway')], 'layup'); assert.ok(/tee shot/.test(a.warn[0])); n++;
// penalty = on the previous shot (the target row's P, which the app shows as the shot above's penalty)
a = A([R(400, 'tee'), R(150, 'fairway')], 'drop hazard 140'); assert.deepStrictEqual(a.rows[2], R(140, 'hazard', { pen: true })); n++;
assert.deepStrictEqual(D([R(400, 'tee'), R(150, 'fairway')], 'drop rough 140'), [['Shot 3 (new)', 'Rough · 140 yd'], ['Shot 2 penalty', '+1']]); n++;
a = A([R(400, 'tee'), R(150, 'fairway')], 'shot 2 penalty'); assert.strictEqual(a.rows[1].pen, true); assert.strictEqual(a.rows.length, 2); n++;
a = A([R(400, 'tee')], 'driver out of bounds'); assert.deepStrictEqual(a.rows[1], R('', 'ob')); n++;
// in the hole / made it: the shot from that distance went in
a = A([R(400, 'tee'), R(150, 'fairway'), R(20, 'green')], 'putt 2 feet made it'); assert.deepStrictEqual(a.rows.slice(2), [R(20, 'green'), R(2, 'holed')]); n++;
a = A([R(400, 'tee'), R(150, 'fairway'), R(8, 'green')], 'made it'); assert.strictEqual(a.rows.length, 3); assert.deepStrictEqual(a.rows[2], R(8, 'holed')); n++;
a = A([R(400, 'tee'), R(150, 'fairway'), R(8, 'green')], 'putt 8 feet in the hole'); assert.strictEqual(a.rows.length, 3); assert.strictEqual(a.rows[2].loc, 'holed'); n++;
a = A([R(400, 'tee'), R(150, 'fairway'), R('', 'green')], 'putt 12 feet in the hole'); assert.deepStrictEqual(a.rows[2], R(12, 'holed')); n++;
assert.deepStrictEqual(D([R(400, 'tee'), R(150, 'fairway'), R('', 'green')], 'putt 12 feet in the hole'), [['Shot 3', 'Putt from 12’ – in the hole!']]); n++;
a = A([R(400, 'tee'), R(40, 'rough')], 'lob wedge 40 chip in'); assert.deepStrictEqual(a.rows[1], R(40, 'holedx', { club: '60' })); n++;
a = A([R(400, 'tee'), R(150, 'fairway'), R(5, 'holed')], 'putt'); assert.ok(a.done); n++;
// input never mutated
const orig = LIVE(); A(orig, 'third shot green 25 feet short'); assert.deepStrictEqual(orig, LIVE()); n++;
console.log('VOICE PARSER OK – ' + n + ' checks');

if (process.env.UNIT_ONLY) process.exit(0);
const { chromium } = require('playwright-core'); const { spawn } = require('child_process');
const BASE = 'http://127.0.0.1:8798/', OUT = '/workspace/golf-app/screenshots/';
const FAKE = () => { // stand-in for the phone's speech recognizer; the test feeds it words
  class FakeRec { constructor() { window.__recs = (window.__recs || 0) + 1; window.__rec = this; }
    start() { this.on = true; } stop() { this.on = false; setTimeout(() => { if (window.__finalOnStop) { this.say(window.__finalOnStop, true); window.__finalOnStop = null; } this.onend && this.onend(); }, 60); } abort() { this.on = false; }
    say(t, fin) { const r = [{ transcript: t }]; r.isFinal = !!fin; this.onresult && this.onresult({ results: [r] }); } }
  window.webkitSpeechRecognition = FakeRec; window.SpeechRecognition = FakeRec;
};
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', '8798', '--bind', '127.0.0.1'], { cwd: '/workspace/golf-app', stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1500)); const errors = [];
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await ctx.addInitScript(FAKE);
  const page = await ctx.newPage(); page.on('pageerror', e => errors.push(String(e))); page.on('dialog', d => d.accept());
  await page.goto(BASE + '?x=' + Date.now());
  await page.evaluate(() => { const R = (d, l, x) => Object.assign({ dist: d, loc: l, dir: '', pen: false }, x || {});
    const done = () => ({ par: 4, finished: true, pin: 'center', rows: [R(400, 'tee', { club: 'Driver' }), R(150, 'fairway', { club: '8i' }), R(12, 'green', { dir: 'left' }), R(2, 'holed', { dir: 'long' })] });
    const holes = Array.from({ length: 6 }, done); holes.push({ par: 4, pin: 'backleft', rows: [R(364, 'tee', { club: 'Driver' }), R(156, 'fairway', { dir: 'right', club: '7i' }), R(8, '')] }); // Scott's live screenshot state
    while (holes.length < 18) holes.push({ par: 4, finished: false, rows: [R('', 'tee')] });
    localStorage.clear(); localStorage.setItem('golfsg.player.v1', 'Quincy');
    localStorage.setItem('golfsg.rounds.v1', JSON.stringify([{ v: 3, dv: 2, id: 'r1', date: '2026-10-16T17:00:00Z', course: 'Lakeridge', baseline: 'pga', player: 'Quincy', holes }]));
    localStorage.setItem('golfsg.current.v1', 'r1'); });
  await page.reload(); await page.click('#resumepill'); await page.waitForSelector('.holecard');
  assert.match(await page.textContent('.hc-head'), /Hole 7/);
  const clean = async () => { await page.evaluate(() => { const t = document.getElementById('toast'); if (t) t.className = ''; }); await page.waitForTimeout(300); };
  const shot = async name => { await clean(); await page.screenshot({ path: OUT + name + '.png' }); };
  await page.waitForSelector('#micbtn'); assert.match(await page.textContent('#micbtn'), /Hold to talk/);
  // the pill sits inline beside the stroke count, above Add Shot, and covers neither Add Shot nor Finish
  await page.$eval('#micbtn', e => e.scrollIntoView({ block: 'center' })); await page.waitForTimeout(200);
  const box = s => page.$eval(s, e => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, h: r.height, pos: getComputedStyle(e).position }; });
  const mic = await box('#micbtn'), add = await box('.addshot'), fin = await box('.finish');
  const hit = (a, b) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
  assert.ok(mic.h >= 56 && mic.pos !== 'fixed', 'big inline mic ' + JSON.stringify(mic));
  assert.ok(mic.b <= add.t && !hit(mic, add) && !hit(mic, fin), 'mic above Add Shot, covering nothing ' + JSON.stringify({ mic, add, fin }));
  assert.ok(await page.$eval('#micbtn', e => e.closest('.countrow') && /Hold to talk/.test(e.textContent)));
  await shot('voice-button'); await shot('voice-fix-layout');
  // press and hold
  const down = () => page.dispatchEvent('#micbtn', 'pointerdown', { pointerId: 1, pointerType: 'touch', isPrimary: true, bubbles: true });
  const up = () => page.dispatchEvent('#micbtn', 'pointerup', { pointerId: 1, pointerType: 'touch', isPrimary: true, bubbles: true });
  await down(); await page.waitForTimeout(300); if (process.env.DBG) console.log(await page.evaluate(() => JSON.stringify({ vs: window.__golf.voiceState(), recs: window.__recs, ss: sessionStorage.getItem("golfsg.voiceOff"), b: document.getElementById("micbubble").hidden }))); await page.waitForFunction(() => window.__rec && window.__rec.on);
  assert.strictEqual(await page.evaluate(() => [window.__rec.lang, window.__rec.continuous, window.__rec.interimResults].join()), 'en-US,false,true');
  await page.evaluate(() => window.__rec.say('third shot green 25', false)); await page.waitForTimeout(400);
  assert.match(await page.textContent('#micbubble .mictext'), /third shot green 25/); assert.ok(await page.$eval('#micbtn', e => e.classList.contains('on')));
  await shot('voice-listening');
  await page.evaluate(() => { window.__finalOnStop = 'third shot green 25 feet short'; }); await up();
  await page.waitForSelector('.voicecard'); assert.ok(await page.$eval('#micbubble', e => e.hidden));
  const card = await page.textContent('.voicecard');
  assert.match(card, /third shot green 25 feet short/);
  const vf = await page.$$eval('.voicecard .vf', es => es.map(e => [e.querySelector('span').textContent, e.querySelector('b').textContent]));
  assert.deepStrictEqual(vf, [['Shot 3', 'Green · 25’'], ['Shot 2 missed', 'Short']]); assert.match(card, /Replaces shot 3’s 8 yd/);
  // nothing saved yet
  assert.strictEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('golfsg.rounds.v1'))[0].holes[6].rows.length), 3);
  await shot('voice-confirm'); await shot('voice-fix-confirm');
  await page.click('[data-act="vsave"]'); await page.waitForSelector('.voicecard', { state: 'detached' });
  const rows = await page.evaluate(() => JSON.parse(localStorage.getItem('golfsg.rounds.v1'))[0].holes[6].rows);
  assert.strictEqual(rows.length, 3, 'no extra row 4');
  assert.deepStrictEqual(rows.slice(1), [{ dist: 156, loc: 'fairway', dir: 'right', pen: false, club: '7i' }, { dist: 25, loc: 'green', dir: 'short', pen: false }]);
  assert.strictEqual(await page.$eval('input[data-row="2"]', e => e.value), '25'); assert.strictEqual(await page.$eval('select[data-f="loc"][data-k="2"]', e => e.value), 'green');
  assert.strictEqual(await page.$eval('.dirbtn[data-k="2"]', e => e.getAttribute('data-dir')), 'short');
  // Retry closes without saving; Edit lets her fix fields first
  await down(); await page.evaluate(() => window.__rec.say('putt 3 feet long', true)); await page.waitForTimeout(400); await up();
  await page.waitForSelector('.voicecard'); await page.click('[data-act="vretry"]'); await page.waitForSelector('.voicecard', { state: 'detached' });
  assert.strictEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('golfsg.rounds.v1'))[0].holes[6].rows.length), 3);
  await down(); await page.evaluate(() => window.__rec.say('putt 3 feet long', true)); await page.waitForTimeout(400); await up();
  await page.waitForSelector('.voicecard'); await page.click('[data-act="vedit"]'); await page.waitForSelector('.vedit');
  assert.strictEqual(await page.$eval('.vedit select[data-vf="shot"]', e => e.value), '4'); await page.fill('.vedit input[data-vf="dist"]', '4'); await page.selectOption('.vedit select[data-vf="dir"]', 'longright');
  await shot('voice-edit');
  await page.click('[data-act="vsave"]'); await page.waitForSelector('.voicecard', { state: 'detached' });
  const r4 = await page.evaluate(() => JSON.parse(localStorage.getItem('golfsg.rounds.v1'))[0].holes[6].rows[3]);
  assert.deepStrictEqual(r4, { loc: 'green', dist: 4, dir: 'longright', pen: false });
  // quick tap = hands-off mode; tap again to stop
  await down(); await page.waitForTimeout(80); await up(); assert.match(await page.textContent('#micbtn'), /Tap to stop/);
  await page.evaluate(() => window.__rec.say('putt 4 feet in the hole', true)); await down(); await up();
  await page.waitForSelector('.voicecard'); assert.match(await page.textContent('.voicecard'), /Shot 4Putt from 4’ – in the hole!/); await page.click('[data-act="vsave"]');
  await page.waitForSelector('.hint'); assert.match(await page.textContent('#hint'), /Finish hole/); assert.strictEqual(await page.$('#micbtn'), null, 'mic hidden once holed');
  // mic permission denied → friendly message + type/dictate box, mic marked off
  await page.click('[data-act="next"]'); await page.waitForSelector('#micbtn');
  await down(); await page.evaluate(() => { window.__rec.onerror({ error: 'not-allowed' }); window.__rec.onend(); });
  await page.waitForTimeout(200); await up(); await page.waitForTimeout(100); // first not-allowed during a hold → falls back to tap-to-start
  await page.evaluate(() => { window.__rec.onerror({ error: 'not-allowed' }); window.__rec.onend(); });
  await page.waitForSelector('#vtext'); assert.match(await page.textContent('.voicecard'), /isn’t allowed to use the microphone/);
  await page.fill('#vtext', 'driver 380 fairway'); await page.click('[data-act="vtype"]'); await page.waitForSelector('.vfields'); assert.match(await page.textContent('.voicecard'), /Driver/);
  await page.click('[data-act="vcancel"]'); assert.match(await page.textContent('#micbtn'), /Say it/);
  assert.deepStrictEqual(errors, []); await b.close();
  // no speech recognition at all (e.g. iOS home-screen app on older iOS): button opens the type/dictate box
  const b2 = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const c2 = await b2.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  await c2.addInitScript(() => { delete window.webkitSpeechRecognition; delete window.SpeechRecognition; window.webkitSpeechRecognition = undefined; window.SpeechRecognition = undefined; });
  const p2 = await c2.newPage(); p2.on('pageerror', e => errors.push(String(e)));
  await p2.goto(BASE + '?x=' + Date.now()); await p2.evaluate(() => { localStorage.clear(); localStorage.setItem('golfsg.player.v1', 'Quincy');
    const holes = Array.from({ length: 18 }, () => ({ par: 4, finished: false, rows: [{ loc: 'tee', dist: 380, dir: '', pen: false }] }));
    localStorage.setItem('golfsg.rounds.v1', JSON.stringify([{ v: 3, dv: 2, id: 'r2', date: '2026-10-16T17:00:00Z', course: 'X', baseline: 'pga', player: 'Quincy', holes }])); localStorage.setItem('golfsg.current.v1', 'r2'); });
  await p2.reload(); await p2.click('#resumepill'); await p2.waitForSelector('#micbtn'); assert.match(await p2.textContent('#micbtn'), /Say it/);
  await p2.dispatchEvent('#micbtn', 'pointerdown', { pointerId: 1, pointerType: 'touch', bubbles: true }); await p2.waitForSelector('#vtext');
  assert.match(await p2.textContent('.voicecard'), /Voice isn’t available in this app on this phone/);
  await p2.screenshot({ path: OUT + 'voice-unavailable.png' });
  assert.deepStrictEqual(errors, []); console.log('VOICE UI OK'); await b2.close(); srv.kill();
})().catch(e => { console.error(e); process.exit(1); });
