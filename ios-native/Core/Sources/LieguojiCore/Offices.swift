import Foundation

/// System.Random(int) as the original ships it (native-economy/dotnet-random): Knuth's subtractive generator.
struct DotNetRandom {
    static let mbig: Int32 = 2147483647, mseed: Int32 = 161803398
    var seed = [Int32](repeating: 0, count: 56), inext = 0, inextp = 21
    init(_ value: Int32) {
        let subtraction = value == Int32.min ? DotNetRandom.mbig : abs(value)
        var mj = DotNetRandom.mseed &- subtraction, mk: Int32 = 1
        seed[55] = mj
        for i in 1..<55 { let ii = (21 * i) % 55; seed[ii] = mk; mk = mj &- mk; if mk < 0 { mk = mk &+ DotNetRandom.mbig }; mj = seed[ii] }
        for _ in 1..<5 { for i in 1..<56 { seed[i] = seed[i] &- seed[1 + (i + 30) % 55]; if seed[i] < 0 { seed[i] = seed[i] &+ DotNetRandom.mbig } } }
    }
    mutating func nextDouble() -> Double {
        var a = inext + 1, b = inextp + 1
        if a >= 56 { a = 1 }; if b >= 56 { b = 1 }
        var v = seed[a] &- seed[b]
        if v == DotNetRandom.mbig { v -= 1 }
        if v < 0 { v = v &+ DotNetRandom.mbig }
        seed[a] = v; inext = a; inextp = b
        return Double(v) * (1 / Double(DotNetRandom.mbig))
    }
}

extension Nobility {
    // MARK: Family relations (civilization47-nobility-relations)
    static func relation(_ r: JS, _ aId: String, _ bId: String) -> Double {
        let n = r.nobility, a = n.families[aId], b = n.families[bId], ka = r.kin.families[aId], kb = r.kin.families[bId]
        if a.isNull || b.isNull || ka.isNull || kb.isNull || aId == bId || ka.stateId.asInt != kb.stateId.asInt { return 0 }
        let stored = n.relations[aId][bId].optionalNumber ?? 0
        var v = f(marriageConnection(r, aId, bId) + 0)
        if ka.cultureName.optionalString != kb.cultureName.optionalString { v = f(v - 20) }
        v = f(v + (a.religionId.optionalString == b.religionId.optionalString ? 10 : -15))
        var x = f(geography(r, aId, bId) + v); x = f(x + powerGap(r, aId, bId))
        if let head = People.person(r, kb.headId.asInt), head.isAlive.asBool {
            x = f(f(f(People.skills(head).charisma - 50) * f(0.5)) + x)
            for name in (head.traits.isNull ? [] : head.traits.asArray.map(\.asString)) where name == "SocialButterfly" {
                let bonus = f(trait(name)?.relationshipBonus.optionalNumber ?? 0)
                if bonus > 0 { x = f(x + bonus); break }
            }
        }
        let total = f(stored + x)
        return -100 > total ? -100 : total > 100 ? 100 : total
    }
    static func marriageConnection(_ r: JS, _ aId: String, _ bId: String) -> Double {
        if aId == bId { return 0 }
        var best = 0.0
        for (own, other) in [(aId, bId), (bId, aId)] {
            for id in r.kin.families[own].memberIds.asArray.map(\.asInt) {
                guard let m = People.person(r, id), m.isAlive.asBool, m.spouseId.asInt != 0, let s = People.person(r, m.spouseId.asInt), s.isAlive.asBool else { continue }
                if String(s.originalFamilyId.asInt > 0 ? s.originalFamilyId.asInt : s.familyId.asInt) != other { continue }
                best = max(best, m.marriageType.asInt == 1 || s.marriageType.asInt == 1 ? 5 : 10)
            }
        }
        return f(best)
    }
    static func geography(_ r: JS, _ aId: String, _ bId: String) -> Double {
        let n = r.nobility, a = n.families[aId].controlledProvinces.asArray.map(\.asString), b = n.families[bId].controlledProvinces.asArray.map(\.asString)
        if a.isEmpty || b.isEmpty { return 0 }
        let scale = r.scale.optionalNumber ?? .nan
        var pos = [String: JS](); for p in r.world.provinces.asArray { pos[p.id.asString] = p.center }
        var sum = 0.0, count = 0
        for p in a.prefix(3) { for q in b.prefix(3) {
            var d: Double
            if let u = pos[p], let w = pos[q] {
                d = f(f(jsHypot(f(u.x.asNumber / scale - w.x.asNumber / scale), f(u.y.asNumber / scale - w.y.asNumber / scale))) / 5)
                d = 1 > d ? 1 : d > 20 ? 20 : d
            } else { d = 1000 }
            sum = f(sum + d); count += 1
        } }
        let mean = f(sum / Double(count))
        return mean < 10 ? 5 : mean > 30 ? -10 : 0
    }
    static func powerGap(_ r: JS, _ aId: String, _ bId: String) -> Double {
        let n = r.nobility, a = n.families[aId], b = n.families[bId]
        let sa = f(People.warMerit(a) + People.strength(a)), sb = f(People.warMerit(b) + People.strength(b))
        let ratio = f(max(sa, sb) / max(1, min(sa, sb)))
        return ratio > 10 ? -25 : ratio > 5 ? -15 : ratio > 3 ? -10 : ratio > 2 ? -5 : -3
    }
}

