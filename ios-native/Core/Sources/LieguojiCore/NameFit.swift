import Foundation

/// 国名排布（屏幕坐标）：大名先排；一个名字与已排好的相撞时不直接隐去，依次试——
/// 原位缩小一档、两档，再沿字的法向上下、沿字向左右挪开（缩小一档），只取四角仍在本国境内的位置。
/// 上一帧用过的候选先试（不来回跳），全都放不下才等放大后再显示。
public enum NameFit {
    /// 屏幕上的一个名字：中心、半宽半高与倾角。
    public struct Box: Equatable, Sendable {
        public let x, y, halfW, halfH, cosine, sine: Double
        public let nation: Bool
        public let text: String
        public init(x: Double, y: Double, halfW: Double, halfH: Double, angle: Double, nation: Bool, text: String) {
            self.x = x; self.y = y; self.halfW = halfW; self.halfH = halfH; cosine = cos(angle); sine = sin(angle); self.nation = nation; self.text = text
        }
        init(x: Double, y: Double, halfW: Double, halfH: Double, cosine: Double, sine: Double, nation: Bool, text: String) {
            self.x = x; self.y = y; self.halfW = halfW; self.halfH = halfH; self.cosine = cosine; self.sine = sine; self.nation = nation; self.text = text
        }
        var reach: Double { (halfW * halfW + halfH * halfH).squareRoot() }
        /// 四角（略内收），用于境内判定。
        public func corners(inset: Double = 0.85) -> [(x: Double, y: Double)] {
            [(-1.0, -1.0), (1, -1), (1, 1), (-1, 1)].map { s in
                let u = s.0 * halfW * inset, v = s.1 * halfH * inset
                return (x + u * cosine - v * sine, y + u * sine + v * cosine)
            }
        }
    }

    /// 两个倾斜名字是否相交（分离轴）；同名的两块国名还要隔开一些。
    public static func clash(_ a: Box, _ b: Box, margin: Double) -> Bool {
        let dx = b.x - a.x, dy = b.y - a.y, far = a.reach + b.reach + margin, gap = dx * dx + dy * dy
        if a.nation && b.nation && a.text == b.text {
            let apart = (a.halfW + b.halfW) * 1.6
            if gap < apart * apart { return true }
        }
        if gap > far * far { return false }
        for (ux, uy) in [(a.cosine, a.sine), (-a.sine, a.cosine), (b.cosine, b.sine), (-b.sine, b.cosine)] {
            func radius(_ q: Box) -> Double { q.halfW * abs(q.cosine * ux + q.sine * uy) + q.halfH * abs(-q.sine * ux + q.cosine * uy) }
            if abs(dx * ux + dy * uy) > radius(a) + radius(b) + margin { return false }
        }
        return true
    }

    /// 候选：缩放倍数与沿字（along）、沿法向（across）的位移（以名字半宽、半高为单位）。
    public struct Candidate: Equatable, Sendable { public let scale: Double; public let along: Double; public let across: Double }
    public static let candidates: [Candidate] = [
        .init(scale: 1, along: 0, across: 0), .init(scale: 0.82, along: 0, across: 0), .init(scale: 0.68, along: 0, across: 0),
        .init(scale: 0.82, along: 0, across: -2.3), .init(scale: 0.82, along: 0, across: 2.3),
        .init(scale: 0.82, along: -0.7, across: 0), .init(scale: 0.82, along: 0.7, across: 0),
        .init(scale: 0.68, along: 0, across: -3.2), .init(scale: 0.68, along: 0, across: 3.2),
        // 单州小国：刚好越过自己的首都圈、又不出州的一小步。
        .init(scale: 0.82, along: 0, across: -1.9), .init(scale: 0.82, along: 0, across: 1.9),
    ]

    /// 为一个名字选位置：`base` 是原位原大的框，`minHalfH` 是还能看清的最小半高；`inside(x, y)` 判断屏幕点
    /// 是否在本国境内（nil 表示不限，如文化等分组名只缩小不挪位）；`preferred` 是上一帧用的候选。
    /// 返回所选候选的序号与框；放不下时返回 nil。
    public static func place(_ base: Box, taken: [Box], margin: Double, minHalfH: Double, preferred: Int?, inside: ((Double, Double) -> Bool)?) -> (index: Int, box: Box)? {
        var order = Array(candidates.indices)
        if let p = preferred, order.contains(p) { order.removeAll { $0 == p }; order.insert(p, at: 0) }
        // 先严格（挪开后四角都在本国境内）；单州小国常容不下整个名字，又被自己的首都圈占住原位，
        // 这时放宽为名字中心在境内即可——宁可略出国境，也不让一个国家的名字在任何缩放下都看不到。
        for strict in [true, false] {
        for i in order {
            let c = candidates[i]
            let moved = c.along != 0 || c.across != 0
            if moved && inside == nil { continue }
            let hw = base.halfW * c.scale, hh = base.halfH * c.scale
            if c.scale < 1 && hh < minHalfH { continue }
            let ox = c.along * base.halfW * base.cosine - c.across * base.halfH * base.sine
            let oy = c.along * base.halfW * base.sine + c.across * base.halfH * base.cosine
            let box = Box(x: base.x + ox, y: base.y + oy, halfW: hw, halfH: hh, cosine: base.cosine, sine: base.sine, nation: base.nation, text: base.text)
            if taken.contains(where: { clash($0, box, margin: margin) }) { continue }
            if moved, let inside, !(inside(box.x, box.y) && (!strict || box.corners().allSatisfy { inside($0.x, $0.y) })) { continue }
            if !strict && !moved { continue }
            return (i, box)
        }
        }
        return nil
    }
}
