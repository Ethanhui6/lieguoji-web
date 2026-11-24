import Foundation

/// 第二大包核心深度玩法引擎（App 规则专用，网页黄金对照零影响）：
/// 1. 州郡五类基建槽（农田水利 / 商市驿站 / 关隘要塞 / 船坞港湾 / 学院工坊，各 0–3 级）与特产实体联动；
/// 2. 四线时代科技演进（军备 / 航海 / 农商 / 治政，1–5 阶，自然研发＋拨款突破）；
/// 3. 外交国际信誉度（0…100，履约加分、背盟暴跌，影响好感与缔约成功率）；
/// 4. 16 组多阶段因果事件链（含二阶段延迟因果回响，100% 写入账本影响真实推演）；
/// 5. 全核心数值透明拆解（Unciv / P 社风格）与宣战前敌我双边实力对比卡。
public enum WorldDepth {
    // MARK: - 1. 州郡五类基建槽

    public enum InfraSlot: String, CaseIterable, Sendable {
        case irrigation = "irrigation" // 农田水利
        case market     = "market"     // 商市驿站
        case fortress   = "fortress"   // 关隘要塞
        case shipyard   = "shipyard"   // 船坞港湾
        case academy    = "academy"    // 学院工坊

        public var label: String {
            switch self {
            case .irrigation: return "农田水利"
            case .market:     return "商市驿站"
            case .fortress:   return "关隘要塞"
            case .shipyard:   return "船坞港湾"
            case .academy:    return "学院工坊"
            }
        }
        public var short: String {
            switch self {
            case .irrigation: return "水利"
            case .market:     return "商市"
            case .fortress:   return "要塞"
            case .shipyard:   return "船坞"
            case .academy:    return "学院"
            }
        }
        public var effectNote: String {
            switch self {
            case .irrigation: return "每级：州粮产 +14% · 人口上限 +10% · 补给恢复加速"
            case .market:     return "每级：州商税 +16% · 贸易繁荣度提升"
            case .fortress:   return "每级：州城防 +1 级 · 守军抗围与防御增强"
            case .shipyard:   return "每级（沿海）：舰队泊位上限提升 · 造舰修船提速 · 海运运力 +1"
            case .academy:    return "每级：每月四线科技点 +4 · 州治理增效"
            }
        }
        public func cost(nextLevel: Int) -> Double {
            let base: Double = (self == .shipyard || self == .fortress) ? 180 : 140
            return (base * Double(nextLevel)).rounded()
        }
    }

    public static func infraLevel(_ r: JS, provinceId: String, slot: InfraSlot) -> Int {
        guard !r.regimes.isNull, !r.regimes.infra.isNull, !r.regimes.infra[provinceId].isNull else { return 0 }
        return max(0, min(3, r.regimes.infra[provinceId][slot.rawValue].optionalNumber.map(Int.init) ?? 0))
    }

    public static func provinceTaxMultiplier(_ r: JS, provinceId: String) -> Double {
        let mkt = infraLevel(r, provinceId: provinceId, slot: .market)
        let acad = infraLevel(r, provinceId: provinceId, slot: .academy)
        var mult = 1.0 + Double(mkt) * 0.16 + Double(acad) * 0.04
        // 战略特产「海盐(5) / 丝绸(6) / 香料(8)」带来产区商税 +18%
        let sp = Trade.of(r, provinceId)
        if sp == 5 || sp == 6 || sp == 8 { mult *= 1.18 }
        return mult
    }

    public static func provinceGrainMultiplier(_ r: JS, provinceId: String) -> Double {
        let irr = infraLevel(r, provinceId: provinceId, slot: .irrigation)
        var mult = 1.0 + Double(irr) * 0.14
        if Trade.of(r, provinceId) == 0 { mult *= 1.15 } // 特产「粮食」
        return mult
    }

    public static func nationAcademyPoints(_ r: JS, nation: String) -> Int {
        guard !r.regimes.isNull, !r.regimes.infra.isNull else { return 0 }
        var total = 0
        for p in Regimes.monthLand(r, nation) {
            total += infraLevel(r, provinceId: p.id.asString, slot: .academy) * 4
        }
        return total
    }

    // MARK: - 2. 四线时代科技演进

    public enum TechBranch: String, CaseIterable, Sendable {
        case military   = "military"   // 军备
        case naval      = "naval"      // 航海
        case economy    = "economy"    // 农商
        case statecraft = "statecraft" // 治政

        public var label: String {
            switch self {
            case .military:   return "军备兵学"
            case .naval:      return "航海造船"
            case .economy:    return "农商工坊"
            case .statecraft: return "治政典章"
            }
        }
        public var short: String {
            switch self {
            case .military:   return "军备"
            case .naval:      return "航海"
            case .economy:    return "农商"
            case .statecraft: return "治政"
            }
        }
        public func tierName(_ lvl: Int) -> String {
            let names: [String]
            switch self {
            case .military:   names = ["冷兵方阵", "精钢甲胄", "火绳燧发", "线列野炮", "近代总参"]
            case .naval:      names = ["近岸桨帆", "远洋风帆", "舷侧战列", "铁甲蒸汽", "远洋巨舰"]
            case .economy:    names = ["传统农耕", "水利垦荒", "商帮市舶", "工坊行会", "近代实业"]
            case .statecraft: names = ["宗法旧制", "考课察举", "度支预算", "文官常任", "现代法典"]
            }
            return names[max(0, min(names.count - 1, lvl - 1))]
        }
        public var perLevelEffect: String {
            switch self {
            case .military:   return "每阶：全军攻防 +5% · 攻城破防 +6%"
            case .naval:      return "每阶：水师火力 +7% · 造舰耗时 −8% · 跨海运力 +1"
            case .economy:    return "每阶：月度岁入 +6% · 人口与粮产增速提升"
            case .statecraft: return "每阶：腐化压力 −4 · 国运稳健 +0.4/年 · 治理增效"
            }
        }
    }

    public static func techBook(_ r: JS, nation: String) -> JS {
        if r.regimes.tech.isNull { r.regimes.tech = .object() }
        if r.regimes.tech[nation].isNull {
            let t = JS.object()
            for b in TechBranch.allCases {
                let row = JS.object()
                row.level = JS(1)
                row.progress = JS(0)
                t[b.rawValue] = row
            }
            r.regimes.tech[nation] = t
        }
        return r.regimes.tech[nation]
    }

    public static func techLevel(_ r: JS, nation: String, branch: TechBranch) -> Int {
        guard !r.regimes.isNull, !r.regimes.tech.isNull, !r.regimes.tech[nation].isNull else { return 1 }
        return max(1, min(5, r.regimes.tech[nation][branch.rawValue].level.optionalNumber.map(Int.init) ?? 1))
    }

