import UIKit

/// 地图事件图：几笔毛笔线条画出事件本身，一眼可辨，不用文字与印章。
/// 每类只表达一个意思：立国＝旗升起、宣战＝两戟相交、丰收＝禾穗、通商＝铜钱、名臣＝光芒、
/// 天灾＝雨云、瘟疫＝疫气、改制＝轮转、篡位＝斩断。
/// 节奏统一：笔画在前 0.5 秒内依次画出（缓出），停留后整体淡出，总长 `duration`。
enum EventGlyph {
    static let duration: Double = 1.8
    /// 笔画在 120×120 的画框里，中心约在 (60, 56)。
    private static let box = CGRect(x: 0, y: 0, width: 120, height: 120)
    private static let vermilion = UIColor(red: 0.72, green: 0.18, blue: 0.12, alpha: 1)
    private static let ochre = UIColor(red: 0.7, green: 0.5, blue: 0.18, alpha: 1)
    private static let ink = UIColor(red: 0.16, green: 0.13, blue: 0.1, alpha: 1)
    private static let miasma = UIColor(red: 0.4, green: 0.46, blue: 0.22, alpha: 1)

    /// 事件的主色（淡墨也用它）：立国用该国国色，宣战与改制用朱，天灾用墨，瘟疫用秋香，其余用赭。
    static func tint(_ kind: MapEffects.Burst.Kind, nation: UIColor) -> UIColor {
        switch kind {
        case .founded: return nation
        case .shock, .regime: return vermilion
        case .coup: return UIColor(red: 0.45, green: 0.08, blue: 0.08, alpha: 1)
        case .disaster, .destroyed: return ink
        case .plague: return miasma
        case .harvest, .trade, .talent: return ochre
        }
    }

