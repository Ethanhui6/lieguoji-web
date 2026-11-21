import Foundation

/// 族谱页的数据：引擎 `familyTree` 输出的解码形状与按血缘分代。App 的族谱页与测试共用这一份实现。
/// 解码宽容：单个成员字段缺失或类型不符时取默认值，无法识别的成员整项略去，不让整页失败。
public struct FamilyTree: Decodable, Sendable {
    public struct Member: Decodable, Identifiable, Sendable, Equatable {
        public let id: Int
        public let name: String
        public let female: Bool
        public let age: Double
        public let alive: Bool
        public let father: Int
        public let mother: Int
        public let spouse: Int
        public let title: String
        public let traits: [String]
        public let skills: [Double]
        /// 外嫁/入赘配偶的本家姓氏（同本族姓氏时为空）。
        public let natalHouse: String
        /// 是否为旁系宗亲。
        public let collateral: Bool

        public init(id: Int, name: String, female: Bool = false, age: Double = 0, alive: Bool = true, father: Int = 0, mother: Int = 0,
                    spouse: Int = 0, title: String = "", traits: [String] = [], skills: [Double] = [50, 50, 50, 50],
                    natalHouse: String = "", collateral: Bool = false) {
            self.id = id; self.name = name; self.female = female; self.age = age.isFinite ? age : 0; self.alive = alive
            self.father = father; self.mother = mother; self.spouse = spouse; self.title = title; self.traits = traits
            self.skills = skills.count == 4 ? skills.map { $0.isFinite ? $0 : 0 } : [50, 50, 50, 50]
            self.natalHouse = natalHouse; self.collateral = collateral
        }
        enum Keys: String, CodingKey { case id, name, female, age, alive, father, mother, spouse, title, traits, skills, natalHouse, collateral }
        public init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: Keys.self)
            func int(_ k: Keys) -> Int {
                if let v = try? c.decodeIfPresent(Int.self, forKey: k) { return v }
                guard let d = try? c.decodeIfPresent(Double.self, forKey: k), d.isFinite, abs(d) < 1e15 else { return 0 }
                return Int(d.rounded())
            }
            let id = int(.id)
            guard id > 0 else { throw DecodingError.dataCorruptedError(forKey: .id, in: c, debugDescription: "成员没有有效 ID") }
            self.init(id: id,
                      name: (try? c.decodeIfPresent(String.self, forKey: .name)) ?? "无名",
                      female: (try? c.decodeIfPresent(Bool.self, forKey: .female)) ?? false,
                      age: (try? c.decodeIfPresent(Double.self, forKey: .age)) ?? 0,
                      alive: (try? c.decodeIfPresent(Bool.self, forKey: .alive)) ?? true,
                      father: int(.father), mother: int(.mother), spouse: int(.spouse),
                      title: (try? c.decodeIfPresent(String.self, forKey: .title)) ?? "",
                      traits: (try? c.decodeIfPresent([String].self, forKey: .traits)) ?? [],
                      skills: (try? c.decodeIfPresent([Double].self, forKey: .skills)) ?? [50, 50, 50, 50],
                      natalHouse: (try? c.decodeIfPresent(String.self, forKey: .natalHouse)) ?? "",
                      collateral: (try? c.decodeIfPresent(Bool.self, forKey: .collateral)) ?? false)
        }
    }

    public struct Relation: Decodable, Identifiable, Sendable, Equatable {
        public let id: String
        public let name: String
        public let nation: String
        public let ruling: Bool
        public let score: Double
        public let married: Bool
        public let label: String
        public init(id: String, name: String, nation: String = "", ruling: Bool = false, score: Double = 0, married: Bool = false, label: String = "中立") {
            self.id = id; self.name = name; self.nation = nation; self.ruling = ruling
            self.score = score.isFinite ? score : 0; self.married = married; self.label = label
        }
    }
    public struct Event: Decodable, Identifiable, Sendable, Equatable {
        public let day: Int
        public let text: String
        public var id: String { "\(day)-\(text)" }
        public init(day: Int, text: String) { self.day = day; self.text = text }
    }

    public let surname: String
    public let head: Int
    public let heir: Int
    public let ruling: Bool
    public let influence: Double
    public let wealth: Double
    public let allowFemale: Bool
    public let culture: String
    public let nationId: String
    public let nationName: String
    public let provinces: [String]
    /// 世家往来（同国各族与有姻亲/往来的外邦世家）。
    public let relations: [Relation]
    /// 本族近期大事记。
    public let events: [Event]
    /// 去重后的本支成员（同一 ID 只留第一次出现的那位）。
    public let members: [Member]
    /// 旁系宗亲成员（与本支去重）。
    public let collaterals: [Member]
    /// 成员 ID → 成员（含本支与旁系）。
    public let byId: [Int: Member]
    /// 按血缘分代：族内找不到父母者为第一代，子女在父母下一代；每代内年长者在前，同龄按 ID。
    public let generations: [[Member]]

    public init(surname: String, head: Int, members: [Member], heir: Int = 0, ruling: Bool = false,
                influence: Double = 0, wealth: Double = 0, allowFemale: Bool = false,
                culture: String = "", nationId: String = "", nationName: String = "",
                provinces: [String] = [], relations: [Relation] = [], events: [Event] = [],
                collaterals: [Member] = []) {
        var seen = Set<Int>(), unique = [Member](), uniqueCol = [Member]()
        for m in members where seen.insert(m.id).inserted { unique.append(m) }
        for m in collaterals where seen.insert(m.id).inserted { uniqueCol.append(m) }
        self.surname = surname; self.head = head; self.heir = heir
        self.ruling = ruling
        self.influence = influence.isFinite ? influence : 0
        self.wealth = wealth.isFinite ? wealth : 0
        self.allowFemale = allowFemale; self.culture = culture
        self.nationId = nationId; self.nationName = nationName
        self.provinces = provinces; self.relations = relations; self.events = events
        self.members = unique; self.collaterals = uniqueCol
        let byId = Dictionary((unique + uniqueCol).map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        self.byId = byId
        self.generations = Self.generations(unique, byId)
    }
    enum Keys: String, CodingKey { case surname, head, heir, ruling, influence, wealth, allowFemale, culture, nationId, nationName, provinces, relations, events, members, collaterals }
    private struct Lossy: Decodable {
        let member: Member?
        init(from decoder: Decoder) throws { member = try? Member(from: decoder) }
    }
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: Keys.self)
        let head = (try? c.decodeIfPresent(Int.self, forKey: .head)) ?? 0
        let heir = (try? c.decodeIfPresent(Int.self, forKey: .heir)) ?? 0
        let ruling = (try? c.decodeIfPresent(Bool.self, forKey: .ruling)) ?? false
        let influence = (try? c.decodeIfPresent(Double.self, forKey: .influence)) ?? 0
        let wealth = (try? c.decodeIfPresent(Double.self, forKey: .wealth)) ?? 0
        let allowFemale = (try? c.decodeIfPresent(Bool.self, forKey: .allowFemale)) ?? false
        let culture = (try? c.decodeIfPresent(String.self, forKey: .culture)) ?? ""
        let nationId = (try? c.decodeIfPresent(String.self, forKey: .nationId)) ?? ""
        let nationName = (try? c.decodeIfPresent(String.self, forKey: .nationName)) ?? ""
        let provinces = (try? c.decodeIfPresent([String].self, forKey: .provinces)) ?? []
        let relations = (try? c.decodeIfPresent([Relation].self, forKey: .relations)) ?? []
        let events = (try? c.decodeIfPresent([Event].self, forKey: .events)) ?? []
        let members = (try? c.decodeIfPresent([Lossy].self, forKey: .members))?.compactMap(\.member) ?? []
        let collaterals = (try? c.decodeIfPresent([Lossy].self, forKey: .collaterals))?.compactMap(\.member) ?? []
        self.init(surname: (try? c.decodeIfPresent(String.self, forKey: .surname)) ?? "", head: head, members: members,
                  heir: heir, ruling: ruling, influence: influence, wealth: wealth, allowFemale: allowFemale,
                  culture: culture, nationId: nationId, nationName: nationName, provinces: provinces,
                  relations: relations, events: events, collaterals: collaterals)
    }

    /// 家主（在成员中才算）。
    public var headMember: Member? { head > 0 ? byId[head] : nil }
    /// 继承人（在成员中才算）。
    public var heirMember: Member? { heir > 0 ? byId[heir] : nil }
    /// 配偶（在族内才显示）。
    public func spouse(of m: Member) -> Member? { m.spouse > 0 && m.spouse != m.id ? byId[m.spouse] : nil }
    /// 在族内可追溯的生父或生母（供展示支系归属）。
    public func parent(of m: Member) -> Member? {
        if m.father > 0 && m.father != m.id, let f = byId[m.father] { return f }
        if m.mother > 0 && m.mother != m.id, let mo = byId[m.mother] { return mo }
        return nil
    }

    /// 分代：沿族内的父（无则母）向上找到已知代数者或无父母者；亲缘成环时在环上第一次重复处断开，
    /// 自己是自己父母的记录视同无父母。只用迭代，不会因深链或环而爆栈。
    static func generations(_ members: [Member], _ byId: [Int: Member]) -> [[Member]] {
        let own = Set(members.map(\.id))
        func parent(_ m: Member) -> Int? {
            if m.father != m.id, own.contains(m.father) { return m.father }
            if m.mother != m.id, own.contains(m.mother) { return m.mother }
            return nil
        }
        var depth = [Int: Int]()
        for m in members where depth[m.id] == nil {
            var path = [Int](), onPath = Set<Int>(), cur = m.id, base = -1
            while true {
                if let d = depth[cur] { base = d; break }
                guard onPath.insert(cur).inserted else { break }
                path.append(cur)
                guard let next = byId[cur].flatMap(parent) else { break }
                cur = next
            }
            for (i, id) in path.reversed().enumerated() { depth[id] = base + 1 + i }
        }
        var out = [[Member]]()
        let order = members.sorted { $0.age != $1.age ? $0.age > $1.age : $0.id < $1.id }
        for m in order {
            let d = max(0, depth[m.id] ?? 0)
            while out.count <= d { out.append([]) }
            out[d].append(m)
        }
        return out.filter { !$0.isEmpty }
    }

    /// 中文序数（一、二……十九、20……），用于「第某代」。
    public static func numeral(_ n: Int) -> String {
        let d = Array("零一二三四五六七八九")
        guard n >= 0 else { return String(n) }
        return n < 10 ? String(d[n]) : n < 20 ? "十" + (n % 10 == 0 ? "" : String(d[n % 10])) : String(n)
    }
}
