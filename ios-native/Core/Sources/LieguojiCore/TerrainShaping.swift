import Foundation

/// Post-process for generated heights so New World knobs (land ratio, mountains, rivers,
/// climate bands, nation-size bias) change the map without editing the web bridge.
public enum TerrainShaping {
    public struct Options: Sendable {
        /// Target land fraction of all cells (sea = height < 20). Clamped in apply.
        public var landRatio: Double
        /// 0…1 — boost peaks / high land.
        public var mountains: Double
        /// 0…1 — carve troughs that become river corridors in Climate.surface.
        public var rivers: Double
        /// 0…1 — latitudinal height bias (cold poles / warm equator contrast).
        public var climate: Double
        /// balanced | hegemony | fragmented — reshape landmass sizes before settlement.
        public var nationSize: String
        public init(landRatio: Double = 0.35, mountains: Double = 0.5, rivers: Double = 0.5,
                    climate: Double = 0.5, nationSize: String = "balanced") {
            self.landRatio = landRatio; self.mountains = mountains; self.rivers = rivers
            self.climate = climate; self.nationSize = nationSize
        }
    }

    public static func apply(_ input: [UInt8], graph: TerrainGraph, seed: String, options: Options) -> [UInt8] {
        var h = input
        let n = min(h.count, graph.points.count)
        guard n > 0 else { return h }
        var alea = Alea(seed + "/shape")
        func rnd() -> Double { alea.next() }
        let target = min(0.72, max(0.12, options.landRatio))
        h = adjustLandRatio(h, graph: graph, target: target, random: rnd)
        h = boostMountains(h, amount: options.mountains)
        h = carveRiverCorridors(h, graph: graph, amount: options.rivers, random: rnd)
        h = climateBands(h, graph: graph, amount: options.climate)
        h = nationSizeBias(h, graph: graph, mode: options.nationSize, random: rnd)
        return h
    }

    /// Raise sea that touches land, or sink low land into sea, until land fraction ≈ target.
    static func adjustLandRatio(_ input: [UInt8], graph: TerrainGraph, target: Double, random: () -> Double) -> [UInt8] {
        var h = input
        let n = min(h.count, graph.points.count)
        func landCount() -> Int { (0..<n).reduce(0) { $0 + (h[$1] >= 20 ? 1 : 0) } }
        var land = landCount()
        let want = Int((Double(n) * target).rounded())
        var guardSteps = 0
        while land < want && guardSteps < n {
            guardSteps += 1
            let shore = (0..<n).filter { i in h[i] < 20 && graph.neighbors[i].contains { h[$0] >= 20 } }
            if shore.isEmpty { break }
            let i = shore[Int(random() * Double(shore.count)) % shore.count]
            h[i] = UInt8(min(100, 22 + Int(random() * 12)))
            land += 1
        }
        guardSteps = 0
        while land > want && guardSteps < n {
            guardSteps += 1
            let rim = (0..<n).filter { i in h[i] >= 20 && h[i] < 35 && graph.neighbors[i].contains { h[$0] < 20 } }
            let pool = rim.isEmpty ? (0..<n).filter { h[$0] >= 20 && h[$0] < 40 } : rim
            if pool.isEmpty { break }
            let i = pool[Int(random() * Double(pool.count)) % pool.count]
            h[i] = UInt8(max(0, Int(h[i]) - 12 - Int(random() * 8)))
            if h[i] < 20 { land -= 1 }
        }
        return h
    }

    /// Scale land above the plains toward peaks (mountains slider).
    static func boostMountains(_ input: [UInt8], amount: Double) -> [UInt8] {
        let a = min(1, max(0, amount))
        return input.map { v in
            guard v >= 20 else { return v }
            let base = Double(v)
            let flat = 20 + (base - 20) * 0.55
            let tall = 20 + min(80, (base - 20) * 1.45)
            return UInt8(min(100, max(0, flat + (tall - flat) * a).rounded(.towardZero)))
        }
    }

