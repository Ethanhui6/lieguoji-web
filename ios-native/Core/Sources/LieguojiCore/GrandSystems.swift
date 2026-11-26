import Foundation

/// v5.1.0 深度大战略扩展体系（App 规则专用，完全隔离于网页逐字节对照测试）：
/// 1. 天下奇观与国家大工程（12 座全球唯一传世奇观：选州动工、逐月修建、跨国竞建、攻占易主、真实全局光环）；
/// 2. 国家霸业使命（8 条可追踪可领赏历史目标线，终结沙盒中后期迷茫感）；
/// 3. 国家黄金盛世（60 个月全方位跃升爆发期，高潮感十足）；
/// 4. 天下雇佣兵团（6 支传世特色精锐佣兵，战时应急直募都城、自带高士气高历练投入实战）。
public enum GrandSystems {

    // MARK: - 1. 天下奇观与国家大工程（12 座传世工程）

    public struct WonderSpec: Sendable, Identifiable {
        public let id: String
        public let name: String
        public let category: String
        public let cost: Double
        public let months: Int
        public let coastalOnly: Bool
        public let effectLine: String
        public let flavor: String
        public let attack: Double
        public let defense: Double
        public let income: Double
        public let growth: Double
        public let stability: Double
        public let corruption: Double
        public let seaTransport: Int
    }

    public static let wonders: [WonderSpec] = [
        WonderSpec(id: "greatWall", name: "万里边城", category: "军事", cost: 720, months: 14, coastalOnly: false,
                   effectLine: "守御 +18% · 安定 +10 · 竣工即强化边塞城防",
                   flavor: "依山险筑雄关烽燧，锁钥万里边疆。",
                   attack: 0, defense: 18, income: 0, growth: 0, stability: 10, corruption: 0, seaTransport: 0),
        WonderSpec(id: "grandCanal", name: "通济大运河", category: "经济", cost: 680, months: 14, coastalOnly: false,
                   effectLine: "岁入 +22% · 人口年增 +3% · 全国存粮大增",
                   flavor: "贯通南北水系，千帆转漕京畿。",
                   attack: 0, defense: 0, income: 22, growth: 3.0, stability: 4, corruption: -2, seaTransport: 0),
        WonderSpec(id: "forbiddenPalace", name: "万国皇城", category: "朝政", cost: 800, months: 16, coastalOnly: false,
                   effectLine: "安定 +18 · 腐化 −12 · 攻防 +8% · 信誉 +15",
                   flavor: "重檐宏殿镇压四极，万邦来朝仰望声威。",
                   attack: 8, defense: 8, income: 6, growth: 0, stability: 18, corruption: -12, seaTransport: 0),
        WonderSpec(id: "imperialArsenal", name: "神机军器监", category: "军事", cost: 640, months: 12, coastalOnly: false,
                   effectLine: "全军进攻 +18% · 主力每月自动增历练",
                   flavor: "天下巧匠云集铸甲造炮，兵锋所指无坚不摧。",
                   attack: 18, defense: 4, income: -2, growth: 0, stability: 0, corruption: 0, seaTransport: 0),
        WonderSpec(id: "grandAcademy", name: "稷下太学宫", category: "文教", cost: 600, months: 12, coastalOnly: false,
                   effectLine: "腐化 −10 · 岁入 +12% · 安定 +8 · 科技加速",
                   flavor: "广纳海内大儒俊彦，格物致知、经世济民。",
                   attack: 0, defense: 0, income: 12, growth: 1.5, stability: 8, corruption: -10, seaTransport: 0),
        WonderSpec(id: "royalShipyard", name: "宝船大船坞", category: "海权", cost: 620, months: 12, coastalOnly: true,
                   effectLine: "跨海运力 +3 · 岁入 +14% · 进攻 +8%",
                   flavor: "巨舰楼船连舻下水，纵横大洋无远弗届。",
                   attack: 8, defense: 4, income: 14, growth: 0, stability: 0, corruption: 0, seaTransport: 3),
        WonderSpec(id: "silkExchange", name: "万邦丝路商馆", category: "经济", cost: 580, months: 10, coastalOnly: false,
                   effectLine: "全国岁入 +24% · 国际信誉 +12",
                   flavor: "汇聚东西百货金银，天下商旅莫不趋之。",
                   attack: 0, defense: 0, income: 24, growth: 1.0, stability: 2, corruption: 2, seaTransport: 0),
        WonderSpec(id: "heavenAltar", name: "圜丘圣坛", category: "文教", cost: 560, months: 10, coastalOnly: false,
                   effectLine: "安定 +16 · 守御 +10% · 每季国运 +2",
                   flavor: "祭天祈年、凝聚礼法，社稷安稳人心归附。",
                   attack: 0, defense: 10, income: 0, growth: 1.0, stability: 16, corruption: -4, seaTransport: 0),
        WonderSpec(id: "greatLighthouse", name: "沧溟大灯塔", category: "海权", cost: 520, months: 10, coastalOnly: true,
                   effectLine: "跨海运力 +2 · 岁入 +16% · 守御 +8%",
                   flavor: "巨焰彻夜照耀航道，护佑远洋商舶与水师归航。",
                   attack: 0, defense: 8, income: 16, growth: 0, stability: 4, corruption: 0, seaTransport: 2),
        WonderSpec(id: "steppeStud", name: "天马监牧场", category: "军事", cost: 540, months: 10, coastalOnly: false,
                   effectLine: "全军进攻 +14% · 人口年增 +2%",
                   flavor: "精选万里良驹广育铁骑，野战奔袭如风。",
                   attack: 14, defense: 4, income: 4, growth: 2.0, stability: 0, corruption: 0, seaTransport: 0),
        WonderSpec(id: "everNormalVault", name: "天下常平万仓", category: "经济", cost: 500, months: 9, coastalOnly: false,
                   effectLine: "人口年增 +4% · 安定 +10 · 荒年免饥",
                   flavor: "丰岁籴谷、凶年赈济，仓廪丰盈万民安居。",
                   attack: 0, defense: 4, income: 6, growth: 4.0, stability: 10, corruption: -4, seaTransport: 0),
        WonderSpec(id: "imperialObservatory", name: "观星司天监", category: "文教", cost: 560, months: 11, coastalOnly: false,
                   effectLine: "腐化 −8 · 岁入 +12% · 攻 +6% · 守 +10%",
                   flavor: "推步历象、测绘山海，开启大航海与火器新纪元。",
                   attack: 6, defense: 10, income: 12, growth: 0, stability: 6, corruption: -8, seaTransport: 0),
    ]

    public static let wonderById: [String: WonderSpec] = Dictionary(uniqueKeysWithValues: wonders.map { ($0.id, $0) })

    // MARK: - 2. 国家霸业使命（8 条可追踪可领赏历史目标）

    public struct MissionSpec: Sendable, Identifiable {
        public let id: String
        public let title: String
        public let category: String
        public let goalText: String
        public let rewardText: String
    }

