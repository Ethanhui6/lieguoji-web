import Foundation

/// Army combat efficiency (Army.RecalCombatEfficiency, native-combat/upper-efficiency.ts) with the
/// unit/terrain modifier (terrain13-native nativeUnitModifier) and the commander's leadership
/// (personnel47 nativeLeadership47). Inputs are resolved by the caller: officials and leaders,
/// destiny, polity, treasury, core distance, province defence and the protruding-border flag.
public enum Efficiency {
    public struct Input: Codable, Sendable {
        public let unit: String; public let command: String; public let official: Double
        public let base: Double; public let destiny: Double; public let leaderModifier: Double
        public let provinceDefense: Double; public let coreDefense: Double
        public let politicalAttack: Double; public let politicalDefense: Double; public let goldBattleModifier: Double
        public let attacking: Bool; public let sameNation: Bool; public let protruding: Bool
        public let wellTrained: Bool; public let homelandDefense: Bool; public let conqueror: Bool
        public let biomes: [Double]; public let mountain: Bool
    }

    struct Table { let power: Double; let attack: [Double]; let defense: [Double]; let mountainAttack: Double; let mountainDefense: Double }
    static let tables: [String: Table] = [
        "Infantry": Table(power: 1, attack: [1, 1, 1, 1.05, 1.05, 1, 1, 1, 1, 1, 1, 1, 1], defense: [1, 1, 1, 1, 1, 1.05, 1.05, 1, 1, 1, 1, 1, 1.05], mountainAttack: 1, mountainDefense: 1),
        "Archer": Table(power: 0.95, attack: [1, 1, 1, 1, 1, 1.1, 1.1, 1.15, 1.15, 1, 1, 1, 1], defense: [1, 1, 1, 1, 1, 1.15, 1.15, 1.2, 1.2, 1, 1, 1, 1], mountainAttack: 1.1, mountainDefense: 1.2),
        "Shield": Table(power: 1.05, attack: [1, 1, 1, 0.95, 0.95, 1, 1, 1, 1, 1, 1, 1, 1], defense: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1.15, 1.15, 1.15, 1.2], mountainAttack: 1.05, mountainDefense: 1.3),
        "Cavalry": Table(power: 1.25, attack: [1, 1.25, 1.25, 1.45, 1.45, 0.8, 0.8, 0.7, 0.7, 1, 1, 1, 0.75], defense: [1, 1.2, 1.2, 1.2, 1.2, 0.85, 0.85, 0.75, 0.75, 1, 1, 1, 0.8], mountainAttack: 0.7, mountainDefense: 0.75),
        "Elite": Table(power: 1.35, attack: [1, 1, 1, 1.05, 1.05, 1.05, 1.05, 1.05, 1.05, 1, 1, 1, 1], defense: [1, 1, 1, 1, 1, 1.1, 1.1, 1.1, 1.1, 1.1, 1.1, 1.1, 1], mountainAttack: 1.1, mountainDefense: 1.15),
    ]
    static let combatScale = Native.fr(0.9)

    /// evaluateTerrain: biome ratios against the unit's table, then the mountain weight.
    static func terrain(_ table: [Double], _ mountainModifier: Double, _ ratios: [Double], _ mountainWeight: Double) -> Double {
        let f = Native.fr
        var result = 0.0
        for i in ratios.indices where ratios[i] > 0 { result = f(result + f(f(ratios[i]) * max(f(0.05), f(i < table.count ? table[i] : 1)))) }
        if result <= 0 { result = 1 }
        let mountain = mountainModifier <= 0 ? 1 : mountainModifier, w = f(max(0, min(1, mountainWeight)))
        if w > 0 { result = f(result * f(1 + f(f(max(f(0.05), f(mountain)) - 1) * w))) }
        return max(f(0.05), result)
    }
    public static func unitModifier(unit: String, attacking: Bool, ratios: [Double], mountain: Bool) -> Double {
        let f = Native.fr, t = tables[unit] ?? tables["Infantry"]!
        let terrain = Efficiency.terrain(attacking ? t.attack : t.defense, attacking ? t.mountainAttack : t.mountainDefense, ratios, mountain ? 1 : 0)
        return f(f(f(t.power) * terrain) * max(f(0.01), combatScale))
    }
    /// Army.CalculateLeadershipModifier for central and local command.
    public static func leadership(official: Double, command: String) -> Double {
        let f = Native.fr, divisor: Double = command == "local" ? 300 : 150
        return max(f(0.5), min(f(1.5), f(1 + f(f(f(official) - 50) / f(divisor)))))
    }

    public static func compute(_ i: Input) -> Double {
        let f = Native.fr
        func clamp(_ n: Double, _ low: Double, _ high: Double) -> Double { min(f(high), max(f(low), n)) }
        var result = f(f(i.base) * max(f(0.1), f(f(i.destiny) / 30)))
        result = f(result * f(leadership(official: i.official, command: i.command)))
        if i.leaderModifier != 0 { result = f(f(1 + f(i.leaderModifier)) * result) }
        if i.attacking {
            if i.conqueror { result = f(result * 1.5) }
            result = f(f(1 / f(i.provinceDefense)) * result)
            if !i.wellTrained { result = f(f(1 / f(i.coreDefense)) * result) }
            result = f(result * f(i.politicalAttack))
        } else {
            if i.homelandDefense { result = f(result * 1.5) }
            result = f(f(i.provinceDefense) * result)
            result = f(result * f(i.coreDefense))
            result = f(f(i.politicalDefense) * result)
        }
        let protrusion: Double = i.protruding ? 2 : 1
        result = f((i.sameNation ? f(1 / protrusion) : protrusion) * result)
        result = f(result * f(i.goldBattleModifier))
        let unit = max(f(0.05), f(unitModifier(unit: i.unit, attacking: i.attacking, ratios: i.biomes, mountain: i.mountain)))
        result = f(clamp(result, 0.1, 10) * unit)
        return i.unit == "Elite" ? f(result * 10) : result
    }
}
