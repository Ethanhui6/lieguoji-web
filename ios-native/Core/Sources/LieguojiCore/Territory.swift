import Foundation

/// Stable sort by a strict "comes before" predicate, ties keeping their order (Array.prototype.sort).
func stableSorted<T>(_ items: [T], by before: (T, T) -> Bool) -> [T] {
    items.enumerated().sorted { before($0.element, $1.element) || (!before($1.element, $0.element) && $0.offset < $1.offset) }.map(\.element)
}

/// Family territory redistribution (civilization47-nobility-territory, State.AdvanceOneMonth →
/// RedistributeTerritoriesForState): every 24 months, first after a random 1…24, a state's land is
/// re-planned among its families by strength and war contribution — seeds, breadth-first growth,
/// closest fill, leftovers — and the new holdings, homes and a chronicle entry are written.
extension Nobility {
    static let polities = ["Kingdom", "Empire", "Federation", "Republic", "Tribal", "Theocracy"]
    static func maxProvinceRatio(_ polity: String) -> Double { f([0.4, 0.5, 0.25, 0.2, 0.45, 0.45][polities.firstIndex(of: polity)!]) }
    static func warContribution(_ n: JS, _ nation: String, _ id: String, _ fam: JS) -> Double { f(People.warMerit(fam) + (n.warContributions[nation][id].optionalNumber ?? 0)) }
    typealias Point = (x: Double, y: Double)
    static func dist(_ a: Point, _ b: Point) -> Double { f(jsHypot(f(a.x - b.x), f(a.y - b.y))) }
    final class Target {
        let id: String, fam: JS, score: Double, maxAllowed: Int, center: Point
        var targetCount: Int, remaining: Int, seed: String?, hadLand: Bool
        init(id: String, fam: JS, score: Double, targetCount: Int, maxAllowed: Int, center: Point, hadLand: Bool) {
            self.id = id; self.fam = fam; self.score = score; self.targetCount = targetCount; self.remaining = targetCount; self.maxAllowed = maxAllowed; self.center = center; self.hadLand = hadLand
        }
    }

