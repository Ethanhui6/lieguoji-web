import Foundation

/// 政体个性、现实政局与真实政体更迭／政变引擎（本作 App 规则专用，网页逐字节黄金测试不启用）：
/// 1. 为全部 38 种细分政体赋予鲜明差异化的治理个性（财政、军事、安定、腐化、好战、阵营与世家封地规则）；
/// 2. 实时计算每国的「政局安定与政变风险」及主导危机来源（军方异动、权臣逼宫、立宪思潮、社会动荡、复辟暗流）；
/// 3. 用历史现实逻辑驱动政变、立宪维新、权臣摄政／幕府架空、社会大革命、威权夺权、王政复辟与还政于民；
/// 4. 提供玩家可主动发起的「政体更迭与政变」指令，所有更迭均联动真实国名适配、执政更替与世家规则切换。
extension Regimes {
    /// 七大现实意识形态阵营（用于外交好感契合／敌对、国际阵营对抗与革命方向）。
    public enum PolityCamp: String, Sendable {
        case monarchy = "君主"
        case constitutional = "立宪"
        case republic = "共和"
        case socialist = "左翼"
        case authoritarian = "威权"
        case theocracy = "神权"
        case tribal = "部族"
    }

    /// 政体对世家与封地的治理模式（落实多政体世家差异玩法）。
    public enum FiefRule: String, Sendable {
        /// 封建领主／选侯：高封地上限，世家拥兵与话语权大；选侯制下君主逝世由前三大世家公选新王。
        case feudal = "封建领主"
        /// 常规王朝／帝制／神权：允许赐封与削藩，宗室世袭。
        case dynastic = "宗室赐封"
        /// 摄政／幕府：区分「名义宗室」与「掌权世家」，实际掌权家族享执政加成。
        case regent = "权臣幕府"
        /// 共和／商业／社会主义／现代威权：不设封建封地，世家势力仅来自官职与家族财富。
        case republican = "无封建封地"
        /// 部落／汗国：游牧领地制，大汗／酋长由境内强势部族推举。
        case tribal = "部族公推"

        public var allowsFiefs: Bool { self != .republican }
    }

    /// 细分政体的完整差异化个性画像。
    public struct StyleProfile: Sendable {
        public let id: String
        public let camp: PolityCamp
        public let fiefRule: FiefRule
        public let attack: Double
        public let defense: Double
        public let income: Double
        public let stability: Double
        public let corruption: Double
        public let temper: Double       // 好战度乘数偏移，如 +0.25 表示更好战，-0.15 表示偏和平
        public let summary: String
        public let traitLine: String
    }

