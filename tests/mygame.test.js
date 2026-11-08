// v141 My Game engine (mygame.js). Run: node --test tests/mygame.test.js
const test = require('node:test'), assert = require('assert');
const SG = require('../sg.js'), M = require('../mygame.js'), ARC = require('./fixtures/arcade-78.js');
const NOW = Date.parse('2026-11-07T20:00:00Z'), day = 864e5;
const at = (id, daysAgo, extra) => Object.assign(ARC.round(), { id, date: new Date(NOW - daysAgo * day).toISOString() }, extra || {});
// chip it close: every chip from 30 yd and in finishes 3 ft away and the putt goes in
function chipBetter(r) { r.holes.forEach((h) => { const rows = h.rows, k = rows.findIndex((x) => x.loc === 'green' || x.loc === 'holed');
  if (k > 1 && rows[k - 1].dist <= 30) h.rows = rows.slice(0, k).concat([{ dist: 3, loc: 'holed', dir: '', pen: false }]); }); return r; }

test('the six spokes split every shot once and add up to total strokes gained', () => {
  const r = ARC.round(), S = SG.summarize(r, 'pga'), sh = M.shape([r], SG, 'pga');
  assert.deepStrictEqual(sh.spokes.map((s) => s.k), ['drive', 'irons', 'wedges', 'chip', 'lag', 'short']);
  const n = sh.spokes.reduce((t, s) => t + s.n, 0), cats = Object.values(S.cats).reduce((t, c) => t + c.n, 0);
  assert.strictEqual(n, cats, 'every shot counted once');
  assert.ok(Math.abs(sh.spokes.reduce((t, s) => t + s.value, 0) - S.sgTotal) < 1e-9, 'adds up to the total');
  assert.ok(sh.spokes.every((s) => !s.solid), 'one round: every spoke still learning');
  assert.strictEqual(sh.tiles.score, 78); assert.strictEqual(Math.round(sh.tiles.putts), 31);
});

test('time frames: this period and the same length before it; all time has nothing before', () => {
  const rs = [at('a', 2), at('b', 20), at('c', 40), at('d', 75), at('e', 200), at('f', 500)];
  const n = (id) => { const D = M.build(rs, SG, { period: id, now: NOW }); return [D.cur.rounds, D.prev ? D.prev.rounds : null]; };
  assert.deepStrictEqual(n('30d'), [2, 1]);
  assert.deepStrictEqual(n('3m'), [4, null], 'nothing played 3-6 months ago');
  assert.deepStrictEqual(n('1y'), [5, 1]);
  assert.deepStrictEqual(n('all'), [6, null]);
});

test('headline: a skill that got better than the period before', () => {
  const rs = [chipBetter(at('a', 3)), chipBetter(at('b', 10)), chipBetter(at('c', 20)), at('d', 35), at('e', 45), at('f', 55)];
  const D = M.build(rs, SG, { period: '30d', now: NOW, baseline: 'scm' });
  assert.strictEqual(D.headline, 'Chipping is improving');
  assert.match(D.lede, /^Chipping is \d\.\d strokes a round better than the previous 30 days\.$/);
  assert.ok(D.cur.spokes.find((s) => s.k === 'chip').solid, '3 rounds of chips: solid');
  assert.ok(!D.cur.spokes.find((s) => s.k === 'lag').solid, 'chipping close leaves few long putts: lag still learning');
});

test('headline without a period before: what costs the most, and the strongest skill', () => {
  const D = M.build([at('a', 3), at('b', 10)], SG, { period: 'all', now: NOW });
  assert.strictEqual(D.headline, 'Irons 100+ costs you the most');
  assert.match(D.lede, /^-\d\.\d strokes a round against the PGA Tour average\. Strongest: short putts \(\+0\.\d\)\.$/);
  assert.strictEqual(M.build([], SG, { period: '30d', now: NOW }).headline, 'Still learning your game');
});

test('chart: further out is better, the benchmark sits on the dashed ring, learning spokes are hollow', () => {
  const sp = M.SPOKES[1];
  assert.ok(Math.abs(M.radius(sp, 0, 100) - 100 * M.RING) < 1e-9);
  assert.ok(M.radius(sp, 1, 100) > M.radius(sp, 0, 100) && M.radius(sp, -2, 100) < M.radius(sp, 0, 100));
  const svg = M.radarSVG(M.shape([ARC.round()], SG, 'pga'), null, {});
  assert.match(svg, /class="rbench"/); assert.match(svg, /class="rcur"/); assert.doesNotMatch(svg, /class="rprev"/);
  assert.strictEqual((svg.match(/fill="#fff"/g) || []).length, 6, 'six hollow points');
  assert.match(svg, /learning 50%/);
});