    static func figure(_ kind: MapEffects.Burst.Kind, nation: UIColor) -> CALayer {
        let root = CALayer(); root.frame = box
        let c = tint(kind, nation: nation)
        switch kind {
        case .founded:
            // 旗杆自下而上立起，旗面随后展开。
            root.addSublayer(stroke(line(60, 84, 60, 30), ink, 2.6, at: 0))
            let flag = UIBezierPath()
            flag.move(to: CGPoint(x: 61, y: 31)); flag.addQuadCurve(to: CGPoint(x: 84, y: 36), controlPoint: CGPoint(x: 72, y: 27))
            flag.addQuadCurve(to: CGPoint(x: 61, y: 49), controlPoint: CGPoint(x: 72, y: 46)); flag.close()
            let f = CAShapeLayer(); f.frame = box; f.path = flag.cgPath; f.fillColor = c.cgColor; f.strokeColor = ink.withAlphaComponent(0.7).cgColor; f.lineWidth = 1
            f.anchorPoint = CGPoint(x: 61.0 / 120, y: 0.33); f.position = CGPoint(x: 61, y: 0.33 * 120)
            f.add(grow("transform.scale.x", from: 0.05, delay: 0.3), forKey: "unfurl")
            f.add(grow("opacity", from: 0, delay: 0.3), forKey: "show")
            root.addSublayer(f)
        case .shock:
            // 两杆长戟从两侧斜刺相交，交点迸出四道短锋。
            root.addSublayer(stroke(line(34, 82, 86, 30), c, 3, at: 0))
            root.addSublayer(stroke(line(86, 82, 34, 30), c, 3, at: 0.14))
            root.addSublayer(stroke(line(80, 30, 90, 26) + line(40, 30, 30, 26), c, 3, at: 0.22))
            let spark = UIBezierPath()
            for a in stride(from: 0.0, to: 2 * Double.pi, by: Double.pi / 2) {
                spark.append(line(60 + cos(a + 0.785) * 8, 56 + sin(a + 0.785) * 8, 60 + cos(a + 0.785) * 15, 56 + sin(a + 0.785) * 15))
            }
            root.addSublayer(stroke(spark, c, 1.6, at: 0.32, draw: 0.2))
        case .harvest:
            // 三株禾穗自下而上长出，穗头下垂。
            for (i, x) in [46.0, 60, 74].enumerated() {
                let stem = UIBezierPath(); stem.move(to: CGPoint(x: x, y: 86)); stem.addQuadCurve(to: CGPoint(x: x + 8, y: 36), controlPoint: CGPoint(x: x - 2, y: 54))
                root.addSublayer(stroke(stem, c, 2.2, at: Double(i) * 0.08))
                let ear = UIBezierPath()
                for k in 0..<4 { let y = 38.0 + Double(k) * 6; ear.append(UIBezierPath(ovalIn: CGRect(x: x + 7 - Double(k) * 0.5, y: y, width: 6, height: 4))) }
                root.addSublayer(stroke(ear, c, 1.8, at: 0.28 + Double(i) * 0.06, draw: 0.25))
            }
        case .trade:
            // 一枚铜钱：外圆内方，画成后轻转半圈。
            let coin = CALayer(); coin.frame = box
            coin.addSublayer(stroke(UIBezierPath(ovalIn: CGRect(x: 38, y: 34, width: 44, height: 44)), c, 3, at: 0))
            coin.addSublayer(stroke(UIBezierPath(rect: CGRect(x: 53, y: 49, width: 14, height: 14)), c, 2.4, at: 0.25, draw: 0.25))
            let turn = CABasicAnimation(keyPath: "transform.rotation.z"); turn.fromValue = -0.5; turn.toValue = 0.15
            turn.duration = duration * 0.6; turn.timingFunction = CAMediaTimingFunction(name: .easeOut); turn.fillMode = .forwards; turn.isRemovedOnCompletion = false
            coin.add(turn, forKey: "turn")
            root.addSublayer(coin)
        case .talent:
            // 光芒自中心向外放出，长短相间。
            let rays = UIBezierPath()
            for i in 0..<12 {
                let a = Double(i) * .pi / 6, r1 = 9.0, r2 = i % 2 == 0 ? 30.0 : 21.0
                rays.append(line(60 + cos(a) * r1, 56 + sin(a) * r1, 60 + cos(a) * r2, 56 + sin(a) * r2))
            }
            root.addSublayer(stroke(rays, c, 2.2, at: 0))
            root.addSublayer(stroke(UIBezierPath(ovalIn: CGRect(x: 54, y: 50, width: 12, height: 12)), c, 2, at: 0.1, draw: 0.3))
        case .disaster:
            // 一团乌云，斜雨落下。
            let cloud = UIBezierPath()
            cloud.move(to: CGPoint(x: 36, y: 52)); cloud.addQuadCurve(to: CGPoint(x: 50, y: 38), controlPoint: CGPoint(x: 36, y: 38))
            cloud.addQuadCurve(to: CGPoint(x: 72, y: 36), controlPoint: CGPoint(x: 60, y: 26)); cloud.addQuadCurve(to: CGPoint(x: 84, y: 52), controlPoint: CGPoint(x: 86, y: 38))
            cloud.close()
            let cl = stroke(cloud, c, 2.6, at: 0); cl.fillColor = c.withAlphaComponent(0.18).cgColor
            root.addSublayer(cl)
            let rain = CALayer(); rain.frame = box
            rain.addSublayer(stroke(line(44, 60, 40, 72) + line(56, 60, 52, 74) + line(68, 60, 64, 72) + line(80, 60, 76, 74), c, 2, at: 0.3, draw: 0.2))
            let fall = CABasicAnimation(keyPath: "transform.translation.y"); fall.fromValue = -2; fall.toValue = 10
            fall.duration = 0.5; fall.beginTime = CACurrentMediaTime() + 0.3; fall.repeatCount = 2; fall.fillMode = .both
            rain.add(fall, forKey: "fall")
            root.addSublayer(rain)
        case .plague:
            // 几缕疫气盘旋升起。
            for (i, x) in [44.0, 60, 76].enumerated() {
                let wisp = UIBezierPath(); wisp.move(to: CGPoint(x: x, y: 84))
                wisp.addCurve(to: CGPoint(x: x + 4, y: 40), controlPoint1: CGPoint(x: x + 12, y: 70), controlPoint2: CGPoint(x: x - 10, y: 54))
                root.addSublayer(stroke(wisp, c, 2.2, at: Double(i) * 0.1))
                root.addSublayer(stroke(UIBezierPath(arcCenter: CGPoint(x: x + 4, y: 36), radius: 4, startAngle: .pi / 2, endAngle: .pi * 2.2, clockwise: true), c, 1.8, at: 0.35 + Double(i) * 0.06, draw: 0.25))
            }
            let rise = CABasicAnimation(keyPath: "transform.translation.y"); rise.fromValue = 6; rise.toValue = -6
            rise.duration = duration; rise.fillMode = .forwards; rise.isRemovedOnCompletion = false
            root.add(rise, forKey: "rise")
        case .regime:
            // 一笔圆转：近乎合拢的圆，末端带箭头（改制更替）。
            let wheel = UIBezierPath(arcCenter: CGPoint(x: 60, y: 56), radius: 22, startAngle: -.pi / 2, endAngle: .pi * 1.3, clockwise: true)
            root.addSublayer(stroke(wheel, c, 3, at: 0, draw: 0.55))
            let tip = CGPoint(x: 60 + cos(Double.pi * 1.3) * 22, y: 56 + sin(Double.pi * 1.3) * 22)
            root.addSublayer(stroke(line(tip.x, tip.y, tip.x + 9, tip.y - 2) + line(tip.x, tip.y, tip.x + 3, tip.y + 9), c, 3, at: 0.5, draw: 0.15))
        case .coup:
            // 一圈冠环，被一刀斩断。
            root.addSublayer(stroke(UIBezierPath(ovalIn: CGRect(x: 40, y: 36, width: 40, height: 40)), c, 3, at: 0))
            root.addSublayer(stroke(line(30, 84, 92, 28), vermilion, 3.4, at: 0.4, draw: 0.15))
        case .destroyed:
            break
        }
        return root
    }