    /// 全 38 种细分政体的真实个性参数表。
    public static let styleProfiles: [String: StyleProfile] = {
        let list: [StyleProfile] = [
            // 君主制与帝制
            StyleProfile(id: "absolute", camp: .monarchy, fiefRule: .dynastic, attack: 4, defense: 2, income: 3, stability: 2, corruption: 3, temper: 0.08,
                         summary: "王权独揽，政令由宫廷直达地方，效率高却易滋生近臣腐败。", traitLine: "进攻+4% · 岁入+3% · 腐化+3"),
            StyleProfile(id: "feudal", camp: .monarchy, fiefRule: .feudal, attack: 0, defense: 8, income: -4, stability: -2, corruption: -2, temper: 0.0,
                         summary: "分封诸侯共守社稷，本土防御坚固，但门阀坐大、财政分散。", traitLine: "守御+8% · 岁入−4% · 世家封地权高"),
            StyleProfile(id: "elective", camp: .monarchy, fiefRule: .feudal, attack: -2, defense: 5, income: 2, stability: 5, corruption: -4, temper: -0.06,
                         summary: "大贵族议会公选新王，朝堂少暴政却多派系掣肘。", traitLine: "守御+5% · 安定+5 · 腐化−4 · 三大世家选王"),
            StyleProfile(id: "principality", camp: .monarchy, fiefRule: .feudal, attack: 0, defense: 6, income: 4, stability: 4, corruption: -3, temper: -0.05,
                         summary: "小邦精治、邦君近民，财税稳健且善于凭险自守。", traitLine: "守御+6% · 岁入+4% · 安定+4"),
            StyleProfile(id: "regency", camp: .monarchy, fiefRule: .regent, attack: 2, defense: 0, income: -2, stability: -6, corruption: 5, temper: 0.04,
                         summary: "君主冲龄或失柄，摄政权臣代掌国政，宗室与权门暗流涌动。", traitLine: "权臣执政 · 安定−6 · 腐化+5 · 易生政变"),
            StyleProfile(id: "sultanate", camp: .monarchy, fiefRule: .dynastic, attack: 8, defense: 4, income: 2, stability: 0, corruption: 2, temper: 0.14,
                         summary: "军功贵族与禁卫军拱卫苏丹，锋芒凌厉而重开疆拓土。", traitLine: "进攻+8% · 守御+4% · 进取好战"),
            StyleProfile(id: "constitutional", camp: .constitutional, fiefRule: .dynastic, attack: -3, defense: 4, income: 8, stability: 10, corruption: -6, temper: -0.10,
                         summary: "虚君立宪、内阁辅政，兼得王室正统与议会清明，政局最为稳固。", traitLine: "岁入+8% · 安定+10 · 腐化−6 · 首相主政"),
            StyleProfile(id: "empire", camp: .monarchy, fiefRule: .dynastic, attack: 8, defense: 3, income: 2, stability: -2, corruption: 4, temper: 0.18,
                         summary: "四海一统之威仪，军锋强盛、国运绵长，然疆域辽阔易生吏治积弊。", traitLine: "进攻+8% · 守御+3% · 扩张欲强"),
            StyleProfile(id: "dynasty", camp: .monarchy, fiefRule: .dynastic, attack: 5, defense: 5, income: 4, stability: 3, corruption: 2, temper: 0.10,
                         summary: "天命正朔、文官郡县与禁军并重，兴盛时万邦来朝，衰季则易启更迭。", traitLine: "攻防+5% · 岁入+4% · 安定+3"),
            StyleProfile(id: "despotism", camp: .monarchy, fiefRule: .dynastic, attack: 10, defense: 0, income: 5, stability: -7, corruption: 6, temper: 0.22,
                         summary: "乾纲独断、严刑峻法，短期动员极强，但民怨与政变暗潮汹涌。", traitLine: "进攻+10% · 岁入+5% · 安定−7 · 腐化+6"),
            StyleProfile(id: "tsardom", camp: .monarchy, fiefRule: .dynastic, attack: 9, defense: 6, income: -2, stability: -2, corruption: 4, temper: 0.16,
                         summary: "集权沙皇统御广袤大陆，重兵厚防、韧性极强。", traitLine: "进攻+9% · 守御+6% · 岁入−2%"),
            StyleProfile(id: "shogunate", camp: .monarchy, fiefRule: .regent, attack: 12, defense: 6, income: 0, stability: 2, corruption: -2, temper: 0.12,
                         summary: "天皇垂拱而幕府掌兵，武家尚武精锐，大名世家林立。", traitLine: "进攻+12% · 守御+6% · 幕府将军主政"),

            // 共和与联邦
            StyleProfile(id: "democratic", camp: .republic, fiefRule: .republican, attack: -4, defense: 4, income: 9, stability: 8, corruption: -6, temper: -0.16,
                         summary: "多党竞选、宪政分权，工商繁荣、吏治清明，但不喜穷兵黩武。", traitLine: "岁入+9% · 安定+8 · 腐化−6 · 无封地"),
            StyleProfile(id: "parliamentary", camp: .republic, fiefRule: .republican, attack: -3, defense: 4, income: 10, stability: 7, corruption: -5, temper: -0.14,
                         summary: "议会多数党组阁施政，内阁随席位进退，财政透明高效。", traitLine: "岁入+10% · 安定+7 · 腐化−5 · 总理主政"),
            StyleProfile(id: "presidential", camp: .republic, fiefRule: .republican, attack: 3, defense: 3, income: 7, stability: 5, corruption: -3, temper: -0.04,
                         summary: "民选总统兼掌行政与三军，危机决策果断而兼具共和活力。", traitLine: "攻防+3% · 岁入+7% · 安定+5 · 无封地"),
            StyleProfile(id: "oligarchic", camp: .republic, fiefRule: .republican, attack: 2, defense: 3, income: 11, stability: -2, corruption: 4, temper: 0.05,
                         summary: "元老豪族把持国柄，长于聚敛生财，然贫富悬殊易起民潮。", traitLine: "岁入+11% · 腐化+4 · 安定−2 · 豪族执政"),
            StyleProfile(id: "merchant", camp: .republic, fiefRule: .republican, attack: -5, defense: 2, income: 16, stability: 4, corruption: 2, temper: -0.12,
                         summary: "商船四海、金库盈溢，以财力维系雇佣兵与盟友网络。", traitLine: "岁入+16% · 进攻−5% · 商贸为本"),
            StyleProfile(id: "citystate", camp: .republic, fiefRule: .republican, attack: 0, defense: 10, income: 12, stability: 6, corruption: -4, temper: -0.10,
                         summary: "城垣坚固、公民自治，工商繁盛且极难被强敌攻陷。", traitLine: "守御+10% · 岁入+12% · 安定+6"),
            StyleProfile(id: "federal", camp: .republic, fiefRule: .republican, attack: 0, defense: 6, income: 8, stability: 9, corruption: -5, temper: -0.10,
                         summary: "各邦自治而外交国防统一，大国仍能保持长久安定与繁荣。", traitLine: "守御+6% · 岁入+8% · 安定+9 · 大国稳态"),
            StyleProfile(id: "confederation", camp: .republic, fiefRule: .republican, attack: -4, defense: 8, income: 6, stability: 6, corruption: -4, temper: -0.18,
                         summary: "松散邦联共御外侮，重防守与通商，极少主动对外扩张。", traitLine: "守御+8% · 岁入+6% · 温和重防"),
            StyleProfile(id: "union", camp: .constitutional, fiefRule: .dynastic, attack: 4, defense: 5, income: 9, stability: 8, corruption: -4, temper: 0.02,
                         summary: "共主联合王国，兼融海陆财力与议会制度，国力均衡强劲。", traitLine: "攻+4% 守+5% · 岁入+9% · 安定+8"),

            // 社会主义与革命委员会
            StyleProfile(id: "socialist", camp: .socialist, fiefRule: .republican, attack: 4, defense: 8, income: 4, stability: 5, corruption: -5, temper: 0.04,
                         summary: "计划统筹与全民动员，废除封建特权，工业与国防并进。", traitLine: "守御+8% · 进攻+4% · 腐化−5 · 无封地"),
            StyleProfile(id: "communist", camp: .socialist, fiefRule: .republican, attack: 8, defense: 10, income: 2, stability: 2, corruption: -4, temper: 0.14,
                         summary: "高度集中动员体制，钢铁意志与强大后备兵力，与旧君主制水火不容。", traitLine: "进攻+8% · 守御+10% · 强动员 · 无封地"),
            StyleProfile(id: "council", camp: .socialist, fiefRule: .republican, attack: 7, defense: 5, income: -3, stability: -4, corruption: -3, temper: 0.12,
                         summary: "非常时期革命委员会掌权，士气炽烈但经济与秩序尚待重整。", traitLine: "进攻+7% · 守御+5% · 岁入−3% · 革命体制"),

            // 威权与军政府
            StyleProfile(id: "junta", camp: .authoritarian, fiefRule: .republican, attack: 14, defense: 7, income: -8, stability: -8, corruption: 4, temper: 0.28,
                         summary: "将领兵变实行军管，战力骤增却压抑民生，极易再起政变或被迫还政。", traitLine: "进攻+14% · 守御+7% · 岁入−8% · 安定−8"),
            StyleProfile(id: "warlord", camp: .authoritarian, fiefRule: .dynastic, attack: 12, defense: 4, income: -10, stability: -10, corruption: 6, temper: 0.30,
                         summary: "军阀割据拥兵自雄，征战凶猛而百废待兴，胜则建号称尊。", traitLine: "进攻+12% · 岁入−10% · 安定−10"),
            StyleProfile(id: "dictatorship", camp: .authoritarian, fiefRule: .republican, attack: 10, defense: 5, income: -2, stability: -5, corruption: 5, temper: 0.22,
                         summary: "强人集权废黜议会，对外强硬果决，内部暗藏刺杀与倒台危机。", traitLine: "进攻+10% · 守御+5% · 安定−5 · 强硬扩张"),
            StyleProfile(id: "fascist", camp: .authoritarian, fiefRule: .republican, attack: 18, defense: 4, income: -4, stability: -6, corruption: 4, temper: 0.42,
                         summary: "极端民族主义与总体战机器，进攻极其凌厉，但会招致四邻包围网。", traitLine: "进攻+18% · 极度好战 · 易招反霸包围网"),
            StyleProfile(id: "nazi", camp: .authoritarian, fiefRule: .republican, attack: 20, defense: 4, income: -5, stability: -8, corruption: 5, temper: 0.45,
                         summary: "极权军国主义，全力投入对外侵略，与世界多数阵营势同水火。", traitLine: "进攻+20% · 极度好战 · 孤立招敌"),

            // 神权政体
            StyleProfile(id: "theocracy", camp: .theocracy, fiefRule: .dynastic, attack: 4, defense: 9, income: 0, stability: 7, corruption: -4, temper: 0.06,
                         summary: "教律治国、信众齐心，本土守御坚韧且民心凝聚。", traitLine: "守御+9% · 进攻+4% · 安定+7 · 腐化−4"),
            StyleProfile(id: "caliphate", camp: .theocracy, fiefRule: .dynastic, attack: 10, defense: 6, income: 3, stability: 4, corruption: -2, temper: 0.20,
                         summary: "政教合一统领群邦，兼具商路财源与圣战锋芒。", traitLine: "进攻+10% · 守御+6% · 岁入+3%"),
            StyleProfile(id: "papacy", camp: .theocracy, fiefRule: .dynastic, attack: -2, defense: 8, income: 8, stability: 10, corruption: -3, temper: -0.10,
                         summary: "教廷威望远播诸邦，什一税丰厚且守土稳固。", traitLine: "守御+8% · 岁入+8% · 安定+10"),
            StyleProfile(id: "order", camp: .theocracy, fiefRule: .dynastic, attack: 13, defense: 10, income: -4, stability: 5, corruption: -6, temper: 0.18,
                         summary: "纪律严明的武装修会骑士团，以少胜多、廉洁善战。", traitLine: "进攻+13% · 守御+10% · 腐化−6"),
            StyleProfile(id: "lamaism", camp: .theocracy, fiefRule: .dynastic, attack: -2, defense: 10, income: 0, stability: 10, corruption: -5, temper: -0.14,
                         summary: "活佛法王政教合一，高原固守、民风笃信安宁。", traitLine: "守御+10% · 安定+10 · 腐化−5"),
            StyleProfile(id: "holy", camp: .theocracy, fiefRule: .dynastic, attack: 11, defense: 8, income: -5, stability: -4, corruption: -3, temper: 0.24,
                         summary: "狂热神国运动，兵锋狂飙而百业凋敝，胜则定鼎为教廷或王朝。", traitLine: "进攻+11% · 守御+8% · 岁入−5%"),

            // 部落与起义
            StyleProfile(id: "tribal", camp: .tribal, fiefRule: .tribal, attack: 10, defense: 2, income: -8, stability: 0, corruption: -3, temper: 0.16,
                         summary: "部族联盟骑射强悍，机动迅捷但财税簿弱。", traitLine: "进攻+10% · 岁入−8% · 部族推举首领"),
            StyleProfile(id: "khanate", camp: .tribal, fiefRule: .tribal, attack: 15, defense: 3, income: -6, stability: -2, corruption: -2, temper: 0.26,
                         summary: "草原大汗统合诸部，铁骑席卷四方，靠战功与掠夺维系权威。", traitLine: "进攻+15% · 进取好战 · 诸部共推大汗"),
            StyleProfile(id: "chiefdom", camp: .tribal, fiefRule: .tribal, attack: 7, defense: 5, income: -6, stability: 2, corruption: -4, temper: 0.08,
                         summary: "山林酋邦团结悍勇，易守难攻、少官僚积弊。", traitLine: "进攻+7% · 守御+5% · 腐化−4"),
            StyleProfile(id: "peasant", camp: .tribal, fiefRule: .republican, attack: 9, defense: 4, income: -10, stability: -6, corruption: -5, temper: 0.20,
                         summary: "揭竿而起的农民义师，锐气逼人但亟待开国建制。", traitLine: "进攻+9% · 岁入−10% · 急待建制"),
            // 现实扩展柔性政体
            StyleProfile(id: "dualMonarchy", camp: .constitutional, fiefRule: .dynastic, attack: 7, defense: 5, income: 8, stability: 6, corruption: -4, temper: 0.10,
                         summary: "皇权与议会并立（如德意志帝国、明治维新），兼顾君主决断力与立宪财政效能。", traitLine: "进攻+7% 守御+5% · 岁入+8% · 君相共治"),
            StyleProfile(id: "semiPresidential", camp: .republic, fiefRule: .republican, attack: 5, defense: 4, income: 9, stability: 6, corruption: -4, temper: 0.02,
                         summary: "民选总统掌外交国防、总理率议会内阁治内政，危机应变与财政均衡俱佳。", traitLine: "攻+5% 守+4% · 岁入+9% · 双首脑制"),
            StyleProfile(id: "technocracy", camp: .republic, fiefRule: .republican, attack: 2, defense: 5, income: 14, stability: 4, corruption: -10, temper: -0.04,
                         summary: "精干官僚与学者治国，财税效率极高、腐败骤降，然缺乏群众动员热忱。", traitLine: "岁入+14% · 腐化−10 · 高效行政"),
            StyleProfile(id: "directorate", camp: .republic, fiefRule: .republican, attack: 6, defense: 4, income: 6, stability: 2, corruption: -2, temper: 0.08,
                         summary: "数位执政官合议分权（法兰西督政府式），防单人独裁却多派系纵横。", traitLine: "进攻+6% · 岁入+6% · 执政合议"),
        ]
        var dict = [String: StyleProfile]()
        for p in list { dict[p.id] = p }
        return dict
    }()

