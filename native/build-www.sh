#!/usr/bin/env bash
# Copies the web app into www/ for the iPhone app (Capacitor bundles it, so the app works fully offline) and adds native.js.
set -euo pipefail
cd "$(dirname "$0")/.."
rm -rf www && mkdir -p www
cp index.html *.js styles.css manifest.webmanifest privacy.html support.html www/
rm -f www/sw.js   # no service worker inside the app – the files are already on the phone
cp -R icons img vendor data help www/
cp native/native.js www/native.js
# native.js right after config.js (it routes sharing through iOS's share sheet)
python3 - <<'PY'
p = 'www/index.html'; s = open(p).read()
a = '<script src="config.js"></script>'
assert a in s, 'config.js script tag not found'
open(p, 'w').write(s.replace(a, a + '\n<script src="native.js"></script>', 1))
PY
# The Apple Watch build (STROKEWISE_WATCH=1, set by the ios-testflight workflow): the watch link goes in after native.js. Off = www is exactly as before (the PWA at app.strokewise.app does not set this).
if [ "${STROKEWISE_WATCH:-}" = "1" ]; then
  cp native/watch-core.js www/watch-core.js
  cp native/watch.js www/watch.js
  python3 - <<'PY'
p = 'www/index.html'; s = open(p).read()
a = '<script src="native.js"></script>'
assert a in s, 'native.js script tag not found'
open(p, 'w').write(s.replace(a, a + '\n<script src="watch-core.js"></script>\n<script src="watch.js"></script>', 1))
PY
  echo "watch link added to www"
fi
echo "www ready: $(find www -type f | wc -l) files"
