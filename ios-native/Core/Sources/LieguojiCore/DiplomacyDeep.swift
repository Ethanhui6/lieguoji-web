import Foundation

/// 深度外交引擎（本作 App 规则专用，网页逐字节黄金测试不启用）：
/// 1. 真实双边好感度（-100…+100）与逐项原因拆解（意识形态阵营、宗教文化、霸权威胁、战史宿怨、有效条约与外交记忆）；
/// 2. 六大功能性条约：通商协定（双方月入 +6%）、共同防御（遇袭自动协防）、互不侵犯、王室联姻（+王位宣称）、军事通行、岁币纳贡；
/// 3. 四大主动博弈手段：最后通牒（割地／纳贡／称臣）、反霸权包围网、暗中资敌／离间朝堂、大国斡旋停战；
/// 4. 每月 AI 自主外交演进：亲善邻邦自发通商、共防、联姻，列强面对霸主自动合纵结成包围网。
public enum DiplomacyDeep {
    public struct Reason: Sendable {
        public let label: String
        public let delta: Int
    }

    public struct OpinionReport: Sendable {
        public let score: Int
        public let stance: String
        public let reasons: [Reason]
        public let hegemonThreat: Int
    }

    public static let treatyLabels: [String: String] = [
        "pact": "互不侵犯",
        "marriage": "王室联姻",
        "trade": "通商协定",
        "defense": "共同防御",
        "access": "军事通行",
        "tribute": "岁币纳贡",
    ]

    /// 规范双边键（无序对）。
    public static func pairKey(_ a: String, _ b: String) -> String {
        a < b ? "\(a)|\(b)" : "\(b)|\(a)"
    }

    /// 意识形态阵营之间的天然亲疏分。
    public static func campAffinity(_ a: Regimes.PolityCamp, _ b: Regimes.PolityCamp) -> Int {
        if a == b {
            switch a {
            case .socialist: return 24
            case .republic, .constitutional: return 18
            case .theocracy: return 12
            case .monarchy: return 12
            case .authoritarian: return 8
            case .tribal: return 6
            }
        }
        switch (a, b) {
        case (.constitutional, .republic), (.republic, .constitutional): return 14
        case (.constitutional, .monarchy), (.monarchy, .constitutional): return 8
        case (.monarchy, .theocracy), (.theocracy, .monarchy): return 6
        case (.authoritarian, .republic), (.republic, .authoritarian): return -28
        case (.authoritarian, .constitutional), (.constitutional, .authoritarian): return -20
        case (.authoritarian, .socialist), (.socialist, .authoritarian): return -32
        case (.socialist, .monarchy), (.monarchy, .socialist): return -26
        case (.socialist, .theocracy), (.theocracy, .socialist): return -24
        case (.republic, .monarchy), (.monarchy, .republic): return -12
        case (.republic, .theocracy), (.theocracy, .republic): return -14
        default: return -4
        }
    }

    /// 调整两国持久化外交好感记忆（赠金、资敌、通牒、调停、背盟等），范围 -60…+60。
    public static func adjustOpinionMod(_ r: JS, _ a: String, _ b: String, delta: Double) {
        guard a != b, !r.regimes.isNull else { return }
        if r.regimes.opinionMod.isNull { r.regimes.opinionMod = .object() }
        let key = pairKey(a, b)
        let cur = r.regimes.opinionMod[key].optionalNumber ?? 0
        let next = max(-60, min(60, (cur + delta).rounded()))
        r.regimes.opinionMod[key] = JS(next)
    }

    /// 计算 `target` 在天下格局中产生的「霸权威胁」数值（0…60）。
    public static func hegemonThreat(_ r: JS, of target: String) -> Int {
        guard !r.world.provinces.isNull else { return 0 }
        let total = max(1, r.world.provinces.length)
        let held = Regimes.monthLandCount(r, target)
        let share = Double(held) / Double(total)
        guard share >= 0.18 else { return 0 }
        var threat = Int(((share - 0.16) * 165).rounded())
        let prof = Regimes.styleProfile(r, target)
        if prof.id == "fascist" || prof.id == "nazi" { threat += 18 }
        else if prof.camp == .authoritarian || prof.id == "empire" { threat += 8 }
        return max(0, min(60, threat))
    }

    /// 两国当前全部有效条约。
    public static func activeTreaties(_ r: JS, _ a: String, _ b: String) -> [JS] {
        guard !r.regimes.isNull, !r.regimes.pacts.isNull else { return [] }
        let now = r.regimes.month.asInt
        return r.regimes.pacts.asArray.filter { p in
            let x = p.a.asString, y = p.b.asString
            return ((x == a && y == b) || (x == b && y == a)) && p.until.asInt > now
        }
    }

    public static func hasTreaty(_ r: JS, _ a: String, _ b: String, kind: String) -> Bool {
        activeTreaties(r, a, b).contains { ($0.kind.optionalString ?? "pact") == kind }
    }

