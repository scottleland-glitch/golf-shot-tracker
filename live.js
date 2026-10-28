// Live round sharing (v87): the phone playing the round sends a small snapshot of the scorecard to a Firebase Realtime Database
// after each change; family open the secret link (?watch=<token>) and see it update. No Firebase SDK – plain REST:
//   write: PUT/DELETE <db>/live/<token>.json    watch: EventSource on the same URL (falls back to polling every few seconds).
// The database rules only allow /live/<token>, so the long random token is what keeps a round private (an unguessable link).
// Pure helpers (token, snapshot, publisher with an offline queue, viewer HTML) take their network/storage from options so they can be tested.
(function (root) {
  'use strict';
  var ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  var TOKEN_LEN = 32; // 62^32 ≈ 2^190 possibilities
  var PAGE = 'https://scottleland-glitch.github.io/golf-shot-tracker/';
  function token(cryptoObj, len) {
    var c = cryptoObj || (root.crypto && root.crypto.getRandomValues ? root.crypto : null) || (typeof require !== 'undefined' ? require('crypto').webcrypto : null);
    if (!c || !c.getRandomValues) throw new Error('No secure random numbers available');
    len = len || TOKEN_LEN; var out = '';
    while (out.length < len) {
      var b = new Uint8Array(len * 2); c.getRandomValues(b);
      for (var i = 0; i < b.length && out.length < len; i++) if (b[i] < 248) out += ALPHA[b[i] % 62]; // 248 = 4·62: no bias
    }
    return out;
  }
  function validId(id) { return typeof id === 'string' && /^[A-Za-z0-9_-]{24,64}$/.test(id); }
  function watchId(search) { var m = String(search || '').match(/[?&]watch=([A-Za-z0-9_-]+)/); return m && validId(m[1]) ? m[1] : null; }
  function link(id, page) { return (page || PAGE) + '?watch=' + id; }
  function dbUrl(base, id) { return String(base).replace(/\/+$/, '') + '/live/' + encodeURIComponent(id) + '.json'; }

  // ---------- snapshot: a compact, Firebase-safe copy of one round (no nulls inside arrays, no empty arrays) ----------
  // h[i] = { par, sc (score, finished holes only), putts, fw (1/0, par 4-5), gir (1/0), live (strokes so far on an unfinished hole),
  //          shots: ["dist|loc|dir|club|pen|layup", ...] } – one string per row, as typed (dist in yards, feet on the green).
  function snapshot(r, SGx, o) {
    o = o || {}; SGx = SGx || root.SG;
    var holes = [], st = 0, pr = 0, thru = 0, cur = 0, lastDone = -1, firstLive = -1;
    (r.holes || []).forEach(function (h, i) {
      var a = SGx.analyzeHole(h), e = { par: Number(h.par) || 0 }, rows = h.rows || [];
      var started = rows.length > 1 || (rows[0] && rows[0].dist !== '' && rows[0].dist != null) || !!h.finished;
      var shots = started ? rows.map(function (w) {
        return [w.dist === '' || w.dist == null ? '' : w.dist, w.loc || '', w.dir || '', w.club || '', w.pen ? 1 : '', w.layup ? 1 : ''].join('|').replace(/\|+$/, '');
      }) : [];
      if (shots.length) e.shots = shots;
      if (a.done) {
        e.sc = a.strokes; e.putts = a.putts; e.gir = a.gir ? 1 : 0; if (a.fairway !== null) e.fw = a.fairway ? 1 : 0;
        st += a.strokes; pr += e.par; thru++; lastDone = i;
      } else if (started) { e.live = a.liveStrokes || shots.length; if (firstLive < 0) firstLive = i; }
      holes.push(e);
    });
    cur = firstLive >= 0 ? firstLive + 1 : Math.min(holes.length, lastDone + 2);
    var s = { v: 1, name: String(o.name || r.player || '').slice(0, 40), course: String(r.course || '').slice(0, 80), tee: String(r.tee || '').slice(0, 30),
      date: r.date || '', cur: cur || 1, thru: thru, strokes: st, par: pr, toPar: st - pr, fin: (o.fin || (holes.length > 0 && thru === holes.length)) ? 1 : 0,
      at: o.now != null ? o.now : Date.now(), h: holes };
    if (!s.tee) delete s.tee; if (!s.course) delete s.course; if (!s.name) delete s.name;
    return s;
  }
  function sig(s) { if (!s) return ''; var c = {}; for (var k in s) if (k !== 'at') c[k] = s[k]; return JSON.stringify(c); }
  function arr(x) { if (Array.isArray(x)) return x; if (x && typeof x === 'object') return Object.keys(x).sort(function (a, b) { return a - b; }).map(function (k) { return x[k]; }); return []; }
  function norm(s) { // whatever came back from the database → a safe snapshot shape (Firebase may turn arrays into objects)
    if (!s || typeof s !== 'object') return null;
    var o = {}; for (var k in s) o[k] = s[k];
    o.h = arr(s.h).map(function (h) { h = h && typeof h === 'object' ? h : {}; var e = {}; for (var q in h) e[q] = h[q]; e.shots = arr(h.shots).filter(function (x) { return typeof x === 'string'; }); e.par = Number(h.par) || 0; return e; });
    return o;
  }

  // ---------- publisher: debounced writes, an offline queue that survives an app restart, retry with backoff ----------
  // opts: base (database URL), fetch, storage {getItem,setItem}, key, build(roundId) → snapshot, online() → bool, now(), setTimeout, clearTimeout,
  //       onStatus(), debounceMs (1500), retryMs (2000, doubles up to 60 s), page (link base)
  function publisher(opts) {
    var O = opts, KEY = O.key || 'golfsg.live.v1', ST = O.setTimeout || setTimeout, CT = O.clearTimeout || clearTimeout;
    var now = O.now || Date.now, online = O.online || function () { return true; };
    var S = load(), tDeb = null, tRetry = null, busy = false, again = false;
    function load() { var x; try { x = JSON.parse(O.storage.getItem(KEY) || 'null'); } catch (e) { x = null; }
      x = x && typeof x === 'object' ? x : {}; x.rounds = x.rounds || {}; x.q = x.q || {}; x.del = x.del || []; x.sent = x.sent || {}; x.attempts = x.attempts || 0; return x; }
    function persist() { try { O.storage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
    function status() { if (O.onStatus) try { O.onStatus(); } catch (e) {} }
    function pendingCount() { return Object.keys(S.q).length + S.del.length; }
    function start(rid) {
      var t = S.rounds[rid]; if (t && t.on) return t.id;
      S.rounds[rid] = { id: token(O.crypto), on: true, since: now() }; persist(); touch(0); status(); return S.rounds[rid].id;
    }
    function stop(rid) {
      var t = S.rounds[rid]; if (!t) return false;
      delete S.rounds[rid]; delete S.q[t.id]; delete S.sent[t.id]; if (S.del.indexOf(t.id) < 0) S.del.push(t.id); persist(); flush(); status(); return true;
    }
    function finish(rid) { var t = S.rounds[rid]; if (t && t.on) { t.fin = 1; persist(); touch(0); } }
    function touch(ms) { CT(tDeb); tDeb = ST(collect, ms == null ? (O.debounceMs == null ? 1500 : O.debounceMs) : ms); }
    function collect() {
      tDeb = null; var ch = false;
      Object.keys(S.rounds).forEach(function (rid) {
        var t = S.rounds[rid]; if (!t.on) return;
        var s = O.build(rid, t); if (!s) return;
        if (t.fin) s.fin = 1;
        var g = sig(s); if (g === S.sent[t.id] && !S.q[t.id]) return;
        if (S.q[t.id] && sig(S.q[t.id]) === g) return;
        S.q[t.id] = s; ch = true;
      });
      if (ch) { persist(); flush(); }
      return ch;
    }
    function req(method, id, body) {
      return O.fetch(dbUrl(O.base, id), { method: method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' })
        .then(function (res) { if (!res.ok) throw new Error('HTTP ' + res.status); return res; });
    }
    function flush() {
      if (busy) { again = true; return Promise.resolve(false); }
      CT(tRetry); tRetry = null;
      if (!pendingCount()) { S.attempts = 0; S.err = ''; status(); return Promise.resolve(true); }
      if (!online()) { S.err = 'offline'; persist(); status(); return Promise.resolve(false); }
      busy = true; again = false;
      var jobs = S.del.map(function (id) { return { del: id }; }).concat(Object.keys(S.q).map(function (id) { return { put: id, s: S.q[id] }; }));
      var p = Promise.resolve();
      jobs.forEach(function (j) { p = p.then(function () {
        if (j.del) return req('DELETE', j.del).then(function () { S.del = S.del.filter(function (x) { return x !== j.del; }); persist(); });
        if (!S.q[j.put] || S.q[j.put] !== j.s) return; // stopped or replaced meanwhile
        return req('PUT', j.put, j.s).then(function () { if (S.q[j.put] === j.s) { delete S.q[j.put]; S.sent[j.put] = sig(j.s); } S.lastOk = now(); persist(); });
      }); });
      return p.then(function () {
        busy = false; S.attempts = 0; S.err = ''; persist(); status();
        if (again || pendingCount()) return flush(); return true;
      }, function (e) {
        busy = false; S.attempts = (S.attempts || 0) + 1; S.err = (e && e.message) || 'failed'; persist(); status();
        var wait = Math.min(60000, (O.retryMs || 2000) * Math.pow(2, S.attempts - 1));
        tRetry = ST(function () { tRetry = null; flush(); }, wait); return false;
      });
    }
    function info(rid) {
      var t = S.rounds[rid]; if (!t || !t.on) return { on: false };
      var waiting = !!S.q[t.id] && (!!S.err || !online());
      return { on: true, id: t.id, link: link(t.id, O.page), waiting: waiting, pending: !!S.q[t.id], lastOk: S.lastOk || 0, fin: !!t.fin };
    }
    return { start: start, stop: stop, finish: finish, touch: touch, collect: collect, flush: flush, info: info, state: function () { return S; },
      retryScheduled: function () { return !!tRetry; }, pending: pendingCount };
  }

  // ---------- viewer (read-only page for family) ----------
  var LIE = { tee: 'Tee', fairway: 'Fairway', rough: 'Rough', bunker: 'Bunker', green: 'Green', hazard: 'Hazard', ob: 'Re-hit after OB', holed: 'Green', holedx: '', deep: 'Deep rough', trees: 'Trees' };
  var DIRN = { short: 'short', long: 'long', left: 'left', right: 'right', shortleft: 'short left', shortright: 'short right', longleft: 'long left', longright: 'long right' };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
  function toPar(n) { return n === 0 ? 'E' : n > 0 ? '+' + n : String(n); }
  function scoreName(d) { return d <= -3 ? 'Albatross' : d === -2 ? 'Eagle' : d === -1 ? 'Birdie' : d === 0 ? 'Par' : d === 1 ? 'Bogey' : d === 2 ? 'Double bogey' : d === 3 ? 'Triple bogey' : '+' + d; }
  function cls(d) { return d <= -2 ? 'eagle' : d === -1 ? 'birdie' : d === 0 ? 'par' : d === 1 ? 'bogey' : 'dbl'; }
  function ago(ms, nowMs) { var s = Math.max(0, Math.round((nowMs - ms) / 1000)); return s < 45 ? 'just now' : s < 90 ? '1 min ago' : s < 3600 ? Math.round(s / 60) + ' min ago' : s < 7200 ? '1 hour ago' : Math.round(s / 3600) + ' hours ago'; }
  function clock(ms) { try { return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; } }
  function parseShot(s) { var p = String(s).split('|'); return { dist: p[0] === '' ? null : +p[0], loc: p[1] || '', dir: p[2] || '', club: p[3] || '', pen: p[4] === '1', layup: p[5] === '1' }; }
  function shotLines(h) {
    var rows = (h.shots || []).map(parseShot), out = [];
    rows.forEach(function (w, k) {
      var holed = w.loc === 'holed' || w.loc === 'holedx', green = w.loc === 'green' || w.loc === 'holed', u = green ? ' ft' : ' yd';
      var d = w.dist != null ? w.dist + u : '';
      var t = holed ? (k === 0 ? 'Hole in one!' : 'In the hole' + (d ? ' from ' + d : '')) : (LIE[w.loc] || w.loc) + (d ? ' · ' + d + ' to the pin' : '');
      var extra = [w.club, w.layup ? 'layup' : '', w.pen ? 'penalty +1' : ''].filter(Boolean).join(' · ');
      var nx = rows[k + 1], end = nx && nx.dir ? 'ended ' + DIRN[nx.dir] : '';
      out.push('<li><span class="lvn">' + (k + 1) + '</span><span class="lvt">' + esc(t) + (extra ? ' <small>' + esc(extra) + '</small>' : '') + (end ? '<em>' + esc(end) + '</em>' : '') + '</span></li>');
    });
    return out.join('');
  }
  function viewerHTML(snap, o) {
    o = o || {}; var nowMs = o.now || Date.now(), s = norm(snap);
    var out = '<div class="frostpage theme-sky lvpage" id="lvpage">';
    if (!s) {
      var msg = o.state === 'gone' ? 'This live round isn’t available. The link may be old, or sharing was stopped.' : o.state === 'error' ? 'Couldn’t reach the live scorecard. Check your signal – it will keep trying.' : 'Loading the live scorecard…';
      return out + '<div class="lvhead frostcard"><p class="lvkick">Pin High · Live</p><h1>Live round</h1><p class="lvmsg" id="lvmsg">' + esc(msg) + '</p></div></div>';
    }
    var who = s.name || 'Live round', date = '';
    try { date = s.date ? new Date(s.date).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }) : ''; } catch (e) {}
    var inProg = s.h[(s.cur || 1) - 1], status = s.fin ? 'Final' : s.thru ? 'Thru ' + s.thru : 'Not started';
    if (o.state === 'gone') out += '<div class="lvbanner" id="lvbanner">Sharing was stopped. This is the last score that was sent.</div>';
    else if (s.fin) out += '<div class="lvbanner fin" id="lvbanner">Round finished – final scorecard</div>';
    out += '<div class="lvhead frostcard"><p class="lvkick"><span class="lvdot' + (o.state === 'live' && !s.fin ? ' on' : '') + '"></span>' + (s.fin ? 'Final' : 'Live') + ' · Pin High</p>' +
      '<h1>' + esc(who) + '</h1><p class="lvsub">' + esc([s.course, s.tee ? s.tee + ' tees' : '', date].filter(Boolean).join(' · ')) + '</p>' +
      '<div class="lvbig"><b id="lvtopar" class="' + (s.thru ? (s.toPar < 0 ? 'under' : s.toPar > 0 ? 'over' : 'even') : '') + '">' + (s.thru ? toPar(s.toPar) : '–') + '</b><span><span id="lvthru">' + status + '</span>' +
      (s.thru ? '<small>' + s.strokes + ' strokes</small>' : '') + (!s.fin && inProg ? '<small id="lvnow">Now on hole ' + s.cur + (inProg.live ? ' · ' + inProg.live + ' shot' + (inProg.live === 1 ? '' : 's') + ' so far' : '') + '</small>' : '') + '</span></div>' +
      '<p class="lvupd" id="lvupd">Updated ' + ago(s.at, nowMs) + (s.at ? ' (' + clock(s.at) + ')' : '') + (o.state === 'error' ? ' · reconnecting…' : '') + '</p></div>';
    // scorecard: two nines
    out += '<div class="lvcard frostcard" id="lvcard">';
    [0, 9].forEach(function (f) {
      var nine = s.h.slice(f, f + 9); if (!nine.length) return;
      var tp = 0, ts = 0, all = true;
      out += '<div class="lvnine"><div class="lvrow lvlab"><span>Hole</span><span>Par</span><span>Score</span></div>';
      nine.forEach(function (h, j) { var i = f + j, d = h.sc != null ? h.sc - h.par : null; tp += h.par; if (h.sc != null) ts += h.sc; else all = false;
        out += '<button class="lvcol' + (o.open === i ? ' open' : '') + (s.cur === i + 1 && !s.fin ? ' now' : '') + '" data-lh="' + i + '" aria-label="Hole ' + (i + 1) + '">' +
          '<span class="lvh">' + (i + 1) + '</span><span class="lvp">' + (h.par || '') + '</span>' +
          '<span class="lvs"><i class="' + (d == null ? (h.live ? 'prog' : 'none') : cls(d)) + '">' + (h.sc != null ? h.sc : h.live ? '·' : '') + '</i></span></button>'; });
      out += '<div class="lvrow lvtot"><span>' + (f ? 'In' : 'Out') + '</span><span>' + (tp || '') + '</span><span>' + (ts || '') + '</span></div></div>';
    });
    out += '<p class="lvkey"><i class="birdie">3</i> birdie <i class="par">4</i> par <i class="bogey">5</i> bogey <i class="dbl">6</i> double+</p><p class="lvtap">Tap a hole to see its shots</p></div>';
    if (o.open != null && s.h[o.open]) {
      var h = s.h[o.open], d2 = h.sc != null ? h.sc - h.par : null;
      out += '<div class="lvshots frostcard" id="lvshots"><h2>Hole ' + (o.open + 1) + ' <small>Par ' + h.par + '</small>' + (h.sc != null ? '<span class="lvres ' + cls(d2) + '">' + h.sc + ' · ' + scoreName(d2) + '</span>' : h.live ? '<span class="lvres prog">Playing now</span>' : '') + '</h2>' +
        (h.sc != null ? '<p class="lvfacts">' + [h.fw != null ? (h.fw ? 'Fairway ✓' : 'Missed fairway') : '', h.gir ? 'Green in regulation ✓' : 'Missed green in regulation', h.putts != null ? h.putts + ' putt' + (h.putts === 1 ? '' : 's') : ''].filter(Boolean).map(esc).join(' · ') + '</p>' : '') +
        ((h.shots || []).length ? '<ol class="lvlist">' + shotLines(h) + '</ol>' : '<p class="lvmsg">No shots yet.</p>') + '</div>';
    }
    out += '<p class="lvfoot">Watching only – nothing here changes the round. Updates appear by themselves.</p></div>';
    return out;
  }
  function birdiesOf(s) { s = norm(s); var b = {}; if (s) s.h.forEach(function (h, i) { if (h.sc != null && h.sc - h.par <= -1) b[i] = h.sc - h.par; }); return b; }
  function newBirdies(prev, next) { var a = birdiesOf(prev), b = birdiesOf(next); return Object.keys(b).filter(function (i) { return !(i in a); }).map(Number); }
  function applyEvent(cur, type, ev) { // Firebase streaming 'put' / 'patch' {path, data}
    var path = String(ev.path || '/').split('/').filter(Boolean);
    if (!path.length) { if (type === 'put') return ev.data; var o = {}, k; for (k in (cur || {})) o[k] = cur[k]; for (k in (ev.data || {})) o[k] = ev.data[k]; return o; }
    var root = JSON.parse(JSON.stringify(cur || {})), node = root;
    for (var i = 0; i < path.length - 1; i++) { if (!node[path[i]] || typeof node[path[i]] !== 'object') node[path[i]] = {}; node = node[path[i]]; }
    var last = path[path.length - 1];
    if (type === 'patch') { node[last] = node[last] && typeof node[last] === 'object' ? node[last] : {}; for (var q in (ev.data || {})) node[last][q] = ev.data[q]; }
    else if (ev.data === null) delete node[last]; else node[last] = ev.data;
    return root;
  }
  // startViewer: wires the page. opts: base, EventSource, fetch, setTimeout/setInterval, now, pollMs (5000), oriole (image path)
  function startViewer(el, id, opts) {
    opts = opts || {}; var ES = 'EventSource' in opts ? opts.EventSource : root.EventSource, F = opts.fetch || (root.fetch && root.fetch.bind(root));
    var ST = opts.setTimeout || setTimeout, SI = opts.setInterval || setInterval, now = opts.now || Date.now, url = dbUrl(opts.base, id);
    var V = { snap: null, state: 'loading', open: null, first: true, es: null, poll: null };
    function draw() { var y = root.scrollY; el.innerHTML = viewerHTML(V.snap, { state: V.state, open: V.open, now: now() }); if (root.scrollTo && y) root.scrollTo(0, y); }
    function celebrate(i, d) {
      if (!root.document) return; var old = root.document.getElementById('lvcele'); if (old) old.remove();
      var c = root.document.createElement('div'); c.id = 'lvcele'; c.className = 'lvcele'; c.setAttribute('role', 'status');
      c.innerHTML = '<div class="lvcele-in"><img src="' + (opts.oriole || 'img/oriole.webp') + '" alt="Oriole"><p><b>' + (d <= -2 ? scoreName(d) : 'Birdie') + ' on hole ' + (i + 1) + '!</b><span>Nice one' + (V.snap && V.snap.name ? ', ' + esc(V.snap.name) : '') + '!</span></p></div>';
      c.addEventListener('click', function () { c.remove(); }); root.document.body.appendChild(c);
      ST(function () { c.classList.add('out'); ST(function () { c.remove(); }, 600); }, opts.celebrateMs || 5000);
    }
    function set(data) {
      var prev = V.snap; V.snap = data === null ? (prev ? prev : null) : data; V.state = data === null ? 'gone' : 'live';
      var nb = !V.first && data ? newBirdies(prev, data) : []; V.first = false; draw();
      if (nb.length) { var i = nb[nb.length - 1]; celebrate(i, birdiesOf(data)[i]); }
    }
    function poll() { if (V.poll) return; var go = function () { F(url, { cache: 'no-store' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (d) { if (V.state === 'live' && JSON.stringify(d) === JSON.stringify(V.snap)) return; set(d); }, function () { if (V.state !== 'gone') { V.state = 'error'; draw(); } }); };
      go(); V.poll = SI(go, opts.pollMs || 5000); }
    function stream() {
      var es; try { es = new ES(url); } catch (e) { return poll(); } V.es = es; var raw = null;
      var on = function (type) { return function (e) { var ev; try { ev = JSON.parse(e.data); } catch (x) { return; } raw = applyEvent(raw, type, ev); set(raw == null ? null : JSON.parse(JSON.stringify(raw))); }; };
      es.addEventListener('put', on('put')); es.addEventListener('patch', on('patch'));
      es.addEventListener('cancel', function () { es.close(); V.es = null; poll(); });
      es.onerror = function () { if (es.readyState === 2) { V.es = null; poll(); } else if (V.state === 'live') { V.state = 'error'; draw(); } };
      es.onopen = function () { if (V.state === 'error') { V.state = 'live'; draw(); } };
    }
    el.addEventListener('click', function (ev) { var b = ev.target.closest && ev.target.closest('[data-lh]'); if (!b) return; var i = +b.getAttribute('data-lh'); V.open = V.open === i ? null : i; draw(); });
    draw(); if (ES) stream(); else poll();
    SI(function () { var u = root.document && root.document.getElementById('lvupd'); if (u && V.snap) draw(); }, 30000); // keep "x min ago" fresh
    return { state: function () { return V; }, set: set, draw: draw };
  }

  var api = { token: token, validId: validId, watchId: watchId, link: link, dbUrl: dbUrl, snapshot: snapshot, sig: sig, norm: norm, publisher: publisher,
    viewerHTML: viewerHTML, newBirdies: newBirdies, applyEvent: applyEvent, startViewer: startViewer, TOKEN_LEN: TOKEN_LEN, PAGE: PAGE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.LIVE = api;
})(typeof window !== 'undefined' ? window : globalThis);
