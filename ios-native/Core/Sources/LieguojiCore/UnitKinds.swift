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
        // Gunpowder era (1450..<1860)
        Kind(key: "LineInfantry", name: "线列步兵", role: .infantry, base: "Infantry", power: 1.25, speed: 1.0, note: "火器时代：燧发枪齐射与刺刀方阵主力"),
        Kind(key: "Cuirassier", name: "胸甲骑兵", role: .heavy, base: "Cavalry", power: 1.45, speed: 1.25, note: "火器时代：重甲骑兵冲击，克制野战炮兵与线列侧翼"),
        Kind(key: "FieldArtillery", name: "野战炮兵", role: .crossbow, base: "Archer", power: 1.50, speed: 0.90, note: "火器时代：拿破仑式野战炮群，远程霰弹与破城压制"),
        Kind(key: "MatchlockAshigaru", name: "铁炮足轻", role: .archer, base: "Archer", power: 1.30, speed: 0.98, note: "东亚火器特色：三段击火绳枪阵，压制冲锋骑兵"),
        // WWI industrial trench era (1860..<1930)
        Kind(key: "TrenchInfantry", name: "堑壕步兵师", role: .shield, base: "Shield", power: 1.40, speed: 0.98, note: "一战工业军：栓动步枪与重机枪阵地，守御稳固"),
        Kind(key: "HeavyArtillery", name: "重炮旅", role: .crossbow, base: "Archer", power: 1.65, speed: 0.88, note: "一战工业军：大口径榴弹重炮，轰碎坚固堑壕与要塞"),
        Kind(key: "EarlyTank", name: "早期坦克营", role: .heavy, base: "Cavalry", power: 1.70, speed: 1.10, note: "一战工业军：装甲履带突破战车，碾压步兵堑壕"),
        Kind(key: "Stormtrooper", name: "突击步兵营", role: .elite, base: "Elite", power: 1.60, speed: 1.15, note: "一战工业军：渗透奇袭精锐，瓦解防线与炮兵阵地"),
        // WWII mechanized era (1930..<1955)
        Kind(key: "MechInfantry", name: "机械化步兵师", role: .infantry, base: "Infantry", power: 1.75, speed: 1.25, note: "二战机械化：半履带步战协同，全域机动主力"),
        Kind(key: "ArmoredDivision", name: "重装装甲师", role: .heavy, base: "Cavalry", power: 2.10, speed: 1.35, note: "二战机械化：中重型坦克集群，闪电战钢铁突击矛头"),
        Kind(key: "Airborne", name: "空降突击师", role: .elite, base: "Elite", power: 1.85, speed: 1.45, note: "二战机械化：高速垂直机降奇袭，穿插敌后要害"),
        Kind(key: "MarineDiv", name: "海军陆战师", role: .shield, base: "Shield", power: 1.80, speed: 1.15, note: "二战与现代两栖：专精跨海抢滩与要塞攻坚"),
        // Cold War & Modern combined-arms era (>= 1955)
        Kind(key: "CombinedArms", name: "合成装甲旅", role: .heavy, base: "Cavalry", power: 2.25, speed: 1.40, note: "现代合成军：主战坦克与信息化步战车合成主力"),
        Kind(key: "AirAssault", name: "空中突击旅", role: .elite, base: "Elite", power: 2.05, speed: 1.55, note: "现代合成军：武装直升机与高机动空中突击群"),
        Kind(key: "RocketArtillery", name: "战略火箭炮旅", role: .crossbow, base: "Archer", power: 2.20, speed: 1.15, note: "现代合成军：精确制导远程火箭炮与战术导弹打击"),
    ]
    public static let byKey: [String: Kind] = Dictionary(uniqueKeysWithValues: kinds.map { ($0.key, $0) })
    public static let original: Set<String> = ["Infantry", "Archer", "Shield", "Cavalry", "Elite"]
    public static let ancientKeys: Set<String> = [
        "Infantry", "Archer", "Shield", "Cavalry", "Elite", "Spear", "Crossbow", "HeavyCavalry", "HorseArcher",
        "Samurai", "Legion", "Elephant", "Longbow", "Mamluk", "Keshig", "Repeater", "Berserker", "Phalanx",
        "Cataphract", "Knight", "Landsknecht", "Hussar", "Jaguar", "Streltsy",
    ]
    public static let gunpowderKeys: Set<String> = ["LineInfantry", "Cuirassier", "FieldArtillery", "MatchlockAshigaru"]
    public static let ww1Keys: Set<String> = ["TrenchInfantry", "HeavyArtillery", "EarlyTank", "Stormtrooper"]
    public static let ww2Keys: Set<String> = ["MechInfantry", "ArmoredDivision", "Airborne", "MarineDiv"]
    public static let modernKeys: Set<String> = ["CombinedArms", "AirAssault", "RocketArtillery", "MarineDiv"]
    public static func name(_ key: String) -> String { byKey[key]?.name ?? key }

    /// 某历史时代严格允许使用的全部兵种键集合。
    public static func allowedKeys(for era: HistoricalEra) -> Set<String> {
        switch era {
        case .antiquity: return ancientKeys.subtracting(["Streltsy"])
        case .medieval:  return ancientKeys
        case .gunpowder: return gunpowderKeys
        case .ww1:       return ww1Keys
        case .ww2:       return ww2Keys
        case .modern:    return modernKeys
        }
    }

    /// 检查某兵种是否属于指定时代的合法编制。
    public static func isAllowed(_ key: String, in era: HistoricalEra) -> Bool {
        allowedKeys(for: era).contains(key)
    }

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
    /// 严格按历史时代、文化与本国军事科技/工业实力返回加权兵种池（绝不让低科技弱国刷出满编重装甲师与机械化师！）。
    public static func rosterForEra(_ era: HistoricalEra, culture: String, techMil: Int = 4, industryIndex: Double = 1.0) -> [(String, Int)] {
        switch era {
        case .antiquity:
            return roster(culture).filter { $0.0 != "Streltsy" }
        case .medieval:
            return roster(culture)
        case .gunpowder:
            if culture == "japanese" {
                return [("MatchlockAshigaru", 42), ("LineInfantry", 26), ("FieldArtillery", 18), ("Cuirassier", 14)]
            }
            if ["chinese", "korean", "vietnamese"].contains(culture) {
                return [("LineInfantry", 38), ("MatchlockAshigaru", 24), ("FieldArtillery", 22), ("Cuirassier", 16)]
            }
            if steppe.contains(culture) || ["french", "polish", "hungarian"].contains(culture) {
                return [("LineInfantry", 40), ("Cuirassier", 34), ("FieldArtillery", 26)]
            }
            return [("LineInfantry", 48), ("FieldArtillery", 28), ("Cuirassier", 24)]
        case .ww1:
            if techMil <= 2 || industryIndex < 0.72 {
                // 农业/弱工业军阀：以步枪堑壕与野炮为主，无坦克编制
                return [("TrenchInfantry", 64), ("FieldArtillery", 22), ("Cavalry", 14)]
            }
            if techMil == 3 || industryIndex < 1.15 {
                return [("TrenchInfantry", 50), ("HeavyArtillery", 28), ("Stormtrooper", 16), ("EarlyTank", 6)]
            }
            if culture == "german" || culture == "hungarian" {
                return [("TrenchInfantry", 36), ("HeavyArtillery", 24), ("Stormtrooper", 24), ("EarlyTank", 16)]
            }
            if culture == "english" || culture == "french" {
                return [("TrenchInfantry", 36), ("HeavyArtillery", 24), ("EarlyTank", 26), ("Stormtrooper", 14)]
            }
            return [("TrenchInfantry", 44), ("HeavyArtillery", 26), ("Stormtrooper", 16), ("EarlyTank", 14)]
        case .ww2:
            if techMil <= 2 || industryIndex < 0.65 {
                // 弱工业/游击/军阀部队（如1931地方军阀、延安、弱小国）：拉栓步兵、迫击炮与少量骑兵，严禁刷重装甲与机械化师！
                return [("TrenchInfantry", 68), ("FieldArtillery", 18), ("Cavalry", 14)]
            }
            if techMil == 3 || industryIndex < 1.15 {
                // 中等工业国（波兰、民国中央军、意大利、巴尔干诸国）：以步兵与重炮为主，极少装甲
                return [("TrenchInfantry", 54), ("HeavyArtillery", 22), ("MechInfantry", 16), ("ArmoredDivision", 8)]
            }
            if techMil >= 5 && industryIndex >= 1.80 {
                // 顶尖工业列强（二战德、美、苏、英主力）：高比例装甲集群与机械化突击师
                if culture == "japanese" || culture == "english" {
                    return [("MechInfantry", 32), ("MarineDiv", 26), ("ArmoredDivision", 26), ("Airborne", 16)]
                }
                return [("ArmoredDivision", 40), ("MechInfantry", 34), ("Airborne", 16), ("MarineDiv", 10)]
            }
            if culture == "japanese" || culture == "english" {
                return [("MechInfantry", 34), ("MarineDiv", 28), ("ArmoredDivision", 22), ("Airborne", 16)]
            }
            if culture == "german" || culture == "slavic" || culture == "french" {
                return [("MechInfantry", 36), ("ArmoredDivision", 34), ("Airborne", 18), ("MarineDiv", 12)]
            }
            return [("MechInfantry", 40), ("ArmoredDivision", 26), ("Airborne", 18), ("MarineDiv", 16)]
        case .modern:
            if techMil <= 2 || industryIndex < 0.70 {
                return [("TrenchInfantry", 58), ("HeavyArtillery", 24), ("MechInfantry", 18)]
            }
            if techMil <= 3 || industryIndex < 1.20 {
                return [("MechInfantry", 46), ("ArmoredDivision", 24), ("RocketArtillery", 18), ("MarineDiv", 12)]
            }
            if culture == "japanese" || culture == "english" {
                return [("CombinedArms", 34), ("MarineDiv", 26), ("AirAssault", 22), ("RocketArtillery", 18)]
            }
            return [("CombinedArms", 42), ("RocketArtillery", 22), ("AirAssault", 22), ("MarineDiv", 14)]
        }
    }
    /// A deterministic pick for an army (by its id), from its culture's roster.
    public static func pick(culture: String, id: String) -> Kind {
        var h: UInt32 = 2166136261
        for u in id.utf8 { h = (h ^ UInt32(u)) &* 16777619 }
        let r = roster(culture), total = r.reduce(0) { $0 + $1.1 }
        var x = Int(h % UInt32(max(1, total)))
        for (k, w) in r { if x < w, let kind = byKey[k] { return kind }; x -= w }
        return byKey["Infantry"] ?? kinds[0]
    }
    /// 严格时代 + 本国科技/工业门控的确定性兵种抽选（低科技弱国绝不刷装甲师与机械化师）。
    public static func pickForEra(_ era: HistoricalEra, culture: String, id: String, techMil: Int = 4, industryIndex: Double = 1.0) -> Kind {
        var h: UInt32 = 2166136261
        for u in id.utf8 { h = (h ^ UInt32(u)) &* 16777619 }
        let r = rosterForEra(era, culture: culture, techMil: techMil, industryIndex: industryIndex)
        let total = r.reduce(0) { $0 + $1.1 }
        var x = Int(h % UInt32(max(1, total)))
        for (k, w) in r {
            if x < w, let kind = byKey[k] { return kind }
            x -= w
        }
        if let first = r.first?.0, let kind = byKey[first] { return kind }
        return byKey["Infantry"] ?? kinds[0]
    }

    /// v12.0.0 按本国真实军事科技、工业产值、制空权与海军科技生成**本国现役主力装备谱系**（绝不再让延安和美国同显航母原子弹！）。
    public static func nationEquipmentSummary(era: HistoricalEra, milTech: Int, navTech: Int, ic: Int, airPower: Int) -> String {
        switch era {
        case .ww2, .modern:
            let land: String
            if milTech >= 6 && ic >= 50 { land = era == .modern ? "主战坦克合成军 · 精确制导重炮" : "虎/豹/谢尔曼重装集群 · 机械化闪击师" }
            else if milTech >= 5 && ic >= 30 { land = "中型坦克师 · 装甲掷弹兵 · 自行火炮" }
            else if milTech >= 4 && ic >= 16 { land = "轻中型坦克旅 · 摩托化步兵 · 师属重炮" }
            else if milTech >= 3 { land = "正规步枪师 · 山野榴弹炮 · 反坦克炮" }
            else { land = "轻步兵武器 · 迫击炮 · 游击机动编制" }
            let air: String
            if airPower >= 75 { air = "战略重轰与制空战机联队" }
            else if airPower >= 45 { air = "战术俯冲轰炸与前线航空队" }
            else if airPower >= 18 { air = "少量侦察/驱逐机中队" }
            else { air = "缺乏现代空军掩护" }
            let sea: String
            if navTech >= 5 && ic >= 35 { sea = "航母特混与战列舰队" }
            else if navTech >= 3 { sea = "巡洋/驱逐舰队" }
            else { sea = "近岸炮艇防卫" }
            return "\(land) · \(air) · \(sea)"
        case .ww1:
            if milTech >= 5 { return "重炮弹幕群 · 风暴突击队 · 早期坦克 · 侦察航空兵" }
            if milTech >= 3 { return "栓动步枪堑壕师 · 马克沁重机枪 · 榴弹炮" }
            return "旧式步枪与骑兵旅 · 少量野炮"
        case .gunpowder:
            if milTech >= 4 { return "燧发线列步兵 · 拿破仑野战炮群 · 胸甲重骑" }
            return "火绳枪足轻/鸟铳营 · 轻型佛朗机炮"
        case .medieval:
            return milTech >= 4 ? "重装铁甲骑兵 · 劲弩长枪阵 · 攻城抛石机" : "常备步骑营 · 弓弩手 · 刀盾兵"
        case .antiquity:
            return milTech >= 4 ? "铁剑重步方阵 · 强弩车骑 · 攻城云梯" : "青铜戈矛步卒 · 战车弓手"
        }
    }

    /// Damage multiplier of `attacker` hitting `victim` (unit keys).
    public static func counter(_ attacker: String, _ victim: String) -> Double {
        // Era-specific tactical counters for gunpowder / WWI / WWII / Modern rosters
        switch (attacker, victim) {
        case ("Cuirassier", "FieldArtillery"), ("Cuirassier", "MatchlockAshigaru"): return 1.35
        case ("FieldArtillery", "LineInfantry"), ("FieldArtillery", "MatchlockAshigaru"): return 1.25
        case ("MatchlockAshigaru", "Cuirassier"), ("LineInfantry", "Cuirassier"): return 1.15
        case ("HeavyArtillery", "TrenchInfantry"), ("EarlyTank", "TrenchInfantry"): return 1.28
        case ("Stormtrooper", "HeavyArtillery"), ("Stormtrooper", "TrenchInfantry"): return 1.22
        case ("ArmoredDivision", "MechInfantry"), ("ArmoredDivision", "MarineDiv"): return 1.22
        case ("Airborne", "HeavyArtillery"), ("Airborne", "FieldArtillery"), ("Airborne", "RocketArtillery"): return 1.30
        case ("CombinedArms", "MarineDiv"), ("CombinedArms", "MechInfantry"): return 1.22
        case ("RocketArtillery", "CombinedArms"), ("RocketArtillery", "MarineDiv"), ("RocketArtillery", "ArmoredDivision"): return 1.20
        case ("AirAssault", "RocketArtillery"), ("AirAssault", "CombinedArms"): return 1.25
        default: break
        }
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
