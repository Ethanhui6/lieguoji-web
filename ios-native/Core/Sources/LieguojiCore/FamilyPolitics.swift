import Foundation

/// 世家往来与门阀政治（本作 App 规则专用，不影响网页逐字节对照黄金测试）：
/// 1. 开局与推演中的世家关系演进：姻亲交好、朝堂结盟、门阀倾轧、争权夺地、言归于好、输财助国；
/// 2. 联姻自动增进双方世家情谊（+25），并记录双方姻亲关系；
/// 3. 玩家主动指令：撮合两家联姻、赏赐安抚、削夺权柄、调停结好/挑拨离间、扶立新世家；
/// 4. 为族谱页提供完整的「世家往来关系网」与「本族纪事」。
public enum FamilyPolitics {
    /// 双向调整两个世家的关系偏移量（-100…100）。
    public static func adjustRelation(_ r: JS, _ a: String, _ b: String, delta: Double) {
        guard a != b, !r.nobility.isNull, r.nobility.families.has(a), r.nobility.families.has(b) else { return }
        if r.nobility.relations.isNull { r.nobility.relations = .object() }
        for (x, y) in [(a, b), (b, a)] {
            if r.nobility.relations[x].isNull { r.nobility.relations[x] = .object() }
            let cur = r.nobility.relations[x][y].optionalNumber ?? 0
            r.nobility.relations[x][y] = JS(max(-100, min(100, (cur + delta).rounded())))
        }
    }

    /// 两个世家之间是否存在现存或历史联姻（通过 `nobility.marriages` 或双方成员配偶/出身姓氏判定，容错缺损记录）。
    public static func hasMarriageTie(_ r: JS, _ a: String, _ b: String) -> Bool {
        guard a != b, let ai = Int(a), let bi = Int(b) else { return false }
        if !r.nobility.isNull, case .array(let marriages) = r.nobility.marriages.storage {
            for m in marriages {
                guard case .object = m.storage else { continue }
                let f = NativeEngine.personId(m.fromFamilyId), t = NativeEngine.personId(m.toFamilyId)
                if (f == ai && t == bi) || (f == bi && t == ai) { return true }
            }
        }
        // 也检查现有成员的原生姓氏与对方族姓的血缘联姻。
        let fa = r.kin.families[a], fb = r.kin.families[b]
        guard case .object = fa.storage, case .object = fb.storage else { return false }
        let sa = NamingCatalog.cleanSurname(fa.surname.optionalString ?? "")
        let sb = NamingCatalog.cleanSurname(fb.surname.optionalString ?? "")
        guard !sa.isEmpty, !sb.isEmpty, sa != sb else { return false }
        for (fam, otherSurname) in [(fa, sb), (fb, sa)] {
            guard case .array(let ids) = fam.memberIds.storage else { continue }
            for mid in ids {
                let pid = NativeEngine.personId(mid)
                guard pid > 0, let p = People.person(r, pid), case .object = p.storage, p.isAlive.optionalBool == true else { continue }
                let natal = NamingCatalog.cleanSurname(p.natalSurname.optionalString ?? p.lastName.optionalString ?? "")
                if natal == otherSurname { return true }
            }
        }
        return false
    }

    /// 校验家族记录是否完整（容错缺损/手工篡改的存档记录，避免读族谱时在引擎关系计算中崩溃）。
    private static func isHealthy(_ r: JS, _ id: String) -> Bool {
        let nf = r.nobility.families[id], kf = r.kin.families[id]
        guard case .object = nf.storage, case .object = kf.storage else { return false }
        guard case .array(let members) = kf.memberIds.storage, case .array = nf.controlledProvinces.storage else { return false }
        if kf.stateId.optionalNumber == nil || kf.headId.optionalNumber == nil { return false }
        for mid in members {
            guard let n = mid.optionalNumber, n.isFinite else { return false }
            if let p = People.person(r, Int(n)) {
                guard case .object = p.storage, p.isAlive.optionalBool != nil, p.spouseId.optionalNumber != nil else { return false }
            }
        }
        return true
    }

