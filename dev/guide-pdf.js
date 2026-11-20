// v243: lays out the Strokewise guide from the screenshots dev/guide.js took → help/Strokewise-Guide.pdf
// Run after dev/guide.js:  NODE_PATH=/opt/npm-tools/node_modules node dev/guide-pdf.js
const { chromium } = require('playwright-core'); const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), TMP = path.join(require('os').tmpdir(), 'guideshots'); const IMG = JSON.parse(fs.readFileSync(path.join(TMP, 'img.json'), 'utf8'));
const VER = (fs.readFileSync(path.join(ROOT, 'sg.js'), 'utf8').match(/VERSION: '(v\d+)'/) || [])[1] || '';
const im = (k, cap, w) => IMG[k] ? `<figure style="width:${w || 2.7}in"><img src="${IMG[k]}">${cap ? `<figcaption>${cap}</figcaption>` : ''}</figure>` : '';
// a page: title, intro, steps/notes, pictures
const page = (n, title, lede, body, pics) => `<section class="pg"><div class="hd"><span class="n">${n}</span><h2>${title}</h2></div><p class="lede">${lede}</p>
  <div class="cols"><div class="txt">${body}</div><div class="pics">${pics}</div></div></section>`;
const ol = (a) => '<ol>' + a.map(x => `<li>${x}</li>`).join('') + '</ol>', ul = (a) => '<ul>' + a.map(x => `<li>${x}</li>`).join('') + '</ul>';
const tip = (t) => `<p class="tip">${t}</p>`;
const P = [];
P.push(`<section class="cover"><div><h1>Strokewise</h1><p class="sub">The guide</p><p class="cv">Track your rounds on your phone or Apple Watch, see where you gain and lose strokes, and practise what matters.</p>
  <h3>Inside</h3>${ol(['Getting started', 'Your home screen', 'Starting a round', 'Entering shots', 'Score only rounds', 'On your Apple Watch', 'Reviewing a round', 'My Game', 'Stats', 'How you improve', 'Practice and tests', 'My Bag', 'Settings, backup and your coach', 'Help'])}
  <p class="ver">${VER} · sample player “Alex”</p></div>${im('home', '', 2.6)}</section>`);
P.push(page(1, 'Getting started', 'The first time you open Strokewise it asks two quick questions.', `
  <h4>1 · Who are you?</h4><p><b>I play</b> – you track your own rounds. <b>I coach</b> – you see your athletes’ rounds (coaches sign in on strokewise.app/coach).</p>
  <h4>2 · How do you want to track?</h4>${ul(['<b>Score only</b> – your score and putts on each hole, kept for history.', '<b>Every shot – strokes gained</b> – the lie and distance of every shot, so you see exactly where you gain and lose strokes.', '<b>Every shot + improve</b> – strokes gained, plus short-game tests and a practice plan that adjusts every week.'])}
  <p>Then type your name (or a coach code if your coach gave you one). A short tour follows – you can see it again any time from <b>Help</b>.</p>${tip('You can change how you track any time in Settings → Track.')}`,
  im('welcome', 'Player or coach', 2.3) + im('track', 'How you track', 2.3)));
P.push(page(2, 'Your home screen', 'Everything starts from the bar at the bottom.', `
  ${ul(['<b>My Game</b> – where your strokes go, at a glance.', '<b>Rounds</b> – every round you have saved.', '<b>+</b> – start a new round, log practice or take a short-game test.', '<b>Practice</b> – your plan for the week (Every shot + improve).', '<b>Stats</b> – the numbers behind your game.'])}
  <p>The <b>☰</b> menu at the top left has Rounds, Stats, My Game, My Bag, Settings and Help.</p><p>The card on the home screen shows your last round and one thing it says about your game.</p>`,
  im('plusmenu', 'The + menu') + im('navmenu', 'The ☰ menu')));
P.push(page(3, 'Starting a round', 'Tap + › New round.', ol(['Tap <b>Courses near me</b> or type the course name. Saved courses fill in par and yardages.', 'Pick <b>Practice</b> or <b>Tournament</b> – Stats can compare the two.', 'Choose what to compare your shots against – for example the PGA Tour average.', 'Check the player and tap <b>Start round</b>.']) + tip('Not finished? The round waits for you – tap <b>Resume</b> on the home screen.'),
  im('newround', 'New round')));
P.push(page(4, 'Entering shots', 'One line per shot: how far it was to the pin, and where it finished.', ol(['Type the <b>yards to the pin</b> for the shot (the tee shot uses the hole length).', 'Under <b>Finished</b>, pick where the ball ended up: fairway, rough, green, bunker, and more.', 'Tap <b>Next shot</b>. The next line starts where the last one finished.', 'On the shot that goes in, pick <b>In the hole</b>, then <b>Finish hole</b>.']) +
  `<p>Optional on each shot: the club, and the direction of a miss. <b>Set pin location</b> records front, middle or back.</p><p>Each saved shot shows its strokes gained on the right – green is better than the benchmark, red is worse.</p>` + tip('Playing 9? On hole 9 tap <b>Finish round</b> – a 9-hole round counts in your stats just like 18.'),
  im('hole', 'A hole in progress') + im('holefin', 'Picking where it finished')));
