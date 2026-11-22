import Foundation

/// 真实历史君主年号／世数／尊号体系、扩展人物个性特质与丰富动态事件库（App 规则专用，不影响网页逐字节对照测试）：
/// - 日本天皇无姓氏、一世一元、配正统日本年号（如「明治天皇 · 睦仁（明治三年）」，皇室标注「皇室（无姓）」）；
/// - 中华／朝鲜／越南皇帝与国王配正统年号、在位年次与庙号（如「太宗 · 贞观皇帝 李文昭（贞观五年）」）；
/// - 欧美／斯拉夫／中东／地中海君主配真实世数与尊号（如「伊丽莎白二世」「路易十四」「彼得大帝」「苏莱曼一世」）；
/// - 16 项鲜明历史人物性格特质（带可感知的税收、战力、安定、外交与政局修正）；
/// - 24 项深度历史／朝堂／经济／军事／文化随机事件。
public enum MonarchLore {

    // MARK: - 1. 真实历代君主年号、世数与尊号

    public struct RulerHonor: Sendable {
        /// 完整在位尊称（如「贞观皇帝 李文昭」「明治天皇 睦仁」「伊丽莎白二世女王」「彼得大帝」）。
        public let styledName: String
        /// 年号（中华/日本/朝鲜/越南君主专用，如「贞观」「明治」；其余文明为空）。
        public let eraName: String
        /// 在位年号纪年（如「贞观三年」「明治元年」）。
        public let eraYearText: String
        /// 庙号或历史尊号/绰号（如「太祖」「大帝」「征服者」「贤王」「狮心王」）。
        public let honorific: String
        /// 展示用本名（日本天皇自动去姓氏，其余文明沿用文化姓名顺序）。
        public let cleanPersonalName: String
        /// 是否属于无姓氏的日本皇室。
        public let surnameLessImperial: Bool
    }

    static let chineseEras: [String] = [
        "建元", "太初", "元狩", "神爵", "建武", "永平", "永元", "开皇", "大业",
        "武德", "贞观", "永徽", "开元", "天宝", "元和", "会昌", "大中", "咸通",
        "建隆", "开宝", "太平兴国", "咸平", "景德", "天圣", "庆历", "嘉祐", "熙宁", "元丰", "绍兴", "乾道", "淳熙",
        "中统", "至元", "大德", "延祐", "至正",
        "洪武", "建文", "永乐", "洪熙", "宣德", "正统", "景泰", "天顺", "成化", "弘治", "正德", "嘉靖", "隆庆", "万历",
        "顺治", "康熙", "雍正", "乾隆", "嘉庆", "道光", "咸丰", "同治", "光绪", "宣统",
        "泰始", "太康", "咸宁", "明道", "至和", "端平", "景定", "隆兴", "开禧", "淳化",
    ]

    static let japaneseEras: [String] = [
        "大化", "白雉", "和铜", "天平", "延历", "弘仁", "贞观", "延喜", "天历",
        "宽弘", "长元", "康和", "天仁", "保元", "治承", "建久", "贞永", "文永", "弘安",
        "建武", "应永", "永享", "文明", "明应", "永正", "大永", "天文", "弘治", "永禄",
        "元龟", "天正", "文禄", "庆长", "元和", "宽永", "正保", "明历", "万治", "宽文",
        "延宝", "贞享", "元禄", "宝永", "正德", "享保", "元文", "宽保", "宝历", "明和",
        "安永", "天明", "宽政", "享和", "文化", "文政", "天保", "弘化", "嘉永", "安政",
        "万延", "文久", "庆应", "明治", "大正", "昭和", "平成", "令和",
    ]

    static let sinosphereCultures: Set<String> = ["chinese", "korean", "vietnamese"]

    /// 所有实行「名字 + 世数」传统（如 伊丽莎白二世、路易十四、腓特烈三世）的君主文化。
    public static let regnalNumberCultures: Set<String> = [
        "english", "french", "german", "spanish", "portuguese", "italian", "dutch",
        "polish", "hungarian", "slavic", "norse", "greek", "roman", "persian", "arab", "turkic", "egyptian",
    ]

