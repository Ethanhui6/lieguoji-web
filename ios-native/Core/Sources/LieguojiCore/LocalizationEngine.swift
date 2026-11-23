import Foundation

/// 全量「文化 × 政体 × 时代」动态词库引擎（严禁硬编码中国帝制词汇）。
/// 国家切换政体、或跨不同文明圈时，元首／副首称谓、权力天平四方派系、议案措辞、
/// 行政区划单位（省／道／藩·都道府／州／行省／部·旗）、地方长官与军事编制全界面瞬间同步刷新。
public enum LocalizationEngine {
    public struct Lexicon: Sendable, Equatable {
        /// 行政区划单字／简称（如：省、道、藩、都道府、州、行省、部、旗、邦、城邦）
        public let adminUnit: String
        /// 行政区划复数／统称（如：各省、各道、各藩、各州、各行省、各部）
        public let adminPlural: String
        /// 地方长官称谓（如：巡抚/省长、观察使/道知事、大名/知事、州长、行省总督、万户长/酋长）
        public let governorTitle: String
        /// 国家元首通用称谓（兜底）
        public let leaderTitle: String
        /// 政府首脑／副首称谓（如：丞相、总理、首相、议长、大维齐尔、枢机国务卿、大断事官）
        public let deputyTitle: String
        /// 国家页第二标签标题（如：朝政、议政、国政、军政、教政、部政）
        public let courtTabTitle: String
        /// 中枢核心区标题（如：朝堂、执政内阁、联邦政府、最高军委、教廷枢机、汗庭）
        public let courtSectionTitle: String
        /// 权力天平标题（如：朝堂四方权力天平、执政力量与议会天平、立宪内阁与王室天平）
        public let powerBalanceTitle: String
        /// 四方权力柱简称（顺序对应 crown / houses / military / council）
        public let pillarShort: [String]
        /// 四方权力柱全称（顺序对应 crown / houses / military / council）
        public let pillarFull: [String]
        /// 四方权力柱主导时的现实效果说明（顺序对应 crown / houses / military / council）
        public let pillarEffects: [String]
        /// 当期议案标签（如：朝议博弈、议会法案、内阁动议、最高军令、圣座教议、忽里台议事）
        public let agendaTag: String
        /// 议案强推按钮名（如：御批强推、签署紧急行政令、内阁强推法案、军令贯彻、颁行圣谕、大汗决断）
        public let forceActionLabel: String
        /// 议案折中按钮名（如：折中调和、两党妥协修正案、枢机调停、诸部协商）
        public let compromiseActionLabel: String
        /// 政令前缀（如：御批、行政、法案、军令、教令、汗令）
        public let decreePrefix: String
        /// 政令颁行按钮文字（如：颁诏施行、签署生效、颁令执行、圣座颁行、传令诸部）
        public let enactVerb: String
        /// 权贵／家族／财团区标题（共和政体绝不出现「朝堂世家」或「宗室赐封」）
        public let housesSectionTitle: String
        /// 权贵单位词（如：门阀世家、政商名门、财团党阀、教区望族、草原诸部）
        public let houseUnitLabel: String
        /// 百官／内阁／部委区标题（共和政体绝不出现「朝廷百官」）
        public let officialsSectionTitle: String
        /// 换届／禅位操作名（如：禅位择君、换届改选、推举新帅、枢机择圣、忽里台推汗）
        public let successionAction: String
        /// 封地制度徽章文案（共和绝不出现「宗室赐封」）
        public let fiefRuleLabel: String
        /// 史册抬头称谓（如：本纪、国史、执政纪要、教廷编年、汗庭秘史）
        public let chronicleLabel: String
        /// 陆军编制单位统称（如：军团、常备师、武士团、禁军、八旗、骑士团）
        public let militaryFormationTitle: String
        /// 是否属于共和／现代无封建体制（用于界面严格隔离封建词汇）
        public let isRepublican: Bool
    }

