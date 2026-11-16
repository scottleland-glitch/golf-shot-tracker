// v223: gentle file-backup reminder on Home and Settings after 14+ days (or never), with Save to Files + Not now (snooze 14 days).
const { chromium } = require('playwright-core'); const assert = require('assert'); const { spawn } = require('child_process');
const path = require('path');
const ARC = require('./fixtures/arcade-78.js');
const ROOT = path.join(__dirname, '..'), PORT = 8861, BASE = 'http://127.0.0.1:' + PORT + '/';

(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1200));
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  const P = await ctx.newPage(); const errors = []; P.on('pageerror', e => errors.push(String(e)));
  const open = async (seed) => {
    await P.goto(BASE + '?t=' + Date.now());
    await P.evaluate(seed => {
      localStorage.clear();
      if (seed.player) { localStorage.setItem('golfsg.player.v1', seed.player); localStorage.setItem('golfsg.nameasked.v1', '1'); }
      if (seed.role) localStorage.setItem('golfsg.role.v1', seed.role);
      if (seed.rounds) localStorage.setItem('golfsg.rounds.v1', JSON.stringify(seed.rounds));
      if (seed.last) localStorage.setItem('golfsg.lastBackup.v1', seed.last);
      if (seed.snooze) localStorage.setItem('golfsg.backupSnooze.v1', seed.snooze);
    }, seed);
    await P.reload(); await P.waitForSelector('#home, #namesheet, #welcome, #app > *');
  };
  const settings = async () => { if (await P.$('#navbtn')) await P.click('#navbtn'); await P.click('[data-act="archive"]'); await P.waitForSelector('.archivepage'); };
  const ok = m => console.log('  ✓ ' + m);
  const WORD = /It's been a while since your last backup\. Save one to Files\./;
  const r = Object.assign(ARC.round(), { id: 'r1', date: '2026-10-20T16:00:00.000Z', player: 'Scott' });

  await open({ player: 'Scott', role: 'play' }); // no rounds
  assert.strictEqual(await P.$('#bkremind'), null, 'no reminder without rounds'); ok('hidden with no rounds');

  await open({ player: 'Scott', role: 'coach' });
  assert.strictEqual(await P.$('#bkremind'), null, 'coach-only, no rounds'); ok('hidden for coach-only with no rounds');

  await open({ player: 'Scott', role: 'play', rounds: [r] }); // never backed up
  await P.waitForSelector('#bkremind');
  assert.match(await P.textContent('#bkremind'), WORD);
  assert.ok(await P.$('#bkgo') && await P.$('#bksnooze')); ok('shows on Home when rounds exist and no backup yet');
  await settings();
  assert.match(await P.textContent('#bkremind'), WORD);
  assert.ok(await P.$('[data-act="backup"]') && await P.$('#restorefile'));
  assert.strictEqual(await P.$('[data-act="gdconnect"], #gdcard'), null); ok('same note on Settings; file backup still there; no Drive');

  await open({ player: 'Scott', role: 'play', rounds: [r], last: new Date(Date.now() - 20 * 864e5).toISOString() });
  await P.waitForSelector('#bkremind');
  assert.match(await P.textContent('#bkremind'), WORD); ok('shows after 14+ days');

  await open({ player: 'Scott', role: 'play', rounds: [r], last: new Date(Date.now() - 2 * 864e5).toISOString() });
  await P.waitForSelector('#home');
  assert.strictEqual(await P.$('#bkremind'), null); ok('hidden when last file backup was recent');

  await open({ player: 'Scott', role: 'play', rounds: [r], last: new Date(Date.now() - 20 * 864e5).toISOString() });
  await P.waitForSelector('#bksnooze');
  await P.click('#bksnooze');
  await P.waitForFunction(() => !document.getElementById('bkremind'));
  const snooze = await P.evaluate(() => localStorage.getItem('golfsg.backupSnooze.v1'));
  assert.ok(snooze); ok('Not now hides it and stores a snooze');
  await settings();
  assert.strictEqual(await P.$('#bkremind'), null, 'snooze also hides it on Settings');

  await open({ player: 'Scott', role: 'play', rounds: [r], last: new Date(Date.now() - 20 * 864e5).toISOString(), snooze: new Date(Date.now() - 15 * 864e5).toISOString() });
  await P.waitForSelector('#bkremind'); ok('returns after a 14-day snooze lapses');

  assert.deepStrictEqual(errors, []); await b.close(); srv.kill(); console.log('backup-reminder-focused: all passed');
})().catch(e => { console.error(e); process.exit(1); });
