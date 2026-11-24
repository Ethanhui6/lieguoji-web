import Foundation

/// 新世界的初始海陆编制（civilization47-forces attachFoundingForces47 的 build）：首府港湾、每国第一支
/// 舰队与扣除的船员配粮、舰队位置、外交海域（war30-geography buildDiplomaticGeography）及各军事账本的
/// 初值。键序与网页一致。
public enum CreationForces {
    static let f = Native.fr

    /// 32 位 FNV-1a（按 UTF-16 码元，与网页 `for(const c of text)…charCodeAt(0)` 在 ASCII 文本上一致）。
    static func fnv(_ text: String) -> UInt32 {
        var h: UInt32 = 2166136261
        for c in text.unicodeScalars { h = (h ^ UInt32(String(c).utf16.first!)) &* 16777619 }
        return h
    }
    static func object(_ pairs: [(String, JS)]) -> JS { let o = JS.object(); for (k, v) in pairs { o[k] = v }; return o }
    static func point(_ p: TravelPoint) -> JS { object([("x", JS(p.x)), ("y", JS(p.y))]) }

    /// 舰队用的海路图（graphFor46）：港口取自港湾布局。
    struct Port { let id: String, provinceId: String, node: Int, shore: TravelPoint }

    /// attachFoundingForces47（开局总是和平）。`sea` 为 seaGraph，`faceBiomes` 为
    /// forceFaceBiomes47。`r` 被就地改写：world（事件、粮秣人口）并按网页顺序追加各字段。
    public static func attach(_ r: JS, _ d: TerrainDocument, elevations: [Int], sea: SeaGraph, faceBiomes: [Int], method: String) {
        let w = r.world, tick = r.clock.tick.asNumber, seed = w.custom.seed.asString
        let provinces = w.provinces.asArray
        let sites = sea.harbors(d, provinces: provinces, cities: w.cities.asArray, method: method)
        let harbors = object([("version", JS(1)), ("method", JS(method)), ("sites", .array(sites.map(\.js)))])
        let ports = sites.map { Port(id: $0.id, provinceId: $0.provinceId, node: $0.anchor, shore: $0.shore) }
        let firstEventId = w.nextEventId.asNumber

        // initialNavy：每国在粮最多的己方港口编成一支一船舰队。
        var byProvince = [String: JS](); for p in provinces { byProvince[p.id.asString] = p }
        var stock = [String: JS](); for s in w.statecraft.provinces.asArray { stock[s.provinceId.asString] = s }
        func owned(_ p: Port, _ nation: String) -> Bool { let v = byProvince[p.provinceId]!; return v.controller.asString == nation && v.legalOwner.optionalString == nation }
        func portName(_ p: Port) -> String {
            (w.cities.asArray.first { $0.provinceId.asString == p.provinceId }?.name.asString ?? byProvince[p.provinceId]!.name.asString) + "港"
        }
        let fleets = JS.array()
        var docks = [String]()
        for n in w.nations.asArray {
            let id = n.id.asString
            let mine = ports.enumerated().filter { owned($0.element, id) }
                .sorted { a, b in let ga = stock[a.element.provinceId]!.grain.asNumber, gb = stock[b.element.provinceId]!.grain.asNumber; return gb != ga ? gb - ga < 0 : a.offset < b.offset }
                .map(\.element)
            for p in mine {
                let l = stock[p.provinceId]!, crew = 40.0, grain = 2400.0
                let count = fleets.asArray.count, own = fleets.asArray.filter { $0.nationId.asString == id && $0.status.asString != "lost" }.count
                if count >= 200 || own >= 8 { continue }
                if l.population.asNumber - crew < 100 || l.grain.asNumber - grain < l.population.asNumber * 10 { continue }
                l.population = JS(l.population.asNumber - crew); l.grain = JS(l.grain.asNumber - grain)
                let name = portName(p)
                fleets.push(object([("id", JS("fleet-\(jsNumberText(w.nextEventId.asNumber))-\(count)")), ("name", JS(name + "水师")), ("nationId", JS(id)), ("ships", JS(1)), ("crew", JS(crew)),
                                    ("food", JS(grain)), ("node", JS(p.node)), ("route", .array()), ("progress", JS(0)), ("dockId", JS(p.id)), ("targetId", .null), ("patrol", JS(true)), ("status", JS("docked"))]))
                docks.append(p.provinceId)
                event(w, "在\(name)编成舰队。", "1 艘船，征用 40 名船员，扣除 2400 人日粮。 配备 60 日口粮；由港外真实海格出发。造船费用为当前网页适配规则。")
                break
            }
        }
        let navy = object([("version", JS(1)), ("fleets", fleets)])
        let charges = JS.array()
        for (k, fl) in fleets.asArray.enumerated() {
            charges.push(object([("fleetId", fl.id), ("homeId", JS(docks[k])), ("crew", fl.crew), ("grain", fl.food)]))
        }
        let navalOpening = object([("version", JS(1)), ("rule", JS("qualified-starter-debit-v1")), ("firstEventId", JS(firstEventId)), ("charges", charges)])

        // 舰队位置：湿面 n 即行军格 2n+1。
        let fleetRecords = JS.object()
        for fl in fleets.asArray {
            let node = fl.node.asInt
            guard let c = sea.nodes[node]?.center else { continue }
            fleetRecords[fl.id.asString] = object([("version", JS(1)), ("armyId", fl.id), ("origin", point(c)), ("nodes", .array([JS(node * 2 + 1)])), ("leg", JS(0)), ("offset", JS(0)),
                                                    ("crossed", JS(false)), ("status", JS("arrived"))])
        }
        let fleetPositions = object([("version", JS(1)), ("binding", r.armyPositions.binding.clone()), ("revision", JS(0)), ("records", fleetRecords)])
        let hulls = JS.object(); for fl in fleets.asArray { hulls[fl.id.asString] = JS(fl.ships.asNumber * 100) }
        let maritime = object([("version", JS(1)), ("hulls", hulls), ("contacts", .array()), ("retreating", .object())])
        let reorganization = object([("version", JS(1)), ("active", .object()), ("completed", .object())])
        let nationIds = w.nations.asArray.map(\.id.asString)
        func perNation(_ v: () -> JS) -> JS { let o = JS.object(); for id in nationIds { o[id] = v() }; return o }
        let alliances = object([("version", JS(1)), ("revision", JS(0)), ("nextId", JS(1)), ("enabled", JS(true)), ("originTime", r.life.gameTime.clone()), ("originTick", JS(tick)),
                                ("records", .array()), ("lastAction", perNation { JS(-100) })])
        r.navy = navy; r.harbors = harbors; r.maritime = maritime; r.reorganization = reorganization
        r.battles = object([("version", JS(1)), ("nextId", JS(1)), ("engagements", .array()), ("plans", .object())])
        r.occupation = object([("version", JS(1)), ("sieges", .array())])
        r.transports = object([("version", JS(1)), ("cargo", .array())])
        r.voyages = object([("version", JS(1)), ("revision", JS(0)), ("enabled", perNation { JS(true) }), ("missions", .object()), ("decisions", .object()),
                            ("nextCheck", perNation { JS(0) }), ("manualArmies", .array()), ("manualFleets", .array())])
        r.alliances = alliances
        r.vassals = object([("version", JS(1)), ("revision", JS(0)), ("records", .array())])
        r.diplomaticGeography = diplomaticGeography(r, d, elevations: elevations, sea: sea)
        r.fleetPositions = fleetPositions
        r.warfare = object([("version", JS(1)), ("revision", JS(0)), ("campaigns", .array())])
        r.nativeWars = object([("version", JS(1)), ("revision", JS(0)), ("nextId", JS(1)), ("originTick", JS(tick)), ("provinceIds", .array(provinces.map(\.id))),
                               ("nationIds", .array(w.nations.asArray.map { .array([r.people.nations[$0.id.asString].id.clone(), $0.id]) })), ("campaigns", .array())])
        r.losses = object([("version", JS(1)), ("revision", JS(0)), ("originTick", JS(tick)), ("source", JS("new-world")), ("nations", .object()), ("campaigns", .object())])
        Wars.reconcileLosses(r)
        // initialPorts46：港口按港湾顺序，舰队各一条攻港记录。
        let portRows = JS.object()
        for p in ports where portRows[p.provinceId].isNull {
            let c = byProvince[p.provinceId]!.controller
            portRows[p.provinceId] = object([("landOwnerId", c.clone()), ("occupierId", c.clone()), ("value", JS(100))])
        }
        let portFleets = JS.object()
        for fl in fleets.asArray {
            portFleets[fl.id.asString] = object([("targetId", .null), ("forwardBaseId", .null), ("active", JS(false)), ("lastWar", JS(false)), ("nextTick", JS(tick))])
        }
        r.portControl = object([("version", JS(1)), ("revision", JS(0)), ("nextRoleTick", JS(tick)), ("attackFleetIds", .array()), ("ports", portRows), ("fleets", portFleets)])
        r.forceContacts = object([("version", JS(1)), ("pairs", .array())])
        r.forceClock = object([("version", JS(1)), ("basis", JS("scaled-seconds-per-tick-lcg-v1")), ("secondsPerTick", JS(r.life.secondsPerDay.asNumber / 120)), ("now", JS(tick)),
                               ("rng", JS(Double(fnv("\(seed)/force47")))), ("draws", JS(0)), ("deadlines", .object())])
        r.forceDamage = object([("version", JS(1)), ("carry", .object()), ("losses", .object())])
        let speeds = JS.object()
        for a in w.armies.asArray {
            let id = a.id.asString, nation = a.nationId.asString, cavalry = Armies.stateTraits(r, nation).contains("CavalryTradition")
            speeds[id] = object([("nationAtInitialization", JS(nation)), ("initializedTick", JS(tick)), ("cavalryTradition", JS(cavalry)),
                                 ("base", JS(Armies.speed(seed: seed, armyId: id, nationId: nation, tick: Int(tick), cavalry: cavalry)))])
        }
        r.forceSpeed = object([("version", JS(2)), ("basis", JS("native-standard-map-v2")), ("mapUnitsPerNativeUnit", JS(1000.0 / 240)), ("biomePolicy", JS("native-biome-face-v1")),
                               ("faceBiomes", .array(faceBiomes.map { JS($0) })), ("armies", speeds)])
        r.dailyEconomy = object([("version", JS(1)), ("lastDay", JS(0)), ("lastMusterMonth", JS(0))])
        r.navalOpening = navalOpening
        // initialCombatPersonnel47。
        let personnelNations = JS.object()
        for id in nationIds {
            personnelNations[id] = object([("damageTraits", .array(Armies.damageTraits(r, id).map { JS($0) })),
                                           ("leader", object([("leaderId", .null), ("traitNames", .array()), ("enemyIds", .array()), ("refreshedTick", JS(0)), ("modifier", JS(0))]))])
        }
        let personnelArmies = JS.object()
        for a in w.armies.asArray {
            let traits = Armies.damageTraits(r, a.nationId.asString)
            personnelArmies[a.id.asString] = object([("nationAtInitialization", a.nationId.clone()), ("initializedTick", JS(tick)), ("command", JS("central")),
                                                     ("damageTraitsAtInitialization", .array(traits.map { JS($0) })),
                                                     ("damageToArmy", JS(f((traits.contains("FieldCombatElite") ? f(1.5) : 1) * 40))),
                                                     ("damageToProvince", JS(f((traits.contains("SiegeCapture") ? f(1.5) : 1) * 10)))])
        }
        r.combatPersonnel = object([("version", JS(1)), ("rule", JS("native-personnel-web-central-v1")), ("hullPerNativeCount", JS(1)), ("protrusion", JS("neutral-unrecovered-v1")),
                                    ("nations", personnelNations), ("armies", personnelArmies)])
        Government.refreshLeaderCombat(r)
        let decisions = JS.object()
        for a in w.armies.asArray {
            decisions[a.id.asString] = object([("targetId", .null), ("garrisonId", .null), ("campaignId", .null), ("decision", JS("waiting")), ("nextTick", JS(0)), ("issuedTick", .null),
                                               ("reason", JS("等待自主军令评估。"))])
        }
        r.armyAutonomy = object([("version", JS(2)), ("rule", JS("native-target-web-space-v2")), ("revision", JS(0)), ("lastDay", w.day.clone()), ("armies", decisions)])
        let navalFleets = JS.object()
        for (k, fl) in fleets.asArray.enumerated() {
            let home = sites.first { $0.provinceId == docks[k] }?.id
            navalFleets[fl.id.asString] = object([("homePortId", home.map { JS($0) } ?? .null), ("assignedPortId", .null), ("nextTick", JS(tick)), ("issuedTick", .null),
                                                  ("decision", JS("waiting")), ("reason", JS("等待海军自主部署。"))])
        }
        let rng = fnv("\(seed)/naval-autonomy47")
        r.navalAutonomy = object([("version", JS(1)), ("rule", JS("native-roles-actual-space-v1")), ("timing", JS("unscaled40-web-ticks-v1")), ("revision", JS(0)),
                                  ("rng", JS(Double(rng == 0 ? 1 : rng))), ("lastTick", JS(tick)), ("nextRoleTick", JS(tick)), ("fleets", navalFleets)])
    }

