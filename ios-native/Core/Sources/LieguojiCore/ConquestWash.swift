import Foundation

// 不依赖 simd 模块（Core 也在 Windows 上编译远程计算服务）。
@inline(__always) func washLength(_ v: SIMD2<Float>) -> Float { (v.x * v.x + v.y * v.y).squareRoot() }
@inline(__always) func washDistance(_ a: SIMD2<Float>, _ b: SIMD2<Float>) -> Float { washLength(a - b) }
@inline(__always) func washDistance2(_ a: SIMD2<Float>, _ b: SIMD2<Float>) -> Float { let d = a - b; return d.x * d.x + d.y * d.y }
@inline(__always) func washDot(_ a: SIMD2<Float>, _ b: SIMD2<Float>) -> Float { a.x * b.x + a.y * b.y }

// 战争晕染（沙盘墨场）：进攻方的颜色像墨落在宣纸上，跟着军队走。
//
// 1.18.0 以前按州算：每个被围的州一块“进度前沿”，交战的州另画一块“战场地面”，两套各算各的；
// 交战州的晕染整块让位给战场地面、军队已进州但还没开始围城的州没有颜色、区域内部的州前沿要从区域边界
// 推过来才见色 —— 相邻几处同时打仗时，有的州有色、有的州空着，颜色铺得像一整片一整片地换。
//
// 现在全图只有一张逐顶点的“墨场”：
// - 行军：军队在敌境走过的路线落下一道墨（宽度随兵力），沿路线按军队实际经过的先后显现；
// - 驻留：军队停在敌境，墨以它为中心随天数洇开；
// - 围城：被围州里以进攻方军队为中心，墨的半径随占领进度长到铺满全州；
// - 守军：在本土与敌军相持的军队把周围的敌墨推回去；
// - 攻占：底色换成进攻方的那一刻，从已染处沿州内扫满全州（未到处盖旧色），然后收尾；
// - 墨随时间慢慢褪去，同一顶点上别国更浓的墨会接手。
// 所有输入落在同一张场上，相邻战区的墨自然连成一片，不再有某州单独空着。
//
// 纯数据与状态机放在 Core（可测试、确定性），渲染端（Render/Wash.swift）上传顶点与动画参数，
// 每帧只在着色器里按时刻插值，不做逐帧 CPU 工作。