P.push(page(5, 'Score only rounds', 'If you track Score only, each hole is one screen.', ol(['The score starts at par. Tap <b>−</b> or <b>+</b> if it wasn’t par.', 'Tap your number of putts (optional).', 'Tap <b>Save</b> to move to the next hole. On hole 9 you can finish a 9-hole round.']) +
  `<p>After the round you get a scorecard with putts and greens. <b>Stats</b> shows your average score, best round, putts per round and greens in regulation.</p>${tip('Greens in regulation are worked out for you: if your score minus your putts is two or more under par, you hit the green.')}`,
  im('sohole', 'Score only hole')));
P.push(page(6, 'On your Apple Watch', 'Start the round on your phone and it appears on your watch.', ol(['After each shot, tap where it finished: Fairway, Rough, Green, Bunker, More or In the hole.', 'Turn the <b>Digital Crown</b> to set the distance, then confirm.', 'Before your first putt, tap where the pin is on the 3 × 3 grid.', 'Your phone keeps up – everything you enter on the watch shows in the round.']) +
  tip('The watch is in the iPhone app (not the web version). Keep the iPhone nearby during the round.'), im('watch', 'Entering a shot on the watch', 3)));
P.push(page(7, 'Reviewing a round', 'Open Rounds and tap any round.', `<p>The round page starts with your score, to par, yards and putts, then a <b>Quick view</b> of fairways, greens and putting with their strokes gained.</p>
  ${ul(['<b>Round takeaway</b> – the one-line story of the round.', '<b>Work on next</b> – one skill to practise, with a drill.', '<b>Scorecard</b> – every hole, with strokes gained by part of the game.', '<b>Stats list</b> – fairways, greens, putts, proximity and more; tap a line for the detail.'])}
  <p><b>Edit round</b> fixes any shot. The <b>☰</b> menu on a round shares it, makes a PDF or moves it.</p>`,
  im('summary', 'Round stats') + im('scorecard', 'Scorecard')));
P.push(page(8, 'My Game', 'Where your strokes go, for the period you choose.', `<p>The spider chart compares each part of your game – driving, irons, wedges, chipping, bunker, lag putts and short putts – against your benchmark (the dashed line). The further in a point is, the more strokes it costs you.</p>
  <p>The headline names your biggest leak. Pick <b>30 days</b>, <b>3 months</b>, <b>Year</b> or the <b>last few rounds</b>.</p><p><b>My Practice</b> (Every shot + improve) shows how your practice time is split, next to where you lose strokes.</p>${tip('<b>Tests</b> and <b>Trends</b> are one tap away at the top.')}`,
  im('mygame', 'My Game') + im('mypractice', 'My Practice')));
P.push(page(9, 'Stats', 'All the numbers, for any set of rounds.', `<p>Choose <b>All rounds</b>, the last few, one round, or pick rounds yourself. Each part of the game shows strokes gained; tap it to open the detail.</p>
  <p><b>Tournament vs practice</b> compares rounds you marked as tournaments with your practice rounds.</p><p><b>Create PDF</b> makes a report you can send.</p>`,
  im('stats', 'Stats') + im('tourvprac', 'Tournament vs practice')));
P.push(page(10, 'How you improve', 'With Every shot + improve, Strokewise runs a simple loop for you.', ol(['<b>Find</b> – your rounds show where you lose the most strokes.', '<b>Confirm</b> – a short-game test checks it’s a real gap, not one bad day.', '<b>Practise</b> – your weekly plan puts your practice time where the strokes are.', '<b>Adjust</b> – every Monday the plan looks at your latest rounds: what’s working, what slipped, and moves the minutes.']) +
  `<p><b>Trends</b> shows each part of the game with your practice time underneath, so you can see practice paying off – like the putting chart here: more putting practice, and strokes gained on the greens climbing.</p>${tip('Practice takes a few weeks to show fully in your rounds, so an area that is working keeps its time for a while.')}`,
  im('trendput', 'Putting: strokes gained vs practice', 3.2) + im('trends', 'Trends')));
