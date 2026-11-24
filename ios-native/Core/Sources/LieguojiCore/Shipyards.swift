import Foundation

/// 造舰 (app rules): a fleet sunk in battle is rebuilt at its home dock while its state still holds
/// that port — six months, shortened by the ruler's warshipBuildTimeMultiplier (the original's
/// ShipMaster, 0.5). The fleets of this client were fixed at the opening, so a lost fleet never came
/// back and a navy only ever shrank.
public enum Shipyards {
    static let baseMonths = 6.0

    static func book(_ r: JS) -> JS {
        if r.regimes.shipyard.isNull { let o = JS.object(); o.home = JS.object(); o.progress = JS.object(); r.regimes.shipyard = o }
        return r.regimes.shipyard
    }

    /// Each fleet's dock (position record, dock and node), taken while it lies in port.
    static func remember(_ r: JS) {
        guard !r.regimes.isNull, !r.navy.isNull, !r.fleetPositions.isNull else { return }
        let home = book(r).home
        for fl in Naval.fleets(r) where fl.status.asString == "docked" && !fl.dockId.isNull && home[fl.id.asString].isNull {
            let record = r.fleetPositions.records[fl.id.asString]
            guard !record.isNull else { continue }
            let h = JS.object(); h.record = record.clone(); h.dockId = fl.dockId.clone(); h.node = fl.node.clone()
            home[fl.id.asString] = h
        }
    }

    /// Months to build one warship for this state (its ruler's traits, shipyard level, timber specialty and naval tech multiply the base).
    public static func buildMonths(_ r: JS, _ nation: String, provinceId: String? = nil) -> Double {
        var m = 1.0
        let id = r.people.nations[nation].leaderId
        if !id.isNull, let p = People.person(r, id.asInt), !p.traits.isNull {
            for t in p.traits.asArray {
                if let k = Nobility.trait(t.asString)?.warshipBuildTimeMultiplier.optionalNumber, k > 0 { m *= k }
            }
        }
        if UnitKinds.enabled && !r.regimes.isNull && r.regimes.enabled.isTruthy {
            m *= SeaDominion.buildTimeMultiplier(r, nation: nation, provinceId: provinceId)
        }
        return max(1.0, baseMonths * m / Regimes.rule(r, "ships"))
    }

    /// Once a month: a month of work on every sunk fleet whose state holds its dock, plus custom build queue & AI naval expansion.
    static func month(_ r: JS) {
        guard !r.regimes.isNull, !r.navy.isNull, !r.fleetPositions.isNull, !r.maritime.isNull, let sea = Naval.sea else { return }
        remember(r)
        grow(r)
        SeaDominion.advanceBuildQueue(r)
        expandNavies(r)
        let s = book(r), provinces = r.world.provinces.asArray
        let crewUnit = UnitKinds.enabled ? SeaDominion.crewPerShip : 40
        let foodUnit = UnitKinds.enabled ? SeaDominion.foodPerShip : 2400
        for fl in Naval.fleets(r) where fl.status.asString == "lost" {
            let id = fl.id.asString, nation = fl.nationId.asString, h = s.home[id]
            guard !h.isNull, Vassals.alive(r, nation),
                  let port = sea.ports.first(where: { $0.id == h.dockId.asString }),
                  provinces.first(where: { $0.id.asString == port.provinceId })?.controller.asString == nation else { s.progress.delete(id); continue }
            let done = (s.progress[id].optionalNumber ?? 0) + 1
            let needed = buildMonths(r, nation, provinceId: port.provinceId)
            if done < needed { s.progress[id] = JS(done); continue }
            s.progress.delete(id)
            fl.status = JS("docked"); fl.ships = JS(1); fl.crew = JS(crewUnit); fl.food = JS(foodUnit)
            fl.route = .array(); fl.progress = JS(0); fl.targetId = .null; fl.patrol = JS(true)
            fl.node = h.node.clone(); fl.dockId = h.dockId.clone()
            r.maritime.hulls[id] = JS(100)
            if !r.maritime.retreating.isNull { r.maritime.retreating.delete(id) }
            r.fleetPositions.records[id] = h.record.clone()
            _ = People.announce(r, kind: "event", text: "\(fl.name.asString)重建完成，重新出港",
                                reason: "港口仍在本国手中，船坞用 \(Int(needed.rounded())) 个月造成新舰（船坞等级、良木特产与航海科技均会缩短工期）。", nations: [nation], province: port.provinceId)
        }
    }

