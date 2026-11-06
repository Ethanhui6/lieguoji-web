import Foundation

/// The compact state the app's views read (src/native-bridge/engine.ts state()), from the Swift run.
extension NativeEngine {
    static func hash(_ s: String) -> UInt32 { var h: UInt32 = 2166136261; for c in s.utf16 { h = (h ^ UInt32(c)) &* 16777619 }; return h }
    static func inside(_ x: Double, _ y: Double, _ ring: [(Double, Double)]) -> Bool {
        var r = false, j = ring.count - 1
        for i in ring.indices { let a = ring[i], b = ring[j]; if (a.1 > y) != (b.1 > y) && x < (b.0 - a.0) * (y - a.1) / (b.1 - a.1) + a.0 { r.toggle() }; j = i }
        return r
    }
    /// army-wander47 wanderPoint: a stationary army's fixed display point inside its province.
    static var wanderCache = [String: (Double, Double)]()
    static func wanderPoint(_ polygon: [(Double, Double)], _ armyId: String, avoid: [(Double, Double)]) -> (Double, Double) {
        if polygon.isEmpty { return (0, 0) }
        let minX = polygon.map(\.0).min()!, maxX = polygon.map(\.0).max()!, minY = polygon.map(\.1).min()!, maxY = polygon.map(\.1).max()!
        var h = hash(armyId), fallback: (Double, Double)?
        let clear = min(maxX - minX, maxY - minY) * 0.22
        for _ in 0..<32 {
            h = (h ^ (h >> 15)) &* 2246822519
            let u = Double(h & 0xffff) / 0x10000, v = Double(h >> 16) / 0x10000
            let p = (minX + (maxX - minX) * (0.15 + 0.7 * u), minY + (maxY - minY) * (0.15 + 0.7 * v))
            if !inside(p.0, p.1, polygon) { continue }
            if avoid.allSatisfy({ abs(p.0 - $0.0) > clear * 1.6 || p.1 - $0.1 > clear * 0.6 || $0.1 - p.1 > clear * 1.2 }) { return p }
            if fallback == nil { fallback = p }
        }
        if let fallback { return fallback }
        return (polygon.map(\.0).reduce(0, +) / Double(polygon.count), polygon.map(\.1).reduce(0, +) / Double(polygon.count))
    }

