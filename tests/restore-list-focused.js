// After Google Drive backup was removed: a phone that had OneDrive (or Drive) connected opens cleanly,
// Settings still has file backup + restore + CSV, and no Google Drive card.
const { chromium } = require('playwright-core'); const assert = require('assert'); const { spawn } = require('child_process');
const path = require('path');
const ARC = require('./fixtures/arcade-78.js');
const ROOT = path.join(__dirname, '..'), PORT = 8838, BASE = 'http://127.0.0.1:' + PORT + '/';

(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1500));
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  const P = await ctx.newPage(); const errors = []; P.on('pageerror', e => errors.push(String(e)));
  const rs = [Object.assign(ARC.round(), { id: 'a1', date: '2026-10-20T16:00:00.000Z', player: 'Scott' })];
  await P.goto(BASE + '#code=leftover');
  await P.evaluate(rs => {
    localStorage.setItem('golfsg.player.v1', 'Scott'); localStorage.setItem('golfsg.nameasked.v1', '1');
    localStorage.setItem('golfsg.rounds.v1', JSON.stringify(rs));
    localStorage.setItem('golfsg.onedrive.v1', JSON.stringify({ connected: true }));
    localStorage.setItem('golfsg.gdrive.v1', JSON.stringify({ connected: true, user: 'old@example.com' }));
    localStorage.setItem('golfsg.gdrive.token.v1', JSON.stringify({ accessToken: 'x' }));
    localStorage.setItem('msal.idtoken', 'x');
  }, rs);
  await P.reload(); await P.waitForSelector('#home, #app > *');
  const leftover = await P.evaluate(() => ({
    hash: location.hash,
    od: localStorage.getItem('golfsg.onedrive.v1'),
    gd: localStorage.getItem('golfsg.gdrive.v1'),
    tok: localStorage.getItem('golfsg.gdrive.token.v1'),
    msal: localStorage.getItem('msal.idtoken')
  }));
  assert.ok(!leftover.hash || leftover.hash === '#', 'Microsoft #code= hash dropped: ' + leftover.hash);
  assert.strictEqual(leftover.od, null, 'OneDrive key removed');
  assert.strictEqual(leftover.gd, null, 'Google Drive state removed');
  assert.strictEqual(leftover.tok, null, 'Google Drive token removed');
  assert.strictEqual(leftover.msal, null, 'MSAL cache removed');
  if (await P.$('#navbtn')) await P.click('#navbtn');
  await P.click('[data-act="archive"]'); await P.waitForSelector('.archivepage');
  assert.ok(await P.$('[data-act="backup"]') && await P.$('#restorefile') && await P.$('[data-act="csvall"]'), 'file backup, restore and CSV still there');
  assert.strictEqual(await P.$('[data-act="gdconnect"], [data-act="gdsignin"], #gdcard, #gdrsheet'), null, 'no Google Drive UI');
  console.log('  OneDrive / Drive leftovers cleaned; Settings shows file backup + restore + CSV only');
  assert.deepStrictEqual(errors, []); await b.close(); srv.kill(); console.log('restore-list-focused: all passed');
})().catch(e => { console.error(e); process.exit(1); });
