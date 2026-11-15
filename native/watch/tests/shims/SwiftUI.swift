// Linux typecheck stand-in for the tiny part of SwiftUI/Combine that Store.swift uses. Not shipped.
public protocol ObservableObject: AnyObject {}
@propertyWrapper public struct Published<Value> {
    public var wrappedValue: Value
    public init(wrappedValue: Value) { self.wrappedValue = wrappedValue }
}
