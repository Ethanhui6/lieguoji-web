import Foundation

/// v8.0.0 真实军事学说、战场战术与历史名将实装系统：
/// 1. 八大真实军事学说（闪电战、大纵深战役、持久战与人民游击战、航母机动舰队、狼群破交、优势火力、阵地防线、古典名将阵法），
///    实质作用于陆军行军速度、突破冲击、山地游击防御、后勤消耗、攻城破防与海空协同；
/// 2. 将领-军团直挂系统：开局及募兵时自动将史实名将（古德里安、曼施坦因、隆美尔、朱可夫、山本五十六、薛岳、彭德怀、粟裕等）
///    指派至前线主力军团与舰队，其军事才能与性格特质直接转化为行军/突击/防御倍率与战场战术播报；
/// 3. 历史事件限时战役加成（如白色方案闪电战 120 日、偷袭珍珠港 150 日、莫斯科寒冬反攻 120 日）。
public enum MilitaryDoctrines {

    public enum DoctrineId: String, Codable, CaseIterable, Sendable, Identifiable {
        case blitzkrieg = "blitzkrieg"
        case deepBattle = "deep_battle"
        case protractedGuerrilla = "protracted_guerrilla"
        case carrierTaskForce = "carrier_task_force"
        case wolfpack = "wolfpack"
        case superiorFirepower = "superior_firepower"
        case grandBattleplan = "grand_battleplan"
        case classicalManeuver = "classical_maneuver"

        public var id: String { rawValue }
    }

    public struct Spec: Sendable, Equatable {
        public let id: DoctrineId
        public let name: String
        public let shortTag: String
        public let summary: String
        /// 陆军行军速度倍率（闪电战高达 1.48×）
        public let marchSpeedMult: Double
        /// 进攻与平原突破百分比加成
        public let attackBonusPct: Double
        /// 防御与地形依托百分比加成
        public let defenseBonusPct: Double
        /// 攻城破城效率百分比加成
        public let siegeBonusPct: Double
        /// 海战与跨海协同百分比加成
        public let navalBonusPct: Double
        /// 冬季/恶劣气候损耗折减（0.5 = 减半）
        public let winterAttritionMult: Double
        /// 敌军在本土占领区的补给损耗倍率（游击持久战达 1.75×）
        public let enemySupplyDrainMult: Double
        /// 适用时代（空数组代表全时代可选）
        public let modernOnly: Bool
    }

