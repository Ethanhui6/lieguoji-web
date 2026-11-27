import Foundation

/// 治乱 (app rules): what a ruler and a state's institutions are worth, the great risings that take whole
/// regions at once (after the original's 大叛乱, 复国 and 潜在复国民族), and the reforms, culture and religion
/// that fill the chronicle between wars. Every draw is a hash of the state and the month.
extension Regimes {
    // MARK: 属性的分量

    public struct Leverage: Sendable { public var attack = 0.0, defense = 0.0, income = 0.0, growth = 0.0, stability = 0.0, corruption = 0.0 }
    static var leverageCache: (world: ObjectIdentifier, day: Double, values: [String: Leverage])?
    /// What the ruler's abilities, the state's fortune, its corruption, debts and institutions add up to.
    public static func leverage(_ r: JS, _ id: String) -> Leverage {
        let day = r.world.day.optionalNumber ?? 0, world = ObjectIdentifier(r)
        if leverageCache?.world != world || leverageCache?.day != day { leverageCache = (world, day, [:]) }
        if let v = leverageCache?.values[id] { return v }
        let v = computeLeverage(r, id)
        leverageCache?.values[id] = v
        return v
    }
    // MARK: 君主治乱评估、疆域行政负荷与统帅战力

    public struct RulerAssessment: Sendable {
        /// -2 昏君/暴君, -1 庸主, 0 守成之主, +1 明君, +2 圣主/雄主
        public let tier: Int
        public let label: String
        public let attack: Double
        public let defense: Double
        public let income: Double
        public let stability: Double
        public let corruption: Double
        public let summary: String
    }

    /// 评估在位实际掌权者是明君、守成之主还是昏君（v5.0 大幅放大明君与昏君对国运、税赋、战力与政局的决定性影响）。
    public static func rulerAssessment(_ r: JS, _ id: String) -> RulerAssessment {
        guard !r.regimes.isNull, r.regimes.enabled.isTruthy else {
            return RulerAssessment(tier: 0, label: "常主", attack: 0, defense: 0, income: 0, stability: 0, corruption: 0, summary: "")
        }
        let leaderId = r.people.nations[id].leaderId.optionalNumber
        let leaderPerson = leaderId.flatMap { People.person(r, Int($0)) }
        guard let p = governor(r, id) ?? leaderPerson, !p.base.isNull, p.isAlive.isTruthy else {
            return RulerAssessment(tier: -1, label: "虚位无主", attack: -10, defense: -8, income: -12, stability: -12, corruption: 8, summary: "朝廷无主 · 攻−10% · 税−12% · 安定−12")
        }
        let s = People.skills(p)
        let avg = (s.military + s.administrative + s.charisma) / 3.0
        let traits = Set(p.traits.isNull ? [] : p.traits.asArray.compactMap(\.optionalString))
        let badKeys: Set<String> = ["Incompetent", "Tyrant", "Extravagant", "Cruel", "Craven", "Greedy", "Stubborn", "Unconvincing"]
        let goodKeys: Set<String> = ["Genius", "Visionary", "Tactician", "Conqueror", "Lawgiver", "Diligent", "Benevolent", "Beloved", "Administrator", "Reformer", "Just", "NaturalLeader"]
        let badCount = traits.intersection(badKeys).count
        let goodCount = traits.intersection(goodKeys).count
        let score = avg + Double(goodCount) * 7.5 - Double(badCount) * 9.5

        if traits.contains("Incompetent") || traits.contains("Tyrant") || score < 38 || (badCount >= 2 && avg < 52) {
            let label = (traits.contains("Tyrant") || traits.contains("Cruel")) ? "暴君失道" : "昏君误国"
            return RulerAssessment(
                tier: -2, label: label,
                attack: -18, defense: -16, income: -22, stability: -18, corruption: 14,
                summary: "\(label) · 攻−18% 守−16% · 税−22% · 安定−18 · 腐化+14"
            )
        } else if score < 47 {
            return RulerAssessment(
                tier: -1, label: "庸主疲政",
                attack: -8, defense: -8, income: -10, stability: -8, corruption: 6,
                summary: "庸主疲政 · 攻守−8% · 税−10% · 安定−8 · 腐化+6"
            )
        } else if score >= 78 || (avg >= 72 && goodCount >= 2) {
            return RulerAssessment(
                tier: 2, label: "雄主圣明",
                attack: 22, defense: 18, income: 24, stability: 18, corruption: -12,
                summary: "雄主圣明 · 攻+22% 守+18% · 税+24% · 安定+18 · 腐化−12"
            )
        } else if score >= 64 || (avg >= 60 && goodCount >= 1) {
            return RulerAssessment(
                tier: 1, label: "明君励治",
                attack: 12, defense: 10, income: 14, stability: 12, corruption: -8,
                summary: "明君励治 · 攻+12% 守+10% · 税+14% · 安定+12 · 腐化−8"
            )
        } else {
            return RulerAssessment(
                tier: 0, label: "守成之主",
                attack: 0, defense: 0, income: 0, stability: 0, corruption: 0,
                summary: "守成之主 · 政局持中"
            )
        }
    }

    public struct RealmStrain: Sendable {
        public let provinces: Int
        /// < 0 小邦精治, 0 均衡疆域, > 0 大国过扩冗耗
        public let level: Int
        public let label: String
        public let attackDrag: Double
        public let defenseBonus: Double
        public let incomeDelta: Double
        public let stabilityDelta: Double
        public let corruptionDelta: Double
        public let summary: String
    }

    /// 评估疆域行政负荷：小国（≤6 州）享「小邦精治守土」高凝聚加成；超级大国（>18 州）承受真实的「疆域过扩冗耗」税赋/腐化/战线拖累。
    public static func realmStrain(_ r: JS, _ id: String) -> RealmStrain {
        _ = grit(r, id)
        let n = gritCache?.counts[id] ?? 0
        guard UnitKinds.enabled, !r.regimes.isNull, r.regimes.enabled.isTruthy, n > 0 else {
            return RealmStrain(provinces: n, level: 0, label: "疆域适中", attackDrag: 0, defenseBonus: 0, incomeDelta: 0, stabilityDelta: 0, corruptionDelta: 0, summary: "")
        }
        if n <= 6 {
            let bonusDef = Double(7 - n) * 2.5 // 1省+15%，6省+2.5%
            let bonusInc = Double(7 - n) * 2.0 // 小国精干行政效率
            return RealmStrain(
                provinces: n, level: -1, label: "小邦精治",
                attackDrag: 0, defenseBonus: bonusDef, incomeDelta: bonusInc,
                stabilityDelta: 7, corruptionDelta: -5,
                summary: "小邦精治 · 守御+\(Int(bonusDef.rounded()))% · 岁入+\(Int(bonusInc.rounded()))% · 安定+7 · 腐化−5"
            )
        }
        if n > 18 {
            let over = Double(n - 18)
            let prof = styleProfile(r, id)
            let adminLv = WorldDepth.techLevel(r, nation: id, branch: .statecraft)
            let relief: Double = (adminLv >= 3 ? 0.25 : 0.0) + (prof.id == "federal" || prof.camp == .constitutional ? 0.15 : 0.0)
            let factor = max(0.55, 1.0 - relief)
            let atkDrag = -min(22.0, over * 1.15 * factor)
            let incDelta = -min(24.0, over * 0.95 * factor)
            let staDelta = -min(26.0, over * 1.25 * factor)
            let corDelta = min(22.0, over * 0.72 * factor)
            let severe = n >= 30
            let lbl = severe ? "帝国过扩" : "疆广耗繁"
            return RealmStrain(
                provinces: n, level: severe ? 2 : 1, label: lbl,
                attackDrag: atkDrag, defenseBonus: 0, incomeDelta: incDelta,
                stabilityDelta: staDelta, corruptionDelta: corDelta,
                summary: "\(lbl)（\(n)州）· 远征攻\(Int(atkDrag.rounded()))% · 岁入\(Int(incDelta.rounded()))% · 安定\(Int(staDelta.rounded())) · 腐化+\(Int(corDelta.rounded()))"
            )
        }
        return RealmStrain(provinces: n, level: 0, label: "疆域适中", attackDrag: 0, defenseBonus: 0, incomeDelta: 0, stabilityDelta: 0, corruptionDelta: 0, summary: "疆域适中（\(n)州）· 政令通达")
    }

    public struct ActiveCommander: Sendable {
        public let personId: Int
        public let name: String
        public let roleTitle: String
        public let military: Int
        public let traits: [String]
        /// 战场总战力增减百分比（如 +34 或 -20）
        public let combatBonusPct: Int
        public let siegeBonusPct: Int
    }

