// v230: Driver distance = hole length minus leftover, even when Dir is Long far from the green;
// impossible tee distances (> ~450 yd or clearly longer than the hole) are left out; SG is unchanged.
// Run: node --test tests/drive-distance-focused.js
const test = require('node:test'), assert = require('assert');
const SG = require('../sg.js');

const R = (dist, loc, dir, extra) => Object.assign({ dist, loc, dir: dir || '', pen: false }, extra || {});
const hole = (par, rows) => ({ par, finished: true, rows });
function tee(par, rows) {
  const h = hole(par, rows);
  const a = SG.analyzeHole(h, 'pga');
  const S = SG.summarize({ holes: [h] }, 'pga');
  return { hit: a.shots[0].hit, sg: a.shots[0].sg, holeSG: a.sg, map: S.teeMap[0], a };
}

test('v230 Long on a tee shot is hole length minus leftover, not the sum (458+284 was 742)', () => {
  const rows = [R(458, 'tee', '', { club: 'Driver' }), R(284, 'fairway', 'long'), R(20, 'green'), R(2, 'holed')];
  const plain = [R(458, 'tee', '', { club: 'Driver' }), R(284, 'fairway'), R(20, 'green'), R(2, 'holed')];
  const A = tee(5, rows), B = tee(5, plain);
  assert.strictEqual(A.hit, 174);
  assert.strictEqual(A.map.hit, 174);
  assert.strictEqual(A.sg, B.sg);
  assert.strictEqual(A.holeSG, B.holeSG);
});

test('v230 near-green Long still adds the leftover (existing v156 rule)', () => {
  const hit = (rows, k) => SG.analyzeHole(hole(4, rows), 'pga').shots[k].hit;
  assert.strictEqual(hit([R(380, 'tee'), R(100, 'fairway'), R(20, 'holedx', 'long')], 1), 120);
  assert.strictEqual(hit([R(400, 'tee'), R(150, 'holedx', 'left')], 0), 250);
});

test('v230 sanity guard drops tee distances over 450 yd or well past the hole', () => {
  assert.strictEqual(tee(5, [R(520, 'tee'), R(20, 'fairway'), R(10, 'green'), R(1, 'holed')]).hit, null);
  const past = tee(4, [R(300, 'tee'), R(20, 'green', 'long'), R(2, 'holed')]);
  assert.ok(past.hit > 300 && past.hit <= 340, 'drive a little past a short green still counts: ' + past.hit);
  assert.strictEqual(tee(4, [R(400, 'tee'), R(150, 'fairway'), R(15, 'green'), R(2, 'holed')]).hit, 250);
});

test('v230 9-hole round with a hazard penalty cannot produce a 742 yd drive', () => {
  const R2 = (d, loc, dir, club, pen) => ({ dist: d, loc, dir: dir || '', pen: !!pen, club: club || '' });
  const par = [5, 4, 3, 5, 4, 3, 4, 3, 5];
  const yards = [513, 327, 150, 466, 365, 140, 291, 155, 458];
  const to = [250, 60, null, 240, 120, null, 70, null, 284];
  const dir = ['', '', '', 'left', 'left', '', 'right', '', 'long'];
  const club = ['Driver', 'Driver', '', 'Driver', 'Driver', '', 'Driver', '', 'Driver'];
  const holes = par.map((p, i) => {
    if (p === 3) return hole(3, [R2(yards[i], 'tee'), R2(18, 'green'), R2(2, 'holed')]);
    if (i === 3) return hole(5, [R2(yards[i], 'tee', '', 'Driver'), R2(40, 'hazard', 'left', '', true), R2(18, 'green'), R2(2, 'holed')]);
    return hole(p, [R2(yards[i], 'tee', '', club[i]), R2(to[i], 'fairway', dir[i]), R2(18, 'green'), R2(2, 'holed')]);
  });
  const S = SG.summarize({ v: 3, date: '2026-11-15T18:00:00.000Z', course: 'Somersett Country Club', nine: true, holes }, 'pga');
  assert.strictEqual(S.holesDone, 9);
  const drives = S.teeMap.filter(m => !m.layup && m.kind !== 'ob' && !m.pen && m.hit != null && isFinite(m.hit) && m.hit > 0);
  const hits = drives.map(m => m.hit);
  assert.ok(hits.length >= 4, 'measurable drives: ' + hits.join(','));
  assert.ok(Math.max.apply(null, hits) <= 450, 'max ' + Math.max.apply(null, hits));
  assert.ok(!hits.includes(742));
  assert.ok(S.teeMap.some(m => m.pen), 'penalty tee shot left out of drives');
  assert.strictEqual(S.teeMap.filter(m => m.hole === 9)[0].hit, 174);
});

