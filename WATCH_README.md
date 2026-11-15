# StrokeWise on Apple Watch (milestone 1)

This branch (`watch-app`) adds an Apple Watch companion to StrokeWise. Nothing here is on `main`, and the normal `ios-testflight` Codemagic workflow is unchanged, so your regular iPhone builds are not affected.

**Important: this was written without a Mac, so the Swift code has never been compiled.** The first Codemagic run is the first time Xcode sees it. Expect that run might fail on a typo or two. See "What was and wasn't tested" at the bottom.

## What you get

On the watch, during a round:

- **Hole screen**: four big lie buttons (Fairway, Rough, Green, Bunker), plus More and In the hole. Tap the lie where the ball ended up. More has Deep rough, Trees, Hazard +1, OB +1, Unplayable +1 and Lost ball +1.
- **Direction** (optional, with Skip). After OB or a lost ball a side is required, same as the phone.
- **Distance** with the Digital Crown (yards, or feet on the green), with +/-10 buttons.
- **Confirm** screen: Save or Edit.
- **Hole finished** screen with auto-advance to the next hole after about 6 seconds. **Undo** there, or on the first shot of the next hole, reopens the hole you just finished.
- **Swipe right** on the hole screen: list of completed holes, scrolled with the Crown. Tap a hole to edit its shots: change a shot, delete a shot, or add a shot.
- A small banner when shots are queued (watch out of range of the phone). They send by themselves when the phone is back.

The phone still owns the round: you start the round on the iPhone, and the watch follows it. Everything you enter on the watch is applied to the phone's round using the same rules as the phone's own hole entry, and saved in the same place (`golfsg.rounds.v1`).

### Staying alive during a round (workout)

When a round is in progress, the watch starts a **Golf workout** (outdoor, via HealthKit). That is what stops watchOS from putting StrokeWise away when you check a text or drop your wrist: the app stays running in the background and returns to the front when you raise your wrist.

- The first time, the watch asks for Health permission. Say **Allow**. If you say no, the app still works, but watchOS may close it mid-round.
- Every confirmed shot and the round state are written to the watch's storage immediately. If the app is killed or the watch restarts, reopening StrokeWise puts you back on the exact hole and shot, and the workout is picked up again.
- The workout ends by itself when the round is finished on the watch or on the phone (or when the round is deleted/discarded on the phone).
- To end it by hand from the watch: on the hole screen scroll down and tap **End round** (it asks you to confirm). There is also a **Start workout** button if you ever need to restart one.
- The workout is saved in Apple Health as a Golf workout (time and heart rate/calories as the watch measures them). Nothing is read from or sent anywhere else.

### The watch app opens by itself when a round starts

When a new round starts on the iPhone, the phone wakes the watch app (`HKHealthStore.startWatchApp`, golf / outdoor) and the watch starts its Golf workout, like Strava or Nike Run Club. It happens once per round (never per shot), and not when you reopen the app mid-round.

- **First time only:** the iPhone shows the Health permission sheet when you start a round (Workouts: share; Heart Rate, Active Energy, Walking + Running Distance: read). Tap **Turn On All** and **Allow**. The watch does not ask again.
- **The iPhone App ID needs HealthKit too.** developer.apple.com > Identifiers > `com.strokewise.app` > tick **HealthKit** > Save, then regenerate/re-download the `com.strokewise.app` App Store profile and upload it in Codemagic (replacing the old one). If the profile has no HealthKit, the watch workflow says so in the log ("check the iPhone profile has HealthKit"), builds without it, and the watch app simply isn't launched automatically (Settings > Apple Watch says why).
- Where it lives: `native/watch.js` (`maybeLaunch`), the plugin's `StrokewiseWatchLauncher.swift`, the entitlement in `native/add-watch-target.rb`, the two Health strings in `native/ios-setup.sh`, the check in `native/check-phone-healthkit.sh`. All of it only runs in the `ios-testflight-watch` workflow. `STROKEWISE_PHONE_HEALTHKIT=0` turns it off.
- On the watch, `AppDelegate.handle(_ workoutConfiguration:)` starts the workout right away and attaches it to the round when the phone's picture arrives (waits up to 90 s).

## Your one-time steps (about 15 minutes, in a browser)

The watch app is a second "app" inside StrokeWise, so Apple needs a second ID and a second signing profile for it.

1. **Register the watch App ID** at developer.apple.com > Certificates, Identifiers & Profiles > Identifiers > **+** > App IDs > App.
   - Bundle ID (Explicit): `com.strokewise.app.watchkitapp`
   - Description: StrokeWise Watch
   - **Under Capabilities, tick HealthKit.** This is required. The watch app uses the HealthKit capability for the workout, and signing will fail if the App ID doesn't have it.
2. **Create a provisioning profile** (Profiles > **+** > Distribution > **App Store Connect**).
   - App ID: `com.strokewise.app.watchkitapp`
   - Certificate: the same Apple Distribution certificate you already use for StrokeWise.
   - Name it something like `StrokeWise Watch App Store`. Download it (a `.mobileprovision` file).
