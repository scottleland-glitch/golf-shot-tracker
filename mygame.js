// v141 My Game: the shape of a golfer's game as a spoke chart (like Hevy's muscle distribution). v157: seven spokes (+ Bunker).
// Spokes = strokes gained per 18 holes in six skills; every shot lands in exactly one, so the six add up to the total:
//   Driving (par 4/5 tee shots) · Irons 100+ (approach from over 100 yd) · Wedges (approach 30-100 yd) ·
//   Chipping (around the green, 30 yd and in) · Lag putts (10 ft and over) · Short putts (under 10 ft).
// Time frames: last 30 days, last 3 months, year, all time; the gray shape is the same length of time before.
// A spoke with too few shots in the period is "learning" (hollow point, % shown) – one round is not a pattern.
// Pure (tested in node: tests/mygame.test.js); app.js draws the page and the Home card.
(function (root) {
  'use strict';
  var SPOKES = [
    { k: 'drive', name: 'Driving', need: 20, span: 3, test: function (s) { return s.cat === 'tee'; } },
    { k: 'irons', name: 'Irons 100+', need: 15, span: 5, test: function (s) { return s.cat === 'approach' && s.start.lie !== 'green' && s.start.dist > 100; } },
    { k: 'wedges', name: 'Wedges', need: 10, span: 3, test: function (s) { return s.cat === 'approach' && !(s.start.lie !== 'green' && s.start.dist > 100); } },
    { k: 'chip', name: 'Chipping', need: 12, span: 3, test: function (s) { return s.cat === 'short'; } },
    { k: 'bunker', name: 'Bunker', need: 6, span: 3, test: function (s) { return s.cat === 'bunker'; } }, // v157: greenside bunker shots (50 yd and in)
    { k: 'lag', name: 'Lag putts', need: 20, span: 2.5, test: function (s) { return s.cat === 'putting' && s.start.dist >= 10; } },
    { k: 'short', name: 'Short putts', need: 25, span: 2.5, test: function (s) { return s.cat === 'putting' && s.start.dist < 10; } }
  ];
  var PERIODS = [
    { id: '30d', name: 'Last 30 days', short: '30 days', days: 30 },
    { id: '3m', name: 'Last 3 months', short: '3 months', days: 91 },
    { id: '1y', name: 'Year', short: 'year', days: 365 },
    { id: 'all', name: 'All time', short: 'all time', days: null }
  ];
  var DAY = 86400000, MIN_ROUNDS = 2, STRONG = 3;
  function period(id) { return PERIODS.filter(function (p) { return p.id === id; })[0] || PERIODS[1]; }
  // [from, to) in ms for the period and the one before it (all time has none before it).
  function windows(id, now) {
    var p = period(id), t = now == null ? Date.now() : +now;
    if (!p.days) return { cur: [-Infinity, t + DAY], prev: null };
    return { cur: [t - p.days * DAY, t + DAY], prev: [t - 2 * p.days * DAY, t - p.days * DAY] };
  }
  function inWin(r, w) { var t = Date.parse(r.date); return !isNaN(t) && t >= w[0] && t < w[1]; }
  function fmt(v) { var s = (Math.round(v * 10) / 10).toFixed(1); return (v > 0.04 ? '+' : '') + (s === '-0.0' ? '0.0' : s); }

  // Strokes gained per 18 holes in each spoke, plus the tiles' numbers, for a list of finished rounds.
  function shape(list, SG, bl) {
    var acc = {}; SPOKES.forEach(function (s) { acc[s.k] = { n: 0, sg: 0 }; });
    var holes = 0, strokes18 = [], sgTot = 0, putts = 0, gir = 0, girHoles = 0;
    list.forEach(function (r) {
      var S = SG.summarize(r, bl); if (!S.holesDone) return;
      holes += S.holesDone; sgTot += S.sgTotal; putts += S.putts; gir += S.gir; girHoles += S.girHoles;
      if (S.holesDone === 18) strokes18.push(S.strokes);
      S.holes.forEach(function (h) {
        if (!h.done) return;
        h.shots.forEach(function (s) { if (s.layup) return; for (var i = 0; i < SPOKES.length; i++) if (SPOKES[i].test(s)) { acc[SPOKES[i].k].n++; acc[SPOKES[i].k].sg += s.sg; break; } });
      });
    });
    var per = function (v) { return holes ? v / holes * 18 : null; }, rounds = list.length;
    return {
      rounds: rounds, holes: holes,
      spokes: SPOKES.map(function (s) {
        var a = acc[s.k], solid = a.n >= s.need && rounds >= MIN_ROUNDS;
        // conf (v146): confidence keeps building past "ready" – full ("strong") at STRONG x the shots ready needs
        return { k: s.k, name: s.name, n: a.n, need: s.need, value: a.n ? per(a.sg) : null, solid: solid,
          frac: Math.min(1, Math.min(a.n / s.need, rounds / MIN_ROUNDS)), conf: Math.min(1, a.n / (s.need * STRONG)), strong: solid && a.n >= s.need * STRONG };
      }),
      tiles: {
        score: strokes18.length ? strokes18.reduce(function (t, x) { return t + x; }, 0) / strokes18.length : null,
        sg: per(sgTot), putts: per(putts), gir: girHoles ? 100 * gir / girHoles : null
      }
    };
  }

  // rounds: the golfer's finished rounds (any order). opts: { period, now, baseline, baselineName }.
  function build(rounds, SG, opts) {
    opts = opts || {};
    var bl = SG.baseline(opts.baseline).id, blName = opts.baselineName || SG.baseline(bl).name, p = period(opts.period), W = windows(p.id, opts.now);
    var cur = shape(rounds.filter(function (r) { return inWin(r, W.cur); }), SG, bl);
    var prev = W.prev ? shape(rounds.filter(function (r) { return inWin(r, W.prev); }), SG, bl) : null;
    if (prev && !prev.rounds) prev = null;
    var solid = cur.spokes.filter(function (s) { return s.solid; }), headline, lede;
    var moves = prev ? cur.spokes.map(function (s, i) { var q = prev.spokes[i]; return s.solid && q.solid ? { s: s, d: s.value - q.value } : null; }).filter(Boolean) : [];
    var up = moves.slice().sort(function (a, b) { return b.d - a.d; })[0], down = moves.slice().sort(function (a, b) { return a.d - b.d; })[0];
    var before = p.id === '1y' ? 'the year before' : 'the previous ' + p.short;
    if (!solid.length) { headline = 'Still learning your game'; lede = cur.rounds ? 'Play a few more rounds – each skill fills in as its shots come in.' : 'No finished rounds in this period yet.'; }
    else if (up && up.d >= 0.5 && (!down || up.d >= -down.d)) { headline = up.s.name + ' is improving'; lede = up.s.name + ' is ' + Math.abs(up.d).toFixed(1) + ' strokes a round better than ' + before + '.'; }
    else if (down && down.d <= -0.5) { headline = down.s.name + ' has slipped'; lede = down.s.name + ' is ' + Math.abs(down.d).toFixed(1) + ' strokes a round worse than ' + before + '.'; }
    else if (moves.length) { headline = 'Holding steady'; lede = 'No skill moved more than half a stroke a round from ' + before + '.'; }
    else {
      var worst = solid.slice().sort(function (a, b) { return a.value - b.value; })[0], best = solid.slice().sort(function (a, b) { return b.value - a.value; })[0];
      headline = worst.name + ' costs you the most';
      lede = fmt(worst.value) + ' strokes a round against the ' + blName + ' average' + (best !== worst ? '. Strongest: ' + best.name.toLowerCase() + ' (' + fmt(best.value) + ').' : '.');
    }
    return { period: p, baseline: bl, baselineName: blName, cur: cur, prev: prev, headline: headline, lede: lede };
  }

  // ---------- the chart (SVG markup) ----------
  // Each spoke has its own scale (span = strokes a round from the centre to the benchmark ring), so a spread that is
  // normal for irons does not flatten the putting spokes. Further out = better; the dashed ring = the benchmark.
  var RING = 0.72;
  function radius(sp, v, R) { var x = (v + sp.span) / (sp.span / RING); return R * Math.max(0.05, Math.min(1, x)); }
  function pt(i, r) { var a = -Math.PI / 2 + i * 2 * Math.PI / SPOKES.length; return [Math.round(r * Math.cos(a) * 10) / 10, Math.round(r * Math.sin(a) * 10) / 10]; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  // opts: { R, labels: true/false, prev: shape or null, cur: shape, colors }
  function radarSVG(cur, prev, opts) {
    opts = opts || {};
    var R = opts.R || 96, lab = opts.labels !== false, pad = lab ? 76 : 6, w = 2 * (R + pad), h = 2 * R + (lab ? 72 : 12);
    var C = { cur: '#1f9d55', prev: '#8a9a8f', grid: 'rgba(23,48,31,.15)', ink: '#17301f', soft: '#3f5a48', up: '#1f7a44', down: '#c0442f' };
    var o = '<svg class="radar" viewBox="' + (-w / 2) + ' ' + (-R - (lab ? 36 : 6)) + ' ' + w + ' ' + h + '" role="img" aria-label="' + esc(opts.aria || 'Game shape') + '">';
    var poly = function (rs) { return rs.map(function (r, i) { return pt(i, r).join(','); }).join(' '); };
    for (var k = 1; k <= 4; k++) o += '<polygon points="' + poly(SPOKES.map(function () { return R * k / 4; })) + '" fill="none" stroke="' + C.grid + '"/>';
    SPOKES.forEach(function (s, i) { var e = pt(i, R); o += '<line x1="0" y1="0" x2="' + e[0] + '" y2="' + e[1] + '" stroke="' + C.grid + '"/>'; });
    o += '<polygon class="rbench" points="' + poly(SPOKES.map(function () { return R * RING; })) + '" fill="none" stroke="' + C.ink + '" stroke-width="1.5" stroke-dasharray="4 4"/>';
    var rs = function (S) { return S.spokes.map(function (s, i) { return s.value == null ? R * RING : radius(SPOKES[i], s.value, R); }); };
    if (prev) o += '<polygon class="rprev" points="' + poly(rs(prev)) + '" fill="rgba(138,154,143,.22)" stroke="' + C.prev + '" stroke-width="2"/>';
    var cr = rs(cur);
    if (cur.spokes.some(function (s) { return s.value != null; })) o += '<polygon class="rcur" points="' + poly(cr) + '" fill="rgba(31,157,85,.28)" stroke="' + C.cur + '" stroke-width="2.5"/>';
    cur.spokes.forEach(function (s, i) { if (s.value == null) return; var q = pt(i, cr[i]);
      // v146 a skill still learning: a gold ring (same gold as its bar), so it stands out from the solid green points
      o += s.solid ? '<circle cx="' + q[0] + '" cy="' + q[1] + '" r="' + (lab ? 4 : 3) + '" fill="' + C.cur + '" stroke="' + C.cur + '" stroke-width="2"/>'
        : '<circle class="rlearn" cx="' + q[0] + '" cy="' + q[1] + '" r="' + (lab ? 5.5 : 3.5) + '" fill="#fff" stroke="#c8962e" stroke-width="' + (lab ? 3 : 2) + '"/>'; });
    if (lab) cur.spokes.forEach(function (s, i) {
      var q = pt(i, R + 20), anchor = Math.abs(q[0]) < 10 ? 'middle' : q[0] > 0 ? 'start' : 'end', d = prev && s.solid && prev.spokes[i].solid ? s.value - prev.spokes[i].value : null;
      o += '<text x="' + q[0] + '" y="' + (q[1] - 2) + '" text-anchor="' + anchor + '" font-size="12.5" font-weight="600" fill="' + C.ink + '">' + esc(s.name) + '</text>';
      var sub = s.value == null ? 'no shots yet' : !s.solid ? 'learning' : fmt(s.value) + (d != null && Math.abs(d) >= 0.25 ? (d > 0 ? ' ▲' : ' ▼') : '');
      o += '<text x="' + q[0] + '" y="' + (q[1] + 13) + '" text-anchor="' + anchor + '" font-size="11.5" fill="' + (!s.solid ? '#a8771a' : d != null && d >= 0.25 ? C.up : d != null && d <= -0.25 ? C.down : C.soft) + '"' + (s.solid ? '' : ' font-style="italic"') + '>' + esc(sub) + '</text>';
    });
    return o + '</svg>';
  }

  // ---------- v142 practice: minutes per skill, logged by focus ----------
  // Each log entry: { id, date: 'YYYY-MM-DDT12:00:00' (local), player, spoke, focus, min }.
  // v145 club practice is Distance control or Mechanics (takeaway, swing plane, weight transfer ...).
  var FOCUS = {
    drive: ['Distance control', 'Mechanics'],
    irons: ['Distance control', 'Mechanics'],
    wedges: ['Distance control', 'Mechanics'],
    chip: ['Green-side chipping', 'Pitching'],
    bunker: ['Bunker shots', 'Distance control'], // v157: own skill; older chip / "Bunker shots" logs are read as Bunker
    lag: ['Lag putting', 'Putting speed control'],
    short: ['Short putts', 'Start line / gate drill']
  };
  var SPOKE_KEYS = SPOKES.map(function (s) { return s.k; });
  function validPractice(list) {
    return (Array.isArray(list) ? list : []).filter(function (e) {
      return e && typeof e.id === 'string' && e.id && SPOKE_KEYS.indexOf(e.spoke) >= 0 && typeof e.date === 'string' && !isNaN(Date.parse(e.date)) && Number(e.min) > 0 && Number(e.min) <= 600; })
      .map(function (e) { var f = String(e.focus || '').slice(0, 60);
        return { id: e.id, date: e.date, player: String(e.player || ''), spoke: e.spoke === 'chip' && f === 'Bunker shots' ? 'bunker' : e.spoke, focus: f, min: Math.round(Number(e.min)) }; });
  }
  // Union by id: entries already on the phone stay as they are.
  function mergePractice(existing, incoming) {
    var have = {}, out = validPractice(existing); out.forEach(function (e) { have[e.id] = 1; });
    var added = 0; validPractice(incoming).forEach(function (e) { if (!have[e.id]) { have[e.id] = 1; out.push(e); added++; } });
    return { practice: out, added: added };
  }
  // Minutes per spoke (and per focus) in a [from, to) window; sessions = distinct days.
  function practiceShape(logs, w) {
    var by = {}, foc = {}, days = {}, total = 0;
    SPOKES.forEach(function (s) { by[s.k] = 0; foc[s.k] = {}; });
    validPractice(logs).forEach(function (e) { var t = Date.parse(e.date); if (!(t >= w[0] && t < w[1])) return;
      by[e.spoke] += e.min; total += e.min; days[e.date.slice(0, 10)] = 1; var f = e.focus || 'Other'; foc[e.spoke][f] = (foc[e.spoke][f] || 0) + e.min; });
    return { total: total, sessions: Object.keys(days).length,
      spokes: SPOKES.map(function (s) { return { k: s.k, name: s.name, min: by[s.k], share: total ? by[s.k] / total : 0, focus: foc[s.k] }; }) };
  }
  function hm(min) { min = Math.round(min); var h = Math.floor(min / 60), m = min % 60; return h ? h + ' h' + (m ? ' ' + m + ' min' : '') : m + ' min'; }
  function practiceBuild(logs, opts) {
    opts = opts || {};
    var p = period(opts.period), W = windows(p.id, opts.now), cur = practiceShape(logs, W.cur), prev = W.prev ? practiceShape(logs, W.prev) : null;
    if (prev && !prev.total) prev = null;
    var top = cur.spokes.slice().sort(function (a, b) { return b.min - a.min; })[0];
    return { period: p, cur: cur, prev: prev,
      headline: cur.total ? hm(cur.total) + ' in ' + cur.sessions + ' session' + (cur.sessions === 1 ? '' : 's') : 'No practice logged yet',
      lede: cur.total ? 'Most time: ' + top.name.toLowerCase() + ' (' + Math.round(top.share * 100) + '%).' + (prev ? ' ' + hm(prev.total) + ' in the ' + (p.id === '1y' ? 'year before' : 'previous ' + p.short) + '.' : '')
        : 'Log time on each skill after you practice – it fills this chart.' };
  }
  // Practice chart: spoke length = share of practice time (the busiest spoke reaches the edge).
  function practiceSVG(cur, prev, opts) {
    opts = opts || {};
    var R = opts.R || 96, pad = 76, w = 2 * (R + pad), h = 2 * R + 72;
    var max = Math.max.apply(null, cur.spokes.map(function (s) { return s.min; }).concat(prev ? prev.spokes.map(function (s) { return s.min; }) : [], [1]));
    var o = '<svg class="radar" viewBox="' + (-w / 2) + ' ' + (-R - 36) + ' ' + w + ' ' + h + '" role="img" aria-label="' + esc(opts.aria || 'Practice time by skill') + '">';
    var poly = function (rs) { return rs.map(function (r, i) { return pt(i, r).join(','); }).join(' '); };
    for (var k = 1; k <= 4; k++) o += '<polygon points="' + poly(SPOKES.map(function () { return R * k / 4; })) + '" fill="none" stroke="rgba(23,48,31,.15)"/>';
    SPOKES.forEach(function (s, i) { var e = pt(i, R); o += '<line x1="0" y1="0" x2="' + e[0] + '" y2="' + e[1] + '" stroke="rgba(23,48,31,.15)"/>'; });
    var rs = function (S) { return S.spokes.map(function (s) { return Math.max(R * 0.04, R * s.min / max); }); };
    if (prev) o += '<polygon class="pprev" points="' + poly(rs(prev)) + '" fill="rgba(138,154,143,.22)" stroke="#8a9a8f" stroke-width="2"/>';
    if (cur.total) { var cr = rs(cur); o += '<polygon class="pcur" points="' + poly(cr) + '" fill="rgba(47,111,201,.25)" stroke="#2f6fc9" stroke-width="2.5"/>';
      cur.spokes.forEach(function (s, i) { if (!s.min) return; var q = pt(i, cr[i]); o += '<circle cx="' + q[0] + '" cy="' + q[1] + '" r="4" fill="#2f6fc9"/>'; }); }
    cur.spokes.forEach(function (s, i) {
      var q = pt(i, R + 20), anchor = Math.abs(q[0]) < 10 ? 'middle' : q[0] > 0 ? 'start' : 'end';
      o += '<text x="' + q[0] + '" y="' + (q[1] - 2) + '" text-anchor="' + anchor + '" font-size="12.5" font-weight="600" fill="#17301f">' + esc(s.name) + '</text>';
      o += '<text x="' + q[0] + '" y="' + (q[1] + 13) + '" text-anchor="' + anchor + '" font-size="11.5" fill="#3f5a48">' + (s.min ? esc(hm(s.min)) : '–') + '</text>';
    });
    return o + '</svg>';
  }

  // ---------- v155 practice LEVEL: builds with each session, fades without practice, measured against the benchmark group ----------
  // Training-load science: chronic load is an exponentially weighted moving average of daily load (Banister fitness-fatigue model;
  // Williams et al. 2017 EWMA; TrainingPeaks CTL). Chronic time constant 42 days: each day the level moves 1/42 of the way to that
  // day's practice, so a steady habit is ~63% built after 6 weeks and ~88% after 3 months, and a stopped habit halves in ~29 days.
  // Acute (this week's pace) uses 7 days. Level = minutes per week, per skill.
  var TAU = 42, TAU_ACUTE = 7;
  // Average practice (hours a week, not counting rounds) of each benchmark group. Estimates from published sources – see README v155.
  var PRAC_BENCH = {
    pga: { h: 25, who: 'PGA Tour players' }, lpga: { h: 25, who: 'LPGA Tour players' },
    d1m: { h: 20, who: 'D1 college men' }, d1w: { h: 20, who: 'D1 college women' },
    scm: { h: 7, who: 'scratch men' }, scw: { h: 7, who: 'scratch women' } };
  var CLUB_AVG_H = 3; // average club golfer (Golf Insider study of 257 golfers)
  // How elite players split it: ~40% full swing, ~60% short game and putting (LPGA player reports: 60–75% short game / putting).
  var PRAC_SPLIT = { drive: 0.12, irons: 0.14, wedges: 0.14, chip: 0.14, bunker: 0.06, lag: 0.18, short: 0.22 }; // v157: Bunker split off chipping
  function practiceBench(bl) { var b = PRAC_BENCH[bl] || PRAC_BENCH.pga; return { id: PRAC_BENCH[bl] ? bl : 'pga', h: b.h, who: b.who,
    spokes: SPOKES.map(function (s) { return { k: s.k, wk: b.h * 60 * PRAC_SPLIT[s.k] }; }) }; }
  // Level (minutes a week) per skill on the day `at`, from every session on or before it.
  function practiceLevel(logs, at, tau, bl) {
    tau = tau || TAU; var t = at == null ? Date.now() : +at, a = 1 - Math.exp(-1 / tau), by = {}, B = practiceBench(bl);
    SPOKES.forEach(function (s) { by[s.k] = 0; });
    validPractice(logs).forEach(function (e) { var te = Date.parse(e.date); if (!(te <= t + DAY / 2)) return;
      var d = Math.max(0, Math.round((t - te) / DAY)); by[e.spoke] += e.min * a * Math.exp(-d / tau); });
    var spokes = SPOKES.map(function (s, i) { var wk = by[s.k] * 7, target = B.spokes[i].wk; return { k: s.k, name: s.name, wk: wk, target: target, frac: target ? wk / target : 0 }; });
    var wk = spokes.reduce(function (x, s) { return x + s.wk; }, 0);
    return { wk: wk, frac: wk / (B.h * 60), bench: B, spokes: spokes };
  }
  // Level radar: the outer ring is the benchmark group's average for that skill; rings at 25 / 50 / 75 / 100 %.
  // Radius = sqrt(share of the benchmark) so early practice is visible (4% draws at 20% of the radius) while the ring still means 100%.
  function practiceLevelSVG(cur, prev, opts) {
    opts = opts || {};
    var R = opts.R || 96, pad = 76, w = 2 * (R + pad), h = 2 * R + 72, CAP = 1.15;
    var o = '<svg class="radar prlevel" viewBox="' + (-w / 2) + ' ' + (-R - 36) + ' ' + w + ' ' + h + '" role="img" aria-label="' + esc(opts.aria || 'Practice level by skill') + '">';
    var poly = function (rs) { return rs.map(function (r, i) { return pt(i, r).join(','); }).join(' '); };
    for (var k = 1; k <= 3; k++) o += '<polygon points="' + poly(SPOKES.map(function () { return R * Math.sqrt(k / 4); })) + '" fill="none" stroke="rgba(23,48,31,.15)"/>';
    o += '<polygon class="pbench" points="' + poly(SPOKES.map(function () { return R; })) + '" fill="none" stroke="#17301f" stroke-width="1.5" stroke-dasharray="4 4"/>';
    SPOKES.forEach(function (s, i) { var e = pt(i, R); o += '<line x1="0" y1="0" x2="' + e[0] + '" y2="' + e[1] + '" stroke="rgba(23,48,31,.15)"/>'; });
    var rs = function (L) { return L.spokes.map(function (s) { return Math.max(R * 0.03, R * Math.sqrt(Math.min(CAP, s.frac))); }); };
    if (prev && prev.wk >= 1) o += '<polygon class="pprev" points="' + poly(rs(prev)) + '" fill="rgba(138,154,143,.22)" stroke="#8a9a8f" stroke-width="2"/>';
    if (cur.wk >= 1) { var cr = rs(cur); o += '<polygon class="pcur" points="' + poly(cr) + '" fill="rgba(47,111,201,.25)" stroke="#2f6fc9" stroke-width="2.5"/>';
      cur.spokes.forEach(function (s, i) { if (s.wk < 1) return; var q = pt(i, cr[i]); o += '<circle cx="' + q[0] + '" cy="' + q[1] + '" r="4" fill="#2f6fc9"/>'; }); }
    cur.spokes.forEach(function (s, i) {
      var q = pt(i, R + 20), anchor = Math.abs(q[0]) < 10 ? 'middle' : q[0] > 0 ? 'start' : 'end';
      o += '<text x="' + q[0] + '" y="' + (q[1] - 2) + '" text-anchor="' + anchor + '" font-size="12.5" font-weight="600" fill="#17301f">' + esc(s.name) + '</text>';
      o += '<text class="plv" x="' + q[0] + '" y="' + (q[1] + 13) + '" text-anchor="' + anchor + '" font-size="11.5" fill="#3f5a48">' + (s.wk >= 1 ? esc(hm(s.wk)) + '/wk' : '–') + '</text>';
    });
    return o + '</svg>';
  }
  // What the level card says: level now, vs the benchmark, and whether this week is building it up or letting it fade.
  function practiceLevelText(logs, opts) {
    opts = opts || {}; var now = opts.now == null ? Date.now() : +opts.now, p = period(opts.period);
    var L = practiceLevel(logs, now, TAU, opts.bl), A = practiceLevel(logs, now, TAU_ACUTE, opts.bl), P = p.days ? practiceLevel(logs, now - p.days * DAY, TAU, opts.bl) : null;
    var pc = Math.round(L.frac * 100), lvl = L.wk >= 1 ? hm(L.wk) + ' a week' : 'nothing yet';
    var headline = L.wk >= 1 ? 'Practice level: ' + lvl : 'No practice level yet';
    var lede = L.bench.who.charAt(0).toUpperCase() + L.bench.who.slice(1) + ' average about ' + L.bench.h + ' h a week' + (L.wk >= 1 ? ' – you are at ' + (pc < 1 ? 'under 1' : pc) + '% of that.' : '.');
    var trend = '';
    if (L.wk >= 1) { var r = A.wk / L.wk;
      trend = r >= 1.3 ? 'This week’s pace (' + hm(A.wk) + ' a week) is building it up.' : r <= 0.7 ? 'Quieter week – your level is fading (' + hm(A.wk) + ' a week pace).' : 'This week’s pace is holding it steady.'; }
    return { level: L, acute: A, prev: P && P.wk >= 1 ? P : null, headline: headline, lede: lede, trend: trend, clubH: CLUB_AVG_H };
  }

  // ---------- v143 strokes lost vs practice time ----------
  // Share of the strokes lost (spokes below the benchmark) next to share of practice time, per spoke.
  // The headline names the biggest gap: a skill that costs a lot of strokes but gets little practice.
  function practiceVsGame(game, prac) {
    var lost = game.spokes.map(function (s) { return s.value != null && s.value < 0 ? -s.value : 0; }), L = lost.reduce(function (t, x) { return t + x; }, 0);
    if (!L || !prac.total) return null;
    var rows = SPOKES.map(function (sp, i) { return { k: sp.k, name: sp.name, lostShare: lost[i] / L, timeShare: prac.spokes[i].share, lost: lost[i], min: prac.spokes[i].min }; });
    var gap = rows.slice().sort(function (a, b) { return (b.lostShare - b.timeShare) - (a.lostShare - a.timeShare); })[0];
    var pc = function (v) { return Math.round(v * 100) + '%'; }, headline, lede;
    if (gap.lostShare - gap.timeShare >= 0.15) { headline = 'Practice more ' + gap.name.toLowerCase();
      lede = gap.name + ' is ' + pc(gap.lostShare) + ' of your lost strokes but ' + pc(gap.timeShare) + ' of your practice.'; }
    else { headline = 'Your practice matches your game'; lede = 'Time on each skill is close to where your strokes go.'; }
    return { rows: rows, gap: gap, headline: headline, lede: lede };
  }
  // The practice a round takeaway's "Work on next" points to: { spoke, focus }.
  var DRILL_FOCUS = { puttspeed: ['lag', 'Putting speed control'], lag: ['lag', 'Lag putting'], puttline: ['short', 'Start line / gate drill'],
    wedges: ['wedges', 'Distance control'], irondepth: ['irons', 'Distance control'], ironline: ['irons', 'Mechanics'], teepen: ['drive', 'Mechanics'], teeside: ['drive', 'Mechanics'] };
  var AREA_FOCUS = { tee: ['drive', 'Mechanics'], approach: ['irons', 'Distance control'], short: ['chip', 'Green-side chipping'], bunker: ['bunker', 'Bunker shots'], putting: ['lag', 'Lag putting'] };
  function drillFocus(f) {
    if (!f) return null;
    var x = f.id === 'chips' ? ['chip', 'Green-side chipping'] : f.id === 'bunker' ? ['bunker', 'Bunker shots'] : DRILL_FOCUS[f.id] || AREA_FOCUS[f.area];
    return x ? { spoke: x[0], focus: x[1] } : null;
  }

  var FOCUS_HINT = { Mechanics: 'takeaway, swing plane, weight transfer…' };
  var API = { TAU: TAU, TAU_ACUTE: TAU_ACUTE, PRAC_BENCH: PRAC_BENCH, PRAC_SPLIT: PRAC_SPLIT, CLUB_AVG_H: CLUB_AVG_H, practiceBench: practiceBench, practiceLevel: practiceLevel, practiceLevelSVG: practiceLevelSVG, practiceLevelText: practiceLevelText,
    STRONG: STRONG, FOCUS: FOCUS, FOCUS_HINT: FOCUS_HINT, validPractice: validPractice, mergePractice: mergePractice, practiceShape: practiceShape, practiceBuild: practiceBuild, practiceSVG: practiceSVG,
    practiceVsGame: practiceVsGame, drillFocus: drillFocus, hm: hm,
    SPOKES: SPOKES, PERIODS: PERIODS, MIN_ROUNDS: MIN_ROUNDS, period: period, windows: windows, shape: shape, build: build, radarSVG: radarSVG, radius: radius, fmt: fmt, RING: RING };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.MYGAME = API;
})(this);
