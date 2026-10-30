// In-memory fake of the Google Drive REST API (drive.file view) for the v98/v99 tests – no real Google calls.
const assert = require('assert');
function FakeDrive() {
  const D = { files: {}, n: 0, tokens: new Set(), log: [], revoked: [], user: 'scott.family@gmail.com' };
  const now = () => new Date(Date.UTC(2026, 9, 30, 15, 0, D.n)).toISOString();
  const mk = (o) => { if (o.parents.some(x => x !== 'root' && !D.files[x])) return null; // Drive: 404 for a parent that is gone
    const id = 'f' + (++D.n); D.files[id] = Object.assign({ id, modifiedTime: now() }, o); return D.files[id]; };
  const meta = f => ({ id: f.id, name: f.name, mimeType: f.mimeType, modifiedTime: f.modifiedTime, size: String((f.content || '').length) });
  function matches(f, q) {
    return q.split(' and ').every(c => { let m;
      if ((m = /^name = '(.*)'$/.exec(c))) return f.name === m[1].replace(/\\'/g, "'");
      if ((m = /^mimeType = '(.*)'$/.exec(c))) return f.mimeType === m[1];
      if ((m = /^'(.*)' in parents$/.exec(c))) return f.parents.includes(m[1]);
      if (c === 'trashed = false') return !f.trashed;
      throw new Error('fake drive: unknown query ' + c); });
  }
  D.handle = (method, url, auth, body) => {
    const u = new URL(url); D.log.push(method + ' ' + u.pathname + (u.search ? '?' + (u.searchParams.get('uploadType') || u.searchParams.get('alt') || 'q') : ''));
    if (u.hostname === 'oauth2.googleapis.com') { D.revoked.push(u.searchParams.get('token')); return { status: 200, body: '{}' }; }
    const tok = String(auth || '').replace(/^Bearer /, '');
    if (!D.tokens.has(tok)) return { status: 401, body: JSON.stringify({ error: { code: 401, message: 'Invalid Credentials' } }) };
    const p = u.pathname; let m;
    if (p === '/drive/v3/about') return { status: 200, body: JSON.stringify({ user: { displayName: 'Scott', emailAddress: D.user } }) };
    if (p === '/drive/v3/files' && method === 'GET') return { status: 200, body: JSON.stringify({ files: Object.values(D.files).filter(f => matches(f, u.searchParams.get('q'))).map(meta) }) };
    if (p === '/drive/v3/files' && method === 'POST') { const o = JSON.parse(body); const f = mk({ name: o.name, mimeType: o.mimeType, parents: o.parents }); return f ? { status: 200, body: JSON.stringify(meta(f)) } : { status: 404, body: '{}' }; }
    if ((m = /^\/drive\/v3\/files\/([^/]+)$/.exec(p)) && method === 'GET') { const f = D.files[m[1]]; return f ? { status: 200, body: f.content } : { status: 404, body: '{}' }; }
    if (p === '/upload/drive/v3/files' && method === 'POST') {
      assert.strictEqual(u.searchParams.get('uploadType'), 'multipart');
      const parts = body.split(/\r\n--[^\r\n]+/), head = body.split('\r\n')[0];
      const segs = body.split(head).slice(1, -1).map(s => s.split('\r\n\r\n').slice(1).join('\r\n\r\n').replace(/\r\n$/, ''));
      const o = JSON.parse(segs[0]); assert.ok(parts.length > 1);
      const f = mk({ name: o.name, mimeType: o.mimeType, parents: o.parents, content: segs[1] }); return f ? { status: 200, body: JSON.stringify(meta(f)) } : { status: 404, body: '{}' };
    }
    if ((m = /^\/upload\/drive\/v3\/files\/([^/]+)$/.exec(p)) && method === 'PATCH') {
      const f = D.files[m[1]]; if (!f) return { status: 404, body: '{}' }; f.content = body; f.modifiedTime = now(); D.n++; return { status: 200, body: JSON.stringify(meta(f)) };
    }
    return { status: 400, body: '{"error":"fake drive: unhandled ' + method + ' ' + p + '"}' };
  };
  D.fetch = (url, opt) => { opt = opt || {}; const r = D.handle(opt.method || 'GET', url, (opt.headers || {}).Authorization, opt.body);
    return Promise.resolve({ status: r.status, ok: r.status < 300, json: () => Promise.resolve(JSON.parse(r.body)), text: () => Promise.resolve(r.body) }); };
  D.find = (name, parentName) => Object.values(D.files).filter(f => f.name === name && (!parentName || f.parents.some(id => D.files[id] && D.files[id].name === parentName)));
  D.json = (name, parentName) => { const L = D.find(name, parentName); assert.strictEqual(L.length, 1, name + ' in ' + parentName + ': ' + L.length); return JSON.parse(L[0].content); };
  return D;
}
module.exports = FakeDrive;
