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

    @Published private(set) var running = false
    @Published private(set) var note = ""     // shown on the hole screen when the workout could not start

    var isActive: Bool { session != nil || starting }

    // MARK: start

    func start() {
        guard !isActive else { return }
        guard HKHealthStore.isHealthDataAvailable() else { note = "Health isn't available"; return }
        starting = true
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
        let config = HKWorkoutConfiguration()
        config.activityType = .golf
        config.locationType = .outdoor
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

    /// Ends the session; the workout is finished and saved once the session reports it has ended.
    func end() {
        guard let s = session else { starting = false; return }
        s.end()
    }

    // (not called finalize: that is an NSObject method and the name clashes)
    private func finishWorkoutSession() {
        guard let b = builder else { reset(); return }
        b.endCollection(withEnd: Date()) { _, _ in
            b.finishWorkout { _, _ in DispatchQueue.main.async { self.reset() } }
        }
    }
    private func reset() {
        session = nil
        builder = nil
        starting = false
        running = false
    }

    // MARK: recovery (the app was relaunched while the workout was still running)

    func recover() {
        guard session == nil, !recovering else { return }
        recovering = true
        health.recoverActiveWorkoutSession { s, _ in
            DispatchQueue.main.async {
                self.recovering = false
                guard let s = s else { WatchStore.shared.workoutLost(); return }   // nothing was running after all
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
        DispatchQueue.main.async { self.note = "Workout stopped"; self.reset() }
    }

    // MARK: HKLiveWorkoutBuilderDelegate
    func workoutBuilder(_ workoutBuilder: HKLiveWorkoutBuilder, didCollectDataOf collectedTypes: Set<HKSampleType>) {}
    func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder) {}
}
