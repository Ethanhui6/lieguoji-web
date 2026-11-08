import Foundation

/// 云端调校: the balance numbers of the app's own rules (pace of battle, sieges and peace, army and
/// fleet sizes). The app fetches them from the cloud config (ios-native/Cloud/config.json) at launch
/// and sends them here, so they change without a new build; these defaults apply until then and when
/// the cloud cannot be reached. Original-parity worlds never read them.
public struct Tuning: Codable, Sendable, Equatable {
    /// Battle damage (× the original's).
    public var lethality = 2.0
    /// Siege damage (× the original's).
    public var siege = 6.0
    /// Months before a war whose goals are met may end, and before a decisive score forces peace.
    public var peaceGoalMonths = 4
    public var peaceDecisiveMonths = 6
    /// War weariness starts after this many months and is total this many months later.
    public var wearyStart = 3
    public var wearySpan = 9
    /// Months a state rests between its wars.
    public var warRestMonths = 2
    /// How readily states go to war (× their temper; the three-year audit found 7 wars in 3 years).
    public var warEagerness = 2.6
    /// 政权更替: a state may lose provinces to rebellion once it holds this many (the original: 30, on
    /// maps of hundreds of provinces); rebellions and family risings may begin this many months into a
    /// world (the original: 24); and family risings are this much likelier.
    public var rebelMinProvinces = 8
    public var calmMonths = 6
    public var unrest = 1.6
    /// Standing armies: per province in all, per province at home, in the whole world.
    public var armiesPerProvince = 2.2
    public var armiesAtHome = 3
    public var armyCap = 900
    /// Share of a state's fleets that put to sea against the enemy in war.
    public var navyAttackShare = 0.6
    /// Ships of each opening fleet.
    public var openingShips = 3
    /// 小国坚韧: a state under eight provinces takes up to this much less battle damage (at one province).
    public var smallStateGrit = 0.25

    public init() {}
    /// Every key optional: an older or partial config keeps the defaults for what it leaves out.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self), d = Tuning()
        func v<T: Decodable>(_ k: CodingKeys, _ fallback: T) -> T { (try? c.decodeIfPresent(T.self, forKey: k)) ?? fallback }
        lethality = max(0.25, min(8, v(.lethality, d.lethality)))
        siege = max(0.25, min(20, v(.siege, d.siege)))
        peaceGoalMonths = max(1, min(48, v(.peaceGoalMonths, d.peaceGoalMonths)))
        peaceDecisiveMonths = max(1, min(120, v(.peaceDecisiveMonths, d.peaceDecisiveMonths)))
        wearyStart = max(0, min(240, v(.wearyStart, d.wearyStart)))
        wearySpan = max(1, min(240, v(.wearySpan, d.wearySpan)))
        warRestMonths = max(0, min(60, v(.warRestMonths, d.warRestMonths)))
        warEagerness = max(0.2, min(5, v(.warEagerness, d.warEagerness)))
        rebelMinProvinces = max(2, min(60, v(.rebelMinProvinces, d.rebelMinProvinces)))
        calmMonths = max(0, min(60, v(.calmMonths, d.calmMonths)))
        unrest = max(0.2, min(5, v(.unrest, d.unrest)))
        armiesPerProvince = max(0.3, min(6, v(.armiesPerProvince, d.armiesPerProvince)))
        armiesAtHome = max(1, min(8, v(.armiesAtHome, d.armiesAtHome)))
        armyCap = max(100, min(2000, v(.armyCap, d.armyCap)))
        navyAttackShare = max(0.1, min(1, v(.navyAttackShare, d.navyAttackShare)))
        openingShips = max(1, min(10, v(.openingShips, d.openingShips)))
        smallStateGrit = max(0, min(1.5, v(.smallStateGrit, d.smallStateGrit)))
    }

    /// The numbers in force (set by the app from the cloud config).
    public static var current = Tuning()
}
