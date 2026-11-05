import Foundation

/// iOS-only trait gameplay effects that are not yet restored from the original formulas.
/// Gated by `enabled` (set in `Custom.enableAppRules`) so golden fixtures stay bit-identical.
///
/// Reformer / ShipMaster: original evidence confirms the traits exist (`isReformer`,
/// `warshipBuildTimeMultiplier` 0.5) and their Chinese descriptions, but the full reform /
/// shipyard systems are not in the current 47 rules. Effects below use `SIMPLIFIED_` constants
/// and must be labeled 「（简化）」 in the UI and changelog — never claimed as original.
public enum IosTraitRules {
    public static var enabled = false

    // MARK: Reformer（改革家）— SIMPLIFIED
    /// Accession reform span: admin 0…100 maps to −span…+span corruption delta (50 → 0).
    public static let SIMPLIFIED_reformSpan = 20.0
    /// Monthly treasury factor: gold *= (1 − corruption × rate). Corruption −100…100.
    public static let SIMPLIFIED_corruptionGold = 0.004

    // MARK: ShipMaster（船舶大师）— SIMPLIFIED
    /// Base months between auto-built ships without the trait; ShipMaster multiplies by 0.5
    /// (matching localization “建造时间减少50%” / `warshipBuildTimeMultiplier`).
    public static let SIMPLIFIED_baseBuildMonths = 6
    /// Hull points granted with each simplified ship (one ship = 100 hull in navy accounting).
    public static let SIMPLIFIED_hullPerShip = 100.0

    /// Call once when app rules turn on (never from golden fixtures).
    public static func enable() { enabled = true }

    // MARK: Accession (Reformer)

    /// After a known person takes the throne: if they have Reformer, adjust the nation's
    /// iOS corruption from administrative skill and announce the simplified reform.
    static func onAccession(_ r: JS, nationId: String, heir: JS, reign: JS) {
        guard enabled else { return }
        let names = heir.traits.isNull ? [] : heir.traits.asArray.map(\.asString)
        guard names.contains("Reformer") else { return }
        let admin = People.skills(heir).administrative
        let delta = SIMPLIFIED_reformSpan * (admin - 50) / 50
        let before = corruption(r, nationId)
        let after = clamp(before + delta, -100, 100)
        setCorruption(r, nationId, after)
        let leader = reign.regnalName.optionalString ?? reign.name.asString
        let state = r.world.nations.asArray.first { $0.id.asString == nationId }?.name.asString ?? nationId
        let text: String
        if after < before {
            text = "\(leader)对\(state)推行改革，腐败度从\(Int(before.rounded()))降至\(Int(after.rounded()))（简化）"
        } else if after > before {
            text = "\(leader)对\(state)的改革受阻，腐败度从\(Int(before.rounded()))升至\(Int(after.rounded()))（简化）"
        } else {
            text = "\(leader)对\(state)发起改革，腐败度仍为\(Int(after.rounded()))（简化）"
        }
        let reason = "改革家上台触发改革判定（简化）：行政能力相对 50 按 ±\(Int(SIMPLIFIED_reformSpan)) 调整腐败度；非原作精确公式。"
        _ = People.announce(r, kind: "event", text: text, reason: reason, nations: [nationId], province: nil, people: [reign])
    }

    // MARK: Monthly (corruption gold + ShipMaster construction)

    /// Apply after the fiscal month settles gold, and run ShipMaster builds on month boundaries.
    static func monthly(_ r: JS) {
        guard enabled else { return }
        if r.world.day.asInt % 30 != 0 { return }
        applyCorruptionGold(r)
        advanceShipMaster(r)
    }

    static func applyCorruptionGold(_ r: JS) {
        guard !r.regimes.isNull, !r.regimes.iosCorruption.isNull else { return }
        for nation in r.world.nations.asArray {
            let id = nation.id.asString
            let c = r.regimes.iosCorruption[id].optionalNumber ?? 0
            guard c != 0 else { continue }
            let n = r.finance.nations[id]
            guard !n.isNull else { continue }
            let factor = max(0.2, 1 - c * SIMPLIFIED_corruptionGold)
            let gold = (n.gold.optionalNumber ?? 0) * factor
            let perMonth = (n.goldPerMonth.optionalNumber ?? 0) * factor
            n.gold = JS(gold.rounded())
            n.goldPerMonth = JS(perMonth.rounded())
        }
    }

    static func advanceShipMaster(_ r: JS) {
        let month = r.world.day.asInt / 30
        let interval = max(1, Int((Double(SIMPLIFIED_baseBuildMonths) * 0.5).rounded()))
        for nation in r.world.nations.asArray {
            let id = nation.id.asString
            guard rulerHas(r, id, "ShipMaster") else { continue }
            let fleets = Naval.fleets(r).filter { $0.nationId.asString == id && $0.status.asString != "lost" }
            guard let fleet = fleets.first else { continue }
            if r.regimes.iosShipBuild.isNull { r.regimes.iosShipBuild = .object() }
            let last = r.regimes.iosShipBuild[id].optionalNumber.map { Int($0) } ?? (month - interval)
            guard month - last >= interval else { continue }
            r.regimes.iosShipBuild[id] = JS(Double(month))
            let fid = fleet.id.asString
            fleet.ships = JS(fleet.ships.asNumber + 1)
            let hull = (r.maritime.hulls[fid].optionalNumber ?? 0) + SIMPLIFIED_hullPerShip
            r.maritime.hulls[fid] = JS(hull)
            // Keep crew capacity roughly in line with new ships (40 per ship in navy accounting).
            fleet.crew = JS(max(fleet.crew.asNumber, fleet.ships.asNumber * 40))
            let state = nation.name.asString
            let text = "\(state)的船舶大师促成新舰下水（+\(Int(SIMPLIFIED_hullPerShip)) 舰体）（简化）"
            let reason = "船舶大师（简化）：无完整造船队列时，每 \(interval) 月向现有舰队加 1 艘与 \(Int(SIMPLIFIED_hullPerShip)) 舰体；对应原作建造时间 ×0.5 的本地化描述，非原作造舰系统。"
            _ = People.announce(r, kind: "event", text: text, reason: reason, nations: [id], province: nil)
        }
    }

    // MARK: Storage

    static func corruption(_ r: JS, _ nationId: String) -> Double {
        guard !r.regimes.isNull, !r.regimes.iosCorruption.isNull else { return 0 }
        return r.regimes.iosCorruption[nationId].optionalNumber ?? 0
    }

    static func setCorruption(_ r: JS, _ nationId: String, _ value: Double) {
        if r.regimes.isNull { return }
        if r.regimes.iosCorruption.isNull { r.regimes.iosCorruption = .object() }
        r.regimes.iosCorruption[nationId] = JS(clamp(value, -100, 100))
    }

    static func rulerHas(_ r: JS, _ nationId: String, _ trait: String) -> Bool {
        let leaderId = r.people.nations[nationId].leaderId
        guard !leaderId.isNull, let p = People.person(r, leaderId.asInt), p.isAlive.asBool else { return false }
        return (p.traits.isNull ? [] : p.traits.asArray.map(\.asString)).contains(trait)
    }

    static func clamp(_ v: Double, _ lo: Double, _ hi: Double) -> Double { min(hi, max(lo, v)) }
}
