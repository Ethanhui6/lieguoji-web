import Foundation

/// The government stage of new-world creation (civilization47-government attachGovernment47), part 1:
/// the per-province land scan shared by settlement25-terrain (buildTerrainContext), settlement25-cells
/// (buildProvinceCells) and settlement25-combat (buildProvinceCombat). Each clipped land face of the
/// drawing mesh belongs to exactly one province (point-in-polygon of its centre).
public enum OpeningGovernment {
    static let f = Native.fr
    static let genericBiomeDefense: [Double] = [1, 2.5, 2.5, 1.3, 1, 1, 1, 1.2, 1.2, 1, 2, 4, 1.5]

    struct Group {
        let id: String; let polygon: [(Double, Double)]
        let minX: Double, maxX: Double, minY: Double, maxY: Double
        var counts = [Double](repeating: 0, count: 13)
        var land = [Int](), landSeen = Set<Int>()   // terrain: land vertices, insertion order
        var all = Set<Int>()                         // cells/combat: every face vertex
        var area = 0.0
    }
    static func contains(_ poly: [(Double, Double)], _ p: (Double, Double)) -> Bool {
        var inside = false, j = poly.count - 1
        for i in 0..<poly.count { let a = poly[i], b = poly[j]; if (a.1 > p.1) != (b.1 > p.1) && p.0 < (b.0 - a.0) * (p.1 - a.1) / (b.1 - a.1) + a.0 { inside.toggle() }; j = i }
        return inside
    }
    static func area(_ p: [(Double, Double)]) -> Double {
        var s = 0.0; for i in 0..<p.count { let a = p[i], b = p[(i + 1) % p.count]; s = s + a.0 * b.1 - b.0 * a.1 }; return abs(s) / 2
    }

    /// One pass over the mesh. `provinces`: world.provinces (id, polygon).
    static func scan(_ d: TerrainDocument, elevations h: [Int], ids: [UInt8], provinces: [JS], scale: Double) -> [Group] {
        let points = d.points.map { (f($0.0), f($0.1)) }
        var groups = provinces.map { p -> Group in
            let poly = p.polygon.asArray.map { ($0.x.asNumber, $0.y.asNumber) }
            return Group(id: p.id.asString, polygon: poly, minX: poly.map(\.0).min()!, maxX: poly.map(\.0).max()!, minY: poly.map(\.1).min()!, maxY: poly.map(\.1).max()!)
        }
        func cell(_ n: Double) -> Int { min(31, max(0, Int((n / 1000 * 32).rounded(.down)))) }
        var bins = [Int: [Int]]()
        for (k, g) in groups.enumerated() { for y in cell(g.minY)...cell(g.maxY) { for x in cell(g.minX)...cell(g.maxX) { bins[y * 32 + x, default: []].append(k) } } }
        var t = 0
        while t < d.triangles.count {
            let tri = [d.triangles[t], d.triangles[t + 1], d.triangles[t + 2]]; t += 3
            guard tri.contains(where: { h[$0] > 20 }) else { continue }
            var ring = [(Double, Double)]()
            for i in 0..<3 {
                let a = tri[i], b = tri[(i + 1) % 3], ha = h[a], hb = h[b]
                if ha >= 20 { ring.append(points[a]) }
                if (ha >= 20) != (hb >= 20) {
                    let lo = min(a, b), hi = max(a, b), u = Double(20 - h[lo]) / Double(h[hi] - h[lo])
                    ring.append((points[lo].0 + u * (points[hi].0 - points[lo].0), points[lo].1 + u * (points[hi].1 - points[lo].1)))
                }
            }
            let a = area(ring); if a < 1e-7 { continue }
            var sx = 0.0, sy = 0.0; for p in ring { sx += p.0; sy += p.1 }
            let center = (sx / Double(ring.count) * scale, sy / Double(ring.count) * scale)
            let matches = (bins[cell(center.1) * 32 + cell(center.0)] ?? []).filter { k in
                let g = groups[k]; if center.0 < g.minX || center.0 > g.maxX || center.1 < g.minY || center.1 > g.maxY { return false }
                return contains(g.polygon, center)
            }
            guard matches.count == 1 else { continue }
            let k = matches[0], land = tri.filter { h[$0] >= 20 }
            groups[k].area += a * scale * scale
            for v in land { groups[k].counts[Int(ids[v])] += a / Double(land.count); if groups[k].landSeen.insert(v).inserted { groups[k].land.append(v) } }
            for v in tri { groups[k].all.insert(v) }
        }
        return groups
    }

