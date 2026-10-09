// Run: node --test tests/
const test = require('node:test');
const assert = require('node:assert');
const SG = require('../sg.js');
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: ${a} != ${b}`);

test('baseline table lookups (Broadie)', () => {
  near(SG.expected('tee', 400), 3.99, 'tee 400');
  near(SG.expected('fairway', 100), 2.80, 'fw 100');
  near(SG.expected('rough', 150), (3.15 + 3.23) / 2, 'rough 150 interpolated');
  near(SG.expected('sand', 20), 2.53, 'sand 20');
  near(SG.expected('green', 10), 1.61, 'putt 10ft');
  near(SG.expected('green', 3), 1.04, 'putt 3ft');
  near(SG.expected('deep', 100), 3.02 + 0.15, 'deep rough estimate');
  near(SG.expected('hazard', 100), 3.80, 'hazard uses recovery');
  near(SG.expected('holed', 0), 0, 'holed');
  // Columns all same length, monotonic-ish sanity for fairway/putts
  for (const k in SG.OFF_GREEN) assert.strictEqual(SG.OFF_GREEN[k].length, SG.YARDS.length, k);
  for (let i = 1; i < SG.PUTTS.length; i++) assert.ok(SG.PUTTS[i] >= SG.PUTTS[i - 1]);
});

test('sample par 4: 400 yd, drive to 150 fw, approach to 20 ft, 1 putt', () => {
  const hole = { par: 4, yards: 400, shots: [
    { lie: 'fairway', dist: 150, pen: 'none' },
    { lie: 'green', dist: 20, pen: 'none' },
    { lie: 'holed', dist: 0, pen: 'none' }] };
  const a = SG.analyzeHole(hole);
  const e150 = (2.91 + 2.98) / 2;
  near(a.shots[0].sg, 3.99 - e150 - 1, 'drive SG');
  near(a.shots[1].sg, e150 - 1.87 - 1, 'approach SG');
  near(a.shots[2].sg, 1.87 - 1, 'putt SG');
  near(a.sg, 3.99 - 3, 'total SG = E(tee) - strokes');
  assert.strictEqual(a.shots[0].hit, 250, 'drive distance 400-150');
  assert.strictEqual(a.shots[1].hit, 143, 'approach 150 - 20ft/3');
  assert.deepStrictEqual(a.shots.map(s => s.cat), ['tee', 'approach', 'putting']);
  assert.strictEqual(a.shots[1].bucket, '150-200 yd');
  assert.strictEqual(a.shots[2].bucket, '15-30 ft');
  assert.strictEqual(a.strokes, 3);
  assert.ok(a.done && a.gir && a.fairway);
  assert.strictEqual(a.putts, 1);
});

test("Scott's example: 300-yd hole, 2nd shot at 100 = 200-yd drive", () => {
  const a = SG.analyzeHole({ par: 4, yards: 300, shots: [{ lie: 'fairway', dist: 100, pen: 'none' }] });
  assert.strictEqual(a.shots[0].hit, 200);
});

test('OB is stroke and distance; water adds 1 stroke from drop', () => {
  const hole = { par: 4, yards: 400, shots: [
    { lie: 'rough', dist: 999, side: 'R', pen: 'ob' },   // lie/dist ignored for OB
    { lie: 'rough', dist: 180, side: 'L', pen: 'water' },
    { lie: 'green', dist: 30, pen: 'none' },
    { lie: 'green', dist: 2, pen: 'none' },
    { lie: 'holed', dist: 0, pen: 'none' }] };
  const a = SG.analyzeHole(hole);
  near(a.shots[0].sg, -2, 'OB costs exactly 2 strokes vs baseline');
  assert.strictEqual(a.shots[1].start.lie, 'tee'); assert.strictEqual(a.shots[1].start.dist, 400);
  assert.strictEqual(a.shots[1].cat, 'tee', 're-tee is still off-the-tee');
  near(a.shots[1].sg, 3.99 - 3.31 - 2, 'water drop SG');
  assert.strictEqual(a.strokes, 7); assert.strictEqual(a.penalties, 2);
  near(a.sg, 3.99 - 7, 'total SG identity');
  assert.strictEqual(a.fairway, false); assert.strictEqual(a.gir, false);
  assert.strictEqual(a.shots[0].hit, null);
});

test('par 3 tee shot = approach; short game within 30 yd', () => {
  const a = SG.analyzeHole({ par: 3, yards: 165, shots: [
    { lie: 'sand', dist: 15, side: 'L', pen: 'none' },
    { lie: 'green', dist: 4, pen: 'none' },
    { lie: 'holed', dist: 0, pen: 'none' }] });
  assert.deepStrictEqual(a.shots.map(s => s.cat), ['approach', 'short', 'putting']);
  assert.strictEqual(a.shots[0].bucket, '150-200 yd');
  assert.strictEqual(a.fairway, null);
  assert.strictEqual(a.gir, false);
});

test('round summary totals', () => {
  const round = { holes: [
    { par: 4, yards: 400, shots: [{ lie: 'fairway', dist: 150, pen: 'none' }, { lie: 'green', dist: 20, pen: 'none' }, { lie: 'holed', pen: 'none' }] },
    { par: 3, yards: 165, shots: [{ lie: 'sand', dist: 15, side: 'L', pen: 'none' }, { lie: 'green', dist: 4, pen: 'none' }, { lie: 'green', dist: 1, pen: 'none' }, { lie: 'holed', pen: 'none' }] },
    { par: 5, yards: 520, shots: [] }] };
  const S = SG.summarize(round);
  assert.strictEqual(S.strokes, 7); assert.strictEqual(S.par, 7); assert.strictEqual(S.toPar, 0);
  assert.strictEqual(S.holesDone, 2); assert.strictEqual(S.putts, 3);
  assert.strictEqual(S.fwHit, 1); assert.strictEqual(S.fwTotal, 1);
  assert.strictEqual(S.gir, 1); assert.strictEqual(S.allLeft, 1);
  near(S.sgTotal, (3.99 - 3) + (SG.expected('tee', 165) - 4), 'round SG');
  const catSum = Object.values(S.cats).reduce((a, c) => a + c.sg, 0);
  near(catSum, S.sgTotal, 'categories add up');
});

// ---- Row model v3: ONE ROW = ONE STROKE, hit FROM Dist/Loc; last row = "In the hole" with its own distance ----
const R = (dist, loc, dir = '', pen = false) => ({ dist, loc, dir, pen });

test("Scott's hole: 365 Tee, 100 Fairway L, 6 ft Green, In the hole (no distance) = 4 strokes, NOT complete", () => {
  const rows = [R(365, 'tee'), R(100, 'fairway', 'L'), R(6, 'green'), R('', 'holed')];
  const a = SG.analyzeHole({ par: 4, finished: false, rows });
  assert.strictEqual(SG.rowStrokes(rows), 4, 'row count = 4 strokes');
  assert.strictEqual(a.liveStrokes, 4);
  assert.ok(!a.complete, 'incomplete while the holing putt has no distance');
  assert.strictEqual(a.problem, 'dist'); assert.strictEqual(a.bad, 3);
  assert.ok(!a.shots.some(s => s.end.lie === 'holed'), 'the 6 ft putt is NOT marked holed');
  assert.strictEqual(SG.summarize({ holes: [{ par: 4, finished: true, rows }] }).strokes, 0, 'never totalled while incomplete');
});

test("Scott's hole completed: ... 6 ft Green, 1 ft In the hole = 4 strokes (E)", () => {
  const rows = [R(365, 'tee'), R(100, 'fairway', 'L'), R(6, 'green'), R(1, 'holed')];
  const hole = { par: 4, finished: true, rows };
  const a = SG.analyzeHole(hole);
  assert.ok(a.complete && a.done); assert.strictEqual(a.strokes, 4); assert.strictEqual(a.liveStrokes, 4);
  assert.deepStrictEqual(rows.map((_, k) => SG.rowUnit(rows, k)), ['yd', 'yd', 'ft', 'ft']);
  assert.deepStrictEqual(a.shots.map(s => s.cat), ['tee', 'approach', 'putting', 'putting']);
  assert.strictEqual(a.shots[0].hit, 265, 'drive 365 - 100');
  assert.strictEqual(a.shots[0].side, 'L', 'L on the 100 row = drive missed left');
  assert.strictEqual(a.shots[1].hit, 98, 'approach 100 - 6ft/3');
  near(a.shots[2].sg, SG.expected('green', 6) - SG.expected('green', 1) - 1, 'missed 6-footer');
  near(a.shots[3].sg, SG.expected('green', 1) - 1, 'holed 1-footer');
  near(a.sg, SG.expected('tee', 365) - 4, 'SG identity: E(tee) - strokes');
  assert.strictEqual(a.putts, 2); assert.ok(a.gir); assert.ok(a.fairway);
  const S = SG.summarize({ holes: [hole] }); assert.strictEqual(S.strokes, 4); assert.strictEqual(S.toPar, 0);
});

test('earlier example: 365 Tee, 130 F, 15 ft G, 3 ft In the hole = 4', () => {
  const rows = [R(365, 'tee'), R(130, 'fairway'), R(15, 'green'), R(3, 'holed')];
  const a = SG.analyzeHole({ par: 4, finished: true, rows });
  assert.strictEqual(a.strokes, 4); assert.ok(a.done);
  near(a.sg, SG.expected('tee', 365) - 4, 'identity');
});

test('Finish rules: unfinished, missing loc, not ending in the hole, rows after the hole', () => {
  const rows = [R(365, 'tee'), R(130, 'fairway'), R(15, 'green'), R(3, 'holed')];
  const a = SG.analyzeHole({ par: 4, rows });
  assert.ok(a.complete && !a.done, 'complete but not finished until Finish hole');
  assert.strictEqual(SG.summarize({ holes: [{ par: 4, rows }] }).strokes, 0);
  assert.strictEqual(SG.analyzeHole({ par: 4, rows: [R(365, 'tee'), R(130, '')] }).problem, 'loc');
  assert.strictEqual(SG.analyzeHole({ par: 4, rows: [R(365, 'tee'), R(130, 'green')] }).problem, 'last');
  assert.strictEqual(SG.analyzeHole({ par: 4, rows: [R('', 'tee')] }).problem, 'dist');
  const e = SG.analyzeHole({ par: 4, rows: [R(365, 'tee'), R(3, 'holed'), R(2, 'green')] });
  assert.strictEqual(e.problem, 'after'); assert.ok(!e.complete);
});

test('chip-in (off green, yards) and ace', () => {
  const a = SG.analyzeHole({ par: 4, finished: true, rows: [R(380, 'tee'), R(20, 'holedx')] });
  assert.strictEqual(a.strokes, 2); assert.strictEqual(a.shots[1].cat, 'short');
  near(a.shots[1].sg, SG.expected('fairway', 20) - 1, 'off-green hole-out uses fairway baseline');
  const ace = SG.analyzeHole({ par: 3, finished: true, rows: [R(165, 'holedx')] });
  assert.strictEqual(ace.strokes, 1); near(ace.sg, SG.expected('tee', 165) - 1, 'ace');
});

test('OB re-hit row = stroke and distance; hazard + P = drop; hazard alone = play it', () => {
  const rows = [R(400, 'tee'), R('', 'ob', 'R'), R(170, 'hazard', 'L', true), R(30, 'hazard'), R(12, 'green'), R(2, 'holed')];
  const a = SG.analyzeHole({ par: 4, finished: true, rows });
  assert.strictEqual(SG.distOf(rows, 1), 400); assert.strictEqual(SG.lieOf(rows, 1), 'tee');
  assert.strictEqual(SG.lieOf(rows, 2), 'rough'); assert.strictEqual(SG.lieOf(rows, 3), 'hazard');
  near(a.shots[0].sg, -2, 'OB costs 2');
  assert.strictEqual(a.shots[1].cat, 'tee', 're-tee is still off the tee');
  near(a.shots[1].sg, 3.99 - SG.expected('rough', 170) - 2, 'water drop');
  assert.strictEqual(a.penalties, 2); assert.strictEqual(SG.rowStrokes(rows), 8); assert.strictEqual(a.strokes, 8);
  near(a.sg, 3.99 - 8, 'identity');
});

test('migration: v2 rows keep 1:1 (holed row now needs a distance); v1 shots collapse correctly', () => {
  const v2 = [{ loc: 'tee', dist: 365 }, { loc: 'fairway', dist: 100, dir: 'L' }, { loc: 'green', dist: 6 }, { loc: 'holed', dist: '' }];
  const m = SG.migrateV2Rows(v2);
  assert.deepStrictEqual(m.map(r => r.loc), ['tee', 'fairway', 'green', 'holed']);
  const a = SG.analyzeHole({ par: 4, rows: m });
  assert.strictEqual(SG.rowStrokes(m), 4); assert.ok(!a.complete);
  const old = { par: 4, yards: 400, shots: [
    { lie: 'rough', dist: 999, side: 'R', pen: 'ob' }, { lie: 'rough', dist: 180, side: 'L', pen: 'water' },
    { lie: 'sand', dist: 20, side: 'L', pen: 'none' }, { lie: 'green', dist: 6, pen: 'none' }, { lie: 'holed', pen: 'none' }] };
  const o = SG.analyzeHole(old), rows = SG.v1ToRows(old);
  assert.deepStrictEqual(rows.map(r => r.loc), ['tee', 'ob', 'rough', 'bunker', 'holed']);
  const b = SG.analyzeHole({ par: 4, finished: true, rows });
  assert.ok(b.complete); assert.strictEqual(b.strokes, o.strokes); near(b.sg, o.sg, 'same SG');
});

test('summary counts short/over approach misses', () => {
  const S = SG.summarize({ holes: [{ par: 4, finished: true, rows: [R(400, 'tee'), R(150, 'fairway'), R(25, 'rough', 'S'), R(5, 'green'), R(1, 'holed')] }] });
  assert.strictEqual(S.apprShort, 1); assert.strictEqual(S.strokes, 5);
});

// ---- Baselines ----
test('PGA table matches Broadie (2011) Table 9 incl. corrected 420-600 yd rows', () => {
  near(SG.expected('fairway', 440), 4.27, 'fw 440'); near(SG.expected('rough', 600), 5.25, 'rough 600');
  near(SG.expected('sand', 500), 5.40, 'sand 500'); near(SG.expected('recovery', 520), 5.32, 'rec 520');
  near(SG.expected('tee', 600), 4.82, 'tee 600'); near(SG.expected('fairway', 400), 4.11, 'fw 400');
  near(SG.expected('green', 8), 1.50, 'putt 8'); near(SG.expected('green', 30), 1.98, 'putt 30');
});

test('six baselines exist; only PGA is sourced', () => {
  assert.deepStrictEqual(SG.BASELINES.map(b => b.id), ['pga', 'lpga', 'd1m', 'd1w', 'scm', 'scw']);
  assert.deepStrictEqual(SG.BASELINES.filter(b => b.status === 'sourced').map(b => b.id), ['pga']);
  assert.deepStrictEqual(SG.BASELINES.map(b => b.gap), [0, 4.7, 2.1, 5.5, 5.5, 6.8]);
});

test('each estimated baseline reproduces its sourced per-round gap by category on the calibration round', () => {
  for (const b of SG.BASELINES) {
    if (b.id === 'pga') continue;
    const l = SG.catLoss(SG.CALIB_ROUND, b.id);
    for (const c of ['tee', 'approach', 'short', 'putting']) near(+l[c].toFixed(9), +b.targets[c].toFixed(9), `${b.id} ${c}`);
    const total = Object.values(l).reduce((x, y) => x + y, 0);
    assert.ok(Math.abs(total - b.gap) < 1e-9, `${b.id} total ${total}`);
    // scratch men: 2.5 / 1.5 / 0.5 / 1.0 (SwingU)
    if (b.id === 'scm') { near(+l.tee.toFixed(9), 2.5, 'scm tee'); near(+l.putting.toFixed(9), 1.0, 'scm putt'); }
  }
});

test('baselines are ordered sensibly and monotone in distance', () => {
  const order = ['pga', 'd1m', 'lpga', 'scm', 'scw'];
  for (const [lie, d] of [['tee', 420], ['fairway', 150], ['rough', 30], ['sand', 15], ['green', 20]]) {
    const v = order.map(id => SG.expected(lie, d, id));
    for (let i = 1; i < v.length; i++) assert.ok(v[i] >= v[i - 1], `${lie} ${d}: ${order[i]} >= ${order[i - 1]}`);
  }
  for (const id of order) for (let d = 20; d <= 600; d += 20) assert.ok(SG.expected('fairway', d, id) >= SG.expected('fairway', d - 20, id) - 1e-9);
  near(SG.expected('holed', 0, 'scw'), 0, 'holed is 0 for all');
});

test("same round, different baseline: SG identity holds and Scott's 4 is still 4", () => {
  const rows = [R(365, 'tee'), R(100, 'fairway', 'L'), R(6, 'green'), R(1, 'holed')];
  for (const b of SG.BASELINES) {
    const a = SG.analyzeHole({ par: 4, finished: true, rows }, b.id);
    assert.strictEqual(a.strokes, 4);
    near(a.sg, SG.expected('tee', 365, b.id) - 4, b.id + ' identity');
  }
  const S1 = SG.summarize({ holes: [{ par: 4, finished: true, rows }] }, 'pga');
  const S2 = SG.summarize({ holes: [{ par: 4, finished: true, rows }] }, 'scm');
  assert.ok(S2.sgTotal > S1.sgTotal, 'gains more vs scratch than vs tour'); assert.strictEqual(S2.baseline, 'scm');
  const S3 = SG.summarize({ baseline: 'lpga', holes: [{ par: 4, finished: true, rows }] });
  assert.strictEqual(S3.baseline, 'lpga', 'round setting used by default');
});

// ---- 8-way direction, approach misses, GIR map ----
test('8-way directions: names, migration of old L/R/S/O codes', () => {
  assert.deepStrictEqual(SG.DIR8.slice().sort(), ['left', 'long', 'longleft', 'longright', 'right', 'short', 'shortleft', 'shortright']);
  assert.strictEqual(SG.DIR_NAME.shortleft, 'Short left'); assert.strictEqual(SG.DIR_NAME.long, 'Long');
  assert.deepStrictEqual(['S', 'O', 'L', 'R', '', 'x', 'longright'].map(SG.normDir), ['short', 'long', 'left', 'right', '', '', 'longright']);
  assert.strictEqual(SG.DIR_ANGLE.short, 270); assert.strictEqual(SG.DIR_ANGLE.long, 90); assert.strictEqual(SG.DIR_ANGLE.left, 180);
  const m = SG.migrateV2Rows([{ loc: 'tee', dist: 400 }, { loc: 'rough', dist: 150, dir: 'O' }, { loc: 'green', dist: 9, dir: 'S' }, { loc: 'holed', dist: 1 }]);
  assert.deepStrictEqual(m.map(r => r.dir), ['', 'long', 'short', '']);
});

test('approach miss = approach that did not finish on the green, with its direction vs the green', () => {
  const S = SG.summarize({ holes: [
    // par 4: drive, approach 150 misses short-left into rough, chip, putt
    { par: 4, finished: true, rows: [R(400, 'tee'), R(150, 'fairway', 'right'), R(15, 'rough', 'shortleft'), R(6, 'green'), R(1, 'holed')] },
    // par 3: tee shot (an approach) misses right into a bunker
    { par: 3, finished: true, rows: [R(170, 'tee'), R(12, 'bunker', 'right'), R(4, 'green'), R(1, 'holed')] },
    // par 4: approach hits the green long-right 18 ft from the hole -> GIR, not a miss
    { par: 4, finished: true, rows: [R(380, 'tee'), R(140, 'fairway'), R(18, 'green', 'longright'), R(2, 'green'), R(1, 'holed')] },
    // old code 'S' on a missed approach still counts as Short
    { par: 4, finished: true, rows: [R(390, 'tee'), R(120, 'fairway'), R(10, 'fairway', 'S'), R(3, 'green'), R(1, 'holed')] },
    // unfinished hole is ignored
    { par: 4, finished: false, rows: [R(390, 'tee'), R(120, 'fairway'), R(10, 'rough', 'long')] }
  ] });
  assert.deepStrictEqual(S.apprMiss.map(m => [m.hole, m.dir, m.lie]), [[1, 'shortleft', 'rough'], [2, 'right', 'sand'], [4, 'short', 'fairway']]);
  assert.strictEqual(S.teeRight, 1, 'tee shot that ended right of the fairway');
  assert.strictEqual(S.apprShort, 2); assert.strictEqual(S.apprOver, 1); assert.strictEqual(S.apprLeft, 1); assert.strictEqual(S.apprRight, 2);
  assert.strictEqual(S.gir, 1);
  assert.deepStrictEqual(S.girMap.map(g => [g.hole, g.dir, g.ft, g.holed]), [[3, 'longright', 18, false]]);
});

test('GIR map uses the shot that reached the green in regulation; par 5 in 3; holed from off green; penalties count', () => {
  const S = SG.summarize({ holes: [
    { par: 5, finished: true, rows: [R(540, 'tee'), R(260, 'fairway'), R(90, 'fairway'), R(35, 'green', 'short'), R(3, 'green'), R(1, 'holed')] },
    { par: 4, finished: true, rows: [R(400, 'tee'), R(130, 'holedx')] }, // approach holed for eagle 2
    // drop (+1) means the green is reached in 3 on a par 4 -> not GIR
    { par: 4, finished: true, rows: [R(400, 'tee'), R(160, 'hazard', 'left', true), R(8, 'green', 'left'), R(1, 'holed')] },
    // green reached in 3 on a par 4 -> not GIR
    { par: 4, finished: true, rows: [R(400, 'tee'), R(200, 'rough'), R(30, 'rough', 'short'), R(9, 'green', 'left'), R(1, 'holed')] }
  ] });
  assert.deepStrictEqual(S.girMap.map(g => [g.hole, g.dir, g.ft, g.holed]), [[1, 'short', 35, false], [2, '', 0, true]]);
  assert.strictEqual(S.gir, 2); assert.strictEqual(S.girHoles, 4);
  // the par-5 lay-up (260 -> 90 yd fairway, no direction) is not an approach miss; hole 3's drop was off the tee
  assert.deepStrictEqual(S.apprMiss.map(m => [m.hole, m.dir, m.lie, m.pen]), [[4, 'short', 'rough', false]]);
  const S2 = SG.summarize({ holes: [{ par: 5, finished: true, rows: [R(540, 'tee'), R(250, 'fairway'), R(60, 'fairway', 'right'), R(8, 'green'), R(1, 'holed')] },
    { par: 4, finished: true, rows: [R(420, 'tee'), R(230, 'rough'), R(40, 'rough'), R(5, 'green'), R(1, 'holed')] },
    { par: 4, finished: true, rows: [R(420, 'tee'), R(200, 'fairway'), R(200, 'ob', 'right'), R(10, 'green'), R(1, 'holed')] }] });
  assert.deepStrictEqual(S2.apprMiss.map(m => [m.hole, m.dir, m.lie, m.pen]), [[1, 'right', 'fairway', false], [2, '', 'rough', false], [3, 'right', 'ob', true]],
    'a lay-up with a direction counts; within 50 yd counts even without a direction; OB approach counts');
});

// ---- Pin location + tee-shot map ----
test('pin location: 9 segments, front = toward golfer, kept on the hole, invalid values dropped', () => {
  assert.deepStrictEqual(SG.PIN_GRID, [['backleft', 'backcenter', 'backright'], ['midleft', 'center', 'midright'], ['frontleft', 'frontcenter', 'frontright']]);
  assert.strictEqual(Object.keys(SG.PIN_NAME).length, 9); assert.strictEqual(SG.PIN_NAME.frontleft, 'Front left');
  assert.strictEqual(SG.normPin('bogus'), ''); assert.strictEqual(SG.normPin(undefined), '');
  const rows = [R(365, 'tee'), R(100, 'fairway'), R(6, 'green'), R(1, 'holed')];
  assert.strictEqual(SG.analyzeHole({ par: 4, finished: true, pin: 'backright', rows }).pin, 'backright');
  assert.strictEqual(SG.analyzeHole({ par: 4, finished: true, rows }).pin, '');
  assert.strictEqual(SG.analyzeHole({ par: 4, finished: true, pin: 'x', rows }).strokes, 4, 'pin does not affect scoring');
});

test('tee-shot map: par 4/5 first tee shots, fairway vs miss kind and side, distance hit', () => {
  const S = SG.summarize({ holes: [
    { par: 4, finished: true, rows: [R(400, 'tee'), R(140, 'fairway'), R(10, 'green'), R(1, 'holed')] },
    { par: 4, finished: true, rows: [R(420, 'tee'), R(170, 'rough', 'left'), R(10, 'green'), R(1, 'holed')] },
    { par: 5, finished: true, rows: [R(530, 'tee'), R(260, 'bunker', 'shortright'), R(90, 'fairway'), R(5, 'green'), R(1, 'holed')] },
    { par: 4, finished: true, rows: [R(410, 'tee'), R('', 'ob', 'right'), R(150, 'trees', 'left'), R(10, 'green'), R(1, 'holed')] },
    { par: 4, finished: true, rows: [R(400, 'tee'), R(160, 'hazard', 'left', true), R(10, 'green'), R(1, 'holed')] },
    { par: 4, finished: true, rows: [R(390, 'tee'), R(150, 'deep'), R(10, 'green'), R(1, 'holed')] },
    { par: 3, finished: true, rows: [R(170, 'tee'), R(10, 'green'), R(1, 'holed')] },
    { par: 4, finished: false, rows: [R(400, 'tee'), R(150, 'rough', 'right')] }
  ] });
  assert.deepStrictEqual(S.teeMap.map(t => [t.hole, t.fairway, t.kind, t.side, t.hit]), [
    [1, true, 'fairway', '', 260], [2, false, 'rough', 'L', 250], [3, false, 'bunker', 'R', 270],
    [4, false, 'ob', 'R', null], [5, false, 'hazard', 'L', 240], [6, false, 'rough', '', 240]]);
  assert.strictEqual(S.fwHit, 1); assert.strictEqual(S.fwTotal, 6);
  assert.strictEqual(S.teeLeft, 3, 'drive left + re-tee left + hazard left');
});

// ---- Bug fixes from Scott's real round: GIR / approach-miss rules ----
test('par-3 tee shot followed by an "In the hole" putt row = on the green: GIR, not a miss, first putt ft', () => {
  const S = SG.summarize({ holes: [{ par: 3, finished: true, rows: [R(165, 'tee'), R(8, 'holed')] }] });
  assert.strictEqual(S.gir, 1); assert.strictEqual(S.apprMiss.length, 0);
  assert.deepStrictEqual(S.girMap.map(g => [g.hole, g.ft, g.holed, g.dir]), [[1, 8, false, '']]);
  const S2 = SG.summarize({ holes: [{ par: 3, finished: true, rows: [R(165, 'tee'), R(8, 'holed', 'shortright')] }] });
  assert.deepStrictEqual(S2.girMap.map(g => [g.ft, g.dir]), [[8, 'shortright']]);
});

test('holing out from off the green is never an approach miss and counts as reaching the green', () => {
  const S = SG.summarize({ holes: [
    // eagle 2: wedge from 120 fairway holed
    { par: 4, finished: true, rows: [R(400, 'tee'), R(120, 'holedx')] },
    // approach finished 15 yd off, then chipped in: Scott's rule -> green reached, not a miss (par 4 in 2 -> GIR)
    { par: 4, finished: true, rows: [R(400, 'tee'), R(120, 'fairway'), R(15, 'holedx')] },
    // ace
    { par: 3, finished: true, rows: [R(150, 'holedx')] },
    // a real miss for contrast
    { par: 4, finished: true, rows: [R(400, 'tee'), R(120, 'fairway'), R(15, 'rough'), R(4, 'green'), R(1, 'holed')] }
  ] });
  assert.deepStrictEqual(S.apprMiss.map(m => m.hole), [4]);
  assert.strictEqual(S.gir, 3); assert.strictEqual(S.girHoles, 4);
  assert.deepStrictEqual(S.girMap.map(g => [g.hole, g.holed, g.ft]), [[1, true, 0], [2, true, 0], [3, true, 0]]);
  assert.strictEqual(S.holes[1].strokes, 3, 'scoring unchanged'); near(S.holes[1].shots[1].eEnd, SG.expected('fairway', 15), 'SG still uses the real lie');
});

test('GIR tile count always equals GIR map entries (5 GIR incl. no-direction, holed, >30 ft)', () => {
  const holes = [
    { par: 4, finished: true, rows: [R(400, 'tee'), R(150, 'fairway'), R(12, 'green', 'left'), R(1, 'holed')] },
    { par: 4, finished: true, rows: [R(380, 'tee'), R(140, 'fairway'), R(20, 'green'), R(2, 'green'), R(1, 'holed')] },     // no direction
    { par: 3, finished: true, rows: [R(170, 'tee'), R(6, 'holed')] },                                                        // putt row, no dir
    { par: 5, finished: true, rows: [R(520, 'tee'), R(250, 'fairway'), R(90, 'fairway'), R(45, 'green'), R(4, 'green'), R(1, 'holed')] }, // >30 ft, no dir
    { par: 4, finished: true, rows: [R(360, 'tee'), R(110, 'holedx')] },                                                     // hole-out
    { par: 4, finished: true, rows: [R(420, 'tee'), R(180, 'rough'), R(20, 'rough', 'short'), R(5, 'green'), R(1, 'holed')] }, // not GIR
    { par: 3, finished: true, rows: [R(190, 'tee'), R(15, 'bunker', 'left'), R(3, 'green'), R(1, 'holed')] }                   // not GIR
  ];
  const S = SG.summarize({ holes });
  assert.strictEqual(S.gir, 5); assert.strictEqual(S.girHoles, 7); assert.strictEqual(S.girMap.length, S.gir);
  assert.deepStrictEqual(S.girMap.map(g => [g.hole, g.ft, g.dir, g.holed]), [[1, 12, 'left', false], [2, 20, '', false], [3, 6, '', false], [4, 45, '', false], [5, 0, '', true]]);
  assert.strictEqual(S.apprMiss.length, 2);
  // random rounds: tile == map
  for (let n = 0; n < 200; n++) {
    const pick = a => a[Math.floor(Math.random() * a.length)];
    const hs = [];
    for (let i = 0; i < 18; i++) {
      const par = pick([3, 4, 4, 5]), rows = [R(par * 120, 'tee')]; let d = par * 120;
      while (rows.length < 7 && Math.random() < 0.8) {
        const loc = pick(['fairway', 'rough', 'bunker', 'green', 'holed', 'holedx', 'trees']);
        d = Math.max(1, Math.round(d * 0.4)); rows.push(R(d, loc, pick(['', 'left', 'long', 'short'])));
        if (loc === 'holed' || loc === 'holedx') break;
      }
      hs.push({ par, finished: true, rows });
    }
    const T = SG.summarize({ holes: hs });
    assert.strictEqual(T.girMap.length, T.gir);
  }
});

// ---- Pin-location map data ----
test('pin map data: approaches tagged with the hole pin; holes with/without pin; same reach-green rule', () => {
  const S = SG.summarize({ holes: [
    { par: 4, finished: true, pin: 'frontleft', rows: [R(400, 'tee'), R(150, 'fairway'), R(12, 'green', 'longright'), R(1, 'holed')] },
    { par: 4, finished: true, pin: 'frontleft', rows: [R(400, 'tee'), R(150, 'fairway'), R(15, 'bunker', 'short'), R(3, 'green'), R(1, 'holed')] },
    { par: 3, finished: true, pin: 'frontleft', rows: [R(160, 'tee'), R(7, 'holed')] },
    { par: 4, finished: true, pin: 'backright', rows: [R(360, 'tee'), R(110, 'holedx')] },
    { par: 4, finished: true, rows: [R(400, 'tee'), R(150, 'fairway'), R(20, 'rough', 'left'), R(3, 'green'), R(1, 'holed')] },
    { par: 4, finished: false, pin: 'center', rows: [R(400, 'tee'), R(150, 'fairway')] }
  ] });
  assert.deepStrictEqual(S.pinHoles.map(p => [p.hole, p.pin, p.gir]), [[1, 'frontleft', true], [2, 'frontleft', false], [3, 'frontleft', true], [4, 'backright', true]]);
  assert.strictEqual(S.noPin, 1, 'finished hole without pin');
  assert.deepStrictEqual(S.girMap.map(g => [g.hole, g.pin, g.ft, g.dir, g.holed]), [[1, 'frontleft', 12, 'longright', false], [3, 'frontleft', 7, '', false], [4, 'backright', 0, '', true]]);
  assert.deepStrictEqual(S.apprMiss.map(m => [m.hole, m.pin, m.dir, m.lie, m.dist]), [[2, 'frontleft', 'short', 'sand', 15], [5, '', 'left', 'rough', 20]]);
});

// ---- Pin map counts HOLES: one approach-into-the-green per hole ----
test('keyApproach: one entry per hole (par 5 two long shots, missed-then-chip, drive the green, OB re-hit)', () => {
  const A = rows => SG.analyzeHole({ par: rows[0], finished: true, rows: rows[1] }).appr;
  const pick = a => [a.shot, a.hit, a.gir, a.holed, a.dir, a.ft, a.lie, a.dist];
  // par 5: 250 lay-up then wedge onto the green -> only the wedge (shot 3), GIR
  assert.deepStrictEqual(pick(A([5, [R(540, 'tee'), R(250, 'fairway'), R(90, 'fairway'), R(12, 'green', 'left'), R(1, 'holed')]])), [3, true, true, false, 'left', 12, 'green', 0]);
  // par 5: 2nd shot misses into rough 40 yd, pitch from 40 onto the green in 3 -> shot 3 (from >30) hit, GIR
  assert.deepStrictEqual(pick(A([5, [R(540, 'tee'), R(250, 'fairway'), R(40, 'rough', 'short'), R(8, 'green', 'long'), R(1, 'holed')]])), [3, true, true, false, 'long', 8, 'green', 0]);
  // missed approach then chip -> ONE miss (the approach), not counted twice
  assert.deepStrictEqual(pick(A([4, [R(400, 'tee'), R(150, 'fairway'), R(15, 'rough', 'shortleft'), R(4, 'green'), R(1, 'holed')]])), [2, false, false, false, 'shortleft', 0, 'rough', 15]);
  // drive the green
  assert.deepStrictEqual(pick(A([4, [R(300, 'tee'), R(20, 'green', 'right'), R(2, 'green'), R(1, 'holed')]])), [1, true, true, false, 'right', 20, 'green', 0]);
  // tee shot to 25 yd, chip on in 2 -> GIR, so green hit with the shot before the first putt (the chip)
  assert.deepStrictEqual(pick(A([4, [R(330, 'tee'), R(25, 'rough', 'right'), R(5, 'green'), R(1, 'holed')]])), [2, true, true, false, '', 5, 'green', 0]);
  // approach OB, re-hit onto the green in 4 -> not GIR: missed, using the shot before (the OB one)
  assert.deepStrictEqual(pick(A([4, [R(400, 'tee'), R(170, 'fairway'), R('', 'ob', 'right'), R(10, 'green'), R(1, 'holed')]])), [2, false, false, false, 'right', 0, 'ob', 170]);
  // never on the green, not GIR: 60-yd pitch finishes 15 yd off and is chipped in -> missed, the shot before = the 240-yd approach
  assert.deepStrictEqual(pick(A([4, [R(420, 'tee'), R(240, 'rough'), R(60, 'rough', 'short'), R(15, 'holedx')]])), [2, false, false, false, 'short', 0, 'rough', 60]);
  // approach misses, chip misses again, second chip onto the green -> the shot before the green-reaching shot (1st chip)
  assert.deepStrictEqual(pick(A([4, [R(400, 'tee'), R(150, 'fairway'), R(20, 'rough', 'left'), R(8, 'rough', 'long'), R(4, 'green'), R(1, 'holed')]])), [3, false, false, false, 'long', 0, 'rough', 8]);
  // chip-in from off the green after the approach (Scott's rule: reached the green) and eagle hole-out
  assert.deepStrictEqual(pick(A([4, [R(400, 'tee'), R(120, 'fairway'), R(15, 'holedx')]])), [2, true, true, true, '', 0, 'green', 0]);
  assert.deepStrictEqual(pick(A([4, [R(360, 'tee'), R(110, 'holedx')]])), [2, true, true, true, '', 0, 'green', 0]);
});

test('pin map consistency on random rounds: badges sum = holes, hit + missed = holes, GIR y = holes; GIR/miss tiles = map lists', () => {
  const pins = SG.PIN_GRID.flat();
  const pick = a => a[Math.floor(Math.random() * a.length)];
  for (let n = 0; n < 300; n++) {
    const hs = [];
    for (let i = 0; i < 18; i++) {
      const par = pick([3, 4, 4, 5]), rows = [R(par === 3 ? 170 : par === 4 ? 400 : 530, 'tee')]; let d = rows[0].dist;
      while (rows.length < 8) {
        const onGreen = rows[rows.length - 1].loc === 'green';
        const loc = onGreen ? pick(['green', 'holed']) : pick(['fairway', 'rough', 'bunker', 'green', 'green', 'holed', 'holedx', 'trees']);
        d = loc === 'green' || loc === 'holed' ? Math.max(1, Math.round(Math.random() * 40)) : Math.max(1, Math.round(d * Math.random()));
        rows.push(R(d, loc, pick(['', 'left', 'long', 'short', 'shortright']))); if (loc === 'holed' || loc === 'holedx') break;
      }
      if (!['holed', 'holedx'].includes(rows[rows.length - 1].loc)) rows.push(R(1, 'holed'));
      hs.push({ par, finished: true, pin: Math.random() < 0.7 ? pick(pins) : '', rows });
    }
    const S = SG.summarize({ holes: hs });
    assert.strictEqual(S.pinHoles.length + S.noPin, S.holesDone);
    let sum = 0;
    for (const p of pins) {
      const on = S.pinHoles.filter(x => x.pin === p); sum += on.length;
      assert.ok(on.every(x => x.appr), 'every hole has an approach entry');
      assert.strictEqual(on.filter(x => x.appr.hit).length + on.filter(x => !x.appr.hit).length, on.length);
      assert.strictEqual(on.filter(x => x.appr.hit).length, on.filter(x => x.gir).length, 'greens hit = GIR holes');
      assert.ok(on.filter(x => x.gir).length <= on.length);
    }
    assert.strictEqual(sum, S.pinHoles.length);
    assert.strictEqual(S.girMap.length, S.gir);
  }
});
