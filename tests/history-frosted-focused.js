// History page: frosted-glass style (shared .frost* classes), every feature still works. SHOT=before|after picks the file name.
const { chromium } = require('playwright-core'); const assert = require('assert'); const { spawn } = require('child_process');
const BASE = 'http://127.0.0.1:8796/', OUT = '/workspace/golf-app/screenshots/', TAG = process.env.SHOT || 'after';
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', '8796', '--bind', '127.0.0.1'], { cwd: '/workspace/golf-app', stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1500)); const errors = [];
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const page = await (await b.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage();
  page.on('pageerror', e => errors.push(String(e))); let ans = false; page.on('dialog', d => ans ? d.accept() : d.dismiss());
  await page.goto(BASE + '?x=' + Date.now());
  await page.evaluate(() => { const R = (d, l) => ({ dist: d, loc: l, dir: '', pen: false });
    const rd = (id, date, c, pl, s) => ({ v: 3, dv: 2, id, date, course: c, baseline: 'pga', player: pl, holes: Array.from({ length: 18 }, (_, i) => ({ par: 4, finished: true, rows: [R(400, 'tee'), R(150, 'fairway'), R(i % s ? 10 : 30, 'green')].concat(i % s ? [] : [R(4, 'green')]).concat([R(1, 'holed')]) })) });
    localStorage.clear(); localStorage.setItem('golfsg.player.v1', 'Scott');
    localStorage.setItem('golfsg.rounds.v1', JSON.stringify([rd('a', '2026-10-01T17:00:00Z', 'Lakeridge', 'Scott', 2), rd('b', '2026-10-08T17:00:00Z', 'Washoe County GC', 'Scott', 5), rd('c', '2026-10-11T17:00:00Z', 'Wolf Run', 'Emma', 3), rd('d', '2026-10-14T17:00:00Z', 'Lakeridge', 'Scott', 9)])); });
  await page.reload(); await page.click('#plusbtn'); await page.click('#plusmenu [data-act="history"]'); await page.waitForSelector('#histlist');
  await page.waitForTimeout(400); await page.screenshot({ path: OUT + (TAG === 'after' ? 'sky-history.png' : 'history-frosted-' + TAG + '.png') });
  if (TAG === 'before') { await b.close(); srv.kill(); return; }
  // frosted: page backdrop + shared classes on header, buttons, chips, cards, trash
  const F = await page.evaluate(() => { const cs = s => getComputedStyle(document.querySelector(s)); const q = s => document.querySelector(s);
    return { page: !!q('#app .frostpage'), bg: getComputedStyle(q('.frostpage'), '::before').backgroundImage, top: q('.topbar').classList.contains('frost'), topBlur: cs('.topbar').backdropFilter,
      home: q('.topbar [data-act="home"]').classList.contains('frostbtn'), cmp: q('#cmpopen').classList.contains('frostmain'), sky: q('.frostpage').classList.contains('theme-sky'), selBg: getComputedStyle(q('#playerchips .sel')).backgroundColor, chips: [...document.querySelectorAll('#playerchips button')].every(x => x.classList.contains('frostchip')),
      cards: [...document.querySelectorAll('#histlist .hrow .hist')].every(x => x.classList.contains('frostcard')), del: [...document.querySelectorAll('.hdel')].every(x => x.classList.contains('frostdanger')),
      cardBg: cs('.hrow .hist').backgroundColor, cardR: cs('.hrow .hist').borderRadius, cardSh: cs('.hrow .hist').boxShadow, delCol: cs('.hdel').borderColor, txt: cs('.hrow .hist b').color }; });
  assert.ok(F.page && F.sky && /linear-gradient/.test(F.bg) && !/home-bg/.test(F.bg), 'sky gradient backdrop, no photo ' + F.bg);
  assert.strictEqual(F.selBg, 'rgb(28, 28, 30)', 'near-black selected chip');
  assert.ok(F.top && /blur/.test(F.topBlur) && F.home && F.cmp && F.chips && F.cards && F.del, 'frost classes ' + JSON.stringify(F));
  assert.ok(/rgba\(2[3-5]\d, 2[3-5]\d, 2[3-5]\d, 0\.[3-8]/.test(F.cardBg) && parseFloat(F.cardR) >= 16 && F.cardSh !== 'none', 'soft translucent card ' + JSON.stringify(F));
  assert.ok(/rgba\(\d+, \d+, \d+, 0\.\d+\)/.test(F.delCol), 'muted red trash ' + F.delCol);
  const [r, g, bl] = F.txt.match(/\d+/g).map(Number); assert.ok(r + g + bl < 200, 'dark readable text ' + F.txt);
  // features: filter chips, Best vs worst, open a round, ‹ History back, delete (cancel + confirm), Home
  await page.click('#playerchips [data-v="Emma"]'); assert.deepStrictEqual(await page.$$eval('#histlist .hrow', x => x.map(e => e.dataset.id)), ['c']);
  await page.click('#playerchips [data-v=""]'); assert.deepStrictEqual(await page.$$eval('#histlist .hrow', x => x.map(e => e.dataset.id)), ['d', 'c', 'b', 'a']);
  await page.click('#cmpopen'); await page.waitForSelector('.topbar'); assert.match(await page.textContent('.topbar'), /Best vs worst/);
  await page.click('.topbar [data-act="history"]'); await page.waitForSelector('#histlist');
  await page.click('#histlist [data-act="open"][data-id="b"]'); assert.match(await page.textContent('.topbar'), /‹ History/);
  await page.click('.topbar [data-act="history"]'); await page.waitForSelector('#histlist');
  ans = false; await page.click('.hdel[data-id="a"]'); assert.strictEqual(await page.locator('#histlist .hrow').count(), 4);
  ans = true; await page.click('.hdel[data-id="a"]'); assert.strictEqual(await page.locator('#histlist .hrow').count(), 3);
  await page.click('.topbar [data-act="home"]'); await page.waitForSelector('#home');
  // Archive in the same sky look; home keeps its photo
  assert.ok(/home-bg\.webp/.test(await page.evaluate(() => getComputedStyle(document.querySelector('.home-bg')).backgroundImage)), 'home keeps the photo');
  await page.click('#archivepill'); await page.waitForSelector('#playerbox');
  const A = await page.evaluate(() => { const q = s => document.querySelector(s);
    return { sky: !!q('.frostpage.theme-sky.archivepage'), bg: getComputedStyle(q('.frostpage'), '::before').backgroundImage, top: q('.topbar').classList.contains('frost'),
      hist: getComputedStyle(q('.histbtn')).backgroundImage, btns: [...document.querySelectorAll('.archivepage [data-act="backup"], .archivepage [data-act="about"], .archivepage label.filebtn')].every(x => x.classList.contains('frostbtn')),
      box: getComputedStyle(q('#playerbox')).backgroundColor }; });
  assert.ok(A.sky && /linear-gradient/.test(A.bg) && !/home-bg/.test(A.bg) && A.top && /linear-gradient/.test(A.hist) && A.btns && /rgba\(2[3-5]\d, 2[3-5]\d, 2[3-5]\d, 0\./.test(A.box), 'archive sky ' + JSON.stringify(A));
  await page.evaluate(() => { const t = document.getElementById('toast'); if (t) t.className = ''; }); await page.waitForTimeout(400); await page.screenshot({ path: OUT + 'sky-archive.png' });
  // Archive clean-up: long text sits behind (i) / 💡 buttons, hidden until tapped
  const vis = await page.evaluate(() => [...document.querySelectorAll('.archivepage p, .archivepage .tippop, .archivepage .notice')].filter(e => e.offsetParent && e.textContent.trim().length > 60).map(e => e.textContent.trim().slice(0, 40)));
  assert.deepStrictEqual(vis, [], 'no long text visible');
  for (const k of ['gdinfo', 'bktip', 'bkinfo']) assert.ok(await page.$('[data-act="info"][data-v="' + k + '"]') && await page.isHidden('#tip-' + k), k + ' collapsed');
  assert.strictEqual(await page.textContent('[data-v="bktip"] span'), '💡'); assert.strictEqual(await page.textContent('[data-v="gdinfo"] span'), 'i');
  await page.evaluate(() => { const t = document.getElementById('toast'); if (t) t.className = ''; }); await page.waitForTimeout(300); await page.screenshot({ path: OUT + 'archive-clean.png' });
  await page.click('[data-v="gdinfo"]'); assert.ok(await page.isVisible('#tip-gdinfo')); assert.match(await page.textContent('#tip-gdinfo'), /Pin High Backups/);
  assert.strictEqual(await page.getAttribute('[data-v="gdinfo"]', 'aria-expanded'), 'true'); await page.waitForTimeout(300); await page.screenshot({ path: OUT + 'archive-clean-open.png' });
  await page.click('[data-v="gdinfo"]'); assert.ok(await page.isHidden('#tip-gdinfo'), 'tap again closes');
  // the label next to each icon toggles too (whole row tappable)
  for (const k of ['gdinfo', 'bktip', 'bkinfo']) { await page.click('button.tiplbl[data-v="' + k + '"]'); assert.ok(await page.isVisible('#tip-' + k), k + ' label opens');
    assert.strictEqual(await page.getAttribute('.tipbtn[data-v="' + k + '"]', 'aria-expanded'), 'true', k + ' icon state follows'); await page.click('button.tiplbl[data-v="' + k + '"]'); assert.ok(await page.isHidden('#tip-' + k), k + ' label closes'); }
  await page.click('[data-v="bktip"]'); assert.match(await page.textContent('#tip-bktip'), /backed up/); await page.click('[data-v="bkinfo"]'); assert.match(await page.textContent('#tip-bkinfo'), /golf-rounds-backup/);
  await page.click('.topbar [data-act="home"]'); await page.waitForSelector('#home');
  assert.deepStrictEqual(errors, []); console.log('HISTORY FROSTED OK'); await b.close(); srv.kill();
})().catch(e => { console.error(e); process.exit(1); });
