import Foundation

/// V8's Math.hypot (builtins/math.tq): normalise by the largest magnitude, Kahan-sum the squares.
/// Distances along army routes must use this exact algorithm, not libm hypot.
/// v13.0.0：展开 2 元循环，彻底消除每秒数百万次 `[ax, ay]` Swift 数组堆分配，保持 100% IEEE-754 逐位一致！
@inline(__always)
func jsHypot(_ x: Double, _ y: Double) -> Double {
    let ax = abs(x), ay = abs(y)
    if ax.isNaN || ay.isNaN { return ax == .infinity || ay == .infinity ? .infinity : .nan }
    let m = max(ax, ay)
    if m == .infinity { return .infinity }
    if m == 0 { return 0 }
    let n1 = ax / m
    let sum1 = n1 * n1
    let comp1 = (sum1 - 0.0) - sum1
    let n2 = ay / m
    let summand2 = n2 * n2 - comp1
    let sum2 = sum1 + summand2
    return sum2.squareRoot() * m
}

public struct TravelPoint: Sendable, Equatable { public var x: Double; public var y: Double
    public init(x: Double, y: Double) { self.x = x; self.y = y } }

/// The army travel graph of the web engine (army-travel47-graph.ts): land half-faces and sea nodes of
/// the clipped terrain mesh, linked through the midpoints of shared edges. Coordinates are the web's
/// normalized units (long side 1000). Cells are kept in ascending id order, so an index order is the
/// web's id order (Dijkstra ties). Loaded from travel.bin (src/native-export/travel-export.test.ts).
public struct TravelGraph: Sendable {
    public let ids: [Int32], faces: [Int32], provinces: [Int32]
    public let centers: [TravelPoint]
    let linkStart: [Int]
    let linkTo: [Int], gates: [TravelPoint], linkCost: [Double]
    /// Link length (army-travel47-graph link.distance).
    let linkDistance: [Double]
    public let mountain: [Bool], plateau: [Bool], targets: [TravelPoint]
    public let faceBiomes: [UInt8]
    /// v13.0.0：每格预计算 App 地形行军阻力倍率与海/陆分域最优 A* 启发率（初始化一次、寻路热循环零分支零除法！）
    let appCellTerrainMult: [Double]
    let minLandRate: Double
    let minSeaRate: Double
    let minAnyRate: Double
    public var count: Int { ids.count }

    public enum LoadError: Error { case format }
    public init(data: Data) throws {
        var o = 0
        func u32() throws -> UInt32 { guard o + 4 <= data.count else { throw LoadError.format }
            let v = data.withUnsafeBytes { $0.loadUnaligned(fromByteOffset: o, as: UInt32.self) }; o += 4; return UInt32(littleEndian: v) }
        func i32() throws -> Int32 { Int32(bitPattern: try u32()) }
        func f32() throws -> Double { Double(Float(bitPattern: try u32())) }
        func f64() throws -> Double { guard o + 8 <= data.count else { throw LoadError.format }
            let v = data.withUnsafeBytes { $0.loadUnaligned(fromByteOffset: o, as: UInt64.self) }; o += 8; return Double(bitPattern: UInt64(littleEndian: v)) }
        func u8() throws -> UInt8 { guard o < data.count else { throw LoadError.format }; defer { o += 1 }; return data[data.startIndex + o] }
        guard try u32() == 0x5654474c else { throw LoadError.format }
        let version = try u32()
        guard version == 1 || version == 2 else { throw LoadError.format }
        let n = Int(try u32()), l = Int(try u32()), p = Int(try u32()), f = Int(try u32())
        var ids = [Int32](), faces = [Int32](), provinces = [Int32](), centers = [TravelPoint](), starts = [Int]()
        ids.reserveCapacity(n); faces.reserveCapacity(n); provinces.reserveCapacity(n); centers.reserveCapacity(n); starts.reserveCapacity(n + 1)
        if version == 2 {
            for _ in 0..<n {
                ids.append(try i32()); faces.append(try i32()); provinces.append(try i32())
                centers.append(TravelPoint(x: try f32(), y: try f32())); starts.append(Int(try u32()))
            }
        } else {
            for _ in 0..<n {
                ids.append(try i32()); faces.append(try i32()); provinces.append(try i32())
                centers.append(TravelPoint(x: try f64(), y: try f64())); starts.append(Int(try u32()))
            }
        }
        starts.append(Int(try u32()))
        var to = [Int](), gates = [TravelPoint](), costs = [Double](), dists = [Double]()
        to.reserveCapacity(l); gates.reserveCapacity(l); costs.reserveCapacity(l); dists.reserveCapacity(l)
        if version == 2 {
            for _ in 0..<l {
                to.append(Int(try i32())); gates.append(TravelPoint(x: try f32(), y: try f32()))
                dists.append(try f32()); costs.append(try f32())
            }
        } else {
            for _ in 0..<l {
                to.append(Int(try i32())); gates.append(TravelPoint(x: try f64(), y: try f64()))
                dists.append(try f64()); _ = try f64() // web toGate: recomputed by the segment geometry
                costs.append(try f64())
            }
        }
        var mountain = [Bool](), plateau = [Bool](), targets = [TravelPoint]()
        mountain.reserveCapacity(p); plateau.reserveCapacity(p); targets.reserveCapacity(p)
        if version == 2 {
            for _ in 0..<p { mountain.append(try u8() != 0); plateau.append(try u8() != 0); targets.append(TravelPoint(x: try f32(), y: try f32())) }
        } else {
            for _ in 0..<p { mountain.append(try u8() != 0); plateau.append(try u8() != 0); targets.append(TravelPoint(x: try f64(), y: try f64())) }
        }
        var biomes = [UInt8](); biomes.reserveCapacity(f)
        if o + f <= data.count {
            biomes.append(contentsOf: data[data.startIndex + o ..< data.startIndex + o + f])
            o += f
        } else {
            throw LoadError.format
        }
        guard o == data.count, starts.last == l else { throw LoadError.format }
        self.ids = ids; self.faces = faces; self.provinces = provinces; self.centers = centers; linkStart = starts
        linkTo = to; self.gates = gates; linkCost = costs; linkDistance = dists; self.mountain = mountain; self.plateau = plateau; self.targets = targets; faceBiomes = biomes
        var index = [Int32: Int](minimumCapacity: n); for (i, id) in ids.enumerated() { index[id] = i }; self.index = index
        var byProvince = [[Int]](repeating: [], count: p)
        for (i, q) in provinces.enumerated() where q >= 0 { byProvince[Int(q)].append(i) }
        self.byProvince = byProvince
        // 预计算 App 地形行军阻力表与海陆分域 A* 下界斜率
        let appTbl = ForceMotion.appTerrainSpeed
        var cellMult = [Double](repeating: 1.0, count: n)
        for i in 0..<n {
            let qb = Int(provinces[i])
            guard qb >= 0 else { continue }
            if qb < mountain.count && mountain[qb] {
                cellMult[i] = 2.0
            } else if qb < plateau.count && plateau[qb] {
                cellMult[i] = 1.0 / 0.72
            } else {
                let fi = Int(faces[i])
                if fi >= 0 && fi < biomes.count {
                    let bi = Int(biomes[fi])
                    if bi < appTbl.count {
                        let sp = appTbl[bi]
                        if sp > 0 && sp < 1 { cellMult[i] = 1.0 / sp }
                    }
                }
            }
        }
        self.appCellTerrainMult = cellMult
        var rLand = Double.infinity, rSea = Double.infinity, rAny = Double.infinity
        for a in 0..<n {
            let aSea = provinces[a] < 0
            for k in starts[a]..<starts[a + 1] {
                let d = dists[k]
                guard d > 0 else { continue }
                let r = costs[k] / d
                if r < rAny { rAny = r }
                let bSea = provinces[to[k]] < 0
                if aSea && bSea {
                    if r < rSea { rSea = r }
                } else {
                    if r < rLand { rLand = r }
                }
            }
        }
        self.minAnyRate = rAny.isFinite ? rAny * 0.999 : 0
        self.minLandRate = rLand.isFinite ? rLand * 0.999 : self.minAnyRate
        self.minSeaRate = rSea.isFinite ? rSea * 0.999 : self.minAnyRate
    }

