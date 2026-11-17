import Foundation

// 不依赖 simd 模块（Core 也在 Windows 上编译远程计算服务）。
@inline(__always) func washLength(_ v: SIMD2<Float>) -> Float { (v.x * v.x + v.y * v.y).squareRoot() }
@inline(__always) func washDistance(_ a: SIMD2<Float>, _ b: SIMD2<Float>) -> Float { washLength(a - b) }
@inline(__always) func washDistance2(_ a: SIMD2<Float>, _ b: SIMD2<Float>) -> Float { let d = a - b; return d.x * d.x + d.y * d.y }

// 占领晕染：战争中进攻方的颜色像墨在宣纸上洇开一样推进。
//
// 以前每个州各自从自己边缘的一个锚点长出一块颜色，相邻几个州同时被占时各画一圈、在州界处断开，
// 从高处看零碎突兀。这里把同一进攻方、相邻（共享真实陆地边）的被占州并成一片“连通区域”，
// 区域内用一张世界坐标下连续的“抵达距离场”（沿陆地从进入边界出发的测地距离）驱动前沿：
// 每个州仍有自己的进度与归属，前沿是该州里“抵达距离 < 阈值”的部分；阈值以世界单位表示、
// 各州以同样的速度推进，所以前沿穿过州界时形状、方向与速度自然接续，不会每到一州重新起一圈。
//
// 纯数据与状态机放在 Core（可测试、确定性），渲染端（Render/Wash.swift）只上传顶点与每帧几个参数。

/// 地图的格子拓扑：陆地格子的邻接（只认共享一段真实边，角点接触不算）、每州格子、每州邻州、
/// 顶点到“角点”的归并（同一位置的几份顶点拷贝共享一个角点，用来让距离场跨格子连续）。
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
    /// 顶点 → 角点编号；角点 → 共享它的格子（CSR）。
    let corner: [Int32]
    let cornerStart: [Int32], cornerCells: [Int32]
    /// 顶点所属的州（海上为 −1）：易主时按州判断哪些顶点交给晕染。
    public let vertexProvince: [Int32]
    /// 尺度：各州等效半径的中位数（世界单位）。前沿柔边、纹理与速度都按它取，整张图统一。
    public let scale: Float
    /// 几何指纹：地图几何不变时拓扑可复用。
    public let key: Int

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
        // 面积与格心（格心优先用 Voronoi 站点，缺失时用多边形重心）。
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
        // 角点：同一坐标的顶点拷贝归为一个角点（Voronoi 顶点在各格里是逐位相同的拷贝）。
        let vcount = vertices.count / 2
        var ids = [UInt64: Int32](minimumCapacity: vcount / 2)
        var corner = [Int32](repeating: -1, count: vcount), vp = [Int32](repeating: -1, count: vcount)
        for c in 0..<n {
            for v in Int(offsets[c])..<Int(offsets[c + 1]) {
                let k = UInt64(vertices[v * 2].bitPattern) << 32 | UInt64(vertices[v * 2 + 1].bitPattern)
                let id: Int32
                if let found = ids[k] { id = found } else { id = Int32(ids.count); ids[k] = id }
                corner[v] = id; vp[v] = land[c] ? province[c] : -1
            }
        }
        var cdeg = [Int32](repeating: 0, count: ids.count + 1)
        for c in 0..<n { for v in Int(offsets[c])..<Int(offsets[c + 1]) { cdeg[Int(corner[v])] += 1 } }
        var cstart = [Int32](repeating: 0, count: ids.count + 1)
        for k in 0..<ids.count { cstart[k + 1] = cstart[k] + cdeg[k] }
        var cfill = cstart, clist = [Int32](repeating: 0, count: Int(cstart[ids.count]))
        for c in 0..<n { for v in Int(offsets[c])..<Int(offsets[c + 1]) { let k = Int(corner[v]); clist[Int(cfill[k])] = Int32(c); cfill[k] += 1 } }
        self.corner = corner; cornerStart = cstart; cornerCells = clist; vertexProvince = vp
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
    @inline(__always) func position(_ v: Int) -> SIMD2<Float> { SIMD2(vertices[v * 2], vertices[v * 2 + 1]) }

    /// 离某点最近的本州格子（军队所在格）。
    func nearestCell(in province: Int, to p: SIMD2<Float>) -> Int32? {
        guard provinceCells.indices.contains(province) else { return nil }
        var best: (Int32, Float)?
        for c in provinceCells[province] { let d = washDistance2(site[Int(c)], p); if best == nil || d < best!.1 { best = (c, d) } }
        return best?.0
    }
}

