# Pin High (PWA) — formerly "Golf Shot Tracker"

Renamed to **Pin High** (title, home-screen label, header, PDF). Storage keys (`golfsg.*`) and backup files (`golf-rounds-*.json`) are unchanged, so restore keeps working.

Phone web app for tracking every golf shot and strokes gained against a selectable baseline (PGA Tour by default).
Static files only: no backend, no build step. Data is stored on the phone (localStorage).

## How a hole is entered (v3)
Each hole is a table. ONE ROW = ONE STROKE, hit from that row's Dist/Loc. Row 1 = Tee (hole length).
Dist = yards to the pin (feet on the green). Loc = where the ball was: Fairway, Rough, Bunker, Green, Hazard,
OB re-hit, In the hole, In the hole (chip/shot), Deep rough, Trees. The LAST row is "In the hole" with the
distance of the putt/shot that went in. LRSO = how the previous shot missed. P = +1 penalty to get here.
Score = rows + penalties. "Finish hole" is enabled only when every row is complete; "Edit this hole" reopens it.
Older saves are migrated automatically (a v2 "In the hole" row without a distance reopens the hole until filled).
Holed from off the green (v90): tick "Hole out" on the row of the shot that went in (any row but the first). Its Loc
(e.g. Rough, 25 yd) is kept, so strokes gained counts that shot from where it was really hit. Only one row per hole
can be ticked; rows after it are removed (with a confirm). Old "In the hole (chip/shot)" rows still work as before.

## Baselines (v4)
Pick a baseline per round (PGA Tour, LPGA Tour, D1 college men, D1 college women, scratch men, scratch women).
On the summary you can switch it for any saved round (instant recalculation) and see the same round
vs all six baselines side by side. Only the PGA Tour table is published (Broadie 2011, Table 9; putting from
Every Shot Counts Table 3.10). The other five are ESTIMATED: per-round gaps from SwingU/ShotByShot
(scratch men 5.5 strokes behind Tour: 2.5 tee / 1.5 approach / 0.5 short / 1.0 putting) scaled by Clippd's
Player Quality ladder, then spread over the PGA table. Full sources, method and caveats: in-app
"About the numbers" and the BASELINES comment in `sg.js`.

## Directions and maps (v5)
Dir = where the previous shot ended vs its target, 8 ways (Short = toward you, Long, Left, Right,
Short left/right, Long left/right), picked from a 3x3 grid. Old L/R/S/O saves become Left/Right/Short/Long.
Summary tiles: "Approach misses" (one per non-GIR hole: the regulation shot - see "GIR and misses (v12)") opens a map of misses around the green by direction; "Greens in reg." opens a
map with the hole in the middle and rings at 5-30 ft (radius = first-putt distance, angle = direction).
Both maps: This round / All rounds, legend, counts by direction.

## Pin location and fairway map (v6)
Each hole card has "Set pin location": a full-window green split 3x3 (back/middle/front x left/center/right,
front = toward you). Saved as `hole.pin` (backleft, backcenter, backright, midleft, center, midright,
frontleft, frontcenter, frontright, or empty) and exported in the CSV `pin` column.
Summary "Fairways hit" tile opens a bird's-eye fairway with every par-4/5 tee shot drawn as a tracer
(green = fairway, red = miss; end marker = rough/bunker/hazard/trees, X = OB), with left/right counts.

## Pin-location map (v8)
Summary "Pin location" tile: a full-window 3x3 green (same grid as the pin picker) with a badge per segment
(number of HOLES with the pin there, plus GIR x/y of those holes). Tap a segment: the flag is dropped there and
one dot per hole (its approach into the green) is drawn - white = green hit in regulation (first-putt ft + direction from the pin;
? = no direction, star = holed out), red = missed green (off the green in the miss direction, labelled with yards
left and where it finished). Same approach / reach-green rules as the other maps. Holes without a pin are
excluded and counted. This round / All rounds toggle.

