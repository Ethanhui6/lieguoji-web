import Foundation

/// V8's Math.hypot (builtins/math.tq): normalise by the largest magnitude, Kahan-sum the squares.
/// Distances along army routes must use this exact algorithm, not libm hypot.
func jsHypot(_ x: Double, _ y: Double) -> Double {
    let ax = abs(x), ay = abs(y)
    if ax.isNaN || ay.isNaN { return ax == .infinity || ay == .infinity ? .infinity : .nan }
    let m = max(ax, ay)
    if m == .infinity { return .infinity }
    if m == 0 { return 0 }
    var sum = 0.0, compensation = 0.0
    for v in [ax, ay] {
        let n = v / m, summand = n * n - compensation, preliminary = sum + summand
        compensation = (preliminary - sum) - summand
        sum = preliminary
    }
    return sum.squareRoot() * m
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
    public let mountain: [Bool], plateau: [Bool], targets: [TravelPoint]
    public let faceBiomes: [UInt8]
    public var count: Int { ids.count }

    public enum LoadError: Error { case format }
    public init(data: Data) throws {
        var o = 0
        func u32() throws -> UInt32 { guard o + 4 <= data.count else { throw LoadError.format }
            let v = data.withUnsafeBytes { $0.loadUnaligned(fromByteOffset: o, as: UInt32.self) }; o += 4; return UInt32(littleEndian: v) }
        func i32() throws -> Int32 { Int32(bitPattern: try u32()) }
        func f64() throws -> Double { guard o + 8 <= data.count else { throw LoadError.format }
            let v = data.withUnsafeBytes { $0.loadUnaligned(fromByteOffset: o, as: UInt64.self) }; o += 8; return Double(bitPattern: UInt64(littleEndian: v)) }
        func u8() throws -> UInt8 { guard o < data.count else { throw LoadError.format }; defer { o += 1 }; return data[data.startIndex + o] }
        guard try u32() == 0x5654474c, try u32() == 1 else { throw LoadError.format }
        let n = Int(try u32()), l = Int(try u32()), p = Int(try u32()), f = Int(try u32())
        var ids = [Int32](), faces = [Int32](), provinces = [Int32](), centers = [TravelPoint](), starts = [Int]()
        ids.reserveCapacity(n); faces.reserveCapacity(n); provinces.reserveCapacity(n); centers.reserveCapacity(n); starts.reserveCapacity(n + 1)
        for _ in 0..<n {
            ids.append(try i32()); faces.append(try i32()); provinces.append(try i32())
            centers.append(TravelPoint(x: try f64(), y: try f64())); starts.append(Int(try u32()))
        }
        starts.append(Int(try u32()))
        var to = [Int](), gates = [TravelPoint](), costs = [Double]()
        to.reserveCapacity(l); gates.reserveCapacity(l); costs.reserveCapacity(l)
        for _ in 0..<l {
            to.append(Int(try i32())); gates.append(TravelPoint(x: try f64(), y: try f64()))
            _ = try f64(); _ = try f64() // web distance / toGate: recomputed by the segment geometry
            costs.append(try f64())
        }
        var mountain = [Bool](), plateau = [Bool](), targets = [TravelPoint]()
        for _ in 0..<p { mountain.append(try u8() != 0); plateau.append(try u8() != 0); targets.append(TravelPoint(x: try f64(), y: try f64())) }
        var biomes = [UInt8](); biomes.reserveCapacity(f)
        for _ in 0..<f { biomes.append(try u8()) }
        guard o == data.count, starts.last == l else { throw LoadError.format }
        self.ids = ids; self.faces = faces; self.provinces = provinces; self.centers = centers; linkStart = starts
        linkTo = to; self.gates = gates; linkCost = costs; self.mountain = mountain; self.plateau = plateau; self.targets = targets; faceBiomes = biomes
        var index = [Int32: Int](); for (i, id) in ids.enumerated() { index[id] = i }; self.index = index
        var byProvince = [[Int]](repeating: [], count: p)
        for (i, q) in provinces.enumerated() where q >= 0 { byProvince[Int(q)].append(i) }
        self.byProvince = byProvince
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
    public func path(from start: Int, to end: Int, allowSea: Bool = true, canEnterProvince: (Int) -> Bool) -> (nodes: [Int], cost: Double)? {
        var allowed = [Int8](repeating: 0, count: mountain.count)
        func enter(_ i: Int) -> Bool {
            let q = Int(provinces[i]); if q < 0 { return allowSea }
            if allowed[q] == 0 { allowed[q] = canEnterProvince(q) ? 1 : 2 }
            return allowed[q] == 1
        }
        guard (isSea(start) ? allowSea : true), enter(end) else { return nil }
        let n = count
        var cost = [Double](repeating: .infinity, count: n), prev = [Int](repeating: -1, count: n), settled = [Bool](repeating: false, count: n)
        var heap = MinHeap(); cost[start] = 0; heap.push(0, start)
        while !settled[end], let (c, a) = heap.pop() {
            if cost[a] != c || settled[a] { continue }
            settled[a] = true
            for k in linkStart[a]..<linkStart[a + 1] {
                let b = linkTo[k]
                if settled[b] || !enter(b) { continue }
                let next = Native.fr(c + linkCost[k])
                if next < cost[b] { cost[b] = next; prev[b] = a; heap.push(next, b) }
            }
        }
        guard settled[end] else { return nil }
        var nodes = [end], i = end
        while i != start { i = prev[i]; nodes.append(i) }
        return (nodes.reversed(), cost[end])
    }
}

/// Binary heap ordered by (cost, index), as the web's search frontier.
struct MinHeap {
    private var c: [Double] = [], i: [Int] = []
    private func before(_ a: Int, _ b: Int) -> Bool { c[a] < c[b] || c[a] == c[b] && i[a] < i[b] }
    mutating func push(_ cost: Double, _ id: Int) {
        c.append(cost); i.append(id); var k = c.count - 1
        while k > 0 { let p = (k - 1) >> 1; if !before(k, p) { break }; c.swapAt(k, p); i.swapAt(k, p); k = p }
    }
    mutating func pop() -> (Double, Int)? {
        guard !c.isEmpty else { return nil }
        let top = (c[0], i[0]); let last = c.count - 1
        c.swapAt(0, last); i.swapAt(0, last); c.removeLast(); i.removeLast()
        var k = 0
        while true {
            let l = 2 * k + 1, r = l + 1; var m = k
            if l < c.count && before(l, m) { m = l }
            if r < c.count && before(r, m) { m = r }
            if m == k { break }
            c.swapAt(k, m); i.swapAt(k, m); k = m
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
    /// beginArmyTravel47: from an exact point along a cell path.
    public init(origin: TravelPoint, nodes: [Int]) { self.origin = origin; self.nodes = nodes; status = nodes.count == 1 ? .arrived : .moving }
    /// A stationary army at a point of its cell.
    public static func stationed(at point: TravelPoint, cell: Int) -> ArmyTravel { ArmyTravel(origin: point, nodes: [cell]) }
}

struct TravelSegment { let a: Int, b: Int, start: TravelPoint, gate: TravelPoint, end: TravelPoint, toGate: Double, distance: Double }

extension TravelGraph {
    /// armyTravelSegment47 for version 1 records.
    func segment(_ s: ArmyTravel) -> TravelSegment? {
        guard s.leg + 1 < s.nodes.count else { return nil }
        let a = s.nodes[s.leg], b = s.nodes[s.leg + 1]
        guard let k = link(from: a, to: b) else { return nil }
        let start = s.leg == 0 ? s.origin : centers[a], gate = gates[k], end = centers[b]
        let toGate = jsHypot(start.x - gate.x, start.y - gate.y)
        return TravelSegment(a: a, b: b, start: start, gate: gate, end: end, toGate: toGate, distance: toGate + jsHypot(gate.x - end.x, gate.y - end.y))
    }

    /// armyTravelLocation47: the exact point and cell of a journey.
    public func location(_ s: ArmyTravel) -> (point: TravelPoint, cell: Int) {
        let a = s.nodes[s.leg]
        guard let l = segment(s) else { return (s.leg == 0 ? s.origin : centers[a], a) }
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
    public static let mapUnitsPerNativeUnit = 1000.0 / 240.0

    /// actualForceSpeed47 for an army: native Army.GetSpeed (nativeArmyMovementSpeed) per tick, in map units.
    public static func armySpeed(base: Double, unitSpeed: Double, cell: Int, graph g: TravelGraph, secondsPerTick: Double) -> Double {
        let fr = Native.fr, b = fr(base), unit = max(fr(0.05), fr(unitSpeed))
        let value: Double
        let q = Int(g.provinces[cell])
        if q < 0 { value = fr(b * fr(1.5)) }
        else if g.mountain[q] { value = fr(fr(b * fr(0.5)) * unit) }
        else if g.plateau[q] { value = fr(fr(b * fr(0.7)) * unit) }
        else { value = fr(fr(b * biomeSpeed[Int(g.faceBiomes[Int(g.faces[cell])])]) * unit) }
        return value * mapUnitsPerNativeUnit * secondsPerTick
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
        armies[i].status = "idle"
        armies[i].travel = m.travels[i].status == .moving ? "moving" : "arrived"
        return nil
    }

    /// Stops an army where it stands (haltArmyTravel47).
    public mutating func halt(army i: Int) {
        guard var m = motion, m.travels.indices.contains(i), m.travels[i].status == .moving || m.travels[i].status == .blocked else { return }
        m.travels[i].status = .halted; motion = m; armies[i].travel = "halted"
    }

    /// One day of movement: six frames of the motion phase from this day's first tick.
    mutating func advanceMotion() {
        guard var m = motion, m.travels.contains(where: { $0.status == .moving || $0.status == .blocked }) else { return }
        let owners = controllers()
        let homes = armies.indices.map { i -> Int in let p = m.province(i); return p >= 0 ? owners[p] : -1 }
        let nations = armies.map(\.nation), retreat = armies.map { $0.status == "retreating" }
        let g = m.graph, speeds = m.start.armies, seconds = m.start.secondsPerTick
        let wars = self.wars
        let rules = ForceMotion.Rules(
            canEnter: { f, cell in
                let q = Int(g.provinces[cell]); if q < 0 { return true }
                let c = owners[q]
                return c == nations[f] || c == homes[f] && homes[f] >= 0 || !retreat[f] && wars.contains([nations[f], c])
            },
            speed: { f, cell in ForceMotion.armySpeed(base: speeds[f].base, unitSpeed: speeds[f].unitSpeed, cell: cell, graph: g, secondsPerTick: seconds) })
        let frames = SimState.ticksPerDay / max(1, m.start.frameTicks)
        for f in 0..<frames {
            ForceMotion.frame(&m.travels, graph: g, start: Double(tick + f * m.start.frameTicks), frameTicks: Double(m.start.frameTicks), rules: rules)
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
