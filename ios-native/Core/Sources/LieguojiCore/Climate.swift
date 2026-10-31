import Foundation

/// The drawing document of the original 20k grid (doc20k.bin): points, triangles and neighbours.
public struct TerrainDocument: Sendable {
    public let width: Double, height: Double
    public let points: [(Double, Double)]
    public let triangles: [Int]
    public let neighbors: [[Int]]
    public init(data: Data) throws {
        var o = 0
        func u32() -> Int { let v = data.withUnsafeBytes { $0.loadUnaligned(fromByteOffset: o, as: UInt32.self) }; o += 4; return Int(UInt32(littleEndian: v)) }
        func f64() -> Double { let v = data.withUnsafeBytes { $0.loadUnaligned(fromByteOffset: o, as: UInt64.self) }; o += 8; return Double(bitPattern: UInt64(littleEndian: v)) }
        guard data.count > 32, u32() == 0x4344474c, u32() == 1 else { throw TravelGraph.LoadError.format }
        width = f64(); height = f64()
        let n = u32(); var pts = [(Double, Double)](); pts.reserveCapacity(n); for _ in 0..<n { pts.append((f64(), f64())) }
        let t = u32(); var tri = [Int](); tri.reserveCapacity(t); for _ in 0..<t { tri.append(u32()) }
        var starts = [Int](); for _ in 0...n { starts.append(u32()) }
        var all = [Int](); all.reserveCapacity(starts[n]); for _ in 0..<starts[n] { all.append(u32()) }
        points = pts; triangles = tri; neighbors = (0..<n).map { Array(all[starts[$0]..<starts[$0 + 1]]) }
    }
}

/// Recovered climate (terrain13-climate climate.ts), drainage rivers (settlement25-rivers.ts) and
/// biomes (settlement25-biomes.ts). Typed-array stores truncate like the web's Int8/Uint8/Uint16 arrays.
public enum Climate {
    static let north = 0.9, south = -0.9, precipitationInput = 80.0
    static let biomeMatrix: [[Int]] = [
        [1,1,1,1,1,1,1,1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,10],
        [3,3,3,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,4,9,9,9,9,10,10,10],
        [5,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,6,9,9,9,9,9,10,10,10],
        [5,6,6,6,6,6,6,8,8,8,8,8,8,8,8,8,8,9,9,9,9,9,9,10,10,10],
        [7,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,8,9,9,9,9,9,9,9,10,10],
    ]
    static func clamp(_ v: Double, _ a: Double, _ b: Double) -> Double { min(max(v, a), b) }
    static func u8(_ x: Double) -> UInt8 { UInt8(truncatingIfNeeded: Int64(x.rounded(.towardZero))) }
    static func u16(_ x: Double) -> UInt16 { UInt16(truncatingIfNeeded: Int64(x.rounded(.towardZero))) }
    /// JavaScript Math.round: halves round toward +infinity.
    static func jsRound(_ x: Double) -> Double { (x + 0.5).rounded(.down) }

    public static func temperature(height: Double, latitude: Double, offset: Double = 0) -> Int {
        let equator = 27 + offset, northPole = -20 + offset, southPole = -20 + offset
        let northTropic = equator - 16 * 0.15, southTropic = equator - 20 * 0.15
        let sea = latitude <= 16 && latitude >= -20 ? equator - abs(latitude) * 0.15
            : latitude > 0 ? northTropic - (latitude - 16) * (northTropic - northPole) / 74
            : southTropic + (latitude + 20) * (southTropic - southPole) / 70
        let drop = height < 20 ? 0 : jsRound((height - 18) * (height - 18) / 1000 * 6.5)
        return Int(clamp(sea - drop, -128, 127).rounded(.towardZero))
    }
    public static func biome(moisture: Double, temperature: Int, height: Double, hasRiver: Bool) -> Int {
        if height < 20 { return 0 }
        if temperature < -5 { return 11 }
        if temperature >= 25 && !hasRiver && moisture < 8 { return 1 }
        return biomeMatrix[min(Int((moisture / 5).rounded(.down)), 4)][Int(clamp(Double(20 - temperature), 0, 25))]
    }

