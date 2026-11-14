/* Coach sharing (v212): an athlete's rounds, tests, practice and lessons go to their coach automatically; the coach just taps a name.
 * Plain REST to Firebase (no SDK), the same Realtime Database as live sharing:
 *   sign-in:  Firebase Authentication (identitytoolkit / securetoken) – athletes get a quiet device account per player (no sign-up),
 *             coaches sign in with email + password (Firebase keeps the passwords and sends the reset emails).
 *   database: /codes/<CODE> → team id · /teams/<id>/info {name, coachName, coach, code} · /teams/<id>/members/<uid> {name, at, parentOk}
 *             /data/<uid> {team, profile, stamp, rounds/<key>, tests/<key>, practice/<key>} · /coaches/<uid> {team}
 *   Each item is stored as {j: JSON text, u: updated} so it comes back exactly as it went (Firebase drops empty arrays and nulls).
 * Who can see what is in database.rules.json: an athlete writes only their own /data; a coach reads only their own team's athletes.
 * Sending: after any change the app calls flush(); only changed items go, in one request; offline → it stays pending and goes next time.
 * Everything here takes fetch / storage / time from options, so it runs in tests against a stand-in server.
 */
(function (root) {
  'use strict';
  var KEY = 'golfsg.sync.v1', CODE_CHARS = 'ACDEFGHJKMNPQRTUVWXY34679'; // no 0/O, 1/I/L, 2/Z, 5/S, 8/B
  function rand(n, chars) {
    var c = root.crypto || (typeof require !== 'undefined' ? require('crypto').webcrypto : null), b = new Uint8Array(n * 2), out = '';
    chars = chars || 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    while (out.length < n) { c.getRandomValues(b); for (var i = 0; i < b.length && out.length < n; i++) if (b[i] < Math.floor(256 / chars.length) * chars.length) out += chars[b[i] % chars.length]; }
    return out;
  }
  function newCode() { var s = rand(6, CODE_CHARS); return s.slice(0, 3) + '-' + s.slice(3); }
  function cleanCode(c) { var s = String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/O/g, '0'); return s.length === 6 ? s.slice(0, 3) + '-' + s.slice(3) : null; }
  function fkey(k) { return String(k || '').replace(/[.#$\[\]\/]/g, '_') || '_'; }
  function hash(s) { var h = 5381; for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36) + ':' + s.length; }
  function lc(s) { return String(s || '').trim().toLowerCase(); }

  function create(O) {
    O = O || {};
    var F = O.fetch || (root.fetch && root.fetch.bind(root)), ST = O.storage || root.localStorage, now = O.now || function () { return Date.now(); };
    var C = O.cfg || {}, KEYP = C.apiKey || '', DB = String(C.db || '').replace(/\/+$/, '');
    var AUTH = String(C.authBase || 'https://identitytoolkit.googleapis.com/v1').replace(/\/+$/, ''), TOK = String(C.tokenBase || 'https://securetoken.googleapis.com/v1').replace(/\/+$/, '');
    function load() { try { var s = JSON.parse(ST.getItem(KEY) || 'null'); if (s && typeof s === 'object') { s.links = s.links || {}; return s; } } catch (e) {} return { links: {}, coach: null }; }
    var S = load();
    function persist() { try { ST.setItem(KEY, JSON.stringify(S)); } catch (e) {} }
    function err(code, msg) { var e = new Error(msg || code); e.code = code; return e; }
    function call(url, opt) {
      return F(url, opt).then(function (r) {
        return r.text().then(function (t) { var j = null; try { j = t ? JSON.parse(t) : null; } catch (e) {}
          if (!r.ok) { var m = (j && j.error && (j.error.message || j.error)) || ('HTTP ' + r.status); throw err(r.status === 401 || r.status === 403 || /permission/i.test(m) ? 'denied' : String(m), String(m)); }
          return j; });
      }, function () { throw err('offline', 'No connection'); });
    }
    function post(path, body) { return call(AUTH + '/' + path + '?key=' + encodeURIComponent(KEYP), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); }
    // ---------- accounts ----------
    function fromAuth(j, acc) { acc = acc || {}; acc.uid = j.localId || j.user_id; acc.id = j.idToken || j.id_token; acc.refresh = j.refreshToken || j.refresh_token; acc.exp = now() + (Number(j.expiresIn || j.expires_in) || 3600) * 1000; if (j.email) acc.email = j.email; return acc; }
    function token(acc) {
      if (acc.id && acc.exp > now() + 60000) return Promise.resolve(acc.id);
      return call(TOK + '/token?key=' + encodeURIComponent(KEYP), { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(acc.refresh) })
        .then(function (j) { fromAuth(j, acc); persist(); return acc.id; });
    }
    function db(acc, path, method, body, q) {
      return token(acc).then(function (t) {
        return call(DB + '/' + path + '.json?auth=' + encodeURIComponent(t) + (q || ''), { method: method || 'GET', headers: body !== undefined ? { 'Content-Type': 'application/json' } : {}, body: body !== undefined ? JSON.stringify(body) : undefined });
      });
    }
    function anon() { return post('accounts:signUp', { returnSecureToken: true }).then(function (j) { return fromAuth(j); }); }
    var api = { KEY: KEY, newCode: newCode, cleanCode: cleanCode, fkey: fkey, hash: hash };
    api.ready = function () { return !!(KEYP && DB && F); };
    api.state = function () { return S; };

    // ---------- athlete: connect, send, stop ----------
    api.link = function (player) { return S.links[lc(player)] || null; };
    var pendingAcc = {}; // a device account made while looking a code up, kept for the join that follows
    // Look a team code up: who the coach is, before the athlete agrees. Needs a device account (the database only answers signed-in phones).
    api.lookup = function (player, code) {
      var c = cleanCode(code); if (!c) return Promise.reject(err('badcode', 'That code should be 6 letters and numbers'));
      var L = api.link(player), accP = L ? Promise.resolve(L.acc) : pendingAcc[lc(player)] ? Promise.resolve(pendingAcc[lc(player)]) : anon().then(function (a) { pendingAcc[lc(player)] = a; return a; });
      return accP.then(function (acc) {
        return db(acc, 'codes/' + c).then(function (team) {
          if (!team) throw err('nocode', 'No team with that code');
          return db(acc, 'teams/' + fkey(team) + '/info').then(function (info) { if (!info) throw err('nocode', 'No team with that code'); return { team: team, code: c, name: info.name || '', coachName: info.coachName || '' }; });
        });
      });
    };
    api.join = function (player, T, o) {
      o = o || {}; var k = lc(player), acc = (api.link(player) || {}).acc || pendingAcc[k];
      if (!acc) return Promise.reject(err('nolookup', 'Look the code up first'));
      var at = now(), mem = { name: String(player).trim(), at: at, parentOk: !!o.parentOk };
      return db(acc, 'teams/' + fkey(T.team) + '/members/' + acc.uid, 'PUT', mem)
        .then(function () { return db(acc, 'data/' + acc.uid, 'PATCH', { team: T.team, name: mem.name, joined: at }); })
        .then(function () { S.links[k] = { acc: acc, player: mem.name, team: T.team, teamName: T.name, coachName: T.coachName, code: T.code, joined: at, hashes: {}, sent: 0, pending: true }; delete pendingAcc[k]; persist(); return S.links[k]; });
    };
    // Send what changed. snap = { profile, rounds: [...], tests: [...], practice: [...] } for that player.
    api.flush = function (player, snap) {
      var L = api.link(player); if (!L || !snap || L.removed) return Promise.resolve({ sent: 0 });
      var up = {}, H = {}, n = 0;
      ['rounds', 'tests', 'practice'].forEach(function (kind) { (snap[kind] || []).forEach(function (it) { if (!it || !it.id) return;
        var key = kind + '/' + fkey(it.id), j = JSON.stringify(it), h = hash(j); H[key] = h;
        if (L.hashes[key] !== h) { up[key] = { j: j, u: Date.parse(it.updated || it.date || '') || now() }; n++; } }); });
      Object.keys(L.hashes).forEach(function (key) { if (key !== 'profile' && !(key in H)) { up[key] = null; n++; } });
      var pj = JSON.stringify(snap.profile || {}), ph = hash(pj); H.profile = ph; if (L.hashes.profile !== ph) { up.profile = { j: pj }; n++; }
      if (!n) { if (L.pending) { L.pending = false; persist(); } return Promise.resolve({ sent: 0 }); }
      up.stamp = { '.sv': 'timestamp' }; up.name = L.player;
      L.pending = true; persist();
      return db(L.acc, 'data/' + L.acc.uid, 'PATCH', up).then(function () { L.hashes = H; L.pending = false; L.sent = now(); persist(); return { sent: n }; },
        function (e) { if (e.code === 'denied') { L.removed = true; persist(); } throw e; });
    };
    // Still on the team? A coach can remove an athlete; the athlete's phone notices, stops sending and tidies its online copy away.
    api.check = function (player) {
      var L = api.link(player); if (!L || L.removed) return Promise.resolve(L ? !L.removed : false);
      return db(L.acc, 'teams/' + fkey(L.team) + '/members/' + L.acc.uid).then(function (m) {
        if (m) return true; L.removed = true; persist(); return db(L.acc, 'data/' + L.acc.uid, 'DELETE').catch(function () {}).then(function () { return false; }); });
    };
    // Stop sharing: the online copy is deleted, the coach no longer sees this player, and the device account goes.
    api.leave = function (player) {
      var k = lc(player), L = S.links[k]; if (!L) return Promise.resolve();
      var acc = L.acc, done = function () { delete S.links[k]; persist(); };
      return db(acc, 'data/' + acc.uid, 'DELETE').then(function () { return db(acc, 'teams/' + fkey(L.team) + '/members/' + acc.uid, 'DELETE').catch(function () {}); })
        .then(function () { return token(acc).then(function (t) { return post('accounts:delete', { idToken: t }).catch(function () {}); }); })
        .then(done, function (e) { if (e.code === 'denied') { done(); return; } throw e; });
    };

    // ---------- coach: account, team, pulling athletes ----------
    api.coach = function () { return S.coach; };
    function coachTeam(acc) {
      return db(acc, 'coaches/' + acc.uid).then(function (c) { if (!c || !c.team) return null;
        return db(acc, 'teams/' + fkey(c.team) + '/info').then(function (info) { return info ? { team: c.team, name: info.name, coachName: info.coachName, code: info.code } : null; }); });
    }
    function makeTeam(acc, teamName, coachName, tries) {
      var team = rand(20), code = newCode(), info = { name: String(teamName || 'My team').trim(), coachName: String(coachName || '').trim(), coach: acc.uid, code: code, created: now() };
      return db(acc, 'teams/' + team + '/info', 'PUT', info).then(function () { return db(acc, 'codes/' + code, 'PUT', team); })
        .then(function () { return db(acc, 'coaches/' + acc.uid, 'PUT', { team: team }); })
        .then(function () { return { team: team, name: info.name, coachName: info.coachName, code: code }; },
          function (e) { if (e.code === 'denied' && (tries || 0) < 3) return makeTeam(acc, teamName, coachName, (tries || 0) + 1); throw e; }); // a code already taken → another
    }
    function setCoach(acc, T) { S.coach = { acc: acc, email: acc.email, team: T && T.team, teamName: T && T.name, coachName: T && T.coachName, code: T && T.code }; persist(); return S.coach; }
    api.coachSignUp = function (email, pw, coachName, teamName) {
      return post('accounts:signUp', { email: String(email).trim(), password: pw, returnSecureToken: true }).then(function (j) { var acc = fromAuth(j); acc.email = String(email).trim();
        return makeTeam(acc, teamName, coachName).then(function (T) { return setCoach(acc, T); }); });
    };
    api.coachSignIn = function (email, pw) {
      return post('accounts:signInWithPassword', { email: String(email).trim(), password: pw, returnSecureToken: true }).then(function (j) { var acc = fromAuth(j); acc.email = String(email).trim();
        return coachTeam(acc).then(function (T) { return setCoach(acc, T); }); });
    };
    api.coachMakeTeam = function (teamName, coachName) { var c = S.coach; if (!c) return Promise.reject(err('signedout'));
      return makeTeam(c.acc, teamName, coachName).then(function (T) { return setCoach(c.acc, T); }); };
    api.coachReset = function (email) { return post('accounts:sendOobCode', { requestType: 'PASSWORD_RESET', email: String(email).trim() }); };
    api.coachPassword = function (pw) { var c = S.coach; if (!c) return Promise.reject(err('signedout'));
      return token(c.acc).then(function (t) { return post('accounts:update', { idToken: t, password: pw, returnSecureToken: true }); }).then(function (j) { fromAuth(j, c.acc); persist(); }); };
    api.coachSignOut = function () { S.coach = null; persist(); };
    // Delete the coach account: the team, its code and every member link go too (athletes' own data stays on their phones).
    api.coachDelete = function () {
      var c = S.coach; if (!c) return Promise.resolve(); var acc = c.acc, T = c.team ? 'teams/' + fkey(c.team) : null;
      var p = T ? db(acc, T + '/members').then(function (m) { return Promise.all(Object.keys(m || {}).map(function (u) { return db(acc, T + '/members/' + u, 'DELETE'); })); })
        .then(function () { return c.code ? db(acc, 'codes/' + c.code, 'DELETE') : null; }).then(function () { return db(acc, T + '/info', 'DELETE'); }) : Promise.resolve();
      return p.then(function () { return db(acc, 'coaches/' + acc.uid, 'DELETE'); }).then(function () { return token(acc).then(function (t) { return post('accounts:delete', { idToken: t }); }); })
        .then(function () { S.coach = null; persist(); });
    };
    // The coach's view: every athlete on the team; an athlete's data is fetched again only when their stamp moved.
    // cache = { <uid>: { stamp, name, profile, rounds, tests, practice, member } } – returned updated (the caller keeps it on the phone).
    api.coachPull = function (cache) {
      var c = S.coach; if (!c || !c.team) return Promise.reject(err('signedout')); cache = cache || {};
      var T = 'teams/' + fkey(c.team);
      return db(c.acc, T + '/members').then(function (M) {
        M = M || {}; var out = {}, changed = [];
        return Promise.all(Object.keys(M).map(function (uid) {
          var old = cache[uid];
          return db(c.acc, 'data/' + uid + '/stamp').then(function (stamp) {
            if (old && old.stamp === stamp && stamp != null) { out[uid] = old; old.member = M[uid]; return; }
            return db(c.acc, 'data/' + uid).then(function (d) {
              d = d || {}; var A = { uid: uid, stamp: d.stamp == null ? null : d.stamp, name: d.name || M[uid].name || 'Athlete', member: M[uid], profile: {}, rounds: [], tests: [], practice: [] };
              try { A.profile = d.profile && d.profile.j ? JSON.parse(d.profile.j) : {}; } catch (e) {}
              ['rounds', 'tests', 'practice'].forEach(function (kind) { Object.keys(d[kind] || {}).forEach(function (k) { try { A[kind].push(JSON.parse(d[kind][k].j)); } catch (e) {} }); });
              A.seenAt = old ? old.seenAt || 0 : 0; // the app counts what's newer than the coach's last look as "New"
              out[uid] = A; changed.push(uid);
            });
          }).catch(function (e) { if (old) out[uid] = old; if (e.code === 'offline') throw e; });
        })).then(function () { return { athletes: out, changed: changed }; });
      });
    };
    api.coachRemove = function (uid) { var c = S.coach; if (!c) return Promise.reject(err('signedout')); return db(c.acc, 'teams/' + fkey(c.team) + '/members/' + uid, 'DELETE'); };
    return api;
  }

  var SYNC = { create: create, newCode: newCode, cleanCode: cleanCode, fkey: fkey, hash: hash, KEY: KEY };
  if (typeof module !== 'undefined' && module.exports) module.exports = SYNC;
  else root.SYNC = SYNC;
})(this);
