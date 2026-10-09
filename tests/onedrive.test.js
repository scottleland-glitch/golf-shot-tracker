const test = require('node:test'); const assert = require('assert');
const OD = require('../onedrive.js');
// Fake Microsoft Graph app folder
function fakeGraph() {
  const files = {}, log = []; let mode = 'ok';
  const fetch = async (url, opt = {}) => {
    log.push([opt.method || 'GET', url, opt.headers && opt.headers.Authorization]);
    if (mode === 'offline') throw new TypeError('Failed to fetch');
    if (mode === '401') return { ok: false, status: 401 };
    if (mode === '503') return { ok: false, status: 503 };
    const m = url.match(/approot:\/(.+):\/content$/);
    if (m && opt.method === 'PUT') { files[decodeURIComponent(m[1])] = { body: opt.body, t: '2026-10-09T18:00:00Z' }; return { ok: true, status: 201, json: async () => ({ name: decodeURIComponent(m[1]) }) }; }
    if (m) { const f = files[decodeURIComponent(m[1])]; return f ? { ok: true, status: 200, text: async () => f.body } : { ok: false, status: 404 }; }
    if (/approot\/children/.test(url)) return { ok: true, status: 200, json: async () => ({ value: Object.keys(files).map(n => ({ name: n, size: files[n].body.length, lastModifiedDateTime: files[n].t })).concat([{ name: 'notes.txt', size: 3 }]) }) };
    return { ok: false, status: 404 };
  };
  return { files, log, fetch, set: m => { mode = m; } };
}
const tok = () => Promise.resolve('T0K');

test('enabled only with a real client ID (GUID)', () => {
  assert.deepStrictEqual([undefined, {}, { onedriveClientId: '' }, { onedriveClientId: 'abc' }, { onedriveClientId: ' 1a2b3c4d-1111-2222-3333-444455556666 ' }].map(OD.enabled), [false, false, false, false, true]);
});
test('app-folder URLs, scopes, file names', () => {
  assert.strictEqual(OD.itemUrl('golf-rounds-backup.json'), 'https://graph.microsoft.com/v1.0/me/drive/special/approot:/golf-rounds-backup.json:/content');
  assert.match(OD.listUrl, /\/me\/drive\/special\/approot\/children/);
  assert.deepStrictEqual(OD.SCOPES, ['Files.ReadWrite.AppFolder', 'User.Read']);
  assert.strictEqual(OD.datedName(new Date(2026, 9, 9)), 'golf-rounds-backup-2026-10-09.json');
  assert.deepStrictEqual(['golf-rounds-backup.json', 'golf-rounds-backup-2026-10-09.json', 'x.json', 'golf-rounds-backup-2026.json'].map(OD.isBackupName), [true, true, false, false]);
  const now = new Date('2026-10-09T12:00:00Z');
  assert.deepStrictEqual([null, '2026-10-03T12:00:00Z', '2026-10-02T12:00:00Z'].map(x => OD.needDated(x, now)), [true, false, true]);
});
test('sync uploads latest + weekly dated copy; nothing to do when not pending', async () => {
  const G = fakeGraph(); let s = OD.markDirty(OD.newState());
  s = await OD.sync({ state: s, fetch: G.fetch, getToken: tok, json: '{"a":1}', now: new Date('2026-10-09T12:00:00') });
  assert.deepStrictEqual(Object.keys(G.files).sort(), ['golf-rounds-backup-2026-10-09.json', 'golf-rounds-backup.json']);
  assert.ok(G.log.every(l => l[2] === 'Bearer T0K')); assert.strictEqual(s.pending, false); assert.ok(s.lastOk && s.lastDated);
  const n = G.log.length; await OD.sync({ state: s, fetch: G.fetch, getToken: tok, json: '{}' }); assert.strictEqual(G.log.length, n, 'not pending -> no calls');
  OD.markDirty(s); s = await OD.sync({ state: s, fetch: G.fetch, getToken: tok, json: '{"a":2}', now: new Date('2026-10-12T12:00:00') });
  assert.strictEqual(G.files['golf-rounds-backup.json'].body, '{"a":2}'); assert.strictEqual(Object.keys(G.files).length, 2, 'no 2nd dated copy within a week');
  OD.markDirty(s); s = await OD.sync({ state: s, fetch: G.fetch, getToken: tok, json: '{"a":3}', now: new Date('2026-10-16T12:00:00') });
  assert.ok(G.files['golf-rounds-backup-2026-10-16.json'], 'dated copy after 7 days');
});
test('offline / server busy -> stays queued with retry back-off; 401 or interaction -> needsAuth; recovers', async () => {
  const G = fakeGraph(); let s = OD.markDirty(OD.newState());
  s = await OD.sync({ state: s, fetch: G.fetch, getToken: tok, json: '{}', online: false });
  assert.strictEqual(G.log.length, 0); assert.ok(s.pending && /Offline/.test(s.lastError));
  G.set('offline'); s = await OD.sync({ state: s, fetch: G.fetch, getToken: tok, json: '{}' }); assert.ok(s.pending && /Offline/.test(s.lastError) && !s.needsAuth);
  G.set('503'); s = await OD.sync({ state: s, fetch: G.fetch, getToken: tok, json: '{}' }); assert.ok(s.pending && /503/.test(s.lastError));
  assert.deepStrictEqual([1, 2, 3, 10].map(OD.retryDelay), [15000, 30000, 60000, 600000]);
  G.set('401'); s = await OD.sync({ state: s, fetch: G.fetch, getToken: tok, json: '{}' }); assert.ok(s.pending && s.needsAuth);
  s = await OD.sync({ state: OD.markDirty(OD.newState()), fetch: G.fetch, getToken: () => Promise.reject(Object.assign(new Error('x'), { kind: 'interaction' })), json: '{}' }); assert.ok(s.needsAuth && s.pending);
  G.set('ok'); s = await OD.sync({ state: s, fetch: G.fetch, getToken: tok, json: '{"b":1}' }); assert.ok(!s.pending && !s.needsAuth && !s.lastError && s.attempts === 0);
});
test('list (backups only, latest first, then newest dated) and download', async () => {
  const G = fakeGraph();
  for (const n of ['golf-rounds-backup-2026-09-01.json', 'golf-rounds-backup.json', 'golf-rounds-backup-2026-10-01.json']) await OD.upload(G.fetch, 'T', n, '{"n":"' + n + '"}');
  const L = await OD.list(G.fetch, 'T');
  assert.deepStrictEqual(L.map(f => f.name), ['golf-rounds-backup.json', 'golf-rounds-backup-2026-10-01.json', 'golf-rounds-backup-2026-09-01.json']);
  assert.strictEqual(await OD.download(G.fetch, 'T', 'golf-rounds-backup.json'), '{"n":"golf-rounds-backup.json"}');
});
test('state persists through storage', () => {
  const m = {}, st = { getItem: k => m[k] || null, setItem: (k, v) => { m[k] = v; } };
  assert.deepStrictEqual(OD.loadState(st), OD.newState());
  const s = OD.markDirty(OD.newState(), new Date('2026-10-09T10:00:00Z')); OD.saveState(st, s);
  assert.deepStrictEqual(OD.loadState(st), s);
});