/// 地图的格子拓扑：陆地格子的邻接（只认共享一段真实边，角点接触不算）、每州格子、每州邻州，
/// 以及按格心分桶的空间索引（查一段路线附近的格子）。
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
    /// 格心到自身最远顶点的距离的最大值（空间查询的余量）。
    let reach: Float
    /// 空间索引：陆地格按格心分桶（CSR）。
    let gridOrigin: SIMD2<Float>, gridSize: Float, gridW: Int, gridH: Int
    let bucketStart: [Int32], bucketCells: [Int32]
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
        // 顶点所属的州，格心到顶点的最远距离。
        var vp = [Int32](repeating: -1, count: vertices.count / 2)
        var reach: Float = 0
        for c in 0..<n {
            for v in Int(offsets[c])..<Int(offsets[c + 1]) {
                vp[v] = land[c] && Int(province[c]) < provinceCount ? province[c] : -1
                if land[c] { reach = max(reach, washDistance(site[c], SIMD2(vertices[v * 2], vertices[v * 2 + 1]))) }
            }
        }
        vertexProvince = vp; self.reach = reach
        // 尺度：各州等效半径 √(面积/π) 的中位数。
        var radii = cells.compactMap { list -> Float? in
            guard !list.isEmpty else { return nil }
            var a: Float = 0; for c in list { a += area[Int(c)] }
            return (a / .pi).squareRoot()
        }
        radii.sort()
        scale = radii.isEmpty ? 10 : max(0.5, radii[radii.count / 2])
        // 空间索引：桶边长取尺度的一半（一次查询只看几十个桶）。
        var lo = SIMD2<Float>(.infinity, .infinity), hi = SIMD2<Float>(-.infinity, -.infinity)
        for c in 0..<n where land[c] { lo = SIMD2(min(lo.x, site[c].x), min(lo.y, site[c].y)); hi = SIMD2(max(hi.x, site[c].x), max(hi.y, site[c].y)) }
        if !lo.x.isFinite { lo = .zero; hi = .zero }
        let size = max(0.25, scale * 0.5)
        let gw = max(1, min(4096, Int((hi.x - lo.x) / size) + 1)), gh = max(1, min(4096, Int((hi.y - lo.y) / size) + 1))
        gridOrigin = lo; gridSize = size; gridW = gw; gridH = gh
        var bdeg = [Int32](repeating: 0, count: gw * gh + 1)
        func bucket(_ p: SIMD2<Float>) -> Int {
            let x = min(gw - 1, max(0, Int((p.x - lo.x) / size))), y = min(gh - 1, max(0, Int((p.y - lo.y) / size)))
            return y * gw + x
        }
        for c in 0..<n where land[c] { bdeg[bucket(site[c])] += 1 }
        var bstart = [Int32](repeating: 0, count: gw * gh + 1)
        for k in 0..<(gw * gh) { bstart[k + 1] = bstart[k] + bdeg[k] }
        var bfill = bstart, blist = [Int32](repeating: 0, count: Int(bstart[gw * gh]))
        for c in 0..<n where land[c] { let k = bucket(site[c]); blist[Int(bfill[k])] = Int32(c); bfill[k] += 1 }
        bucketStart = bstart; bucketCells = blist
    }

    @inline(__always) func neighbors(_ c: Int) -> ArraySlice<Int32> { nbList[Int(nbStart[c])..<Int(nbStart[c + 1])] }
    @inline(__always) public func position(_ v: Int) -> SIMD2<Float> { SIMD2(vertices[v * 2], vertices[v * 2 + 1]) }
    @inline(__always) public func vertexRange(_ c: Int) -> Range<Int> { Int(offsets[c])..<Int(offsets[c + 1]) }

    /// 格心离线段 a→b 不超过 radius + reach 的陆地格（按格子号升序，结果确定）。
    func cells(near a: SIMD2<Float>, _ b: SIMD2<Float>, radius: Float) -> [Int32] {
        let r = radius + reach
        let x0 = max(0, Int((min(a.x, b.x) - r - gridOrigin.x) / gridSize)), x1 = min(gridW - 1, Int((max(a.x, b.x) + r - gridOrigin.x) / gridSize))
        let y0 = max(0, Int((min(a.y, b.y) - r - gridOrigin.y) / gridSize)), y1 = min(gridH - 1, Int((max(a.y, b.y) + r - gridOrigin.y) / gridSize))
        guard x0 <= x1, y0 <= y1 else { return [] }
        var out = [Int32]()
        let seg = b - a, len2 = washDot(seg, seg)
        for y in y0...y1 {
            for x in x0...x1 {
                let k = y * gridW + x
                for i in Int(bucketStart[k])..<Int(bucketStart[k + 1]) {
                    let c = bucketCells[i], s = site[Int(c)]
                    let u = len2 > 1e-9 ? min(1, max(0, washDot(s - a, seg) / len2)) : 0
                    if washDistance2(s, a + seg * u) <= r * r { out.append(c) }
                }
            }
        }
        return out.sorted()
    }

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
    public init(province: Int, attacker: Int, kind: Kind, progress: Float = 0, day: Int, armies: [SIMD2<Float>] = [], troops: Float = 0) {
        self.province = province; self.attacker = attacker; self.kind = kind; self.progress = progress; self.day = day; self.armies = armies; self.troops = troops
    }
}

/// 一步推演的全部墨场输入。
public struct WashFrame: Equatable, Sendable {
    public var day: Int
    public var inputs: [WashInput]
    /// 落墨方 → 它的敌国：行军与驻留只染敌国领土（借道友邦、本国领土不染）。
    public var enemies: [Int: [Int]]
    public init(day: Int, inputs: [WashInput], enemies: [Int: [Int]] = [:]) { self.day = day; self.inputs = inputs; self.enemies = enemies }
    public static let empty = WashFrame(day: 0, inputs: [])

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
                inputs.append(WashInput(province: a.province, attacker: a.nation, kind: .march, day: next.day, armies: [from, at], troops: Float(a.troops)))
                marchers.insert(a.nation)
            } else if o == a.nation, contested.contains(a.province) {
                inputs.append(WashInput(province: a.province, attacker: a.nation, kind: .hold, day: next.day, armies: [at], troops: Float(a.troops)))
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
        return WashFrame(day: next.day, inputs: inputs.sorted(by: WashBook.order), enemies: enemies)
    }
}

