// v121 Proximity page cleanup: same small, light look as Club performance. Four compact tiles, This round / All rounds switch,
// distance + lie chips 6 across (pale blue when picked), explanations behind ⓘ, and the green / lie-strip map with thin crisp
// outlines (shapes, tracers and the 40–200 distance logic unchanged). Round-page maps and Compare keep their old look.
// v124: compact controls (distance chips 9 across in 2 rows, smaller tiles); the fixture rounds use the PGA Tour baseline
// (no proximity numbers yet), so the test picks D1 women in the page's benchmark selector to check the ring.
// v122: same layout, richer colours (greens, sand, blue picked chips) and a touch bolder type (300→400, 400→500).
const { chromium } = require('playwright-core'); const assert = require('assert'); const { spawn } = require('child_process'); const fs = require('fs');
const PORT = 8871, BASE = 'http://127.0.0.1:' + PORT + '/', OUT = '/workspace/golf-app/screenshots/';
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: '/workspace/golf-app', stdio: 'ignore' }); await new Promise(r => setTimeout(r, 1500));
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] }); const errors = [], outside = [];
  try {
    const P = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })).newPage();
    P.on('pageerror', e => errors.push(String(e))); P.on('request', r => { if (!r.url().startsWith(BASE) && !r.url().startsWith('data:')) outside.push(r.url()); });
    await P.goto(BASE + '?x=' + Date.now()); const fix = fs.readFileSync(__dirname + '/fixtures/prox-rounds.js', 'utf8');
    await P.evaluate(src => { const m = { exports: {} }; new Function('module', src)(m); localStorage.clear(); localStorage.setItem('golfsg.player.v1', 'Scott'); localStorage.setItem('golfsg.rounds.v1', JSON.stringify(m.exports.all())); }, fix);
    await P.reload(); if (await P.$('#tbplus')) await P.click('#navbtn'); await P.click('[data-act="history"]'); await P.click('#histlist [data-act="open"][data-id="p1"]');
    if (!(await P.$('[data-stx="prox"].open'))) ((await P.$('[data-act="stx"][data-v="prox"]')) && await P.click('[data-act="stx"][data-v="prox"]')); await P.click('[data-stx="prox"] [data-act="map"][data-v="prox"]'); await P.waitForSelector('#proxrail');
    // page chrome = Club performance
    assert.ok(await P.$('#mapview.clubview.proxview'), 'prox page uses the compact page class');
    const head = await P.evaluate(() => { const cs = s => getComputedStyle(document.querySelector(s)); return { t: [cs('#mapview .maphead b').fontSize, cs('#mapview .maphead b').fontWeight], c: [cs('#mapview .maphead .close').fontSize, cs('#mapview .maphead .close').minHeight], s: cs('#mapview > .seg button').minHeight, bc: cs('#mapview > button.big[data-act="mapclose"]').fontWeight }; });
    assert.deepStrictEqual(head, { t: ['16px', '500'], c: ['13px', '32px'], s: '30px', bc: '400' }, JSON.stringify(head));
    console.log('✓ same header, Close buttons and small This round / All rounds switch as Club performance');
    assert.strictEqual(await P.getAttribute('#d1ring', 'data-bench'), 'pga', 'PGA Tour round: PGA Tour ring'); await P.selectOption('#proxbench', 'd1w'); await P.waitForSelector('#d1ring');
    // tiles: 4 in one row, light type
    const tiles = await P.$$eval('#proxstats .qv', qs => qs.map(q => { const r = q.getBoundingClientRect(), b = q.querySelector('b'); return [q.dataset.q, q.querySelector('.qvl').textContent, b.textContent, q.querySelector('small').textContent, Math.round(r.top), Math.round(r.height), getComputedStyle(b).fontSize, getComputedStyle(b).fontWeight]; }));
    assert.deepStrictEqual(tiles.map(t => t.slice(0, 4)), [['shots', 'Shots', '5', 'approaches'], ['gir', 'Greens hit', '5 / 5', '100%'], ['proxhit', 'Avg prox', '20 ft', 'greens hit'], ['proxall', 'Avg prox', '20 ft', 'all shots']]);
    assert.ok(tiles.every(t => t[4] === tiles[0][4] && t[5] < 80 && t[6] === '15px' && t[7] === '400'), 'one row of small tiles ' + JSON.stringify(tiles));
    console.log('✓ four small tiles in one row: 5 shots, 5 / 5 greens (100%), 20 ft / 20 ft');
    // distance chips: All + 200…40, 6 across, thin borders, pale blue when picked
    const ch = await P.$$eval('#proxrail button', bs => bs.map(x => { const r = x.getBoundingClientRect(), c = getComputedStyle(x); return [x.dataset.v, Math.round(r.top), Math.round(r.width), Math.round(r.height), c.borderTopWidth, c.backgroundColor, c.borderTopColor, x.disabled]; }));
    assert.deepStrictEqual(ch.map(c => c[0]), ['all', '200', '190', '180', '170', '160', '150', '140', '130', '120', '110', '100', '90', '80', '70', '60', '50', '40']);
    const rowsY = [...new Set(ch.map(c => c[1]))]; assert.strictEqual(rowsY.length, 2, '2 rows of 9'); rowsY.forEach(y => assert.strictEqual(ch.filter(c => c[1] === y).length, 9));
    assert.ok(ch.every(c => c[3] <= 40 && c[2] < 64 && c[4] === '1px'), 'small chips, 1px borders');
    const sel = ch.filter(c => c[0] === '150')[0]; assert.strictEqual(sel[5], 'rgba(31, 115, 201, 0.12)'); assert.strictEqual(sel[6], 'rgb(31, 115, 201)');
    assert.deepStrictEqual(ch.filter(c => c[7]).map(c => c[0]), ['190', '70', '60', '50', '40']); assert.strictEqual(await P.locator('#proxrail .ybtn').count(), 17);
    const lie = await P.$$eval('#liechips .liebtn', bs => bs.map(x => [x.dataset.v, Math.round(x.getBoundingClientRect().top), x.classList.contains('sel'), getComputedStyle(x).fontWeight]));
    assert.strictEqual(new Set(lie.map(l => l[1])).size, 1, 'lie chips in one row'); assert.deepStrictEqual(lie.filter(l => l[2]).map(l => l[0]), ['all']); assert.ok(lie.every(l => l[3] === '400'));
    console.log('✓ distance chips All + 200…40 in 2 rows of 9 (thin borders, 150 pale blue); lie chips in one row of 6');
    // explanations behind ⓘ; nothing long left on the page
    for (const k of ['proxtiles', 'proxdist', 'proxkey']) {
      assert.ok(await P.locator('#tip-' + k).isHidden(), k + ' hidden'); await P.click('[data-act="info"][data-v="' + k + '"]'); assert.ok(await P.locator('#tip-' + k).isVisible(), k + ' opens');
      if (k === 'proxkey') { await P.locator('#tip-proxkey').scrollIntoViewIfNeeded(); assert.match(await P.textContent('#d1note'), /D1 women average proximity from 150–160 yd/); await P.screenshot({ path: OUT + 'prox-key-v122.png' }); }
      await P.click('[data-act="info"][data-v="' + k + '"]'); assert.ok(await P.locator('#tip-' + k).isHidden());
    }
    assert.strictEqual(await P.locator('#mapview p.help').count(), 0, 'no long help paragraphs on the page');
    const longVis = await P.evaluate(() => [...document.querySelectorAll('#mapview p, #mapview .legend span')].filter(e => e.offsetParent && e.textContent.length > 90).map(e => e.textContent.slice(0, 40)));
    assert.deepStrictEqual(longVis, []);
    console.log('✓ explanations (numbers, distance buttons, map key + D1 note) sit behind ⓘ, closed until tapped');
    // the map: same shapes, crisp 1.5px outlines, light labels; tracers stay blue (hit) / red (miss)
    const m = await P.evaluate(() => { const s = document.getElementById('proxmap'), cs = q => getComputedStyle(s.querySelector(q)), sw = q => parseFloat(cs(q).strokeWidth);
      return { green: sw('.pgreen'), fw: sw('.lie-fw'), rough: sw('.lie-rough'), sand: sw('#lie-sand'), tee: sw('#lie-tee'), other: sw('#lie-other'), d1: sw('#d1ring .d1line'),
        gs: cs('.pgreen').stroke, gf: cs('.pgreen').fill, lt: [cs('.liet').fontSize, cs('.liet').fontWeight], dir: [cs('.pdir').fontSize, cs('.pdir').fontWeight], ring: [cs('text.ring').fontSize, cs('text.ring').fontWeight],
        tr: [...s.querySelectorAll('.tracer')].map(t => t.getAttribute('stroke')), tw: parseFloat(cs('.tracer').strokeWidth), dots: s.querySelectorAll('.xdot').length, rings: s.querySelectorAll('#proxrings circle').length }; });
    ['green', 'fw', 'rough', 'sand', 'tee', 'other', 'd1'].forEach(k => assert.strictEqual(m[k], 1.5, k + ' outline 1.5'));
    assert.notStrictEqual(m.gs, m.gf, 'green edge differs from its fill'); assert.deepStrictEqual([m.lt, m.dir, m.ring], [['9px', '600'], ['10.5px', '500'], ['9.5px', '600']]);
    assert.deepStrictEqual([m.gf, m.gs], ['rgb(92, 184, 92)', 'rgb(46, 125, 50)'], 'v122: richer green with a darker crisp edge');
    assert.deepStrictEqual(m.tr, Array(5).fill('#1e6fd9')); assert.ok(m.tw < 2.5 && m.tw >= 1.5); assert.strictEqual(m.dots, 5); assert.ok(m.rings >= 4);
    console.log('✓ map keeps the green, rings, fairway / rough / bunker / tee / other shapes with 1.5px edges; small light labels; 5 blue tracers');
    await P.locator('#mapview').evaluate(e => e.scrollTop = 0); await P.screenshot({ path: OUT + 'prox-vibrant-v122.png' });
    // rail logic unchanged: All, one distance, a lie filter
    await P.click('#proxrail [data-v="all"]'); assert.strictEqual(await P.locator('#proxmap .tracer').count(), 18); assert.match(await P.getAttribute('#proxrail .yall', 'class'), /sel/); assert.strictEqual(await P.locator('#proxauto').count(), 0);
    const reds = await P.$$eval('#proxmap .tracer', t => t.filter(e => e.getAttribute('stroke') === '#e0102a').length); assert.strictEqual(reds, 6);
    await P.click('#proxrail [data-v="180"]'); assert.strictEqual(await P.locator('#proxmap .tracer').count(), 1); assert.match(await P.textContent('#mapsum'), /^1 approach from 180 yd/);
    await P.click('#proxrail [data-v="all"]'); await P.click('#liechips [data-v="rough"]'); assert.match(await P.textContent('#mapsum'), /All 40–200 yd, Rough this round/); assert.strictEqual(await P.locator('#proxmap .tracer').count(), 5);
    await P.click('#liechips [data-v="all"]');
    console.log('✓ distance logic unchanged: All = 18 tracers (6 red misses, 1 ace), 180 = 1, Rough = 5');
    // All rounds
    await P.click('[data-act="mapscope"][data-v="all"]'); await P.waitForSelector('#proxrail'); assert.match(await P.textContent('#mapsum'), /in 2 rounds/);
    assert.strictEqual(await P.textContent('#proxstats [data-q="shots"] b'), '36'); await P.click('#proxrail [data-v="150"]');
    // (All rounds opens on Gradient, same as before v121 – its hot-spot tags are the shared heat look, left as is)
    assert.strictEqual(await P.textContent('#proxstats [data-q="shots"] b'), '10'); await P.locator('#mapview').evaluate(e => e.scrollTop = 0); await P.screenshot({ path: OUT + 'prox-all-vibrant-v122.png' });
    console.log('✓ All rounds: All stays picked (36 approaches), 10 from 150 yd');
    // shared maps untouched: the round-page GIR map and the plain proximity SVG keep their v120 look outside the Proximity page
    await P.click('[data-act="mapclose"]'); const raw = await P.evaluate(() => { const d = document.createElement('div'); d.innerHTML = window.__golf.proxSVG([], 150); document.body.appendChild(d);
      const g = getComputedStyle(d.querySelector('.pgreen')), r = [g.strokeWidth, g.fill]; d.remove(); return r; });
    assert.deepStrictEqual(raw, ['4px', 'rgb(61, 163, 61)'], 'outside the Proximity page the map keeps its old look');
    console.log('✓ outside the Proximity page (Compare, report) the map keeps its v120 look');
    assert.deepStrictEqual(errors, []); assert.deepStrictEqual(outside, []);
    console.log('✓ no page errors, no outside requests'); console.log('PASS prox-clean-focused');
  } finally { await b.close(); srv.kill(); }
})().catch(e => { console.error(e); process.exit(1); });
