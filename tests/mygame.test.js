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
  assert.deepStrictEqual(sh.spokes.map((s) => s.k), ['drive', 'irons', 'wedges', 'chip', 'bunker', 'lag', 'short']); // v157: + Bunker
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
  assert.strictEqual((svg.match(/class="rlearn"/g) || []).length, M.shape([ARC.round()], SG, 'pga').spokes.filter((s) => s.n).length, 'a gold learning ring on every spoke with shots (v157: this round has no bunker shots)');
  assert.match(svg, />learning</);
  const sh1 = M.shape([ARC.round()], SG, 'pga'); assert.ok(sh1.spokes.every((s) => s.conf >= 0 && s.conf < 1 && !s.strong) && sh1.spokes.filter((s) => s.n).every((s) => s.conf > 0), 'one round: some confidence where there are shots, none strong');
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
  assert.deepStrictEqual(M.drillFocus({ id: 'chips', area: 'short', title: 'Chip distance control' }), { spoke: 'chip', focus: 'Green-side chipping' });
  assert.deepStrictEqual(M.drillFocus({ id: 'bunker', area: 'bunker', title: 'Getting out of greenside bunkers' }), { spoke: 'bunker', focus: 'Bunker shots' }); // v157
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

// ---------- v162 Playing: practice vs tournament rounds ----------
test('v162 playing: holes per round type fill the bars, 9 holes = half a round, last period kept for the marker', () => {
  const nine = (r) => { r.holes = r.holes.slice(0, 9); return r; };
  const rs = [at('p1', 3, { play: 'practice' }), nine(at('p2', 8, { play: 'practice' })), at('t1', 12, { play: 'tournament' }), at('u1', 5), at('p0', 40, { play: 'practice' }), at('t0', 50, { play: 'tournament' })];
  const P = M.playingBuild(rs, SG, { period: '30d', now: NOW });
  const row = (k) => P.rows.find((x) => x.k === k);
  assert.strictEqual(row('practice').holes, 27); assert.strictEqual(row('practice').text, '1½ rounds · 27 holes');
  assert.strictEqual(row('tournament').holes, 18); assert.strictEqual(row('tournament').text, '1 round · 18 holes');
  assert.deepStrictEqual(P.untagged, { holes: 18, rounds: 1 }, 'older untagged rounds are counted apart, not guessed');
  assert.strictEqual(row('practice').prevHoles, 18); assert.strictEqual(row('tournament').prevHoles, 18);
  assert.strictEqual(row('practice').frac, 1, 'the busiest bar is full'); assert.ok(Math.abs(row('tournament').frac - 18 / 27) < 1e-9);
  assert.strictEqual(P.headline, '2½ rounds · 45 holes played'); assert.match(P.lede, /^40% of it in tournaments\. 36 holes in the previous 30 days\.$/);
  assert.strictEqual(M.playOf({ play: 'junk' }), '');
  const E = M.playingBuild([], SG, { period: '30d', now: NOW }); assert.strictEqual(E.headline, 'No tagged rounds yet'); assert.strictEqual(E.prev, null);
});
test('v162 tournament vs practice: per-18 score and SG by area, worst area named, needs 2 of each', () => {
  const worsePutting = (r) => { r.holes.forEach((h) => { const k = h.rows.findIndex((x) => x.loc === 'holed'); if (k > 0) h.rows.splice(k, 0, { dist: 4, loc: 'green', dir: '', pen: false }); }); return r; };
  let C = M.kindCompare([at('p1', 3, { play: 'practice' }), at('t1', 4, { play: 'tournament' })], SG, { baseline: 'pga' });
  assert.strictEqual(C.ready, false); assert.match(C.lede, /at least 2 tagged rounds of each to compare – you have 1 practice and 1 tournament/);
  const rs = [at('p1', 3, { play: 'practice' }), at('p2', 6, { play: 'practice' }), worsePutting(at('t1', 4, { play: 'tournament' })), worsePutting(at('t2', 9, { play: 'tournament' }))];
  C = M.kindCompare(rs, SG, { baseline: 'pga' });
  assert.strictEqual(C.ready, true); assert.strictEqual(C.early, true);
  const holedRows = ARC.round().holes.filter((h) => h.rows.some((x) => x.loc === 'holed')).length;
  assert.ok(Math.abs(C.tournament.score - C.practice.score - holedRows) < 1e-9, 'one extra putt per holed-out hole');
  const put = C.rows.find((x) => x.k === 'putting'); assert.ok(put.diff < -0.3); assert.strictEqual(C.worst, 'putting');
  assert.ok(Math.abs(C.rows.find((x) => x.k === 'tee').diff) < 1e-9, 'tee shots unchanged');
  assert.match(C.headline, /^Tournament rounds average \d+\.\d higher$/); assert.match(C.lede, /biggest drop is putting/);
  const sumCats = C.rows.reduce((a, x) => a + x.tournament, 0); assert.ok(Math.abs(sumCats - C.tournament.sg) < 1e-6, 'areas add up to the total');
});

