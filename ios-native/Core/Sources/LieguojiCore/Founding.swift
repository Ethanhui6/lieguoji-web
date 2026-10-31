import Foundation

/// New states founded mid-run (civilization47-founding foundState47 with civilization47-family and the
/// native family-member kernels): the state's identity, name, colour and relations; its first ruler and
/// ruling family generated as at world creation (or a rebel family's leader); its government rows,
/// destiny and diplomacy; then its provinces change hands.
public enum Founding {
    static let f = Native.fr
    /// cultures.json (name pools for state names).
    public static var cultures = [Opening.Culture]()
    /// settlement25-palette.
    static let palette = PreviewWorld.palette
    /// Province port reconciliation after land changes hands (reconcilePortLandOwnersOwned47).
    public static var reconcilePorts: ((JS) -> Void)?

    // MARK: Random streams
    /// seededCharacterRandom: FNV seed, mulberry32 words.
    final class SeededRandom {
        var h: UInt32
        init(_ seed: String) { var x: UInt32 = 2166136261; for c in seed.utf16 { x = (x ^ UInt32(c)) &* 16777619 }; h = x }
        func word() -> UInt32 {
            h = h &+ 0x6d2b79f5
            var t = (h ^ (h >> 15)) &* (1 | h)
            t ^= t &+ ((t ^ (t >> 7)) &* (61 | t))
            return t ^ (t >> 14)
        }
        func value() -> Double { f(Double(word()) / 4294967295) }
        func floatRange(_ lo: Double, _ hi: Double) -> Double { f(f(lo) + f(f(hi - lo) * f(Double(word()) / 4294967295))) }
        func intRange(_ lo: Int, _ hi: Int) -> Int { lo + Int((Double(word()) / 4294967296 * Double(hi - lo)).rounded(.down)) }
    }
    static func hash(_ s: String) -> UInt32 { People.nameSeed(s) }