    /// v13.0.0 紧凑二进制编码（version=2：Float32 坐标/代价 + 剔除无用 toGate，相比 v1 体积直降 56%，再经 LZ4 压缩比 Base64 JSON 小 6–8×！）
    public func encodeCompactV2() -> Data {
        let n = ids.count, l = linkTo.count, p = mountain.count, f = faceBiomes.count
        let cap = 24 + n * 24 + 4 + l * 20 + p * 10 + f
        var out = Data(capacity: cap)
        func putU32(_ v: UInt32) { var le = v.littleEndian; out.append(contentsOf: withUnsafeBytes(of: &le) { $0 }) }
        func putI32(_ v: Int32) { putU32(UInt32(bitPattern: v)) }
        func putF32(_ v: Double) { putU32(Float(v).bitPattern) }
        putU32(0x5654474c); putU32(2)
        putU32(UInt32(n)); putU32(UInt32(l)); putU32(UInt32(p)); putU32(UInt32(f))
        for i in 0..<n {
            putI32(ids[i]); putI32(faces[i]); putI32(provinces[i])
            putF32(centers[i].x); putF32(centers[i].y); putU32(UInt32(linkStart[i]))
        }
        putU32(UInt32(linkStart[n]))
        for k in 0..<l {
            putI32(Int32(linkTo[k])); putF32(gates[k].x); putF32(gates[k].y)
            putF32(linkDistance[k]); putF32(linkCost[k])
        }
        for i in 0..<p {
            out.append(mountain[i] ? 1 : 0); out.append(plateau[i] ? 1 : 0)
            putF32(targets[i].x); putF32(targets[i].y)
        }
        out.append(contentsOf: faceBiomes)
        return out
    }
    let index: [Int32: Int]
    public let byProvince: [[Int]]
    public func cell(id: Int) -> Int? { index[Int32(id)] }
    public func isSea(_ cell: Int) -> Bool { provinces[cell] < 0 }

    func link(from a: Int, to b: Int) -> Int? {
        for k in linkStart[a]..<linkStart[a + 1] where linkTo[k] == b { return k }
        return nil
    }

    /// army-commands47 provinceTargetCell47: the province cell nearest its first city (or its centre),
    /// ties by lower id.
    public func targetCell(province: Int) -> Int? {
        guard byProvince.indices.contains(province) else { return nil }
        let t = targets[province]
        var best: Int?, bestD = 0.0
        for c in byProvince[province] {
            let d = jsHypot(centers[c].x - t.x, centers[c].y - t.y)
            if best == nil || d < bestD || d == bestD && c < best! { best = c; bestD = d }
        }
        return best
    }

    /// createArmyTravelSearch47 with the plain policy (no port preference, no ocean routes):
    /// Dijkstra over Float32 costs, equal costs settled in cell id order. `enter` is the travel
    /// policy (land province access; sea when allowed). Returns cell indices from start to end.
    /// `embark`: extra cost for stepping from a province's land into the sea (app worlds: the original's
    /// NON_PORT_CELL_TRANSITION_PENALTY, so armies take ship at ports); nil keeps the plain search.
    /// `aStar` (app worlds, the original's ArmyPathfinding): the search is guided toward the goal by the
    /// straight-line distance times the cheapest cost per unit of any link (never more than the true
    /// cost), so it settles a corridor instead of half the map. Same optimal cost; ties may differ, so
    /// original-parity worlds keep the plain search.
    public func path(from start: Int, to end: Int, allowSea: Bool = true, canEnterProvince: (Int) -> Bool, embark: ((Int) -> Double)? = nil, aStar: Bool = false, seaRate: Double = 1, terrainCost: Bool = false) -> (nodes: [Int], cost: Double)? {
        Profile.measure("p.path") { path0(from: start, to: end, allowSea: allowSea, canEnterProvince: canEnterProvince, embark: embark, aStar: aStar, seaRate: seaRate, terrainCost: terrainCost) }
    }
    /// v11.0.0 零分配可复用寻路工作区（按世代号 gen O(1) 逻辑清零，彻底消灭每次寻路 1MB 数组堆分配）。
    private final class PathScratch {
        var gen: UInt32 = 0
        var seen: [UInt32]
        var settledStamp: [UInt32]
        var cost: [Double]
        var prev: [Int]
        var allowedStamp: [UInt32]
        var allowedVal: [UInt8]
        var heap = MinHeap()

