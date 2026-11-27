import Foundation

/// 新世界的原生地图（src/native-bridge/world-map.ts buildWorldMap）：原作格网上的气候与生物群系
/// （original-biomes）、群系色、平滑海岸线（coast-curve）、按海岸距离着色的海面（ocean-coast、original-style）、
/// 河流带（original-rivers）、国名框（original-labels47）与元数据，编成 world.bin 版本 2。
public enum CreationMap {
    static let f = Native.fr

    /// 原作 20k 格网的共享 Voronoi 边（Resources/World/edges20k.bin，双精度）。
    public struct GridEdges: Sendable {
        public let a: [Int], b: [Int], segments: [(Double, Double, Double, Double)]
        public init(data: Data) throws {
            var o = 0
            func u32() -> UInt32 { let v = data.withUnsafeBytes { $0.loadUnaligned(fromByteOffset: o, as: UInt32.self) }; o += 4; return UInt32(littleEndian: v) }
            func f64() -> Double { let v = data.withUnsafeBytes { $0.loadUnaligned(fromByteOffset: o, as: UInt64.self) }; o += 8; return Double(bitPattern: UInt64(littleEndian: v)) }
            guard data.count >= 12, u32() == 0x4547474c, u32() == 1 else { throw TravelGraph.LoadError.format }
            let n = Int(u32())
            guard data.count == 12 + n * 40 else { throw TravelGraph.LoadError.format }
            var a = [Int](), b = [Int](), s = [(Double, Double, Double, Double)]()
            a.reserveCapacity(n); b.reserveCapacity(n); s.reserveCapacity(n)
            for _ in 0..<n { a.append(Int(Int32(bitPattern: u32()))); b.append(Int(Int32(bitPattern: u32()))); s.append((f64(), f64(), f64(), f64())) }
            self.a = a; self.b = b; segments = s
        }
    }

    /// 地图所需的固定输入：随包格网（world.bin 的多边形、边与站点）、原作格网邻接与双精度边、绘图网格文档。
    public struct Inputs: Sendable {
        public let base: WorldMap, grid: TerrainGraph, edges: GridEdges, document: TerrainDocument
        public init(base: WorldMap, grid: TerrainGraph, edges: GridEdges, document: TerrainDocument) { self.base = base; self.grid = grid; self.edges = edges; self.document = document }
    }

    // MARK: 气候与生物群系（original-biomes）

    static let biomeColors: [[Double]] = [[60, 130, 210], [255, 204, 0], [255, 230, 140], [230, 220, 110], [170, 230, 100], [150, 230, 70], [30, 200, 80],
                                          [80, 220, 30], [50, 190, 70], [90, 140, 60], [180, 160, 100], [220, 240, 255], [20, 180, 70]].map { $0.map { Native.fr($0 / 255) } }
    static func srgbToLinear(_ c: Double) -> Double { c <= 0.04045 ? c / 12.92 : pow((c + 0.055) / 1.055, 2.4) }
    static func linearToSrgb(_ c: Double) -> Double { c <= 0.0031308 ? 12.92 * c : 1.055 * pow(c, 1 / 2.4) - 0.055 }
    static func jsRound(_ x: Double) -> Double { (x + 0.5).rounded(.down) }

