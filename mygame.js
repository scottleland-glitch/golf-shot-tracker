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
  var DAY = 86400000, MIN_ROUNDS = 2, STRONG = 3, USUAL_N = 20, USUAL_MIN = 3;
  function period(id) { if (id && typeof id === 'object') return id; return PERIODS.filter(function (p) { return p.id === id; })[0] || PERIODS[1]; }
  // v176 (Scott): "last 2 / 3 / 4 rounds" – e.g. just the rounds of a tournament. A period object carrying its own window:
  // cur = from the Nth newest finished round on, prev = the N rounds before that. Pass it anywhere a period id goes.
  var ROUND_COUNTS = [1, 2, 3, 4]; // v183: + just the last round
  function roundPeriod(n, rounds) {
    var t = (rounds || []).map(function (r) { return Date.parse(r.date); }).filter(function (x) { return !isNaN(x); }).sort(function (a, b) { return b - a; });
    var from = t.length ? t[Math.min(n, t.length) - 1] : Date.now(), pfrom = t.length > n ? t[Math.min(2 * n, t.length) - 1] : null;
    return { id: 'r' + n, n: n, name: n === 1 ? 'Last round' : 'Last ' + n + ' rounds', short: n === 1 ? 'round' : n + ' rounds', days: null, win: { cur: [from, Infinity], prev: pfrom == null ? null : [pfrom, from] } };
  }
  // [from, to) in ms for the period and the one before it (all time has none before it).
  function windows(id, now) {
    var p = period(id), t = now == null ? Date.now() : +now;
    if (p.win) return p.win;
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
    var bl = SG.baseline(opts.baseline).id, blName = opts.baselineName || SG.baseline(bl).name, p = period(opts.period), W = windows(p, opts.now);
    var cur = shape(rounds.filter(function (r) { return inWin(r, W.cur); }), SG, bl), isR = !!p.win, prev = null, know = cur;
    // v185 (Scott): compare with "your usual" – the USUAL_N rounds before the time frame (at least USUAL_MIN) – a steady
    // baseline that doesn't overlap what it judges. The year keeps the year before; all time has nothing before it.
    if (p.id === '1y') { prev = shape(rounds.filter(function (r) { return inWin(r, W.prev); }), SG, bl); if (!prev.rounds) prev = null; }
    else if (p.id !== 'all') {
      var before = rounds.filter(function (r) { var t = Date.parse(r.date); return !isNaN(t) && t < W.cur[0]; }).sort(function (a, b) { return Date.parse(b.date) - Date.parse(a.date); }).slice(0, USUAL_N);
      if (before.length >= USUAL_MIN) { prev = shape(before, SG, bl); prev.usual = true; }
    }
    // v185: the round views describe what happened (no "learning"); how well the app knows the game comes from all the rounds
    if (isR) { cur.spokes.forEach(function (s) { s.solid = s.value != null; }); know = shape(rounds, SG, bl); }
    var solid = cur.spokes.filter(function (s) { return s.solid; }), headline, lede;
    var moves = prev ? cur.spokes.map(function (s, i) { var q = prev.spokes[i]; return s.solid && (q.solid || (prev.usual && q.value != null && q.n >= q.need / 2)) ? { s: s, d: s.value - q.value } : null; }).filter(Boolean) : [];
    var up = moves.slice().sort(function (a, b) { return b.d - a.d; })[0], down = moves.slice().sort(function (a, b) { return a.d - b.d; })[0];
    var bef = p.id === '1y' ? 'the year before' : 'your usual', one = isR && p.n === 1, thisW = one ? 'this round' : isR ? 'these rounds' : '';
    if (!solid.length) { headline = 'Still learning your game'; lede = cur.rounds ? 'Play a few more rounds – each skill fills in as its shots come in.' : 'No finished rounds in this period yet.'; }
    else if (isR && moves.length) { // a round (or a few): where it beat your usual and where it cost you
      var bits = [];
      if (up && up.d >= 0.5) bits.push(up.s.name + ' ' + Math.abs(up.d).toFixed(1) + ' better than usual');
      if (down && down.d <= -0.5) bits.push(down.s.name.toLowerCase() + ' ' + Math.abs(down.d).toFixed(1) + ' worse');
      headline = down && down.d <= -0.5 && (!up || -down.d >= up.d) ? down.s.name + ' cost you ' + thisW : up && up.d >= 0.5 ? up.s.name + ' beat your usual' : 'Close to your usual game';
      lede = bits.length ? cap(bits.join(', ')) + ' (strokes a round).' : 'No skill was more than half a stroke a round from your usual.';
    }
    else if (up && up.d >= 0.5 && (!down || up.d >= -down.d)) { headline = up.s.name + ' is improving'; lede = up.s.name + ' is ' + Math.abs(up.d).toFixed(1) + ' strokes a round better than ' + bef + '.'; }
    else if (down && down.d <= -0.5) { headline = down.s.name + ' has slipped'; lede = down.s.name + ' is ' + Math.abs(down.d).toFixed(1) + ' strokes a round worse than ' + bef + '.'; }
    else if (moves.length) { headline = 'Holding steady'; lede = 'No skill moved more than half a stroke a round from ' + bef + '.'; }
    else {
      var worst = solid.slice().sort(function (a, b) { return a.value - b.value; })[0], best = solid.slice().sort(function (a, b) { return b.value - a.value; })[0];
      headline = worst.name + ' costs you the most';
      lede = fmt(worst.value) + ' strokes a round against the ' + blName + ' average' + (best !== worst ? '. Strongest: ' + best.name.toLowerCase() + ' (' + fmt(best.value) + ').' : '.');
    }
    return { period: p, baseline: bl, baselineName: blName, cur: cur, prev: prev, know: know, headline: headline, lede: lede,
      prevName: prev ? (prev.usual ? 'your usual' : 'the year before') : '', prevLabel: prev ? (prev.usual ? 'Your usual (' + prev.rounds + ' rounds before)' : 'Year before') : '' };
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
      var q = pt(i, R + 20), anchor = Math.abs(q[0]) < 10 ? 'middle' : q[0] > 0 ? 'start' : 'end', d = prev && s.solid && (prev.spokes[i].solid || (prev.usual && prev.spokes[i].value != null)) ? s.value - prev.spokes[i].value : null;
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
    var p = period(opts.period), W = windows(p, opts.now), cur = practiceShape(logs, W.cur), prev = W.prev ? practiceShape(logs, W.prev) : null;
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

  // ---------- v162 Playing: practice rounds vs tournament rounds (Scott) ----------
  // A round's type lives on round.play: 'practice' | 'tournament' (untagged = older rounds, before v162).
  var PLAY_KINDS = [{ k: 'practice', name: 'Practice rounds', short: 'Practice' }, { k: 'tournament', name: 'Tournament rounds', short: 'Tournament' }];
  function playOf(r) { return r && (r.play === 'practice' || r.play === 'tournament') ? r.play : ''; }
  function inWin(r, w) { var t = +new Date(r.date); return w && t >= w[0] && t < w[1]; }
  // holes played (any round, finished or not) per type in a window – 9 holes = half a round
  function playTally(rounds, SG, w) {
    var o = { practice: { holes: 0, rounds: 0 }, tournament: { holes: 0, rounds: 0 }, '': { holes: 0, rounds: 0 } };
    rounds.forEach(function (r) { if (!inWin(r, w)) return; var n = SG.summarize(r).holesDone; if (!n) return; var t = o[playOf(r)]; t.holes += n; t.rounds++; });
    return o;
  }
  function holesText(h) { var r = h / 18, whole = Math.floor(r + 1e-9), half = r - whole >= 0.5 - 1e-9;
    var rt = (whole || !half ? whole : '') + (half ? '½' : ''); return rt + ' round' + (r > 1 ? 's' : '') + ' · ' + h + ' hole' + (h === 1 ? '' : 's'); }
  function playingBuild(rounds, SG, opts) {
    opts = opts || {};
    var p = period(opts.period), W = windows(p, opts.now), cur = playTally(rounds, SG, W.cur), prev = W.prev ? playTally(rounds, SG, W.prev) : null;
    var tot = cur.practice.holes + cur.tournament.holes, ptot = prev ? prev.practice.holes + prev.tournament.holes : 0;
    var max = Math.max(1, cur.practice.holes, cur.tournament.holes, prev ? prev.practice.holes : 0, prev ? prev.tournament.holes : 0);
    var since = p.id === '1y' ? 'the year before' : 'the previous ' + p.short;
    return { period: p, cur: cur, prev: prev && ptot ? prev : null, max: max, untagged: cur[''],
      rows: PLAY_KINDS.map(function (K) { var c = cur[K.k], q = prev && ptot ? prev[K.k] : null;
        return { k: K.k, name: K.name, short: K.short, holes: c.holes, rounds: c.rounds, prevHoles: q ? q.holes : null, text: c.holes ? holesText(c.holes) : 'none yet',
          frac: c.holes / max, prevFrac: q ? q.holes / max : null }; }),
      headline: tot ? holesText(tot) + ' played' : 'No tagged rounds yet',
      lede: tot ? (cur.tournament.holes ? Math.round(100 * cur.tournament.holes / tot) + '% of it in tournaments.' : 'All practice rounds so far.') + (ptot ? ' ' + holesText(ptot).split(' · ')[1] + ' in ' + since + '.' : '')
        : 'Pick Practice or Tournament when you start a round – each one fills these bars.' };
  }
  // ---------- v164 Season histogram (Scott): rounds per month over the last 12 months, against each benchmark's season ----------
  // Tournament rounds an average player in each benchmark group plays per month (Jan..Dec). Built from published schedules and counts:
  //  · PGA Tour: 2026 schedule, events by start month (Jan 4, Feb 4, Mar 5, Apr 5, May 5, Jun 5, Jul 6, Aug 4, Sep 2, Oct 5, Nov 2, Dec 0 –
  //    The Golf News Net); an average player makes about 23 starts × ~3.2 rounds (cuts) ≈ 74 rounds a year, spread like the schedule.
  //  · LPGA Tour: 2026 schedule (Jan 1, Feb 2, Mar 3, Apr 4, May 3, Jun 4, Jul 3, Aug 3, Sep 1, Oct 4, Nov 3 – The Golf News Net);
  //    about 20 starts × ~3.3 rounds ≈ 66 rounds a year, spread like the schedule.
  //  · D1 college: NCAA Division I teams get 24 regular-season competition days plus conference, Regionals and Nationals (Clippd);
  //    a D1 woman plays about 19.5 competitive rounds a year, a D1 man about 17.8 (Mikkel Bjerch-Andresen, "71 scorecards");
  //    fall Sep–Nov, spring Feb–May with the postseason in Apr–May (Duke women: 4 fall + 4 spring events – Duke Chronicle).
  //    College events only – summer amateur events are not in it.
  //  · Scratch amateurs: USGA player-development guidance – 8–12 multi-round tournaments a year, no more than 20 (USGA ADM
  //    training & competition chart); 10 events × ~2.5 rounds = 25 rounds over the Apr–Oct amateur season, most in summer.
  function spread(total, w) { var t = w.reduce(function (a, x) { return a + x; }, 0); return w.map(function (x) { return total * x / t; }); }
  var SEASON_BENCH = {
    pga: { who: 'PGA Tour players', perYear: 74, months: spread(74, [4, 4, 5, 5, 5, 5, 6, 4, 2, 5, 2, 0]), src: 'the 2026 PGA Tour schedule and about 23 starts a year' },
    lpga: { who: 'LPGA Tour players', perYear: 66, months: spread(66, [1, 2, 3, 4, 3, 4, 3, 3, 1, 4, 3, 0]), src: 'the 2026 LPGA Tour schedule and about 20 starts a year' },
    d1w: { who: 'D1 college women', perYear: 19.5, months: [0, 2, 3.5, 4, 1, 0, 0, 0, 3, 4.5, 1.5, 0], src: 'NCAA Division I rules and published counts (about 19.5 college rounds a year)' },
    d1m: { who: 'D1 college men', perYear: 17.8, months: [0, 2.5, 3.5, 3, 0.8, 0, 0, 0, 2.5, 4, 1.5, 0], src: 'NCAA Division I rules and published counts (about 17.8 college rounds a year)' },
    scm: { who: 'scratch amateurs', perYear: 25, months: spread(25, [0, 0, 0, 2, 3, 5, 5, 5, 3, 2, 0, 0]), src: 'USGA guidance of 8–12 multi-round events a year' },
    scw: { who: 'scratch amateurs', perYear: 25, months: spread(25, [0, 0, 0, 2, 3, 5, 5, 5, 3, 2, 0, 0]), src: 'USGA guidance of 8–12 multi-round events a year' }
  };
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  // months: the last 12 calendar months ending with the current one; rounds = holes / 18 (9 holes = ½), by round type
  function seasonBuild(rounds, SG, opts) {
    opts = opts || {}; var now = new Date(opts.now == null ? Date.now() : +opts.now), B = SEASON_BENCH[opts.baseline] || SEASON_BENCH.pga;
    var key = function (d) { return d.getFullYear() * 12 + d.getMonth(); }, k0 = key(now) - 11, by = {};
    rounds.forEach(function (r) { var d = new Date(r.date), k = key(d); if (k < k0 - 12 || k > key(now)) return; var n = SG.summarize(r).holesDone; if (!n) return;
      var o = by[k] = by[k] || { practice: 0, tournament: 0, '': 0 }; o[playOf(r)] += n / 18; });
    var months = [], hadPrev = false;
    for (var k = k0; k <= key(now); k++) { var o = by[k] || { practice: 0, tournament: 0, '': 0 }, q = by[k - 12], mi = ((k % 12) + 12) % 12;
      if (q) hadPrev = true;
      months.push({ key: k, m: mi, label: MON[mi], year: Math.floor(k / 12), practice: o.practice, tournament: o.tournament, untagged: o[''], total: o.practice + o.tournament + o[''],
        prev: q ? q.practice + q.tournament + q[''] : 0, bench: B.months[mi] }); }
    var sum = function (f) { return months.reduce(function (a, x) { return a + f(x); }, 0); };
    var T = sum(function (x) { return x.tournament; }), P = sum(function (x) { return x.practice; }), U = sum(function (x) { return x.untagged; }), BY = sum(function (x) { return x.bench; });
    var cur = months[months.length - 1], prevYear = sum(function (x) { return x.prev; });
    var rt = function (v) { var w = Math.floor(v + 1e-9), h = v - w >= 0.5 - 1e-9; return (w || !h ? w : '') + (h ? '½' : ''); };
    var out = { bench: B, months: months, tournament: T, practice: P, untagged: U, benchYear: BY, hasPrev: hadPrev, prevYear: prevYear };
    var withB = !!opts.bench; out.withBench = withB;
    out.max = Math.max(1, Math.max.apply(null, months.map(function (x) { return Math.max(x.total, withB ? x.bench : 0, x.prev); })));
    var all = T + P + U;
    out.headline = all ? rt(all) + ' round' + (all === 1 ? '' : 's') + ' in the last 12 months' : 'No rounds in the last 12 months';
    out.lede = all ? rt(T) + ' tournament, ' + rt(P) + ' practice' + (U ? ', ' + rt(U) + ' not tagged' : '') + '.' + (hadPrev ? ' ' + rt(prevYear) + ' in the 12 months before.' : '') +
      (withB ? ' ' + cap(B.who) + ' play about ' + Math.round(BY) + ' tournament rounds a year.' : '') : 'Each round you play adds to its month.';
    out.month = 'This month (' + cur.label + '): ' + rt(cur.tournament) + ' tournament' + (cur.practice ? ' + ' + rt(cur.practice) + ' practice' : '') + (withB ? ' · ' + B.who + ' about ' + (Math.round(cur.bench * 2) / 2) : '') + (hadPrev ? ' · last ' + cur.label + ' ' + rt(cur.prev) : '');
    return out;
  }
  function cap(t) { return t.charAt(0).toUpperCase() + t.slice(1); }
  // v164b (Scott): 3-D columns, a little offset – tournament in front, practice just behind (and untagged behind that) so a taller
  // column never hides a shorter one; the benchmark is a dashed line, last year a thin grey line
  function seasonSVG(S, opts) {
    opts = opts || {}; var W = 340, H = 204, L = 24, B0 = 170, top = 18, cw = (W - L - 12) / 12, sc = (B0 - top) / S.max, o = '';
    var y = function (v) { return B0 - v * sc; }, step = S.max > 8 ? 2 : 1, f = function (v) { return v.toFixed(1); };
    var DX = 7.5, DY = 4.5, bw = cw * 0.4, LAY = [['tournament', '#c99a2b', '#e2bd5e', '#9c761c'], ['practice', '#4fa874', '#7cc79a', '#357f53'], ['untagged', '#a9b6c2', '#c9d3dc', '#83919e']];
    var nL = S.untagged ? 3 : 2;
    o += '<svg class="plseason" id="plseason" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc('Rounds per month, last 12 months: ' + S.months.map(function (x) { return x.label + ' ' + x.tournament + ' tournament, ' + x.practice + ' practice'; }).join('; ')) + '">';
    for (var g = 0; g <= S.max + 1e-9; g += step) o += '<line x1="' + L + '" x2="' + W + '" y1="' + f(y(g)) + '" y2="' + f(y(g)) + '" class="plgrid"/><text x="' + (L - 5) + '" y="' + f(y(g) + 3.5) + '" text-anchor="end" class="plax">' + g + '</text>';
    var cx = function (i) { return L + 4 + i * cw + cw / 2; };
    S.months.forEach(function (x, i) {
      for (var l = nL - 1; l >= 0; l--) { var Z = LAY[l], v = x[Z[0]]; if (!v) continue;
        var x0 = cx(i) - bw / 2 - (nL - 1) * DX / 2 + l * DX, base = B0 - l * DY, h = v * sc, yt = base - h, d = 3.4;
        o += '<g class="plcube" data-k="' + Z[0] + '" data-m="' + i + '" data-v="' + v + '">' +
          '<path d="M' + f(x0 + bw) + ' ' + f(yt) + ' l' + d + ' ' + (-d * 0.8) + ' v' + f(h) + ' l' + (-d) + ' ' + (d * 0.8) + 'z" fill="' + Z[3] + '"/>' +
          '<path d="M' + f(x0) + ' ' + f(yt) + ' l' + d + ' ' + (-d * 0.8) + ' h' + f(bw) + ' l' + (-d) + ' ' + (d * 0.8) + 'z" fill="' + Z[2] + '"/>' +
          '<rect x="' + f(x0) + '" y="' + f(yt) + '" width="' + f(bw) + '" height="' + f(h) + '" fill="' + Z[1] + '"/></g>'; }
      o += '<text x="' + f(cx(i)) + '" y="' + (B0 + 13) + '" text-anchor="middle" class="plax' + (i === 11 ? ' now' : '') + '">' + x.label.charAt(0) + '</text>' +
        (x.m === 0 || i === 0 ? '<text x="' + f(cx(i)) + '" y="' + (B0 + 25) + '" text-anchor="middle" class="plyr">' + x.year + '</text>' : '');
    });
    o += '<line x1="' + L + '" x2="' + W + '" y1="' + B0 + '" y2="' + B0 + '" class="plbase"/>';
    var line = function (key, cls) { var pts = S.months.map(function (x, i) { return f(cx(i)) + ',' + f(y(x[key])); }).join(' ');
      return '<polyline class="' + cls + '" points="' + pts + '"/>' + S.months.map(function (x, i) { return '<circle class="' + cls + 'd" cx="' + f(cx(i)) + '" cy="' + f(y(x[key])) + '" r="2.4"/>'; }).join(''); };
    if (S.hasPrev) o += line('prev', 'plprevl');
    if (S.withBench) o += line('bench', 'plbenchl');
    return o + '</svg>';
  }


  // ---------- v184 (Scott): play and practice by WEEK, both in hours, in a window you swipe back through ----------
  // A round counts as time: 18 holes = 5 h (round + warm-up), 9 holes = 2.5 h – so it sits on the same scale as logged practice.
  // Weeks run Monday–Sunday. The benchmark's tournament rounds per month are spread evenly over that month's weeks (× 5 h).
  var ROUND_H = 5, WEEK = 7 * DAY;
  function monday(t) { var d = new Date(t); d.setHours(0, 0, 0, 0); var wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return d.getTime(); }
  function weekIdx(t, m0) { return Math.round((monday(t) - m0) / WEEK); } // round(): a DST change is an hour off a whole week
  function playWeeksBuild(rounds, logs, SG, opts) {
    opts = opts || {}; var now = opts.now == null ? Date.now() : +opts.now, B = SEASON_BENCH[opts.baseline] || SEASON_BENCH.pga, withB = !!opts.bench;
    var mNow = monday(now), first = mNow;
    var rs = (rounds || []).map(function (r) { var t = Date.parse(r.date), n = isNaN(t) ? 0 : SG.summarize(r).holesDone; return n && t <= now + DAY ? { t: t, h: n / 18 * ROUND_H, k: playOf(r) } : null; }).filter(Boolean);
    var ps = (logs || []).map(function (e) { var t = Date.parse(e.date + (String(e.date).length <= 10 ? 'T12:00:00' : '')); return !isNaN(t) && e.min > 0 && t <= now + DAY ? { t: t, h: e.min / 60 } : null; }).filter(Boolean);
    rs.concat(ps).forEach(function (x) { first = Math.min(first, monday(x.t)); });
    // at least 16 weeks shown, at most two years back
    first = Math.max(Math.min(first, mNow - 15 * WEEK), mNow - 103 * WEEK);
    var n = Math.round((mNow - first) / WEEK) + 1, weeks = [];
    for (var i = 0; i < n; i++) { var t0 = new Date(first); t0.setDate(t0.getDate() + i * 7); var mid = new Date(t0.getTime() + 3.5 * DAY), mi = mid.getMonth();
      var dim = new Date(mid.getFullYear(), mi + 1, 0).getDate();
      weeks.push({ i: i, start: t0.getTime(), m: mi, year: mid.getFullYear(), day: t0.getDate(), tournament: 0, practice: 0, untagged: 0, rounds: 0, prac: 0, total: 0, bench: B.months[mi] * 7 / dim * ROUND_H }); }
    rs.forEach(function (x) { var w = weeks[weekIdx(x.t, first)]; if (!w) return; w[x.k || 'untagged'] += x.h; w.total += x.h; w.rounds += x.h / ROUND_H; });
    ps.forEach(function (x) { var w = weeks[weekIdx(x.t, first)]; if (w) w.prac += x.h; });
    var out = { bench: B, weeks: weeks, withBench: withB, roundH: ROUND_H, untagged: rs.some(function (x) { return !x.k; }) };
    out.max = Math.max(2, Math.max.apply(null, weeks.map(function (w) { return Math.max(w.total, w.prac, withB ? w.bench : 0); })));
    // the read-out: the last 12 weeks (this one included)
    var last = weeks.slice(-12), sum = function (f) { return last.reduce(function (a, w) { return a + f(w); }, 0); };
    var C = sum(function (w) { return w.total; }), Pr = sum(function (w) { return w.prac; }), R = sum(function (w) { return w.rounds; }), Bh = sum(function (w) { return w.bench; });
    var hh = function (v) { return v >= 20 ? String(Math.round(v)) : (Math.round(v * 2) / 2).toString().replace('.5', '½'); };
    var rr = function (v) { var w = Math.floor(v + 1e-9), h = v - w >= 0.5 - 1e-9; return (w || !h ? w : '') + (h ? '½' : ''); };
    out.course12 = C; out.practice12 = Pr; out.rounds12 = R;
    out.ratio = C > 0 ? Pr / C : null;
    out.headline = !C && !Pr ? 'Nothing played or practised in the last 12 weeks' : !Pr ? 'No practice logged in the last 12 weeks' : !C ? hh(Pr) + ' h of practice and no rounds in the last 12 weeks'
      : (out.ratio >= 0.95 && out.ratio <= 1.05 ? 'You practise about as much as you play' : (Math.round(out.ratio * 10) / 10).toFixed(1) + ' h of practice for every hour on the course');
    out.lede = 'Last 12 weeks: ' + hh(C) + ' h on the course (' + rr(R) + ' round' + (R > 0 && R <= 1 ? '' : 's') + ') and ' + hh(Pr) + ' h of practice.' +
      (withB ? ' ' + cap(B.who) + ' spend about ' + hh(Bh) + ' h in tournament rounds over those weeks.' : '');
    out.weekText = function (w) { var d = new Date(w.start), lbl = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      var bits = [w.total ? hh(w.total) + ' h on the course (' + rr(w.rounds) + ' round' + (w.rounds > 0 && w.rounds <= 1 ? '' : 's') + ')' : 'no rounds', w.prac ? hh(w.prac) + ' h practice' : 'no practice'];
      return (w.i === weeks.length - 1 ? 'This week' : 'Week of ' + lbl) + ': ' + bits.join(' · ') + (withB ? ' · ' + B.who + (w.bench >= 0.25 ? ' about ' + hh(w.bench) + ' h' : ' no tournament rounds') : '') + '.'; };
    return out;
  }
  // The weeks as one wide SVG (scrolls sideways, newest at the right) + a fixed hours axis drawn separately so it stays put.
  var PW = { cw: 30, H: 210, B0: 176, top: 14 };
  function playWeeksSVG(S, sel) {
    var cw = PW.cw, W = S.weeks.length * cw + 8, sc = (PW.B0 - PW.top) / S.max, f = function (v) { return v.toFixed(1); }, y = function (v) { return PW.B0 - v * sc; };
    var step = S.max > 24 ? 10 : S.max > 10 ? 5 : 2, o = '<svg class="plweeks" id="plweeks" width="' + W + '" height="' + PW.H + '" viewBox="0 0 ' + W + ' ' + PW.H + '" role="img" aria-label="' +
      esc('Hours a week on the course and practising, ' + S.weeks.length + ' weeks') + '">';
    for (var g = step; g <= S.max + 1e-9; g += step) o += '<line x1="0" x2="' + W + '" y1="' + f(y(g)) + '" y2="' + f(y(g)) + '" class="plgrid"/>';
    var LAY = [['tournament', 'pltour'], ['practice', 'plprac'], ['untagged', 'plunt']], bw = 11, pw = 7;
    S.weeks.forEach(function (w, i) {
      var x0 = 4 + i * cw, on = i === sel, base = PW.B0;
      if (on) o += '<rect class="plsel" x="' + (x0 + 1) + '" y="' + (PW.top - 6) + '" width="' + (cw - 2) + '" height="' + (PW.B0 - PW.top + 6) + '" rx="5"/>';
      LAY.forEach(function (Z) { var v = w[Z[0]]; if (!v) return; var h = v * sc; base -= h;
        o += '<rect class="plbar ' + Z[1] + '" data-k="' + Z[0] + '" data-w="' + i + '" data-v="' + v + '" x="' + (x0 + 4) + '" y="' + f(base) + '" width="' + bw + '" height="' + f(h) + '"/>'; });
      if (w.prac) o += '<rect class="plbar plpr" data-k="prac" data-w="' + i + '" data-v="' + w.prac + '" x="' + (x0 + 4 + bw + 2) + '" y="' + f(y(w.prac)) + '" width="' + pw + '" height="' + f(w.prac * sc) + '" rx="1.5"/>';
      var newM = i === 0 || S.weeks[i - 1].m !== w.m;
      o += '<text x="' + (x0 + cw / 2) + '" y="' + (PW.B0 + 12) + '" text-anchor="middle" class="plax' + (i === S.weeks.length - 1 ? ' now' : '') + '">' + w.day + '</text>' +
        (newM ? '<text x="' + (x0 + 2) + '" y="' + (PW.B0 + 26) + '" class="plmon">' + MON[w.m] + (w.m === 0 || i === 0 ? ' ' + w.year : '') + '</text><line class="plmtick" x1="' + (x0 + 1) + '" x2="' + (x0 + 1) + '" y1="' + PW.B0 + '" y2="' + (PW.B0 + 28) + '"/>' : '');
      o += '<rect class="plhit" data-act="plweek" data-v="' + i + '" x="' + x0 + '" y="0" width="' + cw + '" height="' + PW.H + '"/>';
    });
    o += '<line x1="0" x2="' + W + '" y1="' + PW.B0 + '" y2="' + PW.B0 + '" class="plbase"/>';
    if (S.withBench) { var d = ''; S.weeks.forEach(function (w, i) { d += (i ? 'L' : 'M') + (4 + i * cw) + ' ' + f(y(w.bench)) + 'h' + cw; }); o += '<path class="plbenchl" d="' + d + '"/>'; }
    return o + '</svg>';
  }
  function playWeeksAxis(S) {
    var sc = (PW.B0 - PW.top) / S.max, step = S.max > 24 ? 10 : S.max > 10 ? 5 : 2, o = '<svg class="plyax" width="26" height="' + PW.H + '" aria-hidden="true">';
    for (var g = 0; g <= S.max + 1e-9; g += step) o += '<text x="22" y="' + (PW.B0 - g * sc + 3.5).toFixed(1) + '" text-anchor="end" class="plax">' + g + '</text>';
    return o + '<text x="22" y="' + (PW.B0 + 26) + '" text-anchor="end" class="plyr">h</text></svg>';
  }

  // Tournament vs practice: per-18 score and strokes gained by area. Needs MIN_EACH finished rounds of each type.
  var MIN_EACH = 2, CMP_AREAS = [['tee', 'Off the tee'], ['approach', 'Approach'], ['short', 'Around the green'], ['bunker', 'Bunker'], ['putting', 'Putting']];
  function kindAvg(list, SG, bl) {
    if (!list.length) return null;
    var a = { score: 0, toPar: 0, sg: 0, cats: {} }; CMP_AREAS.forEach(function (c) { a.cats[c[0]] = 0; });
    list.forEach(function (r) { var S = SG.summarize(r, bl), k = 18 / S.holesDone; a.score += S.strokes * k; a.toPar += S.toPar * k; a.sg += S.sgTotal * k;
      CMP_AREAS.forEach(function (c) { a.cats[c[0]] += ((S.cats[c[0]] || {}).sg || 0) * k; }); });
    var n = list.length; a.score /= n; a.toPar /= n; a.sg /= n; CMP_AREAS.forEach(function (c) { a.cats[c[0]] /= n; }); a.n = n; return a;
  }
  function kindCompare(rounds, SG, opts) {
    opts = opts || {}; var bl = opts.baseline || 'pga';
    var fin = rounds.filter(function (r) { var S = SG.summarize(r, bl); return S.holesDone && S.holesDone === r.holes.length; });
    if (opts.period) { var W = windows(opts.period, opts.now); fin = fin.filter(function (r) { return inWin(r, W.cur); }); }
    var P = fin.filter(function (r) { return playOf(r) === 'practice'; }), T = fin.filter(function (r) { return playOf(r) === 'tournament'; });
    var out = { nP: P.length, nT: T.length, need: MIN_EACH, ready: P.length >= MIN_EACH && T.length >= MIN_EACH };
    if (!out.ready) { out.headline = 'Tournament vs practice'; out.lede = 'Finish at least ' + MIN_EACH + ' tagged rounds of each to compare – you have ' + P.length + ' practice and ' + T.length + ' tournament.'; return out; }
    var a = kindAvg(P, SG, bl), b = kindAvg(T, SG, bl);
    out.practice = a; out.tournament = b; out.early = P.length < STRONG || T.length < STRONG;
    out.rows = CMP_AREAS.map(function (c) { return { k: c[0], name: c[1], practice: a.cats[c[0]], tournament: b.cats[c[0]], diff: b.cats[c[0]] - a.cats[c[0]] }; });
    var ds = b.score - a.score, worst = out.rows.slice().sort(function (x, y) { return x.diff - y.diff; })[0], best = out.rows.slice().sort(function (x, y) { return y.diff - x.diff; })[0];
    out.headline = Math.abs(ds) < 0.5 ? 'You score about the same in tournaments' : 'Tournament rounds average ' + Math.abs(ds).toFixed(1) + (ds > 0 ? ' higher' : ' lower');
    var bits = [];
    if (worst.diff <= -0.3) bits.push('The biggest drop is ' + worst.name.toLowerCase() + ': ' + Math.abs(worst.diff).toFixed(1) + ' strokes worse per round than in practice rounds.');
    if (best.diff >= 0.3) bits.push(best.name + ' holds up best – ' + best.diff.toFixed(1) + ' better in tournaments.');
    if (!bits.length) bits.push('No area changes by more than about a third of a stroke – the game travels well.');
    out.lede = bits.join(' ') + (out.early ? ' Early read – it firms up after ' + STRONG + ' of each.' : '');
    out.worst = worst.diff <= -0.3 ? worst.k : null;
    return out;
  }

  var FOCUS_HINT = { Mechanics: 'takeaway, swing plane, weight transfer…' };
  var API = { TAU: TAU, TAU_ACUTE: TAU_ACUTE, PRAC_BENCH: PRAC_BENCH, PRAC_SPLIT: PRAC_SPLIT, CLUB_AVG_H: CLUB_AVG_H, practiceBench: practiceBench, practiceLevel: practiceLevel, practiceLevelSVG: practiceLevelSVG, practiceLevelText: practiceLevelText,
    STRONG: STRONG, FOCUS: FOCUS, FOCUS_HINT: FOCUS_HINT, validPractice: validPractice, mergePractice: mergePractice, practiceShape: practiceShape, practiceBuild: practiceBuild, practiceSVG: practiceSVG,
    practiceVsGame: practiceVsGame, drillFocus: drillFocus, hm: hm,
    SEASON_BENCH: SEASON_BENCH, seasonBuild: seasonBuild, seasonSVG: seasonSVG, playWeeksBuild: playWeeksBuild, playWeeksSVG: playWeeksSVG, playWeeksAxis: playWeeksAxis, ROUND_H: ROUND_H,     PLAY_KINDS: PLAY_KINDS, playOf: playOf, playTally: playTally, playingBuild: playingBuild, kindCompare: kindCompare, holesText: holesText, MIN_EACH: MIN_EACH, CMP_AREAS: CMP_AREAS,
    SPOKES: SPOKES, PERIODS: PERIODS, MIN_ROUNDS: MIN_ROUNDS, period: period, roundPeriod: roundPeriod, ROUND_COUNTS: ROUND_COUNTS, USUAL_N: USUAL_N, USUAL_MIN: USUAL_MIN, windows: windows, shape: shape, build: build, radarSVG: radarSVG, radius: radius, fmt: fmt, RING: RING };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.MYGAME = API;
})(this);