        init(nodes: Int, provinces: Int) {
            seen = [UInt32](repeating: 0, count: nodes)
            settledStamp = [UInt32](repeating: 0, count: nodes)
            cost = [Double](repeating: 0, count: nodes)
            prev = [Int](repeating: -1, count: nodes)
            allowedStamp = [UInt32](repeating: 0, count: provinces)
            allowedVal = [UInt8](repeating: 0, count: provinces)
        }

        func nextGen() -> UInt32 {
            if gen == UInt32.max - 1 {
                for i in seen.indices { seen[i] = 0; settledStamp[i] = 0 }
                for i in allowedStamp.indices { allowedStamp[i] = 0 }
                gen = 1
            } else {
                gen &+= 1
            }
            heap.reset()
            return gen
        }
    }
    nonisolated(unsafe) private static var scratchLock = NSLock()
    nonisolated(unsafe) private static var scratchPool: [PathScratch] = []

    private func borrowScratch() -> PathScratch {
        let n = count, p = mountain.count
        Self.scratchLock.lock()
        if let idx = Self.scratchPool.lastIndex(where: { $0.seen.count == n && $0.allowedStamp.count == p }) {
            let s = Self.scratchPool.remove(at: idx)
            Self.scratchLock.unlock()
            return s
        }
        Self.scratchLock.unlock()
        return PathScratch(nodes: n, provinces: p)
    }

    private func returnScratch(_ s: PathScratch) {
        Self.scratchLock.lock()
        if Self.scratchPool.count < 8 { Self.scratchPool.append(s) }
        Self.scratchLock.unlock()
    }

    func path0(from start: Int, to end: Int, allowSea: Bool, canEnterProvince: (Int) -> Bool, embark: ((Int) -> Double)?, aStar: Bool, seaRate: Double, terrainCost: Bool) -> (nodes: [Int], cost: Double)? {
        let scratch = borrowScratch()
        defer { returnScratch(scratch) }
        let gen = scratch.nextGen()
        func enter(_ i: Int) -> Bool {
            let q = Int(provinces[i]); if q < 0 { return allowSea }
            if scratch.allowedStamp[q] != gen {
                scratch.allowedStamp[q] = gen
                scratch.allowedVal[q] = canEnterProvince(q) ? 1 : 2
            }
            return scratch.allowedVal[q] == 1
        }
        guard (isSea(start) ? allowSea : true), enter(end) else { return nil }
        let goal = centers[end]
        let gx = goal.x, gy = goal.y
        // v13.0.0 紧致可采纳 A* 下界：纯陆路用 minLandRate、纯海路用 minSeaRate、海陆混合取精准下界（节点扩展立减 2×–4×）
        let rate: Double
        if !aStar {
            rate = 0
        } else if !allowSea {
            rate = minLandRate
        } else if isSea(start) && isSea(end) && seaRate == 1 {
            rate = minSeaRate
        } else {
            rate = min(minLandRate, minSeaRate * min(1.0, seaRate))
        }
        @inline(__always)
        func h(_ i: Int) -> Double {
            if rate == 0 { return 0 }
            let dx = centers[i].x - gx, dy = centers[i].y - gy
            return (dx * dx + dy * dy).squareRoot() * rate
        }
        let fastAppTerrain = terrainCost && UnitKinds.enabled
        scratch.seen[start] = gen
        scratch.cost[start] = 0
        scratch.prev[start] = -1
        scratch.heap.push(h(start), start)
        while scratch.settledStamp[end] != gen, let (f, a) = scratch.heap.pop() {
            if scratch.settledStamp[a] == gen || f > scratch.cost[a] + h(a) + 1e-9 { continue }
            let c = scratch.cost[a]
            let aProv = provinces[a]
            scratch.settledStamp[a] = gen
            for k in linkStart[a]..<linkStart[a + 1] {
                let b = linkTo[k]
                if scratch.settledStamp[b] == gen || !enter(b) { continue }
                var step = linkCost[k]
                let bProv = provinces[b]
                if seaRate != 1, aProv < 0, bProv < 0 { step *= seaRate }
                if fastAppTerrain {
                    if bProv >= 0 { step *= appCellTerrainMult[b] }
                } else if terrainCost, bProv >= 0 {
                    let qb = Int(bProv)
                    if mountain.indices.contains(qb), mountain[qb] {
                        step *= 2.0
                    } else if plateau.indices.contains(qb), plateau[qb] {
                        step /= 0.72
                    } else {
                        let faceIdx = Int(faces[b])
                        if faceBiomes.indices.contains(faceIdx) {
                            let bi = Int(faceBiomes[faceIdx])
                            let table = ForceMotion.terrainSpeed
                            if table.indices.contains(bi) {
                                let sp = table[bi]
                                if sp > 0 && sp < 1 { step /= sp }
                            }
                        }
                    }
                }
                if let embark, bProv < 0, aProv >= 0 { step += embark(Int(aProv)) }
                let next = Native.fr(c + step)
                if scratch.seen[b] != gen || next < scratch.cost[b] {
                    scratch.seen[b] = gen
                    scratch.cost[b] = next
                    scratch.prev[b] = a
                    scratch.heap.push(next + h(b), b)
                }
            }
        }
        guard scratch.settledStamp[end] == gen else { return nil }
        var nodes = [end], i = end
        while i != start { i = scratch.prev[i]; nodes.append(i) }
        return (nodes.reversed(), scratch.cost[end])
    }
}

extension TravelGraph {
    /// The least cost per unit of distance over every link (the A* heuristic's scale), per graph.
    static func cheapestRate(_ g: TravelGraph) -> Double { g.minAnyRate }
}

