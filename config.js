// Golf Shot Tracker – site configuration.
// OneDrive backup: paste the "Application (client) ID" of the Azure / Entra app registration here
// (a GUID like 1a2b3c4d-....). While it is empty, every OneDrive feature stays hidden.
window.GOLF_CONFIG = {
  onedriveClientId: '',
  // 'consumers' = personal Microsoft accounts only. Use 'common' if the app registration allows
  // work/school accounts too.
  onedriveAuthority: 'https://login.microsoftonline.com/consumers'
};