    /// 两个世家的综合关系评分（-100…100）与简明标签。
    public static func relationScore(_ r: JS, _ a: String, _ b: String) -> Double {
        guard a != b, !r.nobility.isNull, r.nobility.families.has(a), r.nobility.families.has(b) else { return 0 }
        let stored = r.nobility.relations[a][b].optionalNumber ?? 0
        guard isHealthy(r, a), isHealthy(r, b) else { return max(-100, min(100, stored)) }
        let ka = r.kin.families[a], kb = r.kin.families[b]
        if ka.stateId.asInt != kb.stateId.asInt {
            // 跨国世家往来（联姻/斡旋）直接反映已结情谊与姻亲加分。
            return max(-100, min(100, stored + (hasMarriageTie(r, a, b) ? 10 : 0)))
        }
        return Nobility.relation(r, a, b)
    }
    public static func relationLabel(score: Double, married: Bool) -> String {
        if married && score >= 15 { return "姻亲盟好" }
        if score >= 55 { return "世交盟好" }
        if score >= 20 { return "交好" }
        if score <= -55 { return "世仇宿敌" }
        if score <= -20 { return "不睦" }
        return married ? "姻亲" : "中立"
    }

    /// 联姻完成时自动提升双方家族好感（+25）。
    static func onMarriage(_ r: JS, _ familyA: Int, _ familyB: Int) {
        guard UnitKinds.enabled, familyA > 0, familyB > 0, familyA != familyB else { return }
        adjustRelation(r, String(familyA), String(familyB), delta: 25)
    }

    /// 开局为同国各世家初始化差异化的初始关系（避免所有世家开局全为 0，呈现天然朝堂格局）。
    static func seedOpeningRelations(_ r: JS, seed: String) {
        guard !r.nobility.isNull, !r.nobility.families.isNull else { return }
        // 补齐 nobility.rulingFamilies（开局原本未写入，导致首代君主未去世前查不到宗室）。
        if r.nobility.rulingFamilies.isNull { r.nobility.rulingFamilies = .object() }
        for n in r.world.nations.asArray {
            let nid = n.id.asString
            let rid = People.rulingFamilyId(r, nid)
            if rid > 0 { r.nobility.rulingFamilies[nid] = JS(rid) }
        }
        var byNation = [String: [String]]()
        for (k, fam) in r.nobility.families.objectEntries {
            if let nid = fam.nationId.optionalString { byNation[nid, default: []].append(k) }
        }
        for (nid, rawKeys) in byNation {
            let keys = rawKeys.sorted { (Int($0) ?? 0) < (Int($1) ?? 0) }
            guard keys.count >= 2 else { continue }
            for i in 0..<keys.count {
                for j in (i + 1)..<keys.count {
                    let a = keys[i], b = keys[j]
                    let roll = Double(Opening.hash("\(seed)/house-rel/\(nid)/\(a)/\(b)") % 1000) / 1000.0
                    let delta: Double
                    if roll < 0.16 { delta = -32 }       // 宿怨/争权
                    else if roll < 0.34 { delta = -14 }  // 素有嫌隙
                    else if roll > 0.82 { delta = 28 }   // 世交拥戴
                    else if roll > 0.62 { delta = 12 }   // 颇为和睦
                    else { delta = 0 }
                    if delta != 0 { adjustRelation(r, a, b, delta: delta) }
                }
            }
        }
    }

    /// 确定性 0…1 采样。
    private static func roll(_ seed: String) -> Double {
        Double(Opening.hash(seed) % 100_000) / 100_000.0
    }

