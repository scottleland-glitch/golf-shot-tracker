/* v98 Google Drive backup helpers (Drive REST v3, scope drive.file). No UI here – pure functions plus a sync step that
 * take a fetch function and a token, so they can be tested with a fake Drive.
 * Sign-in: full-page redirect to Google (implicit flow, response_type=token) – iPhone home-screen apps can't use popups.
 * The access token lasts about an hour and there is no refresh token: when it has run out, backups wait (pending) until
 * the next tap on "Sign in to Google", then upload straight away.
 * Drive layout: My Drive › Pin High Backups › <Player> › golf-rounds-<player>.json (+ weekly golf-rounds-<player>-YYYY-MM-DD.json).
 * Several phones can share one Google account and one player folder: before every upload the file on Drive is read and
 * merged by round id (both sides kept, the newer copy of the same round wins), so no phone overwrites another's rounds. */
(function (root) {
  var GD = {};
  GD.SCOPE = 'https://www.googleapis.com/auth/drive.file';
  GD.AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
  GD.API = 'https://www.googleapis.com/drive/v3';
  GD.UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
  GD.REVOKE = 'https://oauth2.googleapis.com/revoke';
  GD.ROOT = 'Pin High Backups';
  GD.FOLDER = 'application/vnd.google-apps.folder';
  GD.DATED_EVERY_DAYS = 7;
  GD.STATE_KEY = 'golfsg.gdrive.v1'; GD.TOKEN_KEY = 'golfsg.gdrive.token.v1'; GD.AUTHSTATE_KEY = 'golfsg.gdrive.authstate.v1';
  GD.enabled = function (cfg) { return !!(cfg && typeof cfg.googleClientId === 'string' && /^[0-9]+-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(cfg.googleClientId.trim())); };
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  GD.day = function (d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  GD.slug = function (name) {
    var s = String(name || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
    s = s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
    return s === 'backup' ? 'backup-player' : s;
  };
  GD.folderName = function (player) { return String(player || '').trim().replace(/\s+/g, ' ').replace(/[\/\\]/g, '-').slice(0, 40); };
  GD.fileFor = function (player) { return 'golf-rounds-' + GD.slug(player) + '.json'; };
  GD.datedFor = function (player, d) { return 'golf-rounds-' + GD.slug(player) + '-' + GD.day(d) + '.json'; };
  GD.parseName = function (n) { var m = /^golf-rounds-([a-z0-9]+(?:-[a-z0-9]+)*?)(?:-(\d{4}-\d\d-\d\d))?\.json$/.exec(n || ''); return m ? { slug: m[1], date: m[2] || null } : null; };

  // ---------- sign-in (redirect) ----------
  // https://host/golf-shot-tracker/ (exact, trailing slash) – also from …/index.html?x=1
  GD.redirectUri = function (loc) { return loc.origin + String(loc.pathname || '/').replace(/[^\/]*$/, ''); };
  GD.newAuthState = function (rand) {
    var b = new Uint8Array(16); (rand || function (a) { for (var i = 0; i < a.length; i++) a[i] = Math.floor(Math.random() * 256); return a; })(b);
    return Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
  };
  GD.authUrl = function (clientId, redirectUri, state, hint) {
    var q = { client_id: clientId, redirect_uri: redirectUri, response_type: 'token', scope: GD.SCOPE, prompt: 'select_account', include_granted_scopes: 'true', state: state };
    if (hint) q.login_hint = hint;
    return GD.AUTH + '?' + Object.keys(q).map(function (k) { return k + '=' + encodeURIComponent(q[k]); }).join('&');
  };
  // '#access_token=…&expires_in=3599&state=…' → { access_token, expires_in, state, error } | null (not a Google return)
  GD.parseHash = function (hash) {
    var h = String(hash || '').replace(/^#/, ''); if (!/(^|&)(access_token|error)=/.test(h)) return null;
    var o = {}; h.split('&').forEach(function (p) { var i = p.indexOf('='); if (i > 0) o[decodeURIComponent(p.slice(0, i))] = decodeURIComponent(p.slice(i + 1).replace(/\+/g, ' ')); });
    return o;
  };
  // → { token: { accessToken, expiresAt } } | { error } (wrong / missing state = error, never trusted)
  GD.checkReturn = function (p, expected, now) {
    if (!p) return null;
    if (!p.state || !expected || expected.indexOf(p.state) < 0) return { error: 'Google sign-in could not be checked – please try again.' };
    if (p.error) return { error: p.error === 'access_denied' ? 'Google sign-in was cancelled.' : 'Google sign-in failed (' + p.error + ').' };
    if (!p.access_token) return { error: 'Google sign-in failed – no access was given.' };
    if (p.scope && p.scope.split(' ').indexOf(GD.SCOPE) < 0) return { error: 'Google Drive access was not allowed – tick the Drive box when you sign in.' };
    var sec = parseInt(p.expires_in, 10); if (!(sec > 0)) sec = 3600;
    return { token: { accessToken: p.access_token, expiresAt: (now || Date.now()) + sec * 1000 } };
  };
  GD.tokenValid = function (t, now) { return !!(t && t.accessToken && t.expiresAt > (now || Date.now()) + 60000); };

  // ---------- state ----------
  GD.newState = function () { return { connected: false, user: '', pending: false, dirtyAt: null, lastOk: null, lastDated: {}, lastError: null, needsAuth: false, attempts: 0, ids: {} }; };
  GD.loadState = function (store) { try { var s = JSON.parse(store.getItem(GD.STATE_KEY)); if (s) { var o = GD.newState(); for (var k in s) o[k] = s[k]; return o; } } catch (e) {} return GD.newState(); };
  GD.saveState = function (store, s) { store.setItem(GD.STATE_KEY, JSON.stringify(s)); };
  GD.markDirty = function (s, now) { s.pending = true; s.dirtyAt = (now || new Date()).toISOString(); return s; };

  // ---------- Drive REST ----------
  function err(kind, msg, status) { var e = new Error(msg); e.kind = kind; e.status = status; return e; }
  function call(f, token, url, opt) {
    opt = opt || {}; opt.headers = opt.headers || {}; opt.headers.Authorization = 'Bearer ' + token;
    return f(url, opt).then(function (res) {
      if (res.status === 401) throw err('auth', 'Google sign-in has run out', 401);
      if (res.status === 404) throw err('gone', 'Not found on Google Drive', 404);
      if (!res.ok) throw err(res.status === 429 || res.status >= 500 ? 'retry' : 'http', 'Google Drive error ' + res.status, res.status);
      return res;
    }, function () { throw err('offline', 'No connection to Google Drive', 0); });
  }
  function qs(s) { return "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'"; }
  GD.find = function (f, token, q) {
    return call(f, token, GD.API + '/files?q=' + encodeURIComponent(q + ' and trashed = false') + '&fields=' + encodeURIComponent('files(id,name,mimeType,modifiedTime,size)') + '&spaces=drive&pageSize=200')
      .then(function (r) { return r.json(); }).then(function (j) { return j.files || []; });
  };
  GD.findFolder = function (f, token, name, parent) { return GD.find(f, token, 'name = ' + qs(name) + ' and mimeType = ' + qs(GD.FOLDER) + ' and ' + qs(parent || 'root') + ' in parents').then(function (L) { return L[0] || null; }); };
  GD.createFolder = function (f, token, name, parent) {
    return call(f, token, GD.API + '/files?fields=id,name', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name, mimeType: GD.FOLDER, parents: [parent || 'root'] }) }).then(function (r) { return r.json(); });
  };
  GD.ensureFolder = function (f, token, name, parent) { return GD.findFolder(f, token, name, parent).then(function (x) { return x || GD.createFolder(f, token, name, parent); }).then(function (x) { return x.id; }); };
  GD.findFile = function (f, token, name, parent) { return GD.find(f, token, 'name = ' + qs(name) + ' and ' + qs(parent) + ' in parents').then(function (L) { return L.filter(function (x) { return x.mimeType !== GD.FOLDER; })[0] || null; }); };
  GD.download = function (f, token, id) { return call(f, token, GD.API + '/files/' + encodeURIComponent(id) + '?alt=media').then(function (r) { return r.text(); }); };
  GD.createFile = function (f, token, name, parent, json) {
    var b = 'pinhigh' + Date.now().toString(36), body = '--' + b + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify({ name: name, parents: [parent], mimeType: 'application/json' }) +
      '\r\n--' + b + '\r\nContent-Type: application/json\r\n\r\n' + json + '\r\n--' + b + '--';
    return call(f, token, GD.UPLOAD + '/files?uploadType=multipart&fields=id,name,modifiedTime', { method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + b }, body: body }).then(function (r) { return r.json(); });
  };
  GD.updateFile = function (f, token, id, json) {
    return call(f, token, GD.UPLOAD + '/files/' + encodeURIComponent(id) + '?uploadType=media&fields=id,name,modifiedTime', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: json }).then(function (r) { return r.json(); });
  };
  GD.about = function (f, token) { return call(f, token, GD.API + '/about?fields=user(displayName,emailAddress)').then(function (r) { return r.json(); }).then(function (j) { return (j.user && (j.user.emailAddress || j.user.displayName)) || ''; }); };
  // Restore: the player folders, then one player's files (latest first, then weekly copies newest first)
  GD.listPlayers = function (f, token) {
    return GD.findFolder(f, token, GD.ROOT, 'root').then(function (rt) {
      if (!rt) return [];
      return GD.find(f, token, qs(rt.id) + ' in parents and mimeType = ' + qs(GD.FOLDER)).then(function (L) { return L.map(function (x) { return { id: x.id, name: x.name }; }).sort(function (a, b) { return a.name.localeCompare(b.name); }); });
    });
  };
  GD.listFiles = function (f, token, folderId) {
    return GD.find(f, token, qs(folderId) + ' in parents').then(function (L) {
      return L.filter(function (x) { return GD.parseName(x.name); }).map(function (x) { return { id: x.id, name: x.name, size: +x.size || 0, modified: x.modifiedTime, date: GD.parseName(x.name).date }; })
        .sort(function (a, b) { return !a.date ? -1 : !b.date ? 1 : b.date.localeCompare(a.date); });
    });
  };

  // ---------- merge (several phones, one player file) ----------
  function newer(a, b) { return String(a.updated || '') >= String(b.updated || ''); } // tie → this phone's copy
  // v99 drops: rounds moved to another player on this phone ({ id, player: new player, updated }). The old player's file
  // leaves out that id unless its copy is newer than the move (changed somewhere else afterwards).
  GD.mergeBackup = function (remote, local, drops) {
    var out = {}; for (var k in local) out[k] = local[k]; out.dropped = 0;
    if (!remote || typeof remote !== 'object' || !Array.isArray(remote.rounds)) return out;
    var byId = {}, list = [], kept = 0, dr = {};
    (drops || []).forEach(function (d) { dr[d.id] = d; });
    (local.rounds || []).forEach(function (r) { byId[r.id] = list.length; list.push(r); });
    remote.rounds.forEach(function (r) {
      if (!r || typeof r.id !== 'string' || !Array.isArray(r.holes)) return;
      if (byId[r.id] == null && dr[r.id] && String(r.updated || '') <= String(dr[r.id].updated || '')) { out.dropped++; return; }
      if (byId[r.id] == null) { byId[r.id] = list.length; list.push(r); kept++; return; }
      var i = byId[r.id]; if (!newer(list[i], r)) list[i] = r;
    });
    out.rounds = list; out.count = list.length;
    var cs = {}; (remote.courses || []).concat(local.courses || []).forEach(function (c) { if (c && c.id && (!cs[c.id] || String(c.updated || '') >= String(cs[c.id].updated || ''))) cs[c.id] = c; });
    if (Object.keys(cs).length) out.courses = Object.keys(cs).map(function (k) { return cs[k]; });
    ['bag', 'wedges'].forEach(function (k) { if (!out[k] && remote[k]) out[k] = remote[k]; else if (out[k] && remote[k] && String(remote[k].updated || '') > String(out[k].updated || '')) out[k] = remote[k]; });
    if (!out.player && remote.player) out.player = remote.player;
    return out;
  };

  /* One sync attempt. o: { state, fetch, token, online, now, files: [{ player, backup }] }
   * For each player: Pin High Backups › <Player> › golf-rounds-<slug>.json is read, merged, and written back in place
   * (created the first time), plus a dated weekly copy. No valid token → waits (needsAuth), nothing is lost. */
  // Round moved to another player (v99): its old player(s) – r.movedFrom – lose that id from their file
  GD.dropsFor = function (moved, player) {
    var k = GD.folderName(player).toLowerCase();
    return (moved || []).filter(function (m) { return GD.folderName(m.player).toLowerCase() !== k && (m.from || []).some(function (f) { return GD.folderName(f).toLowerCase() === k; }); });
  };
  /* v101 restore list: every round in one player's backup file, compared with the phone (by id only, so nothing is hidden).
   * Rounds with no name get the folder's player. The same id twice in a file keeps the newer copy (by 'updated').
   * status: 'new' = not on this phone · 'newer' = on this phone, the backup copy is newer · 'same' = on this phone (same or phone copy newer).
   * Sorted newest round first. */
  GD.restoreList = function (backup, player, local) {
    var list = backup && Array.isArray(backup.rounds) ? backup.rounds : Array.isArray(backup) ? backup : [], by = {}, order = [], mine = {};
    var bp = player || (backup && !Array.isArray(backup) && backup.player) || '';
    list.forEach(function (r) {
      if (!r || typeof r.id !== 'string' || !r.id || !Array.isArray(r.holes)) return;
      var c = JSON.parse(JSON.stringify(r)); if (!c.player && bp) c.player = bp;
      if (!by[c.id]) { by[c.id] = c; order.push(c.id); } else if (String(c.updated || '') > String(by[c.id].updated || '')) by[c.id] = c;
    });
    (local || []).forEach(function (r) { if (r && r.id) mine[r.id] = r; });
    return order.map(function (id) {
      var r = by[id], L = mine[id], st = 'new', diff = !!L && JSON.stringify(L) !== JSON.stringify(r);
      if (L) st = diff && r.updated && String(r.updated) > String(L.updated || '') ? 'newer' : 'same';
      return { round: r, status: st, phoneNewer: st === 'same' && diff };
    }).sort(function (a, b) { return String(b.round.date || '').localeCompare(String(a.round.date || '')); });
  };
  // Put the chosen rounds into the phone's list: new ones are added, 'newer' ones replace the phone copy in place; ids are kept.
  GD.applyRestore = function (local, items, chosen) {
    var out = (local || []).slice(), at = {}, res = { added: 0, updated: 0 };
    out.forEach(function (r, i) { at[r.id] = i; });
    (items || []).forEach(function (it) {
      if (!chosen[it.round.id] || it.status === 'same') return;
      if (at[it.round.id] == null) { at[it.round.id] = out.length; out.push(it.round); res.added++; }
      else if (it.status === 'newer') { out[at[it.round.id]] = it.round; res.updated++; }
    });
    res.rounds = out; return res;
  };
  GD.movedFrom = function (rounds) { return (rounds || []).filter(function (r) { return r && r.movedFrom && r.movedFrom.length; }).map(function (r) { return { id: r.id, player: r.player || '', from: r.movedFrom.slice(), updated: r.updated || '' }; }); };
  GD.sync = function (o) {
    var s = o.state, now = o.now || new Date(), f = o.fetch, t = o.token;
    if (!s.pending) return Promise.resolve(s);
    if (!o.files || !o.files.length) { s.lastError = 'Enter your player name to start backing up'; return Promise.resolve(s); }
    if (!t) { s.needsAuth = true; s.lastError = null; return Promise.resolve(s); }
    if (o.online === false) { s.lastError = 'Offline – will back up when you\'re back online'; return Promise.resolve(s); }
    s.attempts++; s.ids = s.ids || {}; s.lastDated = s.lastDated || {};
    var rootP = null;
    function rootId() { return rootP || (rootP = s.ids.root ? Promise.resolve(s.ids.root) : GD.ensureFolder(f, t, GD.ROOT, 'root').then(function (id) { s.ids.root = id; return id; })); }
    function one(p) {
      var fname = GD.folderName(p.player), key = 'p:' + fname.toLowerCase(), name = GD.fileFor(p.player), sl = GD.slug(p.player), drops = GD.dropsFor(o.moved, p.player);
      var only = !(p.backup.rounds || []).length && p.dropOnly; // just tidying an old player's file: never make folders / files for it
      return rootId().then(function (rid) { return s.ids[key] || (only ? GD.findFolder(f, t, fname, rid).then(function (x) { return x && x.id; }) : GD.ensureFolder(f, t, fname, rid)).then(function (id) { if (id) s.ids[key] = id; return id; }); }).then(function (fid) {
        if (!fid) return null;
        return GD.findFile(f, t, name, fid).then(function (ex) {
          if (!ex && only) return null;
          return (ex ? GD.download(f, t, ex.id).then(function (txt) { try { return JSON.parse(txt); } catch (e) { return null; } }) : Promise.resolve(null)).then(function (remote) {
            var M = GD.mergeBackup(remote, p.backup, drops), nd = M.dropped; delete M.dropped;
            if (only && remote) { var keep = {}; for (var k in remote) keep[k] = remote[k]; keep.rounds = M.rounds; keep.count = keep.rounds.length; M = keep; } // keep that file's bag / wedges / player as they were
            if (only && !nd) return null; // nothing to take out
            var json = JSON.stringify(M, null, 1);
            return (ex ? GD.updateFile(f, t, ex.id, json) : GD.createFile(f, t, name, fid, json)).then(function () {
              if (s.lastDated[sl] && now.getTime() - new Date(s.lastDated[sl]).getTime() < GD.DATED_EVERY_DAYS * 864e5) return null;
              var dn = GD.datedFor(p.player, now);
              return GD.findFile(f, t, dn, fid).then(function (d) { return d ? GD.updateFile(f, t, d.id, json) : GD.createFile(f, t, dn, fid, json); }).then(function () { s.lastDated[sl] = now.toISOString(); });
            });
          });
        });
      });
    }
    function all() { return o.files.reduce(function (p, x) { return p.then(function () { return one(x); }); }, Promise.resolve()); }
    return all().catch(function (e) { if (e && e.kind === 'gone') { s.ids = {}; rootP = null; return all(); } throw e; }).then(function () { // a folder was deleted in Drive → find / make it again
      s.pending = false; s.lastOk = now.toISOString(); s.lastError = null; s.needsAuth = false; s.attempts = 0; return s;
    }, function (e) {
      if (e && e.kind === 'auth') { s.needsAuth = true; s.lastError = null; }
      else if (e && e.kind === 'offline') s.lastError = 'Offline – will back up when you\'re back online';
      else s.lastError = (e && e.message) || 'Upload failed – will retry';
      return s;
    });
  };
  GD.retryDelay = function (attempts) { return Math.min(600000, 15000 * Math.pow(2, Math.max(0, attempts - 1))); };
  if (typeof module !== 'undefined' && module.exports) module.exports = GD; else root.GD = GD;
})(typeof window !== 'undefined' ? window : this);
