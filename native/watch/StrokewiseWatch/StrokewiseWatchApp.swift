// StrokeWise watch – app entry. A dependent companion of the iPhone app (com.strokewise.app).
import Foundation
import SwiftUI
import WatchKit
import HealthKit

@main
struct StrokewiseWatchApp: App {
    @WKApplicationDelegateAdaptor(AppDelegate.self) var delegate
    @StateObject private var store = WatchStore.shared
    @StateObject private var workout = WorkoutManager.shared
    @Environment(\.scenePhase) private var scenePhase

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(store)
                .environmentObject(workout)
                .onAppear { store.evaluateWorkout() }
                .onChange(of: scenePhase) { phase in
                    if phase == .active {
                        Connectivity.shared.refresh()
                        store.evaluateWorkout()
                    }
                }
        }
    }
}

final class AppDelegate: NSObject, WKApplicationDelegate {
    func applicationDidFinishLaunching() {
        Connectivity.shared.activate()   // also reads the last picture the phone left for us
    }
    /// The iPhone started a round and woke this app with the workout it wants (HKHealthStore.startWatchApp on the phone): start the Golf workout now.
    /// The round itself arrives separately (application context from the phone); the store attaches the workout to it when it does.
    func handle(_ workoutConfiguration: HKWorkoutConfiguration) {
        DispatchQueue.main.async { WatchStore.shared.phoneLaunchedWorkout(workoutConfiguration) }
    }
    /// The system relaunched the app while a workout (the round) was still running: reconnect to it.
    func handleActiveWorkoutRecovery() {
        WorkoutManager.shared.recover()
    }
}