    /// 每月一次的世家之间动态事件（App 规则专用，低频克制、不刷屏，却能让朝堂世家格局鲜活演变）。
    public static func month(_ r: JS, _ key: Int) {
        guard UnitKinds.enabled, !r.nobility.isNull, !r.nobility.families.isNull else { return }
        let seed = r.world.custom.seed.optionalString ?? ""
        for n in r.world.nations.asArray {
            let nid = n.id.asString
            guard Vassals.alive(r, nid), !Regimes.isBlank(r, nid) else { continue }
            let houses = r.nobility.families.objectEntries
                .filter { $0.1.nationId.optionalString == nid && r.kin.families.has($0.0) }
                .map(\.0)
                .sorted { (Int($0) ?? 0) < (Int($1) ?? 0) }
            guard houses.count >= 2 else { continue }
            // 每国每月约 8% 概率触发一件世家互动事件（约一年一件，有戏不吵）。
            let trigger = roll("\(seed)|fam-pol|\(nid)|\(key)")
            guard trigger < 0.08 else { continue }
            let i = Int(Opening.hash("\(seed)|fam-a|\(nid)|\(key)") % UInt32(houses.count))
            var j = Int(Opening.hash("\(seed)|fam-b|\(nid)|\(key)") % UInt32(houses.count - 1))
            if j >= i { j += 1 }
            let a = houses[i], b = houses[j]
            let fa = r.nobility.families[a], fb = r.nobility.families[b]
            let na = NamingCatalog.houseLabel(r.kin.families[a].surname.optionalString ?? "")
            let nb = NamingCatalog.houseLabel(r.kin.families[b].surname.optionalString ?? "")
            let stateName = n.name.asString
            let score = relationScore(r, a, b)
            let married = hasMarriageTie(r, a, b)
            let kindRoll = roll("\(seed)|fam-kind|\(nid)|\(key)")

            if married && kindRoll < 0.55 {
                // 姻亲相助：声望同升、关系更睦。
                adjustRelation(r, a, b, delta: 10)
                fa.influence = JS(min(1000, (fa.influence.optionalNumber ?? 50) + 12))
                fb.influence = JS(min(1000, (fb.influence.optionalNumber ?? 50) + 12))
                People.recordHistory(r, kind: "family", text: "\(stateName)\(na)与\(nb)凭姻亲之谊彼此援手", reason: "两家结有姻亲，朝堂声望与关系同步提升。", nations: [nid], province: nil)
            } else if score >= 20 && kindRoll < 0.45 {
                // 世家结盟共进。
                adjustRelation(r, a, b, delta: 12)
                fa.wealth = JS((fa.wealth.optionalNumber ?? 100) + 40)
                fb.wealth = JS((fb.wealth.optionalNumber ?? 100) + 40)
                People.recordHistory(r, kind: "family", text: "\(stateName)\(na)与\(nb)通好结盟，共商田产商利", reason: "两家素来交好，合资兴业，家族财富与关系俱增。", nations: [nid], province: nil)
            } else if score <= -20 && kindRoll < 0.35 {
                // 世仇和解：化干戈为玉帛。
                adjustRelation(r, a, b, delta: 24)
                People.recordHistory(r, kind: "family", text: "\(stateName)\(na)与\(nb)宴饮释嫌，言归于好", reason: "经朝中斡旋，两家旧怨缓和。", nations: [nid], province: nil)
            } else if kindRoll < 0.72 {
                // 门阀倾轧 / 朝堂争权：制造真实宿敌与派系张力。
                adjustRelation(r, a, b, delta: -18)
                let infA = fa.influence.optionalNumber ?? 50, infB = fb.influence.optionalNumber ?? 50
                let winner = infA >= infB ? (a, na, fa) : (b, nb, fb)
                let loser = infA >= infB ? (b, nb, fb) : (a, na, fa)
                winner.2.influence = JS(min(1000, (winner.2.influence.optionalNumber ?? 50) + 18))
                loser.2.influence = JS(max(0, (loser.2.influence.optionalNumber ?? 50) - 14))
                People.recordHistory(r, kind: "family", text: "\(stateName)\(na)与\(nb)在朝堂争权倾轧，\(winner.1)占得上风", reason: "两家为官职与封地生隙，彼此关系恶化，势力此消彼长。", nations: [nid], province: nil)
            } else {
                // 世家输财助国（若对宗室关系尚可）。
                let ruling = String(People.rulingFamilyId(r, nid))
                let donor = a == ruling ? (b, nb, fb) : (a, na, fa)
                let relRuling = r.nobility.families.has(ruling) ? relationScore(r, donor.0, ruling) : 0
                if relRuling >= -10, (donor.2.wealth.optionalNumber ?? 0) >= 80 {
                    donor.2.wealth = JS(max(0, (donor.2.wealth.optionalNumber ?? 100) - 50))
                    donor.2.influence = JS(min(1000, (donor.2.influence.optionalNumber ?? 50) + 22))
                    if r.nobility.families.has(ruling) && donor.0 != ruling { adjustRelation(r, donor.0, ruling, delta: 12) }
                    if !r.finance.nations[nid].isNull {
                        r.finance.nations[nid].gold = JS((r.finance.nations[nid].gold.optionalNumber ?? 0) + 60)
                    }
                    People.recordHistory(r, kind: "family", text: "\(stateName)\(donor.1)输财助国，获朝廷嘉奖", reason: "世家捐输国库 60 金，声望与宗室信任上升。", nations: [nid], province: nil)
                }
            }
        }
    }

