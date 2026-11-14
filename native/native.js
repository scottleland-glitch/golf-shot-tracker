/* Strokewise iPhone app (Capacitor) – only does anything inside the native app; on the website it returns straight away.
 * · Hides Google Drive backup (Google blocks its sign-in page inside apps) – backup by file through the share sheet still works.
 * · The app's sharing (rounds, backups, PDFs, story images, live links) goes through iOS's own share sheet: the file is written
 *   to the app's cache folder and handed to the Share plugin, so it works the same as Safari's navigator.share.
 */
(function () {
  'use strict';
  var C = window.Capacitor;
  if (!C || !C.isNativePlatform || !C.isNativePlatform()) return;
  window.STROKEWISE_NATIVE = true;
  if (window.GOLF_CONFIG) window.GOLF_CONFIG.googleClientId = '';
  var plug = function (n) { try { return (C.registerPlugin ? C.registerPlugin(n) : null) || (C.Plugins && C.Plugins[n]); } catch (e) { return C.Plugins && C.Plugins[n]; } };
  var Share = plug('Share'), FS = plug('Filesystem');
  if (!Share) return;
  var abort = function () { var e; try { e = new DOMException('Share canceled', 'AbortError'); } catch (x) { e = new Error('Share canceled'); e.name = 'AbortError'; } return e; };
  var b64 = function (file) { return new Promise(function (ok, no) { var r = new FileReader(); r.onload = function () { ok(String(r.result).split(',')[1] || ''); }; r.onerror = function () { no(r.error); }; r.readAsDataURL(file); }); };
  var safe = function (n, i) { return (String(n || 'strokewise-' + i).replace(/[^\w.\- ]+/g, '_').slice(-80)) || 'file-' + i; };
  navigator.canShare = function (d) { return !!d && (!!(d.files && d.files.length && FS) || !!(d.text || d.url || d.title)); };
  navigator.share = function (d) {
    d = d || {};
    var files = d.files && d.files.length && FS ? Promise.all([].map.call(d.files, function (f, i) {
      return b64(f).then(function (data) { return FS.writeFile({ path: safe(f.name, i), data: data, directory: 'CACHE' }); }).then(function (w) { return w.uri; }); })) : Promise.resolve(null);
    return files.then(function (uris) {
      var o = {}; if (d.title) o.title = d.title; if (d.text) o.text = d.text; if (d.url) o.url = d.url; if (uris) o.files = uris;
      return Share.share(o);
    }).then(function () {}, function (e) { if (/cancel/i.test(String(e && (e.message || e)))) throw abort(); throw e; });
  };
})();
