// Linux typecheck stand-in for the SwiftUI the watch screens use, written to mirror the real signatures (result-builder limit of 10 children
// included), so type mistakes in our views show up without a Mac. It is only as faithful as these declarations. Not shipped.
@_exported import Combine
import Foundation

// MARK: core
public protocol View { associatedtype Body: View; @ViewBuilder var body: Body { get } }
extension Never: View { public typealias Body = Never; public var body: Never { fatalError() } }
public protocol PrimitiveView: View {}
extension PrimitiveView { public var body: Never { fatalError() } }
public struct EmptyView: PrimitiveView { public init() {} }
public struct TupleView<T>: PrimitiveView {}
public struct ConditionalContent<A: View, B: View>: PrimitiveView {}
public struct ModifiedContent<C: View>: PrimitiveView {}
extension Optional: View where Wrapped: View { public typealias Body = Never; public var body: Never { fatalError() } }

@resultBuilder public struct ViewBuilder {
    public static func buildBlock() -> EmptyView { EmptyView() }
    public static func buildBlock<C: View>(_ c: C) -> C { c }
    public static func buildBlock<C0: View, C1: View>(_ c0: C0, _ c1: C1) -> TupleView<(C0, C1)> { TupleView() }
    public static func buildBlock<C0: View, C1: View, C2: View>(_ c0: C0, _ c1: C1, _ c2: C2) -> TupleView<(C0, C1, C2)> { TupleView() }
    public static func buildBlock<C0: View, C1: View, C2: View, C3: View>(_ c0: C0, _ c1: C1, _ c2: C2, _ c3: C3) -> TupleView<(C0, C1, C2, C3)> { TupleView() }
    public static func buildBlock<C0: View, C1: View, C2: View, C3: View, C4: View>(_ c0: C0, _ c1: C1, _ c2: C2, _ c3: C3, _ c4: C4) -> TupleView<(C0, C1, C2, C3, C4)> { TupleView() }
    public static func buildBlock<C0: View, C1: View, C2: View, C3: View, C4: View, C5: View>(_ c0: C0, _ c1: C1, _ c2: C2, _ c3: C3, _ c4: C4, _ c5: C5) -> TupleView<(C0, C1, C2, C3, C4, C5)> { TupleView() }
    public static func buildBlock<C0: View, C1: View, C2: View, C3: View, C4: View, C5: View, C6: View>(_ c0: C0, _ c1: C1, _ c2: C2, _ c3: C3, _ c4: C4, _ c5: C5, _ c6: C6) -> TupleView<(C0, C1, C2, C3, C4, C5, C6)> { TupleView() }
    public static func buildBlock<C0: View, C1: View, C2: View, C3: View, C4: View, C5: View, C6: View, C7: View>(_ c0: C0, _ c1: C1, _ c2: C2, _ c3: C3, _ c4: C4, _ c5: C5, _ c6: C6, _ c7: C7) -> TupleView<(C0, C1, C2, C3, C4, C5, C6, C7)> { TupleView() }
    public static func buildBlock<C0: View, C1: View, C2: View, C3: View, C4: View, C5: View, C6: View, C7: View, C8: View>(_ c0: C0, _ c1: C1, _ c2: C2, _ c3: C3, _ c4: C4, _ c5: C5, _ c6: C6, _ c7: C7, _ c8: C8) -> TupleView<(C0, C1, C2, C3, C4, C5, C6, C7, C8)> { TupleView() }
    public static func buildBlock<C0: View, C1: View, C2: View, C3: View, C4: View, C5: View, C6: View, C7: View, C8: View, C9: View>(_ c0: C0, _ c1: C1, _ c2: C2, _ c3: C3, _ c4: C4, _ c5: C5, _ c6: C6, _ c7: C7, _ c8: C8, _ c9: C9) -> TupleView<(C0, C1, C2, C3, C4, C5, C6, C7, C8, C9)> { TupleView() }
    public static func buildIf<C: View>(_ c: C?) -> C? { c }
    public static func buildEither<T: View, F: View>(first: T) -> ConditionalContent<T, F> { ConditionalContent() }
    public static func buildEither<T: View, F: View>(second: F) -> ConditionalContent<T, F> { ConditionalContent() }
}

// MARK: state
public final class Box<V> { public var v: V; public init(_ v: V) { self.v = v } }
@propertyWrapper public struct Binding<Value> {
    let box: Box<Value>
    public var wrappedValue: Value { get { box.v } nonmutating set { box.v = newValue } }
    public init(wrappedValue: Value) { box = Box(wrappedValue) }
}
@propertyWrapper public struct State<Value> {
    let box: Box<Value>
    public var wrappedValue: Value { get { box.v } nonmutating set { box.v = newValue } }
    public init(wrappedValue: Value) { box = Box(wrappedValue) }
    public var projectedValue: Binding<Value> { Binding(wrappedValue: box.v) }
}
@dynamicMemberLookup public struct ObservedWrapper<O: ObservableObject> {
    public subscript<S>(dynamicMember keyPath: ReferenceWritableKeyPath<O, S>) -> Binding<S> { fatalError() }
}
@propertyWrapper public struct StateObject<O: ObservableObject> {
    public var wrappedValue: O
    public init(wrappedValue: @autoclosure @escaping () -> O) { self.wrappedValue = wrappedValue() }
    public var projectedValue: ObservedWrapper<O> { ObservedWrapper() }
}
@propertyWrapper public struct EnvironmentObject<O: ObservableObject> {
    public var wrappedValue: O { fatalError() }
    public init() {}
    public var projectedValue: ObservedWrapper<O> { ObservedWrapper() }
}
public enum ScenePhase { case background, inactive, active }
public struct EnvironmentValues { public var scenePhase: ScenePhase = .active }
@propertyWrapper public struct Environment<V> {
    public var wrappedValue: V { fatalError() }
    public init(_ keyPath: KeyPath<EnvironmentValues, V>) {}
}

