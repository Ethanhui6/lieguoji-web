import Foundation

/// App-only arms (with app rules on): the original's five units plus spearmen, crossbows, heavy
/// cavalry, horse archers and one unique troop per culture family. Each kind borrows the terrain
/// table of an original unit, scales its power and speed, and belongs to a class that counters
/// others in battle (spears break horse, horse rides down archers, archers wear down foot…).
public enum UnitKinds {
    public enum Role: String, Sendable { case infantry, spear, shield, archer, crossbow, cavalry, heavy, horseArcher, elite, elephant }
    public struct Kind: Sendable {
        public let key: String, name: String, role: Role, base: String, power: Double, speed: Double, note: String
    }
    public static let kinds: [Kind] = [
        Kind(key: "Infantry", name: "步兵", role: .infantry, base: "Infantry", power: 1, speed: 1, note: "均衡，克枪兵与弓兵"),
        Kind(key: "Archer", name: "弓兵", role: .archer, base: "Archer", power: 0.95, speed: 0.95, note: "克步兵、枪兵；林地与山地坚守"),
        Kind(key: "Shield", name: "盾兵", role: .shield, base: "Shield", power: 1.05, speed: 0.9, note: "不惧箭矢，山地最稳"),
        Kind(key: "Cavalry", name: "骑兵", role: .cavalry, base: "Cavalry", power: 1.25, speed: 1.2, note: "平原冲锋克弓弩；畏枪兵，入林山则弱"),
        Kind(key: "Elite", name: "精锐", role: .elite, base: "Elite", power: 1.35, speed: 1.05, note: "百战之师，无明显弱点"),
        Kind(key: "Spear", name: "枪兵", role: .spear, base: "Infantry", power: 1.05, speed: 0.95, note: "长枪拒马，克骑兵与战象"),
        Kind(key: "Crossbow", name: "弩兵", role: .crossbow, base: "Archer", power: 1.0, speed: 0.9, note: "强弩穿甲，克重骑与战象"),
        Kind(key: "HeavyCavalry", name: "重骑", role: .heavy, base: "Cavalry", power: 1.45, speed: 1.05, note: "披甲冲阵，平原无敌；畏枪弩"),
        Kind(key: "HorseArcher", name: "骑射", role: .horseArcher, base: "Cavalry", power: 1.15, speed: 1.4, note: "来去如风，袭扰步卒"),
        // Unique troops (by culture).
        Kind(key: "Samurai", name: "武士", role: .elite, base: "Elite", power: 1.45, speed: 1.05, note: "日本特色：精锐中的精锐"),
        Kind(key: "Legion", name: "军团", role: .shield, base: "Shield", power: 1.25, speed: 0.95, note: "罗马特色：重盾方阵，攻守俱佳"),
        Kind(key: "Elephant", name: "战象", role: .elephant, base: "Infantry", power: 1.5, speed: 0.85, note: "印度、越南特色：冲垮步阵，惊散马群；畏枪弩"),
        Kind(key: "Longbow", name: "长弓", role: .archer, base: "Archer", power: 1.15, speed: 0.95, note: "英格兰特色：远射压制骑兵"),
        Kind(key: "Mamluk", name: "马穆鲁克", role: .heavy, base: "Cavalry", power: 1.4, speed: 1.15, note: "阿拉伯、埃及特色：奴隶骑士"),
        Kind(key: "Keshig", name: "怯薛", role: .horseArcher, base: "Cavalry", power: 1.3, speed: 1.45, note: "蒙古、突厥特色：可汗亲卫骑射"),
        Kind(key: "Repeater", name: "连弩", role: .crossbow, base: "Archer", power: 1.15, speed: 0.9, note: "中华、朝鲜特色：诸葛连弩，箭如雨下"),
        Kind(key: "Berserker", name: "狂战士", role: .infantry, base: "Elite", power: 1.35, speed: 1.05, note: "北欧特色：悍不畏死"),
        Kind(key: "Phalanx", name: "方阵", role: .spear, base: "Shield", power: 1.2, speed: 0.9, note: "希腊特色：长矛方阵，骑兵难近"),
        Kind(key: "Cataphract", name: "具装骑兵", role: .heavy, base: "Cavalry", power: 1.5, speed: 1.0, note: "波斯特色：人马俱甲"),
        Kind(key: "Knight", name: "骑士", role: .heavy, base: "Cavalry", power: 1.5, speed: 1.05, note: "法兰西、西班牙特色：重甲冲锋"),
        Kind(key: "Landsknecht", name: "长枪佣兵", role: .spear, base: "Infantry", power: 1.2, speed: 1.0, note: "日耳曼、尼德兰特色：长枪方阵"),
        Kind(key: "Hussar", name: "翼骑兵", role: .cavalry, base: "Cavalry", power: 1.4, speed: 1.3, note: "波兰、匈牙利特色：疾驰突击"),
        Kind(key: "Jaguar", name: "美洲豹武士", role: .infantry, base: "Elite", power: 1.3, speed: 1.05, note: "阿兹特克、印加特色：林间猛袭"),
        Kind(key: "Streltsy", name: "射击军", role: .crossbow, base: "Archer", power: 1.15, speed: 0.95, note: "斯拉夫特色：火绳枪兵"),
    ]
    public static let byKey: [String: Kind] = Dictionary(uniqueKeysWithValues: kinds.map { ($0.key, $0) })
    public static let original: Set<String> = ["Infantry", "Archer", "Shield", "Cavalry", "Elite"]
    public static func name(_ key: String) -> String { byKey[key]?.name ?? key }