    public static let catalog: [DoctrineId: Spec] = [
        .blitzkrieg: Spec(
            id: .blitzkrieg,
            name: "闪电战 · 机动装甲学说",
            shortTag: "闪电战",
            summary: "装甲集群高速穿插与近距航空支援：陆军行军 +48%、突击火力 +34%、攻城破防 +25%，善在平原一举合围歼灭敌军主力。",
            marchSpeedMult: 1.48,
            attackBonusPct: 34.0,
            defenseBonusPct: -4.0,
            siegeBonusPct: 25.0,
            navalBonusPct: 4.0,
            winterAttritionMult: 1.15,
            enemySupplyDrainMult: 1.0,
            modernOnly: true
        ),
        .deepBattle: Spec(
            id: .deepBattle,
            name: "大纵深战役学说",
            shortTag: "大纵深",
            summary: "宽正面多梯队连续突破与严寒铁血反击：进攻 +22%、防御 +14%、攻城 +20%、冬季严寒减耗 50%。",
            marchSpeedMult: 1.16,
            attackBonusPct: 22.0,
            defenseBonusPct: 14.0,
            siegeBonusPct: 20.0,
            navalBonusPct: 0.0,
            winterAttritionMult: 0.50,
            enemySupplyDrainMult: 1.35,
            modernOnly: true
        ),
        .protractedGuerrilla: Spec(
            id: .protractedGuerrilla,
            name: "持久战与人民游击战",
            shortTag: "持久游击",
            summary: "以空间换时间、依托山地河网与敌后游击消耗强敌：本土与山地防御 +38%、敌军占领后勤消耗 ×1.75、军团韧性极强。",
            marchSpeedMult: 1.12,
            attackBonusPct: 6.0,
            defenseBonusPct: 38.0,
            siegeBonusPct: 4.0,
            navalBonusPct: 0.0,
            winterAttritionMult: 0.72,
            enemySupplyDrainMult: 1.75,
            modernOnly: false
        ),
        .carrierTaskForce: Spec(
            id: .carrierTaskForce,
            name: "海空一体 · 航母机动舰队",
            shortTag: "航母机动",
            summary: "航空母舰特混编队夺取制海制空权并掩护两栖登陆：海战火力 +36%、陆海突击 +18%、跨海登岛势如破竹。",
            marchSpeedMult: 1.18,
            attackBonusPct: 18.0,
            defenseBonusPct: 8.0,
            siegeBonusPct: 15.0,
            navalBonusPct: 36.0,
            winterAttritionMult: 0.95,
            enemySupplyDrainMult: 1.0,
            modernOnly: true
        ),
        .wolfpack: Spec(
            id: .wolfpack,
            name: "狼群战术 · 潜艇破交战",
            shortTag: "狼群破交",
            summary: "远洋潜艇集群绞杀敌方海上补给线与商船队：海战破交 +30%、陆军突击 +14%、重创海洋帝国后勤。",
            marchSpeedMult: 1.14,
            attackBonusPct: 14.0,
            defenseBonusPct: 8.0,
            siegeBonusPct: 10.0,
            navalBonusPct: 30.0,
            winterAttritionMult: 0.95,
            enemySupplyDrainMult: 1.0,
            modernOnly: true
        ),
        .superiorFirepower: Spec(
            id: .superiorFirepower,
            name: "优势火力 · 重炮空地协同",
            shortTag: "优势火力",
            summary: "以雄厚工业产能倾泻压倒性炮火与轰炸：进攻火力 +28%、攻城破垒 +42%、海空火力 +16%。",
            marchSpeedMult: 1.06,
            attackBonusPct: 28.0,
            defenseBonusPct: 12.0,
            siegeBonusPct: 42.0,
            navalBonusPct: 16.0,
            winterAttritionMult: 0.90,
            enemySupplyDrainMult: 1.0,
            modernOnly: true
        ),
        .grandBattleplan: Spec(
            id: .grandBattleplan,
            name: "要塞防线与计划战役",
            shortTag: "要塞防线",
            summary: "构筑纵深堑壕与重型要塞防线（如马奇诺/曼纳海姆线）：防御 +34%、攻城准备 +18%，但高速机动略逊。",
            marchSpeedMult: 0.94,
            attackBonusPct: 10.0,
            defenseBonusPct: 34.0,
            siegeBonusPct: 18.0,
            navalBonusPct: 8.0,
            winterAttritionMult: 0.85,
            enemySupplyDrainMult: 1.25,
            modernOnly: false
        ),
        .classicalManeuver: Spec(
            id: .classicalManeuver,
            name: "古典兵法 · 铁骑奇正阵法",
            shortTag: "奇正阵法",
            summary: "冷兵器与火器时代名将机动奇袭（铁骑突击、鹤翼包抄、背水一战）：行军 +20%、野战 +18%、防御 +12%。",
            marchSpeedMult: 1.20,
            attackBonusPct: 18.0,
            defenseBonusPct: 12.0,
            siegeBonusPct: 14.0,
            navalBonusPct: 12.0,
            winterAttritionMult: 0.90,
            enemySupplyDrainMult: 1.0,
            modernOnly: false
        ),
    ]

    public static func spec(_ id: DoctrineId) -> Spec {
        catalog[id] ?? catalog[.classicalManeuver]!
    }

    public static func allSpecs(for era: HistoricalEra) -> [Spec] {
        let modern = (era == .ww1 || era == .ww2 || era == .modern)
        return DoctrineId.allCases.compactMap { catalog[$0] }.filter { modern || !$0.modernOnly }
    }

