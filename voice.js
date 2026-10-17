// Voice shot entry: turn a spoken phrase into shot fields, and fields into hole rows.
// Pure functions only (no DOM) so they can be unit tested: VOICE.parse(text), VOICE.apply(hole, parsed).
// A phrase describes ONE stroke: [club] [distance it was hit FROM] [where it ended] [how far from the pin after] [miss direction]
//   "7 iron 150 green 20 feet left"  "driver fairway"  "putt 12 feet in the hole"  "penalty"  "layup"
(function (root) {
  var CLUBS = ['Driver', '3W', '5W', '7W', '4H', '5H', '5i', '6i', '7i', '8i', '9i', 'PW', '52', '54', '56', '58', '60'];
  var ONES = { zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
    thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
  var TENS = { twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

  // "one fifty" -> 150, "a hundred and twenty" -> 120, "fifty six" -> 56, "one oh five" -> 105, "fifty six forty" -> "56 40"
  function wordsToNumbers(s) {
    var t = s.split(' '), out = [], i = 0;
    var isNum = function (w) { return w in ONES || w in TENS || w === 'hundred' || /^\d+$/.test(w); };
    while (i < t.length) {
      var w = t[i];
      if (!(w in ONES || w in TENS || w === 'hundred' || (w === 'a' && t[i + 1] === 'hundred'))) { out.push(w); i++; continue; }
      if (w === 'oh' && !(i > 0 && /^\d+$/.test(out[out.length - 1]))) { out.push(w); i++; continue; } // "oh" alone is not a number
      var val = 0, cur = 0, used = 0;
      var two = function (j) { // a 1..99 value starting at j -> [value, tokens used]
        var a = t[j]; if (a in TENS) { if (t[j + 1] in ONES && ONES[t[j + 1]] > 0 && ONES[t[j + 1]] < 10) return [TENS[a] + ONES[t[j + 1]], 2]; return [TENS[a], 1]; }
        if (a in ONES) return [ONES[a], 1]; return null; };
      if (w === 'a') { i++; w = 'hundred'; cur = 1; }
      if (w === 'hundred') { val = (cur || 1) * 100; i++; if (t[i] === 'and') i++; var r0 = t[i] && two(i); if (r0) { val += r0[0]; i += r0[1]; } out.push(String(val)); continue; }
      var r = two(i); cur = r[0]; used = r[1]; i += used;
      if (t[i] === 'hundred') { val = cur * 100; i++; if (t[i] === 'and') i++; var r2 = t[i] && two(i); if (r2) { val += r2[0]; i += r2[1]; } out.push(String(val)); continue; }
      // "one fifty" / "two ten" / "one oh five": a single digit followed by a 10..99 (or "oh" + digit) = hundreds
      if (cur >= 1 && cur <= 2 && used === 1 && t[i] === 'oh' && t[i + 1] in ONES && ONES[t[i + 1]] < 10) { out.push(String(cur * 100 + ONES[t[i + 1]])); i += 2; continue; }
      if (cur >= 1 && cur <= 2 && used === 1 && t[i] && (t[i] in TENS || (t[i] in ONES && ONES[t[i]] >= 10))) { var r3 = two(i); out.push(String(cur * 100 + r3[0])); i += r3[1]; continue; }
      out.push(String(cur));
    }
    return out.join(' ').replace(/\b(1|2) (\d\d)\b(?= (?:yards?|yds?|out|to go|in the|on the|from)|$)/g, function (m, a, b) { return String(+a * 100 + +b); });
  }

  function norm(text) {
    var s = ' ' + String(text || '').toLowerCase()
      .replace(/(\d)\s*°/g, '$1 degree ').replace(/(\d+)\s*'/g, '$1 feet ').replace(/[’‘]/g, "'")
      .replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
    s = s.replace(/ (\d+)(i|w|h|yds?|yards?|ft|feet|foot) /g, ' $1 $2 ').replace(/ (\d+)(i|w|h) /g, ' $1 $2 '); // 7i -> 7 i, 150yds -> 150 yds
    s = wordsToNumbers(s.trim());
    // speech sound-alikes for clubs
    s = (' ' + s + ' ').replace(/ (for|fore) (hybrid|rescue|h) /g, ' 4 $2 ').replace(/ (ate|ait) iron /g, ' 8 iron ').replace(/ (tree|free) wood /g, ' 3 wood ')
      .replace(/ (fly|by|hi) wood /g, ' 5 wood ').replace(/ won wood /g, ' 1 wood ').replace(/ sex iron /g, ' 6 iron ')
      .replace(/ lay ?up | laid up | lay it up /g, ' layup ').replace(/ out of bounds | out a bounds | o b /g, ' ob ')
      .replace(/ p w | pw /g, ' pitching wedge ').replace(/ sw /g, ' sand wedge ').replace(/ lw /g, ' lob wedge ').replace(/ gw /g, ' gap wedge ')
      .replace(/ puts? /g, ' putt ').replace(/ \d+ ?(?:ft|foot|feet) /g, function (m) { return ' ' + m.trim().match(/\d+/)[0] + ' feet '; })
      .replace(/ (yds?|yard|yards) /g, ' yards ').replace(/ degrees? | deg /g, ' degree ');
    return s.replace(/\s+/g, ' ').trim();
  }

  var CLUB_RX = [
    [/\b(?:driver|1 wood|one wood|big dog)\b/, function () { return 'Driver'; }],
    [/\b(3|5|7) (?:wood|w|metal)\b/, function (m) { return m[1] + 'W'; }],
    [/\b(4|5) (?:hybrid|rescue|h)\b/, function (m) { return m[1] + 'H'; }],
    [/\b([5-9]) (?:iron|irons|i)\b/, function (m) { return m[1] + 'i'; }],
    [/\bpitching wedge\b|\bpitching\b|\bp wedge\b|\bpitch wedge\b/, function () { return 'PW'; }],
    [/\bgap wedge\b|\bapproach wedge\b/, function () { return '52'; }],
    [/\bsand wedge\b|\bsand iron\b/, function () { return '56'; }],
    [/\blob wedge\b/, function () { return '60'; }],
    [/\b(52|54|56|58|60) (?:degree|wedge)(?: wedge)?\b/, function (m) { return m[1]; }]
  ];
  var LOC_RX = [ // order matters: "deep rough" before "rough", holed phrases before everything
    ['holed', /\b(?:in the hole|in the cup|in hole|into the hole|holed(?: out)?|hold out|made it|made|make|drained(?: it)?|sank(?: it)?|sunk(?: it)?|went in|chip in|chipped in|holed it|that's in|its in|it's in|in the jar|ace|hole in one)\b/],
    ['ob', /\bob\b|\bout of bounds\b/],
    ['deep', /\bdeep rough\b|\bthick rough\b|\bheavy rough\b/],
    ['trees', /\btrees?\b|\bwoods\b|\bforest\b/],
    ['bunker', /\bbunker\b|\bsand\b|\btrap\b|\bsand trap\b|\bbeach\b/],
    ['hazard', /\bhazard\b|\bwater\b|\bpenalty area\b|\bcreek\b|\blake\b|\bpond\b|\bwet\b/],
    ['rough', /\brough\b|\bruff\b/],
    ['green', /\bgreen\b|\bdance floor\b|\bon the dance floor\b/],
    ['fairway', /\bfairway\b|\bfare way\b|\bfairways\b|\bshort grass\b/]
  ];
  function findDir(s) {
    var side = /\b(?:left|lift)\b/.test(s) ? 'left' : /\b(?:right|write)\b/.test(s) ? 'right' : '';
    var depth = /\b(?:short)\b/.test(s) ? 'short' : /\b(?:long|over|past|through|beyond)\b/.test(s) ? 'long' : '';
    return depth + side;
  }

  function parse(text) {
    var raw = String(text || '').trim(), s = ' ' + norm(raw) + ' ', p = { raw: raw, heard: s.trim() };
    var used = [];
    var take = function (rx) { var m = s.match(rx); if (!m) return null; used.push(m[0]); s = s.slice(0, m.index) + ' # ' + s.slice(m.index + m[0].length); return m; };
    // club
    for (var i = 0; i < CLUB_RX.length && !p.club; i++) { var m = take(CLUB_RX[i][0]); if (m) p.club = CLUB_RX[i][1](m); }
    if (take(/\b(?:putt|putter|putted|putting)\b/)) p.putt = true;
    if (take(/\blayup\b/)) p.layup = true;
    if (take(/\b(?:penalty(?: stroke| drop)?|drop|dropped|took a drop|plus one|one stroke penalty)\b/)) p.pen = true;
    // start lie: "from the rough", "out of the bunker"
    var fm = s.match(/\b(?:from|out of|off) (?:the |a )?(fairway|rough|deep rough|bunker|sand|trap|trees|hazard|water)\b/);
    if (fm) { p.lie = { sand: 'bunker', trap: 'bunker', water: 'hazard', 'deep rough': 'deep' }[fm[1]] || fm[1]; take(new RegExp(fm[0])); }
    // "over the green", "short of the green", "missed the green left": a miss, not a green in regulation
    s = s.replace(/\b(over|past|through|long of|short of|left of|right of|missed|missed the green|off) (?:the )?green\b/g, function (m, w) { p.offGreen = true; return ' ' + ({ 'long of': 'long', 'short of': 'short', 'left of': 'left', 'right of': 'right', missed: '', 'missed the green': '', off: '' }[w] != null ? { 'long of': 'long', 'short of': 'short', 'left of': 'left', 'right of': 'right', missed: '', 'missed the green': '', off: '' }[w] : w) + ' '; });
    // where it ended (+ its position in the phrase, to tell "from" numbers from "after" numbers)
    var locAt = -1;
    for (var j = 0; j < LOC_RX.length && !p.result; j++) { var mm = s.match(LOC_RX[j][1]); if (mm) { p.result = LOC_RX[j][0]; locAt = mm.index; s = s.slice(0, mm.index) + ' @ ' + s.slice(mm.index + mm[0].length); locAt = s.indexOf(' @ '); } }
    if (p.result === 'ob' && p.pen) p.pen = false; // OB already counts its stroke
    // a bare loft before another number: "56 40 bunker" = 56 degree from 40
    if (!p.club && !p.putt) { var bw = s.match(/\b(52|54|56|58|60) (?=(\d+)\b)/); if (bw) { p.club = bw[1]; s = s.slice(0, bw.index) + ' # ' + s.slice(bw.index + bw[0].length); if (locAt > bw.index) locAt = s.indexOf(' @ '); } }
    // numbers with units
    var nums = [], rx = /\b(\d{1,3})(?: (yards|feet))?\b/g, n;
    while ((n = rx.exec(s))) nums.push({ v: +n[1], u: n[2] === 'feet' ? 'ft' : n[2] === 'yards' ? 'yd' : '', at: n.index });
    nums.forEach(function (x) {
      var after = locAt >= 0 && x.at > locAt;
      if (p.result === 'holed') { if (p.from == null) { p.from = x.v; p.fromUnit = x.u; } return; }
      if (!after && p.from == null) { p.from = x.v; p.fromUnit = x.u; }
      else if (p.to == null) { p.to = x.v; p.toUnit = x.u; }
    });
    var dir = findDir(s); if (dir && p.result !== 'holed') p.dir = dir;
    if (p.putt && !p.result && (p.to != null || p.dir)) p.result = 'green'; // a missed putt stays on the green
    if (p.result === 'holed' && p.club && !p.putt) p.holedx = true;
    var left = s.replace(/[#@]/g, ' ').replace(/\b(?:\d{1,3}|yards|feet|left|lift|right|write|short|long|over|past|through|beyond|the|a|an|on|in|it|to|of|and|from|out|i|hit|my|with|was|is|just|then|uh|um|ended|ending|up|go|shot|ball|went|landed|about|around|off|pin|flag|hole|yard|degree|wedge|iron|wood|hybrid|so)\b/g, ' ').replace(/\s+/g, ' ').trim();
    if (left) p.unknown = left;
    p.empty = !(p.club || p.putt || p.layup || p.pen || p.result || p.from != null || p.to != null || p.dir || p.lie);
    return p;
  }

  function blank(v) { return v === '' || v == null; }
  function copyRows(rows) { return rows.map(function (r) { var o = {}; for (var k in r) o[k] = r[k]; return o; }); }
  function conv(v, from, to) { if (v == null) return v; if (from === 'yd' && to === 'ft') return Math.round(v * 3); if (from === 'ft' && to === 'yd') return Math.max(1, Math.round(v / 3)); return v; }

  // Put a parsed phrase onto a hole's rows. Returns { rows, k (shot row), rk (result row or -1), warn: [] } and never mutates the input.
  function apply(hole, p) {
    var rows = copyRows(hole.rows || []), warn = [], par = Number(hole.par);
    if (!rows.length) rows.push({ loc: 'tee', dist: '', dir: '', pen: false });
    var last = rows.length - 1, L = rows[last];
    if (L.loc === 'holed' || L.loc === 'holedx') return { rows: rows, k: -1, rk: -1, warn: ['This hole is already in the hole – tap Edit this hole or go to the next hole.'], done: true };
    var k = last, reuse = -1;
    // An empty row at the bottom (from Add Shot) is the "where did it end up" slot of the shot above it,
    // unless the phrase gives a new FROM distance for a later shot.
    if (last > 0 && blank(L.loc) && blank(L.dist) && !L.club) {
      var prev = rows[last - 1], prevD = blank(prev.dist) ? null : +prev.dist;
      var isLater = p.from != null && prevD != null && p.from !== prevD;
      var wantsSlot = !p.putt && (p.result || p.to != null || p.dir || p.from == null);
      if (!isLater && wantsSlot && p.result !== 'holed') { k = last - 1; reuse = last; }
    }
    var R = rows[k];
    // The bottom row already has a different distance: the phrase is the NEXT shot (its lie may still need picking)
    if (reuse < 0 && p.from != null && !blank(R.dist) && R.loc !== 'ob') {
      var nu = (p.putt || R.loc === 'green') && p.fromUnit !== 'yd' ? 'ft' : 'yd', ru = R.loc === 'green' ? 'ft' : 'yd';
      if (!(nu === ru && +R.dist === conv(p.from, p.fromUnit || nu, nu))) { R = { loc: p.putt ? 'green' : '', dist: '', dir: '', pen: false }; rows.push(R); k = rows.length - 1; }
    }
    if (p.putt && blank(R.loc) && k > 0) R.loc = 'green';
    if (p.lie && k > 0 && p.result !== 'holed') R.loc = p.lie;
    var shotGreen = R.loc === 'green' || (p.putt && k > 0);
    var shotUnit = shotGreen ? 'ft' : 'yd';
    if (p.from != null) R.dist = conv(p.from, p.fromUnit || shotUnit, shotUnit);
    if (p.club) { if (!shotGreen) R.club = p.club; }
    if (p.layup) { if (k === 0 && par !== 3) R.layup = true; else warn.push(k === 0 ? 'Layup is only for par 4s and 5s.' : 'Layup only applies to the tee shot.'); }
    var rk = -1;
    if (p.result === 'holed') {
      var onGreen = R.loc === 'green' || (p.putt && !p.holedx);
      R.loc = k === 0 ? 'holedx' : (onGreen ? 'holed' : 'holedx');
      if (R.loc === 'holedx' && p.from != null && (p.fromUnit === 'ft')) R.dist = conv(p.from, 'ft', 'yd');
      if (blank(R.dist)) warn.push('Say or type the distance of the shot that went in.');
      if (p.pen && k > 0) R.pen = true;
    } else if (p.result || p.to != null || p.dir || (p.pen && k === 0)) {
      var res = p.result || (shotGreen ? 'green' : '');
      var nr = reuse >= 0 ? rows[reuse] : { loc: '', dist: '', dir: '', pen: false };
      nr.loc = res || nr.loc || '';
      if (p.to != null && res !== 'ob') { var u = res === 'green' ? 'ft' : 'yd'; nr.dist = conv(p.to, p.toUnit || u, u); }
      if (res === 'ob') { nr.dist = ''; nr.pen = false; }
      if (p.dir) nr.dir = p.dir;
      if (p.pen && res !== 'ob') nr.pen = true;
      if (reuse < 0) { rows.push(nr); rk = rows.length - 1; } else rk = reuse;
    } else if (p.pen) {
      if (k > 0) R.pen = true; else warn.push('A penalty goes on the shot after the tee shot.');
    }
    return { rows: rows, k: k, rk: rk, warn: warn };
  }

  var LOC_NAME = { tee: 'Tee', fairway: 'Fairway', rough: 'Rough', deep: 'Deep rough', trees: 'Trees', bunker: 'Bunker', green: 'Green', hazard: 'Hazard',
    ob: 'OB re-hit', holed: 'In the hole', holedx: 'In the hole' };
  var DIR_NAME = { short: 'Short', long: 'Long', left: 'Left', right: 'Right', shortleft: 'Short left', shortright: 'Short right', longleft: 'Long left', longright: 'Long right' };
  function clubName(c) { var m = /^(\d)(W|H|i)$/.exec(c); if (m) return m[1] + ' ' + { W: 'wood', H: 'hybrid', i: 'iron' }[m[2]]; return c === 'PW' ? 'Pitching wedge' : /^\d\d$/.test(c) ? c + '°' : c; }
  function unitOf(loc) { return loc === 'green' || loc === 'holed' ? 'ft' : 'yd'; }
  function fmtD(v, loc) { return blank(v) ? '' : v + (unitOf(loc) === 'ft' ? '’' : ' yd'); }
  // Plain-language fields for the confirmation card: [[label, value], ...]
  function describe(hole, res, p) {
    var out = []; if (res.k < 0) return out;
    var R = res.rows[res.k], N = res.rk >= 0 ? res.rows[res.rk] : null;
    out.push(['Shot', String(res.k + 1) + (res.k === 0 ? ' (tee)' : R.loc && R.loc !== 'holed' && R.loc !== 'holedx' ? ' · ' + LOC_NAME[R.loc] : '')]);
    if (R.loc === 'green' || R.loc === 'holed') out.push(['Club', 'Putter']); else if (R.club) out.push(['Club', clubName(R.club)]);
    if (!blank(R.dist)) out.push(['From', fmtD(R.dist, R.loc === 'holedx' ? 'fairway' : R.loc)]);
    if (R.loc === 'holed' || R.loc === 'holedx') out.push(['Result', 'In the hole!']);
    if (N) { out.push(['Ended', N.loc ? LOC_NAME[N.loc] : '–']); if (!blank(N.dist)) out.push(['To pin', fmtD(N.dist, N.loc)]); if (N.dir) out.push(['Miss', DIR_NAME[N.dir]]); if (N.pen) out.push(['Penalty', '+1']); }
    if (!N && R.pen && p && p.pen) out.push(['Penalty', '+1']);
    if (R.layup && p && p.layup) out.push(['Layup', 'Yes (not in SG)']);
    return out;
  }

  var api = { parse: parse, apply: apply, describe: describe, norm: norm, CLUBS: CLUBS, LOC_NAME: LOC_NAME, DIR_NAME: DIR_NAME };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.VOICE = api;
})(this);
