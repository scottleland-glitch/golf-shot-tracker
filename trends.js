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
(function (root) {
  'use strict';
  var DAY = 86400000, WEEK = 7 * DAY;
  var AREAS = [ // practice area → strokes gained area(s) from rounds (MYGAME spoke keys)
    { k: 'drive', name: 'Driving', spokes: ['drive'] },
    { k: 'irons', name: 'Irons 100+', spokes: ['irons'] },
    { k: 'wedges', name: 'Wedges', spokes: ['wedges'] },
    { k: 'chip', name: 'Chipping', spokes: ['chip'] },
    { k: 'bunker', name: 'Bunker', spokes: ['bunker'] },
    { k: 'putt', name: 'Putting', spokes: ['lag', 'short'] }
  ];
  var CFG = { weeks: 26, minWeeks: 3, minRounds: 4, midRounds: 6, fullRounds: 10, priorR: 6, maxPerWeek: 3, maxLag: 3, ahead: 5, bandPct: 0.25, bandMinH: 0.25, testMax: 0.5, testDays: 21, halfLife: 4, minR: 0.2, slipWeeks: 2,
    stockHL: [2, 4, 8], typeW: { reps: 0.85, mixed: 1, game: 1.15 }, spaceW: [0.9, 1, 1.05], bigKeep: 0.5, dipPeak: 2, dipWeeks: 8, dipPrior: 0.5, feelMin: 5, feelR: 0.3 };
  var FEEL = { off: -1, ok: 0, great: 1 };
  // the dip after a big change, t weeks after the lesson week: 0 → 1 (deepest) → 0
  function dipAt(t) { if (t < 0) return 0; var u = (t + 0.5) / CFG.dipPeak; return u * Math.exp(1 - u); }

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
    var W = []; for (var i = 0; i < nW; i++) W.push({ i: i, start: m0 + i * WEEK, list: [], holes: 0, rounds: 0, sg: {}, n: {}, score: [], prac: {}, pracAll: 0, eff: {}, effAll: 0, days: {}, feel: {}, big: {}, lessons: [] });
    var SP = MYGAME.SPOKES;
    (rounds || []).forEach(function (r) {
      var t = Date.parse(r.date), i = isNaN(t) || t > now + DAY ? -1 : wk(t); if (i < 0) return;
      var S = SG.summarize(r, opts.bl); if (!S.holesDone) return;
      var w = W[i]; w.holes += S.holesDone; w.rounds++; if (S.holesDone === 18) w.score.push(S.strokes);
      var R = { id: r.id, date: r.date, course: r.course || '', holes: S.holesDone, score: S.holesDone === 18 ? S.strokes : null, sg: {}, n: {} }; w.list.push(R); // v197: tap a week
      S.holes.forEach(function (h) { if (!h.done) return; h.shots.forEach(function (s) { if (s.layup) return;
        for (var k = 0; k < SP.length; k++) if (SP[k].test(s)) { w.sg[SP[k].k] = (w.sg[SP[k].k] || 0) + s.sg; w.n[SP[k].k] = (w.n[SP[k].k] || 0) + 1; R.sg[SP[k].k] = (R.sg[SP[k].k] || 0) + s.sg; R.n[SP[k].k] = (R.n[SP[k].k] || 0) + 1; break; } }); });
    });
    (logs || []).forEach(function (e) { var t = Date.parse(String(e.date).length <= 10 ? e.date + 'T12:00:00' : e.date), i = isNaN(t) || t > now + DAY ? -1 : wk(t); if (i < 0 || !(e.min > 0)) return;
      var w = W[i], h = e.min / 60, q = CFG.typeW[e.type] || 1, sp = e.spoke;
      w.prac[sp] = (w.prac[sp] || 0) + h; w.pracAll += h; w.eff[sp] = (w.eff[sp] || 0) + h * q; w.effAll += h * q;
      (w.days[sp] = w.days[sp] || {})[String(e.date).slice(0, 10)] = 1; (w.days._all = w.days._all || {})[String(e.date).slice(0, 10)] = 1;
      if (FEEL[e.feel] != null) { var F = w.feel[sp] = w.feel[sp] || [0, 0]; F[0] += FEEL[e.feel] * h; F[1] += h; }
      if (e.kind === 'lesson') { if (e.change === 'big') w.big[sp] = e.what || 'big change'; if (!w.lessons.some(function (L) { return L.id === (e.lesson || e.id) && L.spoke === sp; })) w.lessons.push({ id: e.lesson || e.id, spoke: sp, change: e.change === 'big' ? 'big' : 'tune', what: e.what || '', coach: e.coach || '' }); }
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
  function rms(a) { return a.length ? Math.sqrt(mean(a.map(function (v) { return v * v; }))) : null; }
  // the v194 model: the best single lag 0–3 weeks, a straight line
  function lagModel(y, x, first, have, wt, E) {
    var n = y.length, best = null, byLag = [], maxL = Math.max(0, Math.min(CFG.maxLag, Math.floor(((have || n) - 3) / 2))); // 4 weeks: same week only; 10: up to 3
    for (var L = 0; L <= maxL; L++) { var xs = [], ys = [], ws = [];
      for (var i = Math.max(L, first); i < n; i++) if (y[i] != null) { xs.push(x[i - L]); ys.push(y[i]); ws.push(wt[i] || 1); }
      var r = xs.length >= 3 ? spearman(xs, ys) : null; byLag.push({ lag: L, r: r, n: xs.length, b: xs.length ? wslope(xs, ys, ws) : 0 });
      if (r != null && (best == null || r > best.r)) best = byLag[L]; }
    if (!best) return null;
    var normX = mean(x.slice(first)), link = best.r >= CFG.minR && best.b > 0, b = link ? best.b * shrink(E) : 0, lag = best.lag, last = n - 1; // a negative slope is usually "practised more after a bad week" – not used
    var ewma = function (upto) { return ewmaR(y, wt, upto); };
    var res = [], rw = [], at = {}; for (var i2 = Math.max(6, first + lag); i2 < n; i2++) { if (y[i2] == null) continue; var e = ewma(i2 - 1); if (e == null) continue; var v = y[i2] - (e + b * (x[i2 - lag] - normX)); res.push(v); rw.push(wt[i2] || 1); at[i2] = v; }
    var form = ewma(last), nowX = mean([x[last], x[last - 1]]), ramp = function (f) { return Math.max(0, Math.min(1, (f - lag) / 2)); };
    return { kind: 'lag', lag: lag, r: best.r, n: best.n, byLag: byLag, link: link, b: b, form: form, res: res, resAt: at, rmse: wrms(res, rw),
      predict: function (f, X) { var j = last + f - lag, h = j <= last ? x[j] : nowX; return form + b * (h - normX) + b * (X - nowX) * ramp(f); } };
  }
  function shrink(E) { return E / (E + CFG.priorR); } // v196/v197: few rounds → most of the way to "no effect"
  // v195: the practice stock model (see the top of the file)
  function stockModel(y, x, eff, big, first, HL, sdY, have, wt, E) {
    var n = y.length, last = n - 1, dec = Math.pow(0.5, 1 / HL), S = 0, St = [], z = [], dip = [], bigW = [];
    for (var i = 0; i < n; i++) { if (big[i]) { S *= CFG.bigKeep; bigW.push(i); } S = S * dec + (eff[i] || 0); St[i] = S; z[i] = Math.log(1 + S); }
    var dipOf = function (t) { var d = 0; bigW.forEach(function (j) { if (j <= t) d += dipAt(t - j); }); return Math.min(d, 1.5); };
    for (var i1 = 0; i1 < n; i1++) dip[i1] = dipOf(i1);
    var idx = []; for (var k = first; k < n; k++) if (y[k] != null) idx.push(k);
    var calm = idx.filter(function (i) { return dip[i] < 0.2; }), fitOn = calm.length >= 3 ? calm : idx;
    var b = wslope(fitOn.map(function (i) { return z[i]; }), fitOn.map(function (i) { return y[i]; }), fitOn.map(function (i) { return wt[i] || 1; })), c = wmean(fitOn.map(function (i) { return y[i] - b * z[i]; }), fitOn.map(function (i) { return wt[i] || 1; }));
    // how deep your dips run: from the weeks after big changes, pulled toward a cautious default (half a normal week-to-week swing)
    var D = 0; if (bigW.length) { var D0 = CFG.dipPrior * sdY, dw = idx.filter(function (i) { return dip[i] > 0; }), num = 0, den = 0;
      dw.forEach(function (i) { var r0 = y[i] - c - b * z[i]; num += r0 * dip[i]; den += dip[i] * dip[i]; });
      var Dh = den ? Math.max(0, -num / den) : D0, m = dw.filter(function (i) { return dip[i] > 0.2; }).length; D = Math.max(0, Math.min(1.5 * sdY, (m * Dh + 4 * D0) / (m + 4))); }
    var r = spearman(idx.map(function (i) { return z[i]; }), idx.map(function (i) { return y[i] + D * dip[i]; })), link = r != null && r >= CFG.minR && b > 0; b = link ? b * shrink(E) : 0;
    var adj = y.map(function (v, i) { return v == null ? null : v - b * z[i] + D * dip[i]; });
    var ewma = function (upto) { return ewmaR(adj, wt, upto); };
    var res = [], rw = [], at = {}; for (var i2 = Math.max(6, first); i2 < n; i2++) { if (y[i2] == null) continue; var e = ewma(i2 - 1); if (e == null) continue; var v = y[i2] - (e + b * z[i2] - D * dip[i2]); res.push(v); rw.push(wt[i2] || 1); at[i2] = v; }
    var sx = 0, se = 0; for (var q = Math.max(0, n - 8); q < n; q++) { sx += x[q] || 0; se += eff[q] || 0; } var ratio = sx ? se / sx : 1, form = ewma(last);
    return { kind: 'stock', halfLife: HL, r: r, n: idx.length, link: link, b: b, depth: D, form: form, res: res, resAt: at, rmse: wrms(res, rw), stock: St[last], z: z, dip: dip,
      predict: function (f, X) { var S2 = St[last]; for (var k3 = 1; k3 <= f; k3++) S2 = S2 * dec + X * ratio; return form + b * Math.log(1 + S2) - D * dipOf(last + f); } };
  }
  function analyse(y, x, opt) {
    opt = opt || {}; var n = y.length, have = y.filter(function (v) { return v != null; }).length, first = x.findIndex(function (v) { return v > 0; });
    var eff = opt.eff || x, big = opt.big || [], feel = opt.feel || [], wt = y.map(function (v, i) { return v == null ? 0 : Math.min(CFG.maxPerWeek, opt.wt && opt.wt[i] > 0 ? opt.wt[i] : 1); });
    var E = wt.reduce(function (a, b) { return a + b; }, 0);
    var out = { weeks: n, dataWeeks: have, rounds: E, need: CFG.minRounds, needWeeks: CFG.minWeeks, practised: first >= 0, ok: false };
    // always: the history (for early cards), lessons and the expected dips after big changes
    var normY = mean(y), sdY = sd(y) || 0, sy = smooth(y), sx = smooth(x), normX = first >= 0 ? mean(x.slice(first)) : 0, dips = [];
    big.forEach(function (w, i) { if (w) dips.push({ a: i, b: i + 6, what: w }); });
    Object.assign(out, { normY: normY, normX: normX, sdY: sdY, sy: sy, sx: sx, dips: dips, lessons: opt.lessons || [] });
    if (first < 0 || have < CFG.minWeeks || E < CFG.minRounds - 1e-9) { out.reason = first < 0 ? 'no practice logged' : 'not enough weeks'; return out; }
    var L = lagModel(y, x, first, have, wt, E);
    if (!L) { out.reason = sdY > 1e-9 && sd(x) > 1e-9 ? 'not enough weeks' : 'no variation'; return out; }
    // the stock model wins only if it would have predicted your past weeks better
    var models = [L].concat(CFG.stockHL.map(function (hl) { return stockModel(y, x, eff, big, first, hl, sdY, have, wt, E); })), M = L;
    models.forEach(function (m) { if (m.res.length >= 4 && L.res.length >= 4 && m.rmse < M.rmse - 1e-9) M = m; }); // needs at least 4 checks each
    if (opt.model) M = models.filter(function (m) { return m.kind === opt.model && (!opt.halfLife || m.halfLife === opt.halfLife); })[0] || M; // tests: force one
    var last = n - 1, maxX = Math.max.apply(null, x), nowX = mean([x[last], x[last - 1]]);
    // the band: ±25 % of normal practice, at least ±15 min, the top no higher than your busiest week
    var dX = Math.max(normX * CFG.bandPct, CFG.bandMinH), upX = Math.min(nowX + dX, Math.max(maxX, nowX)), dnX = Math.max(0, nowX - dX);
    var test = opt.test, testW = function (f) { if (!test) return 0; var days = (opt.now - test.t) / DAY + 7 * f; return Math.max(0, CFG.testMax * (1 - days / CFG.testDays)); };
    // how practice felt: used only when it has lined up with your next week's surprise (better or worse than the model said)
    var fx = [], fy = []; for (var i = 0; i < last; i++) if (feel[i] != null && M.resAt[i + 1] != null) { fx.push(feel[i]); fy.push(M.resAt[i + 1]); }
    var fr = fx.length >= CFG.feelMin ? spearman(fx, fy) : null, fUse = fr != null && fr >= CFG.feelR, fk = fUse ? Math.max(0, Math.min(sdY, slope(fx, fy))) : 0;
    var fLast = feel[last] != null ? feel[last] : feel[last - 1] != null ? feel[last - 1] : null, fAdj = function (f) { return fUse && fLast != null ? fk * fLast * Math.pow(0.5, f - 1) : 0; };
    var fc = function (f, X) { var base = M.predict(f, X) + fAdj(f), w = testW(f); return w ? (1 - w) * base + w * test.v : base; };
    var F = [], U = [], Dn = [], TW = []; for (var f = 1; f <= CFG.ahead; f++) { F.push(fc(f, nowX)); U.push(fc(f, upX)); Dn.push(fc(f, dnX)); TW.push(testW(f)); }
    var tol = opt.hitTol || 0.5, spread = M.res.length >= 4 ? M.rmse : sdY;
    // v196: the likely range (about 2 in 3 weeks land inside) – wider early on and further ahead
    var widen = 1 + Math.max(0, CFG.fullRounds - E) / 6, half = function (f) { return spread * widen * Math.sqrt(1 + 0.15 * (f - 1)); };
    var conf = E < CFG.midRounds ? 'low' : E < CFG.fullRounds || M.res.length < 4 ? 'mid' : 'high';
    // "both slipping": strokes gained clearly below normal AND practice below normal, 2+ weeks running (smoothed); inside an expected dip it is expected, not a warning
    var margin = 0.25 * sdY, slip = [], inDip = function (i) { return dips.some(function (d) { return i >= d.a && i <= d.b; }); };
    for (var a = first; a < n;) { var low = function (k) { return sy[k] != null && sy[k] < normY - margin && sx[k] < normX; };
      if (!low(a)) { a++; continue; } var z2 = a; while (z2 + 1 < n && low(z2 + 1)) z2++; if (z2 - a + 1 >= CFG.slipWeeks) slip.push([a, z2, inDip(a) || inDip(z2)]); a = z2 + 1; }
    var heading = F[F.length - 1] < normY - margin, dipNow = dips.filter(function (d) { return last >= d.a && last <= d.b; })[0];
    return Object.assign(out, { ok: true, model: M.kind, halfLife: M.halfLife || null, depth: M.depth || 0, lag: L.lag, r: M.r, n: M.n, byLag: L.byLag, link: M.link, b: M.b,
      models: models.map(function (m) { return { kind: m.kind, halfLife: m.halfLife || null, rmse: m.rmse, link: m.link }; }),
      conf: conf, lo: F.map(function (v, k) { return v - half(k + 1); }), hi: F.map(function (v, k) { return v + half(k + 1); }), widen: widen,
      form: M.form, nowX: nowX, upX: upX, dnX: dnX, dX: dX, capped: nowX + dX > upX + 1e-9, fc: F, up: U, dn: Dn, testW: TW, spread: spread,
      checks: M.res.length, hits: M.res.filter(function (v) { return Math.abs(v) <= tol; }).length, slip: slip, heading: heading && !dipNow, expected: dipNow ? dipNow.what : null,
      feel: { pairs: fx.length, r: fr, used: fUse, k: fk, last: fLast } });
  }

  // ---- everything for the Trends page ----
  // tests: [{ date, area: { putt, chip, bunker, wedges } }] – strokes per round for that area from a short game test
  function build(rounds, logs, SG, MYGAME, opts) {
    opts = opts || {}; var now = opts.now == null ? Date.now() : +opts.now, W = weekSeries(rounds, logs, SG, MYGAME, Object.assign({}, opts, { now: now }));
    var lastTest = (opts.tests || []).filter(function (t) { return !isNaN(Date.parse(t.date)) && Date.parse(t.date) <= now + DAY; }).sort(function (a, b) { return Date.parse(b.date) - Date.parse(a.date); })[0];
    var areas = AREAS.map(function (A) {
      var y = W.map(function (w) { var n = 0, s = 0; A.spokes.forEach(function (k) { if (w.n[k]) { n += w.n[k]; s += w.sg[k]; } }); return n && w.holes ? s / w.holes * 18 : null; });
      var x = W.map(function (w) { return A.spokes.reduce(function (s, k) { return s + (w.prac[k] || 0); }, 0); });
      var tv = lastTest && lastTest.area && lastTest.area[A.k] != null ? { t: Date.parse(lastTest.date), v: lastTest.area[A.k] } : null;
      var eff = W.map(function (w) { return A.spokes.reduce(function (s, k) { return s + (w.eff[k] || 0); }, 0); });
      var big = W.map(function (w) { var b = null; A.spokes.forEach(function (k) { if (w.big[k]) b = w.big[k]; }); return b; });
      var feel = W.map(function (w) { var a = 0, h = 0; A.spokes.forEach(function (k) { if (w.feel[k]) { a += w.feel[k][0]; h += w.feel[k][1]; } }); return h ? a / h : null; });
      var les = W.map(function (w) { return w.lessons.filter(function (L) { return A.spokes.indexOf(L.spoke) >= 0; }); });
      return Object.assign({ k: A.k, name: A.name, y: y, x: x }, analyse(y, x, { test: tv, now: now, eff: eff, big: big, feel: feel, lessons: les, wt: W.map(function (w) { return w.holes / 18; }) }));
    });
    // total practice vs score (18-hole rounds; lower score is better, so the maths uses −score)
    var sc = W.map(function (w) { return w.score.length ? mean(w.score) : null; });
    var tBig = W.map(function (w) { var k = Object.keys(w.big); return k.length ? w.big[k[0]] : null; }), tLes = W.map(function (w) { var seen = {}; return w.lessons.filter(function (L) { if (seen[L.id]) return false; seen[L.id] = 1; return true; }); });
    var tFeel = W.map(function (w) { var a = 0, h = 0; Object.keys(w.feel).forEach(function (k) { a += w.feel[k][0]; h += w.feel[k][1]; }); return h ? a / h : null; });
    var tot = analyse(sc.map(function (v) { return v == null ? null : -v; }), W.map(function (w) { return w.pracAll; }), { now: now, hitTol: 2, eff: W.map(function (w) { return w.effAll; }), big: tBig, feel: tFeel, lessons: tLes, wt: W.map(function (w) { return w.score.length; }) });
    var total = Object.assign({ k: 'total', name: 'Total practice vs score', y: sc, x: W.map(function (w) { return w.pracAll; }), lowerBetter: true }, tot);
    if (total.ok) ['fc', 'up', 'dn'].forEach(function (k) { total[k] = total[k].map(function (v) { return -v; }); }), total.lo = total.hi.map(function (v) { return -v; }), total.hi = total.lo.map(function (v, k) { return total.fc[k] + (total.fc[k] - v); }), total.normScore = -total.normY, total.formScore = -total.form;
    else if (total.normY != null) total.normScore = -total.normY;
    // worst forecast first (strokes below normal at the end of the forecast); areas without enough data last
    var order = areas.slice().sort(function (a, b) { return (a.ok ? 0 : 1) - (b.ok ? 0 : 1) || (a.ok ? (a.fc[a.fc.length - 1] - a.normY) - (b.fc[b.fc.length - 1] - b.normY) : 0); });
    return { weeks: W.map(function (w) { return w.start; }), rounds: W.map(function (w) { return w.list; }), now: now, areas: order, total: total, test: lastTest || null, cfg: CFG };
  }

  // the strength of a link in words
  function linkWord(r) { var a = Math.abs(r || 0); return a >= 0.7 ? 'Strong' : a >= 0.4 ? 'Moderate' : a >= 0.2 ? 'Weak' : 'No clear'; }

  var api = { AREAS: AREAS, CFG: CFG, FEEL: FEEL, dipAt: dipAt, build: build, analyse: analyse, weekSeries: weekSeries, spearman: spearman, pearson: pearson, slope: slope, linkWord: linkWord, monday: monday };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.TRENDS = api;
})(typeof self !== 'undefined' ? self : this);