/// 一个州在所属区域距离场里的样子：三角形顶点（全局顶点号、位置）与每个顶点的抵达距离，
/// 以及按面积累计的距离分布（进度 ↔ 阈值互换）。
public struct WashProvinceField: Equatable, Sendable {
    public var vertex: [UInt32] = []
    /// 每个三角形顶点所在的格子（取格子的着色）。
    public var cell: [Int32] = []
    public var position: [SIMD2<Float>] = []
    public var arrival: [Float] = []
    /// 格心抵达距离升序、对应的累计面积占比（取格中点）。
    var sorted: [Float] = []
    var cumulative: [Float] = []
    public var minimum: Float = 0
    public var maximum: Float = 0

    /// 覆盖面积占比 f 对应的前沿阈值（世界单位）：f = 0 在最近的进入点，f = 1 为铺满（含柔边余量 pad）；
    /// 区间之外按距离线性外推（f = −1 为完全退出），换场时可以无损换算。
    public func threshold(_ f: Float, pad: Float) -> Float {
        if f <= 0 { return minimum + f * pad }
        let end = maximum + pad
        if f >= 1 { return end + (f - 1) * pad }
        // 分段线性：(minimum, 0) → 各格 (a, F) → (maximum + pad, 1)。
        var lastA = minimum, lastF: Float = 0
        for i in sorted.indices {
            let a = sorted[i], F = cumulative[i]
            if f <= F { return F > lastF ? lastA + (a - lastA) * (f - lastF) / (F - lastF) : a }
            lastA = a; lastF = F
        }
        return lastF < 1 ? lastA + (end - lastA) * (f - lastF) / (1 - lastF) : end
    }
    /// 阈值 T 对应的覆盖占比（threshold 的反函数）。
    public func fraction(_ t: Float, pad: Float) -> Float {
        if t <= minimum { return pad > 0 ? (t - minimum) / pad : 0 }
        let end = maximum + pad
        if t >= end { return 1 + (pad > 0 ? (t - end) / pad : 0) }
        var lastA = minimum, lastF: Float = 0
        for i in sorted.indices {
            let a = sorted[i], F = cumulative[i]
            if t <= a { return a > lastA ? lastF + (F - lastF) * (t - lastA) / (a - lastA) : F }
            lastA = a; lastF = F
        }
        return end > lastA ? lastF + (1 - lastF) * (t - lastA) / (end - lastA) : 1
    }
}

/// 连通区域的距离场：多源 Dijkstra（沿陆地格心），只在区域格子里传播。
public enum WashField {
    public struct Source: Equatable, Hashable, Sendable { public var cell: Int32; public var start: Float }

