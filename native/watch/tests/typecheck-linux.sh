#!/usr/bin/env bash
# Type-checks ALL the watch Swift (screens, store, connectivity, workout, app) and the iPhone plugin on Linux against hand-written stand-ins for SwiftUI,
# WatchKit, HealthKit, WatchConnectivity and Capacitor (native/watch/tests/shims, signatures copied from the SDKs). It catches syntax, type, scoping and
# argument-label mistakes in our own code, but it is only as faithful as the stand-ins: the real Apple frameworks can only be compiled on a Mac (Codemagic).   bash native/watch/tests/typecheck-linux.sh
set -euo pipefail
cd "$(dirname "$0")/../../.."
W=native/watch/StrokewiseWatch; S=native/watch/tests/shims; OUT=$(mktemp -d)
for m in Combine SwiftUI WatchConnectivity WatchKit HealthKit Capacitor; do
  swiftc -emit-module -emit-module-path "$OUT/$m.swiftmodule" -module-name "$m" -parse-as-library -I "$OUT" "$S/$m.swift" -o /dev/null
done
swiftc -typecheck -I "$OUT" $W/*.swift
P=native/strokewise-watch-plugin/ios/Sources/StrokewiseWatchPlugin
# Linux has no Objective-C runtime, so the @objc markers are stripped from a temporary copy first
sed -e 's/@objc(StrokewiseWatchPlugin)//' -e 's/@objc //' $P/StrokewiseWatchPlugin.swift > "$OUT/StrokewiseWatchPlugin.swift"
swiftc -typecheck -I "$OUT" $P/StrokewiseWatchBridge.swift "$OUT/StrokewiseWatchPlugin.swift"
echo "typecheck ok (all watch Swift files; iPhone plugin: Bridge, Plugin)"
