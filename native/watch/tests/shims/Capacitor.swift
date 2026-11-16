// Linux typecheck stand-in for the part of Capacitor the plugin uses. Not shipped.
import Foundation
public typealias JSObject = [String: Any]
public let CAPPluginReturnPromise = "promise"
public class CAPPluginMethod { public init(name: String, returnType: String) {} }
public protocol CAPBridgedPlugin { var identifier: String { get }; var jsName: String { get }; var pluginMethods: [CAPPluginMethod] { get } }
public class CAPPluginCall {
    public func getString(_ key: String) -> String? { nil }
    public func getArray(_ key: String) -> [Any]? { nil }
    public func resolve() {}
    public func resolve(_ data: [String: Any]) {}
    public func reject(_ message: String) {}
}
open class CAPPlugin: NSObject {
    open func load() {}
    public func notifyListeners(_ name: String, data: [String: Any]?) {}
}
