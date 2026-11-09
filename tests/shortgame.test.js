// v166 Short game test engine (shortgame.js). Run: node --test tests/shortgame.test.js
const test = require('node:test'), assert = require('assert');
const SG = require('../sg.js'), T = require('../shortgame.js');
// a full test: q = quality knobs
function make(id, date, q) {
  q = Object.assign({ lag: 3, lagDir: 'short', ladder: [8, 7, 9], miss: [], chip: 5, flop: 8, bk: 8, sand: 0, over: 0, wedge: 12, wdir: '' }, q || {});
  const t = T.blank(id, date, 'Scott', 'pga');
  T.STATIONS.forEach((st) => { t.shots[st.id] = st.shots.map((spec, i) => {
    if (st.kind === 'lag') return { ft: q.lag, dir: q.lagDir };
    if (st.kind === 'ladder') return { n: q.ladder[i] };
    if (st.kind === 'compass') return q.miss.includes(spec.line + spec.dist) ? { made: false, miss: T.LINES.find((l) => l.k === spec.line).straight ? 'right' : 'low' } : { made: true };
    if (st.kind === 'bunker') return st.id === 'bkLong' && i < q.over ? { res: 'over' } : st.id === 'bkShort' && i < q.sand ? { res: 'sand' } : { ft: q.bk };
    if (st.kind === 'wedge') return { ft: q.wedge, dir: q.wdir };
    return { ft: st.id === 'flop' ? q.flop : q.chip };
  }); });
  t.done = true; return T.validTests([t])[0];
}
const sc = (t) => T.score(t, SG, 'pga');

