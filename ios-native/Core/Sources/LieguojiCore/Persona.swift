import Foundation

/// Character skill getters (native-economy character-income nativeCharacterSkills): base plus the
/// ordered float32 sum of the traits' modifiers, clamped to 0…100 after the add.
public enum Persona {
    public struct Skills: Codable, Sendable, Equatable { public var administrative: Double, military: Double, diplomatic: Double, charisma: Double }
    /// The four skill modifiers of one trait (character-traits.json).
    public struct TraitModifiers: Codable, Sendable { public let administrative: Double, military: Double, diplomatic: Double, charisma: Double }
    public static func skills(base: Skills, traits: [TraitModifiers]) -> Skills {
        func get(_ base: Double, _ key: KeyPath<TraitModifiers, Double>) -> Double {
            var sum = 0.0
            for t in traits { sum = Native.fr(sum + Native.fr(t[keyPath: key])) }
            return min(100, max(0, Native.fr(sum + Native.fr(base))))
        }
        return Skills(administrative: get(base.administrative, \.administrative), military: get(base.military, \.military), diplomatic: get(base.diplomatic, \.diplomatic), charisma: get(base.charisma, \.charisma))
    }
}

/// destiny20-state settleDestinyMonth for one nation on a thirtieth day: the ratio of its provinces'
/// population to their capacity, then the month above. The ruler's administration is read lazily.
extension Destiny {
    public static func settle(_ s: inout State, day: Int, populations: [Double], capacities: [Double], gold: Double, administrative: (() -> Double)?) -> (reset: Bool, cleared: Bool)? {
        let month = day / 30
        if day % 30 != 0 || s.lastMonth >= month || populations.isEmpty { return nil }
        let population = populations.reduce(0, +), capacity = capacities.reduce(0, +)
        let ratio = Native.fr(Native.fr(population) / Native.fr(capacity))
        let lazy = s.destiny >= Native.fr(30) ? administrative?() : nil
        let r = Destiny.month(&s, populationRatio: ratio, gold: Int(gold), leaderAdministrative: lazy)
        s.lastMonth = month
        return r
    }
}
