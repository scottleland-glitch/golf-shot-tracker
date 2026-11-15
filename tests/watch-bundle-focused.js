// The iPhone app's REAL web bundle with the watch link (native/build-www.sh with STROKEWISE_WATCH=1), loaded in the real script order, with a
// pretend native plugin: starting a round on the phone must push that round to the watch (pushState), a shot on the phone must push again, and the
// debug log (STROKEWISE_WATCH.log) must say so. Run: node tests/watch-bundle-focused.js
const { chromium } = require('playwright-core'); const assert = require('assert'); const { spawn, execSync } = require('child_process'); const fs = require('fs'); const os = require('os');
const ROOT = __dirname + '/../', PORT = 8853, BASE = 'http://127.0.0.1:' + PORT + '/', ok = m => console.log('  ✓ ' + m);
(async () => {
  const tmp = fs.mkdtempSync(os.tmpdir() + '/sw-bundle-'); execSync('cp -R . ' + JSON.stringify(tmp + '/src') + ' 2>/dev/null; true', { cwd: ROOT });
  execSync('bash native/build-www.sh', { cwd: tmp + '/src', env: Object.assign({}, process.env, { STROKEWISE_WATCH: '1' }), stdio: 'ignore' });
  const WWW = tmp + '/src/www'; const html = fs.readFileSync(WWW + '/index.html', 'utf8');
  assert.ok(/config\.js"><\/script>\n<script src="native\.js"><\/script>\n<script src="watch-core\.js"><\/script>\n<script src="watch\.js"><\/script>/.test(html), 'watch scripts follow native.js in index.html');
  assert.ok(html.indexOf('watch.js') < html.indexOf('app.js'), 'watch.js loads before app.js (as in the app)'); ok('www/index.html loads watch-core.js and watch.js before app.js');
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: WWW, stdio: 'ignore' }); await new Promise(r => setTimeout(r, 1200)); const errors = [];
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  try {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
    await ctx.addInitScript(() => { const f = window.__fake = { pushed: [], pending: [], calls: [] };
      // exactly what native-bridge.js gives a bundler-less app: Capacitor.Plugins.<jsName>, isPluginAvailable, isNativePlatform – and NO registerPlugin
      window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', isPluginAvailable: n => n === 'StrokewiseWatch',
        Plugins: { StrokewiseWatch: ({ getInfo: async () => ({ supported: true, activated: true, paired: true, installed: true, reachable: false }), getPending: async () => ({ items: f.pending }), ack: async () => {},
          pushState: async o => { f.pushed.push(JSON.parse(o.json)); }, addListener: () => Promise.resolve({ remove() {} }) }) } }; });
    const page = await ctx.newPage(); page.setDefaultTimeout(15000); page.on('pageerror', e => errors.push(String(e)));
    await page.goto(BASE + '?x=' + Date.now()); await page.evaluate(() => { localStorage.clear(); localStorage.setItem('golfsg.player.v1', 'Scott'); localStorage.setItem('golfsg.nameasked.v1', '1'); });
    await page.reload(); await page.waitForSelector('#home');
    assert.strictEqual(await page.evaluate(() => typeof window.STROKEWISE_WATCH), 'object', 'watch link is live in the app bundle'); ok('window.STROKEWISE_WATCH exists in the real bundle');
    await page.waitForFunction(() => window.__fake.pushed.length >= 1); let st = await page.evaluate(() => window.__fake.pushed.slice(-1)[0]);
    assert.strictEqual(st.roundId, null); ok('with no round the phone tells the watch "no round"');
    await page.click('#tbplus'); await page.click('[data-act="newform"]'); await page.waitForSelector('[data-act="new"]'); await page.fill('#course', 'Ridgeview'); await page.click('[data-act="new"]'); await page.waitForSelector('.holecard');
    await page.waitForFunction(() => window.__fake.pushed.slice(-1)[0].roundId); st = await page.evaluate(() => window.__fake.pushed.slice(-1)[0]);
    assert.ok(/^r\d+/.test(st.roundId) && st.hole === 0 && st.holes[0].i === 0 && st.pars.length === 18); ok('starting a round on the phone pushes it to the watch (hole 1)');
    const n = await page.evaluate(() => window.__fake.pushed.length);
    await page.selectOption('select[data-f="fin"][data-k="0"]', 'fairway'); await page.click('[data-act="nextshot"][data-k="0"]'); await page.waitForSelector('input[data-row="1"]'); await page.fill('input[data-row="1"]', '150'); await page.dispatchEvent('input[data-row="1"]', 'change');
    await page.waitForFunction(n => window.__fake.pushed.length > n, n); st = await page.evaluate(() => window.__fake.pushed.slice(-1)[0]); assert.strictEqual(st.holes[0].rows.length, 2); ok('a shot entered on the phone is pushed too');
    fs.writeFileSync(ROOT + 'tests/fixtures/watch-state-real.json', JSON.stringify(await page.evaluate(() => window.__fake.pushed), null, 1)); // what the app really sends – the Swift test decodes it
    const log = await page.evaluate(() => window.STROKEWISE_WATCH.log && window.STROKEWISE_WATCH.log());
    assert.ok(Array.isArray(log) && log.some(l => /pushed/.test(l.m)), 'debug log records the pushes'); ok('the debug log shows the pushes: ' + log.slice(-2).map(l => l.m).join(' | '));
    assert.deepStrictEqual(errors, []);
  } finally { await b.close(); srv.kill(); }
  console.log('PASS watch-bundle-focused');
})().catch(e => { console.error(e); process.exit(1); });
