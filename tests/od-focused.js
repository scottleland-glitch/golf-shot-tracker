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
  await page.goto(BASE + '?x=' + Date.now()); await page.waitForSelector('[data-act="history"]');
  assert.strictEqual(await page.locator('#odcard, [data-act="odconnect"]').count(), 0); assert.strictEqual(msalLoads, 0);
  console.log('✓ no client ID: OneDrive features hidden, MSAL not loaded');
  // 2) client ID set
  const files = {}; const calls = [];
  await ctx.route('**/config.js*', r => r.fulfill({ contentType: 'application/javascript', body: "window.GOLF_CONFIG = { onedriveClientId: '11111111-2222-3333-4444-555555555555', onedriveAuthority: 'https://login.microsoftonline.com/consumers' };" }));
  await ctx.route('**/vendor/msal-browser.min.js*', r => r.fulfill({ contentType: 'application/javascript', body: MSAL_STUB }));
  await ctx.route('https://graph.microsoft.com/**', async r => {
    const q = r.request(), u = q.url(); calls.push([q.method(), u.replace('https://graph.microsoft.com/v1.0', ''), q.headers().authorization]);
    const m = u.match(/approot:\/(.+):\/content/);
    if (m && q.method() === 'PUT') { files[decodeURIComponent(m[1])] = q.postData(); return r.fulfill({ status: 201, contentType: 'application/json', body: '{}' }); }
    if (m) return r.fulfill({ status: 200, contentType: 'application/json', body: files[decodeURIComponent(m[1])] });
    if (/approot\/children/.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ value: Object.keys(files).map(n => ({ name: n, size: files[n].length, lastModifiedDateTime: '2026-10-09T18:00:00Z' })) }) });
    r.fulfill({ status: 404, body: '' });
  });
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('golfsg.rounds.v1', JSON.stringify([{ v: 3, dv: 2, id: 'r1', date: '2026-10-09T15:00:00.000Z', course: 'Washoe', baseline: 'pga',
    holes: [{ par: 4, finished: true, rows: [{ dist: 400, loc: 'tee', dir: '', pen: false }, { dist: 150, loc: 'fairway', dir: '', pen: false }, { dist: 12, loc: 'green', dir: '', pen: false }, { dist: 2, loc: 'holed', dir: '', pen: false }] },
      { par: 4, finished: false, rows: [{ dist: 380, loc: 'tee', dir: '', pen: false }, { dist: 140, loc: 'fairway', dir: '', pen: false }, { dist: 3, loc: 'holed', dir: '', pen: false }] }].concat(Array.from({ length: 16 }, () => ({ par: 4, finished: false, rows: [{ dist: 400, loc: 'tee', dir: '', pen: false }] }))) }])); localStorage.setItem('golfsg.current.v1', 'r1'); });
  await page.goto(BASE + '?x=' + Date.now()); await page.waitForSelector('[data-act="odconnect"]');
  const cfg = await page.evaluate(() => window.__msalCfg);
  assert.deepStrictEqual([cfg.auth.clientId, cfg.auth.authority, cfg.auth.redirectUri, cfg.cache.cacheLocation], ['11111111-2222-3333-4444-555555555555', 'https://login.microsoftonline.com/consumers', BASE.replace(/\?.*/, ''), 'localStorage']);
  await page.screenshot({ path: SHOTS + '/39-onedrive-connect.png' });
  await page.click('[data-act="odconnect"]'); // redirect sign-in (stub reloads the page as the real redirect would)
  await page.waitForSelector('#odacct'); assert.match(await page.textContent('#odacct'), /Connected as scott\.leland@gmail\.com/);
  await page.waitForFunction(() => /Backed up/.test(document.getElementById('odstat').textContent));
  assert.ok(files['golf-rounds-backup.json'] && Object.keys(files).some(n => /^golf-rounds-backup-\d{4}-\d\d-\d\d\.json$/.test(n)), Object.keys(files).join());
  assert.strictEqual(JSON.parse(files['golf-rounds-backup.json']).rounds.length, 1); assert.ok(calls.every(c => c[2] === 'Bearer TOK'));
  assert.deepStrictEqual(await page.evaluate(() => window.__scopes), ['Files.ReadWrite.AppFolder', 'User.Read']);
  assert.strictEqual(await page.locator('#bkremind').count(), 0, 'manual-backup reminder hidden while OneDrive is on');
  await page.screenshot({ path: SHOTS + '/40-onedrive-connected.png' });
  console.log('✓ Connect (redirect) → connected as account; first backup: latest + dated copy in the app folder');
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
  assert.strictEqual(JSON.parse(files['golf-rounds-backup.json']).rounds[0].holes[1].finished, true);
  console.log('✓ hole finished offline → queued ("Waiting to upload"); back online → uploaded');
  // 4) restore from OneDrive merges via existing restore logic
  const bk = JSON.parse(files['golf-rounds-backup.json']); bk.rounds.push({ ...bk.rounds[0], id: 'r2', course: 'Lakeridge', date: '2026-10-01T15:00:00.000Z' }); files['golf-rounds-backup.json'] = JSON.stringify(bk);
  await page.click('[data-act="odrestore"]'); await page.waitForSelector('.odfile');
  const names = await page.$$eval('.odfile', bs => bs.map(b => b.getAttribute('data-v'))); assert.strictEqual(names[0], 'golf-rounds-backup.json'); assert.ok(names.length === 2);
  await page.screenshot({ path: SHOTS + '/42-onedrive-restore-list.png' });
  await page.click('.odfile[data-v="golf-rounds-backup.json"]'); await page.waitForSelector('#notice');
  assert.strictEqual(await page.textContent('#notice'), '✓ Restored from backup: 1 added, 1 already here. You now have 2 rounds.');
  console.log('✓ Restore from OneDrive: lists backups (latest first), merges (1 added, 1 already here)');
  // 5) expired sign-in → Reconnect
  await page.evaluate(() => localStorage.setItem('stub.expired', '1')); await page.click('[data-act="odsync"]');
  await page.waitForSelector('[data-act="odreauth"]'); assert.match(await page.textContent('#odstat'), /Sign-in expired/);
  await page.click('[data-act="odreauth"]'); await page.waitForFunction(() => /Backed up/.test((document.getElementById('odstat') || {}).textContent || ''));
  console.log('✓ expired sign-in → Reconnect (redirect) → backs up again');
  // 6) disconnect
  await page.click('[data-act="oddisconnect"]'); await page.waitForSelector('[data-act="odconnect"]');
  assert.strictEqual(await page.evaluate(() => Object.keys(localStorage).filter(k => k === 'stub.acct').length), 0);
  console.log('✓ Disconnect → back to Connect OneDrive');
  assert.deepStrictEqual(errors, []); console.log('OD FOCUSED OK');
  await browser.close(); if (srv) srv.kill();
})().catch(e => { console.error('FAIL', e.stack); process.exit(1); });
