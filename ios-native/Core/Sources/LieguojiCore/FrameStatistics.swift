public struct FrameStatistics: Sendable {
    public private(set) var samples: [Double] = []
    public init() {}
    public mutating func record(seconds: Double) {
        guard seconds.isFinite, seconds > 0 else { return }
        samples.append(seconds)
        if samples.count > 240 { samples.removeFirst(samples.count - 240) }
    }
    public var averageMilliseconds: Double {
        samples.isEmpty ? 0 : samples.reduce(0, +) / Double(samples.count) * 1000
    }
    public var onePercentLow: Double {
        guard !samples.isEmpty else { return 0 }
        let slow = samples.sorted(by: >).prefix(max(1, (samples.count + 99) / 100))
        return Double(slow.count) / slow.reduce(0, +)
    }
}
