#!/usr/bin/env bash
# Builds the iPhone project from scratch on the build Mac (Codemagic): Capacitor's iOS project, app icon + splash, the settings
# Apple needs (name, location message, encryption answer), iPhone only, portrait. Nothing here is needed for the website.
set -euo pipefail
cd "$(dirname "$0")/.."
bash native/build-www.sh
# Apple Watch build (STROKEWISE_WATCH=1, only the ios-testflight-watch workflow): the local watch plugin joins the project's plugins (this edit of
# package.json exists only in the build's working copy), so `cap sync` compiles it into the iPhone app. Off = nothing below changes.
if [ "${STROKEWISE_WATCH:-}" = "1" ]; then
  npm pkg set "dependencies.strokewise-watch-plugin=file:native/strokewise-watch-plugin"
  npm install --no-audit --no-fund
fi
[ -d ios ] || npx cap add ios
npx cap sync ios
npx @capacitor/assets generate --ios --assetPath native/assets --iconBackgroundColor '#0b5d1e' --splashBackgroundColor '#0b5d1e'
PL=ios/App/App/Info.plist
set_plist() { /usr/libexec/PlistBuddy -c "Set :$1 $2" "$PL" 2>/dev/null || /usr/libexec/PlistBuddy -c "Add :$1 $3 $2" "$PL"; }
set_plist CFBundleDisplayName "Strokewise" string
set_plist NSLocationWhenInUseUsageDescription "Finds golf courses near you." string
set_plist ITSAppUsesNonExemptEncryption false bool
/usr/libexec/PlistBuddy -c "Delete :UISupportedInterfaceOrientations" "$PL" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Add :UISupportedInterfaceOrientations array" "$PL"
/usr/libexec/PlistBuddy -c "Add :UISupportedInterfaceOrientations:0 string UIInterfaceOrientationPortrait" "$PL"
/usr/libexec/PlistBuddy -c "Delete :UISupportedInterfaceOrientations~ipad" "$PL" 2>/dev/null || true
# iPhone only (no iPad screenshots or iPad review)
sed -i '' 's/TARGETED_DEVICE_FAMILY = "1,2";/TARGETED_DEVICE_FAMILY = 1;/g' ios/App/App.xcodeproj/project.pbxproj
# Apple Watch build: add the watchOS app target to the generated project and embed it in the iPhone app (native/add-watch-target.rb)
if [ "${STROKEWISE_WATCH:-}" = "1" ]; then
  gem list -i xcodeproj >/dev/null 2>&1 || gem install xcodeproj --no-document --user-install
  ruby native/add-watch-target.rb
  echo "Apple Watch app added"
fi
echo "iOS project ready"
