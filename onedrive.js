/* OneDrive backup helpers (Microsoft Graph, app folder). No UI here – pure functions + a sync step
 * that take a fetch function and a token getter, so they can be unit-tested with a fake Graph. */
(function (root) {
  var OD = {};
  OD.GRAPH = 'https://graph.microsoft.com/v1.0';
  OD.SCOPES = ['Files.ReadWrite.AppFolder', 'User.Read'];
  OD.FILE = 'golf-rounds-backup.json';          // LEGACY single-player file (before player names) – never deleted
  OD.DATED_EVERY_DAYS = 7;                        // plus a dated copy at most once a week
  OD.STATE_KEY = 'golfsg.onedrive.v1';
  var GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  OD.enabled = function (cfg) { return !!(cfg && typeof cfg.onedriveClientId === 'string' && GUID.test(cfg.onedriveClientId.trim())); };
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  OD.day = function (d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  OD.datedName = function (d) { return 'golf-rounds-backup-' + OD.day(d) + '.json'; };
  // Player names -> file-safe slug: "Scott Leland" -> "scott-leland", "Zoë" -> "zoe". 'backup' is reserved (legacy file).
  OD.slug = function (name) {
    var s = String(name || '').normalize ? String(name || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '') : String(name || '');
    s = s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
    return s === 'backup' ? 'backup-player' : s;
  };
  OD.fileFor = function (name) { return 'golf-rounds-' + OD.slug(name) + '.json'; };
  OD.datedFor = function (name, d) { return 'golf-rounds-' + OD.slug(name) + '-' + OD.day(d) + '.json'; };
  // Parse a backup file name -> { slug, legacy, date } (null if it isn't one of ours)
  OD.parseName = function (n) {
    var m = /^golf-rounds-backup(?:-(\d{4}-\d\d-\d\d))?\.json$/.exec(n || '');
    if (m) return { slug: '', legacy: true, date: m[1] || null };
    m = /^golf-rounds-([a-z0-9]+(?:-[a-z0-9]+)*?)(?:-(\d{4}-\d\d-\d\d))?\.json$/.exec(n || '');
    return m ? { slug: m[1], legacy: false, date: m[2] || null } : null;
  };
  OD.label = function (slug) { return slug.split('-').map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join(' '); };
  // Group a file list by player: [{ slug, label, legacy, files: [latest, then dated newest first] }]; players A-Z, legacy last.
  OD.groupFiles = function (files) {
    var g = {};
    files.forEach(function (f) { var p = OD.parseName(f.name); if (!p) return; var k = p.legacy ? '~legacy' : p.slug;
      (g[k] = g[k] || { slug: p.slug, legacy: p.legacy, label: p.legacy ? 'Older backup' : OD.label(p.slug), files: [] }).files.push({ name: f.name, size: f.size, modified: f.modified, date: p.date }); });
    return Object.keys(g).sort().map(function (k) { g[k].files.sort(function (a, b) { return !a.date ? -1 : !b.date ? 1 : b.date.localeCompare(a.date); }); return g[k]; });
  };
  OD.needDated = function (lastISO, now) { return !lastISO || (now.getTime() - new Date(lastISO).getTime()) >= OD.DATED_EVERY_DAYS * 864e5; };
  OD.isBackupName = function (n) { return !!OD.parseName(n); };
  OD.itemUrl = function (name) { return OD.GRAPH + '/me/drive/special/approot:/' + encodeURIComponent(name) + ':/content'; };
  OD.listUrl = OD.GRAPH + '/me/drive/special/approot/children?$select=name,size,lastModifiedDateTime&$top=200';
  OD.newState = function () { return { pending: false, dirtyAt: null, lastOk: null, lastDated: null, lastError: null, needsAuth: false, attempts: 0 }; };
  OD.loadState = function (store) { try { var s = JSON.parse(store.getItem(OD.STATE_KEY)); if (s) { var o = OD.newState(); for (var k in s) o[k] = s[k]; return o; } } catch (e) {} return OD.newState(); };
  OD.saveState = function (store, s) { store.setItem(OD.STATE_KEY, JSON.stringify(s)); };
  OD.markDirty = function (s, now) { s.pending = true; s.dirtyAt = (now || new Date()).toISOString(); return s; };

  function err(kind, msg, status) { var e = new Error(msg); e.kind = kind; e.status = status; return e; }
  function call(fetchFn, token, url, opt) {
    opt = opt || {}; opt.headers = opt.headers || {}; opt.headers.Authorization = 'Bearer ' + token;
    return fetchFn(url, opt).then(function (res) {
      if (res.status === 401) throw err('auth', 'OneDrive sign-in expired', 401);
      if (!res.ok) throw err(res.status === 429 || res.status >= 500 ? 'retry' : 'http', 'OneDrive error ' + res.status, res.status);
      return res;
    }, function (e) { throw err('offline', 'No connection to OneDrive', 0); });
  }
  OD.upload = function (fetchFn, token, name, json) {
    return call(fetchFn, token, OD.itemUrl(name), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: json }).then(function (r) { return r.json(); });
  };
  OD.list = function (fetchFn, token) {
    return call(fetchFn, token, OD.listUrl).then(function (r) { return r.json(); }).then(function (j) {
      return (j.value || []).filter(function (f) { return OD.isBackupName(f.name); }).map(function (f) { return { name: f.name, size: f.size, modified: f.lastModifiedDateTime }; })
        .sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
    });
  };
  OD.download = function (fetchFn, token, name) { return call(fetchFn, token, OD.itemUrl(name)).then(function (r) { return r.text(); }); };
  OD.me = function (fetchFn, token) { return call(fetchFn, token, OD.GRAPH + '/me?$select=displayName,userPrincipalName,mail').then(function (r) { return r.json(); }); };

  /* One sync attempt. opts: { state, fetch, getToken() -> Promise<token>, json, now, online, player }
   * player (required) names the files: golf-rounds-<slug>.json + weekly golf-rounds-<slug>-YYYY-MM-DD.json.
   * The legacy golf-rounds-backup.json is never touched.
   * Uploads golf-rounds-backup.json, and a dated copy when the last one is a week old.
   * Offline / server busy: stays pending (retried later). Expired sign-in: needsAuth. Returns the state. */
  OD.sync = function (o) {
    var s = o.state, now = o.now || new Date();
    if (!s.pending) return Promise.resolve(s);
    if (!OD.slug(o.player)) { s.lastError = 'Enter your player name to start backing up'; return Promise.resolve(s); }
    if (s.datedFor !== OD.slug(o.player)) { s.lastDated = null; s.datedFor = OD.slug(o.player); } // new name -> first dated copy now
    if (o.online === false) { s.lastError = 'Offline – will upload when you\'re back online'; return Promise.resolve(s); }
    s.attempts++;
    var token;
    return Promise.resolve(o.getToken()).then(function (t) {
      token = t; return OD.upload(o.fetch, token, OD.fileFor(o.player), o.json);
    }).then(function () {
      if (!OD.needDated(s.lastDated, now)) return null;
      return OD.upload(o.fetch, token, OD.datedFor(o.player, now), o.json).then(function () { s.lastDated = now.toISOString(); });
    }).then(function () {
      s.pending = false; s.lastOk = now.toISOString(); s.lastError = null; s.needsAuth = false; s.attempts = 0; return s;
    }, function (e) {
      if (e && (e.kind === 'auth' || e.kind === 'interaction')) { s.needsAuth = true; s.lastError = 'Reconnect OneDrive to keep backing up'; }
      else if (e && e.kind === 'offline') s.lastError = 'Offline – will upload when you\'re back online';
      else s.lastError = (e && e.message) || 'Upload failed – will retry';
      return s;
    });
  };
  // Retry delay after a failed attempt: 15 s, 30 s, 1 min, ... capped at 10 min.
  OD.retryDelay = function (attempts) { return Math.min(600000, 15000 * Math.pow(2, Math.max(0, attempts - 1))); };

  if (typeof module !== 'undefined' && module.exports) module.exports = OD; else root.OD = OD;
})(typeof window !== 'undefined' ? window : this);