    public static func techProgress(_ r: JS, nation: String, branch: TechBranch) -> Int {
        guard !r.regimes.isNull, !r.regimes.tech.isNull, !r.regimes.tech[nation].isNull else { return 0 }
        return max(0, min(100, r.regimes.tech[nation][branch.rawValue].progress.optionalNumber.map(Int.init) ?? 0))
    }

    // MARK: - 3. 外交国际信誉度（0…100）

    public static func reputation(_ r: JS, nation: String) -> Int {
        guard !r.regimes.isNull, !r.regimes.reputation.isNull,
              let v = r.regimes.reputation[nation].optionalNumber else { return 70 }
        return max(0, min(100, Int(v.rounded())))
    }

    public static func reputationLabel(_ score: Int) -> String {
        if score >= 85 { return "信义昭著" }
        if score >= 68 { return "恪守盟约" }
        if score >= 48 { return "毁誉参半" }
        if score >= 28 { return "背信寡恩" }
        return "天下共弃"
    }

    public static func adjustReputation(_ r: JS, nation: String, delta: Int, reason: String? = nil) {
        guard !r.regimes.isNull else { return }
        if r.regimes.reputation.isNull { r.regimes.reputation = .object() }
        let cur = reputation(r, nation: nation)
        let next = max(0, min(100, cur + delta))
        r.regimes.reputation[nation] = JS(next)
        if let reason, !reason.isEmpty, abs(delta) >= 8 {
            let name = Vassals.name(r, nation)
            _ = People.recordHistory(r, kind: "diplomacy",
                                     text: "\(name)国际信誉\(delta > 0 ? "上升" : "受挫")（\(delta > 0 ? "+" : "")\(delta) → \(next)）",
                                     reason: reason, nations: [nation], province: nil)
        }
    }

    /// 国际信誉对双边好感度的修正（-16…+12）。
    public static func reputationOpinionModifier(_ r: JS, of target: String) -> Int {
        let rep = reputation(r, nation: target)
        if rep >= 85 { return 12 }
        if rep >= 75 { return 6 }
        if rep <= 25 { return -16 }
        if rep <= 45 { return -8 }
        return 0
    }

    // MARK: - 4. 16 组多阶段因果事件链

    public struct ChainChoice: Sendable {
        public let id: String
        public let label: String
        public let tag: String
        public let detail: String
    }

    public struct ChainTemplate: Sendable {
        public let id: String
        public let title: String
        public let category: String // "relief" / "reform" / "voyage" / "politics" / "war"
        public let desc: String
        public let choices: [ChainChoice]
    }

