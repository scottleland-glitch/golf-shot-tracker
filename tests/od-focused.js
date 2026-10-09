// Focused OneDrive test: config.js with a client ID, MSAL stubbed (redirect sign-in simulated), Graph mocked.
const { chromium } = require('playwright-core'); const assert = require('assert'); const { spawn } = require('child_process');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8766/', SHOTS = process.env.SHOTS || '/tmp/shots-od';
const MSAL_STUB = `window.msal = { PublicClientApplication: class {
  constructor(c) { window.__msalCfg = c; } initialize() { return Promise.resolve(); }
  handleRedirectPromise() { if (sessionStorage.getItem('stub.redirect')) { sessionStorage.removeItem('stub.redirect'); localStorage.setItem('stub.acct', '1'); return Promise.resolve({ account: this._a() }); } return Promise.resolve(null); }
  _a() { return { username: 'scott.leland@gmail.com', name: 'Scott', homeAccountId: 'h1' }; }
  getAllAccounts() { return localStorage.getItem('stub.acct') ? [this._a()] : []; } getActiveAccount() { return null; } setActiveAccount() {}
  acquireTokenSilent(r) { window.__scopes = r.scopes; return localStorage.getItem('stub.expired') ? Promise.reject({ errorCode: 'interaction_required' }) : Promise.resolve({ accessToken: 'TOK' }); }
  loginRedirect(r) { window.__loginReq = r; sessionStorage.setItem('stub.redirect', '1'); location.reload(); }
  acquireTokenRedirect(r) { localStorage.removeItem('stub.expired'); sessionStorage.setItem('stub.redirect', '1'); location.reload(); }
  clearCache() { localStorage.removeItem('stub.acct'); return Promise.resolve(); } } };`;
