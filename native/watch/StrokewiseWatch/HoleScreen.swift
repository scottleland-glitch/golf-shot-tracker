// StrokeWise watch – the main screen: which hole and shot you are on, the four big lies, More, In the hole. Swipe right = finished holes.
import SwiftUI

/// The six lie tiles (Fairway, Rough, Green, Bunker, More, In the hole) – used on the hole screen and when editing a shot.
struct LieGrid: View {
    let draft: ShotDraft
    @EnvironmentObject var store: WatchStore
    @EnvironmentObject var nav: Nav

    var body: some View {
        LazyVGrid(columns: [GridItem(.flexible(), spacing: 6), GridItem(.flexible(), spacing: 6)], spacing: 6) {
            tile("Fairway", "fairway")
            tile("Rough", "rough")
            tile("Green", "green")
            tile("Bunker", "bunker")
            Button("More") { nav.push(.moreLies(draft)) }.buttonStyle(TileStyle())
            Button("In the hole") { pickLie("in", draft: draft, store: store, nav: nav) }.buttonStyle(TileStyle(fill: Theme.green))
        }
    }
    private func tile(_ title: String, _ fin: String) -> some View {
        Button(title) { pickLie(fin, draft: draft, store: store, nav: nav) }.buttonStyle(TileStyle())
    }
}

struct HoleScreen: View {
    @EnvironmentObject var store: WatchStore
    @EnvironmentObject var nav: Nav
    @EnvironmentObject var workout: WorkoutManager

    var body: some View {
        ScrollView {
            VStack(spacing: 6) {
                if store.pendingCount > 0 && !store.reachable {
                    Banner(text: "\(store.pendingCount) shot\(store.pendingCount == 1 ? "" : "s") queued",
                           detail: "Phone out of range. They sync when it's back.")
                }
                if !store.hasRound {
                    noRound
                } else if let j = store.justFinished {
                    HoleFinishedView(hole: j)
                } else if store.model.roundOver {
                    roundComplete
                } else {
                    shotView
                }
                footer
            }
            .padding(.horizontal, 4)
        }
        .navigationTitle(store.hasRound && !(store.state?.course ?? "").isEmpty ? (store.state?.course ?? "StrokeWise") : "StrokeWise")
        .simultaneousGesture(
            DragGesture(minimumDistance: 24).onEnded { v in
                if v.translation.width > 50 && abs(v.translation.height) < 40 { nav.push(.holes) }   // swipe right: finished holes
            }
        )
    }

    private var noRound: some View {
        VStack(spacing: 6) {
            Image(systemName: "figure.golf").font(.title2).foregroundColor(Theme.greenBright)
            Text("No round yet").font(.headline)
            Text("Start a round in StrokeWise on your iPhone. It shows up here by itself.")
                .font(.footnote).foregroundColor(.secondary).multilineTextAlignment(.center)
        }.padding(.top, 8)
    }

    private var roundComplete: some View {
        VStack(spacing: 6) {
            Image(systemName: "flag.checkered").font(.title2).foregroundColor(Theme.greenBright)
            Text("Round complete").font(.headline)
            Text("\(store.model.strokesDone) (\(Labels.toPar(store.model.strokesDone - store.model.parDone)))").font(.title3.bold())
            Text(workout.running ? "Ending the workout…" : "Workout saved to Health").font(.footnote).foregroundColor(.secondary)
        }.padding(.top, 8)
    }

