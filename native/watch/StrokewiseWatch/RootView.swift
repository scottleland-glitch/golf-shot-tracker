// StrokeWise watch – root: the hole screen, and the screens that hang off it.
import SwiftUI

struct RootView: View {
    @EnvironmentObject var store: WatchStore
    @StateObject private var nav = Nav()

    var body: some View {
        NavigationStack(path: $nav.path) {
            HoleScreen()
                .navigationDestination(for: Route.self) { route in
                    switch route {
                    case .holes: HolesScreen()
                    case .holeEdit(let i): HoleEditScreen(hole: i)
                    case .shotEdit(let h, let k): ShotEditScreen(hole: h, k: k)
                    case .lie(let d): LieScreen(draft: d)
                    case .moreLies(let d): MoreLiesScreen(draft: d)
                    case .direction(let d): DirectionScreen(draft: d)
                    case .hazard(let d): HazardScreen(draft: d)
                    case .distance(let d): DistanceScreen(draft: d)
                    case .confirm(let d): ConfirmScreen(draft: d)
                    case .undo: UndoScreen()
                    case .endRound: EndRoundScreen()
                    }
                }
        }
        .environmentObject(nav)
    }
}