    private static func line(_ x1: Double, _ y1: Double, _ x2: Double, _ y2: Double) -> UIBezierPath {
        let p = UIBezierPath(); p.move(to: CGPoint(x: x1, y: y1)); p.addLine(to: CGPoint(x: x2, y: y2)); return p
    }
    /// 一笔：沿路径画出（strokeEnd 0→1，缓出），圆头。
    private static func stroke(_ path: UIBezierPath, _ color: UIColor, _ width: CGFloat, at delay: Double, draw: Double = 0.45) -> CAShapeLayer {
        let s = CAShapeLayer(); s.frame = box; s.path = path.cgPath
        s.strokeColor = color.withAlphaComponent(0.92).cgColor; s.fillColor = UIColor.clear.cgColor
        s.lineWidth = width; s.lineCap = .round; s.lineJoin = .round; s.strokeEnd = 0
        let a = CABasicAnimation(keyPath: "strokeEnd"); a.fromValue = 0; a.toValue = 1
        a.duration = draw; a.beginTime = CACurrentMediaTime() + delay; a.timingFunction = CAMediaTimingFunction(name: .easeOut)
        a.fillMode = .both; a.isRemovedOnCompletion = false
        s.add(a, forKey: "draw")
        return s
    }
    private static func grow(_ key: String, from: Double, delay: Double) -> CABasicAnimation {
        let a = CABasicAnimation(keyPath: key); a.fromValue = from; a.toValue = 1
        a.duration = 0.35; a.beginTime = CACurrentMediaTime() + delay; a.timingFunction = CAMediaTimingFunction(name: .easeOut)
        a.fillMode = .both; a.isRemovedOnCompletion = false
        return a
    }
}

private func + (a: UIBezierPath, b: UIBezierPath) -> UIBezierPath { let p = UIBezierPath(); p.append(a); p.append(b); return p }
