/* OneDrive backup helpers (Microsoft Graph, app folder). No UI here – pure functions + a sync step
 * that take a fetch function and a token getter, so they can be unit-tested with a fake Graph. */
(function (root) {
  var OD = {};
  OD.GRAPH = 'https://graph.microsoft.com/v1.0';
  OD.SCOPES = ['Files.ReadWrite.AppFolder', 'User.Read'];
  OD.FILE = 'golf-rounds-backup.json';          // always the latest copy (overwritten)
  OD.DATED_EVERY_DAYS = 7;                        // plus a dated copy at most once a week
  OD.STATE_KEY = 'golfsg.onedrive.v1';
  var GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  OD.enabled = function (cfg) { return !!(cfg && typeof cfg.onedriveClientId === 'string' && GUID.test(cfg.onedriveClientId.trim())); };
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  OD.day = function (d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  OD.datedName = function (d) { return 'golf-rounds-backup-' + OD.day(d) + '.json'; };
  OD.needDated = function (lastISO, now) { return !lastISO || (now.getTime() - new Date(lastISO).getTime()) >= OD.DATED_EVERY_DAYS * 864e5; };
  OD.isBackupName = function (n) { return /^golf-rounds-backup(-\d{4}-\d\d-\d\d)?\.json$/.test(n || ''); };
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
        .sort(function (a, b) { return a.name === OD.FILE ? -1 : b.name === OD.FILE ? 1 : String(b.name).localeCompare(String(a.name)); });
    });
  };
  OD.download = function (fetchFn, token, name) { return call(fetchFn, token, OD.itemUrl(name)).then(function (r) { return r.text(); }); };
  OD.me = function (fetchFn, token) { return call(fetchFn, token, OD.GRAPH + '/me?$select=displayName,userPrincipalName,mail').then(function (r) { return r.json(); }); };

  /* One sync attempt. opts: { state, fetch, getToken() -> Promise<token>, json, now, online }
   * Uploads golf-rounds-backup.json, and a dated copy when the last one is a week old.
   * Offline / server busy: stays pending (retried later). Expired sign-in: needsAuth. Returns the state. */
  OD.sync = function (o) {
    var s = o.state, now = o.now || new Date();
    if (!s.pending) return Promise.resolve(s);
    if (o.online === false) { s.lastError = 'Offline – will upload when you\'re back online'; return Promise.resolve(s); }
    s.attempts++;
    var token;
    return Promise.resolve(o.getToken()).then(function (t) {
      token = t; return OD.upload(o.fetch, token, OD.FILE, o.json);
    }).then(function () {
      if (!OD.needDated(s.lastDated, now)) return null;
      return OD.upload(o.fetch, token, OD.datedName(now), o.json).then(function () { s.lastDated = now.toISOString(); });
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
