// v93 Wedges: a wedge chart – for each yardage 40–110 (10-yard steps) the club, ball position, shaft lean,
// club position (P1–P3) and wrist hinge. Pure data helpers; the screen lives in app.js. Stored in golfsg.wedges.v1.
(function (root) {
  var YARDS = []; for (var y = 40; y <= 110; y += 10) YARDS.push(y); // 10-yard steps: 40, 50 … 110
  // The first v93 draft used 5-yard steps. Entries at 45, 55 … 105 are kept in the data (hidden, and in backups) so nothing is lost.
  var KEEP = []; for (var y2 = 40; y2 <= 110; y2 += 5) KEEP.push(y2);
  var BALL = [['front', 'Front'], ['middle', 'Middle'], ['back', 'Back']];
  var LEAN = [['0', '0°'], ['1-2', '1–2°'], ['3-4', '3–4°']]; // forward shaft lean
  var POS = [['p1', 'P1'], ['p2', 'P2'], ['p3', 'P3']]; // club position = swing position (backswing length)
  var HINGE = [['45', '45°'], ['90', '90°'], ['full', 'Full']]; // wrist hinge
  var STD_CLUBS = ['PW', '48', '50', '52', '54', '56', '58', '60'];
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
  function count(w) { w = norm(w); return Object.keys(w.rows).length + Object.keys(w.low).length; } // every stored entry, both flights, incl. hidden
  function txt(v) { return v != null && String(v).trim() ? String(v).slice(0, 80) : ''; }
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
  var MIN = 40, MAX = 110;
  function inRange(d) { d = Number(d); return d !== 0 && isFinite(d) && d >= MIN && d <= MAX; } // 40–110 yd, both ends included
  function ladder(w) { // both flights, by yardage, High before Low
    w = norm(w); var L = [];
    YARDS.forEach(function (y) { FLIGHTS.forEach(function (f) { var r = rowsOf(w, f[0])[y]; if (r && r.club) L.push({ y: y, f: f[0], row: r }); }); });
    return L;
  }
  function nearest(L, d, club) { // same yardage in both flights → the first (High) // closest yardage (a tie goes to the longer one); optionally only rows with that club
    var best = null; L.forEach(function (e) { if (club && e.row.club !== club) return; if (!best || Math.abs(e.y - d) < Math.abs(best.y - d) || (Math.abs(e.y - d) === Math.abs(best.y - d) && e.y > best.y)) best = e; });
    return best;
  }
  function clubLabel(c) { return /^\d{2}$/.test(String(c)) ? c + '°' : String(c || ''); }
  function ladderLabel(e) { var r = e.row; return [e.y + ' yd', e.f ? name(FLIGHTS, e.f) : '', clubLabel(r.club), name(BALL, r.ball), name(POS, r.pos)].filter(Boolean).join(' · '); }
  var api = { FLIGHTS: FLIGHTS, rowsOf: rowsOf, count: count, inRange: inRange, ladder: ladder, nearest: nearest, clubLabel: clubLabel, ladderLabel: ladderLabel, MIN: MIN, MAX: MAX, YARDS: YARDS, KEEP: KEEP, hidden: hidden, BALL: BALL, LEAN: LEAN, POS: POS, HINGE: HINGE, STD_CLUBS: STD_CLUBS, FIELDS: FIELDS, name: name, blank: blank, cleanRow: cleanRow, norm: norm, filled: filled, summary: summary, mergeWedges: mergeWedges };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.WEDGES = api;
})(this);
