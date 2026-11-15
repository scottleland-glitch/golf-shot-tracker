// StrokeWise watch – words for lies, directions and scores. Foundation only (also compiled on Linux by tests/run-linux.sh).
import Foundation

enum Labels {
    static func lie(_ loc: String) -> String {
        switch loc {
        case "tee": return "Tee"
        case "fairway": return "Fairway"
        case "rough": return "Rough"
        case "deep": return "Deep rough"
        case "bunker": return "Bunker"
        case "trees": return "Trees"
        case "green": return "Green"
        case "hazard": return "Hazard"
        case "ob": return "OB"
        case "unp": return "Unplayable"
        case "lost": return "Lost ball"
        case "in", "holed", "holedx": return "In the hole"
        default: return loc.isEmpty ? "?" : loc.capitalized
        }
    }
    static func dir(_ d: String) -> String {
        switch d {
        case "long": return "Long"
        case "longright": return "Long right"
        case "right": return "Right"
        case "shortright": return "Short right"
        case "short": return "Short"
        case "shortleft": return "Short left"
        case "left": return "Left"
        case "longleft": return "Long left"
        default: return "No direction"
        }
    }
    static func toPar(_ n: Int) -> String { n == 0 ? "E" : (n > 0 ? "+\(n)" : "\(n)") }
    /// "7 (+2)" style score line for a finished hole.
    static func score(_ h: HoleState) -> String { "\(h.strokes) (\(toPar(h.strokes - h.par)))" }
    static func scoreName(_ strokes: Int, par: Int) -> String {
        if strokes == 1 { return "Hole in one" }
        switch strokes - par {
        case ...(-3): return "Albatross"
        case -2: return "Eagle"
        case -1: return "Birdie"
        case 0: return "Par"
        case 1: return "Bogey"
        case 2: return "Double bogey"
        default: return "+\(strokes - par)"
        }
    }
    /// What stroke k of a hole did: "Fairway · 148 yd", "OB +1", "In the hole".
    static func outcome(_ rows: [Row], _ k: Int) -> String {
        let r = rows[k]
        if Rules.isHoled(r, k) { return "In the hole" }
        guard k + 1 < rows.count else { return "…" }
        let n = rows[k + 1]
        var s: String
        if n.loc == "ob" { s = n.lost ? "Lost ball +1" : "OB +1" }
        else if n.loc.isEmpty { s = "?" }
        else if n.loc == "hazard" { s = "Hazard" + (n.retee ? " re-tee +1" : (n.pen ? " drop +1" : "")) }
        else { s = lie(n.loc) + (n.pen ? " +1" : "") }
        if n.loc != "ob", !Rules.isRetee(n), let d = n.dist { s += " · \(d) \(Rules.unit(rows, k + 1))" }
        return s
    }
    /// A starting point for the Digital Crown so the golfer doesn't scroll from 1.
    static func defaultDistance(unit: String, from: Int?) -> Int {
        if unit == "ft" { return 10 }
        guard let f = from else { return 150 }
        if f > 300 { return 150 }
        if f > 120 { return 100 }
        return 30
    }
}
