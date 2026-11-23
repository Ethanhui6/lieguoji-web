import Foundation

/// 界面所需的推演状态（每步一份）。本机推演时引擎直接把它交给界面，不再经过 JSON；
/// 远程计算时按同名字段编码为 JSON 传输（与旧版字段一致，新旧客户端都能读）。
public struct GameState: Codable, Equatable, Sendable {
    public struct Date: Codable, Equatable, Sendable { public let year: Int; public let month: Int; public let day: Int }
    public struct Nation: Codable, Equatable, Sendable {
        /// Identity (Swift engine): states founded in play extend the opening map's legend.
        public var id: String? = nil; public var name: String? = nil; public var color: String? = nil; public var line: String? = nil
        public var capital: Int? = nil; public var culture: String? = nil; public var polity: String? = nil; public var religion: String? = nil
        public let provinces: Int; public let cities: Int; public let population: Int; public let grain: Double; public let troops: Int; public let gold: Double; public let destiny: Double
        public let enemies: [Int]; public let alive: Bool
    }
    public struct Army: Codable, Equatable, Identifiable, Sendable {
        public let id: String; public let name: String; public let nation: Int; public let troops: Int; public let unit: String; public let status: String; public let travel: String
        public let province: Int; public let supplies: Int; public let morale: Int; public let x: Float; public let y: Float; public let manual: Bool
        public let destination: Int?; public let mission: String?
        public var reorganizing: Bool? = nil
        /// 军机调度: attacking, supporting (relieving home) or guarding; nil when the army has no war post.
        public var duty: String? = nil
        /// 帅旗: "general" or "ruler" (御驾亲征), the commander's mark and name; nil for other armies.
        public var banner: String? = nil; public var bannerMark: String? = nil; public var commander: String? = nil
        /// 行军路线地形说明与预计抵达天数（正在行军时生成，供军队详情页展示）。
        public var routeNote: String? = nil
        public var full: Int? = nil
        /// 军队职能分部（guard/field/garrison/vanguard/siege）、分部称号与职责、所属集团军及协同/战神加持摘要。
        public var branch: String? = nil
        public var branchLabel: String? = nil
        public var branchNote: String? = nil
        public var armyGroup: String? = nil
        public var groupBonus: Int? = nil
        public var warGodAura: String? = nil
    }
    /// A fleet at its actual sea point (open-sea worlds) and its naval command.
    public struct Fleet: Codable, Equatable, Identifiable, Sendable {
        public let id: String; public let name: String; public let nation: Int; public let ships: Int; public let crew: Int; public let food: Int; public let hull: Double
        public let status: String; public let travel: String; public let x: Float; public let y: Float; public let decision: String; public let reason: String; public let port: Int; public let manual: Bool; public let patrol: Bool
    }
    /// A harbour port: its land owner, current occupier and control value.
    public struct Port: Codable, Equatable, Sendable { public let province: Int; public let x: Float; public let y: Float; public let owner: Int; public let occupier: Int; public let value: Double }
    public struct Participant: Codable, Equatable, Sendable { public let nation: Int; public let side: Int }
    public struct Claim: Codable, Equatable, Sendable { public let province: Int; public let nation: Int }
    public struct War: Codable, Equatable, Identifiable, Sendable {
        public let id: Int; public let attacker: Int; public let defender: Int; public let casusBelli: String; public let goal: String; public let startDay: Int; public let participants: [Participant]
        public var claims: [Claim]? = nil
    }
    public struct Siege: Codable, Equatable, Sendable { public let province: Int; public let nation: Int; public let progress: Double }
    public struct Event: Codable, Equatable, Sendable { public let day: Int; public let text: String; public let kind: String; public var province: Int? = nil }
    public let day: Int
    public let date: Date
    public let owners: [Int]
    public let labels: [WorldMeta.LabelBox]?
    public let nations: [Nation]
    public let armies: [Army]
    public var fleets: [Fleet]? = nil
    /// Sunk fleets being rebuilt at their docks (造舰), with the months left.
    public struct Yard: Codable, Equatable, Sendable { public let name: String; public let nation: Int; public let months: Double }
    public var yards: [Yard]? = nil
    public var ports: [Port]? = nil
    /// 要塞: provinces whose city defence is level three or more.
    public var forts: [Int]? = nil
    /// 圣地: each faith's holy province.
    public struct Holy: Codable, Equatable, Sendable { public let religion: String; public let province: Int }
    public var holy: [Holy]? = nil
    public let wars: [War]
    public let sieges: [Siege]
    /// Armies in contact (indices into armies), where the battle animation plays.
    public var contacts: [[Int]]? = nil
    /// Province battle arrows: source, target, attacker, defender, start x y, control x y, end x y.
    public var arrows: [[Double]]? = nil
    /// Contacts involving a fleet: the midpoint of the two forces.
    public var seaBattles: [[Double]]? = nil
    public let events: [Event]

    /// 纪年 (custom): an era name and a shift of the year, display only.
    public var era: String? = nil
    public var yearOffset: Int? = nil
    public var displayYear: Int { date.year + (yearOffset ?? 0) }
    public var dateText: String {
        let y = displayYear
        if let era, !era.isEmpty { return "\(era)\(y > 0 ? "\(y)" : "前\(1 - y)")年\(date.month)月\(date.day)日" }
        return y > 0 ? "公元\(y)年\(date.month)月\(date.day)日" : "公元前\(1 - y)年\(date.month)月\(date.day)日"
    }
    public var shortDate: String { "\(date.year)年\(date.month)月" }
    public func atWar(_ a: Int, _ b: Int) -> Bool { nations.indices.contains(a) && nations[a].enemies.contains(b) }
}