    private static func nationName(_ r: JS, _ nid: String) -> String {
        guard !r.world.nations.isNull else { return "" }
        return r.world.nations.asArray.first(where: { $0.id.asString == nid })?.name.optionalString ?? ""
    }

    /// 导出某家族的「世家往来列表」（优先同国世家，附已结姻亲或交恶的外邦世家）。
    static func relationsView(_ r: JS, familyId: String) -> JS {
        guard !r.nobility.isNull, !r.world.provinces.isNull else { return .array() }
        let fam = r.nobility.families[familyId]
        guard case .object = fam.storage else { return .array() }
        let nationId = fam.nationId.optionalString ?? ""
        let rulingId = String(People.rulingFamilyId(r, nationId))
        var rows = [(id: String, score: Double, sameNation: Bool, ruling: Bool, married: Bool, js: JS)]()
        for (otherId, otherFam) in r.nobility.families.objectEntries where otherId != familyId {
            guard r.kin.families.has(otherId) else { continue }
            let otherNation = otherFam.nationId.optionalString ?? ""
            guard Vassals.alive(r, otherNation) else { continue }
            let same = otherNation == nationId
            let married = hasMarriageTie(r, familyId, otherId)
            let direct = r.nobility.relations[familyId][otherId].optionalNumber
            if !same && !married && direct == nil { continue }
            let score = relationScore(r, familyId, otherId).rounded()
            let isRuling = otherId == rulingId && same
            let o = JS.object()
            o.id = JS(otherId)
            o.name = JS(NamingCatalog.houseLabel(r.kin.families[otherId].surname.optionalString ?? ""))
            o.nation = JS(same ? "" : nationName(r, otherNation))
            o.ruling = JS(isRuling)
            o.score = JS(score)
            o.married = JS(married)
            o.label = JS(relationLabel(score: score, married: married))
            rows.append((otherId, score, same, isRuling, married, o))
        }
        rows.sort { a, b in
            if a.sameNation != b.sameNation { return a.sameNation }
            if a.ruling != b.ruling { return a.ruling }
            if a.married != b.married { return a.married }
            if abs(a.score) != abs(b.score) { return abs(a.score) > abs(b.score) }
            return a.id < b.id
        }
        return .array(rows.prefix(12).map(\.js))
    }

    /// 导出某家族相关的近期大事记（最新在前，最多 12 条）。
    static func recentEvents(_ r: JS, familyId: String) -> JS {
        guard !r.chronicle.isNull, !r.chronicle.entries.isNull else { return .array() }
        let kFam = r.kin.families[familyId]
        guard case .object = kFam.storage else { return .array() }
        let surname = NamingCatalog.cleanSurname(kFam.surname.optionalString ?? "")
        guard !surname.isEmpty else { return .array() }
        let tagA = surname + "氏", tagB = surname + "家族"
        var out = [JS]()
        for e in r.chronicle.entries.asArray.reversed() {
            let text = e.text.optionalString ?? ""
            if text.contains(tagA) || text.contains(tagB) {
                let row = JS.object()
                row.day = JS((e.day.optionalNumber ?? 0).rounded())
                row.text = JS(text)
                out.append(row)
                if out.count >= 12 { break }
            }
        }
        return .array(out)
    }
}

// MARK: - 玩家世家互动指令（NativeEngine）

