// Voice shot entry: turn a spoken phrase into shot fields, and fields into hole rows.
// Pure functions only (no DOM) so they can be unit tested: VOICE.parse(text), VOICE.apply(hole, parsed).
// A phrase describes the shot you're ABOUT to hit: [shot number] [club] [distance from the pin] [surface you hit from] [how the previous shot missed]
//   "third shot green 25 feet short"  "7 iron 150 fairway right"  "putt 12 feet in the hole"  "penalty"  "layup"
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

  // Ordinals / "shot N" -> the shot (row) number the phrase is about
  var ORD = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10 };
  var SHOT_RX = /\b(?:(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|1st|2nd|3rd|[4-9]th|10th)(?: (?:shot|stroke))?|(?:shot|stroke) (?:number |no )?(\d{1,2})|(?:number) (\d{1,2}) shot|tee shot|off the tee)\b/;

  // A phrase describes the shot Scott is ABOUT to hit (one row):
  //   [shot number] [club] [distance from the pin] [surface he's hitting from] [miss direction = how the PREVIOUS shot missed] [penalty = on the previous shot]
  function parse(text) {
    var raw = String(text || '').trim(), s = ' ' + norm(raw) + ' ', p = { raw: raw, heard: s.trim() };
    var take = function (rx) { var m = s.match(rx); if (!m) return null; s = s.slice(0, m.index) + ' # ' + s.slice(m.index + m[0].length); return m; };
    for (var i = 0; i < CLUB_RX.length && !p.club; i++) { var m = take(CLUB_RX[i][0]); if (m) p.club = CLUB_RX[i][1](m); }
    var sm = take(SHOT_RX);
    if (sm) { var sn = sm[1] ? (ORD[sm[1]] || parseInt(sm[1], 10)) : sm[2] ? +sm[2] : sm[3] ? +sm[3] : 1; if (sn >= 1 && sn <= 15) p.shot = sn; }
    if (take(/\b(?:putt|putter|putted|putting)\b/)) p.putt = true;
    if (take(/\blayup\b/)) p.layup = true;
    if (take(/\b(?:penalty(?: stroke| drop)?|drop|dropped|took a drop|plus one|one stroke penalty)\b/)) p.pen = true;
    // "over the green", "short of the green": a miss direction, not "on the green"
    var MISSW = { 'long of': 'long', 'short of': 'short', 'left of': 'left', 'right of': 'right', missed: '', 'missed the green': '', off: '' };
    s = s.replace(/\b(over|past|through|long of|short of|left of|right of|missed the green|missed|off) (?:the )?green\b/g, function (m, w) { p.offGreen = true; return ' ' + (w in MISSW ? MISSW[w] : w) + ' '; });
    if (/\b(?:on the )?tee box\b|\bfrom the tee\b/.test(s)) { take(/\b(?:on the )?tee box\b|\bfrom the tee\b/); p.loc = 'tee'; if (!p.shot) p.shot = 1; }
    for (var j = 0; j < LOC_RX.length && !p.loc; j++) { if (take(LOC_RX[j][1])) p.loc = LOC_RX[j][0]; }
    // v90: "deep rough 25 holed it" = the shot from the deep rough went in – keep the surface and mark it holed out
    if (p.loc === 'holed') for (var j2 = 1; j2 < LOC_RX.length; j2++) { if (LOC_RX[j2][0] !== 'ob' && take(LOC_RX[j2][1])) { p.loc = LOC_RX[j2][0]; p.holeOut = true; break; } }
    if (p.loc === 'ob' && p.pen) p.pen = false; // OB re-hit already counts its stroke
    if (p.loc === 'holed' && p.club && !p.putt) p.holedx = true;
    // a bare loft before a number: "56 40 bunker" = 56 degree from 40
    if (!p.club && !p.putt) { var bw = s.match(/\b(52|54|56|58|60) (?=(\d+)\b)/); if (bw) { p.club = bw[1]; s = s.slice(0, bw.index) + ' # ' + s.slice(bw.index + bw[0].length); } }
    var nums = [], rx = /\b(\d{1,3})(?: (yards|feet))?\b/g, n;
    while ((n = rx.exec(s))) nums.push({ v: +n[1], u: n[2] === 'feet' ? 'ft' : n[2] === 'yards' ? 'yd' : '' });
    var pick = nums.filter(function (x) { return x.u; })[0] || nums[0];
    if (pick) { p.dist = pick.v; p.distUnit = pick.u; if (nums.length > 1) p.extra = nums.filter(function (x) { return x !== pick; }).map(function (x) { return x.v; }); }
    var dir = findDir(s); if (dir && p.loc !== 'holed') p.dir = dir;
    if (p.holeOut && p.loc === 'green') { p.loc = 'holed'; delete p.holeOut; } // a putt that went in: same as before
    if (p.putt && !p.loc) p.loc = 'green';
    var left = s.replace(/[#@]/g, ' ').replace(/\b(?:\d{1,3}|yards|feet|left|lift|right|write|short|long|over|past|through|beyond|the|a|an|on|in|it|to|of|and|from|out|i|hit|my|with|was|is|just|then|uh|um|ended|ending|up|go|shot|ball|went|landed|about|around|off|pin|flag|hole|yard|degree|wedge|iron|wood|hybrid|so|im|i'm|am|number|missed|miss|stroke|next|now|this|one)\b/g, ' ').replace(/\s+/g, ' ').trim();
    if (left) p.unknown = left;
    p.empty = !(p.club || p.putt || p.layup || p.pen || p.loc || p.dist != null || p.dir || p.shot);
    return p;
  }

  function blank(v) { return v === '' || v == null; }
  function copyRows(rows) { return rows.map(function (r) { var o = {}; for (var k in r) o[k] = r[k]; return o; }); }
  function conv(v, from, to) { if (v == null || v === '') return v; v = +v; if (from === 'yd' && to === 'ft') return Math.round(v * 3); if (from === 'ft' && to === 'yd') return Math.max(1, Math.round(v / 3)); return v; }
  function unitOf(loc) { return loc === 'green' || loc === 'holed' ? 'ft' : 'yd'; }
  function isHoledLoc(l) { return l === 'holed' || l === 'holedx'; }
  function isHoledRow(r, k) { return !!r && (isHoledLoc(r.loc) || (k > 0 && !!r.holeOut && !!r.loc)); } // v90: "Hole out" box
  function incomplete(r, k) { return k === 0 ? blank(r.dist) : blank(r.loc) || (r.loc !== 'ob' && blank(r.dist)); }
  function newRow() { return { loc: '', dist: '', dir: '', pen: false }; }

  // Put a parsed phrase onto a hole's rows (never mutates the input).
  // Row k holds: shot k+1's distance from the pin, the surface it's hit from, its club - and (app model) dir/pen = how shot k (the row above) missed / its penalty.
  // Returns { rows, k (target row), rows touched in `touched`, created, warn: [], notes: [] }.
  function apply(hole, p) {
    var rows = copyRows(hole.rows || []), warn = [], notes = [], par = Number(hole.par);
    if (!rows.length) rows.push({ loc: 'tee', dist: '', dir: '', pen: false });
    var last = rows.length - 1, lastHoled = isHoledRow(rows[last], last);
    var fail = function (w) { return { rows: copyRows(hole.rows || []), k: -1, touched: [], warn: [w], notes: [], done: true }; };
    var t;
    if (p.shot) {
      t = p.shot - 1;
      if (t > rows.length) return fail('There’s no shot ' + p.shot + ' yet – the next shot is ' + (rows.length + 1) + '.');
      if (t === rows.length && lastHoled) return fail('This hole is already in the hole – tap Edit this hole or go to the next hole.');
    } else {
      t = -1;
      for (var i = 0; i < rows.length; i++) if (incomplete(rows[i], i)) { t = i; break; }
      if (rows.length === 1 && t < 0) t = 0; // only the tee row so far: the phrase is still about the tee shot / where it went
      if (t < 0 && (p.loc === 'holed' || p.holeOut) && last > 0 && !lastHoled) { // "made it": the last putt/chip went in, unless a new distance says otherwise
        var lu = unitOf(rows[last].loc), said = p.dist == null ? null : conv(p.dist, p.distUnit || lu, lu);
        if (said == null || said === +rows[last].dist) t = last;
      }
      if (t < 0) { if (lastHoled) return fail('This hole is already in the hole – tap Edit this hole or go to the next hole.'); t = rows.length; }
    }
    var touched = [], created = t === rows.length;
    if (created) rows.push(newRow());
    var touch = function (j) { if (touched.indexOf(j) < 0) touched.push(j); };
    var club = p.club, dist = p.dist, unit = p.distUnit, loc = p.loc;
    // The tee row's surface is always the tee: a surface said for shot 1 is where shot 2 will be hit from
    if (t === 0 && loc && loc !== 'tee' && loc !== 'holed') {
      var T = rows[0];
      if (club && !T.club) { T.club = club; club = null; touch(0); }
      if (p.layup) { if (par !== 3) { T.layup = true; touch(0); } else warn.push('Layup is only for par 4s and 5s.'); }
      if (rows.length === 1) { rows.push(newRow()); created = true; }
      t = 1; p = Object.assign({}, p, { layup: false });
    }
    var R = rows[t], before = { loc: R.loc, dist: R.dist };
    touch(t);
    if (t === 0) {
      if (dist != null) R.dist = conv(dist, unit || 'yd', 'yd');
      if (club) R.club = club;
      if (loc === 'holed') { R.loc = 'holedx'; }
      if (p.layup) { if (par !== 3) R.layup = true; else warn.push('Layup is only for par 4s and 5s.'); }
      if (p.dir) warn.push('A miss direction goes on the shot after the tee shot.');
      if (p.pen) warn.push('A penalty goes on the shot after the tee shot.');
    } else {
      var oldU = unitOf(R.loc);
      if (loc === 'holed') {
        var green = p.putt || R.loc === 'green' || R.loc === 'holed' || (!p.holedx && unit === 'ft');
        // v90: a row that already has its surface (Rough, Bunker...) keeps it and is marked "Hole out", so its lie isn't lost
        if (!green && R.loc && !isHoledLoc(R.loc)) R.holeOut = true;
        else { R.loc = green ? 'holed' : 'holedx'; delete R.holeOut; }
      } else if (p.holeOut && loc && loc !== 'tee') { R.loc = loc; R.holeOut = true; }
      else if (loc && loc !== 'tee') { R.loc = loc; if (isHoledLoc(loc)) delete R.holeOut; }
      else if (loc === 'tee') warn.push('Only shot 1 is from the tee.');
      if (p.putt && blank(R.loc)) R.loc = 'green';
      var u = unitOf(R.loc);
      if (R.loc === 'ob') { R.dist = ''; R.pen = false; if (dist != null) notes.push('OB re-hit: distance comes from the shot before.'); }
      else if (dist != null) R.dist = conv(dist, unit || u, u);
      else if (!blank(R.dist) && oldU !== u) R.dist = conv(R.dist, oldU, u); // surface changed units: keep the same distance
      if (club) { if (R.loc === 'green' || R.loc === 'holed') { if (club) notes.push('On the green the club is the putter.'); } else R.club = club; }
      if (p.dir) R.dir = p.dir;
      if (p.pen && R.loc !== 'ob') R.pen = true;
      if (p.layup) warn.push('Layup only applies to the tee shot.');
    }
    if (t > 0 && p.holeOut === false && R.holeOut) delete R.holeOut; // unticked on the edit card
    if (isHoledRow(R, t) && blank(R.dist)) warn.push('Say or type the distance of the shot that went in.');
    if (!created && !blank(before.dist) && String(before.dist) !== String(R.dist) && dist != null) notes.push('Replaces shot ' + (t + 1) + '’s ' + before.dist + ' ' + unitOf(before.loc) + '.');
    if (p.extra && p.extra.length) notes.push('Also heard ' + p.extra.join(', ') + ' – used ' + p.dist + '.');
    touched.sort(function (a, b) { return a - b; });
    return { rows: rows, k: t, touched: touched, created: created, warn: warn, notes: notes, rk: -1 };
  }

  var LOC_NAME = { tee: 'Tee', fairway: 'Fairway', rough: 'Rough', deep: 'Deep rough', trees: 'Trees', bunker: 'Bunker', green: 'Green', hazard: 'Hazard',
    ob: 'OB re-hit', holed: 'In the hole', holedx: 'In the hole' };
  var DIR_NAME = { short: 'Short', long: 'Long', left: 'Left', right: 'Right', shortleft: 'Short left', shortright: 'Short right', longleft: 'Long left', longright: 'Long right' };
  function clubName(c) { var m = /^(\d)(W|H|i)$/.exec(c); if (m) return m[1] + ' ' + { W: 'wood', H: 'hybrid', i: 'iron' }[m[2]]; return c === 'PW' ? 'Pitching wedge' : /^\d\d$/.test(c) ? c + '°' : c; }
  function fmtD(v, loc) { return blank(v) ? '' : v + (unitOf(loc) === 'ft' ? '’' : ' yd'); }
  // Confirmation card lines: [[label, value], ...] e.g. ['Shot 3', 'Green · 25’'], ['Shot 2 missed', 'Short']
  function describe(hole, res, p) {
    var out = []; if (res.k < 0) return out;
    res.touched.forEach(function (j) {
      var R = res.rows[j], parts = [];
      if (j > 0 && R.holeOut && !isHoledLoc(R.loc)) { parts.push(R.loc ? LOC_NAME[R.loc] : 'Surface ?'); parts.push((blank(R.dist) ? '' : fmtD(R.dist, R.loc) + ' ') + '– in the hole!'); }
      else if (isHoledLoc(R.loc)) parts.push((R.loc === 'holed' ? 'Putt' : j === 0 ? 'Ace' : 'Chip-in') + (blank(R.dist) ? '' : ' from ' + fmtD(R.dist, R.loc === 'holed' ? 'green' : 'fairway')) + ' – in the hole!');
      else { parts.push(j === 0 ? 'Tee' : R.loc ? LOC_NAME[R.loc] : 'Surface ?'); if (!blank(R.dist)) parts.push(fmtD(R.dist, R.loc)); }
      out.push(['Shot ' + (j + 1) + (j === res.k && res.created ? ' (new)' : ''), parts.join(' · ')]);
      if (R.club && R.loc !== 'green' && R.loc !== 'holed') out.push(['Shot ' + (j + 1) + ' club', clubName(R.club)]);
      if (j > 0 && R.dir) out.push(['Shot ' + j + ' missed', DIR_NAME[R.dir] || R.dir]);
      if (j > 0 && (R.pen || R.loc === 'ob')) out.push(['Shot ' + j + ' penalty', '+1']);
      if (j === 0 && R.layup) out.push(['Layup', 'Yes (not in SG)']);
    });
    return out;
  }

  var api = { unitOf: unitOf, clubName: clubName, parse: parse, apply: apply, describe: describe, norm: norm, CLUBS: CLUBS, LOC_NAME: LOC_NAME, DIR_NAME: DIR_NAME };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.VOICE = api;
})(this);