    /// originalClimate + originalBiomeIds：格网自身的降水、气温与河流，按原作 Biomes.define 定群系。
    /// 历史剧本模式下（`historicalRegion != nil && != .custom`）叠加真实大河流域冲积平原水源，避免尼罗河谷/长江/莱茵河流域误判荒漠。
    static func biomes(_ x: Inputs, elevations h: [Int], historicalRegion: HistoricalRegion? = nil) -> (ids: [UInt8], paths: [[Int]]) {
        let g = x.grid, d = x.document
        let heights = h.map { UInt8(min(100, max(0, $0))) }
        let climate = Climate.grid(heights, g.cellsX, g.cellsY)
        let useRealRivers = (historicalRegion != nil && historicalRegion != .custom)
        let rivers = useRealRivers ? (riverIds: [Int](repeating: 0, count: h.count), flux: [Int](repeating: 0, count: h.count), paths: [[Int]]()) : Climate.rivers(points: d.points, triangles: d.triangles, neighbors: g.neighbors, h, climate.precipitation)
        let realRiverMask = useRealRivers ? HistoricalGeography.riverNearMask(region: historicalRegion!, points: g.points, width: g.width, height: g.height) : []
        var ids = [UInt8](repeating: 0, count: h.count)
        for cell in h.indices {
            let nearReal = useRealRivers && cell < realRiverMask.count && realRiverMask[cell]
            let riverBoost: Double = nearReal ? 6.5 : (rivers.riverIds[cell] != 0 ? max(Double(rivers.flux[cell]) / 10, 2) : 0)
            var sum = Double(climate.precipitation[cell]) + riverBoost, n = 1.0
            for j in g.neighbors[cell] where h[j] >= 20 { sum += Double(climate.precipitation[j]); n += 1 }
            ids[cell] = UInt8(Climate.biome(moisture: jsRound(4 + sum / n), temperature: Int(climate.temperature[cell]), height: Double(h[cell]), hasRiver: nearReal || rivers.riverIds[cell] != 0))
        }
        return (ids, rivers.paths)
    }

