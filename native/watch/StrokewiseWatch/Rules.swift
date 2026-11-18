// StrokeWise watch – the hole-entry rules, a Swift copy of native/watch-core.js (which is the copy of the phone's app.js rules).
// The phone applies every event for real; the watch applies the same events to what it was last told, so it can keep logging
// (and show the right next screen) while the phone is out of range. tests/fixtures/watch-vectors.json is run through both copies.
// Foundation only: compiled and tested on Linux by native/watch/tests/run-linux.sh.
import Foundation

enum Rules {
    static let finishes = ["fairway", "rough", "deep", "bunker", "green", "trees", "hazard", "ob", "unp", "lost", "in"]
    static let dropLies = ["fairway", "rough", "deep", "bunker", "green", "trees"]
    static let dirs = ["long", "longright", "right", "shortright", "short", "shortleft", "left", "longleft"]

    static func normDir(_ d: String) -> String { dirs.contains(d) ? d : "" }
    /// v235: Long means past the green, so it is off when the shot finished on the fairway (the phone's noLongDir).
    static func noLong(_ fin: String) -> Bool { fin == "fairway" }
    static func isLong(_ d: String) -> Bool { d.hasPrefix("long") }
    /// The direction a row keeps for its lie: on the fairway Long is dropped and Long left / Long right keep just the side
    /// (the phone's clearLongOnFairway / SG.effectiveDir).
    static func dirFor(_ d: String, loc: String) -> String {
        let n = normDir(d)
        guard noLong(loc) && isLong(n) else { return n }
        if n.hasSuffix("left") { return "left" }
        if n.hasSuffix("right") { return "right" }
        return ""
    }
    static func isRetee(_ r: Row) -> Bool { r.loc == "hazard" && r.retee }
    static func isHoled(_ r: Row, _ k: Int) -> Bool { r.loc == "holed" || r.loc == "holedx" || (k != 0 && r.holeOut && !r.loc.isEmpty) }
    static func isPenalty(_ r: Row, _ k: Int) -> Bool { k > 0 && (r.pen || r.loc == "ob" || isRetee(r)) }

    /// Distance of stroke k (an OB or re-tee row replays from the row above).
    static func distOf(_ rows: [Row], _ k: Int) -> Int? {
        if k > 0 && (rows[k].loc == "ob" || isRetee(rows[k])) { return distOf(rows, k - 1) }
        return rows[k].dist
    }
    static func lieOf(_ rows: [Row], _ k: Int) -> String? {
        let r = rows[k]
        if k == 0 { return r.loc == "holed" ? "green" : "tee" }
        if r.loc == "ob" || isRetee(r) { return lieOf(rows, k - 1) }
        if r.loc.isEmpty { return nil }
        if r.loc == "hazard" { return r.pen ? "rough" : "hazard" }
        let map = ["tee": "tee", "fairway": "fairway", "rough": "rough", "deep": "deep", "bunker": "sand", "trees": "recovery",
                   "green": "green", "holed": "green", "holedx": "fairway"]
        return map[r.loc]
    }
    /// "ft" on the green, else "yd" – the unit of stroke k's distance.
    static func unit(_ rows: [Row], _ k: Int) -> String { lieOf(rows, k) == "green" ? "ft" : "yd" }
    static func rowStrokes(_ rows: [Row]) -> Int {
        var n = 0
        for (k, r) in rows.enumerated() { n += 1 + (isPenalty(r, k) ? 1 : 0) }
        return n
    }
    /// The scoring stroke being played when hitting row k (1-based). Each earlier row counts as 1, plus 1 for each penalty
    /// (OB, lost ball, re-tee, unplayable, hazard drop) including a penalty attached to this row. Equals k+1 when there are
    /// no penalties. Same total the phone uses (SG.rowStrokes) for the score of these rows.
    static func playingAs(_ rows: [Row], _ k: Int) -> Int {
        if rows.isEmpty { return 1 }
        let i = min(max(k, 0), rows.count - 1)
        return rowStrokes(Array(rows[0...i]))
    }
    /// Every stroke has its lie and distance and the last one went in (the phone's "complete").
    static func isComplete(_ rows: [Row]) -> Bool {
        if rows.isEmpty { return false }
        for k in 0..<rows.count {
            let r = rows[k]
            if k > 0 && r.loc.isEmpty { return false }
            guard let d = distOf(rows, k), d > 0 else { return false }
            if isHoled(r, k) { return k == rows.count - 1 }
            if k + 1 >= rows.count { return false }
            let nx = rows[k + 1]
            if nx.loc.isEmpty { return false }
            if (distOf(rows, k + 1) ?? 0) <= 0 { return false }
        }
        return false
    }

    // MARK: applying an event to a hole (same order of steps as watch-core.js)

