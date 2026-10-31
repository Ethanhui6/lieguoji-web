import Foundation

/// The people lifecycle (civilization47-lifecycle and its native kernels), ported line by line on the
/// web run's own state (`JS`): once per ISO month every living person ages and rolls natural death in
/// the persisted life stream; a death closes the person's roles, ends a ruler's reign, hands the family
/// headship on and finds the national successor by polity (noble houses for monarchies); a state left
/// without a known candidate keeps a vacancy that is retried each month.
public enum People {
    /// character-traits.json skill modifiers by trait name.
    public static var traits = [String: Persona.TraitModifiers]()
    public static func loadTraits(_ list: JS) {
        for t in list.asArray {
            traits[t.name.asString] = Persona.TraitModifiers(administrative: t.administrativeModifier.asNumber, military: t.militaryModifier.asNumber,
                                                           diplomatic: t.diplomaticModifier.asNumber, charisma: t.charismaModifier.asNumber)
        }
    }
    static func skills(_ p: JS) -> Persona.Skills {
        let b = p.base
        return Persona.skills(base: Persona.Skills(administrative: b.administrative.asNumber, military: b.military.asNumber, diplomatic: b.diplomatic.asNumber, charisma: b.charisma.asNumber),
                              traits: p.traits.isNull ? [] : p.traits.asArray.map { traits[$0.asString]! })
    }
    static func person(_ r: JS, _ id: Int) -> JS? { let p = r.kin.persons[String(id)]; return p.isNull ? nil : p }
    static func ids(_ list: JS) -> [Int] { list.isNull ? [] : list.asArray.map(\.asInt) }
    static let f = Native.fr

    // MARK: Calendar (character-calendar, civilization47-iso-calendar)
    static func start(_ r: JS) -> DiplomacyCalendar.D { let s = r.life.startDate; return (s.year.asInt, s.month.asInt, s.day.asInt) }
    static func yearSince(_ r: JS, _ time: Double, now: Double? = nil) -> Int {
        let spd = r.life.secondsPerDay.asNumber, s = start(r)
        return DiplomacyCalendar.wholeYears(DiplomacyCalendar.date(time, secondsPerDay: spd, start: s), DiplomacyCalendar.date(f(now ?? r.life.gameTime.asNumber), secondsPerDay: spd, start: s))
    }
    /// native-round nativeRoundToEven with digits.
    static func roundToEven(_ value: Double, digits: Int) -> Double {
        guard abs(value) < 1e16 else { return value }
        let scale = pow(10, Double(digits)), scaled = value * scale, integral = scaled.rounded(.towardZero), fraction = scaled - integral
        let rounded: Double
        if scaled < 0 { rounded = fraction == -0.5 ? (integral.truncatingRemainder(dividingBy: 2) == 0 ? integral : integral - 1) : (scaled - 0.5).rounded(.up) }
        else { rounded = fraction == 0.5 ? (integral.truncatingRemainder(dividingBy: 2) == 0 ? integral : integral + 1) : (scaled + 0.5).rounded(.down) }
        return rounded / scale
    }

