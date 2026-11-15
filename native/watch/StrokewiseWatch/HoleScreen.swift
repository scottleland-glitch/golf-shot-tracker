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
        .navigationTitle(screenTitle)
        .simultaneousGesture(
            DragGesture(minimumDistance: 24).onEnded { v in
                if v.translation.width > 50 && abs(v.translation.height) < 40 { nav.push(.holes) }   // swipe right: finished holes
            }
        )
    }

    private var screenTitle: String {
        // with a round showing, the course is the small green label in the content instead (shotView)
        return store.hasRound ? "" : "StrokeWise"
    }

    private var noRound: some View {
        VStack(spacing: 6) {
            Image(systemName: "figure.golf").font(.title2).foregroundColor(Theme.greenBright)
            Text("No round yet").font(.headline)
            Text("Start a round in StrokeWise on your iPhone. It shows up here by itself.")
                .font(.footnote).foregroundColor(.secondary).multilineTextAlignment(.center)
            Button("Check phone") { Connectivity.shared.refresh() }.buttonStyle(TileStyle(small: true))
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
        let lieText = k == 0 ? "Tee" : Labels.lie(row.loc)
        let course = store.state?.course ?? ""
        return VStack(alignment: .leading, spacing: 4) {
            // 1. the course: a tiny green label (it used to be the screen title)
            if !course.isEmpty {
                HStack(spacing: 4) {
                    Circle().fill(Theme.greenBright).frame(width: 5, height: 5)
                    Text(course.uppercased()).font(.system(size: 9, weight: .bold)).foregroundColor(Theme.greenBright)
                        .lineLimit(1).minimumScaleFactor(0.6)
                }
            }
            // 2. hole and par: one small line
            Text("Hole \(c + 1) · Par \(h.par)").font(.system(size: 12, weight: .semibold)).foregroundColor(Theme.dim)
                .lineLimit(1).minimumScaleFactor(0.7)
            // 3. the hero: "Shot 2" big, bold, white – "from Green" beside it on the same line (both shrink before they wrap or cut off)
            HStack(alignment: .firstTextBaseline, spacing: 6) {
                Text("Shot \(k + 1)").font(.system(size: 30, weight: .heavy, design: .rounded)).foregroundColor(.white)
                    .lineLimit(1).minimumScaleFactor(0.6).layoutPriority(1)
                Text("from \(lieText)").font(.system(size: 17, weight: .semibold)).foregroundColor(Theme.lieText)
                    .lineLimit(1).minimumScaleFactor(0.5)
            }
            // 4. distance and score so far: secondary, one line
            if let d = dist {
                HStack(spacing: 4) {
                    Text("\(d) \(unit) to pin").font(.system(size: 12, weight: .semibold)).foregroundColor(.white)
                        .lineLimit(1).minimumScaleFactor(0.7)
                    Spacer(minLength: 2)
                    thruText(m)
                }
            } else {
                Button("Set distance") {
                    var d0 = draft; d0.mode = "set"; d0.edit = false; d0.base = 0
                    nav.push(.distance(d0))
                }.buttonStyle(TileStyle(fill: Theme.amber, small: true)).foregroundColor(.black)
                HStack { Spacer(minLength: 0); thruText(m) }
            }
            Text("Where did it finish?").font(.footnote).foregroundColor(.secondary)
            LieGrid(draft: draft)
        }
    }

    /// "Thru 2: 8 (E)" – small and muted; nothing before the first finished hole.
    @ViewBuilder private func thruText(_ m: RoundModel) -> some View {
        if m.holesDone > 0 {
            Text("Thru \(m.holesDone): \(m.strokesDone) (\(Labels.toPar(m.strokesDone - m.parDone)))")
                .font(.system(size: 11, weight: .medium)).foregroundColor(Theme.dim)
                .lineLimit(1).minimumScaleFactor(0.6)
        }
    }

    /// Always visible: is the iPhone link up, and when did the phone last send a picture of the round.
    private var linkLine: some View {
        VStack(spacing: 1) {
            HStack(spacing: 4) {
                Circle().fill(store.reachable ? Theme.greenBright : Color.gray).frame(width: 6, height: 6)
                Text(store.linkSummary).font(.system(size: 10)).foregroundColor(.secondary)
            }
            if let d = store.lastPhoneAt {
                HStack(spacing: 3) {
                    Text("Last update from phone").font(.system(size: 9)).foregroundColor(.secondary)
                    Text(d, style: .time).font(.system(size: 9)).foregroundColor(.secondary)
                }
            } else {
                Text("Nothing received from the phone yet").font(.system(size: 9)).foregroundColor(.secondary)
            }
        }
    }

    private var footer: some View {
        VStack(spacing: 6) {
            linkLine
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
                VStack(spacing: 3) {
                    Text(nextLine(m)).font(.system(size: 10))
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
    private func nextLine(_ m: RoundModel) -> String {
        let nh = m.hole(m.currentHole)
        var s = "Next: Hole \(m.currentHole + 1) · Par \(nh.par)"
        if let first = nh.rows.first, let d = first.dist { s += " · \(d) yd" }
        return s
    }
    private func undo() {
        if let t = store.undoTarget() { store.send(store.makeEvent("undo", hole: t.hole)) }
        store.dismissFinished()
        nav.home()
    }
}