    /// Carve random troughs on land (more rivers) or smooth them away (fewer).
    static func carveRiverCorridors(_ input: [UInt8], graph: TerrainGraph, amount: Double, random: () -> Double) -> [UInt8] {
        var h = input
        let n = min(h.count, graph.points.count)
        let a = min(1, max(0, amount))
        let cuts = Int(2 + a * 14)
        if a < 0.35 {
            // Light smooth on mid land — fewer channels.
            let old = h
            for i in 0..<n where old[i] >= 20 {
                var sum = Double(old[i]); let nbr = graph.neighbors[i]
                for o in nbr { sum += Double(old[o]) }
                let mean = sum / Double(nbr.count + 1)
                h[i] = UInt8(min(100, max(20, (Double(old[i]) * 0.7 + mean * 0.3)).rounded(.towardZero)))
            }
            return h
        }
        for _ in 0..<cuts {
            let land = (0..<n).filter { h[$0] >= 28 }
            guard !land.isEmpty else { break }
            var cur = land[Int(random() * Double(land.count)) % land.count]
            for _ in 0..<Int(18 + a * 40) {
                if h[cur] >= 22 {
                    h[cur] = UInt8(max(20, Int(h[cur]) - Int(6 + a * 10)))
                }
                let nbr = graph.neighbors[cur]
                guard !nbr.isEmpty else { break }
                var best = nbr[0]
                for o in nbr where Int(h[o]) + Int(random() * 8) < Int(h[best]) + Int(random() * 4) { best = o }
                cur = best
            }
        }
        return h
    }

    /// Latitudinal height bias: stronger climate bands raise polar land / depress tropics or reverse.
    static func climateBands(_ input: [UInt8], graph: TerrainGraph, amount: Double) -> [UInt8] {
        let a = min(1, max(0, amount))
        let H = max(1, graph.height)
        return input.enumerated().map { i, v in
            guard v >= 20, i < graph.points.count else { return v }
            let lat = graph.points[i].1 / H  // 0 north-ish … 1 south in doc space
            let polar = abs(lat - 0.5) * 2   // 0 equator, 1 pole
            // Mid slider ≈ neutral; high = colder poles (raise) + warmer equator (slight lower).
            let delta = (a - 0.5) * 2 * (polar * 14 - (1 - polar) * 6)
            return UInt8(min(100, max(20, Int(Double(v) + delta))))
        }
    }

    /// Reshape connected landmass areas so settlement tends toward equal / one empire / many scraps.
    static func nationSizeBias(_ input: [UInt8], graph: TerrainGraph, mode: String, random: () -> Double) -> [UInt8] {
        var h = input
        let n = min(h.count, graph.points.count)
        // Connected components of land.
        var seen = [Bool](repeating: false, count: n), comps = [[Int]]()
        for i in 0..<n where h[i] >= 20 && !seen[i] {
            var stack = [i], members = [Int](); seen[i] = true
            while let c = stack.popLast() {
                members.append(c)
                for o in graph.neighbors[c] where o < n && h[o] >= 20 && !seen[o] { seen[o] = true; stack.append(o) }
            }
            comps.append(members)
        }
        guard comps.count >= 1 else { return h }
        comps.sort { $0.count > $1.count }
        switch mode {
        case "hegemony":
            // Grow the largest; sink small landmasses toward sea.
            for c in comps.dropFirst() where c.count < comps[0].count / 2 {
                for i in c {
                    if random() < 0.55 { h[i] = UInt8(max(0, Int(h[i]) - 18)) }
                }
            }
            for i in comps[0] where h[i] >= 20 && h[i] < 55 {
                h[i] = UInt8(min(100, Int(h[i]) + 4))
            }
        case "fragmented":
            // Punch holes / straits into large masses.
            for c in comps where c.count > 80 {
                let punches = max(1, c.count / 120)
                for _ in 0..<punches {
                    let start = c[Int(random() * Double(c.count)) % c.count]
                    var cur = start
                    for _ in 0..<30 {
                        h[cur] = UInt8(min(18, Int(h[cur])))
                        let nbr = graph.neighbors[cur]
                        if nbr.isEmpty { break }
                        cur = nbr[Int(random() * Double(nbr.count)) % nbr.count]
                    }
                }
            }
        default:
            // balanced: gently even out mass sizes by shaving the largest and lifting small islands a bit.
            if comps.count >= 2 {
                let avg = comps.map(\.count).reduce(0, +) / comps.count
                for c in comps where c.count > avg * 2 {
                    for i in c where h[i] < 32 && graph.neighbors[i].contains(where: { $0 < n && h[$0] < 20 }) {
                        if random() < 0.25 { h[i] = UInt8(max(0, Int(h[i]) - 10)) }
                    }
                }
            }
        }
        return h
    }
}
