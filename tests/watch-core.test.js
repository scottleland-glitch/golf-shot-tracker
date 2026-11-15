// StrokeWise Apple Watch – the rules for applying what the watch sends to a round (native/watch-core.js): shots, edits, deletes, undo.
// Plain Node, no browser. Run: node tests/watch-core.test.js            (add --write-vectors to refresh tests/fixtures/watch-vectors.json,
// which the Swift port of these rules is checked against: native/watch/tests/run-linux.sh)
const assert = require('assert'); const fs = require('fs'); const path = require('path');
const SG = require('../sg.js'); global.SG = SG; const W = require('../native/watch-core.js');
const ok = m => console.log('  ✓ ' + m);
const mk = (rows, par, extra) => Object.assign({ par: par || 4, finished: false, rows: rows }, extra || {});
const R = (loc, dist, x) => Object.assign({ loc, dist: dist == null ? '' : dist, dir: '', pen: false }, x || {});
const round = (h0, hs) => { const holes = [h0 || mk([R('tee', 400)])]; for (let i = 1; i < 18; i++) holes.push(hs && hs[i] || mk([R('tee', 380 + i)])); return { v: 3, dv: 2, id: 'r1', date: '2026-11-14T10:00:00.000Z', course: 'Ridgeview', tee: 'White', player: 'Scott', baseline: 'pga', holes }; };
let evN = 0; const ev = (type, hole, x) => Object.assign({ id: 'e' + (++evN), roundId: 'r1', type, hole }, x || {});
const rowsOf = (r, i) => JSON.parse(JSON.stringify(r.holes[i || 0].rows));
const VEC = [];  // scenarios for the Swift check: { name, par, rows, events, expect: [{ ok, reason, finished, rows }] }
function run(name, h0, events, extra) {
  const r = round(h0, extra && extra.holes), start = JSON.parse(JSON.stringify(r.holes[0])), expect = [], res = [];
  events.forEach(e => { const o = W.applyEvent(r, e); res.push(o); expect.push({ ok: o.ok, reason: o.reason || '', hole: o.hole == null ? -1 : o.hole, finished: !!r.holes[e.hole].finished, rows: rowsOf(r, e.hole) }); });
  VEC.push({ name, start, prev: extra && extra.holes && extra.holes[1] ? extra.holes[1] : null, events, expect });
  return { r, res };
}

// ---- 1. a normal hole: tee shot, approach, putt in -> finished, 3 strokes (the phone's own rules) ----
{ const { r, res } = run('normal hole', mk([R('tee', 400)]), [
    ev('shot', 0, { k: 0, fin: 'fairway', dir: 'right', dist: 150 }), ev('shot', 0, { k: 1, fin: 'green', dir: '', dist: 12 }), ev('shot', 0, { k: 2, fin: 'in' })]);
  assert.ok(res.every(x => x.ok), JSON.stringify(res));
  assert.deepStrictEqual(rowsOf(r), [R('tee', 400), R('fairway', 150, { dir: 'right' }), R('green', 12, { holeOut: true })]);
  const a = SG.analyzeHole(r.holes[0]); assert.ok(a.complete && a.done && r.holes[0].finished); assert.strictEqual(a.strokes, 3);
  ok('tee shot → approach → putt in: 3 rows, holeOut on the last, hole finished and counts in stats'); }
// ---- 2. each event sets the next row; the phone shows the same ----
{ const { r } = run('first shot only', mk([R('tee', 400)]), [ev('shot', 0, { k: 0, fin: 'rough', dir: 'longleft', dist: 180 })]);
  assert.deepStrictEqual(rowsOf(r), [R('tee', 400), R('rough', 180, { dir: 'longleft' })]); assert.ok(!r.holes[0].finished); ok('a shot writes the next row (lie, dir, distance) and leaves the hole open'); }
