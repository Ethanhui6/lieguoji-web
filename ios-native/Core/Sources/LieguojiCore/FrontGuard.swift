/// Native tactical adaptation: leave one available formation against an observed adjacent threat.
/// This changes orders, not combat strength; it is not claimed as a recovered original rule.
public enum FrontGuard {
    public struct Force {
        public let id: String
        public let troops: Int
        public let available: Bool
        public init(id: String, troops: Int, available: Bool) {
            self.id = id; self.troops = troops; self.available = available
        }
    }
    public static func choose(_ forces: [Force], threatened: Bool) -> String? {
        guard threatened else { return nil }
        return forces.filter { $0.available && $0.troops > 0 }.sorted {
            $0.troops == $1.troops ? $0.id < $1.id : $0.troops > $1.troops
        }.first?.id
    }
}