    // MARK: Chronicle (civilization47-history)
    @discardableResult
    static func recordHistory(_ r: JS, kind: String, text: String, reason: String, nations: [String], province: String?, people: [JS] = [], source: Double? = nil) -> JS {
        let c = r.chronicle, w = r.world
        let id = c.nextEntryId.asNumber; c.nextEntryId = JS(id + 1)
        var unique = [String](); for n in nations where !unique.contains(n) { unique.append(n) }
        let place: JS
        if let province, let p = w.provinces.asArray.first(where: { $0.id.asString == province }) {
            place = .object(); place.id = p.id; place.name = p.name; place.x = p.center.x; place.y = p.center.y
        } else { place = .null }
        let e = JS.object()
        e.id = JS(id); e.day = w.day; e.tick = r.clock.tick; e.kind = JS(kind); e.text = JS(text); e.reason = JS(reason)
        e.nationIds = .array(unique.map { JS($0) }); e.place = place
        e.people = .array(people.map { p in let o = JS.object(); for k in ["id", "name", "order", "regnalName", "regnalOrdinal"] { o[k] = p[k].clone() }; return o })
        e.sourceEventId = source.map { JS($0) } ?? .null
        c.entries.push(e)
        return e
    }
    @discardableResult
    static func announce(_ r: JS, kind: String, text: String, reason: String, nations: [String], province: String?, people: [JS] = []) -> JS {
        let w = r.world, id = w.nextEventId.asNumber
        w.nextEventId = JS(id + 1)
        let e = JS.object(); e.id = JS(id); e.day = w.day; e.kind = JS("system"); e.text = JS(text); e.reason = JS(reason)
        w.events.push(e)
        if w.events.length > 160 { w.events.asArray = Array(w.events.asArray.suffix(160)) }
        return recordHistory(r, kind: kind, text: text, reason: reason, nations: nations, province: province, people: people, source: id)
    }
    static func nameSeed(_ value: String) -> UInt32 {
        var state: UInt32 = 2166136261
        for c in value.utf16 { state = (state ^ UInt32(c)) &* 16777619 }
        return state
    }

    // MARK: Names and titles (civilization47-catalog, civilization47-ruler-label, chronicle-records)
    static func rulerTitle(culture: String, polity: String, religion: String, gender: Int) -> String {
        if polity == "Republic" { return culture == "roman" || culture == "greek" ? "执政官" : "总统" }
        if polity == "Federation" { return "联邦主席" }
        if polity == "Tribal" { return culture == "norse" ? "雅尔" : "酋长" }
        if polity == "Theocracy" { return religion == "islam" ? "哈里发" : religion == "catholic" ? "教宗" : religion == "orthodox" ? "牧首" : religion == "buddhism" ? "法王" : "祭主" }
        if culture == "japanese" && polity == "Empire" { return "天皇" }
        if culture == "chinese" && polity == "Empire" { return gender == 1 ? "女皇" : "皇帝" }
        if culture == "persian" { return polity == "Empire" ? "沙阿" : "国王" }
        if culture == "slavic" && polity == "Empire" { return gender == 1 ? "女沙皇" : "沙皇" }
        if polity == "Empire" { return gender == 1 ? "女皇" : "皇帝" }
        return gender == 1 ? "女王" : "国王"
    }
    static func regnalLabel(_ name: String, _ ordinal: Int) -> String {
        let digits = Array("零一二三四五六七八九")
        func chinese(_ n: Int, _ leading: Bool = true) -> String {
            if n < 10 { return String(digits[n]) }
            let unit = n >= 10000 ? 10000 : n >= 1000 ? 1000 : n >= 100 ? 100 : 10, high = n / unit, low = n % unit
            let names = [10: "十", 100: "百", 1000: "千", 10000: "万"]
            return (unit == 10 && high == 1 && leading ? "" : chinese(high)) + names[unit]! + (low > 0 ? (low < unit / 10 ? "零" : "") + chinese(low, false) : "")
        }
        return name + chinese(ordinal) + "世"
    }
    static let numberedMonarchies: Set<String> = ["english", "french", "german", "slavic", "norse", "greek", "persian"]
    static func rulerDisplayName(culture: String, polity: String, name: String, regnalName: String, ordinal: Int, given: String, title: String) -> String {
        let hereditary = ["Kingdom", "Empire", "Tribal"].contains(polity)
        let label = (polity == "Kingdom" || polity == "Empire") && numberedMonarchies.contains(culture) ? regnalLabel(regnalName, ordinal) : hereditary && regnalName != given ? regnalName : name
        return label + title
    }