    private static let templeNames: [String] = [
        "太祖", "太宗", "高宗", "世宗", "仁宗", "宣宗", "宪宗", "孝宗",
        "武宗", "文宗", "英宗", "神宗", "圣宗", "昭宗", "穆宗", "德宗", "明宗", "敬宗",
    ]

    private static func hashU32(_ s: String) -> UInt32 {
        var h: UInt32 = 2166136261
        for u in s.utf8 { h = (h ^ UInt32(u)) &* 16777619 }
        return h
    }

    public static func chineseNumeral(_ n: Int) -> String {
        guard n > 0 else { return "一" }
        let d = Array("零一二三四五六七八九")
        if n < 10 { return String(d[n]) }
        if n < 20 { return "十" + (n % 10 == 0 ? "" : String(d[n % 10])) }
        if n < 100 {
            let hi = n / 10, lo = n % 10
            return String(d[hi]) + "十" + (lo == 0 ? "" : String(d[lo]))
        }
        return "\(n)"
    }

    /// 判断某君主是否为无姓氏的日本天皇（含女天皇）。
    public static func isJapaneseEmperor(culture: String, title: String, polity: String) -> Bool {
        guard culture == "japanese" else { return false }
        if title.contains("天皇") || title == "上皇" { return true }
        return polity == "Empire"
    }

