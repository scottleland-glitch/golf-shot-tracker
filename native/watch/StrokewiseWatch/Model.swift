// StrokeWise watch – the data the phone sends (what the round looks like) and the events the watch sends back.
// Foundation only, so the same file also compiles and is tested on Linux (native/watch/tests/run-linux.sh).
import Foundation

/// One stroke, in the phone's row model: `loc` = where the ball lay when hit, `dist` = distance to the pin then (yards, feet on the green),
/// `dir` = how the PREVIOUS stroke missed, `pen` = +1 to get here, `holeOut` = this stroke went in.
struct Row: Codable, Equatable {
    var loc: String = ""
    var dist: Int? = nil
    var dir: String = ""
    var pen: Bool = false
    var holeOut: Bool = false
    var retee: Bool = false
    var lost: Bool = false

    init(loc: String = "", dist: Int? = nil, dir: String = "", pen: Bool = false, holeOut: Bool = false, retee: Bool = false, lost: Bool = false) {
        self.loc = loc; self.dist = dist; self.dir = dir; self.pen = pen; self.holeOut = holeOut; self.retee = retee; self.lost = lost
    }

    private enum CodingKeys: String, CodingKey { case loc, dist, dir, pen, holeOut, retee, lost }

    // The phone sends dist as a number, or leaves it out; saved rounds can also have "" or "150" – all of those are read.
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        loc = (try? c.decodeIfPresent(String.self, forKey: .loc)) ?? ""
        if let n = try? c.decodeIfPresent(Int.self, forKey: .dist) { dist = n }
        else if let d = try? c.decodeIfPresent(Double.self, forKey: .dist) { dist = Int(d.rounded()) }
        else if let s = try? c.decodeIfPresent(String.self, forKey: .dist), let d = Double(s) { dist = Int(d.rounded()) }
        else { dist = nil }
        dir = (try? c.decodeIfPresent(String.self, forKey: .dir)) ?? ""
        pen = (try? c.decodeIfPresent(Bool.self, forKey: .pen)) ?? false
        holeOut = (try? c.decodeIfPresent(Bool.self, forKey: .holeOut)) ?? false
        retee = (try? c.decodeIfPresent(Bool.self, forKey: .retee)) ?? false
        lost = (try? c.decodeIfPresent(Bool.self, forKey: .lost)) ?? false
    }
}

struct HoleState: Codable, Equatable {
    var i: Int = 0
    var par: Int = 4
    var fin: Bool = false        // finished (counts in the stats)
    var complete: Bool = false   // every stroke has its lie + distance and the last one went in
    var strokes: Int = 0         // strokes so far, penalties included
    var rows: [Row] = []
    var pin: String = ""         // v233: pin position (backleft … frontright), "" = not set yet

    init(i: Int = 0, par: Int = 4, fin: Bool = false, complete: Bool = false, strokes: Int = 0, rows: [Row] = [], pin: String = "") {
        self.i = i; self.par = par; self.fin = fin; self.complete = complete; self.strokes = strokes; self.rows = rows; self.pin = pin
    }
    private enum CodingKeys: String, CodingKey { case i, par, fin, complete, strokes, rows, pin }
    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        i = (try? c.decodeIfPresent(Int.self, forKey: .i)) ?? 0
        par = (try? c.decodeIfPresent(Int.self, forKey: .par)) ?? 4
        fin = (try? c.decodeIfPresent(Bool.self, forKey: .fin)) ?? false
        complete = (try? c.decodeIfPresent(Bool.self, forKey: .complete)) ?? false
        strokes = (try? c.decodeIfPresent(Int.self, forKey: .strokes)) ?? 0
        rows = (try? c.decodeIfPresent([Row].self, forKey: .rows)) ?? []
        pin = (try? c.decodeIfPresent(String.self, forKey: .pin)) ?? ""
    }
    var done: Bool { fin && complete }
}

struct Ack: Codable, Equatable {
    var id: String
    var ok: Int = 1
    var why: String? = nil
}

/// What the phone last told the watch: the round in progress.
struct PhoneState: Codable, Equatable {
    var v: Int? = nil
    var ts: Double? = nil
    var roundId: String? = nil
    var course: String? = nil
    var tee: String? = nil
    var player: String? = nil
    var upd: Double? = nil      // when the round last changed (ms since 1970)
    var over: Bool? = nil       // all 18 holes done
    var hole: Int? = nil
    var pars: [Int]? = nil
    var holes: [HoleState]? = nil
    var holesDone: Int? = nil
    var strokesDone: Int? = nil
    var parDone: Int? = nil
    var acks: [Ack]? = nil
}

/// One thing the watch did. Applied to the round by the phone (native/watch-core.js) and, while waiting, on the watch too (Rules.swift).
struct WatchEvent: Codable, Equatable, Identifiable {
    var id: String
    var seq: Int
    var t: Double
    var roundId: String
    var type: String        // shot | setdist | undo | delete | insert | end (information only: the golfer ended the round on the watch)
    var hole: Int
    var k: Int? = nil
    var fin: String? = nil  // fairway rough deep bunker green trees hazard ob unp lost in
    var dir: String? = nil
    var dist: Int? = nil
    var hz: String? = nil   // drop | retee | play
    var drop: String? = nil
    var edit: Bool? = nil
    var pin: String? = nil  // v233: shot only – the pin position picked on the way to the green (set when the hole has none)
}
