// v93 wedges; v102: + menu → My Bag with a Bag | Wedge ladder toggle (Profile gone, player name in Settings).
// Wedges chart Wedges chart 40–110 yd: club, ball position (Front/Middle/Back), shaft lean (0°/1–2°/3–4°),
// club position (P1–P3), hinge (45°/90°/Full).
// Menu order, navigation, accordion, persistence, backup round trip. iPhone 390x844 @3x screenshots.
const assert = require('assert'); const { spawn } = require('child_process'); const fs = require('fs');
const W = require('../wedges.js'); const SG = require('../sg.js'); const BAG = require('../bag.js');
const OUT = '/workspace/golf-app/screenshots/', PORT = 8831, BASE = 'http://127.0.0.1:' + PORT + '/';
// ---------- 1. data ----------
{
  assert.deepStrictEqual(W.YARDS, [40, 50, 60, 70, 80, 90, 100, 110]);
  // entries from the 5-yard draft stay in the data (hidden, in backups) – never silently deleted
  const five = W.norm({ rows: { 70: { club: '54' }, 75: { club: '56', ball: 'center' }, 105: { hinge: '90' }, 77: { club: 'x' } } });
  assert.deepStrictEqual(Object.keys(five.rows), ['70', '75', '105']); assert.strictEqual(W.filled(five), 1); assert.deepStrictEqual(W.hidden(five), [75, 105]);
  assert.strictEqual(five.rows[75].ball, 'middle'); assert.ok(SG.makeBackup([], null, 'Q', [], null, five).wedges.rows[75], 'kept in backups');
  assert.strictEqual(W.summary({}), ''); assert.strictEqual(W.summary({ club: '54', ball: 'middle', lean: '1-2', pos: 'p2', hinge: '90' }), '54° · middle · 1–2° · P2 · hinge 90°');
  assert.strictEqual(W.summary({ club: 'PW', posNote: 'choke down', hinge: 'full' }), 'PW · position: choke down · hinge full');
  assert.deepStrictEqual(W.BALL.map(x => x[1]), ['Front', 'Middle', 'Back']); assert.deepStrictEqual(W.LEAN.map(x => x[1]), ['0°', '1–2°', '3–4°']);
  assert.deepStrictEqual(W.POS.map(x => x[1]), ['P1', 'P2', 'P3']); assert.deepStrictEqual(W.HINGE.map(x => x[1]), ['45°', '90°', 'Full']);
  // first-draft v93 values migrate: mappable ones convert, the rest become notes
  const mig = W.norm({ rows: { 60: { club: '58', ball: 'fwdc', lean: 'strong', hands: '9', handsNote: 'hip' }, 70: { ball: 'backc', lean: 'back' }, 95: { hands: 'full' } } }).rows;
  assert.deepStrictEqual(mig, { 60: { club: '58', ball: 'front', lean: '3-4', posNote: 'was 9:00, hip' }, 70: { ball: 'back', leanNote: 'leaning back' }, 95: { posNote: 'was full swing' } });
  assert.strictEqual(W.mergeWedges(W.blank(), { rows: { 60: { ball: 'center', lean: 'neutral' } } }).wedges.rows[60].lean, '0', 'old backup restores (converted)');
  const n = W.norm({ rows: { 70: { club: '56', ball: 'bogus', lean: 'neutral', hinge: 'x' }, 41: { club: 'x' }, 80: {} } });
  assert.deepStrictEqual(n.rows, { 70: { club: '56', lean: '0' } }, 'unknown yardages / options dropped');
  const a = { updated: '2026-10-01T00:00:00Z', rows: { 50: { club: '60' } } }, b = { updated: '2026-10-28T00:00:00Z', rows: { 70: { club: '56' } } };
  assert.strictEqual(W.mergeWedges(W.blank(), a).changed, true, 'empty phone takes the backup');
  assert.strictEqual(W.mergeWedges(b, a).changed, false, 'older backup never replaces'); assert.strictEqual(W.mergeWedges(a, b).changed, true, 'newer backup replaces');
  assert.strictEqual(W.mergeWedges(a, W.blank()).changed, false);
  const bk = SG.makeBackup([], null, 'Quincy', [], null, b); assert.strictEqual(bk.wedges.rows[70].club, '56');
  assert.strictEqual(SG.makeBackup([], null, 'Q', [], null, W.blank()).wedges, undefined, 'no key when empty');
  const pb = SG.parseBackup(JSON.stringify(bk)); assert.ok(!pb.error, 'wedges-only backup is readable'); assert.strictEqual(pb.wedges.rows[70].club, '56');
  const old = SG.parseBackup(JSON.stringify(SG.makeBackup([], null, 'Q', [], BAG.addClubs(BAG.blank(), [{ cat: 'we', code: '56', loft: 56 }]).bag)));
  assert.ok(!old.error && !old.wedges, 'older backups (no wedges) still fine');
  // v94 High / Low flight: v93 charts (rows only) become High, Low starts empty
  const v2 = W.norm({ v: 2, rows: { 70: { club: '54' }, 75: { club: '56' } } });
  assert.deepStrictEqual(v2, { v: 3, rows: { 70: { club: '54' }, 75: { club: '56' } }, low: {} });
  const two = W.norm({ rows: { 70: { club: '54', ball: 'middle' } }, low: { 70: { club: '56', ball: 'back', lean: '3-4' }, 50: { club: '60' }, 41: { club: 'x' } } });
  assert.strictEqual(W.filled(two), 1); assert.strictEqual(W.filled(two, 'low'), 2); assert.strictEqual(W.count(two), 3);
  assert.deepStrictEqual(W.ladder(two).map(W.ladderLabel), ['50 yd · Low · 60°', '70 yd · High · 54° · Middle', '70 yd · Low · 56° · Back']);
  const lowOnly = { updated: '2026-10-28T00:00:00Z', rows: {}, low: { 60: { club: '58' } } };
  assert.strictEqual(SG.makeBackup([], null, 'Q', [], null, lowOnly).wedges.low[60].club, '58', 'Low-only chart is backed up');
  assert.strictEqual(SG.parseBackup(JSON.stringify(SG.makeBackup([], null, 'Q', [], null, lowOnly))).wedges.low[60].club, '58');
  assert.strictEqual(W.mergeWedges(W.blank(), lowOnly).changed, true); assert.strictEqual(W.mergeWedges(lowOnly, W.blank()).changed, false);
  console.log('  wedges data / backup ok');
}
(async () => {
  const { chromium } = require('playwright-core');
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: '/workspace/golf-app', stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 1500)); const errors = [];
  const br = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  try {
    const ctx = await br.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    const page = await ctx.newPage(); page.on('pageerror', e => errors.push(String(e))); page.on('console', m => m.type() === 'error' && !/favicon/.test(m.text()) && errors.push(m.text()));
    const dialogs = []; page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
    const shot = async (name, opt) => { await page.evaluate(() => { const t = document.getElementById('toast'); if (t) t.className = ''; }); await page.waitForTimeout(350); await page.screenshot(Object.assign({ path: OUT + name + '.png' }, opt || {})); };
    const store = () => page.evaluate(() => JSON.parse(localStorage.getItem('golfsg.wedges.v1') || 'null'));
    await page.goto(BASE + '?x=' + Date.now());
    const bagB = BAG.addClubs(BAG.blank(), [{ cat: 'ir', code: '9i', loft: 41 }, { cat: 'ir', code: 'PW', loft: 45 }, { cat: 'we', code: '50', loft: 50 }, { cat: 'we', code: '54', loft: 54 }, { cat: 'we', code: '58', loft: 58 }, { cat: 'ir', code: '7i', loft: 33 }]).bag;
    bagB.clubs.forEach(c => { c.carry = { '9i': 128, PW: 115, '50': 102, '54': 88, '58': 74, '7i': 150 }[c.code]; });
    await page.evaluate(b => { localStorage.clear(); localStorage.setItem('golfsg.player.v1', 'Quincy'); localStorage.setItem('golfsg.nameasked.v1', '1'); localStorage.setItem('golfsg.bag.v1', JSON.stringify(b)); localStorage.setItem('golfsg.wedges.v1', JSON.stringify({ v: 1, rows: { 75: { club: '56', ball: 'center' } } })); }, bagB); // a 5-yard-draft entry
    await page.reload(); await page.waitForSelector('#home');
    assert.strictEqual(await page.$('[data-act="profile"], [data-act="wedges"], [data-act="bag"]'), null, 'home stays clean');
    await page.click('#plusbtn'); await page.waitForSelector('#plusmenu');
    assert.deepStrictEqual(await page.$$eval('#plusmenu .sheet-item', e => e.map(x => x.textContent)), ['New round', 'My Bag', 'Rounds', 'Settings']);
    // My Bag opens on the Bag tab; the toggle switches to the Wedge ladder and back; ‹ Home
    await page.click('#plusmenu [data-act="bag"]'); await page.waitForSelector('#baglist');
    assert.strictEqual(await page.$('#plusmenu'), null, 'menu closed');
    assert.deepStrictEqual(await page.$$eval('#bagseg button', e => e.map(x => x.textContent + (x.getAttribute('aria-selected') === 'true' ? '*' : ''))), ['Bag*', 'Wedge ladder']);
    assert.match(await page.textContent('.topbar'), /My Bag\s*6 clubs/); assert.strictEqual(await page.textContent('.topbar .txt'), '‹ Home');
    assert.strictEqual(await page.$('#profwedges, #profbag'), null, 'no separate Wedges button');
    await page.click('#segwedges'); await page.waitForSelector('#wlist'); assert.strictEqual(await page.$('#baglist'), null);
    assert.deepStrictEqual(await page.$$eval('#bagseg button', e => e.map(x => x.textContent + (x.getAttribute('aria-selected') === 'true' ? '*' : ''))), ['Bag', 'Wedge ladder*']);
    assert.match(await page.textContent('.topbar'), /My Bag\s*0 of 8 yardages set/);
    await page.click('#segbag'); await page.waitForSelector('#baglist');
    await page.click('.topbar [data-act="home"]'); await page.waitForSelector('#home');
    // name change now lives in Settings
    await page.click('#plusbtn'); await page.click('#plusmenu [data-act="archive"]'); assert.match(await page.textContent('#pnameshow'), /Quincy/);
    await page.click('[data-act="editname"]'); await page.fill('#pname', 'Quincy L'); await page.click('[data-act="setname"]');
    await page.waitForSelector('#pnameshow'); assert.strictEqual(await page.textContent('#pnameshow'), 'Quincy L'); assert.ok(await page.$('.archivepage'), 'still on Settings');
    await page.click('.topbar [data-act="home"]');
    // Wedges list (Wedge ladder tab)
    await page.click('#plusbtn'); await page.click('#plusmenu [data-act="bag"]'); await page.click('#segwedges'); await page.waitForSelector('#wlist');
    assert.deepStrictEqual(await page.$$eval('.whead b', e => e.map(x => parseInt(x.textContent))), W.YARDS, '40–110 by 10');
    assert.ok((await page.$$eval('.wsum', e => e.map(x => x.textContent))).every(t => t === 'Not set'));
    assert.strictEqual(await page.$('#wbody'), null, 'all collapsed');
    // fill 70
    await page.click('.whead[data-y="70"]'); await page.waitForSelector('#wbody');
    assert.deepStrictEqual(await page.$$eval('#wbody .bagcat', e => e.map(x => x.textContent)), ['Club', 'Ball position', 'Shaft lean', 'Club position', 'Hinge']);
    assert.deepStrictEqual(await page.$$eval('#wbody [data-f="club"][data-v="set"]', e => e.map(x => x.getAttribute('data-k'))), ['9i', 'PW', '50', '54', '58'], 'short clubs from the bag');
    await page.click('#wbody [data-f="club"][data-k="54"]'); await page.click('#wbody [data-f="ball"][data-k="middle"]');
    await page.click('#wbody [data-f="lean"][data-k="1-2"]'); await page.click('#wbody [data-f="pos"][data-k="p2"]'); await page.click('#wbody [data-f="hinge"][data-k="90"]');
    await page.fill('[data-wn="posNote"]', 'Choke down 1"');
    assert.strictEqual(await page.textContent('[data-wsum="70"]'), '54° · middle · P2', 'simple-view header: club · ball · position');
    assert.deepStrictEqual(await page.$$eval('#wbody [data-f="club"][data-v="set"]', e => e.map(x => x.textContent)), ['9i', 'PW', '50°', '54°', '58°'], 'no carries on the club chips');
    assert.deepStrictEqual(await page.$$eval('#wbody [data-v="set"][data-f="lean"]', e => e.map(x => x.textContent)), ['0°', '1–2°', '3–4°']);
    assert.deepStrictEqual(await page.$$eval('#wbody .wnote', e => e.map(x => x.getAttribute('data-wn'))), ['ballNote', 'leanNote', 'posNote'], 'notes on ball, lean, position; none on hinge');
    assert.deepStrictEqual((await store()).rows[75], { club: '56', ball: 'middle' }, 'hidden 75 yd entry kept while editing');
    let S = await store(); assert.deepStrictEqual(S.rows[70], { club: '54', ball: 'middle', lean: '1-2', pos: 'p2', posNote: 'Choke down 1"', hinge: '90' });
    // toggle a chip off
    await page.click('#wbody [data-f="lean"][data-k="1-2"]'); assert.strictEqual((await store()).rows[70].lean, undefined); await page.click('#wbody [data-f="lean"][data-k="1-2"]');
    // a second yardage with "Other" club – opening it closes 70 (one open at a time)
    await page.click('.whead[data-y="50"]'); assert.deepStrictEqual(await page.$$eval('.wrow.open', e => e.map(x => x.getAttribute('data-y'))), ['50']);
    await page.click('#wbody [data-v="other"]'); await page.fill('[data-wn="club"]', '60 Lob'); await page.click('#wbody [data-f="ball"][data-k="front"]'); await page.click('#wbody [data-f="pos"][data-k="p1"]'); await page.click('#wbody [data-f="hinge"][data-k="45"]');
    assert.strictEqual((await store()).rows[50].club, '60 Lob');
    await page.click('.whead[data-y="100"]'); await page.click('#wbody [data-f="club"][data-k="PW"]'); await page.click('#wbody [data-f="lean"][data-k="0"]'); await page.click('#wbody [data-f="pos"][data-k="p3"]'); await page.click('#wbody [data-f="hinge"][data-k="full"]');
    // clear one
    await page.click('.whead[data-y="60"]'); await page.click('#wbody [data-f="club"][data-k="58"]'); await page.click('#wbody [data-v="clear"]'); assert.match(dialogs.pop(), /Clear the High flight setup for 60/);
    assert.strictEqual((await store()).rows[60], undefined); assert.strictEqual(await page.textContent('[data-wsum="60"]'), 'Not set');
    await page.click('.whead[data-y="60"]'); assert.strictEqual(await page.$('#wbody'), null);
    // persists after reload
    await page.reload(); await page.click('#plusbtn'); await page.click('#plusmenu [data-act="bag"]'); await page.click('#segwedges'); await page.waitForSelector('#wlist');
    assert.match(await page.textContent('.topbar .title span'), /^3 of 8 yardages set$/);
    assert.match(await page.textContent('[data-wsum="50"]'), /^60 Lob · front · P1$/);
    await page.evaluate(() => window.scrollTo(0, 0)); await shot('wedges-list');
    // v94: a set yardage opens a simple read-only view – three lines; the Edit button at the bottom brings back the full editor
    assert.strictEqual(await page.textContent('#wedit'), '✎ Edit');
    await page.click('.whead[data-y="70"]'); await page.waitForSelector('#wsimple'); assert.strictEqual(await page.$('#wbody'), null, 'no editor in simple view');
    assert.deepStrictEqual(await page.$$eval('#wsimple .wsline', e => e.map(x => [x.querySelector('span').textContent, x.querySelector('b').textContent])), [['Club', '54°'], ['Ball position', 'Middle'], ['Club position', 'P2']]);
    assert.strictEqual(await page.$('#wsimple .wchips, #wsimple input'), null, 'no chips or fields');
    await page.click('.whead[data-y="100"]'); assert.deepStrictEqual(await page.$$eval('#wsimple b', e => e.map(x => x.textContent)), ['PW', '–', 'P3'], 'one open at a time');
    await page.click('.whead[data-y="100"]'); await page.click('.whead[data-y="70"]');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight)); await shot('wedges-simple-expanded');
    await page.click('.whead[data-y="80"]'); await page.waitForSelector('#wbody'); assert.strictEqual(await page.$('#wsimple'), null, 'an unset yardage opens the full editor');
    await page.click('#wbody [data-v="toggle"]'); assert.strictEqual(await page.$('#wbody'), null);
    await page.click('#wedit'); assert.strictEqual(await page.textContent('#wedit'), '✓ Done editing');
    assert.strictEqual(await page.textContent('[data-wsum="70"]'), '54° · middle · 1–2° · P2 · hinge 90°', 'edit mode header shows everything');
    assert.strictEqual(W.summary({ club: '54', lean: '1-2', hinge: '90' }, true), '54°');
    await page.click('.whead[data-y="70"]'); await page.waitForSelector('#wbody');
    assert.ok(await page.$eval('#wbody [data-f="club"][data-k="54"]', e => e.classList.contains('sel'))); assert.strictEqual(await page.inputValue('[data-wn="posNote"]'), 'Choke down 1"');
    assert.strictEqual((await store()).rows[70].lean, '1-2', 'lean / hinge stay stored'); assert.strictEqual((await store()).rows[70].hinge, '90');
    await page.evaluate(() => { const r = document.querySelector('.wrow[data-y="70"]'); window.scrollTo(0, r.getBoundingClientRect().top + window.scrollY - 84); });
    await shot('wedges-expanded'); await shot('wedges-edit-mode');
    await page.click('#wedit'); await page.waitForSelector('#wsimple'); assert.strictEqual(await page.textContent('#wedit'), '✎ Edit');
    // v94 High / Low flight toggle – separate setups per yardage; default High
    assert.deepStrictEqual(await page.$$eval('#wflight button', e => e.map(x => x.textContent + (x.classList.contains('on') ? '*' : ''))), ['High flight*', 'Low flight']);
    await page.click('#wflight [data-k="low"]'); await page.waitForSelector('#wflight [data-k="low"].on');
    assert.match(await page.textContent('.topbar .title span'), /^0 of 8 yardages set$/); assert.strictEqual(await page.textContent('[data-wsum="70"]'), 'Not set');
    await page.click('.whead[data-y="70"]'); await page.waitForSelector('#wbody');
    for (const [f, k] of [['club', '58'], ['ball', 'back'], ['lean', '3-4'], ['pos', 'p1'], ['hinge', '45']]) await page.click(`#wbody [data-f="${f}"][data-k="${k}"]`);
    await page.click('#wbody [data-v="toggle"]');
    await page.click('.whead[data-y="90"]'); await page.click('#wbody [data-f="club"][data-k="PW"]'); await page.click('#wbody [data-f="pos"][data-k="p2"]'); await page.click('#wbody [data-v="toggle"]');
    assert.strictEqual(await page.textContent('[data-wsum="70"]'), '58° · back · P1'); assert.match(await page.textContent('.topbar .title span'), /^2 of 8/);
    let st = await store(); assert.deepStrictEqual(st.low[70], { club: '58', ball: 'back', lean: '3-4', pos: 'p1', hinge: '45' }); assert.strictEqual(st.rows[70].club, '54', 'High untouched');
    await page.click('.whead[data-y="70"]'); await page.waitForSelector('#wsimple');
    assert.deepStrictEqual(await page.$$eval('#wsimple b', e => e.map(x => x.textContent)), ['58°', 'Back', 'P1']);
    await page.evaluate(() => window.scrollTo(0, 0)); await shot('wedges-low-flight');
    // Clear in Low only clears Low
    await page.click('#wedit'); await page.click('.whead[data-y="90"]'); await page.click('#wbody [data-v="clear"]');
    assert.match(dialogs[dialogs.length - 1], /Clear the Low flight setup for 90/); st = await store(); assert.strictEqual(st.low[90], undefined); assert.ok(st.low[70]);
    await page.click('#wedit');
    await page.click('#wflight [data-k="high"]'); assert.strictEqual(await page.textContent('[data-wsum="70"]'), '54° · middle · P2'); assert.match(await page.textContent('.topbar .title span'), /^3 of 8/);
    await page.click('#wflight [data-k="low"]');
    await page.click('#segbag'); await page.waitForSelector('#baglist');
    await page.click('#segwedges'); assert.strictEqual(await page.textContent('#wedit'), '✎ Edit', 'opens in simple view');
    assert.ok(await page.$('#wflight [data-k="high"].on'), 'opens on High'); assert.match(await page.textContent('.topbar .title span'), /^3 of 8 yardages set$/);
    await page.click('.topbar [data-act="home"]'); await page.waitForSelector('#home');
    // backup → restore into an empty phone
    const wj = await page.evaluate(() => localStorage.getItem('golfsg.wedges.v1'));
    const bk = await page.evaluate(j => JSON.stringify(SG.makeBackup([], null, 'Quincy', [], null, JSON.parse(j))), wj); fs.writeFileSync('/tmp/wedges-backup.json', bk);
    await page.evaluate(() => localStorage.removeItem('golfsg.wedges.v1')); await page.reload();
    await page.click('#plusbtn'); await page.click('#plusmenu [data-act="archive"]'); assert.ok(await page.$eval('[data-act="backup"]', e => !e.disabled));
    await page.setInputFiles('#restorefile', '/tmp/wedges-backup.json'); await page.waitForSelector('#rpwedges');
    assert.match(await page.textContent('#rpgo'), /Restore wedges/); await page.click('#rpgo'); await page.waitForSelector('#notice');
    assert.match(await page.textContent('#notice'), /Wedges \(3 yardages · 1 Low flight\)/); assert.deepStrictEqual((await store()).rows, JSON.parse(wj).rows); assert.deepStrictEqual((await store()).low, JSON.parse(wj).low);
    const back = await page.evaluate(() => SG.makeBackup([], null, 'Q', [], null, JSON.parse(localStorage.getItem('golfsg.wedges.v1')))); assert.strictEqual(back.wedges.rows[70].club, '54');
    // empty bag → standard wedge list
    await page.evaluate(() => localStorage.removeItem('golfsg.bag.v1')); await page.reload(); await page.click('#plusbtn'); await page.click('#plusmenu [data-act="bag"]'); await page.click('#segwedges'); await page.click('.whead[data-y="40"]');
    assert.deepStrictEqual(await page.$$eval('#wbody [data-f="club"][data-v="set"]', e => e.map(x => x.getAttribute('data-k'))), W.STD_CLUBS);
    const sw = fs.readFileSync('/workspace/golf-app/sw.js', 'utf8'); assert.ok(sw.includes("'golf-sg-v106'") && sw.includes("'./wedges.js'"));
    assert.deepStrictEqual(errors, []);
    console.log('MY BAG/WEDGES OK');
  } finally { await br.close(); srv.kill(); }
})().catch(e => { console.error(e); process.exit(1); });
