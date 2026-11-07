import CoreGraphics
import UIKit
import LieguojiCore

/// The army marks: one chess set in the original's manner (grey-rimmed white pieces that the map
/// multiplies by the state's colour, as the original's SpriteRenderer.color does). Every arm stands on
/// the same plinth with the same rim; its crown — pawn, spear, shield, bow, crossbow, knight, plumed
/// knight, knight with bow, gonfalon, elephant — names it. The warship and the anchor are drawn in the same line.
enum UnitArt {
    static let size = 256
    private static var cache = [String: CGImage]()

    static func role(_ unit: String) -> String {
        if ["Fleet", "Port", "Merchant"].contains(unit) { return unit }
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
        g.setLineCap(.round); g.setLineJoin(.round)
        draw(key, g)
        guard let cg = g.makeImage() else { return nil }
        cache[key] = cg
        return cg
    }

    /// The mark multiplied by a colour (white → the colour, grey rim → its shade), for sheets and effects.
    static func tinted(_ unit: String, _ color: UIColor, side: CGFloat = 64) -> UIImage? {
        guard let cg = image(unit) else { return nil }
        let img = UIImage(cgImage: cg), rect = CGRect(x: 0, y: 0, width: side, height: side)
        let format = UIGraphicsImageRendererFormat(); format.preferredRange = .standard
        return UIGraphicsImageRenderer(size: rect.size, format: format).image { ctx in
            img.draw(in: rect)
            color.setFill(); ctx.fill(rect, blendMode: .multiply)
            img.draw(in: rect, blendMode: .destinationIn, alpha: 1)
        }
    }

    // MARK: Drawing (256 grid, y down)

    private static let rim: CGFloat = 18
    private enum Shape { case rod(CGPath, CGFloat), solid(CGPath) }

    /// Two passes, so touching parts share one outline: every shape in grey grown by the rim, then
    /// every shape in white.
    private static func render(_ g: CGContext, _ shapes: [Shape]) {
        g.setFillColor(gray: 0.4, alpha: 1); g.setStrokeColor(gray: 0.4, alpha: 1)
        for s in shapes {
            switch s {
            case .rod(let p, let w): g.setLineWidth(w + rim); g.addPath(p); g.strokePath()
            case .solid(let p): g.addPath(p); g.fillPath(); g.setLineWidth(rim); g.addPath(p); g.strokePath()
            }
        }
        g.setFillColor(gray: 1, alpha: 1); g.setStrokeColor(gray: 1, alpha: 1)
        for s in shapes {
            switch s {
            case .rod(let p, let w): g.setLineWidth(w); g.addPath(p); g.strokePath()
            case .solid(let p): g.addPath(p); g.fillPath()
            }
        }
    }
    private static func line(_ a: (CGFloat, CGFloat), _ b: (CGFloat, CGFloat)) -> CGPath {
        let p = CGMutablePath(); p.move(to: CGPoint(x: a.0, y: a.1)); p.addLine(to: CGPoint(x: b.0, y: b.1)); return p
    }
    private static func curve(_ a: (CGFloat, CGFloat), _ c: (CGFloat, CGFloat), _ b: (CGFloat, CGFloat)) -> CGPath {
        let p = CGMutablePath(); p.move(to: CGPoint(x: a.0, y: a.1)); p.addQuadCurve(to: CGPoint(x: b.0, y: b.1), control: CGPoint(x: c.0, y: c.1)); return p
    }
    private static func poly(_ pts: [(CGFloat, CGFloat)]) -> CGPath {
        let p = CGMutablePath(); p.addLines(between: pts.map { CGPoint(x: $0.0, y: $0.1) }); p.closeSubpath(); return p
    }
    private static func oval(_ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat) -> CGPath { CGPath(ellipseIn: CGRect(x: x, y: y, width: w, height: h), transform: nil) }
    private static func detail(_ g: CGContext, _ p: CGPath, _ w: CGFloat) {
        g.setStrokeColor(gray: 0.4, alpha: 1); g.setLineWidth(w); g.addPath(p); g.strokePath()
    }

    /// The shared plinth every piece stands on, so the set reads as one.
    private static let base: [Shape] = [.solid(poly([(78, 184), (178, 184), (184, 204), (72, 204)])), .solid(poly([(52, 212), (204, 212), (204, 236), (52, 236)]))]
    private static var knight: Shape {
        .solid(poly([(86, 186), (176, 186), (172, 146), (182, 104), (174, 66), (152, 40), (124, 30), (110, 16), (100, 38), (80, 54), (58, 92), (62, 112), (82, 116), (104, 100), (112, 114), (92, 150)]))
    }
    private static func dot(_ g: CGContext, _ x: CGFloat, _ y: CGFloat) { g.setFillColor(gray: 0.4, alpha: 1); g.fillEllipse(in: CGRect(x: x, y: y, width: 14, height: 14)) }

