import Foundation

/// The graph the height generator runs on: the original 20k grid (grid20k.bin, exported by
/// src/native-export/terrain-golden.test.ts).
public struct TerrainGraph: Sendable {
    public let width: Double, height: Double, cellsX: Int, cellsY: Int
    public let points: [(Double, Double)]
    public let neighbors: [[Int]]
    public init(data: Data) throws {
        var o = 0
        func u32() -> Int { let v = data.withUnsafeBytes { $0.loadUnaligned(fromByteOffset: o, as: UInt32.self) }; o += 4; return Int(UInt32(littleEndian: v)) }
        func f64() -> Double { let v = data.withUnsafeBytes { $0.loadUnaligned(fromByteOffset: o, as: UInt64.self) }; o += 8; return Double(bitPattern: UInt64(littleEndian: v)) }
        guard data.count > 40, u32() == 0x5247474c, u32() == 1 else { throw TravelGraph.LoadError.format }
        width = f64(); height = f64(); cellsX = u32(); cellsY = u32()
        let n = u32()
        var pts = [(Double, Double)](); pts.reserveCapacity(n)
        for _ in 0..<n { pts.append((f64(), f64())) }
        var starts = [Int](); for _ in 0...n { starts.append(u32()) }
        var all = [Int](); all.reserveCapacity(starts[n]); for _ in 0..<starts[n] { all.append(u32()) }
        points = pts
        neighbors = (0..<n).map { Array(all[starts[$0]..<starts[$0 + 1]]) }
    }
}

/// Alea (Mash) PRNG exactly as src/world/recovered-terrain/alea.ts computes it in doubles.
struct Alea {
    var first = 0.0, second = 0.0, third = 0.0, carry = 1.0
    static func uint32(_ x: Double) -> Double { Double(UInt32(truncatingIfNeeded: Int64(x.rounded(.towardZero)))) }
    init(_ seed: String) {
        var mashState = 4022871197.0
        func mash(_ value: String) -> Double {
            for c in value.utf16 {
                mashState += Double(c)
                var fraction = 0.02519603282416938 * mashState
                mashState = Alea.uint32(fraction); fraction -= mashState
                fraction *= mashState; mashState = Alea.uint32(fraction)
                mashState += 4294967296 * (fraction - mashState)
            }
            return 2.3283064365386963e-10 * Alea.uint32(mashState)
        }
        first = mash(" "); second = mash(" "); third = mash(" ")
        first -= mash(seed); if first < 0 { first += 1 }
        second -= mash(seed); if second < 0 { second += 1 }
        third -= mash(seed); if third < 0 { third += 1 }
    }
    mutating func next() -> Double {
        let value = 2091639 * first + 2.3283064365386963e-10 * carry
        first = second; second = third
        carry = Double(Int32(truncatingIfNeeded: Int64(value.rounded(.towardZero))))
        third = value - carry
        return third
    }
}

