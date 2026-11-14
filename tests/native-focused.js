// iPhone app (Capacitor): the www bundle loads native.js after config.js; inside the app (a pretend Capacitor here) Google Drive
// backup is hidden and sharing goes through the Share + Filesystem plugins (file → cache folder → iOS share sheet); on the website nothing changes.
const { chromium } = require('playwright-core'); const { spawn, execSync } = require('child_process'); const assert = require('assert'); const fs = require('fs');
(async () => {
  const ROOT = '/home/claude/golf-app', WWW = '/tmp/claude-native-www-' + process.pid;
  execSync('bash native/build-www.sh', { cwd: ROOT, stdio: 'ignore' }); fs.rmSync(WWW, { recursive: true, force: true }); fs.renameSync(ROOT + '/www', WWW);
  assert.ok(!fs.existsSync(WWW + '/sw.js'), 'no service worker in the app'); assert.ok(/config\.js"><\/script>\n<script src="native\.js">/.test(fs.readFileSync(WWW + '/index.html', 'utf8')));
  const PORT = 8992, srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: WWW, stdio: 'ignore' }), web = spawn('python3', ['-m', 'http.server', String(PORT + 1), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1200)); const ok = m => console.log('  ✓ ' + m);
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => { window.__calls = []; const P = { Share: { share: o => { window.__calls.push(['share', o]); return window.__cancel ? Promise.reject(new Error('Share canceled')) : Promise.resolve({}); } },
    Filesystem: { writeFile: o => { window.__calls.push(['write', o]); return Promise.resolve({ uri: 'file:///cache/' + o.path }); } } };
    window.Capacitor = { isNativePlatform: () => true, registerPlugin: n => P[n], Plugins: P }; localStorage.setItem('golfsg.player.v1', 'Scott'); localStorage.setItem('golfsg.nameasked.v1', '1'); });
  const page = await ctx.newPage(), errs = []; page.on('pageerror', e => errs.push(String(e)));
  await page.goto('http://127.0.0.1:' + PORT + '/'); await page.waitForSelector('#home');
  assert.strictEqual(await page.evaluate(() => window.STROKEWISE_NATIVE), true); assert.strictEqual(await page.evaluate(() => window.GOLF_CONFIG.googleClientId), '');
  await page.click('#navbtn'); await page.click('[data-act="archive"]'); await page.waitForTimeout(300);
  assert.strictEqual(await page.$('[data-act="gdconnect"], [data-act="gdsignin"]'), null, 'no Google Drive in the app'); ok('Google Drive backup hidden in the app');
  const r = await page.evaluate(async () => { const f = new File(['hello'], 'strokewise backup.json', { type: 'application/json' }); const can = navigator.canShare({ files: [f] });
    await navigator.share({ files: [f], title: 'Backup' }); window.__cancel = true; let name = ''; try { await navigator.share({ text: 'x' }); } catch (e) { name = e.name; } return { can, calls: window.__calls, name }; });
  assert.ok(r.can); assert.deepStrictEqual(r.calls[0], ['write', { path: 'strokewise backup.json', data: 'aGVsbG8=', directory: 'CACHE' }]);
  assert.deepStrictEqual(r.calls[1], ['share', { title: 'Backup', files: ['file:///cache/strokewise backup.json'] }]); assert.strictEqual(r.name, 'AbortError', 'a cancelled share sheet reads as cancelled');
  ok('sharing: file → cache folder → iOS share sheet; cancel = AbortError');
  // the website: no Capacitor → nothing changes
  const p2 = await (await b.newContext()).newPage(); await p2.goto('http://127.0.0.1:' + (PORT + 1) + '/'); await p2.waitForSelector('#home, #namesheet');
  assert.ok(!(await p2.evaluate(() => window.STROKEWISE_NATIVE))); assert.ok((await p2.evaluate(() => window.GOLF_CONFIG.googleClientId)).length > 10); ok('website unchanged');
  assert.deepStrictEqual(errs, []); await b.close(); srv.kill(); web.kill(); fs.rmSync(WWW, { recursive: true, force: true }); console.log('native OK'); process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
