// v209: fun facts for Home when the practice plan is off – every number from the player's own rounds
const test = require('node:test'), assert = require('assert');
const SG = require('../sg.js'), MY = require('../mygame.js'), PLAN = require('../plan.js'), FUN = require('../funfacts.js'), ARC = require('./fixtures/arcade-78.js');
const DAY = 864e5, NOW = Date.parse('2026-11-12T18:00:00'), iso = d => new Date(NOW - d * DAY).toISOString();
// putts from 7 ft: `make` holes holed from 7, `miss` holes miss from 7 (then tap in)
const round = (d, i, o) => { o = o || {}; const r = Object.assign(ARC.round(), { id: 'r' + i, course: 'Arcade Creek', date: iso(d) });
  r.holes.forEach((h, hi) => { const g = h.rows.findIndex(x => x.loc === 'holed'); if (g < 1) return;
    if (hi < (o.make || 0)) h.rows[g].dist = 7; else if (hi < (o.make || 0) + (o.miss || 0)) h.rows.splice(g, 0, { dist: 7, loc: 'green', dir: '', pen: false }); });
  return r; };
const facts = (R, now) => FUN.facts({ rounds: R, SG, PLAN, MYGAME: MY, bl: 'pga', now: now || NOW });
const by = (F, k) => F.filter(f => f.k === k)[0];

test('no rounds, no facts', () => { assert.deepStrictEqual(facts([]), []); });
test('what if: 80% from 5–10 ft – only with 15+ putts from there, worth what the extra makes add', () => {
  const R = [1, 8, 15].map((d, i) => round(d, i, { make: 2, miss: 4 })), F = by(facts(R), 'whatif5');
  assert.ok(F, JSON.stringify(facts(R).map(f => f.title))); assert.match(F.title, /^Make 80% from 5–10 ft → [\d.]+ strokes? a round$/); assert.match(F.sub, /You make \d+% now \(\d+ of \d+\)/);
  const m = /\((\d+) of (\d+)\)/.exec(F.sub), gain = +(/→ ([\d.]+)/.exec(F.title)[1]), want = (+m[2] / 3) * (0.8 - m[1] / m[2]);
  assert.ok(Math.abs(gain - Math.round(want * 10) / 10) < 0.051, gain + ' vs ' + want);
  assert.ok(!by(facts([round(1, 0, { make: 2, miss: 4 })]), 'whatif5'), 'one round: too few putts from there to say');
  assert.ok(!by(facts([1, 8, 15].map((d, i) => round(d, i, { make: 6 }))), 'whatif5'), 'already making them: nothing to add');
});
test('a streak under a round number, and the last 5 only when better', () => {
  const R = [1, 6, 13, 20, 27].map((d, i) => round(d, i)), F = facts(R);
  assert.ok(!by(F, 'streak'), 'every round the same 78 – no "before" to break from'); assert.ok(!by(F, 'avg'));
  const worse = [1, 6, 13, 20, 27, 34, 41, 48, 55, 62].map((d, i) => round(d, i, i < 5 ? { miss: 3 } : {})); // the last 5 are 3 shots worse
  assert.ok(!by(facts(worse), 'avg'), 'no bad news'); const better = [1, 6, 13, 20, 27, 34, 41, 48, 55, 62].map((d, i) => round(d, i, i >= 5 ? { miss: 3 } : {}));
  const A = by(facts(better), 'avg'); assert.ok(A && /3 strokes better/.test(A.title), A && A.title);
  const S = by(facts(better), 'streak'); assert.ok(S && /^5 rounds in a row under 80$/.test(S.title), S && S.title);
});
test('add it up: halve the 3 biggest leaks; best part of the game', () => {
  const F = facts([1, 8, 15, 22].map((d, i) => round(d, i))), A = by(F, 'addup');
  assert.ok(A && /^Halve your 3 biggest leaks → [\d.]+ strokes a round$/.test(A.title), JSON.stringify(F.map(f => f.title))); assert.strictEqual(A.sub.split(' · ').length, 3);
  assert.ok(F.length <= FUN.CFG.max); F.forEach(f => assert.ok(f.kick && f.title && f.btn && f.btn[1], JSON.stringify(f)));
});
test('longest putt holed in the last 30 days', () => {
  const r = round(3, 0); r.holes[0].rows[r.holes[0].rows.length - 1].dist = 34; const L = by(facts([r]), 'long');
  assert.ok(L && /34 ft$/.test(L.title)); assert.ok(!by(facts([r], NOW + 40 * DAY), 'long'), 'older than a month');
});
