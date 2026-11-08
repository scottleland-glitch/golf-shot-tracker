// v140 Round takeaway engine (insights.js). Run: node --test tests/insights.test.js
const test = require('node:test'), assert = require('assert');
const SG = require('../sg.js'), I = require('../insights.js'), ARC = require('./fixtures/arcade-78.js');
const copy = (id) => Object.assign(ARC.round(), { id });
const history = (n) => Array.from({ length: n }, (_, i) => copy('h' + i));
// turn some 2-putt holes into 3-putts: an extra 6-footer before the tap-in
function threePutts(r, holes) {
  holes.forEach((i) => { const rows = r.holes[i].rows, last = rows.length - 1; rows.splice(last, 0, { dist: 6, loc: 'green', dir: '', pen: false }); });
  return r;
}
// tag where the missed long putts finished (the dir on the row after the putt)
function tagPutts(r, dir) {
  r.holes.forEach((h) => { const rows = h.rows; for (let k = 1; k < rows.length; k++) if (rows[k - 1].loc === 'green' && rows[k - 1].dist >= 15) rows[k].dir = dir; });
  return r;
}

test('first round: compares with the baseline, nothing about the golfer known yet', () => {
  const t = I.build(copy('now'), [], SG);
  assert.ok(t.ok);
  assert.strictEqual(t.headline, 'Approach play cost you the most.');
  assert.match(t.lede, /^You lost 6\.7 strokes on approach shots against the PGA Tour average – more than the rest of your game combined\.$/);
  assert.strictEqual(t.focus.title, 'Wedge distance control');
  assert.strictEqual(t.focus.basis.mine, false);
  assert.match(t.focus.basis.text, /still learning your approach play \(0%\)/);
  assert.deepStrictEqual(I.AREAS.map((a) => t.progress[a.k].frac), [0, 0, 0, 0]);
  assert.deepStrictEqual(t.tiles.map((x) => x.k), ['tee', 'approach', 'short', 'putting']);
  assert.deepStrictEqual(t.good, ['1 birdie', 'no penalties', 'no 3-putts']);
});

test('progress fills per area at its own pace and turns ready', () => {
  const P = I.progress(history(3), SG, 'pga');
  assert.strictEqual(P.rounds, 3);
  assert.deepStrictEqual(['tee', 'approach', 'short', 'putting'].map((k) => P[k].n), [42, 63, 36, 93]);
  assert.deepStrictEqual(['tee', 'approach', 'short', 'putting'].map((k) => P[k].ready), [false, true, false, false]);
  assert.strictEqual(P.readyCount, 1);
  assert.strictEqual(P.tee.roundsLeft, 1); assert.strictEqual(P.putting.roundsLeft, 1);
  assert.strictEqual(I.progress(history(30), SG, 'pga').rounds, I.NORM_ROUNDS, 'only the last 20 rounds count');
});

test('a normal round for this golfer has no big leaks', () => {
  const t = I.build(copy('now'), history(6), SG);
  assert.strictEqual(t.progress.readyCount, 4);
  assert.strictEqual(t.headline, 'A steady round with no big leaks.');
  assert.strictEqual(t.lede, 'Every area was within a stroke of your normal.');
});

test('compared with their own normal: extra 3-putts make putting the thing to work on', () => {
  const t = I.build(threePutts(copy('now'), [0, 1, 4, 5]), history(6), SG);
  assert.strictEqual(t.headline, 'Putting cost you the most.');
  assert.match(t.lede, /^You lost [3-5]\.\d more strokes on the greens than you usually do\.$/);
  assert.strictEqual(t.focus.area, 'putting');
  assert.strictEqual(t.focus.title, 'Lag putting');
  assert.match(t.focus.text, /with 4 three-putts/);
  assert.deepStrictEqual(t.focus.basis, { mine: true, text: 'Compared with your normal (last 6 rounds)' });
  assert.ok(!t.good.includes('no 3-putts'));
});

test('putt speed: long misses that keep finishing short', () => {
  const S = SG.summarize(tagPutts(copy('now'), 'short'), 'pga');
  const f = I.checks(S, SG, 'pga', 'PGA Tour').find((x) => x.id === 'puttspeed');
  assert.ok(f, 'found');
  assert.match(f.text, /^\d+ of \d+ missed putts from 15 ft and over finished short\.$/);
  assert.match(f.drill, /18 in past/);
  const mixed = copy('m'); let flip = 0;
  mixed.holes.forEach((h) => { for (let k = 1; k < h.rows.length; k++) if (h.rows[k - 1].loc === 'green' && h.rows[k - 1].dist >= 15) h.rows[k].dir = flip++ % 2 ? 'short' : 'long'; });
  assert.ok(!I.checks(SG.summarize(mixed, 'pga'), SG, 'pga', 'PGA Tour').some((x) => x.id === 'puttspeed'), 'an even split is not a pattern');
});

test('chips: compared with the leave a benchmark player gets from the same spot', () => {
  const S = SG.summarize(copy('now'), 'pga'), f = I.checks(S, SG, 'pga', 'PGA Tour').find((x) => x.id === 'chips');
  assert.strictEqual(f.n, 12); assert.ok(f.yours > f.par + 3 && f.qualifies);
  // a benchmark chip from 15 yd in the rough leaves a putt it then needs (expected - 1) strokes for
  const chip = S.holes[0].shots.find((s) => s.cat === 'short'), ft = I.parLeaveFt(SG, chip, 'pga');
  assert.ok(Math.abs(SG.expected('green', ft, 'pga') - (chip.eStart - 1)) < 1e-3);
});

test('too short a round has no takeaway yet', () => {
  const r = copy('now'); r.holes.forEach((h, i) => { if (i >= 5) h.finished = false; h.rows = i >= 5 ? [{ dist: h.rows[0].dist, loc: 'tee', dir: '', pen: false }] : h.rows; });
  const t = I.build(r, [], SG);
  assert.strictEqual(t.ok, false); assert.match(t.reason, /Finish 6 holes/);
});