    /// 为指定统治记录（reignId）稳定生成并缓存年号与世数（存入 r.regimes.reignLore，存档自动保留且确定性重放）。
    public static func honor(
        _ r: JS,
        nationId: String,
        reignId: String,
        order: Int,
        culture: String,
        polity: String,
        title: String,
        person: JS?,
        fallbackName: String,
        reignYears: Double,
        deltaProvs: Int,
        avgSkill: Double,
        isActive: Bool
    ) -> RulerHonor {
        let isMonarch = ["Kingdom", "Empire", "Theocracy"].contains(polity)
            && !title.contains("总统") && !title.contains("主席") && !title.contains("总书记") && !title.contains("执政官") && !title.contains("委员长")
        let isJPImperial = isJapaneseEmperor(culture: culture, title: title, polity: polity)

        // 1. 提取洁净的个人名（日本天皇绝不带姓氏！）
        let first = person?.firstName.optionalString ?? ""
        let rawName: String = {
            if let p = person { return NativeEngine.displayPersonName(p) }
            return fallbackName.isEmpty ? "无名" : fallbackName
        }()
        let personalName: String = {
            if isJPImperial {
                let g = first.trimmingCharacters(in: .whitespacesAndNewlines)
                if !g.isEmpty { return g }
                // 若旧档无拆分名，仅保留末 2 字作为天皇名讳
                return rawName.count > 2 ? String(rawName.suffix(2)) : rawName
            }
            return rawName
        }()

        guard isMonarch else {
            return RulerHonor(styledName: "\(title) \(personalName)", eraName: "", eraYearText: "", honorific: "", cleanPersonalName: personalName, surnameLessImperial: false)
        }

        // 2. 从 r.regimes.reignLore 读取或确定性生成年号与世数
        if !r.regimes.isNull && r.regimes.reignLore.isNull { r.regimes.reignLore = .object() }
        let loreKey = "\(nationId)|\(reignId)"
        let stored = (!r.regimes.isNull && !r.regimes.reignLore.isNull) ? r.regimes.reignLore[loreKey] : .null

        var era = stored.era.optionalString ?? ""
        var ordinal = stored.ordinal.optionalNumber.map(Int.init) ?? 0

        if era.isEmpty && (isJPImperial || sinosphereCultures.contains(culture)) {
            let pool = isJPImperial ? japaneseEras : chineseEras
            var usedEras = Set<String>()
            if !r.regimes.isNull && !r.regimes.reignLore.isNull {
                for (k, v) in r.regimes.reignLore.objectEntries where k.hasPrefix("\(nationId)|") {
                    if let e = v.era.optionalString, !e.isEmpty { usedEras.insert(e) }
                }
            }
            let seed = "\(r.world.custom.seed.optionalString ?? "")|\(nationId)|\(reignId)|era"
            let start = Int(hashU32(seed) % UInt32(pool.count))
            era = (0..<pool.count).lazy.map { pool[(start + $0) % pool.count] }.first { !usedEras.contains($0) } ?? pool[start]
            if !r.regimes.isNull && !r.regimes.reignLore.isNull {
                let row = stored.isNull ? JS.object() : stored
                row.era = JS(era)
                r.regimes.reignLore[loreKey] = row
            }
        }

        // 计算西方/欧亚君主名字世数（统计本国历代同名君主顺位：伊丽莎白一世 → 伊丽莎白二世）
        let givenKey = first.isEmpty ? personalName : first
        if ordinal <= 0 && regnalNumberCultures.contains(culture) {
            var count = 1
            let leadersRaw = (r.chronicle.isNull || r.chronicle.leaders.isNull) ? JS.null : r.chronicle.leaders[nationId]
            let leaders = leadersRaw.isArray ? leadersRaw.asArray : []
            for lg in leaders {
                let lgId = lg.id.optionalString ?? ""
                if lgId == reignId { break }
                let lgOrder = lg.order.optionalNumber.flatMap { $0.isFinite ? Int($0) : nil } ?? 0
                if lgOrder >= order && lgOrder > 0 { continue }
                let pid = (r.sovereignty.isNull || r.sovereignty.reigns.isNull) ? -1 : (r.sovereignty.reigns[lgId].optionalNumber.flatMap { $0.isFinite ? Int($0) : nil } ?? -1)
                let otherGiven: String = {
                    if pid > 0, let op = People.person(r, pid), let fn = op.firstName.optionalString, !fn.isEmpty { return fn }
                    let nm = lg.name.optionalString ?? ""
                    return nm.components(separatedBy: "·").first ?? nm
                }()
                if otherGiven == givenKey { count += 1 }
            }
            ordinal = count
            if !r.regimes.isNull && !r.regimes.reignLore.isNull {
                let row = r.regimes.reignLore[loreKey].isNull ? JS.object() : r.regimes.reignLore[loreKey]
                row.ordinal = JS(ordinal)
                r.regimes.reignLore[loreKey] = row
            }
        }

        // 3. 计算庙号或历史尊号/绰号（随战功、能力、特质真实动态显现）
        let traits = Set((person?.traits.isArray == true ? person!.traits.asArray.compactMap(\.optionalString) : []))
        let honorific: String = {
            if isJPImperial {
                return era.isEmpty ? "天皇" : "\(era)天皇"
            }
            if sinosphereCultures.contains(culture) {
                if !isActive || reignYears >= 6 {
                    if order == 1 { return "太祖" }
                    if order == 2 && (deltaProvs >= 2 || avgSkill >= 65) { return "太宗" }
                    if deltaProvs >= 5 || traits.contains("Conqueror") || traits.contains("Unifier") { return "武宗" }
                    if avgSkill >= 74 || traits.contains("Genius") || traits.contains("Visionary") { return "圣宗" }
                    if traits.contains("Benevolent") || traits.contains("Merciful") || traits.contains("Just") { return "仁宗" }
                    if traits.contains("Reformer") || traits.contains("Scholar") { return "文宗" }
                    if deltaProvs <= -4 { return "哀宗" }
                    return templeNames[max(0, (order - 1) % templeNames.count)]
                }
                return ""
            }
            // 西方/中东/欧陆尊号（绰号）
            if deltaProvs >= 6 || (avgSkill >= 76 && reignYears >= 8) { return "大帝" }
            if deltaProvs >= 4 || traits.contains("Conqueror") || traits.contains("Unifier") { return "征服者" }
            if traits.contains("IronFist") || traits.contains("Hawkish") && avgSkill >= 68 { return "铁腕王" }
            if traits.contains("Brave") && avgSkill >= 65 { return "狮心王" }
            if traits.contains("Lawgiver") || traits.contains("Just") && avgSkill >= 68 { return "立法者" }
            if traits.contains("Benevolent") || traits.contains("Merciful") { return "宽仁王" }
            if traits.contains("Cruel") || traits.contains("Tyrant") { return "残暴者" }
            if traits.contains("Scholar") || traits.contains("Genius") { return "贤明王" }
            if deltaProvs <= -4 { return "失地王" }
            return ""
        }()

        let safeReignYears = reignYears.isFinite ? max(0, reignYears) : 0
        let yr = max(1, Int(safeReignYears.rounded(.down)) + 1)
        let eraYearText = era.isEmpty ? "" : "\(era)\(yr == 1 ? "元" : chineseNumeral(yr))年"

        let styledName: String
        if isJPImperial {
            // 日本天皇：无姓氏，如「明治天皇 · 睦仁」
            styledName = era.isEmpty ? "\(title) \(personalName)" : "\(era)\(title) · \(personalName)"
        } else if sinosphereCultures.contains(culture) {
            // 中华/东亚：如「贞观皇帝 李文昭」或「太宗 贞观皇帝 李文昭」
            let prefix = (!isActive && !honorific.isEmpty) ? "\(honorific)·" : ""
            styledName = era.isEmpty ? "\(prefix)\(title) \(personalName)" : "\(prefix)\(era)\(title) \(personalName)"
        } else if regnalNumberCultures.contains(culture) {
            // 西方/中东：如「伊丽莎白二世」「路易十四」「彼得一世（大帝）」
            let numLabel = "\(givenKey)\(chineseNumeral(max(1, ordinal)))世"
            let suffix = honorific.isEmpty ? "" : "（\(honorific)）"
            styledName = "\(numLabel)\(suffix)"
        } else {
            styledName = honorific.isEmpty ? "\(title) \(personalName)" : "\(title) \(personalName)（\(honorific)）"
        }

        return RulerHonor(
            styledName: styledName,
            eraName: era,
            eraYearText: eraYearText,
            honorific: honorific,
            cleanPersonalName: personalName,
            surnameLessImperial: isJPImperial
        )
    }

