// v126 Putt misses: a collapsed "Putt misses" sub-menu at the bottom of the Putting category (under the SG graphs), a top-down grid around
// the hole with the 8 directions from the shot screen (count + share of misses each, made % in the middle), distance chips that match
// Strokes gained by first-putt distance (All, under 5, 5-10, 10-25, over 25 ft), the range switch, Compare (grey "all"), Selected round,
// misses with no direction counted but not drawn, explanation behind ⓘ. Takes the v126 putt-miss screenshots.
const { chromium } = require('playwright-core'); const assert = require('assert'); const { spawn } = require('child_process'); const fs = require('fs');
const PORT = 8877, BASE = 'http://127.0.0.1:' + PORT + '/', OUT = process.env.SHOTS || '/workspace/golf-app/screenshots';
const SEED = fs.readFileSync(__dirname + '/fixtures/putt-miss-rounds.js', 'utf8');
const DIR8 = ['longleft', 'long', 'longright', 'left', 'right', 'shortleft', 'short', 'shortright'];
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: '/workspace/golf-app', stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1500)); const errors = [], outside = [];
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await ctx.newPage(); page.setDefaultTimeout(30000);
  page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('request', q => { const u = new URL(q.url()); if (!/^(127\.0\.0\.1|localhost)$/.test(u.hostname) && !/^(data|blob):/.test(q.url())) outside.push(q.url()); });
  await page.goto(BASE + '?x=' + Date.now()); await page.evaluate(SEED); await page.reload(); await page.waitForSelector('#tbplus');
  const shot = async (n, el, off) => { await page.$eval(el, (e, o) => { window.scrollTo(0, 0); window.scrollTo(0, e.getBoundingClientRect().top + window.scrollY - o); }, off == null ? 64 : off);
    await page.waitForTimeout(200); await page.screenshot({ path: OUT + '/' + n }); };
  // expected numbers straight from the saved rounds (sg.js), not from the page
  const expect = (band, ids) => page.evaluate(([band, ids]) => { const R = window.__golf.rounds().filter(r => ids.includes(r.id));
    return window.SG.puttMissGrid([].concat(...R.map(r => window.SG.summarize(r).puttList)), band); }, [band, ids]);
  const shownIds = () => page.evaluate(() => window.__golf.statsData().shown.map(p => p.id));
  const allIds = () => page.evaluate(() => window.__golf.statsData().all.map(p => p.id));
  const grid = (id) => page.evaluate(id => Object.fromEntries([...document.querySelectorAll('#' + id + ' rect.stpmcell')].map(c => [c.dataset.dir,
    [+document.getElementById(id + '-' + c.dataset.dir).textContent, document.getElementById(id + '-' + c.dataset.dir + 'p').textContent]])), id);
  const pct = v => v == null ? '–' : Math.round(v) + '%';
  // v127 avg 2nd putt worked out here by hand from the saved rounds: missed 1st putts (first putt of a finished hole) that stayed on the green → the next putt's length
  const sec = (band, ids) => page.evaluate(([band, ids]) => { const R = window.__golf.rounds().filter(r => ids.includes(r.id)); const B = window.SG.FP_BANDS.find(b => b.id === band);
    const L = [].concat(...R.map(r => window.SG.summarize(r).puttList)).filter(p => p.n === 1 && !p.made && p.endLie === 'green' && p.endFt > 0 && (!B || B.test(p.ft)));
    return L.length ? (Math.round(L.reduce((t, p) => t + p.endFt, 0) / L.length * 10) / 10).toFixed(1) + ' ft' : '–'; }, [band, ids]);
  await page.click('#navbtn'); await page.click('#navmenu [data-act="stats"]'); await page.waitForSelector('#statspage');

  // 1. Putting: SG graphs on top, the Putt misses sub-menu last; closed at first, same chevron
  await page.click('#stcat-putting .stcath');
  assert.deepStrictEqual(await page.$$eval('#stcatb-putting > *', e => e.map(x => x.id)), ['st-putt', 'st-ptbrk', 'st-ptu5', 'st-ptf5', 'st-ptf10', 'st-pto25', 'st-ptmade5', 'stpm']);
  assert.strictEqual(await page.getAttribute('#stpm .stsubh', 'aria-expanded'), 'false'); assert.strictEqual(await page.$eval('#stpmb', e => e.hidden), true);
  assert.strictEqual(await page.textContent('#stpm .stsubh b'), 'Putt misses'); assert.ok(await page.$('#stpm .stsubh .stcatc'), 'chevron');
  const rot0 = await page.$eval('#stpm .stcatc', e => getComputedStyle(e).transform);
  const ids = await shownIds(), G = await expect('all', ids);
  assert.strictEqual(await page.textContent('#stpmsum'), G.misses + ' missed · most ' + { longright: 'Long right', longleft: 'Long left', long: 'Long', left: 'Left', right: 'Right', shortleft: 'Short left', short: 'Short', shortright: 'Short right' }[G.top]);
  assert.strictEqual(await page.$eval('#stpm', e => getComputedStyle(e).borderTopWidth), '1px');
  await shot('stats-putt-misses-collapsed-v127.png', '#st-ptmade5', 120);

  // 2. open: chips (All + the 4 SG first-putt bands), grid of 8 zones round the hole, numbers match sg.js
  await page.click('#stpm .stsubh'); assert.strictEqual(await page.getAttribute('#stpm .stsubh', 'aria-expanded'), 'true');
  assert.notStrictEqual(await page.$eval('#stpm .stcatc', e => getComputedStyle(e).transform), rot0, 'chevron turns');
  assert.ok(await page.isVisible('#stcatb-putting #st-ptmade5'), 'SG graphs still above');
  assert.deepStrictEqual(await page.$$eval('#stpmchips .stpmchip', e => e.map(x => [x.dataset.v, x.textContent, x.getAttribute('aria-pressed')])),
    [['all', 'All', 'true'], ['u5', 'Under 5 ft', 'false'], ['f5', '5–10 ft', 'false'], ['f10', '10–25 ft', 'false'], ['o25', 'Over 25 ft', 'false']]);
  const fp = await page.evaluate(() => window.SG.FP_BANDS.map(b => b.id)); assert.deepStrictEqual(fp, ['u5', 'f5', 'f10', 'o25'], 'same bands as SG by first-putt distance');
  assert.strictEqual(await page.$$eval('#pmallgrid rect.stpmcell', e => e.length), 8);
  assert.deepStrictEqual(Object.keys(await grid('pmallgrid')).sort(), DIR8.slice().sort());
  const g = await grid('pmallgrid'); for (const d of DIR8) assert.deepStrictEqual(g[d], [G.counts[d], pct(G.pct[d])], d);
  assert.ok(G.top && await page.$('#pmallgrid rect.stpmcell.top[data-dir="' + G.top + '"]'), 'most common miss outlined');
  assert.match(await page.textContent('#pmallgrid-made'), new RegExp(G.made + ' made\\s*' + pct(G.madePct)));
  // v127: count line = n · made · avg 2nd putt + a small ⓘ (no caption); the misses on the next line
  const S2 = await sec('all', ids); assert.match(S2, /^\d+\.\d ft$/); assert.ok(Math.abs(parseFloat(S2) - G.second.avg) < 0.06, 'sg.js agrees with the hand count');
  assert.strictEqual(await page.textContent('#pmalln'), 'n = ' + G.putts + ' putts · ' + G.made + ' made (' + pct(G.madePct) + ') · avg 2nd putt ' + S2 + ' i');
  assert.strictEqual(await page.textContent('#pmallmiss'), G.misses + ' missed · most common miss: Long right (' + pct(G.pct.longright) + ')');
  assert.ok(G.nodir > 0); assert.strictEqual(await page.textContent('#pmallnodir'), 'No direction: ' + G.nodir + ' misses (not drawn)');
  assert.strictEqual(DIR8.reduce((t, d) => t + G.counts[d], 0) + G.nodir, G.misses, 'every miss counted once');
  assert.match(await page.textContent('#pmallval'), new RegExp('Made ' + pct(G.madePct)));
  assert.match(await page.textContent('#pmallgrid'), /LONG · past the hole[\s\S]*SHORT · toward you/);
  // v126 colours (Scott): every box plain white with dark text (count + % only, no shading), thin grey grid lines and outline, the made box
  // green (#5cb85c, edge #2e7d32), the most common miss only a subtle 2px dark-red outline; chips / sub-menu in the standard blue / neutral look
  const C = await page.evaluate(() => { const cs = e => getComputedStyle(e);
    const cells = [...document.querySelectorAll('#pmallgrid rect.stpmcell')].map(c => ({ d: c.dataset.dir, f: cs(c).fill, op: +cs(c).fillOpacity, n: cs(c.parentNode.querySelector('.stpmn')).fill,
      p: cs(c.parentNode.querySelector('.stpmp')).fill }));
    const made = document.querySelector('#pmallgrid rect.stpmmade'), top = document.querySelectorAll('#pmallgrid rect.stpmtop');
    const paints = [...document.querySelectorAll('#stpm, #stpm *')].flatMap(e => [cs(e).fill, cs(e).stroke, cs(e).color, cs(e).backgroundColor, cs(e).borderTopColor]).filter(v => /rgb/.test(v));
    return { cells, made: [cs(made).fill, cs(made).stroke], top: [top.length, top[0] && cs(top[0]).stroke, top[0] && parseFloat(cs(top[0]).strokeWidth), top[0] && +top[0].getAttribute('x')],
      topCell: +document.querySelector('#pmallgrid rect.stpmcell.top').getAttribute('x'), line: [cs(document.querySelector('#pmallgrid .stpmline')).stroke, parseFloat(cs(document.querySelector('#pmallgrid .stpmline')).strokeWidth)],
      edge: parseFloat(cs(document.querySelector('#pmallgrid .stpmedgebox')).strokeWidth), chip: cs(document.querySelector('#stpmchips .stpmchip.sel')).backgroundColor, paints }; });
  const rgb = v => (v.match(/\d+(\.\d+)?/g) || []).slice(0, 3).map(Number), lum = c => 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2];
  C.cells.forEach(c => { assert.deepStrictEqual([c.f, c.op], ['rgb(255, 255, 255)', 1], 'plain white box ' + c.d); assert.ok(lum(rgb(c.p)) < 110 && (c.n === 'rgb(163, 173, 182)' || lum(rgb(c.n)) < 80), 'dark text ' + c.d); });
  assert.deepStrictEqual(C.made, ['rgb(92, 184, 92)', 'rgb(46, 125, 50)'], 'made box green #5cb85c, edge #2e7d32');
  assert.deepStrictEqual(C.top.slice(0, 3), [1, 'rgb(138, 28, 36)', 2], 'one subtle dark-red outline'); assert.ok(Math.abs(C.top[3] - C.topCell) < 3, 'on the most common miss');
  assert.ok(C.line[1] <= 1 && lum(rgb(C.line[0])) > 180 && C.edge <= 1, 'thin light grid lines and outline');
  assert.strictEqual(C.chip, 'rgb(59, 130, 196)', 'chip in the Stats blue');
  const loud = C.paints.map(rgb).filter(c => (c[2] > c[1] + 40 && c[0] > c[1] + 20) || (c[0] > c[1] + 80 && c[0] > c[2] + 80 && !(c[0] === 138 && c[1] === 28)));
  assert.deepStrictEqual(loud, [], 'no purple and no red shading in Putt misses');
  // explanation behind ⓘ
  assert.ok(await page.$('#pmalln .infobtn.infoin'), 'help behind the ⓘ on the count line'); assert.strictEqual(await page.$('#st-pmall .infowrap'), null, 'no visible caption');
  assert.strictEqual(await page.isVisible('#pmallhelp'), false); assert.ok(!/First putts only/.test(await page.$eval('#st-pmall', e => e.innerText)), 'explanation text not shown');
  await page.click('#pmalln .infobtn'); assert.match(await page.textContent('#pmallhelp'), /^Avg 2nd putt = average distance left for the next putt after a missed 1st putt[\s\S]*First putts only[\s\S]*toward you/);
  await page.click('#pmalln .infobtn'); assert.strictEqual(await page.isVisible('#pmallhelp'), false);
  // v127: the 4 "1st putt …" SG graphs – "Holes whose first putt was …" collapsed into the ⓘ; avg 2nd putt next to n (same band, same range)
  for (const b of ['u5', 'f5', 'f10', 'o25']) { const gid = { u5: 'ptu5', f5: 'ptf5', f10: 'ptf10', o25: 'pto25' }[b];
    assert.strictEqual(await page.isVisible('#' + gid + 'help'), false, gid + ' text collapsed'); assert.strictEqual(await page.$('#st-' + gid + ' .infowrap'), null);
    assert.ok(!/whose/.test(await page.$eval('#st-' + gid, e => e.innerText)), gid + ' no "whose" text showing');
    assert.match(await page.textContent('#' + gid + 'n'), new RegExp('^n = \\d+ putts · avg 2nd putt ' + (await sec(b, ids)).replace('.', '\\.') + ' i$'), gid + ' n line'); }
  await page.click('#ptu5n .infobtn'); assert.match(await page.textContent('#ptu5help'), /^Holes whose first putt was under 5 ft\.[\s\S]*Avg 2nd putt = /);
  await page.click('#ptu5n .infobtn'); assert.strictEqual(await page.isVisible('#ptu5help'), false);
  await shot('stats-putt-misses-open-v127.png', '#stpm', 70);

  // 3. a distance chip redraws the grid for that band only
  for (const b of ['u5', 'f5', 'f10', 'o25']) {
    await page.click('#stpmchips [data-v="' + b + '"]'); assert.strictEqual(await page.getAttribute('#stpmchips [data-v="' + b + '"]', 'aria-pressed'), 'true');
    const E = await expect(b, ids), gb = await grid('pm' + b + 'grid'); assert.strictEqual(await page.$('#pmallgrid'), null);
    for (const d of DIR8) assert.deepStrictEqual(gb[d], [E.counts[d], pct(E.pct[d])], b + ' ' + d);
    assert.match(await page.textContent('#pm' + b + 'n'), new RegExp('^n = ' + E.putts + ' putts · ' + E.made + ' made .* · avg 2nd putt ' + (await sec(b, ids)).replace('.', '\\.') + ' i$'));
    const sgN = await page.evaluate(b => window.__golf.statsData().shown.reduce((t, p) => t + p.b.putt[b].n, 0), b);
    assert.ok(sgN > 0); assert.strictEqual(sgN, E.putts, 'same putts as SG by first-putt distance ' + b);
    if (E.nodir) assert.strictEqual(await page.textContent('#pm' + b + 'nodir'), 'No direction: ' + E.nodir + ' miss' + (E.nodir === 1 ? '' : 'es') + ' (not drawn)');
  }
  await page.click('#stpmchips [data-v="f5"]'); await shot('stats-putt-misses-band-v127.png', '#stpm', 70);
  assert.match(await page.textContent('#pmf5n'), new RegExp('avg 2nd putt ' + (await sec('f5', ids)).replace('.', '\\.') + ' i$'), 'band avg 2nd putt');

  // 4. Last 5 + Compare: numbers for the last 5, grey "all x%" from all rounds; the open sub-menu and chip stay
  await page.click('#strange [data-v="5"]'); assert.strictEqual(await page.getAttribute('#stpm .stsubh', 'aria-expanded'), 'true');
  assert.strictEqual(await page.getAttribute('#stpmchips [data-v="f5"]', 'aria-pressed'), 'true');
  const ids5 = await shownIds(); assert.strictEqual(ids5.length, 5);
  if (await page.getAttribute('#stcmp', 'aria-pressed') !== 'true') await page.click('#stcmp');
  await page.click('#stpmchips [data-v="all"]');
  const G5 = await expect('all', ids5), GA = await expect('all', await allIds());
  const g5 = await grid('pmallgrid'); for (const d of DIR8) assert.deepStrictEqual(g5[d], [G5.counts[d], pct(G5.pct[d])], 'last 5 ' + d);
  const allTxt = await page.$$eval('#pmallgrid .stpmall', e => e.map(x => x.textContent)); assert.ok(allTxt.length >= 8);
  assert.ok(allTxt.includes('all ' + pct(GA.pct.longright)), 'grey all-rounds share');
  assert.match(await page.textContent('#pmallval'), new RegExp('Made ' + pct(G5.madePct) + ' · all ' + pct(GA.madePct)));
  assert.match(await page.textContent('#pmalln'), new RegExp('avg 2nd putt ' + (await sec('all', ids5)).replace('.', '\\.') + ' \\(all ' + (await sec('all', await allIds())).replace('.', '\\.') + '\\) i$'), 'last 5 + all rounds');
  await page.click('#stcmp'); assert.strictEqual(await page.$$eval('#pmallgrid .stpmall', e => e.length), 0, 'no grey without Compare');

  // 5. Selected round: one round's misses
  await page.click('#strange [data-v="sel"]'); await page.click('#strounds [data-id="c4"]');
  const G1 = await expect('all', ['c4']), g1 = await grid('pmallgrid'); for (const d of DIR8) assert.deepStrictEqual(g1[d], [G1.counts[d], pct(G1.pct[d])], 'c4 ' + d);
  assert.match(await page.textContent('#pmalln'), new RegExp('^n = ' + G1.putts + ' putts · .* · avg 2nd putt ' + (await sec('all', ['c4'])).replace('.', '\\.')));

  // 6. leaving Stats closes it again; 375 px fits; nothing heavy
  await page.click('#strange [data-v="all"]');
  for (const w of [390, 375]) { await page.setViewportSize({ width: w, height: 844 }); await page.waitForTimeout(100);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no sideways scroll at ' + w); }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.click('.topbar [data-act="home"], .topbar .back'); await page.click('#navbtn'); await page.click('#navmenu [data-act="stats"]');
  await page.click('#stcat-putting .stcath'); assert.strictEqual(await page.getAttribute('#stpm .stsubh', 'aria-expanded'), 'false');

  assert.deepStrictEqual(errors, []); assert.deepStrictEqual(outside, [], 'no outside network calls');
  console.log('PUTT MISSES OK', JSON.stringify({ putts: G.putts, made: G.made, misses: G.misses, nodir: G.nodir, top: G.top })); await browser.close(); srv.kill();
})().catch(e => { console.error(e); process.exit(1); });
