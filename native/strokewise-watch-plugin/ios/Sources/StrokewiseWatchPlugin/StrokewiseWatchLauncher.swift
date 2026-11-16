// StrokeWise – wakes the Apple Watch app when a round starts on the iPhone (HKHealthStore.startWatchApp), the way Strava / Nike Run Club do.
// The watch app receives it in WKApplicationDelegate.handle(_ workoutConfiguration:) and starts its Golf workout.
//  · Needs the HealthKit capability on the iPhone app (entitlement + App ID + profile) and the two Health usage strings in its Info.plist.
//    native/ios-setup.sh adds them only in the watch workflow; without the strings this file does nothing (HealthKit would crash the app
//    when asked for access without them), and says so in the reason it returns (shown in Settings → Apple Watch).
//  · The same Health access the watch asks for (workout share, heart rate / energy / distance read) is requested here first, so the one-time
//    permission sheet appears on the iPhone at the start of the first round, and the watch does not need to ask again.
import Foundation
import HealthKit

public final class StrokewiseWatchLauncher {
    public static let shared = StrokewiseWatchLauncher()
    private let health = HKHealthStore()

    /// Both strings are set by native/ios-setup.sh together with the entitlement.
    public static var configured: Bool {
        Bundle.main.object(forInfoDictionaryKey: "NSHealthShareUsageDescription") != nil
            && Bundle.main.object(forInfoDictionaryKey: "NSHealthUpdateUsageDescription") != nil
    }

    /// completion gets ["ok": Bool, "reason": String] (reason is empty when ok). Called on an arbitrary queue.
    public func launch(completion: @escaping ([String: Any]) -> Void) {
        guard StrokewiseWatchLauncher.configured else {
            completion(["ok": false, "reason": "this build has no HealthKit set up on the iPhone app (Health usage strings missing), so the watch app is not launched automatically"]); return
        }
        guard HKHealthStore.isHealthDataAvailable() else {
            completion(["ok": false, "reason": "Health is not available on this iPhone"]); return
        }
        let share: Set<HKSampleType> = [HKObjectType.workoutType()]
        var read = Set<HKObjectType>()
        for id in [HKQuantityTypeIdentifier.heartRate, .activeEnergyBurned, .distanceWalkingRunning] {
            if let t = HKObjectType.quantityType(forIdentifier: id) { read.insert(t) }
        }
        let store = health
        // the sheet only shows the first time; afterwards this returns at once. Whatever the answer, try the launch (it reports a denial itself).
        store.requestAuthorization(toShare: share, read: read) { _, authError in
            let config = HKWorkoutConfiguration()
            config.activityType = .golf
            config.locationType = .outdoor
            store.startWatchApp(with: config) { ok, error in
                if ok { completion(["ok": true, "reason": ""]); return }
                let why = error?.localizedDescription ?? authError?.localizedDescription ?? "unknown reason"
                completion(["ok": false, "reason": "the watch app could not be launched: \(why)"])
            }
        }
    }
}