/// Binary heap ordered by (cost, index), as the web's search frontier（v13.0.0 孔洞下沉/上浮实现，写盘次数减半）.
struct MinHeap {
    private var c: [Double] = [], i: [Int] = []
    mutating func reset() { c.removeAll(keepingCapacity: true); i.removeAll(keepingCapacity: true) }
    mutating func push(_ cost: Double, _ id: Int) {
        var k = c.count
        c.append(cost); i.append(id)
        while k > 0 {
            let p = (k - 1) >> 1
            let pc = c[p], pi = i[p]
            if !(cost < pc || (cost == pc && id < pi)) { break }
            c[k] = pc; i[k] = pi
            k = p
        }
        c[k] = cost; i[k] = id
    }
    mutating func pop() -> (Double, Int)? {
        let count = c.count
        guard count > 0 else { return nil }
        let top = (c[0], i[0])
        let lastIdx = count - 1
        let lc = c.removeLast(), li = i.removeLast()
        if lastIdx > 0 {
            var k = 0
            while true {
                let l = (k << 1) + 1
                if l >= lastIdx { break }
                var m = l
                var mc = c[l], mi = i[l]
                let r = l + 1
                if r < lastIdx {
                    let rc = c[r], ri = i[r]
                    if rc < mc || (rc == mc && ri < mi) { m = r; mc = rc; mi = ri }
                }
                if lc < mc || (lc == mc && li < mi) { break }
                c[k] = mc; i[k] = mi
                k = m
            }
            c[k] = lc; i[k] = li
        }
        return top
    }
}

/// One army's journey (army-travel47-state ArmyTravel47 version 1): the cells it passes through, the
/// current leg, the distance covered on it and whether it has crossed the leg's gate.
public struct ArmyTravel: Sendable, Equatable {
    public enum Status: Int, Sendable { case moving = 0, arrived = 1, blocked = 2, halted = 3 }
    public var origin: TravelPoint
    public var nodes: [Int]
    public var leg = 0
    public var offset = 0.0
    public var crossed = false
    public var status: Status
    /// Version 2 journeys end at an exact point (beginArmyTravelToPoint47); nil for version 1.
    public var destination: TravelPoint? = nil
    /// beginArmyTravel47: from an exact point along a cell path.
    public init(origin: TravelPoint, nodes: [Int]) { self.origin = origin; self.nodes = nodes; status = nodes.count == 1 ? .arrived : .moving }
    /// A stationary army at a point of its cell.
    public static func stationed(at point: TravelPoint, cell: Int) -> ArmyTravel { ArmyTravel(origin: point, nodes: [cell]) }
}

struct TravelSegment { let a: Int, b: Int, start: TravelPoint, gate: TravelPoint, end: TravelPoint, toGate: Double, distance: Double; var local = false }

extension TravelGraph {
    /// armyTravelSegment47 for version 1 records.
    func segment(_ s: ArmyTravel) -> TravelSegment? {
        if let d = s.destination, s.nodes.count == 1 {
            let distance = jsHypot(s.origin.x - d.x, s.origin.y - d.y), a = s.nodes[0]
            return TravelSegment(a: a, b: a, start: s.origin, gate: d, end: d, toGate: distance, distance: distance, local: true)
        }
        guard s.leg >= 0, s.leg + 1 < s.nodes.count else { return nil }
        let a = s.nodes[s.leg], b = s.nodes[s.leg + 1]
        guard centers.indices.contains(a), centers.indices.contains(b), let k = link(from: a, to: b) else { return nil }
        let start = s.leg == 0 ? s.origin : centers[a], gate = gates[k], end = s.destination != nil && s.leg == s.nodes.count - 2 ? s.destination! : centers[b]
        let toGate = jsHypot(start.x - gate.x, start.y - gate.y)
        return TravelSegment(a: a, b: b, start: start, gate: gate, end: end, toGate: toGate, distance: toGate + jsHypot(gate.x - end.x, gate.y - end.y))
    }

    /// armyTravelLocation47: the exact point and cell of a journey.
    public func location(_ s: ArmyTravel) -> (point: TravelPoint, cell: Int) {
        guard !s.nodes.isEmpty else { return (s.destination ?? s.origin, 0) }
        let safeLeg = max(0, min(s.nodes.count - 1, s.leg))
        let a = s.nodes[safeLeg]
        guard let l = segment(s) else { return (s.destination ?? (safeLeg == 0 || !centers.indices.contains(a) ? s.origin : centers[a]), a) }
        if l.local {
            let ratio = l.distance > 0 ? s.offset / l.distance : 1
            return (ratio == 1 ? l.end : ratio == 0 ? l.start : TravelPoint(x: l.start.x + (l.end.x - l.start.x) * ratio, y: l.start.y + (l.end.y - l.start.y) * ratio), a)
        }
        let first = !s.crossed, start = first ? l.start : l.gate, end = first ? l.gate : l.end
        let total = first ? l.toGate : l.distance - l.toGate
        let ratio = total > 0 ? (first ? s.offset : s.offset - l.toGate) / total : 0
        let cell = first ? a : l.b
        if s.offset == l.toGate { return (l.gate, cell) }
        return (TravelPoint(x: start.x + (end.x - start.x) * ratio, y: start.y + (end.y - start.y) * ratio), cell)
    }
}

/// The simultaneous motion phase (force-motion47 advanceForceContactsCore47) for armies at peace: no
/// force is held by an enemy, so the event cursor only stops at gates and arrivals. Every force moves
/// by the same dt between events; with stopAtEvent the phase yields after an event, as force-tick47
/// calls it, and the caller continues the frame from the exact elapsed time.
public enum ForceMotion {
    public struct Rules {
        public var canEnter: (_ force: Int, _ cell: Int) -> Bool
        public var speed: (_ force: Int, _ cell: Int) -> Double
        public init(canEnter: @escaping (Int, Int) -> Bool, speed: @escaping (Int, Int) -> Double) { self.canEnter = canEnter; self.speed = speed }
    }