    public static let missions: [MissionSpec] = [
        MissionSpec(id: "expandRealm", title: "开疆拓土", category: "扩张", goalText: "实控州郡达到 10 州以上", rewardText: "国库 +900 金 · 国运 +10 · 全军历练 +18"),
        MissionSpec(id: "mightyArmy", title: "虎狼之师", category: "军事", goalText: "现役总兵力达 3.0 万或拥有 5 支大军", rewardText: "全军满士气 · 统帅武略 +6 · 国库 +600 金"),
        MissionSpec(id: "richTreasury", title: "府库充盈", category: "经济", goalText: "国库积蓄达 2,500 金", rewardText: "腐化 −12 · 全境存粮 +30% · 国运 +8"),
        MissionSpec(id: "seaDominion", title: "四海扬帆", category: "海权", goalText: "拥现役战船 8 艘或海港 3 处以上", rewardText: "跨海运力 +3 · 国库 +800 金 · 信誉 +10"),
        MissionSpec(id: "cleanCourt", title: "海晏河清", category: "内治", goalText: "腐化低于 18 且国运不低于 70", rewardText: "四线科技各 +40 进度 · 国库 +500 金"),
        MissionSpec(id: "diplomaticLead", title: "纵横天下", category: "外交", goalText: "缔结同盟或拥有附庸，或国际信誉 ≥ 68", rewardText: "诸国好感 +15 · 国库 +600 金 · 国运 +8"),
        MissionSpec(id: "wonderBuilder", title: "千秋伟业", category: "工程", goalText: "建成并控制至少 1 座天下奇观", rewardText: "国库 +1,200 金 · 国际信誉 +15 · 国运 +12"),
        MissionSpec(id: "worldHegemon", title: "天下共主", category: "霸业", goalText: "跻身天下疆域前二强且实控 ≥ 12 州", rewardText: "免费开启 5 年黄金盛世 · 国库 +1,500 金"),
    ]

    // MARK: - 3. 天下雇佣兵团（6 支传世特色佣兵）

    public struct MercSpec: Sendable, Identifiable {
        public let id: String
        public let name: String
        public let unit: String
        public let troops: Int
        public let xp: Int
        public let cost: Double
        public let note: String
    }

    public static let mercenaries: [MercSpec] = [
        MercSpec(id: "xuanjia", name: "玄甲铁骑团", unit: "HeavyCavalry", troops: 4800, xp: 45, cost: 380, note: "披甲重骑 · 平原冲阵破敌如潮"),
        MercSpec(id: "swissPike", name: "瑞士长枪团", unit: "Landsknecht", troops: 5500, xp: 45, cost: 340, note: "长枪方阵 · 专克重骑与战象冲锋"),
        MercSpec(id: "venetianXbow", name: "威尼斯强弩团", unit: "Crossbow", troops: 4600, xp: 45, cost: 340, note: "强弩穿甲 · 攻守兼备压制重甲"),
        MercSpec(id: "varangian", name: "瓦良格斧卫队", unit: "Berserker", troops: 4400, xp: 55, cost: 420, note: "百战精锐 · 悍不畏死死战护国"),
        MercSpec(id: "mamlukGuard", name: "马穆鲁克近卫", unit: "Mamluk", troops: 4500, xp: 50, cost: 390, note: "铁甲马兵 · 机动凌厉长途突袭"),
        MercSpec(id: "thunderCorps", name: "神机火器营", unit: "Streltsy", troops: 4200, xp: 60, cost: 440, note: "火绳齐射 · 火力威猛破阵克城"),
    ]

    public static let mercById: [String: MercSpec] = Dictionary(uniqueKeysWithValues: mercenaries.map { ($0.id, $0) })

    // MARK: - 4. 四海探索与古迹远征（10 处传世秘境古迹，耗时 4 月探索，发掘后获永久古迹增益与宝藏）

    public struct ExpeditionSite: Sendable, Identifiable {
        public let id: String
        public let name: String
        public let regionKind: String
        public let cost: Double
        public let months: Int
        public let rewardLine: String
        public let flavor: String
        public let goldReward: Double
        public let techBranch: WorldDepth.TechBranch
        public let techPts: Int
        public let attack: Double
        public let defense: Double
        public let income: Double
        public let growth: Double
        public let stability: Double
        public let corruption: Double
        public let seaTransport: Int
    }

    public static let expeditions: [ExpeditionSite] = [
        ExpeditionSite(id: "kunlunRuins", name: "昆仑古秘境", regionKind: "峻岭", cost: 160, months: 4,
                       rewardLine: "永久攻 +5% · 守 +5% · 军备科技 +30 · 国运 +5",
                       flavor: "雪峰深处流传上古兵家石刻与玄铁炉遗址。",
                       goldReward: 220, techBranch: .military, techPts: 30, attack: 5, defense: 5, income: 0, growth: 0, stability: 2, corruption: 0, seaTransport: 0),
        ExpeditionSite(id: "penglaiIsle", name: "蓬莱海外仙洲", regionKind: "海域", cost: 160, months: 4,
                       rewardLine: "跨海运力 +1 · 永久岁入 +6% · 航海科技 +35",
                       flavor: "雾霭重洋之外隐现古航路灯塔与珍稀药林。",
                       goldReward: 280, techBranch: .naval, techPts: 35, attack: 0, defense: 0, income: 6, growth: 1.0, stability: 2, corruption: 0, seaTransport: 1),
        ExpeditionSite(id: "sunkenCapital", name: "沉没古都遗迹", regionKind: "遗迹", cost: 160, months: 4,
                       rewardLine: "宝藏 +420 金 · 永久岁入 +8% · 治政科技 +28",
                       flavor: "古河道改道掩埋的旧朝金库与石碑典章。",
                       goldReward: 420, techBranch: .statecraft, techPts: 28, attack: 0, defense: 0, income: 8, growth: 0, stability: 3, corruption: -2, seaTransport: 0),
        ExpeditionSite(id: "loulanOasis", name: "大漠楼兰古城", regionKind: "丝路", cost: 160, months: 4,
                       rewardLine: "宝藏 +380 金 · 永久岁入 +7% · 农商科技 +32",
                       flavor: "风沙下的商队故城，留存东西方失传商路秘图。",
                       goldReward: 380, techBranch: .economy, techPts: 32, attack: 0, defense: 0, income: 7, growth: 0.5, stability: 2, corruption: -1, seaTransport: 0),
        ExpeditionSite(id: "arcticTomb", name: "极北冰原古墓", regionKind: "边塞", cost: 160, months: 4,
                       rewardLine: "永久守御 +8% · 军备科技 +28 · 全军历练 +10",
                       flavor: "冻土之下埋藏远古北境战王甲胄与铁骑阵图。",
                       goldReward: 200, techBranch: .military, techPts: 28, attack: 3, defense: 8, income: 0, growth: 0, stability: 0, corruption: 0, seaTransport: 0),
        ExpeditionSite(id: "jungleTemple", name: "雨林失落神庙", regionKind: "秘林", cost: 160, months: 4,
                       rewardLine: "宝藏 +360 金 · 永久安定 +6 · 腐化 −4 · 治政 +25",
                       flavor: "密林深处的石造天文神殿，铭刻历法与治世铭文。",
                       goldReward: 360, techBranch: .statecraft, techPts: 25, attack: 0, defense: 0, income: 3, growth: 1.0, stability: 6, corruption: -4, seaTransport: 0),
        ExpeditionSite(id: "silkCanyon", name: "丝路宝藏峡谷", regionKind: "关隘", cost: 160, months: 4,
                       rewardLine: "宝藏 +460 金 · 永久岁入 +6% · 农商科技 +30",
                       flavor: "千佛石窟与商旅密道纵横，藏有历代西域珍玩。",
                       goldReward: 460, techBranch: .economy, techPts: 30, attack: 0, defense: 3, income: 6, growth: 0, stability: 0, corruption: 0, seaTransport: 0),
        ExpeditionSite(id: "spiceArchipelago", name: "远洋香料群岛", regionKind: "远洋", cost: 160, months: 4,
                       rewardLine: "跨海运力 +1 · 宝藏 +340 金 · 永久岁入 +8% · 航海 +32",
                       flavor: "季风吹拂的热带列岛，盛产万邦垂涎的珍贵香料。",
                       goldReward: 340, techBranch: .naval, techPts: 32, attack: 0, defense: 0, income: 8, growth: 0.5, stability: 0, corruption: 0, seaTransport: 1),
        ExpeditionSite(id: "warScrollCave", name: "古兵书石窟", regionKind: "名山", cost: 160, months: 4,
                       rewardLine: "永久全军进攻 +8% · 军备科技 +36 · 统帅武略 +4",
                       flavor: "绝壁石室封存失传古兵法竹简与攻城机巧图纸。",
                       goldReward: 180, techBranch: .military, techPts: 36, attack: 8, defense: 2, income: 0, growth: 0, stability: 0, corruption: 0, seaTransport: 0),
        ExpeditionSite(id: "starIronVein", name: "星陨精铁矿脉", regionKind: "奇矿", cost: 160, months: 4,
                       rewardLine: "永久攻 +6% · 守 +6% · 岁入 +4% · 军备科技 +28",
                       flavor: "天外陨铁坠落古谷，冶炼百炼钢甲锐不可当。",
                       goldReward: 260, techBranch: .military, techPts: 28, attack: 6, defense: 6, income: 4, growth: 0, stability: 0, corruption: 0, seaTransport: 0),
    ]