    /// 查出某国当前执掌野战的主将（优先对敌征讨大将 WarCommander → 大元帅 Marshal → 亲征君主）及其真实战场统帅加成。
    public static func activeCommander(_ r: JS, nation: String, enemy: String?) -> ActiveCommander? {
        var person: JS? = nil
        var roleTitle = "亲征君主"
        if !r.offices47.isNull {
            if let enemy, !r.people.nations[enemy].isNull,
               let c = Offices.holder(r, nation, "WarCommander", r.people.nations[enemy].id.asInt) {
                person = c; roleTitle = "征讨大将"
            } else if let m = Offices.holder(r, nation, "Marshal", Offices.stateId(r, nation)) {
                person = m; roleTitle = "全军统帅"
            }
        }
        if person == nil {
            let lid = r.people.nations[nation].leaderId
            person = governor(r, nation) ?? (lid.isNull ? nil : People.person(r, lid.asInt))
        }
        guard let p = person, p.isAlive.isTruthy else { return nil }
        let mil = People.skills(p).military
        let rawTraits = p.traits.isNull ? [] : p.traits.asArray.compactMap(\.optionalString)
        var pct = (mil - 50.0) * 0.92 // 90武 → +37%，20武 → -28%
        var siege = (mil - 50.0) * 0.45
        for t in rawTraits {
            switch t {
            case "Tactician", "Strategist", "BattleHardened", "Veteran": pct += 10; siege += 6
            case "Conqueror", "Brave", "Unifier", "Genius": pct += 8; siege += 8
            case "Incompetent", "Craven": pct -= 14; siege -= 10
            case "WarWeary": pct -= 8
            default: break
            }
        }
        let clampedPct = max(-32, min(52, Int(pct.rounded())))
        let clampedSiege = max(-20, min(35, Int(siege.rounded())))
        let labels = rawTraits.prefix(3).map { MonarchLore.extraByKey[$0]?.label ?? Nobility.trait($0)?.name.optionalString ?? $0 }
        return ActiveCommander(
            personId: p.id.asInt,
            name: NativeEngine.displayPersonName(p),
            roleTitle: roleTitle,
            military: Int(mil.rounded()),
            traits: labels,
            combatBonusPct: clampedPct,
            siegeBonusPct: clampedSiege
        )
    }

    /// v5.2.0 君主与统帅军事谋略（直接决定军队 AI 战术智商：合围补刀、避实击虚、集结齐发、残兵保全 vs 昏君微操送死）。
    public struct TacticalIQ: Sendable {
        public let score: Int
        public let tier: Int
        public let label: String
        public let summary: String
        public let commanderName: String
        public let commanderMilitary: Int
        public let rulerMilitary: Int
        public let retreatRatio: Double
        public let retreatMorale: Double
        public let trapAbortRatio: Double
        public let musterPatience: Double
        public let focusWeight: Double
        public let retryTicks: Int
        public let blunderJitter: Double
    }

    public static func tacticalIQ(_ r: JS, nation: String, enemy: String? = nil) -> TacticalIQ {
        let cmd = activeCommander(r, nation: nation, enemy: enemy)
        let ldrId = r.people.nations[nation].leaderId
        let ldr = governor(r, nation) ?? (ldrId.isNull ? nil : People.person(r, ldrId.asInt))
        let rulerMil = ldr.map { Int(People.skills($0).military.rounded()) } ?? 50
        let cmdMil = cmd?.military ?? rulerMil
        let rEval = rulerAssessment(r, nation)

        // 统帅占 62%，君主/掌权者军事素养占 38%，并叠加明君/昏君与名将特质实效
        var raw = Double(cmdMil) * 0.62 + Double(rulerMil) * 0.38
        if let cmd {
            raw += Double(cmd.combatBonusPct) * 0.30
        }
        // 昏君掣肘与瞎指挥会直接拖垮军机智商；明君亲政则鼓舞全军令行禁止
        switch rEval.tier {
        case 2: raw += 10
        case 1: raw += 5
        case -1: raw -= 12
        case -2: raw -= 24
        default: break
        }
        let score = max(5, min(100, Int(raw.rounded())))
        let tier: Int
        let label: String
        let summary: String
        let retreatRatio: Double
        let retreatMorale: Double
        let trapAbortRatio: Double
        let musterPatience: Double
        let focusWeight: Double
        let retryTicks: Int
        let blunderJitter: Double

        if score >= 80 {
            tier = 2; label = "神机妙算"
            summary = "主帅\(cmd?.name ?? "中枢")用兵如神：主动合围孤敌、避实击虚、集结齐发、残军善退保全"
            retreatRatio = 1.32; retreatMorale = 34; trapAbortRatio = 1.42; musterPatience = 20; focusWeight = 1.55; retryTicks = 14; blunderJitter = 0
        } else if score >= 64 {
            tier = 1; label = "治军有方"
            summary = "主帅\(cmd?.name ?? "中枢")调度有法：协同推进、重视解围与补给，少作无谓孤军消耗"
            retreatRatio = 1.48; retreatMorale = 28; trapAbortRatio = 1.62; musterPatience = 17; focusWeight = 1.25; retryTicks = 17; blunderJitter = 0
        } else if score >= 44 {
            tier = 0; label = "循规蹈矩"
            summary = "军机按常法调度推进，攻守中规中矩"
            retreatRatio = 1.65; retreatMorale = 22; trapAbortRatio = 1.85; musterPatience = 14; focusWeight = 1.00; retryTicks = 20; blunderJitter = 12
        } else if score >= 28 {
            tier = -1; label = "用兵失度"
            summary = "君主或将帅武略偏弱：集结松散、偶有轻敌冒进与调度迟滞"
            retreatRatio = 2.05; retreatMorale = 15; trapAbortRatio = 2.45; musterPatience = 6; focusWeight = 0.65; retryTicks = 26; blunderJitter = 85
        } else {
            tier = -2; label = "昏君瞎指挥"
            summary = "朝堂掣肘、将帅庸碌：分兵添油、盲冲坚城、残军不知及时撤退"
            retreatRatio = 2.60; retreatMorale = 10; trapAbortRatio = 9.90; musterPatience = 3; focusWeight = 0.35; retryTicks = 32; blunderJitter = 165
        }
        return TacticalIQ(
            score: score, tier: tier, label: label, summary: summary,
            commanderName: cmd?.name ?? (ldr.map(NativeEngine.displayPersonName) ?? "无主帅"),
            commanderMilitary: cmdMil, rulerMilitary: rulerMil,
            retreatRatio: retreatRatio, retreatMorale: retreatMorale,
            trapAbortRatio: trapAbortRatio, musterPatience: musterPatience,
            focusWeight: focusWeight, retryTicks: retryTicks, blunderJitter: blunderJitter
        )
    }

