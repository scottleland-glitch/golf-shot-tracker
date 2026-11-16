// v221: weekahead.js – "Your game and your training" and "Your week ahead"
const test = require('node:test'), assert = require('assert');
const WA = require('../weekahead.js'), MY = require('../mygame.js'), PLAN = require('../plan.js');
const DAY = 864e5, now = Date.parse('2026-11-16T09:00:00'); // a Monday
// a stand-in for SG.summarize: each round carries its shots' strokes gained by skill
const shot = (cat, dist, sg) => ({ cat, start: { dist, lie: cat === 'putting' ? 'green' : 'fairway' }, sg });
const SG = { summarize: (r) => ({ holesDone: 18, strokes: 80, holes: [{ done: true, shots: r.shots }] }) };
const round = (daysAgo, sg) => { const s = []; const add = (n, cat, dist, v) => { for (let i = 0; i < n; i++) s.push(shot(cat, dist, v / n)); };
  add(14, 'tee', 300, sg.drive || 0); add(10, 'approach', 150, sg.irons || 0); add(6, 'approach', 60, sg.wedges || 0); add(6, 'short', 15, sg.chip || 0); add(12, 'putting', 20, sg.lag || 0); add(16, 'putting', 4, sg.short || 0);
  return { id: 'r' + daysAgo, date: new Date(now - daysAgo * DAY).toISOString(), shots: s }; };
const log = (daysAgo, spoke, min) => ({ id: 'l' + daysAgo + spoke, date: new Date(now - daysAgo * DAY).toISOString(), spoke, min });

test('your game and your training: strokes lost, practice a week, and the biggest mismatch named', () => {
  const R = [5, 12, 19, 26, 40, 60].map(d => round(d, { irons: -3, chip: -1, short: 0.2 }));
  const L = [2, 9, 16, 23].flatMap(d => [log(d, 'short', 40), log(d, 'chip', 20)]);
  const G = WA.gaps({ rounds: R, logs: L, SG, MYGAME: MY, bl: 'pga', now });
  const by = Object.fromEntries(G.rows.map(r => [r.k, r]));
  assert.ok(Math.abs(by.irons.lost - 3) < 1e-9 && Math.abs(by.short.lost + 0.2) < 1e-9, 'lost = −strokes gained');
  assert.strictEqual(by.short.week, 40); assert.strictEqual(by.chip.week, 20); assert.strictEqual(by.irons.week, 0);
  assert.strictEqual(G.head, 'Irons 100+ cost you 3.0 a round – and got no practice this month');
  assert.strictEqual(WA.gaps({ rounds: [], logs: L, SG, MYGAME: MY, bl: 'pga', now }).head, 'Play a round and this fills in');
});
test('arrows: last 30 days against the months before', () => {
  const R = [5, 12, 19].map(d => round(d, { short: 1 })).concat([40, 55, 70, 85].map(d => round(d, { short: -1 })));
  const G = WA.gaps({ rounds: R, logs: [], SG, MYGAME: MY, bl: 'pga', now }), by = Object.fromEntries(G.rows.map(r => [r.k, r]));
  assert.strictEqual(by.short.arrow, 'up'); assert.strictEqual(by.drive.arrow, 'flat'); assert.strictEqual(by.bunker.arrow, null, 'no bunker shots');
  const W = WA.gaps({ rounds: [5, 12, 19].map(d => round(d, { wedges: -2 })).concat([40, 55, 70].map(d => round(d, {}))), logs: [], SG, MYGAME: MY, bl: 'pga', now });
  assert.strictEqual(W.rows.find(r => r.k === 'wedges').arrow, 'down');
});
test('week ahead: putting paid off after heavy practice, wedges slipped → more wedges, keep going on putting', () => {
  const R = [1].map(d => round(d, { lag: 0.6, short: 0.6, wedges: -1 })).concat([10, 20, 30, 45].map(d => round(d, { lag: -0.3, short: -0.2 })));
  const L = [2, 4, 6].flatMap(d => [log(d, 'short', 60), log(d, 'lag', 30)]).concat([20, 40, 60].map(d => log(d, 'short', 20)));
  const cur = { short: 45, lag: 30, wedges: 45, irons: 30, chip: 25, drive: 15, bunker: 10 }, last = { short: 45, lag: 35, wedges: 30, irons: 30, chip: 25, drive: 15, bunker: 10 };
  const A = WA.ahead({ rounds: R, logs: L, SG, MYGAME: MY, PLAN, bl: 'pga', now, cur, last });
  assert.strictEqual(A.head, 'Putting is working. Wedges need you.');
  assert.deepStrictEqual(A.lines.map(l => [l.good, l.title]), [[true, 'Putting practice is paying off'], [false, 'Wedges slipped']]);
  assert.match(A.lines[0].text, /^1\.\d strokes better in your last round than your 3-month average – after \d+ min a week of putting practice\.$/);
  const by = Object.fromEntries(A.rows.map(r => [r.k, r]));
  assert.strictEqual(by.wedges.delta, 15); assert.strictEqual(by.short.keep, true); assert.strictEqual(by.lag.keep, true); assert.strictEqual(by.lag.delta, -5); assert.strictEqual(by.irons.keep, false);
  assert.match(A.why, /^More wedges after \w+day's round\. Putting stays high – practice takes a few weeks to show fully in your rounds\.$/);
  assert.strictEqual(A.rows[0].target, 45); assert.strictEqual(A.total, 200); assert.strictEqual(A.totalLast, 190);
});
test('week ahead: good without extra practice is "was good", no keep-going; no rounds → same plan', () => {
  const R = [1].map(d => round(d, { irons: 1 })).concat([10, 20, 30].map(d => round(d, {})));
  const A = WA.ahead({ rounds: R, logs: [], SG, MYGAME: MY, PLAN, bl: 'pga', now, cur: { irons: 30 }, last: { irons: 30 } });
  assert.strictEqual(A.head, 'Full swing was good last week'); assert.strictEqual(A.rows[0].keep, false);
  const N = WA.ahead({ rounds: [round(30, {})], logs: [], SG, MYGAME: MY, PLAN, bl: 'pga', now, cur: { irons: 30 }, last: { irons: 30 } });
  assert.strictEqual(N.head, 'No rounds last week – same plan'); assert.deepStrictEqual(N.lines, []);
});
test('a big change (15+ min on an area) brings the card back mid-week', () => {
  assert.strictEqual(WA.changed({ wedges: 30, short: 40 }, { wedges: 45, short: 40 }), true);
  assert.strictEqual(WA.changed({ wedges: 30 }, { wedges: 40 }), false); assert.strictEqual(WA.changed(null, { wedges: 40 }), false);
  assert.strictEqual(new Date(WA.mondayOf(Date.parse('2026-11-19T15:00:00'))).getDate(), 16);
});
