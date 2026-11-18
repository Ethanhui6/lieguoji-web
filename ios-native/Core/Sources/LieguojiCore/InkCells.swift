import Foundation

/// 战争墨迹：沿地图的格子洇开的占领痕迹（1.23.0 起取代按圆形墨团落墨的 GPU 墨场）。
///
/// 1.19–1.22 的墨是以军队为圆心的高斯墨团：驻扎处是一个圆，行军处是一条等宽的管子，看上去像笔刷涂的，不像墨在纸上渗开。
/// 现在墨落在地图本身的格子（每州约几十个 Voronoi 格）上：
/// - 军队在敌境走过（上一步位置 → 这一步位置）、驻扎的地方，从路线上的格子出发按“渗开距离”向四周扩散：
///   相邻格之间的距离乘以两格的阻力（地势越高越难渗，每格另有一点固定的随机起伏），在预算之内的敌国格子落墨。
///   所以墨的边缘沿格子与山地参差，平原渗得远、山地渗得近，不是圆。
/// - 几支同国军队挨在一起（相距约一个格距内）按合计兵力算预算，墨更宽，相邻的墨连成一片；在敌境原地停得越久渗得越开，二十天封顶。
/// - 围城：从进攻军所在处在被围州内按同样的渗开距离铺开，进度满时铺满全州。
/// - 守军在本土与敌相持：身边的敌墨淡去。
/// - 墨一直留着，直到：这片地被落墨方攻下（整州换成新主人的颜色，墨全部收起，不留斑驳）、议和或不再交战（淡去），
///   或一年没有军队再经过（淡去）。
/// 渲染端每个顶点取四个数（落墨国、到达时刻、淡去时刻、覆盖比例），显卡每帧按时间显出与淡去；推演每步才更新一次。
public final class InkCells: @unchecked Sendable {
    public let topology: WashTopology
    /// 每格：落墨国（−1 无）、显出时刻、开始淡去的时刻（未淡去为 never）、最后一次有军队经过的推演日。
    public private(set) var nation: [Int32]
    public private(set) var arrive: [Float]
    public private(set) var leave: [Float]
    private var touched: [Int32]
    /// 每格的渗开阻力（地势与固定起伏）。
    private let resistance: [Float]
    /// 每格预算的固定起伏（0.8…1.2）：同样远的格子有的够得着、有的够不着，边缘参差。
    private let reach: [Float]
    /// 每个顶点 4 个数：落墨国、显出时刻、淡去时刻、覆盖比例（这一点周围的陆地格里有几成是这一国的墨）。
    public private(set) var vertexData: [Float]
    public private(set) var revision = 0
    /// 正在显出或淡去的最晚时刻（渲染端据此决定是否连续重绘）。
    public private(set) var busyUntil: Float = 0
    private var dwelt: [String: (at: SIMD2<Float>, days: Float)] = [:]
    private var lastDay: Int?
    /// 格心的网格索引（点 → 所在格）。
    private let bucket: Float
    private let bucketWidth: Int, bucketHeight: Int
    private let buckets: [[Int32]]
    private let origin: SIMD2<Float>
    /// Dijkstra 的复用缓冲。
    private var distance: [Float]
    private var delayOf: [Float]
    private var seen: [Int32] = []
    private var heap: [(d: Float, c: Int32)] = []
    /// 本步改动的格子（列表 + 标记，免得每步建集合）。
    private var dirty: [Int32] = []
    private var dirtyMark: [UInt32]
    private var refreshMark: [UInt32]
    private var stamp: UInt32 = 1

    public static let never: Float = 1e9
    /// 显出与淡去的时长（秒）。
    public static let revealSeconds: Float = 0.6
    public static let fadeSeconds: Float = 1.2
    /// 墨向外渗的速度（每秒几个格距）：近处先显，远处后显。
    public static let spreadPerSecond: Float = 1.6
    /// 一年没有军队经过的墨淡去。
    public static let staleDays = 365

