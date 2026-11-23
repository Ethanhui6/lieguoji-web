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
        guard borders.indices.contains(index), index >= 0, index < r.world.provinces.length else { return false }
        let row = borders[index], owner = r.world.provinces[index].controller.asString
        guard !row.isEmpty else { return false }
        var foreign = 0
        for i in row where i >= 0 && i < r.world.provinces.length && r.world.provinces[i].controller.asString != owner { foreign += 1 }
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
        let traits = Set(state.traits.asArray.map(\.asString)), politics = polityCombat[state.polity.asString] ?? (1, 1)
        let land = p.map { r.terrainContext.provinces[$0.id.asString] }
        let leaderId = r.people.nations[nation].leaderId
        let leader = Regimes.governor(r, nation) ?? (leaderId.isNull ? nil : People.person(r, leaderId.asInt))
        let wars = Offices.wars(r, nation)
        let enemy: String? = p != nil && attacking ? p!.controller.asString : wars.count == 1 ? wars[0].enemy : nil
        let official = militaryLeaderSkill(r, nation, enemy: enemy) ?? leader.map { People.skills($0).military } ?? 50
        var provinceDefense = 1.0
        if let d = defense { provinceDefense = !d.locked.isTruthy && d.manualSet.isTruthy && d.manualFortress.isTruthy ? 3 : min(10, max(1, f(d.storedDefense.asNumber))) }
        // 本作规则：天然地形守险（山地/沼泽/深林）为守军提供温和而真实的城防与据险修正，平畴则更利于攻防展开。
        if UnitKinds.enabled, !r.regimes.isNull, r.regimes.enabled.isTruthy, let land {
            let ratios = land.biomes.isNull ? [] : land.biomes.asArray.map(\.asNumber)
            let main = ratios.indices.max { ratios[$0] < ratios[$1] } ?? 4
            let bonus = ForceMotion.terrainProfile(biome: main, mountain: land.mountain.isTruthy).defenseBonus
            // 仅将天然地利温和叠加到防御修正（最大 ±20%），与兵种地形表协同发挥战略纵深
            let factor = 1.0 + (bonus - 1.0) * 0.65
            provinceDefense = min(10, max(0.85, f(provinceDefense * f(factor))))
        }
        var coreDefense = 1.0
        if let o = owner, let d = defense, d.distance.asNumber != 2147483647, d.distance.asNumber <= o.coreThreshold.asNumber {
            coreDefense = o.traits.asArray.contains { $0.asString == "CoreDefense" } ? f(1.5) : f(1.15)
        }
        var biomes = land.map { $0.biomes.isNull ? [] : $0.biomes.asArray.map(\.asNumber) } ?? []
        var isMountain = land.map { $0.mountain.isTruthy } ?? false
        // 本作规则：接敌格实际地貌参与战斗地形修正（70% 接敌格实测地貌 + 30% 全省地形分布），
        // 让骑兵/弓兵/盾兵在同一州内的林地、平原或山口交锋时真实体现局部地形优劣；网页黄金测试保持原全省统计。
        if UnitKinds.enabled, !r.regimes.isNull, r.regimes.enabled.isTruthy, let index, let bridge = Armies.bridge {
            let rec = r.armyPositions.records[a.id.asString]
            if !rec.isNull, rec.nodes.length > 0 {
                let g = bridge.graph
                let tr = bridge.travel(rec)
                if !tr.nodes.isEmpty {
                    let loc = g.location(tr)
                    if g.provinces.indices.contains(loc.cell), Int(g.provinces[loc.cell]) == index, g.faces.indices.contains(loc.cell) {
                        let faceIdx = Int(g.faces[loc.cell])
                        if g.faceBiomes.indices.contains(faceIdx) {
                            let bi = Int(g.faceBiomes[faceIdx])
                            if bi >= 1 && bi < 13 {
                                var mixed = [Double](repeating: 0, count: max(13, biomes.count))
                                for i in biomes.indices { mixed[i] = biomes[i] * 0.3 }
                                mixed[bi] += 0.7
                                biomes = mixed
                                if bi == 11 || bi == 12 { isMountain = true }
                            }
                        }
                    }
                }
            }
        }
        var dmgArmy = snapshot.damageToArmy.asNumber
        var dmgProv = snapshot.damageToProvince.asNumber
        var polAtk = politics.attack
        var polDef = politics.defense
        // 本作规则：五部军制与专属战场被动、战区集团军与诸兵合击、战神谱活将光环＋专属兵法特技（不影响网页逐字节黄金测试）
        if UnitKinds.enabled, !r.regimes.isNull, r.regimes.enabled.isTruthy {
            let aid = a.id.asString
            let unitKey = r.units[aid].optionalString ?? "Infantry"
            let branch = Regimes.armyBranch(r, armyId: aid, unitKey: unitKey)
            polAtk = f(polAtk * f(branch.attackFactor))
            polDef = f(polDef * f(branch.defenseFactor))
            dmgProv = f(dmgProv * f(branch.siegeFactor))
            // 五部专属战场被动
            switch branch {
            case .guardCorps:
                // 护驾死战：京畿或本土核心作战防御再 +12%
                if let cap = Rebellion.capitalProvince(r, nation),
                   let pObj = p,
                   (pObj.id.asString == cap || pObj.neighbors.asArray.contains { $0.asString == cap }) {
                    polDef = f(polDef * f(1.12))
                }
            case .garrison:
                // 深沟高垒：本土守御防御再 +10%
                if !attacking && p != nil { polDef = f(polDef * f(1.10)) }
            case .vanguard:
                // 疾袭冲阵：主动出击进攻再 +6%
                if attacking { polAtk = f(polAtk * f(1.06)) }
            case .siege:
                // 重炮破城：对高防要塞围城破防再 +15%
                if attacking && provinceDefense >= 2 { dmgProv = f(dmgProv * f(1.15)) }
            case .field:
                break
            }
            if let grp = Regimes.armyGroup(r, armyId: aid), grp.totalBonusPct > 0 {
                // 野战主力「中坚会战」在集团军内再享 +4% 协同放大
                let extra = branch == .field ? 4 : 0
                let gf = f(1.0 + Double(grp.totalBonusPct + extra) / 100.0)
                polAtk = f(polAtk * gf)
                polDef = f(polDef * gf)
            }
            if let wg = Regimes.warGodAura(r, nationId: nation) {
                let atkPct = wg.tier.attackPct + wg.skill.attackPct
                let defPct = wg.tier.defensePct + wg.skill.defensePct
                let sgePct = wg.tier.siegePct + wg.skill.siegePct
                if atkPct > 0 { polAtk = f(polAtk * f(1.0 + atkPct / 100.0)) }
                if defPct > 0 { polDef = f(polDef * f(1.0 + defPct / 100.0)) }
                if sgePct > 0 { dmgProv = f(dmgProv * f(1.0 + sgePct / 100.0)) }
            }
            dmgArmy = f(dmgArmy)
        }
        let input = Efficiency.Input(unit: r.units[a.id.asString].asString, command: snapshot.command.asString, official: official, base: base.base.asNumber, destiny: state.destiny.asNumber,
                                     leaderModifier: r.combatPersonnel.nations[nation].leader.modifier.asNumber, provinceDefense: provinceDefense, coreDefense: coreDefense,
                                     politicalAttack: polAtk, politicalDefense: polDef, goldBattleModifier: r.finance.nations[nation].goldBattleModifier.asNumber,
                                     attacking: attacking, sameNation: p != nil && !attacking, protruding: index.map { protruding(r, $0) } ?? false,
                                     wellTrained: traits.contains("WellTrained"), homelandDefense: traits.contains("HomelandDefense"), conqueror: traits.contains("Conqueror"),
                                     biomes: biomes, mountain: isMountain)
        let multiplier = p.map { attacking && Wars.relation(r, nation, $0.controller.asString)?.status.asString == "war" && blockaded(r, $0) ? 2 : 1 } ?? 1
        return MilitaryState.Combat(input: input, damageToArmy: dmgArmy, damageToProvince: dmgProv, multiplier: multiplier)
    }
    static func unitSpeed(_ key: String) -> Double { unitSpeeds[key] ?? 1 }
}

extension MilitaryState.Combat {
    public init(input: Efficiency.Input, damageToArmy: Double, damageToProvince: Double, multiplier: Int) {
        self.input = input; self.damageToArmy = damageToArmy; self.damageToProvince = damageToProvince; self.multiplier = multiplier
    }
}