// MARK: values
public struct Color: PrimitiveView, ShapeStyle {
    public init(red: Double, green: Double, blue: Double, opacity: Double = 1) {}
    public init(white: Double, opacity: Double = 1) {}
    public static let black = Color(white: 0), white = Color(white: 1), gray = Color(white: 0.5), secondary = Color(white: 0.6)
    public func opacity(_ o: Double) -> Color { self }
}
public protocol ShapeStyle {}
public struct Font {
    public enum Weight { case ultraLight, thin, light, regular, medium, semibold, bold, heavy, black }
    public enum Design { case `default`, rounded }
    public static let title2 = Font(), title3 = Font(), footnote = Font(), body = Font(), headline = Font(), caption = Font(), caption2 = Font()
    public static func system(size: CGFloat, weight: Weight = .regular, design: Design = .default) -> Font { Font() }
    public func weight(_ w: Weight) -> Font { self }
    public func bold() -> Font { self }
}
public enum Edge { public struct Set: OptionSet { public let rawValue: Int; public init(rawValue: Int) { self.rawValue = rawValue }
    public static let horizontal = Set(rawValue: 1), vertical = Set(rawValue: 2), all = Set(rawValue: 3), top = Set(rawValue: 4), bottom = Set(rawValue: 8), leading = Set(rawValue: 16), trailing = Set(rawValue: 32) } }
public struct Alignment { public static let leading = Alignment(), trailing = Alignment(), center = Alignment() }
public struct HorizontalAlignment { public static let leading = HorizontalAlignment(), trailing = HorizontalAlignment(), center = HorizontalAlignment() }
public struct VerticalAlignment { public static let top = VerticalAlignment(), center = VerticalAlignment(), lastTextBaseline = VerticalAlignment(), firstTextBaseline = VerticalAlignment() }
public enum TextAlignment { case leading, center, trailing }
public enum Visibility { case automatic, visible, hidden }
public enum ButtonRole { case destructive, cancel }
public struct Animation { public static func linear(duration: Double) -> Animation { Animation() } }
public func withAnimation<R>(_ a: Animation? = nil, _ body: () throws -> R) rethrows -> R { try body() }

// MARK: views
public struct Text: PrimitiveView {
    public init<S: StringProtocol>(_ s: S) {}
    public init(_ key: String) {}
    public enum DateStyle { case time, date, relative }
    public init(_ date: Date, style: DateStyle) {}
    // Real SwiftUI: these return Text (so Text + Text and colored runs type-check).
    public func foregroundColor(_ c: Color?) -> Text { self }
    public func font(_ f: Font?) -> Text { self }
    public static func + (lhs: Text, rhs: Text) -> Text { lhs }
}
public struct Image: PrimitiveView { public init(systemName: String) {} }
public struct Spacer: PrimitiveView { public init(minLength: CGFloat? = nil) {} }
public struct ProgressView: PrimitiveView { public init(value: Double?) {}; public init() {} }
public struct VStack<C: View>: PrimitiveView { public init(alignment: HorizontalAlignment = .center, spacing: CGFloat? = nil, @ViewBuilder content: () -> C) {} }
public struct HStack<C: View>: PrimitiveView { public init(alignment: VerticalAlignment = .center, spacing: CGFloat? = nil, @ViewBuilder content: () -> C) {} }
public struct ZStack<C: View>: PrimitiveView { public init(alignment: Alignment = .center, @ViewBuilder content: () -> C) {} }
public struct ScrollView<C: View>: PrimitiveView { public init(@ViewBuilder content: () -> C) {} }
public struct List<C: View>: PrimitiveView { public init(@ViewBuilder content: () -> C) {} }
public struct ForEach<D: RandomAccessCollection, ID: Hashable, C: View>: PrimitiveView {
    public init(_ data: D, id: KeyPath<D.Element, ID>, @ViewBuilder content: @escaping (D.Element) -> C) {}
}
public struct GridItem { public struct Size { public static func flexible() -> Size { Size() } }
    public init(_ size: Size = .flexible(), spacing: CGFloat? = nil) {} }