test('v231 Long + rough close to the green is past the green (hole length + leftover)', () => {
  const A = tee(4, [R(320, 'tee', '', { club: 'Driver' }), R(25, 'rough', 'long'), R(8, 'green'), R(2, 'holed')]);
  const B = tee(4, [R(320, 'tee', '', { club: 'Driver' }), R(25, 'rough'), R(8, 'green'), R(2, 'holed')]);
  assert.strictEqual(A.hit, 345);
  assert.strictEqual(A.map.hit, 345);
  assert.strictEqual(A.a.shots[0].dir, 'long');
  assert.strictEqual(A.sg, B.sg, 'strokes gained does not use the Long-add formula');
  assert.strictEqual(tee(4, [R(320, 'tee'), R(25, 'bunker', 'long'), R(8, 'green'), R(2, 'holed')]).hit, 345);
  assert.strictEqual(tee(4, [R(320, 'tee'), R(25, 'trees', 'long'), R(8, 'green'), R(2, 'holed')]).hit, 345);
});

test('v231 Long + fairway is ignored, even with a short leftover', () => {
  const A = tee(4, [R(320, 'tee', '', { club: 'Driver' }), R(25, 'fairway', 'long'), R(8, 'green'), R(2, 'holed')]);
  const B = tee(4, [R(320, 'tee', '', { club: 'Driver' }), R(25, 'fairway'), R(8, 'green'), R(2, 'holed')]);
  assert.strictEqual(A.hit, 295);
  assert.strictEqual(A.map.hit, 295);
  assert.strictEqual(A.a.shots[0].dir, '', 'stored Long on the fairway is dropped');
  assert.strictEqual(A.sg, B.sg);
  const side = tee(4, [R(400, 'tee'), R(150, 'fairway', 'longleft'), R(15, 'green'), R(2, 'holed')]);
  const left = tee(4, [R(400, 'tee'), R(150, 'fairway', 'left'), R(15, 'green'), R(2, 'holed')]);
  assert.strictEqual(side.hit, 250);
  assert.strictEqual(side.hit, left.hit);
  assert.strictEqual(side.a.shots[0].dir, 'left', 'Long left on the fairway keeps the side');
});

test('v231 Long + rough far from the green is not added (284 left → hole minus leftover)', () => {
  const A = tee(5, [R(458, 'tee', '', { club: 'Driver' }), R(284, 'rough', 'long'), R(20, 'green'), R(2, 'holed')]);
  const B = tee(5, [R(458, 'tee', '', { club: 'Driver' }), R(284, 'rough'), R(20, 'green'), R(2, 'holed')]);
  assert.strictEqual(A.hit, 174);
  assert.strictEqual(A.map.hit, 174);
  assert.strictEqual(A.a.shots[0].dir, '');
  assert.strictEqual(A.sg, B.sg);
});

test('v231 450 yd / 40 yd past-hole guard still drops an impossible through-the-green drive', () => {
  // 320 + 50 = 370, over the 40 yd past-hole allowance
  assert.strictEqual(tee(4, [R(320, 'tee'), R(50, 'rough', 'long'), R(8, 'green'), R(2, 'holed')]).hit, null);
  assert.strictEqual(tee(4, [R(320, 'tee'), R(40, 'rough', 'long'), R(8, 'green'), R(2, 'holed')]).hit, 360);
});