    private var shotView: some View {
        let m = store.model
        let c = m.currentHole
        let h = m.hole(c)
        let k = max(0, h.rows.count - 1)
        let row = h.rows[safe: k] ?? Row(loc: "tee")
        let dist = h.rows.isEmpty ? nil : Rules.distOf(h.rows, k)
        let unit = h.rows.isEmpty ? "yd" : Rules.unit(h.rows, k)
        let draft = ShotDraft(hole: c, k: k, edit: false, base: 0)
        return VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 0) {
                    Text("Hole \(c + 1)").font(.title2.bold())
                    if let d = dist {
                        Text("\(d) \(unit) to pin").font(.footnote.weight(.semibold))
                    } else {
                        Button("Set distance") {
                            var d0 = draft; d0.mode = "set"; d0.edit = false; d0.base = 0
                            nav.push(.distance(d0))
                        }.buttonStyle(TileStyle(fill: Theme.amber, small: true)).foregroundColor(.black)
                    }
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 0) {
                    Text("Par \(h.par)").font(.caption.weight(.bold))
                        .padding(.horizontal, 6).padding(.vertical, 2)
                        .background(Capsule().fill(Theme.tile))
                    Text("Shot \(k + 1) · \(k == 0 ? "Tee" : Labels.lie(row.loc))").font(.system(size: 10)).foregroundColor(.secondary)
                    if m.holesDone > 0 {
                        Text("Thru \(m.holesDone): \(m.strokesDone) (\(Labels.toPar(m.strokesDone - m.parDone)))")
                            .font(.system(size: 10)).foregroundColor(.secondary)
                    }
                }
            }
            Text("Where did it finish?").font(.footnote).foregroundColor(.secondary)
            LieGrid(draft: draft)
        }
    }

    private var footer: some View {
        VStack(spacing: 6) {
            if store.hasRound, store.undoTarget() != nil {
                Button("Undo last shot") { nav.push(.undo) }.buttonStyle(TileStyle(small: true))
            }
            if store.hasRound {
                HStack(spacing: 4) {
                    Circle().fill(workout.running ? Theme.greenBright : Color.gray).frame(width: 6, height: 6)
                    Text(workout.running ? "Round tracking on" : (workout.note.isEmpty ? "Workout off" : workout.note))
                        .font(.system(size: 10)).foregroundColor(.secondary)
                }
                Button(workout.running ? "End round" : "Start workout") { nav.push(.endRound) }
                    .buttonStyle(TileStyle(small: true))
            }
        }.padding(.top, 4)
    }
}

/// Shown after "In the hole": the hole's score, then it moves on to the next hole by itself.
struct HoleFinishedView: View {
    let hole: Int
    @EnvironmentObject var store: WatchStore
    @EnvironmentObject var nav: Nav
    @State private var progress = 0.0

    var body: some View {
        let h = store.model.hole(hole)
        let m = store.model
        VStack(spacing: 4) {
            Image(systemName: "flag.fill").foregroundColor(Theme.greenBright)
            Text("HOLE \(hole + 1) · IN THE HOLE").font(.system(size: 10, weight: .bold)).foregroundColor(Theme.greenBright)
            Text("\(h.strokes)").font(.system(size: 44, weight: .bold, design: .rounded))
            Text(Labels.scoreName(h.strokes, par: h.par)).font(.footnote.weight(.semibold))
            Text("Thru \(m.holesDone): \(m.strokesDone) (\(Labels.toPar(m.strokesDone - m.parDone)))").font(.system(size: 10)).foregroundColor(.secondary)
            if !m.roundOver {
                let nh = m.hole(m.currentHole)
                VStack(spacing: 3) {
                    Text("Next: Hole \(m.currentHole + 1) · Par \(nh.par)\(nh.rows.first?.dist.map { " · \($0) yd" } ?? "")").font(.system(size: 10))
                    ProgressView(value: progress).tint(Theme.greenBright)
                }
                .padding(6).background(RoundedRectangle(cornerRadius: 8).fill(Theme.tile))
            }
            HStack(spacing: 6) {
                Button("Undo") { undo() }.buttonStyle(TileStyle(fill: Theme.red, small: true))
                Button(m.roundOver ? "Done" : "Next") { store.dismissFinished() }.buttonStyle(TileStyle(fill: Theme.green, small: true))
            }
        }
        .onAppear { withAnimation(.linear(duration: 6)) { progress = 1 } }
        .task(id: hole) {
            try? await Task.sleep(nanoseconds: 6_000_000_000)
            if store.justFinished == hole { store.dismissFinished() }
        }
    }
    private func undo() {
        if let t = store.undoTarget() { store.send(store.makeEvent("undo", hole: t.hole)) }
        store.dismissFinished()
        nav.home()
    }
}
