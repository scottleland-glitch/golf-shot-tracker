/* plan.js – v203 (Scott): the practice plan. Not a weekly schedule: a ranked "Practice next" list – the practice that's
 * most needed first, each item an area + one focus + minutes + a one-line reason. Do the top item whenever there's time.
 *
 * 1. NEED – strokes lost per round against your benchmark, per area, from rounds (recent ones count more, tournament
 *    rounds ×4/3 so a practice round counts ¾ of one, few shots pulled toward "even") blended with the last short game test (fading over 6 weeks).
 * 2. CAUSE – pattern detectors on rounds (miss direction, short / long, penalties, stayed in the bunker, lag speed, start
 *    line, high / low side using the putt's read) and the test's own notes. Rounds and test agreeing = the strongest focus.
 *    v233: a chip or lag putt that finishes inside 3 ft is a good result, not a miss. Recent shots count more (45-day half-life).
 *    Every note says where it comes from, and the latest round is checked against the window: "may be turning around" / "new".
 * 3. MOMENTUM – Trends: slipping areas get more, areas that respond to practice a little more.
 * 4. FEEDBACK – "off" sessions keep an area in; "great" every time on plain reps → try a game / pressure version.
 * 5. COACH – lesson homework stays at the top: ~4 weeks after a big change, ~2 after a fine-tune.
 * TIME – the budget is your average week over the last 30 days. Each area gets a share by need; every day it's needed and
 *    not practised its OWED time builds (recent days count more); logging practice pays it off and it drops down. Missed
 *    for a week → it climbs to the top. Extra time is a small credit (at most a week of that area's share). One long session
 *    counts a little less than the same time spread out. Practice changes the order, not the problems – a need stays until
 *    rounds or the next test show it's better.
 * TOURNAMENT – a Big one in the next 7 days: sharpen (putting speed, short game, wedge distances; no new swing changes;
 *    shorter sessions; a light warm-up the day before). A Regular one: practice as normal.
 */
