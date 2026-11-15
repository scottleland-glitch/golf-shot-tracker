// StrokeWise watch – the shot flow after the lie is picked: More lies → Direction → (hazard choice) → Digital Crown distance → Confirm.
import SwiftUI

/// The lie picker as its own screen (used when editing or adding a shot on an earlier hole).
struct LieScreen: View {
    let draft: ShotDraft
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 6) {
                Text("Shot \(draft.k + 1)").font(.footnote).foregroundColor(.secondary)
                Text("Where did it finish?").font(.headline)
                LieGrid(draft: draft)
            }.padding(.horizontal, 4)
        }
        .navigationTitle("Hole \(draft.hole + 1)")
    }
}

struct MoreLiesScreen: View {
    let draft: ShotDraft
    @EnvironmentObject var store: WatchStore
    @EnvironmentObject var nav: Nav
    var body: some View {
        ScrollView {
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 6), GridItem(.flexible(), spacing: 6)], spacing: 6) {
                tile("Deep rough", "deep")
                tile("Trees", "trees")
                tile("Hazard +1", "hazard")
                tile("OB +1", "ob")
                tile("Unplayable +1", "unp")
                tile("Lost ball +1", "lost")
            }.padding(.horizontal, 4)
        }
        .navigationTitle("More lies")
    }
    private func tile(_ title: String, _ fin: String) -> some View {
        Button(title) { pickLie(fin, draft: draft, store: store, nav: nav) }.buttonStyle(TileStyle(small: true))
    }
}

struct DirectionScreen: View {
    let draft: ShotDraft
    @EnvironmentObject var nav: Nav
    private var needsSide: Bool { draft.fin == "ob" || draft.fin == "lost" }   // OB / lost ball: a side is required (not short or long)
    private let grid: [[String]] = [["longleft", "long", "longright"], ["left", "", "right"], ["shortleft", "short", "shortright"]]

    var body: some View {
        ScrollView {
            VStack(spacing: 6) {
                Text(needsSide ? "Which side?" : "Direction").font(.headline)
                Text(needsSide ? "Out of bounds needs a side." : "Where it finished vs the target. Short is toward you.")
                    .font(.system(size: 10)).foregroundColor(.secondary).multilineTextAlignment(.center)
                ForEach(0..<3, id: \.self) { r in
                    HStack(spacing: 4) {
                        ForEach(0..<3, id: \.self) { c in cell(grid[r][c]) }
                    }
                }
                if !needsSide {
                    Button("Skip direction") { choose("") }.buttonStyle(TileStyle(small: true))
                }
            }.padding(.horizontal, 4)
        }
        .navigationTitle("Shot \(draft.k + 1)")
    }

    @ViewBuilder private func cell(_ d: String) -> some View {
        if d.isEmpty {
            Image(systemName: "flag.fill").foregroundColor(Theme.greenBright)
                .frame(maxWidth: .infinity, minHeight: 38)
                .background(RoundedRectangle(cornerRadius: 10).fill(Theme.green.opacity(0.35)))
        } else {
            let blocked = needsSide && (d == "short" || d == "long")
            Button { choose(d) } label: { Image(systemName: symbol(d)).frame(maxWidth: .infinity, minHeight: 38) }
                .buttonStyle(TileStyle(small: true))
                .disabled(blocked)
                .opacity(blocked ? 0.3 : 1)
        }
    }
    private func symbol(_ d: String) -> String {
        switch d {
        case "longleft": return "arrow.up.left"
        case "long": return "arrow.up"
        case "longright": return "arrow.up.right"
        case "left": return "arrow.left"
        case "right": return "arrow.right"
        case "shortleft": return "arrow.down.left"
        case "short": return "arrow.down"
        default: return "arrow.down.right"
        }
    }
    private func choose(_ d: String) {
        var x = draft
        x.dir = d          // "" = skipped
        nav.push(x.afterDirection())
    }
}