    /// Returns (elapsed, unused) like the web.
    static func phase(_ forces: inout [ArmyTravel], graph g: TravelGraph, seconds: Double, rules: Rules, stopAtEvent: Bool) -> (elapsed: Double, unused: Double) {
        struct Mover { let f: Int; let seg: TravelSegment; let speed: Double; let end: Double; let time: Double }
        var remaining = seconds, events = 0
        while remaining > 0 {
            events += 1; if events > 100_000 { break }
            var movers = [Mover]()
            for i in forces.indices where forces[i].status != .arrived && forces[i].status != .halted {
                guard let seg = g.segment(forces[i]) else { continue }
                let s = forces[i]
                if !s.crossed && (s.offset == 0 || s.offset == seg.toGate) && !rules.canEnter(i, seg.b) { forces[i].status = .blocked; continue }
                forces[i].status = .moving
                let end = s.crossed ? seg.distance : seg.toGate, left = end - s.offset
                let v = left == 0 ? 0 : rules.speed(i, s.crossed ? seg.b : seg.a)
                movers.append(Mover(f: i, seg: seg, speed: v, end: end, time: left == 0 ? 0 : v > 0 ? left / v : .infinity))
            }
            let dt = movers.reduce(remaining) { min($0, $1.time) }
            if dt > 0 {
                for m in movers { forces[m.f].offset = m.time <= dt ? m.end : forces[m.f].offset + dt * m.speed }
                remaining = max(0, remaining - dt)
            }
            let reached = movers.filter { $0.time <= dt }
            if remaining == 0 && reached.isEmpty { break }
            for m in reached where forces[m.f].crossed {
                forces[m.f].leg += 1; forces[m.f].offset = 0; forces[m.f].crossed = false
                if forces[m.f].leg == forces[m.f].nodes.count - 1 { forces[m.f].status = .arrived }
            }
            for m in reached {
                var s = forces[m.f]
                guard s.status != .arrived, !s.crossed, s.nodes[s.leg] == m.seg.a, s.offset == m.seg.toGate else { continue }
                if !rules.canEnter(m.f, m.seg.b) { s.status = .blocked; forces[m.f] = s; continue }
                s.crossed = true
                if s.offset == m.seg.distance { s.leg += 1; s.offset = 0; s.crossed = false; if s.leg == s.nodes.count - 1 { s.status = .arrived } }
                forces[m.f] = s
            }
            if stopAtEvent && !reached.isEmpty { break }
        }
        return (seconds - remaining, remaining)
    }

    /// One virtual frame (frame-loop47): from tick `start` to `start + frameTicks`, continuing the motion
    /// phase from each event's exact time like force-tick47.
    public static func frame(_ forces: inout [ArmyTravel], graph: TravelGraph, start: Double, frameTicks: Double, rules: Rules) {
        var now = start
        let tick = start + frameTicks
        while now < tick {
            let moved = phase(&forces, graph: graph, seconds: tick - now, rules: rules, stopAtEvent: true)
            now = moved.unused == 0 ? tick : now + moved.elapsed
            if moved.elapsed == 0 && moved.unused > 0 && !forces.contains(where: { $0.status == .moving }) { break }
        }
    }

    /// Biomes.SpeedModifier (native-war/biome-speed.ts).
    static let biomeSpeed: [Double] = [1, 0.7, 0.7, 1, 1, 1, 1, 1, 1, 1, 1, 0.7, 1].map(Native.fr)
    /// App rules: march pace per biome (marine, hot desert, cold desert, savanna, grassland, tropical
    /// seasonal forest, temperate forest, rainforest, temperate rainforest, taiga, tundra, glacier, wetland).
    /// The pace over each kind of land, as the original sets it (biomeSpeed; mountain 0.5, plateau 0.7).
    public static let terrainSpeed: [Double] = [1, 0.7, 0.7, 1, 1, 1, 1, 1, 1, 1, 1, 0.7, 1]
    /// 本作深化地形规则：每类地貌真实区分行军速度、税赋丰瘠、客军补给消耗、恶劣环境减员与守险修正。
    public static let appTerrainSpeed: [Double] = [1.02, 0.68, 0.68, 1.04, 1.06, 0.86, 0.86, 0.76, 0.80, 0.78, 0.76, 0.58, 0.66]
    public struct TerrainProfile: Sendable {
        public let speed: Double
        public let tax: Double
        public let supplyDrain: Double
        public let attrition: Double
        public let defenseBonus: Double
        public let attritionLabel: String
        public let summary: String
    }
    public static func terrainProfile(biome: Int, mountain: Bool) -> TerrainProfile {
        if mountain {
            return TerrainProfile(speed: 0.50, tax: 0.85, supplyDrain: 3.8, attrition: 0.012, defenseBonus: 1.28,
                                  attritionLabel: "中度损耗", summary: "关山险隘：行军半速、易守难攻，敌军深入补给吃紧")
        }
        switch max(0, min(12, biome)) {
        case 1, 2:
            return TerrainProfile(speed: 0.68, tax: 0.78, supplyDrain: 5.2, attrition: 0.018, defenseBonus: 1.05,
                                  attritionLabel: "严酷损耗", summary: "大漠荒原：产出稀薄，客军孤军深入极易断粮减员")
        case 11:
            return TerrainProfile(speed: 0.58, tax: 0.68, supplyDrain: 5.8, attrition: 0.022, defenseBonus: 1.18,
                                  attritionLabel: "极寒损耗", summary: "冰封极地：寸步难行，敌军久驻必遭严寒冻馁减员")
        case 12:
            return TerrainProfile(speed: 0.66, tax: 0.82, supplyDrain: 4.2, attrition: 0.015, defenseBonus: 1.20,
                                  attritionLabel: "瘴疠损耗", summary: "泥淖泽国：骑军受阻、守军得利，客军易染瘴耗粮")
        case 10:
            return TerrainProfile(speed: 0.76, tax: 0.80, supplyDrain: 3.6, attrition: 0.012, defenseBonus: 1.10,
                                  attritionLabel: "严寒损耗", summary: "冻原荒寒：粮产较低，行军滞缓且客军补给紧张")
        case 7, 8, 9:
            return TerrainProfile(speed: 0.78, tax: 0.90, supplyDrain: 2.8, attrition: 0.008, defenseBonus: 1.18,
                                  attritionLabel: "轻度损耗", summary: "深林密莽：易守难攻，不利骑兵展开与长途补给")
        case 5, 6:
            return TerrainProfile(speed: 0.86, tax: 0.98, supplyDrain: 1.8, attrition: 0.0, defenseBonus: 1.10,
                                  attritionLabel: "无额外损耗", summary: "林木葱郁：林道略缓，弓兵与步军守御占优")
        case 3:
            return TerrainProfile(speed: 1.04, tax: 1.02, supplyDrain: 1.4, attrition: 0.0, defenseBonus: 0.96,
                                  attritionLabel: "无额外损耗", summary: "疏林旷野：视野开阔、行军迅捷，利于骑兵驰骋")
        case 4:
            return TerrainProfile(speed: 1.06, tax: 1.12, supplyDrain: 1.0, attrition: 0.0, defenseBonus: 0.95,
                                  attritionLabel: "无额外损耗", summary: "沃野平畴：税赋丰盈、通衢疾行，骑兵冲阵如虎添翼")
        default:
            return TerrainProfile(speed: 1.02, tax: 1.10, supplyDrain: 1.0, attrition: 0.0, defenseBonus: 1.00,
                                  attritionLabel: "无额外损耗", summary: "临海通衢：渔盐商贸兴盛，补给充沛")
        }
    }
    public static let mapUnitsPerNativeUnit = 1000.0 / 240.0
    /// App worlds: this map's provinces are several times the original's, so an army marches briskly
    /// across Europe/China (1.42× step boost for land & sea when UnitKinds.enabled; parity tests untouched).
    public static let appMarch = 2.5
    public static let appPaceMultiplier = 1.42

