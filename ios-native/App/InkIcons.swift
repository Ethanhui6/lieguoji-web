import SwiftUI

/// One hand-drawn line icon set for the whole chrome (bottom tabs and top buttons): the same round
/// brush line, the same 24-unit grid, motifs of the period — a gate tower for the state, crossed
/// halberds for the army, a sealed scroll for diplomacy, a bound book for the chronicle, a stepped
/// stand for rankings, layered hills for the map views, a command banner for the box order.
enum InkGlyph: String {
    case nation, military, diplomacy, chronicle, ranking, views, command, menu, close
    case sea, plain, mountain, raise, lower, smooth
}

struct InkIcon: View {
    let glyph: InkGlyph
    var size: CGFloat = 22
    var weight: CGFloat = 1.7
    var filled = false
    var body: some View {
        InkPath(glyph: glyph)
            .stroke(style: StrokeStyle(lineWidth: weight * size / 22, lineCap: .round, lineJoin: .round))
            .background { if filled { InkPath(glyph: glyph, fillOnly: true).fill(.tint.opacity(0.18)) } }
            .frame(width: size, height: size)
    }
}

struct InkPath: Shape {
    let glyph: InkGlyph
    var fillOnly = false
    func path(in rect: CGRect) -> Path {
        let k = min(rect.width, rect.height) / 24
        func pt(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: rect.minX + x * k, y: rect.minY + y * k) }
        var p = Path()
        switch glyph {
        case .sea:
            for y in [CGFloat(7), 12, 17] {
                p.move(to: pt(3, y)); p.addCurve(to: pt(21, y), control1: pt(9, y - 5), control2: pt(15, y + 5))
            }
        case .plain:
            p.move(to: pt(3, 18)); p.addQuadCurve(to: pt(21, 18), control: pt(12, 14))
            p.move(to: pt(8, 16)); p.addLine(to: pt(8, 8)); p.move(to: pt(8, 12)); p.addLine(to: pt(5, 9))
            p.move(to: pt(8, 10)); p.addLine(to: pt(11, 7))
            p.move(to: pt(15, 16)); p.addLine(to: pt(15, 10)); p.addLine(to: pt(18, 7))
        case .mountain:
            p.move(to: pt(2, 20)); p.addLine(to: pt(10, 4)); p.addLine(to: pt(18, 20)); p.closeSubpath()
            p.move(to: pt(7, 10)); p.addLine(to: pt(10, 12)); p.addLine(to: pt(13, 10))
            p.move(to: pt(15, 14)); p.addLine(to: pt(18, 9)); p.addLine(to: pt(23, 20)); p.addLine(to: pt(18, 20))
        case .raise, .lower:
            let up = glyph == .raise
            p.move(to: pt(4, 20)); p.addLine(to: pt(20, 20))
            p.move(to: pt(12, 4)); p.addLine(to: pt(12, 16))
            let tip: CGFloat = up ? 4 : 16, base: CGFloat = up ? 9 : 11
            p.move(to: pt(7, base)); p.addLine(to: pt(12, tip)); p.addLine(to: pt(17, base))
        case .smooth:
            p.move(to: pt(3, 7)); p.addLine(to: pt(7, 4)); p.addLine(to: pt(12, 9)); p.addLine(to: pt(17, 5)); p.addLine(to: pt(21, 7))
            p.move(to: pt(3, 17)); p.addCurve(to: pt(21, 17), control1: pt(9, 12), control2: pt(15, 12))
        case .nation:
            // Gate tower: a sweeping roof, the hall, the gate arch and the wall.
            p.move(to: pt(3, 9)); p.addQuadCurve(to: pt(12, 4), control: pt(8, 8)); p.addQuadCurve(to: pt(21, 9), control: pt(16, 8))
            p.move(to: pt(6, 9)); p.addLine(to: pt(6, 13)); p.addLine(to: pt(18, 13)); p.addLine(to: pt(18, 9))
            p.move(to: pt(3, 20)); p.addLine(to: pt(3, 13)); p.addLine(to: pt(21, 13)); p.addLine(to: pt(21, 20)); p.addLine(to: pt(3, 20))
            p.move(to: pt(9.5, 20)); p.addLine(to: pt(9.5, 17)); p.addQuadCurve(to: pt(14.5, 17), control: pt(12, 14)); p.addLine(to: pt(14.5, 20))
        case .military:
            // Crossed halberds over a shield line.
            p.move(to: pt(4, 20)); p.addLine(to: pt(18, 6)); p.move(to: pt(20, 20)); p.addLine(to: pt(6, 6))
            p.move(to: pt(15, 4)); p.addQuadCurve(to: pt(20, 9), control: pt(20, 4)); p.addLine(to: pt(18, 6))
            p.move(to: pt(9, 4)); p.addQuadCurve(to: pt(4, 9), control: pt(4, 4)); p.addLine(to: pt(6, 6))
            p.move(to: pt(9, 15)); p.addLine(to: pt(15, 15))
        case .diplomacy:
            // A scroll rolled at both ends, tied with a sealed cord.
            p.addRoundedRect(in: CGRect(origin: pt(5, 4), size: CGSize(width: 14 * k, height: 16 * k)), cornerSize: CGSize(width: 2 * k, height: 2 * k))
            p.move(to: pt(3, 4)); p.addLine(to: pt(21, 4)); p.move(to: pt(3, 20)); p.addLine(to: pt(21, 20))
            p.move(to: pt(8, 9)); p.addLine(to: pt(16, 9)); p.move(to: pt(8, 12)); p.addLine(to: pt(13, 12))
            p.addEllipse(in: CGRect(origin: pt(13, 13.5), size: CGSize(width: 4 * k, height: 4 * k)))
        case .chronicle:
            // A thread-bound book: cover, spine stitches, a title slip.
            p.addRoundedRect(in: CGRect(origin: pt(5, 3), size: CGSize(width: 15 * k, height: 18 * k)), cornerSize: CGSize(width: 1.5 * k, height: 1.5 * k))
            for y in [6.0, 10.5, 15.0, 19.0] { p.move(to: pt(5, CGFloat(y))); p.addLine(to: pt(8, CGFloat(y))) }
            p.move(to: pt(8, 3)); p.addLine(to: pt(8, 21))
            p.addRect(CGRect(origin: pt(12, 6), size: CGSize(width: 4 * k, height: 9 * k)))
        case .ranking:
            // A stepped stand: second, first, third.
            p.move(to: pt(3, 20)); p.addLine(to: pt(21, 20))
            p.addRect(CGRect(origin: pt(4, 12), size: CGSize(width: 5 * k, height: 8 * k)))
            p.addRect(CGRect(origin: pt(9.5, 7), size: CGSize(width: 5 * k, height: 13 * k)))
            p.addRect(CGRect(origin: pt(15, 14), size: CGSize(width: 5 * k, height: 6 * k)))
            p.move(to: pt(12, 2.5)); p.addLine(to: pt(12, 4.5))
        case .views:
            // Layered hills under a sun: the map's faces.
            p.move(to: pt(2, 19)); p.addQuadCurve(to: pt(10, 9), control: pt(6, 9)); p.addQuadCurve(to: pt(16, 15), control: pt(13, 10))
            p.move(to: pt(11, 19)); p.addQuadCurve(to: pt(17, 12), control: pt(14, 12)); p.addQuadCurve(to: pt(22, 19), control: pt(20, 12))
            p.move(to: pt(2, 19)); p.addLine(to: pt(22, 19))
            p.addEllipse(in: CGRect(origin: pt(16, 3), size: CGSize(width: 4 * k, height: 4 * k)))
        case .command:
            // A command banner on its pole over a dashed field.
            p.move(to: pt(7, 21)); p.addLine(to: pt(7, 3))
            p.move(to: pt(7, 4)); p.addLine(to: pt(18, 4)); p.addLine(to: pt(15, 7.5)); p.addLine(to: pt(18, 11)); p.addLine(to: pt(7, 11))
            for x in stride(from: 3.0, to: 22.0, by: 4.0) { p.move(to: pt(CGFloat(x), 21)); p.addLine(to: pt(CGFloat(x) + 2, 21)) }
        case .menu:
            p.move(to: pt(5, 7)); p.addLine(to: pt(19, 7)); p.move(to: pt(5, 12)); p.addLine(to: pt(16, 12)); p.move(to: pt(5, 17)); p.addLine(to: pt(19, 17))
        case .close:
            p.move(to: pt(6, 6)); p.addLine(to: pt(18, 18)); p.move(to: pt(18, 6)); p.addLine(to: pt(6, 18))
        }
        return fillOnly ? Path(p.boundingRect) : p
    }
}

/// Gameplay symbols share the navigation glyphs; utility actions keep familiar system symbols.
struct GameActionLabel: View {
    let title: String
    let symbol: String
    private var glyph: InkGlyph? {
        switch symbol {
        case "flag.2.crossed": return .military
        case "map", "mountain.2": return .views
        case "doc.text", "scroll", "scroll.fill": return .diplomacy
        case "flag", "flag.fill": return .command
        default: return nil
        }
    }
    var body: some View {
        HStack(spacing: 8) {
            Group {
                if let glyph { InkIcon(glyph: glyph, size: 20) }
                else { Image(systemName: symbol).font(.system(size: 18, weight: .medium)) }
            }.frame(width: 22, height: 22).accessibilityHidden(true)
            Text(title).multilineTextAlignment(.center).fixedSize(horizontal: false, vertical: true)
        }
    }
}