    /// `elevation`：每格高度（0–100，海为低值），没有时视为平地。
    public init(topology: WashTopology, elevation: [Int16]? = nil) {
        self.topology = topology
        let n = topology.cellCount
        nation = Array(repeating: -1, count: n)
        arrive = Array(repeating: 0, count: n)
        leave = Array(repeating: Self.never, count: n)
        touched = Array(repeating: 0, count: n)
        distance = Array(repeating: .infinity, count: n)
        delayOf = Array(repeating: 0, count: n)
        dirtyMark = Array(repeating: 0, count: n)
        refreshMark = Array(repeating: 0, count: n)
        vertexData = Array(repeating: 0, count: topology.vertexCount * 4)
        for v in 0..<topology.vertexCount { vertexData[v * 4] = -1 }
        var r = [Float](repeating: 1, count: n), reachOf = [Float](repeating: 1, count: n)
        for c in 0..<n {
            var h = UInt32(truncatingIfNeeded: c) &* 2_654_435_761
            h ^= h >> 15; h = h &* 2_246_822_519; h ^= h >> 13
            let jitter = Float(h & 0xFFFF) / 65535                       // 0…1，每格固定
            var e: Float = 0
            if let elevation, elevation.indices.contains(c) { e = max(0, Float(elevation[c]) - 20) / 80 }   // 海平面 20 以上
            r[c] = (0.8 + 0.4 * jitter) * (1 + 1.6 * e * e)
            var g = UInt32(truncatingIfNeeded: c) &* 2_246_822_519 &+ 374_761_393
            g ^= g >> 13; g = g &* 3_266_489_917; g ^= g >> 16
            reachOf[c] = 0.8 + 0.4 * Float(g & 0xFFFF) / 65535
        }
        resistance = r; reach = reachOf
        // 格心分桶：桶边约半个格距。
        var lo = SIMD2<Float>(.infinity, .infinity), hi = SIMD2<Float>(-.infinity, -.infinity)
        for s in topology.site { lo = SIMD2(min(lo.x, s.x), min(lo.y, s.y)); hi = SIMD2(max(hi.x, s.x), max(hi.y, s.y)) }
        if n == 0 { lo = .zero; hi = .zero }
        let size = max(0.05, topology.scale * 0.4)
        let w = max(1, Int((hi.x - lo.x) / size) + 1), h = max(1, Int((hi.y - lo.y) / size) + 1)
        var b = [[Int32]](repeating: [], count: w * h)
        for c in 0..<n where topology.land[c] {
            let s = topology.site[c]
            b[min(h - 1, Int((s.y - lo.y) / size)) * w + min(w - 1, Int((s.x - lo.x) / size))].append(Int32(c))
        }
        bucket = size; bucketWidth = w; bucketHeight = h; buckets = b; origin = lo
    }

    /// 读档、换世界：全部收起。
    public func clear() {
        for c in nation.indices { nation[c] = -1; leave[c] = Self.never }
        for v in 0..<topology.vertexCount { vertexData[v * 4] = -1; vertexData[v * 4 + 3] = 0 }
        dwelt = [:]; lastDay = nil; busyUntil = 0
        revision &+= 1
    }

    /// 点所在的陆地格（最近的格心）。
    public func cell(at p: SIMD2<Float>) -> Int? {
        let bx = Int((p.x - origin.x) / bucket), by = Int((p.y - origin.y) / bucket)
        var best = -1, bestD = Float.infinity
        for ring in 0...3 {
            for y in (by - ring)...(by + ring) where y >= 0 && y < bucketHeight {
                for x in (bx - ring)...(bx + ring) where x >= 0 && x < bucketWidth {
                    if ring > 0 && abs(x - bx) < ring && abs(y - by) < ring { continue }
                    for c in buckets[y * bucketWidth + x] {
                        let d = washDistance2(topology.site[Int(c)], p)
                        if d < bestD { bestD = d; best = Int(c) }
                    }
                }
            }
            if best >= 0 && ring >= 1 { break }
        }
        return best >= 0 ? best : nil
    }

    /// 兵力系数：四千兵为 1，合计兵力越多墨越宽（开方增长、有上限）。
    public static func width(troops: Float) -> Float { min(1.8, max(0.75, (max(100, troops) / 4000).squareRoot())) }

