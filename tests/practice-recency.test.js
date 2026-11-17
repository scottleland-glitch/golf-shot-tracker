// v233 (Scott): chips inside 3 ft are a good result; each plan note says where its numbers come from; the latest round is
// checked against the longer window ("may be turning around" / "new"). Run: node --test tests/practice-recency.test.js
const test = require('node:test'), assert = require('assert');
const SG = require('../sg.js'), MY = require('../mygame.js'), PLAN = require('../plan.js'), ARC = require('./fixtures/arcade-78.js');
const DAY = 864e5, NOW = Date.parse('2026-11-12T18:00:00');
const A0 = () => { const A = {}; MY.SPOKES.forEach(s => { A[s.k] = { shots: [] }; }); return A; };
// a chip from round `ri` played `age` days ago: dir and finishing feet on the green (0 = holed)
const chip = (ri, age, dir, ft) => ({ s: { cat: 'short', start: { lie: 'rough', dist: 15 }, end: ft === 0 ? { lie: 'holed', dist: 0 } : { lie: 'green', dist: ft }, dir }, age, w: Math.pow(0.5, age / 45), rid: 'r' + ri, t: NOW - age * DAY });
const many = (n, f) => Array.from({ length: n }, (_, i) => f(i));

test('a chip that finishes inside 3 ft is a good chip – not counted as short or long', () => {
  const A = A0();
  A.chip.shots = [].concat(many(6, () => chip(1, 10, 'long', 8)), many(5, () => chip(1, 10, 'long', 2)), many(2, () => chip(1, 10, 'short', 10)), [chip(1, 10, 'long', 3)]);
  const F = PLAN.roundFindings(A);
  assert.strictEqual(F.chip.focus, 'Chips finishing long'); assert.strictEqual(F.chip.why, '6 of 8 chips finished past the hole', 'the 2 ft and 3 ft chips are left out');
  const B = A0(); B.chip.shots = [].concat(many(5, () => chip(1, 10, 'long', 2)), many(2, () => chip(1, 10, 'short', 10)), many(3, () => chip(1, 10, 'long', 9)));
  assert.ok(!PLAN.roundFindings(B).chip, '3 long of 5 real misses is not a pattern (it was 8 of 10 before the 3 ft rule)');
  const L = A0(); L.lag.shots = [].concat(many(5, () => ({ s: { cat: 'putting', start: { dist: 35 }, end: { lie: 'green', dist: 2 }, dir: 'long' }, age: 5 })), many(3, () => ({ s: { cat: 'putting', start: { dist: 35 }, end: { lie: 'green', dist: 6 }, dir: 'short' }, age: 5 })));
  assert.ok(!PLAN.roundFindings(L).lag, 'lag putts inside 3 ft are good lags too');
});
test('the source: each note says which shots and rounds it comes from', () => {
  const A = A0(); A.chip.shots = [].concat(many(4, i => chip(i, 10 + i * 20, 'long', 9)), many(4, i => chip(i, 10 + i * 20, 'long', 12)), [chip(1, 30, 'short', 9)]);
  const F = PLAN.roundFindings(A), d = new Date(NOW - 70 * DAY), mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()];
  assert.strictEqual(F.chip.source, 'From chips in your last 4 rounds (since ' + mon + ' ' + d.getDate() + ')');
});
test('recency: 14 of 21 long over the window, but 0 of 5 long last round → "may be turning around", lower priority', () => {
  const older = [].concat(many(14, i => chip(1 + i % 4, 20 + (i % 4) * 20, 'long', 10)), many(2, i => chip(1 + i % 4, 20 + (i % 4) * 20, 'short', 10)));
  const last = [chip(0, 2, 'short', 8), chip(0, 2, 'short', 6), chip(0, 2, '', 2), chip(0, 2, 'long', 1), chip(0, 2, '', 0)];
  const A = A0(); A.chip.shots = older.concat(last); const F = PLAN.roundFindings(A);
  assert.strictEqual(F.chip.focus, 'Chips finishing long'); assert.strictEqual(F.chip.why, '14 of 18 chips finished past the hole');
  assert.deepStrictEqual(F.chip.rec, { dir: 'better', text: 'Last round: 0 of 5 chips long – may be turning around' });
  const B = A0(); B.chip.shots = older.concat(many(5, () => chip(0, 2, 'long', 9))); const G = PLAN.roundFindings(B);
  assert.ok(!G.chip.rec, 'still long last round – no recency note'); assert.ok(F.chip.conf < G.chip.conf, 'turning around → lower priority');
});
test('recency: fine over the window, but most of the misses came last round → "new"', () => {
  const older = [].concat(many(3, i => chip(1 + i, 20 + i * 20, 'long', 9)), many(5, i => chip(1 + i % 4, 20 + (i % 4) * 20, 'short', 9)), many(9, i => chip(1 + i % 3, 20 + (i % 3) * 20, '', 2)));
  const A = A0(); A.chip.shots = older; assert.ok(!PLAN.roundFindings(A).chip, 'no pattern before');
  A.chip.shots = older.concat(many(5, () => chip(0, 3, 'long', 12)), [chip(0, 3, 'short', 1)]); const F = PLAN.roundFindings(A);
  assert.strictEqual(F.chip.focus, 'Chips finishing long'); assert.deepStrictEqual(F.chip.rec, { dir: 'worse', text: 'Last round: 5 of 6 chips long – more than before' }, 'recent rounds count more, so the window leans long too');
  const B = A0(); B.chip.shots = older.map(e => Object.assign({}, e, { w: 1 })).concat(many(5, () => Object.assign(chip(0, 3, 'long', 12), { w: 1 })), [Object.assign(chip(0, 3, 'short', 1), { w: 1 })]);
  const G = PLAN.roundFindings(B); assert.ok(G.chip, 'no lean over the window (8 long, 5 short) – a new note of its own');
  assert.strictEqual(G.chip.focus, 'Chips finishing long'); assert.match(G.chip.why, /^Not a pattern before – it showed up in your last round$/);
  assert.deepStrictEqual(G.chip.rec, { dir: 'worse', text: 'Last round: 5 of 6 chips long – new' }); assert.ok(G.chip.conf <= 0.6, 'a new note is never the surest');
});
test('recency: robust to a small last round – fewer than 4 shots adds the round before, 1–2 shots never flip it', () => {
  const older = many(16, i => chip(2 + i % 4, 30 + (i % 4) * 20, i < 13 ? 'long' : 'short', 10));
  const A = A0(); A.chip.shots = older.concat([chip(0, 2, 'short', 9), chip(0, 2, 'short', 7)], many(3, () => chip(1, 9, 'long', 10)));
  const F = PLAN.roundFindings(A); assert.strictEqual(F.chip.focus, 'Chips finishing long'); assert.ok(!F.chip.rec, 'last 2 rounds: 3 of 5 long – no note: ' + JSON.stringify(F.chip.rec));
  const B = A0(); B.chip.shots = older.concat([chip(0, 2, 'short', 9), chip(0, 2, 'short', 7)]);
  assert.ok(!PLAN.roundFindings(B).chip.rec || /Last 2 rounds/.test(PLAN.roundFindings(B).chip.rec.text), 'never a note from 2 shots alone');
});
test('the plan: every item with a why has a plain source line; a terrible last round shows up even when the average looks fine', () => {
  const iso = d => new Date(NOW - d * DAY).toISOString();
  const rounds = [0, 6, 13, 20, 27].map((d, i) => Object.assign(ARC.round(), { id: 'r' + i, date: iso(d + 1) }));
  const P = PLAN.build({ rounds, logs: [], SG, MYGAME: MY, bl: 'pga', now: NOW });
  P.items.concat(P.done).forEach(x => { if (x.why) assert.match(x.source, /^From /, x.k + ': ' + x.why); });
  assert.ok(P.items.concat(P.done).some(x => /From strokes gained in your last 5 rounds \(since \w{3} \d+\) – recent ones count more/.test(x.source)));
  // the latest round: every chip runs to 40 ft and three-putts → a bad chipping round on top of four ordinary ones
  const bad = Object.assign(ARC.round(), { id: 'rb', date: iso(0.5) });
  bad.holes.forEach(h => { const R = h.rows, g = R.findIndex(x => x.loc === 'green'); if (g > 0 && ['rough', 'fringe', 'fairway', 'bunker'].indexOf(R[g - 1].loc) >= 0 && R[g - 1].dist <= 30 && R[g - 1].loc !== 'bunker') { R[g].dist = 45; R[g].dir = 'long'; const hi = R.findIndex(x => x.loc === 'holed'); R.splice(hi, 0, { dist: 6, loc: 'green', dir: 'long', pen: false }); } });
  const Q = PLAN.build({ rounds: rounds.slice(1).concat([bad]), logs: [], SG, MYGAME: MY, bl: 'pga', now: NOW }), c = Q.items.concat(Q.done).find(x => x.k === 'chip');
  assert.ok(c.rec && c.rec.dir === 'worse', JSON.stringify(c.rec) + ' ' + c.why);
});
