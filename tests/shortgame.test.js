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

test('v168 lag putts are grouped by spot (30, 30, 30, 40 …) and older tests are moved into place once', () => {
  assert.deepStrictEqual(T.STATION.lag.shots.map((x) => x.dist), [30, 30, 30, 40, 40, 40, 50, 50, 50]);
  const old = { id: 'o', date: '2026-10-01T00:00:00Z', shots: { lag: [30, 40, 50, 40.1, 50.1, 30.1, 50.2, 30.2, 40.2].map((ft) => ({ ft, dir: 'short' })) } };
  const v = T.validTests([old])[0];
  assert.strictEqual(v.v, 2); assert.deepStrictEqual(v.shots.lag.map((e) => e.ft), [30, 30.1, 30.2, 40, 40.1, 40.2, 50, 50.1, 50.2]);
  assert.deepStrictEqual(T.validTests([v])[0].shots.lag.map((e) => e.ft), [30, 30.1, 30.2, 40, 40.1, 40.2, 50, 50.1, 50.2], 'not moved twice');
});
test('v168 speed ladders: flat, uphill, downhill – a slope well short of flat is named as the leak', () => {
  assert.deepStrictEqual(T.STATION.ladder.shots.map((x) => x.label), ['Flat', 'Uphill', 'Downhill']);
  const t = T.validTests([{ id: 'x', date: '2026-11-01T00:00:00Z', sl: true, shots: { ladder: [{ n: 8 }, { n: 7 }, { n: 4 }] } }])[0];
  assert.strictEqual(T.score(T.validTests([{ id: 'old', date: '2026-10-01T00:00:00Z', shots: { ladder: [{ n: 8 }, { n: 7 }, { n: 4 }] } }])[0], SG, 'pga').skills.speed.bySlope, null, 'pre-v168 ladders were all flat: no slopes');
  const S = T.score(t, SG, 'pga'); assert.deepStrictEqual(S.skills.speed.bySlope.map((x) => [x.k, x.n]), [['flat', 8], ['up', 7], ['down', 4]]);
  const I = T.interpret(S, T.compare(S, [])); const c = I.coach.find((x) => x.k === 'speed');
  assert.ok(c, 'coach note'); assert.match(c.text, /8 balls flat, 7 uphill, 4 downhill/); assert.match(c.ask, /Downhill speed is the leak/);
});

test('v168 short putts: Long (more than 18 in past) and Short misses count as speed misses, with a coach note', () => {
  const C = T.STATION.compass.shots, miss = C.map((s, i) => (i < 4 ? { made: false, miss: 'long' } : i === 4 ? { made: false, miss: 'short' } : { made: true }));
  const t = T.validTests([{ id: 'c', date: '2026-11-01T00:00:00Z', shots: { compass: miss } }])[0];
  const S = T.score(t, SG, 'pga'), I = T.interpret(S, T.compare(S, []));
  const c = I.coach.find((x) => /speed misses/.test(x.text)); assert.ok(c, JSON.stringify(I.coach));
  assert.match(c.text, /^4 of 5 short-putt speed misses were long – more than 18 in past the hole\.$/); assert.match(c.ask, /dying the ball/);
  assert.deepStrictEqual(T.validEntry(T.STATION.compass, { made: false, miss: 'long' }), { made: false, miss: 'long' }, 'breaking putts can be long too');
});

test('v168 flop: "didn\'t reach the green" is about a full stroke lost and gets a coach note', () => {
  const t = T.validTests([{ id: 'f', date: '2026-11-01T00:00:00Z', shots: { flop: [{ ft: 6 }, { res: 'short' }, { ft: 8 }, { ft: 5 }, { res: 'short' }] } }])[0];
  assert.deepStrictEqual(t.shots.flop[1], { res: 'short' }); assert.strictEqual(T.validEntry(T.STATION.chipShort, { res: 'short' }), null, 'only the flop station');
  const S = T.score(t, SG, 'pga'); assert.strictEqual(S.skills.flop.short, 2); assert.strictEqual(S.skills.flop.value, (6 + 8 + 5) / 3, 'feet away = the ones that reached');
  const ok = T.score(T.validTests([{ id: 'g', date: '2026-11-01T00:00:00Z', shots: { flop: [{ ft: 6 }, { ft: 8 }, { ft: 8 }, { ft: 5 }, { ft: 8 }] } }])[0], SG, 'pga');
  assert.ok(ok.skills.flop.sg - S.skills.flop.sg > 0.3, 'two short of the green cost a lot per shot');
  const I = T.interpret(S, T.compare(S, [])); assert.ok(I.coach.some((c) => /2 of 5 flop shots didn’t reach the green – each one costs about a stroke\./.test(c.text)));
});

test('v168: way-off warnings name the pattern of the misses', () => {
  const T = require('../shortgame.js'), SG = require('../sg.js');
  const C = T.STATION.compass.shots;
  const mk = (id, date, downMiss, wedgeFt) => T.validTests([{ id, date, sl: true, shots: {
    compass: C.map(s => s.line === 'down' && s.dist > 3 && downMiss(s) ? { made: false, miss: typeof downMiss(s) === 'string' ? downMiss(s) : 'long' } : { made: true }),
    wedge: T.STATION.wedge.shots.map(() => ({ ft: wedgeFt, dir: 'long' })) } }])[0];
  const warnOf = (t, prev) => { const S = T.score(t, SG, 'd1w'); return T.compare(S, prev.map(p => T.score(p, SG, 'd1w'))).warn; };
  // no history: falls back to the benchmark
  const bad = mk('w', '2026-11-01T00:00:00Z', () => true, 40);
  let W = warnOf(bad, []), down = W.find(w => w.k === 'line:down');
  assert.equal(down.vs, 'bench'); assert.match(down.title, /Downhill putts: 1 of 4 made/); assert.match(down.why, /All 3 missed long/);
  assert.ok(!W.find(w => w.k === 'line:up'), 'uphill all made: no warning');
  assert.match(W.find(x => x.cat === 'wedge').why, /flew long/);
  // always this far off the benchmark: it is their usual, so no red box
  const same = [mk('a', '2026-10-01T00:00:00Z', () => true, 40), mk('b', '2026-09-01T00:00:00Z', () => true, 40)];
  assert.equal(warnOf(bad, same).length, 0, 'always 0.8 off the benchmark is not a warning');
  // slipping from their own usual (downhill 4 of 4 → 1 of 4): warned, with the usual
  const good = [mk('a', '2026-10-01T00:00:00Z', () => false, 40), mk('b', '2026-09-01T00:00:00Z', () => false, 40)];
  down = warnOf(bad, good).find(w => w.k === 'line:down');
  assert.equal(down.vs, 'own'); assert.equal(down.usual, 4); assert.equal(down.tests, 2);
  // a spread of misses says so
  const t2 = mk('w2', '2026-11-01T00:00:00Z', s => ['long', 'right', 'short'][s.dist % 3], 10);
  assert.match(warnOf(t2, []).find(x => x.k === 'line:down').why, /No single pattern/);
});
