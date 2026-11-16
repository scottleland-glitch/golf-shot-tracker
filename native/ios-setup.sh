#!/usr/bin/env bash
# Builds the iPhone project from scratch on the build Mac (Codemagic): Capacitor's iOS project, app icon + splash, the settings
# Apple needs (name, location message, encryption answer), iPhone only, portrait. Nothing here is needed for the website.
set -euo pipefail
cd "$(dirname "$0")/.."
bash native/build-www.sh
# Apple Watch build (STROKEWISE_WATCH=1, set by the ios-testflight workflow): the local watch plugin joins the project's plugins (this edit of
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
# Apple Watch build: add the watchOS app target to the generated project and embed it in the iPhone app (native/add-watch-target.rb).
# Every step here stops the build with the real error if it fails (set -e above), and the checks at the end print what Xcode itself says about the
# project, so a problem shows up in this step's log instead of as a bare "Failed to show build settings" later.
if [ "${STROKEWISE_WATCH:-}" = "1" ]; then
  # xcodeproj gem: use the one on the Mac if it is recent enough, else install a fixed version
  if ! ruby -e 'require "xcodeproj"; exit(Gem::Version.new(Xcodeproj::VERSION) >= Gem::Version.new("1.25.0") ? 0 : 1)' 2>/dev/null; then
    gem install xcodeproj -v 1.27.0 --no-document --user-install
    export GEM_PATH="$(ruby -e 'print Gem.user_dir'):$(ruby -e 'print Gem.default_dir')"
  fi
  ruby -e 'require "xcodeproj"; puts "xcodeproj gem #{Xcodeproj::VERSION}, ruby #{RUBY_VERSION}"'
  # the plugin's Swift sources must be in the working copy (a .gitignore rule once left them out of the repo)
  for f in Package.swift ios/Sources/StrokewiseWatchPlugin/StrokewiseWatchPlugin.swift ios/Sources/StrokewiseWatchPlugin/StrokewiseWatchBridge.swift; do
    [ -f "native/strokewise-watch-plugin/$f" ] || { echo "ERROR: native/strokewise-watch-plugin/$f is missing"; exit 1; }
  done
  grep -q '"StrokewiseWatchPlugin"' ios/App/App/capacitor.config.json || { echo "ERROR: the watch plugin is not in capacitor.config.json packageClassList (cap sync did not pick it up)"; exit 1; }
  grep -q 'StrokewiseWatchPlugin' ios/App/CapApp-SPM/Package.swift || { echo "ERROR: the watch plugin is not in ios/App/CapApp-SPM/Package.swift"; exit 1; }
  # iPhone app + HealthKit (wakes the watch app when a round starts): the two Health strings here, the entitlement in add-watch-target.rb.
  # STROKEWISE_PHONE_HEALTHKIT=0 turns both off. Needs the HealthKit capability on the App ID com.strokewise.app and its profile (WATCH_README.md).
  if [ "${STROKEWISE_PHONE_HEALTHKIT:-1}" != "0" ]; then
    set_plist NSHealthShareUsageDescription "StrokeWise reads your heart rate and activity during a round so the Golf workout on your Apple Watch is complete." string
    set_plist NSHealthUpdateUsageDescription "StrokeWise saves your round as a Golf workout in Health and opens the watch app for you when you start a round." string
  fi
  ruby native/add-watch-target.rb
  ruby native/check-pbxproj.rb ios/App/App.xcodeproj
  echo "Apple Watch app added"
  # what Xcode says (full output, errors included). These fail the step on purpose: better here, with the message, than in the build step.
  if command -v xcodebuild >/dev/null 2>&1; then
    plutil -lint ios/App/App.xcodeproj/project.pbxproj
    echo "--- xcodebuild -version"; xcodebuild -version
    echo "--- xcodebuild -resolvePackageDependencies"
    xcodebuild -project ios/App/App.xcodeproj -scheme App -resolvePackageDependencies 2>&1 | tail -40
    echo "--- xcodebuild -list"
    xcodebuild -project ios/App/App.xcodeproj -list 2>&1
    echo "--- xcodebuild -showBuildSettings (iPhone app)"
    xcodebuild -project ios/App/App.xcodeproj -scheme App -showBuildSettings > /tmp/showbuildsettings.txt 2>&1 || { cat /tmp/showbuildsettings.txt; echo "ERROR: xcodebuild cannot read the project (output above)"; exit 1; }
    grep -E "^ +(PRODUCT_BUNDLE_IDENTIFIER|PRODUCT_NAME|SDKROOT|TARGETNAME) =" /tmp/showbuildsettings.txt | head -8
    echo "--- xcodebuild -showBuildSettings (watch app)"
    xcodebuild -project ios/App/App.xcodeproj -target StrokewiseWatch -showBuildSettings > /tmp/showbuildsettings-watch.txt 2>&1 || { cat /tmp/showbuildsettings-watch.txt; echo "ERROR: xcodebuild cannot read the watch target (output above)"; exit 1; }
    grep -E "^ +(PRODUCT_BUNDLE_IDENTIFIER|PRODUCT_NAME|SDKROOT|WATCHOS_DEPLOYMENT_TARGET) =" /tmp/showbuildsettings-watch.txt | head -8
  fi
fi
echo "iOS project ready"