    /// 区域格子 → 抵达距离。没被任何源连到的部分（隔海的飞地、岛）各自从离提示点最近的格子起算。
    public static func arrivals(_ t: WashTopology, members: Set<Int>, sources: [Source], hints: [SIMD2<Float>]) -> [Int32: Float] {
        var cells = [Int32]()
        for p in members.sorted() where t.provinceCells.indices.contains(p) { cells += t.provinceCells[p] }
        var dist = [Int32: Float](minimumCapacity: cells.count)
        for c in cells { dist[c] = .infinity }
        var heap = WashHeap()
        for s in sources where dist[s.cell] != nil { if s.start < dist[s.cell]! { dist[s.cell] = s.start; heap.push(s.start, s.cell) } }
        func run() {
            while let (d, c) = heap.pop() {
                guard d <= dist[c]! else { continue }
                let pc = t.site[Int(c)]
                for n in t.neighbors(Int(c)) {
                    guard let old = dist[n] else { continue }
                    let nd = d + washDistance(pc, t.site[Int(n)])
                    if nd < old { dist[n] = nd; heap.push(nd, n) }
                }
            }
        }
        run()
        // 断开的部分：从离提示点（军队、源、区域中心）最近的格子单独起算，各自处理。
        while true {
            let left = cells.filter { dist[$0]! == .infinity }
            guard !left.isEmpty else { break }
            let points = hints.isEmpty ? [cells.reduce(SIMD2<Float>(0, 0)) { $0 + t.site[Int($1)] } / Float(cells.count)] : hints
            var best: (Int32, Float)?
            for c in left { let d = points.map { washDistance2($0, t.site[Int(c)]) }.min()!; if best == nil || d < best!.1 || (d == best!.1 && c < best!.0) { best = (c, d) } }
            dist[best!.0] = 0; heap.push(0, best!.0)
            run()
        }
        return dist
    }

    /// 一个州的顶点距离：每个角点取共享它的区域格子里最小的“格心距离 + 到格心的直线距离”，
    /// 同一位置的顶点拷贝得到同一个值，格与格、州与州之间连续。
    public static func province(_ t: WashTopology, _ p: Int, arrivals: [Int32: Float]) -> WashProvinceField {
        var f = WashProvinceField()
        guard t.provinceCells.indices.contains(p) else { return f }
        var cache = [Int32: Float]()
        func value(_ v: Int) -> Float {
            let k = t.corner[v]
            if let x = cache[k] { return x }
            let at = t.position(v)
            var best = Float.infinity
            for i in Int(t.cornerStart[Int(k)])..<Int(t.cornerStart[Int(k) + 1]) {
                let c = t.cornerCells[i]
                if let a = arrivals[c], a.isFinite { best = min(best, a + washDistance(at, t.site[Int(c)])) }
            }
            cache[k] = best
            return best
        }
        var lo = Float.infinity, hi = -Float.infinity
        var samples = [(Float, Float)](), total: Float = 0
        for c in t.provinceCells[p] {
            let s = Int(t.offsets[Int(c)]), e = Int(t.offsets[Int(c) + 1])
            guard e >= s + 3 else { continue }
            for j in (s + 1)..<(e - 1) {
                for v in [s, j, j + 1] {
                    let a = value(v)
                    f.vertex.append(UInt32(v)); f.cell.append(c); f.position.append(t.position(v)); f.arrival.append(a)
                    lo = min(lo, a); hi = max(hi, a)
                }
            }
            // 面积分布按格子各角点的平均抵达距离计（与着色器里按顶点插值的覆盖一致）。
            var sum: Float = 0
            for v in s..<e { sum += value(v) }
            let a = sum / Float(e - s)
            if a.isFinite { samples.append((a, t.area[Int(c)])); total += t.area[Int(c)] }
        }
        samples.sort { $0.0 != $1.0 ? $0.0 < $1.0 : $0.1 < $1.1 }
        // 分段线性、严格递增：同一距离的格子合并，每段取到该段面积的中点。
        var run: Float = 0, k = 0
        while k < samples.count {
            let a = samples[k].0; var w: Float = 0
            while k < samples.count && samples[k].0 == a { w += samples[k].1; k += 1 }
            if a > (f.sorted.last ?? (lo.isFinite ? lo : 0)) && total > 0 { f.sorted.append(a); f.cumulative.append((run + w / 2) / total) }
            run += w
        }
        f.minimum = lo.isFinite ? lo : 0; f.maximum = hi.isFinite ? hi : 0
        return f
    }
}

