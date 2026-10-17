// Voice entry: (1) parser + row mapping unit tests in Node, (2) hold-to-talk flow in a phone-size browser with a fake recognizer + screenshots.
const assert = require('assert'); const V = require('../voice.js');
let n = 0; const P = (t, exp) => { const p = V.parse(t); for (const k of Object.keys(exp)) assert.deepStrictEqual(p[k], exp[k], `"${t}" → ${k}: got ${JSON.stringify(p[k])} want ${JSON.stringify(exp[k])} (${JSON.stringify(p)})`); n++; return p; };
// clubs, spoken many ways
P('driver fairway', { club: 'Driver', result: 'fairway' });
P('one wood fairway', { club: 'Driver' });
P('three wood 230 fairway', { club: '3W', from: 230, result: 'fairway' });
P('3 wood', { club: '3W' }); P('5w 215 rough left', { club: '5W', from: 215, result: 'rough', dir: 'left' }); P('seven wood', { club: '7W' });
P('four hybrid one eighty rough right', { club: '4H', from: 180, result: 'rough', dir: 'right' });
P('for hybrid 190 green 40 feet long left', { club: '4H', from: 190, to: 40, dir: 'longleft', result: 'green' });
P('5 hybrid', { club: '5H' }); P('five iron', { club: '5i' }); P('6-iron', { club: '6i' }); P('9i 120 green 15\' short right', { club: '9i', from: 120, to: 15, dir: 'shortright' });
P('eight iron', { club: '8i' }); P('ate iron 140', { club: '8i', from: 140 });
P('pitching wedge 85 rough short', { club: 'PW', from: 85, result: 'rough', dir: 'short' });
P('PW 100 green', { club: 'PW', from: 100, result: 'green' });
P('gap wedge', { club: '52' }); P('sand wedge 30 from the bunker green 8 feet', { club: '56', lie: 'bunker', from: 30, result: 'green', to: 8 });
P('lob wedge 20 chip in', { club: '60', from: 20, result: 'holed', holedx: true });
P('56 degree 40 bunker', { club: '56', from: 40, result: 'bunker' });
P('fifty six forty bunker', { club: '56', from: 40, result: 'bunker' });
P('fifty-six degree, forty yards, bunker', { club: '56', from: 40, fromUnit: 'yd', result: 'bunker' });
P('52 wedge 70 green 12 feet', { club: '52', from: 70, to: 12 }); P('54° 60 green', { club: '54', from: 60 }); P('fifty eight degree', { club: '58' }); P('sixty degree 30 green 4 feet', { club: '60', from: 30, to: 4 });
// numbers spoken as words
P('seven iron one fifty on the green twenty feet left', { club: '7i', from: 150, result: 'green', to: 20, toUnit: 'ft', dir: 'left' });
P('a hundred and twenty pitching wedge green ten feet over', { from: 120, club: 'PW', to: 10, dir: 'long' });
P('one oh five gap wedge green 6 feet', { from: 105, club: '52', to: 6 });
P('two hundred ten driver', { from: 210, club: 'Driver' });
P('7 iron 150 green 20 feet left', { club: '7i', from: 150, result: 'green', to: 20, dir: 'left' });
// putting
P('putt 12 feet in the hole', { putt: true, from: 12, fromUnit: 'ft', result: 'holed' });
P('putt 2 feet made it', { putt: true, from: 2, result: 'holed' });
P('Putt 20 feet, 3 feet long', { putt: true, from: 20, to: 3, dir: 'long', result: 'green' });
P('putt 30 feet short', { putt: true, from: 30, dir: 'short', result: 'green' });
P('in the hole', { result: 'holed' });
// results, misses, penalties, layups
P('penalty', { pen: true }); P('layup', { layup: true }); P('lay up', { layup: true });
P('driver out of bounds', { club: 'Driver', result: 'ob', pen: undefined }); P('driver OB', { result: 'ob' });
P('driver right trees', { club: 'Driver', result: 'trees', dir: 'right' });
P('8 iron 140 water penalty', { club: '8i', from: 140, result: 'hazard', pen: true });
P('6 iron 170 hazard', { result: 'hazard', pen: undefined });
P('7 iron deep rough left', { result: 'deep', dir: 'left' });
P('driver 410 fairway layup', { club: 'Driver', from: 410, result: 'fairway', layup: true });
P('9 iron 130 over the green', { club: '9i', from: 130, result: undefined, dir: 'long', offGreen: true });
P('pw 100 short of the green bunker', { result: 'bunker', dir: 'short' });
P('8 iron in the sand', { result: 'bunker' });
P('blah blah', { empty: true });
assert.ok(V.parse('7 iron 150 green 20 feet banana').unknown.includes('banana'));