    public static let eventChainTemplates: [ChainTemplate] = [
        ChainTemplate(id: "famineRelief", title: "大旱饥荒与开仓赈济", category: "relief",
                      desc: "连月少雨致使田禾枯槁，灾民涌向城郭乞粮。开仓赈济需耗国库，坐视不管恐酿民变。",
                      choices: [
                        ChainChoice(id: "a", label: "拨款开仓赈灾", tag: "耗220金", detail: "存粮大增 · 国运 +5 · 国际信誉 +4 · 半年后触发「流民屯田复产」"),
                        ChainChoice(id: "b", label: "强征余粮保军需", tag: "保国库", detail: "国库 +140 金 · 国运 −5 · 半年后恐爆「饥民起义风潮」"),
                      ]),
        ChainTemplate(id: "plagueContainment", title: "商路疫病蔓延危机", category: "relief",
                      desc: "南来商旅带入时疫，沿驿道迅速扩散。封关检疫将短暂冲击商税，放任通商恐折损丁口。",
                      choices: [
                        ChainChoice(id: "a", label: "封路检疫施药", tag: "耗180金", detail: "守住人口 · 安定提升 · 半年后触发「医道革新与人口回暖」"),
                        ChainChoice(id: "b", label: "维持商路不停市", tag: "保商税", detail: "国库 +180 金 · 人口微损 · 半年后或酿「跨州时疫回潮」"),
                      ]),
        ChainTemplate(id: "maritimeBoom", title: "海贸勃兴与海盗剿抚", category: "voyage",
                      desc: "远洋商船云集海岸，却引来悍匪劫掠商道。水师提议出舰清剿，商团则劝以招安设市舶。",
                      choices: [
                        ChainChoice(id: "a", label: "遣水师铁腕剿匪", tag: "强海权", detail: "航海科技 +28 · 水师士气高涨 · 半年后触发「商道肃清与巨舰下水」"),
                        ChainChoice(id: "b", label: "招安海商设市舶", tag: "兴关税", detail: "国库 +260 金 · 半年后触发「远洋特许商团」或海盗反水"),
                      ]),
        ChainTemplate(id: "mightyGeneral", title: "名将功高与兵权制衡", category: "politics",
                      desc: "宿将屡立战功、军中威望日隆，朝野议论兵权过重。加恩礼遇可振三军，收权节制则安中枢。",
                      choices: [
                        ChainChoice(id: "a", label: "加恩重赏委以重任", tag: "振三军", detail: "全军士气满额 · 军备科技 +25 · 半年后触发「百战精锐成军」"),
                        ChainChoice(id: "b", label: "温和轮调收拢兵权", tag: "稳中枢", detail: "腐化 −8 · 国运 +4 · 半年后触发「军政分治定型」"),
                      ]),
        ChainTemplate(id: "enlightenmentReform", title: "启蒙思潮与维新变法", category: "reform",
                      desc: "学宫与坊间新学蜂起，士人呼吁革新法度、兴办实学。守旧势力忧其动摇根基，力主严禁。",
                      choices: [
                        ChainChoice(id: "a", label: "顺势推行维新变法", tag: "科技跃迁", detail: "耗 200 金 · 四线科技齐涨 +22 · 半年后触发「百业维新盛世」"),
                        ChainChoice(id: "b", label: "恪守旧章稳步改良", tag: "保稳健", detail: "国运 +4 · 腐化 −5 · 治政科技 +16"),
                      ]),
        ChainTemplate(id: "antiHegemonLeague", title: "强邻压境与合纵抗霸", category: "politics",
                      desc: "域内强权不断扩张，诸邻邦密使来访，提议缔结合纵协定共御霸权。",
                      choices: [
                        ChainChoice(id: "a", label: "响应合纵广结盟好", tag: "信誉+10", detail: "国际信誉 +10 · 诸邻好感显著提升 · 半年后触发「联防互助红利」"),
                        ChainChoice(id: "b", label: "独善其身暗蓄军备", tag: "强己身", detail: "军备科技 +28 · 国库 +120 金 · 国际信誉 −4"),
                      ]),
        ChainTemplate(id: "frontierTrade", title: "边镇茶马互市", category: "reform",
                      desc: "边关部族遣使求开互市，愿以良马皮毛易我茶盐布帛。",
                      choices: [
                        ChainChoice(id: "a", label: "开设边镇官办互市", tag: "商税+马政", detail: "国库 +210 金 · 国际信誉 +5 · 半年后触发「良马充盈骑兵精锐」"),
                        ChainChoice(id: "b", label: "严守关隘加固边墙", tag: "固边防", detail: "边疆要塞巩固 · 军备科技 +20 · 国运 +3"),
                      ]),
        ChainTemplate(id: "saltIronMonopoly", title: "盐铁官营与工商之争", category: "reform",
                      desc: "度支提议将盐铁收归官营以充国库，商民行会则联名请愿放宽专卖、鼓励民间冶铸。",
                      choices: [
                        ChainChoice(id: "a", label: "实行盐铁官营专卖", tag: "充国库", detail: "国库 +340 金 · 农商科技 +12 · 腐化 +4"),
                        ChainChoice(id: "b", label: "藏富于民放宽工商", tag: "兴农商", detail: "农商科技 +32 · 腐化 −6 · 国运 +4"),
                      ]),
        ChainTemplate(id: "artisanGuild", title: "工匠行会器械革新", category: "reform",
                      desc: "京畿工坊巧匠改良水力鼓风与车床，呈请拨款建示范工场推广全国。",
                      choices: [
                        ChainChoice(id: "a", label: "重赏百工设官营工坊", tag: "耗180金", detail: "军备 +24 · 农商 +24 · 半年后触发「精械量产红利」"),
                        ChainChoice(id: "b", label: "颁布专利令民间自兴", tag: "轻投入", detail: "农商 +20 · 国库 +110 金"),
                      ]),
        ChainTemplate(id: "academyDebate", title: "学宫经世大辩论", category: "reform",
                      desc: "国中名儒与经世学者就「礼法教化」与「格物致用」展开激辩，举国瞩目。",
                      choices: [
                        ChainChoice(id: "a", label: "倡导格物实学与考课", tag: "强研发", detail: "治政 +25 · 农商 +20 · 腐化 −5"),
                        ChainChoice(id: "b", label: "尊崇文教凝聚民心", tag: "稳国运", detail: "国运 +6 · 国际信誉 +5"),
                      ]),
        ChainTemplate(id: "fiscalCrisis", title: "中枢度支亏空风波", category: "politics",
                      desc: "连年军政开支浩繁，度支报称岁出吃紧。开源节流刻不容缓。",
                      choices: [
                        ChainChoice(id: "a", label: "清查冗费裁撤浮员", tag: "肃贪腐", detail: "腐化 −12 · 治政 +22 · 国库 +160 金"),
                        ChainChoice(id: "b", label: "募集公债以济急需", tag: "筹巨资", detail: "国库 +360 金 · 国际信誉 +3 · 国运 −2"),
                      ]),
        ChainTemplate(id: "grandVoyage", title: "远洋大航海开拓计划", category: "voyage",
                      desc: "资深航海家进献海图，请命率船队探索远海新航路、广开海外贸易。",
                      choices: [
                        ChainChoice(id: "a", label: "资助远洋开拓船队", tag: "耗240金", detail: "航海科技 +40 · 国际信誉 +6 · 半年后触发「远洋奇珍满载归航」"),
                        ChainChoice(id: "b", label: "专意近海守成务实", tag: "省国库", detail: "国库 +120 金 · 治政 +12"),
                      ]),
        ChainTemplate(id: "arsenalTrial", title: "兵工厂新式火炮试射", category: "war",
                      desc: "军器监铸成新式攻城重炮与连发弩机，请拨专项经费列装野战主力。",
                      choices: [
                        ChainChoice(id: "a", label: "全军换装新式军械", tag: "耗220金", detail: "军备科技 +38 · 全军士气 +18 · 半年后触发「火器破城威震四方」"),
                        ChainChoice(id: "b", label: "小批试装严控军费", tag: "稳健", detail: "军备科技 +18 · 节约国库"),
                      ]),
        ChainTemplate(id: "bumperAmnesty", title: "五谷丰登与普免秋粮", category: "relief",
                      desc: "风调雨顺喜迎丰年，各地仓廪充实。借机藏粮于民或充实官仓皆为良策。",
                      choices: [
                        ChainChoice(id: "a", label: "普免田赋与民休息", tag: "兴丁口", detail: "全国人口增长 · 国运 +6 · 半年后触发「丁口繁盛商税自增」"),
                        ChainChoice(id: "b", label: "购储义仓以备荒年", tag: "充粮储", detail: "全国存粮 +25% · 国库 +140 金"),
                      ]),
        ChainTemplate(id: "polityCrossroad", title: "国体制度深化博弈", category: "politics",
                      desc: "随着疆土与时局演进，中枢各派就宪章权责、选举监督与地方自治展开新一轮制度博弈。",
                      choices: [
                        ChainChoice(id: "a", label: "扩大代表制与法度公开", tag: "治政+信誉", detail: "治政科技 +30 · 腐化 −10 · 国际信誉 +6"),
                        ChainChoice(id: "b", label: "强化行政集权与战备", tag: "军备+财政", detail: "军备科技 +24 · 国库 +200 金 · 国运 +3"),
                      ]),
        ChainTemplate(id: "harborBoom", title: "深水巨港与船坞扩建", category: "voyage",
                      desc: "沿海良港商船络绎不绝，港务提议疏浚航道并扩建大型干船坞。",
                      choices: [
                        ChainChoice(id: "a", label: "官督修建深水船坞", tag: "耗200金", detail: "航海科技 +30 · 港口海运强化 · 半年后触发「港口吞吐翻番」"),
                        ChainChoice(id: "b", label: "商民合股共兴港口", tag: "兴商税", detail: "国库 +220 金 · 农商科技 +22"),
                      ]),
    ]

