const { chromium } = require('playwright-core'); const assert = require('assert'); const { spawn, execSync } = require('child_process'); const fs = require('fs');
const goHist = async p => { if (await p.$('#plusbtn')) await p.click('#plusbtn'); await p.click('[data-act="history"]'); };
const BASE = 'http://127.0.0.1:8784/', OUT = '/workspace/pdf-preview';
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', '8784', '--bind', '127.0.0.1'], { cwd: '/workspace/golf-app', stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1500)); const errors = [];
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, acceptDownloads: true });
  const page = await ctx.newPage(); page.setDefaultTimeout(120000); page.on('pageerror', e => errors.push(String(e))); page.on('dialog', d => d.accept());
  await page.goto(BASE + '?x=' + Date.now());
  await page.evaluate(() => { const R = (d, l, dir) => ({ dist: d, loc: l, dir: dir || '', pen: false }); const D = ['left', 'right', 'long', 'short', 'shortleft', 'longright'];
    const T = [['fairway', ''], ['fairway', ''], ['rough', 'left'], ['rough', 'right'], ['fairway', ''], ['sand', 'right'], ['rough', 'left'], ['fairway', '']];
    const mk = (id, day, k) => ({ v: 3, dv: 2, id, date: '2026-10-' + day + 'T17:00:00.000Z', course: 'Course ' + id, baseline: 'pga', player: 'Scott',
      holes: Array.from({ length: 18 }, (_, i) => { const t = T[(i + k) % T.length], par = i % 6 === 2 ? 3 : i % 6 === 5 ? 5 : 4, yd = par === 3 ? 160 : par === 5 ? 520 : 400;
        const rows = par === 3 ? [R(yd, 'tee'), R(10 + i, 'green', D[i % 6]), R(1, 'holed')] : [Object.assign(R(yd, 'tee'), { club: 'Driver' }), R(yd - 250 - (i % 4) * 12, t[0], t[1])].concat(par === 5 ? [R(90, 'fairway')] : []).concat([R(8 + (i * 5) % 25, 'green', D[(i + k) % 6]), R(1, 'holed')]);
        return { par, pin: 'center', finished: true, rows }; }) });
    localStorage.clear(); localStorage.setItem('golfsg.player.v1', 'Scott'); localStorage.setItem('golfsg.rounds.v1', JSON.stringify((() => { const A = mk('a', 12, 0); A.holes[0].rows[2].dir = ''; /* a GIR with no direction */ const stub = { v: 3, dv: 2, id: 'stub', date: '2026-10-15T17:00:00.000Z', course: '', baseline: 'pga', player: 'Scott', holes: Array.from({ length: 18 }, () => ({ par: 4, rows: [R('', 'tee')] })) }; return [A, mk('b', 13, 3), mk('c', 14, 5), stub]; })())); });
  await page.reload(); await goHist(page); await page.click('#histlist [data-act="open"] >> nth=0');
  await page.click('[data-act="pdf"]'); await page.waitForSelector('#pdfname', { timeout: 120000 });
  await page.evaluate(() => { delete navigator.share; delete navigator.canShare; });
  const dl = page.waitForEvent('download'); await page.click('[data-act="pdfshare"]'); const d = await dl;
  fs.mkdirSync(OUT, { recursive: true }); const f = OUT + '/report-heat.pdf'; await d.saveAs(f);
  const size = fs.statSync(f).size, pages = +/Pages:\s+(\d+)/.exec(execSync('pdfinfo ' + f).toString())[1];
  const txt = execSync('pdftotext -layout ' + f + ' -').toString().split('\f');
  const pT = txt.findIndex(t => t.includes('Tee shots - all rounds')), pG = txt.findIndex(t => t.includes('GIR - all rounds'));
  assert.ok(pT > 0 && pG > 0, 'heat pages present'); console.log('pages', pages, 'size', size, 'tee page', pT + 1, 'gir page', pG + 1);
  assert.match(txt[pT], /Driver - avg \d+ yd/); assert.match(txt[pT], /Longest \d+ yd/); assert.match(txt[pT], /Left/); assert.match(txt[pT], /Fairway/); assert.match(txt[pT], /Right/);
  assert.match(txt[pT], /Red = the most shots/); assert.match(txt[pT], /layups left out/);
  assert.match(txt[pG], /Average proximity: \d+ ft/); assert.ok(!/Average finish/.test(txt[pG]));
  // header count = GIRs in saved rounds; summary count + no-direction note add up to it
  const hdr = +txt[pG].match(/(\d+) greens in regulation in (\d+) rounds/)[1], rr = +txt[pG].match(/in (\d+) rounds/)[1]; assert.strictEqual(rr, 3, 'stub round not counted');
  const shots = +txt[pG].match(/· (\d+) shots/)[1]; assert.strictEqual(shots, hdr, 'GIR count matches ' + hdr + ' vs ' + shots); assert.match(txt[pG].replace(/\s+/g, ' '), /\+ 1 GIR with no direction entered/); assert.match(txt[pG], /Red = the most shots/);
  assert.ok(size < 1500000, 'email-friendly size ' + size);
  execSync(`pdftoppm -png -r 80 -f ${pT + 1} -l ${pT + 1} -singlefile ${f} ${OUT}/pdf-tee-heat`); execSync(`pdftoppm -png -r 80 -f ${pG + 1} -l ${pG + 1} -singlefile ${f} ${OUT}/pdf-gir-heat`);
  assert.deepStrictEqual(errors, []); console.log('PDFHEAT OK'); await b.close(); srv.kill();
})().catch(e => { console.error(e); process.exit(1); });
