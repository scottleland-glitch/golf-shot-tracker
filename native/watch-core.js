/* StrokeWise Apple Watch – the rules for what the watch sends (no screens, no storage, no Capacitor). Only used inside the iPhone app
 * (native/build-www.sh adds it to www/ when the watch build is on); the website never loads it. Runs in a browser and in Node (tests).
 *
 * One watch EVENT changes ONE hole of a round using the same row rules as the phone's hole entry (app.js setFinish, setHoleOut,
 * the Finished dropdown's Unplayable / Lost ball, the hazard Drop / Re-tee / Played-it choice, "insert after", "delete row"):
 *   { id, seq, t, roundId, type, hole, ... }
 *   shot   – k (the stroke just hit = its row), fin, dir, dist (the distance to the pin AFTER the shot = the next row), hz, edit, pin (v233: set when the hole has none),
 *            club (v253: the club of stroke k; '' clears it)
 *            fin: fairway | rough | deep | bunker | green | trees | hazard | ob | unp | lost | in (in the hole)
 *            hz (hazard only): drop | retee | play     drop (unp only, optional): the lie it was dropped in
 *            For "in", dist (optional) is the distance of the stroke that went in (row k), when that row has none yet.
 *   setdist – k, dist: the distance of row k
 *   undo   – removes the last shot of the hole (or the hole-out); on a hole with no shots it reopens the hole before it
 *   delete – k: removes stroke k (row k, not the tee)
 *   insert – k: adds a blank stroke after row k (like the phone's "insert after"); the watch then edits shot k to fill it in
 * Without edit:true a shot is only accepted for the OPEN row of an unfinished hole (so a retried or stale message can't add a shot twice,
 * and the phone wins when both changed the same hole). A rejected event gets a reason: noround | finished | stale | badhole | bad.
 */
