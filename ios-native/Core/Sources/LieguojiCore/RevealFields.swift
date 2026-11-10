import Foundation

/// 开卷 (the generation reveal): what the reveal shader reads at each vertex, two numbers from 0 to 1.
/// The sea is brushed onto blank paper first and the land left white; the land is then inked in from
/// the shore up to the peaks (the first number), and each state's colour spreads from its capital out
/// to its borders (the second).
extension MapLayers {
    public static func revealFields(_ map: WorldMap) -> [Float] {
        let count = map.vertices.count / 2
        var out = [Float](repeating: 0, count: count * 2)
        // How high a cell stands among all the land (cells of one height share a place), so the ink
        // covers the same area in the same time whatever the terrain.
        var histogram = [Int](repeating: 0, count: 102)
        var land = 0
        for c in 0..<map.cellCount where map.isLand(c) {
            histogram[min(101, max(0, Int(map.elevation[c])))] += 1
            land += 1
        }
        var standing = [Float](repeating: 0, count: 102)
        var below = 0
        for e in 0..<102 {
            if land > 0 { standing[e] = (Float(below) + Float(histogram[e]) / 2) / Float(land) }
            below += histogram[e]
        }
        // Cells meet at shared corners: the mean there makes one smooth field across cell borders, and
        // the sea's zero pulls the shore down so the ink starts at the water's edge.
        func key(_ v: Int) -> UInt64 { UInt64(map.vertices[v * 2].bitPattern) << 32 | UInt64(map.vertices[v * 2 + 1].bitPattern) }
        var sums = [UInt64: SIMD2<Float>](minimumCapacity: count / 2)
        for c in 0..<map.cellCount {
            let value: Float = map.isLand(c) ? standing[min(101, max(0, Int(map.elevation[c])))] : 0
            for v in Int(map.offsets[c])..<Int(map.offsets[c + 1]) {
                let k = key(v)
                sums[k] = (sums[k] ?? SIMD2<Float>(0, 0)) + SIMD2<Float>(value, 1)
            }
        }
        // Each state's capital and how far its land reaches from it.
        var capital = [SIMD2<Float>?]()
        for n in map.meta.nations {
            if map.meta.cities.indices.contains(n.capital) { capital.append(SIMD2<Float>(map.meta.cities[n.capital].x, map.meta.cities[n.capital].y)) }
            else { capital.append(nil) }
        }
        var reach = [Float](repeating: 1, count: capital.count)
        var distance = [Float](repeating: -1, count: count)
        for c in 0..<map.cellCount where map.isLand(c) {
            guard let n = map.nation(ofCell: c), n < capital.count, let at = capital[n] else { continue }
            for v in Int(map.offsets[c])..<Int(map.offsets[c + 1]) {
                let dx: Float = map.vertices[v * 2] - at.x, dy: Float = map.vertices[v * 2 + 1] - at.y
                let d: Float = (dx * dx + dy * dy).squareRoot()
                distance[v] = d
                if d > reach[n] { reach[n] = d }
            }
        }
        for c in 0..<map.cellCount where map.isLand(c) {
            let n = map.nation(ofCell: c)
            for v in Int(map.offsets[c])..<Int(map.offsets[c + 1]) {
                if let q = sums[key(v)], q.y > 0 { out[v * 2] = q.x / q.y }
                if let n, n < reach.count, distance[v] >= 0 { out[v * 2 + 1] = min(1, distance[v] / reach[n]) }
                else { out[v * 2 + 1] = 0.5 }
            }
        }
        return out
    }
}