    private static func holeOutRow(_ rows: inout [Row], _ k: Int) {
        if k == 0 { rows.removeSubrange(1...); rows[0].loc = "holedx"; return }   // an ace
        if rows.count > k + 1 { rows.removeSubrange((k + 1)...) }
        for j in 0..<rows.count where j != k { rows[j].holeOut = false }
        rows[k].holeOut = true
    }
    private static func setFinish(_ rows: inout [Row], _ k: Int, _ v: String) {
        if v == "in" { holeOutRow(&rows, k); return }
        if rows[k].loc == "holed" { rows[k].loc = "green" }
        if k == 0 && rows[k].loc == "holedx" { rows[k].loc = "tee" }
        rows[k].holeOut = false
        if k + 1 >= rows.count { rows.append(Row(loc: "", dist: nil, dir: "", pen: false)) }
        let was = rows[k + 1].loc
        if v == "green" && was == "holed" {
            // the next putt went in: keep it
        } else if v == "ob" {
            rows[k + 1].loc = "ob"; rows[k + 1].dist = nil; rows[k + 1].pen = false; rows[k + 1].retee = false
            if rows[k + 1].dir == "short" || rows[k + 1].dir == "long" { rows[k + 1].dir = "" }
        } else if v == "hazard" {
            if was != "hazard" { rows[k + 1].loc = "hazard"; rows[k + 1].pen = false; rows[k + 1].retee = false }
        } else {
            let held = was == "holed", wasRe = rows[k + 1].retee
            rows[k + 1].loc = v; rows[k + 1].retee = false
            if held { rows[k + 1].holeOut = true }
            if was == "ob" || wasRe { rows[k + 1].dist = nil; rows[k + 1].pen = false }
        }
        if was == "hazard" && v != "hazard" { rows[k + 1].pen = false }
        if noLong(rows[k + 1].loc) && isLong(normDir(rows[k + 1].dir)) { rows[k + 1].dir = dirFor(rows[k + 1].dir, loc: rows[k + 1].loc) }
    }
    private static func finish(_ rows: inout [Row], _ k: Int, _ fin: String, _ drop: String?) {
        if fin == "unp" {
            var keep = "rough"
            if k + 1 < rows.count, dropLies.contains(rows[k + 1].loc) { keep = rows[k + 1].loc }
            let lie = (drop != nil && dropLies.contains(drop!)) ? drop! : keep
            setFinish(&rows, k, lie)
            if k + 1 < rows.count { rows[k + 1].pen = true; rows[k + 1].lost = false }
            return
        }
        if fin == "lost" {
            setFinish(&rows, k, "ob")
            if k + 1 < rows.count { rows[k + 1].lost = true }
            return
        }
        if k + 1 < rows.count {
            rows[k + 1].lost = false
            if rows[k + 1].pen && fin != "hazard" { rows[k + 1].pen = false }
        }
        setFinish(&rows, k, fin)
    }

    struct Result: Equatable { var ok: Bool; var reason: String; var hole: Int }

    /// Applies one event to the round's holes (a dictionary by hole number). `pars` fills in a hole the phone has not described yet.
    static func apply(_ ev: WatchEvent, holes: inout [Int: HoleState], pars: [Int]) -> Result {
        let hi = ev.hole
        func fail(_ why: String) -> Result { Result(ok: false, reason: why, hole: -1) }
        if ev.type == "end" { return Result(ok: true, reason: "", hole: hi) }   // "the golfer ended the round on the watch": information only, the rows don't change
        if ev.type == "undo" {
            guard hi >= 0 && hi <= 17 else { return fail("badhole") }
            return undo(&holes, hi, pars)
        }
        guard hi >= 0 && hi <= 17 else { return fail("badhole") }
        var h = holes[hi] ?? blankHole(hi, pars)
        var why = ""
        let k = ev.k ?? -1
        switch ev.type {
        case "shot":
            why = applyShot(&h, ev)
            if why.isEmpty { refresh(&h, autoFinish: ev.fin == "in") }
        case "setdist":
            guard k >= 0 && k < h.rows.count else { why = "stale"; break }
            guard let d = ev.dist, d >= 1, d <= 999 else { why = "bad"; break }
            if h.fin && ev.edit != true { why = "finished"; break }
            if k > 0 && (h.rows[k].loc == "ob" || isRetee(h.rows[k])) { why = "bad"; break }
            h.rows[k].dist = d; refresh(&h, autoFinish: false)
        case "delete":
            why = applyDelete(&h, k); if why.isEmpty { refresh(&h, autoFinish: false) }
        case "insert":
            why = applyInsert(&h, k); if why.isEmpty { refresh(&h, autoFinish: false) }
        default: why = "bad"
        }
        if !why.isEmpty { return fail(why) }
        holes[hi] = h
        return Result(ok: true, reason: "", hole: hi)
    }