extension NativeEngine {
    /// 撮合两支世家联姻：在两家挑选最合适的未婚成年男女真实结亲，保留本姓，双方家族关系 +25。
    public func marryHouses(_ familyA: String, with familyB: String) -> (ok: Bool, reason: String) {
        let r = run
        guard familyA != familyB, !r.nobility.isNull, !r.kin.families[familyA].isNull, !r.kin.families[familyB].isNull else {
            return (false, "所选的两个家族无效。")
        }
        func singles(_ fid: String) -> [JS] {
            let fam = r.kin.families[fid]
            let ids = (fam.memberIds.isNull ? [] : fam.memberIds.asArray).map(\.asInt)
            return ids.compactMap { People.person(r, $0) }.filter {
                $0.isAlive.asBool && $0.age.asInt >= 16 && $0.age.asInt <= 55 && Nobility.unmarried(r, $0)
            }.sorted { $0.age.asInt < $1.age.asInt }
        }
        let sa = singles(familyA), sb = singles(familyB)
        var pair: (JS, JS)?
        outer: for a in sa {
            for b in sb where a.gender.asInt != b.gender.asInt && !Nobility.closeRelative(a, b) {
                pair = (a, b); break outer
            }
        }
        // 若某家恰无适龄未婚者，为该家补生一位适龄旁系适婚子弟（与原作族谱婚配一致），保证玩家联姻指令顺畅可用。
        func ensureSingle(_ fid: String, wantGender: Int) -> JS? {
            let k = r.kin.families[fid]
            let culture = k.cultureName.optionalString ?? "chinese"
            let random = Nobility.Random(n: r.nobility)
            let gPool = NamingCatalog.givenNames(r, culture: culture, gender: wantGender)
            guard !gPool.isEmpty else { return nil }
            let first = gPool[random.intRange(0, gPool.count)]
            let last = NamingCatalog.cleanSurname(k.surname.optionalString ?? "")
            let religionId = r.civilization.nations[k.nationId.asString].religionId
            let iden = Nobility.personName(culture, given: first, house: last, gender: wantGender)
            let p = Nobility.createNamed(r, first: first, last: last, gender: wantGender, culture: culture, source: "collateral", religionId: religionId, identity: iden, random: random)
            p.familyId = k.id.clone(); p.originalFamilyId = k.id.clone(); p.stateId = k.stateId.clone()
            let age = random.floatRange(20, 28)
            p.birthTime = JS(Native.fr(r.life.gameTime.asNumber - age * 365.25 * r.life.secondsPerDay.asNumber))
            p.age = JS(People.yearSince(r, p.birthTime.asNumber, now: r.kin.ageTime.asNumber))
            r.kin.persons[p.id.asInt.description] = p
            k.memberIds.push(p.id.clone())
            let lp = JS.object(); lp.source = JS("native-family"); lp.birthTime = p.birthTime.clone(); lp.age = p.age.clone(); lp.initialAge = .null; lp.updatedMonth = r.kin.lastAgeMonth.clone()
            r.life.persons[p.id.asInt.description] = lp
            Nobility.bump(r.people); Nobility.bump(r.kin); Nobility.bump(r.life)
            return p
        }
        if pair == nil {
            if let a = sa.first, let b = ensureSingle(familyB, wantGender: a.gender.asInt == 0 ? 1 : 0) { pair = (a, b) }
            else if let b = sb.first, let a = ensureSingle(familyA, wantGender: b.gender.asInt == 0 ? 1 : 0) { pair = (a, b) }
            else if let a = ensureSingle(familyA, wantGender: 0), let b = ensureSingle(familyB, wantGender: 1) { pair = (a, b) }
        }
        guard let (a, b) = pair else { return (false, "两家暂无合适婚配人选。") }
        guard Nobility.executeMarriage(r, r.nobility, a, b) else {
            // 若家主不可外嫁导致失败，直接结成不迁族的政治联姻并升温关系。
            a.spouseId = b.id.clone(); b.spouseId = a.id.clone()
            FamilyPolitics.adjustRelation(r, familyA, familyB, delta: 25)
            let na = NamingCatalog.houseLabel(r.kin.families[familyA].surname.optionalString ?? "")
            let nb = NamingCatalog.houseLabel(r.kin.families[familyB].surname.optionalString ?? "")
            let nations = Array(Set([r.kin.families[familyA].nationId.asString, r.kin.families[familyB].nationId.asString]))
            People.recordHistory(r, kind: "family", text: "\(na)\(Self.displayPersonName(a))与\(nb)\(Self.displayPersonName(b))结为秦晋之好", reason: "世家联姻，两家关系 +25。", nations: nations, province: nil)
            Nobility.bump(r.kin)
            return (true, "\(na)与\(nb)联姻已成，关系 +25。")
        }
        let na = NamingCatalog.houseLabel(r.kin.families[familyA].surname.optionalString ?? "")
        let nb = NamingCatalog.houseLabel(r.kin.families[familyB].surname.optionalString ?? "")
        return (true, "\(na)与\(nb)联姻已成，关系 +25。")
    }

