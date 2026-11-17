import Foundation

// 不依赖 simd 模块（Core 也在 Windows 上编译远程计算服务）。
@inline(__always) func washLength(_ v: SIMD2<Float>) -> Float { (v.x * v.x + v.y * v.y).squareRoot() }
@inline(__always) func washDistance(_ a: SIMD2<Float>, _ b: SIMD2<Float>) -> Float { washLength(a - b) }
@inline(__always) func washDistance2(_ a: SIMD2<Float>, _ b: SIMD2<Float>) -> Float { let d = a - b; return d.x * d.x + d.y * d.y }

// 战争晕染（沙盘墨场）：进攻方的颜色像墨落在宣纸上，跟着军队走。
//
// 1.18.0 按州算“进度前沿”，交战州另画“战场地面”，两套各算各的，相邻战区有的州空着；1.19.0 改成全图逐顶点的墨场，
// 但墨按推演步落在格子顶点上（顶点间距与墨迹宽度相近），手机上墨迹一段一段、跟不上军队图标。
//
// 现在：
// - 军队墨迹在 GPU 上逐帧落墨（Render/Ink.swift，强度公式见 InkPlan）：按图标此刻画出的位置画胶囊笔触，
//   驻留按推演天数洇开，围城在州内从进攻军处铺开，守军擦淡敌墨，整张按天褪色；几处战场落在同一张纹理上。
// - 颜色真的变了的州（攻占、反叛、割地、改朝换代在着色视图里的换色）由 FlipSweep 从种子点扫色；
//   政变、复辟等大事另有一道从首都扫过全国的墨圈。
//
// 纯数据与公式放在 Core（可测试、确定性），渲染端只上传顶点与每帧几个参数。

/// 地图的格子拓扑：陆地格子的邻接（只认共享一段真实边，角点接触不算）、每州格子、每州邻州、顶点所属的州。
public final class WashTopology: @unchecked Sendable {
    public let cellCount: Int
    let offsets: [UInt32]
    let vertices: [Float]
    public let site: [SIMD2<Float>]
    public let province: [Int32]
    public let area: [Float]
    /// 陆地邻格（CSR）：nbList[nbStart[c] ..< nbStart[c + 1]]。
    let nbStart: [Int32], nbList: [Int32]
    public let provinceCells: [[Int32]]
    /// 共享陆地边的邻州（不含只在角点相接的）。
    public let provinceNeighbors: [[Int32]]
    /// 顶点所属的州（海上为 −1）。
    public let vertexProvince: [Int32]
    /// 尺度：各州等效半径的中位数（世界单位）。墨的宽度、柔边、纹理与扩散速度都按它取，整张图统一。
    public let scale: Float
    /// 几何指纹：地图几何不变时拓扑可复用。
    public let key: Int

    public var vertexCount: Int { vertices.count / 2 }

    public static func key(of map: WorldMap) -> Int {
        var h = Hasher(); h.combine(map.cellCount); h.combine(map.vertices.count); h.combine(map.meta.provinces.count); h.combine(map.edges.count)
        if let x = map.vertices.first { h.combine(x) }
        if let y = map.vertices.last { h.combine(y) }
        return h.finalize()
    }

    public convenience init(map: WorldMap) {
        let land = (0..<map.cellCount).map { map.isLand($0) }
        let edges = map.edges.map { e -> (Int, Int, Float) in (Int(e.a), Int(e.b), washLength(SIMD2(e.x2 - e.x1, e.y2 - e.y1))) }
        self.init(offsets: map.offsets, vertices: map.vertices, sites: map.sites, province: map.province, land: land, edges: edges,
                  provinceCount: map.meta.provinces.count, key: WashTopology.key(of: map))
    }