    /// 与该国签有有效「共同防御条约」的所有存活国家 ID。
    public static func defensePartners(_ r: JS, of nationId: String) -> [String] {
        guard !r.regimes.isNull, !r.regimes.pacts.isNull else { return [] }
        let now = r.regimes.month.asInt
        var out = [String]()
        var seen = Set<String>()
        for p in r.regimes.pacts.asArray where p.kind.optionalString == "defense" && p.until.asInt > now {
            let x = p.a.asString, y = p.b.asString
            let other = x == nationId ? y : (y == nationId ? x : "")
            if !other.isEmpty && seen.insert(other).inserted && Vassals.alive(r, other) {
                out.append(other)
            }
        }
        return out
    }

    /// 添加或续签一项双边条约（同类型自动刷新到期时间，不堆叠重复条目）。
    public static func upsertTreaty(_ r: JS, a: String, b: String, kind: String, years: Int, payer: String? = nil) {
        Regimes.enable(r)
        if r.regimes.pacts.isNull { r.regimes.pacts = .array() }
        let now = max(0, r.regimes.month.asInt)
        let until = now + max(1, years) * 12
        for p in r.regimes.pacts.asArray {
            let x = p.a.asString, y = p.b.asString
            if ((x == a && y == b) || (x == b && y == a)) && (p.kind.optionalString ?? "pact") == kind {
                p.until = JS(max(p.until.asInt, until))
                if let payer { p.payer = JS(payer) }
                return
            }
        }
        let p = JS.object()
        p.a = JS(a); p.b = JS(b); p.kind = JS(kind); p.until = JS(until)
        if let payer { p.payer = JS(payer) }
        r.regimes.pacts.push(p)
    }

    /// 两国开战时，自动废止通商、互不侵犯、军事通行、共同防御与岁币条约；若属撕毁条约则重创宣战方国际信誉。
    public static func breakTreatiesOnWar(_ r: JS, _ a: String, _ b: String) {
        guard !r.regimes.isNull, !r.regimes.pacts.isNull else { return }
        let before = r.regimes.pacts.asArray
        let kept = before.filter { p in
            let x = p.a.asString, y = p.b.asString
            return !((x == a && y == b) || (x == b && y == a))
        }
        if kept.count < before.count {
            WorldDepth.adjustReputation(r, nation: a, delta: -18, reason: "公然撕毁与\(Vassals.name(r, b))的有效双边条约宣战，天下各国戒心骤增。")
        }
        r.regimes.pacts = .array(kept)
    }

    /// 登记跨国联姻带来的「王位宣称」（持续 25 年）。
    public static func recordThroneClaim(_ r: JS, claimant: String, target: String, years: Int = 25) {
        guard claimant != target, !r.regimes.isNull else { return }
        if r.regimes.claims.isNull { r.regimes.claims = .array() }
        let until = max(0, r.regimes.month.asInt) + years * 12
        for c in r.regimes.claims.asArray where c.claimant.asString == claimant && c.target.asString == target {
            c.until = JS(max(c.until.asInt, until))
            return
        }
        let row = JS.object()
        row.claimant = JS(claimant); row.target = JS(target); row.until = JS(until)
        r.regimes.claims.push(row)
    }

    /// 查询某国是否对目标国持有有效王位宣称。
    public static func hasThroneClaim(_ r: JS, claimant: String, target: String) -> Bool {
        guard !r.regimes.isNull, !r.regimes.claims.isNull else { return false }
        let now = r.regimes.month.asInt
        return r.regimes.claims.asArray.contains {
            $0.claimant.asString == claimant && $0.target.asString == target && $0.until.asInt > now
        }
    }

