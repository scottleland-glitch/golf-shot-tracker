// Golf Shot Tracker – site configuration.
// v150: the app version moved to sg.js (VERSION). This file is always fetched fresh from the network, so a version here
// showed the NEW number while the phone was still running the OLD code from its cache.
window.GOLF_CONFIG = {
  // Google Drive backup (v98): public OAuth client ID (no secret), scope drive.file only. Leave empty to hide it.
  googleClientId: '147433941741-g2jf349vhekia26agahu2b2j3ajd3rf1.apps.googleusercontent.com',
  // Live sharing: Firebase Realtime Database (free plan). Rounds are written only under /live/<secret token>.
  // Leave empty to hide "Share live".
  liveDb: 'https://pin-high-live-default-rtdb.firebaseio.com',
  // v113 "Courses near me": scorecards come from GolfCore (golfcore.org, free plan) through Pin High's own relay
  // (a small Cloudflare Worker that mirrors api.golfcore.org/v1 and adds the GolfCore key on the server, so no key is ever in the app).
  GOLFCORE_BASE: 'https://pinhigh-golfcore.pinhigh.workers.dev/v1'
};