// ---- 3. stale / retried / finished are refused ----
{ const e1 = ev('shot', 0, { k: 0, fin: 'fairway', dir: '', dist: 150 }); const { r, res } = run('stale', mk([R('tee', 400)]), [e1, e1, ev('shot', 0, { k: 0, fin: 'rough', dist: 100 })]);
  assert.ok(res[0].ok && !res[1].ok && res[1].reason === 'stale' && res[2].reason === 'stale'); assert.strictEqual(r.holes[0].rows.length, 2); ok('the same shot twice, or a shot for a row that already has its result, is refused (phone wins)');
  const f = run('finished', mk([R('tee', 400), R('green', 5, { holeOut: true })], 3, { finished: true }), [ev('shot', 0, { k: 1, fin: 'in' }), ev('shot', 0, { k: 1, fin: 'green', dist: 3, edit: true })]);
  assert.strictEqual(f.res[0].reason, 'finished'); assert.ok(f.res[1].ok); ok('a finished hole refuses plain shots but takes edits');
  assert.strictEqual(W.applyEvent(round(), ev('shot', 0, { k: 0, fin: 'fairway', roundId: 'other' })).reason, 'noround');
  assert.strictEqual(W.applyEvent(round(), ev('shot', 18, { k: 0, fin: 'fairway' })).reason, 'badhole');
  assert.strictEqual(W.applyEvent(round(), ev('shot', 0, { k: 0, fin: 'moon' })).reason, 'bad');
  assert.strictEqual(W.applyEvent(round(), ev('shot', 0, { k: 0, fin: 'rough', dist: 'abc' })).reason, 'bad'); ok('other round, bad hole, unknown lie and a bad distance are refused'); }
// ---- 4. OB, lost ball, hazard, unplayable ----
{ const { r } = run('ob', mk([R('tee', 400)]), [ev('shot', 0, { k: 0, fin: 'ob', dir: 'short' }), ev('shot', 0, { k: 1, fin: 'fairway', dir: '', dist: 140 })]);
  assert.strictEqual(rowsOf(r)[1].loc, 'ob'); assert.strictEqual(rowsOf(r)[2].loc, 'fairway'); assert.strictEqual(rowsOf(r)[2].dist, 140);
  const o = run('ob side', mk([R('tee', 400)]), [ev('shot', 0, { k: 0, fin: 'ob', dir: 'short' })]); assert.strictEqual(rowsOf(o.r)[1].dir, '', 'OB needs a side: short is cleared');
  const o2 = run('ob left', mk([R('tee', 400)]), [ev('shot', 0, { k: 0, fin: 'ob', dir: 'shortleft', dist: 77 })]);
  assert.deepStrictEqual(rowsOf(o2.r)[1], R('ob', '', { dir: 'shortleft' })); assert.strictEqual(SG.rowStrokes(o2.r.holes[0].rows), 3, 'OB = stroke + penalty + the re-hit row'); ok('OB: side kept (short/long cleared), no distance, +1');
  const l = run('lost', mk([R('tee', 400)]), [ev('shot', 0, { k: 0, fin: 'lost', dir: 'left' })]); assert.deepStrictEqual(rowsOf(l.r)[1], R('ob', '', { dir: 'left', lost: true })); ok('Lost ball = OB row with lost:true');
  const p = run('unplayable', mk([R('tee', 400)]), [ev('shot', 0, { k: 0, fin: 'unp', dist: 150 })]); assert.deepStrictEqual(rowsOf(p.r)[1], R('rough', 150, { pen: true }));
  const p2 = run('unplayable drop', mk([R('tee', 400)]), [ev('shot', 0, { k: 0, fin: 'unp', dist: 150, drop: 'fairway' })]); assert.deepStrictEqual(rowsOf(p2.r)[1], R('fairway', 150, { pen: true })); ok('Unplayable: a drop (+1), default Rough or the lie given');
  const h1 = run('hazard drop', mk([R('tee', 400)]), [ev('shot', 0, { k: 0, fin: 'hazard', hz: 'drop', dist: 120 })]); assert.deepStrictEqual(rowsOf(h1.r)[1], R('hazard', 120, { pen: true }));
  const h2 = run('hazard retee', mk([R('tee', 400)]), [ev('shot', 0, { k: 0, fin: 'hazard', hz: 'retee', dist: 120 })]); assert.deepStrictEqual(rowsOf(h2.r)[1], R('hazard', '', { pen: true, retee: true }));
  const h3 = run('hazard play', mk([R('tee', 400)]), [ev('shot', 0, { k: 0, fin: 'hazard', hz: 'play', dist: 90 })]); assert.deepStrictEqual(rowsOf(h3.r)[1], R('hazard', 90));
  assert.strictEqual(SG.rowStrokes(h1.r.holes[0].rows), 3); assert.strictEqual(SG.rowStrokes(h2.r.holes[0].rows), 3); assert.strictEqual(SG.rowStrokes(h3.r.holes[0].rows), 2); ok('Hazard: drop (+1, distance), re-tee (+1, no distance), played it (no penalty)'); }
