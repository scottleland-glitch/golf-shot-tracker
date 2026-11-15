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
  var Core = window.StrokewiseWatchCore;
  if (!Core || !C.registerPlugin) return;
  try { if (C.isPluginAvailable && !C.isPluginAvailable('StrokewiseWatch')) return; } catch (e) { return; }
  var P = C.registerPlugin('StrokewiseWatch');
  var ACK_KEY = 'golfsg.watchacks.v1', lastPush = '', timer = null, busy = false, again = false;
  var app = function () { return window.STROKEWISE_APP; };
  function loadAcks() { try { var a = JSON.parse(localStorage.getItem(ACK_KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  function saveAcks(a) { try { localStorage.setItem(ACK_KEY, JSON.stringify(a)); } catch (e) {} }
  function currentRound() { var A = app(); if (!A) return null; var id = A.current(); return id ? (A.rounds().filter(function (r) { return r.id === id; })[0] || null) : null; }

  // ---- phone → watch ----
  function push(force) {
    var r = currentRound(), st = Core.buildState(r, loadAcks()), body = JSON.stringify(st), same = JSON.stringify(Object.assign({}, st, { ts: 0 }));
    if (!force && same === lastPush) return Promise.resolve();
    lastPush = same;
    return P.pushState({ json: body }).catch(function () { lastPush = ''; });
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
      if (res.ok) touched[e.roundId] = r;
      acks = Core.pushAck(acks, e.id, res.ok, res.reason);
    });
    Object.keys(touched).forEach(function (id) { A.commit(touched[id]); }); // the app's own save() + redraw (live sharing, backup)
    saveAcks(acks); // right after the save, so a relaunch can't apply the same undo / delete twice
    return Promise.resolve(qids.length ? P.ack({ qids: qids }) : null).then(function () { return push(true); }, function () { return push(true); });
  }
  function drain() {
    if (busy) { again = true; return Promise.resolve(); }
    busy = true;
    return P.getPending().then(function (res) { return process(res && res.items); }).catch(function () {}).then(function () { busy = false; if (again) { again = false; return drain(); } });
  }

  window.STROKEWISE_WATCH = { changed: soon, drain: drain, push: push, process: process };
  try {
    P.addListener('watchMessage', function () { drain(); });
    P.addListener('watchHello', function () { push(true); });
  } catch (e) {}
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') { drain().then(function () { push(true); }); } });
  window.addEventListener('focus', function () { drain(); });
  var start = function () { drain().then(function () { push(true); }); };
  if (document.readyState === 'complete') setTimeout(start, 300); else window.addEventListener('load', function () { setTimeout(start, 300); });
})();
