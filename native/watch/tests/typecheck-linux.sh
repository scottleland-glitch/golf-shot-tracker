#!/usr/bin/env bash
# Type-checks the non-UI Swift (the watch app's Store, Connectivity + pure files, and the iPhone plugin) on Linux against tiny stand-ins for SwiftUI's ObservableObject,
# WatchConnectivity and WorkoutManager. It catches syntax and type mistakes in our own code only; the SwiftUI screens, HealthKit and the
# real Apple frameworks can only be compiled on a Mac (Codemagic).   bash native/watch/tests/typecheck-linux.sh
set -euo pipefail
cd "$(dirname "$0")/../../.."
W=native/watch/StrokewiseWatch; S=native/watch/tests/shims; OUT=$(mktemp -d)
for m in SwiftUI WatchConnectivity Capacitor; do
  swiftc -emit-module -emit-module-path "$OUT/$m.swiftmodule" -module-name "$m" -parse-as-library "$S/$m.swift" -o /dev/null 2>/dev/null || swiftc -emit-module -emit-module-path "$OUT/$m.swiftmodule" -module-name "$m" -parse-as-library -c "$S/$m.swift" -o "$OUT/$m.o"
done
swiftc -typecheck -I "$OUT" $W/Model.swift $W/Rules.swift $W/Labels.swift $W/Persistence.swift $W/Store.swift $W/Connectivity.swift $S/WorkoutManagerStub.swift
P=native/strokewise-watch-plugin/ios/Sources/StrokewiseWatchPlugin
# Linux has no Objective-C runtime, so the @objc markers are stripped from a temporary copy first
sed -e 's/@objc(StrokewiseWatchPlugin)//' -e 's/@objc //' $P/StrokewiseWatchPlugin.swift > "$OUT/StrokewiseWatchPlugin.swift"
swiftc -typecheck -I "$OUT" $P/StrokewiseWatchBridge.swift "$OUT/StrokewiseWatchPlugin.swift"
echo "typecheck ok (watch: Store, Connectivity, Model, Rules, Labels, Persistence; iPhone plugin: Bridge, Plugin)"
