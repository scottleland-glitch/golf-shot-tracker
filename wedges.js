// v93 Wedges: a wedge chart – for each yardage 40–110 (10-yard steps) the club, ball position, shaft lean,
// club position (P1–P3) and wrist hinge. Pure data helpers; the screen lives in app.js. Stored in golfsg.wedges.v1.
// v227: also a clock-system matrix (swing length × club → carry), stored as clock + mode on the same object.
// v228: also a ladder-system matrix (P1/P2/P3/Full × club → carry + hinge, ball position, shaft lean), stored as ladder + mode.
(function (root) {
  var YARDS = []; for (var y = 40; y <= 110; y += 10) YARDS.push(y); // 10-yard steps: 40, 50 … 110
  // The first v93 draft used 5-yard steps. Entries at 45, 55 … 105 are kept in the data (hidden, and in backups) so nothing is lost.
  var KEEP = []; for (var y2 = 40; y2 <= 110; y2 += 5) KEEP.push(y2);
  var BALL = [['front', 'Front'], ['middle', 'Middle'], ['back', 'Back']];
  var LEAN = [['0', '0°'], ['1-2', '1–2°'], ['3-4', '3–4°']]; // forward shaft lean
  var POS = [['p1', 'P1'], ['p2', 'P2'], ['p3', 'P3']]; // club position = swing position (backswing length)
  var HINGE = [['45', '45°'], ['90', '90°'], ['full', 'Full']]; // wrist hinge
  var STD_CLUBS = ['PW', '48', '50', '52', '54', '56', '58', '60'];
  var CLOCK_CLUBS = ['PW', '50', '54', '58']; // default clock-matrix columns when the bag has no wedges
  var CLOCK_ROWS = ['7:30', '9:00', '10:30', 'Full'];
  var CLOCK_POS = ['7:00', '7:30', '8:00', '8:30', '9:00', '9:30', '10:00', '10:30', '11:00', 'Full'];
  var LADDER_ROWS = [['P1', '7:30'], ['P2', '9:00'], ['P3', '10:30'], ['Full', 'Full']];
  var LADDER_HINGE = [['45', '45°'], ['90', '90°']];
  var LADDER_BALL = [['back', 'Back'], ['middle', 'Mid'], ['front', 'Front']]; // Mid, not Middle; Back / Mid / Front
  var FIELDS = ['club', 'ball', 'ballNote', 'lean', 'leanNote', 'pos', 'posNote', 'hinge'];
  // v93 first draft used other options – map what fits, keep the rest as a note, never crash
  var OLD_BALL = { back: 'back', backc: 'back', center: 'middle', fwdc: 'front', fwd: 'front' };
  var OLD_LEAN = { neutral: '0', slight: '1-2', strong: '3-4' }, OLD_LEAN_TXT = { back: 'leaning back' };
  var OLD_HANDS = { '730': '7:30', '8': '8:00', '9': '9:00', '10': '10:00', '1030': '10:30', full: 'full swing' };
  function name(list, k) { for (var i = 0; i < list.length; i++) if (list[i][0] === k) return list[i][1]; return ''; }
  // v94 two setups per yardage: High flight (stored in rows – v93 charts and old backups land here) and Low flight (stored in low).
  var FLIGHTS = [['high', 'High'], ['low', 'Low']];
  function blank() { return { v: 3, rows: {}, low: {} }; }
  function rowsOf(w, f) { if (f === 'low') { if (!w.low || typeof w.low !== 'object') w.low = {}; return w.low; } return w.rows; }
  function txt(v) { return v != null && String(v).trim() ? String(v).slice(0, 80) : ''; }
  function clubName(c) { return c != null && String(c).trim() ? String(c).trim().slice(0, 14) : ''; }
  function cleanYd(v) { if (v === '' || v == null) return null; v = Number(v); return isFinite(v) && v > 0 && v <= 400 ? Math.round(v) : null; }
  function cleanClock(c) {
    if (!c || typeof c !== 'object') return null;
    var clubs = [];
    (Array.isArray(c.clubs) ? c.clubs : []).forEach(function (x) { var n = clubName(x); if (n && clubs.indexOf(n) < 0) clubs.push(n); });
    if (clubs.length > 10) clubs = clubs.slice(0, 10);
    var rows = [];
    (Array.isArray(c.rows) ? c.rows : []).forEach(function (r) {
      if (!r || typeof r !== 'object') return;
      var label = txt(r.label).slice(0, 20); if (!label) return;
      var yd = {}, src = r.yd && typeof r.yd === 'object' ? r.yd : {};
      var keys = clubs.length ? clubs : Object.keys(src);
      keys.forEach(function (k) { var n = cleanYd(src[k]); if (n != null) yd[k] = n; });
      rows.push({ label: label, yd: yd });
    });
    if (rows.length > 16) rows = rows.slice(0, 16);
    if (!clubs.length && !rows.length) return null;
    return { clubs: clubs, rows: rows };
  }
  function defaultClock(bagClubs) {
    var clubs = [];
    (Array.isArray(bagClubs) ? bagClubs : []).forEach(function (x) { var n = clubName(x); if (n && clubs.indexOf(n) < 0) clubs.push(n); });
    if (!clubs.length) clubs = CLOCK_CLUBS.slice();
    if (clubs.length > 10) clubs = clubs.slice(0, 10);
    return { clubs: clubs, rows: CLOCK_ROWS.map(function (l) { return { label: l, yd: {} }; }) };
  }
  function ensureClock(w, bagClubs) {
    w = norm(w);
    var d = defaultClock(bagClubs);
    if (!w.clock) { w.clock = d; return w; }
    if (!w.clock.clubs.length) w.clock.clubs = d.clubs;
    if (!w.clock.rows.length) w.clock.rows = d.rows;
    return w;
  }
  function clockCells(w) {
    var c = (w && w.clock) || (norm(w).clock), n = 0;
    if (!c) return 0;
    (c.rows || []).forEach(function (r) { Object.keys(r.yd || {}).forEach(function (k) { if (r.yd[k] != null) n++; }); });
    return n;
  }
  function clockWeight(w) {
    var n = clockCells(w); if (n) return n;
    var c = w && w.clock;
    if (c && ((c.clubs && c.clubs.length) || (c.rows && c.rows.length))) return 1;
    return w && w.mode === 'clock' ? 1 : 0;
  }
  function hasClock(w) { return clockWeight(norm(w)) > 0; }
  function ladderClock(label) { for (var i = 0; i < LADDER_ROWS.length; i++) if (LADDER_ROWS[i][0] === label) return LADDER_ROWS[i][1]; return ''; }
  function cleanLadCell(c) {
    if (c != null && typeof c !== 'object') { var y0 = cleanYd(c); return y0 != null ? { y: y0 } : null; }
    if (!c || typeof c !== 'object') return null;
    var o = {}, y = cleanYd(c.y); if (y != null) o.y = y;
    if (name(LADDER_HINGE, c.hinge)) o.hinge = c.hinge;
    if (name(BALL, c.ball)) o.ball = c.ball;
    if (name(LEAN, c.lean)) o.lean = c.lean;
    return Object.keys(o).length ? o : null;
  }
  function cleanLadder(L) {
    if (!L || typeof L !== 'object') return null;
    var clubs = [];
    (Array.isArray(L.clubs) ? L.clubs : []).forEach(function (x) { var n = clubName(x); if (n && clubs.indexOf(n) < 0) clubs.push(n); });
    if (clubs.length > 10) clubs = clubs.slice(0, 10);
    var rows = [];
    (Array.isArray(L.rows) ? L.rows : []).forEach(function (r) {
      if (!r || typeof r !== 'object') return;
      var label = txt(r.label).slice(0, 20); if (!label) return;
      var cells = {}, src = r.cells && typeof r.cells === 'object' ? r.cells : {};
      var keys = clubs.length ? clubs : Object.keys(src);
      keys.forEach(function (k) { var cell = cleanLadCell(src[k]); if (cell) cells[k] = cell; });
      rows.push({ label: label, cells: cells });
    });
    if (rows.length > 16) rows = rows.slice(0, 16);
    if (!clubs.length && !rows.length) return null;
    return { clubs: clubs, rows: rows };
  }
  function defaultLadder(bagClubs, clock) {
    var clubs = [];
    (Array.isArray(bagClubs) ? bagClubs : []).forEach(function (x) { var n = clubName(x); if (n && clubs.indexOf(n) < 0) clubs.push(n); });
    if (!clubs.length && clock && Array.isArray(clock.clubs)) clock.clubs.forEach(function (x) { var n = clubName(x); if (n && clubs.indexOf(n) < 0) clubs.push(n); });
    if (!clubs.length) clubs = CLOCK_CLUBS.slice();
    if (clubs.length > 10) clubs = clubs.slice(0, 10);
    return { clubs: clubs, rows: LADDER_ROWS.map(function (p) { return { label: p[0], cells: {} }; }) };
  }
  function ensureLadder(w, bagClubs) {
    w = norm(w);
    var d = defaultLadder(bagClubs, w.clock);
    if (!w.ladder) { w.ladder = d; return w; }
    if (!w.ladder.clubs.length) w.ladder.clubs = d.clubs;
    if (!w.ladder.rows.length) w.ladder.rows = d.rows;
    return w;
  }
  function ladCells(w) {
    var L = (w && w.ladder) || (norm(w).ladder), n = 0;
    if (!L) return 0;
    (L.rows || []).forEach(function (r) { Object.keys(r.cells || {}).forEach(function (k) { if (r.cells[k]) n++; }); });
    return n;
  }
  function ladderWeight(w) {
    var n = ladCells(w); if (n) return n;
    var L = w && w.ladder;
    if (L && ((L.clubs && L.clubs.length) || (L.rows && L.rows.length))) return 1;
    return w && w.mode === 'ladder' ? 1 : 0;
  }
  function hasLadder(w) { return ladderWeight(norm(w)) > 0; }
  function count(w) { w = norm(w); return Object.keys(w.rows).length + Object.keys(w.low).length + clockWeight(w) + ladderWeight(w); } // every stored entry, both flights, incl. hidden + clock + ladder
  function cleanRow(r) {
    var o = {}; if (!r || typeof r !== 'object') return o;
    if (r.club != null && String(r.club).trim()) o.club = String(r.club).trim().slice(0, 20);
    var ball = name(BALL, r.ball) ? r.ball : OLD_BALL[r.ball]; if (ball) o.ball = ball;
    if (txt(r.ballNote)) o.ballNote = txt(r.ballNote);
    var lean = name(LEAN, r.lean) ? r.lean : OLD_LEAN[r.lean]; if (lean) o.lean = lean;
    var ln = txt(r.leanNote) || OLD_LEAN_TXT[r.lean] || ''; if (ln) o.leanNote = ln;
    if (name(POS, r.pos)) o.pos = r.pos;
    var pn = txt(r.posNote) || [OLD_HANDS[r.hands] ? 'was ' + OLD_HANDS[r.hands] : '', txt(r.handsNote)].filter(Boolean).join(', '); if (pn) o.posNote = pn.slice(0, 80);
    if (name(HINGE, r.hinge)) o.hinge = r.hinge;
    return o;
  }
  function norm(w) {
    var o = blank(); if (!w || typeof w !== 'object') return o;
    if (w.updated) o.updated = String(w.updated);
    [['rows', w.rows], ['low', w.low]].forEach(function (p) { var rows = p[1] && typeof p[1] === 'object' ? p[1] : {};
      KEEP.forEach(function (y) { var r = cleanRow(rows[y]); if (Object.keys(r).length) o[p[0]][y] = r; }); });
    if (w.mode === 'clock' || w.mode === 'ladder') o.mode = w.mode;
    var c = cleanClock(w.clock); if (c) o.clock = c;
    var L = cleanLadder(w.ladder); if (L) o.ladder = L;
    return o;
  }
  function filled(w, f) { var r = rowsOf(norm(w), f); return YARDS.filter(function (y) { return r[y]; }).length; } // shown yardages only
  function hidden(w) { var r = norm(w).rows; return KEEP.filter(function (y) { return r[y] && YARDS.indexOf(y) < 0; }); }
  function summary(r, short) { // short (v94 simple view): club · ball · position only
    r = cleanRow(r); var p = [];
    if (r.club) p.push(/^\d{2}$/.test(r.club) ? r.club + '°' : r.club);
    if (r.ball) p.push(name(BALL, r.ball).toLowerCase()); else if (r.ballNote) p.push('ball: ' + r.ballNote);
    if (short) {} else if (r.lean) p.push(name(LEAN, r.lean)); else if (r.leanNote) p.push('lean: ' + r.leanNote);
    if (r.pos) p.push(name(POS, r.pos)); else if (r.posNote) p.push('position: ' + r.posNote);
    if (r.hinge && !short) p.push('hinge ' + (r.hinge === 'full' ? 'full' : name(HINGE, r.hinge)));
    return p.join(' · ');
  }
  // Same rule as My Bag: take the backup's chart when the phone's is empty, or the backup is newer.
  function mergeWedges(have, incoming) {
    var i = norm(incoming), h = norm(have);
    if (!count(i)) return { wedges: h, changed: false };
    if (!count(h) || (JSON.stringify(h) !== JSON.stringify(i) && String(i.updated || '') > String(h.updated || ''))) return { wedges: i, changed: true };
    return { wedges: h, changed: false };
  }
  // v94 Wedge ladder for the scoring page: the shown yardages that have a club set.
  // v95: the yardages are CARRY distances, so the ladder is offered for any shot 100 yd or less (and more than 0).
  var MIN = 0, MAX = 100;
  function inRange(d) { if (d === '' || d == null) return false; d = Number(d); return isFinite(d) && d > MIN && d <= MAX; }
  function ladder(w) { // both flights, by yardage, High before Low
    w = norm(w); var L = [];
    YARDS.forEach(function (y) { FLIGHTS.forEach(function (f) { var r = rowsOf(w, f[0])[y]; if (r && r.club) L.push({ y: y, f: f[0], row: r }); }); });
    return L;
  }
  function fullLadder(w) { // v95: every shown yardage in both flights (High 40…110, then Low 40…110); set = has a club
    w = norm(w); var L = [];
    FLIGHTS.forEach(function (f) { YARDS.forEach(function (y) { var r = rowsOf(w, f[0])[y] || {}; L.push({ y: y, f: f[0], row: r, set: !!r.club }); }); });
    return L;
  }
  // v95b: only three carries around the pin distance: rounded to the nearest 10 (halves up: 75 → 80), then −10 / +10,
  // slid to stay inside 40–110 (15 or 40 → 40/50/60; 105 → 90/100/110).
  function carries(d) { d = Number(d); if (!isFinite(d)) return []; var c = Math.round(d / 10) * 10; c = Math.max(YARDS[1], Math.min(YARDS[YARDS.length - 2], c)); return [c - 10, c, c + 10]; }
  function nearLadder(w, d) { var C = carries(d); return fullLadder(w).filter(function (e) { return C.indexOf(e.y) >= 0; }); }
  function nearest(L, d, club) { // same yardage in both flights → the first (High) // closest yardage (a tie goes to the longer one); optionally only rows with that club
    var best = null; L.forEach(function (e) { if (club && e.row.club !== club) return; if (!best || Math.abs(e.y - d) < Math.abs(best.y - d) || (Math.abs(e.y - d) === Math.abs(best.y - d) && e.y > best.y)) best = e; });
    return best;
  }
  function clubLabel(c) { return /^\d{2}$/.test(String(c)) ? c + '°' : String(c || ''); }
  function ladderLabel(e) { var r = e.row; if (!r.club) return e.y + ' yd · ' + (e.f ? name(FLIGHTS, e.f) + ' · ' : '') + 'not set'; return [e.y + ' yd', e.f ? name(FLIGHTS, e.f) : '', clubLabel(r.club), name(BALL, r.ball), name(POS, r.pos)].filter(Boolean).join(' · '); }
  function clockEntries(w) {
    w = norm(w); var L = [], c = w.clock; if (!c) return L;
    (c.rows || []).forEach(function (r) {
      (c.clubs.length ? c.clubs : Object.keys(r.yd || {})).forEach(function (club) {
        var y = r.yd && r.yd[club]; if (y != null) L.push({ club: club, label: r.label, y: y, set: true });
      });
    });
    return L;
  }
  function nearClock(w, d) {
    d = Number(d); if (!isFinite(d)) return [];
    var L = clockEntries(w).slice();
    var near = L.filter(function (e) { return Math.abs(e.y - d) <= 12; });
    var src = near.length >= 3 ? near : L;
    src.sort(function (a, b) { var da = Math.abs(a.y - d) - Math.abs(b.y - d); return da || a.y - b.y; });
    return src.slice(0, 8);
  }
  function clockLabel(e) { return [clubLabel(e.club), e.label, e.y + ' yd'].filter(Boolean).join(' · '); }
  function clockVal(e) { return 'wk:' + encodeURIComponent(e.club) + '|' + encodeURIComponent(e.label); }
  function parseClockVal(v) {
    var m = /^wk:(.*)$/.exec(String(v || '')); if (!m) return null;
    var p = m[1].split('|'); return { club: decodeURIComponent(p[0] || ''), label: decodeURIComponent(p[1] || '') };
  }
  function ladSetup(cell) {
    var c = cell && (cell.hinge || cell.ball || cell.lean || cell.y != null) ? cell : (cell && cell.cell) || cell;
    if (!c) return '';
    var p = [];
    if (c.hinge) p.push(name(LADDER_HINGE, c.hinge) || name(HINGE, c.hinge));
    if (c.ball) p.push(name(LADDER_BALL, c.ball) || name(BALL, c.ball));
    if (c.lean) p.push(name(LEAN, c.lean));
    return p.join(' · ');
  }
  function ladEntries(w) {
    w = norm(w); var L = [], g = w.ladder; if (!g) return L;
    (g.rows || []).forEach(function (r) {
      (g.clubs.length ? g.clubs : Object.keys(r.cells || {})).forEach(function (club) {
        var cell = r.cells && r.cells[club]; if (cell && cell.y != null) L.push({ club: club, label: r.label, y: cell.y, hinge: cell.hinge, ball: cell.ball, lean: cell.lean, cell: cell, set: true });
      });
    });
    return L;
  }
  function nearLad(w, d) {
    d = Number(d); if (!isFinite(d)) return [];
    var L = ladEntries(w).slice();
    var near = L.filter(function (e) { return Math.abs(e.y - d) <= 12; });
    var src = near.length >= 3 ? near : L;
    src.sort(function (a, b) { var da = Math.abs(a.y - d) - Math.abs(b.y - d); return da || a.y - b.y; });
    return src.slice(0, 8);
  }
  function ladLabel(e) { return [clubLabel(e.club), e.label, e.y + ' yd'].filter(Boolean).join(' · '); }
  function ladVal(e) { return 'wl:' + encodeURIComponent(e.club) + '|' + encodeURIComponent(e.label); }
  function parseLadVal(v) {
    var m = /^wl:(.*)$/.exec(String(v || '')); if (!m) return null;
    var p = m[1].split('|'); return { club: decodeURIComponent(p[0] || ''), label: decodeURIComponent(p[1] || '') };
  }
  var api = { carries: carries, nearLadder: nearLadder, fullLadder: fullLadder, FLIGHTS: FLIGHTS, rowsOf: rowsOf, count: count, inRange: inRange, ladder: ladder, nearest: nearest, clubLabel: clubLabel, ladderLabel: ladderLabel, MIN: MIN, MAX: MAX, YARDS: YARDS, KEEP: KEEP, hidden: hidden, BALL: BALL, LEAN: LEAN, POS: POS, HINGE: HINGE, STD_CLUBS: STD_CLUBS, FIELDS: FIELDS, name: name, blank: blank, cleanRow: cleanRow, norm: norm, filled: filled, summary: summary, mergeWedges: mergeWedges,
    CLOCK_CLUBS: CLOCK_CLUBS, CLOCK_ROWS: CLOCK_ROWS, CLOCK_POS: CLOCK_POS, cleanClock: cleanClock, defaultClock: defaultClock, ensureClock: ensureClock, clockCells: clockCells, hasClock: hasClock, clockEntries: clockEntries, nearClock: nearClock, clockLabel: clockLabel, clockVal: clockVal, parseClockVal: parseClockVal,
    LADDER_ROWS: LADDER_ROWS, LADDER_HINGE: LADDER_HINGE, LADDER_BALL: LADDER_BALL, ladderClock: ladderClock, cleanLadder: cleanLadder, defaultLadder: defaultLadder, ensureLadder: ensureLadder, ladCells: ladCells, hasLadder: hasLadder, ladSetup: ladSetup, ladEntries: ladEntries, nearLad: nearLad, ladLabel: ladLabel, ladVal: ladVal, parseLadVal: parseLadVal };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.WEDGES = api;
})(this);