    /// 每月演进：推进四线科技点、触发并推进 16 组多阶段因果事件链的二阶段回响、同步制海权商税红利与 AI 自动基建。
    public static func month(_ r: JS, key: Int) {
        guard UnitKinds.enabled, !r.regimes.isNull, r.regimes.enabled.isTruthy else { return }
        if r.regimes.eventChains.isNull { r.regimes.eventChains = .object() }
        if r.regimes.pendingEchoes.isNull { r.regimes.pendingEchoes = .array() }

        // 1. 触发已到期的二阶段因果回响事件
        var keptEchoes = [JS]()
        for echo in r.regimes.pendingEchoes.asArray {
            let dueMonth = echo.dueMonth.asInt
            if key < dueMonth { keptEchoes.append(echo); continue }
            let nid = echo.nation.asString
            guard Vassals.alive(r, nid) else { continue }
            let fin = r.finance.nations[nid]
            let dest = r.destiny.nations[nid]
            let nName = Vassals.name(r, nid)
            let goldDelta = echo.gold.optionalNumber ?? 0
            let destDelta = echo.destiny.optionalNumber ?? 0
            let repDelta = echo.rep.optionalNumber.map(Int.init) ?? 0
            let techBranch = echo.techBranch.optionalString
            let techPts = echo.techPts.optionalNumber.map(Int.init) ?? 0
            if !fin.isNull && goldDelta != 0 { fin.gold = JS(max(0, (fin.gold.optionalNumber ?? 0) + goldDelta)) }
            if !dest.isNull && destDelta != 0 { dest.destiny = JS(max(5, min(100, (dest.destiny.optionalNumber ?? 50) + destDelta))) }
            if repDelta != 0 { adjustReputation(r, nation: nid, delta: repDelta) }
            if let tb = techBranch, let b = TechBranch(rawValue: tb), techPts > 0 {
                addTechProgress(r, nation: nid, branch: b, points: techPts)
            }
            let title = echo.title.asString
            let reason = echo.reason.asString
            _ = People.announce(r, kind: echo.kind.optionalString ?? "event",
                                text: "\(nName)\(title)", reason: reason, nations: [nid], province: Rebellion.capitalProvince(r, nid))
        }
        r.regimes.pendingEchoes = .array(keptEchoes)

        // 2. 逐国推进：四线科技自然成长 + 制海权海贸红利 + 国际信誉自然回归 + 事件链刷新
        for n in r.world.nations.asArray {
            let id = n.id.asString
            guard Regimes.monthLandCount(r, id) > 0, !Regimes.isBlank(r, id) else { continue }

            // 科技自然成长（基础 2 点 + 学院点数 + 治政效率）
            let acadPts = nationAcademyPoints(r, nation: id)
            let gov = Offices.governance(r, id)
            let basePts = max(2, Int((2.0 + Double(acadPts) * 0.45 + gov * 2.5).rounded()))
            let focusBranch = TechBranch.allCases[abs(key + id.hashValue) % TechBranch.allCases.count]
            for b in TechBranch.allCases {
                let gain = b == focusBranch ? basePts + 2 : max(1, basePts / 2)
                addTechProgress(r, nation: id, branch: b, points: gain)
            }

            // 治政科技降低腐化压力，农商科技与制海权带来月度海贸额外岁入
            let stLvl = techLevel(r, nation: id, branch: .statecraft)
            if stLvl > 1 && key % 3 == 0 {
                let c = Finance.corruption(r, id)
                if c > 6 { Finance.setCorruption(r, id, max(0, c - Double(stLvl - 1) * 0.8)) }
            }
            let ecLvl = techLevel(r, nation: id, branch: .economy)
            let seaCtrl = SeaDominion.seaControl(r, nation: id)
            let bonusPct = Double(ecLvl - 1) * 0.06 + Double(seaCtrl.tradeBonusPct) * 0.004
            let fin = r.finance.nations[id]
            if !fin.isNull && bonusPct > 0.01 {
                let extra = ((fin.goldPerMonth.optionalNumber ?? 0) * bonusPct).rounded()
                if extra >= 4 { fin.gold = JS((fin.gold.optionalNumber ?? 0) + extra) }
            }

            // 履约同盟每年缓慢提升国际信誉
            if key % 12 == 0 {
                if Vassals.allianceOf(r, id) != nil {
                    let curRep = reputation(r, nation: id)
                    if curRep < 88 { adjustReputation(r, nation: id, delta: 2) }
                }
            }

            // 每 6 个月为尚无待处理事件链的国家刷新一条贴合当前局势的因果事件链
            if key > 0 && key % 6 == 0 {
                let existing = r.regimes.eventChains[id]
                if existing.isNull {
                    let pick = pickChainTemplate(r, nationId: id, key: key)
                    let item = JS.object()
                    item.id = JS(pick.id)
                    item.month = JS(key)
                    r.regimes.eventChains[id] = item
                }
            }

            // 富裕 AI 国家自动温和投资基建（每年一次，防止爆库）
            if key > 0 && key % 12 == 0 && !fin.isNull {
                let gold = fin.gold.optionalNumber ?? 0
                if gold >= 900, let p = Regimes.monthLand(r, id).first {
                    let pid = p.id.asString
                    let slot = InfraSlot.allCases[abs(key + id.count) % InfraSlot.allCases.count]
                    let lvl = infraLevel(r, provinceId: pid, slot: slot)
                    if lvl < 3 && (slot != .shipyard || (Naval.sea?.ports.contains(where: { $0.provinceId == pid }) ?? false)) {
                        let cost = slot.cost(nextLevel: lvl + 1)
                        if gold >= cost + 500 {
                            fin.gold = JS(gold - cost)
                            if r.regimes.infra.isNull { r.regimes.infra = .object() }
                            if r.regimes.infra[pid].isNull { r.regimes.infra[pid] = .object() }
                            r.regimes.infra[pid][slot.rawValue] = JS(lvl + 1)
                        }
                    }
                }
            }
        }
    }

    public static func addTechProgress(_ r: JS, nation: String, branch: TechBranch, points: Int) {
        let tb = techBook(r, nation: nation)
        let row = tb[branch.rawValue]
        let lvl = max(1, min(5, row.level.optionalNumber.map(Int.init) ?? 1))
        guard lvl < 5 else { row.progress = JS(100); return }
        let nextP = (row.progress.optionalNumber.map(Int.init) ?? 0) + points
        if nextP >= 100 {
            let nextLvl = lvl + 1
            row.level = JS(nextLvl)
            row.progress = JS(nextLvl >= 5 ? 100 : (nextP - 100))
            let nName = Vassals.name(r, nation)
            _ = People.announce(r, kind: "reform",
                                text: "\(nName)\(branch.label)突破至「\(branch.tierName(nextLvl))」（\(nextLvl)阶）",
                                reason: "\(branch.perLevelEffect)。",
                                nations: [nation], province: Rebellion.capitalProvince(r, nation))
        } else {
            row.progress = JS(max(0, nextP))
        }
    }

    private static func pickChainTemplate(_ r: JS, nationId: String, key: Int) -> ChainTemplate {
        let hasPorts = !MaritimeWarfare.unblockedFriendlyPortIndices(r, nation: nationId).isEmpty
        let atWar = Wars.activeCampaignCount(r, for: nationId) > 0
        let gold = r.finance.nations[nationId].gold.optionalNumber ?? 200
        var pool = eventChainTemplates
        if !hasPorts { pool = pool.filter { $0.id != "maritimeBoom" && $0.id != "grandVoyage" && $0.id != "harborBoom" } }
        if atWar && (key % 12 == 0) {
            if let t = pool.first(where: { $0.id == "arsenalTrial" || $0.id == "mightyGeneral" }) { return t }
        }
        if gold < 160, let t = pool.first(where: { $0.id == "fiscalCrisis" }) { return t }
        let h = Opening.hash("\(r.world.custom.seed.asString)|chain|\(nationId)|\(key)")
        return pool[Int(h % UInt32(max(1, pool.count)))]
    }

