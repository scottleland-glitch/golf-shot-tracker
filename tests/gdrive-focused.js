// v98 Google Drive backup + restore, against an in-memory fake Drive (no real Google calls).
// Covers: sign-in redirect hash parsing + state check, Pin High Backups/<Player> folders, upload then update-in-place,
// weekly copies, two phones on one Google account writing the same player file (both phones' rounds survive),
// each round going to its own round.player folder, expired token (quiet button, no auto-redirect, upload on next sign-in),
// per-player restore, disconnect.
const { chromium } = require('playwright-core'); const assert = require('assert'); const { spawn } = require('child_process');
const GD = require('../gdrive.js'), SG = require('../sg.js'), ARC = require('./fixtures/arcade-78.js');
const OUT = '/workspace/golf-app/screenshots/', PORT = 8835, BASE = 'http://127.0.0.1:' + PORT + '/';
const CID = '147433941741-g2jf349vhekia26agahu2b2j3ajd3rf1.apps.googleusercontent.com';

const FakeDrive = require('./fixtures/fake-drive.js');
const rnd = (id, player, date, extra) => { const r = Object.assign(ARC.round(), { id, date: date || '2026-10-2' + (id.length % 8) + 'T16:00:00.000Z' }, player ? { player } : {}, extra || {}); if (!player) delete r.player; return r; };
const ids = b => b.rounds.map(r => r.id).sort();