    // MARK: Roles (civilization47-roles, native role history)
    static func pastRole(_ role: JS, time: Double, reason: String) -> JS {
        let out = JS.object()
        out.roleType = .null; out.roleTitle = .null; out.stateId = JS(0); out.familyId = JS(0); out.startTime = JS(0); out.endTime = JS(0); out.endReason = .null
        out.officeId = .null; out.officeScopeKind = JS(0); out.officeScopeId = JS(0); out.officeWarSystemKind = JS(0); out.politicalSystemAtAppointment = JS(0)
        out.roleType = role.roleType.clone(); out.startTime = JS(roundToEven(role.startTime.asNumber, digits: 2)); out.endTime = JS(roundToEven(time, digits: 2)); out.endReason = JS(reason)
        if role.nativeKind.optionalString == "leader" { out.roleTitle = role.title.clone(); out.stateId = role.stateId.clone() }
        return out
    }
    static func leaderRole(_ r: JS, _ p: JS, title: String) -> JS {
        let o = JS.object()
        o.holderId = JS(0); o.startTime = JS(0); o.roleType = JS("NationalLeader"); o.title = .null; o.reignStartTime = JS(f(r.life.gameTime.asNumber)); o.stateId = JS(0)
        o.nativeKind = JS("leader"); o.holderId = JS(p.id.asNumber); o.stateId = JS(p.stateId.asNumber); o.title = JS(title)
        return o
    }

    // MARK: Family succession kernels (native-economy family-succession, patriarch-succession)
    static func priority(_ c: JS, _ family: JS, collateral: Bool, female: Bool) -> Int {
        var score = (collateral ? 1000 : 0) + (female ? 500 : 0)
        if c.gender.asInt == 1 && !family.allowFemaleInheritance.asBool { score += 10000 }
        return Native.iadd(Native.iadd(score, -c.age.asInt), 100)
    }
    static func findSuccessor(_ r: JS, _ family: JS, _ deceased: JS) -> JS? {
        func stage(_ list: [Int], _ tier: Int) -> JS? {
            var best: JS?, bestScore = 0
            for id in list {
                if tier == 3 && id == deceased.id.asInt { continue }
                guard let c = person(r, id), c.isAlive.asBool, !(tier < 2 && c.familyId.asInt != family.id.asInt), !(tier == 1 && c.gender.asInt != 1) else { continue }
                let score = Native.iadd(priority(c, family, collateral: tier == 2, female: tier == 1), tier == 3 ? 2000 : 0)
                if best == nil || score < bestScore { best = c; bestScore = score }
            }
            return best
        }
        if let c = stage(ids(deceased.childrenIds), 0) { return c }
        if family.allowFemaleInheritance.asBool, let c = stage(ids(deceased.childrenIds), 1) { return c }
        if let c = stage(ids(family.collateralMemberIds), 2) { return c }
        return stage(ids(family.memberIds), 3)
    }
    static func familyFallback(_ r: JS, _ family: JS, living: [JS]) -> JS? {
        var candidates = living
        for id in ids(family.collateralMemberIds) { if let c = person(r, id), c.isAlive.asBool { candidates.append(c) } }
        var best: JS?, bestAge = 0, bestScore = 0.0
        for c in candidates where c.isAlive.asBool {
            let age = c.age.asInt, s = skills(c), score = f(s.military + f(s.administrative + s.charisma))
            if best == nil || age > bestAge || age == bestAge && score > bestScore { best = c; bestAge = age; bestScore = score }
        }
        return best
    }
    /// civilization47-lifecycle living47: the family's alive members (any family id).
    static func living47(_ r: JS, _ family: JS) -> [JS] { ids(family.memberIds).compactMap { person(r, $0) }.filter { $0.isAlive.asBool } }
    /// civilization47-nobility-succession living: alive members still of this family.
    static func livingOwn(_ r: JS, _ family: JS) -> [JS] { living47(r, family).filter { $0.familyId.asInt == family.id.asInt } }
    static func handlePatriarchSuccession(_ r: JS, _ family: JS) {
        let old = person(r, family.headId.asInt)
        if let old, old.isAlive.asBool { return }
        var next: JS?
        if family.heirId.asInt > 0, let heir = person(r, family.heirId.asInt), heir.isAlive.asBool, heir.familyId.asInt == family.id.asInt { next = heir }
        if next == nil, let old { next = findSuccessor(r, family, old) }
        if next == nil { for p in living47(r, family) where next == nil || p.age.asInt > next!.age.asInt { next = p } }
        guard let next else { family.headId = JS(0); return }
        family.headId = JS(next.id.asNumber); next.isHistoricallyImportant = JS(true)
        if family.headId.asInt <= 0 { return }
        guard let head = person(r, family.headId.asInt) else { return }
        let heir = findSuccessor(r, family, head)
        family.heirId = JS(heir != nil && heir!.id.asInt != family.headId.asInt ? heir!.id.asNumber : 0)
    }