/// Government offices (civilization47-offices): Chancellor, Steward and Marshal, a governor per
/// province and a war commander per war, filled by the original GovernmentOfficeAI each month and
/// reviewed once a year, with their income, rebellion and leadership effects.
public enum Offices {
    static let f = Native.fr
    struct Def { let w: (Double, Double, Double, Double); let category: Int; let economic: Double; let rebellion: Double }
    static let defs: [String: Def] = [
        "Chancellor": Def(w: (0.45, 0.05, 0.3, 0.2), category: 0, economic: 0.06, rebellion: 0),
        "Steward": Def(w: (0.65, 0.05, 0.15, 0.15), category: 0, economic: 0.08, rebellion: 0),
        "Marshal": Def(w: (0.2, 0.6, 0.05, 0.15), category: 0, economic: 0, rebellion: 0),
        "Governor": Def(w: (0.5, 0.1, 0.2, 0.2), category: 1, economic: 0.08, rebellion: 0.15),
        "WarCommander": Def(w: (0.1, 0.65, 0.05, 0.2), category: 2, economic: 0, rebellion: 0),
    ]
    static let central = ["Chancellor", "Steward", "Marshal"]
    static let replacement: [String: Int] = ["Kingdom": 18, "Empire": 18, "Federation": 12, "Republic": 12, "Tribal": 15, "Theocracy": 18]
    static func fnv(_ h: UInt32, _ v: UInt32) -> UInt32 { (h ^ v) &* 0x1000193 }
    static func fnvStart(_ v: UInt32) -> UInt32 { (v ^ 0x811c9dc5) &* 0x1000193 }
    static func clamp(_ v: Double, _ lo: Double, _ hi: Double) -> Double { lo > v ? lo : v > hi ? hi : v }

    struct Ctx { let r: JS; let nationId: String; let stateId: Int; let governance: Double; let leaderId: Int; let rulingFamily: String?; var relations = [String: Double]() }
    static func stateId(_ r: JS, _ nation: String) -> Int { r.people.nations[nation].id.optionalNumber.map { Int($0) } ?? 0 }
    static func book(_ r: JS, _ nation: String) -> JS {
        if r.offices47.nations[nation].isNull { let b = JS.object(); b.assignments = .array(); b.reviewYear = JS(-1); r.offices47.nations[nation] = b }
        return r.offices47.nations[nation]
    }
    static func validHolder(_ p: JS?, _ stateId: Int) -> Bool { guard let p else { return false }; return p.isAlive.asBool && p.stateId.asInt == stateId }
    static func wars(_ r: JS, _ nation: String) -> [(enemy: String, scopeId: Int)] {
        (r.world.statecraft.relations.isNull ? [] : r.world.statecraft.relations.asArray).filter { $0.status.asString == "war" && ($0.a.asString == nation || $0.b.asString == nation) }
            .map { x in let enemy = x.a.asString == nation ? x.b.asString : x.a.asString; return (enemy, stateId(r, enemy)) }.filter { $0.scopeId > 0 }
    }
    static func atWar(_ r: JS, _ nation: String, _ scopeId: Int) -> Bool { wars(r, nation).contains { $0.scopeId == scopeId } }
    static func revise(_ r: JS) { r.offices47.revision = JS(r.offices47.revision.asNumber + 1) }