(function (root, factory) {
  var api = factory(function () { return root.SG || (typeof require === 'function' ? require('../sg.js') : null); });
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.StrokewiseWatchCore = api;
})(typeof self !== 'undefined' ? self : this, function (getSG) {
  'use strict';
  var FIN = ['fairway', 'rough', 'deep', 'bunker', 'green', 'trees', 'hazard', 'ob', 'unp', 'lost', 'in'];
  var DROP = ['fairway', 'rough', 'deep', 'bunker', 'green', 'trees']; // lies that are not a penalty
  var VERSION = 1, ACK_MAX = 80, ACK_SENT = 40;
  function SGx() { return getSG(); }
  function num(v) { if (v == null || v === '') return null; var n = Math.round(Number(v)); return n >= 1 && n <= 999 ? n : NaN; }
  function blank(v) { return v === '' || v == null; }

  function firstOpenHole(r) { var SG = SGx(); for (var i = 0; i < 18; i++) { if (!r.holes[i] || !SG.analyzeHole(r.holes[i]).done) return i; } return 17; }

  // ---- the hole-out (app.js setHoleOut without the confirm: the watch asked first) ----
  function holeOut(h, k) {
    var rows = h.rows;
    if (k === 0) { rows.splice(1); rows[0].loc = 'holedx'; delete rows[0].layup; return; } // an ace
    rows.splice(k + 1); rows.forEach(function (r, j) { if (j !== k) delete r.holeOut; });
    rows[k].holeOut = true;
  }
  // ---- the Finished choice (app.js setFinish) ----
  function setFinish(h, k, v) {
    var rows = h.rows, cur = rows[k];
    if (v === 'in') { holeOut(h, k); return; }
    if (cur.loc === 'holed') cur.loc = 'green'; if (k === 0 && cur.loc === 'holedx') cur.loc = 'tee'; delete cur.holeOut;
    var nx = rows[k + 1]; if (!nx) { nx = { loc: '', dist: '', dir: '', pen: false }; rows.push(nx); }
    var was = nx.loc;
    if (v === 'green' && was === 'holed') { /* the next putt went in: keep it */ }
    else if (v === 'ob') { nx.loc = 'ob'; nx.dist = ''; nx.pen = false; delete nx.retee; if (nx.dir === 'short' || nx.dir === 'long') nx.dir = ''; }
    else if (v === 'hazard') { if (was !== 'hazard') { nx.loc = 'hazard'; nx.pen = false; delete nx.retee; } }
    else { var held = was === 'holed', wasRe = !!nx.retee; nx.loc = v; delete nx.retee; if (held) nx.holeOut = true; if (was === 'ob' || wasRe) { nx.dist = ''; nx.pen = false; } }
    if (was === 'hazard' && v !== 'hazard') nx.pen = false;
    noLongOnFairway(nx); // v235 (app.js clearLongOnFairway)
  }
  // v235: Long means past the green, so it is off when the shot finished on the fairway (Long left/right keep just the side).
  function noLongOnFairway(row) {
    var SG = SGx();
    if (row && row.loc === 'fairway' && /^long/.test(SG.normDir(row.dir))) row.dir = SG.effectiveDir(row.dir, 'fairway', 0) || '';
  }
  // The Finished dropdown's extras (app.js change handler 'fin'): Unplayable = a drop +1, Lost ball = OB with a stroke and distance
  function finish(h, k, fin, drop) {
    var rows = h.rows;
    if (fin === 'unp') {
      var n0 = rows[k + 1], keep = n0 && DROP.indexOf(n0.loc) >= 0 ? n0.loc : 'rough', lie = DROP.indexOf(drop) >= 0 ? drop : keep;
      setFinish(h, k, lie); var nu = rows[k + 1]; if (nu) { nu.pen = true; delete nu.lost; }
      return;
    }
    if (fin === 'lost') { setFinish(h, k, 'ob'); var nl = rows[k + 1]; if (nl) nl.lost = true; return; }
    var nb = rows[k + 1]; if (nb) { delete nb.lost; if (nb.pen && fin !== 'hazard') nb.pen = false; }
    setFinish(h, k, fin);
  }

  function isHoleOutRow(r, k) { return !!r && (r.loc === 'holed' || r.loc === 'holedx' || (k !== 0 && !!r.holeOut && !!r.loc)); }
  function refreshFinished(round, h, autoFinish) {
    var a = SGx().analyzeHole(h);
    if (autoFinish && a.complete) h.finished = true; else if (h.finished && !a.complete) h.finished = false;
  }

  // v253: the club of a stroke, like the phone's Club box (a new club clears the wedge-matrix details of the old one)
  function setClub(row, c) {
    if ((row.club || '') === c) return;
    if (c) row.club = c; else delete row.club;
    ['wedgeY', 'wedgeF', 'wedgeAuto', 'wedgeOff', 'wedgeClock', 'wedgeLad'].forEach(function (f) { delete row[f]; });
  }
  function clubOf(row, ev) { if (typeof ev.club === 'string' && ev.club.length <= 24) setClub(row, ev.club.trim()); } // v253: the club picked on the watch (for stroke k)
  function applyShot(h, ev) {
    var SG = SGx(), rows = h.rows, k = ev.k, fin = ev.fin;
    if (FIN.indexOf(fin) < 0) return 'bad';
    if (!(k >= 0 && k < rows.length) || k !== Math.floor(k)) return 'stale';
    if (!ev.edit && k !== rows.length - 1) return 'stale';
    if (!ev.edit && h.finished) return 'finished';
    var dist = num(ev.dist); if (dist !== dist) return 'bad'; // NaN
    if (fin === 'in') {
      if (k > 0 && !rows[k].loc) return 'bad';
      clubOf(rows[k], ev);
      if (dist != null && blank(rows[k].dist)) rows[k].dist = dist;
      finish(h, k, 'in'); return '';
    }
    clubOf(rows[k], ev);
    finish(h, k, fin, ev.drop);
    if (ev.pin && !SG.normPin(h.pin) && SG.normPin(ev.pin)) h.pin = SG.normPin(ev.pin); // v233: "Where's the pin?" on the watch (only when the hole has none)
    var nx = rows[k + 1];
    if (fin === 'hazard') {
      var hz = ev.hz === 'retee' || ev.hz === 'drop' ? ev.hz : 'play';
      if (hz === 'retee') { nx.retee = true; nx.pen = true; nx.dist = ''; } else if (hz === 'drop') { delete nx.retee; nx.pen = true; } else { delete nx.retee; nx.pen = false; }
    }
    if (ev.dir !== undefined) { var d = SG.normDir(ev.dir); if (nx.loc === 'ob' && (d === 'short' || d === 'long')) d = ''; nx.dir = d; noLongOnFairway(nx); }
    if (dist != null && nx.loc !== 'ob' && !SG.isRetee(nx)) nx.dist = dist;
    return '';
  }
  function applyUndo(round, hi) {
    var SG = SGx(), h = round.holes[hi], rows = h.rows, last = rows.length - 1, row = rows[last];
    if (rows.length === 1 && !isHoleOutRow(row, 0)) {
      if (hi > 0) { var p = round.holes[hi - 1]; if (p && (p.finished || SG.analyzeHole(p).complete) && p.rows.length > 0) return applyUndo(round, hi - 1); }
      return { why: 'stale' };
    }
    if (isHoleOutRow(row, last)) {
      if (row.holeOut && last > 0) delete row.holeOut;
      else if (last === 0) row.loc = 'tee'; // an ace
      else rows.pop(); // the old "in the hole" rows: the stroke is dropped
    } else rows.pop();
    h.finished = false;
    return { hole: hi };
  }
  function applyDelete(h, k) {
    var rows = h.rows; if (!(k >= 1 && k < rows.length)) return 'stale';
    var gone = rows[k], wasOut = !!gone.holeOut || gone.loc === 'holed' || gone.loc === 'holedx';
    rows.splice(k, 1);
    var nx = rows[k]; if (nx) { if (nx.loc !== 'ob') nx.dir = ''; } // the stroke before now ends where the next row starts; its old miss direction no longer applies
    if (wasOut && k === rows.length) { var pv = rows[k - 1]; if (k - 1 === 0) pv.loc = 'holedx'; else pv.holeOut = true; } // the one before is now the stroke that went in
    return '';
  }
  function applyInsert(h, k) {
    var rows = h.rows; if (!(k >= 0 && k < rows.length)) return 'stale';
    var prev = rows[k], nr = { loc: prev.loc === 'green' ? 'green' : '', dist: '', dir: '', pen: false };
    if (prev.holeOut) { delete prev.holeOut; nr.holeOut = true; }
    else if (prev.loc === 'holedx' && k === 0) return 'bad';
    rows.splice(k + 1, 0, nr);
    return '';
  }

  /** Applies one event to the round (mutates it). Returns { ok, reason, hole }. Saving is the caller's job. */
  function applyEvent(round, ev) {
    var SG = SGx();
    if (!round || !ev || !round.holes) return { ok: false, reason: 'noround' };
    if (ev.roundId && round.id !== ev.roundId) return { ok: false, reason: 'noround' };
    var hi = ev.hole, h = round.holes[hi];
    if (ev.type === 'end') return { ok: true, hole: hi }; // "the golfer ended the round on the watch (workout saved)": information only – the phone owns the round and nothing in it changes
    if (ev.type === 'undo') {
      if (!h) return { ok: false, reason: 'badhole' };
      var u = applyUndo(round, hi); if (u.why) return { ok: false, reason: u.why };
      return { ok: true, hole: u.hole };
    }
    if (!(hi >= 0 && hi <= 17) || !h || !h.rows || !h.rows.length) return { ok: false, reason: 'badhole' };
    var why = '';
    switch (ev.type) {
      case 'shot': why = applyShot(h, ev); if (!why) refreshFinished(round, h, ev.fin === 'in'); break;
      case 'setdist': {
        var d = num(ev.dist), r = h.rows[ev.k];
        if (!r || d == null || d !== d) { why = r ? 'bad' : 'stale'; break; }
        if (h.finished && !ev.edit) { why = 'finished'; break; }
        if (ev.k > 0 && (r.loc === 'ob' || SG.isRetee(r))) { why = 'bad'; break; }
        r.dist = d; refreshFinished(round, h, false); break;
      }
      case 'delete': why = applyDelete(h, ev.k); if (!why) refreshFinished(round, h, false); break;
      case 'insert': why = applyInsert(h, ev.k); if (!why) refreshFinished(round, h, false); break;
      default: why = 'bad';
    }
    return why ? { ok: false, reason: why } : { ok: true, hole: hi };
  }

  // ---- what the phone tells the watch ----
  function rowOut(r, k) {
    var SG = SGx(), o = { loc: r.loc || '' }; // the row's own distance only (ob / re-tee rows have none)
    if (!blank(r.dist) && !isNaN(parseFloat(r.dist))) o.dist = Math.round(parseFloat(r.dist));
    if (r.dir) o.dir = SG.normDir(r.dir);
    if (r.pen) o.pen = true;
    if (r.holeOut) o.holeOut = true;
    if (r.retee) o.retee = true;
    if (r.lost) o.lost = true;
    if (r.club) o.club = String(r.club); // v253
    return o;
  }
  function holeOut1(h, i) {
    var a = SGx().analyzeHole(h);
    var o = { i: i, par: h.par || 4, fin: !!h.finished, complete: !!a.complete, strokes: a.liveStrokes, rows: h.rows.map(rowOut) }, pn = SGx().normPin(h.pin);
    if (pn) o.pin = pn; // v233: the watch asks for the pin only when the hole has none
    return o;
  }
  // v253: the bag for the watch's club list – [{ c: '7i', y: 152 }] (y = carry in yards, left out when not set); at most 20 clubs
  function clubsOut(L) {
    var out = []; (Array.isArray(L) ? L : []).forEach(function (x) { var c = x && String(x.c || '').trim(); if (!c || c.length > 24 || out.length >= 20 || /^putter$/i.test(c)) return;
      var o = { c: c }, y = Math.round(Number(x.y)); if (y > 0 && y < 450) o.y = y; out.push(o); });
    return out;
  }
  /** The compact picture of the round the watch shows. acks = [{ id, ok, why }]. */
  function buildState(round, acks, extra) {
    var SG = SGx(); extra = extra || {};
    if (!round || !round.holes) return { v: VERSION, ts: Date.now(), roundId: null, acks: (acks || []).slice(-ACK_SENT) };
    var cur = firstOpenHole(round), holes = [], done = 0, strokes = 0, par = 0;
    round.holes.forEach(function (h, i) {
      var a = SG.analyzeHole(h);
      if (a.done) { done++; strokes += a.liveStrokes; par += h.par || 4; }
      if (i === cur || i === cur + 1 || h.rows.length > 1 || h.finished) holes.push(holeOut1(h, i));
    });
    return { v: VERSION, ts: Date.now(), roundId: round.id, course: round.course || '', tee: round.tee || '', player: round.player || '',
      upd: Date.parse(round.updated || round.date) || 0, over: done >= 18, hole: cur, pars: round.holes.map(function (h) { return h.par || 4; }), holes: holes, holesDone: done, strokesDone: strokes, parDone: par,
      acks: (acks || []).slice(-ACK_SENT), clubs: clubsOut(extra.clubs) };
  }
  function pushAck(acks, id, ok, why) { acks = (acks || []).filter(function (a) { return a.id !== id; }); acks.push(ok ? { id: id, ok: 1 } : { id: id, ok: 0, why: why || '' }); return acks.slice(-ACK_MAX); }
  function knows(acks, id) { return (acks || []).some(function (a) { return a.id === id; }); }

  return { VERSION: VERSION, FIN: FIN, applyEvent: applyEvent, buildState: buildState, firstOpenHole: firstOpenHole, pushAck: pushAck, knows: knows, ACK_MAX: ACK_MAX };
});