/// The recovered height generator (src/world/recovered-terrain/engine.ts) with its four templates.
/// Heights live in a Uint8Array in the web, so every store truncates toward zero.
public enum TerrainGenerator {
    public static let recipes: [String: String] = [
        "archipelago": "Add 11 all 0 0\nRange 2-3 40-60 20-80 20-80\nHill 5 15-20 10-90 30-70\nHill 2 10-15 10-30 20-80\nHill 2 10-15 60-90 20-80\nSmooth 3 0 0 0\nTrough 10 20-30 5-95 5-95\nStrait 2 vertical 0 0\nStrait 2 horizontal 0 0",
        "continents": "Hill 1 80-85 60-80 40-60\nHill 1 80-85 20-30 40-60\nHill 6-7 15-30 25-75 15-85\nMultiply 0.6 land 0 0\nHill 8-10 5-10 15-85 20-80\nRange 1-2 30-60 5-15 25-75\nRange 1-2 30-60 80-95 25-75\nRange 0-3 30-60 80-90 20-80\nStrait 2 vertical 0 0\nStrait 1 vertical 0 0\nSmooth 3 0 0 0\nTrough 3-4 15-20 15-85 20-80\nTrough 3-4 5-10 45-55 45-55\nPit 3-4 10-20 15-85 20-80\nMask 4 0 0 0",
        "highIsland": "Hill 1 90-100 65-75 47-53\nAdd 7 all 0 0\nHill 5-6 20-30 25-55 45-55\nRange 1 40-50 45-55 45-55\nMultiply 0.8 land 0 0\nMask 3 0 0 0\nSmooth 2 0 0 0\nTrough 2-3 20-30 20-30 20-30\nTrough 2-3 20-30 60-80 70-80\nHill 1 10-15 60-60 50-50\nHill 1.5 13-16 15-20 20-75\nRange 1.5 30-40 15-85 30-40\nRange 1.5 30-40 15-85 60-70\nPit 3-5 10-30 15-85 20-80",
        "pangea": "Hill 1-2 25-40 15-50 0-10\nHill 1-2 5-40 50-85 0-10\nHill 1-2 25-40 50-85 90-100\nHill 1-2 5-40 15-50 90-100\nHill 8-12 20-40 20-80 48-52\nSmooth 2 0 0 0\nMultiply 0.7 land 0 0\nTrough 3-4 25-35 5-95 10-20\nTrough 3-4 25-35 5-95 80-90\nRange 5-6 30-40 10-90 35-65",
    ]

    static func u8(_ x: Double) -> UInt8 { x.isFinite ? UInt8(truncatingIfNeeded: Int64(x.rounded(.towardZero))) : 0 }
    static func jsNumber(_ s: Substring) -> Double { s.isEmpty ? 0 : Double(s) ?? .nan }