    public static let expeditionById: [String: ExpeditionSite] = Dictionary(uniqueKeysWithValues: expeditions.map { ($0.id, $0) })

    // MARK: - 存储初始化与实时收益查询

    private static func ensureStore(_ r: JS) {
        Regimes.enable(r)
        if r.regimes.wonders.isNull { r.regimes.wonders = JS.object() }
        if r.regimes.goldenAge.isNull { r.regimes.goldenAge = JS.object() }
        if r.regimes.missions.isNull { r.regimes.missions = JS.object() }
        if r.regimes.mercCooldown.isNull { r.regimes.mercCooldown = JS.object() }
        if r.regimes.expeditions.isNull { r.regimes.expeditions = JS.object() }
    }

    /// 确定性锚定每个探索古迹对应的世界州郡索引（让每个世界都有可定位的真实地理奇遇）。
    public static func anchorProvinceIndex(_ r: JS, siteId: String) -> Int {
        let count = r.world.provinces.length
        guard count > 0 else { return -1 }
        let seed = r.world.custom.seed.optionalString ?? "world"
        return Int(Opening.hash("\(seed)|expedition|\(siteId)") % UInt32(count))
    }

    public static func discoveredExpeditions(_ r: JS, nationId: String) -> [ExpeditionSite] {
        guard UnitKinds.enabled, !r.regimes.isNull, r.regimes.enabled.isTruthy, !r.regimes.expeditions.isNull else { return [] }
        var out = [ExpeditionSite]()
        for (sid, row) in r.regimes.expeditions.objectEntries {
            guard row.status.optionalString == "done",
                  row.discovererId.optionalString == nationId,
                  let spec = expeditionById[sid] else { continue }
            out.append(spec)
        }
        return out
    }

    /// 列出当前由指定国家实际控制（按奇观所在州郡的实时 controller 判定，攻陷敌州即可夺取奇观！）的已竣工奇观。
    public static func controlledWonders(_ r: JS, nationId: String) -> [WonderSpec] {
        guard UnitKinds.enabled, !r.regimes.isNull, r.regimes.enabled.isTruthy, !r.regimes.wonders.isNull else { return [] }
        let controllerByPid: [String: String]
        if let idx = Regimes.currentMonthIndex, idx.world == ObjectIdentifier(r) {
            controllerByPid = idx.ownerByPid
        } else {
            var map = [String: String]()
            for p in r.world.provinces.asArray { map[p.id.asString] = p.controller.optionalString ?? "" }
            controllerByPid = map
        }
        var out = [WonderSpec]()
        for (wid, row) in r.regimes.wonders.objectEntries {
            guard row.status.optionalString == "done",
                  let pid = row.provinceId.optionalString,
                  controllerByPid[pid] == nationId,
                  let spec = wonderById[wid] else { continue }
            out.append(spec)
        }
        return out
    }

    public static func goldenAgeRemaining(_ r: JS, nationId: String) -> Int {
        guard UnitKinds.enabled, !r.regimes.isNull, !r.regimes.goldenAge.isNull else { return 0 }
        let row = r.regimes.goldenAge[nationId]
        guard !row.isNull else { return 0 }
        let untilM = row.untilMonth.optionalNumber.map(Int.init) ?? 0
        let nowM = r.regimes.month.optionalNumber.map(Int.init) ?? 0
        return max(0, untilM - nowM)
    }

    public static func goldenAgeCooldownRemaining(_ r: JS, nationId: String) -> Int {
        guard UnitKinds.enabled, !r.regimes.isNull, !r.regimes.goldenAge.isNull else { return 0 }
        let row = r.regimes.goldenAge[nationId]
        guard !row.isNull else { return 0 }
        let cdM = row.cooldownUntilMonth.optionalNumber.map(Int.init) ?? 0
        let nowM = r.regimes.month.optionalNumber.map(Int.init) ?? 0
        return max(0, cdM - nowM)
    }

    /// 汇总该国当前所有实控奇观 + 黄金盛世带来的真实 Leverage 国家加成（直接接入 Regimes.computeLeverage）。
    public static func leverageBonus(_ r: JS, nationId: String) -> Regimes.Leverage {
        guard UnitKinds.enabled, !r.regimes.isNull, r.regimes.enabled.isTruthy else { return Regimes.Leverage() }
        var l = Regimes.Leverage()
        for w in controlledWonders(r, nationId: nationId) {
            l.attack += w.attack
            l.defense += w.defense
            l.income += w.income
            l.growth += w.growth
            l.stability += w.stability
            l.corruption += w.corruption
        }
        for e in discoveredExpeditions(r, nationId: nationId) {
            l.attack += e.attack
            l.defense += e.defense
            l.income += e.income
            l.growth += e.growth
            l.stability += e.stability
            l.corruption += e.corruption
        }
        if goldenAgeRemaining(r, nationId: nationId) > 0 {
            l.attack += 16
            l.defense += 14
            l.income += 25
            l.growth += 3.0
            l.stability += 15
            l.corruption -= 10
        }
        return l
    }

    /// 奇观与远洋探索带来的额外跨海运力加成（宝船大船坞 +3、沧溟大灯塔 +2、远洋奇遇 +1）。
    public static func seaTransportBonus(_ r: JS, nation: String) -> Int {
        controlledWonders(r, nationId: nation).reduce(0) { $0 + $1.seaTransport }
            + discoveredExpeditions(r, nationId: nation).reduce(0) { $0 + $1.seaTransport }
    }

    // MARK: - 霸业使命进度评估

    public struct MissionProgress: Sendable {
        public let spec: MissionSpec
        public let current: Int
        public let target: Int
        public let done: Bool
        public let claimed: Bool
        public let statusLine: String
    }

