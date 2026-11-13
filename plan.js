/* plan.js – v203 (Scott): the practice plan. Not a weekly schedule: a ranked "Practice next" list – the practice that's
 * most needed first, each item an area + one focus + minutes + a one-line reason. Do the top item whenever there's time.
 *
 * 1. NEED – strokes lost per round against your benchmark, per area, from rounds (recent ones count more, tournament
 *    rounds ×1.5, few shots pulled toward "even") blended with the last short game test (fading over 6 weeks).
 * 2. CAUSE – pattern detectors on rounds (miss direction, short / long, penalties, stayed in the bunker, lag speed, start
 *    line, high / low side using the putt's read) and the test's own notes. Rounds and test agreeing = the strongest focus.
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
    halfLifeDays: 45, tourW: 1.5, testWeeks: 6, testW: 0.6, defaultWeekMin: 120, minWeekMin: 30, windowDays: 14, owedHalfLife: 7,
    owedMin: 5, longSession: 75, longSessionW: 0.85, floorShare: 0.05, maxShare: 0.4, lean: 0.65,
    coachBigDays: 28, coachTuneDays: 14, coachShare: 0.3, sharpenDays: 7, maxItems: 5,
    groupFloor: 0.2, fadeWeeks: 3, leakMin: 0.5, leakShare: 0.35, leakNear: 0.7, areaInGroup: 0.25, coachInGroup: 0.75 // v208: the balance
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
  function fam(k, text) { var m = /\b(short|long|low|high|left|right|in the sand|over)\b/.exec(String(text || '').toLowerCase()); return k + ':' + (m ? m[1] : 'x'); }

  // ---- 1. need: strokes per round vs the benchmark, per area ----
  function areaNeeds(rounds, SG, MYGAME, bl, now) {
    var A = {}; MYGAME.SPOKES.forEach(function (sp) { A[sp.k] = { k: sp.k, name: sp.name, need: sp.need, sg: 0, n: 0, wr: 0, shots: [] }; });
    var W = 0;
    rounds.forEach(function (r) {
      var S; try { S = SG.summarize(r, bl); } catch (e) { return; } if (!S || !S.holesDone) return;
      var age = Math.max(0, (now - Date.parse(r.date)) / DAY), w = Math.pow(0.5, age / CFG.halfLifeDays) * (MYGAME.playOf && MYGAME.playOf(r) === 'tournament' ? CFG.tourW : 1);
      W += w * S.holesDone / 18;
      S.holes.forEach(function (h) { (h.shots || []).forEach(function (s, i) { if (s.layup) return; var nx = h.shots[i + 1];
        for (var j = 0; j < MYGAME.SPOKES.length; j++) if (MYGAME.SPOKES[j].test(s)) { var a = A[MYGAME.SPOKES[j].k]; a.sg += w * s.sg; a.n++; a.shots.push({ s: s, nx: nx, age: age, tour: w > 1.01 }); break; } }); });
    });
    Object.keys(A).forEach(function (k) { var a = A[k]; a.perRound = W ? a.sg / W : null; a.perRoundShots = W ? a.n / Math.max(1, rounds.length) : null; a.wr = a.n / (a.n + a.need); });
    return A;
  }

  // ---- 2. cause: what the rounds say ----
  function roundFindings(A) {
    var F = {}, push = function (k, focus, why, x, n, f) { var c = conf(x, n); if (!F[k] || F[k].conf < c) F[k] = { k: k, focus: focus, why: why, conf: c, src: 'rounds', fam: f }; };
    var recent = function (k) { return A[k].shots.filter(function (x) { return x.age <= 120; }); };
    // driving: which side the missed fairways go, and penalties
    var T = recent('drive'), L = 0, R = 0, pen = 0; T.forEach(function (x) { var e = x.s.end || {}; if (x.s.ob || (x.s.pen && x.s.pen !== 'none')) pen++; if (e.lie && e.lie !== 'fairway') { if (x.s.side === 'left' || has(x.s.dir, 'left')) L++; else if (x.s.side === 'right' || has(x.s.dir, 'right')) R++; } });
    var l = lean(L, R, 6); if (l != null) push('drive', 'Tee shots missing ' + (l ? 'right' : 'left'), (l ? R : L) + ' of ' + (L + R) + ' missed fairways went ' + (l ? 'right' : 'left'), (l ? R : L) / (L + R), L + R, 'drive:' + (l ? 'right' : 'left'));
    if (pen >= 3 && pen / Math.max(1, T.length) >= 0.08) push('drive', 'Keeping it in play off the tee', pen + ' penalty shots off the tee lately', 0.75 + Math.min(0.2, pen / 40), pen + 6, 'drive:pen');
    // approaches (irons) and wedges: short / long and left / right of the green
    [['irons', 'Approaches'], ['wedges', 'Wedges']].forEach(function (g) {
      var S = 0, Lg = 0, Lf = 0, Rt = 0; recent(g[0]).forEach(function (x) { var e = x.s.end || {}; if (e.lie === 'green' || e.lie === 'holed') return; var d = x.s.dir;
        if (has(d, 'short')) S++; else if (has(d, 'long')) Lg++; if (has(d, 'left')) Lf++; else if (has(d, 'right')) Rt++; });
      var a = lean(S, Lg, 5), b = lean(Lf, Rt, 6);
      if (a != null) push(g[0], g[1] + ' finishing ' + (a ? 'long' : 'short'), (a ? Lg : S) + ' of ' + (S + Lg) + ' missed greens were ' + (a ? 'long' : 'short'), (a ? Lg : S) / (S + Lg), S + Lg, g[0] + ':' + (a ? 'long' : 'short'));
      if (b != null) push(g[0], g[1] + ' missing ' + (b ? 'right' : 'left'), (b ? Rt : Lf) + ' of ' + (Lf + Rt) + ' missed greens went ' + (b ? 'right' : 'left'), (b ? Rt : Lf) / (Lf + Rt), Lf + Rt, g[0] + ':' + (b ? 'right' : 'left'));
    });
    // chipping: leaving it short or running it past
    var cs = 0, cl = 0; recent('chip').forEach(function (x) { if ((x.s.end || {}).lie === 'holed') return; if (has(x.s.dir, 'short')) cs++; else if (has(x.s.dir, 'long')) cl++; });
    var c = lean(cs, cl, 5); if (c != null) push('chip', 'Chips finishing ' + (c ? 'long' : 'short'), (c ? cl : cs) + ' of ' + (cs + cl) + ' chips finished ' + (c ? 'past' : 'short of') + ' the hole', (c ? cl : cs) / (cs + cl), cs + cl, 'chip:' + (c ? 'long' : 'short'));
    // bunker: still in the sand
    var B = recent('bunker'), stay = B.filter(function (x) { return (x.s.end || {}).lie === 'bunker'; }).length;
    if (B.length >= 4 && stay >= 2 && stay / B.length >= 0.25) push('bunker', 'Getting out first time', stay + ' of ' + B.length + ' bunker shots stayed in the sand', 0.6 + stay / B.length * 0.4, B.length + 4, 'bunker:in the sand');
    // lag putts (20 ft+): speed, and speed by slope when the read is entered
    var P = recent('lag').filter(function (x) { return x.s.start.dist >= 20 && (x.s.end || {}).lie !== 'holed'; }), ps = 0, pl = 0, dn = [0, 0], up = [0, 0];
    P.forEach(function (x) { var sh = has(x.s.dir, 'short'), lo = has(x.s.dir, 'long'); if (sh) ps++; else if (lo) pl++; var sl = String(x.s.rd || '').split('-')[0];
      if (sl === 'down') { if (lo) dn[1]++; else if (sh) dn[0]++; } if (sl === 'up') { if (sh) up[0]++; else if (lo) up[1]++; } });
    var p = lean(ps, pl, 6); if (p != null) push('lag', 'Lag speed – finishing ' + (p ? 'long' : 'short'), (p ? pl : ps) + ' of ' + (ps + pl) + ' first putts from 20 ft+ finished ' + (p ? 'long' : 'short'), (p ? pl : ps) / (ps + pl), ps + pl, 'lag:' + (p ? 'long' : 'short'));
    if (dn[0] + dn[1] >= 4 && dn[1] / (dn[0] + dn[1]) >= CFG.lean) push('lag', 'Downhill speed', dn[1] + ' of ' + (dn[0] + dn[1]) + ' downhill lag putts ran long', dn[1] / (dn[0] + dn[1]) + 0.05, dn[0] + dn[1] + 4, 'lag:long');
    if (up[0] + up[1] >= 4 && up[0] / (up[0] + up[1]) >= CFG.lean) push('lag', 'Uphill speed', up[0] + ' of ' + (up[0] + up[1]) + ' uphill lag putts came up short', up[0] / (up[0] + up[1]) + 0.05, up[0] + up[1] + 4, 'lag:short');
    // short putts (under 10 ft) missed: start line, and the high / low side on breaking putts
    var M = recent('short').filter(function (x) { return (x.s.end || {}).lie !== 'holed'; }), ml = 0, mr = 0, hi = 0, lo2 = 0;
    M.forEach(function (x) { var lf = has(x.s.dir, 'left'), rt = has(x.s.dir, 'right'), br = String(x.s.rd || '').split('-')[1];
      if (br === 'r' || br === 'l') { if ((br === 'r' && lf) || (br === 'l' && rt)) hi++; else if (lf || rt) lo2++; } else if (lf) ml++; else if (rt) mr++; });
    var s = lean(ml, mr, 6); if (s != null) push('short', 'Short putts – start line (missing ' + (s ? 'right' : 'left') + ')', (s ? mr : ml) + ' of ' + (ml + mr) + ' missed straight putts went ' + (s ? 'right' : 'left'), (s ? mr : ml) / (ml + mr), ml + mr, 'short:' + (s ? 'right' : 'left'));
    var b2 = lean(hi, lo2, 5); if (b2 != null) push('short', b2 ? 'Reading break – missing low' : 'Reading break – missing high', (b2 ? lo2 : hi) + ' of ' + (hi + lo2) + ' missed breaking putts were on the ' + (b2 ? 'low' : 'high') + ' side' + (b2 ? ' – play more break' : ' – firmer, or less break'), (b2 ? lo2 : hi) / (hi + lo2) + 0.05, hi + lo2 + 2, 'short:' + (b2 ? 'low' : 'high'));
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
      if (cur && cur.fam && cur.fam.split(':')[1] === f.split(':')[1]) { cur.conf = Math.min(1, cur.conf + 0.25); cur.why += ' – and your test agrees'; cur.src = 'both'; }
      else if (!cur || cur.conf < 0.55) F[k] = { k: k, focus: GENERIC[k].split(' – ')[0] + ' – ' + (n.k === 'brk' ? 'reading break' : n.k === 'speed' ? 'speed on slopes' : n.k === 'flop' ? 'high, soft shots' : f.split(':')[1] !== 'x' ? 'finishing ' + f.split(':')[1] : 'from your test'), why: 'Your test: ' + String(n.text).replace(/\.$/, ''), conf: 0.6, src: 'test', fam: f }; });
    // 3–4. momentum and feedback
    var TR = {}; ((ctx.trends && ctx.trends.areas) || []).forEach(function (t) { TR[t.k] = t; });
    var L21 = logs.filter(function (e) { return now - Date.parse(e.date) <= 21 * DAY; });
    keys.forEach(function (k) { var a = A[k], t = TR[TREND_K[k]], m = 1, notes = [];
      if (t && t.ok && t.heading) { m *= 1.3; notes.push('slipping in Trends'); } else if (t && t.ok && t.link) m *= 1.1;
      var mine = L21.filter(function (e) { return e.spoke === k; }), off = mine.filter(function (e) { return e.feel === 'off'; }).length, great = mine.filter(function (e) { return e.feel === 'great'; }).length;
      if (off >= 2 && !great) { m *= 1.1; notes.push('your last sessions felt off'); }
      a.typeTip = mine.length >= 3 && great >= Math.ceil(mine.length * 0.67) && mine.every(function (e) { return !e.type || e.type === 'reps'; }) ? 'Feels easy on plain reps – try a game or pressure version' : '';
      var f = F[k]; a.focus = f ? f.focus : GENERIC[k]; a.why = f ? f.why : ''; a.conf = f ? f.conf : 0.3; a.src = f ? f.src : '';
      a.score = (a.lost + 0.05) * (0.7 + 0.6 * a.conf) * m; a.notes = notes; });
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
    // owed time: the last 14 days of "should have" minus what you did, recent days counting more
    var dw = function (d) { return d < 0 || d >= CFG.windowDays ? 0 : Math.pow(0.5, d / CFG.owedHalfLife); }, sumW = 0; for (var d = 0; d < CFG.windowDays; d++) sumW += dw(d);
    var today = new Date(now); today.setHours(0, 0, 0, 0);
    var items = keys.map(function (k) { var a = A[k], wk = sh[k] * B, did = 0, doneToday = false, last = null;
      logs.forEach(function (e) { if (e.spoke !== k) return; var t = Date.parse(e.date), dd = Math.floor((today.getTime() + DAY - 1 - t) / DAY); if (dd < 0) dd = 0;
        did += dw(dd) * e.min * (e.min >= CFG.longSession ? CFG.longSessionW : 1); if (t >= today.getTime()) doneToday = true; if (last == null || t > last) last = t; });
      var owed = Math.max(-wk, wk / 7 * sumW - did), c = coach[k] && cs.indexOf(k) >= 0 ? coach[k] : null;
      var ld = last == null ? null : Math.floor((now - last) / DAY);
      if (!a.why) a.why = a.lost >= 0.15 ? 'About ' + (Math.round(a.lost * 10) / 10).toFixed(1) + ' strokes a round lost here' + (a.notes.length ? ' – ' + a.notes.join(', ') : '') :
        ld == null ? 'Not practised yet – a little keeps it sharp' : ld >= 10 ? 'Not practised in ' + ld + ' days – a little keeps it sharp' : a.notes.length ? cap(a.notes.join(', ')) : '';
      return { k: k, name: a.name, focus: c ? 'Coach: ' + (c.what || 'lesson') + (c.coach ? ' (' + c.coach + ')' : '') : a.focus, why: c ? 'Lesson homework from ' + new Date(Date.parse(c.date)).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + (c.change === 'big' ? ' – a big change takes reps' : '') + (a.focus !== GENERIC[k] ? '. The numbers: ' + a.focus.toLowerCase() : '') : a.why,
        coach: !!c, src: a.src, conf: a.conf, lost: a.lost, score: a.score, weekMin: Math.round(wk), owed: Math.round(owed), doneToday: doneToday, lastDays: last == null ? null : Math.floor((now - last) / DAY),
        maint: !c && a.lost < 0.1, // nothing lost there – a "keep it sharp" item, after the real needs
        min: Math.max(10, Math.min(tour && tour.mode === 'sharpen' ? (SHARPEN[k] < 1 ? 15 : 25) : 40, r5(Math.max(owed, wk / 3)))), notes: a.notes, typeTip: a.typeTip };
    });
    // sharpening week: the order leans to putting, short game and wedges too (not only the minutes)
    var key = function (x) { return x.owed * (tour && tour.mode === 'sharpen' ? SHARPEN[x.k] : 1); };
    // coach homework stays on the list while it's active (one item per lesson, its areas together)
    var due = function (x) { return x.owed > Math.min(CFG.owedMin, x.weekMin * 0.4); }; // v204: relative to its share, so a light practice week still lists things
    var open = items.filter(function (x) { return due(x) || x.coach; }).sort(function (a, b) { return (b.coach - a.coach) || (a.maint - b.maint) || (key(b) - key(a)) || (b.score - a.score); });
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