    /// sampleFmsClimateHeights: the document's triangles rasterized onto the climate grid.
    static func sampleHeights(_ d: TerrainDocument, _ elevations: [Int], _ columns: Int, _ rows: Int) -> [UInt8] {
        var heights = [UInt8](repeating: 0, count: columns * rows), covered = [Bool](repeating: false, count: columns * rows)
        let pts = d.points.map { (Native.fr($0.0), Native.fr($0.1)) }, stepX = d.width / Double(columns), stepY = d.height / Double(rows)
        func cross(_ ax: Double, _ ay: Double, _ bx: Double, _ by: Double) -> Double { ax * by - ay * bx }
        var t = 0
        while t < d.triangles.count {
            let ia = d.triangles[t], ib = d.triangles[t + 1], ic = d.triangles[t + 2]; t += 3
            let a = pts[ia], b = pts[ib], c = pts[ic]
            let area = cross(b.0 - a.0, b.1 - a.1, c.0 - a.0, c.1 - a.1); if area == 0 { continue }
            let x0 = max(0, Int((min(a.0, b.0, c.0) / stepX - 0.5).rounded(.up))), x1 = min(columns - 1, Int((max(a.0, b.0, c.0) / stepX - 0.5).rounded(.down)))
            let y0 = max(0, Int((min(a.1, b.1, c.1) / stepY - 0.5).rounded(.up))), y1 = min(rows - 1, Int((max(a.1, b.1, c.1) / stepY - 0.5).rounded(.down)))
            if y0 > y1 || x0 > x1 { continue }
            for y in y0...y1 { for x in x0...x1 {
                let id = y * columns + x; if covered[id] { continue }
                let px = (Double(x) + 0.5) * stepX, py = (Double(y) + 0.5) * stepY
                let u = cross(b.0 - px, b.1 - py, c.0 - px, c.1 - py) / area, v = cross(c.0 - px, c.1 - py, a.0 - px, a.1 - py) / area, w = 1 - u - v
                if u < -1e-8 || v < -1e-8 || w < -1e-8 { continue }
                heights[id] = u8(min(100, max(0, u * Double(elevations[ia]) + v * Double(elevations[ib]) + w * Double(elevations[ic])))); covered[id] = true
            } }
        }
        return heights
    }

    /// generateFmsClimateGrid with the default options (north 0.9, south −0.9, precipitation 80, seed 1337).
    static func grid(_ heights: [UInt8], _ columns: Int, _ rows: Int) -> (temperature: [Int8], precipitation: [UInt8]) {
        var temps = [Int8](repeating: 0, count: heights.count), precipitation = [UInt8](repeating: 0, count: heights.count)
        let span = north - south
        for y in 0..<rows {
            let latitude = north - (Double(y) + 0.5) / Double(rows) * span
            for x in 0..<columns { let id = y * columns + x; temps[id] = Int8(Climate.temperature(height: Double(heights[id]), latitude: latitude)) }
        }
        var random = Alea("1337")
        let modifier = pow(4, 0.25) * precipitationInput / 100
        let latitudeModifiers: [Double] = [4, 2, 2, 2, 1, 1, 2, 2, 2, 2, 3, 3, 2, 2, 1, 1, 1, 0.5]
        let winds: [Double] = [225, 45, 225, 315, 135, 315]
        var west = [(Int, Double)](), east = [(Int, Double)](), northCount = 0, southCount = 0
        func latModifier(_ latitude: Double) -> Double { latitudeModifiers[Int(clamp(((abs(latitude) - 1) / 5).rounded(.towardZero), 0, 17))] }
        for y in 0..<rows {
            let latitude = north - Double(y) / Double(rows) * span, angle = winds[Int(clamp((abs(latitude - 89) / 30).rounded(.towardZero), 0, 5))]
            if angle > 40 && angle < 140 { west.append((y * columns, latModifier(latitude))) }
            if angle > 220 && angle < 320 { east.append((y * columns + columns - 1, latModifier(latitude))) }
            if angle > 100 && angle < 260 { northCount += 1 }
            if angle > 280 || angle < 80 { southCount += 1 }
        }
        func pass(_ first: Int, _ maximum: Double, _ next: Int, _ steps: Int) {
            var humidity = maximum - Double(heights[first]); if humidity <= 0 { return }
            var id = first
            for s in 0..<steps {
                defer { id += next }
                if temps[id] < -5 { continue }
                let downstream = s + 1 < steps ? id + next : -1
                if heights[id] < 20 {
                    if downstream >= 0 && heights[downstream] >= 20 {
                        precipitation[downstream] = u8(Double(precipitation[downstream]) + max(humidity / (10 + (random.next() * 11).rounded(.down)), 1))
                    } else {
                        humidity = min(humidity + 5 * modifier, maximum); precipitation[id] = u8(Double(precipitation[id]) + 5 * modifier)
                    }
                    continue
                }
                if downstream < 0 { break }
                let passable = heights[downstream] <= 85
                let ratio = Double(heights[downstream]) / 70
                let loss = passable ? clamp(max(humidity / (10 * modifier), 1) + max(Double(heights[downstream]) - Double(heights[id]), 0) * (ratio * ratio), 1, humidity) : humidity
                precipitation[id] = u8(Double(precipitation[id]) + loss)
                humidity = passable ? clamp(humidity - loss + (loss > 1.5 ? 1 : 0), 0, maximum) : 0
            }
        }
        for (id, lat) in west { pass(id, min(120 * modifier * lat, 255), 1, columns) }
        for (id, lat) in east { pass(id, min(120 * modifier * lat, 255), -1, columns) }
        let total = Double(northCount + southCount), mean = latitudeModifiers.reduce(0, +) / Double(latitudeModifiers.count)
        if northCount > 0 { let m = Double(northCount) / total * 60 * modifier * (span > 60 ? mean : latModifier(north)); for x in 0..<columns { pass(x, m, columns, rows) } }
        if southCount > 0 { let m = Double(southCount) / total * 60 * modifier * (span > 60 ? mean : latModifier(south)); for x in 0..<columns { pass((rows - 1) * columns + x, m, -columns, rows) } }
        return (temps, precipitation)
    }

