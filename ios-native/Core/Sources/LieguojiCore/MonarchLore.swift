import Foundation

/// 真实历史君主年号／谥号／世数／尊号体系、扩展人物个性特质与丰富动态事件库（App 规则专用，不影响网页逐字节对照测试）：
/// - 日本天皇遵循一世一元，格式为「昭和天皇 裕仁」「令和天皇 德仁」，皇室成员无姓氏且无需额外标注；
/// - 中华／朝鲜／越南皇帝遵循真实史书格式「汉武帝 刘彻」「唐贞观帝 李世民」，藩王称「齐威王 田因齐」；
/// - 欧美／斯拉夫／中东／埃及／草原／天竺君主遵循真实传统（「国王 亨利四世」「沙皇 彼得一世（大帝）」「苏丹 穆罕默德二世」「忽必烈大汗」）；
/// - 16 项鲜明历史人物性格特质（带可感知的税收、战力、安定、外交与政局修正）；
/// - 24 项深度历史／朝堂／经济／军事／文化随机事件。
public enum MonarchLore {

    // MARK: - 1. 真实历代君主年号、世数与尊号

    public struct RulerHonor: Sendable {
        /// 完整在位尊称（如「唐贞观帝 李世民」「汉武帝 刘彻」「昭和天皇 裕仁」「国王 路易十四世」「沙皇 彼得一世（大帝）」）。
        public let styledName: String
        /// 年号（中华/日本/朝鲜/越南君主专用，如「贞观」「昭和」；其余文明为空）。
        public let eraName: String
        /// 在位年号纪年（如「贞观三年」「昭和元年」）。
        public let eraYearText: String
        /// 庙号或历史尊号/绰号（如「太祖」「太宗」「大帝」「征服者」「狮心王」）。
        public let honorific: String
        /// 展示用本名（日本天皇仅保留名讳，其余文明沿用文化姓名顺序）。
        public let cleanPersonalName: String
        /// 是否属于日本皇室。
        public let surnameLessImperial: Bool
    }

    /// 真实历史君主性别分布（App 规则专用）：君主制约 8% 女主、神权政体约 3%、共和/联邦约 16%，避免满图半数女帝。
    public static func historicalRulerGender(seed: String, polity: String) -> Int {
        let pct = Int(hashU32(seed + "|gender-hist") % 100)
        switch polity {
        case "Republic", "Federation": return pct < 16 ? 1 : 0
        case "Theocracy": return pct < 3 ? 1 : 0
        default: return pct < 8 ? 1 : 0
        }
    }

    /// 正统日本皇室名讳库（男系历代「○仁」讳名与罕见女天皇名讳）。
    public static let japaneseImperialMaleNames: [String] = [
        "裕仁", "德仁", "明仁", "睦仁", "嘉仁", "统仁", "惠仁", "兼仁",
        "英仁", "智仁", "朝仁", "庆仁", "秀仁", "良仁", "诚仁", "昭仁",
        "宽仁", "文仁", "宪仁", "崇仁", "政仁", "胜仁", "丰仁", "兴仁",
    ]
    public static let japaneseImperialFemaleNames: [String] = [
        "爱子", "佳子", "真子", "和子", "纪子", "雅子", "智子", "顺子",
        "荣子", "敬子", "明子", "清子", "节子", "美子",
    ]

    public static func japaneseImperialGivenName(seed: String, female: Bool) -> String {
        let pool = female ? japaneseImperialFemaleNames : japaneseImperialMaleNames
        return pool[Int(hashU32(seed + "|jp-imp") % UInt32(pool.count))]
    }

    /// 提取中华/东亚王朝用于拼合帝王谥号/年号的简明国号（如「大汉」→「汉」，「大唐」→「唐」，「北魏」→「魏」，「齐国」→「齐」）。
    public static func shortDynastyPrefix(_ r: JS, nationId: String, culture: String) -> String {
        let rawCiv = r.civilization.isNull ? "" : (r.civilization.nations[nationId].name.value.optionalString ?? "")
        let rawWorld = r.world.nations.asArray.first(where: { $0.id.asString == nationId })?.name.optionalString ?? ""
        let cleaned = NamingCatalog.cleanStateBase(rawCiv.isEmpty ? rawWorld : rawCiv)
        if culture == "chinese" {
            let core = NamingCatalog.canonicalStateKey(cleaned)
            if core.count == 1 { return core }
            if cleaned.hasPrefix("大") && cleaned.count == 2 { return String(cleaned.dropFirst()) }
            if ["北", "南", "东", "西", "前", "后", "蜀", "吴", "夏", "晋", "齐", "楚", "燕", "韩", "赵", "魏", "秦", "汉", "唐", "宋", "明", "清", "周", "隋", "梁", "陈", "元", "辽", "金"].contains(where: { cleaned.hasPrefix($0) }) && cleaned.count == 2 {
                return cleaned
            }
            if cleaned == "中华" || cleaned == "华夏" { return "华" }
            return String(cleaned.prefix(2))
        }
        return String(cleaned.prefix(2))
    }