// mapping onto rows (the app's model: one row = one stroke; dir/pen on the row AFTER the stroke)
const R = (dist, loc, x) => Object.assign({ dist, loc, dir: '', pen: false }, x || {});
const A = (rows, t, par) => V.apply({ par: par || 4, rows }, V.parse(t));
let a = A([R(400, 'tee')], 'driver fairway');
assert.deepStrictEqual(a.rows, [R(400, 'tee', { club: 'Driver' }), R('', 'fairway')]); assert.strictEqual(a.k, 0); assert.strictEqual(a.rk, 1); n++;
a = A([R(400, 'tee', { club: 'Driver' }), R('', 'fairway')], '7 iron 150 green 20 feet left');
assert.deepStrictEqual(a.rows.slice(1), [R(150, 'fairway', { club: '7i' }), R(20, 'green', { dir: 'left' })]); n++;
a = A([R(400, 'tee'), R(150, 'fairway'), R(20, 'green')], 'putt 20 feet 3 feet long');
assert.deepStrictEqual(a.rows[3], R(3, 'green', { dir: 'long' })); assert.strictEqual(a.rows[2].club, undefined); n++;
a = A([R(400, 'tee'), R(150, 'fairway'), R(20, 'green'), R(3, 'green')], 'putt 3 feet in the hole');
assert.strictEqual(a.rows.length, 4); assert.deepStrictEqual(a.rows[3], R(3, 'holed')); n++;
a = A([R(400, 'tee'), R(150, 'fairway'), R('', 'green')], 'putt 12 feet in the hole');
assert.deepStrictEqual(a.rows[2], R(12, 'holed')); n++;
a = A([R(400, 'tee'), R(40, 'rough')], 'lob wedge 40 chip in'); assert.deepStrictEqual(a.rows[1], R(40, 'holedx', { club: '60' })); n++;
a = A([R(160, 'tee')], '7 iron 160 in the hole', 3); assert.strictEqual(a.rows[0].loc, 'holedx'); n++;
a = A([R(520, 'tee')], 'layup', 5); assert.strictEqual(a.rows[0].layup, true); assert.strictEqual(a.rows.length, 1); n++;
a = A([R(170, 'tee')], 'layup', 3); assert.strictEqual(a.rows[0].layup, undefined); assert.ok(a.warn.length); n++;
a = A([R(400, 'tee'), R(150, 'fairway')], 'layup'); assert.ok(/tee shot/.test(a.warn[0])); n++;
a = A([R(400, 'tee'), R(150, 'fairway')], 'penalty'); assert.strictEqual(a.rows[1].pen, true); n++;
a = A([R(400, 'tee')], 'driver water penalty'); assert.deepStrictEqual(a.rows[1], R('', 'hazard', { pen: true })); n++;
a = A([R(400, 'tee')], 'driver out of bounds'); assert.deepStrictEqual(a.rows[1], R('', 'ob')); n++;
// empty row from "Add Shot" is reused as the landing spot of the shot above…
a = A([R(400, 'tee', { club: 'Driver' }), R('', '')], 'fairway left'); assert.strictEqual(a.rows.length, 2); assert.deepStrictEqual(a.rows[1], R('', 'fairway', { dir: 'left' })); assert.strictEqual(a.k, 0); n++;
// …but a new FROM distance means it IS the next shot
a = A([R(400, 'tee'), R('', '')], 'pitching wedge 120 green 15 feet'); assert.strictEqual(a.k, 1); assert.deepStrictEqual(a.rows[1], R(120, '', { club: 'PW' })); assert.deepStrictEqual(a.rows[2], R(15, 'green')); n++;
a = A([R(400, 'tee'), R(120, 'fairway')], 'from the rough 9 iron 120 green 9 feet'); assert.strictEqual(a.rows[1].loc, 'rough'); assert.strictEqual(a.rows[1].dist, 120); n++;
a = A([R(400, 'tee'), R(150, 'fairway')], 'from the rough 9 iron 120 green 9 feet'); assert.deepStrictEqual(a.rows.slice(1), [R(150, 'fairway'), R(120, 'rough', { club: '9i' }), R(9, 'green')]); n++;
a = A([R(400, 'tee'), R(150, 'fairway'), R(5, 'holed')], 'putt'); assert.ok(a.done); n++;
a = A([R(400, 'tee'), R(150, 'fairway')], '8 iron 150 green 10 yards'); assert.strictEqual(a.rows[2].dist, 30, 'yards on the green become feet'); n++;
// a different FROM distance on a filled bottom row = the next shot
a = A([R(400, 'tee', { club: 'Driver' })], 'pw 120 green 10 feet'); assert.strictEqual(a.rows[0].dist, 400); assert.strictEqual(a.k, 1); assert.deepStrictEqual(a.rows[1], R(120, '', { club: 'PW' })); assert.deepStrictEqual(a.rows[2], R(10, 'green')); n++;
a = A([R(400, 'tee'), R(150, 'fairway'), R(20, 'green')], 'putt 2 feet made it'); assert.deepStrictEqual(a.rows.slice(2), [R(20, 'green'), R(2, 'holed')]); n++;
a = A([R(400, 'tee'), R(150, 'fairway')], '7 iron 150 green'); assert.strictEqual(a.rows.length, 3); assert.strictEqual(a.k, 1); n++;
// input never mutated
const orig = [R(400, 'tee')]; A(orig, 'driver fairway'); assert.deepStrictEqual(orig, [R(400, 'tee')]); n++;
// describe
a = A([R(400, 'tee', { club: 'Driver' }), R('', 'fairway')], '7 iron 150 green 20 feet left');
assert.deepStrictEqual(V.describe({}, a, V.parse('7 iron 150 green 20 feet left')), [['Shot', '2 · Fairway'], ['Club', '7 iron'], ['From', '150 yd'], ['Ended', 'Green'], ['To pin', '20’'], ['Miss', 'Left']]); n++;
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
    const holes = Array.from({ length: 6 }, done); holes.push({ par: 4, pin: 'backleft', rows: [R(386, 'tee', { club: 'Driver' }), R('', 'fairway', { dir: 'right' })] });
    while (holes.length < 18) holes.push({ par: 4, finished: false, rows: [R('', 'tee')] });
    localStorage.clear(); localStorage.setItem('golfsg.player.v1', 'Quincy');
    localStorage.setItem('golfsg.rounds.v1', JSON.stringify([{ v: 3, dv: 2, id: 'r1', date: '2026-10-16T17:00:00Z', course: 'Lakeridge', baseline: 'pga', player: 'Quincy', holes }]));
    localStorage.setItem('golfsg.current.v1', 'r1'); });
  await page.reload(); await page.click('#resumepill'); await page.waitForSelector('.holecard');
  assert.match(await page.textContent('.hc-head'), /Hole 7/);
  const clean = async () => { await page.evaluate(() => { const t = document.getElementById('toast'); if (t) t.className = ''; }); await page.waitForTimeout(300); };
  const shot = async name => { await clean(); await page.screenshot({ path: OUT + name + '.png' }); };
  await page.waitForSelector('#micbtn'); assert.match(await page.textContent('#micbtn'), /Hold to talk/);
  const mic = await page.$eval('#micbtn', e => { const r = e.getBoundingClientRect(), c = getComputedStyle(e); return { h: r.height, pos: c.position, bottom: innerHeight - r.bottom }; });
  assert.ok(mic.h >= 56 && mic.pos === 'fixed' && mic.bottom < 60, 'big fixed mic at the bottom ' + JSON.stringify(mic));
  await shot('voice-button');
  // press and hold
  const down = () => page.dispatchEvent('#micbtn', 'pointerdown', { pointerId: 1, pointerType: 'touch', isPrimary: true, bubbles: true });
  const up = () => page.dispatchEvent('#micbtn', 'pointerup', { pointerId: 1, pointerType: 'touch', isPrimary: true, bubbles: true });
  await down(); await page.waitForTimeout(300); if (process.env.DBG) console.log(await page.evaluate(() => JSON.stringify({ vs: window.__golf.voiceState(), recs: window.__recs, ss: sessionStorage.getItem("golfsg.voiceOff"), b: document.getElementById("micbubble").hidden }))); await page.waitForFunction(() => window.__rec && window.__rec.on);
  assert.strictEqual(await page.evaluate(() => [window.__rec.lang, window.__rec.continuous, window.__rec.interimResults].join()), 'en-US,false,true');
  await page.evaluate(() => window.__rec.say('7 iron 150 green 20 feet', false)); await page.waitForTimeout(400);
  assert.match(await page.textContent('#micbubble .mictext'), /7 iron 150 green 20 feet/); assert.ok(await page.$eval('#micbtn', e => e.classList.contains('on')));
  await shot('voice-listening');
  await page.evaluate(() => { window.__finalOnStop = '7 iron 150 green 20 feet left'; }); await up();
  await page.waitForSelector('.voicecard'); assert.ok(await page.$eval('#micbubble', e => e.hidden));
  const card = await page.textContent('.voicecard');
  assert.match(card, /7 iron 150 green 20 feet left/); assert.match(card, /7 iron/); assert.match(card, /150 yd/); assert.match(card, /Green/); assert.match(card, /20’/); assert.match(card, /Left/);
  // nothing saved yet
  assert.strictEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('golfsg.rounds.v1'))[0].holes[6].rows.length), 2);
  await shot('voice-confirm');
  await page.click('[data-act="vsave"]'); await page.waitForSelector('.voicecard', { state: 'detached' });
  const rows = await page.evaluate(() => JSON.parse(localStorage.getItem('golfsg.rounds.v1'))[0].holes[6].rows);
  assert.deepStrictEqual(rows.slice(1), [{ dist: 150, loc: 'fairway', dir: 'right', pen: false, club: '7i' }, { loc: 'green', dist: 20, dir: 'left', pen: false }]);
  assert.strictEqual(await page.$eval('input[data-row="1"]', e => e.value), '150'); assert.strictEqual(await page.$eval('select[data-f="club"][data-k="1"]', e => e.value), '7i');
  // Retry closes without saving; Edit lets her fix fields first
  await down(); await page.evaluate(() => window.__rec.say('putt 20 feet three feet long', true)); await page.waitForTimeout(400); await up();
  await page.waitForSelector('.voicecard'); await page.click('[data-act="vretry"]'); await page.waitForSelector('.voicecard', { state: 'detached' });
  assert.strictEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('golfsg.rounds.v1'))[0].holes[6].rows.length), 3);
  await down(); await page.evaluate(() => window.__rec.say('putt 20 feet three feet long', true)); await page.waitForTimeout(400); await up();
  await page.waitForSelector('.voicecard'); await page.click('[data-act="vedit"]'); await page.waitForSelector('.vedit');
  await page.fill('.vedit input[data-vf="to"]', '4'); await page.selectOption('.vedit select[data-vf="dir"]', 'longright');
  await shot('voice-edit');
  await page.click('[data-act="vsave"]'); await page.waitForSelector('.voicecard', { state: 'detached' });
  const r4 = await page.evaluate(() => JSON.parse(localStorage.getItem('golfsg.rounds.v1'))[0].holes[6].rows[3]);
  assert.deepStrictEqual(r4, { loc: 'green', dist: 4, dir: 'longright', pen: false });
  // quick tap = hands-off mode; tap again to stop
  await down(); await page.waitForTimeout(80); await up(); assert.match(await page.textContent('#micbtn'), /Tap to stop/);
  await page.evaluate(() => window.__rec.say('putt 4 feet in the hole', true)); await down(); await up();
  await page.waitForSelector('.voicecard'); assert.match(await page.textContent('.voicecard'), /In the hole/); await page.click('[data-act="vsave"]');
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