    private static func computeLeverage(_ r: JS, _ id: String) -> Leverage {
        guard !r.regimes.isNull, r.regimes.enabled.isTruthy else { return Leverage() }
        var mil = 50.0, adm = 50.0, cha = 50.0
        if let leader = r.people.nations[id].leaderId.optionalNumber, let p = People.person(r, Int(leader)), !p.base.isNull, p.isAlive.isTruthy {
            let s = People.skills(p)
            mil = s.military; adm = s.administrative; cha = s.charisma
        }
        // 实际掌权者: where the head of government rules, the state is run by his abilities; the head of
        // state's charisma still counts for stability (legitimacy).
        let crown = cha
        let leaderPerson = r.people.nations[id].leaderId.optionalNumber.flatMap { People.person(r, Int($0)) }
        let activePerson = governor(r, id) ?? leaderPerson
        if let g = governor(r, id) { let s = People.skills(g); mil = s.military; adm = s.administrative; cha = s.charisma }
        let fortune = r.destiny.nations[id].destiny.optionalNumber ?? 50, graft = Finance.corruption(r, id), sum = reformSum(r, id)
        let prof = styleProfile(r, id)
        let pTrait = MonarchLore.traitEffects(of: activePerson)
        let goodsBonus = Trade.nationalBonuses(r, id)
        let cultDoc = CultureDoctrines.forNation(r, id)
        let amp = UnitKinds.enabled
        let rulerEval = amp ? rulerAssessment(r, id) : RulerAssessment(tier: 0, label: "", attack: 0, defense: 0, income: 0, stability: 0, corruption: 0, summary: "")
        let strain = realmStrain(r, id)
        let grand = GrandSystems.leverageBonus(r, nationId: id)
        let centMode = amp ? (r.regimes.nations[id].centralization.optionalString ?? "balanced") : "balanced"
        let centAtk: Double = centMode == "central" ? 8 : 0
        let centInc: Double = centMode == "central" ? 12 : (centMode == "autonomous" ? -10 : 0)
        let centGrowth: Double = centMode == "autonomous" ? 3 : 0
        let centStab: Double = centMode == "central" ? -6 : (centMode == "autonomous" ? 10 : 0)
        let centCorr: Double = centMode == "central" ? 5 : (centMode == "autonomous" ? -6 : 0)
        var l = Leverage()
        l.attack = (mil - 50) * (amp ? 1.25 : 0.8) + (fortune - 50) * 0.28 - graft * 0.18 + sum.attack + prof.attack + pTrait.attack + goodsBonus.attack + (cultDoc?.attack ?? 0) + rulerEval.attack + strain.attackDrag + grand.attack + centAtk
        l.defense = (mil - 50) * (amp ? 0.72 : 0.4) + (cha - 50) * (amp ? 0.38 : 0.2) + (fortune - 50) * 0.28 - graft * 0.14 + sum.defense + prof.defense + pTrait.defense + goodsBonus.defense + (cultDoc?.defense ?? 0) + rulerEval.defense + strain.defenseBonus + grand.defense
        l.income = (adm - 50) * (amp ? 1.25 : 0.8) - graft * 0.34 + sum.income + prof.income + pTrait.income + goodsBonus.income + (cultDoc?.income ?? 0) + rulerEval.income + strain.incomeDelta + grand.income + centInc
        l.growth = (adm - 50) * (amp ? 0.16 : 0.1) + (cha - 50) * (amp ? 0.14 : 0.1) + sum.growth + pTrait.growth + goodsBonus.growth + (cultDoc?.growth ?? 0) + grand.growth + centGrowth
        l.corruption = sum.corruption + prof.corruption + pTrait.corruption + (cultDoc?.corruption ?? 0) + rulerEval.corruption + strain.corruptionDelta + grand.corruption + centCorr
        _ = grit(r, id)
        let land = Double(gritCache?.counts[id] ?? 0), total = max(1, Double(gritCache?.counts.values.reduce(0, +) ?? 1))
        var owed = 0.0
        if !r.finance.nations[id].isNull { let income = max(1, monthlyIncome(r, id)); owed = min(15, debt(r, id) / income / 12 * 10) }
        l.stability = 60 + (adm - 50) * (amp ? 0.50 : 0.35) + (crown - 50) * (amp ? 0.54 : 0.35) + (fortune - 50) * 0.42 - graft * 0.45 - max(0, land - 10) - owed - (land / total > 0.3 ? 10 : 0) + sum.stability + prof.stability + pTrait.stability + goodsBonus.stability + (cultDoc?.stability ?? 0) + rulerEval.stability + strain.stabilityDelta + grand.stability + centStab
        return l
    }
    static func attributeMonth(_ r: JS, _ id: String, addGold: (Double) -> Void) {
        let l = leverage(r, id)
        if l.income != 0 { addGold(l.income / 100) }
        guard l.growth != 0 else { return }
        for p in monthLand(r, id) {
            if let s = monthStock(r, p.id.asString) {
                s.population = JS(max(100, (s.population.asNumber * (1 + l.growth / 1200)).rounded()))
            }
        }
    }

    // MARK: 制度

