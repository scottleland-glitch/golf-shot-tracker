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
    var pin: String? = nil        // v233: picked on "Where's the pin?" (approach onto the green)
    var club: String? = nil       // v253: the club of this stroke (nil = leave it, "" = no club)
}

/// v233 (Scott): an approach that finishes on the green asks for the pin position once per hole (Skip remembers the hole).
enum PinAsk {
    static let grid: [[String]] = [["backleft", "backcenter", "backright"], ["midleft", "center", "midright"], ["frontleft", "frontcenter", "frontright"]]
    static var skipped: Set<String> = []
    static func key(_ store: WatchStore, _ hole: Int) -> String { store.model.roundId + ":" + String(hole) }
    static func wanted(_ d: ShotDraft, _ store: WatchStore) -> Bool {
        guard d.fin == "green", !d.edit else { return false }
        let h = store.model.hole(d.hole)
        if !h.pin.isEmpty || skipped.contains(key(store, d.hole)) { return false }
        return (h.rows[safe: d.k]?.loc ?? "") != "green"     // a putt that stays on the green doesn't ask
    }
}

/// v253 (Scott): the club chip on the hole screen. Pre-picked (Driver off the tee on a par 4/5, else the nearest carry in My Bag);
/// a club tapped on the list is kept for that stroke until the shot is sent.
enum ClubPick {
    static func key(_ store: WatchStore, _ hole: Int, _ k: Int) -> String { store.model.roundId + ":" + String(hole) + ":" + String(k) }
    /// The club to show and send for stroke k, or nil when there is none to offer (on the green, or no bag and nothing picked).
    static func current(_ store: WatchStore, hole: Int, k: Int) -> String? {
        let h = store.model.hole(hole)
        guard let row = h.rows[safe: k] else { return nil }
        if Rules.lieOf(h.rows, k) == "green" { return nil }
        if let p = store.clubPicks[key(store, hole, k)] { return p }
        if !row.club.isEmpty { return row.club }
        return Rules.suggestClub(store.state?.clubs ?? [], rows: h.rows, k: k, par: h.par)
    }
}

enum Route: Hashable {
    case holes
    case holeEdit(Int)
    case shotEdit(hole: Int, k: Int)
    case lie(ShotDraft)
    case moreLies(ShotDraft)
    case pin(ShotDraft)
    case club(hole: Int, k: Int)   // v253: the club list (Digital Crown scrolls it)
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
        return store.makeEvent("shot", hole: hole, k: k, fin: fin, dir: dir, dist: dist, hz: hz, edit: edit, pin: pin, club: club)
    }
}

/// A lie was tapped (on the hole screen, More lies, or while editing a shot).
func pickLie(_ fin: String, draft: ShotDraft, store: WatchStore, nav: Nav) {
    var d = draft
    d.fin = fin
    if fin == "in" && !d.edit && !d.needsOwnDistance {
        store.send(d.makeEvent(store))     // one tap: holed out
        nav.home()
    } else if PinAsk.wanted(d, store) {
        nav.push(.pin(d))                  // v233: onto the green with no pin yet → one tap on the 3×3, then on as usual
    } else {
        nav.push(d.afterLie())
    }
}
