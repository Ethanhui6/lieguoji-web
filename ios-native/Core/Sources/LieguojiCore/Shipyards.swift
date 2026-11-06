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

    /// Months to build one warship for this state (its ruler's traits multiply the base).
    public static func buildMonths(_ r: JS, _ nation: String) -> Double {
        var m = 1.0
        let id = r.people.nations[nation].leaderId
        if !id.isNull, let p = People.person(r, id.asInt), !p.traits.isNull {
            for t in p.traits.asArray {
                if let k = Nobility.trait(t.asString)?.warshipBuildTimeMultiplier.optionalNumber, k > 0 { m *= k }
            }
        }
        return baseMonths * m / Regimes.rule(r, "ships")
    }

    /// Once a month: a month of work on every sunk fleet whose state holds its dock.
    static func month(_ r: JS) {
        guard !r.regimes.isNull, !r.navy.isNull, !r.fleetPositions.isNull, !r.maritime.isNull, let sea = Naval.sea else { return }
        remember(r)
        grow(r)
        let s = book(r), provinces = r.world.provinces.asArray
        for fl in Naval.fleets(r) where fl.status.asString == "lost" {
            let id = fl.id.asString, nation = fl.nationId.asString, h = s.home[id]
            guard !h.isNull, Vassals.alive(r, nation),
                  let port = sea.ports.first(where: { $0.id == h.dockId.asString }),
                  provinces.first(where: { $0.id.asString == port.provinceId })?.controller.asString == nation else { s.progress.delete(id); continue }
            let done = (s.progress[id].optionalNumber ?? 0) + 1
            if done < buildMonths(r, nation) { s.progress[id] = JS(done); continue }
            s.progress.delete(id)
            fl.status = JS("docked"); fl.ships = JS(1); fl.crew = JS(40); fl.food = JS(2400)
            fl.route = .array(); fl.progress = JS(0); fl.targetId = .null; fl.patrol = JS(true)
            fl.node = h.node.clone(); fl.dockId = h.dockId.clone()
            r.maritime.hulls[id] = JS(100)
            if !r.maritime.retreating.isNull { r.maritime.retreating.delete(id) }
            r.fleetPositions.records[id] = h.record.clone()
            _ = People.announce(r, kind: "event", text: "\(fl.name.asString)重建完成，重新出港",
                                reason: "港口仍在本国手中，船坞用\(Int(buildMonths(r, nation).rounded()))个月造成新舰（船舶大师在位时减半）。", nations: [nation], province: nil)
        }
    }

    /// 扩编: a fleet lying in its own state's port gains a ship every two build times, up to five
    /// (hull, crew and stores grow with it). The original's ports build warships over months.
    static let maxShips = 5
    static func grow(_ r: JS) {
        guard let sea = Naval.sea else { return }
        let s = book(r), provinces = r.world.provinces.asArray
        for fl in Naval.fleets(r) where fl.status.asString == "docked" && fl.ships.asInt < maxShips {
            let id = fl.id.asString, nation = fl.nationId.asString, key = "grow:" + id
            guard let dock = fl.dockId.optionalString, let port = sea.ports.first(where: { $0.id == dock }),
                  provinces.first(where: { $0.id.asString == port.provinceId })?.controller.asString == nation else { s.progress.delete(key); continue }
            let done = (s.progress[key].optionalNumber ?? 0) + 1
            if done < buildMonths(r, nation) * 2 { s.progress[key] = JS(done); continue }
            s.progress.delete(key)
            let n = fl.ships.asInt + 1
            fl.ships = JS(n); fl.crew = JS(fl.crew.asInt + 40); fl.food = JS(fl.food.asNumber + 2400)
            r.maritime.hulls[id] = JS((r.maritime.hulls[id].optionalNumber ?? 0) + 100)
            if n == maxShips || n == 3 {
                _ = People.announce(r, kind: "event", text: "\(fl.name.asString)扩编至\(n)艘战船", reason: "母港船坞陆续造成新舰，编入舰队。", nations: [nation], province: nil)
            }
        }
    }

    /// Months of work left on a sunk fleet (nil when it is afloat or cannot be rebuilt).
    public static func remaining(_ r: JS, _ fleet: JS) -> Double? {
        guard fleet.status.asString == "lost", !r.regimes.isNull, !r.regimes.shipyard.isNull, !r.regimes.shipyard.home[fleet.id.asString].isNull else { return nil }
        return max(0, buildMonths(r, fleet.nationId.asString) - (r.regimes.shipyard.progress[fleet.id.asString].optionalNumber ?? 0))
    }
}