    public init(offsets: [UInt32], vertices: [Float], sites: [Float], province: [Int32], land: [Bool], edges: [(Int, Int, Float)], provinceCount: Int, key: Int = 0) {
        let n = province.count
        cellCount = n; self.offsets = offsets; self.vertices = vertices; self.province = province; self.key = key
        // 面积与格心（格心优先用 Voronoi 站点，缺失时用多边形顶点平均）。
        var area = [Float](repeating: 0, count: n), site = [SIMD2<Float>](repeating: .zero, count: n)
        for c in 0..<n {
            let s = Int(offsets[c]), e = Int(offsets[c + 1])
            var a: Float = 0, mean = SIMD2<Float>(0, 0)
            for v in s..<e {
                let w = v + 1 < e ? v + 1 : s
                let p = SIMD2(vertices[v * 2], vertices[v * 2 + 1]), q = SIMD2(vertices[w * 2], vertices[w * 2 + 1])
                a += p.x * q.y - q.x * p.y; mean += p
            }
            area[c] = abs(a) / 2
            site[c] = sites.count >= n * 2 ? SIMD2(sites[c * 2], sites[c * 2 + 1]) : (e > s ? mean / Float(e - s) : .zero)
        }
        self.area = area; self.site = site
        // 邻接：两侧都是陆地、边长大于极小值（角点接触的退化边不算连通）。
        var degree = [Int32](repeating: 0, count: n + 1)
        var pairs = [(Int32, Int32)]()
        var pn = [Set<Int32>](repeating: [], count: provinceCount)
        for (a, b, len) in edges where a >= 0 && b >= 0 && a < n && b < n && a != b && land[a] && land[b] && len > 1e-4 {
            pairs.append((Int32(a), Int32(b))); degree[a] += 1; degree[b] += 1
            let pa = Int(province[a]), pb = Int(province[b])
            if pa >= 0, pb >= 0, pa != pb, pa < provinceCount, pb < provinceCount { pn[pa].insert(Int32(pb)); pn[pb].insert(Int32(pa)) }
        }
        var start = [Int32](repeating: 0, count: n + 1)
        for c in 0..<n { start[c + 1] = start[c] + degree[c] }
        var fill = start, list = [Int32](repeating: 0, count: Int(start[n]))
        for (a, b) in pairs { list[Int(fill[Int(a)])] = b; fill[Int(a)] += 1; list[Int(fill[Int(b)])] = a; fill[Int(b)] += 1 }
        nbStart = start; nbList = list
        provinceNeighbors = pn.map { $0.sorted() }
        var cells = [[Int32]](repeating: [], count: provinceCount)
        for c in 0..<n where land[c] { let p = Int(province[c]); if p >= 0 && p < provinceCount { cells[p].append(Int32(c)) } }
        provinceCells = cells
        // 顶点所属的州。
        var vp = [Int32](repeating: -1, count: vertices.count / 2)
        for c in 0..<n { for v in Int(offsets[c])..<Int(offsets[c + 1]) { vp[v] = land[c] && Int(province[c]) < provinceCount ? province[c] : -1 } }
        vertexProvince = vp
        // 尺度：各州等效半径 √(面积/π) 的中位数。
        var radii = cells.compactMap { list -> Float? in
            guard !list.isEmpty else { return nil }
            var a: Float = 0; for c in list { a += area[Int(c)] }
            return (a / .pi).squareRoot()
        }
        radii.sort()
        scale = radii.isEmpty ? 10 : max(0.5, radii[radii.count / 2])
    }

    @inline(__always) func neighbors(_ c: Int) -> ArraySlice<Int32> { nbList[Int(nbStart[c])..<Int(nbStart[c + 1])] }
    @inline(__always) public func position(_ v: Int) -> SIMD2<Float> { SIMD2(vertices[v * 2], vertices[v * 2 + 1]) }
    @inline(__always) public func vertexRange(_ c: Int) -> Range<Int> { Int(offsets[c])..<Int(offsets[c + 1]) }

    /// 州心（格心按面积加权）。
    public func centroid(_ p: Int) -> SIMD2<Float> {
        guard provinceCells.indices.contains(p), !provinceCells[p].isEmpty else { return .zero }
        var sum = SIMD2<Float>(0, 0), w: Float = 0
        for c in provinceCells[p] { let a = max(1e-6, area[Int(c)]); sum += site[Int(c)] * a; w += a }
        return sum / w
    }
}

/// 推演每步给出的墨场输入。
public struct WashInput: Equatable, Sendable {
    public enum Kind: Int, Sendable {
        /// 围城：progress 为占领进度，armies 为进攻方在该州的军队位置。
        case siege
        /// 攻占：该州刚易主给 attacker（有军队或围城），armies 为军队位置。
        case capture
        /// 行军：attacker 的一支军队在敌境，armies = [上一步位置, 这一步位置]，troops 为兵力。
        case march
        /// 守军：attacker（守方）的一支军队在本土与敌相持，armies = [位置]，把周围的敌墨推回。
        case hold
    }
    public var province: Int
    public var attacker: Int
    public var kind: Kind
    public var progress: Float
    /// 发生的推演日。
    public var day: Int
    public var armies: [SIMD2<Float>]
    public var troops: Float
    /// 军队标识（行军、守军）：渲染端按它取图标此刻画出的位置。
    public var key: String
    public init(province: Int, attacker: Int, kind: Kind, progress: Float = 0, day: Int, armies: [SIMD2<Float>] = [], troops: Float = 0, key: String = "") {
        self.province = province; self.attacker = attacker; self.kind = kind; self.progress = progress; self.day = day; self.armies = armies; self.troops = troops; self.key = key
    }
}

