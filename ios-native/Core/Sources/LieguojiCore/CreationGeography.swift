import Foundation

/// ECMAScript Number::toString(10)：最短往返数字，按 JS 规则选择定点或指数写法（1e21 起、1e-7 以下用指数）。
/// Swift 的 description 给出同样的最短数字，这里只换写法。
func jsNumberText(_ v: Double) -> String {
    if v.isNaN { return "NaN" }
    if v.isInfinite { return v < 0 ? "-Infinity" : "Infinity" }
    if v == 0 { return "0" }
    if v == v.rounded() && abs(v) < 1e21 { return abs(v) < 9.2e18 ? String(Int64(v)) : bigInteger(v) }
    let sign = v < 0 ? "-" : ""
    let text = "\(abs(v))"
    // 拆成数字串与十进制指数：value = 0.d1d2…dk × 10^n。
    var mantissa = Substring(text), exp = 0
    if let e = text.firstIndex(where: { $0 == "e" || $0 == "E" }) { mantissa = text[..<e]; exp = Int(text[text.index(after: e)...].replacingOccurrences(of: "+", with: ""))! }
    var digits = "", pointAt = mantissa.count
    if let dot = mantissa.firstIndex(of: ".") { pointAt = mantissa.distance(from: mantissa.startIndex, to: dot) }
    digits = mantissa.replacingOccurrences(of: ".", with: "")
    var n = pointAt + exp
    // 去掉前导与末尾的零。
    while digits.hasPrefix("0") && digits.count > 1 { digits.removeFirst(); n -= 1 }
    while digits.hasSuffix("0") && digits.count > 1 { digits.removeLast() }
    let k = digits.count
    if k <= n && n <= 21 { return sign + digits + String(repeating: "0", count: n - k) }
    if 0 < n && n <= 21 { return sign + digits.prefix(n) + "." + digits.dropFirst(n) }
    if -6 < n && n <= 0 { return sign + "0." + String(repeating: "0", count: -n) + digits }
    let e = n - 1
    let head = String(digits.prefix(1)), tail: String = k > 1 ? "." + String(digits.dropFirst(1)) : ""
    let power: String = (e < 0 ? "-" : "+") + String(abs(e))
    return sign + head + tail + "e" + power
}
private func bigInteger(_ v: Double) -> String {
    // 9.2e18 ≤ |v| < 1e21 的整数：用十进制大数展开。
    var x = abs(v), out = [Character]()
    while x >= 1 { let q = (x / 10).rounded(.down); out.append(Character(String(Int(x - q * 10)))); x = q }
    return (v < 0 ? "-" : "") + String(out.reversed())
}

/// 新世界地理（war30-geography geographyBinding、army-travel47-graph buildArmyTravelGraph47、
/// army-presence47 initialArmyPositions47、native-statics 的 travel.bin）。
public enum CreationGeography {
    /// geographyBinding：地形与辖区轮廓 JSON 文本的长度与两个 32 位散列。
    static func binding(_ d: TerrainDocument, elevations: [Int], provinces: [JS]) -> String {
        var a: UInt32 = 2166136261, b: UInt32 = 0x9e3779b9, length = 0
        func feed(_ s: String) {
            for c in s.utf16 { let x = UInt32(c); a = (a ^ x) &* 16777619; b = (b ^ x) &* 0x85ebca6b; b ^= b >> 13 }
            length += s.utf16.count
        }
        feed("["); feed(jsNumberText(d.width)); feed(","); feed(jsNumberText(d.height)); feed(",[")
        for (i, p) in d.points.enumerated() { if i > 0 { feed(",") }; feed("["); feed(jsNumberText(p.0)); feed(","); feed(jsNumberText(p.1)); feed("]") }
        feed("],[")
        for (i, t) in d.triangles.enumerated() { if i > 0 { feed(",") }; feed(String(t)) }
        feed("],[")
        for (i, h) in elevations.enumerated() { if i > 0 { feed(",") }; feed(String(h)) }
        feed("],[")
        for (i, p) in provinces.enumerated() {
            if i > 0 { feed(",") }
            let row = JS.array([p.id, p.polygon, p.neighbors]); feed(row.json)
        }
        feed("]]")
        return "\(length):\(String(a, radix: 16)):\(String(b, radix: 16))"
    }

