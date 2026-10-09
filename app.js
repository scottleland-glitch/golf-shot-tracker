/* Golf Shot Tracker - UI. All data lives in localStorage on the phone. */
(function () {
  'use strict';
  var KEY = 'golfsg.rounds.v1', CUR = 'golfsg.current.v1';
  var LIES = [['green', 'Green'], ['fairway', 'Fairway'], ['rough', 'Rough'], ['deep', 'Deep rough'],
    ['sand', 'Bunker'], ['recovery', 'Trees / recovery'], ['hazard', 'In hazard']];
  var LIE_NAME = { tee: 'Tee', green: 'Green', fairway: 'Fairway', rough: 'Rough', deep: 'Deep rough',
    sand: 'Bunker', recovery: 'Trees', hazard: 'Hazard', holed: 'Holed' };
  var PENS = [['none', 'None'], ['water', 'Water'], ['lateral', 'Lateral'], ['ob', 'OB']];
  var PEN_NAME = { none: '', water: 'Water +1', lateral: 'Lateral +1', ob: 'OB +1 (re-hit)' };
  var CAT_NAME = { tee: 'Off the tee', approach: 'Approach', short: 'Short game', putting: 'Putting' };

  var rounds = load();
  var view = { screen: 'home', roundId: localStorage.getItem(CUR), hole: 0, setup: null, draft: null };

  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { return []; } }
  function save() { localStorage.setItem(KEY, JSON.stringify(rounds)); }
  function round() { return rounds.filter(function (r) { return r.id === view.roundId; })[0]; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
  function fmtSG(v) { var s = (Math.round(v * 100) / 100).toFixed(2); return (v > 0.004 ? '+' : '') + (s === '-0.00' ? '0.00' : s); }
  function sgCls(v) { return v > 0.004 ? 'pos' : v < -0.004 ? 'neg' : ''; }
  function toPar(n) { return n === 0 ? 'E' : n > 0 ? '+' + n : String(n); }
  function unit(lie) { return lie === 'green' ? 'ft' : 'yd'; }
  function toast(msg) {
    var t = document.getElementById('toast'); t.textContent = msg; t.className = 'show';
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.className = ''; }, 1600);
  }
  function newRound(course) {
    var r = { id: 'r' + Date.now(), date: new Date().toISOString(), course: course || '', holes: [] };
    for (var i = 0; i < 18; i++) r.holes.push({ par: null, yards: null, shots: [] });
    rounds.unshift(r); save();
    view.roundId = r.id; localStorage.setItem(CUR, r.id);
    goHole(0);
  }
  function goHole(i) {
    view.screen = 'hole'; view.hole = Math.max(0, Math.min(17, i)); view.draft = null;
    var h = round().holes[view.hole];
    view.setup = h.yards == null ? { par: h.par || guessPar(), yards: '' } : null;
    render(); window.scrollTo(0, 0);
  }
  function guessPar() { return 4; }
  function curPos(h, upto) {
    var a = SG.analyzeHole({ par: h.par, yards: h.yards, shots: h.shots.slice(0, upto) });
    return a.shots.length ? a.shots[a.shots.length - 1].end : { lie: 'tee', dist: h.yards };
  }
  function freshDraft(h, editIndex) {
    if (editIndex != null) {
      var s = h.shots[editIndex];
      return { idx: editIndex, lie: s.pen === 'ob' || s.lie === 'holed' ? null : s.lie, side: s.side || '', pen: s.pen || 'none',
        dist: s.lie === 'holed' || s.pen === 'ob' ? '' : String(s.dist) };
    }
    var pos = curPos(h, h.shots.length);
    return { idx: null, lie: pos.lie === 'green' ? 'green' : null, side: '', pen: 'none', dist: '' };
  }

  // ---------- rendering ----------
  function render() {
    var el = document.getElementById('app');
    if (view.screen === 'home' || !round()) el.innerHTML = homeHTML();
    else if (view.screen === 'hole') el.innerHTML = view.setup ? setupHTML() : holeHTML();
    else el.innerHTML = summaryHTML();
  }

  function homeHTML() {
    var cur = rounds.filter(function (r) { return r.id === localStorage.getItem(CUR); })[0];
    var h = '<h1>⛳ Golf Shot Tracker</h1><p class="muted">Track every shot. See where you gain and lose strokes.</p>';
    if (cur) {
      var S = SG.summarize(cur);
      h += '<button class="primary big" data-act="resume">Continue round' + (cur.course ? ' – ' + esc(cur.course) : '') +
        '<br><small>' + S.holesDone + ' holes done</small></button>';
    }
    h += '<h2>New round</h2><input type="text" id="course" placeholder="Course name (optional)" autocomplete="off">' +
      '<button class="' + (cur ? '' : 'primary ') + 'big" data-act="new">Start new round</button>';
    h += '<h2>Past rounds</h2>';
    if (!rounds.length) h += '<p class="muted">No rounds yet.</p>';
    rounds.forEach(function (r) {
      var S = SG.summarize(r);
      h += '<button class="hist" data-act="open" data-id="' + r.id + '"><span>' + new Date(r.date).toLocaleDateString() +
        (r.course ? ' · ' + esc(r.course) : '') + '<br><small class="muted">' + S.holesDone + ' holes</small></span><span>' +
        (S.holesDone ? S.strokes + ' (' + toPar(S.toPar) + ')' : '–') + '<br><small class="' + sgCls(S.sgTotal) + '">SG ' + fmtSG(S.sgTotal) + '</small></span></button>';
    });
    if (rounds.length) h += '<button class="big" data-act="csvall">Export all rounds (CSV)</button>';
    return h;
  }

  function topbar(sub) {
    return '<div class="topbar"><button data-act="prev" aria-label="Previous hole"' + (view.hole === 0 ? ' disabled' : '') + '>‹</button>' +
      '<div class="title"><b>Hole ' + (view.hole + 1) + '</b><span>' + sub + '</span></div>' +
      '<button data-act="next" aria-label="Next hole"' + (view.hole === 17 ? ' disabled' : '') + '>›</button></div>';
  }
  function footer() {
    return '<div class="row sub"><button class="txt" data-act="home">Home</button><button class="txt" data-act="summary">Scorecard &amp; stats</button></div>';
  }

  function setupHTML() {
    var s = view.setup;
    var h = topbar('Set up hole');
    h += '<div class="label">Par</div><div class="grid g3">' + [3, 4, 5].map(function (p) {
      return '<button data-act="par" data-v="' + p + '" class="' + (s.par === p ? 'sel' : '') + '">Par ' + p + '</button>'; }).join('') + '</div>';
    h += '<div class="label">Hole length (yards to the pin from the tee)</div>';
    h += '<div class="display" id="disp">' + (s.yards || '<span class="muted">–</span>') + ' <small>yd</small></div>' + keypad();
    h += '<button class="primary big" data-act="startHole">' + (round().holes[view.hole].yards == null ? 'Start hole' : 'Save hole') + '</button>' + footer();
    return h;
  }

  function keypad() {
    return '<div class="keypad">' + [1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map(function (n) { return '<button data-act="key" data-v="' + n + '">' + n + '</button>'; }).join('') +
      '<button data-act="key" data-v="B" aria-label="Backspace">⌫</button><button data-act="key" data-v="C" class="clr">Clear</button></div>';
  }

  function holeHTML() {
    var r = round(), h = r.holes[view.hole], a = SG.analyzeHole(h);
    var h1 = topbar('Par ' + h.par + ' · ' + h.yards + ' yd <button data-act="editHole">edit</button>');
    var list = shotsHTML(a);
    var out = h1;
    if (a.done && !view.draft) {
      var diff = a.strokes - h.par;
      out += '<div class="done"><b>' + a.strokes + '</b> &nbsp;(' + toPar(diff) + ')<br>Strokes gained this hole: <span class="' + sgCls(a.sg) + '">' + fmtSG(a.sg) + '</span>' +
        '</div>';
      out += view.hole < 17 ? '<button class="primary big" data-act="next">Next hole ›</button>' : '<button class="primary big" data-act="summary">Finish – see stats</button>';
      return out + list + footer();
    }
    if (!view.draft) view.draft = freshDraft(h, null);
    out += entryHTML(h, a);
    return out + list + footer();
  }

  function shotsHTML(a) {
    if (!a.shots.length) return '';
    var out = '<div class="label">Shots this hole – tap to fix</div><div class="shots">';
    a.shots.forEach(function (s, i) {
      var desc;
      if (s.pen === 'ob') desc = 'OB' + (s.side ? ' ' + (s.side === 'L' ? 'left' : 'right') : '') + ' – re-hit from ' + s.start.dist + ' ' + unit(s.start.lie);
      else if (s.end.lie === 'holed') desc = 'Holed from ' + s.start.dist + ' ' + unit(s.start.lie);
      else desc = s.end.dist + ' ' + unit(s.end.lie) + ' · ' + LIE_NAME[s.end.lie] + (s.side ? ' ' + s.side : '') +
        (s.pen !== 'none' ? ' · ' + PEN_NAME[s.pen] : '');
      if (s.hit != null && s.end.lie !== 'holed' && s.start.lie !== 'green') desc += '<br><small class="muted">hit ' + s.hit + ' yd · ' + CAT_NAME[s.cat] + '</small>';
      else desc += '<br><small class="muted">' + CAT_NAME[s.cat] + '</small>';
      out += '<button class="shot' + (view.draft && view.draft.idx === i ? ' editing' : '') + '" data-act="editShot" data-i="' + i + '"><span class="n">' + (i + 1) +
        '</span><span class="d">' + desc + '</span><span class="sg ' + sgCls(s.sg) + '">' + fmtSG(s.sg) + '</span></button>';
    });
    out += '</div>';
    return out;
  }

  function entryHTML(h, a) {
    var d = view.draft;
    var editing = d.idx != null;
    var n = editing ? d.idx + 1 : h.shots.length + 1;
    var pos = curPos(h, editing ? d.idx : h.shots.length);
    var out = '<div class="status">' + (editing ? 'Fixing shot ' + n : 'Shot ' + n) + ' from <b>' + pos.dist + ' ' + unit(pos.lie) + '</b> · ' + LIE_NAME[pos.lie] + '</div>';
    out += '<div class="label">Penalty?</div><div class="grid g4">' + PENS.map(function (p) {
      return '<button data-act="pen" data-v="' + p[0] + '" class="' + (d.pen === p[0] ? 'sel' : '') + '">' + p[1] + '</button>'; }).join('') + '</div>';
    if (d.pen === 'ob') {
      out += '<div class="note">Out of bounds: +1 penalty stroke and you hit again from the same spot (' + pos.dist + ' ' + unit(pos.lie) + ').</div>';
      out += sideHTML(d);
    } else {
      if (d.pen !== 'none') out += '<div class="note">+1 penalty stroke. Enter where you <u>drop</u>.</div>';
      out += '<div class="label">Where is the ball now?</div><div class="grid g4 lies">' + LIES.map(function (l) {
        return '<button data-act="lie" data-v="' + l[0] + '" class="' + (d.lie === l[0] ? 'sel' : '') + '">' + l[1] + '</button>'; }).join('') + '</div>';
      if (d.lie && d.lie !== 'fairway' && d.lie !== 'green') out += sideHTML(d);
      var u = d.lie === 'green' ? 'ft' : 'yd';
      out += '<div class="display" id="disp"><span class="dl">To pin</span> ' + (d.dist || '<span class="muted">–</span>') + ' <small>' + (u === 'ft' ? 'feet' : 'yards') + '</small></div>' + keypad();
    }
    out += '<div class="row save"><button class="big holed" data-act="holed">⛳ Holed</button><button class="primary big" data-act="saveShot">' + (editing ? 'Save fix' : 'Save shot ' + n) + '</button></div>';
    if (editing) out += '<div class="row"><button class="big" data-act="cancelEdit">Cancel</button><button class="big danger" data-act="delShot">Delete shot</button></div>';
    return out;
  }
  function sideHTML(d) {
    return '<div class="label">Missed which side?</div><div class="grid g2">' +
      '<button data-act="side" data-v="L" class="' + (d.side === 'L' ? 'sel' : '') + '">◀ Left</button>' +
      '<button data-act="side" data-v="R" class="' + (d.side === 'R' ? 'sel' : '') + '">Right ▶</button></div>';
  }

  function summaryHTML() {
    var r = round(), S = SG.summarize(r);
    var out = '<div class="topbar"><button class="txt" data-act="backHole">‹ Round</button><div class="title"><b>Round stats</b><span>' +
      new Date(r.date).toLocaleDateString() + (r.course ? ' · ' + esc(r.course) : '') + '</span></div><button class="txt" data-act="home">Home</button></div>';
    out += '<div class="big-score"><div class="s">' + (S.holesDone ? S.strokes : '–') + '</div>' +
      (S.holesDone ? toPar(S.toPar) + ' vs par · ' + S.holesDone + ' hole' + (S.holesDone === 1 ? '' : 's') + ' done' : 'No holes finished yet') + '</div>';
    out += '<div class="label">Scorecard – tap a hole to edit</div><div class="card">';
    r.holes.forEach(function (h, i) {
      var a = S.holes[i], cls = 'empty', txt = '·';
      if (h.shots.length) { txt = a.done ? a.strokes : '…'; cls = !a.done ? '' : a.strokes < h.par ? 'under' : a.strokes > h.par ? 'over' : ''; }
      out += '<button class="' + cls + '" data-act="goHole" data-i="' + i + '">' + (i + 1) + (h.par ? ' · P' + h.par : '') + '<b>' + txt + '</b></button>';
    });
    out += '</div>';
    out += '<h2>Strokes gained: <span class="' + sgCls(S.sgTotal) + '">' + fmtSG(S.sgTotal) + '</span></h2>' +
      '<p class="help muted">vs. a PGA Tour pro. Plus = better than a pro, minus = strokes lost.</p>';
    out += '<table><tr><th>Category</th><th class="num">Shots</th><th class="num">SG</th></tr>';
    ['tee', 'approach', 'short', 'putting'].forEach(function (k) {
      var c = S.cats[k];
      out += '<tr><td>' + CAT_NAME[k] + '</td><td class="num">' + c.n + '</td><td class="num ' + sgCls(c.sg) + '">' + fmtSG(c.sg) + '</td></tr>';
    });
    out += '</table><h3>By distance</h3><table><tr><th>From</th><th class="num">Shots</th><th class="num">SG</th></tr>';
    var groups = [['Approach', ['30-100 yd', '100-150 yd', '150-200 yd', '200+ yd']], ['Short game', ['0-30 yd']], ['Putting', ['0-5 ft', '5-15 ft', '15-30 ft', '30+ ft']]];
    groups.forEach(function (g) {
      out += '<tr><td colspan="3" style="background:#eee"><b>' + g[0] + '</b></td></tr>';
      g[1].forEach(function (b) {
        var c = S.buckets[b];
        out += '<tr><td>' + b + '</td><td class="num">' + c.n + '</td><td class="num ' + sgCls(c.sg) + '">' + (c.n ? fmtSG(c.sg) : '–') + '</td></tr>';
      });
    });
    out += '</table><h2>Stats</h2><div class="stat-grid">' +
      stat('Fairways hit', S.fwHit + ' / ' + S.fwTotal) +
      stat('Greens in reg.', S.gir + ' / ' + S.girHoles) +
      stat('Putts', S.putts) + stat('Penalty strokes', S.penalties) +
      stat('Tee misses L / R', S.teeLeft + ' / ' + S.teeRight) +
      stat('Approach misses L / R', S.apprLeft + ' / ' + S.apprRight) + '</div>';
    out += '<button class="primary big" data-act="csv" style="margin-top:16px">Export this round (CSV)</button>';
    out += '<button class="big" data-act="backHole">Back to the round</button>';
    out += '<button class="big danger" data-act="delRound">Delete this round</button>';
    out += '<p class="help muted">How it works: each shot is compared with how many strokes a PGA Tour player averages to hole out from the same distance and lie ' +
      '(Mark Broadie\'s published tables). A shot that leaves you better off than average gains strokes. Penalties count against the shot that caused them.</p>';
    return out;
  }
  function stat(l, v) { return '<div class="stat"><b>' + v + '</b><span>' + l + '</span></div>'; }

  // ---------- CSV ----------
  function csvFor(list) {
    var rows = [['date', 'course', 'hole', 'par', 'hole_yards', 'shot', 'from_lie', 'from_dist', 'from_unit', 'to_lie', 'to_dist', 'to_unit',
      'distance_hit_yd', 'side', 'penalty', 'category', 'bucket', 'expected_before', 'expected_after', 'strokes_gained', 'hole_score']];
    list.forEach(function (r) {
      r.holes.forEach(function (h, hi) {
        if (!h.shots.length) return;
        var a = SG.analyzeHole(h);
        a.shots.forEach(function (s) {
          rows.push([localDate(r.date), r.course, hi + 1, h.par, h.yards, s.n, s.start.lie, s.start.dist, unit(s.start.lie), s.end.lie,
            s.end.dist, s.end.lie === 'holed' ? '' : unit(s.end.lie), s.hit == null ? '' : s.hit, s.side, s.pen, CAT_NAME[s.cat], s.bucket,
            s.eStart.toFixed(3), s.eEnd.toFixed(3), s.sg.toFixed(3), a.done ? a.strokes : '']);
        });
      });
    });
    return rows.map(function (row) { return row.map(function (v) {
      v = String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(','); }).join('\r\n') + '\r\n';
  }
  function exportCSV(list, name) {
    var csv = csvFor(list);
    var file;
    try { file = new File([csv], name, { type: 'text/csv' }); } catch (e) { file = null; }
    // iPhone: the Share sheet lets you Save to Files, Mail, Excel, etc.
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: name }).catch(function (e) { if (e && e.name !== 'AbortError') download(csv, name); });
      return;
    }
    download(csv, name);
  }
  function download(csv, name) {
    var url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    var a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 4000);
    toast('CSV downloaded');
  }
  function localDate(iso) { var t = new Date(iso); return t.getFullYear() + '-' + ('0' + (t.getMonth() + 1)).slice(-2) + '-' + ('0' + t.getDate()).slice(-2); }
  function fileName(r) { return 'golf-' + (r ? localDate(r.date) + (r.course ? '-' + r.course.replace(/[^a-z0-9]+/gi, '-') : '') : 'all-rounds') + '.csv'; }

  // ---------- actions ----------
  function keyInto(str, v, max) {
    if (v === 'C') return '';
    if (v === 'B') return str.slice(0, -1);
    if (str.length >= max) return str;
    if (str === '0') str = '';
    return str + v;
  }

  document.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-act]'); if (!b || b.disabled) return;
    var act = b.getAttribute('data-act'), v = b.getAttribute('data-v');
    var r = round(), h = r && r.holes[view.hole], d = view.draft;
    switch (act) {
      case 'new': newRound(document.getElementById('course').value.trim()); return;
      case 'resume': view.roundId = localStorage.getItem(CUR); goHole(firstOpenHole(round())); return;
      case 'open': view.roundId = b.getAttribute('data-id'); view.screen = 'summary'; break;
      case 'home': view.screen = 'home'; view.draft = null; break;
      case 'csvall': exportCSV(rounds, fileName(null)); return;
      case 'csv': exportCSV([r], fileName(r)); return;
      case 'delRound':
        if (!confirm('Delete this round for good?')) return;
        rounds = rounds.filter(function (x) { return x !== r; }); save();
        if (localStorage.getItem(CUR) === r.id) localStorage.removeItem(CUR);
        view.screen = 'home'; break;
      case 'summary': view.screen = 'summary'; view.draft = null; render(); window.scrollTo(0, 0); return;
      case 'backHole': goHole(view.hole); return;
      case 'goHole': goHole(+b.getAttribute('data-i')); return;
      case 'prev': goHole(view.hole - 1); return;
      case 'next': goHole(view.hole + 1); return;
      case 'par': view.setup.par = +v; break;
      case 'key':
        if (view.setup) view.setup.yards = keyInto(view.setup.yards, v, 3);
        else if (d) d.dist = keyInto(d.dist, v, 3);
        break;
      case 'startHole':
        var y = parseInt(view.setup.yards, 10);
        if (!(y >= 40 && y <= 750)) { toast('Enter the hole length in yards (40–750)'); return; }
        h.par = view.setup.par; h.yards = y; view.setup = null; view.draft = null; save(); break;
      case 'editHole': view.setup = { par: h.par, yards: String(h.yards) }; view.draft = null; break;
      case 'lie': d.lie = v; if (v === 'fairway' || v === 'green') d.side = ''; break;
      case 'side': d.side = d.side === v ? '' : v; break;
      case 'pen': d.pen = v; break;
      case 'holed':
        var hs = { lie: 'holed', dist: 0, side: '', pen: 'none' };
        if (d && d.idx != null) {
          if (d.idx < h.shots.length - 1 && !confirm('Shots after this one will be removed. OK?')) return;
          h.shots.splice(d.idx, h.shots.length - d.idx, hs);
        } else { h.shots.push(hs); toast('Nice! Hole saved'); }
        view.draft = null; save(); break;
      case 'saveShot': if (!saveDraft(h)) return; render(); window.scrollTo(0, 0); return;
      case 'editShot': view.draft = freshDraft(h, +b.getAttribute('data-i')); render(); window.scrollTo(0, 0); return;
      case 'cancelEdit': view.draft = null; break;
      case 'delShot':
        if (!confirm('Delete shot ' + (d.idx + 1) + '?')) return;
        h.shots.splice(d.idx, 1); view.draft = null; save(); break;
    }
    render();
  });

  function firstOpenHole(r) {
    for (var i = 0; i < 18; i++) { var a = SG.analyzeHole(r.holes[i]); if (!a.done) return i; }
    return 17;
  }

  function saveDraft(h) {
    var d = view.draft, shot;
    if (d.pen === 'ob') {
      shot = { lie: 'ob', dist: 0, side: d.side, pen: 'ob' };
    } else {
      if (!d.lie) { toast('Pick where the ball is now'); return false; }
      var dist = parseInt(d.dist, 10);
      if (!(dist >= 0) || d.dist === '') { toast('Enter the distance to the pin'); return false; }
      if (d.lie !== 'green' && dist === 0) { toast('Distance must be more than 0'); return false; }
      if (d.lie !== 'fairway' && d.lie !== 'green' && !d.side && d.pen === 'none') { toast('Missed left or right?'); return false; }
      shot = { lie: d.lie, dist: dist, side: d.lie === 'fairway' || d.lie === 'green' ? '' : d.side, pen: d.pen };
    }
    if (d.idx != null) h.shots[d.idx] = shot; else h.shots.push(shot);
    view.draft = null; save();
    return true;
  }

  render();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', function () { navigator.serviceWorker.register('./sw.js').catch(function () {}); });
  }
  window.__golf = { csvFor: csvFor, rounds: function () { return rounds; } };
})();