    /// 依据历史剧本与国家身份自动匹配真实史实初始军事学说。
    public static func defaultDoctrine(scenarioId: String?, specId: String, culture: String, era: HistoricalEra) -> DoctrineId {
        let sid = specId.lowercased()
        let sc = (scenarioId ?? "").lowercased()
        if era == .ww2 || era == .modern || sc.contains("ww2") || sc.contains("1936") || sc.contains("1939") || sc.contains("1941") || sc.contains("1931") || sc.contains("1950") {
            if sid.contains("germany") || sid.contains("prussia") || sid == "west_germany" { return .blitzkrieg }
            if sid.contains("ussr") || sid.contains("soviet") { return .deepBattle }
            if sid.contains("japan") || sid.contains("kwantung") || sid.contains("usa") || sid == "us_pacific" { return .carrierTaskForce }
            if sid.contains("china") || sid.contains("roc") || sid.contains("cpc") || sid.contains("yanan") || sid.contains("northeast") || sid.contains("soviet_cn") || sid.contains("shanxi") || sid.contains("guangxi") || sid.contains("sichuan") {
                return .protractedGuerrilla
            }
            if sid.contains("france") || sid.contains("finland") || sid.contains("switz") || sid.contains("czech") || sid.contains("belgium") || sid.contains("netherlands") {
                return .grandBattleplan
            }
            if sid.contains("uk") || sid.contains("britain") || sid.contains("india") || sid.contains("malaya") || sid.contains("australia") {
                return .superiorFirepower
            }
            if sid.contains("italy") { return .wolfpack }
            return .superiorFirepower
        }
        if era == .ww1 || sc.contains("1914") {
            if sid.contains("germany") { return .blitzkrieg }
            if sid.contains("france") || sid.contains("belgium") || sid.contains("serbia") { return .grandBattleplan }
            if sid.contains("uk") || sid.contains("britain") { return .superiorFirepower }
            if sid.contains("russia") { return .deepBattle }
            return .grandBattleplan
        }
        if culture == "mongol" || culture == "turkic" || culture == "japanese" || culture == "french" || culture == "chinese" || culture == "roman" {
            return .classicalManeuver
        }
        return .classicalManeuver
    }

    // MARK: - 存取与切换

    public static func doctrineId(_ r: JS, nationId: String) -> DoctrineId {
        guard !r.regimes.isNull else { return .classicalManeuver }
        if !r.regimes.doctrines.isNull,
           let raw = r.regimes.doctrines[nationId].optionalString,
           let parsed = DoctrineId(rawValue: raw) {
            return parsed
        }
        let era = HistoricalEra.current(r)
        let scId = r.regimes.historicalScenarioId.optionalString
        let specId = r.regimes.historicalSpecIds.isNull ? "" : (r.regimes.historicalSpecIds[nationId].optionalString ?? "")
        let culture = r.civilization.isNull ? "" : (r.civilization.nations[nationId].cultureId.optionalString ?? "")
        return defaultDoctrine(scenarioId: scId, specId: specId, culture: culture, era: era)
    }

    public static func doctrine(_ r: JS, nationId: String) -> Spec {
        spec(doctrineId(r, nationId: nationId))
    }

    @discardableResult
    public static func setDoctrine(_ r: JS, nationId: String, doctrineId: DoctrineId, announce: Bool = true) -> (ok: Bool, reason: String) {
        Regimes.enable(r)
        if r.regimes.doctrines.isNull { r.regimes.doctrines = .object() }
        let sp = spec(doctrineId)
        r.regimes.doctrines[nationId] = JS(doctrineId.rawValue)
        if announce {
            _ = People.announce(
                r, kind: "military",
                text: "\(Vassals.name(r, nationId))确立【\(sp.name)】军事学说",
                reason: sp.summary,
                nations: [nationId], province: nil
            )
        }
        return (true, "已切换为「\(sp.name)」")
    }

    // MARK: - 战役限时奇袭 / 闪电战 Buff

