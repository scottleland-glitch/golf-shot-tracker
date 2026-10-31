/* Pin High (formerly Golf Shot Tracker) - UI (v4: shot rows + selectable SG baselines). Data lives in localStorage on the phone. */
(function () {
  'use strict';
  // Family watching a shared round (?watch=<token>): a read-only live scorecard. Nothing below runs, so this phone's own rounds,
  // backups and settings are never read or changed by the viewer.
  var LIVE_DB = (window.GOLF_CONFIG || {}).liveDb || '';
  var APP_VER = 'Pin High ' + ((window.GOLF_CONFIG || {}).appVersion || ''); // v107: shown small at the bottom of Settings and Home
  if (window.LIVE && LIVE.watchId(location.search)) {
    document.title = 'Pin High · Live'; document.body.classList.add('lvbody');
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
    view.screen = 'hole'; view.hole = Math.max(0, Math.min(17, i)); view.menu = null; view.liveCard = false; view.dirk = null; view.pinOpen = false; view.voice = null; micAbort();
    render(); window.scrollTo(0, 0);
    var h = round().holes[view.hole];
    if (focus && h.rows.length === 1 && h.rows[0].dist === '') focusDist(0);
  }
  function focusDist(k) { var el = document.querySelector('input[data-row="' + k + '"]'); if (el) el.focus(); }
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
    if (view.screen !== 'summary') view.send = null; if (view.screen !== 'history') view.addr = null; // v97 sheets
    if (view.screen !== 'home') { if (view.hmenu !== 'new') { view.newC = null; view.newAdd = false; } view.crsOpen = false; view.nameSheet = null; }
    if (view.hmenu !== 'new') view.newPEdit = false;
    document.body.classList.toggle('noscroll', !!(view.pinOpen && view.screen === 'hole'));
    if (view.screen === 'about') el.innerHTML = aboutHTML();
    else if (view.screen === 'history') el.innerHTML = historyHTML();
    else if (view.screen === 'stats') el.innerHTML = statsHTML();
    else if (view.screen === 'compare') { el.innerHTML = compareHTML2(); applyCompare(); }
    else if (view.screen === 'restorepick') el.innerHTML = restorePickHTML();
    else if (view.screen === 'archive') el.innerHTML = archiveHTML();
    else if (view.screen === 'card') el.innerHTML = cardHTML();
    else if (view.screen === 'courses') el.innerHTML = coursesHTML();
    else if (view.screen === 'bag') el.innerHTML = bagHTML();
    else if (view.screen === 'profile') { view.screen = 'archive'; el.innerHTML = archiveHTML(); } // v102: old Profile → Settings
    else if (view.screen === 'wedges') el.innerHTML = wedgesHTML();
    else if (view.screen === 'birdie') { view.bzD = null; el.innerHTML = birdieHTML(); }
    else if (view.screen === 'home' || !round()) el.innerHTML = homeHTML();
    else if (view.screen === 'hole') el.innerHTML = '<div class="frostpage roundpage' + roundTheme() + '">' + holeHTML() + (view.pinOpen ? pinHTML() : '') + (view.replay != null ? replayHTML() : '') + '</div>';
    else if (view.screen === 'about') el.innerHTML = aboutHTML();
    else { el.innerHTML = '<div class="frostpage roundpage' + roundTheme() + '">' + summaryHTML() + (view.send && round() && view.send.id === round().id ? sendSheetHTML(round()) : '') + (view.mv && view.mv.from === 'summary' && view.mv.sheet ? mvSheetHTML() : '') + (view.map ? mapHTML() : '') + (view.replay != null ? replayHTML() : '') + '</div>'; if (view.map) applyHeat(); if (view.preview) previewOnly(el); }
    document.body.classList.toggle('onhome', !!el.querySelector('#home'));
    if (view.screen !== 'hole') document.body.classList.toggle('noscroll', !!(view.map && view.screen === 'summary'));
    if (view.replay != null) document.body.classList.add('noscroll');
    if (view.screen !== 'about') infoize(el);
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
  function makeReport() {
    var r = round(); if (!r) return Promise.reject(new Error('No round'));
    var R = reportData(r), S = R.S, P = SG.pdfSafe, player = playerName() || r.player || '', dateTxt = new Date(r.date).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    return loadJsPDF().then(function () {
      var doc = new window.jspdf.jsPDF({ unit: 'pt', format: 'letter', orientation: 'portrait' }), M = 36, PW = 612, PH = 792, y;
      doc.setProperties({ title: 'Pin High round report – ' + (r.course || '') + ' ' + dateTxt, author: player, creator: 'Pin High' });
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
        font(9); ink(110); T((player ? player + ' · ' : '') + (r.course || 'Round') + ' · ' + dateTxt, M, 26); T('Pin High', PW - M, 26, { align: 'right' });
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
      y = header('Round report');
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
      y = note('Proximity = average distance from the hole after approach shots. 1st putt misses = first putts under 10 ft that were missed. Lag putts = first putts over 10 ft that finished inside 3 ft.', M, y + 4);
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
      [['Approach', SG.APPR_BUCKETS.map(function (b) { return b.id; })], ['Short game', ['0-20 yd']], ['Putting', ['0-5 ft', '5-15 ft', '15-30 ft', '30+ ft']]].forEach(function (g) {
        dist.push([g[0], '', '', '']); g[1].forEach(function (b) { var c = S.buckets[b]; dist.push([b, String(c.n), c.n ? fmtSG(c.sg) : '-', g[0] === 'Approach' ? (c.proxN ? Math.round(c.proxFt) + ' ft' : '-') : '']); }); });
      y = table(dist, M, y, [260, 90, 90, 100], { group: function (row) { return row[1] === '' && /^(Approach|Short game|Putting)$/.test(row[0]); }, cont: 'Strokes gained (continued)' });
      y = note('Approach = shots from more than 20 yd off the green (par-3 tee shots included); 20-60 = over 20 up to under 60 yd, other ranges include the lower number. Short game = off the green from 20 yd and in. Avg to pin after = feet on the green, yards x 3 off it, 0 if holed; penalty/OB shots left out.', M, y + 6) + 12;
      heading('Same round vs every baseline', M, y); y += 16;
      y = table([['Baseline', 'Tee', 'Approach', 'Short', 'Putting', 'Total']].concat(SG.BASELINES.map(function (b) { var X = SG.summarize(r, b.id);
        return [b.name + (b.status === 'estimated' ? ' (est.)' : '') + (b.id === R.bl ? '  <' : ''), fmtSG(X.cats.tee.sg), fmtSG(X.cats.approach.sg), fmtSG(X.cats.short.sg), fmtSG(X.cats.putting.sg), fmtSG(X.sgTotal)]; })), M, y, [190, 70, 70, 70, 70, 70]);
      y = note('< = the baseline this report uses. (est.) = estimated baseline (no published table).', M, y + 6);
      // ---- map pages ----
      var segs = SG.pinSegments(pinDataRound());
      var pages = [['Tee shots – fairways', 'fw'], ['Greens in regulation', 'gir'], ['Approach misses', 'miss'], ['Pin location', 'pin'],         'PROX', ['Putting – 1st putts', 'putt', { puttN: '1' }], ['Putting – 2nd putts', 'putt', { puttN: '2' }]].concat(
        (function () { var D = pmissData(false); return SG.PMISS_GROUPS.filter(function (g) { return D.counts[g.id]; }).reverse().map(function (g) { return ['1st putt misses (<10 ft) – ' + g.name, 'pmiss', { pmG: g.id }]; }); })());
      var plist = S.proxList.filter(function (m) { return SG.reportGroup(m.from); }), gsum = SG.REPORT_GROUPS.map(function (g) {
        var L = plist.filter(function (m) { return SG.reportGroup(m.from) === g.id; }); return { g: g, L: L, P: SG.proxStats(L) }; }).filter(function (x) { return x.L.length; });
      var pi = pages.indexOf('PROX');
      pages.splice.apply(pages, [pi, 1].concat(gsum.map(function (x, k) { return ['Proximity – ' + x.g.name, 'prox', { proxReport: true, proxGroup: x.g.id }, x.g, k === 0]; })));
      if (savedRounds().length > 1) pages.push(['Tee shots – all rounds', 'fw', null, null, false, 'heat'], ['GIR – all rounds', 'gir', null, null, false, 'heat']);
      var chain = Promise.resolve();
      pages.forEach(function (pg) {
        chain = chain.then(function () {
          if (pg[5] === 'heat') { var hm = heatReport(pg[1]); if (!hm.svg) return;
            return svgToPng(hm.svg, 1.5).then(function (im) { doc.addPage(); var yy = header(pg[0]), maxW = PW - 2 * M, sc = Math.min(maxW / im.w, (pg[1] === 'fw' ? 430 : 360) / im.h), w = im.w * sc, h = im.h * sc;
              hm.lines.forEach(function (L) { font(L.b ? 10 : 9, !!L.b); var tl = doc.splitTextToSize(P(L.t), maxW); doc.text(tl, M, yy); yy += tl.length * 12 + 2; }); yy += 4;
              doc.addImage(im.data, 'JPEG', M + (maxW - w) / 2, yy, w, h); yy += h + 14;
              var ramp = [{ k: 'sw', c: '#0050ff', t: 'Blue = a few shots' }, { k: 'sw', c: '#00e63c', t: 'Green' }, { k: 'sw', c: '#fff000', t: 'Yellow' }, { k: 'sw', c: '#e60000', t: 'Red = the most shots' }];
              legendBox(pg[1] === 'fw' ? ramp.concat([{ k: 'sw', c: '#7fd16a', t: 'Fairway' }, { k: 'sw', c: '#4f9a3c', t: 'Rough' }, { k: 'sw', c: '#e8c766', t: 'Bunker' }, { k: 'sw', c: '#2f6b2a', t: 'Trees' }, { k: 'dash', c: '#ffffff', t: 'White dashed line = OB' },
                { k: 'none', t: 'All rounds, par 4 and 5 tee shots, layups left out. Placed by drive length, where it finished and the side missed (exact spot not recorded); OB drawn at 250 yd; misses with no side are not on the heat map. Top row: % missed left / fairway / % missed right.' }])
                : ramp.concat([{ k: 'none', t: 'All rounds: where each green in regulation finished around the hole. White rings: 5 to 30 ft. Average proximity = the plain average distance from the hole of every GIR (no average-position marker: shots all around the hole would cancel out).' }]), M, yy, maxW, 2); }); }
          var mp = pg[1] === 'pin' ? { svg: pinReportSVG(segs), lines: [] } : mapForReport(pg[1], pg[2]);
          if (!mp.svg) return;
          return svgToPng(mp.svg, 2.5).then(function (im) {
            doc.addPage(); var yy = header(pg[0]);
            if (pg[4]) { font(10, true); T('All approach groups this round', M, yy); yy = table([['Group', 'Shots', 'Greens hit', 'Avg ft - greens hit', 'Avg ft - all']].concat(gsum.map(function (x) { var Q = x.P;
                return [x.g.name, String(Q.n), Q.hits + '/' + Q.n + ' (' + Math.round(Q.hitPct) + '%)', Q.avgHitFt == null ? '-' : Math.round(Q.avgHitFt) + ' ft', Q.avgAllFt == null ? '-' : Math.round(Q.avgAllFt) + ' ft']; })), M, yy + 14, [130, 60, 110, 120, 120], { fs: 8.5, rh: 13 }) + 8; }
            var maxW = PW - 2 * M, maxH = pg[1] === 'pin' ? 400 : pg[4] ? 330 - 13 * gsum.length : pg[1] === 'prox' ? 380 : 360, sc = Math.min(maxW / im.w, maxH / im.h), w = im.w * sc, h = im.h * sc;
            var TX = M;
            if (pg[1] === 'prox') { h = Math.min(PH - M - 14 - yy, 290 * im.h / im.w); w = h * im.w / im.h; doc.addImage(im.data, 'JPEG', M, yy, w, h); TX = M + w + 14; maxW = PW - M - TX; }
            else { doc.addImage(im.data, 'JPEG', M + (maxW - w) / 2, yy, w, h); yy += h + 14; if (pg[1] !== 'pin') yy = legendBox(mp.legend, M, yy, maxW, 2); }
            if (pg[1] === 'prox') { yy += 10; var G = pg[3];
              yy = legendBox([{ k: 'ln', c: G.color, t: 'Shot from ' + G.name + ' (line starts at the lie it was hit from)' },
                { k: 'dot', c: G.color, b: '#000', t: 'Hit the green - label = first-putt distance (ft)' },
                { k: 'ringx', c: G.color, t: 'Missed the green - always outside the green, farther out = farther from the pin; label = yards left + lie' },
                { k: 'star', t: 'Holed out' }, { k: 'diamond', c: G.color, t: 'No direction entered' },
                { k: 'txt', c: '>', t: 'Further than the picture - drawn at the edge (label ends with >)' },
                { k: 'none', t: 'White rings: distance from the hole in ft. Scale changes per group: the green reaches the D1 women average for the group midpoint + 10 ft.' }, { k: 'dash', c: '#e00016', t: 'Red dashed = D1 women avg for the group midpoint (Shot Scope D1 women benchmarks)' },
                { k: 'sw', c: '#9fdf86', t: 'Fairway' }, { k: 'sw', c: '#5f9e47', t: 'Rough (left / right side)' }, { k: 'sw', c: '#ecd27e', t: 'Bunker' },
                { k: 'sw', c: '#c9f2b8', t: 'Tee box (par 3s)' }, { k: 'sw', c: '#2f6b2a', t: 'Trees / other' }], TX, yy, maxW, 1) + 8; }
            if (pg[1] === 'pin') {
              yy = legendBox([{ k: 'dot', c: '#ffffff', b: '#000', t: 'Green hit in regulation - first-putt distance and direction from the pin' },
                { k: 'dot', c: '#e0102a', b: '#000', t: 'Missed green - in the rough, in the miss direction from the pin; farther out = more yards off (30 yd+ at the edge, label ends with >); label = yards + lie' },
                { k: 'sw', c: '#8fd66f', t: 'Putting surface (the green) for that pin segment' }, { k: 'sw', c: '#2f6b2a', t: 'Rough around the green' },
                { k: 'pin', t: 'Pin - drawn where it sits on the green (front = bottom)' }, { k: 'dring', t: 'Dashed ring = 20 ft from the pin' },
                { k: 'badge', t: 'Badge: pin segment, holes, greens hit (GIR x/y)' }], M, yy, maxW, 2); yy += 12;
              if (!segs.length) { font(11); T('No holes with a pin location set this round.', M, yy); return; }
              var dirTxt = function (md) { return Object.keys(md).map(function (k) { return (k ? SG.DIR_NAME[k] : 'No direction') + ' ' + md[k]; }).join(', ') || 'None'; };
              table([['Pin', 'Holes', 'GIR', 'GIR %', 'Avg ft (GIR)', 'Misses by direction']].concat(segs.map(function (s) {
                return [s.name, String(s.holes), s.gir + '/' + s.holes, Math.round(s.girPct) + '%', s.avgHitFt == null ? '-' : Math.round(s.avgHitFt) + ' ft', dirTxt(s.missDirs)]; })), M, yy, [90, 45, 45, 50, 75, 235], { fs: 9, rh: 14, cont: 'Pin location (continued)' });
              return;
            }
            mp.lines.forEach(function (L) {
              if (yy > PH - M - 12) return;
              if (L.table) { var n = L.table[0].length, fw = Math.min(180, maxW * (pg[1] === 'prox' ? 0.3 : 0.36)), ww = n === 1 ? [maxW] : [fw].concat(Array(n - 1).fill((maxW - fw) / (n - 1)));
                if (pg[1] === 'prox' && n === 5) ww = [0.22, 0.14, 0.28, 0.18, 0.18].map(function (f) { return f * maxW; });
                var rows = L.table; if (pg[1] === 'prox' && n === 2) rows = rows.filter(function (rw, k) { return !k || rw[1] !== '0'; });
                rows = rows.slice(0, Math.max(2, Math.floor((PH - M - yy) / 13))); yy = table(rows, TX, yy + 10, ww, { fs: 8.5, rh: 13, clip: true }) + 4; return; }
              font(L.b ? 10 : 9, !!L.b); var tl = doc.splitTextToSize(P(L.t), maxW); doc.text(tl, TX, yy); yy += tl.length * 12 + 2;
            });
          });
        });
      });
      return chain.then(function () {
        var n = doc.getNumberOfPages();
        for (var i = 1; i <= n; i++) { doc.setPage(i); font(8); doc.setTextColor(130); T('Page ' + i + ' of ' + n, PW - M, PH - 18, { align: 'right' }); doc.setTextColor(0); }
        return { blob: new Blob([doc.output('arraybuffer')], { type: 'application/pdf' }), pages: n, name: SG.reportFileName(r.course, player, r.date),
          layout: { PW: PW, PH: PH, M: M, text: LAY, tables: TABS }, scorecard: SCG };
      });
    });
  }
  function pinDataRound() { var keep = view.mapScope; view.mapScope = 'round'; var D = pinData(); view.mapScope = keep; return D.holes; }
  function pdfHTML() {
    var p = view.pdf; if (!p) return '';
    if (p.busy) return '<div class="pdfsheet" id="pdfsheet" role="status"><b>Making your PDF report…</b><p class="help muted">Drawing the maps – this takes a few seconds.</p></div>';
    if (p.error) return '<div class="pdfsheet" id="pdfsheet"><p class="notice bad">' + esc(p.error) + '</p><button class="big" data-act="pdfclose">Close</button></div>';
    return '<div class="pdfsheet" id="pdfsheet"><b>📄 PDF report ready</b><p class="help" id="pdfname">' + esc(p.name) + ' · ' + p.pages + ' pages</p>' +
      '<button class="primary big" data-act="pdfshare">Share / Save to Files</button>' +
      '<button class="txt" data-act="pdfclose">Close</button></div>';
  }
  function pdfAct(act) {
    if (act === 'pdf') { view.pdf = { busy: true }; render();
      makeReport().then(function (o) { view.pdf = o; window.__golf.lastPdf = o; render(); }, function (e) { view.pdf = { error: 'Could not make the PDF: ' + (e && e.message) }; render(); }); return; }
    var p = view.pdf; if (!p || !p.blob) return;
    if (act === 'pdfshare') {
      var f = null; try { f = new File([p.blob], p.name, { type: 'application/pdf', lastModified: Date.now() }); } catch (e) {}
      if (f && navigator.canShare && navigator.canShare({ files: [f] })) { navigator.share({ files: [f] }).catch(function (e) { if (!e || e.name !== 'AbortError') pdfDownload(p); }); return; }
      pdfDownload(p); return;
    }
  }
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
        (list.length ? tool('histbz', 'bzopen', '🎯', 'Birdie zone', ' data-v="all" data-id="' + list[0].id + '"') : '') + '</div>';
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

  // ---------- v110 Stats: trends over time (all finished rounds of the chosen player) ----------
  // Numbers per round come from the same code as the round screens: strokes gained = the scorecard TOT column (scorecardData),
  // fairways / GIR = SG.summarize like the Quick view, putts = summarize().puttList (2-putts / 3-putts per hole by its putt count).
  var ST_SG = [['tot', 'TOT', '#4b5866', 'Total'], ['ott', 'OTT', '#3b82c4', 'Off the tee'], ['arg', 'ARG', '#d9902f', 'Around the green'], ['app', 'APP', '#3c9a66', 'Approach'], ['putt', 'PUTT', '#8b67c6', 'Putting']];
  var ST_PCT = [['fir', 'Fairways hit', '#3b82c4', 'FIR'], ['gir', 'GIR', '#3c9a66', 'GIR'], ['p10', 'Putts made inside 10 ft', '#d9902f', 'Putts ≤10 ft']]; // id, full name, colour, short legend name
  var ST_ROWS = [ // label, value of one round, decimals, kind
    ['Strokes gained – TOT', function (p) { return p.sg.tot; }, 2, 'sg'], ['Off the tee (OTT)', function (p) { return p.sg.ott; }, 2, 'sg'],
    ['Around the green (ARG)', function (p) { return p.sg.arg; }, 2, 'sg'], ['Approach (APP)', function (p) { return p.sg.app; }, 2, 'sg'],
    ['Putting (PUTT)', function (p) { return p.sg.putt; }, 2, 'sg'], ['Score', function (p) { return p.score; }, 1], ['To par', function (p) { return p.toPar; }, 1, 'par'],
    ['Putts per round', function (p) { return p.putts; }, 1], ['Putts per GIR hole', function (p) { return p.ppg; }, 2], ['Fairways hit', function (p) { return p.fir; }, 0, 'pct'],
    ['GIR', function (p) { return p.gir; }, 0, 'pct'], ['Putts made inside 10 ft', function (p) { return p.p10; }, 0, 'pct'],
    ['2-putts per round', function (p) { return p.two; }, 1], ['3-putts per round', function (p) { return p.three; }, 1]];
  // one round's numbers (blSel = '' -> the round's own baseline, as on its Round stats page)
  function statsRound(r, blSel) {
    var bl = blSel || blOf(r), S = SG.summarize(r, bl), D = scorecardData(r, S), tot = D.groups.length - 1;
    var sgOf = function (lbl) { var c = D.rows.filter(function (x) { return x.lbl === lbl; })[0].sums[tot]; return c.k === 'sg' ? c.v : 0; };
    var first = S.puttList.filter(SG.firstPutt), p10 = SG.puttsInside10(S.puttList), girH = S.holes.filter(function (a) { return a && a.done && a.gir; });
    return { id: r.id, date: r.date, course: r.course || 'Round', bl: bl, holes: S.holesDone, score: S.strokes, toPar: S.toPar, putts: S.putts,
      sg: { tot: sgOf('Tot'), ott: sgOf('OTT'), arg: sgOf('ARG'), app: sgOf('APP'), putt: sgOf('Putt') },
      fir: S.fwTotal ? 100 * S.fwHit / S.fwTotal : null, gir: S.girHoles ? 100 * S.gir / S.girHoles : null, p10: p10.pct, p10n: p10.attempts, p10m: p10.made,
      two: first.filter(function (p) { return p.holePutts === 2; }).length, three: SG.threePutts(S.puttList).three,
      ppg: girH.length ? girH.reduce(function (t, a) { return t + a.putts; }, 0) / girH.length : null };
  }
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
    var all = list.map(function (r) { return statsRound(r, view.stBl || ''); }), N = view.stN || 0;
    var avg = function (L) { var o = { n: L.length }; ST_ROWS.forEach(function (d) { o[d[0]] = SG.trendAvg(L.map(d[1])); }); return o; };
    var shown = SG.lastN(all, N);
    return { all: all, shown: shown, N: N, unfinished: unf, avgShown: avg(shown), avgLast5: avg(SG.lastN(all, 5)) };
  }
  function stDate(d, short) { d = new Date(d); return short ? (d.getMonth() + 1) + '/' + d.getDate() : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }
  function stNum(v, dec, kind) {
    if (v == null) return '–';
    if (kind === 'sg') return fmtSG(v); if (kind === 'pct') return Math.round(v) + '%';
    var s = (Math.round(v * Math.pow(10, dec)) / Math.pow(10, dec)).toFixed(dec); if (kind === 'par') return v > 0.04 ? '+' + s : Math.abs(v) < 0.05 ? 'E' : s; return s;
  }
  // inline SVG line chart: one point per round in date order, evenly spaced
  function stChart(id, pts, series, o) {
    var W = 358, H = 206, L = 36, R = 12, T = 12, B = 30, pw = W - L - R, ph = H - T - B, n = pts.length;
    var on = series.filter(function (s) { return !(view.stOff || {})[id + ':' + s[0]]; });
    var lo = o.min, hi = o.max, step = o.step;
    if (o.auto) { var vals = [0]; on.forEach(function (s) { pts.forEach(function (p) { var v = s[4](p); if (v != null) vals.push(v); }); });
      var mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals), span = Math.max(mx - mn, 1);
      step = [0.5, 1, 2, 5, 10, 20].filter(function (s) { return span / s <= 7; })[0] || 20; lo = Math.floor(mn / step) * step; hi = Math.ceil(mx / step) * step; if (hi === lo) hi = lo + step; }
    var X = function (i) { return L + (n === 1 ? pw / 2 : i * pw / (n - 1)); }, Y = function (v) { return T + ph - (v - lo) / (hi - lo) * ph; }, f1 = function (v) { return Math.round(v * 10) / 10; };
    var sel = view.stSel && view.stSel.c === id ? view.stSel.i : null;
    var s = '<svg class="stchart" id="' + id + 'chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(o.label) + '">';
    for (var v = lo; v <= hi + 1e-9; v += step) { var yy = f1(Y(v)); s += '<line class="stgrid" x1="' + L + '" x2="' + (W - R) + '" y1="' + yy + '" y2="' + yy + '"/><text class="sty" x="' + (L - 6) + '" y="' + f1(yy + 3.5) + '" text-anchor="end">' + (o.pct ? Math.round(v) + '%' : (v > 0 ? '+' : '') + (step < 1 ? v.toFixed(1) : Math.round(v)) ) + '</text>'; }
    if (o.zero) s += '<line class="stzero" id="' + id + 'zero" x1="' + L + '" x2="' + (W - R) + '" y1="' + f1(Y(0)) + '" y2="' + f1(Y(0)) + '"/>';
    var every = Math.max(1, Math.ceil(n / 6)), yrs = pts.some(function (p) { return new Date(p.date).getFullYear() !== new Date(pts[0].date).getFullYear(); });
    pts.forEach(function (p, i) { if (i !== n - 1 && (i % every || (i && n - 1 - i < every * 0.6))) return; // spread labels, keep the last one
      s += '<text class="stx" x="' + f1(X(i)) + '" y="' + (H - 10) + '" text-anchor="middle">' + stDate(p.date, true) + (yrs ? '/' + String(new Date(p.date).getFullYear()).slice(2) : '') + '</text>'; });
    if (sel != null && pts[sel]) s += '<line class="stsel" x1="' + f1(X(sel)) + '" x2="' + f1(X(sel)) + '" y1="' + T + '" y2="' + (T + ph) + '"/>';
    on.forEach(function (sr) {
      var d = '', pen = false; pts.forEach(function (p, i) { var v = sr[4](p); if (v == null) { pen = false; return; } d += (pen ? 'L' : 'M') + f1(X(i)) + ' ' + f1(Y(v)); pen = true; });
      s += '<path class="stline" data-s="' + sr[0] + '" d="' + d + '" stroke="' + sr[2] + '"/>';
      pts.forEach(function (p, i) { var v = sr[4](p); if (v == null) return; s += '<circle class="stdot' + (i === sel ? ' on' : '') + '" data-s="' + sr[0] + '" cx="' + f1(X(i)) + '" cy="' + f1(Y(v)) + '" r="' + (i === sel ? 4.2 : 3) + '" fill="' + sr[2] + '"/>'; });
    });
    pts.forEach(function (p, i) { var x0 = n === 1 ? L : Math.max(L, X(i) - pw / (n - 1) / 2), x1 = n === 1 ? W - R : Math.min(W - R, X(i) + pw / (n - 1) / 2);
      s += '<rect class="sthit" data-act="stpt" data-c="' + id + '" data-i="' + i + '" x="' + f1(x0) + '" y="' + T + '" width="' + f1(x1 - x0) + '" height="' + ph + '"><title>' + esc(stDate(p.date) + ' · ' + p.course) + '</title></rect>'; });
    s += '</svg>';
    var leg = '<div class="stlegend" id="' + id + 'legend" role="group" aria-label="Show or hide lines">' + series.map(function (sr) { var off = !!(view.stOff || {})[id + ':' + sr[0]];
      return '<button class="stleg' + (off ? ' off' : '') + '" data-act="sttog" data-v="' + id + ':' + sr[0] + '" aria-pressed="' + !off + '" title="' + esc(sr[3]) + '"><i style="--c:' + sr[2] + '"></i>' + esc(sr[1]) + '</button>'; }).join('') + '</div>';
    var tip = '';
    if (sel != null && pts[sel]) { var p = pts[sel];
      tip = '<div class="sttip" id="' + id + 'tip"><div class="sttiph">' + esc(stDate(p.date)) + ' · ' + esc(p.course) + '<button class="sttipx" data-act="stpt" data-c="' + id + '" data-i="' + sel + '" aria-label="Close">×</button></div><div class="sttipv">' +
        series.map(function (sr) { var v = sr[4](p); return '<span><i style="--c:' + sr[2] + '"></i>' + esc(sr[1]) + ' <em>' + (v == null ? '–' : o.pct ? Math.round(v) + '%' : fmtSG(v)) + '</em></span>'; }).join('') +
        '</div><div class="sttipm">Score ' + p.score + ' (' + toPar(p.toPar) + ') · ' + p.putts + ' putts</div></div>'; }
    return leg + s + (on.length ? '' : '<p class="stempty">Tap a name above to show a line.</p>') + tip;
  }
  function statsHTML() {
    var I = statsPlayerInfo(), D = statsData(), all = D.all, shown = D.shown;
    var who = view.stPlayer === '~none' ? 'No name' : view.stPlayer || (I.multi ? 'All players' : (all[0] && (rounds.filter(function (r) { return r.id === all[0].id; })[0] || {}).player) || playerName() || '');
    var h = '<div class="frostpage theme-sky statspage" id="statspage"><div class="topbar frost"><button class="txt frostbtn" data-act="home">‹ Home</button><div class="title"><b>Stats</b><span>' +
      (who ? esc(who) + ' · ' : '') + all.length + ' round' + (all.length === 1 ? '' : 's') + '</span></div><span class="tbspace"></span></div>';
    if (I.multi) h += '<div class="hchips" id="stchips" role="group" aria-label="Player">' + [''].concat(I.names).map(function (nm) {
        var s = (view.stPlayer || '') === nm; return '<button class="frostchip' + (s ? ' sel' : '') + '" data-act="stplayer" data-v="' + esc(nm) + '" aria-pressed="' + s + '">' + (nm ? esc(nm) : 'All players') + '</button>'; }).join('') +
      (I.noName ? '<button class="frostchip' + (view.stPlayer === '~none' ? ' sel' : '') + '" data-act="stplayer" data-v="~none">No name</button>' : '') + '</div>';
    if (all.length < 2) return h + '<div class="stcard stnone" id="stnone"><p>Add a couple of rounds to see trends.</p><p class="stnote">Only finished rounds count' + (D.unfinished ? ' (' + D.unfinished + ' unfinished not shown)' : '') + '.</p></div></div>';
    h += '<div class="stbar"><div class="stseg" id="strange" role="group" aria-label="Rounds shown">' + [[0, 'All'], [10, 'Last 10'], [5, 'Last 5']].map(function (o) {
        var s = D.N === o[0]; return '<button class="' + (s ? 'sel' : '') + '" data-act="strange" data-v="' + o[0] + '" aria-pressed="' + s + '">' + o[1] + '</button>'; }).join('') + '</div>' +
      '<select id="stbl" class="stbl" data-f="baseline" aria-label="Compare against"><option value="">Each round’s baseline</option>' + SG.BASELINES.map(function (b) {
        return '<option value="' + b.id + '"' + (view.stBl === b.id ? ' selected' : '') + '>' + esc(blLabel(b.id)) + '</option>'; }).join('') + '</select></div>';
    h += '<p class="stsub" id="stshown">' + shown.length + ' of ' + all.length + ' finished rounds · ' + esc(stDate(shown[0].date)) + ' – ' + esc(stDate(shown[shown.length - 1].date)) + '</p>';
    h += '<div class="stcard" id="stsg"><div class="sth">Strokes gained per round</div>' +
      stChart('sg', shown, ST_SG.map(function (s) { return s.concat([function (p) { return p.sg[s[0]]; }]); }), { auto: true, zero: true, label: 'Strokes gained per round' }) +
      '<p class="stnote">Compared with ' + (view.stBl ? esc(blLabel(view.stBl)) : 'each round’s own baseline (as on its Round stats page)') + '. Plus = strokes gained, minus = lost. Tap a round to see its numbers.</p></div>';
    h += '<div class="stcard" id="stpct"><div class="sth">Fairways, greens and short putts</div>' +
      stChart('pct', shown, ST_PCT.map(function (s) { return [s[0], s[3], s[2], s[1], function (p) { return p[s[0]]; }]; }), { min: 0, max: 100, step: 25, pct: true, label: 'Percent per round' }) +
      '<p class="stnote">Putts made inside 10 ft = of every putt that started 10 ft or closer (1st, 2nd or 3rd putt), the share that went in. A round with no such putts has no point.</p></div>';
    var two = D.N !== 5, colN = D.N ? 'Last ' + D.N : 'All rounds';
    h += '<div class="stcard" id="sttablecard"><div class="sth">Averages per round</div><table class="sttable" id="sttable"><thead><tr><th></th>' + (two ? '<th class="num">Last 5</th>' : '') + '<th class="num">' + colN + '</th></tr></thead><tbody>' +
      '<tr data-k="Rounds"><td>Rounds</td>' + (two ? '<td class="num">' + D.avgLast5.n + '</td>' : '') + '<td class="num">' + D.avgShown.n + '</td></tr>' +
      ST_ROWS.map(function (d) { return '<tr data-k="' + esc(d[0]) + '"' + (d[3] === 'sg' ? ' class="stsgrow"' : '') + '><td>' + esc(d[0]) + '</td>' + (two ? '<td class="num">' + stNum(D.avgLast5[d[0]], d[2], d[3]) + '</td>' : '') +
        '<td class="num">' + stNum(D.avgShown[d[0]], d[2], d[3]) + '</td></tr>'; }).join('') + '</tbody></table>' +
      '<p class="stnote">Each number is the average of the rounds’ own numbers (a round with nothing to count, e.g. no par 4s or 5s, is left out of that line). Last 5 = the 5 newest finished rounds. Unfinished rounds are not included' + (D.unfinished ? ' (' + D.unfinished + ' not shown)' : '') + '.</p></div>';
    return h + '</div>';
  }

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
      '<p class="rsh-help">On the other phone: Pin High → Rounds → 📥 Add a round, then choose the file or paste the code.</p>' +
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
      navigator.share({ files: [file], title: 'Pin High round' }).then(function () { toast('Round sent'); }).catch(function (e) {
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
      var text = 'Pin High round – ' + roundLine(r).day + (r.course ? ', ' + r.course : '') + '. In Pin High: Rounds → Add a round, paste this:\n' + code;
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
    return o + '<div class="rsh-h" id="addh">Add a round</div><p class="rsh-sub">Got a round from someone’s Pin High? Add it to your rounds.</p>' +
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
    var name = 'golf-rounds-' + GDX.slug(playerName()) + '-' + localDay(new Date()) + '.json', json = JSON.stringify(SG.makeBackup(rounds.filter(function (x) { return !SG.roundEmpty(x); }), null, playerName(), courses(), bagForBackup(), wedgesForBackup()), null, 1), file;
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
    view.restore = { rounds: P.rounds, sel: {}, player: bp, courses: P.courses || [], bag: P.bag || null, wedges: P.wedges || null }; view.preview = null; view.screen = 'restorepick'; render(); window.scrollTo(0, 0);
  }
  // ---------- v101 Google Drive restore: every round in that player's backup, tick the ones to bring back ----------
  function gdListOpen(text, who, label) {
    var P = SG.parseBackup(text), raw = null;
    if (P.error) { view.notice = { text: P.error, bad: true }; view.screen = 'archive'; render(); return; }
    try { raw = JSON.parse(text); } catch (e) {}
    var items = GDX.restoreList(raw, who, rounds), sel = {}, mine = samePlayer(who, playerName());
    items.forEach(function (it) { if (it.status === 'new') sel[it.round.id] = true; }); // missing rounds start ticked
    view.restore = { gd: { player: who, label: label }, items: items, rounds: items.map(function (it) { return it.round; }), sel: sel, player: who,
      courses: P.courses || [], bag: mine ? P.bag || null : null, wedges: mine ? P.wedges || null : null };
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
    var extra = [(R.courses || []).length ? 'courses' : '', R.bag && R.bag.clubs && R.bag.clubs.length ? 'bag' : '', R.wedges && WEDGES.count(R.wedges) ? 'wedges' : ''].filter(Boolean);
    o += '<p class="muted gdlnote">They go into Rounds under ' + esc(G.player) + '. Nothing on this phone is deleted, and a newer copy on this phone is never replaced.</p>';
    return o + '<div class="gdlbar" id="gdlbar"><span class="gdlcount" id="gdlcount">' + nSel + ' selected</span><button class="gdlgo" data-act="rpgo" id="rpgo"' + (nSel || extra.length ? '' : ' disabled') + '>' +
      (nSel || !extra.length ? 'Restore ' + nRounds(nSel) : 'Restore ' + extra.join(' &amp; ')) + '</button></div></div>';
  }
  function restoreExtras(R, parts) {
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
    var parts = [M.added + ' added'];
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
    if (me && (bagForBackup() || wedgesForBackup() || ownRounds().length)) grp(me);
    rounds.forEach(function (r) { if (SG.roundEmpty(r)) return; var G = grp(r.player || me); if (G) G.rounds.push(r); });
    GDX.movedFrom(rounds).forEach(function (m) { m.from.forEach(function (f) { var k = GDX.folderName(f).toLowerCase(); if (GDX.slug(f) && !g[k]) { g[k] = { player: GDX.folderName(f), rounds: [], dropOnly: true }; order.push(k); } }); }); // v99: tidy a moved round out of its old player's file
    return order.map(function (k) {
      var G = g[k], mine = samePlayer(G.player, me);
      return { player: G.player, dropOnly: !!G.dropOnly, backup: SG.makeBackup(G.rounds, null, G.player, courses(), mine ? bagForBackup() : null, mine ? wedgesForBackup() : null) };
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
      tipText('gdinfo', 'Your rounds, saved courses, My Bag and Wedges chart are copied to Google Drive by themselves – after each round and when you open the app – into a folder called Pin High Backups, with one folder per player. Several phones can use the same Google account: each backup adds to what is there, nothing is overwritten. Google asks you to sign in again after about an hour; until then backups simply wait.');
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
      '<h1 class="home-title">Pin High</h1>' +
      '<button class="glass plusbtn" id="plusbtn" data-act="plus" aria-label="Menu: new round, rounds, stats, my bag or settings" aria-expanded="' + !!view.hmenu + '">+</button>' +
''; // v89: no Player row on Home (kept clean) – it lives in the New round sheet
    var bot = '';
    if (cur) { var S = SG.summarize(cur); bot += '<button class="glass pill" id="resumepill" data-act="resume">Resume round<small>' + (cur.course ? esc(cur.course) + ' · ' : '') + S.holesDone + ' holes done</small></button>'; }
    // v102: no Archive pill – that page is Settings in the + menu
    h += '<div class="home-bottom">' + bot + '</div><div class="appver homever" id="homever" aria-label="App version">' + esc(APP_VER) + '</div>';
    if (view.nameSheet) h += nameSheetHTML();
    else if (view.hmenu) {
      h += '<div class="sheet-back" data-act="menuclose"></div><div class="hsheet glass" id="plusmenu" role="menu">';
      if (view.hmenu === 'new') h += '<div class="sheet-h">New round</div>' + newCourseHTML() +
        '<label class="lbl" for="newbl">Compare my shots against</label>' + blSelect('newbl', view.newBl || 'pga') + newPlayerHTML() +
        '<button class="sheet-go" data-act="new">Start round</button><button class="sheet-item muted" data-act="plus">Back</button>';
      else h += '<button class="sheet-item" role="menuitem" data-act="newform">New round</button><button class="sheet-item" role="menuitem" data-act="history">Rounds</button><button class="sheet-item" role="menuitem" data-act="stats">Stats</button><button class="sheet-item" role="menuitem" data-act="bag">My Bag</button><button class="sheet-item" role="menuitem" data-act="archive">Settings</button>';
      h += '</div>';
    }
    return h + '</div>';
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
    h += '<p class="appver setver" id="setver" aria-label="App version">' + esc(APP_VER) + '</p>';
    if (view.gdr) h += gdRestoreHTML();
    return h + '</div>';
  }

  // ---------- Saved courses (typed in: par + yardages per tee box) ----------
  function teeLabel(t, k) { return String(t.name || '').trim() || 'Tee box ' + (k + 1); }
  function teeTot(t) { var n = COURSES.teeTotal(t); return n ? n.toLocaleString('en-US') : ''; }
  // New round: Course dropdown (+ Add new course first, then saved courses, most recently used first) → tee box chips
  function newCourseHTML() {
    var list = COURSES.byRecent(courses(), rounds), nc = view.newC && courseById(view.newC.id), adding = !nc && (view.newAdd || !list.length), h = '';
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
      h += '<span class="lbl" id="teelbl">' + (tees.length > 1 ? 'Tee box' : 'Playing from') + '</span><div class="ntees" id="ntees" role="group" aria-labelledby="teelbl">' + tees.map(function (t) {
        var on = view.newC.tee === t.name || (tees.length === 1);
        return '<button type="button" class="ntee' + (on ? ' sel' : '') + '" aria-pressed="' + on + '" data-act="ntee" data-v="' + esc(t.name) + '">' + esc(t.name) + (teeTot(t) ? '<small>' + teeTot(t) + ' yd</small>' : '') + '</button>'; }).join('') +
        '<button type="button" class="ntee naddtee" data-act="naddtee">＋ Add tee box</button></div>' +
        '<button type="button" class="txtlink nedit" data-act="nedit">✎ Rename tees or fix numbers</button>';
    }
    if (adding) h += (list.length ? '' : '<span class="lbl" id="crslbl">Course</span>') + '<input type="text" id="course" placeholder="Course name' + (list.length ? '' : ' (optional)') + '" autocomplete="off" value="' + esc(view.newName || '') + '" aria-label="Course name">' +
      '<button class="sheet-item ntype" id="ntype" data-act="cardmanual" aria-label="Type in par and yardages">✎ Type in par &amp; yardages</button>';
    return h;
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
        '<p class="teelbl" id="revteelbl">Tee boxes</p><div class="revtees">' + c.tees.map(function (x, k) { return '<button class="frostchip' + (k === C.sel ? ' sel' : '') + '" data-act="cardsel" data-i="' + k + '">' + esc(teeLabel(x, k)) + '</button>'; }).join('') +
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
        (miss ? '<p class="revmiss" id="revmiss">' + miss + ' hole' + (miss === 1 ? '' : 's') + ' to fill</p>' : '') + '</div>' +
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
    var list = courses().filter(function (x) { return x.id !== c.id; }); list.unshift(c); saveCourses(list); backupDirty(3000);
    var tee = (c.tees[selK] || c.tees[0] || {}).name || '';
    toast('Saved ' + c.name); view.card = null;
    if (C.from === 'new') { if (C.keep) view.newBl = C.keep.newBl; view.newC = { id: c.id, tee: tee }; view.newAdd = false; view.newName = ''; view.screen = 'home'; view.hmenu = 'new'; } else view.screen = 'courses';
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

    out += '<div class="holecard frostcard' + (fin ? ' fin' : '') + '"><div class="hc-head"><h2>Hole ' + (view.hole + 1) + '</h2>' +
      '<div class="par"><span>Par</span>' + [3, 4, 5].map(function (p) {
        return '<button data-act="par" data-v="' + p + '" class="' + (h.par === p ? 'sel' : '') + '"' + (fin ? ' disabled' : '') + '>' + p + '</button>'; }).join('') + '</div></div>';
    var pin = SG.normPin(h.pin);
    out += '<button class="pinbtn frostbtn' + (pin ? ' set' : '') + '" id="pinbtn" data-act="pinopen">⛳ ' + (pin ? 'Pin: ' + SG.PIN_NAME[pin].toLowerCase() + ' <small>change</small>' : 'Set pin location') + '</button>';

    out += '<div class="srow shead"><span class="c-n">#</span><span class="c-d">Dist</span><span class="c-l">Loc</span><span class="c-x">Dir</span><span class="c-p">P</span><span class="c-del"></span></div>';
    h.rows.forEach(function (row, k) { out += rowHTML(h, a, row, k, fin); });

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
    if (navigator.share) navigator.share({ title: 'Pin High · Live', text: liveMsg(r), url: url }).catch(function (e) { if (!e || e.name !== 'AbortError') liveCopy(url); });
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
    dictStop(); h.rows = res.rows; save(); view.voice = null; view.menu = null; view.vflash = res.touched.slice(); render(); view.vflash = null;
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
    out += '<div class="sinfo" data-info="' + k + '">' + infoHTML(a.shots[k]) + '</div>';
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
    // up and down: missed the green in regulation, then a short-game shot (off the green, within 20 yd) – made if holed in 2 or fewer from there
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
  // v111: the 1st putt misses / Lag putts rows drop "missed" / "inside 3 ft" so the row fits on one line at 390px – the opened tile still says it ("2/7 missed", "82% inside 3 ft")
  function stxPct(n, d) { return d > 0 ? '<em class="stxp"> · ' + Math.round(100 * n / d) + '%</em>' : ''; } // v111: whole percent next to a fraction (no percent when nothing to count)
  function statTilesHTML(S) {
    var PM = SG.pmissList(S.puttList), PMm = PM.filter(function (p) { return !p.made; }).length, LG = SG.lagStats(S.puttList);
    var PX = SG.proxStats(S.proxList.filter(function (m) { return SG.inBucket('all', m.from); })), nc = {}; clubShots(false).forEach(function (x) { nc[x.club] = 1; }); nc = Object.keys(nc).length;
    var note = function (t) { return '<p class="stxn">' + t + '</p>'; };
    return '<div class="stat-grid stxlist" id="stattiles">' +
      stx('fw', 'Fairways hit', S.fwHit + ' / ' + S.fwTotal + stxPct(S.fwHit, S.fwTotal), tile('fw', 'Fairways hit – tap for map', S.fwHit + ' / ' + S.fwTotal)) +
      stx('gir', 'Greens in regulation', S.gir + ' / ' + S.girHoles + stxPct(S.gir, S.girHoles), tile('gir', 'Greens in reg. – tap for map', S.gir + ' / ' + S.girHoles)) +
      stx('miss', 'Approach misses', S.apprMiss.length, tile('miss', 'Approach misses (missed green) – tap for map', S.apprMiss.length, missMini(S.apprMiss))) +
      stx('prox', 'Proximity', PX.n ? fmtFt(PX.avgAllFt) : '–', proxTile(S)) +
      stx('pin', 'Pin location', S.pinHoles.length + ' / ' + S.holesDone, tile('pin', 'Pin location – tap for map', S.pinHoles.length + ' / ' + S.holesDone, '<small class="mini">holes with a pin set</small>')) +
      stx('putt', 'Putts', S.putts, puttTile(S)) +
      stx('pmiss', '1st putt misses (&lt;10 ft)', PM.length ? PMm + '/' + PM.length + stxPct(PMm, PM.length) : '–', pmissTile(S)) +
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
    out += rsTopHTML(r, S) + quickViewHTML(S);
    out += scorecardHTML(r, S) + '<button class="big rpbtn" data-act="replay" data-v="0" id="sumreplay">▶ Hole replay (hole by hole)</button>' +
      (S.holesDone ? '<button class="big rpbtn bzbtn" data-act="bzopen" data-v="round" id="sumbz">🎯 Birdie zone</button>' : '');
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
    var groups = [['Approach', SG.APPR_BUCKETS.map(function (b) { return b.id; })], ['Short game', ['0-20 yd']], ['Putting', ['0-5 ft', '5-15 ft', '15-30 ft', '30+ ft']]], pex = 0;
    groups.forEach(function (g) {
      out += '<tr><td colspan="4" style="background:#eee"><b>' + g[0] + '</b></td></tr>';
      g[1].forEach(function (b) {
        var c = S.buckets[b], ap = g[0] === 'Approach'; if (ap) pex += c.proxEx;
        out += '<tr data-bucket="' + b + '"><td>' + b + '</td><td class="num">' + c.n + '</td><td class="num ' + sgCls(c.sg) + '">' + (c.n ? fmtSG(c.sg) : '–') + '</td><td class="num">' +
          (ap ? (c.proxN ? Math.round(c.proxFt) + ' ft' : '–') : '') + '</td></tr>';
      });
    });
    out += '</table><p class="help muted" id="bydistnote">Approach = every shot from more than 20 yd off the green, par-3 tee shots included (par-4/5 tee shots are Off the tee). ' +
      'Short game = off the green from 20 yd and in. Ranges include the lower number (60–100 = 60 to under 100 yd); 20–60 = over 20 up to under 60 yd (it also takes the 20–30 yd shots). ' +
      'Avg to pin after = how far from the hole the ball finished: feet on the green, yards × 3 off it, 0 if holed' +
      (pex ? '; <b>' + pex + '</b> approach shot' + (pex === 1 ? '' : 's') + ' with a penalty or OB left out of that average' : '; shots with a penalty or OB are left out of it') + '.</p>';
    var sgPart = out; out = main + '<h2>Stats</h2>' + statTilesHTML(S);
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
  // ---------- Birdie zone: GIR balls on a green + the 1-putt ring + "what if" slider ----------
  function bzBase() { var r = rounds.filter(function (x) { return view.bz && x.id === view.bz.rid; })[0]; return r && !SG.roundEmpty(r) ? r : null; }
  function bzAllRounds(r) { return savedRounds().filter(function (x) { return !r || !r.player || x.player === r.player; }); }
  function bzData() {
    var r = bzBase(), all = BZ.scope(bzAllRounds(r), blOf), allRing = BZ.onePutt(all.putts), scope = r && view.bz.scope === 'round' ? 'round' : 'all';
    var sc = scope === 'round' ? BZ.scope([r], blOf) : all, ring = scope === 'round' ? BZ.onePutt(sc.putts) : allRing, note = '', src = scope;
    if (!ring && scope === 'round') { ring = allRing; src = 'all'; note = 'Only ' + sc.putts.length + ' putts this round – ring uses all rounds (' + all.putts.length + ' putts).'; }
    if (!ring) { src = 'none'; note = 'Not enough putts yet (' + all.putts.length + ' of ' + BZ.MIN_PUTTS + ') – ring set to ' + BZ.DEFAULT_FT + '’.'; }
    return { r: r, scope: scope, sc: sc, all: all, ring: ring ? ring.ft : BZ.DEFAULT_FT, ringInfo: ring, src: src, note: note, bands: BZ.bands(sc.putts) };
  }
  function bzSVG(list, ring, R) {
    var C = 180, CY = 180, K = 5, out = '<svg id="bzmap" viewBox="0 0 360 360" role="img" aria-label="Birdie chances on the green">' +
      '<circle cx="180" cy="180" r="176" fill="#3da33d" stroke="#145214" stroke-width="3"/>';
    [10, 20, 30].forEach(function (ft) { out += '<circle cx="180" cy="180" r="' + ft * K + '" fill="none" stroke="#fff" stroke-width="1.2" stroke-opacity=".55"/>' +
      '<text x="' + f1(182 + ft * K * 0.707) + '" y="' + f1(193 + ft * K * 0.707) + '" font-size="12" font-weight="600" fill="#fff" fill-opacity=".85">' + ft + '’</text>'; });
    out += '<circle id="bzzone" cx="180" cy="180" r="' + R * K + '" fill="#fff" fill-opacity=".14" stroke="#e0303f" stroke-width="2" stroke-dasharray="6 5"' + (R > ring ? '' : ' visibility="hidden"') + '/>' +
      '<circle id="bzring" cx="180" cy="180" r="' + ring * K + '" fill="none" stroke="#e0303f" stroke-width="3.5"/>' +
      '<circle cx="180" cy="180" r="5" fill="#000"/><line x1="180" y1="180" x2="180" y2="152" stroke="#000" stroke-width="2.5"/><path d="M180 152 l17 5 l-17 5z" fill="#d0213a"/>';
    var seen = {};
    list.forEach(function (m) { // same placement as the GIR map (girSVG): direction angle, dupes fanned 6°, no direction = straight up
      var ft = m.holed ? 0 : m.ft, far = ft > 30, rr = far ? 33 * K : ft * K, nodir = !m.holed && !m.dir;
      var key = (m.holed ? 'h' : m.dir || 'none') + Math.round(rr / 6), j = seen[key] = (seen[key] || 0) + 1;
      var p = m.holed ? [C - 14 + (j - 1) * 14, CY + 16] : pt(C, CY, rr, (nodir ? 90 : SG.DIR_ANGLE[m.dir]) + (j - 1) * (nodir ? 8 : 6));
      var x = f1(p[0]), y = f1(p[1]), a = ' data-ft="' + ft + '" data-hole="' + m.hole + '" data-birdie="' + (m.birdie ? 1 : 0) + '"';
      if (m.holed) out += '<path class="bzball bzholed"' + a + ' d="M' + x + ' ' + (y - 10) + ' l3 6.5 7 .8 -5.3 4.8 1.5 7 -6.2 -3.6 -6.2 3.6 1.5 -7 -5.3 -4.8 7 -.8z" fill="#ffd23f" stroke="#000" stroke-width="1.5"/>';
      else {
        var inR = ft <= R; out += '<g class="bzball ' + (inR ? 'in' : 'out') + (nodir ? ' nodir' : '') + '"' + a + '><circle cx="' + x + '" cy="' + y + '" r="7.5" fill="' + (inR ? '#fff' : '#1c1c1e') + '" stroke="' + (inR ? '#1c1c1e' : '#fff') + '" stroke-width="1.5"/>' +
          (m.birdie ? '<circle cx="' + x + '" cy="' + y + '" r="2.6" fill="#e0303f"/>' : '') + (nodir ? '<text x="' + x + '" y="' + f1(p[1] - 10) + '" text-anchor="middle" font-size="11" font-weight="700" fill="#fff">?</text>' : '') + '</g>';
      }
      if (far) { var lx = p[0] > C ? p[0] - 11 : p[0] + 11; out += '<text class="bzfar" x="' + f1(lx) + '" y="' + f1(p[1] + (p[1] > CY + 120 ? -9 : 4)) + '"' + (p[0] > C ? ' text-anchor="end"' : '') + ' font-size="12" font-weight="700" fill="#fff">' + Math.round(ft) + '’</text>'; }
    });
    return out + '</svg>';
  }
  function bzCount(D, R) { return BZ.label(BZ.zone(D.sc, R)); }
  function birdieHTML() {
    var D = bzData(), r = D.r, ring = D.ring, R = Math.max(ring, Math.min(BZ.MAX_FT, view.bz.R || ring)); view.bz.R = R; view.bz.ring = ring; view.bz.shown = R;
    var back = view.bz.from === 'summary' && r ? '<button class="txt frostbtn" data-act="bzback">‹ Stats</button>' : '<button class="txt frostbtn" data-act="history">‹ Rounds</button>';
    var sub = D.scope === 'round' ? new Date(r.date).toLocaleDateString() + (r.course ? ' · ' + esc(r.course) : '') : D.all.rounds + ' round' + (D.all.rounds === 1 ? '' : 's') + (r && r.player ? ' · ' + esc(r.player) : '');
    var h = '<div class="frostpage theme-sky bzpage" id="birdie"><div class="topbar frost">' + back + '<div class="title"><b>Birdie zone</b><span>' + sub + '</span></div><span class="tbspace"></span></div>';
    if (r) h += '<div class="liechips bzscope" role="group" aria-label="Scope"><button class="frostchip' + (D.scope === 'round' ? ' sel' : '') + '" data-act="bzscope" data-v="round" aria-pressed="' + (D.scope === 'round') + '">This round</button>' +
      '<button class="frostchip' + (D.scope === 'all' ? ' sel' : '') + '" data-act="bzscope" data-v="all" aria-pressed="' + (D.scope === 'all') + '">All rounds</button></div>';
    var n = D.sc.chances.length;
    h += '<div class="frostcard bzcard"><p class="bzcount"><img class="bzbird" id="bzbird" src="img/oriole.webp" alt="" width="44" height="44"><span id="bzcount">' + bzCount(D, R) + '</span></p>' +
      '<div class="bzwrap"><div class="bzslcol"><span class="bzsltop">30’</span><input type="range" id="bzslider" class="bzslider" min="' + ring + '" max="' + BZ.MAX_FT + '" step="1" value="' + R + '" aria-label="Make every putt inside this distance"' + (ring >= BZ.MAX_FT ? ' disabled' : '') + '><span class="bzslbot" id="bzslval">' + R + '’</span></div>' +
      bzSVG(D.sc.chances, ring, R) + '</div>' +
      '<p class="bzlegend"><span class="bzk ring"></span>1-putt ' + ring + '’' + (D.src === 'all' && D.scope === 'round' ? ' (all rounds)' : '') + ' ' + tipBtn('bzring', 'i', 'How the 1-putt distance works') +
      '<span class="bzk w"></span>inside <span class="bzk b"></span>outside</p>' +
      tipText('bzring', '<b>Red ring = 1-putt distance:</b> the furthest whole foot where you make at least half your putts. For each distance d we look at putts from d − w to d + w (w = 1’ or 25% of d, whichever is bigger) and need at least ' + BZ.MIN_WIN + ' putts there. Starting at 1’ and moving out, it stops at the first distance under 50% or with too few putts, so one lucky long make can’t stretch it. Needs ' + BZ.MIN_PUTTS + '+ putts; a round with fewer uses all rounds' + (r && r.player ? ' (' + esc(r.player) + ')' : '') + '.<br><b>Balls</b> = greens hit in regulation (par 3 tee shot, par 4 2nd, par 5 3rd), placed like the GIR map (top = long, bottom = short, toward you; past 30’ sits on the edge with its distance). Red dot = made birdie, ★ = holed out.<br><b>Slider</b>: grow the ring – white balls would be birdies if you holed them (birdie or better counts).') +
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
      var inR = +g.getAttribute('data-ft') <= R, c = g.querySelector('circle'); g.classList.toggle('in', inR); g.classList.toggle('out', !inR);
      c.setAttribute('fill', inR ? '#fff' : '#1c1c1e'); c.setAttribute('stroke', inR ? '#1c1c1e' : '#fff'); });
    var t0 = BZ.zone(D.sc, view.bz.shown || R).total, t1 = BZ.zone(D.sc, R).total; view.bz.shown = R;
    document.getElementById('bzcount').textContent = bzCount(D, R); document.getElementById('bzslval').textContent = R + '’';
    var bird = document.getElementById('bzbird'); if (bird && t1 > t0) { bird.classList.remove('hop'); void bird.offsetWidth; bird.classList.add('hop'); } // oriole hops when the count goes up
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
    var out = '<div class="mapview" id="mapview" role="dialog" aria-label="' + (kind === 'gir' ? 'GIR map' : kind === 'fw' ? 'Fairway map' : kind === 'pin' ? 'Pin location map' : kind === 'prox' ? 'Proximity map' : kind === 'putt' ? 'Putting map' : kind === 'club' ? 'Club performance' : kind === 'pmiss' ? '1st putt misses map' : 'Approach miss map') + '">' +
      '<div class="maphead"><b>' + (kind === 'gir' ? 'Greens in regulation' : kind === 'fw' ? 'Tee shots – fairways' : kind === 'pin' ? 'Pin location' : kind === 'prox' ? 'Proximity by distance' : kind === 'putt' ? 'Putting' : kind === 'club' ? 'Club performance' : kind === 'pmiss' ? '1st putt misses (&lt;10 ft)' : 'Approach misses') + '</b><button class="close" data-act="mapclose" aria-label="Close map">✕ Close</button></div>' +
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
    var vb = svg.viewBox.baseVal, W = vb.width, H = vb.height, S = 3, gw = Math.ceil(W / S), gh = Math.ceil(H / S), sig = 6 + 3.4 * (CL || 3), D = new Float32Array(gw * gh), mx = 0;
    for (var y = 0; y < gh; y++) for (var x = 0; x < gw; x++) { var v = 0, px = x * S + S / 2, py = y * S + S / 2;
      for (var i = 0; i < pts.length; i++) { var dx = px - pts[i].x, dy = py - pts[i].y, q = dx * dx + dy * dy; if (q < 9 * sig * sig) v += Math.exp(-q / (2 * sig * sig)); }
      D[y * gw + x] = v; if (v > mx) mx = v; }
    var cv = document.createElement('canvas'); cv.width = gw; cv.height = gh; var cx = cv.getContext('2d'), im = cx.createImageData(gw, gh);
    // classic click-heat-map ramp: transparent -> blue -> cyan -> green -> yellow -> orange -> red (densest)
    var RB = [[0, [0, 0, 255]], [0.12, [0, 60, 255]], [0.3, [0, 220, 255]], [0.5, [0, 230, 60]], [0.68, [255, 240, 0]], [0.84, [255, 140, 0]], [1, [230, 0, 0]]];
    for (var k = 0; k < D.length; k++) { var t = mx ? D[k] / mx : 0, a = t < 0.02 ? 0 : Math.min(0.78, 0.18 + t * 0.75) * Math.min(1, t / 0.08), j = 1;
      while (j < RB.length - 1 && t > RB[j][0]) j++; var u = Math.max(0, Math.min(1, (t - RB[j - 1][0]) / (RB[j][0] - RB[j - 1][0])));
      for (var ch = 0; ch < 3; ch++) im.data[k * 4 + ch] = Math.round(RB[j - 1][1][ch] + (RB[j][1][ch] - RB[j - 1][1][ch]) * u); im.data[k * 4 + 3] = Math.round(a * 255); }
    cx.putImageData(im, 0, 0);
    var o = '<image id="heatgrad" href="' + cv.toDataURL('image/png') + '" x="0" y="0" width="' + W + '" height="' + H + '" preserveAspectRatio="none"/>';
    var peaks = [];
    for (y = 1; y < gh - 1; y++) for (x = 1; x < gw - 1; x++) { var c = D[y * gw + x]; if (c < Math.min(0.3 * mx, 0.6)) continue; var top = true;
      for (var yy = -4; yy <= 4 && top; yy++) for (var xx = -4; xx <= 4; xx++) { var Y = y + yy, X = x + xx; if ((yy || xx) && Y >= 0 && X >= 0 && Y < gh && X < gw && D[Y * gw + X] > c) { top = false; break; } }
      if (top) peaks.push([x * S + S / 2, y * S + S / 2, c]); }
    // one hot spot per blob: a flat or twin-topped peak (2+ shots at the same spot) yields several local maxima -> keep the
    // strongest and drop any within 1.5 sigma of a kept one; each shot then belongs to its nearest kept peak (counted once)
    peaks.sort(function (a, b) { return b[2] - a[2]; });
    var keep = []; peaks.forEach(function (p) { if (!keep.some(function (k) { return Math.hypot(k[0] - p[0], k[1] - p[1]) < 1.5 * sig; })) keep.push(p); });
    keep = keep.slice(0, 12);
    var own = keep.map(function () { return []; });
    pts.forEach(function (q) { var bi = -1, bd = 2 * sig; keep.forEach(function (k, i) { var d = Math.hypot(q.x - k[0], q.y - k[1]); if (d <= bd) { bd = d; bi = i; } }); if (bi >= 0) own[bi].push(q); });
    var boxes = [], n = 0;
    keep.forEach(function (p, i) { var near = own[i]; if (!near.length) return; n++; if (view.map === 'fw') return; // tee map: no hot-spot labels
      o += heatTag('hotspot', near.length, p[0], p[1], heatLabel(near), boxes, W, H); });
    return { svg: o, peaks: n };
  }
  // Tag placement: try spots around the anchor (nearest first); never over another tag; if the tag ends up
  // away from its anchor, a thin leader line joins them.
  function heatTag(cls, n, ax, ay, t, boxes, W, H) {
    var w = t.length * 6.2 + 10, hh = 18, c = [], best = null;
    [0, 1, 2, 3, 4].forEach(function (ring) { var d = 16 + ring * 22;
      [[0, -1], [0, 1], [1, 0], [-1, 0], [1, -1], [-1, -1], [1, 1], [-1, 1]].forEach(function (v) { c.push([ax + v[0] * (d + (v[0] ? w / 2 : 0)) - w / 2, ay + v[1] * d - hh / 2]); }); });
    for (var i = 0; i < c.length; i++) { var x = Math.max(3, Math.min(W - 3 - w, c[i][0])), y = Math.max(3, Math.min(H - 3 - hh, c[i][1]));
      if (!boxes.some(function (b) { return x < b[2] + 2 && x + w > b[0] - 2 && y < b[3] + 2 && y + hh > b[1] - 2; })) { best = [x, y]; break; } }
    if (!best) best = [Math.max(3, Math.min(W - 3 - w, ax - w / 2)), Math.max(3, ay - 30)];
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
    var svg = mv.querySelector('#' + HEAT_MAPS[view.map]); if (!svg) return;
    var C = heatCenter(svg, view.map), NS = 'http://www.w3.org/2000/svg', pts = [];
    var noDir = 0; // markers with no direction entered: real shots, but no position -> left off the heat map (and said so)
    svg.querySelectorAll('[data-hd]').forEach(function (e) {
      var k = (e.getAttribute('data-kind') || '') + (e.getAttribute('data-class') || ''); if (/nodir/.test(k)) { noDir++; return; }
      var b = e.getBBox(); pts.push({ x: b.x + b.width / 2, y: b.y + b.height / 2, d: +e.getAttribute('data-hd') || 0, u: e.getAttribute('data-hu') || 'ft', fw: e.getAttribute('data-fw') });
    });
    var multi = view.mapScope === 'all' && savedRounds().length > 1, mode = view.heat === 'isl' ? 'grad' : view.heat || (multi || pts.length > 15 ? 'grad' : 'dots'), on = mode !== 'dots';
    var tg = document.createElement('div'); tg.className = 'seg heattog'; tg.id = 'heattog';
    tg.innerHTML = [['dots', '● Dots'], ['grad', '🔥 Gradient']].map(function (b) { return '<button data-act="heat" data-v="' + b[0] + '" class="' + (mode === b[0] ? 'sel' : '') + '" aria-pressed="' + (mode === b[0]) + '"' + (pts.length || b[0] === 'dots' ? '' : ' disabled') + '>' + b[1] + '</button>'; }).join('');
    var anc = svg; while (anc.parentNode && anc.parentNode !== mv) anc = anc.parentNode;
    anc.parentNode.insertBefore(tg, anc);
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
      h += heatTag('island', g.length, cp.x, cp.y, heatFmt(g) + ' · ' + g.length + (g.length === 1 ? ' shot' : ' shots'), boxes, VW, VH);
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
    var d1 = svg.querySelector('#d1ring'); if (d1) svg.appendChild(d1); // benchmark ring stays above the heat
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
          tee: s.cat === 'tee', lg: ob || !d || s.cat === 'tee' ? null : DIR_LG[d] * yd * (diag ? c : 1), lr: ob || !d || s.cat === 'tee' ? null : DIR_LR[d] * yd * (diag ? c : 1), sg: s.sg, layup: !!s.layup });
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
    var C = 180, CY = 200, pts = list.filter(function (x) { return !x.ob && !x.tee && (x.dir || x.holed); }), mx = Math.max(10, Math.max.apply(null, pts.map(function (x) { return x.yd; }).concat([0])));
    var step = mx <= 15 ? 5 : mx <= 40 ? 10 : mx <= 80 ? 20 : 25, max = Math.ceil(mx / step) * step, K = 160 / max, G = Math.max(6, 10 * K);
    var o = '<svg id="clubmap" viewBox="0 0 360 400" role="img" aria-label="Where shots with this club finished"><rect width="360" height="400" fill="#5f9e47"/>' +
      '<circle cx="' + C + '" cy="' + CY + '" r="' + f1(Math.min(G, 160)) + '" fill="#8fd66f" stroke="#e8f8e0" stroke-width="2"/>';
    for (var f = step; f <= max; f += step) o += '<circle cx="' + C + '" cy="' + CY + '" r="' + f1(f * K) + '" fill="none" stroke="#fff" stroke-opacity=".6" stroke-dasharray="4 4"/><text x="' + f1(C + f * K * 0.707 + 3) + '" y="' + f1(CY + f * K * 0.707 + 11) + '" font-size="10" font-weight="800" fill="#fff">' + f + ' yd</text>';
    o += '<line x1="' + C + '" y1="' + CY + '" x2="' + C + '" y2="' + (CY - 24) + '" stroke="#000" stroke-width="2.5"/><path d="M' + C + ' ' + (CY - 24) + ' l14 5 l-14 5z" fill="#d0213a"/><circle cx="' + C + '" cy="' + CY + '" r="4" fill="#000"/>' +
      '<text x="180" y="16" text-anchor="middle" font-size="13" font-weight="900" fill="#fff">LONG ↑</text><text x="180" y="394" text-anchor="middle" font-size="13" font-weight="900" fill="#fff">SHORT ↓ (toward you)</text>' +
      '<text x="6" y="' + (CY - 6) + '" font-size="13" font-weight="900" fill="#fff">L</text><text x="354" y="' + (CY - 6) + '" text-anchor="end" font-size="13" font-weight="900" fill="#fff">R</text>';
    var seen = {};
    pts.forEach(function (x) {
      var k = x.dir + Math.round(x.yd), j = seen[k] = (seen[k] || 0) + 1, p = x.holed ? [C + (j - 1) * 8, CY] : pt(C, CY, Math.max(4, Math.min(x.yd, max) * K), SG.DIR_ANGLE[x.dir] + (j - 1) * 7);
      var col = x.holed ? '#ffd23f' : x.green ? '#fff' : '#d0213a';
      o += '<circle class="cdot" data-hd="' + (x.green ? Math.round(x.yd * 3) : Math.round(x.yd)) + '" data-hu="' + (x.green ? 'ft' : 'yd') + '" data-hole="' + x.hole + '" cx="' + f1(p[0]) + '" cy="' + f1(p[1]) + '" r="6.5" fill="' + col + '" stroke="#000" stroke-width="2"/>';
    });
    return o + '</svg>';
  }
  function clubHTML(all) {
    var L = clubShots(all), by = {}; L.forEach(function (x) { (by[x.club] = by[x.club] || []).push(x); });
    var B0 = BAG.pickerClubs(bag()).map(function (c) { return c.code; }), base = B0.length ? B0 : SG.CLUBS, order = base.concat(Object.keys(by).filter(function (c) { return base.indexOf(c) < 0; }).sort(function (a, b) { return BAG.rank(a) - BAG.rank(b); }));
    var used = order.filter(function (c) { return by[c]; });
    if (!used.length) return '<p class="notice" id="clubnone">No clubs entered yet' + (all ? '' : ' this round') + '. Pick a club under each shot when entering a hole, then come back here.</p>';
    var cur = view.club && by[view.club] ? view.club : used.slice().sort(function (a, b) { return by[b].length - by[a].length; })[0], list = by[cur], st = clubStats(list);
    var fmtD = function (v, a, b) { return v == null ? '–' : Math.abs(v) < 0.5 ? 'on line' : Math.round(Math.abs(v)) + ' yd ' + (v > 0 ? a : b); };
    var o = '<div class="seg clubbtns" id="clubbtns">' + order.map(function (c) { var n = by[c] ? by[c].length : 0;
      return '<button data-act="clubsel" data-v="' + esc(c) + '" class="' + (c === cur ? 'sel' : '') + '"' + (n ? '' : ' disabled') + ' aria-pressed="' + (c === cur) + '">' + esc(c) + (n ? '<small> ' + n + '</small>' : '') + '</button>'; }).join('') + '</div>';
    o += '<p class="mapsum" id="mapsum"><b id="clubcur">' + esc(cur) + '</b> · <b>' + st.n + '</b> shot' + (st.n === 1 ? '' : 's') + (all ? ' in all rounds' : ' this round') + '</p>';
    if (st.bias) o += '<p class="warnmsg" id="clubbias">⚠ ' + cur + ' finishes <b>' + Math.round(Math.abs(st.lg)) + ' yd ' + st.bias + '</b> on average – ' + (st.bias === 'short' ? 'consider clubbing up or checking your yardage for it.' : 'consider clubbing down for it.') + '</p>';
    var tees = list.filter(function (x) { return x.tee; });
    if (tees.length) o += '<p class="help" id="clubtee"><b>' + tees.length + ' tee shot' + (tees.length === 1 ? '' : 's') + ' on par 4/5</b> (judged by the fairway, not the pin – not on the map or in the short/long numbers): ' +
      tees.filter(function (x) { return !x.ob && x.s.end.lie === 'fairway'; }).length + ' fairway, ' + tees.filter(function (x) { return /left$/.test(x.dir); }).length + ' left, ' + tees.filter(function (x) { return /right$/.test(x.dir); }).length + ' right' + (tees.filter(function (x) { return x.ob; }).length ? ', ' + tees.filter(function (x) { return x.ob; }).length + ' OB' : '') + '.</p>';
    if (tees.length < list.length) o += clubSVG(list);
    o += '<div class="stat-grid" id="clubcells">' + stat('Avg short / long', fmtD(st.lg, 'long', 'short')) + stat('Avg left / right', fmtD(st.lr, 'right', 'left')) +
      stat('Finished on green', st.n ? st.green + ' / ' + st.n + ' (' + Math.round(st.green / st.n * 100) + '%)' : '–') + stat('Strokes gained', '<span class="' + sgCls(st.sg) + '">' + fmtSG(st.sg) + '</span>' + (st.sgN ? ' <small>(' + fmtSG(st.sg / st.sgN) + '/shot)</small>' : '')) + '</div>' +
      '<div class="legend"><span><i class="dot" style="background:#fff"></i>Finished on the green</span><span><i class="dot" style="background:#d0213a"></i>Finished off the green</span><span><i class="dot" style="background:#ffd23f"></i>Holed</span>' +
      '<span>Rings = yards from the hole; points use the distance left and direction you entered on the next shot. ' + (st.ob ? st.ob + ' OB shot(s) and ' : '') + (st.n - st.nDir - st.ob - tees.length > 0 ? (st.n - st.nDir - st.ob - tees.length) + ' shot(s) with no direction are not drawn / not in the averages.' : '') + '</span></div>';
    o += '<h3>Shots with ' + esc(cur) + '</h3><table id="clubshots"><tr><th>Hole</th><th>From</th><th>Finished</th><th class="num">SG</th></tr>' + list.map(function (x) {
      var fin = x.holed ? 'holed' : x.ob ? 'OB' : (x.s.end.lie === 'green' ? Math.round(x.s.end.dist) + ' ft' : Math.round(x.s.end.dist) + ' yd') + (x.dir ? ' ' + SG.DIR_NAME[x.dir].toLowerCase() : '') + (x.s.end.lie !== 'green' ? ' · ' + (LIE_NAME[x.s.end.lie] || x.s.end.lie) : ' · green');
      return '<tr><td>' + (all ? localDate(x.r.date).slice(5) + ' #' : '#') + x.hole + '</td><td>' + Math.round(x.s.start.dist) + ' yd ' + (LIE_NAME[x.s.start.lie] || (x.s.start.lie === 'tee' ? 'tee' : x.s.start.lie)) + '</td><td>' + esc(fin) + '</td><td class="num ' + sgCls(x.sg) + '">' + (x.layup ? 'layup' : fmtSG(x.sg)) + '</td></tr>'; }).join('') + '</table>';
    var rank = used.map(function (c) { var s2 = clubStats(by[c]); return { c: c, s: s2 }; }).filter(function (x) { return x.s.sgN; }).sort(function (a, b) { return b.s.sg / b.s.sgN - a.s.sg / a.s.sgN; });
    o += '<h3>Strokes gained by club</h3><table id="clubrank"><tr><th>#</th><th>Club</th><th class="num">Shots</th><th class="num">SG/shot</th><th class="num">Total</th><th>Bias</th></tr>' + rank.map(function (x, i) {
      return '<tr data-act="clubsel" data-v="' + esc(x.c) + '" class="' + (x.c === cur ? 'cur' : '') + '"><td>' + (i + 1) + '</td><td><b>' + esc(x.c) + '</b></td><td class="num">' + x.s.sgN + '</td><td class="num ' + sgCls(x.s.sg) + '">' + fmtSG(x.s.sg / x.s.sgN) + '</td><td class="num ' + sgCls(x.s.sg) + '">' + fmtSG(x.s.sg) + '</td><td>' + (x.s.bias ? '⚠ ' + Math.round(Math.abs(x.s.lg)) + ' yd ' + x.s.bias : '') + '</td></tr>'; }).join('') + '</table>' +
      '<p class="help muted">Best club per shot at the top (vs PGA Tour baseline). Layup tee shots are not in SG. Bias ⚠ = finishes more than 5 yd short or long on average (from the distance + direction of the next shot; straight left/right counts as pin high). Tap a row to see that club.</p>';
    return o;
  }
  // ---------- Best vs worst rounds (app only) ----------
  var CMP_KINDS = [['prox', 'Proximity'], ['gir', 'GIR'], ['miss', 'Approach misses'], ['putt', '1st putts']];
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
    var b = {}, keys = SG.APPR_BUCKETS.map(function (x) { return x.id; }).concat(['0-20 yd', '0-5 ft', '5-15 ft', '15-30 ft', '30+ ft']);
    keys.forEach(function (k) { b[k] = { n: 0, sg: 0, pS: 0, pN: 0, gir: 0, girN: 0 }; });
    set.forEach(function (x) { keys.forEach(function (k) { var B = x.S.buckets[k]; if (!B) return; b[k].n += B.n; b[k].sg += B.sg; b[k].pS += B.proxSum; b[k].pN += B.proxN; });
      x.S.proxList.forEach(function (m) { var k = cmpBucket(m.from); if (b[k]) { b[k].girN++; if (m.hit) b[k].gir++; } }); });
    return { b: b, keys: keys, n: set.length };
  }
  function cmpGapHTML(C) {
    // v100: Best and Worst as two tinted column groups (Avg ft · GIR · SG each), then Gap behind a divider; rows grouped Approach / Short game / Putting
    var B = cmpAgg(C.best), W = cmpAgg(C.worst), pr = function (x) { return x.pN ? Math.round(x.pS / x.pN) : '–'; }, gp = function (x) { return x.girN ? Math.round(x.gir / x.girN * 100) + '%' : '–'; };
    var avg = function (L) { return L.reduce(function (a, x) { return a + x.S.strokes; }, 0) / L.length; };
    var who = function (L) { return L.length === 1 ? esc(new Date(L[0].r.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })) + ' · ' + L[0].S.strokes : L.length + ' rounds · avg ' + Math.round(avg(L)); };
    var o = '<div class="gapcard"><table id="gaptable" class="gaptable gapt"><colgroup><col class="c-from"><col span="3" class="c-b"><col span="3" class="c-w"><col class="c-gap"></colgroup>' +
      '<thead><tr><th rowspan="2" class="from">From</th><th colspan="3" class="gb ghead" id="gapbesthead">Best<small>' + who(C.best) + '</small></th><th colspan="3" class="gw ghead" id="gapworsthead">Worst<small>' + who(C.worst) + '</small></th><th rowspan="2" class="gap">Gap</th></tr>' +
      '<tr class="gsub"><th class="gb g1">Avg ft</th><th class="gb">GIR</th><th class="gb">SG</th><th class="gw g1">Avg ft</th><th class="gw">GIR</th><th class="gw">SG</th></tr></thead><tbody>';
    var secs = [['Approach · yards', SG.APPR_BUCKETS.map(function (x) { return x.id; })], ['Short game · yards', ['0-20 yd']], ['Putting · first putt, feet', ['0-5 ft', '5-15 ft', '15-30 ft', '30+ ft']]];
    secs.forEach(function (sec) {
      var rows = sec[1].filter(function (k) { return B.b[k] && (B.b[k].n || W.b[k].n); }); if (!rows.length) return;
      var ap = sec === secs[0];
      o += '<tr class="gsec"><td colspan="8">' + sec[0] + '</td></tr>';
      rows.forEach(function (k) { var b = B.b[k], w = W.b[k], sb = b.sg / B.n, sw = w.sg / W.n, gap = sb - sw;
        o += '<tr data-bucket="' + k + '"><td class="from">' + k.replace(/ (yd|ft)$/, '').replace('-', '–') + '</td>' +
          '<td class="gb g1">' + (ap ? pr(b) : '') + '</td><td class="gb">' + (ap ? gp(b) : '') + '</td><td class="gb ' + sgCls(sb) + '">' + fmtSG(sb) + '</td>' +
          '<td class="gw g1">' + (ap ? pr(w) : '') + '</td><td class="gw">' + (ap ? gp(w) : '') + '</td><td class="gw ' + sgCls(sw) + '">' + fmtSG(sw) + '</td>' +
          '<td class="gap ' + sgCls(gap) + '"><b>' + fmtSG(gap) + '</b></td></tr>'; });
    });
    return o + '</tbody></table></div><p class="help muted gapnote"><b>Avg ft</b> = how far from the hole approaches from that distance finished (feet). <b>GIR</b> = greens in regulation hit from there. <b>SG</b> = strokes gained per round vs PGA Tour. ' +
      '<b>Gap</b> = best minus worst – the biggest green gaps are where your bad rounds lose the most.</p>';
  }
  function compareHTML2() {
    var C = cmpRounds(), kind = view.cmpKind || 'prox', ov = !!view.cmpOverlay;
    var h = '<div class="topbar"><button class="txt" data-act="history">‹ Rounds</button><div class="title"><b>Best vs worst rounds</b><span>by score vs par</span></div><span></span></div>';
    if (C.maxN < 1) return h + '<p class="notice" id="cmpnone">You need at least 2 rounds with finished holes to compare.</p>';
    h += '<div class="cmpn" id="cmpn"><button data-act="cmpn" data-v="-1"' + (C.n <= 1 ? ' disabled' : '') + ' aria-label="Fewer rounds">−</button><span>Best <b>' + C.n + '</b> vs worst <b>' + C.n + '</b> round' + (C.n === 1 ? '' : 's') + '</span><button data-act="cmpn" data-v="1"' + (C.n >= C.maxN ? ' disabled' : '') + ' aria-label="More rounds">+</button></div>';
    var line = function (x) { return '<li><span class="cl-d">' + esc(new Date(x.r.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })) + '</span><span class="cl-c">' + esc(x.r.course || 'Round') + (x.S.holesDone < 18 ? ' · ' + x.S.holesDone + ' holes' : '') + '</span><span class="cl-s"><b>' + x.S.strokes + '</b> ' + toPar(x.S.toPar) + '</span></li>'; };
    h += '<div class="cmpcols"><div class="cmpcard gbcard"><h3>Best</h3><ul class="cmplist" id="cmpbest">' + C.best.map(line).join('') + '</ul></div><div class="cmpcard gwcard"><h3>Worst</h3><ul class="cmplist" id="cmpworst">' + C.worst.map(line).join('') + '</ul></div></div>';
    h += '<h2>Where the strokes go</h2>' + cmpGapHTML(C);
    h += '<h2>Maps</h2><div class="seg cmpkinds" id="cmpkinds">' + CMP_KINDS.map(function (k) { return '<button data-act="cmpkind" data-v="' + k[0] + '" class="' + (k[0] === kind ? 'sel' : '') + '">' + k[1] + '</button>'; }).join('') + '</div>';
    var grp = null;
    if (kind === 'prox') { var all = cmpList(C.best.concat(C.worst), 'prox'), cnt = {}; all.forEach(function (m) { var k = cmpBucket(m.from); cnt[k] = (cnt[k] || 0) + 1; });
      grp = view.cmpGrp && cnt[view.cmpGrp] ? view.cmpGrp : SG.APPR_BUCKETS.map(function (x) { return x.id; }).filter(function (k) { return cnt[k]; }).sort(function (a, b) { return cnt[b] - cnt[a]; })[0] || null;
      h += '<div class="seg cmpgrps" id="cmpgrps">' + SG.APPR_BUCKETS.map(function (x) { return '<button data-act="cmpgrp" data-v="' + x.id + '" class="' + (x.id === grp ? 'sel' : '') + '"' + (cnt[x.id] ? '' : ' disabled') + '>' + x.id.replace(' yd', '') + '<small> ' + (cnt[x.id] || 0) + '</small></button>'; }).join('') + '</div>'; }
    var lb = cmpList(C.best, kind, grp), lw = cmpList(C.worst, kind, grp);
    h += '<div class="seg" id="cmpmode"><button data-act="cmpov" data-v="0" class="' + (ov ? '' : 'sel') + '">Side by side</button><button data-act="cmpov" data-v="1" class="' + (ov ? 'sel' : '') + '">Overlay</button></div>';
    if (!ov) h += '<div class="cmpmaps" id="cmpmaps"><figure class="cmpbest"><figcaption>Best · ' + lb.length + '</figcaption>' + cmpSVG(kind, lb, grp) + '</figure><figure class="cmpworst"><figcaption>Worst · ' + lw.length + '</figcaption>' + cmpSVG(kind, lw, grp) + '</figure></div>' +
      '<p class="help muted">Same scale on both sides. Best rounds left, worst right (dashed border).</p>';
    else h += '<div class="cmpov" id="cmpov">' + cmpSVG(kind, lw, grp).replace('<svg ', '<svg id="cmpovmap" ') + '<div class="cmphide" aria-hidden="true">' + cmpSVG(kind, lb, grp).replace('<svg ', '<svg id="cmpbestsrc" ') + '</div></div>' +
      '<div class="legend" id="cmplegend"><span><i class="dot" style="background:transparent;border:2.5px solid #db1420"></i>Worst rounds – red cluster outlines</span><span><i class="dot" style="background:transparent;border:2.5px solid #000"></i>Best rounds – black cluster outlines</span></div>' +
      '<p class="help muted">Overlay: outlines of where shots clustered – worst rounds red, best rounds black, same scale and the same Cluster setting. No fill and no dots; a lone shot gets a small outline. Best ' + lb.length + ' · worst ' + lw.length + ' shots.</p>';
    return h;
  }
  function cmpPoints(svg) {
    var out = []; svg.querySelectorAll('[data-hd]').forEach(function (e) { var k = (e.getAttribute('data-kind') || '') + (e.getAttribute('data-class') || ''); if (/nodir/.test(k)) return;
      var b = e.getBBox(); out.push({ x: b.x + b.width / 2, y: b.y + b.height / 2, d: +e.getAttribute('data-hd') || 0, u: e.getAttribute('data-hu') || 'ft' }); });
    return out;
  }
  function applyCompare() {
    var ov = document.getElementById('cmpovmap'), src = document.getElementById('cmpbestsrc'); if (!ov || !src) return;
    var kind = ov.getAttribute('data-kind'), C = heatCenter(ov, kind), wp = cmpPoints(ov), bp = cmpPoints(src), h = '<defs><filter id="hgoo" filterUnits="userSpaceOnUse" x="-2000" y="-2000" width="6000" height="6000"><feGaussianBlur in="SourceGraphic" stdDeviation="4.5" result="b"/><feColorMatrix in="b" mode="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 22 -9"/></filter>' +
      // best-round islands: the same goo shape, hollowed out to a 2.6 px black outline (no fill)
      '<filter id="houtl" filterUnits="userSpaceOnUse" x="-2000" y="-2000" width="6000" height="6000"><feGaussianBlur in="SourceGraphic" stdDeviation="4.5" result="b"/><feColorMatrix in="b" mode="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 22 -9" result="s"/>' +
      '<feMorphology in="s" operator="erode" radius="2.6" result="e"/><feComposite in="s" in2="e" operator="out"/></filter>' +
      '<filter id="houtlr" filterUnits="userSpaceOnUse" x="-2000" y="-2000" width="6000" height="6000"><feGaussianBlur in="SourceGraphic" stdDeviation="4.5" result="b"/><feColorMatrix in="b" mode="matrix" values="0 0 0 0 .86  0 0 0 0 .08  0 0 0 0 .12  0 0 0 22 -9" result="s"/>' +
      '<feMorphology in="s" operator="erode" radius="2.6" result="e"/><feComposite in="s" in2="e" operator="out"/></filter></defs>';
    ov.classList.add('heat');
    // Overlay = outlines only: each cluster's smooth hugging island shape, hollowed (no fill, no dots). Worst = red, best = black on top.
    var outl = function (pts, id, cls) { if (!pts.length) return ''; var I = heatIslandsReal(pts, heatReal(pts, C), heatClus());
      return '<g id="' + id + '" filter="url(#' + (cls === 'worstisl' ? 'houtlr' : 'houtl') + ')">' + I.map(function (g) { return '<path class="' + cls + '" data-n="' + g.length + '" d="' + islandShape(g, '~path') + '" fill="transparent" stroke="#000" stroke-width="25.4" stroke-linecap="round" stroke-linejoin="round"/>'; }).join('') + '</g>'; };
    h += outl(wp, 'worstisls', 'worstisl');
    h += outl(bp, 'bestisls', 'bestisl');
    var g = document.createElementNS('http://www.w3.org/2000/svg', 'g'); g.setAttribute('id', 'cmplayer'); g.innerHTML = h; ov.appendChild(g);
    src.parentNode.remove();
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
  var PMC = { short: '#ef6c00', long: '#6a1b9a', left: '#1565e0', right: '#d81b60', nearlong: '#555', nodir: '#888' };
  var PMN = { short: 'Short', long: 'Long (over 3 ft past)', left: 'Left', right: 'Right', nearlong: 'Just long (within 3 ft)', nodir: 'No direction entered' };
  function pmissTile(S) {
    var L = SG.pmissList(S.puttList), m = L.filter(function (p) { return !p.made; }).length;
    return tile('pmiss', '1st putt misses (&lt;10 ft) – tap for map', L.length ? m + '/' + L.length + ' missed' : '–', '<small class="mini" id="pmmini">' + pmissLine(m, L.length) + '</small>');
  }
  // v105: one plain sentence, used by the tile and the map box
  function pmissLine(m, n) {
    return n ? '1st putts from 10 ft and in · ' + (n - m) + ' made' : 'no 1st putts from 10 ft and in yet';
  }
  // v104 lag putts (start more than 10 ft away; v105: 1st putt of the hole only): success = finished within 3 ft (or holed). Opens the putt-misses map, which shows the same box for the round / all rounds.
  function lagLine(LG) {
    return LG.attempts ? Math.round(LG.pct) + '% inside 3 ft' : 'no 1st putts from over 10 ft yet';
  }
  function lagTile(LG) {
    return tile('pmiss', 'Lag putts (&gt;10 ft) – tap for map', LG.attempts ? LG.inside + '/' + LG.attempts + ' inside 3 ft' : '–', '<small class="mini" id="lagmini">' + lagLine(LG) +
      (LG.attempts ? ' · avg leave ' + fmtLeave(LG.avgLeaveFt) : '') + '</small>');
  }
  function fmtLeave(ft) { return ft == null ? '–' : (Math.round(ft * 10) / 10) + ' ft'; }
  function pmissData(scopeAll, gid) {
    var all = [], lag = [], n = 0;
    (scopeAll ? savedRounds() : [round()]).forEach(function (r) { n++; var PL = SG.summarize(r, 'pga').puttList; all = all.concat(SG.pmissList(PL)); lag = lag.concat(SG.lagList(PL)); });
    var counts = {}; SG.PMISS_GROUPS.forEach(function (g) { counts[g.id] = all.filter(function (p) { return SG.pmissGroup(p.ft) === g.id; }).length; });
    var g = gid || view.pmG; if (!g || !counts[g]) g = SG.PMISS_GROUPS.filter(function (x) { return counts[x.id]; }).map(function (x) { return x.id; }).pop() || '0-6';
    var list = all.filter(function (p) { return SG.pmissGroup(p.ft) === g; });
    return { group: g, counts: counts, list: list, stats: SG.pmissStats(list), rounds: n, lag: SG.lagStats(lag) };
  }
  function pmissSVG(list, gid) {
    var G = SG.PMISS_GROUPS.filter(function (x) { return x.id === gid; })[0], W = 360, H = 400, cx = 180, cy = 200, R = 170;
    var sc = SG.pmissScale(G, list.filter(function (p) { return !p.made; }).map(function (p) { return p.endFt; })), maxFt = sc.max, step = sc.step, RR = R - 14, rad = function (ft) { return RR * Math.max(0, Math.min(ft, maxFt)) / maxFt; };
    var o = '<svg id="pmissmap" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Missed putts"><rect width="' + W + '" height="' + H + '" fill="#cfe8c4"/><circle cx="' + cx + '" cy="' + cy + '" r="' + R + '" fill="#3da33d" stroke="#145214" stroke-width="4"/>';
    for (var f = step; f <= maxFt; f += step) o += '<circle cx="' + cx + '" cy="' + cy + '" r="' + f1(rad(f)) + '" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="' + (f === maxFt ? 2 : 1) + '"/><text class="ring" x="' + f1(cx + rad(f) * 0.707 + 3) + '" y="' + f1(cy + rad(f) * 0.707 + 11) + '" font-size="10" font-weight="800" fill="#fff">' + f + ' ft</text>';
    o += '<text x="' + cx + '" y="18" text-anchor="middle" font-size="12" font-weight="900">LONG ↑</text><text x="' + cx + '" y="' + (H - 6) + '" text-anchor="middle" font-size="12" font-weight="900">SHORT ↓ (toward you)</text>' +
      '<text x="6" y="' + (cy + 4) + '" font-size="12" font-weight="900">L</text><text x="' + (W - 6) + '" y="' + (cy + 4) + '" text-anchor="end" font-size="12" font-weight="900">R</text>';
    var tr = '', dots = '', labs = '', boxes = [], seenS = {}, seenE = {}, ns = 0;
    var lbl = function (x, y, t, col) { var w = t.length * 6 + 6, best = null;
      [[8, 4], [-8 - w, 4], [-w / 2, -9], [-w / 2, 17], [10, 14], [-10 - w, 14], [10, -8], [-10 - w, -8]].some(function (c) { var b = [x + c[0], y + c[1] - 10, x + c[0] + w, y + c[1] + 2];
        if (b[0] < 2 || b[2] > W - 2 || b[1] < 22 || b[3] > H - 20) return false; if (!best) best = b; if (boxes.some(function (q) { return b[0] < q[2] && b[2] > q[0] && b[1] < q[3] && b[3] > q[1]; })) return false; best = b; return true; });
      if (!best) return ''; boxes.push(best); return '<text class="pmlbl" x="' + f1(best[0] + 3) + '" y="' + f1(best[3] - 2) + '" font-size="11" font-weight="900" fill="' + col + '" stroke="#fff" stroke-width="3" paint-order="stroke">' + esc(t) + '</text>'; };
    var misses = list.filter(function (p) { return !p.made; }), pend = [];
    misses.forEach(function (p, i) {
      var cls = SG.pmissClass(p), col = PMC[cls];
      var s = [cx, cy + RR]; // every putt starts from one spot straight below the hole (the hole is the target)
      var ea = p.endDir ? SG.DIR_ANGLE[p.endDir] : 90, clamped = p.endFt > maxFt, ek = (p.endDir || 'n') + Math.round(p.endFt * 2), je = seenE[ek] = (seenE[ek] || 0) + 1;
      var e = pt(cx, cy, Math.max(rad(p.endFt), 9), ea + (je - 1) * 9);
      var mx = (s[0] + e[0]) / 2 + (e[1] - s[1]) * 0.12, my = (s[1] + e[1]) / 2 - (e[0] - s[0]) * 0.12;
      tr += '<path class="pmtr" data-class="' + cls + '" d="M' + f1(s[0]) + ' ' + f1(s[1]) + ' Q' + f1(mx) + ' ' + f1(my) + ' ' + f1(e[0]) + ' ' + f1(e[1]) + '" fill="none" stroke="#fff" stroke-width="5" stroke-opacity=".7"/>' +
        '<path d="M' + f1(s[0]) + ' ' + f1(s[1]) + ' Q' + f1(mx) + ' ' + f1(my) + ' ' + f1(e[0]) + ' ' + f1(e[1]) + '" fill="none" stroke="' + col + '" stroke-width="2.6"/>';
      dots += cls === 'nodir' ? '<g class="pmend" data-class="nodir"><path d="M' + f1(e[0]) + ' ' + f1(e[1] - 8) + ' l8 8 -8 8 -8 -8z" fill="#fff" stroke="#555" stroke-width="2"/><text x="' + f1(e[0]) + '" y="' + f1(e[1] + 4) + '" text-anchor="middle" font-size="10" font-weight="900">?</text></g>'
        : '<circle class="pmend" data-hd="' + p.endFt + '" data-hu="ft" data-class="' + cls + '" cx="' + f1(e[0]) + '" cy="' + f1(e[1]) + '" r="5.5" fill="' + col + '" stroke="#000" stroke-width="1.5"/>';
      boxes.push([e[0] - 6, e[1] - 6, e[0] + 6, e[1] + 6]);
      pend.push([e[0], e[1], (Math.round(p.endFt * 10) / 10) + ' ft' + (clamped ? ' ›' : ''), col]);
    });
    pend.forEach(function (q) { labs += lbl(q[0], q[1], q[2], q[3] === '#888' ? '#333' : q[3]); });
    return o + tr + '<circle cx="' + cx + '" cy="' + cy + '" r="4.5" fill="#000"/><circle id="pmorigin" cx="' + cx + '" cy="' + (cy + RR) + '" r="7" fill="#fff" stroke="#000" stroke-width="2"/><text x="' + (cx + 11) + '" y="' + (cy + RR + 4) + '" font-size="10" font-weight="800" fill="#fff">putts start here</text>' + dots + labs + '</svg>';
  }
  function pmissCells(st) {
    var pc = function (k) { return st.misses ? Math.round(st.pct[k]) + '%' : '–'; };
    return '<div class="stat-grid pmcells" id="pmcells">' + stat('Left', pc('left')) + stat('Right', pc('right')) + stat('Short', pc('short')) + stat('Long (> 3 ft past)', pc('long')) +
      stat('1st putts made', st.made + '/' + st.attempts) + stat('Just long ≤ 3 ft / no dir.', st.counts.nearlong + ' / ' + st.counts.nodir) + '</div>';
  }
  function pmissLegend() {
    return '<div class="legend" id="pmlegend">' + ['left', 'right', 'short', 'long', 'nearlong'].map(function (k) { return '<span><i class="ln" style="background:' + PMC[k] + '"></i><i class="dot" style="background:' + PMC[k] + '"></i>' + PMN[k] + '</span>'; }).join('') +
      '<span><svg width="20" height="20" viewBox="0 0 20 20" style="flex:none"><path d="M10 2 l8 8 -8 8 -8 -8z" fill="#fff" stroke="#555" stroke-width="2"/><text x="10" y="14" text-anchor="middle" font-size="10" font-weight="900">?</text></svg>No direction entered for where it finished (drawn long)</span>' +
      '<span><i class="dot" style="background:#fff"></i>Common start point: every putt is drawn from straight below the hole, so the hole is the target</span>' +
      '<span>Label = feet left to the hole (› = further than the picture, drawn at the edge). Rings = feet from the hole, evenly spaced (linear scale, set per distance group so misses spread out).</span></div>';
  }
  function lagBox(LG, all, n) {
    return '<div class="lagbox" id="lagbox"><div class="lagh">Lag putts (&gt;10 ft)' + (all ? ' – ' + n + ' round' + (n === 1 ? '' : 's') : ' – this round') + '</div>' +
      '<div class="stat-grid lagcells">' + stat('Inside 3 ft', LG.attempts ? LG.inside + '/' + LG.attempts + ' (' + Math.round(LG.pct) + '%)' : '–') + stat('Avg leave', fmtLeave(LG.avgLeaveFt)) + '</div>' +
      '<p class="help muted">1st putt on each hole only, from more than 10 ft. Good = holed or finished within 3 ft (3 ft counts). Avg leave = distance left after the putt (holed = 0).</p></div>';
  }
  function pmissHTML(all) {
    var D = pmissData(all), G = SG.PMISS_GROUPS.filter(function (x) { return x.id === D.group; })[0];
    var btns = '<div class="seg pmgroups" id="pmgroups">' + SG.PMISS_GROUPS.map(function (g) { var c = D.counts[g.id];
      return '<button data-act="pmg" data-v="' + g.id + '" data-n="' + c + '" class="' + (g.id === D.group ? 'sel' : '') + '"' + (c ? '' : ' disabled') + ' aria-pressed="' + (g.id === D.group) + '">' + g.name + (c ? '<small> ' + c + '</small>' : '') + '</button>'; }).join('') + '</div>';
    return btns + '<p class="mapsum" id="mapsum"><b>' + D.stats.misses + '/' + D.stats.attempts + '</b> missed – 1st putts from <b id="pmsel">' + G.name + '</b>' + (all ? ' in ' + D.rounds + ' round' + (D.rounds === 1 ? '' : 's') : ' this round') + '</p>' +
      pmissSVG(D.list, D.group) + pmissCells(D.stats) + pmissLegend() + lagBox(D.lag, all, D.rounds) +
      '<p class="help muted">Each line runs from one common start (below the hole) to where the putt finished, placed around the hole by the direction and distance of the next putt: short = below the hole, long = above, left/right to the sides. Short = finished short (incl. short left/right). Long = finished long and more than 3 ft past the hole. Long left/right within 3 ft count as Left/Right; straight long within 3 ft = "just long" (good speed, not counted as Long). Percentages are of misses. Only the 1st putt on each hole counts, from 10 ft and in (10 ft included) – groups: under 6 ft and 6–10 ft. 1st putts from over 10 ft are in Lag putts (&gt;10 ft) above: they only need to finish inside 3 ft.</p>';
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
  var PCOL = { made: '#000', miss2: '#1565e0', miss3: '#e0102a' };
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
      '<div class="legend" id="puttlegend"><span><i class="dot" style="background:#000;border-color:#000"></i>Made</span><span><i class="dot" style="background:#fff;border:3px solid #1565e0"></i>Missed – 2-putt hole</span><span><i class="dot" style="background:#fff;border:3px solid #e0102a"></i>Missed – 3-putt or worse</span>' +
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
    var Z = PX.Z, H = PX.H, W = PX.W, fx0 = PX.cx - 46, fx1 = PX.cx + 46, t = function (x, y, s, a, c) { return '<text x="' + x + '" y="' + y + '" text-anchor="' + (a || 'middle') + '" font-size="10" font-weight="900" fill="' + (c || '#fff') + '" letter-spacing=".5">' + s + '</text>'; };
    var o = '<g id="liestrip"><rect x="0" y="' + Z + '" width="' + W + '" height="' + (H - Z) + '" fill="#5f9e47"/>' +
      '<path d="M' + (fx0 + 8) + ' ' + Z + ' L' + (fx1 - 8) + ' ' + Z + ' L' + fx1 + ' ' + H + ' L' + fx0 + ' ' + H + ' Z" fill="#9fdf86"/>';
    for (var k = 0; k < 5; k++) o += '<rect x="' + (fx0 + 2) + '" y="' + (Z + 8 + k * 28) + '" width="' + (fx1 - fx0 - 4) + '" height="12" fill="#b3ea9e" opacity=".55"/>';
    o += '<ellipse id="lie-sand" cx="' + (W - 50) + '" cy="' + (Z + 40) + '" rx="32" ry="15" fill="#ecd27e" stroke="#c9a94f" stroke-width="2"/>' +
      '<rect id="lie-other" x="0" y="' + (H - 42) + '" width="62" height="42" fill="#2f6b2a"/><circle cx="14" cy="' + (H - 30) + '" r="9" fill="#1f4f1b"/><circle cx="46" cy="' + (H - 34) + '" r="10" fill="#1f4f1b"/>' +
      '<rect id="lie-tee" x="' + (PX.cx - 22) + '" y="' + (H - 24) + '" width="44" height="15" rx="4" fill="#c9f2b8" stroke="#fff" stroke-width="2"/>' +
      t(52, Z + 14, 'ROUGH') + t(PX.cx, Z + 14, 'FAIRWAY', 'middle', '#1d5c12') + t(W - 50, Z + 14, 'ROUGH') + t(W - 50, Z + 44, 'BUNKER', 'middle', '#7a5a10') +
      t(31, H - 46, 'OTHER') + t(PX.cx + 26, H - 12, 'TEE', 'start', '#1d5c12') + t(4, Z - 4, '↓ toward you', 'start', '#2f6b2a') + '</g>';
    return o;
  }
  // D1 women's approach proximity benchmark (Shot Scope D1 women's chart, ft): one row per 10-yd band [from yd, low ft, high ft, estimated?].
  // A rail button at Y yd uses the band containing Y; a boundary goes to the band that starts there (150 -> 150-160). Ring radius = midpoint.
  // 180 yd and up are not on the chart: extended from the trend and marked estimated.
  var D1_PROX = [[40, 12, 18], [50, 14, 20], [60, 15, 22], [70, 16, 24], [80, 18, 26], [90, 20, 28], [100, 22, 32], [110, 24, 36], [120, 26, 40], [130, 28, 45],
    [140, 30, 50], [150, 33, 55], [160, 36, 60], [170, 39, 65], [180, 42, 70, true], [190, 45, 75, true], [200, 48, 80, true]];
  function d1Bench(yd) { yd = Number(yd); if (!isFinite(yd) || yd < 40) return null; var b = null; D1_PROX.forEach(function (r) { if (yd >= r[0]) b = r; });
    return b ? { from: b[0], lo: b[1], hi: b[2], ft: (b[1] + b[2]) / 2, est: !!b[3] } : null; }
  function d1Ring(bucket) { var B = d1Bench(bucket); if (!B) return '';
    var r = B.ft * PX.K, ty = Math.max(14, PX.cy - r - 5), lab = 'D1 avg ' + Math.round(B.ft) + '\u2019' + (B.est ? ' est.' : '');
    return '<g id="d1ring" data-ft="' + B.ft + '" data-est="' + (B.est ? 1 : 0) + '"><circle cx="' + PX.cx + '" cy="' + PX.cy + '" r="' + f1(r) + '" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="5"/>' +
      '<circle cx="' + PX.cx + '" cy="' + PX.cy + '" r="' + f1(r) + '" fill="none" stroke="#e00016" stroke-width="2.6" stroke-dasharray="9 6"/>' +
      '<text x="' + PX.cx + '" y="' + f1(ty) + '" text-anchor="middle" font-size="11" font-weight="900" fill="#c00012" stroke="#fff" stroke-width="3" paint-order="stroke">' + lab + '</text></g>'; }
  // Zoom: a selected yardage shows the D1 ring + 10 ft as the green radius; a distance group uses the ring at its midpoint;
  // All 40-200 keeps the 60-yd green (90 ft). The green is always PX.Rg px across, so K (px per ft) changes per distance.
  function grpMid(group) { var g = String(group).replace(' yd', '').split(/[-+]/), lo = +g[0], hi = g[1] ? +g[1] : lo + 20; return (lo + hi) / 2; } // '130-160' -> 145, '200+' -> 210
  function proxZoomFt(bucket, group) {
    if (group) bucket = grpMid(group);
    var B2 = d1Bench(bucket); return B2 ? B2.ft + 10 : 90; }
  function proxSVG(list, bucket, zoomFt) {
    var RFT = zoomFt || proxZoomFt(bucket); PX.K = PX.Rg / RFT; var HMAX = RFT * 0.97;
    var out = '<svg id="proxmap" viewBox="0 0 ' + PX.W + ' ' + PX.H + '" role="img" aria-label="Approach proximity">' +
      '<rect width="' + PX.W + '" height="' + PX.H + '" fill="#cfe8c4"/>' + lieStrip() + '<circle cx="' + PX.cx + '" cy="' + PX.cy + '" r="' + PX.Rg + '" fill="#3da33d" stroke="#145214" stroke-width="4"/>';
    // ring step per zoom: 5 ft under 40 ft, 10 ft under 80, else 15; labels every ring, or every other one at 5-ft steps
    var step = RFT < 40 ? 5 : RFT < 80 ? 10 : 15, rings = []; for (var rf = step; rf < RFT - 2; rf += step) rings.push(rf);
    out += '<g id="proxrings" data-step="' + step + '" data-rft="' + Math.round(RFT) + '">';
    rings.reverse().forEach(function (ft, i) { var lab = step === 5 ? ft % 10 === 0 : true;
      out += '<circle cx="' + PX.cx + '" cy="' + PX.cy + '" r="' + f1(ft * PX.K) + '" fill="none" stroke="#fff" stroke-width="' + (ft % (step * 2) ? 1.2 : 2) + '" stroke-opacity=".85"/>' +
        (lab ? '<text class="ring" x="' + f1(PX.cx + 2 + ft * PX.K * 0.707) + '" y="' + f1(PX.cy + 11 + ft * PX.K * 0.707) + '" font-size="10" font-weight="800" fill="#fff">' + ft + (i === 0 || (step === 5 && i === 1) ? ' ft' : '') + '</text>' : '');
    });
    out += '</g>';
    out += '<circle cx="' + PX.cx + '" cy="' + PX.cy + '" r="5" fill="#000"/><line x1="' + PX.cx + '" y1="' + PX.cy + '" x2="' + PX.cx + '" y2="' + (PX.cy - 28) + '" stroke="#000" stroke-width="3"/>' +
      '<path d="M' + PX.cx + ' ' + (PX.cy - 28) + ' l18 6 l-18 6z" fill="#d0213a"/>';
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
    out += tr + starts + dots + labels + '<text x="' + PX.cx + '" y="16" text-anchor="middle" font-size="13" font-weight="800">LONG ↑</text>' +
      '<text x="6" y="16" font-size="13" font-weight="800">◀ LEFT</text><text x="' + (PX.W - 6) + '" y="16" text-anchor="end" font-size="13" font-weight="800">RIGHT ▶</text>' +
      (nd ? '<text x="' + (PX.W - 8) + '" y="34" text-anchor="end" font-size="11" font-weight="800">missed, no direction ↓</text>' : '');
    return out + d1Ring(bucket) + '</svg>';
  }
  function proxHTML(all) {
    var D = proxData(), L = D.list, P = SG.proxStats(L), miss = L.filter(function (m) { return !m.hit; });
    // yardage rail: 200 at the top (farther = up the page, like the map), 40 at the bottom
    var rail = SG.PROX_BUCKETS.slice(1).reverse().map(function (b) {
      var c = D.counts[b.id];
      return '<button class="ybtn' + (b.id === D.bucket ? ' sel' : '') + '" data-act="proxb" data-v="' + b.id + '" data-n="' + c + '"' + (c ? '' : ' disabled') +
        ' aria-pressed="' + (b.id === D.bucket) + '" aria-label="' + b.yd + ' yards, ' + c + ' shot' + (c === 1 ? '' : 's') + '"><b>' + b.yd + '</b>' + (c ? '<small>' + c + '</small>' : '') + '</button>';
    }).join('');
    var bname = view.proxGroup ? view.proxGroup + ' yd group' : D.bucket === 'all' ? 'All 40–200 yd' : D.bucket + ' yd (' + (Number(D.bucket) - 5) + '–' + (Number(D.bucket) + 4) + ')';
    var scope = all ? ' in ' + D.rounds + ' round' + (D.rounds === 1 ? '' : 's') : ' this round';
    var LIE_NM = { all: 'All lies' }; SG.PROX_LIES.forEach(function (l) { LIE_NM[l.id] = l.name; });
    var chips = ['all'].concat(SG.PROX_LIES.map(function (l) { return l.id; })).map(function (id) {
      var c = D.lieCounts[id];
      return '<button class="liebtn' + (id === D.lie ? ' sel' : '') + '" data-act="proxlie" data-v="' + id + '" data-n="' + c + '"' + (c ? '' : ' disabled') + ' aria-pressed="' + (id === D.lie) + '">' + LIE_NM[id] + ' <small>' + c + '</small></button>';
    }).join('');
    var rows = SG.proxByLie(D.inB), warns = SG.proxWarnings(rows), wid = {}; warns.forEach(function (w) { wid[w.id] = 1; });
    var pct = function (r) { return r.n ? r.hits + '/' + r.n + ' (' + Math.round(r.hitPct) + '%)' : '–'; };
    var lieTab = '<table class="dirtab lietab" id="lietab"><tr><th>Lie</th><th class="num">Shots</th><th class="num">Greens hit</th><th class="num">Avg hit</th><th class="num">Avg all</th></tr>' +
      rows.map(function (r) { return '<tr data-lie="' + r.id + '" class="' + (wid[r.id] ? 'warn' : '') + (r.id === D.lie ? ' sel' : '') + '"><td>' + (wid[r.id] ? '⚠ ' : '') + r.name + '</td><td class="num">' + r.n + '</td><td class="num">' + pct(r) +
        '</td><td class="num">' + fmtFt(r.avgHitFt) + '</td><td class="num">' + fmtFt(r.avgAllFt) + '</td></tr>'; }).join('') + '</table>';
    var warnHTML = warns.map(function (w) { return '<p class="warnmsg" data-lie="' + w.id + '">⚠ ' + esc(w.text) + '</p>'; }).join('');
    return '<p class="mapsum" id="mapsum"><b>' + P.n + '</b> approach' + (P.n === 1 ? '' : 'es') + ' from <b id="proxsel">' + bname + '</b>' + (D.lie === 'all' ? '' : ', <b id="proxliesel">' + LIE_NM[D.lie] + '</b>') + scope + '</p>' +
      (D.auto ? '<p class="help muted" id="proxauto">Showing your most-played yardage so the map stays clear. Tap another yardage, or All, to change it.</p>' : '') +
      '<div class="stat-grid" id="proxstats">' +
      stat('Shots', P.n) + stat('Greens hit', P.n ? P.hits + ' / ' + P.n + ' (' + Math.round(P.hitPct) + '%)' : '–') +
      stat('Avg proximity – greens hit', fmtFt(P.avgHitFt)) + stat('Avg proximity – all', fmtFt(P.avgAllFt)) + '</div>' +
      '<div id="proxwarn">' + warnHTML + '</div>' +
      '<div class="liechips" id="liechips" role="group" aria-label="Starting lie">' + chips + '</div>' +
      '<button class="yall' + (D.bucket === 'all' ? ' sel' : '') + '" data-act="proxb" data-v="all" data-n="' + D.counts.all + '" aria-pressed="' + (D.bucket === 'all') + '">All 40–200 yd · ' + D.counts.all + ' shot' + (D.counts.all === 1 ? '' : 's') + '</button>' +
      '<div class="proxwrap"><div class="proxrail" id="proxrail" role="group" aria-label="Approach yardage">' + rail + '</div>' + proxSVG(L, view.proxGroup ? grpMid(view.proxGroup) : D.bucket) + '</div>' +
      (D.outside ? '<p class="help muted" id="proxout">' + D.outside + ' regulation shot' + (D.outside === 1 ? '' : 's') + ' from outside 40–200 yd (e.g. a par-4 tee shot that missed, or under 35 yd) not shown.</p>' : '') +
      '<h3>By lie – ' + bname + '</h3>' + lieTab +
      (d1Bench(D.bucket) && !view.proxGroup ? '<p class="help muted" id="d1note">Red dashed ring = D1 women\u2019s average proximity from ' + d1Bench(D.bucket).from + '\u2013' + (d1Bench(D.bucket).from + 10) + ' yd (' + d1Bench(D.bucket).lo + '\u2013' + d1Bench(D.bucket).hi + ' ft range, ring at the middle' + (d1Bench(D.bucket).est ? '; 180 yd and beyond is our estimate from the trend, not on the chart' : '') + '). Source: Shot Scope D1 women\u2019s benchmarks. A yardage on the rail uses the 10-yd band that starts there (150 = 150\u2013160 yd).</p>' : '') +
      '<div class="legend">' + (d1Bench(D.bucket) && !view.proxGroup ? '<span><i class="ln dash"></i>Red dashed = D1 women avg for this distance</span>' : '') + '<span><i class="ln" style="background:#1e6fd9"></i><i class="dot" style="background:#1e6fd9"></i>Hit the green – first-putt distance (ft) + direction from the hole</span>' +
      '<span><i class="ln" style="background:#e0102a"></i><i class="dot" style="background:#e0102a"></i>Missed the green – in the miss direction, distance to the pin at the same scale; label = yards left + lie (› = further than the picture, drawn at the edge)</span>' +
      '<span><svg width="20" height="20" viewBox="0 0 20 20" style="flex:none"><path d="M10 1 l9 9 -9 9 -9 -9z" fill="#888" stroke="#000" stroke-width="2"/><text x="10" y="14.5" text-anchor="middle" font-size="12" font-weight="900" fill="#fff">?</text></svg>No direction entered: blue = hit (straight up at the right distance), red = miss (top-right corner)</span>' +
      '<span><i class="dot" style="background:#fff;border:2px solid #555"></i>Where the shot was hit from (the strip under the green):</span>' +
      '<span><i class="sw" style="background:#9fdf86"></i>Fairway (middle)</span><span><i class="sw" style="background:#5f9e47"></i>Rough – left or right side from the direction you entered for the shot before, otherwise the side with fewer shots</span>' +
      '<span><i class="sw" style="background:#ecd27e"></i>Bunker</span><span><i class="sw" style="background:#c9f2b8;border:2px solid #9c9"></i>Tee box (par 3s)</span><span><i class="sw" style="background:#2f6b2a"></i>Trees / hazard drop / other</span>' +
      '<span><b class="star">★</b>Holed out</span><span>White rings: distance from the hole in ft. The scale changes per distance: for a yardage the green reaches the D1 ring + 10 ft; for All, 60 yd across (90 ft). Hits farther than that sit at the edge (label ends with ›)</span></div>' +
      '<h3>Misses by direction</h3>' + dirTable(miss).replace('(not plotted)', '(drawn as ?)') +
      '<p class="help muted">One shot per hole, the same as the GIR and Approach-miss maps: the shot that reached the green in regulation (blue), or the regulation miss (red: par 3 = tee shot, par 4 = 2nd shot, par 5 = 3rd shot). ' +
      'It goes in the range it was hit from. A chip-in from 30 yd or closer right after counts as reaching the green (its proximity = the chip distance). ' +
      'Proximity: greens hit = first-putt feet; misses = yards left × 3; OB has no proximity and is left out of the averages. Yardage buttons (200 at the top, 40 at the bottom): the distance the shot was hit from, rounded to the nearest 10 yd, halves up (144 → 140, 145 → 150), so 150 = 145 to 154 yd. Greyed-out buttons have no shots; the small number is the shot count. Lie buttons filter the map and stats by where the shot was hit from (Rough includes deep rough; Other = trees, hazard and anything else). ⚠ = a lie with 3+ shots and no greens hit, or 30+ points worse than from the fairway. ' +
      'Only finished holes count.</p>';
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
      case 'menuclose': view.hmenu = null; view.newC = null; view.newAdd = false; view.newName = ''; view.newBl = null; view.crsOpen = false; render(); return;
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
      case 'pdf': case 'pdfshare': pdfAct(act); return;
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
      case 'setname': setName((document.getElementById('pname') || {}).value); return;
      case 'editname': view.editName = true; render(); var pi = document.getElementById('pname'); if (pi) pi.focus(); return;
      case 'cancelname': view.editName = false; view.needName = null; render(); return;
      case 'histplayer': view.histPlayer = v || null; render(); return;
      case 'stats': view.hmenu = null; view.screen = 'stats'; view.stSel = null; view.stPlayer = undefined; render(); window.scrollTo(0, 0); return; // v110
      case 'stplayer': view.stPlayer = v || null; view.histPlayer = view.stPlayer; view.stSel = null; render(); return;
      case 'strange': view.stN = +v || 0; view.stSel = null; render(); return;
      case 'sttog': view.stOff = view.stOff || {}; view.stOff[v] = !view.stOff[v]; render(); return;
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
      case 'map': view.map = v; view.pinSeg = null; view.heat = null; if (v === 'prox') view.proxB = null; view.mapScope = view.mapScope || 'round'; render(); return;
      case 'pinseg': view.pinSeg = v || null; render(); var pv = document.getElementById('mapview'); if (pv) pv.scrollTop = 0; return;
      case 'mapclose': view.map = null; render(); return;
      case 'pinopen': view.pinOpen = true; view.menu = null; view.dirk = null; render(); return;
      case 'pinclose': view.pinOpen = false; render(); return;
      case 'pinset': h.pin = SG.normPin(v); save(); render(); return;
      case 'pinclear': h.pin = ''; save(); render(); return;
      case 'proxb': { var mv0 = document.getElementById('mapview'), st0 = mv0 ? mv0.scrollTop : 0; view.proxB = v; render(); var mv1 = document.getElementById('mapview'); if (mv1) mv1.scrollTop = st0; return; }
      case 'proxlie': { var mvl = document.getElementById('mapview'), stl = mvl ? mvl.scrollTop : 0; view.proxLie = v; render(); var mvl2 = document.getElementById('mapview'); if (mvl2) mvl2.scrollTop = stl; return; }
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
      case 'cmpov': view.cmpOverlay = v === '1'; render(); return;
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
      case 'bag': view.hmenu = null; view.screen = 'bag'; view.bagAdd = null; view.bagEdit = null; view.bagCondOpen = false; render(); window.scrollTo(0, 0); return;
      case 'bagact': bagAct(v, b); return;
      case 'ncourse': { var cc = courseById(b.getAttribute('data-id')); view.crsOpen = false;
        if (cc && !(view.newC && view.newC.id === cc.id)) { view.newC = { id: cc.id, tee: (cc.tees[0] || {}).name || '' }; view.newAdd = false; } render(); return; }
      case 'ntee': if (view.newC) view.newC.tee = v; render(); return;
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
      case 'par': h.par = +v; save(); break;
      case 'addShot': {
        var a = SG.analyzeHole(h);
        if (a.bad != null) { toast(hintText(h, a)); var bk = a.bad; render(); focusDist(bk); return; }
        h.rows.push(newRow(h, h.rows.length - 1)); save(); view.menu = null; render();
        focusDist(h.rows.length - 1); return;
      }
      case 'finish': {
        var af = SG.analyzeHole(h);
        if (!af.complete) { toast(hintText(h, af)); return; }
        h.finished = true; save(); gdSoon(1500); view.menu = null;
        toast('Hole ' + (view.hole + 1) + ': ' + af.strokes + ' (' + toPar(af.strokes - h.par) + ')');
        break;
      }
      case 'reopen': h.finished = false; save(); break;
      case 'pen': h.rows[k].pen = !h.rows[k].pen; save(); break;
      case 'del':
        if (!confirm('Delete row ' + (k + 1) + ' (' + (h.rows[k].dist || '') + ' ' + (LOC_SHORT[h.rows[k].loc] || '') + ')?')) return;
        h.rows.splice(k, 1); view.menu = null; save(); break;
      case 'menu': view.menu = view.menu === k ? null : k; break;
      case 'insBefore': h.rows.splice(k, 0, newRow(h, k - 1)); view.menu = null; save(); render(); focusDist(k); return;
      case 'insAfter': { var nr = newRow(h, k); if (h.rows[k].holeOut) { delete h.rows[k].holeOut; nr.holeOut = true; } // the new shot is now the one that went in
        h.rows.splice(k + 1, 0, nr); view.menu = null; save(); render(); focusDist(k + 1); return; }
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

  document.addEventListener('input', function (ev) { if (ev.target && ev.target.id === 'bzslider') bzUpdate(+ev.target.value); if (ev.target && ev.target.id === 'course') view.newName = ev.target.value; });
  document.addEventListener('change', function (ev) { if (ev.target && ev.target.id === 'newbl') view.newBl = ev.target.value; });
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
  window.__golf = { card: function () { return view.card; }, statsData: function () { return statsData(); }, statsRound: function (id, bl) { return statsRound(rounds.filter(function (r) { return r.id === id; })[0], bl || ''); }, scorecardHTML: function () { var r = round(); return r ? scorecardHTML(r, SG.summarize(r, blOf(r))) : ''; }, voiceState: function () { return { dict: !!(view.voice && view.voice.stage === 'dict'), timer: !!dictTimer }; }, d1Bench: d1Bench, proxSVG: proxSVG, pinSVG: function () { return pinReportSVG(SG.pinSegments(pinDataRound())); }, csvFor: csvFor, rounds: function () { return rounds; } };
})();
