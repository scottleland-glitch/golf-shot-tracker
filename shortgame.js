// v166 Short game test: a fixed monthly check-up of putting, chipping, bunker play and wedges (30-100 yd).
// Same stations, same shots, every time, so a skill that starts to slip shows up test over test.
//  - Engine (pure, tested in node: tests/shortgame.test.js): STATIONS, score(), compare(), interpret().
//    Every shot is scored as strokes gained against the golfer's benchmark (the same tables the rounds use), so the
//    benchmark is "0" on every station. Skills are also shown in plain units: feet left, putts made, balls in the ladder.
//  - Pictures (pure strings): spiderSVG, sparkSVG, compassSVG.
//  - ui(env): the screens (hub, guided test, result). app.js supplies storage, the player and render().
(function (root) {
  'use strict';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function mean(a) { return a.length ? a.reduce(function (t, v) { return t + v; }, 0) / a.length : null; }
  function r1(v) { return (Math.round(v * 10) / 10).toFixed(1); }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // ---------- the test ----------
  var COMPASS_D = [3, 5, 7, 9], WEDGE_D = [30, 45, 60, 80, 100], LADDER_TRIES = 3, OVER_YD = 10, MAX_FT = 200;
  // The four lines of the short-putt station. up = ball below the hole (putting uphill); bl / br = side lines.
  var LINES = [{ k: 'up', name: 'Uphill', straight: true }, { k: 'br', name: 'Breaks right', straight: false },
    { k: 'down', name: 'Downhill', straight: true }, { k: 'bl', name: 'Breaks left', straight: false }];
  var LINE = {}; LINES.forEach(function (l) { LINE[l.k] = l; });
  function rep(n, f) { var o = []; for (var i = 0; i < n; i++) o.push(f(i)); return o; }
  var CATS = [{ k: 'putting', name: 'Putting' }, { k: 'chipping', name: 'Chipping' }, { k: 'bunker', name: 'Bunker' }, { k: 'wedge', name: 'Wedges' }];
  var STATIONS = [
    { id: 'lag', cat: 'putting', kind: 'lag', name: 'Lag putts', lie: 'green', unit: 'ft',
      shots: [30, 40, 50, 40, 50, 30, 50, 30, 40].map(function (d) { return { dist: d, label: d + ' ft' }; }),
      setup: ['Pick one hole. Mark spots 30, 40 and 50 ft away (10, 13 and 17 paces).', 'One ball per putt, full routine, in the order shown.', 'Enter how many feet were left, then tap whether it finished short of the hole or past it.'] },
    { id: 'ladder', cat: 'putting', kind: 'ladder', name: 'Speed ladder',
      shots: rep(LADDER_TRIES, function (i) { return { label: 'Attempt ' + (i + 1) }; }),
      setup: ['Lay a club or a line of tees 6 ft away and another 30 ft away.', 'The first ball must pass the 6 ft line. Every ball after that must finish past the ball before it.', 'It ends when a ball finishes short of the last one, or runs past 30 ft.', 'Count the good balls. Three attempts.'] },
    { id: 'compass', cat: 'putting', kind: 'compass', name: 'Short and breaking putts', lie: 'green',
      shots: [].concat.apply([], COMPASS_D.map(function (d) { return LINES.map(function (l) { return { dist: d, line: l.k, label: d + ' ft · ' + l.name.toLowerCase() }; }); })),
      setup: ['Find a hole on a 1 to 2 degree slope and work out which way is straight downhill.', 'Four lines of tees at 3, 5, 7 and 9 ft: one straight below the hole, one straight above, one out each side.', 'One putt from each tee, working around the hole at each distance. Tap what happened.'] },
    { id: 'chipShort', cat: 'chipping', kind: 'leave', name: 'Short chips', lie: 'fairway', dist: 10, n: 5,
      setup: ['From short grass about 10 yd from the hole (10 paces).', 'Five balls, one at a time. Enter the feet left after each.'] },
    { id: 'chipLong', cat: 'chipping', kind: 'leave', name: 'Long chips', lie: 'fairway', dist: 25, n: 5,
      setup: ['From short grass about 25 yd from the hole.', 'Five balls. Enter the feet left after each.'] },
    { id: 'flop', cat: 'chipping', kind: 'leave', name: 'Flop over a bunker', lie: 'fairway', dist: 15, n: 5,
      setup: ['About 15 yd from the hole with a bunker (or your bag) between you and a close pin.', 'Five balls. Enter the feet left after each. A ball that does not carry still counts: enter where it finished.'] },
    { id: 'rough', cat: 'chipping', kind: 'leave', name: 'Chips from rough', lie: 'rough', dist: 15, n: 5,
      setup: ['From the rough about 15 yd from the hole. Drop each ball, do not place it.', 'Five balls. Enter the feet left after each.'] },
    { id: 'bkShort', cat: 'bunker', kind: 'bunker', name: 'Short bunker shots', lie: 'sand', dist: 10, n: 5,
      setup: ['Greenside bunker, about 10 yd to the hole.', 'Five balls. Enter the feet left, or tap Still in sand or Over the green.'] },
    { id: 'bkLong', cat: 'bunker', kind: 'bunker', name: 'Long bunker shots', lie: 'sand', dist: 25, n: 5,
      setup: ['Greenside bunker, about 25 yd to the hole.', 'Five balls. Enter the feet left, or tap Still in sand or Over the green.'] },
    { id: 'wedge', cat: 'wedge', kind: 'wedge', name: 'Wedges', lie: 'fairway', unit: 'ft',
      shots: [].concat.apply([], rep(3, function () { return WEDGE_D.map(function (d) { return { dist: d, label: d + ' yd' }; }); })),
      setup: ['From the fairway to one flag. Measure 30, 45, 60, 80 and 100 yd.', 'Three balls from each distance, in the order shown.', 'Enter the feet left, then tap where it finished from the hole (long, short, left, right).'] }
  ];
  STATIONS.forEach(function (s) { if (!s.shots) s.shots = rep(s.n, function (i) { return { dist: s.dist, label: 'Ball ' + (i + 1) }; }); });
  var STATION = {}; STATIONS.forEach(function (s) { STATION[s.id] = s; });
  var TOTAL = STATIONS.reduce(function (t, s) { return t + s.shots.length; }, 0);

  // The skills the test reports. better: 'low' = fewer feet is better, 'high' = more is better.
  var SKILLS = [
    { k: 'lag', cat: 'putting', name: 'Lag proximity', unit: 'ft', better: 'low', thr: 0.75, drill: 'Putt to a 3-foot circle from 30, 40 and 50 ft. Aim to get 8 of 10 inside it.' },
    { k: 'speed', cat: 'putting', name: 'Speed ladder', unit: 'balls', better: 'high', thr: 1.5, drill: 'Run the speed ladder three times at the end of every putting session.' },
    { k: 'short', cat: 'putting', name: 'Short putts', unit: 'made', of: 8, better: 'high', thr: 2, drill: 'Gate drill: two tees just wider than the ball, 2 ft in front of it. Roll 20 straight putts from 5 ft through the gate.' },
    { k: 'brk', cat: 'putting', name: 'Breaking putts', unit: 'made', of: 8, better: 'high', thr: 2, drill: 'Circle drill on a slope: 8 balls around the hole at 5 ft. Pick a start point for each and finish the circle.' },
    { k: 'chipShort', cat: 'chipping', name: 'Short chips', unit: 'ft', better: 'low', thr: 1, drill: 'Land ten 10-yard chips on a towel a third of the way to the hole.' },
    { k: 'chipLong', cat: 'chipping', name: 'Long chips', unit: 'ft', better: 'low', thr: 1.5, drill: 'From 25 yd, chip three balls each with three different clubs and note which one finishes closest.' },
    { k: 'flop', cat: 'chipping', name: 'Flop over a bunker', unit: 'ft', better: 'low', thr: 1.5, drill: 'Ten high shots over your bag to a towel. Open the face first, then take your grip.' },
    { k: 'rough', cat: 'chipping', name: 'Chips from rough', unit: 'ft', better: 'low', thr: 1.5, drill: 'Drop ten balls in the rough and play each as it lies. Watch how far each one runs out.' },
    { k: 'bkShort', cat: 'bunker', name: 'Short bunker', unit: 'ft', better: 'low', thr: 1.5, drill: 'Draw a line in the sand 2 in behind the ball. Ten shots: enter the sand on the line, land the ball on a towel.' },
    { k: 'bkLong', cat: 'bunker', name: 'Long bunker', unit: 'ft', better: 'low', thr: 2, drill: 'Ten 25-yard bunker shots with a squarer face and a full finish. Count how many reach the hole.' },
    { k: 'bkOn', cat: 'bunker', name: 'Kept on the green', unit: 'made', of: 10, better: 'high', thr: 2, drill: 'Ten bunker shots to the middle of the green. Splash the sand, do not pick the ball: every one must finish on the putting surface.' },
    { k: 'wedge', cat: 'wedge', name: 'Wedge proximity', unit: 'ft', better: 'low', thr: 2, drill: 'Wedge ladder: three balls each to 30, 45, 60, 80 and 100 yd. Write down the swing length that carries each number.' }
  ];
  var SKILL = {}; SKILLS.forEach(function (s) { SKILL[s.k] = s; });

  // ---------- stored tests ----------
  // { id, date, player, baseline, cond: { green, wind }, done, shots: { stationId: [entry | null] } }
  // entry: lag { ft, dir: 'short'|'long'|'' } · ladder { n } · compass { made, miss } · leave { ft } · bunker { ft } | { res: 'sand'|'over' } · wedge { ft, dir }
  function validEntry(st, e) {
    if (!e || typeof e !== 'object') return null;
    var ft = Number(e.ft), okFt = e.ft != null && e.ft !== '' && isFinite(ft) && ft >= 0 && ft <= MAX_FT;
    if (st.kind === 'ladder') { var n = Math.round(Number(e.n)); return e.n != null && isFinite(n) && n >= 0 && n <= 40 ? { n: n } : null; }
    if (st.kind === 'compass') return typeof e.made === 'boolean' ? (e.made ? { made: true } : { made: false, miss: /^(short|long|left|right|high|low)$/.test(e.miss) ? e.miss : '' }) : null;
    if (st.kind === 'bunker' && (e.res === 'sand' || e.res === 'over')) return { res: e.res };
    if (!okFt) return null;
    if (st.kind === 'lag') return { ft: ft, dir: e.dir === 'short' || e.dir === 'long' ? e.dir : '' };
    if (st.kind === 'wedge') return { ft: ft, dir: /^(long|short)?(left|right)?$/.test(e.dir || '') ? e.dir || '' : '' };
    return { ft: ft };
  }
  function validTests(list) {
    return (Array.isArray(list) ? list : []).filter(function (t) { return t && typeof t.id === 'string' && t.id && typeof t.date === 'string' && !isNaN(Date.parse(t.date)) && t.shots && typeof t.shots === 'object'; })
      .map(function (t) {
        var shots = {}; STATIONS.forEach(function (st) { var a = Array.isArray(t.shots[st.id]) ? t.shots[st.id] : []; shots[st.id] = st.shots.map(function (x, i) { return validEntry(st, a[i]); }); });
        var c = t.cond || {};
        return { id: t.id, date: t.date, player: String(t.player || ''), baseline: String(t.baseline || ''), done: !!t.done,
          cond: { green: /^(slow|medium|fast)$/.test(c.green) ? c.green : '', wind: /^(calm|breezy|windy)$/.test(c.wind) ? c.wind : '' }, shots: shots };
      });
  }
  function mergeTests(existing, incoming) {
    var have = {}, out = validTests(existing); out.forEach(function (t) { have[t.id] = 1; });
    var added = 0; validTests(incoming).forEach(function (t) { if (!have[t.id]) { have[t.id] = 1; out.push(t); added++; } });
    return { tests: out, added: added };
  }
  function blank(id, date, player, baseline) { return validTests([{ id: id, date: date, player: player, baseline: baseline, shots: {} }])[0]; }
  function entered(test) { return STATIONS.reduce(function (t, st) { return t + test.shots[st.id].filter(Boolean).length; }, 0); }
  function stationDone(test, st) { return test.shots[st.id].every(Boolean); }
  // first station with a shot still to enter, and that shot
  function nextOpen(test) {
    for (var i = 0; i < STATIONS.length; i++) { var a = test.shots[STATIONS[i].id]; for (var j = 0; j < a.length; j++) if (!a[j]) return { st: i, i: j }; }
    return null;
  }

  // ---------- scoring ----------
  // The leave (ft) a benchmark player averages in strokes-gained terms: where one more putt costs what the shot was worth.
  function neutralLeave(SG, lie, dist, bl) {
    var target = SG.expected(lie, dist, bl) - 1, lo = 1, hi = 90;
    if (target <= SG.expected('green', lo, bl)) return lo;
    if (target >= SG.expected('green', hi, bl)) return hi;
    for (var i = 0; i < 30; i++) { var mid = (lo + hi) / 2; if (SG.expected('green', mid, bl) < target) lo = mid; else hi = mid; }
    return (lo + hi) / 2;
  }
  function shotSG(SG, bl, st, spec, e) {
    if (st.kind === 'ladder') return null;
    var start = SG.expected(st.lie, spec.dist, bl);
    if (st.kind === 'compass') return start - (e.made ? 1 : 2);
    if (e.res === 'sand') return -1;
    if (e.res === 'over') return start - 1 - SG.expected('rough', OVER_YD, bl);
    return start - 1 - (e.ft > 0 ? SG.expected('green', e.ft, bl) : 0);
  }
  function idx(sgPerShot) { return sgPerShot == null ? null : clamp(100 + sgPerShot * 100, 10, 130); } // 100 = the benchmark
  function score(test, SG, bl) {
    bl = SG.baseline(bl || test.baseline).id;
    var rows = []; // every entered shot: { st, spec, e, sg }
    STATIONS.forEach(function (st) { test.shots[st.id].forEach(function (e, i) { if (e) rows.push({ st: st, spec: st.shots[i], e: e, sg: shotSG(SG, bl, st, st.shots[i], e) }); }); });
    var of = function (id) { return rows.filter(function (r) { return r.st.id === id; }); };
    var sgOf = function (L) { var a = L.filter(function (r) { return r.sg != null; }).map(function (r) { return r.sg; }); return a.length ? mean(a) : null; };
    var ftOf = function (L) { var a = L.filter(function (r) { return r.e.ft != null; }).map(function (r) { return r.e.ft; }); return a.length ? mean(a) : null; };
    var S = {};
    var put = function (k, L, value, extra) { var sg = sgOf(L), o = { k: k, n: L.length, value: L.length ? value : null, sg: sg, index: idx(sg) }; if (extra) for (var q in extra) o[q] = extra[q]; S[k] = o; };
    var lag = of('lag'); put('lag', lag, ftOf(lag));
    var lad = of('ladder'), tries = lad.map(function (r) { return r.e.n; });
    S.speed = { k: 'speed', n: lad.length, value: tries.length ? mean(tries) : null, sg: null, index: null, tries: tries, best: tries.length ? Math.max.apply(null, tries) : null };
    var comp = of('compass'), str = comp.filter(function (r) { return LINE[r.spec.line].straight; }), brk = comp.filter(function (r) { return !LINE[r.spec.line].straight; });
    var made = function (L) { return L.filter(function (r) { return r.e.made; }).length; };
    var bench = function (L) { return L.reduce(function (t, r) { return t + clamp(2 - SG.expected('green', r.spec.dist, bl), 0, 1); }, 0); };
    put('short', str, made(str), { of: str.length, bench: bench(str) }); put('brk', brk, made(brk), { of: brk.length, bench: bench(brk) });
    ['chipShort', 'chipLong', 'flop', 'rough', 'bkShort', 'bkLong'].forEach(function (id) { var L = of(id), st = STATION[id]; put(id, L, ftOf(L), { bench: neutralLeave(SG, st.lie, st.dist, bl) }); });
    var bk = of('bkShort').concat(of('bkLong')), sand = bk.filter(function (r) { return r.e.res === 'sand'; }).length, over = bk.filter(function (r) { return r.e.res === 'over'; }).length;
    S.bkOn = { k: 'bkOn', n: bk.length, value: bk.length ? bk.length - sand - over : null, of: bk.length, sg: null, index: bk.length ? clamp(100 - 100 * (sand + over) / bk.length * 2, 10, 100) : null, sand: sand, over: over };
    var wd = of('wedge'); put('wedge', wd, ftOf(wd));
    // category roll-ups: strokes gained per shot over every scored shot in the category
    var cats = {}; CATS.forEach(function (c) { var L = rows.filter(function (r) { return r.st.cat === c.k && r.sg != null; }), sg = sgOf(L);
      cats[c.k] = { k: c.k, name: c.name, n: L.length, sg: sg, index: idx(sg), of: STATIONS.filter(function (s) { return s.cat === c.k && s.kind !== 'ladder'; }).reduce(function (t, s) { return t + s.shots.length; }, 0) }; });
    // details for the pictures and the coach notes
    var cnt = function (L, f) { return L.filter(f).length; };
    var X = {
      lag: { short: cnt(lag, function (r) { return r.e.dir === 'short'; }), long: cnt(lag, function (r) { return r.e.dir === 'long'; }), inside3: cnt(lag, function (r) { return r.e.ft <= 3; }), n: lag.length,
        byDist: [30, 40, 50].map(function (d) { var L = lag.filter(function (r) { return r.spec.dist === d; }); return { dist: d, n: L.length, ft: ftOf(L) }; }) },
      lines: LINES.map(function (l) { var L = comp.filter(function (r) { return r.spec.line === l.k; }); return { k: l.k, name: l.name, n: L.length, made: made(L) }; }),
      byDist: COMPASS_D.map(function (d) { var L = comp.filter(function (r) { return r.spec.dist === d; }); return { dist: d, n: L.length, made: made(L) }; }),
      miss: { short: 0, long: 0, left: 0, right: 0, high: 0, low: 0 },
      bunker: { n: bk.length, sand: sand, over: over },
      wedge: { byDist: WEDGE_D.map(function (d) { var L = wd.filter(function (r) { return r.spec.dist === d; }); return { dist: d, n: L.length, ft: ftOf(L), bench: neutralLeave(SG, 'fairway', d, bl), sg: sgOf(L) }; }),
        short: cnt(wd, function (r) { return /^short/.test(r.e.dir); }), long: cnt(wd, function (r) { return /^long/.test(r.e.dir); }), left: cnt(wd, function (r) { return /left$/.test(r.e.dir); }), right: cnt(wd, function (r) { return /right$/.test(r.e.dir); }), n: wd.length }
    };
    comp.forEach(function (r) { if (!r.e.made && r.e.miss) X.miss[r.e.miss]++; });
    return { id: test.id, date: test.date, baseline: bl, skills: S, cats: cats, extra: X, entered: rows.length, total: TOTAL };
  }

  // ---------- this test against the earlier ones ----------
  // prev = scores of the golfer's earlier finished tests, newest first. Positive delta = better, whatever the unit.
  function compare(cur, prev) {
    var out = {}, bestLadder = Math.max.apply(null, [cur].concat(prev).map(function (s) { return s.skills.speed.value == null ? 0 : s.skills.speed.value; }));
    SKILLS.forEach(function (sk) {
      var v = cur.skills[sk.k].value, hist = prev.map(function (s) { return s.skills[sk.k].value; }).filter(function (x) { return x != null; });
      var sign = sk.better === 'low' ? -1 : 1, o = { k: sk.k, value: v, tests: hist.length, usual: null, delta: null, status: null, trend: null, series: hist.slice(0, 11).reverse().concat(v == null ? [] : [v]) };
      if (v != null && hist.length) {
        var recent = hist.slice(0, 6); o.usual = mean(recent); o.delta = sign * (v - o.usual);
        var thr = sk.unit === 'ft' ? Math.max(sk.thr, 0.2 * o.usual) : sk.thr; o.thr = thr;
        o.status = o.delta <= -thr ? 'worse' : o.delta >= thr ? 'better' : 'same';
        o.best = sign * v >= Math.max.apply(null, hist.map(function (x) { return sign * x; }));
        // two drops in a row = slipping (and two gains in a row = improving)
        if (hist.length >= 2) { var d1 = sign * (v - hist[0]), d2 = sign * (hist[0] - hist[1]);
          o.trend = d1 <= -thr / 2 && d2 <= -thr / 2 ? 'slipping' : d1 >= thr / 2 && d2 >= thr / 2 ? 'improving' : 'steady'; }
      }
      out[sk.k] = o;
    });
    // the ladder has no benchmark: its spoke is measured against the golfer's own best
    out.speed.index = cur.skills.speed.value == null || !bestLadder ? null : clamp(100 * cur.skills.speed.value / bestLadder, 10, 100);
    out.speed.bestEver = bestLadder || null;
    var cats = {}; CATS.forEach(function (c) { var h = prev.map(function (s) { return s.cats[c.k].index; }).filter(function (x) { return x != null; }); cats[c.k] = { avgIndex: h.length >= 2 ? mean(h.slice(0, 6)) : null }; });
    var avgIdx = {}; SKILLS.forEach(function (sk) { var h = prev.map(function (s) { return sk.k === 'speed' ? (s.skills.speed.value == null || !bestLadder ? null : clamp(100 * s.skills.speed.value / bestLadder, 10, 100)) : s.skills[sk.k].index; }).filter(function (x) { return x != null; });
      avgIdx[sk.k] = h.length >= 2 ? mean(h.slice(0, 6)) : null; }); // the dashed "your average" shape needs two earlier tests
    return { skills: out, cats: cats, avgIndex: avgIdx, tests: prev.length };
  }
  function indexOf(cur, cmp, k) { return k === 'speed' ? cmp.skills.speed.index : cur.skills[k].index; }
  function fmtVal(sk, s) {
    if (!s || s.value == null) return '–';
    return sk.unit === 'ft' ? r1(s.value) + ' ft left' : sk.unit === 'balls' ? r1(s.value) + ' balls' : s.value + ' of ' + (s.of || sk.of);
  }
  function fmtNum(sk, v) { return v == null ? '–' : sk.unit === 'made' ? r1(v).replace(/\.0$/, '') : r1(v); }

  // ---------- what it means ----------
  function lean(a, b, min) { var n = a + b; if (n < min) return null; return a / n >= 0.7 ? 0 : b / n >= 0.7 ? 1 : null; }
  function interpret(cur, cmp) {
    var have = SKILLS.filter(function (sk) { return cur.skills[sk.k].value != null; });
    var row = function (sk) { var c = cmp.skills[sk.k]; return { k: sk.k, name: sk.name, cat: sk.cat, status: c.status, trend: c.trend, index: indexOf(cur, cmp, sk.k), delta: c.delta, usual: c.usual, value: cur.skills[sk.k].value, drill: sk.drill }; };
    var rows = have.map(row), by = function (f) { return rows.filter(f).sort(function (a, b) { return (a.index == null ? 100 : a.index) - (b.index == null ? 100 : b.index); }); };
    var slipping = by(function (r) { return r.trend === 'slipping'; }), worse = by(function (r) { return r.status === 'worse' && r.trend !== 'slipping'; });
    var better = by(function (r) { return r.status === 'better' || r.trend === 'improving'; }).reverse(), weak = by(function (r) { return r.index != null && r.index < 85; });
    var names = function (L) { return L.map(function (r) { return r.name.toLowerCase(); }).join(', ').replace(/, ([^,]*)$/, ' and $1'); };
    var headline, sub;
    if (!have.length) { headline = 'No shots entered yet.'; sub = ''; }
    else if (!cmp.tests) {
      headline = 'Your starting point is set.'; var lo = by(function () { return true; })[0];
      sub = (weak.length ? 'Against your benchmark, ' + names(weak.slice(0, 3)) + ' ' + (weak.length === 1 ? 'is' : 'are') + ' the weakest.' : 'Nothing is far off your benchmark' + (lo ? '; ' + lo.name.toLowerCase() + ' is the lowest' : '') + '.') + ' Take the test again in a month to see what moves.';
    } else if (slipping.length) { headline = cap(names(slipping.slice(0, 2))) + ' ' + (slipping.length === 1 ? 'is' : 'are') + ' slipping.'; sub = 'Worse two tests in a row' + (slipping.length > 2 ? ', along with ' + names(slipping.slice(2)) + '.' : '.') + (worse.length ? ' Also down this time: ' + names(worse.slice(0, 3)) + '.' : ''); }
    else if (worse.length) { headline = cap(names(worse.slice(0, 2))) + ' ' + (worse.length === 1 ? 'was' : 'were') + ' worse than usual.'; sub = 'One test is not a trend. If it is down again next month, it is slipping.'; }
    else if (better.length) { headline = 'Holding steady, and ' + names(better.slice(0, 2)) + ' ' + (better.length === 1 ? 'is' : 'are') + ' getting better.'; sub = 'Nothing is slipping.'; }
    else { headline = 'Everything is holding steady.'; sub = 'No skill moved by more than its normal wobble.'; }
    // practice: slipping first, then down this time, then the weakest against the benchmark
    var seen = {}, plan = [];
    [[slipping, 'slipping'], [worse, 'worse than usual'], [weak, 'below your benchmark']].forEach(function (g) { g[0].forEach(function (r) { if (plan.length < 3 && !seen[r.k]) { seen[r.k] = 1; plan.push({ k: r.k, title: r.name, why: g[1], drill: r.drill }); } }); });
    // patterns a coach can use
    var X = cur.extra, coach = [], L;
    L = lean(X.lag.short, X.lag.long, 5); if (L != null) coach.push({ k: 'lag', text: (L ? X.lag.long : X.lag.short) + ' of ' + (X.lag.short + X.lag.long) + ' lag putts finished ' + (L ? 'past the hole' : 'short') + '.', ask: L ? 'Speed: check for a hit at the ball on long putts.' : 'Speed: check stroke length and tempo on long putts.' });
    var ln = {}; X.lines.forEach(function (l) { ln[l.k] = l; });
    if (ln.up.n >= 4 && ln.down.n >= 4 && Math.abs(ln.up.made - ln.down.made) >= 2) coach.push({ k: 'short', text: ln.up.made + ' of ' + ln.up.n + ' uphill putts went in, ' + ln.down.made + ' of ' + ln.down.n + ' downhill.', ask: ln.down.made < ln.up.made ? 'Downhill is a speed problem more than a line problem: check for deceleration.' : 'Uphill misses are usually left short or under-hit: check commitment to the stroke.' });
    if (ln.bl.n >= 4 && ln.br.n >= 4 && Math.abs(ln.bl.made - ln.br.made) >= 2) coach.push({ k: 'brk', text: ln.bl.made + ' of ' + ln.bl.n + ' right-to-left putts went in, ' + ln.br.made + ' of ' + ln.br.n + ' left-to-right.', ask: 'One break is weaker: check aim and start line on the ' + (ln.bl.made < ln.br.made ? 'right-to-left' : 'left-to-right') + ' putt.' });
    L = lean(X.miss.low, X.miss.high, 4); if (L != null) coach.push({ k: 'brk', text: (L ? X.miss.high : X.miss.low) + ' of ' + (X.miss.low + X.miss.high) + ' missed breaking putts missed on the ' + (L ? 'high' : 'low') + ' side.', ask: L ? 'Over-reading or too firm: check pace on breaking putts.' : 'Under-reading: play more break, or check for a pull or push toward the hole.' });
    L = lean(X.miss.left, X.miss.right, 3); if (L != null) coach.push({ k: 'short', text: (L ? X.miss.right : X.miss.left) + ' of ' + (X.miss.left + X.miss.right) + ' missed straight putts missed ' + (L ? 'right' : 'left') + '.', ask: 'Start line: check aim and face angle at impact.' });
    if (X.bunker.over >= 2) coach.push({ k: 'bkOn', text: X.bunker.over + ' of ' + X.bunker.n + ' bunker shots flew the green.', ask: 'Check where the club enters the sand: too close to the ball, or picking it clean.' });
    if (X.bunker.sand >= 2) coach.push({ k: 'bkOn', text: X.bunker.sand + ' of ' + X.bunker.n + ' bunker shots stayed in the sand.', ask: 'Check for a full finish and enough speed through the sand.' });
    L = lean(X.wedge.short, X.wedge.long, 6); if (L != null) coach.push({ k: 'wedge', text: (L ? X.wedge.long : X.wedge.short) + ' of ' + (X.wedge.short + X.wedge.long) + ' wedges finished ' + (L ? 'long' : 'short') + '.', ask: 'Distance: check your carry number for each swing length.' });
    L = lean(X.wedge.left, X.wedge.right, 6); if (L != null) coach.push({ k: 'wedge', text: (L ? X.wedge.right : X.wedge.left) + ' of ' + (X.wedge.left + X.wedge.right) + ' wedges finished ' + (L ? 'right' : 'left') + '.', ask: 'One-way miss: check face, path and alignment with the wedges.' });
    var wb = X.wedge.byDist.filter(function (d) { return d.n >= 2 && d.sg != null; }).sort(function (a, b) { return a.sg - b.sg; });
    if (wb.length >= 3 && wb[0].sg <= wb[1].sg - 0.15) coach.push({ k: 'wedge', text: wb[0].dist + ' yd is your weakest wedge distance: ' + r1(wb[0].ft) + ' ft left on average.', ask: 'Likely a gap between two swings: build a stock swing for that number.' });
    return { headline: headline, sub: sub, slipping: slipping, worse: worse, better: better, weak: weak, plan: plan, coach: coach.slice(0, 5) };
  }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  // ---------- pictures ----------
  var C = { cur: '#1f9d55', ink: '#17301f', soft: '#3f5a48', grid: 'rgba(23,48,31,.15)', bad: '#c0442f', good: '#1f7a44', band: 'rgba(23,48,31,.10)' };
  // spokes: [{ name, sub, index (100 = benchmark, null = no data), avg (index or null) }]
  function spiderSVG(spokes, opts) {
    opts = opts || {}; var R = opts.R || 84, N = spokes.length, padX = 92, w = 2 * (R + padX), h = 2 * R + 84, MAXI = 130;
    var pt = function (i, r) { var a = -Math.PI / 2 + i * 2 * Math.PI / N; return [Math.round(r * Math.cos(a) * 10) / 10, Math.round(r * Math.sin(a) * 10) / 10]; };
    var poly = function (rs) { return rs.map(function (r, i) { return pt(i, r).join(','); }).join(' '); }, rad = function (ix) { return R * (ix == null ? 100 : ix) / MAXI; };
    var o = '<svg class="sgtspider" viewBox="' + (-w / 2) + ' ' + (-R - 42) + ' ' + w + ' ' + h + '" role="img" aria-label="' + esc(opts.aria || 'Short game shape') + '">';
    [0.5].forEach(function (f) { o += '<polygon points="' + poly(spokes.map(function () { return R * 100 / MAXI * f; })) + '" fill="none" stroke="' + C.grid + '"/>'; });
    spokes.forEach(function (s, i) { var e = pt(i, R); o += '<line x1="0" y1="0" x2="' + e[0] + '" y2="' + e[1] + '" stroke="' + C.grid + '"/>'; });
    if (spokes.some(function (s) { return s.index != null; })) o += '<polygon class="sgtcur" points="' + poly(spokes.map(function (s) { return rad(s.index); })) + '" fill="rgba(31,157,85,.30)" stroke="' + C.cur + '" stroke-width="2.5" stroke-linejoin="round"/>';
    o += '<polygon class="sgtbench" points="' + poly(spokes.map(function () { return rad(100); })) + '" fill="none" stroke="' + C.ink + '" stroke-width="1.6"/>';
    if (spokes.every(function (s) { return s.avg != null; })) o += '<polygon class="sgtavg" points="' + poly(spokes.map(function (s) { return rad(s.avg); })) + '" fill="none" stroke="' + C.ink + '" stroke-width="1.6" stroke-dasharray="5 4"/>';
    spokes.forEach(function (s, i) { if (s.index == null) return; var q = pt(i, rad(s.index)); o += '<circle cx="' + q[0] + '" cy="' + q[1] + '" r="4" fill="' + C.cur + '"/>'; });
    spokes.forEach(function (s, i) { var q = pt(i, R + 14), anchor = Math.abs(q[0]) < 10 ? 'middle' : q[0] > 0 ? 'start' : 'end', dy = q[1] < -10 ? -14 : q[1] > 10 ? 12 : 0;
      o += '<text x="' + q[0] + '" y="' + (q[1] + dy) + '" text-anchor="' + anchor + '" font-size="13" font-weight="600" fill="' + C.ink + '">' + esc(s.name) + '</text>';
      o += '<text x="' + q[0] + '" y="' + (q[1] + dy + 15) + '" text-anchor="' + anchor + '" font-size="12" fill="' + (s.tone === 'bad' ? C.bad : s.tone === 'good' ? C.good : C.soft) + '">' + esc(s.sub || (s.index == null ? 'not tested' : '')) + '</text>'; });
    return o + '</svg>';
  }
  function spiderKey(hasAvg, benchName) {
    return '<p class="sgtkey"><span><i class="kb"></i>' + esc(benchName) + '</span><span><i class="kc"></i>This test</span>' + (hasAvg ? '<span><i class="ka"></i>Your average</span>' : '') + '</p>';
  }
  // One skill over time, a dot per test, up = better. big = the opened graph with dates and numbers.
  function sparkSVG(series, sk, o) {
    o = o || {}; var big = !!o.big, w = big ? 320 : 116, h = big ? 150 : 32, px = big ? 22 : 6, py = big ? 26 : 6, sign = sk.better === 'low' ? -1 : 1;
    var g = series.map(function (v) { return sign * v; }), lo = Math.min.apply(null, g), hi = Math.max.apply(null, g);
    if (o.usual != null && o.thr != null) { lo = Math.min(lo, sign * o.usual - o.thr); hi = Math.max(hi, sign * o.usual + o.thr); }
    if (hi - lo < 1e-6) { hi += 1; lo -= 1; }
    var X = function (i) { return series.length === 1 ? w / 2 : px + i * (w - 2 * px) / (series.length - 1); }, Y = function (v) { return py + (hi - sign * v) / (hi - lo) * (h - 2 * py); };
    var s = '<svg class="sgtspark' + (big ? ' big' : '') + '" viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" role="img" aria-label="' + esc(sk.name + ' over ' + series.length + ' tests') + '">';
    if (o.usual != null && o.thr != null) { var y0 = Y(o.usual + sign * o.thr), y1 = Y(o.usual - sign * o.thr); s += '<rect x="0" y="' + Math.min(y0, y1) + '" width="' + w + '" height="' + Math.abs(y1 - y0) + '" rx="3" fill="' + C.band + '"/>'; }
    if (series.length > 1) s += '<polyline points="' + series.map(function (v, i) { return X(i) + ',' + Y(v); }).join(' ') + '" fill="none" stroke="' + C.soft + '" stroke-width="1.6" stroke-linejoin="round"/>';
    series.forEach(function (v, i) { var last = i === series.length - 1, col = last ? (o.status === 'worse' ? C.bad : o.status === 'better' ? C.good : C.ink) : C.soft;
      s += '<circle cx="' + X(i) + '" cy="' + Y(v) + '" r="' + (last ? (big ? 5 : 4) : (big ? 3.5 : 2.5)) + '" fill="' + col + '"/>';
      if (big) { s += '<text x="' + X(i) + '" y="' + (Y(v) - 9) + '" text-anchor="middle" font-size="11.5" fill="' + (last ? col : C.soft) + '">' + esc(fmtNum(sk, v)) + '</text>';
        if (o.dates && o.dates[i]) s += '<text x="' + X(i) + '" y="' + (h - 4) + '" text-anchor="middle" font-size="10.5" fill="' + C.soft + '">' + esc(o.dates[i]) + '</text>'; } });
    return s + '</svg>';
  }
  // The short-putt station seen from above. hot = { line, dist } marks the tee to putt from.
  function compassSVG(hot) {
    var c = 150, step = 13, s = '<svg class="sgtcompass" viewBox="0 0 300 316" role="img" aria-label="Short putt station: four lines of tees at 3, 5, 7 and 9 feet around the hole">';
    s += '<line x1="' + c + '" y1="34" x2="' + c + '" y2="282" stroke="' + C.grid + '"/><line x1="26" y1="158" x2="274" y2="158" stroke="' + C.grid + '"/>';
    s += '<circle cx="' + c + '" cy="158" r="8" fill="' + C.ink + '"/>';
    var V = { up: [0, 1], down: [0, -1], br: [-1, 0], bl: [1, 0] };
    LINES.forEach(function (l) { COMPASS_D.forEach(function (d) { var x = c + V[l.k][0] * d * step, y = 158 + V[l.k][1] * d * step, on = hot && hot.line === l.k && hot.dist === d;
      s += '<circle cx="' + x + '" cy="' + y + '" r="' + (on ? 9 : 4.5) + '" fill="' + (on ? '#e8a020' : l.straight ? '#2f6fd0' : '#d0602f') + '"' + (on ? ' stroke="#fff" stroke-width="2.5"' : '') + '/>'; }); });
    COMPASS_D.forEach(function (d) { s += '<text x="' + (c + 12) + '" y="' + (158 + d * step + 4) + '" font-size="11" fill="' + C.soft + '">' + d + ' ft</text>'; });
    s += '<text x="' + c + '" y="22" text-anchor="middle" font-size="12.5" fill="' + C.ink + '">Downhill putts</text><text x="' + c + '" y="302" text-anchor="middle" font-size="12.5" fill="' + C.ink + '">Uphill putts</text>';
    s += '<text x="78" y="142" text-anchor="middle" font-size="12.5" fill="' + C.ink + '">Breaks right</text><text x="222" y="142" text-anchor="middle" font-size="12.5" fill="' + C.ink + '">Breaks left</text>';
    s += '<line x1="268" y1="214" x2="268" y2="262" stroke="' + C.soft + '" stroke-width="1.5"/><path d="M262 254 L268 264 L274 254" fill="none" stroke="' + C.soft + '" stroke-width="1.5"/><text x="268" y="280" text-anchor="middle" font-size="11" fill="' + C.soft + '">downhill</text>';
    return s + '</svg>';
  }

  var API = { STATIONS: STATIONS, STATION: STATION, SKILLS: SKILLS, SKILL: SKILL, CATS: CATS, LINES: LINES, TOTAL: TOTAL, COMPASS_D: COMPASS_D, WEDGE_D: WEDGE_D,
    validTests: validTests, mergeTests: mergeTests, blank: blank, entered: entered, stationDone: stationDone, nextOpen: nextOpen, validEntry: validEntry,
    neutralLeave: neutralLeave, score: score, compare: compare, interpret: interpret, indexOf: indexOf, fmtVal: fmtVal, fmtNum: fmtNum,
    spiderSVG: spiderSVG, spiderKey: spiderKey, sparkSVG: sparkSVG, compassSVG: compassSVG, esc: esc, r1: r1 };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.SGTEST = API;
})(this);