    /// 读取某国当前的政体个性画像（兜底回退到君主专制）。
    public static func styleProfile(_ r: JS, _ id: String) -> StyleProfile {
        let s = style(r, id)
        return styleProfiles[s.id] ?? styleProfiles["absolute"]!
    }

    /// 某国是否允许封建世家封地（共和/社会主义/现代军政不设封地）。
    public static func allowsFiefs(_ r: JS, _ id: String) -> Bool {
        guard !r.regimes.isNull, r.regimes.enabled.isTruthy else { return true }
        return styleProfile(r, id).fiefRule.allowsFiefs
    }

    // MARK: - 现实政局诊断与政变风险评估

    public struct CoupOutlook: Sendable {
        public let stability: Int
        public let risk: Int           // 0…100 政变/革命综合风险指数
        public let level: String       // 稳固 / 暗流 / 危局 / 濒变
        public let pressure: String    // 主导政治压力说明
        public let likelyPath: String  // 最可能发生的现实政变/更迭方向
    }

    /// 实时评估某国政权稳固度与最可能爆发的现实政变／革命压力（供 AI 决策与国家页「朝政」仪表盘共用）。
    public static func coupOutlook(_ r: JS, _ id: String) -> CoupOutlook {
        let sway = leverage(r, id)
        let stability = max(0, min(100, Int(sway.stability.rounded())))
        let prof = styleProfile(r, id)
        let corrupt = Finance.corruption(r, id)
        let gov = Offices.governance(r, id)
        let debtMon = monthlyIncome(r, id) > 0 ? debt(r, id) / max(1, monthlyIncome(r, id)) : 0
        let leader = ruler(r, id)
        let leaderAge = leader?.age.optionalNumber ?? 35
        let leaderAdm = leader.map { People.skills($0).administrative } ?? 50
        let atWar = isAtWar(r, id)
        let defeat = defeatPenalty(r, id)

        var risk = max(0.0, 58.0 - Double(stability)) * 1.15
        if corrupt >= 40 { risk += (corrupt - 35) * 0.45 }
        if gov < 0.35 { risk += (0.35 - gov) * 45 }
        if debtMon >= 18 { risk += min(25, (debtMon - 16) * 0.8) }
        if atWar { risk += 8 }
        if defeat > 0.05 { risk += defeat * 42 }
        if prof.camp == .authoritarian { risk += 12 }
        if prof.id == "regency" { risk += 10 }
        if prof.camp == .constitutional { risk *= 0.65 }
        if rulerHas(r, id, { $0.isReformer.isTruthy }) { risk *= 0.72 }
        let clampedRisk = max(0, min(100, Int(risk.rounded())))

        let level = clampedRisk >= 68 ? "濒变" : clampedRisk >= 44 ? "危局" : clampedRisk >= 22 ? "暗流" : "稳固"

        // 判定主导政治压力来源
        let marshal = Offices.holder(r, id, "Marshal", Offices.stateId(r, id))
        let marshalAmbitious = marshal.map { p in
            let s = People.skills(p).military
            let traits = p.traits.isNull ? [] : p.traits.asArray.map(\.asString)
            return s >= 65 || traits.contains("Ambitious") || traits.contains("Hawkish") || traits.contains("Cruel")
        } ?? false

        let pressure: String
        let likelyPath: String
        if defeat >= 0.25 && clampedRisk >= 34 {
            pressure = "新败失地、朝野震荡，究责与改制呼声高涨"
            likelyPath = prof.camp == .monarchy ? "立宪问责或军事政变" : "倒阁改组或强人夺权"
        } else if prof.camp == .authoritarian && clampedRisk < 40 && !atWar {
            pressure = "军管日久，民间呼唤还政于民"
            likelyPath = "制宪还政 → 议会/总统共和"
        } else if (atWar || debtMon >= 20 || marshalAmbitious) && prof.camp != .authoritarian && clampedRisk >= 35 {
            pressure = marshalAmbitious ? "军中强人手握重兵，蠢蠢欲动" : "战事与财政承压，军方不满文官"
            likelyPath = "军事政变 → 军政府"
        } else if prof.camp == .monarchy && (leaderAge < 16 || leaderAdm < 42) && prof.id != "regency" && prof.id != "shogunate" {
            pressure = leaderAge < 16 ? "少主冲龄即位，权臣世家专权" : "君主庸弱，朝纲渐落权臣之手"
            likelyPath = (r.civilization.nations[id].cultureId.optionalString == "japanese") ? "武家架空 → 幕府" : "宫廷权争 → 权臣摄政"
        } else if prof.camp == .monarchy && (rulerHas(r, id, { $0.isReformer.isTruthy }) || (stability >= 36 && stability <= 58)) {
            pressure = "士绅与新派吁请开议会、定宪法"
            likelyPath = "立宪维新 → 君主立宪"
        } else if (prof.camp == .monarchy || prof.camp == .authoritarian) && stability < 36 {
            pressure = "腐化与重税激化矛盾，革命思潮涌动"
            likelyPath = corrupt >= 48 ? "激进社会革命 → 人民/社会主义共和" : "民众大革命 → 民主共和"
        } else if prof.camp == .republic && clampedRisk >= 42 {
            pressure = "党争内耗、政局动荡，强人与复辟派抬头"
            likelyPath = "强人夺权或王政复辟"
        } else {
            pressure = "朝野大势平稳，各派维持均衡"
            likelyPath = "维持现行体制"
        }
        return CoupOutlook(stability: stability, risk: clampedRisk, level: level, pressure: pressure, likelyPath: likelyPath)
    }