/// 一步推演的全部墨场输入。
public struct WashFrame: Equatable, Sendable {
    public var day: Int
    public var inputs: [WashInput]
    /// 落墨方 → 它的敌国：行军与驻留只染敌国领土（借道友邦、本国领土不染）。
    public var enemies: [Int: [Int]]
    /// 政变、复辟、改制等不换颜色的大事：从这些国家的首都扫过全国的墨圈。
    public var ripples: [Int] = []
    public init(day: Int, inputs: [WashInput], enemies: [Int: [Int]] = [:], ripples: [Int] = []) { self.day = day; self.inputs = inputs; self.enemies = enemies; self.ripples = ripples }
    public static let empty = WashFrame(day: 0, inputs: [])

    /// 输入的确定顺序（与传入顺序无关）。
    public static func order(_ a: WashInput, _ b: WashInput) -> Bool {
        if a.kind != b.kind { return a.kind.rawValue < b.kind.rawValue }
        if a.province != b.province { return a.province < b.province }
        if a.attacker != b.attacker { return a.attacker < b.attacker }
        if a.key != b.key { return a.key < b.key }
        let pa = a.armies.last ?? .zero, pb = b.armies.last ?? .zero
        if pa.x != pb.x { return pa.x < pb.x }
        return pa.y < pb.y
    }

    /// 由相邻两步推演状态得出输入。
    /// - 行军：军队所在州的主人是它的敌国；上一步位置取同一支军队（离得太远视为调动/新编，只落这一步的点）。
    /// - 守军：军队在本国州，而该州有敌军或敌方围城。
    /// - 围城：进攻方 ≠ 守方且进度 > 0.5%。
    /// - 攻占：某州易主，且新主人上一步在此围城、或其军队这一步或上一步就在此州（无守军时到达即占）。
    ///   和约割地、附庸并入等没有军队的易主不算攻占（由陆地颜色渐变处理）。
    public static func from(previous: GameState?, next: GameState, jump: Float = .infinity) -> WashFrame {
        var inputs = [WashInput]()
        let owners = next.owners
        func owner(_ p: Int) -> Int { owners.indices.contains(p) ? owners[p] : -1 }
        var before = [String: GameState.Army]()
        for a in previous?.armies ?? [] { before[a.id] = a }
        var contested = Set<Int>()
        for a in next.armies where a.troops > 0 { let o = owner(a.province); if o >= 0, next.atWar(a.nation, o) { contested.insert(a.province) } }
        for s in next.sieges where s.progress > 0.005 { contested.insert(s.province) }
        var marchers = Set<Int>()
        for a in next.armies where a.troops > 0 && a.province >= 0 {
            let o = owner(a.province), at = SIMD2(a.x, a.y)
            if o >= 0, o != a.nation, next.atWar(a.nation, o) {
                var from = at
                if let b = before[a.id], washDistance(SIMD2(b.x, b.y), at) <= jump { from = SIMD2(b.x, b.y) }
                inputs.append(WashInput(province: a.province, attacker: a.nation, kind: .march, day: next.day, armies: [from, at], troops: Float(a.troops), key: a.id))
                marchers.insert(a.nation)
            } else if o == a.nation, contested.contains(a.province) {
                inputs.append(WashInput(province: a.province, attacker: a.nation, kind: .hold, day: next.day, armies: [at], troops: Float(a.troops), key: a.id))
            }
        }
        func armies(_ s: GameState?, _ nation: Int, _ p: Int) -> [SIMD2<Float>] {
            (s?.armies ?? []).filter { $0.nation == nation && $0.province == p && $0.troops > 0 }.map { SIMD2($0.x, $0.y) }
        }
        for s in next.sieges where s.progress > 0.005 {
            let o = owner(s.province)
            guard o >= 0, o != s.nation else { continue }
            inputs.append(WashInput(province: s.province, attacker: s.nation, kind: .siege, progress: Float(min(1, s.progress)), day: next.day, armies: armies(next, s.nation, s.province)))
            marchers.insert(s.nation)
        }
        if let previous, previous.owners.count == owners.count {
            for p in owners.indices where previous.owners[p] != owners[p] && owners[p] >= 0 {
                let n = owners[p]
                let besieged = previous.sieges.contains { $0.province == p && $0.nation == n }
                var at = armies(next, n, p); if at.isEmpty { at = armies(previous, n, p) }
                guard besieged || !at.isEmpty else { continue }
                inputs.append(WashInput(province: p, attacker: n, kind: .capture, progress: 1, day: next.day, armies: at))
            }
        }
        var enemies = [Int: [Int]]()
        for n in marchers.sorted() where next.nations.indices.contains(n) { enemies[n] = next.nations[n].enemies.sorted() }
        return WashFrame(day: next.day, inputs: inputs.sorted(by: WashFrame.order), enemies: enemies)
    }
}

