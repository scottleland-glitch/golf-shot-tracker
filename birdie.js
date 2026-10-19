// Birdie zone: pure helpers (no DOM) so they can be unit tested. BZ.bands, BZ.onePutt, BZ.scope, BZ.zone.
(function (root) {
  var SGx = root.SG || (typeof require !== 'undefined' ? require('./sg.js') : null);
  // putt distance bands in feet: (lo, hi], first band includes 0
  var BANDS = [[0, 3], [3, 6], [6, 10], [10, 15], [15, 20], [20, 30], [30, Infinity]];
  function bandLabel(b) { return b[1] === Infinity ? b[0] + '’+' : b[0] + '–' + b[1] + '’'; }
  function bands(putts) {
    return BANDS.map(function (b) {
      var L = putts.filter(function (p) { var f = +p.ft; return (b[0] === 0 ? f >= 0 : f > b[0]) && f <= b[1]; }), m = L.filter(function (p) { return p.made; }).length;
      return { lo: b[0], hi: b[1], label: bandLabel(b), n: L.length, made: m, pct: L.length ? Math.round(100 * m / L.length) : null };
    });
  }
  // 1-putt distance: the largest whole-foot distance d (1–30’) where putts "around d" go in at least half the time.
  // "Around d" = putts from d − w to d + w ft, w = max(1, 25% of d), so the window widens with distance (putting is noisier further out).
  // A distance only counts with MIN_WIN putts in its window. Walking out from 1’, the search stops at the first distance that is below 50%
  // or has too few putts to tell (so the ring never jumps past a cold spot or a gap in the data). Needs MIN_PUTTS putts in total, else null (caller falls back).
  var MIN_WIN = 8, MIN_PUTTS = 20;
  function onePutt(putts) {
    var P = putts.filter(function (p) { return p.ft != null && isFinite(+p.ft) && +p.ft > 0; });
    if (P.length < MIN_PUTTS) return null;
    var best = null;
    for (var d = 1; d <= 30; d++) {
      var w = Math.max(1, 0.25 * d), L = P.filter(function (p) { return +p.ft >= d - w && +p.ft <= d + w; });
      if (L.length < MIN_WIN) { if (best) break; continue; }
      var rate = L.filter(function (p) { return p.made; }).length / L.length;
      if (rate >= 0.5) best = { ft: d, rate: rate, n: L.length }; else break;
    }
    return best ? { ft: best.ft, rate: best.rate, n: best.n, putts: P.length } : null;
  }
  // Everything the page needs for a list of rounds: birdie chances (GIR balls on the green), actual birdies (birdie or better),
  // missed greens, all putts. Same GIR definition and positions as the GIR map (S.girMap).
  function scope(rounds, blOf) {
    var out = { chances: [], birdies: 0, holes: 0, missed: 0, putts: [], rounds: 0 };
    rounds.forEach(function (r) {
      var S = SGx.summarize(r, blOf ? blOf(r) : r.baseline); if (!S.holesDone) return; out.rounds++;
      S.holes.forEach(function (a, hi) { var h = r.holes[hi]; if (!a.done) return; out.holes++; if (a.strokes <= Number(h.par) - 1) out.birdies++; });
      S.girMap.forEach(function (m) {
        var a = S.holes[m.hole - 1], o = {}; for (var k in m) o[k] = m[k];
        o.birdie = a.strokes <= m.par - 1; o.round = r.id; out.chances.push(o);
      });
      out.missed += S.apprMiss.length;
      S.puttList.forEach(function (p) { out.putts.push(p); });
    });
    return out;
  }
  // Birdies now vs. if every non-birdie chance inside R feet had been made
  function zone(sc, R) {
    var pot = sc.chances.filter(function (c) { return !c.birdie && !c.holed && +c.ft <= R; }).length;
    return { actual: sc.birdies, potential: pot, total: sc.birdies + pot, R: R };
  }
  function label(z) { return 'Birdies ' + z.actual + ' → ' + z.total + ' (+' + z.potential + ') at ' + z.R + '’'; }
  var api = { BANDS: BANDS, bands: bands, onePutt: onePutt, scope: scope, zone: zone, label: label, MIN_WIN: MIN_WIN, MIN_PUTTS: MIN_PUTTS, DEFAULT_FT: 3, MAX_FT: 30 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.BZ = api;
})(this);
