// StrokeWise watch – root: the hole screen, and the screens that hang off it.
import SwiftUI

struct RootView: View {
    @EnvironmentObject var store: WatchStore
    @StateObject private var nav = Nav()

    var body: some View {
        ZStack {
            stack
            if let phase = store.exitPhase { ExitView(phase: phase).transition(.opacity) }   // End round / Close: "Saving…", then "Round saved"
        }
        .environmentObject(nav)
        .onChange(of: store.exitPhase) { phase in
            if phase != nil { nav.home() }   // behind the card: back to the home screen, which shows "No round" for an ended round
        }
    }

    private var stack: some View {
        NavigationStack(path: $nav.path) {
            HoleScreen()
                .navigationDestination(for: Route.self) { route in
                    switch route {
                    case .holes: HolesScreen()
                    case .holeEdit(let i): HoleEditScreen(hole: i)
                    case .shotEdit(let h, let k): ShotEditScreen(hole: h, k: k)
                    case .lie(let d): LieScreen(draft: d)
                    case .moreLies(let d): MoreLiesScreen(draft: d)
                    case .pin(let d): PinScreen(draft: d)
                    case .club(let h, let k): ClubScreen(hole: h, k: k)
                    case .direction(let d): DirectionScreen(draft: d)
                    case .hazard(let d): HazardScreen(draft: d)
                    case .distance(let d): DistanceScreen(draft: d)
                    case .confirm(let d): ConfirmScreen(draft: d)
                    case .undo: UndoScreen()
                    case .endRound: EndRoundScreen()
                    }
                }
        }
    }
}