    public static func governance(_ r: JS, _ nation: String) -> Double {
        let leaderId = r.people.nations[nation].leaderId
        var acumen = 25.0
        if !leaderId.isNull, let leader = People.person(r, leaderId.asInt), validHolder(leader, stateId(r, nation)) {
            let s = People.skills(leader); acumen = f(f(s.administrative * f(0.6)) + f(s.charisma * f(0.4)))
        }
        let destiny = clamp(f(f(r.destiny.nations[nation].destiny.optionalNumber ?? 0) / 100), 0, 1), a = clamp(f(acumen / 100), 0, 1)
        return clamp(f(f(f(f(a * f(0.45)) + f(destiny * f(0.55))) - f(0.45)) / f(0.4)), 0, 1)
    }
    static func context(_ r: JS, _ nation: String) -> Ctx {
        let ruling = r.nobility.rulingFamilies[nation].optionalNumber.map { Int($0) } ?? 0
        let leader = r.people.nations[nation].leaderId
        return Ctx(r: r, nationId: nation, stateId: stateId(r, nation), governance: governance(r, nation), leaderId: leader.isNull ? 0 : leader.asInt,
                   rulingFamily: ruling > 0 && r.nobility.families.has(String(ruling)) ? String(ruling) : nil)
    }
    public static func holder(_ r: JS, _ nation: String, _ office: String, _ scopeId: Int) -> JS? {
        guard let a = r.offices47.nations[nation].assignments.isNull ? nil : r.offices47.nations[nation].assignments.asArray.first(where: { $0.officeId.asString == office && $0.scopeId.asInt == scopeId }) else { return nil }
        let p = People.person(r, a.holderId.asInt)
        return validHolder(p, stateId(r, nation)) ? p : nil
    }
    static func suitabilityScore(_ s: Persona.Skills, _ w: (Double, Double, Double, Double)) -> Double { f(f(f(f(w.1 * s.military) + f(w.0 * s.administrative)) + f(w.2 * s.diplomatic)) + f(s.charisma * w.3)) }
    public static func suitability(_ r: JS, _ nation: String, _ office: String, _ scopeId: Int) -> Double {
        guard let p = holder(r, nation, office, scopeId) else { return 0 }
        return clamp(f(f(suitabilityScore(People.skills(p), defs[office]!.w) - 50) / 50), -1, 1)
    }
    /// centralIncome47.
    public static func centralIncome(_ r: JS, _ nation: String) -> Double {
        let id = stateId(r, nation), c = f(suitability(r, nation, "Chancellor", id) * defs["Chancellor"]!.economic), s = f(suitability(r, nation, "Steward", id) * defs["Steward"]!.economic)
        return f(clamp(f(s + c), -0.12, 0.12) + 1)
    }
    /// localIncome47.
    public static func localIncome(_ r: JS, _ province: String) -> Double {
        guard let index = r.world.provinces.asArray.firstIndex(where: { $0.id.asString == province }) else { return 1 }
        let p = r.world.provinces[index], g = f(f(suitability(r, p.controller.asString, "Governor", index + 1) * defs["Governor"]!.economic) + 1)
        return f(clamp(f(g - 1), -0.12, 0.12) + 1)
    }
    /// localRebellion47.
    public static func localRebellion(_ r: JS, _ province: String) -> Double {
        guard let index = r.world.provinces.asArray.firstIndex(where: { $0.id.asString == province }) else { return 1 }
        return f(1 - f(suitability(r, r.world.provinces[index].controller.asString, "Governor", index + 1) * defs["Governor"]!.rebellion))
    }

