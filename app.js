/* Golf Shot Tracker - UI (v4: shot rows + selectable SG baselines). Data lives in localStorage on the phone. */
(function () {
  'use strict';
  var KEY = 'golfsg.rounds.v1', CUR = 'golfsg.current.v1';
  // Location choices (row = where the shot is played FROM)
  // Row = one stroke, hit FROM this location. Last row = In the hole (with the distance of the stroke that went in).
  var LOCS = [['fairway', 'Fairway'], ['rough', 'Rough'], ['bunker', 'Bunker'], ['green', 'Green'],
    ['hazard', 'Hazard'], ['ob', 'OB re-hit'], ['holed', 'In the hole'], ['holedx', 'In the hole (chip/shot)'],
    ['deep', 'Deep rough'], ['trees', 'Trees']];
  var LOCS0 = [['tee', 'Tee'], ['holedx', 'In the hole (ace!)']];
  var LOC_SHORT = { tee: 'Tee', fairway: 'Fairway', rough: 'Rough', bunker: 'Bunker', green: 'Green', hazard: 'Hazard',
    ob: 'OB re-hit', holed: 'In the hole', holedx: 'In the hole', deep: 'Deep rough', trees: 'Trees' };
  // 8-way direction: where the previous shot ended relative to its target. Short = toward the golfer.
  var ARROW = { '': '–', long: '↑', longright: '↗', right: '→', shortright: '↘', short: '↓', shortleft: '↙', left: '←', longleft: '↖' };
  var DIR_GRID = [['longleft', 'long', 'longright'], ['left', '', 'right'], ['shortleft', 'short', 'shortright']];
  function dirName(d) { return d ? SG.DIR_NAME[d] : 'No direction'; }
  var CAT_NAME = { tee: 'Off the tee', approach: 'Approach', short: 'Short game', putting: 'Putting' };

  var rounds = load();
  var view = { screen: 'home', roundId: localStorage.getItem(CUR), hole: 0, menu: null };

  function load() {
    var rs;
    try { rs = JSON.parse(localStorage.getItem(KEY)) || []; } catch (e) { rs = []; }
    // Migrate older saves to v3 rows (one row = one stroke)
    var changed = false;
    rs.forEach(function (r) {
      if (r.v === 3) return;
      (r.holes || []).forEach(function (h) {
        if (h.shots) { h.rows = SG.v1ToRows(h); delete h.shots; delete h.yards; }
        else if (h.rows) h.rows = SG.migrateV2Rows(h.rows);
        else h.rows = [{ loc: 'tee', dist: '', dir: '', pen: false }];
        if (!h.par) h.par = 4;
        h.finished = SG.analyzeHole(h).complete;
      });
      r.v = 3; changed = true;
    });
    rs.forEach(function (r) {
      if (r.dv === 2) return;
      (r.holes || []).forEach(function (h) { (h.rows || []).forEach(function (row) { row.dir = SG.normDir(row.dir); }); });
      r.dv = 2; changed = true;
    });
    if (changed) localStorage.setItem(KEY, JSON.stringify(rs));
    return rs;
  }
  function blOf(r) { return SG.baseline(r && r.baseline).id; }
  function blName(id) { return SG.baseline(id).name; }
  function blLabel(id) { var b = SG.baseline(id); return b.name + (b.status === 'estimated' ? ' (estimated)' : ''); }
  function AH(h) { return SG.analyzeHole(h, blOf(round())); }
  function blSelect(id, sel) {
    return '<select id="' + id + '" class="blsel" data-f="baseline" aria-label="Compare against">' + SG.BASELINES.map(function (b) {
      return '<option value="' + b.id + '"' + (b.id === sel ? ' selected' : '') + '>' + blLabel(b.id) + '</option>'; }).join('') + '</select>';
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
  function emptyHole() { return { par: 4, finished: false, rows: [{ loc: 'tee', dist: '', dir: '', pen: false }] }; }
  function newRound(course) {
    var sel = document.getElementById('newbl');
    var r = { v: 3, dv: 2, id: 'r' + Date.now(), date: new Date().toISOString(), course: course || '', baseline: sel ? sel.value : 'pga', holes: [] };
    for (var i = 0; i < 18; i++) r.holes.push(emptyHole());
    rounds.unshift(r); save();
    view.roundId = r.id; localStorage.setItem(CUR, r.id);
    goHole(0, true);
  }
  function goHole(i, focus) {
    view.screen = 'hole'; view.hole = Math.max(0, Math.min(17, i)); view.menu = null; view.dirk = null; view.pinOpen = false;
    render(); window.scrollTo(0, 0);
    var h = round().holes[view.hole];
    if (focus && h.rows.length === 1 && h.rows[0].dist === '') focusDist(0);
  }
  function focusDist(k) { var el = document.querySelector('input[data-row="' + k + '"]'); if (el) el.focus(); }
  function started(h) { return h.rows.length > 1 || h.rows[0].dist !== '' || !!h.finished; }

  // ---------- rendering ----------
  function render() {
    var el = document.getElementById('app');
    if (view.screen !== 'summary') view.map = null;
    if (view.screen !== 'hole') view.pinOpen = false;
    document.body.classList.toggle('noscroll', !!(view.pinOpen && view.screen === 'hole'));
    if (view.screen === 'about') el.innerHTML = aboutHTML();
    else if (view.screen === 'home' || !round()) el.innerHTML = homeHTML();
    else if (view.screen === 'hole') el.innerHTML = holeHTML() + (view.pinOpen ? pinHTML() : '');
    else if (view.screen === 'about') el.innerHTML = aboutHTML();
    else el.innerHTML = summaryHTML() + (view.map ? mapHTML() : '');
    if (view.screen !== 'hole') document.body.classList.toggle('noscroll', !!(view.map && view.screen === 'summary'));
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
      '<label class="lbl" for="newbl">Compare my shots against</label>' + blSelect('newbl', 'pga') +
      '<button class="' + (cur ? '' : 'primary ') + 'big" data-act="new">Start new round</button>';
    h += '<h2>Past rounds</h2>';
    if (!rounds.length) h += '<p class="muted">No rounds yet.</p>';
    rounds.forEach(function (r) {
      var S = SG.summarize(r);
      h += '<button class="hist" data-act="open" data-id="' + r.id + '"><span>' + new Date(r.date).toLocaleDateString() +
        (r.course ? ' · ' + esc(r.course) : '') + '<br><small class="muted">' + S.holesDone + ' holes</small></span><span>' +
        (S.holesDone ? S.strokes + ' (' + toPar(S.toPar) + ')' : '–') + '<br><small class="' + sgCls(S.sgTotal) + '">SG ' + fmtSG(S.sgTotal) + ' <span class="muted">vs ' + esc(blName(blOf(r))) + '</span></small></span></button>';
    });
    if (rounds.length) h += '<button class="big" data-act="csvall">Export all rounds (CSV)</button>';
    h += '<button class="big" data-act="about">ⓘ About the numbers</button>';
    return h;
  }

  function holeHTML() {
    var r = round(), h = r.holes[view.hole], a = AH(h), S = SG.summarize(r, blOf(r)), fin = !!h.finished && a.complete;
    var out = '<div class="topbar"><button data-act="prev" aria-label="Previous hole"' + (view.hole === 0 ? ' disabled' : '') + '>‹</button>' +
      '<div class="title"><b>' + (r.course ? esc(r.course) : 'Round') + '</b><span>' +
      (S.holesDone ? 'Total ' + S.strokes + ' (' + toPar(S.toPar) + ') thru ' + S.holesDone : 'No holes finished yet') + '<br>SG vs ' + esc(blName(blOf(r))) + '</span></div>' +
      '<button data-act="next" aria-label="Next hole"' + (view.hole === 17 ? ' disabled' : '') + '>›</button></div>';

    out += '<div class="holecard' + (fin ? ' fin' : '') + '"><div class="hc-head"><h2>Hole ' + (view.hole + 1) + '</h2>' +
      '<div class="par"><span>Par</span>' + [3, 4, 5].map(function (p) {
        return '<button data-act="par" data-v="' + p + '" class="' + (h.par === p ? 'sel' : '') + '"' + (fin ? ' disabled' : '') + '>' + p + '</button>'; }).join('') + '</div></div>';
    var pin = SG.normPin(h.pin);
    out += '<button class="pinbtn' + (pin ? ' set' : '') + '" id="pinbtn" data-act="pinopen">⛳ ' + (pin ? 'Pin: ' + SG.PIN_NAME[pin].toLowerCase() + ' <small>change</small>' : 'Set pin location') + '</button>';

    out += '<div class="srow shead"><span class="c-n">#</span><span class="c-d">Dist</span><span class="c-l">Loc</span><span class="c-x">Dir</span><span class="c-p">P</span><span class="c-del"></span></div>';
    h.rows.forEach(function (row, k) { out += rowHTML(h, a, row, k, fin); });

    var pens = h.rows.reduce(function (n, rw, k) { return n + (SG.isPenalty(rw, k) ? 1 : 0); }, 0);
    out += '<div class="count" id="count">' + countText(h, pens) + '</div>';
    if (fin) {
      out += '<div class="hole-done">Score <b>' + a.strokes + '</b> (' + toPar(a.strokes - h.par) + ') · SG <span class="' + sgCls(a.sg) + '">' + fmtSG(a.sg) + '</span></div>';
      out += '<button class="big" data-act="reopen">✎ Edit this hole</button>';
    } else {
      var last = h.rows[h.rows.length - 1];
      if (!(last.loc === 'holed' || last.loc === 'holedx')) out += '<button class="addshot big" data-act="addShot">Add Shot ⊕</button>';
      out += '<button class="finish big" data-act="finish"' + (a.complete && h.par ? '' : ' disabled') + '>✓ Finish hole</button>';
      out += '<div id="hint" class="hint">' + hintText(h, a) + '</div>';
    }
    out += '</div>';
    out += view.hole < 17
      ? '<button class="' + (fin ? 'primary ' : '') + 'big" data-act="next">' + (started(r.holes[view.hole + 1]) ? 'Hole ' + (view.hole + 2) + ' ›' : 'Add Hole ' + (view.hole + 2) + ' ⊕') + '</button>'
      : '<button class="primary big" data-act="summary">Finish round – see stats</button>';
    out += '<div class="row sub"><button class="txt" data-act="home">Home</button><button class="txt" data-act="summary">Scorecard &amp; stats</button></div>';
    out += '<p class="help muted">Each row is ONE stroke. Dist = how far from the pin you hit it (yards; feet on the green). Loc = where the ball was. ' +
      'Last row: pick "In the hole" and enter the distance of the putt (or chip) that went in. Dir = where the shot before ended vs its target (8 ways: Short = toward you, Long = past it, Left, Right, and the corners). For an approach that missed the green, pick where it missed the green; if it found the green, pick where it stopped vs the hole. ' +
      'P = penalty stroke (+1), e.g. a drop. "OB re-hit" = +1 and you hit again from the same spot. Score = rows + penalties.</p>';
    if (view.dirk != null && h.rows[view.dirk] && !fin) out += dirSheetHTML(h, view.dirk);
    return out;
  }
  function dirSheetHTML(h, k) {
    var cur = SG.normDir(h.rows[k].dir), prevLie = SG.lieOf(h.rows, k - 1), prevGreen = prevLie === 'green';
    var out = '<div class="sheet-bg" data-act="dirclose"></div><div class="sheet" role="dialog" aria-label="Pick direction">' +
      '<h3>Shot ' + k + ' ended…</h3><p class="help">' + (prevGreen ? 'Where the putt finished vs the hole.' :
        'Missed the green? Where vs the green. On the green? Where vs the hole.') + ' <b>Short = toward you.</b></p><div class="dirgrid">';
    DIR_GRID.forEach(function (rw) { rw.forEach(function (d) {
      out += '<button data-act="setdir" data-v="' + d + '" class="' + (d === cur ? 'sel' : '') + (d ? '' : ' none') + '"><span>' + (d ? ARROW[d] : '⊘') + '</span>' + (d ? SG.DIR_NAME[d] : 'None') + '</button>';
    }); });
    return out + '</div><button class="big" data-act="dirclose">Cancel</button></div>';
  }
  function countText(h, pens) {
    var n = h.rows.length;
    return n + ' stroke' + (n === 1 ? '' : 's') + (pens ? ' + ' + pens + ' penalty' + (pens === 1 ? '' : ' strokes') + ' = ' + (n + pens) : '');
  }

  function rowHTML(h, a, row, k, fin) {
    var ob = row.loc === 'ob', bad = !fin && a.bad === k, shotNo = k + 1, dis = fin ? ' disabled' : '';
    var out = '<div class="srow' + (bad ? ' bad' : '') + '" data-k="' + k + '">';
    out += '<button class="c-n" data-act="menu" data-k="' + k + '" aria-label="Row options"' + dis + '>' + shotNo + '</button>';
    if (ob) out += '<span class="c-d obtxt">' + prevDist(h, k) + '</span>';
    else out += '<span class="c-d"><input type="text" inputmode="numeric" pattern="[0-9]*" maxlength="3" data-row="' + k + '" value="' + esc(row.dist) + '" aria-label="Distance row ' + shotNo + '"' + dis + '>' +
      '<i class="u" data-unit="' + k + '">' + SG.rowUnit(h.rows, k) + '</i></span>';
    var opts = k === 0 ? LOCS0 : LOCS;
    out += '<span class="c-l"><select data-f="loc" data-k="' + k + '" aria-label="Location row ' + shotNo + '"' + dis + '>' +
      (row.loc ? '' : '<option value="" selected>–</option>') +
      opts.map(function (l) { return '<option value="' + l[0] + '"' + (row.loc === l[0] ? ' selected' : '') + '>' + l[1] + '</option>'; }).join('') + '</select></span>';
    if (k === 0) out += '<span class="c-x"></span><span class="c-p"></span>';
    else {
      var dv = SG.normDir(row.dir);
      out += '<span class="c-x"><button class="dirbtn' + (dv ? ' on' : '') + '" data-act="dirpick" data-k="' + k + '" data-dir="' + dv + '" aria-label="Direction row ' + shotNo + ': ' + dirName(dv) + '"' + dis + '>' + ARROW[dv] + '</button></span>';
      out += '<span class="c-p"><button class="pen' + (row.pen || ob ? ' on' : '') + '" data-act="pen" data-k="' + k + '"' + (ob || fin ? ' disabled' : '') + ' aria-label="Penalty row ' + shotNo + '">' + (row.pen || ob ? '+1' : '') + '</button></span>';
    }
    out += '<span class="c-del">' + (k === 0 ? '' : '<button class="del" data-act="del" data-k="' + k + '" aria-label="Delete row ' + shotNo + '"' + dis + '>⌫</button>') + '</span>';
    out += '</div>';
    out += '<div class="sinfo" data-info="' + k + '">' + infoHTML(a.shots[k]) + '</div>';
    if (view.menu === k && !fin) {
      out += '<div class="rowmenu">' + (k > 0 ? '<button data-act="insBefore" data-k="' + k + '">Insert shot above</button>' : '') +
        '<button data-act="insAfter" data-k="' + k + '">Insert shot below</button><button data-act="menu" data-k="' + k + '">Close</button></div>';
    }
    return out;
  }
  function infoHTML(s) {
    if (!s) return '';
    var info = s.end.lie === 'holed' ? ' · in the hole!' : s.ob ? ' · went OB' : (s.start.lie === 'green' ? ' · missed' : ' · hit ' + s.hit + ' yd');
    if (s.dir && s.end.lie !== 'holed') info += ' ' + SG.DIR_NAME[s.dir].toLowerCase() + (s.cat === 'approach' && s.end.lie !== 'green' ? ' (missed green)' : '');
    return CAT_NAME[s.cat] + info + ' · SG <b class="' + sgCls(s.sg) + '">' + fmtSG(s.sg) + '</b>';
  }
  function prevDist(h, k) {
    var d = SG.distOf(h.rows, k);
    return (d == null ? '?' : d) + ' ' + SG.rowUnit(h.rows, k);
  }
  function hintText(h, a) {
    if (!h.par) return 'Pick the par.';
    if (a.complete) return 'All set – tap Finish hole.';
    var n = a.bad != null ? a.bad + 1 : h.rows.length, row = h.rows[n - 1] || {};
    var holed = row.loc === 'holed' || row.loc === 'holedx';
    switch (a.problem) {
      case 'dist': return n === 1 ? 'Missing: hole length in row 1.' : 'Missing: distance in row ' + n + (holed ? ' (how far was the putt/shot that went in?)' : '') + '.';
      case 'loc': return 'Missing: location in row ' + n + '.';
      case 'after': return 'Row ' + (n - 1) + ' is In the hole – delete the rows after it.';
      case 'last': return 'Not finished: tap Add Shot, and make the last row "In the hole".';
    }
    return '';
  }

  function summaryHTML() {
    var r = round(), bl = blOf(r), S = SG.summarize(r, bl);
    var out = '<div class="topbar"><button class="txt" data-act="backHole">‹ Round</button><div class="title"><b>Round stats</b><span>' +
      new Date(r.date).toLocaleDateString() + (r.course ? ' · ' + esc(r.course) : '') + '</span></div><button class="txt" data-act="home">Home</button></div>';
    out += '<div class="big-score"><div class="s">' + (S.holesDone ? S.strokes : '–') + '</div>' +
      (S.holesDone ? toPar(S.toPar) + ' vs par · ' + S.holesDone + ' hole' + (S.holesDone === 1 ? '' : 's') + ' done' : 'No holes finished yet') + '</div>';
    out += '<div class="label">Scorecard – tap a hole to edit</div><div class="card">';
    r.holes.forEach(function (h, i) {
      var a = S.holes[i], cls = 'empty', txt = '·';
      if (started(h)) { txt = a.done ? a.strokes : SG.rowStrokes(h.rows) + '…'; cls = !a.done ? '' : a.strokes < h.par ? 'under' : a.strokes > h.par ? 'over' : ''; }
      out += '<button class="' + cls + '" data-act="goHole" data-i="' + i + '">' + (i + 1) + ' · P' + h.par + '<b>' + txt + '</b></button>';
    });
    out += '</div>';
    var B = SG.baseline(bl);
    out += '<h2>Strokes gained: <span class="' + sgCls(S.sgTotal) + '" id="sgtotal">' + fmtSG(S.sgTotal) + '</span></h2>' +
      '<div class="blbox"><label class="lbl" for="sumbl">Baseline – compared with</label>' + blSelect('sumbl', bl) +
      '<p class="help muted" id="blnote">Average player in: ' + esc(B.name) +
      (B.status === 'estimated' ? ' – <b>estimated</b> baseline (no published table; see About the numbers)' : ' – published PGA Tour data (Broadie)') +
      '. Plus = better, minus = strokes lost. Changing this recalculates the whole round and is saved with it.</p></div>';
    out += '<table><tr><th>Category</th><th class="num">Shots</th><th class="num">SG</th></tr>';
    ['tee', 'approach', 'short', 'putting'].forEach(function (k) {
      var c = S.cats[k];
      out += '<tr><td>' + CAT_NAME[k] + '</td><td class="num">' + c.n + '</td><td class="num ' + sgCls(c.sg) + '">' + fmtSG(c.sg) + '</td></tr>';
    });
    out += '</table>' + compareHTML(r, bl) + '<h3>By distance</h3><table><tr><th>From</th><th class="num">Shots</th><th class="num">SG</th></tr>';
    var groups = [['Approach', ['30-100 yd', '100-150 yd', '150-200 yd', '200+ yd']], ['Short game', ['0-30 yd']], ['Putting', ['0-5 ft', '5-15 ft', '15-30 ft', '30+ ft']]];
    groups.forEach(function (g) {
      out += '<tr><td colspan="3" style="background:#eee"><b>' + g[0] + '</b></td></tr>';
      g[1].forEach(function (b) {
        var c = S.buckets[b];
        out += '<tr><td>' + b + '</td><td class="num">' + c.n + '</td><td class="num ' + sgCls(c.sg) + '">' + (c.n ? fmtSG(c.sg) : '–') + '</td></tr>';
      });
    });
    out += '</table><h2>Stats</h2><div class="stat-grid">' +
      tile('fw', 'Fairways hit – tap for map', S.fwHit + ' / ' + S.fwTotal) +
      tile('gir', 'Greens in reg. – tap for map', S.gir + ' / ' + S.girHoles) +
      tile('miss', 'Approach misses (missed green) – tap for map', S.apprMiss.length, missMini(S.apprMiss)) +
      tile('pin', 'Pin location – tap for map', S.pinHoles.length + ' / ' + S.holesDone, '<small class="mini">holes with a pin set</small>') +
      stat('Putts', S.putts) + stat('Penalty strokes', S.penalties) +
      stat('Tee misses L / R', S.teeLeft + ' / ' + S.teeRight) +
      stat('Approach left / right', S.apprLeft + ' / ' + S.apprRight) +
      stat('Approach short / long', S.apprShort + ' / ' + S.apprOver) + '</div>';
    out += '<button class="primary big" data-act="csv" style="margin-top:16px">Export this round (CSV)</button>';
    out += '<button class="big" data-act="backHole">Back to the round</button>';
    out += '<button class="big danger" data-act="delRound">Delete this round</button>';
    out += '<button class="big" data-act="about">ⓘ About the numbers</button>';
    out += '<p class="help muted">How it works: each shot is compared with how many strokes the chosen group averages to hole out from the same distance and lie. ' +
      'A shot that leaves you better off than average gains strokes. Penalties count against the shot that caused them.</p>';
    return out;
  }
  function compareHTML(r, bl) {
    var cats = ['tee', 'approach', 'short', 'putting'];
    var out = '<h3>Same round vs every baseline</h3><p class="help muted">Strokes gained by category. Tap a row to use it.</p>' +
      '<table class="cmp" id="cmp"><tr><th>Baseline</th><th class="num">Tee</th><th class="num">App</th><th class="num">Short</th><th class="num">Putt</th><th class="num">Total</th></tr>';
    SG.BASELINES.forEach(function (b) {
      var S = SG.summarize(r, b.id);
      out += '<tr data-act="setbl" data-v="' + b.id + '" class="' + (b.id === bl ? 'cur' : '') + '"><td>' + esc(b.name) + (b.status === 'estimated' ? '<sup>est</sup>' : '') + '</td>' +
        cats.map(function (c) { return '<td class="num ' + sgCls(S.cats[c].sg) + '">' + fmtSG(S.cats[c].sg) + '</td>'; }).join('') +
        '<td class="num ' + sgCls(S.sgTotal) + '"><b>' + fmtSG(S.sgTotal) + '</b></td></tr>';
    });
    return out + '</table><p class="help muted"><sup>est</sup> = estimated baseline, see About the numbers.</p>';
  }
  function aboutHTML() {
    var L = function (u, t) { return '<a href="' + u + '" target="_blank" rel="noopener">' + esc(t || u) + '</a>'; };
    var gaps = SG.BASELINES.map(function (b) {
      return '<tr><td>' + esc(b.name) + '</td><td>' + (b.status === 'sourced' ? 'Published' : '<b>Estimated</b>') + '</td><td class="num">' +
        (b.id === 'pga' ? '0' : '−' + b.gap.toFixed(1)) + '</td></tr>'; }).join('');
    return '<div class="topbar"><button class="txt" data-act="aboutBack">‹ Back</button><div class="title"><b>About the numbers</b><span>Where the baselines come from</span></div><span></span></div>' +
      '<div class="about">' +
      '<p>Strokes gained compares each shot with how many strokes an average player in the chosen group needs to hole out from the same spot. ' +
      'A shot\'s value = expected strokes before − expected strokes after − 1 (and −1 more for a penalty).</p>' +
      '<h2>PGA Tour – published</h2>' +
      '<p>Off the green (tee, fairway, rough, sand, recovery, 10–600 yd): Mark Broadie, “Assessing Golfer Performance on the PGA TOUR”, Table 9 (ShotLink data 2003–2010, about 8 million shots), ' +
      'published in <i>Interfaces</i> 42(2), 2012. ' + L('https://www.columbia.edu/~mnb2/broadie/Assets/strokes_gained_pga_broadie_20110408.pdf', 'Paper (PDF)') + '.</p>' +
      '<p>Putting (feet): Broadie, <i>Every Shot Counts</i> (2014), Table 3.10, as reproduced by ' +
      L('https://golfingfocus.com/what-percentage-of-putts-do-pros-make-tv-does-not-tell-the-story/', 'Golfing Focus') + ', cross-checked with ' +
      L('https://whygolf.com/pages/strokes-gained-calculator', 'WhyGolf') + '.</p>' +
      '<p class="muted">Small approximations: values between table rows are interpolated; “deep rough” = rough + 0.15; “trees” and played-from-hazard use Broadie\'s “recovery” column; ' +
      'shots under 10 yd use the 10-yd value; par-3 tee shots under 100 yd use the fairway column; putts over 90 ft and shots over 600 yd are extended in a straight line.</p>' +
      '<h2>Other groups – estimated</h2>' +
      '<p><b>No published expected-strokes table exists</b> for the LPGA Tour, D1 college men or women, or scratch men or women. (The LPGA shows strokes-gained stats via KPMG but not the table behind them. ' +
      'Clippd/Scoreboard college rankings use their own data and don\'t publish a table.) So these baselines are <b>estimates</b>, built from two published numbers:</p>' +
      '<ol><li><b>Scratch men vs PGA Tour:</b> 5.5 strokes per round behind, split off the tee 2.5, approach 1.5, short game 0.5, putting 1.0. Source: Peter Sanders (ShotByShot), ' +
      L('https://clubhouse.swingu.com/statistics/the-statistical-differences-between-a-scratch-golfer-and-pga-tour-player/', 'SwingU, 8,360 scratch rounds vs 2015 ShotLink') +
      '. This agrees with Lou Stagner\'s finding that the average tour pro is about a +5.4 handicap (' + L('https://golf.com/instruction/pro-golfer-handicap-index-score/', 'Golf.com') + ').</li>' +
      '<li><b>Where the other groups sit:</b> Clippd\'s “Player Quality” ladder (100 = male tour average): D1 college men 95, LPGA Tour 89, D1 college women 87, scratch men 87, scratch women 84. ' +
      L('https://www.clippd.com/insights/post/shot-quality-and-player-quality-clippds-new-performance-metrics', 'Clippd') + '.</li></ol>' +
      '<p><b>Method:</b> we assume each Player Quality point is worth the same number of strokes. Scratch men are 13 points and 5.5 strokes behind the Tour, so 1 point ≈ 0.42 strokes per round. ' +
      'Every group uses the scratch-men split by category. The PGA table is then shifted slightly (more for long shots, a little for putts) so that a typical 18-hole round loses exactly that many strokes in each category.</p>' +
      '<table><tr><th>Baseline</th><th>Type</th><th class="num">Strokes/round vs Tour</th></tr>' + gaps + '</table>' +
      '<p><b>Caveats</b></p><ul>' +
      '<li>Estimated baselines are approximate. Use them to compare rounds with each other, not as exact numbers.</li>' +
      '<li>Player Quality is Clippd\'s own scale. Treating it as linear in strokes is our assumption.</li>' +
      '<li>D1 women and scratch men share the same Clippd score (87), so their baselines are identical.</li>' +
      '<li>Women\'s baselines use the same distances as men\'s. Real tours play shorter courses (the LPGA plays roughly 700 yd shorter per round), so a given distance is harder for them than this shows.</li>' +
      '<li>The category split for every group comes from scratch men. Other groups may lose strokes in a different mix.</li>' +
      '<li>“Scratch” here means a 0 handicap on a typical course, as in the sources.</li></ul>' +
      '<p class="muted">Researched October 2026.</p></div>' +
      '<button class="big" data-act="aboutBack">‹ Back</button>';
  }
  function tile(id, l, v, extra) {
    return '<button class="stat tile" data-act="map" data-v="' + id + '"><b>' + v + '</b><span>' + l + '</span>' + (extra || '') + '</button>';
  }
  function countDirs(list) {
    var c = { '': 0 }; SG.DIR8.forEach(function (d) { c[d] = 0; });
    list.forEach(function (m) { c[m.dir || '']++; }); return c;
  }
  function missMini(list) {
    if (!list.length) return '';
    var c = countDirs(list), parts = [];
    SG.DIR8.forEach(function (d) { if (c[d]) parts.push(ARROW[d] + c[d]); });
    if (c['']) parts.push('?' + c['']);
    return '<small class="mini">' + parts.join(' ') + '</small>';
  }
  // ---------- maps (full-window overlays) ----------
  function mapData(kind) {
    var list = [], n = 0;
    if (kind === 'pin') return { list: [], rounds: 0 };
    var src = view.mapScope === 'all' ? rounds : [round()];
    src.forEach(function (r) {
      var S = SG.summarize(r, 'pga'); n++;
      (kind === 'gir' ? S.girMap : kind === 'fw' ? S.teeMap : S.apprMiss).forEach(function (m) { var o = {}; for (var x in m) o[x] = m[x]; o.round = r; list.push(o); });
    });
    return { list: list, rounds: n };
  }
  function pt(cx, cy, r, deg) { var t = deg * Math.PI / 180; return [cx + r * Math.cos(t), cy - r * Math.sin(t)]; }
  function f1(v) { return Math.round(v * 10) / 10; }
  var LIE_COL = { rough: '#1f5e1f', deep: '#0e3b0e', fairway: '#5fbf3f', sand: '#d9b44a', hazard: '#d0213a', ob: '#ffffff', recovery: '#7a4a1f', tee: '#888' };
  var LIE_NAME = { rough: 'Rough', deep: 'Deep rough', fairway: 'Fairway', sand: 'Bunker', hazard: 'Hazard', ob: 'OB', recovery: 'Trees' };
  function missSVG(list) {
    var C = 180, CY = 200, c = countDirs(list), out = '<svg id="missmap" viewBox="0 0 360 400" role="img" aria-label="Approach misses around the green">' +
      '<rect width="360" height="400" fill="#cfe8c4"/>';
    SG.DIR8.forEach(function (d) { var q = pt(C, CY, 260, SG.DIR_ANGLE[d] + 22.5);
      out += '<line x1="' + C + '" y1="' + CY + '" x2="' + f1(q[0]) + '" y2="' + f1(q[1]) + '" stroke="#8fb486" stroke-width="2" stroke-dasharray="6 5"/>'; });
    out += '<ellipse cx="180" cy="200" rx="64" ry="78" fill="#3da33d" stroke="#145214" stroke-width="4"/>' +
      '<line x1="180" y1="200" x2="180" y2="168" stroke="#000" stroke-width="3"/><path d="M180 168 l22 7 l-22 7z" fill="#d0213a"/><circle cx="180" cy="200" r="5" fill="#000"/>';
    var byDir = {}; list.forEach(function (m) { if (m.dir) (byDir[m.dir] = byDir[m.dir] || []).push(m); });
    SG.DIR8.forEach(function (d) {
      var a = SG.DIR_ANGLE[d], ms = byDir[d] || [], diag = d.length > 5;
      ms.forEach(function (m, i) {
        var ring = i % 3, col = Math.floor(i / 3) % 7, off = (col % 2 ? 1 : -1) * Math.ceil(col / 2) * 6;
        var p = pt(C, CY, (diag ? 96 : 92) + ring * 14, a + off);
        out += '<circle class="mdot" cx="' + f1(p[0]) + '" cy="' + f1(p[1]) + '" r="6" fill="' + (LIE_COL[m.lie] || '#888') + '" stroke="#000" stroke-width="2"/>';
      });
      var b = pt(C, CY, diag ? 172 : 150, a);
      out += '<g class="mcount" data-dir="' + d + '"><circle cx="' + f1(b[0]) + '" cy="' + f1(b[1]) + '" r="15" fill="' + (c[d] ? '#000' : '#fff') + '" stroke="#000" stroke-width="2"/>' +
        '<text x="' + f1(b[0]) + '" y="' + f1(b[1] + 6) + '" text-anchor="middle" font-size="17" font-weight="900" fill="' + (c[d] ? '#fff' : '#000') + '">' + c[d] + '</text></g>';
    });
    out += '<text x="180" y="17" text-anchor="middle" font-size="15" font-weight="800">LONG ↑ (past the green)</text>' +
      '<text x="180" y="393" text-anchor="middle" font-size="15" font-weight="800">SHORT ↓ (toward you)</text>' +
      '<text x="8" y="176" font-size="15" font-weight="800">◀ L</text><text x="352" y="176" text-anchor="end" font-size="15" font-weight="800">R ▶</text>';
    return out + '</svg>';
  }
  function girSVG(list) {
    var C = 180, CY = 200, K = 5, out = '<svg id="girmap" viewBox="0 0 360 400" role="img" aria-label="Green-in-regulation landings around the hole">' +
      '<rect width="360" height="400" fill="#cfe8c4"/><circle cx="180" cy="200" r="174" fill="#3da33d" stroke="#145214" stroke-width="4"/>';
    [30, 25, 20, 15, 10, 5].forEach(function (ft) {
      out += '<circle cx="180" cy="200" r="' + ft * K + '" fill="none" stroke="#fff" stroke-width="' + (ft % 10 ? 1.5 : 2.5) + '" stroke-opacity=".9"/>' +
        '<text class="ring" x="' + f1(182 + ft * K * 0.707) + '" y="' + f1(213 + ft * K * 0.707) + '" font-size="13" font-weight="800" fill="#fff">' + ft + ' ft</text>';
    });
    out += '<line x1="180" y1="30" x2="180" y2="370" stroke="#fff" stroke-opacity=".35"/><line x1="10" y1="200" x2="350" y2="200" stroke="#fff" stroke-opacity=".35"/>' +
      '<circle cx="180" cy="200" r="6" fill="#000"/><line x1="180" y1="200" x2="180" y2="170" stroke="#000" stroke-width="3"/><path d="M180 170 l20 6 l-20 6z" fill="#d0213a"/>';
    var seen = {};
    // EVERY GIR is drawn. No direction entered: grey "?" diamond at the right distance, drawn straight up (angle unknown).
    list.forEach(function (m) {
      var ft = m.holed ? 0 : m.ft, far = ft > 30, rr = far ? 33 * K : ft * K, nodir = !m.holed && !m.dir;
      var key = (m.holed ? 'h' : m.dir || 'none') + Math.round(rr / 6), j = seen[key] = (seen[key] || 0) + 1;
      var p = m.holed ? [C - 14 + (j - 1) * 14, CY + 16] : pt(C, CY, rr, (nodir ? 90 : SG.DIR_ANGLE[m.dir]) + (j - 1) * (nodir ? 8 : 6));
      var x = f1(p[0]), y = f1(p[1]), kind = m.holed ? 'holed' : nodir ? 'nodir' : 'dir';
      if (m.holed) out += '<path class="gdot" data-kind="holed" data-hole="' + m.hole + '" d="M' + x + ' ' + (y - 10) + ' l3 6.5 7 .8 -5.3 4.8 1.5 7 -6.2 -3.6 -6.2 3.6 1.5 -7 -5.3 -4.8 7 -.8z" fill="#ffd23f" stroke="#000" stroke-width="2"/>';
      else if (nodir) out += '<g class="gdot" data-kind="nodir" data-hole="' + m.hole + '" data-x="' + x + '" data-y="' + y + '"><path d="M' + x + ' ' + (y - 10) + ' l10 10 -10 10 -10 -10z" fill="' + (far ? '#ffd23f' : '#c9c9c9') + '" stroke="#000" stroke-width="2.5"/>' +
        '<text x="' + x + '" y="' + f1(p[1] + 5) + '" text-anchor="middle" font-size="13" font-weight="900" fill="#000">?</text></g>';
      else out += '<circle class="gdot" data-kind="dir" data-hole="' + m.hole + '" cx="' + x + '" cy="' + y + '" r="8" fill="' + (far ? '#ffd23f' : '#fff') + '" stroke="#000" stroke-width="2.5"/>';
      if (far) out += '<text class="farlbl" x="' + f1(p[0] + 12) + '" y="' + f1(p[1] + 5) + '" font-size="14" font-weight="900" fill="#000" stroke="#ffd23f" stroke-width="3" paint-order="stroke">' + Math.round(ft) + ' ft</text>';
    });
    out += '<text x="180" y="17" text-anchor="middle" font-size="14" font-weight="800">LONG ↑</text>' +
      '<text x="180" y="394" text-anchor="middle" font-size="14" font-weight="800">SHORT ↓ (toward you)</text>' +
      '<text x="4" y="192" font-size="14" font-weight="800">◀ L</text><text x="356" y="192" text-anchor="end" font-size="14" font-weight="800">R ▶</text>';
    return out + '</svg>';
  }
  function dirTable(list) {
    var c = countDirs(list), out = '<table class="dirtab" id="dirtab"><tr><th>Direction</th><th class="num">Count</th></tr>';
    SG.DIR8.slice().sort(function (a, b) { return DIR_ORDER.indexOf(a) - DIR_ORDER.indexOf(b); }).forEach(function (d) {
      out += '<tr data-dir="' + d + '"><td>' + ARROW[d] + ' ' + SG.DIR_NAME[d] + '</td><td class="num">' + c[d] + '</td></tr>'; });
    if (c['']) out += '<tr data-dir=""><td>No direction entered (not plotted)</td><td class="num">' + c[''] + '</td></tr>';
    return out + '</table>';
  }
  var DIR_ORDER = ['short', 'shortleft', 'shortright', 'left', 'right', 'long', 'longleft', 'longright'];
  function mapHTML() {
    var kind = view.map, D = mapData(kind), list = D.list, all = view.mapScope === 'all';
    var out = '<div class="mapview" id="mapview" role="dialog" aria-label="' + (kind === 'gir' ? 'GIR map' : kind === 'fw' ? 'Fairway map' : kind === 'pin' ? 'Pin location map' : 'Approach miss map') + '">' +
      '<div class="maphead"><b>' + (kind === 'gir' ? 'Greens in regulation' : kind === 'fw' ? 'Tee shots – fairways' : kind === 'pin' ? 'Pin location' : 'Approach misses') + '</b><button class="close" data-act="mapclose" aria-label="Close map">✕ Close</button></div>' +
      '<div class="seg"><button data-act="mapscope" data-v="round" class="' + (all ? '' : 'sel') + '">This round</button>' +
      '<button data-act="mapscope" data-v="all" class="' + (all ? 'sel' : '') + '">All rounds (' + rounds.length + ')</button></div>';
    if (kind === 'pin') out += pinMapHTML(all);
    else if (kind === 'fw') out += fwHTML(list, all, D);
    else if (kind === 'gir') {
      var far = list.filter(function (m) { return m.ft > 30; }).length, holed = list.filter(function (m) { return m.holed; }).length;
      out += '<p class="mapsum" id="mapsum"><b>' + list.length + '</b> green' + (list.length === 1 ? '' : 's') + ' in regulation' + (all ? ' in ' + D.rounds + ' round' + (D.rounds === 1 ? '' : 's') : ' this round') + '</p>' +
        girSVG(list) +
        '<div class="legend"><span><i class="dot" style="background:#fff"></i>Where the approach stopped (first-putt distance, direction vs the hole)</span>' +
        '<span><i class="dot" style="background:#ffd23f"></i>Over 30 ft – drawn at the edge, labelled with its distance</span>' +
        '<span><svg width="20" height="20" viewBox="0 0 20 20" style="flex:none"><path d="M10 1 l9 9 -9 9 -9 -9z" fill="#c9c9c9" stroke="#000" stroke-width="2"/><text x="10" y="14.5" text-anchor="middle" font-size="12" font-weight="900">?</text></svg>No direction entered – right distance, drawn straight up (direction unknown)</span>' +
        '<span><b class="star">★</b>Holed out (shot went in, or chipped/holed in from off the green)</span>' +
        '<span><i class="dot" style="background:#000"></i>Hole · white rings every 5 ft (5–30 ft)</span></div>' +
        '<p class="help muted"><b>GIR</b> = on the green (or holed) in par − 2 strokes or fewer, penalties included (par 3: 1 shot, par 4: 2, par 5: 3). Only finished holes count. ' +
        'Holing out from off the green counts as hitting it. Greens reached in more strokes are not shown. Bottom of the picture = short (toward you).</p>' +
        dirTable(list.filter(function (m) { return !m.holed; })).replace('(not plotted)', '(drawn as ?)').replace('</table>', (holed ? '<tr data-dir="holed"><td>★ Holed out</td><td class="num">' + holed + '</td></tr>' : '') + '</table>');
    } else {
      out += '<p class="mapsum" id="mapsum"><b>' + list.length + '</b> approach' + (list.length === 1 ? '' : 'es') + ' missed the green' + (all ? ' in ' + D.rounds + ' round' + (D.rounds === 1 ? '' : 's') : ' this round') + '</p>' +
        missSVG(list) + '<div class="legend">' + ['rough', 'fairway', 'sand', 'hazard', 'ob', 'recovery'].map(function (l) {
          return '<span><i class="dot" style="background:' + LIE_COL[l] + '"></i>' + LIE_NAME[l] + '</span>'; }).join('') +
        '<span><i class="dot num">3</i>Misses in that direction</span></div>' +
        '<p class="help muted"><b>Approach miss</b> = an approach shot (over 30 yd from the pin, including par-3 tee shots) that did not finish on the green or in the hole. ' +
        'Holing out (from anywhere) counts as hitting the green, so it is never a miss. Lay-ups are left out (finished more than 50 yd from the pin with no direction entered). Direction = where it missed the green (the Dir you entered on the next row). Only finished holes count. Bottom = short (toward you).</p>' + dirTable(list);
    }
    return out + '<button class="big" data-act="mapclose">Close</button></div>';
  }
  function pinHTML() {
    var h = round().holes[view.hole], pin = SG.normPin(h.pin);
    var out = '<div class="mapview" id="pinview" role="dialog" aria-label="Pin location">' +
      '<div class="maphead"><b>Hole ' + (view.hole + 1) + ' – pin location</b><button class="close" data-act="pinclose" aria-label="Close">✕ Close</button></div>' +
      '<p class="help">Tap the part of the green where the pin is. <b>Front = toward you</b> (bottom), back = far side.</p>' +
      '<div class="pinwrap"><div class="pinlbl">BACK ↑</div><div class="pingreen" id="pingreen">';
    SG.PIN_GRID.forEach(function (rw) { rw.forEach(function (c) {
      out += '<button data-act="pinset" data-v="' + c + '" class="' + (c === pin ? 'sel' : '') + '" aria-pressed="' + (c === pin) + '">' +
        (c === pin ? '<span class="flag">⛳</span>' : '') + SG.PIN_NAME[c].replace(' ', '<br>') + '</button>';
    }); });
    out += '</div><div class="pinlbl">FRONT ↓ (toward you)</div></div>' +
      '<p class="pincur" id="pincur">' + (pin ? 'Pin: <b>' + SG.PIN_NAME[pin] + '</b> – saved' : 'No pin location set') + '</p>' +
      '<div class="row2"><button class="big" data-act="pinclear"' + (pin ? '' : ' disabled') + '>Clear pin</button>' +
      '<button class="primary big" data-act="pinclose">Done</button></div></div>';
    return out;
  }
  // Fairway bird's-eye view: every par-4/5 tee shot as a tracer from the tee
  var FW_END = { fairway: '#ffffff', rough: '#d0213a', bunker: '#e8c766', hazard: '#1e6fd9', trees: '#6b3d12', ob: '#000000' };
  var FW_NAME = { fairway: 'Fairway (or green)', rough: 'Rough', bunker: 'Bunker', hazard: 'Hazard', trees: 'Trees', ob: 'OB' };
  function fwSVG(list) {
    var TX = 180, TY = 532, PX = 1.5, Y = function (yd) { return TY - yd * PX; };
    var out = '<svg id="fwmap" viewBox="0 0 360 560" role="img" aria-label="Tee shots on a fairway">' +
      '<rect width="360" height="560" fill="#2f6b2a"/>' +                       // trees both sides
      '<rect x="56" y="0" width="248" height="560" fill="#4f9a3c"/>' +          // rough
      '<path d="M146 ' + Y(115) + ' Q180 ' + Y(125) + ' 214 ' + Y(115) + ' L218 0 L142 0 Z" fill="#7fd16a"/>' + // fairway
      '<line x1="22" y1="0" x2="22" y2="560" stroke="#fff" stroke-width="3" stroke-dasharray="4 16"/>' +
      '<line x1="338" y1="0" x2="338" y2="560" stroke="#fff" stroke-width="3" stroke-dasharray="4 16"/>' +
      '<text x="6" y="14" font-size="11" font-weight="800" fill="#fff">OB</text><text x="354" y="14" text-anchor="end" font-size="11" font-weight="800" fill="#fff">OB</text>' +
      '<ellipse cx="128" cy="' + Y(255) + '" rx="10" ry="22" fill="#e8c766"/><ellipse cx="234" cy="' + Y(230) + '" rx="10" ry="22" fill="#e8c766"/>' +
      '<rect x="166" y="' + (TY - 6) + '" width="28" height="20" rx="4" fill="#9be08a" stroke="#fff" stroke-width="2"/>';
    [100, 150, 200, 250, 300].forEach(function (yd) {
      out += '<line x1="56" y1="' + Y(yd) + '" x2="304" y2="' + Y(yd) + '" stroke="#fff" stroke-opacity=".45" stroke-dasharray="3 6"/>' +
        '<text class="yd" x="60" y="' + (Y(yd) - 4) + '" font-size="12" font-weight="800" fill="#fff">' + yd + ' yd</text>';
    });
    var END_X = { rough: 98, bunker: 132, hazard: 74, trees: 40, ob: 12 };
    list.forEach(function (m, i) {
      var sgn = m.side === 'L' ? -1 : m.side === 'R' ? 1 : 0, jit = ((i * 37) % 7 - 3) * 5;
      var yd = m.kind === 'ob' ? 250 : Math.max(40, Math.min(330, m.hit || 0)), ex, dashed = false;
      if (m.kind === 'fairway') ex = TX + sgn * 20 + jit;
      else if (!sgn) { ex = TX + jit / 2; dashed = true; }
      else ex = m.kind === 'rough' ? TX + sgn * (TX - END_X.rough + jit) : TX + sgn * (TX - END_X[m.kind]);
      var ey = Y(yd), cx = TX + (ex - TX) * 0.1, cy = ey + (TY - ey) * 0.35;
      var col = m.fairway ? '#00a000' : '#e0102a';
      out += '<path class="tracer ' + (m.fairway ? 'hit' : 'miss') + '" data-kind="' + m.kind + '" data-side="' + (m.side || '') + '" d="M' + TX + ' ' + TY + ' Q' + f1(cx) + ' ' + f1(cy) + ' ' + f1(ex) + ' ' + f1(ey) + '" fill="none" stroke="#000" stroke-opacity=".35" stroke-width="6"/>' +
        '<path d="M' + TX + ' ' + TY + ' Q' + f1(cx) + ' ' + f1(cy) + ' ' + f1(ex) + ' ' + f1(ey) + '" fill="none" stroke="' + (m.fairway ? '#b6ff9e' : '#ff4d5e') + '" stroke-width="3.5"' + (dashed ? ' stroke-dasharray="8 6"' : '') + '/>';
      if (m.kind === 'ob') out += '<text x="' + f1(ex) + '" y="' + f1(ey + 7) + '" text-anchor="middle" font-size="22" font-weight="900" fill="#fff" stroke="#000" stroke-width="2" paint-order="stroke">✕</text>';
      else out += '<circle cx="' + f1(ex) + '" cy="' + f1(ey) + '" r="6.5" fill="' + FW_END[m.kind] + '" stroke="' + (m.kind === 'fairway' ? col : '#000') + '" stroke-width="2.5"/>';
      if (dashed) out += '<text x="' + f1(ex + 9) + '" y="' + f1(ey + 5) + '" font-size="14" font-weight="900" fill="#fff">?</text>';
    });
    out += '<text x="180" y="556" text-anchor="middle" font-size="12" font-weight="800" fill="#fff">TEE</text>';
    return out + '</svg>';
  }
  function fwHTML(list, all, D) {
    var hit = list.filter(function (m) { return m.fairway; }).length, miss = list.filter(function (m) { return !m.fairway; });
    var L = miss.filter(function (m) { return m.side === 'L'; }).length, R = miss.filter(function (m) { return m.side === 'R'; }).length;
    var by = {}; miss.forEach(function (m) { by[m.kind] = (by[m.kind] || 0) + 1; });
    var out = '<p class="mapsum" id="mapsum">Fairways hit <b>' + hit + ' / ' + list.length + '</b>' + (list.length ? ' (' + Math.round(100 * hit / list.length) + '%)' : '') +
      (all ? ' in ' + D.rounds + ' round' + (D.rounds === 1 ? '' : 's') : ' this round') + '</p>' +
      '<div class="fwcounts" id="fwcounts"><span>⬅ Missed left <b>' + L + '</b></span><span>Missed right <b>' + R + '</b> ➡</span>' +
      (miss.length - L - R ? '<span>No direction <b>' + (miss.length - L - R) + '</b></span>' : '') + '</div>' + fwSVG(list) +
      '<div class="legend"><span><i class="ln" style="background:#00a000"></i>Hit the fairway</span><span><i class="ln" style="background:#e0102a"></i>Missed</span>' +
      '<span><i class="ln dash"></i>Missed, no direction entered (drawn straight)</span>' +
      ['fairway', 'rough', 'bunker', 'hazard', 'trees'].map(function (k) { return '<span><i class="dot" style="background:' + FW_END[k] + '"></i>Ended: ' + FW_NAME[k] + '</span>'; }).join('') +
      '<span><b class="x">✕</b>OB (length unknown – drawn at 250 yd)</span></div>' +
      '<table class="dirtab" id="fwtab"><tr><th>Missed into</th><th class="num">Left</th><th class="num">Right</th><th class="num">Total</th></tr>';
    ['rough', 'bunker', 'hazard', 'trees', 'ob'].forEach(function (k) {
      var l = miss.filter(function (m) { return m.kind === k && m.side === 'L'; }).length, r = miss.filter(function (m) { return m.kind === k && m.side === 'R'; }).length;
      out += '<tr data-kind="' + k + '"><td>' + FW_NAME[k] + '</td><td class="num">' + l + '</td><td class="num">' + r + '</td><td class="num">' + (by[k] || 0) + '</td></tr>';
    });
    out += '</table><p class="help muted">Every tee shot on a par 4 or 5 (finished holes only), drawn from the tee to the distance it went (hole length minus the distance left). ' +
      'Left/right comes from the Dir you entered on row 2. Fairway hit = first tee shot finished on the fairway or green with no penalty. Bird\'s-eye view: the fairway runs away from you.</p>';
    return out;
  }
  // ---------- pin-location map ----------
  function pinData() {
    var D = { holes: [], gir: [], miss: [], noPin: 0, rounds: 0 };
    (view.mapScope === 'all' ? rounds : [round()]).forEach(function (r) {
      var S = SG.summarize(r, 'pga'); D.rounds++; D.noPin += S.noPin;
      S.pinHoles.forEach(function (x) { D.holes.push(x); });
      S.girMap.forEach(function (x) { if (x.pin) D.gir.push(x); });
      S.apprMiss.forEach(function (x) { if (x.pin) D.miss.push(x); });
    });
    return D;
  }
  function onPin(list, p) { return list.filter(function (x) { return x.pin === p; }); }
  // Green geometry for the pin map (viewBox 360 x 460)
  var PG = { cx: 180, cy: 230, rx: 110, ry: 140, K: 2.4 };
  function pinXY(p) {
    var r = 0, c = 0; SG.PIN_GRID.forEach(function (rw, i) { var j = rw.indexOf(p); if (j >= 0) { r = i; c = j; } });
    // inside its segment, pulled in a little for the corners so the flag sits on the visible green
    var k = (r !== 1 && c !== 1) ? 0.85 : 1;
    return [PG.cx + (c - 1) * 0.6 * PG.rx * k, PG.cy + (r - 1) * 0.62 * PG.ry * k];
  }
  function pinSVG(p, gir, miss) {
    var SC = [0, 0]; SG.PIN_GRID.forEach(function (rw, i) { var j = rw.indexOf(p); if (j >= 0) SC = [i, j]; });
    var P = pinXY(p), w = 2 * PG.rx / 3, hh = 2 * PG.ry / 3, x0 = PG.cx - PG.rx, y0 = PG.cy - PG.ry;
    var out = '<svg id="pinmap" viewBox="0 0 360 460" role="img" aria-label="Approaches with the pin ' + SG.PIN_NAME[p] + '">' +
      '<defs><clipPath id="gclip"><ellipse cx="' + PG.cx + '" cy="' + PG.cy + '" rx="' + PG.rx + '" ry="' + PG.ry + '"/></clipPath></defs>' +
      '<rect width="360" height="460" fill="#cfe8c4"/><ellipse cx="' + PG.cx + '" cy="' + PG.cy + '" rx="' + PG.rx + '" ry="' + PG.ry + '" fill="#3da33d" stroke="#145214" stroke-width="4"/>' +
      '<rect clip-path="url(#gclip)" x="' + f1(x0 + w * SC[1]) + '" y="' + f1(y0 + hh * SC[0]) + '" width="' + f1(w) + '" height="' + f1(hh) + '" fill="#ffd23f" fill-opacity=".28"/>';
    [1, 2].forEach(function (i) {
      out += '<line clip-path="url(#gclip)" x1="' + f1(x0 + w * i) + '" y1="0" x2="' + f1(x0 + w * i) + '" y2="460" stroke="#fff" stroke-opacity=".6" stroke-dasharray="5 5"/>' +
        '<line clip-path="url(#gclip)" x1="0" y1="' + f1(y0 + hh * i) + '" x2="360" y2="' + f1(y0 + hh * i) + '" stroke="#fff" stroke-opacity=".6" stroke-dasharray="5 5"/>';
    });
    var seen = {}, lbl = function (x, y, t1, t2, cls) {
      return '<text class="' + cls + '" x="' + f1(x) + '" y="' + f1(y) + '" text-anchor="middle" font-size="11.5" font-weight="900" fill="#000" stroke="#fff" stroke-width="3" paint-order="stroke">' + esc(t1) +
        (t2 ? '<tspan x="' + f1(x) + '" dy="12">' + esc(t2) + '</tspan>' : '') + '</text>';
    };
    // greens hit (GIR): relative to the pin
    gir.forEach(function (m) {
      var ft = m.holed ? 0 : m.ft, nod = !m.holed && !m.dir, rr = Math.min(ft, 45) * PG.K;
      var key = m.holed ? 'h' : (m.dir || 'n') + Math.round(rr / 8), j = seen[key] = (seen[key] || 0) + 1;
      var q = m.holed ? [P[0] - 12 + (j - 1) * 14, P[1] + 14] : pt(P[0], P[1], rr, (nod ? 90 : SG.DIR_ANGLE[m.dir]) + (j - 1) * 9);
      // a green hit stays on the green: if the scaled distance would leave the picture's green, pull it back along the same line
      var inside = function (z) { var u = (z[0] - PG.cx) / PG.rx, v = (z[1] - PG.cy) / PG.ry; return u * u + v * v <= 0.97; }, cl = '';
      if (!m.holed && !inside(q)) { var lo = 0, hi = 1; for (var it = 0; it < 20; it++) { var md = (lo + hi) / 2; if (inside([P[0] + (q[0] - P[0]) * md, P[1] + (q[1] - P[1]) * md])) lo = md; else hi = md; }
        q = [P[0] + (q[0] - P[0]) * lo, P[1] + (q[1] - P[1]) * lo]; cl = ' data-edge="1"'; }
      var x = f1(q[0]), y = f1(q[1]);
      if (m.holed) out += '<path class="pdot" data-kind="holed" data-hole="' + m.hole + '" d="M' + x + ' ' + (y - 10) + ' l3 6.5 7 .8 -5.3 4.8 1.5 7 -6.2 -3.6 -6.2 3.6 1.5 -7 -5.3 -4.8 7 -.8z" fill="#ffd23f" stroke="#000" stroke-width="2"/>';
      else if (nod) out += '<g class="pdot" data-kind="nodir" data-hole="' + m.hole + '" data-x="' + x + '" data-y="' + y + '"><path d="M' + x + ' ' + (y - 9) + ' l9 9 -9 9 -9 -9z" fill="#fff" stroke="#000" stroke-width="2.5"/><text x="' + x + '" y="' + (y + 4.5) + '" text-anchor="middle" font-size="12" font-weight="900">?</text></g>';
      else out += '<circle class="pdot" data-kind="gir"' + cl + ' data-hole="' + m.hole + '" cx="' + x + '" cy="' + y + '" r="7" fill="#fff" stroke="#000" stroke-width="2.5"/>';
      if (!m.holed) out += lbl(q[0], q[1] + 20, Math.round(ft) + ' ft', '', 'plbl');
    });
    // missed greens: off the green in the miss direction
    var LN = { rough: 'Rough', deep: 'Deep rough', fairway: 'Fairway', sand: 'Bunker', hazard: 'Hazard', ob: 'OB', recovery: 'Trees' };
    miss.forEach(function (m) {
      if (!m.dir) return;
      var a = SG.DIR_ANGLE[m.dir], t = a * Math.PI / 180, j = seen['m' + m.dir] = (seen['m' + m.dir] || 0) + 1;
      var e = [PG.cx + PG.rx * Math.cos(t), PG.cy - PG.ry * Math.sin(t)], out1 = 18 + ((j - 1) % 2) * 30;
      var q = [e[0] + out1 * Math.cos(t), e[1] - out1 * Math.sin(t)];
      var side = Math.floor((j - 1) / 2) * 34 * (j % 4 < 2 ? 1 : -1);
      q = [q[0] + side * Math.sin(t), q[1] + side * Math.cos(t)];
      q = [Math.max(24, Math.min(336, q[0])), Math.max(14, Math.min(420, q[1]))];
      out += '<circle class="pdot" data-kind="miss" data-hole="' + m.hole + '" cx="' + f1(q[0]) + '" cy="' + f1(q[1]) + '" r="7" fill="#e0102a" stroke="#000" stroke-width="2.5"/>' +
        lbl(q[0], q[1] + 20, m.lie === 'ob' ? 'OB' : Math.round(m.dist) + ' yd', m.lie === 'ob' ? '' : (LN[m.lie] || m.lie), 'mlbl');
    });
    out += '<line x1="' + f1(P[0]) + '" y1="' + f1(P[1]) + '" x2="' + f1(P[0]) + '" y2="' + f1(P[1] - 30) + '" stroke="#000" stroke-width="3"/>' +
      '<path d="M' + f1(P[0]) + ' ' + f1(P[1] - 30) + ' l20 6 l-20 6z" fill="#d0213a"/><circle id="pinflag" cx="' + f1(P[0]) + '" cy="' + f1(P[1]) + '" r="5" fill="#000"/>' +
      '<text x="180" y="16" text-anchor="middle" font-size="14" font-weight="800">BACK ↑</text><text x="180" y="452" text-anchor="middle" font-size="14" font-weight="800">FRONT ↓ (toward you)</text>';
    return out + '</svg>';
  }
  function pinMapHTML(all) {
    var D = pinData(), seg = view.pinSeg, scope = all ? ' in ' + D.rounds + ' round' + (D.rounds === 1 ? '' : 's') : ' this round';
    var note = D.noPin ? '<p class="help muted" id="nopin">' + D.noPin + ' finished hole' + (D.noPin === 1 ? ' has' : 's have') + ' no pin set – not included.</p>' : '';
    if (!seg) {
      var out = '<p class="mapsum" id="mapsum"><b>' + D.holes.length + '</b> hole' + (D.holes.length === 1 ? '' : 's') + ' with a pin set' + scope + '</p>' + note +
        '<p class="help">Tap a part of the green to see every approach on holes with the pin there. Badge = number of approaches.</p>' +
        '<div class="pinwrap"><div class="pinlbl">BACK ↑</div><div class="pingreen pinstats" id="pinstats">';
      SG.PIN_GRID.forEach(function (rw) { rw.forEach(function (c) {
        var hs = onPin(D.holes, c), n = onPin(D.gir, c).length + onPin(D.miss, c).length, g = hs.filter(function (x) { return x.gir; }).length;
        out += '<button data-act="pinseg" data-v="' + c + '" data-n="' + n + '" class="' + (hs.length ? 'has' : '') + '"><span class="badge">' + n + '</span>' + SG.PIN_NAME[c].replace(' ', '<br>') +
          (hs.length ? '<small>GIR ' + g + '/' + hs.length + '</small>' : '') + '</button>';
      }); });
      return out + '</div><div class="pinlbl">FRONT ↓ (toward you)</div></div>';
    }
    var hs = onPin(D.holes, seg), gir = onPin(D.gir, seg), miss = onPin(D.miss, seg), g = hs.filter(function (x) { return x.gir; }).length;
    var nodirMiss = miss.filter(function (m) { return !m.dir; }).length;
    var out2 = '<button class="big" data-act="pinseg" data-v="">‹ All pin positions</button>' +
      '<p class="mapsum" id="mapsum">Pin <b>' + SG.PIN_NAME[seg] + '</b>: ' + hs.length + ' hole' + (hs.length === 1 ? '' : 's') + scope + '</p>' +
      '<div class="fwcounts" id="pinsum"><span>GIR <b>' + g + ' / ' + hs.length + '</b></span><span>Greens hit <b>' + gir.length + '</b></span><span>Missed green <b>' + miss.length + '</b></span></div>' +
      pinSVG(seg, gir, miss) +
      '<div class="legend"><span><i class="dot" style="background:#fff"></i>Green hit in regulation – first-putt distance (ft) and direction from the pin; kept on the green if it runs past the drawn edge</span>' +
      '<span><svg width="20" height="20" viewBox="0 0 20 20" style="flex:none"><path d="M10 1 l9 9 -9 9 -9 -9z" fill="#fff" stroke="#000" stroke-width="2"/><text x="10" y="14.5" text-anchor="middle" font-size="12" font-weight="900">?</text></svg>Green hit, no direction entered (drawn straight up)</span>' +
      '<span><b class="star">★</b>Holed out</span>' +
      '<span><i class="dot" style="background:#e0102a"></i>Missed green – drawn off the green in the miss direction; label = yards left to the pin + where it finished</span></div>' +
      (nodirMiss ? '<p class="help muted">' + nodirMiss + ' miss' + (nodirMiss === 1 ? '' : 'es') + ' had no direction entered and are not drawn.</p>' : '') +
      '<h3>Missed greens by direction</h3>' + dirTable(miss) +
      '<p class="help muted">Approaches = same as the other maps: GIR approaches (incl. hole-outs) and approach shots that missed the green. Greens hit in more than regulation are not shown. ' +
      'Front = toward you. Distances on the green are feet; off the green, yards.</p>' + note;
    return out2;
  }
  function stat(l, v) { return '<div class="stat"><b>' + v + '</b><span>' + l + '</span></div>'; }

  // ---------- CSV ----------
  function localDate(iso) { var t = new Date(iso); return t.getFullYear() + '-' + ('0' + (t.getMonth() + 1)).slice(-2) + '-' + ('0' + t.getDate()).slice(-2); }
  function csvFor(list) {
    var rows = [['date', 'course', 'hole', 'par', 'hole_yards', 'shot', 'from_lie', 'from_dist', 'from_unit', 'to_lie', 'to_dist', 'to_unit',
      'distance_hit_yd', 'miss', 'penalty', 'category', 'bucket', 'expected_before', 'expected_after', 'strokes_gained', 'hole_score', 'baseline', 'pin']];
    list.forEach(function (r) {
      r.holes.forEach(function (h, hi) {
        var a = SG.analyzeHole(h, blOf(r));
        a.shots.forEach(function (s) {
          rows.push([localDate(r.date), r.course, hi + 1, h.par, SG.holeYards(h), s.n, s.start.lie, s.start.dist, unit(s.start.lie), s.end.lie,
            s.end.dist, s.end.lie === 'holed' ? '' : unit(s.end.lie), s.hit == null ? '' : s.hit, s.dir, s.pen, CAT_NAME[s.cat], s.bucket,
            s.eStart.toFixed(3), s.eEnd.toFixed(3), s.sg.toFixed(3), a.done ? a.strokes : '', blLabel(blOf(r)), SG.normPin(h.pin)]);
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
      case 'about': view.back = view.screen; view.screen = 'about'; render(); window.scrollTo(0, 0); return;
      case 'aboutBack': view.screen = view.back && view.back !== 'about' ? view.back : 'home'; render(); window.scrollTo(0, 0); return;
      case 'setbl': setBaseline(v); return;
      case 'map': view.map = v; view.pinSeg = null; view.mapScope = view.mapScope || 'round'; render(); return;
      case 'pinseg': view.pinSeg = v || null; render(); var pv = document.getElementById('mapview'); if (pv) pv.scrollTop = 0; return;
      case 'mapclose': view.map = null; render(); return;
      case 'pinopen': view.pinOpen = true; view.menu = null; view.dirk = null; render(); return;
      case 'pinclose': view.pinOpen = false; render(); return;
      case 'pinset': h.pin = SG.normPin(v); save(); render(); return;
      case 'pinclear': h.pin = ''; save(); render(); return;
      case 'mapscope': view.mapScope = v; render(); var mv = document.getElementById('mapview'); if (mv) mv.scrollTop = 0; return;
      case 'dirpick': view.dirk = k; view.menu = null; break;
      case 'dirclose': view.dirk = null; break;
      case 'setdir': h.rows[view.dirk].dir = v || ''; view.dirk = null; save(); break;
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
      case 'finish': {
        var af = SG.analyzeHole(h);
        if (!af.complete) { toast(hintText(h, af)); return; }
        h.finished = true; save(); view.menu = null;
        toast('Hole ' + (view.hole + 1) + ': ' + af.strokes + ' (' + toPar(af.strokes - h.par) + ')');
        break;
      }
      case 'reopen': h.finished = false; save(); break;
      case 'pen': h.rows[k].pen = !h.rows[k].pen; save(); break;
      case 'del':
        if (!confirm('Delete row ' + (k + 1) + ' (' + (h.rows[k].dist || '') + ' ' + (LOC_SHORT[h.rows[k].loc] || '') + ')?')) return;
        h.rows.splice(k, 1); view.menu = null; save(); break;
      case 'menu': view.menu = view.menu === k ? null : k; break;
      case 'insBefore': h.rows.splice(k, 0, newRow(h, k - 1)); view.menu = null; save(); render(); focusDist(k); return;
      case 'insAfter': h.rows.splice(k + 1, 0, newRow(h, k)); view.menu = null; save(); render(); focusDist(k + 1); return;
    }
    render();
  });

  function setBaseline(id) {
    var r = round(); if (!r || r.baseline === id) return;
    var y = window.scrollY; r.baseline = id; save(); render(); window.scrollTo(0, y);
    toast('Now comparing with ' + blLabel(id));
  }
  document.addEventListener('change', function (ev) {
    var t = ev.target, f = t.getAttribute('data-f'); if (!f) return;
    if (f === 'baseline') { if (t.id === 'sumbl') setBaseline(t.value); return; }
    var h = round().holes[view.hole], k = +t.getAttribute('data-k'), row = h.rows[k];
    if (f === 'loc') {
      var v = t.value, was = row.loc;
      row.loc = v;
      if (v === 'ob') { row.dist = ''; row.pen = false; }
      if (was === 'ob' && v !== 'ob') row.dist = '';
      save(); render();
      if (v !== 'ob' && row.dist === '') focusDist(k);
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
    var a = AH(h), hint = document.getElementById('hint');
    if (hint) hint.textContent = hintText(h, a);
    var fb = document.querySelector('[data-act="finish"]'); if (fb) fb.disabled = !(a.complete && h.par);
    h.rows.forEach(function (row, k) {
      var el = document.querySelector('.sinfo[data-info="' + k + '"]'); if (el) el.innerHTML = infoHTML(a.shots[k]);
      var rw = document.querySelector('.srow[data-k="' + k + '"]'); if (rw) rw.classList.toggle('bad', a.bad === k);
      var ob = rw && rw.querySelector('.obtxt'); if (ob) ob.textContent = prevDist(h, k);
    });
  }

  function firstOpenHole(r) {
    for (var i = 0; i < 18; i++) { if (!SG.analyzeHole(r.holes[i]).done) return i; }
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