    /// stateNobilityMonth47.
    public static func stateMonth(_ r: JS, _ nation: String) {
        let n = r.nobility
        if n.isNull || !stateAlive(r, nation) { return }
        var months = n.redistribution[nation].optionalNumber.map { Int($0) } ?? -1
        if months < 0 { months = Random(n: n).intRange(1, 25) }
        months -= 1
        if months <= 0 { redistribute(r, n, nation); months = 24 }
        n.redistribution[nation] = JS(months)
    }
    static func redistribute(_ r: JS, _ n: JS, _ nation: String) {
        let orderValue = r.upperCombat.nations[nation].provinceOrder
        let order = orderValue.isNull ? r.world.provinces.asArray.map(\.id.asString) : orderValue.asArray.map(\.asString)
        var controller = [String: String](), pos = [String: Point](), population = [String: Double](), neighbors = [String: [String]]()
        for p in r.world.provinces.asArray {
            let id = p.id.asString
            controller[id] = p.controller.asString; pos[id] = (p.center.x.asNumber, p.center.y.asNumber); neighbors[id] = p.neighbors.asArray.map(\.asString)
        }
        for p in (r.world.statecraft.provinces.isNull ? [] : r.world.statecraft.provinces.asArray) { population[p.provinceId.asString] = p.population.asNumber }
        let land = order.filter { controller[$0] == nation }
        let families = n.families.objectEntries.filter { $0.1.nationId.asString == nation }
        if land.isEmpty || families.isEmpty { return }
        func pop(_ id: String) -> Double { population[id] ?? 0 }
        var owner = [String: String]()
        for (id, fam) in families { for p in fam.controlledProvinces.asArray.map(\.asString) { owner[p] = id } }
        let targets = buildTargets(r, n, nation, families, land, pos, pop)
        if targets.isEmpty { return }
        let plan = allocate(targets, land, pos, pop, neighbors) { controller[$0] == nation }
        var planned = [String: String]()
        for t in targets { for p in plan[t.id]! { planned[p] = t.id } }
        let before = Dictionary(uniqueKeysWithValues: targets.map { ($0.id, $0.fam.controlledProvinces.length) })
        for p in land {
            let now = planned[p], old = owner[p]
            if now == old { continue }
            if let old { let fam = n.families[old]; fam.controlledProvinces.asArray.remove(at: fam.controlledProvinces.asArray.firstIndex { $0.asString == p }!) }
            if let now { n.families[now].controlledProvinces.push(JS(p)) }
        }
        for t in targets { if let list = plan[t.id], !list.isEmpty { updateHome(t.fam, list, pos) } }
        var changed = false
        for t in targets where t.fam.controlledProvinces.length - before[t.id]! != 0 { changed = true }
        let moved = land.filter { owner[$0] != planned[$0] }.count
        if changed && moved > 0 {
            let ranked = stableSorted(targets) { warContribution(n, nation, $0.id, $0.fam) > warContribution(n, nation, $1.id, $1.fam) }
            func name(_ t: Target) -> String { "\(r.kin.families[t.id].surname.optionalString ?? "")家族" }
            let state = r.world.nations.asArray.first { $0.id.asString == nation }!.name.asString
            People.recordHistory(r, kind: "family", text: "\(state)进行领土重新分配，\(name(ranked[0]))战功最高，\(name(ranked[ranked.count - 1]))战功最低", reason: "\(state)进行领土重新分配，涉及\(moved)个省份", nations: [nation], province: nil)
        }
        n.warContributions[nation] = .object()
    }
    static func buildTargets(_ r: JS, _ n: JS, _ nation: String, _ families: [(String, JS)], _ land: [String], _ pos: [String: Point], _ pop: (String) -> Double) -> [Target] {
        var ratio = maxProvinceRatio(r.civilization.nations[nation].polity.asString)
        if !families.isEmpty && f(Double(families.count) * ratio) < f(0.9) { let v = f(f(0.9) / Double(families.count)); ratio = 0 > v ? 0 : v > 1 ? 1 : v }
        let maxAllowed = max(1, Native.roundInt(f(Double(land.count) * ratio)))
        let scored = families.map { id, fam -> (id: String, fam: JS, score: Double, hadLand: Bool) in
            var s = f(max(0, f(People.strength(fam) * f(0.05))) + max(0, warContribution(n, nation, id, fam)))
            if !s.isFinite { s = 0 }
            return (id, fam, f(max(f(0.01), s)), fam.controlledProvinces.asArray.contains { land.contains($0.asString) })
        }
        var total = 0.0; for s in scored { total = f(total + s.score) }
        if !(total > 0) { total = f(Double(scored.count)) }
        var targets = [Target](), remainders = [(id: String, rest: Double)](), assigned = 0
        for s in scored {
            let share = total > 0 ? f(s.score / total) : f(1 / Double(scored.count)), exact = f(Double(land.count) * share), low = s.hadLand ? 1 : 0
            var count = Native.roundInt(exact); count = count < low ? low : count > maxAllowed ? maxAllowed : count
            targets.append(Target(id: s.id, fam: s.fam, score: s.score, targetCount: count, maxAllowed: maxAllowed, center: desiredCenter(r, s.fam, land, pos, nation), hadLand: s.hadLand))
            assigned += count; remainders.append((s.id, f(exact - Double(count))))
        }
        var diff = land.count - assigned
        if diff > 0 {
            let order = stableSorted(remainders) { $0.rest > $1.rest }
            var progress = true
            while progress && diff > 0 {
                progress = false
                for p in order {
                    if diff == 0 { break }
                    let t = targets.first { $0.id == p.id }!
                    if t.targetCount < maxAllowed { t.targetCount += 1; t.remaining += 1; diff -= 1; progress = true }
                }
            }
        } else if diff < 0 {
            for t in stableSorted(targets, by: { $0.score < $1.score }) {
                if diff == 0 { break }
                if t.targetCount > (t.hadLand ? 1 : 0) { t.targetCount -= 1; t.remaining = max(0, t.remaining - 1); diff += 1 }
            }
        }
        if targets.allSatisfy({ $0.targetCount == 0 }) { let t = stableSorted(targets, by: { $0.score > $1.score })[0]; t.targetCount = 1; t.remaining = 1; t.hadLand = true }
        var used = Set<String>()
        let random = Random(n: r.nobility)
        for t in targets where t.targetCount > 0 {
            t.seed = selectSeed(t, land, &used, pos, pop)
            if t.seed == nil && !land.isEmpty { t.seed = land[random.intRange(0, land.count)] }
        }
        return targets
    }
    static func desiredCenter(_ r: JS, _ fam: JS, _ land: [String], _ pos: [String: Point], _ nation: String) -> Point {
        var x = 0.0, y = 0.0, count = 0
        for p in fam.controlledProvinces.asArray.map(\.asString) where land.contains(p) { let v = pos[p]!; x = f(x + v.x); y = f(y + v.y); count += 1 }
        if count > 0 { return (f(x / Double(count)), f(y / Double(count))) }
        if let home = fam.homeProvinceId.optionalString, let v = pos[home] { return v }
        let capitalId = r.world.nations.asArray.first { $0.id.asString == nation }?.capitalId.optionalString
        if let capital = r.world.cities.asArray.first(where: { $0.id.optionalString == capitalId }) { return (capital.position.x.asNumber, capital.position.y.asNumber) }
        return (0, 0)
    }
    static func selectSeed(_ t: Target, _ land: [String], _ used: inout Set<String>, _ pos: [String: Point], _ pop: (String) -> Double) -> String? {
        var best: String?, score = -3.4028234663852886e38
        let held = Set(t.fam.controlledProvinces.asArray.map(\.asString)), home = t.fam.homeProvinceId.optionalString
        for p in land where !used.contains(p) {
            var s: Double = held.contains(p) ? 200 : 0
            if p == home { s = f(s + 150) }
            s = f(f(pop(p) / 10000) + f(s - dist(pos[p]!, t.center)))
            if s > score { score = s; best = p }
        }
        if let best { used.insert(best) }
        return best
    }
    static func evaluate(_ t: Target, _ p: String, _ planned: Set<String>, _ pos: [String: Point], _ pop: (String) -> Double, _ neighbors: [String: [String]]) -> Double {
        var s: Double = !planned.isEmpty && (neighbors[p] ?? []).contains(where: { planned.contains($0) }) ? 200 : 0
        s = f(f(f(s - dist(pos[p]!, t.center)) + f(pop(p) / 10000)))
        if p == t.fam.homeProvinceId.optionalString { s = f(s + 25) }
        return f(f(t.score * f(0.05)) + s)
    }
    static func allocate(_ targets: [Target], _ land: [String], _ pos: [String: Point], _ pop: (String) -> Double, _ neighbors: [String: [String]], inState: (String) -> Bool) -> [String: [String]] {
        var plan = [String: [String]](), sets = [String: Set<String>](), queues = [String: [String]]()
        var unassigned = land, unassignedSet = Set(land)
        func remove(_ p: String) { if unassignedSet.remove(p) != nil { unassigned.removeAll { $0 == p } } }
        func assign(_ p: String, _ t: Target) { if !sets[t.id]!.contains(p) { plan[t.id]!.append(p); sets[t.id]!.insert(p) }; remove(p) }
        func enqueue(_ t: Target, _ p: String) { queues[t.id, default: []].append(p) }
        for t in targets { plan[t.id] = []; sets[t.id] = [] }
        for t in targets where t.targetCount > 0 { guard let seed = t.seed else { continue }; assign(seed, t); t.remaining = max(0, t.targetCount - 1); queues[t.id] = [seed] }
        var progress = true
        while progress {
            progress = false
            for t in targets {
                guard t.remaining > 0, var q = queues[t.id], !q.isEmpty else { continue }
                let layer = q.count
                var i = 0
                while i < layer && t.remaining > 0 {
                    let id = q.removeFirst()
                    for nb in neighbors[id] ?? [] {
                        if t.remaining <= 0 { break }
                        if !unassignedSet.contains(nb) || !inState(nb) { continue }
                        assign(nb, t); q.append(nb); t.remaining -= 1; progress = true
                    }
                    i += 1
                }
                queues[t.id] = q
            }
        }
        if !unassigned.isEmpty {
            for t in stableSorted(targets.filter { $0.remaining > 0 }, by: { $0.score > $1.score }) {
                while t.remaining > 0 && !unassigned.isEmpty {
                    var best: String?, score = -3.4028234663852886e38
                    for p in unassigned {
                        if !inState(p) { remove(p); continue }
                        let s = evaluate(t, p, sets[t.id]!, pos, pop, neighbors)
                        if s > score { score = s; best = p }
                    }
                    guard let best else { break }
                    assign(best, t); enqueue(t, best); t.remaining -= 1
                }
            }
        }
        for p in unassigned {
            if !inState(p) { remove(p); continue }
            let under = targets.contains { sets[$0.id]!.count < $0.maxAllowed }
            var best: Target?, score = -3.4028234663852886e38
            for t in targets {
                if under && sets[t.id]!.count >= t.maxAllowed { continue }
                var s = evaluate(t, p, sets[t.id]!, pos, pop, neighbors)
                if t.remaining > 0 { s = f(s + 50) }
                if s > score { score = s; best = t }
            }
            if let best { assign(p, best); enqueue(best, p); best.remaining = max(0, best.remaining - 1) }
        }
        return plan
    }
    static func updateHome(_ fam: JS, _ list: [String], _ pos: [String: Point]) {
        var x = 0.0, y = 0.0
        for p in list { let v = pos[p]!; x = f(x + v.x); y = f(y + v.y) }
        let c = (x: f(x / Double(list.count)), y: f(y / Double(list.count)))
        var home = list[0], best = 3.4028234663852886e38
        for p in list { let d = dist(pos[p]!, c); if best > d { best = d; home = p } }
        fam.homeProvinceId = JS(home)
    }
}
