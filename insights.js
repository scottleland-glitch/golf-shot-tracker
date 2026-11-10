// v140 Round takeaway. Reads one finished round (SG.summarize) and the golfer's other rounds and says, in plain words,
// where the strokes went and the one thing to work on next. Fixed rules, no AI: every claim comes from real shots.
//  - "Good vs bad" = strokes gained. Each area (off the tee, approach, around the green, putting) is compared with the
//    golfer's OWN normal once that area has enough shots in their other rounds (the 4 progress bars), otherwise with
//    the round's baseline (PGA Tour, scratch, ...).
//  - Inside the worst area, simple checks find the cause (putt speed, putt line, chip distance, wedge distance,
//    approach misses, driver misses). A check only counts with enough shots and a clear lean, so luck is not a pattern.
// build() is pure (tested in node: tests/insights.test.js); app.js draws it on Round stats.
(function (root) {
  'use strict';
  // Shots an area needs in the golfer's other rounds before it is "known" (roughly 4-6 rounds each). Last 20 rounds.
  var AREAS = [
    { k: 'tee', short: 'TEE', name: 'Off the tee', word: 'driving', in: 'off the tee', need: 50, unit: 'drives' },
    { k: 'approach', short: 'APP', name: 'Approach', word: 'approach play', in: 'on approach shots', need: 60, unit: 'shots' },
    { k: 'short', short: 'ARG', name: 'Around the green', word: 'the short game', in: 'around the green', need: 40, unit: 'chips' },
    { k: 'bunker', short: 'BNK', name: 'Bunker', word: 'bunker play', in: 'from greenside bunkers', need: 15, unit: 'bunker shots' }, // v157
    { k: 'putting', short: 'PUTT', name: 'Putting', word: 'putting', in: 'on the greens', need: 100, unit: 'putts' }
  ];
  var BY = {}; AREAS.forEach(function (a) { BY[a.k] = a; });
  var NORM_ROUNDS = 20, MIN_HOLES = 6, BIG = 1.0, LEAN = 0.7;

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function r1(v) { return (Math.round(Math.abs(v) * 10) / 10).toFixed(1); }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }
  function sum(list, f) { return list.reduce(function (t, x) { return t + f(x); }, 0); }
  function lost(list) { return -sum(list, function (s) { return Math.min(0, s.sg); }); } // strokes lost by these shots (>= 0)
  function depth(d) { return /^short/.test(d || '') ? 'short' : /^long/.test(d || '') ? 'long' : ''; }
  function side(d) { return /left$/.test(d || '') ? 'left' : /right$/.test(d || '') ? 'right' : ''; }
  // Every scored shot of the finished holes, with its hole.
  function shotsOf(S) {
    var out = [];
    S.holes.forEach(function (h, i) { if (!h.done) return; h.shots.forEach(function (s) { if (!s.layup) out.push(Object.assign({ hole: i + 1 }, s)); }); });
    return out;
  }
  // How far from the hole a shot finished, in feet (null for a penalty / OB).
  // v161 (Scott): the benchmark bar is labelled with the benchmark, not "Avg" (it read as the golfer's own average)
  var BL_SHORT = { pga: 'PGA', lpga: 'LPGA', d1m: 'D1', d1w: 'D1', scm: 'Scratch', scw: 'Scratch' };
  function leaveFt(s) {
    if (s.ob || s.penStrokes > 0) return null;
    if (s.end.lie === 'holed') return 0;
    return s.end.lie === 'green' ? Number(s.end.dist) || 0 : (Number(s.end.dist) || 0) * 3;
  }
  // The putt length a benchmark player would leave from this chip: where the putt's expected strokes = chip's - 1.
  function parLeaveFt(SG, s, bl) {
    var target = s.eStart - 1;
    if (!(target > SG.expected('green', 1, bl))) return 1;
    var lo = 1, hi = 90;
    if (SG.expected('green', hi, bl) <= target) return hi;
    for (var i = 0; i < 30; i++) { var mid = (lo + hi) / 2; if (SG.expected('green', mid, bl) < target) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
  }
  // A clear lean: the bigger of two counts is at least LEAN of the tagged total, with at least `min` tagged.
  function lean(a, b, min) {
    var n = a + b; if (n < min) return null;
    return a / n >= LEAN ? { which: 0, n: a, of: n } : b / n >= LEAN ? { which: 1, n: b, of: n } : null;
  }

  // ---------- the golfer's baseline: how well each area is known, and their normal per hole ----------
  function progress(history, SG, bl) {
    var list = history.slice(0, NORM_ROUNDS), out = {};
    var sums = list.map(function (r) { return SG.summarize(r, bl); }).filter(function (S) { return S.holesDone > 0; });
    var holes = sum(sums, function (S) { return S.holesDone; });
    AREAS.forEach(function (a) {
      var n = sum(sums, function (S) { return S.cats[a.k].n; }), sg = sum(sums, function (S) { return S.cats[a.k].sg; });
      out[a.k] = { k: a.k, short: a.short, name: a.name, n: n, need: a.need, frac: Math.min(1, n / a.need), ready: n >= a.need,
        perHole: holes ? sg / holes : 0, unit: a.unit,
        roundsLeft: n >= a.need ? 0 : (sums.length ? Math.max(1, Math.ceil((a.need - n) / Math.max(1, n / sums.length))) : null) };
    });
    out.rounds = sums.length; out.readyCount = AREAS.filter(function (a) { return out[a.k].ready; }).length;
    return out;
  }

  // ---------- the checks: each finds one cause inside an area ----------
  function checks(S, SG, bl, blName) {
    var all = shotsOf(S), F = [];
    var putts = all.filter(function (s) { return s.cat === 'putting'; });
    // Putting speed: putts from 15 ft and over that missed, finishing short vs long (needs the miss direction tagged).
    var longMiss = putts.filter(function (s) { return s.start.dist >= 15 && s.end.lie === 'green'; });
    var sp = lean(longMiss.filter(function (s) { return depth(s.dir) === 'short'; }).length, longMiss.filter(function (s) { return depth(s.dir) === 'long'; }).length, 4);
    var p15 = putts.filter(function (s) { return s.start.dist >= 15; });
    if (sp) F.push({ area: 'putting', id: 'puttspeed', title: 'Putting speed', lost: lost(p15),
      text: sp.n + ' of ' + sp.of + ' missed putts from 15 ft and over finished ' + (sp.which ? 'long' : 'short') + '.',
      drill: sp.which ? 'From 20–40 ft, putt to stop on the fringe edge, not past it. Then die putts at the hole.' : 'From 20–40 ft, put a tee 18 in past the hole. Every putt should finish between the hole and the tee.' });
    // Lag putting (works without directions): first putts from 25 ft and over that missed, how far they finished.
    var lags = putts.filter(function (s) { return s.start.dist >= 25 && s.end.lie === 'green'; });
    var lagAvg = lags.length ? sum(lags, function (s) { return s.end.dist; }) / lags.length : 0;
    var three = 0; S.holes.forEach(function (h) { if (h.done && h.putts >= 3) three++; });
    if (lags.length >= 3 && (lagAvg > 4.5 || three >= 2)) F.push({ area: 'putting', id: 'lag', title: 'Lag putting', lost: lost(putts.filter(function (s) { return s.start.dist >= 25; })) + (three >= 2 ? 0.01 : 0),
      text: 'Your ' + lags.length + ' long putts left ' + r1(lagAvg) + ' ft on average' + (three ? ', with ' + plural(three, 'three-putt') : '') + '.',
      drill: 'Putt to a 3-foot circle from 25, 35 and 45 ft. Aim to get 8 of 10 inside it.' });
    // Short putt line: misses from 4 to 15 ft, left vs right.
    var shortMiss = putts.filter(function (s) { return s.start.dist >= 4 && s.start.dist < 15 && s.end.lie === 'green'; });
    var ln = lean(shortMiss.filter(function (s) { return side(s.dir) === 'left'; }).length, shortMiss.filter(function (s) { return side(s.dir) === 'right'; }).length, 4);
    if (ln) F.push({ area: 'putting', id: 'puttline', title: 'Short putt start line', lost: lost(putts.filter(function (s) { return s.start.dist >= 4 && s.start.dist < 15; })),
      text: ln.n + ' of ' + ln.of + ' misses from 4–15 ft went ' + (ln.which ? 'right' : 'left') + '.',
      drill: 'Gate drill: two tees just wider than the ball, 2 ft in front of it. Roll 20 putts from 6 ft through the gate.' });
    // v157 Greenside bunkers: stuck in the sand, or how far the ones that got out finished vs the benchmark's leave.
    var bsh = all.filter(function (s) { return s.cat === 'bunker'; });
    if (bsh.length >= 2) {
      var stuck = bsh.filter(function (s) { return s.end.lie === 'sand'; }).length, out = bsh.filter(function (s) { return s.end.lie !== 'sand' && leaveFt(s) != null; });
      var bAvg = out.length ? sum(out, leaveFt) / out.length : null, bPar = out.length ? sum(out, function (s) { return parLeaveFt(SG, s, bl); }) / out.length : null;
      var stuckBad = stuck >= 1 && stuck / bsh.length >= 0.25;
      F.push({ area: 'bunker', id: 'bunker', title: stuckBad ? 'Getting out of greenside bunkers' : 'Greenside bunker distance', lost: lost(bsh),
        qualifies: stuckBad || (out.length >= 2 && bAvg > bPar + 3), yours: bAvg, par: bPar, n: bsh.length, stuck: stuck,
        text: (stuckBad ? plural(stuck, 'bunker shot') + ' of ' + bsh.length + ' stayed in the sand. ' : '') +
          (out.length ? 'Shots that got out finished ' + Math.round(bAvg) + ' ft from the hole on average (' + blName + ': about ' + Math.round(bPar) + ' ft).' : ''),
        drill: stuckBad ? 'Draw a line in the sand 2 in behind the ball. Hit 10 shots that enter at the line and splash the sand onto the green, before aiming at anything.'
          : 'From one bunker, hit 5 balls each to a near, middle and back pin. Count how many stop inside 6 ft.' });
    }
    // Around the green: how far chips finished, vs the benchmark's leave from the same spots.
    var chips = all.filter(function (s) { return s.cat === 'short' && leaveFt(s) != null; });
    if (chips.length >= 3) {
      var avg = sum(chips, leaveFt) / chips.length, par = sum(chips, function (s) { return parLeaveFt(SG, s, bl); }) / chips.length;
      var sand = chips.filter(function (s) { return s.start.lie === 'sand'; }).length >= chips.length / 2;
      F.push({ area: 'short', id: 'chips', title: sand ? 'Greenside bunker play' : 'Chip distance control', lost: lost(all.filter(function (s) { return s.cat === 'short'; })),
        qualifies: avg > par + 3, yours: avg, par: par, n: chips.length,
        text: 'Your ' + plural(chips.length, sand ? 'shot' : 'chip') + ' left the ball ' + Math.round(avg) + ' ft from the hole on average. ' + blName + ' average: about ' + Math.round(par) + ' ft.',
        drill: sand ? 'Draw a line in the sand 2 in behind the ball. Hit 10 shots that enter at the line, then aim for a 6-foot circle.' : 'From the fringe, chip 3 balls each to 10, 20 and 30 ft. Move on only when all three stop inside 3 ft.' });
    }
    // Wedges 40-110 yd: short vs long, and how close.
    var wedges = all.filter(function (s) { return s.cat === 'approach' && s.start.lie !== 'green' && s.start.dist >= 40 && s.start.dist <= 110; });
    if (wedges.length >= 3) {
      var wl = lean(wedges.filter(function (s) { return depth(s.dir) === 'short'; }).length, wedges.filter(function (s) { return depth(s.dir) === 'long'; }).length, 3);
      var wf = wedges.map(leaveFt).filter(function (v) { return v != null; }), wavg = wf.length ? sum(wf, function (v) { return v; }) / wf.length : 0;
      F.push({ area: 'approach', id: 'wedges', title: 'Wedge distance control', lost: lost(wedges), qualifies: !!wl || wavg > 30,
        text: (wl ? wl.n + ' of ' + wl.of + ' wedge shots (40–110 yd) came up ' + (wl.which ? 'long' : 'short') + ' – ' : 'Your ' + wedges.length + ' wedge shots (40–110 yd) finished ') + Math.round(wavg) + ' ft from the hole on average.',
        drill: 'Hit 5 balls each at 50, 75 and 100 yd. Write down your real carry for each swing and use those numbers on the course.' });
    }
    // Longer approaches 110+ yd: misses short / long / left / right.
    var irons = all.filter(function (s) { return s.cat === 'approach' && s.start.lie !== 'green' && s.start.dist > 110; });
    var ir = irons.filter(function (s) { return s.end.lie !== 'green' && s.end.lie !== 'holed'; });
    var id = lean(ir.filter(function (s) { return depth(s.dir) === 'short'; }).length, ir.filter(function (s) { return depth(s.dir) === 'long'; }).length, 3);
    var is = lean(ir.filter(function (s) { return side(s.dir) === 'left'; }).length, ir.filter(function (s) { return side(s.dir) === 'right'; }).length, 3);
    if (id && (!is || id.n / id.of >= is.n / is.of)) F.push({ area: 'approach', id: 'irondepth', title: id.which ? 'Approach distance – going long' : 'Approach distance – coming up short', lost: lost(irons),
      text: id.n + ' of ' + id.of + ' missed greens from over 110 yd were ' + (id.which ? 'long' : 'short') + '.',
      drill: id.which ? 'Check your real carry numbers on a launch monitor or range. You may be hitting the ball further than you think.' : 'Take one more club on approaches. Most golfers come up short far more often than long.' });
    else if (is) F.push({ area: 'approach', id: 'ironline', title: 'Iron start line – missing ' + (is.which ? 'right' : 'left'), lost: lost(irons),
      text: is.n + ' of ' + is.of + ' missed greens from over 110 yd went ' + (is.which ? 'right' : 'left') + '.',
      drill: 'Lay an alignment stick on the range and check your aim first. Then see whether the ball starts on that line.' });
    // Driving: misses left vs right, and penalty strokes off the tee.
    var tee = all.filter(function (s) { return s.cat === 'tee'; });
    var dm = S.teeMap.filter(function (t) { return !t.fairway && !t.layup; });
    var dl = lean(dm.filter(function (t) { return t.side === 'L'; }).length, dm.filter(function (t) { return t.side === 'R'; }).length, 3);
    var tp = sum(tee, function (s) { return s.penStrokes || 0; });
    if (tp >= 2) F.push({ area: 'tee', id: 'teepen', title: 'Keep it in play off the tee', lost: lost(tee) + 0.01,
      text: 'Tee shots cost you ' + plural(tp, 'penalty stroke') + '.',
      drill: 'On holes with trouble, tee off with the club you hit straightest, even if it is shorter.' });
    if (dl) F.push({ area: 'tee', id: 'teeside', title: 'Driver face control', lost: lost(tee),
      text: dl.n + ' of ' + dl.of + ' missed fairways went ' + (dl.which ? 'right' : 'left') + '.',
      drill: 'Pick a narrow target on the range and note where each miss starts. A miss that keeps going one way usually comes from the clubface.' });
    F.forEach(function (f) { if (f.qualifies == null) f.qualifies = true; });
    return F;
  }


  // ---------- v165 the verdict: is this normal for you, is it slipping, what to practise, what to ask a coach ----------
  // Everything is in strokes for a round of this length (per-hole strokes gained x the holes finished), so rounds of
  // 9 and 18 holes compare fairly. vals = the golfer's other rounds, newest first.
  var RANGE_MIN = 8, RECENT = 5, EARLIER_MIN = 5, TREND_MIN = 0.4, POOL = 5;
  function pct(sorted, p) { var i = (sorted.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo); }
  function mean(a) { return a.length ? sum(a, function (v) { return v; }) / a.length : 0; }
  function sd(a) { if (a.length < 2) return 0; var m = mean(a); return Math.sqrt(sum(a, function (v) { return (v - m) * (v - m); }) / (a.length - 1)); }
  // One area: value = this round, vals = other rounds (newest first). Range = the middle 80% of the other rounds.
  function areaVerdict(value, vals) {
    var out = { value: value, rounds: vals.length, status: null, trend: null };
    if (vals.length >= RANGE_MIN) {
      var srt = vals.slice().sort(function (a, b) { return a - b; });
      out.avg = mean(vals); out.lo = pct(srt, 0.1); out.hi = pct(srt, 0.9);
      out.worseThan = vals.filter(function (v) { return value < v; }).length; out.betterThan = vals.filter(function (v) { return value > v; }).length;
      out.status = value < out.lo ? 'low' : value > out.hi ? 'high' : 'normal';
    }
    // Trend: this round + the 4 before it against the rounds before those. It has to beat both a fixed size and the noise.
    var recent = [value].concat(vals.slice(0, RECENT - 1)), earlier = vals.slice(RECENT - 1);
    if (recent.length === RECENT && earlier.length >= EARLIER_MIN) {
      var em = mean(earlier), diff = mean(recent) - em, se = sd(earlier) * Math.sqrt(1 / recent.length + 1 / earlier.length);
      // the middle recent round has to show it too, so one very bad (or very good) round is not a trend
      var mid = pct(recent.slice().sort(function (x, y) { return x - y; }), 0.5) - em, sameSide = diff < 0 ? mid <= -TREND_MIN * 0.75 : mid >= TREND_MIN * 0.75;
      out.trend = { diff: diff, recent: recent.length, earlier: earlier.length, dir: Math.abs(diff) >= TREND_MIN && Math.abs(diff) >= se && sameSide ? (diff < 0 ? 'slipping' : 'improving') : 'steady' };
    }
    return out;
  }
  // Miss patterns over the last few rounds together (this round + up to 4 before): the things a coach can fix.
  function patterns(sumsList, SG, bl) {
    var shots = [], tees = [];
    sumsList.forEach(function (S) { shots = shots.concat(shotsOf(S)); tees = tees.concat(S.teeMap || []); });
    var N = sumsList.length, over = N > 1 ? 'over your last ' + N + ' rounds' : 'this round', k = N > 1 ? 2 : 1, out = [];
    var add = function (area, id, list, a, b, wa, wb, what, min, ask) {
      var na = list.filter(a).length, nb = list.filter(b).length, L = lean(na, nb, min * k); if (!L) return;
      out.push({ area: area, id: id, n: L.n, of: L.of, dir: L.which ? wb : wa, lost: lost(list),
        text: L.n + ' of ' + L.of + ' ' + what + ' ' + (L.which ? wb : wa) + ' ' + over + '.', ask: ask[L.which] });
    };
    var putts = shots.filter(function (s) { return s.cat === 'putting' && s.end.lie === 'green'; });
    var isD = function (d) { return function (s) { return depth(s.dir) === d; }; }, isS = function (d) { return function (s) { return side(s.dir) === d; }; };
    add('putting', 'puttspeed', putts.filter(function (s) { return s.start.dist >= 15; }), isD('short'), isD('long'), 'finished short', 'finished long', 'missed putts from 15 ft and over', 4,
      ['Speed, not line: check stroke length and tempo on long putts.', 'Speed, not line: check for a hit at the ball on long putts.']);
    add('putting', 'puttline', putts.filter(function (s) { return s.start.dist >= 4 && s.start.dist < 15; }), isS('left'), isS('right'), 'missed left', 'missed right', 'missed putts from 4-15 ft', 4,
      ['Start line: check aim and face angle at impact.', 'Start line: check aim and face angle at impact.']);
    var appr = shots.filter(function (s) { return s.cat === 'approach' && s.start.lie !== 'green' && s.end.lie !== 'green' && s.end.lie !== 'holed'; });
    var wed = appr.filter(function (s) { return s.start.dist >= 40 && s.start.dist <= 110; }), iron = appr.filter(function (s) { return s.start.dist > 110; });
    add('approach', 'wedgedist', wed, isD('short'), isD('long'), 'finished short', 'finished long', 'missed greens from 40-110 yd', 3,
      ['Wedge distances: check carry numbers and contact.', 'Wedge distances: check carry numbers and swing length.']);
    add('approach', 'irondist', iron, isD('short'), isD('long'), 'finished short', 'finished long', 'missed greens from over 110 yd', 3,
      ['Check contact and club choice: are the yardages real carry numbers?', 'Check club choice and yardages.']);
    add('approach', 'ironside', iron, isS('left'), isS('right'), 'missed left', 'missed right', 'missed greens from over 110 yd', 3,
      ['One-way miss: check face and path at impact, and alignment.', 'One-way miss: check face and path at impact, and alignment.']);
    var dm = tees.filter(function (t) { return t.fairway === false && !t.layup; });
    var tl = lean(dm.filter(function (t) { return t.side === 'L'; }).length, dm.filter(function (t) { return t.side === 'R'; }).length, 3 * k);
    if (tl) out.push({ area: 'tee', id: 'teeside', n: tl.n, of: tl.of, dir: tl.which ? 'right' : 'left', lost: lost(shots.filter(function (s) { return s.cat === 'tee'; })),
      text: tl.n + ' of ' + tl.of + ' missed fairways went ' + (tl.which ? 'right' : 'left') + ' ' + over + '.', ask: 'One-way miss with the driver: check face and path, and where you aim.' });
    return out.sort(function (x, y) { return y.lost - x.lost; });
  }
  var SHARE = { 1: [100], 2: [60, 40], 3: [50, 30, 20] };
  var AREA_DRILL = { tee: 'Hit drivers at a narrow target on the range and track where the misses go.', approach: 'Practise your most common approach distances and track how close you finish.',
    short: 'Spend half your practice time within 30 yd of the green.', bunker: 'Spend 15 minutes of every practice in a greenside bunker: first get out every time, then land it on a towel.',
    putting: 'Practise lag putts from 20-40 ft and 4-8 footers in equal measure.' };
  // S = this round's summary, hist = summaries of the other rounds (newest first), areas / F = build()'s areas and checks.
  function verdict(S, hist, areas, F, SG, bl, blName, P) {
    var rows = areas.map(function (a) {
      var vals = hist.filter(function (H) { return H.holesDone >= MIN_HOLES && H.cats[a.k].n > 0; }).map(function (H) { return H.cats[a.k].sg / H.holesDone * S.holesDone; });
      var v = P[a.k].ready ? areaVerdict(a.sg, vals) : { value: a.sg, rounds: vals.length, status: null, trend: null };
      v.k = a.k; v.name = a.name; v.word = a.word; v.known = v.status != null; v.frac = P[a.k].frac; v.delta = v.known ? a.sg - v.avg : a.sg;
      var tr = v.trend && v.trend.dir;
      v.label = !v.known ? 'Still learning' : (v.status === 'low' ? 'Worse than usual' : v.status === 'high' ? 'Better than usual' : 'Normal') + (tr && tr !== 'steady' ? ' - ' + tr : v.status === 'normal' && tr ? ' - steady' : '');
      v.tone = !v.known ? 'none' : v.status === 'low' ? 'bad' : tr === 'slipping' ? 'warn' : v.status === 'high' || tr === 'improving' ? 'good' : 'none';
      var bits = [];
      if (!v.known) bits.push(r1(a.sg) + ' strokes ' + (a.sg < 0 ? 'lost' : 'gained') + ' against the ' + blName + ' average. Your own normal range shows after a few more rounds (' + Math.round(v.frac * 100) + '% there).');
      else {
        if (v.status === 'low') bits.push('Worse than ' + v.worseThan + ' of your last ' + v.rounds + ' rounds (' + r1(v.delta) + ' strokes below your average).');
        else if (v.status === 'high') bits.push('Better than ' + v.betterThan + ' of your last ' + v.rounds + ' rounds (' + r1(v.delta) + ' strokes above your average).');
        else bits.push('Inside your normal range.');
        if (tr === 'slipping') bits.push('Your last ' + v.trend.recent + ' rounds average ' + r1(v.trend.diff) + ' strokes worse than the ' + v.trend.earlier + ' before.');
        else if (tr === 'improving') bits.push('Your last ' + v.trend.recent + ' rounds average ' + r1(v.trend.diff) + ' strokes better than the ' + v.trend.earlier + ' before.');
        else if (v.status === 'low') bits.push(tr ? 'No trend: this looks like an off day.' : 'Too few rounds to say if it is a trend.');
      }
      v.text = bits.join(' ');
      // how much practice it earns: a slide over several rounds counts in full, an off day inside a steady trend counts half
      v.need = (tr === 'slipping' ? -v.trend.diff : 0) + Math.max(0, -v.delta) * (!v.known || v.status === 'low' ? (tr === 'steady' ? 0.5 : 1) : 0.25);
      return v;
    });
    var known = rows.filter(function (v) { return v.known; });
    var low = rows.filter(function (v) { return v.status === 'low'; }).sort(function (x, y) { return x.delta - y.delta; }), slip = rows.filter(function (v) { return v.trend && v.trend.dir === 'slipping'; }).sort(function (x, y) { return x.trend.diff - y.trend.diff; });
    var headline, sub;
    if (!known.length) { headline = null; sub = null; } // not enough history yet: build() keeps its own headline
    else if (low.length) {
      var w = low[0], sl = w.trend && w.trend.dir === 'slipping';
      headline = cap(w.word) + ' cost you ' + r1(w.delta) + ' more strokes than usual' + (sl ? ', and it has been slipping.' : w.trend ? ' - an off day, not a trend.' : '.');
      var rest = rows.filter(function (v) { return v !== w; }), restBad = rest.filter(function (v) { return v.status === 'low' || (v.trend && v.trend.dir === 'slipping'); });
      sub = restBad.length ? 'Also watch ' + restBad.map(function (v) { return v.word; }).join(' and ') + '.' : 'Everything else was a normal day for you' + (rest.some(function (v) { return v.status === 'high'; }) ? ' or better.' : '.');
    } else if (slip.length) {
      headline = 'A normal round for you, but ' + slip[0].word + ' is slipping.';
      sub = 'Nothing was unusual today. ' + cap(slip[0].word) + ' has cost ' + r1(slip[0].trend.diff) + ' more strokes a round over your last ' + slip[0].trend.recent + ' rounds.';
    } else if (known.some(function (v) { return v.status === 'high'; })) {
      var b = known.slice().sort(function (x, y) { return y.delta - x.delta; })[0];
      headline = 'A good day: ' + b.word + ' was ' + r1(b.delta) + ' strokes better than usual.'; sub = 'No part of your game is slipping.';
    } else { headline = 'A normal round for you.'; sub = 'Every part of your game was inside its usual range, and nothing is slipping.'; }
    // Practice this week: up to three areas, biggest need first, with a share of practice time.
    var pick = function (k) { return F.filter(function (f) { return f.area === k && f.qualifies && f.lost >= 0.3; }).sort(function (x, y) { return y.lost - x.lost; })[0]; };
    var top = rows.filter(function (v) { return v.need >= 0.3; }).sort(function (x, y) { return y.need - x.need; }).slice(0, 3), sh = SHARE[top.length] || [];
    var plan = top.map(function (v, i) { var f = pick(v.k), tr = v.trend && v.trend.dir;
      return { area: v.k, title: f ? f.title : cap(v.word), share: sh[i], drill: f ? f.drill : AREA_DRILL[v.k],
        why: tr === 'slipping' ? 'slipping' : !v.known ? 'below the ' + blName + ' average' : v.status === 'low' ? (tr === 'steady' ? 'off day' : 'worse than usual') : 'a little below your average' }; });
    // Ask your coach: repeated miss patterns, then any slide with no clear pattern behind it.
    var pool = [S].concat(hist.slice(0, POOL - 1)), pats = patterns(pool, SG, bl), coach = pats.slice(0, 3).map(function (p) { return { area: p.area, id: p.id, text: p.text, ask: p.ask }; });
    slip.forEach(function (v) { if (coach.length < 3 && !pats.some(function (p) { return p.area === v.k; }))
      coach.push({ area: v.k, id: 'slide', text: cap(v.word) + ' has slipped ' + r1(v.trend.diff) + ' strokes a round over your last ' + v.trend.recent + ' rounds, with no clear miss pattern.', ask: 'Worth a look before it becomes a habit.' }); });
    return { ready: known.length > 0, headline: headline, sub: sub, rows: rows, plan: plan, coach: coach, poolRounds: pool.length };
  }

  function andList(L) { return L.length < 2 ? (L[0] || '') : L.slice(0, -1).join(', ') + ' and ' + L[L.length - 1]; }
  // ---------- the takeaway ----------
  // round: the round; history: the golfer's OTHER finished rounds, newest first; opts: { baselineName }.
  function build(round, history, SG, opts) {
    opts = opts || {};
    var bl = SG.baseline(round.baseline).id, S = SG.summarize(round, bl), blName = opts.baselineName || SG.baseline(bl).name;
    var P = progress(history || [], SG, bl);
    if (S.holesDone < MIN_HOLES) return { ok: false, progress: P, reason: 'Finish ' + MIN_HOLES + ' holes for a round takeaway.' };
    var areas = AREAS.filter(function (a) { return S.cats[a.k].n > 0; }).map(function (a) {
      var p = P[a.k], sg = S.cats[a.k].sg, norm = p.ready ? p.perHole * S.holesDone : 0;
      return { k: a.k, name: a.name, word: a.word, in: a.in, sg: sg, n: S.cats[a.k].n, mine: p.ready, norm: norm, delta: sg - norm };
    });
    var worst = areas.slice().sort(function (x, y) { return x.delta - y.delta; })[0], best = areas.slice().sort(function (x, y) { return y.delta - x.delta; })[0];
    var F = checks(S, SG, bl, blName), ok = F.filter(function (f) { return f.qualifies && f.lost >= 0.3; });
    var pick = function (k) { return ok.filter(function (f) { return f.area === k; }).sort(function (x, y) { return y.lost - x.lost; })[0]; };
    // Work on next: the biggest cause inside the worst area; otherwise that area itself.
    var focus = null;
    if (worst && worst.delta <= -0.5) {
      focus = pick(worst.k) || { area: worst.k, id: 'area', title: cap(worst.word), lost: Math.max(0, -worst.delta),
        text: (worst.mine ? 'You lost ' + r1(worst.delta) + ' more strokes ' + worst.in + ' than you usually do' : 'You lost ' + r1(worst.delta) + ' strokes ' + worst.in + ' against the ' + blName + ' average') + ', over ' + plural(worst.n, 'shot') + '.',
        drill: { tee: 'Hit drivers at a narrow target on the range and track where the misses go.', approach: 'Practise your most common approach distances and track how close you finish.',
          short: 'Spend half your practice time within 30 yd of the green.', bunker: 'Spend 15 minutes of every practice in a greenside bunker: first get out every time, then land it on a towel.', putting: 'Practise lag putts from 20–40 ft and 4–8 footers in equal measure.' }[worst.k] };
    } else {
      focus = ok.slice().sort(function (x, y) { return y.lost - x.lost; })[0] || null;
      if (focus && focus.lost < 0.8) focus = null;
    }
    if (focus) {
      var pa = P[focus.area];
      focus.basis = pa.ready ? { mine: true, text: 'Compared with your normal (last ' + plural(Math.min(P.rounds, NORM_ROUNDS), 'round') + ')' }
        : { mine: false, text: 'Compared with the ' + blName + ' average – still learning your ' + BY[focus.area].word + ' (' + Math.round(pa.frac * 100) + '%)' };
    }
    // Headline and the line under it.
    var others = areas.filter(function (a) { return a !== worst && a.delta < 0; }), otherLoss = -sum(others, function (a) { return a.delta; });
    var headline, lede;
    if (!worst) { headline = 'Round saved.'; lede = ''; }
    else if (areas.every(function (a) { return a.delta >= -0.1; }) && best.delta >= 0.5) { // v173: nothing worse than its yardstick and something clearly better (a level round is steady, not great)
      // v173 (Scott): say what each area was measured against – "better than the PGA Tour average everywhere" was wrong when
      // most areas were measured against the golfer's own normal and were still well below the tour.
      var mineA = areas.filter(function (a) { return a.mine; }), benchA = areas.filter(function (a) { return !a.mine; });
      var ins = function (L) { return andList(L.map(function (a) { return a.in; })); }, vs = function (a) { return a.mine ? 'your normal' : 'the ' + blName + ' average'; };
      if (!benchA.length) { headline = 'Great round – better than your normal everywhere.'; lede = ''; }
      else if (!mineA.length) { headline = 'Great round – better than the ' + blName + ' average everywhere.'; lede = ''; }
      else { headline = 'Great round – better than your normal everywhere.';
        lede = 'Better than your normal ' + ins(mineA) + '; better than the ' + blName + ' average ' + ins(benchA) + ' (Strokewise doesn’t know your normal there yet). '; }
      lede += cap(best.word) + ' led the way: ' + r1(best.delta) + ' ' + (Math.abs(best.delta) === 1 ? 'stroke' : 'strokes') + ' better than ' + vs(best) + '.';
      // and where that leaves the round against the benchmark, so a good round for you is not read as tour-level
      var tot = sum(areas, function (a) { return a.sg; });
      if (mineA.length && tot <= -0.5) lede += ' Overall you were still ' + r1(-tot) + ' strokes behind the ' + blName + ' average – that is the long-term goal.';
    } else if (worst.delta > -BIG) {
      headline = 'A steady round with no big leaks.';
      lede = 'Every area was within a stroke of ' + (worst.mine ? 'your normal' : 'the ' + blName + ' average') + '.';
    } else {
      headline = (best !== worst && best.delta >= 0.5 ? cap(best.word) + ' was a strength. ' : '') + cap(worst.word) + ' cost you the most.';
      lede = (worst.mine ? 'You lost ' + r1(worst.delta) + ' more strokes ' + worst.in + ' than you usually do' : 'You lost ' + r1(worst.delta) + ' strokes ' + worst.in + ' against the ' + blName + ' average') +
        (otherLoss >= BIG && -worst.delta > otherLoss ? ' – more than the rest of your game combined.' : '.');
    }
    // One tile per area: its strokes gained, a picture, one line.
    var tiles = areas.map(function (a) {
      var f = pick(a.k) || F.filter(function (x) { return x.area === a.k; }).sort(function (x, y) { return y.lost - x.lost; })[0];
      // the tile adds to the takeaway: it does not repeat the Work on next line
      var t = { k: a.k, name: a.name, sg: a.sg, norm: a.mine ? a.norm : null, text: f && f.qualifies && !(focus && f.text === focus.text) ? f.text : null };
      if (a.k === 'tee') {
        // v149: only missed fairways (par-3 tee shots have no fairway); a miss with no left/right entered is counted and said, so the numbers add up
        var miss = S.teeMap.filter(function (x) { return x.fairway === false; }), sided = miss.filter(function (x) { return !x.layup && (x.side === 'L' || x.side === 'R'); });
        var lN = sided.filter(function (x) { return x.side === 'L'; }).length, rN = sided.length - lN, rest = miss.filter(function (x) { return sided.indexOf(x) < 0; });
        t.pic = { kind: 'tee', left: lN, fw: S.fwHit, of: S.fwTotal, right: rN, noSide: rest.length, noSidePen: rest.filter(function (x) { return x.pen && !x.layup; }).length, noSideOB: rest.filter(function (x) { return x.kind === 'ob' && !x.layup; }).length };
        t.text = t.text || S.fwHit + ' of ' + S.fwTotal + ' fairways.';
        if (rest.length) { // say what the misses not shown left or right were, by hole, so the numbers add up
          var G = {}; rest.forEach(function (x) { var what = x.layup ? 'layup' : x.kind === 'ob' ? 'OB' : x.pen ? 'penalty' : '', dir = x.dir ? 'went ' + String(x.dir).replace(/([a-z])(left|right)$/, '$1 $2') : 'no direction entered';
            var w = what === 'layup' ? what : (what ? what + ', ' : '') + dir; (G[w] = G[w] || []).push(x.hole); });
          t.text += ' Not in left/right: ' + Object.keys(G).map(function (w) { return 'hole' + (G[w].length > 1 ? 's ' : ' ') + G[w].join(', ') + ' (' + w + ')'; }).join('; ') + '.';
        }
      } else if (a.k === 'approach') {
        var c = { short: 0, long: 0, left: 0, right: 0 }; S.apprMiss.forEach(function (m) { var d = depth(m.dir), s = side(m.dir); if (d) c[d]++; if (s) c[s]++; });
        t.pic = { kind: 'approach', gir: S.gir, of: S.girHoles, short: c.short, long: c.long, left: c.left, right: c.right };
        // v163 (Scott): the GIR count is already in the picture – the line is approach proximity vs the benchmark from the same spots,
        // drawn like the chipping bars
        var ap = shotsOf(S).filter(function (x) { return x.cat === 'approach' && !x.layup && leaveFt(x) != null; });
        if (ap.length) { var aY = sum(ap, leaveFt) / ap.length, aP = sum(ap, function (x) { return parLeaveFt(SG, x, bl); }) / ap.length;
          t.bars = { kind: 'bars', yours: aY, par: aP, label: blName, short: BL_SHORT[bl] || 'Avg', what: 'Approaches' };
          if (!t.text) t.text = 'Approaches finished ' + Math.round(aY) + ' ft away on average (' + blName + ': ' + Math.round(aP) + ' ft).'; }
        else t.text = t.text || S.gir + ' of ' + S.girHoles + ' greens in regulation.';
      } else if (a.k === 'short') {
        var ch = F.filter(function (x) { return x.id === 'chips'; })[0];
        t.pic = ch ? { kind: 'bars', yours: ch.yours, par: ch.par, label: blName, short: BL_SHORT[bl] || 'Avg' } : null;
        t.text = t.text || (ch ? 'Chips finished ' + Math.round(ch.yours) + ' ft away on average (' + blName + ': ' + Math.round(ch.par) + ' ft).' : plural(a.n, 'shot') + ' around the green.');
      } else if (a.k === 'bunker') {
        var bk = F.filter(function (x) { return x.id === 'bunker'; })[0];
        t.pic = bk && bk.yours != null ? { kind: 'bars', yours: bk.yours, par: bk.par, label: blName, short: BL_SHORT[bl] || 'Avg' } : null;
        t.text = t.text || (bk && bk.yours != null ? 'Bunker shots finished ' + Math.round(bk.yours) + ' ft away on average (' + blName + ': ' + Math.round(bk.par) + ' ft).' : plural(a.n, 'bunker shot') + '.');
      } else {
        var pts = shotsOf(S).filter(function (s) { return s.cat === 'putting' && s.end.lie === 'green'; });
        var sh = pts.filter(function (s) { return depth(s.dir) === 'short'; }).length, lg = pts.filter(function (s) { return depth(s.dir) === 'long'; }).length;
        var one = 0, three = 0; S.holes.forEach(function (h) { if (h.done) { if (h.putts === 1) one++; if (h.putts >= 3) three++; } });
        t.pic = sh + lg ? { kind: 'putts', short: sh, long: lg } : { kind: 'counts', one: one, three: three };
        t.text = t.text || S.putts + ' putts, ' + (one ? one : 'no') + ' one-putt' + (one === 1 ? '' : 's') + ', ' + (three ? three : 'no') + ' three-putt' + (three === 1 ? '' : 's') + '.';
      }
      return t;
    });
    // Went well: up to three.
    var good = [];
    if (best && best.delta >= 0.5) good.push(best.name.toLowerCase() + (best.mine ? ' ' + r1(best.delta) + ' strokes better than usual' : ' gained ' + r1(best.sg) + ' strokes'));
    var birdies = 0; S.holes.forEach(function (h, i) { if (h.done && h.strokes < Number(round.holes[i].par)) birdies++; });
    if (birdies) good.push(plural(birdies, 'birdie'));
    if (S.penalties === 0) good.push('no penalties');
    var threes = 0; S.holes.forEach(function (h) { if (h.done && h.putts >= 3) threes++; });
    if (threes === 0 && S.holesDone >= 9) good.push('no 3-putts');
    if (S.fwTotal >= 6 && S.fwHit / S.fwTotal >= 0.6) good.push(S.fwHit + ' of ' + S.fwTotal + ' fairways');
    if (S.girHoles >= 9 && S.gir / S.girHoles >= 0.5) good.push(S.gir + ' of ' + S.girHoles + ' greens');
    // v165: normal range, trend, practice plan and coach notes
    var hist = (history || []).slice(0, NORM_ROUNDS).map(function (r) { return SG.summarize(r, bl); }).filter(function (H) { return H.holesDone > 0; });
    var V = verdict(S, hist, areas, F, SG, bl, blName, P);
    return { ok: true, headline: headline, lede: lede, focus: focus, tiles: tiles, good: good.slice(0, 3), progress: P, baselineName: blName, checks: F, verdict: V };
  }

  var API = { AREAS: AREAS, NORM_ROUNDS: NORM_ROUNDS, MIN_HOLES: MIN_HOLES, build: build, progress: progress, checks: checks, areaVerdict: areaVerdict, patterns: patterns, parLeaveFt: parLeaveFt, leaveFt: leaveFt };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.INSIGHTS = API;
})(this);
