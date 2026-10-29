// Home redesign: full-bleed photo, + menu (New round / History), Archive page, Resume pill; iPhone viewport
const { chromium } = require('playwright-core'); const assert = require('assert'); const { spawn } = require('child_process');
const BASE = 'http://127.0.0.1:8795/', OUT = '/workspace/golf-app/screenshots/';
(async () => {
  const srv = spawn('python3', ['-m', 'http.server', '8795', '--bind', '127.0.0.1'], { cwd: '/workspace/golf-app', stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1500)); const errors = [];
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, acceptDownloads: true });
  const page = await ctx.newPage(); page.on('console', m => m.type() === 'error' && errors.push(m.text())); page.setDefaultTimeout(30000); page.on('pageerror', e => errors.push(String(e))); page.on('dialog', d => d.accept());
  await page.goto(BASE + '?x=' + Date.now()); await page.evaluate(() => localStorage.clear()); await page.reload();
  const shot = async n => { await page.waitForTimeout(400); await page.screenshot({ path: OUT + 'home-' + n + '.png' }); };
  // first open on a new phone: "Who's playing?" – Not now leaves a clean Home (Player lives in the New round sheet)
  await page.waitForSelector('#namesheet'); assert.match(await page.textContent('#namesh'), /Who’s playing\?/); await page.click('[data-act="nameskip"]');
  // home: only title, +, Archive
  const H = await page.evaluate(() => { const h = document.getElementById('home'), bg = getComputedStyle(h.querySelector('.home-bg'));
    return { btns: [...h.querySelectorAll('button')].map(x => x.id), text: h.innerText.replace(/\s+/g, ' ').trim(), bg: bg.backgroundImage, size: bg.backgroundSize, r: h.getBoundingClientRect().toJSON(),
      title: getComputedStyle(h.querySelector('.home-title')).color, inputs: h.querySelectorAll('input,select').length }; });
  assert.deepStrictEqual(H.btns, ['plusbtn', 'archivepill'], 'home buttons'); assert.strictEqual(H.text, 'Pin High + Archive'); assert.strictEqual(H.inputs, 0);
  assert.ok(/home-bg\.webp/.test(H.bg) && H.size === 'cover' && H.r.width === 393 && H.r.height === 852, 'full-bleed photo ' + JSON.stringify(H));
  assert.strictEqual(H.title, 'rgb(255, 255, 255)');
  assert.ok(await page.evaluate(() => fetch('img/home-bg.webp').then(r => r.blob()).then(x => x.size < 250000)), 'photo under 250 KB');
  await shot('main');
  // + menu: New round + Profile (v93, My Bag + Wedges inside) + History
  await page.click('#plusbtn'); assert.deepStrictEqual(await page.$$eval('#plusmenu button', x => x.map(e => e.textContent)), ['New round', 'Profile', 'History']);
  await shot('plus');
  await page.click('.sheet-back', { position: { x: 60, y: 600 } }); assert.strictEqual(await page.$('#plusmenu'), null, 'tap outside closes');
  await page.click('#plusbtn'); await page.click('#plusmenu [data-act="history"]'); await page.waitForSelector('#histlist, .topbar'); assert.match(await page.textContent('.topbar'), /History/);
  await page.click('[data-act="home"] >> nth=0'); await page.waitForSelector('#home'); assert.strictEqual(await page.$('#plusmenu'), null, 'menu closed after navigating');
  // Archive: player name setup + data tools, Home button
  await page.click('#archivepill'); await page.waitForSelector('#playerbox');
  assert.match(await page.textContent('.topbar'), /‹ Home\s*Archive\s*0 saved rounds/);
  for (const s of ['[data-act="history"]', '[data-act="backup"]', '#restorefile', '[data-act="about"]', '#pname']) assert.ok(await page.$(s), 'archive has ' + s);
  await shot('archive');
  await page.click('[data-act="backup"]').catch(() => {}); // no rounds -> disabled
  await page.fill('#pname', 'Scott'); await page.click('[data-act="setname"]'); assert.strictEqual(await page.textContent('#pnameshow'), 'Scott');
  assert.ok(await page.$('#archivepage, .topbar'), 'stays on Archive after saving the name');
  await page.click('[data-act="home"]'); await page.waitForSelector('#home');
  // new round from the + sheet
  await page.click('#plusbtn'); await page.click('[data-act="newform"]'); await page.fill('#course', 'Lakeridge'); await page.selectOption('#newbl', { index: 0 });
  await page.click('[data-act="new"]'); await page.waitForSelector('.holecard');
  await page.click('[data-act="home"]'); await page.waitForSelector('#resumepill');
  const R = await page.evaluate(() => [...document.querySelectorAll('#home button')].map(x => x.id + ':' + x.innerText.replace(/\s+/g, ' ')));
  assert.deepStrictEqual(R, ['plusbtn:+', 'resumepill:Resume round Lakeridge · 0 holes done', 'archivepill:Archive']);
  const pos = await page.evaluate(() => ['resumepill', 'archivepill'].map(i => document.getElementById(i).getBoundingClientRect().top));
  assert.ok(pos[0] < pos[1] && pos[1] > 700, 'resume above archive at the bottom ' + pos);
  await page.waitForFunction(() => !document.querySelector('#toast.show') && getComputedStyle(document.getElementById('toast')).opacity < 0.05, null, { timeout: 8000 }).catch(() => {}); await page.waitForTimeout(3000);
  await shot('resume');
  await page.click('#resumepill'); await page.waitForSelector('.holecard');
  // discard lives on Archive now
  await page.click('[data-act="home"]'); await page.click('#archivepill'); await page.click('[data-act="discard"]'); await page.waitForSelector('#home');
  assert.strictEqual(await page.$('#resumepill'), null);
  assert.deepStrictEqual(errors, []); console.log('HOME OK'); await b.close(); srv.kill();
})().catch(e => { console.error(e); process.exit(1); });