    // MARK: Noble houses (civilization47-nobility-territory, -nobility-succession)
    static func warMerit(_ fam: JS) -> Double { f(f(f(Double(fam.controlledProvinces.length * 10)) + f(fam.totalEnemyDestroyed.asNumber * f(0.1))) + f(fam.totalProvincesConquered.asNumber * 5)) }
    static func strength(_ fam: JS) -> Double { f(f(f(Double(fam.controlledProvinces.length * 10)) * f(0.4)) + f(fam.wealth.asNumber * f(0.6))) }
    static func setRulingFamily(_ r: JS, _ nationId: String, _ familyId: Int) {
        let n = r.nobility
        guard !n.isNull, n.families.has(String(familyId)) else { return }
        n.rulingFamilies[nationId] = JS(familyId)
        for (id, fam) in n.families.objectEntries where fam.nationId.asString == nationId { fam.ruling = JS(id == String(familyId)) }
    }
    static func familiesOf(_ r: JS, _ nationId: String) -> [(id: String, k: JS, fam: JS)] {
        r.nobility.families.objectEntries.filter { $0.1.nationId.asString == nationId && r.kin.families.has($0.0) }.map { ($0.0, r.kin.families[$0.0], $0.1) }
    }
    static func emergencyScore(_ r: JS, _ id: String) -> Double {
        let k = r.kin.families[id], fam = r.nobility.families[id], collateral = Double(k.collateralMemberIds.length)
        return f(f(fam.influence.asNumber * f(0.8)) + f(f(warMerit(fam) * f(0.5)) + f(f(Double(livingOwn(r, k).count * 10)) + f(collateral + collateral))))
    }
    static func best<T>(_ items: [T], _ score: (T) -> Double) -> T? {
        items.enumerated().map { ($0.offset, $0.element, score($0.element)) }.sorted { $0.2 != $1.2 ? $0.2 > $1.2 : $0.0 < $1.0 }.first?.1
    }
    static func nobleMonarchySuccessor(_ r: JS, _ nationId: String, _ previous: JS) -> JS? {
        let ruling = r.nobility.rulingFamilies[nationId], rulingId = ruling.isNull ? r.people.nations[nationId].id.asInt : ruling.asInt
        let familyValue = r.kin.families[String(rulingId)], family: JS? = familyValue.isNull ? nil : familyValue
        if let family {
            var candidate = previous.familyId.asInt == family.id.asInt ? findSuccessor(r, family, previous) : nil
            if candidate == nil { candidate = familyFallback(r, family, living: livingOwn(r, family)) }
            if let candidate, candidate.isAlive.asBool { return candidate }
        }
        let options = familiesOf(r, nationId).filter { $0.k !== family && !livingOwn(r, $0.k).isEmpty }
        if let alternative = best(options, { emergencyScore(r, $0.id) }), let c = familyFallback(r, alternative.k, living: livingOwn(r, alternative.k)), c.isAlive.asBool { return c }
        guard let strongest = best(familiesOf(r, nationId).filter { !livingOwn(r, $0.k).isEmpty }, { f(strength($0.fam) + warMerit($0.fam)) }) else { return nil }
        if let head = person(r, strongest.k.headId.asInt), head.isAlive.asBool { return head }
        return best(livingOwn(r, strongest.k), { $0.age.asNumber })
    }