    public static func evaluateMissions(_ r: JS, nationId: String) -> [MissionProgress] {
        let myProvs: Int
        let top2Threshold: Int
        let myArmyCount: Int
        let totalTroops: Int
        let ships: Int
        let ports: Int
        let hasAllyOrVassal: Bool
        let myWonders: Int

        if let cache = SovereignAI.activeCache(r) {
            myProvs = cache.provinceCountByNation[nationId] ?? 0
            top2Threshold = cache.top2ProvinceThreshold
            let myArmies = Regimes.monthArmies(r, nationId)
            myArmyCount = myArmies.count
            totalTroops = cache.troopsByNation[nationId] ?? myArmies.reduce(0) { $0 + $1.troops.asInt }
            ships = cache.shipsByNation[nationId] ?? 0
            ports = cache.portsByNation[nationId]?.count ?? 0
            hasAllyOrVassal = cache.hasAllianceOrVassal.contains(nationId)
            myWonders = cache.wondersOwnedByNation[nationId] ?? 0
        } else {
            let provinces = r.world.provinces.asArray
            var provCountByNation = [String: Int]()
            for p in provinces {
                if let c = p.controller.optionalString, !c.isEmpty { provCountByNation[c, default: 0] += 1 }
            }
            myProvs = provCountByNation[nationId] ?? 0
            let sortedCounts = provCountByNation.values.sorted(by: >)
            top2Threshold = sortedCounts.count >= 2 ? sortedCounts[1] : (sortedCounts.first ?? 1)

            let myArmies = r.world.armies.asArray.filter { $0.nationId.optionalString == nationId && $0.troops.asNumber > 0 && $0.status.asString != "destroyed" }
            myArmyCount = myArmies.count
            totalTroops = myArmies.reduce(0) { $0 + $1.troops.asInt }
            ships = Naval.fleets(r).filter { $0.nationId.optionalString == nationId && $0.status.asString != "lost" }.reduce(0) { $0 + max(0, $1.ships.asInt) }
            ports = MaritimeWarfare.unblockedFriendlyPortIndices(r, nation: nationId).count
            let hasVassal = r.vassals.records.asArray.contains { $0.endedTick.isNull && $0.overlordId.optionalString == nationId }
            hasAllyOrVassal = (Vassals.allianceOf(r, nationId) != nil) || hasVassal
            myWonders = controlledWonders(r, nationId: nationId).count
        }

        let gold = Int((r.finance.nations[nationId].gold.optionalNumber ?? 0).rounded())
        let corrupt = Int(Finance.corruption(r, nationId).rounded())
        let destiny = Int((r.destiny.nations[nationId].destiny.optionalNumber ?? 50).rounded())
        let rep = WorldDepth.reputation(r, nation: nationId)

        let claimedObj = (!r.regimes.isNull && !r.regimes.missions.isNull) ? r.regimes.missions[nationId] : .null

        return missions.map { m in
            let isClaimed = !claimedObj.isNull && claimedObj[m.id].isTruthy
            switch m.id {
            case "expandRealm":
                let ok = myProvs >= 10
                return MissionProgress(spec: m, current: min(10, myProvs), target: 10, done: ok, claimed: isClaimed, statusLine: "实控 \(myProvs) / 10 州")
            case "mightyArmy":
                let ok = totalTroops >= 30_000 || myArmyCount >= 5
                let cur = ok ? 100 : max(min(99, totalTroops * 100 / 30_000), min(99, myArmyCount * 20))
                return MissionProgress(spec: m, current: cur, target: 100, done: ok, claimed: isClaimed, statusLine: "兵力 \(totalTroops) · \(myArmyCount) 支")
            case "richTreasury":
                let ok = gold >= 2500
                return MissionProgress(spec: m, current: min(2500, max(0, gold)), target: 2500, done: ok, claimed: isClaimed, statusLine: "国库 \(gold) / 2,500 金")
            case "seaDominion":
                let ok = ships >= 8 || ports >= 3
                let cur = ok ? 8 : max(min(7, ships), min(7, ports * 2))
                return MissionProgress(spec: m, current: cur, target: 8, done: ok, claimed: isClaimed, statusLine: "战船 \(ships) 艘 · 海港 \(ports) 处")
            case "cleanCourt":
                let ok = corrupt < 18 && destiny >= 70
                let cur = ok ? 2 : ((corrupt < 18 ? 1 : 0) + (destiny >= 70 ? 1 : 0))
                return MissionProgress(spec: m, current: cur, target: 2, done: ok, claimed: isClaimed, statusLine: "腐化 \(corrupt)(<18) · 国运 \(destiny)(≥70)")
            case "diplomaticLead":
                let ok = hasAllyOrVassal || rep >= 68
                return MissionProgress(spec: m, current: ok ? 1 : 0, target: 1, done: ok, claimed: isClaimed, statusLine: hasAllyOrVassal ? "已成盟/宗主" : "信誉 \(rep) / 68")
            case "wonderBuilder":
                let ok = myWonders >= 1
                return MissionProgress(spec: m, current: min(1, myWonders), target: 1, done: ok, claimed: isClaimed, statusLine: "实控奇观 \(myWonders) / 1 座")
            default:
                let ok = myProvs >= 12 && myProvs >= top2Threshold
                return MissionProgress(spec: m, current: ok ? 1 : 0, target: 1, done: ok, claimed: isClaimed, statusLine: "实控 \(myProvs) 州（前二门槛 \(max(12, top2Threshold)) 州）")
            }
        }
    }

    /// 供 `nationInfo` 轻量导出的摘要角标（零全表重算，让概览页二级菜单行直接显示亮点徽标）。
    public static func summary(_ r: JS, nationId: String) -> JS {
        let o = JS.object()
        let ownedWonders = controlledWonders(r, nationId: nationId)
        var buildingName = ""
        var buildingLeft = 0
        if !r.regimes.isNull, !r.regimes.wonders.isNull {
            for (wid, row) in r.regimes.wonders.objectEntries {
                if row.status.optionalString == "building", row.builderId.optionalString == nationId, let spec = wonderById[wid] {
                    buildingName = spec.name
                    buildingLeft = max(1, (row.totalMonths.optionalNumber.map(Int.init) ?? spec.months) - (row.progress.optionalNumber.map(Int.init) ?? 0))
                    break
                }
            }
        }
        let mList = evaluateMissions(r, nationId: nationId)
        let claimable = mList.filter { $0.done && !$0.claimed }.count
        let claimed = mList.filter(\.claimed).count
        let gaRem = goldenAgeRemaining(r, nationId: nationId)
        let gaCD = goldenAgeCooldownRemaining(r, nationId: nationId)
        let destiny = Int((r.destiny.nations[nationId].destiny.optionalNumber ?? 50).rounded())
        let canGA = gaRem == 0 && gaCD == 0 && (destiny >= 68 || claimed >= 2 || !ownedWonders.isEmpty)

        o.wondersOwned = JS(ownedWonders.count)
        o.wonderBuilding = JS(buildingName)
        o.wonderMonthsLeft = JS(buildingLeft)
        o.missionsClaimable = JS(claimable)
        o.missionsClaimed = JS(claimed)
        o.missionsTotal = JS(missions.count)
        o.goldenAgeLeft = JS(gaRem)
        o.goldenAgeCanStart = JS(canGA)
        let doneExp = discoveredExpeditions(r, nationId: nationId).count
        var activeExpName = ""
        if !r.regimes.isNull, !r.regimes.expeditions.isNull {
            for (sid, row) in r.regimes.expeditions.objectEntries where row.status.optionalString == "exploring" && row.explorerId.optionalString == nationId {
                activeExpName = expeditionById[sid]?.name ?? ""
                break
            }
        }
        o.expeditionsDone = JS(doneExp)
        o.expeditionsTotal = JS(expeditions.count)
        o.expeditionActive = JS(activeExpName)
        return o
    }

    // MARK: - 月度推进（奇观建造进度、奇观被动特效、远征进度；AI 竞建与远征统一交由 SovereignAI 自主决策）

