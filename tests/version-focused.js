// v107: the app version is shown small and light at the bottom of Settings and Home. It comes from ONE constant
// (appVersion in config.js) and must equal the service worker cache name in sw.js (golf-sg-<version>), so they can't drift.
// iPhone 390x844 @3x. Run: node tests/version-focused.js
const { chromium } = require('playwright-core'); const assert = require('assert'); const { spawn } = require('child_process'); const fs = require('fs');
const ROOT = __dirname + '/../', OUT = '/workspace/golf-app/screenshots/', PORT = 8844, BASE = 'http://127.0.0.1:' + PORT + '/';
const ok = m => console.log('  ✓ ' + m);
// ---- 1. files: one constant, same as the cache name
const sw = fs.readFileSync(ROOT + 'sw.js', 'utf8'), cfg = fs.readFileSync(ROOT + 'config.js', 'utf8'), app = fs.readFileSync(ROOT + 'app.js', 'utf8');
const swVer = (sw.match(/const CACHE = 'golf-sg-(v\d+)';/) || [])[1], cfgVers = cfg.match(/appVersion:\s*'(v\d+)'/g) || [];
assert.ok(swVer, 'sw.js has a golf-sg-vN cache name'); assert.strictEqual(cfgVers.length, 1, 'exactly one appVersion in config.js');
const cfgVer = cfgVers[0].match(/'(v\d+)'/)[1];
assert.strictEqual(cfgVer, swVer, 'config.js appVersion (' + cfgVer + ') must equal the sw.js cache version (' + swVer + ')');
assert.strictEqual(swVer, 'v110');
assert.ok(!/Pin High v\d+/.test(app), 'no version typed into app.js – it reads GOLF_CONFIG.appVersion');
ok('config.js appVersion ' + cfgVer + ' = sw.js cache golf-sg-' + swVer);
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1500)); const errors = [];
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  try {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
    const page = await ctx.newPage(); page.setDefaultTimeout(30000);
    page.on('pageerror', e => errors.push(String(e))); page.on('console', m => m.type() === 'error' && errors.push(m.text()));
    await page.goto(BASE + '?x=' + Date.now()); await page.evaluate(() => { localStorage.clear(); localStorage.setItem('golfsg.player.v1', 'Scott'); localStorage.setItem('golfsg.nameasked.v1', '1'); }); await page.reload();
    await page.waitForSelector('#home'); if (await page.$('#namesheet')) await page.click('[data-act="nameskip"]');
    const look = sel => page.evaluate(s => { const e = document.querySelector(s); if (!e) return null; const c = getComputedStyle(e), r = e.getBoundingClientRect();
      return { t: e.textContent, fs: parseFloat(c.fontSize), fw: +c.fontWeight, col: c.color, r: r.toJSON(), vis: c.display !== 'none' && c.visibility !== 'hidden' && r.width > 0 }; }, sel);
    const expect = 'Pin High ' + swVer, light = (L, n) => { assert.ok(L && L.vis, n + ' shown'); assert.strictEqual(L.t, expect, n + ' text'); assert.ok(L.fs <= 12 && L.fw <= 300, n + ' small + light ' + JSON.stringify(L)); };
    // ---- 2. Home: bottom, small, light grey, not covering anything
    const H = await look('#homever'); light(H, 'Home version');
    assert.ok(H.r.bottom <= 844 && H.r.top > 844 - 40, 'at the very bottom ' + JSON.stringify(H.r));
    assert.strictEqual(await page.evaluate(() => GOLF_CONFIG.appVersion), swVer, 'running app reads the same constant');
    ok('Home: "' + H.t + '" ' + H.fs + 'px weight ' + H.fw + ', ' + H.col + ', ' + Math.round(844 - H.r.bottom) + 'px from the bottom');
    await page.waitForTimeout(400); await page.screenshot({ path: OUT + 'version-home.png' });
    // resume pill still clear of the version line
    await page.evaluate(() => { const r = { id: 'rv', date: '2026-10-30', course: 'Lakeridge', holes: [{ par: 4, rows: [{ loc: 'tee', dist: 400 }] }], player: 'Scott' };
      localStorage.setItem('golfsg.rounds.v1', JSON.stringify([r])); localStorage.setItem('golfsg.current.v1', 'rv'); }); await page.reload(); await page.waitForSelector('#home');
    if (await page.$('#resumepill')) { const P = await look('#resumepill'), H2 = await look('#homever'); assert.ok(P.r.bottom <= H2.r.top, 'Resume pill above the version line ' + JSON.stringify([P.r, H2.r])); ok('Resume round pill sits above it (no overlap)'); }
    await page.evaluate(() => { localStorage.removeItem('golfsg.rounds.v1'); localStorage.removeItem('golfsg.current.v1'); }); await page.reload(); await page.waitForSelector('#home');
    // ---- 3. Settings: last thing on the page, quiet
    await page.click('#plusbtn'); await page.click('#plusmenu [data-act="archive"]'); await page.waitForSelector('#setver');
    const S = await look('#setver'); light(S, 'Settings version');
    const last = await page.evaluate(() => { const p = document.querySelector('.archivepage'), kids = [...p.children].filter(e => getComputedStyle(e).display !== 'none' && e.type !== 'file'); return kids[kids.length - 1].id; });
    assert.strictEqual(last, 'setver', 'version is the last line of Settings');
    ok('Settings: "' + S.t + '" ' + S.fs + 'px weight ' + S.fw + ', ' + S.col + ', last line of the page');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await page.waitForTimeout(400);
    await page.screenshot({ path: OUT + 'version-settings.png' });
    assert.deepStrictEqual(errors, [], 'no page errors');
    console.log('PASS version-focused');
  } finally { await b.close(); srv.kill(); }
})().catch(e => { console.error('FAIL', e); process.exit(1); });
