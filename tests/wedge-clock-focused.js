// v227 Wedge matrix: the My Bag tab name, Yardages | Clock switch, clock table entry,
// reload persistence, and backup → restore of clock data.
const { chromium } = require('playwright-core'); const assert = require('assert'); const { spawn } = require('child_process');
const path = require('path'), fs = require('fs'), os = require('os');
const W = require('../wedges.js'), SG = require('../sg.js');
const ROOT = path.join(__dirname, '..'), PORT = 8963, BASE = 'http://127.0.0.1:' + PORT + '/';

{
  const old = W.norm({ v: 2, rows: { 70: { club: '54' }, 75: { club: '56' } } });
  assert.deepStrictEqual(old, { v: 3, rows: { 70: { club: '54' }, 75: { club: '56' } }, low: {} }, 'old charts still load with no clock key');
  assert.strictEqual(W.count(old), 2);
  assert.ok(!W.hasClock(old));
  const c = W.ensureClock(W.blank(), ['PW', '50', '54', '58']);
  c.mode = 'clock';
  c.clock.rows[1].yd['54'] = 72;
  c.clock.rows[0].yd['58'] = 35;
  c.updated = '2026-11-17T06:00:00.000Z';
  const n = W.norm(c);
  assert.strictEqual(n.mode, 'clock');
  assert.strictEqual(n.clock.rows[1].yd['54'], 72);
  assert.deepStrictEqual(W.clockEntries(n).map(W.clockLabel), ['58° · 7:30 · 35 yd', '54° · 9:00 · 72 yd']);
  const bk = SG.makeBackup([], null, 'Scott', [], null, n);
  assert.ok(bk.wedges && bk.wedges.clock, 'clock-only chart is backed up');
  const pb = SG.parseBackup(JSON.stringify(bk));
  assert.strictEqual(pb.wedges.clock.rows[1].yd['54'], 72);
  assert.strictEqual(W.mergeWedges(W.blank(), n).changed, true);
  assert.strictEqual(W.mergeWedges(n, W.blank()).changed, false);
  const older = W.norm({ mode: 'clock', updated: '2026-11-16T00:00:00.000Z', clock: { clubs: ['PW'], rows: [{ label: '9:00', yd: { PW: 1 } }] } });
  assert.strictEqual(W.mergeWedges(n, older).changed, false, 'older clock backup does not replace');
  console.log('  clock data / backup ok');
}

