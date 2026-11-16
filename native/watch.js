/* StrokeWise Apple Watch – the iPhone app's side of the watch link (JS). Added to www/ by native/build-www.sh only in the watch build,
 * and it does nothing at all outside the native app (website, PWA) or when the iPhone app has no watch plugin.
 *  · Watch → phone: shots, edits, deletes and undos arrive through the native plugin (StrokewiseWatch), which keeps them in the phone's
 *    UserDefaults until we ack them here – so nothing is lost when the app was asleep or the web view was not ready.
 *    Each one is applied to the round in progress with the same rules as the hole entry (native/watch-core.js), saved by the app's own
 *    save() (golfsg.rounds.v1, live sharing and backups keep working), then acked. An event id is remembered, so a retried message is ignored.
 *  · Phone → watch: after every save (and when the app comes back, or the watch says hello) the current round is pushed as a small
 *    picture (hole, rows, totals) plus the ids of events already applied or refused – the watch drops those from its waiting list.
 */
(function () {
  'use strict';
  var C = window.Capacitor;
  if (!C || !C.isNativePlatform || !C.isNativePlatform()) return;
  var Core = window.StrokewiseWatchCore, P = null, missing = '';
  // This app has no JS bundler, so window.Capacitor is only the native bridge: plugins are on Capacitor.Plugins (registerPlugin is part of
  // @capacitor/core's JS, which isn't loaded here – asking for it first made this whole file stop silently and the watch never got anything).
  try { P = (C.Plugins && C.Plugins.StrokewiseWatch) || (C.registerPlugin ? C.registerPlugin('StrokewiseWatch') : null); } catch (e) { P = null; }
  if (!Core) missing = 'watch-core.js did not load';
  else if (!P) missing = 'the StrokewiseWatch plugin is not in this build (plugins found: ' + Object.keys(C.Plugins || {}).join(', ') + ')';
  var ACK_KEY = 'golfsg.watchacks.v1', lastPush = '', timer = null, busy = false, again = false;
  var app = function () { return window.STROKEWISE_APP; };
  // ---- a small debug log (Settings → Apple Watch shows it): what the phone tried, and what the native side said ----
  var LOG_KEY = 'golfsg.watchlog.v1', logs = [], info = null, infoAt = 0;
  try { var old = JSON.parse(localStorage.getItem(LOG_KEY) || '[]'); if (Array.isArray(old)) logs = old.slice(-40); } catch (e) {}
  function log(m) { logs.push({ t: Date.now(), m: String(m).slice(0, 200) }); logs = logs.slice(-40); try { localStorage.setItem(LOG_KEY, JSON.stringify(logs)); } catch (e) {} }
  function refreshInfo() {
    if (missing || !P.getInfo) { info = { missing: missing || 'no getInfo' }; paint(); return Promise.resolve(info); }
    return Promise.resolve(P.getInfo()).then(function (i) { info = i || null; infoAt = Date.now(); paint(); return info; }, function (e) { log('getInfo failed: ' + (e && e.message || e)); info = null; paint(); });
  }
  function ago(t) { var s = Math.max(0, Math.round((Date.now() - t) / 1000)); return s < 90 ? s + 's ago' : Math.round(s / 60) + ' min ago'; }
  function esc(x) { return String(x).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function yn(v) { return v ? 'yes' : 'no'; }
  function panelHTML() {
    var i = info, rows = logs.slice(-8).reverse().map(function (l) { return '<div>' + esc(ago(l.t)) + ' · ' + esc(l.m) + '</div>'; }).join('');
    var st = !i ? 'checking…' : i.missing ? 'NOT WORKING: ' + esc(i.missing) : (i.supported === false ? 'this iPhone cannot pair a watch' : 'paired: ' + yn(i.paired) + ' · watch app installed: ' + yn(i.installed) + ' · link active: ' + yn(i.activated) + ' · reachable now: ' + yn(i.reachable));
    return '<div id="watchpanel" class="tiprow" style="display:block;margin:12px 0;font-size:12px;line-height:1.45"><b>Apple Watch</b><div>' + st + '</div>' +
      (i && !i.missing && i.lastSend ? '<div>last send: ' + esc(i.lastSend) + (i.sent ? ' · sent ' + esc(i.sent) + '×' : '') + '</div>' : '') +
      (i && i.lastError ? '<div>last problem: ' + esc(i.lastError) + '</div>' : '') +
      '<button class="big frostbtn" id="watchsend" type="button" style="margin:6px 0">Send this round to the watch now</button>' +
      '<div style="opacity:.75">' + (rows || 'Nothing yet.') + '</div></div>';
  }
  function paint() { var el = document.getElementById('watchpanel'); if (el) { var d = document.createElement('div'); d.innerHTML = panelHTML(); el.parentNode.replaceChild(d.firstChild, el); } }
  function panel() { setTimeout(refreshInfo, 0); return panelHTML(); }
  document.addEventListener('click', function (e) { var t = e.target; if (t && t.id === 'watchsend' && !missing) { log('manual send'); push(true).then(refreshInfo); } });
  if (missing) { // say so in Settings → Apple Watch instead of doing nothing
    log(missing); info = { missing: missing };
    window.STROKEWISE_WATCH = { changed: function () {}, drain: function () { return Promise.resolve(); }, push: function () { return Promise.resolve(); }, process: function () { return Promise.resolve(); }, panel: panelHTML, log: function () { return logs.slice(); } };
    return;
  }
  function loadAcks() { try { var a = JSON.parse(localStorage.getItem(ACK_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function saveAcks(a) { try { localStorage.setItem(ACK_KEY, JSON.stringify(a)); } catch (e) {} }
  function currentRound() { var A = app(); if (!A) return null; var id = A.current(); return id ? (A.rounds().filter(function (r) { return r.id === id; })[0] || null) : null; }

  // ---- phone → watch ----
  // A round just started on the phone: wake the watch app once for that round (the plugin asks for Health access the first time and calls
  // HKHealthStore.startWatchApp; the watch app starts its Golf workout). Remembered per round id, so later shots, relaunches and the
  // Settings "send now" button never do it again. Rounds that are over, or untouched for 6 h, never launch it.
  var LAUNCH_KEY = 'golfsg.watchlaunch.v1', launchBusy = false, tries = { id: '', n: 0, at: 0 };
  function maybeLaunch(r, st) {
    if (!st.roundId || st.over || !P.startWatchApp || launchBusy) return;
    var seen = ''; try { seen = localStorage.getItem(LAUNCH_KEY) || ''; } catch (e) {}
    if (seen === st.roundId) return;
    if (st.upd && Date.now() - st.upd > 6 * 3600 * 1000) return;
    // A refused launch (watch out of reach, Health not allowed yet) is tried again on a later push for the same round: at most 3 times, 20 s apart.
    // Only a launch the system accepted is remembered, so one round never wakes the watch twice.
    if (tries.id !== st.roundId) tries = { id: st.roundId, n: 0, at: 0 };
    if (tries.n >= 3 || Date.now() - tries.at < 20000) return;
    tries.n++; tries.at = Date.now(); launchBusy = true;
    log('new round: waking the watch app' + (tries.n > 1 ? ' (try ' + tries.n + ')' : ''));
    Promise.resolve(P.startWatchApp()).then(function (res) {
      if (res && res.ok) { try { localStorage.setItem(LAUNCH_KEY, st.roundId); } catch (e) {} }
      log(res && res.ok ? 'watch app launched' : 'watch app NOT launched: ' + (res && res.reason || 'no answer')); launchBusy = false; refreshInfo();
    }, function (e) { launchBusy = false; log('watch app launch failed: ' + (e && e.message || e)); });
  }
  function push(force) {
    var r = currentRound(), st = Core.buildState(r, loadAcks()), body = JSON.stringify(st), same = JSON.stringify(Object.assign({}, st, { ts: 0 }));
    if (!force && same === lastPush) return Promise.resolve();
    lastPush = same;
    if (r) maybeLaunch(r, st);
    return P.pushState({ json: body }).then(function () { log('pushed ' + (st.roundId ? 'round ' + st.roundId + ' hole ' + ((st.hole || 0) + 1) : 'no round') + ' (' + body.length + ' bytes)'); },
      function (e) { lastPush = ''; log('push FAILED: ' + (e && e.message || e)); });
  }
  function soon() { clearTimeout(timer); timer = setTimeout(function () { push(false); }, 500); }

  // ---- watch → phone ----
  function bySeq(a, b) { return (a.ev.seq || 0) - (b.ev.seq || 0) || (a.ev.t || 0) - (b.ev.t || 0); }
  function process(items) {
    var A = app(), acks = loadAcks(), list = [], qids = [], touched = {};
    (items || []).forEach(function (it) { qids.push(it.qid); try { var e = JSON.parse(it.json); if (e && e.id) list.push({ ev: e }); } catch (x) {} });
    list.sort(bySeq);
    list.forEach(function (it) {
      var e = it.ev; if (Core.knows(acks, e.id)) return; // already applied (or refused) – a retried message
      var r = A && A.rounds().filter(function (x) { return x.id === e.roundId; })[0], res;
      if (!A || !r || A.current() !== e.roundId) res = { ok: false, reason: 'noround' };
      else { try { res = Core.applyEvent(r, e); } catch (x) { res = { ok: false, reason: 'bad' }; } }
      if (e.type === 'end') { if (res.ok) log('the watch ended its round tracking (workout saved); the round itself stays open on the phone'); }
      else if (res.ok) touched[e.roundId] = r;
      acks = Core.pushAck(acks, e.id, res.ok, res.reason);
    });
    Object.keys(touched).forEach(function (id) { A.commit(touched[id]); }); // the app's own save() + redraw (live sharing, backup)
    saveAcks(acks); // right after the save, so a relaunch can't apply the same undo / delete twice
    return Promise.resolve(qids.length ? P.ack({ qids: qids }) : null).then(function () { return push(true); }, function () { return push(true); });
  }
  function drain() {
    if (busy) { again = true; return Promise.resolve(); }
    busy = true;
    return P.getPending().then(function (res) { if (res && res.items && res.items.length) log('from the watch: ' + res.items.length + ' message(s)'); return process(res && res.items); }).catch(function (e) { log('getPending failed: ' + (e && e.message || e)); }).then(function () { busy = false; if (again) { again = false; return drain(); } });
  }

  window.STROKEWISE_WATCH = { changed: soon, drain: drain, push: push, process: process, panel: panel, log: function () { return logs.slice(); } };
  log('watch link started');
  try {
    P.addListener('watchMessage', function () { log('watch message arrived'); drain(); });
    P.addListener('watchHello', function () { log('watch said hello'); push(true); });
    P.addListener('watchReachability', function (e) { log('watch reachable: ' + yn(e && e.reachable)); paint(); });
  } catch (e) {}
  refreshInfo().then(function (i) { if (i) log('link: ' + (i.supported === false ? 'unsupported' : 'paired ' + yn(i.paired) + ', watch app installed ' + yn(i.installed) + ', active ' + yn(i.activated))); });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') { drain().then(function () { push(true); }); } });
  window.addEventListener('focus', function () { drain(); });
  var start = function () { drain().then(function () { push(true); }); };
  if (document.readyState === 'complete') setTimeout(start, 300); else window.addEventListener('load', function () { setTimeout(start, 300); });
})();
