// v123 round-page map sheets: GIR, approach misses, tee shots, putts (1st / 2nd), 1st-putt misses / lag / all putts and pin maps get the
// same tight, vibrant look as the v122 Proximity page – Club-performance header and Close, small switches and chips, thin-bordered tiles,
// small legends (long notes behind ⓘ), richer greens with 1.5px edges, plain "Gradient" (no 🔥), light hot-spot tags. Dots, tracers,
// colours, selections and counts unchanged; Compare / PDF draw from the raw SVG and keep their look. Port 8872, fixture round-maps-rounds.js.
const { chromium } = require('playwright-core'); const assert = require('assert'); const { spawn } = require('child_process'); const fs = require('fs');
const PORT = 8872, BASE = 'http://127.0.0.1:' + PORT + '/', OUT = '/workspace/golf-app/screenshots/';
const ok = m => console.log('✓ ' + m);
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: __dirname + '/..', stdio: 'ignore' }); await new Promise(r => setTimeout(r, 1500));
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  try {
    const P = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })).newPage();
    const errs = []; P.on('pageerror', e => errs.push(String(e)));
    await P.goto(BASE + '?x=' + Date.now()); const fix = fs.readFileSync(__dirname + '/fixtures/round-maps-rounds.js', 'utf8');
    await P.evaluate(src => { const m = { exports: {} }; new Function('module', src)(m); localStorage.clear(); localStorage.setItem('golfsg.player.v1', 'Scott'); localStorage.setItem('golfsg.rounds.v1', JSON.stringify(m.exports.all())); }, fix);
    await P.reload(); if (await P.$('#plusbtn')) await P.click('#navbtn'); await P.click('[data-act="history"]'); await P.click('#histlist [data-act="open"][data-id="m1"]');
    const open = async (stx, kind) => { if (!(await P.$('[data-stx="' + stx + '"].open'))) ((await P.$('[data-act="stx"][data-v="' + stx + '"]')) && await P.click('[data-act="stx"][data-v="' + stx + '"]')); await P.click('[data-stx="' + stx + '"] [data-act="map"][data-v="' + kind + '"]'); await P.waitForSelector('#mapview'); await P.waitForTimeout(100); };
    const close = () => P.click('#mapview .maphead [data-act="mapclose"]');
    const shot = async (name, scroll) => { await P.waitForTimeout(150); await P.locator('#mapview').evaluate(e => e.scrollTop = 0); await P.screenshot({ path: OUT + 'round-after-' + name + '-v123.png' });
      if (scroll) { await P.locator('#mapview').evaluate((e, s) => e.scrollTop = s, scroll); await P.screenshot({ path: OUT + 'round-after-' + name + '-2-v123.png' }); } };
    const cs = (sel, props) => P.evaluate(([sel, props]) => { const e = document.querySelector(sel); if (!e) return null; const c = getComputedStyle(e); return props.map(p => c[p]); }, [sel, props]);
    const chrome = async kind => {
      assert.ok(await P.$('#mapview.clubview.lightmap'), kind + ': compact page class');
      const h = { t: await cs('#mapview .maphead b', ['fontSize', 'fontWeight']), c: await cs('#mapview .maphead .close', ['fontSize', 'minHeight']), s: await cs('#mapview > .seg button', ['minHeight', 'fontSize']), bc: await cs('#mapview > button.big[data-act="mapclose"]', ['fontWeight', 'minHeight']) };
      assert.deepStrictEqual(h, { t: ['16px', '500'], c: ['13px', '32px'], s: ['30px', '12.5px'], bc: ['400', '40px'] }, kind + ' header ' + JSON.stringify(h));
      const tog = await P.$$eval('#heattog button', bs => bs.map(x => x.textContent));
      if (tog.length) { assert.deepStrictEqual(tog, ['Dots', 'Gradient'], kind + ' plain Dots / Gradient'); assert.deepStrictEqual(await cs('#heattog button', ['minHeight']), ['30px']); }
      const big = await P.$$eval('#mapview *', es => es.filter(e => [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && e.getBoundingClientRect().width > 0 && !e.closest('svg')).map(e => [e.tagName, parseFloat(getComputedStyle(e).fontSize), e.textContent.trim().slice(0, 24)]).filter(x => x[1] > 16));
      assert.deepStrictEqual(big, [], kind + ': no page text over 16px');
      const leg = await cs('#mapview .legend', ['fontSize']); if (leg) assert.deepStrictEqual(leg, ['11.5px'], kind + ' small legend');
    };
    // GIR
    await open('gir', 'gir'); await chrome('gir');
    const g = await P.evaluate(() => { const s = document.getElementById('girmap'), c = q => getComputedStyle(s.querySelector(q)); return { gf: c('[fill="#3da33d"]').fill, gs: c('[fill="#3da33d"]').stroke, gw: c('[fill="#3da33d"]').strokeWidth,
      dots: s.querySelectorAll('.gdot').length, dotAttr: s.querySelector('.gdot').getAttribute('stroke'), dotW: c('.gdot').strokeWidth, ring: [c('text.ring').fontSize, c('text.ring').fontWeight, c('text.ring').fill], far: s.querySelectorAll('.gdot[fill="#ffd23f"]').length, edge: c('text[font-weight="800"]:not(.ring)').fontSize }; });
    assert.deepStrictEqual(g, { gf: 'rgb(92, 184, 92)', gs: 'rgb(46, 125, 50)', gw: '1.5px', dots: 12, dotAttr: '#000', dotW: '1.5px', ring: ['9.5px', '600', 'rgb(255, 255, 255)'], far: 4, edge: '10.5px' }, JSON.stringify(g));
    const st = await cs('#mapview .stat-grid .stat b', ['fontSize', 'fontWeight']); if (st) assert.deepStrictEqual(st, ['15px', '400']);
    ok('GIR map: v122 green #5cb85c with a 1.5px #2e7d32 edge, 12 dots (4 far ones amber) with 1.5px outlines, ring labels 9.5px/600 white; header / Close / switches like Club performance');
    await shot('gir', 560);
    await P.click('[data-act="mapscope"][data-v="all"]'); await P.waitForSelector('#heattog .sel[data-v="grad"]');
    const tag = await P.evaluate(() => { const t = document.querySelector('#girmap .hotspot text'), r = document.querySelector('#girmap .hotspot rect'); return [getComputedStyle(t).fontSize, getComputedStyle(t).fontWeight, getComputedStyle(r).strokeWidth, document.querySelectorAll('#girmap .hotspot').length]; });
    assert.deepStrictEqual(tag.slice(0, 3), ['10px', '600', '1px']); assert.ok(tag[3] > 3);
    assert.deepStrictEqual(await cs('#heatsum', ['fontSize', 'fontWeight']), ['12.5px', '400']); assert.deepStrictEqual(await cs('#heatclus', ['fontSize']), ['11.5px']);
    ok('GIR all rounds opens on Gradient: ' + tag[3] + ' hot-spot tags 10px/600 with thin 1px red borders; average line 12.5px, Cluster slider 11.5px');
    await shot('gir-gradient', 0); await P.click('[data-act="mapscope"][data-v="round"]'); await close();
    // approach misses
    await open('miss', 'miss'); await chrome('miss');
    const m = await P.evaluate(() => { const s = document.getElementById('missmap'); return { n: [...s.querySelectorAll('.mcount text')].reduce((a, t) => a + +t.textContent, 0), dots: s.querySelectorAll('.mdot').length, cw: getComputedStyle(s.querySelector('.mcount text')).fontWeight, cf: getComputedStyle(s.querySelector('.mcount circle[fill="#000"]')).fill, sector: getComputedStyle(s.querySelector('line[stroke="#8fb486"]')).strokeWidth }; });
    assert.deepStrictEqual(m, { n: 6, dots: 6, cw: '600', cf: 'rgb(27, 39, 51)', sector: '1px' }, JSON.stringify(m)); ok('Approach misses: 6 misses, counts 12.5px/600 in slate bubbles, thin sector lines');
    await shot('miss', 560); await close();
    // tee shots
    await open('fw', 'fw'); await chrome('fw');
    const f = await P.evaluate(() => { const s = document.getElementById('fwmap'), c = q => getComputedStyle(s.querySelector(q)); return { tr: s.querySelectorAll('path.tracer').length, hit: s.querySelectorAll('path[stroke="#b6ff9e"]').length, miss: s.querySelectorAll('path[stroke="#ff4d5e"]').length,
      hc: c('path[stroke="#b6ff9e"]').stroke, mc: c('path[stroke="#ff4d5e"]').stroke, fw: [c('path[fill="#7fd16a"]').fill, c('path[fill="#7fd16a"]').strokeWidth], pct: [c('text.fwpct').fontSize, c('text.fwpct').fontWeight] }; });
    assert.deepStrictEqual(f, { tr: 14, hit: 10, miss: 4, hc: 'rgb(30, 140, 58)', mc: 'rgb(224, 49, 63)', fw: ['rgb(178, 224, 143)', '1.5px'], pct: ['16px', '600'] }, JSON.stringify(f));
    assert.match(await P.textContent('#fwcounts'), /Missed left 3/); ok('Tee shots: 14 tracers (10 green hits, 4 red misses), richer fairway with a 1.5px edge, % box 16px/600');
    await shot('fw', 640); await close();
    // putts
    await open('putt', 'putt'); await chrome('putt');
    const p = await P.evaluate(() => { const s = document.getElementById('puttmap'); return { made: s.querySelectorAll('.pdot2[fill="#000"]').length, miss: s.querySelectorAll('.pdot2[stroke="#d0312d"]').length, mc: getComputedStyle(s.querySelector('.pdot2[stroke="#d0312d"]')).stroke,
      chip: [getComputedStyle(document.querySelector('#puttbtns .pnbtn')).minHeight, getComputedStyle(document.querySelector('#puttbtns .pnbtn.sel')).borderTopColor] }; });
    assert.deepStrictEqual(p, { made: 3, miss: 15, mc: 'rgb(224, 49, 63)', chip: ['34px', 'rgb(31, 115, 201)'] }, JSON.stringify(p));
    assert.deepStrictEqual(await P.$$eval('#puttlegend span', ss => ss.slice(0, 2).map(x => x.textContent)), ['Made (black)', 'Missed (red)']);
    const note = await P.evaluate(() => { const n = [...document.querySelectorAll('p.legnote')].filter(x => /Rings every 1 ft/.test(x.textContent))[0]; return n && [n.hidden, !!document.querySelector('[aria-controls="' + n.id + '"]'), /Rings every 1 ft/.test(n.textContent)]; });
    assert.deepStrictEqual(note, [true, true, true], 'long ring note moved behind ⓘ');
    ok('Putts: 3 black made, 15 red-outlined misses; 1st / 2nd / 3rd+ are 34px chips (picked = blue border); "Rings every 1 ft…" behind ⓘ');
    await shot('putts', 600); await P.click('[data-act="puttn"][data-v="2"]'); await shot('putts-2nd', 0); await P.click('[data-act="puttn"][data-v="1"]'); await close();
    // 1st-putt misses, lag, all putts
    await open('pmiss', 'pmiss'); await chrome('pmiss'); await shot('pmiss', 600); await close();
    await open('lag', 'pmiss'); await chrome('lag'); assert.strictEqual(await P.getAttribute('#pmgroups button.sel', 'data-v'), 'lag'); await shot('lag', 600);
    assert.strictEqual(await P.$('[data-act="pmg"][data-v="all"]'), null, 'v137: no All putts'); await close();
    // pin
    await open('pin', 'pin'); await chrome('pin');
    assert.deepStrictEqual(await cs('#pinstats', ['backgroundColor']), ['rgb(92, 184, 92)']); await shot('pin', 0);
    await P.click('[data-act="pinseg"][data-v="center"]'); await P.waitForSelector('#pinmap');
    const pn = await P.evaluate(() => ({ dots: document.querySelectorAll('#pinmap .pdot').length, back: getComputedStyle(document.querySelector('button.big[data-act="pinseg"]')).minHeight }));
    assert.deepStrictEqual(pn, { dots: 4, back: '34px' }); ok('Pin: 3×3 green in the v122 green; Center has 4 dots; "‹ All pin positions" is a small 34px button');
    await shot('pin-center', 600); await close();
    // Compare / PDF draw the raw SVG text: outside the map sheet it keeps its old look
    const rawLook = await P.evaluate(() => { const d = document.createElement('div'); d.innerHTML = '<svg viewBox="0 0 10 10"><circle r="5" fill="#3da33d" stroke="#145214" stroke-width="4"/></svg>'; document.body.appendChild(d); const c = getComputedStyle(d.querySelector('circle')); const r = [c.fill, c.strokeWidth]; d.remove(); return r; });
    assert.deepStrictEqual(rawLook, ['rgb(61, 163, 61)', '4px']); ok('outside the map sheets (Compare, PDF image) the old green and 4px edge stay');
    // Proximity "50 ft" ring label outline
    await open('prox', 'prox'); assert.deepStrictEqual(await cs('#proxmap text.ring', ['stroke', 'paintOrder']), ['rgb(46, 125, 50)', 'stroke']); ok('Proximity ring labels get a thin dark-green outline (readable off the green)'); await close();
    assert.deepStrictEqual(errs, []);
    console.log('round-maps-light: all ok');
  } finally { await b.close(); srv.kill(); }
})().catch(e => { console.error('FAIL', e); process.exit(1); });