/// GPU 墨场每帧落墨的强度公式。渲染端（Render/Ink.swift）按它算每一笔的不透明度，着色器里的横向衰减曲线与
/// `falloff` 相同；测试用同样的公式在 CPU 上复算，验证墨迹连续、与帧率无关。
///
/// 墨场是一张世界坐标的纹理（预乘的国色 + 浓度），每帧：
/// - 行军：从上一帧落墨处到军队此刻画出的位置画一段笔触（跟着图标走，不按推演步一段一段地落）。
///   行军笔触两端齐平（只画线段投影 0…1 之内），相邻两帧首尾相接、不重叠，路上每一点恰好被一笔盖到，
///   所以浓度与帧率、行军速度都无关；原地驻留的笔触（a = b）是圆的；
/// - 驻留：以军队为中心按推演天数洇开（暂停时不长）；
/// - 守军：按天把身边的墨擦淡；
/// - 围城：在被围州的三角形里，以进攻军为中心、半径随进度长到铺满（只画在州内，取较浓者）；
/// - 整张按天褪色。
/// 几路军队、几处战场的墨落在同一张纹理上，叠在一起自然连成一片。
public enum InkPlan {
    /// 墨迹的横向衰减：距中心线 d、半径 r（着色器 inkStampFragment 用同一条曲线）。
    @inline(__always) public static func falloff(_ d: Float, _ r: Float) -> Float { let q = d / max(r, 1e-4); return exp(-2.5 * q * q) }
    /// 行军墨迹中心的浓度。
    public static let trailCore: Float = 0.72
    /// 这一帧走了 len（世界单位）：每笔的不透明度。笔触两端齐平、首尾相接，每一点只被一笔盖到，
    /// 所以就是 trailCore；原地不动不落行军墨。
    public static func trailAlpha(len: Float, radius r: Float) -> Float { len > 1e-4 ? trailCore : 0 }
    /// 笔触在采样点 p 处的强度：a → b 两端齐平（a = b 时为圆点），横向按 falloff。着色器 inkStrength 同一算法。
    public static func stroke(_ p: SIMD2<Float>, _ a: SIMD2<Float>, _ b: SIMD2<Float>, radius r: Float, alpha: Float) -> Float {
        let ab = b - a, l2 = ab.x * ab.x + ab.y * ab.y
        if l2 <= 1e-8 { return alpha * falloff(washLength(p - a), r) }
        let ap = p - a, raw = (ap.x * ab.x + ap.y * ab.y) / l2
        guard raw >= 0, raw < 1 else { return 0 }
        return alpha * falloff(washLength(p - (a + ab * raw)), r)
    }
    /// 驻留：中心每推演一天洇开的速率；dwellAlpha(days) 为这一帧的不透明度。
    public static let dwellRate: Float = 0.22
    public static func dwellAlpha(days: Float) -> Float { 1 - exp(-dwellRate * max(0, days)) }
    /// 褪色：每天乘以 decay(1)。
    public static let decayRate: Float = 0.03
    public static func decay(days: Float) -> Float { exp(-decayRate * max(0, days)) }
    /// 守军擦墨。
    public static func holdAlpha(days: Float) -> Float { 1 - exp(-0.45 * max(0, days)) }
    /// 围城：以军队为中心、半径随进度长到铺满（far：中心到本州最远点）。
    public static func siegeRadius(progress q: Float, far: Float, scale: Float) -> Float { q >= 0.98 ? far + scale : max(0, q) * (far + scale * 0.3) }
    /// 围城处的浓度（距中心 d）。
    public static func siegeCover(distance d: Float, radius: Float, scale: Float) -> Float { min(0.9, max(0, 0.5 + (radius - d) / (scale * 0.45))) }
    /// 兵力系数（墨的宽窄）与半径。
    public static func width(troops: Float) -> Float { min(1.3, max(0.8, (max(100, troops) / 4000).squareRoot())) }
    public static func trailRadius(scale: Float, troops: Float) -> Float { scale * 0.4 * width(troops: troops) }
    public static func dwellRadius(scale: Float, troops: Float) -> Float { scale * 0.85 * width(troops: troops) }
    public static func holdRadius(scale: Float) -> Float { scale * 0.8 }
    /// 显示阈值：浓度过此值才见色（着色器 inkComposite）。
    public static let visible: Float = 0.3

