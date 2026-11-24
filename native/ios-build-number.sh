#!/usr/bin/env bash
# Stamp or verify the iOS / watch CFBundleVersion used by the Codemagic ios-testflight workflow.
# The Capacitor Xcode template leaves VERSIONING_SYSTEM unset, so `agvtool` often does nothing,
# and Info.plist uses $(CURRENT_PROJECT_VERSION) which can stay at 1 unless we write a literal
# number into every Info.plist and pass CURRENT_PROJECT_VERSION into xcodebuild.
set -euo pipefail
cd "$(dirname "$0")/.."

APP_PLIST=ios/App/App/Info.plist
WATCH_PLIST=ios/App/StrokewiseWatch/Info.plist
NUMBER_FILE=/tmp/strokewise-next-build-number
LATEST_FILE=/tmp/strokewise-latest-asc

die() { echo "ERROR: $*" >&2; exit 1; }

set_plist_version() {
  local plist="$1" key="$2" value="$3"
  [ -f "$plist" ] || die "missing $plist"
  /usr/libexec/PlistBuddy -c "Set :$key $value" "$plist" \
    || /usr/libexec/PlistBuddy -c "Add :$key string $value" "$plist"
  local got
  got=$(/usr/libexec/PlistBuddy -c "Print :$key" "$plist")
  [ "$got" = "$value" ] || die "$plist $key is '$got', expected '$value'"
  echo "  $plist $key=$got"
}

stamp() {
  local next="$1"
  local marketing="${2:-1.0}"
  [[ "$next" =~ ^[0-9]+$ ]] || die "build number must be an integer, got '$next'"
  [ -f "$APP_PLIST" ] || die "iOS project is not set up yet (missing $APP_PLIST)"

  # So agvtool can see a versioned project (Capacitor's template omits this).
  ruby - "$next" "$marketing" <<'RUBY'
require 'xcodeproj'
next_build, marketing = ARGV
project = Xcodeproj::Project.open(File.join(Dir.pwd, 'ios/App/App.xcodeproj'))
(project.build_configurations + project.targets.flat_map { |t| t.build_configurations }).each do |c|
  c.build_settings['VERSIONING_SYSTEM'] = 'apple-generic'
  c.build_settings['CURRENT_PROJECT_VERSION'] = next_build
  c.build_settings['MARKETING_VERSION'] = marketing
end
project.save
puts "pbxproj: MARKETING_VERSION=#{marketing} CURRENT_PROJECT_VERSION=#{next_build} VERSIONING_SYSTEM=apple-generic on every target"
RUBY

  if command -v agvtool >/dev/null 2>&1; then
    (
      cd ios/App
      agvtool new-marketing-version "$marketing" || true
      agvtool new-version -all "$next" || true
    )
  fi
  if [ -f native/add-watch-target.rb ] && [ -d ios/App/StrokewiseWatch ]; then
    ruby native/add-watch-target.rb --set-version "$marketing" "$next"
  fi

  echo "Writing literal versions into Info.plist files (these are what end up in the IPA):"
  set_plist_version "$APP_PLIST" CFBundleShortVersionString "$marketing"
  set_plist_version "$APP_PLIST" CFBundleVersion "$next"
  if [ -f "$WATCH_PLIST" ]; then
    set_plist_version "$WATCH_PLIST" CFBundleShortVersionString "$marketing"
    set_plist_version "$WATCH_PLIST" CFBundleVersion "$next"
  else
    echo "  (no watch Info.plist at $WATCH_PLIST)"
  fi

  printf '%s\n' "$next" > "$NUMBER_FILE"
  if [ -n "${CM_ENV:-}" ]; then
    echo "STROKEWISE_BUILD_NUMBER=$next" >> "$CM_ENV"
    echo "STROKEWISE_MARKETING_VERSION=$marketing" >> "$CM_ENV"
  fi
  echo "Stamped CFBundleVersion=$next (marketing $marketing). Saved to $NUMBER_FILE"
}

plist_version() {
  /usr/libexec/PlistBuddy -c 'Print :CFBundleVersion' "$1" 2>/dev/null \
    || die "could not read CFBundleVersion from $1"
}

check_ipa() {
  local latest="$1"
  local floor="${2:-17}"
  local ipa
  ipa=$(ls build/ios/ipa/*.ipa 2>/dev/null | head -1) || die "no IPA in build/ios/ipa"
  local work
  work=$(mktemp -d)
  unzip -q "$ipa" -d "$work"
  local app_plist
  app_plist=$(find "$work/Payload" -maxdepth 2 -name Info.plist | head -1)
  [ -n "$app_plist" ] || die "no Info.plist inside $ipa"
  local app_ver watch_ver
  app_ver=$(plist_version "$app_plist")
  echo "IPA iPhone CFBundleVersion=$app_ver ($app_plist)"
  local watch_plist
  watch_plist=$(find "$work/Payload" -path '*/Watch/*.app/Info.plist' | head -1)
  if [ -n "$watch_plist" ]; then
    watch_ver=$(plist_version "$watch_plist")
    echo "IPA watch CFBundleVersion=$watch_ver ($watch_plist)"
    [ "$watch_ver" = "$app_ver" ] || die "watch CFBundleVersion $watch_ver does not match the iPhone app's $app_ver"
  else
    echo "IPA: no watch Info.plist found inside the payload"
  fi

  [[ "$app_ver" =~ ^[0-9]+$ ]] || die "IPA CFBundleVersion '$app_ver' is not a plain integer"
  [[ "$latest" =~ ^[0-9]+$ ]] || latest=0
  [[ "$floor" =~ ^[0-9]+$ ]] || floor=17
  local min=$latest
  [ "$floor" -gt "$min" ] && min=$floor
  echo "App Store Connect latest=$latest, floor=$floor; IPA must be greater than $min"
  if [ "$app_ver" -le "$min" ]; then
    die "IPA CFBundleVersion $app_ver is not higher than $min (Apple already has '$latest'). Not publishing."
  fi
  echo "IPA CFBundleVersion $app_ver is higher than $min — ok to publish"
}

usage() {
  die "usage: $0 stamp <build-number> [marketing-version] | check-ipa <asc-latest> [floor]"
}

cmd="${1:-}"
shift || true
case "$cmd" in
  stamp) [ $# -ge 1 ] || usage; stamp "$@" ;;
  check-ipa) [ $# -ge 1 ] || usage; check_ipa "$@" ;;
  *) usage ;;
esac