    /// state-line fmsStateLineColor: AdjustColor(AdjustColor(colour, +0.1 s, −0.05 v), +0.2 s, −0.2 v).
    /// ColorUtils.AdjustColor (RGB → HSV, saturation + ds, value − dv, back), on 0…1 components.
    public static func adjustColor(_ c: (Double, Double, Double), _ ds: Double, _ dv: Double) -> (Double, Double, Double) {
        let (r, g, b) = c, mx = max(r, g, b), mn = min(r, g, b), d = mx - mn
        var h = 0.0
        if d > 0 { h = mx == r ? ((g - b) / d) / 6 : mx == g ? (2 + (b - r) / d) / 6 : (4 + (r - g) / d) / 6; if h < 0 { h += 1 } }
        let s = min(1, max(0, (mx > 0 ? d / mx : 0) + ds)), val = min(1, max(0, mx - dv))
        let sector = h * 6, i = Int(sector.rounded(.down)) % 6, f = sector - sector.rounded(.down)
        let p = val * (1 - s), q = val * (1 - s * f), t = val * (1 - s * (1 - f))
        return [(val, t, p), (q, val, p), (p, val, t), (p, q, val), (t, p, val), (val, p, q)][i]
    }
    static func stateLineColor(_ css: String) -> String {
        let v = Int(css.dropFirst(), radix: 16) ?? 0x999999
        func adjust(_ c: (Double, Double, Double), _ ds: Double, _ dv: Double) -> (Double, Double, Double) {
            let (r, g, b) = c, mx = max(r, g, b), mn = min(r, g, b), d = mx - mn
            var h = 0.0
            if d > 0 { h = mx == r ? ((g - b) / d) / 6 : mx == g ? (2 + (b - r) / d) / 6 : (4 + (r - g) / d) / 6; if h < 0 { h += 1 } }
            let s = min(1, max(0, (mx > 0 ? d / mx : 0) + ds)), val = min(1, max(0, mx - dv))
            let sector = h * 6, i = Int(sector.rounded(.down)) % 6, f = sector - sector.rounded(.down)
            let p = val * (1 - s), q = val * (1 - s * f), t = val * (1 - s * (1 - f))
            return [(val, t, p), (q, val, p), (p, val, t), (p, q, val), (t, p, val), (val, p, q)][i]
        }
        let c = adjust(adjust((Double(v >> 16 & 255) / 255, Double(v >> 8 & 255) / 255, Double(v & 255) / 255), 0.1, 0.05), 0.2, 0.2)
        return String(format: "#%02x%02x%02x", Int((c.0 * 255).rounded()), Int((c.1 * 255).rounded()), Int((c.2 * 255).rounded()))
    }
    /// original-labels47 stateLabelBoxes47 over the label grid of the statics (cell → land province).
    func labels(_ owners: [Int]) -> JS {
        let grid = statics.labelGrid
        if grid.isNull { return .array() }
        let cellsX = grid.cellsX.asInt, pts = grid.points.asArray.map(\.asNumber), cells = grid.cells.asArray.map(\.asInt)
        let n = cells.count, unit = 1600.0 / 240.0
        func group(_ c: Int) -> Int? { cells[c] >= 0 && owners[cells[c]] >= 0 ? owners[cells[c]] : nil }
        var order = [Int](), groups = [Int: [Int]]()
        for c in 0..<n { guard let k = group(c) else { continue }; if groups[k] == nil { order.append(k) }; groups[k, default: []].append(c) }
        var singles = [Int: Int](); for o in owners { singles[o, default: 0] += 1 }
        var out = [JS]()
        for k in order {
            let list = groups[k]!
            if singles[k] == 1 && list.count < 30 { continue }
            var cx = 0.0, cy = 0.0; for c in list { cx += pts[2 * c]; cy += pts[2 * c + 1] }; cx /= Double(list.count); cy /= Double(list.count)
            var pole = list[0], best = Double.infinity
            for c in list { let d = pow(pts[2 * c] - cx, 2) + pow(pts[2 * c + 1] - cy, 2); if d < best { best = d; pole = c } }
            var start = pole, end = pole
            while start % cellsX > 0 && group(start - 1) == k { start -= 1 }
            while (end + 1) % cellsX > 0 && end + 1 < n && group(end + 1) == k { end += 1 }
            let length = abs(pts[2 * end] - pts[2 * start]) / unit, width = length * 0.6, height = max(width / 3, 1.5)
            let scale = (Double(min(2400, max(500, list.count))) - 500) / 1900
            let o = JS.object()
            o.nation = JS(k); o.x = JS((pts[2 * start] + pts[2 * end]) / 2); o.y = JS((pts[2 * start + 1] + pts[2 * end + 1]) / 2)
            o.width = JS(width); o.height = JS(height); o.fontMax = JS(25 + 15 * min(1, max(0, scale))); o.fontMin = JS(15)
            out.append(o)
        }
        return .array(out)
    }