## Files
- `index.html`, `styles.css`, `app.js` – the app
- `wedges.js` – Wedges chart (40–110 yd, every 10): options, summary line, tidy/merge helpers
- `bag.js` – My Bag: club catalog (manufacturers → models → lofts), bag helpers and the air-density carry model
- `near.js` – Courses near me (v113): distance, nearest, name/town search, matching a list course to GolfCore, and turning a GolfCore scorecard into a saved course
- `data/us-courses.json` – the course finder list (v113), built by `tools/build-course-list.py` from OpenGolfAPI (ODbL)
- `sg.js` – strokes-gained engine + Broadie baseline tables (sources/approximations documented at top)
- `sw.js`, `manifest.webmanifest`, `icons/` – offline + "Add to Home Screen"
- `tests/sg.test.js` – unit tests: `node --test tests/sg.test.js`
- `tests/bag-focused.js` – My Bag: physics checks + phone flow (`node tests/bag-focused.js`)
- `tests/wedge-ladder-focused.js` – Wedges simple view helpers + the wedge carry ladder on the scoring page: ≤100 yd boundary, three carries ±10 around the pin, no preselect, details, fallback, persistence (`node tests/wedge-ladder-focused.js`)
- `share.js` – Send round / Add a round: single-round payload, file name, PINHIGH1: text code (gzip + base64url), checks, duplicate test
- `tests/send-round-focused.js` – Send round / Add a round (v97): payload, file + code round-trips (with and without compression), errors, confirmation card, re-stamp to this phone's player, no duplicates, in the backup (`node tests/send-round-focused.js`)
- `gdrive.js` – Google Drive backup (v98): sign-in redirect + state check, Drive REST calls (folders, upload, update in place, download), multi-phone merge, sync step
- `tests/gdrive-focused.js` – Google Drive backup (v98) against a fake Drive: folders per player, upload / update in place, weekly copies, two phones on one account, expired sign-in, restore, disconnect (`node tests/gdrive-focused.js`)
- `tests/compare-focused.js` – Best vs worst rounds, including the v100 Best / Worst column groups fitting 390 px (`node tests/compare-focused.js`)
- `tests/change-player-focused.js` – Change player (v99): select mode, single round, new name, cancel, Rounds filter, Google Drive files following the move (`node tests/change-player-focused.js`)
- `tests/restore-list-focused.js` – Google Drive restore list (v101) and a phone that had OneDrive connected opening cleanly (`node tests/restore-list-focused.js`)
- `tests/fixtures/fake-drive.js` – in-memory fake Google Drive shared by the Drive tests
- `tests/round-stats-quick-focused.js` – Round stats page (v96): Score / To par / Yards / Putts box on top, Quick view with SG, collapsed stat tiles, smaller legend; uses the 78 at Arcade Creek in `tests/fixtures/arcade-78.js` (`node tests/round-stats-quick-focused.js`)
- `tests/profile-wedges-focused.js` – My Bag + Wedge ladder: menu, Bag | Wedge ladder toggle, accordion, persistence, backup (`node tests/profile-wedges-focused.js`)
- `tests/rounds-tight-focused.js` – Rounds page (v102): tight list, 8+ rows at 390x844, tints, unfinished flag, tap, delete confirm, filter, select mode (`node tests/rounds-tight-focused.js`)
- `tests/da-focused.js` – My Bag density altitude (v108): ISA conversion, DA at the baseline = no change, higher = longer, −1,200 ft = shorter, sliders and DA agree for the same air; checkbox swaps the controls, typing -1200, clamping, ± button, saved after reload, ? card with the App Store link, no outside network calls (`node tests/da-focused.js`)
- `tests/courses-near-focused.js` – Courses near me (v113): near.js helpers and conversion, then the phone flow with location, the course list and GolfCore all mocked – explanation line first, nearest 5 + Show more (one-line rows, 8+ on screen, distance at the right), search, tee dots (colours, two-tone, white circle for non-colour names, also in the course editor), Pebble import with tee ratings, saved course reused and edits kept, missing-holes note, "Is it one of these?", no connection / lookups used up, location off / no answer / unsupported, list cache kept across a service worker update, Settings credits; server on localhost:8850 (`node tests/courses-near-focused.js`)
- `tests/tee-collapse-focused.js` – New round tee list (v114): open while no tee is chosen; one-line, left-aligned rows of equal width (long names like "Sage Combo 3 Women" end in …, yards and rating on the same line); picking folds it to one row with ▾ and Start round on screen without scrolling; tapping the row opens it again; a remembered tee starts folded; "Compare my shots against" at least 44 px tall, light type, not squashed on a short screen; server on localhost:8862 (`node tests/tee-collapse-focused.js`)
- `tests/hole-tight-focused.js` – Compact hole screen (v115): header "Hole 1 · 349 yd · Par 4 · SI 7" from the scorecard with no 3/4/5 par buttons; earlier shots are tight lines (# · Hit · Club · Loc · SG chip) and only the active shot has entry cells headed "Dist to pin"; Hit and the "to" part of Loc ("Tee → Rough", "Rough → Green") stay "–" until the next shot's distance and lie are entered; no miss arrow; "Fairway → Bunker +1" not cut off at 375 px; tapping a line opens it for editing (club, Layup, P, Dir, delete, Hole out still work); par 3 (no Layup), first shot, finished hole (all lines, last "Holed"), and a hole with no card par (small 3/4/5 then "Par 4 ✎"); small light type, entry cells 36–40 px, Finish hole on screen with 3 shots; server on localhost:8864 (`node tests/hole-tight-focused.js`)
- `tests/version-focused.js` – the version line (e.g. "Pin High v127") on Settings and Home is small and light, and config.js `appVersion` equals the sw.js cache version (`node tests/version-focused.js`)
- `tests/pdf-focused.js` – the PDF report: page list, share / download name, every page has the player · course · date line and "Page x of n"; v109: every table's header and cells come from one column list (number columns right-aligned with the header at the same right edge, text left), no text past the right margin, and the PDF scorecard equals the on-screen scorecard row for row (`node tests/pdf-focused.js`)
- `tests/stats-focused.js` – Stats page (v110, rebuilt v116): + menu order, 7-round fixture (`tests/fixtures/stats-rounds.js`) – every graph point and table average equals the numbers on each round's own Round stats page; one graph each for TOT / OTT / APP / ARG / PUTT / Fairways / GIR, tap a point for its round, All rounds / Last 5 / Selected round, Compare columns in the table, baseline box, player chips, one round and no rounds (`node tests/stats-focused.js`).
- `tests/stats-graphs-focused.js` – Stats graphs (v116), fixture `tests/fixtures/stats-graphs-rounds.js` (6 finished rounds with par 3s / 4s / 5s, an ace, an albatross, a quadruple, a 9-hole par-3 course, 1 unfinished): par 3 / 4 / 5 curves equal a hand count of the saved holes, Eagle-or-better / Triple-or-worse buckets, x axis par−2 … par+3, the curve never dips below 0%, Last 5, Compare to all rounds overlay, Selected round list (newest first, tap a round or a grey dot), no par 4/5 → message and no OTT / fairway point, 390 / 375 px fit, light small fonts, 1 and 0 finished rounds; takes the `stats-v116-*.png` screenshots (`node tests/stats-graphs-focused.js`).
- `tests/stats-percent-focused.js` – Round stats list (v111/v112): whole percent in brackets, same colour as the number, next to Fairways hit / GIR / 1st putts made inside 10 ft / Lag putts, none on Pin location, Putts, Penalty, Tee misses L / R or x / 0; every row on one line at 390px, even 18/18 (100%) (`node tests/stats-percent-focused.js`)
- `tests/lag-putts-focused.js` – 1st putt misses (<10 ft) and Lag putts (>10 ft) use only the 1st putt of each hole (v105, wording v106): 10 ft boundary, 3 ft boundary, tap-ins after a lag putt not counted, This round / All rounds (`node tests/lag-putts-focused.js`) v117: the map has 4 buttons (6–10 ft, Under 6 ft, Over 10 ft, All putts); the headline is the Round stats number and a 2nd line says which set the map shows; the Lag tile opens on Over 10 ft.
- `tests/putt-lines-focused.js` – putt map lines (v117), port 8868: made putts = black line ending in the hole centre, missed = thin red line to where it finished; headline 5/7 (71%) equals the Round stats row (6–10 ft 3/5 + under 6 ft 2/2); Over 10 ft (lag) and All putts modes – All putts draws all 15 putts, each 2nd / 3rd putt starting where the one before finished; Putts map misses red with a Made (black) / Missed (red) legend; light fonts; no outside requests. Screenshots `putt-map-v117.png`, `putt-map-all-v117.png`, `putt-map-all-legend-v117.png`, `putt-map-lag-v117.png` (`node tests/putt-lines-focused.js`).
- `tests/club-driver-focused.js` – Club performance (v118), port 8869, fixture `tests/fixtures/club-driver-rounds.js`: Driver tiles (Fairways hit / Strokes gained / Avg drive) and the left rough · fairway · right rough picture match the fairway-map list (layups left out) for this round and all rounds; 3W fairways hit off the tee only; 7i GIR / SG approach / Proximity from regulation approaches only; 8i par-3 tee shot counts as an approach; wedge tiles; empty state; help hidden behind ⓘ until tapped; light small text; no outside requests. Screenshots `club-*-v118.png`.
- `tests/club-rings-focused.js` – Club performance lines (v119; feet v120), port 8870, same fixture: rings in feet every 10 ft (20 ft past 60 ft), dots at their distance in feet, Avg tiles and Gradient average in feet; rings 1.5px darker green-grey (inner dashed, outer solid), ring labels 11–12px darker with a halo, same in the Gradient view (rings above the colour, below the shot tags), wedge map, fairway-picture edges and box-plot ticks. Screenshots `club-*-v119.png`.
- `tests/prox-clean-focused.js` – Proximity page cleanup (v121; v122 richer colours and a touch bolder type – checks the green is rgb(92, 184, 92) with a darker edge, picked chips blue rgb(31, 115, 201), tiles and chips weight 400, title 500; saves `prox-vibrant-v122.png` and `prox-all-vibrant-v122.png`), port 8871, fixture `tests/fixtures/prox-rounds.js` (2 rounds, approaches 75–200 yd from fairway, rough, bunker and tee, hits, misses and an ace): same header / Close / small switch as Club performance, four small tiles in one row, distance chips All + 200…40 in 3 rows of 6 and lie chips in one row (thin borders, pale blue when picked), explanations behind ⓘ, map shapes with 1.5px outlines and light labels, blue / red tracers and the 40–200 distance logic unchanged, the map outside this page unchanged. Screenshots `prox-*-v121.png`.
- `tests/round-maps-light-focused.js` – round-page map sheets (v123), port 8872, fixture `tests/fixtures/round-maps-rounds.js` (2 rounds with par 3/4/5s, pins, tee shots to fairway / rough L-R / bunker / trees, greens hit and missed, 1-, 2- and 3-putts): GIR, approach misses, tee shots, putts, putt misses / lag / all putts and pin maps use the compact page (title 16px/500, small Close, 30px switches, plain Dots / Gradient), small legends (long notes behind ⓘ), thin tiles and chips, the v122 green with 1.5px edges, light hot-spot tags; dot / tracer counts and colours unchanged; the raw SVG (Compare / PDF) keeps its look; Proximity ring labels outlined; saves `round-after-*-v123.png`
- `tests/prox-bench-focused.js` – Proximity page (v124), port 8875, fixture `tests/fixtures/prox-rounds.js` (p1 set to D1 women, p2 to PGA Tour): at 390x844 the whole green is on screen under the compact controls (distance chips 2 rows of 9, lie chips 1 row, Dots / Gradient beside "Hit from", sky above the green cropped; the Gradient layer follows the crop); the red ring follows the round's benchmark ("D1 women avg 44’"), the page's benchmark selector switches it for this view only (saved baseline unchanged); the researched numbers at 150 yd (PGA Tour 28’, LPGA 32’, D1 men 34’, D1 women 44’, Scratch men 54’, Scratch women 89’) with ring size and zoom following; estimates marked "est." (Scratch women 106’ est. at 180, LPGA 47’ est. at 200); a distance a benchmark doesn't cover (Scratch women at 200) shows no ring, 90 ft and "<name>: no data at this distance"; a benchmark with no table shows "No proximity benchmark for … yet" and "(no data)"; All rounds uses the open round's benchmark and says so; other row shapes work as data only; Compare / PDF map unchanged; saves `prox-top-v124.png`, `prox-all-top-v124.png`, `prox-pga-v124.png`, `prox-scw-v124.png`, `prox-nobench-v124.png` (Scratch women at 200 yd)
- `tests/stats-cats-focused.js` – Stats categories (v125), port 8876, fixture `tests/fixtures/stats-cats-rounds.js` (6 finished rounds with first putts in every distance band and short shots from every lie and distance; c3 has no bunker shot and no first putt over 25 ft; c7 is the round in progress): the five Driver / Approach / Putting / Chipping / Scoring sections start closed, open and close on tap and stay open across range changes; drive box chart (Driver only) against the saved drives; putting and chipping graphs against `SG.statBuckets` (weighted per putt / shot, a round with none skipped); the open round's par curves over all rounds with the legend and the second Compare switch; no sideways scroll, light type; takes the six `stats-*-v125.png` screenshots.
- `tests/putt-miss-focused.js` – Putt misses (v126, v127: avg 2nd putt + captionless ⓘ on the count lines), port 8877, fixture `tests/fixtures/putt-miss-rounds.js` (the stats-cats rounds plus a putt direction on every missed first putt but one in twelve; 6 finished rounds + 1 in progress): the collapsed "Putt misses" sub-menu is last in Putting (under the SG graphs), the 8-zone grid's counts / % match `SG.puttMissGrid` for All and each band, bands = the SG first-putt bands, Last 5 + Compare (grey "all"), Selected round, no-direction count, plain white boxes with dark text (no red shading, no purple), green made box, subtle dark-red outline on the most common miss, blue selected chip, ⓘ help; takes `stats-putt-misses-collapsed/open/band-v126.png`
- `tests/stats-pdf-focused.js` – Stats PDF (v126, v127: avg 2nd putt in the grid headers), port 8878, same fixture: "Create PDF" → Letter PDF with header, averages table, every graph of all 5 categories (open or closed), putt-miss grids (All + 4 bands), par 3/4/5 curves with the last finished round over all rounds; text inside the margins, no graph cut by a page end, share / download, Last 5 and Selected round names, putt-miss PDF pages have no red shading or purple (pixel check), no button without finished rounds; takes `stats-pdf-button-v126.png`, `stats-pdf-page<N>-v126.png` and the putt-miss grid pages `stats-pdf-putt-misses-v126.png` / `-2-v126.png` (pdftoppm)
- `tests/help-focused.js` – Help page (v128), port 8890, own Range-capable server with the service worker on: + menu ends with Help, Get started steps, video (preload none, loads + seeks via Range requests that pass the service worker), guide PDF (200, new tab), nothing under help/ cached; takes `help-plus-menu-v128.png`, `help-page(-full)-v128.png`, `help-video-card-v128.png`
- `tests/menu-bag-settings-focused.js` – v102 navigation: Home only +, menu New round · Rounds · Stats · My Bag · Settings (v110 order), Bag | Wedge ladder toggle, Settings page (`node tests/menu-bag-settings-focused.js`)
- `tests/e2e.js` – Playwright (playwright-core) flow test at iPhone 390x844

## Hosting
Any static host (GitHub Pages works: Settings → Pages → deploy from `main` / root).
All paths are relative, so it works from a sub-path like `https://user.github.io/golf-shot-tracker/`.

## Install on iPhone
Open the URL in Safari → Share → "Add to Home Screen". After the first load it works with no signal.
Note: rounds are saved per web address, so keep using the same URL.

## Proximity by distance (v11)
Stats page → **Proximity by distance** tile (value = average proximity of all approaches from 40–200 yd) opens a full-window view.
- **Yardage rail (v13, replaced the dropdown):** a column of 17 tap buttons left of the map, 200 at the top (farther = up) down to 40, plus an "All 40–200 yd" button above the map. A shot goes to its regulation shot's starting distance rounded to the nearest 10 yd, halves up (144 → 140, 145 → 150; so 150 = 145–154.9 yd). Shots that round outside 40–200 are left out and counted in a note. Buttons show their shot count; empty ones are greyed out and disabled; the selected one is black with a yellow ring. Stats, map and misses-by-direction follow the selection; if a scope switch empties the selection it falls back to All.
- **Which shot (one per finished hole):** the regulation shot (see "GIR and misses (v12)"): the shot that reached the green in regulation (blue) or the regulation miss (red), bucketed by the distance it was hit from.
- **Map:** green with white rings every 5 ft to 30 ft and room around it. Tracers come up from the bottom (the golfer). Blue = hit, placed at first-putt feet in the recorded direction, labeled in ft (★ = holed). Red = miss, placed in the miss direction at yards-left × 3 ft on the same scale, labeled yards + lie. Misses farther than the picture are clamped to the edge and marked "›". No direction entered: blue "?" straight up at the right distance, red "?" in the bottom-right corner.
- **Stats:** shots, greens hit %, average proximity on greens hit (ft), average proximity overall (misses = yards × 3; OB has no proximity and is left out of the averages), plus misses by direction. This round / All rounds toggle.

## GIR and misses - Scott's definitive rule (v12)
Applies to the GIR tile + map, Approach-miss tile + map, Pin location map, Proximity by distance, the
"Missed greens left/right/short/long" stats and the CSV (`gir` = yes/no per hole, `regulation` = GIR/miss on the regulation shot's row).
- Regulation stroke = par − 2 (par 3: tee shot, par 4: 2nd shot, par 5: 3rd shot), penalty strokes counted.
- GIR: a ball reaches the green (or is holed; a chip-in from ≤30 yd right after also counts) by then. GIR position = first-putt distance/direction (holed = ★).
- Strokes-gained categories: Off the tee = par-4/5 tee shots; Approach = every other shot from more than 30 yd off the green (par-3 tee shots included), by 30-60 (over 30 to under 60), 60-100, 100-130, 130-160, 160-200, 200+ yd (lower number included) with average distance to the pin after the shot (ft on the green, yd x 3 off it, 0 holed; penalty/OB shots left out); Short game (ARG) = off the green from 30 yd and in (`SG.SHORT_MAX_YD`; v125 – was 20 yd in v101–v124); Putting = from the green.
- Otherwise the hole is a miss and the miss is the regulation shot, drawn where it finished (lie, direction, distance to the pin).
  A par-4 tee shot or par-5 2nd shot short of the green is never a miss. If stroke par − 2 was a penalty stroke, the ball actually struck before it is used (e.g. par-4 tee shot OB → the tee shot is the miss; par-5 tee OB → the re-tee, stroke 3, is the miss).
- Exactly one entry per finished hole: GIR + misses = holes, everywhere. The old 50-yd lay-up exclusion and "shot's own result" rule are gone.
- Fairways hit: par-4 and par-5 tee shots only.
- Tracers on the fairway and proximity maps are drawn as gentle ball-flight arcs.

## Proximity: starting lies (v14)
- The strip under the green shows where shots come from: fairway in the middle, rough both sides, a bunker (right), the tee box (par 3s) at the bottom and a trees/other corner (bottom left). Each tracer starts (small white ring) at the lie its regulation shot was hit from. Rough shots go left/right by the direction entered for the shot before (the Dir on that row); with no left/right recorded, the side with fewer shots.
- Lie groups: Fairway, Rough (rough + deep rough), Bunker, Tee, Other (trees, hazard, anything else).
- Lie buttons (All lies / Fairway / Rough / Bunker / Tee / Other, with counts; empty ones greyed out) filter the map, stats, misses-by-direction and the yardage counts. Empty selections fall back to All.
- "By lie" table for the selected yardage: shots, greens hit x/n (%), avg proximity on greens hit, avg overall.
- Practice warning (red row + message): a lie with 3+ shots and no greens hit ("From the rough you've missed 4 of 4 greens — worth some practice."), or 30+ points below the fairway's % (fairway needs 2+ shots).

## Player names (several phones)
Each phone sets a Player name (Settings, or the Player row when starting a round). Its rounds are stamped with that name. Backup files are named after the player (`golf-rounds-<name>.json`), and Google Drive keeps one folder per player. History can filter by player.

### Future PDF report: colour by distance group (not in the app)
For the planned PDF report, approach tracers can be coloured by the strokes-gained distance group. The helper is in sg.js: `SG.REPORT_GROUPS` (id, name, color, colorName, halo) and `SG.reportGroup(yd)`. Groups are 30–60 (over 30 to under 60), 60–100, 100–130, 130–160, 160–200 and 200+ yd; 30 yd or closer = short game, returns null. Colours: 30–60 purple #6a1b9a, 60–100 blue #0d47a1, 100–130 teal #00838f, 130–160 amber orange #ffb300 (dark halo), 160–200 magenta #d81b60, 200+ brown #6d4c41. When colour means distance, show hit/miss with the end marker: filled dot = hit, white ring with ✕ = miss. The full map implementation is in commit b59bc90; screenshots are screenshots/46*.png. The in-app Proximity map stays as in v22 (40–200 yd 10-yd rail, blue hit / red miss).

## PDF round report (v25)
On any round's stats page tap **📄 Make PDF report**. Built on the phone, offline (jsPDF 4.2.1 bundled in `vendor/`), letter portrait, 9 pages:
(v109 layout: 1 round summary + Quick view + Round stats · 2 scorecard (all rows, see below) · 3 strokes gained … then the map pages)
1 header + score + scorecard + key stats · 2 strokes gained (category, by distance with avg to pin after, every baseline) ·
3 fairways · 4 GIR · 5 approach misses · 6 pin location (one green, 3x3 grid, badge + mini plots per segment, table; empty segments skipped) ·
then one proximity page per distance group with shots (`SG.REPORT_GROUPS`, group colour, lie strip, stats, by lie, misses by direction; first one carries an all-groups summary; empty groups skipped) · 1st putts · 2nd putts. Maps are rendered to 3x images.
Save with the share sheet (`Golf-Round-<date>-<course>-<player>.pdf`, letters/digits/hyphens only; shared as files only, no title/text, so iOS Mail sends it).

## Clubs and layups (v49)
Each shot row (except putts on the green) has an optional club picker: Driver, 3W, 5W, 7W, 4H, 5H, 5i–9i, PW, 52, 54, 56, 58, 60. The tee row on par 4/5s has a **Layup** checkbox.
A layup tee shot is excluded from strokes gained entirely: its SG is set to 0, it is not counted in Off the tee (shots or SG) nor the SG total. The score is unchanged. Stored as `row.club` / `row.layup` (optional fields; older rounds load unchanged); included in backups and the CSV (`club`, `layup` columns).

## My Bag and Wedge ladder (v93; page layout changed in v102)
The **+** menu is New round · Rounds · **Stats** · **My Bag** · Settings (Stats added in v110). My Bag has a **Bag | Wedge ladder** toggle at the top (see v102 below). The player name is in Settings.

**Wedges**: one row per yardage, 40–110 yd in 10-yard steps (40, 50 … 110 – 8 rows). Collapsed, a row shows a one-line summary (e.g. `54° · middle · 1–2° · P2 · hinge 90°`) or "Not set". Tap a row to open it (one open at a time): **Club** (short clubs from My Bag – wedges, PW, 9i, anything 40°+ – shown without carries, since distance depends on the setup; the standard PW/48–60° list if the bag has none; "Other" for free text), **Ball position** (Front, Middle, Back), **Shaft lean** (0°, 1–2°, 3–4°), **Club position** (swing positions P1, P2, P3), each with an optional note, and **Hinge** (wrist hinge: 45°, 90°, Full). Tap a selected chip again to unselect. Saves as you tap/type to `golfsg.wedges.v1`; "Clear" empties a yardage. Included in backups (`wedges` key) and restored when the phone's chart is empty or the backup's is newer; older backups without it restore as before. Entries saved at 45, 55 … 105 yd by the first (5-yard) v93 draft are kept in the stored data and backups, just not shown. Charts saved with the first v93 draft options are converted when read (ball Back/Back of center → Back, Center → Middle, Forward/Forward of center → Front; lean Neutral → 0°, Slight → 1–2°, Strong → 3–4°, Leaning back → a note; old clock hand positions → a Club position note).

## Wedge ladder (v94, v95)
- **High / Low flight:** every yardage has two setups. The **High flight · Low flight** toggle at the top of the Wedge ladder (opens on High) switches the whole list; the header count, row summaries, simple view, Edit and Clear all work on the selected flight. Stored in `golfsg.wedges.v1` as `rows` (High – v93 charts and old backups land here, Low starts empty) and `low` (Low); both go into backups and restore. The Profile card shows e.g. "3 of 8 yardages set · Low 1 of 8".
- **Wedges page:** opens in a simple view. Tapping a yardage that's set shows just three lines – Club, Ball position, Club position (shaft lean and hinge are still saved, just not shown); the row headers show club · ball · position. Tapping an empty yardage opens the full editor. The **✎ Edit** button under the list turns on edit mode (it reads **✓ Done editing**): tapping any yardage opens the full editor (club, ball position, shaft lean, club position, hinge, notes, Clear/Done) and the headers show everything.
- **Scoring page (v95):** the Wedges yardages are **carry** distances, not distances to the pin – a 50 yd pin on a downhill lie may want a 40 yd carry that bounces and runs out; a 60 yd pin on an uphill slope may want a 70 yd carry that lands and pulls back. So any shot **100 yd or less** (more than 0; not on the green, not OB) gets a **Wedge** dropdown instead of the club picker. It lists three carries around the pin distance: the distance rounded to the nearest 10 (halves round up – 73 → 70, 75 and 77 → 80), then 10 less and 10 more, slid to stay inside 40–110 (60 → 50/60/70, 73 → 60/70/80, 77 → 70/80/90, 40 or a 15 yd chip → 40/50/60, 100 → 90/100/110). Each carry appears under **High flight** and **Low flight** (e.g. "70 yd · High · 54° · Middle · P2"), so about 6 entries; carries with no club yet show greyed ("70 yd · Low · not set") and can't be picked. Nothing is preselected ("Choose carry…"). Typing a different distance redoes the three carries but never picks or changes anything; a carry you already chose stays selected (and stays in the list) even if it's outside the new three. Choosing one sets the shot's club (strokes gained and club stats work exactly as before), saves the carry and flight on the shot (`wedgeY`, `wedgeF`) so it shows again after a reload, and shows a small card under it: Flight, Carry, Club, Ball, Position, plus lean and hinge if set. "Choose carry…" clears it.
- Over 100 yd → the normal club picker (a club chosen from the ladder stays). If no yardage has a club in either flight, shots use the normal club picker. A shot that already has a club that isn't a ladder pick (e.g. 7i at 100 yd, or an automatic pick from v94) keeps it and shows it in the dropdown. Voice entry is unchanged.

## Round stats page (v96)
- **Top box** (right under the title bar): **Score · To par · Yards · Putts**. The big "78 / +6 vs par · 18 holes done" header, the old TOTAL row under the scorecard and its Par / "18/18 holes" columns are gone. To par counts finished holes only; a round that isn't finished shows a small "thru N" under the score.
- **Quick view** (under the box): three tiles – **Fairways** % (hit / par-4 and par-5 tee shots), **GIR** % (greens / finished holes) and **Putts** (total, per hole). Each shows the strokes gained of its category, green when positive and red when negative: Fairways → *Off the tee* SG, GIR → *Approach* SG, Putts → *Putting* SG (the same numbers as in the Strokes gained section, against the round's baseline).
- **Stats:** every detailed tile (Fairways hit, Greens in regulation, Approach misses, Proximity, Pin location, Putts, 1st putt misses (<10 ft), Lag putts (>10 ft), Club performance, Penalty strokes, Tee misses L / R) is a row that starts **collapsed** with its headline number on the right. Tap the row to open it (the full tile – tap it again for the map) and tap again to close it. Open rows stay open while you go in and out of maps; another round starts collapsed.
- The scorecard legend is smaller and lighter, and the "Blank = hole not finished…" note is gone. The scorecards (tap a hole to edit) are unchanged. The live-share viewer is unchanged.

## OneDrive removed (v101)
Google Drive is now the only automatic backup. The OneDrive card, sign-in (MSAL), *Restore from OneDrive*, *Save to OneDrive* for PDFs and the OneDrive settings in `config.js` are gone, along with `onedrive.js`, `vendor/msal-browser.min.js` and their tests. **Back up rounds** (to a file), **Restore from backup** (a file) and **Export all rounds (CSV)** stay.

A phone that had OneDrive connected just opens as normal. The old OneDrive settings and the Microsoft sign-in it kept on the phone are quietly cleared, and a leftover Microsoft sign-in return in the address bar is ignored. Nothing in OneDrive itself is touched: the backups already there stay where they are (OneDrive › Apps › Golf Shot Tracker).

## Restore from Google Drive (v101)
Settings › Google Drive › **Restore** → pick a player (e.g. Quincy) → *Latest backup* or a weekly copy → **Quincy's rounds**:

- **Every round in that backup is listed**, newest first, with its date, course, score and to par. Nothing is filtered out. If the same round is in the file twice, it is listed once (the newer copy).
- **Not on this phone:** ticked to start with. **On this phone:** greyed out and can't be ticked. If the backup has a newer copy of a round that's on the phone, it says *backup copy is newer* and you can tick it to update it. If the phone's copy is newer, it says so and that round is left alone.
- **Select all missing**, **Clear**, a running **N selected**, and **Restore N rounds** at the bottom. Tap **›** on a round to look at it first (read-only).
- Restored rounds go into Rounds under that player's name (rounds in the file with no name get the folder's name) and keep their ids, so nothing is doubled up and later backups match them. A newer copy on this phone is never replaced.
- Restoring from a file (**Restore from backup**) still uses the earlier tick-the-rounds screen.

## Best vs worst rounds (v100)

The "Where the strokes go" table on the Best vs worst rounds page is laid out more clearly now:

- **Best** and **Worst** each get their own group of columns. Best is tinted soft green and Worst soft red. The top of each group says how many rounds it covers and their average score; with one round it shows the date and score instead.
- Each group has three short columns: **Avg ft** (how far from the hole your approaches finished), **GIR** (greens hit) and **SG** (strokes gained per round). Each cell now holds one number, so there are no more "27 ft · 30 ft" cells.
- **Gap** sits on the right behind a thin divider line and keeps its colours: green when your best rounds do better there, red when they don't.
- Rows are the distance ranges, grouped under small labels: Approach (yards), Short game (yards) and Putting (first putt, feet).
- It fits a 390 px phone screen without anything wrapping or getting cut off.
- The lists of best and worst rounds above the table are now tinted cards showing the date, course and score.

## Change player (v99)
For rounds saved under the wrong name (e.g. Quincy's rounds saved as *Scott Leland*).

- **Rounds → 👤 Change player**: tap the rounds to move (a tick shows), or use *Select all shown* – pick a player chip first to see only that player's rounds. The bar at the bottom says *Move 3 rounds to…*.
- Choose a name: the names already on this phone (from rounds and the Player name; *Quincy* comes first as the suggestion), or *New name…* to type one. Typing an existing name in any upper/lower case uses that name.
- A card asks first – *Move 3 rounds to Quincy?* – with *Move* / *Cancel*. Cancel changes nothing (in Rounds your ticks stay).
- One round: open it and tap **👤 Change player** under *Send round*.
- What changes: only the round's player name, plus an *updated* time (so it wins when phones' backups are merged) and a small note of the old name (`movedFrom`). Same round id, shots, stats.
- **Backups:** Google Drive backs up straight after. In Google Drive the round goes into the new player's file and is taken out of the old player's file (the note tells the old file to drop that round unless it was changed somewhere else after the move). Weekly dated copies made before the move are left as they were.
- A round sent with *Send round* doesn't carry the note.

## Google Drive backup (v98)
The automatic backup in **Settings** (the only one since v101 – OneDrive was removed).

- **Connect Google Drive** opens Google's own sign-in page (the whole screen, no pop-up – pop-ups don't work in an iPhone home-screen app) and comes back to Settings. The app can only see files it made itself (Google's `drive.file` permission) – nothing else in your Drive.
- **Where it goes:** My Drive › **Pin High Backups** › one folder per player (*Scott*, *Quincy* …). In each: `golf-rounds-<name>.json` (always the latest) and a dated copy once a week (`golf-rounds-<name>-YYYY-MM-DD.json`).
- **Which folder:** every round goes to the folder of *its own* player. A round Scott keeps for Quincy on his phone goes to Quincy's folder. Rounds with no player name go to this phone's player. My Bag and the Wedges chart go only in this phone's player's file; saved courses go in every file.
- **Several phones, one Google account:** before each upload the app reads the file already in Drive and adds its rounds to the new one (matched by round id), so one phone never wipes out another phone's rounds. If both have the same round, the one changed most recently wins (each round now carries an `updated` time, set whenever it is saved). A round deleted on one phone stays in Drive if it is still in Drive.
- **When it backs up:** by itself after a round is saved or finished, after changes to courses / bag / wedges / name, and when the app is opened – as long as you are signed in.
- **Sign-in runs out after about an hour** (Google doesn't give this kind of app a long sign-in). Nothing is lost: changes wait, Settings shows a small *Sign in to Google to back up* button (never on Home, never a surprise jump to Google), and the waiting backup goes up straight after you sign in.
- **Restore** → pick a player → *Latest backup* or a weekly copy → a list of every round in that backup (see *Restore from Google Drive (v101)*). Nothing on the phone is deleted. My Bag / Wedges only come along from your own folder.
- **Disconnect Google Drive** signs this phone out (and tells Google to drop the sign-in). The backups stay in Drive.
- Set up in `config.js` → `googleClientId` (public ID, no secret). Google Cloud: OAuth client type *Web application*, authorised JavaScript origin `https://scottleland-glitch.github.io`, redirect URI `https://scottleland-glitch.github.io/golf-shot-tracker/` (exact, with the slash).
- iPhone note: if the app is installed on the Home Screen, Google's page opens inside the app and comes back to it. If iOS ever opens it in Safari instead, the sign-in lands in Safari – open Pin High from the Home Screen and tap *Sign in to Google* again.

## Send round (v97)
For sending one saved round to another phone (e.g. Scott keeps score at Quincy's tournament and sends the round to her phone). No accounts or server – the round travels as a file or a text code.
- **Send:** Round stats → **📤 Send round** (under Export CSV). The sheet has two choices:
  - **📄 Send as a file** – opens the iPhone share sheet (AirDrop, Messages, Mail, Save to Files) with `Pin-High-Round-<date>-<course>.json`. Phones without a share sheet download the file instead.
  - **💬 Send as a text code** – a code starting `PINHIGH1:` that holds the whole round. It is gzip-compressed (about 750 characters for an 18-hole round) when the phone can compress (iOS 16.4 and newer), otherwise plain, about 6,000 characters. It opens the share sheet with a short message plus the code; if there is no share sheet it copies the code ("✓ Copied") and shows it in a box.
  - The file and the code carry `{ pinhigh: 'round', v: 1, sent, round }`. The round is exactly as stored, the same as in the backup file: every hole and shot, pins, clubs, course, tee, date, baseline.
- **Receive:** Rounds → **📥 Add a round** (tools row above the list) opens a sheet with **📂 Choose file** and **Paste code** + **Add**. The pasted text can be the whole message – the app finds the `PINHIGH1:` code in it. Anything else gets a friendly message:
  - not a code
  - not a Pin High round
  - damaged
  - from a newer version
  - a full backup file, which points to Settings → Restore from backup
- **Confirmation card:** shows course, date (and tee), score, to par and holes, with "Goes into <player>’s rounds". Then **Add** / **Cancel**.
- **Add:** the round keeps its original id. It is stamped with *this* phone's player name (no name set → it simply counts as this phone's own). It is never the round in progress.
- **No duplicates:** if the same id – or the same course, start time and identical shots – is already there, the app says "This round is already in your history" and adds nothing.
- **After adding:** **View round** opens its stats. Strokes gained and every stat are worked out on the phone as for any round, and it goes into this phone's backups like any of the player's own rounds.

## My Bag (v92)
Open from the **+** menu → **My Bag** (Bag tab). Add clubs by manufacturer → model → club/loft (Titleist, TaylorMade, Callaway, Ping, Srixon, Cleveland, Mizuno, Cobra, PXG, Wilson, Bridgestone, Honma, Tour Edge, XXIO, Vokey, Scotty Cameron, Odyssey, Ben Hogan, Sub 70, Lynx; "Other brand" / "Model not listed" for anything else, plus a custom club name and loft). Lofts are typical stock lofts and editable. One club per name (adding a second 7i replaces the first). Enter each club's **carry** in yards; sort by club or by carry; tap a club to edit or remove it.

**Baseline** = the conditions the carries were hit in (default Reno: 5,000 ft, 70°F; "Change" to edit). The **elevation** (0–9,000 ft) and **temperature** (30–110°F) sliders show every club's carry for other conditions, with the difference; "Back to my baseline" resets them. "Show these carries in the club picker" labels the round's club picker (e.g. `7i · 144`).

Physics: a point-mass ball flight (drag + lift, spin decay) is solved per club at its loft with typical launch/spin, with ball speed calibrated so the baseline conditions give exactly the entered carry; the new carry = entered carry × (simulated carry in the new air ÷ simulated carry in the baseline air). Air density from the ISA pressure at that altitude and the temperature (dry air). Roughly +1.2% per 1,000 ft for a driver and ~1.5 yd per 10°F, in line with published rules of thumb (Titleist ~1.16%/1,000 ft). Example: 250 yd driver / 150 yd 7i at Reno 5,000 ft/70°F → about 239 / 144 yd in San Diego (0 ft, 75°F). Not included: wind, humidity, ball temperature, firm/soft ground (roll).

In a round, when the bag has clubs, the club picker lists only bag clubs (no putter); a shot that already has a club not in the bag still shows it. Voice clubs map to the bag (e.g. "gap wedge" → your GW or the nearest wedge loft). Strokes gained is unaffected. Stored in `golfsg.bag.v1`; included in backups (`bag` key) and restored when the phone's bag is empty or the backup's bag is newer.

## Rounds, Settings and My Bag (v102)
- **Rounds** (was "History"): a tight list, like a scorecard app's Scores list, instead of big tiles. A small header row (Score · Holes · Date · To par/SG · Course), then one thin row (about 58 px) per round inside one soft rounded panel with thin lines between rows – 10 or more rounds fit on an iPhone screen without scrolling.
  - **Score circle** tinted by to par, counted per 18 holes so a 9-hole round is judged fairly: under par = soft green; even to +18 (par to bogey golf) = soft blue-grey; worse than +18 = soft red.
  - **Holes pill**: 18 (or 9); an unfinished round (fewer holes done, or the round in progress) shows the holes done in a dashed amber pill, and "Unfinished" in front of the tee/player line.
  - **Date** as 07/13 with the year small underneath; **To par** with SG small and coloured underneath; **Course** with tee · player small underneath.
  - Tap a row to open its round stats. A small grey 🗑 at the far right of each row deletes – it still asks "Delete the round from … for good?" first.
  - Tools are one slim row of small buttons: 📥 Add a round · 👤 Change player · ⚖ Best vs worst · 🎯 Birdie zone. The player filter is a slim row of chips. Select mode (Change player) puts a tick circle in front of each row and hides the trash.
  - Every "History" label now says "Rounds" (+ menu, page title, ‹ Rounds back buttons, Settings button, tips, messages). Internal names (`history` screen, `data-act="history"`) are unchanged.
- **Settings** (was "Archive"): the Archive button on Home is gone; the same page now opens from the **+** menu as **Settings** (title, ‹ Settings back button from Courses, tips and messages renamed). Home shows only the **+** button (and Resume when a round is going).
- **+ menu**: New round · My Bag · Rounds · Settings. **Profile is gone** – once My Bag and Wedges moved out it only held the player name, which Settings already shows, so the name lives in Settings only.
- **My Bag** has a **Bag | Wedge ladder** toggle at the top. Bag = the clubs view (carries, elevation/temperature, sort, add/edit); Wedge ladder = the Wedges view (40–110 yd, High/Low flight, Edit). Both use ‹ Home; there is no separate Wedges button.
- Cache `golf-sg-v102`.

## Scorecard (v103)
The round's scorecard is now **one soft, rounded card** (it replaces the old Front 9 and Back 9 tables). Swipe it sideways to see more: holes 1–18, then **OUT**, **IN** and **TOT**. The row names stay stuck on the left while you swipe, and the swipe glides on iPhone. Rows are short (about 31 px), the type is light, and the lines are thin. The page itself never scrolls sideways. Tap any cell in a hole's column (hole number, score, any stat) to open that hole, the same as before. Holes not finished yet are blank, apart from their par and length.

Rows, in three groups split by a thin line (there is no player-name row):
- **Score group**
  - **Hole** – 1 to 18.
  - **Par** – the hole's par.
  - **Length** – the hole's yards (the tee distance you typed).
  - **Score** – your strokes, penalties included, with the usual shapes: circle = birdie, double circle = eagle or better, square = bogey, double square = double bogey or worse, plain = par. The small legend under the card explains them.
- **Strokes gained group** – same numbers as the Strokes gained section, split per hole. Green = gained, red = lost; the deeper the colour, the bigger the number. A blank cell means no shot of that kind on that hole (e.g. OTT on a par 3).
  - **TOT** – strokes gained for the whole hole.
  - **OTT** – off the tee (tee shots on par 4s and 5s).
  - **APP** – approach (shots from more than 30 yd, including par-3 tee shots).
  - **ARG** – around the green (shots from 30 yd or less, off the green).
  - **PUTT** – putting (every stroke from the green).
- **Stats group**
  - **Putts** – strokes played from the green.
  - **GIR** – ✓ when you were on the green in regulation (par minus 2 strokes, penalties counted), ⊘ when you weren't.
  - **Club** – the club you hit off the tee, if you picked one (Driver shows as DR, 7i as 7I). Blank if no club was picked.
  - **FIR** – fairway hit off the tee on a par 4 or 5 (✓ / ⊘); a dash on par 3s. Same rule as the Fairways number.
  - **Drive dist** – how far the tee shot went on a par 4 or 5 (tee distance minus the distance left), in yards. Blank on par 3s and when the tee shot was OB or a penalty.
  - **1st putt** – how far away your first putt was, in feet.
  - **Last putt** – how long the putt you holed was, in feet (on a one-putt it's the same as the 1st putt; blank if the ball was chipped in).
  - **Up & down** – you missed the green in regulation and then had a short-game shot (off the green, 30 yd or less): ✓ if you holed out in 2 strokes or fewer from there, ⊘ if not. Blank when there was no chance (green hit in regulation, or no shot from 20 yd or less).
  - **Sandies** – the same, when that short-game shot was from a greenside bunker.
  - **Recovery** – a shot (not the last one) finished in trouble: in the trees, in a hazard / penalty area, OB or with a penalty. ✓ if you still made par or better, ⊘ if not. Blank when nothing went into trouble.
- **OUT / IN / TOT columns**: par, length, score, putts and strokes gained are added up (finished holes only). GIR, FIR, Up & down, Sandies and Recovery show "made / chances", e.g. GIR 7/18, FIR 8/14. Drive dist, 1st putt and Last putt show the average. Club is left blank.
- Cache `golf-sg-v103`.

## Putt misses and lag putts (v104)
_(v105 changed these to the first putt of each hole only – see below.)_
Putts are now judged in two ways, depending on how far away they start (the first-putt distance of each putt, any putt on the hole):
- **Putt misses (10 ft and in)** – only putts that start **10 ft or closer** count. Two groups: **Under 6 ft** and **6–10 ft** (a putt from exactly 10 ft is in the 6–10 ft group). The old 10–20, 20–30 and 30–50 ft groups are gone from the tile, the map buttons, the help text and the PDF. The tile shows how many of these putts you missed and "made X/Y (putts of 10 ft and in)".
- **Lag putts (over 10 ft)** – every putt that starts **more than 10 ft** away. It doesn't need to go in, it just needs to finish **inside 3 ft**: a putt that finishes 3 ft or closer (exactly 3 ft counts) or goes in is good. The new tile, right under Putt misses, shows e.g. "4 / 6" and "4 of 6 finished inside 3 ft (67%) · avg leave 3.4 ft". Avg leave = the average distance left after the lag putt (holed = 0 ft). Where a putt finished uses the same finish distance as the putt-misses map (the next putt's distance).
- Tap either tile to open the putt-misses map. Under the map a **Lag putts** box shows the same lag numbers for the scope you pick – **This round** or **All rounds** – and the PDF's putt-miss pages show them too.
- Not changed: strokes gained (including putting), the 1st putt stats and the putting map.
- Cache `golf-sg-v104`.

## Putt misses and lag putts – first putt only (v105)
_(v106 renamed these and shortened the wording – see below; the counting is the same.)_
Both stats now look at **only the first putt on each hole**. A second or third putt never counts, so a tap-in after a lag putt no longer pads the numbers.
- **Putt misses (1st putt, 10 ft and in)** – the hole's first putt, when it starts **10 ft or closer**. Groups: **Under 6 ft** and **6–10 ft** (a first putt from exactly 10 ft is in 6–10 ft). The row reads e.g. "2 of 3 missed"; opened, the big number is the misses and the line under it reads "Missed 2 of 3 first putts from 10 ft and in (made 1)".
- **Lag putts (1st putt, over 10 ft)** – the hole's first putt, when it starts **more than 10 ft** away. Good = it went in or finished **within 3 ft** (exactly 3 ft counts). The row reads e.g. "3 of 5 inside 3 ft"; opened: "3 of 5 first putts from over 10 ft finished inside 3 ft (60%) · avg leave 3.9 ft" (avg leave = average distance left after that first putt, holed = 0).
- The putt-misses map (This round and All rounds) uses the same first putts: title "Putt misses – 1st putts", "N missed of M first putts from 6–10 ft", a **1st putts made** "X of Y" box, and a **Lag putts (1st putt, over 10 ft)** box with **Finished inside 3 ft** and **Avg leave**. The PDF pages are called "Putt misses (1st putt) – 6–10 ft" / "– Under 6 ft" and carry the same numbers.
- Not changed: strokes gained (including putting), the Putts tile and 1st putt stats, and the putting map – they still use every putt.
- Cache `golf-sg-v105`.

## 1st putt misses and Lag putts – wording (v106)
Wording only; what is counted is the same as v105 (first putt of each hole only).
- **1st putt misses (<10 ft)** – row value e.g. **2/3 missed** – since v112 shown as made instead: **1st putts made inside 10 ft 1/3 (33%)** (see v112 below) – (misses / first putts from 10 ft and in; a first putt from exactly 10 ft is included). Opened: big **2/3 missed**, small line "1st putts from 10 ft and in · 1 made".
- **Lag putts (>10 ft)** – row value e.g. **12/12 inside 3 ft** – since v112 **12/12 (100%)** – (first putts from over 10 ft that went in or finished within 3 ft / all of them). Opened: big **12/12 inside 3 ft**, small line "100% inside 3 ft · avg leave 1.2 ft".
- Map: title **1st putt misses (<10 ft)**, line "2/2 missed – 1st putts from 6–10 ft this round", box **1st putts made 0/2**; lag box **Lag putts (>10 ft) – this round** with **Inside 3 ft 3/5 (60%)** and **Avg leave**. PDF pages: "1st putt misses (<10 ft) – 6–10 ft" / "– Under 6 ft".
- Cache `golf-sg-v106`.
- The **Missed greens L / R** and **Missed greens short / long** rows are gone from Round stats (Tee misses L / R is now the last row above Make PDF report). The app still records where approaches missed – the Approach misses tile and map, the PDF and the CSV are unchanged.
- **My Bag – Adjust for playing conditions:** the card with the elevation and temperature sliders is now a section you open and close, **closed** each time you open My Bag. Closed, it shows the title **Adjust for playing conditions**, the line **Carries entered at 5000 ft · 70°F** (plus e.g. **· now 0 ft · 75°F** when the sliders are moved away from your baseline – it updates live while you drag) and a chevron. Tap it to open: Carries entered at … Change, Playing somewhere else?, the two sliders, Back to my baseline, the club-picker checkbox and the note all work exactly as before. The adjusted column in the club list still shows while it's closed.
- Cache `golf-sg-v106`.

## Lighter type everywhere (v106)
No more large bold text anywhere in the app. Only sizes and weights changed (an override block at the end of `styles.css`); layout, tap targets and logic are the same.
- Big buttons (Make PDF report, Export, Send round, Start round, Save, Close …): 18px regular instead of 22px bold.
- Page titles and headings: 17–20px medium instead of 21–24px bold/black; the hole title 22px regular (was 30px bold). The Pin High title on Home is 32px light (was 40px).
- Big numbers: stat tiles (including the big number in an opened Round stats tile), proximity / putting / 1st putt / lag cells 22px regular (was 26px black); score and to-par 24px regular (was 34px); Quick view 22px light.
- Strokes gained header, map titles and summaries, Best vs worst, Birdie zone count, Rounds list, My Bag, Wedge ladder, Settings, scorecard labels, chips and toggles: 500 at most for small labels, 400 for normal text (was 600–900).
- On-screen fairway % on the tee map is medium. The small labels drawn on the maps stay bold so they read on the green and fairway.
- **The PDF report is unchanged.**
- Screenshots: `light-fonts-home.png`, `light-fonts-rounds.png`, `light-fonts-stats.png`, `light-fonts-bag.png`.
- Cache stays `golf-sg-v106`.

## App version line (v107)
- **Settings:** the last line of the page is a small, light grey **Pin High v107** (12px, light weight).
- **Home:** the same text, smaller (11px) and light, at the very bottom of the photo; the Resume round pill stays above it.
- The version lives in ONE place: `appVersion` in `config.js` (now `'v130'`). The service worker cache name in `sw.js` must be `golf-sg-` + that version; `tests/version-focused.js` fails if they ever differ. Each new version: change both (the cache name has to change in sw.js itself so phones pick up the update).
- Screenshots: `version-settings.png`, `version-home.png`.
- Cache `golf-sg-v107`.

## My Bag – Use density altitude (v108)
- In **Adjust for playing conditions** (still closed each time you open My Bag) there is a new checkbox **Use density altitude** (off by default) with a small **?** next to it.
- **Off:** exactly as before – Elevation and Temperature sliders.
- **On:** the two sliders are replaced by ONE **Density altitude** slider (−3,000 to 12,000 ft, steps of 100) and a box you can type in. The box takes negative numbers (the iPhone shows the full keyboard so the minus key is there; there is also a **±** button). Out-of-range numbers are pulled back to −3,000 / 12,000.
- **The math:** density altitude is turned into air density with the standard atmosphere (ISA – 59°F at sea level, about 2°C cooler per 1,000 ft), the same pressure formula the sliders use. Your carries were entered at 5,000 ft · 70°F, which is about **6,835 ft density altitude** – so typing 6835 means "same air", and the same ball-flight model as the sliders gives the change. The two modes give the same carries when they describe the same air.
- Sample bag (entered at 5,000 ft · 70°F): Driver 250 → **252** at DA 8,000 ft, **234** at DA −1,200 ft; 7i 150 → 151 / 141; PW 118 → 119 / 108; 56° 90 → 91 / 82.
- Closed summary: "Carries entered at 5000 ft · 70°F · now 8000 ft density altitude". Club list column header: "DA 8000 ft". **Back to my baseline** resets whichever mode is on. "Show these carries in the club picker" works in both modes. The checkbox and the value are saved on the phone (and in backups).
- **?** opens a short card: what density altitude is, Reno / Sacramento examples, and the free iPhone app **Density Altitude+** by Rate of Climb (App Store link opens in a new tab). Close or tap outside to close it.
- Screenshots: `da-collapsed.png`, `da-open-unchecked.png`, `da-checked-negative.png`, `da-help.png`.
- Cache `golf-sg-v108`, `appVersion: 'v108'`.

## PDF report – columns line up + new scorecard (v109)
- **Every table lines up.** Each table now has one list of columns (where it starts, how wide, left or right). The header and every row use that same list, so a header like **SG** or **Avg to pin after** sits right over its numbers: number columns are right-aligned (header too, at the same right edge), words are left-aligned. Columns shrink to fit if they would ever go past the margin, long headers wrap to two lines, and notes under tables wrap inside the margins.
- **Light type:** no bold anywhere in the PDF; headings are just a little bigger and darker, table headers light grey on a soft green-grey band.
- **Same top on every page:** player · course · date on the left, Pin High on the right, the page title, and "Page x of n" at the bottom.
- **Page 1 – Round report:** Score / To par / Yards / Putts / Strokes gained, the Quick view (Fairways, GIR, Putts with their SG) and the Round stats list exactly as on the phone, including 1st putt misses (<10 ft) and Lag putts (>10 ft) (the removed Missed greens rows stay out), plus 3-putt holes.
- **Page 2 – Scorecard:** the v103 scorecard in two halves (Front 9 + OUT, Back 9 + IN + TOT) with every row: Hole, Par, Length, Score (circle / double circle / square / double square), Tot, OTT, APP, ARG, Putt (strokes gained vs the round's baseline, shaded green / red like the phone), Putts, GIR, Club, FIR, Drive dist, 1st putt, Last putt, Up & down, Sandies, Recovery. Yes / no are small tick and slash icons. The numbers come from the same function as the screen card (`scorecardData`), and the test checks they match cell for cell.
- **Page 3 – Strokes gained:** By category, By distance (with Avg to pin after) and Same round vs every baseline, all aligned.
- Then the map pages as before (fairways, GIR, approach misses, pin location, proximity groups, 1st / 2nd putts, 1st putt misses groups, and the all-rounds heat pages when there is more than one round).
- Sample from the test round: `screenshots/pdf-v109-p1.png` … `pdf-v109-p6.png` (first 6 of 14 pages, 110 dpi).
- Cache `golf-sg-v109`, `appVersion: 'v109'`.

## Stats – trends over time (v110)
*(The page was rebuilt in v116 – see “Stats graphs (v116)” at the end. The numbers per round are the same.)*
Open from the **+** menu → **Stats** (New round · Rounds · Stats · My Bag · Settings). ‹ Home goes back.
- **Which rounds:** the chosen player's *finished* rounds, oldest to newest. Player chips (All players / each name) work like the Rounds filter and start on this phone's player. Unfinished rounds (the same ones Rounds marks *Unfinished*) are left out; a note says how many.
- **All / Last 10 / Last 5** at the top changes both charts and the table.
- **Strokes gained per round:** one line each for TOT, OTT, ARG, APP, PUTT, with a dashed zero line. Tap a coloured name to hide/show its line; tap a round to see its date, course, SG numbers, score and putts.
- **Fairways, greens and short putts:** % fairways hit, % greens in regulation, % putts made inside 10 ft (0–100%).
  - *Putts made inside 10 ft* = of every putt that started 10 ft or closer (1st, 2nd or 3rd putt), the share that went in. A round with no such putts has no point.
- **Averages per round** table: SG TOT/OTT/ARG/APP/PUTT, score, to par, putts per round, putts per GIR hole, fairways hit, GIR, putts made inside 10 ft, 2-putts and 3-putts per round, and the round count. Columns: *Last 5* and *All rounds* (or *Last 10*; one column when Last 5 is picked).
  - Each number is the average of the rounds' own numbers; a round with nothing to count (e.g. no par 4s/5s for fairways) is skipped for that line.
  - 2-putts / 3-putts = holes with exactly 2 / 3 or more putts.
- **Same numbers as each round:** SG comes from the same scorecard data as the Round stats screen and uses each round's own baseline. The baseline box can switch every round to one baseline (e.g. PGA Tour) to compare like with like.
- New helpers in `sg.js`: `puttsInside10`, `trendAvg`, `lastN`. Charts are plain SVG drawn in the app – no libraries, nothing loaded from the internet, works offline.
- Screenshots: `screenshots/menu-stats.png`, `stats-trends-top.png` (SG chart), `stats-trends-mid.png` (% chart), `stats-trends-table.png`.
- Cache `golf-sg-v110`, `appVersion: 'v110'`.

## Percent next to the fractions in Round stats (v111)
- The **Stats** list on the Round stats page now shows a whole percent, in lighter grey and a touch smaller, right after each fraction:
  - Fairways hit `4 / 14 · 29%`, Greens in regulation `10 / 18 · 56%`,
  - 1st putt misses (<10 ft) `2/7 · 29%` (the share missed), Lag putts (>10 ft) `9/11 · 82%` (the share left inside 3 ft).
  - (v112: shown in brackets and not grey – see v112 below.)
- To keep every row on one line at phone width, those two putting rows dropped the words "missed" / "inside 3 ft"; the opened tiles still say them ("2/7 missed", "82% inside 3 ft · avg leave …").
- No percent when there is nothing to count (e.g. `0 / 0` fairways on a par-3 course), and none on Pin location, Putts, Penalty strokes or Tee misses L / R (a left / right split, not a fraction).
- The PDF page 1 "Round stats" table reads the same rows, so it shows the same percents (right-aligned in the "This round" column).
- Screenshot: `screenshots/stats-percent-v111.png`. Cache `golf-sg-v111`, `appVersion: 'v111'`.

## Percents in brackets + 1st putts made inside 10 ft (v112)
- The percents next to the fractions in the Round stats list (and the PDF page 1 Round stats table) are no longer grey: same dark colour and size as the number, regular light weight, in brackets – e.g. **9 / 12 (75%)**, **17 / 18 (94%)**, **4/7 (57%)**, **7/11 (64%)**. Still no percent on x / 0, Pin location, Putts, Penalty strokes, Tee misses L / R.
- **1st putt misses (<10 ft)** is now **1st putts made inside 10 ft** – same putts as before (the 1st putt on each hole, from 10 ft and in; exactly 10 ft counts), but it counts the ones that went in: row `4/7 (57%)`, opened tile **4/7 made** with "57% made · 1st putts from 10 ft and in".
- Its map keeps the two groups (Under 6 ft and 6–10 ft; exactly 10 ft is in 6–10 ft). Title "1st putts made inside 10 ft"; the line under the group buttons reads e.g. **2/5 made (40%) – 1st putts from 6–10 ft this round**. The picture still draws where the missed ones finished (left / right / short / long percentages are of the misses).
- PDF: the map pages are titled "1st putts made inside 10 ft – 6–10 ft" / "– Under 6 ft"; the note under the page 1 table says "1st putts made inside 10 ft = first putts from 10 ft and in that went in."
- Lag putts (>10 ft), the Putts tile and all strokes gained numbers are unchanged. The Stats trends page already said "Putts made inside 10 ft" (every putt from 10 ft and in, not only 1st putts) – unchanged.
- Screenshot: `screenshots/stats-paren-v112.png`. Cache `golf-sg-v112`, `appVersion: 'v112'`.

## Courses near me (v113)
- New round has a **📍 Courses near me** button. Before anything is asked it says: "Pin High uses your location once to find nearby courses. It isn't saved or sent anywhere." Then one approximate location reading (10 s limit). If location is turned off, doesn't answer or isn't available, it goes straight to **Search by name or town**. "Search by name instead" skips location altogether.
- **The course list** – `data/us-courses.json`, about 14,500 US courses (name, town, state, map spot, 9 or 18 holes, par) from OpenGolfAPI. It is downloaded the first time the button is used (about 280 KB over the network) and kept in its own phone cache (`pinhigh-courselist-v1`), so new app versions don't download it again. The service worker leaves `/data/` alone and never deletes that cache. Shown as the nearest 5 in a tight list like the Rounds page – one line per course, "Pebble Beach Golf Links · Pebble Beach, CA · 18 holes" with the distance (1.2 mi) at the right, thin lines between rows, 42 px rows so 10 fit on screen; a long name ends in "…" (the town and holes are cut first). **Show more** adds 5, and the search box finds any course by name or town (same rows). Courses already saved get a small "saved" tag. "Is it one of these?" and the "Which course?" choice use the same rows.
- **Rebuilding the list**: download `opengolfapi-us.ndjson.gz` from github.com/opengolfapi/data releases, unzip, run `python3 tools/build-course-list.py opengolfapi-us.ndjson`. It keeps one row per club (OpenStreetMap often maps a club several times), works out 9 or 18 holes from the total par, and tidies a few names.
- **The scorecard** comes from GolfCore (golfcore.org) through Pin High's relay, `GOLFCORE_BASE` in `config.js` = `https://pinhigh-golfcore.pinhigh.workers.dev/v1` (a Cloudflare Worker that mirrors api.golfcore.org/v1 and adds the GolfCore key on the server – there is no key anywhere in the app). The relay only answers the GitHub Pages site and localhost:8850 / 8080.
- **How a picked course is matched**: one GolfCore search around the list course's map spot (`/courses?near=lat,lng&radius=3&limit=10`). Each result gets a name score – the share of real words in common, ignoring words like golf, club, course, country, CC, GC, links, the, resort, municipal – and its distance. It is used straight away only when it is clearly the same course: the same name within 3 miles, or mostly the same name within 1.5 miles, and no second course equally good next to it. Otherwise Scott sees "Is it one of these?" with up to 5 GolfCore courses (and "None of these – type it in myself"). Then one more request fetches the scorecard. Two requests per new course – the free GolfCore plan is 500 a month.
- **Saving**: it becomes an ordinary saved course (`golfsg.courses.v1`, backed up like the others) with par, stroke index and every tee box (yards per hole, total, and rating/slope – men's first, e.g. "74.9/144"), plus `src: 'golfcore'`, `gcId` (the GolfCore name), `gcUrl`. Clubs with several courses (e.g. Red/White, Red/Yellow) ask which one. Tee chips are compact and on one line: a small dot, the name, then yards and rating/slope in small type.
- **Tee dots** (everywhere tee chips appear: New round and the course editor's tee boxes): a fixed 10 px circle drawn in CSS – nothing is downloaded, so nothing pops in or shifts. Colour words in the tee name give the colour (black, blue, navy, white, red, maroon/burgundy, gold, yellow, green, silver, grey, orange, purple, copper, bronze, tan, pink, teal, brown, platinum), "Men's", "Women's", years etc. are ignored; two colours (e.g. Blue/White, Gold/White Combo) give a half-and-half dot. White is a white dot with a thin outline. Names without a colour ("1 feather", "Championship", "Forward", "Main tees") get a plain white circle with a thin grey outline. Screenshot: `screenshots/tee-dots.png`.
- **Never overwritten**: a course already saved (from the list, by GolfCore name, or same id) is always used as saved – nothing is fetched again. Editing an imported course marks it `edited`.
- **Missing holes** stay blank, and New round shows "Some holes are missing – tap to fill in", which opens the editor. No connection, lookups used up, or a course GolfCore doesn't have: a plain message, Try again where it helps, and **✎ Type in par & yardages** (the editor with the name filled in).
- **Credits**: "Course data: GolfCore" (links to that course's golfcore.org page) under the tee chips and on the course editor; Settings ends with one short line, "Course data: GolfCore · OpenGolfAPI (ODbL) · © OpenStreetMap", each a link (the list file itself carries the full "Contains data from OpenGolfAPI (opengolfapi.org), ODbL 1.0 – © OpenStreetMap contributors").
- **Before Dec 4, 2026**: GolfCore stops answering without a key on Dec 4, 2026 (00:00 GMT = Dec 3, 4 PM Pacific). Create a free key at platform.golfcore.app and add it to the relay Worker as a secret – nothing in the app changes.
- Screenshots: `screenshots/courses-near-picker.png`, `-permission.png`, `-list.png`, `-tees.png`, `-missing.png`, and `screenshots/tee-dots.png`. Cache `golf-sg-v113`, `appVersion: 'v113'`.

## Tee list folds, even tee rows, roomier benchmark menu (v114)
- **Tee box folds to the chosen tee**: after a tee is tapped, the list closes to one row – dot, name, yards, rating/slope and a small ▾ at the right. Tap the row (or the ▾) to open the full list again; picking a tee closes it again. Under it stay "＋ Add tee box", "Course data: GolfCore" and "✎ Rename tees or fix numbers" (small text), so Start round is on screen without scrolling.
- **When it starts open or folded**: a course with several tees and no tee picked yet shows the list open (first tee marked, as before). If Scott has played that course before, the tee from his last round there is picked and shown folded. Coming back from the course editor shows the saved tee folded. A course with one tee shows that one row.
- **Even tee rows**: every tee is one full-width row, left-aligned, on one line – a long name such as "Sage Combo 3 Women" ends in "…", the yards and rating stay on the same line at the right. No more centred or wrapped chips of different widths.
- **Compare my shots against**: the menu is now the same height as the Player row (48 px), regular-weight 17 px text with a small ▾, so "PGA Tour" is no longer squashed or cut off on iPhone. The New round sheet's rows also no longer shrink when the sheet is long – it scrolls instead.
- Screenshots: `screenshots/tee-collapsed-v114.png`, `screenshots/tee-expanded-v114.png`, `screenshots/benchmark-select-v114.png`. Cache `golf-sg-v114`, `appVersion: 'v114'`.

## Compact hole screen (v115)

- The hole header reads "Hole 1 · 349 yd · Par 4 · SI 7". Yardage comes from the chosen tee on the saved scorecard (if the course has no yardage, the first shot's distance is used); Par and SI (stroke index) come from the card.
- The Par 3 / 4 / 5 buttons are gone. Par is just shown. Only if the card has no par for that hole do small 3 / 4 / 5 buttons appear; after picking, "Par 4 ✎" can be tapped to change it.
- Finished shots fold into one tight line: **# · Hit · Club · Loc · SG** (SG is a small soft green / red chip; layups show "layup"). Only the shot being entered has the full cells, with its own small header "# · Dist to pin · Loc · Dir · P".
- A shot folds into a line when the next shot is added (Add Shot). Tap any line to open it again for editing; it folds back when another shot is opened or added. A finished hole shows only lines ("Edit this hole" opens it again).
- **Hit** is blank ("–") until the next shot's distance is typed (it fills in as you type). Putts show the putt length in ft; the shot that went in shows its own distance.
- **Loc** reads "from → to" on every line: *from* is the lie the shot was hit from, *to* is where it finished (the lie picked on the next shot). Examples: shot 1 "Tee → Rough", shot 2 "Rough → Green", a putt "Green → Green", the shot that went in "Green → Holed", out of bounds "Tee → OB". The *to* part stays "–" (e.g. "Rough → –") until the next shot's lie is chosen. No miss-direction arrow on the lines; a penalty shows as a small "+1" after it. Columns are sized so even "Fairway → Bunker +1" fits on a 375 px wide phone (anything longer ends in "…", the +1 always stays visible).
- The old "Off the tee · hit 197 yd · SG …" line under each shot is folded into the tight line (it still shows under a shot while it is open for editing).
- Smaller, lighter type on the hole screen (13–15 px, no bold), tighter spacing; entry boxes stay 38 px tall and the distance box keeps 16 px text so iPhone does not zoom in.
- Screenshots: `screenshots/hole-3shots-before-v114.png` (before), `screenshots/hole-3shots-v115.png`, `screenshots/hole-1shot-v115.png`, `screenshots/hole-par3-v115.png`, `screenshots/hole-reedit-v115.png`, `screenshots/hole-finished-v115.png`. Cache `golf-sg-v115`, `appVersion: 'v115'`.

## Stats graphs (v116)
+ menu → **Stats**. Instead of all strokes-gained lines on one chart, every number has its own small graph. Same soft, light look (thin borders, small light type).
- **Rounds shown** (top switch): **All rounds** · **Last 5** · **Selected round**. Only finished rounds count (the round in progress and unfinished rounds are left out; the count is noted at the bottom).
- **Selected round:** a short scrolling list of every finished round of the player (date · course · score (to par)), newest first and picked by default. Tap a row to pick it; the list keeps the picked row in view.
- **Compare to all rounds** (switch, shown for Last 5 and Selected round): adds all rounds in grey, dashed, on every graph, and an "All rounds" column in the table.
- **Strokes gained – one graph each: Total (TOT), Off the tee (OTT), Approach (APP), Around the green (ARG), Putting (PUTT)**, then **Fairways hit %** and **GIR %**. Each point is one round's number from the same code as its Round stats page (scorecard TOT column; fairways only on par 4s/5s without layups). The baseline box sits next to the "Strokes gained" heading (each round's own baseline, or one baseline for all).
  - All rounds: every round as a line with dots, dashed line = average. Header: "Avg …".
  - Last 5: the 5 newest rounds and their average. With Compare, the older rounds show in light grey and a grey dashed line marks the all-rounds average.
  - Selected round (chosen design): every round stays on the graph as a light grey line so you can see the trend, the picked round is a big coloured dot with its number; tapping a grey dot picks that round. With Compare, a grey dashed line marks the all-rounds average. Header: "This round … · all avg …".
  - A round with no par 4s or 5s (e.g. a par-3 course) has no OTT and no fairway point (instead of a misleading 0). Fewer than 2 rounds: "Not enough rounds yet for a trend".
- **Par 3 / Par 4 / Par 5 scores:** x axis = Eagle, Birdie, Par, Bogey, Double, Triple with the number of strokes underneath (par 3: 1–6, par 4: 2–7, par 5: 3–8); y axis = % of finished holes of that par at each score. A smooth curve (never dips below 0%) with dots and the % over each dot, "n = … holes" underneath and the average strokes in the header. Eagle includes anything better (hole-in-one, albatross); Triple includes anything worse. With Compare, all rounds are a grey dashed curve with its own n. No holes of that par → "No par 4 holes in this round yet".
- **Averages per round** table kept at the bottom (SG, score, to par, putts, putts per GIR hole, fairways, GIR, putts made inside 10 ft, 2-putts, 3-putts), following the switch; with Compare it has "This round / Last 5" and "All rounds" columns.
- Graphs are small inline SVG drawn on the phone – no library, works offline.
- Tests: `tests/stats-focused.js` (rewritten), new `tests/stats-graphs-focused.js`.
- Screenshots: `screenshots/stats-v116-top.png`, `stats-v116-sg.png`, `stats-v116-par.png`, `stats-v116-selected-compare.png`. Cache `golf-sg-v116`, `appVersion: 'v116'`.


## Putt map lines (v117)

- **Black = made, red = missed, on every putt map.** On the "1st putts made inside 10 ft" map, a putt that went in is a thin black line that curves into the hole (several made putts fan out slightly so each one shows). A miss is a thin red line from the common start point to where the ball stopped, with a small red dot and the feet left. The old colour per direction (orange short, purple long, blue left, pink right) is gone; the Left / Right / Short / Long percentages under the map are unchanged.
- **Putts map:** a missed putt is now a red ring (2-putt holes used to be blue). The number of 3-putt holes is still in the line above the map. Legend: Made (black) · Missed (red).
- **4 buttons on the map:** 6–10 ft · Under 6 ft · Over 10 ft (lag: 1st putts from further than 10 ft, drawn the same way, with the 3 ft ring brighter) · All putts. The Lag putts tile now opens the map on Over 10 ft.
- **All putts** shows every putt of the round (1st, 2nd, 3rd …, any distance). Each line starts where that putt really started (its distance and the side of the hole, so a 2nd putt starts where the 1st one stopped), black into the hole if it went in, red to where it stopped if not. Small white dots mark the starts. The line above the map reads e.g. "Map shows All putts: 31 putts · 18 made"; the boxes underneath show putts, made, 1st / 2nd / 3rd+ putts made and 3-putt holes. A putt with no direction entered starts spread around the hole and, if missed, is drawn past the hole. This set is also a new PDF page, "Putting – all putts".
- **Why the Arcade Creek numbers looked different (5/7 vs 3/5):** they were the same putts. The Round stats row counts every 1st putt from 10 ft and in (6–10 ft 3/5 + under 6 ft 2/2 = 5/7, 71%). The map headline only showed the selected group (6–10 ft: 3/5, 60%). Fix (wording only, no counting change): the map headline is now the same number as the row – "5/7 made (71%) – 1st putts from 10 ft and in this round" – and a second, lighter line says what the map is showing, e.g. "Map shows 1st putts from 6–10 ft: 3/5 made (60%)". (The Stats page row "Putts made inside 10 ft" is a different, deliberately labelled number: every putt from 10 ft and in, not just 1st putts.)
- Tests: `tests/putt-lines-focused.js` (new); `pmiss-focused.js` (one black line per made putt), `lag-putts-focused.js` (buttons, headline + "Map shows" line), `focused.js` (Putts map red / legend), `pdf-focused.js` (+1 page). Screenshots: `screenshots/putt-map-v117.png`, `putt-map-all-v117.png`, `putt-map-all-legend-v117.png`, `putt-map-lag-v117.png`. Cache `golf-sg-v117`, `appVersion: 'v117'`.

## Club performance (v118)
- **Tiles like Quick view** at the top, chosen by club type (same groups as the bag):
  - **Driver:** Fairways hit % (hit / attempts, L · R misses) · Strokes gained (total, per shot) · Avg drive (longest, n).
  - **Other woods (3W, 5W …):** Fairways hit % – only when that wood was the tee shot on a par 4 or 5 (– if none, n shown) · Strokes gained · Shots (off the tee vs from the fairway / other).
  - **Irons and hybrids (incl. PW, GW):** GIR % · SG approach · Proximity to the pin. GIR and Proximity use only the hole's real regulation approach hit with that club (par-3 tee shot, 2nd on a par 4, 2nd/3rd on a par 5) – not tee shots on par 4/5, layups, short game or putts.
  - **Wedges (46–62, SW, LW) and putter:** Strokes gained · Shots · On the green (as before).
- **Drive distance box plot** (Driver, and a wood with tee shots): light-blue box = middle half of the drives (25th–75th percentile, straight-line interpolation), darker line = median, thin whiskers with end caps = shortest / longest, small ◇ = average; faint gridlines with yard ticks every 5 / 10 / 20 yd (whatever fits) and a "Yards" axis label; one quiet line under it: min · median · avg · max yd. No per-drive dots. Same drives as the Avg drive tile (par 4/5 tee shots; OB, penalty and layup tee shots left out). 1 drive = a single line + ◇; 0 drives = –. 2–4 drives still get a box (rough guide – said in the ⓘ).
- **Fairway picture** for the Driver (and a wood with tee shots): left rough | fairway | right rough, each with its exact % and "k of n". Same list as the round's fairway map: par 4/5 tee shots, layups left out (the round's Quick view Fairways count still includes layup tee shots).
- **No explanation text on the page** – every note is behind a small ⓘ (tap to show, tap again to hide). Data labels stay visible.
- **Look:** the v116 Stats-graph style – thin 1px lines, soft tints, small light type, exact numbers; small segmented This round / All rounds switch, small club chips, quiet Close. Round-page maps (GIR, approach, putts …) are unchanged for now.
- Tests: `tests/club-driver-focused.js` (new); `clubperf-focused.js` unchanged and passing.

## Club performance lines easier to see (v119)
- **Finish vs the pin map** (irons, woods, wedges – Dots and Gradient): yardage rings are now 1.5px in a darker green-grey; inner rings dashed with more contrast, the outermost ring a solid edge; the green's edge is a defined 1.5px line. The "5 yd" / "10 yd" labels are 11.5px, darker, with a thin halo so they read over the green. L / R / LONG / SHORT labels a little darker.
- **Gradient view:** the rings are drawn on top of the colour (but under the shot tags), so they no longer disappear.
- **Fairway picture:** fairway edges 1.5px, outline and centre line a touch stronger, small counts darker. **Drive distance box plot:** tick labels 11px and darker, axis line a bit stronger.
- Round-page maps are unchanged.
- Tests: `tests/club-rings-focused.js` (new).

## Finish vs the pin in feet (v120)
- **Club performance → Finish vs the pin** (Dots and Gradient): rings are now in **feet** – every 10 ft (10 ft, 20 ft, 30 ft …), outer ring at the next 10 ft past the furthest shot (at least 20 ft). If a shot finished more than 60 ft away the rings go every 20 ft (to 120 ft), then every 50 ft, so the picture never gets crowded. Same v119 line and label style.
- Dots sit at their real distance in feet (off-green yards × 3). The light green circle is still about a green (30 ft).
- **Avg short / long** and **Avg left / right** under the map are now in feet. Gradient: "Average distance from the hole" and the shot tags are in feet (this matches the Proximity tile).
- Unchanged on purpose: approach start distances ("150 yd Fairway"), the shots table (off-green finishes stay in yards as entered), and the club advice "7i finishes 7 yd short on average" (club choice is in yards). Round-page maps don't use this ring code and are unchanged.
- Tests: `tests/club-rings-focused.js` updated.

## Proximity page cleanup (v121)
- **Proximity by distance** now looks like Club performance: same small header and Close button, the small grey **This round / All rounds** switch, small light type, and a light Close at the bottom.
- **Tiles:** the four numbers are now four small tiles in one row – Shots, Greens hit (5 / 5, 100%), Avg prox (greens hit), Avg prox (all shots).
- **Distance buttons** are small chips, 6 to a row like the club chips: **All** first, then 200 down to 40 (farther first, like the map); the small number is the shot count, greyed out when there are none; the picked one is pale blue. The **Hit from** lie chips (All, Fairway, Rough, Bunker, Tee, Other) sit in one row of 6 under them. The tall rail beside the map is gone, so the map uses the full width.
- **Explanations** moved behind small ⓘ buttons: what the numbers mean (and shots outside 40–200 yd), how the distance and lie buttons work, and the full map key with the D1 note. A short key (Hit green · Missed · D1 women avg) stays under the map. "Showing your most-played distance" is now one short grey line.
- **Map:** same green, rings, flag, fairway / rough / bunker / tee / trees strip, tracers and dots, but a flatter, softer finish: 1.5px crisp outlines on the green and every lie shape (so the edges stay clear), lighter colours, thin white rings, smaller lighter labels (LEFT / LONG / RIGHT, ROUGH / FAIRWAY …, ring numbers, shot labels), a thinner red dashed D1 ring, dots with a thin white edge. Hits are still blue, misses red; what each distance or lie button shows is unchanged.
- **Tables** (By lie, Misses by direction) use the small Club performance table style.
- Unchanged on purpose: the map is restyled only on this page – Compare's side-by-side and overlay maps and the PDF report keep the old look; the shared Dots / Gradient switch picks up the small switch style here, but the Gradient hot-spot tags and the round-page GIR / Approach-miss / Pin / Putting maps are unchanged.
- Tests: `tests/prox-clean-focused.js` (new) with fixture `tests/fixtures/prox-rounds.js`.

## Proximity page – richer colours, a touch bolder (v122)
- Scott liked the tight v121 layout but found the colours almost too muted, so **Proximity by distance** keeps exactly the same layout with livelier colours and slightly bolder type.
- **Colours:** a richer green (with a darker crisp edge), a greener fairway and rough, a warmer bunker, deeper trees / "other" ground, a clearer red flag and D1 dashed ring, and a stronger blue on the picked distance and lie chips. The tracers are a little stronger (slightly thicker, less see-through). The hit / miss colours (blue / red) are unchanged.
- **Type:** one step bolder but still small – the title and headings go from regular to medium; the tiles, chips, legend, tables, notes and the ⓘ text go from light to regular; the map labels (rings, LEFT / LONG / RIGHT, ROUGH / FAIRWAY …, distance tags) are a touch heavier. Darker greys for the small text.
- Unchanged on purpose: sizes, spacing, layout and everything the page does. Only the Proximity page changes – Club performance, the round-page maps (GIR, approach misses, putts, tee shots, pin), Compare and the PDF report keep their look. The round-page maps restyle is paused and will follow in v123 with this same palette.
- Tests: `tests/prox-clean-focused.js` updated for the new weights and colours; `tests/e2e.js` Proximity checks updated for the v121 layout (chips above the map, Greens hit tile shows "0 / 4" with a small "0%").


## Round-page maps – tight, vibrant look (v123)
- The map sheets you open from a round's stats – **Greens in regulation**, **Approach misses**, **Tee shots – fairways**, **Putting** (1st / 2nd / 3rd+), **1st putts made inside 10 ft** (with the Lag and All putts views) and **Pin location** – now match the Proximity page (v122): same small header and light Close button, small grey This round / All rounds switch, small blue-edged chips for 1st / 2nd / 3rd+ and the putt-distance groups, thin-bordered number tiles, small tables and a light Close at the bottom.
- **Maps:** same shapes, dots, tracers and colours meaning, with the v122 palette: richer green (#5cb85c) with a crisp 1.5px darker edge on a pale green background, thinner white rings, 1.5px dot outlines, a clearer red flag, small labels a touch bolder (ring labels 9.5px, LONG / SHORT 10.5px). Tee shots: greener fairway and rough with 1.5px edges, warmer bunkers, hit tracers a deeper green and misses a clearer red (thinner lines with a soft white edge), fairway % box 16px. Approach misses: slate count bubbles with smaller numbers. Pin: the 3×3 green and the zoomed green use the same green; the "‹ All pin positions" button is a small outline button.
- **Gradient:** the switch now reads plain **Dots / Gradient** (no 🔥). Hot-spot tags are smaller (10px) with a thin red border; the "Average …" line, the Cluster slider and the colour key are smaller. This applies on every map sheet, including Club performance and Proximity.
- **Explanations:** legends are small; long legend sentences without a symbol (e.g. "Rings every 1 ft out to 10 ft…") move under the legend and, like the other long notes, sit behind a small ⓘ.
- **Proximity:** the ring labels (e.g. "50 ft" sitting off the green) get a thin dark-green outline so they read on the pale background.
- Unchanged on purpose: what each map shows and every count, selection and colour meaning (blue hit / red miss, black made / red missed putts, green / red tee-shot tracers). Compare's side-by-side and overlay maps and the PDF report draw from the same SVG text without the page styles, so they keep their previous look. The Birdie zone page is not a map sheet and is unchanged.
- Tests: `tests/round-maps-light-focused.js` (new) with fixture `tests/fixtures/round-maps-rounds.js`.

## Proximity page – green on screen, benchmark ring follows the round (v124)

- **Green on screen while you pick.** The controls are compact: a one-line caption ("5 approaches from 150 yd … this round", details behind ⓘ), shorter tiles, the distance chips in 2 rows of 9 (All + 200…40), the Dots / Gradient switch on the "Hit from" row, and the lie chips in one row. The empty area above the green is cropped (the LEFT / LONG / RIGHT row sits just above the highest dot, label or the green – nothing is cut off; when a miss has no direction the full picture is kept). On a 390×844 phone the whole green now sits under the controls without scrolling (green about 399–683 px, was 647–930 px). Chip tap size stays 34 px. The Gradient layer and hot-spot tags follow the cropped picture.
- **Benchmark ring follows the round.** The red dashed ring uses the round's strokes-gained benchmark (PGA Tour, LPGA, D1 men, D1 women, Scratch men, Scratch women); All rounds uses the open round's benchmark and the legend says "(this round's benchmark)". Label: "<benchmark> avg NN’" (e.g. "D1 women avg 44’"). The zoom (green = ring + 10 ft) uses the same benchmark.
- **Benchmark selector.** A small dropdown next to "Distance (yd)" (with a red dashed mark) switches the ring for this view only – the round's saved benchmark does not change, and the next time the page opens it starts on the round's benchmark again.
- **Proximity numbers for all six benchmarks** (researched list, approved by Scott; `/workspace/prox-benchmarks.json` / `.md`, compiled Nov 1, 2026). Average feet from the hole, by band:
  - PGA Tour – PGA Tour ShotLink 2026, from the fairway / par-3 tee, 25-yd bands 50–250: 17.2, 18.0, 20.25, 23.6, 28.4, 33.9, 41.3, 50.1.
  - LPGA – KPMG Performance Insights (July 2024), 25-yd bands 50–225: 16.7 est., 17.5, 20.1, 24.8, 31.5, 38.7, 47.1 est.
  - D1 men – Upgame (Trackman) Pac-12 men 2022, 25-yd bands 50–250 plus 250+: 21.8, 23.2, 26.3, 29.9, 34.0, 40.6, 50.1, 60.7, 100.1.
  - D1 women – the Shot Scope chart already in the app, 10-yd bands, unchanged (180 yd and up estimated).
  - Scratch men – Shot Scope handicap-0 (Golf Monthly 2025), 50-yd bands: 50–100 26, 100–150 38, 150–200 54, 200+ 92.
  - Scratch women – Shot Scope women's eBook (2026), 25-yd bands 50–200: 30.1 est., 32, 42, 60, 89, 106.3 est.
  A distance button uses the band that contains it (150 → 150–175 yd). Estimate rows (made from neighbouring numbers and ratios, method in the ⓘ) say "est." on the ring and in the ⓘ. The ⓘ also has a one-line source / caveat for the chosen benchmark. **Caveat:** Tour numbers (PGA, LPGA) only count shots that finish on or around the green, so those rings look tight; the D1 men and scratch numbers count every approach, like Pin High. The sources use different years and band widths, so compare against one benchmark rather than across them.
- **No data.** Where a benchmark has no band for a distance (e.g. Scratch women at 200 yd, PGA Tour under 50 yd) there is no ring – no extrapolating – the 90 ft (60 yd across) picture, and "<name>: no data at this distance" at the top of the green and under the map. A benchmark with no table at all shows "No proximity benchmark for <name> yet" and is marked "(no data)" in the selector (none today).
- **Adding or updating a benchmark is data only.** `PROX_BENCH` in app.js is keyed by baseline id (`pga`, `lpga`, `d1m`, `d1w`, `scm`, `scw`) with `band` (yd), optional `open` (last band also covers everything beyond), `source`, `caveat`, `est` (per-row estimate notes) and rows sorted by distance: `[fromYd, ft, tag, sourceId]` or `[fromYd, [lowFt, highFt], tag, sourceId]` (the prox-benchmarks.json format; tag `estimate` = est.), or the older `[fromYd, lowFt, highFt, est?]` / `[fromYd, ft, est?]`. A range sits at its middle.
- **Unchanged.** Dots, tracers, colours, counts, the distance / lie logic, and the ids tests use. Compare and the PDF report still draw the full picture with the D1 women ring (the ring label now reads "D1 women avg" instead of "D1 avg"; the PDF legend is unchanged).
- Tests: `tests/prox-bench-focused.js` (new); `tests/prox-clean-focused.js` (2 rows of 9 chips, 15px tiles, its fixture rounds use PGA Tour, so it checks the PGA Tour ring, then picks D1 women) and `tests/d1-focused.js` (rounds set to D1 women, label "D1 women avg", source line read from the ⓘ) updated.

## Stats page – categories you can open and close, more short-game graphs (v125)

- **Categories.** Under the All rounds / Last 5 / Selected round switch and the strokes-gained benchmark, the graphs sit in five thin-bordered rows: **Driver, Approach, Putting, Chipping, Scoring**. Each row shows a short summary (e.g. "OTT +0.67 · FW 71%") and a small chevron; tap to open or close. All start closed; what you open stays open while you are on the page (also when you switch All / Last 5 / Selected or turn Compare on), and the page starts closed again next time. The averages table stays at the bottom.
- **Driver:** drive distance box chart (the Club performance box plot – box = middle half, line = median, whiskers = shortest / longest, ◇ = average; the same drives as Avg drive, Driver only when most drives have a club). It follows the switch; with Compare a grey All rounds box sits under it. Then Off the tee (OTT) and Fairways hit.
- **Approach:** APP, GIR and a new Approach proximity graph (average feet from the hole after approaches from 40–200 yd, every shot – the Proximity page's All button; lower is better).
- **Putting:** PUTT, plus strokes gained per hole by the first putt's distance – under 5 ft, 5–10 ft, 10–25 ft, over 25 ft (every putt on the hole counts; the average is per putt, weighted) – and "1st putts made under 5 ft" (%).
- **Chipping:** ARG, plus strokes gained per shot by lie (bunker; rough incl. deep rough; fairway) and by distance (up to 10, 10–20, 20–30 yd). These are exactly the ARG shots (off the green, **30 yd and in**), so the three distance graphs add up to ARG.
- **Per-shot graphs:** same round-by-round trend look; each point is that round's average per putt / shot and "n = …" under the graph; a round with no shots in a group has no point (the line joins the others). Header = the weighted average.
- **Scoring:** Total (TOT) and the par 3 / 4 / 5 score curves. A button **"Round in progress (date) vs all rounds"** (or "Open round …" when it is finished) picks the round you have open now, turns Compare on and keeps Scoring open: the round's curves are solid colour, all rounds grey dashed, with a small legend "This round / All rounds". A second Compare switch sits next to the par graphs. In the Selected round list the open round is first, marked "Open now"; an unfinished one counts its finished holes ("11 holes so far") and is added as the last point on the trend graphs.
- **Look:** v122/v123 colours (blue OTT / fairways, green APP / GIR, orange ARG, purple PUTT), axis text weight 400, lines 2.2 px, card titles 500; still small and tight.
- **sg.js:** `FP_BANDS`, `CHIP_LIES`, `CHIP_BANDS`, `CHIP_MAX_YD` (30), `puttBand`, `chipLie`, `chipBand`, `statBuckets(summary)`, `bucketAvg(list)`; unit test in `tests/sg.test.js`. app.js: the Club performance box drawing moved into `boxShapes()` (same output) so the Stats page can reuse it.
- **Unchanged:** the round list, range switch, Compare, tap-a-dot tooltips, the averages table, the v116 graph ids. Tests: new `tests/stats-cats-focused.js`; `tests/stats-graphs-focused.js` and `tests/stats-focused.js` open the categories first (graph title list updated).
- **One around-the-green cutoff: 30 yd (Scott's decision, v125).** ARG / short game = off the green from 30 yd and in; Approach = non-tee shots from more than 30 yd (par-3 tee shots included) – the industry-standard split. `SG.SHORT_MAX_YD` 20 → 30; the first approach range is now 30–60 yd (was 20–60), the short-game row 0–30 yd (was 0–20; `SG.SHORT_BUCKET`); the PDF report groups, the Round stats "By distance" table and note, the Stats ARG / APP notes, the Compare gap table, up & down (short-game shot within 30 yd) and the club-page tip all follow. The chipping graphs are now exactly the ARG shots.
  - **Estimated baselines:** the k(d) blend in the baseline model now uses the short-game coefficient b to 30 yd and the approach coefficient a from 50 yd (blended 30–50; was 20 / 40). The calibration is re-solved at load; the synthetic calibration round has no shots from 20–50 yd, so the solved cP / a / b / t are identical and each estimated baseline still loses exactly its sourced gap per category on that round (sg.test). PGA Tour expected strokes (Broadie table) are unchanged.
  - **What moves:** only shots from over 20 to 30 yd change category (APP → ARG). Totals (TOT) do not change for any baseline; OTT and PUTT do not change; for PGA Tour, APP + ARG is unchanged per round (a pure move). For the other baselines the 20–50 yd expected values shift by at most a few thousandths of a stroke (a ≈ b).
  - **Proximity** (40–200 yd, regulation approach) is unchanged.
  - **Tests updated for the 30 yd cutoff:** sg.test (split, buckets, report groups, 21 yd now short, chip bands add up to ARG), focused (By distance rows 30-60 / 0-30 and note), pdf-focused, stats-cats-focused (chip note; chip bands' n and SG add up to each round's ARG), holeout-focused (the 25 yd hole-out chip is now Around the green; the v89 regression comparison applies the same 20 → 30 yd move to the v89 code and still matches exactly) and replay-focused (hole 3's last shot from 20–30 yd is labelled "Short game long").

## Putt misses on the Stats page, Stats PDF (v126)

- **Putt misses (Putting category).** The Putting category keeps the strokes-gained graphs on top (SG PUTT, SG by first-putt distance, 1st putts made under 5 ft) and ends with a thin-bordered **"Putt misses"** sub-menu, closed at first, same chevron, summary "90 missed · most Long right". Open it for:
  - **Distance chips:** All · Under 5 ft · 5–10 ft · 10–25 ft · Over 25 ft – exactly the bands of Strokes gained by first-putt distance (`SG.FP_BANDS`, same first putts, same counts).
  - **The grid:** a top-down square around the hole – LONG (past the hole) at the top, SHORT (toward you) at the bottom, left / right at the sides – with the same 8 directions as the shot screen (Long left, Long, Long right, Left, Right, Short left, Short, Short right). Each box: number of misses and their share of the misses that have a direction (the 8 add up to 100%). Every box is plain white with dark text – count and % only, no shading – with thin light-grey lines like the other Stats graphs (Scott found red shading too much). The most common miss has only a subtle 2px dark-red outline. The middle box is green (#5cb85c, edge #2e7d32) with putts holed and made %. The selected distance chip uses the Stats blue (#3b82c4); the sub-menu title and border are neutral. The Stats PDF uses the same picture.
  - **Lines under it:** n = first putts · made (%) · missed · most common miss; Left · right · short · long totals (corners count on both sides); "No direction: N misses (not drawn)".
  - It follows All rounds / Last 5 / Selected round. With **Compare** each box gets a small grey "all x%" and the header "Made x% · all y%" (all finished rounds). The explanation is behind ⓘ.
  - **How putt directions are recorded:** a putt's direction is the "Where the putt finished vs the hole" pick on the next shot's row (the "Shot n ended…" direction sheet – Short = toward you). Only first putts on finished holes count; a first putt that misses with no direction picked is counted in "No direction" but not drawn. Old one-letter directions (L / R / S / O) are read as Left / Right / Short / Long.
  - **Sample data:** the 4 rounds in `birdie-data.js` have a direction on every missed first putt (45); the new `putt-miss-rounds.js` fixture has 7 rounds with directions (99 missed first putts, 93 with a direction); the older stats fixtures (stats-cats, stats-graphs, stats-rounds) have none, so their grid shows only "No direction".
  - sg.js: `SG.puttMissGrid(puttList, band)` (counts, %, made %, most common, sides, no direction); unit test in `tests/sg.test.js`. Chipping and approach misses are not on the Stats page (Scott: putt misses only).
- **Stats PDF.** A **"Create PDF"** button at the top right of the Stats page makes a Letter PDF of everything on the page, whatever is open or closed:
  - Page 1: player, range (All rounds / Last 5 / Selected round with its dates), strokes-gained baseline, Compare on / off, date made, then the averages table and its note.
  - Then every category with its summary: Driver (drive distance box, OTT, fairways), Approach (APP, GIR, proximity), Putting (PUTT, the 4 first-putt-distance graphs, made under 5 ft, and the putt-miss grids for All and each band), Chipping (ARG, by lie, by distance), Scoring (TOT and the par 3 / 4 / 5 curves).
  - **Scoring overlay:** the par 3 / 4 / 5 curves show the **last round** (the newest finished round of the rounds on the page) solid in the par colour against the grey dashed all-rounds curve. The legend names it (date · course · score) and says a round in progress is left out until it is finished.
  - The graphs are the page's own SVG pictures (same data, same look), two per row, never split by a page break; a heading never sits alone at the bottom of a page; "Page i of n" on every page. 8 pages for the sample data.
  - Share / Save to Files and the download fallback work like the round report. File name `Golf-Stats-2026-11-01-All-rounds-Scott.pdf` (`SG.statsFileName`; Last-5 / Round-<course> for the other ranges). Made on the phone with the bundled jsPDF – nothing is sent anywhere.
- **Caveat:** tested in Chrome at 390x844; iPhone Safari (WebKit) can't run on the test machine, so the PDF share sheet and the grid on a real iPhone are untested.
- Tests: new `tests/putt-miss-focused.js`, `tests/stats-pdf-focused.js`, fixture `tests/fixtures/putt-miss-rounds.js`; sg.test (`puttMissGrid`, `statsFileName`); the 4 version tests → v126.

## Putting: explanations behind ⓘ, avg 2nd putt (v127)

- Stats > Putting, the 4 "1st putt …" graphs (under 5 ft, 5–10, 10–25, over 25 ft): the note "Holes whose first putt was … Strokes gained per hole from that first-putt distance (every putt on the hole counts). Dashed = average." is no longer shown. It sits behind a small ⓘ at the end of the "n = … putts" line (tap to show / hide, no caption). Same for the Putt misses grid explanation ("First putts only …").
- New next to the count: **avg 2nd putt X.X ft** ("–" when there is none) on the 4 graphs and on each Putt misses grid, e.g. "n = 108 putts · 18 made (17%) · avg 2nd putt 2.5 ft ⓘ". With Compare: "(all X.X ft)". The misses ("90 missed · most common miss: …") move to the next line.
- How it is worked out (`SG.puttMissGrid(list, band).second` in sg.js): take the first putts (first putt on each finished hole) in that band and that range (all rounds / last 5 / one round); keep the missed ones that stayed on the green; average how far away they finished = the length of the 2nd putt. Misses that rolled off the green are left out.
- ⓘ text: "Avg 2nd putt = average distance left for the next putt after a missed 1st putt (misses that stayed on the green)."
- Stats PDF: the value is in each Putt misses grid header ("Made 17% · avg 2nd putt 2.5 ft") and on the count lines; the explanations are still printed in full.
- Tests: `tests/putt-miss-focused.js` (avg worked out by hand from the saved rounds vs the shown number, all bands, last 5 + Compare, one round; explanations hidden until ⓘ), `tests/stats-pdf-focused.js` (avg in the PDF), sg.test (`puttMissGrid().second`); the 4 version tests → v127. Screenshots: `stats-putt-misses-collapsed/open/band-v127.png`, `stats-pdf-putt-misses(-2)-v127.png`, `stats-pdf-page1…8-v127.png`, `stats-pdf-button-v127.png`.

## Help page: how-to video + guide PDF (v128)

- + menu › **Help** (last item, after Settings). Same frosted sky page as Settings / Stats, ‹ Home button.
- Three cards: **Get started** (5 one-line steps), **Watch the video** (3:41, voiceover; `<video controls playsinline preload="none">` with a poster – nothing downloads until it is tapped), **Read the guide** (15-page PDF, opened with a normal link in a new tab; Safari's viewer has Share / Save).
- Files in `help/`: `PinHigh-Video.mp4` (H.264 yuv420p, AAC, faststart, ~7.4 MB), `PinHigh-HowTo.pdf` (~2.5 MB), `poster.webp`.
- `sw.js`: everything under `/help/` bypasses the service worker (network only, like `/data/`). Keeps the install small and lets iPhone Safari make its own Range requests for the video (a cache-first full 200 answer can break video on iPhone). Offline, the Help page opens but the video and PDF need internet.
- Tests: new `tests/help-focused.js` (port 8890, own Range-capable server, service worker on: menu items, video loads / seeks via Range, PDF 200 + new tab, help/ not cached); menu-list checks in home / menu-bag-settings / stats / bag / profile-wedges tests now end with Help; the 4 version tests → v128. Screenshots: `help-plus-menu-v128.png`, `help-page(-full)-v128.png`, `help-video-card-v128.png`.

## Home background (v129)
- `img/home-bg.webp` (600x1300) is now an AI-generated photo of a dewy green at sunrise, the ball close to the pin with a red flag (was a watercolor golfer). Same file name, so the CSS (`.home-bg`, blurred `.frostpage::before`) and the service worker list are unchanged. Previous watercolor is in v128 (0af0188).

## Stats: strokes lost by distance that add up (v130)
- The Putting graphs by first-putt distance and the Chipping graphs by lie / distance now plot strokes gained ADDED UP per round (a round with none in a group = 0), not the per-hole / per-shot average, so the distance groups add up to the PUTT / ARG total.
- New card at the top of Putting ("Where putting strokes go") and Chipping ("Where chipping strokes go"): one bar per distance group (average per round), the total, and the biggest leak. It is an SVG (`.stbrk`), so it is also printed in the Stats PDF. Tests: `tests/stats-cats-focused.js` (bands add up to PUTT / ARG per round and on average), `tests/stats-pdf-focused.js`.