    /// 一步推演：按这一步的输入落墨、清墨，更新顶点数据。`owners`：各州此刻的主人；`now`：渲染时钟；`tween`：这一步动画时长。
    public func apply(_ frame: WashFrame, owners: [Int], now: Float, tween: Float) {
        let t = topology
        let days = Float(max(0, frame.day - (lastDay ?? frame.day)))
        lastDay = frame.day
        var war = Set<Int64>()
        for (a, list) in frame.enemies { for b in list where a != b { war.insert(Self.pair(a, b)) } }
        func owner(_ c: Int) -> Int { let p = Int(t.province[c]); return p >= 0 && p < owners.count ? owners[p] : -1 }
        func atWar(_ a: Int, _ b: Int) -> Bool { a >= 0 && b >= 0 && a != b && war.contains(Self.pair(a, b)) }
        func setCell(_ c: Int, nation n: Int32, arrive a: Float, leave l: Float) {
            if nation[c] == n && arrive[c] == a && leave[c] == l { return }
            nation[c] = n; arrive[c] = a; leave[c] = l
            markDirty(c)
            busyUntil = max(busyUntil, l < Self.never ? l + Self.fadeSeconds : a + Self.revealSeconds)
        }
        // 一、清墨：被落墨方攻下的格子立即收起（整州换成新主人的颜色）；不再交战的、一年没人经过的淡去。
        for c in 0..<t.cellCount where nation[c] >= 0 {
            let n = Int(nation[c]), o = owner(c)
            if leave[c] < Self.never {
                if now > leave[c] + Self.fadeSeconds { setCell(c, nation: -1, arrive: 0, leave: Self.never) }
                continue
            }
            if o == n { setCell(c, nation: -1, arrive: 0, leave: Self.never) }
            else if !atWar(n, o) || frame.day - Int(touched[c]) > Self.staleDays { setCell(c, nation: Int32(n), arrive: arrive[c], leave: now) }
        }
        // 二、行军与驻扎：同国、相距一个格距内的军队合算兵力。
        let marches = frame.inputs.filter { $0.kind == .march && $0.armies.count == 2 }
        var keys = Set<String>()
        for (i, m) in marches.enumerated() {
            let key = m.key.isEmpty ? "\(m.attacker)-\(i)" : m.key
            keys.insert(key)
            let from = m.armies[0], to = m.armies[1]
            var troops = m.troops
            for (j, o) in marches.enumerated() where j != i && o.attacker == m.attacker && washDistance(o.armies[1], to) < t.scale { troops += o.troops }
            var stay = dwelt[key] ?? (to, 0)
            stay = washDistance(stay.at, to) < t.scale * 0.15 ? (stay.at, stay.days + days) : (to, 0)
            dwelt[key] = stay
            let budget = t.scale * 0.55 * Self.width(troops: troops) * (1 + 0.5 * min(1, stay.days / 20))
            // 路线上的起点格：每隔约 0.2 格距取一点，显出时刻随军队图标在这一步里走到那里。
            let length = washDistance(from, to)
            let steps = max(1, min(40, Int(ceil(length / (t.scale * 0.2)))))
            var seeds = [(cell: Int, delay: Float)]()
            for s in 0...steps {
                let f = Float(s) / Float(steps)
                if let c = cell(at: from + (to - from) * f), !seeds.contains(where: { $0.cell == c }) { seeds.append((c, f * tween)) }
            }
            spread(from: seeds, budget: budget, within: nil) { c, d, delay in
                guard atWar(m.attacker, owner(c)) else { return }
                self.touched[c] = Int32(frame.day)
                if self.nation[c] == Int32(m.attacker) && self.leave[c] >= Self.never { return }
                setCell(c, nation: Int32(m.attacker), arrive: now + delay + d / (t.scale * Self.spreadPerSecond), leave: Self.never)
            }
        }
        dwelt = dwelt.filter { keys.contains($0.key) }
        // 三、围城：从进攻军处在被围州内铺开，进度满时铺满。
        for s in frame.inputs where s.kind == .siege {
            guard t.provinceCells.indices.contains(s.province), !t.provinceCells[s.province].isEmpty else { continue }
            let center = s.armies.isEmpty ? t.centroid(s.province) : s.armies.reduce(SIMD2<Float>(0, 0), +) / Float(s.armies.count)
            guard let start = cell(at: center) ?? t.provinceCells[s.province].first.map(Int.init) else { continue }
            var far: Float = 0
            spread(from: [(start, 0)], budget: .infinity, within: s.province) { _, d, _ in far = max(far, d) }
            let budget = s.progress >= 0.98 ? Float.infinity : max(t.scale * 0.3, far * s.progress * 1.1)
            spread(from: [(start, 0)], budget: budget, within: s.province) { c, d, _ in
                guard atWar(s.attacker, owner(c)) else { return }
                self.touched[c] = Int32(frame.day)
                if self.nation[c] == Int32(s.attacker) && self.leave[c] >= Self.never { return }
                setCell(c, nation: Int32(s.attacker), arrive: now + d / (t.scale * Self.spreadPerSecond), leave: Self.never)
            }
        }
        // 四、守军：在本土与敌相持，身边的敌墨淡去（推演在走才擦）。
        if days > 0 {
            for h in frame.inputs where h.kind == .hold && !h.armies.isEmpty {
                guard let start = cell(at: h.armies[0]) else { continue }
                spread(from: [(start, 0)], budget: t.scale * 0.45, within: nil) { c, _, _ in
                    if self.nation[c] >= 0 && self.nation[c] != Int32(h.attacker) && self.leave[c] >= Self.never && owner(c) == h.attacker {
                        setCell(c, nation: self.nation[c], arrive: self.arrive[c], leave: now)
                    }
                }
            }
        }
        refresh()
    }