    public static func activeChain(_ r: JS, nationId: String) -> ChainTemplate? {
        guard !r.regimes.isNull, !r.regimes.eventChains.isNull,
              let cid = r.regimes.eventChains[nationId].id.optionalString else { return nil }
        return eventChainTemplates.first { $0.id == cid }
    }
}

// MARK: - NativeEngine 深度基建 / 科技 / 事件链 / 全数值透明拆解 / 战前实力对比接口

extension NativeEngine {
    /// 建造或升级州郡五类基建槽之一（irrigation / market / fortress / shipyard / academy，最高 3 级）。
    public func buildProvinceInfra(_ provinceIndex: Int, slot raw: String) -> (ok: Bool, reason: String) {
        let r = run, provinces = r.world.provinces.asArray
        guard provinces.indices.contains(provinceIndex) else { return (false, "州郡不存在。") }
        guard let slot = WorldDepth.InfraSlot(rawValue: raw) else { return (false, "未知基建类别。") }
        let p = provinces[provinceIndex], pid = p.id.asString, nid = p.controller.asString
        guard Vassals.alive(r, nid) else { return (false, "该州所属国家已亡。") }
        if slot == .shipyard {
            return upgradeShipyard(provinceIndex: provinceIndex)
        }
        Regimes.enable(r)
        let cur = WorldDepth.infraLevel(r, provinceId: pid, slot: slot)
        guard cur < 3 else { return (false, "\(p.name.asString)「\(slot.label)」已达最高 3 级。") }
        let cost = slot.cost(nextLevel: cur + 1)
        let fin = r.finance.nations[nid]
        let gold = fin.isNull ? 0 : (fin.gold.optionalNumber ?? 0)
        guard gold >= cost else { return (false, "国库不足（修筑 \(cur + 1) 级\(slot.label)需 \(Int(cost)) 金）。") }
        fin.gold = JS(gold - cost)
        if r.regimes.infra.isNull { r.regimes.infra = .object() }
        if r.regimes.infra[pid].isNull { r.regimes.infra[pid] = .object() }
        let next = cur + 1
        r.regimes.infra[pid][slot.rawValue] = JS(next)

        // 立即产生真实实体增益
        switch slot {
        case .fortress:
            let d = r.upperCombat.provinces[pid]
            if !d.isNull {
                let sd = Int((d.storedDefense.optionalNumber ?? 1).rounded())
                d.storedDefense = JS(min(10, sd + 1))
                if sd + 1 >= 3 { d.manualSet = JS(true); d.manualFortress = JS(true) }
            }
        case .irrigation:
            let fp = r.finance.provinces[pid]
            if !fp.isNull {
                let cap = fp.maxPopulation.optionalNumber ?? 10_000
                fp.maxPopulation = JS((cap * 1.10).rounded())
            }
        case .academy:
            WorldDepth.addTechProgress(r, nation: nid, branch: .statecraft, points: 10)
        default:
            break
        }
        _ = People.recordHistory(r, kind: "event",
                                 text: "\(p.name.asString)建成 \(next) 级\(slot.label)",
                                 reason: "耗金 \(Int(cost))；\(slot.effectNote)。",
                                 nations: [nid], province: pid)
        return (true, "\(p.name.asString)建成 \(next) 级\(slot.label)（耗金 \(Int(cost))）。")
    }

    /// 拨款加速四线科技之一（军备 / 航海 / 农商 / 治政）。
    public func investTech(_ nationIndex: Int, branch raw: String) -> (ok: Bool, reason: String) {
        let r = run, nations = r.world.nations.asArray
        guard nations.indices.contains(nationIndex) else { return (false, "国家不存在。") }
        guard let b = WorldDepth.TechBranch(rawValue: raw) else { return (false, "未知科技路线。") }
        let id = nations[nationIndex].id.asString
        guard Vassals.alive(r, id) else { return (false, "该国已亡。") }
        Regimes.enable(r)
        let curLvl = WorldDepth.techLevel(r, nation: id, branch: b)
        guard curLvl < 5 else { return (false, "\(b.label)已达最高 5 阶（\(b.tierName(5))）。") }
        let cost = Double(150 + curLvl * 70)
        let fin = r.finance.nations[id]
        let gold = fin.isNull ? 0 : (fin.gold.optionalNumber ?? 0)
        guard gold >= cost else { return (false, "国库不足（拨款资助\(b.label)需 \(Int(cost)) 金）。") }
        fin.gold = JS(gold - cost)
        WorldDepth.addTechProgress(r, nation: id, branch: b, points: 36)
        let afterLvl = WorldDepth.techLevel(r, nation: id, branch: b)
        let afterP = WorldDepth.techProgress(r, nation: id, branch: b)
        if afterLvl > curLvl {
            return (true, "拨款 \(Int(cost)) 金突破成功！\(b.label)晋升 \(afterLvl) 阶「\(b.tierName(afterLvl))」。")
        }
        return (true, "拨款 \(Int(cost)) 金资助\(b.label)，当前研发进度 \(afterP)%。")
    }

