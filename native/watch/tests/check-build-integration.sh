#!/usr/bin/env bash
# Rehearses the watch build on any machine that has node, ruby + the xcodeproj gem (Linux is fine; no Xcode needed): makes a scratch copy of the repo,
# runs the same steps as native/ios-setup.sh (Capacitor project, watch plugin, watch target), then checks the generated project:
# the watch target + bundle id, the Embed Watch Content phase, the dependency, the plugin in Package.swift, AppDelegate, www scripts.
# It can't run xcodebuild, so it proves the project is wired up, not that Xcode accepts every setting.
#   bash native/watch/tests/check-build-integration.sh
set -euo pipefail
SRC="$(cd "$(dirname "$0")/../../.." && pwd)"
T=$(mktemp -d); cd "$T"
# only what git would commit (tracked + new files that are not ignored): a file hidden by .gitignore must NOT be there, like on the build Mac
( cd "$SRC" && git ls-files -co --exclude-standard -z | xargs -0 tar -cf - ) | tar -xf -
npm install --no-audit --no-fund >/dev/null 2>&1
# normal build: nothing of the watch anywhere
bash native/build-www.sh >/dev/null
! grep -q "watch" www/index.html || { echo "FAIL: normal www mentions the watch"; exit 1; }
[ ! -e www/watch.js ] || { echo "FAIL: watch.js in the normal www"; exit 1; }
# watch build
export STROKEWISE_WATCH=1
bash native/build-www.sh >/dev/null
grep -q 'watch-core.js' www/index.html && grep -q 'watch.js' www/index.html || { echo "FAIL: watch scripts not in www/index.html"; exit 1; }
npm pkg set "dependencies.strokewise-watch-plugin=file:native/strokewise-watch-plugin" >/dev/null
npm install --no-audit --no-fund >/dev/null 2>&1
npx cap add ios >/dev/null 2>&1
npx cap sync ios > cap-sync.log 2>&1 || { cat cap-sync.log; echo "FAIL: cap sync"; exit 1; }
! grep -qiE "ENOENT|error" cap-sync.log || { cat cap-sync.log; echo "FAIL: cap sync reported errors"; exit 1; }
grep -q '"StrokewiseWatchPlugin"' ios/App/App/capacitor.config.json || { echo "FAIL: plugin class not in packageClassList"; exit 1; }
grep -q 'StrokewiseWatchPlugin' ios/App/CapApp-SPM/Package.swift || { echo "FAIL: plugin not in Package.swift"; exit 1; }
mkdir -p ios/App/App/Assets.xcassets/AppIcon.appiconset && [ -f ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png ] || \
  python3 -c "import zlib,struct;w=h=16;raw=b''.join(b'\x00'+b'\x0b\x5d\x1e'*w for _ in range(h));c=lambda t,d:struct.pack('>I',len(d))+t+d+struct.pack('>I',zlib.crc32(t+d)&0xffffffff);open('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png','wb').write(b'\x89PNG\r\n\x1a\n'+c(b'IHDR',struct.pack('>IIBBBBB',w,h,8,2,0,0,0))+c(b'IDAT',zlib.compress(raw))+c(b'IEND',b''))"
