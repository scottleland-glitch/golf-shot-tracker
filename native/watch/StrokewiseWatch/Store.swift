// StrokeWise watch – the one place that holds the round: what the phone last said + the shots confirmed on the watch that the phone
// has not acknowledged yet. Every change is written to disk straight away (Persistence), so a relaunch restores the exact hole and shot.
import Foundation
import SwiftUI

final class WatchStore: ObservableObject {
    static let shared = WatchStore()

    @Published private(set) var snapshot: Snapshot
    @Published private(set) var model = RoundModel()
    @Published private(set) var reachable = false
    /// The hole just holed out (shows the hole-finished screen, then moves on by itself).
    @Published var justFinished: Int? = nil

    private let persistence: Persistence

    init(persistence: Persistence = Persistence()) {
        self.persistence = persistence
        self.snapshot = persistence.load()
        rebuild()
    }

    // MARK: derived

    var hasRound: Bool { !model.roundId.isEmpty }
    var pendingCount: Int { snapshot.pending.count }
    var state: PhoneState? { snapshot.state }
    func unsentEvents() -> [Pending] { snapshot.pending.filter { !$0.sent } }

    private func rebuild() {
        var m = snapshot.state.map { RoundModel(state: $0) } ?? RoundModel()
        for p in snapshot.pending where p.event.roundId == m.roundId { _ = m.apply(p.event) }
        model = m
    }
    private func commit() {
        persistence.save(snapshot)   // immediately, on every change
        rebuild()
    }

    // MARK: from the phone

    func receive(json: String) {
        guard let data = json.data(using: .utf8), let st = try? JSONDecoder().decode(PhoneState.self, from: data) else { return }
        if let old = snapshot.state, let a = old.ts, let b = st.ts, b < a, old.roundId == st.roundId { return }   // an older picture arriving late
        let acked = Set((st.acks ?? []).map { $0.id })
        snapshot.state = st
        snapshot.pending.removeAll { acked.contains($0.event.id) || (st.roundId != nil && $0.event.roundId != st.roundId) || st.roundId == nil }
        commit()
        evaluateWorkout()
    }
    func setReachable(_ r: Bool) { if reachable != r { reachable = r } }

    // MARK: from the golfer

    func makeEvent(_ type: String, hole: Int, k: Int? = nil, fin: String? = nil, dir: String? = nil, dist: Int? = nil,
                   hz: String? = nil, edit: Bool = false) -> WatchEvent {
        snapshot.seq += 1
        return WatchEvent(id: UUID().uuidString, seq: snapshot.seq, t: Date().timeIntervalSince1970 * 1000, roundId: model.roundId,
                          type: type, hole: hole, k: k, fin: fin, dir: dir, dist: dist, hz: hz, drop: nil, edit: edit ? true : nil)
    }

    /// A confirmed shot (or edit, delete, undo): kept on disk first, shown at once, then sent.
    func send(_ ev: WatchEvent) {
        guard !model.roundId.isEmpty else { return }
        snapshot.pending.append(Pending(event: ev, sent: false))
        commit()
        if ev.type == "shot" && ev.fin == "in" && ev.edit != true { justFinished = ev.hole }
        if ev.type == "undo" { justFinished = nil }
        Connectivity.shared.flush()
        evaluateWorkout()
    }
    func markSent(_ id: String) {
        guard let i = snapshot.pending.firstIndex(where: { $0.event.id == id }), !snapshot.pending[i].sent else { return }
        snapshot.pending[i].sent = true
        persistence.save(snapshot)
    }
    func dismissFinished() { justFinished = nil }

    /// What Undo would remove (the same choice the phone makes): the last shot of this hole, or the hole before when this one is untouched.
    func undoTarget() -> (hole: Int, text: String)? {
        let c = model.currentHole, h = model.hole(c), rows = h.rows
        if rows.count > 1 || (rows.first.map { Rules.isHoled($0, 0) } ?? false) {
            let last = rows.count - 1
            if Rules.isHoled(rows[last], last) { return (c, "Hole \(c + 1): shot \(last + 1) · In the hole") }
            let k = last - 1
            return (c, "Hole \(c + 1): shot \(k + 1) · \(Labels.lie(rows[k].loc)) → \(Labels.outcome(rows, k))")
        }
        if c > 0, let p = model.holes[c - 1], p.fin || p.complete, !p.rows.isEmpty {
            return (c - 1, "Reopen hole \(c): \(Labels.score(p))")
        }
        return nil
    }

    // MARK: the golf workout follows the round

    func evaluateWorkout() {
        let w = WorkoutManager.shared
        guard let st = snapshot.state else { return }
        // the round is gone (phone discarded it), a different round started, or all 18 holes are done: end the workout
        if w.isActive, snapshot.workoutRound != st.roundId || model.roundOver {
            endWorkout(markEnded: false)
            return
        }
        guard let id = st.roundId, !model.roundOver, !snapshot.ended.contains(id), !w.isActive else { return }
        if snapshot.workoutRound == id { w.recover(); return }   // a workout was running for this round: reconnect to it first (workoutLost if it is gone)
        let ageMs = Date().timeIntervalSince1970 * 1000 - (st.upd ?? 0)
        if ageMs < 12 * 3600 * 1000 { startWorkout() }   // only a round in play today – an old unfinished round never starts a workout
    }
    func startWorkout() {
        guard hasRound else { return }
        snapshot.ended.removeAll { $0 == model.roundId }
        snapshot.workoutRound = model.roundId
        persistence.save(snapshot)
        WorkoutManager.shared.start()
    }
    /// markEnded = the golfer asked: don't start another one for this round.
    func endWorkout(markEnded: Bool) {
        if markEnded, !model.roundId.isEmpty, !snapshot.ended.contains(model.roundId) { snapshot.ended.append(model.roundId) }
        snapshot.workoutRound = nil
        persistence.save(snapshot)
        WorkoutManager.shared.end()
    }
    /// Reconnecting found no workout: forget it and decide again (this may start a fresh one for the same round).
    func workoutLost() {
        snapshot.workoutRound = nil
        persistence.save(snapshot)
        evaluateWorkout()
    }
    /// After the system relaunched the app into a running workout.
    func workoutRecovered() {
        if snapshot.workoutRound == nil, hasRound { snapshot.workoutRound = model.roundId; persistence.save(snapshot) }
    }
}