    private static let posthumousEmperorChars: [String] = [
        "高", "文", "武", "景", "宣", "明", "章", "昭", "惠", "元",
        "成", "平", "顺", "康", "肃", "宪", "孝", "靖", "光", "献",
    ]
    private static let posthumousKingChars: [String] = [
        "桓", "文", "武", "威", "宣", "昭", "庄", "穆", "襄", "惠",
        "康", "景", "悼", "平", "定", "简", "敬", "烈", "慎", "怀",
    ]

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
        let isShogun = title.contains("将军") || title.contains("幕府") || title.contains("元帅")
        let isTheocracy = (polity == "Theocracy")
            || title == "教宗" || title == "哈里发" || title == "伊玛目" || title == "牧首" || title == "法王" || title == "天师" || title == "祭主"
        let isMonarch = ["Kingdom", "Empire", "Theocracy"].contains(polity)
            && !isShogun
            && !title.contains("总统") && !title.contains("主席") && !title.contains("总书记") && !title.contains("执政官") && !title.contains("委员长") && !title.contains("首相") && !title.contains("总理")
        let isJPImperial = !isShogun && !isTheocracy && isJapaneseEmperor(culture: culture, title: title, polity: polity)

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

        // 2. 从 r.regimes.reignLore 读取或确定性生成年号与世数（纯只读确定性计算，不在只读面板查询时修改存档字节）
        let loreKey = "\(nationId)|\(reignId)"
        let stored = (!r.regimes.isNull && !r.regimes.reignLore.isNull) ? r.regimes.reignLore[loreKey] : .null

        var era = stored.era.optionalString ?? ""
        var ordinal = stored.ordinal.optionalNumber.map(Int.init) ?? 0
        let numberedTheocracy = isTheocracy && (title == "教宗" || title == "牧首" || title == "哈里发" || title == "伊玛目")

        if era.isEmpty && !isTheocracy && (isJPImperial || sinosphereCultures.contains(culture)) {
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
        }