test('the test is 10 stations: 9 lag putts, 3 ladder attempts, 16 short putts, 20 chips, 10 bunker shots, 15 wedges', () => {
  assert.deepStrictEqual(T.STATIONS.map((s) => s.shots.length), [9, 3, 16, 5, 5, 5, 5, 5, 5, 15]);
  assert.equal(T.TOTAL, 73);
  const c = T.STATION.compass.shots; assert.equal(c.filter((s) => s.line === 'up').length, 4); assert.deepStrictEqual([...new Set(c.map((s) => s.dist))], [3, 5, 7, 9]);
});
test('entries are checked: bad ones are dropped, a new test resumes at the first open shot', () => {
  const t = T.blank('a', '2026-11-09T10:00:00Z', 'Scott', 'pga'); assert.deepStrictEqual(T.nextOpen(t), { st: 0, i: 0 }); assert.equal(T.entered(t), 0);
  t.shots.lag[0] = { ft: 4, dir: 'short' }; t.shots.lag[1] = { ft: -2 }; t.shots.lag[2] = { ft: 'x' };
  const v = T.validTests([t])[0]; assert.deepStrictEqual(v.shots.lag.slice(0, 3), [{ ft: 4, dir: 'short' }, null, null]); assert.deepStrictEqual(T.nextOpen(v), { st: 0, i: 1 });
  assert.deepStrictEqual(T.validEntry(T.STATION.bkLong, { res: 'over' }), { res: 'over' }); assert.equal(T.validEntry(T.STATION.chipLong, { res: 'over' }), null);
  assert.deepStrictEqual(T.validEntry(T.STATION.compass, { made: false, miss: 'high' }), { made: false, miss: 'high' });
  assert.equal(T.mergeTests([v], [v, make('b', '2026-12-09T10:00:00Z')]).added, 1);
});
test('score: plain units per skill, strokes gained underneath, benchmark = 100', () => {
  const S = sc(make('a', '2026-11-09T10:00:00Z', { miss: ['up9', 'down7', 'bl9', 'br7', 'br9'], over: 2, sand: 1 }));
  assert.equal(S.skills.lag.value, 3); assert.equal(S.skills.speed.value, 8); assert.equal(S.skills.speed.best, 9);
  assert.equal(S.skills.short.value, 6); assert.equal(S.skills.short.of, 8); assert.equal(S.skills.brk.value, 5);
  assert.equal(S.skills.chipShort.value, 5); assert.equal(S.skills.flop.value, 8);
  assert.equal(S.skills.bkOn.value, 7); assert.equal(S.skills.bkOn.over, 2); assert.equal(S.skills.bkOn.sand, 1);
  assert.equal(S.skills.bkLong.value, 8, 'feet left is the average of the shots that found the green'); assert.ok(S.skills.bkLong.sg < S.skills.bkShort.sg - 0.05 || S.skills.bkLong.sg < 0);
  assert.equal(S.extra.wedge.byDist.length, 5); assert.equal(S.extra.wedge.byDist[0].n, 3);
  assert.ok(S.skills.short.bench > 5 && S.skills.short.bench < 8, 'benchmark makes ' + S.skills.short.bench);
  // a holed chip gains strokes; a chip left at the benchmark distance is level
  const st = T.STATION.chipShort, t = T.blank('n', '2026-11-09T10:00:00Z', 'S', 'pga'), nl = T.neutralLeave(SG, st.lie, st.dist, 'pga');
  t.shots.chipShort = st.shots.map(() => ({ ft: nl })); const N = T.score(T.validTests([t])[0], SG, 'pga');
  assert.ok(Math.abs(N.skills.chipShort.sg) < 0.01); assert.ok(Math.abs(N.skills.chipShort.index - 100) < 1); assert.ok(Math.abs(N.cats.chipping.index - 100) < 1);
  assert.equal(N.skills.lag.value, null); assert.equal(N.cats.putting.index, null);
});
test('compare: first test has nothing to compare; later ones say better / worse / same against your usual', () => {
  const a = sc(make('a', '2026-08-01T10:00:00Z')), b = sc(make('b', '2026-09-01T10:00:00Z')), c = sc(make('c', '2026-10-01T10:00:00Z', { lag: 5.5, chip: 5.4 }));
  assert.equal(T.compare(a, []).skills.lag.status, null);
  const C = T.compare(c, [b, a]); assert.equal(C.skills.lag.status, 'worse'); assert.equal(C.skills.lag.usual, 3); assert.equal(C.skills.chipShort.status, 'same'); assert.equal(C.skills.wedge.status, 'same');
  assert.deepStrictEqual(C.skills.lag.series, [3, 3, 5.5]); assert.equal(C.skills.lag.trend, 'steady', 'one drop is not slipping');
  assert.equal(C.skills.speed.index, 100); assert.ok(C.avgIndex.lag != null, 'the average shape shows from the third test');
  assert.equal(T.compare(b, [a]).avgIndex.lag, null);
});
test('compare: two drops in a row is slipping, two gains is improving', () => {
  const a = sc(make('a', '2026-08-01T10:00:00Z')), b = sc(make('b', '2026-09-01T10:00:00Z', { lag: 4, flop: 6.5 })), c = sc(make('c', '2026-10-01T10:00:00Z', { lag: 5, flop: 5 }));
  const C = T.compare(c, [b, a]); assert.equal(C.skills.lag.trend, 'slipping'); assert.equal(C.skills.flop.trend, 'improving'); assert.equal(C.skills.chipShort.trend, 'steady');
  const I = T.interpret(c, C); assert.match(I.headline, /^Lag proximity is slipping\.$/); assert.equal(I.plan[0].k, 'lag'); assert.equal(I.plan[0].why, 'slipping');
  assert.ok(I.better.some((r) => r.k === 'flop'));
});
test('interpret: first test sets the starting point; patterns become coach notes', () => {
  const s = sc(make('a', '2026-11-09T10:00:00Z', { lag: 6, lagDir: 'short', over: 3, miss: ['down3', 'down5', 'down7', 'down9', 'br7', 'br9', 'bl9'], wedge: 20, wdir: 'short' }));
  const I = T.interpret(s, T.compare(s, []));
  assert.equal(I.headline, 'Your starting point is set.'); assert.ok(I.plan.length >= 1 && I.plan.length <= 3);
  const txt = I.coach.map((c) => c.text).join(' | ');
  assert.match(txt, /9 of 9 lag putts finished short/); assert.match(txt, /4 of 4 uphill putts went in, 0 of 4 downhill/); assert.match(txt, /3 of 10 bunker shots flew the green/);
  const steady = sc(make('b', '2026-12-09T10:00:00Z')), I2 = T.interpret(steady, T.compare(steady, [sc(make('c', '2026-11-01T10:00:00Z')), sc(make('d', '2026-10-01T10:00:00Z'))]));
  assert.equal(I2.headline, 'Everything is holding steady.');
});
test('pictures: spider has benchmark, this test and (when known) your average; sparkline has a dot per test', () => {
  const sp = [{ name: 'A', index: 80, avg: 90 }, { name: 'B', index: 100, avg: 95 }, { name: 'C', index: 60, avg: 70 }];
  const svg = T.spiderSVG(sp); assert.match(svg, /sgtbench/); assert.match(svg, /sgtcur/); assert.match(svg, /sgtavg/);
  assert.doesNotMatch(T.spiderSVG(sp.map((s) => Object.assign({}, s, { avg: null }))), /sgtavg/);
  assert.equal((T.sparkSVG([3, 4, 5], T.SKILL.lag, { usual: 3.5, thr: 0.75, status: 'worse' }).match(/<circle/g) || []).length, 3);
  assert.equal((T.compassSVG({ line: 'up', dist: 5 }).match(/<circle/g) || []).length, 17);
});
