# Golf Shot Tracker (PWA)

Phone web app for tracking every golf shot and strokes gained against a selectable baseline (PGA Tour by default).
Static files only: no backend, no build step. Data is stored on the phone (localStorage).

## How a hole is entered (v3)
Each hole is a table. ONE ROW = ONE STROKE, hit from that row's Dist/Loc. Row 1 = Tee (hole length).
Dist = yards to the pin (feet on the green). Loc = where the ball was: Fairway, Rough, Bunker, Green, Hazard,
OB re-hit, In the hole, In the hole (chip/shot), Deep rough, Trees. The LAST row is "In the hole" with the
distance of the putt/shot that went in. LRSO = how the previous shot missed. P = +1 penalty to get here.
Score = rows + penalties. "Finish hole" is enabled only when every row is complete; "Edit this hole" reopens it.
Older saves are migrated automatically (a v2 "In the hole" row without a distance reopens the hole until filled).

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
- `sg.js` – strokes-gained engine + Broadie baseline tables (sources/approximations documented at top)
- `sw.js`, `manifest.webmanifest`, `icons/` – offline + "Add to Home Screen"
- `tests/sg.test.js` – unit tests: `node --test tests/sg.test.js`
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