/// 小顶堆（抵达距离，格子号）；同距离按格子号，结果确定。
struct WashHeap {
    private var items: [(Float, Int32)] = []
    private static func less(_ a: (Float, Int32), _ b: (Float, Int32)) -> Bool { a.0 != b.0 ? a.0 < b.0 : a.1 < b.1 }
    mutating func push(_ d: Float, _ c: Int32) {
        items.append((d, c)); var i = items.count - 1
        while i > 0 { let p = (i - 1) / 2; if Self.less(items[i], items[p]) { items.swapAt(i, p); i = p } else { break } }
    }
    mutating func pop() -> (Float, Int32)? {
        guard !items.isEmpty else { return nil }
        let top = items[0]; let last = items.removeLast()
        if !items.isEmpty {
            items[0] = last; var i = 0
            while true {
                let l = 2 * i + 1, r = l + 1; var m = i
                if l < items.count && Self.less(items[l], items[m]) { m = l }
                if r < items.count && Self.less(items[r], items[m]) { m = r }
                if m == i { break }
                items.swapAt(i, m); i = m
            }
        }
        return top
    }
}

/// 推演每步给出的晕染输入：正被占领的州（权威进度）与刚刚易主的州（攻占）。
public struct WashInput: Equatable, Sendable {
    public enum Kind: Int, Sendable { case siege, capture }
    public var province: Int
    public var attacker: Int
    public var kind: Kind
    /// 占领进度 0…1（攻占为 1）。
    public var progress: Float
    /// 发生的推演日（攻占去重用）。
    public var day: Int
    /// 进攻方在该州的军队位置（定进入方向）。
    public var armies: [SIMD2<Float>]
    public init(province: Int, attacker: Int, kind: Kind, progress: Float, day: Int, armies: [SIMD2<Float>] = []) {
        self.province = province; self.attacker = attacker; self.kind = kind; self.progress = progress; self.day = day; self.armies = armies
    }

    /// 由相邻两步推演状态得出晕染输入。
    /// - 围城：进攻方 ≠ 守方且进度 > 0.5%；
    /// - 攻占：某州易主，且新主人上一步在此围城、或其军队这一步或上一步就在此州（无守军时到达即占）。
    ///   和约割地、附庸并入等没有军队的易主不算攻占（由陆地颜色渐变处理）。
    public static func from(previous: GameState?, next: GameState) -> (sieges: [WashInput], captures: [WashInput]) {
        var sieges = [WashInput]()
        func armies(_ s: GameState?, _ nation: Int, _ p: Int) -> [SIMD2<Float>] {
            (s?.armies ?? []).filter { $0.nation == nation && $0.province == p && $0.troops > 0 }.map { SIMD2($0.x, $0.y) }
        }
        for s in next.sieges where s.progress > 0.005 && next.owners.indices.contains(s.province) {
            let owner = next.owners[s.province]
            guard owner >= 0, owner != s.nation else { continue }
            sieges.append(WashInput(province: s.province, attacker: s.nation, kind: .siege, progress: Float(min(1, s.progress)), day: next.day, armies: armies(next, s.nation, s.province)))
        }
        var captures = [WashInput]()
        if let previous, previous.owners.count == next.owners.count {
            for p in next.owners.indices where previous.owners[p] != next.owners[p] && next.owners[p] >= 0 {
                let n = next.owners[p]
                let besieged = previous.sieges.contains { $0.province == p && $0.nation == n }
                var at = armies(next, n, p); if at.isEmpty { at = armies(previous, n, p) }
                guard besieged || !at.isEmpty else { continue }
                captures.append(WashInput(province: p, attacker: n, kind: .capture, progress: 1, day: next.day, armies: at))
            }
        }
        sieges.sort { $0.province < $1.province }
        return (sieges, captures)
    }
}

