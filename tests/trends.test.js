// v218 Trends: one dashed line 3 weeks out – recent form (practice rounds half), the test (γ), practice time (with room to improve) and feel. Run: node tests/trends.test.js
const test = require('node:test'), assert = require('node:assert');
const TR = require('../trends.js'), SG = require('../sg.js'), M = require('../mygame.js'), ARC = require('./fixtures/arcade-78.js');
// a seeded series where practice shows up 2 weeks later
function series(n, lag, k, noise, seed) { let s = seed || 7; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const x = Array.from({ length: n }, (_, i) => 1 + 0.8 * Math.sin(i / 2.2) + (r() - .5) * .3); const y = x.map((_, i) => i < lag ? null : k * (x[i - lag] - 1) + (r() - .5) * noise); return { x, y }; }


const flat = (n, v) => Array(n).fill(v), now = Date.parse('2026-11-15T12:00:00'), DAY = 864e5;
test('the line is 3 weeks long and starts from recent form (newest rounds count most)', () => {
  const y = flat(20, null).map((_, i) => i >= 10 ? (i >= 17 ? 1 : 0) : null), A = TR.analyse(y, flat(20, 0), { now });
  assert.ok(A.ok); assert.strictEqual(A.fc.length, 3); assert.strictEqual(TR.CFG.ahead, 3);
  assert.ok(A.form > 0.4 && A.form < 1, 'leans to the last rounds: ' + A.form); assert.ok(A.fc.every(v => Math.abs(v - A.form) < 1e-9), 'no practice, no test → flat at form');
  assert.strictEqual(A.bandPct, undefined); assert.strictEqual(A.lo, undefined); assert.strictEqual(A.conf, undefined, 'no band, no confidence');
});
test('not enough rounds: the line starts after 3', () => {
  const y = flat(10, null); y[8] = 0.5; y[9] = 0.2; const A = TR.analyse(y, flat(10, 1), { now });
  assert.strictEqual(A.ok, false); assert.strictEqual(A.reason, 'not enough rounds'); assert.strictEqual(A.need, 3);
  y[7] = 0; assert.ok(TR.analyse(y, flat(10, 1), { now }).ok, '3 rounds → a line');
  assert.ok(TR.analyse(y.map(v => v == null ? null : v), flat(10, 0), { now }).ok, 'no practice logged still gets a line');
});
test('γ: 50% on the test day, easing to 25% at 4 weeks, then staying', () => {
  assert.strictEqual(TR.gammaAt(0), 0.5); assert.strictEqual(TR.gammaAt(14), 0.375); assert.strictEqual(TR.gammaAt(28), 0.25); assert.strictEqual(TR.gammaAt(200), 0.25);
  const y = flat(12, 0), A = TR.analyse(y, flat(12, 0), { now, test: { t: now - 21 * DAY, v: -2 } });
  assert.ok(Math.abs(A.gamma[0] - TR.gammaAt(28)) < 1e-9 && A.gamma[2] === 0.25, 'week 1 is 4 weeks after the test');
  assert.ok(Math.abs(A.fc[2] - (-0.5)) < 1e-9, 'a quarter of the way to −2'); assert.ok(A.fc[2] < 0, 'an old test still pulls');
});
test('practice: more than your normal week bends the line up, ramping in over 2 weeks', () => {
  const x = flat(16, 1); x[14] = 2; x[15] = 2; const A = TR.analyse(flat(16, 0.5), x, { now });
  assert.ok(A.dX > 0.8 && A.dX < 1, 'the last 2 weeks vs normal: ' + A.dX); assert.strictEqual(A.room, 1, 'not losing strokes → normal rate');
  assert.ok(A.fc[0] > A.form && A.fc[1] > A.fc[0] && Math.abs(A.fc[2] - A.fc[1]) < 1e-9, 'half at week 1, full from week 2');
  assert.ok(Math.abs((A.fc[2] - A.form) - TR.CFG.b0 * A.dX) < 1e-9, 'no history of its own → the starting value 0.1 per hour');
  const less = flat(16, 1); less[14] = 0; less[15] = 0; assert.ok(TR.analyse(flat(16, 0.5), less, { now }).fc[2] < 0.5, 'less practice bends it down');
});
test('room to improve: the same extra practice counts more where you lose strokes, up to double', () => {
  const x = flat(16, 1); x[14] = 2; x[15] = 2;
  const ok = TR.analyse(flat(16, 0.3), x, { now }), weak = TR.analyse(flat(16, -0.5), x, { now }), bad = TR.analyse(flat(16, -3), x, { now });
  assert.strictEqual(weak.room, 1.5); assert.strictEqual(bad.room, 2, 'capped at 2×');
  const lift = (A) => A.fc[2] - A.form; assert.ok(Math.abs(lift(weak) - 1.5 * lift(ok)) < 1e-9 && Math.abs(lift(bad) - 2 * lift(ok)) < 1e-9);
  // a weakness the TEST found counts too: rounds fine, test −2
  const tst = TR.analyse(flat(16, 0), x, { now, test: { t: now - DAY, v: -2 } }); assert.ok(tst.room > 1.9, 'test pulls the level to ≈ −1 → room ' + tst.room);
});
test('your own history takes over from the starting value as the pairs build up; never below 0', () => {
  let s = 3; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const x = Array.from({ length: 26 }, (_, i) => 1 + Math.sin(i / 2)), y = x.map((_, i) => i < 2 ? null : 0.4 * (x[i - 2] - 1) + (r() - .5) * 0.05);
  const A = TR.analyse(y, x, { now }); assert.ok(A.bOwn > 0.3 && A.bOwn < 0.5, 'finds ~0.4: ' + A.bOwn); assert.ok(A.b > 0.3, 'mostly yours after 24 pairs: ' + A.b);
  const N = TR.analyse(y.map(v => v == null ? null : -v), x, { now }); assert.strictEqual(N.bOwn, 0, 'practice never predicted to hurt'); assert.ok(N.b < TR.CFG.b0 && N.b > 0);
});
test('feel: a light nudge – a great week counts like a fifth of an extra hour', () => {
  const x = flat(16, 1), feel = flat(16, null); feel[14] = 1; feel[15] = 1;
  const A = TR.analyse(flat(16, 0.2), x, { now, feel }); assert.strictEqual(A.feelLast, 1); assert.ok(Math.abs((A.fc[2] - A.form) - 0.2 * TR.CFG.b0) < 1e-9);
  assert.ok(TR.analyse(flat(16, 0.2), x, { now, feel, roundsOnly: true }).fc[2] === TR.analyse(flat(16, 0.2), x, { now, roundsOnly: true }).fc[2], 'practice off → no practice or feel');
});
test('practice rounds count half (rounds and score), and weeks of only practice rounds are marked', () => {
  const FAKE = { summarize: r => ({ holesDone: 18, strokes: r.sc, holes: [{ done: true, shots: [{ sg: r.p, kind: 'putt' }] }] }) }, MY = { SPOKES: [{ k: 'short', test: s => s.kind === 'putt' }] };
  const W = TR.weekSeries([{ id: 'a', date: '2026-11-13T10:00:00', sc: 72, p: 1, play: 'tournament' }, { id: 'b', date: '2026-11-12T10:00:00', sc: 80, p: -1, play: 'practice' }], [], FAKE, MY, { now, weeks: 2 });
  assert.strictEqual(W[1].wHoles, 27); assert.strictEqual(W[1].sg.short, 0.5, '1 + −1 × ½'); assert.deepStrictEqual(W[1].scoreW, [1, 0.5]);
  const R = []; for (let i = 0; i < 6; i++) R.push({ id: 'r' + i, date: new Date(now - (i * 7 + 1) * DAY).toISOString(), sc: 76 + (i % 2) * 4, p: i % 2 ? -1 : 1, play: i % 2 ? 'practice' : 'tournament' });
  const T = TR.build(R, [], FAKE, MY, { now, weeks: 8 }); const putt = T.areas.find(a => a.k === 'putt');
  assert.ok(putt.ok && putt.form > 0, 'tournaments (+1) outweigh practice rounds (−1): ' + putt.form);
  assert.ok(T.total.ok && T.total.formScore < 78, 'score leans to the tournaments (76): ' + T.total.formScore);
  assert.deepStrictEqual(putt.prWeek.slice(-6), [true, false, true, false, true, false], 'open dots for practice-round weeks');
});
test('build: six areas, the total as a score, weakest line first', () => {
  const FAKE = { summarize: (r) => ({ holesDone: 18, strokes: r.score, holes: [{ done: true, shots: r.shots }] }) };
  const shot = (cat, dist, sg) => ({ cat, start: { dist, lie: cat === 'putting' ? 'green' : 'fairway' }, sg }), rounds = [];
  for (let w = 0; w < 8; w++) rounds.push({ id: 'r' + w, date: new Date(now - (w * 7 + 2) * DAY).toISOString(), score: 78 + (w % 3), shots: [shot('putting', 20, -0.4), shot('putting', 5, -0.3), shot('tee', 400, 0.2), shot('short', 20, 0.05)] });
  const T = TR.build(rounds, [], SG.summarize ? FAKE : FAKE, M, { now, weeks: 26, tests: [{ date: new Date(now - 3 * DAY).toISOString(), area: { putt: 0.5 } }] });
  assert.deepStrictEqual(T.areas.map(a => a.k).sort(), ['bunker', 'chip', 'drive', 'irons', 'putt', 'wedges']);
  const putt = T.areas.find(a => a.k === 'putt'); assert.ok(putt.ok && putt.test && putt.gammaNow > 0.45, 'the test counts for putting');
  assert.ok(T.total.ok && T.total.fc.every(v => v > 70 && v < 90), 'the total is a score'); assert.strictEqual(T.total.test, null, 'no test for the score');
  const oks = T.areas.filter(a => a.ok); assert.ok(oks.every((a, i) => !i || a.fc[2] >= oks[i - 1].fc[2]), 'weakest first');
  assert.ok(T.areas.findIndex(a => !a.ok) < 0 || T.areas.findIndex(a => !a.ok) > T.areas.findIndex(a => a.ok), 'areas without enough rounds last');
});