    /// 扩编: a fleet lying in its own state's port gains a ship over months, up to the port's shipyard tier cap (Lv1=5 / Lv2=8 / Lv3=12).
    static let maxShips = 5
    static func grow(_ r: JS) {
        guard let sea = Naval.sea else { return }
        let s = book(r), provinces = r.world.provinces.asArray
        let appMode = UnitKinds.enabled && !r.regimes.isNull && r.regimes.enabled.isTruthy
        let crewUnit = UnitKinds.enabled ? SeaDominion.crewPerShip : 40
        let foodUnit = UnitKinds.enabled ? SeaDominion.foodPerShip : 2400
        for fl in Naval.fleets(r) where fl.status.asString == "docked" {
            let id = fl.id.asString, nation = fl.nationId.asString, key = "grow:" + id
            guard let dock = fl.dockId.optionalString, let port = sea.ports.first(where: { $0.id == dock }),
                  provinces.first(where: { $0.id.asString == port.provinceId })?.controller.asString == nation else { s.progress.delete(key); continue }
            let cap = UnitKinds.enabled ? SeaDominion.maxShipsForPort(r, provinceId: port.provinceId) : maxShips
            guard fl.ships.asInt < cap else { continue }
            let done = (s.progress[key].optionalNumber ?? 0) + 1
            let baseNeed = buildMonths(r, nation, provinceId: port.provinceId)
            let needed = appMode ? max(1.0, baseNeed * (fl.ships.asInt < 2 ? 0.75 : 1.15)) : (baseNeed * 2)
            if done < needed { s.progress[key] = JS(done); continue }
            s.progress.delete(key)
            let n = fl.ships.asInt + 1
            fl.ships = JS(n); fl.crew = JS(fl.crew.asInt + crewUnit); fl.food = JS(fl.food.asNumber + Double(foodUnit))
            r.maritime.hulls[id] = JS((r.maritime.hulls[id].optionalNumber ?? 0) + 100)
            if n == cap || n == 3 || n == 6 {
                _ = People.announce(r, kind: "event", text: "\(fl.name.asString)扩编至 \(n) 艘战船", reason: "母港船坞陆续造成新舰，满编水兵入列舰队。", nations: [nation], province: port.provinceId)
            }
        }
    }

