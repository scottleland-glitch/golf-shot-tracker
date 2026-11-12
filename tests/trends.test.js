// v194 Trends maths: lag, link, forecast band, test fade, "both slipping", not-enough-data, total vs score. Run: node tests/trends.test.js
const test = require('node:test'), assert = require('node:assert');
const TR = require('../trends.js'), SG = require('../sg.js'), M = require('../mygame.js'), ARC = require('./fixtures/arcade-78.js');
// a seeded series where practice shows up 2 weeks later
function series(n, lag, k, noise, seed) { let s = seed || 7; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const x = Array.from({ length: n }, (_, i) => 1 + 0.8 * Math.sin(i / 2.2) + (r() - .5) * .3); const y = x.map((_, i) => i < lag ? null : k * (x[i - lag] - 1) + (r() - .5) * noise); return { x, y }; }

test('finds the lag, a positive link and its slope', () => {
  const { x, y } = series(26, 2, 0.6, 0.4); const A = TR.analyse(y, x, { now: Date.now() });
  assert.ok(A.ok); assert.strictEqual(A.lag, 2); assert.ok(A.r > 0.5, 'r ' + A.r); assert.ok(A.link); assert.ok(A.b > 0.3 && A.b < 0.9, 'b ' + A.b);
  assert.ok(A.byLag[0].r < A.r, 'same week weaker'); assert.strictEqual(TR.linkWord(A.r), A.r >= .7 ? 'Strong' : 'Moderate');
});
test('the band: ±25% of normal (at least 15 min), opens only after the lag, never above the busiest week', () => {
  const { x, y } = series(26, 2, 0.6, 0.4); const A = TR.analyse(y, x, { now: Date.now() });
  assert.ok(Math.abs(A.dX - Math.max(A.normX * 0.25, 0.25)) < 1e-9); assert.ok(A.upX <= Math.max(...x) + 1e-9);
  assert.deepStrictEqual([A.up[0] - A.dn[0], A.up[1] - A.dn[1]].map(v => Math.round(v * 1000)), [0, 0], 'closed for the first 2 weeks (lag 2)');
  assert.ok(A.up[3] - A.dn[3] > A.up[2] - A.dn[2] && A.up[2] > A.dn[2], 'then opens, wider each week'); assert.ok(A.up[4] >= A.fc[4] && A.fc[4] >= A.dn[4]);
  const tiny = TR.analyse(y, x.map(v => v / 20), { now: Date.now() }); assert.ok(Math.abs(tiny.dX - 0.25) < 1e-9, 'floor of 15 min');
});
test('the test counts up to half and fades to nothing over 3 weeks', () => {
  const { x, y } = series(26, 2, 0.6, 0.4), now = Date.now(); const A = TR.analyse(y, x, { now, test: { t: now - 4 * 864e5, v: 1.5 } });
  assert.ok(Math.abs(A.testW[0] - 0.5 * (1 - 11 / 21)) < 1e-9); assert.ok(A.testW[1] > 0 && A.testW[1] < A.testW[0]); assert.strictEqual(A.testW[2], 0);
  const B = TR.analyse(y, x, { now }); assert.ok(A.fc[0] > B.fc[0], 'a good test lifts next week'); assert.ok(Math.abs(A.fc[2] - B.fc[2]) < 1e-9, 'gone by week 3');
});
test('no link (or a negative one) → no practice effect, a flat band', () => {
  const { x } = series(26, 2, 0, 0); let s = 3; const y = x.map(() => { s = (s * 16807) % 2147483647; return s / 2147483647 - .5; });
  const A = TR.analyse(y, x.map((v, i) => i % 2 ? v : v * 0.2), { now: Date.now() }); if (!A.link) { assert.strictEqual(A.b, 0); assert.ok(Math.abs(A.up[4] - A.dn[4]) < 1e-9); }
  const N = TR.analyse(x.map((v, i) => i < 2 ? null : -(x[i - 2] - 1)), x, { now: Date.now() }); assert.strictEqual(N.link, false, 'practice going with worse SG is not used'); assert.strictEqual(N.b, 0);
});
test('"both slipping" needs both below normal for 2+ weeks; heading below normal', () => {
  const x = Array(20).fill(1.5), y = Array(20).fill(0.3); for (let i = 8; i < 12; i++) { x[i] = 0.2; y[i] = -0.8; } y[15] = -0.9; x[15] = 0.2; // a 4-week slump + a single bad week
  for (let i = 16; i < 20; i++) { x[i] = 0.3; y[i] = -0.6; } // sliding at the end
  const A = TR.analyse(y, x, { now: Date.now() }); assert.ok(A.ok); assert.ok(A.slip.some(([a, b]) => a <= 9 && b >= 10), 'the slump'); assert.ok(!A.slip.some(([a, b]) => a === 15 && b === 15), 'not one week');
  assert.strictEqual(A.heading, true);
});
test('not enough data', () => {
  assert.strictEqual(TR.analyse([0.1, 0.2, null, 0.3], [1, 1, 1, 1], {}).ok, false);
  assert.strictEqual(TR.analyse(Array(20).fill(0.1), Array(20).fill(0), {}).reason, 'no practice logged');
});
test('build: six areas + total practice vs score from rounds and practice logs', () => {
  // a stand-in for SG.summarize: each round carries its own strokes gained per shot type, with putting following putting practice 2 weeks earlier
  const FAKE = { summarize: (r) => ({ holesDone: 18, strokes: r.score, holes: [{ done: true, shots: r.shots }] }) };
  const shot = (cat, dist, sg) => ({ cat, start: { dist, lie: cat === 'putting' ? 'green' : 'fairway' }, sg });
  const now = Date.parse('2026-11-12T12:00:00'), rounds = [], logs = [], N = 22, pm = (w) => 30 + 25 * Math.sin(w / 2);
  for (let w = 0; w < N; w++) { const ago = N - 1 - w, pu = 0.02 * (pm(w - 2) - 30) + 0.15 * Math.sin(w * 1.7);
    rounds.push({ id: 'r' + w, date: new Date(now - (ago * 7 + 2) * 864e5).toISOString(), score: Math.round(78 - pu * 3 + Math.sin(w)), shots: [shot('putting', 20, pu / 2), shot('putting', 5, pu / 2), shot('tee', 400, 0.1 * Math.cos(w)), shot('short', 20, 0.05 * Math.sin(w * 1.3))] });
    logs.push({ id: 'pl' + w, date: new Date(now - (ago * 7 + 1) * 864e5).toISOString().slice(0, 10), spoke: 'lag', min: Math.round(pm(w) * .6) }, { id: 'ps' + w, date: new Date(now - (ago * 7 + 1) * 864e5).toISOString().slice(0, 10), spoke: 'short', min: Math.round(pm(w) * .4) },
      { id: 'pc' + w, date: new Date(now - (ago * 7 + 1) * 864e5).toISOString().slice(0, 10), spoke: 'chip', min: 20 + (w % 3) * 10 }); }
  const T = TR.build(rounds, logs, FAKE, M, { now, weeks: 26, tests: [{ date: new Date(now - 3 * 864e5).toISOString(), area: { putt: 0.5 } }] });
  assert.deepStrictEqual(T.areas.map(a => a.k).sort(), ['bunker', 'chip', 'drive', 'irons', 'putt', 'wedges']);
  const putt = T.areas.find(a => a.k === 'putt'); assert.ok(putt.ok, putt.reason); assert.strictEqual(putt.lag, 2); assert.ok(putt.link && putt.r > 0.5, 'putting link ' + putt.r);
  assert.ok(putt.testW[0] > 0, 'the test counts for putting');
  assert.strictEqual(T.areas.find(a => a.k === 'irons').reason, 'no practice logged'); assert.strictEqual(T.areas.find(a => a.k === 'drive').reason, 'no practice logged');
  assert.ok(T.total.ok, T.total.reason); assert.strictEqual(T.total.lowerBetter, true); assert.ok(T.total.normScore > 70 && T.total.normScore < 85, 'score scale ' + T.total.normScore);
  assert.ok(T.total.fc.every(v => v > 60 && v < 100), 'forecast in strokes');
  assert.ok(T.areas.findIndex(a => !a.ok) > T.areas.findIndex(a => a.ok), 'areas without enough data last');
  const same = TR.analyse(Array(20).fill(0.2), Array(20).fill(1), {}); assert.strictEqual(same.reason, 'no variation');
});