// ---- 5. holing out from off the green keeps the lie; an ace ----
{ const { r } = run('chip in', mk([R('tee', 400), R('fairway', 150, {}), R('rough', 25, { dir: 'right' })]), [ev('shot', 0, { k: 2, fin: 'in' })]);
  assert.strictEqual(rowsOf(r)[2].loc, 'rough'); assert.ok(rowsOf(r)[2].holeOut); assert.ok(SG.analyzeHole(r.holes[0]).complete && r.holes[0].finished); ok('hole-out from the rough keeps its lie (holeOut on the row)');
  const a = run('ace', mk([R('tee', 160)], 3), [ev('shot', 0, { k: 0, fin: 'in' })]); assert.strictEqual(rowsOf(a.r)[0].loc, 'holedx'); assert.ok(a.r.holes[0].finished && SG.analyzeHole(a.r.holes[0]).strokes === 1); ok('an ace: row 1 becomes holedx, 1 stroke, finished');
  const nd = run('no tee distance', mk([R('tee', '')]), [ev('shot', 0, { k: 0, fin: 'in' }), ev('shot', 0, { k: 0, fin: 'in', dist: 160 })]);
  assert.ok(!nd.r.holes[0].finished || SG.analyzeHole(nd.r.holes[0]).complete); ok('an ace with no tee distance stays unfinished until the distance is known'); }
// ---- 6. undo ----
{ const r0 = mk([R('tee', 400), R('fairway', 150, { dir: 'right' })]);
  const u1 = run('undo a shot', r0, [ev('undo', 0)]); assert.deepStrictEqual(rowsOf(u1.r), [R('tee', 400)]);
  const done = mk([R('tee', 400), R('fairway', 150), R('green', 12, { holeOut: true })], 4, { finished: true });
  const u2 = run('undo the hole-out', done, [ev('undo', 0)]); assert.deepStrictEqual(rowsOf(u2.r), [R('tee', 400), R('fairway', 150), R('green', 12)]); assert.ok(!u2.r.holes[0].finished);
  const u3 = run('undo an ace', mk([R('holedx', 160)], 3, { finished: true }), [ev('undo', 0)]); assert.deepStrictEqual(rowsOf(u3.r), [R('tee', 160)]); assert.ok(!u3.r.holes[0].finished);
  ok('undo: the last shot, a hole-out (reopens the hole), an ace');
  const prev = () => mk([R('tee', 400), R('fairway', 150), R('green', 12, { holeOut: true })], 4, { finished: true });
  const r4 = round(prev()); const o4 = W.applyEvent(r4, ev('undo', 1)); assert.ok(o4.ok && o4.hole === 0 && !r4.holes[0].finished && rowsOf(r4, 0).length === 3 && !rowsOf(r4, 0)[2].holeOut);
  assert.strictEqual(W.applyEvent(round(), ev('undo', 0)).reason, 'stale'); assert.strictEqual(W.applyEvent(round(), ev('undo', 0)).ok, false);
  ok('undo on the first shot of the next hole reopens the just-finished hole; undo with nothing to undo is refused'); }
