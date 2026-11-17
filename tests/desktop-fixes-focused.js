// v230 desktop / coach-facing fixes: Last-rounds clicks, sane driver distances, capped map graphics.
// Run: node tests/desktop-fixes-focused.js
const { chromium } = require('playwright-core'); const assert = require('assert'); const { spawn } = require('child_process');
const ARC = require('./fixtures/arcade-78.js');
const ROOT = __dirname + '/../', OUT = '/tmp/desktop-fixes-shots/', PORT = 8877, BASE = 'http://127.0.0.1:' + PORT + '/';
const ok = m => console.log('  ✓ ' + m);

const R = (d, loc, dir, club, pen) => ({ dist: d, loc, dir: dir || '', pen: !!pen, club: club || '' });
function somersett9() {
  const par = [5, 4, 3, 5, 4, 3, 4, 3, 5];
  const yards = [513, 327, 150, 466, 365, 140, 291, 155, 458];
  const to = [250, 60, null, 240, 120, null, 70, null, 284];
  const dir = ['', '', '', 'left', 'left', '', 'right', '', 'long'];
  const club = ['Driver', 'Driver', '', 'Driver', 'Driver', '', 'Driver', '', 'Driver'];
  const holes = par.map((p, i) => {
    if (p === 3) return { par: 3, finished: true, rows: [R(yards[i], 'tee'), R(18, 'green'), R(2, 'holed')] };
    if (i === 3) return { par: 5, finished: true, rows: [R(yards[i], 'tee', '', 'Driver'), R(40, 'hazard', 'left', '', true), R(18, 'green'), R(2, 'holed')] };
    return { par: p, finished: true, rows: [R(yards[i], 'tee', '', club[i]), R(to[i], 'fairway', dir[i]), R(18, 'green'), R(2, 'holed')] };
  });
  return { v: 3, dv: 2, id: 'som9', date: '2026-11-15T19:00:00.000Z', course: 'Somersett Country Club', nine: true, baseline: 'd1w', player: 'Scott', holes };
}
const now = Date.now(), extras = [];
for (let i = 0; i < 4; i++) {
  extras.push(Object.assign(ARC.round(), { id: 'ex' + i, player: 'Scott', baseline: 'd1w', date: new Date(now - (2 + i * 5) * 864e5).toISOString() }));
}
const rounds = extras.concat([somersett9()]);

(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1500));
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const errors = [];
  const attach = page => { page.setDefaultTimeout(30000); page.on('pageerror', e => errors.push(String(e))); };
  const seed = async page => {
    await page.goto(BASE + '?x=' + Date.now());
    await page.evaluate(rs => { localStorage.clear(); localStorage.setItem('golfsg.player.v1', 'Scott'); localStorage.setItem('golfsg.nameasked.v1', '1'); localStorage.setItem('golfsg.rounds.v1', JSON.stringify(rs)); }, rounds);
    await page.reload(); await page.waitForSelector('#home');
  };
  try {
    // ---- desktop 1280: Last rounds + driver box + fairway map ----
    const desk = await b.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false, serviceWorkers: 'block' });
    const d = await desk.newPage(); attach(d);
    await seed(d);

    await d.click('#tbmygame'); await d.waitForSelector('#mygame');
    await d.click('#mgrounds [data-v="r2"]');
    await d.waitForFunction(() => document.querySelector('#mgrounds [data-v="r2"]').classList.contains('sel'));
    assert.strictEqual(await d.getAttribute('#mgrounds [data-v="r2"]', 'aria-pressed'), 'true');
    assert.match(await d.textContent('.title span'), /2 rounds/);
    await d.screenshot({ path: OUT + 'desktop-mygame-last-rounds.png', fullPage: true });
    ok('desktop My Game: Last rounds 2 responds to a mouse click');

    await d.click('#mgback, [data-act="home"]'); await d.waitForSelector('#home');
    await d.click('#navbtn'); await d.click('#navmenu [data-act="stats"]'); await d.waitForSelector('#statspage');
    await d.click('#strange [data-v="sel"]'); await d.waitForSelector('#strounds');
    await d.click('#strounds [data-id="som9"]');
    if (await d.$eval('#st-drive', el => el.offsetParent === null || getComputedStyle(el).display === 'none' || el.closest('.stcatb')?.hidden)) {
      await d.click('#stcat-driver .stcath');
    }
    await d.waitForSelector('#st-drive', { state: 'visible' });
    const driven = await d.textContent('#driven');
    assert.doesNotMatch(driven, /742/);
    assert.match(driven, /max (\d+) yd/);
    const max = +driven.match(/max (\d+) yd/)[1];
    assert.ok(max <= 450, 'selected 9-hole driver max is sane: ' + driven);
    await d.locator('#st-drive').scrollIntoViewIfNeeded();
    await d.screenshot({ path: OUT + 'desktop-stats-driver.png' });
    ok('desktop Stats: 9-hole Somersett Driver box has no 742 yd drive (' + driven.trim() + ')');

    await d.click('#statspage [data-act="home"]'); await d.waitForSelector('#home');
    await d.click('#navbtn'); await d.click('#navmenu [data-act="history"]'); await d.waitForSelector('#histlist');
    await d.click('#histlist [data-act="open"][data-id="som9"]');
    await d.waitForSelector('#stattiles');
    await d.click('[data-act="map"][data-v="fw"]');
    await d.waitForSelector('#fwmap');
    const deskFw = await d.$eval('#fwmap', el => { const r = el.getBoundingClientRect(); return { w: r.width, h: r.height }; });
    assert.ok(deskFw.w <= 401 && deskFw.w >= 300, 'desktop fairway map is capped near phone width: ' + deskFw.w);
    await d.screenshot({ path: OUT + 'desktop-fairway-map.png' });
    ok('desktop fairway map width ' + Math.round(deskFw.w) + ' px (capped)');
    await desk.close();

    // ---- phone 390: map is still full-bleed in the content column, look unchanged ----
    const phone = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
    const p = await phone.newPage(); attach(p);
    await seed(p);
    await p.click('#navbtn'); await p.click('#navmenu [data-act="history"]'); await p.waitForSelector('#histlist');
    await p.click('#histlist [data-act="open"][data-id="som9"]');
    await p.waitForSelector('#stattiles');
    await p.click('[data-act="map"][data-v="fw"]');
    await p.waitForSelector('#fwmap');
    const phoneFw = await p.$eval('#fwmap', el => { const r = el.getBoundingClientRect(); return { w: r.width, h: r.height }; });
    // 390px screen, .mapview padding 12px each side => ~366
    assert.ok(phoneFw.w >= 350 && phoneFw.w <= 390, 'phone fairway map still fills the phone column: ' + phoneFw.w);
    await p.screenshot({ path: OUT + 'phone-fairway-map.png' });
    ok('phone fairway map width ' + Math.round(phoneFw.w) + ' px (unchanged fill)');
    await phone.close();

    assert.deepStrictEqual(errors, [], 'no page errors: ' + errors.join(' | '));
    console.log('PASS desktop-fixes-focused');
  } finally { await b.close(); srv.kill(); }
})().catch(e => { console.error(e); process.exit(1); });