    @inline(__always) private func markDirty(_ c: Int) { if dirtyMark[c] != stamp { dirtyMark[c] = stamp; dirty.append(Int32(c)) } }

    /// 某国的领土上清掉所有不再与主人交战的墨（换视图、读档后主人整批变了时调用）。
    public func owners(_ owners: [Int], now: Float) {
        for c in 0..<topology.cellCount where nation[c] >= 0 {
            let p = Int(topology.province[c]), o = p >= 0 && p < owners.count ? owners[p] : -1
            if o == Int(nation[c]) { nation[c] = -1; leave[c] = Self.never; markDirty(c) }
        }
        refresh()
    }

    /// 多源 Dijkstra：相邻格的距离乘两格阻力的平均；`within` 限定在某州内。
    private func spread(from seeds: [(cell: Int, delay: Float)], budget: Float, within province: Int?, _ visit: (Int, Float, Float) -> Void) {
        let t = topology
        for c in seen { distance[Int(c)] = .infinity }
        seen.removeAll(keepingCapacity: true)
        heap.removeAll(keepingCapacity: true)
        func push(_ d: Float, _ c: Int32) {
            heap.append((d, c)); var i = heap.count - 1
            while i > 0 { let p = (i - 1) / 2; if heap[p].d <= heap[i].d { break }; heap.swapAt(p, i); i = p }
        }
        func pop() -> (d: Float, c: Int32) {
            let top = heap[0]; let last = heap.removeLast()
            if !heap.isEmpty {
                heap[0] = last; var i = 0
                while true {
                    let l = i * 2 + 1, r = l + 1; var m = i
                    if l < heap.count && heap[l].d < heap[m].d { m = l }
                    if r < heap.count && heap[r].d < heap[m].d { m = r }
                    if m == i { break }; heap.swapAt(m, i); i = m
                }
            }
            return top
        }
        for s in seeds where t.land[s.cell] && (province == nil || Int(t.province[s.cell]) == province!) {
            if distance[s.cell] > 0 { if distance[s.cell] == .infinity { seen.append(Int32(s.cell)) }; distance[s.cell] = 0; delayOf[s.cell] = s.delay; push(0, Int32(s.cell)) }
        }
        while !heap.isEmpty {
            let (d, c) = pop()
            let ci = Int(c)
            guard d <= distance[ci] else { continue }
            // 每格的预算另带一点固定起伏：同样远的格子有的够得着、有的够不着，边缘参差。
            guard d <= budget * reach[ci] || d == 0 else { continue }
            visit(ci, d, delayOf[ci])
            for nb in t.neighbors(ci) {
                let ni = Int(nb)
                guard t.land[ni], province == nil || Int(t.province[ni]) == province! else { continue }
                let step = washDistance(t.site[ci], t.site[ni]) * (resistance[ci] + resistance[ni]) / 2
                let nd = d + step
                if nd < distance[ni] {
                    if distance[ni] == .infinity { seen.append(nb) }
                    distance[ni] = nd; delayOf[ni] = delayOf[ci]
                    if nd <= budget * 1.2 { push(nd, nb) }
                }
            }
        }
    }