    /// nativeBiomeRatios.
    static func ratios(_ counts: [Double]) -> [Double] {
        var total = 0.0; for (i, n) in counts.enumerated() where i != 0 && n > 0 { total += n }
        return counts.enumerated().map { i, n in i != 0 && n > 0 && total > 0 ? f(f(n) / f(total)) : 0 }
    }
    /// analyzeElevation.
    static func elevation(_ heights: [Int]) -> (average: Double, deviation: Double, high: Double, veryHigh: Double, mountain: Bool, plateau: Bool) {
        let n = Double(heights.count); if heights.isEmpty { return (0, 0, 0, 0, false, false) }
        var sum = 0.0; for x in heights { sum += Double(x) }
        let average = f(sum / n), high = f(Double(heights.filter { $0 > 60 }.count) / n), veryHigh = f(Double(heights.filter { $0 > 80 }.count) / n)
        var acc = 0.0; for x in heights { let d = f(f(Double(x)) - average); acc += f(d * d) }
        let variance = f(f(acc) / f(n)), dev = f(variance.squareRoot())
        let mountain = (veryHigh >= f(0.15) || high >= f(0.30)) && dev > 5
        return (average, dev, high, veryHigh, mountain, average > 60 && !mountain)
    }

    /// terrainContext, finance cells (cellBiomes, seaNeighbor) and upperCombat provinces, keyed by province id in world order.
    public static func provinceGeography(_ d: TerrainDocument, elevations h: [Int], provinces: [JS], scale: Double) -> (terrain: JS, cells: [String: JS], combat: JS, order: [String]) {
        let ids = Climate.surface(d, elevations: h).ids
        let groups = scan(d, elevations: h, ids: ids, provinces: provinces, scale: scale)
        let terrain = JS.object(); terrain.version = JS(1); terrain.algorithm = JS("clipped-face-biome-area-v1")
        let tp = JS.object(), combat = JS.object(); var cells = [String: JS]()
        for g in groups {
            let e = elevation(g.land.map { h[$0] })
            let o = JS.object(); o.biomes = .array(ratios(g.counts).map { JS($0) })
            o.average = JS(e.average); o.deviation = JS(e.deviation); o.high = JS(e.high); o.veryHigh = JS(e.veryHigh); o.mountain = JS(e.mountain); o.plateau = JS(e.plateau)
            o.samples = JS(g.land.count); o.area = JS(g.area); tp[g.id] = o
            let vertices = g.all.sorted()
            let c = JS.object(); c.cellBiomes = .array(vertices.map { JS(Int(ids[$0])) })
            c.seaNeighbor = JS(vertices.contains { v in d.neighbors[v].contains { !g.all.contains($0) && h[$0] < 20 } }); cells[g.id] = c
            var counts = [Int](repeating: 0, count: 13), order = [Int]()
            for v in vertices { let b = Int(ids[v]); if counts[b] == 0 { order.append(b) }; counts[b] += 1 }
            var dominant = 0, maximum = 0; for b in order where counts[b] > maximum { maximum = counts[b]; dominant = b }
            let candidate = max(e.mountain ? 3 : e.plateau ? 1.5 : 1, f(genericBiomeDefense[dominant]))
            let p = JS.object(); p.biomeCounts = .array(counts.map { JS($0) }); p.biomeOrder = .array(order.map { JS($0) })
            p.storedDefense = JS(min(3, max(1, candidate))); p.locked = JS(false); p.manualSet = JS(false); p.manualFortress = JS(false)
            p.distance = JS(2147483647); p.connected = JS(false); combat[g.id] = p
        }
        terrain.provinces = tp
        return (terrain, cells, combat, groups.map(\.id))
    }
}

// MARK: Part 2 — population, resources, livelihood, first muster, first treasury, destiny
extension OpeningGovernment {
    static let populationCapacity: [Double] = [5, 0.5, 0.5, 4, 6, 8, 10, 6, 6, 4, 3, 0.5, 5]
    /// Resolved original resource table per biome id (Resources/Catalog/biome-resources.json).
    public static var resourceTable: [[JS]] = []
    public static func loadResources(_ data: Data) throws { resourceTable = try JS.parse(data).asArray.map(\.asArray) }