(function (root) {
  'use strict';
  var DAY = 864e5;
  var CFG = {
    halfLifeDays: 45, tourW: 4 / 3, /* v234 (Scott): a practice (or untagged) round counts 0.75 of a tournament round */ testWeeks: 6, testW: 0.6, defaultWeekMin: 120, minWeekMin: 30, carry: 0.5, /* v216: share of last week's shortfall that carries over */
    owedMin: 5, longSession: 75, longSessionW: 0.85, floorShare: 0.05, maxShare: 0.4, lean: 0.65,
    coachBigDays: 28, coachTuneDays: 14, coachShare: 0.3, sharpenDays: 7, maxItems: 5,
    groupFloor: 0.2, fadeWeeks: 3, leakMin: 0.5, leakShare: 0.35, leakNear: 0.7, areaInGroup: 0.25, coachInGroup: 0.75, // v208: the balance
    // v233 (Scott): a finish this close is a good result, not a miss; and the latest round(s) checked against the longer window
    goodFt: 3, findDays: 120, recMin: 4, recLess: 0.5, recLessMax: 0.25, recNewMin: 4, recNewShare: 0.8, recMore: 2, recNewRate: 0.3, recOlderMin: 5, recTurnConf: 0.6, recNewConf: 0.6, // recOlderMin: shots in the rounds before, to compare with
    recLost: 1.0, recGap: 0.8, recLastShare: 0.5, recBetterLost: 0.5, recBetterMult: 0.9, recAreaShots: 3, recHoles: 9
  };
  // the test's areas → plan areas, and shots a round of each (if your rounds can't say)
  var TEST_CAT = { putting: ['lag', 'short'], chipping: ['chip'], bunker: ['bunker'], wedge: ['wedges'] }, PER_ROUND = { lag: 14, short: 16, chip: 5, bunker: 1.5, wedges: 6 };
  var TEST_NOTE = { lag: 'lag', speed: 'lag', brk: 'short', short: 'short', wedge: 'wedges', flop: 'chip' };
  var TREND_K = { drive: 'drive', irons: 'irons', wedges: 'wedges', chip: 'chip', bunker: 'bunker', lag: 'putt', short: 'putt' };
  var SHARPEN = { lag: 1.5, short: 1.5, chip: 1.3, wedges: 1.3, bunker: 1.1, drive: 0.6, irons: 0.7 };
  var GROUPS = [['putt', 'Putting', ['lag', 'short']], ['short', 'Short game', ['chip', 'bunker']], ['wedge', 'Wedges', ['wedges']], ['full', 'Full swing', ['drive', 'irons']]];
  var SHARPEN_G = { putt: 1.5, short: 1.3, wedge: 1.3, full: 0.4 };
  var GENERIC = { drive: 'Driving – start line and contact', irons: 'Irons – distance and direction', wedges: 'Wedges – distance control', chip: 'Chipping – landing spot and roll',
    bunker: 'Bunker – out and on the green', lag: 'Lag putts – speed', short: 'Short putts – start line' };

  function has(d, w) { return String(d || '').indexOf(w) >= 0; }
  function lean(a, b, min) { var n = a + b; if (n < min) return null; return a / n >= CFG.lean ? 0 : b / n >= CFG.lean ? 1 : null; }
  function conf(x, n) { return Math.max(0, Math.min(1, 0.45 + 0.55 * Math.min(1, (n - 4) / 12) + (x - CFG.lean) * 0.8)); } // more shots and a stronger lean → surer
  function cap(t) { return t.charAt(0).toUpperCase() + t.slice(1); }
  function r5(v) { return Math.round(v / 5) * 5; }
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function dstr(t) { var d = new Date(t); return MON[d.getMonth()] + ' ' + d.getDate(); }
  function leanW(a, b) { var n = a + b; return !n ? null : a / n >= CFG.lean ? 0 : b / n >= CFG.lean ? 1 : null; }
  // v233: a shot that finished inside 3 ft (or in the hole) is a good result – never counted as short or long
  function good(s) { var e = (s && s.end) || {}; return e.lie === 'holed' || (e.lie === 'green' && e.dist != null && Number(e.dist) <= CFG.goodFt); }
  // v233 (Scott): where a note's numbers come from, in plain words
  function srcText(noun, E) { var ids = {}, first = Infinity; E.forEach(function (e) { ids[e.rid] = 1; if (e.t < first) first = e.t; }); var n = Object.keys(ids).length;
    return !n ? '' : 'From ' + noun + ' in your ' + (n === 1 ? 'last round (' + dstr(first) + ')' : 'last ' + n + ' rounds (since ' + dstr(first) + ')'); }
  function fam(k, text) { var m = /\b(short|long|low|high|left|right|in the sand|over)\b/.exec(String(text || '').toLowerCase()); return k + ':' + (m ? m[1] : 'x'); }

  // ---- 1. need: strokes per round vs the benchmark, per area ----
  function areaNeeds(rounds, SG, MYGAME, bl, now) {
    var A = {}; MYGAME.SPOKES.forEach(function (sp) { A[sp.k] = { k: sp.k, name: sp.name, need: sp.need, sg: 0, n: 0, wr: 0, shots: [], last: { sg: 0, n: 0 } }; });
    var W = 0, nR = 0, first = Infinity, lastI = -1, lastT = -Infinity, lastH = 0;
    // v233: the latest round of 9+ holes – the recency check compares it with the longer window
    rounds.forEach(function (r, ri) { var t = Date.parse(r.date), S; try { S = SG.summarize(r, bl); } catch (e) { return; } if (S && S.holesDone >= CFG.recHoles && t <= now && t > lastT) { lastT = t; lastI = ri; lastH = S.holesDone; } });
    rounds.forEach(function (r, ri) {
      var S; try { S = SG.summarize(r, bl); } catch (e) { return; } if (!S || !S.holesDone) return;
      var t = Date.parse(r.date), age = Math.max(0, (now - t) / DAY), isTour = !!(MYGAME.playOf && MYGAME.playOf(r) === 'tournament'), w = Math.pow(0.5, age / CFG.halfLifeDays) * (isTour ? CFG.tourW : 1);
      W += w * S.holesDone / 18; nR++; if (t < first) first = t;
      S.holes.forEach(function (h) { (h.shots || []).forEach(function (s, i) { if (s.layup) return; var nx = h.shots[i + 1];
        for (var j = 0; j < MYGAME.SPOKES.length; j++) if (MYGAME.SPOKES[j].test(s)) { var a = A[MYGAME.SPOKES[j].k]; a.sg += w * s.sg; a.n++; a.shots.push({ s: s, nx: nx, age: age, tour: isTour, w: w, rid: 'r' + ri, t: t });
          if (ri === lastI) { a.last.sg += s.sg; a.last.n++; } break; } }); });
    });
    Object.keys(A).forEach(function (k) { var a = A[k]; a.perRound = W ? a.sg / W : null; a.perRoundShots = W ? a.n / Math.max(1, rounds.length) : null; a.wr = a.n / (a.n + a.need);
      a.nRounds = nR; a.since = first; a.last = lastI < 0 ? null : { sg: a.last.sg, n: a.last.n, per: a.last.sg * 18 / lastH, t: lastT }; });
    return A;
  }

  // ---- 2. cause: what the rounds say ----
  // v233 (Scott): each pattern is a list of shots, each one side A (0), side B (1) or neither (null – a good result, holed, no direction).
  // The lean is decided with recent rounds counting more (the same 45-day half-life as the need); the note shows the plain counts.
  // Then the latest round (or last 2, to get at least 4 shots) is checked against the rounds before it:
  //  – turning around: the pattern happens less than half as often as before (and in at most a quarter of the shots) → the note says so, lower priority
  //  – new: at least 4 shots and 4 in 5 misses one way lately, at least twice as often as before → "new" (no pattern over the window)
  //    or "more than before" (the window shows it too, but mostly because of the latest round)
  function recentOf(E) {
    var by = {}; E.forEach(function (e) { (by[e.rid] = by[e.rid] || { t: e.t, E: [] }).E.push(e); });
    var R = Object.keys(by).map(function (k) { return by[k]; }).sort(function (a, b) { return b.t - a.t; }), out = [], n = 0;
    for (var i = 0; i < R.length && i < 2; i++) { out = out.concat(R[i].E); n++; if (out.length >= CFG.recMin) break; }
    var ids = {}; out.forEach(function (e) { ids[e.rid] = 1; });
    return { E: out, rounds: n, label: n === 1 ? 'Last round' : 'Last 2 rounds', older: E.filter(function (e) { return !ids[e.rid]; }) };
  }
  function roundFindings(A) {
    var F = {}, push = function (k, focus, why, x, n, f, more) { var c = conf(x, n), o = { k: k, focus: focus, why: why, conf: c, src: 'rounds', fam: f };
      for (var m in more || {}) o[m] = more[m]; if (o.confMul) { o.conf = c * o.confMul; delete o.confMul; } if (o.confMax != null) { o.conf = Math.min(o.conf, o.confMax); delete o.confMax; }
      if (!F[k] || F[k].conf < o.conf) F[k] = o; };
    var recent = function (k) { return A[k].shots.filter(function (x) { return x.age <= CFG.findDays; }); };
    var ent = function (L, fn) { return L.map(function (x) { return { v: fn(x), w: x.w == null ? 1 : x.w, rid: x.rid || 'r', t: x.t || 0 }; }); };
    // o: { k, noun (for the source line), rnoun (shots counted in the recency line), words: [side A, side B], min, focus(side), why(side, x, n), fam(side), bonus }
    function detect(E, o) {
      var a = 0, b = 0, wa = 0, wb = 0; E.forEach(function (e) { if (e.v === 0) { a++; wa += e.w; } else if (e.v === 1) { b++; wb += e.w; } });
      var side = a + b >= o.min ? leanW(wa, wb) : null, R = recentOf(E), rn = R.E.length, src = srcText(o.noun, E), bo = o.bonus || 0;
      var cnt = function (L, v) { return L.filter(function (e) { return e.v === v; }).length; }, on = R.older.length;
      // new: 4+ shots one way lately, 4 in 5 of the misses, at least 30 % of the shots – and at least twice as often as in the rounds before
      var isNew = function (s) { var rx = cnt(R.E, s), rc = cnt(R.E, 0) + cnt(R.E, 1), oRate = on ? cnt(R.older, s) / on : 0;
        return rx >= CFG.recNewMin && rx / rc >= CFG.recNewShare && rx / rn >= CFG.recNewRate && on >= CFG.recOlderMin && rx / rn >= oRate * CFG.recMore; };
      if (side != null) {
        var x = side ? b : a, rx = cnt(R.E, side), oRate = on ? cnt(R.older, side) / on : 0, more = { source: src };
        if (rn >= CFG.recMin && on >= CFG.recOlderMin && rx / rn <= Math.min(CFG.recLessMax, oRate * CFG.recLess)) {
          more.rec = { dir: 'better', text: R.label + ': ' + rx + ' of ' + rn + ' ' + o.rnoun + ' ' + o.words[side] + ' – may be turning around' }; more.confMul = CFG.recTurnConf; }
        else if (isNew(side)) more.rec = { dir: 'worse', text: R.label + ': ' + rx + ' of ' + rn + ' ' + o.rnoun + ' ' + o.words[side] + ' – more than before' }; // mostly the latest round
        push(o.k, o.focus(side), o.why(side, x, a + b), (side ? wb : wa) / (wa + wb) + bo, a + b + (bo ? 2 : 0), o.fam(side), more);
        return;
      }
      [0, 1].forEach(function (s) { var rx = cnt(R.E, s), rc = cnt(R.E, 0) + cnt(R.E, 1);
        if (isNew(s)) push(o.k, o.focus(s), 'Not a pattern before – it showed up ' + (R.rounds === 1 ? 'in your last round' : 'in your last 2 rounds'), rx / rc, rc + 4, o.fam(s),
            { source: src, rec: { dir: 'worse', text: R.label + ': ' + rx + ' of ' + rn + ' ' + o.rnoun + ' ' + o.words[s] + ' – new' }, confMax: CFG.recNewConf, isNew: true }); });
    }
    var LR = ['left', 'right'], SL = ['short', 'long'];
    // driving: which side the missed fairways go, and penalties
    var T = recent('drive'), pen = 0; T.forEach(function (x) { if (x.s.ob || (x.s.pen && x.s.pen !== 'none')) pen++; });
    detect(ent(T, function (x) { var e = x.s.end || {}; if (!e.lie || e.lie === 'fairway') return null; return x.s.side === 'left' || has(x.s.dir, 'left') ? 0 : x.s.side === 'right' || has(x.s.dir, 'right') ? 1 : null; }),
      { k: 'drive', noun: 'tee shots', rnoun: 'tee shots', words: ['missed left', 'missed right'], min: 6, focus: function (s) { return 'Tee shots missing ' + LR[s]; },
        why: function (s, x, n) { return x + ' of ' + n + ' missed fairways went ' + LR[s]; }, fam: function (s) { return 'drive:' + LR[s]; } });
    if (pen >= 3 && pen / Math.max(1, T.length) >= 0.08) push('drive', 'Keeping it in play off the tee', pen + ' penalty shots off the tee lately', 0.75 + Math.min(0.2, pen / 40), pen + 6, 'drive:pen', { source: srcText('tee shots', ent(T, function () { return null; })) });
    // approaches (irons) and wedges: short / long and left / right of the green
    [['irons', 'Approaches', 'approaches'], ['wedges', 'Wedges', 'wedge shots']].forEach(function (g) {
      var G = recent(g[0]), off = function (x) { var e = x.s.end || {}; return e.lie !== 'green' && e.lie !== 'holed'; };
      detect(ent(G, function (x) { return !off(x) ? null : has(x.s.dir, 'short') ? 0 : has(x.s.dir, 'long') ? 1 : null; }),
        { k: g[0], noun: g[2], rnoun: g[2], words: ['short', 'long'], min: 5, focus: function (s) { return g[1] + ' finishing ' + SL[s]; },
          why: function (s, x, n) { return x + ' of ' + n + ' missed greens were ' + SL[s]; }, fam: function (s) { return g[0] + ':' + SL[s]; } });
      detect(ent(G, function (x) { return !off(x) ? null : has(x.s.dir, 'left') ? 0 : has(x.s.dir, 'right') ? 1 : null; }),
        { k: g[0], noun: g[2], rnoun: g[2], words: ['missed left', 'missed right'], min: 6, focus: function (s) { return g[1] + ' missing ' + LR[s]; },
          why: function (s, x, n) { return x + ' of ' + n + ' missed greens went ' + LR[s]; }, fam: function (s) { return g[0] + ':' + LR[s]; } });
    });
    // chipping: leaving it short or running it past (v233: holed or finished inside 3 ft = a good chip, not counted)
    detect(ent(recent('chip'), function (x) { return good(x.s) ? null : has(x.s.dir, 'short') ? 0 : has(x.s.dir, 'long') ? 1 : null; }),
      { k: 'chip', noun: 'chips', rnoun: 'chips', words: ['short', 'long'], min: 5, focus: function (s) { return 'Chips finishing ' + SL[s]; },
        why: function (s, x, n) { return x + ' of ' + n + ' chips finished ' + (s ? 'past' : 'short of') + ' the hole'; }, fam: function (s) { return 'chip:' + SL[s]; } });
    // bunker: still in the sand
    var B = recent('bunker'), stay = B.filter(function (x) { return (x.s.end || {}).lie === 'bunker'; }).length;
    if (B.length >= 4 && stay >= 2 && stay / B.length >= 0.25) push('bunker', 'Getting out first time', stay + ' of ' + B.length + ' bunker shots stayed in the sand', 0.6 + stay / B.length * 0.4, B.length + 4, 'bunker:in the sand', { source: srcText('bunker shots', ent(B, function () { return null; })) });
    // lag putts (20 ft+): speed, and speed by slope when the read is entered (v233: inside 3 ft = a good lag, not counted)
    var P = recent('lag').filter(function (x) { return x.s.start.dist >= 20 && (x.s.end || {}).lie !== 'holed'; }), dn = [0, 0], up = [0, 0], psrc = srcText('lag putts', ent(P, function () { return null; }));
    P.forEach(function (x) { if (good(x.s)) return; var sh = has(x.s.dir, 'short'), lo = has(x.s.dir, 'long'); var sl = String(x.s.rd || '').split('-')[0];
      if (sl === 'down') { if (lo) dn[1]++; else if (sh) dn[0]++; } if (sl === 'up') { if (sh) up[0]++; else if (lo) up[1]++; } });
    detect(ent(P, function (x) { return good(x.s) ? null : has(x.s.dir, 'short') ? 0 : has(x.s.dir, 'long') ? 1 : null; }),
      { k: 'lag', noun: 'lag putts', rnoun: 'lag putts', words: ['short', 'long'], min: 6, focus: function (s) { return 'Lag speed – finishing ' + SL[s]; },
        why: function (s, x, n) { return x + ' of ' + n + ' first putts from 20 ft+ finished ' + SL[s]; }, fam: function (s) { return 'lag:' + SL[s]; } });
    if (dn[0] + dn[1] >= 4 && dn[1] / (dn[0] + dn[1]) >= CFG.lean) push('lag', 'Downhill speed', dn[1] + ' of ' + (dn[0] + dn[1]) + ' downhill lag putts ran long', dn[1] / (dn[0] + dn[1]) + 0.05, dn[0] + dn[1] + 4, 'lag:long', { source: psrc });
    if (up[0] + up[1] >= 4 && up[0] / (up[0] + up[1]) >= CFG.lean) push('lag', 'Uphill speed', up[0] + ' of ' + (up[0] + up[1]) + ' uphill lag putts came up short', up[0] / (up[0] + up[1]) + 0.05, up[0] + up[1] + 4, 'lag:short', { source: psrc });
    // short putts (under 10 ft) missed: start line, and the high / low side on breaking putts
    var M = recent('short'), brk = function (x) { var br = String(x.s.rd || '').split('-')[1]; return br === 'r' || br === 'l' ? br : ''; };
    detect(ent(M, function (x) { if ((x.s.end || {}).lie === 'holed' || brk(x)) return null; return has(x.s.dir, 'left') ? 0 : has(x.s.dir, 'right') ? 1 : null; }),
      { k: 'short', noun: 'short putts', rnoun: 'short putts', words: ['missed left', 'missed right'], min: 6, focus: function (s) { return 'Short putts – start line (missing ' + LR[s] + ')'; },
        why: function (s, x, n) { return x + ' of ' + n + ' missed straight putts went ' + LR[s]; }, fam: function (s) { return 'short:' + LR[s]; } });
    detect(ent(M.filter(brk), function (x) { if ((x.s.end || {}).lie === 'holed') return null; var br = brk(x), lf = has(x.s.dir, 'left'), rt = has(x.s.dir, 'right');
      return (br === 'r' && lf) || (br === 'l' && rt) ? 0 : lf || rt ? 1 : null; }),
      { k: 'short', noun: 'short putts', rnoun: 'breaking putts', words: ['missed high', 'missed low'], min: 5, bonus: 0.05, focus: function (s) { return s ? 'Reading break – missing low' : 'Reading break – missing high'; },
        why: function (s, x, n) { return x + ' of ' + n + ' missed breaking putts were on the ' + (s ? 'low' : 'high') + ' side' + (s ? ' – play more break' : ' – firmer, or less break'); }, fam: function (s) { return 'short:' + (s ? 'low' : 'high'); } });
    return F;
  }

  // ---- the whole plan ----
  // ctx: { rounds, logs, SG, MYGAME, bl, test: { date, perShot: {putting, chipping, bunker, wedge}, coach: [{k, text, ask}] } | null,
  //        trends: TRENDS.build(...) | null, now, tour: { date, big } | null }
  // v208: the need step on its own, so the balance can ask "what was the biggest leak back then?"
  function lostAt(ctx, keys, t) {
    var rs = (ctx.rounds || []).filter(function (r) { return Date.parse(r.date) <= t; }), A = areaNeeds(rs, ctx.SG, ctx.MYGAME, ctx.bl, t);
    var test = ctx.test && Date.parse(ctx.test.date) <= t ? ctx.test : null, tw = test ? CFG.testW * Math.max(0, 1 - (t - Date.parse(test.date)) / DAY / (7 * CFG.testWeeks)) : 0;
    needValues(A, keys, test, tw); return A;
  }
  function needValues(A, keys, test, tw) {
    keys.forEach(function (k) { var a = A[k], vt = null;
      if (test && test.perShot) Object.keys(TEST_CAT).forEach(function (c) { if (TEST_CAT[c].indexOf(k) >= 0 && test.perShot[c] != null) vt = test.perShot[c] * (a.perRoundShots || PER_ROUND[k]); });
      var vr = a.perRound != null ? a.perRound * a.wr : null, wr = a.wr; // shrink toward even
      var v = vr == null && vt == null ? 0 : vt == null || !tw ? vr : vr == null ? vt : (wr * (a.perRound) + tw * vt) / (wr + tw) * Math.min(1, (wr + tw) / 0.6);
      a.value = v; a.testVal = vt; a.lost = Math.max(0, -(v || 0)); });
  }
  // which groups are leaking: clearly the biggest share of strokes lost, and enough strokes to matter
  function leaksOf(A) {
    var L = GROUPS.map(function (g) { return g[2].reduce(function (t, k) { return t + (A[k] ? A[k].lost : 0); }, 0); }), tot = L.reduce(function (t, v) { return t + v; }, 0), mx = Math.max.apply(null, L);
    return GROUPS.map(function (g, i) { return { g: g[0], lost: L[i], leak: L[i] >= CFG.leakMin && tot > 0 && L[i] / tot >= CFG.leakShare && L[i] >= mx * CFG.leakNear }; });
  }
  function cs0(coach, tour) { return Object.keys(coach).filter(function (k) { return !(tour && tour.mode === 'sharpen' && coach[k].change === 'big'); }); }
  function gOf(k) { for (var i = 0; i < GROUPS.length; i++) if (GROUPS[i][2].indexOf(k) >= 0) return i; return GROUPS.length - 1; }
  function balance(ctx, keys, A, coach, cs, tour, now) {
    var nG = GROUPS.length, spare = 1 - CFG.groupFloor * nG, charge = GROUPS.map(function () { return 0; }), since = GROUPS.map(function () { return null; }), w = GROUPS.map(function () { return 0; }), why = GROUPS.map(function () { return ''; });
    var fade = function (d) { return Math.max(0, 1 - Math.floor(d / 7) / CFG.fadeWeeks); }; // d in days: week 1 full, then a third less each week
    // evidence: every round and the test in the last 4 weeks, oldest first – the latest one that still shows the leak sets the charge
    var ev = (ctx.rounds || []).map(function (r) { return Date.parse(r.date); }).concat(ctx.test ? [Date.parse(ctx.test.date)] : [])
      .filter(function (t) { return t <= now && now - t < (CFG.fadeWeeks + 1) * 7 * DAY; }).sort(function (a, b) { return a - b; });
    ev.forEach(function (t) { leaksOf(lostAt(ctx, keys, t)).forEach(function (x, i) { if (x.leak) { since[i] = t; w[i] = x.lost; why[i] = 'rounds'; } }); });
    GROUPS.forEach(function (g, i) { if (since[i] != null) charge[i] = fade((now - since[i]) / DAY); });
    // lesson homework: its group(s) get the boost from the lesson day, fading the same way
    cs.forEach(function (k) { var i = gOf(k), t = Date.parse(coach[k].date), c = fade((now - t) / DAY);
      if (c >= charge[i]) { charge[i] = c; since[i] = t; why[i] = 'coach'; } w[i] = Math.max(w[i], CFG.leakMin); });
    var act = GROUPS.map(function (g, i) { return charge[i] > 0; }), nA = act.filter(Boolean).length || 1; // the spare splits evenly between the leaks
    var extra = GROUPS.map(function (g, i) { return act[i] ? spare * charge[i] / nA : 0; }), left = spare - extra.reduce(function (t, v) { return t + v; }, 0);
    // what's left of the spare: even – or, in a big tournament's sharpening week, toward putting, short game and wedges
    var sw = GROUPS.map(function (g) { return tour && tour.mode === 'sharpen' ? SHARPEN_G[g[0]] : 1; }), sws = sw.reduce(function (t, v) { return t + v; }, 0);
    var G = GROUPS.map(function (g, i) { var s = CFG.groupFloor + extra[i] + left * sw[i] / sws;
      return { g: g[0], name: g[1], share: s, boost: act[i], charge: charge[i], why: act[i] ? why[i] : '', since: since[i], evenBy: act[i] ? since[i] + CFG.fadeWeeks * 7 * DAY : null }; });
    // inside a group: by need, every area at least a quarter of it, lesson homework at least three quarters
    var share = {}; GROUPS.forEach(function (g, i) { var ks = g[2].filter(function (k) { return keys.indexOf(k) >= 0; }); if (!ks.length) return;
      var tot = ks.reduce(function (t, k) { return t + A[k].score; }, 0) || 1, f = {}; ks.forEach(function (k) { f[k] = A[k].score / tot; });
      if (ks.length > 1) for (var it = 0; it < 3; it++) { var s2 = ks.reduce(function (t, k) { return t + f[k]; }, 0); ks.forEach(function (k) { f[k] = Math.max(CFG.areaInGroup, f[k] / s2); }); }
      var ck = ks.filter(function (k) { return cs.indexOf(k) >= 0; });
      if (ck.length && ck.length < ks.length) { var fc = ck.reduce(function (t, k) { return t + f[k]; }, 0), fo = ks.reduce(function (t, k) { return t + (ck.indexOf(k) < 0 ? f[k] : 0); }, 0), cf = Math.max(fc / (fc + fo), CFG.coachInGroup);
        ks.forEach(function (k) { f[k] = ck.indexOf(k) >= 0 ? f[k] / fc * cf : f[k] / fo * (1 - cf); }); }
      var s3 = ks.reduce(function (t, k) { return t + f[k]; }, 0); ks.forEach(function (k) { share[k] = G[i].share * f[k] / s3; }); });
    return { share: share, groups: G };
  }

  function build(ctx) {
    var now = ctx.now || Date.now(), A = areaNeeds(ctx.rounds || [], ctx.SG, ctx.MYGAME, ctx.bl, now), logs = (ctx.logs || []).filter(function (e) { return e && e.min > 0 && Date.parse(e.date) <= now + DAY; });
    var keys = ctx.MYGAME.SPOKES.map(function (s) { return s.k; }), test = ctx.test, tAge = test ? (now - Date.parse(test.date)) / DAY : Infinity;
    var tw = test ? CFG.testW * Math.max(0, 1 - tAge / (7 * CFG.testWeeks)) : 0;
    // 1. need
    needValues(A, keys, test, tw);
    // 2. cause – rounds, then the test's notes; agreeing on the same fault = surer
    var F = roundFindings(A);
    if (test && tw > 0) (test.coach || []).forEach(function (n) { var k = TEST_NOTE[n.k]; if (!k) return; var f = fam(k, n.text), cur = F[k];
      var tsrc = 'your skill test (' + dstr(Date.parse(test.date)) + ')';
      if (cur && cur.fam && cur.fam.split(':')[1] === f.split(':')[1]) { cur.conf = Math.min(1, cur.conf + 0.25); cur.why += ' – and your test agrees'; cur.src = 'both'; if (cur.source && cur.source.indexOf('skill test') < 0) cur.source += ' and ' + tsrc; }
      else if (!cur || cur.conf < 0.55) F[k] = { k: k, focus: GENERIC[k].split(' – ')[0] + ' – ' + (n.k === 'brk' ? 'reading break' : n.k === 'speed' ? 'speed on slopes' : n.k === 'flop' ? 'high, soft shots' : f.split(':')[1] !== 'x' ? 'finishing ' + f.split(':')[1] : 'from your test'), why: 'Your test: ' + String(n.text).replace(/\.$/, ''), conf: 0.6, src: 'test', fam: f, source: 'From ' + tsrc }; });
    // 3–4. momentum and feedback
    var TR = {}; ((ctx.trends && ctx.trends.areas) || []).forEach(function (t) { TR[t.k] = t; });
    var L21 = logs.filter(function (e) { return now - Date.parse(e.date) <= 21 * DAY; });
    keys.forEach(function (k) { var a = A[k], t = TR[TREND_K[k]], m = 1, notes = [];
      if (t && t.ok && t.heading) { m *= 1.3; notes.push('slipping in Trends'); } else if (t && t.ok && t.link) m *= 1.1;
      var mine = L21.filter(function (e) { return e.spoke === k; }), off = mine.filter(function (e) { return e.feel === 'off'; }).length, great = mine.filter(function (e) { return e.feel === 'great'; }).length;
      if (off >= 2 && !great) { m *= 1.1; notes.push('your last sessions felt off'); }
      a.typeTip = mine.length >= 3 && great >= Math.ceil(mine.length * 0.67) && mine.every(function (e) { return !e.type || e.type === 'reps'; }) ? 'Feels easy on plain reps – try a game or pressure version' : '';
      var f = F[k]; a.focus = f ? f.focus : GENERIC[k]; a.why = f ? f.why : ''; a.conf = f ? f.conf : 0.3; a.src = f ? f.src : ''; a.source = f ? f.source || '' : ''; a.rec = f ? f.rec || null : null;
      // v233 (Scott): the strokes check – the latest round (9+ holes, 3+ shots here) against the longer, half-life-weighted average
      var need = a.lost, ls = a.last, lp = ls && ls.n >= CFG.recAreaShots && a.nRounds >= 3 ? ls.per : null; a.recNeed = 0;
      if (lp != null && lp <= -CFG.recLost && lp <= (a.perRound || 0) - CFG.recGap) { need = Math.max(need, -lp * CFG.recLastShare); a.recNeed = 1;
        if (!a.rec) a.rec = { dir: 'worse', text: 'Last round: about ' + (-lp).toFixed(1) + ' strokes lost here – more than usual' }; }
      else if (lp != null && a.lost >= CFG.recBetterLost && lp >= -0.1) { m *= CFG.recBetterMult; a.recNeed = -1;
        if (!a.rec) a.rec = { dir: 'better', text: 'Last round: ' + (lp >= 0.1 ? 'gained about ' + lp.toFixed(1) + ' strokes here' : 'about even here') + ' – may be turning around' }; }
      a.need2 = need; a.score = (need + 0.05) * (0.7 + 0.6 * a.conf) * m; a.notes = notes; });
    // tournament
    var t0 = new Date(now); t0.setHours(12, 0, 0, 0);
    var tour = null; if (ctx.tour && ctx.tour.date) { var td = Math.round((Date.parse(ctx.tour.date + 'T12:00:00') - t0.getTime()) / DAY); // whole days, local
      if (td >= 0) { var sharpen = !!ctx.tour.big && td <= CFG.sharpenDays; tour = { date: ctx.tour.date, big: !!ctx.tour.big, days: td, mode: sharpen ? 'sharpen' : 'normal',
        msg: !ctx.tour.big ? (td <= CFG.sharpenDays ? 'Tournament ' + (td === 0 ? 'today' : td === 1 ? 'tomorrow' : 'in ' + td + ' days') + ' – practice as normal.' : '') :
          td === 0 ? 'Tournament day – a short warm-up: a few lag putts, short putts, chips and wedges. Trust it.' :
          td === 1 ? 'Tomorrow\'s the big one – keep today light: lag putts for speed, some short putts, a few chips and wedges.' :
          sharpen ? 'Big tournament in ' + td + ' days – sharpening: putting speed, short game and wedge distances. No new swing changes.' : '' };
        if (sharpen) keys.forEach(function (k) { A[k].score *= SHARPEN[k]; }); } }
    // 5. coach homework – stays at the top for its area
    var coach = {}; logs.filter(function (e) { return e.kind === 'lesson'; }).forEach(function (e) { var age = (now - Date.parse(e.date)) / DAY, keep = e.change === 'big' ? CFG.coachBigDays : CFG.coachTuneDays;
      if (age <= keep && (!coach[e.spoke] || Date.parse(coach[e.spoke].date) < Date.parse(e.date))) coach[e.spoke] = e; });
    // the time: your average week over the last 30 days
    var m30 = logs.filter(function (e) { return now - Date.parse(e.date) <= 30 * DAY; }).reduce(function (t, e) { return t + e.min; }, 0), B = m30 * 7 / 30, fromLogs = B >= CFG.minWeekMin;
    if (!fromLogs) B = CFG.defaultWeekMin;
    // v205 (Scott): a starting baseline – "your typical week" – until real practice takes over: real logs count by how many days
    // they cover (a week of logging = ¼ real, four weeks = all real), so the number doesn't jump around
    var typ = ctx.typical && ctx.typical.weekMin > 0 ? ctx.typical.weekMin : null, firstLog = logs.reduce(function (m, e) { var t = Date.parse(e.date); return t < m ? t : m; }, Infinity);
    var realF = firstLog === Infinity ? 0 : Math.max(0, Math.min(1, (now - firstLog) / DAY / 28)), budgetFrom = fromLogs ? '30 days' : 'default';
    if (typ != null && realF < 1) { B = realF * (m30 * 7 / Math.min(30, Math.max(1, (now - firstLog) / DAY + 1))) + (1 - realF) * typ; budgetFrom = realF > 0 ? 'blend' : 'typical'; }
    // v208 (Scott): balance by group – Putting, Short game, Wedges, Full swing. Each gets at least 20 % of the week; the spare 20 %
    // goes to the biggest leak (or leaks: two → 30/30/20/20) and fades back to even over 4 weeks (40 → 35 → 30 → 25). A new round
    // or test that still shows the same leak tops it back up; a lesson's homework counts as a leak while it's active.
    var BAL = balance(ctx, keys, A, coach, cs0(coach, tour), tour, now), sh = BAL.share;
    var cs = cs0(coach, tour);
    // v216 (Scott): what's still needed THIS week (Monday to Sunday), the same week the "This week" card shows – an area whose target
    // is met drops off the list, whatever was done before. Half of last week's shortfall carries over, so a week that skipped something
    // starts with it near the top (only once there's practice logged before this week – a new player starts clean).
    var today = new Date(now); today.setHours(0, 0, 0, 0);
    var wkStart = today.getTime() - ((today.getDay() + 6) % 7) * DAY, lastStart = wkStart - 7 * DAY, daysLeft = 7 - (today.getDay() + 6) % 7;
    var before = logs.some(function (e) { return Date.parse(e.date) < wkStart; });
    var items = keys.map(function (k) { var a = A[k], wk = sh[k] * B, did = 0, lastDid = 0, doneToday = false, last = null;
      logs.forEach(function (e) { if (e.spoke !== k) return; var t = Date.parse(e.date), m = e.min * (e.min >= CFG.longSession ? CFG.longSessionW : 1);
        if (t >= wkStart) did += m; else if (t >= lastStart) lastDid += m; if (t >= today.getTime()) doneToday = true; if (last == null || t > last) last = t; });
      var carry = before ? Math.min(wk, Math.max(0, wk - lastDid)) * CFG.carry : 0;
      var owed = Math.max(-wk, wk - did + carry), c = coach[k] && cs.indexOf(k) >= 0 ? coach[k] : null;
      var ld = last == null ? null : Math.floor((now - last) / DAY);
      var rsrc = a.nRounds ? 'From strokes gained in your ' + (a.nRounds === 1 ? 'last round' : 'last ' + a.nRounds + ' rounds (since ' + dstr(a.since) + ') – recent ones count more') + (tw > 0 && a.testVal != null ? ', and your skill test' : '') : tw > 0 && a.testVal != null ? 'From your skill test (' + dstr(Date.parse(test.date)) + ')' : '';
      if (!a.why) a.source = a.lost >= 0.15 ? rsrc : ld == null || ld >= 10 ? 'From your practice log' : a.notes.length ? 'From Trends' : '';
      if (!a.why && a.recNeed === 1 && a.lost < 0.15) { a.source = rsrc; a.why = 'Fine on average – but not in your last round'; }
      if (!a.why) a.why = a.lost >= 0.15 ? 'About ' + (Math.round(a.lost * 10) / 10).toFixed(1) + ' strokes a round lost here' + (a.notes.length ? ' – ' + a.notes.join(', ') : '') :
        ld == null ? 'Not practised yet – a little keeps it sharp' : ld >= 10 ? 'Not practised in ' + ld + ' days – a little keeps it sharp' : a.notes.length ? cap(a.notes.join(', ')) : '';
      return { k: k, name: a.name, focus: c ? 'Coach: ' + (c.what || 'lesson') + (c.coach ? ' (' + c.coach + ')' : '') : a.focus, why: c ? 'Lesson homework from ' + new Date(Date.parse(c.date)).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + (c.change === 'big' ? ' – a big change takes reps' : '') + (a.focus !== GENERIC[k] ? '. The numbers: ' + a.focus.toLowerCase() : '') : a.why,
        source: c ? 'From your lesson log' : a.source || '', rec: c ? null : a.rec || null,
        coach: !!c, src: a.src, conf: a.conf, lost: a.lost, score: a.score, weekMin: Math.round(wk), owed: Math.round(owed), doneToday: doneToday, lastDays: last == null ? null : Math.floor((now - last) / DAY),
        maint: !c && a.need2 < 0.1, // v233: a clearly bad last round counts too // nothing lost there – a "keep it sharp" item, after the real needs
        min: Math.max(10, Math.min(tour && tour.mode === 'sharpen' ? (SHARPEN[k] < 1 ? 15 : 25) : 40, r5(daysLeft <= 2 ? owed : Math.max(owed / 2, wk / 3)))), notes: a.notes, typeTip: a.typeTip,
        weekDone: Math.round(did), carry: Math.round(carry) };
    });
    // sharpening week: the order leans to putting, short game and wedges too (not only the minutes)
    // v216: how far behind each area is against its own week (1 = nothing done yet, 1.5 = also skipped last week), then the minutes
    var key = function (x) { return (Math.round(x.owed / Math.max(1, x.weekMin) * 20) / 20 + x.owed / 1e4) * (tour && tour.mode === 'sharpen' ? SHARPEN[x.k] : 1); };
    // coach homework stays on the list while it's active (one item per lesson, its areas together)
    var due = function (x) { return x.owed > Math.min(CFG.owedMin, x.weekMin * 0.4); }; // v204: relative to its share, so a light practice week still lists things
    var open = items.filter(function (x) { return due(x) || x.coach; }).sort(function (a, b) { return (b.coach - a.coach) || (a.doneToday - b.doneToday) || (a.maint - b.maint) || (key(b) - key(a)) || (b.score - a.score); });
    var byLesson = {}; open = open.filter(function (x) { if (!x.coach) return true; var c = coach[x.k], id = c.lesson || c.id; if (!byLesson[id]) { byLesson[id] = x; x.areas = [x.name]; return true; }
      var m = byLesson[id]; m.areas.push(x.name); m.min = Math.max(m.min, x.min); m.doneToday = m.doneToday && x.doneToday; return false; });
    open.forEach(function (x) { if (x.coach && x.areas.length > 1) x.name = x.areas.join(', ').replace(/, ([^,]*)$/, ' and $1'); });
    var done = items.filter(function (x) { return !due(x) && !x.coach; }).sort(function (a, b) { return (b.doneToday - a.doneToday) || ((a.lastDays == null ? 999 : a.lastDays) - (b.lastDays == null ? 999 : b.lastDays)); });
    var ahead = !open.length, extra = ahead ? items.slice().sort(function (a, b) { return (b.lastDays == null ? 999 : b.lastDays) - (a.lastDays == null ? 999 : a.lastDays); })[0] : null;
    // v204 (Scott: "it's empty, nothing to click"): never fewer than 3 – top up with the most needed of the rest, marked "when you have time"
    var nNeed = open.length; if (open.length < 3) done.slice().sort(function (a, b) { return (b.score - a.score) || ((b.lastDays == null ? 999 : b.lastDays) - (a.lastDays == null ? 999 : a.lastDays)); })
      .slice(0, 3 - open.length).forEach(function (x) { x.optional = true; x.min = Math.max(10, Math.min(tour && tour.mode === 'sharpen' ? 25 : 40, r5(x.weekMin / 2))); open.push(x); });
    var weekMin = {}; items.forEach(function (x) { weekMin[x.k] = x.weekMin; }); // v205: each area's weekly target, for the "This week" bars
    return { budget: Math.round(B), budgetFrom: budgetFrom, realShare: realF, weekMin: weekMin, due: nNeed, items: open.slice(0, CFG.maxItems), more: open.slice(CFG.maxItems), done: done, ahead: ahead, extra: extra, tour: tour, areas: A, groups: BAL.groups, cfg: CFG };
  }

  // v205 (Scott): "how much time do you have?" – today's session from the top of the list: at most 3 items, at least 10 min each,
  // split by what they're owed (or a third of their week), in 5-minute steps, adding up to the time you have
  function session(P, T) {
    T = Math.max(10, Math.round(T || 0)); var L = (P.items || []).filter(function (x) { return x.min > 0; }), n = Math.max(1, Math.min(3, Math.floor(T / 10), L.length)); if (!L.length) return [];
    var pick = L.slice(0, n), w = pick.map(function (x) { return Math.max(1, x.owed > 0 ? x.owed : x.weekMin / 3); }), tw = w.reduce(function (t, v) { return t + v; }, 0);
    var mins = w.map(function (v) { return Math.max(10, Math.round(T * v / tw / 5) * 5); }), diff = T - mins.reduce(function (t, v) { return t + v; }, 0);
    for (var g = 0; diff !== 0 && g < 40; g++) { var j = diff > 0 ? 0 : mins.indexOf(Math.max.apply(null, mins)); var step = Math.abs(diff) >= 5 ? 5 : Math.abs(diff); if (diff < 0 && mins[j] - step < 10) break; mins[j] += diff > 0 ? step : -step; diff += diff > 0 ? -step : step; }
    return pick.map(function (x, i) { return { k: x.k, name: x.name, focus: x.focus, min: mins[i], coach: x.coach }; });
  }
  // v205: a week's practice against each area's target (Monday to Sunday); off = 0 this week, 1 last week…
  function week(P, logs, now, off) {
    var d = new Date(now); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) - 7 * (off || 0)); var a = d.getTime(), b = a + 7 * DAY, did = {}, tot = 0;
    (logs || []).forEach(function (e) { var t = Date.parse(e.date); if (t >= a && t < b && e.min > 0) { did[e.spoke] = (did[e.spoke] || 0) + e.min; tot += e.min; } });
    var rows = Object.keys(P.weekMin).map(function (k) { return { k: k, name: (P.areas[k] || {}).name || k, target: Math.max(5, Math.round(P.weekMin[k] / 5) * 5), done: did[k] || 0 }; })
      .sort(function (x, y) { return y.target - x.target; });
    return { start: a, end: b - 1, rows: rows, done: tot, target: rows.reduce(function (t, r) { return t + r.target; }, 0) };
  }
  var api = { CFG: CFG, GROUPS: GROUPS, build: build, session: session, week: week, roundFindings: roundFindings, areaNeeds: areaNeeds, GENERIC: GENERIC };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PLAN = api;
})(this);