    /// 计算 `a` 对 `b` 的实时综合外交好感度（-100…+100）及逐项原因。
    public static func opinion(_ r: JS, _ a: String, _ b: String) -> OpinionReport {
        guard a != b else { return OpinionReport(score: 0, stance: "中立", reasons: [], hegemonThreat: 0) }
        var total = 0
        var reasons = [Reason]()
        func add(_ label: String, _ delta: Int) {
            guard delta != 0 else { return }
            total += delta
            reasons.append(Reason(label: label, delta: delta))
        }

        let ca = r.civilization.nations[a], cb = r.civilization.nations[b]
        let pa = Regimes.styleProfile(r, a), pb = Regimes.styleProfile(r, b)
        let campDelta = campAffinity(pa.camp, pb.camp)
        add(campDelta >= 0 ? "政体理念契合（\(pa.camp.rawValue)/\(pb.camp.rawValue)）" : "意识形态对立（\(pa.camp.rawValue) vs \(pb.camp.rawValue)）", campDelta)

        let fa = ca.religionId.optionalString ?? "", fb = cb.religionId.optionalString ?? ""
        if !fa.isEmpty && !fb.isEmpty {
            if fa == fb { add("同奉国教", 24) }
            else if pa.camp == .theocracy || pb.camp == .theocracy { add("神权异教冲突", -32) }
            else { add("宗教殊异", -16) }
        }
        let cultA = ca.cultureId.optionalString ?? "", cultB = cb.cultureId.optionalString ?? ""
        if !cultA.isEmpty && cultA == cultB { add("同文同源", 20) }

        // 掌权者外交手腕（四维外交属性 + 人物性格特质，使明君贤相与昏君暴主的外交格局截然不同！）
        let rulerB = Regimes.governor(r, b) ?? Regimes.ruler(r, b)
        let rulerBOp = MonarchLore.traitEffects(of: rulerB).opinion
        if rulerBOp != 0 {
            add(rulerBOp > 0 ? "对方主政贤明声望" : "对方主政苛暴失德", rulerBOp)
        }
        if let rulerB, !rulerB.base.isNull {
            let dipMod = Int(((People.skills(rulerB).diplomatic - 50) * 0.36).rounded())
            if abs(dipMod) >= 3 {
                add(dipMod > 0 ? "对方元首外交手腕" : "对方元首外交失策", dipMod)
            }
        }

        // 战事、同盟、宗属
        let atWar = Regimes.atWar(r, a, b)
        if atWar { add("兵戎相见", -65) }
        var allied = false
        if let al = Vassals.allianceOf(r, a), al.members.asArray.contains(where: { $0.asString == b }) {
            add("同盟袍泽", 40); allied = true
        }
        let overlordA = Vassals.overlord(r, a), overlordB = Vassals.overlord(r, b)
        if overlordA == b || overlordB == a { add("宗藩之谊", 25); allied = true }

        // 有效条约加分
        let treaties = activeTreaties(r, a, b)
        for t in treaties {
            switch t.kind.optionalString ?? "pact" {
            case "defense": add("共同防御条约", 25)
            case "marriage": add("王室联姻", 25)
            case "trade": add("通商协定", 15)
            case "pact": add("互不侵犯", 10)
            case "access": add("军事通行", 8)
            case "tribute": add("岁币免战", 8)
            default: break
            }
        }

        // 历史战争宿怨
        if !r.nativeDiplomacy.isNull, !r.nativeDiplomacy.relations.isNull {
            if let rel = r.nativeDiplomacy.relations.asArray.first(where: { ($0.a.asString == a && $0.b.asString == b) || ($0.a.asString == b && $0.b.asString == a) }) {
                let wars = rel.warCount.optionalNumber.map(Int.init) ?? 0
                if wars > 0 { add("历次战火宿怨（\(wars)战）", -min(30, wars * 10)) }
            }
        }

        // 霸权警惕：对方疆域庞大且非我盟友/宗藩
        let threat = hegemonThreat(r, of: b)
        if threat > 0 && !allied {
            let myLand = Regimes.monthLandCount(r, a), theirLand = Regimes.monthLandCount(r, b)
            if theirLand > myLand {
                add("忌惮强邻霸权", -min(45, threat))
            }
        }

        // 持久双边外交事件记忆
        if !r.regimes.isNull, !r.regimes.opinionMod.isNull {
            let mod = Int((r.regimes.opinionMod[pairKey(a, b)].optionalNumber ?? 0).rounded())
            if mod != 0 { add(mod > 0 ? "邦交礼尚往来" : "外交摩擦与猜忌", mod) }
        }

        // 国际信誉修正
        let repMod = WorldDepth.reputationOpinionModifier(r, of: b)
        if repMod != 0 {
            add(repMod > 0 ? "国际信誉昭著" : "背盟失信受天下忌惮", repMod)
        }

        // 王位宣称张力
        if hasThroneClaim(r, claimant: a, target: b) || hasThroneClaim(r, claimant: b, target: a) {
            add("王位宣称牵绊", -8)
        }

        let clamped = max(-100, min(100, total))
        let stance: String
        if atWar { stance = "交战" }
        else if clamped >= 60 { stance = "盟好" }
        else if clamped >= 30 { stance = "亲善" }
        else if clamped >= 10 { stance = "友善" }
        else if clamped <= -55 { stance = "宿敌" }
        else if clamped <= -22 { stance = "敌视" }
        else if clamped <= -8 { stance = "冷淡" }
        else { stance = "中立" }
        return OpinionReport(score: clamped, stance: stance, reasons: reasons, hegemonThreat: threat)
    }

