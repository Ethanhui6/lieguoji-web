import CoreGraphics
import UIKit
import LieguojiCore

/// The army figures, drawn once in white on clear (the map tints them with the state's colour and
/// rims them with ink): a foot soldier with a sword, a spearman, a shield-bearer, an archer, a
/// crossbowman, a rider, an armoured lancer, a horse archer, a plumed guardsman, a war elephant,
/// and the commander's banner. Small figures in the spirit of the original's pieces, finer drawn.
enum UnitArt {
    static let size = 128
    private static var cache = [String: CGImage]()

    static func role(_ unit: String) -> String {
        if unit == "Fleet" || unit == "Port" || unit == "Banner" { return unit }
        return UnitKinds.byKey[unit]?.role.rawValue ?? "infantry"
    }
    /// Horse and elephant figures are wider than tall.
    static func wide(_ unit: String) -> Bool { ["cavalry", "heavy", "horseArcher", "elephant"].contains(role(unit)) }

    static func image(_ unit: String) -> CGImage? {
        let key = role(unit)
        if let c = cache[key] { return c }
        // A plain 8-bit RGBA bitmap (the image renderer may pick a wide-colour format that the
        // Metal texture loader refuses, and then no army was drawn at all).
        guard let g = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: size * 4,
                                space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
        g.translateBy(x: 0, y: CGFloat(size)); g.scaleBy(x: 1, y: -1)   // drawn top-down, like UIKit
        g.setFillColor(red: 1, green: 1, blue: 1, alpha: 1); g.setStrokeColor(red: 1, green: 1, blue: 1, alpha: 1)
        g.setLineCap(.round); g.setLineJoin(.round)
        draw(key, g)
        guard let cg = g.makeImage() else { return nil }
        cache[key] = cg
        return cg
    }

    // Shapes in a 128 grid, the figure facing right, feet on y ≈ 112.
    private static func soldier(_ g: CGContext, x: CGFloat = 54, helmet: Bool = false, plume: Bool = false) {
        g.fillEllipse(in: CGRect(x: x - 10, y: 18, width: 20, height: 20))                       // head
        if helmet { g.fill(CGRect(x: x - 12, y: 16, width: 24, height: 9)) }
        if plume { g.move(to: CGPoint(x: x, y: 16)); g.addQuadCurve(to: CGPoint(x: x - 20, y: 8), control: CGPoint(x: x - 6, y: 2)); g.setLineWidth(6); g.strokePath() }
        let body = CGMutablePath()                                                                   // tunic
        body.move(to: CGPoint(x: x - 14, y: 42)); body.addLine(to: CGPoint(x: x + 14, y: 42))
        body.addLine(to: CGPoint(x: x + 18, y: 82)); body.addLine(to: CGPoint(x: x - 18, y: 82)); body.closeSubpath()
        g.addPath(body); g.fillPath()
        g.setLineWidth(9)                                                                            // legs
        g.move(to: CGPoint(x: x - 8, y: 80)); g.addLine(to: CGPoint(x: x - 14, y: 112))
        g.move(to: CGPoint(x: x + 8, y: 80)); g.addLine(to: CGPoint(x: x + 16, y: 112)); g.strokePath()
    }
    private static func horse(_ g: CGContext, armoured: Bool = false) {
        let b = CGMutablePath()
        b.addEllipse(in: CGRect(x: 22, y: 58, width: 70, height: 30))                                  // barrel
        g.addPath(b); g.fillPath()
        let neck = CGMutablePath()                                                                   // neck and head
        neck.move(to: CGPoint(x: 80, y: 66)); neck.addLine(to: CGPoint(x: 98, y: 38)); neck.addLine(to: CGPoint(x: 116, y: 46))
        neck.addLine(to: CGPoint(x: 112, y: 54)); neck.addLine(to: CGPoint(x: 100, y: 52)); neck.addLine(to: CGPoint(x: 90, y: 76)); neck.closeSubpath()
        g.addPath(neck); g.fillPath()
        g.setLineWidth(7)                                                                            // legs, mid-stride
        for (a, b) in [(CGFloat(32), CGFloat(24)), (44, 50), (76, 70), (86, 100)] { g.move(to: CGPoint(x: a, y: 84)); g.addLine(to: CGPoint(x: b, y: 114)) }
        g.strokePath()
        g.setLineWidth(5); g.move(to: CGPoint(x: 24, y: 66)); g.addQuadCurve(to: CGPoint(x: 8, y: 92), control: CGPoint(x: 10, y: 70)); g.strokePath()   // tail
        if armoured { g.fill(CGRect(x: 22, y: 70, width: 70, height: 20)) }                        // caparison
    }
    private static func rider(_ g: CGContext) {
        g.fillEllipse(in: CGRect(x: 48, y: 12, width: 18, height: 18))
        let t = CGMutablePath(); t.move(to: CGPoint(x: 46, y: 34)); t.addLine(to: CGPoint(x: 68, y: 34)); t.addLine(to: CGPoint(x: 66, y: 64)); t.addLine(to: CGPoint(x: 46, y: 64)); t.closeSubpath()
        g.addPath(t); g.fillPath()
    }

