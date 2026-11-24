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
var mEnd = m; let endEv = WatchEvent(id: "end1", seq: 2, t: 0, roundId: "r1", type: "end", hole: 1)
precondition(mEnd.apply(endEv).ok && mEnd.hole(1).rows.count == m.hole(1).rows.count, "an end note changes no rows")
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
// v233: the approach onto the green carries the pin; the watch shows it at once and won't ask again on that hole
var mPin = RoundModel(state: st)
let pinEv = WatchEvent(id: "p1", seq: 3, t: 0, roundId: "r1", type: "shot", hole: 1, k: 0, fin: "green", dir: "", dist: 20, pin: "backright")
precondition(mPin.apply(pinEv).ok && mPin.hole(1).pin == "backright", "pin set by the approach onto the green")
let pinEnc = String(data: try JSONEncoder().encode(pinEv), encoding: .utf8)!
precondition(pinEnc.contains("\"pin\":\"backright\""), "event carries the pin: \(pinEnc)")
precondition(Persistence(url: tmp).load() == Snapshot(), "missing file = empty snapshot")
precondition(Labels.outcome(m2.hole(1).rows, 0) == "Fairway · 150 yd" && Labels.toPar(-1) == "-1" && Labels.score(m.hole(0)) == "3 (-1)", "labels: \(Labels.outcome(m2.hole(1).rows, 0))")
// lastRound survives a relaunch; a snapshot written before lastRound existed still decodes
let prior18 = RoundSummary(roundId: "r1", course: "Ridgeview", holesDone: 18, strokesDone: 84, parDone: 72, phoneFinished: true)
precondition(prior18.scoreLine == "84 (+12) · 18 holes", "scoreLine 18: \(prior18.scoreLine)")
precondition(RoundSummary(roundId: "r9", holesDone: 9, strokesDone: 42, parDone: 36).scoreLine == "42 (+6) · 9 holes", "scoreLine 9")
precondition(RoundSummary(roundId: "rE", holesDone: 9, strokesDone: 36, parDone: 36).scoreLine == "36 (E) · 9 holes", "scoreLine even")
precondition(RoundSummary(roundId: "rOne", holesDone: 1, strokesDone: 4, parDone: 4).scoreLine == "4 (E) · 1 hole", "scoreLine 1 hole")
var snapFin = Snapshot(); snapFin.lastRound = prior18
let tmp2 = URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("sw-persist-fin-\(getpid()).json")
precondition(Persistence(url: tmp2).save(snapFin), "save lastRound")
let backFin = Persistence(url: tmp2).load()
precondition(backFin.lastRound == prior18 && backFin.lastRound?.phoneFinished == true, "phone-finished summary comes back after relaunch")
try? FileManager.default.removeItem(at: tmp2)
let oldSnap = try JSONDecoder().decode(Snapshot.self, from: Data(#"{"state":null,"pending":[],"seq":0,"ended":[],"workoutRound":null}"#.utf8))
precondition(oldSnap.lastRound == nil, "old snapshot without lastRound still decodes")
// phone-finished detection (the rule WatchStore.receive uses)
func after(_ was: Bool, id: String?, incoming: RoundSummary?, current: RoundSummary?) -> RoundSummary? {
    RoundSummary.afterPhoneState(wasOnWatch: was, incomingRoundId: id, incoming: incoming, current: current)
}
let live = RoundSummary(roundId: "r1", course: "Ridgeview", holesDone: 9, strokesDone: 42, parDone: 36)
let marked = after(true, id: nil, incoming: nil, current: live)
precondition(marked?.phoneFinished == true && marked?.scoreLine == "42 (+6) · 9 holes" && marked?.roundId == "r1", "phone clears an in-play round → phone-finished")
precondition(after(true, id: "", incoming: nil, current: live)?.phoneFinished == true, "empty roundId is also a cleared round")
let nextR = RoundSummary(roundId: "r2", course: "Lakes", holesDone: 0, strokesDone: 0, parDone: 0)
let replaced = after(true, id: "r2", incoming: nextR, current: live)
precondition(replaced?.roundId == "r2" && replaced?.phoneFinished == false, "a new round on the phone replaces the summary")
precondition(after(false, id: nil, incoming: nil, current: nil) == nil, "fresh launch, nothing played → no finished screen")
var dismissed = prior18; dismissed.phoneFinished = false
precondition(after(false, id: nil, incoming: nil, current: dismissed)?.phoneFinished == false, "watch already ended / Close dismissed: stay plain No round")
precondition(after(false, id: nil, incoming: nil, current: prior18)?.phoneFinished == true, "relaunch after phone finished still shows the card")
print("phone-finished: score lines, disk round-trip, detect clear / new round / fresh / dismissed ok")
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
// playing-as number: rowStrokes of rows through k (penalties included). Equals k+1 when there is no penalty.
func ev(_ type: String, hole: Int, k: Int? = nil, fin: String? = nil, dir: String? = nil, dist: Int? = nil, hz: String? = nil, drop: String? = nil, club: String? = nil) -> WatchEvent {
    WatchEvent(id: "t", seq: 1, t: 0, roundId: "r1", type: type, hole: hole, k: k, fin: fin, dir: dir, dist: dist, hz: hz, drop: drop, club: club)
}
func play(_ events: [WatchEvent], start: [Row] = [Row(loc: "tee", dist: 400)]) -> [Row] {
    var holes: [Int: HoleState] = [0: HoleState(i: 0, par: 4, fin: false, complete: false, strokes: 1, rows: start)]
    for e in events { let r = Rules.apply(e, holes: &holes, pars: Array(repeating: 4, count: 18)); precondition(r.ok, "event failed: \(r.reason)") }
    return holes[0]!.rows
}
func checkPlayingAs(_ name: String, _ rows: [Row], _ k: Int, _ want: Int) {
    let got = Rules.playingAs(rows, k)
    if got != want { fails += 1; print("FAIL playingAs \(name): got \(got) want \(want) for k=\(k) rows=\(rows)") }
}
// no penalty: Shot N only
checkPlayingAs("tee", [Row(loc: "tee", dist: 400)], 0, 1)
let fairway = play([ev("shot", hole: 0, k: 0, fin: "fairway", dir: "right", dist: 150)])
checkPlayingAs("after fairway (shot 2)", fairway, 1, 2)
precondition(Rules.playingAs(fairway, 1) == 1 + 1, "no-penalty playingAs equals shot count")
// OB off the tee (stroke and distance): about to re-hit is Shot 2 (3)
let ob = play([ev("shot", hole: 0, k: 0, fin: "ob", dir: "left")])
checkPlayingAs("OB re-hit", ob, 1, 3)
precondition(ob.count == 2 && ob[1].loc == "ob", "OB writes the next row")
// after that re-hit finds the fairway, the approach is Shot 3 (4)
let obThenFairway = play([
    ev("shot", hole: 0, k: 0, fin: "ob", dir: "left"),
    ev("shot", hole: 0, k: 1, fin: "fairway", dir: "", dist: 140)
])
checkPlayingAs("approach after OB", obThenFairway, 2, 4)
// hazard drop / re-tee: Shot 2 (3); played it: Shot 2 (no paren)
let hzDrop = play([ev("shot", hole: 0, k: 0, fin: "hazard", dist: 120, hz: "drop")])
let hzRe = play([ev("shot", hole: 0, k: 0, fin: "hazard", hz: "retee")])
let hzPlay = play([ev("shot", hole: 0, k: 0, fin: "hazard", dist: 90, hz: "play")])
checkPlayingAs("hazard drop", hzDrop, 1, 3)
checkPlayingAs("hazard re-tee", hzRe, 1, 3)
checkPlayingAs("hazard played it", hzPlay, 1, 2)
// unplayable and lost ball are the same +1 as a drop / OB
let unp = play([ev("shot", hole: 0, k: 0, fin: "unp", dist: 150)])
let lost = play([ev("shot", hole: 0, k: 0, fin: "lost", dir: "left")])
checkPlayingAs("unplayable", unp, 1, 3)
checkPlayingAs("lost ball", lost, 1, 3)
// two OBs: the third ball is Shot 3 (5)
let twoOb = play([
    ev("shot", hole: 0, k: 0, fin: "ob", dir: "left"),
    ev("shot", hole: 0, k: 1, fin: "ob", dir: "right")
])
checkPlayingAs("second OB re-hit", twoOb, 2, 5)
if fails == 0 { print("playingAs: tee=1, fairway shot 2=2, OB/hazard-drop/retee/unp/lost shot 2=(3), after OB approach=(4), two OBs shot 3=(5)") }

// v253: the club the watch offers first, the club names, and the bag in the phone's state
do {
    let bag = [ClubInfo(c: "Driver", y: 250), ClubInfo(c: "7i", y: 150), ClubInfo(c: "8i", y: 140), ClubInfo(c: "PW", y: 120), ClubInfo(c: "56")]
    let tee = [Row(loc: "tee", dist: 400)]
    let app = [Row(loc: "tee", dist: 400), Row(loc: "fairway", dist: 146)]
    let putt = [Row(loc: "tee", dist: 400), Row(loc: "green", dist: 20)]
    var bad: [String] = []
    if Rules.suggestClub(bag, rows: tee, k: 0, par: 4) != "Driver" { bad.append("tee par 4 → Driver") }
    if Rules.suggestClub(bag, rows: [Row(loc: "tee", dist: 152)], k: 0, par: 3) != "7i" { bad.append("par 3 → nearest carry") }
    if Rules.suggestClub(bag, rows: app, k: 1, par: 4) != "8i" { bad.append("146 → 8i") }
    if Rules.suggestClub(bag, rows: putt, k: 1, par: 4) != nil { bad.append("green → none") }
    if Rules.suggestClub([ClubInfo(c: "7i")], rows: app, k: 1, par: 4) != nil { bad.append("no carries → none") }
    if Labels.club("7i") != "7 iron" || Labels.club("3W") != "3 wood" || Labels.club("4H") != "4 hybrid" || Labels.club("52") != "52°" || Labels.club("PW") != "PW" || Labels.club("Driver") != "Driver" { bad.append("club names") }
    let st = try JSONDecoder().decode(PhoneState.self, from: Data(#"{"roundId":"r","clubs":[{"c":"Driver","y":250},{"c":"LW"}],"holes":[{"i":0,"rows":[{"loc":"tee","dist":400,"club":"Driver"}]}]}"#.utf8))
    if st.clubs != [ClubInfo(c: "Driver", y: 250), ClubInfo(c: "LW")] || st.holes?.first?.rows.first?.club != "Driver" { bad.append("state decode clubs") }
    var hs: [Int: HoleState] = [0: HoleState(i: 0, par: 4, rows: tee)]
    _ = Rules.apply(ev("shot", hole: 0, k: 0, fin: "fairway", dist: 150, club: "Driver"), holes: &hs, pars: Array(repeating: 4, count: 18))
    if hs[0]?.rows.first?.club != "Driver" { bad.append("club applied to stroke 0") }
    if !bad.isEmpty { fails += 1; print("FAIL clubs: " + bad.joined(separator: "; ")) } else { print("clubs: Driver off the tee, nearest carry, none on the green, names, state decode, applied") }
}

print("swift rules: \(vectors.count) scenarios, \(steps) steps, \(fails) failures; state decode, event encode, disk round-trip ok")
exit(fails == 0 ? 0 : 1)