    /// actualForceSpeed47 for an army: native Army.GetSpeed (nativeArmyMovementSpeed) per tick, in map units.
    public static func armySpeed(base: Double, unitSpeed: Double, cell: Int, graph g: TravelGraph, secondsPerTick: Double) -> Double {
        let fr = Native.fr, b = fr(base), unit = max(fr(0.05), fr(unitSpeed))
        let value: Double
        let q = Int(g.provinces[cell])
        if q < 0 { value = fr(b * fr(1.5)) }
        else if g.mountain[q] { value = fr(fr(b * fr(0.5)) * unit) }
        else if g.plateau[q] { value = fr(fr(b * fr(0.7)) * unit) }
        else {
            let bi = Int(g.faceBiomes[Int(g.faces[cell])])
            let sp = UnitKinds.enabled && appTerrainSpeed.indices.contains(bi) ? fr(appTerrainSpeed[bi]) : biomeSpeed[min(biomeSpeed.count - 1, max(0, bi))]
            value = fr(fr(b * sp) * unit)
        }
        let appBoost = UnitKinds.enabled ? appPaceMultiplier : 1.0
        return value * mapUnitsPerNativeUnit * secondsPerTick * appBoost
    }
}

/// 四时节气（与游戏内真实历法月份严格同步）：驱动地图光影雪线与实际行军、补给、赋税规则。
public enum WorldSeason: Int, Sendable {
    case spring = 0
    case summer = 1
    case autumn = 2
    case winter = 3

    public static func of(month: Int) -> WorldSeason {
        switch ((month - 1) % 12 + 12) % 12 + 1 {
        case 3, 4, 5: return .spring
        case 6, 7, 8: return .summer
        case 9, 10, 11: return .autumn
        default: return .winter
        }
    }

    public var name: String {
        switch self {
        case .spring: return "春"
        case .summer: return "夏"
        case .autumn: return "秋"
        case .winter: return "冬"
        }
    }

    public var fullName: String {
        switch self {
        case .spring: return "仲春"
        case .summer: return "盛夏"
        case .autumn: return "金秋"
        case .winter: return "隆冬"
        }
    }

    public var summary: String {
        switch self {
        case .spring: return "春耕复苏：兵源与士气恢复加快（+25%），雪融通途"
        case .summer: return "盛夏畅行：白昼充裕、行军畅快，正宜挥师远征"
        case .autumn: return "金秋丰稔：秋收赋税与粮秣增收（+12%），宜整军备战"
        case .winter: return "隆冬苦寒：高地北境积雪阻道，客军粮耗与寒损大增（+45%）"
        }
    }

    public var supplyDrainMultiplier: Double {
        switch self {
        case .spring: return 0.92
        case .summer: return 1.00
        case .autumn: return 0.88
        case .winter: return 1.45
        }
    }

    public var friendlyRecoveryMultiplier: Double {
        switch self {
        case .spring: return 1.25
        case .summer: return 1.00
        case .autumn: return 1.20
        case .winter: return 0.84
        }
    }

    public var taxMultiplier: Double {
        switch self {
        case .spring: return 1.02
        case .summer: return 1.04
        case .autumn: return 1.12
        case .winter: return 0.90
        }
    }

    public func winterColdBonus(biome: Int, mountain: Bool) -> Double {
        guard self == .winter else { return 0 }
        if mountain || biome == 10 || biome == 11 || biome == 2 { return 0.010 }
        return 0.004
    }
}

/// Army motion start exported from the web world (src/native-export/native-state.ts nativeTravelState).
/// Points are normalized web units; map coordinates are point / scale.
public struct TravelStart: Codable, Sendable {
    public struct Army: Codable, Sendable { public let cell: Int; public let x: Double; public let y: Double; public let base: Double; public let unitSpeed: Double }
    public let scale: Double
    public let secondsPerTick: Double
    public let frameTicks: Int
    public let armies: [Army]
}

/// The armies' journeys inside the Swift simulation: one record per army (world.armies order), moved
/// six frames a day by the shared motion phase. Orders follow army-commands47 (target cell of the
/// province, plain Dijkstra under the nation's access, from the army's exact current point).
public struct ArmyMotion: Sendable {
    public let graph: TravelGraph
    public let start: TravelStart
    public var travels: [ArmyTravel]
    /// Whether the army has left its exported idle spot (drawn at its travel point from then on).
    public var moved: [Bool]