    /// One chess set: the same plinth, rim and fill; only the crown of each piece names the arm.
    private static func draw(_ role: String, _ g: CGContext) {
        switch role {
        case "Fleet":
            // A two-sailed warship, in the same line as the pieces (no plinth: it floats).
            render(g, [.rod(line((128, 30), (128, 170)), 12), .solid(poly([(138, 36), (204, 150), (138, 150)])), .solid(poly([(118, 56), (118, 150), (64, 150)])),
                       .solid(poly([(28, 170), (228, 170), (196, 222), (60, 222)]))])
        case "Merchant":
            // A merchant cog: one square sail with a stripe over a deep hull (the warship has two sails).
            render(g, [.rod(line((128, 36), (128, 168)), 10), .solid(poly([(72, 52), (184, 52), (176, 150), (80, 150)])),
                       .solid(poly([(36, 168), (220, 168), (194, 216), (62, 216)]))])
            detail(g, line((78, 100), (178, 100)), 8)
        case "Port":
            // An anchor.
            render(g, [.rod(line((128, 56), (128, 214)), 16), .rod(line((84, 84), (172, 84)), 14), .solid(oval(108, 18, 40, 40)),
                       .rod(curve((46, 150), (128, 268), (210, 150)), 16), .solid(poly([(30, 156), (62, 138), (64, 170)])), .solid(poly([(226, 156), (194, 138), (192, 170)]))])
            g.setFillColor(gray: 0.4, alpha: 1); g.fillEllipse(in: CGRect(x: 120, y: 30, width: 16, height: 16))
        case "spear":
            render(g, [.rod(line((128, 186), (128, 74)), 14), .solid(poly([(128, 14), (154, 58), (128, 96), (102, 58)])), .rod(line((92, 112), (164, 112)), 12)] + base)
        case "shield":
            let p = CGMutablePath()
            p.move(to: CGPoint(x: 60, y: 40)); p.addLine(to: CGPoint(x: 196, y: 40)); p.addLine(to: CGPoint(x: 196, y: 96))
            p.addQuadCurve(to: CGPoint(x: 128, y: 186), control: CGPoint(x: 192, y: 160)); p.addQuadCurve(to: CGPoint(x: 60, y: 96), control: CGPoint(x: 64, y: 160)); p.closeSubpath()
            render(g, [.solid(p)] + base)
            detail(g, line((128, 62), (128, 158)), 12); detail(g, line((90, 96), (166, 96)), 12)
        case "archer":
            render(g, [.rod(curve((96, 26), (196, 104), (96, 182)), 14), .rod(line((44, 104), (176, 104)), 9), .solid(poly([(196, 104), (170, 88), (170, 120)]))] + base)
            detail(g, line((96, 30), (96, 178)), 6)
        case "crossbow":
            render(g, [.rod(line((128, 70), (128, 186)), 18), .rod(curve((40, 112), (128, 40), (216, 112)), 14), .solid(poly([(128, 22), (150, 62), (106, 62)]))] + base)
            detail(g, line((44, 116), (212, 116)), 6)
        case "cavalry":
            render(g, [knight] + base); dot(g, 128, 62)
        case "heavy":
            render(g, [.solid(poly([(120, 30), (150, 4), (158, 20), (140, 44)])), knight] + base)
            detail(g, line((92, 160), (172, 160)), 10); dot(g, 128, 62)
        case "horseArcher":
            render(g, [.rod(curve((176, 30), (236, 108), (176, 186)), 12), knight] + base); dot(g, 128, 62)
        case "elite":
            render(g, [.rod(line((84, 186), (84, 30)), 12), .solid(oval(72, 12, 24, 24)),
                       .solid(poly([(92, 38), (190, 38), (190, 138), (164, 116), (140, 138), (92, 138)]))] + base)
            detail(g, oval(124, 66, 36, 36), 10)
        case "elephant":
            render(g, [.solid(oval(36, 46, 66, 84)), .solid(oval(154, 46, 66, 84)), .solid(oval(82, 36, 92, 104)), .rod(curve((128, 130), (124, 168), (148, 182)), 26)] + base)
            detail(g, curve((100, 128), (86, 150), (90, 166)), 8); detail(g, curve((156, 128), (170, 150), (166, 166)), 8)
            dot(g, 103, 73); dot(g, 139, 73)
        default:
            // The pawn.
            render(g, [.solid(poly([(100, 112), (156, 112), (172, 186), (84, 186)])), .solid(oval(90, 46, 76, 76))] + base)
        }
    }
}
