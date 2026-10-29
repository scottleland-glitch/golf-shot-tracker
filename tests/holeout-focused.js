// v90 "Hole out" box: a shot holed from OFF the green keeps its own lie (no more "In the hole" replacing it).
// Scott's Hole 1 (par 4): 312 yd driver, 155 yd 7i from the fairway misses the green, 25 yd 56° from the deep rough goes in = 3.
// Covers: SG model (strokes, start lie, SG split, GIR/chip-in rule), old rounds computing exactly like v89 (git 8e31760),
// backup/restore, live snapshot + viewer, voice ("holed it" / "in the hole"), and the phone flow (box, one per hole, confirm, hint).
const assert = require('assert'); const { execSync, spawn } = require('child_process'); const fs = require('fs'); const os = require('os'); const path = require('path');
const SG = require('../sg.js'); global.SG = SG; const L = require('../live.js'); const V = require('../voice.js');
const R = (d, l, x) => Object.assign({ dist: d, loc: l, dir: '', pen: false }, x || {});
const close = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-9, m + ': ' + a + ' vs ' + b);
let n = 0;
const hole1 = () => ({ par: 4, finished: true, rows: [R(467, 'tee', { club: 'Driver' }), R(155, 'fairway', { club: '7i' }), R(25, 'deep', { club: '56', dir: 'right', holeOut: true })] });

// ---------- 1. the exact Hole 1 example ----------
{ const a = SG.analyzeHole(hole1(), 'pga');
  assert.strictEqual(a.strokes, 3, '3 strokes, not 4'); assert.strictEqual(a.liveStrokes, 3); assert.ok(a.complete && a.done); assert.strictEqual(a.problem, '');
  assert.strictEqual(a.shots.length, 3);
  const s3 = a.shots[2]; assert.deepStrictEqual([s3.start.lie, s3.start.dist, s3.end.lie, s3.end.dist], ['deep', 25, 'holed', 0], 'shot 3 starts in the deep rough at 25 yd and ends in the hole');
  close(s3.sg, SG.expected('deep', 25, 'pga') - 1, 'shot 3 SG uses the deep-rough start');
  const s2 = a.shots[1]; assert.deepStrictEqual([s2.end.lie, s2.end.dist, s2.dir], ['deep', 25, 'right'], 'shot 2 still ends in the deep rough, right of the green');
  close(s2.sg, SG.expected('fairway', 155, 'pga') - SG.expected('deep', 25, 'pga') - 1, 'shot 2 SG ends in the deep rough');
  assert.strictEqual(s3.cat, 'approach'); assert.strictEqual(a.putts, 0); assert.strictEqual(a.fairway, true);
  assert.strictEqual(a.gir, true, 'chip-in from 30 yd or closer right after counts as GIR (Scott rule) - same as before'); assert.strictEqual(a.appr.chipIn, true); assert.strictEqual(a.appr.holed, true);
  // the old way (row 3 = "In the hole (chip/shot)") scored the same 3 but valued shot 3 from the FAIRWAY
  const old = SG.analyzeHole({ par: 4, finished: true, rows: [R(467, 'tee'), R(155, 'fairway'), R(25, 'holedx', { dir: 'right' })] }, 'pga');
  assert.strictEqual(old.strokes, 3); assert.strictEqual(old.shots[2].start.lie, 'fairway'); close(old.sg, a.sg, 'hole total unchanged (telescoping)');
  assert.ok(a.shots[2].sg > old.shots[2].sg + 0.3, 'hole-out from deep rough is worth more than from the fairway');
  const S = SG.summarize({ holes: [hole1()] }, 'pga'); assert.strictEqual(S.strokes, 3); assert.strictEqual(S.holesDone, 1); n++; }