    // MARK: - 2. 16 项全新历史人物个性与能力特质（真实可感知的加成）

    public struct ExtraTrait: Sendable {
        public let key: String
        public let label: String
        public let summary: String
        public let positive: Bool
        public let charisma: Double, military: Double, diplomatic: Double, administrative: Double
        public let attack: Double, defense: Double, income: Double, growth: Double, stability: Double, corruption: Double
        public let opinionBonus: Int
        public let temper: Double
    }

    public static let extraTraits: [ExtraTrait] = [
        ExtraTrait(key: "Visionary", label: "雄才大略", summary: "全军进攻 +8% · 岁入 +8% · 安定 +6", positive: true, charisma: 12, military: 10, diplomatic: 10, administrative: 12, attack: 8, defense: 4, income: 8, growth: 1.5, stability: 6, corruption: -4, opinionBonus: 6, temper: 1.12),
        ExtraTrait(key: "IronFist", label: "铁腕集权", summary: "安定 +10 · 腐化 −8 · 进攻 +6% · 外交 −6", positive: true, charisma: -4, military: 10, diplomatic: -6, administrative: 12, attack: 6, defense: 6, income: 4, growth: 0, stability: 10, corruption: -8, opinionBonus: -6, temper: 1.18),
        ExtraTrait(key: "Benevolent", label: "仁德宽厚", summary: "安定 +12 · 人口年增 +2.5% · 外交 +10", positive: true, charisma: 14, military: -4, diplomatic: 10, administrative: 8, attack: -3, defense: 4, income: 2, growth: 2.5, stability: 12, corruption: -4, opinionBonus: 10, temper: 0.85),
        ExtraTrait(key: "Financier", label: "精于理财", summary: "全国岁入 +14% · 腐化 −6", positive: true, charisma: 0, military: -2, diplomatic: 6, administrative: 16, attack: 0, defense: 0, income: 14, growth: 0.8, stability: 2, corruption: -6, opinionBonus: 4, temper: 0.92),
        ExtraTrait(key: "Tactician", label: "兵法大家", summary: "全军进攻 +14% · 防御 +8%", positive: true, charisma: 4, military: 18, diplomatic: 0, administrative: 0, attack: 14, defense: 8, income: -2, growth: 0, stability: 2, corruption: 0, opinionBonus: 0, temper: 1.15),
        ExtraTrait(key: "MasterDiplomat", label: "纵横捭阖", summary: "全天下外交好感 +14 · 岁入 +4%", positive: true, charisma: 12, military: 0, diplomatic: 18, administrative: 4, attack: 0, defense: 0, income: 4, growth: 0, stability: 4, corruption: 0, opinionBonus: 14, temper: 0.88),
        ExtraTrait(key: "Scholar", label: "崇文重教", summary: "腐化 −8 · 安定 +6 · 岁入 +5%", positive: true, charisma: 8, military: -4, diplomatic: 8, administrative: 14, attack: -2, defense: 2, income: 5, growth: 1.2, stability: 6, corruption: -8, opinionBonus: 6, temper: 0.86),
        ExtraTrait(key: "Conqueror", label: "开疆雄主", summary: "进攻 +16% · 好战度大幅提升 · 安定 −4", positive: true, charisma: 8, military: 16, diplomatic: -6, administrative: 2, attack: 16, defense: 4, income: 0, growth: 0, stability: -4, corruption: 2, opinionBonus: -10, temper: 1.32),
        ExtraTrait(key: "Lawgiver", label: "明法审令", summary: "腐化 −12 · 安定 +8 · 岁入 +6%", positive: true, charisma: 6, military: 0, diplomatic: 4, administrative: 16, attack: 0, defense: 4, income: 6, growth: 0.6, stability: 8, corruption: -12, opinionBonus: 4, temper: 0.96),
        ExtraTrait(key: "Diligent", label: "勤政爱民", summary: "岁入 +8% · 安定 +8 · 人口年增 +1.5%", positive: true, charisma: 8, military: 4, diplomatic: 4, administrative: 12, attack: 2, defense: 4, income: 8, growth: 1.5, stability: 8, corruption: -6, opinionBonus: 4, temper: 0.96),
        ExtraTrait(key: "SeaVision", label: "海权远见", summary: "岁入 +10% · 进攻 +5% · 商贸繁盛", positive: true, charisma: 4, military: 8, diplomatic: 10, administrative: 6, attack: 5, defense: 3, income: 10, growth: 0.5, stability: 2, corruption: 0, opinionBonus: 5, temper: 1.05),
        ExtraTrait(key: "Beloved", label: "民望所归", summary: "安定 +14 · 防御 +8% · 叛乱骤减", positive: true, charisma: 18, military: 2, diplomatic: 8, administrative: 4, attack: 0, defense: 8, income: 3, growth: 1.5, stability: 14, corruption: -3, opinionBonus: 8, temper: 0.94),
        ExtraTrait(key: "Veteran", label: "宿将老谋", summary: "防御 +12% · 进攻 +8% · 安定 +4", positive: true, charisma: 4, military: 14, diplomatic: 0, administrative: 2, attack: 8, defense: 12, income: 0, growth: 0, stability: 4, corruption: -2, opinionBonus: 0, temper: 1.04),
        ExtraTrait(key: "Extravagant", label: "奢靡无度", summary: "岁入 −12% · 腐化 +10 · 安定 −6", positive: false, charisma: 4, military: -4, diplomatic: 2, administrative: -12, attack: -4, defense: -4, income: -12, growth: -0.5, stability: -6, corruption: 10, opinionBonus: -2, temper: 0.95),
        ExtraTrait(key: "Stubborn", label: "刚愎自用", summary: "外交好感 −10 · 腐化 +5 · 进攻 +4%", positive: false, charisma: -8, military: 4, diplomatic: -12, administrative: -6, attack: 4, defense: 2, income: -4, growth: 0, stability: -5, corruption: 5, opinionBonus: -10, temper: 1.15),
        ExtraTrait(key: "Tyrant", label: "苛政暴戾", summary: "进攻 +8% · 安定 −14 · 外交 −14 · 腐化 +8", positive: false, charisma: -14, military: 6, diplomatic: -14, administrative: -6, attack: 8, defense: -6, income: 4, growth: -2.0, stability: -14, corruption: 8, opinionBonus: -14, temper: 1.25),
    ]