P.push(page(11, 'Practice and tests', 'Your week, your log and your check-ins.', `${ul(['<b>Your week ahead</b> – each Monday: what’s working, what needs you, and this week’s targets by area.', '<b>Start a session</b> – a guided session from your plan.', '<b>Log practice</b> – tap + › Log practice, pick the skills and the minutes.', '<b>Short game test</b> – about an hour, once a month: putting, chipping, bunker and wedges. The same test every time, so you can see real progress.'])}
  <p><b>Your game and your training</b> puts strokes lost next to practice per week for each skill, so a gap jumps out.</p>`,
  im('practice', 'Your week ahead') + im('sgtest', 'Short game test')));
P.push(page(12, 'My Bag', 'Your clubs and how far you hit them.', `<p>Set your carry distances by club. They feed club performance in Stats.</p><p><b>Wedge matrix</b> keeps your partial-swing wedge yardages. <b>Adjust for playing conditions</b> changes carries for altitude and temperature.</p>`,
  im('bag', 'My Bag')));
P.push(page(13, 'Settings, backup and your coach', 'Open ☰ › Settings.', `${ul(['<b>Rounds</b> and <b>Courses</b> – everything you have saved.', '<b>Player</b> – change the name on your rounds.', '<b>Track</b> – Score only or Every shot.', '<b>Log practice</b> and <b>Practice recommendations</b> – turn the practice features on or off.', '<b>Backup</b> – save a copy of everything to your phone’s files or Google Drive, and restore it on a new phone.'])}
  <h4>Your coach</h4><p>Tap <b>Connect to a coach</b> and type the code your coach gave you. Your rounds, tests and practice are then shared with your coach automatically.</p>`,
  im('settings', 'Settings') + im('coachsheet', 'Connect to a coach')));
P.push(page(14, 'Help', 'Open ☰ › Help any time.', `<p><b>Get started</b> lists the steps for how you track. <b>Take the tour</b> shows how to enter a round on the phone and the watch, how to review a round and how you improve. <b>Read the guide</b> opens this document.</p><p>Questions or ideas: strokewise.app/support.</p>`,
  im('help', 'Help')));
const css = `@page { size: Letter; margin: .45in .5in; } * { box-sizing: border-box; } body { margin: 0; font: 10.5pt/1.42 -apple-system, "Helvetica Neue", Arial, sans-serif; color: #1c2a22; }
.cover, .pg { page-break-after: always; height: 10.05in; overflow: hidden; } .pg:last-child { page-break-after: auto; }
.cover { display: flex; gap: .45in; align-items: center; } .cover > div { flex: 1; } h1 { font: 300 44pt Georgia, serif; letter-spacing: .04em; margin: 0; color: #1f5b37; } .sub { font-size: 16pt; margin: 2px 0 18px; color: #4c6a57; }
.cv { font-size: 12.5pt; } .cover h3 { margin: 22px 0 4px; font-size: 11pt; text-transform: uppercase; letter-spacing: .08em; color: #4c6a57; } .cover ol { columns: 2; padding-left: 18px; } .ver { color: #7a8b80; font-size: 9pt; margin-top: 24px; }
.hd { display: flex; align-items: center; gap: 12px; border-bottom: 2px solid #2f6b3f; padding-bottom: 6px; } .n { background: #2f6b3f; color: #fff; border-radius: 50%; width: 30px; height: 30px; display: grid; place-items: center; font-weight: 700; }
h2 { margin: 0; font-size: 20pt; } .lede { font-size: 12pt; color: #3e5a49; margin: 10px 0 14px; } h4 { margin: 12px 0 2px; font-size: 11pt; color: #1f5b37; }
.cols { display: flex; flex-direction: column; gap: .2in; } .txt { font-size: 11pt; } .pics { display: flex; gap: .3in; justify-content: center; align-items: flex-start; }
ol, ul { padding-left: 20px; margin: 6px 0; } li { margin: 4px 0; } .tip { background: #eef5ef; border-left: 4px solid #2f6b3f; padding: 8px 10px; border-radius: 6px; }
figure { margin: 0; } figure img { width: 100%; border-radius: 12px; border: 1px solid #cfd8d2; box-shadow: 0 2px 8px rgba(0,0,0,.08); max-height: 5in; object-fit: cover; object-position: top; } figcaption { text-align: center; font-size: 8.5pt; color: #5d7064; margin-top: 4px; }`;
const html = `<!doctype html><html><head><meta charset="utf-8"><title>Strokewise – the guide</title><style>${css}</style></head><body>${P.join('')}</body></html>`;
(async () => { const f = path.join(TMP, 'guide.html'); fs.writeFileSync(f, html);
  const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox', '--allow-file-access-from-files'] }); const p = await b.newPage(); await p.goto('file://' + f); await p.waitForTimeout(800);
  const out = path.join(ROOT, 'help', 'Strokewise-Guide.pdf'); await p.pdf({ path: out, format: 'Letter', printBackground: true, preferCSSPageSize: true }); await b.close();
  console.log('guide', out, Math.round(fs.statSync(out).size / 1024) + ' KB'); })();
