/*
 * Strokes-gained engine for the golf tracker.
 *
 * PGA TOUR BASELINE (sourced)
 * ---------------------------
 * Off the green (yards, by lie): Broadie, M. (2011/2012) "Assessing Golfer
 *   Performance on the PGA TOUR", Appendix A, Table 9 (8M+ ShotLink shots,
 *   2003-2010). https://www.columbia.edu/~mnb2/broadie/Assets/strokes_gained_pga_broadie_20110408.pdf
 *   (Published in Interfaces 42(2), 2012.) Values below are copied verbatim.
 *   Note: Broadie's book "Every Shot Counts" (2014, Table 5.2, 2004-2012 data)
 *   has slightly different values beyond 400 yd; we use the verifiable paper.
 * Putting (feet): Broadie, "Every Shot Counts" (2014) Table 3.10, as reproduced at
 *   https://golfingfocus.com/what-percentage-of-putts-do-pros-make-tv-does-not-tell-the-story/
 *   cross-checked with the 2011 paper text (8 ft ~ 1.5, 16 ft ~ 1.8, 33 ft = 2.0).
 * Linear interpolation between rows.
 *
 * APPROXIMATIONS (ours, not in the published table):
 *   - Tee shots under 100 yd: no published tee values, Fairway column used.
 *   - Under 10 yd off the green: held at the 10-yd value.
 *   - Beyond 600 yd / 90 ft: extended with a gentle linear slope.
 *   - "Deep rough": not a Broadie lie; estimated as Rough + 0.15.
 *   - "Hazard" (played from inside a hazard): Recovery column.
 *
 * OTHER BASELINES (LPGA, D1 men/women, scratch men/women) are ESTIMATED -
 * see BASELINES below for sources and the derivation method.
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
      3.84, 3.88, 3.95, 4.03, 4.11, 4.19, 4.27, 4.34, 4.42, 4.50,
      4.58, 4.66, 4.74, 4.82, 4.89],
    tee: [2.18, 2.40, 2.52, 2.60, 2.66, 2.70, 2.72, 2.75, 2.77,
      2.92, 2.99, 2.97, 2.99, 3.05, 3.12, 3.17, 3.25, 3.45, 3.65, 3.71,
      3.79, 3.86, 3.92, 3.96, 3.99, 4.02, 4.08, 4.17, 4.28, 4.41,
      4.54, 4.65, 4.74, 4.79, 4.82],
    rough: [2.34, 2.59, 2.70, 2.78, 2.87, 2.91, 2.93, 2.96, 2.99,
      3.02, 3.08, 3.15, 3.23, 3.31, 3.42, 3.53, 3.64, 3.74, 3.83, 3.90,
      3.95, 4.02, 4.11, 4.21, 4.30, 4.40, 4.49, 4.58, 4.68, 4.77,
      4.87, 4.96, 5.06, 5.15, 5.25],
    sand: [2.43, 2.53, 2.66, 2.82, 2.92, 3.15, 3.21, 3.24, 3.24,
      3.23, 3.21, 3.22, 3.28, 3.40, 3.55, 3.70, 3.84, 3.93, 4.00, 4.04,
      4.12, 4.26, 4.41, 4.55, 4.69, 4.83, 4.97, 5.11, 5.25, 5.40,
      5.54, 5.68, 5.82, 5.96, 6.10],
    recovery: [3.45, 3.51, 3.57, 3.71, 3.79, 3.83, 3.84, 3.84, 3.82,
      3.80, 3.78, 3.80, 3.81, 3.82, 3.87, 3.92, 3.97, 4.03, 4.10, 4.20,
      4.31, 4.44, 4.56, 4.66, 4.75, 4.84, 4.94, 5.03, 5.13, 5.22,
      5.32, 5.41, 5.51, 5.60, 5.70]
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
  function expectedPGA(lie, dist) {
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

  var PENALTY_STROKES = { none: 0, water: 1, lateral: 1, drop: 1, ob: 1 };

  /*
   * Row model v3 (what the phone screen shows) - ONE ROW = ONE STROKE.
   *   dist - distance to the pin this stroke was hit FROM (yards; feet on the green)
   *   loc  - where the ball was when hit: tee (row 1) | fairway | rough | deep |
   *          bunker | trees | green | hazard | ob | holed | holedx
   *   dir  - where the PREVIOUS stroke ended relative to its target (8-way):
   *          short | long | left | right | shortleft | shortright | longleft | longright | ''
   *          (old saves used L/R/S/O = left/right/short/over -> normDir maps them).
   *          For an approach that missed the green: position relative to the green.
   *          For an approach that hit the green: position relative to the hole.
   *   pen  - true = a penalty stroke was added to get here (+1), e.g. a drop
   * 'ob'     = previous stroke went OB: +1, and this stroke is the re-hit from
   *            the same spot (distance and lie copied from the row above).
   * 'holed'  = "In the hole - putt": this stroke (a putt, distance in feet) went in.
   * 'holedx' = "In the hole - off green": this stroke (distance in yards) went in.
   *            Its lie is unknown, so the Fairway baseline is used (approximation).
   * Hazard + P = dropped (rough baseline); Hazard, no P = played from inside it.
   * Score = number of rows + penalty strokes. Complete = every row has a
   * distance and a location and the LAST row is In the hole (with a distance).
   */
  var DIR8 = ['long', 'longright', 'right', 'shortright', 'short', 'shortleft', 'left', 'longleft'];
  var DIR_NAME = { short: 'Short', long: 'Long', left: 'Left', right: 'Right', shortleft: 'Short left',
    shortright: 'Short right', longleft: 'Long left', longright: 'Long right' };
  // Angle in degrees, maths convention (0 = right, 90 = long/away from golfer, 270 = short/toward golfer)
  var DIR_ANGLE = { right: 0, longright: 45, long: 90, longleft: 135, left: 180, shortleft: 225, short: 270, shortright: 315 };
  var OLD_DIR = { L: 'left', R: 'right', S: 'short', O: 'long' };
  function normDir(d) { d = d || ''; return OLD_DIR[d] || (DIR_NAME[d] ? d : ''); }
  function dirSide(d) { return /left$/.test(d) ? 'L' : /right$/.test(d) ? 'R' : ''; }
  function dirDepth(d) { return /^short/.test(d) ? 'S' : /^long/.test(d) ? 'O' : ''; }
  // Pin location on the green: 3x3 grid, front = toward the golfer (bottom of the pictures)
  var PIN_GRID = [['backleft', 'backcenter', 'backright'], ['midleft', 'center', 'midright'], ['frontleft', 'frontcenter', 'frontright']];
  var PIN_NAME = { backleft: 'Back left', backcenter: 'Back center', backright: 'Back right', midleft: 'Middle left', center: 'Center',
    midright: 'Middle right', frontleft: 'Front left', frontcenter: 'Front center', frontright: 'Front right' };
  function normPin(p) { return PIN_NAME[p] ? p : ''; }
  var LOC_LIE = { tee: 'tee', fairway: 'fairway', rough: 'rough', deep: 'deep', bunker: 'sand',
    trees: 'recovery', green: 'green', hazard: 'hazard', holed: 'green', holedx: 'fairway' };
  function blank(v) { return v === '' || v == null || isNaN(parseFloat(v)); }
  function isHoled(r) { return r.loc === 'holed' || r.loc === 'holedx'; }
  function lieOf(rows, k) {
    var r = rows[k];
    if (k === 0) return r.loc === 'holed' ? 'green' : 'tee';
    if (r.loc === 'ob') return lieOf(rows, k - 1);
    if (!r.loc) return null;
    if (r.loc === 'hazard') return r.pen ? 'rough' : 'hazard';
    return LOC_LIE[r.loc];
  }
  function distOf(rows, k) {
    var r = rows[k];
    if (k > 0 && r.loc === 'ob') return distOf(rows, k - 1);
    return blank(r.dist) ? null : parseFloat(r.dist);
  }
  function rowUnit(rows, k) { return lieOf(rows, k) === 'green' ? 'ft' : 'yd'; }
  function isPenalty(r, k) { return k > 0 && !!(r.pen || r.loc === 'ob'); }
  function rowStrokes(rows) {
    return (rows || []).reduce(function (n, r, k) { return n + 1 + (isPenalty(r, k) ? 1 : 0); }, 0);
  }
  /** Returns {shots, bad, problem, complete}. problem: 'dist' | 'loc' | 'after' | 'last' | 'empty' | '' */
  function rowsToShots(rows) {
    var shots = [], bad = null, problem = '', complete = false;
    if (!rows || !rows.length) return { shots: shots, bad: 0, problem: 'empty', complete: false };
    for (var k = 0; k < rows.length; k++) {
      var r = rows[k];
      if (k > 0 && !r.loc) { bad = k; problem = 'loc'; break; }
      var d = distOf(rows, k);
      if (d == null || d <= 0) { bad = k; problem = 'dist'; break; }
      if (isHoled(r) || (k === 0 && r.loc === 'holedx')) {
        shots.push({ lie: 'holed', dist: 0, side: '', dir: '', pen: 'none' });
        if (k < rows.length - 1) { bad = k + 1; problem = 'after'; } else complete = true;
        break;
      }
      var nx = rows[k + 1];
      if (!nx) { problem = 'last'; break; }
      if (!nx.loc) { bad = k + 1; problem = 'loc'; break; }
      var dn = distOf(rows, k + 1);
      if (dn == null || dn <= 0) { bad = k + 1; problem = 'dist'; break; }
      var nd = normDir(nx.dir);
      shots.push({ lie: lieOf(rows, k + 1), dist: dn, side: dirSide(nd),
        dir: nd, pen: isPenalty(nx, k + 1) ? 'drop' : 'none', ob: nx.loc === 'ob', loc: nx.loc });
    }
    return { shots: shots, bad: bad, problem: problem, complete: complete };
  }
  function holeYards(hole) {
    if (hole.rows) return parseFloat(hole.rows[0] && hole.rows[0].dist) || 0;
    return Number(hole.yards) || 0;
  }
  /**
   * v2 saved rows used a distance-less final 'holed' row meaning "the stroke
   * above went in". Scott reads every row as a stroke, so v2 rows are kept
   * 1:1 and the holed row now needs its own distance (hole reopens until it
   * is filled in). Putt vs off-green is guessed from the row above.
   */
  function migrateV2Rows(rows) {
    return rows.map(function (r, k) {
      var o = { dist: r.dist == null ? '' : r.dist, loc: r.loc || '', dir: normDir(r.dir), pen: !!r.pen };
      if (r.loc === 'holed') o.loc = k > 0 && rows[k - 1].loc === 'green' ? 'holed' : 'holedx';
      if (r.loc === 'ob') o.pen = false;
      return o;
    });
  }
  /** v1 {yards, shots} -> v3 rows. In v1 the final shot record meant "the shot above went in". */
  function v1ToRows(hole) {
    var v2 = shotsToRows(hole);
    var n = v2.length;
    if (n >= 2 && v2[n - 1].loc === 'holed') {
      var prev = v2[n - 2];
      if (prev.loc === 'tee') prev.loc = 'holedx';
      else if (prev.loc === 'ob') { /* rare: holed the re-hit; keep OB row and mark next */ v2[n - 1].dist = ''; }
      else { prev.loc = prev.loc === 'green' ? 'holed' : 'holedx'; v2.pop(); }
    }
    return v2.map(function (r) { return { dist: r.dist == null ? '' : r.dist, loc: r.loc, dir: normDir(r.dir), pen: r.loc === 'ob' ? false : !!r.pen }; });
  }

  /** Convert an old-format hole {par, yards, shots} to rows. */
  function shotsToRows(hole) {
    var back = { tee: 'tee', fairway: 'fairway', rough: 'rough', deep: 'deep', sand: 'bunker',
      recovery: 'trees', green: 'green', hazard: 'hazard', holed: 'holed' };
    if (hole.yards == null) return [{ loc: 'tee', dist: '', dir: '', pen: false }];
    var rows = [{ loc: 'tee', dist: hole.yards, dir: '', pen: false }];
    (hole.shots || []).forEach(function (s) {
      if (s.pen === 'ob') rows.push({ loc: 'ob', dist: '', dir: s.side || '', pen: true });
      else if (s.lie === 'holed') rows.push({ loc: 'holed', dist: '', dir: '', pen: false });
      else rows.push({ loc: back[s.lie] || 'fairway', dist: s.dist, dir: s.side || '', pen: s.pen && s.pen !== 'none' });
    });
    return rows;
  }

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
  /**
   * Did this shot reach the green (for GIR, approach misses and the maps)?
   * Yes if the ball finished on the green or in the hole, or the next row is
   * "In the hole" (a putt - so the ball was on the green) or "In the hole
   * (chip/shot)" from 30 yd or closer (Scott's rule: a chip-in from off the green counts
   * as hitting it). A longer hole-out (e.g. a 110-yd wedge for eagle) is itself the shot
   * that reached the green - the shot before it finished out on the course.
   * Strokes gained is not affected (a chip-in is still valued from its real lie).
   */
  function reachedGreen(r) {
    return !r.ob && (r.end.lie === 'green' || r.end.lie === 'holed' || r.loc === 'holed' || (r.loc === 'holedx' && r.end.dist <= 30));
  }
  /**
   * Scott's REGULATION rule (used everywhere: GIR, approach misses, pin map, proximity, stats, CSV).
   * The regulation stroke is stroke number par - 2 (par 3: 1, par 4: 2, par 5: 3), penalty strokes counted.
   *  - GIR: a ball reaches the green (or is holed) with total strokes so far (incl. its own penalty) <= par - 2.
   *  - Otherwise the hole is a MISS and the miss shot is the regulation shot = the last ball actually
   *    struck as stroke number <= par - 2 (if that stroke number was a penalty stroke, the ball struck
   *    before it). A par-4 tee shot or par-5 second shot that is short of the green is never the miss.
   * Exactly one entry per finished hole -> GIR + misses = holes.
   */
  function regulation(out, par) {
    if (!out.length) return null;
    var reg = Number(par) - 2, used = 0, last = 0;
    for (var j = 0; j < out.length; j++) {
      if (used + 1 > reg) break;
      last = j; used += 1 + out[j].penStrokes;
      if (reachedGreen(out[j]) && used <= reg) return { k: j, gir: true };
    }
    return { k: last, gir: false };
  }
  /**
   * The hole's regulation entry for the maps. GIR: position = first-putt distance (ft) + direction,
   * holed (shot went in, or chipped in from <= 30 yd right after) = star. Miss: where the regulation
   * shot finished - lie, direction, distance to the pin.
   * proxFt (Proximity by distance): hit = first-putt ft (holed 0, chip-in = chip yards x 3); miss = yards x 3; OB = null.
   */
  function regApproach(out, par) {
    var R = regulation(out, par); if (!R) return null;
    var r = out[R.k], hit = R.gir, inHole = hit && r.end.lie === 'holed', chipIn = hit && !inHole && r.loc === 'holedx';
    var onG = r.end.lie === 'green', ob = r.ob;
    return { shot: r.n, hit: hit, gir: hit, holed: inHole || chipIn, chipIn: chipIn, dir: (inHole || chipIn) ? '' : r.dir,
      ft: hit ? ((inHole || chipIn) ? 0 : r.end.dist) : 0,
      proxFt: ob ? null : inHole ? 0 : chipIn ? r.end.dist * 3 : hit ? r.end.dist : (onG ? r.end.dist : r.end.dist * 3),
      lie: hit ? 'green' : (ob ? 'ob' : r.loc === 'hazard' ? 'hazard' : r.end.lie === 'holed' ? 'green' : r.end.lie), dist: hit ? 0 : r.end.dist,
      yd: hit || ob ? null : (onG ? r.end.dist / 3 : r.end.dist), unit: !hit && onG ? 'ft' : 'yd',
      from: r.start.dist, fromLie: r.start.lie, fromGroup: lieGroup(r.start.lie), fromDir: R.k > 0 ? out[R.k - 1].dir : '', pen: r.penStrokes > 0, ob: ob };
  }
  function analyzeHole(hole, baseline) {
    var bad = null, problem = '', complete = null, finished = true, rowsFmt = !!hole.rows, nRows = 0, liveStrokes = 0;
    if (rowsFmt) {
      var conv = rowsToShots(hole.rows); bad = conv.bad; problem = conv.problem; complete = conv.complete;
      finished = !!hole.finished; nRows = hole.rows.length; liveStrokes = rowStrokes(hole.rows);
      hole = { pin: hole.pin, par: hole.par, yards: holeYards(hole), shots: conv.shots };
    }
    var out = [];
    var start = { lie: 'tee', dist: Number(hole.yards) || 0 };
    var shots = hole.shots || [];
    for (var i = 0; i < shots.length; i++) {
      var s = shots[i];
      var pen = s.pen || 'none';
      var end = pen === 'ob' ? { lie: start.lie, dist: start.dist }
        : { lie: s.lie, dist: s.lie === 'holed' ? 0 : Number(s.dist) || 0 };
      var penStrokes = PENALTY_STROKES[pen] || 0;
      var eStart = expected(start.lie, start.dist, baseline);
      var eEnd = expected(end.lie, end.dist, baseline);
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
        side: s.side || dirSide(normDir(s.dir)), dir: normDir(s.dir || s.side), ob: !!s.ob, loc: s.loc || (pen === 'ob' ? 'ob' : s.lie), eStart: eStart, eEnd: eEnd, sg: sg,
        cat: cat, bucket: bucket, hit: hit
      });
      start = end;
    }
    var penalties = out.reduce(function (a, r) { return a + r.penStrokes; }, 0);
    var holedOut = shots.length > 0 && shots[shots.length - 1].lie === 'holed' && shots[shots.length - 1].pen !== 'ob';
    if (complete === null) complete = holedOut;
    var done = complete && finished;
    // Green in regulation / regulation miss (see regulation()).
    var reg = regulation(out, hole.par), gir = !!(reg && reg.gir), girShot = gir ? reg.k : null, regShot = reg ? reg.k : null;
    var appr = regApproach(out, hole.par), prox = null;
    if (appr) { prox = {}; for (var pk0 in appr) prox[pk0] = appr[pk0]; prox.ft = appr.proxFt; }
    var fairway = null;
    if (hole.par >= 4 && out.length) {
      var t = out[0];
      fairway = t.pen === 'none' && (t.end.lie === 'fairway' || t.end.lie === 'green' || t.end.lie === 'holed');
    }
    return {
      shots: out, bad: bad, problem: problem, complete: complete, finished: finished,
      rows: nRows, liveStrokes: rowsFmt ? liveStrokes : shots.length + penalties,
      strokes: shots.length + penalties, penalties: penalties,
      putts: out.filter(function (r) { return r.cat === 'putting'; }).length,
      done: done, gir: gir, girShot: girShot, regShot: regShot, fairway: fairway, pin: normPin(hole.pin), appr: appr, prox: prox,
      sg: out.reduce(function (a, r) { return a + r.sg; }, 0)
    };
  }

  // Where a missed tee shot ended (row loc -> map category)
  var TEE_END = { rough: 'rough', deep: 'rough', bunker: 'bunker', hazard: 'hazard', trees: 'trees', ob: 'ob', sand: 'bunker', recovery: 'trees' };
  // Proximity yardages: the regulation shot's starting distance rounded to the nearest 10 yd,
  // halves round UP (144 -> 140, 145 -> 150, 194.9 -> 190, 195 -> 200). Targets 40, 50 ... 200 (17);
  // shots that round outside 40-200 are left out (counted as "outside" in the view).
  function roundYd(yd) { return Math.floor(Number(yd) / 10 + 0.5) * 10; }
  var PROX_BUCKETS = [{ id: 'all', yd: null, name: 'All 40–200 yd' }];
  for (var pb = 40; pb <= 200; pb += 10) PROX_BUCKETS.push({ id: String(pb), yd: pb, name: pb + ' yd (' + (pb - 5) + '–' + (pb + 4) + ')' });
  function inBucket(id, yd) {
    if (yd == null || yd === '' || isNaN(Number(yd))) return false;
    var r = roundYd(yd);
    if (id === 'all' || id == null) return r >= 40 && r <= 200;
    return r === Number(id);
  }
  // Starting-lie groups for the proximity map / "By lie" table
  var PROX_LIES = [{ id: 'fairway', name: 'Fairway' }, { id: 'rough', name: 'Rough' }, { id: 'sand', name: 'Bunker' }, { id: 'tee', name: 'Tee' }, { id: 'other', name: 'Other' }];
  function lieGroup(lie) { return lie === 'fairway' || lie === 'tee' || lie === 'sand' ? lie : (lie === 'rough' || lie === 'deep') ? 'rough' : 'other'; }
  function proxByLie(list) {
    return PROX_LIES.map(function (L) { var P = proxStats(list.filter(function (m) { return m.fromGroup === L.id; })); P.id = L.id; P.name = L.name; return P; });
  }
  /**
   * Practice warning: a lie with >= 3 shots whose greens-hit % is 0, or at least 30 points below
   * the fairway's (fairway needs >= 2 shots to compare). Returns [{id, name, text}] worst first.
   */
  function proxWarnings(rows) {
    var fw = rows.filter(function (r) { return r.id === 'fairway'; })[0], out = [];
    rows.forEach(function (r) {
      if (r.id === 'fairway' || r.n < 3) return;
      var low = r.hits === 0 || (fw && fw.n >= 2 && fw.hitPct - r.hitPct >= 30);
      if (!low) return;
      var where = r.id === 'tee' ? 'From the tee (par 3s)' : r.id === 'other' ? 'From trees / other lies' : 'From the ' + r.name.toLowerCase();
      var text = r.hits === 0 ? where + ' you\'ve missed ' + r.misses + ' of ' + r.n + ' greens — worth some practice.'
        : where + ' you\'ve hit ' + r.hits + ' of ' + r.n + ' greens (' + Math.round(r.hitPct) + '%) vs ' + Math.round(fw.hitPct) + '% from the fairway — worth some practice.';
      out.push({ id: r.id, name: r.name, pct: r.hitPct, text: text });
    });
    return out.sort(function (a, b) { return a.pct - b.pct; });
  }
  function proxStats(list) {
    var hits = list.filter(function (m) { return m.hit; }), withFt = list.filter(function (m) { return m.ft != null; });
    var avg = function (a) { return a.length ? a.reduce(function (t, m) { return t + m.ft; }, 0) / a.length : null; };
    return { n: list.length, hits: hits.length, misses: list.length - hits.length, hitPct: list.length ? 100 * hits.length / list.length : null,
      avgHitFt: avg(hits.filter(function (m) { return m.ft != null; })), avgAllFt: avg(withFt), noProx: list.length - withFt.length };
  }
  function summarize(round, baseline) {
    baseline = baseline || round.baseline || 'pga';
    var S = {
      strokes: 0, par: 0, holesDone: 0, holesStarted: 0, penalties: 0, putts: 0,
      fwHit: 0, fwTotal: 0, gir: 0, girHoles: 0,
      teeLeft: 0, teeRight: 0, apprLeft: 0, apprRight: 0, apprShort: 0, apprOver: 0, allLeft: 0, allRight: 0,
      apprMiss: [], girMap: [], teeMap: [], pinHoles: [], noPin: 0, proxList: [], puttList: [],
      sgTotal: 0,
      cats: { tee: { sg: 0, n: 0 }, approach: { sg: 0, n: 0 }, short: { sg: 0, n: 0 }, putting: { sg: 0, n: 0 } },
      buckets: {}, holes: []
    };
    var order = ['Tee shots', '30-100 yd', '100-150 yd', '150-200 yd', '200+ yd', '0-30 yd',
      '0-5 ft', '5-15 ft', '15-30 ft', '30+ ft'];
    order.forEach(function (b) { S.buckets[b] = { sg: 0, n: 0 }; });
    (round.holes || []).forEach(function (h, hi) {
      var a = analyzeHole(h, baseline);
      S.holes.push(a);
      if (!a.shots.length) return;
      S.holesStarted++;
      if (!a.done) return; // only finished holes count toward totals and stats
      if (a.prox) { var px = { hole: hi + 1, par: Number(h.par), gir: a.gir }; for (var pk in a.prox) px[pk] = a.prox[pk]; S.proxList.push(px); }
      if (normPin(h.pin)) S.pinHoles.push({ hole: hi + 1, pin: normPin(h.pin), gir: a.gir, par: Number(h.par), appr: a.appr }); else S.noPin++;
      S.penalties += a.penalties;
      S.putts += a.putts;
      // every putt (stroke starting on the green): its number on the hole, start ft, made?, direction of the
      // ball vs the hole before the putt (the Dir on that row = where the previous stroke finished)
      var pn = 0;
      a.shots.forEach(function (r, k) {
        if (r.start.lie !== 'green') return; pn++;
        S.puttList.push({ hole: hi + 1, n: pn, ft: r.start.dist, made: r.end.lie === 'holed', dir: k > 0 ? a.shots[k - 1].dir : '' });
      });
      S.holesDone++; S.strokes += a.strokes; S.par += Number(h.par);
      S.girHoles++; if (a.gir) S.gir++;
      if (a.fairway !== null) { S.fwTotal++; if (a.fairway) S.fwHit++; }
      a.shots.forEach(function (r) {
        S.sgTotal += r.sg;
        S.cats[r.cat].sg += r.sg; S.cats[r.cat].n++;
        S.buckets[r.bucket].sg += r.sg; S.buckets[r.bucket].n++;
        if (r.side === 'L') S.allLeft++;
        if (r.side === 'R') S.allRight++;
        if (r.cat === 'tee') { if (r.side === 'L') S.teeLeft++; if (r.side === 'R') S.teeRight++; }
      });
      // ONE regulation entry per finished hole: a GIR or a miss (GIR + misses = holes)
      var ap = a.appr;
      if (ap && !ap.gir) {
        S.apprMiss.push({ hole: hi + 1, pin: normPin(h.pin), par: Number(h.par), shot: ap.shot, dir: ap.dir, from: ap.from, fromLie: ap.fromLie,
          lie: ap.lie, dist: ap.dist, unit: ap.unit, pen: ap.pen });
        if (dirSide(ap.dir) === 'L') S.apprLeft++; if (dirSide(ap.dir) === 'R') S.apprRight++;
        if (dirDepth(ap.dir) === 'S') S.apprShort++; if (dirDepth(ap.dir) === 'O') S.apprOver++;
      }
      if (a.fairway !== null) {
        var t = a.shots[0], kind = a.fairway ? 'fairway' : t.ob ? 'ob' : TEE_END[t.loc] || 'rough';
        S.teeMap.push({ hole: hi + 1, par: Number(h.par), hit: t.ob ? null : t.hit, fairway: a.fairway, kind: kind, side: t.side, dir: t.dir,
          yards: holeYards(h), pen: t.penStrokes > 0 });
      }
      if (ap && ap.gir) {
        S.girMap.push({ hole: hi + 1, pin: normPin(h.pin), shot: ap.shot, par: Number(h.par), dir: ap.dir,
          ft: ap.ft, holed: ap.holed, from: ap.from, fromLie: ap.fromLie });
      }
    });
    S.toPar = S.strokes - S.par;
    S.baseline = baseline;
    return S;
  }


  /* ===================== BASELINES =====================
   * Only the PGA Tour table is published (see header). For the other groups no
   * public expected-strokes table exists (searched: Broadie papers/book, LPGA/KPMG,
   * Clippd/Scoreboard, Lou Stagner/DECADE, Arccos, Shot Scope - Oct 2026), so they
   * are ESTIMATED from sourced per-round gaps to the PGA Tour average:
   *
   *  Scratch men: 5.5 strokes/round behind the PGA Tour average, split
   *    driving 2.5, approach 1.5, short game 0.5, putting 1.0.
   *    Source: P. Sanders (ShotByShot/SwingU), "The Statistical Differences Between
   *    A Scratch Golfer And PGA Tour Player" (8,360 scratch rounds vs 14,557 2015
   *    ShotLink rounds) https://clubhouse.swingu.com/statistics/the-statistical-differences-between-a-scratch-golfer-and-pga-tour-player/
   *    Consistent with L. Stagner: avg Tour pro = +5.4 index https://golf.com/instruction/pro-golfer-handicap-index-score/
   *  Other groups: Clippd "Player Quality" ladder, one scale with 100 = male tour avg:
   *    Male D1 College 95, LPGA Tour Avg 89, Female D1 College 87, Male Scratch 87,
   *    Female Scratch 84. https://www.clippd.com/insights/post/shot-quality-and-player-quality-clippds-new-performance-metrics
   *    We assume the scale is linear in strokes and anchor it with the scratch-men
   *    gap: 13 points = 5.5 strokes -> 0.423 strokes/point. Gaps: D1 men 2.1,
   *    LPGA 4.7, D1 women 5.5, scratch women 6.8 strokes/round. The scratch-men
   *    category split (45/27/9/18 %) is applied to every group (assumption).
   *
   * Turning a per-round gap into a table: expected strokes for a group =
   * PGA value + extra(lie, dist), where
   *   on the green:  extra = cP * (E_pga - 1)
   *   off the green: extra = 0.61*cP + k(d)*(E_pga - 2)   [k = b inside 20 yd, a beyond 40 yd, blended]
   *   from the tee:  same + t (for holes of 280+ yd, blended from 230 yd) = par-4/5 driving
   * (0.61 = average first-putt value above 1 on Tour: ~29 putts/18 holes.)
   * cP, a, b, t are solved so that a typical 18-hole round (synthetic, below)
   * loses exactly the sourced gap in each category. Because strokes gained
   * telescopes, every hole's total difference is extra(tee).
   */
  var BASELINES = [
    { id: 'pga', name: 'PGA Tour', status: 'sourced', gap: 0 },
    { id: 'lpga', name: 'LPGA Tour', status: 'estimated', pq: 89 },
    { id: 'd1m', name: 'D1 college men', status: 'estimated', pq: 95 },
    { id: 'd1w', name: 'D1 college women', status: 'estimated', pq: 87 },
    { id: 'scm', name: 'Scratch men', status: 'estimated', gap: 5.5 },
    { id: 'scw', name: 'Scratch women', status: 'estimated', pq: 84 }
  ];
  var SCRATCH_SPLIT = { tee: 2.5 / 5.5, approach: 1.5 / 5.5, short: 0.5 / 5.5, putting: 1.0 / 5.5 };
  var STROKES_PER_PQ = 5.5 / (100 - 87);
  var BL = {};
  BASELINES.forEach(function (b) {
    if (b.gap == null) b.gap = Math.round((100 - b.pq) * STROKES_PER_PQ * 10) / 10;
    b.targets = { tee: b.gap * SCRATCH_SPLIT.tee, approach: b.gap * SCRATCH_SPLIT.approach,
      short: b.gap * SCRATCH_SPLIT.short, putting: b.gap * SCRATCH_SPLIT.putting };
    BL[b.id] = b;
  });

  function extraFor(p, lie, dist, ePGA) {
    if (lie === 'holed') return 0;
    if (lie === 'green') return p.cP * (ePGA - 1);
    var d = Number(dist) || 0;
    var k = d <= 20 ? p.b : d >= 40 ? p.a : p.b + (p.a - p.b) * (d - 20) / 20;
    var x = 0.61 * p.cP + k * Math.max(0, ePGA - 2);
    if (lie === 'tee') x += p.t * (d >= 280 ? 1 : d <= 230 ? 0 : (d - 230) / 50);
    return x;
  }
  function expected(lie, dist, baseline) {
    var e = expectedPGA(lie, dist);
    var b = BL[baseline || 'pga'];
    if (!b || !b.params) return e;
    return e + extraFor(b.params, lie, dist, e);
  }

  // Synthetic "typical" round used for calibration (old {par, yards, shots} format).
  // 18 holes, 7 short-game shots, ~29-31 putts, a mix of fairways/rough.
  function H(par, yards, n, shots) { var o = []; for (var i = 0; i < n; i++) o.push({ par: par, yards: yards, shots: shots.map(function (x) { return { lie: x[0], dist: x[1] || 0, pen: 'none' }; }) }); return o; }
  var CALIB_ROUND = { holes: [].concat(
    H(3, 190, 2, [['green', 30], ['green', 2], ['holed']]),
    H(3, 190, 2, [['rough', 15], ['green', 6], ['holed']]),
    H(4, 430, 6, [['fairway', 150], ['green', 25], ['green', 2], ['holed']]),
    H(4, 430, 4, [['rough', 160], ['rough', 20], ['green', 7], ['holed']]),
    H(5, 560, 3, [['fairway', 270], ['fairway', 50], ['green', 12], ['green', 1], ['holed']]),
    H(5, 560, 1, [['fairway', 280], ['sand', 20], ['green', 8], ['holed']])) };
  function catLoss(round, id) {
    // strokes per round the baseline group loses to the PGA Tour, by category
    var a = summarizeAll(round, 'pga'), b = summarizeAll(round, id), out = {};
    ['tee', 'approach', 'short', 'putting'].forEach(function (c) { out[c] = b.cats[c].sg - a.cats[c].sg; });
    return out;
  }
  function summarizeAll(round, baseline) {
    var cats = { tee: { sg: 0 }, approach: { sg: 0 }, short: { sg: 0 }, putting: { sg: 0 } };
    round.holes.forEach(function (h) { analyzeHole(h, baseline).shots.forEach(function (r) { cats[r.cat].sg += r.sg; }); });
    return { cats: cats };
  }
  function solve(M, y) {
    var n = y.length, A = M.map(function (r, i) { return r.concat([y[i]]); });
    for (var c = 0; c < n; c++) {
      var piv = c; for (var r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
      var tmp = A[c]; A[c] = A[piv]; A[piv] = tmp;
      for (var r2 = 0; r2 < n; r2++) if (r2 !== c) {
        var f = A[r2][c] / A[c][c]; for (var k = c; k <= n; k++) A[r2][k] -= f * A[c][k];
      }
    }
    return A.map(function (r, i) { return r[n] / r[i]; });
  }
  function calibrate() {
    var names = ['cP', 'a', 'b', 't'], cats = ['tee', 'approach', 'short', 'putting'];
    var probe = { id: '__probe' }; BL.__probe = probe;
    var cols = names.map(function (nm) {
      probe.params = { cP: 0, a: 0, b: 0, t: 0 }; probe.params[nm] = 1;
      var l = catLoss(CALIB_ROUND, '__probe');
      return cats.map(function (c) { return l[c]; });
    });
    delete BL.__probe;
    var M = cats.map(function (c, i) { return names.map(function (nm, j) { return cols[j][i]; }); });
    BASELINES.forEach(function (b) {
      if (b.id === 'pga') return;
      var y = cats.map(function (c) { return b.targets[c]; }); // the same shots gain this much MORE vs the weaker group
      var p = solve(M, y), o = {};
      names.forEach(function (nm, i) { o[nm] = p[i]; });
      b.params = o;
    });
  }

  calibrate();
  // Putting: bands are lower-inclusive: 0-3 = under 3 ft, 3-6, 6-10, 10-20, 20+
  var PUTT_BANDS = [{ id: '0-3', lo: 0, hi: 3 }, { id: '3-6', lo: 3, hi: 6 }, { id: '6-10', lo: 6, hi: 10 }, { id: '10-20', lo: 10, hi: 20 }, { id: '20+', lo: 20, hi: Infinity }];
  // Putting-green scale. 1st putts: 'wide' (rings 1-10 ft then every 5 ft to maxFt, inner 10 ft = 60% of R).
  // 2nd / 3rd+ putts: 'close' – a linear 10 ft green with 1 ft rings; longer putts sit on the edge.
  function puttScale(group, list) {
    if (group !== '1') return { mode: 'close', maxFt: 10, rings: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], labels: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] };
    var mx = (list || []).reduce(function (m, p) { return Math.max(m, p.ft); }, 0), maxFt = Math.min(60, Math.max(20, Math.ceil(mx / 5) * 5)), rings = [], f;
    for (f = 1; f <= 10; f++) rings.push(f); for (f = 15; f <= maxFt; f += 5) rings.push(f);
    return { mode: 'wide', maxFt: maxFt, rings: rings };
  }
  function puttRadius(ft, sc, R) {
    ft = Math.max(0, Math.min(ft, sc.maxFt));
    if (sc.mode === 'close') return R * ft / 10;
    var R10 = R * 0.6; return ft <= 10 ? R10 * ft / 10 : R10 + (R - R10) * (ft - 10) / (sc.maxFt - 10);
  }
  // Place putts: angle from Dir (no Dir = spread evenly), radius from distance; then nudge sideways
  // (alternating ±angle, then slightly outward) until no two dots are closer than minD px.
  function puttPlace(list, sc, cx, cy, R, minD) {
    minD = minD || 15; var nd = list.filter(function (p) { return !p.dir; }).length, ndi = 0, out = [];
    list.forEach(function (p) {
      var r0 = puttRadius(p.ft, sc, R), a0 = p.dir ? DIR_ANGLE[p.dir] : 110 + 360 * (ndi++) / Math.max(1, nd), best = null;
      for (var k = 0; k < 240 && !best; k++) {
        var step = Math.ceil(k / 2) * (k % 2 ? 1 : -1), r = Math.max(4, r0 + Math.floor(k / 12) * 3), a = a0 + step * Math.max(6, (minD / Math.max(r, 8)) * 57.3),
          t = a * Math.PI / 180, x = cx + r * Math.cos(t), y = cy - r * Math.sin(t);
        if (!out.some(function (q) { return Math.hypot(q.x - x, q.y - y) < minD; })) best = { x: x, y: y };
      }
      if (!best) { var t2 = a0 * Math.PI / 180; best = { x: cx + r0 * Math.cos(t2), y: cy - r0 * Math.sin(t2) }; }
      out.push({ p: p, x: best.x, y: best.y, beyond: p.ft > sc.maxFt, nodir: !p.dir });
    });
    return out;
  }
  function puttGroup(n) { return n >= 3 ? '3' : String(n); } // 3 = "3rd+" (3rd, 4th, ...)
  function puttStats(list) {
    var made = list.filter(function (p) { return p.made; }).length;
    return { n: list.length, made: made, pct: list.length ? 100 * made / list.length : null,
      avgFt: list.length ? list.reduce(function (t, p) { return t + p.ft; }, 0) / list.length : null,
      bands: PUTT_BANDS.map(function (b) { var L = list.filter(function (p) { return p.ft >= b.lo && p.ft < b.hi; }), m = L.filter(function (p) { return p.made; }).length;
        return { id: b.id, n: L.length, made: m, pct: L.length ? 100 * m / L.length : null }; }) };
  }

  /* ===================== BACKUP / RESTORE ===================== */
  // Backup file: { app: 'golf-shot-tracker', kind: 'rounds-backup', version: 1, exported: ISO, rounds: [...] }
  function makeBackup(rounds, now) {
    return { app: 'golf-shot-tracker', kind: 'rounds-backup', version: 1, exported: (now || new Date()).toISOString(), count: rounds.length, rounds: rounds };
  }
  // Accepts a backup object (or a bare array of rounds). Returns {rounds} or {error}.
  function parseBackup(data) {
    if (typeof data === 'string') { try { data = JSON.parse(data); } catch (e) { return { error: 'That file is not a golf backup (could not read it as JSON).' }; } }
    var list = Array.isArray(data) ? data : data && Array.isArray(data.rounds) ? data.rounds : null;
    if (!list) return { error: 'That file is not a golf backup (no rounds in it).' };
    var ok = list.filter(function (r) { return r && typeof r.id === 'string' && r.id && Array.isArray(r.holes); });
    if (list.length && !ok.length) return { error: 'That file is not a golf backup (the rounds in it are not readable).' };
    return { rounds: ok, skipped: list.length - ok.length };
  }
  /**
   * Merge backup rounds into the phone's rounds by id. New ids are added, identical rounds are left
   * alone, and rounds whose id exists with different content are conflicts: replaced only when
   * replaceConflicts is true. Never creates duplicates. New rounds are appended (History sorts by date).
   */
  function mergeRounds(existing, incoming, replaceConflicts) {
    var byId = {}, out = existing.slice(), res = { added: 0, replaced: 0, same: 0, kept: 0, conflicts: [] };
    out.forEach(function (r, i) { byId[r.id] = i; });
    var seen = {};
    incoming.forEach(function (r) {
      if (seen[r.id]) return; seen[r.id] = 1;
      if (byId[r.id] == null) { byId[r.id] = out.length; out.push(r); res.added++; return; }
      var cur = out[byId[r.id]];
      if (JSON.stringify(cur) === JSON.stringify(r)) { res.same++; return; }
      res.conflicts.push(r.id);
      if (replaceConflicts) { out[byId[r.id]] = r; res.replaced++; } else res.kept++;
    });
    res.rounds = out;
    return res;
  }
  function conflictsOf(existing, incoming) {
    var byId = {}; existing.forEach(function (r) { byId[r.id] = r; });
    return incoming.filter(function (r) { return byId[r.id] && JSON.stringify(byId[r.id]) !== JSON.stringify(r); });
  }

  var api = { puttScale: puttScale, puttRadius: puttRadius, puttPlace: puttPlace, PUTT_BANDS: PUTT_BANDS, puttGroup: puttGroup, puttStats: puttStats, makeBackup: makeBackup, parseBackup: parseBackup, mergeRounds: mergeRounds, conflictsOf: conflictsOf, PROX_LIES: PROX_LIES, lieGroup: lieGroup, proxByLie: proxByLie, proxWarnings: proxWarnings, PROX_BUCKETS: PROX_BUCKETS, inBucket: inBucket, roundYd: roundYd, proxStats: proxStats, reachedGreen: reachedGreen, PIN_GRID: PIN_GRID, PIN_NAME: PIN_NAME, normPin: normPin, DIR8: DIR8, DIR_NAME: DIR_NAME, DIR_ANGLE: DIR_ANGLE, normDir: normDir, expected: expected, expectedPGA: expectedPGA, BASELINES: BASELINES, baseline: function (id) { return BL[id] || BL.pga; },
    CALIB_ROUND: CALIB_ROUND, catLoss: catLoss, analyzeHole: analyzeHole, summarize: summarize,
    rowsToShots: rowsToShots, shotsToRows: shotsToRows, migrateV2Rows: migrateV2Rows, v1ToRows: v1ToRows, holeYards: holeYards,
    rowUnit: rowUnit, lieOf: lieOf, distOf: distOf, rowStrokes: rowStrokes, isPenalty: isPenalty,
    YARDS: YARDS, OFF_GREEN: OFF_GREEN, FEET: FEET, PUTTS: PUTTS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SG = api;
})(this);