public struct LazyVGrid<C: View>: PrimitiveView { public init(columns: [GridItem], spacing: CGFloat? = nil, @ViewBuilder content: () -> C) {} }
public struct Button<L: View>: PrimitiveView {
    public init(action: @escaping () -> Void, @ViewBuilder label: () -> L) {}
    public init(role: ButtonRole?, action: @escaping () -> Void, @ViewBuilder label: () -> L) {}
}
extension Button where L == Text {
    public init(_ title: String, action: @escaping () -> Void) {}
    public init(_ title: String, role: ButtonRole?, action: @escaping () -> Void) {}
}
public struct NavigationLink<L: View>: PrimitiveView { public init<P: Hashable>(value: P?, @ViewBuilder label: () -> L) {} }
public struct NavigationStack<Data: MutableCollection & RandomAccessCollection & RangeReplaceableCollection, Root: View>: PrimitiveView where Data.Element: Hashable {
    public init(path: Binding<Data>, @ViewBuilder root: () -> Root) {}
}
public protocol Shape: PrimitiveView {}
extension Shape { public func fill<S: ShapeStyle>(_ s: S) -> some View { EmptyView() } }
public struct RoundedRectangle: Shape { public init(cornerRadius: CGFloat) {} }
public struct Capsule: Shape { public init() {} }
public struct Circle: Shape { public init() {} }

// MARK: button styles
public struct ButtonStyleConfiguration { public struct Label: PrimitiveView {}; public let label: Label = Label(); public let isPressed: Bool = false }
public protocol ButtonStyle { associatedtype Body: View; @ViewBuilder func makeBody(configuration: Self.Configuration) -> Self.Body }
extension ButtonStyle { public typealias Configuration = ButtonStyleConfiguration }

// MARK: gestures
public struct DragValue { public var translation: CGSize = .zero }
public protocol Gesture {}
public struct DragGesture: Gesture {
    public init(minimumDistance: CGFloat = 10) {}
    public func onEnded(_ action: @escaping (DragValue) -> Void) -> DragGesture { self }
}
public enum DigitalCrownRotationalSensitivity { case low, medium, high }

// MARK: modifiers
public struct AnyTransition { public static var opacity: AnyTransition { AnyTransition() } }
extension View {
    public func ignoresSafeArea() -> some View { self }
    public func transition(_ t: AnyTransition) -> some View { self }
    public func font(_ f: Font?) -> some View { self }
    public func lineLimit(_ number: Int?) -> some View { self }
    public func minimumScaleFactor(_ factor: CGFloat) -> some View { self }
    public func layoutPriority(_ value: Double) -> some View { self }
    public func foregroundColor(_ c: Color?) -> some View { self }
    public func padding(_ edges: Edge.Set = .all, _ length: CGFloat? = nil) -> some View { self }
    public func padding(_ length: CGFloat) -> some View { self }
    public func frame(width: CGFloat? = nil, height: CGFloat? = nil, alignment: Alignment = .center) -> some View { self }
    public func frame(minWidth: CGFloat? = nil, idealWidth: CGFloat? = nil, maxWidth: CGFloat? = nil, minHeight: CGFloat? = nil, idealHeight: CGFloat? = nil, maxHeight: CGFloat? = nil, alignment: Alignment = .center) -> some View { self }
    public func background<B: View>(_ b: B, alignment: Alignment = .center) -> some View { self }
    public func opacity(_ o: Double) -> some View { self }
    public func disabled(_ d: Bool) -> some View { self }
    public func tint(_ c: Color?) -> some View { self }
    public func multilineTextAlignment(_ a: TextAlignment) -> some View { self }
    public func buttonStyle<S: ButtonStyle>(_ s: S) -> some View { self }
    public func navigationTitle<S: StringProtocol>(_ t: S) -> some View { self }
    public func navigationDestination<D: Hashable, C: View>(for: D.Type, @ViewBuilder destination: @escaping (D) -> C) -> some View { self }
    public func simultaneousGesture<G: Gesture>(_ g: G) -> some View { self }
    public func onAppear(perform: (() -> Void)? = nil) -> some View { self }
    public func task<T: Equatable>(id: T, _ action: @escaping @Sendable () async -> Void) -> some View { self }
    public func onChange<V: Equatable>(of v: V, perform: @escaping (V) -> Void) -> some View { self }
    public func environmentObject<O: ObservableObject>(_ o: O) -> some View { self }
    public func focusable(_ f: Bool = true) -> some View { self }
    public func confirmationDialog<A: View>(_ title: String, isPresented: Binding<Bool>, titleVisibility: Visibility = .automatic, @ViewBuilder actions: () -> A) -> some View { self }
    public func digitalCrownRotation<V: BinaryFloatingPoint>(_ binding: Binding<V>, from: V, through: V, by stride: V.Stride? = nil, sensitivity: DigitalCrownRotationalSensitivity = .high, isContinuous: Bool = false, isHapticFeedbackEnabled: Bool = true) -> some View where V.Stride: BinaryFloatingPoint { self }
}

// MARK: app
public protocol Scene {}
public struct WindowGroup<C: View>: Scene { public init(@ViewBuilder content: () -> C) {} }
@resultBuilder public struct SceneBuilder { public static func buildBlock<S: Scene>(_ s: S) -> S { s } }
public protocol App { associatedtype Body: Scene; @SceneBuilder var body: Body { get }; init() }
extension App { public static func main() {} }