        // 计算西方/欧亚君主及教宗/哈里发名字世数（统计本国历代同名顺位：伊丽莎白一世 → 二世，教宗 利奥一世 → 二世）
        let givenKey: String = {
            let trimmed = first.trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmed.isEmpty { return trimmed }
            if personalName.contains("·") { return personalName.components(separatedBy: "·").first ?? personalName }
            return personalName
        }()
        if ordinal <= 0 && (numberedTheocracy || (!isTheocracy && regnalNumberCultures.contains(culture))) {
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
        let isFemale = (person?.gender.optionalNumber == 1) || title.contains("女")

        let styledName: String
        if isTheocracy {
            // 教宗国/哈里发国/牧首领/法王领/道国真实宗教领袖称谓，绝不误套世俗帝王号
            if numberedTheocracy {
                let numLabel = "\(givenKey)\(chineseNumeral(max(1, ordinal)))世"
                styledName = "\(title) \(numLabel)"
            } else {
                styledName = "\(title) \(personalName)"
            }
        } else if isJPImperial {
            // 真实日本天皇命名：「昭和天皇 裕仁」「令和天皇 德仁」（皇室本无姓氏，空格接名讳）
            styledName = era.isEmpty ? "天皇 \(personalName)" : "\(era)天皇 \(personalName)"
        } else if sinosphereCultures.contains(culture) {
            // 真实中华／东亚帝王命名：
            // 皇帝在位称「[国号][年号]帝 [姓名]」（如「明永乐帝 朱棣」「唐贞观帝 李世民」），
            // 崩逝入史称「[国号][谥号]帝 [姓名]」（如「汉高帝 刘邦」「汉武帝 刘彻」「魏文帝 曹丕」）；
            // 国王称「[国号][谥号]王 [姓名]」（如「齐威王 田因齐」「楚怀王 熊槐」）。
            let dyn = shortDynastyPrefix(r, nationId: nationId, culture: culture)
            let isEmperor = (polity == "Empire") || title.contains("皇") || title.contains("帝")
            let postChar: String = {
                if isEmperor {
                    if order == 1 { return "高" }
                    if deltaProvs >= 4 || traits.contains("Conqueror") || traits.contains("Unifier") { return "武" }
                    if avgSkill >= 74 || traits.contains("Genius") || traits.contains("Visionary") { return "明" }
                    if traits.contains("Benevolent") || traits.contains("Merciful") || traits.contains("Just") { return "仁" }
                    if traits.contains("Reformer") || traits.contains("Scholar") { return "文" }
                    if deltaProvs <= -3 { return "哀" }
                    let h = Int(hashU32("\(nationId)|\(reignId)|post-e") % UInt32(posthumousEmperorChars.count))
                    return posthumousEmperorChars[h]
                } else {
                    if order == 1 { return "武" }
                    if deltaProvs >= 3 { return "威" }
                    if avgSkill >= 70 { return "文" }
                    if deltaProvs <= -3 { return "怀" }
                    let h = Int(hashU32("\(nationId)|\(reignId)|post-k") % UInt32(posthumousKingChars.count))
                    return posthumousKingChars[h]
                }
            }()
            if isEmperor {
                let empSuffix = isFemale ? "女帝" : "帝"
                if isActive && !era.isEmpty {
                    styledName = "\(dyn)\(era)\(empSuffix) \(personalName)"
                } else {
                    styledName = "\(dyn)\(postChar)\(empSuffix) \(personalName)"
                }
            } else {
                let kingSuffix = isFemale ? "女王" : "王"
                styledName = "\(dyn)\(postChar)\(kingSuffix) \(personalName)"
            }
        } else if culture == "mongol" {
            // 蒙古汗国：「忽必烈大汗」「拔都汗」
            let khanTitle = polity == "Empire" ? "大汗" : "汗"
            let suffix = honorific.isEmpty ? "" : "（\(honorific)）"
            styledName = "\(givenKey)\(khanTitle)\(suffix)"
        } else if culture == "tibetan" {
            let suffix = honorific.isEmpty ? "" : "（\(honorific)）"
            styledName = "赞普 \(givenKey)\(suffix)"
        } else if culture == "indian" {
            let indTitle = title == "苏丹" ? "苏丹" : (polity == "Empire" ? "摩诃罗阇" : "罗阇")
            let suffix = honorific.isEmpty ? "" : "（\(honorific)）"
            styledName = "\(indTitle) \(givenKey)\(suffix)"
        } else if regnalNumberCultures.contains(culture) {
            // 西方/斯拉夫/中东/埃及：如「国王 亨利四世」「女王 伊丽莎白二世」「沙皇 彼得一世（大帝）」「苏丹 穆罕默德二世」「法老 拉美西斯二世」
            let numLabel = "\(givenKey)\(chineseNumeral(max(1, ordinal)))世"
            let suffix = honorific.isEmpty ? "" : "（\(honorific)）"
            styledName = "\(title) \(numLabel)\(suffix)"
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
        ExtraTrait(key: "Visionary", label: "雄才大略", summary: "全军进攻 +16% · 岁入 +16% · 安定 +10", positive: true, charisma: 16, military: 14, diplomatic: 14, administrative: 16, attack: 16, defense: 8, income: 16, growth: 2.2, stability: 10, corruption: -8, opinionBonus: 10, temper: 1.15),
        ExtraTrait(key: "IronFist", label: "铁腕集权", summary: "安定 +16 · 腐化 −14 · 进攻 +12% · 外交 −10", positive: true, charisma: -4, military: 14, diplomatic: -8, administrative: 16, attack: 12, defense: 10, income: 8, growth: 0, stability: 16, corruption: -14, opinionBonus: -10, temper: 1.22),
        ExtraTrait(key: "Benevolent", label: "仁德宽厚", summary: "安定 +18 · 人口年增 +3.5% · 外交 +16", positive: true, charisma: 18, military: -4, diplomatic: 14, administrative: 10, attack: -4, defense: 8, income: 6, growth: 3.5, stability: 18, corruption: -8, opinionBonus: 16, temper: 0.82),
        ExtraTrait(key: "Financier", label: "精于理财", summary: "全国岁入 +24% · 腐化 −12", positive: true, charisma: 2, military: -2, diplomatic: 8, administrative: 22, attack: 0, defense: 0, income: 24, growth: 1.2, stability: 4, corruption: -12, opinionBonus: 6, temper: 0.90),
        ExtraTrait(key: "Tactician", label: "兵法大家", summary: "全军进攻 +24% · 防御 +14%", positive: true, charisma: 6, military: 24, diplomatic: 0, administrative: 0, attack: 24, defense: 14, income: -2, growth: 0, stability: 4, corruption: 0, opinionBonus: 0, temper: 1.18),
        ExtraTrait(key: "MasterDiplomat", label: "纵横捭阖", summary: "全天下外交好感 +24 · 岁入 +8%", positive: true, charisma: 16, military: 0, diplomatic: 24, administrative: 6, attack: 0, defense: 0, income: 8, growth: 0, stability: 6, corruption: 0, opinionBonus: 24, temper: 0.85),
        ExtraTrait(key: "Scholar", label: "崇文重教", summary: "腐化 −14 · 安定 +12 · 岁入 +10%", positive: true, charisma: 10, military: -4, diplomatic: 10, administrative: 18, attack: -2, defense: 4, income: 10, growth: 1.8, stability: 12, corruption: -14, opinionBonus: 10, temper: 0.84),
        ExtraTrait(key: "Conqueror", label: "开疆雄主", summary: "进攻 +26% · 破城凶猛 · 安定 −6", positive: true, charisma: 10, military: 22, diplomatic: -8, administrative: 2, attack: 26, defense: 8, income: 0, growth: 0, stability: -6, corruption: 3, opinionBonus: -14, temper: 1.38),
        ExtraTrait(key: "Lawgiver", label: "明法审令", summary: "腐化 −18 · 安定 +14 · 岁入 +12%", positive: true, charisma: 8, military: 0, diplomatic: 6, administrative: 20, attack: 0, defense: 8, income: 12, growth: 1.0, stability: 14, corruption: -18, opinionBonus: 6, temper: 0.95),
        ExtraTrait(key: "Diligent", label: "勤政爱民", summary: "岁入 +16% · 安定 +14 · 人口年增 +2.4%", positive: true, charisma: 10, military: 6, diplomatic: 6, administrative: 18, attack: 4, defense: 6, income: 16, growth: 2.4, stability: 14, corruption: -10, opinionBonus: 6, temper: 0.95),
        ExtraTrait(key: "SeaVision", label: "海权远见", summary: "岁入 +18% · 进攻 +10% · 海贸兴旺", positive: true, charisma: 6, military: 10, diplomatic: 12, administrative: 8, attack: 10, defense: 6, income: 18, growth: 0.8, stability: 4, corruption: 0, opinionBonus: 8, temper: 1.08),
        ExtraTrait(key: "Beloved", label: "民望所归", summary: "安定 +22 · 防御 +14% · 叛乱骤减", positive: true, charisma: 24, military: 4, diplomatic: 12, administrative: 6, attack: 0, defense: 14, income: 6, growth: 2.2, stability: 22, corruption: -6, opinionBonus: 14, temper: 0.92),
        ExtraTrait(key: "Veteran", label: "宿将老谋", summary: "防御 +20% · 进攻 +14% · 安定 +6", positive: true, charisma: 6, military: 20, diplomatic: 0, administrative: 4, attack: 14, defense: 20, income: 0, growth: 0, stability: 6, corruption: -4, opinionBonus: 0, temper: 1.05),
        ExtraTrait(key: "Extravagant", label: "奢靡无度", summary: "岁入 −20% · 腐化 +16 · 安定 −10", positive: false, charisma: 4, military: -6, diplomatic: 2, administrative: -18, attack: -8, defense: -8, income: -20, growth: -1.0, stability: -10, corruption: 16, opinionBonus: -4, temper: 0.95),
        ExtraTrait(key: "Stubborn", label: "刚愎自用", summary: "外交好感 −16 · 腐化 +10 · 进攻 +6%", positive: false, charisma: -10, military: 6, diplomatic: -16, administrative: -10, attack: 6, defense: 2, income: -8, growth: 0, stability: -10, corruption: 10, opinionBonus: -16, temper: 1.18),
        ExtraTrait(key: "Tyrant", label: "苛政暴戾", summary: "进攻 +14% · 安定 −22 · 外交 −20 · 腐化 +14", positive: false, charisma: -18, military: 8, diplomatic: -18, administrative: -10, attack: 14, defense: -10, income: 6, growth: -3.0, stability: -22, corruption: 14, opinionBonus: -20, temper: 1.30),
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
                // 让原作全部 27 项人物特质也在国家层面产生鲜明可感、足以扭转国运的大幅实效
                switch t {
                case "Genius": atk += 14; def += 14; inc += 16; sta += 10
                case "Strategist": atk += 18; def += 10
                case "Brave": atk += 12; def += 4
                case "Administrator": inc += 18; cor -= 10; sta += 8
                case "Diplomatic": op += 18; inc += 8
                case "Charismatic", "NaturalLeader": sta += 14; op += 12; def += 4
                case "Just": sta += 14; cor -= 12
                case "Merciful": sta += 12; gro += 2.2
                case "Unifier": atk += 16; sta += 8
                case "BattleHardened": atk += 16; def += 12
                case "NavalMastery": inc += 10; atk += 10
                case "Reformer": cor -= 12; inc += 12; sta += 8
                case "Greedy": inc += 12; sta -= 12; cor += 12
                case "Cruel": atk += 10; sta -= 16; op -= 14
                case "Incompetent": atk -= 16; def -= 16; inc -= 18; sta -= 14
                case "Craven": atk -= 16; def -= 12
                case "WarWeary": atk -= 12; sta -= 8
                case "Unconvincing": sta -= 14; op -= 12
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

    // MARK: - 3. 42 项深度历史动态事件（朝堂、兵戈、海贸、科技、灾异、名将与人文全维度叙事）

    public static func dynamicEventMonth(_ r: JS, _ n: JS, _ id: String, _ key: Int, addGold: (Double) -> Void, addDestiny: (Double) -> Void) {
        let evRate = Regimes.rule(r, "event")
        guard evRate > 0 else { return }
        let seed = r.world.custom.seed.optionalString ?? ""
        let tag = "\(seed)|dynev|\(id)|\(key)"
        guard Regimes.chance(tag) < 0.082 * evRate else { return }
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
        func bumpArmyXP(_ delta: Double, maxCount: Int = 3) {
            if r.regimes.armyXP.isNull { r.regimes.armyXP = JS.object() }
            for a in armies.prefix(maxCount) {
                let aid = a.id.asString
                let cur = r.regimes.armyXP[aid].optionalNumber ?? 0
                r.regimes.armyXP[aid] = JS(min(100, cur + delta))
            }
        }

        switch Int(Regimes.draw(tag + "|w") % 42) {
        case 0:
            addGold(2.5); addDestiny(2)
            say("\(name)丝路商帮云集", "驼铃贯道、四方豪商赴\(pname)互市通货，市舶与关税盈溢：国库增两月半岁入，国运 +2。", p: place)
        case 1:
            corrupt(-5); addDestiny(3)
            say("\(name)御史台弹劾巨贪", "台谏风闻奏事，朝廷雷霆查办蠹虫、抄没赃银充实太仓：腐化 −5，国运 +3。", kind: "politics")
        case 2:
            for a in armies { a.morale = JS(min(100, a.morale.asNumber + 12)) }
            bumpArmyXP(6)
            say("\(name)秋狝校场大阅", "旌旗蔽空、金鼓震野，三军于\(pname)演练破阵合围之法：全军士气 +12，历练精进。", p: place)
        case 3:
            addGold(-1.5); addDestiny(3)
            say("\(name)大兴水利浚渠", "征发民夫于\(pname)开凿运渠、修筑石堤以利灌排与漕运：耗一月半岁入，国运 +3。", p: place)
        case 4:
            if let st = Regimes.monthStock(r, place.id.asString) {
                st.population = JS((st.population.asNumber * 1.05).rounded())
                st.grain = JS((st.grain.asNumber * 1.20).rounded())
            }
            say("\(pname)占城良稻试种大熟", "早熟高产良种遍播阡陌、仓廪满溢：\(pname)人口 +5%、存粮 +20%。", p: place)
        case 5:
            addGold(-2); corrupt(4); addDestiny(-2)
            say("\(name)私铸劣钱引发币潮", "市肆劣币充斥、盐粮腾贵，商旅观望不前：损失两月岁入，腐化 +4，国运 −2。")
        case 6:
            addDestiny(4)
            say("\(name)春闱金榜名动天下", "寒门俊彦登科入仕、士林气象焕然一新：国运 +4。", kind: "culture")
        case 7:
            corrupt(5); addDestiny(-2)
            say("\(name)庙堂党争白热化", "新旧派系互相弹劾倾轧，公文积压、政令多所掣肘：腐化 +5，国运 −2。", kind: "politics")
        case 8:
            addGold(3)
            say("\(pname)深山探得富饶金银矿", "矿师勘明\(pname)山谷蕴藏厚脉，官督商办炉火日夜不息：国库大增三月岁入。", p: place)
        case 9:
            for a in armies { a.supplies = JS(100); a.morale = JS(min(100, a.morale.asNumber + 8)) }
            say("\(name)整饬驿传与军需辎重", "沿边增设粮台马驿、推行木牛流马转运：全军补给满额、士气 +8。")
        case 10:
            addGold(1.8); addDestiny(1)
            say("\(pname)百工织冶革故鼎新", "水排鼓风与新式提花织机广为传习，工坊产值倍增：国库增近两月岁入，国运 +1。", p: place)
        case 11:
            addDestiny(-3)
            if let st = Regimes.monthStock(r, place.id.asString) { st.grain = JS((st.grain.asNumber * 0.72).rounded()) }
            say("\(pname)赤地千里、夏旱成灾", "连月酷暑无雨、河渠断流，田苗枯槁：\(pname)存粮 −28%，国运 −3。", p: place)
        case 12:
            if style.parties {
                say("\(name)议会激辩通过财税新案", "朝野各党折衷妥协，厘清财政预算与地方分税：腐化 −4，国运 +2。", kind: "politics")
                corrupt(-4); addDestiny(2)
            } else {
                say("\(name)颁行鱼鳞图册清丈诏", "核实勋贵豪强隐匿田亩、均平天下赋役：腐化 −4，国库增两月岁入。", kind: "politics")
                corrupt(-4); addGold(2)
            }
        case 13:
            addDestiny(3); corrupt(-2)
            say("\(name)太医署刊行济世方书", "名医集诸家验方印布郡县、设惠民药局：疾疫顿减，国运 +3，腐化 −2。", kind: "culture")
        case 14:
            if let leader = Regimes.ruler(r, id) {
                leader.base.administrative = JS(min(100, (leader.base.administrative.optionalNumber ?? 50) + 3))
            }
            addDestiny(2)
            say("\(name)御前经筵论治道", "硕儒宿老进讲历代兴亡鉴戒：执政行政才干 +3，国运 +2。", kind: "culture")
        case 15:
            addGold(-1.5); addDestiny(-2)
            say("\(pname)边关茶马盐铁私贩猖獗", "不法豪商勾结关吏偷运违禁铁器盐茶：损失一月半岁入，国运 −2。", p: place)
        case 16:
            if let st = Regimes.monthStock(r, place.id.asString) {
                st.population = JS((st.population.asNumber * 1.04).rounded())
            }
            addGold(1.4)
            say("\(pname)海港开埠、番舶云集", "远洋商船载香料瓷丝而来，码头货栈林立：\(pname)人口 +4%，国库增一月余岁入。", p: place)
        case 17:
            if let d = r.upperCombat.provinces[place.id.asString].isNull ? nil : r.upperCombat.provinces[place.id.asString] {
                let cur = Int((d.storedDefense.optionalNumber ?? 1).rounded())
                if cur < 10 { d.storedDefense = JS(cur + 1) }
            }
            say("\(pname)重修雄关瓮城与烽燧", "军民协力包砖筑垣、深浚护城河：\(pname)城防稳固 +1 级。", p: place)
        case 18:
            addDestiny(2); addGold(1.5)
            say("\(name)活字刊书风行海内", "书坊林立、经史兵法广为流传，文风蔚然：国运 +2，国库增一月半岁入。", kind: "culture")
        case 19:
            for a in armies.prefix(2) { a.morale = JS(max(10, a.morale.asNumber - 10)) }
            say("\(name)边镇欠饷酿成喧哗", "度支调拨迟滞致使戌卒怨望鼓噪：前线两军士气 −10。", kind: "politics")
        case 20:
            addDestiny(3); WorldDepth.adjustReputation(r, nation: id, delta: 4)
            say("\(name)万邦使节来朝献礼", "周边诸国遣使递交国书、瞻仰威仪：国运 +3，国际信誉 +4。", kind: "diplomacy")
        case 21:
            corrupt(4); addGold(-1)
            say("\(name)勋戚兼并民田兴讼", "权贵豪门强占膏腴之地引发闾阎怨声：腐化 +4，耗一月岁入。", kind: "family")
        case 22:
            if let leader = Regimes.ruler(r, id) {
                leader.base.military = JS(min(100, (leader.base.military.optionalNumber ?? 50) + 3))
            }
            say("\(name)宿将献《平戎方略》", "久经沙场的老将撰述攻守奇正兵书进呈御览：执政军事才干 +3。", kind: "event")
        case 23:
            addGold(2); addDestiny(2)
            say("\(name)海内升平、盛世初现", "仓廪实而礼节兴，四境夜不闭户、商旅不绝：国库增两月岁入，国运 +2。", kind: "culture")
        case 24:
            // 名将武艺精进与全军振奋
            if let cmd = Regimes.activeCommander(r, nation: id, enemy: nil), let cp = People.person(r, cmd.personId) {
                cp.base.military = JS(min(100, (cp.base.military.optionalNumber ?? 50) + 4))
                bumpArmyXP(8, maxCount: 4)
                say("\(name)名将\(cmd.name)练兵成阵", "\(cmd.roleTitle)\(cmd.name)独创严整阵法、亲率部伍演习破敌：\(cmd.name)武略 +4，主力历练 +8。", kind: "event")
            } else {
                bumpArmyXP(8)
                say("\(name)军营推行严明军纪", "诸军整肃号令、赏罚分明：主力军团历练 +8。", kind: "event")
            }
        case 25:
            // 宝船远航探索与海贸暴利
            addGold(2.8); WorldDepth.adjustReputation(r, nation: id, delta: 5)
            say("\(name)宝船远航满载而归", "远洋船队破浪万里、通使海外诸邦并带回珍货海图：国库增近三月岁入，国际信誉 +5。", kind: "diplomacy", p: place)
        case 26:
            // 火器与军工局试射突破
            bumpArmyXP(10, maxCount: 3)
            for a in armies { a.morale = JS(min(100, a.morale.asNumber + 10)) }
            say("\(name)军器监试制新式火炮成功", "百工改良铸炮火药配比，校场试射石破天惊：主力历练 +10，全军士气 +10。", kind: "event", p: place)
        case 27:
            // 边关互市与战马牧场兴旺
            addGold(1.6)
            for a in armies.prefix(3) { a.supplies = JS(100) }
            say("\(pname)边市茶马互通、骏马成群", "胡汉商旅云集边镇易马市茶，官牧孳息日盛：国库增收，三军粮秣充盈。", p: place)
        case 28:
            // 清官犯颜直谏
            corrupt(-6); addDestiny(4)
            say("\(name)直臣犯颜极谏获纳", "谏官不避权贵、条陈时弊十事，中枢从善如流下诏革弊：腐化 −6，国运 +4。", kind: "politics")
        case 29:
            // 书院讲学与学术黄金时代
            addDestiny(4); corrupt(-3)
            if let leader = Regimes.ruler(r, id) {
                leader.base.diplomatic = JS(min(100, (leader.base.diplomatic.optionalNumber ?? 50) + 3))
                leader.base.charisma = JS(min(100, (leader.base.charisma.optionalNumber ?? 50) + 2))
            }
            say("\(name)诸子百家争鸣、书院林立", "名士大儒云集\(pname)讲学论道、海内士子负笈来游：中枢威望与外交精进，国运 +4。", kind: "culture", p: place)
        case 30:
            // 水师清剿海盗、航道肃清
            addGold(2.2); addDestiny(2)
            for fl in Naval.fleets(r) where fl.nationId.optionalString == id && fl.status.asString != "lost" {
                fl.food = JS(max(fl.food.asNumber, fl.ships.asNumber * 2600))
            }
            say("\(name)水师出洋肃清海寇", "战船连破倭寇海盗巢穴，近海商道畅通无阻：国库增两月余岁入，水师海粮补足。", kind: "event", p: place)
        case 31:
            // 义仓赈济流民、化危为安
            addGold(-1.2); addDestiny(5)
            if let st = Regimes.monthStock(r, place.id.asString) {
                st.population = JS((st.population.asNumber * 1.04).rounded())
                st.grain = JS(max(st.grain.asNumber, 6000))
            }
            say("\(name)广设义仓安辑流民", "乱世流民闻仁政而来，官府授田发种、安土重迁：\(pname)增丁 4%，国运 +5。", p: place)
        case 32:
            // 运河漕运全线贯通
            addGold(2.4); corrupt(-2)
            if let st = Regimes.monthStock(r, place.id.asString) { st.grain = JS((st.grain.asNumber * 1.25).rounded()) }
            say("\(pname)大运河漕运全线贯通", "千帆竞发、南北粮赋百货昼夜转输京畿：国库大增两月半岁入，\(pname)存粮 +25%。", p: place)
        case 33:
            // 百年古都修缮营建
            addGold(-1.8); addDestiny(5); WorldDepth.adjustReputation(r, nation: id, delta: 4)
            say("\(name)重修王城礼殿与市坊", "宫阙巍峨、坊市井然，远近使商无不叹服：国运 +5，国际信誉 +4。", kind: "culture", p: place)
        case 34:
            // 权臣擅权与清君侧风波
            corrupt(6); addDestiny(-3)
            say("\(name)权臣专横引发朝野震动", "权要私植党羽、把持枢机，地方藩镇暗生异心：腐化 +6，国运 −3。", kind: "politics")
        case 35:
            // 严寒暴雪冻毙牲畜
            addDestiny(-2)
            if let st = Regimes.monthStock(r, place.id.asString) { st.grain = JS((st.grain.asNumber * 0.80).rounded()) }
            for a in armies.prefix(2) { a.supplies = JS(max(20, a.supplies.asNumber - 18)) }
            say("\(pname)大雪封山、寒潮凛冽", "暴雪连旬阻绝驿道，军民柴粮告急：\(pname)存粮 −20%，前线军粮损耗，国运 −2。", p: place)
        case 36:
            // 丰年大赦与减租诏
            addDestiny(5); corrupt(-4)
            say("\(name)大稔之年颁行大赦宽政", "五谷丰登、朝廷减租免赋并大赦轻囚，万民欢腾：国运 +5，腐化 −4。", kind: "politics")
        case 37:
            // 宗门辩经与宗教热潮
            addDestiny(3)
            for a in armies { a.morale = JS(min(100, a.morale.asNumber + 8)) }
            say("\(name)高僧大德御前辩经", "法会盛况空前、信众归心，三军士卒深信天命所归：全军士气 +8，国运 +3。", kind: "culture")
        case 38:
            // 豪杰义士来投
            if let cmd = Regimes.activeCommander(r, nation: id, enemy: nil), let cp = People.person(r, cmd.personId) {
                cp.base.charisma = JS(min(100, (cp.base.charisma.optionalNumber ?? 50) + 4))
                cp.base.military = JS(min(100, (cp.base.military.optionalNumber ?? 50) + 3))
            }
            for a in armies.prefix(2) {
                let cur = a.troops.asNumber
                let full = max(cur, r.tactics.forces[a.id.asString].fullStrength.optionalNumber ?? cur)
                a.troops = JS(min(full, (cur * 1.08).rounded()))
                a.morale = JS(min(100, a.morale.asNumber + 12))
            }
            say("\(name)四方豪杰慕名投效", "侠士义勇携乡兵来归，愿效死力：主力兵员整补 +8%，士气 +12。", kind: "event", p: place)
        case 39:
            // 皇储/继任者贤明声望大振
            addDestiny(4); WorldDepth.adjustReputation(r, nation: id, delta: 3)
            say("\(name)储位贤明、中外归心", "继任储君监国处事明决宽仁，朝野上下对来日充满期许：国运 +4，国际信誉 +3。", kind: "family")
        case 40:
            // 官营盐铁茶专卖丰盈
            addGold(2.6); corrupt(2)
            say("\(name)盐铁官营岁课大增", "官榷盐铁茶酒利归公家，国库充实但吏胥亦借机渔利：国库大增，腐化微升 +2。", kind: "politics")
        default:
            // 边疆屯田实边、兵农合一
            if let st = Regimes.monthStock(r, place.id.asString) {
                st.grain = JS((st.grain.asNumber * 1.28).rounded())
                st.population = JS((st.population.asNumber * 1.03).rounded())
            }
            for a in armies.prefix(2) { a.supplies = JS(100) }
            say("\(pname)边塞屯田实边见效", "戍卒且耕且守、化荒原为良田，军粮就地自给：\(pname)存粮 +28%、增丁 3%。", p: place)
        }
    }
}
