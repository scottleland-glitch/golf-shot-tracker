// StrokeWise watch – swipe right from the hole screen: the finished holes as a vertical list (scroll with the Digital Crown);
// tap a hole to see its shots, and tap a shot to change it, delete it, or add a shot after it.
import SwiftUI

struct HolesScreen: View {
    @EnvironmentObject var store: WatchStore
    var body: some View {
        let done = store.model.holes.values.filter { $0.fin }.sorted { $0.i < $1.i }
        List {
            if done.isEmpty {
                Text("No finished holes yet.").font(.footnote).foregroundColor(.secondary)
            }
            ForEach(done, id: \.i) { h in
                NavigationLink(value: Route.holeEdit(h.i)) {
                    HStack {
                        Text("\(h.i + 1)").font(.headline).frame(width: 26, alignment: .leading)
                        Text("Par \(h.par)").font(.footnote).foregroundColor(.secondary)
                        Spacer()
                        Text(Labels.score(h)).font(.footnote.weight(.semibold))
                    }
                }
            }
        }
        .navigationTitle("Holes")
    }
}

struct HoleEditScreen: View {
    let hole: Int
    @EnvironmentObject var store: WatchStore
    @EnvironmentObject var nav: Nav
    var body: some View {
        let h = store.model.hole(hole)
        List {
            Text("Hole \(hole + 1) · Par \(h.par) · \(Labels.score(h))").font(.footnote.weight(.semibold))
            ForEach(Array(h.rows.indices), id: \.self) { k in
                NavigationLink(value: Route.shotEdit(hole: hole, k: k)) {
                    VStack(alignment: .leading, spacing: 1) {
                        (Theme.shotIndex(k + 1, playingAs: Rules.playingAs(h.rows, k))
                            + Text("  \(k == 0 ? "Tee" : Labels.lie(h.rows[k].loc))\(distText(h.rows, k))"))
                            .font(.footnote.weight(.semibold))
                        Text("→ \(Labels.outcome(h.rows, k))").font(.system(size: 11)).foregroundColor(.secondary)
                    }
                }
            }
            Button("Change tee distance") {
                nav.push(.distance(ShotDraft(hole: hole, k: 0, edit: true, base: nav.path.count, fin: "", dir: nil, hz: nil, dist: nil, mode: "set")))
            }
        }
        .navigationTitle("Hole \(hole + 1)")
    }
    private func distText(_ rows: [Row], _ k: Int) -> String {
        guard let d = Rules.distOf(rows, k) else { return "" }
        return " · \(d) \(Rules.unit(rows, k))"
    }
}

struct ShotEditScreen: View {
    let hole: Int
    let k: Int
    @EnvironmentObject var store: WatchStore
    @EnvironmentObject var nav: Nav
    @State private var confirmDelete = false

    var body: some View {
        let h = store.model.hole(hole)
        ScrollView {
            VStack(spacing: 6) {
                if k < h.rows.count {
                    Theme.shotNumber(k + 1, playingAs: Rules.playingAs(h.rows, k)).font(.headline)
                    Text("\(k == 0 ? "Tee" : Labels.lie(h.rows[k].loc)) → \(Labels.outcome(h.rows, k))")
                        .font(.footnote).multilineTextAlignment(.center)
                        .padding(8).frame(maxWidth: .infinity)
                        .background(RoundedRectangle(cornerRadius: 10).fill(Theme.tile))
                    BigButton(title: "Change this shot") {
                        nav.push(.lie(ShotDraft(hole: hole, k: k, edit: true, base: nav.path.count)))
                    }
                    Button("Add a shot after") {
                        store.send(store.makeEvent("insert", hole: hole, k: k, edit: true))
                        nav.push(.lie(ShotDraft(hole: hole, k: k, edit: true, base: nav.path.count)))
                    }.buttonStyle(TileStyle(small: true))
                    if k > 0 {
                        Button("Delete this shot") { confirmDelete = true }.buttonStyle(TileStyle(fill: Theme.red, small: true))
                    }
                } else {
                    Text("That shot is gone.").font(.footnote).foregroundColor(.secondary)
                }
            }.padding(.horizontal, 4)
        }
        .navigationTitle("Hole \(hole + 1)")
        .confirmationDialog("Delete shot \(k + 1)?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Delete shot", role: .destructive) {
                store.send(store.makeEvent("delete", hole: hole, k: k, edit: true))
                nav.pop(to: max(0, nav.path.count - 1))
            }
            Button("Keep it", role: .cancel) {}
        }
    }
}