struct HazardScreen: View {
    let draft: ShotDraft
    @EnvironmentObject var nav: Nav
    var body: some View {
        ScrollView {
            VStack(spacing: 6) {
                Text("Hazard").font(.headline)
                Text("What happened next?").font(.system(size: 10)).foregroundColor(.secondary)
                choice("Drop  +1", "drop")
                choice("Re-tee  +1", "retee")
                choice("Played it", "play")
            }.padding(.horizontal, 4)
        }
        .navigationTitle("Shot \(draft.k + 1)")
    }
    private func choice(_ title: String, _ hz: String) -> some View {
        Button(title) { var x = draft; x.hz = hz; nav.push(x.afterHazard()) }.buttonStyle(TileStyle())
    }
}

/// Digital Crown distance: yards, or feet on the green.
struct DistanceScreen: View {
    let draft: ShotDraft
    @EnvironmentObject var store: WatchStore
    @EnvironmentObject var nav: Nav
    @State private var value: Double = 0
    @State private var ready = false

    private var rows: [Row] { store.model.hole(draft.hole).rows }
    private var unit: String {
        if draft.mode == "next" { return draft.fin == "green" ? "ft" : "yd" }
        return rows.isEmpty ? "yd" : Rules.unit(rows, min(draft.k, rows.count - 1))
    }
    private var title: String {
        switch draft.mode {
        case "in": return "How far was shot \(draft.k + 1)?"
        case "set": return draft.k == 0 ? "Tee distance" : "Shot \(draft.k + 1) distance"
        default: return "To the pin"
        }
    }
    private var initial: Int {
        if let d = draft.dist { return d }
        if draft.mode == "next" {
            if draft.edit, let n = rows[safe: draft.k + 1]?.dist, rows[safe: draft.k + 1]?.loc != "ob" { return n }
            return Labels.defaultDistance(unit: unit, from: rows.isEmpty ? nil : Rules.distOf(rows, draft.k))
        }
        return rows[safe: draft.k]?.dist ?? Labels.defaultDistance(unit: unit, from: nil)
    }

    var body: some View {
        VStack(spacing: 4) {
            Text(title).font(.footnote.weight(.semibold))
            if draft.mode == "next" {
                Text("\(Labels.lie(draft.fin)) · after shot \(draft.k + 1)").font(.system(size: 10)).foregroundColor(.secondary)
            }
            HStack(alignment: .lastTextBaseline, spacing: 2) {
                Text("\(Int(value))").font(.system(size: 46, weight: .bold, design: .rounded)).foregroundColor(.white)
                Text(unit).font(.footnote).foregroundColor(.secondary)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 4)
            .background(RoundedRectangle(cornerRadius: 12).fill(Theme.green.opacity(0.35)))
            HStack(spacing: 6) {
                Button("−10") { value = max(1, value - 10) }.buttonStyle(TileStyle(small: true))
                Button("+10") { value = min(999, value + 10) }.buttonStyle(TileStyle(small: true))
            }
            Text("Turn the Digital Crown").font(.system(size: 9)).foregroundColor(.secondary)
            BigButton(title: "Set \(Int(value)) \(unit)") { set() }
        }
        .padding(.horizontal, 4)
        .focusable()
        .digitalCrownRotation($value, from: 1, through: 999, by: 1, sensitivity: .medium, isContinuous: false, isHapticFeedbackEnabled: true)
        .onAppear { if !ready { value = Double(initial); ready = true } }
        .navigationTitle("Shot \(draft.k + 1)")
    }

    private func set() {
        var x = draft
        x.dist = Int(value)
        if x.mode == "set" {
            store.send(x.makeEvent(store))
            nav.pop(to: x.base)
        } else {
            nav.push(.confirm(x))
        }
    }
}

/// "Save this shot?" – a one-screen recap, then Save or Edit.
struct ConfirmScreen: View {
    let draft: ShotDraft
    @EnvironmentObject var store: WatchStore
    @EnvironmentObject var nav: Nav