    public struct Rivers: Sendable { public let flux: [UInt16]; public let riverIds: [UInt16]; public let segments: [(Int, Int)]; public let riverCount: Int }

    /// settlementRiverData: coast distance, FIFO fill, then the flux walk from high to low.
    static func rivers(_ d: TerrainDocument, _ elevations: [Int], _ precipitation: [UInt8]) -> Rivers {
        let count = d.points.count
        let height = elevations.map { UInt8(min(100, max(0, $0))) }
        var coast = [Int16](repeating: 0, count: count), haven = [Int](repeating: -1, count: count), queue = [Int]()
        for i in 0..<count {
            if height[i] >= 20 {
                var nearest = Double.infinity
                for j in d.neighbors[i] where height[j] < 20 {
                    coast[i] = 1
                    let dx = d.points[i].0 - d.points[j].0, dy = d.points[i].1 - d.points[j].1, dd = dx * dx + dy * dy
                    if dd < nearest { nearest = dd; haven[i] = j }
                }
                if coast[i] != 0 { queue.append(i) }
            } else { coast[i] = -1 }
        }
        var head = 0
        while head < queue.count { let i = queue[head]; head += 1; for j in d.neighbors[i] where coast[j] == 0 && height[j] >= 20 { coast[j] = Int16(min(127, Int(coast[i]) + 1)); queue.append(j) } }
        var edgeCount = [Int64: Int](), border = [Bool](repeating: false, count: count)
        var t = 0
        while t < d.triangles.count {
            for k in 0..<3 { let a = min(d.triangles[t + k], d.triangles[t + (k + 1) % 3]), b = max(d.triangles[t + k], d.triangles[t + (k + 1) % 3]); edgeCount[Int64(a) << 32 | Int64(b), default: 0] += 1 }
            t += 3
        }
        for (key, c) in edgeCount where c == 1 { border[Int(key >> 32)] = true; border[Int(key & 0xffffffff)] = true }
        var altered = [Double](repeating: 0, count: count)
        for i in 0..<count {
            let h = Double(height[i])
            if height[i] < 20 || coast[i] < 1 { altered[i] = h; continue }
            var s = 0.0; for j in d.neighbors[i] { s += Double(coast[j]) }
            altered[i] = h + Double(coast[i]) / 100 + s / Double(d.neighbors[i].count) / 10000
        }
        var routing = [Float](repeating: 100000, count: count), visited = [Bool](repeating: false, count: count)
        queue.removeAll()
        for i in 0..<count {
            if height[i] < 20 { routing[i] = Float(altered[i]); visited[i] = true }
            else if haven[i] >= 0 { routing[i] = Float(altered[i]); visited[i] = true; queue.append(i) }
        }
        head = 0
        while head < queue.count {
            let i = queue[head]; head += 1
            for j in d.neighbors[i] where height[j] >= 20 && !visited[j] { routing[j] = Float(max(Double(routing[i]) + 1e-5, altered[j])); visited[j] = true; queue.append(j) }
        }
        var flux = [UInt16](repeating: 0, count: count), active = [UInt16](repeating: 0, count: count), confluence = [UInt8](repeating: 0, count: count)
        var paths: [[Int]] = [[]]
        func addFlux(_ i: Int, _ value: Double) { flux[i] = u16(Double(flux[i]) + value) }
        let land = (0..<count).filter { height[$0] >= 20 }.enumerated().sorted { x, y in
            let a = routing[x.element], b = routing[y.element]; return a != b ? a > b : x.offset < y.offset
        }.map(\.element)
        let quarter = pow(4, 0.25)
        for i in land {
            addFlux(i, Double(precipitation[i]) / quarter)
            if border[i] && active[i] != 0 { paths[Int(active[i])].append(-1); continue }
            var to = haven[i]
            if to < 0 { to = d.neighbors[i][0]; for j in d.neighbors[i] where routing[j] < routing[to] { to = j } }
            if routing[i] <= routing[to] { continue }
            if flux[i] < 30 { if height[to] >= 20 { addFlux(to, Double(flux[i])) }; continue }
            if active[i] == 0 { active[i] = UInt16(truncatingIfNeeded: paths.count); paths.append([i]) }
            let river = active[i], toFlux = Int(flux[to]) - Int(confluence[to])
            if active[to] != 0 {
                if Int(flux[i]) > toFlux { confluence[to] = u8(Double(confluence[to]) + Double(flux[to])); active[to] = river }
                else { confluence[to] = u8(Double(confluence[to]) + Double(flux[i])) }
            } else { active[to] = river }
            if height[to] >= 20 { addFlux(to, Double(flux[i])) }
            paths[Int(river)].append(to)
        }
        var riverIds = [UInt16](repeating: 0, count: count), segments = [(Int, Int)](), seen = Set<Int64>(), riverCount = 0
        for id in 1..<paths.count {
            let path = paths[id]; if path.count < 3 { continue }
            riverCount += 1
            for cell in path where cell >= 0 && height[cell] >= 20 && riverIds[cell] == 0 { riverIds[cell] = UInt16(truncatingIfNeeded: id) }
            for n in 1..<path.count {
                let a = path[n - 1], b = path[n]
                if a < 0 || b < 0 || height[a] < 20 { continue }
                if seen.insert(Int64(a) << 32 | Int64(b)).inserted { segments.append((a, b)) }
            }
        }
        return Rivers(flux: flux, riverIds: riverIds, segments: segments, riverCount: riverCount)
    }

