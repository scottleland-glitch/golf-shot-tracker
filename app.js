/* Golf Shot Tracker - UI (v4: shot rows + selectable SG baselines). Data lives in localStorage on the phone. */
(function () {
  'use strict';
  var KEY = 'golfsg.rounds.v1', CUR = 'golfsg.current.v1', PN = 'golfsg.player.v1';
  function playerName() { return (localStorage.getItem(PN) || '').trim(); }
  // Rounds that belong to this phone's player (unnamed rounds count as theirs). Backups contain only these,
  // so another player's rounds loaded from OneDrive are never written into this player's file.
  function ownRounds() { var n = playerName(); return rounds.filter(function (r) { return !r.player || r.player === n; }); }
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
  (function () { var n = playerName(), ch = false; if (n) rounds.forEach(function (r) { if (!r.player) { r.player = n; ch = true; } }); if (ch) localStorage.setItem(KEY, JSON.stringify(rounds)); })(); // rounds belong to this phone's player
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
  function save() { localStorage.setItem(KEY, JSON.stringify(rounds)); odDirty(60000); }
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
    var r = { v: 3, dv: 2, id: 'r' + Date.now(), date: new Date().toISOString(), course: course || '', player: playerName(), baseline: sel ? sel.value : 'pga', holes: [] };
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
    else if (view.screen === 'history') el.innerHTML = historyHTML();
    else if (view.screen === 'odrestore') el.innerHTML = odRestoreHTML();
    else if (view.screen === 'home' || !round()) el.innerHTML = homeHTML();
    else if (view.screen === 'hole') el.innerHTML = holeHTML() + (view.pinOpen ? pinHTML() : '');
    else if (view.screen === 'about') el.innerHTML = aboutHTML();
    else el.innerHTML = summaryHTML() + (view.map ? mapHTML() : '');
    if (view.screen !== 'hole') document.body.classList.toggle('noscroll', !!(view.map && view.screen === 'summary'));
  }

  // ---------- History ----------
  function playersIn() { var o = {}; rounds.forEach(function (r) { if (r.player) o[r.player] = (o[r.player] || 0) + 1; }); return o; }
  function historyHTML() {
    var P = playersIn(), names = Object.keys(P).sort(), multi = names.length + (rounds.some(function (r) { return !r.player; }) && names.length ? 1 : 0) > 1;
    if (!multi || (view.histPlayer && view.histPlayer !== '~none' && !P[view.histPlayer])) view.histPlayer = null;
    var list = rounds.filter(function (r) { return !view.histPlayer || (view.histPlayer === '~none' ? !r.player : r.player === view.histPlayer); }).sort(function (a, b) { return String(b.date || '').localeCompare(String(a.date || '')); });
    var h = '<div class="topbar"><button class="txt" data-act="home">‹ Home</button><div class="title"><b>History</b><span>' + rounds.length + ' round' + (rounds.length === 1 ? '' : 's') + ', newest first</span></div><span class="tbspace"></span></div>';
    if (multi) h += '<div class="liechips" id="playerchips" role="group" aria-label="Filter by player">' + [''].concat(names).map(function (n) {
        var sel = (view.histPlayer || '') === n; return '<button class="' + (sel ? 'sel' : '') + '" data-act="histplayer" data-v="' + esc(n) + '" aria-pressed="' + sel + '">' + (n ? esc(n) + ' (' + P[n] + ')' : 'All players') + '</button>'; }).join('') +
      (rounds.some(function (r) { return !r.player; }) ? '<button class="' + (view.histPlayer === '~none' ? 'sel' : '') + '" data-act="histplayer" data-v="~none">No name</button>' : '') + '</div>';
    if (!list.length) h += '<p class="muted">No rounds yet. Start one from Home.</p>';
    h += '<div id="histlist">';
    list.forEach(function (r) {
      var S = SG.summarize(r);
      h += '<div class="hrow" data-id="' + r.id + '"><button class="hist" data-act="open" data-id="' + r.id + '"><span><b>' + new Date(r.date).toLocaleDateString() + '</b>' +
        (r.course ? '<br>' + esc(r.course) : '') + (r.player ? '<br><span class="hplayer">👤 ' + esc(r.player) + '</span>' : '') + '<br><small class="muted">' + S.holesDone + ' of ' + r.holes.length + ' holes played</small></span><span class="hscore">' +
        (S.holesDone ? '<b>' + S.strokes + '</b> (' + toPar(S.toPar) + ')' : '–') + '<br><small class="' + sgCls(S.sgTotal) + '">SG ' + fmtSG(S.sgTotal) + '</small><br><small class="muted">vs ' + esc(blName(blOf(r))) + '</small></span></button>' +
        '<button class="hdel" data-act="delHist" data-id="' + r.id + '" aria-label="Delete round ' + esc(new Date(r.date).toLocaleDateString() + (r.course ? ' ' + r.course : '')) + '">🗑</button></div>';
    });
    return h + '</div>';
  }
  // ---------- Backup / restore ----------
  var BK = 'golfsg.lastBackup.v1';
  function localDay(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function backupReminder() {
    if (!rounds.length) return '';
    var last = localStorage.getItem(BK), days = last ? Math.floor((Date.now() - new Date(last).getTime()) / 864e5) : null;
    if (days == null) return 'Tip: you haven\'t backed up your rounds yet. Tap Back up rounds to save a copy to Files or OneDrive.';
    return days >= 14 ? 'It\'s been ' + days + ' days since your last backup. Tap Back up rounds to save a fresh copy.' : '';
  }
  function backupDone() { localStorage.setItem(BK, new Date().toISOString()); var nO = ownRounds().length; view.notice = { text: 'Backup ready: ' + nO + ' round' + (nO === 1 ? '' : 's') + ' for ' + playerName() + ' saved.' }; if (view.screen === 'home') render(); }
  function backupRounds() {
    if (!playerName()) { askName('Enter your player name first – it goes in the backup file name.'); return; }
    var name = 'golf-rounds-' + window.OD.slug(playerName()) + '-' + localDay(new Date()) + '.json', json = JSON.stringify(SG.makeBackup(ownRounds(), null, playerName()), null, 1), file;
    try { file = new File([json], name, { type: 'application/json' }); } catch (e) { file = null; }
    if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ files: [file], title: name }).then(backupDone).catch(function (e) {
        if (e && e.name === 'AbortError') { toast('Backup cancelled'); return; }
        download(json, name, 'application/json'); backupDone();
      });
      return;
    }
    download(json, name, 'application/json'); backupDone();
  }
  function restoreFrom(text) {
    var P = SG.parseBackup(text);
    if (P.error) { view.notice = { text: P.error, bad: true }; render(); return; }
    var bp = ''; try { bp = (JSON.parse(text) || {}).player || ''; } catch (e) {}
    if (bp) P.rounds.forEach(function (r) { if (!r.player) r.player = bp; }); // label rounds with the backup's player
    var conf = SG.conflictsOf(rounds, P.rounds), replace = false;
    if (conf.length) replace = confirm(conf.length + ' round' + (conf.length === 1 ? '' : 's') + ' in the backup ' + (conf.length === 1 ? 'is' : 'are') + ' different from the copy on this phone (' +
      conf.slice(0, 3).map(function (r) { return new Date(r.date).toLocaleDateString() + (r.course ? ' ' + r.course : ''); }).join(', ') + (conf.length > 3 ? ', …' : '') +
      ').\n\nOK = replace with the backup version\nCancel = keep the phone\'s version');
    var M = SG.mergeRounds(rounds, P.rounds, replace);
    localStorage.setItem(KEY, JSON.stringify(M.rounds)); rounds = load(); if (M.added || M.replaced) odDirty(3000); // uploads only this player's rounds
    var parts = [M.added + ' added'];
    if (M.replaced) parts.push(M.replaced + ' replaced');
    if (M.kept) parts.push(M.kept + ' kept as on this phone');
    if (M.same) parts.push(M.same + ' already here');
    view.notice = { text: '✓ Restored from backup: ' + parts.join(', ') + '. You now have ' + rounds.length + ' round' + (rounds.length === 1 ? '' : 's') + '.' };
    view.screen = 'home'; render(); window.scrollTo(0, 0);
  }
  // ---------- OneDrive backup (hidden unless config.js has a client ID) ----------
  // Sign-in uses MSAL redirect flow (auth code + PKCE): popups are unreliable in iOS home-screen apps.
  var CFG = window.GOLF_CONFIG || {}, ODX = window.OD, odOn = !!(ODX && ODX.enabled(CFG)), pca = null, odAcct = null, odReady = false, odTimer = null, odBusy = false, odFiles = null;
  var odState = odOn ? ODX.loadState(localStorage) : null;
  // The connected account is also remembered here, so Home shows "Connected" straight away on relaunch, and if
  // MSAL's own cache is ever lost we show "Reconnect" (with the account pre-filled) instead of starting over.
  var ODA = 'golfsg.onedrive.account.v1';
  function odSavedAcct() { try { return JSON.parse(localStorage.getItem(ODA)); } catch (e) { return null; } }
  function odRemember(a) { if (a) localStorage.setItem(ODA, JSON.stringify({ username: a.username || '', name: a.name || '', homeAccountId: a.homeAccountId || '' })); else localStorage.removeItem(ODA); }
  if (odOn && odSavedAcct()) odAcct = odSavedAcct();
  function odSaveState() { ODX.saveState(localStorage, odState); }
  function odDirty(delay) { if (!odOn) return; ODX.markDirty(odState); odSaveState(); if (odAcct) odSoon(delay); }
  function odSoon(delay) { if (!odOn || !odAcct) return; clearTimeout(odTimer); odTimer = setTimeout(odSync, delay == null ? 1500 : delay); }
  function odToken() {
    if (!pca || !pca.getAllAccounts().length) { var x0 = new Error('Reconnect needed'); x0.kind = 'interaction'; return Promise.reject(x0); }
    return pca.acquireTokenSilent({ scopes: ODX.SCOPES, account: pca.getActiveAccount() || pca.getAllAccounts()[0] }).then(function (r) { return r.accessToken; }, function (e) {
      var x = new Error('Reconnect needed'); x.kind = (e && /interaction_required|login_required|consent_required|no_tokens_found|InteractionRequired/i.test((e.errorCode || '') + ' ' + (e.name || ''))) ? 'interaction' : 'offline'; throw x;
    });
  }
  function odBackupJson() { return JSON.stringify(SG.makeBackup(ownRounds(), null, playerName()), null, 1); }
  function odSync() {
    if (!odOn || !odAcct || odBusy || !odState.pending) return Promise.resolve();
    odBusy = true;
    return ODX.sync({ state: odState, fetch: window.fetch.bind(window), getToken: odToken, json: odBackupJson(), online: navigator.onLine, player: playerName() }).then(function (st) {
      odBusy = false; odState = st; odSaveState();
      if (!st.pending) localStorage.setItem(BK, st.lastOk);
      else if (!st.needsAuth && navigator.onLine && playerName()) odSoon(ODX.retryDelay(st.attempts));
      odRefresh();
    });
  }
  function odRefresh() { var el = document.getElementById('odcard'); if (el) el.outerHTML = odCardHTML(); var rm = document.getElementById('bkremind'); if (rm && odAcct) rm.remove(); }
  function odStatus() {
    if (odState.needsAuth) return '<b class="neg">Sign-in expired.</b> Tap Reconnect to keep backing up.';
    if (odBusy) return 'Uploading…';
    if (odState.pending) return '⏳ Waiting to upload' + (odState.lastError ? ' – ' + esc(odState.lastError) : '');
    return odState.lastOk ? '✓ Backed up ' + new Date(odState.lastOk).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Not backed up yet';
  }
  function odCardHTML() {
    if (!odOn) return '';
    var h = '<div class="odcard" id="odcard"><h3>☁️ OneDrive backup</h3>';
    if (!odReady && !odAcct) return h + '<p class="help muted">Loading…</p></div>';
    if (!odAcct) return h + '<p class="help muted">Connect once and every finished hole and round is copied to OneDrive automatically (Apps › Golf Shot Tracker folder). Works offline – uploads wait until you have signal.</p>' +
      '<button class="big primary" data-act="odconnect">Connect OneDrive</button></div>';
    return h + '<p class="odacct" id="odacct">Connected as <b>' + esc(odAcct.username || odAcct.name || 'Microsoft account') + '</b></p>' +
      '<p class="odstat" id="odstat" role="status">' + odStatus() + '</p>' +
      (odState.needsAuth ? '<button class="big primary" data-act="odreauth">Reconnect OneDrive</button>' : '') +
      '<div class="odbtns"><button class="big" data-act="odsync">Back up now</button><button class="big" data-act="odrestore">Restore from OneDrive</button></div>' +
      '<button class="txt oddisc" data-act="oddisconnect">Disconnect OneDrive</button></div>';
  }
  function odRestoreHTML() {
    var h = '<div class="topbar"><button class="txt" data-act="home">‹ Home</button><div class="title"><b>Restore from OneDrive</b><span>' + esc(odAcct ? odAcct.username || '' : '') + '</span></div><span></span></div>';
    if (odFiles === null) return h + '<p class="help muted" id="odlist">Loading backups…</p>';
    if (odFiles.error) return h + '<p class="notice bad" id="odlist">' + esc(odFiles.error) + '</p><button class="big" data-act="odrestore">Try again</button>';
    if (!odFiles.length) return h + '<p class="help muted" id="odlist">No backups on OneDrive yet.</p>';
    var me = ODX.slug(playerName());
    return h + '<p class="help muted">Pick a backup – yours or another player\'s. Its rounds are merged with this phone (each round keeps its player name): new rounds are added, rounds already here are not duplicated, and you\'re asked before any round is replaced.</p><div id="odlist">' +
      ODX.groupFiles(odFiles).map(function (g) {
        return '<div class="odgroup" data-player="' + esc(g.legacy ? '~legacy' : g.slug) + '"><h3>' + (g.legacy ? '🗂 Older backup' : '👤 ' + esc(g.label)) + (g.slug && g.slug === me ? ' <small class="muted">(you)</small>' : '') + '</h3>' +
          g.files.map(function (f) { return '<button class="big odfile" data-act="odpick" data-v="' + esc(f.name) + '"><b>' + (f.date ? 'Weekly copy ' + esc(f.date) : g.legacy ? 'Older backup (before player names)' : 'Latest backup') + '</b><br><small>' +
            (f.modified ? new Date(f.modified).toLocaleString() : '') + ' · ' + Math.max(1, Math.round((f.size || 0) / 1024)) + ' KB</small></button>'; }).join('') + '</div>'; }).join('') + '</div>';
  }
  function odLoadMsal() {
    return new Promise(function (res, rej) { if (window.msal) return res(); var sc = document.createElement('script'); sc.src = 'vendor/msal-browser.min.js'; sc.onload = res; sc.onerror = rej; document.head.appendChild(sc); });
  }
  function odInit() {
    if (!odOn) return;
    odLoadMsal().then(function () {
      // msal-browser v3 on purpose: v4 encrypts its localStorage cache with a key kept in a SESSION cookie, so a
      // relaunched iOS home-screen app loses the sign-in. v3's localStorage cache survives relaunch; the
      // refresh token (offline_access) lets acquireTokenSilent renew access tokens without any UI.
      pca = new window.msal.PublicClientApplication({ auth: { clientId: CFG.onedriveClientId.trim(), authority: CFG.onedriveAuthority || 'https://login.microsoftonline.com/consumers',
        redirectUri: location.origin + location.pathname, navigateToLoginRequestUrl: false }, cache: { cacheLocation: 'localStorage', storeAuthStateInCookie: false } });
      return pca.initialize().then(function () { return pca.handleRedirectPromise(); });
    }).then(function (resp) {
      if (resp && resp.account) { pca.setActiveAccount(resp.account); odState.needsAuth = false; ODX.markDirty(odState); odSaveState(); toast('OneDrive connected'); }
      var saved = odSavedAcct(), all = pca.getAllAccounts();
      odAcct = pca.getActiveAccount() || (saved && all.filter(function (a) { return a.homeAccountId === saved.homeAccountId; })[0]) || all[0] || null;
      if (odAcct) { pca.setActiveAccount(odAcct); odRemember(odAcct); }
      else if (saved) { odAcct = saved; odState.needsAuth = true; odSaveState(); } // MSAL cache gone: keep showing the account, offer Reconnect
      if (/[#?&](code|error|state)=/.test(location.hash + location.search)) history.replaceState(null, '', location.pathname);
      odReady = true; odRefresh();
      if (odAcct && !odState.needsAuth && navigator.onLine) odToken().then(function () { if (odState.needsAuth) { odState.needsAuth = false; odSaveState(); odRefresh(); } }, function (e) {
        if (e.kind === 'interaction') { odState.needsAuth = true; odSaveState(); odRefresh(); } }); // silent refresh via the cached refresh token
      if (odAcct && odState.pending) odSoon(500);
    }).catch(function (e) { odReady = true; odAcct = null; odRefresh(); toast('OneDrive: ' + ((e && (e.errorMessage || e.message)) || 'sign-in failed').slice(0, 120)); });
    window.addEventListener('online', function () { if (odState.pending) odSoon(500); });
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && odState.pending) odSoon(500); });
  }
  function odAct(act, v) {
    if (!pca) { toast('OneDrive is still starting – try again in a moment'); return; }
    if (act === 'odconnect' && !playerName()) { askName('Enter your player name before connecting OneDrive – it names your backup files.'); return; }
    if (act === 'odconnect' || act === 'odreauth') {
      if (!navigator.onLine) { toast('You\'re offline – connect OneDrive when you have signal'); return; }
      var req = { scopes: ODX.SCOPES, prompt: 'select_account' };
      var real = odAcct && pca.getAllAccounts().filter(function (a) { return a.homeAccountId === odAcct.homeAccountId; })[0];
      if (act === 'odreauth' && real) pca.acquireTokenRedirect({ scopes: ODX.SCOPES, account: real });
      else pca.loginRedirect(act === 'odreauth' && odAcct && odAcct.username ? { scopes: ODX.SCOPES, loginHint: odAcct.username } : req);
      return;
    }
    if (act === 'odsync') { ODX.markDirty(odState); odState.attempts = 0; odSaveState(); clearTimeout(odTimer); odSync().then(function () { toast(odState.pending ? 'Backup queued – ' + (odState.lastError || 'will retry') : 'Backed up to OneDrive'); }); odRefresh(); return; }
    if (act === 'odrestore') {
      view.screen = 'odrestore'; odFiles = null; render();
      odToken().then(function (t) { return ODX.list(window.fetch.bind(window), t); }).then(function (L) { odFiles = L; }, function (e) {
        odFiles = { error: e.kind === 'interaction' || e.kind === 'auth' ? 'Sign-in expired – go back and tap Reconnect OneDrive.' : e.kind === 'offline' ? 'You\'re offline – restore needs a connection.' : e.message };
        if (e.kind === 'interaction' || e.kind === 'auth') { odState.needsAuth = true; odSaveState(); }
      }).then(function () { if (view.screen === 'odrestore') render(); });
      return;
    }
    if (act === 'odpick') {
      toast('Downloading…');
      odToken().then(function (t) { return ODX.download(window.fetch.bind(window), t, v); }).then(restoreFrom, function (e) { view.notice = { text: 'Could not download that backup: ' + e.message, bad: true }; view.screen = 'home'; render(); });
      return;
    }
    if (act === 'oddisconnect') {
      if (!confirm('Disconnect OneDrive on this phone?\n\nAutomatic backup stops. Your backups stay in OneDrive (Apps › Golf Shot Tracker).')) return;
      var acct = odAcct; odAcct = null; odRemember(null); clearTimeout(odTimer); odState = ODX.newState(); odSaveState();
      var realA = pca.getAllAccounts().filter(function (a) { return a.homeAccountId === acct.homeAccountId; })[0];
      Promise.resolve(pca.clearCache ? pca.clearCache(realA ? { account: realA } : undefined) : null).catch(function () {}).then(function () {
        Object.keys(localStorage).forEach(function (k) { if (/msal|login\.windows|login\.microsoftonline/i.test(k)) localStorage.removeItem(k); });
        toast('OneDrive disconnected'); render();
      });
    }
  }
  function askName(msg) { view.screen = 'home'; view.editName = true; view.needName = msg; render(); var i = document.getElementById('pname'); if (i) { i.scrollIntoView({ block: 'center' }); i.focus(); } }
  function setName(n) {
    n = String(n || '').trim().replace(/\s+/g, ' ').slice(0, 40);
    if (!window.OD.slug(n)) { toast('Please enter a name (letters or numbers)'); return; }
    var old = playerName();
    if (old && old !== n && !confirm('Change player name from "' + old + '" to "' + n + '"?\n\nYour rounds are relabelled and new OneDrive backups go to ' + window.OD.fileFor(n) + '. Older backup files are kept.')) return;
    localStorage.setItem(PN, n); view.editName = false; view.needName = null;
    rounds.forEach(function (r) { if (!r.player || r.player === old) r.player = n; });
    save(); if (odOn) { odState.attempts = 0; odSoon(800); }
    toast('Player name: ' + n); render();
  }
  function playerHTML() {
    var n = playerName();
    if (n && !view.editName) return '<div class="playerbox" id="playerbox"><span>Player: <b id="pnameshow">' + esc(n) + '</b></span><button class="txt" data-act="editname">Change</button></div>';
    return '<div class="playerbox edit" id="playerbox">' + (view.needName ? '<p class="notice bad" id="needname">' + esc(view.needName) + '</p>' : '') +
      '<label class="lbl" for="pname">Player name</label><div class="pnrow2"><input type="text" id="pname" value="' + esc(n) + '" placeholder="e.g. Scott" autocomplete="name" maxlength="40">' +
      '<button class="primary" data-act="setname">Save</button>' + (n ? '<button data-act="cancelname">Cancel</button>' : '') + '</div>' +
      '<p class="help muted">Saved on this phone. It labels your rounds and names your backups (golf-rounds-<i>name</i>.json), so several phones can share one OneDrive.</p></div>';
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
    h += '<button class="big histbtn" data-act="history">📋 History<br><small>' + rounds.length + ' saved round' + (rounds.length === 1 ? '' : 's') + ' – review stats &amp; maps</small></button>';
    h += '<h2>Your data</h2>' + playerHTML();
    if (view.notice) h += '<p class="notice ' + (view.notice.bad ? 'bad' : 'good') + '" id="notice" role="status">' + esc(view.notice.text) + '</p>';
    h += odCardHTML();
    var rem = (odOn && odAcct) ? '' : backupReminder(); if (rem) h += '<p class="notice remind" id="bkremind">' + esc(rem) + '</p>';
    h += '<button class="big" data-act="backup"' + (rounds.length ? '' : ' disabled') + '>💾 Back up rounds</button>' +
      '<label class="big filebtn" for="restorefile">📂 Restore from backup</label><input type="file" id="restorefile" accept=".json,application/json" hidden>' +
      '<p class="help muted">Back up saves all rounds as one file (golf-rounds-backup-date.json) – choose Save to Files or OneDrive in the share sheet. Restore adds the rounds from a backup file; rounds already on this phone are not duplicated.</p>';
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

  // Traditional scorecard: Front 9 (OUT) and Back 9 (IN) as two stacked tables, then TOTAL.
  // Marks: birdie = circle, eagle or better = double circle, bogey = square, double bogey or worse = double square, par = plain.
  function scoreMark(score, par) {
    var d = score - par; return d <= -2 ? 'eagle' : d === -1 ? 'birdie' : d === 0 ? 'par' : d === 1 ? 'bogey' : 'double';
  }
  function scorecardHTML(r, S) {
    var sum = function (a) { return a.reduce(function (t, x) { return t + x; }, 0); };
    var nine = function (from, to, tag, id) {
      var idx = []; for (var i = from; i < to && i < r.holes.length; i++) idx.push(i);
      if (!idx.length) return '';
      var yds = idx.map(function (i) { return SG.holeYards(r.holes[i]) || 0; }), pars = idx.map(function (i) { return Number(r.holes[i].par) || 0; });
      var done = idx.filter(function (i) { return S.holes[i].done; });
      var cell = function (i, inner, cls) { return '<td class="' + (cls || '') + '"><button class="hc" data-act="goHole" data-i="' + i + '" aria-label="Hole ' + (i + 1) + '">' + inner + '</button></td>'; };
      var row = function (lbl, cls, cells, tot) { return '<tr class="' + cls + '"><th scope="row">' + lbl + '</th>' + cells + '<td class="tot">' + tot + '</td></tr>'; };
      var t = '<table class="scard" id="' + id + '"><caption>' + (tag === 'OUT' ? 'Front 9' : 'Back 9') + '</caption>';
      t += row('Hole', 'shole', idx.map(function (i) { return cell(i, i + 1); }).join(''), tag);
      t += row('Yds', 'syds', idx.map(function (i, k) { return cell(i, yds[k] || ''); }).join(''), sum(yds) || '');
      t += row('Par', 'spar', idx.map(function (i, k) { return cell(i, pars[k]); }).join(''), sum(pars));
      t += row('Score', 'sscore', idx.map(function (i) {
        var a = S.holes[i]; if (!a.done) return cell(i, '', 'blank');
        var m = scoreMark(a.strokes, Number(r.holes[i].par));
        return cell(i, '<span class="mk mk-' + m + '" data-mark="' + m + '">' + a.strokes + '</span>', 'done');
      }).join(''), done.length ? sum(done.map(function (i) { return S.holes[i].strokes; })) : '');
      t += row('Putts', 'sputts', idx.map(function (i) { var a = S.holes[i]; return cell(i, a.done ? a.putts : '', a.done ? '' : 'blank'); }).join(''),
        done.length ? sum(done.map(function (i) { return S.holes[i].putts; })) : '');
      return t + '</table>';
    };
    var all = r.holes.map(function (h, i) { return i; }), done = all.filter(function (i) { return S.holes[i].done; });
    var tYds = sum(r.holes.map(function (h) { return SG.holeYards(h) || 0; })), tPar = sum(r.holes.map(function (h) { return Number(h.par) || 0; }));
    var tScore = sum(done.map(function (i) { return S.holes[i].strokes; })), tPutts = sum(done.map(function (i) { return S.holes[i].putts; }));
    var parDone = sum(done.map(function (i) { return Number(r.holes[i].par) || 0; }));
    return '<div class="label">Scorecard – tap a hole to edit</div>' + nine(0, 9, 'OUT', 'card-front') + nine(9, 18, 'IN', 'card-back') +
      '<table class="scard stotal" id="card-total"><tr><th>TOTAL</th><th>Yds</th><th>Par</th><th>Score</th><th>To par</th><th>Putts</th></tr>' +
      '<tr><td>' + done.length + '/' + r.holes.length + ' holes</td><td>' + (tYds || '') + '</td><td>' + tPar + '</td><td class="big">' + (done.length ? tScore : '–') + '</td><td class="big" id="card-topar">' +
      (done.length ? toPar(tScore - parDone) : '–') + '</td><td>' + (done.length ? tPutts : '–') + '</td></tr></table>' +
      '<div class="legend sclegend" id="card-legend"><span><span class="mk mk-eagle"></span>Eagle or better</span><span><span class="mk mk-birdie"></span>Birdie</span><span><span class="mk mk-par lgpar">–</span>Par (no mark)</span>' +
      '<span><span class="mk mk-bogey"></span>Bogey</span><span><span class="mk mk-double"></span>Double bogey or worse</span><span>Blank = hole not finished. To par counts finished holes only.</span></div>';
  }
  function summaryHTML() {
    var r = round(), bl = blOf(r), S = SG.summarize(r, bl);
    var out = '<div class="topbar">' + (view.from === 'history' ? '<button class="txt" data-act="history">‹ History</button>' : '<button class="txt" data-act="backHole">‹ Round</button>') + '<div class="title"><b>Round stats</b><span>' +
      new Date(r.date).toLocaleDateString() + (r.course ? ' · ' + esc(r.course) : '') + '</span></div><button class="txt" data-act="home">Home</button></div>';
    out += '<div class="big-score"><div class="s">' + (S.holesDone ? S.strokes : '–') + '</div>' +
      (S.holesDone ? toPar(S.toPar) + ' vs par · ' + S.holesDone + ' hole' + (S.holesDone === 1 ? '' : 's') + ' done' : 'No holes finished yet') + '</div>';
    out += scorecardHTML(r, S);
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
    out += '</table>' + compareHTML(r, bl) + '<h3>By distance</h3><table id="bydist"><tr><th>From</th><th class="num">Shots</th><th class="num">SG</th><th class="num">Avg to pin after</th></tr>';
    var groups = [['Approach', SG.APPR_BUCKETS.map(function (b) { return b.id; })], ['Short game', ['0-20 yd']], ['Putting', ['0-5 ft', '5-15 ft', '15-30 ft', '30+ ft']]], pex = 0;
    groups.forEach(function (g) {
      out += '<tr><td colspan="4" style="background:#eee"><b>' + g[0] + '</b></td></tr>';
      g[1].forEach(function (b) {
        var c = S.buckets[b], ap = g[0] === 'Approach'; if (ap) pex += c.proxEx;
        out += '<tr data-bucket="' + b + '"><td>' + b + '</td><td class="num">' + c.n + '</td><td class="num ' + sgCls(c.sg) + '">' + (c.n ? fmtSG(c.sg) : '–') + '</td><td class="num">' +
          (ap ? (c.proxN ? Math.round(c.proxFt) + ' ft' : '–') : '') + '</td></tr>';
      });
    });
    out += '</table><p class="help muted" id="bydistnote">Approach = every shot from more than 20 yd off the green, par-3 tee shots included (par-4/5 tee shots are Off the tee). ' +
      'Short game = off the green from 20 yd and in. Ranges include the lower number (60–100 = 60 to under 100 yd); 20–60 = over 20 up to under 60 yd (it also takes the 20–30 yd shots). ' +
      'Avg to pin after = how far from the hole the ball finished: feet on the green, yards × 3 off it, 0 if holed' +
      (pex ? '; <b>' + pex + '</b> approach shot' + (pex === 1 ? '' : 's') + ' with a penalty or OB left out of that average' : '; shots with a penalty or OB are left out of it') + '.</p>' +
      '<h2>Stats</h2><div class="stat-grid">' +
      tile('fw', 'Fairways hit – tap for map', S.fwHit + ' / ' + S.fwTotal) +
      tile('gir', 'Greens in reg. – tap for map', S.gir + ' / ' + S.girHoles) +
      tile('miss', 'Approach misses (missed green) – tap for map', S.apprMiss.length, missMini(S.apprMiss)) +
      proxTile(S) +
      tile('pin', 'Pin location – tap for map', S.pinHoles.length + ' / ' + S.holesDone, '<small class="mini">holes with a pin set</small>') +
      puttTile(S) + stat('Penalty strokes', S.penalties) +
      stat('Tee misses L / R', S.teeLeft + ' / ' + S.teeRight) +
      stat('Missed greens left / right', S.apprLeft + ' / ' + S.apprRight) +
      stat('Missed greens short / long', S.apprShort + ' / ' + S.apprOver) + '</div>';
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
    if (kind === 'pin' || kind === 'prox' || kind === 'putt') return { list: [], rounds: 0 };
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
    var out = '<div class="mapview" id="mapview" role="dialog" aria-label="' + (kind === 'gir' ? 'GIR map' : kind === 'fw' ? 'Fairway map' : kind === 'pin' ? 'Pin location map' : kind === 'prox' ? 'Proximity map' : kind === 'putt' ? 'Putting map' : 'Approach miss map') + '">' +
      '<div class="maphead"><b>' + (kind === 'gir' ? 'Greens in regulation' : kind === 'fw' ? 'Tee shots – fairways' : kind === 'pin' ? 'Pin location' : kind === 'prox' ? 'Proximity by distance' : kind === 'putt' ? 'Putting' : 'Approach misses') + '</b><button class="close" data-act="mapclose" aria-label="Close map">✕ Close</button></div>' +
      '<div class="seg"><button data-act="mapscope" data-v="round" class="' + (all ? '' : 'sel') + '">This round</button>' +
      '<button data-act="mapscope" data-v="all" class="' + (all ? 'sel' : '') + '">All rounds (' + rounds.length + ')</button></div>';
    if (kind === 'pin') out += pinMapHTML(all);
    else if (kind === 'prox') out += proxHTML(all);
    else if (kind === 'putt') out += puttHTML(all);
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
        '<p class="help muted"><b>GIR</b> = on the green (or holed) in par − 2 strokes or fewer, penalties included (par 3: tee shot, par 4: tee or 2nd shot, par 5: tee, 2nd or 3rd shot). ' +
        'Every finished hole is either a GIR (shown here) or a regulation miss (Approach misses map), so GIR + misses = holes. ' +
        'Holing out, or chipping in from 30 yd or closer right after, counts as hitting it (★). Bottom of the picture = short (toward you).</p>' +
        dirTable(list.filter(function (m) { return !m.holed; })).replace('(not plotted)', '(drawn as ?)').replace('</table>', (holed ? '<tr data-dir="holed"><td>★ Holed out</td><td class="num">' + holed + '</td></tr>' : '') + '</table>');
    } else {
      out += '<p class="mapsum" id="mapsum"><b>' + list.length + '</b> approach' + (list.length === 1 ? '' : 'es') + ' missed the green' + (all ? ' in ' + D.rounds + ' round' + (D.rounds === 1 ? '' : 's') : ' this round') + '</p>' +
        missSVG(list) + '<div class="legend">' + ['rough', 'fairway', 'sand', 'hazard', 'ob', 'recovery'].map(function (l) {
          return '<span><i class="dot" style="background:' + LIE_COL[l] + '"></i>' + LIE_NAME[l] + '</span>'; }).join('') +
        '<span><i class="dot num">3</i>Misses in that direction</span></div>' +
        '<p class="help muted"><b>Approach miss</b> = a hole that was not a GIR. One per hole: the regulation shot (stroke par − 2: par 3 = tee shot, par 4 = 2nd shot, par 5 = 3rd shot), drawn where it finished. ' +
        'A par-4 tee shot or a par-5 2nd shot short of the green is never a miss. Penalty strokes count: if stroke par − 2 was a penalty stroke, the ball struck before it is used. GIR + misses = holes. ' +
        'Direction = where it missed the green (the Dir you entered on the next row). Only finished holes count. Bottom = short (toward you).</p>' + dirTable(list);
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
  // Ball-flight tracer, seen from behind/above: a gentle cubic arc that bows out to one side and lands
  // on the end point (a fade/draw shape). Shots finishing right bow left first and vice versa; straight
  // shots alternate. Used by the fairway map and the proximity map so both look the same.
  function flight(x0, y0, x1, y1, i) {
    var dx = x1 - x0, dy = y1 - y0, L = Math.sqrt(dx * dx + dy * dy) || 1, nx = -dy / L, ny = dx / L;
    var sg = Math.abs(dx) > 8 ? (dx > 0 ? -1 : 1) : (i % 2 ? 1 : -1), b = Math.min(30, L * 0.1) * sg;
    return 'M' + f1(x0) + ' ' + f1(y0) + ' C' + f1(x0 + dx * 0.2 + nx * b) + ' ' + f1(y0 + dy * 0.35 + ny * b) + ' ' +
      f1(x0 + dx * 0.65 + nx * b * 0.85) + ' ' + f1(y0 + dy * 0.8 + ny * b * 0.85) + ' ' + f1(x1) + ' ' + f1(y1);
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
      var ey = Y(yd), fp = flight(TX, TY, ex, ey, i);
      var col = m.fairway ? '#00a000' : '#e0102a';
      out += '<path class="tracer ' + (m.fairway ? 'hit' : 'miss') + '" data-kind="' + m.kind + '" data-side="' + (m.side || '') + '" data-ex="' + f1(ex) + '" data-ey="' + f1(ey) + '" d="' + fp + '" fill="none" stroke="#000" stroke-opacity=".35" stroke-width="6"/>' +
        '<path d="' + fp + '" fill="none" stroke="' + (m.fairway ? '#b6ff9e' : '#ff4d5e') + '" stroke-width="3.5"' + (dashed ? ' stroke-dasharray="8 6"' : '') + '/>';
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
      '<span><i class="ln dash"></i>Missed, no direction entered (ends straight up the middle)</span>' +
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
  // ---------- proximity by distance ----------
  function fmtFt(v) { return v == null ? '–' : Math.round(v) + ' ft'; }
  // ---------- Putting green ----------
  function puttTile(S) {
    var P1 = SG.puttStats(S.puttList.filter(function (p) { return p.n === 1; }));
    return tile('putt', 'Putts – tap for map', S.putts, '<small class="mini">' + (P1.n ? '1st putts made ' + P1.made + '/' + P1.n : 'no putts yet') + '</small>');
  }
  function puttData() {
    var all = [], n = 0;
    (view.mapScope === 'all' ? rounds : [round()]).forEach(function (r) { n++; SG.summarize(r, 'pga').puttList.forEach(function (p) { all.push(p); }); });
    var counts = { '1': 0, '2': 0, '3': 0 }; all.forEach(function (p) { counts[SG.puttGroup(p.n)]++; });
    var g = view.puttN || '1'; if (!counts[g]) g = ['1', '2', '3'].filter(function (x) { return counts[x]; })[0] || '1';
    return { list: all.filter(function (p) { return SG.puttGroup(p.n) === g; }), group: g, counts: counts, rounds: n, tp: SG.threePutts(all) };
  }
  // Non-linear radius: 0-10 ft takes 60% of the radius (1 ft rings readable); 10 ft..max ring the rest.
  var PG2 = { cx: 180, cy: 190, R: 168 };
  var PCOL = { made: '#000', miss2: '#1565e0', miss3: '#e0102a' };
  function puttSVG(list, group) {
    var sc = SG.puttScale(group, list), maxFt = sc.maxFt, close = sc.mode === 'close', R = function (ft) { return SG.puttRadius(ft, sc, PG2.R); };
    var o = '<svg id="puttmap" data-scale="' + sc.mode + '" data-maxft="' + maxFt + '" viewBox="0 0 360 400" role="img" aria-label="Putts by starting distance">' +
      '<rect width="360" height="400" fill="#cfe8c4"/><circle cx="' + PG2.cx + '" cy="' + PG2.cy + '" r="' + (PG2.R + 6) + '" fill="#3da33d" stroke="#145214" stroke-width="4"/>';
    var lab = {}, f;
    if (close) sc.labels.forEach(function (x) { lab[x] = 1; });
    else { var step5 = R(15) - R(10) >= 17; [1, 2, 3, 5, 10].forEach(function (x) { lab[x] = 1; }); for (f = 15; f <= maxFt; f += 5) if (step5 || f % 10 === 0) lab[f] = 1; }
    // Ring labels run along the emptiest diagonal so they don't sit on top of putts.
    var la = [300, 240, 60, 120].map(function (a) { return [a, list.filter(function (p) { var d = Math.abs(((SG.DIR_ANGLE[p.dir] == null ? -999 : SG.DIR_ANGLE[p.dir]) - a + 540) % 360 - 180); return d < 35; }).length]; })
      .sort(function (x, y) { return x[1] - y[1]; })[0][0], lc = Math.cos(la * Math.PI / 180), ls = -Math.sin(la * Math.PI / 180), ringBoxes = [];
    sc.rings.slice().reverse().forEach(function (ft) {
      var r = R(ft), major = close ? ft === 3 || ft === 6 || ft === 10 : ft === 3 || ft === 6 || ft === 10 || ft % 10 === 0;
      o += '<circle class="pring" data-ft="' + ft + '" cx="' + PG2.cx + '" cy="' + PG2.cy + '" r="' + f1(r) + '" fill="none" stroke="#fff" stroke-opacity="' + (major ? '.95' : '.6') + '" stroke-width="' + (major ? 2.2 : 1.1) + '"/>';
      if (lab[ft] || ft === maxFt) { var lx = PG2.cx + r * lc, ly = PG2.cy + r * ls + 4, txt = ft + (ft === 10 || ft === maxFt ? ' ft' : ''), lw = txt.length * 6.5;
        ringBoxes.push([lx - lw / 2, ly - 10, lx + lw / 2, ly + 2]);
        o += '<text class="ring" x="' + f1(lx) + '" y="' + f1(ly) + '" text-anchor="middle" font-size="' + (!close && ft <= 3 ? 10 : 12) + '" font-weight="900" fill="#fff" stroke="#145214" stroke-width="2.5" paint-order="stroke">' + txt + '</text>'; }
    });
    o += '<circle cx="' + PG2.cx + '" cy="' + PG2.cy + '" r="4.5" fill="#000"/>';
    var dots = '', boxes = ringBoxes.concat([[130, 3, 230, 21], [80, 380, 280, 398], [0, PG2.cy - 10, 30, PG2.cy + 6], [330, PG2.cy - 10, 360, PG2.cy + 6]]), lbls = '';
    SG.puttPlace(list, sc, PG2.cx, PG2.cy, PG2.R, 15).forEach(function (d) {
      var p = d.p, q = [d.x, d.y], x = f1(d.x), y = f1(d.y), kd = SG.puttKind(p), col = PCOL[kd];
      var at = ' class="pdot2" data-made="' + (p.made ? 1 : 0) + '" data-ft="' + p.ft + '" data-hole="' + p.hole + '" data-dir="' + (p.dir || '') + '" data-beyond="' + (d.beyond ? 1 : 0) + '" data-pk="' + kd + '"';
      if (d.nodir) dots += '<g' + at + ' data-kind="nodir"><path d="M' + x + ' ' + (y - 9) + ' l9 9 -9 9 -9 -9z" fill="' + (p.made ? col : '#fff') + '" stroke="' + col + '" stroke-width="3"/><text x="' + x + '" y="' + (+y + 4.5) + '" text-anchor="middle" font-size="11" font-weight="900" fill="' + (p.made ? '#fff' : col) + '">?</text></g>';
      else dots += '<circle' + at + ' data-kind="dir" cx="' + x + '" cy="' + y + '" r="6.5" fill="' + (p.made ? col : '#fff') + '" stroke="' + col + '" stroke-width="3"/>';
      boxes.push([q[0] - 8, q[1] - 9, q[0] + 8, q[1] + 9]);
    });
    SG.puttPlace(list, sc, PG2.cx, PG2.cy, PG2.R, 15).forEach(function (d) {
      var p = d.p, q = [d.x, d.y], t = (Math.round(p.ft * 10) / 10) + (d.beyond ? '›' : ''), w = t.length * 7 + 4, cand = [[0, -12], [0, 21], [12 + w / 2, 4], [-12 - w / 2, 4], [0, -24], [0, 33], [14 + w / 2, -10], [-14 - w / 2, -10]], best = null;
      cand.some(function (c) { var cx = Math.max(w / 2, Math.min(360 - w / 2, q[0] + c[0])), ty = q[1] + c[1], b = [cx - w / 2, ty - 10, cx + w / 2, ty + 2];
        if (!best) best = [cx, ty, b]; if (!boxes.some(function (z) { return b[0] < z[2] && b[2] > z[0] && b[1] < z[3] && b[3] > z[1]; })) { best = [cx, ty, b]; return true; } });
      boxes.push(best[2]);
      lbls += '<text class="plbl" x="' + f1(best[0]) + '" y="' + f1(best[1]) + '" text-anchor="middle" font-size="12" font-weight="900" fill="#000" stroke="#fff" stroke-width="3.5" paint-order="stroke">' + t + '</text>';
    });
    return o + dots + lbls + '<text x="180" y="16" text-anchor="middle" font-size="13" font-weight="800">LONG ↑</text><text x="180" y="394" text-anchor="middle" font-size="13" font-weight="800">SHORT ↓ (toward you)</text>' +
      '<text x="6" y="' + (PG2.cy + 4) + '" font-size="13" font-weight="800">◀ L</text><text x="354" y="' + (PG2.cy + 4) + '" text-anchor="end" font-size="13" font-weight="800">R ▶</text></svg>';
  }
  function puttHTML(all) {
    var D = puttData(), P = SG.puttStats(D.list), NM = { '1': '1st putt', '2': '2nd putt', '3': '3rd+ putt' };
    var btns = ['1', '2', '3'].map(function (g) { var c = D.counts[g];
      return '<button class="pnbtn' + (g === D.group ? ' sel' : '') + '" data-act="puttn" data-v="' + g + '" data-n="' + c + '"' + (c ? '' : ' disabled') + ' aria-pressed="' + (g === D.group) + '">' + NM[g].replace(' putt', '') + '<small>' + c + '</small></button>'; }).join('');
    var pct = function (x) { return x == null ? '–' : Math.round(x) + '%'; };
    var bandRows = P.bands.map(function (b) { return '<tr data-band="' + b.id + '"><td>' + b.id + ' ft</td><td class="num">' + b.n + '</td><td class="num">' + (b.n ? b.made + '/' + b.n : '–') + '</td><td class="num">' + pct(b.pct) + '</td></tr>'; }).join('');
    return '<div class="pnrow" id="puttbtns" role="group" aria-label="Which putt">' + btns + '</div>' +
      '<p class="mapsum" id="mapsum"><b>' + P.n + '</b> ' + NM[D.group] + (P.n === 1 ? '' : 's') + (all ? ' in ' + D.rounds + ' round' + (D.rounds === 1 ? '' : 's') : ' this round') + '</p>' +
      '<p class="mapsum" id="threeputts">3-putt holes: <b>' + D.tp.three + '</b> of ' + D.tp.holes + ' hole' + (D.tp.holes === 1 ? '' : 's') + ' putted' + (D.tp.holes ? ' (' + Math.round(100 * D.tp.three / D.tp.holes) + '%)' : '') + '</p>' +
      '<div class="stat-grid" id="puttstats">' + stat('Putts', P.n) + stat('Made', P.n ? P.made + ' / ' + P.n + ' (' + pct(P.pct) + ')' : '–') + stat('Avg distance', P.avgFt == null ? '–' : (Math.round(P.avgFt * 10) / 10) + ' ft') + '</div>' +
      puttSVG(D.list, D.group) +
      '<div class="legend" id="puttlegend"><span><i class="dot" style="background:#000;border-color:#000"></i>Made</span><span><i class="dot" style="background:#fff;border:3px solid #1565e0"></i>Missed – 2-putt hole</span><span><i class="dot" style="background:#fff;border:3px solid #e0102a"></i>Missed – 3-putt or worse</span>' +
      '<span><svg width="20" height="20" viewBox="0 0 20 20" style="flex:none"><path d="M10 1 l9 9 -9 9 -9 -9z" fill="#fff" stroke="#555" stroke-width="2.5"/><text x="10" y="14.5" text-anchor="middle" font-size="11" font-weight="900" fill="#555">?</text></svg>No direction entered – right distance, spread around the hole (outline colour as above)</span>' +
      (D.group === '1' ? '<span>Rings every 1 ft out to 10 ft, then every 5 ft. The inner 10 ft is drawn bigger so short putts are easy to read; the label is the distance in ft.</span>' : '<span>Close-up: 10 ft green, a ring every 1 ft (true scale). Putts longer than 10 ft sit on the edge, labelled with › and their real distance.</span>') + '<span>Dots that would land on the same spot are nudged slightly apart.</span></div>' +
      '<h3>Make % by distance</h3><table class="dirtab" id="puttbands"><tr><th>Distance</th><th class="num">Putts</th><th class="num">Made</th><th class="num">Make %</th></tr>' + bandRows + '</table>' +
      '<p class="help muted">Every putt = every stroke hit from the green. 1st / 2nd / 3rd+ = its number on that hole (3rd+ includes 4th and later). Direction = where the ball was vs the hole before the putt: for 1st putts the Dir of the approach (as on the GIR map), for later putts the Dir on that putt\'s row. ' +
      'Bands: 0–3 = under 3 ft, 3–6 = 3 to under 6 ft, and so on. Only finished holes count.</p>';
  }
  function proxTile(S) {
    var L = S.proxList.filter(function (m) { return SG.inBucket('all', m.from); }), P = SG.proxStats(L);
    return tile('prox', 'Proximity by distance – tap for map', P.n ? fmtFt(P.avgAllFt) : '–',
      '<small class="mini">avg 40–200 yd · ' + P.n + ' approach' + (P.n === 1 ? '' : 'es') + (P.n ? ' · greens hit ' + P.hits + '/' + P.n : '') + '</small>');
  }
  // Proximity data for the selected yardage. Counts per yardage button (current scope) decide which
  // buttons are enabled; a selection with no shots in this scope falls back to All.
  // Proximity data for the selected yardage + starting-lie filter. Button counts (current scope) decide
  // which yardage / lie buttons are enabled; a selection with no shots falls back to All.
  function proxData() {
    var all = [], n = 0;
    (view.mapScope === 'all' ? rounds : [round()]).forEach(function (r) { n++; SG.summarize(r, 'pga').proxList.forEach(function (m) { all.push(m); }); });
    var lie = view.proxLie || 'all', b = view.proxB || '~auto', auto = b === '~auto', counts, inB, lieCounts;
    var byLie = function (L) { return lie === 'all' ? L : L.filter(function (m) { return m.fromGroup === lie; }); };
    var calc = function () {
      counts = {}; SG.PROX_BUCKETS.forEach(function (x) { counts[x.id] = byLie(all).filter(function (m) { return SG.inBucket(x.id, m.from); }).length; });
      // Default (nothing tapped yet): the busiest yardage, so the map opens uncluttered. Ties -> the shorter yardage.
      if (auto) { b = 'all'; var mx = 0; SG.PROX_BUCKETS.slice(1).forEach(function (x) { if (counts[x.id] > mx) { mx = counts[x.id]; b = x.id; } }); }
      if (!counts[b]) b = 'all';
      inB = all.filter(function (m) { return SG.inBucket(b, m.from); });
      lieCounts = { all: inB.length }; SG.PROX_LIES.forEach(function (l) { lieCounts[l.id] = inB.filter(function (m) { return m.fromGroup === l.id; }).length; });
    };
    calc(); if (lie !== 'all' && !lieCounts[lie]) { lie = 'all'; calc(); }
    return { list: byLie(inB), inB: inB, rounds: n, bucket: b, auto: auto && b !== 'all', lie: lie, counts: counts, lieCounts: lieCounts, outside: byLie(all).length - counts.all };
  }
  var PX = { cx: 150, cy: 245, K: 3.2, Rg: 106, W: 300, H: 620, Z: 476 }; // Z = top of the lie strip
  // Where the shots come from: fairway strip in the middle, rough both sides, a bunker (right),
  // trees / other (bottom-left corner) and the tee box (par 3s) at the bottom of the fairway.
  function lieStrip() {
    var Z = PX.Z, H = PX.H, W = PX.W, fx0 = PX.cx - 46, fx1 = PX.cx + 46, t = function (x, y, s, a, c) { return '<text x="' + x + '" y="' + y + '" text-anchor="' + (a || 'middle') + '" font-size="10" font-weight="900" fill="' + (c || '#fff') + '" letter-spacing=".5">' + s + '</text>'; };
    var o = '<g id="liestrip"><rect x="0" y="' + Z + '" width="' + W + '" height="' + (H - Z) + '" fill="#5f9e47"/>' +
      '<path d="M' + (fx0 + 8) + ' ' + Z + ' L' + (fx1 - 8) + ' ' + Z + ' L' + fx1 + ' ' + H + ' L' + fx0 + ' ' + H + ' Z" fill="#9fdf86"/>';
    for (var k = 0; k < 5; k++) o += '<rect x="' + (fx0 + 2) + '" y="' + (Z + 8 + k * 28) + '" width="' + (fx1 - fx0 - 4) + '" height="12" fill="#b3ea9e" opacity=".55"/>';
    o += '<ellipse id="lie-sand" cx="' + (W - 50) + '" cy="' + (Z + 40) + '" rx="32" ry="15" fill="#ecd27e" stroke="#c9a94f" stroke-width="2"/>' +
      '<rect id="lie-other" x="0" y="' + (H - 42) + '" width="62" height="42" fill="#2f6b2a"/><circle cx="14" cy="' + (H - 30) + '" r="9" fill="#1f4f1b"/><circle cx="46" cy="' + (H - 34) + '" r="10" fill="#1f4f1b"/>' +
      '<rect id="lie-tee" x="' + (PX.cx - 22) + '" y="' + (H - 24) + '" width="44" height="15" rx="4" fill="#c9f2b8" stroke="#fff" stroke-width="2"/>' +
      t(52, Z + 14, 'ROUGH') + t(PX.cx, Z + 14, 'FAIRWAY', 'middle', '#1d5c12') + t(W - 50, Z + 14, 'ROUGH') + t(W - 50, Z + 44, 'BUNKER', 'middle', '#7a5a10') +
      t(31, H - 46, 'OTHER') + t(PX.cx + 26, H - 12, 'TEE', 'start', '#1d5c12') + t(4, Z - 4, '↓ toward you', 'start', '#2f6b2a') + '</g>';
    return o;
  }
  function proxSVG(list) {
    var out = '<svg id="proxmap" viewBox="0 0 ' + PX.W + ' ' + PX.H + '" role="img" aria-label="Approach proximity">' +
      '<rect width="' + PX.W + '" height="' + PX.H + '" fill="#cfe8c4"/>' + lieStrip() + '<circle cx="' + PX.cx + '" cy="' + PX.cy + '" r="' + PX.Rg + '" fill="#3da33d" stroke="#145214" stroke-width="4"/>';
    [30, 25, 20, 15, 10, 5].forEach(function (ft) {
      out += '<circle cx="' + PX.cx + '" cy="' + PX.cy + '" r="' + ft * PX.K + '" fill="none" stroke="#fff" stroke-width="' + (ft % 10 ? 1.3 : 2.2) + '" stroke-opacity=".85"/>' +
        '<text class="ring" x="' + f1(PX.cx + 2 + ft * PX.K * 0.707) + '" y="' + f1(PX.cy + 12 + ft * PX.K * 0.707) + '" font-size="11" font-weight="800" fill="#fff">' + ft + '</text>';
    });
    out += '<circle cx="' + PX.cx + '" cy="' + PX.cy + '" r="5" fill="#000"/><line x1="' + PX.cx + '" y1="' + PX.cy + '" x2="' + PX.cx + '" y2="' + (PX.cy - 28) + '" stroke="#000" stroke-width="3"/>' +
      '<path d="M' + PX.cx + ' ' + (PX.cy - 28) + ' l18 6 l-18 6z" fill="#d0213a"/>';
    var seen = {}, tr = '', dots = '', labels = '', pend = [], nd = 0, LN = { rough: 'Rough', deep: 'Deep rough', fairway: 'Fairway', sand: 'Bunker', hazard: 'Hazard', ob: 'OB', recovery: 'Trees' };
    // labels avoid each other, the dots and the canvas edge: try below, above, right, left, then further out
    var boxes = [], hit2 = function (b) { return boxes.some(function (o) { return b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1]; }); };
    var lbl = function (x, y, t1, t2, col) {
      var w = Math.max(t1.length, (t2 || '').length) * 6.6 + 4, h = t2 ? 23 : 12, best = null;
      [[0, 19], [0, -12 - h], [10 + w / 2, 4 - h / 2], [-10 - w / 2, 4 - h / 2], [0, 32], [0, -25 - h], [16 + w / 2, 16 - h / 2], [-16 - w / 2, 16 - h / 2], [0, 45], [0, -38 - h]].some(function (o) {
        var cx = Math.max(w / 2 + 2, Math.min(PX.W - w / 2 - 2, x + o[0])), ty = y + o[1], b = [cx - w / 2, ty - 10, cx + w / 2, ty - 10 + h];
        if (!best) best = [cx, ty, b];
        if (!hit2(b) && b[1] >= 22 && b[3] <= PX.H - 2) { best = [cx, ty, b]; return true; }
      });
      boxes.push(best[2]); var cx = best[0], ty = best[1];
      return '<text class="xlbl" x="' + f1(cx) + '" y="' + f1(ty) + '" text-anchor="middle" font-size="11" font-weight="900" fill="' + col + '" stroke="#fff" stroke-width="3" paint-order="stroke">' + esc(t1) +
        (t2 ? '<tspan x="' + f1(cx) + '" dy="11">' + esc(t2) + '</tspan>' : '') + '</text>';
    };
    var clampXY = function (q) { return [Math.max(14, Math.min(PX.W - 14, q[0])), Math.max(36, Math.min(PX.Z - 12, q[1]))]; };
    // where each tracer starts: the lie the regulation shot was hit from (see the strip below the green)
    var sc = {}, starts = '';
    var startAt = function (m) {
      var g = m.fromGroup || 'other', j = sc[g] = (sc[g] || 0) + 1, sp = ((j - 1) % 5 - 2) * 9, row = Math.floor((j - 1) / 5) % 2 * 12;
      if (g === 'fairway') return [PX.cx + sp * 1.4, PX.Z + 72 + row, g];
      if (g === 'rough') {
        var sd = /left$/.test(m.fromDir || '') ? -1 : /right$/.test(m.fromDir || '') ? 1 : (sc.rl || 0) <= (sc.rr || 0) ? -1 : 1; // unknown side -> the emptier side
        if (sd < 0) sc.rl = (sc.rl || 0) + 1; else sc.rr = (sc.rr || 0) + 1;
        return sd < 0 ? [52 + sp, PX.Z + 68 + row, 'rough-left'] : [PX.W - 50 + sp, PX.Z + 98 + row, 'rough-right'];
      }
      if (g === 'sand') return [PX.W - 50 + sp * 0.8, PX.Z + 40, g];
      if (g === 'tee') return [PX.cx + sp, PX.H - 17, g];
      return [30 + sp * 0.6, PX.H - 20 - row, g];
    };
    list.forEach(function (m, i) {
      var col = m.hit ? '#1e6fd9' : '#e0102a', q, kind, clamped = false, label, label2 = '';
      if (m.hit) {
        if (m.holed) { var jh = seen.h = (seen.h || 0) + 1; q = [PX.cx - 14 + (jh - 1) * 14, PX.cy + 14]; kind = 'holed'; label = ''; }
        else {
          var nod = !m.dir, rr = Math.min(m.ft, 32) * PX.K, key = (m.dir || 'n') + Math.round(rr / 8), j = seen[key] = (seen[key] || 0) + 1;
          q = pt(PX.cx, PX.cy, rr, (nod ? 90 : SG.DIR_ANGLE[m.dir]) + (j - 1) * 7); kind = nod ? 'hitnodir' : 'hit';
          label = Math.round(m.ft) + ' ft' + (m.chipIn ? ' (chip-in)' : ''); clamped = m.ft > 32;
        }
      } else if (!m.dir) {
        q = [PX.W - 22 - (nd % 6) * 26, 52 + Math.floor(nd / 6) * 34]; nd++; kind = 'missnodir';
        label = m.lie === 'ob' ? 'OB' : Math.round(m.yd) + ' yd';
      } else {
        var r0 = m.ft == null ? PX.Rg + 30 : Math.max(m.ft * PX.K, PX.Rg + 14), jm = seen['m' + m.dir] = (seen['m' + m.dir] || 0) + 1;
        var raw = pt(PX.cx, PX.cy, r0, SG.DIR_ANGLE[m.dir] + (jm - 1) * 8); q = clampXY(raw); clamped = q[0] !== raw[0] || q[1] !== raw[1];
        kind = 'miss'; label = m.lie === 'ob' ? 'OB' : Math.round(m.yd) + ' yd' + (clamped ? ' ›' : ''); label2 = m.lie === 'ob' ? '' : (LN[m.lie] || m.lie);
      }
      var x = f1(q[0]), y = f1(q[1]), st = startAt(m), ox = st[0], oy = st[1];
      if (kind !== 'missnodir') tr += '<path class="tracer" data-start="' + st[2] + '" data-sx="' + f1(ox) + '" data-sy="' + f1(oy) + '" data-ex="' + x + '" data-ey="' + y + '" d="' + flight(ox, oy, q[0], q[1], i) + '" fill="none" stroke="' + col + '" stroke-width="2.5" stroke-opacity=".75"/>';
      starts += '<circle class="xstart" data-start="' + st[2] + '" data-hole="' + m.hole + '" cx="' + f1(ox) + '" cy="' + f1(oy) + '" r="4" fill="#fff" stroke="' + col + '" stroke-width="2"/>';
      var attrs = ' class="xdot" data-kind="' + kind + '" data-hole="' + m.hole + '" data-from="' + m.from + '"' + (clamped ? ' data-clamped="1"' : '');
      if (kind === 'holed') dots += '<path' + attrs + ' d="M' + x + ' ' + (y - 10) + ' l3 6.5 7 .8 -5.3 4.8 1.5 7 -6.2 -3.6 -6.2 3.6 1.5 -7 -5.3 -4.8 7 -.8z" fill="#ffd23f" stroke="#1e6fd9" stroke-width="2"/>';
      else if (kind === 'hitnodir' || kind === 'missnodir') dots += '<g' + attrs + ' data-x="' + x + '" data-y="' + y + '"><path d="M' + x + ' ' + (y - 10) + ' l10 10 -10 10 -10 -10z" fill="' + col + '" stroke="#000" stroke-width="2"/><text x="' + x + '" y="' + (+y + 4.5) + '" text-anchor="middle" font-size="12" font-weight="900" fill="#fff">?</text></g>';
      else dots += '<circle' + attrs + ' cx="' + x + '" cy="' + y + '" r="6.5" fill="' + col + '" stroke="#000" stroke-width="2"/>';
      if (label) pend.push([q[0], q[1], label, label2, m.hit ? '#0b3d91' : '#9b0016']);
      boxes.push([q[0] - 8, q[1] - 10, q[0] + 8, q[1] + 10]);
    });
    pend.forEach(function (p) { labels += lbl(p[0], p[1], p[2], p[3], p[4]); });
    out += tr + starts + dots + labels + '<text x="' + PX.cx + '" y="16" text-anchor="middle" font-size="13" font-weight="800">LONG ↑</text>' +
      '<text x="6" y="16" font-size="13" font-weight="800">◀ LEFT</text><text x="' + (PX.W - 6) + '" y="16" text-anchor="end" font-size="13" font-weight="800">RIGHT ▶</text>' +
      (nd ? '<text x="' + (PX.W - 8) + '" y="34" text-anchor="end" font-size="11" font-weight="800">missed, no direction ↓</text>' : '');
    return out + '</svg>';
  }
  function proxHTML(all) {
    var D = proxData(), L = D.list, P = SG.proxStats(L), miss = L.filter(function (m) { return !m.hit; });
    // yardage rail: 200 at the top (farther = up the page, like the map), 40 at the bottom
    var rail = SG.PROX_BUCKETS.slice(1).reverse().map(function (b) {
      var c = D.counts[b.id];
      return '<button class="ybtn' + (b.id === D.bucket ? ' sel' : '') + '" data-act="proxb" data-v="' + b.id + '" data-n="' + c + '"' + (c ? '' : ' disabled') +
        ' aria-pressed="' + (b.id === D.bucket) + '" aria-label="' + b.yd + ' yards, ' + c + ' shot' + (c === 1 ? '' : 's') + '"><b>' + b.yd + '</b>' + (c ? '<small>' + c + '</small>' : '') + '</button>';
    }).join('');
    var bname = D.bucket === 'all' ? 'All 40–200 yd' : D.bucket + ' yd (' + (Number(D.bucket) - 5) + '–' + (Number(D.bucket) + 4) + ')';
    var scope = all ? ' in ' + D.rounds + ' round' + (D.rounds === 1 ? '' : 's') : ' this round';
    var LIE_NM = { all: 'All lies' }; SG.PROX_LIES.forEach(function (l) { LIE_NM[l.id] = l.name; });
    var chips = ['all'].concat(SG.PROX_LIES.map(function (l) { return l.id; })).map(function (id) {
      var c = D.lieCounts[id];
      return '<button class="liebtn' + (id === D.lie ? ' sel' : '') + '" data-act="proxlie" data-v="' + id + '" data-n="' + c + '"' + (c ? '' : ' disabled') + ' aria-pressed="' + (id === D.lie) + '">' + LIE_NM[id] + ' <small>' + c + '</small></button>';
    }).join('');
    var rows = SG.proxByLie(D.inB), warns = SG.proxWarnings(rows), wid = {}; warns.forEach(function (w) { wid[w.id] = 1; });
    var pct = function (r) { return r.n ? r.hits + '/' + r.n + ' (' + Math.round(r.hitPct) + '%)' : '–'; };
    var lieTab = '<table class="dirtab lietab" id="lietab"><tr><th>Lie</th><th class="num">Shots</th><th class="num">Greens hit</th><th class="num">Avg hit</th><th class="num">Avg all</th></tr>' +
      rows.map(function (r) { return '<tr data-lie="' + r.id + '" class="' + (wid[r.id] ? 'warn' : '') + (r.id === D.lie ? ' sel' : '') + '"><td>' + (wid[r.id] ? '⚠ ' : '') + r.name + '</td><td class="num">' + r.n + '</td><td class="num">' + pct(r) +
        '</td><td class="num">' + fmtFt(r.avgHitFt) + '</td><td class="num">' + fmtFt(r.avgAllFt) + '</td></tr>'; }).join('') + '</table>';
    var warnHTML = warns.map(function (w) { return '<p class="warnmsg" data-lie="' + w.id + '">⚠ ' + esc(w.text) + '</p>'; }).join('');
    return '<p class="mapsum" id="mapsum"><b>' + P.n + '</b> approach' + (P.n === 1 ? '' : 'es') + ' from <b id="proxsel">' + bname + '</b>' + (D.lie === 'all' ? '' : ', <b id="proxliesel">' + LIE_NM[D.lie] + '</b>') + scope + '</p>' +
      (D.auto ? '<p class="help muted" id="proxauto">Showing your most-played yardage so the map stays clear. Tap another yardage, or All, to change it.</p>' : '') +
      '<div class="stat-grid" id="proxstats">' +
      stat('Shots', P.n) + stat('Greens hit', P.n ? P.hits + ' / ' + P.n + ' (' + Math.round(P.hitPct) + '%)' : '–') +
      stat('Avg proximity – greens hit', fmtFt(P.avgHitFt)) + stat('Avg proximity – all', fmtFt(P.avgAllFt)) + '</div>' +
      '<div id="proxwarn">' + warnHTML + '</div>' +
      '<div class="liechips" id="liechips" role="group" aria-label="Starting lie">' + chips + '</div>' +
      '<button class="yall' + (D.bucket === 'all' ? ' sel' : '') + '" data-act="proxb" data-v="all" data-n="' + D.counts.all + '" aria-pressed="' + (D.bucket === 'all') + '">All 40–200 yd · ' + D.counts.all + ' shot' + (D.counts.all === 1 ? '' : 's') + '</button>' +
      '<div class="proxwrap"><div class="proxrail" id="proxrail" role="group" aria-label="Approach yardage">' + rail + '</div>' + proxSVG(L) + '</div>' +
      (D.outside ? '<p class="help muted" id="proxout">' + D.outside + ' regulation shot' + (D.outside === 1 ? '' : 's') + ' from outside 40–200 yd (e.g. a par-4 tee shot that missed, or under 35 yd) not shown.</p>' : '') +
      '<h3>By lie – ' + bname + '</h3>' + lieTab +
      '<div class="legend"><span><i class="ln" style="background:#1e6fd9"></i><i class="dot" style="background:#1e6fd9"></i>Hit the green – first-putt distance (ft) + direction from the hole</span>' +
      '<span><i class="ln" style="background:#e0102a"></i><i class="dot" style="background:#e0102a"></i>Missed the green – in the miss direction, distance to the pin at the same scale; label = yards left + lie (› = further than the picture, drawn at the edge)</span>' +
      '<span><svg width="20" height="20" viewBox="0 0 20 20" style="flex:none"><path d="M10 1 l9 9 -9 9 -9 -9z" fill="#888" stroke="#000" stroke-width="2"/><text x="10" y="14.5" text-anchor="middle" font-size="12" font-weight="900" fill="#fff">?</text></svg>No direction entered: blue = hit (straight up at the right distance), red = miss (top-right corner)</span>' +
      '<span><i class="dot" style="background:#fff;border:2px solid #555"></i>Where the shot was hit from (the strip under the green):</span>' +
      '<span><i class="sw" style="background:#9fdf86"></i>Fairway (middle)</span><span><i class="sw" style="background:#5f9e47"></i>Rough – left or right side from the direction you entered for the shot before, otherwise the side with fewer shots</span>' +
      '<span><i class="sw" style="background:#ecd27e"></i>Bunker</span><span><i class="sw" style="background:#c9f2b8;border:2px solid #9c9"></i>Tee box (par 3s)</span><span><i class="sw" style="background:#2f6b2a"></i>Trees / hazard drop / other</span>' +
      '<span><b class="star">★</b>Holed out</span><span>White rings: 5–30 ft from the hole</span></div>' +
      '<h3>Misses by direction</h3>' + dirTable(miss).replace('(not plotted)', '(drawn as ?)') +
      '<p class="help muted">One shot per hole, the same as the GIR and Approach-miss maps: the shot that reached the green in regulation (blue), or the regulation miss (red: par 3 = tee shot, par 4 = 2nd shot, par 5 = 3rd shot). ' +
      'It goes in the range it was hit from. A chip-in from 30 yd or closer right after counts as reaching the green (its proximity = the chip distance). ' +
      'Proximity: greens hit = first-putt feet; misses = yards left × 3; OB has no proximity and is left out of the averages. Yardage buttons (200 at the top, 40 at the bottom): the distance the shot was hit from, rounded to the nearest 10 yd, halves up (144 → 140, 145 → 150), so 150 = 145 to 154 yd. Greyed-out buttons have no shots; the small number is the shot count. Lie buttons filter the map and stats by where the shot was hit from (Rough includes deep rough; Other = trees, hazard and anything else). ⚠ = a lie with 3+ shots and no greens hit, or 30+ points worse than from the fairway. ' +
      'Only finished holes count.</p>';
  }
  // ---------- pin-location map ----------
  // ONE entry per finished hole with a pin set (its regulation shot - see SG regApproach)
  function pinData() {
    var D = { holes: [], noPin: 0, rounds: 0 };
    (view.mapScope === 'all' ? rounds : [round()]).forEach(function (r) {
      var S = SG.summarize(r, 'pga'); D.rounds++; D.noPin += S.noPin;
      S.pinHoles.forEach(function (x) { if (!x.appr) return; var o = { hole: x.hole, pin: x.pin }; for (var k in x.appr) o[k] = x.appr[k]; o.gir = x.gir; D.holes.push(o); });
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
    // greens hit: relative to the pin (white = in regulation, grey = not in regulation)
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
      else if (nod) out += '<g class="pdot" data-kind="nodir" data-hole="' + m.hole + '" data-x="' + x + '" data-y="' + y + '"><path d="M' + x + ' ' + (y - 9) + ' l9 9 -9 9 -9 -9z" fill="' + (m.gir ? '#fff' : '#bdbdbd') + '" stroke="#000" stroke-width="2.5"/><text x="' + x + '" y="' + (y + 4.5) + '" text-anchor="middle" font-size="12" font-weight="900">?</text></g>';
      else out += '<circle class="pdot" data-kind="' + (m.gir ? 'gir' : 'hit') + '"' + cl + ' data-hole="' + m.hole + '" cx="' + x + '" cy="' + y + '" r="7" fill="' + (m.gir ? '#fff' : '#bdbdbd') + '" stroke="#000" stroke-width="2.5"/>';
      if (!m.holed) out += lbl(q[0], q[1] + 20, Math.round(ft) + ' ft', '', 'plbl');
    });
    // missed greens: off the green in the miss direction
    var LN = { rough: 'Rough', deep: 'Deep rough', fairway: 'Fairway', sand: 'Bunker', hazard: 'Hazard', ob: 'OB', recovery: 'Trees' };
    var nd = 0;
    miss.forEach(function (m) {
      if (!m.dir) { // direction unknown: red "?" diamonds in the lower-right corner, so every hole is still drawn
        var qx = 334 - nd * 26, qy = 392; nd++;
        out += '<g class="pdot" data-kind="missnodir" data-hole="' + m.hole + '"><path d="M' + qx + ' ' + (qy - 10) + ' l10 10 -10 10 -10 -10z" fill="#e0102a" stroke="#000" stroke-width="2.5"/>' +
          '<text x="' + qx + '" y="' + (qy + 5) + '" text-anchor="middle" font-size="12" font-weight="900" fill="#fff">?</text></g>' +
          lbl(qx, qy + 24, m.lie === 'ob' ? 'OB' : Math.round(m.dist) + (m.unit === 'ft' ? ' ft' : ' yd'), '', 'mlbl');
        return;
      }
      var a = SG.DIR_ANGLE[m.dir], t = a * Math.PI / 180, j = seen['m' + m.dir] = (seen['m' + m.dir] || 0) + 1;
      var e = [PG.cx + PG.rx * Math.cos(t), PG.cy - PG.ry * Math.sin(t)], out1 = 18 + ((j - 1) % 2) * 30;
      var q = [e[0] + out1 * Math.cos(t), e[1] - out1 * Math.sin(t)];
      var side = Math.floor((j - 1) / 2) * 34 * (j % 4 < 2 ? 1 : -1);
      q = [q[0] + side * Math.sin(t), q[1] + side * Math.cos(t)];
      q = [Math.max(24, Math.min(336, q[0])), Math.max(14, Math.min(420, q[1]))];
      out += '<circle class="pdot" data-kind="miss" data-gir="' + (m.gir ? 1 : 0) + '" data-hole="' + m.hole + '" cx="' + f1(q[0]) + '" cy="' + f1(q[1]) + '" r="7" fill="#e0102a" stroke="#000" stroke-width="2.5"/>' +
        lbl(q[0], q[1] + 20, m.lie === 'ob' ? 'OB' : Math.round(m.dist) + (m.unit === 'ft' ? ' ft' : ' yd'), m.lie === 'ob' ? '' : (LN[m.lie] || (m.lie === 'green' ? 'Green' : m.lie)), 'mlbl');
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
        '<p class="help">Badge = number of <b>holes</b> with the pin there. Tap a part of the green to see how your approach into the green finished on each of those holes.</p>' +
        '<div class="pinwrap"><div class="pinlbl">BACK ↑</div><div class="pingreen pinstats" id="pinstats">';
      SG.PIN_GRID.forEach(function (rw) { rw.forEach(function (c) {
        var hs = onPin(D.holes, c), n = hs.length, g = hs.filter(function (x) { return x.gir; }).length;
        out += '<button data-act="pinseg" data-v="' + c + '" data-n="' + n + '" class="' + (hs.length ? 'has' : '') + '"><span class="badge">' + n + '</span>' + SG.PIN_NAME[c].replace(' ', '<br>') +
          (hs.length ? '<small>GIR ' + g + '/' + hs.length + '</small>' : '') + '</button>';
      }); });
      return out + '</div><div class="pinlbl">FRONT ↓ (toward you)</div></div>';
    }
    var hs = onPin(D.holes, seg), gir = hs.filter(function (x) { return x.hit; }), miss = hs.filter(function (x) { return !x.hit; }), g = hs.filter(function (x) { return x.gir; }).length;
    var nodirMiss = miss.filter(function (m) { return !m.dir; }).length;
    var out2 = '<button class="big" data-act="pinseg" data-v="">‹ All pin positions</button>' +
      '<p class="mapsum" id="mapsum">Pin <b>' + SG.PIN_NAME[seg] + '</b>: ' + hs.length + ' hole' + (hs.length === 1 ? '' : 's') + scope + '</p>' +
      '<div class="fwcounts" id="pinsum"><span>Greens hit (GIR) <b>' + gir.length + '</b></span><span>+ Missed <b>' + miss.length + '</b></span><span>= <b>' + hs.length + '</b> hole' + (hs.length === 1 ? '' : 's') + '</span></div>' +
      pinSVG(seg, gir, miss) +
      '<div class="legend"><span><i class="dot" style="background:#fff"></i>Green hit in regulation (GIR) – first-putt distance (ft) and direction from the pin; kept on the green if it runs past the drawn edge</span>' +
      '<span><svg width="20" height="20" viewBox="0 0 20 20" style="flex:none"><path d="M10 1 l9 9 -9 9 -9 -9z" fill="#fff" stroke="#000" stroke-width="2"/><text x="10" y="14.5" text-anchor="middle" font-size="12" font-weight="900">?</text></svg>Green hit, no direction entered (drawn straight up)</span>' +
      '<span><b class="star">★</b>Holed out</span>' +
      '<span><i class="dot" style="background:#e0102a"></i>Missed green – drawn off the green in the miss direction; label = yards left to the pin + where it finished</span>' +
      '<span><svg width="20" height="20" viewBox="0 0 20 20" style="flex:none"><path d="M10 1 l9 9 -9 9 -9 -9z" fill="#e0102a" stroke="#000" stroke-width="2"/><text x="10" y="14.5" text-anchor="middle" font-size="12" font-weight="900" fill="#fff">?</text></svg>Missed green, no direction entered (drawn in the bottom-right corner)</span></div>' +
      '<h3>Missed greens by direction</h3>' + dirTable(miss).replace('(not plotted)', '(drawn as ?)') +
      '<p class="help muted">One dot per hole. GIR holes (on the green in par − 2 strokes or fewer) count as greens hit, placed by the first-putt distance and direction. ' +
      'Every other hole is a miss: the regulation shot (par 3 = tee shot, par 4 = 2nd, par 5 = 3rd), drawn where it finished. GIR + missed = holes. A chip-in from 30 yd or closer counts as reaching the green. ' +
      'Front = toward you. Distances on the green are feet; off the green, yards.</p>' + note;
    return out2;
  }
  function stat(l, v) { return '<div class="stat"><b>' + v + '</b><span>' + l + '</span></div>'; }

  // ---------- CSV ----------
  function localDate(iso) { var t = new Date(iso); return t.getFullYear() + '-' + ('0' + (t.getMonth() + 1)).slice(-2) + '-' + ('0' + t.getDate()).slice(-2); }
  function csvFor(list) {
    var rows = [['date', 'course', 'hole', 'par', 'hole_yards', 'shot', 'from_lie', 'from_dist', 'from_unit', 'to_lie', 'to_dist', 'to_unit',
      'distance_hit_yd', 'miss', 'penalty', 'category', 'bucket', 'expected_before', 'expected_after', 'strokes_gained', 'hole_score', 'baseline', 'pin', 'gir', 'regulation']];
    list.forEach(function (r) {
      r.holes.forEach(function (h, hi) {
        var a = SG.analyzeHole(h, blOf(r));
        a.shots.forEach(function (s) {
          rows.push([localDate(r.date), r.course, hi + 1, h.par, SG.holeYards(h), s.n, s.start.lie, s.start.dist, unit(s.start.lie), s.end.lie,
            s.end.dist, s.end.lie === 'holed' ? '' : unit(s.end.lie), s.hit == null ? '' : s.hit, s.dir, s.pen, CAT_NAME[s.cat], s.bucket,
            s.eStart.toFixed(3), s.eEnd.toFixed(3), s.sg.toFixed(3), a.done ? a.strokes : '', blLabel(blOf(r)), SG.normPin(h.pin), a.done ? (a.gir ? 'yes' : 'no') : '', a.done && a.regShot === s.n - 1 ? (a.gir ? 'GIR' : 'miss') : '']);
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
  function download(csv, name, type) {
    var url = URL.createObjectURL(new Blob([csv], { type: type || 'text/csv' }));
    var a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 4000);
    toast(/\.json$/.test(name) ? 'Backup downloaded' : 'CSV downloaded');
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
      case 'new': view.from = null; newRound(document.getElementById('course').value.trim()); return;
      case 'resume': view.from = null; view.roundId = localStorage.getItem(CUR); goHole(firstOpenHole(round()), true); return;
      case 'open': view.roundId = b.getAttribute('data-id'); view.from = view.screen === 'history' ? 'history' : null; view.screen = 'summary'; view.map = null; render(); window.scrollTo(0, 0); return;
      case 'home': view.screen = 'home'; view.from = null; break;
      case 'history': view.screen = 'history'; view.notice = null; render(); window.scrollTo(0, 0); return;
      case 'backup': backupRounds(); return;
      case 'setname': setName((document.getElementById('pname') || {}).value); return;
      case 'editname': view.editName = true; render(); var pi = document.getElementById('pname'); if (pi) pi.focus(); return;
      case 'cancelname': view.editName = false; view.needName = null; render(); return;
      case 'histplayer': view.histPlayer = v || null; render(); return;
      case 'odconnect': case 'odreauth': case 'odsync': case 'odrestore': case 'odpick': case 'oddisconnect': odAct(act, v); return;
      case 'delHist': {
        var dr = rounds.filter(function (x) { return x.id === b.getAttribute('data-id'); })[0]; if (!dr) return;
        if (!confirm('Delete the round from ' + new Date(dr.date).toLocaleDateString() + (dr.course ? ' (' + dr.course + ')' : '') + ' for good?')) return;
        rounds = rounds.filter(function (x) { return x !== dr; }); save();
        if (localStorage.getItem(CUR) === dr.id) localStorage.removeItem(CUR);
        toast('Round deleted'); render(); return;
      }
      case 'about': view.back = view.screen; view.screen = 'about'; render(); window.scrollTo(0, 0); return;
      case 'aboutBack': view.screen = view.back && view.back !== 'about' ? view.back : 'home'; render(); window.scrollTo(0, 0); return;
      case 'setbl': setBaseline(v); return;
      case 'map': view.map = v; view.pinSeg = null; if (v === 'prox') view.proxB = null; view.mapScope = view.mapScope || 'round'; render(); return;
      case 'pinseg': view.pinSeg = v || null; render(); var pv = document.getElementById('mapview'); if (pv) pv.scrollTop = 0; return;
      case 'mapclose': view.map = null; render(); return;
      case 'pinopen': view.pinOpen = true; view.menu = null; view.dirk = null; render(); return;
      case 'pinclose': view.pinOpen = false; render(); return;
      case 'pinset': h.pin = SG.normPin(v); save(); render(); return;
      case 'pinclear': h.pin = ''; save(); render(); return;
      case 'proxb': { var mv0 = document.getElementById('mapview'), st0 = mv0 ? mv0.scrollTop : 0; view.proxB = v; render(); var mv1 = document.getElementById('mapview'); if (mv1) mv1.scrollTop = st0; return; }
      case 'proxlie': { var mvl = document.getElementById('mapview'), stl = mvl ? mvl.scrollTop : 0; view.proxLie = v; render(); var mvl2 = document.getElementById('mapview'); if (mvl2) mvl2.scrollTop = stl; return; }
      case 'puttn': { var mvp = document.getElementById('mapview'), stp = mvp ? mvp.scrollTop : 0; view.puttN = v; render(); var mvp2 = document.getElementById('mapview'); if (mvp2) mvp2.scrollTop = stp; return; }
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
        view.screen = view.from === 'history' ? 'history' : 'home'; break;
      case 'summary': view.screen = 'summary'; if (odOn && odState.pending) odSoon(300); render(); window.scrollTo(0, 0); return;
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
        h.finished = true; save(); odSoon(1500); view.menu = null;
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
    if (ev.target && ev.target.id === 'restorefile') {
      var f = ev.target.files && ev.target.files[0]; if (!f) return;
      var rd = new FileReader(); rd.onload = function () { restoreFrom(String(rd.result)); }; rd.onerror = function () { view.notice = { text: 'Could not read that file.', bad: true }; render(); };
      rd.readAsText(f); ev.target.value = ''; return;
    }
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

  render(); odInit();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    // When a new version is installed, reload once so the update shows right away.
    var hadController = !!navigator.serviceWorker.controller, reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (hadController && !reloaded) { reloaded = true; location.reload(); }
    });
    window.addEventListener('load', function () { navigator.serviceWorker.register('./sw.js').catch(function () {}); });
  }
  window.__golf = { odState: function () { return odState; }, csvFor: csvFor, rounds: function () { return rounds; } };
})();
