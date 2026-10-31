// Saved courses (typed in: par + yardages per tee box). Pure functions (no DOM). v89: the scorecard photo reader is gone.
// Course: { id, name, pars: [18], hcp: [18]?, tees: [{ name, yards: [18], rt?, total? }], updated }
// v113: a course imported from GolfCore also has src: 'golfcore', gcId (GolfCore slug), gcUrl, ogKey (finder-list key), holes, city, and edited: true once changed by hand
(function (root) {
  function sum(a) { return a.reduce(function (t, v) { return t + (+v || 0); }, 0); }
  function pad(a) { var o = (a || []).slice(0, 18); while (o.length < 18) o.push(null); return o; }

  // ---- saved courses ----
  // A tee box with no real name (manual entry left blank, or an old 'Tee' / 'Tee 1' placeholder) is called this; it can be renamed
  var MAIN = 'Main tees', TEE_CHIPS = ['Black', 'Blue', 'White', 'Gold', 'Red', 'Green'];
  function blankCourse(name) { return { id: 'c' + Date.now() + Math.floor(Math.random() * 1000), name: name || '', pars: pad([]), tees: [{ name: '', yards: pad([]) }], updated: new Date().toISOString() }; }
  function noName(n) { return !String(n || '').trim() || /^tee$/i.test(String(n).trim()); }
  // Unique tee names within a course ('White', 'White 2'); blanks become 'Main tees'
  function nameTees(tees) {
    var seen = {};
    return tees.map(function (t) { var b = noName(t.name) ? MAIN : String(t.name).trim(), n = b, k = 1;
      while (seen[n.toLowerCase()]) { k++; n = b + ' ' + k; } seen[n.toLowerCase()] = 1; return n; });
  }
  // Saved courses from older versions: unnamed tee sets get a name (no numbers change). Returns { courses, changed }.
  function migrate(list) {
    var changed = false;
    var out = (Array.isArray(list) ? list : []).filter(function (c) { return c && typeof c === 'object'; }).map(function (c) {
      var tees = Array.isArray(c.tees) && c.tees.length ? c.tees : [{ name: '', yards: pad([]) }];
      var single = tees.length === 1 && /^tee \d+$/i.test(String(tees[0].name || '').trim()); // a lone scanned row with no printed name
      var names = single ? [MAIN] : nameTees(tees);
      var same = tees === c.tees && tees.every(function (t, i) { return t && t.name === names[i] && Array.isArray(t.yards); });
      if (same) return c;
      changed = true;
      var o = {}; Object.keys(c).forEach(function (k) { o[k] = c[k]; });
      o.tees = tees.map(function (t, i) { var x = { name: names[i], yards: pad(t && t.yards) }; if (t && t.rt) x.rt = t.rt; if (t && t.total) x.total = t.total; return x; }); if (!Array.isArray(o.pars)) o.pars = pad([]);
      return o;
    });
    return { courses: out, changed: changed };
  }
  // Most recently used first: the latest round played there (by course id, or same name for rounds before saved courses), or when the course was saved/edited
  function lastUsed(c, rounds) {
    var t = String(c.updated || ''), nm = String(c.name || '').trim().toLowerCase();
    (rounds || []).forEach(function (r) { if (!r || !r.date) return; if (r.courseId ? r.courseId === c.id : nm && String(r.course || '').trim().toLowerCase() === nm) { if (String(r.date) > t) t = String(r.date); } });
    return t;
  }
  function byRecent(list, rounds) {
    return (list || []).map(function (c, i) { return { c: c, t: lastUsed(c, rounds), i: i }; })
      .sort(function (a, b) { return a.t < b.t ? 1 : a.t > b.t ? -1 : a.i - b.i; }).map(function (x) { return x.c; });
  }
  function holesPlayed(c) { var n = 0; for (var i = 0; i < 18; i++) if (c.pars[i] != null || c.tees.some(function (t) { return t.yards[i] != null; })) n = i + 1; return n; }
  function teeTotal(t, from, to) { return sum((t.yards || []).slice(from || 0, to == null ? 18 : to)); }
  function clean(c) { // what gets stored
    var kept = keptTees(c.tees), names = nameTees(kept);
    if (!kept.length) { kept = [{ name: '', yards: pad([]) }]; names = [MAIN]; }
    var o = { id: c.id, name: String(c.name || '').trim() || 'Course', pars: pad(c.pars).map(num), tees: kept.map(function (t, i) { var x = { name: names[i], yards: pad(t.yards).map(num) };
      if (t.rt && t.rt.length) x.rt = t.rt; if (t.total) x.total = t.total; return x; }), updated: new Date().toISOString() };
    if (c.hcp && c.hcp.some(function (v) { return v != null && v !== ''; })) o.hcp = pad(c.hcp).map(num);
    META.forEach(function (k) { if (c[k] != null && c[k] !== '') o[k] = c[k]; }); // v113: where an imported course came from (GolfCore) and whether Scott has edited it
    return o;
  }
  // tee boxes worth saving: a name or at least one distance (a blank one added by mistake is dropped)
  function keptTees(tees) { return (tees || []).filter(function (t) { return t && (!noName(t.name) || pad(t.yards).some(function (v) { return v != null && v !== ''; })); }); }
  // v113: extra fields kept on an imported course (tee boxes may also carry rt: [{ g, rating, slope }] and total yards)
  var META = ['src', 'gcId', 'gcUrl', 'ogKey', 'holes', 'city', 'edited'];
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
  // v113: tee colour dot. Colour words in a tee name, in order, at most two (e.g. "Blue/White" → two-tone). Other words
  // (Men's, Women's, Ladies, Combo, Tees, 2017, …) are ignored. No colour word → [] (shown as a plain white circle).
  var TEE_COLORS = { black: '#222', blue: '#3d6fc4', navy: '#24407a', white: '#fff', red: '#d0443a', maroon: '#7d2630', burgundy: '#7d2630',
    gold: '#d9b23c', yellow: '#efd23a', green: '#3f8f4f', silver: '#c3c7cc', grey: '#9aa0a6', gray: '#9aa0a6', orange: '#ec8a2f',
    purple: '#7b4fb0', copper: '#b8733a', bronze: '#a87a3c', tan: '#d2b48c', pink: '#ec8fb5', teal: '#2f9a96', brown: '#7a5232', platinum: '#d9dcdf' };
  function teeColors(name) {
    var out = []; String(name || '').toLowerCase().split(/[^a-z]+/).forEach(function (w) { var c = TEE_COLORS[w]; if (c && out.indexOf(c) < 0 && out.length < 2) out.push(c); });
    return out;
  }
  var api = { teeColors: teeColors, TEE_COLORS: TEE_COLORS, blankCourse: blankCourse, clean: clean, prefill: prefill,
    migrate: migrate, byRecent: byRecent, lastUsed: lastUsed, keptTees: keptTees, nameTees: nameTees, noName: noName, MAIN: MAIN, TEE_CHIPS: TEE_CHIPS,
    mergeCourses: mergeCourses, holesPlayed: holesPlayed, teeTotal: teeTotal, pad: pad, sum: sum };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.COURSES = api;
})(this);