    /// state(): day, date, owners (and labels when they changed), nations, armies, wars, sieges, events.
    public func state(includeLabels: Bool) -> Data {
        let r = run, w = r.world, sc = r.scale.asNumber
        let nations = w.nations.asArray, provinces = w.provinces.asArray
        var ni = [String: Int](); for (i, n) in nations.enumerated() { ni[n.id.asString] = i }
        var pi = [String: Int](); for (i, p) in provinces.enumerated() { pi[p.id.asString] = i }
        let owners = provinces.map { ni[$0.controller.asString] ?? -1 }
        var stock = [String: JS](); for s in w.statecraft.provinces.asArray { stock[s.provinceId.asString] = s }
        func atWar(_ a: String, _ b: String) -> Bool { RunWindow.atWar(r, a, b) }
        let o = JS.object()
        o.day = w.day; o.date = r.life.currentDate; o.owners = .array(owners.map { JS($0) })
        if includeLabels { o.labels = labels(owners) }
        o.nations = .array(nations.map { n in
            let id = n.id.asString, own = provinces.filter { $0.controller.asString == id }, ownIds = Set(own.map(\.id.asString))
            let x = JS.object()
            // Identity for the map legend: states founded during play are not in the opening map.
            let civ = r.civilization.nations[id], color = n.color.optionalString ?? "#999999"
            x.id = n.id; x.name = n.name; x.color = JS(color); x.line = JS(Self.stateLineColor(color))
            x.capital = JS(w.cities.asArray.firstIndex { $0.id.optionalString == n.capitalId.optionalString } ?? -1)
            x.culture = JS(civ.cultureId.optionalString ?? ""); x.polity = JS(civ.polity.optionalString ?? ""); x.religion = JS(civ.religionId.optionalString ?? "")
            x.provinces = JS(own.count); x.cities = JS(w.cities.asArray.filter { ownIds.contains($0.provinceId.asString) }.count)
            x.population = JS(own.reduce(0.0) { $0 + (stock[$1.id.asString]?.population.optionalNumber ?? 0) })
            x.grain = JS(own.reduce(0.0) { $0 + (stock[$1.id.asString]?.grain.optionalNumber ?? 0) })
            x.troops = JS(w.armies.asArray.filter { $0.nationId.asString == id && $0.status.asString != "destroyed" }.reduce(0.0) { $0 + $1.troops.asNumber })
            x.gold = JS(r.finance.nations[id].gold.optionalNumber ?? 0); x.destiny = JS(r.destiny.nations[id].destiny.optionalNumber ?? 0)
            x.enemies = .array(nations.filter { $0.id.asString != id && atWar(id, $0.id.asString) }.map { JS(ni[$0.id.asString]!) }); x.alive = JS(!own.isEmpty)
            return x
        })
        var spots = [String: [(Double, Double)]]()
        for c in w.cities.asArray { spots[c.provinceId.asString, default: []].append((c.position.x.asNumber, c.position.y.asNumber)) }
        let space = Armies.space(r), bridge = Armies.bridge
        // Armies in contact stand where they fight (the original draws the clash between them);
        // only resting armies use the province's display spot.
        let engaged = Set(r.forceContacts.pairs.asArray.flatMap { [$0.a.asString, $0.b.asString] })
        // Two armies in contact share a province (the original's battle rule), possibly far apart:
        // each is drawn at the middle of its clashes, half an icon back towards its own side, so the
        // two icons meet where the battle plays. Presentation only.
        var clash = [String: (x: Double, y: Double, n: Double)]()
        let halfIcon = 2.4 * sc
        func aim(_ k: String, _ x: Double, _ y: Double) { let o = clash[k] ?? (0, 0, 0); clash[k] = (o.x + x, o.y + y, o.n + 1) }
        for c in r.forceContacts.pairs.asArray where !c.pointA.isNull && !c.pointB.isNull {
            let ax = c.pointA.x.asNumber, ay = c.pointA.y.asNumber, bx = c.pointB.x.asNumber, by = c.pointB.y.asNumber
            let d = ((ax - bx) * (ax - bx) + (ay - by) * (ay - by)).squareRoot()
            if d / sc > 26 {
                // A far pair (most of a province apart) each advance ten units towards the other instead
                // of one icon appearing deep in the next province.
                let ux = (bx - ax) / d, uy = (by - ay) / d, step = min(6 * sc, d / 2) + halfIcon
                aim(c.a.asString, ax + ux * step, ay + uy * step); aim(c.b.asString, bx - ux * step, by - uy * step)
                continue
            }
            let mx = (ax + bx) / 2, my = (ay + by) / 2
            aim(c.a.asString, mx, my); aim(c.b.asString, mx, my)
        }
        // 帅旗 (app rules): in a state at war its largest army carries the commander's banner — the war
        // commander or the marshal, or else the ruler in person (御驾亲征), the leader its battles use.
        var banners = [String: (kind: String, mark: String, name: String)]()
        if !r.regimes.isNull {
            func label(_ p: JS) -> (mark: String, name: String) {
                let first = p.firstName.optionalString ?? "", last = p.lastName.optionalString ?? "", culture = p.cultureName.optionalString ?? ""
                let familyFirst = Nobility.cultures[culture].familyFirst.optionalBool ?? (culture == "chinese" || culture == "japanese")
                return (String((last.isEmpty ? first : last).prefix(1)), familyFirst ? last + first : last.isEmpty ? first : first + "·" + last)
            }
            for n in nations {
                let id = n.id.asString, wars = Offices.wars(r, id)
                guard !wars.isEmpty, let lead = w.armies.asArray.filter({ $0.nationId.asString == id && $0.status.asString != "destroyed" }).max(by: { $0.troops.asNumber < $1.troops.asNumber }) else { continue }
                var general: JS?
                if !r.offices47.isNull {
                    general = Offices.holder(r, id, "WarCommander", wars[0].scopeId) ?? Offices.holder(r, id, "Marshal", Offices.stateId(r, id))
                }
                if let g = general { let l = label(g); banners[lead.id.asString] = ("general", l.mark, l.name) }
                else if !r.people.nations[id].leaderId.isNull, let p = People.person(r, r.people.nations[id].leaderId.asInt) { let l = label(p); banners[lead.id.asString] = ("ruler", l.mark, l.name) }
            }
        }
        o.armies = .array(space.map { v in
            let a = v.army, id = a.id.asString, moving = v.travel.status.asString == "moving"
            var at: (Double, Double)
            // Every army is drawn at its real point. A separate resting spot made an icon jump when the
            // army set out or met an enemy and jump back after the battle; stacked icons are spread
            // apart by the map instead.
            _ = moving; _ = spots
            if let bridge { let p = bridge.graph.location(bridge.travel(v.travel)).point; at = (p.x, p.y) } else { at = (0, 0) }
            if let m = clash[Daily.key("army", id)] {
                let cx = m.x / m.n, cy = m.y / m.n, dx = at.0 - cx, dy = at.1 - cy, d = (dx * dx + dy * dy).squareRoot()
                at = d > halfIcon ? (cx + dx / d * halfIcon, cy + dy / d * halfIcon) : at
            }
            let x = JS.object()
            x.id = a.id; x.name = a.name; x.nation = JS(ni[a.nationId.asString]!); x.troops = a.troops; x.unit = r.units[id].isNull ? JS("Infantry") : r.units[id]
            x.reorganizing = JS(!r.reorganization.active[id].isNull)
            x.status = a.status; x.travel = v.travel.status; x.province = JS(v.province.map { pi[$0.id.asString]! } ?? -1)
            x.supplies = JS(a.supplies.asNumber.rounded()); x.morale = JS(a.morale.asNumber.rounded()); x.x = JS(at.0 / sc); x.y = JS(at.1 / sc)
            x.manual = JS(r.voyages.manualArmies.asArray.contains { $0.asString == id })
            if let b = banners[id] { x.banner = JS(b.kind); x.bannerMark = JS(b.mark); x.commander = JS(b.name) }
            // Destination province of a march (last travel node), for the army panel.
            var dest = -1
            if moving, let bridge, let last = v.travel.nodes.asArray.last, let cell = bridge.graph.ids.firstIndex(of: Int32(last.asInt)) {
                let q = Int(bridge.graph.provinces[cell]); if q >= 0 && q < provinces.count { dest = q }
            }
            x.destination = JS(dest)
            x.mission = JS(r.voyages.missions.isNull ? "" : (r.voyages.missions.objectEntries.first { $0.1.armyId.optionalString == id }?.1.phase.optionalString ?? ""))
            return x
        })
        // Fleets at their actual sea points and the harbour ports (open-sea worlds; empty otherwise).
        var fleetRows = [JS]()
        if let bridge, !r.navy.isNull, !r.navy.fleets.isNull {
            for fl in r.navy.fleets.asArray where fl.status.asString != "lost" {
                let id = fl.id.asString, rec = r.fleetPositions.records[id]
                if rec.isNull { continue }
                let p = bridge.graph.location(bridge.travel(rec)).point, row = r.navalAutonomy.isNull ? JS.null : r.navalAutonomy.fleets[id]
                let x = JS.object()
                x.id = fl.id; x.name = fl.name; x.nation = JS(ni[fl.nationId.asString] ?? -1); x.ships = fl.ships; x.crew = fl.crew; x.food = fl.food
                x.hull = JS(fl.ships.asNumber > 0 ? (r.maritime.hulls[id].optionalNumber ?? 0) / (fl.ships.asNumber * 100) : 0)
                x.status = fl.status; x.travel = rec.status; x.x = JS(p.x / sc); x.y = JS(p.y / sc)
                x.decision = JS(row.isNull ? "" : row.decision.optionalString ?? ""); x.reason = JS(row.isNull ? "" : row.reason.optionalString ?? "")
                let port = row.isNull ? nil : row.assignedPortId.optionalString.flatMap { a in Naval.sea?.ports.first { $0.id == a } }
                x.port = JS(port.flatMap { pi[$0.provinceId] } ?? -1)
                x.manual = JS(r.voyages.manualFleets.asArray.contains { $0.asString == id }); x.patrol = fl.patrol
                fleetRows.append(x)
            }
        }
        o.fleets = .array(fleetRows)
        o.ports = .array((Naval.sea?.ports ?? []).compactMap { port in
            guard let q = pi[port.provinceId] else { return nil }
            let c = r.portControl.isNull ? JS.null : r.portControl.ports[port.provinceId], x = JS.object()
            x.province = JS(q); x.x = JS(port.center.x / sc); x.y = JS(port.center.y / sc)
            x.owner = JS(c.isNull ? -1 : ni[c.landOwnerId.asString] ?? -1); x.occupier = JS(c.isNull ? -1 : ni[c.occupierId.asString] ?? -1)
            x.value = JS(c.isNull ? 100 : c.value.asNumber.rounded()); return x
        })
        var armyIndex = [String: Int](); for (i, v) in space.enumerated() { armyIndex[Daily.key("army", v.army.id.asString)] = i }
        o.contacts = .array(r.forceContacts.pairs.asArray.compactMap { p -> JS? in
            guard let a = armyIndex[p.a.asString], let b = armyIndex[p.b.asString] else { return nil }
            return .array([JS(a), JS(b)])
        })
        // Battles at sea (a fleet in contact): the same BattleSword between the two forces.
        var forcePoint = [String: (Double, Double)]()
        for (i, v) in space.enumerated() { let row = o.armies[i]; forcePoint[Daily.key("army", v.army.id.asString)] = (row.x.asNumber, row.y.asNumber) }
        for f in fleetRows { forcePoint[Daily.key("fleet", f.id.asString)] = (f.x.asNumber, f.y.asNumber) }
        o.seaBattles = .array(r.forceContacts.pairs.asArray.compactMap { p -> JS? in
            guard p.a.asString.hasPrefix("[\"fleet") || p.b.asString.hasPrefix("[\"fleet"), let a = forcePoint[p.a.asString], let b = forcePoint[p.b.asString] else { return nil }
            return .array([JS((a.0 + b.0) / 2), JS((a.1 + b.1) / 2)])
        })
        let stateNation = Dictionary(uniqueKeysWithValues: r.nativeWars.nationIds.asArray.map { ($0[0].asInt, $0[1].asString) })
        o.wars = .array(r.nativeWars.campaigns.asArray.filter { $0.endedTick.isNull }.map { c in
            let d = r.nativeDiplomacy.declarations.asArray.first { $0.warId.asInt == c.id.asInt }, goal = d.flatMap { $0.goals.asArray.first }
            let x = JS.object()
            x.id = c.id; x.attacker = JS(c.attacker.optionalString.flatMap { ni[$0] } ?? -1); x.defender = JS(c.defender.optionalString.flatMap { ni[$0] } ?? -1)
            x.casusBelli = JS(d.map { DeclarationText.casusBelli($0.casusBelliId.asInt) } ?? "")
            x.goal = JS(goal.map { g in DeclarationText.goal(g.type.asInt, g.scope.isNull || g.scope.provinceIds.isNull ? 0 : g.scope.provinceIds.length) } ?? "")
            x.startDay = JS((c.openedTick.asNumber / 120).rounded(.down))
            x.participants = .array(c.participants.asArray.map { p in let y = JS.object(); y.nation = JS(stateNation[p.stateId.asInt].flatMap { ni[$0] } ?? -1); y.side = p.side; return y })
            // War goals' claimed provinces with their claimant (WarClaimAnimationManager).
            x.claims = .array(c.goals.asArray.flatMap { g -> [JS] in
                guard !g.scope.isNull, !g.scope.provinceIds.isNull else { return [] }
                let claimant = stateNation[g.beneficiary.optionalNumber.map { Int($0) } ?? -1].flatMap { ni[$0] } ?? -1
                return g.scope.provinceIds.asArray.compactMap { n -> JS? in
                    let index = n.asInt - 1
                    guard provinces.indices.contains(index) else { return nil }
                    let y = JS.object(); y.province = JS(index); y.nation = JS(claimant); return y
                }
            })
            return x
        })
        battleArrows.update(r, day: w.day.asInt)
        o.arrows = .array(battleArrows.all.map { a in .array([JS(a.source), JS(a.target), JS(a.attacker), JS(a.defender), JS(a.start.x / sc), JS(a.start.y / sc), JS(a.control.x / sc), JS(a.control.y / sc), JS(a.end.x / sc), JS(a.end.y / sc)]) })
        o.sieges = .array(r.occupation.sieges.asArray.map { s in
            let x = JS.object(); x.province = JS(pi[s.provinceId.asString] ?? -1); x.nation = JS(ni[s.controller.asString] ?? -1)
            x.progress = JS(s.maximum.asNumber > 0 ? s.resistance.asNumber / s.maximum.asNumber : 0); return x
        })
        o.events = .array(r.chronicle.entries.asArray.suffix(30).map { e in let x = JS.object(); x.day = e.day; x.text = e.text; x.kind = e.kind; return x })
        return Data(o.json.utf8)
    }
}
