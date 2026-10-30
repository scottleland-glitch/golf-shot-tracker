// v97 Send round / Add a round: one saved round as a small file or a text code (no accounts, no server).
// Payload: { pinhigh: 'round', v: 1, app, sent, round: <the round exactly as stored / as in the backup file> }.
// Text code: 'PINHIGH1:' + base64url( gzip(JSON) ) – or base64url(JSON) when the phone has no CompressionStream.
// The reader tells the two apart by the gzip magic bytes, so either kind of code reads on any phone that can gunzip.
(function (root) {
  var PREFIX = 'PINHIGH1:', TYPE = 'round', V = 1, LONG = 20000;
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function payload(r, now) { return { pinhigh: TYPE, v: V, app: 'golf-shot-tracker', sent: (now || new Date()).toISOString(), round: clone(r) }; }
  function slug(s) { return String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40); }
  function dayOf(iso) { var d = new Date(iso); if (isNaN(d)) return 'round'; return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function fileName(r) { var c = slug(r.course); return 'Pin-High-Round-' + dayOf(r.date) + (c ? '-' + c : '') + '.json'; }
  function fileText(r, now) { return JSON.stringify(payload(r, now)); }
  // ---- bytes <-> base64url
  function b64u(bytes) { var s = '', k = 0x8000; for (var i = 0; i < bytes.length; i += k) s += String.fromCharCode.apply(null, bytes.subarray(i, i + k)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function unb64u(t) { t = t.replace(/-/g, '+').replace(/_/g, '/'); while (t.length % 4) t += '='; var s = atob(t), b = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return b; }
  function canGzip(o) { return !(o && o.noGzip) && typeof CompressionStream === 'function' && typeof Response === 'function'; }
  function streamBytes(bytes, ts) { return new Response(new Blob([bytes]).stream().pipeThrough(ts)).arrayBuffer().then(function (b) { return new Uint8Array(b); }); }
  function utf8(s) { return new TextEncoder().encode(s); }
  // encode(round) → Promise<'PINHIGH1:…'>; opts.noGzip forces the plain fallback
  function encode(r, opts) {
    var bytes = utf8(fileText(r, opts && opts.now));
    if (!canGzip(opts)) return Promise.resolve(PREFIX + b64u(bytes));
    return streamBytes(bytes, new CompressionStream('gzip')).then(function (z) { return PREFIX + b64u(z.length < bytes.length ? z : bytes); }, function () { return PREFIX + b64u(bytes); });
  }
  function findCode(text) { var m = /PINHIGH1:\s*([A-Za-z0-9_\-]+)/.exec(String(text || '')); return m ? m[1] : null; }
  function decodeCode(code, opts) {
    var b; try { b = unb64u(code); } catch (e) { return Promise.resolve({ error: 'That code is incomplete or damaged – ask for it to be sent again, or send the round as a file.' }); }
    var gz = b.length > 2 && b[0] === 0x1f && b[1] === 0x8b;
    var p = !gz ? Promise.resolve(b) : (typeof DecompressionStream === 'function' && !(opts && opts.noGzip)) ? streamBytes(b, new DecompressionStream('gzip'))
      : Promise.reject(new Error('nogz'));
    return p.then(function (x) { return check(new TextDecoder().decode(x)); }, function (e) {
      return { error: e && e.message === 'nogz' ? 'This phone can’t unpack that code – send the round as a file instead.' : 'That code is incomplete or damaged – ask for it to be sent again, or send the round as a file.' }; });
  }
  // check(text or object) → { round } | { error, backup? }
  function check(data) {
    if (typeof data === 'string') { try { data = JSON.parse(data); } catch (e) { return { error: 'That isn’t a Pin High round (it could not be read).' }; } }
    if (data && !Array.isArray(data) && (data.kind === 'rounds-backup' || (Array.isArray(data.rounds) && !data.pinhigh)) || Array.isArray(data))
      return { backup: true, error: 'That’s a full backup file, not a single round. To bring a whole backup onto this phone use Archive → 📂 Restore from backup.' };
    if (!data || data.pinhigh !== TYPE) return { error: 'That isn’t a Pin High round.' };
    if (data.v !== V) return { error: 'That round was sent from a newer version of Pin High – update the app and try again.' };
    var r = data.round;
    if (!r || typeof r.id !== 'string' || !r.id || !Array.isArray(r.holes) || !r.holes.length || !r.holes.every(function (h) { return h && Array.isArray(h.rows); }))
      return { error: 'That round is damaged (its holes could not be read).' };
    return { round: r, sent: data.sent || '' };
  }
  // read(anything the person picked or pasted) → Promise<{ round } | { error }>
  function read(text, opts) {
    var s = String(text == null ? '' : text).trim();
    if (!s) return Promise.resolve({ error: 'Choose a file or paste a code first.' });
    var code = findCode(s); if (code) return decodeCode(code, opts);
    if (s.charAt(0) === '{' || s.charAt(0) === '[') return Promise.resolve(check(s));
    return Promise.resolve({ error: 'That isn’t a Pin High round code – it should start with PINHIGH1:' });
  }
  function shotsKey(r) { return JSON.stringify((r.holes || []).map(function (h) { return [h.par, (h.rows || []).map(function (x) { return [x.loc || '', String(x.dist == null ? '' : x.dist), x.dir || '', !!x.pen]; })]; })); }
  // already there? same id, or same course + same start time + identical shots
  function findDup(rounds, r) {
    return (rounds || []).filter(function (x) { return x.id === r.id || (String(x.course || '') === String(r.course || '') && String(x.date || '') === String(r.date || '') && shotsKey(x) === shotsKey(r)); })[0] || null;
  }
  // the copy that goes into this phone's history: original id kept, player = this phone's player (none → unnamed = theirs)
  function prepare(r, player) { var o = clone(r); if (player) o.player = player; else delete o.player; return o; }
  var API = { PREFIX: PREFIX, LONG: LONG, payload: payload, fileName: fileName, fileText: fileText, encode: encode, read: read, check: check, findDup: findDup, prepare: prepare, b64u: b64u, unb64u: unb64u };
  if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.SHARE = API;
})(this);
