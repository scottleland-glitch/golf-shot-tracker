/*
 * Strokes-gained engine for the golf tracker.
 *
 * BASELINE SOURCE
 * ---------------
 * Expected strokes to hole out are the PGA Tour baseline published by
 * Mark Broadie ("Every Shot Counts", 2014, Table 5.2 / Appendix and the
 * widely reproduced "PGA Tour average strokes to hole out" table, derived
 * from ShotLink data 2003-2012).
 *   - Off the green: yards, by lie (Tee, Fairway, Rough, Sand, Recovery).
 *   - On the green: feet.
 * Values between table rows are linearly interpolated.
 *
 * APPROXIMATIONS (not in Broadie's published table - our own estimates):
 *   - Tee shots under 100 yd: Broadie lists no tee values below 100 yd, so
 *     the Fairway column is used.
 *   - Under 10 yd off the green: held at the 10-yd value (no extrapolation).
 *   - Beyond 600 yd / 90 ft: extended with a gentle linear slope.
 *   - "Deep rough": Broadie has no such lie; estimated as Rough + 0.15.
 *   - "Hazard" (ball played from inside a hazard, no drop): uses Recovery.
 */
(function (root) {
  'use strict';

  var YARDS = [10, 20, 30, 40, 50, 60, 70, 80, 90,
    100, 120, 140, 160, 180, 200, 220, 240, 260, 280, 300,
    320, 340, 360, 380, 400, 420, 440, 460, 480, 500,
    520, 540, 560, 580, 600];

  // Columns aligned with YARDS. Tee column < 100 yd copies Fairway (see note).
  var OFF_GREEN = {
    fairway: [2.18, 2.40, 2.52, 2.60, 2.66, 2.70, 2.72, 2.75, 2.77,
      2.80, 2.85, 2.91, 2.98, 3.08, 3.19, 3.32, 3.45, 3.58, 3.69, 3.78,
      3.84, 3.88, 3.95, 4.03, 4.11, 4.15, 4.20, 4.29, 4.40, 4.53,
      4.66, 4.78, 4.86, 4.91, 4.94],
    tee: [2.18, 2.40, 2.52, 2.60, 2.66, 2.70, 2.72, 2.75, 2.77,
      2.92, 2.99, 2.97, 2.99, 3.05, 3.12, 3.17, 3.25, 3.45, 3.65, 3.71,
      3.79, 3.86, 3.92, 3.96, 3.99, 4.02, 4.08, 4.17, 4.28, 4.41,
      4.54, 4.65, 4.74, 4.79, 4.82],
    rough: [2.34, 2.59, 2.70, 2.78, 2.87, 2.91, 2.93, 2.96, 2.99,
      3.02, 3.08, 3.15, 3.23, 3.31, 3.42, 3.53, 3.64, 3.74, 3.83, 3.90,
      3.95, 4.02, 4.11, 4.21, 4.30, 4.34, 4.39, 4.48, 4.59, 4.72,
      4.85, 4.97, 5.05, 5.10, 5.13],
    sand: [2.43, 2.53, 2.66, 2.82, 2.92, 3.15, 3.21, 3.24, 3.24,
      3.23, 3.21, 3.22, 3.28, 3.40, 3.55, 3.70, 3.84, 3.93, 4.00, 4.04,
      4.12, 4.26, 4.41, 4.55, 4.69, 4.73, 4.78, 4.87, 4.98, 5.11,
      5.24, 5.36, 5.44, 5.49, 5.52],
    recovery: [3.45, 3.51, 3.57, 3.71, 3.79, 3.83, 3.84, 3.84, 3.82,
      3.80, 3.78, 3.80, 3.81, 3.82, 3.87, 3.92, 3.97, 4.03, 4.10, 4.20,
      4.31, 4.44, 4.56, 4.66, 4.75, 4.79, 4.84, 4.93, 5.04, 5.17,
      5.30, 5.42, 5.50, 5.55, 5.58]
  };

  // Putting (feet) - Broadie PGA Tour average putts to hole out.
  var FEET = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 30, 40, 50, 60, 90];
  var PUTTS = [1.00, 1.00, 1.01, 1.04, 1.13, 1.23, 1.34, 1.42, 1.50, 1.56,
    1.61, 1.78, 1.87, 1.98, 2.06, 2.14, 2.21, 2.40];

  var DEEP_ROUGH_ADD = 0.15;

  function interp(xs, ys, x, tailSlope) {
    if (x <= xs[0]) return ys[0];
    var n = xs.length;
    if (x >= xs[n - 1]) return ys[n - 1] + (x - xs[n - 1]) * tailSlope;
    for (var i = 1; i < n; i++) {
      if (x <= xs[i]) {
        var t = (x - xs[i - 1]) / (xs[i] - xs[i - 1]);
        return ys[i - 1] + t * (ys[i] - ys[i - 1]);
      }
    }
    return ys[n - 1];
  }

  /**
   * Expected strokes to hole out.
   * lie: tee | fairway | rough | deep | sand | recovery | hazard | green | holed
   * dist: yards (off green) or feet (green).
   */
  function expected(lie, dist) {
    if (lie === 'holed') return 0;
    dist = Math.max(0, Number(dist) || 0);
    if (lie === 'green') return interp(FEET, PUTTS, dist, 0.005);
    var col;
    var add = 0;
    switch (lie) {
      case 'tee': col = OFF_GREEN.tee; break;
      case 'fairway': col = OFF_GREEN.fairway; break;
      case 'rough': col = OFF_GREEN.rough; break;
      case 'deep': col = OFF_GREEN.rough; add = DEEP_ROUGH_ADD; break;
      case 'sand': col = OFF_GREEN.sand; break;
      case 'recovery':
      case 'hazard': col = OFF_GREEN.recovery; break;
      default: col = OFF_GREEN.fairway;
    }
    return interp(YARDS, col, dist, 0.0015) + add;
  }

  var PENALTY_STROKES = { none: 0, water: 1, lateral: 1, ob: 1 };

  function toYards(lie, dist) {
    if (lie === 'holed') return 0;
    return lie === 'green' ? dist / 3 : dist;
  }

  function apprBucket(yd) {
    if (yd < 100) return '30-100 yd';
    if (yd < 150) return '100-150 yd';
    if (yd < 200) return '150-200 yd';
    return '200+ yd';
  }
  function puttBucket(ft) {
    if (ft <= 5) return '0-5 ft';
    if (ft <= 15) return '5-15 ft';
    if (ft <= 30) return '15-30 ft';
    return '30+ ft';
  }

  /**
   * Analyse one hole. hole = { par, yards, shots: [ {lie, dist, side, pen} ] }
   * Each shot records where the ball ENDED (after any drop). For OB the end
   * position is the shot's own start (stroke and distance) - stored lie/dist
   * are ignored.
   */
  function analyzeHole(hole) {
    var out = [];
    var start = { lie: 'tee', dist: Number(hole.yards) || 0 };
    var shots = hole.shots || [];
    for (var i = 0; i < shots.length; i++) {
      var s = shots[i];
      var pen = s.pen || 'none';
      var end = pen === 'ob' ? { lie: start.lie, dist: start.dist }
        : { lie: s.lie, dist: s.lie === 'holed' ? 0 : Number(s.dist) || 0 };
      var penStrokes = PENALTY_STROKES[pen] || 0;
      var eStart = expected(start.lie, start.dist);
      var eEnd = expected(end.lie, end.dist);
      var sg = eStart - eEnd - 1 - penStrokes;

      var cat, bucket;
      if (start.lie === 'green') {
        cat = 'putting'; bucket = puttBucket(start.dist);
      } else if (start.lie === 'tee' && hole.par >= 4) {
        cat = 'tee'; bucket = 'Tee shots';
      } else if (start.dist > 30) {
        cat = 'approach'; bucket = apprBucket(start.dist);
      } else {
        cat = 'short'; bucket = '0-30 yd';
      }
      var hit = pen === 'ob' ? null
        : Math.round(toYards(start.lie, start.dist) - toYards(end.lie, end.dist));
      out.push({
        n: i + 1, start: start, end: end, pen: pen, penStrokes: penStrokes,
        side: s.side || '', eStart: eStart, eEnd: eEnd, sg: sg,
        cat: cat, bucket: bucket, hit: hit
      });
      start = end;
    }
    var penalties = out.reduce(function (a, r) { return a + r.penStrokes; }, 0);
    var done = shots.length > 0 && shots[shots.length - 1].lie === 'holed' &&
      shots[shots.length - 1].pen !== 'ob';
    // Green in regulation: on green (or holed) using <= par-2 strokes.
    var gir = false, used = 0;
    for (var j = 0; j < out.length; j++) {
      used += 1 + out[j].penStrokes;
      if (out[j].end.lie === 'green' || out[j].end.lie === 'holed') {
        gir = used <= hole.par - 2; break;
      }
    }
    var fairway = null;
    if (hole.par >= 4 && out.length) {
      var t = out[0];
      fairway = t.pen === 'none' && (t.end.lie === 'fairway' || t.end.lie === 'green' || t.end.lie === 'holed');
    }
    return {
      shots: out, strokes: shots.length + penalties, penalties: penalties,
      putts: out.filter(function (r) { return r.cat === 'putting'; }).length,
      done: done, gir: gir, fairway: fairway,
      sg: out.reduce(function (a, r) { return a + r.sg; }, 0)
    };
  }

  function summarize(round) {
    var S = {
      strokes: 0, par: 0, holesDone: 0, holesStarted: 0, penalties: 0, putts: 0,
      fwHit: 0, fwTotal: 0, gir: 0, girHoles: 0,
      teeLeft: 0, teeRight: 0, apprLeft: 0, apprRight: 0, allLeft: 0, allRight: 0,
      sgTotal: 0,
      cats: { tee: { sg: 0, n: 0 }, approach: { sg: 0, n: 0 }, short: { sg: 0, n: 0 }, putting: { sg: 0, n: 0 } },
      buckets: {}, holes: []
    };
    var order = ['Tee shots', '30-100 yd', '100-150 yd', '150-200 yd', '200+ yd', '0-30 yd',
      '0-5 ft', '5-15 ft', '15-30 ft', '30+ ft'];
    order.forEach(function (b) { S.buckets[b] = { sg: 0, n: 0 }; });
    (round.holes || []).forEach(function (h) {
      var a = analyzeHole(h);
      S.holes.push(a);
      if (!h.shots || !h.shots.length) return;
      S.holesStarted++;
      S.penalties += a.penalties;
      S.putts += a.putts;
      if (a.done) {
        S.holesDone++; S.strokes += a.strokes; S.par += Number(h.par);
        S.girHoles++; if (a.gir) S.gir++;
      }
      if (a.fairway !== null) { S.fwTotal++; if (a.fairway) S.fwHit++; }
      a.shots.forEach(function (r) {
        S.sgTotal += r.sg;
        S.cats[r.cat].sg += r.sg; S.cats[r.cat].n++;
        S.buckets[r.bucket].sg += r.sg; S.buckets[r.bucket].n++;
        if (r.side === 'L') S.allLeft++;
        if (r.side === 'R') S.allRight++;
        if (r.cat === 'tee') { if (r.side === 'L') S.teeLeft++; if (r.side === 'R') S.teeRight++; }
        if (r.cat === 'approach') { if (r.side === 'L') S.apprLeft++; if (r.side === 'R') S.apprRight++; }
      });
    });
    S.toPar = S.strokes - S.par;
    return S;
  }

  var api = { expected: expected, analyzeHole: analyzeHole, summarize: summarize,
    YARDS: YARDS, OFF_GREEN: OFF_GREEN, FEET: FEET, PUTTS: PUTTS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SG = api;
})(this);
