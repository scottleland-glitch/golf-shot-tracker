const { chromium } = require('playwright-core'); const assert = require('assert'); const { spawn, execSync } = require('child_process'); const fs = require('fs');
const BASE = process.env.BASE_URL || 'http://127.0.0.1:8766/', OUT = process.env.SHOTS || '/tmp/pdf-v25';
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = process.env.NO_SERVER ? null : spawn('python3', ['-m', 'http.server', '8766', '--bind', '127.0.0.1'], { cwd: '/workspace/golf-app', stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1500)); const errors = [];
  const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, acceptDownloads: true });
  const page = await ctx.newPage(); page.setDefaultTimeout(120000); page.on('pageerror', e => errors.push(String(e))); page.on('dialog', d => d.accept());
  await page.goto(BASE + '?x=' + Date.now());
  await page.evaluate(() => {
    const R = (dist, loc, dir) => ({ dist, loc, dir: dir || '', pen: false });
    const pins = ['backleft', 'center', 'frontright', 'backleft', 'center', 'midleft'];
    const holes = [];
    for (let i = 0; i < 18; i++) {
      const p = [4, 3, 5][i % 3], pin = pins[i % 6];
      const rows = p === 3 ? [R(165 + i, 'tee', i % 2 ? 'short' : '')] : [R(390 + i, 'tee', i % 4 ? 'left' : ''), R(60 + i * 8, i % 4 ? 'rough' : 'fairway', i % 2 ? 'right' : '')];
      if (p === 5) rows.splice(1, 0, R(250, 'fairway'));
      if (i % 2) rows.push(R(12, ['bunker', 'rough', 'trees', 'deep', 'hazard'][(i >> 1) % 5], i % 6 === 1 ? 'short' : 'left'), R(6, 'green', 'left'), R(2, 'holed', 'right')); else rows.push(R(18, 'green', 'longleft'), R(3, 'holed', 'right'));
      holes.push({ par: p, pin, finished: true, rows });
    }
    localStorage.setItem('golfsg.player.v1', 'Scott');
    localStorage.setItem('golfsg.rounds.v1', JSON.stringify([{ v: 3, dv: 2, id: 'rpdf', date: '2026-10-09T14:00:00.000Z', course: 'Lakeridge', baseline: 'pga', player: 'Scott', holes }]));
  });
  await page.reload();
  await page.click('[data-act="history"]'); await page.click('#histlist [data-act="open"][data-id="rpdf"]');
  const lbls = await page.evaluate(() => { const d = document.createElement('div'); d.innerHTML = window.__golf.pinSVG(); return [...d.querySelectorAll('.pminilbl')].map(t => t.textContent); });
  assert.ok(lbls.length >= 3, lbls); lbls.forEach(t => assert.match(t, /^(\? )?[\d.]+ yd( ›)? (Bunker|Rough|Trees|Deep rough|Hazard|Fairway|Green)$|^OB$/, 'label ' + t));
  console.log('pin labels', [...new Set(lbls)]);
  await page.click('[data-act="pdf"]'); await page.waitForSelector('#pdfname', { timeout: 120000 });
  assert.match(await page.textContent('#pdfname'), /golf-report-scott-2026-10-09\.pdf · \d+ pages/);
  await page.screenshot({ path: OUT + '/app-pdf-ready.png' });
  const dl = page.waitForEvent('download'); await page.click('[data-act="pdfshare"]'); const d = await dl;
  assert.strictEqual(d.suggestedFilename(), 'golf-report-scott-2026-10-09.pdf');
  const f = OUT + '/report.pdf'; await d.saveAs(f);
  const info = execSync('pdfinfo ' + f).toString(); const pages = +/Pages:\s+(\d+)/.exec(info)[1];
  assert.ok(/Page size:\s+612 x 792/.test(info), info); const groups = await page.evaluate(() => { const S = SG.summarize(window.__golf.rounds()[0], 'pga'); return SG.REPORT_GROUPS.filter(g => S.proxList.some(m => SG.reportGroup(m.from) === g.id)).map(g => g.name.replace('\u2013', '-')); });
  assert.ok(groups.length >= 2, groups); assert.strictEqual(pages, 8 + groups.length, info + groups);
  const txt = execSync('pdftotext -layout ' + f + ' -').toString();
  ['Round report', 'Scott', 'Lakeridge', 'Front 9', 'Back 9', 'Key stats', 'Greens in regulation', 'By category', 'By distance', 'Avg to pin after', 'vs every baseline',
    'Tee shots - fairways', 'Approach misses', 'Pin location', 'Back left', 'Misses by direction', 'All approach groups this round', 'Misses by direction', 'Lie', 'Putting - 1st putts', 'Putting - 2nd putts', ].forEach(s => assert.ok(txt.includes(s), 'missing ' + s));
  groups.forEach(g => assert.ok(txt.includes('Proximity - ' + g), 'missing page ' + g)); assert.ok(txt.includes('Page ' + pages + ' of ' + pages));
  const absent = ['20-60 yd', '60-100 yd', '100-130 yd', '130-160 yd', '160-200 yd', '200+ yd'].filter(g => !groups.includes(g)); absent.forEach(g => assert.ok(!txt.includes('Proximity - ' + g), 'empty group page ' + g));
  console.log('groups', groups, 'skipped', absent);
  assert.ok(!txt.includes('Front left'), 'empty pin segments skipped');
  execSync(`pdftoppm -png -r 80 ${f} ${OUT}/page`);
  assert.deepStrictEqual(errors, []);
  console.log('PDF OK', pages, 'pages'); await browser.close(); if (srv) srv.kill();
})().catch(e => { console.error(e); process.exit(1); });
