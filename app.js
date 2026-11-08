/* Strokewise (v135; was Pin High, before that Golf Shot Tracker) - UI (v4: shot rows + selectable SG baselines). Data lives in localStorage on the phone. */
(function () {
  'use strict';
  // Family watching a shared round (?watch=<token>): a read-only live scorecard. Nothing below runs, so this phone's own rounds,
  // backups and settings are never read or changed by the viewer.
  var LIVE_DB = (window.GOLF_CONFIG || {}).liveDb || '';
  var APP_VER = 'Strokewise ' + ((window.GOLF_CONFIG || {}).appVersion || ''); // v107: shown small at the bottom of Settings and Home
  if (window.LIVE && LIVE.watchId(location.search)) {
    document.title = 'Strokewise · Live'; document.body.classList.add('lvbody');
    LIVE.startViewer(document.getElementById('app'), LIVE.watchId(location.search), { base: LIVE_DB, oriole: 'img/oriole.webp' });
    return;
  }
  var KEY = 'golfsg.rounds.v1', CUR = 'golfsg.current.v1', PN = 'golfsg.player.v1', CRS = 'golfsg.courses.v1', NA = 'golfsg.nameasked.v1';
  function coursesRaw() { try { var a = JSON.parse(localStorage.getItem(CRS) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function courses() { return COURSES.migrate(coursesRaw()).courses; } // older saves: unnamed tee sets read as 'Main tees'
  (function () { var M = COURSES.migrate(coursesRaw()); if (M.changed) try { localStorage.setItem(CRS, JSON.stringify(M.courses)); } catch (e) {} })();
  function saveCourses(a) { localStorage.setItem(CRS, JSON.stringify(a)); }
  // v92 My Bag: clubs + carries + playing conditions (bag.js), stored on the phone and in backups
  var BGK = 'golfsg.bag.v1';
  function bag() { try { return BAG.norm(JSON.parse(localStorage.getItem(BGK) || 'null')); } catch (e) { return BAG.blank(); } }
  function saveBag(b, quiet) { b.updated = new Date().toISOString(); localStorage.setItem(BGK, JSON.stringify(BAG.norm(b))); if (!quiet) backupDirty(3000); else backupDirty(20000); }
  function bagForBackup() { var b = bag(); return b.clubs.length ? b : null; }
  // v142 practice log: [{ id, date, player, spoke, focus, min }] – minutes per skill, per player, in the backups
  var PRK = 'golfsg.practice.v1';
  function practice() { try { return MYGAME.validPractice(JSON.parse(localStorage.getItem(PRK) || '[]')); } catch (e) { return []; } }
  function savePractice(list) { localStorage.setItem(PRK, JSON.stringify(list)); backupDirty(3000); }
  function practiceOf(who) { return practice().filter(function (e) { return samePlayer(e.player || playerName(), who); }); }
  // v93 Wedges: chart of 40–110 yd (wedges.js), stored on the phone and in backups
  var WGK = 'golfsg.wedges.v1';
  function wedges() { try { return WEDGES.norm(JSON.parse(localStorage.getItem(WGK) || 'null')); } catch (e) { return WEDGES.blank(); } }
  function saveWedges(w) { w.updated = new Date().toISOString(); localStorage.setItem(WGK, JSON.stringify(WEDGES.norm(w))); backupDirty(20000); }
  function wedgesForBackup() { var w = wedges(); return WEDGES.count(w) ? w : null; } // both flights, incl. entries kept from the 5-yard draft
  function courseById(id) { return courses().filter(function (c) { return c.id === id; })[0]; }
  function playerName() { return (localStorage.getItem(PN) || '').trim(); }
  // Rounds that belong to this phone's player (unnamed rounds count as theirs). Backups contain only these,
  // so another player's rounds are never written into this player's file.
  function samePlayer(a, b) { return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase(); }
  function ownRounds() { var n = playerName(); return rounds.filter(function (r) { return !r.player || samePlayer(r.player, n); }); }
  // Location choices (row = where the shot is played FROM)
  // Row = one stroke, hit FROM this location. Last row = In the hole (with the distance of the stroke that went in).
  var LOCS = [['fairway', 'Fairway'], ['rough', 'Rough'], ['bunker', 'Bunker'], ['green', 'Green'],
    ['hazard', 'Hazard'], ['ob', 'OB re-hit'], ['holed', 'In the hole'], ['holedx', 'In the hole (chip/shot)'],
    ['deep', 'Deep rough'], ['trees', 'Trees']];
  var LOCS0 = [['tee', 'Tee'], ['holedx', 'In the hole (ace!)']];
  var LOC_SHORT = { tee: 'Tee', fairway: 'Fairway', rough: 'Rough', bunker: 'Bunker', green: 'Green', hazard: 'Hazard',
    ob: 'OB re-hit', holed: 'In the hole', holedx: 'In the hole', deep: 'Deep rough', trees: 'Trees' };
  // 8-way direction: where the previous shot ended relative to its target. Short = toward the golfer.
  var ARROW = { '': '–', long: '↑', longright: '↗', right: '→', shortright: '↘', short: '↓', shortleft: '↙', left: '←', longleft: '↖' };
  var DIR_GRID = [['longleft', 'long', 'longright'], ['left', '', 'right'], ['shortleft', 'short', 'shortright']];
  function dirName(d) { return d ? SG.DIR_NAME[d] : 'No direction'; }
  var CAT_NAME = { tee: 'Off the tee', approach: 'Approach', short: 'Short game', putting: 'Putting' };

  var rounds = load();
  (function () { var n = playerName(), ch = false; if (n) rounds.forEach(function (r) { if (!r.player) { r.player = n; ch = true; } }); if (ch) localStorage.setItem(KEY, JSON.stringify(rounds)); })(); // rounds belong to this phone's player
  var view = { screen: 'home', roundId: localStorage.getItem(CUR), hole: 0, menu: null };
  // Live sharing (v87): one secret link per round; every save() pushes a fresh snapshot (debounced, queued while offline).
  var live = window.LIVE && LIVE_DB ? LIVE.publisher({ base: LIVE_DB, fetch: function (u, o) { return window.fetch(u, o); }, storage: localStorage, key: 'golfsg.live.v1',
    online: function () { return navigator.onLine !== false; }, onStatus: function () { liveRefresh(); },
    build: function (rid) { var r = rounds.filter(function (x) { return x.id === rid; })[0]; return r ? LIVE.snapshot(r, SG, { name: r.player || playerName() }) : null; } }) : null;
  if (live) {
    window.addEventListener('online', function () { live.flush(); });
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') { live.collect(); live.flush(); } });
    live.collect(); live.flush(); // catch up on anything queued before the app was closed
  }
  try { if (sessionStorage.getItem('golfsg.afterRedirect')) { view.screen = sessionStorage.getItem('golfsg.afterRedirect'); sessionStorage.removeItem('golfsg.afterRedirect'); } } catch (e) {}

  function load() {
    var rs;
    try { rs = JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { rs = []; }
    // Migrate older saves to v3 rows (one row = one stroke)
    var changed = false;
    rs.forEach(function (r) {
      if (r.v === 3) return;
      (r.holes || []).forEach(function (h) {
        if (h.shots) { h.rows = SG.v1ToRows(h); delete h.shots; delete h.yards; }
        else if (h.rows) h.rows = SG.migrateV2Rows(h.rows);
        else h.rows = [{ loc: 'tee', dist: '', dir: '', pen: false }];
        if (!h.par) h.par = 4;
        h.finished = SG.analyzeHole(h).complete;
      });
      r.v = 3; changed = true;
    });
    rs.forEach(function (r) {
      if (r.dv === 2) return;
      (r.holes || []).forEach(function (h) { (h.rows || []).forEach(function (row) { row.dir = SG.normDir(row.dir); }); });
      r.dv = 2; changed = true;
    });
    // recovery: an empty stub (0 shots) left beside the real round played that day is merged into it
    var F = SG.foldStubs(rs, null, localStorage.getItem(CUR)); /* the round in progress is never removed silently */ if (F.folded.length) { rs = F.rounds; changed = true; var c0 = localStorage.getItem(CUR); if (c0 && F.folded.indexOf(c0) >= 0) localStorage.removeItem(CUR); }
    if (changed) localStorage.setItem(KEY, JSON.stringify(rs));
    return rs;
  }
  function blOf(r) { return SG.baseline(r && r.baseline).id; }
  function blName(id) { return SG.baseline(id).name; }
  function blLabel(id) { var b = SG.baseline(id); return b.name + (b.status === 'estimated' ? ' (estimated)' : ''); }
  function AH(h) { return SG.analyzeHole(h, blOf(round())); }
  function blSelect(id, sel) {
    return '<select id="' + id + '" class="blsel" data-f="baseline" aria-label="Compare against">' + SG.BASELINES.map(function (b) {
      return '<option value="' + b.id + '"' + (b.id === sel ? ' selected' : '') + '>' + blLabel(b.id) + '</option>'; }).join('') + '</select>';
  }
  function save() { var cr = !view.preview && round(); if (cr) cr.updated = new Date().toISOString(); localStorage.setItem(KEY, JSON.stringify(rounds)); backupDirty(60000); if (live) live.touch(); }
  function round() { if (view.preview) return view.preview; return rounds.filter(function (r) { return r.id === view.roundId; })[0]; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
  function fmtSG(v) { var s = (Math.round(v * 100) / 100).toFixed(2); return (v > 0.004 ? '+' : '') + (s === '-0.00' ? '0.00' : s); }
  function sgCls(v) { return v > 0.004 ? 'pos' : v < -0.004 ? 'neg' : ''; }
  function toPar(n) { return n === 0 ? 'E' : n > 0 ? '+' + n : String(n); }
  function unit(lie) { return lie === 'green' ? 'ft' : 'yd'; }
  function toast(msg) {
    var t = document.getElementById('toast'); t.textContent = msg; t.className = 'show';
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.className = ''; }, 1800);
  }
  function emptyHole() { return { par: 4, finished: false, rows: [{ loc: 'tee', dist: '', dir: '', pen: false }] }; }
  function newRound(course) {
    var sel = document.getElementById('newbl');
    var r = { v: 3, dv: 2, id: 'r' + Date.now(), date: new Date().toISOString(), course: course || '', player: playerName(), baseline: sel ? sel.value : 'pga', holes: [] };
    for (var i = 0; i < 18; i++) r.holes.push(emptyHole());
    var nc = view.newC && courseById(view.newC.id), tee = view.newC && view.newC.tee;
    if (!nc && course) { nc = courses().filter(function (c) { return c.name.trim().toLowerCase() === course.toLowerCase(); })[0]; tee = null; } // typed a saved course's name
    if (nc && (!course || course.toLowerCase() === nc.name.toLowerCase())) { r.course = nc.name; r.courseId = nc.id; r.tee = tee || (nc.tees[0] || {}).name || ''; COURSES.prefill(r.holes, nc, r.tee); }
    view.newC = null; view.newAdd = false; view.crsOpen = false;
    rounds.unshift(r); save();
    view.roundId = r.id; localStorage.setItem(CUR, r.id);
    goHole(0, true);
  }
  function goHole(i, focus) {
    view.screen = 'hole'; view.hole = Math.max(0, Math.min(17, i)); view.menu = null; view.edk = null; view.parEdit = null; view.liveCard = false; view.dirk = null; view.pinOpen = false; view.voice = null; micAbort();
    render(); window.scrollTo(0, 0);
    var h = round().holes[view.hole];
    if (focus && h.rows.length === 1 && h.rows[0].dist === '') focusDist(0);
  }
  function focusDist(k) { var el = document.querySelector('input[data-row="' + k + '"]');
    if (!el && view.screen === 'hole' && document.querySelector('.tline[data-k="' + k + '"]')) { view.edk = { h: view.hole, k: k }; render(); el = document.querySelector('input[data-row="' + k + '"]'); } // v115: open that shot's cells first
    if (el) el.focus(); }
  function started(h) { return h.rows.length > 1 || h.rows[0].dist !== '' || !!h.finished; }

  // ---------- rendering ----------
  // in-round look: B = sky gradient (default), A = light-blue accents on the photo (?theme=A or localStorage golfsg.roundTheme = A).
  function roundTheme() { var t = (location.search.match(/[?&]theme=([AB])/) || [])[1] || localStorage.getItem('golfsg.roundTheme'); return t === 'A' ? ' theme-blue' : ' theme-sky'; }
  function render() {
    var el = document.getElementById('app');
    if (view.screen !== 'summary') view.map = null;
    if (view.screen !== 'summary' && view.screen !== 'hole') view.replay = null;
    if (view.screen !== 'hole') { view.pinOpen = false; view.voice = null; view.liveCard = false; micAbort(); }
    if (view.screen !== 'card') view.card = null;
    if (view.screen !== 'summary') { view.send = null; if (view.story) storyClose(); } if (view.screen !== 'history') view.addr = null; // v97 sheets
    if (view.screen !== 'home') { if (view.hmenu !== 'new') { view.newC = null; view.newAdd = false; } view.crsOpen = false; view.nameSheet = null; }
    if (view.hmenu !== 'new') view.newPEdit = false;
    document.body.classList.toggle('noscroll', !!(view.pinOpen && view.screen === 'hole'));
    if (view.screen === 'about') el.innerHTML = aboutHTML();
    else if (view.screen === 'history') el.innerHTML = historyHTML();
    else if (view.screen === 'stats') { var stLs = (document.getElementById('strounds') || {}).scrollTop; el.innerHTML = statsHTML(); var stL = document.getElementById('strounds'); if (stL && stLs != null) stL.scrollTop = stLs; stListScroll(); }
    else if (view.screen === 'compare') el.innerHTML = compareHTML2();
    else if (view.screen === 'restorepick') el.innerHTML = restorePickHTML();
    else if (view.screen === 'archive') el.innerHTML = archiveHTML();
    else if (view.screen === 'card') el.innerHTML = cardHTML();
    else if (view.screen === 'courses') el.innerHTML = coursesHTML();
    else if (view.screen === 'bag') el.innerHTML = bagHTML();
    else if (view.screen === 'help') el.innerHTML = helpHTML(); // v128
    else if (view.screen === 'mygame') el.innerHTML = myGameHTML(); // v141
    else if (view.screen === 'profile') { view.screen = 'archive'; el.innerHTML = archiveHTML(); } // v102: old Profile → Settings
    else if (view.screen === 'wedges') el.innerHTML = wedgesHTML();
    else if (view.screen === 'birdie') { view.bzD = null; el.innerHTML = birdieHTML(); }
    else if (view.screen === 'home' || !round()) el.innerHTML = homeHTML();
    else if (view.screen === 'hole') el.innerHTML = '<div class="frostpage roundpage holepage' + roundTheme() + '">' + holeHTML() + (view.pinOpen ? pinHTML() : '') + (view.replay != null ? replayHTML() : '') + '</div>';
    else if (view.screen === 'about') el.innerHTML = aboutHTML();
    else { el.innerHTML = '<div class="frostpage roundpage' + roundTheme() + '">' + summaryHTML() + (view.send && round() && view.send.id === round().id ? sendSheetHTML(round()) : '') + (view.mv && view.mv.from === 'summary' && view.mv.sheet ? mvSheetHTML() : '') + (view.map ? mapHTML() : '') + (view.replay != null ? replayHTML() : '') + '</div>'; if (view.map) applyHeat(); if (view.preview) previewOnly(el); }
    document.body.classList.toggle('onhome', !!el.querySelector('#home'));
    if (view.screen !== 'hole') document.body.classList.toggle('noscroll', !!((view.map || (view.story && view.story.full)) && view.screen === 'summary'));
    if (view.replay != null) document.body.classList.add('noscroll');
    if (view.screen !== 'about') { legendNotes(el); infoize(el); }
  }
  // v123: on the round-page map sheets, long legend sentences without a symbol ("Rings = feet from the hole…") move under the legend as a note, which infoize() puts behind ⓘ
  function legendNotes(root) {
    [].slice.call(root.querySelectorAll('.mapview.lightmap .legend > span')).forEach(function (sp, i) {
      if (sp.querySelector('i, svg, b, .dot, .ln, .sw, .dia, .x, .star') || sp.textContent.trim().length < 60) return;
      var lg = sp.parentNode, p = document.createElement('p'); p.className = 'help muted legnote'; p.id = (lg.id || 'legend') + '-note' + i; p.innerHTML = sp.innerHTML;
      var after = lg.__noteAfter || lg; after.parentNode.insertBefore(p, after.nextSibling); lg.__noteAfter = p; lg.removeChild(sp);
    });
  }
  // Small tap-to-reveal tips (Archive): an (i) or 💡 button + a hidden soft panel, toggled by the shared 'info' action
  function tipBtn(key, icon, label) { return '<button type="button" class="infobtn tipbtn" data-act="info" data-v="' + key + '" aria-controls="tip-' + key + '" aria-expanded="' + !!infoOpen[key] + '" aria-label="' + (label || 'More info') + '"><span>' + icon + '</span></button>'; }
  function tipLbl(key, text) { return '<button type="button" class="tiplbl" data-act="info" data-v="' + key + '" aria-controls="tip-' + key + '" aria-expanded="' + !!infoOpen[key] + '">' + text + '</button>'; }
  function tipText(key, html) { return '<div class="infotext tippop" id="tip-' + key + '"' + (infoOpen[key] ? '' : ' hidden') + '>' + html + '</div>'; }
  // Long explanations collapse behind a small (i) button; the first sentence stays as a short caption.
  var infoOpen = {};
  function infoize(root) {
    [].slice.call(root.querySelectorAll('p.help, p.muted.help')).forEach(function (p, i) {
      var txt = p.textContent.trim(); if (txt.length < 90 || p.closest('.infotext, .odcard, .pdfsheet, .playerbox') || /^(proxauto|pdfname|odstat)$/.test(p.id)) return;
      var key = p.id || ('i' + i + ':' + txt.slice(0, 24)), id = p.id || ('info-' + key.replace(/[^\w-]/g, '_'));
      // v127: data-infoin="<id>" puts just the ⓘ at the end of that line (no caption) – e.g. the Stats putting "n = …" lines
      var inl = p.getAttribute('data-infoin') && root.querySelector('#' + p.getAttribute('data-infoin'));
      if (inl) { (inl.querySelector('.infoend') || inl).insertAdjacentHTML('beforeend', ' <button type="button" class="infobtn infoin" data-act="info" data-v="' + esc(key) + '" aria-controls="' + id + '" aria-expanded="' + !!infoOpen[key] + '" aria-label="More info"><span>i</span></button>');
        p.classList.add('infotext'); p.hidden = !infoOpen[key]; p.setAttribute('data-info', id); if (!p.id) p.id = id; return; }
      var w = document.createElement('div'); w.className = 'infowrap';
      var short = (txt.match(/^[^.!?–]{8,60}[.!?]?/) || [txt.slice(0, 50)])[0].replace(/[.:–]\s*$/, '');
      w.innerHTML = '<button type="button" class="infobtn" data-act="info" data-v="' + esc(key) + '" aria-controls="' + id + '" aria-expanded="' + !!infoOpen[key] + '" aria-label="More info"><span>i</span></button><span class="infocap">' + esc(short) + '…</span>';
      p.parentNode.insertBefore(w, p); p.classList.add('infotext'); p.hidden = !infoOpen[key]; p.setAttribute('data-info', id); if (!p.id) p.id = id;
    });
  }

  // ---------- PDF round report (on-device, offline: vendor/jspdf.umd.min.js) ----------
  function loadJsPDF() {
    return new Promise(function (res, rej) { if (window.jspdf) return res(); var sc = document.createElement('script'); sc.src = 'vendor/jspdf.umd.min.js'; sc.onload = res; sc.onerror = function () { rej(new Error('Could not load the PDF tool')); }; document.head.appendChild(sc); });
  }
  // SVG string -> crisp PNG (3x) via canvas
  function svgToPng(svg, scale) {
    return new Promise(function (res, rej) {
      var m = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg), w = m ? +m[1] : 360, h = m ? +m[2] : 400; scale = scale || 3;
      if (!/xmlns=/.test(svg)) svg = svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"');
      svg = svg.replace('<svg', '<svg font-family="Helvetica, Arial, sans-serif" width="' + w + '" height="' + h + '"');
      var img = new Image();
      img.onload = function () { var c = document.createElement('canvas'); c.width = w * scale; c.height = h * scale; var x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height); res({ data: c.toDataURL('image/jpeg', 0.72), w: w, h: h }); };
      img.onerror = function () { rej(new Error('map image failed')); };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });
  }
  // Render one of the app's map views for THIS round and pull out its main SVG + stats text
  // All-rounds gradient heat map for the PDF: render the map off-screen, paint the heat layer, then strip what the
  // on-screen CSS would hide (dots, labels) so the SVG stands alone.
  var HEAT_HIDE = '.fwdot, .xdot, .gdot, .mdot, .pdot, .pdot2, .pmend, .xlbl, .plbl, .pmlbl, .mlbl, .farlbl, .xstart, .mcount';
  function heatReport(kind) {
    var keep = { map: view.map, mapScope: view.mapScope, heat: view.heat, proxB: view.proxB, proxLie: view.proxLie, proxReport: view.proxReport, proxGroup: view.proxGroup };
    view.map = kind; view.mapScope = 'all'; view.heat = 'grad'; view.proxReport = false; view.proxGroup = null;
    var box = document.createElement('div'); box.style.cssText = 'position:fixed;left:-10000px;top:0;width:390px'; box.innerHTML = mapHTML(); document.body.appendChild(box);
    var out = { svg: '', lines: [] };
    try {
      var mv = box.querySelector('#mapview'); applyHeat(mv); var svg = mv.querySelector('#' + HEAT_MAPS[kind]);
      if (svg && svg.querySelector('#heatgrad')) { var c = svg.cloneNode(true); c.removeAttribute('class');
        [].slice.call(c.querySelectorAll(HEAT_HIDE)).forEach(function (e) { e.remove(); });
        [].slice.call(c.querySelectorAll('path[fill="none"]')).forEach(function (e) { if (!e.closest('#heatlayer')) e.setAttribute('opacity', '.12'); });
        out.svg = c.outerHTML; }
      var pr = [].slice.call(mv.querySelectorAll('#fwpct .fwpct')); if (pr.length) out.lines.push({ b: true, t: pr.map(function (e) { return { L: 'Left', F: 'Fairway', R: 'Right' }[e.getAttribute('data-k')] + ' ' + e.textContent; }).join('    |    ') + (mv.querySelector('#fwpctnote') ? '   (' + SG.pdfSafe(mv.querySelector('#fwpctnote').textContent) + ')' : '') });
      ['#mapsum', '#fwdrive', '#heatsum'].forEach(function (q) { var e = mv.querySelector(q); if (e && SG.pdfSafe(e.textContent)) out.lines.push({ b: q !== '#heatsum', t: SG.pdfSafe(e.textContent) }); });
    } finally { box.remove(); for (var k in keep) view[k] = keep[k]; }
    return out;
  }
  function mapForReport(kind, extra) {
    var keep = { pmG: view.pmG, proxGroup: view.proxGroup, map: view.map, mapScope: view.mapScope, proxB: view.proxB, proxLie: view.proxLie, puttN: view.puttN, proxReport: view.proxReport };
    view.map = kind; view.mapScope = 'round'; view.proxB = 'all'; view.proxLie = 'all'; view.proxReport = false; view.proxGroup = null; for (var k in (extra || {})) view[k] = extra[k];
    var box = document.createElement('div'); box.innerHTML = mapHTML();
    for (var k2 in keep) view[k2] = keep[k2];
    var svgs = [].slice.call(box.querySelectorAll('svg')).filter(function (e) { return /viewBox="0 0 \d{3}/.test(e.outerHTML.slice(0, 300)); });
    var main = svgs.sort(function (a, b) { return (b.viewBox.baseVal.width * b.viewBox.baseVal.height) - (a.viewBox.baseVal.width * a.viewBox.baseVal.height); })[0];
    var lines = [], txt = function (e) { return SG.pdfSafe(e.textContent); };
    [].slice.call(box.querySelectorAll('.mapsum')).forEach(function (e) { if (txt(e)) lines.push({ b: true, t: txt(e) }); });
    var st = [].slice.call(box.querySelectorAll('.stat')).map(function (e) { return SG.pdfSafe(e.querySelector('span').textContent) + ': ' + SG.pdfSafe(e.querySelector('b').textContent); });
    if (st.length) lines.push({ t: st.join('   |   ') });
    [].slice.call(box.querySelectorAll('table')).forEach(function (t) {
      var rows = [].slice.call(t.rows).map(function (r) { return [].slice.call(r.cells).map(txt); }).filter(function (r) { return r.join(''); });
      if (rows.length) lines.push({ table: rows });
    });
    var legend = [];
    [].slice.call(box.querySelectorAll('.legend:not(.sclegend) > span')).forEach(function (sp) {
      var it = { k: 'none', t: '' }, sw = sp.querySelectorAll('i, svg, b.star'), last = null;
      [].slice.call(sw).forEach(function (e) {
        if (e.tagName.toLowerCase() === 'svg') { it.k = 'diamond'; var pth = e.querySelector('path'); it.c = pth ? pth.getAttribute('fill') : '#888'; return; }
        if (e.classList.contains('star')) { it.k = 'star'; return; }
        var st = e.getAttribute('style') || '', bg = (/background:\s*(#[0-9a-f]{3,6})/i.exec(st) || [])[1], bd = (/border:\s*\d+px solid (#[0-9a-f]{3,6})/i.exec(st) || /border-color:\s*(#[0-9a-f]{3,6})/i.exec(st) || [])[1];
        if (e.classList.contains('ln')) { if (it.k === 'none') { it.k = e.classList.contains('dash') ? 'dash' : 'ln'; it.c = bg || '#e0102a'; } }
        else if (e.classList.contains('dot')) { it.k = e.classList.contains('num') ? 'num' : (bg && bg.toLowerCase() === '#fff' && bd && bd.toLowerCase() !== '#000' ? 'ring' : (it.k === 'ln' ? 'lndot' : 'dot')); it.c = bg || '#000'; it.b = bd || '#000'; it.n = e.textContent; }
        else if (e.classList.contains('sw')) { it.k = 'sw'; it.c = bg || '#888'; it.b = bd; }
      });
      it.t = SG.pdfSafe(sp.textContent.replace(/^\s*[?★\d]?\s*/, '')); if (it.k === 'none' && /^x\S/.test(it.t)) { it.k = 'txt'; it.c = 'x'; it.t = it.t.slice(1); }
      if (it.t) legend.push(it);
    });
    return { svg: main ? main.outerHTML : '', lines: lines, legend: legend };
  }
  // ONE pin-location page: big green with the 3x3 grid; each segment with a pin shows a badge + mini plots
  function pinReportSVG(segs) {
    // each segment: dark rough cell, light-green ring = putting surface around that segment's pin
    var W = 560, H = 650, gx = 10, gy = 30, cw = 180, ch = 196, R = 40, o = '<svg viewBox="0 0 ' + W + ' ' + H + '"><rect width="' + W + '" height="' + H + '" fill="#fff"/>' +
      '<rect x="' + gx + '" y="' + gy + '" width="' + cw * 3 + '" height="' + ch * 3 + '" rx="30" fill="#2f6b2a" stroke="#123d10" stroke-width="4"/>';
    for (var i = 1; i < 3; i++) o += '<line x1="' + (gx + cw * i) + '" y1="' + gy + '" x2="' + (gx + cw * i) + '" y2="' + (gy + ch * 3) + '" stroke="#fff" stroke-opacity=".5" stroke-dasharray="6 5"/><line x1="' + gx + '" y1="' + (gy + ch * i) + '" x2="' + (gx + cw * 3) + '" y2="' + (gy + ch * i) + '" stroke="#fff" stroke-opacity=".5" stroke-dasharray="6 5"/>';
    var by = {}; segs.forEach(function (s) { by[s.pin] = s; });
    var LN = { rough: 'Rough', deep: 'Deep rough', fairway: 'Fairway', sand: 'Bunker', bunker: 'Bunker', trees: 'Trees', hazard: 'Hazard', ob: 'OB', recovery: 'Trees', green: 'Green' };
    SG.PIN_GRID.forEach(function (row, ri) { row.forEach(function (id, ci) {
      var s = by[id], x0 = gx + cw * ci, y0 = gy + ch * ri;
      if (!s) { o += '<text x="' + (x0 + cw / 2) + '" y="' + (y0 + ch / 2) + '" text-anchor="middle" font-size="10" fill="#fff" fill-opacity=".55">' + SG.PIN_NAME[id] + ' – no pins</text>'; return; }
      var cx = x0 + cw / 2, cy = y0 + 24 + (ch - 24) / 2, out = Math.min(cw / 2, (ch - 24) / 2) - R - 16, boxes = [], seen = {};
      var onRing = function (bb) { var nx = Math.max(bb[0], Math.min(cx, bb[2])), ny = Math.max(bb[1], Math.min(cy, bb[3])); return Math.hypot(nx - cx, ny - cy) < R + 1; };
      var lbl = function (x, y, t, ang) { var w = t.length * 4.6 + 4, cand = [[7, 3], [-7 - w, 3], [-w / 2, -7], [-w / 2, 15], [7, 13], [-7 - w, 13], [7, -7], [-7 - w, -7], [-w / 2, 25]], b = null;
        cand.some(function (c) { var bb = [x + c[0], y + c[1] - 8, x + c[0] + w, y + c[1] + 2]; if (bb[0] < x0 + 2 || bb[2] > x0 + cw - 2 || bb[1] < y0 + 24 || bb[3] > y0 + ch - 2) return false;
          if (onRing(bb) || boxes.some(function (q) { return bb[0] < q[2] && bb[2] > q[0] && bb[1] < q[3] && bb[3] > q[1]; })) return false; b = bb; return true; });
        var lead = '';
        if (!b) { [16, 24, 34, 46, 60].some(function (d) { return [0, 30, -30, 60, -60, 90, -90, 120, -120, 150, -150, 180].some(function (da) { var e = pt(x, y, d, (ang == null ? 270 : ang) + da); return [[0, 0], [-w, 0], [-w / 2, -4], [-w / 2, 8]].some(function (c) {
            var bb = [e[0] + c[0], e[1] + c[1] - 4, e[0] + c[0] + w, e[1] + c[1] + 6]; if (bb[0] < x0 + 2 || bb[2] > x0 + cw - 2 || bb[1] < y0 + 24 || bb[3] > y0 + ch - 2) return false;
            if (onRing(bb) || boxes.some(function (q) { return bb[0] < q[2] && bb[2] > q[0] && bb[1] < q[3] && bb[3] > q[1]; })) return false;
            b = bb; lead = '<line class="pleader" x1="' + f1(x) + '" y1="' + f1(y) + '" x2="' + f1(Math.max(bb[0], Math.min(bb[2], x))) + '" y2="' + f1(Math.max(bb[1], Math.min(bb[3], y))) + '" stroke="#fff" stroke-width=".8"/>'; return true; }); }); }); }
        if (!b) return ''; boxes.push(b); return lead + '<text class="pminilbl" x="' + f1(b[0] + 2) + '" y="' + f1(b[3] - 2) + '" font-size="8" font-weight="800" fill="#fff" stroke="#123d10" stroke-width="2.5" paint-order="stroke">' + esc(t) + '</text>'; };
      o += '<circle cx="' + f1(cx) + '" cy="' + f1(cy) + '" r="' + R + '" fill="#8fd66f" stroke="#e8f8e0" stroke-width="2"/>' +
        '';
      // the pin sits where it really is on the green (front = bottom); everything is plotted from it
      var px = cx + (ci - 1) * R * 0.5, py = cy + (ri - 1) * R * 0.5;
      o += '<circle cx="' + f1(px) + '" cy="' + f1(py) + '" r="' + R / 2 + '" fill="none" stroke="#fff" stroke-opacity=".7" stroke-dasharray="3 3"/>';
      var dots = '', labs = '', pend = [];
      s.list.forEach(function (h, j) {
        var key = (h.gir ? 'g' : 'm') + (h.dir || '?'), k = seen[key] = (seen[key] || 0) + 1, ang = (h.dir ? SG.DIR_ANGLE[h.dir] : 270) + (k - 1) * 14, q, t = '';
        if (h.gir) { var rr = h.holed ? 0 : Math.min(h.ft || 0, 40) / 40 * (R - 5); q = pt(px, py, rr, ang); var gd = Math.hypot(q[0] - cx, q[1] - cy); if (gd > R - 5) q = [cx + (q[0] - cx) * (R - 5) / gd, cy + (q[1] - cy) * (R - 5) / gd];
          dots += '<circle class="pmini" data-gir="1" cx="' + f1(q[0]) + '" cy="' + f1(q[1]) + '" r="4" fill="#fff" stroke="#000" stroke-width="1.5"/>'; }
        else { var yd = h.ob ? null : h.yd, cap = yd == null || yd > 30, u = pt(0, 0, 1, ang), dx = px - cx, dy = py - cy, pu = dx * u[0] + dy * u[1], edge = -pu + Math.sqrt(pu * pu - dx * dx - dy * dy + R * R);
          var rr2 = edge + 6 + (yd == null ? out : Math.min(yd, 30) / 30 * out); q = pt(px, py, rr2, ang);
          var qc = [Math.max(x0 + 6, Math.min(x0 + cw - 6, q[0])), Math.max(y0 + 28, Math.min(y0 + ch - 6, q[1]))]; if (qc[0] !== q[0] || qc[1] !== q[1]) { cap = true; q = qc; }
          dots += '<circle class="pmini" data-gir="0" data-r="' + f1(rr2) + '" cx="' + f1(q[0]) + '" cy="' + f1(q[1]) + '" r="4.5" fill="#e0102a" stroke="#fff" stroke-width="1.5"/>';
          t = h.ob ? 'OB' : (h.dir ? '' : '? ') + (Math.round(yd * 10) / 10) + ' yd' + (cap ? ' ›' : '') + ' ' + (LN[h.lie] || h.lie || 'Off green'); }
        if (t) pend.push([q[0], q[1], t, ang]);
        boxes.push([q[0] - 5, q[1] - 5, q[0] + 5, q[1] + 5]);
      });
      pend.forEach(function (p) { labs += lbl(p[0], p[1], p[2], p[3]); });
      o += '<circle class="ppin" cx="' + f1(px) + '" cy="' + f1(py) + '" r="2.5" fill="#000"/><line x1="' + f1(px) + '" y1="' + f1(py) + '" x2="' + f1(px) + '" y2="' + f1(py - 13) + '" stroke="#000" stroke-width="1.8"/><path d="M' + f1(px) + ' ' + f1(py - 13) + ' l8 3 l-8 3z" fill="#d0213a"/>' + dots + labs;
      var bt = SG.PIN_NAME[id] + ' · ' + s.holes + ' hole' + (s.holes === 1 ? '' : 's') + ' · GIR ' + s.gir + '/' + s.holes, bw = bt.length * 5.2 + 12;
      o += '<g class="pbadge" data-pin="' + id + '"><rect x="' + f1(cx - bw / 2) + '" y="' + f1(y0 + 5) + '" width="' + f1(bw) + '" height="16" rx="8" fill="#000" fill-opacity=".8"/><text x="' + f1(cx) + '" y="' + f1(y0 + 17) + '" text-anchor="middle" font-size="9.5" font-weight="800" fill="#fff">' + bt + '</text></g>';
    }); });
    return o + '<text x="280" y="20" text-anchor="middle" font-size="13" font-weight="800">BACK OF GREEN</text><text x="280" y="640" text-anchor="middle" font-size="13" font-weight="800">FRONT (toward you)</text></svg>';
  }
  function reportData(r) {
    var bl = blOf(r), S = SG.summarize(r, bl), tp = SG.threePutts(S.puttList);
    return { r: r, bl: bl, S: S, three: tp };
  }
  // ---------- v144 PDF pages: Round takeaway (round report), My Game + My Practice (stats report) ----------
  // H = { M, PW, PH, font(sz), ink(g), T(text, x, y, opts), header(title) → y }. Light type, the app's colours.
  function pdfWrap(doc, H, t, w, sz) { H.font(sz); return doc.splitTextToSize(SG.pdfSafe(t), w); }
  function pdfLines(doc, H, t, x, y, w, sz, g, lh) { var L = pdfWrap(doc, H, t, w, sz); H.ink(g); L.forEach(function (s, i) { H.T(s, x, y + i * (lh || sz * 1.3)); }); H.ink(); return y + L.length * (lh || sz * 1.3); }
  function pdfRGB(hex) { var v = parseInt(hex.slice(1), 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255]; }
  function pdfSgColor(doc, v) { var c = v > 0.004 ? [31, 122, 68] : v < -0.004 ? [192, 68, 47] : [60, 60, 60]; doc.setTextColor(c[0], c[1], c[2]); }
  // the radar SVGs use a viewBox centred on 0,0 – move it to 0,0 for svgToPng
  function radarPng(svg) {
    var m = /viewBox="([-\d.]+) ([-\d.]+) ([\d.]+) ([\d.]+)"/.exec(svg); if (!m) return svgToPng(svg, 3);
    var out = svg.replace(m[0], 'viewBox="0 0 ' + m[3] + ' ' + m[4] + '"').replace(/(<svg[^>]*>)/, '$1<g transform="translate(' + (-m[1]) + ',' + (-m[2]) + ')">').replace(/<\/svg>$/, '</g></svg>');
    return svgToPng(out, 3);
  }
  // four "How well Strokewise knows your game" bars, one row; returns the next y
  function pdfKnowBars(doc, H, P, x, y, w) {
    H.font(9.5); H.ink(90); H.T('How well Strokewise knows your game · ' + P.readyCount + '/4 ready', x, y); H.ink(); y += 10;
    var gap = 12, bw = (w - 3 * gap) / 4;
    INSIGHTS.AREAS.forEach(function (a, i) { var p = P[a.k], bx = x + i * (bw + gap);
      H.font(8); H.ink(p.ready ? 30 : 90); H.T(a.short + (p.ready ? ' - ready' : ' ' + Math.round(p.frac * 100) + '%'), bx, y + 8); H.ink();
      doc.setFillColor(226, 231, 226); doc.roundedRect(bx, y + 12, bw, 5, 2.5, 2.5, 'F');
      var c = p.ready ? [31, 157, 85] : [200, 150, 46]; if (p.frac > 0) { doc.setFillColor(c[0], c[1], c[2]); doc.roundedRect(bx, y + 12, Math.max(5, bw * p.frac), 5, 2.5, 2.5, 'F'); } });
    return y + 30;
  }
  function pdfTakeawayPage(doc, H, r) {
    var T = INSIGHTS.build(r, takeawayHistory(r), SG, { baselineName: SG.baseline(blOf(r)).name }), M = H.M, W = H.PW - 2 * M, y = H.header('Round takeaway');
    y = pdfKnowBars(doc, H, T.progress, M, y, W) + 6;
    if (!T.ok) { pdfLines(doc, H, T.reason, M, y, W, 11, 60); return; }
    y = pdfLines(doc, H, T.headline, M, y + 6, W, 17, 25, 21) + 2;
    if (T.lede) y = pdfLines(doc, H, T.lede, M, y, W, 11, 80, 14.5) + 10;
    var F = T.focus;
    if (F) { // the dark green Work on next box
      var pad = 14, iw = W - 2 * pad, tl = pdfWrap(doc, H, F.title, iw, 15), xl = pdfWrap(doc, H, F.text, iw, 10.5), bl = pdfWrap(doc, H, F.basis.text, iw, 9), dl = pdfWrap(doc, H, 'Try: ' + F.drill, iw - 16, 10);
      var bh = pad + 12 + tl.length * 18 + 4 + xl.length * 13.5 + 4 + bl.length * 11.5 + 10 + dl.length * 13 + 14 + pad;
      doc.setFillColor(16, 59, 36); doc.roundedRect(M, y, W, bh, 10, 10, 'F');
      var yy = y + pad + 8; H.font(8.5); doc.setTextColor(244, 210, 138); H.T('WORK ON NEXT', M + pad, yy); yy += 6;
      H.font(15); doc.setTextColor(255); tl.forEach(function (s) { yy += 18; H.T(s, M + pad, yy); }); yy += 4;
      H.font(10.5); doc.setTextColor(230, 236, 232); xl.forEach(function (s) { yy += 13.5; H.T(s, M + pad, yy); }); yy += 4;
      H.font(9); doc.setTextColor(F.basis.mine ? 159 : 200, F.basis.mine ? 224 : 210, F.basis.mine ? 181 : 204); bl.forEach(function (s) { yy += 11.5; H.T(s, M + pad, yy); }); yy += 10;
      doc.setFillColor(40, 82, 58); doc.roundedRect(M + pad, yy, iw, dl.length * 13 + 12, 6, 6, 'F');
      H.font(10); doc.setTextColor(255); dl.forEach(function (s, i) { H.T(s, M + pad + 8, yy + 15 + i * 13); }); H.ink();
      y += bh + 16;
    }
    // the four areas, two per row
    var cw = (W - 12) / 2;
    for (var i = 0; i < T.tiles.length; i += 2) {
      var row = T.tiles.slice(i, i + 2), hs = row.map(function (t) { return 34 + pdfWrap(doc, H, t.text, cw - 20, 9.5).length * 12.5 + 10; }), rh = Math.max.apply(null, hs);
      row.forEach(function (t, k) { var x = M + k * (cw + 12);
        doc.setDrawColor(214, 220, 226); doc.setLineWidth(0.6); doc.roundedRect(x, y, cw, rh, 6, 6, 'S'); doc.setDrawColor(0);
        H.font(11); H.ink(30); H.T(t.name, x + 10, y + 17); H.font(10); pdfSgColor(doc, t.sg); H.T(fmtSG(t.sg) + ' SG', x + cw - 10, y + 17, { align: 'right' });
        if (t.norm != null) { H.font(8); H.ink(110); H.T('usually ' + fmtSG(t.norm), x + cw - 10, y + 28, { align: 'right' }); }
        H.ink(); pdfLines(doc, H, t.text, x + 10, y + 42, cw - 20, 9.5, 70, 12.5); });
      y += rh + 10;
    }
    if (T.good.length) { y += 4; H.font(10.5); doc.setTextColor(31, 122, 68); H.T('Went well:', M, y); H.ink(); pdfLines(doc, H, T.good.join(', ') + '.', M + 58, y, W - 58, 10.5, 50); }
  }
  // My Game + My Practice pages for the stats report (the player's chosen My Game time frame)
  function pdfMyGamePages(doc, H, who) {
    if (!who) return Promise.resolve();
    var D = mgData(who), P = D.period, M = H.M, W = H.PW - 2 * M, logs = practiceOf(who), PB = MYGAME.practiceBuild(logs, { period: P.id });
    if (!D.cur.rounds && !PB.cur.total) return Promise.resolve();
    doc.addPage(); var y = H.header('My Game – ' + P.name);
    H.font(10); H.ink(90); H.T(who + ' · ' + D.cur.rounds + ' round' + (D.cur.rounds === 1 ? '' : 's') + ' · compared with ' + D.baselineName + (D.prev ? ' · gray = ' + (P.id === '1y' ? 'the year before' : 'the previous ' + P.short) : ''), M, y); H.ink(); y += 22;
    y = pdfLines(doc, H, D.headline, M, y, W, 17, 25, 21) + 2;
    y = pdfLines(doc, H, D.lede, M, y, W, 11, 80, 14.5) + 8;
    var gy = y, gw = 380, gh = gw * 264 / 344, pg = doc.getCurrentPageInfo().pageNumber; y += gh + 10;
    var Tn = D.cur.tiles, Q = D.prev && D.prev.tiles, n1 = function (v) { return (Math.round(v * 10) / 10).toFixed(1); };
    var tiles = [['Avg score (18 holes)', Tn.score, Q && Q.score, n1, -1], ['Strokes gained / round', Tn.sg, Q && Q.sg, function (v) { return MYGAME.fmt(v); }, 1],
      ['Putts / round', Tn.putts, Q && Q.putts, n1, -1], ['Greens in regulation', Tn.gir, Q && Q.gir, function (v) { return Math.round(v) + '%'; }, 1]], tw = (W - 3 * 10) / 4;
    tiles.forEach(function (t, i) { var x = M + i * (tw + 10);
      doc.setDrawColor(214, 220, 226); doc.setLineWidth(0.6); doc.roundedRect(x, y, tw, 62, 6, 6, 'S'); doc.setDrawColor(0);
      H.font(8.5); H.ink(100); H.T(t[0], x + 8, y + 15); H.font(18); H.ink(25); H.T(t[1] == null ? '-' : t[3](t[1]), x + 8, y + 37);
      if (t[1] != null && t[2] != null) { var d = t[1] - t[2], good = t[4] > 0 ? d > 0 : d < 0, tiny = Math.abs(d) < 0.05; H.font(8.5);
        if (tiny) H.ink(100); else if (good) doc.setTextColor(31, 122, 68); else doc.setTextColor(192, 68, 47);
        H.T(tiny ? 'same as before' : (d > 0 ? 'up ' : 'down ') + t[3](Math.abs(d)).replace(/^\+/, '') + ' from ' + t[3](t[2]), x + 8, y + 53); } H.ink(); });
    y += 76;
    y = pdfLines(doc, H, 'Each spoke is strokes gained per 18 holes in one skill: Driving (par 4 and 5 tee shots), Irons 100+ (approach shots from over 100 yd), Wedges (30-100 yd), Chipping (30 yd and in), Lag putts (10 ft and over), Short putts (under 10 ft). The six add up to the total. Further out = better; the dashed line is the ' + D.baselineName + ' average. A hollow point is still learning.', M, y, W, 8.5, 110, 10.8);
    return radarPng(MYGAME.radarSVG(D.cur, D.prev, { R: 96 })).then(function (im) {
      var back = doc.getCurrentPageInfo().pageNumber; doc.setPage(pg); doc.addImage(im.data, 'JPEG', M + (W - gw) / 2, gy, gw, gh); doc.setPage(back);
      // ---- My Practice ----
      doc.addPage(); var y2 = H.header('My Practice – ' + P.name);
      y2 = pdfLines(doc, H, PB.headline, M, y2, W, 17, 25, 21) + 2;
      y2 = pdfLines(doc, H, PB.lede, M, y2, W, 11, 80, 14.5) + 8;
      var jobs = [];
      if (PB.cur.total || PB.prev) { var py = y2, pw = 300, ph = pw * 264 / 344, pp = doc.getCurrentPageInfo().pageNumber; y2 += ph + 8;
        jobs.push(radarPng(MYGAME.practiceSVG(PB.cur, PB.prev, { R: 96 })).then(function (im2) { var b2 = doc.getCurrentPageInfo().pageNumber; doc.setPage(pp); doc.addImage(im2.data, 'JPEG', M + (W - pw) / 2, py, pw, ph); doc.setPage(b2); }));
        H.font(8.5); H.ink(100); H.T('Blue = ' + P.name.toLowerCase() + (PB.prev ? ' · gray = ' + (P.id === '1y' ? 'the year before' : 'the previous ' + P.short) : '') + ' · the busiest skill reaches the edge', M + W / 2, y2, { align: 'center' }); H.ink(); y2 += 18; }
      var V = MYGAME.practiceVsGame(D.cur, PB.cur);
      if (V) {
        H.font(12.5); H.ink(30); H.T('Strokes lost vs practice time', M, y2); y2 += 16;
        y2 = pdfLines(doc, H, V.headline + ' – ' + V.lede, M, y2, W, 10, 70, 13) + 8;
        var lx = M + 110, bw = W - 110 - 44;
        V.rows.forEach(function (rw) {
          var gapRow = rw.k === V.gap.k && V.gap.lostShare - V.gap.timeShare >= 0.15; H.font(9.5); if (gapRow) doc.setTextColor(192, 68, 47); else H.ink(40); H.T(rw.name, M, y2 + 9); H.ink();
          [[rw.lostShare, [226, 112, 92]], [rw.timeShare, [47, 111, 201]]].forEach(function (b, j) { var by = y2 + j * 10;
            doc.setFillColor(232, 236, 232); doc.roundedRect(lx, by, bw, 6, 3, 3, 'F'); if (b[0] > 0) { doc.setFillColor(b[1][0], b[1][1], b[1][2]); doc.roundedRect(lx, by, Math.max(6, bw * b[0]), 6, 3, 3, 'F'); }
            H.font(8); H.ink(100); H.T(Math.round(b[0] * 100) + '%', M + W, by + 6, { align: 'right' }); H.ink(); });
          y2 += 26; });
        H.font(8.5); doc.setTextColor(226, 112, 92); H.T('Share of strokes lost', lx, y2 + 2); doc.setTextColor(47, 111, 201); H.T('Share of practice time', lx + 130, y2 + 2); H.ink(); y2 += 20;
      }
      var recent = logs.filter(function (e) { var t = Date.parse(e.date), w = MYGAME.windows(P.id).cur; return t >= w[0] && t < w[1]; }).sort(function (a, b) { return b.date.localeCompare(a.date) || b.id.localeCompare(a.id); }).slice(0, 12);
      if (recent.length && y2 < H.PH - 140) {
        H.font(12.5); H.ink(30); H.T('Practice log', M, y2); y2 += 16;
        recent.forEach(function (e) { if (y2 > H.PH - 60) return; var sp = MYGAME.SPOKES.filter(function (x) { return x.k === e.spoke; })[0];
          H.font(9.5); H.ink(50); H.T(new Date(Date.parse(e.date)).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), M, y2); H.T(e.focus || sp.name, M + 60, y2); H.ink(110); H.T(sp.name, M + 280, y2);
          H.ink(40); H.T(MYGAME.hm(e.min), M + W, y2, { align: 'right' }); H.ink(); doc.setDrawColor(230); doc.setLineWidth(0.4); doc.line(M, y2 + 5, M + W, y2 + 5); doc.setDrawColor(0); y2 += 16; });
      }
      return Promise.all(jobs);
    });
  }
  function makeReport() {
    var r = round(); if (!r) return Promise.reject(new Error('No round'));
    var R = reportData(r), S = R.S, P = SG.pdfSafe, player = playerName() || r.player || '', dateTxt = new Date(r.date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    return Promise.all([loadJsPDF(), roundCover(r)]).then(function (pre) {
      var doc = new window.jspdf.jsPDF({ unit: 'pt', format: 'letter', orientation: 'portrait' }), M = 36, PW = 612, PH = 792, y;
      doc.setProperties({ title: 'Strokewise round report – ' + (r.course || '') + ' ' + dateTxt, author: player, creator: 'Strokewise' });
      doc.addImage(pre[1].data, 'JPEG', 0, 0, PW, PH); doc.addPage(); // v137 cover, the Instagram-picture look
      // v109: every bit of text is logged (page, left / right edge) so a test can check nothing runs past the right margin
      var LAY = [], TABS = [], txt0 = doc.text.bind(doc);
      doc.text = function (t, x, yy, o) {
        var L = Array.isArray(t) ? t : [t], al = (o && o.align) || 'left', lh = doc.getFontSize() * doc.getLineHeightFactor(), pg = doc.getCurrentPageInfo().pageNumber;
        L.forEach(function (s, k) { var w = doc.getTextWidth(String(s)), x0 = al === 'right' ? x - w : al === 'center' ? x - w / 2 : x; if (String(s).trim()) LAY.push({ p: pg, t: String(s), x0: x0, x1: x0 + w, y: yy + k * lh }); });
        return txt0(t, x, yy, o);
      };
      var T = function (t, x, yy, o) { doc.text(P(t), x, yy, o); };
      // light type only: Helvetica normal everywhere (no bold), headings just a little darker / bigger
      var font = function (sz) { doc.setFont('helvetica', 'normal'); doc.setFontSize(sz); };
      var ink = function (g) { doc.setTextColor(g == null ? 30 : g); };
      var header = function (title) {
        font(9); ink(110); T((player ? player + ' · ' : '') + (r.course || 'Round') + ' · ' + dateTxt, M, 26); T('Strokewise', PW - M, 26, { align: 'right' });
        font(16); ink(25); T(title, M, 54); doc.setDrawColor(190); doc.setLineWidth(0.6); doc.line(M, 63, PW - M, 63); doc.setDrawColor(0); ink(); return 84;
      };
      var heading = function (t, x, yy) { font(11.5); ink(40); T(t, x, yy); ink(); };
      // v109 table: one column list (x, width, align) used for the header AND every row, so a header sits right over its numbers.
      // Number columns are right-aligned (header too, same right edge); text columns left-aligned. Widths shrink to fit inside the margins.
      // rows[0] = header. opt: fs, rh, align: ['left'|'right'|'center' ...], group(row), cont (title for an overflow page), clip, bfs (body font size)
      var NUMRE = /^[-+]?[\d.,/ %()]*( ?(ft|yd))?$|^[-\u2013]$|^$/;
      var table = function (rows, x, yy, widths, opt) {
        opt = opt || {}; var rh = opt.rh || 16, fs = opt.fs || 10, bfs = opt.bfs || fs, isG = function (row) { return !!(opt.group && opt.group(row)); };
        var room = PW - M - x, tot = widths.reduce(function (a, b) { return a + b; }, 0), k = tot > room ? room / tot : 1, cx = x;
        var cols = rows[0].map(function (h, j) {
          var w = (widths[j] || 60) * k, body = rows.slice(1).filter(function (rw) { return !isG(rw); }).map(function (rw) { return String(rw[j] == null ? '' : rw[j]); });
          var al = (opt.align && opt.align[j]) || (j > 0 && body.length && body.every(function (c) { return NUMRE.test(c); }) && body.some(function (c) { return /\d/.test(c); }) ? 'right' : 'left');
          var c = { x: cx, w: w, align: al, at: al === 'right' ? cx + w - 5 : al === 'center' ? cx + w / 2 : cx + 5 }; cx += w; return c;
        });
        var TW = cx - x, rec = { p: 0, x: x, w: TW, cols: cols, cells: [] }; TABS.push(rec);
        var fit = function (s, w) { s = P(s); while (s.length > 2 && doc.getTextWidth(s) > w - 8) s = s.slice(0, -3) + '..'; return s; };
        var cell = function (s, j, yb, hdr) { var c = cols[j]; doc.text(s, c.at, yb, c.align === 'left' ? undefined : { align: c.align });
          var w = doc.getTextWidth(String(s)); if (Array.isArray(s)) w = Math.max.apply(null, s.map(function (q) { return doc.getTextWidth(q); }));
          var x0 = c.align === 'right' ? c.at - w : c.align === 'center' ? c.at - w / 2 : c.at; rec.cells.push({ p: doc.getCurrentPageInfo().pageNumber, row: hdr ? 0 : 1, col: j, x0: x0, x1: x0 + w }); };
        var drawHead = function () {
          font(fs * 0.92); var L = rows[0].map(function (h, j) { return doc.splitTextToSize(P(h), cols[j].w - 9).slice(0, 2); }), n = Math.max.apply(null, L.map(function (l) { return l.length; }));
          var hh = rh + (n - 1) * fs; doc.setFillColor(238, 241, 238); doc.roundedRect(x, yy - rh + 4, TW, hh, 3, 3, 'F'); ink(85);
          L.forEach(function (l, j) { if (l.length) cell(l, j, yy, true); }); ink(); yy += hh; rec.p = rec.p || doc.getCurrentPageInfo().pageNumber;
        };
        var stop = false; drawHead();
        rows.slice(1).forEach(function (row) {
          if (stop) return;
          if (yy + rh > PH - M - 14) { if (opt.clip) { stop = true; return; } doc.addPage(); yy = header(opt.cont || 'continued'); drawHead(); }
          var g = isG(row); if (g) { doc.setFillColor(248, 249, 248); doc.rect(x, yy - rh + 4, TW, rh, 'F'); }
          font(g ? fs : bfs); ink(g ? 60 : 30);
          row.forEach(function (c, j) { if (j < cols.length && String(c == null ? '' : c) !== '') cell(fit(c, cols[j].w), j, yy, false); });
          doc.setDrawColor(228); doc.setLineWidth(0.4); doc.line(x, yy + 4, x + TW, yy + 4); doc.setDrawColor(0); ink();
          yy += rh;
        });
        return yy;
      };
      // wrapped note text that always stays inside the margins
      var note = function (t, x, yy, w, sz) { font(sz || 8); ink(100); var L = doc.splitTextToSize(P(t), w || PW - M - x); doc.text(L, x, yy); ink(); return yy + L.length * (sz || 8) * 1.25 + 4; };
      var rgb = function (h) { h = (h || '#000').replace('#', ''); if (h.length === 3) h = h.replace(/./g, '$&$&'); var c = parseInt(h, 16); return [(c >> 16) & 255, (c >> 8) & 255, c & 255]; };
      var swatch = function (it, x, y) { // x,y = left / vertical middle of a 22pt swatch box
        var f = function (c) { var v = rgb(c); doc.setFillColor(v[0], v[1], v[2]); }, d = function (c) { var v = rgb(c); doc.setDrawColor(v[0], v[1], v[2]); };
        doc.setLineDashPattern([], 0);
        if (it.k === 'ln' || it.k === 'lndot') { d(it.c); doc.setLineWidth(3); doc.line(x, y, x + (it.k === 'lndot' ? 14 : 22), y); if (it.k === 'lndot') { f(it.c); d('#000'); doc.setLineWidth(1); doc.circle(x + 17, y, 4, 'FD'); } }
        else if (it.k === 'dash') { d(it.c); doc.setLineWidth(2); doc.setLineDashPattern([4, 2], 0); doc.line(x, y, x + 22, y); doc.setLineDashPattern([], 0); }
        else if (it.k === 'dot' || it.k === 'num') { f(it.c); d(it.b || '#000'); doc.setLineWidth(1.2); doc.circle(x + 8, y, 5, 'FD'); if (it.k === 'num' && it.n) { doc.setTextColor(255); font(6, true); T(it.n, x + 8, y + 2, { align: 'center' }); doc.setTextColor(0); } }
        else if (it.k === 'ring') { f('#fff'); d(it.b); doc.setLineWidth(2.2); doc.circle(x + 8, y, 4.6, 'FD'); }
        else if (it.k === 'ringx') { f('#fff'); d(it.c); doc.setLineWidth(2); doc.circle(x + 8, y, 5, 'FD'); d('#000'); doc.setLineWidth(1.2); doc.line(x + 5.6, y - 2.4, x + 10.4, y + 2.4); doc.line(x + 5.6, y + 2.4, x + 10.4, y - 2.4); }
        else if (it.k === 'sw') { f(it.c); d(it.b || '#555'); doc.setLineWidth(0.5); doc.rect(x, y - 5, 22, 10, 'FD'); }
        else if (it.k === 'diamond') { f(it.c || '#888'); d('#000'); doc.setLineWidth(1); doc.lines([[6, 6], [-6, 6], [-6, -6], [6, -6]], x + 8, y - 6, [1, 1], 'FD', true); doc.setTextColor(255); font(7, true); T('?', x + 8, y + 2.5, { align: 'center' }); doc.setTextColor(0); }
        else if (it.k === 'star') { f('#ffd23f'); d('#1e6fd9'); doc.setLineWidth(1); var pts = []; for (var a = 0; a < 10; a++) { var rr = a % 2 ? 2.4 : 6, an = -Math.PI / 2 + a * Math.PI / 5; pts.push([x + 8 + rr * Math.cos(an), y + rr * Math.sin(an)]); }
          doc.lines(pts.slice(1).map(function (p, k) { return [p[0] - pts[k][0], p[1] - pts[k][1]]; }), pts[0][0], pts[0][1], [1, 1], 'FD', true); }
        else if (it.k === 'pin') { d('#000'); doc.setLineWidth(1.2); doc.line(x + 8, y + 5, x + 8, y - 6); f('#d0213a'); doc.triangle(x + 8, y - 6, x + 15, y - 3.5, x + 8, y - 1, 'F'); f('#000'); doc.circle(x + 8, y + 5, 1.6, 'F'); }
        else if (it.k === 'dring') { d('#555'); doc.setLineWidth(1); doc.setLineDashPattern([2, 2], 0); doc.circle(x + 11, y, 5.5, 'S'); doc.setLineDashPattern([], 0); }
        else if (it.k === 'txt') { font(11, true); T(it.c, x + 8, y + 4, { align: 'center' }); }
        else if (it.k === 'badge') { f('#222'); doc.roundedRect(x, y - 5, 22, 10, 5, 5, 'F'); }
        doc.setLineWidth(1); doc.setDrawColor(0);
      };
      var legendBox = function (items, x, y, w, cols) {
        if (!items || !items.length) return y;
        font(9, true); T('Legend', x, y); y += 6; var cw2 = (w - (cols - 1) * 10) / cols, col = 0, rowH = 0, y0 = y;
        items.forEach(function (it) { font(8); var tl = doc.splitTextToSize(P(it.t), cw2 - (it.k === 'none' ? 0 : 28)), hh = Math.max(14, tl.length * 9.5 + 4), xx = x + col * (cw2 + 10);
          if (it.k !== 'none') swatch(it, xx, y0 + 7); font(8); doc.text(tl, xx + (it.k === 'none' ? 0 : 28), y0 + 10); rowH = Math.max(rowH, hh);
          if (++col >= cols) { col = 0; y0 += rowH; rowH = 0; } });
        return y0 + rowH + 14;
      };
      // ---- Page 1: round summary + round stats (the same rows as the Round stats screen) ----
      var grab = function (html) { var d = document.createElement('div'); d.innerHTML = html; return d; };
      var tx = function (el) { return el ? el.textContent.replace(/\s+/g, ' ').trim() : ''; };
      y = header('Round summary');
      font(12); ink(30); T((player || 'Player') + ' – ' + (r.course || 'Round'), M, y); font(10); ink(100); T(dateTxt + ' · compared with ' + blName(R.bl), M, y + 16); ink(); y += 40;
      var top = grab(rsTopHTML(r, S)), thr = top.querySelector('#rs-thru'), topV = [].map.call(top.querySelectorAll('td'), function (td) {
        var c = td.cloneNode(true), s = c.querySelector('small'); if (s) s.remove(); return tx(c) + (td === (thr && thr.parentNode) ? ' (' + tx(thr) + ')' : ''); });
      y = table([[].map.call(top.querySelectorAll('th'), tx).concat(['Strokes gained'])].concat([topV.concat([S.holesDone ? fmtSG(S.sgTotal) : '-'])]), M, y, [108, 108, 108, 108, 108],
        { align: ['center', 'center', 'center', 'center', 'center'], fs: 9.5, bfs: 17, rh: 26 }) + 14;
      heading('Quick view', M, y); y += 16;
      var qv = grab(quickViewHTML(S));
      y = table([['', 'Result', 'Detail', 'SG']].concat([].map.call(qv.querySelectorAll('.qv'), function (q) {
        return [tx(q.querySelector('.qvl')), tx(q.querySelector('b')), tx(q.querySelector('small')), tx(q.querySelector('em')).replace(/\s*SG$/, '')]; })), M, y, [150, 90, 210, 90], { align: ['left', 'right', 'left', 'right'] }) + 14;
      heading('Round stats', M, y); y += 16;
      var keepStx = view.stx; view.stx = {}; var st = grab(statTilesHTML(S)); view.stx = keepStx;
      var srows = [].map.call(st.querySelectorAll('.stxh'), function (b) { return [tx(b.querySelector('span')), tx(b.querySelector('b'))]; });
      srows.push(['3-putt holes', R.three.three + ' of ' + R.three.holes]);
      y = table([['Stat', 'This round']].concat(srows), M, y, [300, 240], { align: ['left', 'right'] }) + 6;
      y = note('Proximity = average distance from the hole after approach shots. 1st putts made inside 10 ft = first putts from 10 ft and in that went in. Lag putts = first putts over 10 ft that finished inside 3 ft.', M, y + 4);
      // ---- v144: Round takeaway page ----
      doc.addPage(); pdfTakeawayPage(doc, { M: M, PW: PW, PH: PH, font: font, ink: ink, T: T, header: header }, r);
      // ---- Page 2: the scorecard (the same numbers as the on-screen card: scorecardData) ----
      doc.addPage(); y = header('Scorecard – strokes gained vs ' + blName(R.bl));
      var D = scorecardData(r, S), SCG = D.rows.map(function (row) { return [row.lbl]; }), nG = D.groups.length;
      var halves = D.n > 9 ? [['Front 9', D.idx.filter(function (i) { return i < 9; }), [0]], ['Back 9', D.idx.filter(function (i) { return i >= 9; }), D.groups.map(function (g, k) { return k; }).slice(1)]]
        : [['Front 9', D.idx, D.groups.map(function (g, k) { return k; })]];
      var LW = 62, SW = 40, CW = Math.min(44, (PW - 2 * M - LW - 2 * SW) / 9), mix = function (c, a) { return c.map(function (v) { return Math.round(255 - (255 - v) * a); }); };
      var tintRGB = function (v, big) { if (v == null || Math.abs(v) < 0.005) return null; return mix(v > 0 ? [52, 160, 90] : [214, 80, 70], 0.1 + 0.45 * Math.min(Math.abs(v) / (big ? 4 : 1.5), 1)); };
      var markAt = function (m, cx, cy) { doc.setDrawColor(70); doc.setLineWidth(0.6);
        if (m === 'birdie' || m === 'eagle') { doc.circle(cx, cy, 5.8, 'S'); if (m === 'eagle') doc.circle(cx, cy, 7.6, 'S'); }
        if (m === 'bogey' || m === 'double') { doc.rect(cx - 5.8, cy - 5.8, 11.6, 11.6, 'S'); if (m === 'double') doc.rect(cx - 7.6, cy - 7.6, 15.2, 15.2, 'S'); } doc.setDrawColor(0); };
      var ynAt = function (yes, cx, cy) { var c = yes ? [45, 135, 75] : [190, 95, 85]; doc.setDrawColor(c[0], c[1], c[2]); doc.setLineWidth(0.7); doc.circle(cx, cy, 4, 'S');
        if (yes) doc.lines([[1.4, 1.5], [2.8, -3.2]], cx - 2.2, cy + 0.1, [1, 1], 'S', false); else doc.line(cx - 2.8, cy + 2.8, cx + 2.8, cy - 2.8); doc.setDrawColor(0); };
      halves.forEach(function (hf) {
        var hs = hf[1], ss = hf[2], W = LW + CW * hs.length + SW * ss.length, rec = { p: doc.getCurrentPageInfo().pageNumber, x: M, w: W, cols: [], cells: [], grid: true }; TABS.push(rec);
        rec.cols = [{ x: M, w: LW, align: 'left', at: M + 5 }].concat(hs.map(function (i, k) { var x0 = M + LW + CW * k; return { x: x0, w: CW, align: 'center', at: x0 + CW / 2 }; }),
          ss.map(function (g, k) { var x0 = M + LW + CW * hs.length + SW * k; return { x: x0, w: SW, align: 'center', at: x0 + SW / 2 }; }));
        heading(hf[0], M, y); y += 8; var gname = '', y0 = y;
        D.rows.forEach(function (row, ri) {
          if (gname && row.grp !== gname) y += 5; gname = row.grp;
          var RH = row.cls === 'sscore' ? 19 : 14, yb = y + RH / 2 + 2.8, cy = y + RH / 2, hole = ri === 0;
          if (hole) { doc.setFillColor(238, 241, 238); doc.roundedRect(M, y, W, RH, 3, 3, 'F'); }
          doc.setFillColor(247, 248, 247); doc.rect(M + LW + CW * hs.length, y + (hole ? RH : 0), SW * ss.length, hole ? 0 : RH, 'F');
          var put = function (c, j, big) {
            var col = rec.cols[j], t = c.t, rgbT = c.k === 'sg' ? tintRGB(c.v, big) : null;
            if (rgbT) { doc.setFillColor(rgbT[0], rgbT[1], rgbT[2]); doc.rect(col.x + 1, y + 1, col.w - 2, RH - 2, 'F'); }
            if (c.k === 'yn') { ynAt(c.b, col.at, cy); rec.cells.push({ p: rec.p, row: hole ? 0 : 1, col: j, x0: col.at - 4, x1: col.at + 4 }); return; }
            if (t === '') return;
            font(c.k === 'mark' ? 9.5 : c.k === 'sg' ? 7.2 : c.txt ? 7.2 : hole ? 8.5 : 8); ink(hole ? 70 : c.k === 'dash' ? 150 : 35);
            doc.text(P(t), col.at, yb, { align: 'center' }); var w = doc.getTextWidth(P(t)); rec.cells.push({ p: rec.p, row: hole ? 0 : 1, col: j, x0: col.at - w / 2, x1: col.at + w / 2 }); ink();
            if (c.k === 'mark') markAt(c.mark, col.at, cy - 0.3);
          };
          font(8); ink(hole ? 70 : 85); T(row.lbl, M + 5, yb); ink();
          hs.forEach(function (i, k) { put(row.cells[i], 1 + k, false); SCG[ri][1 + i] = row.cells[i].t; });
          ss.forEach(function (g, k) { put(row.sums[g], 1 + hs.length + k, true); SCG[ri][1 + D.n + g] = row.sums[g].t; });
          if (!hole) { doc.setDrawColor(230); doc.setLineWidth(0.4); doc.line(M, y + RH, M + W, y + RH); doc.setDrawColor(0); }
          y += RH;
        });
        doc.setDrawColor(215); doc.setLineWidth(0.5); [LW + CW * hs.length].forEach(function (dx) { doc.line(M + dx, y0, M + dx, y); }); doc.setDrawColor(0);
        y += 18;
      });
      // legend: score shapes + what the shading / icons mean
      font(8); ink(90); var lx = M, lg = [['eagle', 'Eagle or better'], ['birdie', 'Birdie'], ['par', 'Par (no mark)'], ['bogey', 'Bogey'], ['double', 'Double bogey or worse']];
      lg.forEach(function (it) { markAt(it[0], lx + 8, y - 3); ink(90); T(it[1], lx + 23, y); lx += 23 + doc.getTextWidth(it[1]) + 18; }); y += 16;
      ynAt(true, M + 8, y - 3); ink(90); T('yes', M + 16, y); ynAt(false, M + 46, y - 3); ink(90); T('no', M + 54, y);
      y = note('Strokes gained rows (Tot, OTT = off the tee, APP = approach, ARG = around the green, Putt) compare each hole with ' + blName(R.bl) + ': green = strokes gained, red = strokes lost. – = not a par 4 or 5. Blank = hole not finished. Drive dist in yards; 1st / last putt in feet. OUT / IN / TOT add up the holes (averages for drive and putt lengths, made / chances for the yes / no rows).', M + 80, y, PW - 2 * M - 80);
      // ---- Page 3: strokes gained ----
      doc.addPage(); y = header('Strokes gained – compared with ' + blName(R.bl));
      heading('By category', M, y); y += 16;
      y = table([['Category', 'Shots', 'SG']].concat(['tee', 'approach', 'short', 'putting'].map(function (k) { return [CAT_NAME[k], String(S.cats[k].n), fmtSG(S.cats[k].sg)]; })).concat([['Total', '', fmtSG(S.sgTotal)]]), M, y, [260, 90, 90]) + 16;
      heading('By distance', M, y); y += 16;
      var dist = [['From', 'Shots', 'SG', 'Avg to pin after']];
      [['Approach', SG.APPR_BUCKETS.map(function (b) { return b.id; })], ['Short game', [SG.SHORT_BUCKET]], ['Putting', ['0-5 ft', '5-15 ft', '15-30 ft', '30+ ft']]].forEach(function (g) {
        dist.push([g[0], '', '', '']); g[1].forEach(function (b) { var c = S.buckets[b]; dist.push([b, String(c.n), c.n ? fmtSG(c.sg) : '-', g[0] === 'Approach' ? (c.proxN ? Math.round(c.proxFt) + ' ft' : '-') : '']); }); });
      y = table(dist, M, y, [260, 90, 90, 100], { group: function (row) { return row[1] === '' && /^(Approach|Short game|Putting)$/.test(row[0]); }, cont: 'Strokes gained (continued)' });
      y = note('Approach = shots from more than 30 yd off the green (par-3 tee shots included); 30-60 = over 30 up to under 60 yd, other ranges include the lower number. Short game = off the green from 30 yd and in. Avg to pin after = feet on the green, yards x 3 off it, 0 if holed; penalty/OB shots left out.', M, y + 6) + 12;
      heading('Same round vs every baseline', M, y); y += 16;
      y = table([['Baseline', 'Tee', 'Approach', 'Short', 'Putting', 'Total']].concat(SG.BASELINES.map(function (b) { var X = SG.summarize(r, b.id);
        return [b.name + (b.status === 'estimated' ? ' (est.)' : '') + (b.id === R.bl ? '  <' : ''), fmtSG(X.cats.tee.sg), fmtSG(X.cats.approach.sg), fmtSG(X.cats.short.sg), fmtSG(X.cats.putting.sg), fmtSG(X.sgTotal)]; })), M, y, [190, 70, 70, 70, 70, 70]);
      y = note('< = the baseline this report uses. (est.) = estimated baseline (no published table).', M, y + 6);
      // ---- v137: the Stats categories (all rounds, this round dashed on the par curves), each followed by this round's maps ----
      var segs = SG.pinSegments(pinDataRound()), multi = savedRounds().length > 1, BOT = PH - M - 14, GAP = 12, MCW = (PW - 2 * M - GAP) / 2, PAD = 8;
      var wrap = function (t, w, sz) { font(sz); return doc.splitTextToSize(P(t), w); };
      var plist = S.proxList.filter(function (m) { return SG.reportGroup(m.from); }), gsum = SG.REPORT_GROUPS.map(function (g) {
        var L = plist.filter(function (m) { return SG.reportGroup(m.from) === g.id; }); return { g: g, L: L, P: SG.proxStats(L) }; }).filter(function (x) { return x.L.length; });
      // a table squeezed to one line of the rows that have something in them ("Short left 3; No direction entered 9")
      var squash = function (rows) { var H = rows[0], body = rows.slice(1).filter(function (rw) { return rw.slice(1).some(function (c) { return /[1-9]/.test(c); }); }); if (!body.length) return '';
        return (H.length > 2 ? H[0] + ' (' + H.slice(1).join(' · ') + '): ' : H[0] + ': ') + body.map(function (rw) { return rw[0] + ' ' + rw.slice(1).filter(function (c) { return c && c !== '-'; }).join(' · '); }).join('; '); };
      // legend items cut to their first words ("Hit the green - label = ..." -> "Hit the green")
      var shortLeg = function (L) { return (L || []).filter(function (it) { return it.k !== 'none' && it.k !== 'txt'; }).map(function (it) { var o = {}; for (var k in it) o[k] = it[k]; o.t = String(it.t).split(/ - | \(|;|: | · white| = /)[0].trim(); return o; })
        .filter(function (it, i, A) { return it.t && A.findIndex(function (q) { return q.t === it.t; }) === i; }); };
      var HEAT_LEG = [{ k: 'sw', c: '#0050ff', t: 'Few shots' }, { k: 'sw', c: '#00e63c', t: '' }, { k: 'sw', c: '#fff000', t: '' }, { k: 'sw', c: '#e60000', t: 'Most shots' }];
      var legRows = function (items, w) { // flow layout: [{it, x}] per line
        var rows = [[]], x = 0; font(7); items.forEach(function (it) { var iw = 24 + (it.t ? doc.getTextWidth(P(it.t)) + 12 : 0); if (x + iw > w && rows[rows.length - 1].length) { rows.push([]); x = 0; } rows[rows.length - 1].push({ it: it, x: x }); x += iw; }); return rows.filter(function (r0) { return r0.length; }); };
      var mapCard = function (o, w) { // o: { title, svg, facts[], legend[] } -> measured card
        var m = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(o.svg || ''), iw = w - 2 * PAD, ih = m ? iw * (+m[2]) / (+m[1]) : 0, cap = o.cap || 330;
        if (o.side && m) { ih = cap; iw = ih * (+m[1]) / (+m[2]); if (iw > w * 0.48) { iw = w * 0.48; ih = iw * (+m[2]) / (+m[1]); } }
        else if (ih > cap) { iw = iw * cap / ih; ih = cap; }
        var tw = o.side ? w - iw - 3 * PAD : w - 2 * PAD; o.tw = tw;
        o.w = w; o.iw = iw; o.ih = ih; o.fl = []; (o.facts || []).forEach(function (f, k) { o.fl = o.fl.concat(wrap(f, tw, k ? 7.5 : 9).map(function (t) { return [t, k ? 7.5 : 9]; })); });
        o.lr = legRows(o.legend || [], tw); var th = o.fl.reduce(function (t, f) { return t + f[1] * 1.35; }, 0) + (o.lr.length ? 8 + o.lr.length * 13 : 0);
        o.h = o.side ? PAD + 14 + Math.max(ih, th) + PAD : PAD + 12 + ih + 8 + th + PAD; return o; };
      var drawMapCard = function (o, x, yy, h) {
        doc.setDrawColor(214, 220, 226); doc.setLineWidth(0.6); doc.roundedRect(x, yy, o.w, h, 6, 6, 'S'); doc.setDrawColor(0);
        font(9.5); ink(25); T(o.title, x + PAD, yy + PAD + 8); ink();
        var pg = doc.getCurrentPageInfo().pageNumber, imgY = yy + PAD + 14, imgX = o.side ? x + PAD : x + (o.w - o.iw) / 2, y2 = o.side ? imgY + 4 : imgY + o.ih + 8, tx0 = o.side ? x + 2 * PAD + o.iw : x + PAD;
        o.fl.forEach(function (f) { font(f[1]); ink(f[1] === 9 ? 40 : 95); y2 += f[1] * 1.35; T(f[0], tx0, y2 - 2); }); ink();
        if (o.lr.length) { y2 += 8; o.lr.forEach(function (row) { row.forEach(function (c) { swatch(c.it, tx0 + c.x, y2 + 4); font(7); ink(80); if (c.it.t) T(c.it.t, tx0 + c.x + 25, y2 + 6.5); ink(); }); y2 += 13; }); }
        if (!o.svg) return Promise.resolve();
        return svgToPng(o.svg, 1.8).then(function (im) { var back = doc.getCurrentPageInfo().pageNumber; doc.setPage(pg); doc.addImage(im.data, 'JPEG', imgX, imgY, o.iw, o.ih); doc.setPage(back); });
      };
      // build one card from an on-screen map (kind, view extras) or an all-rounds heat map
      var fromMap = function (title, kind, extra, facts0) { var mp = mapForReport(kind, extra); if (!mp.svg) return null;
        var facts = (facts0 || []).concat(mp.lines.filter(function (L) { return L.t && L.b; }).map(function (L) { return L.t; }).slice(0, 2)), small = mp.lines.filter(function (L) { return L.t && !L.b; }).map(function (L) { return L.t.replace(/\s+\|\s+/g, ' · '); }).concat(mp.lines.filter(function (L) { return L.table; }).map(function (L) { return squash(L.table); })).filter(Boolean);
        if (kind === 'putt') small = small.map(function (t) { return t.replace(/^Distance \(Putts · Made · Make %\): /, 'Made by distance: '); });
        return { title: title, svg: mp.svg, facts: facts.concat(small), legend: shortLeg(mp.legend) }; };
      var fromHeat = function (title, kind) { if (!multi) return null; var hm = heatReport(kind); if (!hm.svg) return null;
        return { title: title, svg: hm.svg, facts: hm.lines.slice(0, 4).map(function (L) { return L.t; }).concat(kind === 'fw' ? ['Par 4 and 5 tee shots, layups left out.'] : []), legend: HEAT_LEG }; };
      var PROX_LEG = function (G) { return [{ k: 'ln', c: G.color, t: 'Shot' }, { k: 'dot', c: G.color, b: '#000', t: 'Hit green (ft)' }, { k: 'ringx', c: G.color, t: 'Missed (yd)' }, { k: 'star', t: 'Holed' }, { k: 'dash', c: '#e00016', t: 'D1 women avg' }]; };
      // place cards two per row (a full-width card takes the row), new page when a row would not fit
      var placeRows = function (cards, title) {
        var q = Promise.resolve(), rows = [], row = null;
        cards.filter(Boolean).forEach(function (c) { if (c.full) { rows.push([c]); row = null; return; } if (!row || row.length === 2) { row = []; rows.push(row); } row.push(c); });
        rows.forEach(function (rw) { q = q.then(function () {
          rw.forEach(function (c) { mapCard(c, c.full ? PW - 2 * M : MCW); }); var h = Math.max.apply(null, rw.map(function (c) { return c.h; }));
          if (K.y + h > BOT) K.newPage(title + ' (continued)');
          var yy = K.y; K.y += h + 12; return Promise.all(rw.map(function (c, k) { return drawMapCard(c, rw.length === 1 && !c.full ? M + (PW - 2 * M - c.w) / 2 : M + k * (MCW + GAP), yy, h); }));
        }); });
        return q;
      };
      var section = function (title, note) { K.newPage(title); if (note) { font(10); ink(90); T(note, M, K.y - 2); ink(); K.y += 16; } };
      var pd = pmissData(false);
      var AFTER = {
        driver: function () { section('Driver – this round', 'Tee shots on par 4s and 5s' + (multi ? ', with all your rounds beside it' : ''));
          return placeRows([fromMap('Tee shots – this round', 'fw'), fromHeat('Tee shots – all rounds', 'fw')], 'Driver – this round'); },
        approach: function () { section('Approach – this round', gsum.length ? gsum.length + ' distance group' + (gsum.length === 1 ? '' : 's') + ' · ' + plist.length + ' approaches' : '');
          if (gsum.length) { K.y = table([['Group', 'Shots', 'Greens hit', 'Avg ft - greens hit', 'Avg ft - all']].concat(gsum.map(function (x) { var Q = x.P;
            return [x.g.name, String(Q.n), Q.hits + '/' + Q.n + ' (' + Math.round(Q.hitPct) + '%)', Q.avgHitFt == null ? '-' : Math.round(Q.avgHitFt) + ' ft', Q.avgAllFt == null ? '-' : Math.round(Q.avgAllFt) + ' ft']; })), M, K.y + 4, [130, 60, 110, 120, 120], { fs: 8.5, rh: 13 }) + 12; }
          var cards = [fromMap('Greens in regulation', 'gir'), fromMap('Approach misses', 'miss')];
          gsum.forEach(function (x) { var c = fromMap('Proximity – ' + x.g.name, 'prox', { proxReport: true, proxGroup: x.g.id }, [x.P.n + ' shot' + (x.P.n === 1 ? '' : 's') + ' · greens ' + x.P.hits + '/' + x.P.n + ' · ' + (x.P.avgAllFt == null ? '' : 'avg ' + Math.round(x.P.avgAllFt) + ' ft')]);
            if (c) { c.facts = c.facts.slice(0, 1).concat(c.facts.slice(1).filter(function (f) { return /\(/.test(f); })); c.legend = PROX_LEG(x.g); c.cap = 285; c.full = true; c.side = true; cards.push(c); } });
          cards.push(fromHeat('GIR – all rounds', 'gir'));
          if (segs.length) cards.push({ full: true, cap: 360, title: 'Pin location', svg: pinReportSVG(segs), facts: [squash([['Pin', 'Holes', 'GIR', 'Avg ft (GIR)']].concat(segs.map(function (s0) { return [s0.name, String(s0.holes), s0.gir + '/' + s0.holes, s0.avgHitFt == null ? '-' : Math.round(s0.avgHitFt) + ' ft']; })))],
            legend: [{ k: 'dot', c: '#ffffff', b: '#000', t: 'Green hit' }, { k: 'dot', c: '#e0102a', b: '#000', t: 'Missed green' }, { k: 'pin', t: 'Pin' }, { k: 'dring', t: '20 ft' }] });
          return placeRows(cards, 'Approach – this round'); },
        putting: function () { section('Putting – this round', S.putts + ' putts · ' + R.three.three + ' three-putt hole' + (R.three.three === 1 ? '' : 's'));
          var cards = [fromMap('1st putts', 'putt', { puttN: '1' }), fromMap('2nd putts', 'putt', { puttN: '2' })];
          SG.PMISS_GROUPS.filter(function (g) { return pd.counts[g.id]; }).reverse().forEach(function (g) { cards.push(fromMap('1st putts made inside 10 ft – ' + g.name, 'pmiss', { pmG: g.id })); });
          cards.forEach(function (c) { if (c) c.cap = c.cap2 || 200; });
          return placeRows(cards, 'Putting – this round'); }
      };
      var K = { M: M, PW: PW, BOT: BOT, font: font, ink: ink, T: T, wrap: wrap, header: header, imgScale: 2, after: function (id) { return AFTER[id] ? AFTER[id]() : null; } };
      var chain = pdfStatsCats(doc, statsPdfData({ round: r }).cats, K);
      return chain.then(function () {
        var n = doc.getNumberOfPages();
        for (var i = 2; i <= n; i++) { doc.setPage(i); font(8); doc.setTextColor(130); T('Page ' + i + ' of ' + n, PW - M, PH - 18, { align: 'right' }); doc.setTextColor(0); }
        return { blob: new Blob([doc.output('arraybuffer')], { type: 'application/pdf' }), pages: n, name: SG.reportFileName(r.course, player, r.date),
          layout: { PW: PW, PH: PH, M: M, text: LAY, tables: TABS }, scorecard: SCG };
      });
    });
  }
  // ---------- v126 Stats PDF: everything on the Stats page (every category, open or closed), drawn from the page's own SVG graphs ----------
  // The page is rendered off-screen with every category and the Putt misses sub-menu open; each graph's SVG gets its on-screen CSS
  // copied onto it (so the picture matches the page) and goes into the PDF as a crisp image, two graphs per row, never split by a page break.
  var ST_SVG_PROPS = ['fill', 'fill-opacity', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-opacity', 'opacity', 'font-size', 'font-weight', 'stroke-linecap', 'stroke-linejoin', 'paint-order', 'letter-spacing'];
  function svgInline(svg) {
    var c = svg.cloneNode(true), src = svg.querySelectorAll('*'), dst = c.querySelectorAll('*');
    for (var i = 0; i < src.length; i++) { var cs = getComputedStyle(src[i]); dst[i].setAttribute('style', ST_SVG_PROPS.map(function (p) { return p + ':' + cs.getPropertyValue(p); }).join(';')); }
    [].slice.call(c.querySelectorAll('.sthit, title')).forEach(function (e) { e.remove(); }); c.removeAttribute('class'); c.removeAttribute('style');
    // 5 units of air each side so end labels (e.g. the last date) are not cut off in the picture
    var vb = /^0 0 ([\d.]+) ([\d.]+)$/.exec(c.getAttribute('viewBox') || '');
    if (vb) { var g = document.createElementNS('http://www.w3.org/2000/svg', 'g'); g.setAttribute('transform', 'translate(5,0)'); while (c.firstChild) g.appendChild(c.firstChild); c.appendChild(g); c.setAttribute('viewBox', '0 0 ' + (+vb[1] + 10) + ' ' + vb[2]); }
    return c.outerHTML;
  }
  // the newest finished round of the rounds on the Stats page (the round in progress is not used until it is finished)
  function stLastRound(D) { return D.all.length ? D.all[D.all.length - 1] : null; }
  function statsPdfData(opts) {
    opts = opts || {}; var OR = opts.round || null;
    var keep = { stOpen: view.stOpen, stSel: view.stSel, stPmB: view.stPmB, pdf: view.pdf, stMode: view.stMode, stCmp: view.stCmp, stPlayer: view.stPlayer };
    view.stOpen = { driver: true, approach: true, putting: true, chipping: true, scoring: true, pmiss: true }; view.stSel = null; view.pdf = null;
    if (OR) { view.stMode = 'all'; view.stCmp = false; if (OR.player) view.stPlayer = OR.player; } // the round PDF always shows every finished round
    var box = document.createElement('div'); box.style.cssText = 'position:fixed;left:-10000px;top:0;width:390px';
    var tx = function (e) { return e ? SG.pdfSafe(e.textContent.replace(/\s+/g, ' ')) : ''; };
    try {
      var D = statsData(); box.innerHTML = statsHTML(); document.body.appendChild(box);
      var pg = box.querySelector('.statspage'), extra = document.createElement('div'); pg.appendChild(extra);
      // v137: Stats PDF = the page's own all-rounds par curves; round PDF = all rounds in colour with THIS round dashed
      var last = stLastRound(D), DL = OR ? { mode: 'all', shown: [statsRound(OR, view.stBl || '')], all: D.all, flip: true } : null;
      extra.innerHTML = '<div id="pdfpm">' + (OR ? stPmissCard(D, 'all') : PM_BANDS.map(function (b) { return stPmissCard(D, b.id); }).join('')) + '</div>' +
        '<div id="pdfpar">' + (DL ? [3, 4, 5].map(function (par) { return stDist(par, DL); }).join('') : '') + '</div>';
      var card = function (el) {
        var t = el.querySelector('.sth > span:first-child'), v = el.querySelector('.sth .stv'), svg = el.querySelector('svg.stchart');
        var note = [].slice.call(el.querySelectorAll('p.stnote')).map(tx).filter(Boolean).join(' ');
        if (/^st-pm/.test(el.id) && el.id !== 'st-pmall') note = ''; // the putt-miss explanation is printed once, on the All distances grid
        var s2 = /^st-pm/.test(el.id) && el.querySelector('.st2nd b'); // v127: avg 2nd putt in the PDF grid header too
        if (s2) v = { textContent: (v ? v.textContent : '') + ' · avg 2nd putt ' + s2.textContent };
        return { kind: 'card', id: el.id, title: tx(t), val: tx(v), svg: svg ? svgInline(svg) : '', lines: [].slice.call(el.querySelectorAll('p.stn, p.stfew')).map(tx).filter(Boolean), note: note };
      };
      var cats = [].slice.call(pg.querySelectorAll('.stcat')).map(function (sec) {
        var c = sec.getAttribute('data-cat'), items = [];
        [].slice.call(sec.querySelector('.stcatb').children).forEach(function (el) {
          if (el.matches('p.stgrp')) items.push({ kind: 'label', t: tx(el) });
          else if (el.matches('.stcard.stgraph') && !(OR && c === 'scoring' && /^st-par\d$/.test(el.id))) items.push(card(el));
        });
        if (c === 'driver') { var fwc = fwSideCard(D); if (fwc) items.push(fwc); }
        if (c === 'putting') { items.push({ kind: 'label', t: OR ? 'Putt misses (first putts) - all rounds' : 'Putt misses (first putts) - all distances and each band' }); [].slice.call(extra.querySelectorAll('#pdfpm .stcard')).forEach(function (el) { items.push(card(el)); }); }
        if (c === 'scoring' && OR) {
          items.push({ kind: 'label', t: 'Par 3 / 4 / 5 scores - all rounds vs this round' });
          items.push({ kind: 'legend', all: SG.pdfSafe('All rounds average: ' + D.all.length + ' finished round' + (D.all.length === 1 ? '' : 's') + ' (colour)'), last: 'This round (dashed)' });
          [].slice.call(extra.querySelectorAll('#pdfpar .stcard')).forEach(function (el) { items.push(card(el)); });
        }
        return { id: c, name: tx(sec.querySelector('.stcath b')), sum: tx(sec.querySelector('.stcatsum')), items: items };
      });
      var tbl = pg.querySelector('#sttable'), rows = tbl ? [].slice.call(tbl.rows).map(function (r) { return [].slice.call(r.cells).map(tx); }) : [];
      var mode = D.mode, rangeName = mode === 'sel' ? 'Selected round' : mode === '5' ? 'Last 5' : 'All rounds';
      var bl = view.stBl ? blLabel(view.stBl) : 'each round’s own baseline';
      var who = (pg.querySelector('.topbar .title span') || {}).textContent || '';
      return { D: D, cats: cats, table: rows, tableNote: tx(pg.querySelector('#sttablecard .stnote')), shown: tx(pg.querySelector('#stshown')), range: rangeName, cmp: D.cmp,
        baseline: SG.pdfSafe(bl), player: SG.pdfSafe(who.split(' · ').length > 1 ? who.split(' · ')[0] : ''),
        sel: D.sel, last: last };
    } finally { box.remove(); for (var k in keep) view[k] = keep[k]; }
  }
  // v138: Fairways hit and missed, sideways – tee on the left, left rough on top, fairway in the middle, right rough at the bottom; one dot
  // per tee shot where it finished (no tracers), the L / F / R share on each band. Rounds = the Stats rounds shown. Used in both PDFs.
  function fwSideList(ids) { var L = []; savedRounds().forEach(function (r) { if (!ids[r.id]) return; SG.summarize(r).teeMap.forEach(function (m) { if (!m.layup) L.push(m); }); }); return L; }
  function fwSideSVG(list) {
    var W = 600, H = 226, x0 = 104, x1 = 592, yT = 8, yF = 70, yR = 136, yB = 198, X = function (yd) { return x0 + 14 + (Math.max(60, Math.min(350, yd)) - 60) / 290 * (x1 - x0 - 24); };
    var N = list.length, nL = list.filter(function (m) { return !m.fairway && m.side === 'L'; }).length, nR = list.filter(function (m) { return !m.fairway && m.side === 'R'; }).length, nF = list.filter(function (m) { return m.fairway; }).length;
    var pc = function (k) { return N ? Math.round(100 * k / N) + '%' : '–'; };
    var o = '<svg id="fwside" viewBox="0 0 ' + W + ' ' + H + '">' +
      '<rect x="' + x0 + '" y="' + yT + '" width="' + (x1 - x0) + '" height="' + (yB - yT) + '" rx="8" fill="#6fae5c" stroke="#2e7d32" stroke-width="1.2"/>' +
      '<path d="M' + X(95) + ' ' + yF + ' L' + (x1 - 1) + ' ' + yF + ' L' + (x1 - 1) + ' ' + yR + ' L' + X(95) + ' ' + yR + ' Q' + (X(95) - 14) + ' ' + ((yF + yR) / 2) + ' ' + X(95) + ' ' + yF + 'Z" fill="#a9df8f"/>' +
      '<rect x="' + (x0 + 6) + '" y="' + ((yF + yR) / 2 - 9) + '" width="14" height="18" rx="3" fill="#d6f5c8" stroke="#fff" stroke-width="1.2"/>' +
      '<text x="' + (x0 + 13) + '" y="' + (yB - 6) + '" text-anchor="middle" font-size="9" fill="#fff" font-weight="600">TEE</text>';
    [100, 150, 200, 250, 300].forEach(function (yd) { var x = f1(X(yd)); o += '<line x1="' + x + '" y1="' + (yT + 2) + '" x2="' + x + '" y2="' + (yB - 2) + '" stroke="#fff" stroke-opacity=".55" stroke-dasharray="3 5"/>' +
      '<text x="' + x + '" y="' + (H - 6) + '" text-anchor="middle" font-size="11" fill="#5b6770">' + yd + ' yd</text>'; });
    [['Left', nL, yT, yF, '#c0263a'], ['Fairway', nF, yF, yR, '#2e7d32'], ['Right', nR, yR, yB, '#c0263a']].forEach(function (b) { var cy = (b[2] + b[3]) / 2;
      o += '<text x="' + (x0 - 12) + '" y="' + f1(cy - 5) + '" text-anchor="end" font-size="11" fill="#5b6770">' + b[0] + '</text><text x="' + (x0 - 12) + '" y="' + f1(cy + 15) + '" text-anchor="end" font-size="20" fill="' + b[4] + '">' + pc(b[1]) + '</text>'; });
    var dots = '';
    list.forEach(function (m, i) {
      var j = (((i * 37) % 11) - 5) / 5, sgn = m.side === 'L' ? -1 : m.side === 'R' ? 1 : 0, y, fill, stroke = '#fff', x = X(m.kind === 'ob' ? 250 : m.hit || 0);
      if (m.kind === 'ob') { y = sgn < 0 ? yT + 10 : sgn > 0 ? yB - 10 : (yF + yR) / 2; dots += '<text x="' + f1(x) + '" y="' + f1(y + 5) + '" text-anchor="middle" font-size="15" font-weight="700" fill="#c0263a" stroke="#fff" stroke-width="2" paint-order="stroke">✕</text>'; return; }
      if (m.fairway) { y = (yF + yR) / 2 + sgn * 12 + j * 18; fill = '#fff'; stroke = '#2e7d32'; }
      else if (sgn) { y = sgn < 0 ? (yT + yF) / 2 + j * 20 : (yR + yB) / 2 + j * 20; fill = '#e0313f'; }
      else { y = (i % 2 ? yF : yR) + j * 4; fill = '#9aa5ae'; } // missed, side not entered: on the fairway edge, not in it
      dots += '<circle cx="' + f1(x) + '" cy="' + f1(y) + '" r="4.4" fill="' + fill + '" stroke="' + stroke + '" stroke-width="1.4"/>';
    });
    return o + dots + '</svg>';
  }
  function fwSideCard(D) {
    var ids = {}; (D.shown || []).forEach(function (p) { ids[p.id] = 1; }); var L = fwSideList(ids); if (!L.length) return null;
    var hit = L.filter(function (m) { return m.fairway && m.hit; }).map(function (m) { return m.hit; }), nU = L.filter(function (m) { return !m.fairway && !m.side; }).length;
    return { kind: 'card', id: 'st-fwside', full: true, title: 'Fairways hit and missed', val: L.length + ' tee shots', svg: fwSideSVG(L),
      lines: [SG.pdfSafe('Par 4 and 5 tee shots, layups left out' + (nU ? ' · ' + nU + ' miss' + (nU === 1 ? '' : 'es') + ' with no side entered (grey, on the fairway edge)' : '') + (L.some(function (m) { return m.kind === 'ob'; }) ? ' · ✕ = OB' : ''))],
      note: SG.pdfSafe('One dot per tee shot where it finished: white = fairway, red = missed left (top) or right (bottom). Seen from the tee: the tee is on the left, the hole off to the right.') };
  }
  // v137 PDF covers – the Instagram story look (STORY.drawCover), Letter shaped
  var COVER_BG = 'img/home-bg.webp';
  function roundCover(r) { var bl = blOf(r), S = SG.summarize(r, bl); return STORY.coverImage(STORY.data(r, S, { baselineName: SG.baseline(bl).name, player: r.player || playerName() }), COVER_BG); }
  function statsCover(R, dateTxt) {
    var ids = {}; R.D.shown.forEach(function (p) { ids[p.id] = 1; });
    var list = savedRounds().filter(function (r) { return ids[r.id]; }).map(function (r) { var bl = view.stBl || blOf(r); return STORY.data(r, SG.summarize(r, bl), {}); });
    var f = R.D.shown[0], l = R.D.shown[R.D.shown.length - 1], span = f && l ? (f === l ? stDate(f.date) : stDate(f.date) + ' – ' + stDate(l.date)) : '';
    return STORY.coverImage(STORY.combine(list, { player: R.player, range: R.range === 'Selected round' ? '' : R.range, dateText: span, baselineName: view.stBl ? blLabel(view.stBl) : '' }), COVER_BG);
  }
  // v137: the Stats categories as PDF pages – every category starts on a new page (no category runs into the next), graphs two per row,
  // a row never split by a page end. Used by the Stats PDF and the round PDF. K = page kit; K.after(catId) adds pages after a category
  // (the round PDF's maps). Returns the promise chain.
  function pdfStatsCats(doc, cats, K) {
    var M = K.M, PW = K.PW, BOT = K.BOT, font = K.font, ink = K.ink, T = K.T, wrap = K.wrap;
    // v138: every graph full page width, one per row (Scott: big graphs, about 2 per page, no wasted space). Each page takes as many
    // graphs as fit; the pictures on a page shrink together (never below SMIN, never stretched) when that lets one more fit.
    var FW_ = PW - 2 * M, PAD = 9, CAP = 260, SMIN = 0.8, GAPC = 10, chain = Promise.resolve();
    var measure = function (c) { // c.oh = card height without the picture, c.ih0 / c.iw0 = the picture at full width (tall ones capped)
      var CW = c.cw = FW_, m = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(c.svg || ''), tw = CW - 2 * PAD, iw = tw, ih = m ? iw * (+m[2]) / (+m[1]) : 0;
      if (ih > CAP) { iw = iw * CAP / ih; ih = CAP; }
      c.fs = [11, 8.5, 7.4, 13, 10.5, 9]; // title, line, note sizes + their line heights
      c.tl = wrap(c.title, tw * 0.62, c.fs[0]); c.ll = []; c.lines.forEach(function (l) { c.ll = c.ll.concat(wrap(l, tw, c.fs[1])); }); c.nl = wrap(c.note, tw, c.fs[2]);
      c.iw0 = iw; c.ih0 = ih; c.oh = PAD + c.fs[3] * c.tl.length + 4 + (ih ? 5 : 0) + c.ll.length * c.fs[4] + 3 + c.nl.length * c.fs[5] + PAD;
    };
    var sized = function (c, sc) { c.iw = c.iw0 * sc; c.ih = c.ih0 * sc; return c.oh + c.ih; };
    // picture scale that makes these blocks fill `room` (1 = full size); null when they cannot fit at SMIN
    var fitScale = function (L, room) { var fixed = 0, img = 0; L.forEach(function (b) { if (b.kind === 'card') { fixed += b.c.oh + GAPC; img += b.c.ih0; } else fixed += b.h; });
      if (!img) return fixed <= room ? 1 : null; var sc = Math.min(1, (room - fixed) / img); return sc >= SMIN ? sc : null; };
    K.newPage = function (title) { doc.addPage(); K.y = K.header(title); };
    var drawCard = function (c, x, yy, h) {
      var CW = c.cw, F = c.fs;
      doc.setDrawColor(214, 220, 226); doc.setLineWidth(0.6); doc.roundedRect(x, yy, CW, h, 6, 6, 'S'); doc.setDrawColor(0);
      var yy2 = yy + PAD + F[0] - 1; font(F[0]); ink(25); doc.text(c.tl, x + PAD, yy2); font(F[0] - 1.5); ink(95); if (c.val) T(c.val, x + CW - PAD, yy2, { align: 'right' });
      yy2 += F[3] * (c.tl.length - 1) + 7; var pg = doc.getCurrentPageInfo().pageNumber, imgY = yy2, imgX = x + (CW - c.iw) / 2;
      if (K.CARDS) K.CARDS.push({ p: pg, id: c.id, y0: yy, y1: yy + h, x0: x, x1: x + CW });
      if (c.ih) yy2 += c.ih + 5;
      font(F[1]); ink(70); c.ll.forEach(function (l) { yy2 += F[4]; T(l, x + CW / 2, yy2 - 2, { align: 'center' }); });
      yy2 += 3; font(F[2]); ink(115); doc.text(c.nl, x + PAD, yy2 + F[2] - 0.4); ink();
      if (!c.svg) return Promise.resolve();
      return svgToPng(c.svg, K.imgScale || 3).then(function (im) { var back = doc.getCurrentPageInfo().pageNumber; doc.setPage(pg); doc.addImage(im.data, 'JPEG', imgX, imgY, c.iw, c.ih); doc.setPage(back); if (K.IMGS) K.IMGS.push({ p: pg, id: c.id, y0: imgY, y1: imgY + c.ih }); });
    };
    var LEG = function (it, yy) { // all rounds (solid, par colours) vs this round (dark dashed)
      var x = M; doc.setLineDashPattern([], 0); doc.setLineWidth(2.2); [['#1f73c9', 0], ['#2e9d4f', 8], ['#e8871e', 16]].forEach(function (q) { var v = parseInt(q[0].slice(1), 16); doc.setDrawColor((v >> 16) & 255, (v >> 8) & 255, v & 255); doc.line(x + q[1], yy - 3, x + q[1] + 7, yy - 3); });
      font(8.5); ink(40); T(it.all, x + 30, yy);
      doc.setDrawColor(31, 45, 56); doc.setLineWidth(1.6); doc.setLineDashPattern([4, 3], 0); doc.line(x, yy + 11, x + 23, yy + 11); doc.setLineDashPattern([], 0); doc.setDrawColor(0);
      T(it.last, x + 30, yy + 14); ink(); return 32;
    };
    cats.forEach(function (cat) {
      var B = cat.items.map(function (it) { if (it.kind === 'card') { measure(it); return { kind: 'card', c: it }; } return it.kind === 'label' ? { kind: 'label', t: it.t, h: 16 } : { kind: 'legend', it: it, h: 36 }; });
      chain = chain.then(function () {
        K.newPage(cat.name); var room2 = BOT - K.y; // a continued page starts at the same height
        if (cat.sum) { font(10); ink(90); T(cat.sum.replace(/ {2,}/g, ' · '), M, K.y - 2); ink(); K.y += 16; }
        // split into pages: greedy, a label / legend never ends a page
        var pages = [], cur = [], room = BOT - K.y;
        B.forEach(function (b) {
          if (!cur.length || fitScale(cur.concat([b]), room) != null) { cur.push(b); return; }
          var carry = []; while (cur.length > 1 && cur[cur.length - 1].kind !== 'card') carry.unshift(cur.pop());
          pages.push({ L: cur, room: room });
          room = room2; cur = carry.concat([b]);
        });
        if (cur.length) pages.push({ L: cur, room: room });
        // rebalance: a page left with ONE graph takes the last graph of a page before it that has three or more (Driver: drive + OTT | fairways hit + the fairway picture)
        var nC = function (L) { return L.filter(function (x) { return x.kind === 'card'; }).length; };
        for (var pi2 = pages.length - 1; pi2 > 0; pi2--) { var A = pages[pi2 - 1], Z = pages[pi2];
          if (nC(Z.L) !== 1 || nC(A.L) < 3) continue;
          var k = A.L.length - 1; while (k > 0 && A.L[k].kind !== 'card') k--; var mv = A.L.slice(k); while (k > 0 && A.L[k - 1].kind !== 'card') { k--; mv = A.L.slice(k); }
          var A2 = A.L.slice(0, k), Z2 = mv.concat(Z.L); if (fitScale(Z2, Z.room) != null && nC(A2)) { A.L = A2; Z.L = Z2; } }
        var q = Promise.resolve();
        pages.forEach(function (pg, pi) {
          q = q.then(function () {
            if (pi) K.newPage(cat.name + ' (continued)');
            var sc = fitScale(pg.L, pg.room); if (sc == null) { var fx = 0, im = 0; pg.L.forEach(function (b) { if (b.kind === 'card') { fx += b.c.oh + GAPC; im += b.c.ih0; } else fx += b.h; }); sc = Math.max(0.3, Math.min(1, (pg.room - fx) / Math.max(1, im))); }
            var r = Promise.resolve();
            pg.L.forEach(function (b) { r = r.then(function () {
              if (b.kind === 'label') { font(8.5); ink(80); T(String(b.t).toUpperCase(), M + 2, K.y + 6); ink(); K.y += 16; return; }
              if (b.kind === 'legend') { K.y += LEG(b.it, K.y + 6) + 4; return; }
              var h = sized(b.c, sc), yy = K.y; K.y += h + GAPC; return drawCard(b.c, M, yy, h);
            }); });
            return r;
          });
        });
        return q.then(function () { K.y += 6; return K.after ? K.after(cat.id) : null; });
      });
    });
    return chain;
  }
  function makeStatsReport() {
    var R;
    try { R = statsPdfData(); } catch (e) { return Promise.reject(e); }
    if (!R.D.all.length) return Promise.reject(new Error('No finished rounds yet'));
    var P = SG.pdfSafe, now = new Date(), dateTxt = now.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    var rangeWord = R.range === 'Selected round' && R.sel ? 'Round-' + R.sel.course : R.range;
    return Promise.all([loadJsPDF(), statsCover(R, dateTxt)]).then(function (pre) {
      var doc = new window.jspdf.jsPDF({ unit: 'pt', format: 'letter', orientation: 'portrait' }), M = 36, PW = 612, PH = 792, BOT = PH - M - 14, y;
      doc.setProperties({ title: 'Strokewise stats – ' + (R.player || '') + ' ' + R.range, author: R.player, creator: 'Strokewise' });
      doc.addImage(pre[1].data, 'JPEG', 0, 0, PW, PH); doc.addPage(); // v137 cover, the Instagram-picture look
      var LAY = [], IMGS = [], CARDS = [], txt0 = doc.text.bind(doc);
      doc.text = function (t, x, yy, o) {
        var L = Array.isArray(t) ? t : [t], al = (o && o.align) || 'left', lh = doc.getFontSize() * doc.getLineHeightFactor(), pg = doc.getCurrentPageInfo().pageNumber;
        L.forEach(function (s, k) { var w = doc.getTextWidth(String(s)), x0 = al === 'right' ? x - w : al === 'center' ? x - w / 2 : x; if (String(s).trim()) LAY.push({ p: pg, t: String(s), x0: x0, x1: x0 + w, y: yy + k * lh }); });
        return txt0(t, x, yy, o);
      };
      var font = function (sz) { doc.setFont('helvetica', 'normal'); doc.setFontSize(sz); }, ink = function (g) { doc.setTextColor(g == null ? 30 : g); };
      var T = function (t, x, yy, o) { doc.text(P(t), x, yy, o); };
      var header = function (title) {
        font(9); ink(110); T((R.player ? R.player + ' · ' : '') + 'Stats · ' + R.range + ' · ' + dateTxt, M, 26); T('Strokewise', PW - M, 26, { align: 'right' });
        font(16); ink(25); T(title, M, 54); doc.setDrawColor(190); doc.setLineWidth(0.6); doc.line(M, 63, PW - M, 63); doc.setDrawColor(0); ink(); return 82;
      };
      var wrap = function (t, w, sz) { font(sz); return doc.splitTextToSize(P(t), w); };
      // ---- page 1: who / what / baseline, then the averages table ----
      y = header('Summary');
      font(12); ink(30); T((R.player || 'Player') + ' – ' + R.range, M, y); y += 16;
      font(9.5); ink(90);
      [R.shown, 'Strokes gained compared with ' + R.baseline + '.', 'Compare to all rounds: ' + (R.cmp ? 'on (grey = all rounds)' : 'off') + ' · made ' + dateTxt + '.'].forEach(function (l) { wrap(l, PW - 2 * M, 9.5).forEach(function (s) { T(s, M, y); y += 12; }); });
      y += 8; font(11.5); ink(40); T('Averages per round', M, y); y += 22;
      // averages table: label + 1 or 2 number columns, right-aligned numbers
      var nc = R.table[0] ? R.table[0].length : 2, tw = nc > 2 ? [300, 120, 120] : [380, 160], tx0 = M, rh = 22; // v138: full width, roomier rows
      R.table.forEach(function (row, i) {
        if (i === 0) { doc.setFillColor(238, 241, 238); doc.roundedRect(tx0, y - 15, tw.reduce(function (a, b) { return a + b; }, 0), rh, 3, 3, 'F'); }
        font(i === 0 ? 10 : 12); ink(i === 0 ? 85 : 30); var x = tx0;
        row.forEach(function (c, j) { if (j === 0) T(c, x + 5, y); else T(c, x + tw[j] - 5, y, { align: 'right' }); x += tw[j]; });
        if (i) { doc.setDrawColor(228); doc.setLineWidth(0.4); doc.line(tx0, y + 7, x, y + 7); doc.setDrawColor(0); }
        y += rh;
      });
      ink(); y = (function () { var L = wrap(R.tableNote, PW - 2 * M, 8.5); ink(110); doc.text(L, M, y + 4); ink(); return y + 4 + L.length * 10.6 + 10; })();
      // ---- v137: the five categories, each starting on its own page (shared with the round PDF) ----
      var K = { M: M, PW: PW, BOT: BOT, font: font, ink: ink, T: T, wrap: wrap, header: header, IMGS: IMGS, CARDS: CARDS };
      var SPI = statsPlayerInfo(), mgWhoPdf = view.stPlayer && view.stPlayer !== '~none' ? view.stPlayer : SPI.multi ? '' : playerName(); // v144 My Game + My Practice pages (one player only)
      var chain = pdfMyGamePages(doc, { M: M, PW: PW, PH: PH, font: font, ink: ink, T: T, header: header }, mgWhoPdf).then(function () { return pdfStatsCats(doc, R.cats, K); });
      return chain.then(function () {
        var n = doc.getNumberOfPages();
        for (var i = 2; i <= n; i++) { doc.setPage(i); font(8); doc.setTextColor(130); T('Page ' + i + ' of ' + n, PW - M, PH - 18, { align: 'right' }); doc.setTextColor(0); }
        return { kind: 'stats', blob: new Blob([doc.output('arraybuffer')], { type: 'application/pdf' }), pages: n, name: SG.statsFileName(R.player, rangeWord, now.toISOString()),
          layout: { PW: PW, PH: PH, M: M, BOT: BOT, text: LAY, images: IMGS, cards: CARDS }, cats: R.cats.map(function (c) { return { id: c.id, items: c.items.map(function (i) { return i.kind === 'card' ? i.id : i.kind; }) }; }), last: R.last && R.last.id };
      });
    });
  }
  function pinDataRound() { var keep = view.mapScope; view.mapScope = 'round'; var D = pinData(); view.mapScope = keep; return D.holes; }
  function pdfHTML() {
    var p = view.pdf; if (!p) return '';
    if (p.busy) return '<div class="pdfsheet" id="pdfsheet" role="status"><b>Making your PDF report…</b><p class="help muted">Drawing the ' + (p.kind === 'stats' ? 'graphs' : 'maps') + ' – this takes a few seconds.</p></div>';
    if (p.error) return '<div class="pdfsheet" id="pdfsheet"><p class="notice bad">' + esc(p.error) + '</p><button class="big" data-act="pdfclose">Close</button></div>';
    return '<div class="pdfsheet" id="pdfsheet"><b>📄 PDF report ready</b><p class="help" id="pdfname">' + esc(p.name) + ' · ' + p.pages + ' pages</p>' +
      '<button class="primary big" data-act="pdfshare">Share / Save to Files</button>' +
      '<button class="txt" data-act="pdfclose">Close</button></div>';
  }
  function pdfAct(act) {
    if (act === 'stpdf') { view.pdf = { busy: true, kind: 'stats' }; render(); window.scrollTo(0, 0); // v126 Stats PDF
      makeStatsReport().then(function (o) { view.pdf = o; window.__golf.lastPdf = o; render(); }, function (e) { view.pdf = { error: 'Could not make the PDF: ' + (e && e.message) }; render(); }); return; }
    if (act === 'pdf') { view.pdf = { busy: true }; render();
      makeReport().then(function (o) { view.pdf = o; window.__golf.lastPdf = o; render(); }, function (e) { view.pdf = { error: 'Could not make the PDF: ' + (e && e.message) }; render(); }); return; }
    var p = view.pdf; if (!p || !p.blob) return;
    if (act === 'pdfshare') {
      var f = null; try { f = new File([p.blob], p.name, { type: 'application/pdf', lastModified: Date.now() }); } catch (e) {}
      if (f && navigator.canShare && navigator.canShare({ files: [f] })) { navigator.share({ files: [f] }).catch(function (e) { if (!e || e.name !== 'AbortError') pdfDownload(p); }); return; }
      pdfDownload(p); return;
    }
  }
  // ---------- v131 Round story picture (story.js) ----------
  function storyHTML() {
    var p = view.story; if (!p || p.id !== view.roundId) return '';
    if (p.busy) return '<div class="pdfsheet storysheet" id="storysheet" role="status"><b>Making your story picture…</b></div>';
    if (p.error) return '<div class="pdfsheet storysheet" id="storysheet"><p class="notice bad">' + esc(p.error) + '</p><button class="big" data-act="storyclose">Close</button></div>';
    return '<div class="pdfsheet storysheet" id="storysheet"><b>📸 Story picture ready</b>' +
      '<div class="storywrap"><img class="storyprev" id="storyprev" src="' + p.url + '" alt="Round story picture" data-act="storyfull">' +
      '<button class="storyexp" id="storyexp" data-act="storyfull" aria-label="View full screen">⤢</button></div>' +
      '<p class="help muted">Share it, then pick Instagram or TikTok – or Save Image to post it from Photos.</p>' +
      '<button class="primary big" data-act="storyshare" id="storyshare">Share picture</button>' +
      '<button class="txt" data-act="storyclose">Close</button></div>' + (p.full ? storyFullHTML(p) : '');
  }
  // v132 full-screen look at the picture: fits the screen; a tap zooms to 2x to read the numbers, another tap fits again
  function storyFullHTML(p) {
    return '<div class="storyfull" id="storyfull" role="dialog" aria-label="Story picture full screen"><div class="sfscroll" id="sfscroll">' +
      '<img class="sfimg" id="sfimg" src="' + p.url + '" alt="Round story picture" data-act="storyzoom"></div>' +
      '<button class="sfclose" id="sfclose" data-act="storyfullclose" aria-label="Close full screen">✕</button>' +
      '<p class="sfhint" id="sfhint">Tap to zoom</p></div>';
  }
  function storyClose() { if (view.story && view.story.url) URL.revokeObjectURL(view.story.url); view.story = null; }
  function storyAct(act) {
    if (act === 'storyclose') { storyClose(); render(); return; }
    if (act === 'storyfull' || act === 'storyfullclose') { if (view.story && view.story.url) { view.story.full = act === 'storyfull'; render(); } return; }
    if (act === 'storyzoom') { // no re-render, so the zoomed spot stays where it was tapped
      var im = document.getElementById('sfimg'), box = document.getElementById('sfscroll'), hint = document.getElementById('sfhint'); if (!im || !box) return;
      var ev = window.event, rect = im.getBoundingClientRect(), fx = ev && rect.width ? (ev.clientX - rect.left) / rect.width : 0.5, fy = ev && rect.height ? (ev.clientY - rect.top) / rect.height : 0.5;
      var zoom = !im.classList.contains('zoomed'); im.classList.toggle('zoomed', zoom); box.classList.toggle('zoomed', zoom);
      if (hint) hint.textContent = zoom ? 'Tap to fit' : 'Tap to zoom';
      if (zoom) { box.scrollLeft = Math.max(0, fx * im.offsetWidth - box.clientWidth / 2); box.scrollTop = Math.max(0, fy * im.offsetHeight - box.clientHeight / 2); }
      return;
    }
    var r = round(); if (!r) return;
    if (act === 'story') {
      storyClose(); view.story = { busy: true, id: r.id }; render();
      var bl = blOf(r), S = SG.summarize(r, bl), d = STORY.data(r, S, { baselineName: SG.baseline(bl).name, player: r.player || playerName() });
      STORY.makeImage(d, 'img/home-bg.webp').then(function (blob) {
        if (!view.story || view.story.id !== r.id) return;
        view.story = { id: r.id, blob: blob, url: URL.createObjectURL(blob), name: STORY.fileName(r) }; window.__golf.lastStory = view.story; render();
        var el = document.getElementById('storysheet'); if (el && el.scrollIntoView) el.scrollIntoView({ block: 'center' });
      }, function (e) { view.story = { id: r.id, error: 'Could not make the picture: ' + (e && e.message) }; render(); });
      return;
    }
    var p = view.story; if (act !== 'storyshare' || !p || !p.blob) return;
    var f = null; try { f = new File([p.blob], p.name, { type: 'image/png', lastModified: Date.now() }); } catch (e) {}
    if (f && navigator.canShare && navigator.canShare({ files: [f] })) { navigator.share({ files: [f] }).catch(function (e) { if (!e || e.name !== 'AbortError') storyDownload(p); }); return; }
    storyDownload(p);
  }
  function storyDownload(p) { var a = document.createElement('a'); a.href = p.url; a.download = p.name; document.body.appendChild(a); a.click(); setTimeout(function () { a.remove(); }, 4000); toast('Picture downloaded'); }
  function pdfDownload(p) { var u = URL.createObjectURL(p.blob), a = document.createElement('a'); a.href = u; a.download = p.name; document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(u); a.remove(); }, 4000); toast('PDF downloaded'); }
  // ---------- History ----------
  function savedRounds() { return rounds.filter(function (r) { return !SG.roundEmpty(r); }); }
  function playersIn() { var o = {}; savedRounds().forEach(function (r) { if (r.player) o[r.player] = (o[r.player] || 0) + 1; }); return o; }
  function historyHTML() {
    var P = playersIn(), names = Object.keys(P).sort(), multi = names.length + (savedRounds().some(function (r) { return !r.player; }) && names.length ? 1 : 0) > 1;
    if (!multi || (view.histPlayer && view.histPlayer !== '~none' && !P[view.histPlayer])) view.histPlayer = null;
    var list = savedRounds().filter(function (r) { return !view.histPlayer || (view.histPlayer === '~none' ? !r.player : r.player === view.histPlayer); }).sort(function (a, b) { return String(b.date || '').localeCompare(String(a.date || '')); });
    var h = '<div class="frostpage theme-sky histpage"><div class="topbar frost"><button class="txt frostbtn" data-act="home">‹ Home</button><div class="title"><b>Rounds</b><span>' + list.length + ' round' + (list.length === 1 ? '' : 's') + ', newest first</span></div><span class="tbspace"></span></div>';
    // v102: compact player filter + one slim row of small tools, then a tight table-like list (score circle, holes, date, to par/SG, course)
    if (multi) h += '<div class="hchips" id="playerchips" role="group" aria-label="Filter by player">' + [''].concat(names).map(function (n) {
        var sel = (view.histPlayer || '') === n; return '<button class="frostchip' + (sel ? ' sel' : '') + '" data-act="histplayer" data-v="' + esc(n) + '" aria-pressed="' + sel + '">' + (n ? esc(n) + ' (' + P[n] + ')' : 'All players') + '</button>'; }).join('') +
      (savedRounds().some(function (r) { return !r.player; }) ? '<button class="frostchip' + (view.histPlayer === '~none' ? ' sel' : '') + '" data-act="histplayer" data-v="~none">No name</button>' : '') + '</div>';
    var M = view.mv && view.mv.sel ? view.mv : null;
    if (M) { var allOn = list.length && list.every(function (r) { return M.ids[r.id]; }); h += '<p class="mvhelp" id="mvhelp">Tap the rounds to move to another player.</p><button class="txt mvall" data-act="mvall" id="mvall">' + (allOn ? 'Clear all' : 'Select all ' + list.length + ' shown') + '</button>'; }
    else {
      var tool = function (id, act, ic, lbl, extra) { return '<button class="htool" id="' + id + '" data-act="' + act + '"' + (extra || '') + '><span aria-hidden="true">' + ic + '</span>' + lbl + '</button>'; };
      h += '<div class="histtools htools" id="histtools">' + tool('addround', 'addopen', '📥', 'Add a round') +
        (list.length ? tool('chgplayer', 'mvstart', '👤', 'Change player') : '') +
        (list.length >= 2 ? tool('cmpopen', 'compare', '⚖', 'Best vs worst') : '') +
        (list.length ? tool('histbz', 'bzopen', '🎯', 'Scoring chances', ' data-v="all" data-id="' + list[0].id + '"') : '') + '</div>';
    }
    if (!list.length) h += '<p class="muted frostnote">No rounds yet. Start one from Home.</p>';
    else h += '<div class="hhead" id="hhead" aria-hidden="true">' + (M ? '<span class="hcchk"></span>' : '') + '<span class="hc1">Score</span><span class="hc2">Holes</span><span class="hc3">Date</span><span class="hc4">To par<br>SG</span><span class="hc5">Course</span>' + (M ? '' : '<span class="hc6"></span>') + '</div>';
    var curId = localStorage.getItem(CUR);
    h += '<div id="histlist" class="hlist">';
    list.forEach(function (r) {
      var S = SG.summarize(r), on = M && M.ids[r.id], d = new Date(r.date), nH = r.holes.length, unf = S.holesDone < nH || r.id === curId;
      var pp = S.holesDone ? S.toPar * 18 / S.holesDone : null, tint = pp == null ? 'none' : pp < -0.5 ? 'under' : pp <= 18.5 ? 'even' : 'over';
      var sub = [r.tee, r.player].filter(Boolean).map(esc).join(' · ');
      var lbl = d.toLocaleDateString() + (r.course ? ' ' + r.course : '');
      h += '<div class="hrow' + (M ? ' mvon' + (on ? ' mvsel' : '') : '') + '" data-id="' + r.id + '"><button class="hist" data-act="' + (M ? 'mvtoggle' : 'open') + '" data-id="' + r.id + '"' + (M ? ' role="checkbox" aria-checked="' + !!on + '"' : '') + ' aria-label="' + esc(lbl + (S.holesDone ? ', ' + S.strokes + ' (' + toPar(S.toPar) + ')' : '') + (unf ? ', unfinished' : '')) + '">' +
        (M ? '<span class="mvchk" aria-hidden="true">' + (on ? '✓' : '') + '</span>' : '') +
        '<span class="hcirc tp-' + tint + '">' + (S.holesDone ? S.strokes : '–') + '</span>' +
        '<span class="hholes' + (unf ? ' unf' : '') + '" title="' + (unf ? S.holesDone + ' of ' + nH + ' holes – unfinished' : nH + ' holes') + '">' + (unf ? S.holesDone : nH) + '</span>' +
        '<span class="hdate"><b>' + ('0' + (d.getMonth() + 1)).slice(-2) + '/' + ('0' + d.getDate()).slice(-2) + '</b><small>' + d.getFullYear() + '</small></span>' +
        '<span class="hpar"><b>' + (S.holesDone ? toPar(S.toPar) : '–') + '</b><small class="' + sgCls(S.sgTotal) + '">' + (S.holesDone ? fmtSG(S.sgTotal) : '') + '</small></span>' +
        '<span class="hmain"><b>' + esc(r.course || 'Round') + '</b><small>' + (unf ? '<i class="hunf">Unfinished</i>' + (sub ? ' · ' : '') : '') + (sub || (unf ? '' : '&nbsp;')) + '</small></span></button>' +
        (M ? '' : '<button class="hdel" data-act="delHist" data-id="' + r.id + '" aria-label="Delete round ' + esc(lbl) + '"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/></svg></button>') + '</div>';
    });
    return h + '</div>' + (view.addr ? addSheetHTML() : '') + (M ? mvBarHTML() : '') + (view.mv && view.mv.from === 'history' && view.mv.sheet ? mvSheetHTML() : '') + '</div>';
  }

  // ---------- v116 Stats: one small graph per number + scoring curves for par 3 / 4 / 5 ----------
  // Numbers per round come from the same code as the round screens: strokes gained = the scorecard TOT column (scorecardData),
  // fairways / GIR = SG.summarize like the Quick view, putts = summarize().puttList (2-putts / 3-putts per hole by its putt count).
  // Rounds shown: All rounds | Last 5 | Selected round (picked from a scrolling list). "Compare to all rounds" overlays all rounds (grey, dashed).
  var ST_SG = [ // id, title, colour, help
    ['tot', 'Total (TOT)', '#34495e', 'Every shot on the round’s finished holes.'],
    ['ott', 'Off the tee (OTT)', '#1f73c9', 'Tee shots on par 4s and 5s.'],
    ['app', 'Approach (APP)', '#2e9d4f', 'Shots from more than 30 yd that are not tee shots on par 4s and 5s (par-3 tee shots count here).'],
    ['arg', 'Around the green (ARG)', '#e8871e', 'Shots from 30 yd and in that are not on the green.'],
    ['putt', 'Putting (PUTT)', '#7c4dcc', 'Every stroke from the green.']];
  var ST_PCT = [ // id, title, colour, help
    ['fir', 'Fairways hit', '#1f73c9', 'Tee shots on par 4s and 5s that finished in the fairway (layups left out). A round with no par 4s or 5s has no point.'],
    ['gir', 'Greens in regulation (GIR)', '#2e9d4f', 'On the green in par minus 2 strokes or fewer.']];
  var ST_PAR = { 3: '#1f73c9', 4: '#2e9d4f', 5: '#e8871e' };
  var ST_NAMES = ['Eagle', 'Birdie', 'Par', 'Bogey', 'Double', 'Triple'];
  var ST_ROWS = [ // label, value of one round, decimals, kind
    ['Strokes gained – TOT', function (p) { return p.sg.tot; }, 2, 'sg'], ['Off the tee (OTT)', function (p) { return p.sg.ott; }, 2, 'sg'],
    ['Approach (APP)', function (p) { return p.sg.app; }, 2, 'sg'], ['Around the green (ARG)', function (p) { return p.sg.arg; }, 2, 'sg'],
    ['Putting (PUTT)', function (p) { return p.sg.putt; }, 2, 'sg'], ['Score', function (p) { return p.score; }, 1], ['To par', function (p) { return p.toPar; }, 1, 'par'],
    ['Putts per round', function (p) { return p.putts; }, 1], ['Putts per GIR hole', function (p) { return p.ppg; }, 2], ['Fairways hit', function (p) { return p.fir; }, 0, 'pct'],
    ['GIR', function (p) { return p.gir; }, 0, 'pct'], ['Putts made inside 10 ft', function (p) { return p.p10; }, 0, 'pct'],
    ['2-putts per round', function (p) { return p.two; }, 1], ['3-putts per round', function (p) { return p.three; }, 1]];
  // one round's numbers (blSel = '' -> the round's own baseline, as on its Round stats page)
  function statsRound(r, blSel) {
    var bl = blSel || blOf(r), S = SG.summarize(r, bl), D = scorecardData(r, S), tot = D.groups.length - 1;
    var sgOf = function (lbl) { var c = D.rows.filter(function (x) { return x.lbl === lbl; })[0].sums[tot]; return c.k === 'sg' ? c.v : 0; };
    var first = S.puttList.filter(SG.firstPutt), p10 = SG.puttsInside10(S.puttList), girH = S.holes.filter(function (a) { return a && a.done && a.gir; });
    // v116: scores on finished par 3 / 4 / 5 holes, bucketed Eagle-or-better … Triple-or-worse
    var dist = { 3: [0, 0, 0, 0, 0, 0], 4: [0, 0, 0, 0, 0, 0], 5: [0, 0, 0, 0, 0, 0] }, parN = { 3: { n: 0, s: 0 }, 4: { n: 0, s: 0 }, 5: { n: 0, s: 0 } };
    S.holes.forEach(function (a, i) { var par = Number((r.holes[i] || {}).par); if (!a || !a.done || !dist[par]) return;
      dist[par][Math.max(0, Math.min(5, a.strokes - par + 2))]++; parN[par].n++; parN[par].s += a.strokes; });
    return { id: r.id, date: r.date, course: r.course || 'Round', bl: bl, holes: S.holesDone, score: S.strokes, toPar: S.toPar, putts: S.putts,
      sg: { tot: sgOf('Tot'), ott: parN[4].n + parN[5].n ? sgOf('OTT') : null, arg: sgOf('ARG'), app: sgOf('APP'), putt: sgOf('Putt') },
      fir: S.fwTotal ? 100 * S.fwHit / S.fwTotal : null, gir: S.girHoles ? 100 * S.gir / S.girHoles : null, p10: p10.pct, p10n: p10.attempts, p10m: p10.made,
      two: first.filter(function (p) { return p.holePutts === 2; }).length, three: SG.threePutts(S.puttList).three,
      ppg: girH.length ? girH.reduce(function (t, a) { return t + a.putts; }, 0) / girH.length : null, dist: dist, parN: parN,
      // v125: SG by first-putt distance / short-game lie and distance (SG.statBuckets), drives for the box chart, approach proximity
      b: SG.statBuckets(S), drv: S.teeMap.filter(function (m) { return !m.layup && m.kind !== 'ob' && !m.pen && m.hit != null && isFinite(m.hit) && m.hit > 0; }).map(function (m) { return { hit: Number(m.hit), club: m.club || '' }; }),
      fp: S.puttList.filter(SG.firstPutt).map(function (p) { return { n: 1, ft: p.ft, made: p.made, endDir: p.endDir || '', endFt: p.endFt, endLie: p.endLie }; }), // v126 putt misses; v127 + 2nd putt length
      prox: stProx(S.proxList), proxN: S.proxList.filter(function (m) { return m.proxFt != null && SG.inBucket('all', m.from); }).length,
      unf: S.holesDone < r.holes.length };
  }
  // v125: average feet from the hole after the regulation approach from 40–200 yd (the Proximity page's "All 40–200 yd", every shot)
  function stProx(L) { var a = L.filter(function (m) { return m.proxFt != null && SG.inBucket('all', m.from); }); return a.length ? a.reduce(function (t, m) { return t + m.proxFt; }, 0) / a.length : null; }
  function statsPlayerInfo() {
    var P = playersIn(), names = Object.keys(P).sort(), noName = savedRounds().some(function (r) { return !r.player; }), multi = names.length + (noName && names.length ? 1 : 0) > 1;
    if (view.stPlayer === undefined) view.stPlayer = view.histPlayer || (multi && P[playerName()] ? playerName() : null); // default: the Rounds filter, else this phone's player
    if (!multi || (view.stPlayer && view.stPlayer !== '~none' && !P[view.stPlayer])) view.stPlayer = null;
    return { P: P, names: names, noName: noName, multi: multi };
  }
  // finished rounds only – the same test the Rounds list uses for "Unfinished" (all holes done and not the round in progress)
  function statsData() {
    statsPlayerInfo(); var cur = localStorage.getItem(CUR), who = view.stPlayer, unf = 0;
    var list = savedRounds().filter(function (r) { return !who || (who === '~none' ? !r.player : r.player === who); }).filter(function (r) {
      var S = SG.summarize(r), ok = S.holesDone === r.holes.length && r.holes.length > 0 && r.id !== cur; if (!ok) unf++; return ok; })
      .sort(function (a, b) { return String(a.date || '').localeCompare(String(b.date || '')); });
    var all = list.map(function (r) { return statsRound(r, view.stBl || ''); }), mode = view.stMode || 'all', selIdx = -1;
    var openOK = function (id) { return id && id === (view.roundId || cur) && savedRounds().some(function (r) { return r.id === id && SG.summarize(r).holesDone; }); };
    if (mode === 'sel') { all.forEach(function (p, i) { if (p.id === view.stRid) selIdx = i; }); if (selIdx < 0 && all.length && !openOK(view.stRid)) { selIdx = all.length - 1; view.stRid = all[selIdx].id; } } // default: newest round
    var avg = function (L) { var o = { n: L.length }; ST_ROWS.forEach(function (d) { o[d[0]] = SG.trendAvg(L.map(d[1])); }); return o; };
    // v125: the round open now (the one last opened, else the round in progress) – pickable even while unfinished (its finished holes count)
    var openId = view.roundId || cur, openR = openId ? list.filter(function (r) { return r.id === openId; })[0] : null, openP = null;
    if (openR) openP = all.filter(function (p) { return p.id === openId; })[0];
    else if (openId) { var oR = savedRounds().filter(function (r) { return r.id === openId && (!who || (who === '~none' ? !r.player : r.player === who)); })[0];
      if (oR && SG.summarize(oR).holesDone) { openP = statsRound(oR, view.stBl || ''); openP.open = true; } }
    var selX = mode === 'sel' && openP && openP.open && view.stRid === openId ? openP : null;
    if (selX) selIdx = -1; else if (mode === 'sel' && selIdx < 0 && all.length) { selIdx = all.length - 1; view.stRid = all[selIdx].id; }
    var shown = mode === '5' ? SG.lastN(all, 5) : mode === 'sel' ? (selX ? [selX] : selIdx >= 0 ? [all[selIdx]] : []) : all.slice();
    return { all: all, shown: shown, mode: mode, selIdx: selIdx, sel: selX || (selIdx >= 0 ? all[selIdx] : null), selExtra: !!selX, openP: openP || null, cmp: !!view.stCmp && mode !== 'all', unfinished: unf, avgShown: avg(shown), avgAll: avg(all) };
  }
  function stDate(d, short) { d = new Date(d); return short ? (d.getMonth() + 1) + '/' + d.getDate() : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }
  function stNum(v, dec, kind) {
    if (v == null) return '–';
    if (kind === 'sg') return fmtSG(v); if (kind === 'pct') return Math.round(v) + '%';
    var s = (Math.round(v * Math.pow(10, dec)) / Math.pow(10, dec)).toFixed(dec); if (kind === 'par') return v > 0.04 ? '+' + s : Math.abs(v) < 0.05 ? 'E' : s; return s;
  }
  function stF(v) { return Math.round(v * 10) / 10; }
  // smooth curve through the points that never overshoots (monotone cubic), so it never dips below 0%
  function stSmooth(P) {
    var n = P.length, d = [], m = [], i; if (n < 2) return '';
    for (i = 0; i < n - 1; i++) d.push((P[i + 1][1] - P[i][1]) / (P[i + 1][0] - P[i][0]));
    m[0] = d[0]; m[n - 1] = d[n - 2]; for (i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
    for (i = 0; i < n - 1; i++) { if (!d[i]) { m[i] = 0; m[i + 1] = 0; continue; } var a = m[i] / d[i], b = m[i + 1] / d[i], s2 = a * a + b * b; if (s2 > 9) { var t = 3 / Math.sqrt(s2); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; } }
    var s = 'M' + stF(P[0][0]) + ' ' + stF(P[0][1]);
    for (i = 0; i < n - 1; i++) { var h = (P[i + 1][0] - P[i][0]) / 3; s += 'C' + stF(P[i][0] + h) + ' ' + stF(P[i][1] + m[i] * h) + ' ' + stF(P[i + 1][0] - h) + ' ' + stF(P[i + 1][1] - m[i + 1] * h) + ' ' + stF(P[i + 1][0]) + ' ' + stF(P[i + 1][1]); }
    return s;
  }
  // one number per round over time. All / Last 5: that line (solid) + its average (dashed). Selected round: every round in light grey,
  // the chosen round as a big dot. Compare: all rounds' average as a grey dashed line (Last 5 also shows the older rounds in grey).
  function stTrend(id, D, val, o) {
    var W = 358, H = 150, L = 34, R = 10, T = 14, B = 22, pw = W - L - R, ph = H - T - B, mode = D.mode, cmp = D.cmp;
    // v125: o.avg(list) = a weighted average (per shot / per putt) instead of the mean of the rounds; o.nOf(p) = shots behind a point;
    // o.ft = a distance in feet (no plus / minus, no zero line); D.selExtra = the picked round is the open, unfinished round (drawn after the others)
    var pts = mode === '5' && !cmp ? D.shown : D.selExtra ? D.all.concat([D.sel]) : D.all, n = pts.length, solid0 = mode === 'sel' ? n : mode === '5' && cmp ? n - D.shown.length : 0, hl = mode === 'sel' ? (D.selExtra ? n - 1 : D.selIdx) : -1;
    var avgOf = function (L) { return o.avg ? o.avg(L) : SG.trendAvg(L.map(val)); };
    var avgSel = avgOf(D.shown), avgAll = avgOf(D.all), fmt = function (v) { return v == null ? '–' : o.pct ? Math.round(v) + '%' : o.ft ? Math.round(v) + ' ft' : fmtSG(v); };
    var lo = 0, hi = 100, step = 25;
    if (!o.pct) { var vals = [0]; pts.forEach(function (p) { var v = val(p); if (v != null) vals.push(v); }); if (avgAll != null) vals.push(avgAll);
      var mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals), span = Math.max(mx - mn, o.minSpan || 1);
      step = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50].filter(function (s) { return span / s <= 4; })[0] || 50; lo = Math.floor(mn / step) * step; hi = Math.ceil(mx / step) * step; if (hi === lo) hi = lo + step; }
    var X = function (i) { return L + (n === 1 ? pw / 2 : i * pw / (n - 1)); }, Y = function (v) { return T + ph - (v - lo) / (hi - lo) * ph; };
    var s = '<svg class="stchart sttrend" id="' + id + 'chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(o.title + ' per round') + '">';
    for (var v = lo; v <= hi + 1e-9; v += step) { var yy = stF(Y(v)); s += '<line class="stgrid" x1="' + L + '" x2="' + (W - R) + '" y1="' + yy + '" y2="' + yy + '"/><text class="sty" x="' + (L - 6) + '" y="' + stF(yy + 3.5) + '" text-anchor="end">' + (o.pct ? Math.round(v) + '%' : o.ft ? Math.round(v) : (v > 0 ? '+' : '') + (step < 1 ? v.toFixed(1) : Math.round(v))) + '</text>'; }
    if (!o.pct && !o.ft) s += '<line class="stzero" id="' + id + 'zero" x1="' + L + '" x2="' + (W - R) + '" y1="' + stF(Y(0)) + '" y2="' + stF(Y(0)) + '"/>';
    var every = Math.max(1, Math.ceil(n / 6));
    pts.forEach(function (p, i) { if (i !== n - 1 && (i % every || (i && n - 1 - i < every * 0.6))) return;
      s += '<text class="stx" x="' + stF(X(i)) + '" y="' + (H - 6) + '" text-anchor="middle">' + stDate(p.date, true) + '</text>'; });
    var path = function (a, b) { var d = '', pen = false; for (var i = a; i <= b; i++) { var vv = val(pts[i]); if (vv == null) { pen = false; continue; } d += (pen ? 'L' : 'M') + stF(X(i)) + ' ' + stF(Y(vv)); pen = true; } return d; };
    if (solid0 > 0) s += '<path class="stline stlight" id="' + id + 'light" d="' + path(0, Math.min(solid0, n - 1)) + '"/>';
    if (solid0 < n) s += '<path class="stline" id="' + id + 'line" d="' + path(solid0, n - 1) + '" stroke="' + o.color + '"/>';
    if (cmp && avgAll != null) s += '<line class="stavgall" id="' + id + 'allavg" x1="' + L + '" x2="' + (W - R) + '" y1="' + stF(Y(avgAll)) + '" y2="' + stF(Y(avgAll)) + '"/>';
    if (mode !== 'sel' && avgSel != null) s += '<line class="stavg" id="' + id + 'avg" x1="' + stF(n > 1 && solid0 < n - 1 ? X(solid0) : L) + '" x2="' + (W - R) + '" y1="' + stF(Y(avgSel)) + '" y2="' + stF(Y(avgSel)) + '" stroke="' + o.color + '"/>';
    pts.forEach(function (p, i) { var vv = val(p); if (vv == null || i === hl) return; var on = i >= solid0;
      s += '<circle class="stdot' + (on ? '' : ' stlight') + '" cx="' + stF(X(i)) + '" cy="' + stF(Y(vv)) + '" r="' + (on ? 3 : 2.4) + '"' + (on ? ' fill="' + o.color + '"' : '') + '/>'; });
    if (hl >= 0) { var hv = val(pts[hl]); if (hv != null) s += '<circle class="stdot sthl" id="' + id + 'hl" cx="' + stF(X(hl)) + '" cy="' + stF(Y(hv)) + '" r="5.2" fill="' + o.color + '"/><text class="stval" x="' + stF(Math.min(W - R - 14, Math.max(L + 14, X(hl)))) + '" y="' + stF(Math.max(10, Y(hv) - 9)) + '" text-anchor="middle">' + fmt(hv) + '</text>'; }
    pts.forEach(function (p, i) { var half = n === 1 ? pw / 2 : pw / (n - 1) / 2, x0 = Math.max(L, X(i) - half), x1 = Math.min(W - R, X(i) + half);
      s += '<rect class="sthit" ' + (mode === 'sel' ? 'data-act="stround" data-id="' + esc(p.id) + '"' : 'data-act="stpt" data-c="' + id + '" data-i="' + i + '"') + ' x="' + stF(x0) + '" y="' + T + '" width="' + stF(x1 - x0) + '" height="' + ph + '"><title>' + esc(stDate(p.date) + ' · ' + p.course + ' · ' + fmt(val(p))) + '</title></rect>'; });
    s += '</svg>';
    var head = mode === 'sel' ? 'This round <em>' + fmt(D.sel ? val(D.sel) : null) + '</em>' + (cmp ? ' · all avg <em>' + fmt(avgAll) + '</em>' : '')
      : (mode === '5' ? 'Last 5 avg ' : 'Avg ') + '<em>' + fmt(avgSel) + '</em>' + (cmp ? ' · all <em>' + fmt(avgAll) + '</em>' : '');
    var few = mode !== 'sel' && D.shown.filter(function (p) { return val(p) != null; }).length < 2 ? '<p class="stfew">Not enough rounds yet for a trend – it starts with 2 rounds.</p>' : '';
    var nSum = function (L) { return L.reduce(function (t, p) { return t + (o.nOf(p) || 0); }, 0); }, nLine = o.nOf ? '<p class="stn" id="' + id + 'n">n = ' + nSum(D.shown) + ' ' + o.unit + (mode === 'sel' ? ' this round' : mode === '5' ? ' in the last 5' : '') +
      (cmp ? ' · all rounds: ' + nSum(D.all) : '') + (nSum(D.shown) ? '' : ' – nothing to show yet') + (o.nExtra ? o.nExtra : '') + '</p>' : '';
    var tip = '', sel = view.stSel && view.stSel.c === id ? view.stSel.i : null;
    if (sel != null && pts[sel]) { var p = pts[sel];
      tip = '<div class="sttip" id="' + id + 'tip"><div class="sttiph">' + esc(stDate(p.date)) + ' · ' + esc(p.course) + '<button class="sttipx" data-act="stpt" data-c="' + id + '" data-i="' + sel + '" aria-label="Close">×</button></div>' +
        '<div class="sttipm">' + esc(o.short) + ' ' + fmt(val(p)) + (o.nOf ? ' (n = ' + (o.nOf(p) || 0) + ')' : '') + ' · Score ' + p.score + ' (' + toPar(p.toPar) + ') · ' + p.putts + ' putts</div></div>'; }
    var key = mode === 'sel' ? 'Big dot = this round; tap a grey dot to pick another.' + (cmp ? ' Grey dashed = all-rounds average.' : '')
      : 'Dashed = average' + (mode === '5' ? ' of the last 5' : '') + '.' + (cmp ? ' Grey = older rounds; grey dashed = all-rounds average.' : '');
    return '<div class="stcard stgraph" id="st-' + id + '"><div class="sth"><span>' + esc(o.title) + '</span><span class="stv" id="' + id + 'val">' + head + '</span></div>' + s + nLine + few + tip +
      (o.helpIn && nLine ? '<p class="help stnote" id="' + id + 'help" data-infoin="' + id + 'n">' : '<p class="stnote">') + esc(o.help) + ' ' + key + '</p></div>';
  }
  // scoring curve for one par: % of finished holes at each score, Eagle (or better) … Triple (or worse)
  function stDist(par, D) {
    var sum = function (L) { var c = [0, 0, 0, 0, 0, 0], n = 0, st = 0; L.forEach(function (p) { p.dist[par].forEach(function (x, i) { c[i] += x; }); n += p.parN[par].n; st += p.parN[par].s; }); return { c: c, n: n, avg: n ? st / n : null }; };
    var fl = !!D.flip, A = fl ? sum(D.all) : sum(D.shown), Z = fl ? sum(D.shown) : sum(D.all), cmp = fl || D.cmp, col = ST_PAR[par], id = 'par' + par;
    var who = fl ? 'these rounds' : D.mode === 'sel' ? 'this round' : D.mode === '5' ? 'the last 5 rounds' : 'these rounds';
    var h = '<div class="stcard stgraph stdistcard" id="st-' + id + '"><div class="sth"><span>Par ' + par + ' scores</span><span class="stv" id="' + id + 'val">' +
      (fl ? (A.n ? 'all <em>' + A.avg.toFixed(2) + '</em>' : '') + (Z.n ? ' · this round <em>' + Z.avg.toFixed(2) + '</em>' : '') :
      (A.n ? 'avg <em>' + A.avg.toFixed(2) + '</em>' + (cmp && Z.n ? ' · all <em>' + Z.avg.toFixed(2) + '</em>' : '') : '')) + '</span></div>';
    if (!A.n) return h + '<p class="stfew" id="' + id + 'none">No par ' + par + ' holes in ' + who + ' yet.</p></div>';
    var pc = function (S) { return S.c.map(function (x) { return S.n ? 100 * x / S.n : 0; }); }, pa = pc(A), pz = cmp && Z.n ? pc(Z) : null;
    var mx = Math.max.apply(null, pa.concat(pz || [])), top = Math.min(100, Math.max(20, Math.ceil(mx / 10) * 10)); if (top % 20) top += 10;
    var W = 358, H = 176, L = 34, R = 10, T = 16, B = 36, pw = W - L - R, ph = H - T - B;
    var X = function (i) { return L + pw * (i + 0.5) / 6; }, Y = function (v) { return T + ph - v / top * ph; };
    var s = '<svg class="stchart stdist" id="' + id + 'chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc('Par ' + par + ' scores: ' + ST_NAMES.map(function (nm, i) { return nm + ' ' + Math.round(pa[i]) + '%'; }).join(', ')) + '">';
    [0, top / 2, top].forEach(function (v) { var yy = stF(Y(v)); s += '<line class="stgrid" x1="' + L + '" x2="' + (W - R) + '" y1="' + yy + '" y2="' + yy + '"/><text class="sty" x="' + (L - 6) + '" y="' + stF(yy + 3.5) + '" text-anchor="end">' + v + '%</text>'; });
    ST_NAMES.forEach(function (nm, i) { s += '<text class="stx stxn" x="' + stF(X(i)) + '" y="' + (H - 19) + '" text-anchor="middle">' + nm + '</text><text class="stx stxs" x="' + stF(X(i)) + '" y="' + (H - 6) + '" text-anchor="middle">' + (par - 2 + i) + '</text>'; });
    var P = pa.map(function (v, i) { return [X(i), Y(v)]; }), curve = stSmooth(P);
    var zDraw = '';
    if (pz) { var Pz = pz.map(function (v, i) { return [X(i), Y(v)]; }), DK = fl ? ' style="stroke:#1f2d38;stroke-dasharray:5 4;stroke-width:1.8"' : '', DD = fl ? ' style="fill:#fff;stroke:#1f2d38;stroke-width:1.4"' : '';
      zDraw = '<path class="stline stcmpline" id="' + id + (fl ? 'this' : 'all') + '"' + DK + ' d="' + stSmooth(Pz) + '"/>' + Pz.map(function (q) { return '<circle class="stdot stcmpdot"' + DD + ' cx="' + stF(q[0]) + '" cy="' + stF(q[1]) + '" r="2.4"/>'; }).join(''); }
    if (pz && !fl) s += zDraw;
    s += '<path class="starea" d="' + curve + 'L' + stF(X(5)) + ' ' + stF(Y(0)) + 'L' + stF(X(0)) + ' ' + stF(Y(0)) + 'Z" fill="' + col + '"/>';
    s += '<path class="stline" id="' + id + 'line" d="' + curve + '" stroke="' + col + '"/>';
    P.forEach(function (q, i) { s += '<circle class="stdot" data-b="' + i + '" cx="' + stF(q[0]) + '" cy="' + stF(q[1]) + '" r="3" fill="' + col + '"/><text class="stval" data-b="' + i + '" x="' + stF(q[0]) + '" y="' + stF(Math.max(9, q[1] - 9)) + '" text-anchor="middle">' + Math.round(pa[i]) + '%</text>'; });
    if (pz && fl) s += zDraw; // round PDF: this round's dashed line on top of the all-rounds colour
    s += '</svg>';
    return h + s + '<p class="stn" id="' + id + 'n">' + (fl ? 'all rounds: ' + A.n + ' hole' + (A.n === 1 ? '' : 's') + ' (colour) · this round: ' + Z.n + ' (dashed)' : 'n = ' + A.n + ' hole' + (A.n === 1 ? '' : 's') + (cmp ? ' · all rounds: ' + Z.n + ' holes (grey dashed)' : '')) + '</p>' +
      '<p class="stnote">Share of finished par-' + par + ' holes at each score (number of strokes underneath). Eagle includes anything better (hole-in-one, albatross); Triple includes anything worse.</p></div>';
  }
  // v125: drive distance box chart on the Stats page (the Club performance box plot): the rounds shown (blue) and, with Compare, all rounds (grey).
  // Same drives as the round's Avg drive (no OB / penalty / layup tee shots, a measurable length); Driver only when most drives have a club.
  function stDrives(L) { var all = [], c = 0; L.forEach(function (p) { (p.drv || []).forEach(function (m) { all.push(m); if (m.club) c++; }); });
    var drv = all.length && c / all.length > 0.5, d = (drv ? all.filter(function (m) { return m.club === 'Driver'; }) : all).map(function (m) { return m.hit; }); return { n: d.length, d: d, driverOnly: drv }; }
  function stBox(D) {
    var A = stDrives(D.shown), Z = D.cmp ? stDrives(D.all) : null, two = !!(Z && Z.n), who = D.mode === 'sel' ? 'This round' : D.mode === '5' ? 'Last 5' : 'All rounds', r = Math.round;
    var mean = function (V) { return V.d.reduce(function (a, b) { return a + b; }, 0) / V.n; }, med = function (V) { return clubQuart(V.d)(0.5); };
    var h = '<div class="stcard stgraph" id="st-drive"><div class="sth"><span>' + (A.driverOnly || (Z && Z.driverOnly) ? 'Driver distance' : 'Drive distance') + '</span><span class="stv" id="driveval">' +
      (A.n ? (D.mode === 'sel' ? 'This round' : D.mode === '5' ? 'Last 5' : 'Avg') + ' <em>' + r(mean(A)) + ' yd</em>' + (two ? ' · all <em>' + r(mean(Z)) + ' yd</em>' : '') : '') + '</span></div>';
    if (!A.n) return h + '<p class="stfew" id="drivenone">No measurable drives in ' + (D.mode === 'sel' ? 'this round' : 'these rounds') + ' yet.</p></div>';
    var vals = A.d.concat(two ? Z.d : []), lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals), span = Math.max(hi - lo, 10), step = span <= 35 ? 5 : span <= 90 ? 10 : span <= 180 ? 20 : 50;
    var pad = hi - lo < 10 ? (10 - (hi - lo)) / 2 : 0, a0 = Math.floor((lo - pad) / step) * step, a1 = Math.ceil((hi + pad) / step) * step; if (a1 === a0) a1 = a0 + step;
    var rows = two ? [[A, 'stdrv', who], [Z, 'stdrvall', 'All rounds']] : [[A, 'stdrv', '']], x0 = two ? 74 : 18, x1 = 340, rh = 28, gap = 12, top = 8, yAx = top + rows.length * rh + (rows.length - 1) * gap + 6, H = yAx + 30;
    var X = function (v) { return (x0 + (v - a0) / (a1 - a0) * (x1 - x0)).toFixed(1); };
    var o = '<svg class="stchart stbox" id="drivechart" viewBox="0 0 358 ' + H + '" role="img" aria-label="' + esc(rows.map(function (R) { var V = R[0]; return (R[2] || who) + ': ' + V.n + ' drives, shortest ' + r(Math.min.apply(null, V.d)) + ', median ' + r(med(V)) + ', average ' + r(mean(V)) + ', longest ' + r(Math.max.apply(null, V.d)) + ' yards'; }).join('; ')) + '">';
    for (var t = a0; t <= a1 + 1e-9; t += step) o += '<line class="stgrid" x1="' + X(t) + '" y1="2" x2="' + X(t) + '" y2="' + yAx + '"/><text class="stx" x="' + X(t) + '" y="' + (yAx + 13) + '" text-anchor="middle">' + t + '</text>';
    o += '<line class="staxis" x1="' + x0 + '" y1="' + yAx + '" x2="' + x1 + '" y2="' + yAx + '"/>';
    rows.forEach(function (R, i) { var yT = top + i * (rh + gap), grey = R[1] === 'stdrvall';
      if (R[2]) o += '<text class="sty stboxlab" x="2" y="' + (yT + rh / 2 + 3.5) + '">' + R[2] + '</text>';
      o += boxShapes(R[0].d, X, yT, yT + rh, R[1], grey ? { line: '#8f9aa5', fill: 'rgba(143,154,165,.14)', med: '#6d7a86', mean: '#6d7a86' } : { line: '#1f73c9', fill: 'rgba(31,115,201,.16)', med: '#155ba3', mean: '#23313d' }); });
    o += '<text class="stx" x="' + ((x0 + x1) / 2) + '" y="' + (yAx + 27) + '" text-anchor="middle">Yards</text></svg>';
    var sum = function (V) { return V.n === 1 ? r(V.d[0]) + ' yd' : 'min ' + r(Math.min.apply(null, V.d)) + ' · median ' + r(med(V)) + ' · avg ' + r(mean(V)) + ' · max ' + r(Math.max.apply(null, V.d)) + ' yd'; };
    return h + o + '<p class="stn" id="driven">n = ' + A.n + (A.n === 1 ? ' drive' : '') + ' · ' + sum(A) + (two ? '<br>All rounds: n = ' + Z.n + ' · ' + sum(Z) : '') + '</p>' +
      '<p class="stnote">Tee shots on par 4s and 5s, hole length minus what was left' + (A.driverOnly ? ' (Driver only)' : '') + '; OB, penalty and layup tee shots left out. Box = middle half of the drives, line = median, whiskers = shortest and longest, ◇ = average.</p></div>';
  }
  // v125: above the par 3 / 4 / 5 curves – a one-tap "open round vs all rounds", the Compare switch and a small legend
  function stParBar(D) {
    var O = D.openP, isOpen = O && D.mode === 'sel' && D.sel && D.sel.id === O.id, b = '<div class="stparbar" id="stparbar">';
    if (O && !(isOpen && D.cmp)) b += '<button class="stparcur" id="stparcur" data-act="stcur">' + (O.open ? 'Round in progress' : 'Open round') + ' (' + esc(stDate(O.date, true)) + ') vs all rounds</button>';
    if (D.mode !== 'all') b += '<button class="stcmp' + (D.cmp ? ' on' : '') + '" id="stcmp2" data-act="stcmp" aria-pressed="' + D.cmp + '"><i aria-hidden="true"></i>Compare to all rounds</button>';
    b += '</div>';
    if (D.cmp) b += '<div class="stparleg" id="stparleg"><span><i class="solid"></i>' + (D.mode === 'sel' ? 'This round' : 'Last 5') + '</span><span><i class="dash"></i>All rounds</span></div>';
    else if (D.mode === 'all') b += '<p class="stnote stparhint" id="stparhint">To lay one round over all rounds, tap the button above or pick Selected round and turn on Compare.</p>';
    return b;
  }
  // ---------- v126 Putt misses (Stats > Putting, a collapsed sub-menu at the bottom) ----------
  // A top-down 3 x 3 grid around the hole: the 8 directions of the shot screen's "Shot n ended…" picker (Long = past the hole at the top,
  // Short = toward you at the bottom) and the hole in the middle. First putts only, in the SG by first-putt distance bands (SG.FP_BANDS).
  var PM_BANDS = [{ id: 'all', name: 'All distances', chip: 'All' }].concat(SG.FP_BANDS.map(function (b) { return { id: b.id, name: b.name, chip: b.name }; }));
  function stPmList(L) { var o = []; L.forEach(function (p) { (p.fp || []).forEach(function (x) { o.push(x); }); }); return o; }
  function stPmLabel(d) { return d ? SG.DIR_NAME[d] : ''; }
  // id = svg id; G = SG.puttMissGrid of the rounds shown; Z = the same for all rounds (Compare) or null
  function stPmissSVG(id, G, Z) {
    var W = 358, cs = 92, x0 = (W - cs * 3) / 2, y0 = 22, H = y0 + cs * 3 + 24, topBox = ''; // v126: plain white boxes, count + % only
    var o = '<svg class="stchart stpmgrid" id="' + id + '" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc('Putt misses: ' + SG.DIR8.map(function (d) { return SG.DIR_NAME[d] + ' ' + G.counts[d]; }).join(', ') + '; made ' + G.made + ' of ' + G.putts) + '">' +
      '<text class="stpmedge" x="' + W / 2 + '" y="14" text-anchor="middle">LONG · past the hole</text>' +
      '<text class="stpmedge" x="' + W / 2 + '" y="' + (H - 6) + '" text-anchor="middle">SHORT · toward you</text>' +
      '<defs><clipPath id="' + id + 'clip"><rect x="' + x0 + '" y="' + y0 + '" width="' + cs * 3 + '" height="' + cs * 3 + '" rx="14"/></clipPath></defs>' +
      '<rect class="stpmgreen" x="' + x0 + '" y="' + y0 + '" width="' + cs * 3 + '" height="' + cs * 3 + '" rx="14"/>';
    var GRID = [['longleft', 'long', 'longright'], ['left', '', 'right'], ['shortleft', 'short', 'shortright']];
    GRID.forEach(function (row, ri) { row.forEach(function (d, ci) {
      var x = x0 + ci * cs, y = y0 + ri * cs, cx = x + cs / 2;
      if (!d) { // the hole: putts holed
        o += '<rect class="stpmmade" x="' + (x + 1.5) + '" y="' + (y + 1.5) + '" width="' + (cs - 3) + '" height="' + (cs - 3) + '" rx="3" style="fill:#5cb85c;stroke:#2e7d32;stroke-width:1.5"/>' +
          '<g class="stpmhole" id="' + id + '-made"><circle cx="' + cx + '" cy="' + (y + 30) + '" r="9" fill="#14202b" stroke="#fff" stroke-width="2"/>' +
          '<text class="stpmn" x="' + cx + '" y="' + (y + 62) + '" text-anchor="middle">' + G.made + ' made</text>' +
          '<text class="stpmp" x="' + cx + '" y="' + (y + 77) + '" text-anchor="middle">' + (G.madePct == null ? '–' : Math.round(G.madePct) + '%') + (Z && Z.madePct != null ? ' · all ' + Math.round(Z.madePct) + '%' : '') + '</text></g>'; return; }
      var n = G.counts[d], pc = G.pct[d], top = d === G.top;
      if (top) topBox = '<rect class="stpmtop" x="' + (x + 1.5) + '" y="' + (y + 1.5) + '" width="' + (cs - 3) + '" height="' + (cs - 3) + '" rx="3" style="fill:none;stroke:#8a1c24;stroke-width:2"/>';
      o += '<g class="stpmz"><rect class="stpmcell' + (top ? ' top' : '') + '" data-dir="' + d + '" data-n="' + n + '" x="' + (x + 0.5) + '" y="' + (y + 0.5) + '" width="' + (cs - 1) + '" height="' + (cs - 1) + '" clip-path="url(#' + id + 'clip)" style="fill:#fff"/>' +
        '<text class="stpmname" x="' + cx + '" y="' + (y + 17) + '" text-anchor="middle">' + SG.DIR_NAME[d] + '</text>' +
        '<text class="stpmn' + (n ? '' : ' zero') + '" id="' + id + '-' + d + '" x="' + cx + '" y="' + (y + 50) + '" text-anchor="middle">' + n + '</text>' +
        '<text class="stpmp" id="' + id + '-' + d + 'p" x="' + cx + '" y="' + (y + 68) + '" text-anchor="middle">' + (pc == null ? '–' : Math.round(pc) + '%') + '</text>' +
        (Z ? '<text class="stpmall" x="' + cx + '" y="' + (y + 83) + '" text-anchor="middle">all ' + (Z.pct[d] == null ? '–' : Math.round(Z.pct[d]) + '%') + '</text>' : '') + '</g>';
    }); });
    for (var i = 1; i < 3; i++) o += '<line class="stpmline" x1="' + (x0 + cs * i) + '" y1="' + y0 + '" x2="' + (x0 + cs * i) + '" y2="' + (y0 + cs * 3) + '"/><line class="stpmline" x1="' + x0 + '" y1="' + (y0 + cs * i) + '" x2="' + (x0 + cs * 3) + '" y2="' + (y0 + cs * i) + '"/>';
    return o + topBox + '<rect class="stpmedgebox" x="' + x0 + '" y="' + y0 + '" width="' + cs * 3 + '" height="' + cs * 3 + '" rx="14"/></svg>';
  }
  // v127 "avg 2nd putt": average length of the next putt after a missed 1st putt (misses that stayed on the green), same band + range; grey "all" with Compare
  var ST_2ND_HELP = 'Avg 2nd putt = average distance left for the next putt after a missed 1st putt (misses that stayed on the green).';
  function stFt1(v) { return v == null ? '–' : (Math.round(v * 10) / 10).toFixed(1) + ' ft'; }
  function stSecTxt(G, Z) { return ' · <span class="st2nd infoend">avg 2nd putt <b>' + stFt1(G.second.avg) + '</b>' + (Z ? ' (all ' + stFt1(Z.second.avg) + ')' : '') + '</span>'; }
  function stSecond(D, band) { return stSecTxt(SG.puttMissGrid(stPmList(D.shown), band), D.cmp ? SG.puttMissGrid(stPmList(D.all), band) : null); }
  function stPmStats(G) {
    if (!G.putts) return 'No first putts here yet.';
    return 'n = ' + G.putts + ' putt' + (G.putts === 1 ? '' : 's') + ' · ' + G.made + ' made (' + Math.round(G.madePct) + '%)';
  }
  // v127: the misses get their own line so the count line stays short (count · made · avg 2nd putt ⓘ)
  function stPmMiss(G) { return G.misses + ' missed' + (G.top ? ' · most common miss: ' + SG.DIR_NAME[G.top] + ' (' + Math.round(G.pct[G.top]) + '%)' : ''); }
  function stPmSides(G) { var S = G.side; return G.withDir ? 'Left ' + S.left + ' · right ' + S.right + ' · short ' + S.short + ' · long ' + S.long + ' (corners count on both sides)' : ''; }
  // one card for one band (also used by the PDF for All + every band)
  function stPmissCard(D, band) {
    var B = PM_BANDS.filter(function (b) { return b.id === band; })[0] || PM_BANDS[0], G = SG.puttMissGrid(stPmList(D.shown), B.id), Z = D.cmp ? SG.puttMissGrid(stPmList(D.all), B.id) : null;
    var who = D.mode === 'sel' ? 'this round' : D.mode === '5' ? 'the last 5 rounds' : 'all rounds', id = 'pm' + B.id;
    return '<div class="stcard stgraph stpmcard" id="st-' + id + '" data-band="' + B.id + '"><div class="sth"><span>Putt misses · ' + esc(B.name) + '</span><span class="stv" id="' + id + 'val">Made <em>' + (G.madePct == null ? '–' : Math.round(G.madePct) + '%') + '</em>' +
      (Z ? ' · all <em>' + (Z.madePct == null ? '–' : Math.round(Z.madePct) + '%') + '</em>' : '') + '</span></div>' +
      (G.putts ? stPmissSVG(id + 'grid', G, Z) : '<p class="stfew" id="' + id + 'none">No first putts ' + (B.id === 'all' ? '' : B.name.toLowerCase() + ' ') + 'in ' + who + ' yet.</p>') +
      '<p class="stn" id="' + id + 'n">' + stPmStats(G) + (G.putts ? stSecTxt(G, Z) : '') + '</p>' + (G.putts ? '<p class="stn" id="' + id + 'miss">' + stPmMiss(G) + '</p>' : '') + (stPmSides(G) ? '<p class="stn stpmsides" id="' + id + 'sides">' + stPmSides(G) + '</p>' : '') +
      '<p class="stn stpmnodir" id="' + id + 'nodir">No direction: ' + G.nodir + ' miss' + (G.nodir === 1 ? '' : 'es') + ' (not drawn)' + (Z ? ' · all rounds: ' + Z.putts + ' first putts' : '') + '</p>' +
      '<p class="help stnote stpmhelp" id="' + id + 'help" data-infoin="' + id + 'n">' + ST_2ND_HELP + ' First putts only (the first putt on each finished hole), in the same distance bands as Strokes gained by first-putt distance (under 5 ft, 5–10, 10–25, over 25 ft). ' +
      'Direction = what was entered for where the putt finished vs the hole – the 8 choices on the shot screen (Long = past the hole, Short = toward you). Each box: misses that finished there and their share of the misses with a direction. Middle: putts holed. ' +
      'Misses with no direction are counted, not drawn. Shows ' + who + (Z ? '; grey “all” = the share over all rounds' : '') + '.</p></div>';
  }
  function stPmissSub(D) {
    var on = !!(view.stOpen || {}).pmiss, band = view.stPmB || 'all', G = SG.puttMissGrid(stPmList(D.shown), 'all');
    var sum = G.putts ? G.misses + ' missed' + (G.top ? ' · most ' + SG.DIR_NAME[G.top] : '') : '–';
    return '<section class="stsubcat' + (on ? ' open' : '') + '" id="stpm"><button class="stsubh" data-act="stcat" data-v="pmiss" aria-expanded="' + on + '" aria-controls="stpmb">' +
      '<b>Putt misses</b><span class="stcatsum" id="stpmsum">' + sum + '</span><i class="stcatc" aria-hidden="true"></i></button>' +
      '<div class="stsubb" id="stpmb"' + (on ? '' : ' hidden') + '>' + (on ? '<div class="stpmchips" id="stpmchips" role="group" aria-label="First-putt distance">' + PM_BANDS.map(function (b) {
        var s = b.id === band; return '<button class="stpmchip' + (s ? ' sel' : '') + '" data-act="stpmb" data-v="' + b.id + '" aria-pressed="' + s + '">' + esc(b.chip) + '</button>'; }).join('') + '</div>' + stPmissCard(D, band) : '') + '</div></section>';
  }
  function statsHTML() {
    var I = statsPlayerInfo(), D = statsData(), all = D.all, shown = D.shown, mode = D.mode;
    var who = view.stPlayer === '~none' ? 'No name' : view.stPlayer || (I.multi ? 'All players' : (all[0] && (rounds.filter(function (r) { return r.id === all[0].id; })[0] || {}).player) || playerName() || '');
    var h = '<div class="frostpage theme-sky statspage" id="statspage"><div class="topbar frost"><button class="txt frostbtn" data-act="home">‹ Home</button><div class="title"><b>Stats</b><span>' +
      (who ? esc(who) + ' · ' : '') + all.length + ' round' + (all.length === 1 ? '' : 's') + '</span></div>' +
      (all.length ? '<button class="txt frostbtn stpdfbtn" id="stpdf" data-act="stpdf" aria-label="Create PDF of these stats">Create PDF</button>' : '<span class="tbspace"></span>') + '</div>' + (view.pdf ? '<div class="stpdfrow">' + pdfHTML() + '</div>' : '');
    if (I.multi) h += '<div class="hchips" id="stchips" role="group" aria-label="Player">' + [''].concat(I.names).map(function (nm) {
        var s = (view.stPlayer || '') === nm; return '<button class="frostchip' + (s ? ' sel' : '') + '" data-act="stplayer" data-v="' + esc(nm) + '" aria-pressed="' + s + '">' + (nm ? esc(nm) : 'All players') + '</button>'; }).join('') +
      (I.noName ? '<button class="frostchip' + (view.stPlayer === '~none' ? ' sel' : '') + '" data-act="stplayer" data-v="~none">No name</button>' : '') + '</div>';
    if (!all.length) return h + '<div class="stcard stnone" id="stnone"><p>No finished rounds yet.</p><p class="stnote">Graphs appear here once a round is finished' + (D.unfinished ? ' (' + D.unfinished + ' unfinished not shown)' : '') + '.</p></div></div>';
    h += '<div class="stseg" id="strange" role="group" aria-label="Rounds shown">' + [['all', 'All rounds'], ['5', 'Last 5'], ['sel', 'Selected round']].map(function (o) {
      var s = mode === o[0]; return '<button class="' + (s ? 'sel' : '') + '" data-act="strange" data-v="' + o[0] + '" aria-pressed="' + s + '">' + o[1] + '</button>'; }).join('') + '</div>';
    // v125: the open round is first in the list, marked "Open now" (an unfinished one shows its holes so far)
    var OP = D.openP, rl = all.slice().reverse(); if (OP) rl = [OP].concat(rl.filter(function (p) { return p.id !== OP.id; }));
    if (mode === 'sel') h += '<div class="strounds" id="strounds" role="listbox" aria-label="Pick a round">' + rl.map(function (p) {
      var s = D.sel && p.id === D.sel.id, isO = OP && p.id === OP.id; return '<button class="stri' + (s ? ' sel' : '') + (isO ? ' stopen' : '') + '" role="option" aria-selected="' + s + '" data-act="stround" data-id="' + esc(p.id) + '"><span class="strd">' + (isO ? '<i class="stopenb">Open now</i>' : '') + esc(stDate(p.date)) +
        '</span><span class="strc">' + esc(p.course) + (p.open ? ' <small>· ' + p.holes + ' holes</small>' : '') + '</span><span class="strs">' + p.score + ' <small>(' + toPar(p.toPar) + ')</small></span></button>'; }).join('') + '</div>';
    if (mode !== 'all') h += '<div class="stbar"><button class="stcmp' + (D.cmp ? ' on' : '') + '" id="stcmp" data-act="stcmp" aria-pressed="' + D.cmp + '"><i aria-hidden="true"></i>Compare to all rounds</button></div>';
    h += '<p class="stsub" id="stshown">' + (mode === 'sel' && D.sel ? esc(stDate(D.sel.date)) + ' · ' + esc(D.sel.course) + ' · ' + D.sel.score + ' (' + toPar(D.sel.toPar) + ')' + (D.sel.open ? ' · ' + D.sel.holes + ' holes so far' : '') :
      (mode === '5' ? 'Last ' + shown.length + ' of ' : '') + all.length + ' finished round' + (all.length === 1 ? '' : 's') + ' · ' + esc(stDate(shown[0].date)) + (shown.length > 1 ? ' – ' + esc(stDate(shown[shown.length - 1].date)) : '')) + '</p>';
    h += '<div class="stsec stsecsg"><span class="stsect">Strokes gained</span><select id="stbl" class="stbl" data-f="baseline" aria-label="Compare against"><option value="">Each round’s baseline</option>' + SG.BASELINES.map(function (b) {
        return '<option value="' + b.id + '"' + (view.stBl === b.id ? ' selected' : '') + '>' + esc(blLabel(b.id)) + '</option>'; }).join('') + '</select></div>' +
      '<p class="stnote stsgnote" id="stsgnote">Plus = strokes gained, minus = strokes lost, compared with ' + esc(view.stBl ? blLabel(view.stBl) : 'each round’s own baseline') + '.</p>';
    // v125: graphs grouped in collapsible categories (tap a header; open / closed is kept while the page is open)
    var sgT = function (k) { var c = ST_SG.filter(function (x) { return x[0] === k; })[0]; return stTrend(k, D, function (p) { return p.sg[k]; }, { title: c[1], short: c[1].replace(/ \(.*\)$/, ''), color: c[2], help: c[3] }); };
    var pctT = function (k) { var c = ST_PCT.filter(function (x) { return x[0] === k; })[0]; return stTrend(k, D, function (p) { return p[k]; }, { title: c[1], short: c[1].replace(/ \(.*\)$/, ''), color: c[2], help: c[3], pct: true }); };
    // per-shot graphs: strokes gained per putt / shot in one bucket; a round with none in the bucket has no point
    var bT = function (id, grp, key, title, short, col, help, unit, x) { var g = function (p) { return p.b[grp][key]; };
      // v129: strokes gained ADDED UP per round (a round with none in the bucket = 0), so the graphs of one category add up to its total (PUTT / ARG)
      return stTrend(id, D, function (p) { return g(p).sg; }, { title: title, short: short, color: col, help: help, minSpan: 0.4, unit: unit, nExtra: x && x.nExtra, helpIn: x && x.helpIn,
        nOf: function (p) { return g(p).n; } }); };
    // v129: "where the strokes go" – one bar per distance group = strokes gained (+) or lost (-) per round, adding up to the category total
    var brk = function (id, title, tot, grp, items) {
      var m = function (f) { var L = D.shown, v = L.map(f).filter(function (x) { return x != null && isFinite(x); }); return v.length ? v.reduce(function (t, x) { return t + x; }, 0) / v.length : null; };
      var rows = items.map(function (it) { return { name: it.name, v: m(function (p) { return p.b[grp][it.id].sg; }), n: D.shown.reduce(function (t, p) { return t + p.b[grp][it.id].n; }, 0) }; }), T = m(tot);
      if (T == null) return '';
      var mx = Math.max.apply(null, rows.map(function (r) { return Math.abs(r.v || 0); }).concat([0.01])), worst = rows.filter(function (r) { return r.v != null && r.v < -0.005; }).sort(function (a, b) { return a.v - b.v; })[0];
      var W = 358, rh = 28, L = 80, R = 52, bw = W - L - R, H = rows.length * rh + 6;
      var svg = '<svg class="stchart stbrksvg" id="' + id + 'chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(title) + '">' + rows.map(function (r, i) { var y = 3 + i * rh, w = Math.max(r.v ? 3 : 0, Math.round(Math.abs(r.v || 0) / mx * bw));
        return '<g class="stbrow" data-k="' + esc(r.name) + '"><text class="stbl" x="0" y="' + (y + 17) + '">' + esc(r.name) + '</text><rect class="stbbg" x="' + L + '" y="' + (y + 5) + '" width="' + bw + '" height="14" rx="7"/>' +
          '<rect class="stbbar ' + (r.v < 0 ? 'neg' : 'pos') + '" x="' + L + '" y="' + (y + 5) + '" width="' + w + '" height="14" rx="7"/><text class="stbv" x="' + W + '" y="' + (y + 17) + '" text-anchor="end">' + fmtSG(r.v || 0) + '</text></g>'; }).join('') + '</svg>';
      return '<div class="stcard stgraph stbrk" id="st-' + id + '"><div class="sth"><span>' + esc(title) + '</span><span class="stv">Total <em>' + fmtSG(T) + '</em></span></div>' + svg +
        '<p class="stnote">Strokes gained (+) or lost (-) per round, by ' + (grp === 'putt' ? '1st putt distance' : 'shot distance') + '. The bars add up to the total' + (worst ? '. Biggest leak: ' + esc(worst.name) + ' (' + fmtSG(worst.v) + ' per round).' : '.') + '</p></div>'; };
    var cats = [
      ['driver', 'Driver', function () { return stBox(D) + sgT('ott') + pctT('fir'); }, [['OTT', function (p) { return p.sg.ott; }], ['FW', function (p) { return p.fir; }, 'pct']]],
      ['approach', 'Approach', function () { return sgT('app') + pctT('gir') + stTrend('prox', D, function (p) { return p.prox; }, { title: 'Approach proximity', short: 'Proximity', color: '#2e9d4f', ft: true, unit: 'approaches',
          help: 'Average distance from the hole after the regulation approach from 40–200 yd, every shot (misses too) – the same shots as the Proximity page’s All button. Lower is better.',
          avg: function (L) { var n = 0, t = 0; L.forEach(function (p) { if (p.prox != null) { n += p.proxN; t += p.prox * p.proxN; } }); return n ? t / n : null; }, nOf: function (p) { return p.proxN; } }); },
        [['APP', function (p) { return p.sg.app; }], ['GIR', function (p) { return p.gir; }, 'pct']]],
      ['putting', 'Putting', function () { var pc = ['#7c4dcc', '#9466e0', '#6a3fb5', '#5a2f9e'], hp = ' Strokes gained on those holes, added up per round (every putt on the hole counts). The four distance graphs add up to the Putting total.';
        return sgT('putt') + brk('ptbrk', 'Where putting strokes go', function (p) { return p.sg.putt; }, 'putt', SG.FP_BANDS) + SG.FP_BANDS.map(function (b, i) { return bT('pt' + b.id, 'putt', b.id, '1st putt ' + b.name.replace(/^Under/, 'under').replace(/^Over/, 'over'), b.name, pc[i], 'Holes whose first putt was ' + b.name.toLowerCase() + '.' + hp + ' ' + ST_2ND_HELP, 'putts', { helpIn: true, nExtra: stSecond(D, b.id) }); }).join('') +
          stTrend('ptmade5', D, function (p) { var b = p.b.putt.u5; return b.n ? 100 * b.made / b.n : null; }, { title: '1st putts made under 5 ft', short: 'Made under 5 ft', color: '#7c4dcc', pct: true, unit: 'putts',
            help: 'Of the first putts that started under 5 ft, the share holed.', avg: function (L) { var n = 0, m = 0; L.forEach(function (p) { n += p.b.putt.u5.n; m += p.b.putt.u5.made; }); return n ? 100 * m / n : null; }, nOf: function (p) { return p.b.putt.u5.n; } }) +
          stPmissSub(D); },
        [['PUTT', function (p) { return p.sg.putt; }]]],
      ['chipping', 'Chipping', function () { var lc = { sand: '#d4a017', rough: '#3f8f3a', fairway: '#6cbf43' }, dc = ['#f0a040', '#e8871e', '#c96a0e'],
          hc = ' Strokes gained on these shots, added up per round. The Around the green shots: off the green from ' + SG.SHORT_MAX_YD + ' yd and in – the same shots as the ARG total.';
        return sgT('arg') + brk('chbrk', 'Where chipping strokes go', function (p) { return p.sg.arg; }, 'chipDist', SG.CHIP_BANDS) + '<p class="stgrp">By lie</p>' + SG.CHIP_LIES.map(function (L) { return bT('ch' + L.id, 'chipLie', L.id, 'From the ' + L.name.toLowerCase(), L.name, lc[L.id], L.name + (L.id === 'rough' ? ' (incl. deep rough)' : '') + '.' + hc, 'shots'); }).join('') +
          '<p class="stgrp">By distance</p>' + SG.CHIP_BANDS.map(function (b, i) { return bT('ch' + b.id, 'chipDist', b.id, b.name.replace(/^0/, 'Up to ').replace('Up to –', 'Up to '), b.name, dc[i], (i ? 'Over ' + b.lo + ' up to ' + b.hi + ' yd' : '10 yd and in') + ', any lie.' + hc, 'shots'); }).join(''); },
        [['ARG', function (p) { return p.sg.arg; }]]],
      ['scoring', 'Scoring', function () { return sgT('tot') + stParBar(D) + [3, 4, 5].map(function (par) { return stDist(par, D); }).join(''); },
        [['TOT', function (p) { return p.sg.tot; }], ['Score', function (p) { return p.score; }, 'n']]]];
    var op = view.stOpen || (view.stOpen = {});
    var catSum = function (L) { return L.map(function (x) { var v = mode === 'sel' ? (D.sel ? x[1](D.sel) : null) : SG.trendAvg(D.shown.map(x[1]));
      return x[0] + ' <em>' + (v == null ? '–' : x[2] === 'pct' ? Math.round(v) + '%' : x[2] === 'n' ? (Math.round(v * 10) / 10) : fmtSG(v)) + '</em>'; }).join(' · '); };
    h += '<div class="stcats" id="stcats">' + cats.map(function (c) { var on = !!op[c[0]];
      return '<section class="stcat' + (on ? ' open' : '') + '" id="stcat-' + c[0] + '" data-cat="' + c[0] + '"><button class="stcath" data-act="stcat" data-v="' + c[0] + '" aria-expanded="' + on + '" aria-controls="stcatb-' + c[0] + '">' +
        '<b>' + c[1] + '</b><span class="stcatsum" id="stcatsum-' + c[0] + '">' + catSum(c[3]) + '</span><i class="stcatc" aria-hidden="true"></i></button>' +
        '<div class="stcatb" id="stcatb-' + c[0] + '"' + (on ? '' : ' hidden') + '>' + c[2]() + '</div></section>'; }).join('') + '</div>';
    var colN = mode === 'sel' ? 'This round' : mode === '5' ? 'Last 5' : 'All rounds', two = D.cmp;
    h += '<div class="stcard" id="sttablecard"><div class="sth"><span>Averages per round</span></div><table class="sttable" id="sttable"><thead><tr><th></th><th class="num">' + colN + '</th>' + (two ? '<th class="num">All rounds</th>' : '') + '</tr></thead><tbody>' +
      '<tr data-k="Rounds"><td>Rounds</td><td class="num">' + D.avgShown.n + '</td>' + (two ? '<td class="num">' + D.avgAll.n + '</td>' : '') + '</tr>' +
      ST_ROWS.map(function (d) { return '<tr data-k="' + esc(d[0]) + '"' + (d[3] === 'sg' ? ' class="stsgrow"' : '') + '><td>' + esc(d[0]) + '</td><td class="num">' + stNum(D.avgShown[d[0]], d[2], d[3]) + '</td>' +
        (two ? '<td class="num">' + stNum(D.avgAll[d[0]], d[2], d[3]) + '</td>' : '') + '</tr>'; }).join('') + '</tbody></table>' +
      '<p class="stnote">Each number is the average of the rounds’ own numbers (a round with nothing to count, e.g. no par 4s or 5s, is left out of that line). Putts made inside 10 ft = of every putt that started 10 ft or closer, the share that went in. Last 5 = the 5 newest finished rounds. Only finished rounds count' + (D.unfinished ? ' (' + D.unfinished + ' unfinished not shown)' : '') + '.</p></div>';
    return h + '</div>';
  }
  // keep the chosen round visible inside the scrolling list (without moving the page)
  function stListScroll() { var L = document.getElementById('strounds'), s = L && L.querySelector('.stri.sel'); if (!s) return;
    if (s.offsetTop < L.scrollTop || s.offsetTop + s.offsetHeight > L.scrollTop + L.clientHeight) L.scrollTop = Math.max(0, s.offsetTop - 6); }

  // ---------- v99 Change player: move saved rounds to another player's name ----------
  // round.player = new name, round.updated = now (merges prefer it), round.movedFrom = old name(s) so the Google Drive
  // backup takes the round out of the old player's file. Id, shots, stats: unchanged.
  function mvNames() {
    var L = [], seen = {}; function add(n) { n = String(n || '').trim().replace(/\s+/g, ' '); if (n && !seen[n.toLowerCase()]) { seen[n.toLowerCase()] = 1; L.push(n); } }
    add(playerName()); savedRounds().forEach(function (r) { add(r.player); });
    return L.sort(function (a, b) { var qa = /^quincy\b/i.test(a), qb = /^quincy\b/i.test(b); return qa !== qb ? (qa ? -1 : 1) : a.localeCompare(b); });
  }
  function mvOwner(r) { return String(r.player || playerName() || '').trim(); }
  function mvSel() { var M = view.mv; return M ? rounds.filter(function (r) { return M.ids[r.id]; }) : []; }
  function mvCount(to) { return mvSel().filter(function (r) { return !samePlayer(mvOwner(r), to); }).length; }
  function nRounds(n) { return n + ' round' + (n === 1 ? '' : 's'); }
  function mvBarHTML() {
    var n = mvSel().length;
    return '<div class="mvbar" id="mvbar"><button class="mvcancel" data-act="mvcancel">Cancel</button><button class="mvgo" data-act="mvsheet" id="mvgo"' + (n ? '' : ' disabled') + '>' + (n ? 'Move ' + nRounds(n) + ' to…' : 'Tap rounds to choose') + '</button></div>';
  }
  function mvSheetHTML() {
    var M = view.mv, L = mvSel(), n = L.length, own = {}; L.forEach(function (r) { own[mvOwner(r).toLowerCase()] = 1; });
    var o = '<div class="rsheet-bg" data-act="mvclose"></div><div class="rsheet" id="mvsheet" role="dialog" aria-modal="true" aria-labelledby="mvh">';
    if (M.sheet === 'confirm') {
      var k = mvCount(M.to), froms = Object.keys(L.reduce(function (a, r) { if (!samePlayer(mvOwner(r), M.to)) a[mvOwner(r) || 'no name'] = 1; return a; }, {}));
      o += '<div class="rsh-h" id="mvh">Move ' + (n === 1 && M.from === 'summary' ? 'this round' : nRounds(k)) + ' to ' + esc(M.to) + '?</div>' +
        '<p class="rsh-sub" id="mvfrom">From ' + esc(froms.join(', ')) + '</p><div class="mvlist" id="mvlist">';
      L.filter(function (r) { return !samePlayer(mvOwner(r), M.to); }).slice(0, 4).forEach(function (r) { var S = SG.summarize(r, blOf(r)); o += '<div>' + esc(new Date(r.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })) + (r.course ? ' · ' + esc(r.course) : '') + (S.holesDone ? ' · ' + S.strokes : '') + '</div>'; });
      if (k > 4) o += '<div class="muted">and ' + (k - 4) + ' more</div>';
      o += '</div><p class="rsh-help">Every shot and stat stays the same – only the name changes. Backups move with ' + (k === 1 ? 'it' : 'them') + '.</p>' +
        '<button class="rsh-go" data-act="mvyes" id="mvyes">Move</button><button class="rsh-item muted" data-act="mvclose" id="mvno">Cancel</button></div>';
      return o;
    }
    o += '<div class="rsh-h" id="mvh">Move ' + (n === 1 && M.from === 'summary' ? 'this round' : nRounds(n)) + ' to…</div><p class="rsh-sub">Now: ' + esc(Object.keys(L.reduce(function (a, r) { a[mvOwner(r) || 'no name'] = 1; return a; }, {})).join(', ')) + '</p>';
    var names = mvNames(), q = names.filter(function (x) { return /^quincy\b/i.test(x) && !own[x.toLowerCase()]; })[0];
    names.forEach(function (x) {
      var all = Object.keys(own).length === 1 && own[x.toLowerCase()];
      o += '<button class="' + (x === q ? 'rsh-go' : 'rsh-item') + ' mvname" data-act="mvpick" data-v="' + esc(x) + '"' + (all ? ' disabled' : '') + '>👤 ' + esc(x) +
        (all ? '<small>already theirs</small>' : x === q ? '<small>suggested</small>' : samePlayer(x, playerName()) ? '<small>this phone’s player</small>' : '') + '</button>';
    });
    if (M.custom) o += '<label class="rsh-lbl" for="mvname">New name</label><input id="mvname" class="rsh-code mvinput" maxlength="40" autocomplete="off" autocapitalize="words" placeholder="e.g. Amber" value="' + esc(M.typed || '') + '">' +
      (M.err ? '<p class="rsh-err" role="alert">' + esc(M.err) + '</p>' : '') + '<button class="rsh-go" data-act="mvnew" id="mvnewgo">Use this name</button>';
    else o += '<button class="rsh-item" data-act="mvcustom" id="mvcustom">✏️ New name…</button>';
    return o + '<button class="rsh-item muted" data-act="mvclose">Cancel</button></div>';
  }
  function moveRounds(ids, to) {
    var now = new Date().toISOString(), n = 0;
    rounds.forEach(function (r) {
      if (!ids[r.id]) return; var old = mvOwner(r); if (samePlayer(old, to)) return;
      var mf = (r.movedFrom || []).filter(function (x) { return !samePlayer(x, to); }); if (old && !mf.some(function (x) { return samePlayer(x, old); })) mf.push(old);
      r.player = to; if (mf.length) r.movedFrom = mf; else delete r.movedFrom; r.updated = now; n++;
    });
    if (n) { localStorage.setItem(KEY, JSON.stringify(rounds)); backupDirty(1500); if (live) live.touch(); }
    return n;
  }
  function mvAct(act, b) {
    var M = view.mv, id = b.getAttribute('data-id'), v = b.getAttribute('data-v');
    switch (act) {
      case 'mvstart': view.mv = { sel: true, ids: {}, from: 'history' }; view.addr = null; break;
      case 'mvone': view.send = null; view.mv = { ids: {}, from: 'summary', sheet: 'pick' }; view.mv.ids[view.roundId] = 1; break;
      case 'mvall': if (M) { var hr = [].slice.call(document.querySelectorAll('#histlist .hrow')).map(function (e) { return e.getAttribute('data-id'); }), on = hr.every(function (x) { return M.ids[x]; }); hr.forEach(function (x) { if (on) delete M.ids[x]; else M.ids[x] = 1; }); } break;
      case 'mvtoggle': if (M) { if (M.ids[id]) delete M.ids[id]; else M.ids[id] = 1; } break;
      case 'mvcancel': view.mv = null; break;
      case 'mvsheet': if (M && mvSel().length) { M.sheet = 'pick'; M.custom = false; M.err = null; } break;
      case 'mvclose': if (M) { if (M.from === 'summary') view.mv = null; else M.sheet = null; } break;
      case 'mvcustom': M.custom = true; render(); var i = document.getElementById('mvname'); if (i) i.focus(); return;
      case 'mvpick': M.to = v; M.sheet = 'confirm'; break;
      case 'mvnew': {
        var t = String((document.getElementById('mvname') || {}).value || '').trim().replace(/\s+/g, ' ').slice(0, 40); M.typed = t;
        if (!GDX.slug(t)) { M.err = 'Please type a name (letters or numbers).'; break; }
        var known = mvNames().filter(function (x) { return samePlayer(x, t); })[0]; M.to = known || t; M.sheet = 'confirm'; M.err = null; break;
      }
      case 'mvyes': { var n = moveRounds(M.ids, M.to); view.mv = null; render(); toast(n ? 'Moved ' + nRounds(n) + ' to ' + M.to + ' ✓' : 'Nothing to move'); return; }
    }
    render();
  }
  // ---------- v97 Send round / Add a round (share.js) ----------
  function roundLine(r) { var S = SG.summarize(r, blOf(r)); return { day: new Date(r.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }), S: S }; }
  function codeNote(c) { return c ? c.length.toLocaleString() + ' characters' + (c.length > SHARE.LONG ? ' – long, the file is easier' : '') : 'for a text message'; }
  function sendSheetHTML(r) {
    var V = view.send, L = roundLine(r);
    return '<div class="rsheet-bg" data-act="sendclose"></div><div class="rsheet" id="sendsheet" role="dialog" aria-modal="true" aria-labelledby="sendh">' +
      '<div class="rsh-h" id="sendh">Send round</div><p class="rsh-sub">' + esc(L.day) + (r.course ? ' · ' + esc(r.course) : '') + (L.S.holesDone ? ' · ' + L.S.strokes + ' (' + toPar(L.S.toPar) + ')' : '') + '</p>' +
      '<button class="rsh-go" data-act="sendfile" id="sendfile">📄 Send as a file<small>' + esc(SHARE.fileName(r)) + '</small></button>' +
      '<button class="rsh-item" data-act="sendcode" id="sendcode">💬 Send as a text code<small>' + codeNote(V.code) + '</small></button>' +
      (V.copied ? '<p class="rsh-ok" id="sendcopied" role="status">✓ Copied – paste it into a message</p>' : '') +
      (V.showCode ? '<label class="rsh-lbl" for="sendcodebox">' + (V.copied ? 'The code' : 'Copy this code') + '</label><textarea id="sendcodebox" class="rsh-code" readonly rows="3">' + esc(V.code || '') + '</textarea>' : '') +
      '<p class="rsh-help">On the other phone: Strokewise → Rounds → 📥 Add a round, then choose the file or paste the code.</p>' +
      '<button class="rsh-item muted" data-act="sendclose">Close</button></div>';
  }
  function sendOpen() {
    var r = round(); if (!r) return; view.send = { id: r.id }; render();
    SHARE.encode(r).then(function (c) { if (view.send && view.send.id === r.id) { view.send.code = c; var b = document.querySelector('#sendcode small'); if (b) b.textContent = codeNote(c); } }); // ready before the tap
  }
  function sendFile() {
    var r = round(); if (!r) return; var name = SHARE.fileName(r), json = SHARE.fileText(r), file;
    try { file = new File([json], name, { type: 'application/json' }); } catch (e) { file = null; }
    if (file && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: 'Strokewise round' }).then(function () { toast('Round sent'); }).catch(function (e) {
        if (e && e.name === 'AbortError') return; download(json, name, 'application/json', 'Round file downloaded'); });
      return;
    }
    download(json, name, 'application/json', 'Round file downloaded');
  }
  function copyCode(code) {
    var done = function () { if (!view.send) return; view.send.copied = true; view.send.showCode = true; render(); toast('Copied'); };
    var fail = function () { if (!view.send) return; view.send.copied = false; view.send.showCode = true; render(); var t = document.getElementById('sendcodebox'); if (t) { t.focus(); t.select(); } };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(code).then(done, fail); else fail();
  }
  function sendCode() {
    var r = round(); if (!r || !view.send) return;
    var go = function (code) {
      view.send.code = code;
      var text = 'Strokewise round – ' + roundLine(r).day + (r.course ? ', ' + r.course : '') + '. In Strokewise: Rounds → Add a round, paste this:\n' + code;
      if (navigator.share) navigator.share({ text: text }).then(function () { toast('Code sent'); }).catch(function (e) { if (e && e.name === 'AbortError') return; copyCode(code); });
      else copyCode(code);
    };
    if (view.send.code) go(view.send.code); else SHARE.encode(r).then(go);
  }
  function addSheetHTML() {
    var A = view.addr, o = '<div class="rsheet-bg" data-act="addclose"></div><div class="rsheet" id="addsheet" role="dialog" aria-modal="true" aria-labelledby="addh">';
    if (A.step === 'confirm' || A.step === 'done') {
      var r = A.round, L = roundLine(r), S = L.S, pn = playerName();
      o += '<div class="rsh-h" id="addh">' + (A.step === 'done' ? (A.dup ? 'Already in your rounds' : 'Round added') : 'Add this round to your rounds?') + '</div>' +
        '<div class="arcard" id="addcard"><b class="arcourse">' + esc(r.course || 'Round') + '</b><span class="ardate">' + esc(L.day) + (r.tee ? ' · ' + esc(r.tee) : '') + '</span>' +
        '<div class="arnums"><div><small>Score</small><b id="arscore">' + (S.holesDone ? S.strokes : '–') + '</b></div><div><small>To par</small><b id="artopar">' + (S.holesDone ? toPar(S.toPar) : '–') + '</b></div>' +
        '<div><small>Holes</small><b id="arholes">' + (S.holesDone === r.holes.length ? r.holes.length : S.holesDone + '/' + r.holes.length) + '</b></div></div>' +
        '<small class="arwho" id="arwho">' + (A.step === 'confirm' ? (pn ? 'Goes into ' + esc(pn) + '’s rounds' : 'Goes into your rounds') : (pn ? 'In ' + esc(pn) + '’s rounds' : 'In your rounds')) + '</small></div>';
      if (A.step === 'confirm') o += '<button class="rsh-go" data-act="addyes" id="addyes">Add</button><button class="rsh-item muted" data-act="addclose" id="addno">Cancel</button>';
      else o += '<p class="rsh-ok" id="adddone" role="status">' + (A.dup ? 'This round is already in your rounds.' : '✓ Added to your rounds.') + '</p>' +
        '<button class="rsh-go" data-act="open" data-id="' + esc(A.viewId) + '" id="addview">View round</button><button class="rsh-item muted" data-act="addclose">Done</button>';
      return o + '</div>';
    }
    return o + '<div class="rsh-h" id="addh">Add a round</div><p class="rsh-sub">Got a round from someone’s Strokewise? Add it to your rounds.</p>' +
      '<label class="rsh-go filebtn" for="addroundfile" id="addfilebtn">📂 Choose file</label><input type="file" id="addroundfile" accept=".json,application/json,text/plain" hidden>' +
      '<div class="rsh-or">or</div><label class="rsh-lbl" for="addcode">Paste code</label>' +
      '<textarea id="addcode" class="rsh-code" rows="3" placeholder="PINHIGH1:…" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false">' + esc(A.text || '') + '</textarea>' +
      '<button class="rsh-item rsh-add" data-act="addcode" id="addcodego">Add</button>' +
      (A.err ? '<p class="rsh-err' + (A.backup ? ' rsh-note' : '') + '" id="adderr" role="alert">' + esc(A.err) + '</p>' : '') +
      '<button class="rsh-item muted" data-act="addclose">Cancel</button></div>';
  }
  function addRead(text, keep) {
    SHARE.read(text).then(function (res) {
      if (!view.addr) return;
      view.addr = res.error ? { step: 'pick', err: res.error, backup: !!res.backup, text: keep || '' } : { step: 'confirm', round: res.round }; render();
    });
  }
  function addYes() {
    var A = view.addr; if (!A || !A.round) return;
    var dup = SHARE.findDup(rounds, A.round);
    if (dup) { view.addr = { step: 'done', dup: true, round: A.round, viewId: dup.id }; render(); return; }
    var r = SHARE.prepare(A.round, playerName()); // original id kept, this phone's player; never the round in progress
    localStorage.setItem(KEY, JSON.stringify(rounds.concat([r]))); rounds = load(); backupDirty(3000); // in the backup like any own round
    view.addr = { step: 'done', round: r, viewId: r.id }; render(); toast('Round added');
  }
  // ---------- Backup / restore ----------
  var BK = 'golfsg.lastBackup.v1';
  function localDay(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function backupReminder() {
    if (!rounds.length) return '';
    var last = localStorage.getItem(BK), days = last ? Math.floor((Date.now() - new Date(last).getTime()) / 864e5) : null;
    if (days == null) return 'Tip: you haven\'t backed up your rounds yet. Connect Google Drive for automatic backups, or tap Back up rounds to save a copy to Files.';
    return days >= 14 ? 'It\'s been ' + days + ' days since your last backup. Tap Back up rounds to save a fresh copy.' : '';
  }
  function backupDone() { localStorage.setItem(BK, new Date().toISOString()); var nO = ownRounds().filter(function (x) { return !SG.roundEmpty(x); }).length; view.notice = { text: 'Backup ready: ' + nO + ' round' + (nO === 1 ? '' : 's') + ' for ' + playerName() + ' saved.' }; if (view.screen === 'home' || view.screen === 'archive') render(); }
  function backupRounds() {
    if (!playerName()) { askName('Enter your player name first – it goes in the backup file name.'); return; }
    var name = 'golf-rounds-' + GDX.slug(playerName()) + '-' + localDay(new Date()) + '.json', json = JSON.stringify(SG.makeBackup(rounds.filter(function (x) { return !SG.roundEmpty(x); }), null, playerName(), courses(), bagForBackup(), wedgesForBackup(), practice()), null, 1), file;
    try { file = new File([json], name, { type: 'application/json' }); } catch (e) { file = null; }
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file] }).then(backupDone).catch(function (e) {
        if (e && e.name === 'AbortError') { toast('Backup cancelled'); return; }
        download(json, name, 'application/json'); backupDone();
      });
      return;
    }
    download(json, name, 'application/json'); backupDone();
  }
  // Restore = pick from the backup: list every round, preview read-only, merge only the selected ones.
  function restoreFrom(text, only) {
    var P = SG.parseBackup(text);
    if (P.error) { view.notice = { text: P.error, bad: true }; render(); return; }
    var bp = ''; try { bp = (JSON.parse(text) || {}).player || ''; } catch (e) {}
    if (bp) P.rounds.forEach(function (r) { if (!r.player) r.player = bp; }); // label rounds with the backup's player
    if (only) { P.rounds = P.rounds.filter(function (r) { return samePlayer(r.player || bp, only); }); if (!samePlayer(only, playerName())) { P.bag = null; P.wedges = null; } } // Google Drive: just that player
    P.rounds.sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
    view.restore = { rounds: P.rounds, sel: {}, player: bp, courses: P.courses || [], bag: P.bag || null, wedges: P.wedges || null,
      practice: (P.practice || []).filter(function (e) { return !only || samePlayer(e.player || bp, only); }) }; view.preview = null; view.screen = 'restorepick'; render(); window.scrollTo(0, 0);
  }
  // ---------- v101 Google Drive restore: every round in that player's backup, tick the ones to bring back ----------
  function gdListOpen(text, who, label) {
    var P = SG.parseBackup(text), raw = null;
    if (P.error) { view.notice = { text: P.error, bad: true }; view.screen = 'archive'; render(); return; }
    try { raw = JSON.parse(text); } catch (e) {}
    var items = GDX.restoreList(raw, who, rounds), sel = {}, mine = samePlayer(who, playerName());
    items.forEach(function (it) { if (it.status === 'new') sel[it.round.id] = true; }); // missing rounds start ticked
    view.restore = { gd: { player: who, label: label }, items: items, rounds: items.map(function (it) { return it.round; }), sel: sel, player: who,
      courses: P.courses || [], bag: mine ? P.bag || null : null, wedges: mine ? P.wedges || null : null, practice: P.practice || [] };
    view.preview = null; view.screen = 'restorepick'; render(); window.scrollTo(0, 0);
  }
  function gdlItem(id) { return ((view.restore && view.restore.items) || []).filter(function (it) { return it.round.id === id; })[0]; }
  function gdlChosen() { var R = view.restore; return R.items.filter(function (it) { return it.status !== 'same' && R.sel[it.round.id]; }); }
  function gdlStatus(it) { return it.status === 'new' ? 'Not on this phone' : it.status === 'newer' ? 'On this phone · backup copy is newer' : it.phoneNewer ? 'On this phone · this phone’s copy is newer' : 'On this phone'; }
  function restoreExtrasNotes(R) {
    var o = '', nc = (R.courses || []).length, nb = R.bag && R.bag.clubs ? R.bag.clubs.length : 0, nws = R.wedges ? WEDGES.filled(R.wedges) : 0;
    if (nc) o += '<p class="help muted" id="rpcourses">⛳ ' + nc + ' saved course' + (nc === 1 ? '' : 's') + ' come along (new or newer ones only).</p>';
    if (nb) o += '<p class="help muted" id="rpbag">🏌️ My Bag (' + nb + ' club' + (nb === 1 ? '' : 's') + ') comes along if this phone’s bag is empty or older.</p>';
    if (R.wedges && WEDGES.count(R.wedges)) o += '<p class="help muted" id="rpwedges">🎯 Wedges chart (' + nws + ' yardage' + (nws === 1 ? '' : 's') + ') comes along if this phone’s chart is empty or older.</p>';
    var npr = (R.practice || []).length; if (npr) o += '<p class="help muted" id="rppractice">⏱ ' + npr + ' practice entr' + (npr === 1 ? 'y' : 'ies') + ' come along (new ones only).</p>'; // v142
    return o;
  }
  function gdListHTML() {
    var R = view.restore, G = R.gd, I = R.items, nSel = gdlChosen().length, nNew = I.filter(function (it) { return it.status === 'new'; }).length, nOn = I.length - nNew;
    var allNew = nNew && I.every(function (it) { return it.status !== 'new' || R.sel[it.round.id]; });
    var o = '<div class="frostpage theme-sky gdlpage" id="gdlpage"><div class="topbar frost"><button class="txt frostbtn" data-act="rpcancel">‹ Back</button><div class="title"><b>' + esc(G.player) + '’s rounds</b><span>' + esc(G.label) + '</span></div><span style="width:70px"></span></div>' +
      '<div class="gdlsum" id="gdlsum"><b id="gdltotal">' + nRounds(I.length) + '</b> in this backup<div class="gdlchips"><span class="gdlchip gdlnew">' + nNew + ' not on this phone</span><span class="gdlchip gdlonc">' + nOn + ' on this phone</span></div></div>';
    if (I.length) o += '<div class="gdltools"><button class="gdltool" data-act="gdlmissing" id="gdlmissing"' + (nNew && !allNew ? '' : ' disabled') + '>' + (allNew ? '✓ All missing' : 'Select all missing') + '</button>' +
      '<button class="gdltool" data-act="gdlclear" id="gdlclear"' + (nSel ? '' : ' disabled') + '>Clear</button></div>';
    o += '<div class="gdllist" id="rplist">';
    I.forEach(function (it) {
      var r = it.round, S = SG.summarize(r, blOf(r)), on = it.status === 'same', ck = !on && !!R.sel[r.id], d = new Date(r.date);
      var nh = (r.holes || []).length, part = S.holesDone && S.holesDone < nh ? ' · ' + S.holesDone + ' holes' : '';
      o += '<div class="rprow gdlrow' + (on ? ' gdlon' : '') + (ck ? ' gdlsel' : '') + '" data-id="' + esc(r.id) + '" data-status="' + it.status + '">' +
        '<button class="gdltick" data-act="gdltoggle" data-id="' + esc(r.id) + '" role="checkbox" aria-checked="' + ck + '"' + (on ? ' disabled aria-disabled="true"' : '') + '>' +
        '<span class="gdlbox" aria-hidden="true">' + (ck ? '✓' : '') + '</span>' +
        '<span class="gdlmain"><span class="gdldate">' + esc(isNaN(d) ? '' : d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })) + part + '</span>' +
        '<b class="gdlcourse">' + esc(r.course || 'Round') + '</b><small class="rpst gdlst gdlst-' + it.status + '">' + gdlStatus(it) + '</small></span>' +
        '<span class="gdlscore"><b>' + (S.holesDone ? S.strokes : '–') + '</b><small>' + (S.holesDone ? toPar(S.toPar) : '') + '</small></span></button>' +
        '<button class="gdlview" data-act="rpview" data-id="' + esc(r.id) + '" aria-label="Look at this round">›</button></div>';
    });
    if (!I.length) o += '<p class="help muted" id="gdlempty">No rounds in this backup.</p>';
    o += '</div>' + restoreExtrasNotes(R);
    var extra = [(R.courses || []).length ? 'courses' : '', R.bag && R.bag.clubs && R.bag.clubs.length ? 'bag' : '', R.wedges && WEDGES.count(R.wedges) ? 'wedges' : '', (R.practice || []).length ? 'practice' : ''].filter(Boolean);
    o += '<p class="muted gdlnote">They go into Rounds under ' + esc(G.player) + '. Nothing on this phone is deleted, and a newer copy on this phone is never replaced.</p>';
    return o + '<div class="gdlbar" id="gdlbar"><span class="gdlcount" id="gdlcount">' + nSel + ' selected</span><button class="gdlgo" data-act="rpgo" id="rpgo"' + (nSel || extra.length ? '' : ' disabled') + '>' +
      (nSel || !extra.length ? 'Restore ' + nRounds(nSel) : 'Restore ' + extra.join(' &amp; ')) + '</button></div></div>';
  }
  function restorePractice(R, parts) { if (!R.practice || !R.practice.length) return; var PM = MYGAME.mergePractice(practice(), R.practice); if (PM.added) { localStorage.setItem(PRK, JSON.stringify(PM.practice)); parts.push(PM.added + ' practice entr' + (PM.added === 1 ? 'y' : 'ies')); } } // v142
  function restoreExtras(R, parts) {
    restorePractice(R, parts);
    if (R.courses && R.courses.length) { var CM = COURSES.mergeCourses(courses(), R.courses); saveCourses(CM.courses); if (CM.added || CM.updated) parts.push((CM.added + CM.updated) + ' course' + (CM.added + CM.updated === 1 ? '' : 's')); }
    if (R.bag) { var BM = BAG.mergeBag(bag(), R.bag); if (BM.changed) { localStorage.setItem(BGK, JSON.stringify(BM.bag)); parts.push('My Bag (' + BM.bag.clubs.length + ' clubs)'); } }
    if (R.wedges) { var WM = WEDGES.mergeWedges(wedges(), R.wedges); if (WM.changed) { localStorage.setItem(WGK, JSON.stringify(WM.wedges)); var nlo = WEDGES.filled(WM.wedges, 'low'); parts.push('Wedges (' + WEDGES.filled(WM.wedges) + ' yardages' + (nlo ? ' · ' + nlo + ' Low flight' : '') + ')'); } }
  }
  function gdRestoreSelected() {
    var R = view.restore, A = GDX.applyRestore(rounds, R.items, R.sel), who = R.gd.player;
    localStorage.setItem(KEY, JSON.stringify(A.rounds)); rounds = load(); if (A.added || A.updated) backupDirty(3000);
    var parts = []; restoreExtras(R, parts);
    view.notice = { text: '✓ Restored ' + nRounds(A.added) + (A.updated ? ' and updated ' + A.updated : '') + ' from ' + who + '’s backup' + (A.added || A.updated ? ' – they’re in Rounds under ' + who : '') + '.' + (parts.length ? ' Also: ' + parts.join(', ') + '.' : '') };
    view.restore = null; view.preview = null; view.screen = 'archive'; render(); window.scrollTo(0, 0); toast(A.added + A.updated ? 'Restored ' + nRounds(A.added + A.updated) : 'Nothing new to restore');
  }
  function restoreState(r) { var cur = rounds.filter(function (x) { return x.id === r.id; })[0]; return !cur ? 'new' : JSON.stringify(cur) === JSON.stringify(r) ? 'same' : 'diff'; }
  function restorePickHTML() {
    if (view.restore.gd) return gdListHTML();
    var R = view.restore, L = R.rounds, nSel = L.filter(function (r) { return R.sel[r.id]; }).length;
    var o = '<div class="topbar"><button class="txt" data-act="rpcancel">‹ Cancel</button><div class="title"><b>Restore rounds</b><span>' + L.length + ' in backup' + (R.player ? ' · ' + esc(R.player) : '') + '</span></div><span style="width:70px"></span></div>' +
      '<p class="help muted">Tap a round to look at it. Tick the ones to bring onto this phone – nothing on the phone is deleted.</p>' +
      '<label class="rpall"><input type="checkbox" id="rpall" data-act="rpall"' + (nSel && nSel === L.length ? ' checked' : '') + '> Select all</label><div id="rplist">';
    L.forEach(function (r) {
      var S = SG.summarize(r, blOf(r)), st = restoreState(r);
      o += '<div class="rprow" data-id="' + esc(r.id) + '"><label class="rpchk"><input type="checkbox" data-act="rpsel" data-id="' + esc(r.id) + '"' + (R.sel[r.id] ? ' checked' : '') + ' aria-label="Select round ' + esc(new Date(r.date).toLocaleDateString()) + '"></label>' +
        '<button class="rpopen" data-act="rpview" data-id="' + esc(r.id) + '"><b>' + new Date(r.date).toLocaleDateString() + (r.course ? ' · ' + esc(r.course) : '') + '</b>' +
        '<span>' + (S.holesDone ? S.strokes + ' (' + toPar(S.toPar) + ')' : '–') + ' · ' + S.holesDone + '/' + r.holes.length + ' holes · <span class="' + sgCls(S.sgTotal) + '">SG ' + fmtSG(S.sgTotal) + '</span>' + (r.player ? ' · ' + esc(r.player) : '') + '</span>' +
        '<small class="rpst rp-' + st + '">' + (st === 'new' ? 'Not on this phone' : st === 'same' ? '✓ Already on this phone' : 'On this phone – different version') + '</small></button></div>';
    });
    var nc = (R.courses || []).length;
    if (nc) o += '<p class="help muted" id="rpcourses">⛳ ' + nc + ' saved course' + (nc === 1 ? '' : 's') + ' come along (new or newer ones only).</p>';
    var nb = R.bag && R.bag.clubs ? R.bag.clubs.length : 0;
    if (nb) o += '<p class="help muted" id="rpbag">🏌️ My Bag (' + nb + ' club' + (nb === 1 ? '' : 's') + ') comes along if this phone’s bag is empty or older.</p>';
    var nw = R.wedges ? WEDGES.count(R.wedges) : 0;
    var nws = R.wedges ? WEDGES.filled(R.wedges) : 0;
    if (nw) o += '<p class="help muted" id="rpwedges">🎯 Wedges chart (' + nws + ' yardage' + (nws === 1 ? '' : 's') + ') comes along if this phone’s chart is empty or older.</p>';
    var extra = [nc ? 'courses' : '', nb ? 'bag' : '', nw ? 'wedges' : ''].filter(Boolean);
    return o + '</div><button class="primary big" data-act="rpgo" id="rpgo"' + (nSel || extra.length ? '' : ' disabled') + '>' + (nSel || !extra.length ? 'Restore ' + nSel + ' selected' : extra.length === 1 && nb ? 'Restore my bag' : 'Restore ' + extra.join(' &amp; ')) + '</button>';
  }
  function previewOnly(el) { // read-only round preview: no editing, deleting or exporting
    var tb = el.querySelector('.topbar'); if (tb) tb.innerHTML = '<button class="txt" data-act="rpback">‹ Backup list</button><div class="title"><b>Preview (read-only)</b><span>' + new Date(view.preview.date).toLocaleDateString() + (view.preview.course ? ' · ' + esc(view.preview.course) : '') + '</span></div><span style="width:70px"></span>';
    [].slice.call(el.querySelectorAll('[data-act="goHole"]')).forEach(function (b) { b.removeAttribute('data-act'); b.disabled = true; b.classList.add('ro'); });
    [].slice.call(el.querySelectorAll('[data-act="pdf"],[data-act="csv"],[data-act="sendopen"],[data-act="backHole"],[data-act="delRound"],[data-act="history"],[data-act="home"],[data-act="about"],#pdfsheet')).forEach(function (b) { if (!b.closest('.maphead')) b.remove(); });
    [].slice.call(el.querySelectorAll('select, input')).forEach(function (x) { x.disabled = true; });
    [].slice.call(el.querySelectorAll('[data-act="mapscope"]')).forEach(function (x) { var g = x.closest('.seg') || x; g.remove(); });
    var lab = el.querySelector('.label'); if (lab) lab.textContent = 'Scorecard';
    var gi = view.restore.gd && gdlItem(view.preview.id);
    if (gi && gi.status === 'same' && !el.querySelector('#rpprevsel')) el.insertAdjacentHTML('beforeend', '<p class="help muted" id="rpprevsel">✓ Already on this phone</p><button class="big" data-act="rpback">‹ Back to the backup list</button>');
    if (!el.querySelector('#rpprevsel')) el.insertAdjacentHTML('beforeend', '<button class="primary big" id="rpprevsel" data-act="rpselone" data-id="' + esc(view.preview.id) + '">' + (view.restore.sel[view.preview.id] ? '✓ Selected – tap to unselect' : 'Select this round to restore') + '</button><button class="big" data-act="rpback">‹ Back to the backup list</button>');
  }
  function restoreSelected() {
    if (view.restore.gd) return gdRestoreSelected();
    var R = view.restore, pick = R.rounds.filter(function (r) { return R.sel[r.id]; }), P = { rounds: pick };
    var conf = SG.conflictsOf(rounds, P.rounds), replace = false;
    if (conf.length) replace = confirm(conf.length + ' round' + (conf.length === 1 ? '' : 's') + ' in the backup ' + (conf.length === 1 ? 'is' : 'are') + ' different from the copy on this phone (' +
      conf.slice(0, 3).map(function (r) { return new Date(r.date).toLocaleDateString() + (r.course ? ' ' + r.course : ''); }).join(', ') + (conf.length > 3 ? ', …' : '') +
      ').\n\nOK = replace with the backup version\nCancel = keep the phone\'s version');
    var M = SG.mergeRounds(rounds, P.rounds, replace);
    localStorage.setItem(KEY, JSON.stringify(M.rounds)); rounds = load(); if (M.added || M.replaced) backupDirty(3000); // uploads only this player's rounds
    var parts = [M.added + ' added']; restorePractice(R, parts);
    if (R.courses && R.courses.length) { var CM = COURSES.mergeCourses(courses(), R.courses); saveCourses(CM.courses); if (CM.added || CM.updated) parts.push((CM.added + CM.updated) + ' course' + (CM.added + CM.updated === 1 ? '' : 's')); }
    if (R.bag) { var BM = BAG.mergeBag(bag(), R.bag); if (BM.changed) { localStorage.setItem(BGK, JSON.stringify(BM.bag)); parts.push('My Bag (' + BM.bag.clubs.length + ' clubs)'); } }
    if (R.wedges) { var WM = WEDGES.mergeWedges(wedges(), R.wedges); if (WM.changed) { localStorage.setItem(WGK, JSON.stringify(WM.wedges)); var nlo = WEDGES.filled(WM.wedges, 'low'); parts.push('Wedges (' + WEDGES.filled(WM.wedges) + ' yardages' + (nlo ? ' · ' + nlo + ' Low flight' : '') + ')'); } }
    if (M.replaced) parts.push(M.replaced + ' replaced');
    if (M.kept) parts.push(M.kept + ' kept as on this phone');
    if (M.same) parts.push(M.same + ' already here');
    view.notice = { text: '✓ Restored from backup: ' + parts.join(', ') + '. You now have ' + savedRounds().length + ' round' + (savedRounds().length === 1 ? '' : 's') + '.' };
    view.restore = null; view.preview = null; view.screen = 'archive'; render(); window.scrollTo(0, 0);
  }
  // ---------- v101: OneDrive backup removed – Google Drive (below) is the only automatic backup ----------
  var CFG = window.GOLF_CONFIG || {};
  function backupDirty(delay) { gdDirty(delay); } // every change to rounds, courses, My Bag or Wedges → Google Drive soon
  // A phone that had OneDrive connected: quietly forget the old OneDrive state and Microsoft sign-in cache ON THIS PHONE
  // (nothing in OneDrive itself is touched), and drop a leftover Microsoft sign-in return (#code=…) from the address bar.
  (function () {
    try { Object.keys(localStorage).forEach(function (k) { if (/^golfsg\.onedrive\./.test(k) || /^msal\.|login\.windows\.net|login\.microsoftonline\.com/i.test(k)) localStorage.removeItem(k); }); } catch (e) {}
    try { if (/[#&](code|client_info)=/.test(location.hash) && !(window.GD && window.GD.parseHash(location.hash))) history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
  })();

  // ---------- v98 Google Drive automatic backup (main backup; see gdrive.js) ----------
  var GDX = window.GD, gdOn = !!(GDX && GDX.enabled(CFG)), gdState = gdOn ? GDX.loadState(localStorage) : null, gdTimer = null, gdBusy = false, gdBack = null;
  function gdTok() { if (!gdOn) return null; try { var t = JSON.parse(localStorage.getItem(GDX.TOKEN_KEY)); return GDX.tokenValid(t, Date.now()) ? t : null; } catch (e) { return null; } }
  function gdSave() { GDX.saveState(localStorage, gdState); }
  function gdDirty(delay) { if (!gdOn || !gdState || !gdState.connected) return; GDX.markDirty(gdState); if (!gdTok()) gdState.needsAuth = true; gdSave(); gdSoon(delay); }
  function gdSoon(delay) { if (!gdOn || !gdState.connected || !gdTok()) return; clearTimeout(gdTimer); gdTimer = setTimeout(gdSync, delay == null ? 1500 : delay); }
  // One backup file per player – every round goes to the folder of its own round.player (rounds with no name = this phone's player).
  // My Bag and the Wedges chart only go in this phone's player's file; saved courses go in every file.
  function gdFiles() {
    var me = playerName(), g = {}, order = [];
    function grp(p) { var n = GDX.folderName(p), k = n.toLowerCase(); if (!GDX.slug(n)) return null; if (!g[k]) { g[k] = { player: n, rounds: [] }; order.push(k); } return g[k]; }
    if (me && (bagForBackup() || wedgesForBackup() || ownRounds().length || practiceOf(me).length)) grp(me);
    rounds.forEach(function (r) { if (SG.roundEmpty(r)) return; var G = grp(r.player || me); if (G) G.rounds.push(r); });
    GDX.movedFrom(rounds).forEach(function (m) { m.from.forEach(function (f) { var k = GDX.folderName(f).toLowerCase(); if (GDX.slug(f) && !g[k]) { g[k] = { player: GDX.folderName(f), rounds: [], dropOnly: true }; order.push(k); } }); }); // v99: tidy a moved round out of its old player's file
    return order.map(function (k) {
      var G = g[k], mine = samePlayer(G.player, me);
      return { player: G.player, dropOnly: !!G.dropOnly, backup: SG.makeBackup(G.rounds, null, G.player, courses(), mine ? bagForBackup() : null, mine ? wedgesForBackup() : null, practiceOf(G.player)) };
    });
  }
  function gdSync() {
    if (!gdOn || !gdState.connected || gdBusy || !gdState.pending) return Promise.resolve();
    var t = gdTok(); gdBusy = true; gdRefresh();
    return GDX.sync({ state: gdState, fetch: window.fetch.bind(window), token: t && t.accessToken, online: navigator.onLine, files: gdFiles(), moved: GDX.movedFrom(rounds) }).then(function (st) {
      gdBusy = false; gdState = st;
      if (st.needsAuth && t) localStorage.removeItem(GDX.TOKEN_KEY); // Google said the sign-in has run out
      gdSave();
      if (!st.pending) localStorage.setItem(BK, st.lastOk);
      else if (!st.needsAuth && navigator.onLine && gdTok()) gdSoon(GDX.retryDelay(st.attempts));
      gdRefresh();
    });
  }
  function gdRefresh() { var c = document.getElementById('gdcard'); if (c && view.screen === 'archive') { var d = document.createElement('div'); d.innerHTML = gdCardHTML(); c.replaceWith(d.firstChild); } }
  function gdWhen(iso) { var d = new Date(iso), t = new Date(); return (d.toDateString() === t.toDateString() ? 'today' : d.toLocaleDateString([], { month: 'short', day: 'numeric' })) + ' at ' + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
  function gdStatus(tok) {
    if (gdBusy) return '⏳ Backing up…';
    var o = gdState.lastOk ? '✓ Last backed up ' + gdWhen(gdState.lastOk) : 'Not backed up yet';
    if (gdState.pending) o += tok ? ' · ⏳ ' + esc(gdState.lastError || 'new changes going up soon') : ' · new changes are waiting';
    return o;
  }
  function gdCardHTML() {
    if (!gdOn) return '';
    var h = '<div class="odcard gdcard" id="gdcard"><h3 class="tiphead">' + tipLbl('gdinfo', 'Google Drive backup') + tipBtn('gdinfo', 'i', 'About Google Drive backup') + '</h3>' +
      tipText('gdinfo', 'Your rounds, saved courses, My Bag and Wedges chart are copied to Google Drive by themselves – after each round and when you open the app – into a folder called Pin High Backups (the app’s old name, kept so earlier backups are still found), with one folder per player. Several phones can use the same Google account: each backup adds to what is there, nothing is overwritten. Google asks you to sign in again after about an hour; until then backups simply wait.');
    if (!gdState.connected) return h + '<p class="odstat">Keeps a copy of everything safe in your Google Drive.</p><button class="big primary gdgo" data-act="gdconnect" id="gdconnect">Connect Google Drive</button></div>';
    var tok = gdTok();
    h += '<p class="odacct" id="gdacct">' + (gdState.user ? 'Connected as <b>' + esc(gdState.user) + '</b>' : 'Connected') + '</p><p class="odstat" id="gdstat" role="status">' + gdStatus(tok) + '</p>';
    if (!tok) h += '<button class="gdsignin" data-act="gdsignin" id="gdsignin">Sign in to Google to back up</button>';
    h += '<div class="odbtns"><button class="big" data-act="gdsync" id="gdsync"' + (gdBusy ? ' disabled' : '') + '>Back up now</button><button class="big" data-act="gdrestore" id="gdrestore">Restore</button></div>' +
      '<button class="txt oddisc" data-act="gddisconnect" id="gddisc">Disconnect Google Drive</button></div>';
    return h;
  }
  function gdRestoreHTML() {
    var V = view.gdr, o = '<div class="rsheet-bg" data-act="gdrclose"></div><div class="rsheet" id="gdrsheet" role="dialog" aria-modal="true" aria-labelledby="gdrh">';
    if (V.step === 'files') {
      o += '<div class="rsh-h" id="gdrh">' + esc(V.player) + '’s backups</div><p class="rsh-sub">Only ' + esc(V.player) + '’s rounds are loaded.</p>';
      if (V.loading) o += '<p class="rsh-help">Looking in Google Drive…</p>';
      (V.files || []).forEach(function (f, i) {
        o += '<button class="' + (i ? 'rsh-item' : 'rsh-go') + '" data-act="gdrfile" data-v="' + esc(f.id) + '">' + (f.date ? '🗓 Weekly copy · ' + esc(new Date(f.date + 'T12:00').toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })) : '☁️ Latest backup') +
          '<small>' + (f.modified ? 'saved ' + esc(gdWhen(f.modified)) : esc(f.name)) + '</small></button>';
      });
      if (!V.loading && V.files && !V.files.length) o += '<p class="rsh-help">No backups in this folder yet.</p>';
      if (V.err) o += '<p class="rsh-err" role="alert">' + esc(V.err) + '</p>';
      o += '<button class="rsh-item muted" data-act="gdrback">‹ Other players</button>';
    } else {
      o += '<div class="rsh-h" id="gdrh">Restore from Google Drive</div><p class="rsh-sub">Whose rounds?</p>';
      if (V.loading) o += '<p class="rsh-help">Looking in Google Drive…</p>';
      (V.players || []).forEach(function (p) { o += '<button class="rsh-item" data-act="gdrplayer" data-v="' + esc(p.id) + '" data-name="' + esc(p.name) + '">👤 ' + esc(p.name) + (samePlayer(p.name, playerName()) ? '<small>you</small>' : '') + '</button>'; });
      if (!V.loading && V.players && !V.players.length) o += '<p class="rsh-help">No backups in Google Drive yet.</p>';
      if (V.err) o += '<p class="rsh-err" role="alert">' + esc(V.err) + '</p>';
      if (V.signin) o += '<button class="rsh-go" data-act="gdsignin" data-v="restore">Sign in to Google</button>';
    }
    return o + '<p class="rsh-help">Picked rounds are added to this phone – nothing here is deleted.</p><button class="rsh-item muted" data-act="gdrclose">Close</button></div>';
  }
  function gdFail(e) { var V = view.gdr; if (!V) return; V.loading = false; if (e && e.kind === 'auth') { localStorage.removeItem(GDX.TOKEN_KEY); V.step = 'players'; V.signin = true; V.err = 'Google needs you to sign in again.'; } else V.err = e && e.kind === 'offline' ? 'No connection – try again when you’re online.' : 'Couldn’t read Google Drive – please try again.'; render(); }
  function gdRestoreOpen() {
    var t = gdTok(); view.gdr = { step: 'players', loading: !!t, signin: !t, err: t ? null : 'Sign in to Google to see your backups.' }; render();
    if (!t) return;
    GDX.listPlayers(window.fetch.bind(window), t.accessToken).then(function (L) { if (!view.gdr) return; view.gdr.players = L; view.gdr.loading = false; render(); }, gdFail);
  }
  function gdAct(act, b) {
    var v = b.getAttribute('data-v');
    if (act === 'gdconnect' || act === 'gdsignin') {
      if (!playerName()) { askName('Enter your player name first – it names your folder in Google Drive.'); return; }
      if (!navigator.onLine) { toast('You’re offline – connect to the internet to sign in'); return; }
      var st = GDX.newAuthState(function (a) { return crypto.getRandomValues(a); });
      try { sessionStorage.setItem(GDX.AUTHSTATE_KEY, st); localStorage.setItem(GDX.AUTHSTATE_KEY, st); sessionStorage.setItem('golfsg.afterRedirect', 'archive'); if (v === 'restore') sessionStorage.setItem('golfsg.gdafter', 'restore'); } catch (e) {}
      location.assign(GDX.authUrl(CFG.googleClientId.trim(), GDX.redirectUri(location), st, /@/.test(gdState.user || '') ? gdState.user : '')); return;
    }
    if (act === 'gdsync') { GDX.markDirty(gdState); gdState.attempts = 0; gdSave(); if (gdTok()) gdSync(); else gdAct('gdsignin', b); return; }
    if (act === 'gdrestore') { gdRestoreOpen(); return; }
    if (act === 'gdrclose') { view.gdr = null; render(); return; }
    if (act === 'gdrback') { gdRestoreOpen(); return; }
    if (act === 'gdrplayer') {
      var t = gdTok(), name = b.getAttribute('data-name'); if (!t) { gdRestoreOpen(); return; }
      view.gdr = { step: 'files', player: name, loading: true }; render();
      GDX.listFiles(window.fetch.bind(window), t.accessToken, v).then(function (L) { if (!view.gdr) return; view.gdr.files = L; view.gdr.loading = false; render(); }, gdFail); return;
    }
    if (act === 'gdrfile') {
      var t2 = gdTok(), who = view.gdr && view.gdr.player; if (!t2) { gdRestoreOpen(); return; }
      view.gdr.loading = true; view.gdr.err = null; render();
      var fm = (view.gdr.files || []).filter(function (x) { return x.id === v; })[0], lab = fm && fm.date ? 'Weekly copy · ' + new Date(fm.date + 'T12:00').toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : 'Latest backup';
      GDX.download(window.fetch.bind(window), t2.accessToken, v).then(function (txt) { view.gdr = null; gdListOpen(txt, who, lab); }, gdFail); return;
    }
    if (act === 'gddisconnect') {
      if (!confirm('Disconnect Google Drive?\n\nYour backups stay in Google Drive. This phone stops backing up there.')) return;
      var tk = gdTok(); if (tk) fetch(GDX.REVOKE + '?token=' + encodeURIComponent(tk.accessToken), { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }).catch(function () {});
      clearTimeout(gdTimer); localStorage.removeItem(GDX.TOKEN_KEY); gdState = GDX.newState(); gdSave(); toast('Google Drive disconnected'); render();
    }
  }
  // Back from Google's sign-in page: #access_token=…&state=… – checked, kept, and wiped from the address bar before anything else
  var gdReturned = false, gdAfter = null;
  function gdReturn() {
    if (!gdOn) return;
    var p = GDX.parseHash(location.hash); if (!p) return;
    var exp = []; try { exp = [sessionStorage.getItem(GDX.AUTHSTATE_KEY), localStorage.getItem(GDX.AUTHSTATE_KEY)].filter(Boolean); } catch (e) {}
    var res = GDX.checkReturn(p, exp, Date.now());
    try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { location.hash = ''; }
    try { sessionStorage.removeItem(GDX.AUTHSTATE_KEY); localStorage.removeItem(GDX.AUTHSTATE_KEY); gdAfter = sessionStorage.getItem('golfsg.gdafter'); sessionStorage.removeItem('golfsg.gdafter'); } catch (e) {}
    view.screen = 'archive';
    if (res.error) { view.notice = { text: res.error, bad: true }; return; }
    localStorage.setItem(GDX.TOKEN_KEY, JSON.stringify(res.token));
    gdState.connected = true; gdState.needsAuth = false; gdState.attempts = 0; GDX.markDirty(gdState); gdSave(); gdReturned = true;
  }
  function gdInit() {
    if (!gdOn) return;
    window.addEventListener('online', function () { if (gdState.pending) gdSoon(500); });
    document.addEventListener('visibilitychange', function () { if (!document.hidden && gdState.connected && gdState.pending) gdSoon(1000); });
    if (!gdState.connected) return;
    var t = gdTok();
    if (gdReturned) {
      toast('Google Drive connected');
      GDX.about(window.fetch.bind(window), t.accessToken).then(function (u) { if (u) { gdState.user = u; gdSave(); gdRefresh(); } }, function () {});
      gdSoon(300); if (gdAfter === 'restore') gdRestoreOpen(); return;
    }
    GDX.markDirty(gdState); if (!t) gdState.needsAuth = true; gdSave(); gdSoon(2500); // back up on app open (quietly waits if signed out)
  }
  function askName(msg) { view.screen = 'archive'; view.editName = true; view.needName = msg; render(); var i = document.getElementById('pname'); if (i) { i.scrollIntoView({ block: 'center' }); i.focus(); } }
  function setName(n) {
    n = String(n || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    if (!GDX.slug(n)) { toast('Please enter a name (letters or numbers)'); return; }
    var old = playerName();
    if (old && old !== n && !confirm('Change player name from "' + old + '" to "' + n + '"?\n\nYour rounds are relabelled and new Google Drive backups go to the ' + GDX.folderName(n) + ' folder. Older backups are kept.')) return;
    localStorage.setItem(PN, n); localStorage.setItem(NA, '1'); view.editName = false; view.needName = null; view.nameSheet = null; view.newPEdit = false;
    rounds.forEach(function (r) { if (!r.player || r.player === old) r.player = n; });
    save(); gdDirty(800);
    toast('Player name: ' + n); render();
  }
  function playerHTML() {
    var n = playerName();
    if (n && !view.editName) return '<div class="playerbox" id="playerbox"><span>Player: <b id="pnameshow">' + esc(n) + '</b></span><button class="txt" data-act="editname">Change</button></div>';
    return '<div class="playerbox edit" id="playerbox">' + (view.needName ? '<p class="notice bad" id="needname">' + esc(view.needName) + '</p>' : '') +
      '<label class="lbl" for="pname">Player name</label><div class="pnrow2"><input type="text" id="pname" value="' + esc(n) + '" placeholder="e.g. Scott" autocomplete="name" maxlength="40">' +
      '<button class="primary" data-act="setname">Save</button>' + (n ? '<button data-act="cancelname">Cancel</button>' : '') + '</div>' +
      '<div class="tiprow">' + tipBtn('nameinfo', 'i', 'About the player name') + tipLbl('nameinfo', 'About the player name') + '</div>' + tipText('nameinfo', 'Saved on this phone. It labels your rounds and names your backups (golf-rounds-<i>name</i>.json), so several phones can share one Google Drive.') + '</div>';
  }
  // First open on a new phone (no name, no rounds yet): ask who's playing once. 'Not now' doesn't ask again – the Player row in the New round sheet does it any time.
  function needFirstName() { return !playerName() && !localStorage.getItem(NA) && !rounds.length; }
  function nameSheetHTML() {
    var n = playerName(), first = view.nameSheet !== 'change';
    return '<div class="sheet-back"' + (first ? '' : ' data-act="namecancel"') + '></div><div class="hsheet glass namesheet" id="namesheet" role="dialog" aria-modal="true" aria-labelledby="namesh">' +
      '<div class="sheet-h" id="namesh">' + (first ? 'Who’s playing?' : 'Player') + '</div>' +
      '<p class="namehelp" id="namehelp">' + (first ? 'Enter the golfer’s name. It goes on each round, the reports and the live scorecard.' : 'The golfer using this phone. It goes on each round, the reports and the live scorecard.') + '</p>' +
      '<input type="text" id="pname" value="' + esc(n) + '" placeholder="Golfer’s name" autocomplete="name" maxlength="40" aria-label="Golfer’s name">' +
      '<button class="sheet-go" data-act="setname">Save</button>' +
      '<button class="sheet-item muted" data-act="' + (first ? 'nameskip' : 'namecancel') + '">' + (first ? 'Not now' : 'Cancel') + '</button></div>';
  }
  // v89: Player row in the New round sheet (under Course + benchmark). One name per phone; Change edits inline, setName confirms a change.
  function newPlayerHTML() {
    var n = playerName();
    if (!view.newPEdit) return '<span class="lbl" id="nplbl">Player</span>' + (n
      ? '<div class="nplayer" id="nplayer"><b id="npname">' + esc(n) + '</b><button type="button" class="nedit" data-act="npedit" aria-label="Change player name">Change</button></div>'
      : '<button type="button" class="nplayer npadd" id="nplayer" data-act="npedit">+ Add golfer’s name</button>');
    return '<label class="lbl" for="pname" id="nplbl">Player</label><div class="npedit" id="npeditrow"><input type="text" id="pname" value="' + esc(n) + '" placeholder="Golfer’s name" autocomplete="name" maxlength="40">' +
      '<button type="button" class="npsave" data-act="setname">Save</button><button type="button" class="nedit" data-act="npcancel">Cancel</button></div>';
  }
  function homeHTML() {
    var cur = rounds.filter(function (r) { return r.id === localStorage.getItem(CUR); })[0];
    if (!view.nameSheet && needFirstName()) { view.nameSheet = 'first'; view.hmenu = null; }
    var h = '<div class="home" id="home"><div class="home-bg" aria-hidden="true"></div><div class="home-fade" aria-hidden="true"></div>' +
      '<h1 class="home-title">Strokewise</h1>' +
      '<button class="glass plusbtn" id="plusbtn" data-act="plus" aria-label="Menu: new round, rounds, stats, my bag, settings or help" aria-expanded="' + !!view.hmenu + '">+</button>' +
''; // v89: no Player row on Home (kept clean) – it lives in the New round sheet
    var bot = '';
    bot += mgHomeCardHTML(); // v141 My Game card
    if (cur) { var S = SG.summarize(cur); bot += '<button class="glass pill" id="resumepill" data-act="resume">Resume round<small>' + (cur.course ? esc(cur.course) + ' · ' : '') + S.holesDone + ' holes done</small></button>'; }
    // v102: no Archive pill – that page is Settings in the + menu
    h += '<div class="home-bottom">' + bot + '</div><div class="appver homever" id="homever" aria-label="App version">' + esc(APP_VER) + '</div>';
    if (view.nameSheet) h += nameSheetHTML();
    else if (view.hmenu) {
      h += '<div class="sheet-back" data-act="menuclose"></div><div class="hsheet glass" id="plusmenu" role="menu">';
      if (view.hmenu === 'new') h += '<div class="sheet-h">New round</div>' + newCourseHTML() +
        '<label class="lbl" for="newbl">Compare my shots against</label>' + blSelect('newbl', view.newBl || 'pga') + newPlayerHTML() +
        '<button class="sheet-go" data-act="new">Start round</button><button class="sheet-item muted" data-act="plus">Back</button>';
      else h += '<button class="sheet-item" role="menuitem" data-act="newform">New round</button><button class="sheet-item" role="menuitem" data-act="history">Rounds</button><button class="sheet-item" role="menuitem" data-act="stats">Stats</button><button class="sheet-item" role="menuitem" data-act="mygame">My Game</button><button class="sheet-item" role="menuitem" data-act="prlog">Log practice</button><button class="sheet-item" role="menuitem" data-act="bag">My Bag</button><button class="sheet-item" role="menuitem" data-act="archive">Settings</button><button class="sheet-item" role="menuitem" data-act="help">Help</button>';
      h += '</div>';
    }
    return h + '</div>';
  }
  // ---------- v141 My Game (mygame.js): the six-spoke shape of a golfer's game, by time frame ----------
  // a player's finished rounds (all holes done, not the round in progress) – the same test Stats uses
  function finishedRoundsOf(who) {
    var cur = localStorage.getItem(CUR);
    return savedRounds().filter(function (r) { return samePlayer(r.player || playerName(), who); }).filter(function (r) {
      var S = SG.summarize(r); return S.holesDone === r.holes.length && r.holes.length > 0 && r.id !== cur; });
  }
  function mgPlayers() { var o = {}; savedRounds().forEach(function (r) { var n = r.player || playerName(); if (n) o[n] = 1; }); if (playerName()) o[playerName()] = 1; return Object.keys(o).sort(); }
  function mgWho() { var names = mgPlayers(); if (!view.mgPlayer || names.indexOf(view.mgPlayer) < 0) view.mgPlayer = playerName() || names[0] || ''; return view.mgPlayer; }
  function mgData(who, periodId) {
    var list = finishedRoundsOf(who), newest = list.slice().sort(function (a, b) { return String(b.date || '').localeCompare(String(a.date || '')); })[0];
    var bl = view.mgBl || blOf(newest);
    return MYGAME.build(list, SG, { period: periodId || view.mgPeriod || '3m', baseline: bl, baselineName: SG.baseline(bl).name });
  }
  function mgHomeCardHTML() {
    var who = playerName(); if (!who || (!finishedRoundsOf(who).length && !practiceOf(who).length)) return '';
    var D; try { D = mgData(who); } catch (e) { return ''; }
    return '<button class="glass mgcard" id="mgcard" data-act="mygame" aria-label="My Game: ' + esc(D.headline) + '">' +
      '<span class="mgmini">' + MYGAME.radarSVG(D.cur, null, { R: 34, labels: false, aria: 'Game shape' }) + '</span>' +
      '<span class="mgtxt"><b>My Game</b><span>' + esc(D.headline) + '</span><small>' + esc(D.period.name) + ' · ' + D.cur.rounds + ' round' + (D.cur.rounds === 1 ? '' : 's') + '</small></span><i aria-hidden="true">›</i></button>';
  }
  function myGameHTML() {
    var names = mgPlayers(), who = mgWho(), D = mgData(who), P = D.period;
    var h = '<div class="frostpage theme-sky mygamepage" id="mygame"><div class="topbar frost"><button class="txt frostbtn" data-act="home">‹ Home</button><div class="title"><b>My Game</b><span>' +
      (who ? esc(who) + ' · ' : '') + D.cur.rounds + ' round' + (D.cur.rounds === 1 ? '' : 's') + '</span></div><button class="txt frostbtn mglogtop" data-act="prlog" id="prlogtop" aria-label="Log practice">＋ Log</button></div>';
    if (names.length > 1) h += '<div class="hchips" id="mgchips" role="group" aria-label="Player">' + names.map(function (nm) {
      var on = nm === who; return '<button class="frostchip' + (on ? ' sel' : '') + '" data-act="mgplayer" data-v="' + esc(nm) + '" aria-pressed="' + on + '">' + esc(nm) + '</button>'; }).join('') + '</div>';
    h += '<div class="stseg mgseg" id="mgperiod" role="group" aria-label="Time frame">' + MYGAME.PERIODS.map(function (x) {
      var on = x.id === P.id; return '<button class="' + (on ? 'sel' : '') + '" data-act="mgperiod" data-v="' + x.id + '" aria-pressed="' + on + '">' + x.name.replace('Last ', '') + '</button>'; }).join('') + '</div>';
    h += '<button class="primary big prbtn" data-act="prlog" id="prlogbtn">＋ Log practice</button>' + prSheetHTML(who);
    h += '<div class="mgchart frost"><h2 id="mghead">' + esc(D.headline) + '</h2><p id="mglede">' + esc(D.lede) + '</p>' +
      MYGAME.radarSVG(D.cur, D.prev, { R: 96, aria: 'Game shape, ' + P.name }) +
      '<div class="mglegend"><span><i class="lc"></i>' + esc(P.name) + '</span>' + (D.prev ? '<span><i class="lp"></i>' + (P.id === '1y' ? 'Year before' : 'Previous ' + esc(P.short)) + '</span>' : '') +
      '<span><i class="lb"></i>' + esc(D.baselineName) + '</span></div>' +
      '<label class="mgbl">Compared with ' + blSelect('mgbl', D.baseline) + '</label></div>';
    var T = D.cur.tiles, Q = D.prev && D.prev.tiles;
    var tile = function (id, label, v, pv, f, better) {
      var ch = '';
      if (v != null && pv != null) { var d = v - pv, good = better > 0 ? d > 0 : d < 0, tiny = Math.abs(d) < (id === 'gir' ? 0.5 : 0.05);
        ch = '<em class="' + (tiny ? '' : good ? 'up' : 'down') + '">' + (tiny ? '→ same as ' + f(pv) : (d > 0 ? '↑ ' : '↓ ') + f(Math.abs(d), true) + ' from ' + f(pv)) + '</em>'; }
      else if (v != null && D.prev === null && P.id !== 'all') ch = '<em>no rounds before</em>';
      return '<div class="mgtile frost" data-t="' + id + '"><span>' + label + '</span><b>' + (v == null ? '–' : f(v)) + '</b>' + ch + '</div>'; };
    var n1 = function (v) { return (Math.round(v * 10) / 10).toFixed(1); }, sgf = function (v, abs) { return abs ? n1(v) : MYGAME.fmt(v); }, pc = function (v) { return Math.round(v) + '%'; };
    h += '<div class="mgtiles" id="mgtiles">' + tile('score', 'Avg score (18 holes)', T.score, Q && Q.score, n1, -1) + tile('sg', 'Strokes gained / round', T.sg, Q && Q.sg, sgf, 1) +
      tile('putts', 'Putts / round', T.putts, Q && Q.putts, n1, -1) + tile('gir', 'Greens in regulation', T.gir, Q && Q.gir, pc, 1) + '</div>';
    h += practiceCardHTML(who, D);
    h += '<div class="tiprow" id="mginfo">' + tipBtn('mginfo', 'i', 'About My Game') + tipLbl('mginfo', 'How My Game works') + tipText('mginfo',
      'Each spoke is strokes gained per 18 holes in one skill: Driving (par 4 and 5 tee shots), Irons 100+ (approach shots from over 100 yd), Wedges (30–100 yd), Chipping (30 yd and in), Lag putts (10 ft and over) and Short putts (under 10 ft). The six add up to your total. Further out is better; the dashed line is the ' + esc(D.baselineName) + ' average. The gray shape is the same length of time before this one. A hollow point is still learning: it needs ' + MYGAME.MIN_ROUNDS + ' rounds and enough shots in the period.') + '</div>';
    return h + '</div>';
  }
  // ---------- v142 practice: log minutes per skill, see where practice time goes ----------
  function localDayISO(d) { d = d || new Date(); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  // open the log sheet; preset = { spoke, focus, min } fills one row (Log this drill)
  function prOpen(preset) {
    view.prLog = { date: localDayISO(), mins: {}, open: {} };
    if (preset) { view.prLog.mins[preset.spoke + '|' + preset.focus] = preset.min || 15; view.prLog.open[preset.spoke] = true; }
    view.hmenu = null; view.screen = 'mygame'; render();
    var el = document.getElementById('prsheet'); if (el && el.scrollIntoView) el.scrollIntoView({ block: 'start' });
  }
  function prSheetHTML(who) {
    var L = view.prLog; if (!L) return '';
    var total = 0; Object.keys(L.mins).forEach(function (k) { total += L.mins[k] || 0; });
    var o = '<div class="prsheet frost" id="prsheet"><div class="prhead"><b>Log practice</b><span>' + esc(who || '') + '</span></div>' +
      '<label class="prdate">Day <input type="date" id="prdate" value="' + esc(L.date) + '" max="' + localDayISO() + '"></label>';
    MYGAME.SPOKES.forEach(function (sp) {
      var foc = MYGAME.FOCUS[sp.k], sub = 0; foc.forEach(function (f) { sub += L.mins[sp.k + '|' + f] || 0; });
      var open = !!L.open[sp.k];
      o += '<div class="prspoke' + (open ? ' open' : '') + '" data-spoke="' + sp.k + '"><button class="prsh" data-act="prspoke" data-v="' + sp.k + '" aria-expanded="' + open + '"><span>' + esc(sp.name) + '</span><b>' + (sub ? MYGAME.hm(sub) : '') + '</b><i aria-hidden="true">' + (open ? '⌄' : '›') + '</i></button>';
      if (open) o += foc.map(function (f) { var key = sp.k + '|' + f, m = L.mins[key] || 0;
        return '<div class="prrow' + (m ? ' on' : '') + '"><span>' + esc(f) + (MYGAME.FOCUS_HINT[f] ? '<small>' + esc(MYGAME.FOCUS_HINT[f]) + '</small>' : '') + '</span><button class="prstep" data-act="prmin" data-v="' + esc(key) + '" data-k="-5" aria-label="5 minutes less ' + esc(f) + '"' + (m ? '' : ' disabled') + '>−</button>' +
          '<b class="prval">' + m + '<small> min</small></b><button class="prstep" data-act="prmin" data-v="' + esc(key) + '" data-k="5" aria-label="5 minutes more ' + esc(f) + '">+</button></div>'; }).join('');
      o += '</div>';
    });
    return o + '<div class="prfoot"><span id="prtotal">' + (total ? 'Total ' + MYGAME.hm(total) : 'Tap a skill, then + to add minutes') + '</span>' +
      '<button class="txt" data-act="prcancel">Cancel</button><button class="primary" data-act="prsave" id="prsave"' + (total ? '' : ' disabled') + '>Save</button></div></div>';
  }
  function prAct(act, v, k, b) {
    var L = view.prLog;
    if (act === 'prlog') { prOpen(null); return; }
    if (act === 'prdrill') { var q = String(v || '').split('|'); view.mgPlayer = (b && b.getAttribute('data-who')) || view.mgPlayer; prOpen({ spoke: q[0], focus: q.slice(1).join('|'), min: 15 }); return; }
    if (act === 'prcancel') { view.prLog = null; render(); return; }
    if (act === 'prdel') { savePractice(practice().filter(function (e) { return e.id !== v; })); toast('Practice entry removed'); render(); return; }
    if (!L) return;
    if (act === 'prspoke') { L.open[v] = !L.open[v]; render(); return; }
    if (act === 'prmin') { L.mins[v] = Math.max(0, Math.min(240, (L.mins[v] || 0) + k)); render(); return; }
    if (act === 'prsave') {
      var who = view.mgPlayer || playerName(), stamp = Date.now().toString(36), list = practice(), n = 0, tot = 0;
      Object.keys(L.mins).forEach(function (key) { var m = L.mins[key]; if (!m) return; var parts = key.split('|');
        list.push({ id: 'pr-' + stamp + '-' + (n++), date: L.date + 'T12:00:00', player: who, spoke: parts[0], focus: parts.slice(1).join('|'), min: m }); tot += m; });
      if (!n) return;
      savePractice(list); view.prLog = null; render(); toast('Saved ' + MYGAME.hm(tot) + ' of practice'); return;
    }
  }
  function practiceCardHTML(who, D) {
    var logs = practiceOf(who), PB = MYGAME.practiceBuild(logs, { period: D.period.id }), P = PB.period;
    var o = '<div class="mgchart prchart frost" id="prcard"><span class="tkeye">My Practice</span><h2 id="prhead">' + esc(PB.headline) + '</h2><p id="prlede">' + esc(PB.lede) + '</p>';
    if (PB.cur.total || PB.prev) o += MYGAME.practiceSVG(PB.cur, PB.prev, { R: 96, aria: 'Practice time by skill, ' + P.name }) +
      '<div class="mglegend"><span><i class="lpc"></i>' + esc(P.name) + '</span>' + (PB.prev ? '<span><i class="lp"></i>' + (P.id === '1y' ? 'Year before' : 'Previous ' + esc(P.short)) + '</span>' : '') + '</div>';
    o += '</div>';
    var V = MYGAME.practiceVsGame(D.cur, PB.cur);
    if (V) o += '<div class="mgchart prvs frost" id="prvs"><span class="tkeye">Strokes lost vs practice time</span><h2 id="prvshead">' + esc(V.headline) + '</h2><p id="prvslede">' + esc(V.lede) + '</p>' +
      '<div class="prbars">' + V.rows.map(function (r) {
        return '<div class="prbar' + (r.k === V.gap.k && V.gap.lostShare - V.gap.timeShare >= 0.15 ? ' gap' : '') + '" data-spoke="' + r.k + '"><span>' + esc(r.name) + '</span>' +
          '<i class="bl"><u style="width:' + Math.round(r.lostShare * 100) + '%"></u></i><em>' + Math.round(r.lostShare * 100) + '%</em>' +
          '<i class="bt"><u style="width:' + Math.round(r.timeShare * 100) + '%"></u></i><em>' + Math.round(r.timeShare * 100) + '%</em></div>'; }).join('') +
      '</div><div class="mglegend"><span><i class="lls"></i>Share of strokes lost</span><span><i class="lpc"></i>Share of practice time</span></div></div>';
    var recent = logs.slice().sort(function (a, b) { return b.date.localeCompare(a.date) || b.id.localeCompare(a.id); }).slice(0, 6);
    if (recent.length) o += '<div class="prlist frost" id="prlist"><span class="tkeye">Recent practice</span>' + recent.map(function (e) {
      var sp = MYGAME.SPOKES.filter(function (x) { return x.k === e.spoke; })[0];
      return '<div class="pritem"><span><b>' + esc(e.focus || sp.name) + '</b><small>' + esc(new Date(Date.parse(e.date)).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })) + ' · ' + esc(sp.name) + '</small></span><em>' + MYGAME.hm(e.min) + '</em>' +
        '<button class="prx" data-act="prdel" data-v="' + esc(e.id) + '" aria-label="Remove ' + esc(e.focus || sp.name) + ' ' + e.min + ' min">×</button></div>'; }).join('') + '</div>';
    return o;
  }
  function archiveHTML() {
    var cur = rounds.filter(function (r) { return r.id === localStorage.getItem(CUR); })[0], nSaved = savedRounds().length;
    var h = '<div class="frostpage theme-sky archivepage"><div class="topbar frost"><button class="txt frostbtn" data-act="home">‹ Home</button><div class="title"><b>Settings</b><span>' + nSaved + ' saved round' + (nSaved === 1 ? '' : 's') + '</span></div><span></span></div>';
    h += '<button class="big histbtn frostmain" data-act="history">📋 Rounds<br><small>' + nSaved + ' saved round' + (nSaved === 1 ? '' : 's') + ' – review stats &amp; maps</small></button>';
    var nC = courses().length;
    h += '<button class="big frostbtn crsbtn" data-act="courses">⛳ Courses<small>' + (nC ? nC + ' saved' : 'add par &amp; yardages') + '</small></button>';
    if (cur) h += '<button class="danger discard frostdanger" data-act="discard" data-id="' + esc(cur.id) + '">🗑 Discard round in progress' + (cur.course ? ' – ' + esc(cur.course) : '') + '</button>';
    h += '<h2>Your data</h2>' + playerHTML();
    if (view.notice) h += '<p class="notice ' + (view.notice.bad ? 'bad' : 'good') + '" id="notice" role="status">' + esc(view.notice.text) + '</p>';
    h += gdCardHTML();
    var rem = gdOn && gdState.connected ? '' : backupReminder(); if (rem) h += '<div class="tiprow" id="bkremind">' + tipBtn('bktip', '💡', 'Backup tip') + tipLbl('bktip', 'Backup tip') + tipText('bktip', esc(rem)) + '</div>';
    h += '<button class="big frostbtn" data-act="backup"' + (rounds.length || nC || bag().clubs.length || WEDGES.count(wedges()) ? '' : ' disabled') + '>💾 Back up rounds</button>' +
      '<label class="big filebtn frostbtn" for="restorefile">📂 Restore from backup</label><input type="file" id="restorefile" accept=".json,application/json" hidden>' +
      '<div class="tiprow" id="bkinfo">' + tipBtn('bkinfo', 'i', 'About backup and restore') + tipLbl('bkinfo', 'About backup &amp; restore') + tipText('bkinfo', 'Back up saves all rounds, saved courses, My Bag and your Wedges chart as one file (golf-rounds-backup-date.json) – choose Save to Files in the share sheet. Restore adds the rounds from a backup file; rounds already on this phone are not duplicated.') + '</div>';
    if (rounds.length) h += '<button class="big frostbtn" data-act="csvall">Export all rounds (CSV)</button>';
    h += '<button class="big frostbtn" data-act="about">ⓘ About the numbers</button>';
    h += '<p class="credits" id="credits">Course data: <a href="https://www.golfcore.org/" target="_blank" rel="noopener">GolfCore</a> · <a href="https://opengolfapi.org/" target="_blank" rel="noopener" title="Contains data from OpenGolfAPI (opengolfapi.org), ODbL 1.0">OpenGolfAPI</a> (<a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noopener">ODbL</a>) · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a></p>'; // v113 – one short line (Settings keeps long text behind (i) buttons)
    h += '<p class="appver setver" id="setver" aria-label="App version">' + esc(APP_VER) + '</p>';
    if (view.gdr) h += gdRestoreHTML();
    return h + '</div>';
  }

  // v128: Help (+ menu › Help) – a few Get started lines, the how-to video and the how-to guide PDF (help/, not in the offline cache)
  function helpHTML() {
    var steps = ['Tap <b>+</b> › <b>New round</b>, pick a course, <b>Start round</b>.', 'Log each shot: distance, lie, club.', 'Mark the shot that goes in: <b>In the hole</b> or <b>Hole out</b> (1-putts too).',
      '<b>Scorecard &amp; stats</b> works any time mid-round.', '<b>Finish round</b> on 18, then open <b>Stats</b>.'];
    return '<div class="frostpage theme-sky helppage" id="helppage"><div class="topbar frost"><button class="txt frostbtn" data-act="home">‹ Home</button><div class="title"><b>Help</b><span>Get started with Strokewise</span></div><span></span></div>' +
      '<div class="frostcard hpcard" id="hpstart"><b class="hph">Get started</b><ol class="hpsteps">' + steps.map(function (t) { return '<li>' + t + '</li>'; }).join('') + '</ol></div>' +
      '<div class="frostcard hpcard" id="hpvideo"><b class="hph">Watch the video</b><small class="hpsub">Entering a round, finishing it, Stats · 3:41 · with voice</small>' +
      '<video id="hpvid" class="hpvid" controls playsinline preload="none" poster="help/poster.webp" src="help/PinHigh-Video.mp4" aria-label="How-to video: entering a round and Stats"></video></div>' +
      '<div class="frostcard hpcard" id="hpguide"><b class="hph">Read the guide</b><small class="hpsub">Every feature, step by step · 15 pages</small>' +
      '<a class="hpbtn" id="hppdf" href="help/PinHigh-HowTo.pdf" target="_blank" rel="noopener">📄 Open the guide (PDF)</a></div>' +
      '<p class="appver setver" aria-label="App version">' + esc(APP_VER) + '</p></div>';
  }

  // ---------- Saved courses (typed in: par + yardages per tee box) ----------
  // v113: small fixed-size tee dot (pure CSS, nothing to load): the colour in the name, two-tone for combos, a white circle otherwise
  function teeDot(name) { var c = COURSES.teeColors(name);
    var bg = c.length > 1 ? 'linear-gradient(90deg,' + c[0] + ' 50%,' + c[1] + ' 50%)' : (c[0] || '');
    return '<i class="tdot' + (c.length ? '' : ' tdot-none') + '" aria-hidden="true"' + (bg ? ' style="background:' + bg + '"' : '') + '></i>'; }
  function teeLabel(t, k) { return String(t.name || '').trim() || 'Tee box ' + (k + 1); }
  function teeTot(t) { var n = COURSES.teeTotal(t); return n ? n.toLocaleString('en-US') : ''; }
  // New round: Course dropdown (+ Add new course first, then saved courses, most recently used first) → tee box chips
  function rememberedTee(c) { // v114: the tee from the last round played at this course, if it still exists
    var best = null; (rounds || []).forEach(function (r) { if (r && r.courseId === c.id && r.tee && (!best || String(r.date || '') > String(best.date || ''))) best = r; });
    return best && (c.tees || []).some(function (t) { return t.name === best.tee; }) ? best.tee : '';
  }
  function newCourseHTML() {
    var list = COURSES.byRecent(courses(), rounds), nc = view.newC && courseById(view.newC.id), adding = !nc && (view.newAdd || !list.length), h = '';
    if (view.near) return h + nearHTML(); // v113: Courses near me panel in place of the course picker
    h += '<button type="button" class="nearbtn" id="nearbtn" data-act="nearopen">📍 Courses near me</button>';
    if (list.length) {
      h += '<span class="lbl" id="crslbl">Course</span><button type="button" class="crspick' + (view.crsOpen ? ' open' : '') + (nc ? ' chosen' : '') + '" id="crspick" data-act="crsopen" aria-haspopup="listbox" aria-expanded="' + !!view.crsOpen + '" aria-labelledby="crslbl crspick">' +
        '<span id="crspicked">' + (nc ? esc(nc.name) : adding ? '+ Add new course' : 'Choose a course') + '</span><i aria-hidden="true">' + (view.crsOpen ? '▴' : '▾') + '</i></button>';
      if (view.crsOpen) h += '<div class="crslist" id="crslist" role="listbox" aria-label="Courses"><button type="button" class="crsopt crsadd" role="option" data-act="crsnew" aria-selected="' + !!adding + '">+ Add new course</button>' +
        list.map(function (c) { var on = !!nc && nc.id === c.id, par = COURSES.sum(c.pars);
          return '<button type="button" class="crsopt' + (on ? ' sel' : '') + '" role="option" aria-selected="' + on + '" data-act="ncourse" data-id="' + esc(c.id) + '"><b>' + esc(c.name) + '</b><small>' +
            (c.tees.length === 1 ? esc(c.tees[0].name) : c.tees.length + ' tee boxes') + (par ? ' · par ' + par : '') + '</small></button>'; }).join('') + '</div>';
    }
    if (nc) {
      var tees = nc.tees || [];
      var cur = null, fold = false;
      tees.forEach(function (t) { if (view.newC.tee === t.name) cur = t; });
      if (tees.length === 1) cur = tees[0];
      fold = !!cur && tees.length > 1 && !!view.newC.fold; // v114: a picked (or remembered) tee folds the list to one row
      var teeSm = function (t) { var yd = teeTot(t) || (t.total ? Number(t.total).toLocaleString('en-US') : ''), rt = NEAR.rtText(t); return (yd ? yd + ' yd' : '') + (yd && rt ? ' · ' : '') + rt; }; // v113: rating / slope when known
      var teeIn = function (t) { var sm = teeSm(t); return teeDot(t.name) + '<span class="tname">' + esc(t.name) + '</span>' + (sm ? '<small>' + sm + '</small>' : ''); };
      h += '<span class="lbl" id="teelbl">' + (tees.length > 1 ? 'Tee box' : 'Playing from') + '</span>';
      if (fold) h += '<div class="ntees folded" id="ntees" role="group" aria-labelledby="teelbl"><button type="button" class="ntee sel nteefold" id="nteefold" aria-expanded="false" aria-label="' + esc(cur.name) + ' – tap to change tee" data-act="nteeopen">' + teeIn(cur) + '<i class="ncaret" aria-hidden="true">▾</i></button></div>' +
        '<button type="button" class="txtlink naddtee nlink" data-act="naddtee">＋ Add tee box</button>';
      else h += '<div class="ntees" id="ntees" role="group" aria-labelledby="teelbl">' + tees.map(function (t) {
        var on = view.newC.tee === t.name || (tees.length === 1);
        return '<button type="button" class="ntee' + (on ? ' sel' : '') + '" aria-pressed="' + on + '" data-act="ntee" data-v="' + esc(t.name) + '">' + teeIn(t) + '</button>'; }).join('') +
        '<button type="button" class="ntee naddtee" data-act="naddtee">＋ Add tee box</button></div>';
      if (nc.src === 'golfcore') { // v113: imported course – blank holes note + credit
        var gp = NEAR.gaps(nc, view.newC.tee || (tees[0] || {}).name);
        if (gp) h += '<button type="button" class="txtlink nmiss" id="nmiss" data-act="nedit">Some holes are missing – tap to fill in</button>';
        h += gcCredit(nc);
      }
      h += '<button type="button" class="txtlink nedit" data-act="nedit">✎ Rename tees or fix numbers</button>';
    }
    if (adding) h += (list.length ? '' : '<span class="lbl" id="crslbl">Course</span>') + '<input type="text" id="course" placeholder="Course name' + (list.length ? '' : ' (optional)') + '" autocomplete="off" value="' + esc(view.newName || '') + '" aria-label="Course name">' +
      '<button class="sheet-item ntype" id="ntype" data-act="cardmanual" aria-label="Type in par and yardages">✎ Type in par &amp; yardages</button>';
    return h;
  }
  // ---------- v113: Courses near me (finder list from OpenGolfAPI, scorecards from GolfCore) ----------
  var NEARLIST = null, NEARCACHE = 'pinhigh-courselist-v1', NEARURL = './data/us-courses.json';
  function gcCredit(c) { return '<p class="gccredit" id="gccredit">Course data: <a href="' + esc(c.gcUrl || 'https://www.golfcore.org/') + '" target="_blank" rel="noopener">GolfCore</a></p>'; }
  function nearRow(i, mi) { var r = NEARLIST[i], C = NEAR.COL; // v113: one tight line – name · town, ST · 18 holes … distance at the right
    var sub = [(r[C.city] ? r[C.city] + ', ' : '') + r[C.state]]; if (r[C.holes]) sub.push(r[C.holes] + ' holes');
    var saved = courses().some(function (c) { return c.ogKey === NEAR.key(r); });
    return nearLine('nearpick', 'data-i="' + i + '"', r[C.name], sub.join(' · '), saved, mi != null ? NEAR.fmtMi(mi) : ''); }
  function nearLine(act, attr, name, sub, saved, dist) {
    return '<button type="button" class="nearopt" data-act="' + act + '" ' + attr + '><b>' + esc(name) + '</b><small>' + (sub ? ' · ' + esc(sub) : '') + '</small>' +
      (saved ? '<em class="nsaved">saved</em>' : '') + (dist ? '<span class="nmi">' + esc(dist) + '</span>' : '') + '</button>'; }
  function nearResHTML() {
    var N = view.near, P = N.pos, R = NEAR.search(NEARLIST || [], N.q || '', P && P.lat, P && P.lng, 20);
    if (!String(N.q || '').trim()) return '';
    return R.length ? '<div class="crslist nearlist" id="nearres">' + R.map(function (x) { return nearRow(x.i, x.mi); }).join('') + '</div>' : '<p class="nearmsg" id="nearres">No course by that name in the list.</p>';
  }
  function nearHTML() {
    var N = view.near, h = '<div class="nearbox" id="nearbox">';
    if (N.step === 'ask') h += '<p class="nearwhy" id="nearwhy">Strokewise uses your location once to find nearby courses. It isn\'t saved or sent anywhere.</p>' +
      '<button type="button" class="nearok" data-act="neargo">Find courses near me</button><button type="button" class="nearlink" data-act="nearname">Search by name instead</button>';
    else if (N.step === 'busy') h += '<p class="nearmsg" id="nearbusy" role="status">' + esc(N.msg) + '</p>';
    else if (N.step === 'list') {
      if (N.msg) h += '<p class="nearmsg" id="nearnote" role="status">' + esc(N.msg) + '</p>';
      if (N.pos) { var L = NEAR.nearest(NEARLIST, N.pos.lat, N.pos.lng, N.more || 5);
        h += '<span class="lbl">Nearest courses</span><div class="crslist nearlist" id="nearlist">' + L.map(function (x) { return nearRow(x.i, x.mi); }).join('') + '</div>' +
          '<button type="button" class="nearlink" data-act="nearmore">Show more</button>'; }
      h += '<input type="text" id="nearq" placeholder="Search by name or town" autocomplete="off" value="' + esc(N.q || '') + '" aria-label="Search courses by name or town">' + nearResHTML();
    } else if (N.step === 'confirm') {
      h += '<p class="nearmsg" id="nearask">Is it one of these? (GolfCore lists it a little differently)</p><div class="crslist nearlist" id="nearcands">' + N.cands.map(function (x, k) {
        return nearLine('nearcand', 'data-k="' + k + '"', x.g.name, [x.g.city, x.g.region].filter(Boolean).join(', '), false, NEAR.fmtMi(x.mi)); }).join('') + '</div>' +
        '<button type="button" class="nearlink" data-act="nearmanual">None of these – type it in myself</button>';
    } else if (N.step === 'layout') {
      h += '<p class="nearmsg" id="nearask">Which course at ' + esc(N.detail.name) + '?</p><div class="crslist nearlist">' + N.detail.layouts.map(function (l, k) {
        return nearLine('nearlayout', 'data-k="' + k + '"', l.name || 'Course ' + (k + 1), [(l.par ? 'par ' + l.par : ''), (l.tees || []).length ? l.tees.length + ' tees' : ''].filter(Boolean).join(' · '), false, ''); }).join('') + '</div>';
    } else if (N.step === 'err') {
      h += '<p class="nearmsg nearerr" id="nearerr" role="status">' + esc(N.msg) + '</p>' + (N.retry ? '<button type="button" class="nearok" data-act="nearretry">Try again</button>' : '') +
        '<button class="sheet-item ntype" data-act="nearmanual">✎ Type in par &amp; yardages</button>';
    }
    return h + '<button type="button" class="nearlink" data-act="nearclose">' + (N.step === 'list' || N.step === 'ask' ? 'Back to my courses' : 'Cancel') + '</button></div>';
  }
  function nearSet(o) { if (!view.near || view.hmenu !== 'new') return false; Object.assign(view.near, o); render(); if (o.step === 'list' && !view.near.pos) { var q = document.getElementById('nearq'); if (q) q.focus(); } return true; }
  // the finder list: from its own cache if downloaded before (a new app version keeps it), otherwise downloaded once now
  function nearLoad() {
    if (NEARLIST) return Promise.resolve(NEARLIST);
    var C = window.caches;
    var get = function () { return fetch(NEARURL, { cache: 'no-store' }).then(function (res) { if (!res.ok) throw new Error('list ' + res.status);
      var copy = C ? res.clone() : null, keep = C ? C.open(NEARCACHE).then(function (c) { return c.put(NEARURL, copy); }).catch(function () {}) : null; /* clone before the body is read */ return res.json().then(function (j) { return keep ? keep.then(function () { return j; }) : j; }); }); };
    var p = C ? C.open(NEARCACHE).then(function (c) { return c.match(NEARURL); }).then(function (hit) { return hit ? hit.json() : get(); }, get) : get();
    return p.then(function (j) { NEARLIST = (j && j.courses) || []; return NEARLIST; });
  }
  function nearWhere() { // one location reading, approximate is fine; nothing is stored
    return new Promise(function (ok, bad) {
      if (!navigator.geolocation) return bad({ code: 'none' });
      var done = false, t = setTimeout(function () { if (!done) { done = true; bad({ code: 3 }); } }, 12000);
      navigator.geolocation.getCurrentPosition(function (p) { if (done) return; done = true; clearTimeout(t); ok({ lat: p.coords.latitude, lng: p.coords.longitude }); },
        function (e) { if (done) return; done = true; clearTimeout(t); bad(e || {}); }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 });
    });
  }
  function nearGo(useLoc) {
    var N = view.near; N.useLoc = useLoc; N.step = 'busy'; N.msg = useLoc ? 'Finding courses near you…' : 'Getting the course list…'; N.pos = null; N.more = 5; render();
    var where = useLoc ? nearWhere().then(function (p) { return p; }, function (e) { return { err: e }; }) : Promise.resolve(null);
    Promise.all([nearLoad(), where]).then(function (a) {
      if (view.near !== N) return;
      var p = a[1], msg = '';
      if (p && p.err) { msg = p.err.code === 1 ? 'Location is turned off for Strokewise – search by name instead.' : 'Couldn\'t get your location – search by name instead.'; p = null; }
      nearSet({ step: 'list', pos: p, msg: msg });
    }, function () { if (view.near === N) nearSet({ step: 'err', retry: true, msg: 'Couldn\'t download the course list – check your connection and try again, or type the course in yourself.' }); });
  }
  function gcGet(path) {
    var G = window.GOLF_CONFIG || {}, base = String(G.GOLFCORE_BASE || '').replace(/\/+$/, ''); // the relay adds the key; none in the app
    if (!base) return Promise.reject(Object.assign(new Error('no GolfCore address'), { status: 503 }));
    return fetch(base + path, { headers: { Accept: 'application/json' } }).then(function (res) {
      if (!res.ok) { var e = new Error('golfcore ' + res.status); e.status = res.status; throw e; } return res.json(); });
  }
  function gcErr(e) {
    var st = e && e.status;
    if (!st) return 'No connection right now, so the scorecard can\'t be fetched. Try again when you have signal, or type it in yourself.';
    if (st === 404) return 'GolfCore doesn\'t have a scorecard for this course.';
    if (st === 429) return 'The free course lookups are used up for now. Try again later, or type it in yourself.';
    if (st === 401 || st === 403) return 'The course lookup isn\'t working right now (see the README). You can type the card in yourself.';
    return 'Couldn\'t get the scorecard right now. Try again, or type it in yourself.';
  }
  function nearUse(c) { view.newC = { id: c.id, tee: (c.tees[0] || {}).name || '' }; view.newAdd = false; view.crsOpen = false; view.near = null; render(); }
  function nearPick(i) {
    var r = NEARLIST[i], C = NEAR.COL, N = view.near, saved = courses().filter(function (c) { return c.ogKey === NEAR.key(r); })[0];
    if (saved) { nearUse(saved); return; } // already saved (and maybe edited): never fetched again
    N.row = r; N.step = 'busy'; N.msg = 'Getting the scorecard for ' + r[C.name] + '…'; N.retry = null; render();
    gcGet('/courses?near=' + r[C.lat] + ',' + r[C.lng] + '&radius=3&limit=10').then(function (j) {
      if (view.near !== N) return;
      var M = NEAR.match(r, j.courses || []);
      if (!M.best) return nearSet({ step: 'err', retry: false, msg: 'GolfCore doesn\'t list this course yet. You can type the card in yourself.' });
      if (M.close) return nearSlug(M.best.g.slug);
      nearSet({ step: 'confirm', cands: M.list.slice(0, 5) });
    }, function (e) { if (view.near === N) nearSet({ step: 'err', retry: function () { nearPick(i); }, msg: gcErr(e) }); });
  }
  function nearSlug(slug) {
    var N = view.near, have = courses().filter(function (c) { return c.gcId === slug; });
    if (have.length === 1) { nearUse(have[0]); return; }
    N.step = 'busy'; N.msg = 'Getting the scorecard…'; render();
    gcGet('/courses/' + encodeURIComponent(slug)).then(function (d) {
      if (view.near !== N) return;
      var L = d.layouts || [];
      if (!L.some(function (l) { return (l.holes || []).length || (l.tees || []).length; })) return nearSet({ step: 'err', retry: false, msg: 'GolfCore has ' + d.name + ' but no scorecard for it yet. You can type it in yourself.' });
      if (L.length > 1) return nearSet({ step: 'layout', detail: d });
      nearSave(d, 0);
    }, function (e) { if (view.near === N) nearSet({ step: 'err', retry: function () { nearSlug(slug); }, msg: gcErr(e) }); });
  }
  function nearSave(d, k) {
    var c = COURSES.clean(NEAR.fromGolfCore(d, k, view.near.row)), list = courses(), old = list.filter(function (x) { return x.id === c.id; })[0];
    if (old) { nearUse(old); return; } // Scott's copy (edited or not) always wins over a fresh import
    list.unshift(c); saveCourses(list); backupDirty(3000); toast('Saved ' + c.name); nearUse(c);
  }
  function nearManual() { var r = view.near && view.near.row; view.near = null; cardOpen('new', COURSES.blankCourse(r ? r[NEAR.COL.name] : String(view.newName || '').trim())); }
  function nearAct(act, b) {
    var N = view.near;
    switch (act) {
      case 'nearopen': view.near = { step: 'ask' }; view.crsOpen = false; render(); return;
      case 'neargo': nearGo(true); return;
      case 'nearname': nearGo(false); return;
      case 'nearmore': if (N) { N.more = (N.more || 5) + 5; render(); } return;
      case 'nearpick': nearPick(+b.getAttribute('data-i')); return;
      case 'nearcand': if (N && N.cands) nearSlug(N.cands[+b.getAttribute('data-k')].g.slug); return;
      case 'nearlayout': if (N && N.detail) nearSave(N.detail, +b.getAttribute('data-k')); return;
      case 'nearretry': if (N && typeof N.retry === 'function') N.retry(); else if (N) nearGo(!!N.useLoc); return;
      case 'nearmanual': nearManual(); return;
      case 'nearclose': view.near = null; render(); return;
    }
  }
  // Open a saved course in the card editor from the New round sheet (rename tees, fix numbers, or add a tee box)
  function newEdit(addTee) {
    var nc = view.newC && courseById(view.newC.id); if (!nc) return;
    var c = JSON.parse(JSON.stringify(nc)), sel = Math.max(0, c.tees.map(function (t) { return t.name; }).indexOf(view.newC.tee));
    if (addTee) { c.tees.push({ name: '', yards: COURSES.pad([]) }); sel = c.tees.length - 1; }
    cardOpen('new', c); view.card.sel = sel; view.card.addTee = !!addTee; render();
    if (addTee) { var ti = document.querySelector('[data-cf="tee"]'); if (ti) ti.focus(); }
  }
  function cardOpen(from, c) {
    var keep = from === 'new' ? { newC: view.newC, newAdd: view.newAdd, newName: view.newName, newBl: view.newBl } : null;
    view.card = { from: from, course: c || COURSES.blankCourse(''), sel: 0, keep: keep }; view.screen = 'card'; view.hmenu = null; render(); window.scrollTo(0, 0);
  }
  function cardBack() {
    var C = view.card;
    view.card = null;
    if (C && C.from === 'new') { view.screen = 'home'; view.hmenu = 'new'; if (C.keep) { view.newC = C.keep.newC; view.newAdd = C.keep.newAdd; view.newName = C.keep.newName; view.newBl = C.keep.newBl; } } else { view.screen = C && C.from === 'archive' ? 'courses' : 'home'; }
    render(); window.scrollTo(0, 0);
  }
  function cardTop(title) { return '<div class="topbar frost"><button class="txt frostbtn" data-act="cardback">‹ Back</button><div class="title"><b>' + title + '</b></div><span></span></div>'; }
  function cardHTML() {
    var C = view.card, c = C.course, h = '<div class="frostpage theme-sky cardpage">';
    { // v89: typed in only (the photo scan is gone)
      var t = c.tees[C.sel] || c.tees[0], P = c.pars, Y = t.yards;
      var miss = 0; for (var i = 0; i < 18; i++) if (P[i] == null || Y[i] == null) miss++;
      h += cardTop(courseById(c.id) ? 'Edit course' : 'Add a course') + '<div class="frostcard cardrev"><input type="text" class="crsname" data-cf="name" placeholder="Course name" value="' + esc(c.name) + '" autocomplete="off">' +
        '<p class="teelbl" id="revteelbl">Tee boxes</p><div class="revtees">' + c.tees.map(function (x, k) { return '<button class="frostchip' + (k === C.sel ? ' sel' : '') + '" data-act="cardsel" data-i="' + k + '">' + teeDot(x.name) + esc(teeLabel(x, k)) + '</button>'; }).join('') +
        '<button class="frostchip addtee" data-act="cardaddtee" aria-label="Add a tee box">＋ Tee box</button></div>' +
        '<label class="teelbl" for="teenamein">Name these tees</label><div class="teename"><input type="text" id="teenamein" data-cf="tee" value="' + esc(t.name) + '" placeholder="e.g. White, Red, Truckee" autocomplete="off">' + (c.tees.length > 1 ? '<button class="frostdanger" data-act="carddeltee" aria-label="Remove this tee box">🗑</button>' : '') + '</div>' +
        '<div class="teequick" id="teequick" role="group" aria-label="Common tee names">' + COURSES.TEE_CHIPS.map(function (n) { var on = String(t.name || '').trim().toLowerCase() === n.toLowerCase();
          return '<button type="button" class="frostchip tq tq-' + n.toLowerCase() + (on ? ' sel' : '') + '" aria-pressed="' + on + '" data-act="cardteeq" data-v="' + n + '"><i aria-hidden="true"></i>' + n + '</button>'; }).join('') + '</div>' +
        '<div class="revgrid">' + [0, 9].map(function (f) {
          var rows = '<div class="rg-h"><span>#</span><span>Par</span><span>Yds</span></div>';
          for (var j = f; j < f + 9; j++) rows += '<div class="rg-r' + (P[j] == null || Y[j] == null ? ' miss' : '') + '" data-h="' + j + '"><span>' + (j + 1) + '</span><input type="text" inputmode="numeric" maxlength="1" data-cf="par" placeholder="–" data-i="' + j + '" value="' + (P[j] == null ? '' : P[j]) + '" aria-label="Par hole ' + (j + 1) + '">' +
            '<input type="text" inputmode="numeric" maxlength="3" data-cf="yd" placeholder="–" data-i="' + j + '" value="' + (Y[j] == null ? '' : Y[j]) + '" aria-label="Yards hole ' + (j + 1) + '"></div>';
          return '<div class="rg-col">' + rows + '<div class="rg-t"><span>' + (f ? 'In' : 'Out') + '</span><b id="rgp' + f + '">' + (COURSES.sum(P.slice(f, f + 9)) || '') + '</b><b id="rgy' + f + '">' + (COURSES.teeTotal(t, f, f + 9) || '') + '</b></div></div>';
        }).join('') + '</div><p class="revtot" id="revtot">Par ' + (COURSES.sum(P) || '–') + ' · ' + (teeTot(t) || '–') + ' yd</p>' +
        (miss ? '<p class="revmiss" id="revmiss">' + miss + ' hole' + (miss === 1 ? '' : 's') + ' to fill</p>' : '') + (c.src === 'golfcore' ? gcCredit(c) : '') + '</div>' +
        '<div class="tiprow">' + tipBtn('revinfo', 'i', 'About this check') + tipLbl('revinfo', 'About this card') + tipText('revinfo', 'Type the par and yards from the scorecard. Tap any box to fix a number. Add a tee box for each set of tees – every tee box is saved, and the round uses the one you pick.') + '</div>' +
        '<button class="big frostmain" data-act="cardsave">✓ Save course</button>';
    }
    return h + '</div>';
  }
  function cardRefresh() { // totals + "to fill" in place while typing (keeps the keyboard up)
    var C = view.card, c = C.course, t = c.tees[C.sel], P = c.pars, Y = t.yards, miss = 0;
    [0, 9].forEach(function (f) { var a = document.getElementById('rgp' + f), b = document.getElementById('rgy' + f); if (a) a.textContent = COURSES.sum(P.slice(f, f + 9)) || ''; if (b) b.textContent = COURSES.teeTotal(t, f, f + 9) || ''; });
    for (var i = 0; i < 18; i++) { var m = P[i] == null || Y[i] == null; if (m) miss++; var rw = document.querySelector('.rg-r[data-h="' + i + '"]'); if (rw) rw.classList.toggle('miss', m); }
    var tt = document.getElementById('revtot'); if (tt) tt.textContent = 'Par ' + (COURSES.sum(P) || '–') + ' · ' + (teeTot(t) || '–') + ' yd';
    var mm = document.getElementById('revmiss'); if (mm) mm.textContent = miss ? miss + ' hole' + (miss === 1 ? '' : 's') + ' to fill' : '';
  }
  function cardSave() {
    var C = view.card, kept = COURSES.keptTees(C.course.tees);
    if (!String(C.course.name || '').trim()) { toast('Add the course name'); var ni = document.querySelector('[data-cf="name"]'); if (ni) ni.focus(); return; }
    var unnamed = kept.length > 1 ? C.course.tees.indexOf(kept.filter(function (x) { return COURSES.noName(x.name); })[0]) : -1;
    if (unnamed >= 0) { C.sel = unnamed; render(); toast('Name each tee box – e.g. White or Red'); var tn0 = document.querySelector('[data-cf="tee"]'); if (tn0) tn0.focus(); return; }
    var c = COURSES.clean(C.course), selK = kept.indexOf(C.course.tees[C.sel]);
    if (c.src) c.edited = true; // v113: an imported course Scott has changed – a later import never replaces it
    var list = courses().filter(function (x) { return x.id !== c.id; }); list.unshift(c); saveCourses(list); backupDirty(3000);
    var tee = (c.tees[selK] || c.tees[0] || {}).name || '';
    toast('Saved ' + c.name); view.card = null;
    if (C.from === 'new') { if (C.keep) view.newBl = C.keep.newBl; view.newC = { id: c.id, tee: tee, fold: !!tee }; view.newAdd = false; view.newName = ''; view.screen = 'home'; view.hmenu = 'new'; } else view.screen = 'courses';
    render(); window.scrollTo(0, 0);
  }
  function coursesHTML() {
    var list = courses(), h = '<div class="frostpage theme-sky coursespage"><div class="topbar frost"><button class="txt frostbtn" data-act="archive">‹ Settings</button><div class="title"><b>Courses</b><span>' + list.length + ' saved</span></div><span></span></div>';
    h += list.map(function (c) { return '<div class="frostcard crsrow"><button class="crsopen" data-act="cardedit" data-id="' + esc(c.id) + '"><b>' + esc(c.name) + '</b><small>' + c.tees.map(function (t) { return esc(t.name); }).join(' · ') + ' · par ' + (COURSES.sum(c.pars) || '–') + '</small></button>' +
      '<button class="frostdanger crsdel" data-act="coursedel" data-id="' + esc(c.id) + '" aria-label="Delete ' + esc(c.name) + '">🗑</button></div>'; }).join('');
    if (!list.length) h += '<p class="frostnote cardnote">No saved courses yet.</p>';
    h += '<button class="big frostmain" data-act="crsadd">＋ Add a course</button>';
    h += '<div class="tiprow">' + tipBtn('crsinfo', 'i', 'About saved courses') + tipLbl('crsinfo', 'About saved courses') + tipText('crsinfo', 'Pick a course and tee when you start a round – each hole\'s par and tee distance are filled in. Tap a course to rename it or fix numbers. Courses are in your backups.') + '</div>';
    return h + '</div>';
  }
  // ---------- My Bag (v92): clubs + carries, and carries for other elevations / temperatures (physics in bag.js) ----------
  // Club picker on the shot rows / voice card: the bag's clubs when it has any (else the standard list). A club already on a
  // shot that isn't in the bag is still listed, so older rounds show what was picked.
  function clubChoices(cur) {
    var b = bag(), L = BAG.pickerClubs(b), out = L.length ? L.map(function (c) { var a = b.useCond && c.carry ? BAG.clubCarry(c, b) : null;
      return { code: c.code, label: c.code + (a ? ' · ' + Math.round(a) : '') }; }) : SG.CLUBS.map(function (c) { return { code: c, label: c }; });
    if (cur && !out.some(function (x) { return x.code === cur; })) out.push({ code: cur, label: cur });
    return out;
  }
  function fmtFt(v) { return Math.round(v).toLocaleString('en-US') + ' ft'; }
  function condText(c) { return fmtFt(c.elev) + ' · ' + Math.round(c.temp) + '°F'; }
  // v106: summary under "Adjust for playing conditions" – the baseline, plus the slider values when they differ from it
  // v108: in density altitude mode the "now" part is the density altitude instead of elevation · temperature
  function condNow(b) { return b.useDA ? fmtFt(b.da) + ' density altitude' : condText(b.cond); }
  function condSum(b) { return 'Carries entered at ' + condText(b.base) + (BAG.sameCond(b) ? '' : ' · now ' + condNow(b)); }
  function adjHead(b) { return b.useDA ? 'DA ' + fmtFt(b.da) : condText(b.cond); }
  // v108: the "?" card next to Use density altitude – plain words, the free app, the easiest way to use it
  function daHelpHTML() {
    return '<div class="dahelp-back" id="dahelpback" data-act="bagact" data-v="dahelp"></div><div class="dahelp frostcard" id="dahelp" role="dialog" aria-modal="true" aria-labelledby="dahelph">' +
      '<p class="dahh" id="dahelph">What is density altitude?</p>' +
      '<p>It’s how thin the air plays – one number that rolls elevation, temperature, air pressure and humidity together.</p>' +
      '<p>Higher or hotter means thinner air, so the ball carries farther. Below sea level (a negative number) means thicker air and shorter carries.</p>' +
      '<p class="daex">For example, Reno at 5,000 ft can read around 8,000 ft, and Sacramento at 800 ft can read around −1,200 ft.</p>' +
      '<p>The free iPhone app <a href="https://apps.apple.com/us/app/density-altitude/id994402197" target="_blank" rel="noopener" id="daapplink">Density Altitude+ by Rate of Climb</a> shows it for where you are.</p>' +
      '<p>Easiest way: check “Use density altitude” and type the app’s “Density Altitude” number in the box.</p>' +
      '<button class="frostbtn dahclose" id="dahclose" data-act="bagact" data-v="dahelp">Close</button></div>';
  }
  function bagSub(c) { var t = BAG.title(c), l = c.loft != null && c.cat !== 'pt' ? (Math.round(c.loft * 10) / 10) + '°' : ''; return [t, l].filter(Boolean).join(' · ') || BAG.CAT_NAME[c.cat] || 'Club'; }
  function adjHTML(c, b) {
    if (!c.carry || c.cat === 'pt' || BAG.sameCond(b)) return '';
    var a = Math.round(BAG.clubCarry(c, b)), d = a - c.carry;
    return '<b>' + a + '</b><small class="' + (d > 0 ? 'up' : d < 0 ? 'down' : '') + '">' + (d > 0 ? '+' + d : d < 0 ? '−' + Math.abs(d) : '±0') + '</small>';
  }
  function bagHTML() {
    var b = bag(), A = view.bagAdd, n = b.clubs.length;
    var h = '<div class="frostpage theme-sky bagpage"><div class="topbar frost">' + (A ? '<button class="txt frostbtn" data-act="bagact" data-v="addback">‹ Back</button>' : '<button class="txt frostbtn" data-act="home">‹ Home</button>') +
      '<div class="title"><b>' + (A ? 'Add clubs' : 'My Bag') + '</b><span>' + n + ' club' + (n === 1 ? '' : 's') + '</span></div><span></span></div>';
    if (A) return h + bagAddHTML(A) + '</div>';
    h += bagSegHTML('bag');
    if (!n) return h + '<div class="frostcard bagempty" id="bagempty"><b>Your bag is empty</b><p>Add your clubs and how far each one carries. They show up in the club picker during a round, and you can see your carries for any elevation and temperature.</p></div>' +
      '<button class="big frostmain" data-act="bagact" data-v="add" id="bagaddbtn">＋ Add clubs</button></div>';
    var same = BAG.sameCond(b), list = BAG.sorted(b);
    // v106: the conditions card is a collapsible section, collapsed every time the page opens (view.bagCondOpen is not saved)
    var co = !!view.bagCondOpen;
    h += '<div class="frostcard bagcond' + (co ? ' open' : '') + '" id="bagcond"><button class="bcfold" id="bagcondh" data-act="bagact" data-v="condfold" aria-expanded="' + co + '" aria-controls="bagcondb">' +
      '<span class="bcft"><b>Adjust for playing conditions</b><small id="bagcondsum">' + condSum(b) + '</small></span><i class="bcchev" aria-hidden="true"></i></button>';
    if (!co) h += '</div>';
    else h += '<div class="bcbody" id="bagcondb">';
    if (co) h += '<div class="bcbase"><span>Carries entered at</span><b id="bagbase">' + condText(b.base) + '</b><button class="bclink" data-act="bagact" data-v="baseedit" aria-expanded="' + !!view.bagBaseEdit + '">' + (view.bagBaseEdit ? 'Close' : 'Change') + '</button></div>';
    if (co && view.bagBaseEdit) h += '<div class="bcbedit" id="bagbedit"><label>Elevation<span><input type="text" inputmode="numeric" id="bagbelev" maxlength="5" value="' + b.base.elev + '"> ft</span></label>' +
      '<label>Temperature<span><input type="text" inputmode="numeric" id="bagbtemp" maxlength="3" value="' + b.base.temp + '"> °F</span></label><button class="bcsave" data-act="bagact" data-v="basesave">Save</button></div>' +
      '<p class="bchint">Where and when you measured your carries – e.g. Reno is about 4,500–5,000 ft, San Diego is near sea level.</p>';
    if (co) h += '<p class="bchead">Playing somewhere else?</p>' +
      '<div class="bcdarow"><label class="bcuse bcda"><input type="checkbox" id="bagusda"' + (b.useDA ? ' checked' : '') + '> Use density altitude</label>' +
      '<button type="button" class="dahbtn" id="dahbtn" data-act="bagact" data-v="dahelp" aria-label="What is density altitude?" aria-expanded="' + !!view.bagDaHelp + '">?</button></div>';
    if (co && b.useDA) h += '<div class="bcslide" id="bagdaslide"><div class="bclbl"><span>Density altitude</span><span class="datype"><button type="button" class="dasign" id="bagdasign" data-act="bagact" data-v="dasign" aria-label="Switch between above and below sea level">±</button>' +
      '<input type="text" inputmode="text" pattern="-?[0-9]*" enterkeyhint="done" autocomplete="off" id="bagdatxt" maxlength="6" value="' + Math.round(b.da) + '" aria-label="Density altitude in feet (can be negative)"> ft</span></div>' +
      '<input type="range" id="bagda" min="' + BAG.DA_MIN + '" max="' + BAG.DA_MAX + '" step="100" value="' + Math.round(b.da) + '" aria-label="Density altitude in feet"><div class="bcends"><span>−3,000 ft</span><span>12,000 ft</span></div>' +
      '<p class="bcdabase" id="bagdabase">Your baseline air (' + condText(b.base) + ') is about ' + fmtFt(BAG.baseDA(b)) + ' density altitude.</p></div>';
    if (co && !b.useDA) h += '' +
      '<div class="bcslide"><div class="bclbl"><span>Elevation</span><b id="bagelevv">' + fmtFt(b.cond.elev) + '</b></div><input type="range" id="bagelev" min="0" max="9000" step="100" value="' + b.cond.elev + '" aria-label="Elevation in feet"><div class="bcends"><span>Sea level</span><span>9,000 ft</span></div></div>' +
      '<div class="bcslide"><div class="bclbl"><span>Temperature</span><b id="bagtempv">' + Math.round(b.cond.temp) + '°F</b></div><input type="range" id="bagtemp" min="30" max="110" step="1" value="' + b.cond.temp + '" aria-label="Temperature in °F"><div class="bcends"><span>30°F</span><span>110°F</span></div></div>';
    if (co) h += '<div class="bcrow"><button class="frostchip bcreset" id="bagreset" data-act="bagact" data-v="reset"' + (same ? ' disabled' : '') + '>↺ Back to my baseline</button></div>' +
      '<label class="bcuse"><input type="checkbox" id="baguse"' + (b.useCond ? ' checked' : '') + '> Show these carries in the club picker during a round</label>' +
      '<p class="bcnote">Estimates from air density: thinner (higher) or warmer air means less drag and lift, so the ball carries a bit farther. Wind, humidity, ball temperature and firm or soft ground are not included.</p></div></div>';
    if (co && view.bagDaHelp) h += daHelpHTML();
    h += '<div class="bagsort" role="group" aria-label="Sort clubs"><button class="frostchip' + (b.sort === 'club' ? ' sel' : '') + '" data-act="bagact" data-v="sortclub">By club</button><button class="frostchip' + (b.sort === 'carry' ? ' sel' : '') + '" data-act="bagact" data-v="sortcarry">By carry</button></div>';
    h += '<div class="frostcard baglist' + (same ? ' same' : '') + '" id="baglist"><div class="bagrow bhead"><span>Club</span><span>Carry</span><span class="badj" id="bagadjh">' + (same ? '' : esc(adjHead(b))) + '</span></div>';
    list.forEach(function (c) {
      var ed = view.bagEdit === c.id;
      h += '<div class="bagrow" data-id="' + esc(c.id) + '"><button class="bname" data-act="bagact" data-v="edit" data-id="' + esc(c.id) + '" aria-expanded="' + ed + '"><b>' + esc(c.code) + '</b><small>' + esc(bagSub(c)) + '</small></button>' +
        (c.cat === 'pt' ? '<span class="bcarry none">–</span>' : '<span class="bcarry"><input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="3" data-bc="carry" data-id="' + esc(c.id) + '" value="' + (c.carry || '') + '" placeholder="–" aria-label="' + esc(c.code) + ' carry in yards"><i>yd</i></span>') +
        '<span class="badj" data-adj="' + esc(c.id) + '">' + adjHTML(c, b) + '</span></div>';
      if (ed) h += '<div class="bagedit" id="bagedit"><label>Name<input type="text" data-bc="code" data-id="' + esc(c.id) + '" maxlength="14" value="' + esc(c.code) + '"></label>' +
        (c.cat === 'pt' ? '' : '<label>Loft °<input type="text" inputmode="decimal" data-bc="loft" data-id="' + esc(c.id) + '" maxlength="4" value="' + (c.loft == null ? '' : c.loft) + '"></label>') +
        '<label class="wide">Brand &amp; model<input type="text" data-bc="model" data-id="' + esc(c.id) + '" maxlength="60" value="' + esc(BAG.title(c)) + '"></label>' +
        '<div class="bebtns"><button class="frostdanger" data-act="bagact" data-v="remove" data-id="' + esc(c.id) + '">Remove</button><button class="frostbtn" data-act="bagact" data-v="edit" data-id="' + esc(c.id) + '">Done</button></div></div>';
    });
    h += '</div><button class="big frostmain" data-act="bagact" data-v="add" id="bagaddbtn">＋ Add clubs</button>';
    h += '<div class="tiprow">' + tipBtn('baginfo', 'i', 'About My Bag') + tipLbl('baginfo', 'About My Bag') + tipText('baginfo', 'Type how far each club carries (in the air, yards) at your usual course. Tap a club to change its name or loft, or remove it. Your bag is saved on this phone and in your backups. Carry estimates come from a small ball-flight model using air density – a guide, not a guarantee.') + '</div>';
    return h + '</div>';
  }
  // ---------- v102 My Bag page: Bag | Wedge ladder toggle (Profile is gone; Player name lives in Settings) ----------
  function bagSegHTML(on) {
    return '<div class="bagseg" id="bagseg" role="tablist" aria-label="My Bag">' + [['bag', 'Bag'], ['wedges', 'Wedge ladder']].map(function (t) {
      var sel = t[0] === on; return '<button role="tab" class="' + (sel ? 'on' : '') + '" data-act="' + t[0] + '" id="seg' + t[0] + '" aria-selected="' + sel + '">' + t[1] + '</button>'; }).join('') + '</div>';
  }
  function wedgeClubs() { // short clubs from the bag (wedges + PW/9i-ish lofts), else a standard wedge list
    var L = BAG.sorted(bag(), 'club').filter(function (c) { return c.cat === 'we' || (c.cat === 'ir' && ((c.loft != null && c.loft >= 40) || /^(9i|pw|gw|aw|sw|lw|uw)$/i.test(c.code))) || (c.cat === 'ot' && c.loft >= 40); });
    return L.length ? L.map(function (c) { return { code: c.code, carry: c.carry || null }; }) : WEDGES.STD_CLUBS.map(function (c) { return { code: c, carry: null }; });
  }
  function wClubLbl(c) { return /^\d{2}$/.test(c) ? c + '°' : c; }
  function wChips(y, f, list, cur) {
    return '<div class="bagchips wchips" data-f="' + f + '">' + list.map(function (o) { return '<button class="frostchip' + (cur === o[0] ? ' sel' : '') + '" data-act="wact" data-v="set" data-y="' + y + '" data-f="' + f + '" data-k="' + esc(o[0]) + '" aria-pressed="' + (cur === o[0]) + '">' + esc(o[1]) + '</button>'; }).join('') + '</div>';
  }
  function wNote(y, f, val, ph) { return '<input type="text" class="wnote" data-wn="' + f + '" data-y="' + y + '" maxlength="80" value="' + esc(val || '') + '" placeholder="' + esc(ph) + '">'; }
  function wedgesHTML() {
    var fl = view.wFlight === 'low' ? 'low' : 'high', w = wedges(), R = WEDGES.rowsOf(w, fl), nw = WEDGES.filled(w, fl), clubs = wedgeClubs(), fromBag = clubs.map(function (c) { return c.code; }).join() !== WEDGES.STD_CLUBS.join();
    var h = '<div class="frostpage theme-sky bagpage wedgepage"><div class="topbar frost"><button class="txt frostbtn" data-act="home">‹ Home</button>' +
      '<div class="title"><b>My Bag</b><span>' + nw + ' of ' + WEDGES.YARDS.length + ' yardages set</span></div><span></span></div>' + bagSegHTML('wedges');
    h += '<div class="wflight" id="wflight" role="tablist" aria-label="Flight">' + WEDGES.FLIGHTS.map(function (f) { var on = f[0] === fl; return '<button role="tab" class="' + (on ? 'on' : '') + '" data-act="wact" data-v="flight" data-k="' + f[0] + '" aria-selected="' + on + '">' + f[1] + ' flight</button>'; }).join('') + '</div>';
    h += '<div class="frostcard wlist" id="wlist">';
    WEDGES.YARDS.forEach(function (y) {
      var r = R[y] || {}, open = view.wOpen === y, sum = WEDGES.summary(r);
      h += '<div class="wrow' + (open ? ' open' : '') + '" data-y="' + y + '"><button class="whead" data-act="wact" data-v="toggle" data-y="' + y + '" aria-expanded="' + open + '"><b>' + y + '<i>yd</i></b><span class="wsum' + (sum ? '' : ' none') + '" data-wsum="' + y + '">' + (sum ? esc(view.wEdit ? sum : WEDGES.summary(r, true) || sum) : 'Not set') + '</span><span class="wchev" aria-hidden="true">' + (open ? '⌃' : '⌄') + '</span></button>';
      var full = open && (view.wEdit || view.wFull === y || !sum);
      if (open && !full) { // v94 simple read-only view: three lines
        var line = function (lbl, val, note) { return '<div class="wsline"><span>' + lbl + '</span><b>' + (val ? esc(val) : note ? esc(note) : '–') + '</b></div>'; };
        h += '<div class="wsimple" id="wsimple">' + line('Club', r.club ? WEDGES.clubLabel(r.club) : '') + line('Ball position', WEDGES.name(WEDGES.BALL, r.ball), r.ballNote) + line('Club position', WEDGES.name(WEDGES.POS, r.pos), r.posNote) + '</div>';
      }
      if (full) {
        var known = clubs.some(function (c) { return c.code === r.club; }), other = view.wOther === y || (r.club && !known);
        h += '<div class="wbody" id="wbody">';
        h += '<h3 class="bagcat">Club</h3><div class="bagchips wchips" data-f="club">' + clubs.map(function (c) { var sel = r.club === c.code; return '<button class="frostchip' + (sel ? ' sel' : '') + '" data-act="wact" data-v="set" data-y="' + y + '" data-f="club" data-k="' + esc(c.code) + '" aria-pressed="' + sel + '">' + esc(wClubLbl(c.code)) + '</button>'; }).join('') +
          '<button class="frostchip bother' + (other ? ' sel' : '') + '" data-act="wact" data-v="other" data-y="' + y + '">Other</button></div>';
        if (other) h += wNote(y, 'club', known ? '' : r.club, 'Club, e.g. 54 or Gap wedge');
        if (!fromBag) h += '<p class="bchint">Add your wedges on the Bag tab to see them here.</p>';
        h += '<h3 class="bagcat">Ball position</h3>' + wChips(y, 'ball', WEDGES.BALL, r.ball) + wNote(y, 'ballNote', r.ballNote, 'Note (optional)');
        h += '<h3 class="bagcat">Shaft lean</h3>' + wChips(y, 'lean', WEDGES.LEAN, r.lean) + wNote(y, 'leanNote', r.leanNote, 'Note (optional)');
        h += '<h3 class="bagcat">Club position</h3>' + wChips(y, 'pos', WEDGES.POS, r.pos) + wNote(y, 'posNote', r.posNote, 'Note, e.g. choke down 1"');
        h += '<h3 class="bagcat">Hinge</h3>' + wChips(y, 'hinge', WEDGES.HINGE, r.hinge);
        h += '<div class="bebtns"><button class="frostdanger" data-act="wact" data-v="clear" data-y="' + y + '"' + (sum ? '' : ' disabled') + '>Clear</button><button class="frostbtn" data-act="wact" data-v="toggle" data-y="' + y + '">Done</button></div></div>';
      }
      h += '</div>';
    });
    h += '</div><button class="big frostbtn wedit' + (view.wEdit ? ' on' : '') + '" id="wedit" data-act="wact" data-v="editmode" aria-pressed="' + !!view.wEdit + '">' + (view.wEdit ? '✓ Done editing' : '✎ Edit') + '</button>';
    h += '<div class="tiprow">' + tipBtn('wedgeinfo', 'i', 'About Wedges') + tipLbl('wedgeinfo', 'About Wedges') + tipText('wedgeinfo', 'Two setups for every yardage: High flight and Low flight – switch with the toggle at the top. Every 10 yards from 40 to 110. Tap a set yardage to see its club, ball position and club position; tap Edit to change anything. Tap an empty yardage to set the club, ball position, shaft lean (degrees forward), club position (P1–P3) and wrist hinge. Everything saves on this phone as you tap and goes into your backups.') + '</div>';
    return h + '</div>';
  }
  function wAct(v, btn) {
    var y = +btn.getAttribute('data-y'), fl = view.wFlight === 'low' ? 'low' : 'high', w = wedges(), R = WEDGES.rowsOf(w, fl), r = R[y] || {};
    if (v === 'flight') { view.wFlight = btn.getAttribute('data-k') === 'low' ? 'low' : 'high'; view.wOpen = null; view.wFull = null; view.wOther = null; render(); return; }
    if (v === 'editmode') { view.wEdit = !view.wEdit; view.wFull = null; view.wOther = null; render(); var eb = document.getElementById('wedit'); if (eb && !view.wOpen) eb.scrollIntoView({ block: 'nearest' }); return; }
    if (v === 'toggle') { var opening = view.wOpen !== y; view.wOpen = opening ? y : null; view.wFull = opening && !WEDGES.summary(r) ? y : null; view.wOther = null; render(); var row = document.querySelector('.wrow[data-y="' + y + '"]'); if (view.wOpen && row && row.scrollIntoView) row.scrollIntoView({ block: 'nearest' }); return; }
    if (v === 'other') { view.wOther = y; render(); var i = document.querySelector('[data-wn="club"]'); if (i) i.focus(); return; }
    if (v === 'set') { var f = btn.getAttribute('data-f'), k = btn.getAttribute('data-k'); if (r[f] === k) delete r[f]; else r[f] = k; if (f === 'club') view.wOther = null; R[y] = r; saveWedges(w); render(); return; }
    if (v === 'clear') { var fn = fl === 'low' ? 'Low' : 'High'; if (!confirm('Clear the ' + fn + ' flight setup for ' + y + ' yards?')) return; delete R[y]; saveWedges(w); view.wOther = null; toast(y + ' yards (' + fn + ') cleared'); render(); return; }
  }
  document.addEventListener('input', function (ev) {
    var t = ev.target, f = t && t.getAttribute && t.getAttribute('data-wn'); if (!f) return;
    var y = +t.getAttribute('data-y'), w = wedges(), R = WEDGES.rowsOf(w, view.wFlight === 'low' ? 'low' : 'high'), r = R[y] || {};
    if (t.value.trim()) r[f] = t.value; else delete r[f]; R[y] = r; saveWedges(w);
    var s = document.querySelector('[data-wsum="' + y + '"]'), sum = WEDGES.summary(r); if (s) { s.textContent = (view.wEdit ? sum : WEDGES.summary(r, true) || sum) || 'Not set'; s.classList.toggle('none', !sum); }
    var c = document.querySelector('.wrow[data-y="' + y + '"] [data-v="clear"]'); if (c) c.disabled = !sum;
  });
  function bagAddHTML(A) {
    var h = '';
    if (A.step === 'make') {
      h += '<h2 class="bagh">Choose a brand</h2><div class="bagchips" id="bagmakes">' + BAG.makers().map(function (m) { return '<button class="frostchip" data-act="bagact" data-v="make" data-m="' + esc(m) + '">' + esc(m) + '</button>'; }).join('') +
        '<button class="frostchip bother" data-act="bagact" data-v="makeother">Other brand</button></div>';
      if (A.otherMake) h += '<div class="bagtype"><input type="text" id="bagmake" maxlength="40" placeholder="Brand" value="' + esc(A.makeTxt || '') + '"><button class="frostbtn" data-act="bagact" data-v="makego">Next ›</button></div>';
      return h;
    }
    if (A.step === 'model') {
      var cats = BAG.catsFor(A.make);
      h += '<h2 class="bagh">' + esc(A.make) + '</h2>';
      cats.forEach(function (k) { h += '<h3 class="bagcat">' + BAG.CAT_NAME[k] + '</h3><div class="bagchips">' + BAG.models(A.make, k).map(function (m) {
        return '<button class="frostchip" data-act="bagact" data-v="model" data-cat="' + k + '" data-m="' + esc(m) + '">' + esc(m) + '</button>'; }).join('') + '</div>'; });
      h += '<h3 class="bagcat">' + (cats.length ? 'Model not listed?' : 'Model') + '</h3><div class="bagtype"><input type="text" id="bagmodel" maxlength="40" placeholder="Model name (optional)" value="' + esc(A.modelTxt || '') + '"></div>' +
        '<p class="bchint">Then pick the kind of club:</p><div class="bagchips" id="bagothercats">' + BAG.CATS.map(function (c) { return '<button class="frostchip" data-act="bagact" data-v="modelother" data-cat="' + c[0] + '">' + c[1] + '</button>'; }).join('') + '</div>';
      return h;
    }
    // step 'clubs'
    var slots = BAG.SLOTS[A.cat] || [], nSel = Object.keys(A.sel).filter(function (k) { return A.sel[k]; }).length + (String(A.cname || '').trim() ? 1 : 0);
    h += '<h2 class="bagh">' + esc([A.make, A.model].filter(Boolean).join(' ')) + '</h2><p class="bchint">' + BAG.CAT_NAME[A.cat] + ' – ' + (A.cat === 'd' ? 'pick the loft' : A.cat === 'pt' ? 'add your putter' : 'tap each club you carry') + '. Lofts are typical and can be changed later.</p>';
    if (A.cat === 'd') h += '<div class="bagchips" id="bagslots">' + BAG.DRIVER_LOFTS.map(function (l) { return '<button class="frostchip' + (A.loft === l ? ' sel' : '') + '" data-act="bagact" data-v="loft" data-l="' + l + '">' + l + '°</button>'; }).join('') + '</div>';
    else if (A.cat !== 'pt') {
      h += '<div class="bagchips bagslots" id="bagslots">' + slots.map(function (s) { return '<button class="frostchip' + (A.sel[s[0]] ? ' sel' : '') + '" data-act="bagact" data-v="slot" data-c="' + esc(s[0]) + '" aria-pressed="' + !!A.sel[s[0]] + '"><b>' + esc(s[0]) + '</b><small>' + s[2] + '°</small></button>'; }).join('') + '</div>';
      if (A.cat === 'ir') h += '<div class="bagchips"><button class="frostchip bquick" data-act="bagact" data-v="irons" data-from="4">4i – PW</button><button class="frostchip bquick" data-act="bagact" data-v="irons" data-from="5">5i – PW</button><button class="frostchip bquick" data-act="bagact" data-v="irons" data-from="6">6i – PW</button></div>';
    }
    if (A.cat !== 'd' && A.cat !== 'pt') h += '<h3 class="bagcat">Something else?</h3><div class="bagtype two"><input type="text" id="bagcname" maxlength="14" placeholder="Club name (e.g. 2i)" value="' + esc(A.cname || '') + '"><input type="text" inputmode="decimal" id="bagcloft" maxlength="4" placeholder="Loft °" value="' + esc(A.cloft || '') + '"></div>';
    h += '<button class="big frostmain" data-act="bagact" data-v="addgo" id="bagaddgo"' + (nSel || A.cat === 'd' || A.cat === 'pt' ? '' : ' disabled') + '>' + (A.cat === 'd' ? 'Add driver' : A.cat === 'pt' ? 'Add putter' : 'Add ' + nSel + ' club' + (nSel === 1 ? '' : 's')) + '</button>';
    return h;
  }
  function bagRefresh() { // sliders: update the numbers in place (no re-render, so the drag isn't interrupted)
    var b = bag(), same = BAG.sameCond(b), el;
    if ((el = document.getElementById('bagelevv'))) el.textContent = fmtFt(b.cond.elev);
    if ((el = document.getElementById('bagtempv'))) el.textContent = Math.round(b.cond.temp) + '°F';
    if ((el = document.getElementById('baglist'))) el.classList.toggle('same', same);
    if ((el = document.getElementById('bagadjh'))) el.textContent = same ? '' : adjHead(b);
    if ((el = document.getElementById('bagreset'))) el.disabled = same;
    if ((el = document.getElementById('bagcondsum'))) el.textContent = condSum(b);
    b.clubs.forEach(function (c) { var s = document.querySelector('.badj[data-adj="' + c.id + '"]'); if (s) s.innerHTML = adjHTML(c, b); });
  }
  function bagAct(v, btn) {
    var b = bag(), A = view.bagAdd, id = btn.getAttribute('data-id'), c = id && b.clubs.filter(function (x) { return x.id === id; })[0];
    var focus = function (i) { var e = document.getElementById(i); if (e) e.focus(); };
    switch (v) {
      case 'add': view.bagAdd = { step: 'make', sel: {} }; view.bagEdit = null; break;
      case 'addback': if (!A) break; if (A.step === 'clubs') A.step = 'model'; else if (A.step === 'model') A.step = 'make'; else view.bagAdd = null; break;
      case 'make': A.make = btn.getAttribute('data-m'); A.otherMake = false; A.step = 'model'; A.modelTxt = ''; break;
      case 'makeother': A.otherMake = true; render(); focus('bagmake'); return;
      case 'makego': A.make = String(A.makeTxt || '').trim() || 'Other'; A.step = 'model'; A.modelTxt = ''; break;
      case 'model': case 'modelother':
        A.model = v === 'model' ? btn.getAttribute('data-m') : String(A.modelTxt || '').trim(); A.cat = btn.getAttribute('data-cat'); A.sel = {}; A.cname = ''; A.cloft = ''; A.step = 'clubs';
        if (A.cat === 'd') A.loft = 10.5; break;
      case 'slot': { var k = btn.getAttribute('data-c'); A.sel[k] = !A.sel[k]; break; }
      case 'irons': { var from = +btn.getAttribute('data-from'); A.sel = {}; BAG.SLOTS.ir.forEach(function (s) { var m = /^(\d)i$/.exec(s[0]); if ((m && +m[1] >= from) || s[0] === 'PW') A.sel[s[0]] = true; }); break; }
      case 'loft': A.loft = +btn.getAttribute('data-l'); break;
      case 'addgo': {
        var make = A.make === 'Other' ? '' : A.make, add = [];
        if (A.cat === 'd') add.push({ cat: 'd', code: 'Driver', make: make, model: A.model, loft: A.loft || 10.5 });
        else if (A.cat === 'pt') add.push({ cat: 'pt', code: 'Putter', make: make, model: A.model });
        else BAG.SLOTS[A.cat].forEach(function (s) { if (A.sel[s[0]]) add.push({ cat: A.cat, code: s[0], make: make, model: A.model, loft: s[2] }); });
        var cn = String(A.cname || '').trim(); if (cn && A.cat !== 'd' && A.cat !== 'pt') add.push({ cat: A.cat, code: cn, make: make, model: A.model, loft: A.cloft === '' || A.cloft == null || isNaN(+A.cloft) ? undefined : +A.cloft });
        if (!add.length) { toast('Pick at least one club'); return; }
        add.forEach(function (x) { x.id = BAG.newId(); var old = b.clubs[BAG.indexOfCode(b, x.code)]; if (old && old.carry) x.carry = old.carry; }); // re-adding a 7i keeps its carry
        var R = BAG.addClubs(b, add); saveBag(R.bag); view.bagAdd = null;
        toast((R.added ? 'Added ' + R.added : '') + (R.added && R.replaced ? ', ' : '') + (R.replaced ? 'replaced ' + R.replaced : '') + ' – now type each carry');
        render(); window.scrollTo(0, 0);
        var first = [].slice.call(document.querySelectorAll('[data-bc="carry"]')).filter(function (e) { return !e.value; })[0]; if (first) first.focus();
        return;
      }
      case 'sortclub': case 'sortcarry': b.sort = v === 'sortcarry' ? 'carry' : 'club'; saveBag(b, true); break;
      case 'edit': view.bagEdit = view.bagEdit === id ? null : id; break;
      case 'remove': if (!c || !confirm('Remove ' + c.code + (BAG.title(c) ? ' (' + BAG.title(c) + ')' : '') + ' from your bag?')) return;
        b.clubs = b.clubs.filter(function (x) { return x.id !== id; }); saveBag(b); view.bagEdit = null; toast(c.code + ' removed'); break;
      case 'condfold': view.bagCondOpen = !view.bagCondOpen; if (!view.bagCondOpen) { view.bagBaseEdit = false; view.bagDaHelp = false; } render(); return;
      case 'dahelp': view.bagDaHelp = !view.bagDaHelp; render(); if (view.bagDaHelp) focus('dahclose'); else focus('dahbtn'); return;
      case 'dasign': b.da = Math.max(BAG.DA_MIN, Math.min(BAG.DA_MAX, -Math.round(b.da))); saveBag(b, true); render(); focus('bagdatxt'); return;
      case 'baseedit': view.bagBaseEdit = !view.bagBaseEdit; render(); if (view.bagBaseEdit) focus('bagbelev'); return;
      case 'basesave': {
        var e = +(document.getElementById('bagbelev') || {}).value, t = +(document.getElementById('bagbtemp') || {}).value;
        if (!isFinite(e) || e < -1000 || e > 12000 || String((document.getElementById('bagbelev') || {}).value).trim() === '') { toast('Elevation: 0 to 12,000 ft'); focus('bagbelev'); return; }
        if (!isFinite(t) || t < 20 || t > 120 || String((document.getElementById('bagbtemp') || {}).value).trim() === '') { toast('Temperature: 20 to 120 °F'); focus('bagbtemp'); return; }
        var wasSame = BAG.sameCond(b); if (b.useDA && wasSame) { var nb = { base: { elev: Math.round(e), temp: Math.round(t) } }; b.da = BAG.baseDA(nb); } b.base = { elev: Math.round(e), temp: Math.round(t) }; if (wasSame) b.cond = { elev: Math.max(0, Math.min(9000, Math.round(e / 100) * 100)), temp: Math.max(30, Math.min(110, Math.round(t))) };
        saveBag(b); view.bagBaseEdit = false; toast('Baseline: ' + condText(b.base)); break;
      }
      case 'reset': if (b.useDA) b.da = BAG.baseDA(b); else b.cond = { elev: b.base.elev, temp: b.base.temp }; saveBag(b, true); break; // v108: resets whichever mode is on
    }
    render();
  }
  document.addEventListener('input', function (ev) {
    var t = ev.target; if (!t || !t.getAttribute) return;
    if (t.id === 'bagelev' || t.id === 'bagtemp') { var b = bag(); b.cond[t.id === 'bagelev' ? 'elev' : 'temp'] = +t.value; saveBag(b, true); bagRefresh(); return; }
    if (t.id === 'bagda') { var bd = bag(); bd.da = +t.value; saveBag(bd, true); var tx = document.getElementById('bagdatxt'); if (tx) tx.value = Math.round(bd.da); bagRefresh(); return; }
    if (t.id === 'bagdatxt') { // v108: typed density altitude – digits and one leading minus; live while typing when it's in range
      var cl = String(t.value).replace(/[−–—]/g, '-').replace(/[^0-9-]/g, ''); cl = (cl.charAt(0) === '-' ? '-' : '') + cl.replace(/-/g, '').slice(0, 5); if (cl !== t.value) t.value = cl;
      var dv = +cl; if (cl === '' || cl === '-' || !isFinite(dv) || dv < BAG.DA_MIN || dv > BAG.DA_MAX) return;
      var bt = bag(); bt.da = Math.round(dv); saveBag(bt, true); var sl = document.getElementById('bagda'); if (sl) sl.value = bt.da; bagRefresh(); return; }
    if (view.bagAdd) { if (t.id === 'bagmake') view.bagAdd.makeTxt = t.value; else if (t.id === 'bagmodel') view.bagAdd.modelTxt = t.value; else if (t.id === 'bagcloft') view.bagAdd.cloft = t.value.replace(/[^0-9.]/g, '');
      else if (t.id === 'bagcname') { view.bagAdd.cname = t.value; var n = Object.keys(view.bagAdd.sel).filter(function (k) { return view.bagAdd.sel[k]; }).length + (t.value.trim() ? 1 : 0), g = document.getElementById('bagaddgo'); if (g && view.bagAdd.cat !== 'd' && view.bagAdd.cat !== 'pt') { g.disabled = !n; g.textContent = 'Add ' + n + ' club' + (n === 1 ? '' : 's'); } } return; }
    if (t.getAttribute('data-bc') === 'carry') {
      t.value = t.value.replace(/[^0-9]/g, '').slice(0, 3);
      var b2 = bag(), c = b2.clubs.filter(function (x) { return x.id === t.getAttribute('data-id'); })[0]; if (!c) return;
      if (+t.value > 0) c.carry = +t.value; else delete c.carry; saveBag(b2, true);
      var s = document.querySelector('.badj[data-adj="' + c.id + '"]'); if (s) s.innerHTML = adjHTML(BAG.norm(b2).clubs.filter(function (x) { return x.id === c.id; })[0] || c, BAG.norm(b2));
    }
  });
  document.addEventListener('change', function (ev) {
    var t = ev.target; if (!t || !t.getAttribute) return;
    if (t.id === 'baguse') { var b = bag(); b.useCond = t.checked; saveBag(b, true); toast(t.checked ? 'Club picker shows carries for ' + condNow(b) : 'Club picker shows club names only'); return; }
    if (t.id === 'bagusda') { var bu = bag(); bu.useDA = t.checked; saveBag(bu, true); render(); return; } // v108: swap the two sliders for one density altitude slider
    if (t.id === 'bagdatxt') { // v108: on Done / leaving the box – clamp to −3,000 … 12,000 ft (blank or "-" goes back to the saved value)
      var bx = bag(), raw = String(t.value).replace(/[−–—]/g, '-').trim(), n = +raw;
      if (raw !== '' && raw !== '-' && isFinite(n)) { bx.da = Math.round(Math.max(BAG.DA_MIN, Math.min(BAG.DA_MAX, n))); if (bx.da !== n) toast('Density altitude: −3,000 to 12,000 ft'); saveBag(bx, true); }
      t.value = Math.round(bx.da); var s2 = document.getElementById('bagda'); if (s2) s2.value = bx.da; bagRefresh(); return; }
    var f = t.getAttribute('data-bc'); if (!f || f === 'carry') { if (f === 'carry') backupDirty(3000); return; }
    var b2 = bag(), c = b2.clubs.filter(function (x) { return x.id === t.getAttribute('data-id'); })[0]; if (!c) return;
    if (f === 'code') { var v = t.value.trim(), i = BAG.indexOfCode(b2, v); if (!v || (i >= 0 && b2.clubs[i] !== c)) { toast(v ? v + ' is already in your bag' : 'The club needs a name'); t.value = c.code; return; } c.code = v; }
    else if (f === 'loft') { var l = t.value.trim(); if (l === '') delete c.loft; else if (isFinite(+l) && +l >= 0 && +l <= 80) c.loft = +l; else { toast('Loft: a number like 33'); t.value = c.loft == null ? '' : c.loft; return; } }
    else if (f === 'model') { var mk = t.value.trim(), known = BAG.makers().filter(function (m) { return mk.toLowerCase().indexOf(m.toLowerCase() + ' ') === 0 || mk.toLowerCase() === m.toLowerCase(); }).sort(function (a, z) { return z.length - a.length; })[0];
      if (known) { c.make = known; c.model = mk.slice(known.length).trim(); } else { c.make = ''; c.model = mk; } }
    saveBag(b2); var keep = view.bagEdit; render(); view.bagEdit = keep;
  });
  function holeHTML() {
    var r = round(), h = r.holes[view.hole], a = AH(h), S = SG.summarize(r, blOf(r)), fin = !!h.finished && a.complete;
    var out = '<div class="topbar frost"><button class="frostbtn" data-act="prev" aria-label="Previous hole"' + (view.hole === 0 ? ' disabled' : '') + '>‹</button>' +
      '<div class="title"><b>' + (r.course ? esc(r.course) : 'Round') + '</b><span>' +
      (S.holesDone ? 'Total ' + S.strokes + ' (' + toPar(S.toPar) + ') thru ' + S.holesDone : 'No holes finished yet') + '<br>SG vs ' + esc(blName(blOf(r))) + '</span></div>' +
      '<button class="frostbtn" data-act="next" aria-label="Next hole"' + (view.hole === 17 ? ' disabled' : '') + '>›</button></div>';
    out += liveBarHTML(r);

    out += '<div class="holecard frostcard' + (fin ? ' fin' : '') + '">' + holeHeadHTML(r, h, fin);
    var pin = SG.normPin(h.pin);
    out += '<button class="pinbtn frostbtn' + (pin ? ' set' : '') + '" id="pinbtn" data-act="pinopen">⛳ ' + (pin ? 'Pin: ' + SG.PIN_NAME[pin].toLowerCase() + ' <small>change</small>' : 'Set pin location') + '</button>';

    // v115: finished shots are one tight line (# · Hit · Club · Loc · SG); only the shot being entered has the entry cells + its header
    var act = fin ? -1 : activeRow(h), thead = false;
    h.rows.forEach(function (row, k) {
      if (k === act) { out += '<div class="srow shead" id="shead"><span class="c-n">#</span><span class="c-d">Dist to pin</span><span class="c-l">Loc</span><span class="c-x">' + (k ? 'Dir' : '') + '</span><span class="c-p">' + (k ? 'P' : '') + '</span><span class="c-del"></span></div>' + rowHTML(h, a, row, k, fin); return; }
      if (!thead) { thead = true; out += '<div class="thead" id="thead" aria-hidden="true"><span>#</span><span>Hit</span><span>Club</span><span>Loc</span><span>SG</span></div>'; }
      out += tightHTML(h, a, k, fin);
    });

    var pens = h.rows.reduce(function (n, rw, k) { return n + (SG.isPenalty(rw, k) ? 1 : 0); }, 0);
    var lastR = h.rows[h.rows.length - 1], talk = !fin && !SG.isHoled(lastR, h.rows.length - 1);
    out += '<div class="countrow"><div class="count" id="count">' + countText(h, pens) + '</div>' + (talk ? micHTML() : '') + '</div>';
    if (fin) {
      out += '<div class="hole-done">Score <b>' + a.strokes + '</b> (' + toPar(a.strokes - h.par) + ') · SG <span class="' + sgCls(a.sg) + '">' + fmtSG(a.sg) + '</span></div>';
      out += '<button class="big frostbtn" data-act="reopen">✎ Edit this hole</button>';
    } else {
      var last = h.rows[h.rows.length - 1];
      if (!SG.isHoled(last, h.rows.length - 1)) out += '<button class="addshot big" data-act="addShot">Add Shot ⊕</button>';
      out += '<button class="finish big" data-act="finish"' + (a.complete && h.par ? '' : ' disabled') + '>✓ Finish hole</button>';
      out += '<div id="hint" class="hint">' + hintText(h, a) + '</div>';
    }
    out += '</div>';
    out += view.hole < 17
      ? '<button class="' + (fin ? 'primary ' : 'frostbtn ') + 'big" data-act="next">' + (started(r.holes[view.hole + 1]) ? 'Hole ' + (view.hole + 2) + ' ›' : 'Add Hole ' + (view.hole + 2) + ' ⊕') + '</button>'
      : '<button class="primary big" data-act="summary" data-end="1">Finish round – see stats</button>';
    out += '<button class="big rpbtn frostbtn" data-act="replay" data-v="' + view.hole + '">▶ Hole replay</button>';
    out += '<div class="row sub"><button class="txt frostbtn" data-act="home">Home</button><button class="txt frostbtn" data-act="summary">Scorecard &amp; stats</button></div>' +
      '<button class="danger discard frostdanger" data-act="discard" data-id="' + esc(r.id) + '">🗑 Discard round</button>';
    out += '<p class="help muted">Each row is ONE stroke. Dist = how far from the pin you hit it (yards; feet on the green). Loc = where the ball was. ' +
      'The shot that went in: tick "Hole out" on its row – its Loc (e.g. Rough) stays, so strokes gained counts it from there. Dir = where the shot before ended vs its target (8 ways: Short = toward you, Long = past it, Left, Right, and the corners). For an approach that missed the green, pick where it missed the green; if it found the green, pick where it stopped vs the hole. ' +
      'P = penalty stroke (+1), e.g. a drop. "OB re-hit" = +1 and you hit again from the same spot. Score = rows + penalties.</p>';
    if (view.dirk != null && h.rows[view.dirk] && !fin) out += dirSheetHTML(h, view.dirk);
    if (view.voice && view.voice.hole === view.hole && !fin) out += voiceCardHTML(h);
    if (view.liveCard && live) out += liveCardHTML(r);
    return out;
  }

  // ---------- Live sharing: "Share live" pill on the hole screen + a link card ----------
  var LIVE_SVG = '<svg class="liveico" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="2.6" fill="currentColor"/><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M5 5a10 10 0 0 0 0 14M19 5a10 10 0 0 1 0 14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
  function liveBarHTML(r) {
    if (!live || !r || view.preview) return '';
    var I = live.info(r.id);
    if (!I.on) return '<div id="livebar" class="livebar"><button class="livebtn frostbtn" data-act="liveshare">' + LIVE_SVG + '<span>Share live</span></button></div>';
    return '<div id="livebar" class="livebar"><button class="livebtn frostbtn on" data-act="livecard"><span class="livedot' + (I.waiting ? ' wait' : '') + '"></span><span>Sharing live</span><small>link</small></button>' +
      (I.waiting ? '<p class="livenote" id="livenote">Waiting for signal – will catch up</p>' : '') + '</div>';
  }
  function liveCardHTML(r) {
    var I = live.info(r.id); if (!I.on) return '';
    return '<div class="sheet-bg" data-act="liveclose"></div><div class="sheet frostsheet livesheet" role="dialog" aria-label="Live link">' +
      '<h3>Watch live</h3><p class="livehelp">Anyone with this link can watch this round update after every hole – no app or sign-in needed. It only works while you share.</p>' +
      '<input id="livelink" class="livelink" readonly value="' + esc(I.link) + '" aria-label="Live link">' +
      (I.waiting ? '<p class="livenote">Waiting for signal – will catch up</p>' : '<p class="livenote ok">' + (I.lastOk ? 'Up to date' : 'Sending…') + '</p>') +
      '<button class="big primary" data-act="livesend">Send link</button>' +
      '<div class="row"><button class="big frostbtn" data-act="livecopy">Copy link</button><button class="big frostbtn" data-act="liveclose">Done</button></div>' +
      '<button class="big danger" data-act="livestop">Stop sharing</button></div>';
  }
  function liveRefresh() {
    var b = document.getElementById('livebar'), r = round(); if (b && r && view.screen === 'hole') b.outerHTML = liveBarHTML(r);
    var c = document.querySelector('.livesheet .livenote'); if (c && r && live) { var I = live.info(r.id); c.className = 'livenote' + (I.waiting ? '' : ' ok'); c.textContent = I.waiting ? 'Waiting for signal – will catch up' : (I.lastOk ? 'Up to date' : 'Sending…'); }
  }
  function liveMsg(r) { var who = r.player || playerName() || 'the'; return 'Watch ' + (who === 'the' ? 'the round' : who + '’s round') + ' live' + (r.course ? ' at ' + r.course : '') + ' – the scorecard updates hole by hole.'; }
  function liveCopy(url) {
    var done = function () { toast('Link copied'); };
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(url).then(done, function () { liveSelect(); });
    liveSelect();
  }
  function liveSelect() { var i = document.getElementById('livelink'); if (i) { i.focus(); i.select(); try { if (document.execCommand('copy')) toast('Link copied'); } catch (e) {} } }
  function liveSend(r) { // must run inside the tap (iOS share sheet needs it)
    var url = live.info(r.id).link;
    if (navigator.share) navigator.share({ title: 'Strokewise · Live', text: liveMsg(r), url: url }).catch(function (e) { if (!e || e.name !== 'AbortError') liveCopy(url); });
    else liveCopy(url);
  }

  // ---------- Voice entry: hold the mic, say the shot, confirm ----------
  var MIC_SVG = '<svg class="micico" viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"><rect x="8.5" y="2.5" width="7" height="12" rx="3.5" fill="currentColor"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  // v83/v84: voice entry = the iPhone keyboard's own dictation. No Web Speech API (press-and-hold was unreliable in the home-screen app).
  // Tap "Say it" → a small box opens with the field focused in the same tap (so the keyboard comes up) → tap the keyboard 🎤 and talk →
  // tap ✓ (or Enter/Done) → same parser + confirmation card. v84: no idle auto-submit and no submit on blur – iOS pauses mid-phrase
  // (and can blur the field when dictation pauses/ends), so the text is kept until he taps ✓.
  var dictTimer = null; // kept for voiceState(); nothing schedules it any more
  function micHTML() { return '<button type="button" id="micbtn" class="micbtn" data-act="vdict" aria-label="Say it: dictate the shot">' + MIC_SVG + '<span class="miclbl">Say it</span></button>'; }
  function dictStop() { clearTimeout(dictTimer); dictTimer = null; }
  function dictOpen() { // runs inside the tap handler: render, then focus synchronously so iOS opens the keyboard
    dictStop(); view.voice = { hole: view.hole, stage: 'dict' }; render();
    var t = document.getElementById('vtext'); if (t) { t.value = ''; t.focus(); }
  }
  function dictSubmit() {
    dictStop(); var t = document.getElementById('vtext'), text = t ? t.value.replace(/\s+/g, ' ').trim() : '';
    if (!view.voice || view.voice.stage !== 'dict') return;
    if (!text) { if (t) t.focus(); return; }
    if (t) t.blur(); voiceHeard(text);
  }
  function micAbort() { dictStop(); }
  function voiceHeard(text) { var p = VOICE.parse(text); if (p && p.club) p.club = BAG.matchClub(p.club, bag()); view.voice = { hole: view.hole, stage: 'confirm', p: p }; render(); }
  function vSel(f, opts, cur) { return '<select data-vf="' + f + '">' + opts.map(function (o) { return '<option value="' + o[0] + '"' + (String(cur == null ? '' : cur) === String(o[0]) ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>'; }
  function voiceCardHTML(h) {
    var V = view.voice, out = '<div class="sheet-bg" data-act="vcancel"></div><div class="sheet frostsheet voicecard" role="dialog" aria-label="Voice entry">';
    if (V.stage === 'dict') {
      return '<div class="sheet-bg" data-act="vcancel"></div><div class="sheet frostsheet voicecard voicedict" role="dialog" aria-label="Say the shot">' +
        '<input type="text" id="vtext" enterkeyhint="done" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" placeholder="3rd shot green 25 ft" aria-label="Shot">' +
        '<p class="vhint">Tap 🎤 on your keyboard, talk, then tap ✓</p>' +
        '<div class="vdrow"><button class="frostmain vgo" data-act="vgo" aria-label="Done – check the shot">✓</button><button class="frostbtn vx" data-act="vcancel" aria-label="Close">✕</button></div></div>';
    }
    var p = V.p, res = VOICE.apply(h, p), fields = VOICE.describe(h, res, p);
    out += '<h3>' + MIC_SVG + ' I heard</h3><p class="vraw">“' + esc(p.raw) + '”</p>';
    if (V.stage === 'edit') {
      var k = res.k < 0 ? (p.shot ? p.shot - 1 : h.rows.length) : res.k, R = res.rows[k] || {}, n = h.rows.length, sel = p.shot || k + 1;
      var loc = p.loc || R.loc || '', green = loc === 'green' || loc === 'holed' || !!p.putt, opts = [];
      for (var si = 1; si <= n + 1; si++) opts.push([si, 'Shot ' + si + (si === n + 1 ? ' (new)' : '')]);
      out += '<div class="vedit">' +
        '<label><span>Shot</span>' + vSel('shot', opts, sel) + '</label>' +
        (green ? '' : '<label><span>Club</span>' + vSel('club', [['', '–']].concat(clubChoices(p.club).map(function (c) { return [c.code, c.label]; })), p.club) + '</label>') +
        '<label><span>To pin (' + (sel === 1 ? 'yd' : green ? 'ft' : 'yd') + ')</span><input type="text" inputmode="numeric" maxlength="3" data-vf="dist" value="' + (p.dist == null ? '' : p.dist) + '"></label>' +
        (sel === 1 ? '' : '<label><span>Hitting from</span>' + vSel('loc', [['', '–'], ['fairway', 'Fairway'], ['rough', 'Rough'], ['deep', 'Deep rough'], ['bunker', 'Bunker'], ['green', 'Green'], ['hazard', 'Hazard'], ['trees', 'Trees'], ['ob', 'OB re-hit'], ['holed', 'In the hole']], p.loc) + '</label>' +
          '<label><span>Shot ' + (sel - 1) + ' missed</span>' + vSel('dir', [['', '–']].concat(SG.DIR8.map(function (d) { return [d, SG.DIR_NAME[d]]; })), p.dir) + '</label>' +
          '<label class="vchk"><input type="checkbox" data-vf="pen"' + (p.pen ? ' checked' : '') + '> Shot ' + (sel - 1) + ' penalty +1</label>' +
          (p.loc === 'holed' ? '' : '<label class="vchk"><input type="checkbox" data-vf="holeOut"' + ((p.holeOut || (p.holeOut !== false && R.holeOut)) ? ' checked' : '') + '> Hole out (shot ' + sel + ' went in)</label>')) +
        (sel === 1 && Number(h.par) !== 3 ? '<label class="vchk"><input type="checkbox" data-vf="layup"' + (p.layup ? ' checked' : '') + '> Layup</label>' : '') + '</div>';
    } else if (p.empty) out += '<p class="vwarn">I couldn’t find a club, distance or result in that. Try again, or tap Edit.</p>';
    else out += '<div class="vfields">' + fields.map(function (f) { return '<div class="vf"><span>' + esc(f[0]) + '</span><b>' + esc(f[1]) + '</b></div>'; }).join('') + '</div>';
    if (p.unknown && V.stage !== 'edit') out += '<p class="vnote">Not sure about: “' + esc(p.unknown) + '”</p>';
    (res.notes || []).forEach(function (w) { out += '<p class="vnote">' + esc(w) + '</p>'; });
    res.warn.forEach(function (w) { out += '<p class="vwarn">' + esc(w) + '</p>'; });
    var can = !res.done && res.k >= 0 && !(p.empty && V.stage !== 'edit');
    return out + '<div class="vbtns"><button class="frostmain big vsave" data-act="vsave"' + (can ? '' : ' disabled') + '>✓ Save</button>' +
      (V.stage === 'edit' ? '' : '<button class="frostbtn big" data-act="vedit">✎ Edit</button>') + '<button class="frostbtn big" data-act="vretry">↺ Retry</button></div></div>';
  }
  function voiceSave() {
    var h = round().holes[view.hole], p = view.voice.p, res = VOICE.apply(h, p);
    if (res.done || res.k < 0) { toast(res.warn[0] || 'Nothing to save'); return; }
    dictStop(); h.rows = res.rows; save(); view.voice = null; view.menu = null; view.edk = null; view.vflash = res.touched.slice(); render(); view.vflash = null;
    toast('Shot ' + (res.k + 1) + ' saved');
  }
  function dirSheetHTML(h, k) {
    var cur = SG.normDir(h.rows[k].dir), prevLie = SG.lieOf(h.rows, k - 1), prevGreen = prevLie === 'green';
    var out = '<div class="sheet-bg" data-act="dirclose"></div><div class="sheet frostsheet" role="dialog" aria-label="Pick direction">' +
      '<h3>Shot ' + k + ' ended…</h3><p class="help">' + (prevGreen ? 'Where the putt finished vs the hole.' :
        'Missed the green? Where vs the green. On the green? Where vs the hole.') + ' <b>Short = toward you.</b></p><div class="dirgrid">';
    DIR_GRID.forEach(function (rw) { rw.forEach(function (d) {
      out += '<button data-act="setdir" data-v="' + d + '" class="' + (d === cur ? 'sel' : '') + (d ? '' : ' none') + '"><span>' + (d ? ARROW[d] : '⊘') + '</span>' + (d ? SG.DIR_NAME[d] : 'None') + '</button>';
    }); });
    return out + '</div><button class="big frostbtn" data-act="dirclose">Cancel</button></div>';
  }
  function countText(h, pens) {
    var n = h.rows.length;
    return n + ' stroke' + (n === 1 ? '' : 's') + (pens ? ' + ' + pens + ' penalty' + (pens === 1 ? '' : ' strokes') + ' = ' + (n + pens) : '');
  }

  // ---------- v115: hole header + tight shot lines ----------
  function activeRow(h) { var n = h.rows.length, e = view.edk; return e && e.h === view.hole && e.k < n ? e.k : n - 1; }
  function holeCard(r, i) { // scorecard facts for this hole from the saved course: yards for the tee played, par, stroke index
    var c = r && r.courseId ? courseById(r.courseId) : null; if (!c) return {};
    var t = (c.tees || []).filter(function (x) { return x.name === r.tee; })[0] || (c.tees || [])[0];
    var y = t && t.yards && t.yards[i], si = c.hcp && c.hcp[i], p = c.pars && c.pars[i];
    return { yd: y > 0 ? +y : null, si: si > 0 ? +si : null, par: p >= 3 && p <= 6 ? +p : null };
  }
  function holeHeadHTML(r, h, fin) {
    var i = view.hole, C = holeCard(r, i), r0 = h.rows[0] || {}, yd = C.yd || (r0.loc !== 'holed' && +r0.dist > 0 ? +r0.dist : null);
    var fixed = fin || (C.par && +h.par === C.par), pe = view.parEdit === i && !fin, par;
    if (!h.par || pe) par = '<span class="parpick" id="parpick"><span class="plbl">Par</span>' + [3, 4, 5].map(function (p) {
      return '<button type="button" data-act="par" data-v="' + p + '" class="' + (+h.par === p ? 'sel' : '') + '" aria-label="Par ' + p + '">' + p + '</button>'; }).join('') + '</span>';
    else if (fixed) par = '<span class="hpar" id="hpar">Par ' + h.par + '</span>';
    else par = '<button type="button" class="hpar hparbtn" id="hpar" data-act="paredit" aria-label="Par ' + h.par + ' – tap to change">Par ' + h.par + ' <small>✎</small></button>';
    return '<div class="hc-head"><h2>Hole ' + (i + 1) + '</h2><div class="hmeta" id="hmeta">' + (yd ? '<span class="hyd" id="hyd">' + yd + ' yd</span>' : '') + par +
      (C.si ? '<span class="hsi" id="hsi">SI ' + C.si + '</span>' : '') + '</div></div>';
  }
  var END_NAME = { fairway: 'Fairway', rough: 'Rough', deep: 'Deep rough', bunker: 'Bunker', green: 'Green', hazard: 'Hazard', trees: 'Trees', tee: 'Tee' };
  function tightParts(h, a, k) {
    var rows = h.rows, row = rows[k], nx = rows[k + 1], s = a.shots[k], holed = SG.isHoled(row, k) || (k === 0 && row.loc === 'holedx');
    var lie = SG.lieOf(rows, k), putt = lie === 'green', u = SG.rowUnit(rows, k), hit = '', loc = '', arrow = '', pen = false;
    var nDist = nx && nx.loc !== 'ob' && nx.dist !== '' && nx.dist != null;
    if (holed) { hit = row.dist !== '' ? row.dist + ' ' + u : ''; loc = 'Holed'; }
    else {
      if (s && s.ob) hit = '';
      else if (putt) hit = (s || nDist) && row.dist !== '' ? row.dist + ' ft' : '';
      else if (s && s.hit != null) hit = s.hit + ' yd';
      else if (nDist && row.dist !== '') { var y = function (j) { var d = SG.distOf(rows, j); return SG.rowUnit(rows, j) === 'ft' ? d / 3 : d; }; var hy = Math.round(y(k) - y(k + 1)); hit = hy > 0 ? hy + ' yd' : ''; }
      if (nx && nx.loc) { loc = nx.loc === 'ob' ? 'OB' : nx.loc === 'holed' ? 'Green' : END_NAME[SG.lieOf(rows, k + 1)] || LOC_SHORT[nx.loc] || ''; pen = !!nx.pen || nx.loc === 'ob'; }
    }
    var club = putt ? 'Putter' : row.club ? clubShort(row.club) : '';
    // v115: every line reads "from → to" – from = this shot's own lie, to = where it finished (the next shot's lie); no miss arrow
    var from = k === 0 ? 'Tee' : END_NAME[lie] || LOC_SHORT[row.loc] || '';
    return { hit: hit, loc: loc, pen: pen, club: club, s: s, from: from };
  }
  function clubShort(code) { var c = clubChoices(code).filter(function (x) { return x.code === code; })[0]; return c ? String(c.label).split(' · ')[0] : code; }
  function tightHTML(h, a, k, fin) {
    var P = tightParts(h, a, k), s = P.s, bad = !fin && a.bad === k, n = k + 1, dash = '<i class="tdash">–</i>';
    var sg = s ? (s.layup ? '<span class="sgchip lay" title="Layup – not counted">layup</span>' : '<span class="sgchip ' + (sgCls(s.sg) || 'zero') + '">' + fmtSG(s.sg) + '</span>') : '';
    var loc = '<span class="tlw">' + (P.from ? esc(P.from) + ' <i class="tto">→</i> ' : '') + (P.loc ? esc(P.loc) : dash) + '</span>' + (P.pen ? '<i class="tpen">+1</i>' : '');
    var inner = '<span class="t-n">' + n + '</span><span class="t-h">' + (P.hit || dash) + '</span><span class="t-c">' + (P.club ? esc(P.club) : dash) + '</span><span class="t-l">' + loc + '</span><span class="t-s">' + sg + '</span>';
    var lbl = 'Shot ' + n + (P.from ? ' from the ' + P.from.toLowerCase() : '') + (P.hit ? ', hit ' + P.hit : '') + (P.club ? ', ' + P.club : '') + (P.loc ? ', ended ' + P.loc : '') + (s && !s.layup ? ', SG ' + fmtSG(s.sg) : '');
    return fin ? '<div class="tline fin" data-k="' + k + '" role="group" aria-label="' + esc(lbl) + '">' + inner + '</div>'
      : '<button type="button" class="tline' + (bad ? ' bad' : '') + '" data-act="rowedit" data-k="' + k + '" aria-label="' + esc(lbl) + ' – tap to edit">' + inner + '</button>';
  }
  function rowHTML(h, a, row, k, fin) {
    var ob = row.loc === 'ob', bad = !fin && a.bad === k, shotNo = k + 1, dis = fin ? ' disabled' : '';
    var out = '<div class="srow' + (bad ? ' bad' : '') + (view.vflash && view.vflash.indexOf(k) >= 0 ? ' vflash' : '') + '" data-k="' + k + '">';
    out += '<button class="c-n" data-act="menu" data-k="' + k + '" aria-label="Row options"' + dis + '>' + shotNo + '</button>';
    if (ob) out += '<span class="c-d obtxt">' + prevDist(h, k) + '</span>';
    else out += '<span class="c-d"><input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="3" data-row="' + k + '" value="' + esc(row.dist) + '" aria-label="Distance row ' + shotNo + '"' + dis + '>' +
      '<i class="u" data-unit="' + k + '">' + SG.rowUnit(h.rows, k) + '</i></span>';
    // v90: "In the hole (chip/shot)" is replaced by the "Hole out" box (keeps the lie); still shown on older rows that use it
    var opts = k === 0 ? LOCS0 : LOCS.filter(function (l) { return l[0] !== 'holedx' || row.loc === 'holedx'; });
    out += '<span class="c-l"><select data-f="loc" data-k="' + k + '" aria-label="Location row ' + shotNo + '"' + dis + '>' +
      (row.loc ? '' : '<option value="" selected>–</option>') +
      opts.map(function (l) { return '<option value="' + l[0] + '"' + (row.loc === l[0] ? ' selected' : '') + '>' + l[1] + '</option>'; }).join('') + '</select></span>';
    if (k === 0) out += '<span class="c-x"></span><span class="c-p"></span>';
    else {
      var dv = SG.normDir(row.dir);
      out += '<span class="c-x"><button class="dirbtn' + (dv ? ' on' : '') + '" data-act="dirpick" data-k="' + k + '" data-dir="' + dv + '" aria-label="Direction row ' + shotNo + ': ' + dirName(dv) + '"' + dis + '>' + ARROW[dv] + '</button></span>';
      out += '<span class="c-p"><button class="pen' + (row.pen || ob ? ' on' : '') + '" data-act="pen" data-k="' + k + '"' + (ob || fin ? ' disabled' : '') + ' aria-label="Penalty row ' + shotNo + '">' + (row.pen || ob ? '+1' : '') + '</button></span>';
    }
    out += '<span class="c-del">' + (k === 0 ? '' : '<button class="del" data-act="del" data-k="' + k + '" aria-label="Delete row ' + shotNo + '"' + dis + '>⌫</button>') + '</span>';
    out += '</div>';
    // v90: "Hole out" box – this stroke went in, and the row keeps its Loc (lie). v91: only offered on the LAST row
    // (never shot 1) so earlier rows stay clean; a row that is already ticked keeps its (ticked) box so it isn't hidden.
    var hoBox = k > 0 && row.loc !== 'holedx' && (k === h.rows.length - 1 || row.holeOut) ? '<label class="layup holeout' + (row.holeOut ? ' on' : '') + '"><input type="checkbox" data-f="holeout" data-k="' + k + '"' + (row.holeOut ? ' checked' : '') + dis + ' aria-label="Hole out: shot ' + shotNo + ' went in"> Hole out</label>' : '';
    if (row.loc !== 'green' && row.loc !== 'holed' && wLadderFor(row)) out += ladderRowHTML(h, k, row, shotNo, dis, hoBox);
    else if (row.loc !== 'green' && row.loc !== 'holed') {
      out += '<div class="clubrow" data-club="' + k + '"><label class="clublbl"><span>Club</span><select data-f="club" data-k="' + k + '" aria-label="Club row ' + shotNo + '"' + dis + '><option value=""' + (row.club ? '' : ' selected') + '>–</option>' +
        clubChoices(row.club).map(function (c) { return '<option value="' + esc(c.code) + '"' + (row.club === c.code ? ' selected' : '') + '>' + esc(c.label) + '</option>'; }).join('') + '</select></label>' +
        (k === 0 && Number(h.par) !== 3 ? '<label class="layup"><input type="checkbox" data-f="layup" data-k="0"' + (row.layup ? ' checked' : '') + dis + '> Layup <small>(not in SG)</small></label>' : '') + hoBox + '</div>';
    } else if (row.loc === 'green') out += '<div class="clubrow putter" data-club="' + k + '"><small>Putter</small>' + hoBox + '</div>';
    out += '<div class="sinfo" data-info="' + k + '">' + infoHTML(a.shots[k]) + '</div>'; // (only the shot being entered has this line now)
    if (view.menu === k && !fin) {
      out += '<div class="rowmenu">' + (k > 0 ? '<button data-act="insBefore" data-k="' + k + '">Insert shot above</button>' : '') +
        '<button data-act="insAfter" data-k="' + k + '">Insert shot below</button><button data-act="menu" data-k="' + k + '">Close</button></div>';
    }
    return out;
  }
  function infoHTML(s) {
    if (!s) return '';
    var info = s.end.lie === 'holed' ? ' · in the hole!' : s.ob ? ' · went OB' : (s.start.lie === 'green' ? ' · missed' : ' · hit ' + s.hit + ' yd');
    if (s.dir && s.end.lie !== 'holed') info += ' ' + SG.DIR_NAME[s.dir].toLowerCase() + (s.cat === 'approach' && s.end.lie !== 'green' ? ' (missed green)' : '');
    if (s.layup) return CAT_NAME[s.cat] + info + ' · <b>layup – SG not counted</b> <small>(would be ' + fmtSG(s.sgRaw) + ')</small>';
    return CAT_NAME[s.cat] + info + ' · SG <b class="' + sgCls(s.sg) + '">' + fmtSG(s.sg) + '</b>';
  }
  function prevDist(h, k) {
    var d = SG.distOf(h.rows, k);
    return (d == null ? '?' : d) + ' ' + SG.rowUnit(h.rows, k);
  }
  function hintText(h, a) {
    if (!h.par) return 'Pick the par.';
    if (a.complete) return 'All set – tap Finish hole.';
    var n = a.bad != null ? a.bad + 1 : h.rows.length, row = h.rows[n - 1] || {};
    var holed = SG.isHoled(row, n - 1);
    switch (a.problem) {
      case 'dist': return n === 1 ? 'Missing: hole length in row 1.' : 'Missing: distance in row ' + n + (holed ? ' (how far was the putt/shot that went in?)' : '') + '.';
      case 'loc': return 'Missing: location in row ' + n + '.';
      case 'after': return 'Shot ' + (n - 1) + ' went in – delete the rows after it.';
      case 'last': return 'Not finished: tap Add Shot for the next shot, or tick “Hole out” on the shot that went in.';
    }
    return '';
  }

  // v103 Scorecard: ONE card that scrolls sideways (holes 1-18, then OUT / IN / TOT), sticky row labels on the left.
  // Marks: birdie = circle, eagle or better = double circle, bogey = square, double bogey or worse = double square, par = plain.
  function scoreMark(score, par) {
    var d = score - par; return d <= -2 ? 'eagle' : d === -1 ? 'birdie' : d === 0 ? 'par' : d === 1 ? 'bogey' : 'double';
  }
  var SC_YES = '<svg class="scic yes" viewBox="0 0 16 16" aria-label="yes"><circle cx="8" cy="8" r="6.6"/><path d="M5 8.3l2 2 4-4.3"/></svg>';
  var SC_NO = '<svg class="scic no" viewBox="0 0 16 16" aria-label="no"><circle cx="8" cy="8" r="6.6"/><path d="M3.4 12.6l9.2-9.2"/></svg>';
  // Club on the tee, short: Driver -> DR, 7i -> 7I, 3W, PW, 56 ...
  function scClub(c) { c = String(c || '').trim(); if (!c) return ''; return /^driver$/i.test(c) ? 'DR' : c.toUpperCase().slice(0, 4); }
  function scFt(v) { return v == null ? '' : String(Math.round(v * 10) / 10); }
  // Everything the scorecard shows for one finished hole (null = not finished yet -> blank column).
  function scHole(h, a) {
    if (!a || !a.done) return null;
    var par = Number(h.par) || 0, sh = a.shots, cat = { tee: null, approach: null, short: null, putting: null };
    sh.forEach(function (x) { cat[x.cat] = (cat[x.cat] || 0) + x.sg; });
    var putts = sh.filter(function (x) { return x.start.lie === 'green'; }), t0 = sh[0];
    var lastP = putts.length && putts[putts.length - 1].end.lie === 'holed' ? putts[putts.length - 1] : null;
    // up and down: missed the green in regulation, then a short-game shot (off the green, within 30 yd) – made if holed in 2 or fewer from there
    var k = -1; if (!a.gir) for (var j = 0; j < sh.length; j++) if (sh[j].cat === 'short') { k = j; break; }
    var ud = null, sandy = null;
    if (k >= 0) {
      var left = sh.slice(k).reduce(function (t, x) { return t + 1 + x.penStrokes; }, 0);
      ud = left <= 2; if (sh[k].start.lie === 'sand') sandy = ud;
    }
    // recovery: a shot (not the last) finished in trouble – trees, a hazard / penalty area, a penalty or OB – made if you still scored par or better
    var trouble = sh.some(function (x, i) { return i < sh.length - 1 && (x.penStrokes > 0 || x.ob || x.end.lie === 'recovery' || x.end.lie === 'hazard'); });
    return {
      strokes: a.strokes, mark: scoreMark(a.strokes, par), sg: a.sg, cat: cat, putts: a.putts, gir: a.gir,
      club: t0 ? scClub(t0.club) : '', fir: par >= 4 ? a.fairway : null,
      drive: par >= 4 && t0 && !t0.ob && !t0.penStrokes && t0.hit != null && t0.hit > 0 ? t0.hit : null,
      p1: putts.length ? putts[0].start.dist : null, pl: lastP ? lastP.start.dist : null,
      ud: ud, sandy: sandy, rec: trouble ? a.strokes <= par : null
    };
  }
  // v109: the scorecard numbers come from ONE function (scorecardData). The screen card (scorecardHTML) and the PDF scorecard page both draw from it.
  // Each cell: { t: plain text, k: kind ('n' number/text, 'mark' score with shape, 'sg' strokes gained, 'yn' yes/no, 'dash' not a par 4/5, '' blank), ... }
  function scorecardData(r, S) {
    var n = r.holes.length, idx = r.holes.map(function (h, i) { return i; });
    var H = idx.map(function (i) { return scHole(r.holes[i], S.holes[i]); });
    var groups = [['OUT', 'out', idx.filter(function (i) { return i < 9; })]];
    if (n > 9) groups.push(['IN', 'in', idx.filter(function (i) { return i >= 9; })]);
    groups.push(['TOT', 'tot', idx]);
    var sum = function (a) { return a.reduce(function (t, x) { return t + x; }, 0); };
    var N = function (v) { return v === '' || v == null ? { t: '', k: '' } : { t: String(v), k: 'n' }; };
    var YN = function (v) { return v === true ? { t: 'Y', k: 'yn', b: true } : v === false ? { t: 'N', k: 'yn', b: false } : { t: '', k: '' }; };
    var frac = function (L, f) { var k = L.filter(function (x) { return f(x) != null; }); return N(k.length ? k.filter(function (x) { return f(x); }).length + '/' + k.length : ''); };
    var avg = function (L, f) { var v = L.map(f).filter(function (x) { return x != null; }); return v.length ? String(Math.round(sum(v) / v.length * 10) / 10) : ''; };
    var rows = [], gname = '', R = function (lbl, cls, f, t) {
      rows.push({ lbl: lbl, cls: cls, grp: gname, cells: idx.map(function (i) { return f(i, H[i]); }),
        sums: groups.map(function (g) { return t(g[2].map(function (i) { return H[i]; }).filter(Boolean), g[2], g); }) });
    };
    gname = 'score';
    R('Hole', 'shole', function (i) { return N(i + 1); }, function (L, I, g) { return N(g[0]); });
    R('Par', 'spar', function (i) { return N(Number(r.holes[i].par) || ''); }, function (L, I) { return N(sum(I.map(function (i) { return Number(r.holes[i].par) || 0; }))); });
    R('Length', 'syds', function (i) { return N(SG.holeYards(r.holes[i]) || ''); }, function (L, I) { return N(sum(I.map(function (i) { return SG.holeYards(r.holes[i]) || 0; })) || ''); });
    R('Score', 'sscore', function (i, d) { return d ? { t: String(d.strokes), k: 'mark', mark: d.mark } : { t: '', k: '', blank: true }; },
      function (L) { return N(L.length ? sum(L.map(function (d) { return d.strokes; })) : ''); });
    gname = 'sg';
    var sgRow = function (lbl, cls, get) {
      R(lbl, 'ssg ' + cls, function (i, d) { var v = d ? get(d) : null; return v == null ? N('') : { t: fmtSG(v), k: 'sg', v: v }; },
        function (L) { var v = L.map(get).filter(function (x) { return x != null; }); if (!v.length) return N(''); var s = sum(v); return { t: fmtSG(s), k: 'sg', v: s, big: true }; });
    };
    sgRow('Tot', 'sgtot', function (d) { return d.sg; }); sgRow('OTT', 'sgott', function (d) { return d.cat.tee; });
    sgRow('APP', 'sgapp', function (d) { return d.cat.approach; }); sgRow('ARG', 'sgarg', function (d) { return d.cat.short; });
    sgRow('Putt', 'sgputt', function (d) { return d.cat.putting; });
    gname = 'stats';
    R('Putts', 'sputts', function (i, d) { return N(d ? d.putts : ''); }, function (L) { return N(L.length ? sum(L.map(function (d) { return d.putts; })) : ''); });
    R('GIR', 'sgir', function (i, d) { return d ? YN(d.gir) : N(''); }, function (L) { return frac(L, function (d) { return d.gir; }); });
    R('Club', 'sclub', function (i, d) { return d && d.club ? { t: d.club, k: 'n', txt: true } : N(''); }, function () { return N(''); });
    R('FIR', 'sfir', function (i, d) { return d ? (d.fir == null ? { t: '–', k: 'dash' } : YN(d.fir)) : N(''); }, function (L) { return frac(L, function (d) { return d.fir; }); });
    R('Drive dist', 'sdrive', function (i, d) { return N(d && d.drive != null ? d.drive : ''); }, function (L) { var v = avg(L, function (d) { return d.drive; }); return N(v === '' ? '' : Math.round(+v)); });
    R('1st putt', 'sp1', function (i, d) { return N(d ? scFt(d.p1) : ''); }, function (L) { return N(avg(L, function (d) { return d.p1; })); });
    R('Last putt', 'spl', function (i, d) { return N(d ? scFt(d.pl) : ''); }, function (L) { return N(avg(L, function (d) { return d.pl; })); });
    R('Up & down', 'sud', function (i, d) { return d ? YN(d.ud) : N(''); }, function (L) { return frac(L, function (d) { return d.ud; }); });
    R('Sandies', 'ssand', function (i, d) { return d ? YN(d.sandy) : N(''); }, function (L) { return frac(L, function (d) { return d.sandy; }); });
    R('Recovery', 'srec', function (i, d) { return d ? YN(d.rec) : N(''); }, function (L) { return frac(L, function (d) { return d.rec; }); });
    return { n: n, idx: idx, groups: groups, rows: rows };
  }
  // the plain-text grid (row label, 18 holes, OUT / IN / TOT) – what both the screen and the PDF show
  function scorecardGrid(D) { return D.rows.map(function (row) { return [row.lbl].concat(row.cells.map(function (c) { return c.t; }), row.sums.map(function (c) { return c.t; })); }); }
  function scorecardHTML(r, S) {
    var D = scorecardData(r, S), n = D.n, idx = D.idx, groups = D.groups;
    var tint = function (v, big) {
      if (v == null || Math.abs(v) < 0.005) return '';
      var al = (0.1 + 0.45 * Math.min(Math.abs(v) / (big ? 4 : 1.5), 1)).toFixed(2);
      return ' style="background:rgba(' + (v > 0 ? '52,160,90,' : '214,80,70,') + al + ')"';
    };
    var inner = function (c) {
      return c.k === 'mark' ? '<span class="mk mk-' + c.mark + '" data-mark="' + c.mark + '">' + c.t + '</span>' : c.k === 'yn' ? (c.b ? SC_YES : SC_NO) :
        c.k === 'dash' ? '<span class="scdash">–</span>' : esc(c.t);
    };
    var cell = function (i, c, row) {
      var cls = (row.cls === 'sscore' ? (c.k === 'mark' ? 'done' : 'blank') : '') + (i === 8 || i === n - 1 ? ' g9' : '');
      return '<td class="' + cls + '"' + (c.k === 'sg' ? tint(c.v) : '') + '><button class="hc" data-act="goHole" data-i="' + i + '" aria-label="Hole ' + (i + 1) + '">' + inner(c) + '</button></td>';
    };
    var t = '<table class="scard sc1" id="scorecard"><tbody>', gname = '';
    D.rows.forEach(function (row) {
      if (row.grp !== gname) { if (gname) t += '<tr class="scgap" aria-hidden="true"><th></th><td colspan="' + (n + groups.length) + '"></td></tr>'; gname = row.grp; }
      t += '<tr class="' + row.cls + ' g-' + gname + '"><th scope="row">' + row.lbl + '</th>';
      idx.forEach(function (i) { t += cell(i, row.cells[i], row); });
      groups.forEach(function (g, k) { var c = row.sums[k]; t += '<td class="sum ' + g[1] + '"' + (c.k === 'sg' ? tint(c.v, true) : '') + '>' + inner(c) + '</td>'; });
      t += '</tr>';
    });
    t += '</tbody></table>';
    return '<div class="label sclabel">Scorecard <span>· tap a hole to edit · swipe for more</span></div>' +
      '<div class="sc1card" id="sccard"><div class="scscroll" id="scscroll">' + t + '</div></div>' +
      '<div class="legend sclegend" id="card-legend"><span><span class="mk mk-eagle"></span>Eagle or better</span><span><span class="mk mk-birdie"></span>Birdie</span><span><span class="mk mk-par lgpar">–</span>Par (no mark)</span>' +
      '<span><span class="mk mk-bogey"></span>Bogey</span><span><span class="mk mk-double"></span>Double bogey or worse</span></div>';
  }
  // v96 Round stats top box: Score · To par · Yards · Putts (was the big score + the TOTAL row under the scorecard)
  function rsTopHTML(r, S) {
    var sum = function (a) { return a.reduce(function (x, y) { return x + y; }, 0); };
    var done = r.holes.map(function (h, i) { return i; }).filter(function (i) { return S.holes[i].done; });
    var tYds = sum(r.holes.map(function (h) { return SG.holeYards(h) || 0; }));
    var tScore = sum(done.map(function (i) { return S.holes[i].strokes; })), tPutts = sum(done.map(function (i) { return S.holes[i].putts; }));
    var parDone = sum(done.map(function (i) { return Number(r.holes[i].par) || 0; })), n = done.length, all = n && n === r.holes.length;
    return '<table class="rstop" id="rs-top"><tr><th>Score</th><th>To par</th><th>Yards</th><th>Putts</th></tr>' +
      '<tr><td class="big" id="rs-score">' + (n ? tScore : '–') + (n && !all ? '<small id="rs-thru">thru ' + n + '</small>' : '') + '</td><td class="big" id="rs-topar">' + (n ? toPar(tScore - parDone) : '–') +
      '</td><td id="rs-yds">' + (tYds || '–') + '</td><td id="rs-putts">' + (n ? tPutts : '–') + '</td></tr></table>';
  }
  // ---------- v140 Round takeaway (insights.js) ----------
  // The golfer's other finished rounds played before this one, newest first: what was known about their game then.
  function takeawayHistory(r) {
    var who = r.player || playerName(), when = String(r.date || '');
    return savedRounds().filter(function (x) { return x.id !== r.id && samePlayer(x.player || playerName(), who) && String(x.date || '') <= when; })
      .sort(function (a, b) { return String(b.date || '').localeCompare(String(a.date || '')); });
  }
  function tkPic(p) {
    if (!p) return '';
    var svg = function (body, label) { return '<svg class="tkpic" viewBox="0 0 140 70" role="img" aria-label="' + esc(label) + '">' + body + '</svg>'; };
    var dots = function (n, cx, cy, col) { var o = ''; for (var i = 0; i < Math.min(n, 8); i++) o += '<circle cx="' + (cx + (i % 4 - 1.5) * 9) + '" cy="' + (cy + Math.floor(i / 4) * 9) + '" r="3.6" fill="' + col + '"/>'; return o; };
    if (p.kind === 'tee') return svg('<rect x="48" y="6" width="44" height="52" rx="20" fill="rgba(31,157,85,.16)"/>' +
      '<text x="70" y="39" class="tkn" fill="#1f7a44">' + p.fw + '</text><text x="22" y="39" class="tkn" fill="' + (p.left > p.right ? '#c0442f' : '#3f5a48') + '">' + p.left + '</text>' +
      '<text x="118" y="39" class="tkn" fill="' + (p.right > p.left ? '#c0442f' : '#3f5a48') + '">' + p.right + '</text><text x="70" y="68" class="tkl">left · fairway · right</text>',
      'Tee shots: ' + p.left + ' left, ' + p.fw + ' fairway, ' + p.right + ' right');
    if (p.kind === 'approach') return svg('<ellipse cx="70" cy="30" rx="26" ry="15" fill="rgba(31,157,85,.16)"/><text x="70" y="35" class="tkn tks" fill="#1f7a44">' + p.gir + '/' + p.of + '</text>' +
      '<text x="70" y="9" class="tkm">' + p.long + ' long</text><text x="70" y="57" class="tkm">' + p.short + ' short</text><text x="21" y="34" class="tkm">' + p.left + ' left</text><text x="119" y="34" class="tkm">' + p.right + ' right</text>' +
      '<text x="70" y="69" class="tkl">greens hit · misses</text>', 'Greens ' + p.gir + ' of ' + p.of + '; misses ' + p.short + ' short, ' + p.long + ' long, ' + p.left + ' left, ' + p.right + ' right');
    if (p.kind === 'bars') { var mx = Math.max(p.yours, p.par, 1), w = function (v) { return Math.max(4, Math.round(84 * v / mx)); };
      return svg('<text x="0" y="20" class="tkm tkla">You</text><rect x="38" y="11" width="' + w(p.yours) + '" height="12" rx="6" fill="' + (p.yours > p.par + 3 ? '#e2705c' : '#2f9a5c') + '"/>' +
        '<text x="0" y="46" class="tkm tkla">Avg</text><rect x="38" y="37" width="' + w(p.par) + '" height="12" rx="6" fill="#8fbf9f"/>' +
        '<text x="' + (42 + w(p.yours)) + '" y="21" class="tkm tkla">' + Math.round(p.yours) + ' ft</text><text x="' + (42 + w(p.par)) + '" y="47" class="tkm tkla">' + Math.round(p.par) + ' ft</text>' +
        '<text x="70" y="68" class="tkl">left from the hole</text>', 'Chips left ' + Math.round(p.yours) + ' ft on average, ' + p.label + ' ' + Math.round(p.par) + ' ft'); }
    if (p.kind === 'putts') return svg('<circle cx="70" cy="26" r="4" fill="#17301f"/><line x1="70" y1="26" x2="70" y2="2" stroke="rgba(23,48,31,.25)" stroke-dasharray="3 3"/>' +
      dots(p.long, 70, 10, '#c8962e') + dots(p.short, 70, 40, '#e2705c') + '<text x="70" y="68" class="tkl">' + p.short + ' short · ' + p.long + ' long</text>', 'Missed putts: ' + p.short + ' short, ' + p.long + ' long');
    if (p.kind === 'counts') return svg('<text x="40" y="36" class="tkn" fill="#1f7a44">' + p.one + '</text><text x="100" y="36" class="tkn" fill="' + (p.three ? '#c0442f' : '#3f5a48') + '">' + p.three + '</text>' +
      '<text x="40" y="56" class="tkl">1-putts</text><text x="100" y="56" class="tkl">3-putts</text>', p.one + ' one-putts, ' + p.three + ' three-putts');
    return '';
  }
  function takeawayHTML(r) {
    var T; try { T = INSIGHTS.build(r, takeawayHistory(r), SG, { baselineName: SG.baseline(blOf(r)).name }); } catch (e) { return ''; }
    var P = T.progress, open = !!view.tkKnow;
    var bars = INSIGHTS.AREAS.map(function (a) { var p = P[a.k];
      return '<span class="tkb' + (p.ready ? ' ready' : '') + '" data-area="' + a.k + '"><em>' + a.short + '</em><i><u style="width:' + Math.round(p.frac * 100) + '%"></u></i></span>'; }).join('');
    var rows = open ? '<div class="tkrows" id="tkrows">' + INSIGHTS.AREAS.map(function (a) { var p = P[a.k];
      return '<div><span>' + a.name + '</span><b' + (p.ready ? ' class="ok"' : '') + '>' + (p.ready ? 'Ready ✓' : p.n + ' of ' + p.need + ' ' + p.unit + (p.roundsLeft ? ' · about ' + p.roundsLeft + ' more round' + (p.roundsLeft === 1 ? '' : 's') : '')) + '</b></div>'; }).join('') +
      '<p>Suggestions compare each area with <b>your</b> normal once it has enough shots from your rounds (last ' + INSIGHTS.NORM_ROUNDS + '). Until then they compare with the ' + esc(T.baselineName || SG.baseline(blOf(r)).name) + ' average.</p></div>' : '';
    var out = '<section class="takeaway" id="takeaway"><button class="tkstrip frost" id="tkstrip" data-act="tkknow" aria-expanded="' + open + '">' +
      '<span class="tkst-h"><span>How well Strokewise knows your game</span><b id="tkready">' + P.readyCount + '/4 ready</b></span><span class="tkbars">' + bars + '</span></button>' + rows;
    if (!T.ok) return out + '<p class="tknote frost">' + esc(T.reason) + '</p></section>';
    out += '<div class="tkhead frost"><span class="tkeye">Round takeaway</span><h3 id="tkheadline">' + esc(T.headline) + '</h3>' + (T.lede ? '<p id="tklede">' + esc(T.lede) + '</p>' : '') + '</div>';
    var F = T.focus;
    if (F) out += '<div class="tkfocus" id="tkfocus"><span class="tktag">Work on next</span><h3>' + esc(F.title) + '</h3><p>' + esc(F.text) + '</p>' +
      '<p class="tkbasis' + (F.basis.mine ? ' mine' : '') + '" id="tkbasis">' + (F.basis.mine ? '✓ ' : '') + esc(F.basis.text) + '</p>' +
      '<p class="tkdrill"><b>Try:</b> ' + esc(F.drill) + '</p>' + (function () { var x = MYGAME.drillFocus(F); // v143 Log this drill → practice log, filled in
        return x ? '<button class="prdrill" id="prdrill" data-act="prdrill" data-v="' + esc(x.spoke + '|' + x.focus) + '" data-who="' + esc(r.player || playerName()) + '">⏱ Log this drill · ' + esc(x.focus) + '</button>' : ''; })() + '</div>';
    out += '<div class="tktiles" id="tktiles">' + T.tiles.map(function (t) {
      return '<div class="tktile frost" data-area="' + t.k + '"><span class="tkth">' + esc(t.name) + '</span><span class="tksg ' + sgCls(t.sg) + '">' + fmtSG(t.sg) + ' SG</span>' +
        (t.norm != null ? '<small class="tkusual">usually ' + fmtSG(t.norm) + '</small>' : '') + tkPic(t.pic) + '<p>' + esc(t.text) + '</p></div>'; }).join('') + '</div>';
    if (T.good.length) out += '<p class="tkgood frost" id="tkgood"><b>Went well:</b> ' + esc(T.good.join(', ')) + '.</p>';
    return out + '</section>';
  }
  // v96 Quick view: Fairways / GIR / Putts with the strokes gained of their category (Off the tee / Approach / Putting)
  function quickViewHTML(S) {
    var pct = function (a, b) { return b ? Math.round(a / b * 100) + '%' : '–'; };
    var q = function (id, lbl, val, sub, cat) { var c = S.cats[cat];
      return '<div class="qv" data-q="' + id + '"><span class="qvl">' + lbl + '</span><b>' + val + '</b><small>' + sub + '</small>' +
        '<em class="qvsg ' + (c.n ? sgCls(c.sg) : '') + '" title="Strokes gained – ' + CAT_NAME[cat] + '">' + (c.n ? fmtSG(c.sg) : '–') + ' <i>SG</i></em></div>'; };
    return '<div class="label qvhead">Quick view</div><div class="quickview" id="quickview">' +
      q('fw', 'Fairways', pct(S.fwHit, S.fwTotal), S.fwHit + ' / ' + S.fwTotal + ' hit', 'tee') +
      q('gir', 'GIR', pct(S.gir, S.girHoles), S.gir + ' / ' + S.girHoles + ' greens', 'approach') +
      q('putts', 'Putts', S.holesDone ? S.putts : '–', S.holesDone ? (S.putts / S.holesDone).toFixed(1) + ' per hole' : 'no holes yet', 'putting') + '</div>';
  }
  // v96 detailed stat tiles: one collapsible row each (collapsed by default; the headline number stays in the header)
  function stx(id, label, val, body) {
    var open = !!(view.stx && view.stx[id]);
    return '<div class="stx' + (open ? ' open' : '') + '" data-stx="' + id + '"><button class="stxh" data-act="stx" data-v="' + id + '" aria-expanded="' + open + '"><span>' + label + '</span><b>' + val + '</b><i class="stxc" aria-hidden="true"></i></button>' +
      (open ? '<div class="stxb">' + body + '</div>' : '') + '</div>';
  }
  // v111: the putt rows drop "made" / "inside 3 ft" so the row fits on one line at 390px – the opened tile still says it ("4/7 made", "82% inside 3 ft")
  function stxPct(n, d) { return d > 0 ? '<em class="stxp"> (' + Math.round(100 * n / d) + '%)</em>' : ''; } // v111: whole percent next to a fraction (no percent when nothing to count); v112: in brackets, same colour as the number
  function statTilesHTML(S) {
    var PM = SG.pmissList(S.puttList), PMk = PM.filter(function (p) { return p.made; }).length, LG = SG.lagStats(S.puttList);
    var PX = SG.proxStats(S.proxList.filter(function (m) { return SG.inBucket('all', m.from); })), nc = {}; clubShots(false).forEach(function (x) { nc[x.club] = 1; }); nc = Object.keys(nc).length;
    var note = function (t) { return '<p class="stxn">' + t + '</p>'; };
    return '<div class="stat-grid stxlist" id="stattiles">' +
      stx('fw', 'Fairways hit', S.fwHit + ' / ' + S.fwTotal + stxPct(S.fwHit, S.fwTotal), tile('fw', 'Fairways hit – tap for map', S.fwHit + ' / ' + S.fwTotal)) +
      stx('gir', 'Greens in regulation', S.gir + ' / ' + S.girHoles + stxPct(S.gir, S.girHoles), tile('gir', 'Greens in reg. – tap for map', S.gir + ' / ' + S.girHoles)) +
      stx('miss', 'Approach misses', S.apprMiss.length, tile('miss', 'Approach misses (missed green) – tap for map', S.apprMiss.length, missMini(S.apprMiss))) +
      stx('prox', 'Proximity', PX.n ? fmtFt(PX.avgAllFt) : '–', proxTile(S)) +
      stx('pin', 'Pin location', S.pinHoles.length + ' / ' + S.holesDone, tile('pin', 'Pin location – tap for map', S.pinHoles.length + ' / ' + S.holesDone, '<small class="mini">holes with a pin set</small>')) +
      stx('putt', 'Putts', S.putts, puttTile(S)) +
      stx('pmiss', '1st putts made inside 10 ft', PM.length ? PMk + '/' + PM.length + stxPct(PMk, PM.length) : '–', pmissTile(S)) +
      stx('lag', 'Lag putts (&gt;10 ft)', LG.attempts ? LG.inside + '/' + LG.attempts + stxPct(LG.inside, LG.attempts) : '–', lagTile(LG)) +
      stx('club', 'Club performance', nc ? nc + (nc === 1 ? ' club' : ' clubs') : '–', clubTile()) +
      stx('pen', 'Penalty strokes', S.penalties, stat('Penalty strokes', S.penalties) + note('Penalty strokes added this round (OB, water, unplayable…).')) +
      stx('teelr', 'Tee misses L / R', S.teeLeft + ' / ' + S.teeRight, stat('Tee misses L / R', S.teeLeft + ' / ' + S.teeRight) + note('Par-4 and par-5 tee shots that missed the fairway left / right.')) + '</div>'; // v106: Missed greens L / R and short / long rows removed (data still kept: S.apprLeft/Right/Short/Over)
  }
  function summaryHTML() {
    var r = round(), bl = blOf(r), S = SG.summarize(r, bl);
    var out = '<div class="topbar frost">' + (view.from === 'history' ? '<button class="txt frostbtn" data-act="history">‹ Rounds</button>' : '<button class="txt frostbtn" data-act="backHole">‹ Round</button>') + '<div class="title"><b>Round stats</b><span>' +
      new Date(r.date).toLocaleDateString() + (r.course ? ' · ' + esc(r.course) : '') + '</span></div><button class="txt frostbtn" data-act="home">Home</button></div>';
    if (view.stxRound !== r.id) { view.stx = {}; view.stxRound = r.id; } // tiles start collapsed for each round
    out += rsTopHTML(r, S) + takeawayHTML(r) + quickViewHTML(S);
    out += scorecardHTML(r, S) + '<button class="big rpbtn" data-act="replay" data-v="0" id="sumreplay">▶ Hole replay (hole by hole)</button>' +
      (S.holesDone ? '<button class="big rpbtn bzbtn" data-act="bzopen" data-v="round" id="sumbz">🎯 Scoring chances</button>' : '');
    var B = SG.baseline(bl), main = out; out = '';
    out += '<h2>Strokes gained: <span class="' + sgCls(S.sgTotal) + '" id="sgtotal">' + fmtSG(S.sgTotal) + '</span></h2>' +
      '<div class="blbox"><label class="lbl" for="sumbl">Baseline – compared with</label>' + blSelect('sumbl', bl) +
      '<p class="help muted" id="blnote">Average player in: ' + esc(B.name) +
      (B.status === 'estimated' ? ' – <b>estimated</b> baseline (no published table; see About the numbers)' : ' – published PGA Tour data (Broadie)') +
      '. Plus = better, minus = strokes lost. Changing this recalculates the whole round and is saved with it.</p></div>';
    out += '<table><tr><th>Category</th><th class="num">Shots</th><th class="num">SG</th></tr>';
    ['tee', 'approach', 'short', 'putting'].forEach(function (k) {
      var c = S.cats[k];
      out += '<tr><td>' + CAT_NAME[k] + '</td><td class="num">' + c.n + '</td><td class="num ' + sgCls(c.sg) + '">' + fmtSG(c.sg) + '</td></tr>';
    });
    out += '</table>' + compareHTML(r, bl) + '<h3>By distance</h3><table id="bydist"><tr><th>From</th><th class="num">Shots</th><th class="num">SG</th><th class="num">Avg to pin after</th></tr>';
    var groups = [['Approach', SG.APPR_BUCKETS.map(function (b) { return b.id; })], ['Short game', [SG.SHORT_BUCKET]], ['Putting', ['0-5 ft', '5-15 ft', '15-30 ft', '30+ ft']]], pex = 0;
    groups.forEach(function (g) {
      out += '<tr><td colspan="4" style="background:#eee"><b>' + g[0] + '</b></td></tr>';
      g[1].forEach(function (b) {
        var c = S.buckets[b], ap = g[0] === 'Approach'; if (ap) pex += c.proxEx;
        out += '<tr data-bucket="' + b + '"><td>' + b + '</td><td class="num">' + c.n + '</td><td class="num ' + sgCls(c.sg) + '">' + (c.n ? fmtSG(c.sg) : '–') + '</td><td class="num">' +
          (ap ? (c.proxN ? Math.round(c.proxFt) + ' ft' : '–') : '') + '</td></tr>';
      });
    });
    out += '</table><p class="help muted" id="bydistnote">Approach = every shot from more than 30 yd off the green, par-3 tee shots included (par-4/5 tee shots are Off the tee). ' +
      'Short game = off the green from 30 yd and in. Ranges include the lower number (60–100 = 60 to under 100 yd); 30–60 = over 30 up to under 60 yd. ' +
      'Avg to pin after = how far from the hole the ball finished: feet on the green, yards × 3 off it, 0 if holed' +
      (pex ? '; <b>' + pex + '</b> approach shot' + (pex === 1 ? '' : 's') + ' with a penalty or OB left out of that average' : '; shots with a penalty or OB are left out of it') + '.</p>';
    var sgPart = out; out = main + '<h2>Stats</h2>' + statTilesHTML(S);
    out += (S.holesDone ? '<button class="primary big storybtn" data-act="story" id="storybtn" style="margin-top:16px">📸 Share to Instagram / TikTok<small>a one-page story picture of this round</small></button>' + storyHTML() : '');
    out += '<button class="primary big" data-act="pdf" style="margin-top:16px">📄 Make PDF report</button>' + pdfHTML();
    out += '<button class="big" data-act="csv">Export this round (CSV)</button>';
    out += '<button class="big sendbtn" data-act="sendopen" id="sendround">📤 Send round<small>to another phone – it lands in their Rounds</small></button>';
    out += '<button class="big sendbtn" data-act="mvone" id="chgplayer1">👤 Change player<small>' + (r.player || playerName() ? 'now ' + esc(r.player || playerName()) : 'whose round is this?') + '</small></button>';
    out += '<button class="big" data-act="backHole">Back to the round</button>';
    out += '<button class="big danger" data-act="delRound">Delete this round</button>';
    out += '<button class="big" data-act="about">ⓘ About the numbers</button>';
    out += '<div class="sgsec' + (view.sgOpen ? ' open' : '') + '" id="sgsec"><button class="sghead" data-act="sgtoggle" aria-expanded="' + !!view.sgOpen + '" aria-controls="sgbody">' +
      '<span>Strokes gained <span class="' + sgCls(S.sgTotal) + '" id="sghtotal">' + fmtSG(S.sgTotal) + '</span> <small>vs ' + esc(B.name) + '</small></span><span class="chev" aria-hidden="true">' + (view.sgOpen ? '▲' : '▼') + '</span></button>' +
      (view.sgOpen ? '<div id="sgbody">' + sgPart.replace('<h2>Strokes gained:', '<h2 class="sgsub">Total:') : '');
    out += '<p class="help muted">How it works: each shot is compared with how many strokes the chosen group averages to hole out from the same distance and lie. ' +
      'A shot that leaves you better off than average gains strokes. Penalties count against the shot that caused them.</p>';
    if (!view.sgOpen) out = out.replace(/<p class="help muted">How it works:[\s\S]*$/, '');
    out += (view.sgOpen ? '</div>' : '') + '</div>';
    return out;
  }
  function compareHTML(r, bl) {
    var cats = ['tee', 'approach', 'short', 'putting'];
    var out = '<h3>Same round vs every baseline</h3><p class="help muted">Strokes gained by category. Tap a row to use it.</p>' +
      '<table class="cmp" id="cmp"><tr><th>Baseline</th><th class="num">Tee</th><th class="num">App</th><th class="num">Short</th><th class="num">Putt</th><th class="num">Total</th></tr>';
    SG.BASELINES.forEach(function (b) {
      var S = SG.summarize(r, b.id);
      out += '<tr data-act="setbl" data-v="' + b.id + '" class="' + (b.id === bl ? 'cur' : '') + '"><td>' + esc(b.name) + (b.status === 'estimated' ? '<sup>est</sup>' : '') + '</td>' +
        cats.map(function (c) { return '<td class="num ' + sgCls(S.cats[c].sg) + '">' + fmtSG(S.cats[c].sg) + '</td>'; }).join('') +
        '<td class="num ' + sgCls(S.sgTotal) + '"><b>' + fmtSG(S.sgTotal) + '</b></td></tr>';
    });
    return out + '</table><p class="help muted"><sup>est</sup> = estimated baseline, see About the numbers.</p>';
  }
  function aboutHTML() {
    var L = function (u, t) { return '<a href="' + u + '" target="_blank" rel="noopener">' + esc(t || u) + '</a>'; };
    var gaps = SG.BASELINES.map(function (b) {
      return '<tr><td>' + esc(b.name) + '</td><td>' + (b.status === 'sourced' ? 'Published' : '<b>Estimated</b>') + '</td><td class="num">' +
        (b.id === 'pga' ? '0' : '−' + b.gap.toFixed(1)) + '</td></tr>'; }).join('');
    return '<div class="topbar"><button class="txt" data-act="aboutBack">‹ Back</button><div class="title"><b>About the numbers</b><span>Where the baselines come from</span></div><span></span></div>' +
      '<div class="about">' +
      '<p>Strokes gained compares each shot with how many strokes an average player in the chosen group needs to hole out from the same spot. ' +
      'A shot\'s value = expected strokes before − expected strokes after − 1 (and −1 more for a penalty).</p>' +
      '<p><b>Layup tee shots:</b> a tee shot marked “Layup” is left out of strokes gained entirely – it adds 0 to Off the tee and to the total, and is not counted as a tee shot. The stroke still counts in your score, and the next shot is rated as usual from where the layup finished.</p>' +
      '<h2>PGA Tour – published</h2>' +
      '<p>Off the green (tee, fairway, rough, sand, recovery, 10–600 yd): Mark Broadie, “Assessing Golfer Performance on the PGA TOUR”, Table 9 (ShotLink data 2003–2010, about 8 million shots), ' +
      'published in <i>Interfaces</i> 42(2), 2012. ' + L('https://www.columbia.edu/~mnb2/broadie/Assets/strokes_gained_pga_broadie_20110408.pdf', 'Paper (PDF)') + '.</p>' +
      '<p>Putting (feet): Broadie, <i>Every Shot Counts</i> (2014), Table 3.10, as reproduced by ' +
      L('https://golfingfocus.com/what-percentage-of-putts-do-pros-make-tv-does-not-tell-the-story/', 'Golfing Focus') + ', cross-checked with ' +
      L('https://whygolf.com/pages/strokes-gained-calculator', 'WhyGolf') + '.</p>' +
      '<p class="muted">Small approximations: values between table rows are interpolated; “deep rough” = rough + 0.15; “trees” and played-from-hazard use Broadie\'s “recovery” column; ' +
      'shots under 10 yd use the 10-yd value; par-3 tee shots under 100 yd use the fairway column; putts over 90 ft and shots over 600 yd are extended in a straight line.</p>' +
      '<h2>Other groups – estimated</h2>' +
      '<p><b>No published expected-strokes table exists</b> for the LPGA Tour, D1 college men or women, or scratch men or women. (The LPGA shows strokes-gained stats via KPMG but not the table behind them. ' +
      'Clippd/Scoreboard college rankings use their own data and don\'t publish a table.) So these baselines are <b>estimates</b>, built from two published numbers:</p>' +
      '<ol><li><b>Scratch men vs PGA Tour:</b> 5.5 strokes per round behind, split off the tee 2.5, approach 1.5, short game 0.5, putting 1.0. Source: Peter Sanders (ShotByShot), ' +
      L('https://clubhouse.swingu.com/statistics/the-statistical-differences-between-a-scratch-golfer-and-pga-tour-player/', 'SwingU, 8,360 scratch rounds vs 2015 ShotLink') +
      '. This agrees with Lou Stagner\'s finding that the average tour pro is about a +5.4 handicap (' + L('https://golf.com/instruction/pro-golfer-handicap-index-score/', 'Golf.com') + ').</li>' +
      '<li><b>Where the other groups sit:</b> Clippd\'s “Player Quality” ladder (100 = male tour average): D1 college men 95, LPGA Tour 89, D1 college women 87, scratch men 87, scratch women 84. ' +
      L('https://www.clippd.com/insights/post/shot-quality-and-player-quality-clippds-new-performance-metrics', 'Clippd') + '.</li></ol>' +
      '<p><b>Method:</b> we assume each Player Quality point is worth the same number of strokes. Scratch men are 13 points and 5.5 strokes behind the Tour, so 1 point ≈ 0.42 strokes per round. ' +
      'Every group uses the scratch-men split by category. The PGA table is then shifted slightly (more for long shots, a little for putts) so that a typical 18-hole round loses exactly that many strokes in each category.</p>' +
      '<table><tr><th>Baseline</th><th>Type</th><th class="num">Strokes/round vs Tour</th></tr>' + gaps + '</table>' +
      '<p><b>Caveats</b></p><ul>' +
      '<li>Estimated baselines are approximate. Use them to compare rounds with each other, not as exact numbers.</li>' +
      '<li>Player Quality is Clippd\'s own scale. Treating it as linear in strokes is our assumption.</li>' +
      '<li>D1 women and scratch men share the same Clippd score (87), so their baselines are identical.</li>' +
      '<li>Women\'s baselines use the same distances as men\'s. Real tours play shorter courses (the LPGA plays roughly 700 yd shorter per round), so a given distance is harder for them than this shows.</li>' +
      '<li>The category split for every group comes from scratch men. Other groups may lose strokes in a different mix.</li>' +
      '<li>“Scratch” here means a 0 handicap on a typical course, as in the sources.</li></ul>' +
      '<p class="muted">Researched October 2026.</p></div>' +
      '<button class="big" data-act="aboutBack">‹ Back</button>';
  }
  function tile(id, l, v, extra) {
    return '<button class="stat tile" data-act="map" data-v="' + id + '"><b>' + v + '</b><span>' + l + '</span>' + (extra || '') + '</button>';
  }
  function countDirs(list) {
    var c = { '': 0 }; SG.DIR8.forEach(function (d) { c[d] = 0; });
    list.forEach(function (m) { c[m.dir || '']++; }); return c;
  }
  function missMini(list) {
    if (!list.length) return '';
    var c = countDirs(list), parts = [];
    SG.DIR8.forEach(function (d) { if (c[d]) parts.push(ARROW[d] + c[d]); });
    if (c['']) parts.push('?' + c['']);
    return '<small class="mini">' + parts.join(' ') + '</small>';
  }
  // ---------- maps (full-window overlays) ----------
  function mapData(kind) {
    var list = [], n = 0;
    if (kind === 'pin' || kind === 'prox' || kind === 'putt' || kind === 'pmiss' || kind === 'club') return { list: [], rounds: 0 };
    var src = view.mapScope === 'all' ? savedRounds() : [round()];
    src.forEach(function (r) {
      var S = SG.summarize(r, 'pga'); n++;
      (kind === 'gir' ? S.girMap : kind === 'fw' ? S.teeMap : S.apprMiss).forEach(function (m) { var o = {}; for (var x in m) o[x] = m[x]; o.round = r; list.push(o); });
    });
    return { list: list, rounds: n };
  }
  function pt(cx, cy, r, deg) { var t = deg * Math.PI / 180; return [cx + r * Math.cos(t), cy - r * Math.sin(t)]; }
  function f1(v) { return Math.round(v * 10) / 10; }
  var LIE_COL = { rough: '#1f5e1f', deep: '#0e3b0e', fairway: '#5fbf3f', sand: '#d9b44a', hazard: '#d0213a', ob: '#ffffff', recovery: '#7a4a1f', tee: '#888' };
  var LIE_NAME = { rough: 'Rough', deep: 'Deep rough', fairway: 'Fairway', sand: 'Bunker', hazard: 'Hazard', ob: 'OB', recovery: 'Trees' };
  function missSVG(list) {
    var C = 180, CY = 200, c = countDirs(list), out = '<svg id="missmap" viewBox="0 0 360 400" role="img" aria-label="Approach misses around the green">' +
      '<rect width="360" height="400" fill="#cfe8c4"/>';
    SG.DIR8.forEach(function (d) { var q = pt(C, CY, 260, SG.DIR_ANGLE[d] + 22.5);
      out += '<line x1="' + C + '" y1="' + CY + '" x2="' + f1(q[0]) + '" y2="' + f1(q[1]) + '" stroke="#8fb486" stroke-width="2" stroke-dasharray="6 5"/>'; });
    out += '<ellipse cx="180" cy="200" rx="64" ry="78" fill="#3da33d" stroke="#145214" stroke-width="4"/>' +
      '<line x1="180" y1="200" x2="180" y2="168" stroke="#000" stroke-width="3"/><path d="M180 168 l22 7 l-22 7z" fill="#d0213a"/><circle cx="180" cy="200" r="5" fill="#000"/>';
    var byDir = {}; list.forEach(function (m) { if (m.dir) (byDir[m.dir] = byDir[m.dir] || []).push(m); });
    SG.DIR8.forEach(function (d) {
      var a = SG.DIR_ANGLE[d], ms = byDir[d] || [], diag = d.length > 5;
      ms.forEach(function (m, i) {
        var ring = i % 3, col = Math.floor(i / 3) % 7, off = (col % 2 ? 1 : -1) * Math.ceil(col / 2) * 6;
        var p = pt(C, CY, (diag ? 96 : 92) + ring * 14, a + off);
        out += '<circle class="mdot" data-hd="' + (m.dist || 0) + '" data-hu="' + (m.unit || 'yd') + '" cx="' + f1(p[0]) + '" cy="' + f1(p[1]) + '" r="6" fill="' + (LIE_COL[m.lie] || '#888') + '" stroke="#000" stroke-width="2"/>';
      });
      var b = pt(C, CY, diag ? 172 : 150, a);
      out += '<g class="mcount" data-dir="' + d + '"><circle cx="' + f1(b[0]) + '" cy="' + f1(b[1]) + '" r="15" fill="' + (c[d] ? '#000' : '#fff') + '" stroke="#000" stroke-width="2"/>' +
        '<text x="' + f1(b[0]) + '" y="' + f1(b[1] + 6) + '" text-anchor="middle" font-size="17" font-weight="900" fill="' + (c[d] ? '#fff' : '#000') + '">' + c[d] + '</text></g>';
    });
    out += '<text x="180" y="17" text-anchor="middle" font-size="15" font-weight="800">LONG ↑ (past the green)</text>' +
      '<text x="180" y="393" text-anchor="middle" font-size="15" font-weight="800">SHORT ↓ (toward you)</text>' +
      '<text x="8" y="176" font-size="15" font-weight="800">◀ L</text><text x="352" y="176" text-anchor="end" font-size="15" font-weight="800">R ▶</text>';
    return out + '</svg>';
  }
  function girSVG(list) {
    var C = 180, CY = 200, K = 5, out = '<svg id="girmap" viewBox="0 0 360 400" role="img" aria-label="Green-in-regulation landings around the hole">' +
      '<rect width="360" height="400" fill="#cfe8c4"/><circle cx="180" cy="200" r="174" fill="#3da33d" stroke="#145214" stroke-width="4"/>';
    [30, 25, 20, 15, 10, 5].forEach(function (ft) {
      out += '<circle cx="180" cy="200" r="' + ft * K + '" fill="none" stroke="#fff" stroke-width="' + (ft % 10 ? 1.5 : 2.5) + '" stroke-opacity=".9"/>' +
        '<text class="ring" x="' + f1(182 + ft * K * 0.707) + '" y="' + f1(213 + ft * K * 0.707) + '" font-size="13" font-weight="800" fill="#fff">' + ft + ' ft</text>';
    });
    out += '<line x1="180" y1="30" x2="180" y2="370" stroke="#fff" stroke-opacity=".35"/><line x1="10" y1="200" x2="350" y2="200" stroke="#fff" stroke-opacity=".35"/>' +
      '<circle cx="180" cy="200" r="6" fill="#000"/><line x1="180" y1="200" x2="180" y2="170" stroke="#000" stroke-width="3"/><path d="M180 170 l20 6 l-20 6z" fill="#d0213a"/>';
    var seen = {};
    // EVERY GIR is drawn. No direction entered: grey "?" diamond at the right distance, drawn straight up (angle unknown).
    list.forEach(function (m) {
      var ft = m.holed ? 0 : m.ft, far = ft > 30, rr = far ? 33 * K : ft * K, nodir = !m.holed && !m.dir;
      var key = (m.holed ? 'h' : m.dir || 'none') + Math.round(rr / 6), j = seen[key] = (seen[key] || 0) + 1;
      var p = m.holed ? [C - 14 + (j - 1) * 14, CY + 16] : pt(C, CY, rr, (nodir ? 90 : SG.DIR_ANGLE[m.dir]) + (j - 1) * (nodir ? 8 : 6));
      var x = f1(p[0]), y = f1(p[1]), kind = m.holed ? 'holed' : nodir ? 'nodir' : 'dir';
      if (m.holed) out += '<path class="gdot" data-hd="' + (m.holed ? 0 : m.ft) + '" data-hu="ft" data-kind="holed" data-hole="' + m.hole + '" d="M' + x + ' ' + (y - 10) + ' l3 6.5 7 .8 -5.3 4.8 1.5 7 -6.2 -3.6 -6.2 3.6 1.5 -7 -5.3 -4.8 7 -.8z" fill="#ffd23f" stroke="#000" stroke-width="2"/>';
      else if (nodir) out += '<g class="gdot" data-hd="' + (m.holed ? 0 : m.ft) + '" data-hu="ft" data-kind="nodir" data-hole="' + m.hole + '" data-x="' + x + '" data-y="' + y + '"><path d="M' + x + ' ' + (y - 10) + ' l10 10 -10 10 -10 -10z" fill="' + (far ? '#ffd23f' : '#c9c9c9') + '" stroke="#000" stroke-width="2.5"/>' +
        '<text x="' + x + '" y="' + f1(p[1] + 5) + '" text-anchor="middle" font-size="13" font-weight="900" fill="#000">?</text></g>';
      else out += '<circle class="gdot" data-hd="' + (m.holed ? 0 : m.ft) + '" data-hu="ft" data-kind="dir" data-hole="' + m.hole + '" cx="' + x + '" cy="' + y + '" r="8" fill="' + (far ? '#ffd23f' : '#fff') + '" stroke="#000" stroke-width="2.5"/>';
      if (far) out += '<text class="farlbl" x="' + f1(p[0] + 12) + '" y="' + f1(p[1] + 5) + '" font-size="14" font-weight="900" fill="#000" stroke="#ffd23f" stroke-width="3" paint-order="stroke">' + Math.round(ft) + ' ft</text>';
    });
    out += '<text x="180" y="17" text-anchor="middle" font-size="14" font-weight="800">LONG ↑</text>' +
      '<text x="180" y="394" text-anchor="middle" font-size="14" font-weight="800">SHORT ↓ (toward you)</text>' +
      '<text x="4" y="192" font-size="14" font-weight="800">◀ L</text><text x="356" y="192" text-anchor="end" font-size="14" font-weight="800">R ▶</text>';
    return out + '</svg>';
  }
  // ---------- Scoring chances (was Birdie zone): GIR balls on a green + the 1-putt ring + "what if" slider ----------
  function bzBase() { var r = rounds.filter(function (x) { return view.bz && x.id === view.bz.rid; })[0]; return r && !SG.roundEmpty(r) ? r : null; }
  function bzAllRounds(r) { return savedRounds().filter(function (x) { return !r || !r.player || x.player === r.player; }); }
  function bzData() {
    var r = bzBase(), all = BZ.scope(bzAllRounds(r), blOf), allRing = BZ.onePutt(all.putts), scope = r && view.bz.scope === 'round' ? 'round' : 'all';
    var sc = scope === 'round' ? BZ.scope([r], blOf) : all, ring = scope === 'round' ? BZ.onePutt(sc.putts) : allRing, note = '', src = scope;
    if (!ring && scope === 'round') { ring = allRing; src = 'all'; note = 'Only ' + sc.putts.length + ' putts this round – ring uses all rounds (' + all.putts.length + ' putts).'; }
    if (!ring) { src = 'none'; note = 'Not enough putts yet (' + all.putts.length + ' of ' + BZ.MIN_PUTTS + ') – ring set to ' + BZ.DEFAULT_FT + '’.'; }
    return { r: r, scope: scope, sc: sc, all: all, ring: ring ? ring.ft : BZ.DEFAULT_FT, ringInfo: ring, src: src, note: note, bands: BZ.bands(sc.putts) };
  }
  function bzSVG(list, ring, R) { // v134: same green, rings and thin outlines as the other maps; red = 1-putt now, blue = "what if"
    var C = 180, CY = 180, K = 5, out = '<svg id="bzmap" viewBox="0 0 360 360" role="img" aria-label="Birdie chances on the green">' +
      '<circle cx="180" cy="180" r="176" fill="#5cb85c" stroke="#2e7d32" stroke-width="2"/>';
    [10, 20, 30].forEach(function (ft) { out += '<circle cx="180" cy="180" r="' + ft * K + '" fill="none" stroke="#fff" stroke-width="1" stroke-opacity=".7"/>' +
      '<text x="' + f1(182 + ft * K * 0.707) + '" y="' + f1(193 + ft * K * 0.707) + '" font-size="11" font-weight="600" fill="#fff" fill-opacity=".9">' + ft + '’</text>'; });
    out += '<circle id="bzzone" cx="180" cy="180" r="' + R * K + '" fill="#1f73c9" fill-opacity=".14" stroke="#1f73c9" stroke-width="1.6" stroke-dasharray="5 4"' + (R > ring ? '' : ' visibility="hidden"') + '/>' +
      '<circle id="bzring" cx="180" cy="180" r="' + ring * K + '" fill="none" stroke="#e0313f" stroke-width="2.2"/>' +
      '<circle cx="180" cy="180" r="4" fill="#000"/><line x1="180" y1="180" x2="180" y2="155" stroke="#000" stroke-width="2"/><path d="M180 155 l15 4.5 l-15 4.5z" fill="#e0313f"/>';
    var seen = {};
    list.forEach(function (m) { // same placement as the GIR map (girSVG): direction angle, dupes fanned 6°, no direction = straight up
      var ft = m.holed ? 0 : m.ft, far = ft > 30, rr = far ? 33 * K : ft * K, nodir = !m.holed && !m.dir;
      var key = (m.holed ? 'h' : m.dir || 'none') + Math.round(rr / 6), j = seen[key] = (seen[key] || 0) + 1;
      var p = m.holed ? [C - 14 + (j - 1) * 14, CY + 16] : pt(C, CY, rr, (nodir ? 90 : SG.DIR_ANGLE[m.dir]) + (j - 1) * (nodir ? 8 : 6));
      var x = f1(p[0]), y = f1(p[1]), a = ' data-ft="' + ft + '" data-hole="' + m.hole + '" data-birdie="' + (m.birdie ? 1 : 0) + '"';
      if (m.holed) out += '<path class="bzball bzholed"' + a + ' d="M' + x + ' ' + (y - 9) + ' l2.7 5.8 6.3 .7 -4.8 4.3 1.4 6.3 -5.6 -3.2 -5.6 3.2 1.4 -6.3 -4.8 -4.3 6.3 -.7z" fill="#ffd23f" stroke="#1c1c1e" stroke-width="1"/>';
      else {
        var inR = ft <= R, col = bzBallCol(m.birdie, inR);
        out += '<g class="bzball ' + (m.birdie ? 'made' : inR ? 'in' : 'out') + (nodir ? ' nodir' : '') + '"' + a + '><circle cx="' + x + '" cy="' + y + '" r="6.5" fill="' + col[0] + '" stroke="' + col[1] + '" stroke-width="1.2"/>' +
          (nodir ? '<text x="' + x + '" y="' + f1(p[1] - 9) + '" text-anchor="middle" font-size="10" font-weight="700" fill="#fff">?</text>' : '') + '</g>';
      }
      if (far) { var lx = p[0] > C ? p[0] - 10 : p[0] + 10; out += '<text class="bzfar" x="' + f1(lx) + '" y="' + f1(p[1] + (p[1] > CY + 120 ? -9 : 4)) + '"' + (p[0] > C ? ' text-anchor="end"' : '') + ' font-size="11" font-weight="600" fill="#fff">' + Math.round(ft) + '’</text>'; }
    });
    return out + '</svg>';
  }
  // ball colours: [fill, stroke] – red = birdie made, blue = inside the slider ring (a birdie if holed), white = outside
  function bzBallCol(birdie, inR) { return birdie ? ['#e0313f', '#fff'] : inR ? ['#1f73c9', '#fff'] : ['#fff', '#1c1c1e']; }
  // three Quick-view tiles: birdies made · birdies if every putt inside R went in · the 1-putt distance
  function bzTiles(D, R) {
    var z = BZ.zone(D.sc, R);
    return '<div class="quickview bzqv" id="bzqv">' +
      clubQV('made', 'Birdies', '<span id="bzact">' + z.actual + '</span>', 'made') +
      clubQV('ifin', '<span id="bzrlbl">Holed inside ' + R + '’</span>', '<span id="bztot">' + z.total + '</span>', 'birdies', '<span id="bzpot">+' + z.potential + '</span>', 'bzplus') +
      clubQV('ring', '1-putt', D.ring + '<i class="qvu">’</i>', D.src === 'all' && D.scope === 'round' ? 'all rounds' : D.src === 'none' ? 'default' : '50%+ made') + '</div>';
  }
  function bzCount(D, R) { return BZ.label(BZ.zone(D.sc, R)); }
  function birdieHTML() {
    var D = bzData(), r = D.r, ring = D.ring, R = Math.max(ring, Math.min(BZ.MAX_FT, view.bz.R || ring)); view.bz.R = R; view.bz.ring = ring; view.bz.shown = R;
    var back = view.bz.from === 'summary' && r ? '<button class="txt frostbtn" data-act="bzback">‹ Stats</button>' : '<button class="txt frostbtn" data-act="history">‹ Rounds</button>';
    var sub = D.scope === 'round' ? new Date(r.date).toLocaleDateString() + (r.course ? ' · ' + esc(r.course) : '') : D.all.rounds + ' round' + (D.all.rounds === 1 ? '' : 's') + (r && r.player ? ' · ' + esc(r.player) : '');
    var h = '<div class="frostpage theme-sky bzpage" id="birdie"><div class="topbar frost">' + back + '<div class="title"><b>Scoring chances</b><span>' + sub + '</span></div><span class="tbspace"></span></div>';
    if (r) h += '<div class="bzseg bzscope" role="group" aria-label="Scope"><button class="' + (D.scope === 'round' ? 'sel' : '') + '" data-act="bzscope" data-v="round" aria-pressed="' + (D.scope === 'round') + '">This round</button>' +
      '<button class="' + (D.scope === 'all' ? 'sel' : '') + '" data-act="bzscope" data-v="all" aria-pressed="' + (D.scope === 'all') + '">All rounds</button></div>';
    var n = D.sc.chances.length;
    h += '<div class="frostcard bzcard">' + bzTiles(D, R) + '<p class="bzsr" id="bzcount" aria-live="polite">' + bzCount(D, R) + '</p>' +
      '<div class="bzwrap"><div class="bzslcol"><span class="bzsltop">30’</span><input type="range" id="bzslider" class="bzslider" min="' + ring + '" max="' + BZ.MAX_FT + '" step="1" value="' + R + '" aria-label="Make every putt inside this distance"' + (ring >= BZ.MAX_FT ? ' disabled' : '') + '><span class="bzslbot" id="bzslval">' + R + '’</span></div>' +
      bzSVG(D.sc.chances, ring, R) + '</div>' +
      '<p class="bzlegend"><span><span class="bzk ring"></span>1-putt ' + ring + '’</span><span><span class="bzk r"></span>birdie</span><span><span class="bzk bl"></span>inside</span><span><span class="bzk w"></span>outside</span>' + tipBtn('bzring', 'i', 'How Scoring chances works') + '</p>' +
      tipText('bzring', '<b>Red ring = 1-putt distance:</b> the furthest whole foot where you make at least half your putts. For each distance d we look at putts from d − w to d + w (w = 1’ or 25% of d, whichever is bigger) and need at least ' + BZ.MIN_WIN + ' putts there. Starting at 1’ and moving out, it stops at the first distance under 50% or with too few putts, so one lucky long make can’t stretch it. Needs ' + BZ.MIN_PUTTS + '+ putts; a round with fewer uses all rounds' + (r && r.player ? ' (' + esc(r.player) + ')' : '') + '.<br><b>Balls</b> = greens hit in regulation (par 3 tee shot, par 4 2nd, par 5 3rd), placed like the GIR map (top = long, bottom = short, toward you; past 30’ sits on the edge with its distance). Red = made birdie, ★ = holed out.<br><b>Slider</b>: grow the blue ring – blue balls would be birdies if you holed them (birdie or better counts). The middle tile shows your birdie total if every putt inside that distance had dropped.') +
      (D.note ? '<p class="bznote" id="bznote">' + D.note + '</p>' : '') +
      '<p class="muted bzmeta" id="bzmeta">' + n + ' green' + (n === 1 ? '' : 's') + ' hit · ' + D.sc.missed + ' missed (not shown)</p></div>';
    h += '<div class="frostcard bzcard"><h3 class="bzh">Putts made ' + tipBtn('bzbands', '💡', 'About putt make rates') + '</h3>' + tipText('bzbands', 'Every putt' + (D.scope === 'round' ? ' this round' : ' in all rounds') + ', grouped by how far it started from the hole.') +
      '<table class="bztab" id="bztab">' + D.bands.map(function (b) {
        return '<tr data-band="' + b.label + '"><td>' + b.label + '</td><td class="bzbar"><span style="width:' + (b.pct || 0) + '%"></span></td><td class="num">' + (b.n ? b.pct + '%' : '–') + '</td><td class="num muted">' + b.made + '/' + b.n + '</td></tr>'; }).join('') + '</table></div>';
    return h + '</div>';
  }
  function bzUpdate(R) {
    var D = view.bzD || (view.bzD = bzData()); view.bz.R = R; var z = document.getElementById('bzzone');
    if (z) { z.setAttribute('r', R * 5); if (R > view.bz.ring) z.removeAttribute('visibility'); else z.setAttribute('visibility', 'hidden'); }
    [].slice.call(document.querySelectorAll('#bzmap g.bzball')).forEach(function (g) {
      var b = g.getAttribute('data-birdie') === '1', inR = +g.getAttribute('data-ft') <= R, c = g.querySelector('circle'), col = bzBallCol(b, inR);
      g.classList.toggle('in', !b && inR); g.classList.toggle('out', !b && !inR); c.setAttribute('fill', col[0]); c.setAttribute('stroke', col[1]); });
    var z = BZ.zone(D.sc, R); view.bz.shown = R;
    document.getElementById('bzcount').textContent = bzCount(D, R); document.getElementById('bzslval').textContent = R + '’';
    document.getElementById('bztot').textContent = z.total; document.getElementById('bzpot').textContent = '+' + z.potential;
    document.getElementById('bzrlbl').textContent = 'Holed inside ' + R + '’';
  }
  function dirTable(list) {
    var c = countDirs(list), out = '<table class="dirtab" id="dirtab"><tr><th>Direction</th><th class="num">Count</th></tr>';
    SG.DIR8.slice().sort(function (a, b) { return DIR_ORDER.indexOf(a) - DIR_ORDER.indexOf(b); }).forEach(function (d) {
      out += '<tr data-dir="' + d + '"><td>' + ARROW[d] + ' ' + SG.DIR_NAME[d] + '</td><td class="num">' + c[d] + '</td></tr>'; });
    if (c['']) out += '<tr data-dir=""><td>No direction entered (not plotted)</td><td class="num">' + c[''] + '</td></tr>';
    return out + '</table>';
  }
  var DIR_ORDER = ['short', 'shortleft', 'shortright', 'left', 'right', 'long', 'longleft', 'longright'];
  function mapHTML() {
    var kind = view.map, D = mapData(kind), list = D.list, all = view.mapScope === 'all';
    var out = '<div class="mapview' + (kind === 'club' ? ' clubview' : kind === 'prox' ? ' clubview proxview' : ' clubview lightmap') + '" id="mapview" role="dialog" aria-label="' + (kind === 'gir' ? 'GIR map' : kind === 'fw' ? 'Fairway map' : kind === 'pin' ? 'Pin location map' : kind === 'prox' ? 'Proximity map' : kind === 'putt' ? 'Putting map' : kind === 'club' ? 'Club performance' : kind === 'pmiss' ? '1st putts made map' : 'Approach miss map') + '">' +
      '<div class="maphead"><b>' + (kind === 'gir' ? 'Greens in regulation' : kind === 'fw' ? 'Tee shots – fairways' : kind === 'pin' ? 'Pin location' : kind === 'prox' ? 'Proximity by distance' : kind === 'putt' ? 'Putting' : kind === 'club' ? 'Club performance' : kind === 'pmiss' ? '1st putts made inside 10 ft' : 'Approach misses') + '</b><button class="close" data-act="mapclose" aria-label="Close map">✕ Close</button></div>' +
      '<div class="seg"><button data-act="mapscope" data-v="round" class="' + (all ? '' : 'sel') + '">This round</button>' +
      '<button data-act="mapscope" data-v="all" class="' + (all ? 'sel' : '') + '">All rounds (' + savedRounds().length + ')</button></div>';
    if (kind === 'pin') out += pinMapHTML(all);
    else if (kind === 'prox') out += proxHTML(all);
    else if (kind === 'putt') out += puttHTML(all);
    else if (kind === 'pmiss') out += pmissHTML(all);
    else if (kind === 'club') out += clubHTML(all);
    else if (kind === 'fw') out += fwHTML(list, all, D);
    else if (kind === 'gir') {
      var far = list.filter(function (m) { return m.ft > 30; }).length, holed = list.filter(function (m) { return m.holed; }).length;
      out += '<p class="mapsum" id="mapsum"><b>' + list.length + '</b> green' + (list.length === 1 ? '' : 's') + ' in regulation' + (all ? ' in ' + D.rounds + ' round' + (D.rounds === 1 ? '' : 's') : ' this round') + '</p>' +
        girSVG(list) +
        '<div class="legend"><span><i class="dot" style="background:#fff"></i>Where the approach stopped (first-putt distance, direction vs the hole)</span>' +
        '<span><i class="dot" style="background:#ffd23f"></i>Over 30 ft – drawn at the edge, labelled with its distance</span>' +
        '<span><svg width="20" height="20" viewBox="0 0 20 20" style="flex:none"><path d="M10 1 l9 9 -9 9 -9 -9z" fill="#c9c9c9" stroke="#000" stroke-width="2"/><text x="10" y="14.5" text-anchor="middle" font-size="12" font-weight="900">?</text></svg>No direction entered – right distance, drawn straight up (direction unknown)</span>' +
        '<span><b class="star">★</b>Holed out (shot went in, or chipped/holed in from off the green)</span>' +
        '<span><i class="dot" style="background:#000"></i>Hole · white rings every 5 ft (5–30 ft)</span></div>' +
        '<p class="help muted"><b>GIR</b> = on the green (or holed) in par − 2 strokes or fewer, penalties included (par 3: tee shot, par 4: tee or 2nd shot, par 5: tee, 2nd or 3rd shot). ' +
        'Every finished hole is either a GIR (shown here) or a regulation miss (Approach misses map), so GIR + misses = holes. ' +
        'Holing out, or chipping in from 30 yd or closer right after, counts as hitting it (★). Bottom of the picture = short (toward you).</p>' +
        dirTable(list.filter(function (m) { return !m.holed; })).replace('(not plotted)', '(drawn as ?)').replace('</table>', (holed ? '<tr data-dir="holed"><td>★ Holed out</td><td class="num">' + holed + '</td></tr>' : '') + '</table>');
    } else {
      out += '<p class="mapsum" id="mapsum"><b>' + list.length + '</b> approach' + (list.length === 1 ? '' : 'es') + ' missed the green' + (all ? ' in ' + D.rounds + ' round' + (D.rounds === 1 ? '' : 's') : ' this round') + '</p>' +
        missSVG(list) + '<div class="legend">' + ['rough', 'fairway', 'sand', 'hazard', 'ob', 'recovery'].map(function (l) {
          return '<span><i class="dot" style="background:' + LIE_COL[l] + '"></i>' + LIE_NAME[l] + '</span>'; }).join('') +
        '<span><i class="dot num">3</i>Misses in that direction</span></div>' +
        '<p class="help muted"><b>Approach miss</b> = a hole that was not a GIR. One per hole: the regulation shot (stroke par − 2: par 3 = tee shot, par 4 = 2nd shot, par 5 = 3rd shot), drawn where it finished. ' +
        'A par-4 tee shot or a par-5 2nd shot short of the green is never a miss. Penalty strokes count: if stroke par − 2 was a penalty stroke, the ball struck before it is used. GIR + misses = holes. ' +
        'Direction = where it missed the green (the Dir you entered on the next row). Only finished holes count. Bottom = short (toward you).</p>' + dirTable(list);
    }
    return out + '<button class="big" data-act="mapclose">Close</button></div>';
  }
  function pinHTML() {
    var h = round().holes[view.hole], pin = SG.normPin(h.pin);
    var out = '<div class="mapview" id="pinview" role="dialog" aria-label="Pin location">' +
      '<div class="maphead"><b>Hole ' + (view.hole + 1) + ' – pin location</b><button class="close" data-act="pinclose" aria-label="Close">✕ Close</button></div>' +
      '<p class="help">Tap the part of the green where the pin is. <b>Front = toward you</b> (bottom), back = far side.</p>' +
      '<div class="pinwrap"><div class="pinlbl">BACK ↑</div><div class="pingreen" id="pingreen">';
    SG.PIN_GRID.forEach(function (rw) { rw.forEach(function (c) {
      out += '<button data-act="pinset" data-v="' + c + '" class="' + (c === pin ? 'sel' : '') + '" aria-pressed="' + (c === pin) + '">' +
        (c === pin ? '<span class="flag">⛳</span>' : '') + SG.PIN_NAME[c].replace(' ', '<br>') + '</button>';
    }); });
    out += '</div><div class="pinlbl">FRONT ↓ (toward you)</div></div>' +
      '<p class="pincur" id="pincur">' + (pin ? 'Pin: <b>' + SG.PIN_NAME[pin] + '</b> – saved' : 'No pin location set') + '</p>' +
      '<div class="row2"><button class="big" data-act="pinclear"' + (pin ? '' : ' disabled') + '>Clear pin</button>' +
      '<button class="primary big" data-act="pinclose">Done</button></div></div>';
    return out;
  }
  // Ball-flight tracer, seen from behind/above: a gentle cubic arc that bows out to one side and lands
  // on the end point (a fade/draw shape). Shots finishing right bow left first and vice versa; straight
  // shots alternate. Used by the fairway map and the proximity map so both look the same.
  function flight(x0, y0, x1, y1, i) {
    var dx = x1 - x0, dy = y1 - y0, L = Math.sqrt(dx * dx + dy * dy) || 1, nx = -dy / L, ny = dx / L;
    var sg = Math.abs(dx) > 8 ? (dx > 0 ? -1 : 1) : (i % 2 ? 1 : -1), b = Math.min(30, L * 0.1) * sg;
    return 'M' + f1(x0) + ' ' + f1(y0) + ' C' + f1(x0 + dx * 0.2 + nx * b) + ' ' + f1(y0 + dy * 0.35 + ny * b) + ' ' +
      f1(x0 + dx * 0.65 + nx * b * 0.85) + ' ' + f1(y0 + dy * 0.8 + ny * b * 0.85) + ' ' + f1(x1) + ' ' + f1(y1);
  }
  // Fairway bird's-eye view: every par-4/5 tee shot as a tracer from the tee
  var FW_END = { fairway: '#ffffff', rough: '#d0213a', bunker: '#e8c766', hazard: '#1e6fd9', trees: '#6b3d12', ob: '#000000' };
  var FW_NAME = { fairway: 'Fairway (or green)', rough: 'Rough', bunker: 'Bunker', hazard: 'Hazard', trees: 'Trees', ob: 'OB' };
  function fwSVG(list) {
    var TX = 180, TY = 532, PX = 1.5, Y = function (yd) { return TY - yd * PX; };
    var out = '<svg id="fwmap" viewBox="0 0 360 560" role="img" aria-label="Tee shots on a fairway">' +
      '<rect width="360" height="560" fill="#2f6b2a"/>' +                       // trees both sides
      '<rect x="56" y="0" width="248" height="560" fill="#4f9a3c"/>' +          // rough
      '<path d="M146 ' + Y(115) + ' Q180 ' + Y(125) + ' 214 ' + Y(115) + ' L218 0 L142 0 Z" fill="#7fd16a"/>' + // fairway
      '<line x1="22" y1="0" x2="22" y2="560" stroke="#fff" stroke-width="3" stroke-dasharray="4 16"/>' +
      '<line x1="338" y1="0" x2="338" y2="560" stroke="#fff" stroke-width="3" stroke-dasharray="4 16"/>' +
      '<text x="6" y="14" font-size="11" font-weight="800" fill="#fff">OB</text><text x="354" y="14" text-anchor="end" font-size="11" font-weight="800" fill="#fff">OB</text>' +
      '<ellipse cx="128" cy="' + Y(255) + '" rx="10" ry="22" fill="#e8c766"/><ellipse cx="234" cy="' + Y(230) + '" rx="10" ry="22" fill="#e8c766"/>' +
      '<rect x="166" y="' + (TY - 6) + '" width="28" height="20" rx="4" fill="#9be08a" stroke="#fff" stroke-width="2"/>';
    [100, 150, 200, 250, 300].forEach(function (yd) {
      out += '<line x1="56" y1="' + Y(yd) + '" x2="304" y2="' + Y(yd) + '" stroke="#fff" stroke-opacity=".45" stroke-dasharray="3 6"/>' +
        '<text class="yd" x="60" y="' + (Y(yd) - 4) + '" font-size="12" font-weight="800" fill="#fff">' + yd + ' yd</text>';
    });
    var END_X = { rough: 98, bunker: 132, hazard: 74, trees: 40, ob: 12 };
    list.forEach(function (m, i) {
      var sgn = m.side === 'L' ? -1 : m.side === 'R' ? 1 : 0, jit = ((i * 37) % 7 - 3) * 5;
      var yd = m.kind === 'ob' ? 250 : Math.max(40, Math.min(330, m.hit || 0)), ex, dashed = false;
      if (m.kind === 'fairway') ex = TX + sgn * 20 + jit;
      else if (!sgn) { ex = TX + jit / 2; dashed = true; }
      else ex = m.kind === 'rough' ? TX + sgn * (TX - END_X.rough + jit) : TX + sgn * (TX - END_X[m.kind]);
      var ey = Y(yd), fp = flight(TX, TY, ex, ey, i);
      var col = m.fairway ? '#00a000' : '#e0102a';
      out += '<path class="tracer ' + (m.fairway ? 'hit' : 'miss') + '" data-kind="' + m.kind + '" data-side="' + (m.side || '') + '" data-ex="' + f1(ex) + '" data-ey="' + f1(ey) + '" d="' + fp + '" fill="none" stroke="#000" stroke-opacity=".35" stroke-width="6"/>' +
        '<path d="' + fp + '" fill="none" stroke="' + (m.fairway ? '#b6ff9e' : '#ff4d5e') + '" stroke-width="3.5"' + (dashed ? ' stroke-dasharray="8 6"' : '') + '/>';
      // heat data: distance the drive went (yd), fairway hit or not; misses with no L/R entered are left out of the heat map
      var hd = ' class="fwdot" data-hd="' + Math.round(yd) + '" data-hu="yd" data-fw="' + (m.fairway ? 1 : 0) + '" data-lie="' + m.kind + '"' + (dashed ? ' data-class="nodir"' : '') + (m.layup ? ' data-layup="1"' : '');
      if (m.kind === 'ob') out += '<text' + hd + ' x="' + f1(ex) + '" y="' + f1(ey + 7) + '" text-anchor="middle" font-size="22" font-weight="900" fill="#fff" stroke="#000" stroke-width="2" paint-order="stroke">✕</text>';
      else out += '<circle' + hd + ' cx="' + f1(ex) + '" cy="' + f1(ey) + '" r="6.5" fill="' + FW_END[m.kind] + '" stroke="' + (m.kind === 'fairway' ? col : '#000') + '" stroke-width="2.5"/>';
      if (dashed) out += '<text x="' + f1(ex + 9) + '" y="' + f1(ey + 5) + '" font-size="14" font-weight="900" fill="#fff">?</text>';
    });
    out += '<text x="180" y="556" text-anchor="middle" font-size="12" font-weight="800" fill="#fff">TEE</text>';
    // top row: left miss % · fairway % · right miss % (of every tee shot shown; misses with no side are in the total only)
    var N = list.length, pc = function (k) { return N ? Math.round(100 * k / N) + '%' : '–'; };
    var nL = list.filter(function (m) { return !m.fairway && m.side === 'L'; }).length, nR = list.filter(function (m) { return !m.fairway && m.side === 'R'; }).length, nF = list.filter(function (m) { return m.fairway; }).length, nU = N - nL - nR - nF;
    out += '<g id="fwpct"><rect x="40" y="4" width="280" height="' + (nU ? 52 : 42) + '" rx="10" fill="#fff" fill-opacity=".92"/>' +
      [[100, 'Left', nL, 'L'], [180, 'Fairway', nF, 'F'], [260, 'Right', nR, 'R']].map(function (c) { return '<text x="' + c[0] + '" y="16" text-anchor="middle" font-size="10" font-weight="700" fill="#555">' + c[1] + '</text>' +
        '<text class="fwpct" data-k="' + c[3] + '" data-n="' + c[2] + '" x="' + c[0] + '" y="38" text-anchor="middle" font-size="20" font-weight="900" fill="' + (c[3] === 'F' ? '#00791b' : '#b00020') + '">' + pc(c[2]) + '</text>'; }).join('') +
      (nU ? '<text id="fwpctnote" x="180" y="51" text-anchor="middle" font-size="9.5" font-weight="700" fill="#555">+ ' + nU + ' miss' + (nU === 1 ? '' : 'es') + ' with no side entered (' + pc(nU) + ')</text>' : '') + '</g>';
    return out + '</svg>';
  }
  // Drive distance = hole length minus the next shot's distance (the value used to place the shot). Par 4/5 tee shots only;
  // no layups, OB or penalty tee shots, nor shots with no computable distance. If most of those have a club entered,
  // only Driver shots count ('Driver'); otherwise every one counts ('Tee shots').
  function fwDrives(list) {
    var L = list.filter(function (m) { return !m.layup && m.kind !== 'ob' && !m.pen && m.hit != null && isFinite(m.hit) && m.hit > 0; });
    var withClub = L.filter(function (m) { return m.club; }).length, drv = L.length && withClub / L.length > 0.5;
    var U = drv ? L.filter(function (m) { return m.club === 'Driver'; }) : L, d = U.map(function (m) { return Number(m.hit); });
    return { driverOnly: drv, n: d.length, avg: d.length ? Math.round(d.reduce(function (a, b) { return a + b; }, 0) / d.length) : null, max: d.length ? Math.max.apply(null, d) : null };
  }
  function fwDriveLine(list) { var V = fwDrives(list); if (!V.n) return '<p class="mapsum fwdrive" id="fwdrive">' + (V.driverOnly ? 'Driver' : 'Drives') + ': no measurable drives yet.</p>';
    return '<p class="mapsum fwdrive" id="fwdrive" data-avg="' + V.avg + '" data-max="' + V.max + '" data-n="' + V.n + '" data-rule="' + (V.driverOnly ? 'driver' : 'all') + '">' + (V.driverOnly ? '<b>Driver</b> – avg' : 'Avg drive') + ' <b>' + V.avg + ' yd</b> · Longest <b>' + V.max + ' yd</b> <small>(' + V.n + ' drive' + (V.n === 1 ? '' : 's') + ')</small></p>'; }
  function fwHTML(list, all, D) {
    var nLay = list.filter(function (m) { return m.layup; }).length;
    list = list.filter(function (m) { return !m.layup; }); // layup tee shots are left off this map (and its numbers) entirely
    var hit = list.filter(function (m) { return m.fairway; }).length, miss = list.filter(function (m) { return !m.fairway; });
    var L = miss.filter(function (m) { return m.side === 'L'; }).length, R = miss.filter(function (m) { return m.side === 'R'; }).length;
    var by = {}; miss.forEach(function (m) { by[m.kind] = (by[m.kind] || 0) + 1; });
    var out = '<p class="mapsum" id="mapsum">Fairways hit <b>' + hit + ' / ' + list.length + '</b>' + (list.length ? ' (' + Math.round(100 * hit / list.length) + '%)' : '') +
      (all ? ' in ' + D.rounds + ' round' + (D.rounds === 1 ? '' : 's') : ' this round') + (nLay ? ' <small id="fwlay">(' + nLay + ' layup tee shot' + (nLay === 1 ? '' : 's') + ' left out)</small>' : '') + '</p>' +
      '<div class="fwcounts" id="fwcounts"><span>⬅ Missed left <b>' + L + '</b></span><span>Missed right <b>' + R + '</b> ➡</span>' +
      (miss.length - L - R ? '<span>No direction <b>' + (miss.length - L - R) + '</b></span>' : '') + '</div>' + fwDriveLine(list) + fwSVG(list) +
      '<div class="legend"><span><i class="ln" style="background:#00a000"></i>Hit the fairway</span><span><i class="ln" style="background:#e0102a"></i>Missed</span>' +
      '<span><i class="ln dash"></i>Missed, no direction entered (ends straight up the middle)</span>' +
      ['fairway', 'rough', 'bunker', 'hazard', 'trees'].map(function (k) { return '<span><i class="dot" style="background:' + FW_END[k] + '"></i>Ended: ' + FW_NAME[k] + '</span>'; }).join('') +
      '<span><b class="x">✕</b>OB (length unknown – drawn at 250 yd)</span></div>' +
      '<table class="dirtab" id="fwtab"><tr><th>Missed into</th><th class="num">Left</th><th class="num">Right</th><th class="num">Total</th></tr>';
    ['rough', 'bunker', 'hazard', 'trees', 'ob'].forEach(function (k) {
      var l = miss.filter(function (m) { return m.kind === k && m.side === 'L'; }).length, r = miss.filter(function (m) { return m.kind === k && m.side === 'R'; }).length;
      out += '<tr data-kind="' + k + '"><td>' + FW_NAME[k] + '</td><td class="num">' + l + '</td><td class="num">' + r + '</td><td class="num">' + (by[k] || 0) + '</td></tr>';
    });
    out += '</table><p class="help muted">Every tee shot on a par 4 or 5 (finished holes only; layup tee shots are left off this map and its percentages). Avg / Longest drive = hole length minus the distance left for the next shot, leaving out OB and penalty tee shots; when most tee shots have a club entered only Driver shots count (labelled Driver), otherwise every tee shot counts, drawn from the tee to the distance it went (hole length minus the distance left). ' +
      'Left/right comes from the Dir you entered on row 2. Fairway hit = first tee shot finished on the fairway or green with no penalty. Bird\'s-eye view: the fairway runs away from you.</p>';
    return out;
  }
  // ---------- proximity by distance ----------
  function fmtFt(v) { return v == null ? '–' : Math.round(v) + ' ft'; }
  // ---------- Putting green ----------
  // ---------- Heat maps (app only) ----------
  // Every map marker carries data-hd (distance to the hole) + data-hu (ft|yd). Heat mode hides the dots and
  // paints soft density blobs; nearby blobs are grouped into "islands" (single-linkage, 40 px), each labelled
  // with its average distance and shot count; a crosshair marks the average finish of all plotted shots.
  var HEAT_MAPS = { fw: 'fwmap', club: 'clubmap', gir: 'girmap', miss: 'missmap', pin: 'pinmap', prox: 'proxmap', putt: 'puttmap', pmiss: 'pmissmap' };
  var HEAT_LINK = 62;
  function heatCenter(svg, kind) {
    if (kind === 'prox') return [PX.cx, PX.cy];
    if (kind === 'putt') return [PG2.cx, PG2.cy];
    if (kind === 'fw') return [180, 532];
    if (kind === 'pin') { var f = svg.querySelector('#pinflag'); if (f) return [+f.getAttribute('cx'), +f.getAttribute('cy')]; }
    return [180, 200];
  }
  // Real-distance islands: shots within 3 ft (3 yd on yardage maps / for off-green shots) chain into one island;
  // then islands whose edges come within 2 ft (2 yd) of each other are merged (edge = 3 ft link zone around each shot).
  function heatReal(pts, C) {
    var yd = pts.every(function (p) { return p.u === 'yd'; });
    pts.forEach(function (p) { var dx = p.x - C[0], dy = C[1] - p.y, L = Math.hypot(dx, dy), d = yd ? p.d : p.u === 'yd' ? p.d * 3 : p.d;
      p.rx = L ? d * dx / L : 0; p.ry = L ? d * dy / L : 0; p.big = !yd && p.u === 'yd'; });
    return yd;
  }
  function heatClus() { var v = +(view.clus || localStorage.getItem('golfsg.heatclus.v1') || 3); return Math.max(1, Math.min(10, v || 3)); }
  function heatIslandsReal(pts, yd, L) {
    L = L || 3;
    var id = pts.map(function (_, i) { return i; }), find = function (i) { while (id[i] !== i) i = id[i] = id[id[i]]; return i; };
    var link = function (a, b) { return yd ? L : (a.big || b.big ? 3 * L : L); }, gap = L * 2 / 3;
    for (var i = 0; i < pts.length; i++) for (var j = i + 1; j < pts.length; j++) if (Math.hypot(pts[i].rx - pts[j].rx, pts[i].ry - pts[j].ry) <= link(pts[i], pts[j])) id[find(i)] = find(j);
    var groups = {}; pts.forEach(function (p, i) { (groups[find(i)] = groups[find(i)] || []).push(p); });
    var G = Object.keys(groups).map(function (k) { return groups[k]; });
    var circ = function (g) { var cx = 0, cy = 0; g.forEach(function (p) { cx += p.rx; cy += p.ry; }); cx /= g.length; cy /= g.length;
      return [cx, cy, Math.max.apply(null, g.map(function (p) { return Math.hypot(p.rx - cx, p.ry - cy); }))]; };
    for (var merged = true; merged;) { merged = false;
      for (var a = 0; a < G.length && !merged; a++) for (var b = a + 1; b < G.length && !merged; b++) {
        var md = Infinity; G[a].forEach(function (p) { G[b].forEach(function (q) { md = Math.min(md, Math.hypot(p.rx - q.rx, p.ry - q.ry) - link(p, q)); }); }); if (md <= gap) { G[a] = G[a].concat(G[b]); G.splice(b, 1); merged = true; } } }
    return G.sort(function (a, b) { return b.length - a.length; });
  }
  // Island outline that takes the cluster's shape: union of a disc per shot plus a round-capped band along the
  // island's minimum spanning tree (so an elongated cluster is a sausage, an L-shaped one bends); drawn twice for
  // a crisp thin border. Single fill colour, padded ~R px around the shots, rounded everywhere.
  function islandShape(g, col, R) {
    R = R || 11; var n = g.length, inT = [0], edges = [], best = g.map(function (p) { return [Math.hypot(p.x - g[0].x, p.y - g[0].y), 0]; });
    var used = g.map(function (_, i) { return i === 0; });
    for (var k = 1; k < n; k++) { var bi = -1; for (var i = 0; i < n; i++) if (!used[i] && (bi < 0 || best[i][0] < best[bi][0])) bi = i;
      used[bi] = true; edges.push([best[bi][1], bi]); for (var j = 0; j < n; j++) if (!used[j]) { var d = Math.hypot(g[j].x - g[bi].x, g[j].y - g[bi].y); if (d < best[j][0]) best[j] = [d, bi]; } }
    var path = g.map(function (p) { return 'M' + f1(p.x) + ' ' + f1(p.y) + 'h0.01'; }).join('') + edges.map(function (e) { return 'M' + f1(g[e[0]].x) + ' ' + f1(g[e[0]].y) + 'L' + f1(g[e[1]].x) + ' ' + f1(g[e[1]].y); }).join('');
    if (col === '~path') return path;
    return '<g filter="url(#hgoo)"><path class="hedge" d="' + path + '" fill="transparent" stroke="#3a0000" stroke-width="' + f1(2 * R + 3) + '" stroke-linecap="round" stroke-linejoin="round"/></g>' +
      '<g filter="url(#hgoo)"><path class="hfill" d="' + path + '" fill="transparent" stroke="' + col + '" stroke-width="' + f1(2 * R) + '" stroke-linecap="round" stroke-linejoin="round"/></g>';
  }
  // Continuous density (Gaussian kernel, sigma 13 px) painted to a canvas and embedded as an image: clear where
  // there are no shots, light -> dark red with density. Hot-spot tags at local density peaks (>= 30% of the max).
  function heatGradient(svg, pts, CL) {
    var vb = svg.viewBox.baseVal, W = vb.width, H = vb.height, OX = vb.x || 0, OY = vb.y || 0, S = 3, gw = Math.ceil(W / S), gh = Math.ceil(H / S), sig = 6 + 3.4 * (CL || 3), D = new Float32Array(gw * gh), mx = 0; // v124: OX/OY = cropped viewBox origin (proximity page)
    for (var y = 0; y < gh; y++) for (var x = 0; x < gw; x++) { var v = 0, px = OX + x * S + S / 2, py = OY + y * S + S / 2;
      for (var i = 0; i < pts.length; i++) { var dx = px - pts[i].x, dy = py - pts[i].y, q = dx * dx + dy * dy; if (q < 9 * sig * sig) v += Math.exp(-q / (2 * sig * sig)); }
      D[y * gw + x] = v; if (v > mx) mx = v; }
    var cv = document.createElement('canvas'); cv.width = gw; cv.height = gh; var cx = cv.getContext('2d'), im = cx.createImageData(gw, gh);
    // classic click-heat-map ramp: transparent -> blue -> cyan -> green -> yellow -> orange -> red (densest)
    var RB = [[0, [0, 0, 255]], [0.12, [0, 60, 255]], [0.3, [0, 220, 255]], [0.5, [0, 230, 60]], [0.68, [255, 240, 0]], [0.84, [255, 140, 0]], [1, [230, 0, 0]]];
    for (var k = 0; k < D.length; k++) { var t = mx ? D[k] / mx : 0, a = t < 0.02 ? 0 : Math.min(0.78, 0.18 + t * 0.75) * Math.min(1, t / 0.08), j = 1;
      while (j < RB.length - 1 && t > RB[j][0]) j++; var u = Math.max(0, Math.min(1, (t - RB[j - 1][0]) / (RB[j][0] - RB[j - 1][0])));
      for (var ch = 0; ch < 3; ch++) im.data[k * 4 + ch] = Math.round(RB[j - 1][1][ch] + (RB[j][1][ch] - RB[j - 1][1][ch]) * u); im.data[k * 4 + 3] = Math.round(a * 255); }
    cx.putImageData(im, 0, 0);
    var o = '<image id="heatgrad" href="' + cv.toDataURL('image/png') + '" x="' + OX + '" y="' + OY + '" width="' + W + '" height="' + H + '" preserveAspectRatio="none"/>';
    var peaks = [];
    for (y = 1; y < gh - 1; y++) for (x = 1; x < gw - 1; x++) { var c = D[y * gw + x]; if (c < Math.min(0.3 * mx, 0.6)) continue; var top = true;
      for (var yy = -4; yy <= 4 && top; yy++) for (var xx = -4; xx <= 4; xx++) { var Y = y + yy, X = x + xx; if ((yy || xx) && Y >= 0 && X >= 0 && Y < gh && X < gw && D[Y * gw + X] > c) { top = false; break; } }
      if (top) peaks.push([OX + x * S + S / 2, OY + y * S + S / 2, c]); }
    // one hot spot per blob: a flat or twin-topped peak (2+ shots at the same spot) yields several local maxima -> keep the
    // strongest and drop any within 1.5 sigma of a kept one; each shot then belongs to its nearest kept peak (counted once)
    peaks.sort(function (a, b) { return b[2] - a[2]; });
    var keep = []; peaks.forEach(function (p) { if (!keep.some(function (k) { return Math.hypot(k[0] - p[0], k[1] - p[1]) < 1.5 * sig; })) keep.push(p); });
    keep = keep.slice(0, 12);
    var own = keep.map(function () { return []; });
    pts.forEach(function (q) { var bi = -1, bd = 2 * sig; keep.forEach(function (k, i) { var d = Math.hypot(q.x - k[0], q.y - k[1]); if (d <= bd) { bd = d; bi = i; } }); if (bi >= 0) own[bi].push(q); });
    var boxes = [], n = 0;
    keep.forEach(function (p, i) { var near = own[i]; if (!near.length) return; n++; if (view.map === 'fw') return; // tee map: no hot-spot labels
      o += heatTag('hotspot', near.length, p[0], p[1], heatLabel(near), boxes, W, H, OX, OY); });
    return { svg: o, peaks: n };
  }
  // Tag placement: try spots around the anchor (nearest first); never over another tag; if the tag ends up
  // away from its anchor, a thin leader line joins them.
  function heatTag(cls, n, ax, ay, t, boxes, W, H, OX, OY) {
    OX = OX || 0; OY = OY || 0; // v124: viewBox origin (the proximity page crops the top)
    var w = t.length * 6.2 + 10, hh = 18, c = [], best = null;
    [0, 1, 2, 3, 4].forEach(function (ring) { var d = 16 + ring * 22;
      [[0, -1], [0, 1], [1, 0], [-1, 0], [1, -1], [-1, -1], [1, 1], [-1, 1]].forEach(function (v) { c.push([ax + v[0] * (d + (v[0] ? w / 2 : 0)) - w / 2, ay + v[1] * d - hh / 2]); }); });
    for (var i = 0; i < c.length; i++) { var x = Math.max(OX + 3, Math.min(OX + W - 3 - w, c[i][0])), y = Math.max(OY + 3, Math.min(OY + H - 3 - hh, c[i][1]));
      if (!boxes.some(function (b) { return x < b[2] + 2 && x + w > b[0] - 2 && y < b[3] + 2 && y + hh > b[1] - 2; })) { best = [x, y]; break; } }
    if (!best) best = [Math.max(OX + 3, Math.min(OX + W - 3 - w, ax - w / 2)), Math.max(OY + 3, ay - 30)];
    var x0 = best[0], y0 = best[1]; boxes.push([x0, y0, x0 + w, y0 + hh]);
    var nx = Math.max(x0, Math.min(x0 + w, ax)), ny = Math.max(y0, Math.min(y0 + hh, ay)), far = Math.hypot(nx - ax, ny - ay) > 18;
    return '<g class="' + cls + '" data-n="' + n + '"' + (far ? ' data-leader="1"' : '') + '>' + (far ? '<line class="leader" x1="' + f1(ax) + '" y1="' + f1(ay) + '" x2="' + f1(nx) + '" y2="' + f1(ny) + '" stroke="#3a0000" stroke-width="1.2"/>' : '') +
      '<circle cx="' + f1(ax) + '" cy="' + f1(ay) + '" r="2.5" fill="#fff" stroke="#3a0000"/><rect x="' + f1(x0) + '" y="' + f1(y0) + '" width="' + f1(w) + '" height="' + hh + '" rx="9" fill="#fff" fill-opacity=".95" stroke="#7a2a00"/>' +
      '<text x="' + f1(x0 + w / 2) + '" y="' + f1(y0 + 13) + '" text-anchor="middle" font-size="11" font-weight="900" fill="#7a2a00">' + esc(t) + '</text></g>';
  }
  function heatIslands(pts, link) {
    var id = pts.map(function (_, i) { return i; }), find = function (i) { while (id[i] !== i) i = id[i] = id[id[i]]; return i; };
    for (var i = 0; i < pts.length; i++) for (var j = i + 1; j < pts.length; j++) if (Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) <= link) id[find(i)] = find(j);
    var g = {}; pts.forEach(function (p, i) { (g[find(i)] = g[find(i)] || []).push(p); });
    return Object.keys(g).map(function (k) { return g[k]; }).sort(function (a, b) { return b.length - a.length; });
  }
  // tee-shot map: a hot spot's count + fairway share (its average distance would mislead: hits and misses mix); else avg distance + count
  function heatLabel(g) { var n = g.length + ' shot' + (g.length === 1 ? '' : 's');
    if (view.map === 'prox' || view.map === 'gir') return heatFmt(g); // the yardage rail already gives the counts
    if (view.map === 'fw') return n + ' · ' + Math.round(100 * g.filter(function (p) { return p.fw === '1'; }).length / g.length) + '% fairway';
    return heatFmt(g) + ' · ' + n; }
  function heatFmt(list) { // average distance; yards when every shot is off the green in yd, else feet
    var yd = list.every(function (p) { return p.u === 'yd'; }), v = list.reduce(function (a, p) { return a + (yd ? p.d : p.u === 'yd' ? p.d * 3 : p.d); }, 0) / list.length;
    return Math.round(v) + (yd ? ' yd' : '\u2019'); // feet as 17’ (right single quote renders in every font)
  }
  function applyHeat(root) {
    var mv = root || document.getElementById('mapview'); if (!mv || !HEAT_MAPS[view.map]) return;
    var svg = mv.querySelector('#' + HEAT_MAPS[view.map]); if (!svg || svg.getAttribute('data-mode') === 'all') return; // v117: no heat layer on the All putts lines
    var C = heatCenter(svg, view.map), NS = 'http://www.w3.org/2000/svg', pts = [];
    var noDir = 0; // markers with no direction entered: real shots, but no position -> left off the heat map (and said so)
    svg.querySelectorAll('[data-hd]').forEach(function (e) {
      var k = (e.getAttribute('data-kind') || '') + (e.getAttribute('data-class') || ''); if (/nodir/.test(k)) { noDir++; return; }
      var b = e.getBBox(); pts.push({ x: b.x + b.width / 2, y: b.y + b.height / 2, d: +e.getAttribute('data-hd') || 0, u: e.getAttribute('data-hu') || 'ft', fw: e.getAttribute('data-fw') });
    });
    var multi = view.mapScope === 'all' && savedRounds().length > 1, mode = view.heat === 'isl' ? 'grad' : view.heat || (multi || pts.length > 15 ? 'grad' : 'dots'), on = mode !== 'dots';
    var tg = document.createElement('div'); tg.className = 'seg heattog'; tg.id = 'heattog';
    tg.innerHTML = [['dots', 'Dots'], ['grad', 'Gradient']].map(function (b) { return '<button data-act="heat" data-v="' + b[0] + '" class="' + (mode === b[0] ? 'sel' : '') + '" aria-pressed="' + (mode === b[0]) + '"' + (pts.length || b[0] === 'dots' ? '' : ' disabled') + '>' + b[1] + '</button>'; }).join('');
    var anc = svg; while (anc.parentNode && anc.parentNode !== mv) anc = anc.parentNode;
    var slot = mv.querySelector('#heatslot'); if (slot) slot.appendChild(tg); else anc.parentNode.insertBefore(tg, anc); // v124: proximity page puts Dots / Gradient beside 'Hit from'
    if (on && pts.length) { var sl = document.createElement('div'); sl.className = 'heatclus'; sl.id = 'heatclus';
      var CL = heatClus(), U0 = pts.every(function (p) { return p.u === 'yd'; }) ? 'yd' : 'ft';
      sl.innerHTML = '<label for="clusr"><b>Cluster</b> <span>tight</span></label><input type="range" id="clusr" min="1" max="10" step="1" value="' + CL + '" aria-label="Cluster distance"><span>loose</span> <b id="clusv">' + CL + ' ' + U0 + '</b>';
      anc.parentNode.insertBefore(sl, anc.nextSibling); }
    if (!on || !pts.length) return;
    svg.classList.add('heat');
    var h = '<defs><filter id="hgoo" filterUnits="userSpaceOnUse" x="-2000" y="-2000" width="6000" height="6000"><feGaussianBlur in="SourceGraphic" stdDeviation="4.5" result="b"/><feColorMatrix in="b" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -9"/></filter></defs>';
    // blobs are drawn per island below (after islands are known)
    var VW = svg.viewBox.baseVal.width, VH = svg.viewBox.baseVal.height, CL = heatClus();
    var isl = heatIslandsReal(pts, heatReal(pts, C), CL), boxes = [], lone = 0, tagged = 0;
    if (mode === 'grad') { var GR = heatGradient(svg, pts, CL); h += GR.svg; isl = []; tagged = GR.peaks; }
    else {
    // one red ramp, light -> dark by the island's share of all shots; crisp thin border around each island (union of discs)
    var ramp = function (t) { var a = [253, 224, 218], b = [139, 0, 0]; return 'rgb(' + a.map(function (v, i) { return Math.round(v + (b[i] - v) * t); }).join(',') + ')'; };
    var maxShare = Math.max.apply(null, isl.map(function (g) { return g.length; })) / pts.length;
    isl.forEach(function (g) { var share = g.length / pts.length, t = maxShare > 0 ? Math.min(1, 0.15 + 0.85 * share / maxShare) : 1, col = ramp(t);
      h += '<g class="hisland" data-n="' + g.length + '" data-share="' + share.toFixed(3) + '" data-col="' + col + '">' +
        islandShape(g, col) + g.map(function (p) { return '<circle class="hblob" cx="' + f1(p.x) + '" cy="' + f1(p.y) + '" r="1.6" fill="#3a0000" fill-opacity="0"/>'; }).join('') + '</g>'; });
    lone = isl.filter(function (g) { return g.length === 1; }).length; tagged = isl.length - lone;
    isl.forEach(function (g, i) {
      if (g.length === 1 && tagged) { h += '<g class="island lone" data-n="1"></g>'; return; }
      var mx = g.reduce(function (a, p) { return a + p.x; }, 0) / g.length, my = g.reduce(function (a, p) { return a + p.y; }, 0) / g.length;
      var cp = g.reduce(function (b, p) { return Math.hypot(p.x - mx, p.y - my) < Math.hypot(b.x - mx, b.y - my) ? p : b; }, g[0]); // anchor on a real shot of the island
      h += heatTag('island', g.length, cp.x, cp.y, heatFmt(g) + ' · ' + g.length + (g.length === 1 ? ' shot' : ' shots'), boxes, VW, VH, svg.viewBox.baseVal.x, svg.viewBox.baseVal.y);
    });
    }
    // average finish (all plotted shots): pixel mean for the marker, real distances for the words
    var ax = 0, ay = 0, lr = 0, lg = 0, yd = pts.every(function (p) { return p.u === 'yd'; });
    pts.forEach(function (p) { ax += p.x; ay += p.y; var dx = p.x - C[0], dy = C[1] - p.y, L = Math.hypot(dx, dy) || 1, d = yd ? p.d : p.u === 'yd' ? p.d * 3 : p.d; lr += d * dx / L; lg += d * dy / L; });
    ax /= pts.length; ay /= pts.length; lr /= pts.length; lg /= pts.length;
    // putt-start map: putts start all around the cup, so their average POSITION cancels out near the hole -> no ⊕ there; report the mean distance instead
    var puttStart = view.map === 'putt';
    // ⊕ average POSITION only where shots lean one way (approach misses); where shots surround the hole it cancels out -> mean raw distance instead
    var avgPos = view.map === 'miss';
    var allM = [].slice.call(svg.querySelectorAll('[data-hd]')), ydAll = allM.every(function (e) { return e.getAttribute('data-hu') === 'yd'; }),
      meanD = allM.length ? allM.reduce(function (a, e) { var v = +e.getAttribute('data-hd') || 0; return a + (ydAll ? v : e.getAttribute('data-hu') === 'yd' ? v * 3 : v); }, 0) / allM.length : 0;
    var AVG_NAME = { gir: 'Average proximity', prox: 'Average proximity', pin: 'Average proximity', club: 'Average distance from the hole', pmiss: 'Average miss distance' };
    if (avgPos) h += '<g id="heatavg"><circle cx="' + f1(ax) + '" cy="' + f1(ay) + '" r="9" fill="none" stroke="#000" stroke-width="3"/><circle cx="' + f1(ax) + '" cy="' + f1(ay) + '" r="9" fill="none" stroke="#fff" stroke-width="1.2"/>' +
      '<path d="M' + f1(ax - 15) + ' ' + f1(ay) + ' h30 M' + f1(ax) + ' ' + f1(ay - 15) + ' v30" stroke="#000" stroke-width="2.4"/></g>';
    var g = document.createElementNS(NS, 'g'); g.setAttribute('id', 'heatlayer'); g.innerHTML = h; svg.appendChild(g);
    var d1 = svg.querySelector('#d1ring'); if (d1) svg.appendChild(d1); var cr = svg.querySelector('#clubrings'); if (cr) { var tag1 = [].filter.call(g.children, function (e) { return e.querySelector && e.querySelector(':scope > rect[rx="9"]'); })[0]; if (tag1) g.insertBefore(cr, tag1); else svg.appendChild(cr); } // v119: club yardage rings above the gradient, below its tags // benchmark ring stays above the heat
    var U = yd ? ' yd' : ' ft', part = function (v, a, b) { return Math.round(Math.abs(v)) ? Math.round(Math.abs(v)) + U + ' ' + (v > 0 ? a : b) : ''; };
    var words = [part(lg, 'long', 'short'), part(lr, 'right', 'left')].filter(Boolean).join(', ');
    var sm = document.createElement('p'); sm.className = 'heatsum'; sm.id = 'heatsum';
    var fwMap = view.map === 'fw', fwN = pts.filter(function (p) { return p.fw === '1'; }).length;
    sm.innerHTML = fwMap ? '<b>Tee shots on the heat map:</b> ' + pts.length + '.' : (puttStart ? '<b>Average ' + ({ '2': 'second-putt', '3': '3rd+ putt' }[view.puttN] || 'first-putt') + ' distance:</b> ' + (function () { var PL = puttData().list, m = PL.length ? PL.reduce(function (t, p) { return t + Number(p.ft); }, 0) / PL.length : 0; /* simple mean of the entered starting distances of every putt on this map */
        return (Math.round(m * 10) / 10) + ' ft · ' + PL.length + ' putt' + (PL.length === 1 ? '' : 's'); })() :
      (avgPos ? '<b>⊕ Average finish:</b> ' + (words ? words + ' of the hole' : 'centred on the hole') : '<b>' + (AVG_NAME[view.map] || 'Average distance') + ':</b> <span id="heatmean" data-v="' + (Math.round(meanD * 10) / 10) + '">' + Math.round(meanD) + (ydAll ? ' yd' : ' ft') + '</span>') + ' · ' + (avgPos ? pts.length : allM.length) + ' shot' + ((avgPos ? pts.length : allM.length) === 1 ? '' : 's')) + (mode === 'grad' ? (tagged ? (puttStart ? ' · ' : ' – ') + tagged + ' hot spot' + (tagged === 1 ? '' : 's') : '') : tagged > 1 || (tagged && lone) ? ' – ' + tagged + ' cluster' + (tagged === 1 ? '' : 's') + (lone ? ' + ' + lone + ' single shot' + (lone === 1 ? '' : 's') + ' (no tag)' : '') : '') + '.';
    if (noDir) { var what = view.map === 'gir' ? 'GIR' : view.map === 'fw' ? 'miss' : view.map === 'putt' ? 'putt' : 'shot', pl = noDir === 1 ? '' : (what === 'miss' ? 'es' : 's');
      sm.innerHTML = sm.innerHTML.replace(/\.$/, '') + ' <span id="heatnodir" data-n="' + noDir + '">(+ ' + noDir + ' ' + what + pl + ' with no ' + (view.map === 'fw' ? 'side' : 'direction') + ' entered – not on the heat map)</span>.'; }
    anc.parentNode.insertBefore(sm, anc.nextSibling);
    var lg2 = document.createElement('p'); lg2.className = 'help heatnote'; lg2.id = 'heatnote';
    lg2.innerHTML = mode === 'grad' && view.map === 'fw' ? '<span class="ramp rainbow" aria-hidden="true"></span> Gradient: where your tee shots (par 4s and 5s) finished – blue = a few, then green, yellow, red = most. The app records how far each drive went, where it finished (fairway, rough, bunker, hazard, trees, OB) and the side you missed – not the exact spot – so shots are placed by distance, lie and side: fairway hits in the fairway, rough just off it, bunkers / hazards / trees further out, OB at the white line (OB length is unknown, drawn at 250 yd). Misses with no side entered are left off the heat map. The row across the top gives the share of tee shots missed left, hit in the fairway and missed right (misses with no side entered count in the total only). Layup tee shots are left off this map and out of its percentages (they still count in your other stats). No ⊕: a left/right average would cancel out.' : mode === 'grad' ? '<span class="ramp rainbow" aria-hidden="true"></span> Gradient: a smooth density map of where the shots finished – clear = none, blue = a few, then green, yellow, red = most. One white tag per hot spot (average distance to the hole · shots in it). Cluster slider: tight = more, smaller hot spots; loose = fewer, wider ones. ' + (puttStart ? 'No ⊕ here: putts start all around the hole, so an average position would cancel out – the summary gives the average distance instead. ' : (avgPos ? '⊕ = average finish of all shots shown (which way your misses lean). ' : 'The average in the summary is the plain average distance from the hole of every shot – no ⊕ here, because shots all around the hole would average out to the middle. ')) + 'Shots with no direction entered are left out.' : '<span class="ramp" aria-hidden="true"></span> Islands: each island is shaded by its share of the shots – light = few, dark red = most. Each white tag is one cluster – shots within 3 ft of each other (3 yd off the green), clusters less than 2 ft apart merged – with its average distance to the hole · number of shots. Single, isolated shots get no tag. ⊕ = average finish of all shots shown. Shots with no direction entered are left out.';
    sm.parentNode.insertBefore(lg2, sm.nextSibling);
  }
  // ---------- Club performance (app only): everything from where the ball FINISHED (next row's distance + direction) ----------
  var DIR_LG = { long: 1, longleft: 1, longright: 1, short: -1, shortleft: -1, shortright: -1, left: 0, right: 0 };
  var DIR_LR = { left: -1, longleft: -1, shortleft: -1, right: 1, longright: 1, shortright: 1, long: 0, short: 0 };
  function clubShots(all) {
    var out = [];
    (all ? savedRounds() : [round()]).forEach(function (r) { r.holes.forEach(function (h, hi) {
      if (!h.rows) return; var a = SG.analyzeHole(h, 'pga'); if (!a.complete) return;
      a.shots.forEach(function (s) { if (!s.club) return;
        var holed = s.end.lie === 'holed', ob = s.ob, yd = holed ? 0 : s.end.lie === 'green' ? s.end.dist / 3 : s.end.dist, d = s.dir || '';
        var c = Math.SQRT1_2, diag = DIR_LG[d] && DIR_LR[d];
        out.push({ r: r, hole: hi + 1, s: s, club: s.club, holed: holed, ob: ob, yd: yd, dir: d, green: holed || s.end.lie === 'green',
          tee: s.cat === 'tee', lg: ob || !d || s.cat === 'tee' ? null : DIR_LG[d] * yd * (diag ? c : 1), lr: ob || !d || s.cat === 'tee' ? null : DIR_LR[d] * yd * (diag ? c : 1), sg: s.sg, layup: !!s.layup, cat: s.cat, par: Number(h.par),
          reg: !!(a.appr && a.appr.shot === s.n), gir: !!(a.appr && a.appr.shot === s.n && a.appr.gir), proxFt: a.appr && a.appr.shot === s.n ? a.appr.proxFt : null }); // v118: the hole's regulation approach (Proximity / GIR rule)
      });
    }); });
    return out;
  }
  function clubStats(list) {
    var dl = list.filter(function (x) { return x.lg != null; }), n = list.length, avg = function (k) { return dl.length ? dl.reduce(function (a, x) { return a + x[k]; }, 0) / dl.length : null; };
    var lg = avg('lg'), lr = avg('lr');
    return { n: n, lg: lg, lr: lr, nDir: dl.length, green: list.filter(function (x) { return x.green; }).length, ob: list.filter(function (x) { return x.ob; }).length,
      sg: list.reduce(function (a, x) { return a + (x.layup ? 0 : x.sg); }, 0), sgN: list.filter(function (x) { return !x.layup; }).length,
      bias: lg != null && Math.abs(lg) > 5 ? (lg > 0 ? 'long' : 'short') : '' };
  }
  function clubSVG(list) {
    var C = 180, CY = 200, pts = list.filter(function (x) { return !x.ob && !x.tee && (x.dir || x.holed); }), mx = Math.max(20, Math.max.apply(null, pts.map(function (x) { return x.yd * 3; }).concat([0])));
    // v120: the scale is in FEET – rings every 10 ft up to 60 ft; bigger spreads use 20 ft rings (to 120 ft), then 50 ft, so it never gets crowded. K = px per foot.
    var step = mx <= 60 ? 10 : mx <= 120 ? 20 : 50, max = Math.ceil(mx / step) * step, K = 160 / max, G = Math.max(6, 30 * K);
    var o = '<svg id="clubmap" viewBox="0 0 360 400" role="img" aria-label="Where shots with this club finished"><rect width="360" height="400" fill="#f6f8f4"/>' +
      '<circle cx="' + C + '" cy="' + CY + '" r="' + f1(Math.min(G, 160)) + '" fill="#e3f0dc" stroke="#8fae86" stroke-width="1.5"/><g id="clubrings">';
    // v119: yardage rings readable on a phone – 1.5px green-grey, inner rings dashed, the outer ring a solid edge; labels 11.5px with a soft halo
    for (var f = step; f <= max; f += step) o += '<circle class="cring" data-ft="' + f + '" cx="' + C + '" cy="' + CY + '" r="' + f1(f * K) + '" fill="none" stroke="#7f9a86" stroke-width="1.5"' + (f < max ? ' stroke-dasharray="5 4"' : '') + '/>';
    for (f = step; f <= max; f += step) o += '<text class="cringl" x="' + f1(C + f * K * 0.707 + 4) + '" y="' + f1(CY + f * K * 0.707 + 13) + '" font-size="11.5" font-weight="400" fill="#3f5246" stroke="#f6f8f4" stroke-width="3" stroke-linejoin="round" paint-order="stroke">' + f + ' ft</text>';
    o += '</g>';
    o += '<line x1="' + C + '" y1="' + CY + '" x2="' + C + '" y2="' + (CY - 24) + '" stroke="#2b3944" stroke-width="1"/><path d="M' + C + ' ' + (CY - 24) + ' l11 4 l-11 4z" fill="#c4574f"/><circle cx="' + C + '" cy="' + CY + '" r="3" fill="#2b3944"/>' +
      '<text x="180" y="16" text-anchor="middle" font-size="11" font-weight="400" fill="#4b5866">LONG ↑</text><text x="180" y="394" text-anchor="middle" font-size="11" font-weight="400" fill="#4b5866">SHORT ↓ (toward you)</text>' +
      '<text x="6" y="' + (CY - 6) + '" font-size="11" font-weight="400" fill="#4b5866">L</text><text x="354" y="' + (CY - 6) + '" text-anchor="end" font-size="11" font-weight="400" fill="#4b5866">R</text>';
    var seen = {};
    pts.forEach(function (x) {
      var k = x.dir + Math.round(x.yd), j = seen[k] = (seen[k] || 0) + 1, p = x.holed ? [C + (j - 1) * 8, CY] : pt(C, CY, Math.max(4, Math.min(x.yd * 3, max) * K), SG.DIR_ANGLE[x.dir] + (j - 1) * 7);
      var col = x.holed ? '#ffd23f' : x.green ? '#fff' : '#d0213a';
      o += '<circle class="cdot" data-hd="' + Math.round(x.yd * 3) + '" data-hu="ft" data-hole="' + x.hole + '" cx="' + f1(p[0]) + '" cy="' + f1(p[1]) + '" r="5" fill="' + col + '" stroke="#2b3944" stroke-width="1"/>';
    });
    return o + '</svg>';
  }
  // v118: tee shots on par 4 / 5 with this club, from the same list the fairway map uses (S.teeMap: finished holes; layups left out of the %)
  function clubTees(all, club) {
    var L = [];
    (all ? savedRounds() : [round()]).forEach(function (r) { SG.summarize(r, 'pga').teeMap.forEach(function (m) { if (m.club === club) L.push(m); }); });
    var lay = L.filter(function (m) { return m.layup; }).length; L = L.filter(function (m) { return !m.layup; });
    var hit = L.filter(function (m) { return m.fairway; }).length, miss = L.filter(function (m) { return !m.fairway; });
    var left = miss.filter(function (m) { return m.side === 'L'; }).length, right = miss.filter(function (m) { return m.side === 'R'; }).length;
    return { n: L.length, hit: hit, left: left, right: right, noSide: miss.length - left - right, ob: miss.filter(function (m) { return m.kind === 'ob'; }).length, layups: lay, list: L };
  }
  function clubDrives(list) { // same rule as fwDrives (no OB / penalty / layup, a measurable length) but for this club's tee shots
    var d = list.filter(function (m) { return !m.layup && m.kind !== 'ob' && !m.pen && m.hit != null && isFinite(m.hit) && m.hit > 0; }).map(function (m) { return Number(m.hit); });
    return { n: d.length, d: d, avg: d.length ? Math.round(d.reduce(function (a, b) { return a + b; }, 0) / d.length) : null, max: d.length ? Math.round(Math.max.apply(null, d)) : null, min: d.length ? Math.round(Math.min.apply(null, d)) : null };
  }
  // v118: drive distance box plot – box = middle half (25th–75th percentile, linear interpolation), line = median, whiskers = shortest / longest, ◇ = average
  function clubQuart(d) { var s2 = d.slice().sort(function (a, b) { return a - b; }); return function (p) { var i = (s2.length - 1) * p, k = Math.floor(i); return s2[k] + (s2[Math.min(k + 1, s2.length - 1)] - s2[k]) * (i - k); }; }
  // v125: the box / whiskers / median / ◇ average for one set of distances (shared by Club performance and the Stats drive chart).
  // X = value -> x, yT / yB = top / bottom of the box, pre = id prefix (clubdist -> #clubdistbox, #clubdistmed …), c = colours
  function boxShapes(d, X, yT, yB, pre, c) {
    c = c || { line: '#3b82c4', fill: 'rgba(59,130,196,.16)', med: '#2f6aa3', mean: '#23313d' };
    var q = clubQuart(d), lo = d.reduce(function (a, b) { return Math.min(a, b); }), hi = d.reduce(function (a, b) { return Math.max(a, b); }), mean = d.reduce(function (a, b) { return a + b; }, 0) / d.length;
    var q1 = q(0.25), med = q(0.5), q3 = q(0.75), yM = (yT + yB) / 2, r = Math.round, o = '';
    if (d.length === 1) o += '<line id="' + pre + 'one" data-v="' + r(lo) + '" x1="' + X(lo) + '" y1="' + yT + '" x2="' + X(lo) + '" y2="' + yB + '" stroke="' + c.line + '" stroke-width="1.5"/>';
    else o += '<line id="' + pre + 'wl" data-v="' + r(lo) + '" x1="' + X(lo) + '" y1="' + yM + '" x2="' + X(q1) + '" y2="' + yM + '" stroke="' + c.line + '" stroke-width="1"/>' +
      '<line id="' + pre + 'wr" data-v="' + r(hi) + '" x1="' + X(q3) + '" y1="' + yM + '" x2="' + X(hi) + '" y2="' + yM + '" stroke="' + c.line + '" stroke-width="1"/>' +
      '<line class="cdcap" x1="' + X(lo) + '" y1="' + (yT + 2) + '" x2="' + X(lo) + '" y2="' + (yB - 2) + '" stroke="' + c.line + '" stroke-width="1"/><line class="cdcap" x1="' + X(hi) + '" y1="' + (yT + 2) + '" x2="' + X(hi) + '" y2="' + (yB - 2) + '" stroke="' + c.line + '" stroke-width="1"/>' +
      '<rect id="' + pre + 'box" data-q1="' + r(q1) + '" data-q3="' + r(q3) + '" x="' + X(q1) + '" y="' + yT + '" width="' + Math.max(1, X(q3) - X(q1)).toFixed(1) + '" height="' + (yB - yT) + '" fill="' + c.fill + '" stroke="' + c.line + '" stroke-width="1"/>' +
      '<line id="' + pre + 'med" data-v="' + r(med) + '" x1="' + X(med) + '" y1="' + yT + '" x2="' + X(med) + '" y2="' + yB + '" stroke="' + c.med + '" stroke-width="1.5"/>';
    var mx = +X(mean);
    return o + '<path id="' + pre + 'mean" data-v="' + r(mean) + '" d="M' + mx.toFixed(1) + ' ' + (yM - 4.5) + 'l4.5 4.5-4.5 4.5-4.5-4.5z" fill="#fff" stroke="' + c.mean + '" stroke-width="1"/>';
  }
  function clubDistCard(V, club, all) {
    var h = '<div class="clubcard" id="clubdistcard"><div class="cch"><span>' + (club === 'Driver' ? 'Drive distance' : esc(club) + ' off the tee') + tipBtn('clubdist', 'i', 'About this graph') + '</span><span class="ccv" id="clubdistn">' + (V.n ? 'n = ' + V.n : '') + '</span></div>' +
      tipText('clubdist', 'Every ' + esc(club) + ' tee shot on a par 4 or 5' + (all ? ' (all rounds)' : ' (this round)') + ': hole length minus the distance left for the next shot – the same drives as the Avg drive tile (OB, penalty and layup tee shots left out). ' +
        '<b>Box</b> = the middle half of the drives (25th to 75th percentile). <b>Line in the box</b> = median (half longer, half shorter). <b>Whiskers</b> = shortest and longest drive. <b>◇</b> = average. ' +
        'Percentiles use straight-line interpolation between drives; with fewer than 5 drives the box is only a rough guide' + (V.n === 1 ? ', and one drive is shown as a single line' : '') + '.');
    if (!V.n) return h + '<p class="ccnote" id="clubdistnone">–</p></div>';
    var q = clubQuart(V.d), lo = V.d.reduce(function (a, b) { return Math.min(a, b); }), hi = V.d.reduce(function (a, b) { return Math.max(a, b); }), mean = V.d.reduce(function (a, b) { return a + b; }, 0) / V.n;
    var q1 = q(0.25), med = q(0.5), q3 = q(0.75), span = Math.max(hi - lo, 10), step = span <= 35 ? 5 : span <= 90 ? 10 : span <= 180 ? 20 : 50;
    var a0 = Math.floor((lo - (hi - lo < 10 ? (10 - (hi - lo)) / 2 : 0)) / step) * step, a1 = Math.ceil((hi + (hi - lo < 10 ? (10 - (hi - lo)) / 2 : 0)) / step) * step; if (a1 === a0) a1 = a0 + step;
    var W = 358, x0 = 18, x1 = 340, yT = 10, yB = 50, yM = 30, X = function (v) { return (x0 + (v - a0) / (a1 - a0) * (x1 - x0)).toFixed(1); }, r = Math.round;
    var o = '<svg class="clubdist" id="clubdist" viewBox="0 0 ' + W + ' 92" width="100%" role="img" aria-label="' + esc(club) + ' distances: shortest ' + r(lo) + ', 25th percentile ' + r(q1) + ', median ' + r(med) + ', 75th percentile ' + r(q3) + ', longest ' + r(hi) + ', average ' + r(mean) + ' yards">';
    for (var t = a0; t <= a1 + 1e-9; t += step) o += '<line class="cdg" x1="' + X(t) + '" y1="2" x2="' + X(t) + '" y2="' + (yB + 8) + '" stroke="#e6eaee" stroke-width="1"/><text class="cdt" x="' + X(t) + '" y="' + (yB + 21) + '" text-anchor="middle">' + t + '</text>';
    o += '<line x1="' + x0 + '" y1="' + (yB + 8) + '" x2="' + x1 + '" y2="' + (yB + 8) + '" stroke="#b9c3cc" stroke-width="1"/>';
    o += boxShapes(V.d, X, yT, yB, 'clubdist');
    o += '<text class="cdax" x="' + ((x0 + x1) / 2) + '" y="' + (yB + 38) + '" text-anchor="middle">Yards</text></svg>';
    var sum = V.n === 1 ? '1 drive · ' + r(lo) + ' yd' : 'min ' + r(lo) + ' · median ' + r(med) + ' · avg ' + r(mean) + ' · max ' + r(hi) + ' yd';
    return h + o + '<p class="ccnote clubdistsum" id="clubdistsum">' + sum + '</p></div>';
  }
  function pctOf(k, n) { return n ? Math.round(100 * k / n) : null; }
  // Quick-view style tiles (the same look as the round's Quick view)
  function clubQV(id, lbl, val, sub, em, emCls) {
    return '<div class="qv" data-q="' + id + '"><span class="qvl">' + lbl + '</span><b>' + val + '</b><small>' + sub + '</small>' + (em != null ? '<em class="qvsg ' + (emCls || '') + '">' + em + '</em>' : '') + '</div>';
  }
  // v118: clean top-down fairway – left rough · fairway · right rough, each with its share of the tee shots (thin lines, light tints, exact numbers)
  function clubFairwaySVG(T) {
    var W = 358, H = 214, x0 = 8, x1 = 112, x2 = 246, x3 = 350, y0 = 26, y1 = 176;
    var reg = [['L', 'Left rough', x0, x1, T.left, '#f3f5f0'], ['F', 'Fairway', x1, x2, T.hit, '#e3f0dc'], ['R', 'Right rough', x2, x3, T.right, '#f3f5f0']];
    var s = '<svg class="clubfw" id="clubfw" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc('Tee shots: left rough ' + pctOf(T.left, T.n) + '%, fairway ' + pctOf(T.hit, T.n) + '%, right rough ' + pctOf(T.right, T.n) + '%') + '">';
    reg.forEach(function (g) { var cx = (g[2] + g[3]) / 2, p = pctOf(g[4], T.n);
      s += '<rect class="cfwreg" data-reg="' + g[0] + '" data-n="' + g[4] + '" data-pct="' + p + '" x="' + g[2] + '" y="' + y0 + '" width="' + (g[3] - g[2]) + '" height="' + (y1 - y0) + '" fill="' + g[5] + '"' + (g[0] === 'F' ? ' rx="0"' : '') + '/>' +
        '<text class="cfwh" x="' + cx + '" y="' + (y0 - 9) + '" text-anchor="middle">' + g[1] + '</text>' +
        '<text class="cfwp" id="cfwp' + g[0] + '" x="' + cx + '" y="' + (y0 + 70) + '" text-anchor="middle">' + p + '%</text>' +
        '<text class="cfwn" x="' + cx + '" y="' + (y0 + 90) + '" text-anchor="middle">' + g[4] + ' of ' + T.n + '</text>'; });
    // fairway edges + a faint centre line; the tee at the bottom
    s += '<rect x="' + x0 + '" y="' + y0 + '" width="' + (x3 - x0) + '" height="' + (y1 - y0) + '" fill="none" stroke="#a9b8a6" stroke-width="1.25"/>' +
      '<line class="cfwedge" x1="' + x1 + '" x2="' + x1 + '" y1="' + y0 + '" y2="' + y1 + '"/><line class="cfwedge" x1="' + x2 + '" x2="' + x2 + '" y1="' + y0 + '" y2="' + y1 + '"/>' +
      '<line x1="' + ((x1 + x2) / 2) + '" x2="' + ((x1 + x2) / 2) + '" y1="' + (y0 + 104) + '" y2="' + y1 + '" stroke="#98b38f" stroke-width="1.25" stroke-dasharray="4 4"/>' +
      '<circle cx="' + ((x1 + x2) / 2) + '" cy="' + (y1 + 14) + '" r="3" fill="#fff" stroke="#7d8b96" stroke-width="1"/><text class="cfwn" x="' + ((x1 + x2) / 2 + 9) + '" y="' + (y1 + 17.5) + '">tee</text>' +
      '<text class="cfwn" x="' + x0 + '" y="' + (H - 4) + '">' + (T.noSide ? T.noSide + ' missed with no side entered (not in left / right)' : '') + '</text>';
    return s + '</svg>';
  }
  function clubFairwayCard(T, club, all) {
    var h = '<div class="clubcard" id="clubfwcard"><div class="cch"><span>' + esc(club) + ' off the tee' + tipBtn('clubfw', 'i', 'About this picture') + '</span><span class="ccv" id="clubfwv">' + (T.n ? 'n = ' + T.n + (T.layups ? ' · ' + T.layups + ' layup' + (T.layups === 1 ? '' : 's') + ' out' : '') : '') + '</span></div>' +
      tipText('clubfw', 'Every ' + esc(club) + ' tee shot on a par 4 or 5' + (all ? ' in all rounds' : ' this round') + ' (finished holes). Layup tee shots are left out. Fairway = finished on the fairway or green with no penalty – the same rule as Fairways hit and Tee misses L / R on the round. Left / right comes from the Dir entered on the next shot' +
        (T.ob ? '; ' + T.ob + ' OB counted on its side' : '') + (T.noSide ? '; ' + T.noSide + ' miss' + (T.noSide === 1 ? '' : 'es') + ' with no side entered are in n but not in left / right' : '') + '.');
    if (!T.n) return h + '<p class="ccnote" id="clubfwnone">No tee shots on par 4s or 5s ' + (all ? 'yet' : 'this round') + '</p></div>';
    return h + clubFairwaySVG(T) + '</div>';
  }
  // v118: which tiles a club gets – by the bag's grouping (Driver / woods / hybrids + irons incl. PW, GW / wedges / putter)
  function clubKind(code) {
    var c = String(code), b = (bag().clubs || []).filter(function (x) { return String(x.code).toLowerCase() === c.toLowerCase(); })[0], cat = b && b.cat;
    if (/^driver$/i.test(c) || cat === 'd') return 'driver';
    if (/^\d+W$/i.test(c) || cat === 'fw') return 'wood';
    if (/^\d+[Hi]$/i.test(c) || /^(PW|GW)$/i.test(c) || cat === 'hy' || cat === 'ir') return 'iron';
    if (/^putter$/i.test(c) || cat === 'pt') return 'putter';
    return 'wedge';
  }
  function fmtProx(ft) { return ft == null ? '–' : ft >= 90 ? Math.round(ft / 3) + '<i class="qvu"> yd</i>' : Math.round(ft) + '<i class="qvu"> ft</i>'; }
  function clubHTML(all) {
    var L = clubShots(all), by = {}; L.forEach(function (x) { (by[x.club] = by[x.club] || []).push(x); });
    var B0 = BAG.pickerClubs(bag()).map(function (c) { return c.code; }), base = B0.length ? B0 : SG.CLUBS, order = base.concat(Object.keys(by).filter(function (c) { return base.indexOf(c) < 0; }).sort(function (a, b) { return BAG.rank(a) - BAG.rank(b); }));
    var used = order.filter(function (c) { return by[c]; });
    if (!used.length) return '<p class="clubempty" id="clubnone">No clubs entered yet' + (all ? '' : ' this round') + tipBtn('clubnone', 'i', 'How to add clubs') + '</p>' + tipText('clubnone', 'Pick a club under each shot when entering a hole, then come back here.');
    var cur = view.club && by[view.club] ? view.club : used.slice().sort(function (a, b) { return by[b].length - by[a].length; })[0], list = by[cur], st = clubStats(list), kind = clubKind(cur);
    var fmtD = function (v, a, b) { return v == null ? '–' : Math.abs(v * 3) < 0.5 ? 'on line' : Math.round(Math.abs(v * 3)) + ' ft ' + (v > 0 ? a : b); }; // v120: finish vs the pin in feet (st.lg / st.lr are yards)
    var pl = function (n, w) { return n + ' ' + w + (n === 1 ? '' : 's'); };
    var o = '<div class="seg clubbtns" id="clubbtns">' + order.map(function (c) { var n = by[c] ? by[c].length : 0;
      return '<button data-act="clubsel" data-v="' + esc(c) + '" class="' + (c === cur ? 'sel' : '') + '"' + (n ? '' : ' disabled') + ' aria-pressed="' + (c === cur) + '">' + esc(c) + (n ? '<small> ' + n + '</small>' : '') + '</button>'; }).join('') + '</div>';
    var tees = list.filter(function (x) { return x.tee; }), T = clubTees(all, cur), tips = [];
    var sgAll = clubQV('sg', 'Strokes gained', st.sgN ? '<span class="' + sgCls(st.sg) + '">' + fmtSG(st.sg) + '</span>' : '–', st.sgN ? fmtSG(st.sg / st.sgN) + ' per shot' : 'no shots counted', pl(st.sgN, 'shot'));
    var tilesH = '';
    if (kind === 'driver' || kind === 'wood') {
      var fwT = clubQV('fw', 'Fairways hit', T.n ? pctOf(T.hit, T.n) + '%' : '–', T.n ? T.hit + ' / ' + T.n + ' hit' : 'no tee shots', T.n ? 'L ' + T.left + ' · R ' + T.right : 'n = 0');
      if (kind === 'driver') { var V = clubDrives(T.list);
        tilesH = fwT + sgAll + clubQV('drive', 'Avg drive', V.n ? V.avg + '<i class="qvu"> yd</i>' : '–', V.n ? 'longest ' + V.max + ' yd' : 'no distances', V.n ? 'n = ' + V.n : null);
        tips.push('<b>Avg drive</b> = hole length minus the distance left for the next shot (no OB, penalty or layup tee shots).');
      } else { var fromFw = list.length - tees.length;
        tilesH = fwT + sgAll + clubQV('use', 'Shots', st.n, tees.length + ' off the tee', fromFw + ' from fairway / other'); }
      tips.unshift('<b>Fairways hit</b> counts only tee shots with ' + esc(cur) + ' on par 4s and 5s (layups left out), the same rule as the round’s Fairways hit. <b>Strokes gained</b> = every ' + esc(cur) + ' shot vs the PGA Tour baseline (layups count 0).');
    } else if (kind === 'iron') {
      var A = list.filter(function (x) { return x.reg && !x.tee && !x.layup && x.s.start.lie !== 'green' && x.cat === 'approach'; }), g = A.filter(function (x) { return x.gir; }).length;
      var P = A.filter(function (x) { return x.proxFt != null; }), pAvg = P.length ? P.reduce(function (t, x) { return t + x.proxFt; }, 0) / P.length : null;
      var AP = list.filter(function (x) { return x.cat === 'approach' && !x.layup; }), aSG = AP.reduce(function (t, x) { return t + x.sg; }, 0);
      var fromY = A.length ? Math.round(A.reduce(function (t, x) { return t + x.s.start.dist; }, 0) / A.length) : null;
      tilesH = clubQV('gir', 'GIR', A.length ? pctOf(g, A.length) + '%' : '–', A.length ? g + ' / ' + A.length + ' greens' : 'no approaches', 'n = ' + A.length) +
        clubQV('sg', 'SG approach', AP.length ? '<span class="' + sgCls(aSG) + '">' + fmtSG(aSG) + '</span>' : '–', AP.length ? fmtSG(aSG / AP.length) + ' per shot' : 'no approach shots', pl(AP.length, 'shot')) +
        clubQV('prox', 'Proximity', fmtProx(pAvg), P.length ? 'avg to the pin' : 'no approaches', fromY != null ? 'from ' + fromY + ' yd avg' : null);
      tips.push('<b>GIR</b> and <b>Proximity</b> use only the hole’s real approach – the shot that could reach the green in regulation (a par-3 tee shot, the 2nd on a par 4, the 2nd or 3rd on a par 5) – when it was hit with ' + esc(cur) + '. Not tee shots on par 4/5, layups, chips from 30 yd and in or shots from the green. Proximity = distance to the pin after the shot (first-putt length on the green; yards × 3 off it; OB left out). <b>SG approach</b> = every ' + esc(cur) + ' shot in the Approach category vs the PGA Tour baseline.' +
        (tees.length ? ' ' + pl(tees.length, 'tee shot') + ' on par 4/5 with ' + esc(cur) + ' are in the shot list but not in these tiles.' : ''));
    } else {
      tilesH = sgAll + clubQV('n', 'Shots', st.n, all ? 'all rounds' : 'this round', null) +
        clubQV('green', 'On the green', st.n ? Math.round(st.green / st.n * 100) + '%' : '–', st.green + ' / ' + st.n + ' shots', null);
      tips.push('<b>Strokes gained</b> = every ' + esc(cur) + ' shot vs the PGA Tour baseline. <b>On the green</b> = shots that finished on the green or in the hole.');
    }
    o += '<div class="mapsum clubsum" id="mapsum"><span><b id="clubcur">' + esc(cur) + '</b> · <b>' + st.n + '</b> shot' + (st.n === 1 ? '' : 's') + (all ? ' in all rounds' : ' this round') + '</span>' + tipBtn('clubtiles', 'i', 'About these numbers') + '</div>' +
      tipText('clubtiles', tips.join(' ')) + '<div class="quickview clubqv" id="clubqv" data-kind="' + kind + '">' + tilesH + '</div>';
    if (kind === 'driver' || (kind === 'wood' && T.n)) { var VD = clubDrives(T.list); if (kind === 'driver' || VD.n) o += clubDistCard(VD, cur, all); o += clubFairwayCard(T, cur, all); }
    if (st.bias) o += '<p class="warnmsg clubwarn" id="clubbias">' + esc(cur) + ' finishes <b>' + Math.round(Math.abs(st.lg)) + ' yd ' + st.bias + '</b> on average' + tipBtn('clubbias', 'i', 'What to do') + '</p>' +
      tipText('clubbias', st.bias === 'short' ? 'Consider clubbing up or checking your yardage for it.' : 'Consider clubbing down for it.');
    if (tees.length < list.length) {
      o += '<div class="clubcard" id="clubdisp"><div class="cch"><span>Finish vs the pin' + tipBtn('clubdisp', 'i', 'About this picture') + '</span><span class="ccv">n = ' + (list.length - tees.length) + '</span></div>' +
        tipText('clubdisp', 'Rings = feet from the hole (every 10 ft; 20 ft rings when shots finish further than 60 ft away); the light green circle is about the size of a green (30 ft); points use the distance left and direction you entered on the next shot. White = finished on the green, red = off the green, yellow = holed.' + (tees.length ? ' Tee shots on par 4/5 are judged by the fairway, not the pin, so they are not drawn here.' : '') +
          (st.ob ? ' ' + st.ob + ' OB shot(s) not drawn.' : '') + (st.n - st.nDir - st.ob - tees.length > 0 ? ' ' + (st.n - st.nDir - st.ob - tees.length) + ' shot(s) with no direction are not drawn / not in the averages.' : '')) +
        clubSVG(list) + '<div class="stat-grid" id="clubcells">' + stat('Avg short / long', fmtD(st.lg, 'long', 'short')) + stat('Avg left / right', fmtD(st.lr, 'right', 'left')) + '</div></div>';
    }
    if (tees.length) o += '<span id="clubtee" hidden data-n="' + tees.length + '">' + pl(tees.length, 'tee shot') + ' on par 4/5</span>';
    o += '<h3>Shots with ' + esc(cur) + '</h3><table id="clubshots" class="clubtab"><tr><th>Hole</th><th>From</th><th>Finished</th><th class="num">SG</th></tr>' + list.map(function (x) {
      var fin = x.holed ? 'holed' : x.ob ? 'OB' : (x.s.end.lie === 'green' ? Math.round(x.s.end.dist) + ' ft' : Math.round(x.s.end.dist) + ' yd') + (x.dir ? ' ' + SG.DIR_NAME[x.dir].toLowerCase() : '') + (x.s.end.lie !== 'green' ? ' · ' + (LIE_NAME[x.s.end.lie] || x.s.end.lie) : ' · green');
      return '<tr><td>' + (all ? localDate(x.r.date).slice(5) + ' #' : '#') + x.hole + '</td><td>' + Math.round(x.s.start.dist) + ' yd ' + (LIE_NAME[x.s.start.lie] || (x.s.start.lie === 'tee' ? 'tee' : x.s.start.lie)) + '</td><td>' + esc(fin) + '</td><td class="num ' + sgCls(x.sg) + '">' + (x.layup ? 'layup' : fmtSG(x.sg)) + '</td></tr>'; }).join('') + '</table>';
    var rank = used.map(function (c) { var s2 = clubStats(by[c]); return { c: c, s: s2 }; }).filter(function (x) { return x.s.sgN; }).sort(function (a, b) { return b.s.sg / b.s.sgN - a.s.sg / a.s.sgN; });
    o += '<h3 class="clubh3">Strokes gained by club' + tipBtn('clubrank', 'i', 'About this table') + '</h3>' + tipText('clubrank', 'Best club per shot at the top (vs PGA Tour baseline). Layup tee shots are not in SG. Bias ⚠ = finishes more than 5 yd short or long on average (from the distance + direction of the next shot; straight left/right counts as pin high). Tap a row to see that club.') + '<table id="clubrank" class="clubtab"><tr><th>#</th><th>Club</th><th class="num">Shots</th><th class="num">SG/shot</th><th class="num">Total</th><th>Bias</th></tr>' + rank.map(function (x, i) {
      return '<tr data-act="clubsel" data-v="' + esc(x.c) + '" class="' + (x.c === cur ? 'cur' : '') + '"><td>' + (i + 1) + '</td><td><b>' + esc(x.c) + '</b></td><td class="num">' + x.s.sgN + '</td><td class="num ' + sgCls(x.s.sg) + '">' + fmtSG(x.s.sg / x.s.sgN) + '</td><td class="num ' + sgCls(x.s.sg) + '">' + fmtSG(x.s.sg) + '</td><td>' + (x.s.bias ? '⚠ ' + Math.round(Math.abs(x.s.lg)) + ' yd ' + x.s.bias : '') + '</td></tr>'; }).join('') + '</table>';

    return o;
  }
  // ---------- Best vs worst rounds (app only) ----------
  var CMP_KINDS = [['prox', 'Proximity'], ['gir', 'GIR'], ['miss', 'Misses'], ['putt', '1st putts']];
  function cmpRounds() {
    var L = rounds.filter(function (r) { return !SG.roundEmpty(r); }).map(function (r) { var S = SG.summarize(r, 'pga'); return { r: r, S: S, rel: S.holesDone ? S.toPar / S.holesDone * 18 : null }; })
      .filter(function (x) { return x.rel != null; }).sort(function (a, b) { return a.rel - b.rel || (a.S.strokes - b.S.strokes); });
    var maxN = Math.floor(L.length / 2), n = Math.max(1, Math.min(view.cmpN || 3, maxN));
    return { all: L, n: n, maxN: maxN, best: L.slice(0, n), worst: L.slice(L.length - n).reverse() };
  }
  // same yardage as the round's proximity rail: rounded to the nearest 10 yd (e.g. 97 yd shows as 100 -> 100-130 group)
  function cmpBucket(yd) { return SG.apprBucket(SG.roundYd(yd)); }
  function cmpList(set, kind, grp) {
    var out = [];
    set.forEach(function (x) { var S = x.S;
      (kind === 'gir' ? S.girMap : kind === 'miss' ? S.apprMiss : kind === 'putt' ? S.puttList.filter(function (p) { return p.n === 1; }) : S.proxList.filter(function (m) { return !grp || cmpBucket(m.from) === grp; }))
        .forEach(function (m) { out.push(m); }); });
    return out;
  }
  function cmpSVG(kind, list, grp) {
    var s = kind === 'gir' ? girSVG(list) : kind === 'miss' ? missSVG(list) : kind === 'putt' ? puttSVG(list, '1') : proxSVG(list, grp ? grpMid(grp) : null);
    return s.replace(/<svg id="[a-z]+"/, '<svg data-kind="' + kind + '"');
  }
  function cmpAgg(set) {
    var b = {}, keys = SG.APPR_BUCKETS.map(function (x) { return x.id; }).concat([SG.SHORT_BUCKET, '0-5 ft', '5-15 ft', '15-30 ft', '30+ ft']);
    keys.forEach(function (k) { b[k] = { n: 0, sg: 0, pS: 0, pN: 0, gir: 0, girN: 0 }; });
    set.forEach(function (x) { keys.forEach(function (k) { var B = x.S.buckets[k]; if (!B) return; b[k].n += B.n; b[k].sg += B.sg; b[k].pS += B.proxSum; b[k].pN += B.proxN; });
      x.S.proxList.forEach(function (m) { var k = cmpBucket(m.from); if (b[k]) { b[k].girN++; if (m.hit) b[k].gir++; } }); });
    return { b: b, keys: keys, n: set.length };
  }
  var CMP_CATS = [['tee', 'Off the tee'], ['approach', 'Approach'], ['short', 'Around green'], ['putting', 'Putting']];
  function cmpAvg(L, f) { return L.length ? L.reduce(function (a, x) { return a + f(x); }, 0) / L.length : 0; }
  // v136: four category tiles – strokes gained per round, worst minus best (minus = what the worst rounds lose there); the biggest loss is highlighted
  function cmpCatHTML(C) {
    var gaps = CMP_CATS.map(function (c) { var b = cmpAvg(C.best, function (x) { return x.S.cats[c[0]].sg; }), w = cmpAvg(C.worst, function (x) { return x.S.cats[c[0]].sg; }); return { id: c[0], name: c[1], b: b, w: w, d: w - b }; });
    var low = gaps.slice().sort(function (x, y) { return x.d - y.d; })[0], diff = cmpAvg(C.worst, function (x) { return x.S.strokes; }) - cmpAvg(C.best, function (x) { return x.S.strokes; });
    var lead = Math.round(diff) > 0 ? 'Worst rounds average <b>' + Math.round(diff) + ' more stroke' + (Math.round(diff) === 1 ? '' : 's') + '</b>.' + (low.d < -0.05 ? ' Biggest loss: <b>' + low.name + '</b>.' : '') : 'Best and worst rounds score about the same.';
    return '<div class="frostcard cmpsum"><h3 class="cmph">Where the strokes go <small class="cmppr">per round</small>' + tipBtn('cmpcats', 'i', 'About these numbers') + '</h3>' +
      tipText('cmpcats', 'Strokes gained per round vs PGA Tour, worst rounds minus best rounds. Minus (red) = strokes your worst rounds lose there; the biggest is outlined. Small numbers: best · worst on their own.') +
      '<p class="cmplead" id="cmplead">' + lead + '</p><div class="cmpqv" id="cmpqv">' + gaps.map(function (g) {
        return '<div class="qv' + (g === low && g.d < -0.05 ? ' big' : '') + '" data-q="' + g.id + '"><span class="qvl">' + g.name + '</span><b class="' + sgCls(g.d) + '">' + fmtSG(g.d) + '</b><small>' + fmtSG(g.b) + ' · ' + fmtSG(g.w) + '</small></div>'; }).join('') + '</div></div>';
  }
  function cmpGapHTML(C) {
    // v136: From · Best · Worst · Diff (worst minus best); one SG number per cell, approach rows add a small "13′ · 100%" (avg ft · GIR) line
    var B = cmpAgg(C.best), W = cmpAgg(C.worst), pr = function (x) { return x.pN ? Math.round(x.pS / x.pN) + '’' : '–'; }, gp = function (x) { return x.girN ? Math.round(x.gir / x.girN * 100) + '%' : '–'; };
    var o = '<div class="frostcard cmpdist"><h3 class="cmph">By distance <small class="cmppr">per round</small>' + tipBtn('cmpdist', 'i', 'About this table') + '</h3>' +
      tipText('cmpdist', '<b>Best / Worst</b> = strokes gained per round from that distance vs PGA Tour. Approach rows also show how far from the hole the approaches finished (feet) and greens hit. <b>Diff</b> = worst minus best: red is where your bad rounds lose strokes.') +
      '<table id="gaptable" class="gapt2"><colgroup><col class="c-from"><col class="c-b"><col class="c-w"><col class="c-gap"></colgroup>' +
      '<thead><tr><th class="from">From</th><th class="gb" id="gapbesthead">Best</th><th class="gw" id="gapworsthead">Worst</th><th class="gap">Diff</th></tr></thead><tbody>';
    var secs = [['Approach · yd', SG.APPR_BUCKETS.map(function (x) { return x.id; })], ['Around green · yd', [SG.SHORT_BUCKET]], ['Putting · 1st putt', ['0-5 ft', '5-15 ft', '15-30 ft', '30+ ft']]];
    secs.forEach(function (sec) {
      var rows = sec[1].filter(function (k) { return B.b[k] && (B.b[k].n || W.b[k].n); }); if (!rows.length) return;
      var ap = sec === secs[0];
      o += '<tr class="gsec"><td colspan="4">' + sec[0] + '</td></tr>';
      rows.forEach(function (k) { var b = B.b[k], w = W.b[k], sb = b.sg / B.n, sw = w.sg / W.n, d = sw - sb;
        var cell = function (cls, sg, x) { return '<td class="' + cls + '"><b class="' + sgCls(sg) + '">' + fmtSG(sg) + '</b>' + (ap ? '<small>' + pr(x) + ' · ' + gp(x) + '</small>' : '') + '</td>'; };
        o += '<tr data-bucket="' + k + '"><td class="from">' + (/ ft$/.test(k) ? k.replace(/ ft$/, '').replace('-', '–').replace(/(\d)(\+?)$/, '$1’$2') : k.replace(/ yd$/, '').replace('-', '–')) + '</td>' + cell('gb', sb, b) + cell('gw', sw, w) +
          '<td class="gap ' + sgCls(d) + '"><b>' + fmtSG(d) + '</b></td></tr>'; });
    });
    return o + '</tbody></table></div>';
  }
  function compareHTML2() {
    var C = cmpRounds(), kind = view.cmpKind || 'prox', side = view.cmpSide === 'worst' ? 'worst' : 'best';
    var h = '<div class="frostpage theme-sky cmppage" id="cmppage"><div class="topbar frost"><button class="txt frostbtn" data-act="history">‹ Rounds</button><div class="title"><b>Best vs worst</b><span>by score vs par</span></div><span class="tbspace"></span></div>';
    if (C.maxN < 1) return h + '<p class="notice" id="cmpnone">You need at least 2 rounds with finished holes to compare.</p></div>';
    h += '<div class="cmpn" id="cmpn"><button data-act="cmpn" data-v="-1"' + (C.n <= 1 ? ' disabled' : '') + ' aria-label="Fewer rounds">−</button><span>Best <b>' + C.n + '</b> vs worst <b>' + C.n + '</b> round' + (C.n === 1 ? '' : 's') + '</span><button data-act="cmpn" data-v="1"' + (C.n >= C.maxN ? ' disabled' : '') + ' aria-label="More rounds">+</button></div>';
    var line = function (x) { return '<li><span class="cl-d">' + esc(new Date(x.r.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })) + '</span><span class="cl-c">' + esc(x.r.course || 'Round') + (x.S.holesDone < 18 ? ' · ' + x.S.holesDone + ' holes' : '') + '</span><span class="cl-s"><b>' + x.S.strokes + '</b> ' + toPar(x.S.toPar) + '</span></li>'; };
    var avgS = function (L) { return Math.round(cmpAvg(L, function (x) { return x.S.strokes; })); };
    h += '<div class="cmpcols"><div class="cmpcard gbcard"><h3>Best<small>avg ' + avgS(C.best) + '</small></h3><ul class="cmplist" id="cmpbest">' + C.best.map(line).join('') + '</ul></div>' +
      '<div class="cmpcard gwcard"><h3>Worst<small>avg ' + avgS(C.worst) + '</small></h3><ul class="cmplist" id="cmpworst">' + C.worst.map(line).join('') + '</ul></div></div>';
    h += cmpCatHTML(C) + cmpGapHTML(C);
    // Maps: one full-width map, Best / Worst switch (same scale for both)
    h += '<div class="frostcard cmpmapcard"><h3 class="cmph">Maps</h3><div class="bzseg cmpkinds" id="cmpkinds">' + CMP_KINDS.map(function (k) { return '<button data-act="cmpkind" data-v="' + k[0] + '" class="' + (k[0] === kind ? 'sel' : '') + '">' + k[1] + '</button>'; }).join('') + '</div>';
    var grp = null;
    if (kind === 'prox') { var all = cmpList(C.best.concat(C.worst), 'prox'), cnt = {}; all.forEach(function (m) { var k = cmpBucket(m.from); cnt[k] = (cnt[k] || 0) + 1; });
      grp = view.cmpGrp && cnt[view.cmpGrp] ? view.cmpGrp : SG.APPR_BUCKETS.map(function (x) { return x.id; }).filter(function (k) { return cnt[k]; }).sort(function (a, b) { return cnt[b] - cnt[a]; })[0] || null;
      h += '<div class="cmpgrps" id="cmpgrps">' + SG.APPR_BUCKETS.map(function (x) { return '<button data-act="cmpgrp" data-v="' + x.id + '" class="' + (x.id === grp ? 'sel' : '') + '"' + (cnt[x.id] ? '' : ' disabled') + '>' + x.id.replace(' yd', '') + '<small>' + (cnt[x.id] || 0) + '</small></button>'; }).join('') + '</div>'; }
    var lb = cmpList(C.best, kind, grp), lw = cmpList(C.worst, kind, grp), L = side === 'best' ? lb : lw;
    h += '<div class="bzseg cmpside" id="cmpside"><button data-act="cmpside" data-v="best" class="' + (side === 'best' ? 'sel' : '') + '">Best rounds · ' + lb.length + '</button><button data-act="cmpside" data-v="worst" class="' + (side === 'worst' ? 'sel' : '') + '">Worst rounds · ' + lw.length + '</button></div>' +
      '<div class="cmpmap ' + (side === 'best' ? 'cmpbest' : 'cmpworst') + '" id="cmpmap">' + cmpSVG(kind, L, grp) + '</div></div>';
    return h + '</div>';
  }
  // ---------- Hole replay (app only): bird's-eye drawing of one hole with every shot chained ----------
  var RPC = { tee: '#1565e0', approach: '#6a1b9a', short: '#ef6c00', putting: '#fff' };
  var RPN = { tee: 'Tee shot', approach: 'Approach', short: 'Short game', putting: 'Putt' };
  function replaySVG(h, hi) {
    var A = SG.analyzeHole(h, 'pga'), shots = A.shots || [], yd = Number(SG.holeYards(h)) || Number((h.rows[0] || {}).dist) || 400;
    var A0 = (SG.analyzeHole(h, 'pga').shots || []).some(function (x) { return x.cat === 'putting'; }), K = 1.15, W = 360, cx = 180, top = 40, gY = top + 50, H = Math.round(gY + yd * K + 70), teeY = gY + yd * K, GR = 26;
    var pr = -1, pc = -1; SG.PIN_GRID.forEach(function (row, ri) { var ci = row.indexOf(h.pin); if (ci >= 0) { pr = ri; pc = ci; } }); if (pr < 0) { pr = 1; pc = 1; }
    var pin = [cx + (pc - 1) * GR * 0.5, gY + (pr - 1) * GR * 0.5];
    var LATS = { fairway: 0, green: 0, fringe: 0, rough: 58, deep: 78, sand: 44, bunker: 44, recovery: 100, trees: 100, hazard: 120, ob: 158 };
    var side = function (d, i) { return /left$/.test(d || '') ? -1 : /right$/.test(d || '') ? 1 : (i % 2 ? 1 : -1); };
    // where the ball lay: off the green by yards to the pin, lie and direction; on the green by feet
    var place = function (dist, lie, dir, i) {
      if (lie === 'holed') return pin.slice();
      if (lie === 'green') { var ft = Number(dist) || 0, a = dir ? SG.DIR_ANGLE[dir] : 270, r = Math.min(GR - 3, ft / 3 * K * 1.6 + 2); return pt(pin[0], pin[1], r, a); }
      var d = Number(dist) || 0, lat = (LATS[lie] != null ? LATS[lie] : 60);
      if (d <= 45) { // around the green: polar from the pin in the miss direction, always off the putting surface
        var ang = dir ? SG.DIR_ANGLE[dir] : 270, rr = Math.max(GR + 8, d * K * 1.3);
        var q = pt(pin[0], pin[1], rr, ang), dx = q[0] - cx, dy = q[1] - gY, dd = Math.hypot(dx, dy) || 1;
        return dd < GR + 10 ? [cx + dx / dd * (GR + 10), gY + dy / dd * (GR + 10)] : q;
      }
      var y = gY + d * K; if (/^long/.test(dir || '')) y = gY - Math.min(d * K, 50);
      return [Math.max(10, Math.min(W - 10, cx + (lat ? side(dir, i) * lat : 0))), Math.min(y, teeY)];
    };
    var o = '<svg id="replaymap" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Hole ' + (hi + 1) + ' replay"><rect width="' + W + '" height="' + H + '" fill="#4f8f3a"/>' +
      '<rect x="0" y="0" width="22" height="' + H + '" fill="#e9e9e9"/><rect x="' + (W - 22) + '" y="0" width="22" height="' + H + '" fill="#e9e9e9"/>' +
      '<text x="11" y="40" text-anchor="middle" font-size="9" font-weight="900" fill="#666" transform="rotate(-90 11 40)">OB</text><text x="' + (W - 11) + '" y="40" text-anchor="middle" font-size="9" font-weight="900" fill="#666" transform="rotate(90 ' + (W - 11) + ' 40)">OB</text>' +
      '<rect x="22" y="0" width="' + (W - 44) + '" height="' + H + '" fill="#5f9e47"/>' +
      '<path d="M' + (cx - 26) + ' ' + (teeY - 30) + ' C' + (cx - 40) + ' ' + ((teeY + gY) / 2) + ' ' + (cx - 44) + ' ' + (gY + 80) + ' ' + (cx - 24) + ' ' + (gY + GR + 6) + ' L' + (cx + 24) + ' ' + (gY + GR + 6) + ' C' + (cx + 44) + ' ' + (gY + 80) + ' ' + (cx + 40) + ' ' + ((teeY + gY) / 2) + ' ' + (cx + 26) + ' ' + (teeY - 30) + ' Z" fill="#9fdf86"/>';
    for (var y0 = teeY - 60; y0 > gY + 60; y0 -= 55) o += '<rect x="' + (cx - 34) + '" y="' + f1(y0) + '" width="68" height="16" fill="#b3ea9e" opacity=".5"/>';
    o += '<ellipse cx="' + (cx + 52) + '" cy="' + f1(gY + 6) + '" rx="14" ry="9" fill="#ecd27e" stroke="#c9a94f"/><ellipse cx="' + (cx - 50) + '" cy="' + f1(gY + 30) + '" rx="12" ry="8" fill="#ecd27e" stroke="#c9a94f"/>' +
      (yd > 300 ? '<ellipse cx="' + (cx + 62) + '" cy="' + f1(gY + yd * K * 0.45) + '" rx="16" ry="9" fill="#ecd27e" stroke="#c9a94f"/>' : '') +
      '<circle cx="' + cx + '" cy="' + gY + '" r="' + GR + '" fill="#8fd66f" stroke="#e8f8e0" stroke-width="2"/>' +
      '<rect x="' + (cx - 16) + '" y="' + f1(teeY - 6) + '" width="32" height="14" rx="4" fill="#c9f2b8" stroke="#fff" stroke-width="2"/><text x="' + (cx + 20) + '" y="' + f1(teeY + 5) + '" font-size="10" font-weight="900" fill="#fff">TEE · ' + yd + ' yd</text>';
    // chain
    var cur = [cx, teeY], tr = '', marks = '', labs = '', boxes = [], putts = [];
    var lbl = function (x, y, t, col) { var w = t.length * 5.8 + 6;
      var c = [[10, 4], [-10 - w, 4], [-w / 2, -10], [-w / 2, 18], [12, 16], [-12 - w, 16]].filter(function (q) { var b = [x + q[0], y + q[1] - 10, x + q[0] + w, y + q[1] + 2]; return b[0] > 2 && b[2] < W - 2 && b[1] > 2 && !boxes.some(function (z) { return b[0] < z[2] && b[2] > z[0] && b[1] < z[3] && b[3] > z[1]; }); })[0];
      if (!c) return ''; var b = [x + c[0], y + c[1] - 10, x + c[0] + w, y + c[1] + 2]; boxes.push(b);
      return '<text class="rplbl" x="' + f1(b[0] + 3) + '" y="' + f1(b[3] - 2) + '" font-size="10" font-weight="900" fill="' + col + '" stroke="#fff" stroke-width="3" paint-order="stroke">' + esc(t) + '</text>'; };
    shots.forEach(function (s, i) {
      var cat = s.cat || 'approach', col = RPC[cat] || '#333';
      if (cat === 'putting') putts.push(s);
      var endLie = s.ob ? 'ob' : s.end.lie === 'holed' ? 'holed' : s.loc === 'hazard' ? 'hazard' : s.end.lie;
      var e = s.ob ? [s.side === 'R' || /right$/.test(s.dir) ? W - 11 : 11, Math.max(cur[1] - 140, gY)] : place(s.end.dist, endLie, s.dir, i);
      var mx = (cur[0] + e[0]) / 2 + (e[1] - cur[1]) * 0.08, my = (cur[1] + e[1]) / 2 - (e[0] - cur[0]) * 0.08;
      if (cat !== 'putting') tr += '<path class="rptr" data-cat="' + cat + '" data-n="' + s.n + '" d="M' + f1(cur[0]) + ' ' + f1(cur[1]) + ' Q' + f1(mx) + ' ' + f1(my) + ' ' + f1(e[0]) + ' ' + f1(e[1]) + '" fill="none" stroke="#fff" stroke-width="5" stroke-opacity=".7"' + (s.ob ? ' stroke-dasharray="6 4"' : '') + '/>' +
        '<path d="M' + f1(cur[0]) + ' ' + f1(cur[1]) + ' Q' + f1(mx) + ' ' + f1(my) + ' ' + f1(e[0]) + ' ' + f1(e[1]) + '" fill="none" stroke="' + col + '" stroke-width="2.8"' + (s.ob ? ' stroke-dasharray="6 4"' : '') + '/>';
      if (cat !== 'putting') {
        marks += '<g class="rpshot" data-n="' + s.n + '" data-cat="' + cat + '" data-lie="' + endLie + '"><circle cx="' + f1(e[0]) + '" cy="' + f1(e[1]) + '" r="8" fill="' + col + '" stroke="#fff" stroke-width="2"/><text x="' + f1(e[0]) + '" y="' + f1(e[1] + 3.5) + '" text-anchor="middle" font-size="10" font-weight="900" fill="#fff">' + s.n + '</text></g>';
        boxes.push([e[0] - 9, e[1] - 9, e[0] + 9, e[1] + 9]);
        var t = endLie === 'holed' ? 'holed!' : s.ob ? 'OB +' + s.penStrokes : endLie === 'green' ? s.end.dist + ' ft' : s.end.dist + ' yd' + (endLie && endLie !== 'fairway' ? ' ' + ({ rough: 'rough', deep: 'deep rough', sand: 'bunker', hazard: 'hazard', recovery: 'trees' }[endLie] || '') : '');
        if (s.club) t = s.club + ' → ' + t;
        if (s.layup) t += ' (layup)';
        if (s.penStrokes && !s.ob) t += ' +' + s.penStrokes + ' pen';
        labs += lbl(e[0], e[1], t.trim(), s.penStrokes ? '#c00' : '#111');
        if (s.penStrokes) marks += '<path class="rppen" d="M' + f1(e[0] + 7) + ' ' + f1(e[1] - 14) + ' l8 8 m0 -8 l-8 8" stroke="#e0102a" stroke-width="3"/>';
      }
      cur = s.ob ? cur : e; // OB: replay from the same spot
    });
    o += tr + '<line x1="' + f1(pin[0]) + '" y1="' + f1(pin[1]) + '" x2="' + f1(pin[0]) + '" y2="' + f1(pin[1] - 18) + '" stroke="#000" stroke-width="2"/><path d="M' + f1(pin[0]) + ' ' + f1(pin[1] - 18) + ' l10 3.5 l-10 3.5z" fill="#d0213a"/><circle cx="' + f1(pin[0]) + '" cy="' + f1(pin[1]) + '" r="3" fill="#000"/>' + marks + labs;
    // tap target over the green (opens the enlarged green view)
    o += '<g class="rpgreen" data-act="rpgreen" role="button" aria-label="Open enlarged green"><circle cx="' + cx + '" cy="' + gY + '" r="' + (GR + 22) + '" fill="#fff" fill-opacity="0"/></g>' +
      '<g pointer-events="none"><rect x="' + (cx - 82) + '" y="' + f1(gY - GR - 34) + '" width="164" height="20" rx="10" fill="#fff" fill-opacity=".92"/><text id="rptapnote" x="' + cx + '" y="' + f1(gY - GR - 20) + '" text-anchor="middle" font-size="11" font-weight="900" fill="#145214">Tap the green for a closer look</text></g>';
    // enlarged green: putts to true ft scale
    var G = '', Wg = 360, Hg = 400, ix = 180, iy = 200, IR = 150, i0 = shots.findIndex(function (x) { return x.cat === 'putting'; });
    var mft = putts.length ? Math.max(10, Math.max.apply(null, putts.map(function (p) { return Number(p.start.dist) || 0; }))) : 10, PK = (IR - 16) / mft;
    G += '<svg id="rpgreenmap" viewBox="0 0 ' + Wg + ' ' + Hg + '" role="img" aria-label="Enlarged green"><rect width="' + Wg + '" height="' + Hg + '" fill="#4f8f3a"/><circle cx="' + ix + '" cy="' + iy + '" r="' + IR + '" fill="#8fd66f" stroke="#e8f8e0" stroke-width="3"/>';
    [3, 5, 10, 20, 30, 40, 60].filter(function (f) { return f < mft; }).forEach(function (f) { G += '<circle cx="' + ix + '" cy="' + iy + '" r="' + f1(f * PK) + '" fill="none" stroke="#fff" stroke-opacity=".75" stroke-dasharray="3 3"/><text x="' + f1(ix + 3) + '" y="' + f1(iy - f * PK - 2) + '" font-size="9" fill="#fff" font-weight="800">' + f + ' ft</text>'; });
    G += '<text x="' + ix + '" y="' + (Hg - 8) + '" text-anchor="middle" font-size="10" fill="#fff" font-weight="800">▼ front of green</text>';
    if (putts.length) {
      var prev = shots[i0 - 1], sd0 = prev ? prev.dir : '', s0 = pt(ix, iy, (Number(putts[0].start.dist) || 0) * PK, sd0 ? SG.DIR_ANGLE[sd0] : 270);
      if (prev) { var pc2 = RPC[prev.cat] || '#333', fx = Math.max(20, Math.min(Wg - 20, ix + (s0[0] - ix) * 0.4)), fy = Hg - 22;
        G += '<path id="rparrive" d="M' + f1(fx) + ' ' + fy + ' Q' + f1((fx + s0[0]) / 2 + 20) + ' ' + f1((fy + s0[1]) / 2) + ' ' + f1(s0[0]) + ' ' + f1(s0[1]) + '" fill="none" stroke="' + pc2 + '" stroke-width="3" stroke-dasharray="7 4"/>' +
          '<circle cx="' + f1(fx) + '" cy="' + fy + '" r="9" fill="' + pc2 + '" stroke="#fff" stroke-width="2"/><text x="' + f1(fx) + '" y="' + (fy + 4) + '" text-anchor="middle" font-size="10" font-weight="900" fill="#fff">' + prev.n + '</text>' +
          '<text x="' + f1(fx + 13) + '" y="' + (fy + 4) + '" font-size="10" font-weight="900" fill="#fff">' + '<tspan id="rparrlbl">' + esc((RPN[prev.cat] || 'Shot') + (SG.arrivalDepth(prev.dir, putts[0].start.dist) ? ' ' + SG.arrivalDepth(prev.dir, putts[0].start.dist) : '')) + '</tspan></text>'; }
      var pp = s0, fin = '', st0 = [];
      putts.forEach(function (p, k) {
        var st = pp, holed = p.end.lie === 'holed', nr = h.rows[p.n] || {}, ed = nr.dir || p.dir || '';
        var e0 = holed ? [ix, iy] : pt(ix, iy, 14 + (Number(p.end.dist) || 0) * PK, SG.DIR_ANGLE[ed] != null ? SG.DIR_ANGLE[ed] : 90 - k * 35);
        G += '<path class="rpputt' + (holed ? ' holed' : ' missed') + '" data-n="' + p.n + '" d="M' + f1(st[0]) + ' ' + f1(st[1]) + ' L' + f1(e0[0]) + ' ' + f1(e0[1]) + '" stroke="#fff" stroke-width="3"' + (holed ? ' stroke-dasharray="6 4"' : '') + '/>';
        if (!holed) fin += '<g class="rpfinish" data-n="' + p.n + '"><circle cx="' + f1(e0[0]) + '" cy="' + f1(e0[1]) + '" r="5.5" fill="#fff" stroke="#333" stroke-width="1.2"/><text x="' + f1(e0[0] + 9) + '" y="' + f1(e0[1] + 4) + '" font-size="11" font-weight="900" fill="#111" stroke="#fff" stroke-width="3" paint-order="stroke">' + p.end.dist + ' ft</text></g>';
        st0.push(st); pp = e0;
      });
      G += '<circle class="rpcup" cx="' + ix + '" cy="' + iy + '" r="4.5" fill="#000"/>' + fin;
      putts.forEach(function (p, k) { var st = st0[k];
        G += '<circle cx="' + f1(st[0]) + '" cy="' + f1(st[1]) + '" r="10" fill="#fff" stroke="#222" stroke-width="1.5"/><text x="' + f1(st[0]) + '" y="' + f1(st[1] + 4) + '" text-anchor="middle" font-size="11" font-weight="900" fill="#111">' + p.n + '</text>' +
          (k === 0 ? '<text x="' + f1(st[0] + 13) + '" y="' + f1(st[1] - 8) + '" font-size="11" font-weight="900" fill="#111" stroke="#fff" stroke-width="3" paint-order="stroke">' + p.start.dist + ' ft</text>' : ''); });
    }
    G += (putts.length ? '' : '<circle class="rpcup" cx="' + ix + '" cy="' + iy + '" r="4.5" fill="#000"/>') + '</svg>';
    return { svg: o + '</svg>', green: G, nPutts: putts.length, A: A, yd: yd };
  }
  function replayHTML() {
    var r = round(), hi = view.replay, h = r.holes[hi], R = replaySVG(h, hi), A = R.A, n = r.holes.length;
    return '<div class="mapview" id="replayview" role="dialog" aria-label="Hole replay"><div class="maphead"><b>Hole ' + (hi + 1) + ' replay</b><button class="close" data-act="rpclose" aria-label="Close replay">✕ Close</button></div>' +
      '<div class="seg rpnav"><button data-act="rphole" data-v="' + (hi - 1) + '"' + (hi > 0 ? '' : ' disabled') + ' aria-label="Previous hole">‹ Hole ' + hi + '</button><span class="rpinfo" id="rpinfo">Par ' + h.par + ' · ' + R.yd + ' yd · ' +
      (A.complete ? A.strokes + ' (' + toPar(A.strokes - h.par) + ')' : (A.shots || []).length + ' shots so far') + '</span><button data-act="rphole" data-v="' + (hi + 1) + '"' + (hi < n - 1 ? '' : ' disabled') + ' aria-label="Next hole">Hole ' + (hi + 2) + ' ›</button></div>' +
      (!(A.shots || []).length ? '<p class="notice">No shots entered on this hole yet.</p>' : view.rpGreen ? '<div class="row"><button class="big" data-act="rpgreenback" id="rpgreenback">‹ Back to hole</button></div><h3>Hole ' + (hi + 1) + ' – on the green</h3>' + R.green + (R.nPutts ? '' : '<p class="notice">No putts on this hole.</p>') + '<p class="help">Drawn to true scale in feet (rings every few ft). White = putts: numbered ball = where each putt started, small white ball + ft = where a missed putt finished, dashed white line = the putt that went in; black dot = the cup. The coloured dashed line is the shot that arrived on the green.</p>' : R.svg) +
      '<div class="legend" id="rplegend">' + ['tee', 'approach', 'short', 'putting'].map(function (k) { return '<span><i class="ln" style="background:' + RPC[k] + (k === 'putting' ? ';outline:1px solid #333' : '') + '"></i><i class="dot num" style="background:' + RPC[k] + (k === 'putting' ? ';color:#111;border:1px solid #333' : '') + '">1</i>' + RPN[k] + '</span>'; }).join('') +
      '<span>Putts are white; in the green close-up the black dot is the cup.</span><span><b style="color:#e0102a">✕</b>Penalty (label shows the penalty strokes); dashed line = OB, replayed from the same spot</span><span>Number = shot; label = distance left (yd off the green, ft on it) and lie. Tap the green to see the putts.</span></div>' +
      '<p class="help muted">A generic drawing, roughly to scale by hole length (straight hole, tee at the bottom, green at the top, pin at its set spot – centre if none). Positions come from your distances to the pin and the direction / lie entered, so they are approximate.</p></div>';
  }
  // ---------- Putt misses map ----------
  // v117: one colour rule on every putt map – made = black (line runs into the hole), missed = red (line to where it finished).
  // Where a miss finished (short / long / left / right) is still counted in the cells below the map; it is no longer a colour.
  var PM_MADE = '#111', PM_MISS = '#d0312d';
  var PMN = { short: 'Short', long: 'Long (over 3 ft past)', left: 'Left', right: 'Right', nearlong: 'Just long (within 3 ft)', nodir: 'No direction entered' };
  // map buttons: the two 1st-putt groups (10 ft and in), lag putts (1st putts over 10 ft), all putts
  var PM_EXTRA = [{ id: 'lag', name: 'Over 10 ft' }]; // v137: the v117 "All putts" map was removed (Scott: too confusing)
  function pmissTile(S) {
    var L = SG.pmissList(S.puttList), k = L.filter(function (p) { return p.made; }).length; // v112: shown as made (was missed)
    return tile('pmiss', '1st putts made inside 10 ft – tap for map', L.length ? k + '/' + L.length + ' made' : '–', '<small class="mini" id="pmmini">' + pmissLine(k, L.length) + '</small>');
  }
  // v105: one plain sentence, used by the tile and the map box
  function pmissLine(k, n) { // v112: k = made
    return n ? Math.round(100 * k / n) + '% made · 1st putts from 10 ft and in' : 'no 1st putts from 10 ft and in yet';
  }
  // v104 lag putts (start more than 10 ft away; v105: 1st putt of the hole only): success = finished within 3 ft (or holed). Opens the putt map on "Over 10 ft".
  function lagLine(LG) {
    return LG.attempts ? Math.round(LG.pct) + '% inside 3 ft' : 'no 1st putts from over 10 ft yet';
  }
  function lagTile(LG) {
    return tile('pmiss', 'Lag putts (&gt;10 ft) – tap for map', LG.attempts ? LG.inside + '/' + LG.attempts + ' inside 3 ft' : '–', '<small class="mini" id="lagmini">' + lagLine(LG) +
      (LG.attempts ? ' · avg leave ' + fmtLeave(LG.avgLeaveFt) : '') + '</small>');
  }
  function fmtLeave(ft) { return ft == null ? '–' : (Math.round(ft * 10) / 10) + ' ft'; }
  function pmissData(scopeAll, gid) {
    var all = [], lag = [], every = [], n = 0;
    (scopeAll ? savedRounds() : [round()]).forEach(function (r) { n++; var PL = SG.summarize(r, 'pga').puttList; all = all.concat(SG.pmissList(PL)); lag = lag.concat(SG.lagList(PL));
      PL.forEach(function (p) { every.push(p); }); });
    var counts = {}; SG.PMISS_GROUPS.forEach(function (g) { counts[g.id] = all.filter(function (p) { return SG.pmissGroup(p.ft) === g.id; }).length; });
    counts.lag = lag.length;
    var g = gid || view.pmG; if (!g || !counts[g]) g = SG.PMISS_GROUPS.filter(function (x) { return counts[x.id]; }).map(function (x) { return x.id; }).pop() || (counts.lag ? 'lag' : '0-6');
    var list = g === 'lag' ? lag : all.filter(function (p) { return SG.pmissGroup(p.ft) === g; });
    return { group: g, counts: counts, list: list, first: all, stats: SG.pmissStats(list), rounds: n, lag: SG.lagStats(lag), every: every };
  }
  function pmLbl(boxes, W, H) { // small ft label placed next to a point, away from other labels
    return function (x, y, t, col) { var w = t.length * 5.6 + 6, best = null;
      [[7, 4], [-7 - w, 4], [-w / 2, -8], [-w / 2, 16], [9, 13], [-9 - w, 13], [9, -7], [-9 - w, -7]].some(function (c) { var b = [x + c[0], y + c[1] - 10, x + c[0] + w, y + c[1] + 2];
        if (b[0] < 2 || b[2] > W - 2 || b[1] < 22 || b[3] > H - 20) return false; if (!best) best = b; if (boxes.some(function (q) { return b[0] < q[2] && b[2] > q[0] && b[1] < q[3] && b[3] > q[1]; })) return false; best = b; return true; });
      if (!best) return ''; boxes.push(best); return '<text class="pmlbl" x="' + f1(best[0] + 3) + '" y="' + f1(best[3] - 2) + '" font-size="10.5" font-weight="500" fill="' + col + '" stroke="#fff" stroke-width="3" paint-order="stroke">' + esc(t) + '</text>'; };
  }
  function pmGreen(W, H, cx, cy, R) {
    return '<rect width="' + W + '" height="' + H + '" fill="#d7ecd0"/><circle cx="' + cx + '" cy="' + cy + '" r="' + R + '" fill="#67b866" stroke="#2f7a34" stroke-width="2.5"/>';
  }
  function pmEdges(W, H, cy) {
    var t = function (x, y, s, a) { return '<text x="' + x + '" y="' + y + '" text-anchor="' + (a || 'middle') + '" font-size="11.5" font-weight="500" fill="#28402c">' + s + '</text>'; };
    return t(W / 2, 16, 'LONG ↑') + t(W / 2, H - 6, 'SHORT ↓ (toward you)') + t(6, cy + 4, 'L', 'start') + t(W - 6, cy + 4, 'R', 'end');
  }
  // 1st putts (one group) and lag putts: every putt drawn from ONE start spot straight below the hole (the hole is the target).
  // Made = black line curving into the hole (spread a little so several stay visible); missed = red line to where it finished.
  function pmissSVG(list, gid) {
    var lagMode = gid === 'lag', G = lagMode ? { max: 10 } : SG.PMISS_GROUPS.filter(function (x) { return x.id === gid; })[0], W = 360, H = 400, cx = 180, cy = 200, R = 170;
    var ends = list.filter(function (p) { return !p.made; }).map(function (p) { return p.endFt; }), sc;
    if (lagMode) { var m = Math.max.apply(null, [0].concat(ends)); sc = { step: 3, max: Math.min(15, Math.max(6, Math.ceil(m / 3) * 3)) }; }
    else sc = SG.pmissScale(G, ends);
    var maxFt = sc.max, step = sc.step, RR = R - 14, rad = function (ft) { return RR * Math.max(0, Math.min(ft, maxFt)) / maxFt; };
    var o = '<svg id="pmissmap" data-mode="' + (lagMode ? 'lag' : 'first') + '" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + (lagMode ? 'Lag putts' : '1st putts') + ': made in black, missed in red">' + pmGreen(W, H, cx, cy, R);
    for (var f = step; f <= maxFt; f += step) o += '<circle cx="' + cx + '" cy="' + cy + '" r="' + f1(rad(f)) + '" fill="none" stroke="#fff" stroke-opacity="' + (lagMode && f === 3 ? '.95' : '.6') + '" stroke-width="' + (f === maxFt || (lagMode && f === 3) ? 1.6 : 1) + '"/><text class="ring" x="' + f1(cx + rad(f) * 0.707 + 3) + '" y="' + f1(cy + rad(f) * 0.707 + 11) + '" font-size="9.5" font-weight="400" fill="#fff">' + f + ' ft</text>';
    o += pmEdges(W, H, cy);
    var s = [cx, cy + RR], made = list.filter(function (p) { return p.made; }), mk = '', tr = '', dots = '', labs = '', boxes = [], seenE = {}, pend = [], lbl = pmLbl(boxes, W, H);
    made.forEach(function (p, k) { // black line into the hole; the k-th made putt bows a little left / right so they don't all sit on one line
      var bow = k === 0 ? 0 : (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 9;
      mk += '<path class="pmmade" data-ft="' + p.ft + '" d="M' + f1(s[0]) + ' ' + f1(s[1]) + ' Q' + f1(cx + bow) + ' ' + f1((s[1] + cy) / 2) + ' ' + cx + ' ' + cy + '" fill="none" stroke="' + PM_MADE + '" stroke-width="1.8" stroke-opacity=".85" stroke-linecap="round"/>'; });
    list.filter(function (p) { return !p.made; }).forEach(function (p) {
      var cls = SG.pmissClass(p), ea = p.endDir ? SG.DIR_ANGLE[p.endDir] : 90, clamped = p.endFt > maxFt, ek = (p.endDir || 'n') + Math.round(p.endFt * 2), je = seenE[ek] = (seenE[ek] || 0) + 1;
      var e = pt(cx, cy, Math.max(rad(p.endFt), 9), ea + (je - 1) * 9);
      var mx = (s[0] + e[0]) / 2 + (e[1] - s[1]) * 0.12, my = (s[1] + e[1]) / 2 - (e[0] - s[0]) * 0.12, d = 'M' + f1(s[0]) + ' ' + f1(s[1]) + ' Q' + f1(mx) + ' ' + f1(my) + ' ' + f1(e[0]) + ' ' + f1(e[1]);
      tr += '<path class="pmtr" data-class="' + cls + '" d="' + d + '" fill="none" stroke="' + PM_MISS + '" stroke-width="1.8" stroke-opacity=".9" stroke-linecap="round"/>';
      dots += cls === 'nodir' ? '<g class="pmend" data-class="nodir"><path d="M' + f1(e[0]) + ' ' + f1(e[1] - 7) + ' l7 7 -7 7 -7 -7z" fill="#fff" stroke="' + PM_MISS + '" stroke-width="1.6"/><text x="' + f1(e[0]) + '" y="' + f1(e[1] + 3.5) + '" text-anchor="middle" font-size="9" font-weight="500" fill="' + PM_MISS + '">?</text></g>'
        : '<circle class="pmend" data-hd="' + p.endFt + '" data-hu="ft" data-class="' + cls + '" cx="' + f1(e[0]) + '" cy="' + f1(e[1]) + '" r="3.6" fill="' + PM_MISS + '" stroke="#fff" stroke-width="1.2"/>';
      boxes.push([e[0] - 5, e[1] - 5, e[0] + 5, e[1] + 5]);
      pend.push([e[0], e[1], (Math.round(p.endFt * 10) / 10) + ' ft' + (clamped ? ' ›' : '')]);
    });
    pend.forEach(function (q) { labs += lbl(q[0], q[1], q[2], '#8e1f1b'); });
    return o + tr + mk + '<circle class="pmhole" cx="' + cx + '" cy="' + cy + '" r="4.5" fill="#000" stroke="#fff" stroke-width="1"/><circle id="pmorigin" cx="' + cx + '" cy="' + (cy + RR) + '" r="5" fill="#fff" stroke="#333" stroke-width="1.4"/><text x="' + (cx + 9) + '" y="' + (cy + RR + 4) + '" font-size="9.5" font-weight="400" fill="#fff">putts start here' + (lagMode ? ' (over 10 ft away)' : '') + '</text>' + dots + labs + '</svg>';
  }
  function pmissCells(st) {
    var pc = function (k) { return st.misses ? Math.round(st.pct[k]) + '%' : '–'; };
    return '<div class="stat-grid pmcells" id="pmcells">' + stat('Left', pc('left')) + stat('Right', pc('right')) + stat('Short', pc('short')) + stat('Long (> 3 ft past)', pc('long')) +
      stat('1st putts made', st.made + '/' + st.attempts) + stat('Just long ≤ 3 ft / no dir.', st.counts.nearlong + ' / ' + st.counts.nodir) + '</div>';
  }
  function pmissLegend(g) {
    return '<div class="legend pmlegend" id="pmlegend"><span><i class="ln" style="background:' + PM_MADE + '"></i>Made – black line into the hole</span>' +
      '<span><i class="ln" style="background:' + PM_MISS + '"></i>Missed – red line to where it finished (label = feet left)</span>' +
      ('<span><svg width="20" height="20" viewBox="0 0 20 20" style="flex:none"><path d="M10 3 l7 7 -7 7 -7 -7z" fill="#fff" stroke="' + PM_MISS + '" stroke-width="1.6"/><text x="10" y="13.5" text-anchor="middle" font-size="9" fill="' + PM_MISS + '">?</text></svg>No direction entered for where it finished (drawn long)</span>' +
        '<span><i class="dot" style="background:#fff;border:1px solid #333"></i>Common start point: every putt is drawn from straight below the hole, so the hole is the target</span>' +
        '<span>Rings = feet from the hole, evenly spaced' + (g === 'lag' ? ' (the brighter ring is 3 ft – a good lag finishes inside it)' : '') + '. › = further than the picture, drawn at the edge.</span>') + '</div>';
  }
  function lagBox(LG, all, n) {
    return '<div class="lagbox" id="lagbox"><div class="lagh">Lag putts (&gt;10 ft)' + (all ? ' – ' + n + ' round' + (n === 1 ? '' : 's') : ' – this round') + '</div>' +
      '<div class="stat-grid lagcells">' + stat('Inside 3 ft', LG.attempts ? LG.inside + '/' + LG.attempts + ' (' + Math.round(LG.pct) + '%)' : '–') + stat('Avg leave', fmtLeave(LG.avgLeaveFt)) + '</div>' +
      '<p class="help muted">1st putt on each hole only, from more than 10 ft. Good = holed or finished within 3 ft (3 ft counts). Avg leave = distance left after the putt (holed = 0).</p></div>';
  }
  function pmissHTML(all) {
    var D = pmissData(all), g = D.group, G = SG.PMISS_GROUPS.filter(function (x) { return x.id === g; })[0], where = all ? ' in ' + D.rounds + ' round' + (D.rounds === 1 ? '' : 's') : ' this round';
    var btns = '<div class="seg pmgroups" id="pmgroups">' + SG.PMISS_GROUPS.concat(PM_EXTRA).map(function (x) { var c = D.counts[x.id];
      return '<button data-act="pmg" data-v="' + x.id + '" data-n="' + c + '" class="' + (x.id === g ? 'sel' : '') + (x.id === 'lag' ? ' pmx' : '') + '"' + (c ? '' : ' disabled') + ' aria-pressed="' + (x.id === g) + '">' + x.name + (c ? '<small> ' + c + '</small>' : '') + '</button>'; }).join('') + '</div>';
    // headline = the Round stats number (every 1st putt from 10 ft and in, both groups together); the 2nd line says what the map shows
    var F = D.first, Fm = F.filter(function (p) { return p.made; }).length, pctx = function (k, n) { return n ? ' (' + Math.round(100 * k / n) + '%)' : ''; };
    var head = '<p class="mapsum" id="mapsum"><b>' + Fm + '/' + F.length + '</b> made' + pctx(Fm, F.length) + ' – 1st putts from 10 ft and in' + where + '</p>';
    var L = D.list, Lm = L.filter(function (p) { return p.made; }).length, show;
    if (g === 'lag') show = '1st putts from over 10 ft: <b>' + L.length + '</b> putt' + (L.length === 1 ? '' : 's') + ' · <b>' + Lm + '</b> made · <b>' + D.lag.inside + '</b> inside 3 ft';
    else show = '1st putts from <b id="pmsel">' + G.name + '</b>: <b>' + D.stats.made + '/' + D.stats.attempts + '</b> made' + pctx(D.stats.made, D.stats.attempts);
    var out = btns + head + '<p class="mapsum pmshow" id="pmshow">Map shows ' + show + '</p>';
    return out + pmissSVG(L, g) + (g === 'lag' ? '' : pmissCells(D.stats)) + pmissLegend(g) + lagBox(D.lag, all, D.rounds) +
      '<p class="help muted">Black lines = putts that went in, curving into the hole. Red lines run from one common start (below the hole) to where the putt finished, placed around the hole by the direction and distance of the next putt: short = below the hole, long = above, left/right to the sides. Short = finished short (incl. short left/right). Long = finished long and more than 3 ft past the hole. Long left/right within 3 ft count as Left/Right; straight long within 3 ft = "just long" (good speed, not counted as Long). Percentages are of misses. Only the 1st putt on each hole counts, from 10 ft and in (10 ft included) – groups: under 6 ft and 6–10 ft. Over 10 ft = lag putts (1st putts from further away – good = inside 3 ft). All putts = every putt of the round.</p>';
  }
  function clubTile() {
    var n = clubShots(false).length, c = {}; clubShots(false).forEach(function (x) { c[x.club] = 1; });
    return tile('club', 'Club performance – tap', n ? Object.keys(c).length + (Object.keys(c).length === 1 ? ' club' : ' clubs') : '–', '<small class="mini">' + (n ? n + ' shots with a club' : 'pick clubs on shots') + '</small>');
  }
  function puttTile(S) {
    var P1 = SG.puttStats(S.puttList.filter(function (p) { return p.n === 1; }));
    return tile('putt', 'Putts – tap for map', S.putts, '<small class="mini">' + (P1.n ? '1st putts made ' + P1.made + '/' + P1.n : 'no putts yet') + '</small>');
  }
  function puttData() {
    var all = [], n = 0;
    (view.mapScope === 'all' ? savedRounds() : [round()]).forEach(function (r) { n++; SG.summarize(r, 'pga').puttList.forEach(function (p) { all.push(p); }); });
    var counts = { '1': 0, '2': 0, '3': 0 }; all.forEach(function (p) { counts[SG.puttGroup(p.n)]++; });
    var g = view.puttN || '1'; if (!counts[g]) g = ['1', '2', '3'].filter(function (x) { return counts[x]; })[0] || '1';
    return { list: all.filter(function (p) { return SG.puttGroup(p.n) === g; }), group: g, counts: counts, rounds: n, tp: SG.threePutts(all) };
  }
  // Non-linear radius: 0-10 ft takes 60% of the radius (1 ft rings readable); 10 ft..max ring the rest.
  var PG2 = { cx: 180, cy: 190, R: 168 };
  var PCOL = { made: '#000', miss2: '#d0312d', miss3: '#d0312d' }; // v117: made = black, missed = red on every putt map (3-putt holes are counted above the map)
  function puttSVG(list, group) {
    var sc = SG.puttScale(group, list), maxFt = sc.maxFt, close = sc.mode === 'close', R = function (ft) { return SG.puttRadius(ft, sc, PG2.R); };
    var o = '<svg id="puttmap" data-scale="' + sc.mode + '" data-maxft="' + maxFt + '" viewBox="0 0 360 400" role="img" aria-label="Putts by starting distance">' +
      '<rect width="360" height="400" fill="#cfe8c4"/><circle cx="' + PG2.cx + '" cy="' + PG2.cy + '" r="' + (PG2.R + 6) + '" fill="#3da33d" stroke="#145214" stroke-width="4"/>';
    var lab = {}, f;
    if (close) sc.labels.forEach(function (x) { lab[x] = 1; });
    else { var step5 = R(15) - R(10) >= 17; [1, 2, 3, 5, 10].forEach(function (x) { lab[x] = 1; }); for (f = 15; f <= maxFt; f += 5) if (step5 || f % 10 === 0) lab[f] = 1; }
    // Ring labels run along the emptiest diagonal so they don't sit on top of putts.
    var la = [300, 240, 60, 120].map(function (a) { return [a, list.filter(function (p) { var d = Math.abs(((SG.DIR_ANGLE[p.dir] == null ? -999 : SG.DIR_ANGLE[p.dir]) - a + 540) % 360 - 180); return d < 35; }).length]; })
      .sort(function (x, y) { return x[1] - y[1]; })[0][0], lc = Math.cos(la * Math.PI / 180), ls = -Math.sin(la * Math.PI / 180), ringBoxes = [];
    sc.rings.slice().reverse().forEach(function (ft) {
      var r = R(ft), major = close ? ft === 3 || ft === 6 || ft === 10 : ft === 3 || ft === 6 || ft === 10 || ft % 10 === 0;
      o += '<circle class="pring" data-ft="' + ft + '" cx="' + PG2.cx + '" cy="' + PG2.cy + '" r="' + f1(r) + '" fill="none" stroke="#fff" stroke-opacity="' + (major ? '.95' : '.6') + '" stroke-width="' + (major ? 2.2 : 1.1) + '"/>';
      if (lab[ft] || ft === maxFt) { var lx = PG2.cx + r * lc, ly = PG2.cy + r * ls + 4, txt = ft + (ft === 10 || ft === maxFt ? ' ft' : ''), lw = txt.length * 6.5;
        ringBoxes.push([lx - lw / 2, ly - 10, lx + lw / 2, ly + 2]);
        o += '<text class="ring" x="' + f1(lx) + '" y="' + f1(ly) + '" text-anchor="middle" font-size="' + (!close && ft <= 3 ? 10 : 12) + '" font-weight="900" fill="#fff" stroke="#145214" stroke-width="2.5" paint-order="stroke">' + txt + '</text>'; }
    });
    o += '<circle cx="' + PG2.cx + '" cy="' + PG2.cy + '" r="4.5" fill="#000"/>';
    var dots = '', boxes = ringBoxes.concat([[130, 3, 230, 21], [80, 380, 280, 398], [0, PG2.cy - 10, 30, PG2.cy + 6], [330, PG2.cy - 10, 360, PG2.cy + 6]]), lbls = '';
    SG.puttPlace(list, sc, PG2.cx, PG2.cy, PG2.R, 15).forEach(function (d) {
      var p = d.p, q = [d.x, d.y], x = f1(d.x), y = f1(d.y), kd = SG.puttKind(p), col = PCOL[kd];
      var at = ' class="pdot2" data-hd="' + p.ft + '" data-hu="ft" data-made="' + (p.made ? 1 : 0) + '" data-ft="' + p.ft + '" data-hole="' + p.hole + '" data-dir="' + (p.dir || '') + '" data-beyond="' + (d.beyond ? 1 : 0) + '" data-pk="' + kd + '"';
      if (d.nodir) dots += '<g' + at + ' data-kind="nodir"><path d="M' + x + ' ' + (y - 9) + ' l9 9 -9 9 -9 -9z" fill="' + (p.made ? col : '#fff') + '" stroke="' + col + '" stroke-width="3"/><text x="' + x + '" y="' + (+y + 4.5) + '" text-anchor="middle" font-size="11" font-weight="900" fill="' + (p.made ? '#fff' : col) + '">?</text></g>';
      else dots += '<circle' + at + ' data-kind="dir" cx="' + x + '" cy="' + y + '" r="6.5" fill="' + (p.made ? col : '#fff') + '" stroke="' + col + '" stroke-width="3"/>';
      boxes.push([q[0] - 8, q[1] - 9, q[0] + 8, q[1] + 9]);
    });
    SG.puttPlace(list, sc, PG2.cx, PG2.cy, PG2.R, 15).forEach(function (d) {
      var p = d.p, q = [d.x, d.y], t = (Math.round(p.ft * 10) / 10) + (d.beyond ? '›' : ''), w = t.length * 7 + 4, cand = [[0, -12], [0, 21], [12 + w / 2, 4], [-12 - w / 2, 4], [0, -24], [0, 33], [14 + w / 2, -10], [-14 - w / 2, -10]], best = null;
      cand.some(function (c) { var cx = Math.max(w / 2, Math.min(360 - w / 2, q[0] + c[0])), ty = q[1] + c[1], b = [cx - w / 2, ty - 10, cx + w / 2, ty + 2];
        if (!best) best = [cx, ty, b]; if (!boxes.some(function (z) { return b[0] < z[2] && b[2] > z[0] && b[1] < z[3] && b[3] > z[1]; })) { best = [cx, ty, b]; return true; } });
      boxes.push(best[2]);
      lbls += '<text class="plbl" x="' + f1(best[0]) + '" y="' + f1(best[1]) + '" text-anchor="middle" font-size="12" font-weight="900" fill="#000" stroke="#fff" stroke-width="3.5" paint-order="stroke">' + t + '</text>';
    });
    return o + dots + lbls + '<text x="180" y="16" text-anchor="middle" font-size="13" font-weight="800">LONG ↑</text><text x="180" y="394" text-anchor="middle" font-size="13" font-weight="800">SHORT ↓ (toward you)</text>' +
      '<text x="6" y="' + (PG2.cy + 4) + '" font-size="13" font-weight="800">◀ L</text><text x="354" y="' + (PG2.cy + 4) + '" text-anchor="end" font-size="13" font-weight="800">R ▶</text></svg>';
  }
  function puttHTML(all) {
    var D = puttData(), P = SG.puttStats(D.list), NM = { '1': '1st putt', '2': '2nd putt', '3': '3rd+ putt' };
    var btns = ['1', '2', '3'].map(function (g) { var c = D.counts[g];
      return '<button class="pnbtn' + (g === D.group ? ' sel' : '') + '" data-act="puttn" data-v="' + g + '" data-n="' + c + '"' + (c ? '' : ' disabled') + ' aria-pressed="' + (g === D.group) + '">' + NM[g].replace(' putt', '') + '<small>' + c + '</small></button>'; }).join('');
    var pct = function (x) { return x == null ? '–' : Math.round(x) + '%'; };
    var bandRows = P.bands.map(function (b) { return '<tr data-band="' + b.id + '"><td>' + b.id + ' ft</td><td class="num">' + b.n + '</td><td class="num">' + (b.n ? b.made + '/' + b.n : '–') + '</td><td class="num">' + pct(b.pct) + '</td></tr>'; }).join('');
    return '<div class="pnrow" id="puttbtns" role="group" aria-label="Which putt">' + btns + '</div>' +
      '<p class="mapsum" id="mapsum"><b>' + P.n + '</b> ' + NM[D.group] + (P.n === 1 ? '' : 's') + (all ? ' in ' + D.rounds + ' round' + (D.rounds === 1 ? '' : 's') : ' this round') + '</p>' +
      '<p class="mapsum" id="threeputts">3-putt holes: <b>' + D.tp.three + '</b> of ' + D.tp.holes + ' hole' + (D.tp.holes === 1 ? '' : 's') + ' putted' + (D.tp.holes ? ' (' + Math.round(100 * D.tp.three / D.tp.holes) + '%)' : '') + '</p>' +
      '<div class="stat-grid" id="puttstats">' + stat('Putts', P.n) + stat('Made', P.n ? P.made + ' / ' + P.n + ' (' + pct(P.pct) + ')' : '–') + stat('Avg distance', P.avgFt == null ? '–' : (Math.round(P.avgFt * 10) / 10) + ' ft') + '</div>' +
      puttSVG(D.list, D.group) +
      '<div class="legend" id="puttlegend"><span><i class="dot" style="background:#000;border-color:#000"></i>Made (black)</span><span><i class="dot" style="background:#fff;border:3px solid #d0312d"></i>Missed (red)</span>' +
      '<span><svg width="20" height="20" viewBox="0 0 20 20" style="flex:none"><path d="M10 1 l9 9 -9 9 -9 -9z" fill="#fff" stroke="#555" stroke-width="2.5"/><text x="10" y="14.5" text-anchor="middle" font-size="11" font-weight="900" fill="#555">?</text></svg>No direction entered – right distance, spread around the hole (outline colour as above)</span>' +
      (D.group === '1' ? '<span>Rings every 1 ft out to 10 ft, then every 5 ft. The inner 10 ft is drawn bigger so short putts are easy to read; the label is the distance in ft.</span>' : '<span>Close-up: 10 ft green, a ring every 1 ft (true scale). Putts longer than 10 ft sit on the edge, labelled with › and their real distance.</span>') + '<span>Dots that would land on the same spot are nudged slightly apart.</span></div>' +
      '<h3>Make % by distance</h3><table class="dirtab" id="puttbands"><tr><th>Distance</th><th class="num">Putts</th><th class="num">Made</th><th class="num">Make %</th></tr>' + bandRows + '</table>' +
      '<p class="help muted">Every putt = every stroke hit from the green. 1st / 2nd / 3rd+ = its number on that hole (3rd+ includes 4th and later). Direction = where the ball was vs the hole before the putt: for 1st putts the Dir of the approach (as on the GIR map), for later putts the Dir on that putt\'s row. ' +
      'Bands: 0–3 = under 3 ft, 3–6 = 3 to under 6 ft, and so on. Only finished holes count.</p>';
  }
  function proxTile(S) {
    var L = S.proxList.filter(function (m) { return SG.inBucket('all', m.from); }), P = SG.proxStats(L);
    return tile('prox', 'Proximity by distance – tap for map', P.n ? fmtFt(P.avgAllFt) : '–',
      '<small class="mini">avg 40–200 yd · ' + P.n + ' approach' + (P.n === 1 ? '' : 'es') + (P.n ? ' · greens hit ' + P.hits + '/' + P.n : '') + '</small>');
  }
  // Proximity data for the selected yardage. Counts per yardage button (current scope) decide which
  // buttons are enabled; a selection with no shots in this scope falls back to All.
  // Proximity data for the selected yardage + starting-lie filter. Button counts (current scope) decide
  // which yardage / lie buttons are enabled; a selection with no shots falls back to All.
  function proxData() {
    var all = [], n = 0;
    (view.mapScope === 'all' ? savedRounds() : [round()]).forEach(function (r) { n++; SG.summarize(r, 'pga').proxList.forEach(function (m) { all.push(m); }); });
    if (view.proxGroup) all = all.filter(function (m) { return SG.reportGroup(m.from) === view.proxGroup; });
    var lie = view.proxLie || 'all', b = view.proxB || '~auto', auto = b === '~auto', counts, inB, lieCounts;
    var byLie = function (L) { return lie === 'all' ? L : L.filter(function (m) { return m.fromGroup === lie; }); };
    var calc = function () {
      counts = {}; SG.PROX_BUCKETS.forEach(function (x) { counts[x.id] = byLie(all).filter(function (m) { return SG.inBucket(x.id, m.from); }).length; });
      // Default (nothing tapped yet): the busiest yardage, so the map opens uncluttered. Ties -> the shorter yardage.
      if (auto) { b = 'all'; var mx = 0; SG.PROX_BUCKETS.slice(1).forEach(function (x) { if (counts[x.id] > mx) { mx = counts[x.id]; b = x.id; } }); }
      if (!counts[b]) b = 'all';
      inB = view.proxGroup ? all.slice() : all.filter(function (m) { return SG.inBucket(b, m.from); });
      lieCounts = { all: inB.length }; SG.PROX_LIES.forEach(function (l) { lieCounts[l.id] = inB.filter(function (m) { return m.fromGroup === l.id; }).length; });
    };
    calc(); if (lie !== 'all' && !lieCounts[lie]) { lie = 'all'; calc(); }
    if (view.proxGroup) counts.all = all.length;
    return { list: byLie(inB), inB: inB, rounds: n, bucket: b, auto: auto && b !== 'all', lie: lie, counts: counts, lieCounts: lieCounts, outside: byLie(all).length - counts.all };
  }
  // green drawn 60 yd across (90 ft radius) at K px per ft, so shots, rings and the D1 benchmark ring share one scale
  var PX = { cx: 150, cy: 250, K: 1.3, Rg: 117, W: 300, H: 620, Z: 476 }; // Rg = 90 ft * K; Z = top of the lie strip
  // Where the shots come from: fairway strip in the middle, rough both sides, a bunker (right),
  // trees / other (bottom-left corner) and the tee box (par 3s) at the bottom of the fairway.
  function lieStrip() {
    var Z = PX.Z, H = PX.H, W = PX.W, fx0 = PX.cx - 46, fx1 = PX.cx + 46, t = function (x, y, s, a, c) { return '<text class="liet" x="' + x + '" y="' + y + '" text-anchor="' + (a || 'middle') + '" font-size="10" font-weight="900" fill="' + (c || '#fff') + '" letter-spacing=".5">' + s + '</text>'; };
    var o = '<g id="liestrip"><rect class="lie-rough" x="0" y="' + Z + '" width="' + W + '" height="' + (H - Z) + '" fill="#5f9e47"/>' +
      '<path d="M' + (fx0 + 8) + ' ' + Z + ' L' + (fx1 - 8) + ' ' + Z + ' L' + fx1 + ' ' + H + ' L' + fx0 + ' ' + H + ' Z" class="lie-fw" fill="#9fdf86"/>';
    for (var k = 0; k < 5; k++) o += '<rect class="lie-mow" x="' + (fx0 + 2) + '" y="' + (Z + 8 + k * 28) + '" width="' + (fx1 - fx0 - 4) + '" height="12" fill="#b3ea9e" opacity=".55"/>';
    o += '<ellipse id="lie-sand" cx="' + (W - 50) + '" cy="' + (Z + 40) + '" rx="32" ry="15" fill="#ecd27e" stroke="#c9a94f" stroke-width="2"/>' +
      '<rect id="lie-other" x="0" y="' + (H - 42) + '" width="62" height="42" fill="#2f6b2a"/><circle class="lie-tree" cx="14" cy="' + (H - 30) + '" r="9" fill="#1f4f1b"/><circle class="lie-tree" cx="46" cy="' + (H - 34) + '" r="10" fill="#1f4f1b"/>' +
      '<rect id="lie-tee" x="' + (PX.cx - 22) + '" y="' + (H - 24) + '" width="44" height="15" rx="4" fill="#c9f2b8" stroke="#fff" stroke-width="2"/>' +
      t(52, Z + 14, 'ROUGH') + t(PX.cx, Z + 14, 'FAIRWAY', 'middle', '#1d5c12') + t(W - 50, Z + 14, 'ROUGH') + t(W - 50, Z + 44, 'BUNKER', 'middle', '#7a5a10') +
      t(31, H - 46, 'OTHER') + t(PX.cx + 26, H - 12, 'TEE', 'start', '#1d5c12') + t(4, Z - 4, '↓ toward you', 'start', '#2f6b2a') + '</g>';
    return o;
  }
  // v124: approach proximity benchmarks (ft from the hole), one entry per SG baseline id (pga, lpga, d1m, d1w, scm, scw – see SG.BASELINES).
  // Adding or updating a benchmark is a data-only change here. Each entry:
  //   band: band width in yd (a row covers fromYd up to fromYd + band); open: true = the last row also covers everything beyond it
  //   source / caveat: one line each for the map-key ⓘ; est: { fromYd: 'how the estimate was made' }
  //   rows (sorted by distance), any of these shapes:
  //     [fromYd, ft, tag, sourceId]          tag 'sourced' | 'derived' | 'estimate'  (the prox-benchmarks.json format)
  //     [fromYd, [lowFt, highFt], tag, id]   range -> the ring sits at the middle
  //     [fromYd, lowFt, highFt, estimated?]  range (the original D1 women format)      [fromYd, ft, estimated?]  single number
  // A distance button at Y yd uses the band containing Y (150 -> the 150 band). No band there -> no ring and a
  // '<name>: no data at this distance' note (no extrapolating). A baseline with no entry -> 'No proximity benchmark for <name> yet'.
  // Data: /workspace/prox-benchmarks.json + .md (compiled Nov 1, 2026). D1 women is the original Shot Scope chart, unchanged.
  var PROX_BENCH = {
    pga: { band: 25, source: 'PGA Tour ShotLink (pgatour.com), 2026 season, from the fairway or a par-3 tee',
      caveat: 'Tour stats only count shots that finish on or around the green (big misses left out), so this ring looks tight next to your numbers (every shot, every lie).',
      rows: [[50, 17.2, 'sourced', 'pgatour_2026'], [75, 18.0, 'sourced', 'pgatour_2026'], [100, 20.25, 'sourced', 'pgatour_2026'], [125, 23.6, 'sourced', 'pgatour_2026'],
        [150, 28.4, 'sourced', 'pgatour_2026'], [175, 33.9, 'sourced', 'pgatour_2026'], [200, 41.3, 'sourced', 'pgatour_2026'], [225, 50.1, 'sourced', 'pgatour_2026']] },
    lpga: { band: 25, source: 'LPGA Tour averages from KPMG Performance Insights, July 2024 (season to date)',
      caveat: 'Tour stat, probably only shots finishing on or around the green; the 2025 averages ran about 10% higher.',
      est: { 50: 'PGA Tour 50\u201375 yd \u00d7 the LPGA/PGA ratio at 75\u2013100 yd (0.972)', 200: 'PGA Tour 200\u2013225 yd \u00d7 the LPGA/PGA ratio at 175\u2013200 yd (1.142)' },
      rows: [[50, 16.7, 'estimate', 'est'], [75, 17.5, 'sourced', 'kpmg_wso2024'], [100, 20.1, 'sourced', 'kpmg_wso2024'], [125, 24.8, 'sourced', 'kpmg_wso2024'],
        [150, 31.5, 'sourced', 'kpmg_wso2024'], [175, 38.7, 'sourced', 'kpmg_wso2024'], [200, 47.1, 'estimate', 'est']] },
    d1m: { band: 25, open: true, source: 'Upgame (Trackman), Pac-12 men: 7 teams, 700+ rounds, 2022',
      caveat: 'One conference, user-entered shots, all approach lies (closest to how Strokewise counts).',
      rows: [[50, 21.8, 'sourced', 'upgame_pac12'], [75, 23.2, 'sourced', 'upgame_pac12'], [100, 26.3, 'sourced', 'upgame_pac12'], [125, 29.9, 'sourced', 'upgame_pac12'],
        [150, 34.0, 'sourced', 'upgame_pac12'], [175, 40.6, 'sourced', 'upgame_pac12'], [200, 50.1, 'sourced', 'upgame_pac12'], [225, 60.7, 'sourced', 'upgame_pac12'], [250, 100.1, 'sourced', 'upgame_pac12']] },
    // D1 women: Shot Scope D1 women's chart (ft), 10-yd bands. 180 yd and up are not on the chart: extended from the trend and marked estimated.
    d1w: { band: 10, open: true, source: 'Shot Scope D1 women\u2019s benchmarks', estNote: '180 yd and beyond is our estimate from the trend, not on the chart',
      caveat: 'The chart gives a low\u2013high range per 10 yd; the ring sits at the middle, a rough stand-in for the average.',
      rows: [[40, 12, 18], [50, 14, 20], [60, 15, 22], [70, 16, 24], [80, 18, 26], [90, 20, 28], [100, 22, 32], [110, 24, 36], [120, 26, 40], [130, 28, 45],
        [140, 30, 50], [150, 33, 55], [160, 36, 60], [170, 39, 65], [180, 42, 70, true], [190, 45, 75, true], [200, 48, 80, true]] },
    scm: { band: 50, open: true, source: 'Shot Scope handicap-0 golfers (Golf Monthly, Apr 2025), 50-yd bands',
      caveat: 'Amateur tracker averages: every approach, misses included; not split by gender (mostly men).',
      rows: [[50, 26, 'sourced', 'shotscope_gm'], [100, 38, 'sourced', 'shotscope_gm'], [150, 54, 'sourced', 'shotscope_gm'], [200, 92, 'sourced', 'shotscope_gm']] },
    scw: { band: 25, source: 'Shot Scope \u201cThe Women\u2019s Game, By The Numbers\u201d (May 2026), scratch women',
      caveat: 'Amateur tracker averages: every approach, misses included.',
      est: { 50: '75\u2013100 yd (32 ft) \u00d7 the Pac-12 men ratio 21.8/23.2', 175: '150\u2013175 yd (89 ft) \u00d7 the Pac-12 men ratio 40.6/34.0' },
      rows: [[50, 30.1, 'estimate', 'est'], [75, 32, 'sourced', 'shotscope_women2026'], [100, 42, 'sourced', 'shotscope_women2026'], [125, 60, 'sourced', 'shotscope_women2026'],
        [150, 89, 'sourced', 'shotscope_women2026'], [175, 106.3, 'estimate', 'est']] }
  };
  var BENCH_SHORT = { pga: 'PGA Tour', lpga: 'LPGA', d1m: 'D1 men', d1w: 'D1 women', scm: 'Scratch men', scw: 'Scratch women' };
  function benchName(id) { return BENCH_SHORT[id] || SG.baseline(id).name; }
  function benchHasData(id) { var E = PROX_BENCH[id]; return !!(E && E.rows && E.rows.length); }
  function benchRow(r) { // -> { from, lo, hi, est, tag } for any of the row shapes above
    var v = r[1], lo, hi, est, tag;
    if (Array.isArray(v)) { lo = v[0]; hi = v[1]; tag = r[2]; est = tag === 'estimate'; }
    else if (typeof r[2] === 'number') { lo = v; hi = r[2]; est = !!r[3]; tag = est ? 'estimate' : 'sourced'; }
    else { lo = hi = v; est = r[2] === true || r[2] === 'estimate'; tag = typeof r[2] === 'string' ? r[2] : est ? 'estimate' : 'sourced'; }
    return { from: r[0], lo: lo, hi: hi, est: est, tag: tag, range: lo !== hi }; }
  function proxBench(yd, id) { id = id || 'd1w'; var E = PROX_BENCH[id]; yd = Number(yd); if (!E || !E.rows || !E.rows.length || !isFinite(yd)) return null;
    var band = E.band || 10, R = E.rows.map(benchRow), i = -1; R.forEach(function (r, k) { if (yd >= r.from) i = k; }); if (i < 0) return null;
    var b = R[i], nx = R[i + 1], last = !nx, to = nx ? Math.min(nx.from, b.from + band) : b.from + band;
    if (yd >= to && !(last && E.open)) return null; // a gap between bands, or past the last band: no data at this distance
    return { id: id, name: benchName(id), source: E.source || '', caveat: E.caveat || '', estNote: b.est ? ((E.est && E.est[b.from]) || E.estNote || '') : '', from: b.from, to: to, open: last && !!E.open,
      range: b.range, lo: b.lo, hi: b.hi, ft: (b.lo + b.hi) / 2, est: b.est, tag: b.tag }; }
  function d1Bench(yd) { var B = proxBench(yd, 'd1w'); return B ? { from: B.from, lo: B.lo, hi: B.hi, ft: B.ft, est: B.est } : null; } // kept for the D1 tests / older callers
  // the ring keeps its old id (#d1ring) so the heat layer keeps it on top; data-bench says which benchmark it is
  function benchRing(bucket, id) { var B = proxBench(bucket, id); if (!B) return '';
    var r = B.ft * PX.K, ty = Math.max(14, PX.cy - r - 5), lab = B.name + ' avg ' + Math.round(B.ft) + '\u2019' + (B.est ? ' est.' : '');
    return '<g id="d1ring" class="benchring" data-bench="' + B.id + '" data-ft="' + B.ft + '" data-est="' + (B.est ? 1 : 0) + '"><circle class="d1halo" cx="' + PX.cx + '" cy="' + PX.cy + '" r="' + f1(r) + '" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="5"/>' +
      '<circle cx="' + PX.cx + '" cy="' + PX.cy + '" r="' + f1(r) + '" class="d1line" fill="none" stroke="#e00016" stroke-width="2.6" stroke-dasharray="9 6"/>' +
      '<text class="d1lab" x="' + PX.cx + '" y="' + f1(ty) + '" text-anchor="middle" font-size="11" font-weight="900" fill="#c00012" stroke="#fff" stroke-width="3" paint-order="stroke">' + lab + '</text></g>'; }
  // Zoom: a selected yardage shows the benchmark ring + 10 ft as the green radius; a distance group uses the ring at its midpoint;
  // All 40-200 (or a benchmark with no data) keeps the 60-yd green (90 ft). The green is always PX.Rg px across, so K (px per ft) changes per distance.
  function grpMid(group) { var g = String(group).replace(' yd', '').split(/[-+]/), lo = +g[0], hi = g[1] ? +g[1] : lo + 20; return (lo + hi) / 2; } // '130-160' -> 145, '200+' -> 210
  function proxZoomFt(bucket, group, bench) {
    if (group) bucket = grpMid(group);
    var B2 = proxBench(bucket, bench); return B2 ? B2.ft + 10 : 90; }
  function proxSVG(list, bucket, zoomFt, opts) {
    opts = opts || {}; var BID = opts.bench || 'd1w'; // Compare + PDF: D1 women, as before
    var RFT = zoomFt || proxZoomFt(bucket, null, BID); PX.K = PX.Rg / RFT; var HMAX = RFT * 0.97;
    var out = '<svg id="proxmap" viewBox="0 0 ' + PX.W + ' ' + PX.H + '" role="img" aria-label="Approach proximity">' +
      '<rect class="pbg" width="' + PX.W + '" height="' + PX.H + '" fill="#cfe8c4"/>' + lieStrip() + '<circle class="pgreen" cx="' + PX.cx + '" cy="' + PX.cy + '" r="' + PX.Rg + '" fill="#3da33d" stroke="#145214" stroke-width="4"/>';
    // ring step per zoom: 5 ft under 40 ft, 10 ft under 80, else 15; labels every ring, or every other one at 5-ft steps
    var step = RFT < 40 ? 5 : RFT < 80 ? 10 : 15, rings = []; for (var rf = step; rf < RFT - 2; rf += step) rings.push(rf);
    out += '<g id="proxrings" data-step="' + step + '" data-rft="' + Math.round(RFT) + '">';
    rings.reverse().forEach(function (ft, i) { var lab = step === 5 ? ft % 10 === 0 : true;
      out += '<circle class="pring' + (ft % (step * 2) ? '' : ' pring2') + '" cx="' + PX.cx + '" cy="' + PX.cy + '" r="' + f1(ft * PX.K) + '" fill="none" stroke="#fff" stroke-width="' + (ft % (step * 2) ? 1.2 : 2) + '" stroke-opacity=".85"/>' +
        (lab ? '<text class="ring" x="' + f1(PX.cx + 2 + ft * PX.K * 0.707) + '" y="' + f1(PX.cy + 11 + ft * PX.K * 0.707) + '" font-size="10" font-weight="800" fill="#fff">' + ft + (i === 0 || (step === 5 && i === 1) ? ' ft' : '') + '</text>' : '');
    });
    out += '</g>';
    out += '<circle class="phole" cx="' + PX.cx + '" cy="' + PX.cy + '" r="5" fill="#000"/><line class="ppole" x1="' + PX.cx + '" y1="' + PX.cy + '" x2="' + PX.cx + '" y2="' + (PX.cy - 28) + '" stroke="#000" stroke-width="3"/>' +
      '<path class="pflag" d="M' + PX.cx + ' ' + (PX.cy - 28) + ' l18 6 l-18 6z" fill="#d0213a"/>';
    var seen = {}, tr = '', dots = '', labels = '', pend = [], nd = 0, LN = { rough: 'Rough', deep: 'Deep rough', fairway: 'Fairway', sand: 'Bunker', hazard: 'Hazard', ob: 'OB', recovery: 'Trees' };
    // labels avoid each other, the dots and the canvas edge: try below, above, right, left, then further out
    var boxes = [], hit2 = function (b) { return boxes.some(function (o) { return b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]; }); };
    var lbl = function (x, y, t1, t2, col) {
      var w = Math.max(t1.length, (t2 || '').length) * 7.4 + 4, h = t2 ? 23 : 12, best = null;
      [[0, 19], [0, -12 - h], [12 + w / 2, 4 - h / 2], [-12 - w / 2, 4 - h / 2], [0, 32], [0, -25 - h], [16 + w / 2, 16 - h / 2], [-16 - w / 2, 16 - h / 2], [0, 45], [0, -38 - h]].some(function (o) {
        var cx = Math.max(w / 2 + 2, Math.min(PX.W - w / 2 - 2, x + o[0])), ty = y + o[1], b = [cx - w / 2, ty - 10, cx + w / 2, ty - 10 + h];
        if (!best) best = [cx, ty, b];
        if (!hit2(b) && b[1] >= 22 && b[3] <= PX.H - 2) { best = [cx, ty, b]; return true; }
      });
      boxes.push(best[2]); var cx = best[0], ty = best[1];
      return '<text class="xlbl" x="' + f1(cx) + '" y="' + f1(ty) + '" text-anchor="middle" font-size="11" font-weight="900" fill="' + col + '" stroke="#fff" stroke-width="3" paint-order="stroke">' + esc(t1) +
        (t2 ? '<tspan x="' + f1(cx) + '" dy="11">' + esc(t2) + '</tspan>' : '') + '</text>';
    };
    var clampXY = function (q) { return [Math.max(14, Math.min(PX.W - 14, q[0])), Math.max(36, Math.min(PX.Z - 12, q[1]))]; };
    // where each tracer starts: the lie the regulation shot was hit from (see the strip below the green)
    var sc = {}, starts = '';
    var startAt = function (m) {
      var g = m.fromGroup || 'other', j = sc[g] = (sc[g] || 0) + 1, sp = ((j - 1) % 5 - 2) * 9, row = Math.floor((j - 1) / 5) % 2 * 12;
      if (g === 'fairway') return [PX.cx + sp * 1.4, PX.Z + 72 + row, g];
      if (g === 'rough') {
        var sd = /left$/.test(m.fromDir || '') ? -1 : /right$/.test(m.fromDir || '') ? 1 : (sc.rl || 0) <= (sc.rr || 0) ? -1 : 1; // unknown side -> the emptier side
        if (sd < 0) sc.rl = (sc.rl || 0) + 1; else sc.rr = (sc.rr || 0) + 1;
        return sd < 0 ? [52 + sp, PX.Z + 68 + row, 'rough-left'] : [PX.W - 50 + sp, PX.Z + 98 + row, 'rough-right'];
      }
      if (g === 'sand') return [PX.W - 50 + sp * 0.8, PX.Z + 40, g];
      if (g === 'tee') return [PX.cx + sp, PX.H - 17, g];
      return [30 + sp * 0.6, PX.H - 20 - row, g];
    };
    list.forEach(function (m, i) {
      // PDF report version (view.proxReport): line colour = SG distance group (SG.REPORT_GROUPS); marker = result
      var RG = view.proxReport ? (SG.REPORT_GROUPS.filter(function (g) { return g.id === SG.reportGroup(m.from); })[0] || { color: '#555', halo: '#fff' }) : null;
      var col = RG ? RG.color : m.hit ? '#1e6fd9' : '#e0102a', q, kind, clamped = false, label, label2 = '';
      if (m.hit) {
        if (m.holed) { var jh = seen.h = (seen.h || 0) + 1; q = [PX.cx - 14 + (jh - 1) * 14, PX.cy + 14]; kind = 'holed'; label = ''; }
        else {
          var nod = !m.dir, rr = Math.min(m.ft, HMAX) * PX.K, key = (m.dir || 'n') + Math.round(rr / 8), j = seen[key] = (seen[key] || 0) + 1;
          q = pt(PX.cx, PX.cy, rr, (nod ? 90 : SG.DIR_ANGLE[m.dir]) + (j - 1) * 7); kind = nod ? 'hitnodir' : 'hit';
          clamped = m.ft > HMAX; label = Math.round(m.ft) + '’' + (clamped ? ' ›' : '') + (m.chipIn ? ' (chip-in)' : '');
        }
      } else if (!m.dir) {
        q = [PX.W - 22 - (nd % 6) * 26, 52 + Math.floor(nd / 6) * 34]; nd++; kind = 'missnodir';
        label = m.lie === 'ob' ? 'OB' : Math.round(m.yd) + ' yd';
      } else {
        var r0 = PX.Rg + 12 + (m.proxFt == null ? 30 : Math.min(m.proxFt, 150) * 0.35), jm = seen['m' + m.dir] = (seen['m' + m.dir] || 0) + 1;
        var raw = pt(PX.cx, PX.cy, r0, SG.DIR_ANGLE[m.dir] + (jm - 1) * 8); q = clampXY(raw); clamped = q[0] !== raw[0] || q[1] !== raw[1];
        kind = 'miss'; label = m.lie === 'ob' ? 'OB' : Math.round(m.yd) + ' yd' + (clamped ? ' ›' : ''); label2 = m.lie === 'ob' ? '' : (LN[m.lie] || m.lie);
      }
      var x = f1(q[0]), y = f1(q[1]), st = startAt(m), ox = st[0], oy = st[1];
      if (kind !== 'missnodir') tr += (RG ? '<path d="' + flight(ox, oy, q[0], q[1], i) + '" fill="none" stroke="' + RG.halo + '" stroke-width="5.5" stroke-opacity=".8"/>' : '') +
        '<path class="tracer"' + (RG ? ' data-group="' + SG.reportGroup(m.from) + '"' : '') + ' data-start="' + st[2] + '" data-sx="' + f1(ox) + '" data-sy="' + f1(oy) + '" data-ex="' + x + '" data-ey="' + y + '" d="' + flight(ox, oy, q[0], q[1], i) + '" fill="none" stroke="' + col + '" stroke-width="' + (RG ? 3 : 2.5) + '" stroke-opacity="' + (RG ? 1 : 0.75) + '"/>';
      starts += '<circle class="xstart" data-start="' + st[2] + '" data-hole="' + m.hole + '" cx="' + f1(ox) + '" cy="' + f1(oy) + '" r="4" fill="#fff" stroke="' + col + '" stroke-width="2"/>';
      var attrs = ' class="xdot" data-hd="' + (kind === 'holed' ? 0 : /^miss/.test(kind) ? (m.yd || 0) : (m.proxFt || 0)) + '" data-hu="' + (/^miss/.test(kind) ? 'yd' : 'ft') + '" data-kind="' + kind + '" data-hole="' + m.hole + '" data-from="' + m.from + '"' + (clamped ? ' data-clamped="1"' : '');
      if (kind === 'holed') dots += '<path' + attrs + ' d="M' + x + ' ' + (y - 10) + ' l3 6.5 7 .8 -5.3 4.8 1.5 7 -6.2 -3.6 -6.2 3.6 1.5 -7 -5.3 -4.8 7 -.8z" fill="#ffd23f" stroke="#1e6fd9" stroke-width="2"/>';
      else if (kind === 'hitnodir' || kind === 'missnodir') dots += '<g' + attrs + ' data-x="' + x + '" data-y="' + y + '"><path d="M' + x + ' ' + (y - 10) + ' l10 10 -10 10 -10 -10z" fill="' + (RG && !m.hit ? '#fff' : col) + '" stroke="' + (RG && !m.hit ? col : '#000') + '" stroke-width="' + (RG && !m.hit ? 3.5 : 2) + '"/><text x="' + x + '" y="' + (+y + 4.5) + '" text-anchor="middle" font-size="12" font-weight="900" fill="' + (RG && (!m.hit || RG.halo === '#000') ? '#000' : '#fff') + '">?</text></g>';
      else if (RG && !m.hit) dots += '<g' + attrs + '><circle cx="' + x + '" cy="' + y + '" r="7.5" fill="#fff" stroke="' + col + '" stroke-width="3.5"/><path d="M' + f1(q[0] - 3.5) + ' ' + f1(q[1] - 3.5) + ' l7 7 m0 -7 l-7 7" stroke="#000" stroke-width="2.2"/></g>';
      else dots += '<circle' + attrs + ' cx="' + x + '" cy="' + y + '" r="6.5" fill="' + col + '" stroke="#000" stroke-width="2"/>';
      if (label) pend.push([q[0], q[1], label, label2, RG ? '#000' : m.hit ? '#0b3d91' : '#9b0016']);
      boxes.push([q[0] - 8, q[1] - 10, q[0] + 8, q[1] + 10]);
    });
    pend.forEach(function (p) { labels += lbl(p[0], p[1], p[2], p[3], p[4]); });
    // v124 (page only): crop the empty sky above the green – the LEFT / LONG / RIGHT row sits just above the highest dot, label or the green
    var Y0 = 0;
    if (opts.crop && !nd) { var top = PX.cy - PX.Rg - 8; boxes.forEach(function (b) { top = Math.min(top, b[1] - 10); }); Y0 = Math.max(0, Math.floor(top - 20)); }
    if (Y0) out = out.replace('viewBox="0 0 ' + PX.W + ' ' + PX.H + '"', 'viewBox="0 ' + Y0 + ' ' + PX.W + ' ' + (PX.H - Y0) + '" data-crop="' + Y0 + '"');
    out += tr + starts + dots + labels + '<text class="pdir" x="' + PX.cx + '" y="' + (Y0 + 16) + '" text-anchor="middle" font-size="13" font-weight="800">LONG ↑</text>' +
      '<text class="pdir" x="6" y="' + (Y0 + 16) + '" font-size="13" font-weight="800">◀ LEFT</text><text class="pdir" x="' + (PX.W - 6) + '" y="' + (Y0 + 16) + '" text-anchor="end" font-size="13" font-weight="800">RIGHT ▶</text>' +
      (nd ? '<text class="pdir pnodir" x="' + (PX.W - 8) + '" y="34" text-anchor="end" font-size="11" font-weight="800">missed, no direction ↓</text>' : '');
    if (opts.nobench) out += '<text class="nobenchlab" id="nobenchlab" x="' + PX.cx + '" y="' + (PX.cy - PX.Rg + 17) + '" text-anchor="middle" font-size="10" fill="#3f4c58" stroke="#fff" stroke-width="2.5" paint-order="stroke">' + esc(opts.nobench) + '</text>';
    return out + benchRing(bucket, BID) + '</svg>';
  }
  function proxBenchId() { var r = round() || savedRounds()[0]; return view.proxReport ? 'd1w' : view.proxBench || blOf(r); } // the PDF report keeps D1 women, as before // v124: picked on the page, else the open round's SG baseline
  function proxHTML(all) {
    var D = proxData(), L = D.list, P = SG.proxStats(L), miss = L.filter(function (m) { return !m.hit; });
    // v121: distance chips in a 6-across grid (like the Club performance chips): All first, then 200 down to 40 (farther first, like the map)
    var rail = SG.PROX_BUCKETS.slice(1).reverse().map(function (b) {
      var c = D.counts[b.id];
      return '<button class="ybtn' + (b.id === D.bucket ? ' sel' : '') + '" data-act="proxb" data-v="' + b.id + '" data-n="' + c + '"' + (c ? '' : ' disabled') +
        ' aria-pressed="' + (b.id === D.bucket) + '" aria-label="' + b.yd + ' yards, ' + c + ' shot' + (c === 1 ? '' : 's') + '"><b>' + b.yd + '</b><small>' + (c || '–') + '</small></button>';
    }).join('');
    var bname = view.proxGroup ? view.proxGroup + ' yd group' : D.bucket === 'all' ? 'All 40–200 yd' : D.bucket + ' yd (' + (Number(D.bucket) - 5) + '–' + (Number(D.bucket) + 4) + ')';
    var scope = all ? ' in ' + D.rounds + ' round' + (D.rounds === 1 ? '' : 's') : ' this round';
    var LIE_NM = { all: 'All lies' }, LIE_SH = { all: 'All' }; SG.PROX_LIES.forEach(function (l) { LIE_NM[l.id] = l.name; LIE_SH[l.id] = l.name; });
    var chips = ['all'].concat(SG.PROX_LIES.map(function (l) { return l.id; })).map(function (id) {
      var c = D.lieCounts[id];
      return '<button class="liebtn' + (id === D.lie ? ' sel' : '') + '" data-act="proxlie" data-v="' + id + '" data-n="' + c + '"' + (c ? '' : ' disabled') + ' aria-pressed="' + (id === D.lie) + '" aria-label="' + LIE_NM[id] + ', ' + c + ' shot' + (c === 1 ? '' : 's') + '">' + LIE_SH[id] + ' <small>' + c + '</small></button>';
    }).join('');
    var rows = SG.proxByLie(D.inB), warns = SG.proxWarnings(rows), wid = {}; warns.forEach(function (w) { wid[w.id] = 1; });
    var pct = function (r) { return r.n ? r.hits + '/' + r.n + ' (' + Math.round(r.hitPct) + '%)' : '–'; };
    var lieTab = '<table class="dirtab lietab clubtab" id="lietab"><tr><th>Lie</th><th class="num">Shots</th><th class="num">Greens hit</th><th class="num">Avg hit</th><th class="num">Avg all</th></tr>' +
      rows.map(function (r) { return '<tr data-lie="' + r.id + '" class="' + (wid[r.id] ? 'warn' : '') + (r.id === D.lie ? ' sel' : '') + '"><td>' + (wid[r.id] ? '⚠ ' : '') + r.name + '</td><td class="num">' + r.n + '</td><td class="num">' + pct(r) +
        '</td><td class="num">' + fmtFt(r.avgHitFt) + '</td><td class="num">' + fmtFt(r.avgAllFt) + '</td></tr>'; }).join('') + '</table>';
    var warnHTML = warns.map(function (w) { return '<p class="warnmsg" data-lie="' + w.id + '">⚠ ' + esc(w.text) + '</p>'; }).join('');
    // v124: the red ring follows a benchmark – the round's SG baseline by default (All rounds: the open round's), or the one picked
    // in the small selector on this page (this view only; the round's saved baseline is not changed)
    var BID = proxBenchId(), BNM = benchName(BID), hasB = benchHasData(BID), B1 = !view.proxGroup ? proxBench(D.bucket, BID) : null;
    var bsel = '<label class="benchsel" id="benchsel"><i class="ln dash" aria-hidden="true"></i><select id="proxbench" data-f="proxbench" aria-label="Benchmark ring">' + SG.BASELINES.map(function (b) {
      var has = benchHasData(b.id); return '<option value="' + b.id + '"' + (b.id === BID ? ' selected' : '') + (has ? '' : ' data-nodata="1" class="nodata"') + '>' + benchName(b.id) + (has ? '' : ' (no data)') + '</option>'; }).join('') + '</select></label>';
    var dflt = !view.proxBench || view.proxBench === blOf(round());
    // no ring: the benchmark has no numbers at all, or none for this distance (no extrapolating). All 40–200 never has a ring.
    var nob = !hasB ? 'No proximity benchmark for ' + BNM + ' yet' : !B1 && !view.proxGroup && D.bucket !== 'all' ? BNM + ': no data at this distance' : '';
    var EB = PROX_BENCH[BID] || {}, srcLine = hasB ? '<p id="benchsrc"><b>' + esc(BNM) + '</b>: ' + esc(EB.source || '') + '. ' + esc(EB.caveat || '') + '</p>' : '';
    // the explanations that used to sit on the page now live behind small ⓘ buttons
    var tipTiles = '<b>Shots</b>: approaches in the map below. <b>Greens hit</b>: how many reached the green in regulation. <b>Avg prox · hit</b>: average first-putt distance on the greens you hit. ' +
      '<b>Avg prox · all</b>: hits and misses together (a miss counts its yards left × 3 as feet; OB is left out). ' +
      'One shot per hole, the same as the GIR and Approach-miss maps: the shot that reached the green in regulation (blue), or the regulation miss (red: par 3 = tee shot, par 4 = 2nd shot, par 5 = 3rd shot). ' +
      'A chip-in from 30 yd or closer right after counts as reaching the green (its proximity = the chip distance). Only finished holes count.' +
      (D.outside ? ' <span id="proxout">' + D.outside + ' regulation shot' + (D.outside === 1 ? '' : 's') + ' from outside 40–200 yd (e.g. a par-4 tee shot that missed, or under 35 yd) not shown.</span>' : '');
    var tipDist = 'Each button is the distance the shot was hit from, rounded to the nearest 10 yd, halves up (144 → 140, 145 → 150), so 150 = 145 to 154 yd. The small number is the shot count; greyed-out buttons have none. ' +
      'The lie buttons filter the map and numbers by where the shot was hit from (Rough includes deep rough; Other = trees, hazard and anything else). ⚠ = a lie with 3+ shots and no greens hit, or 30+ points worse than from the fairway.';
    var sw = function (c, b) { return '<i class="sw" style="background:' + c + (b ? ';border:1px solid ' + b : '') + '"></i>'; };
    var tipKey = '<div class="legend proxkey">' + (B1 ? '<span><i class="ln dash"></i>Red dashed ring = ' + esc(BNM) + ' average for this distance</span>' : '') +
      '<span><i class="dot" style="background:#1e6fd9"></i>Blue = hit the green, placed at the first-putt distance (ft) and direction from the hole</span>' +
      '<span><i class="dot" style="background:#e0102a"></i>Red = missed the green, in the miss direction; label = yards left + lie (› = further than the picture, drawn at the edge)</span>' +
      '<span><svg width="14" height="14" viewBox="0 0 20 20" style="flex:none"><path d="M10 1 l9 9 -9 9 -9 -9z" fill="#9aa5ae" stroke="#fff" stroke-width="1.5"/><text x="10" y="14" text-anchor="middle" font-size="11" fill="#fff">?</text></svg>No direction entered: blue sits straight up at its distance, red in the top-right corner</span>' +
      '<span><i class="dot" style="background:#fff;border:1px solid #6d7a86"></i>Where the shot was hit from, on the strip under the green:</span>' +
      '<span>' + sw('#b2e08f', '#4f9e3e') + 'Fairway (middle)</span><span>' + sw('#7dbb64', '#3f8a3a') + 'Rough – left or right from the direction you entered for the shot before, otherwise the side with fewer shots</span>' +
      '<span>' + sw('#f2d785', '#c29a2e') + 'Bunker</span><span>' + sw('#d2f0c0', '#4f9e3e') + 'Tee box (par 3s)</span><span>' + sw('#4e8f43', '#2f6b2a') + 'Trees / hazard drop / other</span>' +
      '<span><b class="star">★</b>Holed out</span><span>White rings: distance from the hole in ft. The scale changes per distance: for a yardage the green reaches the benchmark ring + 10 ft; for All (or a benchmark with no numbers yet), 60 yd across (90 ft). Hits farther than that sit at the edge (label ends with ›).</span></div>' +
      (B1 ? '<p id="d1note">Red dashed ring = ' + esc(BNM) + ' average proximity from ' + B1.from + (B1.open ? '+' : '\u2013' + B1.to) + ' yd (' + (B1.range ? B1.lo + '\u2013' + B1.hi + ' ft range, ring at the middle' : (Math.round(B1.ft * 10) / 10) + ' ft') + (B1.est ? '; est. = estimate' + (B1.estNote ? ': ' + esc(B1.estNote) : '') : '') + '). A distance button uses the band that contains it (' + B1.from + ' yd \u2192 ' + B1.from + (B1.open ? '+' : '\u2013' + B1.to) + ' yd).</p>' : '') + srcLine +
      '<p id="benchnote">The ring uses ' + (dflt ? (all ? 'the open round\u2019s benchmark (' + esc(BNM) + ') for every round shown' : 'this round\u2019s benchmark (' + esc(BNM) + ')') : esc(BNM) + ', picked above (just for this view – the round\u2019s own benchmark is ' + esc(benchName(blOf(round()))) + ')') +
      '. Change it with the small selector next to Distance. ' + (nob ? nob + ' \u2013 no ring, and the green shows 60 yd across (90 ft). ' : '') + (function () { var no = SG.BASELINES.filter(function (b) { return !benchHasData(b.id); }).map(function (b) { return benchName(b.id); }); return no.length ? 'No proximity numbers yet for: ' + no.join(', ') + '.' : 'The benchmarks use different definitions and years \u2013 compare against one, not across them.'; })() + '</p>';
    return '<div class="mapsum clubsum proxsum" id="mapsum"><span><b>' + P.n + '</b> approach' + (P.n === 1 ? '' : 'es') + ' from <b id="proxsel">' + bname + '</b>' + (D.lie === 'all' ? '' : ', <b id="proxliesel">' + LIE_NM[D.lie] + '</b>') + scope + '</span>' +
      tipBtn('proxtiles', 'i', 'About these numbers') + '</div>' + tipText('proxtiles', tipTiles) +
      (D.auto ? '<p class="proxnote" id="proxauto">Showing your most-played distance – tap another or All.</p>' : '') +
      '<div class="quickview clubqv proxqv" id="proxstats">' +
      clubQV('shots', 'Shots', P.n, P.n === 1 ? 'approach' : 'approaches') +
      clubQV('gir', 'Greens hit', P.n ? P.hits + ' / ' + P.n : '–', P.n ? Math.round(P.hitPct) + '%' : '&nbsp;') +
      clubQV('proxhit', 'Avg prox', fmtFt(P.avgHitFt), 'greens hit') + clubQV('proxall', 'Avg prox', fmtFt(P.avgAllFt), 'all shots') + '</div>' +
      '<div id="proxwarn">' + warnHTML + '</div>' +
      '<div class="proxhrow"><h3 class="clubh3">Distance (yd)' + tipBtn('proxdist', 'i', 'About the distance buttons') + '</h3>' + bsel + '</div>' + tipText('proxdist', tipDist) +
      '<div class="proxrail" id="proxrail" role="group" aria-label="Approach yardage">' +
      '<button class="yall' + (D.bucket === 'all' ? ' sel' : '') + '" data-act="proxb" data-v="all" data-n="' + D.counts.all + '" aria-pressed="' + (D.bucket === 'all') + '" aria-label="All 40 to 200 yards, ' + D.counts.all + ' shot' + (D.counts.all === 1 ? '' : 's') + '"><b>All</b><small>' + D.counts.all + '</small></button>' + rail + '</div>' +
      '<div class="proxctl"><p class="proxlbl">Hit from</p><span class="heatslot" id="heatslot"></span></div><div class="liechips" id="liechips" role="group" aria-label="Starting lie">' + chips + '</div>' +
      '<div class="proxwrap">' + proxSVG(L, view.proxGroup ? grpMid(view.proxGroup) : D.bucket, null, { bench: BID, crop: !view.proxReport, nobench: nob }) + '</div>' +
      '<div class="legend proxleg"><span><i class="dot" style="background:#1e6fd9"></i>Hit green</span><span><i class="dot" style="background:#e0102a"></i>Missed</span>' +
      (B1 ? '<span id="benchleg"><i class="ln dash"></i>' + esc(BNM) + ' avg' + (all && dflt ? ' (this round\u2019s benchmark)' : '') + '</span>' : nob ? '<span class="nobench" id="nobench">' + esc(nob) + '</span>' : '') +
      tipBtn('proxkey', 'i', 'How to read the map') + '</div>' + tipText('proxkey', tipKey) +
      '<h3>By lie – ' + bname + '</h3>' + lieTab +
      '<h3>Misses by direction</h3>' + dirTable(miss).replace('(not plotted)', '(drawn as ?)').replace('class="dirtab"', 'class="dirtab clubtab"');
  }
  // ---------- pin-location map ----------
  // ONE entry per finished hole with a pin set (its regulation shot - see SG regApproach)
  function pinData() {
    var D = { holes: [], noPin: 0, rounds: 0 };
    (view.mapScope === 'all' ? savedRounds() : [round()]).forEach(function (r) {
      var S = SG.summarize(r, 'pga'); D.rounds++; D.noPin += S.noPin;
      S.pinHoles.forEach(function (x) { if (!x.appr) return; var o = { hole: x.hole, pin: x.pin }; for (var k in x.appr) o[k] = x.appr[k]; o.gir = x.gir; D.holes.push(o); });
    });
    return D;
  }
  function onPin(list, p) { return list.filter(function (x) { return x.pin === p; }); }
  // Green geometry for the pin map (viewBox 360 x 460)
  var PG = { cx: 180, cy: 230, rx: 110, ry: 140, K: 2.4 };
  function pinXY(p) {
    var r = 0, c = 0; SG.PIN_GRID.forEach(function (rw, i) { var j = rw.indexOf(p); if (j >= 0) { r = i; c = j; } });
    // inside its segment, pulled in a little for the corners so the flag sits on the visible green
    var k = (r !== 1 && c !== 1) ? 0.85 : 1;
    return [PG.cx + (c - 1) * 0.6 * PG.rx * k, PG.cy + (r - 1) * 0.62 * PG.ry * k];
  }
  function pinSVG(p, gir, miss) {
    var SC = [0, 0]; SG.PIN_GRID.forEach(function (rw, i) { var j = rw.indexOf(p); if (j >= 0) SC = [i, j]; });
    var P = pinXY(p), w = 2 * PG.rx / 3, hh = 2 * PG.ry / 3, x0 = PG.cx - PG.rx, y0 = PG.cy - PG.ry;
    var out = '<svg id="pinmap" viewBox="0 0 360 460" role="img" aria-label="Approaches with the pin ' + SG.PIN_NAME[p] + '">' +
      '<defs><clipPath id="gclip"><ellipse cx="' + PG.cx + '" cy="' + PG.cy + '" rx="' + PG.rx + '" ry="' + PG.ry + '"/></clipPath></defs>' +
      '<rect width="360" height="460" fill="#cfe8c4"/><ellipse cx="' + PG.cx + '" cy="' + PG.cy + '" rx="' + PG.rx + '" ry="' + PG.ry + '" fill="#3da33d" stroke="#145214" stroke-width="4"/>' +
      '<rect clip-path="url(#gclip)" x="' + f1(x0 + w * SC[1]) + '" y="' + f1(y0 + hh * SC[0]) + '" width="' + f1(w) + '" height="' + f1(hh) + '" fill="#ffd23f" fill-opacity=".28"/>';
    [1, 2].forEach(function (i) {
      out += '<line clip-path="url(#gclip)" x1="' + f1(x0 + w * i) + '" y1="0" x2="' + f1(x0 + w * i) + '" y2="460" stroke="#fff" stroke-opacity=".6" stroke-dasharray="5 5"/>' +
        '<line clip-path="url(#gclip)" x1="0" y1="' + f1(y0 + hh * i) + '" x2="360" y2="' + f1(y0 + hh * i) + '" stroke="#fff" stroke-opacity=".6" stroke-dasharray="5 5"/>';
    });
    var seen = {}, lbl = function (x, y, t1, t2, cls) {
      return '<text class="' + cls + '" x="' + f1(x) + '" y="' + f1(y) + '" text-anchor="middle" font-size="11.5" font-weight="900" fill="#000" stroke="#fff" stroke-width="3" paint-order="stroke">' + esc(t1) +
        (t2 ? '<tspan x="' + f1(x) + '" dy="12">' + esc(t2) + '</tspan>' : '') + '</text>';
    };
    // greens hit: relative to the pin (white = in regulation, grey = not in regulation)
    gir.forEach(function (m) {
      var ft = m.holed ? 0 : m.ft, nod = !m.holed && !m.dir, rr = Math.min(ft, 45) * PG.K;
      var key = m.holed ? 'h' : (m.dir || 'n') + Math.round(rr / 8), j = seen[key] = (seen[key] || 0) + 1;
      var q = m.holed ? [P[0] - 12 + (j - 1) * 14, P[1] + 14] : pt(P[0], P[1], rr, (nod ? 90 : SG.DIR_ANGLE[m.dir]) + (j - 1) * 9);
      // a green hit stays on the green: if the scaled distance would leave the picture's green, pull it back along the same line
      var inside = function (z) { var u = (z[0] - PG.cx) / PG.rx, v = (z[1] - PG.cy) / PG.ry; return u * u + v * v <= 0.97; }, cl = '';
      if (!m.holed && !inside(q)) { var lo = 0, hi = 1; for (var it = 0; it < 20; it++) { var md = (lo + hi) / 2; if (inside([P[0] + (q[0] - P[0]) * md, P[1] + (q[1] - P[1]) * md])) lo = md; else hi = md; }
        q = [P[0] + (q[0] - P[0]) * lo, P[1] + (q[1] - P[1]) * lo]; cl = ' data-edge="1"'; }
      var x = f1(q[0]), y = f1(q[1]);
      if (m.holed) out += '<path class="pdot" data-hd="0" data-hu="ft" data-kind="holed" data-hole="' + m.hole + '" d="M' + x + ' ' + (y - 10) + ' l3 6.5 7 .8 -5.3 4.8 1.5 7 -6.2 -3.6 -6.2 3.6 1.5 -7 -5.3 -4.8 7 -.8z" fill="#ffd23f" stroke="#000" stroke-width="2"/>';
      else if (nod) out += '<g class="pdot" data-kind="nodir" data-hole="' + m.hole + '" data-x="' + x + '" data-y="' + y + '"><path d="M' + x + ' ' + (y - 9) + ' l9 9 -9 9 -9 -9z" fill="' + (m.gir ? '#fff' : '#bdbdbd') + '" stroke="#000" stroke-width="2.5"/><text x="' + x + '" y="' + (y + 4.5) + '" text-anchor="middle" font-size="12" font-weight="900">?</text></g>';
      else out += '<circle class="pdot" data-hd="' + ft + '" data-hu="ft" data-kind="' + (m.gir ? 'gir' : 'hit') + '"' + cl + ' data-hole="' + m.hole + '" cx="' + x + '" cy="' + y + '" r="7" fill="' + (m.gir ? '#fff' : '#bdbdbd') + '" stroke="#000" stroke-width="2.5"/>';
      if (!m.holed) out += lbl(q[0], q[1] + 20, Math.round(ft) + ' ft', '', 'plbl');
    });
    // missed greens: off the green in the miss direction
    var LN = { rough: 'Rough', deep: 'Deep rough', fairway: 'Fairway', sand: 'Bunker', hazard: 'Hazard', ob: 'OB', recovery: 'Trees' };
    var nd = 0;
    miss.forEach(function (m) {
      if (!m.dir) { // direction unknown: red "?" diamonds in the lower-right corner, so every hole is still drawn
        var qx = 334 - nd * 26, qy = 392; nd++;
        out += '<g class="pdot" data-kind="missnodir" data-hole="' + m.hole + '"><path d="M' + qx + ' ' + (qy - 10) + ' l10 10 -10 10 -10 -10z" fill="#e0102a" stroke="#000" stroke-width="2.5"/>' +
          '<text x="' + qx + '" y="' + (qy + 5) + '" text-anchor="middle" font-size="12" font-weight="900" fill="#fff">?</text></g>' +
          lbl(qx, qy + 24, m.lie === 'ob' ? 'OB' : Math.round(m.dist) + (m.unit === 'ft' ? ' ft' : ' yd'), '', 'mlbl');
        return;
      }
      var a = SG.DIR_ANGLE[m.dir], t = a * Math.PI / 180, j = seen['m' + m.dir] = (seen['m' + m.dir] || 0) + 1;
      var e = [PG.cx + PG.rx * Math.cos(t), PG.cy - PG.ry * Math.sin(t)], out1 = 18 + ((j - 1) % 2) * 30;
      var q = [e[0] + out1 * Math.cos(t), e[1] - out1 * Math.sin(t)];
      var side = Math.floor((j - 1) / 2) * 34 * (j % 4 < 2 ? 1 : -1);
      q = [q[0] + side * Math.sin(t), q[1] + side * Math.cos(t)];
      q = [Math.max(24, Math.min(336, q[0])), Math.max(14, Math.min(420, q[1]))];
       out += '<circle class="pdot" data-hd="' + (m.dist || 0) + '" data-hu="' + (m.unit || 'yd') + '" data-kind="miss" data-gir="' + (m.gir ? 1 : 0) + '" data-hole="' + m.hole + '" cx="' + f1(q[0]) + '" cy="' + f1(q[1]) + '" r="7" fill="#e0102a" stroke="#000" stroke-width="2.5"/>' +
        lbl(q[0], q[1] + 20, m.lie === 'ob' ? 'OB' : Math.round(m.dist) + (m.unit === 'ft' ? ' ft' : ' yd'), m.lie === 'ob' ? '' : (LN[m.lie] || (m.lie === 'green' ? 'Green' : m.lie)), 'mlbl');
    });
    out += '<line x1="' + f1(P[0]) + '" y1="' + f1(P[1]) + '" x2="' + f1(P[0]) + '" y2="' + f1(P[1] - 30) + '" stroke="#000" stroke-width="3"/>' +
      '<path d="M' + f1(P[0]) + ' ' + f1(P[1] - 30) + ' l20 6 l-20 6z" fill="#d0213a"/><circle id="pinflag" cx="' + f1(P[0]) + '" cy="' + f1(P[1]) + '" r="5" fill="#000"/>' +
      '<text x="180" y="16" text-anchor="middle" font-size="14" font-weight="800">BACK ↑</text><text x="180" y="452" text-anchor="middle" font-size="14" font-weight="800">FRONT ↓ (toward you)</text>';
    return out + '</svg>';
  }
  function pinMapHTML(all) {
    var D = pinData(), seg = view.pinSeg, scope = all ? ' in ' + D.rounds + ' round' + (D.rounds === 1 ? '' : 's') : ' this round';
    var note = D.noPin ? '<p class="help muted" id="nopin">' + D.noPin + ' finished hole' + (D.noPin === 1 ? ' has' : 's have') + ' no pin set – not included.</p>' : '';
    if (!seg) {
      var out = '<p class="mapsum" id="mapsum"><b>' + D.holes.length + '</b> hole' + (D.holes.length === 1 ? '' : 's') + ' with a pin set' + scope + '</p>' + note +
        '<p class="help">Badge = number of <b>holes</b> with the pin there. Tap a part of the green to see how your approach into the green finished on each of those holes.</p>' +
        '<div class="pinwrap"><div class="pinlbl">BACK ↑</div><div class="pingreen pinstats" id="pinstats">';
      SG.PIN_GRID.forEach(function (rw) { rw.forEach(function (c) {
        var hs = onPin(D.holes, c), n = hs.length, g = hs.filter(function (x) { return x.gir; }).length;
        out += '<button data-act="pinseg" data-v="' + c + '" data-n="' + n + '" class="' + (hs.length ? 'has' : '') + '"><span class="badge">' + n + '</span>' + SG.PIN_NAME[c].replace(' ', '<br>') +
          (hs.length ? '<small>GIR ' + g + '/' + hs.length + '</small>' : '') + '</button>';
      }); });
      return out + '</div><div class="pinlbl">FRONT ↓ (toward you)</div></div>';
    }
    var hs = onPin(D.holes, seg), gir = hs.filter(function (x) { return x.hit; }), miss = hs.filter(function (x) { return !x.hit; }), g = hs.filter(function (x) { return x.gir; }).length;
    var nodirMiss = miss.filter(function (m) { return !m.dir; }).length;
    var out2 = '<button class="big" data-act="pinseg" data-v="">‹ All pin positions</button>' +
      '<p class="mapsum" id="mapsum">Pin <b>' + SG.PIN_NAME[seg] + '</b>: ' + hs.length + ' hole' + (hs.length === 1 ? '' : 's') + scope + '</p>' +
      '<div class="fwcounts" id="pinsum"><span>Greens hit (GIR) <b>' + gir.length + '</b></span><span>+ Missed <b>' + miss.length + '</b></span><span>= <b>' + hs.length + '</b> hole' + (hs.length === 1 ? '' : 's') + '</span></div>' +
      pinSVG(seg, gir, miss) +
      '<div class="legend"><span><i class="dot" style="background:#fff"></i>Green hit in regulation (GIR) – first-putt distance (ft) and direction from the pin; kept on the green if it runs past the drawn edge</span>' +
      '<span><svg width="20" height="20" viewBox="0 0 20 20" style="flex:none"><path d="M10 1 l9 9 -9 9 -9 -9z" fill="#fff" stroke="#000" stroke-width="2"/><text x="10" y="14.5" text-anchor="middle" font-size="12" font-weight="900">?</text></svg>Green hit, no direction entered (drawn straight up)</span>' +
      '<span><b class="star">★</b>Holed out</span>' +
      '<span><i class="dot" style="background:#e0102a"></i>Missed green – drawn off the green in the miss direction; label = yards left to the pin + where it finished</span>' +
      '<span><svg width="20" height="20" viewBox="0 0 20 20" style="flex:none"><path d="M10 1 l9 9 -9 9 -9 -9z" fill="#e0102a" stroke="#000" stroke-width="2"/><text x="10" y="14.5" text-anchor="middle" font-size="12" font-weight="900" fill="#fff">?</text></svg>Missed green, no direction entered (drawn in the bottom-right corner)</span></div>' +
      '<h3>Missed greens by direction</h3>' + dirTable(miss).replace('(not plotted)', '(drawn as ?)') +
      '<p class="help muted">One dot per hole. GIR holes (on the green in par − 2 strokes or fewer) count as greens hit, placed by the first-putt distance and direction. ' +
      'Every other hole is a miss: the regulation shot (par 3 = tee shot, par 4 = 2nd, par 5 = 3rd), drawn where it finished. GIR + missed = holes. A chip-in from 30 yd or closer counts as reaching the green. ' +
      'Front = toward you. Distances on the green are feet; off the green, yards.</p>' + note;
    return out2;
  }
  function stat(l, v) { return '<div class="stat"><b>' + v + '</b><span>' + l + '</span></div>'; }

  // ---------- CSV ----------
  function localDate(iso) { var t = new Date(iso); return t.getFullYear() + '-' + ('0' + (t.getMonth() + 1)).slice(-2) + '-' + ('0' + t.getDate()).slice(-2); }
  function csvFor(list) {
    var rows = [['date', 'course', 'hole', 'par', 'hole_yards', 'shot', 'from_lie', 'from_dist', 'from_unit', 'to_lie', 'to_dist', 'to_unit',
      'distance_hit_yd', 'miss', 'penalty', 'category', 'bucket', 'expected_before', 'expected_after', 'strokes_gained', 'club', 'layup', 'hole_score', 'baseline', 'pin', 'gir', 'regulation']];
    list.forEach(function (r) {
      r.holes.forEach(function (h, hi) {
        var a = SG.analyzeHole(h, blOf(r));
        a.shots.forEach(function (s) {
          rows.push([localDate(r.date), r.course, hi + 1, h.par, SG.holeYards(h), s.n, s.start.lie, s.start.dist, unit(s.start.lie), s.end.lie,
            s.end.dist, s.end.lie === 'holed' ? '' : unit(s.end.lie), s.hit == null ? '' : s.hit, s.dir, s.pen, CAT_NAME[s.cat], s.bucket,
            s.eStart.toFixed(3), s.eEnd.toFixed(3), s.sg.toFixed(3), s.club || '', s.layup ? 'yes (SG excluded)' : '', a.done ? a.strokes : '', blLabel(blOf(r)), SG.normPin(h.pin), a.done ? (a.gir ? 'yes' : 'no') : '', a.done && a.regShot === s.n - 1 ? (a.gir ? 'GIR' : 'miss') : '']);
        });
      });
    });
    return rows.map(function (row) { return row.map(function (v) {
      v = String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(','); }).join('\r\n') + '\r\n';
  }
  function exportCSV(list, name) {
    var csv = csvFor(list), file;
    try { file = new File([csv], name, { type: 'text/csv' }); } catch (e) { file = null; }
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file] }).catch(function (e) { if (e && e.name !== 'AbortError') download(csv, name); });
      return;
    }
    download(csv, name);
  }
  function download(csv, name, type, msg) {
    var url = URL.createObjectURL(new Blob([csv], { type: type || 'text/csv' }));
    var a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 4000);
    toast(msg || (/\.json$/.test(name) ? 'Backup downloaded' : 'CSV downloaded'));
  }
  function fileName(r) { return 'golf-' + (r ? localDate(r.date) + (r.course ? '-' + r.course.replace(/[^a-z0-9]+/gi, '-') : '') : 'all-rounds') + '.csv'; }

  // ---------- actions ----------
  function newRow(h, after) {
    var prev = h.rows[after];
    return { loc: prev && prev.loc === 'green' ? 'green' : '', dist: '', dir: '', pen: false };
  }

  document.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-act]'); if (!b || b.disabled) return;
    var act = b.getAttribute('data-act'), v = b.getAttribute('data-v'), k = +b.getAttribute('data-k');
    var r = round(), h = r && r.holes[view.hole];
    switch (act) {
      case 'liveshare': if (!live || !r) return; live.start(r.id); view.liveCard = true; render(); liveSend(r); return;
      case 'livecard': view.liveCard = true; render(); return;
      case 'liveclose': view.liveCard = false; render(); return;
      case 'livesend': if (live && r) liveSend(r); return;
      case 'livecopy': if (live && r) liveCopy(live.info(r.id).link); return;
      case 'livestop': if (!live || !r || !confirm('Stop sharing? The link will stop showing this round.')) return; live.stop(r.id); view.liveCard = false; toast('Sharing stopped'); render(); return;
      case 'new': view.from = null; view.hmenu = null; view.newBl = null; newRound(((document.getElementById('course') || {}).value || '').trim()); return;
      case 'resume': view.from = null; view.roundId = localStorage.getItem(CUR); goHole(firstOpenHole(round()), true); return;
      case 'open': view.pdf = null; view.addr = null; view.send = null; view.mv = null; view.roundId = b.getAttribute('data-id'); view.from = view.screen === 'history' ? 'history' : null; view.screen = 'summary'; view.map = null; render(); window.scrollTo(0, 0); return;
      case 'home': view.screen = 'home'; view.from = null; view.hmenu = null; break;
      case 'archive': view.screen = 'archive'; view.hmenu = null; render(); window.scrollTo(0, 0); return;
      case 'plus': view.hmenu = view.hmenu ? (view.hmenu === 'new' ? 'menu' : null) : 'menu'; render(); return;
      case 'newform': view.hmenu = 'new'; render(); var ci = document.getElementById('course'); if (ci) ci.focus(); return;
      case 'menuclose': view.hmenu = null; view.near = null; view.newC = null; view.newAdd = false; view.newName = ''; view.newBl = null; view.crsOpen = false; render(); return;
      case 'nearopen': case 'neargo': case 'nearname': case 'nearmore': case 'nearpick': case 'nearcand': case 'nearlayout': case 'nearretry': case 'nearmanual': case 'nearclose': nearAct(act, b); return;
      case 'crsopen': view.crsOpen = !view.crsOpen; render(); return;
      case 'crsnew': view.newC = null; view.newAdd = true; view.crsOpen = false; render(); var cn = document.getElementById('course'); if (cn) cn.focus(); return;
      case 'naddtee': newEdit(true); return;
      case 'nedit': newEdit(false); return;
      case 'npedit': view.newPEdit = true; view.crsOpen = false; render(); var npi = document.getElementById('pname'); if (npi) { npi.focus(); npi.select(); } return;
      case 'npcancel': view.newPEdit = false; render(); return;
      case 'namechange': view.nameSheet = playerName() ? 'change' : 'first'; view.hmenu = null; render(); var pn2 = document.getElementById('pname'); if (pn2) pn2.focus(); return;
      case 'nameskip': localStorage.setItem(NA, '1'); view.nameSheet = null; render(); return;
      case 'namecancel': view.nameSheet = null; render(); return;
      case 'history': view.hmenu = null; view.mv = null; view.screen = 'history'; view.notice = null; render(); window.scrollTo(0, 0); return;
      case 'backup': backupRounds(); return;
      case 'pdf': case 'pdfshare': case 'stpdf': pdfAct(act); return;
      case 'info': { infoOpen[v] = !infoOpen[v]; var t = b && document.getElementById(b.getAttribute('aria-controls'));
        [].slice.call(document.querySelectorAll('[data-act="info"]')).forEach(function (x) { if (x.getAttribute('data-v') === v) x.setAttribute('aria-expanded', !!infoOpen[v]); }); // icon + its label
        if (t) t.hidden = !infoOpen[v]; return; }
      case 'discard': { // remove the round for good: rounds list (History), current-round key, and from the next backup upload
        var did = b.getAttribute('data-id'), dr2 = rounds.filter(function (x) { return x.id === did; })[0];
        if (!confirm('Discard this round? Shots will be deleted.')) return;
        rounds = rounds.filter(function (x) { return x.id !== did; }); if (live) live.stop(did); save();
        if (localStorage.getItem(CUR) === did) localStorage.removeItem(CUR);
        if (view.roundId === did) view.roundId = null;
        view.screen = 'home'; view.map = null; toast(dr2 ? 'Round discarded' : 'Nothing to discard'); render(); window.scrollTo(0, 0); return;
      }
      case 'rpcancel': view.restore = null; view.preview = null; view.screen = 'archive'; render(); return;
      case 'rpview': view.mapScope = 'round'; view.preview = view.restore.rounds.filter(function (x) { return x.id === b.getAttribute('data-id'); })[0]; view.map = null; view.pdf = null; view.screen = 'summary'; render(); window.scrollTo(0, 0); return;
      case 'rpback': view.preview = null; view.map = null; view.screen = 'restorepick'; render(); window.scrollTo(0, 0); return;
      case 'rpsel': view.restore.sel[b.getAttribute('data-id')] = b.checked; render(); return;
      case 'rpselone': { var id1 = b.getAttribute('data-id'); view.restore.sel[id1] = !view.restore.sel[id1]; render(); return; }
      case 'rpall': { var all1 = b.checked; view.restore.rounds.forEach(function (x) { view.restore.sel[x.id] = all1; }); render(); return; }
      case 'rpgo': restoreSelected(); return;
      case 'gdltoggle': { var gt = gdlItem(b.getAttribute('data-id')); if (!gt || gt.status === 'same') return; view.restore.sel[gt.round.id] = !view.restore.sel[gt.round.id]; render(); return; }
      case 'gdlmissing': view.restore.items.forEach(function (it) { if (it.status === 'new') view.restore.sel[it.round.id] = true; }); render(); return;
      case 'gdlclear': view.restore.sel = {}; render(); return;
      case 'pdfclose': view.pdf = null; render(); return;
      case 'story': case 'storyshare': case 'storyclose': case 'storyfull': case 'storyfullclose': case 'storyzoom': storyAct(act); return;
      case 'setname': setName((document.getElementById('pname') || {}).value); return;
      case 'editname': view.editName = true; render(); var pi = document.getElementById('pname'); if (pi) pi.focus(); return;
      case 'cancelname': view.editName = false; view.needName = null; render(); return;
      case 'histplayer': view.histPlayer = v || null; render(); return;
      case 'stats': view.hmenu = null; view.screen = 'stats'; view.stSel = null; view.stPlayer = undefined; view.stOpen = {}; view.stPmB = 'all'; view.pdf = null; render(); window.scrollTo(0, 0); return; // v110
      case 'stplayer': view.stPlayer = v || null; view.histPlayer = view.stPlayer; view.stSel = null; render(); return;
      case 'strange': view.stMode = v || 'all'; view.stSel = null; render(); return; // v116: all | 5 | sel
      case 'stround': view.stMode = 'sel'; view.stRid = b.getAttribute('data-id'); view.stSel = null; render(); return;
      case 'stcmp': view.stCmp = !view.stCmp; view.stSel = null; render(); return;
      case 'stcat': (view.stOpen = view.stOpen || {})[v] = !view.stOpen[v]; render(); return; // v125: open / close a category (v126: also the Putt misses sub-menu, v = 'pmiss')
      case 'stpmb': view.stPmB = v || 'all'; render(); return; // v126: Putt misses distance chip
      case 'stcur': var oD = statsData(); if (!oD.openP) return; view.stMode = 'sel'; view.stRid = oD.openP.id; view.stCmp = true; view.stSel = null; (view.stOpen = view.stOpen || {}).scoring = true; render();
        var sc2 = document.getElementById('stcat-scoring'); if (sc2) window.scrollTo(0, window.scrollY + sc2.getBoundingClientRect().top - 8); return;
      case 'stpt': var sc = b.getAttribute('data-c'), si = +b.getAttribute('data-i'); view.stSel = view.stSel && view.stSel.c === sc && view.stSel.i === si ? null : { c: sc, i: si }; render(); return;
      case 'gdconnect': case 'gdsignin': case 'gdsync': case 'gdrestore': case 'gdrclose': case 'gdrback': case 'gdrplayer': case 'gdrfile': case 'gddisconnect': gdAct(act, b); return;
      case 'delHist': {
        var dr = rounds.filter(function (x) { return x.id === b.getAttribute('data-id'); })[0]; if (!dr) return;
        if (!confirm('Delete the round from ' + new Date(dr.date).toLocaleDateString() + (dr.course ? ' (' + dr.course + ')' : '') + ' for good?')) return;
        rounds = rounds.filter(function (x) { return x !== dr; }); save();
        if (localStorage.getItem(CUR) === dr.id) localStorage.removeItem(CUR);
        toast('Round deleted'); render(); return;
      }
      case 'about': view.back = view.screen; view.screen = 'about'; render(); window.scrollTo(0, 0); return;
      case 'aboutBack': view.screen = view.back && view.back !== 'about' ? view.back : 'home'; render(); window.scrollTo(0, 0); return;
      case 'setbl': setBaseline(v); return;
      case 'map': if (v === 'pmiss') view.pmG = b.closest('[data-stx="lag"]') ? 'lag' : view.pmG === 'lag' ? null : view.pmG; // v117: the Lag tile opens the map on Over 10 ft
        view.map = v; view.pinSeg = null; view.heat = null; view.proxBench = null; if (v === 'prox') view.proxB = null; view.mapScope = view.mapScope || 'round'; render(); return;
      case 'pinseg': view.pinSeg = v || null; render(); var pv = document.getElementById('mapview'); if (pv) pv.scrollTop = 0; return;
      case 'mapclose': view.map = null; render(); return;
      case 'pinopen': view.pinOpen = true; view.menu = null; view.dirk = null; render(); return;
      case 'pinclose': view.pinOpen = false; render(); return;
      case 'pinset': h.pin = SG.normPin(v); save(); render(); return;
      case 'pinclear': h.pin = ''; save(); render(); return;
      case 'proxb': { var mv0 = document.getElementById('mapview'), st0 = mv0 ? mv0.scrollTop : 0; view.proxB = v; render(); var mv1 = document.getElementById('mapview'); if (mv1) mv1.scrollTop = st0; return; }
      case 'proxlie': { var mvl = document.getElementById('mapview'), stl = mvl ? mvl.scrollTop : 0; view.proxLie = v; render(); var mvl2 = document.getElementById('mapview'); if (mvl2) mvl2.scrollTop = stl; return; }
      case 'tkknow': view.tkKnow = !view.tkKnow; render(); return;
      case 'stx': view.stx = view.stx || {}; view.stx[b.getAttribute('data-v')] = !view.stx[b.getAttribute('data-v')]; render(); return;
      case 'sendopen': sendOpen(); return;
      case 'mvstart': case 'mvall': case 'mvone': case 'mvtoggle': case 'mvcancel': case 'mvsheet': case 'mvclose': case 'mvcustom': case 'mvpick': case 'mvnew': case 'mvyes': mvAct(act, b); return;
      case 'sendclose': view.send = null; render(); return;
      case 'sendfile': sendFile(); return;
      case 'sendcode': sendCode(); return;
      case 'addopen': view.addr = { step: 'pick' }; render(); return;
      case 'addclose': view.addr = null; render(); return;
      case 'addcode': var tx = (document.getElementById('addcode') || {}).value || ''; addRead(tx, tx); return;
      case 'addyes': addYes(); return;
      case 'sgtoggle': view.sgOpen = !view.sgOpen; render(); if (view.sgOpen) { var sh = document.getElementById('sgsec'); if (sh) window.scrollTo(0, sh.getBoundingClientRect().top + window.scrollY - 90); } return;
      case 'clubsel': view.club = v; view.heat = null; render(); return;
      case 'compare': view.screen = 'compare'; render(); window.scrollTo(0, 0); return;
      case 'bzopen': view.bz = { scope: b.getAttribute('data-v'), rid: b.getAttribute('data-id') || view.roundId, from: view.screen === 'summary' ? 'summary' : 'history', R: 0 };
        view.screen = 'birdie'; render(); window.scrollTo(0, 0); return;
      case 'bzscope': view.bz.scope = b.getAttribute('data-v'); view.bz.R = 0; render(); return;
      case 'bzback': view.roundId = view.bz.rid; view.screen = 'summary'; render(); window.scrollTo(0, 0); return;
      case 'cmpn': view.cmpN = Math.max(1, cmpRounds().n + (+v)); render(); return;
      case 'cmpkind': view.cmpKind = v; render(); return;
      case 'cmpgrp': view.cmpGrp = v; render(); return;
      case 'cmpside': view.cmpSide = v; render(); return;
      case 'heat': view.heat = v; render(); return;
      case 'replay': view.replay = Math.max(0, +v || 0); render(); return;
      case 'rpgreen': view.rpGreen = true; render(); return;
      case 'rpgreenback': view.rpGreen = false; render(); return;
      case 'rphole': { view.rpGreen = false; var nh = +v; if (nh >= 0 && nh < round().holes.length) { view.replay = nh; render(); var rv = document.getElementById('replayview'); if (rv) rv.scrollTop = rv.scrollHeight; } return; }
      case 'rpclose': view.replay = null; view.rpGreen = false; document.body.classList.remove('noscroll'); render(); return;
      case 'pmg': { var mvq = document.getElementById('mapview'), stq = mvq ? mvq.scrollTop : 0; view.pmG = v; render(); var mvq2 = document.getElementById('mapview'); if (mvq2) mvq2.scrollTop = stq; return; }
      case 'puttn': { var mvp = document.getElementById('mapview'), stp = mvp ? mvp.scrollTop : 0; view.puttN = v; render(); var mvp2 = document.getElementById('mapview'); if (mvp2) mvp2.scrollTop = stp; return; }
      case 'mapscope': view.mapScope = v; view.heat = null; render(); var mv = document.getElementById('mapview'); if (mv) mv.scrollTop = 0; return;
      case 'courses': view.screen = 'courses'; render(); window.scrollTo(0, 0); return;
      case 'profile': view.hmenu = null; view.screen = 'archive'; view.bagAdd = null; view.bagEdit = null; view.editName = false; render(); window.scrollTo(0, 0); return;
      case 'wedges': view.hmenu = null; view.screen = 'wedges'; view.wOpen = null; view.wOther = null; view.wEdit = false; view.wFull = null; view.wFlight = 'high'; render(); window.scrollTo(0, 0); return;
      case 'wact': wAct(v, b); return;
      case 'help': view.hmenu = null; view.screen = 'help'; render(); window.scrollTo(0, 0); return; // v128
      case 'mygame': view.hmenu = null; view.prLog = null; view.screen = 'mygame'; render(); window.scrollTo(0, 0); return; // v141
      case 'mgperiod': view.mgPeriod = v; render(); return;
      case 'prlog': case 'prcancel': case 'prdel': case 'prspoke': case 'prmin': case 'prsave': case 'prdrill': prAct(act, v, k, b); return;
      case 'mgplayer': view.mgPlayer = v; render(); return;
      case 'bag': view.hmenu = null; view.screen = 'bag'; view.bagAdd = null; view.bagEdit = null; view.bagCondOpen = false; render(); window.scrollTo(0, 0); return;
      case 'bagact': bagAct(v, b); return;
      case 'ncourse': { var cc = courseById(b.getAttribute('data-id')); view.crsOpen = false;
        if (cc && !(view.newC && view.newC.id === cc.id)) { var rt0 = rememberedTee(cc); view.newC = { id: cc.id, tee: rt0 || (cc.tees[0] || {}).name || '', fold: !!rt0 }; view.newAdd = false; } render(); return; }
      case 'ntee': if (view.newC) { view.newC.tee = v; view.newC.fold = true; } render(); return; // v114: picking folds the list
      case 'nteeopen': if (view.newC) view.newC.fold = false; render(); return;
      case 'crsadd': cardOpen('archive'); return;
      case 'cardmanual': cardOpen('new', COURSES.blankCourse(String(view.newName || '').trim())); return;
      case 'cardback': cardBack(); return;
      case 'cardsel': view.card.sel = +b.getAttribute('data-i'); render(); return;
      case 'cardaddtee': { var cc2 = view.card.course; cc2.tees.push({ name: '', yards: COURSES.pad([]) }); view.card.sel = cc2.tees.length - 1; render(); var tn = document.querySelector('[data-cf="tee"]'); if (tn) tn.focus(); return; }
      case 'cardteeq': { var ct = view.card.course.tees[view.card.sel]; if (ct) ct.name = v; render(); return; }
      case 'carddeltee': { var cc3 = view.card.course; if (cc3.tees.length > 1 && confirm('Remove the ' + (cc3.tees[view.card.sel].name || 'tee') + ' tee?')) { cc3.tees.splice(view.card.sel, 1); view.card.sel = 0; render(); } return; }
      case 'cardsave': cardSave(); return;
      case 'cardedit': { var ce = courseById(b.getAttribute('data-id')); if (ce) cardOpen('archive', JSON.parse(JSON.stringify(ce)), 'review'); return; }
      case 'coursedel': { var cd = courseById(b.getAttribute('data-id')); if (!cd || !confirm('Delete ' + cd.name + '? Rounds already played keep their numbers.')) return;
        saveCourses(courses().filter(function (x) { return x.id !== cd.id; })); backupDirty(3000); toast('Course deleted'); render(); return; }
      case 'vsave': voiceSave(); return;
      case 'vedit': view.voice.stage = 'edit'; render(); return;
      case 'vdict': case 'vretry': dictOpen(); return; // Retry: clear the box and refocus it (same tap opens the keyboard)
      case 'vgo': dictSubmit(); return;
      case 'vcancel': dictStop(); view.voice = null; render(); return;
      case 'dirpick': view.dirk = k; view.menu = null; break;
      case 'dirclose': view.dirk = null; break;
      case 'setdir': h.rows[view.dirk].dir = v || ''; view.dirk = null; save(); break;
      case 'csvall': exportCSV(rounds, fileName(null)); return;
      case 'csv': exportCSV([r], fileName(r)); return;
      case 'delRound':
        if (!confirm('Delete this round for good?')) return;
        rounds = rounds.filter(function (x) { return x !== r; }); save();
        if (localStorage.getItem(CUR) === r.id) localStorage.removeItem(CUR);
        view.screen = view.from === 'history' ? 'history' : 'home'; break;
      case 'summary':
        if (b.getAttribute('data-end') === '1') { // Finish round: mark every holed-out hole finished, keep the round in History, clear 'Continue round'
          var rr = round(); rr.holes.forEach(function (hh) { if (!hh.finished && hh.par && SG.analyzeHole(hh).complete) hh.finished = true; });
          if (live) live.finish(rr.id);
          var F2 = SG.foldStubs(rounds); rounds = F2.rounds; if (localStorage.getItem(CUR) === rr.id) localStorage.removeItem(CUR);
          save(); gdSoon(1500); toast('Round saved to Rounds');
        }
        view.screen = 'summary'; if (gdOn && gdState.pending) gdSoon(300); render(); window.scrollTo(0, 0); return;
      case 'backHole': goHole(view.hole); return;
      case 'goHole': goHole(+b.getAttribute('data-i')); return;
      case 'prev': goHole(view.hole - 1); return;
      case 'next': goHole(view.hole + 1, true); return;
      case 'par': h.par = +v; view.parEdit = null; save(); break;
      case 'paredit': view.parEdit = view.parEdit === view.hole ? null : view.hole; break;
      case 'rowedit': view.edk = { h: view.hole, k: k }; view.menu = null; view.dirk = null; break; // v115: tap a tight line to edit that shot
      case 'addShot': {
        var a = SG.analyzeHole(h);
        if (a.bad != null) { toast(hintText(h, a)); var bk = a.bad; render(); focusDist(bk); return; }
        h.rows.push(newRow(h, h.rows.length - 1)); save(); view.menu = null; view.edk = null; render();
        focusDist(h.rows.length - 1); return;
      }
      case 'finish': {
        var af = SG.analyzeHole(h);
        if (!af.complete) { toast(hintText(h, af)); return; }
        h.finished = true; save(); gdSoon(1500); view.menu = null;
        toast('Hole ' + (view.hole + 1) + ': ' + af.strokes + ' (' + toPar(af.strokes - h.par) + ')');
        break;
      }
      case 'reopen': h.finished = false; view.edk = null; save(); break;
      case 'pen': h.rows[k].pen = !h.rows[k].pen; save(); break;
      case 'del':
        if (!confirm('Delete row ' + (k + 1) + ' (' + (h.rows[k].dist || '') + ' ' + (LOC_SHORT[h.rows[k].loc] || '') + ')?')) return;
        h.rows.splice(k, 1); view.menu = null; view.edk = null; save(); break;
      case 'menu': view.menu = view.menu === k ? null : k; break;
      case 'insBefore': h.rows.splice(k, 0, newRow(h, k - 1)); view.menu = null; view.edk = { h: view.hole, k: k }; save(); render(); focusDist(k); return;
      case 'insAfter': { var nr = newRow(h, k); if (h.rows[k].holeOut) { delete h.rows[k].holeOut; nr.holeOut = true; } // the new shot is now the one that went in
        h.rows.splice(k + 1, 0, nr); view.menu = null; view.edk = { h: view.hole, k: k + 1 }; save(); render(); focusDist(k + 1); return; }
    }
    render();
  });

  function setBaseline(id) {
    var r = round(); if (!r || r.baseline === id) return;
    var y = window.scrollY; r.baseline = id; save(); render(); window.scrollTo(0, y);
    toast('Now comparing with ' + blLabel(id));
  }
  document.addEventListener('change', function (ev) {
    if (ev.target && ev.target.id === 'addroundfile') { // v97 Add a round from a file
      var af = ev.target.files && ev.target.files[0]; if (!af) return;
      var ar = new FileReader(); ar.onload = function () { addRead(String(ar.result)); }; ar.onerror = function () { view.addr = { step: 'pick', err: 'Could not read that file.' }; render(); };
      ar.readAsText(af); ev.target.value = ''; return;
    }
    if (ev.target && ev.target.id === 'restorefile') {
      var f = ev.target.files && ev.target.files[0]; if (!f) return;
      var rd = new FileReader(); rd.onload = function () { restoreFrom(String(rd.result)); }; rd.onerror = function () { view.notice = { text: 'Could not read that file.', bad: true }; render(); };
      rd.readAsText(f); ev.target.value = ''; return;
    }
    var t = ev.target, f = t.getAttribute('data-f'); if (!f) return;
    if (f === 'proxbench') { var mvb = document.getElementById('mapview'), stb = mvb ? mvb.scrollTop : 0; view.proxBench = t.value; render(); var mvb2 = document.getElementById('mapview'); if (mvb2) mvb2.scrollTop = stb; return; } // v124: this view only
    if (f === 'baseline' && t.id === 'mgbl') { view.mgBl = t.value; render(); return; } // v141 My Game: compare with (this page only)
    if (f === 'baseline') { if (t.id === 'sumbl') setBaseline(t.value); else if (t.id === 'stbl') { view.stBl = t.value || ''; view.stSel = null; render(); } return; }
    var h = round().holes[view.hole], k = +t.getAttribute('data-k'), row = h.rows[k];
    if (f === 'loc') {
      var v = t.value, was = row.loc;
      row.loc = v;
      if (v === 'ob') { row.dist = ''; row.pen = false; }
      if (was === 'ob' && v !== 'ob') row.dist = '';
      if (v === 'holed' || v === 'holedx') delete row.holeOut; // already "in the hole"
      save(); render();
      if (v !== 'ob' && row.dist === '') focusDist(k);
    } else if (f === 'dir') { row.dir = t.value; save(); render(); }
    else if (f === 'club') { if (t.value) row.club = t.value; else delete row.club; delete row.wedgeY; delete row.wedgeF; delete row.wedgeAuto; delete row.wedgeOff; save(); }
    else if (f === 'wladder') {
      var we = /^w([hl])(\d+)$/.exec(t.value), wf = we && (we[1] === 'l' ? 'low' : 'high'), wr = we && WEDGES.rowsOf(wedges(), wf)[we[2]];
      delete row.wedgeAuto; delete row.wedgeOff; if (wr && wr.club) { row.club = wr.club; row.wedgeY = +we[2]; row.wedgeF = wf; } else if (!t.value) { delete row.club; delete row.wedgeY; delete row.wedgeF; } // "Choose carry…" = no club
      save(); render();
    }
    else if (f === 'layup') { if (t.checked) row.layup = true; else delete row.layup; save(); refreshInfo(h); }
    else if (f === 'holeout') setHoleOut(h, k, t.checked);
  });
  // v90 "Hole out" box: only one row per hole can be the hole-out. Ticking it clears any other tick, and shots
  // after it are removed (after a confirm). The row's Loc is left alone, so the lie of the shot that went in is kept.
  function setHoleOut(h, k, on) {
    var row = h.rows[k]; if (!row || k === 0) return;
    if (!on) { delete row.holeOut; save(); render(); return; }
    var after = h.rows.length - 1 - k;
    if (after > 0 && !confirm('Shot ' + (k + 1) + ' went in? ' + (after === 1 ? 'Shot ' + (k + 2) + ' comes after it and will be deleted.' : 'Shots ' + (k + 2) + '–' + h.rows.length + ' come after it and will be deleted.'))) { render(); return; }
    h.rows.splice(k + 1); h.rows.forEach(function (r2, j) { if (j !== k) delete r2.holeOut; });
    row.holeOut = true; view.menu = null; save(); render();
    if (blank0(row.dist)) focusDist(k);
  }
  function blank0(v) { return v === '' || v == null; }

  document.addEventListener('input', function (ev) { if (ev.target && ev.target.id === 'bzslider') bzUpdate(+ev.target.value); if (ev.target && ev.target.id === 'course') view.newName = ev.target.value;
    if (ev.target && ev.target.id === 'nearq' && view.near) { view.near.q = ev.target.value; var nr = document.getElementById('nearres'), html = nearResHTML(); if (nr) nr.outerHTML = html || '<span id="nearres"></span>'; else ev.target.insertAdjacentHTML('afterend', html); } });
  document.addEventListener('change', function (ev) { if (ev.target && ev.target.id === 'newbl') view.newBl = ev.target.value; });
  document.addEventListener('change', function (ev) { if (ev.target && ev.target.id === 'prdate' && view.prLog && /^\d{4}-\d\d-\d\d$/.test(ev.target.value)) view.prLog.date = ev.target.value; }); // v142
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' && ev.target && ev.target.id === 'pname' && !ev.isComposing) { ev.preventDefault(); setName(ev.target.value); } });
  document.addEventListener('input', function (ev) {
    if (!ev.target || ev.target.id !== 'clusr') return;
    view.clus = +ev.target.value; try { localStorage.setItem('golfsg.heatclus.v1', String(view.clus)); } catch (e) {}
    var mv = document.getElementById('mapview'), st = mv ? mv.scrollTop : 0; render();
    var mv2 = document.getElementById('mapview'); if (mv2) mv2.scrollTop = st; var r2 = document.getElementById('clusr'); if (r2) r2.focus();
  });
  // Voice card edit fields: update the parsed shot in place
  function vField(t) {
    var f = t.getAttribute && t.getAttribute('data-vf'); if (!f || !view.voice || !view.voice.p) return false;
    var p = view.voice.p;
    if (f === 'dist') { t.value = t.value.replace(/[^0-9]/g, '').slice(0, 3); p.dist = t.value === '' ? null : +t.value; p.distUnit = ''; p.extra = null; }
    else if (f === 'shot') p.shot = +t.value || undefined;
    else if (f === 'pen' || f === 'layup' || f === 'holeOut') p[f] = t.checked;
    else p[f] = t.value || undefined;
    if (f === 'loc') { p.holedx = false; if (p.loc === 'holed') delete p.holeOut; if (p.loc !== 'green' && p.loc !== 'holed') p.putt = false; }
    p.empty = false; return f;
  }
  document.addEventListener('input', function (ev) { vField(ev.target); cField(ev.target); });
  function cField(t) {
    var f = t.getAttribute && t.getAttribute('data-cf'); if (!f || !view.card) return;
    var c = view.card.course, i = +t.getAttribute('data-i');
    if (f === 'name') { c.name = t.value; return; }
    if (f === 'tee') { c.tees[view.card.sel].name = t.value; var chip = document.querySelector('.revtees [data-i="' + view.card.sel + '"]'); if (chip) chip.textContent = teeLabel(c.tees[view.card.sel], view.card.sel);
      [].slice.call(document.querySelectorAll('#teequick .tq')).forEach(function (q) { var on = q.getAttribute('data-v').toLowerCase() === t.value.trim().toLowerCase(); q.classList.toggle('sel', on); q.setAttribute('aria-pressed', on); }); return; }
    t.value = t.value.replace(/[^0-9]/g, '').slice(0, f === 'par' ? 1 : 3);
    var v = t.value === '' ? null : +t.value;
    if (f === 'par') c.pars[i] = v; else c.tees[view.card.sel].yards[i] = v;
    cardRefresh();
    if (f === 'par' && t.value) { var nx = document.querySelector('[data-cf="par"][data-i="' + (i + 1) + '"]'); if (nx) nx.focus(); } // one digit: hop to the next hole
  }
  document.addEventListener('change', function (ev) { var f = vField(ev.target); if (f === 'loc' || f === 'club' || f === 'shot') render(); });
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' && ev.target && ev.target.id === 'vtext' && !ev.isComposing) { ev.preventDefault(); dictSubmit(); } });
  // ---------- v95 Wedge ladder on the scoring page ----------
  // Wedge yardages are CARRY distances, not distances to the pin (a 50 yd pin downhill may want a 40 yd carry that runs out).
  // So any shot 100 yd or less (not on the green, not OB) gets a dropdown of the ladder instead of the club picker: three carries
  // around the pin distance (WEDGES.carries) in both flights, grouped High / Low (v95b; v95 listed all 16). Nothing is preselected; yardages with no club yet are shown greyed.
  // Picking one sets row.club (so SG / club stats work as before) plus row.wedgeY + row.wedgeF (which carry, which flight).
  // If no yardage has a club yet, the normal club picker shows.
  function wLadderFor(row) { if (row.loc === 'ob' || !WEDGES.inRange(row.dist)) return null; var w = wedges(); return WEDGES.ladder(w).length ? WEDGES.fullLadder(w) : null; }
  function wLadderPick(row, L) { // the ladder entry this shot was given (a v94 automatic pick just keeps its club)
    if (!row.club || !row.wedgeY || row.wedgeAuto) return null;
    return L.filter(function (x) { return x.set && x.y === +row.wedgeY && x.f === (row.wedgeF || 'high') && x.row.club === row.club; })[0] || null;
  }
  function wDetailHTML(e) {
    var r = e.row, x = [r.lean ? 'Lean ' + WEDGES.name(WEDGES.LEAN, r.lean) : '', r.hinge ? 'Hinge ' + WEDGES.name(WEDGES.HINGE, r.hinge) : ''].filter(Boolean).join(' · ');
    var it = function (l, v) { return '<span><i>' + l + '</i>' + esc(v || '–') + '</span>'; };
    return '<div class="wladet" id="wladet-' + e.f + e.y + '">' + it('Flight', WEDGES.name(WEDGES.FLIGHTS, e.f)) + it('Carry', e.y + ' yd') + it('Club', WEDGES.clubLabel(r.club)) + it('Ball', WEDGES.name(WEDGES.BALL, r.ball) || r.ballNote) + it('Position', WEDGES.name(WEDGES.POS, r.pos) || r.posNote) + (x ? '<small>' + esc(x) + '</small>' : '') + '</div>';
  }
  function ladderRowHTML(h, k, row, shotNo, dis, hoBox) {
    // v95b: list only 3 carries around the pin distance (both flights); a chosen carry outside them still shows
    var F = wLadderFor(row), cur = wLadderPick(row, F), C = WEDGES.carries(row.dist), L = F.filter(function (e) { return C.indexOf(e.y) >= 0 || (cur && e === cur); }), wv = function (e) { return 'w' + e.f.charAt(0) + e.y; }, val = cur ? wv(cur) : row.club ? 'c:' + row.club : '';
    var o = '<div class="clubrow wladder" data-club="' + k + '"><label class="clublbl"><span>Wedge</span><select data-f="wladder" data-k="' + k + '" aria-label="Wedge carry row ' + shotNo + '"' + dis + '><option value=""' + (val ? '' : ' selected') + '>Choose carry…</option>' +
      WEDGES.FLIGHTS.map(function (f) { /* grouped by flight, sorted by yardage */ return '<optgroup label="' + f[1] + ' flight">' + L.filter(function (e) { return e.f === f[0]; }).map(function (e) {
        return '<option value="' + wv(e) + '"' + (val === wv(e) ? ' selected' : '') + (e.set ? '' : ' disabled') + '>' + esc(WEDGES.ladderLabel(e)) + '</option>'; }).join('') + '</optgroup>'; }).join('') +
      (row.club && !cur ? '<option value="c:' + esc(row.club) + '" selected>' + esc(row.club) + '</option>' : '') + '</select></label>' +
      (k === 0 && Number(h.par) !== 3 ? '<label class="layup"><input type="checkbox" data-f="layup" data-k="0"' + (row.layup ? ' checked' : '') + dis + '> Layup <small>(not in SG)</small></label>' : '') + hoBox;
    return o + (cur ? wDetailHTML(cur) : '') + '</div>';
  }
  function clubRowRefresh(h, k) { // swap just that shot's club line (keeps the keyboard up in the distance box)
    var el = document.querySelector('.clubrow[data-club="' + k + '"]'); if (!el) return;
    var a = AH(h), tmp = document.createElement('div'); tmp.innerHTML = rowHTML(h, a, h.rows[k], k, !!h.finished && a.complete);
    var fresh = tmp.querySelector('.clubrow[data-club="' + k + '"]'); if (fresh) el.parentNode.replaceChild(fresh, el);
  }
  // Distance typing: update data without re-rendering (keeps the keyboard up)
  document.addEventListener('input', function (ev) {
    var t = ev.target; if (!t.hasAttribute || !t.hasAttribute('data-row')) return;
    t.value = t.value.replace(/[^0-9]/g, '').slice(0, 3);
    var h = round().holes[view.hole], k = +t.getAttribute('data-row');
    var wasL = !!wLadderFor(h.rows[k]), wasC = WEDGES.carries(h.rows[k].dist).join();
    h.rows[k].dist = t.value === '' ? '' : +t.value; save();
    if ((wasL && wasC !== WEDGES.carries(h.rows[k].dist).join()) || wasL !== !!wLadderFor(h.rows[k])) clubRowRefresh(h, k);
    refreshInfo(h);
  });
  // Update the per-shot info lines in place (no re-render, so taps and the keyboard aren't disturbed)
  function refreshInfo(h) {
    var a = AH(h), hint = document.getElementById('hint');
    if (hint) hint.textContent = hintText(h, a);
    var fb = document.querySelector('[data-act="finish"]'); if (fb) fb.disabled = !(a.complete && h.par);
    h.rows.forEach(function (row, k) {
      var el = document.querySelector('.sinfo[data-info="' + k + '"]'); if (el) el.innerHTML = infoHTML(a.shots[k]);
      var rw = document.querySelector('.srow[data-k="' + k + '"]'); if (rw) rw.classList.toggle('bad', a.bad === k);
      var ob = rw && rw.querySelector('.obtxt'); if (ob) ob.textContent = prevDist(h, k);
      var tl = document.querySelector('.tline[data-k="' + k + '"]'); if (tl) { var tmp = document.createElement('div'); tmp.innerHTML = tightHTML(h, a, k, !!h.finished && a.complete); tl.parentNode.replaceChild(tmp.firstChild, tl); } // v115: Hit fills in as the next distance is typed
    });
  }

  function firstOpenHole(r) {
    for (var i = 0; i < 18; i++) { if (!SG.analyzeHole(r.holes[i]).done) return i; }
    return 17;
  }

  gdReturn(); render(); gdInit();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    // When a new version is installed, reload once so the update shows right away.
    var hadController = !!navigator.serviceWorker.controller, reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (hadController && !reloaded) { reloaded = true; location.reload(); }
    });
    window.addEventListener('load', function () { navigator.serviceWorker.register('./sw.js').catch(function () {}); });
  }
  window.__golf = { card: function () { return view.card; }, statsData: function () { return statsData(); }, statsRound: function (id, bl) { return statsRound(rounds.filter(function (r) { return r.id === id; })[0], bl || ''); }, scorecardHTML: function () { var r = round(); return r ? scorecardHTML(r, SG.summarize(r, blOf(r))) : ''; }, voiceState: function () { return { dict: !!(view.voice && view.voice.stage === 'dict'), timer: !!dictTimer }; }, d1Bench: d1Bench, proxBench: proxBench, PROX_BENCH: PROX_BENCH, proxZoomFt: proxZoomFt, proxSVG: proxSVG, pinSVG: function () { return pinReportSVG(SG.pinSegments(pinDataRound())); }, csvFor: csvFor, rounds: function () { return rounds; } };
})();