    /// 重算这些格子及与之相接的格子的顶点数据。每格的顶点用同一个落墨国（本格的，或周围最多的），
    /// 覆盖比例 = 顶点所在位置的陆地格里有几成是这一国的墨：墨的边缘落在格子交界附近，经纸纹扰动后参差。
    private func refresh() {
        defer { dirty.removeAll(keepingCapacity: true); stamp &+= 1; if stamp == 0 { stamp = 1; for i in dirtyMark.indices { dirtyMark[i] = 0; refreshMark[i] = 0 } } }
        guard !dirty.isEmpty else { return }
        let t = topology
        var cells = [Int32](); cells.reserveCapacity(dirty.count * 6)
        func add(_ c: Int32) { if refreshMark[Int(c)] != stamp { refreshMark[Int(c)] = stamp; cells.append(c) } }
        for c in dirty { add(c); for o in t.touching[Int(c)] { add(o) } }
        for c32 in cells {
            let c = Int(c32)
            guard t.land[c] else { continue }
            var n = nation[c]
            if n < 0 {
                // 周围最多的落墨国（相同时取国号小的）；周围格子不多，直接数。
                var best = 0
                for o in t.touching[c] where nation[Int(o)] >= 0 && t.land[Int(o)] {
                    let k = nation[Int(o)]
                    var count = 0
                    for q in t.touching[c] where nation[Int(q)] == k && t.land[Int(q)] { count += 1 }
                    if count > best || (count == best && k < n) { best = count; n = k }
                }
            }
            for v in t.vertexRange(c) {
                let o = v * 4
                guard n >= 0 else { vertexData[o] = -1; vertexData[o + 1] = 0; vertexData[o + 2] = Self.never; vertexData[o + 3] = 0; continue }
                var land = 0, hit = 0, first = Float.infinity, last: Float = 0, fading = true
                for m in t.groupCells[Int(t.vertexGroup[v])] where t.land[Int(m)] {
                    land += 1
                    let mi = Int(m)
                    guard nation[mi] == n else { continue }
                    hit += 1; first = min(first, arrive[mi])
                    if leave[mi] >= Self.never { fading = false } else { last = max(last, leave[mi]) }
                }
                vertexData[o] = Float(n)
                vertexData[o + 1] = hit > 0 ? first : 0
                vertexData[o + 2] = hit > 0 && fading ? last : Self.never
                vertexData[o + 3] = land > 0 ? Float(hit) / Float(land) : 0
            }
        }
        revision &+= 1
    }

    /// 顶点 v 在时刻 now 的墨量（0…1，与着色器同一算法，不含纸纹）。
    public func level(_ v: Int, at now: Float) -> Float {
        let o = v * 4
        guard vertexData[o] >= 0 else { return 0 }
        let show = min(1, max(0, (now - vertexData[o + 1]) / Self.revealSeconds))
        let fade = 1 - min(1, max(0, (now - vertexData[o + 2]) / Self.fadeSeconds))
        return vertexData[o + 3] * show * fade
    }

    @inline(__always) static func pair(_ a: Int, _ b: Int) -> Int64 { Int64(min(a, b)) << 32 | Int64(max(a, b)) }
}