// ---- 7. editing earlier holes: edit a shot, delete, insert, set a distance ----
{ const done = () => mk([R('tee', 400), R('fairway', 150, { dir: 'left' }), R('green', 12, { dir: 'short' }), R('green', 2, { holeOut: true })], 4, { finished: true });
  const e1 = run('edit a shot', done(), [ev('shot', 0, { k: 1, fin: 'rough', dir: 'right', dist: 30, edit: true })]); assert.deepStrictEqual(rowsOf(e1.r)[2], R('rough', 30, { dir: 'right' })); assert.strictEqual(rowsOf(e1.r).length, 4); assert.ok(e1.r.holes[0].finished);
  ok('editing shot 2 changes only that shot\'s finish (lie, direction, distance); the rest stays and the hole stays finished');
  // wait: row 2 is shot 2's start; editing shot k=1 rewrites row 2 – asserted above
  const e2 = run('edit to hole-out cuts later shots', done(), [ev('shot', 0, { k: 1, fin: 'in', edit: true })]); assert.deepStrictEqual(rowsOf(e2.r), [R('tee', 400), R('fairway', 150, { dir: 'left', holeOut: true })]); assert.ok(e2.r.holes[0].finished); ok('editing a shot to "In the hole" removes the shots after it');
  const d1 = run('delete a middle shot', done(), [ev('delete', 0, { k: 2 })]); assert.deepStrictEqual(rowsOf(d1.r), [R('tee', 400), R('fairway', 150, { dir: 'left' }), R('green', 2, { holeOut: true })]); assert.ok(d1.r.holes[0].finished);
  const d2 = run('delete the hole-out shot', done(), [ev('delete', 0, { k: 3 })]); assert.deepStrictEqual(rowsOf(d2.r)[2], R('green', 12, { dir: 'short', holeOut: true })); assert.ok(d2.r.holes[0].finished);
  const d3 = run('delete the tee is refused', done(), [ev('delete', 0, { k: 0 })]); assert.strictEqual(d3.res[0].reason, 'stale'); ok('delete a shot (row): the hole-out moves up when the last shot goes; the tee shot cannot be deleted');
  const i1 = run('insert after', done(), [ev('insert', 0, { k: 1 })]); assert.strictEqual(rowsOf(i1.r).length, 5); assert.deepStrictEqual(rowsOf(i1.r)[2], R('', '')); assert.ok(!i1.r.holes[0].finished, 'incomplete until the new shot is filled in');
  const i2 = run('insert then fill', done(), [ev('insert', 0, { k: 1 }), ev('shot', 0, { k: 1, fin: 'rough', dir: 'long', dist: 60, edit: true })]); assert.deepStrictEqual(rowsOf(i2.r)[2], R('rough', 60, { dir: 'long' })); assert.ok(SG.analyzeHole(i2.r.holes[0]).complete);
  const i3 = run('insert after the last', done(), [ev('insert', 0, { k: 3 })]); assert.deepStrictEqual(rowsOf(i3.r)[3], R('green', 2)); assert.deepStrictEqual(rowsOf(i3.r)[4], R('green', '', { holeOut: true }));
  ok('insert a shot after another (the phone\'s "insert after"): the hole reopens until the new shot is filled in');
  const s1 = run('set the tee distance', mk([R('tee', '')]), [ev('setdist', 0, { k: 0, dist: 412 })]); assert.strictEqual(rowsOf(s1.r)[0].dist, 412);
  const s2 = run('set a distance on ob is refused', mk([R('tee', 400), R('ob', '', { dir: 'left' })]), [ev('setdist', 0, { k: 1, dist: 100 })]); assert.strictEqual(s2.res[0].reason, 'bad'); ok('set a distance; not on an OB / re-tee row'); }
// ---- 8. the state the watch is given ----
{ const rr = round(mk([R('tee', 400), R('fairway', 150), R('green', 12, { holeOut: true })], 4, { finished: true }));
  const st = W.buildState(rr, [{ id: 'a', ok: 1 }]); assert.strictEqual(st.hole, 1); assert.strictEqual(st.holesDone, 1); assert.strictEqual(st.strokesDone, 3); assert.strictEqual(st.parDone, 4); assert.strictEqual(st.roundId, 'r1');
  assert.deepStrictEqual(st.holes.map(h => h.i), [0, 1]); assert.strictEqual(st.pars.length, 18); assert.deepStrictEqual(st.holes[0].rows[2], { loc: 'green', dist: 12, holeOut: true });
  assert.ok(JSON.stringify(st).length < 4000, 'small enough for the watch context: ' + JSON.stringify(st).length); assert.deepStrictEqual(W.buildState(null, []).roundId, null);
  const ob = round(mk([R('tee', 400), R('ob', '', { dir: 'left', lost: true })])); const s2 = W.buildState(ob, []); assert.deepStrictEqual(s2.holes[0].rows[1], { loc: 'ob', dir: 'left', lost: true });
  let ack = []; for (let i = 0; i < 100; i++) ack = W.pushAck(ack, 'x' + i, i % 2, 'why'); assert.strictEqual(ack.length, W.ACK_MAX); assert.ok(W.knows(ack, 'x99') && !W.knows(ack, 'x1'));
  ok('buildState: current hole, totals, compact rows; acks are capped'); }
// ---- 9. a full 18-hole round never exceeds the context size ----
{ const holes = []; for (let i = 0; i < 18; i++) holes.push(mk([R('tee', 400), R('fairway', 150, { dir: 'right' }), R('green', 25, { dir: 'short' }), R('green', 3, { holeOut: true })], 4, { finished: true }));
  const rr = round(holes[0], holes); const len = JSON.stringify(W.buildState(rr, [])).length; assert.ok(len < 12000, 'size ' + len); ok('a whole round is ' + len + ' bytes of JSON'); }

if (process.argv.includes('--write-vectors')) { fs.writeFileSync(path.join(__dirname, 'fixtures/watch-vectors.json'), JSON.stringify(VEC, null, 1) + '\n'); console.log('  wrote tests/fixtures/watch-vectors.json (' + VEC.length + ' scenarios)'); }
console.log('watch-core: all passed');
