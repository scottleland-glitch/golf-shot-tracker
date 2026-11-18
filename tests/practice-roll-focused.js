// v225: Practice "This week" 3-month chart, a point a day, with Full swing split into Irons (spoke 'irons') and Woods (spoke 'drive').
// v238: it's a fading average (half-life 3 days, minutes a week) – no longer a rolling 7-day total; a tournament day holds it flat.
const { chromium } = require('playwright-core');
const assert = require('assert');
const { spawn } = require('child_process');
const ARC = require('./fixtures/arcade-78.js');
const ROOT = __dirname + '/../', PORT = 8878, BASE = 'http://127.0.0.1:' + PORT + '/';
const ok = m => console.log('  ✓ ' + m);

function iso(d) {
  return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
}
function dayOffset(n) {
  const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + n); return iso(d);
}

(async () => {
  const srv = spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 900));
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  try {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
    const page = await ctx.newPage(); page.setDefaultTimeout(30000);
    const errors = []; page.on('pageerror', e => errors.push(String(e)));

    const today = dayOffset(0);
    // Known 7-day window ending today, plus one session just outside it (must not be in data-last).
    const plan = [
      { ago: 8, spoke: 'lag', min: 100 },           // 8 days ago: outside the window
      { ago: 6, spoke: 'lag', min: 10 },            // putting
      { ago: 5, spoke: 'chip', min: 20 },           // short game + a lesson
      { ago: 4, spoke: 'wedges', min: 30 },         // wedges
      { ago: 3, spoke: 'irons', min: 40 },          // irons + a tournament day
      { ago: 2, spoke: 'drive', min: 50 },          // woods
      { ago: 0, spoke: 'lag', min: 15 },            // putting today
      { ago: 0, spoke: 'drive', min: 25 }           // woods today
    ];
    const prac = [];
    plan.forEach((x, i) => {
      const e = { id: 'pr' + i, date: dayOffset(-x.ago) + 'T12:00:00', player: 'Scott', spoke: x.spoke, focus: '', min: x.min };
      if (x.ago === 5) Object.assign(e, { kind: 'lesson', change: 'tune', coach: 'Jo', lesson: 'L-t', focus: 'Lesson' });
      prac.push(e);
    });
    const rounds = [
      Object.assign(ARC.round(), { id: 'r1', player: 'Scott', play: 'practice', date: dayOffset(-20) + 'T16:00:00' }),
      Object.assign(ARC.round(), { id: 'rt', player: 'Scott', play: 'tournament', course: 'Ridgeview', date: dayOffset(-3) + 'T16:00:00' })
    ];

    await page.goto(BASE + '?x=' + Date.now());
    await page.evaluate(({ R, P }) => {
      localStorage.clear();
      localStorage.setItem('golfsg.player.v1', 'Scott');
      localStorage.setItem('golfsg.nameasked.v1', '1');
      localStorage.setItem('golfsg.rounds.v1', JSON.stringify(R));
      localStorage.setItem('golfsg.practice.v1', JSON.stringify(P));
      localStorage.setItem('golfsg.typical.v1', JSON.stringify({ scott: { weekMin: 525, roundsMonth: 4, set: '2026-08-01' } }));
    }, { R: rounds, P: prac });
    await page.reload();
    await page.waitForSelector('#home');
    await page.click('#tbpractice');
    await page.waitForSelector('#weekcard');
    if (await page.$('#waclose')) await page.click('#waclose');

    // log form already has Driving and Irons 100+ (the Woods / Irons split); no Full swing row
    await page.click('#prbig');
    if (await page.$('#sesssheet')) { await page.click('[data-act="sesscancel"]'); await page.click('#prbig'); }
    await page.waitForSelector('#prsheet');
    const spokes = await page.$$eval('#prsheet .prspoke .prsh span', e => e.map(x => x.textContent.trim()));
    assert.ok(spokes.indexOf('Driving') >= 0, 'log form has Driving');
    assert.ok(spokes.indexOf('Irons 100+') >= 0, 'log form has Irons 100+');
    assert.ok(spokes.indexOf('Full swing') < 0 && spokes.indexOf('Woods') < 0, 'no extra Full swing / Woods row – already split as Driving + Irons 100+');
    await page.click('[data-act="prcancel"]');
    ok('log form already has Driving and Irons 100+; no new options added');

    assert.strictEqual(await page.$$eval('#wkpages .wkpage', e => e.length), 3);
    const legend1 = await page.$$eval('#wkpages .wkpage[data-p="1"] .pglegend span', e => e.map(x => x.textContent));
    const legend2 = await page.$$eval('#wkpages .wkpage[data-p="2"] .pglegend span', e => e.map(x => x.textContent));
    assert.deepStrictEqual(legend1, ['Putting', 'Short game', 'Wedges', 'Irons', 'Woods']);
    assert.deepStrictEqual(legend2, legend1);
    // v236: the chart fits the practice logged (first log 8 days ago + 3 days' lead-in, at least 2 weeks)
    assert.strictEqual(await page.textContent('#wkpages .wkpage[data-p="2"] .wkpt'), 'Last 2 weeks · fading average');
    assert.match(await page.textContent('#wkpages .wkpage[data-p="2"] .wknote'), /tournament day/);
    assert.doesNotMatch(await page.textContent('#wkpages .wkpage[data-p="2"] .wknote'), /shaded/);
    ok('subtitle, 5-group legend on two charts, caption says tournament day');

    await page.evaluate(() => { const c = document.getElementById('wkpages'); c.scrollLeft = 2 * c.clientWidth; });
    await page.waitForTimeout(300);
    const D = await page.$eval('#wkpages .wkpage[data-p="2"] svg', s => ({
      roll: s.getAttribute('data-roll'), n: +s.getAttribute('data-n'), last: +s.getAttribute('data-last'),
      g: s.getAttribute('data-g').split(',').map(Number),
      trophies: s.querySelectorAll('.wktour').length, lessons: s.querySelectorAll('.wkles').length,
      bands: s.querySelectorAll('path.band').length, aria: s.getAttribute('aria-label'), hold: +s.getAttribute('data-hold'), shades: s.querySelectorAll('rect.wkhold').length
    }));
    assert.strictEqual(D.roll, 'fade');
    assert.strictEqual(D.n, 14, 'v236: fits 2 weeks (first log 8 days ago), got ' + D.n);
    assert.match(D.aria, /fading average/);
    // expected fading average (half-life 3 days, averaged over the days logged, at least 3), from the first log 8 days ago;
    // the tournament day (3 days ago) is held – no decay, and its 40 min of irons (a warm-up) is left out
    const A = Math.pow(0.5, 1 / 3), byAgo = {}; plan.forEach(x => { (byAgo[x.ago] = byAgo[x.ago] || [0, 0, 0, 0, 0])[{ lag: 0, chip: 1, wedges: 2, irons: 3, drive: 4 }[x.spoke]] += x.min; });
    let eg = [0, 0, 0, 0, 0], kd = 0;
    for (let a = 8; a >= 0; a--) { if (a === 3) continue; const m = byAgo[a] || [0, 0, 0, 0, 0]; eg = eg.map((v, i) => v * A + m[i] * (1 - A)); kd++; }
    const exp = eg.map(v => v / (1 - Math.pow(A, Math.max(kd, 3))) * 7);
    assert.deepStrictEqual(D.g, exp.map(Math.round), 'Putting, Short game, Wedges, Irons, Woods: ' + D.g + ' vs ' + exp.map(Math.round));
    assert.strictEqual(D.last, Math.round(exp.reduce((a, b) => a + b, 0)), 'fading average ending today');
    assert.strictEqual(D.g[3], 0, 'irons logged only on the tournament day are left out (held day)');
    assert.ok(D.g[0] > 0 && D.g[4] > D.g[0], 'drive→Woods, lag→Putting');
    assert.strictEqual(D.bands, 4, 'four groups with practice (no irons outside the tournament day)');
    assert.strictEqual(D.hold, 1, 'one held (tournament) day in the window – the practice round 20 days ago is outside it');
    assert.ok(D.last > 40, 'today alone is 40 min; the curve does not drop to today\'s practice');
    assert.strictEqual(D.trophies, 1, 'trophy on the tournament day');
    assert.strictEqual(D.lessons, 1, 'lesson marker on the lesson day');
    assert.strictEqual(D.shades, 0, 'no shaded blocks on held days');
    ok('fading average ' + D.last + ' min a week (' + D.g + '); tournament day held flat, no shading; markers on the day');

    const colors = await page.evaluate(() => {
      const bg = sel => getComputedStyle(document.querySelector(sel)).backgroundColor;
      return { pg3: bg('#wkpages .wkpage[data-p="2"] .pglegend .pg3'), pg4: bg('#wkpages .wkpage[data-p="2"] .pglegend .pg4') };
    });
    assert.strictEqual(colors.pg3, 'rgb(27, 138, 140)', 'irons teal');
    assert.strictEqual(colors.pg4, 'rgb(196, 78, 22)', 'woods deep orange');
    ok('Irons teal, Woods deep orange, no purple');

    const totLabel = await page.$eval('#wkpages .wkpage[data-p="2"] .wktgtlab', e => e.textContent);
    const head = await page.textContent('#wktot');
    assert.match(totLabel, /^target /);
    assert.ok(head.indexOf(totLabel.replace(/^target /, '')) >= 0, 'header and dashed label use the same target: ' + head + ' vs ' + totLabel);
    const bandD = await page.$eval('#wkpages .wkpage[data-p="2"] path.band', e => e.getAttribute('d') || '');
    assert.ok((bandD.match(/L/g) || []).length > 100, 'stacked areas are densely sampled curves, not one corner per day');
    ok('header target matches the dashed label; areas are smooth curves');

    assert.deepStrictEqual(errors, [], 'no page errors');
    console.log('PASS practice-roll-focused');
  } finally { await b.close(); srv.kill(); }
})().catch(e => { console.error(e); process.exit(1); });
