// v114: New round tee list folds to the chosen tee (one row with ▾; tap to open again), even left-aligned one-line tee rows,
// and a full-height "Compare my shots against" select. Only localhost is used. iPhone 390x844 @3x. Run: node tests/tee-collapse-focused.js
const { chromium } = require('playwright-core'); const assert = require('assert'); const { spawn } = require('child_process');
const ROOT = __dirname + '/../', OUT = '/workspace/golf-app/screenshots/', PORT = 8862, BASE = 'http://localhost:' + PORT + '/';
const ok = m => console.log('  ✓ ' + m);
const PARS = [4, 4, 3, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 5];
const TEES = [['Black', 74.1, 139], ['Blue', 72.6, 135], ['White', 70.4, 128], ['Gold', 68.9, 122], ['Sage Combo 3 Women', 69.8, 121], ['Sage Combo 3 Men', 67.2, 117],
  ['Yellow Tees- Women', 66.5, 113], ['Red Tees- Women', 65.1, 110], ['Green/White Combo', 69.0, 124], ['1 feather', 63.4, 104]];
const course = (id, name, src) => Object.assign({ id, name, pars: PARS, updated: '2026-10-31T20:00:00Z',
  tees: TEES.map(([n, r, s], k) => ({ name: n, rt: [{ g: 'M', rating: r, slope: s }], yards: PARS.map((p, i) => (p === 3 ? 150 : p === 4 ? 360 : 500) + i * 3 - k * 25) })) },
  src ? { src: 'golfcore', gcId: 'sage-run', gcUrl: 'https://golfcore.org/courses/sage-run' } : {});
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1500)); const errors = [], outside = [];
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  try {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    await ctx.route('**/*', r => { const u = r.request().url(); if (u.startsWith(BASE)) return r.continue(); outside.push(u); return r.abort(); });
    const page = await ctx.newPage(); page.setDefaultTimeout(15000);
    page.on('pageerror', e => errors.push(String(e))); page.on('console', m => m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text()) && errors.push(m.text()));
    const shot = async name => { await page.evaluate(() => { const t = document.getElementById('toast'); if (t) t.className = ''; }); await page.waitForTimeout(350); await page.screenshot({ path: OUT + name + '.png' }); };
    const openNew = async () => { await page.click('#tbplus'); await page.click('[data-act="newform"]'); await page.waitForSelector('#nearbtn'); };
    const pick = async id => { await page.click('#crspick'); await page.click('[data-act="ncourse"][data-id="' + id + '"]'); await page.waitForSelector('#ntees'); };
    const rows = () => page.$$eval('#ntees .ntee:not(.naddtee)', e => e.map(x => { const r = x.getBoundingClientRect(), n = x.querySelector('.tname'), s = x.querySelector('small'), c = getComputedStyle(x);
      return { n: n.textContent, h: r.height, w: Math.round(r.width), l: Math.round(r.left), ta: c.textAlign, jc: c.justifyContent, ws: c.whiteSpace, fw: +c.fontWeight, fs: parseFloat(c.fontSize),
        nTop: Math.round(n.getBoundingClientRect().top), sTop: s ? Math.round(s.getBoundingClientRect().top) : null, nLines: Math.round(n.getBoundingClientRect().height / parseFloat(getComputedStyle(n).lineHeight || 16)),
        nH: n.getBoundingClientRect().height, sel: x.classList.contains('sel'), cut: n.scrollWidth > n.clientWidth + 1, ell: getComputedStyle(n).textOverflow }; }));
    await page.goto(BASE + '?x=' + Date.now());
    await page.evaluate(([a, c]) => { localStorage.clear(); localStorage.setItem('golfsg.player.v1', 'Scott Leland'); localStorage.setItem('golfsg.nameasked.v1', '1');
      localStorage.setItem('golfsg.courses.v1', JSON.stringify([a, c])); }, [course('sage', 'Sage Run Golf Club', true), course('rem', 'Remembered Ridge')]);
    await page.reload(); await page.waitForSelector('#home');
    // ---- 1. a course with no tee picked yet: the list is open; every row one line, left-aligned, same width
    await openNew(); await pick('sage');
    assert.strictEqual(await page.$('#nteefold'), null, 'no tee chosen yet → list open');
    let R = await rows(); assert.deepStrictEqual(R.map(r => r.n), TEES.map(t => t[0]));
    assert.ok(R.every(r => r.h <= 36), 'one-line rows ' + R.map(r => r.h));
    assert.ok(R.every(r => r.ta === 'left' && r.jc === 'flex-start' && r.ws === 'nowrap'), 'left-aligned, no wrapping');
    assert.strictEqual(new Set(R.map(r => r.w)).size, 1, 'all rows the same width ' + R.map(r => r.w)); assert.strictEqual(new Set(R.map(r => r.l)).size, 1, 'same left edge');
    assert.ok(R.every(r => r.sTop !== null && Math.abs(r.sTop - r.nTop) <= 4), 'yards / rating on the same line as the name');
    assert.ok(R.every(r => r.nH < 22), 'names never wrap ' + R.map(r => r.nH)); assert.ok(R.every(r => r.ell === 'ellipsis'), 'a long name ends in …');
    assert.ok(R.every(r => r.fw <= 400 && r.fs <= 15), 'light, small type');
    const sage = R.find(r => r.n === 'Sage Combo 3 Women'), yel = R.find(r => r.n === 'Yellow Tees- Women'); assert.ok(sage && yel && sage.w === yel.w);
    ok('no tee chosen yet: list open; ' + R.length + ' one-line, left-aligned rows of equal width (incl. "Sage Combo 3 Women", "Yellow Tees- Women"), details on the same line');
    // ---- 2. picking a tee folds the list to that tee; Start round on screen without scrolling
    await page.click('#ntees [data-v="Sage Combo 3 Women"]'); await page.waitForSelector('#nteefold');
    assert.strictEqual(await page.$$eval('#ntees .ntee', e => e.length), 1, 'one row');
    const F = await page.$eval('#nteefold', e => ({ t: e.textContent.replace(/\s+/g, ' ').trim(), x: e.getAttribute('aria-expanded'), dot: !!e.querySelector('.tdot'), car: (e.querySelector('.ncaret') || {}).textContent,
      h: e.getBoundingClientRect().height, fw: +getComputedStyle(e).fontWeight, cr: e.querySelector('.ncaret').getBoundingClientRect().right, r: e.getBoundingClientRect().right }));
    assert.match(F.t, /^Sage Combo 3 Women\s*\d,?\d{3} yd · 69\.8\/121\s*▾$/, F.t); assert.strictEqual(F.x, 'false'); assert.ok(F.dot); assert.strictEqual(F.car, '▾'); assert.ok(F.r - F.cr < 16, 'caret at the right');
    assert.ok(F.h <= 36 && F.fw <= 400, 'compact, light ' + F.h);
    for (const s of ['[data-act="naddtee"]', '#gccredit', '.nedit']) { const r = await page.$eval(s, e => e.getBoundingClientRect()); assert.ok(r.height > 0 && r.bottom <= 844, s + ' visible'); }
    const go = await page.$eval('.sheet-go', e => { const r = e.getBoundingClientRect(); return { b: r.bottom, t: r.top, st: document.getElementById('plusmenu').scrollTop, sy: window.scrollY }; });
    assert.ok(go.b <= 844 && go.st === 0 && go.sy === 0, 'Start round visible without scrolling ' + JSON.stringify(go));
    await shot('tee-collapsed-v114');
    ok('picked tee folds to one row: dot, name, yards, rating/slope, ▾ at the right; Add tee box, GolfCore credit, Rename stay; Start round at ' + Math.round(go.b) + ' px (no scroll)');
    // ---- 3. tap the row → open again (choice still marked); pick another → folds with it
    await page.click('#nteefold'); await page.waitForSelector('#ntees [data-v="Yellow Tees- Women"]');
    R = await rows(); assert.strictEqual(R.length, TEES.length); assert.deepStrictEqual(R.filter(r => r.sel).map(r => r.n), ['Sage Combo 3 Women']);
    assert.ok(await page.$('#ntees .naddtee'), 'Add tee box in the open list');
    await shot('tee-expanded-v114');
    await page.click('#ntees [data-v="Yellow Tees- Women"]'); await page.waitForSelector('#nteefold');
    assert.match(await page.textContent('#nteefold'), /^Yellow Tees- Women/);
    await page.click('#nteefold .ncaret'); await page.waitForSelector('#ntees [data-v="Blue"]'); await page.click('#ntees [data-v="Blue"]'); await page.waitForSelector('#nteefold');
    await page.click('[data-act="new"]'); await page.waitForSelector('.holecard');
    let rd = await page.evaluate(() => JSON.parse(localStorage.getItem('golfsg.rounds.v1')).slice(-1)[0]); assert.deepStrictEqual([rd.courseId, rd.tee], ['sage', 'Blue']);
    ok('tap the row (or ▾) to open the list again; picking another tee folds it again; the round starts from that tee');
    // ---- 4. a remembered tee (last round at that course) shows folded straight away
    await page.evaluate(() => { const L = JSON.parse(localStorage.getItem('golfsg.rounds.v1')); L.push({ id: 'old1', date: '2026-10-01', course: 'Remembered Ridge', courseId: 'rem', tee: 'Gold', player: 'Scott Leland', holes: [] });
      localStorage.setItem('golfsg.rounds.v1', JSON.stringify(L)); localStorage.removeItem('golfsg.current.v1'); });
    await page.goto(BASE + '?y=' + Date.now()); await page.waitForSelector('#home');
    await openNew(); await pick('rem'); await page.waitForSelector('#nteefold'); assert.match(await page.textContent('#nteefold'), /^Gold/, 'remembered tee folded');
    await page.click('#crspick'); await page.click('[data-act="ncourse"][data-id="sage"]'); await page.waitForSelector('#nteefold'); assert.match(await page.textContent('#nteefold'), /^Blue/, 'last tee at Sage Run');
    ok('remembered tee (from the last round at that course) is chosen and shown folded');
    // ---- 5. "Compare my shots against": full height, light, nothing cut off – even on a short screen with the list open
    const blq = () => page.$eval('#newbl', e => { const c = getComputedStyle(e); return { h: e.getBoundingClientRect().height, fw: +c.fontWeight, fs: parseFloat(c.fontSize), pt: parseFloat(c.paddingTop), pb: parseFloat(c.paddingBottom), v: e.options[e.selectedIndex].text }; });
    let S = await blq(); assert.ok(S.h >= 44, 'tall enough ' + S.h); assert.ok(S.fw <= 400 && S.fs >= 15 && S.fs <= 17, 'light ' + JSON.stringify(S)); assert.ok(S.h - S.pt - S.pb >= S.fs * 1.25, 'room for the text');
    const P = await page.$eval('#nplayer', e => e.getBoundingClientRect().height); assert.ok(Math.abs(S.h - P) <= 2, 'same height as the Player row ' + S.h + '/' + P);
    await shot('benchmark-select-v114');
    await page.click('#nteefold'); await page.setViewportSize({ width: 390, height: 600 }); await page.waitForTimeout(200);
    const S2 = await blq(); assert.ok(S2.h >= 44, 'not squashed on a short screen ' + S2.h);
    const hs = await page.$$eval('#plusmenu > *', e => e.filter(x => x.matches('select, .nplayer, .sheet-go, .nearbtn, .crspick')).map(x => Math.round(x.getBoundingClientRect().height))); assert.ok(hs.every(h => h >= 40), 'no squashed rows ' + hs);
    await page.setViewportSize({ width: 390, height: 844 });
    ok('"Compare my shots against" ' + S.h + ' px (≥ 44, matches Player), ' + S.fs + ' px weight ' + S.fw + ', "' + S.v + '"; stays ' + S2.h + ' px on a short screen with the list open');
    assert.deepStrictEqual(outside, [], 'nothing outside localhost'); assert.deepStrictEqual(errors, []);
    console.log('PASS tee-collapse-focused');
  } finally { await b.close(); srv.kill(); }
})().catch(e => { console.error(e); process.exit(1); });
