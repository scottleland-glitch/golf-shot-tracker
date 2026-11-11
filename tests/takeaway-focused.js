// v140 Round takeaway on Round stats (insights.js + app.js). iPhone 390x844. Run: node tests/takeaway-focused.js
// 1. A first round: the 4 bars are empty, it compares with the round's baseline and says so under Work on next.
// 2. Six earlier rounds + today's round with four 3-putts and long putts finishing short: all 4 bars green, putting
//    is the leak against the golfer's own normal, the cause is speed, tiles show "usually". Tapping the bars opens the detail.
const { chromium } = require('playwright-core'); const assert = require('assert'); const { spawn } = require('child_process');
const ARC = require('./fixtures/arcade-78.js');
const ROOT = __dirname + '/../', OUT = '/workspace/golf-app/screenshots/', PORT = 8852, BASE = 'http://127.0.0.1:' + PORT + '/';
const ok = m => console.log('  ✓ ' + m);
const hist = Array.from({ length: 6 }, (_, i) => Object.assign(ARC.round(), { id: 'h' + i, date: '2026-10-' + String(10 + i).padStart(2, '0') + 'T17:00:00.000Z', player: 'Scott' }));
const today = Object.assign(ARC.round(), { id: 'today', date: '2026-11-07T17:00:00.000Z', player: 'Scott' });
[0, 1, 4, 5].forEach(i => { const rows = today.holes[i].rows; rows.splice(rows.length - 1, 0, { dist: 6, loc: 'green', dir: '', pen: false }); });
today.holes.forEach(h => { for (let k = 1; k < h.rows.length; k++) if (h.rows[k - 1].loc === 'green' && h.rows[k - 1].dist >= 15) h.rows[k].dir = 'short'; });
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1500)); const errors = [];
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  try {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
    const page = await ctx.newPage(); page.setDefaultTimeout(30000);
    page.on('pageerror', e => errors.push(String(e))); page.on('console', m => m.type() === 'error' && errors.push(m.text()));
    const open = async (rounds, id) => {
      await page.goto(BASE + '?x=' + Date.now());
      await page.evaluate(rs => { localStorage.clear(); localStorage.setItem('golfsg.player.v1', 'Scott'); localStorage.setItem('golfsg.nameasked.v1', '1'); localStorage.setItem('golfsg.rounds.v1', JSON.stringify(rs)); }, rounds);
      await page.reload(); await page.waitForSelector('#home');
      if (await page.$('#plusbtn')) await page.click('#navbtn');
      await page.click('[data-act="history"]'); await page.click('#histlist [data-act="open"][data-id="' + id + '"]');
      await page.waitForSelector('#takeaway');
    };
    // 1. first round
    await open([Object.assign(ARC.round(), { player: 'Scott' })], 'arc78');
    assert.strictEqual(await page.textContent('#tkready'), '0/5 ready');
    assert.deepStrictEqual(await page.$$eval('.tkb u', us => us.map(u => u.style.width)), ['0%', '0%', '0%', '0%', '0%']);
    assert.strictEqual(await page.textContent('#tkheadline'), 'Approach play cost you the most.');
    assert.match(await page.textContent('#tkfocus h3'), /Wedge distance control/);
    assert.match(await page.textContent('#tkbasis'), /^Compared with the PGA Tour average – still learning your approach play \(0%\)$/);
    assert.strictEqual(await page.$$eval('.tktile', t => t.length), 4); assert.strictEqual(await page.$('.tkusual'), null);
    const order = await page.evaluate(() => ['rs-top', 'quickview', 'takeaway'].map(id => document.getElementById(id).getBoundingClientRect().top));
    assert.ok(order[0] < order[1] && order[1] < order[2], 'v191: the score, Quick view, then the takeaway');
    const wide = await page.evaluate(() => document.documentElement.scrollWidth); assert.ok(wide <= 390, 'no sideways scroll ' + wide);
    ok('first round: empty bars, compares with PGA Tour and says so, sits above Quick view');
    // 2. with history
    await open(hist.concat([today]), 'today');
    assert.strictEqual(await page.textContent('#tkready'), '4/5 ready');
    assert.strictEqual(await page.$$eval('.tkb.ready', x => x.length), 4);
    assert.strictEqual(await page.textContent('#tkheadline'), 'Putting cost you the most.');
    assert.match(await page.textContent('#tklede'), /^You lost \d\.\d more strokes on the greens than you usually do\.$/);
    assert.strictEqual(await page.textContent('#tkfocus h3'), 'Putting speed');
    assert.match(await page.textContent('#tkfocus'), /13 of 13 missed putts from 15 ft and over finished short\./);
    assert.strictEqual(await page.textContent('#tkbasis'), '✓ Compared with your normal (last 6 rounds)');
    assert.strictEqual(await page.$$eval('.tkusual', x => x.length), 4);
    // v163: the putting tile shows Where putting strokes go – SG by first-putt distance, bars add up to the putting SG
    const pb = await page.$$eval('.tktile[data-area="putting"] #tkbrk .tkbrow', e => e.map(x => +x.querySelector('.tkbv').textContent));
    assert.strictEqual(pb.length, 4); const psg = +(await page.textContent('.tktile[data-area="putting"] .tksg')).replace(' SG', '');
    assert.ok(Math.abs(pb.reduce((a, x) => a + x, 0) - psg) < 0.03, pb + ' vs ' + psg);
    // v163: the Approach tile has proximity bars like chipping (You vs the benchmark), not a second GIR line
    const ap = await page.$eval('.tktile[data-area="approach"]', e => ({ bars: e.querySelectorAll('svg.tkpic').length, lbl: (e.querySelector('.tkbl') || {}).textContent, p: e.querySelector('p').textContent }));
    assert.strictEqual(ap.bars, 2); assert.ok(['PGA', 'D1', 'LPGA', 'Scratch'].includes(ap.lbl), ap.lbl); assert.doesNotMatch(ap.p, /greens in regulation/);
    // v163: Where putting strokes go under the round's strokes gained
    if (!(await page.$('#rspm'))) await page.click('[data-act="sgtoggle"]'); await page.waitForSelector('#rspm #st-rsptbrk');
    assert.strictEqual(await page.$$eval('#rspm .stbrow', e => e.length), 4); assert.match(await page.textContent('#rspm .stv'), /Total/);
    assert.strictEqual(await page.$('#tkrows'), null);
    await page.click('#tkstrip'); await page.waitForSelector('#tkrows');
    assert.match(await page.textContent('#tkrows'), /Putting\s*Ready ✓/);
    await page.locator('#takeaway').screenshot({ path: OUT + 'takeaway-mine.png' });
    await page.click('#tkstrip'); assert.strictEqual(await page.$('#tkrows'), null);
    ok('with 6 earlier rounds: 4/4 ready, putting vs your normal, cause = speed, strip opens and closes');
    // a later round does not change an earlier round's takeaway (only rounds before it count)
    await open(hist.concat([today]), 'h0');
    assert.strictEqual(await page.textContent('#tkready'), '0/5 ready');
    ok('an old round is judged on the rounds before it');
    assert.deepStrictEqual(errors, [], 'no page errors'); console.log('PASS takeaway-focused');
  } finally { await b.close(); srv.kill(); }
})().catch(e => { console.error(e); process.exit(1); });