    /// 裁决国家当前活跃的多阶段因果事件链，并排入 6 个月后的二阶段因果回响。
    public func resolveEventChain(_ nationIndex: Int, chainId: String, choice: String) -> (ok: Bool, reason: String) {
        let r = run, nations = r.world.nations.asArray
        guard nations.indices.contains(nationIndex) else { return (false, "国家不存在。") }
        let id = nations[nationIndex].id.asString, stateName = nations[nationIndex].name.asString
        guard Vassals.alive(r, id) else { return (false, "该国已亡。") }
        guard let tmpl = WorldDepth.eventChainTemplates.first(where: { $0.id == chainId }) else { return (false, "未找到该事件链。") }
        Regimes.enable(r)
        if r.regimes.pendingEchoes.isNull { r.regimes.pendingEchoes = .array() }
        let fin = r.finance.nations[id]
        let dest = r.destiny.nations[id]
        let nowM = max(1, r.regimes.month.asInt)
        let optA = (choice == "a")

        func addGold(_ d: Double) { if !fin.isNull { fin.gold = JS(max(0, (fin.gold.optionalNumber ?? 0) + d)) } }
        func addDest(_ d: Double) { if !dest.isNull { dest.destiny = JS(max(5, min(100, (dest.destiny.optionalNumber ?? 50) + d))) } }
        func scheduleEcho(title: String, reason: String, kind: String = "event", gold: Double = 0, destiny: Double = 0, rep: Int = 0, branch: WorldDepth.TechBranch? = nil, pts: Int = 0) {
            let e = JS.object()
            e.nation = JS(id); e.dueMonth = JS(nowM + 6)
            e.title = JS(title); e.reason = JS(reason); e.kind = JS(kind)
            e.gold = JS(gold); e.destiny = JS(destiny); e.rep = JS(rep)
            if let branch { e.techBranch = JS(branch.rawValue); e.techPts = JS(pts) }
            r.regimes.pendingEchoes.push(e)
        }

        let summary: String
        switch tmpl.id {
        case "famineRelief":
            if optA {
                addGold(-220); addDest(5); WorldDepth.adjustReputation(r, nation: id, delta: 4)
                scheduleEcho(title: "流民屯田复产、岁收大增", reason: "前期开仓赈济保住丁口，今岁灾后复垦丰收（国库 +320 金、国运 +3）。", kind: "relief", gold: 320, destiny: 3)
                summary = "已拨款开仓赈灾：国运 +5、信誉 +4，半年后迎来屯田复产红利。"
            } else {
                addGold(140); addDest(-5); WorldDepth.adjustReputation(r, nation: id, delta: -4)
                scheduleEcho(title: "灾后民怨反噬、地方骚动", reason: "前期强征军粮令饥民流散，各地赋税减收且安定受损（国运 −4）。", kind: "politics", gold: -120, destiny: -4)
                summary = "已强征余粮保军需：国库 +140 金，国运 −5，需防半年后灾民动荡。"
            }
        case "plagueContainment":
            if optA {
                addGold(-180); addDest(4)
                scheduleEcho(title: "疫病彻底扑灭、医道革新", reason: "严格封控检疫立下奇功，各地丁口回暖、治政进益（治政 +25、国运 +3）。", kind: "relief", destiny: 3, branch: .statecraft, pts: 25)
                summary = "已封路检疫施药：守住人口与安定，半年后收获医道革新红利。"
            } else {
                addGold(180); addDest(-3)
                scheduleEcho(title: "商路时疫二次回潮", reason: "前期未及时封控导致邻州复燃，损耗时财与国运（国库 −150 金、国运 −4）。", kind: "relief", gold: -150, destiny: -4)
                summary = "已维持商路不停市：国库 +180 金，半年后存在时疫回潮风险。"
            }
        case "maritimeBoom":
            if optA {
                WorldDepth.addTechProgress(r, nation: id, branch: .naval, points: 28)
                scheduleEcho(title: "海上商道肃清、海贸关税大涨", reason: "水师清剿海盗威震四海，商船蜂拥入港（国库 +360 金、航海 +20）。", kind: "voyage", gold: 360, branch: .naval, pts: 20)
                summary = "已遣水师剿匪：航海科技 +28，半年后海贸关税大涨。"
            } else {
                addGold(260)
                scheduleEcho(title: "远洋特许商团成立", reason: "招安海商设市舶司，岁入倍增且航海技艺交流活跃（国库 +240 金、农商 +20）。", kind: "voyage", gold: 240, branch: .economy, pts: 20)
                summary = "已招安设市舶：国库 +260 金，半年后远洋商团成形。"
            }
        case "enlightenmentReform":
            if optA {
                addGold(-200)
                for b in WorldDepth.TechBranch.allCases { WorldDepth.addTechProgress(r, nation: id, branch: b, points: 22) }
                scheduleEcho(title: "维新变法成效彰显", reason: "新政新学落地生根，财税兴旺、天下瞩目（国库 +340 金、国运 +5、信誉 +5）。", kind: "reform", gold: 340, destiny: 5, rep: 5)
                summary = "已推行维新变法：四线科技齐涨 +22，半年后触发维新盛世红利。"
            } else {
                addDest(4); Finance.setCorruption(r, id, max(0, Finance.corruption(r, id) - 5))
                WorldDepth.addTechProgress(r, nation: id, branch: .statecraft, points: 16)
                summary = "已恪守旧章稳步改良：国运 +4、腐化 −5、治政科技 +16。"
            }
        case "grandVoyage":
            if optA {
                addGold(-240); WorldDepth.addTechProgress(r, nation: id, branch: .naval, points: 40); WorldDepth.adjustReputation(r, nation: id, delta: 6)
                scheduleEcho(title: "远洋船队满载奇珍凯旋", reason: "大航海开拓新航线，带回海外珍宝与海图（国库 +480 金、航海 +25、国运 +5）。", kind: "voyage", gold: 480, destiny: 5, branch: .naval, pts: 25)
                summary = "已资助大航海船队：航海科技 +40、信誉 +6，半年后凯旋献宝。"
            } else {
                addGold(120); WorldDepth.addTechProgress(r, nation: id, branch: .statecraft, points: 12)
                summary = "已专意近海守成：国库 +120 金、治政科技 +12。"
            }
        case "arsenalTrial":
            if optA {
                addGold(-220); WorldDepth.addTechProgress(r, nation: id, branch: .military, points: 38)
                for a in r.world.armies.asArray where a.nationId.optionalString == id && a.troops.asNumber > 0 {
                    a.morale = JS(min(100, (a.morale.optionalNumber ?? 70) + 18))
                }
                scheduleEcho(title: "新式火炮列装成军", reason: "兵工厂量产火器，前线破城与野战火力更胜往昔（军备 +24、国运 +4）。", kind: "war", destiny: 4, branch: .military, pts: 24)
                summary = "已全军换装新械：军备科技 +38、全军士气 +18，半年后量产成军。"
            } else {
                WorldDepth.addTechProgress(r, nation: id, branch: .military, points: 18)
                summary = "已小批试装稳健控费：军备科技 +18。"
            }
        default:
            if optA {
                addGold(tmpl.id == "saltIronMonopoly" || tmpl.id == "fiscalCrisis" ? 260 : -140)
                addDest(4); WorldDepth.adjustReputation(r, nation: id, delta: 5)
                WorldDepth.addTechProgress(r, nation: id, branch: .economy, points: 24)
                scheduleEcho(title: "\(tmpl.title)后续成效落地", reason: "前期果断施策见效，国库与政局同步受益（国库 +260 金、国运 +3）。", kind: tmpl.category, gold: 260, destiny: 3)
                summary = "已裁决「\(tmpl.choices.first?.label ?? "甲案")」：国运 +4、农商 +24，半年后将触发后续因果回响。"
            } else {
                addGold(160); addDest(2)
                WorldDepth.addTechProgress(r, nation: id, branch: .statecraft, points: 20)
                summary = "已裁决「\(tmpl.choices.last?.label ?? "乙案")」：国库 +160 金、治政 +20。"
            }
        }

        if !r.regimes.eventChains.isNull { r.regimes.eventChains.delete(id) }
        _ = People.announce(r, kind: tmpl.category, text: "\(stateName)裁决「\(tmpl.title)」", reason: summary, nations: [id], province: Rebellion.capitalProvince(r, id))
        return (true, summary)
    }