    /// 供 `DeclarationEngine` 调用的双边好感与战略审势修正乘数（高好感/多线作战/国库空虚显著降低宣战意愿，宿敌/趁敌大败/宣称权提高宣战意愿）。
    public static func warTemperBias(_ r: JS, attacker a: String, defender b: String) -> Double {
        let rep = opinion(r, a, b)
        // +60 好感 → 0.55x（极难轻启战端）；-60 宿敌 → 1.38x（蠢蠢欲动）
        var raw = 1.0 - Double(rep.score) * 0.0065
        if UnitKinds.enabled && !r.regimes.isNull && r.regimes.enabled.isTruthy {
            let warsA = Wars.activeCampaignCount(r, for: a)
            let warsB = Wars.activeCampaignCount(r, for: b)
            // 慎开多线：已在两线以上交战时克制再启新战端
            if warsA >= 2 { raw *= 0.52 }
            else if warsA == 1 { raw *= 0.78 }
            // 国库与战败震荡审势
            if Regimes.defeatPenalty(r, a) > 0.10 { raw *= 0.65 }
            if let goldA = r.finance.nations[a].gold.optionalNumber, goldA < 25 { raw *= 0.72 }
            // 趁虚而入：敌方正陷多线苦战或新败动摇，或我方握有王位宣称
            if Regimes.defeatPenalty(r, b) >= 0.15 || warsB >= 2 { raw *= 1.28 }
            if hasThroneClaim(r, claimant: a, target: b) { raw *= 1.18 }
        }
        return max(0.35, min(1.75, raw))
    }