    // MARK: Emergency elections (native-economy succession-candidates)
    struct Electing { let k: JS; let influence: Double; let warMerit: Double }
    static func compareScore(_ a: Double, _ b: Double) -> Int {
        if a > b { return 1 }; if a < b { return -1 }; if a == b { return 0 }
        return a.isNaN ? (b.isNaN ? 0 : -1) : 1
    }
    static func pick(_ candidates: [(JS, Double)]) -> JS? {
        var chosen: JS?, chosenScore = 0.0, chosenAge = 0
        for (p, score) in candidates {
            let age = p.age.asInt, c = compareScore(score, chosenScore)
            if chosen == nil || c > 0 || c == 0 && age > chosenAge { chosen = p; chosenScore = score; chosenAge = age }
        }
        return chosen
    }
    static func electionFamilies(_ r: JS, _ nationId: String) -> [Electing] {
        if !r.nobility.isNull { return familiesOf(r, nationId).map { Electing(k: $0.k, influence: $0.fam.influence.asNumber, warMerit: warMerit($0.fam)) } }
        return r.kin.families.objectValues.map { Electing(k: $0, influence: 0, warMerit: 0) }
    }
    static func republicLeader(_ r: JS, families: [Electing]) -> JS? {
        var candidates = [(JS, Double)]()
        for fam in families {
            let hasLiving = !living47(r, fam.k).isEmpty || ids(fam.k.collateralMemberIds).contains { person(r, $0)?.isAlive.asBool == true }
            if !hasLiving { continue }
            let merit = f(fam.warMerit), influence = f(fam.influence)
            for p in living47(r, fam.k) where p.age.asInt >= 25 {
                let s = skills(p), influenceTerm = f(influence * f(0.15)), meritTerm = f(merit * f(0.1))
                candidates.append((p, f(f(f(f(f(s.military + s.charisma) + s.diplomatic) + s.administrative) + meritTerm) + influenceTerm)))
            }
        }
        return pick(candidates)
    }
    static func spiritualOrTribal(_ r: JS, families: [Electing], tribal: Bool) -> JS? {
        var candidates = [JS]()
        for fam in families { for p in living47(r, fam.k) where p.age.asInt >= (tribal ? 12 : 0) { candidates.append(p) } }
        return pick(candidates.filter { $0.isAlive.asBool }.map { p in
            let s = skills(p), age = p.age.asInt
            if age < 0 { return (p, 0) }
            let m: Double = tribal ? (age >= 35 ? 1 : age >= 30 ? 0.9 : age >= 25 ? 0.8 : age >= 18 ? 0.65 : age >= 12 ? 0.45 : age >= 6 ? 0.3 : 0.2)
                                   : (age >= 35 ? 1 : age >= 30 ? 0.9 : age >= 25 ? 0.8 : age >= 18 ? 0.6 : age >= 10 ? 0.4 : 0.25)
            return (p, f(f(s.charisma + (tribal ? s.military : s.administrative)) * f(m)))
        })
    }