    /// navy.ts event：系统事件，最多保留 160 条。
    static func event(_ w: JS, _ text: String, _ reason: String) {
        let e = object([("id", w.nextEventId.clone()), ("day", w.day.clone()), ("kind", JS("system")), ("text", JS(text)), ("reason", JS(reason))])
        w.nextEventId = JS(w.nextEventId.asNumber + 1)
        w.events.push(e)
        let all = w.events.asArray; if all.count > 160 { w.events = .array(Array(all.suffix(160))) }
    }

    // MARK: 外交海域（buildDiplomaticGeography）

    struct Adjacency {
        var keys = [Int](), values = [Int: Double]()
        subscript(_ k: Int) -> Double? { values[k] }
        mutating func set(_ k: Int, _ v: Double) { if values[k] == nil { keys.append(k) }; values[k] = v }
        mutating func delete(_ k: Int) { if values.removeValue(forKey: k) != nil { keys.removeAll { $0 == k } } }
    }
    static func wetArea(_ p: [TravelPoint]) -> Double {
        let o = p[0]; var s = 0.0
        for i in 0..<p.count { let a = p[i], b = p[(i + 1) % p.count]; s = s + (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x) }
        return abs(s) / 2
    }
    static func polygonArea(_ p: [TravelPoint]) -> Double {
        var s = 0.0; for i in 0..<p.count { let a = p[i], b = p[(i + 1) % p.count]; s = s + a.x * b.y - b.x * a.y }; return abs(s) / 2
    }