    /// 每月深度外交结算：通商增收、岁币划转、好感记忆演进、恶化断交、过期宣称清理，以及 AI 自主外交！
    public static func month(_ r: JS, _ key: Int) {
        guard UnitKinds.enabled, !r.regimes.isNull, r.regimes.enabled.isTruthy else { return }
        // 1. 清理过期王位宣称
        if !r.regimes.claims.isNull {
            r.regimes.claims = .array(r.regimes.claims.asArray.filter { $0.until.asInt > key })
        }
        // 1b. 每季度演进交战宿怨与同盟情谊，并检查关系破裂后的旧约废止
        if key % 3 == 0 {
            let registry = r.nativeWars
            for campaign in registry.campaigns.optionalArray ?? [] where campaign.endedTick.isNull {
                for (attacker, defender) in Wars.opposedPairs(registry, campaign, currentOnly: true)
                    where Vassals.alive(r, attacker) && Vassals.alive(r, defender) {
                    adjustOpinionMod(r, attacker, defender, delta: -2)
                }
            }
            if !r.regimes.pacts.isNull {
                for p in r.regimes.pacts.asArray where p.until.asInt > key {
                    let a = p.a.asString, b = p.b.asString
                    let kind = p.kind.optionalString ?? "pact"
                    guard Vassals.alive(r, a), Vassals.alive(r, b) else { continue }
                    if (kind == "trade" || kind == "pact") && opinion(r, a, b).score <= -45 {
                        p.until = JS(key)
                        let nameA = Vassals.name(r, a), nameB = Vassals.name(r, b)
                        _ = People.recordHistory(r, kind: "diplomacy", text: "\(nameA)与\(nameB)邦交恶化，废止\(treatyLabels[kind] ?? "旧约")",
                                                 reason: "两国猜忌日深（好感跌至 -45 以下），原有条约提前作废。",
                                                 nations: [a, b], province: nil)
                    }
                }
            }
        }
        // 2. 每年初缓释外交记忆（朝 0 靠拢 15%）
        if key % 12 == 0, !r.regimes.opinionMod.isNull {
            for (k, v) in r.regimes.opinionMod.objectEntries {
                let cur = v.optionalNumber ?? 0
                let next = (cur * 0.85).rounded()
                if abs(next) < 1 { r.regimes.opinionMod.delete(k) } else { r.regimes.opinionMod[k] = JS(next) }
            }
        }
        // 3. 通商协定月度增收（每份 +6%，单国封顶 +18%）与岁币月度划转（8% 月入）
        if !r.regimes.pacts.isNull {
            var tradeCount = [String: Int]()
            for p in r.regimes.pacts.asArray where p.until.asInt > key {
                let a = p.a.asString, b = p.b.asString
                guard Vassals.alive(r, a), Vassals.alive(r, b) else { continue }
                let kind = p.kind.optionalString ?? "pact"
                if kind == "trade" {
                    tradeCount[a, default: 0] += 1
                    tradeCount[b, default: 0] += 1
                } else if kind == "tribute" {
                    let payer = p.payer.optionalString ?? a
                    let receiver = payer == a ? b : a
                    let finP = r.finance.nations[payer], finR = r.finance.nations[receiver]
                    let gain = max(0, finP.goldPerMonth.optionalNumber ?? 0)
                    let cut = (gain * 0.08).rounded()
                    if cut > 0 && !finP.isNull && !finR.isNull {
                        finP.gold = JS((finP.gold.optionalNumber ?? 0) - cut)
                        finR.gold = JS((finR.gold.optionalNumber ?? 0) + cut)
                    }
                }
            }
            for (nid, cnt) in tradeCount {
                let fin = r.finance.nations[nid]
                let gain = max(0, fin.goldPerMonth.optionalNumber ?? 0)
                let bonus = gain * min(0.18, Double(cnt) * 0.06)
                if bonus > 0 && !fin.isNull { fin.gold = JS((fin.gold.optionalNumber ?? 0) + bonus) }
            }
        }

        // 4. AI 自主月度外交（邻邦签约通商／共防／联姻，面对超级霸主自动组建反霸包围网）
        guard r.diplomacy.worldAuto.isTruthy else { return }
        let seed = r.world.custom.seed.optionalString ?? ""
        let nations = r.world.nations.asArray
        var liveIds = [String]()
        for n in nations where Vassals.alive(r, n.id.asString) && !Regimes.isBlank(r, n.id.asString) {
            liveIds.append(n.id.asString)
        }
        guard liveIds.count >= 2 else { return }

        // A. 检测是否出现超级霸主 → 每半年最多触发一次反霸包围网组建
        if key % 6 == 0, let top = liveIds.max(by: { Regimes.monthLandCount(r, $0) < Regimes.monthLandCount(r, $1) }) {
            let threat = hegemonThreat(r, of: top)
            if threat >= 32, Regimes.chance("\(seed)|coalition|\(top)|\(key)") < 0.28 {
                let opponents = liveIds.filter { nid in
                    nid != top && r.diplomacy.nations[nid].optionalBool == true
                        && Vassals.overlord(r, nid) == nil
                        && !(Vassals.allianceOf(r, top)?.members.asArray.contains { $0.asString == nid } ?? false)
                        && opinion(r, nid, top).score <= -15
                }.sorted { War26.strength(r, $0) > War26.strength(r, $1) }
                let picked = Array(opponents.prefix(4))
                if picked.count >= 2 {
                    var newlySigned = 0
                    for i in 0..<picked.count {
                        for j in (i + 1)..<picked.count {
                            if !hasTreaty(r, picked[i], picked[j], kind: "defense") && !Regimes.atWar(r, picked[i], picked[j]) {
                                upsertTreaty(r, a: picked[i], b: picked[j], kind: "defense", years: 10)
                                adjustOpinionMod(r, picked[i], picked[j], delta: 12)
                                newlySigned += 1
                            }
                        }
                    }
                    if newlySigned > 0 {
                        let names = picked.map { Vassals.name(r, $0) }.joined(separator: "、")
                        let topName = Vassals.name(r, top)
                        _ = People.announce(r, kind: "diplomacy",
                                            text: "\(names)结成反\(topName)共同防御包围网",
                                            reason: "\(topName)疆域日炽、威胁四邻，各国签署十年共同防御协定，一国遇袭则全网驰援。",
                                            nations: picked + [top], province: nil)
                    }
                }
            }
        }

        // B. 邻国之间自主签署通商／共防／互不侵犯／联姻（每国每月约 4.5% 机会，让外交舞台活跃而不刷屏）
        for nid in liveIds where r.diplomacy.nations[nid].optionalBool == true && Vassals.overlord(r, nid) == nil {
            let tag = "\(seed)|aidip|\(nid)|\(key)"
            guard Regimes.chance(tag) < 0.045 else { continue }
            let land = Regimes.monthLand(r, nid)
            var neighbors = Set<String>()
            for p in land {
                for nb in p.neighbors.asArray {
                    if let other = Regimes.currentMonthIndex?.ownerByPid[nb.asString], !other.isEmpty, other != nid, Vassals.alive(r, other), !Regimes.isBlank(r, other) {
                        neighbors.insert(other)
                    }
                }
            }
            let candidates = neighbors.filter { !Regimes.atWar(r, nid, $0) }.sorted()
            guard !candidates.isEmpty else { continue }
            let target = candidates[Int(Regimes.draw(tag + "|t") % UInt32(candidates.count))]
            let rep = opinion(r, nid, target)
            let nameA = Vassals.name(r, nid), nameB = Vassals.name(r, target)
            let myStr = max(1, War26.strength(r, nid))
            let underThreat = neighbors.contains { nb in
                nb != target && (Regimes.atWar(r, nid, nb) || (War26.strength(r, nb) > myStr * 1.8 && opinion(r, nid, nb).score <= -15))
            }
            let defenseThreshold = underThreat ? 24 : 38

            if rep.score >= defenseThreshold && !hasTreaty(r, nid, target, kind: "defense") {
                upsertTreaty(r, a: nid, b: target, kind: "defense", years: 10)
                _ = People.announce(r, kind: "diplomacy", text: "\(nameA)与\(nameB)缔结共同防御条约",
                                    reason: underThreat ? "面对强邻环伺，两国合纵联防（好感 +\(rep.score)），约定一方遇袭则另一方自动出兵协防。" : "两国邦交亲善（好感 +\(rep.score)），约定十年内一方遇袭则另一方自动出兵协防。",
                                    nations: [nid, target], province: nil)
            } else if rep.score >= 22 && !hasTreaty(r, nid, target, kind: "trade") {
                upsertTreaty(r, a: nid, b: target, kind: "trade", years: 10)
                _ = People.announce(r, kind: "diplomacy", text: "\(nameA)与\(nameB)签署通商协定",
                                    reason: "两国互开商埠，双方每月岁入各增 6%，为期十年。",
                                    nations: [nid, target], province: nil)
            } else if rep.score >= 28 && !hasTreaty(r, nid, target, kind: "marriage")
                        && Regimes.styleProfile(r, nid).camp == .monarchy && Regimes.styleProfile(r, target).camp == .monarchy {
                upsertTreaty(r, a: nid, b: target, kind: "marriage", years: 10)
                recordThroneClaim(r, claimant: nid, target: target, years: 25)
                recordThroneClaim(r, claimant: target, target: nid, years: 25)
                _ = People.announce(r, kind: "diplomacy", text: "\(nameA)与\(nameB)王室联姻",
                                    reason: "两国宗室结为秦晋之好，十年互不兴兵，彼此邦交增温并互留王位宣称。",
                                    nations: [nid, target], province: nil)
            } else if rep.score >= 8 && rep.score < 28 && !hasTreaty(r, nid, target, kind: "pact") {
                upsertTreaty(r, a: nid, b: target, kind: "pact", years: 8)
                _ = People.recordHistory(r, kind: "diplomacy", text: "\(nameA)与\(nameB)签定八年互不侵犯条约",
                                         reason: "两国相约暂息干戈、休养生息。",
                                         nations: [nid, target], province: nil)
            }
        }
    }
}