/// 晕染状态机。以州为稳定标识（进攻方换人时旧的淡出、新的从进入边界长出），区域只是每次重算的分组，
/// 合并、拆分时各州带着自己当前显示的前沿进入新区域的距离场（按覆盖占比换算，再用形变过渡）。
public final class WashBook {
    public enum Phase: Int, Sendable { case siege, capture, cancel, leaving }
    public struct Entry: Sendable {
        public let id: Int
        public let province: Int
        public var attacker: Int
        public var phase: Phase
        /// 围城进度目标 0…1。
        public var progress: Float = 0
        /// 当前显示的前沿阈值（世界单位，抵达距离）与其速度。
        public var shown: Float = .nan
        public var velocity: Float = 0
        public var alpha: Float = 0
        public var alphaTarget: Float = 1
        /// 底下的陆地已换成新主人的颜色：改为在未到达处盖旧色，已到达处的旧色余韵淡去。
        public var flipped = false
        public var flipFade: Float = 0
        /// 距离场形变：0 = 旧形状快照，1 = 当前场。
        public var morph: Float = 1
        public var field = WashProvinceField()
        /// 每个三角形顶点的旧形状（有符号距离：抵达距离 − 阈值）。
        public var snapshot: [Float] = []
        /// 顶点数据变了（换场、易主快照）：渲染端据此重建缓冲。
        public var revision = 0
        public var fieldKey = 0
        public var region = 0
        public var day = 0
        var fullSince: Double?
        var armyAt: SIMD2<Float>?
        var armies: [SIMD2<Float>] = []
    }

    public let topology: WashTopology
    public private(set) var entries: [Int: Entry] = [:]
    public private(set) var leaving: [Entry] = []
    private var completed: [Int: Int] = [:]
    private var serial = 0
    private var inputs: [WashInput] = []
    public private(set) var time: Double = 0

    /// 视觉参数（尺度的倍数）：柔边、纹理起伏、最大推进速度（每秒）。
    public var soft: Float { topology.scale * 0.16 }
    public var noise: Float { topology.scale * 0.3 }
    public var pad: Float { soft * 1.6 + noise }
    public var maxSpeed: Float { topology.scale * 2.4 }
    /// 晕染着色浓度（进攻方颜色压在原色上的不透明度）。
    public static let tint: Float = 0.5
    /// 统计：距离场重算次数（性能测量与测试用）。
    public private(set) var fieldBuilds = 0

    public init(topology: WashTopology) { self.topology = topology }

    public var isEmpty: Bool { entries.isEmpty && leaving.isEmpty }
    public var all: [Entry] { leaving + entries.keys.sorted().map { entries[$0]! } }

    /// 读档、换世界：清空，不留旧世界的晕染。
    public func reset() { entries = [:]; leaving = []; completed = [:]; inputs = [] }

    /// 新的一步：合并输入、调整目标（不重启动画），再按需重算区域距离场。
    public func update(_ incoming: [WashInput], owner: (Int) -> Int, now: Double) {
        time = max(time, now)
        var wanted = [Int: WashInput]()
        for i in incoming where topology.provinceCells.indices.contains(i.province) && !topology.provinceCells[i.province].isEmpty {
            if let old = wanted[i.province] {
                // 同州多条：攻占优先，其次进度高者（多方争夺时显示领先的一方）。
                if old.kind == .capture && i.kind != .capture { continue }
                if old.kind == i.kind && old.progress >= i.progress { continue }
            }
            wanted[i.province] = i
        }
        for p in wanted.keys.sorted() {
            let i = wanted[p]!
            if var e = entries[p] {
                if e.attacker == i.attacker {
                    if i.kind == .capture {
                        if e.phase != .capture { e.phase = .capture; e.day = i.day; e.fullSince = nil }
                    } else if e.phase != .capture {
                        e.phase = .siege; e.progress = i.progress
                    }
                    e.alphaTarget = 1
                    e.armies = i.armies
                    entries[p] = e
                    continue
                }
                // 换了进攻方（反攻、第三方插手）：旧的淡出，新的从自己的进入边界长出。
                e.phase = .leaving; e.alphaTarget = 0
                leaving.append(e)
                entries[p] = nil
            }
            if i.kind == .capture, completed[p] == i.day { continue }
            serial += 1
            var e = Entry(id: serial, province: p, attacker: i.attacker, phase: i.kind == .capture ? .capture : .siege)
            e.progress = i.progress; e.day = i.day; e.armies = i.armies
            entries[p] = e
        }
        // 不再出现的围城：解围、撤退、占领取消 → 前沿退回进入边界后消失。攻占自行走完。
        for p in entries.keys where wanted[p] == nil {
            if entries[p]!.phase == .siege { entries[p]!.phase = .cancel }
        }
        inputs = incoming
        regroup(owner: owner)
    }