    static func blankHole(_ i: Int, _ pars: [Int]) -> HoleState {
        HoleState(i: i, par: (i < pars.count ? pars[i] : 4), fin: false, complete: false, strokes: 1, rows: [Row(loc: "tee")])
    }
    private static func refresh(_ h: inout HoleState, autoFinish: Bool) {
        h.complete = isComplete(h.rows)
        h.strokes = rowStrokes(h.rows)
        if autoFinish && h.complete { h.fin = true } else if h.fin && !h.complete { h.fin = false }
    }
    private static func applyShot(_ h: inout HoleState, _ ev: WatchEvent) -> String {
        let k = ev.k ?? -1
        guard let fin = ev.fin, finishes.contains(fin) else { return "bad" }
        guard k >= 0 && k < h.rows.count else { return "stale" }
        let edit = ev.edit == true
        if !edit && k != h.rows.count - 1 { return "stale" }
        if !edit && h.fin { return "finished" }
        if let d = ev.dist, d < 1 || d > 999 { return "bad" }
        if fin == "in" {
            if k > 0 && h.rows[k].loc.isEmpty { return "bad" }
            if let d = ev.dist, h.rows[k].dist == nil { h.rows[k].dist = d }
            finish(&h.rows, k, "in", nil); return ""
        }
        finish(&h.rows, k, fin, ev.drop)
        if let p = ev.pin, !p.isEmpty, h.pin.isEmpty { h.pin = p }   // v233: the pin picked on the way onto the green
        let n = k + 1
        if fin == "hazard" {
            let hz = (ev.hz == "retee" || ev.hz == "drop") ? ev.hz! : "play"
            if hz == "retee" { h.rows[n].retee = true; h.rows[n].pen = true; h.rows[n].dist = nil }
            else if hz == "drop" { h.rows[n].retee = false; h.rows[n].pen = true }
            else { h.rows[n].retee = false; h.rows[n].pen = false }
        }
        if let dir = ev.dir {
            var d = normDir(dir)
            if h.rows[n].loc == "ob" && (d == "short" || d == "long") { d = "" }
            h.rows[n].dir = dirFor(d, loc: h.rows[n].loc)
        }
        if let d = ev.dist, h.rows[n].loc != "ob", !isRetee(h.rows[n]) { h.rows[n].dist = d }
        return ""
    }
    private static func undo(_ holes: inout [Int: HoleState], _ hi: Int, _ pars: [Int]) -> Result {
        var h = holes[hi] ?? blankHole(hi, pars)
        let last = h.rows.count - 1
        if h.rows.count == 1 && !isHoled(h.rows[0], 0) {
            if hi > 0, let p = holes[hi - 1], p.fin || p.complete, !p.rows.isEmpty { return undo(&holes, hi - 1, pars) }
            return Result(ok: false, reason: "stale", hole: -1)
        }
        if isHoled(h.rows[last], last) {
            if h.rows[last].holeOut && last > 0 { h.rows[last].holeOut = false }
            else if last == 0 { h.rows[0].loc = "tee" }
            else { h.rows.removeLast() }
        } else { h.rows.removeLast() }
        h.fin = false
        refresh(&h, autoFinish: false)
        holes[hi] = h
        return Result(ok: true, reason: "", hole: hi)
    }
    private static func applyDelete(_ h: inout HoleState, _ k: Int) -> String {
        guard k >= 1 && k < h.rows.count else { return "stale" }
        let gone = h.rows[k]
        let wasOut = gone.holeOut || gone.loc == "holed" || gone.loc == "holedx"
        h.rows.remove(at: k)
        if k < h.rows.count, h.rows[k].loc != "ob" { h.rows[k].dir = "" }
        if wasOut && k == h.rows.count {
            if k - 1 == 0 { h.rows[0].loc = "holedx" } else { h.rows[k - 1].holeOut = true }
        }
        return ""
    }
    private static func applyInsert(_ h: inout HoleState, _ k: Int) -> String {
        guard k >= 0 && k < h.rows.count else { return "stale" }
        let prev = h.rows[k]
        var nr = Row(loc: prev.loc == "green" ? "green" : "", dist: nil, dir: "", pen: false)
        if prev.holeOut { h.rows[k].holeOut = false; nr.holeOut = true }
        else if prev.loc == "holedx" && k == 0 { return "bad" }
        h.rows.insert(nr, at: k + 1)
        return ""
    }
}

/// The round as the watch shows it: what the phone last said, plus the watch's own waiting events applied on top.
struct RoundModel {
    var roundId: String = ""
    var course: String = ""
    var pars: [Int] = Array(repeating: 4, count: 18)
    var holes: [Int: HoleState] = [:]

    init() {}
    init(state: PhoneState) {
        roundId = state.roundId ?? ""
        course = state.course ?? ""
        if let p = state.pars, p.count == 18 { pars = p }
        for h in state.holes ?? [] { holes[h.i] = h }
    }
    mutating func apply(_ ev: WatchEvent) -> Rules.Result { Rules.apply(ev, holes: &holes, pars: pars) }
    func hole(_ i: Int) -> HoleState { holes[i] ?? Rules.blankHole(i, pars) }
    /// The first hole that is not done: where the next shot goes (same as the phone's Resume).
    var currentHole: Int {
        for i in 0..<18 { if !(holes[i]?.done ?? false) { return i } }
        return 17
    }
    var roundOver: Bool { (0..<18).allSatisfy { holes[$0]?.done ?? false } }
    var holesDone: Int { holes.values.filter { $0.done }.count }
    var strokesDone: Int { holes.values.filter { $0.done }.reduce(0) { $0 + $1.strokes } }
    var parDone: Int { holes.values.filter { $0.done }.reduce(0) { $0 + $1.par } }
}
