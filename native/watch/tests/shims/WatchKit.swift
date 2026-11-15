// Linux typecheck stand-in for WatchKit's app delegate + the SwiftUI adaptor for it. Not shipped.
import Foundation
import SwiftUI
public protocol WKApplicationDelegate: NSObjectProtocol {}
public extension WKApplicationDelegate {
    func applicationDidFinishLaunching() {}
    func handleActiveWorkoutRecovery() {}
}
@propertyWrapper public struct WKApplicationDelegateAdaptor<D: WKApplicationDelegate> {
    public var wrappedValue: D { fatalError() }
    public init(_ type: D.Type) {}
}