    // MARK: - 月度现实政体演进与政变（替代无厘头随机漂移）

    /// 每月按真实国内危机、将领野心、幼主权臣、思潮与败战状态触发合乎历史逻辑的政体更迭或政变。
    static func realisticPoliticsMonth(_ r: JS, _ n: JS, _ id: String, _ key: Int) {
        let b = book(r, id)
        b.calm = JS(b.calm.asInt + 1)
        let evRate = rule(r, "event")
        guard evRate > 0 else { return }
        // 两次重大政体剧变之间至少间隔 30 个月（防止反复横跳失真）。
        guard b.calm.asInt >= 30 else { return }
        let held = monthLandCount(r, id)
        guard held >= 3 else { return }

        let outlook = coupOutlook(r, id)
        let prof = styleProfile(r, id)
        let civ = r.civilization.nations[id]
        let culture = civ.cultureId.optionalString ?? ""
        let faith = civ.religionId.optionalString ?? ""
        let tag = "\(id)|\(key)|realpol"

        // 1. 军政府/独裁长期和平后还政于民（现实如拉美/东亚军政府民主化）
        if prof.camp == .authoritarian && b.calm.asInt >= 60 && !isAtWar(r, id) && outlook.stability >= 52 {
            if chance(tag + "|civilian") < 0.025 * evRate {
                let target = chance(tag + "|civkind") < 0.5 ? "presidential" : "parliamentary"
                _ = executeTransition(r, id: id, toStyle: target, kind: "civilian", actorName: nil, detail: "连年太平，军政当局迫于民意召开制宪国会，交出政权、还政于民。")
                return
            }
        }

        // 2. 君主国改革家推行和平立宪维新（不需大动乱也能发生）
        if prof.camp == .monarchy && prof.id != "constitutional" && prof.id != "regency" && prof.id != "shogunate" {
            let reformer = rulerHas(r, id, { $0.isReformer.isTruthy })
            let moderateUnrest = outlook.stability >= 36 && outlook.stability <= 56
            if reformer || moderateUnrest {
                let p = (reformer ? 0.022 : 0.008) * evRate
                if chance(tag + "|const") < p {
                    _ = executeTransition(r, id: id, toStyle: "constitutional", kind: "reform", actorName: nil, detail: reformer ? "开明君主顺应时势，颁布宪法、开设议会，和平改行君主立宪。" : "朝廷为缓和民怨，采纳维新派建言，颁行宪章并设立责任内阁。")
                    return
                }
            }
        }

        // 3. 权臣摄政 / 日本幕府架空（幼主或庸君 + 强权臣）
        if prof.camp == .monarchy && prof.id != "regency" && prof.id != "shogunate" && prof.id != "constitutional" {
            let leader = ruler(r, id)
            let weakCrown = (leader?.age.optionalNumber ?? 30) < 16 || (leader.map { People.skills($0).administrative + People.skills($0).charisma < 85 } ?? false)
            if weakCrown && chance(tag + "|regent") < 0.02 * evRate {
                let chan = Offices.holder(r, id, "Chancellor", Offices.stateId(r, id))
                let actor = chan.map { NativeEngine.displayPersonName($0) }
                let toStyle = culture == "japanese" ? "shogunate" : "regency"
                let detail = culture == "japanese"
                    ? "王室式微，武家大将\(actor ?? "权臣")总揽兵政、开府理国，天皇退居虚位。"
                    : "君主冲龄／失柄，\(actor ?? "权臣")总摄朝政、代颁诏令，大权旁落权门。"
                _ = executeTransition(r, id: id, toStyle: toStyle, kind: "regency", actorName: actor, detail: detail)
                return
            }
        }

        // 4. 真正的危机驱动型政变／革命／威权夺权／复辟（高风险才会发生；关闭叛乱或动荡归零时不触发）
        if !r.foundings.isNull && !r.foundings.enabled.isTruthy { return }
        guard rule(r, "rebel") > 0 else { return }
        guard outlook.risk >= 34 else { return }
        let triggerProb = Double(outlook.risk - 28) / 100.0 * 0.045 * evRate
        guard chance(tag + "|crisis") < triggerProb else { return }

        let lost = monthLostCount(r, id)
        let defeat = defeatPenalty(r, id)
        let corrupt = Finance.corruption(r, id)
        let sid = Offices.stateId(r, id)
        let marshal = Offices.holder(r, id, "Marshal", sid)
        let debtMon = monthlyIncome(r, id) > 0 ? debt(r, id) / max(1, monthlyIncome(r, id)) : 0
        let roll = chance(tag + "|branch")

        // A. 军事政变：战败失地、欠饷重债或强硬统帅掌兵
        if prof.camp != .authoritarian, (lost > 0 || defeat >= 0.18 || debtMon >= 18 || isAtWar(r, id) || marshal != nil), roll < 0.34 {
            let general = marshal ?? claimant(r, id, .otherHouse)
            let genName = general.map { NativeEngine.displayPersonName($0) }
            let detail = "\(genName ?? "军方将领")以「内忧外患、文官误国」为由率部包围京师，发动军事政变并宣布全国戒严。"
            _ = executeTransition(r, id: id, toStyle: "junta", kind: "coup", actorName: genName, appointPerson: general, detail: detail)
            return
        }

        // B. 君主／威权／神权深陷危局 → 社会大革命（温和民主革命 或 激进左翼革命）
        if prof.camp == .monarchy || prof.camp == .authoritarian || prof.camp == .theocracy {
            let radical = corrupt >= 46 || outlook.stability < 30 || debtMon >= 24
            let target: String
            let detail: String
            if radical && roll < 0.72 {
                target = chance(tag + "|rad") < 0.55 ? "socialist" : "communist"
                detail = "苛捐重税与战祸彻底引爆底层怒火，革命军攻占首都、废除旧制与封建特权，建立新的人民政权。"
            } else {
                target = chance(tag + "|dem") < 0.5 ? "parliamentary" : "democratic"
                detail = "市民、士绅与起义军联合推翻旧政权，颁布共和宪法，改由民选议会与总统治国。"
            }
            _ = executeTransition(r, id: id, toStyle: target, kind: "revolution", actorName: nil, detail: detail)
            return
        }

        // C. 共和／立宪深陷危局 → 强人独裁／威权夺权 或 王政复辟／强人称帝
        if prof.camp == .republic || prof.camp == .constitutional || prof.camp == .socialist {
            let hadCrown = b.history.asArray.contains { $0.asString == "Empire" || $0.asString == "Kingdom" }
            if hadCrown && roll < 0.62 {
                let restoreStyle: String = {
                    if culture == "chinese" { return "dynasty" }
                    if culture == "slavic" { return "tsardom" }
                    if culture == "arab" || culture == "turkic" { return "sultanate" }
                    return chance(tag + "|emp") < 0.45 ? "empire" : "constitutional"
                }()
                let detail = "共和政局长期内耗失序，保皇军与旧贵族联手拥立新主，宣布恢复君主国体。"
                _ = executeTransition(r, id: id, toStyle: restoreStyle, kind: "restoration", actorName: nil, detail: detail)
                return
            } else {
                let authStyle: String = ((lost > 0 || defeat >= 0.18) && roll > 0.78) ? "fascist" : "dictatorship"
                let detail = authStyle == "fascist"
                    ? "战败屈辱与经济凋敝催生极端民族狂潮，强人解散议会、实行战时极权统制。"
                    : "议会长期瘫痪，执政强人宣布紧急状态并解散党派，独揽军政大权。"
                _ = executeTransition(r, id: id, toStyle: authStyle, kind: "coup", actorName: nil, detail: detail)
                return
            }
        }

        // D. 宗教危机：仅在文化宗教完全吻合时发生神权化
        if prof.camp != .theocracy && roll > 0.85 {
            let theo: String? = faith == "islam" ? "caliphate" : faith == "catholic" ? "papacy" : ["tantric", "buddhism"].contains(faith) ? "lamaism" : nil
            if let theo, NamingCatalog.isStyleAuthentic(theo, culture: culture, religion: faith) {
                _ = executeTransition(r, id: id, toStyle: theo, kind: "theocracy", actorName: nil, detail: "教门领袖趁政局动荡登高一呼，信众云从，改立政教合一之国体。")
            }
        }
    }

