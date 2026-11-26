// v260 (Scott): Trends – the words about the charts behind (i); a tap on a chart opens it full screen, sideways on a phone held upright
// ("Upright" puts it back), swipe down / ✕ / Esc closes it; dots still open the round. Run: node tests/trends-fullscreen-focused.js [outDir]
const { chromium } = require('playwright-core'); const assert = require('assert'); const { spawn } = require('child_process'); const fs = require('fs');
const ARC = require('./fixtures/arcade-78.js');
const PORT = 8887, BASE = 'http://127.0.0.1:' + PORT + '/', DAY = 864e5, now = Date.now(), ok = m => console.log('  ✓ ' + m), OUT = process.argv[2] || '/tmp/trfs-test'; fs.mkdirSync(OUT, { recursive: true });
const ld = (n) => { const t = new Date(now - n * DAY); return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0'); };
let seed = 11; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const R = []; for (let w = 0; w < 16; w++) { const eff = Math.sin(w / 2.1) + (rnd() - .5) * 1.4, r = JSON.parse(JSON.stringify(ARC.round())), k = Math.round(Math.abs(eff) * 4);
  Object.assign(r, { id: 's' + w, player: 'Scott', baseline: 'd1w', date: new Date(now - ((15 - w) * 7 + 1) * DAY).toISOString(), play: w % 3 ? 'practice' : 'tournament' });
  r.holes.forEach((h, hi) => { h.finished = true; if (hi >= k) return; const rows = h.rows, g = rows.findIndex(x => x.loc === 'holed');
    if (eff > 0 && g > 1 && rows[g - 1].loc === 'green') rows.splice(g - 1, 1); else if (eff < 0 && g > 0 && rows[g - 1].loc === 'green') rows.splice(g, 0, { dist: 3, loc: 'green', dir: '', pen: false }); }); R.push(r); }
const SP = ['short', 'lag', 'chip', 'wedges', 'irons', 'drive', 'bunker'];
const logs = (fromDay) => { const L = []; for (let d = 2; d <= fromDay; d += 2) [0, 1].forEach(j => L.push({ id: 'p' + d + j, date: ld(d) + 'T12:00:00', player: 'Scott', spoke: SP[(d / 2 + j * 3) % 7], focus: '', min: 30 + (d * 7 + j * 13) % 45, feel: 'ok' })); return L; };
const toMin = (x) => { let m = 0; x.replace(/(\d+)\s*h/, (q, h) => { m += 60 * h; }); x.replace(/(\d+)\s*(m|min)\b/, (q, n) => { m += +n; }); return m; };


(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: __dirname + '/..', stdio: 'ignore' }); await new Promise(r => setTimeout(r, 1200));
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] }); const errors = [];
  try {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' }), page = await ctx.newPage();
    page.setDefaultTimeout(20000); page.on('pageerror', e => errors.push(String(e)));
    const go = async (L) => { await page.goto(BASE + '?x=' + Date.now()); await page.evaluate(([R, P, set]) => { localStorage.clear(); localStorage.setItem('golfsg.player.v1', 'Scott'); localStorage.setItem('golfsg.nameasked.v1', '1'); localStorage.setItem('golfsg.role.v1', 'play');
      localStorage.setItem('golfsg.mybench.v1', JSON.stringify({ Scott: 'd1w' })); localStorage.setItem('golfsg.rounds.v1', JSON.stringify(R)); localStorage.setItem('golfsg.practice.v1', JSON.stringify(P));
      localStorage.setItem('golfsg.typical.v1', JSON.stringify({ scott: { weekMin: 600, roundsMonth: 4, set } })); }, [R, L, ld(0)]); await page.reload(); };
    await go(logs(60)); await page.click('#tbmygame'); await page.waitForSelector('#mygame'); await page.click('#qgotrends'); await page.waitForSelector('#trendspage .trcard2');
    // (i): the words are hidden until it's tapped
    assert.ok(!(await page.isVisible('#trlede')) && !(await page.isVisible('#trpatience')) && !(await page.isVisible('.trnote')), 'words hidden');
    await page.screenshot({ path: OUT + '/01-trends.png' });
    await page.click('#trinfobtn'); assert.ok(await page.isVisible('#trlede') && await page.isVisible('.trnote')); assert.match(await page.textContent('#trpatience'), /Tap a chart to see it full screen/);
    await page.click('#trinfobtn'); assert.ok(!(await page.isVisible('#trlede'))); ok('chart notes behind (i)');
    // tap a chart (not a dot) → full screen, sideways on a phone held upright, wider chart
    const tap = await page.$('.trcard2[data-k="total"] .trtap'), bx = await tap.boundingBox(); await page.mouse.click(bx.x + 6, bx.y + 6);
    await page.waitForSelector('#trfs.rot'); const vb = await page.getAttribute('#trfs .trchart', 'viewBox'), cw = +vb.split(' ')[2]; assert.ok(cw > 500, 'wider when sideways: ' + vb);
    const r = await page.evaluate(() => { const e = document.querySelector('#trfs .trfsin').getBoundingClientRect(), c = document.querySelector('#trfs .trchart').getBoundingClientRect(); return [e.left, e.top, e.width, e.height, c.width, c.height, innerWidth, innerHeight]; });
    assert.ok(Math.abs(r[0]) < 1 && Math.abs(r[1]) < 1 && Math.abs(r[2] - r[6]) < 1 && Math.abs(r[3] - r[7]) < 1, 'turned box fills the screen: ' + r); assert.ok(r[5] > 600, 'chart runs the length of the phone: ' + r);
    await page.waitForTimeout(300); await page.screenshot({ path: OUT + '/02-sideways.png' }); ok('chart full screen, sideways (' + vb + ')');
    // a dot still opens the round, inside the full screen
    await page.evaluate(() => document.querySelector('#trfs .trhit').dispatchEvent(new MouseEvent('click', { bubbles: true }))); await page.waitForSelector('#trfs #trwk'); ok('a dot opens the round in full screen');
    // upright and back
    await page.click('#trfsrot'); await page.waitForSelector('#trfs:not(.rot)'); assert.strictEqual(+(await page.getAttribute('#trfs .trchart', 'viewBox')).split(' ')[2], 340); await page.screenshot({ path: OUT + '/03-upright.png' });
    await page.click('#trfsrot'); await page.waitForSelector('#trfs.rot'); ok('Upright / Sideways');
    // swipe "down" as the phone is held: sideways = toward the phone's left edge
    const sw = async (dx, dy) => page.evaluate(([dx, dy]) => { const w = document.querySelector('#trfs'), T = (x, y) => new Touch({ identifier: 1, target: w, clientX: x, clientY: y });
      w.dispatchEvent(new TouchEvent('touchstart', { touches: [T(300, 300)], bubbles: true })); w.dispatchEvent(new TouchEvent('touchmove', { touches: [T(300 + dx, 300 + dy)], bubbles: true, cancelable: true })); w.dispatchEvent(new TouchEvent('touchend', { touches: [], bubbles: true })); }, [dx, dy]);
    await sw(0, 250); await page.waitForTimeout(400); assert.ok(await page.$('#trfs'), 'a swipe toward the screen bottom is sideways for the player – stays open');
    await sw(-250, 0); await page.waitForTimeout(400); assert.strictEqual(await page.$('#trfs'), null, 'swipe down (sideways) closes'); ok('swipe down closes (sideways)');
    // a skill chart, upright: swipe down closes; Esc closes
    await page.click('.trcard2[data-k]:not([data-k="total"]) .trtap'); await page.waitForSelector('#trfs'); await page.click('#trfsrot'); await page.waitForSelector('#trfs:not(.rot)');
    await sw(0, 250); await page.waitForTimeout(400); assert.strictEqual(await page.$('#trfs'), null); ok('swipe down closes (upright)');
    await page.click('.trcard2[data-k="total"] .trtap'); await page.waitForSelector('#trfs'); await page.keyboard.press('Escape'); await page.waitForTimeout(200); assert.strictEqual(await page.$('#trfs'), null);
    await page.click('.trcard2[data-k="total"] .trtap'); await page.waitForSelector('#trfs'); await page.click('#trfsx'); assert.strictEqual(await page.$('#trfs'), null); ok('Esc and ✕ close');
    // held sideways for real (Safari): no turning, the chart just fills the screen
    await page.setViewportSize({ width: 844, height: 390 }); await page.click('.trcard2[data-k="total"] .trtap'); await page.waitForSelector('#trfs'); assert.ok(!(await page.$('#trfs.rot')) && !(await page.$('#trfsrot')), 'landscape: not turned, no button');
    await page.screenshot({ path: OUT + '/04-landscape.png' }); await page.setViewportSize({ width: 390, height: 844 }); await page.waitForSelector('#trfs.rot'); ok('a real landscape phone: fills the screen, turns back on rotate');
    assert.deepStrictEqual(errors, []); console.log('TRENDS FULL SCREEN OK');
  } finally { await b.close(); srv.kill(); }
})().catch(e => { console.error(e); process.exit(1); });
