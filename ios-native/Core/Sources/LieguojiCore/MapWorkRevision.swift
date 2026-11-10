/// Independent lifetimes for background map work. Selecting a border must not cancel colours or
/// city marks, while replacing the map invalidates every result prepared from the previous map.
public struct MapWorkRevision: Sendable {
    private var map: UInt64 = 0
    private var appearance: UInt64 = 0
    private var outlines: UInt64 = 0
    public init() {}

    @discardableResult public mutating func replaceMap() -> Self {
        map &+= 1
        appearance &+= 1
        outlines &+= 1
        return self
    }
    @discardableResult public mutating func changeAppearance() -> Self {
        appearance &+= 1
        return self
    }
    @discardableResult public mutating func changeOutlines() -> Self {
        outlines &+= 1
        return self
    }
    public func acceptsMap(_ work: Self) -> Bool { map == work.map }
    public func acceptsAppearance(_ work: Self) -> Bool {
        acceptsMap(work) && appearance == work.appearance
    }
    public func acceptsOutlines(_ work: Self) -> Bool {
        acceptsMap(work) && outlines == work.outlines
    }
}
