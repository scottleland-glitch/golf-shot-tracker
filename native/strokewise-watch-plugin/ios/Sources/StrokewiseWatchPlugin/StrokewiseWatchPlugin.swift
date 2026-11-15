// StrokeWise – the Capacitor plugin the web app talks to (registerPlugin('StrokewiseWatch') in native/watch.js).
import Foundation
import Capacitor

@objc(StrokewiseWatchPlugin)
public class StrokewiseWatchPlugin: CAPPlugin, CAPBridgedPlugin, StrokewiseWatchListener {
    public let identifier = "StrokewiseWatchPlugin"
    public let jsName = "StrokewiseWatch"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getInfo", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pushState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getPending", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "ack", returnType: CAPPluginReturnPromise)
    ]

    override public func load() {
        StrokewiseWatchBridge.shared.listener = self
        StrokewiseWatchBridge.shared.activate()   // a no-op when AppDelegate already did
    }

    @objc func getInfo(_ call: CAPPluginCall) {
        call.resolve(StrokewiseWatchBridge.shared.info())
    }
    @objc func pushState(_ call: CAPPluginCall) {
        guard let json = call.getString("json") else { call.reject("json is required"); return }
        StrokewiseWatchBridge.shared.pushState(json)
        call.resolve()
    }
    @objc func getPending(_ call: CAPPluginCall) {
        call.resolve(["items": StrokewiseWatchBridge.shared.pending()])
    }
    @objc func ack(_ call: CAPPluginCall) {
        let qids = (call.getArray("qids") as? [String]) ?? []
        StrokewiseWatchBridge.shared.ack(qids)
        call.resolve()
    }

    // MARK: StrokewiseWatchListener (called on WatchConnectivity's queue)
    public func watchQueued() { DispatchQueue.main.async { self.notifyListeners("watchMessage", data: [:]) } }
    public func watchHello() { DispatchQueue.main.async { self.notifyListeners("watchHello", data: [:]) } }
    public func watchReachability(_ reachable: Bool) { DispatchQueue.main.async { self.notifyListeners("watchReachability", data: ["reachable": reachable]) } }
}
