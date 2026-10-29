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
  function blank() { return { v: 2, rows: {} }; }
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
    var rows = w.rows && typeof w.rows === 'object' ? w.rows : {};
    KEEP.forEach(function (y) { var r = cleanRow(rows[y]); if (Object.keys(r).length) o.rows[y] = r; });
    return o;
  }
  function filled(w) { var r = norm(w).rows; return YARDS.filter(function (y) { return r[y]; }).length; } // shown yardages only
  function hidden(w) { var r = norm(w).rows; return KEEP.filter(function (y) { return r[y] && YARDS.indexOf(y) < 0; }); }
  function summary(r) {
    r = cleanRow(r); var p = [];
    if (r.club) p.push(/^\d{2}$/.test(r.club) ? r.club + '°' : r.club);
    if (r.ball) p.push(name(BALL, r.ball).toLowerCase()); else if (r.ballNote) p.push('ball: ' + r.ballNote);
    if (r.lean) p.push(name(LEAN, r.lean)); else if (r.leanNote) p.push('lean: ' + r.leanNote);
    if (r.pos) p.push(name(POS, r.pos)); else if (r.posNote) p.push('position: ' + r.posNote);
    if (r.hinge) p.push('hinge ' + (r.hinge === 'full' ? 'full' : name(HINGE, r.hinge)));
    return p.join(' · ');
  }
  // Same rule as My Bag: take the backup's chart when the phone's is empty, or the backup is newer.
  function mergeWedges(have, incoming) {
    var i = norm(incoming), h = norm(have);
    if (!Object.keys(i.rows).length) return { wedges: h, changed: false };
    if (!Object.keys(h.rows).length || (JSON.stringify(h) !== JSON.stringify(i) && String(i.updated || '') > String(h.updated || ''))) return { wedges: i, changed: true };
    return { wedges: h, changed: false };
  }
  var api = { YARDS: YARDS, KEEP: KEEP, hidden: hidden, BALL: BALL, LEAN: LEAN, POS: POS, HINGE: HINGE, STD_CLUBS: STD_CLUBS, FIELDS: FIELDS, name: name, blank: blank, cleanRow: cleanRow, norm: norm, filled: filled, summary: summary, mergeWedges: mergeWedges };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.WEDGES = api;
})(this);