    // MARK: Characters (nativeInitialCharacter, family-members)
    static func traitsDrawn(_ count: Int, _ random: SeededRandom) -> [String] {
        let pool = Nobility.traitList
        var result = [JS]()
        if count <= 0 || pool.isEmpty { return [] }
        let positive = pool.filter { Nobility.traitType($0) == 1 }, neutral = pool.filter { Nobility.traitType($0) == 0 }, negative = pool.filter { Nobility.traitType($0) == -1 }
        func eligible(_ t: JS) -> Bool { !result.contains { $0 === t } && !result.contains { Nobility.incompatible(t, $0.name.asString) || Nobility.incompatible($0, t.name.asString) } }
        for _ in 0..<count {
            let v = random.value()
            let source = v < f(0.4) && !positive.isEmpty ? positive : v < f(0.7) && !neutral.isEmpty ? neutral : !negative.isEmpty ? negative : pool
            var candidates = source.filter(eligible)
            if candidates.isEmpty { candidates = pool.filter(eligible) }
            if candidates.isEmpty { break }
            result.append(candidates[random.intRange(0, candidates.count)])
        }
        return result.map { $0.name.asString }
    }
    static func person(_ r: JS, id: Int, first: String, last: String, gender: Int, culture: String, source: String, religionId: JS, identity: JS, random: SeededRandom) -> JS {
        let p = JS.object()
        p.id = JS(0); p.firstName = .null; p.lastName = JS(""); p.cultureName = .null; p.gender = JS(0); p.age = JS(0); p.birthTime = JS(0); p.deathTime = JS(0)
        p.isAlive = JS(true); p.isHistoricallyImportant = JS(false); p.familyId = JS(0); p.originalFamilyId = JS(0); p.stateId = JS(0); p.religionId = .null
        p.fatherId = JS(0); p.motherId = JS(0); p.spouseId = JS(0); p.marriageType = JS(0)
        let base = JS.object(); base.charisma = JS(50); base.military = JS(50); base.diplomatic = JS(50); base.administrative = JS(50); p.base = base
        p.traits = .array(); p.childrenIds = .array(); p.roles = .array(); p.pastRoles = .array()
        p.source = JS(source); p.initialAge = .null; p.religionId = religionId.clone(); p.identity = identity
        p.id = JS(id); p.birthTime = JS(f(r.life.gameTime.asNumber))
        p.firstName = JS(first); p.lastName = JS(last); p.cultureName = JS(culture); p.gender = JS(gender)
        func draw() -> Double { min(100, max(0, f(random.floatRange(20, 80)))) }
        base.charisma = JS(draw()); base.military = JS(draw()); base.diplomatic = JS(draw()); base.administrative = JS(draw())
        p.traits = .array(traitsDrawn(random.intRange(1, 4), random).map { JS($0) })
        return p
    }
    /// generateFamilyMembers47: the leader's spouse, children and collateral households.
    static func generateFamily(_ r: JS, _ family: JS, leader: JS, registry: inout [JS], nextId: inout Int) {
        let random = SeededRandom("\(r.world.custom.seed.asString)/native-family/\(family.id.asInt)")
        let religionId = r.civilization.nations[family.nationId.asString].religionId, life = r.life, kin = r.kin
        func lookup(_ id: Int) -> JS? { registry.first { $0.id.asInt == id } }
        func lastName(_ p: JS) -> String {
            let a = kin.families[p.originalFamilyId.asInt.description], b = kin.families[p.familyId.asInt.description]
            return a.surname.optionalString ?? b.surname.optionalString ?? p.lastName.asString
        }
        func generateInit(_ culture: String, _ gender: Int, _ father: JS?) -> JS {
            let profile = Nobility.cultures[culture], pool = (gender == 0 ? profile.givenMale : profile.givenFemale).asArray, houses = profile.houses.asArray
            let first = pool[random.intRange(0, pool.count)].asString
            var last = houses[random.intRange(0, houses.count)].asString
            if let father, father.familyId.asInt > 0 { let checked = lastName(father); if !checked.isEmpty { last = checked } }
            let identity = Nobility.personName(culture, given: first, house: last, gender: gender)
            let p = person(r, id: nextId, first: first, last: last, gender: gender, culture: culture, source: "initial-family", religionId: religionId, identity: identity, random: random)
            nextId += 1; registry.append(p)
            return p
        }
        func setBirth(_ p: JS, _ age: Double) {
            p.birthTime = JS(f(f(f(life.gameTime.asNumber) - f(f(f(age) * f(365.25)) * f(life.secondsPerDay.asNumber)))))
            if p.isAlive.asBool { p.age = JS(People.yearSince(r, p.birthTime.asNumber)) }
        }
        func childGender(_ parent: JS) -> Int {
            var male = 0, female = 0
            for id in parent.childrenIds.asArray.map(\.asInt) { guard let c = lookup(id), c.isAlive.asBool else { continue }; if c.gender.asInt == 0 { male += 1 } else { female += 1 } }
            return male > female ? 1 : female > male ? 0 : random.value() <= f(0.5) ? 1 : 0
        }
        func appendChild(_ child: JS, _ father: JS, _ mother: JS) { family.memberIds.push(child.id.clone()); father.childrenIds.push(child.id.clone()); mother.childrenIds.push(child.id.clone()) }
        func household(_ m: JS, isCousin: Bool) {
            let culture = family.cultureName.asString, spouse = generateInit(culture, m.gender.asInt == 0 ? 1 : 0, nil)
            var age = f(f(m.age.asNumber) + random.floatRange(-10, 10)); if age < 16 { age = random.floatRange(16, 20) }
            setBirth(spouse, age)
            spouse.familyId = family.id.clone(); spouse.stateId = family.stateId.clone(); spouse.lastName = JS(lastName(m))
            m.spouseId = spouse.id.clone(); spouse.spouseId = m.id.clone(); family.memberIds.push(spouse.id.clone())
            let count = random.intRange(0, isCousin ? 3 : 2)
            for _ in 0..<count {
                let gender = childGender(m), father = m.gender.asInt == 0 ? m : spouse, mother = m.gender.asInt == 1 ? m : spouse
                let child = generateInit(family.cultureName.asString, gender, father)
                child.familyId = family.id.clone(); child.stateId = family.stateId.clone(); child.fatherId = father.id.clone(); child.motherId = mother.id.clone()
                var childAge = f(f(m.age.asNumber) - random.floatRange(18, 35)); if childAge < 0 { childAge = f(Double(random.intRange(0, 15))) }
                setBirth(child, childAge); appendChild(child, father, mother)
            }
        }
        // nativeGenerateLeaderSpouse.
        let spouse = generateInit(family.cultureName.asString, leader.gender.asInt == 0 ? 1 : 0, nil)
        var age = f(f(leader.age.asNumber) + random.floatRange(-10, 10)); if age < 16 { age = random.floatRange(16, 20) }
        setBirth(spouse, age)
        leader.spouseId = spouse.id.clone(); spouse.spouseId = leader.id.clone(); leader.marriageType = JS(0); spouse.marriageType = JS(0)
        spouse.familyId = leader.familyId.clone(); spouse.lastName = JS(lastName(leader)); family.memberIds.push(spouse.id.clone()); spouse.stateId = family.stateId.clone()
        let role = JS.object()
        role.roleType = JS("Spouse"); role.holderId = JS(0); role.startTime = JS(0); role.spouseOfId = JS(0); role.stateId = JS(0); role.nativeKind = JS("spouse")
        role.spouseOfId = leader.id.clone(); role.stateId = family.stateId.clone(); role.holderId = spouse.id.clone(); role.startTime = JS(f(life.gameTime.asNumber)); spouse.roles.push(role)
        // nativeGenerateLeaderChildren (initial).
        let count = random.intRange(1, 4)
        for _ in 0..<count {
            let gender = childGender(leader), father = leader.gender.asInt == 0 ? leader : spouse, mother = leader.gender.asInt == 1 ? leader : spouse
            let child = generateInit(family.cultureName.asString, gender, father)
            child.familyId = family.id.clone(); child.stateId = family.stateId.clone(); child.fatherId = father.id.clone(); child.motherId = mother.id.clone()
            let younger = f(min(leader.age.asNumber, spouse.age.asNumber))
            var childAge = f(younger - random.floatRange(20, 35)); if childAge < 0 { childAge = f(Double(random.intRange(0, 5))) }
            setBirth(child, childAge); appendChild(child, father, mother)
        }
        // nativeGenerateCollateralMembers.
        let culture = family.cultureName.asString, first = random.intRange(1, 4)
        for _ in 0..<first {
            let gender = random.value() <= f(0.5) ? 1 : 0, member = generateInit(culture, gender, nil)
            var a = f(f(leader.age.asNumber) + random.floatRange(-15, 15)); if a < 16 { a = random.floatRange(16, 25) }; if a > 70 { a = random.floatRange(50, 70) }
            setBirth(member, a); member.familyId = family.id.clone(); member.stateId = family.stateId.clone(); member.lastName = JS(lastName(leader)); family.memberIds.push(member.id.clone())
            if member.age.asInt >= 25 && random.value() > f(0.3) { household(member, isCousin: false) }
        }
        let second = random.intRange(1, 3)
        for _ in 0..<second {
            let gender = random.value() <= f(0.5) ? 1 : 0, member = generateInit(culture, gender, nil)
            var a = f(random.floatRange(10, 30) + f(leader.age.asNumber)); if a > 80 { a = random.floatRange(60, 80) }
            setBirth(member, a); member.familyId = family.id.clone(); member.stateId = family.stateId.clone(); member.lastName = JS(lastName(leader)); family.memberIds.push(member.id.clone())
            if random.value() > f(0.4) { household(member, isCousin: true) }
        }
    }