    /// 统一执行一次真实政体更迭／政变：
    /// 自动校验文化合理性、适配地道国名、处理统治者交接（可选指定发动政变的真实将领）、按新政体清理封建封地并写入国史！
    @discardableResult
    public static func executeTransition(
        _ r: JS,
        id: String,
        toStyle targetId: String,
        kind: String,
        actorName: String?,
        appointPerson: JS? = nil,
        detail: String
    ) -> (ok: Bool, reason: String) {
        guard let n = r.world.nations.asArray.first(where: { $0.id.asString == id }),
              let targetStyle = styles.first(where: { $0.id == targetId }) else {
            return (false, "目标政体不存在。")
        }
        let b = book(r, id)
        let oldName = n.name.asString
        let oldStyle = style(r, id)
        let oldPolity = r.civilization.nations[id].polity.optionalString ?? "Kingdom"
        let culture = r.civilization.nations[id].cultureId.optionalString ?? ""

        // 1. 切换政体与样式并重新适配现实国名
        r.civilization.nations[id].polity = JS(targetStyle.base)
        if !r.upperCombat.nations[id].isNull { r.upperCombat.nations[id].polity = JS(targetStyle.base) }
        b.style = JS(targetStyle.id)
        b.parties = .null
        b.calm = JS(0)
        b.history.push(JS(targetStyle.base))
        if targetStyle.base == "Empire" && oldPolity != "Empire" { b.empires = JS(b.empires.asInt + 1) }

        // 自动校验国名与新政体匹配（例如 大金 → 中华/江南共和国，江南共和国 → 复辟王朝号）
        let civName = r.civilization.nations[id].name
        if civName.custom.isNull && b.nameTemplate.optionalString == nil {
            let curBase = NamingCatalog.cleanStateBase(civName.value.optionalString ?? MapLayers.stateLabel(oldName, full: false))
            let adapted = NamingCatalog.adaptBaseForStyle(base: curBase, culture: culture, style: targetStyle, seed: "\(r.world.custom.seed.asString)|trans|\(id)|\(targetStyle.id)|\(r.clock.tick.asInt)", used: NamingCatalog.usedStateKeys(r))
            if !adapted.isEmpty && adapted != curBase { civName.value = JS(adapted) }
        }
        let finalBase = NamingCatalog.cleanStateBase(civName.value.optionalString ?? MapLayers.stateLabel(oldName, full: false))
        n.name = JS(title(r, id, base: finalBase, style: targetStyle))

        // 2. 权力交接：政变／革命／复辟更换真实领袖，立宪／摄政保留名义君主并任命内阁首脑
        let installedName: String?
        if let actor = appointPerson, actor.isAlive.asBool {
            installedName = install(r, id, actor, cause: "coup")
        } else if kind == "coup" || kind == "revolution" || kind == "restoration" || kind == "civilian" {
            installedName = seat(r, id)
        } else {
            installedName = actorName
        }

        // 若新政体有实权首相／摄政／幕府大将军，立即物色内阁首脑
        if seats(r, id).premier != nil {
            ensurePremier(r, id)
        }

        // 3. 政体差异化后果：废除封建封地、腐化与国运冲击
        let newProf = styleProfile(r, id)
        if !newProf.fiefRule.allowsFiefs && !r.nobility.isNull && !r.nobility.families.isNull {
            // 转向共和／社会主义／军管时，收回国内世家封建封地（财产与人脉仍存，转入官僚与商界博弈）
            for fam in r.nobility.families.objectValues where fam.nationId.optionalString == id {
                fam.controlledProvinces = .array()
            }
        }
        let destinyRow = r.destiny.nations[id]
        switch kind {
        case "reform":
            Finance.setCorruption(r, id, max(0, Finance.corruption(r, id) - 8))
            if !destinyRow.isNull { destinyRow.destiny = JS(min(100, (destinyRow.destiny.optionalNumber ?? 50) + 6)) }
        case "coup":
            Finance.setCorruption(r, id, max(0, Finance.corruption(r, id) - 3))
            if !destinyRow.isNull { destinyRow.destiny = JS(max(5, (destinyRow.destiny.optionalNumber ?? 50) - 8)) }
        case "revolution":
            Finance.setCorruption(r, id, Finance.corruption(r, id) * 0.55)
            if !destinyRow.isNull { destinyRow.destiny = JS(max(10, (destinyRow.destiny.optionalNumber ?? 50) - 5)) }
        case "restoration":
            if !destinyRow.isNull { destinyRow.destiny = JS(min(100, (destinyRow.destiny.optionalNumber ?? 50) + 4)) }
        default:
            break
        }

        // 4. 写入鲜明可读的国史事件（并匹配前端 HeraldScene 专属政变／改制水墨动画！）
        let headline: String
        switch kind {
        case "coup":
            headline = "\(oldName)爆发军事政变，\(installedName.map { "\($0)掌权并" } ?? "")改建\(n.name.asString)"
        case "regency":
            headline = "\(oldName)改行\(targetStyle.label)，\(installedName.map { "\($0)总揽朝政" } ?? "权臣主政")"
        case "reform":
            headline = "\(oldName)推行立宪维新，改制为\(n.name.asString)"
        case "revolution":
            headline = "\(oldName)爆发革命，推翻\(oldStyle.label)建立\(n.name.asString)"
        case "restoration":
            headline = "\(oldName)王政复辟，重建\(n.name.asString)"
        case "civilian":
            headline = "\(oldName)还政于民，改建\(n.name.asString)"
        default:
            headline = "\(oldName)改行\(targetStyle.label)，改称\(n.name.asString)"
        }
        _ = People.announce(r, kind: "politics", text: headline, reason: detail, nations: [id], province: nil)
        Government.reconcileContinuity(r)
        return (true, headline)
    }

    /// 供国家页展示的可执行「现实政体演变」选项列表。
    public struct TransitionOption: Sendable {
        public let id: String
        public let title: String
        public let subtitle: String
        public let targetStyle: String
        public let dramatic: Bool
    }

