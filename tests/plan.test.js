// v203: the practice plan (plan.js) – a ranked "Practice next" list, not a schedule
const test = require('node:test'), assert = require('assert');
const SG = require('../sg.js'), MY = require('../mygame.js'), PLAN = require('../plan.js'), ARC = require('./fixtures/arcade-78.js');
const DAY = 864e5, NOW = Date.parse('2026-11-12T18:00:00');
const iso = d => new Date(NOW - d * DAY).toISOString();
const rounds = [0, 6, 13, 20].map((d, i) => Object.assign(ARC.round(), { id: 'r' + i, date: iso(d + 1) }));
const build = (logs, more) => PLAN.build(Object.assign({ rounds, logs: logs || [], SG, MYGAME: MY, bl: 'pga', now: NOW }, more || {}));
const keysOf = P => P.items.map(x => x.k);
// steady practice in every area for the last 30 days
const steady = (skip, min) => { const L = []; MY.SPOKES.forEach(s => { if (s.k === skip) return; for (let d = 0; d < 30; d += 2) L.push({ date: iso(d), spoke: s.k, min: min || 15 }); }); return L; };

test('budget: your average week over the last 30 days, a default when there is little logged', () => {
  assert.strictEqual(build([]).budgetFrom, 'default'); assert.strictEqual(build([]).budget, 120);
  const P = build(steady(null, 15)); assert.strictEqual(P.budgetFrom, '30 days'); assert.strictEqual(P.budget, Math.round(15 * 7 * 15 * 7 / 30));
  assert.strictEqual(build([{ date: iso(40), spoke: 'lag', min: 600 }]).budgetFrom, 'default', 'older than 30 days does not count');
});
test('an area you skip climbs to the top; the ones you did drop down', () => {
  const P = build(steady('chip', 25)); assert.strictEqual(P.items[0].k, 'chip', JSON.stringify(P.items.map(x => [x.k, x.owed])));
  assert.ok(P.done.some(x => x.k === 'lag'));
  const Q = build(steady('chip', 25).concat([{ date: iso(0), spoke: 'chip', min: 30 }])); assert.ok(!keysOf(Q).includes('chip') || Q.items[0].k !== 'chip', 'did it today → it drops');
});
test('a big day: done today with a tick; extra time is a small credit, capped at a week of its share', () => {
  const P = build([{ date: iso(0), spoke: 'lag', min: 600 }]), lag = P.done.find(x => x.k === 'lag');
  assert.ok(lag && lag.doneToday); assert.ok(lag.owed >= -lag.weekMin, 'credit ≤ one week: ' + lag.owed + ' vs ' + lag.weekMin);
});
test('one long session counts a little less than the same time spread out', () => {
  const one = build([{ date: iso(1), spoke: 'irons', min: 90 }]).areas, spread = build([1, 2, 3].map(d => ({ date: iso(d), spoke: 'irons', min: 30 })));
  const o = build([{ date: iso(1), spoke: 'irons', min: 90 }]).items.concat(build([{ date: iso(1), spoke: 'irons', min: 90 }]).done).find(x => x.k === 'irons');
  const s = spread.items.concat(spread.done).find(x => x.k === 'irons'); assert.ok(o.owed > s.owed - 6, 'long session pays off less (or about the same once the days are counted): ' + o.owed + ' vs ' + s.owed); assert.ok(one.irons);
});
test('practice changes the order, not the problems', () => {
  const a = build([]).areas.irons.lost, b = build([{ date: iso(0), spoke: 'irons', min: 120 }]).areas.irons.lost; assert.strictEqual(a, b);
});
test('coach homework: one item per lesson, at the top, ~4 weeks for a big change and ~2 for a fine-tune', () => {
  const les = (d, change) => ['drive', 'irons', 'wedges'].map(k => ({ date: iso(d), spoke: k, min: 20, kind: 'lesson', change, what: 'Grip', coach: 'Jo', lesson: 'L' + d }));
  const P = build(les(10, 'big')); assert.ok(P.items[0].coach); assert.strictEqual(P.items.filter(x => x.coach).length, 1, 'one item');
  assert.match(P.items[0].focus, /^Coach: Grip \(Jo\)$/); assert.match(P.items[0].name, /Driving|Irons|Wedges/); assert.ok(P.items[0].name.split(/, | and /).length === 3);
  assert.ok(!build(les(30, 'big')).items.some(x => x.coach), 'gone after ~4 weeks'); assert.ok(!build(les(16, 'tune')).items.some(x => x.coach), 'a fine-tune: ~2 weeks');
  assert.ok(build(les(12, 'tune')).items.some(x => x.coach));
});
test('tournament: Big within a week sharpens (putting / short game first, no big-change homework); Regular changes nothing', () => {
  const day = d => { const t = new Date(NOW + d * DAY); return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0'); }; // local date, as the date picker gives it
  const base = build([]), big = build([], { tour: { date: day(4), big: true } }), reg = build([], { tour: { date: day(4), big: false } });
  assert.strictEqual(big.tour.mode, 'sharpen'); assert.strictEqual(big.tour.days, 4); assert.match(big.tour.msg, /sharpening/);
  assert.deepStrictEqual(keysOf(reg), keysOf(base), 'Regular: same list'); assert.match(reg.tour.msg, /practice as normal/);
  const rank = (P, k) => { const i = keysOf(P).indexOf(k); return i < 0 ? 99 : i; };
  assert.ok(['lag', 'short', 'chip', 'wedges'].some(k => rank(big, k) <= rank(base, k)), 'short game moves up');
  assert.ok(rank(big, 'irons') >= rank(base, 'irons') && rank(big, 'drive') >= rank(base, 'drive'), 'long game moves down');
  big.items.filter(x => x.k === 'drive' || x.k === 'irons').forEach(x => assert.ok(x.min <= 15, 'shorter long-game sessions'));
  assert.match(build([], { tour: { date: day(1), big: true } }).tour.msg, /^Tomorrow/); assert.strictEqual(build([], { tour: { date: day(10), big: true } }).tour.mode, 'normal');
  assert.strictEqual(build([], { tour: { date: day(-2), big: true } }).tour, null, 'past tournaments are ignored');
  const lesB = ['drive'].map(k => ({ date: iso(5), spoke: k, min: 20, kind: 'lesson', change: 'big', what: 'Grip', lesson: 'Lx' }));
  assert.ok(!build(lesB, { tour: { date: day(3), big: true } }).items.some(x => x.coach), 'no new swing changes in a big week');
});
// ---- the cause: pattern detectors ----
const mk = (n, f) => Array.from({ length: n }, (_, i) => f(i));
const A0 = () => { const A = {}; MY.SPOKES.forEach(s => { A[s.k] = { shots: [] }; }); return A; };
test('rounds: tee shots missing right, approaches short, bunker shots staying in', () => {
  const A = A0();
  A.drive.shots = mk(12, i => ({ s: { cat: 'tee', end: { lie: i < 9 ? 'rough' : 'fairway' }, side: i < 8 ? 'right' : 'left', dir: '' }, age: 5 }));
  A.irons.shots = mk(10, i => ({ s: { cat: 'approach', start: { lie: 'fairway', dist: 150 }, end: { lie: 'rough' }, dir: i < 8 ? 'shortright' : 'long' }, age: 5 }));
  A.bunker.shots = mk(6, i => ({ s: { cat: 'bunker', end: { lie: i < 3 ? 'bunker' : 'green' } }, age: 5 }));
  const F = PLAN.roundFindings(A);
  assert.match(F.drive.focus, /missing right/); assert.match(F.drive.why, /^8 of 9 missed fairways went right$/);
  assert.match(F.irons.focus, /^Approaches (finishing short|missing right)$/); assert.match(F.bunker.focus, /Getting out first time/);
});
test('rounds: lag speed by slope and breaking putts missed on the low side (needs the putt\'s read)', () => {
  const A = A0();
  A.lag.shots = mk(8, i => ({ s: { cat: 'putting', start: { dist: 30 }, end: { lie: 'green' }, dir: i < 6 ? 'long' : 'short', rd: i < 6 ? 'down-s' : 'flat-s' }, age: 3 }));
  A.short.shots = mk(8, i => ({ s: { cat: 'putting', start: { dist: 6 }, end: { lie: 'green' }, dir: i < 6 ? 'right' : 'left', rd: 'flat-r' }, age: 3 })); // breaks right, missed right = low side
  const F = PLAN.roundFindings(A);
  assert.match(F.lag.focus, /long|Downhill/); assert.match(F.short.focus, /missing low/); assert.match(F.short.why, /6 of 8 missed breaking putts were on the low side – play more break/);
});
test('test notes: a focus of their own, and "your test agrees" when the rounds see the same fault', () => {
  const t = { date: iso(5), perShot: { putting: -0.05 }, coach: [{ k: 'lag', text: '7 of 10 lag putts finished short.' }] };
  const P = build([], { test: t }), lag = P.areas.lag; assert.ok(/Your test: 7 of 10 lag putts finished short|finishing short/.test(lag.why + ' ' + lag.focus), lag.focus + ' / ' + lag.why);
  const old = build([], { test: Object.assign({}, t, { date: iso(60) }) }); assert.ok(!/Your test/.test(old.areas.lag.why), 'a test over 6 weeks old has faded out');
});
test('every item says why', () => {
  const P = build(steady('chip', 10)); P.items.forEach(x => assert.ok(x.why && x.why.length > 8, x.k + ': ' + x.why));
});
test('feel: easy every time on plain reps → try a game or pressure version', () => {
  const L = [0, 2, 4].map(d => ({ date: iso(d), spoke: 'short', min: 15, feel: 'great', type: 'reps' }));
  assert.match(build(L).areas.short.typeTip, /game or pressure/); assert.strictEqual(build(L.map(e => Object.assign({}, e, { type: 'game' }))).areas.short.typeTip, '');
});
// v204 (Scott: "it's empty, nothing to click"): never fewer than 3 items, each with minutes
test('never empty: a light practice week still lists 3+, and "ahead" lists what helps most', () => {
  const light = build([0, 8, 16, 24].map(d => ({ date: iso(d), spoke: 'lag', min: 15 }))); assert.ok(light.budget < 30 || light.items.length >= 3, 'light week'); assert.ok(light.items.length >= 3, JSON.stringify(light.items.map(x => [x.k, x.owed, x.weekMin])));
  const lots = []; MY.SPOKES.forEach(s => { [0, 1, 2].forEach(d => lots.push({ date: iso(d), spoke: s.k, min: 60 })); });
  const A = build(lots); assert.strictEqual(A.due, 0, 'nothing overdue'); assert.ok(A.items.length >= 3 && A.items.every(x => x.optional && x.min >= 10), 'ahead: 3 optional items');
  const mid = build(steady('chip', 25)); assert.ok(mid.items.length >= 3); assert.ok(mid.due >= 1 && !mid.items[0].optional);
});
// ---- v205: the starting baseline, "how much time do you have?", the week's bars ----
test('your typical week: used until real practice takes over, blending in over four weeks', () => {
  const typ = { weekMin: 180 };
  const none = build([], { typical: typ }); assert.strictEqual(none.budget, 180); assert.strictEqual(none.budgetFrom, 'typical');
  const wk1 = build([0, 2, 4, 6].map(d => ({ date: iso(d), spoke: 'lag', min: 15 })), { typical: typ }); assert.strictEqual(wk1.budgetFrom, 'blend');
  assert.ok(wk1.realShare > 0.2 && wk1.realShare < 0.3, 'a week of logs ≈ ¼ real: ' + wk1.realShare); assert.ok(wk1.budget < 180 && wk1.budget > 100, 'mostly the estimate still: ' + wk1.budget);
  const full = build(steady(null, 15), { typical: typ }); assert.strictEqual(full.budgetFrom, '30 days', 'four weeks of logs: all real'); assert.strictEqual(full.budget, build(steady(null, 15)).budget);
});
test('a session for the time you have: up to 3 items, 10+ min each, adding up exactly', () => {
  const P = build(steady('chip', 10));
  [15, 20, 30, 45, 60, 90, 37].forEach(T => { const S = PLAN.session(P, T), sum = S.reduce((t, x) => t + x.min, 0);
    assert.ok(S.length >= 1 && S.length <= 3, T + ': ' + S.length); assert.ok(S.every(x => x.min >= 10), T + ' min each'); assert.strictEqual(sum, T, T + ' adds up: ' + JSON.stringify(S));
    assert.strictEqual(S[0].k, P.items[0].k, 'starts from the top'); });
  assert.strictEqual(PLAN.session(P, 15).length, 1, '15 min: one thing'); assert.strictEqual(PLAN.session(P, 60).length, 3);
});
test('the week: minutes done per area against its target, Monday to Sunday', () => {
  const L = [{ date: iso(0), spoke: 'lag', min: 20 }, { date: iso(0), spoke: 'lag', min: 10 }, { date: iso(30), spoke: 'lag', min: 99 }], P = build(L);
  const W = PLAN.week(P, L, NOW, 0), lag = W.rows.find(r => r.k === 'lag'); assert.strictEqual(lag.done, 30); assert.strictEqual(W.done, 30);
  assert.strictEqual(new Date(W.start).getDay(), 1, 'starts Monday'); assert.ok(W.rows.length === 7 && W.rows.every(r => r.target >= 5)); assert.strictEqual(W.target, W.rows.reduce((t, r) => t + r.target, 0));
  assert.ok(W.rows[0].target >= W.rows[6].target, 'biggest target first'); assert.strictEqual(PLAN.week(P, L, NOW, 1).done, 0, 'last week');
});
// v208 (Scott): balance by group – at least 20 % each, the spare 20 % to the leak, fading 40 → 35 → 30 → 25 over 4 weeks, topped up by new evidence
const G = P => Object.fromEntries(P.groups.map(g => [g.g, Math.round(g.share * 100)]));
const at = ages => build([], { rounds: ages.map((d, i) => Object.assign(ARC.round(), { id: 'a' + i, date: iso(d) })) });
test('balance: every group at least 20 %, one leak gets 40 %, shares add up to the week', () => {
  const P = at([1, 7, 14, 21]), g = G(P); Object.values(g).forEach(v => assert.ok(v >= 20, JSON.stringify(g)));
  assert.strictEqual(Math.max(...Object.values(g)), 40); assert.strictEqual(P.groups.filter(x => x.boost).length, 1);
  const sum = Object.values(P.weekMin).reduce((t, v) => t + v, 0); assert.ok(Math.abs(sum - P.budget) <= 4, sum + ' vs ' + P.budget);
  // no area inside a group starves: at least a quarter of its group
  Object.entries(P.weekMin).forEach(([k, v]) => assert.ok(v >= P.budget * 0.2 * 0.25 - 1, k + ' ' + v));
});
test('balance: the extra fades a step a week – 40, 35, 30, then even 25', () => {
  const lead = ages => Math.max(...Object.values(G(at(ages))));
  assert.deepStrictEqual([[1, 30], [8, 40], [15, 45], [22, 50]].map(lead), [40, 35, 30, 25]);
  assert.deepStrictEqual(Object.values(G(build([], { rounds: [] }))), [25, 25, 25, 25], 'no rounds → even');
});
test('balance: a new round that still shows the leak tops it back up', () => {
  assert.strictEqual(Math.max(...Object.values(G(at([16, 40])))), 30); assert.strictEqual(Math.max(...Object.values(G(at([2, 16, 40])))), 40);
});
test('balance: two leaks split the spare – 30 / 30 / 20 / 20; a lesson counts as a leak', () => {
  const les = [{ date: iso(2), spoke: 'lag', min: 30, kind: 'lesson', change: 'big', what: 'Putting stroke', lesson: 'L1' }];
  const P = build(les, { rounds: [Object.assign(ARC.round(), { id: 'x', date: iso(1) })] }), g = G(P);
  assert.deepStrictEqual(Object.values(g).sort((a, b) => b - a), [30, 30, 20, 20], JSON.stringify(g)); assert.strictEqual(g.putt, 30);
  assert.ok(P.weekMin.lag >= P.weekMin.short * 2, 'the lesson area leads its group');
});
test('balance: a big tournament leans the spare to putting and short game, never below 20 %', () => {
  const tour = { date: new Date(NOW + 4 * DAY).toISOString().slice(0, 10), big: true }, g = G(build([], { rounds: [Object.assign(ARC.round(), { id: 'x', date: iso(40) })], tour }));
  Object.values(g).forEach(v => assert.ok(v >= 20)); assert.ok(g.putt > g.full && g.short > g.full, JSON.stringify(g));
});