    public static let extraByKey: [String: ExtraTrait] = Dictionary(uniqueKeysWithValues: extraTraits.map { ($0.key, $0) })

    /// 为 App 规则模式下的君主与新登基/重要人物自动赋予 1–2 项鲜明个性特质（无副作用，确定性哈希）。
    public static func ensurePersonalityTraits(_ r: JS, person p: JS) {
        guard UnitKinds.enabled, !r.regimes.isNull, r.regimes.enabled.isTruthy else { return }
        if p.traits.isNull { p.traits = .array() }
        let existing = Set(p.traits.asArray.compactMap(\.optionalString))
        if existing.contains(where: { extraByKey[$0] != nil }) { return }
        let pid = p.id.asInt
        guard pid > 0 else { return }
        let seed = "\(r.world.custom.seed.optionalString ?? "")|ptrait|\(pid)"
        let h = hashU32(seed)
        let baseMil = p.base.military.optionalNumber ?? 50
        let baseAdm = p.base.administrative.optionalNumber ?? 50
        let baseDip = p.base.diplomatic.optionalNumber ?? 50
        let baseCha = p.base.charisma.optionalNumber ?? 50
        let pickKey: String
        if baseMil >= 72 { pickKey = ["Tactician", "Conqueror", "Veteran", "IronFist"][Int(h % 4)] }
        else if baseAdm >= 72 { pickKey = ["Financier", "Lawgiver", "Diligent", "Scholar"][Int(h % 4)] }
        else if baseDip >= 72 { pickKey = ["MasterDiplomat", "SeaVision", "Visionary"][Int(h % 3)] }
        else if baseCha >= 72 { pickKey = ["Beloved", "Benevolent", "Visionary"][Int(h % 3)] }
        else if (baseMil + baseAdm + baseDip + baseCha) / 4 < 38 { pickKey = ["Extravagant", "Stubborn", "Tyrant"][Int(h % 3)] }
        else { pickKey = extraTraits[Int(h % UInt32(extraTraits.count))].key }
        if !existing.contains(pickKey) { p.traits.push(JS(pickKey)) }
    }