    public static func availableTransitions(_ r: JS, _ id: String) -> [TransitionOption] {
        let prof = styleProfile(r, id)
        let culture = r.civilization.nations[id].cultureId.optionalString ?? ""
        var out = [TransitionOption]()
        if prof.camp == .monarchy {
            if prof.id != "constitutional" {
                out.append(TransitionOption(id: "constitutional", title: "推行虚君立宪", subtitle: "颁行宪法设议会 · 腐化 −8 · 安定大幅提升", targetStyle: "constitutional", dramatic: false))
            }
            if prof.id != "dualMonarchy" {
                out.append(TransitionOption(id: "dualMonarchy", title: "二元君主维新", subtitle: "君主保留军政大权兼设议会宰相 · 强军富国", targetStyle: "dualMonarchy", dramatic: false))
            }
            if prof.id != "regency" && prof.id != "shogunate" {
                let isJP = culture == "japanese"
                out.append(TransitionOption(id: "regency", title: isJP ? "幕府开府掌兵" : "权臣总摄朝政", subtitle: isJP ? "天皇垂拱、征夷大将军执政 · 战力大增" : "保留名义君主，由宰相权臣总揽军政", targetStyle: isJP ? "shogunate" : "regency", dramatic: true))
            } else {
                out.append(TransitionOption(id: "directRule", title: "君主亲政还权", subtitle: "收回摄政／幕府大权，恢复君主亲政", targetStyle: culture == "chinese" ? "dynasty" : "absolute", dramatic: true))
            }
            out.append(TransitionOption(id: "militaryCoup", title: "发动军事政变", subtitle: "现役主将领兵夺权改建军政府 · 进攻 +14%", targetStyle: "junta", dramatic: true))
            out.append(TransitionOption(id: "revolution", title: "爆发民主革命", subtitle: "推翻君主制建立多党议会共和国，取消封建封地", targetStyle: "parliamentary", dramatic: true))
            out.append(TransitionOption(id: "socialistRev", title: "爆发社会革命", subtitle: "废除门阀特权，建立人民／社会主义政权", targetStyle: "socialist", dramatic: true))
        } else if prof.camp == .constitutional {
            out.append(TransitionOption(id: "snapElection", title: "解散议会提前大选", subtitle: "重洗议会席位，由胜出党派重新组阁", targetStyle: prof.id, dramatic: false))
            if prof.id != "dualMonarchy" {
                out.append(TransitionOption(id: "dualMonarchy", title: "强化皇权二元立宪", subtitle: "由虚君转向二元立宪，君相并重 · 攻+7%", targetStyle: "dualMonarchy", dramatic: false))
            } else {
                out.append(TransitionOption(id: "constitutional", title: "过渡为完全议会立宪", subtitle: "君主退居虚位，内阁完全对议会负责", targetStyle: "constitutional", dramatic: false))
            }
            out.append(TransitionOption(id: "directRule", title: "收回宪政恢复专制", subtitle: "解散议会，由君主直接乾纲独断", targetStyle: culture == "chinese" ? "dynasty" : "absolute", dramatic: true))
            out.append(TransitionOption(id: "revolution", title: "废除君主改立共和", subtitle: "彻底告别王室，改建议会共和国", targetStyle: "parliamentary", dramatic: true))
            out.append(TransitionOption(id: "militaryCoup", title: "发动军事政变", subtitle: "军方接管政权建立军政府", targetStyle: "junta", dramatic: true))
        } else if prof.camp == .republic {
            out.append(TransitionOption(id: "snapElection", title: "提前举行全国大选", subtitle: "重选总统／议会多数党，刷新执政纲领", targetStyle: prof.id, dramatic: false))
            if prof.id != "semiPresidential" {
                out.append(TransitionOption(id: "semiPresidential", title: "修宪改行半总统制", subtitle: "民选总统掌外交国防、总理治内政", targetStyle: "semiPresidential", dramatic: false))
            }
            if prof.id != "technocracy" {
                out.append(TransitionOption(id: "technocracy", title: "设立专家官僚执政府", subtitle: "学者与技术官僚治国 · 岁入 +14% · 腐化 −10", targetStyle: "technocracy", dramatic: false))
            }
            if prof.id != "directorate" {
                out.append(TransitionOption(id: "directorate", title: "改组多头督政府", subtitle: "多位执政官合议施政、兼顾军政效率", targetStyle: "directorate", dramatic: false))
            }
            out.append(TransitionOption(id: "authoritarian", title: "强人集权独裁", subtitle: "宣布紧急状态解散议会 · 进攻 +10%", targetStyle: "dictatorship", dramatic: true))
            out.append(TransitionOption(id: "militaryCoup", title: "发动军事政变", subtitle: "统帅率军推翻文官政府，改建军政府", targetStyle: "junta", dramatic: true))
            out.append(TransitionOption(id: "socialistRev", title: "左翼社会革命", subtitle: "转向社会主义统筹动员体制", targetStyle: "socialist", dramatic: true))
            out.append(TransitionOption(id: "restoration", title: "强人称帝／王政复辟", subtitle: "波拿巴式称帝或拥立旧王室复辟", targetStyle: culture == "chinese" ? "dynasty" : "empire", dramatic: true))
        } else if prof.camp == .authoritarian {
            out.append(TransitionOption(id: "civilian", title: "制宪还政于民", subtitle: "结束军管／独裁，召开国会恢复共和", targetStyle: "presidential", dramatic: false))
            out.append(TransitionOption(id: "restoration", title: "黄袍加身称帝", subtitle: "大帅受百官劝进，建号称帝开创王朝", targetStyle: culture == "chinese" ? "dynasty" : "empire", dramatic: true))
            out.append(TransitionOption(id: "revolution", title: "民众起义推翻军政", subtitle: "民众与民主派联合推翻威权政府", targetStyle: "democratic", dramatic: true))
        } else if prof.camp == .socialist {
            out.append(TransitionOption(id: "revolution", title: "宪政转型多党共和", subtitle: "开放多党选举与市场经济", targetStyle: "democratic", dramatic: true))
            out.append(TransitionOption(id: "militaryCoup", title: "军方夺权军管", subtitle: "军队接管委员会改建军政府", targetStyle: "junta", dramatic: true))
            out.append(TransitionOption(id: "restoration", title: "复辟君主国体", subtitle: "保守势力反攻恢复旧王朝", targetStyle: culture == "chinese" ? "dynasty" : "constitutional", dramatic: true))
        } else {
            // 神权 / 部落
            out.append(TransitionOption(id: "directRule", title: "世俗化改建王朝", subtitle: "整合部族／教廷为集权王国或王朝", targetStyle: culture == "chinese" ? "dynasty" : "absolute", dramatic: true))
            out.append(TransitionOption(id: "revolution", title: "现代共和改制", subtitle: "跨越旧制，直接改建共和国", targetStyle: "democratic", dramatic: true))
            out.append(TransitionOption(id: "militaryCoup", title: "军阀强人掌权", subtitle: "由强力将领以军政府统治国家", targetStyle: "junta", dramatic: true))
        }
        return out
    }

    // MARK: - 月度预索引缓存（大幅提速 Regimes.day 模拟性能）

    final class MonthIndex {
        let world: ObjectIdentifier
        let key: Int
        var provincesByNation = [String: [JS]]()
        var lostByNation = [String: Int]()
        var stockByPid = [String: JS]()
        var armiesByNation = [String: [JS]]()
        var atWar = Set<String>()
        var familiesByNation = [String: [String]]()
        var ownerByPid = [String: String]()