    /// 归一化政体阵营（同时兼容 `styleId` 如 `democratic` / `federal` / `shogunate` 与底层 `polity` 如 `Republic` / `Monarchy`）。
    public static func camp(polity: String?, style: String?) -> Regimes.PolityCamp {
        let s = (style ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if !s.isEmpty, let prof = Regimes.styleProfiles[s] { return prof.camp }
        let p = (polity ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        switch p {
        case "republic", "democratic", "parliamentary", "presidential", "federal", "merchant", "oligarchic", "citystate", "confederation", "semiPresidential".lowercased(), "technocracy", "directorate":
            return .republic
        case "constitutional", "constitutionalmonarchy", "union", "dualmonarchy":
            return .constitutional
        case "socialist", "communist", "council":
            return .socialist
        case "junta", "dictatorship", "authoritarian", "fascist", "nazi", "warlord", "military":
            return .authoritarian
        case "theocracy", "papacy", "caliphate", "order", "lamaism", "holy":
            return .theocracy
        case "tribal", "khanate", "chiefdom", "nomad", "peasant":
            return .tribal
        default:
            return .monarchy
        }
    }

    /// 核心映射函数：`LocalizationEngine.lexicon(culture:polity:style:)`
    public static func lexicon(culture: String?, polity: String?, style: String? = nil) -> Lexicon {
        let cult = (culture ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let st = (style ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let c = camp(polity: polity, style: style)

        // 1. 严格按「文化 × 政体」决定行政区划与地方长官，切换政体时即时同步更名
        let (adminUnit, governorTitle): (String, String) = {
            if st == "citystate" { return ("城邦", "执政官") }
            if st == "confederation" { return ("邦", "邦长") }
            if c == .tribal || st == "khanate" || st == "tribal" || cult == "mongol" {
                if cult == "mongol" { return (c == .republic || c == .socialist ? "省" : "旗", c == .republic || c == .socialist ? "省长" : "札萨克") }
                return ("部", "部族长")
            }
            switch cult {
            case "chinese":
                switch c {
                case .republic, .socialist: return ("省", "省长")
                case .constitutional: return ("省", "省督")
                case .authoritarian: return ("省", "督军")
                default: return ("省", "巡抚")
                }
            case "korean":
                switch c {
                case .republic, .socialist, .constitutional: return ("道", "道知事")
                default: return ("道", "观察使")
                }
            case "japanese":
                if st == "shogunate" || (c == .monarchy && st != "constitutional") {
                    return ("藩", "藩主")
                } else {
                    return ("府县", "知事")
                }
            case "vietnamese":
                return (c == .republic || c == .socialist ? "省" : "镇", c == .republic || c == .socialist ? "省长" : "镇守")
            case "tibetan":
                return ("宗", c == .theocracy ? "宗本" : "长官")
            case "english", "french", "german", "spanish", "italian", "portuguese", "dutch", "hungarian", "western":
                if st == "federal" || c == .republic { return ("州", "州长") }
                if st == "feudal" || st == "principality" { return ("领", "领主") }
                if c == .constitutional { return ("郡", "郡守") }
                return ("行省", "总督")
            case "roman", "greek", "byzantine", "classical":
                return ("行省", c == .republic ? "行省执政官" : "行省总督")
            case "slavic", "russian", "polish":
                return (c == .socialist ? "加盟区" : "州", c == .republic || c == .socialist ? "州长" : "总督")
            case "arab", "persian", "turkic", "egyptian", "islamic":
                return (c == .republic ? "省" : "行省", c == .republic ? "省长" : "瓦利总督")
            case "norse", "viking", "nordic":
                return (c == .monarchy || c == .tribal ? "领地" : "郡", c == .monarchy || c == .tribal ? "雅尔" : "郡长")
            case "indian", "hindu":
                return (c == .republic || c == .constitutional ? "邦" : "行省", c == .republic || c == .constitutional ? "邦首席部长" : "总督")
            case "aztec", "inca", "maya", "mesoamerican":
                return ("大区", "总督")
            default:
                return (c == .republic || c == .socialist ? "州" : "省", c == .republic || c == .socialist ? "州长" : "总督")
            }
        }()

        let adminPlural = "各" + adminUnit

        // 2. 军事编制称号（随文化 × 政体联动）
        let militaryFormationTitle: String = {
            switch c {
            case .republic:
                if cult == "roman" || cult == "greek" { return "共和军团" }
                return "国民陆军师"
            case .socialist:
                return "人民近卫师"
            case .authoritarian:
                return "战区主力军"
            case .theocracy:
                return cult == "arab" || cult == "turkic" ? "圣战军团" : "修会骑士团"
            case .tribal:
                return cult == "mongol" ? "八旗铁骑" : "部族勇士团"
            case .constitutional:
                return cult == "japanese" ? "镇台师团" : "皇家陆军师"
            case .monarchy:
                switch cult {
                case "japanese": return "武士团"
                case "mongol": return "怯薛军"
                case "roman", "greek", "byzantine": return "帝国军团"
                case "english", "french", "german", "spanish", "italian", "portuguese", "dutch", "hungarian": return "王家骑士军"
                case "norse", "viking": return "维京战帮"
                case "chinese", "korean", "vietnamese": return "常备禁军"
                default: return "主力军团"
                }
            }
        }()

        // 3. 按七大政体阵营输出完整零串味政治词库
        switch c {
        case .republic:
            let isMerchant = st == "merchant" || st == "oligarchic"
            let isDirectorate = st == "directorate"
            let leader = isMerchant ? "总督" : (isDirectorate ? "首席执政官" : "总统")
            let deputy = (st == "parliamentary" || st == "semiPresidential".lowercased()) ? "总理" : "议长"
            return Lexicon(
                adminUnit: adminUnit,
                adminPlural: adminPlural,
                governorTitle: governorTitle,
                leaderTitle: leader,
                deputyTitle: deputy,
                courtTabTitle: "议政",
                courtSectionTitle: isMerchant ? "商业元老院" : "联邦行政与议会",
                powerBalanceTitle: isMerchant ? "商会与议会权力天平" : "执政力量与议会天平",
                pillarShort: ["执政党", isMerchant ? "大商会" : "在野党", "国防军", isMerchant ? "财团行会" : "国会/工会"],
                pillarFull: ["执政内阁", isMerchant ? "商业寡头" : "在野反对派", "联邦国防军", isMerchant ? "工商财团" : "国会与工会"],
                pillarEffects: [
                    "执政党稳健多数 · 法案通行高效、财政岁入 +6%，行政执行力强",
                    isMerchant ? "大商会主导国策 · 贸易税收丰厚，但贫富分化易生民怨" : "在野势力强力制衡 · 贪腐受抑，但重大法案需跨党妥协",
                    "军方影响力上升 · 国防备战充裕、军力昂扬，需防兵变干政",
                    "国会与工会主导 · 民生稳健、对外审慎，战时紧急动员偏缓",
                ],
                agendaTag: "议会法案",
                forceActionLabel: "签署紧急行政令",
                compromiseActionLabel: "跨党修正案表决",
                decreePrefix: "行政",
                enactVerb: "签署生效",
                housesSectionTitle: isMerchant ? "商业望族与财团" : "政商名门与财团",
                houseUnitLabel: isMerchant ? "商族财团" : "政商名门",
                officialsSectionTitle: "内阁部委与阁员",
                successionAction: "提前改选元首",
                fiefRuleLabel: "选区自治 · 无封地",
                chronicleLabel: "国史档案",
                militaryFormationTitle: militaryFormationTitle,
                isRepublican: true
            )

        case .constitutional:
            return Lexicon(
                adminUnit: adminUnit,
                adminPlural: adminPlural,
                governorTitle: governorTitle,
                leaderTitle: cult == "japanese" ? "天皇" : "国王",
                deputyTitle: "首相",
                courtTabTitle: "国政",
                courtSectionTitle: "立宪内阁与国会",
                powerBalanceTitle: "内阁、王室与国会天平",
                pillarShort: ["内阁", "王室贵族", "皇家军方", "国会下院"],
                pillarFull: ["首相内阁", "王室与上院贵族", "皇家海陆军", "民选国会下院"],
                pillarEffects: [
                    "责任内阁稳固 · 宪政清明、财政岁入 +6%，国政高效运转",
                    "王室与保守上院占优 · 传统稳固、军心归附，改革步伐偏缓",
                    "军部势力抬头 · 攻守战力凌厉，易推动强硬外交与扩军",
                    "民选下院主导 · 财政透明、民生安定，对外用兵更为克制",
                ],
                agendaTag: "国会动议",
                forceActionLabel: "内阁强推法案",
                compromiseActionLabel: "两院折中表决",
                decreePrefix: "内阁",
                enactVerb: "御准颁行",
                housesSectionTitle: "贵族名门与勋爵",
                houseUnitLabel: "贵族勋门",
                officialsSectionTitle: "内阁大臣与国务卿",
                successionAction: "改组内阁／传位",
                fiefRuleLabel: "立宪贵族制",
                chronicleLabel: "国史编年",
                militaryFormationTitle: militaryFormationTitle,
                isRepublican: false
            )

        case .socialist:
            return Lexicon(
                adminUnit: adminUnit,
                adminPlural: adminPlural,
                governorTitle: "\(adminUnit)委书记",
                leaderTitle: "主席",
                deputyTitle: "总理",
                courtTabTitle: "国务",
                courtSectionTitle: "中央委员会与国务",
                powerBalanceTitle: "中央、工会与武装力量天平",
                pillarShort: ["中央", "地方党委", "人民军", "工会/议会"],
                pillarFull: ["中央委员会", "地方工作委员会", "人民武装力量", "全国工会与代表大会"],
                pillarEffects: [
                    "中央统筹有力 · 计划调度高效、腐化受抑，全国动员迅速",
                    "地方党委权重上升 · 基层产能稳步增长，中央直辖财权略减",
                    "武装力量主导 · 战备充沛、守土顽强，军费占比升高",
                    "工会与代表大会活跃 · 民生福利改善、民心稳固",
                ],
                agendaTag: "全会决议",
                forceActionLabel: "中央决断贯彻",
                compromiseActionLabel: "代表大会协商",
                decreePrefix: "国务",
                enactVerb: "决议施行",
                housesSectionTitle: "地方派系与工农团体",
                houseUnitLabel: "社会团体",
                officialsSectionTitle: "国务部委委员",
                successionAction: "全会改选领袖",
                fiefRuleLabel: "公有统筹 · 无封地",
                chronicleLabel: "革命史册",
                militaryFormationTitle: militaryFormationTitle,
                isRepublican: true
            )

        case .authoritarian:
            return Lexicon(
                adminUnit: adminUnit,
                adminPlural: adminPlural,
                governorTitle: st == "junta" || st == "warlord" ? "军管司令" : "\(adminUnit)长官",
                leaderTitle: st == "junta" ? "最高执政官" : "元首",
                deputyTitle: "总参谋长",
                courtTabTitle: "军政",
                courtSectionTitle: "最高统帅部与执政团",
                powerBalanceTitle: "统帅部与执政力量天平",
                pillarShort: ["统帅部", "元老寡头", "武装军团", "行政官僚"],
                pillarFull: ["最高统帅部", "依附寡头与财阀", "一线武装军团", "国家行政官僚"],
                pillarEffects: [
                    "统帅部高度集权 · 战时令行禁止，但暗藏政变与民变隐患",
                    "寡头财阀坐大 · 短期筹款迅捷，却推高贪腐与底层怨气",
                    "一线将领拥兵自重 · 进攻极为凌厉，战败极易触发兵变",
                    "技术官僚维系运转 · 财政与后勤趋稳，压制前线冒进",
                ],
                agendaTag: "紧急军令",
                forceActionLabel: "最高军令强推",
                compromiseActionLabel: "执政团妥协调停",
                decreePrefix: "军政",
                enactVerb: "下令执行",
                housesSectionTitle: "军政派阀与寡头",
                houseUnitLabel: "军政派阀",
                officialsSectionTitle: "执政团与部委长官",
                successionAction: "更替最高统帅",
                fiefRuleLabel: "军管直辖 · 无封地",
                chronicleLabel: "军政纪要",
                militaryFormationTitle: militaryFormationTitle,
                isRepublican: true
            )

        case .theocracy:
            return Lexicon(
                adminUnit: adminUnit,
                adminPlural: adminPlural,
                governorTitle: "教区总督",
                leaderTitle: st == "caliphate" ? "哈里发" : (st == "lamaism" ? "法王" : "教宗"),
                deputyTitle: "首席枢机",
                courtTabTitle: "教政",
                courtSectionTitle: "圣座与枢机议事院",
                powerBalanceTitle: "圣座、修会与教军权力天平",
                pillarShort: ["圣座", "修会望族", "圣战军团", "教区僧侣"],
                pillarFull: ["至高圣座", "各大修会与望族", "圣战骑士团", "各地教区僧侣"],
                pillarEffects: [
                    "圣座威权独尊 · 教律严明、信众归心，异端难兴",
                    "修会望族势盛 · 什一税丰盈，但教权易遭瓜分",
                    "圣战军团主导 · 士气狂热、攻守兼备，对外圣战意愿高涨",
                    "基层教区占优 · 民间教化稳固、安定度提升",
                ],
                agendaTag: "枢机教议",
                forceActionLabel: "颁行至高圣谕",
                compromiseActionLabel: "枢机团折中决议",
                decreePrefix: "教令",
                enactVerb: "颁布圣谕",
                housesSectionTitle: "教区望族与修会",
                houseUnitLabel: "教区望族",
                officialsSectionTitle: "枢机大臣与教廷各部",
                successionAction: "枢机密选新圣座",
                fiefRuleLabel: "教区领地制",
                chronicleLabel: "教廷编年",
                militaryFormationTitle: militaryFormationTitle,
                isRepublican: false
            )

        case .tribal:
            return Lexicon(
                adminUnit: adminUnit,
                adminPlural: adminPlural,
                governorTitle: cult == "mongol" ? "万户长" : "部族长",
                leaderTitle: cult == "mongol" ? "大汗" : "大酋长",
                deputyTitle: cult == "mongol" ? "大断事官" : "大祭司",
                courtTabTitle: "部政",
                courtSectionTitle: cult == "mongol" ? "黄金汗庭" : "部族大帐",
                powerBalanceTitle: cult == "mongol" ? "汗庭与诸部权力天平" : "大帐与部族长老天平",
                pillarShort: ["汗庭", "各部首领", "铁骑战将", "长老议会"],
                pillarFull: [cult == "mongol" ? "大汗汗庭" : "大酋长直辖", "诸部那颜首领", "铁骑百战将领", "忽里台长老会"],
                pillarEffects: [
                    "汗权凝聚 · 诸部俯首听命，出征号令如一",
                    "诸部首领坐大 · 牧民拥兵，分封与掠夺需求迫切",
                    "百战铁骑主导 · 攻伐锐不可当，唯需以战养战",
                    "长老会维系祖法 · 部族团结安宁，对外用兵更为稳健",
                ],
                agendaTag: cult == "mongol" ? "忽里台议事" : "部族大会",
                forceActionLabel: cult == "mongol" ? "大汗金令决断" : "酋长威令决断",
                compromiseActionLabel: "诸部盟誓折中",
                decreePrefix: cult == "mongol" ? "汗令" : "部令",
                enactVerb: "传令诸部",
                housesSectionTitle: "部族首领与氏族",
                houseUnitLabel: "部族氏族",
                officialsSectionTitle: "汗庭重臣与万户",
                successionAction: cult == "mongol" ? "忽里台推举新汗" : "推举新大酋长",
                fiefRuleLabel: "部族公推领地",
                chronicleLabel: cult == "mongol" ? "汗庭秘史" : "部族史诗",
                militaryFormationTitle: militaryFormationTitle,
                isRepublican: false
            )

        case .monarchy:
            let isShogun = st == "shogunate"
            let isWestern = ["english", "french", "german", "spanish", "italian", "portuguese", "dutch", "hungarian", "western", "roman", "greek", "norse", "slavic", "russian", "polish"].contains(cult)
            return Lexicon(
                adminUnit: adminUnit,
                adminPlural: adminPlural,
                governorTitle: governorTitle,
                leaderTitle: isShogun ? "天皇" : (isWestern ? "国王" : "皇帝"),
                deputyTitle: isShogun ? "征夷大将军" : (isWestern ? "宰相" : "丞相"),
                courtTabTitle: isShogun ? "幕政" : "朝政",
                courtSectionTitle: isShogun ? "幕府评定众" : (isWestern ? "王廷枢密院" : "朝堂"),
                powerBalanceTitle: isShogun ? "幕府、公卿与大名天平" : (isWestern ? "王廷四方权力天平" : "朝堂四方权力天平"),
                pillarShort: [isShogun ? "幕府" : (isWestern ? "王室" : "中枢"), isShogun ? "大名" : (isWestern ? "贵族" : "世家"), isShogun ? "武士" : "军方", isShogun ? "奉行" : (isWestern ? "枢密" : "文官")],
                pillarFull: [isShogun ? "幕府将军" : (isWestern ? "王室中枢" : "君主中枢"), isShogun ? "诸藩大名" : (isWestern ? "封建贵族" : "门阀世家"), isShogun ? "武家战将" : "军功将领", isShogun ? "幕府奉行" : (isWestern ? "枢密文官" : "朝堂文官")],
                pillarEffects: [
                    "乾纲独断 · 政令通行、中枢岁入 +6%，豪强难起异心",
                    isShogun ? "大名藩镇坐大 · 地方守御坚固，但幕府号令易受掣肘" : "贵族世家专权 · 把持政柄与封地，强行削藩易激起兵变",
                    "将帅干政 · 全军攻势凌厉、好战高涨，战败易生兵变",
                    "文官清流主导 · 财政稳健、邦交审慎，战时动员偏缓",
                ],
                agendaTag: isShogun ? "幕府评定" : (isWestern ? "王廷议案" : "朝议博弈"),
                forceActionLabel: isShogun ? "将军朱印强推" : (isWestern ? "王诏强推" : "御批强推"),
                compromiseActionLabel: "折中调和方案",
                decreePrefix: isShogun ? "幕令" : (isWestern ? "王诏" : "御批"),
                enactVerb: isShogun ? "下达朱印" : "颁诏施行",
                housesSectionTitle: isShogun ? "诸藩大名与公卿" : (isWestern ? "贵族领主与王族" : "朝堂世家"),
                houseUnitLabel: isShogun ? "大名家" : (isWestern ? "贵族家族" : "门阀世家"),
                officialsSectionTitle: isShogun ? "幕府奉行众" : (isWestern ? "王廷大臣" : "朝廷百官"),
                successionAction: "禅位择君",
                fiefRuleLabel: isShogun ? "大名藩领" : (st == "feudal" ? "封建领主" : "宗室赐封"),
                chronicleLabel: "本纪",
                militaryFormationTitle: militaryFormationTitle,
                isRepublican: false
            )
        }
    }

    /// 军事编制职能分部称谓（按文化 × 政体动态切换，替代硬编码「禁军/野战主力」）。
    public static func branchLabel(branch: String, culture: String?, polity: String?, style: String? = nil) -> String {
        let cult = (culture ?? "").trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let c = camp(polity: polity, style: style)
        switch c {
        case .republic:
            switch branch {
            case "guard": return "国民警卫师"
            case "vanguard": return "快速突击旅"
            case "siege": return "重炮攻坚旅"
            case "garrison": return "联邦守备旅"
            default: return "主力步兵师"
            }
        case .socialist:
            switch branch {
            case "guard": return "近卫红军师"
            case "vanguard": return "突击纵队"
            case "siege": return "炮兵攻坚师"
            case "garrison": return "人民警备团"
            default: return "方面军主力"
            }
        case .authoritarian:
            switch branch {
            case "guard": return "亲卫突击旅"
            case "vanguard": return "闪击先锋军"
            case "siege": return "重炮攻城军"
            case "garrison": return "警备司令部"
            default: return "战区主力军"
            }
        case .theocracy:
            switch branch {
            case "guard": return "圣殿亲卫团"
            case "vanguard": return "圣战先锋团"
            case "siege": return "圣火攻城营"
            case "garrison": return "教区护卫队"
            default: return "修会主力军"
            }
        case .tribal:
            switch branch {
            case "guard": return cult == "mongol" ? "怯薛亲军" : "大帐亲卫"
            case "vanguard": return "奔袭轻骑"
            case "siege": return "回回攻城营"
            case "garrison": return "牧部护卫"
            default: return cult == "mongol" ? "八旗铁骑" : "部族战团"
            }
        case .constitutional, .monarchy:
            if cult == "japanese" {
                switch branch {
                case "guard": return "旗本近卫"
                case "vanguard": return "先阵武士团"
                case "siege": return "攻城铁炮队"
                case "garrison": return "城代守备队"
                default: return "本阵主力"
                }
            }
            if cult == "roman" || cult == "greek" || cult == "byzantine" {
                switch branch {
                case "guard": return "禁卫军团"
                case "vanguard": return "铁甲突击队"
                case "siege": return "攻城工兵团"
                case "garrison": return "行省驻防军"
                default: return "主力军团"
                }
            }
            if ["english", "french", "german", "spanish", "italian", "portuguese", "dutch", "hungarian", "western"].contains(cult) {
                switch branch {
                case "guard": return "皇家骑士团"
                case "vanguard": return "冲锋先锋团"
                case "siege": return "攻城重炮营"
                case "garrison": return "城堡卫戍团"
                default: return "王家野战军"
                }
            }
            switch branch {
            case "guard": return "天子禁军"
            case "vanguard": return "虎豹先锋"
            case "siege": return "攻城重营"
            case "garrison": return "边镇守备"
            default: return "野战主力"
            }
        }
    }
}