// ---------- 2. rules around the box ----------
{ // shots after a holed-out row -> 'after'
  const h = hole1(); h.rows.push(R(3, 'green')); const a = SG.analyzeHole(h); assert.strictEqual(a.problem, 'after'); assert.strictEqual(a.bad, 3); assert.ok(!a.complete);
  // no box, last row off the green -> not finished
  const h2 = hole1(); delete h2.rows[2].holeOut; assert.strictEqual(SG.analyzeHole(h2).problem, 'last');
  // box on row 1 is ignored (row 1 uses "In the hole (ace!)")
  const h3 = { par: 3, rows: [R(160, 'tee', { holeOut: true })] }; assert.strictEqual(SG.analyzeHole(h3).complete, false); assert.ok(!SG.isHoled(h3.rows[0], 0));
  // box on a row without a location does not finish it
  assert.ok(!SG.isHoled(R(20, '', { holeOut: true }), 2));
  // missing distance on the holed-out row -> 'dist'
  const h4 = hole1(); h4.rows[2].dist = ''; assert.strictEqual(SG.analyzeHole(h4).problem, 'dist');
  // a putt with the box = exactly the old "In the hole" putt
  const P1 = SG.analyzeHole({ par: 4, rows: [R(400, 'tee'), R(150, 'fairway'), R(12, 'green', { holeOut: true })] });
  const P0 = SG.analyzeHole({ par: 4, rows: [R(400, 'tee'), R(150, 'fairway'), R(12, 'holed')] });
  assert.deepStrictEqual(P1.shots.map(s => [s.start.lie, s.end.lie, s.sg, s.cat]), P0.shots.map(s => [s.start.lie, s.end.lie, s.sg, s.cat])); assert.strictEqual(P1.gir, P0.gir); assert.strictEqual(P1.putts, 1);
  // long hole-out (110 yd wedge for eagle from the rough): chip-in rule only for <= 30 yd, same as holedx
  const E1 = SG.analyzeHole({ par: 4, rows: [R(380, 'tee'), R(110, 'rough', { holeOut: true })] }), E0 = SG.analyzeHole({ par: 4, rows: [R(380, 'tee'), R(110, 'holedx')] });
  assert.strictEqual(E1.strokes, 2); assert.strictEqual(E1.shots[1].start.lie, 'rough'); assert.strictEqual(E1.gir, E0.gir); assert.strictEqual(E1.appr.holed, E0.appr.holed);
  const F1 = SG.analyzeHole({ par: 4, rows: [R(380, 'tee'), R(150, 'fairway'), R(40, 'bunker', { holeOut: true })] }), F0 = SG.analyzeHole({ par: 4, rows: [R(380, 'tee'), R(150, 'fairway'), R(40, 'holedx')] });
  assert.strictEqual(F1.gir, F0.gir); assert.strictEqual(F1.gir, false, '40 yd hole-out after missing is still a miss'); assert.strictEqual(F1.appr.lie, 'sand', 'the miss is drawn in the bunker where it really was'); assert.strictEqual(F0.appr.lie, 'fairway');
  // penalty drop + hole out from the drop; OB re-hit holed out
  const D = SG.analyzeHole({ par: 4, rows: [R(400, 'tee'), R(160, 'hazard', { pen: true }), R(30, 'rough', { holeOut: true })] }); assert.strictEqual(D.strokes, 4); assert.ok(D.complete);
  const O = SG.analyzeHole({ par: 3, rows: [R(170, 'tee'), R('', 'ob', { holeOut: true })] }); assert.strictEqual(O.strokes, 3); assert.ok(O.complete); assert.strictEqual(O.shots[1].start.lie, 'tee');
  // holed / holedx rows with a stray holeOut flag behave exactly as without it
  const X1 = SG.analyzeHole({ par: 4, rows: [R(400, 'tee'), R(150, 'fairway'), R(9, 'holed', { holeOut: true })] }), X0 = SG.analyzeHole({ par: 4, rows: [R(400, 'tee'), R(150, 'fairway'), R(9, 'holed')] });
  assert.deepStrictEqual(X1.shots.map(s => s.sg), X0.shots.map(s => s.sg)); n++; }

