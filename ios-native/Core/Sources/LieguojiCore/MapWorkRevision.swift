/// Independent lifetimes for background map work. Selecting a border must not cancel colours or
/// city marks, while replacing the map invalidates every result prepared from the previous map.
public struct MapWorkRevision: Sendable {
    private var map: UInt64 = 0
    private var appearance: UInt64 = 0
    private var outlines: UInt64 = 0
    // 安装次序：高倍速下归属每半秒一变，后台一趟重算可能比这还慢，只认“最新”会让颜色一直等不到结果。
    // 视图、描边各自的代次只在它们自己变时才加；地图代次单调，不比已安装的旧就可以装。
    private var appearanceEpoch: UInt64 = 0
    private var outlineEpoch: UInt64 = 0
    private var installedColours: UInt64 = 0
    private var installedGeometry: UInt64 = 0
    public init() {}

    @discardableResult public mutating func replaceMap() -> Self {
        map &+= 1
        appearance &+= 1
        outlines &+= 1
        return self
    }
    @discardableResult public mutating func changeAppearance() -> Self {
        appearance &+= 1
        appearanceEpoch &+= 1
        return self
    }
    @discardableResult public mutating func changeOutlines() -> Self {
        outlines &+= 1
        outlineEpoch &+= 1
        return self
    }
    public func acceptsMap(_ work: Self) -> Bool { map == work.map }
    public func acceptsAppearance(_ work: Self) -> Bool {
        acceptsMap(work) && appearance == work.appearance
    }
    public func acceptsOutlines(_ work: Self) -> Bool {
        acceptsMap(work) && outlines == work.outlines
    }

    /// 颜色结果可以安装：基于当前的视图，且地图不比屏幕上已有的旧（旧一点的地图结果在更新的到来前先顶上）。
    public func acceptsColours(_ work: Self) -> Bool { work.appearanceEpoch == appearanceEpoch && work.map >= installedColours }
    public mutating func installColours(_ work: Self) { installedColours = max(installedColours, work.map) }
    /// 城池、州界等只随地图变的几何：不比已安装的旧即可。国界描边还要求描边设置没变。
    public func acceptsGeometry(_ work: Self) -> Bool { work.map >= installedGeometry }
    public func acceptsOutlineGeometry(_ work: Self) -> Bool { acceptsGeometry(work) && work.outlineEpoch == outlineEpoch }
    public mutating func installGeometry(_ work: Self) { installedGeometry = max(installedGeometry, work.map) }
}