    /// 赋予某国限时战役突击/防御/行军/海空加成（由真实历史事件触发，如白色方案闪电战、偷袭珍珠港、莫斯科反攻）。
    public static func grantCampaignBuff(
        _ r: JS,
        nationId: String,
        label: String,
        attackPct: Double = 0,
        defensePct: Double = 0,
        speedMult: Double = 1.0,
        navalPct: Double = 0,
        durationDays: Int = 120
    ) {
        guard !r.regimes.isNull else { return }
        if r.regimes.campaignBuffs.isNull { r.regimes.campaignBuffs = .object() }
        let untilDay = (r.world.day.optionalNumber.map(Int.init) ?? 0) + max(15, durationDays)
        let b = JS.object()
        b.label = JS(label)
        b.attackPct = JS(attackPct)
        b.defensePct = JS(defensePct)
        b.speedMult = JS(speedMult)
        b.navalPct = JS(navalPct)
        b.untilDay = JS(untilDay)
        r.regimes.campaignBuffs[nationId] = b
    }

    public static func activeCampaignBuff(_ r: JS, nationId: String) -> (label: String, attackPct: Double, defensePct: Double, speedMult: Double, navalPct: Double)? {
        guard !r.regimes.isNull, !r.regimes.campaignBuffs.isNull else { return nil }
        let b = r.regimes.campaignBuffs[nationId]
        guard !b.isNull else { return nil }
        let nowDay = r.world.day.optionalNumber.map(Int.init) ?? 0
        let untilDay = b.untilDay.asInt
        guard nowDay <= untilDay else { return nil }
        return (
            label: b.label.optionalString ?? "战役突击",
            attackPct: b.attackPct.optionalNumber ?? 0,
            defensePct: b.defensePct.optionalNumber ?? 0,
            speedMult: b.speedMult.optionalNumber ?? 1.0,
            navalPct: b.navalPct.optionalNumber ?? 0
        )
    }

    // MARK: - 真实历史名将自动编配军团与舰队

    public struct CommanderBadge: Sendable, Equatable {
        public let personId: Int
        public let name: String
        public let title: String
        public let military: Int
        public let tacticTag: String
    }

    /// 依据将领姓名/特质推导其专属标志战术标签（供军团面板与战报展示）。
    public static func signatureTactic(name: String, traits: [String], doctrine: Spec) -> String {
        if name.contains("古德里安") || name.contains("曼施坦因") || name.contains("隆美尔") || name.contains("莫德尔") {
            return "闪电战·装甲穿插"
        }
        if name.contains("朱可夫") || name.contains("罗科索夫斯基") || name.contains("华西列夫斯基") || name.contains("科涅夫") {
            return "大纵深·钳形合围"
        }
        if name.contains("山本五十六") || name.contains("南云") || name.contains("尼米兹") || name.contains("哈尔西") {
            return "航母机动·海空奇袭"
        }
        if name.contains("邓尼茨") || name.contains("雷德尔") {
            return "狼群战术·破交封锁"
        }
        if name.contains("薛岳") { return "天炉战法·诱敌合围" }
        if name.contains("白崇禧") || name.contains("李宗仁") || name.contains("孙立人") { return "焦土抗战·机动反击" }
        if name.contains("彭德怀") || name.contains("林彪") || name.contains("粟裕") || name.contains("刘伯承") {
            return "运动歼敌·穿插伏击"
        }
        if name.contains("山下奉文") { return "银轮闪击·两栖奇袭" }
        if name.contains("蒙哥马利") || name.contains("艾森豪威尔") { return "重炮协同·步坦推进" }
        if name.contains("巴顿") || name.contains("戴高乐") { return "装甲突击·纵深追击" }
        if name.contains("曼纳海姆") { return "雪原游击·莫蒂分割" }
        if name.contains("拿破仑") || name.contains("达武") || name.contains("缪拉") { return "中央突破·胸甲骑兵冲锋" }
        if name.contains("诸葛亮") || name.contains("周瑜") || name.contains("曹操") || name.contains("韩信") || name.contains("白起") {
            return "奇正相生·十面埋伏"
        }
        if traits.contains("NavalMastery") || traits.contains("ShipMaster") { return "联合舰队·制海突击" }
        if traits.contains("Conqueror") || traits.contains("Tactician") { return "\(doctrine.shortTag)·锋矢突破" }
        if traits.contains("BattleHardened") || traits.contains("Strategist") { return "\(doctrine.shortTag)·稳扎稳打" }
        return doctrine.shortTag
    }

