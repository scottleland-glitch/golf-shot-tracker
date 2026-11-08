// v141 My Game: the shape of a golfer's game as a six-spoke chart (like Hevy's muscle distribution).
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
    { k: 'lag', name: 'Lag putts', need: 20, span: 2.5, test: function (s) { return s.cat === 'putting' && s.start.dist >= 10; } },
    { k: 'short', name: 'Short putts', need: 25, span: 2.5, test: function (s) { return s.cat === 'putting' && s.start.dist < 10; } }
  ];
  var PERIODS = [
    { id: '30d', name: 'Last 30 days', short: '30 days', days: 30 },
    { id: '3m', name: 'Last 3 months', short: '3 months', days: 91 },
    { id: '1y', name: 'Year', short: 'year', days: 365 },
    { id: 'all', name: 'All time', short: 'all time', days: null }
  ];
  var DAY = 86400000, MIN_ROUNDS = 2;
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
        return { k: s.k, name: s.name, n: a.n, need: s.need, value: a.n ? per(a.sg) : null, solid: solid,
          frac: Math.min(1, Math.min(a.n / s.need, rounds / MIN_ROUNDS)) };
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
      o += '<circle cx="' + q[0] + '" cy="' + q[1] + '" r="' + (lab ? 4 : 3) + '" fill="' + (s.solid ? C.cur : '#fff') + '" stroke="' + C.cur + '" stroke-width="2"/>'; });
    if (lab) cur.spokes.forEach(function (s, i) {
      var q = pt(i, R + 20), anchor = Math.abs(q[0]) < 10 ? 'middle' : q[0] > 0 ? 'start' : 'end', d = prev && s.solid && prev.spokes[i].solid ? s.value - prev.spokes[i].value : null;
      o += '<text x="' + q[0] + '" y="' + (q[1] - 2) + '" text-anchor="' + anchor + '" font-size="12.5" font-weight="600" fill="' + C.ink + '">' + esc(s.name) + '</text>';
      var sub = s.value == null ? 'no shots yet' : !s.solid ? 'learning ' + Math.round(s.frac * 100) + '%' : fmt(s.value) + (d != null && Math.abs(d) >= 0.25 ? (d > 0 ? ' ▲' : ' ▼') : '');
      o += '<text x="' + q[0] + '" y="' + (q[1] + 13) + '" text-anchor="' + anchor + '" font-size="11.5" fill="' + (d != null && d >= 0.25 ? C.up : d != null && d <= -0.25 ? C.down : C.soft) + '"' + (s.solid ? '' : ' font-style="italic"') + '>' + esc(sub) + '</text>';
    });
    return o + '</svg>';
  }

  var API = { SPOKES: SPOKES, PERIODS: PERIODS, MIN_ROUNDS: MIN_ROUNDS, period: period, windows: windows, shape: shape, build: build, radarSVG: radarSVG, radius: radius, fmt: fmt, RING: RING };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.MYGAME = API;
})(this);