    static func seedFor(_ s: String) -> UInt32 { var h: UInt32 = 2166136261; for c in s.utf16 { h = (h ^ UInt32(c)) &* 16777619 }; return h }
    /// governmentRandom47.
    struct Stream {
        var h: UInt32
        init(_ seed: String) { h = OpeningGovernment.seedFor(seed) }
        mutating func next() -> Double {
            h = h &+ 0x6d2b79f5
            var t = (h ^ (h >> 15)) &* (h | 1)
            t ^= t &+ ((t ^ (t >> 7)) &* (t | 61))
            return Double(t ^ (t >> 14)) / 4294967296
        }
    }
    static func trunc(_ x: Double) -> Int { Int(Int32(truncatingIfNeeded: Int64(x.rounded(.towardZero)))) }
    /// openingPopulation47 (nativeInitialPopulation for a fresh province).
    static func population(_ seed: String, _ nation: String, _ province: String, _ biomes: [Int]) -> (population: Int, max: Int) {
        var a = Stream("\(seed)/population/\(nation)"), b = Stream("\(seed)/population/\(province)")
        let state = f(0.7 + a.next() * 0.2), local = f(0.9 + b.next() * 0.15)
        var sum = f(0); for x in biomes { sum = f(sum + populationCapacity[x]) }
        let maxPop = max(1, trunc(f(f(f(100) * sum) + f(5000))))
        var p = trunc(f(f(f(Double(maxPop)) * f(state)) * f(local)))
        p = trunc(f(f(Double(p)) * f(1.002)))
        let minimum = f(f(Double(maxPop)) * f(0.3))
        if p > maxPop { p = maxPop } else if minimum > f(Double(p)) { p = trunc(minimum) }
        return (p, maxPop)
    }
    /// nativeInitialResources.
    static func resources(_ biomes: [Int], seaNeighbor: Bool, _ random: inout Stream) -> JS {
        var order = [Int](), counts = [Int: Int]()
        for b in biomes { if counts[b] == nil { order.append(b) }; counts[b, default: 0] += 1 }
        var names = [String](), selected = [String: JS]()
        func sample(_ biome: Int, _ ratio: Double) {
            for c in (resourceTable.indices.contains(biome) ? resourceTable[biome] : []) {
                let draw = random.next(), weight = f(ratio * f(c.probability.asNumber))
                if draw >= weight { continue }
                let name = c.name.asString
                if let e = selected[name] { e.probability = JS(f(e.probability.asNumber + weight)); e.baseValue = JS(max(e.baseValue.asInt, c.baseValue.asInt)) }
                else { let o = JS.object(); o.name = c.name; o.baseValue = c.baseValue; o.probability = JS(weight); o.affectedBy = c.affectedBy.clone(); selected[name] = o; names.append(name) }
            }
        }
        for b in order { sample(b, f(f(Double(counts[b]!)) / f(Double(biomes.count)))) }
        if seaNeighbor { sample(0, f(0.3)) }
        var sum = 0.0; for n in names { sum += selected[n]!.probability.asNumber }
        let total = f(sum)
        for n in names { selected[n]!.probability = JS(f(selected[n]!.probability.asNumber / total)) }
        return .array(names.map { selected[$0]! })
    }
    /// terrainLivelihood47.
    static func livelihood(_ ids: [String], _ cells: [String: JS]) -> String {
        var counts = [Int](repeating: 0, count: 13), coastal = 0
        for id in ids { let p = cells[id]!; if p.seaNeighbor.isTruthy { coastal += 1 }; for b in p.cellBiomes.asArray { counts[b.asInt] += 1 } }
        let land = Double(counts[1...].reduce(0, +))
        if Double(coastal) / Double(ids.count) >= 0.5 { return "Maritime" }
        if Double(counts[1] + counts[2] + counts[4]) / land >= 0.5 { return "Nomadic" }
        if Double(counts[3] + counts[5] + counts[6] + counts[8] + counts[12]) / land >= 0.5 { return "Agriculture" }
        if Double(counts[7] + counts[9] + counts[10]) / land >= 0.5 { return "FishAndHunting" }
        return "Other"
    }
    static let unitKeys = ["Infantry", "Archer", "Shield", "Cavalry", "Elite"], unitNames = ["步兵", "弓兵", "盾兵", "骑兵", "精锐"]