    /// 将各国真实史实将领（`WarCommander`/`Admiral`/高军事人物）自动编配到现役军团，确保前线主力由真实名将统率。
    public static func assignHistoricalCommanders(_ r: JS) {
        guard UnitKinds.enabled, !r.regimes.isNull, !r.world.isNull, !r.world.armies.isNull else { return }
        if r.regimes.armyCommanders.isNull { r.regimes.armyCommanders = .object() }

        // 按国别收集存活的史实将领与军事人才（按军事值降序）
        var generalsByState = [Int: [JS]]()
        if !r.kin.isNull && !r.kin.persons.isNull {
            for (_, p) in r.kin.persons.objectEntries {
                guard p.isAlive.asBool else { continue }
                let sid = p.stateId.asInt
                guard sid > 0 else { continue }
                let mil = p.base.military.optionalNumber ?? 50
                let isHist = p.isHistoricallyImportant.isTruthy || p.source.optionalString == "historical-roster"
                let hasMilRole = p.roles.isArray && p.roles.asArray.contains {
                    let k = $0.nativeKind.optionalString ?? ""
                    return k == "WarCommander" || k == "Admiral" || k == "leader"
                }
                if isHist || hasMilRole || mil >= 72 {
                    generalsByState[sid, default: []].append(p)
                }
            }
        }
        for (sid, arr) in generalsByState {
            generalsByState[sid] = arr.sorted { a, b in
                let histA = (a.isHistoricallyImportant.isTruthy ? 1 : 0)
                let histB = (b.isHistoricallyImportant.isTruthy ? 1 : 0)
                if histA != histB { return histA > histB }
                let milA = a.base.military.optionalNumber ?? 50
                let milB = b.base.military.optionalNumber ?? 50
                if milA != milB { return milA > milB }
                return a.id.asInt < b.id.asInt
            }
        }

        // 记录已上任的将领，优先把未出任的顶级名将编入无主军团
        var usedPersonIds = Set<Int>()
        for a in r.world.armies.asArray {
            let aid = a.id.asString
            let cur = r.regimes.armyCommanders[aid]
            if !cur.isNull {
                let pid = cur.personId.asInt
                if pid > 0, let p = People.person(r, pid), p.isAlive.asBool {
                    usedPersonIds.insert(pid)
                } else {
                    r.regimes.armyCommanders.delete(aid)
                }
            }
        }

        for a in r.world.armies.asArray {
            let aid = a.id.asString
            guard r.regimes.armyCommanders[aid].isNull else { continue }
            let nid = a.nationId.asString
            let sid = Offices.stateId(r, nid)
            guard let pool = generalsByState[sid], !pool.isEmpty else { continue }
            // 尽量不让文弱象征元首（如裕仁、乔治六世）亲自领军，优先派前线名将（古德里安/山本/朱可夫/薛岳等）
            let headId = Regimes.ruler(r, nid)?.id.asInt ?? -1
            let chosen = pool.first(where: { !usedPersonIds.contains($0.id.asInt) && $0.id.asInt != headId })
                ?? pool.first(where: { !usedPersonIds.contains($0.id.asInt) })
            guard let gen = chosen else { continue }
            let pid = gen.id.asInt
            usedPersonIds.insert(pid)
            let fullName = NativeEngine.displayPersonName(gen)
            let title = gen.historicalTitle.optionalString ?? "前线司令"
            let mil = Int((gen.base.military.optionalNumber ?? 70).rounded())
            let traits = gen.traits.isArray ? gen.traits.asArray.compactMap(\.optionalString) : []
            let doc = doctrine(r, nationId: nid)
            let tactic = signatureTactic(name: fullName, traits: traits, doctrine: doc)

            let rec = JS.object()
            rec.personId = JS(pid)
            rec.name = JS(fullName)
            rec.title = JS(title)
            rec.military = JS(mil)
            rec.tactic = JS(tactic)
            r.regimes.armyCommanders[aid] = rec
        }
    }