    var body: some View {
        let rows = store.model.hole(draft.hole).rows
        let k = min(draft.k, max(0, rows.count - 1))
        let fromDist = rows.isEmpty ? nil : Rules.distOf(rows, k)
        let fromUnit = rows.isEmpty ? "yd" : Rules.unit(rows, k)
        let nextUnit = draft.fin == "green" ? "ft" : "yd"
        let holed = draft.fin == "in"
        let later = max(0, rows.count - 1 - k)
        ScrollView {
            VStack(alignment: .leading, spacing: 6) {
                Text("Save this shot?").font(.headline)
                VStack(alignment: .leading, spacing: 3) {
                    Text("SHOT \(k + 1)").font(.system(size: 9, weight: .bold)).foregroundColor(.secondary)
                    Text("\(k == 0 ? "Tee" : Labels.lie(rows[safe: k]?.loc ?? "")) → \(Labels.lie(draft.fin))").font(.footnote.weight(.bold))
                    if let d = fromDist ?? draft.dist, holed { line("Holed from", "\(draft.dist ?? d) \(fromUnit)") }
                    else if let d = fromDist { line("From", "\(d) \(fromUnit)") }
                    if let dir = draft.dir, !dir.isEmpty { line("Direction", Labels.dir(dir)) }
                    if let hz = draft.hz { line("Hazard", hz == "drop" ? "Drop +1" : (hz == "retee" ? "Re-tee +1" : "Played it")) }
                    if draft.fin == "ob" || draft.fin == "lost" || draft.fin == "unp" { line("Penalty", "+1") }
                    if let d = draft.dist, !holed { line("Next to pin", "\(d) \(nextUnit)") }
                    if holed && draft.edit && later > 0 { Text("Shots after this one are removed.").font(.system(size: 10)).foregroundColor(Theme.amber) }
                }
                .padding(8)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(RoundedRectangle(cornerRadius: 10).fill(Theme.tile))
                BigButton(title: "Save shot") {
                    store.send(draft.makeEvent(store))
                    nav.pop(to: draft.base)
                }
                Button("Edit") { nav.pop(to: draft.base) }.buttonStyle(TileStyle(small: true))
            }.padding(.horizontal, 4)
        }
        .navigationTitle("Shot \(k + 1)")
    }
    private func line(_ a: String, _ b: String) -> some View {
        HStack { Text(a).font(.system(size: 11)).foregroundColor(.secondary); Spacer(); Text(b).font(.system(size: 11, weight: .semibold)) }
    }
}

/// "Undo last shot?" – asks first; Keep it is the safe default.
struct UndoScreen: View {
    @EnvironmentObject var store: WatchStore
    @EnvironmentObject var nav: Nav
    var body: some View {
        ScrollView {
            VStack(spacing: 6) {
                Text("Undo last shot?").font(.headline)
                if let t = store.undoTarget() {
                    Text(t.text).font(.footnote).multilineTextAlignment(.center)
                        .padding(8).frame(maxWidth: .infinity)
                        .background(RoundedRectangle(cornerRadius: 10).fill(Theme.tile))
                    BigButton(title: "Undo shot", fill: Theme.red) {
                        store.send(store.makeEvent("undo", hole: t.hole))
                        nav.home()
                    }
                } else {
                    Text("Nothing to undo.").font(.footnote).foregroundColor(.secondary)
                }
                Button("Keep it") { nav.home() }.buttonStyle(TileStyle(small: true))
            }.padding(.horizontal, 4)
        }
    }
}

/// End the round's Golf workout from the watch (it also ends by itself when all 18 holes are done, or the phone discards the round).
struct EndRoundScreen: View {
    @EnvironmentObject var store: WatchStore
    @EnvironmentObject var nav: Nav
    @EnvironmentObject var workout: WorkoutManager
    var body: some View {
        ScrollView {
            VStack(spacing: 6) {
                if workout.running {
                    Text("End round?").font(.headline)
                    Text("Stops the Golf workout and saves it to Health. Your shots stay saved.")
                        .font(.footnote).foregroundColor(.secondary).multilineTextAlignment(.center)
                    BigButton(title: "End round", fill: Theme.red) { store.endWorkout(markEnded: true); nav.home() }
                } else {
                    Text("Start tracking?").font(.headline)
                    Text("Starts a Golf workout so StrokeWise stays on your wrist for the whole round.")
                        .font(.footnote).foregroundColor(.secondary).multilineTextAlignment(.center)
                    BigButton(title: "Start workout") { store.startWorkout(); nav.home() }
                }
                Button("Cancel") { nav.home() }.buttonStyle(TileStyle(small: true))
            }.padding(.horizontal, 4)
        }
    }
}