/// 墨场状态机。逐顶点（地图顶点，各格自己的拷贝）记：哪国的墨（stain）、逻辑浓度（level，0…maxLevel，
/// 着色在 0.5 附近过渡）与显示动画（from → to，自 start 起历时 length，平滑插值）。
/// 输入每步来一次；显示由着色器按时刻插值，状态机只在输入、易主、收尾时改动顶点。
public final class WashBook {
    public let topology: WashTopology
    public private(set) var stain: [Int32]
    public private(set) var level: [Float]
    public private(set) var from: [Float]
    public private(set) var to: [Float]
    public private(set) var start: [Float]
    public private(set) var length: [Float]
    /// 易主时刻（该州底色已换成墨的主人；未到达处盖旧色）。未易主为 LandFade.idle。
    public private(set) var flipAt: [Float]
    /// 有墨（或墨正在褪去、正在易主扫满）的格子，升序。
    public private(set) var active: [Int32] = []
    private var isActive: [Bool]
    /// 顶点数据变了：渲染端据此重建缓冲。
    public private(set) var revision = 0
    /// 最后一段动画结束的时刻：之后画面静止，不必连续重绘。
    public private(set) var busyUntil: Float = -.infinity
    /// 输入间隔（渲染时钟秒）：一步的落墨按它铺开，跟上军队图标的插值移动。
    public private(set) var stepSeconds: Float = 0.6
    private var lastDay: Int?
    private var lastNow: Float?
    /// 刚攻占、等底色换过来的州：进攻方、军队位置、登记时刻。
    private var pending: [Int: (attacker: Int, at: SIMD2<Float>?, time: Float)] = [:]
    /// 正在易主扫满的州 → 收尾时刻。
    public private(set) var flipping: [Int: Float] = [:]
    /// 被围州最近一次的进攻方军队位置（军队暂离时围城仍从这里长）。
    private var siegeCenter: [Int: SIMD2<Float>] = [:]
    private var sweep = false
    private var added = [Int32]()
    private var delays = [Float]()

    /// 视觉参数（浓度单位）：柔边半宽、纸纹起伏。
    public static let soft: Float = 0.12
    public static let noise: Float = 0.3
    /// 晕染着色浓度（进攻方颜色压在原色上的不透明度）。
    public static let tint: Float = 0.5
    /// 浓度上限、每天褪去、驻留每天洇开的量。
    public static let maxLevel: Float = 1.6
    public static let decayPerDay: Float = 0.03
    public static let dwellPerDay: Float = 0.11
    /// 易主扫满的速度（世界单位/秒）与每个顶点的过渡时长。
    public var spreadSpeed: Float { topology.scale * 2.4 }
    public static let sweepSeconds: Float = 0.35

    public init(topology: WashTopology) {
        self.topology = topology
        let n = topology.vertexCount
        stain = Array(repeating: -1, count: n); level = Array(repeating: 0, count: n)
        from = Array(repeating: 0, count: n); to = Array(repeating: 0, count: n)
        start = Array(repeating: 0, count: n); length = Array(repeating: 0, count: n)
        flipAt = Array(repeating: LandFade.idle, count: n)
        isActive = Array(repeating: false, count: topology.cellCount)
    }

    public var isEmpty: Bool { active.isEmpty }
    public func animating(at now: Float) -> Bool { now < busyUntil || !flipping.isEmpty || sweep }

    /// 顶点 v 在时刻 t 显示的浓度。
    @inline(__always) public func shown(_ v: Int, at t: Float) -> Float {
        let k = length[v] > 0 ? LandFade.ease((t - start[v]) / length[v]) : 1
        return from[v] + (to[v] - from[v]) * k
    }

    /// 输入的确定顺序（与传入顺序无关）。
    static func order(_ a: WashInput, _ b: WashInput) -> Bool {
        if a.kind != b.kind { return a.kind.rawValue < b.kind.rawValue }
        if a.province != b.province { return a.province < b.province }
        if a.attacker != b.attacker { return a.attacker < b.attacker }
        let pa = a.armies.last ?? .zero, pb = b.armies.last ?? .zero
        if pa.x != pb.x { return pa.x < pb.x }
        if pa.y != pb.y { return pa.y < pb.y }
        return a.troops < b.troops
    }

    /// 读档、换世界：清空，不留旧世界的墨。
    public func reset() {
        let n = topology.vertexCount
        stain = Array(repeating: -1, count: n); level = Array(repeating: 0, count: n)
        from = Array(repeating: 0, count: n); to = Array(repeating: 0, count: n)
        start = Array(repeating: 0, count: n); length = Array(repeating: 0, count: n)
        flipAt = Array(repeating: LandFade.idle, count: n)
        isActive = Array(repeating: false, count: topology.cellCount)
        active = []; pending = [:]; flipping = [:]; siegeCenter = [:]; lastDay = nil; lastNow = nil
        busyUntil = -.infinity; sweep = false; revision += 1
    }