    public static func month(_ r: JS, _ n: JS, _ id: String, _ key: Int, addGold: (Double) -> Void, addDestiny: (Double) -> Void) {
        guard UnitKinds.enabled, !r.regimes.isNull, r.regimes.enabled.isTruthy else { return }
        ensureStore(r)
        let provinces = r.world.provinces.asArray
        let ownerByPid = (Regimes.currentMonthIndex?.world == ObjectIdentifier(r)) ? Regimes.currentMonthIndex?.ownerByPid : nil
        func findProvince(_ pid: String) -> JS? {
            if let list = Regimes.currentMonthIndex?.provincesByNation[ownerByPid?[pid] ?? ""] {
                if let hit = list.first(where: { $0.id.asString == pid }) { return hit }
            }
            return provinces.first(where: { $0.id.asString == pid })
        }

        // 1. 推进该国正在兴建的奇观工程
        for (wid, row) in r.regimes.wonders.objectEntries {
            guard row.status.optionalString == "building", row.builderId.optionalString == id else { continue }
            guard let pid = row.provinceId.optionalString, let p = findProvince(pid) else { continue }
            // 若施工所在州郡被敌方占领，则停工并返还未完成奇观名额
            if p.controller.optionalString != id {
                r.regimes.wonders.delete(wid)
                if let spec = wonderById[wid] {
                    _ = People.announce(r, kind: "event", text: "\(n.name.asString)「\(spec.name)」因战火停工",
                                        reason: "\(p.name.asString)失守，修建中的天下奇观「\(spec.name)」被迫废弃。",
                                        nations: [id], province: pid)
                }
                continue
            }
            let prog = (row.progress.optionalNumber.map(Int.init) ?? 0) + 1
            let total = row.totalMonths.optionalNumber.map(Int.init) ?? (wonderById[wid]?.months ?? 12)
            row.progress = JS(prog)
            if prog >= total, let spec = wonderById[wid] {
                row.status = JS("done")
                row.completedDay = r.world.day.clone()
                applyCompletionReward(r, nationId: id, provinceId: pid, spec: spec, addDestiny: addDestiny)
                _ = People.announce(r, kind: "culture", text: "天下奇观落成：\(n.name.asString)建成「\(spec.name)」！",
                                    reason: "历时 \(total) 月于\(p.name.asString)竣工。\(spec.effectLine)。",
                                    nations: [id], province: pid)
            }
        }

        // 2. 已建成奇观月度持续特效（如神机军器监增历练、稷下太学宫推进科技、圜丘圣坛增国运）
        let owned = controlledWonders(r, nationId: id)
        for w in owned {
            if w.id == "imperialArsenal" {
                if r.regimes.armyXP.isNull { r.regimes.armyXP = JS.object() }
                for a in Regimes.monthArmies(r, id).prefix(4) {
                    let aid = a.id.asString
                    r.regimes.armyXP[aid] = JS(min(100, (r.regimes.armyXP[aid].optionalNumber ?? 0) + 2.0))
                }
            } else if w.id == "heavenAltar" && key % 3 == 0 {
                addDestiny(2)
            } else if w.id == "grandAcademy" && key % 2 == 0 {
                addTechBoost(r, nationId: id, delta: 6)
            }
        }

        // 3. 天下奇观自动竞建交由 SovereignAI 按执政人格、政体与收入择优拍板（移除旧版 4.5% 极低概率占位，月内自动去重）
        SovereignAI.considerGrandWonderIfNeeded(r, nation: n, id: id, key: key)

        // 4. 推进该国正在进行的「四海探索与古迹远征」（AI 新派远征统一由 SovereignAI.month 驱动）
        for (sid, row) in r.regimes.expeditions.objectEntries {
            guard row.status.optionalString == "exploring", row.explorerId.optionalString == id else { continue }
            let prog = (row.progress.optionalNumber.map(Int.init) ?? 0) + 1
            let total = row.totalMonths.optionalNumber.map(Int.init) ?? (expeditionById[sid]?.months ?? 4)
            row.progress = JS(prog)
            if prog >= total, let spec = expeditionById[sid] {
                row.status = JS("done")
                row.discovererId = JS(id)
                row.completedDay = r.world.day.clone()
                if !r.finance.nations[id].isNull {
                    r.finance.nations[id].gold = JS((r.finance.nations[id].gold.optionalNumber ?? 0) + spec.goldReward)
                }
                addDestiny(5)
                WorldDepth.addTechProgress(r, nation: id, branch: spec.techBranch, points: spec.techPts)
                if spec.id == "warScrollCave", let cmd = Regimes.activeCommander(r, nation: id, enemy: nil), let cp = People.person(r, cmd.personId) {
                    cp.base.military = JS(min(100, (cp.base.military.optionalNumber ?? 50) + 4))
                }
                if spec.id == "arcticTomb" {
                    if r.regimes.armyXP.isNull { r.regimes.armyXP = JS.object() }
                    for a in Regimes.monthArmies(r, id) {
                        let aid = a.id.asString
                        r.regimes.armyXP[aid] = JS(min(100, (r.regimes.armyXP[aid].optionalNumber ?? 0) + 10))
                    }
                }
                let pIdx = anchorProvinceIndex(r, siteId: sid)
                let pId = (pIdx >= 0 && pIdx < provinces.count) ? provinces[pIdx].id.asString : nil
                _ = People.announce(r, kind: "voyage",
                                    text: "古迹发掘：\(n.name.asString)探索「\(spec.name)」大获奇珍！",
                                    reason: "远征队凯旋献宝：获得 \(Int(spec.goldReward)) 金与永久古迹加持（\(spec.rewardLine)）。",
                                    nations: [id], province: pId)
            }
        }
    }

    // MARK: - 供玩家接口与 SovereignAI 共用的静态核心执行器（零重复逻辑、真实扣费与冷却）

    /// 领取已达成的国家霸业使命奖赏（静态核心实现，玩家点击与 AI 自动领赏共用）。
    @discardableResult
    public static func claimMission(_ r: JS, nationId id: String, missionId: String) -> (ok: Bool, reason: String) {
        guard let n = r.world.nations.asArray.first(where: { $0.id.asString == id }) else { return (false, "国家不存在。") }
        let stateName = n.name.asString
        guard Vassals.alive(r, id) else { return (false, "该国已亡。") }
        Regimes.enable(r)
        if r.regimes.missions.isNull { r.regimes.missions = JS.object() }
        if r.regimes.missions[id].isNull { r.regimes.missions[id] = JS.object() }
        guard let mp = evaluateMissions(r, nationId: id).first(where: { $0.spec.id == missionId }) else {
            return (false, "未知的霸业使命。")
        }
        guard !mp.claimed else { return (false, "「\(mp.spec.title)」已完成领赏。") }
        guard mp.done else { return (false, "尚未达成条件（\(mp.statusLine)）。") }

        let fin = r.finance.nations[id]
        let destinyRow = r.destiny.nations[id]
        func giveGold(_ v: Double) { if !fin.isNull { fin.gold = JS((fin.gold.optionalNumber ?? 0) + v) } }
        func giveDestiny(_ v: Double) { if !destinyRow.isNull { destinyRow.destiny = JS(min(100, (destinyRow.destiny.optionalNumber ?? 50) + v)) } }

        switch missionId {
        case "expandRealm":
            giveGold(900); giveDestiny(10)
            if r.regimes.armyXP.isNull { r.regimes.armyXP = JS.object() }
            for a in Regimes.monthArmies(r, id) {
                let aid = a.id.asString
                r.regimes.armyXP[aid] = JS(min(100, (r.regimes.armyXP[aid].optionalNumber ?? 0) + 18))
            }
        case "mightyArmy":
            giveGold(600)
            for a in Regimes.monthArmies(r, id) { a.morale = JS(100) }
            if let cmd = Regimes.activeCommander(r, nation: id, enemy: nil), let cp = People.person(r, cmd.personId) {
                cp.base.military = JS(min(100, (cp.base.military.optionalNumber ?? 50) + 6))
            }
        case "richTreasury":
            Finance.setCorruption(r, id, max(0, Finance.corruption(r, id) - 12))
            giveDestiny(8)
            for p in Regimes.monthLand(r, id) {
                if let s = Regimes.monthStock(r, p.id.asString) {
                    s.grain = JS(min(50_000_000, ((s.grain.optionalNumber ?? 0) * 1.30).rounded()))
                }
            }
        case "seaDominion":
            giveGold(800)
            let nb = Regimes.book(r, id)
            nb.seaTransportBonus = JS(min(14, (nb.seaTransportBonus.optionalNumber.map(Int.init) ?? 0) + 3))
            WorldDepth.adjustReputation(r, nation: id, delta: 10)
        case "cleanCourt":
            giveGold(500)
            addTechBoost(r, nationId: id, delta: 40)
        case "diplomaticLead":
            giveGold(600); giveDestiny(8)
            for other in r.world.nations.asArray {
                let oid = other.id.asString
                guard oid != id, Vassals.alive(r, oid), !RunWindow.atWar(r, id, oid) else { continue }
                DiplomacyDeep.adjustOpinionMod(r, id, oid, delta: 15)
            }
        case "wonderBuilder":
            giveGold(1200); giveDestiny(12)
            WorldDepth.adjustReputation(r, nation: id, delta: 15)
        case "worldHegemon":
            giveGold(1500); giveDestiny(15)
            if r.regimes.goldenAge.isNull { r.regimes.goldenAge = JS.object() }
            let nowM = r.regimes.month.optionalNumber.map(Int.init) ?? 0
            let row = JS.object()
            row.untilMonth = JS(nowM + 60); row.cooldownUntilMonth = JS(nowM + 360)
            r.regimes.goldenAge[id] = row
        default: break
        }
        r.regimes.missions[id][missionId] = JS(true)
        _ = People.announce(r, kind: "culture", text: "\(stateName)功成「\(mp.spec.title)」霸业！",
                            reason: "达成历史伟业，获颁赏赐：\(mp.spec.rewardText)。",
                            nations: [id], province: nil)
        return (true, "已达成「\(mp.spec.title)」：\(mp.spec.rewardText)！")
    }