    /// 推演天数的消耗：一步来了几天，就在这一步的动画时长里匀速用掉；暂停后用完即停，不再落墨。
    public struct Clock: Sendable {
        public private(set) var left: Float = 0
        public private(set) var rate: Float = 0
        public init() {}
        public mutating func add(days: Float, over seconds: Float) {
            guard days > 0 else { return }
            left = min(left + days, 120); rate = left / max(0.1, seconds)
        }
        public mutating func take(_ dt: Float) -> Float {
            guard left > 0, dt > 0 else { return 0 }
            let d = min(left, rate * dt); left -= d; return d
        }
        public mutating func reset() { left = 0; rate = 0 }
    }
}

/// 易主扫色（逐顶点）：攻占、反叛、割地、改朝换代等让某些州换了颜色时，新颜色从种子点（攻占的军队、新主人的首都）
/// 沿距离扫过去：底色立即换成新色，未到达处盖旧色，前沿一道淡墨湿边，到达处旧色余韵淡去。
/// 同一组种子的州共用一条前沿（从离种子最近处起），一组总时长不超过 maxSeconds。
/// “墨圈”模式（政变、复辟等不换颜色的大事）：颜色不变，只有一道湿边从首都扫过全国。
public final class FlipSweep {
    public let topology: WashTopology
    /// 每个顶点新色到达的时刻（渲染时钟秒）。
    public private(set) var arrive: [Float]
    /// 每个顶点的模式：1 换色，0 墨圈，−1 不在扫。
    public private(set) var mode: [Float]
    /// 正在扫的格子（升序）。
    public private(set) var active: [Int32] = []
    /// 正在扫的州 → 收尾时刻。
    public private(set) var ends: [Int: Float] = [:]
    public private(set) var revision = 0
    /// 一组最长时长、前沿柔边（秒）、到达后旧色余韵（秒）。
    public static let maxSeconds: Float = 2.4
    public static let edge: Float = 0.22
    public static let after: Float = 0.6
    /// 基本扫速（世界单位/秒）。
    public var speed: Float { topology.scale * 2.4 }

    public init(topology: WashTopology) {
        self.topology = topology
        arrive = Array(repeating: 0, count: topology.vertexCount)
        mode = Array(repeating: -1, count: topology.vertexCount)
    }

    public var isEmpty: Bool { ends.isEmpty }
    public func animating(at now: Float) -> Bool { !ends.isEmpty }

    /// 顶点 v 在时刻 t 被新色覆盖的程度（0…1，与着色器同一曲线，不含纸纹）。
    public func reached(_ v: Int, at t: Float) -> Float {
        guard mode[v] >= 0 else { return 1 }
        let x = min(1, max(0, ((t - arrive[v]) / Self.edge + 1) / 2))
        return x * x * (3 - 2 * x)
    }

    /// 开始扫。每组：这些州、种子点（空则取第一州的州心）。`recolour` 为假是墨圈模式（正在换色的州不被墨圈打断）。
    /// 返回接手的州。
    @discardableResult
    public func start(_ groups: [(provinces: [Int], seeds: [SIMD2<Float>])], recolour: Bool, now: Float) -> [Int] {
        let t = topology
        var taken = [Int]()
        for g in groups {
            let list = g.provinces.filter { t.provinceCells.indices.contains($0) && !t.provinceCells[$0].isEmpty }.filter { recolour || ends[$0] == nil }
            guard !list.isEmpty else { continue }
            let seeds = g.seeds.isEmpty ? [t.centroid(list[0])] : g.seeds
            var dist = [(Int, Float)](), lo = Float.infinity, hi: Float = 0
            for p in list {
                for c in t.provinceCells[p] {
                    for v in t.vertexRange(Int(c)) {
                        let x = t.position(v)
                        var d = Float.infinity
                        for s in seeds { d = min(d, washDistance2(x, s)) }
                        d = d.squareRoot()
                        dist.append((v, d)); lo = min(lo, d); hi = max(hi, d)
                    }
                }
            }
            let speed = max(self.speed, (hi - lo) / Self.maxSeconds)
            for (v, d) in dist { arrive[v] = now + (d - lo) / speed; mode[v] = recolour ? 1 : 0 }
            let end = now + (hi - lo) / speed + Self.edge + Self.after + 0.05
            for p in list { ends[p] = end; taken.append(p) }
        }
        guard !taken.isEmpty else { return [] }
        var cells = Set(active)
        for p in taken { for c in t.provinceCells[p] { cells.insert(c) } }
        active = cells.sorted()
        revision += 1
        return taken
    }

