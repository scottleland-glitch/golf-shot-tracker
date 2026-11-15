// StrokeWise watch – talking to the iPhone app (WatchConnectivity).
//  · phone → watch: the round picture arrives as an application context (latest one wins, delivered even if the watch app was not open).
//  · watch → phone: a confirmed shot goes by sendMessage when the phone is reachable (the phone's native layer saves it to its own queue and
//    replies), and by transferUserInfo (kept and delivered by the system, even after the phone app was closed) when it is not.
//    The shot stays in the watch's own file until the phone's next picture lists its id as applied. Resending is safe: the phone ignores ids it knows.
import Foundation
import WatchConnectivity

final class Connectivity: NSObject, WCSessionDelegate {
    static let shared = Connectivity()
    private var inFlight = Set<String>()

    private var wc: WCSession? { WCSession.isSupported() ? WCSession.default : nil }   // (not `session`: the delegate methods below are called session(_:…))

    func activate() {
        guard let s = wc else { return }
        s.delegate = self
        s.activate()
    }

    /// Sends every shot that has not been handed over yet. Call on the main thread.
    func flush() {
        for p in WatchStore.shared.unsentEvents() { deliver(p.event) }
    }

    private func deliver(_ ev: WatchEvent) {
        guard let s = wc, s.activationState == .activated, !inFlight.contains(ev.id),
              let data = try? JSONEncoder().encode(ev), let json = String(data: data, encoding: .utf8) else { return }
        let payload: [String: Any] = ["event": json]
        if s.isReachable {
            inFlight.insert(ev.id)
            s.sendMessage(payload, replyHandler: { _ in
                DispatchQueue.main.async { self.inFlight.remove(ev.id); WatchStore.shared.markSent(ev.id) }
            }, errorHandler: { _ in
                DispatchQueue.main.async { self.inFlight.remove(ev.id); self.queue(payload, ev.id) }
            })
        } else {
            queue(payload, ev.id)
        }
    }
    private func queue(_ payload: [String: Any], _ id: String) {
        wc?.transferUserInfo(payload)
        WatchStore.shared.markSent(id)
    }

    /// Ask the phone for the latest picture (when the watch app opens or the phone comes back).
    func requestState() {
        guard let s = wc, s.activationState == .activated, s.isReachable else { return }
        s.sendMessage(["hello": 1], replyHandler: { reply in
            if let json = reply["state"] as? String, !json.isEmpty { DispatchQueue.main.async { WatchStore.shared.receive(json: json) } }
        }, errorHandler: { _ in })
    }

    // MARK: WCSessionDelegate

    func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        DispatchQueue.main.async {
            WatchStore.shared.setReachable(session.isReachable)
            if let json = session.receivedApplicationContext["state"] as? String { WatchStore.shared.receive(json: json) }
            self.flush()
            self.requestState()
        }
    }
    func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        guard let json = applicationContext["state"] as? String else { return }
        DispatchQueue.main.async { WatchStore.shared.receive(json: json) }
    }
    func sessionReachabilityDidChange(_ session: WCSession) {
        DispatchQueue.main.async {
            WatchStore.shared.setReachable(session.isReachable)
            if session.isReachable { self.flush(); self.requestState() }
        }
    }
}
