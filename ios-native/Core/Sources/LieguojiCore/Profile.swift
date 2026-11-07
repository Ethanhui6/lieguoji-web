import Foundation

/// Optional wall-clock totals per engine phase (off unless `enabled`), for finding hot spots.
public enum Profile {
    public static var enabled = false
    public private(set) static var totals = [String: (seconds: Double, calls: Int)]()
    @discardableResult @inline(__always)
    public static func measure<T>(_ name: String, _ body: () -> T) -> T {
        if !enabled { return body() }
        let start = DispatchTime.now().uptimeNanoseconds
        let value = body()
        let t = Double(DispatchTime.now().uptimeNanoseconds - start) / 1e9
        let old = totals[name] ?? (0, 0)
        totals[name] = (old.seconds + t, old.calls + 1)
        return value
    }
    /// Adds a measured span by hand (for parts of a loop).
    public static func add(_ name: String, _ seconds: Double) {
        let old = totals[name] ?? (0, 0)
        totals[name] = (old.seconds + seconds, old.calls + 1)
    }
    public static func reset() { totals = [:] }
    public static var report: String {
        totals.sorted { $0.value.seconds > $1.value.seconds }.map { String(format: "%@ %.3fs ×%d", $0.key, $0.value.seconds, $0.value.calls) }.joined(separator: "\n")
    }
}
