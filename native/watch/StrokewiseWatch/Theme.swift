// StrokeWise watch – colours and small reusable pieces (green #0b5d1e, as in the mockups).
import SwiftUI

enum Theme {
    static let green = Color(red: 0.043, green: 0.365, blue: 0.118)
    static let greenBright = Color(red: 0.16, green: 0.62, blue: 0.27)
    static let tile = Color(white: 0.17)
    static let amber = Color(red: 0.95, green: 0.68, blue: 0.15)
    static let dim = Color(white: 0.62)            // secondary text (hole/par, thru)
    static let lieText = Color(white: 0.92)        // "from Green": light and readable, a little under the white of Shot N
    static let red = Color(red: 0.75, green: 0.18, blue: 0.16)

    /// "Shot 3" in white, or "Shot 3 (4)" with the playing-as number in red when a penalty has been incurred on the hole.
    static func shotNumber(_ shot: Int, playingAs: Int) -> Text {
        let base = Text("Shot \(shot)").foregroundColor(.white)
        guard playingAs != shot else { return base }
        return base + Text(" (\(playingAs))").foregroundColor(red)
    }
    /// Compact "3" or "3 (4)" for lists; only the playing-as number is red.
    static func shotIndex(_ shot: Int, playingAs: Int) -> Text {
        let base = Text("\(shot)")
        guard playingAs != shot else { return base }
        return base + Text(" (\(playingAs))").foregroundColor(red)
    }
}

/// "Press the Digital Crown to leave" – end screens. ~16pt / body, white, not the old 10pt dim caption.
struct CrownLeaveHint: View {
    var body: some View {
        Text("Press the Digital Crown to leave")
            .font(.system(size: 16, weight: .semibold))
            .foregroundColor(.white)
            .multilineTextAlignment(.center)
    }
}

struct TileStyle: ButtonStyle {
    var fill: Color = Theme.tile
    var small = false
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(small ? Font.footnote.weight(.semibold) : Font.body.weight(.semibold))
            .frame(maxWidth: .infinity, minHeight: small ? 34 : 44)
            .background(RoundedRectangle(cornerRadius: 12).fill(fill))
            .opacity(configuration.isPressed ? 0.7 : 1)
    }
}

struct BigButton: View {
    let title: String
    var fill: Color = Theme.green
    let action: () -> Void
    var body: some View {
        Button(action: action) { Text(title).frame(maxWidth: .infinity) }
            .buttonStyle(TileStyle(fill: fill))
    }
}

struct Banner: View {
    let text: String
    let detail: String
    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(text).font(.caption2.weight(.bold))
            Text(detail).font(.system(size: 10))
        }
        .foregroundColor(.black)
        .padding(6)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(RoundedRectangle(cornerRadius: 8).fill(Theme.amber))
    }
}