    public enum EraGroup: String, Sendable { case classic, modern, both }
    public struct Reform: Sendable {
        public let id: String, name: String
        let polities: [String]?
        let conflicts: [String]
        public let effect: Leverage
        public let eraGroup: EraGroup
        public init(id: String, name: String, polities: [String]?, conflicts: [String], effect: Leverage, eraGroup: EraGroup = .classic) {
            self.id = id; self.name = name; self.polities = polities; self.conflicts = conflicts; self.effect = effect; self.eraGroup = eraGroup
        }
        public var text: String {
            var parts = [String]()
            func add(_ label: String, _ v: Double, _ unit: String = "%") { if v != 0 { parts.append("\(label) \(v > 0 ? "+" : "−")\(Int(abs(v)))\(unit)") } }
            add("进攻", effect.attack); add("防御", effect.defense); add("岁入", effect.income); add("人口增长", effect.growth); add("安定", effect.stability, ""); add("腐化", effect.corruption, "")
            return parts.joined(separator: "，")
        }
    }
    public static func isModernEra(_ era: HistoricalEra) -> Bool {
        era == .ww1 || era == .ww2 || era == .modern
    }
    public static func reforms(for era: HistoricalEra) -> [Reform] {
        let modern = isModernEra(era)
        return reforms.filter { modern ? ($0.eraGroup == .modern || $0.eraGroup == .both) : ($0.eraGroup == .classic || $0.eraGroup == .both) }
    }
    public static let independentReformIds: Set<String> = [
        "audit", "parliament", "charter", "jungong", "knight", "minting", "liangshui", "tiaobian", "guild", "navyAct",
        "focus_four_year", "focus_five_year", "focus_lend_lease", "focus_blitz_armored",
        "focus_radar_airdef", "focus_carrier_fleet", "focus_people_war", "focus_atomic_proj"
    ]
    /// 专项制度行政承载上限（3–5 槽，随行政科技与掌权者治政能力扩容），彻底杜绝无脑全开叠加全部增益。
    public static func maxIndependentReforms(_ r: JS, _ id: String) -> Int {
        var cap = 3
        if WorldDepth.techLevel(r, nation: id, branch: .statecraft) >= 3 { cap += 1 }
        let leader = governor(r, id) ?? ruler(r, id)
        let adm = leader.map { People.skills($0).administrative } ?? 50
        if adm >= 74 { cap += 1 }
        return cap
    }
    public static let reforms: [Reform] = [
        // ================= 古典/中古/火药时代（传统帝制与近代早期国策） =================
        Reform(id: "keju", name: "科举取士", polities: ["Kingdom", "Empire"], conflicts: ["jiupin"], effect: Leverage(income: 3, stability: 4, corruption: -5)),
        Reform(id: "jiupin", name: "九品中正", polities: ["Kingdom", "Empire"], conflicts: ["keju"], effect: Leverage(defense: 5, stability: 3, corruption: 5)),
        Reform(id: "junxian", name: "郡县制", polities: ["Kingdom", "Empire", "Republic"], conflicts: ["fengjian"], effect: Leverage(income: 5, stability: 5, corruption: 2)),
        Reform(id: "fengjian", name: "分封诸侯", polities: ["Kingdom", "Empire", "Tribal"], conflicts: ["junxian"], effect: Leverage(defense: 9, income: -3, stability: -5)),
        Reform(id: "juntian", name: "均田令", polities: nil, conflicts: ["serf", "free"], effect: Leverage(income: 2, growth: 5, stability: 4)),
        Reform(id: "liangshui", name: "两税法", polities: nil, conflicts: ["tiaobian"], effect: Leverage(income: 9, growth: -2, corruption: 2)),
        Reform(id: "tiaobian", name: "一条鞭法", polities: nil, conflicts: ["liangshui"], effect: Leverage(income: 11, stability: -4, corruption: -3)),
        Reform(id: "fubing", name: "府兵制", polities: nil, conflicts: ["mubing", "conscription"], effect: Leverage(attack: -2, defense: 10, income: 3)),
        Reform(id: "mubing", name: "募兵制", polities: nil, conflicts: ["fubing", "conscription"], effect: Leverage(attack: 11, income: -6)),
        Reform(id: "jungong", name: "军功授爵", polities: ["Kingdom", "Empire", "Tribal"], conflicts: [], effect: Leverage(attack: 12, stability: -5, corruption: 3)),
        Reform(id: "knight", name: "骑士制度", polities: ["Kingdom", "Empire", "Theocracy"], conflicts: [], effect: Leverage(attack: 8, defense: 4, income: -6)),
        Reform(id: "guild", name: "行会特许", polities: ["Republic", "Federation", "Kingdom"], conflicts: [], effect: Leverage(defense: -2, income: 8, corruption: 4)),
        Reform(id: "serf", name: "农奴制", polities: ["Kingdom", "Empire", "Tribal"], conflicts: ["free", "juntian"], effect: Leverage(income: 6, growth: -5, stability: -5)),
        Reform(id: "free", name: "废除奴役", polities: nil, conflicts: ["serf", "juntian"], effect: Leverage(income: -3, growth: 6, stability: 5)),
        Reform(id: "parliament", name: "议会制度", polities: ["Republic", "Federation", "Kingdom"], conflicts: [], effect: Leverage(attack: -4, income: 4, stability: 8, corruption: -5)),
        Reform(id: "charter", name: "大宪章", polities: ["Kingdom", "Republic", "Federation"], conflicts: [], effect: Leverage(attack: -3, defense: 4, stability: 7, corruption: -6)),
        Reform(id: "sealock", name: "海禁", polities: nil, conflicts: ["seaopen", "navyAct"], effect: Leverage(defense: 4, income: -7, stability: 6)),
        Reform(id: "seaopen", name: "开海通商", polities: nil, conflicts: ["sealock"], effect: Leverage(defense: -2, income: 10, corruption: 3)),
        Reform(id: "stateChurch", name: "国教制度", polities: nil, conflicts: ["secular"], effect: Leverage(defense: 5, income: -2, stability: 5)),
        Reform(id: "secular", name: "政教分离", polities: ["Republic", "Federation", "Kingdom"], conflicts: ["stateChurch"], effect: Leverage(income: 5, stability: -2, corruption: -3)),
        Reform(id: "minting", name: "统一币制", polities: nil, conflicts: [], effect: Leverage(income: 8, stability: -2, corruption: -4)),
        Reform(id: "navyAct", name: "航海条例", polities: nil, conflicts: ["sealock"], effect: Leverage(attack: 4, defense: -3, income: 9)),
        Reform(id: "audit", name: "御史监察", polities: nil, conflicts: [], effect: Leverage(income: -2, stability: 5, corruption: -10)),
        Reform(id: "conscription", name: "义务兵役", polities: nil, conflicts: ["fubing", "mubing"], effect: Leverage(attack: 8, defense: 6, income: -4, growth: -3)),
        // ================= 一战 / 二战 / 冷战现代（HOI4 级经济法案·征兵法案·贸易法案·治理体制·专项国策） =================
        // 1. 经济动员法案（4 选 1）
        Reform(id: "econ_civilian", name: "民用经济", polities: nil, conflicts: ["econ_partial", "econ_war", "econ_total"], effect: Leverage(attack: -4, income: 9, growth: 6, stability: 8, corruption: -4), eraGroup: .modern),
        Reform(id: "econ_partial", name: "部分动员", polities: nil, conflicts: ["econ_civilian", "econ_war", "econ_total"], effect: Leverage(attack: 5, defense: 4, income: 4, stability: 2), eraGroup: .modern),
        Reform(id: "econ_war", name: "战时经济", polities: nil, conflicts: ["econ_civilian", "econ_partial", "econ_total"], effect: Leverage(attack: 11, defense: 8, income: -2, growth: -2, stability: -2), eraGroup: .modern),
        Reform(id: "econ_total", name: "总体战动员", polities: nil, conflicts: ["econ_civilian", "econ_partial", "econ_war"], effect: Leverage(attack: 16, defense: 12, income: -6, growth: -5, stability: -6), eraGroup: .modern),
        // 2. 现代征兵法案（4 选 1）
        Reform(id: "draft_volunteer", name: "志愿兵役", polities: nil, conflicts: ["draft_limited", "draft_extensive", "draft_alladults"], effect: Leverage(attack: -2, income: 6, growth: 5, stability: 6), eraGroup: .modern),
        Reform(id: "draft_limited", name: "有限征兵", polities: nil, conflicts: ["draft_volunteer", "draft_extensive", "draft_alladults"], effect: Leverage(attack: 4, defense: 4, income: 1, stability: 2), eraGroup: .modern),
        Reform(id: "draft_extensive", name: "广泛征兵", polities: nil, conflicts: ["draft_volunteer", "draft_limited", "draft_alladults"], effect: Leverage(attack: 10, defense: 8, income: -4, growth: -3, stability: -2), eraGroup: .modern),
        Reform(id: "draft_alladults", name: "全民皆兵", polities: nil, conflicts: ["draft_volunteer", "draft_limited", "draft_extensive"], effect: Leverage(attack: 14, defense: 14, income: -8, growth: -6, stability: -6), eraGroup: .modern),
        // 3. 贸易与工业路线（3 选 1）
        Reform(id: "trade_free", name: "自由贸易", polities: nil, conflicts: ["trade_export", "trade_autarky"], effect: Leverage(defense: -2, income: 12, growth: 3, corruption: -2), eraGroup: .modern),
        Reform(id: "trade_export", name: "重点出口", polities: nil, conflicts: ["trade_free", "trade_autarky"], effect: Leverage(attack: 3, income: 8, stability: 2), eraGroup: .modern),
        Reform(id: "trade_autarky", name: "战时统制经济", polities: nil, conflicts: ["trade_free", "trade_export"], effect: Leverage(attack: 6, defense: 7, income: -3, stability: 3), eraGroup: .modern),
        // 4. 现代国家治理体制（3 选 1）
        Reform(id: "gov_const_parl", name: "宪政议会监督", polities: nil, conflicts: ["gov_planned", "gov_wartime_ctrl"], effect: Leverage(income: 5, growth: 3, stability: 9, corruption: -8), eraGroup: .modern),
        Reform(id: "gov_planned", name: "计划经济统筹", polities: nil, conflicts: ["gov_const_parl", "gov_wartime_ctrl"], effect: Leverage(attack: 5, defense: 7, income: 6, stability: 4, corruption: -3), eraGroup: .modern),
        Reform(id: "gov_wartime_ctrl", name: "战时大本营统制", polities: nil, conflicts: ["gov_const_parl", "gov_planned"], effect: Leverage(attack: 11, defense: 6, stability: -3, corruption: 3), eraGroup: .modern),
        // 5. HOI4 专项战略国策（独立槽位，可按国情搭配）
        Reform(id: "focus_four_year", name: "四年重工军备计划", polities: nil, conflicts: ["focus_five_year"], effect: Leverage(attack: 9, income: 6, stability: -2, corruption: 2), eraGroup: .modern),
        Reform(id: "focus_five_year", name: "五年重工业计划", polities: nil, conflicts: ["focus_four_year"], effect: Leverage(defense: 8, income: 8, growth: -2, stability: 2), eraGroup: .modern),
        Reform(id: "focus_lend_lease", name: "租借法案与民主兵工厂", polities: nil, conflicts: [], effect: Leverage(attack: 5, defense: 6, income: 10, stability: 3), eraGroup: .modern),
        Reform(id: "focus_blitz_armored", name: "装甲集群闪击学说", polities: nil, conflicts: [], effect: Leverage(attack: 13, defense: -2, income: -4), eraGroup: .modern),
        Reform(id: "focus_radar_airdef", name: "本土雷达与防空网", polities: nil, conflicts: [], effect: Leverage(defense: 12, income: -2, stability: 5), eraGroup: .modern),
        Reform(id: "focus_carrier_fleet", name: "航母机动舰队决战", polities: nil, conflicts: [], effect: Leverage(attack: 9, defense: 5, income: -5), eraGroup: .modern),
        Reform(id: "focus_people_war", name: "持久战与敌后游击", polities: nil, conflicts: [], effect: Leverage(defense: 14, growth: 4, stability: 6, corruption: -4), eraGroup: .modern),
        Reform(id: "focus_atomic_proj", name: "绝密战略科研工程", polities: nil, conflicts: [], effect: Leverage(attack: 8, defense: 4, income: -6, corruption: -4), eraGroup: .modern),
    ]
    static func heldReforms(_ r: JS, _ id: String) -> [Reform] {
        guard !r.regimes.isNull, !r.regimes.nations[id].reforms.isNull else { return [] }
        let held = Set(r.regimes.nations[id].reforms.asArray.map(\.asString))
        return reforms.filter { held.contains($0.id) }
    }
    static func reformSum(_ r: JS, _ id: String) -> Leverage {
        var s = Leverage()
        for f in heldReforms(r, id) {
            s.attack += f.effect.attack; s.defense += f.effect.defense; s.income += f.effect.income; s.growth += f.effect.growth; s.stability += f.effect.stability; s.corruption += f.effect.corruption
        }
        return s
    }
    /// Turns an institution on (those it cannot stand beside are repealed) or off.
    static func setReform(_ r: JS, _ id: String, _ f: Reform, on: Bool) {
        let b = book(r, id)
        var held = b.reforms.isNull ? [String]() : b.reforms.asArray.map(\.asString)
        held.removeAll { $0 == f.id || (on && f.conflicts.contains($0)) }
        if on { held.append(f.id) }
        b.reforms = .array(held.map { JS($0) })
    }
    static func reformMonth(_ r: JS, _ n: JS, _ id: String, _ key: Int, addGold: (Double) -> Void) {
        let tag = "\(id)|\(key)|reform"
        guard chance(tag) < 0.035 else { return }
        let polity = r.civilization.nations[id].polity.optionalString ?? "Kingdom", held = heldReforms(r, id)
        let era = HistoricalEra.current(r)
        let pool = reforms(for: era)
        let open = pool.filter { f in
            guard !held.contains(where: { $0.id == f.id }) else { return false }
            guard f.polities?.contains(polity) ?? true else { return false }
            if f.id == "focus_atomic_proj" && era != .modern { return false }
            return true
        }
        guard !open.isEmpty else { return }
        let f = open[Int(draw(tag + "|which") % UInt32(open.count))]
        // At most five at once: the oldest gives way.
        if held.count >= 5, let oldest = book(r, id).reforms.asArray.first?.asString, let old = reforms.first(where: { $0.id == oldest }) { setReform(r, id, old, on: false) }
        let replaced = held.filter { f.conflicts.contains($0.id) }.map(\.name)
        setReform(r, id, f, on: true)
        addGold(-1)
        let verb = isModernEra(era) ? "颁行法案与国策" : "朝议既定，颁行天下"
        _ = People.announce(r, kind: "reform", text: "\(n.name.asString)推行\(f.name)", reason: (replaced.isEmpty ? "" : "废\(replaced.joined(separator: "、"))。") + "\(verb)，耗一月岁入：\(f.text)。", nations: [id], province: nil)
    }

    // MARK: 文化与宗教