    // MARK: foundState47
    static func color(_ r: JS, _ index: Int) -> String {
        let used = Set(r.world.nations.asArray.map { $0.color.asString.lowercased() })
        for i in 0..<palette.count { let c = palette[(index + i) % palette.count]; if !used.contains(c.lowercased()) { return c } }
        var attempt = 1
        while true {
            let v = (UInt64(hash("\(r.world.custom.seed.asString)/state-color/\(index)")) + UInt64(attempt) * 0x43755b) & 0xffffff
            let c = "#" + String(repeating: "0", count: max(0, 6 - String(v, radix: 16).count)) + String(v, radix: 16)
            if !used.contains(c) { return c }
            attempt += 1
        }
    }
    static func livelihood(_ r: JS, _ ids: [String]) -> String {
        var counts = [Int](repeating: 0, count: 13), coastal = 0
        for id in ids { let p = r.finance.provinces[id]; if p.seaNeighbor.isTruthy { coastal += 1 }; for b in p.cellBiomes.asArray { counts[b.asInt] += 1 } }
        let land = counts.dropFirst().reduce(0, +)
        if Double(coastal) / Double(ids.count) >= 0.5 { return "Maritime" }
        if Double(counts[1] + counts[2] + counts[4]) / Double(land) >= 0.5 { return "Nomadic" }
        if Double(counts[3] + counts[5] + counts[6] + counts[8] + counts[12]) / Double(land) >= 0.5 { return "Agriculture" }
        if Double(counts[7] + counts[9] + counts[10]) / Double(land) >= 0.5 { return "FishAndHunting" }
        return "Other"
    }
    /// A rebel family founding the state: its leader takes office and `moveFamilies` moves the families in.
    public struct RebelFamily { public let familyId: Int; public let leaderId: Int; public let moveFamilies: (String) -> Void }
    @discardableResult
    public static func foundState(_ r: JS, parent: String, provinces ids: [String], reason: String, family: RebelFamily? = nil) -> JS {
        let s = r.foundings, w = r.world, c = r.civilization
        let provinces = ids.map { id in w.provinces.asArray.first { $0.id.asString == id }! }
        let index = w.nations.length, id = "n-\(index)"
        let capital = w.cities.asArray.first { $0.provinceId.asString == provinces[0].id.asString }!
        let seed = w.custom.seed.asString, day = w.day.asNumber, tick = r.clock.tick
        let cultureId = family.map { r.kin.families[String($0.familyId)].cultureName.asString } ?? c.cities[capital.id.asString].cultureId.asString
        let profile = cultures.first { $0.id == cultureId }!
        let used = Set(c.nations.objectValues.map { $0.name.value.asString })
        let fresh = Opening.freshName(profile, c.mode.asString, "state", "\(seed)/rebel-state/\(id)", used)!
        let identity = JS.object()
        identity.cultureId = JS(cultureId); identity.religionId = c.nations[parent].religionId.clone(); identity.polity = JS(profile.suggestedPolity)
        let name = JS.object(); name.value = JS(fresh.value); name.mode = c.mode.clone(); name.sourceKey = JS(fresh.sourceKey); name.custom = .null; identity.name = name
        identity.origin = JS("secession"); identity.parentId = JS(parent)
        c.nations[id] = identity; Vassals.bump(c)
        let nation = JS.object()
        nation.id = JS(id); nation.name = JS(Opening.stateTitle(fresh.value, polity: profile.suggestedPolity, religion: identity.religionId.asString)); nation.color = JS(color(r, index))
        nation.capitalId = capital.id.clone(); nation.regimeId = JS("regime-\(index)"); nation.dynastyId = JS("dynasty-\(index)")
        w.nations.push(nation)
        let policy = JS.object(); policy.nationId = JS(id); policy.priority = JS("balanced"); policy.lastLedger = .null; policy.lastDecision = .null; w.statecraft.nations.push(policy)
        for n in w.nations.asArray where n.id.asString != id {
            let pair = [n.id.asString, id].sorted { Array($0.utf16).lexicographicallyPrecedes(Array($1.utf16)) }
            let rel = JS.object(); rel.a = JS(pair[0]); rel.b = JS(pair[1]); rel.status = JS("peace"); rel.sinceDay = JS(day); rel.truceUntilDay = JS(0); w.statecraft.relations.push(rel)
        }
        // Ruler identity and the chronicle reign.
        let reignId = "ruler-\(id)-1"
        let ruler: JS
        if let family { ruler = rulerFrom(r.kin.persons[String(family.leaderId)].identity, identity) }
        else {
            let gender = Int(hash("\(seed)/\(reignId)") % 2), names = gender == 0 ? Nobility.cultures[cultureId].givenMale : Nobility.cultures[cultureId].givenFemale, houses = Nobility.cultures[cultureId].houses
            let given = names[Int(hash("\(seed)/\(reignId)/given") % UInt32(names.length))].asString, house = houses[Int(hash("\(seed)/\(reignId)/house") % UInt32(houses.length))].asString
            ruler = rulerFrom(Nobility.personName(cultureId, given: given, house: house, gender: gender), identity)
        }
        c.rulers[reignId] = ruler
        let reign = JS.object()
        reign.id = JS(reignId); reign.name = ruler.name.clone(); reign.family = ruler.house.clone(); reign.order = JS(1); reign.regnalName = ruler.given.clone(); reign.regnalOrdinal = JS(1)
        reign.ascendedDay = JS(day); reign.endedDay = .null; reign.termEndDay = JS(day + Double((12 + Int(hash(reignId) % 14)) * 365))
        r.chronicle.leaders[id] = .array([reign])
        let life = r.life, stateId = r.people.nextStateId.asInt
        r.people.nextStateId = JS(max(r.people.nextStateId.asInt, stateId + 1))
        let book = JS.object(); book.id = JS(stateId); book.leaderId = .null
        let offices = JS.object(); offices.assignments = .array(); offices.normalized = JS(true); offices.revision = JS(0); book.offices = offices
        r.people.nations[id] = book
        let month = life.lastAgeMonth.clone()
        let personId: Int
        var personIds = [Int](), couples = [[Int]]()
        if let family {
            family.moveFamilies(id)
            let leader = r.kin.persons[String(family.leaderId)]; personId = leader.id.asInt
            let court = JS.object()
            court.id = JS(personId); court.stateId = JS(stateId); court.nationId = JS(id); court.rulerId = JS(reignId); court.name = ruler.name.clone(); court.family = ruler.house.clone()
            court.alive = JS(true); court.recordedDay = JS(day); court.base = leader.base.clone(); court.traits = leader.traits.isNull ? .array() : leader.traits.clone()
            r.people.persons[String(personId)] = court; r.people.nations[id].leaderId = JS(personId); Vassals.bump(r.people)
            leader.roles.push(People.leaderRole(r, leader, title: ruler.titleAtAccession.asString))
            let k = JS.object()
            k.id = JS(stateId); k.surname = r.kin.families[String(family.familyId)].surname.clone(); k.cultureName = JS(cultureId); k.nationId = JS(id); k.stateId = JS(stateId)
            k.headId = JS(0); k.heirId = JS(0); k.allowFemaleInheritance = JS(false); k.memberIds = .array(); k.collateralMemberIds = .array()
            r.kin.families[String(stateId)] = k; Vassals.bump(r.kin)
            personIds = [personId]
        } else {
            let random = SeededRandom("\(seed)/native-person/\(reignId)/\(jsNumber(tick.asNumber))")
            func draw() -> Double { min(100, max(0, f(random.floatRange(20, 80)))) }
            let generatedBase = JS.object(); generatedBase.charisma = JS(draw()); generatedBase.military = JS(draw()); generatedBase.diplomatic = JS(draw()); generatedBase.administrative = JS(draw())
            let traits = traitsDrawn(random.intRange(1, 4), random)
            personId = r.people.nextPersonId.asInt; r.people.nextPersonId = JS(personId + 1)
            let age = random.intRange(35, 55)
            let birthTime = f(f(f(life.gameTime.asNumber) - f(f(f(Double(age)) * f(365.25)) * f(life.secondsPerDay.asNumber))))
            let court = JS.object()
            court.id = JS(personId); court.stateId = JS(stateId); court.nationId = JS(id); court.rulerId = JS(reignId); court.name = ruler.name.clone(); court.family = ruler.house.clone()
            court.alive = JS(true); court.recordedDay = JS(day); court.base = generatedBase.clone(); court.traits = .array(traits.map { JS($0) })
            r.people.persons[String(personId)] = court; r.people.nations[id].leaderId = JS(personId); Vassals.bump(r.people)
            let lp = JS.object(); lp.source = JS("native-founding"); lp.birthTime = JS(birthTime); lp.age = JS(age); lp.initialAge = JS(age); lp.updatedMonth = month.clone()
            life.persons[String(personId)] = lp; Vassals.bump(life)
            let pname = Nobility.personName(ruler.cultureId.asString, given: ruler.given.asString, house: ruler.house.asString, gender: ruler.gender.asInt)
            let leader = person(r, id: personId, first: pname.given.asString, last: pname.house.asString, gender: pname.gender.asInt, culture: pname.cultureId.asString, source: "founding", religionId: ruler.religionId, identity: pname, random: SeededRandom(""))
            leader.age = JS(age); leader.birthTime = JS(birthTime); leader.familyId = JS(stateId); leader.originalFamilyId = JS(stateId); leader.stateId = JS(stateId)
            leader.base = generatedBase.clone(); leader.traits = .array(traits.map { JS($0) }); leader.initialAge = JS(age)
            let role = JS.object()
            role.holderId = JS(0); role.startTime = JS(0); role.roleType = JS("NationalLeader"); role.title = .null; role.reignStartTime = JS(f(life.gameTime.asNumber)); role.stateId = JS(0)
            role.nativeKind = JS("leader"); role.holderId = JS(personId); role.stateId = JS(stateId); role.title = ruler.titleAtAccession.clone()
            leader.roles.push(role)
            r.kin.persons[String(personId)] = leader
            let k = JS.object()
            k.id = JS(stateId); k.surname = pname.house.clone(); k.cultureName = pname.cultureId.clone(); k.nationId = JS(id); k.stateId = JS(stateId)
            k.headId = JS(personId); k.heirId = JS(0); k.allowFemaleInheritance = JS(false); k.memberIds = .array([JS(personId)]); k.collateralMemberIds = .array()
            r.kin.families[String(stateId)] = k
            var registry = [leader], nextId = r.people.nextPersonId.asInt
            generateFamily(r, k, leader: leader, registry: &registry, nextId: &nextId)
            for p in registry {
                p.identity = Nobility.personName(p.cultureName.asString, given: p.firstName.asString, house: p.lastName.asString, gender: p.gender.asInt)
                r.kin.persons[p.id.asInt.description] = p
                if p.source.asString == "initial-family" {
                    let x = JS.object(); x.source = JS("native-family"); x.birthTime = p.birthTime.clone(); x.age = p.age.clone(); x.initialAge = .null; x.updatedMonth = month.clone()
                    life.persons[p.id.asInt.description] = x
                }
            }
            r.people.nextPersonId = JS(nextId); Vassals.bump(r.kin)
            personIds = registry.map(\.id.asInt); couples = registry.filter { $0.spouseId.asInt > $0.id.asInt }.map { [$0.id.asInt, $0.spouseId.asInt] }
        }
        r.sovereignty.reigns[reignId] = JS(personId); r.sovereignty.restorations[id] = JS(0); Vassals.bump(r.sovereignty)
        let upper = JS.object()
        upper.polity = identity.polity.clone(); upper.traits = .array(); upper.destiny = JS(0); upper.coreThreshold = JS(2); upper.coreYear = JS((day / 360).rounded(.down)); upper.provinceOrder = .array()
        r.upperCombat.nations[id] = upper
        let fin = JS.object()
        fin.gold = JS(0); fin.goldPerMonth = JS(0); fin.armyCostGold = JS(0); fin.goldBattleModifier = JS(1); fin.initializedDay = JS(day); fin.lastMonth = JS((day / 30).rounded(.down)); fin.ledger = .null
        r.finance.nations[id] = fin
        let eco = JS.object(); eco.ethnic = JS(livelihood(r, ids)); eco.source = JS("terrain-start"); eco.provinceIds = .array(ids.map { JS($0) })
        r.economy.nations[id] = eco; Vassals.bump(r.economy)
        let mob = JS.object(); mob.lastMonth = .null; mob.recent = .array(); r.tactics.mobilizations[id] = mob
        startDestiny(r, id)
        let personnel = JS.object(); personnel.damageTraits = .array()
        let leaderCombat = JS.object(); leaderCombat.leaderId = .null; leaderCombat.traitNames = .array(); leaderCombat.enemyIds = .array(); leaderCombat.refreshedTick = tick.clone(); leaderCombat.modifier = JS(0)
        personnel.leader = leaderCombat; r.combatPersonnel.nations[id] = personnel
        r.diplomacy.nations[id] = JS(true); Vassals.bump(r.diplomacy)
        addDiplomacy(r, id, parent)
        Wars.reconcileIdentities(r)
        for p in provinces { PeaceBridge.transferEconomy(r, p.id.asString, parent, id); p.controller = JS(id); p.legalOwner = JS(id) }
        let moved = Set(ids)
        r.occupation.sieges.asArray = r.occupation.sieges.asArray.filter { !moved.contains($0.provinceId.asString) }
        Government.relocateLostCapitals(r); Wars.reconcileCore(r); reconcilePorts?(r)
        let entry = People.announce(r, kind: "uprising", text: "\(nation.name.asString) 成立于 \(provinces[0].name.asString)", reason: reason, nations: [parent, id], province: provinces[0].id.asString, people: [reign])
        let record = JS.object()
        record.nationId = JS(id); record.stateId = JS(stateId); record.parentId = JS(parent); record.provinceIds = .array(ids.map { JS($0) }); record.tick = tick.clone(); record.day = JS(day)
        record.gameTime = life.gameTime.clone(); record.month = month.clone(); record.leaderId = JS(personId); record.personIds = .array(personIds.map { JS($0) })
        record.couples = .array(couples.map { .array($0.map { JS($0) }) }); record.entryId = entry.id.clone()
        s.records.push(record); Vassals.bump(s)
        return record
    }
    static func rulerFrom(_ person: JS, _ n: JS) -> JS {
        let o = person.clone()
        o.religionId = n.religionId.clone(); o.polityAtAccession = n.polity.clone(); o.regnalName = person.given.clone()
        o.titleAtAccession = JS(People.rulerTitle(culture: person.cultureId.asString, polity: n.polity.asString, religion: n.religionId.asString, gender: person.gender.asInt))
        return o
    }
    /// startDestiny47: the state's own destiny stream, defaults then a first redraw.
    static func startDestiny(_ r: JS, _ id: String) {
        var stream = Destiny.Random(seed: People.nameSeed("\(r.world.custom.seed.optionalString ?? "")/destiny20/\(id)"))
        let decrease = stream.floatRange(0.083, 0.24)
        var state = Destiny.State(destiny: 0, decrease: decrease, manifestCount: 3, manifest: false, seed: stream.seed, lastMonth: r.world.day.asInt / 30)
        var random = Destiny.Random(seed: state.seed)
        state.manifestCount = random.intRange(2, 5)
        let manifest = state.manifest && state.manifestCount > 0
        state.manifestCount -= 1
        var cleared = false
        if manifest { state.destiny = Double(random.intRange(70, 90)) } else { state.destiny = Double(random.intRange(10, 90)); state.decrease = random.floatRange(0.043, 0.28); cleared = true }
        state.seed = random.seed
        let v = JS.object()
        v.destiny = JS(state.destiny); v.decrease = JS(state.decrease); v.manifestCount = JS(state.manifestCount); v.manifest = JS(state.manifest); v.seed = JS(Double(state.seed))
        v.initializedDay = r.world.day.clone(); v.lastMonth = JS(r.world.day.asInt / 30); v.restorations = JS(0); v.resets = JS(0); v.ledger = .null
        r.destiny.nations[id] = v; r.upperCombat.nations[id].destiny = JS(state.destiny)
        if cleared { r.tactics.mobilizations[id].recent = .array() }
        Vassals.bump(r.destiny)
    }
    /// addFoundedNation46: pools and cooldowns of a new state; expansionism inherited from the parent.
    static func addDiplomacy(_ r: JS, _ id: String, _ parent: String) {
        let s = r.nativeDiplomacy
        let pools = JS.object(); pools.power = JS(100); pools.startWar = JS(100); pools.endWar = JS(100); pools.efficiency = JS(0)
        DiplomacyBridge.accumulate(pools, 20)
        func range(_ lo: Double, _ hi: Double) -> Double { f(lo + f(f(Diplomatic.random(s)) * f(hi - lo))) }
        pools.startWar = JS(f(range(f(f(100) * 0), f(100)))); pools.endWar = JS(f(range(f(f(100) * 0), f(100))))
        let n = JS.object()
        n.origin = JS("secession"); n.parentId = JS(parent); n.initializedTick = r.clock.tick.clone(); n.expansionism = s.nations[parent].expansionism.clone()
        n.activeTime = JS(-8.988465674311579e307); n.passiveTime = JS(-8.988465674311579e307); n.pools = pools
        n.updateDay = JS(DiplomacyBridge.drawDay(r)); n.updatedMonth = JS(DiplomacyBridge.month(r) - 1)
        s.nations[id] = n; Vassals.bump(s)
    }
}