// MARK: - 玩家深度外交指令（NativeEngine）

extension NativeEngine {
    /// 发出最后通牒：demand 支持 "tribute"（十年岁币）、"province"（割让接壤一州）、"vassal"（称臣附庸）。
    /// 对方按真实实力与盟友评估：屈服则不战而屈人之兵，拒绝则当场爆发战争！
    public func sendUltimatum(_ from: Int, to target: Int, demand: String) -> (ok: Bool, reason: String) {
        let r = run, nations = r.world.nations.asArray
        guard nations.indices.contains(from), nations.indices.contains(target), from != target else {
            return (false, "所选国家无效。")
        }
        let a = nations[from].id.asString, b = nations[target].id.asString
        guard Vassals.alive(r, a), Vassals.alive(r, b) else { return (false, "目标国家已亡。") }
        if Regimes.atWar(r, a, b) { return (false, "两国已在交战，无法再发通牒。") }
        if Vassals.overlord(r, b) == a { return (false, "对方已是本国附庸。") }
        if Vassals.overlord(r, a) != nil { return (false, "附庸国不能自主发出最后通牒。") }
        Regimes.enable(r)

        let nameA = nations[from].name.asString, nameB = nations[target].name.asString
        let strA = max(1, War26.strength(r, a))
        var strB = max(1, War26.strength(r, b))
        for ally in DiplomacyDeep.defensePartners(r, of: b) where ally != a { strB += War26.strength(r, ally) * 0.6 }
        if let al = Vassals.allianceOf(r, b) {
            for m in al.members.asArray where m.asString != b && m.asString != a { strB += War26.strength(r, m.asString) * 0.65 }
        }
        let ratio = strA / max(1, strB)
        let defiant = Armies.stateTraits(r, b).contains("FightToTheEnd") || Armies.stateTraits(r, b).contains("DefyTheStrong")
        let threshold: Double = (demand == "vassal" ? 2.6 : demand == "province" ? 1.9 : 1.5) * (defiant ? 1.45 : 1.0)
        DiplomacyDeep.adjustOpinionMod(r, a, b, delta: -30)

        if ratio >= threshold {
            // 实力悬殊：目标国含恨屈服！
            switch demand {
            case "vassal":
                let res = makeVassal(target, of: from)
                if res.ok {
                    _ = People.announce(r, kind: "diplomacy", text: "\(nameB)屈服于\(nameA)最后通牒，称臣纳贡",
                                        reason: "兵临城下、强弱悬殊（军力比 \(String(format: "%.1f", ratio))），\(nameB)被迫接受附庸条款。",
                                        nations: [a, b], province: nil)
                    return (true, "\(nameB)慑于国威，已屈服称臣！")
                }
                return res
            case "province":
                let provinces = r.world.provinces.asArray
                var byId = [String: JS]()
                for p in provinces { byId[p.id.asString] = p }
                let capB = Rebellion.capitalProvince(r, b)
                let borderIdx = provinces.indices.first { idx in
                    let p = provinces[idx]
                    return p.controller.optionalString == b && p.id.asString != capB
                        && p.neighbors.asArray.contains { byId[$0.asString]?.controller.optionalString == a }
                } ?? provinces.indices.first { provinces[$0].controller.optionalString == b && provinces[$0].id.asString != capB }
                guard let idx = borderIdx else { return (false, "\(nameB)仅余孤都，无法割地。") }
                let pname = provinces[idx].name.asString
                let res = territoryEdit([idx], to: from)
                if res.ok {
                    _ = People.announce(r, kind: "diplomacy", text: "\(nameB)屈服于\(nameA)最后通牒，割让\(pname)",
                                        reason: "重兵压境之下，\(nameB)被迫割让\(pname)以求苟安。",
                                        nations: [a, b], province: provinces[idx].id.asString)
                    return (true, "\(nameB)被迫屈服，割让\(pname)！")
                }
                return res
            default:
                DiplomacyDeep.upsertTreaty(r, a: b, b: a, kind: "tribute", years: 10, payer: b)
                _ = People.announce(r, kind: "diplomacy", text: "\(nameB)屈服于\(nameA)最后通牒，岁币纳贡十年",
                                    reason: "大军压境，\(nameB)同意每月进贡 8% 岁入换取十年免战。",
                                    nations: [a, b], province: nil)
                afterGlobalOrder()
                return (true, "\(nameB)屈服求和，同意岁币纳贡十年！")
            }
        } else {
            // 严词拒绝：当场爆发战争！
            _ = People.announce(r, kind: "diplomacy", text: "\(nameB)严词拒绝\(nameA)最后通牒，大战一触即发",
                                reason: "\(nameB)自恃国力与盟友尚足一战，焚毁国书拒绝屈从。",
                                nations: [a, b], province: nil)
            let war = politics(declare: true, from, target)
            return war.ok ? (true, "\(nameB)严词拒绝通牒，两国当场宣战！") : (true, "\(nameB)拒绝了最后通牒（当前受停战或外交互锁暂未宣战）。")
        }
    }