    /// 地图归属变了（或新输入）：重新分组；源或成员变了的区域重算距离场。
    public func regroup(owner: (Int) -> Int) {
        let t = topology
        // 按进攻方 + 共享陆地边分连通区域（只看仍在推进的州；淡出中的不参与）。
        var seen = Set<Int>(), regions = [[Int]]()
        for p in entries.keys.sorted() where !seen.contains(p) {
            let a = entries[p]!.attacker
            var stack = [p], group = [Int](); seen.insert(p)
            while let q = stack.popLast() {
                group.append(q)
                for n in t.provinceNeighbors[q] {
                    let k = Int(n)
                    if !seen.contains(k), let e = entries[k], e.attacker == a { seen.insert(k); stack.append(k) }
                }
            }
            regions.append(group.sorted())
        }
        for group in regions {
            let attacker = entries[group[0]]!.attacker
            let members = Set(group)
            // 军队所在格（滞回：军队离上次取用的位置超过 0.6 个尺度才换）。
            var armyCells = [Int: [Int32]](), hints = [SIMD2<Float>]()
            for p in group {
                var e = entries[p]!
                if !e.armies.isEmpty {
                    let mean = e.armies.reduce(SIMD2<Float>(0, 0), +) / Float(e.armies.count)
                    if e.armyAt == nil || washDistance(e.armyAt!, mean) > t.scale * 0.6 { e.armyAt = mean }
                }
                if let at = e.armyAt, let c = t.nearestCell(in: p, to: at) { armyCells[p] = [c]; hints.append(t.site[Int(c)]) }
                entries[p] = e
            }
            // 源：区域里挨着进攻方领土（区域之外）的格子 —— 实际的进入边界。
            // 有本州军队时，离军队近的边界先起（起点距离 = 0.5 × 到军队的距离），颜色从军队那一侧进来。
            var sources = [WashField.Source]()
            for p in group {
                let army = armyCells[p]?.first.map { t.site[Int($0)] }
                for c in t.provinceCells[p] {
                    var entry = false
                    for n in t.neighbors(Int(c)) {
                        let q = Int(t.province[Int(n)])
                        if q >= 0, !members.contains(q), owner(q) == attacker { entry = true; break }
                    }
                    guard entry else { continue }
                    let start = army.map { washDistance($0, t.site[Int(c)]) * 0.5 } ?? 0
                    sources.append(.init(cell: c, start: (start * 64).rounded() / 64))
                }
            }
            // 没有陆上进入边界（渡海登陆、飞地）：从军队所在格起；再没有就从州心起。
            if sources.isEmpty {
                for p in group { for c in armyCells[p] ?? [] { sources.append(.init(cell: c, start: 0)) } }
            }
            if sources.isEmpty, let c = t.nearestCell(in: group[0], to: centroid(group[0])) { sources.append(.init(cell: c, start: 0)) }
            if hints.isEmpty { hints = sources.prefix(8).map { t.site[Int($0.cell)] } }
            var h = Hasher(); h.combine(attacker); h.combine(group); h.combine(sources)
            let key = h.finalize()
            if group.allSatisfy({ entries[$0]!.fieldKey == key }) { continue }
            fieldBuilds += 1
            let arrivals = WashField.arrivals(t, members: members, sources: sources, hints: hints)
            let region = group[0]
            var fields = [Int: WashProvinceField]()
            for p in group { fields[p] = WashField.province(t, p, arrivals: arrivals) }
            let pad = self.pad
            // 已有的州：换场时保留覆盖占比，旧形状存成快照，形变过渡到新场。
            for p in group {
                var e = entries[p]!
                e.region = region; e.fieldKey = key
                defer { entries[p] = e }
                guard e.shown.isFinite && !e.field.arrival.isEmpty, let next = fields[p], next.arrival != e.field.arrival else { continue }
                let f = e.field.fraction(e.shown, pad: pad)
                for i in e.field.arrival.indices where i < e.snapshot.count {
                    let s = e.field.arrival[i] - e.shown
                    e.snapshot[i] = e.snapshot[i] + (s - e.snapshot[i]) * e.morph
                }
                if e.snapshot.count != next.arrival.count { e.snapshot = next.arrival.map { $0 - next.threshold(f, pad: pad) } }
                e.shown = next.threshold(f, pad: pad)
                e.morph = 0
                e.field = next
                e.revision += 1
            }
            // 新加入的州：从进入边界起；若同区域邻州的前沿还没推到这里，就与它同步（同一条等距线、同一速度），
            // 免得每到一个州重新起一圈。离入口近的先定，远处的才能接上近处的。
            let fresh = group.filter { !entries[$0]!.shown.isFinite || entries[$0]!.field.arrival.isEmpty }
                .sorted { (fields[$0]!.minimum, $0) < (fields[$1]!.minimum, $1) }
            for p in fresh {
                var e = entries[p]!
                let next = fields[p]!
                e.field = next
                var start = next.minimum - pad, speed: Float = 0
                for n in t.provinceNeighbors[p] {
                    guard members.contains(Int(n)), let o = entries[Int(n)], o.shown.isFinite, !o.field.arrival.isEmpty, o.shown < start else { continue }
                    start = o.shown; speed = o.velocity
                }
                e.shown = start
                e.velocity = speed
                e.snapshot = next.arrival.map { $0 - start }
                e.morph = 1
                e.revision += 1
                entries[p] = e
            }
        }
    }