    public static func generate(graph g: TerrainGraph, seed: String, template: String) -> [UInt8] {
        let n = g.points.count, points = g.points, neighbors = g.neighbors
        let W = g.width, H = g.height, center = (W / 2, H / 2)
        var alea = Alea(seed)
        var heights = [UInt8](repeating: 0, count: n)
        func random() -> Double { alea.next() }
        func lim(_ v: Double) -> Double { min(max(v, 0), 100) }
        func probability(_ v: Double) -> Bool { v >= 1 ? true : v <= 0 ? false : random() < v }
        func rand(_ lo: Double, _ hi: Double) -> Double { (random() * (hi - lo + 1)).rounded(.down) + lo }
        func numberInRange(_ text: Substring) -> Double {
            let value = jsNumber(text)
            if !value.isNaN { let whole = value.rounded(.towardZero); return whole + (probability(value - whole) ? 1 : 0) }
            let parts = text.split(separator: "-", omittingEmptySubsequences: false)
            return rand(jsNumber(parts[0]), jsNumber(parts[1]))
        }
        func pointInRange(_ range: Substring, _ length: Double, _ c: Double) -> Double {
            let parts = range.split(separator: "-", omittingEmptySubsequences: false)
            let a = jsNumber(parts[0]) / 100, lo = a.isNaN || a == 0 ? 0 : a
            let b = parts.count > 1 ? jsNumber(parts[1]) / 100 : .nan, hi = b.isNaN || b == 0 ? lo : b
            return c + (length / 2 - rand(lo * length, hi * length))
        }
        func nearest(_ x: Double, _ y: Double) -> Int {
            var best = 0, distance = Double.infinity
            for id in 0..<n { let dx = points[id].0 - x, dy = points[id].1 - y, d = dx * dx + dy * dy; if d < distance { best = id; distance = d } }
            return best
        }
        let blobPower = 0.99, linePower = 0.79

        func hill(_ countText: Substring, _ heightText: Substring, _ rx: Substring, _ ry: Substring) {
            var count = numberInRange(countText)
            while count > 0 {
                var change = [UInt8](repeating: 0, count: n), attempts = 0, start = 0
                let height = lim(numberInRange(heightText))
                repeat {
                    let x = pointInRange(rx, W, center.0), y = pointInRange(ry, H, center.1)
                    start = nearest(x, y); attempts += 1
                } while Double(heights[start]) + height > 90 && attempts < 50
                change[start] = u8(height)
                var queue = [start], head = 0
                while head < queue.count {
                    let cur = queue[head]; head += 1
                    for next in neighbors[cur] {
                        if change[next] != 0 { continue }
                        change[next] = u8(pow(Double(change[cur]), blobPower) * (random() * 0.2 + 0.9))
                        if change[next] > 1 { queue.append(next) }
                    }
                }
                for id in 0..<n { heights[id] = u8(lim(Double(heights[id]) + Double(change[id]))) }
                count -= 1
            }
        }
        func pit(_ countText: Substring, _ heightText: Substring, _ rx: Substring, _ ry: Substring) {
            var count = numberInRange(countText)
            while count > 0 {
                var used = [Bool](repeating: false, count: n), attempts = 0, start = 0
                var height = lim(numberInRange(heightText))
                repeat {
                    let x = pointInRange(rx, W, center.0), y = pointInRange(ry, H, center.1)
                    start = nearest(x, y); attempts += 1
                } while heights[start] < 20 && attempts < 50
                var queue = [start], head = 0
                while head < queue.count {
                    let cur = queue[head]; head += 1
                    height = pow(height, blobPower) * (random() * 0.2 + 0.9)
                    if height < 1 { break }
                    for next in neighbors[cur] {
                        if used[next] { continue }
                        heights[next] = u8(lim(Double(heights[next]) - height * (random() * 0.2 + 0.9))); used[next] = true; queue.append(next)
                    }
                }
                count -= 1
            }
        }
        func ridge(_ countText: Substring, _ heightText: Substring, _ rx: Substring, _ ry: Substring, trough: Bool) {
            var count = numberInRange(countText)
            while count > 0 {
                var used = [Bool](repeating: false, count: n)
                var height = lim(numberInRange(heightText))
                var startX = 0.0, startY = 0.0, start = 0, attempts = 0
                repeat {
                    startX = pointInRange(rx, W, center.0); startY = pointInRange(ry, H, center.1)
                    if trough { start = nearest(startX, startY) }
                    attempts += 1
                } while trough && heights[start] < 20 && attempts < 50
                var endX = 0.0, endY = 0.0, distance = 0.0; attempts = 0
                repeat {
                    let ox = random() * W * 0.8 + W * 0.1, oy = random() * H * 0.7 + H * 0.15
                    endX = center.0 + (ox - W / 2); endY = center.1 + (oy - H / 2)
                    distance = abs(endY - startY) + abs(endX - startX); attempts += 1
                } while (distance < W / 8 || distance > W / (trough ? 2 : 3)) && attempts < 50
                if !trough { start = nearest(startX, startY) }
                let end = nearest(endX, endY)
                var range = [start]; used[start] = true
                var current = start
                while current != end {
                    var minimum = Double.infinity
                    for next in neighbors[current] {
                        if used[next] { continue }
                        let dx = points[end].0 - points[next].0, dy = points[end].1 - points[next].1
                        var difference = dx * dx + dy * dy
                        if random() > (trough ? 0.8 : 0.85) { difference /= 2 }
                        if difference < minimum { minimum = difference; current = next }
                    }
                    if minimum == .infinity { break }
                    range.append(current); used[current] = true
                }
                var queue = range, layers = 0
                while !queue.isEmpty {
                    let frontier = queue; queue = []; layers += 1
                    for id in frontier {
                        heights[id] = trough ? u8(lim(Double(heights[id]) - height * (random() * 0.3 + 0.85))) : u8(lim(Double(heights[id]) + height * (random() * 0.3 + 0.85)))
                    }
                    height = pow(height, linePower) - 1
                    if height < 2 { break }
                    for id in frontier { for next in neighbors[id] where !used[next] { queue.append(next); used[next] = true } }
                }
                for (offset, startId) in range.enumerated() where offset % 6 == 0 {
                    var id = startId
                    for _ in 0..<layers {
                        let adjacent = neighbors[id]
                        var selected = 0
                        for k in 1..<max(1, adjacent.count) where Int(heights[adjacent[k]]) - Int(heights[adjacent[selected]]) < 0 { selected = k }
                        let next = adjacent[selected]
                        heights[next] = u8((Double(heights[id]) * 2 + Double(heights[next])) / 3); id = next
                    }
                }
                count -= 1
            }
        }
        func strait(_ widthText: Substring, _ direction: Substring) {
            var width = min(numberInRange(widthText), Double(g.cellsX) / 3)
            if width < 1 && probability(width) { return }
            var used = [Bool](repeating: false, count: n)
            let vertical = direction == "vertical"
            let startX = vertical ? (random() * W * 0.4 + W * 0.3).rounded(.down) : 5
            let startY = vertical ? 5 : (random() * H * 0.4 + H * 0.3).rounded(.down)
            let endX = vertical ? (W - startX - W * 0.1 + random() * W * 0.2).rounded(.down) : W - 5
            let endY = vertical ? H - 5 : (H - startY - H * 0.1 + random() * H * 0.2).rounded(.down)
            let end = nearest(endX, endY)
            var current = nearest(startX, startY)
            var range = [Int](), query = [Int]()
            var steps = 0
            while current != end {
                steps += 1; if steps > n * 8 { return }
                var minimum = Double.infinity
                for next in neighbors[current] {
                    let dx = points[end].0 - points[next].0, dy = points[end].1 - points[next].1
                    var difference = dx * dx + dy * dy
                    if random() > 0.8 { difference /= 2 }
                    if difference < minimum { minimum = difference; current = next }
                }
                range.append(current)
            }
            let step = 0.1 / width
            while width > 0 {
                let exponent = 0.9 - step * width
                for id in range { for next in neighbors[id] {
                    if used[next] { continue }
                    used[next] = true; query.append(next)
                    heights[next] = u8(pow(Double(heights[next]), exponent))
                    if heights[next] > 100 { heights[next] = 5 }
                } }
                range = query; width -= 1
            }
        }
        func modify(_ range: Substring, _ add: Double, _ multiply: Double) {
            let lo: Double = range == "land" ? 20 : range == "all" ? 0 : jsNumber(range.split(separator: "-")[0])
            let hi: Double = range == "land" || range == "all" ? 100 : jsNumber(range.split(separator: "-")[1])
            let land = lo == 20
            for id in 0..<n {
                var h = Double(heights[id])
                if h < lo || h > hi { continue }
                if add != 0 { h = land ? max(h + add, 20) : h + add }
                if multiply != 1 { h = land ? (h - 20) * multiply + 20 : h * multiply }
                heights[id] = u8(lim(h))
            }
        }
        func smooth(_ factor: Double) {
            let old = heights
            for id in 0..<n {
                var sum = Double(old[id]); for o in neighbors[id] { sum += Double(old[o]) }
                let mean = sum / Double(neighbors[id].count + 1)
                heights[id] = factor == 1 ? u8(mean) : u8(lim((Double(old[id]) * (factor - 1) + mean) / factor))
            }
        }
        func mask(_ power: Double) {
            let fraction = power != 0 ? abs(power) : 1
            for id in 0..<n {
                let x = 2 * points[id].0 / W - 1, y = 2 * points[id].1 / H - 1
                var distance = (1 - x * x) * (1 - y * y); if power < 0 { distance = 1 - distance }
                let h = Double(heights[id])
                heights[id] = u8(lim((h * (fraction - 1) + h * distance) / fraction))
            }
        }
        for line in (recipes[template] ?? "").split(separator: "\n") {
            let p = line.split(separator: " ")
            switch p[0] {
            case "Hill": hill(p[1], p[2], p[3], p[4])
            case "Pit": pit(p[1], p[2], p[3], p[4])
            case "Range": ridge(p[1], p[2], p[3], p[4], trough: false)
            case "Trough": ridge(p[1], p[2], p[3], p[4], trough: true)
            case "Strait": strait(p[1], p[2])
            case "Add": modify(p[2], jsNumber(p[1]), 1)
            case "Multiply": modify(p[2], 0, jsNumber(p[1]))
            case "Smooth": smooth(jsNumber(p[1]))
            case "Mask": mask(jsNumber(p[1]))
            default: break
            }
        }
        return heights
    }
}