    /// 汇总某位掌权者的全部人物特质（原作 27 项 + 新增 16 项）带来的真实可感知国政加成。
    public static func traitEffects(of p: JS?) -> (attack: Double, defense: Double, income: Double, growth: Double, stability: Double, corruption: Double, opinion: Int, summary: [String]) {
        guard let p, !p.traits.isNull else { return (0, 0, 0, 0, 0, 0, 0, []) }
        var atk = 0.0, def = 0.0, inc = 0.0, gro = 0.0, sta = 0.0, cor = 0.0, op = 0
        for t in p.traits.asArray.compactMap(\.optionalString) {
            if let ex = extraByKey[t] {
                atk += ex.attack; def += ex.defense; inc += ex.income; gro += ex.growth
                sta += ex.stability; cor += ex.corruption; op += ex.opinionBonus
            } else {
                // 让原作特质也在国家层面产生清晰可感的加成
                switch t {
                case "Genius": atk += 6; def += 6; inc += 8; sta += 5
                case "Strategist": atk += 10; def += 5
                case "Brave": atk += 6
                case "Administrator": inc += 10; cor -= 4; sta += 4
                case "Diplomatic": op += 10; inc += 3
                case "Charismatic", "NaturalLeader": sta += 8; op += 6
                case "Just": sta += 8; cor -= 6
                case "Merciful": sta += 6; gro += 1.2
                case "Unifier": atk += 8; sta += 4
                case "BattleHardened": atk += 8; def += 6
                case "NavalMastery": inc += 5; atk += 4
                case "Reformer": cor -= 6; inc += 5; sta += 3
                case "Greedy": inc += 6; sta -= 6; cor += 6
                case "Cruel": atk += 4; sta -= 10; op -= 8
                case "Incompetent": atk -= 8; def -= 8; inc -= 10; sta -= 8
                case "Craven": atk -= 8; def -= 6
                case "WarWeary": atk -= 6; sta -= 4
                case "Unconvincing": sta -= 8; op -= 6
                default: break
                }
            }
        }
        var parts = [String]()
        if atk != 0 { parts.append("进攻\(atk > 0 ? "+" : "")\(Int(atk.rounded()))%") }
        if def != 0 { parts.append("防御\(def > 0 ? "+" : "")\(Int(def.rounded()))%") }
        if inc != 0 { parts.append("岁入\(inc > 0 ? "+" : "")\(Int(inc.rounded()))%") }
        if sta != 0 { parts.append("安定\(sta > 0 ? "+" : "")\(Int(sta.rounded()))") }
        if cor != 0 { parts.append("腐化\(cor > 0 ? "+" : "")\(Int(cor.rounded()))") }
        if op != 0 { parts.append("外交\(op > 0 ? "+" : "")\(op)") }
        return (atk, def, inc, gro, sta, cor, op, parts)
    }