    public struct Link { public let to: Int; public let gate: TravelPoint; public let distance: Double; public let toGate: Double }
    public final class Cell {
        public let id: Int, face: Int, land: Bool, province: Int, center: TravelPoint, polygon: [TravelPoint]
        public var links = [Link]()
        init(id: Int, face: Int, land: Bool, province: Int, center: TravelPoint, polygon: [TravelPoint]) {
            self.id = id; self.face = face; self.land = land; self.province = province; self.center = center; self.polygon = polygon
        }
    }
    /// buildArmyTravelGraph47 的结果：按插入顺序的格子（陆面在前、海面在后），以及各辖区的格子。
    public struct Graph {
        public let order: [Int], cells: [Int: Cell], byProvince: [[Int]]
    }

    static func contains(_ poly: [TravelPoint], _ p: TravelPoint) -> Bool {
        var inside = false, j = poly.count - 1
        for i in 0..<poly.count { let a = poly[i], b = poly[j]; if (a.y > p.y) != (b.y > p.y) && p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x { inside.toggle() }; j = i }
        return inside
    }

    public static func travelGraph(_ d: TerrainDocument, elevations: [Int], provinces: [JS], sea: SeaGraph) -> Graph { buildTravel(d, elevations: elevations, provinces: provinces, sea: sea)! }
    /// 同上；陆面无法唯一归属辖区或面积不符时为 nil（网页抛出含“辖区”的错误，建世界时加州数重试）。
    public static func buildTravel(_ d: TerrainDocument, elevations: [Int], provinces: [JS], sea: SeaGraph) -> Graph? {
        let scale = 1000 / max(d.width, d.height)
        struct Group { let poly: [TravelPoint]; let minX: Double, maxX: Double, minY: Double, maxY: Double }
        let groups = provinces.map { p -> Group in
            let poly = p.polygon.asArray.map { TravelPoint(x: $0.x.asNumber, y: $0.y.asNumber) }
            return Group(poly: poly, minX: poly.map(\.x).min()!, maxX: poly.map(\.x).max()!, minY: poly.map(\.y).min()!, maxY: poly.map(\.y).max()!)
        }
        func bin(_ v: Double) -> Int { min(31, max(0, Int((v / 1000 * 32).rounded(.down)))) }
        var bins = [Int: [Int]]()
        for (k, g) in groups.enumerated() { for y in bin(g.minY)...bin(g.maxY) { for x in bin(g.minX)...bin(g.maxX) { bins[y * 32 + x, default: []].append(k) } } }
        var sources = [[Int]: Int]()
        var t = 0
        while t < d.triangles.count { sources[[d.triangles[t], d.triangles[t + 1], d.triangles[t + 2]].sorted()] = t / 3; t += 3 }
        var cells = [Int: Cell](), order = [Int](), byProvince = [[Int]](repeating: [], count: provinces.count), areas = [Double](repeating: 0, count: provinces.count)
        for face in Regions.landFaces(d, elevations) {
            let id = sources[face.source.sorted()]!
            let polygon = face.ring.map { TravelPoint(x: $0.x * scale, y: $0.y * scale) }
            var sx = 0.0, sy = 0.0; for p in polygon { sx += p.x }; for p in polygon { sy += p.y }
            let center = TravelPoint(x: sx / Double(polygon.count), y: sy / Double(polygon.count))
            let matches = (bins[bin(center.y) * 32 + bin(center.x)] ?? []).filter { k in
                let g = groups[k]; if center.x < g.minX || center.x > g.maxX || center.y < g.minY || center.y > g.maxY { return false }
                return contains(g.poly, center)
            }
            if matches.count != 1 { return nil }
            areas[matches[0]] += CreationForces.polygonArea(polygon)
            let cell = Cell(id: id * 2, face: id, land: true, province: matches[0], center: center, polygon: polygon)
            cells[cell.id] = cell; order.append(cell.id); byProvince[matches[0]].append(cell.id)
        }
        for (k, g) in groups.enumerated() where byProvince[k].isEmpty || abs(areas[k] - CreationForces.polygonArea(g.poly)) > max(1e-7, areas[k] * 1e-7) { return nil }
        for nid in sea.order {
            let n = sea.nodes[nid]!
            let cell = Cell(id: n.id * 2 + 1, face: n.id, land: false, province: -1, center: n.center, polygon: n.polygon)
            cells[cell.id] = cell; order.append(cell.id)
        }
        var edges = [SeaGraph.EdgeKey: (cell: Cell, paired: Bool)]()
        for id in order {
            let cell = cells[id]!
            for i in 0..<cell.polygon.count {
                let a = cell.polygon[i], b = cell.polygon[(i + 1) % cell.polygon.count]
                if jsHypot(a.x - b.x, a.y - b.y) <= 0 { continue }
                let k = SeaGraph.EdgeKey(a, b)
                guard let old = edges[k] else { edges[k] = (cell, false); continue }
                guard !old.paired && old.cell.id != cell.id else { return nil }
                edges[k] = (old.cell, true)
                if !old.cell.land && !cell.land && !sea.nodes[old.cell.face]!.links.contains(where: { $0.to == cell.face }) { continue }
                // v8.0.0 区域历史剧本外缘禁航边界：严禁陆地格与边缘禁航水域相连，彻底杜绝从地图边缘假海岸下海偷渡！
                if old.cell.land != cell.land && !sea.blockedSeaIds.isEmpty {
                    let seaFace = old.cell.land ? cell.face : old.cell.face
                    if sea.blockedSeaIds.contains(seaFace) { continue }
                }
                let gate = TravelPoint(x: (a.x + b.x) / 2, y: (a.y + b.y) / 2)
                let left = jsHypot(old.cell.center.x - gate.x, old.cell.center.y - gate.y), right = jsHypot(cell.center.x - gate.x, cell.center.y - gate.y)
                old.cell.links.append(Link(to: cell.id, gate: gate, distance: left + right, toGate: left))
                cell.links.append(Link(to: old.cell.id, gate: gate, distance: left + right, toGate: right))
            }
        }
        // 稳定排序（与 JS Array.sort 一致）。
        for c in cells.values { c.links = c.links.enumerated().sorted { $0.element.to != $1.element.to ? $0.element.to < $1.element.to : $0.offset < $1.offset }.map(\.element) }
        return Graph(order: order, cells: cells, byProvince: byProvince)
    }

