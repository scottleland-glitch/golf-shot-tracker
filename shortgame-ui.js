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
    function blFor(test, who) { return SG.baseline(test.baseline || env.baselineOf(who)).id; }
    // a finished test with the ones before it: { test, cur, cmp, I }
    function analysed(test, who) {
      var bl = blFor(test, who), prev = mine(who).filter(function (t) { return t.done && t.id !== test.id && String(t.date) < String(test.date); });
      var cur = T.score(test, SG, bl), ps = prev.map(function (t) { return T.score(t, SG, bl); }), cmp = T.compare(cur, ps);
      return { test: test, cur: cur, cmp: cmp, I: T.interpret(cur, cmp), prev: prev, bl: bl, blName: SG.baseline(bl).name };
    }
    function shortVal(sk, s) { return s.value == null ? '' : sk.unit === 'ft' ? r1(s.value) + ' ft' : sk.unit === 'balls' ? r1(s.value) + ' balls' : s.value + '/' + (s.of || sk.of); }
    function toneOf(c) { return c.trend === 'slipping' || c.status === 'worse' ? 'bad' : c.trend === 'improving' || c.status === 'better' ? 'good' : ''; }
    function overallSpokes(A) { return T.CATS.map(function (c) { var x = A.cur.cats[c.k]; return { name: c.name, index: x.index, avg: A.cmp.cats[c.k].avgIndex, sub: x.sg == null ? 'not tested' : (x.sg >= 0 ? '+' : '') + x.sg.toFixed(2) + ' a shot' }; }); }
    function catSpokes(A, cat) { return T.SKILLS.filter(function (sk) { return sk.cat === cat; }).map(function (sk) { var s = A.cur.skills[sk.k], c = A.cmp.skills[sk.k];
      return { name: sk.name.replace('Flop over a bunker', 'Flop').replace('Chips from rough', 'Rough').replace(' bunker', '').replace('Kept on the green', 'On green').replace(' proximity', '').replace('Breaking putts', 'Breaking').replace('Speed ladder', 'Speed'),
        index: T.indexOf(A.cur, A.cmp, sk.k), avg: A.cmp.avgIndex[sk.k], sub: shortVal(sk, s), tone: toneOf(c) }; }); }
    function top(left, title, sub, right) { return '<div class="topbar frost">' + left + '<div class="title"><b>' + esc(title) + '</b><span>' + esc(sub || '') + '</span></div>' + (right || '<span class="sgtsp"></span>') + '</div>'; }

    // ---------- hub ----------
    function hubHTML() {
      var s = S(), who = s.who, names = env.players(), list = mine(who), open = list.filter(function (t) { return !t.done; })[0], done = list.filter(function (t) { return t.done; });
      var h = '<div class="frostpage theme-sky sgtpage" id="sgtest">' + top('<button class="txt frostbtn" data-act="mygame" id="sgtback">‹ My Game</button>', 'Short game test', who);
      if (names.length > 1) h += '<div class="hchips" id="sgtchips" role="group" aria-label="Player">' + names.map(function (nm) { var on = nm === who; return '<button class="frostchip' + (on ? ' sel' : '') + '" data-act="sgtplayer" data-v="' + esc(nm) + '" aria-pressed="' + on + '">' + esc(nm) + '</button>'; }).join('') + '</div>';
      h += '<div class="sgtcard frost" id="sgtstartcard">';
      if (open) { var n = T.entered(open), nx = T.nextOpen(open);
        h += '<h2>Test in progress</h2><p>Started ' + esc(dShort(open.date)) + ' · ' + n + ' of ' + T.TOTAL + ' shots entered' + (nx ? ' · next: ' + esc(T.STATIONS[nx.st].name.toLowerCase()) : '') + '.</p>' +
          '<button class="primary big" data-act="sgtresume" data-v="' + esc(open.id) + '" id="sgtresume">Carry on</button><button class="txt sgtlink" data-act="sgtdel" data-v="' + esc(open.id) + '">Discard this test</button>';
      } else {
        var last = done[0], age = last ? daysSince(last.date) : null;
        h += '<h2>' + (last ? (age >= 30 ? 'Your monthly test is due' : 'Next test due in ' + (30 - age) + ' day' + (30 - age === 1 ? '' : 's')) : 'A one-hour check-up, once a month') + '</h2>' +
          '<p>' + T.TOTAL + ' shots over ' + T.STATIONS.length + ' stations: putting, chipping, bunker and wedges. The same test every time, so a skill that starts to slip shows up early.</p>' +
          '<p class="sgtneed">You need: a putting green with a sloped hole, a chipping green with a bunker, room for 100 yd wedges, about a dozen tees.</p>' +
          '<div class="sgtcond"><span>Greens today</span>' + ['slow', 'medium', 'fast'].map(function (g) { var on = (s.cond || {}).green === g; return '<button class="frostchip' + (on ? ' sel' : '') + '" data-act="sgtcond" data-v="green:' + g + '" aria-pressed="' + on + '">' + g + '</button>'; }).join('') + '</div>' +
          '<div class="sgtcond"><span>Wind</span>' + ['calm', 'breezy', 'windy'].map(function (g) { var on = (s.cond || {}).wind === g; return '<button class="frostchip' + (on ? ' sel' : '') + '" data-act="sgtcond" data-v="wind:' + g + '" aria-pressed="' + on + '">' + g + '</button>'; }).join('') + '</div>' +
          '<button class="primary big" data-act="sgtstart" id="sgtstart">Start the test</button>';
      }
      h += '</div>';
      if (done.length) { var A = analysed(done[0], who);
        h += '<div class="sgtcard frost" id="sgtlatest"><p class="sgteyebrow">Latest test · ' + esc(dLong(done[0].date)) + '</p><h2>' + esc(A.I.headline) + '</h2><p>' + esc(A.I.sub) + '</p>' +
          T.spiderSVG(overallSpokes(A), { aria: 'Short game shape, latest test' }) + T.spiderKey(A.cmp.cats.putting.avgIndex != null, A.blName) +
          '<button class="frostbtn big" data-act="sgtview" data-v="' + esc(done[0].id) + '" id="sgtseelatest">See the full result</button></div>';
        h += '<div class="sgtcard frost" id="sgthist"><p class="sgteyebrow">All tests</p>' + done.map(function (t) { var c = [t.cond.green ? t.cond.green + ' greens' : '', t.cond.wind].filter(Boolean).join(', '), n = T.entered(t);
          return '<div class="sgthrow"><button class="sgthopen" data-act="sgtview" data-v="' + esc(t.id) + '"><b>' + esc(dLong(t.date)) + '</b><span>' + esc((n < T.TOTAL ? n + ' of ' + T.TOTAL + ' shots' : 'Complete') + (c ? ' · ' + c : '')) + '</span></button><button class="sgtx" data-act="sgtdel" data-v="' + esc(t.id) + '" aria-label="Delete the test of ' + esc(dLong(t.date)) + '">×</button></div>'; }).join('') + '</div>';
      }
      return h + '</div>';
    }

    // ---------- the guided test ----------
    function entryText(st, e) {
      if (!e) return '';
      if (st.kind === 'ladder') return e.n + ' ball' + (e.n === 1 ? '' : 's');
      if (st.kind === 'compass') return e.made ? 'made' : 'missed' + (e.miss ? ' ' + e.miss : '');
      if (e.res) return e.res === 'sand' ? 'in sand' : 'over';
      return (e.ft === 0 ? 'holed' : r1(e.ft).replace(/\.0$/, '') + ' ft') + (e.dir ? ' ' + (st.kind === 'lag' ? (e.dir === 'long' ? 'past' : 'short') : DIRN[e.dir]) : '');
    }
    function stationSummary(test, st, who) {
      var sc = T.score(test, SG, blFor(test, who)), k = st.id === 'ladder' ? 'speed' : st.id, bits = [];
      if (st.id === 'compass') { bits.push('Straight putts ' + sc.skills.short.value + ' of ' + sc.skills.short.of); bits.push('breaking putts ' + sc.skills.brk.value + ' of ' + sc.skills.brk.of); }
      else if (st.id === 'ladder') bits.push('Average ' + r1(sc.skills.speed.value) + ' balls, best ' + sc.skills.speed.best);
      else { var s = sc.skills[k]; bits.push(s.value == null ? 'No ball finished on the green' : 'Average ' + r1(s.value) + ' ft left'); if (s.bench != null) bits.push(sc.baseline ? SG.baseline(sc.baseline).name + ' level is about ' + Math.round(s.bench) + ' ft' : '');
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
      if (showSetup) h += '<ol>' + st.setup.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ol>' + (st.kind === 'compass' ? T.compassSVG(done ? null : spec) : '');
      h += '</div>';
      if (done && !s.edit) {
        h += '<div class="sgtcard frost sgtdone" id="sgtdonecard"><p class="sgteyebrow">Station done</p><h2>' + esc(stationSummary(test, st, s.who)) + '</h2>' +
          (T.nextOpen(test) ? '<button class="primary big" data-act="sgtnext" id="sgtnext">Next station ›</button>' : '<button class="primary big" data-act="sgtfinish" id="sgtfinish">Finish and see the result</button>') + '</div>';
      } else {
        h += '<div class="sgtcard frost sgtentry" id="sgtentry"><p class="sgteyebrow">' + esc((st.kind === 'ladder' ? '' : st.kind === 'lag' || st.kind === 'compass' ? 'Putt ' : 'Shot ') + (st.kind === 'ladder' ? spec.label : (i + 1) + ' of ' + st.shots.length)) + '</p>' +
          '<h2 class="sgtwhat" id="sgtwhat">' + esc(st.kind === 'ladder' ? 'How many balls?' : st.kind === 'leave' || st.kind === 'bunker' ? st.name + ' · ' + st.dist + ' yd' : spec.label) + '</h2>';
        var cur = a[i], ftBox = '<label class="sgtft"><input id="sgtft" type="text" inputmode="decimal" autocomplete="off" placeholder="0" value="' + (cur && cur.ft != null ? esc(String(cur.ft)) : '') + '" aria-label="Feet left"><span>ft left</span></label>';
        var btn = function (v, label, cls) { return '<button class="' + (cls || 'frostbtn') + '" data-act="sgtsave" data-v="' + v + '">' + esc(label) + '</button>'; };
        if (st.kind === 'lag') h += ftBox + '<p class="sgthint">Type the feet left, then tap where it finished.</p><div class="sgtbtns g3">' + btn('short', 'Short') + btn('level', 'Level') + btn('long', 'Past') + '</div><div class="sgtbtns">' + btn('holed', 'Holed it') + '</div>';
        else if (st.kind === 'leave') h += ftBox + '<div class="sgtbtns">' + btn('', 'Save', 'primary') + btn('holed', 'Holed it') + '</div>';
        else if (st.kind === 'bunker') h += ftBox + '<div class="sgtbtns">' + btn('', 'Save', 'primary') + btn('holed', 'Holed it') + '</div><div class="sgtbtns">' + btn('sand', 'Still in sand') + btn('over', 'Over the green') + '</div>';
        else if (st.kind === 'wedge') h += ftBox + '<p class="sgthint">Type the feet left, then tap where it finished from the hole.</p><div class="sgtbtns g3 sgtdir">' + DIRS.map(function (d) { return btn('dir:' + d[0], d[1]); }).join('') + '</div><div class="sgtbtns">' + btn('holed', 'Holed it') + '</div>';
        else if (st.kind === 'compass') { var straight = T.LINES.filter(function (l) { return l.k === spec.line; })[0].straight;
          h += '<div class="sgtbtns"><button class="primary" data-act="sgtmade" id="sgtmade">Made it</button></div><p class="sgthint">Missed? Tap where.</p><div class="sgtbtns ' + (straight ? 'g2' : 'g2') + '">' +
            (straight ? ['short', 'long', 'left', 'right'] : ['high', 'low']).map(function (m) { return '<button class="frostbtn" data-act="sgtmiss" data-v="' + m + '">' + (m === 'high' ? 'High side' : m === 'low' ? 'Low side' : m === 'long' ? 'Past' : m.charAt(0).toUpperCase() + m.slice(1)) + '</button>'; }).join('') + '</div>'; }
        else if (st.kind === 'ladder') { var n = s.lad != null ? s.lad : cur ? cur.n : 0;
          h += '<div class="sgtstep"><button class="frostbtn" data-act="sgtlad" data-v="-1" aria-label="One fewer">−</button><b id="sgtladn">' + n + '</b><button class="frostbtn" data-act="sgtlad" data-v="1" aria-label="One more">+</button></div><div class="sgtbtns"><button class="primary" data-act="sgtladsave" id="sgtladsave">Save attempt</button></div>'; }
        h += '</div>';
      }
      h += '<div class="sgtchipsrow" id="sgtshots">' + st.shots.map(function (x, k) { var e = a[k];
        return '<button class="sgtshot' + (k === i && !(done && !s.edit) ? ' cur' : '') + (e ? ' in' : '') + '" data-act="sgtshot" data-v="' + k + '"><span>' + esc(st.kind === 'ladder' ? 'Try ' + (k + 1) : st.kind === 'leave' || st.kind === 'bunker' ? '#' + (k + 1) : x.label.replace(' · ', ' ').replace('breaks ', '').replace('hill', '')) + '</span><b>' + esc(e ? entryText(st, e) : '–') + '</b></button>'; }).join('') + '</div>';
      h += '<div class="sgtfoot">' + (!done && !last ? '<button class="txt sgtlink" data-act="sgtskip">Skip this station</button>' : '') + (T.entered(test) ? '<button class="txt sgtlink" data-act="sgtfinish">Finish the test now</button>' : '') + '</div>';
      return h + '</div>';
    }

    // ---------- the result ----------
    function rowHTML(A, sk, open) {
      var s = A.cur.skills[sk.k], c = A.cmp.skills[sk.k], dates = A.prev.slice(0, 11).reverse().filter(function (t, n) { return true; }).map(function (t) { return dShort(t.date); });
      if (s.value == null) return '<div class="sgtrow none"><span class="sgtrn">' + esc(sk.name) + '</span><span class="sgtrv"><small>not tested</small></span></div>';
      // dates line up with the series: only tests that have this skill
      var withSkill = A.prev.filter(function (t) { return T.score(t, SG, A.bl).skills[sk.k].value != null; }).slice(0, 11).reverse().map(function (t) { return dShort(t.date); }).concat([dShort(A.test.date)]);
      var sub = c.usual != null ? (c.tests > 1 ? 'usually ' : 'last time ') + T.fmtNum(sk, c.usual) : s.bench != null ? A.blName + ' ' + (sk.unit === 'ft' ? Math.round(s.bench) + ' ft' : r1(s.bench)) : sk.k === 'speed' ? 'best ' + s.best : '';
      var tag = c.trend === 'slipping' ? 'Slipping' : c.trend === 'improving' ? 'Improving' : c.status === 'worse' ? 'Down' : c.status === 'better' ? 'Up' : '';
      var o = '<button class="sgtrow ' + toneOf(c) + (open ? ' open' : '') + '" data-act="sgtrow" data-v="' + sk.k + '" aria-expanded="' + !!open + '"><span class="sgtrn">' + esc(sk.name) + (tag ? '<em>' + tag + '</em>' : '') + '</span>' +
        T.sparkSVG(c.series, sk, { usual: c.usual, thr: c.thr, status: toneOf(c) === 'bad' ? 'worse' : toneOf(c) === 'good' ? 'better' : 'same' }) +
        '<span class="sgtrv"><b>' + esc(T.fmtVal(sk, s)) + '</b><small>' + esc(sub) + '</small></span></button>';
      if (open) o += '<div class="sgtbig">' + T.sparkSVG(c.series, sk, { big: true, usual: c.usual, thr: c.thr, status: toneOf(c) === 'bad' ? 'worse' : toneOf(c) === 'good' ? 'better' : 'same', dates: withSkill }) +
        '<p>' + esc((sk.better === 'low' ? 'Feet left on average – higher on the graph is closer to the hole. ' : sk.unit === 'balls' ? 'Balls per attempt, average of three. ' : 'Putts made. ') + (c.usual != null ? 'The band is your usual range.' : 'A band for your usual range appears after the next test.') + (s.bench != null ? ' ' + A.blName + ' level: ' + (sk.unit === 'ft' ? 'about ' + Math.round(s.bench) + ' ft.' : 'about ' + r1(s.bench) + ' of ' + s.of + '.') : '')) + '</p></div>';
      return o;
    }
    function wedgeHTML(A) {
      var W = A.cur.extra.wedge, max = Math.max.apply(null, W.byDist.map(function (d) { return Math.max(d.ft || 0, d.bench); }).concat([10]));
      var o = '<div class="sgtwbars" id="sgtwbars">' + W.byDist.map(function (d) { return '<div class="sgtwb"><span>' + d.dist + ' yd</span><i><u style="width:' + (d.ft == null ? 0 : Math.round(100 * d.ft / max)) + '%"></u><s style="left:' + Math.round(100 * d.bench / max) + '%"></s></i><b>' + (d.ft == null ? '–' : r1(d.ft) + ' ft') + '</b></div>'; }).join('') +
        '<p class="sgtnote">Bar = feet left on average (shorter is better). The mark is ' + esc(A.blName) + ' level.</p></div>';
      var cell = function (v, lab) { return '<span class="' + (v ? 'on' : '') + '"><b>' + v + '</b>' + lab + '</span>'; };
      if (W.n) o += '<div class="sgtmiss" id="sgtmiss"><p class="sgteyebrow">Where the wedges finished</p><div class="sgtmgrid"><span></span>' + cell(W.long, 'long') + '<span></span>' + cell(W.left, 'left') + '<span class="pin">hole</span>' + cell(W.right, 'right') + '<span></span>' + cell(W.short, 'short') + '<span></span></div></div>';
      return o;
    }
    function resultHTML() {
      var s = S(), test = byId(s.id); if (!test) { s.mode = 'hub'; return hubHTML(); }
      var A = analysed(test, s.who), I = A.I, n = T.entered(test), cond = [test.cond.green ? test.cond.green + ' greens' : '', test.cond.wind].filter(Boolean).join(', ');
      var h = '<div class="frostpage theme-sky sgtpage sgtres" id="sgtresult">' + top('<button class="txt frostbtn" data-act="sgthub" id="sgthubbtn">‹ Tests</button>', 'Test result', dLong(test.date));
      h += '<div class="sgtcard frost" id="sgtverdict"><h2 id="sgthead">' + esc(I.headline) + '</h2><p id="sgtsub">' + esc(I.sub) + '</p>' +
        '<p class="sgtnote">' + esc(s.who ? s.who + ' · ' : '') + esc('compared with ' + A.blName) + (cond ? ' · ' + esc(cond) : '') + (n < T.TOTAL ? ' · ' + n + ' of ' + T.TOTAL + ' shots entered' : '') + '</p>' +
        T.spiderSVG(overallSpokes(A), { aria: 'Short game shape' }) + T.spiderKey(A.cmp.cats.putting.avgIndex != null, A.blName) +
        '<p class="sgtnote">Each spoke is strokes gained per shot against ' + esc(A.blName) + ': on the line is level, inside it is losing strokes.' + (A.cmp.tests < 2 ? ' Your average appears as a dashed shape from your third test.' : '') + '</p></div>';
      if (I.plan.length) h += '<div class="sgtcard sgtplan" id="sgtplan"><p class="sgteyebrow">Practice this month</p>' + I.plan.map(function (p, k) { return '<div><b>' + (k + 1) + '. ' + esc(p.title) + '</b><em>' + esc(p.why) + '</em><span>' + esc(p.drill) + '</span></div>'; }).join('') + '</div>';
      if (I.coach.length) h += '<div class="sgtcard frost sgtcoach" id="sgtcoach"><p class="sgteyebrow">Ask your coach</p>' + I.coach.map(function (c) { return '<div><b>' + esc(c.text) + '</b><span>' + esc(c.ask) + '</span></div>'; }).join('') + '</div>';
      T.CATS.forEach(function (c) {
        var x = A.cur.cats[c.k], skills = T.SKILLS.filter(function (sk) { return sk.cat === c.k; }), any = skills.some(function (sk) { return A.cur.skills[sk.k].value != null; });
        h += '<div class="sgtcard frost sgtcat" id="sgtcat-' + c.k + '"><div class="sgtcath"><h2>' + esc(c.name) + '</h2><span>' + (x.sg == null ? '' : (x.sg >= 0 ? '+' : '') + x.sg.toFixed(2) + ' strokes a shot') + '</span></div>';
        if (!any) h += '<p class="sgtnote">Not tested this time.</p>';
        else if (c.k === 'wedge') h += wedgeHTML(A);
        else h += T.spiderSVG(catSpokes(A, c.k), { R: 70, aria: c.name + ' shape' });
        if (c.k === 'putting' && any) { var X = A.cur.extra; h += '<p class="sgtnote">' + esc(X.lines.filter(function (l) { return l.n; }).map(function (l) { return l.name + ' ' + l.made + '/' + l.n; }).join(' · ')) + '<br>' + esc(X.byDist.filter(function (d) { return d.n; }).map(function (d) { return d.dist + ' ft ' + d.made + '/' + d.n; }).join(' · ')) + '</p>'; }
        if (c.k === 'bunker' && any) { var B = A.cur.extra.bunker; h += '<p class="sgtnote' + (B.over >= 2 ? ' bad' : '') + '" id="sgtover">' + B.over + ' of ' + B.n + ' flew the green · ' + B.sand + ' stayed in the sand</p>'; }
        h += '<div class="sgtrows">' + skills.map(function (sk) { return rowHTML(A, sk, s.open === sk.k); }).join('') + '</div></div>';
      });
      h += '<p class="sgtnote sgtfootnote">Tap a skill to see every test. A skill is marked Down when it is worse than your usual by more than its normal wobble, and Slipping when it has dropped two tests in a row.</p>';
      if (!test.done || n < T.TOTAL) h += '<button class="frostbtn big" data-act="sgtresume" data-v="' + esc(test.id) + '">Add the missing shots</button>';
      return h + '</div>';
    }

    function html() { var s = S(); return s.mode === 'run' ? runHTML() : s.mode === 'result' ? resultHTML() : hubHTML(); }
    // My Game: a small card that opens the test
    function cardHTML(who) {
      var list = mine(who), open = list.filter(function (t) { return !t.done; })[0], last = list.filter(function (t) { return t.done; })[0], age = last ? daysSince(last.date) : null;
      var line = open ? 'Test in progress: ' + T.entered(open) + ' of ' + T.TOTAL + ' shots.' : last ? 'Last test ' + dShort(last.date) + '. ' + (age >= 30 ? 'The next one is due.' : 'Next one due in ' + (30 - age) + ' day' + (30 - age === 1 ? '' : 's') + '.') : 'A one-hour monthly check-up of putting, chipping, bunker and wedges.';
      var o = '<div class="sgtcard frost sgtmg" id="sgtmg"><div class="sgtcath"><h2>Short game test</h2>' + (last && !open && age >= 30 ? '<span class="due">Due</span>' : '') + '</div>';
      if (last) { var A = analysed(last, who); o += '<p><b>' + esc(A.I.headline) + '</b></p>'; }
      return o + '<p>' + esc(line) + '</p><button class="frostbtn big" data-act="sgtopen" id="sgtopen">' + (open ? 'Carry on with the test' : last ? 'Open' : 'Take the test') + '</button></div>';
    }

    // ---------- actions ----------
    function goto(test, st, i) { var s = S(); s.mode = 'run'; s.id = test.id; s.st = st; s.i = i; s.setup = null; s.edit = false; s.lad = null; }
    function store(val) {
      var s = S(), test = byId(s.id); if (!test) return;
      var st = T.STATIONS[s.st], e = T.validEntry(st, val); if (!e) { env.toast(st.kind === 'ladder' ? 'Enter the number of balls' : 'Type the feet left first (0 to 200)'); return; }
      test.shots[st.id][s.i] = e; put(test);
      var a = test.shots[st.id], nx = -1; for (var k = s.i + 1; k < a.length; k++) if (!a[k]) { nx = k; break; } if (nx < 0) for (k = 0; k < a.length; k++) if (!a[k]) { nx = k; break; }
      s.lad = null; s.setup = false; if (nx >= 0) s.i = nx; else s.edit = false;
      env.render(); focus();
    }
    function focus() { var f = document.getElementById('sgtft'); if (f) { try { f.focus(); f.select(); } catch (e) {} } }
    function feet() { var f = document.getElementById('sgtft'), raw = f ? String(f.value).trim().replace(',', '.') : ''; return raw === '' || !/^\d+(\.\d+)?$/.test(raw) ? null : Number(raw); }
    function act(a, v, b) {
      var s = S(), test = s.id ? byId(s.id) : null;
      if (a === 'sgtopen') { view.hmenu = null; view.screen = 'sgtest'; s.mode = 'hub'; if (view.mgPlayer) s.who = view.mgPlayer; env.render(); window.scrollTo(0, 0); return; }
      if (a === 'sgthub') { s.mode = 'hub'; s.open = null; env.render(); window.scrollTo(0, 0); return; }
      if (a === 'sgtplayer') { s.who = v; env.render(); return; }
      if (a === 'sgtcond') { var p = v.split(':'); s.cond = s.cond || {}; s.cond[p[0]] = s.cond[p[0]] === p[1] ? '' : p[1]; env.render(); return; }
      if (a === 'sgtstart') { var t = T.blank('sgt' + Date.now().toString(36), new Date().toISOString(), s.who, env.baselineOf(s.who)); t.cond = { green: (s.cond || {}).green || '', wind: (s.cond || {}).wind || '' }; put(t); goto(t, 0, 0); env.render(); window.scrollTo(0, 0); return; }
      if (a === 'sgtresume') { var t2 = byId(v); if (!t2) return; if (t2.done) { t2.done = false; put(t2); } var nx = T.nextOpen(t2) || { st: 0, i: 0 }; goto(t2, nx.st, nx.i); env.render(); window.scrollTo(0, 0); focus(); return; }
      if (a === 'sgtview') { s.mode = 'result'; s.id = v; s.open = null; env.render(); window.scrollTo(0, 0); return; }
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
      if (a === 'sgtfinish') { if (T.entered(test) < T.TOTAL && !window.confirm('Finish with ' + T.entered(test) + ' of ' + T.TOTAL + ' shots entered? Skills with no shots are left out. You can add the rest later.')) return; finish(test); return; }
      if (a === 'sgtmade') { store({ made: true }); return; }
      if (a === 'sgtmiss') { store({ made: false, miss: v }); return; }
      if (a === 'sgtlad') { var cur = test.shots[st.id][s.i]; s.lad = Math.max(0, Math.min(40, (s.lad != null ? s.lad : cur ? cur.n : 0) + (+v))); var el = document.getElementById('sgtladn'); if (el) el.textContent = s.lad; return; }
      if (a === 'sgtladsave') { var c2 = test.shots[st.id][s.i]; store({ n: s.lad != null ? s.lad : c2 ? c2.n : 0 }); return; }
      if (a === 'sgtsave') {
        if (v === 'holed') { store(st.kind === 'lag' || st.kind === 'wedge' ? { ft: 0, dir: '' } : { ft: 0 }); return; }
        if (v === 'sand' || v === 'over') { store({ res: v }); return; }
        var ft = feet(); if (ft == null) { env.toast('Type the feet left first'); focus(); return; }
        if (st.kind === 'lag') store({ ft: ft, dir: v === 'level' ? '' : v }); else if (st.kind === 'wedge') store({ ft: ft, dir: v.replace(/^dir:/, '') }); else store({ ft: ft });
      }
    }
    function finish(test) { var s = S(); test.done = true; put(test); s.mode = 'result'; s.id = test.id; s.open = null; env.toast('Test saved'); env.render(); window.scrollTo(0, 0); }
    // Enter in the feet box = Save on the stations that have a plain Save
    function key(ev) { if (ev.key !== 'Enter' || !ev.target || ev.target.id !== 'sgtft') return; var s = S(), st = T.STATIONS[s.st]; if (st && (st.kind === 'leave' || st.kind === 'bunker')) { ev.preventDefault(); act('sgtsave', ''); } }
    return { html: html, act: act, cardHTML: cardHTML, key: key };
  };
})(this);
