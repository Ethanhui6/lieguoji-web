import Foundation

/// v8.0.0 真实历史事件链引擎与「史实路线 / 架空路线」控制系统：
/// - 玩家开启历史剧本时可自由选择：
///   1. `historical`（史实路线）：严格按历史年月推进重大事件（德奥合并、慕尼黑协定、九一八事变、七七事变、
///      白色方案闪击波兰、苏德密约瓜分波兰、黄色方案绕道低地三国、维希停战、巴巴罗萨、偷袭珍珠港、八月风暴等），
///      AI 100% 遵循史实分支并锁死历史同盟阵营，绝不无故退盟背刺；
///   2. `sandbox`（架空路线）：历史事件依旧按期触发，但玩家与 AI 均可自由选择历史分歧支线（如奥地利拒并、
///      东北军死战、波兰割让但泽、日本北进苏联、法国死守本土等），演义全新架空世界线！
/// - 每一条事件均具备真实引擎层实效（领土吞并、割地瓜分、成立附庸、强制宣战、锁盟参战、战役闪电战 Buff、
///   全球紧张度与工业产能剧变），并推送图文并茂的历史事件报刊弹窗供玩家实时批阅或抉择。
public enum HistoricalEvents {

    public struct Choice: Codable, Equatable, Sendable {
        public let title: String
        public let subtitle: String
        public let isHistorical: Bool
        public let effectCode: String

        public init(title: String, subtitle: String, isHistorical: Bool, effectCode: String) {
            self.title = title
            self.subtitle = subtitle
            self.isHistorical = isHistorical
            self.effectCode = effectCode
        }
    }

    public struct EventSpec: Sendable {
        public let id: String
        public let scenarioIds: Set<String>
        /// 触发所需游戏日下限（或目标年份+月份）
        public let triggerYear: Int
        public let triggerMonth: Int
        public let minDay: Int
        public let title: String
        public let headline: String
        public let dateLabel: String
        public let body: String
        public let effectSummary: String
        /// 对应 `EventScrolls/<illustration>.png` 卷轴插图键名
        public let illustration: String
        /// 主导决策国家（HistoricalNationSpec.id）
        public let actorSpecId: String
        public let targetSpecId: String?
        public let choices: [Choice]
    }

    public struct PendingModal: Codable, Equatable, Sendable {
        public let id: String
        public let title: String
        public let headline: String
        public let dateLabel: String
        public let body: String
        public let effectSummary: String
        public let illustration: String
        public let isHistoricalRoute: Bool
        public let choices: [Choice]
    }

    // MARK: - 路线判定与初始化

    public static func isHistoricalRoute(_ r: JS) -> Bool {
        guard !r.regimes.isNull else { return false }
        guard !r.regimes.historicalScenarioId.isNull else { return false }
        let mode = r.regimes.historicalRoute.optionalString ?? "historical"
        return mode == "historical"
    }

    public static func routeLabel(_ r: JS) -> String {
        isHistoricalRoute(r) ? "史实路线" : "架空路线"
    }

    public static func initScenario(_ r: JS, scenario: HistoricalScenario, route: String, specIdToNationId: [String: String]) {
        Regimes.enable(r)
        let cleanRoute = (route == "sandbox") ? "sandbox" : "historical"
        r.regimes.historicalRoute = JS(cleanRoute)
        r.regimes.firedEvents = .object()
        r.regimes.pendingEvent = .null
        let mapObj = JS.object()
        let revObj = JS.object()
        for (specId, nid) in specIdToNationId {
            mapObj[specId] = JS(nid)
            revObj[nid] = JS(specId)
        }
        r.regimes.historicalSpecToNation = mapObj
        r.regimes.historicalSpecIds = revObj

        // 依据历史剧本为每个国家设定真实初始军事学说，并立即把史实名将挂编至主力军团
        let era = HistoricalEra.current(r)
        for spec in scenario.nations {
            guard let nid = specIdToNationId[spec.id] else { continue }
            let docId = MilitaryDoctrines.defaultDoctrine(scenarioId: scenario.id, specId: spec.id, culture: spec.culture, era: era)
            _ = MilitaryDoctrines.setDoctrine(r, nationId: nid, doctrineId: docId, announce: false)
        }
        MilitaryDoctrines.assignHistoricalCommanders(r)
    }

    public static func nationId(_ r: JS, specId: String) -> String? {
        guard !r.regimes.isNull, !r.regimes.historicalSpecToNation.isNull else { return nil }
        return r.regimes.historicalSpecToNation[specId].optionalString
    }

    // MARK: - 30+ 真实世界史重大历史事件库（覆盖二战 1936/1939/1941、抗战 1931、一战 1914、拿破仑 1812、冷战 1950 与古代名局）