    /// 世家政治操作：`befriend`（撮合结好）、`estrange`（挑拨离间）、`favor`（赏赐安抚）、`suppress`（削夺权柄）。
    public func houseDiplomacy(_ familyA: String, with familyB: String?, kind: String) -> (ok: Bool, reason: String) {
        let r = run
        guard !r.nobility.isNull, r.nobility.families.has(familyA), r.kin.families.has(familyA) else { return (false, "家族不存在。") }
        let famA = r.nobility.families[familyA]
        let nid = famA.nationId.optionalString ?? ""
        let na = NamingCatalog.houseLabel(r.kin.families[familyA].surname.optionalString ?? "")
        switch kind {
        case "favor":
            famA.influence = JS(min(1000, (famA.influence.optionalNumber ?? 50) + 40))
            famA.wealth = JS((famA.wealth.optionalNumber ?? 100) + 150)
            let ruling = String(People.rulingFamilyId(r, nid))
            if ruling != familyA && r.nobility.families.has(ruling) { FamilyPolitics.adjustRelation(r, familyA, ruling, delta: 20) }
            let stateLabel = r.world.nations.asArray.first(where: { $0.id.asString == nid })?.name.optionalString ?? ""
            People.recordHistory(r, kind: "family", text: "\(stateLabel)厚赐\(na)，安抚其族", reason: "朝廷赏赐：家族势力 +40、财富 +150、对宗室关系 +20。", nations: [nid], province: nil)
            return (true, "已赏赐\(na)（势力 +40，关系 +20）")
        case "suppress":
            guard !famA.ruling.isTruthy else { return (false, "不能削夺宗室自身权柄。") }
            famA.influence = JS(max(0, (famA.influence.optionalNumber ?? 50) - 60))
            let ruling = String(People.rulingFamilyId(r, nid))
            if ruling != familyA && r.nobility.families.has(ruling) { FamilyPolitics.adjustRelation(r, familyA, ruling, delta: -25) }
            let stateLabel = r.world.nations.asArray.first(where: { $0.id.asString == nid })?.name.optionalString ?? ""
            People.recordHistory(r, kind: "family", text: "\(stateLabel)削抑\(na)权柄", reason: "朝廷削藩抑族：家族势力 −60、对宗室关系 −25。", nations: [nid], province: nil)
            return (true, "已削夺\(na)权柄（势力 −60，关系 −25）")
        case "befriend", "estrange":
            guard let familyB, familyB != familyA, r.nobility.families.has(familyB), r.kin.families.has(familyB) else { return (false, "对方家族不存在。") }
            let nb = NamingCatalog.houseLabel(r.kin.families[familyB].surname.optionalString ?? "")
            let delta: Double = kind == "befriend" ? 25 : -30
            FamilyPolitics.adjustRelation(r, familyA, familyB, delta: delta)
            let nations = Array(Set([nid, r.nobility.families[familyB].nationId.optionalString ?? nid].filter { !$0.isEmpty }))
            let text = kind == "befriend" ? "\(na)与\(nb)修好盟誓" : "\(na)与\(nb)因隙交恶"
            People.recordHistory(r, kind: "family", text: text, reason: kind == "befriend" ? "居中斡旋：两家关系 +25。" : "朝堂离间：两家关系 −30。", nations: nations, province: nil)
            return (true, kind == "befriend" ? "\(na)与\(nb)关系 +25" : "\(na)与\(nb)关系 −30")
        default:
            return (false, "无此世家指令。")
        }
    }

