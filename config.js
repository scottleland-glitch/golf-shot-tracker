// Golf Shot Tracker – site configuration.
// OneDrive backup: paste the "Application (client) ID" of the Azure / Entra app registration here
// (a GUID like 1a2b3c4d-....). While it is empty, every OneDrive feature stays hidden.
window.GOLF_CONFIG = {
  onedriveClientId: '0b7c8ac9-31bc-4701-8e7a-a03861700bd4',
  // 'consumers' = personal Microsoft accounts only. Use 'common' if the app registration allows
  // work/school accounts too.
  onedriveAuthority: 'https://login.microsoftonline.com/common'
};