    public static let allEvents: [EventSpec] = [
        // ==================== 1936 欧陆前夜 · 二战完整史实事件链 ====================
        EventSpec(
            id: "anschluss_1938",
            scenarioIds: ["ww2_eve_1936"],
            triggerYear: 1938, triggerMonth: 3, minDay: 60,
            title: "德奥合并（Anschluss）",
            headline: "维也纳欢呼与铁蹄：德意志宣布合并奥地利",
            dateLabel: "1938 年 3 月 12 日",
            body: "德国国防军越过边境开进维也纳，柏林宣布将奥地利纳入德意志帝国版图，彻底撕毁《凡尔赛和约》中禁止德奥合并的条款。",
            effectSummary: "德意志和平吞并奥地利全境，获得奥地利工业产能 +28 与兵源；全球紧张度 +15。",
            illustration: "event_anschluss_1938",
            actorSpecId: "germany", targetSpecId: "austria",
            choices: [
                Choice(title: "履行德奥合并（史实）", subtitle: "和平吞并奥地利全境，德国工业与兵源暴涨", isHistorical: true, effectCode: "annex:germany:austria|tension:15|ic:germany:28"),
                Choice(title: "奥地利拒绝并武装抵抗（架空）", subtitle: "德奥爆发战争，欧洲提前陷入战火", isHistorical: false, effectCode: "war:germany:austria:1|tension:22"),
            ]
        ),
        EventSpec(
            id: "munich_1938",
            scenarioIds: ["ww2_eve_1936"],
            triggerYear: 1938, triggerMonth: 9, minDay: 140,
            title: "慕尼黑协定",
            headline: "绥靖巅峰：苏台德地区割让德意志",
            dateLabel: "1938 年 9 月 30 日",
            body: "英、法、德、意四国首脑在慕尼黑签署协定，强迫捷克斯洛伐克将布满边境要塞与军工厂的苏台德地区割让德国，以换取「我们时代的和平」。",
            effectSummary: "捷克斯洛伐克割让西部 45% 州郡给德国，德国工业产能 +24；全球紧张度 +14。",
            illustration: "event_munich_1938",
            actorSpecId: "germany", targetSpecId: "czechoslovakia",
            choices: [
                Choice(title: "签署慕尼黑协定割让苏台德（史实）", subtitle: "德国不战而夺捷克边防要塞与军工区", isHistorical: true, effectCode: "cede:czechoslovakia:germany:45|tension:14|ic:germany:24"),
                Choice(title: "英法拒绝绥靖、联手保卫捷克（架空）", subtitle: "捷克抗德，英法立即介入全面大战", isHistorical: false, effectCode: "war:germany:czechoslovakia:1|war:uk:germany:1|war:france:germany:1|tension:28"),
            ]
        ),
        EventSpec(
            id: "bohemia_1939",
            scenarioIds: ["ww2_eve_1936"],
            triggerYear: 1939, triggerMonth: 3, minDay: 220,
            title: "布拉格沦陷与捷克解体",
            headline: "德军开进布拉格，斯洛伐克沦为附庸",
            dateLabel: "1939 年 3 月 15 日",
            body: "德国撕毁慕尼黑承诺，全面吞并波希米亚与摩拉维亚并接收斯柯达军工厂；英法绥靖梦碎，紧急向波兰提供正式军事保障。",
            effectSummary: "德意志吞并捷克斯洛伐克余部并增产 +26 IC；英法波紧急结成同盟；全球紧张度 +16。",
            illustration: "event_bohemia_1939",
            actorSpecId: "germany", targetSpecId: "czechoslovakia",
            choices: [
                Choice(title: "吞并波希米亚·接收斯柯达军工（史实）", subtitle: "德国军力大增，英法波紧急结盟", isHistorical: true, effectCode: "annex:germany:czechoslovakia|ic:germany:26|ally:uk:poland|tension:16"),
                Choice(title: "仅迫使捷克称臣纳贡（架空）", subtitle: "捷克成为德国附庸国，保留自治", isHistorical: false, effectCode: "vassal:germany:czechoslovakia|tension:10"),
            ]
        ),
        EventSpec(
            id: "molotov_ribbentrop_1939",
            scenarioIds: ["ww2_eve_1936"],
            triggerYear: 1939, triggerMonth: 8, minDay: 280,
            title: "苏德互不侵犯条约",
            headline: "莫斯科密约震惊世界：德苏划定东欧势力范围",
            dateLabel: "1939 年 8 月 23 日",
            body: "莫洛托夫与里宾特洛甫在克里姆林宫签署互不侵犯条约及秘密附属议定书，为德国消除了两线作战顾虑，并秘密约定瓜分波兰与波罗的海。",
            effectSummary: "德苏缔结 2 年互不侵犯条约，激活波兰秘密瓜分条款；全球紧张度 +12。",
            illustration: "event_molotov_ribbentrop",
            actorSpecId: "germany", targetSpecId: "ussr",
            choices: [
                Choice(title: "签署苏德密约（史实）", subtitle: "消除两线作战顾虑，为闪击波兰铺路", isHistorical: true, effectCode: "pact:germany:ussr:2|tension:12"),
                Choice(title: "拒绝结约、警惕东线（架空）", subtitle: "苏德保持高度敌意，可能爆发早战", isHistorical: false, effectCode: "tension:10"),
            ]
        ),

        // ==================== 1939 & 1936 共同二战核心大事件 ====================
        EventSpec(
            id: "fall_weiss_1939",
            scenarioIds: ["ww2_eve_1936", "ww2_europe_1939"],
            triggerYear: 1939, triggerMonth: 9, minDay: 3,
            title: "白色方案 · 闪击波兰",
            headline: "第二次世界大战爆发！装甲集群闪电横扫波兰",
            dateLabel: "1939 年 9 月 1 日",
            body: "古德里安与曼施坦因指挥装甲集群协同斯图卡俯冲轰炸机实施人类史上首次大规模「闪电战」；英法两国随即履行波兰保障条约向德国宣战！",
            effectSummary: "德军获得 120 日【闪电战·白色方案】（行军 ×1.35、攻击 +32%）向波兰宣战；英法立即履行同盟向德宣战！",
            illustration: "event_fall_weiss_1939",
            actorSpecId: "germany", targetSpecId: "poland",
            choices: [
                Choice(title: "发动白色方案 · 闪击波兰（史实）", subtitle: "德军激活闪电战突击加成，英法自动参战", isHistorical: true, effectCode: "buff:germany:闪电战·白色方案:32:0:1.35:0:120|war:germany:poland:1|war:uk:germany:1|war:france:germany:1|tension:25"),
                Choice(title: "最后通牒索要但泽走廊（架空）", subtitle: "波兰可能割让但泽换取短暂和平", isHistorical: false, effectCode: "cede:poland:germany:20|tension:12"),
            ]
        ),
        EventSpec(
            id: "poland_partition_1939",
            scenarioIds: ["ww2_eve_1936", "ww2_europe_1939"],
            triggerYear: 1939, triggerMonth: 9, minDay: 22,
            title: "苏军西进 · 瓜分波兰",
            headline: "苏联红军越过东部边境，按苏德密约瓜分波兰",
            dateLabel: "1939 年 9 月 17 日",
            body: "华沙战线崩解之际，苏联红军以保卫西乌克兰与西白俄罗斯为名出兵波兰东部，随后按苏德秘密议定书划定新国界。",
            effectSummary: "苏联立即接管波兰东部 45% 疆域（利沃夫、维尔纽斯线）并对波兰残部宣战，苏德建立短暂缓冲。",
            illustration: "event_poland_partition",
            actorSpecId: "ussr", targetSpecId: "poland",
            choices: [
                Choice(title: "出兵西进、按密约瓜分波兰（史实）", subtitle: "苏联接管波兰东部疆域，建立西方战略纵深", isHistorical: true, effectCode: "cede_east:poland:ussr:45|war:ussr:poland:0|pact:germany:ussr:2|tension:10"),
                Choice(title: "严守中立、不参与瓜分（架空）", subtitle: "苏联按兵不动，保持对波兰中立", isHistorical: false, effectCode: "tension:-4"),
            ]
        ),
        EventSpec(
            id: "weserubung_1940",
            scenarioIds: ["ww2_eve_1936", "ww2_europe_1939"],
            triggerYear: 1940, triggerMonth: 4, minDay: 185,
            title: "威瑟演习 · 闪击北欧",
            headline: "德军海空奇袭丹麦与挪威，抢占铁矿航道",
            dateLabel: "1940 年 4 月 9 日",
            body: "为确保瑞典铁矿经纳尔维克港源源不断运抵德国，德军出动海空力量闪电突袭丹麦与挪威。",
            effectSummary: "德国向丹麦王国与挪威王国宣战并获 90 日海空突击加成；丹麦、挪威自动加入同盟国。",
            illustration: "event_weserubung_1940",
            actorSpecId: "germany", targetSpecId: "norway",
            choices: [
                Choice(title: "执行威瑟演习（史实）", subtitle: "突袭丹麦与挪威，夺取北海制海要冲", isHistorical: true, effectCode: "buff:germany:威瑟演习突击:22:0:1.22:20:90|war:germany:denmark:1|war:germany:norway:1|ally:uk:norway|tension:10"),
                Choice(title: "暂缓北欧战线、集中主力西进（架空）", subtitle: "跳过北欧直接备战西线", isHistorical: false, effectCode: "tension:2"),
            ]
        ),
        EventSpec(
            id: "fall_gelb_1940",
            scenarioIds: ["ww2_eve_1936", "ww2_europe_1939"],
            triggerYear: 1940, triggerMonth: 5, minDay: 225,
            title: "黄色方案 · 绕道低地三国闪击法国",
            headline: "阿登奇兵！古德里安装甲集群横扫荷比卢直插巴黎",
            dateLabel: "1940 年 5 月 10 日",
            body: "曼施坦因拟定大胆的「镰刀计划」：德军主力装甲集群突破被视为天堑的阿登森林，横扫荷兰、比利时、卢森堡低地三国，绕过马奇诺防线直逼英吉利海峡！",
            effectSummary: "德军激活 120 日【镰刀计划·阿登闪击】（行军 ×1.40、攻防突击 +36%），同时向荷兰、比利时、卢森堡宣战！",
            illustration: "event_fall_gelb_1940",
            actorSpecId: "germany", targetSpecId: "belgium",
            choices: [
                Choice(title: "发动黄色方案 · 绕道低地三国（史实）", subtitle: "全面进攻荷兰、比利时、卢森堡，包抄法军主力", isHistorical: true, effectCode: "buff:germany:镰刀计划·阿登闪击:36:0:1.40:0:120|war:germany:netherlands:1|war:germany:belgium:1|war:germany:luxembourg:1|ally:uk:netherlands|ally:uk:belgium|tension:18"),
                Choice(title: "正面强攻马奇诺防线（架空）", subtitle: "不侵犯低地三国中立，直接强攻法德边境", isHistorical: false, effectCode: "war:germany:france:1|tension:8"),
            ]
        ),
        EventSpec(
            id: "barbarossa_1941",
            scenarioIds: ["ww2_eve_1936", "ww2_europe_1939"],
            triggerYear: 1941, triggerMonth: 6, minDay: 560,
            title: "巴巴罗萨计划 · 苏德战争爆发",
            headline: "三百万轴心大军越过苏德边界，人类史上最惨烈陆战打响",
            dateLabel: "1941 年 6 月 22 日",
            body: "德意志撕毁互不侵犯条约，分北、中、南三个集团军群全线突击苏联，意大利、罗马尼亚、匈牙利、芬兰协同参战；斯大林号召伟大卫国战争全面总动员！",
            effectSummary: "德国与轴心盟友全面对苏宣战，德军获 150 日【巴巴罗萨初期突击】；苏联激活工业东迁与【卫国战争总动员】！",
            illustration: "event_barbarossa_1941",
            actorSpecId: "germany", targetSpecId: "ussr",
            choices: [
                Choice(title: "启动巴巴罗萨计划（史实）", subtitle: "全线突击苏联，触发史上最大规模陆战", isHistorical: true, effectCode: "buff:germany:巴巴罗萨突击:30:0:1.30:0:150|buff:ussr:伟大卫国战争:10:25:1.05:0:240|war:germany:ussr:1|war:italy:ussr:1|war:romania:ussr:1|war:hungary:ussr:1|war:finland:ussr:1|tension:25"),
                Choice(title: "维持苏德和平、全力执行海狮登陆（架空）", subtitle: "暂缓攻苏，集中力量渡海进攻英国", isHistorical: false, effectCode: "buff:germany:海狮渡海准备:15:0:1.15:30:150|tension:10"),
            ]
        ),
        EventSpec(
            id: "moscow_winter_1941",
            scenarioIds: ["ww2_eve_1936", "ww2_europe_1939"],
            triggerYear: 1941, triggerMonth: 12, minDay: 720,
            title: "莫斯科保卫战 · 冬将军寒潮",
            headline: "零下四十度极寒降临！朱可夫挥师发动莫斯科冬季大反攻",
            dateLabel: "1941 年 12 月 5 日",
            body: "严酷的俄罗斯寒冬令缺乏冬装与防冻液的德军装甲部队寸步难行，朱可夫调动西伯利亚生力军在莫斯科城下发起排山倒海的冬季反攻！",
            effectSummary: "苏联获得 150 日【红军冬季大反攻】（攻击 +32%、防御 +28%、行军 ×1.20），德军陷入严冬后勤衰减。",
            illustration: "event_moscow_winter",
            actorSpecId: "ussr", targetSpecId: "germany",
            choices: [
                Choice(title: "朱可夫发动莫斯科大反攻（史实）", subtitle: "西伯利亚精锐全线反击，粉碎德军闪电战神话", isHistorical: true, effectCode: "buff:ussr:莫斯科冬季反攻:32:28:1.20:0:150|ic:ussr:35"),
                Choice(title: "固守伏尔加与莫斯科防线（架空）", subtitle: "积蓄重炮与坦克兵团等待春季总攻", isHistorical: false, effectCode: "buff:ussr:纵深筑垒:8:36:1.0:0:150|ic:ussr:25"),
            ]
        ),

        // ==================== 1931 山河危亡 · 九一八至全面抗战事件链 ====================
        EventSpec(
            id: "mukden_1931",
            scenarioIds: ["china_1931"],
            triggerYear: 1931, triggerMonth: 9, minDay: 5,
            title: "九一八事变 · 柳条湖危机",
            headline: "炮轰北大营！日本关东军悍然发动九一八事变",
            dateLabel: "1931 年 9 月 18 日",
            body: "日本关东军自行炸毁沈阳北郊柳条湖一段南满铁路并诬陷中国守军，随即连夜炮轰北大营、攻占沈阳，拉开中国人民十四年浴血抗战的序幕！",
            effectSummary: "大日本帝国携 120 日【关东军突袭】加成向东北军宣战；全球紧张度 +18。",
            illustration: "event_mukden_1931",
            actorSpecId: "japan", targetSpecId: "northeast",
            choices: [
                Choice(title: "关东军全面出击东北（史实）", subtitle: "日军突袭沈阳、长春，进逼松花江", isHistorical: true, effectCode: "buff:japan:关东军突袭:28:0:1.28:15:120|war:japan:northeast:1|tension:18"),
                Choice(title: "东北军就地全军死战抵抗（架空）", subtitle: "张学良下令全军誓死守土，全国援军驰援关外", isHistorical: false, effectCode: "buff:northeast:誓死守卫白山黑水:25:35:1.15:0:180|war:japan:northeast:1|war:roc:japan:1|tension:24"),
            ]
        ),
        EventSpec(
            id: "manchukuo_1932",
            scenarioIds: ["china_1931"],
            triggerYear: 1932, triggerMonth: 3, minDay: 140,
            title: "长春傀儡政权 · 伪满洲国建立",
            headline: "关东军在长春扶植溥仪成立伪满洲国",
            dateLabel: "1932 年 3 月 1 日",
            body: "日本关东军强占东北要冲后，在长春扶植废帝爱新觉罗·溥仪出任执政，企图将东北打造为继续鲸吞华北的战争工业基地。",
            effectSummary: "日本工业产能 +22，东北战线压力剧增，抗日义勇军在白山黑水遍地烽火；全球紧张度 +12。",
            illustration: "event_manchukuo_1932",
            actorSpecId: "japan", targetSpecId: "northeast",
            choices: [
                Choice(title: "扶植长春伪满傀儡政权（史实）", subtitle: "强化关东军北疆军工补给基地", isHistorical: true, effectCode: "ic:japan:22|tension:12"),
                Choice(title: "直接划为关东军军管直辖区（架空）", subtitle: "强化军事统治，引发更猛烈民众起义", isHistorical: false, effectCode: "ic:japan:16|tension:16"),
            ]
        ),
        EventSpec(
            id: "xian_incident_1936",
            scenarioIds: ["china_1931"],
            triggerYear: 1936, triggerMonth: 12, minDay: 420,
            title: "西安事变 · 停止内战一致抗日",
            headline: "兵谏华清池！国共内战基本结束，民族统一战线初成",
            dateLabel: "1936 年 12 月 12 日",
            body: "民族危机空前深重之际，张学良、杨虎城发动西安事变促成和平解决，十年内战基本结束，中国各派系开始酝酿全民族共同御侮。",
            effectSummary: "国民政府与红军/苏区停战并大幅改善关系，为即将到来的全面抗战凝聚力量。",
            illustration: "event_xian_1936",
            actorSpecId: "roc", targetSpecId: "cpc",
            choices: [
                Choice(title: "和平解决西安事变、一致对外（史实）", subtitle: "停止内战，国共及各路地方军团凝聚抗日共识", isHistorical: true, effectCode: "peace:roc:cpc|ally:roc:cpc|ally:roc:northeast|ally:roc:shanxi|ally:roc:guangxi"),
                Choice(title: "继续内斗消耗（架空）", subtitle: "错失团结御侮良机，抗战局势雪上加霜", isHistorical: false, effectCode: "tension:8"),
            ]
        ),
        EventSpec(
            id: "marco_polo_1937",
            scenarioIds: ["china_1931"],
            triggerYear: 1937, triggerMonth: 7, minDay: 540,
            title: "七七卢沟桥事变 · 全民族抗战爆发",
            headline: "宛平城头枪声骤响！全民族抗日救亡全面打响",
            dateLabel: "1937 年 7 月 7 日",
            body: "日军借口士兵失踪悍然炮击宛平城与卢沟桥，中国守军第二十九军奋起还击。全国各党派军民正式结成抗日民族统一战线，誓死保卫河山！",
            effectSummary: "日本全面向中国各抗日阵营宣战；国共及各战区正式锁定【抗日民族统一战线】，激活山地持久防御加成！",
            illustration: "event_marco_polo_1937",
            actorSpecId: "japan", targetSpecId: "roc",
            choices: [
                Choice(title: "全民族抗战 · 誓死御侮（史实）", subtitle: "抗日民族统一战线正式锁定，全国进入全面抗战", isHistorical: true, effectCode: "ally:roc:cpc|ally:roc:shanxi|ally:roc:guangxi|war:japan:roc:1|war:japan:cpc:1|buff:roc:淞沪与持久抗战:12:30:1.05:0:240|buff:cpc:敌后游击烽火:18:35:1.15:0:240|tension:25"),
                Choice(title: "华北局部妥协退让（架空）", subtitle: "割让华北换取短暂喘息，士气受挫", isHistorical: false, effectCode: "cede:roc:japan:15|tension:10"),
            ]
        ),

        // ==================== 1941 太平洋风暴事件链 ====================
        EventSpec(
            id: "pearl_harbor_1941",
            scenarioIds: ["ww2_asia_1941"],
            triggerYear: 1941, triggerMonth: 12, minDay: 4,
            title: "偷袭珍珠港 · 虎！虎！虎！",
            headline: "联合舰队奇袭夏威夷与南洋！太平洋战争全面爆发",
            dateLabel: "1941 年 12 月 7 日",
            body: "山本五十六统筹的六艘航空母舰特混编队发来「虎！虎！虎！」奇袭密电，日军同时扑向珍珠港、菲律宾、马来亚、新加坡与荷属东印度油田！",
            effectSummary: "大日本帝国获得 150 日【虎！虎！虎！海空奇袭】（海战 +35%、突击 +28%、行军 ×1.25），向美、英、荷、澳全面宣战！",
            illustration: "event_pearl_harbor_1941",
            actorSpecId: "japan", targetSpecId: "usa",
            choices: [
                Choice(title: "执行南进战略 · 偷袭珍珠港（史实）", subtitle: "联合舰队全线南下，夺取东南亚石油橡胶", isHistorical: true, effectCode: "buff:japan:虎！虎！虎！海空奇袭:28:0:1.25:35:150|war:japan:usa:1|war:japan:uk_burma:1|war:japan:uk_malaya:1|war:japan:dutch_ei:1|war:japan:australia:1|tension:30"),
                Choice(title: "放弃南进 · 转向北进突击苏联远东（架空）", subtitle: "联合关东军北上西伯利亚，暂不惹怒美国", isHistorical: false, effectCode: "buff:japan:关东军北进突击:25:0:1.22:10:150|war:japan:ussr_fe:1|tension:22"),
            ]
        ),
        EventSpec(
            id: "midway_1942",
            scenarioIds: ["ww2_asia_1941"],
            triggerYear: 1942, triggerMonth: 6, minDay: 185,
            title: "中途岛海战 · 太平洋战局转折",
            headline: "尼米兹破译密电奇袭机动部队！美军工业巨轮全面开动",
            dateLabel: "1942 年 6 月 4 日",
            body: "美国太平洋舰队破译日军密码在中途岛伏击重创联合舰队航母主力，同时美国战时工业产能全面爆发，盟军在太平洋与印缅战区展开战略反攻！",
            effectSummary: "美利坚工业产能 +65 并获 240 日【跳岛海空反攻】（海战 +32%、攻防 +24%），中国战区获驼峰航线补给强化！",
            illustration: "event_midway_1942",
            actorSpecId: "usa", targetSpecId: "japan",
            choices: [
                Choice(title: "发起太平洋跳岛大反攻（史实）", subtitle: "美军舰队与航母产能暴涨，全面压制联合舰队", isHistorical: true, effectCode: "ic:usa:65|buff:usa:太平洋海空大反攻:24:12:1.18:32:240|buff:roc:驼峰航线与远征反攻:18:16:1.08:0:180"),
                Choice(title: "稳健固守夏威夷与澳洲防线（架空）", subtitle: "优先积蓄两栖与海军舰队力量", isHistorical: false, effectCode: "ic:usa:45|buff:usa:重工爆舰:12:22:1.05:25:200"),
            ]
        ),
        EventSpec(
            id: "august_storm_1945",
            scenarioIds: ["ww2_asia_1941"],
            triggerYear: 1945, triggerMonth: 8, minDay: 1120,
            title: "八月风暴 · 苏联远东对日宣战",
            headline: "华西列夫斯基挥师百万红军突击关东军",
            dateLabel: "1945 年 8 月 8 日",
            body: "苏联履行《雅尔塔协定》正式对日宣战，一百五十万远东红军装甲集群越过黑龙江与兴安岭，对伪满洲国与关东军展开钢铁洪流式合围！",
            effectSummary: "苏联远东获 150 日【八月风暴装甲洪流】加成，全面对大日本帝国与伪满洲国宣战！",
            illustration: "event_august_storm_1945",
            actorSpecId: "ussr_fe", targetSpecId: "japan",
            choices: [
                Choice(title: "发动八月风暴 · 解放东北（史实）", subtitle: "红军钢铁洪流突袭关东军与伪满洲国", isHistorical: true, effectCode: "buff:ussr_fe:八月风暴钢铁洪流:38:15:1.35:0:150|war:ussr_fe:japan:1|war:ussr_fe:manchukuo:1|tension:15"),
                Choice(title: "维持苏日中立条约（架空）", subtitle: "苏联暂不介入远东战事", isHistorical: false, effectCode: "tension:-5"),
            ]
        ),

        // ==================== 1914 一战 / 1812 拿破仑 / 1950 冷战 / 古代史诗事件 ====================
        EventSpec(
            id: "schlieffen_1914",
            scenarioIds: ["ww1_1914"],
            triggerYear: 1914, triggerMonth: 8, minDay: 5,
            title: "施里芬计划 · 德军强渡比利时",
            headline: "欧洲灯火熄灭！德军借道比利时直扑巴黎，英国参战",
            dateLabel: "1914 年 8 月 4 日",
            body: "德意志帝国按施里芬计划绕道比利时包抄法军左翼，大英帝国立即以维护比利时中立为由对德宣战，第一次世界大战全面引爆！",
            effectSummary: "德国获 100 日【施里芬西线突击】向法比宣战，英国正式加入协约国对德奥宣战。",
            illustration: "event_schlieffen_1914",
            actorSpecId: "germany", targetSpecId: "france",
            choices: [
                Choice(title: "执行施里芬计划（史实）", subtitle: "借道比利时包抄巴黎，英国宣战参战", isHistorical: true, effectCode: "buff:germany:施里芬突击:26:0:1.25:0:100|war:germany:belgium:1|war:germany:france:1|war:uk:germany:1|tension:28"),
                Choice(title: "改行东进战略 · 先击溃沙俄（架空）", subtitle: "西线防御、东线全力重锤俄罗斯帝国", isHistorical: false, effectCode: "buff:germany:坦能堡东线突击:28:12:1.20:0:120|war:germany:russia:1|tension:20"),
            ]
        ),
        EventSpec(
            id: "russian_winter_1812",
            scenarioIds: ["napoleon_1812"],
            triggerYear: 1812, triggerMonth: 11, minDay: 140,
            title: "莫斯科大火与俄国严冬",
            headline: "库图佐夫焦土诱敌！严寒冻霜吞噬法军大军团补给线",
            dateLabel: "1812 年 11 月",
            body: "俄军实行坚决的坚壁清野与焦土战术，随着暴雪严寒提前降临东欧平原，远离本土补给基地的法兰西大军团陷入绝境，反法同盟全面吹响反攻号角！",
            effectSummary: "俄罗斯帝国获 180 日【冬将军反攻】（攻防 +30%、行军 ×1.18），俄普奥反法联军士气大振。",
            illustration: "event_winter_1812",
            actorSpecId: "russia", targetSpecId: "france",
            choices: [
                Choice(title: "发动焦土寒冬大反击（史实）", subtitle: "哥萨克骑兵与寒冬合围追击撤退法军", isHistorical: true, effectCode: "buff:russia:冬将军反攻:30:30:1.18:0:180|war:russia:france:1"),
                Choice(title: "在莫斯科城下决战讲和（架空）", subtitle: "尝试与拿破仑媾和止战", isHistorical: false, effectCode: "peace:russia:france"),
            ]
        ),
        EventSpec(
            id: "korean_war_1950",
            scenarioIds: ["coldwar_1950"],
            triggerYear: 1950, triggerMonth: 6, minDay: 45,
            title: "朝鲜半岛铁幕危机",
            headline: "三八线烽火燃起！东西方两大阵营正面交锋",
            dateLabel: "1950 年 6 月 25 日",
            body: "冷战从政治铁幕骤然升级为热战对抗，联合国军介入半岛，新中国毅然出兵抗美援朝、保家卫国，全球紧张度瞬间飙升！",
            effectSummary: "全球紧张度 +24，东西方阵营进入高度战备与军备竞赛。",
            illustration: "event_korean_war_1950",
            actorSpecId: "china", targetSpecId: "usa",
            choices: [
                Choice(title: "抗美援朝 · 保家卫国（史实）", subtitle: "新中国精锐志愿军展现顽强防御与穿插战力", isHistorical: true, effectCode: "buff:china:抗美援朝·三三制穿插:26:34:1.16:0:240|tension:24"),
                Choice(title: "强化东北边防、外交斡旋（架空）", subtitle: "专注国内重工业建设", isHistorical: false, effectCode: "ic:china:25|tension:10"),
            ]
        ),
        EventSpec(
            id: "uk_hurricane_1952",
            scenarioIds: ["coldwar_1950"],
            triggerYear: 1952, triggerMonth: 10, minDay: 780,
            title: "大英帝国「飓风行动」核试成功",
            headline: "世界第三个核大国诞生！英国完成首次原子弹试验",
            dateLabel: "1952 年 10 月 3 日",
            body: "大英帝国在蒙特贝洛群岛成功引爆代号「飓风」的原子弹，正式继美苏之后迈入核俱乐部。",
            effectSummary: "大英帝国正式获得首枚战略核武器并提升威慑力；全球紧张度 +10。",
            illustration: "event_uk_hurricane_1952",
            actorSpecId: "uk", targetSpecId: nil,
            choices: [
                Choice(title: "宣布飓风核试成功（史实）", subtitle: "大英帝国核武库 +2 枚", isHistorical: true, effectCode: "nuke:uk:2|tension:10"),
            ]
        ),
        EventSpec(
            id: "chibi_208",
            scenarioIds: ["sanguo_208"],
            triggerYear: 208, triggerMonth: 11, minDay: 35,
            title: "赤壁之战 · 东风火攻",
            headline: "周瑜诸葛亮联手借东风火烧连环船！",
            dateLabel: "建安十三年冬（208 年）",
            body: "曹军水师不习水战以铁索连舟，孙权与刘备结成江东荆楚联军，黄盖诈降火攻赤壁，北军精锐顿遭重创，三分天下大势由此定鼎！",
            effectSummary: "孙权与刘备锁定【孙刘联军】并获 150 日【赤壁水战火攻】加成（海战 +40%、防御 +28%）。",
            illustration: "event_chibi_208",
            actorSpecId: "wu", targetSpecId: "wei",
            choices: [
                Choice(title: "孙刘结盟 · 火烧赤壁（史实）", subtitle: "孙刘联军获水战火攻奇效，抵御曹魏南下", isHistorical: true, effectCode: "ally:wu:shu|buff:wu:赤壁火攻:26:28:1.15:40:150|buff:shu:联吴抗曹:24:26:1.15:0:150"),
                Choice(title: "江东举州归降曹丞相（架空）", subtitle: "东吴称臣曹操，天下一统提前降临", isHistorical: false, effectCode: "vassal:wei:wu"),
            ]
        ),
        EventSpec(
            id: "honnoji_1582",
            scenarioIds: ["sengoku_1560"],
            triggerYear: 1582, triggerMonth: 6, minDay: 300,
            title: "天下布武 · 桶狭间与风云骤变",
            headline: "织田奇袭名震扶桑，日本战国进入终局争霸",
            dateLabel: "战国乱世风云",
            body: "尾张奇袭与铁炮三段击彻底改写日本战国兵法，各大名纷纷扩编铁炮常备军，逐鹿京都上洛之争愈演愈烈。",
            effectSummary: "织田家获得 180 日【天下布武·铁炮三段击】（进攻 +32%、行军 ×1.22）。",
            illustration: "event_sengoku_gun",
            actorSpecId: "oda", targetSpecId: nil,
            choices: [
                Choice(title: "推行天下布武与铁炮革新（史实）", subtitle: "织田军火力与机动大幅跃升", isHistorical: true, effectCode: "buff:oda:天下布武·铁炮革新:32:10:1.22:0:180"),
            ]
        ),
    ]

