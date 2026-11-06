import Foundation

/// Physical encounter math; epsilon is numerical tolerance, not a province-sized attack range.
public enum EncounterGeometry {
    static let epsilon = 0.00001
    /// Within `reach` of each other (the numerical tolerance by default; app worlds use the engagement
    /// distance, about two army icons, see ForceBridge.engageReach).
    static func touching(_ a: TravelPoint, _ b: TravelPoint, reach: Double = epsilon) -> Bool {
        let x = a.x - b.x, y = a.y - b.y
        return x * x + y * y <= reach * reach
    }
    /// The first time in (0, limit] at which two straight-moving points come within `reach`.
    static func meetingTime(_ a: TravelPoint, _ av: TravelPoint, _ b: TravelPoint, _ bv: TravelPoint, limit: Double, reach: Double = epsilon) -> Double? {
        let x = a.x - b.x, y = a.y - b.y, vx = av.x - bv.x, vy = av.y - bv.y
        let speed2 = vx * vx + vy * vy
        guard speed2 > 0 else { return nil }
        if reach <= epsilon {
            let t = -(x * vx + y * vy) / speed2
            guard t > 0, t <= limit else { return nil }
            let dx = x + vx * t, dy = y + vy * t
            return dx * dx + dy * dy <= epsilon * epsilon ? t : nil
        }
        // |p + v t| = reach: the smaller root, when they start outside reach.
        let half = x * vx + y * vy, c = x * x + y * y - reach * reach
        guard c > 0 else { return nil }
        let disc = half * half - speed2 * c
        guard disc >= 0 else { return nil }
        let t = (-half - disc.squareRoot()) / speed2
        return t > 0 && t <= limit ? t : nil
    }
}