    // MARK: Succession (civilization47-lifecycle, civilization47-succession)
    static func knownSuccessor(_ r: JS, _ nationId: String, _ previous: JS) -> JS? {
        let family = r.kin.families[previous.familyId.asInt.description], polity = r.civilization.nations[nationId].polity.asString
        let nobles = !r.nobility.isNull
        if nobles && (polity == "Kingdom" || polity == "Empire") { return nobleMonarchySuccessor(r, nationId, previous) }
        if polity == "Kingdom" || polity == "Empire" {
            if family.isNull { return nil }
            return findSuccessor(r, family, previous) ?? familyFallback(r, family, living: living47(r, r.kin.families[family.id.asInt.description]))
        }
        let stateId = r.people.nations[nationId].id.asInt, families = electionFamilies(r, nationId).filter { $0.k.stateId.asInt == stateId }
        if polity == "Republic" || polity == "Federation" { return republicLeader(r, families: families) }
        return spiritualOrTribal(r, families: families, tribal: polity != "Theocracy")
    }
    @discardableResult
    static func resolveKnownSuccession(_ r: JS, _ nationId: String, _ previous: JS, cause: String) -> Bool {
        if let heir = knownSuccessor(r, nationId, previous) { appointKnownPerson(r, nationId, heir, cause: cause); return true }
        let vacancies = r.kin.lifecycle.vacancies
        if !vacancies.has(nationId) {
            let v = JS.object(); v.sinceDay = r.world.day.clone(); v.previousPersonId = previous.id.clone()
            v.reason = JS(cause == "restoration" ? "restoration-no-known-candidate" : "no-known-candidate")
            vacancies[nationId] = v
        }
        return false
    }
    @discardableResult
    static func appointKnownPerson(_ r: JS, _ nationId: String, _ heir: JS, cause: String, requestedName: String? = nil) -> JS {
        let regnalName = requestedName ?? heir.identity.given.asString
        let history = r.chronicle.leaders[nationId], old = history.asArray.last!, order = history.length + 1, id = "ruler-\(nationId)-\(order)", nation = r.civilization.nations[nationId]
        let identity = heir.identity.clone()
        identity.religionId = nation.religionId.clone(); identity.polityAtAccession = nation.polity.clone(); identity.regnalName = JS(regnalName)
        identity.titleAtAccession = JS(rulerTitle(culture: identity.cultureId.asString, polity: nation.polity.asString, religion: nation.religionId.asString, gender: identity.gender.asInt))
        let seed = nameSeed("\(r.world.custom.seed.asString)/\(nationId)/\(order)"), ordinal = history.asArray.filter { $0.regnalName.optionalString == regnalName }.count + 1
        let day = r.world.day.asNumber
        let reign = JS.object()
        reign.id = JS(id); reign.name = identity.name.clone(); reign.family = identity.house.clone(); reign.order = JS(order); reign.regnalName = JS(regnalName)
        reign.regnalOrdinal = JS(ordinal); reign.ascendedDay = JS(day); reign.endedDay = .null; reign.termEndDay = JS(day + Double((12 + Int(seed % 14)) * 365))
        if old.endedDay.isNull { old.endedDay = JS(day) }
        history.push(reign); r.civilization.rulers[id] = identity; r.civilization.revision = JS(r.civilization.revision.asNumber + 1)
        let key = heir.id.asInt.description
        if !r.people.persons.has(key) {
            let c = JS.object()
            c.id = heir.id.clone(); c.stateId = heir.stateId.clone(); c.nationId = JS(nationId); c.rulerId = JS(id); c.name = identity.name.clone(); c.family = identity.house.clone()
            c.alive = JS(true); c.recordedDay = JS(day); c.base = heir.base.clone(); c.traits = heir.traits.clone()
            r.people.persons[key] = c
        }
        r.people.nations[nationId].leaderId = heir.id.clone(); r.people.revision = JS(r.people.revision.asNumber + 1)
        heir.roles.push(leaderRole(r, heir, title: identity.titleAtAccession.asString)); r.kin.revision = JS(r.kin.revision.asNumber + 1)
        r.sovereignty.reigns[id] = heir.id.clone(); r.sovereignty.revision = JS(r.sovereignty.revision.asNumber + 1); r.kin.lifecycle.vacancies.delete(nationId)
        setRulingFamily(r, nationId, heir.familyId.asInt)
        let polity = nation.polity.asString, title = identity.titleAtAccession.asString
        let leaderName = rulerDisplayName(culture: nation.cultureId.asString, polity: polity, name: identity.name.asString, regnalName: regnalName, ordinal: ordinal, given: identity.given.asString, title: title)
        let stateName = r.world.nations.asArray.first { $0.id.asString == nationId }!.name.asString, oldName = old.name.asString
        let text: String
        if cause == "restoration" { text = "\(leaderName)恢复\(stateName)的统治，取代了\(oldName)" }
        else if cause != "death" { text = "\(leaderName)成为\(stateName)的统治者，前任领导人\(oldName)卸任" }
        else if polity == "Republic" || polity == "Federation" { text = "\(leaderName)在选举中当选为\(stateName)的领导人，前任\(oldName)卸任" }
        else if polity == "Empire" { text = "\(leaderName)继承\(stateName)的帝位，前皇帝\(oldName)驾崩" }
        else if polity == "Kingdom" { text = "\(leaderName)继承\(stateName)的王位，前国王\(oldName)去世" }
        else if polity == "Tribal" { text = "\(leaderName)成为\(stateName)的酋长，前酋长\(oldName)去世" }
        else if polity == "Theocracy" { text = "\(leaderName)被选为\(stateName)的教宗，前教宗\(oldName)去世" }
        else { text = "\(leaderName)继承\(stateName)的统治权，前任统治者\(oldName)去世" }
        let reason = cause == "abdication" ? "玩家安排已知家族成员传位，前任仍然在世。" : (polity == "Republic" || polity == "Federation" ? "按原作共和国／联邦紧急候选规则，从至少25岁的已知在世成员中补位；正常投票选举尚未接入。" : "按已恢复的本政体候选规则，从真实登记的在世人物中接任。")
        announce(r, kind: "accession", text: text, reason: reason + " 人物身份、生日、能力和亲属关系保留；家主独立继承。", nations: [nationId], province: nil, people: [reign])
        return reign
    }