    /// 主动开启 5 年（60 个月）国家黄金盛世（静态核心实现，玩家与 AI 共用）。
    @discardableResult
    public static func startGoldenAge(_ r: JS, nationId id: String) -> (ok: Bool, reason: String) {
        guard let n = r.world.nations.asArray.first(where: { $0.id.asString == id }) else { return (false, "国家不存在。") }
        let stateName = n.name.asString
        guard Vassals.alive(r, id) else { return (false, "该国已亡。") }
        Regimes.enable(r)
        if r.regimes.goldenAge.isNull { r.regimes.goldenAge = JS.object() }
        let rem = goldenAgeRemaining(r, nationId: id)
        if rem > 0 { return (false, "本国正处于黄金盛世之中（尚余 \(rem) 个月）。") }
        let cd = goldenAgeCooldownRemaining(r, nationId: id)
        if cd > 0 { return (false, "距下次开启黄金盛世尚需蓄势 \(cd) 个月。") }
        let destiny = Int((r.destiny.nations[id].destiny.optionalNumber ?? 50).rounded())
        let claimed = evaluateMissions(r, nationId: id).filter(\.claimed).count
        let wonders = controlledWonders(r, nationId: id).count
        guard destiny >= 68 || claimed >= 2 || wonders >= 1 else {
            return (false, "尚未达到盛世门槛：需国运 ≥ 68、完成 2 项霸业或实控 1 座天下奇观。")
        }
        let nowM = r.regimes.month.optionalNumber.map(Int.init) ?? 0
        let row = JS.object()
        row.untilMonth = JS(nowM + 60)
        row.cooldownUntilMonth = JS(nowM + 360)
        r.regimes.goldenAge[id] = row
        _ = People.announce(r, kind: "culture", text: "\(stateName)开启五年黄金盛世！",
                            reason: "四海升平、文治武功达于极盛：未来 60 个月岁入 +25%、全军攻 +16% 守 +14%、安定 +15、腐化 −10！",
                            nations: [id], province: nil)
        return (true, "\(stateName)黄金盛世已启（持续 60 个月）！")
    }

    /// 招募传世特色雇佣兵团（静态核心实现，玩家与 AI 共用）。
    @discardableResult
    public static func hireMercenary(_ r: JS, nationId id: String, mercId: String) -> (ok: Bool, reason: String) {
        guard let n = r.world.nations.asArray.first(where: { $0.id.asString == id }) else { return (false, "国家不存在。") }
        let stateName = n.name.asString
        guard Vassals.alive(r, id) else { return (false, "该国已亡。") }
        guard let spec = mercById[mercId] else { return (false, "未知的雇佣兵团。") }
        Regimes.enable(r)
        if r.regimes.mercCooldown.isNull { r.regimes.mercCooldown = JS.object() }
        if r.regimes.mercCooldown[id].isNull { r.regimes.mercCooldown[id] = JS.object() }
        let nowDay = r.world.day.asInt
        let cdUntil = r.regimes.mercCooldown[id][mercId].optionalNumber.map(Int.init) ?? 0
        if nowDay < cdUntil { return (false, "「\(spec.name)」正在休整补员，需待 \(cdUntil - nowDay) 日后方可再雇。") }
        let fin = r.finance.nations[id]
        let gold = fin.isNull ? 0 : (fin.gold.optionalNumber ?? 0)
        guard gold >= spec.cost else { return (false, "国库不足 \(Int(spec.cost)) 金，无力招募「\(spec.name)」。") }

        let ownedProvs = Regimes.monthLand(r, id)
        let capPid = Rebellion.capitalProvince(r, id)
        let siteProv: JS? = {
            if let capPid, let cp = ownedProvs.first(where: { $0.id.asString == capPid }), Armies.homeCells[capPid] != nil {
                return cp
            }
            return ownedProvs.first(where: { Armies.homeCells[$0.id.asString] != nil })
        }()
        guard let siteProv else { return (false, "境内暂无可集结佣兵团的驻地。") }
        let homePid = siteProv.id.asString

        if !fin.isNull { fin.gold = JS(max(0, gold - spec.cost)) }
        _ = Armies.create(r, nation: id, home: homePid, kind: "regular")
        if let created = r.world.armies.asArray.last {
            let aid = created.id.asString
            created.name = JS(spec.name)
            created.troops = JS(spec.troops)
            created.morale = JS(95)
            created.supplies = JS(100)
            if !r.tactics.forces[aid].isNull { r.tactics.forces[aid].fullStrength = JS(spec.troops) }
            r.units[aid] = JS(spec.unit)
            if r.regimes.armyXP.isNull { r.regimes.armyXP = JS.object() }
            r.regimes.armyXP[aid] = JS(Double(spec.xp))
        }
        r.regimes.mercCooldown[id][mercId] = JS(nowDay + 180)
        Daily.reconcileMilitaryClock(r)
        let siteName = siteProv.name.asString
        _ = People.announce(r, kind: "war", text: "\(stateName)重金招募「\(spec.name)」",
                            reason: "斥资 \(Int(spec.cost)) 金于\(siteName)成军 \(spec.troops) 名百战精锐（历练 \(spec.xp) · 士气 95），即刻投入战局！",
                            nations: [id], province: homePid)
        return (true, "「\(spec.name)」（\(spec.troops) 精锐）已于\(siteName)成军待命！")
    }