    /// originalBiomeLinear 后按 world-map.ts 转成 sRGB 字节。
    static func biomeRGB(_ g: TerrainGraph, _ ids: [UInt8]) -> [UInt8] {
        let linear = biomeColors.map { $0.map { f(srgbToLinear($0)) } }
        var out = [UInt8](repeating: 0, count: ids.count * 3)
        func srgb(_ v: Double) -> UInt8 {
            let s = jsRound(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * pow(v, 1 / 2.4) - 0.055))
            return UInt8(max(0, min(255, s)))
        }
        for cell in ids.indices {
            let id = Int(ids[cell]); var rgb: [Double]
            if id == 0 { rgb = biomeColors[3] } else {
                var r = f(linear[id][0] * 10), gg = f(linear[id][1] * 10), b = f(linear[id][2] * 10), n = 10.0
                for j in g.neighbors[cell] { let k = Int(ids[j]); if k == 0 { continue }; r = f(r + linear[k][0]); gg = f(gg + linear[k][1]); b = f(b + linear[k][2]); n += 1 }
                rgb = [f(r / n), f(gg / n), f(b / n)]
            }
            for k in 0..<3 { out[cell * 3 + k] = srgb(rgb[k]) }
        }
        return out
    }

    // MARK: 海岸线（original-layers originalCoast、coast-curve）

    struct PointKey: Hashable { let x: UInt64, y: UInt64
        init(_ x: Double, _ y: Double) { self.x = (x == 0 ? 0.0 : x).bitPattern; self.y = (y == 0 ? 0.0 : y).bitPattern } }
    typealias Segment = (Double, Double, Double, Double)

    static func chains(_ segments: [Segment]) -> [[(Double, Double)]] {
        var ends = [PointKey: [Int]](), used = [Bool](repeating: false, count: segments.count)
        for (i, s) in segments.enumerated() { for k in [PointKey(s.0, s.1), PointKey(s.2, s.3)] { ends[k, default: []].append(i) } }
        func next(_ x: Double, _ y: Double) -> Int { ends[PointKey(x, y)]?.first { !used[$0] } ?? -1 }
        func extend(_ line: inout [(Double, Double)]) {
            var at = line[line.count - 1], i = next(at.0, at.1)
            while i != -1 {
                used[i] = true; let s = segments[i]
                line.append(s.0 == at.0 && s.1 == at.1 ? (s.2, s.3) : (s.0, s.1))
                at = line[line.count - 1]; i = next(at.0, at.1)
            }
        }
        func degree(_ x: Double, _ y: Double) -> Int { ends[PointKey(x, y)]?.count ?? 0 }
        func tip(_ i: Int) -> Int { let s = segments[i]; return degree(s.0, s.1) != 1 && degree(s.2, s.3) != 1 ? 1 : 0 }
        let order = segments.indices.sorted { tip($0) != tip($1) ? tip($0) < tip($1) : $0 < $1 }
        var out = [[(Double, Double)]]()
        for start in order where !used[start] {
            used[start] = true
            var s = segments[start]
            if degree(s.2, s.3) == 1 { s = (s.2, s.3, s.0, s.1) }
            var line = [(s.0, s.1), (s.2, s.3)]
            extend(&line)
            if line[0].0 != line[line.count - 1].0 || line[0].1 != line[line.count - 1].1 {
                var head = [line[0]]
                extend(&head)
                if head.count > 1 { line.insert(contentsOf: head.dropFirst().reversed(), at: 0) }
            }
            out.append(line)
        }
        return out
    }
    static func basis(_ t0: Double) -> [Double] {
        let t = f(t0), t2 = f(t * t), t3 = f(t2 * t)
        return [f(f(f(f(1 - f(t * 3)) + f(t2 * 3)) - t3) / 6), f(f(f(4 - f(t2 * 6)) + f(t3 * 3)) / 6), f(f(f(f(f(t * 3) + 1) + f(t2 * 3)) - f(t3 * 3)) / 6), f(t3 / 6)]
    }
    static func mix(_ p0: (Double, Double), _ p1: (Double, Double), _ p2: (Double, Double), _ p3: (Double, Double), _ b: [Double]) -> (Double, Double) {
        (f(f(f(f(p1.0 * b[1]) + f(p0.0 * b[0])) + f(p2.0 * b[2])) + f(p3.0 * b[3])), f(f(f(f(p1.1 * b[1]) + f(p0.1 * b[0])) + f(p2.1 * b[2])) + f(p3.1 * b[3])))
    }
    static func curveBasis(_ points: [(Double, Double)], _ segments: Int) -> [(Double, Double)] {
        let n = points.count
        if n >= 2 && abs(f(points[0].0 - points[n - 1].0)) < f(0.001) && abs(f(points[0].1 - points[n - 1].1)) < f(0.001) {
            var result = [(Double, Double)]()
            for i in 0..<n {
                let p0 = points[(n - 1 + i) % n], p1 = points[i], p2 = points[(i + 1) % n], p3 = points[(i + 2) % n]
                for j in 0...segments {
                    let point = mix(p0, p1, p2, p3, basis(f(Double(j)) / f(Double(segments))))
                    if let last = result.last, last.0 == point.0 && last.1 == point.1 { continue }
                    result.append(point)
                }
            }
            if let first = result.first, let last = result.last, first.0 != last.0 || first.1 != last.1 { result.append(first) }
            return result
        }
        var result = [(Double, Double)]()
        if n < 2 { return result }
        for i in 0..<(n - 1) {
            let p0 = i > 0 ? points[i - 1] : points[i], p1 = points[i], p2 = points[i + 1], p3 = i < n - 2 ? points[i + 2] : points[i + 1]
            for j in (i != 0 ? 1 : 0)...segments { result.append(mix(p0, p1, p2, p3, basis(f(Double(j)) / f(Double(segments))))) }
        }
        return result
    }
    /// originalCoast：一侧在海平面下的格网边连成链、平滑后的线段。
    static func coast(_ x: Inputs, elevations h: [Int]) -> [Segment] {
        var raw = [Segment]()
        for k in x.edges.a.indices {
            let a = x.edges.a[k], b = x.edges.b[k]
            let sa = h[a] < 20, sb = b >= 0 && b < h.count ? h[b] < 20 : false
            if sa != sb { raw.append(x.edges.segments[k]) }
        }
        var out = [Segment]()
        for line in chains(raw) {
            let curve = curveBasis(line.map { (f($0.0), f($0.1)) }, 4)
            var kept = [(Double, Double)]()
            for (i, p) in curve.enumerated() {
                if i == 0 || i == curve.count - 1 { kept.append(p); continue }
                let prev = curve[i - 1]
                if abs(p.0 - prev.0) >= 0.001 || abs(p.1 - prev.1) >= 0.001 { kept.append(p) }
            }
            for i in 1..<max(1, kept.count) { out.append((kept[i - 1].0, kept[i - 1].1, kept[i].0, kept[i].1)) }
        }
        return out
    }

    // MARK: 海面（ocean-coast createFmsCoastDistance、original-style originalSeaSrgb）

    final class CoastDistance {
        struct Node { var minX = Double.infinity, minY = Double.infinity, maxX = -Double.infinity, maxY = -Double.infinity; let start: Int, end: Int; var left = -1, right = -1 }
        var ordered: [Segment], nodes = [Node]()
        let cap: Double
        init(_ segments: [Segment], cap: Double) {
            ordered = segments; self.cap = cap
            if !ordered.isEmpty { _ = build(0, ordered.count) }
        }
        func build(_ start: Int, _ end: Int) -> Int {
            var node = Node(start: start, end: end)
            for i in start..<end {
                let s = ordered[i]
                node.minX = min(node.minX, s.0, s.2); node.minY = min(node.minY, s.1, s.3); node.maxX = max(node.maxX, s.0, s.2); node.maxY = max(node.maxY, s.1, s.3)
            }
            let id = nodes.count; nodes.append(node)
            if end - start > 8 {
                let axisX = node.maxX - node.minX >= node.maxY - node.minY
                let slice = Array(ordered[start..<end]).enumerated().sorted { a, b in
                    let va = axisX ? a.element.0 + a.element.2 : a.element.1 + a.element.3, vb = axisX ? b.element.0 + b.element.2 : b.element.1 + b.element.3
                    return va != vb ? va - vb < 0 : a.offset < b.offset
                }
                for (i, s) in slice.enumerated() { ordered[start + i] = s.element }
                let middle = (start + end) >> 1
                let l = build(start, middle), r = build(middle, end)
                nodes[id].left = l; nodes[id].right = r
            }
            return id
        }
        func distance(_ x: Double, _ y: Double) -> Double {
            if ordered.isEmpty { return cap }
            var best = cap * cap, stack = [0]
            func lower(_ id: Int) -> Double {
                let n = nodes[id], dx = max(n.minX - x, 0, x - n.maxX), dy = max(n.minY - y, 0, y - n.maxY)
                return dx * dx + dy * dy
            }
            while let id = stack.popLast() {
                if lower(id) >= best { continue }
                let node = nodes[id]
                if node.left != -1 {
                    let left = lower(node.left), right = lower(node.right)
                    if left < right { if right < best { stack.append(node.right) }; if left < best { stack.append(node.left) } }
                    else { if left < best { stack.append(node.left) }; if right < best { stack.append(node.right) } }
                } else {
                    for i in node.start..<node.end {
                        let s = ordered[i], dx = s.2 - s.0, dy = s.3 - s.1, squared = dx * dx + dy * dy
                        let t = squared != 0 ? max(0, min(1, ((x - s.0) * dx + (y - s.1) * dy) / squared)) : 0
                        let ex = x - s.0 - t * dx, ey = y - s.1 - t * dy
                        best = min(best, ex * ex + ey * ey)
                    }
                }
            }
            return best.squareRoot()
        }
    }
    /// 参照纸样式（ORIGINAL_PRESETS[7]，浅海 0x8eafb1、深海 0x527c86）的海面纹理（20K 保持 800×450 逐字节一致，60K/120K 升级 1600×900 高清海面）。
    static func sea(_ segments: [Segment], width: Double, height: Double, seaW: Int = 800, seaH: Int = 450) -> [UInt8] {
        let cap = max(width, height) * 0.02, band = Native.fr(1.2) / 2 / (240.0 / 1600)
        let distance = CoastDistance(segments, cap: cap + band)
        func channels(_ c: Int) -> [Double] { [Double(c >> 16 & 255) / 255, Double(c >> 8 & 255) / 255, Double(c & 255) / 255] }
        let s = channels(0x8eafb1).map(srgbToLinear), dd = channels(0x527c86).map(srgbToLinear)
        var out = [UInt8](repeating: 0, count: seaW * seaH * 4)
        for y in 0..<seaH { for x in 0..<seaW {
            let d = max(0, distance.distance((Double(x) + 0.5) * width / Double(seaW), (Double(y) + 0.5) * height / Double(seaH)) - band)
            let t = segments.isEmpty ? 1 : d / cap, k = min(1, max(0, t)), w = k * k * (3 - 2 * k), o = (y * seaW + x) * 4
            for i in 0..<3 { out[o + i] = UInt8(jsRound(linearToSrgb(s[i] + (dd[i] - s[i]) * w) * 255)) }
            out[o + 3] = 255
        } }
        return out
    }

    // MARK: 河流（original-rivers）

    static let worldPerMap = 240.0 / 1600
    static func roundHalfEven(_ v: Double) -> Double {
        let floor = v.rounded(.down), diff = v - floor
        if diff > 0.5 { return floor + 1 }; if diff < 0.5 { return floor }
        return floor.truncatingRemainder(dividingBy: 2) == 0 ? floor : floor + 1
    }
    static func riverPoints(_ g: TerrainGraph, _ h: [Int], _ cells: [Int], _ mids: [Int64: (Double, Double)]) -> [(Double, Double)] {
        func border(_ cell: Int) -> (Double, Double) {
            let (x, y) = g.points[cell], m = min(y, g.height - y, x, g.width - x)
            if m == y { return (x, 0) }; if m == g.height - y { return (x, g.height) }; if m == x { return (0, y) }
            return (g.width, y)
        }
        let points = cells.enumerated().map { i, cell -> (Double, Double) in
            if cell == -1 { return border(cells[i - 1]) }
            if h[cell] < 20 && i > 0 { let prev = cells[i - 1]; return mids[Int64(min(cell, prev)) << 32 | Int64(max(cell, prev))] ?? g.points[cell] }
            return g.points[cell]
        }
        var out = [(Double, Double)](), step = h[cells[0]] < 20 ? 1 : 10
        let last = cells.count - 1
        var i = 0
        while i <= last {
            defer { i += 1; step += 1 }
            let (x1, y1) = points[i]
            out.append((x1, y1))
            if i == last { break }
            let (x2, y2) = points[i + 1]
            if cells[i + 1] == -1 { out.append((x2, y2)); break }
            let dist2 = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1)
            if dist2 <= 25 && cells.count >= 6 { continue }
            let meander = 0.5 + 1 / Double(step) + max(0.5 - Double(step) / 100, 0), angle = atan2(y2 - y1, x2 - x1)
            let sn = sin(angle) * meander, cs = cos(angle) * meander
            if step < 10 && (dist2 > 64 || (dist2 > 36 && cells.count < 5)) {
                out.append(((x1 * 2 + x2) / 3 - sn, (y1 * 2 + y2) / 3 + cs)); out.append(((x1 + x2 * 2) / 3 + sn / 2, (y1 + y2 * 2) / 3 - cs / 2))
            } else if dist2 > 25 || cells.count < 6 {
                out.append(((x1 + x2) / 2 - sn, (y1 + y2) / 2 + cs))
            }
        }
        return out
    }
    static func riverPath(_ points: [(Double, Double)]) -> [(Double, Double)] {
        if points.count < 2 { return points }
        func distance(_ a: (Double, Double), _ b: (Double, Double)) -> Double { jsHypot(a.0 - b.0, a.1 - b.1) }
        func handle(_ at: Int, _ sign: Double, _ length: Double) -> (Double, Double) {
            let p = points[at]; if at == 0 || at == points.count - 1 { return p }
            let before = points[at - 1], after = points[at + 1], d = distance(before, after)
            return d != 0 ? (p.0 + sign * (after.0 - before.0) / d * length * 0.5, p.1 + sign * (after.1 - before.1) / d * length * 0.5) : p
        }
        var path = [points[0]]
        for i in 0..<(points.count - 1) {
            let a = points[i], b = points[i + 1], length = distance(a, b), c = handle(i, 1, length), d = handle(i + 1, -1, length)
            let count = Int(min(12, max(6, roundHalfEven(jsHypot(b.0 - a.0, b.1 - a.1) * worldPerMap + 6))))
            for k in 1...count {
                let t = Double(k) / Double(count), s = 1 - t
                if k == count { path.append(b); continue }
                func axis(_ av: Double, _ cv: Double, _ dv: Double, _ bv: Double) -> Double { s * s * s * av + 3 * s * s * t * cv + 3 * s * t * t * dv + t * t * t * bv }
                path.append((axis(a.0, c.0, d.0, b.0), axis(a.1, c.1, d.1, b.1)))
            }
        }
        return path
    }
    static func riverRibbon(_ path: [(Double, Double)], _ out: inout [Float]) {
        let n = path.count; if n < 2 { return }
        let baseWidth = Native.fr(0.125) / worldPerMap
        var left = [(Double, Double)](), right = [(Double, Double)]()
        for i in 0..<n {
            let a = path[max(0, i - 1)], b = path[min(n - 1, i + 1)], d = jsHypot(b.0 - a.0, b.1 - a.1)
            let base = f(0.7), thickness = f(f(f(Double(i) * f(base / Double(n))) + base) * 1.5)
            let r = thickness * baseWidth / 2, nx = d != 0 ? -(b.1 - a.1) / d * r : 0, ny = d != 0 ? (b.0 - a.0) / d * r : 0
            left.append((path[i].0 + nx, path[i].1 + ny)); right.append((path[i].0 - nx, path[i].1 - ny))
        }
        for i in 0..<(n - 1) {
            for p in [left[i], right[i], left[i + 1], right[i], right[i + 1], left[i + 1]] { out.append(Float(p.0)); out.append(Float(p.1)) }
        }
    }
    static func rivers(_ x: Inputs, elevations h: [Int], paths: [[Int]]) -> [Float] {
        var mids = [Int64: (Double, Double)]()
        for k in x.edges.a.indices {
            let a = x.edges.a[k], b = x.edges.b[k], s = x.edges.segments[k]
            mids[Int64(min(a, b)) << 32 | Int64(max(a, b))] = ((s.0 + s.2) / 2, (s.1 + s.3) / 2)
        }
        var out = [Float]()
        for cells in paths { riverRibbon(riverPath(riverPoints(x.grid, h, cells, mids)), &out) }
        return out
    }

    // MARK: 国名框（original-labels47 stateLabelBoxes47）

    static func labelBoxes(_ g: TerrainGraph, _ groupOf: (Int) -> String?, hidden: (String, Int) -> Bool) -> [(key: String, x: Double, y: Double, width: Double, height: Double, fontMax: Double, fontMin: Double)] {
        var order = [String](), groups = [String: [Int]]()
        for i in g.points.indices { guard let k = groupOf(i) else { continue }; if groups[k] == nil { order.append(k) }; groups[k, default: []].append(i) }
        let unit = 1600.0 / 240
        var out = [(key: String, x: Double, y: Double, width: Double, height: Double, fontMax: Double, fontMin: Double)]()
        for key in order {
            let cells = groups[key]!
            if hidden(key, cells.count) { continue }
            var cx = 0.0, cy = 0.0; for c in cells { cx += g.points[c].0; cy += g.points[c].1 }; cx /= Double(cells.count); cy /= Double(cells.count)
            var pole = cells[0], best = Double.infinity
            for c in cells { let dx = g.points[c].0 - cx, dy = g.points[c].1 - cy, d = dx * dx + dy * dy; if d < best { best = d; pole = c } }
            var start = pole, end = pole
            while start % g.cellsX > 0 && groupOf(start - 1) == key { start -= 1 }
            while (end + 1) % g.cellsX > 0 && end + 1 < g.points.count && groupOf(end + 1) == key { end += 1 }
            let length = abs(g.points[end].0 - g.points[start].0) / unit, width = length * 0.6, height = max(width / 3, 1.5)
            let scale = (min(2400, max(500, Double(cells.count))) - 500) / 1900
            out.append((key, (g.points[start].0 + g.points[end].0) / 2, (g.points[start].1 + g.points[end].1) / 2, width, height, 25 + 15 * min(1, max(0, scale)), 15))
        }
        return out
    }

    // MARK: 整张地图

    static let oldPalette = ["#537f95", "#b86155", "#659274", "#8a7f9d", "#b3984f", "#7f9451", "#8b9aab", "#ac7294"]
    static let statePalette = ["#80b1d3", "#fb8072", "#b3de69", "#bc80bd", "#ffed6f", "#8dd3c7", "#fdb462", "#eb8de7"]
    /// politics nationColor：只把旧版生成色换成新色，自定义色保留。
    static func nationColor(_ n: JS) -> String {
        let id = n.id.asString, color = n.color.asString
        if id.count == 3, id.hasPrefix("n-"), let i = Int(id.dropFirst(2)), (0...7).contains(i), color == oldPalette[i] { return statePalette[i] }
        return color
    }

    /// buildWorldMap：`{bin, meta}`（bin 为 base64）与格子所属辖区（labelGrid 用）。
    public static func build(_ x: Inputs, run r: JS, elevations h: [Int], seed: String, template: String, historicalRegion: HistoricalRegion? = nil) -> (map: JS, cells: [Int]) {
        let g = x.grid, w = r.world, sc = r.scale.asNumber
        let province = CreationStatics.cellProvinces(x.document, elevations: h, provinces: w.provinces.asArray, scale: sc)
        let (ids, paths) = biomes(x, elevations: h, historicalRegion: historicalRegion)
        let rgb = biomeRGB(g, ids)
        let coastSegments = coast(x, elevations: h)
        let hiRes = h.count > 25_000
        let seaW = hiRes ? 1600 : 800, seaH = hiRes ? 900 : 450
        let seaRGBA = sea(coastSegments, width: g.width, height: g.height, seaW: seaW, seaH: seaH)
        let riverFloats: [Float]
        if let reg = historicalRegion, reg != .custom {
            riverFloats = HistoricalGeography.buildRiverMesh(region: reg, elevations: h, graph: g)
        } else {
            riverFloats = rivers(x, elevations: h, paths: paths)
        }
        // world.bin 版本 2。
        let base = x.base, cells = h.count
        var out = Data(); out.reserveCapacity(hiRes ? 18_000_000 : 6_000_000)
        func u32(_ v: UInt32) { var y = v.littleEndian; withUnsafeBytes(of: &y) { out.append(contentsOf: $0) } }
        func i32(_ v: Int) { u32(UInt32(bitPattern: Int32(v))) }
        func f32(_ v: Float) { u32(v.bitPattern) }
        func pad() { while out.count % 4 != 0 { out.append(0) } }
        u32(0x574a474c); u32(2); f32(Float(g.width)); f32(Float(g.height)); u32(UInt32(cells)); u32(UInt32(base.vertices.count / 2)); u32(UInt32(x.edges.a.count))
        for v in base.offsets { u32(v) }
        for v in base.vertices { f32(v) }
        for c in 0..<cells { var e = Int16(truncatingIfNeeded: h[c]).littleEndian; withUnsafeBytes(of: &e) { out.append(contentsOf: $0) } }
        out.append(contentsOf: ids)
        pad()
        for c in 0..<cells { i32(h[c] >= 20 ? province[c] : -1) }
        out.append(contentsOf: rgb)
        pad()
        for k in x.edges.a.indices { let s = x.edges.segments[k]; i32(x.edges.a[k]); i32(x.edges.b[k]); f32(Float(s.0)); f32(Float(s.1)); f32(Float(s.2)); f32(Float(s.3)) }
        for p in g.points { f32(Float(p.0)); f32(Float(p.1)) }
        u32(UInt32(seaW)); u32(UInt32(seaH)); out.append(contentsOf: seaRGBA)
        u32(UInt32(coastSegments.count)); for s in coastSegments { f32(Float(s.0)); f32(Float(s.1)); f32(Float(s.2)); f32(Float(s.3)) }
        u32(UInt32(riverFloats.count / 2)); for v in riverFloats { f32(v) }

        // 元数据。
        let provinces = w.provinces.asArray, nations = w.nations.asArray, cities = w.cities.asArray
        var nationIndex = [String: Int](); for (i, n) in nations.enumerated() { nationIndex[n.id.asString] = i }
        var provinceIndex = [String: Int](); for (i, p) in provinces.enumerated() { provinceIndex[p.id.asString] = i }
        let owners = provinces.map(\.controller.asString)
        var singles = [String: Int](); for o in owners { singles[o, default: 0] += 1 }
        let boxes = labelBoxes(g, { c in h[c] >= 20 && province[c] >= 0 ? owners[province[c]] : nil }, hidden: { key, count in singles[key] == 1 && count < 30 })
        func object(_ pairs: [(String, JS)]) -> JS { CreationForces.object(pairs) }
        let meta = object([
            ("format", JS("lieguoji-native-world")), ("version", JS(1)), ("seed", JS(seed)), ("template", JS(template)), ("grid", JS("20k")),
            ("provinces", .array(provinces.map { p in object([("id", p.id.clone()), ("name", p.name.clone()), ("x", JS(p.center.x.asNumber / sc)), ("y", JS(p.center.y.asNumber / sc)),
                                                               ("nation", JS(nationIndex[p.controller.asString] ?? -1)), ("terrain", p.terrain.clone())]) })),
            ("nations", .array(nations.map { n in
                let color = nationColor(n), id = n.id.asString, civ = r.civilization.nations[id]
                return object([("id", n.id.clone()), ("name", n.name.clone()), ("color", JS(color)), ("line", JS(NativeEngine.stateLineColor(color))),
                               ("capital", JS(cities.firstIndex { $0.id.asString == n.capitalId.asString } ?? -1)), ("culture", civ.cultureId.clone()), ("polity", civ.polity.clone()),
                               ("religion", civ.religionId.clone())]) })),
            ("labels", .array(boxes.map { b in object([("nation", JS(nationIndex[b.key] ?? -1)), ("x", JS(b.x)), ("y", JS(b.y)), ("width", JS(b.width)), ("height", JS(b.height)),
                                                       ("fontMax", JS(b.fontMax)), ("fontMin", JS(b.fontMin))]) })),
            ("parchment", { let pw = 249.3 / worldPerMap, ph = 137.2 / worldPerMap
                return object([("x", JS(g.width / 2 - pw / 2)), ("y", JS(g.height / 2 - ph / 2)), ("width", JS(pw)), ("height", JS(ph))]) }()),
            ("events", .array(r.chronicle.entries.asArray.prefix(12).map { e in object([("day", e.day.clone()), ("text", e.text.clone()), ("reason", e.reason.clone())]) })),
            ("cities", .array(cities.map { c in object([("id", c.id.clone()), ("name", c.name.clone()), ("x", JS(c.position.x.asNumber / sc)), ("y", JS(c.position.y.asNumber / sc)),
                                                        ("province", JS(provinceIndex[c.provinceId.asString] ?? -1))]) })),
            ("source", .object()),
        ])
        return (object([("bin", JS(out.base64EncodedString())), ("meta", meta)]), province)
    }

    /// nativeWorld 的 labelGrid：格网列数、站点坐标与每格陆地辖区（海为 −1）。
    public static func labelGrid(_ g: TerrainGraph, elevations h: [Int], cells: [Int]) -> JS {
        let o = JS.object()
        o.cellsX = JS(g.cellsX)
        var pts = [JS](); pts.reserveCapacity(g.points.count * 2); for p in g.points { pts.append(JS(p.0)); pts.append(JS(p.1)) }
        o.points = .array(pts)
        o.cells = .array(cells.indices.map { JS(h[$0] >= 20 && cells[$0] >= 0 ? cells[$0] : -1) })
        return o
    }
}