        init(_ r: JS, key: Int) {
            self.world = ObjectIdentifier(r)
            self.key = key
            for p in r.world.provinces.asArray {
                let pid = p.id.asString
                let ctrl = p.controller.optionalString ?? ""
                ownerByPid[pid] = ctrl
                if !ctrl.isEmpty { provincesByNation[ctrl, default: []].append(p) }
                let legal = p.legalOwner.optionalString ?? ctrl
                if !legal.isEmpty && legal != ctrl { lostByNation[legal, default: 0] += 1 }
            }
            for s in r.world.statecraft.provinces.asArray {
                stockByPid[s.provinceId.asString] = s
            }
            for a in r.world.armies.asArray where a.troops.asNumber > 0 && a.status.asString != "destroyed" {
                if let nid = a.nationId.optionalString { armiesByNation[nid, default: []].append(a) }
            }
            for rel in r.world.statecraft.relations.asArray where rel.status.asString == "war" {
                if let a = rel.a.optionalString { atWar.insert(a) }
                if let b = rel.b.optionalString { atWar.insert(b) }
            }
            if !r.nobility.isNull, !r.nobility.families.isNull {
                for (k, fam) in r.nobility.families.objectEntries {
                    if let nid = fam.nationId.optionalString, r.kin.families.has(k) {
                        familiesByNation[nid, default: []].append(k)
                    }
                }
            }
        }
    }

    static var currentMonthIndex: MonthIndex?

    static func beginMonthIndex(_ r: JS, key: Int) {
        currentMonthIndex = MonthIndex(r, key: key)
    }

    static func endMonthIndex() {
        currentMonthIndex = nil
    }

    static func monthLand(_ r: JS, _ id: String) -> [JS] {
        if let idx = currentMonthIndex, idx.world == ObjectIdentifier(r) {
            return idx.provincesByNation[id] ?? []
        }
        return r.world.provinces.asArray.filter { $0.controller.optionalString == id }
    }

    static func monthLandCount(_ r: JS, _ id: String) -> Int {
        monthLand(r, id).count
    }

    static func monthLostCount(_ r: JS, _ id: String) -> Int {
        if let idx = currentMonthIndex, idx.world == ObjectIdentifier(r) {
            return idx.lostByNation[id] ?? 0
        }
        return r.world.provinces.asArray.reduce(0) { acc, p in
            let ctrl = p.controller.optionalString ?? ""
            let legal = p.legalOwner.optionalString ?? ctrl
            return acc + (legal == id && ctrl != id ? 1 : 0)
        }
    }

    static func isAtWar(_ r: JS, _ id: String) -> Bool {
        if let idx = currentMonthIndex, idx.world == ObjectIdentifier(r) {
            return idx.atWar.contains(id)
        }
        return r.world.statecraft.relations.asArray.contains {
            $0.status.asString == "war" && ($0.a.asString == id || $0.b.asString == id)
        }
    }

    static func monthArmies(_ r: JS, _ id: String) -> [JS] {
        if let idx = currentMonthIndex, idx.world == ObjectIdentifier(r) {
            return idx.armiesByNation[id] ?? []
        }
        return r.world.armies.asArray.filter { $0.nationId.asString == id && $0.troops.asNumber > 0 && $0.status.asString != "destroyed" }
    }

    static func monthStock(_ r: JS, _ pid: String) -> JS? {
        if let idx = currentMonthIndex, idx.world == ObjectIdentifier(r) {
            return idx.stockByPid[pid]
        }
        return r.world.statecraft.provinces.asArray.first { $0.provinceId.asString == pid }
    }
}

// MARK: - 玩家主动发起政体更迭／政变接口（NativeEngine）

extension NativeEngine {
    /// 玩家在国家页「朝政」发起现实感政体演变、政变、立宪、摄政或提前大选。
    public func regimeTransition(_ index: Int, action: String) -> (ok: Bool, reason: String) {
        let r = run, nations = r.world.nations.asArray
        guard nations.indices.contains(index) else { return (false, "国家不存在。") }
        let n = nations[index], id = n.id.asString
        guard Vassals.alive(r, id) else { return (false, "该国已亡，无法改制。") }
        Regimes.enable(r)
        let culture = r.civilization.nations[id].cultureId.optionalString ?? ""
        let sid = Offices.stateId(r, id)

        switch action {
        case "constitutional":
            let res = Regimes.executeTransition(r, id: id, toStyle: "constitutional", kind: "reform", actorName: nil, detail: "朝廷颁行宪法、开设议会并组阁，和平步入虚君立宪体制。")
            afterGlobalOrder()
            return res

        case "dualMonarchy":
            let res = Regimes.executeTransition(r, id: id, toStyle: "dualMonarchy", kind: "reform", actorName: nil, detail: "颁布帝国宪法设立议会与内阁宰相，同时保留皇室军政实权，步入二元君主立宪制。")
            afterGlobalOrder()
            return res

        case "semiPresidential":
            let res = Regimes.executeTransition(r, id: id, toStyle: "semiPresidential", kind: "reform", actorName: nil, detail: "修宪确立民选总统与议会总理双轨分权体制，兼顾国防决断与议会问责。")
            afterGlobalOrder()
            return res

        case "technocracy":
            let res = Regimes.executeTransition(r, id: id, toStyle: "technocracy", kind: "reform", actorName: nil, detail: "解散党争僵局，由顶尖学者与技术官僚接掌国务行政，整饬财税与法度。")
            afterGlobalOrder()
            return res

        case "directorate":
            let res = Regimes.executeTransition(r, id: id, toStyle: "directorate", kind: "reform", actorName: nil, detail: "改组执政委员会为五人督政府，合议分权并维持多党立法议会。")
            afterGlobalOrder()
            return res

        case "militaryCoup":
            let marshal = Offices.holder(r, id, "Marshal", sid) ?? Regimes.claimant(r, id, .otherHouse)
            let genName = marshal.map { Self.displayPersonName($0) }
            let res = Regimes.executeTransition(r, id: id, toStyle: "junta", kind: "coup", actorName: genName, appointPerson: marshal, detail: "\(genName ?? "军中强人")率部发动军事政变，接管中枢并实行全国军管。")
            afterGlobalOrder()
            return res

        case "regency":
            let isJP = culture == "japanese"
            let chan = Offices.holder(r, id, isJP ? "Marshal" : "Chancellor", sid)
            let name = chan.map { Self.displayPersonName($0) }
            let res = Regimes.executeTransition(r, id: id, toStyle: isJP ? "shogunate" : "regency", kind: "regency", actorName: name, detail: isJP ? "武家大将开府建幕、总揽天下兵政，天皇垂拱虚位。" : "权臣总摄国政，代君主执掌军政大权。")
            afterGlobalOrder()
            return res

        case "directRule":
            let target = culture == "chinese" ? "dynasty" : "absolute"
            let res = Regimes.executeTransition(r, id: id, toStyle: target, kind: "restoration", actorName: nil, detail: "君主收回军政大权、总揽朝纲，恢复亲政体制。")
            afterGlobalOrder()
            return res

        case "revolution":
            let res = Regimes.executeTransition(r, id: id, toStyle: "parliamentary", kind: "revolution", actorName: nil, detail: "革命风暴席卷京师，推翻旧制并召开制宪国会，建立议会共和国。")
            afterGlobalOrder()
            return res

        case "socialistRev":
            let res = Regimes.executeTransition(r, id: id, toStyle: "socialist", kind: "revolution", actorName: nil, detail: "社会革命爆发，没收封建领地与旧贵族特权，改立社会主义统筹体制。")
            afterGlobalOrder()
            return res

        case "authoritarian":
            let res = Regimes.executeTransition(r, id: id, toStyle: "dictatorship", kind: "coup", actorName: nil, detail: "强人宣布全国紧急状态、解散议会，实行铁腕独裁统治。")
            afterGlobalOrder()
            return res

        case "restoration":
            let target: String = {
                if culture == "chinese" { return "dynasty" }
                if culture == "slavic" { return "tsardom" }
                if ["arab", "turkic"].contains(culture) { return "sultanate" }
                return "empire"
            }()
            let res = Regimes.executeTransition(r, id: id, toStyle: target, kind: "restoration", actorName: nil, detail: "强人加冕称帝／旧王室顺势复辟，废除共和并重建君主国体。")
            afterGlobalOrder()
            return res

        case "civilian":
            let res = Regimes.executeTransition(r, id: id, toStyle: "presidential", kind: "civilian", actorName: nil, detail: "军政当局交出政权、颁行宪法并举行大选，国家重归文官共和。")
            afterGlobalOrder()
            return res

        case "snapElection":
            let b = Regimes.book(r, id)
            let st = Regimes.style(r, id)
            guard st.parties && st.single == nil else { return (false, "该国当前体制不设多党议会选举。") }
            if b.parties.isNull { b.parties = Regimes.parties(r, id, st, seed: max(1, r.regimes.month.asInt)) }
            let parties = b.parties.asArray
            guard parties.count >= 2 else { return (false, "该国当前体制不设多党议会选举。") }
            let seed = "\(r.world.custom.seed.asString)|snap|\(id)|\(r.clock.tick.asInt)"
            var weights = [Double]()
            for (i, _) in parties.enumerated() {
                weights.append(Double(Opening.hash("\(seed)|\(i)") % 80) + 12.0)
            }
            let sum = max(1, weights.reduce(0, +))
            var rem = 100
            for i in parties.indices {
                let s = i == parties.count - 1 ? rem : max(5, Int((weights[i] / sum * 100).rounded()))
                let actual = min(rem, s)
                parties[i].seats = JS(actual)
                rem -= actual
            }
            b.parties = .array(parties)
            let winner = parties.max { $0.seats.asInt < $1.seats.asInt }?.name.asString ?? "新内阁"
            if Regimes.seats(r, id).elected { _ = Regimes.seat(r, id) }
            Regimes.ensurePremier(r, id)
            let text = "\(n.name.asString)提前举行大选，\(winner)胜出组阁"
            _ = People.announce(r, kind: "politics", text: text, reason: "议会解散重选，\(winner)成为最大党并主导新一届内阁施政。", nations: [id], province: nil)
            afterGlobalOrder()
            return (true, text)

        default:
            return (false, "未知政体演变指令：\(action)。")
        }
    }

