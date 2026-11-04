import Foundation

/// Physical encounter math; epsilon is numerical tolerance, not a province-sized attack range.
public enum EncounterGeometry {
    static let epsilon = 0.00001
    static func touching(_ a: TravelPoint, _ b: TravelPoint) -> Bool {
        let x = a.x - b.x, y = a.y - b.y
        return x * x + y * y <= epsilon * epsilon
    }
    static func meetingTime(_ a: TravelPoint, _ av: TravelPoint, _ b: TravelPoint, _ bv: TravelPoint, limit: Double) -> Double? {
        let x = a.x - b.x, y = a.y - b.y, vx = av.x - bv.x, vy = av.y - bv.y
        let speed2 = vx * vx + vy * vy
        guard speed2 > 0 else { return nil }
        let t = -(x * vx + y * vy) / speed2
        guard t > 0, t <= limit else { return nil }
        let dx = x + vx * t, dy = y + vy * t
        return dx * dx + dy * dy <= epsilon * epsilon ? t : nil
    }
}