    /// 派遣远征队探索天下秘境与古迹（静态核心实现，玩家与 AI 共用）。
    @discardableResult
    public static func dispatchExpedition(_ r: JS, nationId id: String, siteId: String) -> (ok: Bool, reason: String) {
        guard let n = r.world.nations.asArray.first(where: { $0.id.asString == id }) else { return (false, "国家不存在。") }
        let stateName = n.name.asString
        guard Vassals.alive(r, id) else { return (false, "该国已亡，无法派遣远征队。") }
        guard let spec = expeditionById[siteId] else { return (false, "未知的古迹秘境。") }
        Regimes.enable(r)
        if r.regimes.expeditions.isNull { r.regimes.expeditions = JS.object() }
        if !r.regimes.expeditions[siteId].isNull {
            let st = r.regimes.expeditions[siteId].status.optionalString ?? ""
            return (false, st == "done" ? "「\(spec.name)」已被发掘归藏，举世唯一不可重复探索。" : "「\(spec.name)」已有远征队正在勘探之中。")
        }
        for (_, row) in r.regimes.expeditions.objectEntries {
            if row.status.optionalString == "exploring", row.explorerId.optionalString == id {
                return (false, "本国当前已有远征队在外勘探，请待凯旋后再启新程。")
            }
        }
        let fin = r.finance.nations[id]
        let gold = fin.isNull ? 0 : (fin.gold.optionalNumber ?? 0)
        guard gold >= spec.cost else { return (false, "国库不足 \(Int(spec.cost)) 金，难以筹备「\(spec.name)」远征队。") }
        if !fin.isNull { fin.gold = JS(max(0, gold - spec.cost)) }

        let row = JS.object()
        row.status = JS("exploring"); row.explorerId = JS(id)
        row.progress = JS(0); row.totalMonths = JS(spec.months); row.startedDay = r.world.day.clone()
        r.regimes.expeditions[siteId] = row
        let pIdx = anchorProvinceIndex(r, siteId: siteId)
        let pName = (pIdx >= 0 && pIdx < r.world.provinces.length) ? r.world.provinces[pIdx].name.asString : "远方秘境"
        let pId = (pIdx >= 0 && pIdx < r.world.provinces.length) ? r.world.provinces[pIdx].id.asString : nil
        _ = People.announce(r, kind: "voyage", text: "\(stateName)派遣远征队探访「\(spec.name)」",
                            reason: "斥资 \(Int(spec.cost)) 金赴\(pName)一带勘察古迹，预计 \(spec.months) 个月归来（\(spec.rewardLine)）。",
                            nations: [id], province: pId)
        return (true, "远征队已启程前往\(pName)探访「\(spec.name)」，预计 \(spec.months) 个月凯旋！")
    }

    private static func applyCompletionReward(_ r: JS, nationId: String, provinceId: String, spec: WonderSpec, addDestiny: (Double) -> Void) {
        addDestiny(6)
        if spec.id == "forbiddenPalace" { WorldDepth.adjustReputation(r, nation: nationId, delta: 15) }
        if spec.id == "silkExchange" { WorldDepth.adjustReputation(r, nation: nationId, delta: 12) }
        if spec.id == "greatWall" {
            for p in r.world.provinces.asArray where p.controller.optionalString == nationId {
                let d = r.upperCombat.provinces[p.id.asString]
                if !d.isNull {
                    let cur = Int((d.storedDefense.optionalNumber ?? 1).rounded())
                    if cur < 10 { d.storedDefense = JS(min(10, cur + 1)) }
                }
            }
        }
        if spec.id == "grandCanal" || spec.id == "everNormalVault" {
            let ownedIds = Set(r.world.provinces.asArray.filter { $0.controller.optionalString == nationId }.map(\.id.asString))
            for s in r.world.statecraft.provinces.asArray where ownedIds.contains(s.provinceId.asString) {
                s.grain = JS(min(50_000_000, ((s.grain.optionalNumber ?? 0) * 1.30).rounded()))
            }
        }
    }

    static func addTechBoost(_ r: JS, nationId: String, delta: Int) {
        for b in WorldDepth.TechBranch.allCases {
            WorldDepth.addTechProgress(r, nation: nationId, branch: b, points: delta)
        }
    }
}

// MARK: - NativeEngine RPC 接口

extension NativeEngine {

    /// 读取指定国家的奇观总览、霸业使命、黄金盛世与雇佣兵团状态（按需加载，二级菜单打开时才调用）。
    public func grandInfo(_ index: Int) -> Data? {
        let r = run, nations = r.world.nations.asArray
        guard nations.indices.contains(index) else { return nil }
        let id = nations[index].id.asString
        let provinces = r.world.provinces.asArray
        var provById = [String: (idx: Int, name: String, controller: String)]()
        for (i, p) in provinces.enumerated() {
            provById[p.id.asString] = (i, p.name.asString, p.controller.optionalString ?? "")
        }
        var nationNameById = [String: String]()
        for n in nations { nationNameById[n.id.asString] = n.name.asString }
        let portPids = Set((Naval.sea?.ports ?? []).map(\.provinceId))
        let hasPort = provinces.contains { $0.controller.optionalString == id && portPids.contains($0.id.asString) }
        let nowDay = r.world.day.asInt

        let o = JS.object()
        o.gold = JS((r.finance.nations[id].gold.optionalNumber ?? 0).rounded())
        o.hasPort = JS(hasPort)
        o.goldenAgeLeft = JS(GrandSystems.goldenAgeRemaining(r, nationId: id))
        o.goldenAgeCooldown = JS(GrandSystems.goldenAgeCooldownRemaining(r, nationId: id))
        let ownedCnt = GrandSystems.controlledWonders(r, nationId: id).count
        let mProgress = GrandSystems.evaluateMissions(r, nationId: id)
        let claimedCnt = mProgress.filter(\.claimed).count
        let destiny = Int((r.destiny.nations[id].destiny.optionalNumber ?? 50).rounded())
        o.goldenAgeEligible = JS(o.goldenAgeLeft.asInt == 0 && o.goldenAgeCooldown.asInt == 0 && (destiny >= 68 || claimedCnt >= 2 || ownedCnt >= 1))
        o.goldenAgeRequirement = JS("需满足任一条件：国运 ≥ 68（现 \(destiny)）、完成 2 项霸业（现 \(claimedCnt)）或拥有 1 座奇观（现 \(ownedCnt)）")

        let wonderRows = JS.array()
        for spec in GrandSystems.wonders {
            let row = JS.object()
            row.id = JS(spec.id); row.name = JS(spec.name); row.category = JS(spec.category)
            row.cost = JS(Int(spec.cost)); row.months = JS(spec.months); row.coastalOnly = JS(spec.coastalOnly)
            row.effectLine = JS(spec.effectLine); row.flavor = JS(spec.flavor)
            let stateObj = (!r.regimes.isNull && !r.regimes.wonders.isNull) ? r.regimes.wonders[spec.id] : .null
            if !stateObj.isNull {
                let st = stateObj.status.optionalString ?? ""
                let pid = stateObj.provinceId.optionalString ?? ""
                let pInfo = provById[pid]
                let holderId = st == "done" ? (pInfo?.controller ?? "") : (stateObj.builderId.optionalString ?? "")
                row.status = JS(st)
                row.mine = JS(holderId == id)
                row.holderName = JS(nationNameById[holderId] ?? "他国")
                row.provinceName = JS(pInfo?.name ?? "")
                row.provinceIndex = JS(pInfo?.idx ?? -1)
                row.progress = JS(stateObj.progress.optionalNumber.map(Int.init) ?? 0)
            } else {
                row.status = JS("available")
                row.mine = JS(false)
                row.holderName = JS("")
                row.provinceName = JS("")
                row.provinceIndex = JS(-1)
                row.progress = JS(0)
            }
            wonderRows.push(row)
        }
        o.wonders = wonderRows

        let missionRows = JS.array()
        for mp in mProgress {
            let row = JS.object()
            row.id = JS(mp.spec.id); row.title = JS(mp.spec.title); row.category = JS(mp.spec.category)
            row.goalText = JS(mp.spec.goalText); row.rewardText = JS(mp.spec.rewardText)
            row.current = JS(mp.current); row.target = JS(mp.target)
            row.done = JS(mp.done); row.claimed = JS(mp.claimed); row.statusLine = JS(mp.statusLine)
            missionRows.push(row)
        }
        o.missions = missionRows

        let mercRows = JS.array()
        for m in GrandSystems.mercenaries {
            let row = JS.object()
            row.id = JS(m.id); row.name = JS(m.name); row.unit = JS(m.unit)
            row.troops = JS(m.troops); row.xp = JS(m.xp); row.cost = JS(Int(m.cost)); row.note = JS(m.note)
            let cdUntil = (!r.regimes.isNull && !r.regimes.mercCooldown.isNull && !r.regimes.mercCooldown[id].isNull)
                ? (r.regimes.mercCooldown[id][m.id].optionalNumber.map(Int.init) ?? 0) : 0
            row.cooldownDays = JS(max(0, cdUntil - nowDay))
            mercRows.push(row)
        }
        o.mercenaries = mercRows

        let expRows = JS.array()
        for site in GrandSystems.expeditions {
            let row = JS.object()
            let pIdx = GrandSystems.anchorProvinceIndex(r, siteId: site.id)
            let pName = (pIdx >= 0 && pIdx < provinces.count) ? provinces[pIdx].name.asString : "未知秘境"
            row.id = JS(site.id); row.name = JS(site.name); row.regionKind = JS(site.regionKind)
            row.cost = JS(Int(site.cost)); row.months = JS(site.months)
            row.rewardLine = JS(site.rewardLine); row.flavor = JS(site.flavor)
            row.provinceIndex = JS(pIdx); row.provinceName = JS(pName)
            let stObj = (!r.regimes.isNull && !r.regimes.expeditions.isNull) ? r.regimes.expeditions[site.id] : .null
            if !stObj.isNull {
                let st = stObj.status.optionalString ?? "available"
                let holder = st == "done" ? (stObj.discovererId.optionalString ?? "") : (stObj.explorerId.optionalString ?? "")
                row.status = JS(st)
                row.mine = JS(holder == id)
                row.holderName = JS(nationNameById[holder] ?? "他国")
                row.progress = JS(stObj.progress.optionalNumber.map(Int.init) ?? 0)
            } else {
                row.status = JS("available")
                row.mine = JS(false)
                row.holderName = JS("")
                row.progress = JS(0)
            }
            expRows.push(row)
        }
        o.expeditions = expRows
        return Data(o.json.utf8)
    }

