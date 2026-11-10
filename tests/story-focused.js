// v131 Round story picture. Round stats → "Share to Instagram / TikTok" draws a 1080x1920 picture of the round
// (story.js): score, strokes gained off the tee / around the green / putting, fairways, GIR and avg 2nd putt (v132).
// Checks the numbers against SG.summarize, then the phone flow: button → preview → share picks a PNG file.
// iPhone 390x844. Run: node tests/story-focused.js
const { chromium } = require('playwright-core'); const assert = require('assert'); const { spawn } = require('child_process'); const fs = require('fs');
const SG = require('../sg.js'), STORY = require('../story.js'), ARC = require('./fixtures/arcade-78.js');
const ROOT = __dirname + '/../', OUT = '/workspace/golf-app/screenshots/', PORT = 8851, BASE = 'http://127.0.0.1:' + PORT + '/';
const ok = m => console.log('  ✓ ' + m);
// ---------- 1. the numbers on the picture
const R = Object.assign(ARC.round(), { player: 'Scott', tee: 'White' }), S = SG.summarize(R, 'pga');
const D = STORY.data(R, S, { baselineName: 'PGA Tour', locale: 'en-US' });
assert.deepStrictEqual([D.course, D.tee, D.player, D.holes, D.strokes, D.toPar], ['Arcade Creek', 'White', 'Scott', 18, 78, 6]);
assert.strictEqual(D.dateText, 'Oct 29, 2026');
assert.deepStrictEqual([D.sg.ott, D.sg.arg, D.sg.putt, D.sg.app, D.sg.total], [S.cats.tee.sg, S.cats.short.sg, S.cats.putting.sg, S.cats.approach.sg, S.sgTotal]);
assert.deepStrictEqual([D.sg.nOtt, D.sg.nApp, D.sg.nArg, D.sg.nPutt], [S.cats.tee.n, S.cats.approach.n, S.cats.short.n, S.cats.putting.n], 'v133: approach shown too');
assert.deepStrictEqual([D.fw.hit, D.fw.total, D.fw.pct, D.gir.hit, D.gir.total, D.gir.pct], [8, 14, 57, 7, 18, 39]);
const made = S.puttList.filter(p => p.made);
assert.strictEqual(D.putting.putts, 31);
const second = S.puttList.filter(p => p.n === 2);
assert.strictEqual(D.putting.n2nd, 13, '13 holes needed a 2nd putt (18 holes, five 1-putts)');
assert.strictEqual(D.putting.avg2nd, Math.round(10 * second.reduce((t, p) => t + p.ft, 0) / second.length) / 10, 'avg 2nd putt = mean of every 2nd putt');
assert.strictEqual(D.putting.avg2nd, 2, 'sample leaves every 1st putt 2 ft away');
assert.strictEqual(D.putting.longest, Math.max(...made.map(p => p.ft)));
assert.strictEqual(D.putting.onePutts, 5, 'five 1-putt holes in the sample'); assert.strictEqual(D.putting.threePutts, 0);
assert.match(STORY.fileName(R), /^Strokewise-\d{4}-\d\d-\d\d-Arcade-Creek\.png$/);
assert.strictEqual(STORY.fmtSG(1.234), '+1.23'); assert.strictEqual(STORY.fmtSG(-0.001), '0.00');
ok('story numbers match the round: 78 (+6), SG by category, FW 8/14, GIR 7/18, avg 2nd putt ' + D.putting.avg2nd + ' ft');
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1500)); const errors = [];
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  try {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
    const page = await ctx.newPage(); page.setDefaultTimeout(30000);
    page.on('pageerror', e => errors.push(String(e))); page.on('console', m => m.type() === 'error' && errors.push(m.text()));
    await page.goto(BASE + '?x=' + Date.now());
    // v178: the course (from the course search) carries the tee's rating / slope, so the one-pager shows them and the differential
    R.courseId = 'c-arcade'; R.tee = R.tee || 'Blue';
    const CRS = [{ id: 'c-arcade', name: R.course, pars: R.holes.map(h => h.par), tees: [{ name: R.tee, yards: R.holes.map(() => 0), rt: [{ g: 'M', rating: 71.4, slope: 128 }, { g: 'F', rating: 76.9, slope: 136 }] }] }];
    await page.evaluate(([r, c]) => { localStorage.clear(); localStorage.setItem('golfsg.player.v1', 'Scott'); localStorage.setItem('golfsg.nameasked.v1', '1'); localStorage.setItem('golfsg.rounds.v1', JSON.stringify([r])); localStorage.setItem('golfsg.courses.v1', JSON.stringify(c)); }, [R, CRS]);
    await page.reload(); await page.waitForSelector('#home');
    // record what the share sheet would get
    await page.evaluate(() => { window.__shared = null; navigator.canShare = () => true; navigator.share = d => { window.__shared = d.files.map(f => ({ name: f.name, type: f.type, size: f.size })); return Promise.resolve(); }; });
    await page.evaluate(() => document.querySelector('[data-act="open"][data-id="arc78"]') || null);
    if (await page.$('#plusbtn')) await page.click('#plusbtn');
    await page.click('[data-act="history"]'); await page.click('#histlist [data-act="open"][data-id="arc78"]');
    await page.waitForSelector('#storybtn'); assert.match(await page.textContent('#storybtn'), /Instagram \/ TikTok/);
    // v179: the story picture sits beside the PDF report at the top; the benchmark note is behind the ⓘ
    assert.deepStrictEqual(await page.$$eval('#rsactions .rsbtns > button', e => e.map(b => b.id)), ['rspdftop', 'storybtn']);
    assert.ok(await page.$('#tip-sumblnote[hidden]'), 'note hidden'); await page.click('#sumblrow .tipbtn'); assert.ok(await page.$('#tip-sumblnote:not([hidden])'), 'ⓘ shows it');
    await page.click('#sumblrow .tipbtn'); await page.screenshot({ path: OUT + 'round-top.png' });
    ok('Round stats has "Share to Instagram / TikTok"');
    await page.click('#storybtn'); await page.waitForSelector('#storyprev');
    const img = await page.evaluate(() => new Promise(r => { const i = document.getElementById('storyprev'); const go = () => r([i.naturalWidth, i.naturalHeight]); i.complete ? go() : (i.onload = go); }));
    assert.deepStrictEqual(img, [1080, 1920], 'story size'); ok('preview is a 1080 x 1920 picture');
    await page.locator('#storysheet').screenshot({ path: OUT + 'story-sheet.png' });
    const png = await page.evaluate(() => new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(window.__golf.lastStory.blob); }));
    fs.writeFileSync(OUT + 'story-arcade.png', Buffer.from(png.split(',')[1], 'base64'));
    // v132 full screen: ⤢ fills the screen with the picture; tap zooms to 2x (scrolls), tap again fits; ✕ closes
    await page.click('#storyexp'); await page.waitForSelector('#storyfull');
    const full = await page.evaluate(() => { const o = document.getElementById('storyfull').getBoundingClientRect(), i = document.getElementById('sfimg').getBoundingClientRect();
      return { o: [o.left, o.top, o.width, o.height], i: [i.width, i.height], noscroll: document.body.classList.contains('noscroll') }; });
    assert.deepStrictEqual(full.o, [0, 0, 390, 844], 'overlay covers the whole screen'); assert.ok(full.noscroll, 'page behind does not scroll');
    assert.ok(Math.abs(full.i[0] - 390) < 2 && full.i[1] < 844 && full.i[1] > 680, 'picture fits the screen width ' + JSON.stringify(full.i));
    await page.screenshot({ path: OUT + 'story-full.png' });
    await page.click('#sfimg', { position: { x: 300, y: 600 } });
    const z = await page.evaluate(() => { const b = document.getElementById('sfscroll'), i = document.getElementById('sfimg'); return { w: i.getBoundingClientRect().width, sl: b.scrollLeft, st: b.scrollTop, hint: document.getElementById('sfhint').textContent }; });
    assert.ok(Math.abs(z.w - 780) < 2 && z.sl > 0 && z.st > 0 && z.hint === 'Tap to fit', 'tap zooms to 2x around the tap ' + JSON.stringify(z));
    await page.screenshot({ path: OUT + 'story-full-zoom.png' });
    await page.click('#sfimg'); assert.ok(Math.abs((await page.locator('#sfimg').boundingBox()).width - 390) < 2, 'second tap fits again');
    await page.click('#sfclose'); assert.strictEqual(await page.$('#storyfull'), null); assert.ok(await page.$('#storyprev'), 'back on the preview');
    assert.ok(!(await page.evaluate(() => document.body.classList.contains('noscroll'))));
    ok('⤢ full screen, tap to zoom 2x and back, ✕ closes');
    await page.click('#storyshare'); await page.waitForFunction(() => window.__shared);
    const shared = await page.evaluate(() => window.__shared);
    assert.strictEqual(shared.length, 1); assert.strictEqual(shared[0].type, 'image/png'); assert.match(shared[0].name, /^Strokewise-.*Arcade-Creek\.png$/); assert.ok(shared[0].size > 50000);
    ok('Share picture hands the share sheet one PNG: ' + shared[0].name);
    await page.click('[data-act="storyclose"]'); assert.strictEqual(await page.$('#storysheet'), null); ok('Close removes the sheet');
    assert.deepStrictEqual(errors, [], 'no page errors'); console.log('PASS story-focused');
  } finally { await b.close(); srv.kill(); }
})().catch(e => { console.error(e); process.exit(1); });
