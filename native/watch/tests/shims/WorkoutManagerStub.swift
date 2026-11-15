// Linux typecheck stand-in for WorkoutManager.swift (HealthKit). Not shipped.
import SwiftUI
final class WorkoutManager: ObservableObject {
    static let shared = WorkoutManager()
    var isActive = false
    var running = false
    var note = ""
    func start() {}
    func end() {}
    func recover() {}
}