(async () => {
  // ---------- 1. sign-in redirect helpers ----------
  assert.ok(GD.enabled({ googleClientId: CID }) && !GD.enabled({ googleClientId: '' }) && !GD.enabled({}));
  assert.strictEqual(GD.redirectUri({ origin: 'https://scottleland-glitch.github.io', pathname: '/golf-shot-tracker/' }), 'https://scottleland-glitch.github.io/golf-shot-tracker/');
  assert.strictEqual(GD.redirectUri({ origin: 'https://scottleland-glitch.github.io', pathname: '/golf-shot-tracker/index.html' }), 'https://scottleland-glitch.github.io/golf-shot-tracker/');
  assert.strictEqual(GD.redirectUri({ origin: 'http://127.0.0.1:8835', pathname: '/' }), 'http://127.0.0.1:8835/');
  const au = new URL(GD.authUrl(CID, 'https://scottleland-glitch.github.io/golf-shot-tracker/', 'abc123'));
  assert.strictEqual(au.origin + au.pathname, 'https://accounts.google.com/o/oauth2/v2/auth');
  assert.deepStrictEqual(['client_id', 'redirect_uri', 'response_type', 'scope', 'prompt', 'state'].map(k => au.searchParams.get(k)),
    [CID, 'https://scottleland-glitch.github.io/golf-shot-tracker/', 'token', 'https://www.googleapis.com/auth/drive.file', 'select_account', 'abc123']);
  assert.ok(/^[0-9a-f]{32}$/.test(GD.newAuthState()) && GD.newAuthState() !== GD.newAuthState());
  assert.strictEqual(GD.parseHash('#foo=1'), null); assert.strictEqual(GD.parseHash(''), null); assert.strictEqual(GD.parseHash('#code=x&state=y'), null, 'OneDrive returns are left alone');
  const h = GD.parseHash('#state=s1&access_token=ya29.a%2Bb&token_type=Bearer&expires_in=3599&scope=https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fdrive.file');
  assert.deepStrictEqual([h.access_token, h.expires_in, h.state], ['ya29.a+b', '3599', 's1']);
  const ok = GD.checkReturn(h, ['s1'], 1000); assert.deepStrictEqual(ok.token, { accessToken: 'ya29.a+b', expiresAt: 1000 + 3599000 });
  assert.match(GD.checkReturn(h, ['other'], 1).error, /could not be checked/, 'wrong state is refused');
  assert.match(GD.checkReturn(h, [], 1).error, /could not be checked/, 'no saved state is refused');
  assert.match(GD.checkReturn(GD.parseHash('#error=access_denied&state=s1'), ['s1']).error, /cancelled/);
  assert.match(GD.checkReturn(GD.parseHash('#access_token=t&state=s1&scope=email'), ['s1']).error, /Drive access was not allowed/);
  assert.ok(GD.tokenValid({ accessToken: 't', expiresAt: 200000 }, 100000) && !GD.tokenValid({ accessToken: 't', expiresAt: 150000 }, 100000) && !GD.tokenValid(null));
  console.log('  redirect: auth URL, hash parsing, state check, cancel/scope errors, token expiry margin');

  // ---------- 2. sync: folders, upload, update in place, weekly copy, per-round player ----------
  const D = FakeDrive(); D.tokens.add('t1');
  const day1 = new Date('2026-10-30T15:00:00Z');
  const s1 = GD.markDirty(GD.newState(), day1);
  const bk = (rs, p, extra) => SG.makeBackup(rs, day1, p, extra && extra.courses, extra && extra.bag, extra && extra.wedges);
  const bag = { clubs: [{ id: 'dr', name: 'Driver' }], updated: '2026-10-29T00:00:00Z' };
  await GD.sync({ state: s1, fetch: D.fetch, token: 't1', now: day1, files: [{ player: 'Scott', backup: bk([rnd('s1', 'Scott'), rnd('s2', 'Scott')], 'Scott', { bag }) }, { player: 'Quincy', backup: bk([rnd('q1', 'Quincy')], 'Quincy') }] });
  assert.deepStrictEqual([s1.pending, s1.needsAuth, s1.lastError], [false, false, null]);
  assert.strictEqual(D.find('Pin High Backups').length, 1); assert.ok(D.find('Pin High Backups')[0].parents.includes('root'));
  assert.deepStrictEqual(Object.values(D.files).filter(f => f.mimeType === GD.FOLDER).map(f => f.name).sort(), ['Pin High Backups', 'Quincy', 'Scott']);
  assert.deepStrictEqual(ids(D.json('golf-rounds-scott.json', 'Scott')), ['s1', 's2']); assert.deepStrictEqual(D.json('golf-rounds-scott.json', 'Scott').bag.clubs[0].name, 'Driver');
  assert.deepStrictEqual(ids(D.json('golf-rounds-quincy.json', 'Quincy')), ['q1']); assert.ok(!D.json('golf-rounds-quincy.json', 'Quincy').bag, 'my bag stays in my own file');
  assert.strictEqual(D.find('golf-rounds-scott-' + GD.day(day1) + '.json', 'Scott').length, 1, 'weekly dated copy');
  const sid = D.find('golf-rounds-scott.json')[0].id, nFiles = Object.keys(D.files).length;
  // update in place: same file id, no duplicates, no new weekly copy within 7 days
  GD.markDirty(s1); const day2 = new Date('2026-11-02T15:00:00Z'), s3 = rnd('s3', 'Scott');
  await GD.sync({ state: s1, fetch: D.fetch, token: 't1', now: day2, files: [{ player: 'Scott', backup: bk([rnd('s1', 'Scott'), rnd('s2', 'Scott'), s3], 'Scott') }] });
  assert.strictEqual(D.find('golf-rounds-scott.json')[0].id, sid, 'updated in place'); assert.strictEqual(Object.keys(D.files).length, nFiles, 'no new files');
  assert.deepStrictEqual(ids(D.json('golf-rounds-scott.json', 'Scott')), ['s1', 's2', 's3']);
  assert.ok(D.log.some(l => /^PATCH \/upload\/drive\/v3\/files\/f\d+\?media$/.test(l)));
  const day9 = new Date('2026-11-07T15:00:00Z'); GD.markDirty(s1);
  await GD.sync({ state: s1, fetch: D.fetch, token: 't1', now: day9, files: [{ player: 'Scott', backup: bk([s3], 'Scott') }] });
  assert.strictEqual(D.find('golf-rounds-scott-' + GD.day(day9) + '.json', 'Scott').length, 1, 'next weekly copy after 7 days');
  console.log('  sync: Pin High Backups/Scott + /Quincy folders, multipart upload, PATCH in place (same id), weekly copies');

  // ---------- 3. two phones, one Google account, same player folder ----------
  // Scott's phone keeps score for Quincy (q1 already up); Quincy's own phone has q2 and an older copy of q1 – nothing is lost
  const q1old = rnd('q1', 'Quincy', null, { updated: '2026-10-01T00:00:00Z' }), q1new = rnd('q1', 'Quincy', null, { updated: '2026-10-30T10:00:00Z', notes: 'edited on Scott’s phone' });
  GD.markDirty(s1); await GD.sync({ state: s1, fetch: D.fetch, token: 't1', now: day9, files: [{ player: 'Quincy', backup: bk([q1new], 'Quincy') }] });
  const phoneB = GD.markDirty(GD.newState()); // Quincy's phone, same Google account → same token holder, its own state (no cached ids)
  await GD.sync({ state: phoneB, fetch: D.fetch, token: 't1', now: day9, files: [{ player: 'Quincy', backup: bk([q1old, rnd('q2', 'Quincy')], 'Quincy', { bag: { clubs: [{ id: '7i' }], updated: '2026-10-30T00:00:00Z' } }) }] });
  assert.strictEqual(D.find('Quincy').length, 1, 'phone B found the folder, did not make a second one'); assert.strictEqual(D.find('golf-rounds-quincy.json').length, 1);
  let Q = D.json('golf-rounds-quincy.json', 'Quincy');
  assert.deepStrictEqual(ids(Q), ['q1', 'q2'], 'both phones’ rounds survive'); assert.strictEqual(Q.rounds.find(r => r.id === 'q1').notes, 'edited on Scott’s phone', 'newer copy of the same round wins');
  assert.strictEqual(Q.bag.clubs[0].id, '7i');
  GD.markDirty(s1); await GD.sync({ state: s1, fetch: D.fetch, token: 't1', now: day9, files: [{ player: 'Quincy', backup: bk([q1new, rnd('q3', 'Quincy')], 'Quincy') }] });
  Q = D.json('golf-rounds-quincy.json', 'Quincy'); assert.deepStrictEqual(ids(Q), ['q1', 'q2', 'q3'], 'phone A again: q2 from phone B kept'); assert.strictEqual(Q.bag.clubs[0].id, '7i', 'Quincy’s bag kept');
  // merge rules on their own
  const M = GD.mergeBackup({ rounds: [rnd('a', 0, 0, { updated: '2026-10-05' }), rnd('b')], courses: [{ id: 'c1', name: 'Old', updated: '2026-01-01' }] }, { rounds: [rnd('a', 0, 0, { updated: '2026-10-04', notes: 'local older' }), rnd('c')], courses: [{ id: 'c1', name: 'New', updated: '2026-02-01' }, { id: 'c2' }] });
  assert.deepStrictEqual([M.rounds.map(r => r.id), M.rounds[0].notes, M.count, M.courses.map(c => c.name || c.id)], [['a', 'c', 'b'], undefined, 3, ['New', 'c2']]);
  assert.strictEqual(GD.mergeBackup(null, { rounds: [rnd('x')] }).rounds.length, 1, 'no file yet'); assert.strictEqual(GD.mergeBackup({ junk: 1 }, { rounds: [] }).rounds.length, 0);
  console.log('  two phones → same Quincy file: q1 (newer wins) + q2 + q3 all kept, one folder, one file');

  // ---------- 4. expired / missing token, 401, offline, deleted folder ----------
  const s4 = GD.markDirty(GD.newState()); await GD.sync({ state: s4, fetch: D.fetch, token: null, files: [{ player: 'Scott', backup: bk([], 'Scott') }] });
  assert.deepStrictEqual([s4.pending, s4.needsAuth], [true, true], 'no token: waits, nothing uploaded');
  const n4 = D.log.length; await GD.sync({ state: s4, fetch: D.fetch, token: 'expired', files: [{ player: 'Scott', backup: bk([], 'Scott') }] });
  assert.deepStrictEqual([s4.pending, s4.needsAuth, s4.lastError], [true, true, null], '401 → needs sign-in, still pending'); assert.ok(D.log.length > n4);
  await GD.sync({ state: s4, fetch: D.fetch, token: 't1', online: false, files: [{ player: 'Scott', backup: bk([], 'Scott') }] }); assert.ok(s4.pending && /Offline/.test(s4.lastError));
  await GD.sync({ state: s4, fetch: D.fetch, token: 't1', now: day9, files: [{ player: 'Scott', backup: bk([s3], 'Scott') }] }); assert.deepStrictEqual([s4.pending, s4.needsAuth], [false, false], 'next sign-in uploads');
  const scottFolder = D.find('Scott')[0].id; delete D.files[scottFolder]; Object.values(D.files).forEach(f => { if (f.parents.includes(scottFolder)) delete D.files[f.id]; });
  GD.markDirty(s1); await GD.sync({ state: s1, fetch: D.fetch, token: 't1', now: day9, files: [{ player: 'Scott', backup: bk([s3], 'Scott') }] });
  assert.ok(!s1.pending && D.find('Scott').length === 1 && D.find('golf-rounds-scott.json').length === 1, 'folder deleted in Drive → made again');
  assert.deepStrictEqual((await GD.listPlayers(D.fetch, 't1')).map(p => p.name), ['Quincy', 'Scott']);
  const qf = await GD.listFiles(D.fetch, 't1', D.find('Quincy')[0].id); assert.deepStrictEqual(qf.map(f => f.date), [null, GD.day(day9), GD.day(day1)], 'latest first, then weekly copies newest first');
  console.log('  no token / 401 → waits + needs sign-in; offline waits; deleted folder re-made; restore lists players + files');

  // ---------- 5. in the app ----------
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: '/workspace/golf-app', stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1500)); const errors = [];
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const G = FakeDrive(); let tokN = 0; const authUrls = [];
  const phone = async (player, rounds) => {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
    await ctx.route(/^https:\/\/(www\.googleapis\.com|oauth2\.googleapis\.com)\//, route => { const q = route.request();
      const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS' };
      if (q.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      const r = G.handle(q.method(), q.url(), q.headers().authorization, q.postData()); route.fulfill({ status: r.status, headers: cors, contentType: 'application/json', body: r.body }); });
    await ctx.route(/^https:\/\/accounts\.google\.com\//, route => { authUrls.push(route.request().url()); const tok = 'tok-' + (++tokN); G.tokens.add(tok);
      route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Google</title><script>var u=new URL(location.href);location.replace(u.searchParams.get("redirect_uri")+"#state="+encodeURIComponent(u.searchParams.get("state"))+"&access_token=' + tok + '&token_type=Bearer&expires_in=3599&scope="+encodeURIComponent(u.searchParams.get("scope")));</script>' }); });
    const page = await ctx.newPage(); page.setDefaultTimeout(30000); page.on('pageerror', e => errors.push(player + ': ' + e)); page.on('dialog', d => d.accept());
    await page.goto(BASE); await page.evaluate(([p, rs]) => { localStorage.clear(); localStorage.setItem('golfsg.player.v1', p); localStorage.setItem('golfsg.nameasked.v1', '1'); localStorage.setItem('golfsg.rounds.v1', JSON.stringify(rs)); }, [player, rounds]);
    await page.reload(); await page.waitForSelector('#app > *'); return page;
  };
  const toArchive = async p => { await p.click('#archivepill'); await p.waitForSelector('.archivepage'); };
  const shot = async (p, name, sel) => { await p.waitForFunction(() => !document.querySelector('#toast.show')); await p.waitForTimeout(300); await p.evaluate(s => { const e = document.querySelector(s); if (e) e.scrollIntoView({ block: 'center' }); }, sel); await p.waitForTimeout(400); await p.screenshot({ path: OUT + name }); };
  const st = p => p.evaluate(() => JSON.parse(localStorage.getItem('golfsg.gdrive.v1') || 'null'));
  const waitOk = (p, since) => p.waitForFunction(s => { const x = JSON.parse(localStorage.getItem('golfsg.gdrive.v1') || 'null'); return x && !x.pending && x.lastOk && x.lastOk > s; }, since || '');

  // Scott's phone: 2 of his rounds + 1 he scored for Quincy
  const A = await phone('Scott', [rnd('s1', 'Scott'), rnd('s2'), rnd('q1', 'Quincy')]);
  assert.strictEqual(await A.$('#gdsignin'), null); await toArchive(A);
  assert.ok(await A.isVisible('#gdconnect')); assert.ok(await A.$eval('#gdcard', e => e.compareDocumentPosition(document.getElementById('odcard') || document.body) & 4 || !document.getElementById('odcard')), 'Google card comes first');
  await shot(A, 'gdrive-archive-signed-out.png', '#gdcard');
  await A.click('#gdconnect'); await A.waitForURL(u => !String(u).includes('#') && String(u).startsWith(BASE)); await A.waitForSelector('#gdcard #gdstat'); await waitOk(A);
  const AU = new URL(authUrls[0]);
  assert.deepStrictEqual(['client_id', 'redirect_uri', 'response_type', 'scope', 'prompt'].map(k => AU.searchParams.get(k)), [CID, BASE, 'token', GD.SCOPE, 'select_account']);
  assert.strictEqual(await A.evaluate(() => location.hash), '', 'token wiped from the address bar'); assert.ok(await A.$('.archivepage'), 'back on Archive');
  assert.strictEqual(await A.evaluate(() => localStorage.getItem('golfsg.gdrive.authstate.v1')), null);
  assert.deepStrictEqual(ids(G.json('golf-rounds-scott.json', 'Scott')), ['s1', 's2'], 'unnamed round s2 goes to the phone’s player');
  assert.deepStrictEqual(ids(G.json('golf-rounds-quincy.json', 'Quincy')), ['q1'], 'Quincy’s round goes to Quincy’s folder');
  await A.waitForFunction(() => /scott\.family@gmail\.com/.test((document.getElementById('gdacct') || {}).textContent || ''));
  assert.match(await A.textContent('#gdstat'), /Last backed up today/); assert.strictEqual(await A.$('#bkremind'), null, 'no backup nag once connected');
  await shot(A, 'gdrive-archive-connected.png', '#gdcard');
  console.log('  app: connect → Google → back on Archive, hash wiped, Scott + Quincy files uploaded');

  // Quincy's phone, same Google account: q2 + her copy of q1 → both phones' rounds in Quincy's file
  const B = await phone('Quincy', [rnd('q2'), rnd('q1', 'Quincy', null, { updated: '2026-01-01T00:00:00Z' })]); await toArchive(B);
  await B.click('#gdconnect'); await B.waitForSelector('#gdcard #gdstat'); await waitOk(B);
  assert.deepStrictEqual(ids(G.json('golf-rounds-quincy.json', 'Quincy')), ['q1', 'q2']); assert.strictEqual(G.find('Quincy').length, 1);
  // Scott keeps another round for Quincy and backs up again → q2 from Quincy's phone survives
  const t0 = (await st(A)).lastOk;
  await A.evaluate(() => { const L = JSON.parse(localStorage.getItem('golfsg.rounds.v1')); localStorage.setItem('golfsg.rounds.v1', JSON.stringify(L)); });
  await A.evaluate(r => { const L = JSON.parse(localStorage.getItem('golfsg.rounds.v1')); L.push(r); localStorage.setItem('golfsg.rounds.v1', JSON.stringify(L)); }, rnd('q3', 'Quincy'));
  await A.reload(); await toArchive(A); await waitOk(A, t0); // app open = back up
  assert.deepStrictEqual(ids(G.json('golf-rounds-quincy.json', 'Quincy')), ['q1', 'q2', 'q3'], 'two phones, same folder: all rounds survive');
  assert.deepStrictEqual(ids(G.json('golf-rounds-scott.json', 'Scott')), ['s1', 's2']); assert.strictEqual(G.find('golf-rounds-scott.json').length, 1, 'updated in place');
  const t1 = (await st(A)).lastOk; await A.click('#gdsync'); await waitOk(A, t1); assert.strictEqual(G.find('golf-rounds-quincy.json').length, 1);
  console.log('  app: two phones, one account – Quincy file has q1 + q2 + q3; Back up now works');

  // expired token: quiet button in Archive only, never a redirect; next sign-in uploads straight away
  await A.evaluate(() => { const t = JSON.parse(localStorage.getItem('golfsg.gdrive.token.v1')); t.expiresAt = Date.now() - 1000; localStorage.setItem('golfsg.gdrive.token.v1', JSON.stringify(t)); });
  const nAuth = authUrls.length; await A.goto(BASE); await A.waitForSelector('#app > *'); await A.waitForTimeout(3500);
  assert.strictEqual(authUrls.length, nAuth, 'no automatic redirect'); assert.ok(A.url().startsWith(BASE));
  assert.ok(!/Google/.test(await A.textContent('#app')), 'nothing about Google on Home');
  let S = await st(A); assert.deepStrictEqual([S.pending, S.needsAuth, S.connected], [true, true, true], 'app open marks a backup that waits');
  await toArchive(A); assert.ok(await A.isVisible('#gdsignin')); assert.match(await A.textContent('#gdsignin'), /^Sign in to Google to back up$/); assert.match(await A.textContent('#gdstat'), /waiting/);
  await A.click('#gdsignin'); await A.waitForSelector('#gdcard #gdstat'); await waitOk(A, S.lastOk); assert.strictEqual(await A.$('#gdsignin'), null);
  assert.strictEqual(authUrls.length, nAuth + 1); assert.ok(new URL(authUrls[nAuth]).searchParams.get('login_hint') === 'scott.family@gmail.com');
  console.log('  app: expired → quiet “Sign in to Google to back up” in Archive only, no redirect; sign-in uploads the waiting backup');

  // a forged / stale return is refused
  await A.goto(BASE + '?f=1#state=forged&access_token=evil&expires_in=3600'); await A.waitForSelector('.archivepage');
  assert.strictEqual(await A.evaluate(() => location.hash), ''); assert.match(await A.textContent('#notice'), /could not be checked/);
  assert.notStrictEqual(JSON.parse(await A.evaluate(() => localStorage.getItem('golfsg.gdrive.token.v1'))).accessToken, 'evil');

  // restore on a new phone: only the chosen player's rounds
  const C = await phone('Scott', [rnd('s1', 'Scott')]); await toArchive(C); await C.click('#gdconnect'); await C.waitForSelector('#gdcard #gdstat'); await waitOk(C);
  await C.click('#gdrestore'); await C.waitForSelector('#gdrsheet [data-act="gdrplayer"]');
  assert.deepStrictEqual(await C.$$eval('#gdrsheet [data-act="gdrplayer"]', L => L.map(e => e.getAttribute('data-name'))), ['Quincy', 'Scott']);
  await shot(C, 'gdrive-restore-sheet.png', '#gdrsheet');
  await C.click('#gdrsheet [data-act="gdrplayer"][data-name="Quincy"]'); await C.waitForSelector('#gdrsheet [data-act="gdrfile"]');
  assert.match(await C.textContent('#gdrsheet [data-act="gdrfile"]'), /Latest backup/); assert.ok((await C.$$('#gdrsheet [data-act="gdrfile"]')).length >= 2, 'latest + weekly');
  await C.click('#gdrsheet [data-act="gdrfile"]'); await C.waitForSelector('#rplist');
  assert.deepStrictEqual((await C.$$eval('.rprow', L => L.map(e => e.getAttribute('data-id')))).sort(), ['q1', 'q2', 'q3'], 'only Quincy’s rounds');
  await C.click('#rpall'); await C.click('#rpgo'); await C.waitForSelector('.archivepage');
  const CR = await C.evaluate(() => JSON.parse(localStorage.getItem('golfsg.rounds.v1')));
  assert.deepStrictEqual(CR.map(r => r.id).sort(), ['q1', 'q2', 'q3', 's1']); assert.ok(CR.filter(r => r.id[0] === 'q').every(r => r.player === 'Quincy'));
  console.log('  app: restore sheet → Quincy → latest → only q1–q3 offered and added (labelled Quincy)');

  // disconnect
  const tokC = JSON.parse(await C.evaluate(() => localStorage.getItem('golfsg.gdrive.token.v1'))).accessToken;
  await C.click('#gddisc'); await C.waitForSelector('#gdconnect'); await C.waitForTimeout(300);
  assert.strictEqual(await C.evaluate(() => localStorage.getItem('golfsg.gdrive.token.v1')), null); assert.ok(!(await st(C)).connected); assert.ok(G.revoked.includes(tokC));
  assert.strictEqual(G.find('golf-rounds-quincy.json').length, 1, 'backups stay in Drive');
  console.log('  app: disconnect clears sign-in, revokes the token, leaves the files');

  assert.deepStrictEqual(errors, []); await b.close(); srv.kill(); console.log('gdrive-focused: all passed');
})().catch(e => { console.error(e); process.exit(1); });
