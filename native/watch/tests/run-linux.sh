#!/usr/bin/env bash
# Compiles the Foundation-only Swift files of the watch app (Model, Rules, Labels, Persistence) on Linux and runs the shared test vectors through them.
# Needs a Swift toolchain on PATH (swift.org Linux build). Run from anywhere:  bash native/watch/tests/run-linux.sh
set -euo pipefail
cd "$(dirname "$0")/../../.."
OUT=$(mktemp -d)
swiftc -O native/watch/StrokewiseWatch/Model.swift native/watch/StrokewiseWatch/Rules.swift native/watch/StrokewiseWatch/Labels.swift native/watch/StrokewiseWatch/Persistence.swift native/watch/tests/main.swift -o "$OUT/rules-check"
"$OUT/rules-check" tests/fixtures/watch-vectors.json