    private func centroid(_ p: Int) -> SIMD2<Float> {
        let cells = topology.provinceCells[p]
        guard !cells.isEmpty else { return .zero }
        return cells.reduce(SIMD2<Float>(0, 0)) { $0 + topology.site[Int($1)] } / Float(cells.count)
    }

    /// 某条记录此刻的前沿目标（世界单位）。
    public func target(_ e: Entry) -> Float {
        switch e.phase {
        case .siege: return e.field.threshold(e.progress, pad: pad)
        case .capture: return e.field.maximum + pad
        case .cancel: return e.field.threshold(-1, pad: pad)
        case .leaving: return e.shown
        }
    }

    /// 底下陆地换成了新主人的颜色（渲染端在颜色安装时发现）。返回接手的州：渲染端为它们记下旧色。
    public func landFlipped(_ provinces: Set<Int>) -> [Int] {
        var taken = [Int]()
        for p in provinces.sorted() {
            guard var e = entries[p], !e.flipped, e.phase != .leaving else { continue }
            e.flipped = true
            // 已到达处原来是“进攻色以 tint 不透明度压在旧色上”；换底后改为“旧色以 1 − tint 压在新色上”，画面不跳。
            e.flipFade = 1 - Self.tint
            if e.phase != .capture { e.phase = .capture; e.fullSince = nil }
            e.revision += 1
            entries[p] = e
            taken.append(p)
        }
        return taken
    }

    /// 地图视图切换（颜色含义变了）：已换底的晕染直接收尾，围城的着色由渲染端按新视图重取颜色。
    public func viewChanged() {
        for p in entries.keys.sorted() where entries[p]!.flipped { complete(p) }
        leaving.removeAll()
    }

