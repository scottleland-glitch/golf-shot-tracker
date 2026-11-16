// StrokeWise watch – everything the watch must not lose is written to a file the moment it changes: the last round the phone described,
// every shot the golfer confirmed that the phone has not acknowledged yet, and which rounds' workouts were ended on purpose.
// After the app is killed, or the watch restarts, the exact hole and shot come back from this file. Foundation only (tested on Linux).
import Foundation

struct Pending: Codable, Equatable, Identifiable {
    var event: WatchEvent
    var sent: Bool = false      // handed to WatchConnectivity (sendMessage acknowledged, or transferUserInfo queued)
    var id: String { event.id }
}

/// The last round the watch was showing, kept after the phone's picture goes empty so a "Round finished on your phone" screen can still show the score.
struct RoundSummary: Codable, Equatable {
    var roundId: String = ""
    var course: String = ""
    var holesDone: Int = 0
    var strokesDone: Int = 0
    var parDone: Int = 0
    /// True when the phone cleared this round while it was still in play on the watch (Finish / End after 9). Cleared when the golfer taps Close, or a new round starts.
    var phoneFinished: Bool = false

    /// "84 (+12) · 18 holes"
    var scoreLine: String {
        let holes = holesDone == 1 ? "1 hole" : "\(holesDone) holes"
        return "\(strokesDone) (\(Labels.toPar(strokesDone - parDone))) · \(holes)"
    }

    static func from(_ model: RoundModel) -> RoundSummary {
        RoundSummary(roundId: model.roundId, course: model.course, holesDone: model.holesDone,
                     strokesDone: model.strokesDone, parDone: model.parDone, phoneFinished: false)
    }

    /// How the remembered summary should change when a new picture arrives from the phone.
    /// A round in play on the watch that the phone has now cleared becomes a phone-finished summary (shown until Close).
    /// A (new) round on the phone replaces it. Otherwise the current summary is left as-is (fresh launch, or already dismissed).
    static func afterPhoneState(wasOnWatch: Bool, incomingRoundId: String?, incoming: RoundSummary?, current: RoundSummary?) -> RoundSummary? {
        let phoneHasRound = !(incomingRoundId ?? "").isEmpty
        if wasOnWatch && !phoneHasRound {
            guard var prior = current else { return nil }
            prior.phoneFinished = true
            return prior
        }
        if phoneHasRound, var next = incoming {
            next.phoneFinished = false
            return next
        }
        return current
    }
}

struct Snapshot: Codable, Equatable {
    var state: PhoneState? = nil
    var pending: [Pending] = []
    var seq: Int = 0
    var ended: [String] = []    // rounds whose workout was ended on purpose (so it is not started again for them)
    var workoutRound: String? = nil  // the round the running workout belongs to
    var lastRound: RoundSummary? = nil  // score to show after the phone finishes the round (survives a relaunch)
}

final class Persistence {
    let url: URL

    init(url: URL? = nil) {
        if let u = url { self.url = u; return }
        let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first ?? URL(fileURLWithPath: NSTemporaryDirectory())
        self.url = dir.appendingPathComponent("strokewise-watch.json")
    }

    func load() -> Snapshot {
        guard let data = try? Data(contentsOf: url), let s = try? JSONDecoder().decode(Snapshot.self, from: data) else { return Snapshot() }
        return s
    }

    /// Atomic (a half-written file never replaces a good one); readable while the watch is locked, after the first unlock.
    @discardableResult
    func save(_ s: Snapshot) -> Bool {
        guard let data = try? JSONEncoder().encode(s) else { return false }
        #if os(watchOS)
        let opts: Data.WritingOptions = [.atomic, .completeFileProtectionUntilFirstUserAuthentication]
        #else
        let opts: Data.WritingOptions = [.atomic]
        #endif
        do { try data.write(to: url, options: opts); return true } catch { return false }
    }
}
