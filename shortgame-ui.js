// v166 Short game test: the screens (engine + pictures are in shortgame.js).
// SGTEST.ui(env) -> { html(), act(act, v, button), cardHTML(who), key(ev) }.
// env (from app.js): SG, view, tests(), saveTests(list), players(), me(), same(a, b), baselineOf(who), render(), toast(msg)
(function (root) {
  'use strict';
  var T = root.SGTEST; if (!T) return;
  var esc = T.esc, r1 = T.r1;
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function dShort(iso) { var d = new Date(iso); return MONTHS[d.getMonth()] + ' ' + d.getDate(); }
  function dLong(iso) { var d = new Date(iso); return MONTHS[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear(); }
  function daysSince(iso) { return Math.floor((Date.now() - Date.parse(iso)) / 864e5); }
  var DIRS = [['longleft', 'Long left'], ['long', 'Long'], ['longright', 'Long right'], ['left', 'Left'], ['', 'On it'], ['right', 'Right'], ['shortleft', 'Short left'], ['short', 'Short'], ['shortright', 'Short right']];
  var DIRN = {}; DIRS.forEach(function (d) { DIRN[d[0]] = d[1].toLowerCase(); });

  T.ui = function (env) {
    var SG = env.SG, view = env.view;
    function S() { if (!view.sgt) view.sgt = { mode: 'hub' }; var s = view.sgt, names = env.players(); if (!s.who || names.indexOf(s.who) < 0) s.who = env.me() || names[0] || ''; return s; }
    function mine(who) { return env.tests().filter(function (t) { return env.same(t.player || env.me(), who); }).sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); }); }
    function byId(id) { return env.tests().filter(function (t) { return t.id === id; })[0]; }
    function put(test) { var all = env.tests(), i = all.map(function (t) { return t.id; }).indexOf(test.id); if (i < 0) all.push(test); else all[i] = test; env.saveTests(all); }
    function blFor(test, who) { return SG.baseline(env.baselineOf(who) || test.baseline).id; } // v177: always the player's benchmark now, so tests, rounds and reports agree
    // a finished test with the ones before it: { test, cur, cmp, I }
    function analysed(test, who, blOver) {
      var bl = blOver ? SG.baseline(blOver).id : blFor(test, who), prev = mine(who).filter(function (t) { return t.done && t.id !== test.id && String(t.date) < String(test.date); });
      var cur = T.score(test, SG, bl), ps = prev.map(function (t) { return T.score(t, SG, bl); }), cmp = T.compare(cur, ps);
      return { test: test, cur: cur, cmp: cmp, I: T.interpret(cur, cmp), prev: prev, ps: ps, bl: bl, blName: SG.baseline(bl).name };
    }
    function shortVal(sk, s) { return s.value == null ? '' : sk.unit === 'ft' ? r1(s.value) + ' ft' : sk.unit === 'balls' ? r1(s.value) + ' balls' : s.value + '/' + (s.of || sk.of); }
    function toneOf(c) { return c.trend === 'slipping' || c.status === 'worse' ? 'bad' : c.trend === 'improving' || c.status === 'better' ? 'good' : ''; }
    var sgTxt = function (v) { return (v >= 0 ? '+' : '') + v.toFixed(2); };
    function overallSpokes(A) { return T.CATS.map(function (c) { var x = A.cur.cats[c.k], av = A.cmp.cats[c.k].avgIndex;
      return { name: c.name, index: x.index, avg: av, sub: x.sg == null ? 'not tested' : sgTxt(x.sg) + ' a shot', val: x.sg == null ? '' : sgTxt(x.sg) + ' a shot', usual: av == null ? '' : 'usually ' + sgTxt((av - 100) / 100),
        tone: av == null || x.index == null ? '' : x.index <= av - 15 ? 'bad' : x.index >= av + 15 ? 'good' : '' }; }); }
    function catSpokes(A, cat) { return T.SKILLS.filter(function (sk) { return sk.cat === cat; }).map(function (sk) { var s = A.cur.skills[sk.k], c = A.cmp.skills[sk.k];
      return { name: sk.name.replace('Flop over a bunker', 'Flop').replace('Chips from rough', 'Rough').replace(' bunker', '').replace('Bunker shots on the green', 'On green').replace(' proximity', '').replace('Breaking putts', 'Breaking').replace('Speed ladder', 'Speed'),
        index: T.indexOf(A.cur, A.cmp, sk.k), avg: A.cmp.avgIndex[sk.k], sub: shortVal(sk, s), tone: toneOf(c) || (c.usual == null && T.indexOf(A.cur, A.cmp, sk.k) != null && T.indexOf(A.cur, A.cmp, sk.k) < 85 ? 'bad' : ''), // no usual yet: red when well below the benchmark
        k: sk.k, full: sk.name, val: s.value == null ? '' : T.fmtVal(sk, s), usual: s.value == null ? '' : rowSub(A, sk), tag: rowTag(c) }; }); }
    // v176 (Scott): every spider gets bars under it – one row per spoke: your average (grey), this test (green, red when down)
    // and a mark for the benchmark (or the ladder goal). Same scale as the spider, so further right is always better.
    // v177 (Scott): the bar's colour is how close it is to the benchmark mark – green within ~0.1 strokes a shot (90%+ of the way),
    // amber 0.1–0.25 behind (75–90%), red further back. Down / Slipping (against your own usual) stay as the tags.
    function tierOf(ix) { return ix == null ? '' : ix >= 90 ? 'g' : ix >= 75 ? 'a' : 'r'; }
    function barX(ix) { return Math.max(2, Math.min(100, (ix - 10) / 120 * 100)); }
    function barsHTML(spokes, benchName, id) {
      var any = spokes.some(function (x) { return x.index != null; }); if (!any) return '';
      var hasAvg = spokes.some(function (x) { return x.avg != null; });
      return '<div class="sgtbars"' + (id ? ' id="' + id + '"' : '') + '>' + spokes.map(function (x) {
        var tap = !!x.k, tag = x.tag ? '<em class="' + (x.tone || '') + '">' + esc(x.tag) + '</em>' : '';
        var lab = '<span class="sgtbl"><b>' + esc(x.full || x.name) + tag + '</b><span class="v' + tierOf(x.index) + '">' + esc(x.index == null ? 'not tested' : x.val || x.sub || '') + '</span>' + (x.usual ? '<small>' + esc(x.usual) + '</small>' : '') + '</span>';
        var trk = '<span class="sgtbt">' + (x.avg != null ? '<i class="avg" style="width:' + barX(x.avg).toFixed(1) + '%"></i>' : '') + (x.index != null ? '<i class="cur t' + tierOf(x.index) + '" style="width:' + barX(x.index).toFixed(1) + '%"></i>' : '') + '<s style="left:' + barX(100).toFixed(1) + '%"></s></span>';
        return tap ? '<button class="sgtbr" data-act="sgtrow" data-v="' + x.k + '">' + lab + trk + '</button>' : '<div class="sgtbr">' + lab + trk + '</div>'; }).join('') +
        '<p class="sgtbkey"><span><i class="k1 tg"></i><i class="k1 ta"></i><i class="k1 tr"></i>This test</span>' + (hasAvg ? '<span><i class="k2"></i>Your average</span>' : '') + '<span><i class="k3"></i>' + esc(benchName) + '</span><span>further right is better</span></p></div>';
    }
    // a spoke's history from the earlier tests (newest first, up to six): f(score) → number | null
    function histOf(A, f) { return (A.ps || []).map(f).filter(function (v) { return v != null; }).slice(0, 6); }
    function meanOf(a) { return a.length ? a.reduce(function (t, v) { return t + v; }, 0) / a.length : null; }
    // v168: short benchmark names for the narrow result rows ("D1 college women 5 ft" ran off the tile)
    function fmtUsual(v) { return (Math.round(v * 10) / 10).toFixed(1).replace(/\.0$/, ''); }
    function blShort(bl) { return { pga: 'PGA Tour', lpga: 'LPGA', d1m: 'D1', d1w: 'D1', scm: 'Scratch', scw: 'Scratch' }[bl] || 'Benchmark'; }
    // v168 (Scott): putting in two spiders. Lag & speed: lag from 30, 40, 50 ft against the benchmark; the three speed ladders
    // against a goal of the player's best ladder on that slope + 3 balls (no published benchmark). Short putts: the four lines.
    var SPEED_GOAL_PLUS = 3;
    function speedGoals(A) { var best = { flat: 0, up: 0, down: 0 };
      [A.test].concat(A.prev).forEach(function (t) { (T.score(t, SG, A.bl).skills.speed.bySlope || []).forEach(function (x) { if (x.n != null && x.n > best[x.k]) best[x.k] = x.n; }); });
      return { flat: best.flat + SPEED_GOAL_PLUS, up: best.up + SPEED_GOAL_PLUS, down: best.down + SPEED_GOAL_PLUS }; }
    function puttSpidersHTML(A) { var P = puttSpokes(A);
      return '<div class="sgtpsp" id="sgtpsplag"><p class="sgteyebrow">Lag and speed</p>' + T.spiderSVG(P.lag, { R: 70, padX: 112, aria: 'Lag and speed shape' }) +
        barsHTML(P.lag, blShort(A.bl) + ' level · ladder goal', 'sgtbars-lag') + '<p class="sgtnote">The mark is ' + esc(A.blName) + ' for the lag putts, and your goal for the speed ladders: your best ladder on that slope + ' + SPEED_GOAL_PLUS + ' balls.</p></div>' +
        '<div class="sgtpsp" id="sgtpspshort"><p class="sgteyebrow">Short and breaking putts</p>' + T.spiderSVG(P.lines, { R: 70, aria: 'Short putts shape' }) +
        barsHTML(P.lines, blShort(A.bl) + ' level', 'sgtbars-short') + '<p class="sgtnote">Putts made from 3, 5, 7 and 9 ft on each line.</p></div>';
    }
    function puttSpokes(A) {
      var X = A.cur.extra, G = speedGoals(A), SB = A.cur.skills.speed.bySlope || [{ k: 'flat', name: 'Flat', n: null }, { k: 'up', name: 'Uphill', n: null }, { k: 'down', name: 'Downhill', n: null }];
      var avg2 = function (a) { return a.length >= 2 ? meanOf(a) : null; }; // the average shape (and grey bar) needs two earlier tests, as elsewhere
      var lag = X.lag.byDist.map(function (d, i) { var hi = histOf(A, function (q) { var z = q.extra.lag.byDist[i]; return z && z.n ? z.index : null; }), hf = histOf(A, function (q) { var z = q.extra.lag.byDist[i]; return z && z.n ? z.ft : null; });
        return { name: 'Lag ' + d.dist, full: 'Lag from ' + d.dist + ' ft', index: d.n ? d.index : null, avg: avg2(hi), sub: d.n ? '' : 'not tested', val: d.n ? r1(d.ft) + ' ft away' : '', usual: hf.length ? (hf.length > 1 ? 'usually ' : 'last time ') + r1(meanOf(hf)) + ' ft' : '',
          tone: d.sg == null ? '' : d.sg <= -0.15 ? 'bad' : d.sg >= 0.15 ? 'good' : '' }; });
      var spd = SB.map(function (x) { var g = G[x.k], hn = histOf(A, function (q) { var z = (q.skills.speed.bySlope || []).filter(function (y) { return y.k === x.k; })[0]; return z && z.n != null ? z.n : null; });
        return { name: x.name + ' speed', full: x.name + ' ladder', index: x.n == null ? null : Math.max(10, Math.min(130, 100 * x.n / g)), avg: hn.length >= 2 ? Math.max(10, Math.min(130, 100 * meanOf(hn) / g)) : null,
          sub: x.n == null ? 'not tested' : x.n + ' ball' + (x.n === 1 ? '' : 's') + ' · goal ' + g, val: x.n == null ? '' : x.n + ' ball' + (x.n === 1 ? '' : 's') + ' · goal ' + g, usual: hn.length ? (hn.length > 1 ? 'usually ' : 'last time ') + r1(meanOf(hn)) : '', tone: x.n == null || !hn.length ? '' : x.n <= meanOf(hn) - 1.5 ? 'bad' : x.n >= meanOf(hn) + 1.5 ? 'good' : '' }; }); // v171 (Scott): a raw count, not x of y
      var lines = X.lines.map(function (l, i) { var hi = histOf(A, function (q) { var z = q.extra.lines[i]; return z && z.n ? z.index : null; }), hm = histOf(A, function (q) { var z = q.extra.lines[i]; return z && z.n ? z.made : null; });
        return { name: l.name, full: l.name + ' putts', index: l.n ? l.index : null, avg: avg2(hi), sub: l.n ? l.made + ' of ' + l.n : 'not tested', val: l.n ? l.made + ' of ' + l.n + ' made' : '', usual: hm.length ? (hm.length > 1 ? 'usually ' : 'last time ') + fmtUsual(meanOf(hm)) : '',
          tone: l.sg == null ? '' : l.sg <= -0.1 ? 'bad' : l.sg >= 0.1 ? 'good' : '' }; });
      return { lag: lag.concat(spd), lines: lines };
    }
    function top(left, title, sub, right) { return '<div class="topbar frost">' + left + '<div class="title"><b>' + esc(title) + '</b><span>' + esc(sub || '') + '</span></div>' + (right || '<span class="sgtsp"></span>') + '</div>'; }

    // ---------- hub ----------
    function hubHTML() {
      var s = S(), who = s.who, names = env.players(), list = mine(who), open = list.filter(function (t) { return !t.done; })[0], done = list.filter(function (t) { return t.done; });
      var h = '<div class="frostpage theme-sky sgtpage" id="sgtest">' + top('<button class="txt frostbtn" data-act="mygame" id="sgtback">‹ My Game</button>', 'Short game test', who);
      if (names.length > 1) h += '<div class="hchips" id="sgtchips" role="group" aria-label="Player">' + names.map(function (nm) { var on = nm === who; return '<button class="frostchip' + (on ? ' sel' : '') + '" data-act="sgtplayer" data-v="' + esc(nm) + '" aria-pressed="' + on + '">' + esc(nm) + '</button>'; }).join('') + '</div>';
      h += '<div class="sgtcard frost" id="sgtstartcard">';
      if (open) { var n = T.entered(open), nx = T.nextOpen(open);
        h += '<h2>Test in progress</h2><p>Started ' + esc(dShort(open.date)) + ' · ' + n + ' of ' + T.totalOf(open) + ' shots entered' + (nx ? ' · next: ' + esc(T.STATIONS[nx.st].name.toLowerCase()) : '') + '.</p>' +
          '<button class="primary big" data-act="sgtresume" data-v="' + esc(open.id) + '" id="sgtresume">Carry on</button><button class="txt sgtlink" data-act="sgtdel" data-v="' + esc(open.id) + '">Discard this test</button>';
      } else {
        var last = done[0], age = last ? daysSince(last.date) : null;
        h += '<h2>' + (last ? (age >= 30 ? 'Your monthly test is due' : 'Next test due in ' + (30 - age) + ' day' + (30 - age === 1 ? '' : 's')) : 'A one-hour check-up, once a month') + '</h2>' +
          '<p>' + T.TOTAL + ' shots over ' + T.STATIONS.length + ' stations: putting, chipping, bunker and wedges. The same test every time, so a skill that starts to slip shows up early.</p>' +
          '<p class="sgtneed">You need: a putting green with a sloped hole, a chipping green with a bunker, room for 100 yd wedges, about a dozen tees.</p>' +
          '<div class="sgtcond"><span>Greens today</span>' + ['slow', 'medium', 'fast'].map(function (g) { var on = (s.cond || {}).green === g; return '<button class="frostchip' + (on ? ' sel' : '') + '" data-act="sgtcond" data-v="green:' + g + '" aria-pressed="' + on + '">' + g + '</button>'; }).join('') + '</div>' +
          '<div class="sgtcond"><span>Wind</span>' + ['calm', 'breezy', 'windy'].map(function (g) { var on = (s.cond || {}).wind === g; return '<button class="frostchip' + (on ? ' sel' : '') + '" data-act="sgtcond" data-v="wind:' + g + '" aria-pressed="' + on + '">' + g + '</button>'; }).join('') + '</div>' +
          '<button class="primary big" data-act="sgtstart" id="sgtstart">Start the test</button><button class="txt sgtlink" data-act="sgtintro" id="sgtintroopen">What is this test? See the intro</button>';
      }
      h += '</div>';
      if (done.length) { var A = analysed(done[0], who);
        h += '<div class="sgtcard frost" id="sgtlatest"><p class="sgteyebrow">Latest test · ' + esc(dLong(done[0].date)) + '</p><h2>' + esc(A.I.headline) + '</h2><p>' + esc(A.I.sub) + '</p>' +
          T.spiderSVG(overallSpokes(A), { aria: 'Short game shape, latest test' }) + T.spiderKey(A.cmp.cats.putting.avgIndex != null, A.blName) +
          '<button class="frostbtn big" data-act="sgtview" data-v="' + esc(done[0].id) + '" id="sgtseelatest">See the full result</button></div>';
        h += '<div class="sgtcard frost" id="sgthist"><p class="sgteyebrow">All tests</p>' + done.map(function (t) { var c = [t.cond.green ? t.cond.green + ' greens' : '', t.cond.wind].filter(Boolean).join(', '), n = T.entered(t);
          return '<div class="sgthrow"><button class="sgthopen" data-act="sgtview" data-v="' + esc(t.id) + '"><b>' + esc(dLong(t.date)) + '</b><span>' + esc((n < T.totalOf(t) ? n + ' of ' + T.totalOf(t) + ' shots' : 'Complete') + (c ? ' · ' + c : '')) + '</span></button><button class="sgtx" data-act="sgtdel" data-v="' + esc(t.id) + '" aria-label="Delete the test of ' + esc(dLong(t.date)) + '">×</button></div>'; }).join('') + '</div>';
      }
      return h + '</div>';
    }

    // ---------- the guided test ----------
    function entryText(st, e) {
      if (!e) return '';
      if (st.kind === 'ladder') return e.n + ' ball' + (e.n === 1 ? '' : 's');
      if (st.kind === 'updown') return e.n + ' of ' + T.UD_BALLS;
      if (st.kind === 'compass') return e.made ? 'made' : 'missed' + (e.miss ? ' ' + e.miss : '');
      if (e.res) return e.res === 'sand' ? 'in sand' : e.res === 'short' ? 'short' : 'over';
      return (e.ft === 0 ? 'holed' : r1(e.ft).replace(/\.0$/, '') + ' ft') + (e.dir ? ' ' + (st.kind === 'lag' ? (e.dir === 'long' ? 'long' : 'short') : DIRN[e.dir]) : (st.kind === 'lag' && e.ft > 0 ? ' away' : ''));
    }
    function stationSummary(test, st, who) {
      var sc = T.score(test, SG, blFor(test, who)), k = st.id === 'ladder' ? 'speed' : st.id, bits = [];
      if (st.id === 'compass') { bits.push('Straight putts ' + sc.skills.short.value + ' of ' + sc.skills.short.of); bits.push('breaking putts ' + sc.skills.brk.value + ' of ' + sc.skills.brk.of); }
      else if (st.id === 'ladder') bits.push('Average ' + r1(sc.skills.speed.value) + ' balls, best ' + sc.skills.speed.best);
      else if (st.id === 'updown') { var u = sc.skills.updown; bits.push('Up and down ' + u.value + ' of ' + u.of + ' (' + Math.round(u.rate * 100) + '%)'); bits.push('each missed green costs about ' + r1(u.cost) + ' strokes'); }
      else { var s = sc.skills[k]; bits.push(s.value == null ? 'No ball finished on the green' : 'Average ' + r1(s.value) + ' ft away'); if (s.bench != null) bits.push(sc.baseline ? SG.baseline(sc.baseline).name + ' level is about ' + Math.round(s.bench) + ' ft' : '');
        if (st.id === 'flop' && sc.skills.flop.short) bits.push(sc.skills.flop.short + ' didn’t reach the green');
        if (st.kind === 'bunker') { var a = test.shots[st.id]; var sd = a.filter(function (e) { return e && e.res === 'sand'; }).length, ov = a.filter(function (e) { return e && e.res === 'over'; }).length; if (sd) bits.push(sd + ' stayed in the sand'); if (ov) bits.push(ov + ' flew the green'); } }
      return bits.filter(Boolean).join(' · ') + '.';
    }
    function runHTML() {
      var s = S(), test = byId(s.id); if (!test) { s.mode = 'hub'; return hubHTML(); }
      var st = T.STATIONS[s.st], a = test.shots[st.id], done = T.stationDone(test, st), i = Math.min(s.i, st.shots.length - 1), spec = st.shots[i], last = s.st === T.STATIONS.length - 1;
      var h = '<div class="frostpage theme-sky sgtpage sgtrun" id="sgtrun">' + top('<button class="txt frostbtn" data-act="sgthub" id="sgthubbtn">‹ Tests</button>', st.id === 'compass' ? 'Short putts' : st.id === 'flop' ? 'Flop shots' : st.name, 'Station ' + (s.st + 1) + ' of ' + T.STATIONS.length);
      h += '<div class="sgtdots" role="group" aria-label="Stations">' + T.STATIONS.map(function (x, k) { var d = T.stationDone(test, x), some = test.shots[x.id].some(Boolean);
        return '<button class="sgtdot' + (k === s.st ? ' cur' : '') + (d ? ' done' : some ? ' some' : '') + '" data-act="sgtstation" data-v="' + k + '" aria-label="' + esc(x.name + (d ? ', done' : '')) + '">' + (k + 1) + '</button>'; }).join('') + '</div>';
      var showSetup = s.setup != null ? s.setup : !a.some(Boolean);
      h += '<div class="sgtcard frost sgtsetup" id="sgtsetup"><button class="sgtsetuph" data-act="sgtsetup" aria-expanded="' + showSetup + '"><b>Set up</b><span>' + (showSetup ? 'Hide' : 'Show') + '</span></button>';
      if (showSetup) h += '<ol>' + st.setup.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ol>' + (st.kind === 'compass' ? T.compassSVG(done ? null : spec) +
        // v168 (Scott): golfers will ask why not walk one line 3 → 9 ft – the answer, folded away
        '<details class="sgtwhy" id="sgtwhy"><summary>Why go around the hole?</summary><p>Walking one line from 3 to 9 ft would be quicker, but after a putt or two you have learned that line’s speed and break, so the longer putts get easier than they would be in a round.</p>' +
        '<p>Going around the hole makes every putt a fresh read, the way it is on the course. A few more steps, a truer score – and a test you can’t game.</p></details>' : '');
      h += '</div>';
      if (done && !s.edit) {
        h += '<div class="sgtcard frost sgtdone" id="sgtdonecard"><p class="sgteyebrow">Station done</p><h2>' + esc(stationSummary(test, st, s.who)) + '</h2>' +
          (T.nextOpen(test) ? '<button class="primary big" data-act="sgtnext" id="sgtnext">Next station ›</button>' : '<button class="primary big" data-act="sgtfinish" id="sgtfinish">Finish and see the result</button>') + '</div>';
      } else {
        if (st.kind === 'lag') h += lagGroupHTML(st, a, i);
        else {
        h += '<div class="sgtcard frost sgtentry" id="sgtentry"><p class="sgteyebrow">' + esc(st.kind === 'updown' ? 'All 10 balls' : (st.kind === 'ladder' ? '' : st.kind === 'lag' || st.kind === 'compass' ? 'Putt ' : 'Shot ') + (st.kind === 'ladder' ? spec.label : (i + 1) + ' of ' + st.shots.length)) + '</p>' +
          '<h2 class="sgtwhat" id="sgtwhat">' + esc(st.kind === 'updown' ? 'How many did you get up and down?' : st.kind === 'ladder' ? spec.label + ' ladder · how many balls?' : st.kind === 'leave' || st.kind === 'bunker' ? st.name + ' · ' + st.dist + ' yd' : spec.label) + '</h2>';
        var cur = a[i], ftBox = '<label class="sgtft"><input id="sgtft" type="text" inputmode="decimal" autocomplete="off" placeholder="0" value="' + (cur && cur.ft != null ? esc(String(cur.ft)) : '') + '" aria-label="Feet away"><span>ft away</span></label>';
        var btn = function (v, label, cls) { return '<button class="' + (cls || 'frostbtn') + '" data-act="sgtsave" data-v="' + v + '">' + esc(label) + '</button>'; };
        if (st.kind === 'lag') h += ftBox + '<p class="sgthint">Type the feet away, then tap where it finished.</p><div class="sgtbtns g3">' + btn('short', 'Short') + btn('level', 'Level') + btn('long', 'Long') + '</div><div class="sgtbtns">' + btn('holed', 'Holed it') + '</div>';
        else if (st.kind === 'leave') h += ftBox + '<div class="sgtbtns">' + btn('', 'Save', 'primary') + btn('holed', 'Holed it') + '</div>' + (st.id === 'flop' ? '<div class="sgtbtns">' + btn('fshort', 'Didn’t reach the green') + '</div>' : '');
        else if (st.kind === 'bunker') h += ftBox + '<div class="sgtbtns">' + btn('', 'Save', 'primary') + btn('holed', 'Holed it') + '</div><div class="sgtbtns">' + btn('sand', 'Still in sand') + btn('over', 'Over the green') + '</div>';
        else if (st.kind === 'wedge') h += ftBox + '<p class="sgthint">Type the feet away, then tap where it finished from the hole.</p><div class="sgtbtns g3 sgtdir">' + DIRS.map(function (d) { return btn('dir:' + d[0], d[1]); }).join('') + '</div><div class="sgtbtns">' + btn('holed', 'Holed it') + '</div>';
        else if (st.kind === 'compass') { var straight = T.LINES.filter(function (l) { return l.k === spec.line; })[0].straight;
          h += '<div class="sgtbtns"><button class="primary" data-act="sgtmade" id="sgtmade">Made it</button></div><p class="sgthint">Missed? Tap where it went wrong.</p><div class="sgtbtns ' + (straight ? 'g2' : 'g2') + '">' +
            (straight ? ['short', 'long', 'left', 'right'] : ['high', 'low', 'short', 'long']).map(function (m) { return '<button class="frostbtn" data-act="sgtmiss" data-v="' + m + '">' + (m === 'high' ? 'High side' : m === 'low' ? 'Low side' : m === 'long' ? 'Long' : m.charAt(0).toUpperCase() + m.slice(1)) + '</button>'; }).join('') + '</div>' +
            // v168 (Scott): an 18-inch rule separates speed misses from direction misses – it matters for reading the results
            '<details class="sgtwhy" id="sgtlongwhy"><summary>Long, or a ' + (straight ? 'left / right' : 'high / low') + ' miss?</summary><p><b>Long</b> only if it finished more than 18 inches past the hole (about a putter grip). That is a speed miss: even on the right line it would likely have lipped out or rolled over the hole.</p>' +
            '<p>Within 18 inches the speed was fine and the line was off – tap the side it missed (' + (straight ? 'Left or Right' : 'High side or Low side') + '). Keeping these apart is what shows whether a putting leak is speed or aim.</p></details>'; }
        else if (st.kind === 'ladder' || st.kind === 'updown') { var n = s.lad != null ? s.lad : cur ? cur.n : 0, ud = st.kind === 'updown';
          h += '<div class="sgtstep"><button class="frostbtn" data-act="sgtlad" data-v="-1" aria-label="One fewer">−</button><b id="sgtladn">' + n + '</b>' + (ud ? '<small class="sgtof">of ' + T.UD_BALLS + '</small>' : '') + '<button class="frostbtn" data-act="sgtlad" data-v="1" aria-label="One more">+</button></div>' +
            (ud ? '<p class="sgthint">Up and down = in the hole in two shots or fewer. Chip-ins count.</p>' : '') + '<div class="sgtbtns"><button class="primary" data-act="sgtladsave" id="sgtladsave">' + (ud ? 'Save' : 'Save attempt') + '</button></div>'; }
        h += '</div>';
        }
      }
      h += '<div class="sgtchipsrow" id="sgtshots">' + st.shots.map(function (x, k) { var e = a[k];
        return '<button class="sgtshot' + (k === i && !(done && !s.edit) ? ' cur' : '') + (e ? ' in' : '') + '" data-act="sgtshot" data-v="' + k + '"><span>' + esc(st.kind === 'ladder' || st.kind === 'updown' ? x.label : st.kind === 'leave' || st.kind === 'bunker' ? '#' + (k + 1) : x.label.replace(' · ', ' ').replace('breaks ', '').replace('hill', '')) + '</span><b>' + esc(e ? entryText(st, e) : '–') + '</b></button>'; }).join('') + '</div>';
      h += '<div class="sgtfoot">' + (!done && !last ? '<button class="txt sgtlink" data-act="sgtskip">Skip this station</button>' : '') + (T.entered(test) ? '<button class="txt sgtlink" data-act="sgtfinish">Finish the test now</button>' : '') + '</div>';
      return h + '</div>';
    }

    // ---------- the result ----------
    function rowSub(A, sk) { var s = A.cur.skills[sk.k], c = A.cmp.skills[sk.k];
      return c.usual != null ? (c.tests > 1 ? 'usually ' : 'last time ') + T.fmtNum(sk, c.usual) : s.bench != null ? blShort(A.bl) + ' ' + (sk.k === 'updown' ? Math.round(s.benchRate * 100) + '%' : sk.unit === 'ft' ? Math.round(s.bench) + ' ft' : r1(s.bench)) : sk.k === 'speed' ? 'best ' + s.best : ''; }
    function rowTag(c) { return c.trend === 'slipping' ? 'Slipping' : c.trend === 'improving' ? 'Improving' : c.status === 'worse' ? 'Down' : c.status === 'better' ? 'Up' : ''; }
    // v175 (Scott): the latest finished test, ready for the My Game report (pictures as SVG strings, everything else as text)
    function reportData(who, id) {
      var done = mine(who).filter(function (t) { return t.done; }); if (!done.length) return null;
      var pick = id ? done.filter(function (t) { return t.id === id; })[0] || done[0] : done[0]; // v193: the test you're looking at
      var A = analysed(pick, who), P = puttSpokes(A), bn = blShort(A.bl), ftS = function (v) { return (v < 10 ? v.toFixed(1) : String(Math.round(v))) + ' ft'; };
      var cats = T.CATS.map(function (c) { var x = A.cur.cats[c.k], skills = T.SKILLS.filter(function (sk) { return sk.cat === c.k; });
        var any = skills.some(function (sk) { return A.cur.skills[sk.k].value != null; });
        var bar = function (L) { return L.map(function (x) { return { name: x.full || x.name, val: x.index == null ? 'not tested' : x.val || x.sub || '', usual: x.usual || '', index: x.index, avg: x.avg, tone: x.tone || '', tier: tierOf(x.index), tag: x.tag || '' }; }); };
        var pics = !any ? [] : c.k === 'putting' ? [{ title: 'Lag and speed', svg: T.spiderSVG(P.lag, { R: 70, padX: 112 }), bars: bar(P.lag) }, { title: 'Short and breaking putts', svg: T.spiderSVG(P.lines, { R: 70 }), bars: bar(P.lines) }]
          : c.k === 'wedge' ? [] : [{ title: '', svg: T.spiderSVG(catSpokes(A, c.k), { R: 70 }), bars: bar(catSpokes(A, c.k)) }];
        var wbars = null; if (c.k === 'wedge' && any) { var WX = A.cur.extra.wedge; wbars = WX.byDist.map(function (d, i) { var h = histOf(A, function (q) { var z = q.extra.wedge.byDist[i]; return z && z.n ? z.ft : null; }), u = h.length >= 2 ? meanOf(h) : null;
          return { d: d.dist, ft: d.ft, usual: u, bench: d.bench, tier: tierOf(d.n && d.sg != null ? 100 + d.sg * 100 : null), tone: d.ft != null && u != null ? (d.ft > u + Math.max(2, 0.25 * u) ? 'bad' : d.ft < u - Math.max(2, 0.25 * u) ? 'good' : '') : '' }; }); }
        var rows = skills.filter(function (sk) { return A.cur.skills[sk.k].value != null; }).map(function (sk) { var cc = A.cmp.skills[sk.k]; return { name: sk.name, value: T.fmtVal(sk, A.cur.skills[sk.k]), sub: rowSub(A, sk), tag: rowTag(cc), tone: toneOf(cc) }; });
        var warn = (A.cmp.warn || []).filter(function (w) { return w.cat === c.k; }).map(function (w) {
          return { title: w.title, sub: w.vs === 'own' ? 'Usually ' + (w.unit === 'made' ? fmtUsual(w.usual) + ' of ' + (w.usualOf || w.of) : ftS(w.usual) + ' away') + ' · last ' + w.tests + ' tests'
            : w.bench == null ? '' : (w.unit === 'made' ? bn + ' players make about ' + w.bench : 'Level with ' + bn + ': about ' + ftS(w.bench)) + ' · no usual of your own yet', why: w.why || '' }; });
        var notes = [], u = A.cur.skills.updown;
        if (c.k === 'chipping' && u.value != null) notes.push('Up and down ' + Math.round(u.rate * 100) + '% (' + bn + ' about ' + Math.round(u.benchRate * 100) + '%) – each missed green costs about ' + r1(u.cost) + ' strokes.');
        if (c.k === 'bunker' && any) { var B = A.cur.extra.bunker; notes.push(B.over + ' of ' + B.n + ' flew the green · ' + B.sand + ' stayed in the sand.'); }
        return { k: c.k, name: c.name, any: any, sg: x.sg, pics: pics, rows: rows, wbars: wbars, warn: warn, notes: notes }; });
      return { date: A.test.date, tests: done.length, headline: A.I.headline, sub: A.I.sub, blName: A.blName, cond: [A.test.cond.green ? A.test.cond.green + ' greens' : '', A.test.cond.wind].filter(Boolean).join(', '),
        overall: T.spiderSVG(overallSpokes(A), { R: 92 }), overallBars: overallSpokes(A).map(function (x) { return { name: x.name, val: x.index == null ? 'not tested' : x.val, usual: x.usual, index: x.index, avg: x.avg, tone: x.tone, tier: tierOf(x.index), tag: '' }; }), blShort: blShort(A.bl), hasAvg: A.cmp.cats.putting.avgIndex != null, entered: T.entered(A.test), total: T.totalOf(A.test),
        plan: A.I.plan.map(function (p) { return { title: p.title, why: p.why, drill: p.drill }; }), coach: A.I.coach.map(function (c) { return { text: c.text, ask: c.ask }; }), cats: cats };
    }
    // v176 (Scott): what the latest test found in each area, for the course vs test card. A way-off check names the spot
    // ("Downhill putts: 1 of 4 made"); otherwise the skill that is down (or, with no history yet, furthest below the benchmark).
    var AREA_SKILLS = { putting: ['lag', 'speed', 'short', 'brk'], chipping: ['chipShort', 'chipLong', 'flop', 'rough', 'updown'], bunker: ['bkShort', 'bkLong', 'bkOn'], wedge: ['wedge'] };
    // bl: score the test against the same benchmark as the rounds it is compared with (v176 fix: they could differ)
    function testFlags(who, bl) {
      var done = mine(who).filter(function (t) { return t.done; }); if (!done.length) return null;
      var A = analysed(done[0], who, bl), out = { date: A.test.date, areas: {}, cats: {} }, ftS = function (v) { return (v < 10 ? v.toFixed(1) : String(Math.round(v))) + ' ft'; };
      Object.keys(AREA_SKILLS).forEach(function (cat) {
        var cx = A.cur.cats[cat]; out.cats[cat] = { sg: cx.sg, index: cx.index,
          worst: AREA_SKILLS[cat].map(function (k) { var v = A.cur.skills[k]; return v.value == null ? null : { name: T.SKILL[k].name, val: T.fmtVal(T.SKILL[k], v), ix: T.indexOf(A.cur, A.cmp, k) }; }).filter(function (x) { return x && x.ix != null; }).sort(function (a, b) { return a.ix - b.ix; })[0] || null };
        var w = (A.cmp.warn || []).filter(function (x) { return x.cat === cat; }).sort(function (a, b) { return a.sg - b.sg; })[0];
        if (w) { out.areas[cat] = { name: w.title.split(':')[0], val: w.title.split(': ')[1] || '', usual: w.vs === 'own' ? 'usually ' + (w.unit === 'made' ? fmtUsual(w.usual) : ftS(w.usual)) : '' }; return; }
        var L = AREA_SKILLS[cat].map(function (k) { var sk = T.SKILL[k], v = A.cur.skills[k], c = A.cmp.skills[k]; return v.value == null ? null : { sk: sk, v: v, c: c, ix: T.indexOf(A.cur, A.cmp, k) }; }).filter(Boolean);
        var down = L.filter(function (x) { return x.c.status === 'worse' || x.c.trend === 'slipping'; }).sort(function (a, b) { return (a.ix || 100) - (b.ix || 100); })[0]
          || L.filter(function (x) { return x.c.usual == null && x.ix != null && x.ix < 85; }).sort(function (a, b) { return a.ix - b.ix; })[0];
        out.areas[cat] = down ? { name: down.sk.name, val: T.fmtVal(down.sk, down.v), usual: down.c.usual != null ? 'usually ' + T.fmtNum(down.sk, down.c.usual) : '' } : null; });
      return out;
    }
    function rowHTML(A, sk, open) {
      var s = A.cur.skills[sk.k], c = A.cmp.skills[sk.k], dates = A.prev.slice(0, 11).reverse().filter(function (t, n) { return true; }).map(function (t) { return dShort(t.date); });
      if (s.value == null) return '<div class="sgtrow none"><span class="sgtrn">' + esc(sk.name) + '</span><span class="sgtrv"><small>not tested</small></span></div>';
      // dates line up with the series: only tests that have this skill
      var withSkill = A.prev.filter(function (t) { return T.score(t, SG, A.bl).skills[sk.k].value != null; }).slice(0, 11).reverse().map(function (t) { return dShort(t.date); }).concat([dShort(A.test.date)]);
      var sub = rowSub(A, sk), tag = rowTag(c);
      var o = '<button class="sgtrow ' + toneOf(c) + (open ? ' open' : '') + '" data-act="sgtrow" data-v="' + sk.k + '" aria-expanded="' + !!open + '"><span class="sgtrn">' + esc(sk.name) + (tag ? '<em>' + tag + '</em>' : '') + '</span>' +
        T.sparkSVG(c.series, sk, { usual: c.usual, thr: c.thr, status: toneOf(c) === 'bad' ? 'worse' : toneOf(c) === 'good' ? 'better' : 'same' }) +
        '<span class="sgtrv"><b>' + esc(T.fmtVal(sk, s)) + '</b><small>' + esc(sub) + '</small></span></button>';
      if (open) o += '<div class="sgtbig">' + T.sparkSVG(c.series, sk, { big: true, usual: c.usual, thr: c.thr, status: toneOf(c) === 'bad' ? 'worse' : toneOf(c) === 'good' ? 'better' : 'same', dates: withSkill }) +
        '<p>' + esc((sk.better === 'low' ? 'Feet away on average – higher on the graph is closer to the hole. ' : sk.k === 'updown' ? 'Ups and downs out of 10. ' : sk.unit === 'balls' ? 'Balls per ladder, average of three' + ((s.bySlope || []).some(function (x) { return x.n != null; }) ? ' (' + s.bySlope.map(function (x) { return x.name.toLowerCase() + ' ' + (x.n == null ? '–' : x.n); }).join(', ') + ')' : '') + '. ' : 'Putts made. ') + (c.usual != null ? 'The band is your usual range.' : 'A band for your usual range appears after the next test.') + (s.bench != null ? ' ' + A.blName + ' level: ' + (sk.unit === 'ft' ? 'about ' + Math.round(s.bench) + ' ft.' : sk.k === 'updown' ? 'about ' + Math.round(s.benchRate * 100) + '% up and down.' : 'about ' + r1(s.bench) + ' of ' + s.of + '.') : '')) + '</p></div>';
      return o;
    }
    // v174 (Scott): up and down % and what every missed green costs – 60% is 0.4 strokes a green, 20% is 0.8
    function upDownHTML(A) {
      var u = A.cur.skills.updown; if (u.value == null) return '';
      var pct = Math.round(u.rate * 100), bp = Math.round(u.benchRate * 100), bad = u.rate < u.benchRate - 0.15;
      return '<div class="sgtud' + (bad ? ' bad' : '') + '" id="sgtud"><div class="sgtudh"><b>' + pct + '%</b><span>up and down<small>' + u.value + ' of ' + u.of + ' · ' + esc(blShort(A.bl)) + ' about ' + bp + '%</small></span></div>' +
        '<p>Every time you miss a green it costs you about <b>' + r1(u.cost) + ' strokes</b>' + (u.rate < 1 ? ' – at ' + pct + '% up and down, ' + (100 - pct) + ' in 100 missed greens turn into a dropped shot.' : '.') +
        (pct < 80 ? ' At ' + (pct + 20) + '% it would be ' + r1(Math.max(0, u.cost - 0.2)) + '.' : '') + '</p></div>';
    }
    function wedgeHTML(A) {
      // v176 (Scott): a bar per yardage – this test, your average (grey, from two earlier tests), and the benchmark mark
      var W = A.cur.extra.wedge, us = W.byDist.map(function (d, i) { var h = histOf(A, function (q) { var z = q.extra.wedge.byDist[i]; return z && z.n ? z.ft : null; }); return h.length >= 2 ? meanOf(h) : null; });
      var max = 1.1 * Math.max.apply(null, W.byDist.map(function (d, i) { return Math.max(d.ft || 0, d.bench, us[i] || 0); }).concat([10]));
      var o = '<div class="sgtwbars" id="sgtwbars">' + W.byDist.map(function (d, i) { var bad = d.ft != null && us[i] != null && d.ft > us[i] + Math.max(2, 0.25 * us[i]), good = d.ft != null && us[i] != null && d.ft < us[i] - Math.max(2, 0.25 * us[i]);
        return '<div class="sgtwb t' + tierOf(d.n && d.sg != null ? 100 + d.sg * 100 : null) + (bad ? ' bad' : good ? ' good' : '') + '"><span>' + d.dist + ' yd</span><i>' + (us[i] != null ? '<em style="width:' + (100 * us[i] / max).toFixed(1) + '%"></em>' : '') + '<u style="width:' + (d.ft == null ? 0 : (100 * d.ft / max).toFixed(1)) + '%"></u><s style="left:' + (100 * d.bench / max).toFixed(1) + '%"></s></i><b class="v' + tierOf(d.n && d.sg != null ? 100 + d.sg * 100 : null) + '">' + (d.ft == null ? '–' : r1(d.ft) + ' ft') + '</b></div>'; }).join('') +
        '<p class="sgtbkey"><span><i class="k1 tg"></i><i class="k1 ta"></i><i class="k1 tr"></i>This test, ft away</span>' + (us.some(function (x) { return x != null; }) ? '<span><i class="k2"></i>Your average</span>' : '') + '<span><i class="k3"></i>' + esc(blShort(A.bl)) + ' level</span><span>shorter is better</span></p></div>';
      var cell = function (v, lab) { return '<span class="' + (v ? 'on' : '') + '"><b>' + v + '</b>' + lab + '</span>'; };
      if (W.n) o += '<div class="sgtmiss" id="sgtmiss"><p class="sgteyebrow">Where the wedges finished</p><div class="sgtmgrid"><span></span>' + cell(W.long, 'long') + '<span></span>' + cell(W.left, 'left') + '<span class="pin">hole</span>' + cell(W.right, 'right') + '<span></span>' + cell(W.short, 'short') + '<span></span></div></div>';
      return o;
    }
    function resultHTML() {
      var s = S(), test = byId(s.id); if (!test) { s.mode = 'hub'; return hubHTML(); }
      var A = analysed(test, s.who), I = A.I, n = T.entered(test), cond = [test.cond.green ? test.cond.green + ' greens' : '', test.cond.wind].filter(Boolean).join(', ');
      // v193 (Scott): ☰ – Tests, Make PDF, Trend
      // v194 (Scott): the bottom bar has History · Trend · Report · New test (no ☰)
      var h = '<div class="frostpage theme-sky sgtpage sgtres" id="sgtresult">' + top('<button class="txt frostbtn" data-act="mygame" id="sgthubbtn">‹ My Game</button>', 'Test', dLong(test.date));
      if (env.quickRow) h += env.quickRow('sgtqrow', [['history', 'sgthub', 'History'], ['trends', 'sgttrend', 'Trend'], ['report', 'sgtpdf', 'Report'], ['add', 'sgtnew', 'New test']]); // v198: on the page, not a bottom bar
      h += env.pdfPanel ? env.pdfPanel() : '';
      h += '<div class="sgtcard frost" id="sgtverdict"><h2 id="sgthead">' + esc(I.headline) + '</h2><p id="sgtsub">' + esc(I.sub) + '</p>' +
        '<p class="sgtnote">' + esc(s.who ? s.who + ' · ' : '') + esc('compared with ' + A.blName) + (cond ? ' · ' + esc(cond) : '') + (n < T.totalOf(test) ? ' · ' + n + ' of ' + T.totalOf(test) + ' shots entered' : '') + '</p>' +
        T.spiderSVG(overallSpokes(A), { aria: 'Short game shape' }) + T.spiderKey(A.cmp.cats.putting.avgIndex != null, A.blName) + barsHTML(overallSpokes(A), blShort(A.bl) + ' level', 'sgtbars-all') +
        '<p class="sgtnote">Each spoke is strokes gained per shot against ' + esc(A.blName) + ': on the line is level, inside it is losing strokes.' + (A.cmp.tests < 2 ? ' Your average appears as a dashed shape from your third test.' : '') + '</p></div>';
      T.CATS.forEach(function (c) {
        var x = A.cur.cats[c.k], skills = T.SKILLS.filter(function (sk) { return sk.cat === c.k; }), any = skills.some(function (sk) { return A.cur.skills[sk.k].value != null; });
        h += '<div class="sgtcard frost sgtcat" id="sgtcat-' + c.k + '"><div class="sgtcath"><h2>' + esc(c.name) + '</h2><span>' + (x.sg == null ? '' : (x.sg >= 0 ? '+' : '') + x.sg.toFixed(2) + ' strokes a shot') + '</span></div>';
        if (!any) h += '<p class="sgtnote">Not tested this time.</p>';
        else if (c.k === 'wedge') h += wedgeHTML(A);
        else if (c.k === 'putting') h += puttSpidersHTML(A);
        else h += T.spiderSVG(catSpokes(A, c.k), { R: 70, aria: c.name + ' shape' }) + barsHTML(catSpokes(A, c.k), blShort(A.bl) + ' level', 'sgtbars-' + c.k);
        // v168 (Scott): way off YOUR usual (the benchmark only until there are two earlier tests to make a usual)
        var W = (A.cmp.warn || []).filter(function (w) { return w.cat === c.k; }), bn = blShort(A.cur.baseline);
        var ftS = function (v) { return (v < 10 ? v.toFixed(1) : String(Math.round(v))) + ' ft'; };
        if (W.length) h += '<div class="sgtwarn" id="sgtwarn-' + c.k + '"><p class="sgteyebrow">' + (W.every(function (w) { return w.vs === 'own'; }) ? 'Way off your usual' : 'Way off – worth a look') + '</p>' + W.map(function (w) {
          var cmpTxt = w.vs === 'own' ? 'Usually ' + (w.unit === 'made' ? fmtUsual(w.usual) + ' of ' + (w.usualOf || w.of) : ftS(w.usual) + ' away') + ' · last ' + w.tests + ' tests'
            : w.bench == null ? '' : (w.unit === 'made' ? bn + ' players make about ' + w.bench : 'Level with ' + bn + ': about ' + ftS(w.bench)) + ' · no usual of your own yet';
          return '<div data-k="' + esc(w.k) + '" data-vs="' + w.vs + '"><b>' + esc(w.title) + '</b>' + (cmpTxt ? '<small>' + esc(cmpTxt) + '</small>' : '') + (w.why ? '<span>' + esc(w.why) + '</span>' : '') + '</div>'; }).join('') + '</div>';
        if (c.k === 'putting' && any) { var X = A.cur.extra; h += '<p class="sgtnote">By distance: ' + esc(X.byDist.filter(function (d) { return d.n; }).map(function (d) { return d.dist + ' ft ' + d.made + '/' + d.n; }).join(' · ')) + '</p>'; }
        if (c.k === 'chipping') h += upDownHTML(A);
        if (c.k === 'bunker' && any) { var B = A.cur.extra.bunker; h += '<p class="sgtnote' + (B.over >= 2 ? ' bad' : '') + '" id="sgtover">' + B.over + ' of ' + B.n + ' flew the green · ' + B.sand + ' stayed in the sand</p>'; }
        if (c.k === 'putting' || c.k === 'wedge') h += '<div class="sgtrows">' + skills.map(function (sk) { return rowHTML(A, sk, s.open === sk.k); }).join('') + '</div>';
        else if (s.open && skills.some(function (sk) { return sk.k === s.open; })) { var osk = skills.filter(function (sk) { return sk.k === s.open; })[0]; h += '<div class="sgtrows">' + rowHTML(A, osk, true) + '</div>'; } // the tapped bar's history
        h += '</div>';
      });
      if (I.plan.length) h += '<div class="sgtcard sgtplan" id="sgtplan"><p class="sgteyebrow">Practice this month</p>' + I.plan.map(function (p, k) { return '<div><b>' + (k + 1) + '. ' + esc(p.title) + '</b><em>' + esc(p.why) + '</em><span>' + esc(p.drill) + '</span></div>'; }).join('') + '</div>';
      if (I.coach.length) h += '<div class="sgtcard frost sgtcoach" id="sgtcoach"><p class="sgteyebrow">Ask your coach</p>' + I.coach.map(function (c) { return '<div><b>' + esc(c.text) + '</b><span>' + esc(c.ask) + '</span></div>'; }).join('') + '</div>';
      h += '<p class="sgtnote sgtfootnote">Tap a skill to see every test. A skill is marked Down when it is worse than your usual by more than its normal wobble, and Slipping when it has dropped two tests in a row.</p>';
      if (!test.done || n < T.totalOf(test)) h += '<button class="frostbtn big" data-act="sgtresume" data-v="' + esc(test.id) + '">Add the missing shots</button>';
      // v170 (Scott): a plain way to delete a test from its result page (the × on All tests was easy to miss)
      h += '<button class="txt sgtlink sgtdelres" data-act="sgtdel" data-v="' + esc(test.id) + '" id="sgtdelres">Delete this test</button>';
      return h + '</div>';
    }

    // ---------- v168 (Scott): an intro to swipe through the first time – styled like the Instagram one-pager ----------
    var INTRO_K = 'golfsg.sgtintro.v1';
    function introDone() { try { localStorage.setItem(INTRO_K, '1'); } catch (e) {} }
    var INTRO_N = 5; // slides
    function introHTML() {
      var SK = {}; T.SKILLS.forEach(function (x) { SK[x.k] = x; });
      var spider = T.spiderSVG([{ name: 'Putting', index: 96, avg: 88, sub: '+0.04 a shot' }, { name: 'Chipping', index: 108, avg: 101, sub: '+0.11 a shot' }, { name: 'Bunker', index: 72, avg: 86, sub: '−0.21 a shot', tone: 'bad' }, { name: 'Wedges', index: 99, avg: 97, sub: '0.00 a shot' }], { R: 92, aria: 'Example: short game shape' });
      var spark = T.sparkSVG([5.8, 5.1, 4.6, 4.9, 5.6, 6.4], SK.lag, { big: true, usual: 5.1, thr: 0.75, status: 'worse', dates: ['Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov'] });
      var stn = [['Putting', 'Lag putts from 30, 40 and 50 ft · a speed ladder flat, uphill and downhill · short and breaking putts'], ['Chipping', 'Short, long, a flop over a bunker, from the rough – and 10 up and downs'], ['Bunker', 'Short and long greenside bunker shots'], ['Wedges', '30 to 100 yd, three balls each']];
      var slide = function (n, eyebrow, title, body) { return '<section class="sgtislide" data-n="' + n + '" aria-label="' + esc(title) + '"><p class="sgtieye">' + esc(eyebrow) + '</p><h2>' + title + '</h2>' + body + '</section>'; };
      var o = '<div class="sgtintro" id="sgtintro" role="dialog" aria-label="About the short game test"><div class="sgtibg" aria-hidden="true"></div>' +
        '<div class="sgtitop"><span class="sgtibrand"><i aria-hidden="true"></i>STROKEWISE</span>' + (S().introThen === 'start' ? '<button class="sgtiskip" data-act="sgtintroback" id="sgtintroback">‹ Back</button>' : '<button class="sgtiskip" data-act="sgtintroskip" id="sgtintroskip">Skip intro</button>') + '</div>' +
        '<div class="sgtislides" id="sgtislides">' +
        slide(0, 'Short game test', 'Your monthly<br>check-up', '<p class="sgtibig">An hour around one practice green. It finds the gaps you don’t notice on the course – before they show up on the scorecard.</p>' +
          '<div class="sgtipanel"><p class="sgtilbl">Why every month</p><p>Touch fades quietly. A test each month catches a slip while it’s small and shows whether practice is working.</p></div>' +
          '<div class="sgtipanel"><p class="sgtilbl">And it’s practice</p><p>' + T.TOTAL + ' shots, each one with a target and a score – a great session on its own.</p></div>') +
        slide(1, 'How it works', T.STATIONS.length + ' stations,<br>' + T.TOTAL + ' shots', '<div class="sgtipanel sgtisteps">' + stn.map(function (x) { return '<div><b>' + esc(x[0]) + '</b><span>' + esc(x[1]) + '</span></div>'; }).join('') + '</div>' +
          '<div class="sgtipanel"><p class="sgtilbl">As you go</p><p>Each station shows how to set it up. Enter each shot with a tap or two – feet away, short or long, made or missed.</p></div>') +
        // v174 (Scott): the up and down station – and why it matters
        slide(2, 'Up and down', 'Ten balls,<br>one number', '<p class="sgtibig">Scatter 10 balls around the green – different distances, different lies: fringe, rough, a tight lie, a bunker, short-sided. Play each one until it’s in.</p>' +
          '<div class="sgtipanel"><p class="sgtilbl">Just count</p><p>No shot-by-shot entry. Tap how many you got up and down – in the hole in two shots or fewer – like 6 of 10.</p></div>' +
          '<div class="sgtipanel"><p class="sgtilbl">Why it matters</p><p>Every missed green costs you strokes. Up and down 60% of the time, each one costs about <b>0.4</b>. At 20% it’s <b>0.8</b>. Miss 8 greens and that gap is over 3 shots a round.</p></div>') +
        slide(3, 'What you get', 'Your short game,<br>at a glance', '<div class="sgtipanel sgtichart"><p class="sgtilbl">Shape vs your benchmark</p>' + spider + '</div>' +
          '<div class="sgtipanel sgtichart"><p class="sgtilbl">Every skill over time · lag putts, feet away</p>' + spark + '</div>') +
        slide(4, 'What it tells you', 'The leaks,<br>in plain words', '<div class="sgtipanel sgtiread"><p class="sgtitag bad">Slipping</p><p><b>Lag putts</b> – worse two tests in a row. 5 of 6 misses finished short.</p></div>' +
          '<div class="sgtipanel sgtiread"><p class="sgtitag bad">Below your benchmark</p><p><b>Bunker</b> – long bunker shots finish 24 ft away; the benchmark is 15.</p></div>' +
          '<div class="sgtipanel sgtiread"><p class="sgtitag good">Working</p><p><b>Chipping</b> is up on last month. Keep the drill going.</p></div>' +
          '<p class="sgtibig sm">Each one comes with a drill to practise and a note for your coach.</p>') +
        '</div><div class="sgtifoot"><div class="sgtidots" id="sgtidots" aria-hidden="true">' + [0, 1, 2, 3, 4].map(function (k) { return '<i' + (k === 0 ? ' class="on"' : '') + '></i>'; }).join('') + '</div>' +
        '<button class="sgtinext" data-act="sgtintronext" id="sgtintronext">Next ›</button></div></div>';
      return o;
    }
    function introAt() { var el = document.getElementById('sgtislides'); return el ? Math.round(el.scrollLeft / Math.max(1, el.clientWidth)) : 0; }
    function introSync() { var k = introAt(), d = document.querySelectorAll('#sgtidots i'), nb = document.getElementById('sgtintronext');
      [].forEach.call(d, function (x, j) { x.className = j === k ? 'on' : ''; }); if (nb) nb.textContent = k >= INTRO_N - 1 ? (S().introThen === 'start' ? 'Start the test' : 'Done') : 'Next ›'; }
    document.addEventListener('scroll', function (ev) { if (ev.target && ev.target.id === 'sgtislides') introSync(); }, true);
    function startTest(s) { var t = T.blank('sgt' + Date.now().toString(36), new Date().toISOString(), s.who, env.baselineOf(s.who)); t.cond = { green: (s.cond || {}).green || '', wind: (s.cond || {}).wind || '' }; put(t); goto(t, 0, 0); env.render(); window.scrollTo(0, 0); }
    var MENU_IC = '<svg class="menuic" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
    // ---------- v193 (Scott): Trend – each area across your tests, oldest to newest ----------
    function trendHTML() {
      var s = S(), done = mine(s.who).filter(function (t) { return t.done; }).slice().reverse(), back = s.id ? 'sgtview' : 'sgthub';
      var h = '<div class="frostpage theme-sky sgtpage sgttrend" id="sgttrend">' + top('<button class="txt frostbtn" data-act="' + back + '" data-v="' + esc(s.id || '') + '" id="sgttrendback">‹ ' + (s.id ? 'Result' : 'Tests') + '</button>', 'Trend', (s.who ? s.who + ' · ' : '') + done.length + ' test' + (done.length === 1 ? '' : 's'));
      if (done.length < 2) return h + '<div class="sgtcard frost"><p class="sgtmnone">Take another test to see a trend – each area is plotted test by test.</p></div></div>';
      // v194 (Scott): one simple line per test station, test by test; up is always better (distances are drawn upside down)
      var As = done.map(function (t) { return analysed(t, s.who); });
      h += '<p class="sgttrendlede">Each station test by test – up is better. Dots: green near ' + esc(blShort(As[As.length - 1].bl)) + ' level, amber behind, red well behind.</p>';
      T.CATS.forEach(function (c) {
        var skills = T.SKILLS.filter(function (sk) { return sk.cat === c.k; }), cards = '';
        skills.forEach(function (sk) {
          var vals = As.map(function (A) { var v = A.cur.skills[sk.k]; return v && v.value != null ? v.value : null; }), have = vals.filter(function (v) { return v != null; });
          if (!have.length) return;
          var low = sk.better === 'low', lo = Math.min.apply(null, have), hi = Math.max.apply(null, have), pad = Math.max((hi - lo) * 0.2, sk.unit === 'made' ? 1 : 0.5);
          lo = Math.max(0, lo - pad); hi = hi + pad; if (sk.unit === 'made') { lo = Math.floor(lo); hi = Math.min(Math.ceil(hi), sk.of || 10); if (hi - lo < 2) lo = Math.max(0, hi - 2); }
          var W = 320, H = 96, L = 32, R = 24, TP = 10, B = 22, x = function (i) { return L + (As.length === 1 ? (W - L - R) / 2 : i * (W - L - R) / (As.length - 1)); };
          var y = function (v) { var f = (v - lo) / (hi - lo || 1); return TP + (low ? f : 1 - f) * (H - TP - B); }, line = '', dots = '', lab = '';
          vals.forEach(function (v, i) { if (v == null) return; line += (line ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1);
            dots += '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(v).toFixed(1) + '" r="4.5" class="tr' + (tierOf(T.indexOf(As[i].cur, As[i].cmp, sk.k)) || 'a') + '"/>'; });
          As.forEach(function (A, i) { if (As.length <= 6 || i === 0 || i === As.length - 1 || i % Math.ceil(As.length / 5) === 0) lab += '<text x="' + x(i).toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle" class="trax">' + esc(dShort(done[i].date)) + '</text>'; });
          var axis = [lo, hi].map(function (v) { return '<text x="' + (L - 5) + '" y="' + (y(v) + 3.5).toFixed(1) + '" text-anchor="end" class="trax">' + esc(sk.unit === 'made' ? String(Math.round(v)) : T.fmtNum(sk, v) + (sk.unit === 'ft' ? 'ft' : '')) + '</text>'; }).join('');
          var first = have[0], last = have[have.length - 1], d = last - first, good = low ? d < 0 : d > 0, unit = sk.unit === 'ft' ? ' ft' : sk.unit === 'balls' ? ' balls' : '';
          var ch = have.length < 2 || Math.abs(d) < (sk.unit === 'ft' ? 0.3 : 0.5) ? 'steady' : (good ? '▲ ' : '▼ ') + T.fmtNum(sk, Math.abs(d)) + unit + (sk.unit === 'ft' ? (good ? ' closer' : ' further') : good ? ' more' : ' fewer');
          cards += '<div class="trrow" data-sk="' + sk.k + '"><div class="trhead"><b>' + esc(sk.name) + '</b><span>' + esc(T.fmtVal(sk, As[As.length - 1].cur.skills[sk.k]).replace(' away', '')) + '</span><em class="' + (ch === 'steady' ? '' : good ? 'up' : 'down') + '">' + esc(ch) + '</em></div>' +
            '<svg viewBox="0 0 ' + W + ' ' + H + '" class="trsvg" role="img" aria-label="' + esc(sk.name) + ' by test">' + axis + '<path d="' + line + '" class="trline"/>' + dots + lab + '</svg></div>';
        });
        if (cards) h += '<div class="sgtcard frost trcard" data-cat="' + c.k + '"><h2 class="trcat">' + esc(c.name) + '</h2>' + cards + '</div>';
      });
      return h + '</div>';
    }
    function html() { var s = S(); return s.mode === 'intro' ? introHTML() : s.mode === 'run' ? runHTML() : s.mode === 'result' ? resultHTML() : s.mode === 'trend' ? trendHTML() : hubHTML(); }
    // My Game: a small card that opens the test
    function cardHTML(who) {
      // v183 (Scott): + starts a new test (straight into the intro); below it, the last 4 tests – tap one for its result
      var list = mine(who), open = list.filter(function (t) { return !t.done; })[0], done = list.filter(function (t) { return t.done; }), last = done[0], age = last ? daysSince(last.date) : null;
      var o = '<div class="sgtcard frost sgtmg" id="sgtmg"><div class="sgtcath"><h2>Short game test</h2>' + (last && !open && age >= 30 ? '<span class="due">Due</span>' : '') +
        '<button class="mgadd" data-act="sgtnew" id="sgtnew" aria-label="' + (open ? 'Carry on with the test in progress' : 'Start a new short game test') + '">+</button></div>';
      if (open) o += '<button class="sgtmrow open" data-act="sgtresume" data-v="' + esc(open.id) + '" id="sgtmopen"><b>In progress</b><span>' + T.entered(open) + ' of ' + T.totalOf(open) + ' shots · carry on</span><i aria-hidden="true">›</i></button>';
      if (!done.length) return o + (open ? '' : '<p class="sgtmnone">A one-hour monthly check-up of putting, chipping, bunker and wedges. Tap + to take your first.</p>') + '</div>';
      o += '<p class="sgtmsub">' + (age >= 30 ? 'The next one is due.' : 'Next one due in ' + (30 - age) + ' day' + (30 - age === 1 ? '' : 's') + '.') + '</p>';
      return o + '<div class="sgtmlist" id="sgtmlist">' + done.slice(0, 4).map(function (t) { var A = analysed(t, who);
        return '<button class="sgtmrow" data-act="sgtview" data-v="' + esc(t.id) + '"><b>' + esc(dShort(t.date)) + '</b><span>' + esc(A.I.headline) + '</span><i aria-hidden="true">›</i></button>'; }).join('') + '</div></div>';
    }

    // v168 (Scott): lag putts – all three balls from a spot are hit first, then walked up to and scored together
    function lagGroupHTML(st, a, i) {
      var s = S(), g = Math.floor(i / 3), d = st.shots[g * 3].dist, L = s.lg && s.lg.g === g ? s.lg : (s.lg = { g: g, dir: [0, 1, 2].map(function (b) { var e = a[g * 3 + b]; return e ? e.dir || 'level' : ''; }) });
      var o = '<div class="sgtcard frost sgtentry sgtlag" id="sgtentry"><p class="sgteyebrow">Spot ' + (g + 1) + ' of 3</p><h2 class="sgtwhat" id="sgtwhat">' + d + ' ft · three balls</h2>' +
        '<p class="sgthint">Putt all three, then walk up and score each one: feet away and where it finished.</p>';
      [0, 1, 2].forEach(function (b) { var e = a[g * 3 + b], dir = L.dir[b];
        o += '<div class="sgtlagrow" data-b="' + b + '"><b>Ball ' + (b + 1) + '</b><label class="sgtft sm"><input id="sgtft' + b + '" class="sgtlagft" type="text" inputmode="decimal" autocomplete="off" placeholder="0" value="' + (e && e.ft != null ? esc(String(e.ft)) : '') + '" aria-label="Ball ' + (b + 1) + ' feet away"><span>ft</span></label>' +
          '<div class="sgtlagdir" role="group" aria-label="Ball ' + (b + 1) + ' finished">' + [['short', 'Short'], ['level', 'Level'], ['long', 'Long'], ['holed', 'In']].map(function (x) { var on = dir === x[0] || (x[0] === 'holed' && e && e.ft === 0 && dir !== 'short' && dir !== 'long' && dir !== 'level');
            return '<button class="frostchip' + (on ? ' sel' : '') + '" data-act="sgtlagdir" data-v="' + b + ':' + x[0] + '" aria-pressed="' + on + '">' + x[1] + '</button>'; }).join('') + '</div></div>'; });
      return o + '<div class="sgtbtns"><button class="primary" data-act="sgtlagsave" id="sgtlagsave">Save these three</button></div></div>';
    }
    // ---------- actions ----------
    function goto(test, st, i) { var s = S(); s.mode = 'run'; s.id = test.id; s.st = st; s.i = i; s.setup = null; s.edit = false; s.lad = null; }
    function store(val) {
      var s = S(), test = byId(s.id); if (!test) return;
      var st = T.STATIONS[s.st], e = T.validEntry(st, val); if (!e) { env.toast(st.kind === 'ladder' ? 'Enter the number of balls' : 'Type the feet away first (0 to 200)'); return; }
      test.shots[st.id][s.i] = e; put(test);
      var a = test.shots[st.id], nx = -1; for (var k = s.i + 1; k < a.length; k++) if (!a[k]) { nx = k; break; } if (nx < 0) for (k = 0; k < a.length; k++) if (!a[k]) { nx = k; break; }
      s.lad = null; s.setup = false; if (nx >= 0) s.i = nx; else s.edit = false;
      env.render(); focus();
    }
    function focus() { var f = document.getElementById('sgtft') || document.getElementById('sgtft0'); if (f) { try { f.focus(); f.select(); } catch (e) {} } }
    function feet() { var f = document.getElementById('sgtft'), raw = f ? String(f.value).trim().replace(',', '.') : ''; return raw === '' || !/^\d+(\.\d+)?$/.test(raw) ? null : Number(raw); }
    function act(a, v, b) {
      var s = S(), test = s.id ? byId(s.id) : null;
      if (a === 'sgtintroskip' || a === 'sgtintroback') { introDone(); s.introThen = null; s.mode = 'hub'; if (s.fromMg) { s.fromMg = false; view.screen = 'mygame'; } env.render(); window.scrollTo(0, 0); return; }
      // v183 (Scott): My Game's + (card and menu) – straight into the intro, then the test; a test already under way just carries on
      if (a === 'sgtnew') { view.hmenu = null; view.mgMenu = null; view.screen = 'sgtest'; if (view.mgPlayer) s.who = view.mgPlayer;
        var op = mine(s.who).filter(function (t) { return !t.done; })[0]; if (op) { act('sgtresume', op.id); return; }
        s.fromMg = true; s.introThen = 'start'; s.mode = 'intro'; env.render(); window.scrollTo(0, 0); return; }
      if (a === 'sgtintronext') { var sl = document.getElementById('sgtislides'), k0 = introAt();
        if (k0 >= INTRO_N - 1 || !sl) { introDone(); if (s.introThen === 'start') { s.introThen = null; startTest(s); return; } s.mode = 'hub'; env.render(); window.scrollTo(0, 0); return; }
        try { sl.scrollTo({ left: (k0 + 1) * sl.clientWidth, behavior: 'smooth' }); } catch (e) { sl.scrollLeft = (k0 + 1) * sl.clientWidth; } setTimeout(introSync, 400); return; }
      if (a === 'sgtintro') { s.mode = 'intro'; s.introThen = null; env.render(); window.scrollTo(0, 0); return; }
      if (a === 'sgtopen') { view.hmenu = null; view.screen = 'sgtest'; s.mode = 'hub'; s.introThen = null; /* v174: the intro now runs when a test is started (sgtstart), not on opening */ if (view.mgPlayer) s.who = view.mgPlayer; env.render(); window.scrollTo(0, 0); return; }
      if (a === 'sgthub') { s.menu = false; s.mode = 'hub'; s.open = null; env.render(); window.scrollTo(0, 0); return; }
      if (a === 'sgtplayer') { s.who = v; env.render(); return; }
      if (a === 'sgtcond') { var p = v.split(':'); s.cond = s.cond || {}; s.cond[p[0]] = s.cond[p[0]] === p[1] ? '' : p[1]; env.render(); return; }
      // v174 (Scott): a month is a long time between tests – starting one always runs the intro first as a refresher (no skip; Back returns to Tests)
      if (a === 'sgtstart') { s.introThen = 'start'; s.mode = 'intro'; env.render(); window.scrollTo(0, 0); return; }
      if (a === 'sgtresume') { var t2 = byId(v); if (!t2) return; view.screen = 'sgtest'; view.mgMenu = null; if (t2.done) { t2.done = false; put(t2); } var nx = T.nextOpen(t2) || { st: 0, i: 0 }; goto(t2, nx.st, nx.i); env.render(); window.scrollTo(0, 0); focus(); return; }
      if (a === 'sgtmenu') { s.menu = !s.menu; env.render(); return; } // v193
      if (a === 'sgtpdf') { s.menu = false; if (env.makePdf) env.makePdf(s.who, s.id); return; }
      if (a === 'sgttrend') { s.menu = false; s.mode = 'trend'; env.render(); window.scrollTo(0, 0); return; }
      if (a === 'sgtlast') { view.hmenu = null; view.mgMenu = null; view.screen = 'sgtest'; if (view.mgPlayer) s.who = view.mgPlayer; s.menu = false; // My Game ☰ › Tests: your last test
        var last = mine(s.who).filter(function (t) { return t.done; })[0]; if (last) { s.mode = 'result'; s.id = last.id; } else s.mode = 'hub'; env.render(); window.scrollTo(0, 0); return; }
      if (a === 'sgtview') { s.menu = false; if (view.screen !== 'sgtest') { view.screen = 'sgtest'; if (view.mgPlayer) s.who = view.mgPlayer; } s.mode = 'result'; s.id = v; s.open = null; env.render(); window.scrollTo(0, 0); return; }
      if (a === 'sgtdel') { var t3 = byId(v); if (!t3 || !window.confirm(t3.done ? 'Delete the test of ' + dLong(t3.date) + '? This cannot be undone.' : 'Discard this unfinished test?')) return; env.saveTests(env.tests().filter(function (x) { return x.id !== v; })); env.toast('Test deleted'); s.mode = 'hub'; env.render(); return; }
      if (a === 'sgtrow') { s.open = s.open === v ? null : v; env.render(); return; }
      if (!test) return;
      var st = T.STATIONS[s.st];
      if (a === 'sgtstation') { goto(test, +v, Math.max(0, test.shots[T.STATIONS[+v].id].indexOf(null))); env.render(); window.scrollTo(0, 0); focus(); return; }
      if (a === 'sgtshot') { s.i = +v; s.edit = true; s.lad = null; env.render(); focus(); return; }
      if (a === 'sgtsetup') { var shown = s.setup != null ? s.setup : !test.shots[st.id].some(Boolean); s.setup = !shown; env.render(); return; }
      if (a === 'sgtnext' || a === 'sgtskip') { var from = s.st, nx2 = null; for (var k = from + 1; k < T.STATIONS.length; k++) if (!T.stationDone(test, T.STATIONS[k])) { nx2 = k; break; }
        if (nx2 == null) { var o = T.nextOpen(test); nx2 = o && o.st !== from ? o.st : null; }
        if (nx2 == null) { finish(test); return; } goto(test, nx2, Math.max(0, test.shots[T.STATIONS[nx2].id].indexOf(null))); env.render(); window.scrollTo(0, 0); focus(); return; }
      if (a === 'sgtfinish') { if (T.entered(test) < T.totalOf(test) && !window.confirm('Finish with ' + T.entered(test) + ' of ' + T.totalOf(test) + ' shots entered? Skills with no shots are left out. You can add the rest later.')) return; finish(test); return; }
      if (a === 'sgtmade') { store({ made: true }); return; }
      if (a === 'sgtmiss') { store({ made: false, miss: v }); return; }
      if (a === 'sgtlad') { var cur = test.shots[st.id][s.i]; s.lad = Math.max(0, Math.min(st.kind === 'updown' ? T.UD_BALLS : 40, (s.lad != null ? s.lad : cur ? cur.n : 0) + (+v))); var el = document.getElementById('sgtladn'); if (el) el.textContent = s.lad; return; }
      if (a === 'sgtlagdir') { var q = v.split(':'), bi = +q[0]; s.lg = s.lg || { g: Math.floor(s.i / 3), dir: ['', '', ''] }; s.lg.dir[bi] = q[1];
        if (q[1] === 'holed') { var fi = document.getElementById('sgtft' + bi); if (fi) fi.value = '0'; }
        [].forEach.call(document.querySelectorAll('[data-act="sgtlagdir"]'), function (x) { var p2 = x.getAttribute('data-v').split(':'); if (+p2[0] === bi) { var on = p2[1] === q[1]; x.classList.toggle('sel', on); x.setAttribute('aria-pressed', on); } }); return; }
      if (a === 'sgtlagsave') { var g = Math.floor(s.i / 3), vals = [];
        for (var bb = 0; bb < 3; bb++) { var f = document.getElementById('sgtft' + bb), raw = f ? String(f.value).trim().replace(',', '.') : '', dd = s.lg && s.lg.g === g ? s.lg.dir[bb] : '';
          if (dd === 'holed') { vals.push({ ft: 0, dir: '' }); continue; }
          if (raw === '' || !/^\d+(\.\d+)?$/.test(raw) || Number(raw) > 200) { env.toast('Ball ' + (bb + 1) + ': type the feet away (or tap In)'); if (f) f.focus(); return; }
          if (Number(raw) === 0) { vals.push({ ft: 0, dir: '' }); continue; }
          if (!dd) { env.toast('Ball ' + (bb + 1) + ': tap Short, Level or Long'); return; }
          vals.push({ ft: Number(raw), dir: dd === 'level' ? '' : dd }); }
        vals.forEach(function (val, k2) { test.shots[st.id][g * 3 + k2] = T.validEntry(st, val); }); put(test);
        var arr = test.shots[st.id], nx3 = -1; for (var k3 = 0; k3 < arr.length; k3++) if (!arr[k3]) { nx3 = k3; break; }
        s.lg = null; s.setup = false; if (nx3 >= 0) s.i = nx3; else s.edit = false; env.render(); var f0 = document.getElementById('sgtft0'); if (f0) try { f0.focus(); } catch (e) {} return; }
      if (a === 'sgtladsave') { var c2 = test.shots[st.id][s.i]; store({ n: s.lad != null ? s.lad : c2 ? c2.n : 0 }); return; }
      if (a === 'sgtsave') {
        if (v === 'holed') { store(st.kind === 'lag' || st.kind === 'wedge' ? { ft: 0, dir: '' } : { ft: 0 }); return; }
        if (v === 'sand' || v === 'over') { store({ res: v }); return; }
        if (v === 'fshort') { store({ res: 'short' }); return; }
        var ft = feet(); if (ft == null) { env.toast('Type the feet away first'); focus(); return; }
        if (st.kind === 'lag') store({ ft: ft, dir: v === 'level' ? '' : v }); else if (st.kind === 'wedge') store({ ft: ft, dir: v.replace(/^dir:/, '') }); else store({ ft: ft });
      }
    }
    function finish(test) { var s = S(); test.done = true; put(test); s.mode = 'result'; s.id = test.id; s.open = null; env.toast('Test saved'); env.render(); window.scrollTo(0, 0); }
    // Enter in the feet box = Save on the stations that have a plain Save
    function key(ev) { if (ev.key !== 'Enter' || !ev.target || ev.target.id !== 'sgtft') return; var s = S(), st = T.STATIONS[s.st]; if (st && (st.kind === 'leave' || st.kind === 'bunker')) { ev.preventDefault(); act('sgtsave', ''); } }
    function trendTests(who) { return mine(who).filter(function (t) { return t.done; }).map(function (t) { var A = analysed(t, who), p = {}; T.CATS.forEach(function (c) { var x = A.cur.cats[c.k]; p[c.k] = x && x.sg != null ? x.sg : null; }); return { date: t.date, perShot: p }; }); } // v194
    // v203: the last finished test for the practice plan – strokes per shot by area and the test's own notes
    function planTest(who) { var t = mine(who).filter(function (x) { return x.done; })[0]; if (!t) return null; var A = analysed(t, who), p = {};
      T.CATS.forEach(function (c) { var x = A.cur.cats[c.k]; p[c.k] = x && x.sg != null ? x.sg : null; }); return { date: t.date, perShot: p, coach: A.I.coach.map(function (c) { return { k: c.k, text: c.text, ask: c.ask }; }) }; }
    return { html: html, act: act, cardHTML: cardHTML, key: key, reportData: reportData, testFlags: testFlags, trendTests: trendTests, planTest: planTest };
  };
})(this);
