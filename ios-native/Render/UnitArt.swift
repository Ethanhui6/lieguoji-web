import CoreGraphics
import UIKit
import LieguojiCore

/// 雕漆军团与水师棋子（256×256 预烘焙多级纹理）：
/// 统一四阶浮雕工艺（浓墨外郭 → 中灰倒角 → 西北至东南立体象牙受光面 → 刻线纹饰），
/// 配合地图上国色漆盾军牌（`0plate`）与战舰水浪底纹（`0fleetwake`），在任意缩放倍率下皆清晰可辨。
enum UnitArt {
    static let size = 256
    private static var cache = [String: CGImage]()
    /// 热更目录 `EraUnits/{era}/{role}.png`（按时代切换真实二战坦克/零战/航母、一战无畏舰、拿破仑线列炮、古代战车棋子）。
    static var hotPackEraUnitsRoot: URL?
    static var activeEra: String = "medieval" {
        didSet { if oldValue != activeEra { cache.removeAll() } }
    }

    static func clearCache() { cache.removeAll() }

    static func role(_ unit: String) -> String {
        if ["Fleet", "Transport", "Port", "Merchant"].contains(unit) { return unit }
        return UnitKinds.byKey[unit]?.role.rawValue ?? "infantry"
    }

    static func image(_ unit: String, era: String? = nil) -> CGImage? {
        let key = role(unit)
        let eraKey = era ?? activeEra
        let cacheKey = "\(eraKey)|\(key)"
        if let c = cache[cacheKey] { return c }
        // 优先加载 HotPack v6 时代高清兵模贴图（下载即生效，支持任意 6 时代兵种视觉换装）
        if let root = hotPackEraUnitsRoot {
            let candidates = [
                root.appendingPathComponent(eraKey, isDirectory: true).appendingPathComponent("\(key).png"),
                root.appendingPathComponent("common", isDirectory: true).appendingPathComponent("\(key).png"),
            ]
            for url in candidates where FileManager.default.fileExists(atPath: url.path) {
                if let ui = UIImage(contentsOfFile: url.path), let cg = ui.cgImage {
                    cache[cacheKey] = cg
                    return cg
                }
            }
        }
        guard let g = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: size * 4,
                                space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
        g.translateBy(x: 0, y: CGFloat(size)); g.scaleBy(x: 1, y: -1)
        g.setLineCap(.round); g.setLineJoin(.round)
        draw(key, g)
        guard let cg = g.makeImage() else { return nil }
        cache[cacheKey] = cg
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

    private static let rim: CGFloat = 17
    private enum Shape { case rod(CGPath, CGFloat), solid(CGPath) }

    /// 四阶雕漆象牙立体棋子着色：浓墨外轮廓 → 中调刻槽倒角 → 西北来光立体受光面 → 锐利高光脊。
    private static func render(_ g: CGContext, _ shapes: [Shape]) {
        g.setFillColor(red: 0.22, green: 0.22, blue: 0.22, alpha: 1)
        g.setStrokeColor(red: 0.22, green: 0.22, blue: 0.22, alpha: 1)
        for s in shapes {
            switch s {
            case .rod(let p, let w): g.setLineWidth(w + rim); g.addPath(p); g.strokePath()
            case .solid(let p): g.addPath(p); g.fillPath(); g.setLineWidth(rim); g.addPath(p); g.strokePath()
            }
        }
        g.setFillColor(red: 0.42, green: 0.42, blue: 0.42, alpha: 1)
        g.setStrokeColor(red: 0.42, green: 0.42, blue: 0.42, alpha: 1)
        let innerRim = rim * 0.42
        for s in shapes {
            switch s {
            case .rod(let p, let w): g.setLineWidth(w + innerRim); g.addPath(p); g.strokePath()
            case .solid(let p): g.setLineWidth(innerRim); g.addPath(p); g.strokePath()
            }
        }
        let grad = CGGradient(
            colorSpace: CGColorSpaceCreateDeviceRGB(),
            colorComponents: [1.0, 1.0, 1.0, 1.0, 0.94, 0.94, 0.94, 1.0, 0.78, 0.78, 0.78, 1.0],
            locations: [0.0, 0.50, 1.0],
            count: 3
        )
        for s in shapes {
            switch s {
            case .rod(let p, let w):
                g.setStrokeColor(red: 0.90, green: 0.90, blue: 0.90, alpha: 1)
                g.setLineWidth(w); g.addPath(p); g.strokePath()
                g.setStrokeColor(red: 1.0, green: 1.0, blue: 1.0, alpha: 1)
                g.setLineWidth(max(2.5, w * 0.46)); g.addPath(p); g.strokePath()
            case .solid(let p):
                let box = p.boundingBoxOfPath
                g.saveGState()
                g.addPath(p)
                g.clip()
                if let grad, !box.isEmpty {
                    g.drawLinearGradient(
                        grad,
                        start: CGPoint(x: box.minX, y: box.minY),
                        end: CGPoint(x: box.maxX, y: box.maxY),
                        options: [.drawsBeforeStartLocation, .drawsAfterEndLocation]
                    )
                } else {
                    g.setFillColor(red: 0.96, green: 0.96, blue: 0.96, alpha: 1)
                    g.fill(box)
                }
                g.restoreGState()
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
    private static func oval(_ x: CGFloat, _ y: CGFloat, _ w: CGFloat, _ h: CGFloat) -> CGPath {
        CGPath(ellipseIn: CGRect(x: x, y: y, width: w, height: h), transform: nil)
    }
    private static func detail(_ g: CGContext, _ p: CGPath, _ w: CGFloat) {
        g.setStrokeColor(red: 0.28, green: 0.28, blue: 0.28, alpha: 1); g.setLineWidth(w); g.addPath(p); g.strokePath()
    }
    private static func dot(_ g: CGContext, _ x: CGFloat, _ y: CGFloat, d: CGFloat = 13) {
        g.setFillColor(red: 0.26, green: 0.26, blue: 0.26, alpha: 1)
        g.fillEllipse(in: CGRect(x: x, y: y, width: d, height: d))
    }

    /// 陆军统一雕花阶座（收巧贴合漆盾军牌底缘）。
    private static let base: [Shape] = [
        .solid(poly([(82, 190), (174, 190), (184, 210), (72, 210)])),
        .solid(poly([(56, 216), (200, 216), (204, 236), (52, 236)]))
    ]

    /// 精雕骏马战首轮廓（高昂脖颈 + 飞扬鬃毛 + 锐利马吻）。
    private static var warhorse: CGPath {
        let p = CGMutablePath()
        p.move(to: CGPoint(x: 80, y: 188))
        p.addLine(to: CGPoint(x: 178, y: 188))
        p.addQuadCurve(to: CGPoint(x: 184, y: 112), control: CGPoint(x: 192, y: 152))
        p.addQuadCurve(to: CGPoint(x: 162, y: 46), control: CGPoint(x: 184, y: 74))
        p.addLine(to: CGPoint(x: 130, y: 32))
        p.addLine(to: CGPoint(x: 114, y: 16))
        p.addLine(to: CGPoint(x: 102, y: 38))
        p.addQuadCurve(to: CGPoint(x: 60, y: 92), control: CGPoint(x: 78, y: 56))
        p.addQuadCurve(to: CGPoint(x: 68, y: 118), control: CGPoint(x: 54, y: 108))
        p.addLine(to: CGPoint(x: 92, y: 114))
        p.addQuadCurve(to: CGPoint(x: 112, y: 102), control: CGPoint(x: 104, y: 108))
        p.addQuadCurve(to: CGPoint(x: 80, y: 188), control: CGPoint(x: 106, y: 142))
        p.closeSubpath()
        return p
    }

    private static func draw(_ role: String, _ g: CGContext) {
        switch role {
        case "Fleet":
            // 双桅楼船/盖伦主力战舰：高翘艏楼与撞角、高耸艉楼、鼓风弧形主前双帆、桅顶燕尾帅旗、四门舷炮与船底浪脊。
            let hull = CGMutablePath()
            hull.move(to: CGPoint(x: 20, y: 158))      // 船首高翘撞角
            hull.addLine(to: CGPoint(x: 64, y: 164))
            hull.addLine(to: CGPoint(x: 184, y: 164))
            hull.addLine(to: CGPoint(x: 234, y: 142))  // 艉楼高甲板
            hull.addLine(to: CGPoint(x: 222, y: 182))
            hull.addQuadCurve(to: CGPoint(x: 188, y: 214), control: CGPoint(x: 214, y: 206))
            hull.addLine(to: CGPoint(x: 68, y: 214))
            hull.addQuadCurve(to: CGPoint(x: 34, y: 178), control: CGPoint(x: 42, y: 204))
            hull.closeSubpath()

            // 主桅鼓风大帆（饱满弧面）
            let mainSail = CGMutablePath()
            mainSail.move(to: CGPoint(x: 112, y: 42))
            mainSail.addQuadCurve(to: CGPoint(x: 186, y: 52), control: CGPoint(x: 150, y: 38))
            mainSail.addQuadCurve(to: CGPoint(x: 182, y: 146), control: CGPoint(x: 212, y: 100))
            mainSail.addQuadCurve(to: CGPoint(x: 106, y: 146), control: CGPoint(x: 148, y: 136))
            mainSail.addQuadCurve(to: CGPoint(x: 112, y: 42), control: CGPoint(x: 130, y: 94))
            mainSail.closeSubpath()

            // 前桅三角/前帆
            let foreSail = CGMutablePath()
            foreSail.move(to: CGPoint(x: 78, y: 66))
            foreSail.addQuadCurve(to: CGPoint(x: 98, y: 146), control: CGPoint(x: 112, y: 106))
            foreSail.addQuadCurve(to: CGPoint(x: 42, y: 146), control: CGPoint(x: 68, y: 140))
            foreSail.addQuadCurve(to: CGPoint(x: 78, y: 66), control: CGPoint(x: 52, y: 108))
            foreSail.closeSubpath()

            // 船底雕浪水线
            let wave = CGMutablePath()
            wave.move(to: CGPoint(x: 34, y: 228))
            wave.addQuadCurve(to: CGPoint(x: 82, y: 228), control: CGPoint(x: 58, y: 216))
            wave.addQuadCurve(to: CGPoint(x: 128, y: 228), control: CGPoint(x: 105, y: 238))
            wave.addQuadCurve(to: CGPoint(x: 174, y: 228), control: CGPoint(x: 151, y: 216))
            wave.addQuadCurve(to: CGPoint(x: 222, y: 228), control: CGPoint(x: 198, y: 238))

            render(g, [
                .rod(line((138, 18), (138, 166)), 10),         // 主桅
                .rod(line((82, 54), (82, 166)), 8),            // 前桅
                .rod(line((20, 154), (56, 168)), 8),           // 船首斜桅撞角
                .solid(poly([(138, 16), (192, 24), (174, 31), (192, 38), (138, 40)])), // 燕尾旗舰帅旗
                .solid(foreSail),
                .solid(mainSail),
                .solid(hull),
                .rod(wave, 8)
            ])
            // 帆面横向桁索缝线 + 船壳四门炮窗与艉楼栅栏
            detail(g, curve((118, 82), (156, 76), (192, 86)), 6)
            detail(g, curve((116, 114), (154, 108), (190, 118)), 6)
            detail(g, line((62, 178), (196, 178)), 6)
            dot(g, 74, 188, d: 12); dot(g, 108, 188, d: 12); dot(g, 142, 188, d: 12); dot(g, 176, 186, d: 12)

        case "Transport":
            // 跨海运兵船（与经典 UnitArt 雕漆棋子完全同源）：圆润高舷运兵木舟 + 鼓风单帆 + 舷侧三面圆盾 + 船底轻浪。
            let tSail = CGMutablePath()
            tSail.move(to: CGPoint(x: 78, y: 48))
            tSail.addQuadCurve(to: CGPoint(x: 178, y: 48), control: CGPoint(x: 128, y: 38))
            tSail.addQuadCurve(to: CGPoint(x: 174, y: 142), control: CGPoint(x: 198, y: 95))
            tSail.addQuadCurve(to: CGPoint(x: 82, y: 142), control: CGPoint(x: 128, y: 132))
            tSail.addQuadCurve(to: CGPoint(x: 78, y: 48), control: CGPoint(x: 62, y: 95))
            tSail.closeSubpath()

            let tHull = CGMutablePath()
            tHull.move(to: CGPoint(x: 36, y: 158))
            tHull.addLine(to: CGPoint(x: 220, y: 156))
            tHull.addQuadCurve(to: CGPoint(x: 192, y: 208), control: CGPoint(x: 212, y: 196))
            tHull.addLine(to: CGPoint(x: 64, y: 208))
            tHull.addQuadCurve(to: CGPoint(x: 36, y: 158), control: CGPoint(x: 44, y: 196))
            tHull.closeSubpath()

            let tWave = CGMutablePath()
            tWave.move(to: CGPoint(x: 42, y: 224))
            tWave.addQuadCurve(to: CGPoint(x: 96, y: 224), control: CGPoint(x: 69, y: 214))
            tWave.addQuadCurve(to: CGPoint(x: 154, y: 224), control: CGPoint(x: 125, y: 234))
            tWave.addQuadCurve(to: CGPoint(x: 214, y: 224), control: CGPoint(x: 184, y: 214))

            render(g, [
                .rod(line((128, 22), (128, 160)), 10),
                .solid(poly([(128, 20), (168, 28), (128, 36)])),
                .solid(tSail),
                .solid(tHull),
                .rod(tWave, 7)
            ])
            // 帆面兵锋暗纹与舷侧三面圆盾（一眼区分战舰与运兵船）
            detail(g, line((102, 74), (154, 118)), 6)
            detail(g, line((154, 74), (102, 118)), 6)
            dot(g, 76, 174, d: 18); dot(g, 119, 174, d: 18); dot(g, 162, 174, d: 18)

        case "Merchant":
            // 圆腹商船：饱满单方帆、十字商徽绳带、深腹货舱与船底水波。
            let sail = CGMutablePath()
            sail.move(to: CGPoint(x: 72, y: 50))
            sail.addQuadCurve(to: CGPoint(x: 184, y: 50), control: CGPoint(x: 128, y: 40))
            sail.addQuadCurve(to: CGPoint(x: 178, y: 148), control: CGPoint(x: 204, y: 98))
            sail.addQuadCurve(to: CGPoint(x: 78, y: 148), control: CGPoint(x: 128, y: 138))
            sail.addQuadCurve(to: CGPoint(x: 72, y: 50), control: CGPoint(x: 56, y: 98))
            sail.closeSubpath()

            let hull = CGMutablePath()
            hull.move(to: CGPoint(x: 34, y: 162))
            hull.addLine(to: CGPoint(x: 222, y: 158))
            hull.addQuadCurve(to: CGPoint(x: 190, y: 214), control: CGPoint(x: 212, y: 202))
            hull.addLine(to: CGPoint(x: 66, y: 214))
            hull.addQuadCurve(to: CGPoint(x: 34, y: 162), control: CGPoint(x: 42, y: 200))
            hull.closeSubpath()

            render(g, [
                .rod(line((128, 24), (128, 166)), 10),
                .solid(poly([(128, 22), (166, 30), (128, 38)])),
                .solid(sail),
                .solid(hull)
            ])
            detail(g, curve((78, 98), (128, 92), (178, 98)), 7)
            detail(g, line((128, 52), (128, 144)), 6)
            detail(g, line((58, 182), (198, 182)), 6)

        case "Port":
            // 精雕海港铁锚：顶环、斜角横木、倒刺双锚爪与港湾波纹。
            render(g, [
                .rod(line((128, 58), (128, 210)), 16),
                .rod(line((78, 86), (178, 86)), 14),
                .solid(oval(104, 16, 48, 48)),
                .rod(curve((46, 148), (128, 260), (210, 148)), 16),
                .solid(poly([(28, 152), (64, 134), (66, 170)])),
                .solid(poly([(228, 152), (192, 134), (190, 170)]))
            ])
            dot(g, 118, 30, d: 20)

        case "spear":
            // 方天画戟 / 仪仗长枪：菱形戟尖 + 弯月侧刃 + 迎风飘带战旆。
            let crescent = CGMutablePath()
            crescent.move(to: CGPoint(x: 132, y: 56))
            crescent.addQuadCurve(to: CGPoint(x: 192, y: 92), control: CGPoint(x: 182, y: 56))
            crescent.addQuadCurve(to: CGPoint(x: 132, y: 122), control: CGPoint(x: 184, y: 126))
            crescent.addQuadCurve(to: CGPoint(x: 132, y: 56), control: CGPoint(x: 158, y: 90))
            crescent.closeSubpath()

            let pennant = CGMutablePath()
            pennant.move(to: CGPoint(x: 122, y: 84))
            pennant.addQuadCurve(to: CGPoint(x: 56, y: 104), control: CGPoint(x: 86, y: 82))
            pennant.addLine(to: CGPoint(x: 78, y: 120))
            pennant.addLine(to: CGPoint(x: 62, y: 136))
            pennant.addQuadCurve(to: CGPoint(x: 122, y: 128), control: CGPoint(x: 92, y: 138))
            pennant.closeSubpath()

            render(g, [
                .rod(line((128, 190), (128, 66)), 14),
                .solid(pennant),
                .solid(crescent),
                .solid(poly([(128, 10), (150, 52), (128, 86), (106, 52)])),
                .rod(line((102, 128), (154, 128)), 10)
            ] + base)
            detail(g, line((128, 22), (128, 76)), 6)

        case "shield":
            // 鸢形重盾 + 背后佩剑柄 + 浮雕十字棱与铆钉盾脐。
            let kite = CGMutablePath()
            kite.move(to: CGPoint(x: 58, y: 46))
            kite.addQuadCurve(to: CGPoint(x: 198, y: 46), control: CGPoint(x: 128, y: 34))
            kite.addLine(to: CGPoint(x: 198, y: 104))
            kite.addQuadCurve(to: CGPoint(x: 128, y: 188), control: CGPoint(x: 192, y: 162))
            kite.addQuadCurve(to: CGPoint(x: 58, y: 104), control: CGPoint(x: 64, y: 162))
            kite.closeSubpath()

            render(g, [
                .rod(line((128, 16), (128, 52)), 14),
                .rod(line((102, 32), (154, 32)), 10),
                .solid(kite)
            ] + base)
            detail(g, line((128, 58), (128, 164)), 10)
            detail(g, line((82, 98), (174, 98)), 10)
            dot(g, 118, 88, d: 20)

        case "archer":
            // 反曲强弓张满 + 搭弦羽箭 + 斜背箭囊。
            let bow = CGMutablePath()
            bow.move(to: CGPoint(x: 92, y: 24))
            bow.addQuadCurve(to: CGPoint(x: 154, y: 104), control: CGPoint(x: 162, y: 50))
            bow.addQuadCurve(to: CGPoint(x: 92, y: 184), control: CGPoint(x: 162, y: 158))
            render(g, [
                .rod(bow, 14),
                .rod(line((46, 104), (186, 104)), 9),
                .solid(poly([(208, 104), (176, 86), (182, 104), (176, 122)])),
                .solid(poly([(44, 104), (66, 90), (58, 104), (66, 118)]))
            ] + base)
            detail(g, line((92, 28), (64, 104)), 6)
            detail(g, line((64, 104), (92, 180)), 6)

        case "crossbow":
            // 劲弩 / 重机弩：钢弧弩臂 + 前镫环 + 弩身箭槽 + 三棱钢矢。
            render(g, [
                .solid(oval(110, 14, 36, 30)),
                .rod(line((128, 42), (128, 188)), 18),
                .rod(curve((36, 114), (128, 36), (220, 114)), 14),
                .solid(poly([(128, 18), (152, 60), (128, 50), (104, 60)]))
            ] + base)
            detail(g, line((42, 116), (128, 134)), 6)
            detail(g, line((214, 116), (128, 134)), 6)
            detail(g, line((128, 72), (128, 174)), 6)

        case "cavalry":
            // 轻骑战马首：昂首嘶鸣 + 飘逸长鬃 + 缰绳刻纹。
            render(g, [.solid(warhorse)] + base)
            detail(g, curve((88, 102), (122, 86), (146, 62)), 7)
            detail(g, curve((158, 74), (174, 108), (166, 152)), 7)
            dot(g, 114, 58, d: 13)

        case "heavy":
            // 具装铁骑：高耸缨盔战马 + 马面护甲 + 颈部层甲 + 冲锋长骑枪。
            let plume = CGMutablePath()
            plume.move(to: CGPoint(x: 118, y: 32))
            plume.addQuadCurve(to: CGPoint(x: 186, y: 12), control: CGPoint(x: 154, y: 0))
            plume.addQuadCurve(to: CGPoint(x: 146, y: 46), control: CGPoint(x: 176, y: 34))
            plume.closeSubpath()

            render(g, [
                .rod(line((194, 186), (218, 22)), 11),
                .solid(poly([(220, 10), (232, 42), (206, 38)])),
                .solid(plume),
                .solid(warhorse)
            ] + base)
            detail(g, curve((70, 82), (98, 66), (128, 42)), 8)   // 马面具装铁甲
            detail(g, line((94, 132), (172, 132)), 8)
            detail(g, line((88, 158), (174, 158)), 8)
            dot(g, 114, 58, d: 13)

        case "horseArcher":
            // 草原骑射：战马首配搭弦反曲马弓。
            render(g, [
                .rod(curve((176, 26), (238, 104), (176, 182)), 12),
                .rod(line((154, 104), (222, 104)), 8),
                .solid(poly([(236, 104), (212, 90), (212, 118)])),
                .solid(warhorse)
            ] + base)
            detail(g, line((176, 30), (176, 178)), 5)
            dot(g, 114, 58, d: 13)

        case "elite":
            // 禁军龙虎帅旗：枪尖旗杆 + 随风双波浪大纛 + 日月圆徽。
            let banner = CGMutablePath()
            banner.move(to: CGPoint(x: 84, y: 38))
            banner.addQuadCurve(to: CGPoint(x: 196, y: 42), control: CGPoint(x: 140, y: 22))
            banner.addLine(to: CGPoint(x: 178, y: 88))
            banner.addLine(to: CGPoint(x: 198, y: 136))
            banner.addQuadCurve(to: CGPoint(x: 84, y: 138), control: CGPoint(x: 140, y: 152))
            banner.closeSubpath()

            render(g, [
                .rod(line((78, 190), (78, 30)), 12),
                .solid(poly([(78, 8), (94, 30), (78, 44), (62, 30)])),
                .solid(banner)
            ] + base)
            detail(g, oval(114, 66, 44, 44), 9)
            dot(g, 129, 81, d: 14)

        case "elephant":
            // 重甲战象：背负战楼冠顶 + 双扇巨耳 + 弧形象牙与卷鼻。
            render(g, [
                .solid(poly([(94, 18), (162, 18), (154, 52), (102, 52)])), // 象背战楼
                .solid(oval(32, 48, 68, 86)),
                .solid(oval(156, 48, 68, 86)),
                .solid(oval(80, 40, 96, 104)),
                .rod(curve((128, 128), (122, 168), (152, 182)), 26)
            ] + base)
            detail(g, curve((96, 126), (78, 150), (88, 170)), 9)
            detail(g, curve((160, 126), (178, 150), (168, 170)), 9)
            dot(g, 102, 76, d: 13); dot(g, 140, 76, d: 13)

        default:
            // 步兵/甲士：冠翎战盔 + 阔肩甲冑 + 护手十字阔剑。
            let helm = CGMutablePath()
            helm.move(to: CGPoint(x: 88, y: 84))
            helm.addQuadCurve(to: CGPoint(x: 128, y: 38), control: CGPoint(x: 88, y: 42))
            helm.addQuadCurve(to: CGPoint(x: 168, y: 84), control: CGPoint(x: 168, y: 42))
            helm.addLine(to: CGPoint(x: 162, y: 112))
            helm.addLine(to: CGPoint(x: 94, y: 112))
            helm.closeSubpath()

            let armor = CGMutablePath()
            armor.move(to: CGPoint(x: 78, y: 122))
            armor.addLine(to: CGPoint(x: 178, y: 122))
            armor.addLine(to: CGPoint(x: 186, y: 188))
            armor.addLine(to: CGPoint(x: 70, y: 188))
            armor.closeSubpath()

            render(g, [
                .solid(poly([(128, 10), (146, 42), (128, 52), (110, 42)])), // 盔顶朱翎
                .solid(helm),
                .solid(armor)
            ] + base)
            detail(g, line((98, 76), (158, 76)), 8)      // 面甲横槽
            detail(g, line((128, 76), (128, 108)), 7)    // 护鼻棱
            detail(g, line((128, 126), (128, 178)), 9)   // 剑脊
            detail(g, line((104, 144), (152, 144)), 8)   // 剑格
        }
    }
}
