// A small stand-in for Firebase (Authentication REST + Realtime Database REST) for the coach-sharing tests.
// The access checks mirror database.rules.json by hand – see that file for the real rules.
// Usage: const F = require('./fakefirebase'); const srv = await F.start(port); … srv.close();
// Endpoints: /auth/accounts:<op>?key=…  /token/token?key=…  /db/<path>.json?auth=<idToken>   (CORS open, like Firebase)
const http = require('http');
function start(port) {
  const users = {}, byEmail = {}, tokens = {}, refresh = {}, sent = []; let tree = {}, n = 0, now = () => Date.now();
  const id = (p) => p + (++n).toString(36) + Math.random().toString(36).slice(2, 8);
  const segs = (p) => p.split('/').filter(Boolean).map(decodeURIComponent);
  const get = (s) => s.reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), tree);
  function set(s, v) {
    if (!s.length) { tree = v && typeof v === 'object' ? v : {}; return; }
    let o = tree; const path = [];
    for (let i = 0; i < s.length - 1; i++) { if (!o[s[i]] || typeof o[s[i]] !== 'object') o[s[i]] = {}; path.push(o); o = o[s[i]]; }
    if (v === null || v === undefined) delete o[s[s.length - 1]]; else o[s[s.length - 1]] = v;
    // prune empty objects (Firebase keeps no empty nodes)
    for (let i = s.length - 1; i >= 1; i--) { const node = get(s.slice(0, i)); if (node && typeof node === 'object' && !Object.keys(node).length) { const par = i === 1 ? tree : get(s.slice(0, i - 1)); delete par[s[i - 1]]; } else break; }
  }
  const sv = (v) => { if (v && typeof v === 'object') { if (v['.sv'] === 'timestamp') return now(); const o = Array.isArray(v) ? [] : {}; Object.keys(v).forEach((k) => { o[k] = sv(v[k]); }); return o; } return v; };
  const coachOf = (t) => (get(['teams', t, 'info']) || {}).coach;
  // ---- the rules, by hand ----
  function canRead(uid, s) {
    const [a, b, c, d] = s;
    if (a === 'live') return !!b && b.length >= 24;
    if (!uid) return false;
    if (a === 'codes') return !!b;
    if (a === 'teams' && b) { if (c === 'info') return true; if (c === 'members') return coachOf(b) === uid || (!!d && d === uid); return false; }
    if (a === 'data' && b) { const team = (get(['data', b]) || {}).team; return uid === b || (!!team && coachOf(team) === uid && !!get(['teams', team, 'members', b])); }
    if (a === 'coaches' && b) return uid === b;
    return false;
  }
  function canWrite(uid, s, v) {
    const [a, b, c, d] = s;
    if (a === 'live') return !!b && b.length >= 24;
    if (!uid || !b) return false;
    if (a === 'codes' && s.length === 2) { const old = get(s); if (old === undefined && typeof v === 'string') return coachOf(v) === uid; if (v === null && old !== undefined) return coachOf(old) === uid; return false; }
    if (a === 'teams' && c === 'info') { const old = get(['teams', b, 'info']); if (!old) return s.length === 3 && v && v.coach === uid; return old.coach === uid; }
    if (a === 'teams' && c === 'members' && d) return !!get(['teams', b, 'info']) && (uid === d || coachOf(b) === uid);
    if (a === 'data') return uid === b;
    if (a === 'coaches') return uid === b;
    return false;
  }
  function authUser(q) { const t = q.get('auth'); const u = t && tokens[t]; return u && u.exp > now() ? u.uid : null; }
  function issue(uid, email) { const t = id('tok_'), r = id('ref_'); tokens[t] = { uid, exp: now() + 3600e3 }; refresh[r] = uid; return { localId: uid, idToken: t, refreshToken: r, expiresIn: '3600', email }; }
  const srv = http.createServer((req, res) => {
    let body = ''; req.on('data', (c) => { body += c; }); req.on('end', () => {
      const H = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,PUT,PATCH,DELETE,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Content-Type': 'application/json' };
      const out = (code, j) => { res.writeHead(code, H); res.end(j === undefined ? 'null' : JSON.stringify(j)); };
      if (req.method === 'OPTIONS') return out(204);
      const u = new URL(req.url, 'http://x'), p = u.pathname; srv.log.push(req.method + ' ' + p);
      if (srv.offline) { req.socket.destroy(); return; }
      let j = null; try { j = body ? (req.headers['content-type'] || '').includes('json') ? JSON.parse(body) : Object.fromEntries(new URLSearchParams(body)) : null; } catch (e) { return out(400, { error: 'bad json' }); }
      const bad = (m) => out(400, { error: { code: 400, message: m } });
      if (p.startsWith('/auth/accounts:')) {
        const op = p.slice('/auth/accounts:'.length);
        if (op === 'signUp') { if (j.email) { if (byEmail[j.email.toLowerCase()]) return bad('EMAIL_EXISTS'); if (!j.password || j.password.length < 6) return bad('WEAK_PASSWORD : Password should be at least 6 characters'); }
          const uid = id('u'); users[uid] = { uid, email: j.email || null, pw: j.password || null }; if (j.email) byEmail[j.email.toLowerCase()] = uid; return out(200, issue(uid, j.email)); }
        if (op === 'signInWithPassword') { const uid = byEmail[String(j.email).toLowerCase()]; if (!uid || users[uid].pw !== j.password) return bad('INVALID_LOGIN_CREDENTIALS'); return out(200, issue(uid, j.email)); }
        if (op === 'sendOobCode') { sent.push({ type: j.requestType, email: j.email }); return out(200, { email: j.email }); }
        const t = j && j.idToken && tokens[j.idToken]; if (!t) return bad('INVALID_ID_TOKEN');
        if (op === 'update') { users[t.uid].pw = j.password; return out(200, issue(t.uid, users[t.uid].email)); }
        if (op === 'delete') { const e = users[t.uid] && users[t.uid].email; if (e) delete byEmail[e.toLowerCase()]; delete users[t.uid]; return out(200, {}); }
        return bad('unknown op');
      }
      if (p === '/token/token') { const uid = refresh[j.refresh_token]; if (!uid || !users[uid]) return bad('INVALID_REFRESH_TOKEN'); const r = issue(uid); return out(200, { id_token: r.idToken, refresh_token: r.refreshToken, user_id: uid, expires_in: '3600' }); }
      if (p.startsWith('/db/') && p.endsWith('.json')) {
        const s = segs(p.slice(4, -5)), uid = authUser(u.searchParams), deny = () => out(401, { error: 'Permission denied' });
        if (req.method === 'GET') { if (!canRead(uid, s)) return deny(); const v = get(s); return out(200, v === undefined ? null : v); }
        if (req.method === 'PUT') { const v = sv(j); if (!canWrite(uid, s, v)) return deny(); set(s, v); return out(200, v); }
        if (req.method === 'DELETE') { if (!canWrite(uid, s, null)) return deny(); set(s, null); return out(200, null); }
        if (req.method === 'PATCH') { const ch = Object.keys(j || {}).map((k) => [s.concat(segs(k)), sv(j[k])]); if (!ch.every(([q, v]) => canWrite(uid, q, v))) return deny(); ch.forEach(([q, v]) => set(q, v)); return out(200, j); }
      }
      out(404, { error: 'not found' });
    });
  });
  srv.log = []; srv.sent = sent; srv.users = users; srv.tree = () => tree; srv.setNow = (f) => { now = f; };
  return new Promise((r) => srv.listen(port, '127.0.0.1', () => r(srv)));
}
module.exports = { start };
