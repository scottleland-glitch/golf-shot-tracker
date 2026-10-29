# Pin High (PWA) — formerly "Golf Shot Tracker"

Renamed to **Pin High** (title, home-screen label, header, PDF). Storage keys (`golfsg.*`), backup files (`golf-rounds-*.json`) and the OneDrive app folder (named after the Entra app registration, Apps › Golf Shot Tracker) are unchanged, so restore keeps working.

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
- `tests/profile-wedges-focused.js` – Profile + Wedges chart: menu, navigation, accordion, persistence, backup (`node tests/profile-wedges-focused.js`)
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

## OneDrive automatic backup (hidden until configured)
Set `onedriveClientId` in `config.js` to the Application (client) ID of an Entra app registration:
1. https://entra.microsoft.com (or portal.azure.com) → App registrations → New registration. Name: Golf Shot Tracker.
2. Supported account types: "Personal Microsoft accounts only" (keep `onedriveAuthority` = `https://login.microsoftonline.com/consumers`), or "Accounts in any organizational directory and personal Microsoft accounts" (then set it to `https://login.microsoftonline.com/common`).
3. Redirect URI: platform "Single-page application (SPA)", `https://scottleland-glitch.github.io/golf-shot-tracker/` (exact, trailing slash).
4. API permissions → Add → Microsoft Graph → Delegated: `Files.ReadWrite.AppFolder` and `User.Read`. No client secret, no implicit-grant boxes.
5. Copy the Application (client) ID into `config.js` and push. config.js is fetched network-first, so no cache bump is needed.

Sign-in uses MSAL.js (vendor/msal-browser.min.js, v3.30.0, MIT – v4 is avoided because its localStorage cache is encrypted with a session-cookie key, which signs iOS home-screen apps out on relaunch) with the redirect flow (auth code + PKCE), because popups are unreliable in iOS home-screen apps. Backups go to OneDrive › Apps › Golf Shot Tracker: `golf-rounds-backup.json` (latest) plus a dated copy at most weekly.

### Player names (several phones, one OneDrive)
Each phone sets a Player name (Home › Your data). Its rounds are stamped with that name, and its backups go to `golf-rounds-<name>.json` plus a weekly `golf-rounds-<name>-YYYY-MM-DD.json`; a backup contains only that player's rounds, so phones on the same Microsoft account never write each other's files. The pre-name `golf-rounds-backup.json` is kept and shown as "Older backup". Restore lists files by player; History can filter by player.

### Future PDF report: colour by distance group (not in the app)
For the planned PDF report, approach tracers can be coloured by the strokes-gained distance group. The helper is in sg.js: `SG.REPORT_GROUPS` (id, name, color, colorName, halo) and `SG.reportGroup(yd)`. Groups are 20–60 (over 20 to under 60), 60–100, 100–130, 130–160, 160–200 and 200+ yd; 20 yd or closer = short game, returns null. Colours: 20–60 purple #6a1b9a, 60–100 blue #0d47a1, 100–130 teal #00838f, 130–160 amber orange #ffb300 (dark halo), 160–200 magenta #d81b60, 200+ brown #6d4c41. When colour means distance, show hit/miss with the end marker: filled dot = hit, white ring with ✕ = miss. The full map implementation is in commit b59bc90; screenshots are screenshots/46*.png. The in-app Proximity map stays as in v22 (40–200 yd 10-yd rail, blue hit / red miss).

## PDF round report (v25)
On any round's stats page tap **📄 Make PDF report**. Built on the phone, offline (jsPDF 4.2.1 bundled in `vendor/`), letter portrait, 9 pages:
1 header + score + scorecard + key stats · 2 strokes gained (category, by distance with avg to pin after, every baseline) ·
3 fairways · 4 GIR · 5 approach misses · 6 pin location (one green, 3x3 grid, badge + mini plots per segment, table; empty segments skipped) ·
then one proximity page per distance group with shots (`SG.REPORT_GROUPS`, group colour, lie strip, stats, by lie, misses by direction; first one carries an all-groups summary; empty groups skipped) · 1st putts · 2nd putts. Maps are rendered to 3x images.
Save with the share sheet (`Golf-Round-<date>-<course>-<player>.pdf`, letters/digits/hyphens only; shared as files only, no title/text, so iOS Mail sends it) or, when connected, **Save to OneDrive** → app folder `/Reports`.

## Clubs and layups (v49)
Each shot row (except putts on the green) has an optional club picker: Driver, 3W, 5W, 7W, 4H, 5H, 5i–9i, PW, 52, 54, 56, 58, 60. The tee row on par 4/5s has a **Layup** checkbox.
A layup tee shot is excluded from strokes gained entirely: its SG is set to 0, it is not counted in Off the tee (shots or SG) nor the SG total. The score is unchanged. Stored as `row.club` / `row.layup` (optional fields; older rounds load unchanged); included in backups and the CSV (`club`, `layup` columns).

## Profile (v93)
The **+** menu is New round · **Profile** · History. Profile shows the player name (Change works as in Archive) and two cards: **My Bag** and **Wedges**. Their ‹ Profile button goes back to Profile; Profile's ‹ Home goes home.