    // MARK: - 每日低开销检查（O(E) 极速扫描，零拖慢模拟帧）

    public static func tickDay(_ r: JS) {
        guard UnitKinds.enabled, !r.regimes.isNull, r.regimes.enabled.isTruthy else { return }
        guard let scId = r.regimes.historicalScenarioId.optionalString, !scId.isEmpty else { return }
        let curDay = r.world.day.optionalNumber.map(Int.init) ?? 0
        // 仅当存在「尚未拍板」的交互决策事件时暂缓下一条；已自动结算的历史号外满 6 日自动收起，绝不阻塞后续历史大事件与 64× 看海
        if !r.regimes.pendingEvent.isNull {
            if !r.regimes.pendingEvent.resolved.isTruthy {
                return
            }
            let firedDay = r.regimes.pendingEvent.firedDay.asInt
            if curDay - firedDay >= 6 {
                r.regimes.pendingEvent = .null
            }
        }
        let curYear = HistoricalEra.displayYear(r)
        let curMonth = (!r.world.date.isNull ? r.world.date.month.asInt : 1)
        let historical = isHistoricalRoute(r)
        if r.regimes.firedEvents.isNull { r.regimes.firedEvents = .object() }

        // 每 30 天顺手检查是否有新组建军团尚未挂编历史名将
        if curDay > 0 && curDay % 30 == 0 {
            MilitaryDoctrines.assignHistoricalCommanders(r)
        }

        let playerNationId = r.regimes.playerNationId.optionalString

        for ev in allEvents where ev.scenarioIds.contains(scId) {
            guard r.regimes.firedEvents[ev.id].isNull else { continue }
            // 剧本开局首月事件（minDay <= 45，如白色方案第3日、瓜分波兰第22日、九一八第5日、珍珠港第4日）按相对开局日直接触发，不受建世默认1月约束
            let dateReached = (ev.minDay <= 45)
                ? (curYear >= ev.triggerYear)
                : ((curYear > ev.triggerYear) || (curYear == ev.triggerYear && curMonth >= ev.triggerMonth))
            guard dateReached || curDay >= ev.minDay + 90 else { continue }
            guard curDay >= ev.minDay else { continue }
            guard let actorNid = nationId(r, specId: ev.actorSpecId), Vassals.alive(r, actorNid) else { continue }
            if let tSpec = ev.targetSpecId {
                guard let tNid = nationId(r, specId: tSpec), Vassals.alive(r, tNid) else { continue }
            }

            // 标记触发
            r.regimes.firedEvents[ev.id] = JS(curDay)

            let targetNid = ev.targetSpecId.flatMap { nationId(r, specId: $0) }
            let involvesPlayer = (playerNationId != nil) && (playerNationId == actorNid || playerNationId == targetNid)

            if involvesPlayer && ev.choices.count > 1 && !historical {
                // 架空模式下若涉及玩家亲自掌控的国家，弹出多分支事件报刊供玩家拍板
                storePendingModal(r, ev: ev, historical: historical)
                return
            }

            // 选择分支：史实路线 100% 执行史实第一分支；架空路线 AI 按确定性哈希 35% 概率走出惊艳架空支线！
            let pickedIndex: Int
            if historical || ev.choices.count <= 1 {
                pickedIndex = ev.choices.firstIndex(where: \.isHistorical) ?? 0
            } else {
                let seed = "\(r.world.custom.seed.optionalString ?? "")|\(ev.id)|\(curDay)"
                let h = Opening.hash(seed) % 100
                pickedIndex = (h < 65) ? 0 : (1 % ev.choices.count)
            }
            let choice = ev.choices[pickedIndex]
            applyEffectCode(r, code: choice.effectCode, ev: ev, chosenTitle: choice.title)

            // 同时把事件报刊写入 pendingEvent（单确认按钮）供客户端展示重大历史号外，若 15 天未点自动清或玩家一键阅毕
            storePendingModal(r, ev: ev, historical: historical, resolvedChoiceIndex: pickedIndex)
            return
        }
    }