3. **Add it in Codemagic.** Easiest: Codemagic > Teams > Personal account (or your team) > Code signing identities > iOS provisioning profiles > upload the `.mobileprovision` file. (If your setup fetches profiles from App Store Connect, the new workflow will fetch it for you by bundle id.)
4. **Run the new workflow**: in Codemagic choose the `watch-app` branch and the workflow **`ios-testflight-watch`** (not `ios-testflight`). It builds the iPhone app with the watch app inside and uploads to TestFlight like usual.
5. **Install from TestFlight** on your iPhone. The watch app appears on the paired Apple Watch (Watch app on iPhone > StrokeWise > Install, if it isn't automatic). Open StrokeWise on the watch and allow Health access when asked.

If step 4 complains it can't find a profile for the watch, open `codemagic.yaml`, find the commented lines under `ios-testflight-watch` > `ios_signing`, and list both profiles (iPhone and watch) there explicitly. That's the one part I couldn't confirm without running it.

## If the watch shows nothing

Two places tell you what is going on:

- **On the iPhone: Settings → Apple Watch** (near the bottom). It shows whether a watch is paired, whether the StrokeWise watch app is installed, whether the link is active, what was last sent, and a short log. **"Send this round to the watch now"** pushes the round again. If it says **NOT WORKING** followed by a reason, that reason is the problem (for example the watch plugin is missing from the build).
- **On the watch: the status line at the bottom of the hole screen** ("Phone: connected", "Phone: waiting (open StrokeWise on the iPhone)", "Phone: starting…") and the time of the last update from the phone. With no round, the **Check phone** button re-reads what the phone last sent and asks it for a fresh copy.

Things to try, in this order: open StrokeWise on the iPhone (keep it in front), start or resume a round, then raise the watch and open StrokeWise on the watch. The round normally appears within a few seconds. If the watch says "Phone: waiting", the iPhone app is not reachable right now: bring it to the front. The phone keeps the latest round picture and sends it again when the watch connects, so nothing is lost.

## How the watch and phone stay in sync

- Phone to watch: the phone sends the current round state (current hole, next hole, finished holes, shots, pars) whenever anything changes.
- Watch to phone: each action is an event. If the phone is reachable it goes immediately; otherwise it is queued on the watch (and on disk) and delivered later. The phone saves every event to disk before confirming it, then applies it, then acknowledges. Events are never lost and never applied twice.
- Conflicts: the phone wins. A watch shot is only accepted for the open shot on an unfinished hole; edits to finished holes go through the edit path.
- In a browser or the website (PWA) none of this runs. The code does nothing unless it is the iPhone app built by the watch workflow.

## Version

`main` is v216. I did **not** bump the version on this branch. The version number is displayed in the app and checked by a test; since this branch isn't released, bump it to v217 when you decide to merge. (The watch workflow sets the iOS marketing version to 1.0 and the build number from Codemagic's counter plus one, applied to the iPhone app and the watch app together, since Apple requires them to match.)

## Known limits in milestone 1

- Start the round on the phone (the watch follows).
- Unplayable lies drop to Rough by default (the watch doesn't ask where you dropped).
- No GPS/auto distances on the watch yet. You type distance with the Crown.
- 9-hole rounds: the workout doesn't know the round is over after hole 9, so tap **End round** on the watch (or finish the round on the phone).
- If the phone has not sent a fresh round state in the last 12 hours, the watch won't start a workout by itself (so an old unfinished round doesn't start one).

## What was and wasn't tested

Tested (on Linux, in this repo):

- `node tests/watch-core.test.js`: 29 scenarios for the shared rules (fairway, OB, lost ball, unplayable, hazard drop/re-tee, chip-in, undo across holes, edits, deletes, inserts, duplicate and stale events).
- `node tests/watch-focused.js`: drives the real phone UI with the same shots and checks the watch rules give identical rows.
- `bash native/watch/tests/run-linux.sh`: compiles the Swift rules/model/storage with the Linux Swift compiler and runs the same 29 scenarios through the Swift port (0 differences), plus state decoding, event encoding and a save/reload round trip.
- `bash native/watch/tests/typecheck-linux.sh`: type-checks every watch Swift file and the plugin against stand-ins for SwiftUI, HealthKit, WatchKit, WatchConnectivity and Capacitor.
- `node tests/watch-bundle-focused.js`: loads the real iPhone web bundle (as built for the watch workflow) with a pretend native plugin shaped like Capacitor's own bridge, starts a round and enters a shot, and checks each one is pushed to the watch and shows in Settings → Apple Watch.
- `bash native/watch/tests/check-build-integration.sh`: builds a scratch Capacitor project and runs the watch-target script; checks the watch target, bundle id `com.strokewise.app.watchkitapp`, HealthKit entitlement, workout-processing background mode, "Embed Watch Content" phase, dependency, and plugin wiring.
- The repo's existing tests that touch hole entry, finish, hole-out, undo/back, scorecard, native app wrapper, tee, discard, version still pass. (`live-share-focused` fails on `main` too, same assertion, not caused by this branch.)

**Not verified (needs a Mac, Xcode, or the real devices):**

- None of the SwiftUI screens, HealthKit workout code, WatchConnectivity code, or the Capacitor plugin has been compiled against Apple's real SDKs. Expect possible compile errors on the first Codemagic run.
- The generated Xcode project has been inspected, not opened in Xcode.
- Code signing, the embedded-watch-app check, and the new Codemagic workflow haven't been run.
- Behaviour on a real watch: WatchConnectivity in the background, Crown feel, swipe-right vs back-swipe, workout survival, relaunch recovery.
