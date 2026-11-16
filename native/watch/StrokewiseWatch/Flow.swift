// StrokeWise watch – navigation and the draft of the shot being logged.
import SwiftUI

/// A shot being logged or edited, built up screen by screen: lie → direction → (hazard choice) → distance → confirm.
struct ShotDraft: Hashable {
    var hole: Int
    var k: Int                    // the stroke just hit (its row)
    var edit = false              // editing an earlier shot (allowed on finished holes)
    var base = 0                  // how many screens deep the flow started: Save / Edit return there
    var fin = ""                  // fairway rough deep bunker green trees hazard ob unp lost in
    var dir: String? = nil        // nil = not asked yet / skipped
    var hz: String? = nil         // drop | retee | play
    var dist: Int? = nil
    var mode = "next"             // next: distance after the shot · in: distance of the stroke that went in · set: a row's own distance
}

enum Route: Hashable {
    case holes
    case holeEdit(Int)
    case shotEdit(hole: Int, k: Int)
    case lie(ShotDraft)
    case moreLies(ShotDraft)
    case direction(ShotDraft)
    case hazard(ShotDraft)
    case distance(ShotDraft)
    case confirm(ShotDraft)
    case undo
    case endRound
}

final class Nav: ObservableObject {
    @Published var path: [Route] = []
    func push(_ r: Route) { path.append(r) }
    func home() { path.removeAll() }
    /// Back to the screen the flow started from.
    func pop(to base: Int) { if path.count > base { path.removeLast(path.count - base) } }
}

extension ShotDraft {
    /// The screen after the lie is picked.
    func afterLie() -> Route {
        if fin == "in" { var d = self; d.mode = "in"; return d.needsOwnDistance ? .distance(d) : .confirm(d) }
        return .direction(self)
    }
    func afterDirection() -> Route {
        switch fin {
        case "hazard": return .hazard(self)
        case "ob", "lost": return .confirm(self)
        default: return .distance(self)
        }
    }
    func afterHazard() -> Route { hz == "retee" ? .confirm(self) : .distance(self) }
    /// "In the hole" needs the distance of that stroke only when the row has none yet.
    var needsOwnDistance: Bool { dist == nil && WatchStore.shared.model.hole(hole).rows[safe: k]?.dist == nil }
}

extension Array {
    subscript(safe i: Int) -> Element? { i >= 0 && i < count ? self[i] : nil }
}

extension ShotDraft {
    /// The event this draft turns into.
    func makeEvent(_ store: WatchStore) -> WatchEvent {
        if mode == "set" { return store.makeEvent("setdist", hole: hole, k: k, dist: dist, edit: edit) }
        return store.makeEvent("shot", hole: hole, k: k, fin: fin, dir: dir, dist: dist, hz: hz, edit: edit)
    }
}

/// A lie was tapped (on the hole screen, More lies, or while editing a shot).
func pickLie(_ fin: String, draft: ShotDraft, store: WatchStore, nav: Nav) {
    var d = draft
    d.fin = fin
    if fin == "in" && !d.edit && !d.needsOwnDistance {
        store.send(d.makeEvent(store))     // one tap: holed out
        nav.home()
    } else {
        nav.push(d.afterLie())
    }
}
