// StrokeWise watch – the one place that holds the round: what the phone last said + the shots confirmed on the watch that the phone
// has not acknowledged yet. Every change is written to disk straight away (Persistence), so a relaunch restores the exact hole and shot.
import Foundation
import SwiftUI
import HealthKit

final class WatchStore: ObservableObject {
    static let shared = WatchStore()

    @Published private(set) var snapshot: Snapshot
    @Published private(set) var model = RoundModel()
    @Published private(set) var reachable = false
    /// How the link to the iPhone looks right now – shown on the watch so a silent link can be seen at a glance.
    @Published private(set) var link = Link()
    @Published private(set) var lastPhoneAt: Date? = nil
    struct Link: Equatable {
        var activated = false
        var companion: Bool? = nil     // is the StrokeWise iPhone app installed on the paired phone
        var error = ""
    }
    /// Set while End round / Close is running: .ending (saving the workout), then .saved (the "Round saved" card), then nil.
    @Published private(set) var exitPhase: ExitPhase? = nil
    enum ExitPhase: Equatable { case ending, saved(workout: Bool, round: Bool) }
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
    /// Shots waiting to reach the phone (the "round ended" note is not a shot).
    var pendingCount: Int { snapshot.pending.filter { $0.event.type != "end" }.count }
    /// The round the golfer is playing on this watch: the phone's round, unless the golfer already ended it here (End round / Close).
    /// An ended round shows the plain "No round" screen; a new round on the phone has a new id and shows up by itself.
    var roundOnWatch: Bool { hasRound && !snapshot.ended.contains(model.roundId) }
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
        guard let data = json.data(using: .utf8), let st = try? JSONDecoder().decode(PhoneState.self, from: data) else {
            if link.error != "Couldn't read the phone's data" { link.error = "Couldn't read the phone's data" }
            return
        }
        lastPhoneAt = Date()
        if !link.error.isEmpty { link.error = "" }
        if let old = snapshot.state, let a = old.ts, let b = st.ts, b < a, old.roundId == st.roundId { return }   // an older picture arriving late
        let acked = Set((st.acks ?? []).map { $0.id })
        snapshot.state = st
        snapshot.pending.removeAll { acked.contains($0.event.id) || (st.roundId != nil && $0.event.roundId != st.roundId) || st.roundId == nil }
        commit()
        evaluateWorkout()
    }
    func setReachable(_ r: Bool) { if reachable != r { reachable = r } }
    func setLink(activated: Bool, companion: Bool?) {
        let l = Link(activated: activated, companion: companion, error: link.error)
        if link != l { link = l }
    }
    /// One line for the idle screen and the foot of the hole screen.
    var linkSummary: String {
        if !link.activated { return "Phone: starting…" }
        if link.companion == false { return "Phone: StrokeWise isn't installed on the iPhone" }
        if !link.error.isEmpty { return "Phone: " + link.error }
        return reachable ? "Phone: connected" : "Phone: waiting (open StrokeWise on the iPhone)"
    }

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

    /// The phone launched the app to start the round's workout. Start it now (even before the round's picture has arrived); once the picture
    /// shows a round in play, evaluateWorkout() attaches the workout to it. If no round shows up within 90 s the workout is ended again.
    private var phoneLaunchAt: Date?
    func phoneLaunchedWorkout(_ config: HKWorkoutConfiguration) {
        let w = WorkoutManager.shared
        Connectivity.shared.refresh()                    // ask for the round right away
        guard !w.isActive else { evaluateWorkout(); return }
        phoneLaunchAt = Date()
        w.markLaunchedByPhone(true)
        snapshot.workoutRound = nil
        persistence.save(snapshot)
        w.start(config: config)
        DispatchQueue.main.asyncAfter(deadline: .now() + 91) { [weak self] in self?.evaluateWorkout() }
    }
    private var awaitingPhoneRound: Bool {
        guard let t = phoneLaunchAt, WorkoutManager.shared.launchedByPhone, snapshot.workoutRound == nil else { return false }
        return Date().timeIntervalSince(t) < 90
    }

    func evaluateWorkout() {
        let w = WorkoutManager.shared
        // a workout the phone launched is waiting for its round: attach it to a round that is in play and fresh, else keep waiting (up to 90 s)
        if w.isActive, w.launchedByPhone, snapshot.workoutRound == nil {
            if let st = snapshot.state, let id = st.roundId, !model.roundOver, !snapshot.ended.contains(id),
               Date().timeIntervalSince1970 * 1000 - (st.upd ?? 0) < 6 * 3600 * 1000 {
                snapshot.workoutRound = id
                persistence.save(snapshot)
                w.markLaunchedByPhone(false)
                phoneLaunchAt = nil
                return
            }
            if awaitingPhoneRound { return }
            if snapshot.state == nil { endWorkout(markEnded: false); return }   // nothing ever arrived: don't leave a workout running for no round
        }
        guard let st = snapshot.state else { return }
        // the round is gone (phone discarded it), a different round started, or all 18 holes are done: end the workout
        if w.isActive, snapshot.workoutRound != st.roundId || model.roundOver || (st.roundId.map { snapshot.ended.contains($0) } ?? false) {
            endWorkout(markEnded: false)
            return
        }
        guard exitPhase == nil, let id = st.roundId, !model.roundOver, !snapshot.ended.contains(id), !w.isActive else { return }
        if snapshot.workoutRound == id { w.recover(); return }   // a workout was running for this round: reconnect to it first (workoutLost if it is gone)
        let ageMs = Date().timeIntervalSince1970 * 1000 - (st.upd ?? 0)
        if ageMs < 12 * 3600 * 1000 { startWorkout() }   // only a round in play today – an old unfinished round never starts a workout
    }
    func startWorkout() {
        guard roundOnWatch else { return }   // (there is no "start workout" button: only evaluateWorkout starts one, for a round in play)
        snapshot.workoutRound = model.roundId
        persistence.save(snapshot)
        WorkoutManager.shared.start()
    }
    /// markEnded = the golfer asked: don't start another one for this round. `completion` (workout saved?) runs once the workout is fully over.
    func endWorkout(markEnded: Bool, completion: ((Bool) -> Void)? = nil) {
        if markEnded, !model.roundId.isEmpty, !snapshot.ended.contains(model.roundId) { snapshot.ended.append(model.roundId) }
        snapshot.workoutRound = nil
        persistence.save(snapshot)
        WorkoutManager.shared.end(completion: completion)
    }

    // MARK: End round / Close

    /// The one exit path (End round, and the Close buttons). It
    ///  1. tells the phone the round was ended here (an "end" note in the same queue as the shots, so it is kept and delivered like them),
    ///  2. marks the round ended (nothing re-arms a workout for it) and ends the Golf workout: session ended, builder finished, saved to Health,
    ///  3. shows "Round saved" for about 1.5 s, then returns to the plain "No round" screen.
    /// watchOS has no way for an app to quit itself. With no workout running the system puts the app away when the wrist goes down (or the
    /// golfer presses the Digital Crown), and a later startWatchApp from the phone launches it again.
    func endRoundAndExit() {
        guard exitPhase == nil else { return }
        let hadRound = roundOnWatch
        exitPhase = .ending
        if hadRound { send(makeEvent("end", hole: model.currentHole)) }   // before the round is marked ended (send needs the round)
        endWorkout(markEnded: true) { [weak self] saved in
            guard let self = self else { return }
            Connectivity.shared.flush()
            self.exitPhase = .saved(workout: saved, round: hadRound)
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { [weak self] in self?.exitFinished() }
        }
    }
    /// The "Round saved" card is done: back to the home screen (which shows "No round" for an ended round). Nothing is started here.
    private func exitFinished() {
        exitPhase = nil
        justFinished = nil
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
        evaluateWorkout()   // a round the golfer ended (or one that is over) must not keep a recovered workout alive
    }
}
