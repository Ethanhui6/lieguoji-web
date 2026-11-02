import Foundation

/// Army combat inputs from the run state (civilization47-combat makeReader47, as the window exporter
/// derives them): unit, command, military leader (war commander → marshal → ruler), base, destiny and
/// the leader's enemy modifier, province defence and core defence, polity, treasury, attack/defence,
/// protruding border (province-border54), state traits, terrain and the harbour blockade multiplier.
public enum CombatReader {
    static let f = Native.fr
    /// Owner province index of each outside border cell of every province (province-border54).
    public static var borders = [[Int]]()
    static let unitSpeeds: [String: Double] = {
        var s = ["Infantry": 1.0, "Archer": 0.95, "Shield": 0.9, "Cavalry": 1.2, "Elite": 1.05]
        for k in UnitKinds.kinds where s[k.key] == nil { s[k.key] = k.speed }
        return s
    }()
    static let polityCombat: [String: (attack: Double, defense: Double)] = [
        "Kingdom": (1, Native.fr(1.05)), "Empire": (Native.fr(1.05), 1), "Federation": (1, 1), "Republic": (1, 1), "Tribal": (Native.fr(1.05), Native.fr(0.95)), "Theocracy": (1, 1),
    ]
    public static func protruding(_ r: JS, _ index: Int) -> Bool {
        let row = borders[index], owner = r.world.provinces[index].controller.asString
        var foreign = 0
        for i in row where r.world.provinces[i].controller.asString != owner { foreign += 1 }
        return f(f(Double(foreign)) / f(Double(row.count))) > 0.5
    }
    static func militaryLeaderSkill(_ r: JS, _ nation: String, enemy: String?) -> Double? {
        if !r.offices47.isNull {
            if let enemy, !r.people.nations[enemy].isNull, let c = Offices.holder(r, nation, "WarCommander", r.people.nations[enemy].id.asInt) { return People.skills(c).military }
            if let m = Offices.holder(r, nation, "Marshal", Offices.stateId(r, nation)) { return People.skills(m).military }
        }
        return nil
    }
    static func blockaded(_ r: JS, _ p: JS) -> Bool {
        let port = r.portControl.ports[p.id.asString]
        if port.isNull { return false }
        let land = port.landOwnerId.optionalString, occupier = port.occupierId.optionalString
        return land == p.controller.asString && land != occupier && r.world.nations.asArray.contains { $0.id.optionalString == land } && r.world.nations.asArray.contains { $0.id.optionalString == occupier }
    }
    /// inputsAt: the army as if standing in province `index` (nil: at sea).
    public static func inputs(_ r: JS, _ a: JS, _ index: Int?) -> MilitaryState.Combat {
        let nation = a.nationId.asString, state = r.upperCombat.nations[nation], snapshot = r.combatPersonnel.armies[a.id.asString], base = r.upperCombat.armies[a.id.asString]
        let p: JS? = index.map { r.world.provinces[$0] }
        let owner = p.map { r.upperCombat.nations[$0.controller.asString] }, defense = p.map { r.upperCombat.provinces[$0.id.asString] }
        let attacking = p == nil || p!.controller.asString != nation
        let traits = Set(state.traits.asArray.map(\.asString)), politics = polityCombat[state.polity.asString]!
        let land = p.map { r.terrainContext.provinces[$0.id.asString] }
        let leaderId = r.people.nations[nation].leaderId
        let leader = leaderId.isNull ? nil : People.person(r, leaderId.asInt)
        let wars = Offices.wars(r, nation)
        let enemy: String? = p != nil && attacking ? p!.controller.asString : wars.count == 1 ? wars[0].enemy : nil
        let official = militaryLeaderSkill(r, nation, enemy: enemy) ?? leader.map { People.skills($0).military } ?? 50
        var provinceDefense = 1.0
        if let d = defense { provinceDefense = !d.locked.isTruthy && d.manualSet.isTruthy && d.manualFortress.isTruthy ? 3 : min(10, max(1, f(d.storedDefense.asNumber))) }
        var coreDefense = 1.0
        if let o = owner, let d = defense, d.distance.asNumber != 2147483647, d.distance.asNumber <= o.coreThreshold.asNumber {
            coreDefense = o.traits.asArray.contains { $0.asString == "CoreDefense" } ? f(1.5) : f(1.15)
        }
        let input = Efficiency.Input(unit: r.units[a.id.asString].asString, command: snapshot.command.asString, official: official, base: base.base.asNumber, destiny: state.destiny.asNumber,
                                     leaderModifier: r.combatPersonnel.nations[nation].leader.modifier.asNumber, provinceDefense: provinceDefense, coreDefense: coreDefense,
                                     politicalAttack: politics.attack, politicalDefense: politics.defense, goldBattleModifier: r.finance.nations[nation].goldBattleModifier.asNumber,
                                     attacking: attacking, sameNation: p != nil && !attacking, protruding: index.map { protruding(r, $0) } ?? false,
                                     wellTrained: traits.contains("WellTrained"), homelandDefense: traits.contains("HomelandDefense"), conqueror: traits.contains("Conqueror"),
                                     biomes: land.map { $0.biomes.isNull ? [] : $0.biomes.asArray.map(\.asNumber) } ?? [], mountain: land.map { $0.mountain.isTruthy } ?? false)
        let multiplier = p.map { attacking && Wars.relation(r, nation, $0.controller.asString)?.status.asString == "war" && blockaded(r, $0) ? 2 : 1 } ?? 1
        return MilitaryState.Combat(input: input, damageToArmy: snapshot.damageToArmy.asNumber, damageToProvince: snapshot.damageToProvince.asNumber, multiplier: multiplier)
    }
    static func unitSpeed(_ key: String) -> Double { unitSpeeds[key] ?? 1 }
}

extension MilitaryState.Combat {
    public init(input: Efficiency.Input, damageToArmy: Double, damageToProvince: Double, multiplier: Int) {
        self.input = input; self.damageToArmy = damageToArmy; self.damageToProvince = damageToProvince; self.multiplier = multiplier
    }
}
