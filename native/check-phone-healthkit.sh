#!/usr/bin/env bash
# Run on the build Mac (ios-testflight-watch) right after `xcode-project use-profiles`. The iPhone app asks for the HealthKit entitlement so it can wake the
# watch app when a round starts (HKHealthStore.startWatchApp). If the App Store profile for com.strokewise.app was made before the App ID had the
# HealthKit capability, signing would fail with "profile doesn't include the com.apple.developer.healthkit entitlement". This looks at the profile Codemagic
# installed: with HealthKit → nothing to do; without → say so loudly and take the entitlement + Health strings off the iPhone app so the build still
# succeeds (everything else works; the watch app just isn't launched automatically; Settings → Apple Watch says why).   bash native/check-phone-healthkit.sh
set -uo pipefail
cd "$(dirname "$0")/.."
[ "${STROKEWISE_PHONE_HEALTHKIT:-1}" = "0" ] && { echo "iPhone HealthKit is switched off (STROKEWISE_PHONE_HEALTHKIT=0)"; exit 0; }
DIR="$HOME/Library/MobileDevice/Provisioning Profiles"
found=""; has=""
if [ -d "$DIR" ]; then
  for f in "$DIR"/*.mobileprovision; do
    [ -f "$f" ] || continue
    security cms -D -i "$f" > /tmp/profile.plist 2>/dev/null || continue
    appid=$(/usr/libexec/PlistBuddy -c "Print :Entitlements:application-identifier" /tmp/profile.plist 2>/dev/null || true)
    case "$appid" in *.com.strokewise.app) ;; *) continue ;; esac     # the iPhone app's profile (not .watchkitapp)
    name=$(/usr/libexec/PlistBuddy -c "Print :Name" /tmp/profile.plist 2>/dev/null || echo "?")
    if /usr/libexec/PlistBuddy -c "Print :Entitlements:com.apple.developer.healthkit" /tmp/profile.plist >/dev/null 2>&1; then
      echo "iPhone profile \"$name\" has HealthKit: the watch app will be launched when a round starts"; has=1
    else
      found="$name"
    fi
  done
fi
[ -n "$has" ] && exit 0
if [ -z "$found" ]; then
  echo "Could not find the iPhone app's provisioning profile to check for HealthKit; leaving HealthKit on (the build says if signing fails)."
  exit 0
fi
cat <<MSG
==============================================================================================================================================
WARNING: the iPhone profile "$found" (com.strokewise.app) does NOT include the HealthKit capability.
The watch app will NOT be launched automatically when a round starts in this build (the iPhone's HealthKit entitlement and Health strings were removed
so signing works). To turn it on:
  1. developer.apple.com > Certificates, Identifiers & Profiles > Identifiers > com.strokewise.app > tick HealthKit > Save.
  2. Profiles > "$found" (App Store) > Edit > Save (regenerates it with HealthKit) > Download, or delete it and create a new App Store profile.
  3. Codemagic > Teams > Code signing identities > iOS provisioning profiles: upload the new profile (replace the old one).
  4. Run the watch workflow again.
==============================================================================================================================================
MSG
ruby native/add-watch-target.rb --no-phone-healthkit
PL=ios/App/App/Info.plist
/usr/libexec/PlistBuddy -c "Delete :NSHealthShareUsageDescription" "$PL" 2>/dev/null || true
/usr/libexec/PlistBuddy -c "Delete :NSHealthUpdateUsageDescription" "$PL" 2>/dev/null || true
exit 0