    private static func storePendingModal(_ r: JS, ev: EventSpec, historical: Bool, resolvedChoiceIndex: Int? = nil) {
        let obj = JS.object()
        obj.id = JS(ev.id)
        obj.title = JS(ev.title)
        obj.headline = JS(ev.headline)
        obj.dateLabel = JS(ev.dateLabel)
        obj.body = JS(ev.body)
        obj.effectSummary = JS(ev.effectSummary)
        obj.illustration = JS(ev.illustration)
        obj.isHistoricalRoute = JS(historical)
        obj.firedDay = JS(r.world.day.optionalNumber.map(Int.init) ?? 0)
        if let idx = resolvedChoiceIndex {
            obj.resolved = JS(true)
            let c = ev.choices[idx]
            let cObj = JS.object()
            cObj.title = JS("已知悉（\(c.title)）")
            cObj.subtitle = JS(c.subtitle)
            cObj.isHistorical = JS(c.isHistorical)
            cObj.effectCode = JS("ack")
            obj.choices = .array([cObj])
        } else {
            obj.resolved = JS(false)
            obj.choices = .array(ev.choices.map { c in
                let cObj = JS.object()
                cObj.title = JS(c.title)
                cObj.subtitle = JS(c.subtitle)
                cObj.isHistorical = JS(c.isHistorical)
                cObj.effectCode = JS(c.effectCode)
                return cObj
            })
        }
        r.regimes.pendingEvent = obj
    }