    /// 动工兴建一座天下奇观（自动择定都城或最优沿海港，也可指定州郡索引）。
    public func startWonder(_ nationIndex: Int, wonderId: String, provinceIndex: Int? = nil) -> (ok: Bool, reason: String) {
        let r = run, nations = r.world.nations.asArray
        guard nations.indices.contains(nationIndex) else { return (false, "国家不存在。") }
        let n = nations[nationIndex], id = n.id.asString, stateName = n.name.asString
        guard Vassals.alive(r, id) else { return (false, "该国已亡，无法兴建工程。") }
        guard let spec = GrandSystems.wonderById[wonderId] else { return (false, "未知的天下奇观。") }
        Regimes.enable(r)
        if r.regimes.wonders.isNull { r.regimes.wonders = JS.object() }
        if !r.regimes.wonders[wonderId].isNull {
            return (false, "「\(spec.name)」已被动工或建成，天下奇观举世唯一。")
        }
        for (_, row) in r.regimes.wonders.objectEntries {
            if row.status.optionalString == "building", row.builderId.optionalString == id {
                return (false, "本国当前已有在建奇观工程，须待竣工后再起新工。")
            }
        }
        let fin = r.finance.nations[id]
        let gold = fin.isNull ? 0 : (fin.gold.optionalNumber ?? 0)
        guard gold >= spec.cost else { return (false, "国库不足 \(Int(spec.cost)) 金，难以兴建「\(spec.name)」。") }

        let provinces = r.world.provinces.asArray
        let portPids = Set((Naval.sea?.ports ?? []).map(\.provinceId))
        let owned = provinces.indices.filter { provinces[$0].controller.optionalString == id }
        let eligible = spec.coastalOnly ? owned.filter { portPids.contains(provinces[$0].id.asString) } : owned
        guard !eligible.isEmpty else {
            return (false, spec.coastalOnly ? "兴建「\(spec.name)」须拥有至少一处实控沿海海港。" : "该国暂无可用实控州郡。")
        }
        let chosenIdx: Int = {
            if let req = provinceIndex, eligible.contains(req) { return req }
            if let capPid = Rebellion.capitalProvince(r, id), let capIdx = eligible.first(where: { provinces[$0].id.asString == capPid }) { return capIdx }
            return eligible[0]
        }()
        let site = provinces[chosenIdx]
        if !fin.isNull { fin.gold = JS(max(0, gold - spec.cost)) }
        let row = JS.object()
        row.status = JS("building"); row.builderId = JS(id); row.provinceId = JS(site.id.asString)
        row.progress = JS(0); row.totalMonths = JS(spec.months); row.startedDay = r.world.day.clone()
        r.regimes.wonders[wonderId] = row
        People.announce(r, kind: "event", text: "\(stateName)动工兴建奇观「\(spec.name)」",
                        reason: "斥资 \(Int(spec.cost)) 金于\(site.name.asString)奠基开工，预计 \(spec.months) 个月竣工（\(spec.effectLine)）。",
                        nations: [id], province: site.id.asString)
        return (true, "「\(spec.name)」已在\(site.name.asString)奠基动工，预计 \(spec.months) 月竣工！")
    }

    /// 领取已达成的国家霸业使命奖赏。
    public func claimMission(_ nationIndex: Int, missionId: String) -> (ok: Bool, reason: String) {
        let nations = run.world.nations.asArray
        guard nations.indices.contains(nationIndex) else { return (false, "国家不存在。") }
        return GrandSystems.claimMission(run, nationId: nations[nationIndex].id.asString, missionId: missionId)
    }

    /// 主动开启 5 年（60 个月）国家黄金盛世（全军攻+16%/守+14%、岁入+25%、安定+15、腐化−10）。
    public func startGoldenAge(_ nationIndex: Int) -> (ok: Bool, reason: String) {
        let nations = run.world.nations.asArray
        guard nations.indices.contains(nationIndex) else { return (false, "国家不存在。") }
        return GrandSystems.startGoldenAge(run, nationId: nations[nationIndex].id.asString)
    }

    /// 招募传世特色雇佣兵团（高士气 95、高历练 45–60，即刻集结于本国都城或重镇投入实战）。
    public func hireMercenary(_ nationIndex: Int, mercId: String) -> (ok: Bool, reason: String) {
        let nations = run.world.nations.asArray
        guard nations.indices.contains(nationIndex) else { return (false, "国家不存在。") }
        return GrandSystems.hireMercenary(run, nationId: nations[nationIndex].id.asString, mercId: mercId)
    }

    /// 派遣远征队探索天下秘境与古迹（耗时 4 月，发掘后获宝藏、科技突破与永久全国古迹增益）。
    public func dispatchExpedition(_ nationIndex: Int, siteId: String) -> (ok: Bool, reason: String) {
        let nations = run.world.nations.asArray
        guard nations.indices.contains(nationIndex) else { return (false, "国家不存在。") }
        return GrandSystems.dispatchExpedition(run, nationId: nations[nationIndex].id.asString, siteId: siteId)
    }
}