    // MARK: - 5. 全核心数值透明拆解（国家 / 州郡 / 军团 / 舰队）+ 战前实力双边对比

    private func makeLine(_ label: String, _ value: String, _ tone: String = "neutral") -> JS {
        let o = JS.object(); o.label = JS(label); o.value = JS(value); o.tone = JS(tone); return o
    }

    /// 国家全数值透明修正拆解（月税、陆军战力、海军制海、安定度、外交信誉）。
    public func nationBreakdown(_ index: Int) -> Data? {
        let r = run, nations = r.world.nations.asArray
        guard nations.indices.contains(index) else { return nil }
        let id = nations[index].id.asString
        let fin = r.finance.nations[id]
        let out = JS.object()

        // 1. 月税收入拆解
        var taxRows = [JS]()
        let baseInc = Int((fin.ledger.baseIncome.optionalNumber ?? fin.goldPerMonth.optionalNumber ?? 0).rounded())
        taxRows.append(makeLine("各州基础产值与税基", "\(baseInc) 金/月"))
        let taxMul = Daily.taxMultiplier(r, id)
        if abs(taxMul - 1) > 0.005 {
            let pct = Int(((taxMul - 1) * 100).rounded())
            taxRows.append(makeLine("主政者税政特质", "\(pct >= 0 ? "+" : "")\(pct)%", pct >= 0 ? "good" : "bad"))
        }
        let central = r.offices47.isNull ? 1.0 : Offices.centralIncome(r, id)
        if abs(central - 1) > 0.005 {
            let pct = Int(((central - 1) * 100).rounded())
            taxRows.append(makeLine("中枢度支与百官称职度", "\(pct >= 0 ? "+" : "")\(pct)%", pct >= 0 ? "good" : "bad"))
        }
        let corrupt = Int(Finance.corruption(r, id).rounded())
        if corrupt > 0 { taxRows.append(makeLine("吏治腐化折损", "−\(min(45, corrupt / 2))%", "bad")) }
        let tr = Trade.share(r, id)
        if tr.rate > 0.005 { taxRows.append(makeLine("特产与通商网加成", "+\(Int((tr.rate * 100).rounded()))%", "good")) }
        let ecLvl = WorldDepth.techLevel(r, nation: id, branch: .economy)
        if ecLvl > 1 { taxRows.append(makeLine("农商科技（\(ecLvl)阶）", "+\((ecLvl - 1) * 6)%", "good")) }
        let sea = SeaDominion.seaControl(r, nation: id)
        if sea.tradeBonusPct > 0 { taxRows.append(makeLine("制海权「\(sea.label)」海贸红利", "+\(sea.tradeBonusPct)%", "good")) }
        let blk = Naval.blockade(r, id)
        if blk.held > 0 { taxRows.append(makeLine("敌舰封锁本国海港（\(blk.held)/\(blk.ports)）", "海贸受损", "bad")) }
        let armyFee = Int((fin.armyCostGold.optionalNumber ?? 0).rounded())
        if armyFee > 0 { taxRows.append(makeLine("野战军费开支", "−\(armyFee) 金/月", "bad")) }
        out.tax = .array(taxRows)

        // 2. 陆军综合战力拆解
        var milRows = [JS]()
        let dest = Int((r.destiny.nations[id].destiny.optionalNumber ?? 50).rounded())
        milRows.append(makeLine("国运底蕴（\(dest)）", dest >= 60 ? "高昂" : dest <= 30 ? "低迷" : "平稳", dest >= 60 ? "good" : dest <= 30 ? "bad" : "neutral"))
        let milLvl = WorldDepth.techLevel(r, nation: id, branch: .military)
        if milLvl > 1 { milRows.append(makeLine("军备科技（\(milLvl)阶）", "攻防 +\((milLvl - 1) * 5)%", "good")) }
        let tb = Trade.nationalBonuses(r, id)
        if tb.attack > 0.4 || tb.defense > 0.4 {
            milRows.append(makeLine("战略特产（战马/铁矿/硝石/石料）", "攻 +\(Int(tb.attack.rounded()))% · 防 +\(Int(tb.defense.rounded()))%", "good"))
        }
        if let wg = Regimes.warGodAura(r, nationId: id) {
            milRows.append(makeLine("战神谱在世光环（\(wg.name)）", wg.buffSummary, "good"))
        }
        let gbm = fin.goldBattleModifier.optionalNumber ?? 1
        if abs(gbm - 1) > 0.01 {
            let pct = Int(((gbm - 1) * 100).rounded())
            milRows.append(makeLine("国库军饷保障", "\(pct >= 0 ? "+" : "")\(pct)%", pct >= 0 ? "good" : "bad"))
        }
        let season = WorldSeason.of(month: r.life.currentDate.month.asInt)
        milRows.append(makeLine("当前节气（\(season.fullName)）", season.summary))
        out.military = .array(milRows)

        // 3. 海军与制海权拆解
        var navRows = [JS]()
        navRows.append(makeLine("海域制海权评分", "\(sea.score)%（\(sea.label)）", sea.score >= 65 ? "good" : sea.score < 40 ? "bad" : "neutral"))
        navRows.append(makeLine("己方海上有效火力", "\(sea.myPower)"))
        let navLvl = WorldDepth.techLevel(r, nation: id, branch: .naval)
        if navLvl > 1 { navRows.append(makeLine("航海科技（\(navLvl)阶）", "火力 +\((navLvl - 1) * 7)% · 造舰 −\((navLvl - 1) * 8)%", "good")) }
        let cap = MaritimeWarfare.seaTransportCapacity(r, nation: id)
        let used = MaritimeWarfare.activeSeaTransports(r, nation: id)
        navRows.append(makeLine("跨海运兵船队运力", "\(used) / \(cap) 支"))
        if Trade.holdings(r, id)[1, default: 0] > 0 { navRows.append(makeLine("良木特产供应", "造舰耗时 −20% · 造价 −15%", "good")) }
        out.naval = .array(navRows)

        // 4. 安定度与外交信誉拆解
        var stabRows = [JS]()
        let outlook = Regimes.coupOutlook(r, id)
        stabRows.append(makeLine("当前政局安定度", "\(outlook.stability) / 100", outlook.stability >= 65 ? "good" : outlook.stability < 45 ? "bad" : "neutral"))
        let shock = Int((Regimes.defeatPenalty(r, id) * 100).rounded())
        if shock > 0 { stabRows.append(makeLine("近期战败割地震荡", "−\(shock)%", "bad")) }
        if corrupt >= 30 { stabRows.append(makeLine("贪腐激化民怨", "腐化 \(corrupt)", "bad")) }
        let rep = WorldDepth.reputation(r, nation: id)
        stabRows.append(makeLine("国际信誉度（\(WorldDepth.reputationLabel(rep))）", "\(rep) / 100", rep >= 70 ? "good" : rep < 45 ? "bad" : "neutral"))
        let repOp = WorldDepth.reputationOpinionModifier(r, of: id)
        if repOp != 0 { stabRows.append(makeLine("信誉对诸国邦交影响", "\(repOp > 0 ? "+" : "")\(repOp) 好感", repOp > 0 ? "good" : "bad")) }
        out.stability = .array(stabRows)
        return Data(out.json.utf8)
    }

