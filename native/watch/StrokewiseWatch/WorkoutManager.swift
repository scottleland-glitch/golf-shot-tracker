// StrokeWise watch – keeps the app alive for the whole round. An outdoor Golf workout (HKWorkoutSession + HKLiveWorkoutBuilder) runs from
// the start of the round to its end: watchOS keeps the app running in the background and brings it back to the front when the golfer raises
// their wrist, even after texting or opening another app. If the system relaunches the app while the workout is still going,
// handleActiveWorkoutRecovery (AppDelegate) reconnects to it. The workout is saved to Health when it ends.
import Foundation
import Combine
import HealthKit

final class WorkoutManager: NSObject, ObservableObject, HKWorkoutSessionDelegate, HKLiveWorkoutBuilderDelegate {
    static let shared = WorkoutManager()

    private let health = HKHealthStore()
    private var session: HKWorkoutSession?
    private var builder: HKLiveWorkoutBuilder?
    private var starting = false
    private var recovering = false
    private var finishing = false                        // the session ended and the builder is being finished / discarded
    private var cancelStart = false                      // end() arrived while the Health permission step was still pending: don't start at all
    private var endCompletions: [(Bool) -> Void] = []    // told (workout saved?) once the end has fully finished
    private var startConfig: HKWorkoutConfiguration?     // the configuration the iPhone launched us with (nil: the usual outdoor golf one)

    @Published private(set) var running = false
    @Published private(set) var note = ""     // shown on the hole screen when the workout could not start

    var isActive: Bool { session != nil || starting }

    /// The workout was started by the iPhone launching this app (handle(_ workoutConfiguration:)), not by a round we already knew about.
    /// The store attaches it to the round when the phone's picture arrives (WatchStore.evaluateWorkout).
    private(set) var launchedByPhone = false
    func markLaunchedByPhone(_ v: Bool) { launchedByPhone = v }

    // MARK: start

    func start(config: HKWorkoutConfiguration? = nil) {
        guard !isActive else { return }
        startConfig = config
        guard HKHealthStore.isHealthDataAvailable() else { note = "Health isn't available"; return }
        starting = true
        cancelStart = false
        let share: Set<HKSampleType> = [HKObjectType.workoutType()]
        var read = Set<HKObjectType>()
        for id in [HKQuantityTypeIdentifier.heartRate, .activeEnergyBurned, .distanceWalkingRunning] {
            if let t = HKObjectType.quantityType(forIdentifier: id) { read.insert(t) }
        }
        health.requestAuthorization(toShare: share, read: read) { _, _ in
            DispatchQueue.main.async { self.begin() }
        }
    }

    private func begin() {
        if cancelStart {   // the golfer ended the round before the workout had even begun
            cancelStart = false; starting = false; startConfig = nil
            fireEndCompletions(saved: false)
            return
        }
        let config = startConfig ?? HKWorkoutConfiguration()
        config.activityType = .golf
        config.locationType = .outdoor
        startConfig = nil
        do {
            let s = try HKWorkoutSession(healthStore: health, configuration: config)
            let b = s.associatedWorkoutBuilder()
            b.dataSource = HKLiveWorkoutDataSource(healthStore: health, workoutConfiguration: config)
            s.delegate = self
            b.delegate = self
            session = s
            builder = b
            let now = Date()
            s.startActivity(with: now)
            b.beginCollection(withStart: now) { _, _ in }
            note = ""
        } catch {
            note = "Workout didn't start"
        }
        starting = false
    }

    // MARK: end

    /// Ends the workout: session.end(), then the builder is finished (saved to Health) or discarded, then every completion is called with
    /// "was a workout saved". With no workout at all the completion is called at once. Safe to call twice, and while a start is still pending.
    func end(completion: ((Bool) -> Void)? = nil) {
        if let c = completion { endCompletions.append(c) }
        if let s = session {
            s.end()    // the delegate reports .ended, which finishes the builder
            // if the system never reports the end, finish anyway rather than leave the golfer waiting
            DispatchQueue.main.asyncAfter(deadline: .now() + 6) { [weak self] in
                guard let self = self, self.session === s, !self.endCompletions.isEmpty else { return }
                self.finishWorkoutSession()
            }
        } else if starting {
            cancelStart = true          // begin() will see this and not start
        } else {
            fireEndCompletions(saved: false)
        }
    }

    // (not called finalize: that is an NSObject method and the name clashes)
    private func finishWorkoutSession() {
        guard !finishing else { return }
        finishing = true
        guard let b = builder else { reset(saved: false); return }
        b.endCollection(withEnd: Date()) { ok, _ in
            guard ok else { b.discardWorkout(); DispatchQueue.main.async { self.reset(saved: false) }; return }
            b.finishWorkout { w, _ in
                if w == nil { b.discardWorkout() }
                DispatchQueue.main.async { self.reset(saved: w != nil) }
            }
        }
    }
    /// The workout is completely over (saved or discarded). `reevaluate`: let the store decide again (a new round may be waiting for its workout);
    /// a round the golfer ended is remembered as ended, so nothing restarts for it.
    private func reset(saved: Bool, reevaluate: Bool = true) {
        launchedByPhone = false
        session = nil
        builder = nil
        starting = false
        running = false
        finishing = false
        fireEndCompletions(saved: saved)
        if reevaluate { WatchStore.shared.evaluateWorkout() }
    }
    private func fireEndCompletions(saved: Bool) {
        let list = endCompletions
        endCompletions = []
        for c in list { c(saved) }
    }

    // MARK: recovery (the app was relaunched while the workout was still running)

    func recover() {
        guard session == nil, !recovering else { return }
        recovering = true
        health.recoverActiveWorkoutSession { s, _ in
            DispatchQueue.main.async {
                self.recovering = false
                guard let s = s else { WatchStore.shared.workoutLost(); self.fireEndCompletions(saved: false); return }   // nothing was running after all
                guard self.session == nil else { return }
                self.session = s
                let b = s.associatedWorkoutBuilder()
                b.delegate = self
                if b.dataSource == nil { b.dataSource = HKLiveWorkoutDataSource(healthStore: self.health, workoutConfiguration: s.workoutConfiguration) }
                self.builder = b
                s.delegate = self
                self.running = (s.state == .running || s.state == .paused)
                WatchStore.shared.workoutRecovered()
            }
        }
    }

    // MARK: HKWorkoutSessionDelegate

    func workoutSession(_ workoutSession: HKWorkoutSession, didChangeTo toState: HKWorkoutSessionState, from fromState: HKWorkoutSessionState, date: Date) {
        DispatchQueue.main.async {
            switch toState {
            case .running: self.running = true
            case .ended: self.finishWorkoutSession()
            default: break
            }
        }
    }
    func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error) {
        DispatchQueue.main.async { self.note = "Workout stopped"; self.reset(saved: false, reevaluate: false) }
    }

    // MARK: HKLiveWorkoutBuilderDelegate
    func workoutBuilder(_ workoutBuilder: HKLiveWorkoutBuilder, didCollectDataOf collectedTypes: Set<HKSampleType>) {}
    func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}
}
