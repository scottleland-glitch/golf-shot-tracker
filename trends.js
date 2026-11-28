// Strokewise – Trends (v194, Scott): does practice show up on the course, and where is each area heading?
// Pure maths, no DOM. For each practice area (and total practice vs score) it lines up weeks of
// strokes gained from rounds with logged practice, finds how many weeks practice takes to show up (0–3),
// measures the link (Spearman r), and forecasts the next weeks:
//   expected = (1 − w) × (recent form + b × (practice at the lag − normal practice)) + w × (short game test)
//   b = your own strokes per extra weekly hour (from your history), w = test weight fading to 0 over 3 weeks.
// The band is practice ±25 % of your normal (at least ±15 min, never above your busiest week on record).
// v195 (Scott): practice has a memory. A second model keeps a practice STOCK per area: each week adds that week's
// practice and the stock fades with a half-life (2, 4 or 8 weeks – whichever fits you best), so last month's work still
// counts (remanence / residual effect) and skill builds and fades at its own pace (hysteresis). Strokes follow
// log(1 + stock), so the first hours are worth more than the next (diminishing returns, the power law of practice).
// Effective hours weight HOW you practised (path dependence): spread over more days counts a little more (spacing effect),
// Game / pressure practice a little more and plain Reps a little less (contextual interference). A lesson marked as a big
// change (new grip, posture…) discounts the old stock in those areas and expects a dip then recovery (a gamma-shaped curve,
// deepest ~2 weeks in, mostly gone by 8). How a session felt is a third, weak signal: it is only used once your feel has
// been shown to line up with your next rounds. Each week the model that would have predicted your past weeks better wins –
// the old one stays unless the new one beats it.
// v196 (Scott): the first forecast comes at 4 weeks, with low confidence. Until then: just the lines. The practice effect
// is held back toward "no effect" (shrunk by weeks / (weeks + 4)) so a few lucky weeks can't fake a link, and the forecast
// band is the LIKELY RANGE – your typical miss (from the backtest, or your week-to-week swing before there is one), wider
// further ahead and wider while there are fewer than 10 weeks. Confidence: low under 6 weeks, medium to 10, high after
// (high also needs the backtest to have run).
// v197 (Scott): rounds count, not just weeks. A week with two rounds is two readings: weeks are weighted by their rounds
// (holes ÷ 18) in the fits and in recent form (half-life 4 ROUNDS), and the thresholds are in rounds: the first forecast
// after 4 rounds spread over 3+ weeks, low confidence under 6 rounds, medium to 10, high after. Shrink = rounds / (rounds + 6);
// the band is ×(1 + (10 − rounds) / 6) wide until 10 rounds (twice as wide at 4). A week counts at most 3 rounds, so one
// busy week can't outweigh the rest. Each week keeps its rounds (course, date, score, strokes gained per area) for a tap.
// v218 (Scott): the forecast is now ONE dashed line, 3 weeks out (a week past the ~2-week practice lag). No band, no confidence,
// no ±practice lines, no stock / lag / dip models. The line at f weeks ahead:
//   level(f) = (1 − γ(f)) × form + γ(f) × test           form: recent strokes gained, newest counting most (half-life 4 rounds);
//                                                        tournament rounds count fully, practice rounds half
//   γ(f) = 50 % on the test day, easing to 25 % at 4 weeks and staying there until the next test (areas with a test only)
//   line(f) = level(f) + practice(f) + feel(f)
//   practice(f) = b × room × (last 2 weeks' practice − your normal week) × min(1, f / 2)
//     b: strokes per round per extra weekly hour – starts at 0.1 (0.25 for the score) and your own history (practice 2 weeks
//        earlier vs your rounds) takes over as the pairs build up: (m × yours + 6 × start) / (m + 6), never below 0
//     room: 1 + strokes you're losing in that area (vs your benchmark), up to 2× – extra work on a weakness counts more
//   feel(f): how the last 2 weeks felt (−1…+1) × a fifth of one extra hour's worth – a light nudge
(function (root) {
  'use strict';
  function nH(S) { return S.statHoles == null ? S.holesDone : S.statHoles; } // v254: holes that count in stats (older summaries: all)
  var DAY = 86400000, WEEK = 7 * DAY;
  var AREAS = [ // practice area → strokes gained area(s) from rounds (MYGAME spoke keys)
    { k: 'drive', name: 'Driving', spokes: ['drive'] },
    { k: 'irons', name: 'Irons 100+', spokes: ['irons'] },
    { k: 'wedges', name: 'Wedges', spokes: ['wedges'] },
    { k: 'chip', name: 'Chipping', spokes: ['chip'] },
    { k: 'bunker', name: 'Bunker', spokes: ['bunker'] },
    { k: 'putt', name: 'Putting', spokes: ['lag', 'short'] }
  ];
  var CFG = { line: 3, gamma0: 0.5, gammaMin: 0.25, gammaDays: 28, b0: 0.1, b0Total: 0.25, bMax: 0.6, bMaxTotal: 1.5, priorPairs: 6, roomMax: 2, roomPer: 1, feelPart: 0.2, practiceRound: 0.5, lineRounds: 3, rampWeeks: 2,
    weeks: 26, minWeeks: 3, minRounds: 3, midRounds: 6, fullRounds: 10, priorR: 6, maxPerWeek: 3, maxLag: 3, ahead: 3, bandPct: 0.25, bandMinH: 0.25, testMax: 0.5, testDays: 21, halfLife: 4, minR: 0.2, slipWeeks: 2,
    typeW: { reps: 0.85, mixed: 1, game: 1.15 }, spaceW: [0.9, 1, 1.05] };
  var FEEL = { off: -1, ok: 0, great: 1 };

  function monday(t) { var d = new Date(t); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return d.getTime(); }
  function mean(a) { var v = a.filter(function (x) { return x != null && !isNaN(x); }); return v.length ? v.reduce(function (s, x) { return s + x; }, 0) / v.length : null; }
  function sd(a) { var m = mean(a); if (m == null) return null; var v = a.filter(function (x) { return x != null; }); return Math.sqrt(v.reduce(function (s, x) { return s + (x - m) * (x - m); }, 0) / Math.max(1, v.length - 1)); }
  function ranks(a) { var s = a.map(function (v, i) { return [v, i]; }).sort(function (x, y) { return x[0] - y[0]; }), r = [];
    for (var k = 0; k < s.length;) { var j = k; while (j + 1 < s.length && s[j + 1][0] === s[k][0]) j++; for (var m = k; m <= j; m++) r[s[m][1]] = (k + j) / 2 + 1; k = j + 1; } return r; }
  function pearson(x, y) { var mx = mean(x), my = mean(y), n = 0, a = 0, b = 0;
    for (var i = 0; i < x.length; i++) { n += (x[i] - mx) * (y[i] - my); a += (x[i] - mx) * (x[i] - mx); b += (y[i] - my) * (y[i] - my); }
    return a && b ? n / Math.sqrt(a * b) : null; }
  function spearman(x, y) { return x.length >= 3 ? pearson(ranks(x), ranks(y)) : null; }
  // weighted versions (weights = rounds in the week)
  function wrms(a, w) { var s = 0, t = 0; for (var i = 0; i < a.length; i++) { s += w[i] * a[i] * a[i]; t += w[i]; } return t ? Math.sqrt(s / t) : null; }
  function wmean(a, w) { var s = 0, t = 0; for (var i = 0; i < a.length; i++) { s += a[i] * w[i]; t += w[i]; } return t ? s / t : null; }
  function wslope(x, y, w) { var sw = 0, mx = 0, my = 0, i; for (i = 0; i < x.length; i++) { sw += w[i]; mx += w[i] * x[i]; my += w[i] * y[i]; } if (!sw) return 0; mx /= sw; my /= sw;
    var n = 0, d = 0; for (i = 0; i < x.length; i++) { n += w[i] * (x[i] - mx) * (y[i] - my); d += w[i] * (x[i] - mx) * (x[i] - mx); } return d ? n / d : 0; }
  // recent form: newest first, each week's weight halves every CFG.halfLife ROUNDS played after it
  function ewmaR(a, wt, upto) { var num = 0, den = 0, k = 0; for (var i = upto; i >= 0; i--) { if (a[i] == null) continue; var w = wt[i] || 1, ww = w * Math.pow(0.5, k / CFG.halfLife); num += ww * a[i]; den += ww; k += w; } return den ? num / den : null; }
  function slope(x, y) { var mx = mean(x), my = mean(y), n = 0, d = 0; for (var i = 0; i < x.length; i++) { n += (x[i] - mx) * (y[i] - my); d += (x[i] - mx) * (x[i] - mx); } return d ? n / d : 0; }
  function smooth(a) { return a.map(function (_, i) { return mean(a.slice(Math.max(0, i - 1), i + 2)); }); }

  // ---- weekly series ----
  // rounds → per week: strokes gained per 18 for each spoke, and the 18-hole score
  function weekSeries(rounds, logs, SG, MYGAME, opts) {
    var now = opts.now == null ? Date.now() : +opts.now, nW = opts.weeks || CFG.weeks, m0 = monday(now) - (nW - 1) * WEEK;
    var wk = function (t) { var i = Math.round((monday(t) - m0) / WEEK); return i >= 0 && i < nW ? i : -1; };
    var W = []; for (var i = 0; i < nW; i++) W.push({ i: i, start: m0 + i * WEEK, list: [], holes: 0, wHoles: 0, rounds: 0, prRounds: 0, scoreW: [], sg: {}, n: {}, score: [], prac: {}, pracAll: 0, eff: {}, effAll: 0, days: {}, feel: {}, big: {}, lessons: [] });
    var SP = MYGAME.SPOKES;
    (rounds || []).forEach(function (r) {
      var t = Date.parse(r.date), i = isNaN(t) || t > now + DAY ? -1 : wk(t); if (i < 0) return;
      var S = SG.summarize(r, opts.bl); if (!S.holesDone) return;
      var w = W[i], rw = r.play === 'practice' ? CFG.practiceRound : 1; // v218: a practice round counts half
      var so = !!S.scoreOnly; w.holes += so ? 0 : nH(S); w.wHoles += so ? 0 : nH(S) * rw; /* v254: nH(S) – holes left out of stats don't count */ w.rounds += so ? 0 : 1; /* v242: a score-only round counts in the score line only */ if (rw < 1) w.prRounds++; var s18 = SG.score18 ? SG.score18(S) : (S.holesDone === 18 ? S.strokes : null); if (s18 != null) { w.score.push(s18); w.scoreW.push(rw * S.holesDone / 18); } // v219: a 9 counts half, doubled
      var R = { id: r.id, date: r.date, course: r.course || '', play: r.play || '', holes: nH(S), score: S.holesDone === 18 || (S.holesDone === 9 && S.holes.length === 9) ? S.strokes : null, sg: {}, n: {} }; R.s18 = s18; R.t = t; R.tour = r.play === 'tournament'; w.list.push(R); // v197: tap a week
      S.holes.forEach(function (h) { if (!h.done || h.off) return; h.shots.forEach(function (s) { if (s.layup) return;
        for (var k = 0; k < SP.length; k++) if (SP[k].test(s)) { w.sg[SP[k].k] = (w.sg[SP[k].k] || 0) + s.sg * rw; w.n[SP[k].k] = (w.n[SP[k].k] || 0) + 1; R.sg[SP[k].k] = (R.sg[SP[k].k] || 0) + s.sg; R.n[SP[k].k] = (R.n[SP[k].k] || 0) + 1; break; } }); });
    });
    (logs || []).forEach(function (e) { var t = Date.parse(String(e.date).length <= 10 ? e.date + 'T12:00:00' : e.date), i = isNaN(t) || t > now + DAY ? -1 : wk(t); if (i < 0 || !(e.min > 0)) return;
      var w = W[i], h = e.min / 60, q = CFG.typeW[e.type] || 1, sp = e.spoke;
      w.prac[sp] = (w.prac[sp] || 0) + h; w.pracAll += h; w.eff[sp] = (w.eff[sp] || 0) + h * q; w.effAll += h * q;
      (w.days[sp] = w.days[sp] || {})[String(e.date).slice(0, 10)] = 1; (w.days._all = w.days._all || {})[String(e.date).slice(0, 10)] = 1;
      if (FEEL[e.feel] != null) { var F = w.feel[sp] = w.feel[sp] || [0, 0]; F[0] += FEEL[e.feel] * h; F[1] += h; }
      if (e.kind === 'lesson') { if (e.change === 'big') w.big[sp] = e.what || 'big change'; if (!w.lessons.some(function (L) { return L.id === (e.lesson || e.id) && L.spoke === sp; })) w.lessons.push({ id: e.lesson || e.id, spoke: sp, change: e.change === 'big' ? 'big' : 'tune', what: e.what || '', coach: e.coach || '', t: t }); }
    });
    // spacing: the same hours over more days count a little more
    W.forEach(function (w) { w.list.sort(function (a, b) { return Date.parse(a.date) - Date.parse(b.date); }); Object.keys(w.eff).forEach(function (sp) { var d = Object.keys(w.days[sp] || {}).length; w.eff[sp] *= CFG.spaceW[Math.min(d, 3) - 1] || 1; });
      var d2 = Object.keys(w.days._all || {}).length; if (d2) w.effAll *= CFG.spaceW[Math.min(d2, 3) - 1] || 1; });
    return W;
  }

  // ---- one area (or the total) ----
  // y: per week, "higher is better" (strokes gained, or −score for the total); x: practice hours per week
  // opt.eff: effective hours (type + spacing weighted), opt.big: per week the big change made that week (or null),
  // opt.feel: per week how practice felt (−1…+1, or null), opt.lessons: per week the lessons, opt.test: { t, v }
  function gammaAt(days) { return CFG.gamma0 - (CFG.gamma0 - CFG.gammaMin) * Math.max(0, Math.min(1, days / CFG.gammaDays)); }
  // opt: wt (per week: weighted rounds), cnt (per week: rounds played), test { t, v }, feel (per week −1…+1 or null), lessons,
  //      now, total (the score: y is −score), roundsOnly (practice off)
  function analyse(y, x, opt) {
    opt = opt || {}; var n = y.length, last = n - 1, have = y.filter(function (v) { return v != null; }).length, first = x.findIndex(function (v) { return v > 0; });
    var wt = y.map(function (v, i) { return v == null ? 0 : Math.min(CFG.maxPerWeek, opt.wt && opt.wt[i] > 0 ? opt.wt[i] : 1); });
    var cnt = (opt.cnt || y.map(function (v) { return v == null ? 0 : 1; })).reduce(function (a, b) { return a + b; }, 0), E = wt.reduce(function (a, b) { return a + b; }, 0);
    var normY = mean(y), sdY = sd(y) || 0, sy = smooth(y), sx = smooth(x), normX = first >= 0 ? mean(x.slice(first)) : 0;
    // v218: the solid line is your form week by week (the same weighting the dashed line starts from)
    var fy = y.map(function (_, i) { var seen = false; for (var j = 0; j <= i; j++) if (y[j] != null) seen = true; return seen ? ewmaR(y, wt, i) : null; });
    var out = { fy: fy, weeks: n, dataWeeks: have, rounds: cnt, weighted: E, need: CFG.minRounds, practised: first >= 0, ok: false, normY: normY, normX: normX, sdY: sdY, sy: sy, sx: sx, lessons: opt.lessons || [], dips: [] };
    if (cnt < CFG.minRounds) { out.reason = 'not enough rounds'; return out; }
    var form = opt.form != null ? opt.form : ewmaR(y, wt, last), test = opt.test || null, // v258: the caller passes the last-3-rounds average, so the dashed line starts where the solid one ends
        now = opt.now == null ? Date.now() : +opt.now;
    var gam = function (f) { return test ? gammaAt((now - test.t) / DAY + 7 * f) : 0; };
    var level = function (f) { var g = gam(f); return (1 - g) * form + g * (test ? test.v : 0); };
    // practice: the last 2 weeks against your normal week
    if (opt.normX != null) normX = opt.normX; // v258: from the daily practice line (playing days held flat)
    var usePr = first >= 0 && !opt.roundsOnly, nowX = usePr ? (opt.nowX != null ? opt.nowX : mean([x[last], x[last - 1]])) : 0, dX = usePr ? nowX - normX : 0;
    // b: a starting value, and your own history (practice 2 weeks before vs the round) taking over as the pairs build up
    var xs = [], ys = [], ws = []; if (usePr) for (var i = Math.max(first + 2, 2); i < n; i++) if (y[i] != null) { xs.push(x[i - 2]); ys.push(y[i]); ws.push(wt[i]); }
    var m = xs.length, own = m >= 3 && sd(xs) > 1e-9 ? wslope(xs, ys, ws) : null, b0 = opt.total ? CFG.b0Total : CFG.b0, bMax = opt.total ? CFG.bMaxTotal : CFG.bMax;
    var bOwn = own == null ? null : Math.max(0, Math.min(bMax, own)), b = bOwn == null ? b0 : (m * bOwn + CFG.priorPairs * b0) / (m + CFG.priorPairs);
    // room to improve: strokes you're losing in this area (rounds and test together), up to 2×
    var lvl0 = level(0), lose = opt.total ? 0 : Math.max(0, -lvl0), room = 1 + Math.min(CFG.roomMax - 1, lose / CFG.roomPer);
    var ramp = function (f) { return Math.min(1, f / CFG.rampWeeks); };
    var fw = (opt.feel || []).slice(-2).filter(function (v) { return v != null; }), fLast = usePr && fw.length ? mean(fw) : null;
    var pe = function (f) { return usePr ? b * room * dX * ramp(f) : 0; }, fe = function (f) { return fLast != null ? CFG.feelPart * b * room * fLast * ramp(f) : 0; };
    var F = [], G = [], PE = [], FE = []; for (var f = 1; f <= CFG.ahead; f++) { F.push(level(f) + pe(f) + fe(f)); G.push(gam(f)); PE.push(pe(f)); FE.push(fe(f)); }
    var margin = Math.max(0.25 * sdY, 0.05), end = F[F.length - 1];
    return Object.assign(out, { ok: true, form: form, level0: lvl0, fc: F, gamma: G, gammaNow: gam(0), test: test, practiceEff: PE, feelEff: FE, feelLast: fLast,
      b: b, bOwn: bOwn, pairs: m, b0: b0, room: room, losing: lose, nowX: nowX, dX: dX, usePr: usePr,
      link: usePr && b > 0, heading: end < normY - margin && end < form - 0.05, improving: end > form + margin });
  }

  // v240 (Scott): the solid line is the average of your last 3 rounds (CFG.lineRounds), week by week: every round counts the same,
  // a week without rounds keeps the value it had. val(round) → the round's number, or null when it has none (no shots in that area).
  function lastRounds(W, val) { var seen = []; return W.map(function (w) { w.list.forEach(function (R) { var v = val(R); if (v != null) seen.push(v); });
    var L = seen.slice(-CFG.lineRounds); return L.length ? L.reduce(function (a, b) { return a + b; }, 0) / L.length : null; }); }
  // v258 (Scott): practice as a smooth daily line (hours a week) – each day's practice counts half as much 3 days later, the same
  // fading average as the Practice page (v238). Days with a round (and a day between two round days) hold it flat: playing is
  // practice, so a tournament stretch doesn't read as a drop. A half-finished week can't look like a drop either.
  var PD = { half: 3, recent: 14 };
  function isoDay(t) { var d = new Date(t); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function dailyPractice(logs, golfDays, keep, from, now, tourDays) { // v269: tourDays – tournament days count their credit (not held), but a day between two round days is still held
    var A = Math.pow(0.5, 1 / PD.half), byDay = {}, first = null, out = [];
    (logs || []).forEach(function (e) { if (!(e.min > 0) || !keep(e)) return; var t = Date.parse(String(e.date).length <= 10 ? e.date + 'T12:00:00' : e.date); if (isNaN(t) || t > now + DAY) return;
      var k = isoDay(t); byDay[k] = (byDay[k] || 0) + e.min / 60; if (first == null || t < first) first = t; });
    if (first == null) return { line: [], first: null };
    var t0 = Math.min(from, first), d = new Date(t0); d.setHours(12, 0, 0, 0); var e = 0, k = 0, days = [];
    for (var t = d.getTime(); t <= now + 1; t += DAY) days.push(t);
    var golf = days.map(function (t) { return !!golfDays[isoDay(t)]; }), play = days.map(function (t, i) { return golf[i] || !!(tourDays && tourDays[isoDay(t)]); });
    days.forEach(function (t, i) { var g = golf[i] || (!play[i] && i > 0 && i < days.length - 1 && play[i - 1] && play[i + 1]), h = byDay[isoDay(t)] || 0;
      if (t >= first - DAY / 2 && !(g && k)) { e = e * A + h * (1 - A); k++; }
      var v = k ? e / (1 - Math.pow(A, Math.max(k, 3))) * 7 : 0; if (t >= from) out.push({ t: t, h: v, golf: g }); });
    return { line: out, first: first };
  }
  function pdLevels(P, now) { if (!P.first) return { now: null, norm: null };
    var on = P.line.filter(function (p) { return p.t >= P.first; }), rec = on.filter(function (p) { return p.t > now - PD.recent * DAY; });
    var avg = function (L) { return L.length ? L.reduce(function (s, p) { return s + p.h; }, 0) / L.length : null; }; return { now: avg(rec), norm: avg(on) }; }
  // v258: every round as its own point (its date, its number, tournament or not) and the average of the last 3 rounds at each one
  function roundPoints(W, val) { var pts = [], seen = []; W.forEach(function (w) { w.list.forEach(function (R) { var v = val(R); if (v == null) return; seen.push(v);
    var L = seen.slice(-CFG.lineRounds); pts.push({ t: R.t, v: v, avg: L.reduce(function (a, b) { return a + b; }, 0) / L.length, tour: !!R.tour, id: R.id, course: R.course, holes: R.holes, score: R.score }); }); }); return pts; }
  // ---- everything for the Trends page ----
  // tests: [{ date, area: { putt, chip, bunker, wedges } }] – strokes per round for that area from a short game test
  function build(rounds, logs, SG, MYGAME, opts) {
    opts = opts || {}; var now = opts.now == null ? Date.now() : +opts.now;
    // v269 (Scott): each tournament round counts as 2.5 h of practice, 30 min a group (MYGAME.tourPractice) – in the weekly practice,
    // the daily line and the forecast, so a tournament week doesn't read as no practice. Other round days still hold the line flat.
    var own = logs || [], tourL = opts.roundsOnly || !MYGAME.tourPractice ? [] : MYGAME.tourPractice(rounds, SG, opts.bl);
    logs = own.concat(tourL);
    var W = weekSeries(rounds, logs, SG, MYGAME, Object.assign({}, opts, { now: now }));
    var lastTest = (opts.tests || []).filter(function (t) { return !isNaN(Date.parse(t.date)) && Date.parse(t.date) <= now + DAY; }).sort(function (a, b) { return Date.parse(b.date) - Date.parse(a.date); })[0];
    var golfDays = {}, tourDays = {}; W.forEach(function (w) { w.list.forEach(function (R) { if (isNaN(R.t)) return; if (R.tour && tourL.length) tourDays[isoDay(R.t)] = 1; else golfDays[isoDay(R.t)] = 1; }); });
    // v271 (Scott): your own practice holds flat through a tournament (as before – a warm-up logged that day is part of the round), and the
    // round's credit (2.5 h, 30 min a group) builds on top and fades after – so the line doesn't drop while you're playing. h = both, hp = your own.
    var held = Object.assign({}, golfDays, tourDays), from = W[0].start, pd = function (keep) {
      if (opts.roundsOnly || !tourL.length) return dailyPractice(opts.roundsOnly ? [] : own, golfDays, keep, from, now);
      var O = dailyPractice(own, held, keep, from, now), T = dailyPractice(tourL, golfDays, keep, from, now, tourDays), m = {};
      O.line.forEach(function (q) { m[q.t] = { t: q.t, h: q.h, hp: q.h, golf: q.golf }; });
      T.line.forEach(function (q) { var x = m[q.t] || (m[q.t] = { t: q.t, h: 0, hp: 0, golf: false }); x.h += q.h; x.golf = x.golf || q.golf; });
      var line = Object.keys(m).map(function (k) { var x = m[k]; if (tourDays[isoDay(x.t)]) { x.tour = true; x.golf = true; } return x; }).sort(function (a, b) { return a.t - b.t; });
      var f = [O.first, T.first].filter(function (v) { return v != null; }); return { line: line, first: f.length ? Math.min.apply(null, f) : null }; };
    var areas = AREAS.map(function (A) {
      var y = W.map(function (w) { var n = 0, s = 0; A.spokes.forEach(function (k) { if (w.n[k]) { n += w.n[k]; s += w.sg[k]; } }); return n && w.wHoles ? s / w.wHoles * 18 : null; });
      var x = W.map(function (w) { return A.spokes.reduce(function (s, k) { return s + (w.prac[k] || 0); }, 0); });
      var tv = lastTest && lastTest.area && lastTest.area[A.k] != null ? { t: Date.parse(lastTest.date), v: lastTest.area[A.k] } : null;
      var feel = W.map(function (w) { var a = 0, h = 0; A.spokes.forEach(function (k) { if (w.feel[k]) { a += w.feel[k][0]; h += w.feel[k][1]; } }); return h ? a / h : null; });
      var les = W.map(function (w) { return w.lessons.filter(function (L) { return A.spokes.indexOf(L.spoke) >= 0; }); });
      var rv = function (R) { var n = 0, g = 0; A.spokes.forEach(function (k) { if (R.n[k]) { n += R.n[k]; g += R.sg[k]; } }); return n && R.holes ? g / R.holes * 18 : null; };
      var ry = lastRounds(W, rv), pts = roundPoints(W, rv), P = pd(function (e) { return A.spokes.indexOf(e.spoke) >= 0; }), lv = pdLevels(P, now);
      return Object.assign({ k: A.k, name: A.name, y: y, x: x, ry: ry, pts: pts, pd: P.line, prWeek: W.map(function (w) { return w.rounds > 0 && w.prRounds === w.rounds; }) }, analyse(y, x, { test: tv, now: now, feel: feel, lessons: les, wt: W.map(function (w) { return w.wHoles / 18; }), cnt: y.map(function (v, i) { return v == null ? 0 : W[i].rounds; }), roundsOnly: !!opts.roundsOnly,
        form: pts.length ? pts[pts.length - 1].avg : null, nowX: lv.now, normX: lv.norm }));
    });
    // total practice vs score (18-hole rounds; lower score is better, so the maths uses −score)
    var sc = W.map(function (w) { return w.score.length ? wmean(w.score, w.scoreW) : null; });
    var tLes = W.map(function (w) { var seen = {}; return w.lessons.filter(function (L) { if (seen[L.id]) return false; seen[L.id] = 1; return true; }); });
    var tFeel = W.map(function (w) { var a = 0, h = 0; Object.keys(w.feel).forEach(function (k) { a += w.feel[k][0]; h += w.feel[k][1]; }); return h ? a / h : null; });
    var tPts = roundPoints(W, function (R) { return R.s18 == null ? null : R.s18; }), tP = pd(function () { return true; }), tLv = pdLevels(tP, now);
    var tot = analyse(sc.map(function (v) { return v == null ? null : -v; }), W.map(function (w) { return w.pracAll; }), { now: now, total: true, roundsOnly: !!opts.roundsOnly, feel: tFeel, lessons: tLes,
      form: tPts.length ? -tPts[tPts.length - 1].avg : null, nowX: tLv.now, normX: tLv.norm,
      wt: W.map(function (w) { return w.scoreW.reduce(function (a, b) { return a + b; }, 0); }), cnt: W.map(function (w) { return w.score.length; }) });
    var total = Object.assign({ k: 'total', name: 'Total practice vs score', y: sc, ry: lastRounds(W, function (R) { return R.s18 == null ? null : -R.s18; }), x: W.map(function (w) { return w.pracAll; }), pts: tPts, pd: tP.line, lowerBetter: true, prWeek: W.map(function (w) { return w.score.length > 0 && w.prRounds === w.rounds; }) }, tot);
    if (total.ok) { total.fc = total.fc.map(function (v) { return -v; }); total.formScore = -total.form; total.levelScore = -total.level0; }
    if (total.normY != null) total.normScore = -total.normY;
    // weakest end of the line first; areas without enough rounds last
    var order = areas.slice().sort(function (a, b) { return (a.ok ? 0 : 1) - (b.ok ? 0 : 1) || (a.ok ? a.fc[a.fc.length - 1] - b.fc[b.fc.length - 1] : 0); });
    return { weeks: W.map(function (w) { return w.start; }), rounds: W.map(function (w) { return w.list; }), now: now, areas: order, total: total, test: lastTest || null, cfg: CFG };
  }

  // the strength of a link in words
  function linkWord(r) { var a = Math.abs(r || 0); return a >= 0.7 ? 'Strong' : a >= 0.4 ? 'Moderate' : a >= 0.2 ? 'Weak' : 'No clear'; }

  var api = { AREAS: AREAS, CFG: CFG, PD: PD, dailyPractice: dailyPractice, roundPoints: roundPoints, FEEL: FEEL, gammaAt: gammaAt, build: build, analyse: analyse, weekSeries: weekSeries, spearman: spearman, pearson: pearson, slope: slope, linkWord: linkWord, monday: monday };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.TRENDS = api;
})(typeof self !== 'undefined' ? self : this);