    /// 发起反霸权包围网：号召最多 4 个对目标霸主怀有敌意的邻国／列强两两签定十年共同防御条约。
    public func formCoalition(_ caller: Int, against target: Int) -> (ok: Bool, reason: String) {
        let r = run, nations = r.world.nations.asArray
        guard nations.indices.contains(caller), nations.indices.contains(target), caller != target else {
            return (false, "所选国家无效。")
        }
        let a = nations[caller].id.asString, t = nations[target].id.asString
        guard Vassals.alive(r, a), Vassals.alive(r, t) else { return (false, "国家已灭亡。") }
        Regimes.enable(r)
        var members = [a]
        let others = nations.map(\.id.asString).filter { nid in
            nid != a && nid != t && Vassals.alive(r, nid) && !Regimes.isBlank(r, nid)
                && Vassals.overlord(r, nid) != t
                && !Regimes.atWar(r, a, nid)
                && !(Vassals.allianceOf(r, t)?.members.asArray.contains { $0.asString == nid } ?? false)
                && DiplomacyDeep.opinion(r, nid, t).score <= 5
        }.sorted { DiplomacyDeep.opinion(r, $0, t).score < DiplomacyDeep.opinion(r, $1, t).score }
        members.append(contentsOf: others.prefix(3))
        guard members.count >= 2 else { return (false, "天下诸邦尚无愿意响应共抗\(nations[target].name.asString)的国家。") }
        for i in 0..<members.count {
            for j in (i + 1)..<members.count {
                DiplomacyDeep.upsertTreaty(r, a: members[i], b: members[j], kind: "defense", years: 10)
                DiplomacyDeep.adjustOpinionMod(r, members[i], members[j], delta: 12)
            }
            DiplomacyDeep.adjustOpinionMod(r, members[i], t, delta: -18)
        }
        let names = members.map { Vassals.name(r, $0) }.joined(separator: "、")
        let targetName = nations[target].name.asString
        let text = "\(names)结成反\(targetName)共同防御包围网"
        _ = People.announce(r, kind: "diplomacy", text: text,
                            reason: "由\(nations[caller].name.asString)倡议，\(members.count)国合纵签定十年共同防御协定，联手遏制\(targetName)扩张。",
                            nations: members + [t], province: nil)
        afterGlobalOrder()
        return (true, text)
    }