    static func diplomaticGeography(_ r: JS, _ d: TerrainDocument, elevations: [Int], sea: SeaGraph) -> JS {
        let provinces = r.world.provinces.asArray, landIds = provinces.map(\.id.asString)
        let polygons = provinces.map { $0.polygon.asArray.map(SeaGraph.point) }
        var areaSum = 0.0; for p in polygons { areaSum += polygonArea(p) }
        let targetArea = areaSum / Double(landIds.count)
        let nodes = sea.order.map { sea.nodes[$0]! }
        var indices = [Int: Int](); for (i, n) in nodes.enumerated() { indices[n.id] = i }
        struct Cluster { var live = true; var revision = 0; var faces: [Int]; var area: Double; var x: Double; var y: Double; var adjacent = Adjacency() }
        var clusters = nodes.map { Cluster(faces: [$0.id], area: wetArea($0.polygon), x: $0.center.x, y: $0.center.y) }
        var wetEdges = [SeaGraph.EdgeKey: Int]()
        for (i, n) in nodes.enumerated() {
            for k in 0..<n.polygon.count {
                let a = n.polygon[k], b = n.polygon[(k + 1) % n.polygon.count], key = SeaGraph.EdgeKey(a, b)
                if let old = wetEdges[key] {
                    let length = jsHypot(a.x - b.x, a.y - b.y)
                    if length > 0 && n.links.contains(where: { $0.to == nodes[old].id }) { clusters[i].adjacent.set(old, length); clusters[old].adjacent.set(i, length) }
                } else { wetEdges[key] = i }
            }
        }
        let components = Set(nodes.map(\.component)).count
        var total = 0.0; for c in clusters { total += c.area }
        let countGoal = min(nodes.count, max(components, Int((total / targetArea).rounded(.up))))
        var heap = Regions.Queue()
        func offer(_ aa: Int, _ bb: Int) {
            let a = min(aa, bb), b = max(aa, bb), x = clusters[a], y = clusters[b]
            guard x.live, y.live, let length = x.adjacent[b], length != 0 else { return }
            let dx = x.x - y.x, dy = x.y - y.y
            let ward = (dx * dx + dy * dy) * x.area * y.area / (x.area + y.area), neck = 1 + min(4, min(x.area, y.area).squareRoot() / length)
            heap.push(Regions.Entry(a: a, b: b, ar: x.revision, br: y.revision, cost: ward * neck))
        }
        for i in clusters.indices { for j in clusters[i].adjacent.keys where i < j { offer(i, j) } }
        var count = nodes.count
        while count > countGoal {
            guard let e = heap.pop() else { break }
            let a = clusters[e.a], b = clusters[e.b]
            if !a.live || !b.live || a.revision != e.ar || b.revision != e.br { continue }
            let area = a.area + b.area
            clusters[e.a].x = (a.x * a.area + b.x * b.area) / area; clusters[e.a].y = (a.y * a.area + b.y * b.area) / area; clusters[e.a].area = area
            clusters[e.a].faces.append(contentsOf: b.faces); clusters[e.a].revision += 1; clusters[e.b].live = false; count -= 1
            clusters[e.a].adjacent.delete(e.b)
            for j in b.adjacent.keys {
                if j == e.a { continue }
                let length = b.adjacent[j]!, sum = (clusters[e.a].adjacent[j] ?? 0) + length
                clusters[e.a].adjacent.set(j, sum); clusters[j].adjacent.delete(e.b); clusters[j].adjacent.set(e.a, sum)
            }
            clusters[e.b].adjacent = Adjacency()
            for j in clusters[e.a].adjacent.keys { offer(e.a, j) }
        }
        // contacts：海面边若是陆面边界，记其所属辖区。
        var owners = [SeaGraph.EdgeKey: String]()
        for (i, poly) in polygons.enumerated() { for k in 0..<poly.count { let key = SeaGraph.EdgeKey(poly[k], poly[(k + 1) % poly.count]); if owners[key] != nil { owners[key] = nil } else { owners[key] = landIds[i] } } }
        let scale = 1000 / max(d.width, d.height)
        var boundary = Set<SeaGraph.EdgeKey>()
        for face in Regions.landFaces(d, elevations) {
            for k in 0..<face.ring.count {
                let a = face.ring[k], b = face.ring[(k + 1) % face.ring.count]
                let key = SeaGraph.EdgeKey(TravelPoint(x: a.x * scale, y: a.y * scale), TravelPoint(x: b.x * scale, y: b.y * scale))
                if boundary.contains(key) { boundary.remove(key) } else { boundary.insert(key) }
            }
        }
        var coast = [Int: [String]]()
        for n in nodes {
            for k in 0..<n.polygon.count {
                let a = n.polygon[k], b = n.polygon[(k + 1) % n.polygon.count]
                if a.x == b.x && a.y == b.y { continue }
                let key = SeaGraph.EdgeKey(a, b); if !boundary.contains(key) { continue }
                guard let id = owners[key] else { continue }
                if !(coast[n.id]?.contains(id) ?? false) { coast[n.id, default: []].append(id) }
            }
        }
        let ids = clusters.indices.filter { clusters[$0].live }
        var number = [Int: Int](); for (i, id) in ids.enumerated() { number[id] = landIds.count + i + 1 }
        let water = JS.array()
        for id in ids {
            let c = clusters[id], first = nodes[indices[c.faces[0]]!]
            var land = Set<String>(); for face in c.faces { for x in coast[face] ?? [] { land.insert(x) } }
            water.push(object([("id", JS(number[id]!)), ("faces", .array(c.faces.sorted().map { JS($0) })), ("neighbors", .array(c.adjacent.keys.map { number[$0]! }.sorted().map { JS($0) })),
                               ("landIds", .array(land.sorted { $0.utf16.lexicographicallyPrecedes($1.utf16) }.map { JS($0) })), ("area", JS(c.area)), ("center", object([("x", JS(c.x)), ("y", JS(c.y))])),
                               ("component", JS(first.component)), ("ocean", JS(first.ocean))]))
        }
        return object([("version", JS(1)), ("method", JS("wet-face-area-unions-v1")), ("binding", r.armyPositions.binding.clone()), ("landIds", .array(landIds.map { JS($0) })),
                       ("targetArea", JS(targetArea)), ("water", water)])
    }

    /// forceFaceBiomes47：每个三角取离重心最近的陆地顶点（并列取小编号）的生物群系。
    public static func faceBiomes(_ d: TerrainDocument, elevations: [Int], ids: [UInt8]) -> [Int] {
        var out = [Int](); out.reserveCapacity(d.triangles.count / 3)
        var t = 0
        while t < d.triangles.count {
            let v = [d.triangles[t], d.triangles[t + 1], d.triangles[t + 2]]; t += 3
            let px = v.map { f(d.points[$0].0) }, py = v.map { f(d.points[$0].1) }
            let x = (px[0] + px[1] + px[2]) / 3, y = (py[0] + py[1] + py[2]) / 3
            func distance(_ k: Int) -> Double { let dx = px[k] - x, dy = py[k] - y; return dx * dx + dy * dy }
            let land = (0..<3).filter { elevations[v[$0]] > 20 }.sorted { distance($0) != distance($1) ? distance($0) < distance($1) : v[$0] < v[$1] }
            out.append(land.isEmpty ? 0 : Int(ids[v[land[0]]]))
        }
        return out
    }
}