test('lessons and feel come through from the log', () => {
  const now = Date.parse('2026-06-24T12:00:00'), W = TR.weekSeries([], [
    { id: 'a', date: '2026-06-22', spoke: 'drive', min: 30, kind: 'lesson', change: 'big', what: 'Grip', coach: 'Jo', lesson: 'L1' }, { id: 'b', date: '2026-06-22', spoke: 'irons', min: 30, kind: 'lesson', change: 'big', what: 'Grip', lesson: 'L1' },
    { id: 'c', date: '2026-06-16', spoke: 'lag', min: 30, feel: 'great' }, { id: 'd', date: '2026-06-17', spoke: 'lag', min: 30, feel: 'off' }, { id: 'e', date: '2026-06-17', spoke: 'lag', min: 60, feel: 'great' }], SG, M, { now, weeks: 2 });
  assert.deepStrictEqual(W[1].big, { drive: 'Grip', irons: 'Grip' }); assert.strictEqual(W[1].lessons.length, 2); assert.strictEqual(W[1].lessons[0].coach, 'Jo');
  assert.deepStrictEqual(W[0].feel.lag, [1, 2], 'feel weighted by minutes: (0.5 − 0.5 + 1) over 2 h');
});

test('rounds: each week lists its rounds with course, score and strokes gained per area', () => {
  const now = Date.parse('2026-11-11T12:00:00'), FAKE = { summarize: r => ({ holesDone: 18, strokes: r.sc, holes: [{ done: true, shots: [{ sg: r.p, kind: 'putt' }] }] }) };
  const MY = { SPOKES: [{ k: 'short', test: s => s.kind === 'putt' }] };
  const W = TR.weekSeries([{ id: 'a', date: '2026-11-08T10:00:00', course: 'Paradise Valley', sc: 73, p: 0.5 }, { id: 'b', date: '2026-11-07T10:00:00', course: 'Paradise Valley', sc: 87, p: -1 }], [], FAKE, MY, { now, weeks: 2 });
  assert.deepStrictEqual(W[0].list.map(r => [r.id, r.course, r.score, r.sg.short]), [['b', 'Paradise Valley', 87, -1], ['a', 'Paradise Valley', 73, 0.5]], 'oldest first');
  assert.deepStrictEqual(W[0].score.slice().sort(), [73, 87], 'both scores kept – the week averages 80');
});