    public init(graph: TravelGraph, start: TravelStart) {
        self.graph = graph; self.start = start
        travels = start.armies.map { a in ArmyTravel.stationed(at: TravelPoint(x: a.x, y: a.y), cell: graph.cell(id: a.cell) ?? 0) }
        moved = Array(repeating: false, count: start.armies.count)
    }

    /// Map position of a journey's current point.
    public func mapPoint(_ army: Int) -> (x: Double, y: Double) {
        let p = graph.location(travels[army]).point
        return (p.x / start.scale, p.y / start.scale)
    }
    public func cell(_ army: Int) -> Int { graph.location(travels[army]).cell }
    /// World province index under the army, −1 at sea.
    public func province(_ army: Int) -> Int { Int(graph.provinces[cell(army)]) }
    /// The remaining route in map coordinates (current point, then gates and cell centres).
    public func route(_ army: Int) -> [(x: Double, y: Double)] {
        let s = travels[army]
        guard s.status == .moving || s.status == .blocked else { return [] }
        var points = [mapPoint(army)]
        for leg in s.leg..<(s.nodes.count - 1) {
            var part = s; part.leg = leg
            guard let seg = graph.segment(part) else { break }
            if leg != s.leg || !s.crossed { points.append((seg.gate.x / start.scale, seg.gate.y / start.scale)) }
            points.append((seg.end.x / start.scale, seg.end.y / start.scale))
        }
        return points
    }
}

extension SimState {
    public enum OrderError: Error, Sendable, Equatable { case unknownArmy, notSafe, sameTarget, noTarget, noRoute
        public var message: String {
            switch self {
            case .unknownArmy: return "这支军队不存在或已失去战斗力。"
            case .notSafe: return "当前地区尚未安全，只能撤退或等待交锋与占领完成。"
            case .sameTarget: return "军队正在前往这个目标。"
            case .noTarget: return "目标不在当前地图的实际海陆网格中。"
            case .noRoute: return "没有符合当前外交通行限制的海陆路线。"
            }
        }
    }

    /// Controller nation of each world province (−1 unowned).
    func controllers() -> [Int] {
        var out = [Int](repeating: -1, count: worldProvinces)
        for p in provinces where out.indices.contains(p.province) { out[p.province] = p.nation }
        return out
    }

    /// armyTravelPolicyFactory47.canEnter: own (allied, vassal) land, the army's starting state, or
    /// enemy land when not retreating. Sea is always allowed outside reorganization.
    func canEnter(nation: Int, home: Int, controller: Int, retreat: Bool) -> Bool {
        controller == nation || controller == home && home >= 0 || !retreat && atWar(nation, controller)
    }

    /// issueArmyOrderOwned47 for a player march to a province.
    public mutating func order(army i: Int, toProvince target: Int) -> OrderError? {
        guard var m = motion, armies.indices.contains(i), armies[i].troops > 0, m.travels.indices.contains(i) else { return .unknownArmy }
        let a = armies[i], owners = controllers(), here = m.province(i)
        if here >= 0, atWar(a.nation, owners[here]) { return .notSafe }
        guard let cell = m.graph.targetCell(province: target) else { return .noTarget }
        let t = m.travels[i]
        if cell == t.nodes.last && t.status == .moving { return .sameTarget }
        let at = m.graph.location(t), home = here >= 0 ? owners[here] : -1
        guard let path = m.graph.path(from: at.cell, to: cell, canEnterProvince: { q in canEnter(nation: a.nation, home: home, controller: owners[q], retreat: false) }) else { return .noRoute }
        m.travels[i] = ArmyTravel(origin: at.point, nodes: path.nodes)
        m.moved[i] = true
        motion = m
        armyAI?.world.armies[i].manual = true
        armies[i].status = "idle"
        armies[i].travel = m.travels[i].status == .moving ? "moving" : "arrived"
        return nil
    }

    /// Stops an army where it stands (haltArmyTravel47).
    public mutating func halt(army i: Int) {
        guard var m = motion, m.travels.indices.contains(i), m.travels[i].status == .moving || m.travels[i].status == .blocked else { return }
        m.travels[i].status = .halted; motion = m; armies[i].travel = "halted"; armyAI?.world.armies[i].manual = true
    }

    /// One day of movement: six frames of the motion phase from this day's first tick.
    mutating func advanceMotion() {
        guard var m = motion else { return }
        if armyAI == nil && !m.travels.contains(where: { $0.status == .moving || $0.status == .blocked }) { return }
        let owners = controllers()
        let homes = armies.indices.map { i -> Int in
            if let ai = armyAI { let anchor = ai.world.armies[i].anchor; return ai.originalPaths && anchor >= 0 ? owners[anchor] : -1 }
            let p = m.province(i); return p >= 0 ? owners[p] : -1
        }
        let nations = armies.map(\.nation)
        let g = m.graph, speeds = m.start.armies, seconds = m.start.secondsPerTick
        let wars = self.wars
        let access = Dictionary(uniqueKeysWithValues: Set(nations).flatMap { a in Set(owners).map { b in ([a, b], militaryAccess(a, b)) } })
        let frames = SimState.ticksPerDay / max(1, m.start.frameTicks)
        for f in 0..<frames {
            // armyTravelPolicyFactory47.canEnter, with each army's retreat flag as it stands this frame.
            let retreat = armies.map { $0.status == "retreating" }
            let rules = ForceMotion.Rules(
                canEnter: { f, cell in
                    let q = Int(g.provinces[cell]); if q < 0 { return true }
                    let c = owners[q]
                    return access[[nations[f], c]] == true || c == homes[f] && homes[f] >= 0 || !retreat[f] && wars.contains([nations[f], c])
                },
                speed: { f, cell in ForceMotion.armySpeed(base: speeds[f].base, unitSpeed: speeds[f].unitSpeed, cell: cell, graph: g, secondsPerTick: seconds) })
            if m.travels.contains(where: { $0.status == .moving || $0.status == .blocked }) {
                ForceMotion.frame(&m.travels, graph: g, start: Double(tick + f * m.start.frameTicks), frameTicks: Double(m.start.frameTicks), rules: rules)
                completeRetreats(m, owners: owners)
            }
            if var ai = armyAI {
                syncAI(&ai.world, motion: m, owners: owners, tick: tick + (f + 1) * m.start.frameTicks)
                let before = m.travels
                ai.engine.issueBatch(&ai.world, travels: &m.travels)
                for i in armies.indices where i < ai.world.armies.count {
                    armies[i].status = ai.world.armies[i].status
                    if m.travels[i] != before[i] { m.moved[i] = true }
                }
                armyAI = ai
            }
        }
        for i in armies.indices where m.moved[i] {
            armies[i].province = m.province(i)
            switch m.travels[i].status { case .moving: armies[i].travel = "moving"; case .blocked: armies[i].travel = "blocked"
            case .arrived: armies[i].travel = "arrived"; case .halted: armies[i].travel = "halted" }
        }
        motion = m
    }
}

