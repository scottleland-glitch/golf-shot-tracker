// v226: Restore from backup file opens the pick list and brings rounds + practice back,
// even when the backup has practice entries (v223 left a broken leftover that stopped it).
const { chromium } = require('playwright-core'); const assert = require('assert'); const { spawn } = require('child_process');
const path = require('path'), fs = require('fs'), os = require('os');
const ARC = require('./fixtures/arcade-78.js');
const ROOT = path.join(__dirname, '..'), PORT = 8839, BASE = 'http://127.0.0.1:' + PORT + '/';
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1500));
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  try {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
    const P = await ctx.newPage(); const errors = []; P.on('pageerror', e => errors.push(String(e)));
    await P.goto(BASE);
    const rs = [Object.assign(ARC.round(), { id: 'r1', date: '2026-10-20T16:00:00.000Z', player: 'Quincy' }), Object.assign(ARC.round(), { id: 'r2', date: '2026-10-27T16:00:00.000Z', player: 'Quincy' })];
    const json = await P.evaluate(rs => JSON.stringify(SG.makeBackup(rs, null, 'Quincy', [], null, null,
      [{ id: 'p1', date: '2026-11-10', spoke: 'lag', min: 30, player: 'Quincy' }, { id: 'p2', date: '2026-11-11', spoke: 'irons', min: 45, player: 'Quincy' }], [])), rs);
    const file = path.join(os.tmpdir(), 'golf-rounds-quincy-test.json'); fs.writeFileSync(file, json);
    await P.evaluate(() => { localStorage.clear(); localStorage.setItem('golfsg.player.v1', 'Quincy'); localStorage.setItem('golfsg.nameasked.v1', '1'); });
    await P.reload(); await P.waitForSelector('#app > *');
    if (await P.$('#navbtn')) await P.click('#navbtn');
    await P.click('[data-act="archive"]'); await P.waitForSelector('#restorefile', { state: 'attached' });
    await P.setInputFiles('#restorefile', file);
    await P.waitForSelector('#rpall', { timeout: 5000 });
    console.log('  ✓ picking the file opens the restore list');
    await P.click('#rpall'); await P.click('#rpgo'); await P.waitForTimeout(500);
    const st = await P.evaluate(() => ({ r: JSON.parse(localStorage.getItem('golfsg.rounds.v1') || '[]').length, p: JSON.parse(localStorage.getItem('golfsg.practice.v1') || '[]').length }));
    assert.strictEqual(st.r, 2, 'both rounds restored'); assert.strictEqual(st.p, 2, 'both practice entries restored');
    console.log('  ✓ 2 rounds and 2 practice entries restored');
    assert.deepStrictEqual(errors, []); console.log('restore-file-focused: all passed');
  } finally { await b.close(); srv.kill(); }
})().catch(e => { console.error(e); process.exit(1); });
