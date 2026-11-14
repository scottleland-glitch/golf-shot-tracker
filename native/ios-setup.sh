#!/usr/bin/env bash
# Builds the iPhone project from scratch on the build Mac (Codemagic): Capacitor's iOS project, app icon + splash, the settings
# Apple needs (name, location message, encryption answer), iPhone only, portrait. Nothing here is needed for the website.
set -euo pipefail
cd "$(dirname "$0")/.."
bash native/build-www.sh
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
echo "iOS project ready"