    /// insideTravelCell47：多边形内或边上（1e-8）。
    static func inside(_ cell: Cell, _ p: TravelPoint) -> Bool {
        var minX = Double.infinity, minY = Double.infinity, maxX = -Double.infinity, maxY = -Double.infinity
        for v in cell.polygon { minX = min(minX, v.x); maxX = max(maxX, v.x); minY = min(minY, v.y); maxY = max(maxY, v.y) }
        if p.x < minX - 1e-8 || p.x > maxX + 1e-8 || p.y < minY - 1e-8 || p.y > maxY + 1e-8 { return false }
        if contains(cell.polygon, p) { return true }
        for i in 0..<cell.polygon.count {
            let a = cell.polygon[i], b = cell.polygon[(i + 1) % cell.polygon.count], dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy
            let t = len2 != 0 ? max(0, min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0
            if jsHypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)) <= 1e-8 { return true }
        }
        return false
    }
    /// locateTravelCell47（限定辖区）：包含该点的最小编号格子。
    static func locate(_ g: Graph, _ p: TravelPoint, province: Int) -> Cell? {
        var found: Cell?
        for id in g.byProvince[province] { let c = g.cells[id]!; if (found == nil || c.id < found!.id) && inside(c, p) { found = c } }
        return found
    }

    /// initialArmyPositions47：每支军队停在其所在辖区中心所在的格子上。
    static func armyPositions(_ r: JS, graph g: Graph, binding: String) -> JS {
        let index = Dictionary(uniqueKeysWithValues: r.world.provinces.asArray.enumerated().map { ($0.element.id.asString, $0.offset) })
        let records = JS.object()
        for a in r.world.armies.asArray {
            let pi = index[a.provinceId.asString]!, center = r.world.provinces[pi].center
            let point = TravelPoint(x: center.x.asNumber, y: center.y.asNumber)
            let cell = locate(g, point, province: pi)!
            let o = JS.object(), origin = JS.object()
            origin.x = JS(point.x); origin.y = JS(point.y)
            o.version = JS(1); o.armyId = a.id; o.origin = origin; o.nodes = .array([JS(cell.id)]); o.leg = JS(0); o.offset = JS(0); o.crossed = JS(false); o.status = JS("arrived")
            records[a.id.asString] = o
        }
        let v = JS.object(); v.version = JS(1); v.binding = JS(binding); v.revision = JS(0); v.records = records
        return v
    }

    /// native-statics travel.bin（布局见 TravelGraph）。`mountain`/`plateau`/`targets` 按辖区顺序，`faceBiomes` 为 forceSpeed.faceBiomes。
    /// native-war/army-path nativeArmyCellDistance（单精度八向距离）。
    static func cellDistance(_ a: TravelPoint, _ b: TravelPoint) -> Double {
        let f = Native.fr, dx = abs(f(f(a.x) - f(b.x))), dy = abs(f(f(a.y) - f(b.y)))
        return f(f(dx + dy) + f(min(dx, dy) * f(-0.5859999656677246)))
    }
    /// nativeArmyRouteCost(d, 非海路, 不偏好港口)：至少 0.05。
    static func routeCost(_ d: Double) -> Double { let f = Native.fr; return f(max(f(0.05), f(f(d) * 1)) + 0) }

    static func travelBinary(_ g: Graph, scale: Double, mountain: [Bool], plateau: [Bool], targets: [TravelPoint], faceBiomes: [UInt8]) -> Data {
        let ids = g.order.sorted()
        var index = [Int: Int](); for (i, id) in ids.enumerated() { index[id] = i }
        var out = Data()
        func u32(_ v: Int) { var x = UInt32(truncatingIfNeeded: v).littleEndian; withUnsafeBytes(of: &x) { out.append(contentsOf: $0) } }
        func i32(_ v: Int) { u32(Int(UInt32(bitPattern: Int32(v)))) }
        func f64(_ v: Double) { var x = v.bitPattern.littleEndian; withUnsafeBytes(of: &x) { out.append(contentsOf: $0) } }
        let links = ids.reduce(0) { $0 + g.cells[$1]!.links.count }
        u32(0x5654474c); u32(1); u32(ids.count); u32(links); u32(mountain.count); u32(faceBiomes.count)
        var k = 0
        for id in ids { let c = g.cells[id]!; i32(id); i32(c.face); i32(c.province); f64(c.center.x); f64(c.center.y); u32(k); k += c.links.count }
        u32(k)
        for id in ids {
            let a = g.cells[id]!
            for l in a.links {
                let b = g.cells[l.to]!
                let d = cellDistance(TravelPoint(x: a.center.x / scale, y: a.center.y / scale), TravelPoint(x: b.center.x / scale, y: b.center.y / scale))
                let cost = routeCost(d)
                i32(index[l.to]!); f64(l.gate.x); f64(l.gate.y); f64(l.distance); f64(l.toGate); f64(cost)
            }
        }
        for i in mountain.indices { out.append(mountain[i] ? 1 : 0); out.append(plateau[i] ? 1 : 0); f64(targets[i].x); f64(targets[i].y) }
        out.append(contentsOf: faceBiomes)
        return out
    }
}
