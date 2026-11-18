import Foundation

/// 新世界交给 Swift 引擎的静态几何（src/native-bridge/native-statics.ts nativeStatics、seaStatic，
/// native-export/diplomacy-state diplomacyStatic，original-politics originalCellProvinces）。键序与网页一致。
public enum CreationStatics {
    /// originalCellProvinces：每个 Voronoi 格所属辖区（按其周围三角重心投票，海为 −1）。
    public static func cellProvinces(_ d: TerrainDocument, elevations: [Int], provinces: [JS], scale: Double) -> [Int] {
        let rings = provinces.map { p in p.polygon.asArray.map { TravelPoint(x: $0.x.asNumber / scale, y: $0.y.asNumber / scale) } }
        let size = 32.0, columns = Int((d.width / size).rounded(.up)), rows = Int((d.height / size).rounded(.up))
        var buckets = [[Int]](repeating: [], count: columns * rows)
        func floorInt(_ v: Double) -> Int { Int(v.rounded(.down)) }
        for (index, ring) in rings.enumerated() {
            var minX = Double.infinity, minY = Double.infinity, maxX = -Double.infinity, maxY = -Double.infinity
            for v in ring { minX = min(minX, v.x); minY = min(minY, v.y); maxX = max(maxX, v.x); maxY = max(maxY, v.y) }
            let r0 = max(0, floorInt(minY / size)), r1 = min(rows - 1, floorInt(maxY / size)), c0 = max(0, floorInt(minX / size)), c1 = min(columns - 1, floorInt(maxX / size))
            if r0 > r1 || c0 > c1 { continue }
            for r in r0...r1 { for c in c0...c1 { buckets[r * columns + c].append(index) } }
        }
        func locate(_ x: Double, _ y: Double) -> Int {
            let bucket = buckets[min(rows - 1, max(0, floorInt(y / size))) * columns + min(columns - 1, max(0, floorInt(x / size)))]
            for index in bucket where CreationGeography.contains(rings[index], TravelPoint(x: x, y: y)) { return index }
            return -1
        }
        let n = d.points.count
        var best = [Int](repeating: -1, count: n), count = [Int](repeating: 0, count: n)
        var tallies = [[Int: Int]](repeating: [:], count: n)
        var t = 0
        while t < d.triangles.count {
            let a = d.points[d.triangles[t]], b = d.points[d.triangles[t + 1]], c = d.points[d.triangles[t + 2]]
            let owner = locate((a.0 + b.0 + c.0) / 3, (a.1 + b.1 + c.1) / 3)
            if owner >= 0 { for k in 0..<3 { let cell = d.triangles[t + k]; if elevations[cell] < 20 { continue }; tallies[cell][owner, default: 0] += 1 } }
            t += 3
        }
        var result = [Int](repeating: -1, count: n)
        for cell in 0..<n where !tallies[cell].isEmpty {
            for (owner, v) in tallies[cell] where v > count[cell] || v == count[cell] && owner < best[cell] { best[cell] = owner; count[cell] = v }
            result[cell] = best[cell]
        }
        let owned = Set(result)
        for (index, ring) in rings.enumerated() where !owned.contains(index) && !ring.isEmpty {
            var sx = 0.0, sy = 0.0; for v in ring { sx += v.x }; for v in ring { sy += v.y }
            let cx = sx / Double(ring.count), cy = sy / Double(ring.count)
            var bestCell = -1, distance = Double.infinity
            for cell in 0..<n where elevations[cell] >= 20 {
                let dx = d.points[cell].0 - cx, dy = d.points[cell].1 - cy, dd = dx * dx + dy * dy
                if dd < distance { distance = dd; bestCell = cell }
            }
            if bestCell >= 0 { result[bestCell] = index }
        }
        for _ in 0..<4 { for cell in 0..<n where elevations[cell] >= 20 && result[cell] < 0 {
            if let next = d.neighbors[cell].first(where: { result[$0] >= 0 }) { result[cell] = result[next] }
        } }
        return result
    }

    /// travelFeatures47：行军格按陆海连通分块的名字（"land/0"、"sea/3"），按插入顺序编号。
    static func features(_ g: CreationGeography.Graph) -> [Int: String] {
        var out = [Int: String](), index = 0
        for id in g.order where out[id] == nil {
            let cell = g.cells[id]!, feature = (cell.land ? "land" : "sea") + "/\(index)"; index += 1
            var queue = [id]; out[id] = feature; var i = 0
            while i < queue.count { for l in g.cells[queue[i]]!.links { let to = g.cells[l.to]!; if to.land == cell.land && out[to.id] == nil { out[to.id] = feature; queue.append(to.id) } }; i += 1 }
        }
        return out
    }