// ---------- 3. existing rounds compute exactly like v89 ----------
{ let OLD = null; const tmp = path.join(os.tmpdir(), 'sg-v89-' + process.pid + '.js');
  try { fs.writeFileSync(tmp, execSync('git show 8e31760:sg.js', { cwd: path.join(__dirname, '..') })); OLD = require(tmp); } catch (e) { console.log('  (skipped v89 comparison: ' + e.message.split('\n')[0] + ')'); }
  if (OLD) {
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647, pick = a => a[Math.floor(rnd() * a.length)];
    const rounds = [];
    for (let i = 0; i < 60; i++) {
      const holes = [];
      for (let hI = 0; hI < 18; hI++) {
        const par = pick([3, 4, 5]), rows = [R(par * 100 + Math.floor(rnd() * 90), 'tee', { club: pick(['Driver', '3W', '7i', '']) })], len = 1 + Math.floor(rnd() * 5);
        for (let k = 1; k < len; k++) { const loc = pick(['fairway', 'rough', 'deep', 'bunker', 'green', 'green', 'hazard', 'trees', 'ob']); rows.push(R(loc === 'ob' ? '' : loc === 'green' ? 1 + Math.floor(rnd() * 40) : 5 + Math.floor(rnd() * 200), loc, { dir: pick(SG.DIR8.concat(['', ''])), pen: rnd() < 0.08 })); }
        const last = rows[rows.length - 1]; rows.push(R(last.loc === 'green' ? 1 + Math.floor(rnd() * 15) : 2 + Math.floor(rnd() * 60), last.loc === 'green' ? 'holed' : pick(['holed', 'holedx'])));
        if (rnd() < 0.15) rows.pop(); // some unfinished holes
        holes.push({ par, finished: rnd() < 0.9, pin: pick(['', 'center', 'frontleft']), rows });
      }
      rounds.push({ id: 'r' + i, holes });
    }
    require('./fixtures/birdie-data.js')().forEach(r => rounds.push(r)); // the Birdie-zone sample rounds too
    let cmp = 0;
    const strip = o => JSON.parse(JSON.stringify(o, (k, v) => k === 'hk' ? undefined : v)); // hk = new internal helper field on shots
    rounds.forEach(rr => {
      SG.BASELINES.forEach(b => { assert.deepStrictEqual(strip(SG.summarize(rr, b.id)), strip(OLD.summarize(rr, b.id)), 'round ' + rr.id + ' vs ' + b.id); cmp++; });
      rr.holes.forEach(h => assert.deepStrictEqual(strip(SG.analyzeHole(h)), strip(OLD.analyzeHole(h)))); });
    assert.ok(cmp >= 60 * 6, 'compared ' + cmp); fs.unlinkSync(tmp);
  }
  n++; }

// ---------- 4. backup / restore keeps the box ----------
{ const r = { v: 3, dv: 2, id: 'rb', date: '2026-10-28T17:00:00.000Z', holes: [hole1()] };
  const B = SG.makeBackup([r], new Date('2026-10-28T18:00:00Z'), 'Quincy', []), P = SG.parseBackup(typeof B === 'string' ? B : JSON.stringify(B));
  assert.strictEqual(P.rounds[0].holes[0].rows[2].holeOut, true); assert.strictEqual(P.rounds[0].holes[0].rows[2].loc, 'deep');
  assert.strictEqual(SG.summarize(P.rounds[0], 'pga').strokes, 3); n++; }

// ---------- 5. live snapshot + viewer ----------
{ const r = { id: 'rl', player: 'Quincy', course: 'Arcade Creek', holes: [hole1(), { par: 4, finished: false, rows: [R(400, 'tee'), R(150, 'fairway')] }] };
  const S = L.snapshot(r, SG, { now: 1000 });
  assert.deepStrictEqual(S.h[0].shots, ['467|tee||Driver', '155|fairway||7i', '25|deep|right|56|||1']); assert.strictEqual(S.h[0].sc, 3);
  const html = L.viewerHTML(S, { open: 0, now: 2000 });
  assert.ok(html.includes('Deep rough · 25 yd – in the hole!'), 'viewer: lie kept + in the hole'); assert.ok(!/25 yd to the pin/.test(html));
  // old snapshots (no 7th field) still read as before
  const html0 = L.viewerHTML({ v: 1, h: [{ par: 4, sc: 3, shots: ['467|tee', '155|fairway', '25|holedx|right'] }], thru: 1, strokes: 3, par: 4, toPar: -1, cur: 2, at: 1 }, { open: 0, now: 2 });
  assert.ok(html0.includes('In the hole from 25 yd')); n++; }

// ---------- 6. voice ----------
{ const h = { par: 4, rows: [R(467, 'tee'), R(155, 'fairway'), R(25, 'deep', { club: '56' })] };
  ['holed it', 'in the hole', 'made it', 'chipped in'].forEach(t => { const a = V.apply(h, V.parse(t)); assert.strictEqual(a.k, 2, t); assert.deepStrictEqual(a.rows[2], R(25, 'deep', { club: '56', holeOut: true }), t + ' keeps deep rough');
    assert.deepStrictEqual(V.describe(h, a)[0], ['Shot 3', 'Deep rough · 25 yd – in the hole!']); assert.strictEqual(SG.analyzeHole({ par: 4, rows: a.rows }).strokes, 3); });
  const p = V.parse('56 25 yards deep rough holed it'); assert.deepStrictEqual([p.loc, p.holeOut, p.club, p.dist], ['deep', true, '56', 25]);
  const a2 = V.apply({ par: 4, rows: [R(467, 'tee'), R(155, 'fairway')] }, p); assert.deepStrictEqual(a2.rows[2], R(25, 'deep', { club: '56', holeOut: true })); assert.ok(a2.created);
  // putts still become "In the hole"
  assert.deepStrictEqual(V.apply({ par: 4, rows: [R(400, 'tee'), R(150, 'fairway'), R(8, 'green')] }, V.parse('made it')).rows[2], R(8, 'holed'));
  assert.strictEqual(V.parse('on the green 10 feet made it').loc, 'holed');
  // holed out already -> nothing more to add
  assert.ok(V.apply(hole1(), V.parse('putt 3 feet')).done); n++; }