    // MARK: Death (civilization47-lifecycle diePersonOwned47 over native Character.Die)
    public static func die(_ r: JS, _ p: JS, cause: String = "natural") {
        func stateById(_ id: Int) -> String? { r.people.nations.objectEntries.first { $0.1.id.asInt == id }?.0 }
        let roles = p.roles.isNull ? [] : p.roles.asArray
        let leader = roles.first { $0.nativeKind.optionalString == "leader" }
        let state = leader.flatMap { stateById($0.stateId.asInt) }
        let row = JS.object()
        row.personId = p.id.clone(); row.day = r.world.day.clone(); row.tick = r.clock.tick.clone(); row.age = p.age.clone(); row.wasLeaderOf = state.map { JS($0) } ?? .null; row.deathHistoryId = .null
        r.kin.lifecycle.deaths.push(row)
        let court = r.people.persons[p.id.asInt.description]; if !court.isNull { court.alive = JS(false) }
        // Character.Die
        p.isAlive = JS(false); p.deathTime = JS(f(r.life.gameTime.asNumber))
        if p.spouseId.asInt > 0, let spouse = person(r, p.spouseId.asInt) { spouse.spouseId = JS(0) }
        let wasLeader = leader != nil
        var leaderState: String?, stateId = 0
        if let leader, leader.stateId.asInt > 0 { stateId = leader.stateId.asInt; leaderState = stateById(stateId) }
        var wasPatriarch = false
        if p.familyId.asInt > 0 { let family = r.kin.families[p.familyId.asInt.description]; wasPatriarch = !family.isNull && family.headId.asInt == p.id.asInt }
        if wasLeader, let nationId = leaderState {
            let history = r.chronicle.leaders[nationId], old = history.asArray.last!
            old.endedDay = r.world.day.clone(); r.people.nations[nationId].leaderId = .null
            let nationName = r.world.nations.asArray.first { $0.id.asString == nationId }!.name.asString, age = p.age.asInt, name = p.identity.name.asString
            let entry = announce(r, kind: "diplomacy", text: "\(nationName)\(name)\(cause == "executed" ? "被处死" : "逝世")",
                                 reason: cause == "executed" ? "享年\(age)岁。被下令处死；终止实际任期，保留人物及其家谱履历。" : "享年\(age)岁。真实月检按原作年龄概率发生自然死亡；终止实际任期，保留人物及其家谱履历。",
                                 nations: [nationId], province: nil, people: [old])
            row.deathHistoryId = entry.id.clone()
        }
        for role in roles {
            let past = pastRole(role, time: f(r.life.gameTime.asNumber), reason: "death")
            if p.pastRoles.isNull { p.pastRoles = .array() }
            p.pastRoles.push(past)
        }
        p.roles = .array()
        if wasLeader, let nationId = leaderState, stateId != 0 { resolveKnownSuccession(r, nationId, p, cause: "death") }
        if wasPatriarch && p.familyId.asInt > 0 {
            let family = r.kin.families[p.familyId.asInt.description]
            if !family.isNull { handlePatriarchSuccession(r, family) }
        }
        for v in [r.people, r.kin, r.kin.lifecycle] { v.revision = JS(v.revision.asNumber + 1) }
    }