    static func cultureMonth(_ r: JS, _ n: JS, _ id: String, _ key: Int, addGold: (Double) -> Void, addDestiny: (Double) -> Void) {
        let name = n.name.asString, tag = "\(id)|\(key)|culture"
        let land = monthLand(r, id)
        guard !land.isEmpty else { return }
        // 涵化: a province of another culture slowly takes the state's ways.
        let own = r.civilization.nations[id].cultureId.optionalString ?? ""
        if chance(tag + "|blend") < 0.06 {
            let ownedPids = Set(land.map(\.id.asString))
            let cities = r.world.cities.asArray.filter { c in ownedPids.contains(c.provinceId.asString) && r.civilization.cities[c.id.asString].cultureId.optionalString != own }
            if !cities.isEmpty {
                let c = cities[Int(draw(tag + "|city") % UInt32(cities.count))]
                r.civilization.cities[c.id.asString].cultureId = JS(own)
                _ = People.announce(r, kind: "culture", text: "\(c.name.asString)风俗渐同\(name)", reason: "移民杂处，语言衣冠日渐相同：该城文化改为本国文化，因信仰与文化而起的动乱随之减少。", nations: [id], province: c.provinceId.optionalString)
            }
        }
        guard chance(tag) < 0.05 else { return }
        func corrupt(_ d: Double) { Finance.setCorruption(r, id, Finance.corruption(r, id) + d) }
        func say(_ text: String, _ reason: String) { _ = People.announce(r, kind: "culture", text: text, reason: reason, nations: [id], province: nil) }
        switch Int(draw(tag + "|which") % 12) {
        case 0: addDestiny(2); say("\(name)诗文鼎盛", "文人辈出，名篇传诵：国运 +2。")
        case 1: addDestiny(1); corrupt(-3); say("\(name)百家争鸣", "学派林立，议论蜂起：国运 +1，腐化 −3。")
        case 2: addGold(-1); addDestiny(3); say("\(name)大修国史", "开馆修史，以正正统：耗一月岁入，国运 +3。")
        case 3: addGold(-1); corrupt(-4); say("\(name)广开书院", "兴学育才，士风一振：耗一月岁入，腐化 −4。")
        case 4: addGold(1); say("\(name)戏曲勃兴", "勾栏瓦舍，日夜笙歌：国库增一月岁入。")
        case 5: addGold(-2); addDestiny(4); say("\(name)营建宏伟宫阙", "大兴土木，四方来观：耗两月岁入，国运 +4。")
        case 6: addDestiny(1); say("\(name)颁行新历", "钦天监重定历法，农时不误：国运 +1。")
        case 7: addGold(1); addDestiny(1); say("\(name)改革文字", "书同文，政令通达：国库增一月岁入，国运 +1。")
        case 8: addDestiny(2); say("\(name)礼乐复兴", "重定礼制，朝会肃然：国运 +2。")
        case 9:
            for a in monthArmies(r, id) { a.morale = JS(min(100, a.morale.asNumber + 5)) }
            say("\(name)胡服骑射", "移风易俗，习练骑射：全军士气 +5。")
        case 10: addDestiny(-2); corrupt(3); say("\(name)奢靡成风", "竞相夸富，世风日下：国运 −2，腐化 +3。")
        default: addGold(2); addDestiny(1); say("\(name)文艺复兴", "巨匠云集，城邦争相延揽：国库增两月岁入，国运 +1。")
        }
    }

    static func religionMonth(_ r: JS, _ n: JS, _ id: String, _ key: Int, addGold: (Double) -> Void, addDestiny: (Double) -> Void) {
        let tag = "\(id)|\(key)|religion", name = n.name.asString
        guard chance(tag) < 0.04, let faith = r.civilization.nations[id].religionId.optionalString else { return }
        let land = monthLand(r, id), creed = creeds[faith]?.name ?? "本教"
        guard !land.isEmpty else { return }
        if r.regimes.faith.isNull { r.regimes.faith = .object() }
        func say(_ text: String, _ reason: String, _ p: JS? = nil) { _ = People.announce(r, kind: "religion", text: text, reason: reason, nations: [id], province: p?.id.optionalString) }
        func corrupt(_ d: Double) { Finance.setCorruption(r, id, Finance.corruption(r, id) + d) }
        let others = land.filter { provinceFaith(r, $0) != faith }, pick = Int(draw(tag + "|pick") >> 4)
        switch Int(draw(tag + "|which") % 10) {
        case 0: addGold(-1); addDestiny(3); say("\(name)大兴寺观", "敕建名刹，度僧万众：耗一月岁入，国运 +3。")
        case 1: addGold(3); addDestiny(-3); say("\(name)毁寺没产", "收寺田入官，勒僧尼还俗：国库增三月岁入，国运 −3。")
        case 2:
            for p in others.prefix(3) { r.regimes.faith[p.id.asString] = JS(faith) }
            say("\(name)传教四方", "僧侣遍行州县：至多三州改信\(creed)，异教动乱随之平息。")
        case 3:
            guard !others.isEmpty else { return }
            for p in others { r.regimes.faith[p.id.asString] = JS(faith) }
            addDestiny(-2); say("\(name)严禁异端", "捕杀邪教，焚其经卷：全国改信\(creed)，国运 −2。")
        case 4: addDestiny(2); corrupt(-2); say("\(name)高僧讲经", "万人空巷，朝野敬服：国运 +2，腐化 −2。")
        case 5:
            let p = land[pick % land.count]
            r.regimes.faith[p.id.asString] = JS("whiteLotus"); say("\(p.name.asString)秘密结社", "白莲香会暗中传习：该州信仰转为白莲教，动乱风险大增。", p)
        case 6: addGold(-1); addDestiny(2); say("\(name)遣使朝圣", "朝圣之旅往返万里：耗一月岁入，国运 +2。")
        case 7: corrupt(5); addGold(2); say("\(name)鬻牒敛财", "出卖度牒赎券，民怨沸腾：国库增两月岁入，腐化 +5。")
        case 8: addDestiny(-3); say("\(name)教门纷争", "诸派攻讦，互斥异端：国运 −3。")
        default: addDestiny(2); say("\(name)宗教宽容", "诏令诸教并存，各安其业：国运 +2。")
        }
    }

    // MARK: 大叛乱

