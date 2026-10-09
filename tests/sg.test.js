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
