// v118 Club performance: Quick-view style tiles by club type (Driver / woods: Fairways hit + SG; irons & hybrids: GIR + SG approach + Proximity;
// wedges: SG + shots + on green), a clean fairway diagram (left rough · fairway · right rough %), help text behind ⓘ, empty state.
const { chromium } = require('playwright-core'); const assert = require('assert'); const { spawn } = require('child_process'); const fs = require('fs');
const PORT = 8869, BASE = 'http://127.0.0.1:' + PORT + '/', OUT = '/workspace/golf-app/screenshots/';
const ok = m => console.log('OK  ' + m);
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: '/workspace/golf-app', stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1500)); const errors = [], outside = [];
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  try {
    const P = await (await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true })).newPage();
    P.setDefaultTimeout(60000); P.on('pageerror', e => errors.push(String(e))); P.on('dialog', d => d.accept());
    P.on('request', r => { const u = r.url(); if (!u.startsWith(BASE) && !u.startsWith('data:') && !u.startsWith('blob:')) outside.push(u); });
    await P.goto(BASE + '?x=' + Date.now());
    const fix = fs.readFileSync(__dirname + '/fixtures/club-driver-rounds.js', 'utf8');
    await P.evaluate(src => { const m = { exports: {} }; new Function('module', src)(m); localStorage.clear(); localStorage.setItem('golfsg.player.v1', 'Scott');
      localStorage.setItem('golfsg.rounds.v1', JSON.stringify(m.exports.all())); }, fix);
    await P.reload();
    const open = async id => { if (await P.$('[data-act="mapclose"]')) await P.click('[data-act="mapclose"]'); if (await P.$('#rsmenubtn')) await P.click('#rsmenubtn'); else if (await P.$('#navbtn')) await P.click('#navbtn'); await P.click('#rsmenu [data-act="history"], #navmenu [data-act="history"]'); await P.click('#histlist [data-act="open"][data-id="' + id + '"]');
      if (!(await P.$('[data-stx="club"].open'))) ((await P.$('[data-act="stx"][data-v="club"]')) && await P.click('[data-act="stx"][data-v="club"]')); await P.click('[data-stx="club"] [data-act="map"][data-v="club"]'); await P.waitForSelector('#mapview'); };
    const tiles = () => P.$$eval('#clubqv .qv', q => q.map(x => [x.dataset.q, x.querySelector('b').textContent.trim(), x.querySelector('small').textContent.trim(), (x.querySelector('em') || { textContent: '' }).textContent.trim()]));
    const regions = () => P.$$eval('#clubfw .cfwreg', r => r.map(x => [x.dataset.reg, +x.dataset.n, +x.dataset.pct]));
    // expected numbers straight from SG (the same lists the round's fairway map / proximity use)
    const exp = (ids, club) => P.evaluate(([ids, club]) => { const R = window.__golf.rounds().filter(r => ids.includes(r.id)); let tee = [], shots = [], appr = [];
      R.forEach(r => { tee = tee.concat(SG.summarize(r, 'pga').teeMap.filter(m => m.club === club && !m.layup));
        r.holes.forEach(h => { const a = SG.analyzeHole(h, 'pga'); a.shots.forEach(s => { if (s.club !== club) return; shots.push(s);
          if (a.appr && a.appr.shot === s.n && s.cat === 'approach' && !s.layup) appr.push({ gir: a.appr.gir, prox: a.appr.proxFt }); }); }); });
      const sg = shots.filter(s => !s.layup).reduce((t, s) => t + s.sg, 0), asg = shots.filter(s => s.cat === 'approach').reduce((t, s) => t + s.sg, 0);
      const f = v => { const x = (Math.round(v * 100) / 100).toFixed(2); return (v > 0.004 ? '+' : '') + (x === '-0.00' ? '0.00' : x); };
      const d = tee.filter(m => m.kind !== 'ob' && !m.pen && m.hit > 0).map(m => +m.hit);
      return { d, n: tee.length, hit: tee.filter(m => m.fairway).length, L: tee.filter(m => !m.fairway && m.side === 'L').length, R: tee.filter(m => !m.fairway && m.side === 'R').length,
        sg: f(sg), asg: f(asg), an: appr.length, gir: appr.filter(x => x.gir).length, prox: appr.length ? Math.round(appr.reduce((t, x) => t + x.prox, 0) / appr.length) : null }; }, [ids, club]);
    const pc = (k, n) => Math.round(100 * k / n);

    // ---------- Driver, this round ----------
    await open('cd1'); await P.click('#clubbtns [data-v="Driver"]'); await P.waitForSelector('#clubfw');
    let E = await exp(['cd1'], 'Driver'); assert.deepStrictEqual([E.n, E.hit, E.L, E.R], [5, 3, 1, 1]);
    assert.strictEqual(await P.getAttribute('#clubqv', 'data-kind'), 'driver');
    let T = await tiles(); assert.deepStrictEqual(T.map(t => t[0]), ['fw', 'sg', 'drive']);
    assert.deepStrictEqual(T[0], ['fw', '60%', '3 / 5 hit', 'L 1 · R 1']); assert.strictEqual(T[1][1], E.sg); assert.match(T[2][1], /^\d+ yd$/);
    assert.deepStrictEqual(await regions(), [['L', 1, 20], ['F', 3, 60], ['R', 1, 20]]);
    assert.deepStrictEqual(await P.$$eval('#clubfw .cfwp', t => t.map(x => x.textContent)), ['20%', '60%', '20%']); assert.strictEqual(await P.textContent('#clubfwv'), 'n = 5');
    const dist = () => P.evaluate(() => { const g = (sel, k) => { const e = document.querySelector(sel); return e ? +e.getAttribute(k) : null; };
      return { dots: document.querySelectorAll('#clubdist circle').length, q1: g('#clubdistbox', 'data-q1'), q3: g('#clubdistbox', 'data-q3'), med: g('#clubdistmed', 'data-v'), min: g('#clubdistwl', 'data-v'), max: g('#clubdistwr', 'data-v'),
        mean: g('#clubdistmean', 'data-v'), one: g('#clubdistone', 'data-v'), caps: document.querySelectorAll('#clubdist .cdcap').length, boxH: g('#clubdistbox', 'height'), sum: (document.querySelector('#clubdistsum') || {}).textContent || null,
        ticks: [...document.querySelectorAll('#clubdist .cdt')].map(t => +t.textContent), axis: (document.querySelector('#clubdist .cdax') || {}).textContent, nlab: (document.querySelector('#clubdistn') || {}).textContent }; });
    const expD = d => { const s2 = d.slice().sort((a, b) => a - b), q = p => { const i = (s2.length - 1) * p, k = Math.floor(i); return s2[k] + (s2[Math.min(k + 1, s2.length - 1)] - s2[k]) * (i - k); }, r = Math.round;
      return { q1: r(q(.25)), q3: r(q(.75)), med: r(q(.5)), min: r(s2[0]), max: r(s2[s2.length - 1]), mean: r(d.reduce((a, b) => a + b, 0) / d.length) }; };
    const pick = D => ({ q1: D.q1, q3: D.q3, med: D.med, min: D.min, max: D.max, mean: D.mean });
    let D = await dist(); assert.deepStrictEqual(E.d.slice().sort(), [240, 240, 250, 250, 255]);
    assert.deepStrictEqual(pick(D), expD(E.d)); assert.deepStrictEqual(pick(D), { q1: 240, q3: 250, med: 250, min: 240, max: 255, mean: 247 });
    assert.strictEqual(D.dots, 0, 'no per-drive dots'); assert.strictEqual(D.caps, 2); assert.ok(D.boxH >= 36 && D.boxH <= 44, 'box has volume'); assert.strictEqual(D.axis, 'Yards');
    assert.deepStrictEqual(D.ticks, [240, 245, 250, 255]); assert.strictEqual(D.sum, 'min 240 · median 250 · avg 247 · max 255 yd'); assert.strictEqual(D.nlab, 'n = 5');
    assert.strictEqual(T[2][1], '247 yd', 'Avg drive tile = graph average'); assert.strictEqual(await P.isVisible('#tip-clubdist'), false);
    await P.click('#mapview [data-act="info"][data-v="clubdist"]'); assert.match(await P.textContent('#tip-clubdist'), /same drives as the Avg drive tile[\s\S]*middle half[\s\S]*median[\s\S]*shortest and longest[\s\S]*average/); await P.click('#mapview [data-act="info"][data-v="clubdist"]');
    await P.locator('#clubdistcard').scrollIntoViewIfNeeded(); await P.locator('#mapview').evaluate(e => e.scrollTop = Math.max(0, document.querySelector('#clubqv').offsetTop - 60)); await P.screenshot({ path: OUT + 'club-driver-distance-v118.png' });
    ok('Driver box plot this round: box 240–250, median 250, whiskers 240 / 255, ◇ avg 247 (= Avg drive tile), ticks 240–255 every 5, no dots, ⓘ hidden until tapped');
    ok('Driver this round: tiles Fairways hit 60% (3 / 5, L 1 · R 1) · Strokes gained ' + E.sg + ' · Avg drive ' + T[2][1] + '; fairway picture 20% / 60% / 20%, n = 5 (same teeMap list as the fairway map)');
    // no visible explanation text; ⓘ shows / hides it
    const visibleLong = await P.$$eval('#mapview p, #mapview .legend span, #mapview .help', es => es.filter(e => e.offsetParent && !e.closest('.tippop') && e.textContent.trim().length > 70).map(e => e.textContent.trim().slice(0, 60)));
    assert.deepStrictEqual(visibleLong, [], 'no visible help paragraphs');
    const tipsHidden = await P.$$eval('#mapview .tippop', t => t.map(x => [x.id, x.hidden]));
    assert.ok(tipsHidden.length >= 3 && tipsHidden.every(t => t[1]), JSON.stringify(tipsHidden));
    await P.click('#mapview [data-act="info"][data-v="clubtiles"]'); assert.strictEqual(await P.isVisible('#tip-clubtiles'), true); assert.match(await P.textContent('#tip-clubtiles'), /par 4s and 5s/);
    assert.strictEqual(await P.getAttribute('#mapview [data-act="info"][data-v="clubtiles"]', 'aria-expanded'), 'true');
    await P.locator('#mapview').evaluate(e => e.scrollTop = 0); await P.screenshot({ path: OUT + 'club-driver-tip-v118.png' });
    await P.click('#mapview [data-act="info"][data-v="clubtiles"]'); assert.strictEqual(await P.isVisible('#tip-clubtiles'), false);
    await P.click('#mapview [data-act="info"][data-v="clubfw"]'); assert.match(await P.textContent('#tip-clubfw'), /same rule as Fairways hit/); await P.click('#mapview [data-act="info"][data-v="clubfw"]');
    assert.strictEqual(await P.isVisible('#tip-clubfw'), false); ok('help text hidden by default (' + tipsHidden.length + ' ⓘ tips); tap ⓘ shows it, tap again hides it');
    const fonts = await P.$$eval('#mapview *', es => es.filter(e => [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && !e.closest('title, .infobtn, .tippop') && e.getClientRects().length).map(e => { const c = getComputedStyle(e); return [e.tagName, +c.fontWeight, parseFloat(c.fontSize), e.textContent.trim().slice(0, 24)]; }));
    const heavy = fonts.filter(f => f[1] > 500 || f[2] > 24); assert.deepStrictEqual(heavy, [], 'light, small text'); ok('club page text weight ≤ 500, ≤ 24 px (' + fonts.length + ' text nodes)');
    await P.locator('#mapview').evaluate(e => e.scrollTop = 0); await P.screenshot({ path: OUT + 'club-driver-v118.png' });
    // all rounds
    await P.click('[data-act="mapscope"][data-v="all"]'); await P.waitForSelector('#clubfw');
    E = await exp(['cd1', 'cd2', 'cd3'], 'Driver'); T = await tiles(); assert.deepStrictEqual([E.n, E.hit, E.L, E.R], [9, 5, 2, 2]);
    assert.deepStrictEqual(T[0], ['fw', pc(5, 9) + '%', '5 / 9 hit', 'L 2 · R 2']); assert.strictEqual(T[1][1], E.sg);
    assert.deepStrictEqual(await regions(), [['L', 2, 22], ['F', 5, 56], ['R', 2, 22]]); assert.strictEqual(await P.textContent('#clubfwv'), 'n = 9');
    D = await dist(); assert.deepStrictEqual(pick(D), expD(E.d)); assert.deepStrictEqual(pick(D), { q1: 240, q3: 250, med: 250, min: 230, max: 255, mean: 245 }); assert.strictEqual(D.dots, 0);
    await P.locator('#mapview').evaluate(e => e.scrollTop = Math.max(0, document.querySelector('#clubqv').offsetTop - 60)); await P.screenshot({ path: OUT + 'club-driver-distance-all-v118.png' });
    ok('All rounds box plot (9 drives): box 240–250, median 250, whiskers 230 / 255, ◇ avg 245');
    ok('All rounds: Driver 56% (5 / 9), picture 22% / 56% / 22%, SG ' + E.sg);
    await P.click('[data-act="mapscope"][data-v="round"]'); await P.waitForSelector('#clubqv');
    // ---------- 3W (wood): fairways hit off the tee only, layup left out ----------
    await P.click('#clubbtns [data-v="3W"]'); T = await tiles(); E = await exp(['cd1'], '3W');
    assert.strictEqual(await P.getAttribute('#clubqv', 'data-kind'), 'wood'); assert.deepStrictEqual(T.map(t => t[0]), ['fw', 'sg', 'use']);
    assert.deepStrictEqual(T[0].slice(1, 3), ['100%', '1 / 1 hit']); assert.strictEqual(T[1][1], E.sg); assert.deepStrictEqual(T[2].slice(1), ['3', '2 off the tee', '1 from fairway / other']);
    assert.match(await P.textContent('#clubfwv'), /^n = 1 · 1 layup out$/); await P.locator('#mapview').evaluate(e => e.scrollTop = 0); await P.screenshot({ path: OUT + 'club-wood-v118.png' }); ok('3W: Fairways hit 100% (1 / 1 – the layup tee shot left out) · SG ' + E.sg + ' · 3 shots: 2 off the tee, 1 from fairway');
    D = await dist(); assert.deepStrictEqual([D.one, D.q1, D.min, D.max, D.mean, D.sum], [210, null, null, null, 210, '1 drive · 210 yd']); ok('3W off the tee: 1 drive = a single line + ◇, no box');
    // ---------- 7i (iron): GIR, SG approach, proximity – regulation approaches only ----------
    await P.click('#clubbtns [data-v="7i"]'); T = await tiles(); E = await exp(['cd1'], '7i');
    assert.strictEqual(await P.getAttribute('#clubqv', 'data-kind'), 'iron'); assert.deepStrictEqual([E.an, E.gir, E.prox], [4, 2, 26]);
    assert.deepStrictEqual(T, [['gir', '50%', '2 / 4 greens', 'n = 4'], ['sg', E.asg, '−0.03 per shot'.replace('−', '-').replace('-0.03', (Number(E.asg) / 4 > 0 ? '+' : '') + (Math.round(Number(E.asg) / 4 * 100) / 100).toFixed(2)), '4 shots'], ['prox', '26 ft', 'avg to the pin', 'from 151 yd avg']]);
    assert.strictEqual(await P.$('#clubfw'), null, 'no fairway picture for irons'); assert.ok(await P.$('#clubmap'), 'dispersion map kept');
    await P.locator('#mapview').evaluate(e => e.scrollTop = 0); await P.screenshot({ path: OUT + 'club-iron-v118.png' });
    ok('7i: GIR 50% (2 / 4 regulation approaches) · SG approach ' + E.asg + ' · Proximity 26 ft from 151 yd avg; dispersion map kept, no fairway picture');
    // 8i: par-3 tee shot counts as an approach (GIR rule)
    await P.click('#clubbtns [data-v="8i"]'); T = await tiles(); assert.deepStrictEqual(T[0].slice(1, 3), ['50%', '1 / 2 greens']); ok('8i: the par-3 tee shot counts as an approach – GIR 1 / 2');
    // 56 (wedge): SG + shots + on green
    await P.click('#clubbtns [data-v="56"]'); T = await tiles(); assert.strictEqual(await P.getAttribute('#clubqv', 'data-kind'), 'wedge'); assert.deepStrictEqual(T.map(t => t[0]), ['sg', 'n', 'green']);
    await P.locator('#mapview').evaluate(e => e.scrollTop = 0); await P.screenshot({ path: OUT + 'club-wedge-v118.png' }); ok('56: Strokes gained · Shots · On the green');
    // ranking table + tap a row still works
    await P.click('#clubrank tr[data-v="Driver"]'); assert.strictEqual(await P.textContent('#clubcur'), 'Driver');
    // ---------- empty state ----------
    await open('cd3'); await P.waitForSelector('#clubnone'); assert.match(await P.textContent('#clubnone'), /^No clubs entered yet this round/);
    assert.strictEqual(await P.isVisible('#tip-clubnone'), false); await P.click('#mapview [data-act="info"][data-v="clubnone"]'); assert.match(await P.textContent('#tip-clubnone'), /Pick a club under each shot/);
    await P.click('#mapview [data-act="info"][data-v="clubnone"]'); await P.locator('#mapview').evaluate(e => e.scrollTop = 0); await P.screenshot({ path: OUT + 'club-empty-v118.png' });
    ok('empty state: "No clubs entered yet this round" + ⓘ with how to add clubs');
    // ---------- 20+ drives: middle half shaded ----------
    await P.evaluate(() => { const R = (d, l, club) => Object.assign({ dist: d, loc: l, dir: '', pen: false }, club ? { club } : {}); const holes = [];
      for (let i = 0; i < 18; i++) holes.push({ par: 4, finished: true, rows: [R(420, 'tee', 'Driver'), R(420 - (200 + 5 * i), 'fairway', '9i'), R(10, 'green'), R(1, 'holed')] });
      const rs = JSON.parse(localStorage.getItem('golfsg.rounds.v1')); rs.push({ v: 3, dv: 2, id: 'cd5', date: '2026-10-26T17:00:00.000Z', course: 'Long Course', baseline: 'pga', player: 'Scott', holes });
      localStorage.setItem('golfsg.rounds.v1', JSON.stringify(rs)); });
    await P.reload(); await open('cd5'); await P.click('#clubbtns [data-v="Driver"]'); await P.click('[data-act="mapscope"][data-v="all"]'); await P.waitForSelector('#clubdist');
    E = await exp(['cd1', 'cd2', 'cd3', 'cd5'], 'Driver'); D = await dist(); assert.strictEqual(E.d.length, 27);
    const sd = E.d.slice().sort((a, b) => a - b), qq = p => { const i = (sd.length - 1) * p, k = Math.floor(i); return Math.round(sd[k] + (sd[Math.min(k + 1, sd.length - 1)] - sd[k]) * (i - k)); };
    assert.deepStrictEqual(pick(D), expD(E.d)); assert.deepStrictEqual([D.q1, D.q3], [qq(0.25), qq(0.75)]); assert.strictEqual(D.dots, 0); assert.deepStrictEqual(D.ticks, [200, 210, 220, 230, 240, 250, 260, 270, 280, 290], 'wider range = ticks every 10');
    await P.locator('#mapview').evaluate(e => e.scrollTop = Math.max(0, document.querySelector('#clubqv').offsetTop - 60)); await P.screenshot({ path: OUT + 'club-driver-distance-27-v118.png' });
    ok('All rounds with 27 drives: box ' + D.q1 + '–' + D.q3 + ', median ' + D.med + ', whiskers ' + D.min + ' / ' + D.max + ', ◇ avg ' + D.mean + ', ticks ' + D.ticks.join(' '));
    assert.deepStrictEqual(errors, []); assert.deepStrictEqual(outside, []); ok('no page errors, no outside requests');
    console.log('ALL OK club-driver-focused');
  } finally { await b.close(); srv.kill(); }
})().catch(e => { console.error(e); process.exit(1); });
