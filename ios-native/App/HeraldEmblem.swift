import SwiftUI

/// 大事传报的图：几笔毛笔线条在纸上画出这件事，不用文字印章。
/// 宣战＝两戟相交、议和＝两笔合成一圆、攻克＝旗插城头、起义＝三簇火焰、复辟＝旭日复升、
/// 绝嗣＝烛火熄灭、迁都＝城门与前行的箭头。笔画 0.6 秒内依次画出，与地图事件图同一节奏。
struct HeraldEmblem: View {
    let kind: GameModel.Herald.Kind
    let color: Color
    var size: CGFloat = 44
    @State private var drawn: CGFloat = 0
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        ZStack {
            // 淡墨底：一团洇开的颜色。
            Circle().fill(RadialGradient(colors: [color.opacity(0.22), color.opacity(0)], center: .center, startRadius: 0, endRadius: size * 0.55))
                .scaleEffect(0.6 + 0.5 * drawn)
            ForEach(Array(strokes.enumerated()), id: \.offset) { i, s in
                let begin = CGFloat(i) / CGFloat(max(1, strokes.count)) * 0.5
                s.path.trim(from: 0, to: max(0, min(1, (drawn - begin) / 0.5)))
                    .stroke(s.ink ? Theme.ink.opacity(0.85) : color, style: StrokeStyle(lineWidth: s.width * size / 44, lineCap: .round, lineJoin: .round))
            }
        }
        .frame(width: size, height: size)
        .onAppear { withAnimation(reduceMotion ? nil : .easeOut(duration: 0.6)) { drawn = 1 } }

    }

    private struct Stroke { let path: Path; var width: CGFloat = 2.6; var ink = false }
    /// 笔画在 44×44 的格子里按 size 缩放。
    private var strokes: [Stroke] {
        let k = size / 44
        func p(_ build: (inout Path) -> Void) -> Path { var path = Path(); build(&path); return path.applying(CGAffineTransform(scaleX: k, y: k)) }
        func line(_ a: CGPoint, _ b: CGPoint) -> Path { p { $0.move(to: a); $0.addLine(to: b) } }
        switch kind {
        case .war:
            return [Stroke(path: line(CGPoint(x: 8, y: 36), CGPoint(x: 36, y: 8)), width: 3), Stroke(path: line(CGPoint(x: 36, y: 36), CGPoint(x: 8, y: 8)), width: 3),
                    Stroke(path: p { $0.move(to: CGPoint(x: 30, y: 8)); $0.addLine(to: CGPoint(x: 39, y: 5)); $0.move(to: CGPoint(x: 14, y: 8)); $0.addLine(to: CGPoint(x: 5, y: 5)) }, width: 3)]
        case .peace:
            return [Stroke(path: p { $0.addArc(center: CGPoint(x: 22, y: 22), radius: 14, startAngle: .degrees(200), endAngle: .degrees(20), clockwise: false) }, width: 3),
                    Stroke(path: p { $0.addArc(center: CGPoint(x: 22, y: 22), radius: 14, startAngle: .degrees(20), endAngle: .degrees(200), clockwise: false) }, width: 3)]
        case .capture:
            return [Stroke(path: p { $0.move(to: CGPoint(x: 6, y: 38)); $0.addLine(to: CGPoint(x: 6, y: 30)); $0.addLine(to: CGPoint(x: 38, y: 30)); $0.addLine(to: CGPoint(x: 38, y: 38))
                        for x in stride(from: 6.0, through: 38, by: 8) { $0.move(to: CGPoint(x: x, y: 30)); $0.addLine(to: CGPoint(x: x, y: 26)) } }, width: 2.2, ink: true),
                    Stroke(path: line(CGPoint(x: 22, y: 26), CGPoint(x: 22, y: 5)), width: 2.4, ink: true),
                    Stroke(path: p { $0.move(to: CGPoint(x: 23, y: 6)); $0.addQuadCurve(to: CGPoint(x: 37, y: 10), control: CGPoint(x: 30, y: 3)); $0.addQuadCurve(to: CGPoint(x: 23, y: 16), control: CGPoint(x: 30, y: 15)); $0.closeSubpath() }, width: 3)]
        case .uprising:
            return [10.0, 22, 34].map { x in Stroke(path: p { $0.move(to: CGPoint(x: x, y: 38)); $0.addQuadCurve(to: CGPoint(x: x, y: 10), control: CGPoint(x: x + 9, y: 24)); $0.addQuadCurve(to: CGPoint(x: x - 3, y: 30), control: CGPoint(x: x - 7, y: 18)) }, width: 2.6) }
        case .restoration:
            return [Stroke(path: line(CGPoint(x: 4, y: 32), CGPoint(x: 40, y: 32)), width: 2.2, ink: true),
                    Stroke(path: p { $0.addArc(center: CGPoint(x: 22, y: 32), radius: 11, startAngle: .degrees(180), endAngle: .degrees(360), clockwise: false) }, width: 3),
                    Stroke(path: p { for a in stride(from: 200.0, through: 340, by: 35) { let r = a * .pi / 180; $0.move(to: CGPoint(x: 22 + cos(r) * 15, y: 32 + sin(r) * 15)); $0.addLine(to: CGPoint(x: 22 + cos(r) * 21, y: 32 + sin(r) * 21)) } }, width: 2.2)]
        case .extinction:
            return [Stroke(path: p { $0.addRect(CGRect(x: 17, y: 20, width: 10, height: 18)) }, width: 2.2, ink: true),
                    Stroke(path: p { $0.move(to: CGPoint(x: 22, y: 20)); $0.addQuadCurve(to: CGPoint(x: 26, y: 6), control: CGPoint(x: 16, y: 12)); $0.addQuadCurve(to: CGPoint(x: 30, y: 2), control: CGPoint(x: 32, y: 6)) }, width: 1.8, ink: true)]
        case .capital:
            return [Stroke(path: p { $0.move(to: CGPoint(x: 6, y: 38)); $0.addLine(to: CGPoint(x: 6, y: 14)); $0.addLine(to: CGPoint(x: 22, y: 6)); $0.addLine(to: CGPoint(x: 38, y: 14)); $0.addLine(to: CGPoint(x: 38, y: 38))
                        $0.move(to: CGPoint(x: 16, y: 38)); $0.addLine(to: CGPoint(x: 16, y: 24)); $0.addLine(to: CGPoint(x: 28, y: 24)); $0.addLine(to: CGPoint(x: 28, y: 38)) }, width: 2.2, ink: true),
                    Stroke(path: p { $0.move(to: CGPoint(x: 2, y: 42)); $0.addLine(to: CGPoint(x: 42, y: 42)); $0.move(to: CGPoint(x: 36, y: 38)); $0.addLine(to: CGPoint(x: 42, y: 42)); $0.addLine(to: CGPoint(x: 36, y: 46)) }, width: 2.6)]
        }
    }
}
