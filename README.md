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
- `tests/version-focused.js` – the version line (e.g. "Pin High v108") on Settings and Home is small and light, and config.js `appVersion` equals the sw.js cache version (`node tests/version-focused.js`)
- `tests/lag-putts-focused.js` – 1st putt misses (<10 ft) and Lag putts (>10 ft) use only the 1st putt of each hole (v105, wording v106): 10 ft boundary, 3 ft boundary, tap-ins after a lag putt not counted, This round / All rounds (`node tests/lag-putts-focused.js`)
- `tests/menu-bag-settings-focused.js` – v102 navigation: Home only +, menu New round · My Bag · Rounds · Settings, Bag | Wedge ladder toggle, Settings page (`node tests/menu-bag-settings-focused.js`)
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
- Strokes-gained categories: Off the tee = par-4/5 tee shots; Approach = every other shot from more than 20 yd off the green (par-3 tee shots included), by 20-60 (over 20 to under 60), 60-100, 100-130, 130-160, 160-200, 200+ yd (lower number included) with average distance to the pin after the shot (ft on the green, yd x 3 off it, 0 holed; penalty/OB shots left out); Short game = off the green from 20 yd and in; Putting = from the green.
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
For the planned PDF report, approach tracers can be coloured by the strokes-gained distance group. The helper is in sg.js: `SG.REPORT_GROUPS` (id, name, color, colorName, halo) and `SG.reportGroup(yd)`. Groups are 20–60 (over 20 to under 60), 60–100, 100–130, 130–160, 160–200 and 200+ yd; 20 yd or closer = short game, returns null. Colours: 20–60 purple #6a1b9a, 60–100 blue #0d47a1, 100–130 teal #00838f, 130–160 amber orange #ffb300 (dark halo), 160–200 magenta #d81b60, 200+ brown #6d4c41. When colour means distance, show hit/miss with the end marker: filled dot = hit, white ring with ✕ = miss. The full map implementation is in commit b59bc90; screenshots are screenshots/46*.png. The in-app Proximity map stays as in v22 (40–200 yd 10-yd rail, blue hit / red miss).

## PDF round report (v25)
On any round's stats page tap **📄 Make PDF report**. Built on the phone, offline (jsPDF 4.2.1 bundled in `vendor/`), letter portrait, 9 pages:
1 header + score + scorecard + key stats · 2 strokes gained (category, by distance with avg to pin after, every baseline) ·
3 fairways · 4 GIR · 5 approach misses · 6 pin location (one green, 3x3 grid, badge + mini plots per segment, table; empty segments skipped) ·
then one proximity page per distance group with shots (`SG.REPORT_GROUPS`, group colour, lie strip, stats, by lie, misses by direction; first one carries an all-groups summary; empty groups skipped) · 1st putts · 2nd putts. Maps are rendered to 3x images.
Save with the share sheet (`Golf-Round-<date>-<course>-<player>.pdf`, letters/digits/hyphens only; shared as files only, no title/text, so iOS Mail sends it).

## Clubs and layups (v49)
Each shot row (except putts on the green) has an optional club picker: Driver, 3W, 5W, 7W, 4H, 5H, 5i–9i, PW, 52, 54, 56, 58, 60. The tee row on par 4/5s has a **Layup** checkbox.
A layup tee shot is excluded from strokes gained entirely: its SG is set to 0, it is not counted in Off the tee (shots or SG) nor the SG total. The score is unchanged. Stored as `row.club` / `row.layup` (optional fields; older rounds load unchanged); included in backups and the CSV (`club`, `layup` columns).

## My Bag and Wedge ladder (v93; page layout changed in v102)
The **+** menu is New round · **My Bag** · Rounds · Settings. My Bag has a **Bag | Wedge ladder** toggle at the top (see v102 below). The player name is in Settings.

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
  - **APP** – approach (shots from more than 20 yd, including par-3 tee shots).
  - **ARG** – around the green (shots from 20 yd or less, off the green).
  - **PUTT** – putting (every stroke from the green).
- **Stats group**
  - **Putts** – strokes played from the green.
  - **GIR** – ✓ when you were on the green in regulation (par minus 2 strokes, penalties counted), ⊘ when you weren't.
  - **Club** – the club you hit off the tee, if you picked one (Driver shows as DR, 7i as 7I). Blank if no club was picked.
  - **FIR** – fairway hit off the tee on a par 4 or 5 (✓ / ⊘); a dash on par 3s. Same rule as the Fairways number.
  - **Drive dist** – how far the tee shot went on a par 4 or 5 (tee distance minus the distance left), in yards. Blank on par 3s and when the tee shot was OB or a penalty.
  - **1st putt** – how far away your first putt was, in feet.
  - **Last putt** – how long the putt you holed was, in feet (on a one-putt it's the same as the 1st putt; blank if the ball was chipped in).
  - **Up & down** – you missed the green in regulation and then had a short-game shot (off the green, 20 yd or less): ✓ if you holed out in 2 strokes or fewer from there, ⊘ if not. Blank when there was no chance (green hit in regulation, or no shot from 20 yd or less).
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
- **1st putt misses (<10 ft)** – row value e.g. **2/3 missed** (misses / first putts from 10 ft and in; a first putt from exactly 10 ft is included). Opened: big **2/3 missed**, small line "1st putts from 10 ft and in · 1 made".
- **Lag putts (>10 ft)** – row value e.g. **12/12 inside 3 ft** (first putts from over 10 ft that went in or finished within 3 ft / all of them). Opened: big **12/12 inside 3 ft**, small line "100% inside 3 ft · avg leave 1.2 ft".
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
- The version lives in ONE place: `appVersion` in `config.js` (now `'v108'`). The service worker cache name in `sw.js` must be `golf-sg-` + that version; `tests/version-focused.js` fails if they ever differ. Each new version: change both (the cache name has to change in sw.js itself so phones pick up the update).
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
