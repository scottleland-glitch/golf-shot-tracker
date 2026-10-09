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
Summary tiles: "Approach misses" (approach shots that missed the green; lay-ups more than 50 yd out with
no direction are left out) opens a map of misses around the green by direction; "Greens in reg." opens a
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
