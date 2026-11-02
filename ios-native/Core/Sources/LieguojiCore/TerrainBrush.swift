import Foundation

/// Editor-only shaping. Heights still feed the normal climate and world generation pipeline.
public enum TerrainBrush {
    public static func height(current: Double, target: Double?, delta: Double, falloff: Double,
                              strength: Double, softness: Double, protectCoast: Bool) -> UInt8 {
        let f = min(1, max(0, falloff))
        let edge = pow(f, max(0.2, min(3, softness)))
        let weight = edge * edge * (3 - 2 * edge) * min(2, max(0.1, strength))
        let change = target.map { ($0 - current) * min(1, 0.45 * weight) } ?? delta * weight
        var next = min(100, max(0, (current + change).rounded()))
        if protectCoast { next = current < 20 ? min(19, next) : max(20, next) }
        return UInt8(next)
    }
}