    // MARK: - 3. 24 项全新深度历史动态事件

    public static func dynamicEventMonth(_ r: JS, _ n: JS, _ id: String, _ key: Int, addGold: (Double) -> Void, addDestiny: (Double) -> Void) {
        let evRate = Regimes.rule(r, "event")
        guard evRate > 0 else { return }
        let seed = r.world.custom.seed.optionalString ?? ""
        let tag = "\(seed)|dynev|\(id)|\(key)"
        guard Regimes.chance(tag) < 0.065 * evRate else { return }
        let land = Regimes.monthLand(r, id)
        guard !land.isEmpty else { return }
        let pick = Int(Regimes.draw(tag + "|p"))
        let place = land[pick % land.count], pname = place.name.asString
        let name = n.name.asString
        let armies = Regimes.monthArmies(r, id)
        let style = Regimes.style(r, id)
        func say(_ text: String, _ reason: String, kind: String = "event", p: JS? = nil) {
            _ = People.announce(r, kind: kind, text: text, reason: reason, nations: [id], province: p?.id.optionalString)
        }
        func corrupt(_ d: Double) { Finance.setCorruption(r, id, Finance.corruption(r, id) + d) }

        switch Int(Regimes.draw(tag + "|w") % 24) {
        case 0:
            addGold(2.5); addDestiny(2)
            say("\(name)丝路商帮云集", "四方豪商赴\(pname)互市贸易，关税丰盈：国库增两月半岁入，国运 +2。", p: place)
        case 1:
            corrupt(-5); addDestiny(3)
            say("\(name)御史台弹劾巨贪", "朝廷严办蠹虫、追缴赃银充库：腐化 −5，国运 +3。", kind: "politics")
        case 2:
            for a in armies { a.morale = JS(min(100, a.morale.asNumber + 12)) }
            say("\(name)校场大阅兵", "旌旗蔽空、军容严整，全军士气 +12。", p: place)
        case 3:
            addGold(-1.5); addDestiny(3)
            say("\(name)兴修水利工程", "在\(pname)开凿运河堤坝以利灌排：耗一个半月岁入，国运 +3。", p: place)
        case 4:
            if let st = Regimes.monthStock(r, place.id.asString) {
                st.population = JS((st.population.asNumber * 1.05).rounded())
                st.grain = JS((st.grain.asNumber * 1.18).rounded())
            }
            say("\(pname)新稻试种大熟", "良种推广，亩产倍增：\(pname)人口 +5%、存粮 +18%。", p: place)
        case 5:
            addGold(-2); corrupt(4); addDestiny(-2)
            say("\(name)银钱贬值风潮", "市面私铸劣钱泛滥、物价腾贵：损失两月岁入，腐化 +4，国运 −2。")
        case 6:
            addDestiny(4)
            say("\(name)殿试状元名动天下", "俊彦登科、士林振奋：国运 +4。", kind: "culture")
        case 7:
            corrupt(5); addDestiny(-2)
            say("\(name)宫廷党争白热化", "朝臣结党攻讦、政令阻滞：腐化 +5，国运 −2。", kind: "politics")
        case 8:
            addGold(3)
            say("\(pname)新探得富饶矿脉", "工匠于\(pname)山地发现金银铜矿：国库大增三月岁入。", p: place)
        case 9:
            for a in armies { a.supplies = JS(100); a.morale = JS(min(100, a.morale.asNumber + 8)) }
            say("\(name)改良军需辎重", "新建官驿粮站，全军补给满额、士气 +8。")
        case 10:
            addGold(1.8); addDestiny(1)
            say("\(pname)工坊工艺革故鼎新", "织机与冶铁技艺精进，产值骤增：国库增近两月岁入，国运 +1。", p: place)
        case 11:
            addDestiny(-3)
            if let st = Regimes.monthStock(r, place.id.asString) { st.grain = JS((st.grain.asNumber * 0.72).rounded()) }
            say("\(pname)赤地千里大旱", "连月无雨、田畴龟裂：\(pname)存粮 −28%，国运 −3。", p: place)
        case 12:
            if style.parties {
                say("\(name)议会通过重大税改案", "各党激辩终成折衷方案，财政与民心趋稳：腐化 −4，国运 +2。", kind: "politics")
                corrupt(-4); addDestiny(2)
            } else {
                say("\(name)颁行清丈田亩诏", "核实豪强隐田、均平赋役：腐化 −4，国库增两月岁入。", kind: "politics")
                corrupt(-4); addGold(2)
            }
        case 13:
            addDestiny(3); corrupt(-2)
            say("\(name)名医著书济世", "良方广布郡县、疫疠顿减：国运 +3，腐化 −2。", kind: "culture")
        case 14:
            if let leader = Regimes.ruler(r, id) {
                leader.base.administrative = JS(min(100, (leader.base.administrative.optionalNumber ?? 50) + 3))
            }
            addDestiny(2)
            say("\(name)御前经筵讲学", "名儒宿老进讲治国之道：君主行政能力 +3，国运 +2。", kind: "culture")
        case 15:
            addGold(-1.5); addDestiny(-2)
            say("\(pname)边关走私猖獗", "豪强勾结边吏偷运违禁物资：损失一个半月岁入，国运 −2。", p: place)
        case 16:
            if let st = Regimes.monthStock(r, place.id.asString) {
                st.population = JS((st.population.asNumber * 1.04).rounded())
            }
            addGold(1.2)
            say("\(pname)海港开埠通洋", "远洋帆影络绎不绝：\(pname)人口 +4%，国库增一月余岁入。", p: place)
        case 17:
            if let d = r.upperCombat.provinces[place.id.asString].isNull ? nil : r.upperCombat.provinces[place.id.asString] {
                let cur = Int((d.storedDefense.optionalNumber ?? 1).rounded())
                if cur < 10 { d.storedDefense = JS(cur + 1) }
            }
            say("\(pname)重修关隘城垣", "军民协力筑城浚濠：\(pname)城防 +1 级。", p: place)
        case 18:
            addDestiny(2); addGold(1.5)
            say("\(name)刊印典籍风行海内", "活字雕版盛行、书肆林立：国运 +2，国库增一月半岁入。", kind: "culture")
        case 19:
            for a in armies.prefix(2) { a.morale = JS(max(10, a.morale.asNumber - 10)) }
            say("\(name)边镇欠饷风波", "军饷延误引发士卒哗怨：前线两军士气 −10。", kind: "politics")
        case 20:
            addDestiny(3)
            say("\(name)四方使节来朝观礼", "邻邦遣使致贺、声威远播：国运 +3。", kind: "diplomacy")
        case 21:
            corrupt(4); addGold(-1)
            say("\(name)权贵争产兴讼", "勋戚世家侵占民田引发怨声：腐化 +4，耗一月岁入。", kind: "family")
        case 22:
            if let leader = Regimes.ruler(r, id) {
                leader.base.military = JS(min(100, (leader.base.military.optionalNumber ?? 50) + 3))
            }
            say("\(name)兵书新著进呈御览", "宿将献平戎策：君主军事能力 +3。", kind: "event")
        default:
            addGold(2); addDestiny(2)
            say("\(name)盛世气象初现", "仓廪实而礼节兴，百姓安居乐业：国库增两月岁入，国运 +2。", kind: "culture")
        }
    }
}