test('v164 season histogram: last 12 months by month and type, benchmark only when asked, year before kept', () => {
  const nine = (r) => { r.holes = r.holes.slice(0, 9); return r; };
  const now = Date.parse('2026-11-15T20:00:00Z'), on = (id, ymd, play) => Object.assign(ARC.round(), { id, date: ymd + 'T18:00:00Z' }, play ? { play } : {});
  const rs = [on('a', '2026-11-03', 'tournament'), nine(on('b', '2026-11-05', 'practice')), on('c', '2026-10-10', 'tournament'), on('d', '2025-12-02'), on('e', '2025-11-20', 'tournament'), on('f', '2025-10-01', 'practice')];
  let S = M.seasonBuild(rs, SG, { now, baseline: 'd1w' });
  assert.strictEqual(S.months.length, 12); assert.deepStrictEqual([S.months[0].label, S.months[11].label], ['Dec', 'Nov']);
  const nov = S.months[11]; assert.deepStrictEqual([nov.tournament, nov.practice, nov.prev], [1, 0.5, 1], 'Nov: 1 tournament, ½ practice, last Nov 1');
  assert.strictEqual(S.months[10].prev, 1, 'last Oct'); assert.strictEqual(S.months[0].untagged, 1);
  assert.strictEqual(S.headline, '3½ rounds in the last 12 months'); assert.strictEqual(S.withBench, false); assert.doesNotMatch(S.lede + S.month, /college/);
  S = M.seasonBuild(rs, SG, { now, baseline: 'd1w', bench: true });
  assert.match(S.lede, /D1 college women play about 20 tournament rounds a year/); assert.ok(Math.abs(S.months.reduce((a, x) => a + x.bench, 0) - 19.5) < 1e-9);
  ['pga', 'lpga', 'd1m', 'd1w', 'scm', 'scw'].forEach((b) => { const B = M.SEASON_BENCH[b]; assert.strictEqual(B.months.length, 12);
    assert.ok(Math.abs(B.months.reduce((a, x) => a + x, 0) - B.perYear) < 1e-9, b + ' months add up to the year'); });
  assert.ok(M.SEASON_BENCH.d1w.months[0] === 0 && M.SEASON_BENCH.d1w.months[5] === 0, 'college: no events in January or June');
});

test('v176: last 2 / 3 / 4 rounds – the newest N finished rounds, and the N before them', () => {
  const M = require('../mygame.js'), d = (n) => new Date(Date.UTC(2026, 10, 10) - n * 86400000).toISOString();
  const R = [1, 2, 3, 10, 11, 12, 40].map((n, i) => ({ id: 'r' + i, date: d(n) }));
  const P = M.roundPeriod(3, R), W = M.windows(P);
  const inW = (w) => R.filter((r) => { const t = Date.parse(r.date); return t >= w[0] && t < w[1]; }).map((r) => r.id);
  assert.deepStrictEqual(inW(W.cur), ['r0', 'r1', 'r2']); assert.deepStrictEqual(inW(W.prev), ['r3', 'r4', 'r5']);
  assert.strictEqual(P.name, 'Last 3 rounds'); assert.strictEqual(M.period(P), P, 'a period object passes straight through');
  assert.strictEqual(M.windows(M.roundPeriod(4, R.slice(0, 3))).prev, null, 'fewer rounds than N: no earlier window');
});