    // MARK: 输入

    /// 新的一步：褪墨、按输入落墨，改动的顶点从当前显示值平滑过渡到新浓度。
    public func update(_ frame: WashFrame, owner: (Int) -> Int, now: Float) {
        let t = topology
        let days = lastDay.map { Float(min(60, max(0, frame.day - $0))) } ?? 0
        if let last = lastNow, now > last { stepSeconds = min(1.2, max(0.25, stepSeconds * 0.5 + (now - last) * 0.5)) }
        lastDay = frame.day; lastNow = now
        pending = pending.filter { now - $0.value.time < 3 }
        let inputs = frame.inputs.sorted(by: Self.order)
        // 攻占先登记（等底色换过来时扫满）：这一步里该州的墨不按“已成本国领土”清掉。
        for i in inputs where i.kind == .capture && t.provinceCells.indices.contains(i.province) {
            let at = i.armies.isEmpty ? nil : i.armies.reduce(SIMD2<Float>(0, 0), +) / Float(i.armies.count)
            if pending[i.province]?.attacker != i.attacker && flipping[i.province] == nil { pending[i.province] = (i.attacker, at, now) }
        }
        var next = level, nextStain = stain
        var dirty = [Int]()
        // 顶点 → 显现延迟（复用的稠密数组，−1 为未改动）。
        if delays.count != level.count { delays = Array(repeating: -1, count: level.count) }
        func touch(_ v: Int, _ delay: Float) {
            if delays[v] < 0 { delays[v] = delay; dirty.append(v) } else { delays[v] = min(delays[v], delay) }
        }
        var ownerCache = [Int32: Int]()
        func ownerOf(_ v: Int) -> Int {
            let p = t.vertexProvince[v]
            guard p >= 0 else { return -1 }
            if let o = ownerCache[p] { return o }
            let o = owner(Int(p)); ownerCache[p] = o; return o
        }
        // 1. 褪墨；已成墨主本国领土（和约割地等，不经攻占）的墨淡去。正在易主扫满、等待易主的州不动。
        for c in active {
            for v in t.vertexRange(Int(c)) where next[v] > 0 && nextStain[v] >= 0 {
                let p = Int(t.vertexProvince[v])
                if flipping[p] != nil || pending[p] != nil { continue }
                let before = next[v]
                if ownerOf(v) == Int(nextStain[v]) { next[v] = 0 } else { next[v] = max(0, next[v] - Self.decayPerDay * days) }
                if next[v] != before { touch(v, 0) }
            }
        }
        // 落墨：同国取浓者；别国的墨更浓则接手，否则被削弱。
        func apply(_ v: Int, _ nation: Int, floor: Float, add: Float, delay: Float) {
            let push = min(Self.maxLevel, floor + add)
            guard push > 1e-4 else { return }
            if nextStain[v] == Int32(nation) || nextStain[v] < 0 || next[v] <= 0 {
                let base = nextStain[v] == Int32(nation) ? next[v] : 0
                let value = min(Self.maxLevel, max(base, floor) + add)
                if value > base + 1e-4 || nextStain[v] != Int32(nation) { nextStain[v] = Int32(nation); next[v] = max(base, value); touch(v, delay) }
            } else if push > next[v] {
                nextStain[v] = Int32(nation); next[v] = push; touch(v, delay)
            } else {
                next[v] = max(0, next[v] - push * 0.5); touch(v, delay)
            }
        }
        // 2. 行军与驻留。
        for i in inputs where i.kind == .march && i.armies.count == 2 {
            let a = i.armies[0], b = i.armies[1]
            let w = min(1.35, max(0.75, (max(100, i.troops) / 4000).squareRoot()))
            let r = t.scale * 0.55 * w, R = t.scale * 1.05 * w
            let hostile = Set(frame.enemies[i.attacker] ?? [])
            let seg = b - a, len2 = washDot(seg, seg)
            for c in t.cells(near: a, b, radius: R) {
                let p = Int(t.province[Int(c)])
                guard p >= 0 else { continue }
                let o = owner(p)
                guard o >= 0, o != i.attacker, hostile.isEmpty || hostile.contains(o) else { continue }
                for v in t.vertexRange(Int(c)) {
                    let x = t.position(v)
                    let u = len2 > 1e-9 ? min(1, max(0, washDot(x - a, seg) / len2)) : 1
                    let d = washDistance(x, a + seg * u)
                    let q = d / r
                    let core: Float = q < 1 ? 1.15 * (1 - q * q) : 0
                    let dwell = days * Self.dwellPerDay * max(0, 1 - washDistance(x, b) / R)
                    apply(v, i.attacker, floor: core, add: dwell, delay: u * stepSeconds)
                }
            }
        }
        // 3. 守军推回敌墨。
        for i in inputs where i.kind == .hold && !i.armies.isEmpty {
            let at = i.armies[0]
            let R = t.scale * 0.9
            for c in t.cells(near: at, at, radius: R) where Int(t.province[Int(c)]) >= 0 && owner(Int(t.province[Int(c)])) == i.attacker {
                for v in t.vertexRange(Int(c)) where nextStain[v] >= 0 && nextStain[v] != Int32(i.attacker) && next[v] > 0 {
                    let f = max(0, 1 - washDistance(t.position(v), at) / R)
                    guard f > 0 else { continue }
                    next[v] = max(0, next[v] - (0.08 + 0.2 * days) * f); touch(v, 0)
                }
            }
        }
        // 4. 围城：以进攻方军队为中心，半径随进度长到铺满全州（权威进度，压过褪墨与守军）。
        for i in inputs where i.kind == .siege && t.provinceCells.indices.contains(i.province) && !t.provinceCells[i.province].isEmpty {
            let p = i.province
            let center: SIMD2<Float>
            if !i.armies.isEmpty {
                let mean = i.armies.reduce(SIMD2<Float>(0, 0), +) / Float(i.armies.count)
                if let old = siegeCenter[p], washDistance(old, mean) < t.scale * 0.3 { center = old } else { center = mean }
            } else {
                center = siegeCenter[p] ?? entry(p, i.attacker, owner: owner) ?? t.centroid(p)
            }
            siegeCenter[p] = center
            var far: Float = 0
            for c in t.provinceCells[p] { for v in t.vertexRange(Int(c)) { far = max(far, washDistance(t.position(v), center)) } }
            let q = min(1, max(0, i.progress))
            let radius = q >= 0.98 ? far + t.scale : q * (far + t.scale * 0.3)
            for c in t.provinceCells[p] {
                for v in t.vertexRange(Int(c)) {
                    let d = washDistance(t.position(v), center)
                    let floor = min(1.25, max(0, 0.5 + (radius - d) / (t.scale * 0.45)))
                    apply(v, i.attacker, floor: floor, add: 0, delay: 0)
                }
            }
        }
        let sieged = Set(inputs.filter { $0.kind == .siege }.map { $0.province })
        siegeCenter = siegeCenter.filter { sieged.contains($0.key) }
        // 提交：改动的顶点从当前显示值过渡到新浓度。
        for v in dirty where next[v] != level[v] || nextStain[v] != stain[v] {
            let s = shown(v, at: now)
            from[v] = nextStain[v] == stain[v] || stain[v] < 0 ? s : 0
            to[v] = next[v]; level[v] = next[v]; stain[v] = nextStain[v]
            start[v] = now + max(0, delays[v]); length[v] = stepSeconds
            busyUntil = max(busyUntil, start[v] + length[v])
            activate(cell(of: v))
        }
        for v in dirty { delays[v] = -1 }
        commitActive()
        if !dirty.isEmpty { revision += 1; sweep = true }
    }