    // MARK: Month (advancePeopleMonthOwned47)
    static func deathProbability(_ age: Int) -> Double {
        let a = Double(age)
        if age < 40 { return 0 }
        if age <= 60 { return f(f(f(f(a - 40) / 20) * f(0.002)) + f(0.0005)) }
        if age <= 70 { return f(f(f(f(a - 60) / 10) * f(0.01)) + f(0.0025)) }
        if age <= 80 { return f(f(f(f(a - 70) / 10) * f(0.02)) + f(0.0125)) }
        return min(f(0.1), f(f(f(a - 80) * f(0.003)) + f(0.0325)))
    }
    /// drawLife47: the persisted lifecycle LCG, float32 of state/2³².
    static func drawLife(_ random: JS) -> Double {
        let state = JSMath.lcg(random.state.asNumber)
        random.state = JS(state); random.draws = JS(random.draws.asNumber + 1)
        return f(state / 4294967296)
    }
    static func defaultStats() -> JS {
        let s = JS.object()
        s.totalDeaths = JS(0); s.deathAges = .array(); s.below40 = JS(0); s.from40To60 = JS(0); s.from61To70 = JS(0); s.from71To80 = JS(0); s.above80 = JS(0)
        return s
    }
    /// Returns whether a new month was processed.
    @discardableResult
    public static func month(_ r: JS) -> Bool {
        let l = r.life, k = r.kin, s = k.lifecycle, month = l.currentDate.year.asInt * 12 + l.currentDate.month.asInt - 1
        if month == s.lastMonth.asInt { return false }
        var stats = s.stats
        let alive = k.persons.objectValues.filter { $0.isAlive.asBool }
        for c in alive {
            if c.isAlive.asBool { c.age = JS(yearSince(r, c.birthTime.asNumber)) }
            if c.isAlive.asBool { let lp = l.persons[c.id.asInt.description]; lp.age = c.age.clone(); lp.updatedMonth = JS(month) }
            let roll = drawLife(s.random)
            if !(f(roll) < deathProbability(c.age.asInt)) { continue }
            stats.totalDeaths = JS(stats.totalDeaths.asNumber + 1)
            stats.deathAges.push(JS(f(c.age.asNumber)))
            let age = c.age.asInt, key = age < 40 ? "below40" : age <= 60 ? "from40To60" : age <= 70 ? "from61To70" : age <= 80 ? "from71To80" : "above80"
            stats[key] = JS(stats[key].asNumber + 1)
            die(r, c)
        }
        stats = defaultStats()
        for (id, v) in s.vacancies.objectEntries where r.world.provinces.asArray.contains(where: { $0.controller.asString == id }) {
            resolveKnownSuccession(r, id, k.persons[v.previousPersonId.asInt.description], cause: "vacancy")
        }
        s.stats = stats; s.lastMonth = JS(month); s.revision = JS(s.revision.asNumber + 1)
        k.ageTime = l.gameTime.clone(); k.lastAgeMonth = JS(month); k.revision = JS(k.revision.asNumber + 1)
        l.lastAgeMonth = JS(month); l.revision = JS(l.revision.asNumber + 1)
        return true
    }
}
