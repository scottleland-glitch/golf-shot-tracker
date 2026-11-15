// StrokeWise – the iPhone end of the Apple Watch link (WatchConnectivity), independent of the web view.
//  · It is activated from AppDelegate at launch (see native/add-watch-target.rb), so a message from the watch can be received even when the
//    web view has not started – the system can wake the app in the background for it.
//  · Every shot, edit or undo from the watch is written to UserDefaults first (a queue) and only then acknowledged to the watch. The web app
//    (native/watch.js) reads the queue, applies the events to its round, saves, and acks them here to remove them.
//  · The web app sends the round picture; it is kept, and re-sent to the watch whenever the session (re)activates or the watch says hello.
import Foundation
import WatchConnectivity

public protocol StrokewiseWatchListener: AnyObject {
    func watchQueued()                       // a message arrived and is in the queue
    func watchHello()                        // the watch opened and wants the latest picture
    func watchReachability(_ reachable: Bool)
}

public final class StrokewiseWatchBridge: NSObject, WCSessionDelegate {
    public static let shared = StrokewiseWatchBridge()
    public weak var listener: StrokewiseWatchListener?

    private let queueKey = "strokewise.watch.queue.v1"
    private let stateKey = "strokewise.watch.laststate.v1"
    private let lock = NSLock()
    private var started = false

    // MARK: session

    public func activate() {
        guard WCSession.isSupported() else { return }
        lock.lock(); defer { lock.unlock() }
        if started { return }
        started = true
        let s = WCSession.default
        s.delegate = self
        s.activate()
    }

    public func info() -> [String: Any] {
        guard WCSession.isSupported() else { return ["supported": false] }
        let s = WCSession.default
        return ["supported": true, "activated": s.activationState == .activated, "paired": s.isPaired,
                "installed": s.isWatchAppInstalled, "reachable": s.isReachable]
    }

    // MARK: queue (watch → phone), durable

    public func pending() -> [[String: String]] {
        lock.lock(); defer { lock.unlock() }
        return (UserDefaults.standard.array(forKey: queueKey) as? [[String: String]]) ?? []
    }
    private func enqueue(_ json: String) {
        lock.lock(); defer { lock.unlock() }
        var q = (UserDefaults.standard.array(forKey: queueKey) as? [[String: String]]) ?? []
        q.append(["qid": UUID().uuidString, "json": json])
        UserDefaults.standard.set(q, forKey: queueKey)
        UserDefaults.standard.synchronize()
    }
    public func ack(_ qids: [String]) {
        lock.lock(); defer { lock.unlock() }
        let gone = Set(qids)
        let q = ((UserDefaults.standard.array(forKey: queueKey) as? [[String: String]]) ?? []).filter { !gone.contains($0["qid"] ?? "") }
        UserDefaults.standard.set(q, forKey: queueKey)
        UserDefaults.standard.synchronize()
    }

    // MARK: state (phone → watch)

    private var lastState: String? { UserDefaults.standard.string(forKey: stateKey) }

    public func pushState(_ json: String) {
        UserDefaults.standard.set(json, forKey: stateKey)
        sendState(json)
    }
    private func sendState(_ json: String) {
        guard WCSession.isSupported() else { return }
        let s = WCSession.default
        guard s.activationState == .activated, s.isPaired, s.isWatchAppInstalled else { return }
        try? s.updateApplicationContext(["state": json, "ts": Date().timeIntervalSince1970])
    }

    // MARK: WCSessionDelegate

    public func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        if let json = lastState { sendState(json) }
    }
    public func sessionDidBecomeInactive(_ session: WCSession) {}
    public func sessionDidDeactivate(_ session: WCSession) { session.activate() }   // a new watch was paired
    public func sessionWatchStateDidChange(_ session: WCSession) { if let json = lastState { sendState(json) } }
    public func sessionReachabilityDidChange(_ session: WCSession) { listener?.watchReachability(session.isReachable) }

    private func handle(_ payload: [String: Any]) -> [String: Any] {
        if let json = payload["event"] as? String {
            enqueue(json)            // saved first …
            listener?.watchQueued()
            return ["ok": 1]         // … then the watch is told it is safe
        }
        if payload["hello"] != nil {
            listener?.watchHello()
            return ["state": lastState ?? ""]
        }
        return [:]
    }
    public func session(_ session: WCSession, didReceiveMessage message: [String: Any], replyHandler: @escaping ([String: Any]) -> Void) {
        replyHandler(handle(message))
    }
    public func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        _ = handle(message)
    }
    public func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any] = [:]) {
        _ = handle(userInfo)
    }
}
