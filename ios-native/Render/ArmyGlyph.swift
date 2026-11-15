import UIKit

/// 军情小图：放大地图时写在兵力数字前，几笔画出军队在做什么，不用文字。
/// 交战＝两刃相交，撤退＝向后的双折线，集结＝三点聚拢，驻防＝盾，回援＝回钩箭头，出征＝前指箭头，行军＝单折线。
enum ArmyGlyph: String, Equatable {
    case fighting, retreating, staging, guarding, relieving, attacking, marching

    /// 11 pt 见方：纸白笔画、墨色描边（与兵力数字同一配色，压在任何国色上都看得清）。按状态缓存。
    private static var cache = [ArmyGlyph: CGImage]()
    var image: CGImage? {
        if let c = Self.cache[self] { return c }
        let size = CGSize(width: 12, height: 12)
        let format = UIGraphicsImageRendererFormat(); format.scale = UIScreen.main.scale
        let img = UIGraphicsImageRenderer(size: size, format: format).image { ctx in
            let p = path
            let c = ctx.cgContext
            c.setLineCap(.round); c.setLineJoin(.round)
            c.addPath(p.cgPath); c.setStrokeColor(UIColor(white: 0.05, alpha: 0.85).cgColor); c.setLineWidth(3.2); c.strokePath()
            c.addPath(p.cgPath); c.setStrokeColor(UIColor(red: 0.99, green: 0.97, blue: 0.92, alpha: 1).cgColor); c.setLineWidth(1.5); c.strokePath()
            if self == .staging {
                c.addPath(fill.cgPath); c.setStrokeColor(UIColor(white: 0.05, alpha: 0.85).cgColor); c.setLineWidth(1.6); c.strokePath()
                c.addPath(fill.cgPath); c.setFillColor(UIColor(red: 0.99, green: 0.97, blue: 0.92, alpha: 1).cgColor); c.fillPath()
            }
        }.cgImage
        Self.cache[self] = img
        return img
    }
    private var path: UIBezierPath {
        let p = UIBezierPath()
        func l(_ x1: CGFloat, _ y1: CGFloat, _ x2: CGFloat, _ y2: CGFloat) { p.move(to: CGPoint(x: x1, y: y1)); p.addLine(to: CGPoint(x: x2, y: y2)) }
        switch self {
        case .fighting: l(2.5, 9.5, 9.5, 2.5); l(2.5, 2.5, 9.5, 9.5)
        case .retreating: l(6, 2.5, 2.5, 6); l(2.5, 6, 6, 9.5); l(10, 2.5, 6.5, 6); l(6.5, 6, 10, 9.5)
        case .staging: break
        case .guarding:
            p.move(to: CGPoint(x: 2.5, y: 2.8)); p.addLine(to: CGPoint(x: 9.5, y: 2.8)); p.addLine(to: CGPoint(x: 9.5, y: 6))
            p.addQuadCurve(to: CGPoint(x: 6, y: 10), controlPoint: CGPoint(x: 9.3, y: 9)); p.addQuadCurve(to: CGPoint(x: 2.5, y: 6), controlPoint: CGPoint(x: 2.7, y: 9)); p.close()
        case .relieving:
            p.move(to: CGPoint(x: 9.5, y: 9)); p.addLine(to: CGPoint(x: 9.5, y: 5)); p.addQuadCurve(to: CGPoint(x: 3, y: 4.5), controlPoint: CGPoint(x: 9.5, y: 2))
            l(3, 4.5, 5.5, 2.2); l(3, 4.5, 5.5, 7)
        case .attacking: l(2, 6, 10, 6); l(10, 6, 6.8, 2.8); l(10, 6, 6.8, 9.2)
        case .marching: l(4, 2.5, 8, 6); l(8, 6, 4, 9.5)
        }
        return p
    }
    /// 集结的三点。
    private var fill: UIBezierPath {
        switch self {
        case .staging:
            let p = UIBezierPath()
            for (x, y) in [(3.0, 8.5), (9.0, 8.5), (6.0, 3.0)] { p.append(UIBezierPath(ovalIn: CGRect(x: x - 1.7, y: y - 1.7, width: 3.4, height: 3.4))) }
            return p
        default: return UIBezierPath()
        }
    }
}
