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
  assert.deepStrictEqual(I.AREAS.map((a) => t.progress[a.k].frac), [0, 0, 0, 0, 0]); // v157: + Bunker
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

// v149: the tee tile's left + fairway + right always adds up to the fairway total; misses with no side are named by hole
test('tee tile numbers add up; a miss with no direction is named', () => {
  const r = copy('fw'); const h = r.holes.find(x => x.par > 3 && x.rows[1] && x.rows[1].loc !== 'fairway'); h.rows[1].dir = '';
  const S = SG.summarize(r), T = I.build(r, [], SG, {}).tiles.find(t => t.k === 'tee');
  assert.strictEqual(T.pic.left + T.pic.fw + T.pic.right + T.pic.noSide, S.fwTotal);
  assert.strictEqual(T.pic.noSide, 1);
  assert.match(T.text, new RegExp('Not in left/right: hole ' + (r.holes.indexOf(h) + 1) + ' \\(no direction entered\\)\\.$'));
  const full = I.build(copy('ok'), [], SG, {}).tiles.find(t => t.k === 'tee');
  assert.strictEqual(full.pic.noSide, 0); assert.doesNotMatch(full.text, /Not in/);
});

// v152: an OB tee shot marked "short" (Paradise Valley hole 5) – counted, and named as OB with the direction that was entered
test('OB tee shot with only short/long entered is named, numbers add up', () => {
  const r = copy('ob'); const h = r.holes.find(x => x.par > 3 && x.rows[1] && x.rows[1].loc !== 'fairway');
  h.rows.splice(1, 0, { loc: 'ob', dist: '', dir: 'short', pen: false });
  const S = SG.summarize(r), T = I.build(r, [], SG, {}).tiles.find(t => t.k === 'tee');
  assert.strictEqual(T.pic.left + T.pic.fw + T.pic.right + T.pic.noSide, S.fwTotal);
  assert.strictEqual(T.pic.noSideOB, 1);
  assert.match(T.text, new RegExp('hole ' + (r.holes.indexOf(h) + 1) + ' \\(OB, went short\\)'));
});

// ---------- v164 the verdict: normal range, trend, practice plan, coach notes ----------
test('areaVerdict: range needs 8 rounds; outside the middle 80% is unusual', () => {
  const vals = [0.5, -0.5, 0.2, -0.2, 0.4, -0.4, 0.1, -0.1, 0.3, -0.3];
  assert.equal(I.areaVerdict(-1, vals.slice(0, 7)).status, null);
  const low = I.areaVerdict(-2.5, vals); assert.equal(low.status, 'low'); assert.equal(low.worseThan, 10);
  assert.equal(I.areaVerdict(0.1, vals).status, 'normal'); assert.equal(I.areaVerdict(2, vals).status, 'high');
});
test('areaVerdict: one bad round is not a trend, several are', () => {
  const flat = Array.from({ length: 12 }, (_, i) => (i % 2 ? 0.2 : -0.2));
  assert.equal(I.areaVerdict(-4, flat).trend.dir, 'steady');
  const slide = [-1.5, -1.2, -1.8, -1.4].concat(flat.slice(0, 8));
  const t = I.areaVerdict(-1.6, slide).trend; assert.equal(t.dir, 'slipping'); assert.ok(t.diff < -1);
  assert.equal(I.areaVerdict(1.6, [1.5, 1.2, 1.8, 1.4].concat(flat.slice(0, 8))).trend.dir, 'improving');
});
test('verdict: not ready without enough rounds; a normal round reads as normal', () => {
  assert.equal(I.build(copy('r'), history(3), SG).verdict.ready, false);
  const V = I.build(copy('r'), history(12), SG).verdict;
  assert.equal(V.ready, true); assert.equal(V.headline, 'A normal round for you.'); assert.equal(V.plan.length, 0);
  V.rows.filter((v) => v.known).forEach((v) => { assert.equal(v.status, 'normal'); assert.equal(v.trend.dir, 'steady'); });
});
test('verdict: an off day on the greens is called an off day and still tops the practice plan', () => {
  const V = I.build(threePutts(copy('r'), [0, 2, 4, 6, 8]), history(12), SG).verdict, p = V.rows.find((v) => v.k === 'putting');
  assert.equal(p.status, 'low'); assert.equal(p.trend.dir, 'steady'); assert.equal(p.worseThan, 12);
  assert.match(V.headline, /^Putting cost you [\d.]+ more strokes than usual - an off day, not a trend\.$/);
  assert.equal(V.plan[0].area, 'putting'); assert.equal(V.plan[0].share, 100);
});
test('verdict: bad putting four rounds running is slipping', () => {
  const hist = history(12).map((r, i) => (i < 4 ? threePutts(r, [0, 2, 4, 6, 8]) : r));
  const V = I.build(threePutts(copy('r'), [0, 2, 4, 6, 8]), hist, SG).verdict, p = V.rows.find((v) => v.k === 'putting');
  assert.equal(p.trend.dir, 'slipping'); assert.match(V.headline, /putting is slipping|it has been slipping/);
  assert.equal(V.plan[0].area, 'putting'); assert.equal(V.plan[0].why, 'slipping');
  assert.ok(V.coach.some((c) => c.area === 'putting'), JSON.stringify(V.coach));
});
test('patterns: a one-way miss over several rounds becomes a coach note', () => {
  const rounds = [copy('a'), copy('b'), copy('c')].map((r) => tagPutts(r, 'short')), sums = rounds.map((r) => SG.summarize(r, 'pga'));
  const P = I.patterns(sums, SG, 'pga'), sp = P.find((x) => x.id === 'puttspeed');
  assert.ok(sp, JSON.stringify(P)); assert.equal(sp.dir, 'finished short'); assert.match(sp.text, /over your last 3 rounds\.$/);
});

test('v173: a great round for this golfer says what it beat, and that it is still behind the benchmark', () => {
  const hist = Array.from({ length: 6 }, (_, i) => threePutts(copy('h' + i), [0, 1, 4, 5]));
  const t = I.build(copy('now'), hist, SG);
  assert.strictEqual(t.headline, 'Great round – better than your normal everywhere.');
  assert.match(t.lede, /^Putting led the way: [3-5]\.\d strokes better than your normal\. Overall you were still \d+\.\d strokes behind the PGA Tour average – that is the long-term goal\.$/);
  assert.ok(!/better than the PGA Tour average/.test(t.headline + t.lede));
});
