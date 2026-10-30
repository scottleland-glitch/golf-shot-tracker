// Golf Shot Tracker – site configuration.
window.GOLF_CONFIG = {
  // Google Drive backup (v98): public OAuth client ID (no secret), scope drive.file only. Leave empty to hide it.
  googleClientId: '147433941741-g2jf349vhekia26agahu2b2j3ajd3rf1.apps.googleusercontent.com',
  // Live sharing: Firebase Realtime Database (free plan). Rounds are written only under /live/<secret token>.
  // Leave empty to hide "Share live".
  liveDb: 'https://pin-high-live-default-rtdb.firebaseio.com'
};
