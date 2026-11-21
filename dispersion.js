// v245 (Scott) Sim dispersion: pure helpers (no DOM) so they can be unit tested. DISP.*
// Simulator / launch-monitor shots (GCQuad or any other) -> a shot pattern per 10-yard target -> that pattern played to the
// 9 pin positions of a template green -> strokes gained for each pin (and the best place to aim).
//
// A sim session: { id, date, player, source: 'csv' | 'manual', name, shots: [{ club, target, carry, total, offline }] }
//   target  = yards the player was hitting at (set per club when importing; a shot belongs to the 10-yard bucket of its target)
//   carry / total = yards; offline = yards, + right / − left of the target line
// Pattern point = where the ball LANDED relative to the target: dx = offline (+ right), dy = carry − target (+ long).
// Carry is the default (Scott: "carry is all that matters" – the release depends on the green, judged on the course).
//
// Green frame: yards, origin = green centre, x + right, y + long (away from the player).
(function (root) {
  'use strict';
  // ---------- the template green (26 yd wide × 32 yd deep ≈ 5,900 sq ft) ----------
  var GREEN = { rx: 13, ry: 16, fringe: 1.5,
    bunkers: [{ x: 12.5, y: -13.5, rx: 5.5, ry: 3.6, rot: -35 }, { x: -16.5, y: 2, rx: 3.6, ry: 6.5, rot: 8 }, { x: 13, y: 16, rx: 5, ry: 3, rot: 30 }],
    lane: 15 }; // fairway in front of the green: |x| <= lane
  // 3 × 3 pins (same keys as the round's pin location, SG.PIN_GRID): back row is +y
  var PIN_ROWS = [['backleft', 'backcenter', 'backright'], ['midleft', 'center', 'midright'], ['frontleft', 'frontcenter', 'frontright']];
  var PIN_NAME = { backleft: 'Back left', backcenter: 'Back center', backright: 'Back right', midleft: 'Middle left', center: 'Center',
    midright: 'Middle right', frontleft: 'Front left', frontcenter: 'Front center', frontright: 'Front right' };
  var PIN_X = [-7, 0, 7], PIN_Y = [9.5, 0, -9.5];
  var PINS = []; PIN_ROWS.forEach(function (row, i) { row.forEach(function (k, j) { PINS.push({ k: k, name: PIN_NAME[k], x: PIN_X[j], y: PIN_Y[i] }); }); });
  function pinOf(k) { return PINS.filter(function (p) { return p.k === k; })[0] || PINS[4]; }
  var BUCKET_MIN = 50, BUCKET_MAX = 250, MIN_SHOTS = 8, SHOW = 50, SG_N = 400, CONF = 0.8;

  function num(v) { if (v == null) return null; var s = String(v).trim().replace(/,/g, ''); if (s === '') return null; var n = parseFloat(s.replace(/[^0-9.+\-eE]/g, '')); return isFinite(n) ? n : null; }
  // "5.2 L", "L 5.2", "5.2L", "-5.2", "R3" -> yards (+ right). flip = the export uses + for left.
  function parseOffline(v, flip) {
    if (v == null) return null; var s = String(v).trim(); if (!s) return null;
    var n = num(s); if (n == null) return null;
    if (/[lL]/.test(s.replace(/[eE]/g, ''))) n = -Math.abs(n); else if (/[rR]/.test(s)) n = Math.abs(n); else if (flip) n = -n;
    return n;
  }
  function bucket(yd) { yd = Number(yd); return isFinite(yd) && yd > 0 ? Math.round(yd / 10) * 10 : null; }

  // ---------- CSV ----------
  function parseCSV(text) {
    text = String(text || '').replace(/^﻿/, '');
    var first = text.split(/\r?\n/).filter(function (l) { return l.trim(); })[0] || '';
    var sep = (first.match(/\t/g) || []).length > (first.match(/,/g) || []).length ? '\t' : (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : ',';
    var rows = [], row = [], cur = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"') q = true;
      else if (c === sep) { row.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some(function (x) { return String(x).trim(); })) rows.push(row); row = []; }
      else cur += c;
    }
    row.push(cur); if (row.some(function (x) { return String(x).trim(); })) rows.push(row);
    // header = the first row that names a carry column (some exports have a title line or two first)
    var hi = 0; for (var k = 0; k < Math.min(rows.length, 6); k++) if (rows[k].some(function (h) { return /carry/i.test(h); })) { hi = k; break; }
    var headers = (rows[hi] || []).map(function (h) { return String(h).trim(); });
    return { headers: headers, rows: rows.slice(hi + 1).map(function (r) { return r.map(function (x) { return String(x).trim(); }); }) };
  }
  // best guess at which column is which; -1 = not there
  function guessMap(headers) {
    function find(res, not) { for (var r = 0; r < res.length; r++) for (var i = 0; i < headers.length; i++) { var h = headers[i]; if (res[r].test(h) && !(not && not.test(h))) return i; } return -1; }
    return {
      club: find([/^club$/i, /club\s*(name|type)?/i]),
      carry: find([/^carry(\s*dist(ance)?)?\s*(\(.*\))?$/i, /carry/i], /(side|offline|lateral|dev|height|time|angle)/i),
      total: find([/^total(\s*dist(ance)?)?\s*(\(.*\))?$/i, /total\s*dist/i, /^total/i], /(side|offline|lateral|dev|spin)/i),
      offline: find([/offline/i, /carry\s*(side|lateral|dev)/i, /lateral/i, /side\s*(carry)?/i, /deviation|dev\b/i], /(spin|angle|total)/i),
      target: find([/target/i]),
      meters: headers.some(function (h) { return /\(m\)|\bmeters?\b|\[m\]/i.test(h); }) && !headers.some(function (h) { return /yd|yard/i.test(h); })
    };
  }
  // rows -> shots. map = guessMap result (possibly edited). Rows without a carry are skipped (averages / blank lines).
  function toShots(rows, map, opts) {
    opts = opts || {}; var M = map.meters || opts.meters ? 1.09361 : 1, out = [];
    (rows || []).forEach(function (r) {
      var carry = map.carry >= 0 ? num(r[map.carry]) : null; if (carry == null || carry <= 0 || carry > 400) return;
      var club = map.club >= 0 ? String(r[map.club] || '').trim() : '';
      if (/^(avg|average|mean|std|total|consistency)/i.test(club) || /^(avg|average|mean)/i.test(String(r[0] || ''))) return;
      var total = map.total >= 0 ? num(r[map.total]) : null, off = map.offline >= 0 ? parseOffline(r[map.offline], opts.flip) : null, tg = map.target >= 0 ? num(r[map.target]) : null;
      out.push({ club: club || 'Club', carry: round1(carry * M), total: total != null && total > 0 ? round1(total * M) : null, offline: off != null ? round1(off * M) : 0, target: tg != null && tg > 0 ? round1(tg * M) : null });
    });
    return out;
  }
  function round1(x) { return Math.round(x * 10) / 10; }
  function median(a) { if (!a.length) return null; var s = a.slice().sort(function (x, y) { return x - y; }), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
  // per club: how many shots, median carry, and the 10-yard target it most likely was (editable on the import screen)
  function clubGroups(shots) {
    var o = {}, order = []; shots.forEach(function (s) { if (!o[s.club]) { o[s.club] = []; order.push(s.club); } o[s.club].push(s); });
    return order.map(function (c) { var L = o[c], mc = median(L.map(function (s) { return s.carry; })), tg = median(L.filter(function (s) { return s.target; }).map(function (s) { return s.target; }));
      return { club: c, n: L.length, carry: mc, target: bucket(tg || mc) }; });
  }
  function validSessions(list) {
    return (Array.isArray(list) ? list : []).filter(function (s) { return s && typeof s.id === 'string' && Array.isArray(s.shots); }).map(function (s) {
      s.shots = s.shots.filter(function (x) { return x && isFinite(+x.carry) && +x.carry > 0 && isFinite(+x.target) && +x.target > 0; }); return s; });
  }
  function mergeSessions(cur, add) { var ids = {}, out = (cur || []).slice(), n = 0; out.forEach(function (s) { ids[s.id] = 1; }); validSessions(add).forEach(function (s) { if (!ids[s.id]) { out.push(s); ids[s.id] = 1; n++; } }); return { sessions: out, added: n }; }

  // ---------- patterns ----------
  // sessions (already filtered to the player) -> [{ yd, n, clubs }] for every bucket with shots
  function buckets(sessions) {
    var o = {}; sessions.forEach(function (S) { S.shots.forEach(function (s) { var b = bucket(s.target); if (!b || b < BUCKET_MIN || b > BUCKET_MAX) return; (o[b] = o[b] || { yd: b, n: 0, clubs: {} }).n++; o[b].clubs[s.club] = 1; }); });
    return Object.keys(o).map(function (k) { var b = o[k]; b.clubs = Object.keys(b.clubs); return b; }).sort(function (a, b) { return a.yd - b.yd; });
  }
  // the landing points for one bucket, newest session first: [{ dx, dy, club }]. mode 'carry' (default) or 'total' (falls back to carry when a shot has none)
  function points(sessions, yd, mode) {
    var L = []; sessions.slice().sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); }).forEach(function (S) {
      S.shots.forEach(function (s) { if (bucket(s.target) !== yd) return; var d = mode === 'total' && s.total ? s.total : s.carry; L.push({ dx: +s.offline || 0, dy: d - s.target, club: s.club }); }); });
    return L;
  }
  function stats(P) {
    var n = P.length; if (!n) return null; var mx = 0, my = 0; P.forEach(function (p) { mx += p.dx; my += p.dy; }); mx /= n; my /= n;
    var sxx = 0, syy = 0, sxy = 0; P.forEach(function (p) { var a = p.dx - mx, b = p.dy - my; sxx += a * a; syy += b * b; sxy += a * b; }); var d = Math.max(1, n - 1);
    return { n: n, mx: mx, my: my, sxx: sxx / d, syy: syy / d, sxy: sxy / d, sx: Math.sqrt(sxx / d), sy: Math.sqrt(syy / d) };
  }
  // ellipse holding `conf` of a bivariate normal with the points' mean and covariance: { cx, cy, rx, ry, rot (degrees, x axis toward y) }
  function ellipse(P, conf) {
    var S = stats(P); if (!S || S.n < 3) return null; var k = Math.sqrt(-2 * Math.log(1 - (conf || CONF)));
    var a = S.sxx, b = S.sxy, c = S.syy, tr = (a + c) / 2, det = Math.sqrt(Math.max(0, (a - c) * (a - c) / 4 + b * b)), l1 = tr + det, l2 = Math.max(0, tr - det);
    var rot = Math.abs(b) < 1e-9 ? (a >= c ? 0 : 90) : Math.atan2(l1 - a, b) * 180 / Math.PI;
    return { cx: S.mx, cy: S.my, rx: k * Math.sqrt(l1), ry: k * Math.sqrt(l2), rot: rot, conf: conf || CONF };
  }
  function rng(seed) { var t = seed >>> 0; return function () { t += 0x6D2B79F5; var r = Math.imul(t ^ (t >>> 15), 1 | t); r ^= r + Math.imul(r ^ (r >>> 7), 61 | r); return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; }
  function gauss(R) { var u = 0, v = 0; while (u === 0) u = R(); v = R(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  // n points with the same shape as P: the real shots first (up to n), then a smoothed bootstrap of them (each a real shot nudged by a
  // little noise, shrunk back so the spread stays the real spread). factor > 1 widens the pattern around its centre (course conditions).
  function pattern(P, n, seed, factor) {
    var S = stats(P); if (!S) return []; var R = rng(seed || 7), out = [], h = 0.5, sh = 1 / Math.sqrt(1 + h * h), f = factor || 1;
    for (var i = 0; i < n; i++) {
      var p, real = i < P.length;
      if (real) p = { dx: P[i].dx, dy: P[i].dy, real: true };
      else { var q = P[Math.floor(R() * P.length)]; p = { dx: S.mx + (q.dx - S.mx + h * S.sx * gauss(R)) * sh, dy: S.my + (q.dy - S.my + h * S.sy * gauss(R)) * sh, real: false }; }
      out.push({ dx: S.mx + (p.dx - S.mx) * f, dy: S.my + (p.dy - S.my) * f, real: p.real });
    }
    return out;
  }

  // ---------- the green ----------
  function inEll(x, y, e) { var r = (e.rot || 0) * Math.PI / 180, c = Math.cos(r), s = Math.sin(r), dx = x - e.x, dy = y - e.y, u = dx * c + dy * s, v = -dx * s + dy * c; return (u * u) / (e.rx * e.rx) + (v * v) / (e.ry * e.ry) <= 1; }
  function onGreen(x, y, G) { G = G || GREEN; return (x * x) / (G.rx * G.rx) + (y * y) / (G.ry * G.ry) <= 1; }
  // where a ball that landed at (x, y) is played from: green | sand | fairway (fringe, or the fairway in front) | rough
  function lieAt(x, y, G) {
    G = G || GREEN; if (onGreen(x, y, G)) return 'green';
    for (var i = 0; i < G.bunkers.length; i++) if (inEll(x, y, G.bunkers[i])) return 'sand';
    if ((x * x) / ((G.rx + G.fringe) * (G.rx + G.fringe)) + (y * y) / ((G.ry + G.fringe) * (G.ry + G.fringe)) <= 1) return 'fairway';
    if (Math.abs(x) <= laneHalf(y, G)) return 'fairway';
    return 'rough';
  }
  // half-width of the fairway at y: full width up to 6 yd short of the green, then it narrows into the front of the green
  function laneHalf(y, G) { G = G || GREEN; var y0 = -G.ry - 6, y1 = -G.ry + 4; if (y <= y0) return G.lane; if (y >= y1) return 0; var t = (y - y0) / (y1 - y0); return G.lane + (G.rx - 3 - G.lane) * t * t; }
  // strokes gained of the approach from `yd` (fairway) when the pattern is aimed at `aim` and the flag is at `pin`.
  // SG = E(fairway, yd) − 1 − E(where it finished); green = putt from the distance to the pin in feet, else yards to the pin from that lie.
  function play(P, pin, aim, yd, SG, bl, G) {
    aim = aim || pin; var e0 = SG.expected('fairway', yd, bl), n = P.length, sg = 0, on = 0, ft = [], lies = { green: 0, sand: 0, fairway: 0, rough: 0 };
    for (var i = 0; i < n; i++) {
      var x = aim.x + P[i].dx, y = aim.y + P[i].dy, lie = lieAt(x, y, G), d = Math.sqrt((x - pin.x) * (x - pin.x) + (y - pin.y) * (y - pin.y));
      lies[lie]++; if (lie === 'green') on++; ft.push(d * 3);
      sg += e0 - 1 - SG.expected(lie, lie === 'green' ? d * 3 : Math.max(1, d), bl);
    }
    return { sg: n ? sg / n : null, greenPct: n ? 100 * on / n : null, medFt: median(ft), lies: lies, n: n };
  }
  // best aim point on the green for this pin (2-yard grid, kept on the green): { aim, sg, gain (vs aiming at the flag) }
  function bestAim(P, pin, yd, SG, bl, G) {
    G = G || GREEN; var atPin = play(P, pin, pin, yd, SG, bl, G), best = { aim: { x: pin.x, y: pin.y }, sg: atPin.sg };
    for (var x = -G.rx; x <= G.rx; x += 2) for (var y = -G.ry; y <= G.ry; y += 2) {
      if (!onGreen(x, y, { rx: G.rx - 1.5, ry: G.ry - 1.5 })) continue;
      var r = play(P, pin, { x: x, y: y }, yd, SG, bl, G); if (r.sg > best.sg + 1e-9) best = { aim: { x: x, y: y }, sg: r.sg };
    }
    best.gain = best.sg - atPin.sg; best.atPin = atPin; return best;
  }
  // "4 yd left, 2 yd short of the flag" (aim relative to the pin)
  function aimText(aim, pin) {
    var dx = Math.round(aim.x - pin.x), dy = Math.round(aim.y - pin.y), p = [];
    if (dx) p.push(Math.abs(dx) + ' yd ' + (dx < 0 ? 'left' : 'right')); if (dy) p.push(Math.abs(dy) + ' yd ' + (dy < 0 ? 'short' : 'long'));
    return p.length ? p.join(', ') + ' of the flag' : 'at the flag';
  }
  // everything the page needs for one bucket. opts: { mode, factor, SG, bl }
  function analyse(sessions, yd, opts) {
    var P = points(sessions, yd, opts.mode); if (P.length < 3) return { yd: yd, n: P.length, ok: false };
    var show = pattern(P, SHOW, yd, opts.factor), many = pattern(P, Math.max(SG_N, P.length), yd * 31 + 1, opts.factor), S = stats(P);
    var pins = PINS.map(function (pin) { var b = bestAim(many, pin, yd, opts.SG, opts.bl); return { k: pin.k, name: pin.name, x: pin.x, y: pin.y, sg: b.atPin.sg, greenPct: b.atPin.greenPct, medFt: b.atPin.medFt, best: b }; });
    return { yd: yd, n: P.length, ok: P.length >= MIN_SHOTS, raw: P, show: show, many: many, stats: S, ell: ellipse(many), pins: pins,
      depth: S.my, side: S.mx, width: 2 * 1.2816 * S.sx * (opts.factor || 1), length: 2 * 1.2816 * S.sy * (opts.factor || 1) }; // width / length = the middle 80% of shots
  }
  // course-conditions factor from tournament approaches at this distance: their median proximity ÷ the sim pattern's at the centre pin (1–2.5)
  function courseFactor(tourFt, sessions, yd, SG, bl, mode) {
    if (!tourFt || tourFt.length < 5) return null; var P = points(sessions, yd, mode); if (P.length < MIN_SHOTS) return null;
    var simFt = play(pattern(P, SG_N, yd * 31 + 1, 1), PINS[4], PINS[4], yd, SG, bl).medFt, t = median(tourFt); if (!simFt || !t) return null;
    return Math.max(1, Math.min(2.5, Math.round(10 * t / simFt) / 10));
  }
  // colour for a strokes gained value on the pin grid: green when it gains, red when it loses (strength out to ±0.3)
  function sgTone(v) { if (v == null) return 'none'; return v >= 0.05 ? 'good' : v <= -0.05 ? 'bad' : 'even'; }

  var api = { GREEN: GREEN, PINS: PINS, PIN_ROWS: PIN_ROWS, PIN_NAME: PIN_NAME, pinOf: pinOf, MIN_SHOTS: MIN_SHOTS, SHOW: SHOW, CONF: CONF,
    num: num, parseOffline: parseOffline, bucket: bucket, parseCSV: parseCSV, guessMap: guessMap, toShots: toShots, clubGroups: clubGroups, median: median,
    validSessions: validSessions, mergeSessions: mergeSessions, buckets: buckets, points: points, stats: stats, ellipse: ellipse, pattern: pattern, rng: rng,
    onGreen: onGreen, inEll: inEll, laneHalf: laneHalf, lieAt: lieAt, play: play, bestAim: bestAim, aimText: aimText, analyse: analyse, courseFactor: courseFactor, sgTone: sgTone };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DISP = api;
})(this);