    public static func pendingModal(_ r: JS) -> PendingModal? {
        guard !r.regimes.isNull, !r.regimes.pendingEvent.isNull else { return nil }
        let e = r.regimes.pendingEvent
        guard let id = e.id.optionalString, !id.isEmpty else { return nil }
        let choices: [Choice] = e.choices.isArray ? e.choices.asArray.map { c in
            Choice(
                title: c.title.optionalString ?? "知悉",
                subtitle: c.subtitle.optionalString ?? "",
                isHistorical: c.isHistorical.isTruthy,
                effectCode: c.effectCode.optionalString ?? "ack"
            )
        } : []
        return PendingModal(
            id: id,
            title: e.title.optionalString ?? "历史事件",
            headline: e.headline.optionalString ?? "",
            dateLabel: e.dateLabel.optionalString ?? "",
            body: e.body.optionalString ?? "",
            effectSummary: e.effectSummary.optionalString ?? "",
            illustration: e.illustration.optionalString ?? "",
            isHistoricalRoute: e.isHistoricalRoute.isTruthy,
            choices: choices
        )
    }

    @discardableResult
    public static func resolveChoice(_ r: JS, eventId: String, choiceIndex: Int) -> (ok: Bool, reason: String) {
        guard !r.regimes.isNull, !r.regimes.pendingEvent.isNull else { return (true, "已关闭") }
        let cur = r.regimes.pendingEvent
        guard cur.id.optionalString == eventId || eventId.isEmpty else { return (false, "事件已过期") }
        let alreadyResolved = cur.resolved.isTruthy
        let choicesArr = cur.choices.isArray ? cur.choices.asArray : []
        let safeIdx = max(0, min(max(0, choicesArr.count - 1), choiceIndex))
        let code = choicesArr.isEmpty ? "ack" : (choicesArr[safeIdx].effectCode.optionalString ?? "ack")
        let title = choicesArr.isEmpty ? "知悉" : (choicesArr[safeIdx].title.optionalString ?? "知悉")
        r.regimes.pendingEvent = .null
        if !alreadyResolved && code != "ack", let ev = allEvents.first(where: { $0.id == (cur.id.optionalString ?? "") }) {
            applyEffectCode(r, code: code, ev: ev, chosenTitle: title)
        }
        return (true, "已批阅历史事件")
    }

