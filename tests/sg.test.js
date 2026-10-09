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

// ---- Row model (v2 screen): each row = where the shot is played FROM ----
const R = (dist, loc, dir = '', pen = false) => ({ dist, loc, dir, pen });

test("rows: Scott's screenshot style hole (365 F, 125 F R, 15ft G O, holed)", () => {
  const hole = { par: 4, rows: [R(365, 'tee'), R(125, 'fairway', 'R'), R(15, 'green', 'O'), R('', 'holed')] };
  const a = SG.analyzeHole(hole);
  assert.strictEqual(a.strokes, 3); assert.ok(a.done); assert.strictEqual(a.bad, null);
  assert.strictEqual(a.shots[0].hit, 240, 'drive = 365 - 125');
  assert.strictEqual(a.shots[1].hit, 120, 'approach = 125 - 15ft/3');
  assert.strictEqual(a.shots[1].dir, 'O');
  near(a.sg, SG.expected('tee', 365) - 3, 'SG identity');
  assert.strictEqual(a.putts, 1); assert.ok(a.gir); assert.ok(a.fairway);
});

test('rows: OB row = stroke and distance; hazard+P = drop +1; hazard alone = play it', () => {
  const hole = { par: 4, rows: [R(400, 'tee'), R('', 'ob', 'R'), R(170, 'hazard', 'L', true), R(30, 'hazard'), R(12, 'green'), R('', 'holed')] };
  const a = SG.analyzeHole(hole);
  near(a.shots[0].sg, -2, 'OB costs 2');
  assert.strictEqual(a.shots[1].start.lie, 'tee'); assert.strictEqual(a.shots[1].start.dist, 400);
  near(a.shots[1].sg, 3.99 - SG.expected('rough', 170) - 2, 'hazard drop uses rough +1');
  assert.strictEqual(a.shots[2].end.lie, 'hazard');
  assert.strictEqual(a.penalties, 2); assert.strictEqual(a.strokes, 7);
  near(a.sg, 3.99 - 7, 'identity');
});

test('rows: incomplete row stops analysis and is reported', () => {
  const a = SG.analyzeHole({ par: 4, rows: [R(380, 'tee'), R(150, 'fairway'), R('', 'rough')] });
  assert.strictEqual(a.bad, 2); assert.strictEqual(a.shots.length, 1); assert.ok(!a.done);
  const b = SG.analyzeHole({ par: 4, rows: [R('', 'tee')] });
  assert.strictEqual(b.bad, 0); assert.strictEqual(b.shots.length, 0);
});

test('migration: old {yards, shots} -> rows gives identical results', () => {
  const old = { par: 4, yards: 400, shots: [
    { lie: 'rough', dist: 999, side: 'R', pen: 'ob' }, { lie: 'rough', dist: 180, side: 'L', pen: 'water' },
    { lie: 'sand', dist: 20, side: 'L', pen: 'none' }, { lie: 'green', dist: 6, pen: 'none' }, { lie: 'holed', pen: 'none' }] };
  const a = SG.analyzeHole(old), b = SG.analyzeHole({ par: 4, rows: SG.shotsToRows(old) });
  assert.strictEqual(b.strokes, a.strokes); near(b.sg, a.sg, 'same SG');
  assert.deepStrictEqual(b.shots.map(s => s.cat), a.shots.map(s => s.cat));
});

test('summary counts short/over approach misses', () => {
  const S = SG.summarize({ holes: [{ par: 4, rows: [R(400, 'tee'), R(150, 'fairway'), R(25, 'rough', 'S'), R(5, 'green'), R('', 'holed')] }] });
  assert.strictEqual(S.apprShort, 1); assert.strictEqual(S.strokes, 4);
});