    /// 自主扩建水师（仅 App 模式生效，零影响网页黄金测试）：
    /// 岛国（无陆邻）与海洋大国按拥有的良港数与疆域规模自动排产组建多支主力水师，彻底解决「全场仅有一艘小船、岛国无法跨海出征」的问题。
    static func expandNavies(_ r: JS) {
        guard UnitKinds.enabled, !r.regimes.isNull, r.regimes.enabled.isTruthy, let sea = Naval.sea else { return }
        let s = book(r)
        if s.bootstrapped.isNull { s.bootstrapped = .object() }
        if s.orders.isNull { s.orders = .array() }
        let provinces = r.world.provinces.asArray
        var controllerById = [String: String]()
        var ownedProvs = [String: [JS]]()
        for p in provinces {
            let ctrl = p.controller.asString
            controllerById[p.id.asString] = ctrl
            if !ctrl.isEmpty { ownedProvs[ctrl, default: []].append(p) }
        }
        var portsByNation = [String: [Naval.Port]]()
        for port in sea.ports {
            if let ctrl = controllerById[port.provinceId], !ctrl.isEmpty {
                portsByNation[ctrl, default: []].append(port)
            }
        }
        let allFleets = Naval.fleets(r)
        var aliveFleetsByNation = [String: [JS]]()
        var fleetsAtPort = [String: Int]()
        for fl in allFleets where fl.status.asString != "lost" && fl.ships.asInt > 0 {
            let nid = fl.nationId.asString
            aliveFleetsByNation[nid, default: []].append(fl)
            if let d = fl.dockId.optionalString { fleetsAtPort[d, default: 0] += 1 }
        }
        let pendingNations = Set(s.orders.asArray.map(\.nation.asString))
        let day = r.world.day.asInt
        var globalFleetTotal = allFleets.filter { $0.status.asString != "lost" }.count

        for n in r.world.nations.asArray {
            let nid = n.id.asString
            guard Vassals.alive(r, nid), globalFleetTotal < 180 else { continue }
            guard let myPorts = portsByNation[nid], !myPorts.isEmpty else { continue }
            let myProvs = ownedProvs[nid] ?? []
            let hasLandNeighbor = myProvs.contains { p in
                p.neighbors.asArray.contains { nb in
                    guard let oc = controllerById[nb.asString] else { return false }
                    return !oc.isEmpty && oc != nid
                }
            }
            let isIsland = !hasLandNeighbor
            let maritime = (r.economy.nations[nid].ethnic.optionalString == "Maritime")
                || ((CultureDoctrines.forNation(r, nid)?.navalPower ?? 0) > 0)
            let targetFleets: Int = {
                if isIsland { return min(6, max(2, myPorts.count + 1)) }
                if myPorts.count >= 2 || myProvs.count >= 6 || maritime {
                    return min(6, max(2, (myPorts.count + 1) / 2 + (maritime ? 1 : 0)))
                }
                return 1
            }()
            let curFleets = aliveFleetsByNation[nid] ?? []
            guard curFleets.count < targetFleets else { continue }

            let pickPort = myPorts.min { a, b in
                let ca = fleetsAtPort[a.id, default: 0], cb = fleetsAtPort[b.id, default: 0]
                return ca != cb ? ca < cb : a.id < b.id
            } ?? myPorts[0]

            // 开局首月为岛国与滨海大国快速成军第二支护航水师，开篇即可跨海巡弋与护航
            if day <= 45 && s.bootstrapped[nid].isNull && targetFleets >= 2 {
                s.bootstrapped[nid] = JS(true)
                let heavy = 1, light = 1, gunboats = (isIsland || myProvs.count >= 8) ? 1 : 0
                if SeaDominion.launchNewFleet(r, nation: nid, port: pickPort, heavy: heavy, light: light, gunboats: gunboats) != nil {
                    fleetsAtPort[pickPort.id, default: 0] += 1
                    globalFleetTotal += 1
                }
                continue
            }

            // 常规月度自主排产造舰（不覆盖玩家或已有造舰队列）
            guard !pendingNations.contains(nid) else { continue }
            let fin = r.finance.nations[nid]
            let gold = fin.isNull ? 0.0 : (fin.gold.optionalNumber ?? 0.0)
            let cost = (isIsland || curFleets.count < 2) ? 140.0 : 240.0
            guard gold >= cost else { continue }
            fin.gold = JS(gold - cost)
            let heavy = 1
            let light = 1
            let gunboats = (isIsland || myProvs.count >= 8 || maritime) ? 1 : 0
            let months = max(2.0, min(4.0, buildMonths(r, nid, provinceId: pickPort.provinceId) * 0.65))
            let order = JS.object()
            order.nation = JS(nid)
            order.provinceId = JS(pickPort.provinceId)
            order.heavy = JS(heavy)
            order.light = JS(light)
            order.gunboats = JS(gunboats)
            order.monthsLeft = JS(months)
            s.orders.push(order)
            globalFleetTotal += 1
        }
    }

    /// Months of work left on a sunk fleet (nil when it is afloat or cannot be rebuilt).
    public static func remaining(_ r: JS, _ fleet: JS) -> Double? {
        guard fleet.status.asString == "lost", !r.regimes.isNull, !r.regimes.shipyard.isNull, !r.regimes.shipyard.home[fleet.id.asString].isNull else { return nil }
        return max(0, buildMonths(r, fleet.nationId.asString) - (r.regimes.shipyard.progress[fleet.id.asString].optionalNumber ?? 0))
    }
}
