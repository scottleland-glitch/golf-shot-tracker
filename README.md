# Golf Shot Tracker (PWA)

Phone web app for tracking every golf shot and strokes gained (vs. PGA Tour baseline).
Static files only: no backend, no build step. Data is stored on the phone (localStorage).

## How a hole is entered (v3)
Each hole is a table. ONE ROW = ONE STROKE, hit from that row's Dist/Loc. Row 1 = Tee (hole length).
Dist = yards to the pin (feet on the green). Loc = where the ball was: Fairway, Rough, Bunker, Green, Hazard,
OB re-hit, In the hole, In the hole (chip/shot), Deep rough, Trees. The LAST row is "In the hole" with the
distance of the putt/shot that went in. LRSO = how the previous shot missed. P = +1 penalty to get here.
Score = rows + penalties. "Finish hole" is enabled only when every row is complete; "Edit this hole" reopens it.
Older saves are migrated automatically (a v2 "In the hole" row without a distance reopens the hole until filled).

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
