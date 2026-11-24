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

  # Versions come from --set-version and the Info.plist stamps below. Do not also
  # run agvtool or rewrite the pbxproj with apple-generic (that extra save is new
  # and can disturb the Embed Watch Content phase). --set-version also re-applies
  # the embed so StrokeWise.app is copied into the iPhone app's Watch folder.
  if [ ! -f native/add-watch-target.rb ] || [ ! -d ios/App/StrokewiseWatch ]; then
    die "watch target files are missing; ios-setup.sh did not add the watch app"
  fi
  ruby native/add-watch-target.rb --set-version "$marketing" "$next"
  if ! grep -q "Embed Watch Content" ios/App/App.xcodeproj/project.pbxproj; then
    die "Embed Watch Content is missing from the Xcode project after stamping versions"
  fi
  if ! grep -q StrokewiseWatch ios/App/App.xcodeproj/project.pbxproj; then
    die "StrokewiseWatch target is missing from the Xcode project after stamping versions"
  fi
  echo "Embed Watch Content phase and StrokewiseWatch target are still in the project"

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
  local ipa="" f ipa_count=0
  for f in build/ios/ipa/*.ipa; do
    [ -f "$f" ] || continue
    echo "  found IPA: $f"
    ipa=$f
    ipa_count=$((ipa_count + 1))
  done
  [ "$ipa_count" -gt 0 ] || die "no IPA in build/ios/ipa"
  [ "$ipa_count" -eq 1 ] || die "expected one IPA in build/ios/ipa, found $ipa_count"

  local work
  work=$(mktemp -d)
  unzip -q "$ipa" -d "$work"
  echo "Apps in the IPA payload:"
  find "$work/Payload" -name '*.app' | sort | while IFS= read -r d; do
    echo "  ${d#"$work/"}"
  done

  # iPhone app is Payload/<something>.app — often App.app, but Capacitor may name it Strokewise.app
  local app_plist="" watch_plist=""
  for f in "$work"/Payload/*.app/Info.plist; do
    case "$f" in
      */Watch/*|*/PlugIns/*|*/Frameworks/*) continue ;;
    esac
    [ -f "$f" ] || continue
    app_plist=$f
    break
  done
  [ -n "$app_plist" ] || die "no iPhone app Info.plist inside $ipa"

  # Watch product is StrokeWise.app (target name is StrokewiseWatch), inside */Watch/
  for f in "$work"/Payload/*.app/Watch/*.app/Info.plist; do
    [ -f "$f" ] || continue
    watch_plist=$f
    break
  done
  if [ -z "$watch_plist" ]; then
    echo "No watch app at Payload/<App>.app/Watch/*.app. Info.plist paths in the IPA:"
    find "$work/Payload" -name Info.plist | sort
    die "the watch app is not embedded in the IPA (looked for Payload/<App>.app/Watch/StrokeWise.app)"
  fi

  local app_ver watch_ver
  app_ver=$(plist_version "$app_plist")
  watch_ver=$(plist_version "$watch_plist")
  echo "IPA iPhone CFBundleVersion=$app_ver ($app_plist)"
  echo "IPA watch  CFBundleVersion=$watch_ver ($watch_plist)"
  [ "$watch_ver" = "$app_ver" ] || die "watch CFBundleVersion $watch_ver does not match the iPhone app's $app_ver"

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