ruby native/add-watch-target.rb >/dev/null
ruby native/check-pbxproj.rb ios/App/App.xcodeproj
ruby native/add-watch-target.rb --set-version 1.0 7 >/dev/null
ruby -rxcodeproj -e '
p = Xcodeproj::Project.open("ios/App/App.xcodeproj")
w = p.targets.find { |t| t.name == "StrokewiseWatch" } or abort("FAIL: no watch target")
a = p.targets.find { |t| t.name == "App" }
bid = w.build_configurations.map { |c| c.build_settings["PRODUCT_BUNDLE_IDENTIFIER"] }.uniq
abort("FAIL: watch bundle id #{bid}") unless bid == ["com.strokewise.app.watchkitapp"]
abort("FAIL: watch sdk") unless w.build_configurations.all? { |c| c.build_settings["SDKROOT"] == "watchos" && c.build_settings["TARGETED_DEVICE_FAMILY"] == "4" }
abort("FAIL: entitlements/plist") unless w.build_configurations.all? { |c| c.build_settings["CODE_SIGN_ENTITLEMENTS"] =~ /entitlements/ && c.build_settings["INFOPLIST_FILE"] =~ /Info.plist/ }
abort("FAIL: versions differ") unless (a.build_configurations + w.build_configurations).map { |c| [c.build_settings["MARKETING_VERSION"], c.build_settings["CURRENT_PROJECT_VERSION"]] }.uniq == [["1.0", "7"]]
abort("FAIL: no dependency") unless a.dependencies.any? { |d| d.target == w }
e = a.copy_files_build_phases.find { |ph| ph.name == "Embed Watch Content" } or abort("FAIL: no embed phase")
abort("FAIL: embed phase settings") unless e.dst_subfolder_spec == "16" && e.dst_path == "$(CONTENTS_FOLDER_PATH)/Watch" && e.files.map { |f| f.file_ref } == [w.product_reference]
srcs = w.source_build_phase.files.map { |f| f.file_ref.path }
%w[StrokewiseWatchApp.swift Store.swift Rules.swift WorkoutManager.swift Connectivity.swift].each { |f| abort("FAIL: #{f} not compiled") unless srcs.include?(f) }
abort("FAIL: assets") unless w.resources_build_phase.files.any? { |f| f.file_ref.path == "Assets.xcassets" }
puts "project ok: #{w.name} (#{bid[0]}) embedded in App, #{srcs.size} Swift files"'
grep -q 'StrokewiseWatchBridge.shared.activate()' ios/App/App/AppDelegate.swift || { echo "FAIL: AppDelegate not patched"; exit 1; }
# iPhone app: HealthKit entitlement (wakes the watch app at round start), on the App target only; --no-phone-healthkit takes it off again
grep -q "com.apple.developer.healthkit" ios/App/App/App.entitlements || { echo "FAIL: iPhone app has no HealthKit entitlements file"; exit 1; }
ruby -rxcodeproj -e 'p = Xcodeproj::Project.open("ios/App/App.xcodeproj"); a = p.targets.find { |t| t.name == "App" }
abort("FAIL: App CODE_SIGN_ENTITLEMENTS") unless a.build_configurations.all? { |c| c.build_settings["CODE_SIGN_ENTITLEMENTS"] == "App/App.entitlements" }
abort("FAIL: App.entitlements not in the project") unless p.main_group["App"].files.any? { |f| f.path == "App.entitlements" }'
cp -r ios /tmp/ios-keep-$$ 2>/dev/null; ruby native/add-watch-target.rb --no-phone-healthkit >/dev/null
[ ! -e ios/App/App/App.entitlements ] || { echo "FAIL: --no-phone-healthkit left the entitlements file"; exit 1; }
ruby -rxcodeproj -e 'p = Xcodeproj::Project.open("ios/App/App.xcodeproj"); a = p.targets.find { |t| t.name == "App" }
abort("FAIL: --no-phone-healthkit left CODE_SIGN_ENTITLEMENTS") if a.build_configurations.any? { |c| c.build_settings["CODE_SIGN_ENTITLEMENTS"] }'
rm -rf ios && mv /tmp/ios-keep-$$ ios
echo "iPhone HealthKit entitlement ok (on, and off again with --no-phone-healthkit)"
for f in Info.plist StrokewiseWatch.entitlements; do [ -f ios/App/StrokewiseWatch/$f ] || { echo "FAIL: $f missing"; exit 1; }; done
grep -q "workout-processing" ios/App/StrokewiseWatch/Info.plist && grep -q "com.apple.developer.healthkit" ios/App/StrokewiseWatch/StrokewiseWatch.entitlements || { echo "FAIL: workout/HealthKit settings"; exit 1; }
[ -f ios/App/StrokewiseWatch/Assets.xcassets/AppIcon.appiconset/AppIcon-1024.png ] || { echo "FAIL: watch icon"; exit 1; }
# the Swift packages must resolve (this is what Xcode does first; a package with missing sources fails here with "invalid custom path")
if command -v swift >/dev/null 2>&1; then
  ( cd ios/App/CapApp-SPM && swift package describe >/dev/null ) || { echo "FAIL: swift package describe (CapApp-SPM)"; exit 1; }
  ( cd native/strokewise-watch-plugin && swift package describe | grep -q StrokewiseWatchLauncher.swift ) || { echo "FAIL: plugin package has no launcher"; exit 1; }
  ( cd native/strokewise-watch-plugin && swift package describe | grep -q StrokewiseWatchBridge.swift ) || { echo "FAIL: plugin package has no sources"; exit 1; }
  echo "swift packages resolve"
fi
echo "build integration ok"
rm -rf "$T"
