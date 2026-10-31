// v113: "Courses near me" – pure helpers (no DOM, no network) so they can be tested in node.
// The course finder list (data/us-courses.json) comes from OpenGolfAPI (ODbL): rows of [name, city, state, lat, lng, holes, par].
// Scorecards come from GolfCore (golfcore.org) and are turned into the app's saved-course shape (courses.js).
(function (root) {
  var N = 0, CITY = 1, ST = 2, LAT = 3, LNG = 4, HOLES = 5, PAR = 6;
  function rad(d) { return d * Math.PI / 180; }
  // distance in miles (great circle)
  function miles(lat1, lng1, lat2, lng2) {
    var dLat = rad(lat2 - lat1), dLng = rad(lng2 - lng1);
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 3958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  function fmtMi(mi) { return mi == null ? '' : (mi < 10 ? (Math.round(mi * 10) / 10).toFixed(1) : String(Math.round(mi))) + ' mi'; }
  // nearest n rows to a point: [{ i, mi }] closest first
  function nearest(rows, lat, lng, n) {
    var out = [];
    for (var i = 0; i < rows.length; i++) { var r = rows[i]; out.push({ i: i, mi: miles(lat, lng, r[LAT], r[LNG]) }); }
    out.sort(function (a, b) { return a.mi - b.mi; });
    return out.slice(0, n || 5);
  }
  function norm(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').trim(); }
  // name / town search: every word typed must appear in the name, town or state; names that start with the words first, then nearest (or A–Z)
  function search(rows, q, lat, lng, max) {
    var words = norm(q).split(' ').filter(Boolean); if (!words.length) return [];
    var hasPos = lat != null && lng != null, out = [];
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i], nm = norm(r[N]), hay = nm + ' ' + norm(r[CITY]) + ' ' + String(r[ST] || '').toLowerCase(), ok = true;
      for (var w = 0; w < words.length; w++) if (hay.indexOf(words[w]) < 0) { ok = false; break; }
      if (ok) out.push({ i: i, mi: hasPos ? miles(lat, lng, r[LAT], r[LNG]) : null, starts: nm.indexOf(words.join(' ')) === 0 ? 0 : 1, nm: nm });
    }
    out.sort(function (a, b) { return a.starts - b.starts || (hasPos ? a.mi - b.mi : a.nm < b.nm ? -1 : a.nm > b.nm ? 1 : 0); });
    return out.slice(0, max || 20);
  }
  function key(r) { return r[N] + '|' + r[LAT] + '|' + r[LNG]; }
  // ---- matching a finder-list course to a GolfCore course ----
  var FILLER = { golf: 1, club: 1, course: 1, courses: 1, country: 1, cc: 1, gc: 1, the: 1, links: 1, of: 1, and: 1, at: 1, g: 1, c: 1, resort: 1, municipal: 1, muni: 1, public: 1, private: 1, inc: 1, llc: 1 };
  function words(s) { return norm(s).split(' ').filter(function (w) { return w && !FILLER[w]; }); }
  // how alike two course names are, 0..1 (shared real words, ignoring "golf", "club", "country club" …)
  function nameScore(a, b) {
    var A = words(a), B = words(b); if (!A.length || !B.length) return norm(a) === norm(b) ? 1 : 0;
    var hit = 0; A.forEach(function (w) { if (B.indexOf(w) >= 0) hit++; });
    return hit / Math.max(A.length, B.length);
  }
  // row = finder-list course; list = GolfCore /courses?near= results. Returns { best, close, list } with each candidate's { score, mi }.
  // "close" = safe to use without asking: same name words and within about a mile.
  function match(row, list) {
    var c = (list || []).filter(function (g) { return g && g.slug; }).map(function (g) {
      var mi = g.lat != null && g.lng != null ? miles(row[LAT], row[LNG], g.lat, g.lng) : (g.miles != null ? g.miles : 99);
      return { g: g, score: nameScore(row[N], g.name), mi: mi };
    });
    c.sort(function (a, b) { return (b.score - a.score) || (a.mi - b.mi); });
    var best = c[0] || null;
    var close = !!best && ((best.score >= 0.99 && best.mi <= 3) || (best.score >= 0.6 && best.mi <= 1.5)) && !(c[1] && c[1].score === best.score && Math.abs(c[1].mi - best.mi) < 0.3 && c[1].g.slug !== best.g.slug);
    return { best: best, close: close, list: c };
  }
  // ---- GolfCore course → saved course { id, name, pars[18], hcp[18], tees:[{ name, yards[18], rt:[{ g, rating, slope }], total }], src, gcId, gcUrl, … } ----
  function pad(a) { var o = (a || []).slice(0, 18); while (o.length < 18) o.push(null); return o; }
  function num(v) { return v == null || v === '' || isNaN(+v) ? null : +v; }
  function byPos(holes) { var o = pad([]); (holes || []).forEach(function (h) { if (h && h.position >= 1 && h.position <= 18) o[h.position - 1] = h; }); return o; }
  function fromGolfCore(d, k, row) {
    var L = (d.layouts || [])[k || 0] || { holes: [], tees: [] }, ref = byPos(L.holes), tees = L.tees || [];
    var tb = tees.map(function (t) { return byPos(t.holes); });
    var n = 0; [ref].concat(tb).forEach(function (a) { a.forEach(function (h, i) { if (h) n = Math.max(n, i + 1); }); });
    if (!n) n = Math.min(18, +d.hole_count || 0);
    if ((d.layouts || []).length <= 1 && (+d.hole_count === 9 || +d.hole_count === 18) && n < +d.hole_count) n = +d.hole_count; // one course: its listed hole count
    var pars = pad([]), hcp = pad([]);
    function first(i, f) { if (ref[i] && num(ref[i][f]) != null) return num(ref[i][f]); for (var j = 0; j < tb.length; j++) if (tb[j][i] && num(tb[j][i][f]) != null) return num(tb[j][i][f]); return null; }
    for (var i = 0; i < n; i++) { pars[i] = first(i, 'par'); hcp[i] = first(i, 'stroke_index'); }
    // one tee chip per tee name (men's and women's ratings of the same tee share the hole yards)
    var out = [], seen = {};
    tees.forEach(function (t, j) {
      var nm = String(t.name || '').trim() || 'Tee', kk = nm.toLowerCase(), y = tb[j].map(function (h, i) { return i < n && h ? num(h.yards) : null; });
      var has = y.some(function (v) { return v != null; }), x = seen[kk];
      if (!x) { x = seen[kk] = { name: nm, yards: pad([]), rt: [] }; out.push(x); }
      if (has && (!x.yards.some(function (v) { return v != null; }) || t.gender === 'M')) x.yards = y;
      if (t.yards && !x.total) x.total = +t.yards;
      if (t.rating != null || t.slope != null) x.rt.push({ g: t.gender || '', rating: num(t.rating), slope: num(t.slope) });
    });
    out.forEach(function (x) { if (!x.rt.length) delete x.rt; if (!x.total) delete x.total; });
    if (!out.length) out.push({ name: '', yards: ref.map(function (h, i) { return i < n && h ? num(h.yards) : null; }) }); // carded but not rated: the club's own card
    var lname = (d.layouts || []).length > 1 && L.name && norm(L.name) !== norm(d.name) ? ' – ' + L.name : '';
    var c = { id: 'gc-' + d.slug + ((d.layouts || []).length > 1 ? '-' + (k || 0) : ''), name: String(d.name || (row && row[N]) || 'Course') + lname, pars: pars, tees: out, src: 'golfcore', gcId: d.slug, gcUrl: d.url || ('https://www.golfcore.org/courses/' + d.slug + '/'), holes: n };
    if (hcp.some(function (v) { return v != null; })) c.hcp = hcp;
    if (row) c.ogKey = key(row);
    if (d.city) c.city = d.city;
    return c;
  }
  // a tee's rating / slope for a chip: men's first, e.g. "74.9/144"
  function rtText(t) {
    var r = (t && t.rt || []).slice().sort(function (a, b) { return (a.g === 'M' ? 0 : 1) - (b.g === 'M' ? 0 : 1); }).filter(function (x) { return x.rating != null && x.slope != null; })[0];
    return r ? r.rating.toFixed(1) + '/' + r.slope : '';
  }
  // holes still blank (no par, or no yards for this tee) within the course's holes
  function gaps(c, teeName) {
    var t = (c.tees || []).filter(function (x) { return x.name === teeName; })[0] || (c.tees || [])[0] || { yards: [] }, n = +c.holes || 18, m = 0;
    for (var i = 0; i < n; i++) if (c.pars[i] == null || t.yards[i] == null) m++;
    return m;
  }
  var api = { miles: miles, fmtMi: fmtMi, nearest: nearest, search: search, key: key, norm: norm, nameScore: nameScore, match: match, fromGolfCore: fromGolfCore, rtText: rtText, gaps: gaps,
    COL: { name: N, city: CITY, state: ST, lat: LAT, lng: LNG, holes: HOLES, par: PAR } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.NEAR = api;
})(this);
