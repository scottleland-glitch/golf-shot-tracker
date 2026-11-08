// Offline support: cache the whole app on install, serve cache-first.
// v159: the direction button just says "Direction" (a shot's direction isn't always a miss).
// v158: shot card – "to pin" on every shot, the full Finished list on the green too, labelled miss-direction and Penalty +1 buttons.
// v157: shot card entry (From / Club / Finished), greenside bunkers as their own SG area, hazard Drop or Re-tee, replay numbers at the shot's start.
// v156: beta bugs – Dir read along the player's line to the pin (replay, green close-up, putt maps), distance hit adds when long, replay hint moved off the map + room above the green.
// v155: My Practice shows a practice LEVEL – 42-day decaying average (minutes a week per skill) against the benchmark group's practice (D1 ~20 h/wk, Tour ~25, scratch ~7).
// v154: Reviewing a hole – "‹ Round stats" beside Share live goes back to Round stats where you left it.
// v153: Out of bounds needs a side – the direction picker turns off Short and Long on an OB row (corners stay); switching a row to OB clears a plain short/long.
// v152: Off the tee – a miss with no left/right is named as it was entered ("1 OB · no left/right", "hole 5 (OB, went short)").
// v151: Round takeaway, Off the tee picture – fairway shows 7/14 and a red line for misses with no side (e.g. "1 penalty · no side"), so the picture adds up.
// v150: the version shown in Settings now comes from sg.js (cached with the rest of the code), not config.js (network-first), so it can't show a newer number than the code running.
// v149: Round takeaway – Off the tee left / fairway / right now adds up; misses with no direction (or penalty, layup) are named by hole.
// v148: "Log this drill" from a round – My Game shows ‹ Round, and Save / Cancel go back to the round (no dead end).
// v147: Round stats – par 3 / 4 / 5 scoring curves: your other finished rounds in colour, this round dashed.
// v146: My Game – six "How well Strokewise knows your game" bars under the chart (learning, ready, strong); learning points are gold rings.
// v145: My Game – ＋ Log in the top bar; club practice (Driving, Irons 100+, Wedges) is Distance control or Mechanics.
// v144: PDFs – the round report has a Round takeaway page; the stats report has My Game and My Practice pages.
// v143: the Log practice sheet opens below the sticky top bar (title and day were hidden behind it).
// v142: Practice – + menu › Log practice (minutes per skill and focus), My Practice chart, strokes lost vs practice time, Log this drill on a round; My Game in the + menu.
// v141: My Game (mygame.js) – six-spoke game shape on Home (card) and its own page, with 30 days / 3 months / year / all time and the period before.
// v140: Round stats – Round takeaway (insights.js): "How well Strokewise knows your game" bars, headline, Work on next, area tiles, Went well.
// v101: OneDrive backup removed (Google Drive is the only automatic backup); Google Drive restore lists every round of a player to tick.
// v102: History is now "Rounds" (tight list); Archive is "Settings" in the + menu; My Bag has a Bag | Wedge ladder toggle (Profile gone).
// v100: Best vs worst rounds – "Where the strokes go" table split into Best / Worst column groups (Avg ft, GIR, SG) + Gap.
// v103: the round scorecard is one soft card that scrolls sideways (holes 1-18, OUT / IN / TOT) with strokes gained and stats rows.
// v104: putt misses only count putts of 10 ft and in; longer putts are lag putts (good = finished inside 3 ft).
// v105: putt misses and lag putts use only the FIRST putt of each hole (a tap-in after a lag putt no longer counts).
// v106: wording – "1st putt misses (<10 ft)" and "Lag putts (>10 ft)", values like 2/3 missed and 12/12 inside 3 ft.
// v106: Round stats – Missed greens L / R and short / long rows removed (data still recorded).
// v106: My Bag – "Adjust for playing conditions" (elevation / temperature sliders) is a collapsible section, closed by default.
// v112: percents in brackets, same colour as the number (9 / 12 (75%)); "1st putt misses" is now "1st putts made inside 10 ft" (made / tries).
// v111: Round stats list – a whole percent next to Fairways hit, GIR, 1st putt misses and Lag putts (screen + PDF page 1).
// v110: Stats page (+ menu › Stats) – strokes gained, FIR / GIR / short putts over time, averages table.
// v109: PDF report – columns line up (header over its numbers), nothing past the margins, light type, new scorecard page with all the SG rows.
// v108: My Bag – "Use density altitude" (one slider + typed box, -3,000 to 12,000 ft) with a ? help card; carries from ISA density.
// v107: app version shown small at the bottom of Settings and Home (v150: from VERSION in sg.js – must match this cache name).
// v106: lighter type everywhere – no large bold text (font sizes / weights only; PDF report unchanged).
// v99: Change player – move saved rounds to another player (History select mode + round page), Drive files follow.
// v98: Google Drive automatic backup + restore (gdrive.js), one folder per player, multi-phone merge.
// v97: Send round (file or PINHIGH1: code) + Add a round in History (share.js).
// v96: Round stats – Score/To par/Yards/Putts box on top, Quick view, collapsible stat tiles, smaller legend.
// v139: live scorecard fits every phone (both nines + Total line); a hole with only the pre-filled tee distance is not 'playing'.
// v138: PDF graphs full page width, about two per page (pages filled, shrink together >= 80%); sideways Fairways hit and missed picture on Driver page 2; roomier Summary table.
// v137: PDF covers (story look), Stats PDF one category per page + all-rounds par curves, round PDF = Stats graphs + tidy map cards per category, par curves all rounds colour / this round dashed; All putts map removed.
// v136: Best vs worst redone – sky look, per-round category tiles, From/Best/Worst/Diff table, one map with a Best / Worst switch (overlay removed).
// v135: app renamed Strokewise (Home, title, Home Screen name, PDFs, story picture with a small icon, live page, Send round). Address, PINHIGH1: codes, Drive folder and cache names unchanged.
// v134: Birdie zone renamed Scoring chances; no bird; Quick-view tiles, Stats-style pill, thin map, blue what-if ring.
// v133: story picture – strokes gained shows all four: off the tee, approach, around the green, putting; Total below.
// v132: story picture – avg 2nd putt replaces feet of putts holed; ⤢ opens it full screen, tap to zoom 2x.
// v131: Round stats – "Share to Instagram / TikTok" makes a one-page 1080x1920 story picture of the round (story.js).
// v128: Help page (+ menu › Help) – files in help/ (video, guide PDF, poster) are NOT in this cache and bypass this worker (network only, so iPhone Safari's Range requests for the video work).
// v113: "Courses near me" (near.js). The course finder list (data/us-courses.json, ~1.0 MB, ~0.28 MB gzipped) is NOT in this cache:
// the app downloads it on first use into its own cache 'pinhigh-courselist-v1', which a new version keeps (so no re-download).
// GolfCore scorecards (through the Pin High relay, pinhigh-golfcore.pinhigh.workers.dev) go straight to the network; the app saves each picked course with the saved courses.
const CACHE = 'golf-sg-v159';
const ASSETS = ['./', './img/home-bg.webp', './img/oriole.webp', './index.html', './styles.css', './sg.js', './birdie.js', './voice.js', './courses.js', './near.js', './bag.js', './wedges.js', './live.js', './share.js', './story.js', './insights.js', './mygame.js', './gdrive.js', './app.js', './config.js', './vendor/jspdf.umd.min.js',
  './manifest.webmanifest', './icons/apple-touch-icon.png', './icons/icon-192.png',
  './icons/icon-512.png', './icons/icon-512-maskable.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
// v95: scoring-page wedge dropdown = whole carry ladder for shots ≤100 yd, no preselect.
// v94: Wedges simple view + Edit button; wedge ladder dropdown on the scoring page for 40–110 yd shots.
// v93: Profile (+ menu) with My Bag and a Wedges chart (wedges.js).
// v92: My Bag (bag.js) – clubs, carries, elevation / temperature estimates.
// v90: "Hole out" box keeps the lie of the shot that went in.
// v89: the scorecard photo scanner is gone – this also deletes its old OCR cache ('pinhigh-ocr-v1') along with older app caches.
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE && k.indexOf('pinhigh-courselist-') !== 0).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin === location.origin && url.pathname.indexOf('/data/') >= 0) return; // v113: course finder list – the app caches it itself (own cache), never this one
  if (url.origin === location.origin && url.pathname.indexOf('/help/') >= 0) return; // v128: Help video / guide PDF / poster – straight to the network, never cached (keeps install small; lets iPhone Safari make its own Range requests for the video)
  if (url.origin !== location.origin) return; // Microsoft sign-in / Graph and the live-sharing database (firebaseio.com): always straight to the network, never cached
  // A live link (?watch=…) and the files it loads come fresh from the network while online, so family always get the current viewer
  // (even if their installed app is an older version); offline they fall back to the cache.
  if ((e.request.mode === 'navigate' && /[?&]watch=/.test(url.search)) || /[?&]watch=/.test(e.request.referrer || '')) {
    e.respondWith(fetch(e.request, { cache: 'no-store' }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(hit => hit || caches.match('./index.html'))));
    return;
  }
  // config.js (Google client ID, live database) is network-first so editing it takes effect without a new cache version.
  if (url.pathname.endsWith('/config.js')) {
    e.respondWith(fetch(e.request).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put('./config.js', copy)); return res; })
      .catch(() => caches.match('./config.js')));
    return;
  }
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || fetch(e.request).then(res => {
    if (res.ok && new URL(e.request.url).origin === location.origin) {
      const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy));
    }
    return res;
  }).catch(() => caches.match('./index.html'))));
});