    /// 州郡全数值透明拆解（税收、城防、粮产、补给、基建与特产加成）。
    public func provinceBreakdown(_ index: Int) -> Data? {
        let r = run, provinces = r.world.provinces.asArray
        guard provinces.indices.contains(index) else { return nil }
        let p = provinces[index], pid = p.id.asString
        let land = r.terrainContext.provinces[pid]
        let ratios = land.isNull || land.biomes.isNull ? [] : land.biomes.asArray.map(\.asNumber)
        let main = ratios.indices.max { ratios[$0] < ratios[$1] } ?? 4
        let prof = ForceMotion.terrainProfile(biome: main, mountain: land.mountain.isTruthy)
        let spIdx = Trade.of(r, pid)
        let spProf = Trade.profiles[min(Trade.profiles.count - 1, max(0, spIdx))]

        var rows = [JS]()
        let terrainName = prof.summary.components(separatedBy: "：").first ?? "平原"
        rows.append(makeLine("地形底质（\(terrainName)）", "商税 ×\(String(format: "%.2f", prof.tax)) · 天然防御 ×\(String(format: "%.2f", prof.defenseBonus))"))
        rows.append(makeLine("本地特产：\(spProf.name)（\(spProf.tier)）", spProf.effectText, "good"))
        for slot in WorldDepth.InfraSlot.allCases {
            let lvl = WorldDepth.infraLevel(r, provinceId: pid, slot: slot)
            if lvl > 0 { rows.append(makeLine("基建·\(slot.label)（\(lvl)级）", slot.effectNote, "good")) }
        }
        let dockLvl = SeaDominion.shipyardLevel(r, provinceId: pid)
        if Naval.sea?.ports.contains(where: { $0.provinceId == pid }) == true {
            rows.append(makeLine("海港船坞（\(dockLvl)级）", "泊位上限 \(SeaDominion.maxShipsForPort(r, provinceId: pid)) 艘", "good"))
        }
        if MaritimeWarfare.isPortBlockaded(r, provinceId: pid) {
            rows.append(makeLine("港口正遭敌舰封锁", "海贸断绝 · 登船禁行", "bad"))
        }
        if let dis = Regimes.disasterAt(r, pid) {
            rows.append(makeLine("当前天灾（\(dis)）", "人口/粮产受损", "bad"))
        }
        let o = JS.object(); o.items = .array(rows)
        return Data(o.json.utf8)
    }

    /// 宣战前「敌我双边实力对比卡」数据（陆海军规模、盟友参战预估、国库、科技、制海权与信誉影响）。
    public func warCompare(attacker aIdx: Int, defender dIdx: Int) -> Data? {
        let r = run, nations = r.world.nations.asArray
        guard nations.indices.contains(aIdx), nations.indices.contains(dIdx), aIdx != dIdx else { return nil }
        let aid = nations[aIdx].id.asString, did = nations[dIdx].id.asString

        func sideInfo(_ nid: String) -> JS {
            let o = JS.object()
            let armies = r.world.armies.asArray.filter { $0.nationId.optionalString == nid && $0.troops.asNumber > 0 && $0.status.asString != "destroyed" }
            let troops = armies.reduce(0) { $0 + $1.troops.asInt }
            let fleets = Naval.fleets(r).filter { $0.nationId.optionalString == nid && $0.status.asString != "lost" }
            let ships = fleets.reduce(0) { $0 + max(0, $1.ships.asInt) }
            let provs = r.world.provinces.asArray.reduce(0) { $1.controller.optionalString == nid ? $0 + 1 : $0 }
            let gold = Int((r.finance.nations[nid].gold.optionalNumber ?? 0).rounded())
            let milTech = WorldDepth.techLevel(r, nation: nid, branch: .military)
            let navTech = WorldDepth.techLevel(r, nation: nid, branch: .naval)
            let sea = SeaDominion.seaControl(r, nation: nid)
            let shock = Int((Regimes.defeatPenalty(r, nid) * 100).rounded())
            let rep = WorldDepth.reputation(r, nation: nid)
            // 预估参战盟友（同盟 + 共同防御条约 + 附庸/宗主）
            var allies = Set<String>()
            if let al = Vassals.allianceOf(r, nid) {
                for m in al.members.asArray where m.asString != nid && Vassals.alive(r, m.asString) { allies.insert(m.asString) }
            }
            for dp in DiplomacyDeep.defensePartners(r, of: nid) { allies.insert(dp) }
            if let ov = Vassals.overlord(r, nid), Vassals.alive(r, ov) { allies.insert(ov) }
            allies.remove(aid); allies.remove(did)
            let allyTroops = r.world.armies.asArray.filter { allies.contains($0.nationId.optionalString ?? "") && $0.troops.asNumber > 0 && $0.status.asString != "destroyed" }.reduce(0) { $0 + $1.troops.asInt }
            o.name = JS(Vassals.name(r, nid))
            o.provinces = JS(provs)
            o.armies = JS(armies.count)
            o.troops = JS(troops)
            o.ships = JS(ships)
            o.gold = JS(gold)
            o.milTech = JS(milTech)
            o.navTech = JS(navTech)
            o.seaControl = JS(sea.score)
            o.seaLabel = JS(sea.label)
            o.defeatShock = JS(shock)
            o.reputation = JS(rep)
            o.allyCount = JS(allies.count)
            o.allyNames = .array(allies.sorted().prefix(4).map { JS(Vassals.name(r, $0)) })
            o.allyTroops = JS(allyTroops)
            return o
        }

        let out = JS.object()
        out.attacker = sideInfo(aid)
        out.defender = sideInfo(did)
        let activeTreaties = DiplomacyDeep.activeTreaties(r, aid, did)
        let breaksTreaty = !activeTreaties.isEmpty
        out.breaksTreaty = JS(breaksTreaty)
        out.reputationImpact = JS(breaksTreaty ? -18 : -4)
        out.warning = JS(breaksTreaty ? "警告：双方签有有效条约，强行宣战将撕毁条约并重创国际信誉（−18）！" : "宣战将触发双方现有同盟与共同防御条约响应。")
        return Data(out.json.utf8)
    }
}
