// Saved courses + scorecard reading. Pure functions (no DOM): COURSES.parseCard(ocrText) etc.
// Course: { id, name, pars: [18], hcp: [18]?, tees: [{ name, yards: [18] }], updated }
(function (root) {
  var YD = [50, 700], PAR = [3, 6], HCP = [1, 18];
  var FIX = { O: '0', o: '0', D: '0', Q: '0', I: '1', l: '1', i: '1', '|': '1', '!': '1', L: '1', S: '5', s: '5', B: '8', Z: '2', z: '2', G: '6', b: '6', g: '9', q: '9', T: '7' };
  function sum(a) { return a.reduce(function (t, v) { return t + (+v || 0); }, 0); }
  // one OCR word -> { v } number | { junk } rating/slope | { w } word | null
  function tokWord(w, seenNum) {
    var core = String(w).replace(/^[^\w.\/']+|[^\w.\/']+$/g, ''); if (!core) return null;
    if (/[./]/.test(core) && /\d/.test(core)) return { junk: true }; // course rating / slope like 71.2/128
    var digits = (core.match(/\d/g) || []).length;
    if (digits && digits >= core.length - 1 && core.length <= 4) { // number with maybe one misread character (4O2, 1l)
      var fixed = core.split('').map(function (c) { return /\d/.test(c) ? c : FIX[c] || ''; }).join('');
      if (fixed.length === core.length) return { v: +fixed };
    }
    if (/^[A-Za-z][A-Za-z'’\-\/]*$/.test(core)) { if (/^[OoIlSB]{1,3}$/.test(core) && seenNum) return { v: +core.split('').map(function (c) { return FIX[c]; }).join('') }; return { w: core }; }
    return null;
  }
  // bold print often comes back with the spaces missing: "192545430" = 192 545 430, "34546882" = 3454 6882
  function splitRun(w) { var m = /^(\D?)(\d{6,9})(\D?)$/.exec(w); if (!m) return [w]; var d = m[2], k = d.length % 3 === 0 ? 3 : d.length === 8 ? 4 : 0; if (!k) return [w];
    var out = []; for (var i = 0; i < d.length; i += k) out.push(d.slice(i, i + k)); return out; }
  function splitWords(line) { return [].concat.apply([], String(line).replace(/[|\[\]{}()_=~"«»—–]+/g, ' ').replace(/,(?=\d{3}\b)/g, '').trim().split(/\s+/).map(splitRun)); }
  // one OCR line -> { label, toks: [{ v, junk }] }
  function tokens(line) {
    var label = [], toks = [], seenNum = false;
    splitWords(line).forEach(function (w) {
      var t = w && tokWord(w, seenNum); if (!t) return;
      if (t.w) { if (!seenNum) label.push(t.w); return; }
      toks.push(t); seenNum = true;
    });
    return { label: label.join(' '), toks: toks };
  }
  // Pull hole values out of a row's numbers. Totals (OUT/IN/TOT) are bigger than any hole value; a total that equals the sum of
  // the 9 values before it confirms that nine. Returns { holes: [..18 or fewer, null = unreadable], checked: number of confirmed nines }.
  function holesOf(toks, lo, hi) {
    var cand = [], seps = [], checked = 0, junkAt = -9;
    toks.forEach(function (t, i) {
      if (t.junk) { junkAt = i; return; }
      if (t.v >= lo && t.v <= hi) cand.push({ v: t.v, nearJunk: i - junkAt <= 2 });
      else if (t.v > hi) seps.push({ at: cand.length, v: t.v });
    });
    var vals = cand.map(function (c) { return c.v; });
    // confirmed nines
    var conf = [];
    seps.forEach(function (sp) { if (sp.at >= 9 && sum(vals.slice(sp.at - 9, sp.at)) === sp.v && !conf.some(function (c) { return c > sp.at - 9; })) conf.push(sp.at - 9); });
    if (conf.length) {
      checked = conf.length; var c0 = conf[0];
      if (c0 >= 9) return { holes: vals.slice(c0 - 9, c0 + 18 - 9), checked: checked };
      var lead = vals.slice(0, c0), rest = vals.slice(c0);
      if (cand.length - c0 >= 18 || conf.length > 1 || c0 === 0 || seps.some(function (sp) { return sp.at === c0 + 9; }) && cand.length - c0 > 9) return { holes: rest.slice(0, 18), checked: checked };
      if (lead.length < 9 && rest.length === 9) { while (lead.length < 9) lead.push(null); return { holes: lead.concat(rest), checked: checked }; } // back nine confirmed, part of the front unreadable
      return { holes: rest.slice(0, 18), checked: checked };
    }
    // no confirmed nine: a printed OUT total still splits front from back
    var outAt = seps.length && seps[0].at > 4 && seps[0].at <= 9 && cand.length - seps[0].at >= 5 && cand.length - seps[0].at <= 9 ? seps[0].at : -1;
    if (outAt > 0 && outAt < 9) { var fr = vals.slice(0, outAt); while (fr.length < 9) fr.push(null); return { holes: fr.concat(vals.slice(outAt, outAt + 9)), checked: 0 }; }
    while (cand.length > 18 && cand[0].nearJunk) cand.shift();
    if (cand.length > 9 && cand.length < 18) while (cand.length > 9 && cand[0].nearJunk) cand.shift();
    return { holes: cand.slice(0, 18).map(function (c) { return c.v; }), checked: 0 };
  }
  var TEE_NAMES = ['Black', 'Blue', 'White', 'Gold', 'Red', 'Green', 'Silver', 'Yellow', 'Orange', 'Purple', 'Copper', 'Bronze', 'Tips', 'Championship', 'Forward', 'Combo', 'Sage', 'Manzanita', 'Tournament', 'Member', 'Senior', 'Junior', 'Family'];
  function lev(a, b) { var m = a.length, n = b.length, d = []; for (var i = 0; i <= m; i++) { d[i] = [i]; } for (var j = 1; j <= n; j++) d[0][j] = j;
    for (i = 1; i <= m; i++) for (j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[m][n]; }
  function snapName(s) { // OCR slips in common tee names: "Jbiack" -> Black, "Wnite" -> White
    if (!s) return s; var lo = s.toLowerCase(), best = null, bd = 9;
    TEE_NAMES.forEach(function (t) { var d = lev(lo, t.toLowerCase()); if (d < bd) { bd = d; best = t; } });
    if (!best || bd === 0 || lo.length < 3) return bd === 0 ? best : s;
    var lim = (best.length >= 6 ? 2 : 1) + (lo.length >= 5 && best.length >= 5 ? 1 : 0) - (lo.length < 4 ? 1 : 0);
    if (lo.charAt(0) === best.charAt(0).toLowerCase()) lim = Math.max(lim, 2); // same first letter: "Wie" -> White
    return bd <= lim && bd < best.length / 2 + 1 ? best : s;
  }
  function cleanName(s) {
    s = String(s || '').replace(/\b(tees?|yards?|yds|yardage|men'?s|women'?s|ladies)\b/gi, ' ').replace(/[^A-Za-z'’\-\/ ]/g, ' ').replace(/\s+/g, ' ').trim();
    var ws = s.split(' ').filter(Boolean); while (ws.length > 1 && ws[0].length <= 2) ws.shift(); // stray marks before the name
    ws = ws.map(function (w) { w = snapName(w); return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase(); });
    var known = ws.filter(function (w) { return TEE_NAMES.indexOf(w) >= 0; });
    if (known.length === 1 && ws.every(function (w) { return w === known[0] || w.length <= 3; })) return known[0]; // "White Tt Too" -> White
    return ws.join(' ');
  }
  var HOLE_RX = /^(hole|holes|no|number)$/i, PAR_RX = /^par$/i, HCP_RX = /^(hcp|hdcp|hdcp\.|handicap|hcap|hndcp|stroke|index|si|s\.i\.|mens? hcp|ladies hcp)/i;
  function isSeq(h) { var n = 0; for (var i = 1; i < h.length; i++) if (h[i] === h[i - 1] + 1) n++; return h.length >= 6 && n >= h.length - 2; }
  function parseCard(text) {
    var lines = String(text || '').split(/\r?\n/), rows = [];
    lines.forEach(function (ln) {
      var t = tokens(ln); if (t.toks.filter(function (x) { return !x.junk; }).length < 5) return;
      var lab = t.label.trim(), first = lab.split(' ')[0] || '';
      var allv = t.toks.filter(function (x) { return !x.junk; }).map(function (x) { return x.v; });
      var small = allv.filter(function (v) { return v >= 1 && v <= 18; }).length;
      if (HOLE_RX.test(first) || isSeq(holesOf(t.toks, 1, 18).holes)) { rows.push({ kind: 'hole' }); return; }
      var par35 = allv.filter(function (v) { return v >= 3 && v <= 5; }).length;
      if (PAR_RX.test(first) || /^[PR]A[RP]$/i.test(first) || (/par/i.test(lab) && !/yard/i.test(lab)) || (par35 >= 12 && !HCP_RX.test(lab) && allv.every(function (v) { return v <= 6 || v >= 27; }))) { rows.push({ kind: 'par', h: holesOf(t.toks, PAR[0], PAR[1]) }); return; }
      if (HCP_RX.test(lab) || /h.?c.?p|handicap/i.test(lab)) { rows.push({ kind: 'hcp', h: holesOf(t.toks, HCP[0], HCP[1]) }); return; }
      var y = holesOf(t.toks, YD[0], YD[1]);
      if (y.holes.length >= 7) { rows.push({ kind: 'tee', name: cleanName(lab), h: y }); return; }
      if (!lab && small >= 8 && allv.every(function (v) { return v <= 6 || v >= 27; }) && holesOf(t.toks, 3, 6).holes.length >= 8) rows.push({ kind: 'par', h: holesOf(t.toks, 3, 6) });
    });
    // front-nine and back-nine tables printed separately: join rows with the same name, in order
    var out = { pars: null, hcp: null, tees: [] }, byName = {}, parParts = [], hcpParts = [], unnamed = 0;
    rows.forEach(function (r) {
      if (r.kind === 'par') parParts.push(r.h.holes); else if (r.kind === 'hcp') hcpParts.push(r.h.holes);
      else if (r.kind === 'tee') {
        var key = (r.name || '').toLowerCase();
        if (key && byName[key] && byName[key].yards.length <= 9) { byName[key].yards = byName[key].yards.concat(r.h.holes).slice(0, 18); byName[key].checked += r.h.checked; return; }
        if (!key) { unnamed++; r.name = 'Tee ' + unnamed; key = r.name.toLowerCase(); if (byName[key]) return; }
        if (byName[key]) return;
        byName[key] = { name: r.name, yards: r.h.holes.slice(), checked: r.h.checked }; out.tees.push(byName[key]);
      }
    });
    var join = function (parts) { var a = []; parts.forEach(function (p) { if (a.length < 18 && (a.length === 0 || a.length + p.length <= 18 || a.length === 9)) a = a.concat(p); }); return a.slice(0, 18); };
    if (parParts.length) out.pars = join(parParts);
    if (hcpParts.length) out.hcp = join(hcpParts);
    // unnamed back-nine rows (label printed only on the front table): pair them up with 9-hole tees in order
    var nine = out.tees.filter(function (t) { return t.yards.length === 9 && !/^Tee \d+$/.test(t.name); }), extra = out.tees.filter(function (t) { return /^Tee \d+$/.test(t.name) && t.yards.length === 9; });
    if (nine.length && nine.length === extra.length) { nine.forEach(function (t, i) { t.yards = t.yards.concat(extra[i].yards); t.checked += extra[i].checked; }); out.tees = out.tees.filter(function (t) { return extra.indexOf(t) < 0; }); }
    out.tees.forEach(function (t) { t.yards = pad(t.yards); });
    if (out.pars) out.pars = pad(out.pars); if (out.hcp) out.hcp = pad(out.hcp);
    out.tees.sort(function (a, b) { return sum(b.yards) - sum(a.yards); }); // longest first, like most cards
    return out;
  }
  // Column-aware reading when the OCR gives word positions: lines = [{ words: [{ text, x0, x1 }] }].
  // Numbers are lined up into the card's columns, so an unreadable box stays empty in the right hole instead of shifting the row.
  function parseWords(lines) {
    var rows = (lines || []).map(function (ln) {
      var label = [], nums = [], seen = false;
      (ln.words || []).forEach(function (wd) { var parts = splitWords(wd.text).filter(Boolean), k = parts.length; parts.forEach(function (w, i) { var t = tokWord(w, seen); if (!t) return;
        if (t.w) { if (!seen) label.push(t.w); return; } seen = true; if (!t.junk) nums.push({ v: t.v, x: wd.x0 + (i + 0.5) * (wd.x1 - wd.x0) / k }); }); }); // "412|385" read as one word: spread over its box
      return { label: label.join(' '), nums: nums };
    }).filter(function (r) { return r.nums.length >= 7; });
    if (rows.length < 2) return null;
    var gaps = []; rows.forEach(function (r) { for (var i = 1; i < r.nums.length; i++) gaps.push(r.nums[i].x - r.nums[i - 1].x); });
    gaps.sort(function (a, b) { return a - b; }); var sp = gaps[Math.floor(gaps.length * 0.4)] || 50;
    // column centres: start from the most complete, evenly spaced row, add columns other rows agree on, then centre each on its points
    var need = Math.max(2, Math.ceil(rows.length * 0.3)), score = function (r) { var g = []; for (var i = 1; i < r.nums.length; i++) g.push(r.nums[i].x - r.nums[i - 1].x);
      var bad = g.filter(function (d) { return d < sp * 0.6 || d > sp * 1.6; }).length; return r.nums.length - bad * 2; };
    var tpl = rows.slice().sort(function (a, b) { return score(b) - score(a); })[0], seeds = tpl.nums.map(function (n) { return n.x; });
    var near = function (x, list, lim) { return list.some(function (s2) { return Math.abs(s2 - x) < lim; }); };
    var extra = []; rows.forEach(function (r) { r.nums.forEach(function (n) { if (!near(n.x, seeds, sp * 0.5)) extra.push(n.x); }); });
    extra.sort(function (a, b) { return a - b; });
    for (var e = 0; e < extra.length; e++) { var grp = extra.filter(function (x) { return Math.abs(x - extra[e]) < sp * 0.3; }); if (grp.length >= need && !near(extra[e], seeds, sp * 0.5)) seeds.push(grp[grp.length >> 1]); }
    var cl = seeds.sort(function (a, b) { return a - b; }).map(function (x) {
      var pts = []; rows.forEach(function (r) { r.nums.forEach(function (n) { if (Math.abs(n.x - x) < sp * 0.35) pts.push(n.x); }); }); pts.sort(function (a, b) { return a - b; });
      return { x: pts.length ? pts[pts.length >> 1] : x }; });
    var at = function (r, x) { var best = null, bd = sp * 0.5; r.nums.forEach(function (n) { var d = Math.abs(n.x - x); if (d < bd) { bd = d; best = n.v; } }); return best; };
    // totals columns: most yardage-looking rows have a value over 700 there
    var teeish = rows.filter(function (r) { var v = r.nums.map(function (n) { return n.v; }).sort(function (a, b) { return a - b; }); return v[v.length >> 1] >= 60; });
    var holeCols = cl.filter(function (c) { var big = 0, tot = 0; teeish.forEach(function (r) { var v = at(r, c.x); if (v != null) { tot++; if (v > 700) big++; } }); return !(big >= 2 || (tot && big / tot >= 0.5)); });
    // the usual layout is 1-9, OUT, 10-18, IN, TOT: fall back on it when a merged OCR number confuses the totals test
    if (holeCols.length !== 18 && cl.length === 21) holeCols = cl.filter(function (c, i) { return i !== 9 && i !== 19 && i !== 20; });
    else if (holeCols.length !== 18 && cl.length === 20) holeCols = cl.filter(function (c, i) { return i !== 9 && i !== 19; });
    if (holeCols.length !== 18 && holeCols.length !== 9) return null;
    var out = { pars: null, hcp: null, tees: [], cols: true }, byName = {}, unnamed = 0;
    rows.forEach(function (r) {
      var vals = holeCols.map(function (c) { return at(r, c.x); }), lab = r.label, first = lab.split(' ')[0] || '', ok = vals.filter(function (v) { return v != null; });
      var inR = function (lo, hi) { return ok.filter(function (v) { return v >= lo && v <= hi; }).length; };
      var clip = function (lo, hi) { return pad(vals.map(function (v) { return v != null && v >= lo && v <= hi ? v : null; })); };
      if (HOLE_RX.test(first) || (inR(1, 18) >= ok.length - 1 && isSeq(ok))) return;
      if (PAR_RX.test(first) || /^[PR]A[RP]$/i.test(first) || (/par/i.test(lab) && !/yard/i.test(lab)) || (inR(3, 5) >= Math.max(6, ok.length - 1) && !HCP_RX.test(lab))) { if (!out.pars) out.pars = clip(3, 6); return; }
      if (HCP_RX.test(lab) || /h.?c.?p|handicap/i.test(lab)) { if (!out.hcp) out.hcp = clip(1, 18); return; }
      if (inR(YD[0], YD[1]) >= Math.max(6, ok.length * 0.6)) {
        var name = cleanName(lab); if (!name) { unnamed++; name = 'Tee ' + unnamed; }
        if (byName[name.toLowerCase()]) return; byName[name.toLowerCase()] = 1;
        out.tees.push({ name: name, yards: clip(YD[0], YD[1]), checked: 0 });
      }
    });
    return out.tees.length ? out : null;
  }
  // Best reading: column-aware when word positions line up, otherwise line by line; values the column read missed are taken from the line read when they agree on position
  function readCard(text, lines) {
    var seq = parseCard(text), col = lines ? parseWords(lines) : null;
    if (!col) return seq;
    col.tees.forEach(function (t) { var s2 = seq.tees.filter(function (x) { return x.name === t.name; })[0]; if (s2) { t.checked = s2.checked;
      var filled = function (a) { return a.filter(function (v) { return v != null; }).length; };
      if (s2.checked >= 2 || (s2.checked && filled(s2.yards) > filled(t.yards))) t.yards = s2.yards.slice(); else t.yards = t.yards.map(function (v, i) { return v == null && s2.checked && i >= 9 ? s2.yards[i] : v; }); } });
    if (!col.pars && seq.pars) col.pars = seq.pars; if (!col.hcp && seq.hcp) col.hcp = seq.hcp;
    seq.tees.forEach(function (t) { if (!col.tees.some(function (x) { return x.name === t.name; }) && t.checked >= 2) col.tees.push(t); });
    col.tees.sort(function (a, b) { return sum(b.yards) - sum(a.yards); });
    return col;
  }
  function pad(a) { var o = (a || []).slice(0, 18); while (o.length < 18) o.push(null); return o; }

  // ---- saved courses ----
  function blankCourse(name) { return { id: 'c' + Date.now() + Math.floor(Math.random() * 1000), name: name || '', pars: pad([]), tees: [{ name: 'Tee', yards: pad([]) }], updated: new Date().toISOString() }; }
  function fromScan(scan, name) {
    var c = blankCourse(name);
    c.pars = pad(scan.pars || []); if (scan.hcp && scan.hcp.some(function (v) { return v != null; })) c.hcp = pad(scan.hcp);
    if (scan.tees && scan.tees.length) c.tees = scan.tees.map(function (t) { return { name: t.name, yards: pad(t.yards) }; });
    return c;
  }
  function holesPlayed(c) { var n = 0; for (var i = 0; i < 18; i++) if (c.pars[i] != null || c.tees.some(function (t) { return t.yards[i] != null; })) n = i + 1; return n; }
  function teeTotal(t, from, to) { return sum((t.yards || []).slice(from || 0, to == null ? 18 : to)); }
  function clean(c) { // what gets stored
    var o = { id: c.id, name: String(c.name || '').trim() || 'Course', pars: pad(c.pars).map(num), tees: (c.tees || []).filter(function (t) { return t && (t.name || t.yards.some(function (v) { return v != null; })); })
      .map(function (t) { return { name: String(t.name || '').trim() || 'Tee', yards: pad(t.yards).map(num) }; }), updated: new Date().toISOString() };
    if (c.hcp && c.hcp.some(function (v) { return v != null && v !== ''; })) o.hcp = pad(c.hcp).map(num);
    return o;
  }
  function num(v) { return v === '' || v == null || isNaN(+v) ? null : +v; }
  // Prefill a round's holes from a course + tee: par and the tee-shot distance (row 1)
  function prefill(holes, c, teeName) {
    var t = (c.tees || []).filter(function (x) { return x.name === teeName; })[0] || (c.tees || [])[0];
    holes.forEach(function (h, i) { var p = c.pars && c.pars[i]; if (p >= 3 && p <= 6) h.par = p; var y = t && t.yards[i]; if (y != null && h.rows && h.rows[0] && h.rows[0].dist === '') h.rows[0].dist = y; });
    return holes;
  }
  // Restore: add courses not on the phone (by id); a changed copy replaces the phone's only if it is newer
  function mergeCourses(have, incoming) {
    var out = (have || []).slice(), by = {}, res = { added: 0, updated: 0 };
    out.forEach(function (c, i) { by[c.id] = i; });
    (incoming || []).forEach(function (c) {
      if (!c || !c.id || !Array.isArray(c.tees)) return;
      if (by[c.id] == null) { by[c.id] = out.length; out.push(c); res.added++; return; }
      var cur = out[by[c.id]]; if (JSON.stringify(cur) !== JSON.stringify(c) && String(c.updated || '') > String(cur.updated || '')) { out[by[c.id]] = c; res.updated++; }
    });
    res.courses = out; return res;
  }
  // Course name guess: the first line with real words and no yardage numbers ("Pebble Creek GC")
  function guessName(text) {
    var ls = String(text || '').split(/\r?\n/).map(function (l) { return l.replace(/[^A-Za-z0-9'&.\- ]+/g, ' ').replace(/\s+/g, ' ').trim(); });
    for (var i = 0; i < ls.length; i++) { var l = ls[i], words = l.split(' ').filter(function (w) { return /^[A-Za-z][A-Za-z'&.\-]{1,}$/.test(w); });
      if (words.length >= 2 && !/\d{2,}/.test(l) && !/^(hole|par|handicap|hcp)\b/i.test(l) && words.join('').length >= 6) return words.filter(function (w) { return w.length > 1 || /[A-Z]/.test(w); }).join(' '); }
    return '';
  }
  var api = { guessName: guessName, parseCard: parseCard, parseWords: parseWords, readCard: readCard, snapName: snapName, tokens: tokens, holesOf: holesOf, cleanName: cleanName, blankCourse: blankCourse, fromScan: fromScan, clean: clean, prefill: prefill,
    mergeCourses: mergeCourses, holesPlayed: holesPlayed, teeTotal: teeTotal, pad: pad, sum: sum };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.COURSES = api;
})(this);
