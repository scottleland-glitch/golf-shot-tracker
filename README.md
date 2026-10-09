# Golf Shot Tracker (PWA)

Phone web app for tracking every golf shot and strokes gained (vs. PGA Tour baseline).
Static files only: no backend, no build step. Data is stored on the phone (localStorage).

## How a hole is entered (v2)
Each hole is a table, one row per shot, like a paper shot log. Each row is where a shot is played FROM:
Row 1 = tee (enter the hole length). Then for each next shot: Dist (yards to pin, feet on the green),
Loc (Fairway, Rough, Bunker, Green, Hazard, OB, In the hole, Deep rough, Trees), LRSO (how the previous
shot missed: Left/Right/Short/Over), P (+1 penalty, e.g. a drop). OB = +1 and re-hit from the same spot.
"In the hole" finishes the hole. Tap a row number to insert a shot above/below; red button deletes.
Rounds saved by v1 are converted automatically.

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