    static let rebelLabels = ["peasant": "农民起义", "warlord": "军阀割据", "holy": "宗教起义", "secession": "藩镇独立", "restoration": "复国运动"]
    static let holyNames: [String: [String]] = [
        "chineseFolk": ["太平", "黄天", "五斗米", "天师", "玄元"],
        "daoism": ["太平", "黄天", "天师", "正一", "全真"],
        "quanzhen": ["全真", "重阳", "长春"], "zhengyi": ["天师", "龙虎", "正一"],
        "whiteLotus": ["白莲", "弥勒", "龙华", "明王", "红巾"], "manichean": ["明教", "光明", "摩尼"],
        "buddhism": ["净土", "弥勒", "法王", "莲华"], "chan": ["禅林", "曹溪"],
        "pureLand": ["净土", "莲邦"], "tiantai": ["天台", "法华"], "tantric": ["香巴拉", "雪域"],
        "islam": ["马赫迪", "绿旗", "星月", "麦地那"], "catholic": ["圣殿", "圣约", "十字", "拉丁"],
        "protestant": ["盟约", "新约", "日内瓦"], "orthodox": ["圣山", "圣索菲亚", "基辅"],
        "shinto": ["伊势", "八幡", "出云"], "hinduism": ["法轮", "毗湿奴", "湿婆"], "zoroastrian": ["圣火", "波斯波利斯"],
    ]
    private static func unusedName(_ r: JS, _ pool: [String], _ tag: String) -> String? {
        guard !pool.isEmpty else { return nil }
        let used = NamingCatalog.usedStateKeys(r)
        let start = Int(draw(tag) % UInt32(pool.count))
        return (0..<pool.count).lazy.map { pool[(start + $0) % pool.count] }.first {
            let cleaned = NamingCatalog.cleanStateBase($0)
            let key = NamingCatalog.canonicalStateKey(cleaned)
            return !cleaned.isEmpty && !used.contains(cleaned) && !used.contains(key)
        }
    }
    /// For Handover.swift (禅让): the same renaming.
    static func retitleState(_ r: JS, _ id: String, base: String?, style: String?) { retitle(r, id, base: base, style: style) }
    private static func retitle(_ r: JS, _ id: String, base: String?, style styleId: String?) {
        guard let n = r.world.nations.asArray.first(where: { $0.id.asString == id }) else { return }
        let c = r.civilization.nations[id], b = book(r, id)
        if let base, !base.isEmpty { c.name.value = JS(NamingCatalog.cleanStateBase(base)) }
        if let styleId, let s = styles.first(where: { $0.id == styleId }) { c.polity = JS(s.base); b.style = JS(styleId); b.parties = .null }
        let finalStyle = style(r, id)
        let culture = c.cultureId.optionalString ?? ""
        var currentBase = NamingCatalog.cleanStateBase(c.name.value.optionalString ?? MapLayers.stateLabel(n.name.asString, full: false))
        // 政体与基名现实校验：如改行现代共和/联邦/军政府而原名仍为纯朝代号，则自动更换为本文化地道地理名。
        if base == nil && b.nameTemplate.optionalString == nil && c.name.custom.isNull {
            let adapted = NamingCatalog.adaptBaseForStyle(base: currentBase, culture: culture, style: finalStyle, seed: "\(r.world.custom.seed.asString)|\(id)|\(finalStyle.id)|\(r.clock.tick.asInt)", used: NamingCatalog.usedStateKeys(r))
            if adapted != currentBase && !adapted.isEmpty {
                currentBase = adapted
                c.name.value = JS(adapted)
            }
        }
        n.name = JS(title(r, id, base: currentBase, style: finalStyle))
    }
    /// The rising's own notice says who rose and where: the routine founding line would only repeat it.
    private static func dropFoundingNotice(_ r: JS, _ name: String) {
        let founding: (JS) -> Bool = { $0.text.asString.hasPrefix(name) && $0.text.asString.contains("成立于") }
        r.chronicle.entries.asArray = r.chronicle.entries.asArray.filter { !founding($0) }
        r.world.events.asArray = r.world.events.asArray.filter { !founding($0) }
    }
    /// How many provinces a rising in this state takes with it.
    static func uprisingSize(_ r: JS, _ owner: String) -> Int {
        let land = r.world.provinces.asArray.reduce(0) { $1.controller.optionalString == owner ? $0 + 1 : $0 }
        // A rising shakes a realm without carving it in two: a fifth to over half of a great state used to go at once.
        let share = 0.1 + min(0.15, max(0, 55 - leverage(r, owner).stability) / 120)
        return max(2, min(12, Int(Double(land) * share)))
    }
    /// The land around `seed` that rises with it: connected, the owner's, never the capital.
    static func region(_ r: JS, _ owner: String, _ seed: String, _ size: Int, _ byId: [String: JS], sparing: Bool = true) -> [String] {
        let capital = sparing ? Rebellion.capitalProvince(r, owner) : nil
        var list = [seed], seen: Set<String> = [seed], i = 0
        while i < list.count && list.count < size {
            for q in byId[list[i]]?.neighbors.asArray.map(\.asString) ?? [] where !seen.contains(q) && list.count < size {
                seen.insert(q)
                if let p = byId[q], p.controller.asString == owner, q != capital { list.append(q) }
            }
            i += 1
        }
        return list
    }
    /// A rising: `seed` and the land around it leave `owner` at once for a restored state, a peasant host, a
    /// holy kingdom, a warlord or a breakaway province; the garrisons there go over and the owner goes to war.
    @discardableResult
    static func raise(_ r: JS, owner: String, seed: String, size: Int, kind wanted: String? = nil, restoring: String? = nil) -> (rebel: String, text: String)? {
        var byId = [String: JS](); for p in r.world.provinces.asArray { byId[p.id.asString] = p }
        guard !isBlank(r, owner), let p = byId[seed], p.controller.asString == owner, Rebellion.capitalProvince(r, owner) != seed,
              let city = r.world.cities.asArray.first(where: { $0.provinceId.asString == seed }) else { return nil }
        let land = region(r, owner, seed, max(1, size), byId), s = r.foundings, c = r.civilization
        let tag = "\(owner)|\(seed)|\(Int(r.clock.tick.asNumber))|rise", cityCulture = c.cities[city.id.asString].cultureId.optionalString ?? ""
        // 潜在复国民族：严格要求在该州有真实历史法理（coreMonths > 18）、复国次数 < 2 且亡国已满 3 年（1080 天），
        // 绝不再凭同文化随机复活任意亡国，彻底根治“占领一州就无限复国”。
        var heirs = [String]()
        if restoring == nil, wanted == nil || wanted == "restoration" {
            let months = s.coreMonths[seed]
            let nowDay = r.world.day.asNumber
            let maxRestores: Double = UnitKinds.enabled ? 2 : 3
            let minCoreMonths: Double = UnitKinds.enabled ? 18 : 6
            let eligible: (String) -> Bool = { nid in
                guard nid != owner && !Vassals.alive(r, nid) && !isBlank(r, nid) else { return false }
                if (r.sovereignty.restorations[nid].optionalNumber ?? 0) >= maxRestores { return false }
                if UnitKinds.enabled, !r.chronicle.ended.isNull, let endDay = r.chronicle.ended[nid].day.optionalNumber, nowDay - endDay < 1080 {
                    return false
                }
                return true
            }
            heirs = months.isNull ? [] : months.objectEntries.filter { $0.1.asNumber > minCoreMonths && eligible($0.0) }.map(\.0).sorted()
            if heirs.isEmpty && !UnitKinds.enabled {
                heirs = r.world.nations.asArray.map(\.id.asString).filter {
                    eligible($0) && c.nations[$0].cultureId.optionalString == cityCulture
                }.sorted()
            }
        }
        let restoreProb = UnitKinds.enabled ? 0.28 : 0.45
        let heir = restoring ?? (!heirs.isEmpty && (wanted == "restoration" || chance(tag + "|restore") < restoreProb) ? heirs[Int(draw(tag + "|heir") % UInt32(heirs.count))] : nil)
        if heir == nil && r.world.nations.length >= 160 { return nil }
        if wanted == "restoration" && heir == nil { return nil }
        let faith = provinceFaith(r, p) ?? "", stateFaith = c.nations[owner].religionId.optionalString ?? "", heretic = faith != stateFaith
        var kind = wanted ?? "secession"
        if wanted == nil {
            let weights: [(String, UInt32)] = [("peasant", Finance.corruption(r, owner) > 35 ? 4 : 2), ("warlord", 3), ("holy", heretic ? 2 : 0), ("secession", 4)]
            var roll = draw(tag + "|kind") % weights.reduce(0) { $0 + $1.1 }
            for (k, w) in weights { if roll < w { kind = k; break }; roll -= w }
        }
        if heir != nil { kind = "restoration" }
        let ownerName = Vassals.name(r, owner), inRegion = Set(land)
        if !r.nobility.isNull { for fam in r.nobility.families.objectValues { fam.controlledProvinces.asArray = fam.controlledProvinces.asArray.filter { !inRegion.contains($0.asString) } } }
        for q in land { RebelWar.destroyArmies(r, owner, q) }
        r.occupation.sieges.asArray = r.occupation.sieges.asArray.filter { !inRegion.contains($0.provinceId.asString) }
        let rebel: String
        if let heir {
            rebel = heir
            RebelWar.restore(r, heir, seed)
            for q in land.dropFirst() { if let x = byId[q] { PeaceBridge.transferEconomy(r, q, owner, heir); x.controller = JS(heir); x.legalOwner = JS(heir) } }
            Government.relocateLostCapitals(r); Wars.reconcileCore(r); Founding.reconcilePorts?(r)
        } else {
            rebel = Founding.foundState(r, parent: owner, provinces: land, reason: (rebelLabels[kind] ?? "叛乱") + "：\(land.count)州一同举事。").nationId.asString
            dropFoundingNotice(r, Vassals.name(r, rebel))
            switch kind {
            case "peasant":
                if cityCulture == "chinese" {
                    let dynPick = unusedName(r, NamingCatalog.dynastyPool(culture: "chinese"), tag + "|name")
                        ?? NamingCatalog.pickStateBase(culture: "chinese", mode: c.mode.optionalString ?? "historical-names", seed: tag + "|peasant", used: NamingCatalog.usedStateKeys(r), styleId: "dynasty")
                    let cleanPick = dynPick.map { NamingCatalog.cleanStateBase($0) } ?? ""
                    let validDyn = !cleanPick.isEmpty && (cleanPick.count == 1 || NamingCatalog.chineseCompleteMonarchyTitles.contains(cleanPick))
                    retitle(r, rebel, base: validDyn ? cleanPick : NamingCatalog.cleanStateBase(p.name.asString), style: validDyn ? "dynasty" : "peasant")
                } else {
                    let regPick = unusedName(r, NamingCatalog.modernRegionStates[cityCulture] ?? [], tag + "|peasant-reg") ?? NamingCatalog.cleanStateBase(p.name.asString)
                    retitle(r, rebel, base: regPick, style: "peasant")
                }
            case "warlord":
                let regPick = unusedName(r, NamingCatalog.modernRegionStates[cityCulture] ?? [], tag + "|warlord-reg") ?? NamingCatalog.cleanStateBase(p.name.asString)
                retitle(r, rebel, base: regPick, style: "warlord")
            case "holy":
                let creed = heretic ? faith : stateFaith
                if !creed.isEmpty { c.nations[rebel].religionId = JS(creed) }
                retitle(r, rebel, base: unusedName(r, holyNames[creed] ?? ["圣火", "天启", "神谕"], tag + "|name") ?? p.name.asString, style: "holy")
            default:
                if let extra = unusedName(r, NamingCatalog.historicalExtraStates[cityCulture] ?? [], tag + "|name"), chance(tag + "|extra") < 0.6 { retitle(r, rebel, base: extra, style: nil) }
            }
        }
        let rebelName = Vassals.name(r, rebel), label = rebelLabels[kind] ?? "叛乱"
        let text = "\(ownerName)爆发\(label)，\(rebelName)据有\(land.count)州"
        _ = People.announce(r, kind: "uprising", text: text, reason: "\(p.name.asString)率先举事，邻近州郡纷纷响应，驻军倒戈；\(ownerName)调兵平叛。", nations: [owner, rebel], province: seed)
        Wars.reconcileLosses(r); Vassals.reconcileAlliances(r); DiplomacyBridge.reconcile(r); Wars.reconcileIdentities(r)
        RebelWar.startInternalWar(r, rebel: rebel, mother: owner, casusBelli: 14, legacyType: 2)
        RebelWar.spawn(r, rebel, max(3, min(30, land.count * 2)))
        if UnitKinds.enabled && !r.regimes.isNull {
            if r.regimes.provRebelCD.isNull { r.regimes.provRebelCD = JS.object() }
            let cdUntil = r.world.day.asInt + 1800
            for q in land { r.regimes.provRebelCD[q] = JS(cdUntil) }
        }
        Rebellion.recordNew(r, s, owner)
        return (rebel, text)
    }
    /// Once a world-month: states that have lost the people's trust come apart.
    static func uprisingsMonth(_ r: JS, _ key: Int) {
        // App 模式：月度主权法理归属整合——和平实控满 24 月或原法理主权国已灭亡且未处于交战的州郡，正式归入当前实控国法理领土，
        // 避免残留旧法理引发反复割让/复国异常。
        if UnitKinds.enabled, !r.foundings.isNull {
            var activeWarPairs = Set<String>()
            if !r.nativeWars.isNull {
                for c in r.nativeWars.campaigns.asArray where c.endedTick.isNull {
                    let ids = c.nations.asArray.map(\.asString)
                    for i in 0..<ids.count {
                        for j in (i + 1)..<ids.count {
                            activeWarPairs.insert("\(ids[i])|\(ids[j])")
                            activeWarPairs.insert("\(ids[j])|\(ids[i])")
                        }
                    }
                }
            }
            var aliveSet = Set<String>()
            for p in r.world.provinces.asArray { aliveSet.insert(p.controller.asString) }
            for p in r.world.provinces.asArray {
                let ctrl = p.controller.asString
                guard let legal = p.legalOwner.optionalString, legal != ctrl else { continue }
                if activeWarPairs.contains("\(ctrl)|\(legal)") { continue }
                let pid = p.id.asString
                let legalDead = !aliveSet.contains(legal)
                let heldMonths = Rebellion.monthsSince(r, r.foundings.conquered[pid].time.asNumber)
                if legalDead || heldMonths >= 24 {
                    p.legalOwner = JS(ctrl)
                }
            }
        }
        let mode = Rebellion.rebelMode(r)
        guard mode != "off", rule(r, "rebel") > 0 else { return }
        guard !r.foundings.isNull, r.foundings.enabled.isTruthy else { return }
        // 修复开局首日大叛乱 bug：以真实已过游戏月数 `day / 30.0` 判断开局太平期，不再误用 `monthsSince(r, -10000)`。
        guard (r.world.day.asNumber / 30.0) >= Double(Tuning.current.calmMonths) else { return }
        let nowDay = r.world.day.asInt
        if mode == "historical" && nowDay < 720 { return }
        let cityPids = Set(r.world.cities.asArray.map(\.provinceId.asString))
        for n in r.world.nations.asArray {
            let id = n.id.asString
            guard monthLandCount(r, id) >= 5, !isBlank(r, id) else { continue }
            if mode == "historical" {
                let dest = r.destiny.isNull ? 50.0 : (r.destiny.nations[id].destiny.optionalNumber ?? 50.0)
                if dest >= 22 { continue }
            }
            let owned = monthLand(r, id)
            let b = book(r, id)
            let minGap: Double = UnitKinds.enabled ? 18 : 8
            if let last = b.lastUprising.optionalNumber, Double(key) - last < minGap { continue }
            var calm = leverage(r, id).stability
            if isAtWar(r, id) { calm -= 6 }
            let tag = "\(id)|\(key)|uprising"
            var risk = (max(0, 55 - calm) / 100 * 0.35 * Tuning.current.unrest + (owned.count > 20 ? 0.004 : 0)) * rule(r, "rebel")
            if mode == "historical" { risk *= 0.20 }
            guard chance(tag) < risk else { continue }
            let capital = Rebellion.capitalProvince(r, id)
            var weighted = [(String, UInt32)]()
            for p in owned where p.id.asString != capital && cityPids.contains(p.id.asString) {
                let pid = p.id.asString
                if UnitKinds.enabled {
                    // 战时占领地、新征服未满 24 个月的驻防绥靖区、或 5 年内刚起事过的州郡，不立即再次触发叛乱/复国。
                    if let legal = p.legalOwner.optionalString, legal != id { continue }
                    if !r.foundings.conquered[pid].isNull, Rebellion.monthsSince(r, r.foundings.conquered[pid].time.asNumber) < 24 { continue }
                    if !r.regimes.provRebelCD.isNull, let cd = r.regimes.provRebelCD[pid].optionalNumber, Double(nowDay) < cd { continue }
                    if Rebellion.provinceAtWar(r, pid) { continue }
                }
                let distance = r.upperCombat.provinces[pid].distance.optionalNumber ?? 1
                weighted.append((pid, UInt32(max(1, distance + 2 + Double(faithUnrest(r, p))))))
            }
            guard !weighted.isEmpty else { continue }
            var roll = draw(tag + "|seed") % weighted.reduce(0) { $0 + $1.1 }, seed = weighted[0].0
            for (q, w) in weighted { if roll < w { seed = q; break }; roll -= w }
            // An enclave cannot carry a region with it: start where the land joins up.
            var byId = [String: JS](); for p in owned { byId[p.id.asString] = p }
            if region(r, id, seed, 2, byId).count < 2, let joined = weighted.first(where: { region(r, id, $0.0, 2, byId).count >= 2 }) { seed = joined.0 }
            if raise(r, owner: id, seed: seed, size: uprisingSize(r, id)) != nil { b.lastUprising = JS(key) }
        }
    }
    /// 改朝换代: a rebel host does not stay one. Once its war is won or it holds enough land it builds a state:
    /// the peasant leader takes the throne and names a dynasty, the warlord crowns himself, hands power to
    /// a parliament or rules as dictator, the holy kingdom settles into a church state or a crown.
    static func maturityMonth(_ r: JS, _ n: JS, _ id: String, _ key: Int, addDestiny: (Double) -> Void) {
        let current = style(r, id).id
        guard ["peasant", "warlord", "holy"].contains(current) else { return }
        let c = r.civilization.nations[id], tag = "\(id)|\(key)|mature", land = monthLandCount(r, id)
        let months = Rebellion.monthsSince(r, Rebellion.bornTime(r, id)), atWar = Rebellion.rebelWar(r, id) != nil
        let parent = c.parentId.optionalString, fallen = parent.map { !Vassals.alive(r, $0) } ?? false
        guard months >= 6, !atWar || land >= 8 else { return }
        guard chance(tag) < (fallen ? 0.3 : land >= 8 ? 0.16 : 0.08) else { return }
        let culture = c.cultureId.optionalString ?? "", old = n.name.asString, pick = draw(tag + "|how") % 10
        func dynasty() -> String? {
            unusedName(r, NamingCatalog.dynastyPool(culture: culture), tag + "|name")
                ?? NamingCatalog.pickStateBase(culture: culture, mode: c.mode.optionalString ?? "historical-names", seed: tag + "|mat", used: NamingCatalog.usedStateKeys(r), styleId: culture == "chinese" ? "dynasty" : nil)
        }
        let crown = land >= 10 ? (culture == "chinese" ? "dynasty" : "empire") : land >= 4 ? (culture == "chinese" ? "dynasty" : "absolute") : "principality"
        var target = crown, base = dynasty(), how = "开国建制，设官分职，改元称帝。"
        switch current {
        case "peasant":
            if pick < 2 { target = "council"; base = nil; how = "义军公议，废除旧制，推举委员治国。" }
            else { how = "义军入主，首领登基，封赏功臣，定国号、立太庙。" }
        case "warlord":
            if pick < 3 { target = "presidential"; base = nil; how = "军人交权，召开国会，选举总统，还政于民。" }
            else if pick < 5 { target = "dictatorship"; base = nil; how = "大帅废军政府，自任元首，大权独揽。" }
            else { how = "大帅黄袍加身，受百官劝进，建号开国。" }
        default:
            if pick < 4 { target = "theocracy"; base = nil; how = "教众定鼎，立教规为国法，设教廷治民。" }
            else { how = "教主还俗称帝，教团转为官僚，以世俗治国。" }
        }
        guard target != current else { return }
        retitle(r, id, base: base, style: target)
        book(r, id).parties = .null
        // 军人交权、选举总统: the general does hand over, to whoever the vote chooses.
        if target == "presidential" { seat(r, id) }
        addDestiny(5)
        _ = People.announce(r, kind: "politics", text: "\(old)改制，建立\(n.name.asString)", reason: how + "国运 +5。", nations: [id], province: nil)
    }
    /// 禅让: a failing crown is replaced by a new house under a new dynastic name, with the land unchanged.
    static func dynastyMonth(_ r: JS, _ n: JS, _ id: String, _ key: Int) {
        if !r.foundings.isNull && !r.foundings.enabled.isTruthy { return }
        guard rule(r, "rebel") > 0, rule(r, "event") > 0 else { return }
        let polity = r.civilization.nations[id].polity.optionalString ?? "", culture = r.civilization.nations[id].cultureId.optionalString ?? "", tag = "\(id)|\(key)|mandate"
        guard polity == "Empire" || polity == "Kingdom", leverage(r, id).stability < 45, chance(tag) < 0.008 else { return }
        guard let base = unusedName(r, NamingCatalog.dynastyPool(culture: culture), tag + "|name")
                ?? NamingCatalog.pickStateBase(culture: culture, mode: r.civilization.mode.optionalString ?? "historical-names", seed: tag + "|abd", used: NamingCatalog.usedStateKeys(r), styleId: culture == "chinese" ? "dynasty" : nil) else { return }
        // The throne itself passes to another house (Handover.swift); with no other house there is no 禅让.
        _ = abdicate(r, n, id, base: base, style: culture == "chinese" ? "dynasty" : nil)
    }
    /// 禅让：王朝失道衰微时由权臣受禅改朝（其余政体复辟／神权转向均已交由 `realisticPoliticsMonth` 按现实危机条件触发）。
    static func orderMonth(_ r: JS, _ n: JS, _ id: String, _ key: Int) {
        dynastyMonth(r, n, id, key)
    }
}