    /// 每帧：扫完的州收尾。返回顶点数据是否变了。
    @discardableResult public func tick(_ now: Float) -> Bool {
        let done = ends.filter { now >= $0.value }.map(\.key)
        guard !done.isEmpty else { return false }
        for p in done { finish(p) }
        let gone = Set(done)
        active.removeAll { gone.contains(Int(topology.province[Int($0)])) }
        revision += 1
        return true
    }

    /// 地图视图切换（颜色含义变了）：全部收尾。
    public func clear() {
        for p in ends.keys { finish(p) }
        active = []
        revision += 1
    }

    private func finish(_ p: Int) {
        for c in topology.provinceCells[p] { for v in topology.vertexRange(Int(c)) { mode[v] = -1 } }
        ends[p] = nil
    }
}

/// 易主渐变（逐顶点）：每个顶点记住自己“从什么颜色、何时开始”变。新的归属到来时，只有颜色真的变了的顶点
/// 以当前显示的颜色为起点重新开始；其他顶点继续自己的渐变。
/// 以前全图共用一个起点与一份“上一版颜色”，渐变未完又来新颜色时上一版不更新而起点重置，
/// 几步前已变色的州被打回更早的旧色再渐变一次 —— 高倍速打仗时这些州就持续闪动。
public struct LandFade: Sendable {
    /// 每顶点 r, g, b, 开始时刻（秒，渲染时钟）。
    public private(set) var from: [Float] = []
    public private(set) var to: [Float] = []
    public static let duration: Float = 0.7
    /// 不在渐变的顶点的“开始时刻”（极早；不用无穷大，着色器里好算）。
    public static let idle: Float = -1e9
    /// 最后一个渐变结束的时刻。
    public private(set) var until: Float = -.infinity
    public init() {}

    @inline(__always) public static func ease(_ x: Float) -> Float { let t = min(1, max(0, x)); return t * t * (3 - 2 * t) }

    /// 顶点 v 在时刻 t 显示的颜色。
    public func shown(_ v: Int, at t: Float) -> SIMD3<Float> {
        let b = SIMD3(to[v * 4], to[v * 4 + 1], to[v * 4 + 2])
        guard from.count == to.count else { return b }
        let a = SIMD3(from[v * 4], from[v * 4 + 1], from[v * 4 + 2])
        return a + (b - a) * Self.ease((t - from[v * 4 + 3]) / Self.duration)
    }
    public func fading(at t: Float) -> Bool { t < until }

    /// 安装新颜色。`fade`：归属变化（渐变）；否则视图切换等（变了的顶点立即到位）。
    /// `instant(v)`：由晕染接手的顶点（底色立即换，过渡由晕染画）。返回颜色变了的顶点数。
    @discardableResult public mutating func set(_ next: [Float], at t: Float, fade: Bool, instant: (Int) -> Bool = { _ in false }) -> Int {
        guard to.count == next.count, from.count == next.count else {
            to = next
            from = next
            for v in 0..<(next.count / 4) { from[v * 4 + 3] = Self.idle }
            until = -.infinity
            return next.count / 4
        }
        var changed = 0
        for v in 0..<(next.count / 4) {
            let i = v * 4
            guard next[i] != to[i] || next[i + 1] != to[i + 1] || next[i + 2] != to[i + 2] else { continue }
            changed += 1
            if fade && !instant(v) {
                let c = shown(v, at: t)
                from[i] = c.x; from[i + 1] = c.y; from[i + 2] = c.z; from[i + 3] = t
                until = max(until, t + Self.duration)
            } else {
                from[i] = next[i]; from[i + 1] = next[i + 1]; from[i + 2] = next[i + 2]; from[i + 3] = Self.idle
            }
            to[i] = next[i]; to[i + 1] = next[i + 1]; to[i + 2] = next[i + 2]; to[i + 3] = next[i + 3]
        }
        return changed
    }
}
