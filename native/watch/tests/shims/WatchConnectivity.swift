// Linux typecheck stand-in for the WatchConnectivity calls Connectivity.swift makes. Not shipped.
import Foundation
public enum WCSessionActivationState: Int { case notActivated, inactive, activated }
public final class WCSessionUserInfoTransfer {}
public protocol WCSessionDelegate: NSObjectProtocol {
    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?)
    func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any])
    func sessionReachabilityDidChange(_ session: WCSession)
    func sessionDidBecomeInactive(_ session: WCSession)
    func sessionDidDeactivate(_ session: WCSession)
    func sessionWatchStateDidChange(_ session: WCSession)
    func session(_ session: WCSession, didReceiveMessage message: [String: Any], replyHandler: @escaping ([String: Any]) -> Void)
    func session(_ session: WCSession, didReceiveMessage message: [String: Any])
    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any])
}
// the real protocol marks all but activation as optional – defaults stand in for that
public extension WCSessionDelegate {
    func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {}
    func sessionReachabilityDidChange(_ session: WCSession) {}
    func sessionDidBecomeInactive(_ session: WCSession) {}
    func sessionDidDeactivate(_ session: WCSession) {}
    func sessionWatchStateDidChange(_ session: WCSession) {}
    func session(_ session: WCSession, didReceiveMessage message: [String: Any], replyHandler: @escaping ([String: Any]) -> Void) {}
    func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {}
    func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any]) {}
}
public class WCSession: NSObject {
    public static let `default` = WCSession()
    public static func isSupported() -> Bool { true }
    public weak var delegate: WCSessionDelegate?
    public var activationState: WCSessionActivationState = .notActivated
    public var isReachable = false
    public var receivedApplicationContext: [String: Any] = [:]
    public var isPaired = false
    public var isWatchAppInstalled = false
    public var isCompanionAppInstalled = false   // watchOS only
    public func activate() {}
    public func updateApplicationContext(_ applicationContext: [String: Any]) throws {}
    public func sendMessage(_ message: [String: Any], replyHandler: (([String: Any]) -> Void)?, errorHandler: ((Error) -> Void)? = nil) {}
    @discardableResult public func transferUserInfo(_ userInfo: [String: Any]) -> WCSessionUserInfoTransfer { WCSessionUserInfoTransfer() }
}
