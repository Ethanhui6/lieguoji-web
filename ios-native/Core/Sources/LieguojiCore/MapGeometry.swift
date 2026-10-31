import Foundation

/// GPU-ready arrays built once per world (and per colour change): the renderer only uploads them.
public struct CellMesh: Sendable {
    /// x, y per vertex (the world vertices, unchanged order).
    public let positions: [Float]
    /// Triangle fan indices of every land cell (Voronoi cells are convex).
    public let indices: [UInt32]

    public init(map: WorldMap) {
        positions = map.vertices
        var list: [UInt32] = []
        list.reserveCapacity((map.vertices.count / 2) * 3)
        // Only land: the sea is the coastal-distance texture drawn underneath.
        for c in 0..<map.cellCount where map.isLand(c) {
            let start = map.offsets[c], end = map.offsets[c + 1]
            guard end >= start + 3 else { continue }
            for j in (start + 1)..<(end - 1) { list.append(start); list.append(j); list.append(j + 1) }
        }
        indices = list
    }

    /// r, g, b, a per vertex: every vertex of a cell carries the cell colour.
    public static func colors(map: WorldMap, mode: MapMode, nationColors: [RGB], highlightProvince: Int? = nil) -> [Float] {
        var out = [Float](repeating: 1, count: map.vertices.count * 2)
        for c in 0..<map.cellCount {
            var color = MapPalette.cellColor(map: map, cell: c, mode: mode, nationColors: nationColors)
            if let h = highlightProvince, Int(map.province[c]) == h {
                color = RGB(color.r + (1 - color.r) * 0.35, color.g + (1 - color.g) * 0.35, color.b + (1 - color.b) * 0.35)
            }
            for v in Int(map.offsets[c])..<Int(map.offsets[c + 1]) {
                out[v * 4] = color.r; out[v * 4 + 1] = color.g; out[v * 4 + 2] = color.b; out[v * 4 + 3] = 1
            }
        }
        return out
    }
}

/// Borders drawn along the shared Voronoi edges — the same edges the cells are filled with, so lines
/// never drift from the colour boundaries. Each segment is a quad of six vertices: x, y, nx, ny,
/// where (nx, ny) is the unit normal times ±1; the vertex shader widens it by a constant screen width.
public struct BorderMesh: Sendable {
    public enum Kind: Int, CaseIterable, Sendable { case province, nation, coast }
    public let vertices: [Kind: [Float]]

    public static func kind(map: WorldMap, edge: WorldMap.Edge) -> Kind? {
        let a = Int(edge.a), b = Int(edge.b)
        let landA = a >= 0 && map.isLand(a), landB = b >= 0 && map.isLand(b)
        if landA != landB { return .coast }
        guard landA && landB else { return nil }
        if map.nation(ofCell: a) != map.nation(ofCell: b) { return .nation }
        if map.province[a] != map.province[b] { return .province }
        return nil
    }

    public init(map: WorldMap) {
        var out: [Kind: [Float]] = [:]
        for k in Kind.allCases { out[k] = [] }
        for e in map.edges {
            guard let k = BorderMesh.kind(map: map, edge: e) else { continue }
            let dx = e.x2 - e.x1, dy = e.y2 - e.y1, length = (dx * dx + dy * dy).squareRoot()
            guard length > 0 else { continue }
            let nx = -dy / length, ny = dx / length
            // Two triangles: (p1,+) (p1,−) (p2,+) and (p2,+) (p1,−) (p2,−).
            let quad: [Float] = [e.x1, e.y1, nx, ny, e.x1, e.y1, -nx, -ny, e.x2, e.y2, nx, ny,
                                 e.x2, e.y2, nx, ny, e.x1, e.y1, -nx, -ny, e.x2, e.y2, -nx, -ny]
            out[k]!.append(contentsOf: quad)
        }
        vertices = out
    }
}

/// Finds the cell under a map point with a bucket grid and an exact point-in-polygon test.
public struct CellPicker: Sendable {
    private let map: WorldMap
    private let size: Float = 16
    private let columns: Int
    private let rows: Int
    private let buckets: [[Int32]]

    public init(map: WorldMap) {
        self.map = map
        columns = Int((map.width / size).rounded(.up)) + 1
        rows = Int((map.height / size).rounded(.up)) + 1
        var b = [[Int32]](repeating: [], count: columns * rows)
        for c in 0..<map.cellCount {
            var minX = Float.greatestFiniteMagnitude, minY = minX, maxX = -minX, maxY = -minX
            for v in Int(map.offsets[c])..<Int(map.offsets[c + 1]) {
                let x = map.vertices[v * 2], y = map.vertices[v * 2 + 1]
                minX = min(minX, x); maxX = max(maxX, x); minY = min(minY, y); maxY = max(maxY, y)
            }
            guard minX <= maxX else { continue }
            for gy in Int(minY / size)...Int(maxY / size) {
                for gx in Int(minX / size)...Int(maxX / size) where gx >= 0 && gy >= 0 && gx < columns && gy < rows {
                    b[gy * columns + gx].append(Int32(c))
                }
            }
        }
        buckets = b
    }

    public func cell(atX x: Float, y: Float) -> Int? {
        guard x >= 0, y >= 0, x <= map.width, y <= map.height else { return nil }
        let gx = min(columns - 1, Int(x / size)), gy = min(rows - 1, Int(y / size))
        for c in buckets[gy * columns + gx] where contains(cell: Int(c), x: x, y: y) { return Int(c) }
        return nil
    }

    private func contains(cell: Int, x: Float, y: Float) -> Bool {
        let start = Int(map.offsets[cell]), end = Int(map.offsets[cell + 1])
        var inside = false
        var j = end - 1
        for i in start..<end {
            let xi = map.vertices[i * 2], yi = map.vertices[i * 2 + 1], xj = map.vertices[j * 2], yj = map.vertices[j * 2 + 1]
            if (yi > y) != (yj > y), x < (xj - xi) * (y - yi) / (yj - yi) + xi { inside.toggle() }
            j = i
        }
        return inside
    }
}
