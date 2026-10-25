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
  function holesOf(toks, lo, hi) { // + tot: the first printed total after the holes (OUT or IN), used to confirm a nine
    var r = holesOf0(toks, lo, hi), big = toks.filter(function (t) { return !t.junk && t.v > hi; }); r.tot = big.length ? big[0].v : null; return r;
  }
  function holesOf0(toks, lo, hi) {
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
  // edit distance; letters OCR mixes up in bold print (b/j, l/p, i/l, e/c…) cost half
  var SIM = ' bj bh lp li lj lt ij ec ce ao ae nm rn uv vw hn il ';
  function lev(a, b) { var m = a.length, n = b.length, d = []; for (var i = 0; i <= m; i++) { d[i] = [i]; } for (var j = 1; j <= n; j++) d[0][j] = j;
    for (i = 1; i <= m; i++) for (j = 1; j <= n; j++) { var x = a[i - 1], y = b[j - 1], sc = x === y ? 0 : SIM.indexOf(' ' + x + y + ' ') >= 0 || SIM.indexOf(' ' + y + x + ' ') >= 0 ? 0.5 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + sc); } return d[m][n]; }
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
      if (r.kind === 'par') { parParts.push(r.h.holes); if (out.parTot == null) out.parTot = r.h.tot; } else if (r.kind === 'hcp') hcpParts.push(r.h.holes);
      else if (r.kind === 'tee') {
        var key = (r.name || '').toLowerCase();
        if (key && byName[key] && byName[key].yards.length <= 9) { byName[key].yards = byName[key].yards.concat(r.h.holes).slice(0, 18); byName[key].checked += r.h.checked; return; }
        if (!key) { unnamed++; r.name = 'Tee ' + unnamed; key = r.name.toLowerCase(); if (byName[key]) return; }
        if (byName[key]) return;
        byName[key] = { name: r.name, yards: r.h.holes.slice(), checked: r.h.checked, ord: out.tees.length, tot: r.h.tot }; out.tees.push(byName[key]);
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
        out.tees.push({ name: name, yards: clip(YD[0], YD[1]), checked: 0, ord: out.tees.length });
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
  // ---- two close-up photos: front 9 + back 9 ----
  // One photo's reading -> { tees: [{ name, yards: [9], ord, unnamed }], pars: [9] | null, hcp: [9] | null, empty, whole }.
  // whole = the photo held all 18 holes (an old-style whole-card photo): use it as is.
  function cnt(a, f, t) { return a ? a.slice(f, t).filter(function (v) { return v != null; }).length : 0; }
  function nineOf(a) { if (!a) return null; var o = cnt(a, 0, 9) >= cnt(a, 9, 18) ? a.slice(0, 9) : a.slice(9, 18); while (o.length < 9) o.push(null); return o; }
  function halfCard(card, half) {
    card = card || { tees: [] }; var tees = card.tees || [];
    var both = function (a) { return cnt(a, 0, 9) >= 5 && cnt(a, 9, 18) >= 5; };
    if (tees.some(function (t) { return both(t.yards); }) || both(card.pars)) return { whole: true, card: card, tees: tees, pars: card.pars, hcp: card.hcp, empty: false };
    var ts = tees.map(function (t, k) { return { name: t.name, yards: nineOf(t.yards), ord: t.ord == null ? k : t.ord, unnamed: !t.name || /^Tee \d+$/.test(t.name) || (t.name.replace(/[^A-Za-z]/g, '').length < 3 && TEE_NAMES.indexOf(t.name) < 0) }; })
      .filter(function (t) { return cnt(t.yards, 0, 9) >= 3; });
    ts.sort(function (a, b) { return a.ord - b.ord; });
    var pars = card.pars && cnt(card.pars, 0, 18) ? nineOf(card.pars) : null, hcp = card.hcp && cnt(card.hcp, 0, 18) ? nineOf(card.hcp) : null;
    return { half: half, tees: ts, pars: pars, hcp: hcp, empty: !ts.length && !pars };
  }
  // A saved/edited course's 9 holes as if just scanned (re-scanning one half keeps the other half's numbers, fixes included)
  function halfFromCourse(c, half) {
    var off = half === 'b' ? 9 : 0, sl = function (a) { return a ? pad(a).slice(off, off + 9) : null; };
    var ts = (c.tees || []).map(function (t, k) { return { name: t.name, yards: sl(t.yards), ord: k, unnamed: !t.name || /^Tee \d*$/.test(t.name) }; }).filter(function (t) { return cnt(t.yards, 0, 9); });
    var pars = cnt(c.pars, off, off + 9) ? sl(c.pars) : null, hcp = c.hcp && cnt(c.hcp, off, off + 9) ? sl(c.hcp) : null;
    return { half: half, tees: ts, pars: pars, hcp: hcp, empty: !ts.length && !pars };
  }
  function sameName(a, b) { a = String(a || '').toLowerCase(); b = String(b || '').toLowerCase(); if (!a || !b) return false; if (a === b) return true;
    return a.length >= 4 && b.length >= 4 && (snapName(a) === snapName(b) && TEE_NAMES.indexOf(snapName(a)) >= 0 || lev(a, b) <= Math.min(2, Math.floor(Math.min(a.length, b.length) / 3))); }
  // Which front-9 row each back-9 row belongs to: same printed name first, then near-same name (OCR slip), then card order.
  // Returns { links: { backIndex: frontIndex | -1 }, ask: [backIndex] } – ask = rows matched only by order where a name disagreed or the counts differ.
  function autoLinks(ft, bt) {
    var L = {}, used = {}, ask = [];
    bt.forEach(function (b, j) { if (b.unnamed) return; ft.forEach(function (f, i) { if (L[j] == null && !used[i] && !f.unnamed && f.name.toLowerCase() === b.name.toLowerCase()) { L[j] = i; used[i] = 1; } }); });
    bt.forEach(function (b, j) { if (L[j] != null || b.unnamed) return; ft.forEach(function (f, i) { if (L[j] == null && !used[i] && !f.unnamed && sameName(f.name, b.name)) { L[j] = i; used[i] = 1; } }); });
    var rb = bt.map(function (b, j) { return j; }).filter(function (j) { return L[j] == null; }), rf = ft.map(function (f, i) { return i; }).filter(function (i) { return !used[i]; });
    if (rb.length) {
      var mismatch = rb.length !== rf.length;
      rb.forEach(function (j, k) { var i = k < rf.length ? rf[k] : -1; L[j] = i;
        if (ft.length && (mismatch || (!bt[j].unnamed && i >= 0 && !ft[i].unnamed))) ask.push(j); });
    }
    return { links: L, ask: ask };
  }
  // Front + back readings (either may be null = skipped) -> one card like parseCard's: { pars, hcp, tees: [{ name, yards: [18], halves }], links, ask, front, back }
  function mergeHalves(F, B, links) {
    var ft = F ? F.tees : [], bt = B ? B.tees : [], auto = autoLinks(ft, bt), L = links || auto.links;
    var out = { pars: pad([]), hcp: null, tees: [], links: L, ask: links ? [] : auto.ask, front: ft, back: bt };
    var put = function (dst, src, off) { if (src) for (var i = 0; i < 9; i++) if (src[i] != null) dst[off + i] = src[i]; };
    put(out.pars, F && F.pars, 0); put(out.pars, B && B.pars, 9);
    if ((F && F.hcp) || (B && B.hcp)) { out.hcp = pad([]); put(out.hcp, F && F.hcp, 0); put(out.hcp, B && B.hcp, 9); }
    var made = ft.map(function (f) { var y = pad([]); put(y, f.yards, 0); var t = { name: f.name, yards: y, halves: 'f', unnamed: f.unnamed }; out.tees.push(t); return t; });
    bt.forEach(function (b, j) { var i = L[j], t = i != null && i >= 0 ? made[i] : null;
      if (t) { put(t.yards, b.yards, 9); t.halves = 'fb'; if (t.unnamed && !b.unnamed) { t.name = b.name; t.unnamed = false; } return; }
      var y = pad([]); put(y, b.yards, 9); out.tees.push({ name: b.name, yards: y, halves: 'b', unnamed: b.unnamed }); });
    var seen = {}, k = 0; out.tees.forEach(function (t) { if (t.unnamed || seen[t.name.toLowerCase()]) { do { k++; t.name = 'Tee ' + k; } while (seen[t.name.toLowerCase()]); } seen[t.name.toLowerCase()] = 1; delete t.unnamed; });
    out.tees.sort(function (a, b) { return sum(b.yards) - sum(a.yards); });
    return out;
  }
  // Several OCR passes of one half photo (different sizes) -> one reading by consensus.
  // A row whose 9 numbers add up to its printed OUT/IN total is confirmed and wins; otherwise each box takes the value most passes agree on.
  // Returns halfCard's shape plus ok (every row confirmed: no more passes needed).
  // One close-up of a nine, read on its own: the hole-number row (1-9 or 10-18) fixes the 9 columns, so a sliver of the next
  // column at the edge or a missed box can't shift a row. Each row keeps the printed total just after its 9 boxes (tot) to check the sum.
  function parseHalf(text, lines, half) {
    var off = half === 'b' ? 9 : 0, hasX = !!(lines && lines.length);
    var src = hasX ? lines.map(function (ln) { return (ln.words || []).map(function (w) { return { text: w.text, x0: w.x0, x1: w.x1 }; }); })
      : String(text || '').split(/\r?\n/).map(function (l) { return l.split(/\s+/).filter(Boolean).map(function (w) { return { text: w }; }); });
    var rows = src.map(function (words) { var label = [], nums = [], seen = false;
      words.forEach(function (wd) { var parts = splitWords(wd.text).filter(Boolean), k = parts.length; parts.forEach(function (w, i) { var t = tokWord(w, seen); if (!t) return;
        if (t.w) { if (!seen) label.push(t.w); return; } seen = true; if (!t.junk) nums.push({ v: t.v, x: wd.x0 == null ? null : wd.x0 + (i + 0.5) * (wd.x1 - wd.x0) / k }); }); });
      return { label: label.join(' '), nums: nums }; }).filter(function (r) { return r.nums.length >= 4; });
    // columns: the yardage boxes grouped by x, else a line fitted through the hole numbers
    var cols = null, holeRow = null;
    if (hasX) {
      rows.forEach(function (r) { if (holeRow) return; var hit = r.nums.filter(function (n) { return n.v >= off + 1 && n.v <= off + 9; }), inc = 0;
        for (var i = 1; i < hit.length; i++) if (hit[i].v > hit[i - 1].v && hit[i].x > hit[i - 1].x) inc++;
        if (hit.length >= 5 && inc >= hit.length - 2) holeRow = { r: r, hit: hit }; });
      // the yardage boxes themselves line up best: group their x positions into columns
      var xs = []; rows.forEach(function (r) { var y = r.nums.filter(function (n) { return n.v >= YD[0] && n.v <= YD[1]; }); if (y.length >= 5) y.forEach(function (n) { xs.push(n.x); }); });
      xs.sort(function (a, b) { return a - b; });
      if (xs.length >= 18) { var gap = (xs[xs.length - 1] - xs[0]) / 8 * 0.4, cl = [[xs[0]]];
        for (var q2 = 1; q2 < xs.length; q2++) { if (xs[q2] - xs[q2 - 1] > gap) cl.push([]); cl[cl.length - 1].push(xs[q2]); }
        var big = cl.filter(function (c) { return c.length >= 2; }).map(function (c) { return c[Math.floor(c.length / 2)]; });
        if (big.length === 9) cols = big; }
      if (holeRow && !cols) { var H = holeRow.hit, n = H.length, mx = 0, mh = 0; H.forEach(function (h) { mx += h.x; mh += h.v; }); mx /= n; mh /= n; var sxy = 0, sxx = 0;
        H.forEach(function (h) { sxy += (h.v - mh) * (h.x - mx); sxx += (h.v - mh) * (h.v - mh); }); var bb = sxx ? sxy / sxx : 0;
        if (bb > 0) { cols = []; for (var c = 0; c < 9; c++) { var hv = off + 1 + c, ex = H.filter(function (h) { return h.v === hv; })[0]; cols.push(ex && Math.abs(ex.x - (mx + bb * (hv - mh))) < bb * 0.4 ? ex.x : mx + bb * (hv - mh)); } } }
    }
    var sp = cols ? (cols[8] - cols[0]) / 8 : 0;
    var out = { half: half, tees: [], pars: null, parsOk: false, hcp: null }, seenN = {};
    rows.forEach(function (r) {
      if (holeRow && r === holeRow.r) return;
      var lab = r.label, first = lab.split(' ')[0] || '', cand = [[], [], [], [], [], [], [], [], []], after = [];
      if (cols) r.nums.forEach(function (nn) { if (nn.x > cols[8] + sp * 0.5) { after.push(nn.v); return; } var j = -1, dj = 1e9;
          cols.forEach(function (cx, k) { if (Math.abs(nn.x - cx) < dj) { dj = Math.abs(nn.x - cx); j = k; } }); if (dj <= sp * 0.45) cand[j].push({ v: nn.v, d: dj }); });
      var pick = function (lo, hi) { return cand.map(function (c) { var ok = c.filter(function (o) { return o.v >= lo && o.v <= hi; }).sort(function (a, b) { return a.d - b.d; }); return ok.length ? ok[0].v : null; }); };
      var boxes = pick(-1, 1e9);
      var vals = r.nums.map(function (nn) { return nn.v; });
      var fill = function (lo, hi) { // no positions: the first 9 values in range, then the total
        if (cols) return pick(lo, hi);
        var y = [], k = 0; while (k < vals.length && y.length < 9) { if (vals[k] >= lo && vals[k] <= hi) y.push(vals[k]); else if (y.length) break; k++; }
        after = vals.slice(k).filter(function (v) { return v > hi; }); while (y.length < 9) y.push(null); return y; };
      var inR = function (lo, hi) { return cols ? pick(lo, hi).filter(function (v) { return v != null; }).length : vals.filter(function (v) { return v >= lo && v <= hi; }).length; };
      var tot = function (hi) { var a = after.filter(function (v) { return v > hi; }); return a.length ? a[0] : null; };
      if (HOLE_RX.test(first)) return;
      var nPar = inR(3, 6), nAll = (cols ? boxes : vals).filter(function (v) { return v != null; }).length;
      if (!HCP_RX.test(lab) && (PAR_RX.test(first) || /^[PR]A[RP]$/i.test(first) || (nPar >= 6 && nPar >= nAll - 1 && inR(7, 18) <= 1))) { if (!out.pars) { out.pars = fill(3, 6); var pt = tot(6); out.parsOk = cnt(out.pars, 0, 9) === 9 && pt === sum(out.pars); } return; }
      if (HCP_RX.test(lab) || /h.?c.?p|handicap/i.test(lab) || (inR(1, 18) >= 7 && inR(7, 18) >= 3 && inR(YD[0], YD[1]) === 0)) { if (!out.hcp) out.hcp = fill(1, 18); return; }
      if (inR(YD[0], YD[1]) >= 5) {
        var y = fill(YD[0], YD[1]), t = tot(YD[1]), name = cleanName(lab), un = !name || name.replace(/[^A-Za-z]/g, '').length < 3 && TEE_NAMES.indexOf(name) < 0 || seenN[name.toLowerCase()];
        if (!un) seenN[name.toLowerCase()] = 1;
        out.tees.push({ name: un ? 'Tee' : name, unnamed: !!un, yards: y, ord: out.tees.length, tot: t, ok: cnt(y, 0, 9) === 9 && t === sum(y) });
      }
    });
    out.empty = !out.tees.length && !out.pars; return out;
  }
  function readHalf(passes, half) {
    var reads = [], alts = [], parAlts = [];
    var same = function (a, b) { var k = 0; for (var i = 0; i < 9; i++) if (a[i] != null && a[i] === b[i]) k++; return k; };
    for (var p = 0; p < passes.length; p++) {
      var P = passes[p];
      if (p === 0) { var old = halfCard(readCard(P.text, P.lines), half), longRow = String(P.text || '').split(/\r?\n/).some(function (l) { return tokens(l).toks.filter(function (t) { return t.v >= YD[0] && t.v <= YD[1]; }).length >= 14; });
        if (old.whole && longRow) return old; } // a whole-card photo: one long row per tee
      var h = parseHalf(P.text, P.lines, half), hs = parseHalf(P.text, null, half); h.p = p; reads.push(h);
      [h, hs].forEach(function (x) { x.tees.forEach(function (t) { alts.push({ p: p, yards: t.yards, ok: t.ok, name: t.name, unnamed: t.unnamed }); }); if (x.pars) parAlts.push({ p: p, yards: x.pars, ok: x.parsOk }); });
    }
    // most passes agree on the number of rows; among those, the reading with the most confirmed rows and filled boxes leads
    var nc = {}; reads.forEach(function (r) { nc[r.tees.length] = (nc[r.tees.length] || 0) + 1; });
    var q = function (r) { return (nc[r.tees.length] || 0) * 100 + r.tees.filter(function (t) { return t.ok; }).length * 12 + (r.parsOk ? 12 : 0) +
      r.tees.reduce(function (s2, t) { return s2 + cnt(t.yards, 0, 9) + (!t.unnamed && TEE_NAMES.indexOf(t.name) >= 0 ? 2 : 0); }, 0) + cnt(r.pars, 0, 9); };
    var ref = reads.slice().sort(function (a, b) { return q(b) - q(a) || a.p - b.p; })[0];
    var fix = function (y, ok, pool) { if (ok) return { yards: y, ok: true };
      var near = pool.filter(function (c) { return same(c.yards, y) >= 4; }), conf = near.filter(function (c) { return c.ok; });
      if (conf.length) return { yards: conf[0].yards.slice(), ok: true };
      var o = y.slice(); for (var i = 0; i < 9; i++) { var tally = {}, best = y[i], bn = y[i] == null ? 0 : 1.5; tally[y[i]] = bn;
        near.forEach(function (c) { var v = c.yards[i]; if (v == null) return; tally[v] = (tally[v] || 0) + 1; if (tally[v] > bn) { bn = tally[v]; best = v; } }); o[i] = best; }
      return { yards: o, ok: false }; };
    var tees = ref.tees.map(function (t) { var f2 = fix(t.yards, t.ok, alts), nm = t.name, un = t.unnamed;
      if (un || TEE_NAMES.indexOf(nm) < 0) { // a better name for this row from another pass
        var votes = {}, from = {}; alts.forEach(function (c) { if (!c.unnamed && same(c.yards, f2.yards) >= 5) { var k = snapName(c.name); votes[k] = (votes[k] || 0) + (TEE_NAMES.indexOf(k) >= 0 ? 2 : 1); (from[k] = from[k] || {})[c.p] = 1; } });
        var bk = Object.keys(votes).sort(function (a, b) { return votes[b] - votes[a]; })[0]; if (bk && Object.keys(from[bk]).length >= (un ? 2 : 1) && (un || TEE_NAMES.indexOf(bk) >= 0)) { nm = bk; un = false; } }
      return { name: nm, unnamed: un, yards: f2.yards, ord: t.ord, ok: f2.ok }; });
    // a confirmed row another pass saw but the lead pass missed
    alts.forEach(function (c) { if (c.ok && !tees.some(function (t) { return same(t.yards, c.yards) >= 4; }))
      tees.push({ name: c.unnamed ? 'Tee' : c.name, unnamed: c.unnamed, yards: c.yards.slice(), ok: true }); });
    tees.sort(function (a, b) { return sum(b.yards) - sum(a.yards); }); tees.forEach(function (t, i) { t.ord = i; });
    var pv = ref.pars ? fix(ref.pars, ref.parsOk, parAlts) : parAlts.length ? fix(parAlts[0].yards, parAlts[0].ok, parAlts) : null;
    return { half: half, tees: tees, pars: pv ? pv.yards : null, hcp: ref.hcp, empty: !tees.length && !pv, passes: reads.length,
      ok: tees.length > 0 && tees.every(function (t) { return t.ok; }) && !!pv && pv.ok };
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
      if (words.length >= 2 && !/\d{2,}/.test(l) && !/^(hole|par|handicap|hcp)\b/i.test(l) && words.join('').length >= 6) { var keep = words.filter(function (w) { return w.length > 1 || /[A-Z]/.test(w); });
        while (keep.length > 2 && /^[a-z]{1,3}$/.test(keep[keep.length - 1])) keep.pop(); return keep.join(' '); } }  // drop a stray 'oo' after the name
    return '';
  }
  var api = { readHalf: readHalf, parseHalf: parseHalf, halfCard: halfCard, halfFromCourse: halfFromCourse, mergeHalves: mergeHalves, autoLinks: autoLinks, sameName: sameName, guessName: guessName, parseCard: parseCard, parseWords: parseWords, readCard: readCard, snapName: snapName, tokens: tokens, holesOf: holesOf, cleanName: cleanName, blankCourse: blankCourse, fromScan: fromScan, clean: clean, prefill: prefill,
    mergeCourses: mergeCourses, holesPlayed: holesPlayed, teeTotal: teeTotal, pad: pad, sum: sum };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.COURSES = api;
})(this);
