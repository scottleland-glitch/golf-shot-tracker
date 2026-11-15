// Linux typecheck stand-in for the HealthKit calls WorkoutManager.swift makes (signatures as in the watchOS SDK). Not shipped.
import Foundation
public class HKObjectType: NSObject {
    public static func workoutType() -> HKWorkoutType { HKWorkoutType() }
    public static func quantityType(forIdentifier id: HKQuantityTypeIdentifier) -> HKQuantityType? { HKQuantityType() }
}
public class HKSampleType: HKObjectType {}
public class HKWorkoutType: HKSampleType {}
public class HKQuantityType: HKSampleType {}
public enum HKQuantityTypeIdentifier { case heartRate, activeEnergyBurned, distanceWalkingRunning }
public enum HKWorkoutActivityType { case golf, other }
public enum HKWorkoutSessionLocationType { case outdoor, indoor, unknown }
public enum HKWorkoutSessionState { case notStarted, running, ended, paused, prepared, stopped }
public class HKWorkoutConfiguration: NSObject {
    public var activityType: HKWorkoutActivityType = .other
    public var locationType: HKWorkoutSessionLocationType = .unknown
}
public class HKWorkout: NSObject {}
public class HKHealthStore: NSObject {
    public static func isHealthDataAvailable() -> Bool { true }
    public func requestAuthorization(toShare typesToShare: Set<HKSampleType>?, read typesToRead: Set<HKObjectType>?, completion: @escaping (Bool, Error?) -> Void) {}
    public func recoverActiveWorkoutSession(completion: @escaping (HKWorkoutSession?, Error?) -> Void) {}
}
public protocol HKWorkoutSessionDelegate: NSObjectProtocol {
    func workoutSession(_ workoutSession: HKWorkoutSession, didChangeTo toState: HKWorkoutSessionState, from fromState: HKWorkoutSessionState, date: Date)
    func workoutSession(_ workoutSession: HKWorkoutSession, didFailWithError error: Error)
}
public protocol HKLiveWorkoutBuilderDelegate: NSObjectProtocol {
    func workoutBuilder(_ workoutBuilder: HKLiveWorkoutBuilder, didCollectDataOf collectedTypes: Set<HKSampleType>)
    func workoutBuilderDidCollectEvent(_ workoutBuilder: HKLiveWorkoutBuilder)
}
public class HKLiveWorkoutDataSource: NSObject { public init(healthStore: HKHealthStore, workoutConfiguration: HKWorkoutConfiguration?) {} }
public class HKLiveWorkoutBuilder: NSObject {
    public var dataSource: HKLiveWorkoutDataSource?
    public weak var delegate: HKLiveWorkoutBuilderDelegate?
    public func beginCollection(withStart startDate: Date, completion: @escaping (Bool, Error?) -> Void) {}
    public func endCollection(withEnd endDate: Date, completion: @escaping (Bool, Error?) -> Void) {}
    public func finishWorkout(completion: @escaping (HKWorkout?, Error?) -> Void) {}
}
public class HKWorkoutSession: NSObject {
    public init(healthStore: HKHealthStore, configuration: HKWorkoutConfiguration) throws {}
    public weak var delegate: HKWorkoutSessionDelegate?
    public var state: HKWorkoutSessionState { .running }
    public var workoutConfiguration: HKWorkoutConfiguration { HKWorkoutConfiguration() }
    public func associatedWorkoutBuilder() -> HKLiveWorkoutBuilder { HKLiveWorkoutBuilder() }
    public func startActivity(with date: Date?) {}
    public func end() {}
}