    /// nativeStatics（不含 labelGrid 与 map）。`r` 为建好海陆编制后的整局。
    public static func build(_ r: JS, _ d: TerrainDocument, elevations: [Int], sea: SeaGraph, travel g: CreationGeography.Graph) -> JS {
        let w = r.world, provinces = w.provinces.asArray, scale = r.scale.asNumber
        var provinceIndex = [String: Int](); for (i, p) in provinces.enumerated() { provinceIndex[p.id.asString] = i }
        let ctx = r.terrainContext.provinces, cities = w.cities.asArray
        let targets = provinces.map { p -> TravelPoint in let v = cities.first { $0.provinceId.asString == p.id.asString }?.position ?? p.center; return TravelPoint(x: v.x.asNumber, y: v.y.asNumber) }
        let faces = r.forceSpeed.biomePolicy.optionalString == "native-biome-face-v1" ? r.forceSpeed.faceBiomes.asArray.map { UInt8($0.asInt) } : []
        let bin = CreationGeography.travelBinary(g, scale: scale, mountain: provinces.map { ctx[$0.id.asString].mountain.isTruthy },
                                                 plateau: provinces.map { ctx[$0.id.asString].plateau.isTruthy }, targets: targets, faceBiomes: faces)
        // borders：nativeFilterProvinceCells53 的外缘邻格所属辖区。
        let owners = cellProvinces(d, elevations: elevations, provinces: provinces, scale: scale)
        var cellsOf = [[Int]](repeating: [], count: provinces.count)
        for (cell, o) in owners.enumerated() where o >= 0 { cellsOf[o].append(cell) }
        let borders = JS.array()
        for i in provinces.indices {
            var row = [JS]()
            for cell in cellsOf[i] { for next in d.neighbors[cell] { let o = owners[next]; if o == i || o < 0 { continue }; row.append(JS(o)) } }
            borders.push(.array(row))
        }
        let homeCells = JS.object()
        for (i, p) in provinces.enumerated() {
            let c = TravelPoint(x: p.center.x.asNumber, y: p.center.y.asNumber)
            homeCells[p.id.asString] = JS(CreationGeography.locate(g, c, province: i)!.id)
        }
        let o = JS.object()
        o.travel = JS(bin.base64EncodedString()); o.borders = borders; o.homeCells = homeCells
        o.diplomacy = diplomacy(r, travel: g, provinceIndex: provinceIndex)
        let sites = r.harbors.sites.asArray
        o.seaPorts = .array(sites.map { .array([$0.provinceId.clone(), JS(sea.nodes[$0.anchor.asInt]!.component)]) })
        var components = [Int](repeating: -1, count: d.triangles.count / 3)
        for n in sea.nodes.values { components[n.id] = n.component }
        let ports = sites.map { s -> JS in let c = sea.nodes[s.anchor.asInt]!.center; return .array([s.id.clone(), s.provinceId.clone(), s.anchor.clone(), JS(c.x), JS(c.y)]) }
        let seaObject = JS.object(); seaObject.components = .array(components.map { JS($0) }); seaObject.ports = .array(ports)
        o.sea = seaObject
        return o
    }

    /// diplomacyStatic：陆地辖区（编号 1…）与水域辖区的邻接、位置，陆地辖区的陆邻与相接海块。
    static func diplomacy(_ r: JS, travel g: CreationGeography.Graph, provinceIndex: [String: Int]) -> JS {
        let geo = r.diplomaticGeography, provinces = r.world.provinces.asArray
        var coasts = [String: [Int]]()
        for wp in geo.water.asArray { for id in wp.landIds.asArray { coasts[id.asString, default: []].append(wp.id.asInt) } }
        let features = features(g)
        let land = JS.array()
        for (i, p) in provinces.enumerated() {
            var wet = [String](), seen = Set<String>()
            for cell in g.byProvince[i] { for l in g.cells[cell]!.links { let c = g.cells[l.to]!; if !c.land, let f = features[c.id], seen.insert(f).inserted { wet.append(f) } } }
            wet.sort { $0.utf16.lexicographicallyPrecedes($1.utf16) }
            let o = JS.object(); o.id = p.id.clone()
            let neighbors = p.neighbors.asArray.map { JS(provinceIndex[$0.asString]! + 1) } + (coasts[p.id.asString] ?? []).map { JS($0) }
            o.neighbors = .array(neighbors); o.land = .array(p.neighbors.asArray.map { JS(provinceIndex[$0.asString]!) })
            o.x = p.center.x.clone(); o.y = p.center.y.clone(); o.wet = .array(wet.map { JS($0) })
            land.push(o)
        }
        let water = JS.array()
        for wp in geo.water.asArray {
            let o = JS.object(); o.id = wp.id.clone()
            o.neighbors = .array(wp.landIds.asArray.map { JS(provinceIndex[$0.asString]! + 1) } + wp.neighbors.asArray.map { $0.clone() })
            o.x = wp.center.x.clone(); o.y = wp.center.y.clone()
            water.push(o)
        }
        let o = JS.object(); o.land = land; o.water = water
        return o
    }
}