    private static func draw(_ role: String, _ g: CGContext) {
        switch role {
        case "spear":
            soldier(g)
            g.setLineWidth(5); g.move(to: CGPoint(x: 84, y: 120)); g.addLine(to: CGPoint(x: 84, y: 6)); g.strokePath()
            let tip = CGMutablePath(); tip.move(to: CGPoint(x: 84, y: 0)); tip.addLine(to: CGPoint(x: 91, y: 16)); tip.addLine(to: CGPoint(x: 77, y: 16)); tip.closeSubpath()
            g.addPath(tip); g.fillPath()
            g.setLineWidth(7); g.move(to: CGPoint(x: 64, y: 50)); g.addLine(to: CGPoint(x: 84, y: 56)); g.strokePath()
        case "shield":
            soldier(g, x: 46, helmet: true)
            let shield = CGMutablePath()
            shield.move(to: CGPoint(x: 64, y: 34)); shield.addLine(to: CGPoint(x: 100, y: 34)); shield.addLine(to: CGPoint(x: 100, y: 78))
            shield.addQuadCurve(to: CGPoint(x: 64, y: 78), control: CGPoint(x: 82, y: 100)); shield.closeSubpath()
            g.addPath(shield); g.fillPath()
        case "archer":
            soldier(g, x: 48)
            g.setLineWidth(5)
            g.move(to: CGPoint(x: 84, y: 14)); g.addQuadCurve(to: CGPoint(x: 84, y: 92), control: CGPoint(x: 112, y: 53)); g.strokePath()
            g.setLineWidth(2); g.move(to: CGPoint(x: 84, y: 14)); g.addLine(to: CGPoint(x: 70, y: 53)); g.addLine(to: CGPoint(x: 84, y: 92)); g.strokePath()
            g.setLineWidth(6); g.move(to: CGPoint(x: 58, y: 50)); g.addLine(to: CGPoint(x: 70, y: 53)); g.strokePath()
        case "crossbow":
            soldier(g, x: 44, helmet: true)
            g.setLineWidth(8); g.move(to: CGPoint(x: 52, y: 54)); g.addLine(to: CGPoint(x: 112, y: 54)); g.strokePath()        // stock
            g.setLineWidth(5); g.move(to: CGPoint(x: 100, y: 34)); g.addQuadCurve(to: CGPoint(x: 100, y: 74), control: CGPoint(x: 112, y: 54)); g.strokePath()
        case "cavalry":
            horse(g); rider(g)
            g.setLineWidth(6); g.move(to: CGPoint(x: 66, y: 40)); g.addLine(to: CGPoint(x: 88, y: 12)); g.strokePath()          // sabre
        case "heavy":
            horse(g, armoured: true); rider(g)
            g.fill(CGRect(x: 46, y: 10, width: 22, height: 8))                                                                  // helm
            g.setLineWidth(6); g.move(to: CGPoint(x: 40, y: 50)); g.addLine(to: CGPoint(x: 124, y: 30)); g.strokePath()         // couched lance
        case "horseArcher":
            horse(g); rider(g)
            g.setLineWidth(5); g.move(to: CGPoint(x: 78, y: 10)); g.addQuadCurve(to: CGPoint(x: 78, y: 62), control: CGPoint(x: 98, y: 36)); g.strokePath()
            g.setLineWidth(2); g.move(to: CGPoint(x: 78, y: 10)); g.addLine(to: CGPoint(x: 66, y: 36)); g.addLine(to: CGPoint(x: 78, y: 62)); g.strokePath()
        case "elite":
            soldier(g, helmet: true, plume: true)
            g.setLineWidth(7); g.move(to: CGPoint(x: 66, y: 48)); g.addLine(to: CGPoint(x: 98, y: 14)); g.strokePath()
            g.setLineWidth(5); g.move(to: CGPoint(x: 72, y: 34)); g.addLine(to: CGPoint(x: 84, y: 46)); g.strokePath()          // guard
        case "elephant":
            g.fillEllipse(in: CGRect(x: 14, y: 36, width: 82, height: 54))                                                      // body
            g.fillEllipse(in: CGRect(x: 76, y: 30, width: 36, height: 38))                                                      // head
            g.setLineWidth(10); g.move(to: CGPoint(x: 106, y: 58)); g.addQuadCurve(to: CGPoint(x: 112, y: 104), control: CGPoint(x: 120, y: 82)); g.strokePath()   // trunk
            g.setLineWidth(12); for x in [CGFloat(26), 46, 70, 88] { g.move(to: CGPoint(x: x, y: 82)); g.addLine(to: CGPoint(x: x, y: 114)) }; g.strokePath()
            g.fill(CGRect(x: 34, y: 16, width: 34, height: 22))                                                                  // howdah
        case "Banner":
            g.setLineWidth(5); g.move(to: CGPoint(x: 20, y: 124)); g.addLine(to: CGPoint(x: 20, y: 4)); g.strokePath()          // pole
            g.fillEllipse(in: CGRect(x: 14, y: 0, width: 12, height: 12))                                                       // finial
            let flag = CGMutablePath()                                                                                          // swallow-tailed flag
            flag.move(to: CGPoint(x: 22, y: 12)); flag.addLine(to: CGPoint(x: 112, y: 12)); flag.addLine(to: CGPoint(x: 98, y: 40))
            flag.addLine(to: CGPoint(x: 112, y: 70)); flag.addLine(to: CGPoint(x: 22, y: 70)); flag.closeSubpath()
            g.addPath(flag); g.fillPath()
        case "Fleet":
            let hull = CGMutablePath(); hull.move(to: CGPoint(x: 8, y: 84)); hull.addLine(to: CGPoint(x: 120, y: 84)); hull.addLine(to: CGPoint(x: 100, y: 108)); hull.addLine(to: CGPoint(x: 26, y: 108)); hull.closeSubpath()
            g.addPath(hull); g.fillPath()
            g.setLineWidth(5); g.move(to: CGPoint(x: 62, y: 84)); g.addLine(to: CGPoint(x: 62, y: 10)); g.strokePath()
            let sail = CGMutablePath(); sail.move(to: CGPoint(x: 66, y: 14)); sail.addQuadCurve(to: CGPoint(x: 66, y: 76), control: CGPoint(x: 116, y: 44)); sail.closeSubpath()
            g.addPath(sail); g.fillPath()
            let jib = CGMutablePath(); jib.move(to: CGPoint(x: 58, y: 20)); jib.addLine(to: CGPoint(x: 58, y: 76)); jib.addLine(to: CGPoint(x: 18, y: 76)); jib.closeSubpath()
            g.addPath(jib); g.fillPath()
        case "Port":
            g.setLineWidth(9); g.move(to: CGPoint(x: 64, y: 22)); g.addLine(to: CGPoint(x: 64, y: 108)); g.strokePath()
            g.move(to: CGPoint(x: 40, y: 40)); g.addLine(to: CGPoint(x: 88, y: 40)); g.strokePath()
            g.strokeEllipse(in: CGRect(x: 54, y: 4, width: 20, height: 20))
            g.move(to: CGPoint(x: 24, y: 80)); g.addQuadCurve(to: CGPoint(x: 104, y: 80), control: CGPoint(x: 64, y: 124)); g.strokePath()
        default:
            soldier(g)
            g.setLineWidth(7); g.move(to: CGPoint(x: 66, y: 52)); g.addLine(to: CGPoint(x: 96, y: 22)); g.strokePath()          // sword
        }
    }
}