    public static func commander(_ r: JS, armyId: String) -> CommanderBadge? {
        guard !r.regimes.isNull, !r.regimes.armyCommanders.isNull else { return nil }
        let rec = r.regimes.armyCommanders[armyId]
        guard !rec.isNull, let name = rec.name.optionalString, !name.isEmpty else { return nil }
        return CommanderBadge(
            personId: rec.personId.asInt,
            name: name,
            title: rec.title.optionalString ?? "将领",
            military: max(10, min(100, rec.military.asInt)),
            tacticTag: rec.tactic.optionalString ?? ""
        )
    }

    // MARK: - 综合战斗与行军实时倍率（供 Custom / Combat / Naval / Travel 调用）

    /// 计算攻击方相对于防守方的军事学说 + 战役限时突击加成（以百分比形式叠加至 combatBonus）。
    public static func combatModifiers(_ r: JS, attacker: String, victim: String) -> (attackPct: Double, defensePct: Double) {
        guard UnitKinds.enabled, !r.regimes.isNull, r.regimes.enabled.isTruthy else { return (0, 0) }
        let docA = doctrine(r, nationId: attacker)
        let docD = doctrine(r, nationId: victim)
        var atk = docA.attackBonusPct
        var def = docD.defenseBonusPct
        if let buffA = activeCampaignBuff(r, nationId: attacker) { atk += buffA.attackPct }
        if let buffD = activeCampaignBuff(r, nationId: victim) { def += buffD.defensePct }
        // 统计两军当前在阵名将的平均军事加成（95 军事名将可额外带来 +16% 战术加成）
        if !r.regimes.armyCommanders.isNull {
            let bestA = topCommanderBonusPct(r, nationId: attacker)
            let bestD = topCommanderBonusPct(r, nationId: victim)
            atk += bestA
            def += bestD * 0.75
        }
        return (atk, def)
    }

    /// 陆军行军速度综合倍率（闪电战 +48%、白色方案/黄色方案突击最高 1.65×）。
    public static func marchSpeedMultiplier(_ r: JS, nationId: String) -> Double {
        guard UnitKinds.enabled, !r.regimes.isNull, r.regimes.enabled.isTruthy else { return 1.0 }
        var mult = doctrine(r, nationId: nationId).marchSpeedMult
        if let buff = activeCampaignBuff(r, nationId: nationId) {
            mult *= max(0.75, min(1.45, buff.speedMult))
        }
        return max(0.75, min(1.85, mult))
    }

    /// 海战学说与战役奇袭综合倍率（航母机动舰队 +36%、偷袭珍珠港奇袭 +30%）。
    public static func navalCombatMultiplier(_ r: JS, nationId: String) -> Double {
        guard UnitKinds.enabled, !r.regimes.isNull, r.regimes.enabled.isTruthy else { return 1.0 }
        var pct = doctrine(r, nationId: nationId).navalBonusPct
        if let buff = activeCampaignBuff(r, nationId: nationId) {
            pct += buff.navalPct
        }
        return max(0.75, min(1.85, 1.0 + pct / 100.0))
    }

    private static func topCommanderBonusPct(_ r: JS, nationId: String) -> Double {
        var bestMil = 60
        for a in r.world.armies.asArray where a.nationId.optionalString == nationId {
            let rec = r.regimes.armyCommanders[a.id.asString]
            if !rec.isNull {
                let m = rec.military.asInt
                if m > bestMil { bestMil = m }
            }
        }
        return max(0.0, min(18.0, Double(bestMil - 62) * 0.48))
    }
}
