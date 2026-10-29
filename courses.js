// Saved courses (typed in: par + yardages per tee box). Pure functions (no DOM). v89: the scorecard photo reader is gone.
// Course: { id, name, pars: [18], hcp: [18]?, tees: [{ name, yards: [18] }], updated }
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
      o.tees = tees.map(function (t, i) { return { name: names[i], yards: pad(t && t.yards) }; }); if (!Array.isArray(o.pars)) o.pars = pad([]);
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
    var o = { id: c.id, name: String(c.name || '').trim() || 'Course', pars: pad(c.pars).map(num), tees: kept.map(function (t, i) { return { name: names[i], yards: pad(t.yards).map(num) }; }), updated: new Date().toISOString() };
    if (c.hcp && c.hcp.some(function (v) { return v != null && v !== ''; })) o.hcp = pad(c.hcp).map(num);
    return o;
  }
  // tee boxes worth saving: a name or at least one distance (a blank one added by mistake is dropped)
  function keptTees(tees) { return (tees || []).filter(function (t) { return t && (!noName(t.name) || pad(t.yards).some(function (v) { return v != null && v !== ''; })); }); }
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
  var api = { blankCourse: blankCourse, clean: clean, prefill: prefill,
    migrate: migrate, byRecent: byRecent, lastUsed: lastUsed, keptTees: keptTees, nameTees: nameTees, noName: noName, MAIN: MAIN, TEE_CHIPS: TEE_CHIPS,
    mergeCourses: mergeCourses, holesPlayed: holesPlayed, teeTotal: teeTotal, pad: pad, sum: sum };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.COURSES = api;
})(this);
