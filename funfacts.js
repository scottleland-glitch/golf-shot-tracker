/* v209 (Scott): fun facts for Home's card when the practice plan is off ("just stats") – every number from the player's own rounds.
 * Each fact shows only when there's enough behind it (e.g. 15+ putts from 5–10 ft), so a "what if" is never a guess.
 *  · What if: make 80% from 5–10 ft → strokes a round (your putts from there a round × the makes you'd add; a make saves about a stroke)
 *  · What if: one fewer 3-putt a round = a stroke
 *  · Last round's best: greens, fairways, putts or up-and-downs that beat your last 5+ rounds
 *  · Longest putt holed in the last 30 days (15 ft+)
 *  · A streak: 3+ rounds in a row under a round number
 *  · Your last 5 rounds against the 5 before (only when better)
 *  · Best part of your game (strokes gained against your benchmark)
 *  · Add it up: your 3 biggest leaks together
 */
(function (root) {
  'use strict';
  var DAY = 864e5, CFG = { recent: 10, putt5to10Min: 15, makeTarget: 0.8, minGain: 0.3, threeMin: 0.8, bestOf: 5, longMin: 15, streakMin: 3, avgMin: 1, addMin: 1.5, max: 6 };
  function r1(v) { return Math.round(v * 10) / 10; }
  function strokesWord(v) { var x = r1(v); return (x === 1 ? '1 stroke' : (x % 1 ? x.toFixed(1) : x) + ' strokes'); }
  function day(t) { return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }

  function facts(ctx) {
    var SG = ctx.SG, now = ctx.now || Date.now(), bl = ctx.bl || 'pga', out = [];
    var R = (ctx.rounds || []).map(function (r) { return { r: r, t: Date.parse(r.date), S: SG.summarize(r, bl) }; })
      .filter(function (x) { return x.S.holesDone > 0 && !isNaN(x.t); }).sort(function (a, b) { return b.t - a.t; });
    if (!R.length) return out;
    var rec = R.slice(0, CFG.recent), holes = rec.reduce(function (t, x) { return t + x.S.holesDone; }, 0), per18 = function (n) { return holes ? n / holes * 18 : 0; };
    var putts = []; rec.forEach(function (x) { x.S.puttList.forEach(function (p) { putts.push(p); }); });
    // what if: 80 % from 5–10 ft
    var mid = putts.filter(function (p) { return p.ft >= 5 && p.ft <= 10; }), made = mid.filter(function (p) { return p.made; }).length;
    if (mid.length >= CFG.putt5to10Min) { var rate = made / mid.length, gain = per18(mid.length) * (CFG.makeTarget - rate);
      if (rate < CFG.makeTarget - 0.05 && gain >= CFG.minGain) out.push({ k: 'whatif5', kick: 'What if', title: 'Make 80% from 5–10 ft → ' + strokesWord(gain) + ' a round', sub: 'You make ' + Math.round(rate * 100) + '% now (' + made + ' of ' + mid.length + ')', btn: ['See putting', 'stats'] }); }
    // what if: one fewer 3-putt
    var three = function (x) { var c = 0, seen = {}; x.S.puttList.forEach(function (p) { if (p.holePutts >= 3 && !seen[p.hole]) { seen[p.hole] = 1; c++; } }); return c; };
    var n3 = rec.reduce(function (t, x) { return t + three(x); }, 0), a3 = per18(n3);
    if (rec.length >= 2 && a3 >= CFG.threeMin) out.push({ k: 'three', kick: 'What if', title: 'One fewer 3-putt a round = a stroke', sub: 'You average ' + r1(a3) + ' a round' + ' – last round ' + three(R[0]), btn: ['See putting', 'stats'] });
    // last round: anything it did best in your last 5+ rounds (18 holes, so the counts compare)
    var full = R.filter(function (x) { return x.S.holesDone === 18; }), L = full[0];
    if (L && L === R[0] && full.length > CFG.bestOf && now - L.t < 14 * DAY) {
      var prev = full.slice(1, 1 + 3 * CFG.bestOf), upd = function (x) { var miss = x.S.holes.filter(function (a) { return a.done && !a.gir; }), u = miss.filter(function (a, i) { return a.strokes <= Number(x.r.holes[x.S.holes.indexOf(a)].par); }).length; return [u, miss.length]; };
      var M = [['gir', 'Greens hit', function (x) { return x.S.gir; }, 1, '%n of 18 greens'], ['fw', 'Fairways hit', function (x) { return x.S.fwTotal >= 8 ? x.S.fwHit : null; }, 1, '%n of ' + L.S.fwTotal + ' fairways'],
        ['putts', 'Fewest putts', function (x) { return x.S.putts; }, -1, '%n putts'], ['ud', 'Up and down', function (x) { var u = upd(x); return u[1] >= 4 ? u[0] / u[1] : null; }, 1, upd(L)[0] + ' of ' + upd(L)[1]]];
      M.some(function (m) { var v = m[2](L); if (v == null) return false; var run = 0;
        for (var i = 0; i < prev.length; i++) { var p = m[2](prev[i]); if (p == null) continue; if (m[3] * (v - p) > 0) run++; else break; }
        if (run < CFG.bestOf) return false;
        out.push({ k: 'best', kick: 'Last round', title: (m[0] === 'ud' ? 'Up and down ' + m[4] : m[4].replace('%n', v)) + ' – your best in ' + (run + 1) + ' rounds', sub: L.r.course || '', btn: ['See round', 'open', L.r.id] }); return true; });
    }
    // longest putt holed lately
    var lp = null; R.filter(function (x) { return now - x.t <= 30 * DAY; }).forEach(function (x) { x.S.puttList.forEach(function (p) { if (p.made && p.ft >= CFG.longMin && (!lp || p.ft > lp.ft)) lp = { ft: p.ft, x: x, hole: p.hole }; }); });
    if (lp) out.push({ k: 'long', kick: 'Highlight', title: 'Longest putt holed this month: ' + Math.round(lp.ft) + ' ft', sub: (lp.x.r.course ? lp.x.r.course + ' · ' : '') + 'hole ' + lp.hole + ' · ' + day(lp.x.t), btn: ['See round', 'open', lp.x.r.id] });
    // a streak under a round number
    if (full.length >= CFG.streakMin && full[0] === R[0]) { var T = Math.floor(Math.max.apply(null, full.slice(0, CFG.streakMin).map(function (x) { return x.S.strokes; })) / 5) * 5 + 5, k = 0;
      while (k < full.length && full[k].S.strokes < T) k++;
      if (k >= CFG.streakMin && k < full.length) out.push({ k: 'streak', kick: 'On a roll', title: k + ' rounds in a row under ' + T, sub: 'Last one: ' + full[0].S.strokes + (full[0].r.course ? ' at ' + full[0].r.course : ''), btn: ['See rounds', 'history'] }); }
    // last 5 against the 5 before – only the good news (a lower score is better)
    if (full.length >= 10) { var avg = function (a) { return a.reduce(function (t, x) { return t + x.S.strokes; }, 0) / a.length; }, d = avg(full.slice(5, 10)) - avg(full.slice(0, 5));
      if (d >= CFG.avgMin) out.push({ k: 'avg', kick: 'Getting better', title: 'Your last 5 rounds: ' + r1(d) + ' strokes better', sub: 'Averaging ' + r1(avg(full.slice(0, 5))) + ', from ' + r1(avg(full.slice(5, 10))), btn: ['See Stats', 'stats'] }); }
    // best part of the game, and the three biggest leaks added up (strokes gained against your benchmark, a few rounds in)
    if (ctx.PLAN && ctx.MYGAME && R.length >= 3) { var A = ctx.PLAN.areaNeeds(R.map(function (x) { return x.r; }), SG, ctx.MYGAME, bl, now), ks = Object.keys(A).filter(function (k) { return A[k].perRound != null; });
      var val = function (k) { return A[k].perRound * A[k].wr; }, best = ks.slice().sort(function (a, b) { return val(b) - val(a); })[0];
      if (best && val(best) >= 0.3) out.push({ k: 'strong', kick: 'Best part of your game', title: A[best].name + ': +' + val(best).toFixed(1) + ' strokes a round', sub: 'Against ' + (ctx.blName || 'your benchmark'), btn: ['See My Game', 'mygame'] });
      var leaks = ks.filter(function (k) { return val(k) < -0.2; }).sort(function (a, b) { return val(a) - val(b); }).slice(0, 3), tot = -leaks.reduce(function (t, k) { return t + val(k); }, 0);
      if (leaks.length === 3 && tot / 2 >= CFG.addMin) out.push({ k: 'addup', kick: 'Add it up', title: 'Halve your 3 biggest leaks → ' + strokesWord(tot / 2) + ' a round', sub: leaks.map(function (k) { return A[k].name; }).join(' · '), btn: ['Show me', 'mygame'] }); }
    return out.slice(0, CFG.max);
  }

  var api = { CFG: CFG, facts: facts };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FUN = api;
})(this);