    /// 议会党派主动操控：扶持该党（boost）、任命组阁（appoint）、查禁该党（ban）、扶立新党（found）。
    public func partyAction(_ index: Int, partyIndex: Int, action: String) -> (ok: Bool, reason: String) {
        let r = run, nations = r.world.nations.asArray
        guard nations.indices.contains(index) else { return (false, "国家不存在。") }
        let n = nations[index], id = n.id.asString
        guard Vassals.alive(r, id) else { return (false, "该国已亡。") }
        Regimes.enable(r)
        let st = Regimes.style(r, id), b = Regimes.book(r, id)
        guard st.parties else { return (false, "当前政体未开设议会党派，请先推行立宪或改立共和。") }
        if b.parties.isNull { b.parties = Regimes.parties(r, id, st, seed: max(1, r.regimes.month.asInt)) }
        var list = b.parties.asArray
        let stateName = n.name.asString

        switch action {
        case "found":
            guard st.single == nil else { return (false, "一党执政体制下无法新增合法政党。") }
            guard list.count < 8 else { return (false, "议会党派已达上限（8 党）。") }
            let existing = Set(list.map { $0.name.asString })
            let pool = Regimes.partyPool(r, id).filter { !existing.contains($0) } + Regimes.genericParties.filter { !existing.contains($0) }
            guard let fresh = pool.first else { return (false, "暂无可新建的党派名称。") }
            let grant = 12
            if let topIdx = list.indices.max(by: { list[$0].seats.asInt < list[$1].seats.asInt }) {
                let take = min(grant, max(0, list[topIdx].seats.asInt - 5))
                list[topIdx].seats = JS(list[topIdx].seats.asInt - take)
                let p = JS.object(); p.name = JS(fresh); p.seats = JS(max(1, take))
                list.append(p)
                b.parties = .array(list)
                let line = Regimes.platform(fresh)
                let text = "\(stateName)新设政党「\(fresh)」进入议会"
                _ = People.announce(r, kind: "politics", text: text, reason: "新党持「\(line.name)」纲领（\(line.text)），初获 \(max(1, take)) 席。", nations: [id], province: nil)
                return (true, text)
            }
            return (false, "议会席位不足。")

        case "boost":
            guard list.indices.contains(partyIndex), list.count >= 2 else { return (false, "所选党派无效。") }
            var gained = 0
            for i in list.indices where i != partyIndex && gained < 12 {
                let cur = list[i].seats.asInt
                let take = min(12 - gained, max(0, cur - 2))
                if take > 0 { list[i].seats = JS(cur - take); gained += take }
            }
            guard gained > 0 else { return (false, "该党已几乎独占全部议席。") }
            list[partyIndex].seats = JS(list[partyIndex].seats.asInt + gained)
            b.parties = .array(list)
            let pName = list[partyIndex].name.asString
            return (true, "已扶持\(pName)增席 +\(gained)（现占 \(list[partyIndex].seats.asInt) 席）。")

        case "appoint":
            guard list.indices.contains(partyIndex) else { return (false, "所选党派无效。") }
            let pName = list[partyIndex].name.asString
            let topSeats = list.map { $0.seats.asInt }.max() ?? 0
            let cur = list[partyIndex].seats.asInt
            if cur <= topSeats {
                let need = min(35, topSeats - cur + 4)
                var pulled = 0
                for i in list.indices where i != partyIndex && pulled < need {
                    let s = list[i].seats.asInt
                    let take = min(need - pulled, max(0, s - 2))
                    if take > 0 { list[i].seats = JS(s - take); pulled += take }
                }
                list[partyIndex].seats = JS(cur + pulled)
                b.parties = .array(list)
            }
            Regimes.ensurePremier(r, id)
            let line = Regimes.platform(pName)
            let text = "\(stateName)任命\(pName)组阁执政"
            _ = People.announce(r, kind: "politics", text: text, reason: "新内阁推行「\(line.name)」路线：\(line.text)。", nations: [id], province: nil)
            return (true, text)

        case "ban":
            guard st.single == nil else { return (false, "执政一党无法查禁。") }
            guard list.indices.contains(partyIndex), list.count >= 2 else { return (false, "议会至少需保留 1 个政党。") }
            let banned = list[partyIndex].name.asString
            let freed = list[partyIndex].seats.asInt
            list.remove(at: partyIndex)
            if let topIdx = list.indices.max(by: { list[$0].seats.asInt < list[$1].seats.asInt }) {
                list[topIdx].seats = JS(list[topIdx].seats.asInt + freed)
            }
            b.parties = .array(list)
            let d = r.destiny.nations[id]
            if !d.isNull { d.destiny = JS(max(0, (d.destiny.optionalNumber ?? 50) - 3)) }
            let text = "\(stateName)下令查禁\(banned)"
            _ = People.announce(r, kind: "politics", text: text, reason: "反对党\(banned)遭取缔，其 \(freed) 席并入最大党；国运 −3。", nations: [id], province: nil)
            return (true, text)

        default:
            return (false, "未知党派指令：\(action)。")
        }
    }
}