(async () => {
  const srv = process.env.NO_SERVER ? null : spawn('python3', ['-m', 'http.server', '8766', '--bind', '127.0.0.1'], { cwd: '/workspace/golf-app', stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1500));
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'], timeout: 600000 });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  const page = await ctx.newPage(); page.setDefaultTimeout(30000); const errors = []; page.on('pageerror', e => errors.push(String(e))); page.on('dialog', d => d.accept());
  // 1) default config: OneDrive hidden, MSAL not even loaded
  let msalLoads = 0; page.on('request', r => { if (/msal-browser/.test(r.url())) msalLoads++; });
  await ctx.route('**/config.js*', r => r.fulfill({ contentType: 'application/javascript', body: "window.GOLF_CONFIG = { onedriveClientId: '' };" }));
  await page.goto(BASE + '?x=' + Date.now()); await page.waitForSelector('[data-act="history"]');
  assert.strictEqual(await page.locator('#odcard, [data-act="odconnect"]').count(), 0); assert.strictEqual(msalLoads, 0);
  console.log('✓ no client ID: OneDrive features hidden, MSAL not loaded');
  // 2) client ID set
  await ctx.unroute('**/config.js*');
  const files = {}; const calls = [];
  await ctx.route('**/config.js*', r => r.fulfill({ contentType: 'application/javascript', body: "window.GOLF_CONFIG = { onedriveClientId: '11111111-2222-3333-4444-555555555555', onedriveAuthority: 'https://login.microsoftonline.com/consumers' };" }));
  await ctx.route('**/vendor/msal-browser.min.js*', r => r.fulfill({ contentType: 'application/javascript', body: MSAL_STUB }));
  ctx._graph = async r => {
    const q = r.request(), u = q.url(); calls.push([q.method(), u.replace('https://graph.microsoft.com/v1.0', ''), q.headers().authorization]);
    const m = u.match(/approot:\/(.+):\/content/);
    if (m && q.method() === 'PUT') { files[decodeURIComponent(m[1])] = q.postData(); return r.fulfill({ status: 201, contentType: 'application/json', body: '{}' }); }
    if (m) return r.fulfill({ status: 200, contentType: 'application/json', body: files[decodeURIComponent(m[1])] });
    if (/approot\/children/.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ value: Object.keys(files).map(n => ({ name: n, size: files[n].length, lastModifiedDateTime: '2026-10-09T18:00:00Z' })) }) });
    r.fulfill({ status: 404, body: '' });
  };
  await ctx.route('https://graph.microsoft.com/**', r => ctx._graph(r));
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('golfsg.rounds.v1', JSON.stringify([{ v: 3, dv: 2, id: 'r1', date: '2026-10-09T15:00:00.000Z', course: 'Washoe', baseline: 'pga',
    holes: [{ par: 4, finished: true, rows: [{ dist: 400, loc: 'tee', dir: '', pen: false }, { dist: 150, loc: 'fairway', dir: '', pen: false }, { dist: 12, loc: 'green', dir: '', pen: false }, { dist: 2, loc: 'holed', dir: '', pen: false }] },
      { par: 4, finished: false, rows: [{ dist: 380, loc: 'tee', dir: '', pen: false }, { dist: 140, loc: 'fairway', dir: '', pen: false }, { dist: 3, loc: 'holed', dir: '', pen: false }] }].concat(Array.from({ length: 16 }, () => ({ par: 4, finished: false, rows: [{ dist: 400, loc: 'tee', dir: '', pen: false }] }))) }])); localStorage.setItem('golfsg.current.v1', 'r1'); localStorage.setItem('stub.acct', '1'); localStorage.setItem('golfsg.onedrive.v1', JSON.stringify({ pending: true, lastOk: '2026-10-09T19:00:00.000Z', lastDated: '2026-10-09T19:00:00.000Z' })); });
  files['golf-rounds-backup.json'] = JSON.stringify({ app: 'golf-shot-tracker', kind: 'rounds-backup', version: 1, rounds: [] });
  await page.goto(BASE + '?x=' + Date.now()); await page.waitForSelector('#odacct');
  const cfg = await page.evaluate(() => window.__msalCfg);
  assert.deepStrictEqual([cfg.auth.clientId, cfg.auth.authority, cfg.auth.redirectUri, cfg.cache.cacheLocation], ['11111111-2222-3333-4444-555555555555', 'https://login.microsoftonline.com/consumers', BASE.replace(/\?.*/, ''), 'localStorage']);
  // Scott's phone: already connected (uploaded the legacy file), no player name yet -> backups wait for the name
  await page.waitForFunction(() => /player name/.test(document.getElementById('odstat').textContent));
  assert.strictEqual(calls.filter(c => c[0] === 'PUT').length, 0); assert.ok(await page.isVisible('#pname'));
  await page.screenshot({ path: SHOTS + '/44-player-name-needed.png' });
  await page.fill('#pname', 'Scott Leland'); await page.click('[data-act="setname"]');
  await page.waitForFunction(() => /Backed up/.test(document.getElementById('odstat').textContent));
  assert.strictEqual(await page.textContent('#pnameshow'), 'Scott Leland');
  const dated = Object.keys(files).filter(n => /^golf-rounds-scott-leland-\d{4}-\d\d-\d\d\.json$/.test(n));
  assert.ok(files['golf-rounds-scott-leland.json'] && dated.length === 1, Object.keys(files).join());
  assert.strictEqual(JSON.parse(files['golf-rounds-backup.json']).rounds.length, 0, 'legacy file kept untouched'); assert.ok(calls.every(c => c[0] !== 'DELETE'));
  const nb = JSON.parse(files['golf-rounds-scott-leland.json']); assert.strictEqual(nb.player, 'Scott Leland'); assert.strictEqual(nb.rounds[0].player, 'Scott Leland');
  assert.ok(calls.every(c => c[2] === 'Bearer TOK'));
  console.log('✓ connected without a name: waits; name set → golf-rounds-scott-leland.json + dated copy, legacy file kept, rounds stamped with player');
  assert.deepStrictEqual(await page.evaluate(() => window.__scopes), ['Files.ReadWrite.AppFolder', 'User.Read']);
  assert.strictEqual(await page.locator('#bkremind').count(), 0, 'manual-backup reminder hidden while OneDrive is on');
  await page.screenshot({ path: SHOTS + '/40-onedrive-connected.png' });

  // relaunch (iOS kills the app: session cookies + sessionStorage gone, localStorage kept) -> still connected, no Connect button
  const state = await ctx.storageState();
  const ctxR = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, serviceWorkers: 'block', storageState: { cookies: [], origins: state.origins } });
  await ctxR.route('**/vendor/msal-browser.min.js*', r => r.fulfill({ contentType: 'application/javascript', body: MSAL_STUB }));
  await ctxR.route('https://graph.microsoft.com/**', r => ctx._graph(r));
  const pR = await ctxR.newPage(); pR.on('pageerror', e => errors.push('relaunch: ' + e));
  await pR.goto(BASE + '?x=' + Date.now());
  await pR.waitForSelector('#odacct'); assert.strictEqual(await pR.locator('[data-act="odconnect"]').count(), 0);
  assert.match(await pR.textContent('#odacct'), /scott\.leland@gmail\.com/); await pR.waitForTimeout(800); const dbg = await pR.evaluate(() => [!!window.__msalCfg, localStorage.getItem('stub.acct'), localStorage.getItem('golfsg.onedrive.v1')]); assert.doesNotMatch(await pR.textContent('#odstat'), /expired/, JSON.stringify(dbg));
  // if MSAL's own cache were lost, the remembered account shows Reconnect (not a fresh Connect)
  await pR.evaluate(() => localStorage.removeItem('stub.acct')); await pR.reload(); await pR.waitForSelector('[data-act="odreauth"]');
  assert.strictEqual(await pR.locator('[data-act="odconnect"]').count(), 0); await ctxR.close();
  console.log('✓ relaunch (no session cookies) → still "Connected as …", silent token OK; lost MSAL cache → Reconnect, not Connect');
  // 3) finish a hole while offline → queued; back online → uploaded
  await ctx.setOffline(true); await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await page.click('[data-act="resume"]'); await page.waitForSelector('[data-act="finish"]');
  const before = calls.filter(c => c[0] === 'PUT').length;
  await page.click('[data-act="finish"]'); await page.waitForTimeout(2500);
  let st = await page.evaluate(() => window.__golf.odState());
  assert.ok(st.pending, 'queued while offline'); assert.strictEqual(calls.filter(c => c[0] === 'PUT').length, before);
  await page.click('[data-act="home"]'); assert.match(await page.textContent('#odstat'), /Waiting to upload/);
  await page.screenshot({ path: SHOTS + '/41-onedrive-queued.png' });
  await ctx.setOffline(false); await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await page.waitForFunction(() => !window.__golf.odState().pending);
  assert.strictEqual(JSON.parse(files['golf-rounds-scott-leland.json']).rounds[0].holes[1].finished, true);
  console.log('✓ hole finished offline → queued ("Waiting to upload"); back online → uploaded');
  // 4) restore: grouped by player (incl. legacy "Older backup"); load the daughter's rounds
  const emmaRound = { ...nb.rounds[0], id: 'e1', player: 'Emma', course: 'Lakeridge', date: '2026-10-01T15:00:00.000Z' };
  files['golf-rounds-emma.json'] = JSON.stringify({ app: 'golf-shot-tracker', kind: 'rounds-backup', version: 1, player: 'Emma', rounds: [emmaRound] });
  files['golf-rounds-emma-2026-10-01.json'] = files['golf-rounds-emma.json'];
  await page.click('[data-act="odrestore"]'); await page.waitForSelector('.odfile');
  const groups = await page.$$eval('.odgroup', gs => gs.map(g => [g.querySelector('h3').textContent, [...g.querySelectorAll('.odfile')].map(b => b.getAttribute('data-v'))]));
  assert.deepStrictEqual(groups.map(g => g[0]), ['👤 Emma', '👤 Scott Leland (you)', '🗂 Older backup']);
  assert.deepStrictEqual(groups[0][1], ['golf-rounds-emma.json', 'golf-rounds-emma-2026-10-01.json']); assert.deepStrictEqual(groups[2][1], ['golf-rounds-backup.json']);
  await page.screenshot({ path: SHOTS + '/42-onedrive-restore-list.png' });
  await page.click('.odfile[data-v="golf-rounds-emma.json"]'); await page.waitForSelector('#notice');
  assert.strictEqual(await page.textContent('#notice'), '✓ Restored from backup: 1 added. You now have 2 rounds.');
  await page.click('[data-act="history"]'); await page.waitForSelector('#playerchips');
  assert.deepStrictEqual(await page.$$eval('#playerchips button', bs => bs.map(b => b.textContent)), ['All players', 'Emma (1)', 'Scott Leland (1)']);
  assert.deepStrictEqual(await page.$$eval('#histlist .hplayer', x => x.map(e => e.textContent)), ['👤 Scott Leland', '👤 Emma']);
  await page.screenshot({ path: SHOTS + '/45-history-players.png' });
  await page.click('#playerchips [data-v="Emma"]'); assert.deepStrictEqual(await page.$$eval('#histlist .hrow', r => r.map(x => x.getAttribute('data-id'))), ['e1']);
  await page.click('#playerchips [data-v=""]'); assert.strictEqual(await page.locator('#histlist .hrow').count(), 2);
  const emmaKept = await page.evaluate(() => window.__golf.rounds().find(r => r.id === 'e1').player); assert.strictEqual(emmaKept, 'Emma');
  console.log("✓ Restore lists files by player (Emma, Scott Leland (you), Older backup); Emma's rounds merged, keep her name; History shows player + filter");
  // name change asks for confirmation (dialog auto-accepted), relabels own rounds only
  await page.click('[data-act="home"]'); let asked = null; page.once('dialog', d => { asked = d.message(); });
  await page.click('[data-act="editname"]'); await page.fill('#pname', 'Scott L'); await page.click('[data-act="setname"]');
  assert.match(asked || '', /Change player name from "Scott Leland" to "Scott L"/);
  const pl = await page.evaluate(() => window.__golf.rounds().map(r => r.id + ':' + r.player).sort()); assert.deepStrictEqual(pl, ['e1:Emma', 'r1:Scott L']);
  await page.waitForFunction(() => /Backed up/.test(document.getElementById('odstat').textContent) && !window.__golf.odState().pending);
  assert.ok(files['golf-rounds-scott-l.json'] && files['golf-rounds-scott-leland.json']);
  console.log('✓ name change confirmed, own rounds relabelled, new file golf-rounds-scott-l.json, old files kept');
  // Emma's rounds on Scott's phone are NOT written into Scott's file
  const sl = JSON.parse(files['golf-rounds-scott-l.json']); assert.deepStrictEqual(sl.rounds.map(r => r.id), ['r1']); assert.strictEqual(sl.player, 'Scott L');
  // second phone (Emma) on the same Microsoft account: writes only golf-rounds-emma*.json
  const emmaBefore = files['golf-rounds-emma.json'], scottSnap = JSON.stringify([files['golf-rounds-scott-l.json'], files['golf-rounds-scott-leland.json'], files['golf-rounds-backup.json']]);
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  await ctx2.route('**/vendor/msal-browser.min.js*', r => r.fulfill({ contentType: 'application/javascript', body: MSAL_STUB }));
  await ctx2.route('https://graph.microsoft.com/**', r => ctx._graph(r));
  const p2 = await ctx2.newPage(); p2.on('pageerror', e => errors.push('phone2: ' + e)); p2.on('dialog', d => d.accept());
  await p2.goto(BASE + '?x=' + Date.now());
  await p2.evaluate(e => { localStorage.setItem('stub.acct', '1'); localStorage.setItem('golfsg.player.v1', 'Emma'); localStorage.setItem('golfsg.rounds.v1', JSON.stringify([e, { ...e, id: 'e2', player: 'Emma', date: '2026-10-08T15:00:00.000Z' }])); }, emmaRound);
  await p2.reload(); await p2.waitForSelector('#odacct'); await p2.click('[data-act="odsync"]');
  await p2.waitForFunction(() => !window.__golf.odState().pending && /Backed up/.test(document.getElementById('odstat').textContent));
  assert.notStrictEqual(files['golf-rounds-emma.json'], emmaBefore); assert.deepStrictEqual(JSON.parse(files['golf-rounds-emma.json']).rounds.map(r => r.id).sort(), ['e1', 'e2']);
  assert.strictEqual(JSON.stringify([files['golf-rounds-scott-l.json'], files['golf-rounds-scott-leland.json'], files['golf-rounds-backup.json']]), scottSnap, "Emma's phone never touches Scott's files");
  await ctx2.close();
  console.log("✓ 2nd phone (Emma, same account) writes only golf-rounds-emma.json; Scott's files untouched; Scott's file excludes Emma's rounds");
  // 5) expired sign-in → Reconnect
  await page.evaluate(() => localStorage.setItem('stub.expired', '1')); await page.click('[data-act="odsync"]');
  await page.waitForSelector('[data-act="odreauth"]'); assert.match(await page.textContent('#odstat'), /Sign-in expired/);
  await page.click('[data-act="odreauth"]'); await page.waitForFunction(() => /Backed up/.test((document.getElementById('odstat') || {}).textContent || ''));
  console.log('✓ expired sign-in → Reconnect (redirect) → backs up again');
  // 6) disconnect
  await page.click('[data-act="oddisconnect"]'); await page.waitForSelector('[data-act="odconnect"]');
  assert.strictEqual(await page.evaluate(() => Object.keys(localStorage).filter(k => k === 'stub.acct').length), 0);
  // first connect on a phone with no name asks for the name before signing in
  await page.evaluate(() => localStorage.removeItem('golfsg.player.v1')); await page.reload(); await page.waitForSelector('[data-act="odconnect"]');
  await page.screenshot({ path: SHOTS + '/39-onedrive-connect.png' });
  await page.click('[data-act="odconnect"]'); await page.waitForSelector('#needname'); assert.match(await page.textContent('#needname'), /player name before connecting/);
  await page.fill('#pname', 'Emma'); await page.click('[data-act="setname"]'); await page.click('[data-act="odconnect"]');
  await page.waitForSelector('#odacct'); assert.match(await page.textContent('#odacct'), /Connected as scott\.leland@gmail\.com/);
  await page.screenshot({ path: SHOTS + '/40-onedrive-connected.png' });
  console.log('✓ first Connect without a name → asks for the name, then redirect sign-in');
  console.log('✓ Disconnect → back to Connect OneDrive');
  assert.deepStrictEqual(errors, []); console.log('OD FOCUSED OK');
  await browser.close(); if (srv) srv.kill();
})().catch(e => { console.error('FAIL', e.stack); process.exit(1); });
