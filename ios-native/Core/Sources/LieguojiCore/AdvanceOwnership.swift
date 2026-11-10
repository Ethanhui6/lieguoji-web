/// Ownership of asynchronous display replies. Pausing may drain an accepted reply; starting another
/// producer (resume or single step) supersedes it. A different world always rejects the old reply.
public struct AdvanceOwnership: Sendable {
    public struct Ticket: Equatable, Sendable {
        public let world: Int
        public let producer: UInt64
    }
    private var producer: UInt64 = 0
    public init() {}
    public mutating func begin(world: Int) -> Ticket {
        producer &+= 1
        return Ticket(world: world, producer: producer)
    }
    public func owns(_ ticket: Ticket, world: Int) -> Bool {
        ticket.world == world && ticket.producer == producer
    }
}

/// Admission on the engine's actor. A stale task that was queued before a world switch or before a
/// newer producer must not advance the new world, even when its display reply would be discarded.
public struct AdvanceSession: Sendable {
    public private(set) var revision: UInt64 = 0
    private var world: Int = .min
    private var producer: UInt64 = 0
    public init() {}
    @discardableResult public mutating func replaceWorld(world: Int) -> UInt64? {
        guard world >= self.world else { return nil }
        self.world = world
        revision &+= 1; producer = 0
        return revision
    }
    public mutating func admit(revision: UInt64, producer: UInt64) -> Bool {
        guard revision == self.revision, producer >= self.producer else { return false }
        self.producer = producer
        return true
    }
}