    // 顶点 → 格子：按 offsets 二分。
    private func cell(of v: Int) -> Int {
        var lo = 0, hi = topology.cellCount - 1
        while lo < hi {
            let mid = (lo + hi + 1) / 2
            if Int(topology.offsets[mid]) <= v { lo = mid } else { hi = mid - 1 }
        }
        return lo
    }

    private func activate(_ c: Int) {
        guard !isActive[c] else { return }
        isActive[c] = true
        added.append(Int32(c))
    }
    private func commitActive() {
        guard !added.isEmpty else { return }
        active = (active + added).sorted(); added = []
    }

    /// 没有军队位置时的进入点：本州挨着进攻方领土的格心平均；没有陆上接壤为 nil。
    private func entry(_ p: Int, _ attacker: Int, owner: (Int) -> Int) -> SIMD2<Float>? {
        let t = topology
        var sum = SIMD2<Float>(0, 0), k: Float = 0
        for c in t.provinceCells[p] {
            if t.neighbors(Int(c)).contains(where: { let q = Int(t.province[Int($0)]); return q >= 0 && q != p && owner(q) == attacker }) { sum += t.site[Int(c)]; k += 1 }
        }
        return k > 0 ? sum / k : nil
    }

    // MARK: 易主

    /// 底色换了的州里，可能交给墨场接手的（刚攻占待易主、或州里已有新主人的墨）。
    public func flipCandidates(owner: (Int) -> Int) -> [Int] {
        var out = Set(pending.keys.filter { owner($0) == pending[$0]!.attacker })
        for c in active {
            let p = Int(topology.province[Int(c)])
            guard p >= 0, flipping[p] == nil, !out.contains(p) else { continue }
            let o = owner(p)
            if topology.vertexRange(Int(c)).contains(where: { stain[$0] == Int32(o) && to[$0] > 0.05 }) { out.insert(p) }
        }
        return out.sorted()
    }