    static func canHold(_ ctx: Ctx, _ p: JS?, _ office: String, _ scopeId: Int) -> Bool {
        guard let p, validHolder(p, ctx.stateId), p.age.asInt >= 18, p.age.asInt <= 75 else { return false }
        if p.roles.asArray.contains(where: { $0.nativeKind.optionalString == "leader" && ($0.stateId.optionalNumber.map { $0 > 0 && Int($0) != ctx.stateId } ?? false) }) { return false }
        var isCentral = false, local = 0
        let assignments = book(ctx.r, ctx.nationId).assignments.asArray
        for a in assignments where a.holderId.asInt == p.id.asInt && !(a.officeId.asString == office && a.scopeId.asInt == scopeId) {
            let c = defs[a.officeId.asString]!.category
            if c == 0 { isCentral = true } else if c == 1 { local += 1 }
        }
        let category = defs[office]!.category
        if category == 2 { return !assignments.contains { $0.holderId.asInt == p.id.asInt && defs[$0.officeId.asString]!.category == 2 && $0.scopeId.asInt != scopeId } }
        if category == 0 && isCentral { return false }
        if category == 0 && local > 0 || category == 1 && isCentral { return false }
        if category == 1 && local >= 2 { return false }
        return true
    }
    static func nobleFamily(_ r: JS, _ p: JS) -> (String, JS)? {
        guard p.familyId.asInt > 0 else { return nil }
        let fam = r.nobility.families[p.familyId.asInt.description]
        return fam.isNull ? nil : (p.familyId.asInt.description, fam)
    }
    static func familyAdjustment(_ ctx: inout Ctx, _ family: (String, JS)?, _ office: String, _ scopeId: Int) -> Double {
        guard let (id, fam) = family else { return 0 }
        let r = ctx.r
        var v = clamp(f(fam.influence.asNumber / 100), 0, 10)
        if let ruling = ctx.rulingFamily {
            if ruling == id { v = f(v + 8) }
            else {
                let rel: Double
                if let cached = ctx.relations[id] { rel = cached } else { rel = clamp(f(Nobility.relation(r, id, ruling) / 10), -10, 10); ctx.relations[id] = rel }
                v = f(rel + v)
            }
        }
        if office == "Governor", scopeId - 1 < r.world.provinces.length, scopeId >= 1 {
            let p = r.world.provinces[scopeId - 1], pid = p.id.asString
            if fam.controlledProvinces.asArray.contains(where: { $0.asString == pid }) { v = f(v + 15) }
            if fam.homeProvinceId.optionalString == pid || fam.originalHomeProvinceId.optionalString == pid { v = f(v + 8) }
        }
        if office == "Marshal" { v = f(v + clamp(f(People.warMerit(fam) / 25), 0, 12)) }
        var held = 0
        for a in book(r, ctx.nationId).assignments.asArray { if let h = People.person(r, a.holderId.asInt), h.familyId.asInt > 0, h.familyId.asInt.description == id { held += 1 } }
        if held > 1 { let polity = r.civilization.nations[ctx.nationId].polity.optionalString; v = f(v - f(Double((held - 1) * (polity == "Federation" || polity == "Republic" ? 10 : 6)))) }
        return v
    }
    static func workload(_ ctx: Ctx, _ p: JS, _ office: String, _ scopeId: Int) -> Double {
        var n = 0, gov = 0
        for a in book(ctx.r, ctx.nationId).assignments.asArray where a.holderId.asInt == p.id.asInt && !(a.officeId.asString == office && a.scopeId.asInt == scopeId) {
            n += 1; if a.officeId.asString == "Governor" { gov += 1 }
        }
        return f(f(Double(n * -12)) - f(Double(gov * 6)))
    }
    static func traitAdjustment(_ p: JS, _ office: String) -> Double {
        let admin = office != "Marshal", military = office == "Marshal", t = Set(p.traits.isNull ? [] : p.traits.asArray.map(\.asString))
        var v: Double = t.contains("Incompetent") ? -15 : 0
        if t.contains("Administrator") && admin { v = f(v + 8) }
        if t.contains("Strategist") && military { v = f(v + 10) }
        if t.contains("BattleHardened") && military { v = f(v + 6) }
        if t.contains("Craven") && military { v = f(v - 10) }
        if t.contains("Ambitious") { v = f(v - 3) }
        return v
    }
    static func ageFactor(_ age: Int) -> Double {
        let a = Double(age)
        if age < 18 || age > 75 { return 0 }
        if age < 25 { return f(f(clamp(f(f(a - 18) / 7), 0, 1) * f(0.3)) + f(0.7)) }
        if age <= 55 { return 1 }
        return f(f(clamp(f(f(a - 55) / 20), 0, 1) * f(-0.35)) + 1)
    }
    static func score(_ ctx: inout Ctx, _ p: JS, _ office: String, _ scopeId: Int) -> Double {
        let r = ctx.r, s = People.skills(p)
        let competence = f(suitabilityScore(s, defs[office]!.w) * ageFactor(p.age.asInt))
        let family = nobleFamily(r, p), kin = p.familyId.asInt > 0 ? r.kin.families[p.familyId.asInt.description] : JS.null
        let culture = p.cultureName.optionalString.flatMap { $0.isEmpty ? nil : $0 } ?? kin.cultureName.optionalString ?? ""
        let religion = p.religionId.optionalString.flatMap { $0.isEmpty ? nil : $0 } ?? family?.1.religionId.optionalString ?? ""
        let nation = r.civilization.nations[ctx.nationId], polity = nation.polity.optionalString
        var cr = 0.0
        if let c = nation.cultureId.optionalString, !c.isEmpty, c == culture { cr = 8 }
        if let g = nation.religionId.optionalString, !g.isEmpty, g == religion { cr = f(cr + (polity == "Theocracy" ? 15 : 5)) }
        let fam = familyAdjustment(&ctx, family, office, scopeId)
        var gov = 0.0
        switch polity {
        case "Kingdom": if let family { gov = clamp(f(family.1.influence.asNumber / 200), 0, 5) }
        case "Empire": if s.administrative >= 65 { gov = 5 }
        case "Federation": if let family, !family.1.ruling.asBool { gov = 4 }
        case "Republic": if office != "Marshal" { if s.administrative >= 65 { gov = 4 } } else if let family { gov = clamp(f(People.warMerit(family.1) / 40), 0, 8) }
        case "Tribal": gov = f(f(f(s.military + s.charisma) - 100) * f(0.08))
        case "Theocracy": if s.charisma >= 65 { gov = 5 }
        default: break
        }
        let load = workload(ctx, p, office, scopeId), traits = traitAdjustment(p, office), gender: Double = p.gender.asInt == 1 ? -30 : 0
        let g = ctx.governance, weight = f(f(g * f(0.6)) + f(0.4)), famEff = fam > 0 ? f(f(f(f(1 - g) * f(1.5)) + 1) * fam) : fam
        var noise = 0.0
        if g < 1 {
            let h = fnv(fnv(fnvStart(UInt32(truncatingIfNeeded: ctx.stateId)), UInt32(truncatingIfNeeded: ctx.leaderId)), UInt32(truncatingIfNeeded: p.id.asInt))
            noise = f(f(f(f(Double(h % 1000)) / 999) * 30) * f(1 - g))
        }
        return f(f(f(f(f(f(f(f(weight * competence) + cr) + famEff) + gov) + load) + traits) + noise) + gender)
    }
    static func candidates(_ ctx: inout Ctx, _ office: String, _ scopeId: Int, exclude: Int = -1) -> [(p: JS, score: Double)] {
        var list = [(p: JS, score: Double)]()
        for p in ctx.r.kin.persons.objectValues where p.id.asInt != exclude && p.stateId.asInt == ctx.stateId && canHold(ctx, p, office, scopeId) {
            list.append((p, score(&ctx, p, office, scopeId)))
        }
        return list.sorted { $0.score != $1.score ? $0.score > $1.score : $0.p.id.asInt < $1.p.id.asInt }
    }
    static func select(_ ctx: Ctx, _ list: [(p: JS, score: Double)], _ office: String, _ scopeKind: Int, _ scopeId: Int) -> (p: JS, score: Double)? {
        let top = Array(list.prefix(3))
        if top.count == 1 { return top[0] }
        var h = fnv(fnv(fnv(fnv(fnvStart(UInt32(truncatingIfNeeded: ctx.stateId)), UInt32(truncatingIfNeeded: scopeKind)), UInt32(truncatingIfNeeded: scopeId)), 0), UInt32(truncatingIfNeeded: ctx.r.life.currentDate.year.asInt))
        for c in office.utf16 { h = fnv(h, UInt32(c)) }
        var random = DotNetRandom(Int32(bitPattern: h))
        let low = top.map(\.score).min()!, weights = top.map { max(1, f($0.score - low) + 2) }
        var total = 0.0; for w in weights { total += w }
        var roll = random.nextDouble() * total
        for i in top.indices { roll -= weights[i]; if !(0 < roll) { return top[i] } }
        return top.first
    }
    static func appoint(_ ctx: Ctx, _ office: String, _ scopeKind: Int, _ scopeId: Int, _ holderId: Int) {
        let list = book(ctx.r, ctx.nationId).assignments
        let value = JS.object()
        value.officeId = JS(office); value.holderId = JS(holderId); value.scopeKind = JS(scopeKind); value.scopeId = JS(scopeId); value.startTime = ctx.r.life.gameTime.clone(); value.source = JS(0)
        if let a = list.asArray.first(where: { $0.officeId.asString == office && $0.scopeId.asInt == scopeId }) { for (k, v) in value.objectEntries { a[k] = v } }
        else { list.push(value) }
        revise(ctx.r)
    }
    static func tryFill(_ ctx: inout Ctx, _ office: String, _ scopeKind: Int, _ scopeId: Int) -> Bool {
        let list = candidates(&ctx, office, scopeId)
        guard !list.isEmpty, let chosen = select(ctx, list, office, scopeKind, scopeId) else { return false }
        appoint(ctx, office, scopeKind, scopeId, chosen.p.id.asInt); return true
    }
    static func reconcile(_ r: JS, _ nation: String) {
        let b = book(r, nation), sid = stateId(r, nation), before = b.assignments.length
        b.assignments.asArray = b.assignments.asArray.filter { a in
            validHolder(People.person(r, a.holderId.asInt), sid) && (a.scopeKind.asInt == 2 ? atWar(r, nation, a.scopeId.asInt) : a.scopeKind.asInt == 0 ? a.scopeId.asInt == sid
                : (a.scopeId.asInt >= 1 && a.scopeId.asInt <= r.world.provinces.length && r.world.provinces[a.scopeId.asInt - 1].controller.asString == nation))
        }
        if b.assignments.length != before { revise(r) }
    }
    /// stateOfficeMonth47.
    public static func month(_ r: JS, _ nation: String) {
        if r.offices47.isNull || r.people.nations[nation].isNull || !r.world.provinces.asArray.contains(where: { $0.controller.asString == nation }) { return }
        processMonthly(r, nation)
        if r.life.currentDate.month.asInt == stateId(r, nation) % 12 + 1 { reviewAnnual(r, nation) }
    }
    static func processMonthly(_ r: JS, _ nation: String) {
        reconcile(r, nation)
        let b = book(r, nation)
        var ctx = context(r, nation)
        let ineligible = b.assignments.asArray.filter { !canHold(ctx, People.person(r, $0.holderId.asInt), $0.officeId.asString, $0.scopeId.asInt) }
        if !ineligible.isEmpty { b.assignments.asArray = b.assignments.asArray.filter { a in !ineligible.contains { $0 === a } }; revise(r); ctx = context(r, nation) }
        if b.manual.isTruthy { return }
        var count = 0
        for a in ineligible { if count >= 4 { return }; if tryFill(&ctx, a.officeId.asString, a.scopeKind.asInt, a.scopeId.asInt) { count += 1 } }
        for office in central {
            if count >= 4 { return }
            if !b.assignments.asArray.contains(where: { $0.officeId.asString == office && $0.scopeId.asInt == ctx.stateId }) && tryFill(&ctx, office, 0, ctx.stateId) { count += 1 }
        }
        if r.offices47.wars.isTruthy {
            for w in wars(r, nation) {
                if count >= 4 { return }
                if !b.assignments.asArray.contains(where: { $0.officeId.asString == "WarCommander" && $0.scopeId.asInt == w.scopeId }) && tryFill(&ctx, "WarCommander", 2, w.scopeId) { count += 1 }
            }
        }
        for (i, p) in r.world.provinces.asArray.enumerated() {
            if count >= 4 { return }
            if p.controller.asString != nation { continue }
            if !b.assignments.asArray.contains(where: { $0.officeId.asString == "Governor" && $0.scopeId.asInt == i + 1 }) && tryFill(&ctx, "Governor", 1, i + 1) { count += 1 }
        }
    }
    static func reviewAnnual(_ r: JS, _ nation: String) {
        let b = book(r, nation), year = r.life.currentDate.year.asInt
        if b.reviewYear.asInt == year { return }
        b.reviewYear = JS(year)
        if b.manual.isTruthy { return }
        reconcile(r, nation)
        var ctx = context(r, nation)
        let threshold = Double(replacement[r.civilization.nations[nation].polity.optionalString ?? ""] ?? 15)
        let list = b.assignments.asArray.sorted { $0.scopeKind.asInt != $1.scopeKind.asInt ? $0.scopeKind.asInt < $1.scopeKind.asInt : $0.scopeId.asInt < $1.scopeId.asInt }
        var replaced = 0
        for a in list {
            if replaced >= 2 { break }
            if a.locked.isTruthy { continue }
            let spd = r.life.secondsPerDay.asNumber, s = People.start(r)
            let months = DiplomacyCalendar.wholeMonths(DiplomacyCalendar.date(a.startTime.asNumber, secondsPerDay: spd, start: s), DiplomacyCalendar.date(f(r.life.gameTime.asNumber), secondsPerDay: spd, start: s))
            if months < 48 { continue }
            guard let holder = People.person(r, a.holderId.asInt) else { continue }
            let current = score(&ctx, holder, a.officeId.asString, a.scopeId.asInt)
            guard let best = candidates(&ctx, a.officeId.asString, a.scopeId.asInt, exclude: holder.id.asInt).first, !(threshold + current > best.score) else { continue }
            appoint(ctx, a.officeId.asString, a.scopeKind.asInt, a.scopeId.asInt, best.p.id.asInt); replaced += 1
        }
    }
}
