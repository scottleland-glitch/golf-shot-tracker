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
    private let statLock = NSLock()
    private var started = false
    private var lastSend = "nothing sent yet"       // shown in the app's Settings → Apple Watch, so a stuck link says why
    private var lastError = ""
    private var sentCount = 0

    private func note(_ text: String, error: Bool = false, sent: Bool = false) {
        statLock.lock(); defer { statLock.unlock() }
        lastSend = text
        if error { lastError = text }
        if sent { sentCount += 1 }
    }

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
        statLock.lock(); defer { statLock.unlock() }
        return ["supported": true, "activated": s.activationState == .activated, "paired": s.isPaired,
                "installed": s.isWatchAppInstalled, "reachable": s.isReachable,
                "lastSend": lastSend, "lastError": lastError, "sent": sentCount, "hasState": UserDefaults.standard.string(forKey: stateKey) != nil]
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
        guard WCSession.isSupported() else { note("watch connectivity is not supported here", error: true); return }
        let s = WCSession.default
        // not ready yet is fine: the picture is kept (lastState) and sent again the moment the session is active / the watch app shows up
        guard s.activationState == .activated else { note("waiting: the watch link is not active yet (the picture is kept and sent when it is)"); return }
        guard s.isPaired else { note("no Apple Watch is paired with this iPhone", error: true); return }
        guard s.isWatchAppInstalled else { note("the StrokeWise watch app is not installed on the paired watch", error: true); return }
        let payload: [String: Any] = ["state": json, "ts": Date().timeIntervalSince1970]
        do {
            try s.updateApplicationContext(payload)      // the latest one is kept for the watch, even if its app is closed
            note("sent the round to the watch (\(json.utf8.count) bytes\(s.isReachable ? ", watch reachable" : ", watch not reachable – it will get it when it wakes"))", sent: true)
        } catch {
            note("could not send to the watch: \(error.localizedDescription)", error: true)
        }
        if s.isReachable { s.sendMessage(payload, replyHandler: nil, errorHandler: nil) }   // and straight away when the watch app is open
    }

    // MARK: WCSessionDelegate

    public func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        if let error = error { note("the watch link failed to start: \(error.localizedDescription)", error: true) }
        else { note("watch link active (paired \(session.isPaired), watch app installed \(session.isWatchAppInstalled))") }
        if let json = lastState { sendState(json) }
    }
    public func sessionDidBecomeInactive(_ session: WCSession) {}
    public func sessionDidDeactivate(_ session: WCSession) { session.activate() }   // a new watch was paired
    public func sessionWatchStateDidChange(_ session: WCSession) { if let json = lastState { sendState(json) } }
    public func sessionReachabilityDidChange(_ session: WCSession) {
        listener?.watchReachability(session.isReachable)
        if session.isReachable, let json = lastState { sendState(json) }
    }

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
    public func session(_ session: WCSession, didReceiveUserInfo userInfo: [String: Any]) {
        _ = handle(userInfo)
    }
}