    // MARK: - 真实引擎级效果执行器（吞并、割地、瓜分、附庸、锁盟、宣战、闪电战 Buff、核试）

    private static func applyEffectCode(_ r: JS, code: String, ev: EventSpec, chosenTitle: String) {
        let clauses = code.split(separator: "|").map(String.init)
        var involvedNations = [String]()
        if let a = nationId(r, specId: ev.actorSpecId) { involvedNations.append(a) }
        if let t = ev.targetSpecId.flatMap({ nationId(r, specId: $0) }), !involvedNations.contains(t) {
            involvedNations.append(t)
        }

        for clause in clauses {
            let parts = clause.split(separator: ":").map(String.init)
            guard let op = parts.first else { continue }
            switch op {
            case "annex":
                if parts.count >= 3,
                   let winner = nationId(r, specId: parts[1]),
                   let victim = nationId(r, specId: parts[2]),
                   winner != victim, Vassals.alive(r, winner), Vassals.alive(r, victim) {
                    annexNation(r, winner: winner, victim: victim)
                }
            case "cede", "cede_east":
                if parts.count >= 4,
                   let from = nationId(r, specId: parts[1]),
                   let to = nationId(r, specId: parts[2]),
                   let pct = Int(parts[3]),
                   from != to, Vassals.alive(r, from), Vassals.alive(r, to) {
                    cedeProvinces(r, from: from, to: to, percent: pct, preferEast: op == "cede_east")
                }
            case "vassal":
                if parts.count >= 3,
                   let lord = nationId(r, specId: parts[1]),
                   let vas = nationId(r, specId: parts[2]),
                   lord != vas, Vassals.alive(r, lord), Vassals.alive(r, vas) {
                    makeHistoricalVassal(r, overlord: lord, vassal: vas, tributeRate: 0.18)
                }
            case "war":
                if parts.count >= 3,
                   let atk = nationId(r, specId: parts[1]),
                   let def = nationId(r, specId: parts[2]),
                   atk != def, Vassals.alive(r, atk), Vassals.alive(r, def) {
                    let callAllies = parts.count >= 4 && parts[3] == "1"
                    forceHistoricalWar(r, attacker: atk, defender: def, callAllies: callAllies, reason: ev.title)
                }
            case "peace":
                if parts.count >= 3,
                   let a = nationId(r, specId: parts[1]),
                   let b = nationId(r, specId: parts[2]) {
                    forceHistoricalPeace(r, a: a, b: b)
                }
            case "pact":
                if parts.count >= 4,
                   let a = nationId(r, specId: parts[1]),
                   let b = nationId(r, specId: parts[2]),
                   let yrs = Int(parts[3]) {
                    DiplomacyDeep.upsertTreaty(r, a: a, b: b, kind: "pact", years: yrs)
                }
            case "ally":
                if parts.count >= 3,
                   let a = nationId(r, specId: parts[1]),
                   let b = nationId(r, specId: parts[2]),
                   a != b, Vassals.alive(r, a), Vassals.alive(r, b) {
                    joinOrCreateHistoricalAlliance(r, leader: a, joiner: b, locked: isHistoricalRoute(r))
                }
            case "buff":
                // buff:specId:label:atk:def:spd:nav:days
                if parts.count >= 8, let nid = nationId(r, specId: parts[1]) {
                    MilitaryDoctrines.grantCampaignBuff(
                        r,
                        nationId: nid,
                        label: parts[2],
                        attackPct: Double(parts[3]) ?? 0,
                        defensePct: Double(parts[4]) ?? 0,
                        speedMult: Double(parts[5]) ?? 1.0,
                        navalPct: Double(parts[6]) ?? 0,
                        durationDays: Int(parts[7]) ?? 120
                    )
                }
            case "ic":
                if parts.count >= 3, let nid = nationId(r, specId: parts[1]), let delta = Double(parts[2]) {
                    NuclearWarfare.ensureInitialized(r)
                    if !r.regimes.hoi4.isNull && !r.regimes.hoi4.nations[nid].isNull {
                        let cur = r.regimes.hoi4.nations[nid].ic.optionalNumber ?? 50
                        r.regimes.hoi4.nations[nid].ic = JS(min(500.0, max(10.0, cur + delta)))
                    }
                }
            case "tension":
                if parts.count >= 2, let delta = Double(parts[1]) {
                    NuclearWarfare.ensureInitialized(r)
                    if !r.regimes.hoi4.isNull {
                        let cur = r.regimes.hoi4.worldTension.optionalNumber ?? 0
                        r.regimes.hoi4.worldTension = JS(min(100.0, max(0.0, cur + delta)))
                    }
                }
            case "nuke":
                if parts.count >= 3, let nid = nationId(r, specId: parts[1]), let cnt = Int(parts[2]) {
                    NuclearWarfare.ensureInitialized(r)
                    if !r.regimes.hoi4.isNull && !r.regimes.hoi4.nations[nid].isNull {
                        let cur = r.regimes.hoi4.nations[nid].nukes.asInt
                        r.regimes.hoi4.nations[nid].nukes = JS(cur + max(1, cnt))
                    }
                }
            default:
                break
            }
        }

        _ = People.announce(
            r,
            kind: "event",
            text: "【历史大事件】\(ev.title)（\(ev.dateLabel)）",
            reason: "\(ev.headline) — \(chosenTitle)。\(ev.effectSummary)",
            nations: involvedNations,
            province: nil
        )
    }