extension NativeEngine {
    private func provinceAt(_ index: Int) -> JS? { let list = run.world.provinces.asArray; return list.indices.contains(index) ? list[index] : nil }
    /// 大叛乱: this province and the land around it rise.
    public func greatRebellion(_ index: Int, size: Int, kind: String?) -> (ok: Bool, reason: String) {
        let r = run
        guard let p = provinceAt(index), !r.foundings.isNull else { return (false, "这个世界没有启用叛乱规则。") }
        guard let result = Regimes.raise(r, owner: p.controller.asString, seed: p.id.asString, size: max(1, min(60, size)), kind: kind) else { return (false, kind == "restoration" ? "这片土地没有可复国的旧邦。" : "都城或无城之地起不了事，请换一州。") }
        afterGlobalOrder()
        return (true, result.text)
    }
    /// 复国: a fallen state returns on this province and the land around it.
    public func restoreNation(_ index: Int, nation: Int, size: Int) -> (ok: Bool, reason: String) {
        let r = run, nations = r.world.nations.asArray
        guard let p = provinceAt(index), nations.indices.contains(nation), !r.foundings.isNull else { return (false, "命令无效。") }
        let id = nations[nation].id.asString
        guard !Vassals.alive(r, id) else { return (false, "\(nations[nation].name.asString)尚未亡国。") }
        guard let result = Regimes.raise(r, owner: p.controller.asString, seed: p.id.asString, size: max(1, min(60, size)), restoring: id) else { return (false, "都城或无城之地不能复国，请换一州。") }
        afterGlobalOrder()
        return (true, result.text)
    }
    /// Starts a plague or famine here, or (kind nil) ends what is afflicting this province.
    public func provinceDisaster(_ index: Int, kind: String?) -> (ok: Bool, reason: String) {
        let r = run
        guard let p = provinceAt(index), !r.regimes.isNull else { return (false, "州郡不存在。") }
        let id = p.id.asString
        if let kind {
            Regimes.startDisaster(r, kind: kind, province: id, months: 6)
            return (true, "\(p.name.asString)天灾已降。")
        }
        if !r.regimes.disasters.isNull {
            for d in r.regimes.disasters.asArray { d.provinces = .array(d.provinces.asArray.filter { $0.asString != id }) }
            r.regimes.disasters = .array(r.regimes.disasters.asArray.filter { $0.provinces.length > 0 })
        }
        return (true, "\(p.name.asString)灾情已平。")
    }
    /// Removes every army standing in this province.
    public func clearArmies(_ index: Int) -> (ok: Bool, reason: String) {
        let r = run
        guard let p = provinceAt(index) else { return (false, "州郡不存在。") }
        let id = p.id.asString, there = Set(Armies.space(r).filter { $0.province?.id.asString == id && $0.army.troops.asNumber > 0 }.map { $0.army.nationId.asString })
        guard !there.isEmpty else { return (false, "本州没有军队。") }
        for n in there.sorted() { RebelWar.destroyArmies(r, n, id) }
        afterGlobalOrder()
        return (true, "\(p.name.asString)的军队已遣散。")
    }
    public func setProvinceFaith(_ index: Int, religion: String) -> (ok: Bool, reason: String) {
        let r = run
        guard let p = provinceAt(index), !r.regimes.isNull else { return (false, "州郡不存在。") }
        if r.regimes.faith.isNull { r.regimes.faith = .object() }
        r.regimes.faith[p.id.asString] = JS(religion)
        return (true, "\(p.name.asString)的信仰已更改。")
    }
    public func setProvinceGrain(_ index: Int, grain: Double) -> (ok: Bool, reason: String) {
        guard let p = provinceAt(index), let s = run.world.statecraft.provinces.asArray.first(where: { $0.provinceId.asString == p.id.asString }) else { return (false, "州郡不存在。") }
        s.grain = JS(max(0, min(50_000_000, grain.rounded())))
        return (true, "\(p.name.asString)存粮已修改。")
    }
    /// 连片划入: this province and the land joined to it (of the same owner) go to another state.
    public func grantRegion(_ index: Int, size: Int, to nation: Int) -> (ok: Bool, reason: String) {
        let provinces = run.world.provinces.asArray
        guard let p = provinceAt(index) else { return (false, "州郡不存在。") }
        var byId = [String: JS](), at = [String: Int]()
        for (i, q) in provinces.enumerated() { byId[q.id.asString] = q; at[q.id.asString] = i }
        let list = Regimes.region(run, p.controller.asString, p.id.asString, max(1, min(80, size)), byId, sparing: false)
        return territoryEdit(list.compactMap { at[$0] }, to: nation)
    }
    public func setReform(_ index: Int, reform: String, on: Bool) -> (ok: Bool, reason: String) {
        let r = run, nations = r.world.nations.asArray
        guard nations.indices.contains(index), let f = Regimes.reforms.first(where: { $0.id == reform }), !r.regimes.isNull else { return (false, "制度不存在。") }
        let nid = nations[index].id.asString
        let nb = Regimes.book(r, nid)
        let nowDay = r.world.day.asInt
        let held = Regimes.heldReforms(r, nid).map(\.id)
        if on && held.contains(f.id) { return (false, "\(f.name)已在施行之中，无需重复颁行。") }
        if !on && !held.contains(f.id) { return (false, "\(f.name)尚未施行。") }
        if UnitKinds.enabled {
            let refUntil = nb.reformCooldownUntil.optionalNumber.map(Int.init) ?? 0
            if nowDay < refUntil {
                return (false, "变法更制尚在朝野磨合期，请待 \(refUntil - nowDay) 日后再动国制。")
            }
        }
        if on && Regimes.independentReformIds.contains(f.id) {
            let remainingIndep = held.filter { Regimes.independentReformIds.contains($0) && !f.conflicts.contains($0) }.count
            let cap = Regimes.maxIndependentReforms(r, nid)
            if remainingIndep >= cap {
                return (false, "专项制度槽位已满（\(remainingIndep)/\(cap)），请先废止一项现行制度，或提升行政科技／任用贤能扩容。")
            }
        }
        if on && UnitKinds.enabled {
            let fin = r.finance.nations[nid]
            let gold = fin.isNull ? 0 : (fin.gold.optionalNumber ?? 0)
            guard gold >= 100 else { return (false, "国库不足 100 金，难以推行「\(f.name)」变法。") }
            if !fin.isNull { fin.gold = JS(max(0, gold - 100)) }
        }
        Regimes.setReform(r, nid, f, on: on)
        if UnitKinds.enabled { nb.reformCooldownUntil = JS(nowDay + 90) }
        return (true, on ? "耗 100 金颁行\(f.name)（\(f.text)）" : "已废止\(f.name)")
    }
}