    private func complete(_ p: Int) {
        if let e = entries[p], e.phase == .capture { completed[p] = e.day }
        entries[p] = nil
    }

    /// 按统一的单调时钟推进：前沿用临界阻尼弹簧追目标（速度连续、有上限），透明度与形变按指数逼近。
    /// 返回是否仍在变化。
    @discardableResult public func advance(to now: Double) -> Bool {
        // 后台回来、链路停过：按一帧接着走，不一下补上一大段。
        let gap = max(0, now - time)
        let dt = Float(gap > 0.25 ? 1.0 / 60 : min(0.1, gap))
        time = max(time, now)
        var moving = false
        let steps = max(1, Int((dt / (1 / 120)).rounded(.up)))
        let h = dt / Float(steps)
        let omega: Float = 5.5
        // 同一区域里正在攻占的州共用一条前沿目标（区域里最远的铺满处）：同时起步的几个州以完全相同的
        // 等距线推进，穿过州界不断开；各州到达自己的铺满处即算完成。
        var regionGoal = [Int: Float]()
        for e in entries.values where e.phase == .capture { regionGoal[e.region] = max(regionGoal[e.region] ?? -.infinity, target(e)) }
        func step(_ e: inout Entry) {
            let own = target(e), goal = e.phase == .capture ? (regionGoal[e.region] ?? own) : own
            guard e.shown.isFinite else { return }
            for _ in 0..<steps {
                let err = goal - e.shown
                // 攻占以恒定上限速度推进（同区域同步）；围城落后很多时适当放宽，前沿不至于越拖越远。
                let cap = e.phase == .capture ? maxSpeed : maxSpeed * max(1, abs(own - e.shown) / (topology.scale * 3))
                e.velocity += (omega * omega * err - 2 * omega * e.velocity) * h
                e.velocity = max(-cap, min(cap, e.velocity))
                e.shown += e.velocity * h
            }
            if (abs(goal - e.shown) < topology.scale * 0.002 && abs(e.velocity) < topology.scale * 0.01) || (e.phase == .capture && e.shown >= own) { e.shown = goal; e.velocity = 0 } else { moving = true }
            let k = 1 - exp(-dt / 0.25)
            e.alpha += (e.alphaTarget - e.alpha) * k
            if abs(e.alpha - e.alphaTarget) > 0.004 { moving = true } else { e.alpha = e.alphaTarget }
            if e.morph < 1 { e.morph = min(1, e.morph + dt / 0.45); moving = true }
            if e.flipped && e.flipFade > 0 { e.flipFade = max(0, e.flipFade - dt / 0.6); moving = true }
        }
        for p in entries.keys.sorted() {
            var e = entries[p]!
            step(&e)
            switch e.phase {
            case .capture:
                if e.shown >= e.field.maximum + pad - topology.scale * 0.01 {
                    if e.flipped {
                        if e.flipFade <= 0 { complete(p); continue }
                    } else {
                        // 底色没换（地形视图等）：铺满停一会儿后淡去。
                        if e.fullSince == nil { e.fullSince = now }
                        if now - e.fullSince! > 0.9 { e.alphaTarget = 0 }
                        if e.alphaTarget == 0 && e.alpha <= 0.004 { complete(p); continue }
                    }
                }
                moving = true
            case .cancel:
                if e.shown <= e.field.minimum - pad + topology.scale * 0.01 { entries[p] = nil; continue }
                moving = true
            default: break
            }
            entries[p] = e
        }
        for i in leaving.indices { step(&leaving[i]) }
        leaving.removeAll { $0.alpha <= 0.004 }
        if !leaving.isEmpty { moving = true }
        return moving
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

    @inline(__always) static func ease(_ x: Float) -> Float { let t = min(1, max(0, x)); return t * t * (3 - 2 * t) }

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