    /// 底下陆地换成了新主人的颜色（渲染端在颜色安装时发现）：从已染处（没有就从攻占军队、进入边界）沿州内扫满，
    /// 未到达处盖旧色。返回接手的州：渲染端为它们记下旧色。
    public func landFlipped(_ provinces: Set<Int>, owner: (Int) -> Int, now: Float) -> [Int] {
        let t = topology
        var taken = [Int]()
        for p in provinces.sorted() where t.provinceCells.indices.contains(p) && !t.provinceCells[p].isEmpty && flipping[p] == nil {
            let n = owner(p)
            guard n >= 0 else { continue }
            var verts = [Int]()
            for c in t.provinceCells[p] { verts += t.vertexRange(Int(c)) }
            let inked = verts.contains { stain[$0] == Int32(n) && shown($0, at: now) > 0.05 }
            guard pending[p]?.attacker == n || inked else { continue }
            var seeds = verts.filter { stain[$0] == Int32(n) && shown($0, at: now) >= 0.5 }.map { t.position($0) }
            if seeds.isEmpty { seeds = [pending[p]?.at ?? entry(p, n, owner: owner) ?? t.centroid(p)] }
            if seeds.count > 256 { let step = seeds.count / 256 + 1; seeds = stride(from: 0, to: seeds.count, by: step).map { seeds[$0] } }
            var end = now
            for v in verts {
                let x = t.position(v)
                var d = Float.infinity
                for s in seeds { d = min(d, washDistance2(x, s)) }
                let delay = stain[v] == Int32(n) && shown(v, at: now) >= 0.5 ? 0 : d.squareRoot() / spreadSpeed
                let s0 = stain[v] == Int32(n) ? shown(v, at: now) : 0
                stain[v] = Int32(n); level[v] = 1.3
                from[v] = s0; to[v] = 1.3; start[v] = now + delay; length[v] = Self.sweepSeconds
                flipAt[v] = now
                end = max(end, start[v] + length[v])
            }
            for c in t.provinceCells[p] { activate(Int(c)) }
            commitActive()
            flipping[p] = max(end, now + 0.6) + 0.1
            busyUntil = max(busyUntil, flipping[p]!)
            pending[p] = nil; siegeCenter[p] = nil
            taken.append(p)
        }
        if !taken.isEmpty { revision += 1 }
        return taken
    }

    /// 地图视图切换（颜色含义变了）：易主扫满中的州直接收尾。
    public func viewChanged() {
        for p in flipping.keys.sorted() { finish(p) }
        flipping = [:]
        revision += 1
    }

    private func finish(_ p: Int) {
        for c in topology.provinceCells[p] {
            for v in topology.vertexRange(Int(c)) {
                stain[v] = -1; level[v] = 0; from[v] = 0; to[v] = 0; length[v] = 0; flipAt[v] = LandFade.idle
            }
        }
        sweep = true
    }

    /// 每帧调用：易主扫满结束的州收尾；动画都走完后把没墨的格子移出。返回顶点数据是否变了。
    @discardableResult public func tick(_ now: Float) -> Bool {
        var changed = false
        for (p, end) in flipping.sorted(by: { $0.key < $1.key }) where now >= end { finish(p); flipping[p] = nil; changed = true }
        if sweep && now >= busyUntil && flipping.isEmpty {
            sweep = false
            let before = active.count
            active.removeAll { c in
                let live = topology.vertexRange(Int(c)).contains { to[$0] > 0 || flipAt[$0] != LandFade.idle }
                if !live { isActive[Int(c)] = false; for v in topology.vertexRange(Int(c)) where level[v] <= 0 { stain[v] = -1 } }
                return !live
            }
            if active.count != before { changed = true }
        }
        if changed { revision += 1 }
        return changed
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