    /// 扶立新世家：在本国一州封立一支不重姓的新贵族世家（含家主、外姓配偶、子女与初始封地）。
    public func createHouse(_ nationIndex: Int, province provinceIndex: Int, surname requested: String?) -> (ok: Bool, reason: String) {
        let r = run, nations = r.world.nations.asArray, provinces = r.world.provinces.asArray
        guard nations.indices.contains(nationIndex), provinces.indices.contains(provinceIndex), !r.nobility.isNull else {
            return (false, "国家或州郡不存在。")
        }
        let n = nations[nationIndex], nid = n.id.asString, p = provinces[provinceIndex], pid = p.id.asString
        guard p.controller.optionalString == nid else { return (false, "只能在本国实控的州郡封立世家。") }
        let culture = r.civilization.nations[nid].cultureId.optionalString ?? "chinese"
        let religion = r.civilization.nations[nid].religionId
        let stateId = Offices.stateId(r, nid)
        let usedSurnames = Set(r.kin.families.objectValues.filter { $0.nationId.optionalString == nid }.compactMap { $0.surname.optionalString.map(NamingCatalog.cleanSurname) })
        let housePool = NamingCatalog.houseNames(culture: culture)
        let surname: String
        if let req = requested.map(NamingCatalog.cleanSurname), !req.isEmpty {
            surname = String(req.prefix(10))
        } else {
            let nonce = (r.regimes.isNull ? 0 : (r.regimes.nameDrawNonce.optionalNumber.map { Int($0) } ?? 0)) + 1
            if !r.regimes.isNull { r.regimes.nameDrawNonce = JS(nonce) }
            let start = Int(Opening.hash("\(r.world.custom.seed.optionalString ?? "")/new-house/\(nid)/\(nonce)") % UInt32(max(1, housePool.count)))
            surname = (0..<housePool.count).lazy.map { housePool[(start + $0) % housePool.count] }.first { !usedSurnames.contains($0) } ?? (housePool.first ?? "李")
        }
        let familyId = max(r.people.nextStateId.asInt, (r.kin.families.objectValues.map(\.id.asInt).max() ?? 0) + 1)
        r.people.nextStateId = JS(familyId + 1)
        let random = Nobility.Random(n: r.nobility)
        let malePool = NamingCatalog.givenNames(r, culture: culture, gender: 0)
        let femalePool = NamingCatalog.givenNames(r, culture: culture, gender: 1)
        guard !malePool.isEmpty, !femalePool.isEmpty else { return (false, "该文化缺少人名库。") }

        // 家主（男，28–45 岁）
        let headFirst = malePool[random.intRange(0, malePool.count)]
        let head = Nobility.createNamed(r, first: headFirst, last: surname, gender: 0, culture: culture, source: "initial-family", religionId: religion, identity: Nobility.personName(culture, given: headFirst, house: surname, gender: 0), random: random)
        let headAge = Double(random.intRange(28, 46))
        head.birthTime = JS(Native.fr(r.life.gameTime.asNumber - headAge * 365.25 * r.life.secondsPerDay.asNumber))
        head.age = JS(People.yearSince(r, head.birthTime.asNumber, now: r.kin.ageTime.asNumber))
        head.familyId = JS(familyId); head.originalFamilyId = JS(familyId); head.stateId = JS(stateId); head.isHistoricallyImportant = JS(true)

        // 配偶（女，不同姓氏）
        let spFirst = femalePool[random.intRange(0, femalePool.count)]
        let otherHouses = housePool.filter { $0 != surname }
        let spHouse = otherHouses.isEmpty ? surname : otherHouses[random.intRange(0, otherHouses.count)]
        let spouse = Nobility.createNamed(r, first: spFirst, last: spHouse, gender: 1, culture: culture, source: "spouse", religionId: religion, identity: Nobility.personName(culture, given: spFirst, house: spHouse, gender: 1), random: random)
        let spAge = max(18, headAge + random.floatRange(-6, 4))
        spouse.birthTime = JS(Native.fr(r.life.gameTime.asNumber - spAge * 365.25 * r.life.secondsPerDay.asNumber))
        spouse.age = JS(People.yearSince(r, spouse.birthTime.asNumber, now: r.kin.ageTime.asNumber))
        spouse.familyId = JS(familyId); spouse.stateId = JS(stateId); spouse.natalSurname = JS(spHouse)
        head.spouseId = spouse.id.clone(); spouse.spouseId = head.id.clone()

        let kinFam = JS.object()
        kinFam.id = JS(familyId); kinFam.surname = JS(surname); kinFam.cultureName = JS(culture); kinFam.nationId = JS(nid); kinFam.stateId = JS(stateId)
        kinFam.headId = head.id.clone(); kinFam.heirId = JS(0); kinFam.allowFemaleInheritance = JS(false)
        kinFam.memberIds = .array([head.id.clone(), spouse.id.clone()]); kinFam.collateralMemberIds = .array()
        r.kin.families[String(familyId)] = kinFam

        // 1–2 位子女
        let kids = random.intRange(1, 3)
        var created = [head, spouse]
        for i in 0..<kids {
            let g = i == 0 ? 0 : (random.value() < 0.5 ? 0 : 1)
            let pool = g == 0 ? malePool : femalePool
            let cFirst = pool[random.intRange(0, pool.count)]
            let child = Nobility.createNamed(r, first: cFirst, last: surname, gender: g, culture: culture, source: "initial-family", religionId: religion, identity: Nobility.personName(culture, given: cFirst, house: surname, gender: g), random: random)
            let cAge = max(1, min(headAge - 18, Double(random.intRange(4, 18))))
            child.birthTime = JS(Native.fr(r.life.gameTime.asNumber - cAge * 365.25 * r.life.secondsPerDay.asNumber))
            child.age = JS(People.yearSince(r, child.birthTime.asNumber, now: r.kin.ageTime.asNumber))
            child.familyId = JS(familyId); child.originalFamilyId = JS(familyId); child.stateId = JS(stateId)
            child.fatherId = head.id.clone(); child.motherId = spouse.id.clone()
            head.childrenIds.push(child.id.clone()); spouse.childrenIds.push(child.id.clone())
            kinFam.memberIds.push(child.id.clone())
            if kinFam.heirId.asInt == 0 { kinFam.heirId = child.id.clone() }
            created.append(child)
        }
        for person in created {
            r.kin.persons[person.id.asInt.description] = person
            let lp = JS.object(); lp.source = JS("native-family"); lp.birthTime = person.birthTime.clone(); lp.age = person.age.clone(); lp.initialAge = .null; lp.updatedMonth = r.kin.lastAgeMonth.clone()
            r.life.persons[person.id.asInt.description] = lp
        }

        // 从原封地家族解绑该州并划归新世家。
        for f in r.nobility.families.objectValues where !f.controlledProvinces.isNull {
            f.controlledProvinces = .array(f.controlledProvinces.asArray.filter { $0.asString != pid })
        }
        let noble = JS.object()
        noble.nationId = JS(nid); noble.ruling = JS(false); noble.homeProvinceId = JS(pid); noble.originalHomeProvinceId = JS(pid)
        noble.controlledProvinces = .array([JS(pid)]); noble.influence = JS(120); noble.wealth = JS(180); noble.extendedMembers = JS(30)
        noble.religionId = religion.clone(); noble.foundingTime = r.life.gameTime.clone(); noble.updateDay = JS(random.intRange(1, 29))
        noble.totalEnemyDestroyed = JS(0); noble.totalProvincesConquered = JS(0); noble.rallyCooldown = JS(0)
        noble.historicalClaims = .object(); noble.historicalStateIds = .array(); noble.lastRulingTime = .object(); noble.rulingDuration = .object(); noble.stateResidenceMonths = .object()
        r.nobility.families[String(familyId)] = noble
        let rulingId = People.rulingFamilyId(r, nid)
        if rulingId > 0 && r.nobility.families.has(String(rulingId)) {
            FamilyPolitics.adjustRelation(r, String(familyId), String(rulingId), delta: 25)
        }
        Nobility.bump(r.people); Nobility.bump(r.kin); Nobility.bump(r.life)
        let label = NamingCatalog.houseLabel(surname)
        People.recordHistory(r, kind: "family", text: "\(n.name.asString)于\(p.name.asString)册立新世家\(label)", reason: "朝廷赐封新世家，由\(Self.displayPersonName(head))出任首代家主。", nations: [nid], province: pid)
        return (true, "已于\(p.name.asString)扶立\(label)")
    }
}