**Wedges**: one row per yardage, 40–110 yd in 10-yard steps (40, 50 … 110 – 8 rows). Collapsed, a row shows a one-line summary (e.g. `54° · middle · 1–2° · P2 · hinge 90°`) or "Not set". Tap a row to open it (one open at a time): **Club** (short clubs from My Bag – wedges, PW, 9i, anything 40°+ – shown without carries, since distance depends on the setup; the standard PW/48–60° list if the bag has none; "Other" for free text), **Ball position** (Front, Middle, Back), **Shaft lean** (0°, 1–2°, 3–4°), **Club position** (swing positions P1, P2, P3), each with an optional note, and **Hinge** (wrist hinge: 45°, 90°, Full). Tap a selected chip again to unselect. Saves as you tap/type to `golfsg.wedges.v1`; "Clear" empties a yardage. Included in backups (`wedges` key) and restored when the phone's chart is empty or the backup's is newer; older backups without it restore as before. Entries saved at 45, 55 … 105 yd by the first (5-yard) v93 draft are kept in the stored data and backups, just not shown. Charts saved with the first v93 draft options are converted when read (ball Back/Back of center → Back, Center → Middle, Forward/Forward of center → Front; lean Neutral → 0°, Slight → 1–2°, Strong → 3–4°, Leaning back → a note; old clock hand positions → a Club position note).

## Wedge ladder (v94, v95)
- **High / Low flight:** every yardage has two setups. The **High flight · Low flight** toggle at the top of the Wedges page (opens on High) switches the whole list; the header count, row summaries, simple view, Edit and Clear all work on the selected flight. Stored in `golfsg.wedges.v1` as `rows` (High – v93 charts and old backups land here, Low starts empty) and `low` (Low); both go into backups and restore. The Profile card shows e.g. "3 of 8 yardages set · Low 1 of 8".
- **Wedges page:** opens in a simple view. Tapping a yardage that's set shows just three lines – Club, Ball position, Club position (shaft lean and hinge are still saved, just not shown); the row headers show club · ball · position. Tapping an empty yardage opens the full editor. The **✎ Edit** button under the list turns on edit mode (it reads **✓ Done editing**): tapping any yardage opens the full editor (club, ball position, shaft lean, club position, hinge, notes, Clear/Done) and the headers show everything.
- **Scoring page (v95):** the Wedges yardages are **carry** distances, not distances to the pin – a 50 yd pin on a downhill lie may want a 40 yd carry that bounces and runs out; a 60 yd pin on an uphill slope may want a 70 yd carry that lands and pulls back. So any shot **100 yd or less** (more than 0; not on the green, not OB) gets a **Wedge** dropdown instead of the club picker. It lists three carries around the pin distance: the distance rounded to the nearest 10 (halves round up – 73 → 70, 75 and 77 → 80), then 10 less and 10 more, slid to stay inside 40–110 (60 → 50/60/70, 73 → 60/70/80, 77 → 70/80/90, 40 or a 15 yd chip → 40/50/60, 100 → 90/100/110). Each carry appears under **High flight** and **Low flight** (e.g. "70 yd · High · 54° · Middle · P2"), so about 6 entries; carries with no club yet show greyed ("70 yd · Low · not set") and can't be picked. Nothing is preselected ("Choose carry…"). Typing a different distance redoes the three carries but never picks or changes anything; a carry you already chose stays selected (and stays in the list) even if it's outside the new three. Choosing one sets the shot's club (strokes gained and club stats work exactly as before), saves the carry and flight on the shot (`wedgeY`, `wedgeF`) so it shows again after a reload, and shows a small card under it: Flight, Carry, Club, Ball, Position, plus lean and hinge if set. "Choose carry…" clears it.
- Over 100 yd → the normal club picker (a club chosen from the ladder stays). If no yardage has a club in either flight, shots use the normal club picker. A shot that already has a club that isn't a ladder pick (e.g. 7i at 100 yd, or an automatic pick from v94) keeps it and shows it in the dropdown. Voice entry is unchanged.

## My Bag (v92)
Open from the **+** menu → **Profile** → **My Bag**. Add clubs by manufacturer → model → club/loft (Titleist, TaylorMade, Callaway, Ping, Srixon, Cleveland, Mizuno, Cobra, PXG, Wilson, Bridgestone, Honma, Tour Edge, XXIO, Vokey, Scotty Cameron, Odyssey, Ben Hogan, Sub 70, Lynx; "Other brand" / "Model not listed" for anything else, plus a custom club name and loft). Lofts are typical stock lofts and editable. One club per name (adding a second 7i replaces the first). Enter each club's **carry** in yards; sort by club or by carry; tap a club to edit or remove it.

**Baseline** = the conditions the carries were hit in (default Reno: 5,000 ft, 70°F; "Change" to edit). The **elevation** (0–9,000 ft) and **temperature** (30–110°F) sliders show every club's carry for other conditions, with the difference; "Back to my baseline" resets them. "Show these carries in the club picker" labels the round's club picker (e.g. `7i · 144`).

Physics: a point-mass ball flight (drag + lift, spin decay) is solved per club at its loft with typical launch/spin, with ball speed calibrated so the baseline conditions give exactly the entered carry; the new carry = entered carry × (simulated carry in the new air ÷ simulated carry in the baseline air). Air density from the ISA pressure at that altitude and the temperature (dry air). Roughly +1.2% per 1,000 ft for a driver and ~1.5 yd per 10°F, in line with published rules of thumb (Titleist ~1.16%/1,000 ft). Example: 250 yd driver / 150 yd 7i at Reno 5,000 ft/70°F → about 239 / 144 yd in San Diego (0 ft, 75°F). Not included: wind, humidity, ball temperature, firm/soft ground (roll).

In a round, when the bag has clubs, the club picker lists only bag clubs (no putter); a shot that already has a club not in the bag still shows it. Voice clubs map to the bag (e.g. "gap wedge" → your GW or the nearest wedge loft). Strokes gained is unaffected. Stored in `golfsg.bag.v1`; included in backups (`bag` key) and restored when the phone's bag is empty or the backup's bag is newer.