(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1500));
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  try {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
    const P = await ctx.newPage(); const errors = [];
    P.on('pageerror', e => errors.push(String(e)));
    P.on('console', m => m.type() === 'error' && !/favicon/.test(m.text()) && errors.push('console: ' + m.text()));
    P.on('dialog', d => d.accept());
    await P.goto(BASE);
    await P.evaluate(() => {
      localStorage.clear();
      localStorage.setItem('golfsg.player.v1', 'Scott');
      localStorage.setItem('golfsg.nameasked.v1', '1');
      localStorage.setItem('golfsg.role.v1', 'play');
    });
    await P.reload(); await P.waitForSelector('#app > *');
    if (await P.$('#navbtn')) await P.click('#navbtn');
    await P.click('#navmenu [data-act="bag"]'); await P.waitForSelector('#bagseg');
    const seg = () => P.$$eval('#bagseg button', e => e.map(x => x.textContent + (x.getAttribute('aria-selected') === 'true' ? '*' : '')));
    assert.deepStrictEqual(await seg(), ['Bag*', 'Wedge matrix']);
    await P.click('#segwedges'); await P.waitForSelector('#wlist');
    assert.deepStrictEqual(await seg(), ['Bag', 'Wedge matrix*']);
    assert.deepStrictEqual(await P.$$eval('#wmode button', e => e.map(x => x.textContent + (x.classList.contains('on') ? '*' : ''))), ['Yardages*', 'Clock', 'Ladder']);
    console.log('  tab says Wedge matrix; opens on Yardages');

    await P.click('#wmode [data-k="clock"]'); await P.waitForSelector('#wclock');
    assert.strictEqual(await P.$('#wlist'), null);
    assert.deepStrictEqual(await P.$$eval('#wclocktable thead th', e => e.map(x => x.textContent.replace('×', '').trim()).filter(Boolean)), ['PW', '50°', '54°', '58°']);
    assert.deepStrictEqual(await P.$$eval('#wclocktable tbody tr .wclklbl', e => e.map(x => x.textContent.replace('×', '').trim())), ['7:30', '9:00', '10:30', 'Full']);
    console.log('  Clock view: default PW / 50 / 54 / 58 × 7:30 / 9:00 / 10:30 / Full');

    await P.click('#wedit'); await P.waitForSelector('#wclocktable input');
    await P.fill('#wclocktable input[data-i="1"][data-c="54"]', '72');
    await P.fill('#wclocktable input[data-i="0"][data-c="58"]', '35');
    await P.click('.wclktime[data-i="1"]'); await P.waitForSelector('#wclkpick');
    assert.ok(await P.$('.wclkface'), 'clock face picker opens');
    await P.click('#wclkpick [data-v="clockset"][data-k="9:00"]');
    await P.waitForSelector('#wclkpick', { state: 'detached' });
    await P.click('#wedit'); // done editing
    const saved = await P.evaluate(() => JSON.parse(localStorage.getItem('golfsg.wedges.v1')));
    assert.strictEqual(saved.mode, 'clock');
    assert.strictEqual(saved.clock.rows[1].yd['54'], 72);
    assert.strictEqual(saved.clock.rows[0].yd['58'], 35);
    console.log('  typed cells save; picker opens and closes');

    await P.reload(); await P.waitForSelector('#app > *');
    if (await P.$('#navbtn')) await P.click('#navbtn');
    await P.click('#navmenu [data-act="bag"]'); await P.click('#segwedges'); await P.waitForSelector('#wclock');
    assert.strictEqual(await P.$('#wmode [data-k="clock"].on') ? 'clock' : 'yards', 'clock', 'mode persists after reload');
    assert.deepStrictEqual(await P.$$eval('#wclocktable tbody tr', rows => rows.map(r => [...r.querySelectorAll('td')].map(td => td.textContent.trim()))), [
      ['–', '–', '–', '35'],
      ['–', '–', '72', '–'],
      ['–', '–', '–', '–'],
      ['–', '–', '–', '–']
    ]);
    console.log('  reload keeps clock mode and the two carries');

    const json = await P.evaluate(() => JSON.stringify(SG.makeBackup([], null, 'Scott', [], null, JSON.parse(localStorage.getItem('golfsg.wedges.v1') || 'null'), [], [])));
    const file = path.join(os.tmpdir(), 'golf-wedges-clock-test.json'); fs.writeFileSync(file, json);
    await P.evaluate(() => { localStorage.removeItem('golfsg.wedges.v1'); });
    await P.reload(); await P.waitForSelector('#app > *');
    if (await P.$('#navbtn')) await P.click('#navbtn');
    await P.click('#navmenu [data-act="archive"]'); await P.waitForSelector('#restorefile', { state: 'attached' });
    await P.setInputFiles('#restorefile', file);
    await P.waitForSelector('#rpgo', { timeout: 5000 });
    assert.match(await P.textContent('#rpwedges'), /Wedge matrix \(2 clock carries\)/);
    await P.click('#rpgo'); await P.waitForTimeout(500);
    const st = await P.evaluate(() => JSON.parse(localStorage.getItem('golfsg.wedges.v1') || 'null'));
    assert.strictEqual(st.mode, 'clock');
    assert.strictEqual(st.clock.rows[1].yd['54'], 72);
    assert.strictEqual(st.clock.rows[0].yd['58'], 35);
    console.log('  backup → restore keeps clock data');

    assert.deepStrictEqual(errors, []);
    console.log('wedge-clock-focused: all passed');
  } finally { await b.close(); srv.kill(); }
})().catch(e => { console.error(e); process.exit(1); });