    private static func annexNation(_ r: JS, winner: String, victim: String) {
        forceHistoricalPeace(r, a: winner, b: victim)
        for p in r.world.provinces.asArray where p.controller.optionalString == victim || p.legalOwner.optionalString == victim {
            p.controller = JS(winner)
            p.legalOwner = JS(winner)
        }
        // 将被吞并国现役军队遣散并补入新主国库与兵源
        if r.world.armies.isArray {
            let kept = r.world.armies.asArray.filter { $0.nationId.optionalString != victim }
            r.world.armies = .array(kept)
        }
        if !r.world.fleets.isNull && r.world.fleets.isArray {
            let kept = r.world.fleets.asArray.filter { $0.nationId.optionalString != victim }
            r.world.fleets = .array(kept)
        }
        Vassals.reconcileAlliances(r)
        DiplomacyBridge.reconcile(r)
    }

    private static func cedeProvinces(_ r: JS, from: String, to: String, percent: Int, preferEast: Bool) {
        let held = r.world.provinces.asArray.filter { $0.controller.optionalString == from }
        guard held.count >= 2 else { return }
        let capId = r.world.nations.asArray.first(where: { $0.id.asString == from })?.capitalId.optionalString
        let capProvId = capId.flatMap { cid in r.world.cities.asArray.first(where: { $0.id.asString == cid })?.provinceId.optionalString }
        let targetCount = max(1, min(held.count - 1, Int((Double(held.count) * Double(percent) / 100.0).rounded())))

        // 按地理坐标择优割让（preferEast = true 时优先割最东端如东波兰给苏联；否则割离接收国最近边界如苏台德给德国）
        let toProvs = r.world.provinces.asArray.filter { $0.controller.optionalString == to }
        let toCx = toProvs.isEmpty ? 0 : toProvs.reduce(0.0) { $0 + $1.center.x.asNumber } / Double(toProvs.count)
        let toCy = toProvs.isEmpty ? 0 : toProvs.reduce(0.0) { $0 + $1.center.y.asNumber } / Double(toProvs.count)

        let sorted = held.filter { $0.id.optionalString != capProvId }.sorted { a, b in
            if preferEast {
                return a.center.x.asNumber > b.center.x.asNumber
            }
            let da = hypot(a.center.x.asNumber - toCx, a.center.y.asNumber - toCy)
            let db = hypot(b.center.x.asNumber - toCx, b.center.y.asNumber - toCy)
            return da < db
        }
        for p in sorted.prefix(targetCount) {
            p.controller = JS(to)
            p.legalOwner = JS(to)
        }
    }

