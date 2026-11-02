import CoreGraphics
import UIKit
import LieguojiCore

/// The army marks, drawn once in white on clear (the map fills them with the state's colour and
/// rims them in ink): one bold pictogram per arm — sword, spear, shield, bow, crossbow, horse head,
/// barded horse, horse and bow, crested helm, elephant, ship, anchor — plus the commander's banner
/// and the strength pip. Simple solid shapes that still read at twenty points.
enum UnitArt {
    static let size = 128
    private static var cache = [String: CGImage]()

    static func role(_ unit: String) -> String {
        if ["Fleet", "Port", "Banner", "Pip"].contains(unit) { return unit }
        return UnitKinds.byKey[unit]?.role.rawValue ?? "infantry"
    }

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

    private static func poly(_ g: CGContext, _ pts: [(CGFloat, CGFloat)]) {
        guard let first = pts.first else { return }
        g.move(to: CGPoint(x: first.0, y: first.1))
        for p in pts.dropFirst() { g.addLine(to: CGPoint(x: p.0, y: p.1)) }
        g.closePath(); g.fillPath()
    }
    private static func line(_ g: CGContext, _ w: CGFloat, _ a: (CGFloat, CGFloat), _ b: (CGFloat, CGFloat)) {
        g.setLineWidth(w); g.move(to: CGPoint(x: a.0, y: a.1)); g.addLine(to: CGPoint(x: b.0, y: b.1)); g.strokePath()
    }
    /// A horse's head and neck facing right (the chess knight's outline).
    private static func horseHead(_ g: CGContext) {
        poly(g, [(30, 118), (98, 118), (92, 92), (84, 76), (88, 60), (110, 70), (120, 58), (112, 44), (84, 22), (78, 8), (66, 20), (48, 30), (36, 52), (30, 80)])
    }

    // Shapes in a 128 grid.
    private static func draw(_ role: String, _ g: CGContext) {
        switch role {
        case "spear":
            line(g, 12, (64, 122), (64, 40))
            poly(g, [(64, 2), (82, 30), (64, 50), (46, 30)])                    // leaf blade
            line(g, 10, (46, 56), (82, 56))                                     // lug
        case "shield":
            g.move(to: CGPoint(x: 20, y: 14)); g.addLine(to: CGPoint(x: 108, y: 14)); g.addLine(to: CGPoint(x: 108, y: 60))
            g.addQuadCurve(to: CGPoint(x: 64, y: 122), control: CGPoint(x: 104, y: 104))
            g.addQuadCurve(to: CGPoint(x: 20, y: 60), control: CGPoint(x: 24, y: 104)); g.closePath(); g.fillPath()
        case "archer":
            g.setLineWidth(12); g.move(to: CGPoint(x: 40, y: 8)); g.addQuadCurve(to: CGPoint(x: 40, y: 120), control: CGPoint(x: 126, y: 64)); g.strokePath()
            line(g, 4, (40, 10), (40, 118))                                     // string
            line(g, 7, (14, 64), (100, 64))                                     // arrow
            poly(g, [(118, 64), (96, 52), (96, 76)])
        case "crossbow":
            line(g, 14, (64, 30), (64, 122))                                    // stock
            g.setLineWidth(12); g.move(to: CGPoint(x: 10, y: 50)); g.addQuadCurve(to: CGPoint(x: 118, y: 50), control: CGPoint(x: 64, y: 10)); g.strokePath()
            line(g, 4, (12, 52), (116, 52))
            poly(g, [(64, 2), (78, 26), (50, 26)])                              // bolt head
        case "cavalry":
            horseHead(g)
        case "heavy":
            horseHead(g)
            g.setBlendMode(.clear); line(g, 8, (40, 96), (96, 96)); g.setBlendMode(.normal)   // barding band
            poly(g, [(78, 8), (70, 0), (92, 0)])                                // plume
        case "horseArcher":
            horseHead(g)
            g.setLineWidth(9); g.move(to: CGPoint(x: 12, y: 8)); g.addQuadCurve(to: CGPoint(x: 12, y: 96), control: CGPoint(x: -14, y: 52)); g.strokePath()
            line(g, 3, (12, 10), (12, 94))
        case "elite":
            // A crested helm.
            g.move(to: CGPoint(x: 18, y: 120)); g.addLine(to: CGPoint(x: 18, y: 66))
            g.addQuadCurve(to: CGPoint(x: 110, y: 66), control: CGPoint(x: 64, y: 8)); g.addLine(to: CGPoint(x: 110, y: 120))
            g.addLine(to: CGPoint(x: 80, y: 120)); g.addLine(to: CGPoint(x: 80, y: 88)); g.addLine(to: CGPoint(x: 48, y: 88)); g.addLine(to: CGPoint(x: 48, y: 120)); g.closePath(); g.fillPath()
            g.setLineWidth(12); g.move(to: CGPoint(x: 64, y: 30)); g.addQuadCurve(to: CGPoint(x: 8, y: 22), control: CGPoint(x: 40, y: 2)); g.strokePath()
        case "elephant":
            g.fillEllipse(in: CGRect(x: 24, y: 10, width: 80, height: 70))       // head
            g.fillEllipse(in: CGRect(x: 2, y: 18, width: 40, height: 56))        // ears
            g.fillEllipse(in: CGRect(x: 86, y: 18, width: 40, height: 56))
            g.setLineWidth(20); g.move(to: CGPoint(x: 64, y: 70)); g.addQuadCurve(to: CGPoint(x: 80, y: 120), control: CGPoint(x: 58, y: 110)); g.strokePath()   // trunk
        case "Banner":
            line(g, 6, (20, 124), (20, 4))
            g.fillEllipse(in: CGRect(x: 13, y: 0, width: 14, height: 14))
            poly(g, [(22, 12), (112, 12), (98, 40), (112, 70), (22, 70)])
        case "Pip":
            g.fillEllipse(in: CGRect(x: 24, y: 24, width: 80, height: 80))
        case "Fleet":
            poly(g, [(8, 82), (120, 82), (100, 112), (28, 112)])
            line(g, 8, (64, 82), (64, 8))
            poly(g, [(70, 12), (112, 70), (70, 70)])
            poly(g, [(58, 22), (58, 70), (22, 70)])
        case "Port":
            line(g, 12, (64, 24), (64, 112)); line(g, 12, (36, 42), (92, 42))
            g.setLineWidth(10); g.strokeEllipse(in: CGRect(x: 52, y: 2, width: 24, height: 24))
            g.setLineWidth(12); g.move(to: CGPoint(x: 18, y: 76)); g.addQuadCurve(to: CGPoint(x: 110, y: 76), control: CGPoint(x: 64, y: 136)); g.strokePath()
        default:
            // A sword, point up.
            poly(g, [(64, 2), (78, 20), (76, 82), (52, 82), (50, 20)])
            line(g, 14, (28, 86), (100, 86))                                    // guard
            line(g, 14, (64, 90), (64, 112))                                    // grip
            g.fillEllipse(in: CGRect(x: 52, y: 106, width: 24, height: 20))      // pommel
        }
    }
}
