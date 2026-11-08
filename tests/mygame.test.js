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
  assert.strictEqual((svg.match(/class="rlearn"/g) || []).length, 6, 'six gold learning rings');
  assert.match(svg, />learning</);
  const sh1 = M.shape([ARC.round()], SG, 'pga'); assert.ok(sh1.spokes.every((s) => s.conf > 0 && s.conf < 1 && !s.strong), 'one round: some confidence, none strong');
});

test('practice: minutes per skill and focus, sessions by day, the period before', () => {
  const d = (n) => new Date(NOW - n * day).toISOString().slice(0, 10) + 'T12:00:00';
  const L = [
    { id: 'a', date: d(2), player: 'Scott', spoke: 'chip', focus: 'Green-side chipping', min: 30 },
    { id: 'b', date: d(2), player: 'Scott', spoke: 'lag', focus: 'Lag putting', min: 20 },
    { id: 'c', date: d(2), player: 'Scott', spoke: 'lag', focus: 'Putting speed control', min: 10 },
    { id: 'd', date: d(40), player: 'Scott', spoke: 'drive', focus: 'Driver', min: 45 },
    { id: 'bad', date: 'x', spoke: 'chip', min: 5 }, { id: 'bad2', date: d(1), spoke: 'nope', min: 5 } ];
  const P = M.practiceBuild(L, { period: '30d', now: NOW });
  assert.strictEqual(P.cur.total, 60); assert.strictEqual(P.cur.sessions, 1);
  assert.strictEqual(P.headline, '1 h in 1 session');
  assert.strictEqual(P.lede, 'Most time: chipping (50%). 45 min in the previous 30 days.');
  assert.deepStrictEqual(P.cur.spokes.find((s) => s.k === 'lag').focus, { 'Lag putting': 20, 'Putting speed control': 10 });
  assert.strictEqual(M.validPractice(L).length, 4, 'bad entries dropped');
  assert.match(M.practiceSVG(P.cur, P.prev), /class="pcur"/);
});

test('practice merges by id and rides along in backups', () => {
  const e = (id) => ({ id, date: '2026-11-05T12:00:00', player: 'Scott', spoke: 'chip', focus: 'Pitching', min: 15 });
  const m = M.mergePractice([e('a')], [e('a'), e('b')]);
  assert.strictEqual(m.added, 1); assert.deepStrictEqual(m.practice.map((x) => x.id), ['a', 'b']);
  const back = SG.parseBackup(JSON.stringify(SG.makeBackup([], null, 'Scott', [], null, null, [e('a')])));
  assert.ok(!back.error); assert.strictEqual(back.practice.length, 1, 'a practice-only backup restores');
  assert.strictEqual(SG.makeBackup([], null, 'Scott').practice, undefined, 'no practice key when there is none');
});

test('strokes lost vs practice time names the biggest gap', () => {
  const game = { spokes: [{ value: 0.2 }, { value: -3 }, { value: -1 }, { value: 0.1 }, { value: 0 }, { value: 0.3 }] };
  const prac = M.practiceShape([{ id: 'a', date: '2026-11-05T12:00:00', spoke: 'chip', min: 30 }, { id: 'b', date: '2026-11-05T12:00:00', spoke: 'lag', min: 30 }], [0, Infinity]);
  const V = M.practiceVsGame(game, prac);
  assert.strictEqual(V.headline, 'Practice more irons 100+');
  assert.strictEqual(V.lede, 'Irons 100+ is 75% of your lost strokes but 0% of your practice.');
  assert.strictEqual(M.practiceVsGame(game, M.practiceShape([], [0, Infinity])), null, 'no practice: no card');
});

test('Log this drill points each Work on next at a practice focus', () => {
  assert.deepStrictEqual(M.drillFocus({ id: 'puttspeed', area: 'putting' }), { spoke: 'lag', focus: 'Putting speed control' });
  assert.deepStrictEqual(M.drillFocus({ id: 'chips', area: 'short', title: 'Greenside bunker play' }), { spoke: 'chip', focus: 'Bunker shots' });
  assert.deepStrictEqual(M.drillFocus({ id: 'area', area: 'approach' }), { spoke: 'irons', focus: 'Distance control' });
  assert.deepStrictEqual(M.drillFocus({ id: 'teeside', area: 'tee' }), { spoke: 'drive', focus: 'Mechanics' });
  ['drive', 'irons', 'wedges'].forEach((k) => assert.deepStrictEqual(M.FOCUS[k], ['Distance control', 'Mechanics'], 'club practice: ' + k));
  Object.values(M.FOCUS).forEach((list) => assert.ok(list.length >= 2));
  ['puttspeed', 'lag', 'puttline', 'wedges', 'irondepth', 'ironline', 'teepen', 'teeside'].forEach((id) => { const x = M.drillFocus({ id }); assert.ok(M.FOCUS[x.spoke].includes(x.focus), id); });
});

// v155 practice level: a 42-day decaying average in minutes a week, measured against the benchmark group's practice
test('practice level builds slowly, fades, and is measured against the benchmark', () => {
  const at = new Date(2026, 10, 7, 20).getTime();
  const ld = (n) => { const x = new Date(at - n * day); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0') + 'T12:00:00'; };
  // one 45-minute wedge session does not fill the chart
  const one = M.practiceLevel([{ id: 'a', date: ld(0), spoke: 'wedges', min: 45 }], at, M.TAU, 'd1w').spokes.find((s) => s.k === 'wedges');
  assert.ok(one.wk > 7 && one.wk < 8, '45 min ≈ 7.5 min a week of level: ' + one.wk); assert.ok(one.frac < 0.05);
  // D1 wedge target = 20 h × 14%
  assert.strictEqual(Math.round(one.target), 168);
  // practising at the target every day for 3 months gets close (~88%); 6 weeks ~63%
  const steady = (days) => Array.from({ length: days }, (_, i) => ({ id: 'w' + i, date: ld(i), spoke: 'wedges', min: 168 / 7 }));
  const f90 = M.practiceLevel(steady(90), at, M.TAU, 'd1w').spokes.find((s) => s.k === 'wedges').frac;
  const f42 = M.practiceLevel(steady(42), at, M.TAU, 'd1w').spokes.find((s) => s.k === 'wedges').frac;
  assert.ok(f90 > 0.86 && f90 < 0.9, '3 months ≈ 88%: ' + f90); assert.ok(f42 > 0.61 && f42 < 0.65, '6 weeks ≈ 63%: ' + f42);
  // stop for 4 weeks: about half is left
  const later = M.practiceLevel(steady(90), at + 29 * day, M.TAU, 'd1w').spokes.find((s) => s.k === 'wedges').frac;
  assert.ok(Math.abs(later / f90 - 0.5) < 0.03, 'halves in ~29 days: ' + later / f90);
  // benchmark follows the baseline; unknown falls back to PGA Tour
  assert.strictEqual(M.practiceBench('scw').h, 7); assert.strictEqual(M.practiceBench('nope').id, 'pga');
  const T = M.practiceLevelText([{ id: 'a', date: ld(0), spoke: 'wedges', min: 45 }], { now: at, bl: 'd1w', period: '3m' });
  assert.strictEqual(T.headline, 'Practice level: 7 min a week');
  assert.strictEqual(T.lede, 'D1 college women average about 20 h a week – you are at 1% of that.');
  assert.match(T.trend, /building it up/);
  assert.match(M.practiceLevelSVG(T.level, T.prev), /class="pbench"/);
  assert.strictEqual(M.practiceLevelText([], { now: at, bl: 'd1w' }).headline, 'No practice level yet');
});
