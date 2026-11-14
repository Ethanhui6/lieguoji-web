import SwiftUI
import LieguojiCore

/// Chips that wrap onto as many lines as they need: a state's colour, its name and an optional note.
struct FlowChips: View {
    let items: [(Int, String, Color, String?)]
    var tap: (Int) -> Void = { _ in }
    var body: some View {
        WrapLayout(spacing: 6) {
            ForEach(Array(items.enumerated()), id: \.offset) { _, it in
                Button { tap(it.0) } label: {
                    HStack(spacing: 5) {
                        RoundedRectangle(cornerRadius: 3).fill(it.2).frame(width: 11, height: 11)
                        Text(it.1).font(Theme.kai(14)).foregroundStyle(Theme.ink).lineLimit(1)
                        if let note = it.3 { Text(note).font(Theme.kai(11)).foregroundStyle(Theme.ink2) }
                    }
                    .padding(.horizontal, 9).frame(height: 28)
                    .background(Theme.paper2, in: Capsule())
                    .overlay(Capsule().stroke(it.2.opacity(0.55)))
                }
                .buttonStyle(PressStyle())
            }
        }
    }
}

/// Lays its children left to right, wrapping to a new line when the width runs out.
struct WrapLayout: Layout {
    var spacing: CGFloat = 6
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, line: CGFloat = 0, widest: CGFloat = 0
        for v in subviews {
            let s = v.sizeThatFits(.unspecified)
            if x > 0 && x + s.width > width { y += line + spacing; x = 0; line = 0 }
            x += s.width + spacing; line = max(line, s.height); widest = max(widest, x - spacing)
        }
        return CGSize(width: proposal.width ?? widest, height: y + line)
    }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, line: CGFloat = 0
        for v in subviews {
            let s = v.sizeThatFits(.unspecified)
            if x > bounds.minX && x + s.width > bounds.maxX { y += line + spacing; x = bounds.minX; line = 0 }
            v.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(s))
            x += s.width + spacing; line = max(line, s.height)
        }
    }
}