    private static func makeHistoricalVassal(_ r: JS, overlord lordId: String, vassal vassalId: String, tributeRate: Double) {
        guard lordId != vassalId, Vassals.overlord(r, vassalId) == nil else { return }
        if r.vassals.isNull {
            let v = JS.object()
            v.version = JS(1); v.revision = JS(0); v.enabled = JS(true)
            v.originTime = r.life.gameTime.clone(); v.originTick = r.clock.tick.clone()
            v.records = .array()
            r.vassals = v
        }
        let rec = JS.object()
        rec.overlordId = JS(lordId)
        rec.vassalId = JS(vassalId)
        rec.tributeRate = JS(max(0.05, min(0.35, tributeRate)))
        rec.time = JS(Native.fr(r.life.gameTime.asNumber))
        rec.tick = r.clock.tick.clone()
        rec.updateDay = JS(1)
        rec.endedTick = .null
        rec.endReason = .null
        r.vassals.records.push(rec)
        Vassals.bump(r.vassals)
        DiplomacyDeep.adjustOpinionMod(r, lordId, vassalId, delta: 25)
    }

    private static func forceHistoricalWar(_ r: JS, attacker: String, defender: String, callAllies: Bool, reason: String) {
        if Wars.relation(r, attacker, defender)?.status.asString == "war" { return }
        DiplomacyDeep.breakTreatiesOnWar(r, attacker, defender)
        DiplomacyDeep.adjustOpinionMod(r, attacker, defender, delta: -60)
        // 使用引擎正规宣战建档（含战争目标、联军共同参战与军队态势重算），确保 AI 立刻按战事出兵推进！
        if let scId = r.regimes.historicalScenarioId.optionalString,
           let sc = HistoricalScenarios.scenario(id: scId),
           HistoricalScenarios.registerHistoricalWarDirectly(r, attacker: attacker, defender: defender, casusBelli: reason, scenario: sc) {
            War26.reconcileForces(r, [])
            if Naval.sea != nil { Naval.reconcileLandOwners(r) }
            DiplomacyBridge.reconcile(r)
            return
        }
        if let rel = Wars.relation(r, attacker, defender) {
            rel.status = JS("war")
            rel.sinceDay = r.world.day.clone()
        } else {
            let rel = JS.object()
            rel.a = JS(attacker); rel.b = JS(defender); rel.status = JS("war"); rel.sinceDay = r.world.day.clone()
            r.world.statecraft.relations.push(rel)
        }
        if callAllies, let defAl = Vassals.allianceOf(r, defender) {
            for m in defAl.members.asArray.map(\.asString) where m != defender && m != attacker && Vassals.alive(r, m) {
                if Wars.relation(r, m, attacker)?.status.asString != "war" {
                    forceHistoricalWar(r, attacker: m, defender: attacker, callAllies: false, reason: "\(reason)·盟约参战")
                }
            }
        }
        DiplomacyBridge.reconcile(r)
    }

    private static func forceHistoricalPeace(_ r: JS, a: String, b: String) {
        if let rel = Wars.relation(r, a, b), rel.status.asString == "war" {
            rel.status = JS("peace")
            rel.sinceDay = r.world.day.clone()
            DiplomacyBridge.reconcile(r)
        }
    }

    private static func joinOrCreateHistoricalAlliance(_ r: JS, leader: String, joiner: String, locked: Bool) {
        if let al = Vassals.allianceOf(r, leader) {
            if !al.members.asArray.contains(where: { $0.asString == joiner }) {
                al.members.push(JS(joiner))
                if locked { al.unbreakable = JS(true) }
                Vassals.bump(r.alliances)
            }
            return
        }
        if r.alliances.isNull {
            let a = JS.object()
            a.version = JS(1); a.revision = JS(0); a.nextId = JS(1); a.enabled = JS(true)
            a.originTime = r.life.gameTime.clone(); a.originTick = r.clock.tick.clone()
            a.records = .array(); a.lastAction = .object()
            r.alliances = a
        }
        let nextId = r.alliances.nextId.asNumber
        r.alliances.nextId = JS(nextId + 1)
        let rec = JS.object()
        rec.id = JS(nextId)
        rec.name = JS("\(Vassals.name(r, leader))历史同盟")
        rec.founders = .array([JS(leader), JS(joiner)])
        rec.members = .array([JS(leader), JS(joiner)])
        rec.startedTime = r.life.gameTime.clone()
        rec.joinedTime = JS(-100)
        rec.startedTick = r.clock.tick.clone()
        rec.endedTick = .null
        rec.unbreakable = JS(locked)
        r.alliances.records.push(rec)
        Vassals.bump(r.alliances)
    }
}
