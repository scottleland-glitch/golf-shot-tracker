// v245 (Scott) Sim dispersion: the screens and the animation (the maths is in dispersion.js).
// DISPUI.ui(env) -> { html(), act(act, v, button), mount() }
// env (from app.js): SG, view, sessions(), saveSessions(list), players(), me(), same(a, b), baselineOf(who), render(), toast(msg), tourFt(who, yd)
// v246: optional env.readOnly() (a coach looking at an athlete: no import / enter / delete) and env.embed (the coach website: no phone top bar)
(function (root) {
  'use strict';
  var D = root.DISP; if (!D) return;
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function dLong(iso) { var d = new Date(iso); return MONTHS[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear(); }
  function sgTxt(v) { return v == null ? '–' : Math.abs(v) < 0.005 ? '0.00' : (v > 0 ? '+' : '−') + Math.abs(v).toFixed(2); }
  function yd1(v) { return Math.abs(v) < 0.5 ? '0' : String(Math.round(Math.abs(v))); }
  var FACTORS = [{ k: 'sim', name: 'Sim', f: 1 }, { k: 'p15', name: '+15%', f: 1.15 }, { k: 'p30', name: '+30%', f: 1.3 }, { k: 'tour', name: 'Tourney' }];
  var OPTK = 'golfsg.simopts.v1';
  function opts() { try { var o = JSON.parse(localStorage.getItem(OPTK) || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } }
  function setOpt(k, v) { var o = opts(); o[k] = v; try { localStorage.setItem(OPTK, JSON.stringify(o)); } catch (e) {} }

  D.ui = function (env) {
    var SG = env.SG, view = env.view, cache = { key: '', A: null }, anim = null, rafId = 0, gen = 0, gAnim = null, gRaf = 0, gGen = 0;
    function S() { if (!view.disp) view.disp = { mode: 'view', pin: 'center' }; var s = view.disp, names = env.players(); if (!s.who || names.indexOf(s.who) < 0) s.who = env.me() || names[0] || ''; return s; }
    function mine(who) { return env.sessions().filter(function (x) { return env.same(x.player || env.me(), who); }); }
    function factorOf(s, list) {
      var k = opts().factor || 'sim', F = FACTORS.filter(function (x) { return x.k === k; })[0] || FACTORS[0];
      if (F.k !== 'tour') return { k: F.k, f: F.f };
      var f = D.courseFactor(env.tourFt(s.who, s.yd), list, s.yd, SG, env.baselineOf(s.who), opts().mode);
      return f ? { k: 'tour', f: f } : { k: 'sim', f: 1, noTour: true };
    }
    function data() {
      var s = S(), list = mine(s.who), B = D.buckets(list);
      if (!s.yd || !B.some(function (b) { return b.yd === s.yd; })) { var ok = B.filter(function (b) { return b.n >= D.MIN_SHOTS; }); s.yd = (ok.filter(function (b) { return b.yd === 150; })[0] || ok[0] || B[0] || {}).yd || null; }
      if (!s.yd) return { s: s, list: list, B: B, A: null };
      var mode = opts().mode === 'total' ? 'total' : 'carry', F = factorOf(s, list), bl = SG.baseline(env.baselineOf(s.who)).id;
      var key = [s.who, s.yd, mode, F.f, bl, list.length, list.reduce(function (t, x) { return t + x.shots.length; }, 0), list.map(function (x) { return x.id; }).join(',')].join('|');
      if (cache.key !== key) { cache.key = key; cache.A = D.analyse(list, s.yd, { mode: mode, factor: F.f, SG: SG, bl: bl }); }
      return { s: s, list: list, B: B, A: cache.A, F: F, mode: mode, bl: bl, blName: SG.baseline(bl).name };
    }
    function seg(act, cur, items) { return '<div class="bzseg dspseg" role="group">' + items.map(function (it) { var on = it[0] === cur;
      return '<button class="' + (on ? 'sel' : '') + '" data-act="' + act + '" data-v="' + it[0] + '" aria-pressed="' + on + '"' + (it[2] ? ' disabled' : '') + '>' + it[1] + '</button>'; }).join('') + '</div>'; }
    function ro() { return !!(env.readOnly && env.readOnly()); }
    function top(sub, back) {
      if (env.embed) return '';
      return '<div class="topbar frost">' + (back || (S().from === 'mygame' ? '<button class="txt frostbtn" data-act="mygame">‹ My Game</button>' : '<button class="txt frostbtn" data-act="home">‹ Home</button>')) + '<div class="title"><b>Dispersion</b><span>' + esc(sub) + '</span></div><span class="tbspace"></span></div>';
    }

    // ---------- main page ----------
    function html() {
      var s = S(); if (ro()) s.mode = 'view'; if (s.mode === 'import') return importHTML(); if (s.mode === 'manual') return manualHTML();
      var d = data(), A = d.A, h = '<div class="frostpage theme-sky bzpage dsppage" id="disp">' + top('Sim shots · ' + (s.who || 'You'));
      var names = env.players(); if (names.length > 1) h += '<div class="dspwho">' + names.map(function (n) { return '<button class="frostchip' + (env.same(n, s.who) ? ' sel' : '') + '" data-act="dspwho" data-v="' + esc(n) + '">' + esc(n) + '</button>'; }).join('') + '</div>';
      if (!d.B.length) {
        if (ro()) return h + '<div class="frostcard bzcard dspempty" id="dspempty"><h3 class="bzh">Shot pattern</h3><p>No sim shots shared yet. They show here once the player adds a GCQuad or launch-monitor session under My Game › Dispersion.</p></div></div>';
        return h + '<div class="frostcard bzcard dspempty" id="dspempty"><h3 class="bzh">Your shot pattern</h3><p>Hit 10–20 balls at one target on your GCQuad (or any launch monitor), then bring the shots in here. ' +
          'You get where your balls land around the flag, played to 9 pin positions, and the strokes gained for each pin.</p>' + addBtns() + '</div>' + sessionsHTML(d) + '</div>';
      }
      h += '<div class="dspyds" id="dspyds" role="group" aria-label="Target distance">' + d.B.map(function (b) {
        return '<button class="dspyd' + (b.yd === s.yd ? ' sel' : '') + (b.n < D.MIN_SHOTS ? ' few' : '') + '" data-act="dspyd" data-v="' + b.yd + '" aria-pressed="' + (b.yd === s.yd) + '"><b>' + b.yd + '</b><span>' + b.n + '</span></button>'; }).join('') + '</div>';
      if (!A || !A.ok) {
        h += '<div class="frostcard bzcard dspfew" id="dspfew"><p>' + (A ? A.n : 0) + ' shot' + ((A && A.n) === 1 ? '' : 's') + ' at ' + s.yd + ' yd. Add ' + (D.MIN_SHOTS - (A ? A.n : 0)) + ' more to draw your pattern (' + D.MIN_SHOTS + '+ shots).</p>' + addBtns() + '</div>';
        return h + sessionsHTML(d) + '</div>';
      }
      var P = A.pins.filter(function (p) { return p.k === s.pin; })[0] || A.pins[4];
      h += '<div class="frostcard bzcard dspplay"><div class="dspcvwrap"><canvas id="dspcv" aria-label="' + esc('Where ' + D.SHOW + ' balls from ' + s.yd + ' yd finish, ' + P.name + ' pin') + '"></canvas>' +
        '<div class="dspcap sr" id="dspcap" aria-live="polite"><b>' + esc(P.name) + ' pin</b><span>' + Math.round(P.greenPct) + '% on the green · ' + Math.round(P.medFt) + '’ median · <em class="' + D.sgTone(P.sg) + '">' + sgTxt(P.sg) + '</em></span></div></div>' +
        '<div class="dspctl"><button class="dspgo" id="dspgo" data-act="dspplay">▶ Play</button><button class="dspgo alt" id="dspall" data-act="dspall">Play all 9 pins</button></div>' +
        '<p class="dsplegend"><span><span class="dspk w"></span>on the green</span><span><span class="dspk r"></span>missed</span><span><span class="dspk e"></span>8 of 10 shots</span></p>' +
        '<p class="muted dspsrc" id="dspsrc">' + D.SHOW + ' balls from your ' + A.n + ' sim shot' + (A.n === 1 ? '' : 's') + ' at ' + s.yd + ' yd · landing spot (' + d.mode + ')' + (d.F.f > 1 ? ' · widened ×' + d.F.f.toFixed(2).replace(/0$/, '') : '') + '</p></div>';
      // v245 (Scott) Approach strategy: the green with the 9 pins in red / green – tap one and the 50 balls land on it
      h += '<div class="frostcard bzcard dspstrat"><h3 class="bzh">Approach strategy ' + tip('dspsg', 'How Approach strategy works') + '</h3>' +
        tipBody('dspsg', 'Your pattern is aimed at each flag in turn on a standard green (26 × 32 yd, bunkers front right, left and back right). Every ball is played from where it landed: a putt from its distance to the hole, or a chip or bunker shot. ' +
          'Each box = strokes gained against a ' + esc(d.blName) + ' player from ' + s.yd + ' yd in the fairway. Green = attack this pin, red = play away from it. Tap a box to see the balls land on that pin – they hop where they land – the numbers use the landing spot (carry), not the roll. <b>Best aim</b> moves the pattern around the green to find the spot that loses the fewest strokes.') +
        '<p class="dspsub">Firing at the flag from ' + s.yd + ' yd · vs ' + esc(d.blName) + ' · tap a pin</p><div class="dspgrid" id="dspgrid"><span class="dspgback">Back</span>' + D.PIN_ROWS.map(function (row) { return row.map(function (k) {
          var p = A.pins.filter(function (x) { return x.k === k; })[0], t = D.sgTone(p.sg), a = Math.min(1, Math.abs(p.sg || 0) / 0.3);
          return '<button class="dspcell ' + t + (k === s.pin ? ' sel' : '') + '" data-act="dsppin" data-v="' + k + '" style="--a:' + (0.25 + 0.75 * a).toFixed(2) + '" aria-pressed="' + (k === s.pin) + '" aria-label="' + esc(p.name + ' ' + sgTxt(p.sg)) + '"><b>' + sgTxt(p.sg) + '</b><span>' + Math.round(p.greenPct) + '% green</span></button>'; }).join(''); }).join('') + '<span class="dspgfront">Front · toward you</span></div>' +
        '<div class="dspgwrap" id="dspgwrap"><canvas id="dspgc" aria-label="' + esc(D.SHOW + ' balls landing around the ' + P.name + ' pin') + '"></canvas></div>' +
        '<p class="dsplegend"><span><span class="dspk w"></span>on the green</span><span><span class="dspk r"></span>missed</span><span><span class="dspk e"></span>8 of 10 shots</span><span>◎ best aim</span></p>';
      var b = P.best, worth = b.gain >= 0.03;
      h += '<div class="dspbest" id="dspbest"><b>' + esc(P.name) + ' · ' + sgTxt(P.sg) + '</b> – ' + Math.round(P.greenPct) + '% on the green, ' + Math.round(P.medFt) + '’ median.<br>' + (worth ? 'Best aim: ' + esc(D.aimText(b.aim, P)) + ' – saves ' + b.gain.toFixed(2) + ' a shot (◎ on the green).' : 'Fire at it – aiming elsewhere doesn’t help.') + '</div></div>';
      // the pattern
      h += '<div class="frostcard bzcard"><h3 class="bzh">Your pattern at ' + s.yd + ' yd ' + tip('dsppat', 'About your pattern') + '</h3>' +
        tipBody('dsppat', 'Measured from your target: carry minus the target yardage (short / long) and offline (left / right). Width and depth hold the middle 8 of 10 shots. Uses carry – where the ball lands – because the release depends on the green.') +
        '<div class="dsptiles"><div><b>' + A.n + '</b><span>shots</span></div><div><b>' + yd1(A.depth) + (Math.abs(A.depth) < 0.5 ? '' : ' yd') + '</b><span>' + (Math.abs(A.depth) < 0.5 ? 'on the number' : A.depth < 0 ? 'short on average' : 'long on average') + '</span></div>' +
        '<div><b>' + yd1(A.side) + (Math.abs(A.side) < 0.5 ? '' : ' yd') + '</b><span>' + (Math.abs(A.side) < 0.5 ? 'online' : A.side < 0 ? 'left on average' : 'right on average') + '</span></div>' +
        '<div><b>' + Math.round(A.width) + ' yd</b><span>wide</span></div><div><b>' + Math.round(A.length) + ' yd</b><span>deep</span></div></div>' +
        '<h4 class="dsph4">Landing spot</h4>' + seg('dspmode', d.mode, [['carry', 'Carry'], ['total', 'Total']]) +
        '<h4 class="dsph4">Course conditions ' + tip('dspfac', 'About course conditions') + '</h4>' + tipBody('dspfac', 'A sim is flat mats, no wind and no pressure, so the pattern is tighter than on the course. +15% / +30% widen it around its centre. <b>Tourney</b> sizes it from how close your tournament approaches from this distance finish (5+ shots from the fairway).') +
        seg('dspfac', d.F.k, FACTORS.map(function (F) { return [F.k, F.k === 'tour' && d.F.k === 'tour' ? 'Tourney ×' + d.F.f : F.name, F.k === 'tour' && !D.courseFactor(env.tourFt(s.who, s.yd), d.list, s.yd, SG, d.bl, d.mode)]; })) +
        (opts().factor === 'tour' && d.F.noTour ? '<p class="muted dspnote">Not enough tournament approaches from ' + s.yd + ' yd yet – showing the sim pattern.</p>' : '') + '</div>';
      return h + sessionsHTML(d) + '</div>';
    }
    function tip(k, label) { var on = !!(view.dspTip && view.dspTip[k]); return '<button type="button" class="infobtn tipbtn" data-act="dsptip" data-v="' + k + '" aria-expanded="' + on + '" aria-label="' + label + '"><span>i</span></button>'; }
    function tipBody(k, t) { return '<div class="infotext tippop"' + (view.dspTip && view.dspTip[k] ? '' : ' hidden') + '>' + t + '</div>'; }
    function addBtns() { if (ro()) return ''; return '<div class="dspadd"><label class="dspgo filebtn" for="dspfile">📂 Import CSV</label><input type="file" id="dspfile" accept=".csv,.txt,text/csv,text/plain" hidden><button class="dspgo alt" data-act="dspmanual">✎ Enter shots</button></div>'; }
    function sessionsHTML(d) {
      var L = d.list.slice().sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
      return '<div class="frostcard bzcard" id="dspsessions"><h3 class="bzh">Sim sessions</h3>' + (L.length ? '<ul class="dsplist">' + L.map(function (x) {
        var B = D.buckets([x]).map(function (b) { return b.yd; }).join(', ');
        return '<li><div><b>' + esc(x.name || 'Sim session') + '</b><span>' + dLong(x.date) + ' · ' + x.shots.length + ' shots · ' + esc(B) + ' yd</span></div>' + (ro() ? '' : '<button class="dspdel" data-act="dspdel" data-v="' + esc(x.id) + '" aria-label="Delete this session">✕</button>') + '</li>'; }).join('') + '</ul>' : '<p class="muted">None yet.</p>') +
        (d.B.length ? addBtns() : '') + '</div>';
    }

    // ---------- import a CSV ----------
    function readFile(text) {
      var P = D.parseCSV(text), M = D.guessMap(P.headers);
      if (!P.headers.length || M.carry < 0) { env.toast('Couldn’t find a Carry column in that file'); }
      var s = S(); s.mode = 'import'; s.imp = { headers: P.headers, rows: P.rows, map: M, flip: false, name: 'GCQuad session', date: new Date().toISOString().slice(0, 10), targets: {} };
      env.render(); window.scrollTo(0, 0);
    }
    function impShots(I) { return D.toShots(I.rows, I.map, { flip: I.flip }); }
    function importHTML() {
      var s = S(), I = s.imp, sh = impShots(I), G = D.clubGroups(sh);
      var h = '<div class="frostpage theme-sky bzpage dsppage" id="dspimport">' + top('Import sim shots', '<button class="txt frostbtn" data-act="dspcancel">‹ Back</button>');
      function col(k, label) { return '<label class="dsprow"><span>' + label + '</span><select data-dsp="map" data-k="' + k + '"><option value="-1">–</option>' + I.headers.map(function (hd, i) { return '<option value="' + i + '"' + (I.map[k] === i ? ' selected' : '') + '>' + esc(hd || 'Column ' + (i + 1)) + '</option>'; }).join('') + '</select></label>'; }
      h += '<div class="frostcard bzcard"><h3 class="bzh">Columns</h3><p class="dspsub">' + I.rows.length + ' rows · ' + sh.length + ' shots found</p>' + col('club', 'Club') + col('carry', 'Carry') + col('total', 'Total') + col('offline', 'Offline') + col('target', 'Target (if any)') +
        '<label class="dspchk"><input type="checkbox" data-dsp="flip"' + (I.flip ? ' checked' : '') + '> Numbers without L / R: + means left</label>' +
        '<label class="dspchk"><input type="checkbox" data-dsp="meters"' + (I.map.meters ? ' checked' : '') + '> Distances are in meters</label></div>';
      h += '<div class="frostcard bzcard"><h3 class="bzh">What were you hitting at?</h3><p class="dspsub">Each club’s shots go to its target, rounded to 10 yd.</p>' + (G.length ? G.map(function (g) {
        var t = I.targets[g.club] || g.target; return '<label class="dsprow"><span>' + esc(g.club) + ' <em>' + g.n + ' shots · carry ' + Math.round(g.carry) + '</em></span><span class="dsptg"><input type="number" inputmode="numeric" step="10" min="50" max="250" data-dsp="target" data-k="' + esc(g.club) + '" value="' + t + '"> yd</span></label>'; }).join('') : '<p class="muted">No shots with a carry yet – pick the Carry column above.</p>') + '</div>';
      h += '<div class="frostcard bzcard"><label class="dsprow"><span>Name</span><input type="text" data-dsp="name" value="' + esc(I.name) + '" maxlength="40"></label><label class="dsprow"><span>Date</span><input type="date" data-dsp="date" value="' + esc(I.date) + '"></label>' +
        '<button class="sheet-go dspsave" id="dspimpsave" data-act="dspimpsave"' + (sh.length ? '' : ' disabled') + '>Save ' + sh.length + ' shots</button></div>';
      return h + '</div>';
    }
    function saveSession(name, date, shots) {
      var s = S(), all = env.sessions(), d = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date + 'T12:00:00.000Z' : new Date().toISOString();
      all.push({ id: 'sim' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), date: d, player: s.who || env.me(), source: s.mode === 'import' ? 'csv' : 'manual', name: name || 'Sim session', shots: shots });
      env.saveSessions(all); var b = D.bucket(shots[0] && shots[0].target); s.mode = 'view'; s.imp = null; s.man = null; if (b) s.yd = b; s.pin = 'center'; anim = { play: true }; env.toast(shots.length + ' shots saved'); env.render(); window.scrollTo(0, 0);
    }

    // ---------- enter shots by hand ----------
    function manualHTML() {
      var s = S(), M = s.man; var h = '<div class="frostpage theme-sky bzpage dsppage" id="dspmanual">' + top('Enter sim shots', '<button class="txt frostbtn" data-act="dspcancel">‹ Back</button>');
      h += '<div class="frostcard bzcard"><label class="dsprow"><span>Club</span><input type="text" id="dspmclub" value="' + esc(M.club) + '" maxlength="20" placeholder="8 iron"></label>' +
        '<label class="dsprow"><span>Target</span><span class="dsptg"><input type="number" inputmode="numeric" step="10" min="50" max="250" id="dspmtarget" value="' + M.target + '"> yd</span></label>' +
        '<label class="dsprow"><span>Date</span><input type="date" id="dspmdate" value="' + esc(M.date) + '"></label></div>';
      h += '<div class="frostcard bzcard"><h3 class="bzh">Shots</h3><p class="dspsub">Carry in yards, and how far offline (L or R).</p><div class="dspmhead"><span>#</span><span>Carry</span><span>Offline</span><span></span></div><div id="dspmrows">' +
        M.rows.map(function (r, i) { return '<div class="dspmrow" data-i="' + i + '"><span>' + (i + 1) + '</span><input type="number" inputmode="decimal" step="0.1" class="dspmc" value="' + (r.c == null ? '' : r.c) + '" aria-label="Carry ' + (i + 1) + '"><input type="number" inputmode="decimal" step="0.1" min="0" class="dspmo" value="' + (r.o == null ? '' : Math.abs(r.o)) + '" aria-label="Offline ' + (i + 1) + '">' +
          '<span class="dsplr"><button class="' + (r.lr === 'L' ? 'sel' : '') + '" data-act="dsplr" data-v="' + i + ':L">L</button><button class="' + (r.lr !== 'L' ? 'sel' : '') + '" data-act="dsplr" data-v="' + i + ':R">R</button></span></div>'; }).join('') + '</div>' +
        '<button class="dspgo alt" data-act="dspmore">+ 5 more balls</button></div>';
      return h + '<div class="frostcard bzcard"><button class="sheet-go dspsave" id="dspmsave" data-act="dspmsave">Save shots</button></div></div>';
    }
    function readManual() { // keep what's typed through a re-render
      var M = S().man; if (!M) return; var c = document.getElementById('dspmclub'), t = document.getElementById('dspmtarget'), dt = document.getElementById('dspmdate');
      if (c) M.club = c.value; if (t) M.target = +t.value || M.target; if (dt) M.date = dt.value;
      [].forEach.call(document.querySelectorAll('.dspmrow'), function (row) { var i = +row.getAttribute('data-i'), r = M.rows[i]; if (!r) return; var cv = D.num(row.querySelector('.dspmc').value), ov = D.num(row.querySelector('.dspmo').value);
        r.c = cv; r.o = ov == null ? null : Math.abs(ov); });
    }

    // ---------- actions ----------
    function act(a, v, b) {
      var s = S(); if (ro() && /^dsp(del|manual|more|lr|msave|impsave)$/.test(a)) return;
      if (a === 'dspopen' || a === 'dspadd') { s.from = view.screen === 'mygame' ? 'mygame' : 'home'; view.screen = 'disp'; s.mode = 'view'; view.hmenu = null; anim = null; gAnim = null; env.render();
        var sx = a === 'dspadd' && document.getElementById('dspsessions'); if (sx && sx.scrollIntoView) sx.scrollIntoView({ block: 'start' }); else window.scrollTo(0, 0); return; }
      if (a === 'dsptip') { view.dspTip = view.dspTip || {}; view.dspTip[v] = !view.dspTip[v]; keepScroll(); return; }
      if (a === 'dspwho') { s.who = v; s.yd = null; anim = null; env.render(); return; }
      if (a === 'dspyd') { s.yd = +v; anim = { play: true }; gAnim = null; keepScroll(); return; }
      if (a === 'dsppin') { s.pin = v; gAnim = { play: true }; keepScroll(); var gw = document.getElementById('dspgwrap'); if (gw && gw.getBoundingClientRect().bottom > window.innerHeight - 70 && gw.scrollIntoView) gw.scrollIntoView({ block: 'end', behavior: 'smooth' }); return; }
      if (a === 'dspplay') { anim = { play: true }; mount(); return; }
      if (a === 'dspall') { anim = { play: true, all: true }; mount(); return; }
      if (a === 'dspmode') { setOpt('mode', v); keepScroll(); return; }
      if (a === 'dspfac') { setOpt('factor', v); keepScroll(); return; }
      if (a === 'dspdel') { var x = env.sessions().filter(function (y) { return y.id === v; })[0]; if (!x || !window.confirm('Delete ' + (x.name || 'this session') + ' (' + x.shots.length + ' shots)?')) return; env.saveSessions(env.sessions().filter(function (y) { return y.id !== v; })); keepScroll(); return; }
      if (a === 'dspmanual') { s.mode = 'manual'; var rows = []; for (var i = 0; i < 10; i++) rows.push({ c: null, o: null, lr: 'R' }); s.man = { club: '', target: s.yd || 150, date: new Date().toISOString().slice(0, 10), rows: rows }; env.render(); window.scrollTo(0, 0); return; }
      if (a === 'dspmore') { readManual(); for (var j = 0; j < 5; j++) s.man.rows.push({ c: null, o: null, lr: 'R' }); keepScroll(); return; }
      if (a === 'dsplr') { var p = v.split(':'), r = s.man && s.man.rows[+p[0]]; if (!r) return; r.lr = p[1]; [].forEach.call(b.parentNode.children, function (x) { x.classList.toggle('sel', x === b); }); return; }
      if (a === 'dspcancel') { s.mode = 'view'; s.imp = null; s.man = null; env.render(); window.scrollTo(0, 0); return; }
      if (a === 'dspmsave') { readManual(); var M = s.man, tg = D.bucket(M.target);
        if (!tg || tg < 50 || tg > 250) { env.toast('Pick a target from 50 to 250 yd'); return; }
        var shots = M.rows.filter(function (r) { return r.c != null && r.c > 0; }).map(function (r) { return { club: (M.club || '').trim() || 'Club', target: tg, carry: r.c, total: null, offline: r.o == null ? 0 : (r.lr === 'L' ? -r.o : r.o) }; });
        if (!shots.length) { env.toast('Enter at least one carry'); return; } saveSession((M.club || 'Sim') + ' · ' + tg + ' yd', M.date, shots); return; }
      if (a === 'dspimpsave') { var I = s.imp, sh = impShots(I), G = D.clubGroups(sh), T = {}; G.forEach(function (g) { T[g.club] = D.bucket(I.targets[g.club] || g.target); });
        sh.forEach(function (x) { x.target = T[x.club] || D.bucket(x.carry); }); saveSession(I.name, I.date, sh); return; }
    }
    function keepScroll() { var y = window.scrollY; env.render(); window.scrollTo(0, y); }
    document.addEventListener('change', function (ev) {
      var t = ev.target; if (!t) return;
      if (t.id === 'dspfile') { if (ro()) return; var f = t.files && t.files[0]; if (!f) return; var rd = new FileReader(); rd.onload = function () { readFile(String(rd.result)); }; rd.onerror = function () { env.toast('Could not read that file'); }; rd.readAsText(f); t.value = ''; return; }
      var k = t.getAttribute('data-dsp'); if (!k) return; var I = S().imp; if (!I) return;
      if (k === 'map') I.map[t.getAttribute('data-k')] = +t.value;
      else if (k === 'flip') I.flip = t.checked; else if (k === 'meters') I.map.meters = t.checked;
      else if (k === 'target') { I.targets[t.getAttribute('data-k')] = +t.value; return; }
      else if (k === 'name') { I.name = t.value; return; } else if (k === 'date') { I.date = t.value; return; }
      keepScroll();
    });

    // ---------- the animation ----------
    // world = green frame in yards (x right, y away). Camera { cx, cy, s (px per yd) }.
    var COL = { rough: '#2f6e35', rough2: '#2a6530', fw: '#4f9a45', fw2: '#58a34d', green: '#5cb85c', collar: '#4aa64b', edge: '#2e7d32', sand: '#efe2b8', sandEdge: '#cdbb86', red: '#e0313f', ell: '#ffe066' };
    function cams(W, H, yd, pin) {
      var wide = { cx: 0, cy: (-yd - 14 + 24) / 2, s: Math.min(H / (yd + 38), W / 60) };
      var close = { cx: 0, cy: 0, s: Math.min(W / 60, H / 58) };
      return { wide: wide, close: close };
    }
    function lerpCam(a, b, t) { var e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; return { cx: a.cx + (b.cx - a.cx) * e, cy: a.cy + (b.cy - a.cy) * e, s: Math.exp(Math.log(a.s) + (Math.log(b.s) - Math.log(a.s)) * e) }; }
    function drawScene(ctx, W, H, cam, yd, pin, noFlag) {
      var X = function (x) { return W / 2 + (x - cam.cx) * cam.s; }, Y = function (y) { return H / 2 - (y - cam.cy) * cam.s; }, G = D.GREEN;
      ctx.fillStyle = COL.rough; ctx.fillRect(0, 0, W, H);
      // fairway: from behind the ball to the front of the green, mown stripes every 10 yd
      var fy0 = pin.y - yd - 15, fy1 = -G.ry + 4; ctx.save(); ctx.beginPath(); ctx.moveTo(X(-G.lane), Y(fy0));
      for (var q = 0; q <= 20; q++) { var yy = -G.ry - 6 + 10 * q / 20; ctx.lineTo(X(-D.laneHalf(yy, G)), Y(yy)); }
      for (q = 20; q >= 0; q--) { yy = -G.ry - 6 + 10 * q / 20; ctx.lineTo(X(D.laneHalf(yy, G)), Y(yy)); }
      ctx.lineTo(X(G.lane), Y(fy0)); ctx.closePath(); ctx.clip();
      for (var y = fy0, i = 0; y < fy1; y += 10, i++) { ctx.fillStyle = i % 2 ? COL.fw : COL.fw2; var y2 = Math.min(fy1, y + 10); ctx.fillRect(X(-G.lane) - 1, Y(y2), 2 * G.lane * cam.s + 2, (y2 - y) * cam.s + 1); }
      ctx.restore();
      // distance arcs from the pin (50 / 100 / 150 / …)
      ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 1; ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.font = '600 ' + 10 + 'px -apple-system, system-ui, sans-serif'; ctx.textAlign = 'center';
      for (var r = 50; r <= yd + 10; r += 50) { var rp = r * cam.s; if (rp > 4 * W) continue; ctx.beginPath(); ctx.arc(X(pin.x), Y(pin.y), rp, Math.PI * 0.62, Math.PI * 0.38, true); ctx.stroke(); var ly = Y(pin.y - r); if (ly > 10 && ly < H - 4) ctx.fillText(r, X(-G.lane) - 12, ly + 3); }
      ctx.restore();
      // bunkers, green, collar, flag
      G.bunkers.forEach(function (b) { ctx.fillStyle = COL.sand; ctx.strokeStyle = COL.sandEdge; ctx.lineWidth = 1; ell(ctx, X(b.x), Y(b.y), b.rx * cam.s, b.ry * cam.s, b.rot); ctx.fill(); ctx.stroke(); });
      ctx.fillStyle = COL.collar; ell(ctx, X(0), Y(0), (G.rx + G.fringe) * cam.s, (G.ry + G.fringe) * cam.s, 0); ctx.fill();
      ctx.fillStyle = COL.green; ctx.strokeStyle = COL.edge; ctx.lineWidth = 1.2; ell(ctx, X(0), Y(0), G.rx * cam.s, G.ry * cam.s, 0); ctx.fill(); ctx.stroke();
      if (noFlag) return { X: X, Y: Y };
      var fx = X(pin.x), fy = Y(pin.y), fh = Math.max(12, Math.min(26, 2.2 * cam.s));
      ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(fx, fy, Math.max(1.8, 0.35 * cam.s), 0, 7); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx, fy - fh); ctx.stroke();
      ctx.fillStyle = COL.red; ctx.beginPath(); ctx.moveTo(fx, fy - fh); ctx.lineTo(fx + fh * 0.55, fy - fh * 0.78); ctx.lineTo(fx, fy - fh * 0.56); ctx.closePath(); ctx.fill();
      return { X: X, Y: Y };
    }
    function ell(ctx, x, y, rx, ry, rotDeg) { ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), -(rotDeg || 0) * Math.PI / 180, 0, 2 * Math.PI); }
    // one pin's timeline. quick = start on the green view with short flights.
    function timeline(quick) { return quick ? { zoom: [0, 0], fly0: 0, flyGap: 0.9, flyDur: 0.65, ell: 0, ellDur: 0.5, end: 0 } : { zoom: [0, 0], fly0: 0.35, flyGap: 2.3, flyDur: 1.25, ell: 0, ellDur: 0.8, end: 0 }; }
    function mount() { mountTop(); mountGreen(); }
    function mountTop() {
      var cv = document.getElementById('dspcv'); if (!cv) return; var d = data(), A = d.A; if (!A || !A.ok) return;
      var W = cv.clientWidth || 360, H = Math.round(W * 1.12), dpr = window.devicePixelRatio || 1; cv.width = W * dpr; cv.height = H * dpr; cv.style.height = H + 'px';
      var ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (rafId) cancelAnimationFrame(rafId); rafId = 0; var my = ++gen;
      var s = S(), reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      var order = anim && anim.all ? D.PINS.map(function (p) { return p.k; }) : [s.pin];
      if (!anim || !anim.play || reduce) { frame(ctx, W, H, A, D.pinOf(s.pin), 1e9, true, d); anim = null; return; }
      var st = { i: 0, t0: performance.now(), quick: !!anim.quick, order: order }; anim = null;
      function step(now) {
        if (my !== gen) return; var c = document.getElementById('dspcv'); if (!c || view.screen !== 'disp') { rafId = 0; return; }
        var pk = st.order[st.i], t = (now - st.t0) / 1000, done = frame(ctx, W, H, A, D.pinOf(pk), t, st.quick, d);
        if (done && t > done + (st.order.length > 1 ? 0.8 : 0)) {
          if (st.i + 1 < st.order.length) { st.i++; st.t0 = now; st.quick = true; } else { rafId = 0; caption(A, pk); return; }
        }
        if (st.order.length > 1) caption(A, pk);
        rafId = requestAnimationFrame(step);
      }
      rafId = requestAnimationFrame(step);
    }
    function caption(A, pk) {
      var P = A.pins.filter(function (p) { return p.k === pk; })[0], el = document.getElementById('dspcap'); if (!P || !el) return;
      el.innerHTML = '<b>' + esc(P.name) + ' pin</b><span>' + Math.round(P.greenPct) + '% on the green · ' + Math.round(P.medFt) + '’ median · <em class="' + D.sgTone(P.sg) + '">' + sgTxt(P.sg) + '</em></span>';
    }
    // draw time t (s) of one pin's animation; returns the time it finishes
    function frame(ctx, W, H, A, pin, t, quick, d) {
      var yd = A.yd, C = cams(W, H, yd, pin), n = A.show.length, T = timeline(quick), orig = { x: pin.x, y: pin.y - yd };
      var spread = T.flyGap, last = T.fly0 + spread + T.flyDur, zoom0 = quick ? -1 : last + 0.15, zoomDur = 1.1, ellT = quick ? last + 0.1 : zoom0 + zoomDur + 0.05, end = ellT + T.ellDur;
      var cam = quick ? C.close : t < zoom0 ? C.wide : lerpCam(C.wide, C.close, Math.min(1, (t - zoom0) / zoomDur));
      if (quick) orig = { x: pin.x, y: pin.y - 40 };
      var P = drawScene(ctx, W, H, cam, yd, pin), X = P.X, Y = P.Y, bs = Math.max(2.2, Math.min(4.2, 0.55 * cam.s));
      // tracers fade once the camera starts to move
      var trA = quick ? Math.max(0, 1 - Math.max(0, t - last) / 0.6) : t < zoom0 ? 1 : Math.max(0, 1 - (t - zoom0) / 0.6);
      for (var i = 0; i < n; i++) {
        var p = A.show[i], lx = pin.x + p.dx, ly = pin.y + p.dy, t0 = T.fly0 + spread * i / n, u = (t - t0) / T.flyDur; if (u <= 0) continue;
        var on = D.onGreen(lx, ly), k = Math.min(1, u), ex = orig.x + (lx - orig.x) * k, ey = orig.y + (ly - orig.y) * k, hgt = Math.sin(Math.PI * k) * (quick ? 4 : 9);
        if (trA > 0) { ctx.strokeStyle = 'rgba(255,255,255,' + (0.22 * trA).toFixed(3) + ')'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(X(orig.x), Y(orig.y));
          for (var q = 1; q <= 12; q++) { var kk = k * q / 12; ctx.lineTo(X(orig.x + (lx - orig.x) * kk), Y(orig.y + (ly - orig.y) * kk) - Math.sin(Math.PI * kk) * (quick ? 4 : 9) * cam.s * 0.25); } ctx.stroke(); }
        var bx = X(ex), by = Y(ey) - hgt * cam.s * 0.25;
        if (u < 1) { ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.arc(X(ex), Y(ey), bs * 0.8, 0, 7); ctx.fill(); }
        ctx.fillStyle = u >= 1 ? (on ? '#fff' : COL.red) : '#fff'; ctx.strokeStyle = u >= 1 ? (on ? 'rgba(0,0,0,.45)' : '#7d1019') : 'rgba(0,0,0,.35)'; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.arc(bx, by, bs * (u < 1 ? 1 + 0.35 * Math.sin(Math.PI * k) : 1), 0, 7); ctx.fill(); ctx.stroke();
      }
      // the dispersion shape draws itself
      if (t > ellT && A.ell) { var e = A.ell, pr = Math.min(1, (t - ellT) / T.ellDur), cx = X(pin.x + e.cx), cy = Y(pin.y + e.cy);
        ctx.save(); ctx.strokeStyle = COL.ell; ctx.lineWidth = 2.2; ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 3; ctx.beginPath();
        ctx.ellipse(cx, cy, e.rx * cam.s, e.ry * cam.s, -e.rot * Math.PI / 180, 0, 2 * Math.PI * pr); ctx.stroke(); ctx.restore();
        if (pr >= 1) { var pv = A.pins.filter(function (x) { return x.k === pin.k; })[0]; badge(ctx, W, pv, d); }
      }
      return end;
    }
    function badge(ctx, W, P, d) {
      var txt = P.name + ' · ' + sgTxt(P.sg), t2 = Math.round(P.greenPct) + '% on the green · ' + Math.round(P.medFt) + '’ median';
      ctx.save(); ctx.font = '600 13px -apple-system, system-ui, sans-serif'; var w = Math.max(ctx.measureText(txt).width, (ctx.font = '400 11px -apple-system, system-ui, sans-serif', ctx.measureText(t2).width)) + 20;
      ctx.fillStyle = 'rgba(20,28,24,.72)'; rr(ctx, 10, 10, w, 40, 9); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = '600 13px -apple-system, system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.fillText(txt, 20, 28);
      ctx.font = '400 11px -apple-system, system-ui, sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillText(t2, 20, 43); ctx.restore();
    }
    function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
    // ---------- Approach strategy: the green, 9 pins, balls dropping in on the chosen one ----------
    function gCam(W, H) { return { cx: 0, cy: -3.5, s: Math.min(W / 48, H / 50) }; }
    function mountGreen() {
      var cv = document.getElementById('dspgc'); if (!cv) return; var d = data(), A = d.A; if (!A || !A.ok) return;
      var W = cv.clientWidth || 360, H = Math.round(W * 0.95), dpr = window.devicePixelRatio || 1; cv.width = W * dpr; cv.height = H * dpr; cv.style.height = H + 'px';
      var ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); var cam = gCam(W, H);
      if (gRaf) cancelAnimationFrame(gRaf); gRaf = 0; var my = ++gGen, s = S(), pin = A.pins.filter(function (p) { return p.k === s.pin; })[0] || A.pins[4];
      var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (!gAnim || !gAnim.play || reduce) { gFrame(ctx, W, H, cam, A, pin, 1e9, d); gAnim = null; return; }
      gAnim = null; var t0 = performance.now();
      function step(now) { if (my !== gGen || !document.getElementById('dspgc') || view.screen !== 'disp') { gRaf = 0; return; }
        var t = (now - t0) / 1000, end = gFrame(ctx, W, H, cam, A, pin, t, d); if (t > end) { gRaf = 0; return; } gRaf = requestAnimationFrame(step); }
      gRaf = requestAnimationFrame(step);
    }
    // t = seconds since the tap; returns the time it's finished. Each ball falls in, lands, hops twice where it landed.
    function gFrame(ctx, W, H, cam, A, pin, t, d) {
      var P = drawScene(ctx, W, H, cam, A.yd, pin, true), X = P.X, Y = P.Y, n = A.show.length, bs = Math.max(2.4, Math.min(4.4, 0.55 * cam.s));
      var FALL = 0.32, SPREAD = 1.0, HOP = [[0.2, 10], [0.14, 3.5]], settle = FALL + SPREAD + HOP[0][0] + HOP[1][0], ellT = settle + 0.05, ellDur = 0.55, end = ellT + ellDur;
      // the 9 pins: a tag with the strokes gained, coloured attack / play away
      for (var i = 0; i < n; i++) {
        var q = A.show[i], lx = pin.x + q.dx, ly = pin.y + q.dy, on = D.onGreen(lx, ly), tl = FALL + SPREAD * i / n, u = t - tl + FALL; if (u <= 0) continue;
        var bx = X(lx), by = Y(ly), lift = 0, k = 1;
        if (u < FALL) { var f = u / FALL; lift = (1 - f) * (1 - f) * 34; k = 1 + 0.9 * (1 - f); ctx.fillStyle = 'rgba(0,0,0,' + (0.12 + 0.2 * f).toFixed(2) + ')'; ctx.beginPath(); ctx.arc(bx, by, bs * (0.6 + 0.5 * f), 0, 7); ctx.fill(); }
        else { var a = u - FALL; for (var j = 0; j < HOP.length; j++) { if (a < HOP[j][0]) { var z = a / HOP[j][0]; lift = 4 * z * (1 - z) * HOP[j][1]; break; } a -= HOP[j][0]; }
          if (lift > 0.3) { ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.beginPath(); ctx.arc(bx, by, bs * 0.8, 0, 7); ctx.fill(); } }
        var landed = u >= FALL; ctx.fillStyle = !landed ? '#fff' : on ? '#fff' : COL.red; ctx.strokeStyle = !landed ? 'rgba(0,0,0,.35)' : on ? 'rgba(0,0,0,.45)' : '#7d1019'; ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.arc(bx, by - lift, bs * k, 0, 7); ctx.fill(); ctx.stroke();
      }
      // the chosen pin's flag on top of the balls, then the shape, then best aim
      var fx = X(pin.x), fy = Y(pin.y), fh = 24; ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(fx, fy, 2.2, 0, 7); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx, fy - fh); ctx.stroke();
      ctx.fillStyle = D.sgTone(pin.sg) === 'bad' ? COL.red : D.sgTone(pin.sg) === 'good' ? '#2ea043' : '#f2f2f2'; ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(fx, fy - fh); ctx.lineTo(fx + 14, fy - fh + 5); ctx.lineTo(fx, fy - fh + 10); ctx.closePath(); ctx.fill(); ctx.stroke();
      if (t > ellT && A.ell) { var e = A.ell, pr = Math.min(1, (t - ellT) / ellDur);
        ctx.save(); ctx.strokeStyle = COL.ell; ctx.lineWidth = 2.2; ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 3; ctx.beginPath();
        ctx.ellipse(X(pin.x + e.cx), Y(pin.y + e.cy), e.rx * cam.s, e.ry * cam.s, -e.rot * Math.PI / 180, 0, 2 * Math.PI * pr); ctx.stroke(); ctx.restore();
        if (pr >= 1) { if (pin.best && pin.best.gain >= 0.03) { var ax = X(pin.best.aim.x), ay = Y(pin.best.aim.y); ctx.save(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.8; ctx.shadowColor = 'rgba(0,0,0,.5)'; ctx.shadowBlur = 2;
            ctx.beginPath(); ctx.arc(ax, ay, 7, 0, 7); ctx.stroke(); ctx.beginPath(); ctx.arc(ax, ay, 2, 0, 7); ctx.stroke(); ctx.restore(); }
          badge(ctx, W, pin, d); }
      }
      return end;
    }
    return { html: html, act: act, mount: mount, data: data };
  };
})(this);