// ---------- 7. phone flow (390x844) ----------
(async () => {
  const { chromium } = require('playwright-core'); const BASE = 'http://127.0.0.1:8841/';
  const srv = spawn('python3', ['-m', 'http.server', '8841', '--bind', '127.0.0.1'], { cwd: path.join(__dirname, '..'), stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1200)); const errors = [];
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.route(/firebaseio\.com/, route => route.abort('internetdisconnected')); // never touch the real database
  const page = await ctx.newPage(); page.setDefaultTimeout(30000); page.on('pageerror', e => errors.push(String(e)));
  let dialogs = [], answer = true; page.on('dialog', d => { dialogs.push(d.message()); answer ? d.accept() : d.dismiss(); });
  try {
    await page.goto(BASE + '?x=' + Date.now());
    await page.evaluate(() => {
      const R = (d, l, x) => Object.assign({ dist: d, loc: l, dir: '', pen: false }, x || {});
      const holes = Array.from({ length: 18 }, () => ({ par: 4, finished: false, rows: [R('', 'tee')] }));
      holes[0] = { par: 4, finished: false, rows: [R(467, 'tee', { club: 'Driver' }), R(155, 'fairway', { club: '7i' }), R(25, 'deep', { club: '56', dir: 'right' }), R(4, 'green')] };
      holes[1] = { par: 4, finished: true, rows: [R(400, 'tee'), R(150, 'fairway'), R(12, 'green'), R(2, 'holed')] }; // an old-style finished hole
      localStorage.clear(); localStorage.setItem('golfsg.rounds.v1', JSON.stringify([{ v: 3, dv: 2, id: 'rho', date: new Date().toISOString(), course: 'Arcade Creek', baseline: 'pga', player: 'Quincy', holes }]));
      localStorage.setItem('golfsg.current.v1', 'rho'); localStorage.setItem('golfsg.player.v1', 'Quincy');
    });
    await page.reload(); await page.click('[data-act="resume"]'); await page.waitForSelector('.holecard');
    assert.strictEqual(await page.$('[data-f="holeout"][data-k="0"]'), null, 'no box on row 1');
    for (const k of [1, 2, 3]) assert.ok(await page.$('[data-f="holeout"][data-k="' + k + '"]'), 'box on row ' + (k + 1));
    assert.strictEqual(await page.$('select[data-f="loc"][data-k="2"] option[value="holedx"]'), null, '"In the hole (chip/shot)" no longer offered on new rows');
    assert.match(await page.textContent('#hint'), /tick “Hole out” on the shot that went in/);
    // tick row 3 with a 4th row below: confirm (dismiss first -> nothing changes)
    answer = false; await page.click('[data-f="holeout"][data-k="2"]'); await page.waitForTimeout(150);
    assert.match(dialogs[0], /Shot 3 went in\? Shot 4 comes after it and will be deleted/); assert.strictEqual(await page.$$eval('.srow[data-k]', e => e.length), 4);
    assert.strictEqual(await page.isChecked('[data-f="holeout"][data-k="2"]'), false);
    answer = true; await page.click('[data-f="holeout"][data-k="2"]'); await page.waitForTimeout(150);
    assert.strictEqual(await page.$$eval('.srow[data-k]', e => e.length), 3, 'shot 4 removed');
    assert.strictEqual(await page.$eval('select[data-f="loc"][data-k="2"]', s => s.value), 'deep', 'lie kept');
    assert.ok(await page.isChecked('[data-f="holeout"][data-k="2"]')); assert.strictEqual(await page.$('[data-act="addShot"]'), null, 'no Add Shot once holed');
    assert.strictEqual(await page.$('#micbtn'), null); assert.match(await page.textContent('#hint'), /All set – tap Finish hole/);
    assert.match(await page.textContent('.sinfo[data-info="2"]'), /in the hole!/); assert.match(await page.textContent('#count'), /^3 strokes/);
    // one per hole: ticking row 2 (with row 3 below) moves the tick
    await page.click('[data-f="holeout"][data-k="1"]'); await page.waitForTimeout(150);
    assert.match(dialogs[dialogs.length - 1], /Shot 2 went in\? Shot 3 comes after it/);
    let st = await page.evaluate(() => window.__golf.rounds()[0].holes[0].rows.map(r => [r.loc, !!r.holeOut]));
    assert.deepStrictEqual(st, [['tee', false], ['fairway', true]]);
    // untick -> Add Shot comes back; rebuild shot 3 and tick it again
    await page.click('[data-f="holeout"][data-k="1"]'); await page.waitForTimeout(100); assert.ok(await page.$('[data-act="addShot"]'));
    await page.click('[data-act="addShot"]'); await page.fill('input[data-row="2"]', '25'); await page.selectOption('select[data-f="loc"][data-k="2"]', 'deep');
    await page.click('[data-f="holeout"][data-k="2"]'); await page.waitForTimeout(100);
    // Insert shot below the holed-out row: the new row becomes the hole-out; deleting it leaves the hole open again
    await page.click('button.c-n[data-k="2"]'); await page.click('[data-act="insAfter"][data-k="2"]'); await page.waitForTimeout(100);
    st = await page.evaluate(() => window.__golf.rounds()[0].holes[0].rows.map(r => !!r.holeOut)); assert.deepStrictEqual(st, [false, false, false, true]);
    await page.click('[data-act="del"][data-k="3"]'); await page.waitForTimeout(100); assert.ok(await page.$('[data-act="addShot"]'));
    await page.click('[data-f="holeout"][data-k="2"]'); await page.waitForTimeout(100);
    const nD = dialogs.length; assert.ok(!(await page.isDisabled('[data-act="finish"]')));
    await page.click('[data-act="finish"]'); await page.waitForSelector('.hole-done'); assert.strictEqual(dialogs.length, nD, 'no confirm when nothing after');
    assert.match(await page.textContent('.hole-done'), /Score 3 \(-1\)/);
    assert.ok(await page.isDisabled('[data-f="holeout"][data-k="2"]'), 'box locked on a finished hole');
    st = await page.evaluate(() => { const r = window.__golf.rounds()[0]; return { rows: r.holes[0].rows.map(x => [x.dist, x.loc, !!x.holeOut]), fin: r.holes[0].finished, saved: JSON.parse(localStorage.getItem('golfsg.rounds.v1'))[0].holes[0].rows[2].holeOut }; });
    assert.deepStrictEqual(st, { rows: [[467, 'tee', false], [155, 'fairway', false], [25, 'deep', true]], fin: true, saved: true });
    // old hole 2 untouched and still finished, summary/CSV fine
    await page.click('[data-act="next"]'); assert.match(await page.textContent('.hole-done'), /Score 4/);
    const csv = await page.evaluate(() => window.__golf.csvFor ? window.__golf.csvFor([window.__golf.rounds()[0]]) : ''); if (csv) assert.ok(/deep|Deep/i.test(csv), 'CSV has the deep rough start');
    await page.click('[data-act="summary"]:not([data-end])'); await page.waitForSelector('.big-score'); assert.match(await page.textContent('.big-score'), /7/);
    // live viewer renders the hole-out (mocked database)
    const S = await page.evaluate(() => LIVE.snapshot(window.__golf.rounds()[0], SG, { name: 'Quincy', now: Date.now() }));
    const VID = 'Hole' + 'x'.repeat(28);
    await ctx.unroute(/firebaseio\.com/); await ctx.route(/firebaseio\.com/, route => route.request().url().includes(VID) ? route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(S) }) : route.abort('internetdisconnected'));
    const W = await ctx.newPage(); await W.addInitScript(() => { delete window.EventSource; }); W.on('pageerror', e => errors.push(String(e)));
    await W.goto(BASE + '?watch=' + VID); await W.waitForSelector('#lvcard'); await W.click('[data-lh="0"]'); await W.waitForTimeout(200);
    const vt = await W.textContent('#lvpage'); assert.ok(vt.includes('Deep rough · 25 yd – in the hole!'), 'viewer shows the lie of the hole-out');
    assert.deepStrictEqual(errors, []);
    console.log('HOLEOUT OK (' + (n + 1) + ' groups)');
  } finally { await b.close(); srv.kill(); }
})().catch(e => { console.error(e); process.exit(1); });