    /// Each culture's armies: weights over the common kinds, and its unique troop.
    static let unique: [String: String] = [
        "japanese": "Samurai", "roman": "Legion", "italian": "Legion", "indian": "Elephant", "vietnamese": "Elephant", "english": "Longbow",
        "arab": "Mamluk", "egyptian": "Mamluk", "mongol": "Keshig", "turkic": "Keshig", "tibetan": "Keshig", "chinese": "Repeater", "korean": "Repeater",
        "norse": "Berserker", "greek": "Phalanx", "persian": "Cataphract", "french": "Knight", "spanish": "Knight", "portuguese": "Knight",
        "german": "Landsknecht", "dutch": "Landsknecht", "polish": "Hussar", "hungarian": "Hussar", "aztec": "Jaguar", "inca": "Jaguar", "slavic": "Streltsy",
    ]
    static let steppe: Set<String> = ["mongol", "turkic", "tibetan", "arab", "persian", "hungarian"]
    /// Weighted roster for a culture (sums need not be 100).
    public static func roster(_ culture: String) -> [(String, Int)] {
        let horse = steppe.contains(culture)
        var out: [(String, Int)] = [("Infantry", horse ? 10 : 22), ("Spear", 14), ("Archer", 12), ("Crossbow", horse ? 4 : 9), ("Shield", horse ? 5 : 11),
                                    ("Cavalry", horse ? 18 : 10), ("HeavyCavalry", horse ? 8 : 5), ("HorseArcher", horse ? 20 : 4), ("Elite", 4)]
        if let u = unique[culture] { out.append((u, 9)) }
        return out
    }
    /// A deterministic pick for an army (by its id), from its culture's roster.
    public static func pick(culture: String, id: String) -> Kind {
        var h: UInt32 = 2166136261
        for u in id.utf8 { h = (h ^ UInt32(u)) &* 16777619 }
        let r = roster(culture), total = r.reduce(0) { $0 + $1.1 }
        var x = Int(h % UInt32(max(1, total)))
        for (k, w) in r { if x < w { return byKey[k]! }; x -= w }
        return byKey["Infantry"]!
    }

    /// Damage multiplier of `attacker` hitting `victim` (unit keys).
    public static func counter(_ attacker: String, _ victim: String) -> Double {
        guard let a = byKey[attacker]?.role, let v = byKey[victim]?.role else { return 1 }
        switch (a, v) {
        case (.spear, .cavalry), (.spear, .heavy), (.spear, .horseArcher): return 1.4
        case (.spear, .elephant): return 1.25
        case (.cavalry, .archer), (.cavalry, .crossbow), (.heavy, .archer), (.heavy, .crossbow): return 1.35
        case (.cavalry, .infantry), (.heavy, .infantry), (.heavy, .shield): return 1.1
        case (.cavalry, .spear), (.heavy, .spear): return 0.75
        case (.archer, .infantry), (.archer, .spear), (.archer, .elephant): return 1.2
        case (.archer, .shield), (.horseArcher, .shield): return 0.8
        case (.crossbow, .heavy), (.crossbow, .elephant): return 1.35
        case (.crossbow, .cavalry), (.crossbow, .shield): return 1.1
        case (.horseArcher, .infantry), (.horseArcher, .spear), (.horseArcher, .elephant): return 1.2
        case (.horseArcher, .crossbow): return 0.85
        case (.infantry, .spear), (.infantry, .archer), (.infantry, .crossbow): return 1.15
        case (.shield, .infantry), (.shield, .archer): return 1.05
        case (.elephant, .infantry), (.elephant, .spear), (.elephant, .shield): return 1.25
        case (.elephant, .cavalry), (.elephant, .heavy), (.elephant, .horseArcher): return 1.15
        default: return 1
        }
    }

    /// Switched on with the app rules; the original's runs never see the new kinds.
    public static var enabled = false
}
