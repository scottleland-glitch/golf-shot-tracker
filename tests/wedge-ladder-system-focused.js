// v228 Wedge matrix: Yardages | Clock | Ladder switch, ladder grid (P1/P2/P3/Full)
// with hinge / ball / lean per cell, reload persistence, backup → restore, and
// the scoring-page dropdown ("56° · P2 · 62 yd" + setup line).
const { chromium } = require('playwright-core'); const assert = require('assert'); const { spawn } = require('child_process');
const path = require('path'), fs = require('fs'), os = require('os');
const W = require('../wedges.js'), SG = require('../sg.js');
const ROOT = path.join(__dirname, '..'), PORT = 8965, BASE = 'http://127.0.0.1:' + PORT + '/';

{
  const old = W.norm({ v: 2, rows: { 70: { club: '54' }, 75: { club: '56' } } });
  assert.deepStrictEqual(old, { v: 3, rows: { 70: { club: '54' }, 75: { club: '56' } }, low: {} }, 'old charts still load with no ladder key');
  assert.strictEqual(W.count(old), 2);
  assert.ok(!W.hasLadder(old));
  assert.ok(!W.hasClock(old));

  const L = W.ensureLadder(W.blank(), ['PW', '54', '56', '58']);
  L.mode = 'ladder';
  L.ladder.rows[1].cells['56'] = { y: 62, hinge: '90', ball: 'middle', lean: '1-2' };
  L.ladder.rows[0].cells['58'] = { y: 32, hinge: '45', ball: 'back', lean: '0' };
  L.updated = '2026-11-17T15:00:00.000Z';
  const n = W.norm(L);
  assert.strictEqual(n.mode, 'ladder');
  assert.deepStrictEqual(n.ladder.rows[1].cells['56'], { y: 62, hinge: '90', ball: 'middle', lean: '1-2' });
  assert.strictEqual(W.ladSetup(n.ladder.rows[1].cells['56']), '90° · Mid · 1–2°');
  assert.deepStrictEqual(W.ladEntries(n).map(W.ladLabel), ['58° · P1 · 32 yd', '56° · P2 · 62 yd']);
  assert.strictEqual(W.ladderClock('P1'), '7:30');
  assert.strictEqual(W.ladderClock('P2'), '9:00');
  assert.strictEqual(W.ladderClock('P3'), '10:30');
  assert.strictEqual(W.ladderClock('Full'), 'Full');

  // a clock-only chart is unchanged; ladder data rides along when both are present
  const both = W.norm({ mode: 'ladder', updated: '2026-11-17T15:00:00.000Z', clock: { clubs: ['PW'], rows: [{ label: '9:00', yd: { PW: 80 } }] }, ladder: n.ladder });
  assert.strictEqual(both.mode, 'ladder');
  assert.strictEqual(both.clock.rows[0].yd.PW, 80);
  assert.strictEqual(both.ladder.rows[1].cells['56'].y, 62);

  const bk = SG.makeBackup([], null, 'Scott', [], null, n);
  assert.ok(bk.wedges && bk.wedges.ladder, 'ladder-only chart is backed up');
  const pb = SG.parseBackup(JSON.stringify(bk));
  assert.strictEqual(pb.wedges.ladder.rows[1].cells['56'].y, 62);
  assert.strictEqual(W.mergeWedges(W.blank(), n).changed, true);
  assert.strictEqual(W.mergeWedges(n, W.blank()).changed, false);
  const older = W.norm({ mode: 'ladder', updated: '2026-11-16T00:00:00.000Z', ladder: { clubs: ['PW'], rows: [{ label: 'P1', cells: { PW: { y: 1 } } }] } });
  assert.strictEqual(W.mergeWedges(n, older).changed, false, 'older ladder backup does not replace');
  // clock-mode charts still merge and do not drop a coexisting ladder
  const clockKeep = W.mergeWedges(both, W.norm({ mode: 'clock', updated: '2026-11-16T00:00:00.000Z', clock: { clubs: ['PW'], rows: [{ label: '9:00', yd: { PW: 1 } }] } }));
  assert.strictEqual(clockKeep.changed, false);
  assert.ok(both.ladder && both.ladder.rows[1].cells['56']);
  console.log('  ladder data / backup ok');
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
    await P.click('#segwedges'); await P.waitForSelector('#wlist');
    assert.deepStrictEqual(await P.$$eval('#wmode button', e => e.map(x => x.textContent + (x.classList.contains('on') ? '*' : ''))), ['Yardages*', 'Clock', 'Ladder']);
    console.log('  three-way switch opens on Yardages');

    await P.click('#wmode [data-k="ladder"]'); await P.waitForSelector('#wladder');
    assert.strictEqual(await P.$('#wlist'), null);
    assert.strictEqual(await P.$('#wclock'), null);
    assert.deepStrictEqual(await P.$$eval('#wladtable thead th', e => e.map(x => x.textContent.replace('×', '').trim()).filter(Boolean)), ['PW', '50°', '54°', '58°']);
    assert.deepStrictEqual(await P.$$eval('#wladtable tbody tr .wladpos', e => e.map(x => x.textContent.trim())), ['P1', 'P2', 'P3', 'Full']);
    assert.deepStrictEqual(await P.$$eval('#wladtable tbody tr .wladclk', e => e.map(x => x.textContent.trim())), ['7:30', '9:00', '10:30']);
    console.log('  Ladder view: default PW / 50 / 54 / 58 × P1–P3 + Full, with clock sublabels');

    await P.click('#wedit'); await P.waitForSelector('.wladtap');
    await P.fill('#wladaddc', '56');
    await P.click('[data-v="ladaddclub"]');
    await P.waitForSelector('.wladtap[data-c="56"]');
    await P.click('.wladtap[data-i="1"][data-c="56"]');
    await P.waitForSelector('#wladpick');
    assert.ok(await P.$('#wladyd'), 'cell card opens with yards input');
    await P.fill('#wladyd', '62');
    await P.click('#wladpick [data-v="ladset"][data-f="hinge"][data-k="90"]');
    await P.waitForSelector('#wladpick [data-v="ladset"][data-f="hinge"][data-k="90"].on');
    await P.click('#wladpick [data-v="ladset"][data-f="ball"][data-k="middle"]');
    await P.click('#wladpick [data-v="ladset"][data-f="lean"][data-k="1-2"]');
    await P.click('#wladpick [data-v="ladpickdone"]');
    await P.waitForSelector('#wladpick', { state: 'detached' });

    await P.click('.wladtap[data-i="0"][data-c="58"]');
    await P.waitForSelector('#wladpick');
    await P.fill('#wladyd', '32');
    await P.click('#wladpick [data-v="ladset"][data-f="hinge"][data-k="45"]');
    await P.click('#wladpick [data-v="ladset"][data-f="ball"][data-k="back"]');
    await P.click('#wladpick [data-v="ladset"][data-f="lean"][data-k="0"]');
    await P.click('#wladpick [data-v="ladpickdone"]');
    await P.waitForSelector('#wladpick', { state: 'detached' });
    await P.click('#wedit'); // done editing

    const saved = await P.evaluate(() => JSON.parse(localStorage.getItem('golfsg.wedges.v1')));
    assert.strictEqual(saved.mode, 'ladder');
    assert.deepStrictEqual(saved.ladder.rows[1].cells['56'], { y: 62, hinge: '90', ball: 'middle', lean: '1-2' });
    assert.deepStrictEqual(saved.ladder.rows[0].cells['58'], { y: 32, hinge: '45', ball: 'back', lean: '0' });
    console.log('  cell card saves yards, hinge, ball, lean');

    await P.reload(); await P.waitForSelector('#app > *');
    if (await P.$('#navbtn')) await P.click('#navbtn');
    await P.click('#navmenu [data-act="bag"]'); await P.click('#segwedges'); await P.waitForSelector('#wladder');
    assert.strictEqual(await P.$('#wmode [data-k="ladder"].on') ? 'ladder' : 'other', 'ladder', 'mode persists after reload');
    const cells = await P.$$eval('#wladtable tbody tr', rows => rows.map(r => [...r.querySelectorAll('td')].map(td => ({
      y: (td.querySelector('.wlady') || td).textContent.trim().split('\n')[0].trim(),
      setup: ((td.querySelector('.wladsetup') || {}).textContent || '').trim()
    }))));
    // clubs: PW, 50, 54, 58, 56  (56 was added last)
    const by = (row, clubIdx) => cells[row][clubIdx];
    assert.strictEqual(by(1, 4).y, '62');
    assert.strictEqual(by(1, 4).setup, '90° · Mid · 1–2°');
    assert.strictEqual(by(0, 3).y, '32');
    assert.strictEqual(by(0, 3).setup, '45° · Back · 0°');
    console.log('  reload keeps ladder mode, yards, and the setup line');

    const json = await P.evaluate(() => JSON.stringify(SG.makeBackup([], null, 'Scott', [], null, JSON.parse(localStorage.getItem('golfsg.wedges.v1') || 'null'), [], [])));
    const file = path.join(os.tmpdir(), 'golf-wedges-ladder-test.json'); fs.writeFileSync(file, json);
    await P.evaluate(() => { localStorage.removeItem('golfsg.wedges.v1'); });
    await P.reload(); await P.waitForSelector('#app > *');
    if (await P.$('#navbtn')) await P.click('#navbtn');
    await P.click('#navmenu [data-act="archive"]'); await P.waitForSelector('#restorefile', { state: 'attached' });
    await P.setInputFiles('#restorefile', file);
    await P.waitForSelector('#rpgo', { timeout: 5000 });
    assert.match(await P.textContent('#rpwedges'), /Wedge matrix \(2 ladder carries\)/);
    await P.click('#rpgo'); await P.waitForTimeout(500);
    const st = await P.evaluate(() => JSON.parse(localStorage.getItem('golfsg.wedges.v1') || 'null'));
    assert.strictEqual(st.mode, 'ladder');
    assert.deepStrictEqual(st.ladder.rows[1].cells['56'], { y: 62, hinge: '90', ball: 'middle', lean: '1-2' });
    assert.deepStrictEqual(st.ladder.rows[0].cells['58'], { y: 32, hinge: '45', ball: 'back', lean: '0' });
    console.log('  backup → restore keeps ladder data');

    // scoring-page dropdown (yardage High/Low data is present but must stay hidden in Ladder mode)
    st.rows = { 50: { club: '58', ball: 'front', pos: 'p1' }, 70: { club: '54', ball: 'middle', pos: 'p2' } };
    st.low = { 60: { club: '58', ball: 'back', pos: 'p1' } };
    await P.evaluate(wedges => {
      const R = (d, l, x) => Object.assign({ dist: d, loc: l, dir: '', pen: false }, x || {});
      const holes = Array.from({ length: 18 }, () => ({ par: 4, rows: [R('', 'tee')] }));
      holes[0] = { par: 4, rows: [R(380, 'tee', { club: 'Driver' }), R(62, 'fairway'), R(12, 'green'), R(2, 'holed')] };
      localStorage.setItem('golfsg.rounds.v1', JSON.stringify([{ v: 3, dv: 2, id: 'rlad', date: '2026-11-17T15:00:00.000Z', course: 'Ladder test', baseline: 'pga', player: 'Scott', holes }]));
      localStorage.setItem('golfsg.current.v1', 'rlad');
      localStorage.setItem('golfsg.wedges.v1', JSON.stringify(wedges));
    }, st);
    await P.reload(); await P.waitForSelector('#app > *');
    await P.click('[data-act="resume"]');
    await P.waitForSelector('select[data-f="loc"]');
    // v115: tap the tight line for shot 2 (the 62 yd approach)
    if (await P.$('.tline[data-k="1"]')) {
      await P.click('.tline[data-k="1"]');
      await P.waitForSelector('select[data-f="wladder"][data-k="1"]');
    }
    const opts = await P.$$eval('select[data-f="wladder"][data-k="1"] option', o => o.map(x => x.textContent));
    const groups = await P.$$eval('select[data-f="wladder"][data-k="1"] optgroup', g => g.map(x => x.label));
    assert.deepStrictEqual(groups, ['Ladder'], 'High/Low yardage groups hidden in Ladder mode, got ' + JSON.stringify(groups));
    assert.ok(!opts.some(x => /High|Low/.test(x)), 'no High/Low option text, got ' + JSON.stringify(opts));
    assert.ok(opts.includes('56° · P2 · 62 yd'), 'dropdown lists 56° · P2 · 62 yd, got ' + JSON.stringify(opts));
    const pickVal = await P.$$eval('select[data-f="wladder"][data-k="1"] option', o => {
      const hit = o.find(x => x.textContent === '56° · P2 · 62 yd');
      return hit ? hit.value : null;
    });
    await P.selectOption('select[data-f="wladder"][data-k="1"]', pickVal);
    await P.waitForSelector('#wladet-lad');
    assert.match(await P.textContent('#wladet-lad'), /56°/);
    assert.match(await P.textContent('#wladet-lad'), /P2/);
    assert.match(await P.textContent('#wladet-lad'), /62 yd/);
    assert.match(await P.textContent('#wladet-lad'), /90° · Mid · 1–2°/);
    const shot = await P.evaluate(() => JSON.parse(localStorage.getItem('golfsg.rounds.v1'))[0].holes[0].rows[1]);
    assert.strictEqual(shot.club, '56');
    assert.strictEqual(shot.wedgeY, 62);
    assert.strictEqual(shot.wedgeLad, 'P2');
    console.log('  scoring dropdown shows 56° · P2 · 62 yd with 90° · Mid · 1–2°; High/Low hidden');

    assert.deepStrictEqual(errors, []);
    console.log('wedge-ladder-system-focused: all passed');
  } finally { await b.close(); srv.kill(); }
})().catch(e => { console.error(e); process.exit(1); });
