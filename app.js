/* Golf Shot Tracker - UI (v2: shot table per hole). Data lives in localStorage on the phone. */
(function () {
  'use strict';
  var KEY = 'golfsg.rounds.v1', CUR = 'golfsg.current.v1';
  // Location choices (row = where the shot is played FROM)
  var LOCS = [['fairway', 'Fairway'], ['rough', 'Rough'], ['bunker', 'Bunker'], ['green', 'Green'],
    ['hazard', 'Hazard'], ['ob', 'OB'], ['holed', 'In the hole'], ['deep', 'Deep rough'], ['trees', 'Trees']];
  var LOC_SHORT = { tee: 'Tee', fairway: 'Fairway', rough: 'Rough', bunker: 'Bunker', green: 'Green', hazard: 'Hazard',
    ob: 'OB', holed: 'In the hole', deep: 'Deep rough', trees: 'Trees' };
  var DIRS = [['', '–'], ['L', 'L'], ['R', 'R'], ['S', 'S'], ['O', 'O']]; // Left, Right, Short, Over
  var CAT_NAME = { tee: 'Off the tee', approach: 'Approach', short: 'Short game', putting: 'Putting' };

  var rounds = load();
  var view = { screen: 'home', roundId: localStorage.getItem(CUR), hole: 0, menu: null };

  function load() {
    var rs;
    try { rs = JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { rs = []; }
    // Migrate v1 holes {yards, shots} -> v2 {rows}
    var changed = false;
    rs.forEach(function (r) {
      (r.holes || []).forEach(function (h) {
        if (!h.rows) { h.rows = SG.shotsToRows(h); delete h.shots; delete h.yards; changed = true; }
        if (!h.par) { h.par = 4; changed = true; }
      });
    });
    if (changed) localStorage.setItem(KEY, JSON.stringify(rs));
    return rs;
  }
  function save() { localStorage.setItem(KEY, JSON.stringify(rounds)); }
  function round() { return rounds.filter(function (r) { return r.id === view.roundId; })[0]; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
  function fmtSG(v) { var s = (Math.round(v * 100) / 100).toFixed(2); return (v > 0.004 ? '+' : '') + (s === '-0.00' ? '0.00' : s); }
  function sgCls(v) { return v > 0.004 ? 'pos' : v < -0.004 ? 'neg' : ''; }
  function toPar(n) { return n === 0 ? 'E' : n > 0 ? '+' + n : String(n); }
  function unit(lie) { return lie === 'green' ? 'ft' : 'yd'; }
  function toast(msg) {
    var t = document.getElementById('toast'); t.textContent = msg; t.className = 'show';
    clearTimeout(toast._t); toast._t = setTimeout(function () { t.className = ''; }, 1800);
  }
  function emptyHole() { return { par: 4, rows: [{ loc: 'tee', dist: '', dir: '', pen: false }] }; }
  function newRound(course) {
    var r = { id: 'r' + Date.now(), date: new Date().toISOString(), course: course || '', holes: [] };
    for (var i = 0; i < 18; i++) r.holes.push(emptyHole());
    rounds.unshift(r); save();
    view.roundId = r.id; localStorage.setItem(CUR, r.id);
    goHole(0, true);
  }
  function goHole(i, focus) {
    view.screen = 'hole'; view.hole = Math.max(0, Math.min(17, i)); view.menu = null;
    render(); window.scrollTo(0, 0);
    var h = round().holes[view.hole];
    if (focus && h.rows.length === 1 && h.rows[0].dist === '') focusDist(0);
  }
  function focusDist(k) { var el = document.querySelector('input[data-row="' + k + '"]'); if (el) el.focus(); }
  function started(h) { return h.rows.length > 1 || h.rows[0].dist !== ''; }

  // ---------- rendering ----------
  function render() {
    var el = document.getElementById('app');
    if (view.screen === 'home' || !round()) el.innerHTML = homeHTML();
    else if (view.screen === 'hole') el.innerHTML = holeHTML();
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

  function holeHTML() {
    var r = round(), h = r.holes[view.hole], a = SG.analyzeHole(h), S = SG.summarize(r);
    var out = '<div class="topbar"><button data-act="prev" aria-label="Previous hole"' + (view.hole === 0 ? ' disabled' : '') + '>‹</button>' +
      '<div class="title"><b>' + (r.course ? esc(r.course) : 'Round') + '</b><span>' +
      (S.holesDone ? 'Total ' + S.strokes + ' (' + toPar(S.toPar) + ') thru ' + S.holesDone : 'No holes finished yet') + '</span></div>' +
      '<button data-act="next" aria-label="Next hole"' + (view.hole === 17 ? ' disabled' : '') + '>›</button></div>';

    out += '<div class="holecard"><div class="hc-head"><h2>Hole ' + (view.hole + 1) + '</h2>' +
      '<div class="par"><span>Par</span>' + [3, 4, 5].map(function (p) {
        return '<button data-act="par" data-v="' + p + '" class="' + (h.par === p ? 'sel' : '') + '">' + p + '</button>'; }).join('') + '</div></div>';

    out += '<div class="srow shead"><span class="c-n">#</span><span class="c-d">Dist</span><span class="c-l">Loc</span><span class="c-x">LRSO</span><span class="c-p">P</span><span class="c-del"></span></div>';
    var holedAt = -1;
    h.rows.forEach(function (row, k) { if (holedAt < 0 && row.loc === 'holed') holedAt = k; });
    h.rows.forEach(function (row, k) { out += rowHTML(h, a, row, k, holedAt); });

    if (a.done) {
      out += '<div class="hole-done">Score <b>' + a.strokes + '</b> (' + toPar(a.strokes - h.par) + ') · SG <span class="' + sgCls(a.sg) + '">' + fmtSG(a.sg) + '</span></div>';
    } else {
      out += '<div id="hint" class="hint">' + hintText(h, a) + '</div>';
      out += '<button class="addshot big" data-act="addShot">Add Shot ⊕</button>';
    }
    out += '</div>';
    out += view.hole < 17
      ? '<button class="' + (a.done ? 'primary ' : '') + 'big" data-act="next">' + (started(r.holes[view.hole + 1]) ? 'Hole ' + (view.hole + 2) + ' ›' : 'Add Hole ' + (view.hole + 2) + ' ⊕') + '</button>'
      : '<button class="primary big" data-act="summary">Finish round – see stats</button>';
    out += '<div class="row sub"><button class="txt" data-act="home">Home</button><button class="txt" data-act="summary">Scorecard &amp; stats</button></div>';
    out += '<p class="help muted">Each row is where you hit FROM. Row 1 is the tee (hole length). Dist = yards to the pin (feet on the green). ' +
      'LRSO = how the shot before missed (Left, Right, Short, Over). P = penalty stroke (+1), e.g. a drop. OB = +1, re-hit from the same spot. Pick "In the hole" to finish.</p>';
    return out;
  }

  function rowHTML(h, a, row, k, holedAt) {
    var tee = k === 0, ob = row.loc === 'ob', holed = row.loc === 'holed', dead = holedAt >= 0 && k > holedAt;
    var bad = a.bad === k;
    var shotNo = k + 1;
    var out = '<div class="srow' + (bad ? ' bad' : '') + (dead ? ' dead' : '') + '" data-k="' + k + '">';
    out += '<button class="c-n" data-act="menu" data-k="' + k + '" aria-label="Row options">' + (holed ? '⛳' : shotNo) + '</button>';
    // Dist
    if (holed) out += '<span class="c-d holedtxt">–</span>';
    else if (ob) out += '<span class="c-d obtxt">' + (prevDist(h, k)) + '</span>';
    else out += '<span class="c-d"><input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="3" data-row="' + k + '" value="' + esc(row.dist) + '" aria-label="Distance row ' + shotNo + '">' +
      '<i class="u">' + (row.loc === 'green' ? 'ft' : 'yd') + '</i></span>';
    // Loc
    if (tee) out += '<span class="c-l teetxt">Tee</span>';
    else out += '<span class="c-l' + (holed ? ' wide' : '') + '"><select data-f="loc" data-k="' + k + '" aria-label="Location row ' + shotNo + '">' +
      (row.loc ? '' : '<option value="" selected>–</option>') +
      LOCS.map(function (l) { return '<option value="' + l[0] + '"' + (row.loc === l[0] ? ' selected' : '') + '>' + l[1] + '</option>'; }).join('') + '</select></span>';
    // LRSO
    if (holed) { /* location spans the LRSO and P columns */ }
    else if (tee) out += '<span class="c-x"></span>';
    else out += '<span class="c-x"><select data-f="dir" data-k="' + k + '" aria-label="Miss direction row ' + shotNo + '">' +
      DIRS.map(function (d) { return '<option value="' + d[0] + '"' + ((row.dir || '') === d[0] ? ' selected' : '') + '>' + d[1] + '</option>'; }).join('') + '</select></span>';
    // P
    if (holed) { /* spanned */ }
    else if (tee) out += '<span class="c-p"></span>';
    else out += '<span class="c-p"><button class="pen' + (row.pen || ob ? ' on' : '') + '" data-act="pen" data-k="' + k + '"' + (ob ? ' disabled' : '') + ' aria-label="Penalty row ' + shotNo + '">' + (row.pen || ob ? '+1' : '') + '</button></span>';
    // Delete
    out += '<span class="c-del">' + (tee ? '' : '<button class="del" data-act="del" data-k="' + k + '" aria-label="Delete row ' + shotNo + '">⌫</button>') + '</span>';
    out += '</div>';
    // info line: result of the shot played from this row
    out += '<div class="sinfo" data-info="' + k + '">' + (dead ? '' : infoHTML(a.shots[k])) + '</div>';
    if (view.menu === k) {
      out += '<div class="rowmenu">' + (k > 0 ? '<button data-act="insBefore" data-k="' + k + '">Insert shot above</button>' : '') +
        '<button data-act="insAfter" data-k="' + k + '">Insert shot below</button><button data-act="menu" data-k="' + k + '">Close</button></div>';
    }
    return out;
  }
  function infoHTML(s) {
    if (!s) return '';
    var info = s.pen === 'ob' ? ' · went OB' : s.end.lie === 'holed' ? ' · holed it!' : (s.start.lie === 'green' ? '' : ' · hit ' + s.hit + ' yd');
    return CAT_NAME[s.cat] + info + ' · SG <b class="' + sgCls(s.sg) + '">' + fmtSG(s.sg) + '</b>';
  }
  function prevDist(h, k) {
    // OB replays from the spot of the shot that went OB (walk back past other OB rows)
    for (var j = k - 1; j >= 0; j--) if (h.rows[j].loc !== 'ob') return (h.rows[j].dist === '' ? '?' : h.rows[j].dist) + ' ' + (h.rows[j].loc === 'green' ? 'ft' : 'yd');
    return '';
  }
  function hintText(h, a) {
    if (a.bad === 0) return 'Enter the hole length (yards) in row 1.';
    if (a.bad != null) {
      var row = h.rows[a.bad];
      return 'Row ' + (a.bad + 1) + ': ' + (!row.loc ? 'pick a location.' : 'enter the distance to the pin.');
    }
    return 'Hit the next shot, then tap Add Shot. Holed it? Pick "In the hole" in the last row.';
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
      if (started(h)) { txt = a.done ? a.strokes : '…'; cls = !a.done ? '' : a.strokes < h.par ? 'under' : a.strokes > h.par ? 'over' : ''; }
      out += '<button class="' + cls + '" data-act="goHole" data-i="' + i + '">' + (i + 1) + ' · P' + h.par + '<b>' + txt + '</b></button>';
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
      stat('Approach misses L / R', S.apprLeft + ' / ' + S.apprRight) +
      stat('Approach short / over', S.apprShort + ' / ' + S.apprOver) + '</div>';
    out += '<button class="primary big" data-act="csv" style="margin-top:16px">Export this round (CSV)</button>';
    out += '<button class="big" data-act="backHole">Back to the round</button>';
    out += '<button class="big danger" data-act="delRound">Delete this round</button>';
    out += '<p class="help muted">How it works: each shot is compared with how many strokes a PGA Tour player averages to hole out from the same distance and lie ' +
      '(Mark Broadie\'s published tables). A shot that leaves you better off than average gains strokes. Penalties count against the shot that caused them.</p>';
    return out;
  }
  function stat(l, v) { return '<div class="stat"><b>' + v + '</b><span>' + l + '</span></div>'; }

  // ---------- CSV ----------
  function localDate(iso) { var t = new Date(iso); return t.getFullYear() + '-' + ('0' + (t.getMonth() + 1)).slice(-2) + '-' + ('0' + t.getDate()).slice(-2); }
  function csvFor(list) {
    var rows = [['date', 'course', 'hole', 'par', 'hole_yards', 'shot', 'from_lie', 'from_dist', 'from_unit', 'to_lie', 'to_dist', 'to_unit',
      'distance_hit_yd', 'miss', 'penalty', 'category', 'bucket', 'expected_before', 'expected_after', 'strokes_gained', 'hole_score']];
    list.forEach(function (r) {
      r.holes.forEach(function (h, hi) {
        var a = SG.analyzeHole(h);
        a.shots.forEach(function (s) {
          rows.push([localDate(r.date), r.course, hi + 1, h.par, SG.holeYards(h), s.n, s.start.lie, s.start.dist, unit(s.start.lie), s.end.lie,
            s.end.dist, s.end.lie === 'holed' ? '' : unit(s.end.lie), s.hit == null ? '' : s.hit, s.dir, s.pen, CAT_NAME[s.cat], s.bucket,
            s.eStart.toFixed(3), s.eEnd.toFixed(3), s.sg.toFixed(3), a.done ? a.strokes : '']);
        });
      });
    });
    return rows.map(function (row) { return row.map(function (v) {
      v = String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(','); }).join('\r\n') + '\r\n';
  }
  function exportCSV(list, name) {
    var csv = csvFor(list), file;
    try { file = new File([csv], name, { type: 'text/csv' }); } catch (e) { file = null; }
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
  function fileName(r) { return 'golf-' + (r ? localDate(r.date) + (r.course ? '-' + r.course.replace(/[^a-z0-9]+/gi, '-') : '') : 'all-rounds') + '.csv'; }

  // ---------- actions ----------
  function newRow(h, after) {
    var prev = h.rows[after];
    return { loc: prev && prev.loc === 'green' ? 'green' : '', dist: '', dir: '', pen: false };
  }

  document.addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-act]'); if (!b || b.disabled) return;
    var act = b.getAttribute('data-act'), v = b.getAttribute('data-v'), k = +b.getAttribute('data-k');
    var r = round(), h = r && r.holes[view.hole];
    switch (act) {
      case 'new': newRound(document.getElementById('course').value.trim()); return;
      case 'resume': view.roundId = localStorage.getItem(CUR); goHole(firstOpenHole(round()), true); return;
      case 'open': view.roundId = b.getAttribute('data-id'); view.screen = 'summary'; break;
      case 'home': view.screen = 'home'; break;
      case 'csvall': exportCSV(rounds, fileName(null)); return;
      case 'csv': exportCSV([r], fileName(r)); return;
      case 'delRound':
        if (!confirm('Delete this round for good?')) return;
        rounds = rounds.filter(function (x) { return x !== r; }); save();
        if (localStorage.getItem(CUR) === r.id) localStorage.removeItem(CUR);
        view.screen = 'home'; break;
      case 'summary': view.screen = 'summary'; render(); window.scrollTo(0, 0); return;
      case 'backHole': goHole(view.hole); return;
      case 'goHole': goHole(+b.getAttribute('data-i')); return;
      case 'prev': goHole(view.hole - 1); return;
      case 'next': goHole(view.hole + 1, true); return;
      case 'par': h.par = +v; save(); break;
      case 'addShot': {
        var a = SG.analyzeHole(h);
        if (a.bad != null) { toast(hintText(h, a)); var bk = a.bad; render(); focusDist(bk); return; }
        h.rows.push(newRow(h, h.rows.length - 1)); save(); view.menu = null; render();
        focusDist(h.rows.length - 1); return;
      }
      case 'pen': h.rows[k].pen = !h.rows[k].pen; save(); break;
      case 'del':
        if (!confirm('Delete row ' + (k + 1) + ' (' + (h.rows[k].dist || '') + ' ' + LOC_SHORT[h.rows[k].loc || 'fairway'] + ')?')) return;
        h.rows.splice(k, 1); view.menu = null; save(); break;
      case 'menu': view.menu = view.menu === k ? null : k; break;
      case 'insBefore': h.rows.splice(k, 0, newRow(h, k - 1)); view.menu = null; save(); render(); focusDist(k); return;
      case 'insAfter': h.rows.splice(k + 1, 0, newRow(h, k)); view.menu = null; save(); render(); focusDist(k + 1); return;
    }
    render();
  });

  document.addEventListener('change', function (ev) {
    var t = ev.target, f = t.getAttribute('data-f'); if (!f) return;
    var h = round().holes[view.hole], k = +t.getAttribute('data-k'), row = h.rows[k];
    if (f === 'loc') {
      var v = t.value;
      if (v === 'holed' && k < h.rows.length - 1) {
        if (!confirm('Mark as holed? The ' + (h.rows.length - 1 - k) + ' row(s) after it will be removed.')) { render(); return; }
        h.rows.splice(k + 1);
      }
      var was = row.loc;
      row.loc = v;
      if (was === 'ob' && v !== 'ob') row.pen = false;
      if (v === 'ob') { row.pen = true; row.dist = ''; }
      else if (v === 'holed') { row.dist = ''; row.dir = ''; row.pen = false; }
      save(); render();
      if ((v === 'holed')) { var a = SG.analyzeHole(h); if (a.done) toast('Hole done: ' + a.strokes + ' (' + toPar(a.strokes - h.par) + ')'); }
      else if (v !== 'ob' && row.dist === '') focusDist(k);
    } else if (f === 'dir') { row.dir = t.value; save(); render(); }
  });

  // Distance typing: update data without re-rendering (keeps the keyboard up)
  document.addEventListener('input', function (ev) {
    var t = ev.target; if (!t.hasAttribute || !t.hasAttribute('data-row')) return;
    t.value = t.value.replace(/[^0-9]/g, '').slice(0, 3);
    var h = round().holes[view.hole], k = +t.getAttribute('data-row');
    h.rows[k].dist = t.value === '' ? '' : +t.value; save();
    refreshInfo(h);
  });
  // Update the per-shot info lines in place (no re-render, so taps and the keyboard aren't disturbed)
  function refreshInfo(h) {
    var a = SG.analyzeHole(h), hint = document.getElementById('hint');
    if (hint) hint.textContent = hintText(h, a);
    h.rows.forEach(function (row, k) {
      var el = document.querySelector('.sinfo[data-info="' + k + '"]'); if (el) el.innerHTML = infoHTML(a.shots[k]);
      var rw = document.querySelector('.srow[data-k="' + k + '"]'); if (rw) rw.classList.toggle('bad', a.bad === k);
      var ob = rw && rw.querySelector('.obtxt'); if (ob) ob.textContent = prevDist(h, k);
    });
  }

  function firstOpenHole(r) {
    for (var i = 0; i < 18; i++) { var a = SG.analyzeHole(r.holes[i]); if (!a.done) return i; }
    return 17;
  }

  render();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    // When a new version is installed, reload once so the update shows right away.
    var hadController = !!navigator.serviceWorker.controller, reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (hadController && !reloaded) { reloaded = true; location.reload(); }
    });
    window.addEventListener('load', function () { navigator.serviceWorker.register('./sw.js').catch(function () {}); });
  }
  window.__golf = { csvFor: csvFor, rounds: function () { return rounds; } };
})();
