// Runs tests/fixtures/watch-vectors.json (made by the JS rules, tests/watch-core.test.js --write-vectors) through the Swift copy of the rules
// and checks every step gives the same answer: ok / reason, finished, and every row. Also checks the JSON the phone sends decodes.
import Foundation

struct Start: Decodable { var par: Int?; var finished: Bool?; var rows: [Row] }
struct Expect: Decodable { var ok: Bool; var reason: String; var hole: Int; var finished: Bool; var rows: [Row] }
struct Vector: Decodable { var name: String; var start: Start; var events: [WatchEvent]; var expect: [Expect] }

let path = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "tests/fixtures/watch-vectors.json"
let data = try Data(contentsOf: URL(fileURLWithPath: path))
let vectors = try JSONDecoder().decode([Vector].self, from: data)
var fails = 0, steps = 0
for v in vectors {
    var holes: [Int: HoleState] = [:]
    var h = HoleState(i: 0, par: v.start.par ?? 4, fin: v.start.finished ?? false, complete: false, strokes: 0, rows: v.start.rows)
    h.complete = Rules.isComplete(h.rows); h.strokes = Rules.rowStrokes(h.rows)
    holes[0] = h
    for (n, ev) in v.events.enumerated() {
        let exp = v.expect[n]; steps += 1
        let r = Rules.apply(ev, holes: &holes, pars: Array(repeating: 4, count: 18))
        let got = holes[ev.hole] ?? Rules.blankHole(ev.hole, [])
        var bad: [String] = []
        if r.ok != exp.ok { bad.append("ok \(r.ok) != \(exp.ok)") }
        if r.reason != exp.reason { bad.append("reason '\(r.reason)' != '\(exp.reason)'") }
        if exp.ok && r.hole != exp.hole { bad.append("hole \(r.hole) != \(exp.hole)") }
        if got.fin != exp.finished { bad.append("finished \(got.fin) != \(exp.finished)") }
        if got.rows != exp.rows { bad.append("rows \(got.rows) != \(exp.rows)") }
        if got.complete != Rules.isComplete(got.rows) { bad.append("complete flag stale") }
        if !bad.isEmpty { fails += 1; print("FAIL \(v.name) step \(n): " + bad.joined(separator: "; ")) }
    }
}
// the phone's state JSON
let json = """
{"v":1,"ts":1.0,"roundId":"r1","course":"Ridgeview","tee":"White","hole":1,"pars":[4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4],
 "holes":[{"i":0,"par":4,"fin":true,"complete":true,"strokes":3,"rows":[{"loc":"tee","dist":400},{"loc":"fairway","dist":150,"dir":"right"},{"loc":"green","dist":12,"holeOut":true}]},
          {"i":1,"par":4,"fin":false,"complete":false,"strokes":1,"rows":[{"loc":"tee","dist":381}]}],
 "holesDone":1,"strokesDone":3,"parDone":4,"acks":[{"id":"a","ok":1},{"id":"b","ok":0,"why":"stale"}]}
"""
let st = try JSONDecoder().decode(PhoneState.self, from: Data(json.utf8))
var m = RoundModel(state: st)
precondition(m.currentHole == 1 && m.holesDone == 1 && m.strokesDone == 3 && m.parDone == 4, "state decode")
precondition(st.acks?.count == 2 && st.acks?[1].why == "stale", "acks")
let e = WatchEvent(id: "x", seq: 1, t: 0, roundId: "r1", type: "shot", hole: 1, k: 0, fin: "fairway", dir: "", dist: 150)
precondition(m.apply(e).ok && m.hole(1).rows.count == 2 && m.hole(1).rows[1].dist == 150, "optimistic apply")
let enc = String(data: try JSONEncoder().encode(e), encoding: .utf8)!
precondition(enc.contains("\"fin\":\"fairway\"") && !enc.contains("\"hz\""), "event encodes without nils: \(enc)")
// the file the watch keeps: a confirmed shot is on disk right away and comes back exactly after a "relaunch"
let tmp = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("sw-persist-\(getpid()).json")
let store1 = Persistence(url: tmp)
var snap = Snapshot(); snap.state = st; snap.seq = 7; snap.pending = [Pending(event: e, sent: true)]; snap.ended = ["old"]
precondition(store1.save(snap), "save")
let back = Persistence(url: tmp).load()
precondition(back == snap, "snapshot round-trips")
var m2 = RoundModel(state: back.state!); for p in back.pending { _ = m2.apply(p.event) }
precondition(m2.currentHole == 1 && m2.hole(1).rows.count == 2 && m2.hole(1).rows[1].loc == "fairway", "relaunch restores the exact hole and shot")
try? FileManager.default.removeItem(at: tmp)
precondition(Persistence(url: tmp).load() == Snapshot(), "missing file = empty snapshot")
precondition(Labels.outcome(m2.hole(1).rows, 0) == "Fairway · 150 yd" && Labels.toPar(-1) == "-1" && Labels.score(m.hole(0)) == "3 (-1)", "labels: \(Labels.outcome(m2.hole(1).rows, 0))")
// the states the REAL app bundle pushed (tests/watch-bundle-focused.js writes them): every one must decode on the watch, or the watch shows nothing
let realPath = CommandLine.arguments.count > 2 ? CommandLine.arguments[2] : "tests/fixtures/watch-state-real.json"
if let rd = FileManager.default.contents(atPath: realPath) {
    let objs = try JSONSerialization.jsonObject(with: rd) as! [[String: Any]]
    for (i, o) in objs.enumerated() {
        let d = try JSONSerialization.data(withJSONObject: o)
        do { let s = try JSONDecoder().decode(PhoneState.self, from: d); _ = RoundModel(state: s) }
        catch { print("FAIL real state #\(i) does not decode: \(error)"); fails += 1 }
    }
    print("real app states decoded: \(objs.count)")
}
print("swift rules: \(vectors.count) scenarios, \(steps) steps, \(fails) failures; state decode, event encode, disk round-trip ok")
exit(fails == 0 ? 0 : 1)