    public struct Surface: Sendable { public let ids: [UInt8]; public let precipitation: [UInt8]; public let temperatures: [Int8]; public let rivers: Rivers }

    /// settlementBiomeData.
    public static func surface(_ d: TerrainDocument, elevations: [Int]) -> Surface {
        let longest = max(d.width, d.height)
        let columns = max(2, Int(jsRound(d.width / longest * 192))), rows = max(2, Int(jsRound(d.height / longest * 192)))
        let heights = sampleHeights(d, elevations, columns, rows), climate = grid(heights, columns, rows)
        let precipitation = d.points.map { p in climate.precipitation[min(rows - 1, Int((p.1 / d.height * Double(rows)).rounded(.down))) * columns + min(columns - 1, Int((p.0 / d.width * Double(columns)).rounded(.down)))] }
        let temperatures = elevations.indices.map { i in Int8(Climate.temperature(height: Double(min(100, max(0, elevations[i]))), latitude: north - d.points[i].1 / d.height * (north - south))) }
        let r = rivers(d, elevations, precipitation)
        let ids = elevations.indices.map { i -> UInt8 in
            var sum = Double(precipitation[i]) + (r.riverIds[i] != 0 ? max(Double(r.flux[i]) / 10, 2) : 0), n = 1.0
            for j in d.neighbors[i] where elevations[j] >= 20 { sum += Double(precipitation[j]); n += 1 }
            let moisture = jsRound(4 + sum / n)
            return UInt8(biome(moisture: moisture, temperature: Int(temperatures[i]), height: Double(elevations[i]), hasRiver: r.riverIds[i] != 0))
        }
        return Surface(ids: ids, precipitation: precipitation, temperatures: temperatures, rivers: r)
    }
}