extension ArmyMotion: Equatable {
    /// The graph and start never change within a world; journeys decide equality.
    public static func == (a: ArmyMotion, b: ArmyMotion) -> Bool { a.travels == b.travels && a.moved == b.moved }
}

extension SimState {
    /// militaryAccess46: own land, or an ally or vassal not at war.
    func militaryAccess(_ a: Int, _ b: Int) -> Bool {
        if a == b { return true }
        if atWar(a, b) { return false }
        guard let d = diplomacy else { return false }
        return d.world.alliances.contains { !$0.ended && $0.members.contains(a) && $0.members.contains(b) } || d.world.vassals.contains { $0[0] == a && $0[1] == b }
    }
    /// force-runtime47: a retreating army that stopped on accessible land free of enemies is idle again.
    mutating func completeRetreats(_ m: ArmyMotion, owners: [Int]) {
        var holders = [Int: [Int]]()
        for i in armies.indices where armies[i].troops > 0 && armies[i].status != "destroyed" { let p = m.province(i); if p >= 0 { holders[p, default: []].append(i) } }
        for i in armies.indices where armies[i].status == "retreating" && (m.travels[i].status == .arrived || m.travels[i].status == .halted) {
            let p = m.province(i), n = armies[i].nation
            guard p >= 0 else { continue }
            let c = owners[p], ok = militaryAccess(n, c)
            if ok && !(holders[p] ?? []).contains(where: { armies[$0].status != "retreating" && atWar(n, armies[$0].nation) }) { armies[i].status = "idle" }
        }
    }
    /// Mirror the live world into the autonomy snapshot at a frame boundary.
    func syncAI(_ w: inout ArmyAIWorld, motion m: ArmyMotion, owners: [Int], tick: Int) {
        w.tick = tick; w.day = day
        w.owners = owners
        w.wars = wars.filter { $0[0] < $0[1] }.sorted { $0.lexicographicallyPrecedes($1) }
        if let d = diplomacy {
            var byID = [Int: Int](); for (i, n) in d.world.nations.enumerated() { byID[n.id] = i }
            w.campaigns = d.wars.enumerated().map { k, war in
                .init(id: k + 1, ended: war.endDay != nil, internal: false, participants: war.declared.participants.compactMap { p in byID[p.state].map { .init(nation: $0, side: p.side) } })
            }
            w.alliances = d.world.alliances.filter { !$0.ended }.map(\.members)
            w.vassals = d.world.vassals
        }
        for i in armies.indices where i < w.armies.count {
            w.armies[i].troops = armies[i].troops; w.armies[i].status = armies[i].status
            w.armies[i].busy = false; w.armies[i].engaged = armies[i].status == "fighting"
        }
    }
}

// MARK: 显示用平滑位置（仅用于界面，推演不读）
extension TravelGraph {
    /// 行军路径经过“格中心→边界门→格中心”，门点偏向两侧时路线呈之字形，按日取样的图标会左右来回摆。
    /// 这里取沿路径弧长 ±window 范围内的平均点：路线整体方向不变、之字被抹平；起点与终点处窗口收缩为零，
    /// 出发、到达时位置与真实位置重合，不会跳变。
    public func displayPoint(_ s: ArmyTravel, window: Double) -> TravelPoint {
        let here = location(s).point
        guard s.status == .moving, s.leg + 1 < s.nodes.count, window > 0 else { return here }
        // 当前段前后各取两段，构成局部折线（含各点的弧长）。
        let first = max(0, s.leg - 2), last = min(s.nodes.count - 2, s.leg + 2)
        var points = [TravelPoint](), arc = [Double]()
        var walked = 0.0, at = 0.0
        for leg in first...last {
            var t = s; t.leg = leg; t.offset = 0; t.crossed = false
            guard let seg = segment(t) else { return here }
            if points.isEmpty { points.append(seg.start); arc.append(walked) }
            if leg == s.leg { at = walked + s.offset }
            walked += seg.toGate; points.append(seg.gate); arc.append(walked)
            walked += seg.distance - seg.toGate; points.append(seg.end); arc.append(walked)
        }
        // 局部折线两端：若它就是整条路线的起点或终点，窗口在那里收缩为零；否则只受局部长度限制。
        let atStart = first == 0, atEnd = last == s.nodes.count - 2
        let back = atStart ? at : at - arc[0], ahead = atEnd ? walked - at : walked - at
        let w = min(window, max(0, back), max(0, ahead))
        if w <= 0 { return here }
        func point(_ d: Double) -> TravelPoint {
            var i = 1
            while i < arc.count - 1 && arc[i] < d { i += 1 }
            let a = points[i - 1], b = points[i], span = arc[i] - arc[i - 1]
            let k = span > 0 ? max(0, min(1, (d - arc[i - 1]) / span)) : 0
            return TravelPoint(x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k)
        }
        var x = 0.0, y = 0.0
        let samples = [-1.0, -0.5, 0, 0.5, 1.0]
        for f in samples { let p = point(at + f * w); x += p.x; y += p.y }
        return TravelPoint(x: x / Double(samples.count), y: y / Double(samples.count))
    }
}