    /// 谍报暗动作战：fundRebels（资助反对派／煽动动乱）或 sowDiscord（离间世家朝堂）。
    public func covertAction(_ from: Int, target: Int, kind: String) -> (ok: Bool, reason: String) {
        let r = run, nations = r.world.nations.asArray
        guard nations.indices.contains(from), nations.indices.contains(target), from != target else {
            return (false, "所选国家无效。")
        }
        let a = nations[from].id.asString, b = nations[target].id.asString
        guard Vassals.alive(r, a), Vassals.alive(r, b) else { return (false, "国家已亡。") }
        Regimes.enable(r)
        let finA = r.finance.nations[a]
        let cost = kind == "fundRebels" ? 120.0 : 80.0
        let goldA = finA.isNull ? 0 : (finA.gold.optionalNumber ?? 0)
        if goldA >= cost { finA.gold = JS(goldA - cost) }
        let nameA = nations[from].name.asString, nameB = nations[target].name.asString
        let exposed = Regimes.chance("\(a)|\(b)|\(r.clock.tick.asInt)|covert") < 0.35

        if kind == "fundRebels" {
            let destinyB = r.destiny.nations[b]
            if !destinyB.isNull { destinyB.destiny = JS(max(0, (destinyB.destiny.optionalNumber ?? 50) - 6)) }
            Finance.setCorruption(r, b, Finance.corruption(r, b) + 6)
            var sparkText = ""
            if Regimes.leverage(r, b).stability < 44, Regimes.chance("\(a)|\(b)|\(r.clock.tick.asInt)|spark") < 0.45 {
                let cap = Rebellion.capitalProvince(r, b)
                if let p = r.world.provinces.asArray.first(where: { $0.controller.optionalString == b && $0.id.asString != cap }),
                   Regimes.raise(r, owner: b, seed: p.id.asString, size: max(2, Regimes.uprisingSize(r, b) / 2)) != nil {
                    sparkText = "，并成功引爆地方叛乱！"
                }
            }
            if exposed {
                DiplomacyDeep.adjustOpinionMod(r, a, b, delta: -35)
                _ = People.announce(r, kind: "diplomacy", text: "\(nameA)暗中资助\(nameB)反叛败露，两国交恶",
                                    reason: "密使被捕供出金源：\(nameB)腐化 +6、国运 −6，两国关系骤降 35。",
                                    nations: [a, b], province: nil)
                afterGlobalOrder()
                return (true, "资助反对派生效（腐化 +6、国运 −6\(sparkText)），但密谍败露，两国交恶！")
            } else {
                _ = People.recordHistory(r, kind: "event", text: "\(nameB)境内暗流涌动，叛党频现",
                                         reason: "神秘金银流入民间秘社，\(nameB)国运 −6、腐化 +6。",
                                         nations: [b], province: nil)
                afterGlobalOrder()
                return (true, "暗中资助\(nameB)反对派得手：敌国国运 −6、腐化 +6\(sparkText)")
            }
        } else {
            // 离间朝堂世家
            let ruling = String(People.rulingFamilyId(r, b))
            var hitHouse: String?
            if !r.nobility.isNull, !r.nobility.families.isNull {
                let rivals = r.nobility.families.objectEntries
                    .filter { $0.1.nationId.optionalString == b && $0.0 != ruling }
                    .sorted { ($0.1.influence.optionalNumber ?? 0) > ($1.1.influence.optionalNumber ?? 0) }
                if let top = rivals.first {
                    FamilyPolitics.adjustRelation(r, top.0, ruling, delta: -25)
                    hitHouse = NamingCatalog.houseLabel(r.kin.families[top.0].surname.optionalString ?? "")
                }
            }
            if exposed {
                DiplomacyDeep.adjustOpinionMod(r, a, b, delta: -25)
                _ = People.announce(r, kind: "diplomacy", text: "\(nameA)行反间计离间\(nameB)朝堂败露",
                                    reason: "密信落入敌手：\(nameB)\(hitHouse ?? "世家")仍生猜忌，但两国关系 −25。",
                                    nations: [a, b], province: nil)
                afterGlobalOrder()
                return (true, "离间\(nameB)\(hitHouse ?? "朝堂")生效（关系 −25），但细作行迹败露！")
            }
            return (true, "反间计成功：\(nameB)\(hitHouse ?? "权臣世家")与宗室情谊 −25，朝堂生隙。")
        }
    }

    /// 大国斡旋停战：由第三方存活国家出面调停交战中的两国停火。
    public func mediatePeace(_ mediator: Int, between a: Int, and b: Int) -> (ok: Bool, reason: String) {
        let r = run, nations = r.world.nations.asArray
        guard nations.indices.contains(mediator), nations.indices.contains(a), nations.indices.contains(b),
              a != b, mediator != a, mediator != b else { return (false, "所选国家无效。") }
        let mId = nations[mediator].id.asString, aId = nations[a].id.asString, bId = nations[b].id.asString
        guard Vassals.alive(r, mId), Vassals.alive(r, aId), Vassals.alive(r, bId) else { return (false, "相关国家已灭亡。") }
        guard Regimes.atWar(r, aId, bId) else { return (false, "该两国并未处于交战状态。") }
        let settled = politics(declare: false, a, b)
        guard settled.ok else { return settled }
        DiplomacyDeep.adjustOpinionMod(r, mId, aId, delta: 18)
        DiplomacyDeep.adjustOpinionMod(r, mId, bId, delta: 18)
        if !r.destiny.nations[mId].isNull {
            r.destiny.nations[mId].destiny = JS(min(100, (r.destiny.nations[mId].destiny.optionalNumber ?? 50) + 3))
        }
        let text = "\(nations[mediator].name.asString)出面斡旋，\(nations[a].name.asString)与\(nations[b].name.asString)停火议和"
        _ = People.announce(r, kind: "diplomacy", text: text,
                            reason: "大国居中调停，交战双方体面停火；调停国国运 +3，与双方邦交各 +18。",
                            nations: [mId, aId, bId], province: nil)
        afterGlobalOrder()
        return (true, text)
    }
}