    /// attachGovernment47 without the army positions (part 3). Mutates `r` (world, statecraft, armies,
    /// events) and adds units, tactics, upperCombat, finance, economy, destiny and governmentOpening.
    public static func attach(_ r: JS, terrain: JS, cells: [String: JS], combat: JS) {
        let w = r.world, seed = w.custom.seed.asString
        let upper = JS.object(); upper.version = JS(1); upper.initialization = JS("native-combat-web-inputs-v1")
        let un = JS.object()
        for n in w.nations.asArray {
            let o = JS.object(); o.polity = r.civilization.nations[n.id.asString].polity.clone(); o.traits = .array(); o.destiny = JS(0); o.coreThreshold = JS(2); o.coreYear = JS(0); o.provinceOrder = .array()
            un[n.id.asString] = o
        }
        upper.nations = un; upper.armies = .object(); upper.provinces = combat
        r.upperCombat = upper
        Wars.reconcileCore(r)
        let finance = JS.object(); finance.version = JS(1); finance.initialization = JS("native-fiscal-web-cells-v1"); finance.provinces = .object(); finance.nations = .object()
        let opening = JS.object(); opening.version = JS(1); opening.rule = JS("population-muster-first-gold-v1"); opening.population = .object(); opening.recruitments = .array(); opening.accounts = .object()
        var data = [String: JS](); for s in w.statecraft.provinces.asArray { data[s.provinceId.asString] = s }
        for p in w.provinces.asArray {
            let id = p.id.asString, c = cells[id]!, biomes = c.cellBiomes.asArray.map(\.asInt)
            let next = population(seed, p.controller.asString, id, biomes)
            var random = Stream("\(seed)/resources/\(id)")
            let fp = JS.object(); fp.cellBiomes = c.cellBiomes.clone(); fp.seaNeighbor = c.seaNeighbor.clone(); fp.maxPopulation = JS(next.max)
            fp.resources = resources(biomes, seaNeighbor: c.seaNeighbor.isTruthy, &random)
            finance.provinces[id] = fp
            opening.population[id] = JS(next.population); data[id]!.population = JS(next.population); data[id]!.grain = JS(next.population * 20)
        }
        // initialEconomy47 (every nation on terrain choice).
        let economy = JS.object(); economy.version = JS(1); economy.rule = JS("terrain-or-player-livelihood-v1"); economy.revision = JS(0)
        let en = JS.object()
        for n in w.nations.asArray {
            let id = n.id.asString, ids = w.provinces.asArray.filter { $0.controller.asString == id && $0.legalOwner.asString == id }.map(\.id.asString)
            let o = JS.object(); o.ethnic = JS(livelihood(ids, cells)); o.source = JS("terrain-start"); o.provinceIds = .array(ids.map { JS($0) }); en[id] = o
        }
        economy.nations = en
        // emptyTactics47 + musterFoundingArmies47.
        r.units = .object()
        let tactics = JS.object(); tactics.version = JS(1); tactics.nextArmyId = JS(1); tactics.seed = JS(147901); tactics.rounds = .object(); tactics.unopposed = JS("takeover"); tactics.forces = .object()
        let mob = JS.object(); for n in w.nations.asArray { let m = JS.object(); m.lastMonth = .null; m.recent = .array(); mob[n.id.asString] = m }
        tactics.mobilizations = mob; r.tactics = tactics
        var next = 1
        for n in w.nations.asArray {
            let id = n.id.asString
            let land = w.provinces.asArray.filter { $0.controller.asString == id && $0.legalOwner.asString == id }
            let target = land.isEmpty ? 0 : max(1, Int((Double(land.count) * f(2.0 / 3)).rounded(.down)))
            var formed = 0, costs = 0
            for p in land {
                if formed >= target || w.armies.length >= 500 { break }
                let pid = p.id.asString, d = data[pid]!
                let pops = w.statecraft.provinces.asArray.map(\.population.asNumber).sorted(), mid = pops.count >> 1
                let median = pops.count % 2 == 1 ? pops[mid] : (pops[mid - 1] + pops[mid]) / 2
                let troops = Muster.legionStrength(d.population.asNumber, median: median), cost = Int((Double(troops) / 10).rounded(.toNearestOrAwayFromZero))
                if d.population.asNumber < Double(cost) { continue }
                let armyId = "force-\(next)"; next += 1
                let unit = (next - 2) % 5
                let name = (w.cities.asArray.first { $0.provinceId.asString == pid }?.name.asString ?? p.name.asString) + unitNames[unit]
                let a = JS.object(); a.id = JS(armyId); a.name = JS(name); a.nationId = JS(id); a.provinceId = JS(pid); a.originId = JS(pid); a.troops = JS(troops)
                a.morale = JS(80); a.supplies = JS(100); a.status = JS("idle"); a.route = .array(); a.progress = JS(0)
                w.armies.push(a)
                r.units[armyId] = JS(unitKeys[unit])
                let force = JS.object(); force.homeId = JS(pid); force.kind = JS("regular"); force.fullStrength = JS(troops); tactics.forces[armyId] = force
                d.population = JS(d.population.asNumber - Double(cost)); formed += 1; costs += cost
                let rc = JS.object(); rc.armyId = JS(armyId); rc.nationId = JS(id); rc.homeId = JS(pid); rc.troops = JS(troops); rc.populationCost = JS(cost); opening.recruitments.push(rc)
                tactics.nextArmyId = JS(next)
            }
            if formed > 0 {
                let e = JS.object(); e.id = w.nextEventId.clone(); w.nextEventId = JS(w.nextEventId.asNumber + 1); e.day = JS(0); e.kind = JS("system")
                e.text = JS("\(n.name.asString)新编\(formed)支常备军"); e.reason = JS("按领土三分之二目标与故乡编制征集；显示兵力为内部值×10，本次扣内部人口\(costs)。粮储未扣；持续供给仍按网页经济结算。")
                w.events.push(e); let all = w.events.asArray; if all.count > 160 { w.events = .array(Array(all.suffix(160))) }
            }
        }
        for a in w.armies.asArray { let o = JS.object(); o.base = JS(1.25); o.initializedTick = JS(0); upper.armies[a.id.asString] = o }
        // First treasury settlement (destiny 0).
        r.finance = finance
        for n in w.nations.asArray {
            let id = n.id.asString, polity = r.civilization.nations[id].polity.asString, ethnic = en[id].ethnic.asString
            let owned = un[id].provinceOrder.asArray.map(\.asString)
            let incomes = owned.map { pid -> Int in
                let p = finance.provinces[pid]
                let resources = p.resources.asArray.map { Treasury.Resource(base: $0.baseValue.asInt, probability: $0.probability.asNumber, affectedBy: $0.affectedBy.asArray.map(\.asString)) }
                return Treasury.provinceIncome(Treasury.ProvinceInput(population: data[pid]!.population.asInt, capacity: p.maxPopulation.asInt, cells: p.cellBiomes.length, resources: resources, local: 1),
                                               ethnic: ethnic, destiny: 0, nationProvinces: owned.count, worldProvinces: w.provinces.length)
            }
            let tax = Daily.taxMultiplier(r, id), production = Daily.goldProduction[polity]!
            let out = Treasury.settle(gold: 0, incomes: incomes, tax: tax, central: 1, armyCost: 0, production: production, ethnic: ethnic)
            let input = JS.object(); input.gold = JS(0); input.provinceIncome = .array(incomes.map { JS($0) }); input.leaderTaxMultiplier = JS(tax); input.centralIncomeMultiplier = JS(1)
            input.armyCostGold = JS(0); input.goldProductionModifier = JS(production); input.ethnic = JS(ethnic)
            let acc = JS.object(); acc.polity = JS(polity); acc.destiny = JS(0); acc.input = input; opening.accounts[id] = acc
            let l = JS.object(); l.gold = JS(out.gold); l.goldPerMonth = JS(out.goldPerMonth); l.armyCostGold = JS(0); l.goldBattleModifier = JS(out.goldBattleModifier)
            l.baseIncome = JS(out.baseIncome); l.inventoryFactor = JS(out.inventoryFactor); l.goldBeforeArmyCost = JS(out.goldBeforeArmyCost)
            l.day = JS(0); l.openingGold = JS(0); l.reorganizationCost = JS(0); l.distanceSuspended = JS(owned.contains { !upper.provinces[$0].connected.isTruthy })
            let fn = JS.object(); fn.gold = JS(out.gold); fn.goldPerMonth = JS(out.goldPerMonth); fn.armyCostGold = JS(0); fn.goldBattleModifier = JS(out.goldBattleModifier)
            fn.initializedDay = JS(0); fn.lastMonth = JS(0); fn.ledger = l; finance.nations[id] = fn
        }
        // openingDestiny47.
        let destiny = JS.object(); destiny.version = JS(1); destiny.schedule = JS("web-30-day-v1"); destiny.revision = JS(0); destiny.nations = .object()
        for n in w.nations.asArray {
            let id = n.id.asString
            var stream = Destiny.Random(seed: seedFor("\(seed)/destiny20/\(id)"))
            let decrease = stream.floatRange(0.083, 0.24)
            var value = Destiny.Random(seed: stream.seed)
            var count = value.intRange(2, 5); count = Native.i32(count - 1)
            let d = Double(value.intRange(10, 90)), dec = value.floatRange(0.043, 0.28)
            _ = decrease
            let o = JS.object(); o.destiny = JS(d); o.decrease = JS(dec); o.manifestCount = JS(count); o.manifest = JS(false); o.seed = JS(Double(value.seed))
            o.initializedDay = JS(0); o.lastMonth = JS(0); o.restorations = JS(0); o.resets = JS(0); o.ledger = .null
            r.tactics.mobilizations[id].recent = .array(); un[id].destiny = JS(d)
            destiny.nations[id] = o; destiny.revision = JS(destiny.revision.asNumber + 1)
        }
        r.terrainContext = terrain; r.economy = economy; r.destiny = destiny; r.governmentOpening = opening
    }
}
