import Foundation

/// The original noble families (civilization47-nobility-monthly, -births, -marriage, -fate, -war),
/// ported line by line on the run state: lost land and fallen states decide each family's fate, armies
/// are assigned to the family of their home, and every month each family of a living state gets a
/// random update day on which it ages its records, has children, marries, recomputes its influence
/// and keeps one to four collateral relatives; claims grow each new year.
public enum Nobility {
    /// Person name pools by culture: givenMale, givenFemale, houses, familyFirst, join, romanFemale.
    public static var cultures = JS.object()
    /// character-traits.json in order (the native trait pool).
    public static var traitList = [JS]()
    static let f = Native.fr
    static func trait(_ name: String) -> JS? { traitList.first { $0.name.asString == name } }

    // MARK: Random (nobilityRandom47: Unity Random.Range over the persisted family stream)
    struct Random {
        let n: JS
        func raw() -> Double { let r = n.random, s = JSMath.lcg(r.state.asNumber); r.state = JS(s); r.draws = JS(r.draws.asNumber + 1); return s / 4294967296 }
        func value() -> Double { Native.fr(raw()) }
        func intRange(_ lo: Int, _ hi: Int) -> Int { hi <= lo ? lo : lo + Int((raw() * Double(hi - lo)).rounded(.down)) }
        func floatRange(_ lo: Double, _ hi: Double) -> Double { Native.fr(lo + Native.fr(raw()) * (hi - lo)) }
    }

    // MARK: Names and characters
    static func personName(_ culture: String, given: String, house: String, gender: Int) -> JS {
        let p = cultures[culture], names = (gender == 0 ? p.givenMale : p.givenFemale).asArray.map(\.asString), houses = p.houses.asArray.map(\.asString)
        let index = names.firstIndex(of: given)!, family = houses.firstIndex(of: house)!
        let name: String
        if culture == "roman" && gender == 1 { name = p.romanFemale[family].asString + "·" + given }
        else if ["arab", "greek", "norse", "indian"].contains(culture) { name = given }
        else { name = p.familyFirst.asBool ? house + p.join.asString + given : given + p.join.asString + house }
        let o = JS.object()
        o.cultureId = JS(culture); o.given = JS(given); o.house = JS(house); o.gender = JS(gender); o.name = JS(name); o.mode = JS("culture-generated")
        o.sourceKey = JS("person/\(culture)/culture-generated/\(gender)/\(index)/\(family)")
        return o
    }
    static func traitType(_ t: JS) -> Int {
        let sum = f(f(f(f(t.militaryModifier.asNumber) + f(t.charismaModifier.asNumber)) + f(t.diplomaticModifier.asNumber)) + f(t.administrativeModifier.asNumber))
        return sum > 5 ? 1 : sum < -5 ? -1 : 0
    }
    static func incompatible(_ a: JS, _ b: String) -> Bool { !a.incompatibleTraits.isNull && a.incompatibleTraits.asArray.contains { $0.asString == b } }
    /// nativeRandomTraits.
    static func randomTraits(_ count: Int, _ random: Random) -> [String] {
        var result = [JS]()
        if count <= 0 || traitList.isEmpty { return [] }
        let positive = traitList.filter { traitType($0) == 1 }, neutral = traitList.filter { traitType($0) == 0 }, negative = traitList.filter { traitType($0) == -1 }
        func eligible(_ t: JS) -> Bool { !result.contains { $0 === t } && !result.contains { incompatible(t, $0.name.asString) || incompatible($0, t.name.asString) } }
        for _ in 0..<count {
            let v = random.value()
            let source = v < f(0.4) && !positive.isEmpty ? positive : v < f(0.7) && !neutral.isEmpty ? neutral : !negative.isEmpty ? negative : traitList
            var candidates = source.filter(eligible)
            if candidates.isEmpty { candidates = traitList.filter(eligible) }
            if candidates.isEmpty { break }
            result.append(candidates[random.intRange(0, candidates.count)])
        }
        return result.map { $0.name.asString }
    }
    /// nativeCharacterDefaults plus the web fields, then nativeCreateBlankCharacter and nativeCreateNamedCharacter.
    static func createNamed(_ r: JS, first: String, last: String, gender: Int, culture: String, source: String, religionId: JS, identity: JS, random: Random) -> JS {
        let p = JS.object()
        p.id = JS(0); p.firstName = .null; p.lastName = JS(""); p.cultureName = .null; p.gender = JS(0); p.age = JS(0); p.birthTime = JS(0); p.deathTime = JS(0)
        p.isAlive = JS(true); p.isHistoricallyImportant = JS(false); p.familyId = JS(0); p.originalFamilyId = JS(0); p.stateId = JS(0); p.religionId = .null
        p.fatherId = JS(0); p.motherId = JS(0); p.spouseId = JS(0); p.marriageType = JS(0)
        let base = JS.object(); base.charisma = JS(50); base.military = JS(50); base.diplomatic = JS(50); base.administrative = JS(50); p.base = base
        p.traits = .array(); p.childrenIds = .array(); p.roles = .array(); p.pastRoles = .array()
        p.source = JS(source); p.initialAge = .null; p.religionId = religionId.clone(); p.identity = identity
        let id = r.people.nextPersonId.asInt
        p.id = JS(id); r.people.nextPersonId = JS(id + 1); p.birthTime = JS(f(r.life.gameTime.asNumber))
        p.firstName = JS(first); p.lastName = JS(last); p.cultureName = JS(culture); p.gender = JS(gender)
        func draw() -> Double { min(100, max(0, f(random.floatRange(20, 80)))) }
        base.charisma = JS(draw()); base.military = JS(draw()); base.diplomatic = JS(draw()); base.administrative = JS(draw())
        let count = random.intRange(1, 4)
        p.traits = .array(randomTraits(count, random).map { JS($0) })
        return p
    }
    static func charisma(_ p: JS) -> Double { People.skills(p).charisma }
    static func alive(_ r: JS, _ id: Int) -> Bool { People.person(r, id)?.isAlive.asBool == true }
    static func stateAlive(_ r: JS, _ nationId: String) -> Bool { r.world.provinces.asArray.contains { $0.controller.asString == nationId } }
    static func living(_ r: JS, _ id: String) -> [JS] { People.livingOwn(r, r.kin.families[id]) }
    static func bump(_ v: JS) { v.revision = JS(v.revision.asNumber + 1) }

    // MARK: Daily step (advanceNobility47)
    /// Hooks for the month-6/12 family rebellion and civil war checks (ported separately).
    public static var monthlyChecks: ((JS) -> Void)?
    public static func advance(_ r: JS) {
        let n = r.nobility
        if n.isNull { return }
        var controller = [String: String]()
        for p in r.world.provinces.asArray { controller[p.id.asString] = p.controller.asString }
        for id in n.families.objectKeys {
            let fam = n.families[id]; if fam.isNull { continue }
            for p in fam.controlledProvinces.asArray.map(\.asString) {
                let now = controller[p]!
                if now != fam.nationId.asString && n.families.has(id) { familyLostProvince(r, id, p, now, fateWar(r, fam.nationId.asString, now)) }
            }
        }
        let living = r.world.nations.asArray.map(\.id.asString).filter { stateAlive(r, $0) }
        for dead in n.aliveStates.asArray.map(\.asString) where !living.contains(dead) {
            guard let conqueror = lastConqueror(r, dead, living) else { continue }
            for id in n.families.objectKeys.filter({ n.families[$0].nationId.asString == dead }) where n.families.has(id) {
                executeFate(r, id, decideFate(r, id, conqueror, fateWar(r, dead, conqueror)), conqueror)
            }
        }
        n.aliveStates = .array(living.map { JS($0) })
        reconcileArmies(r)
        let date = r.life.currentDate, month = date.year.asInt * 12 + date.month.asInt - 1
        if month != n.month.asInt {
            n.month = JS(month); n.monthFamilies = .array()
            let random = Random(n: n)
            for (id, fam) in n.families.objectEntries where stateAlive(r, fam.nationId.asString) { fam.updateDay = JS(random.intRange(1, 29)); n.monthFamilies.push(JS(id)) }
            for fam in n.families.objectValues where fam.rallyCooldown.asNumber > 0 { fam.rallyCooldown = JS(max(0, fam.rallyCooldown.asNumber - 1)) }
            if date.month.asInt % 6 == 0 && !r.foundings.isNull { monthlyChecks?(r) }
        }
        let day = date.day.asInt
        for id in n.monthFamilies.asArray.map(\.asString) {
            let fam = n.families[id]
            if fam.isNull || fam.updateDay.asInt != day || !r.kin.families.has(id) { continue }
            updateDuration(r, fam)
            if stateAlive(r, fam.nationId.asString) { processBirths(r, n, id); if checkExtinction(r, n, id) { continue } }
            if stateAlive(r, fam.nationId.asString) { processMarriages(r, n, id) }
            updateInfluence(r, id, fam); maintainCollateral(r, n, id)
        }
        if date.month.asInt == 1 && day == 1 && n.year.asInt != date.year.asInt {
            n.year = date.year.clone()
            for fam in n.families.objectValues { updateClaims(fam) }
        }
    }
    static func updateDuration(_ r: JS, _ fam: JS) {
        let state = fam.nationId.asString
        if !stateAlive(r, state) { return }
        fam.stateResidenceMonths[state] = JS(f((fam.stateResidenceMonths[state].optionalNumber ?? 0) + 1))
        if !fam.ruling.asBool { return }
        fam.rulingDuration[state] = JS(f((fam.rulingDuration[state].optionalNumber ?? 0) + 1))
        if !fam.historicalStateIds.asArray.contains(where: { $0.asString == state }) { fam.historicalStateIds.push(JS(state)) }
        fam.lastRulingTime[state] = r.life.gameTime.clone()
        for p in fam.controlledProvinces.asArray.map(\.asString) { fam.historicalClaims[p] = JS(f((fam.historicalClaims[p].optionalNumber ?? 0) + f(0.5))) }
    }
    static func updateInfluence(_ r: JS, _ id: String, _ fam: JS) {
        let k = r.kin.families[id]
        var v = f(f(Double(k.collateralMemberIds.length * 2)) + f(f(f(Double(fam.controlledProvinces.length * 20)) + 10) + f(Double(k.memberIds.length * 5))))
        if fam.ruling.asBool { v = f(v + 100) }
        v = f(v + f(f(log(f(max(1, fam.wealth.asNumber)))) * 10))
        if k.headId.asInt > 0, let head = People.person(r, k.headId.asInt), head.isAlive.asBool, !head.traits.isNull {
            for name in head.traits.asArray.map(\.asString) { let m = f(trait(name)?.familyInfluenceModifier.optionalNumber ?? 0); if m != 0 { v = f(v + m) } }
        }
        fam.influence = JS(0 > v ? 0 : v > 1000 ? 1000 : v)
    }
    static func maintainCollateral(_ r: JS, _ n: JS, _ id: String) {
        let k = r.kin.families[id]
        for pid in k.collateralMemberIds.asArray.map(\.asInt) {
            let p = People.person(r, pid)
            if let p, p.isAlive.asBool { continue }
            k.collateralMemberIds.asArray.remove(at: k.collateralMemberIds.asArray.firstIndex { $0.asInt == pid }!)
            if p != nil { n.detached.push(JS(pid)) }
        }
        while k.collateralMemberIds.length < 1 { createCollateral(r, n, id) }
        while k.collateralMemberIds.length > 4 {
            let pid = k.collateralMemberIds.asArray.last!.asInt, p = People.person(r, pid)!
            if p.spouseId.asInt != 0 || p.childrenIds.length > 0 || p.fatherId.asInt != 0 || p.motherId.asInt != 0 || r.people.persons.has(String(pid)) { break }
            k.collateralMemberIds.asArray.removeLast(); r.kin.persons.delete(String(pid)); r.life.persons.delete(String(pid))
            n.collaterals.asArray = n.collaterals.asArray.filter { $0.personId.asInt != pid }
        }
        bump(r.kin)
    }
    static func createCollateral(_ r: JS, _ n: JS, _ id: String) {
        let k = r.kin.families[id], random = Random(n: n), gender = random.value() <= f(0.5) ? 1 : 0, culture = k.cultureName.asString, profile = cultures[culture]
        let pool = (gender == 0 ? profile.givenMale : profile.givenFemale).asArray, first = pool[random.intRange(0, pool.count)].asString
        let houses = profile.houses.asArray, generatedLast = houses[random.intRange(0, houses.count)].asString
        let last = k.surname.asString.isEmpty ? generatedLast : k.surname.asString, life = r.life
        let identity = personName(culture, given: first, house: last, gender: gender), religionId = r.civilization.nations[k.nationId.asString].religionId
        let p = createNamed(r, first: first, last: last, gender: gender, culture: culture, source: "collateral", religionId: religionId, identity: identity, random: random)
        p.familyId = k.id.clone(); p.stateId = k.stateId.clone()
        let age = random.floatRange(20, 40)
        p.birthTime = JS(f(f(f(life.gameTime.asNumber) - f(f(f(age) * f(365.25)) * f(life.secondsPerDay.asNumber)))))
        p.isAlive = JS(true)
        p.age = JS(People.yearSince(r, p.birthTime.asNumber, now: r.kin.ageTime.asNumber))
        p.base.charisma = JS(random.floatRange(20, 80)); p.base.military = JS(random.floatRange(20, 80)); p.base.diplomatic = JS(random.floatRange(20, 80)); p.base.administrative = JS(random.floatRange(20, 80))
        r.kin.persons[p.id.asInt.description] = p; k.collateralMemberIds.push(p.id.clone())
        let lp = JS.object(); lp.source = JS("native-family"); lp.birthTime = p.birthTime.clone(); lp.age = p.age.clone(); lp.initialAge = .null; lp.updatedMonth = r.kin.lastAgeMonth.clone()
        life.persons[p.id.asInt.description] = lp; bump(life)
        bump(r.people)
        let c = JS.object(); c.personId = p.id.clone(); c.familyId = k.id.clone(); c.day = r.world.day.clone(); n.collaterals.push(c)
    }
    static func updateClaims(_ fam: JS) {
        let next = JS.object(), held = fam.controlledProvinces.asArray.map(\.asString)
        for (p, v) in fam.historicalClaims.objectEntries { let c = held.contains(p) ? f(v.asNumber + 1) : f(v.asNumber - 1); if c > 0 { next[p] = JS(c) } }
        for p in held where !fam.historicalClaims.has(p) { next[p] = JS(1) }
        fam.historicalClaims = next
    }
    static func fateWar(_ r: JS, _ a: String, _ b: String) -> Int? {
        guard let c = r.nativeWars.campaigns.asArray.first(where: { $0.endedTick.isNull && ($0.attacker.asString == a && $0.defender.asString == b || $0.attacker.asString == b && $0.defender.asString == a) }) else { return nil }
        return c.internal.casusBelliId.optionalNumber == 14 ? 2 : 0
    }
    static func lastConqueror(_ r: JS, _ dead: String, _ living: [String]) -> String? {
        let capitalId = r.world.nations.asArray.first { $0.id.asString == dead }?.capitalId.optionalString
        let capital = r.world.cities.asArray.first { $0.id.optionalString == capitalId }?.provinceId.optionalString
        let holder = r.world.provinces.asArray.first { $0.id.optionalString == capital }?.controller.optionalString
        if let holder, holder != dead, living.contains(holder) { return holder }
        return living.first
    }

    // MARK: Armies (civilization47-nobility-war)
    static func holder(_ n: JS, _ province: String) -> String? { n.families.objectKeys.first { id in n.families[id].controlledProvinces.asArray.contains { $0.asString == province } } }
    static func isCore(_ r: JS, _ province: String, _ nation: String) -> Bool {
        let p = r.upperCombat.provinces[province], s = r.upperCombat.nations[nation]
        return !p.isNull && !s.isNull && p.distance.asNumber <= s.coreThreshold.asNumber
    }
    @discardableResult
    static func army(_ r: JS, _ id: String) -> JS? {
        let n = r.nobility, row = n.armies[id]
        if !row.isNull { return row }
        guard let a = r.world.armies.asArray.first(where: { $0.id.asString == id }) else { return nil }
        let o = JS.object()
        if let family = holder(n, a.originId.asString) { o.familyId = JS(Double(family)!); o.central = JS(isCore(r, a.originId.asString, a.nationId.asString)) }
        else { o.familyId = JS(0); o.central = JS(true) }
        n.armies[id] = o
        return o
    }
    static func reconcileArmies(_ r: JS) {
        let n = r.nobility, live = Set(r.world.armies.asArray.filter { $0.status.asString != "destroyed" }.map(\.id.asString))
        for id in n.armies.objectKeys where !live.contains(id) { n.armies.delete(id) }
        for a in r.world.armies.asArray where a.status.asString != "destroyed" { army(r, a.id.asString) }
    }

    // MARK: Births (civilization47-nobility-births)
    static func hasYoungChild(_ r: JS, _ p: JS) -> Bool { p.childrenIds.asArray.contains { if let c = People.person(r, $0.asInt) { return c.isAlive.asBool && f(2) > c.age.asNumber }; return false } }
    static func birthChance(_ r: JS, _ id: String, _ p: JS) -> Double {
        let count = p.childrenIds.length
        var v = f(count == 0 ? 0.45 : count == 1 ? 0.3 : count == 2 ? 0.1 : 0.2)
        let age = p.age.asInt
        if age >= 18 && age <= 25 { v = f(v + f(0.1)) } else if age >= 26 && age <= 35 { v = f(v + f(0.05)) } else if age >= 36 && age <= 40 { v = f(v + f(-0.1)) }
        let members = living(r, id).count
        if members < 3 { v = f(v + f(0.1)) } else if members < 5 { v = f(v + f(0.05)) } else if members > 10 { v = f(v + f(-0.15)) }
        if hasYoungChild(r, p) { v = f(v * f(0.3)) }
        return max(0, v)
    }
    static func processBirths(_ r: JS, _ n: JS, _ id: String) {
        let members = living(r, id)
        if members.count >= 15 { return }
        let random = Random(n: n)
        for p in members {
            if p.gender.asInt != 1 || p.spouseId.asInt == 0 || p.age.asInt < 18 || p.age.asInt > 40 { continue }
            guard let spouse = People.person(r, p.spouseId.asInt), spouse.isAlive.asBool else { continue }
            if p.childrenIds.length >= 3 || spouse.childrenIds.length >= 3 { continue }
            let chance = f(birthChance(r, id, p) / f(12))
            if chance > random.value() { createChild(r, n, id, p, random) }
        }
    }
    static func createChild(_ r: JS, _ n: JS, _ id: String, _ mother: JS, _ random: Random) {
        let father = People.person(r, mother.spouseId.asInt)!
        var male = 0, female = 0
        for c in mother.childrenIds.asArray.compactMap({ People.person(r, $0.asInt) }) where c.isAlive.asBool { if c.gender.asInt == 0 { male += 1 } else { female += 1 } }
        let gender = male > female ? 1 : male < female ? 0 : random.value() <= f(0.5) ? 1 : 0
        let fatherFamily = r.kin.families[father.familyId.asInt.description]
        let k = fatherFamily.isNull ? r.kin.families[id] : fatherFamily, last = fatherFamily.isNull ? k.surname.asString : fatherFamily.surname.asString
        let life = r.life, noble = n.families[k.id.asInt.description]
        let religionId = noble.isNull ? r.civilization.nations[k.nationId.asString].religionId : noble.religionId
        let culture = k.cultureName.asString, profile = cultures[culture]
        let pool = (gender == 0 ? profile.givenMale : profile.givenFemale).asArray, first = pool[random.intRange(0, pool.count)].asString
        let houses = profile.houses.asArray; var surname = houses[random.intRange(0, houses.count)].asString
        if father.familyId.asInt > 0 && !last.isEmpty { surname = last }
        let identity = personName(culture, given: first, house: surname, gender: gender)
        let child = createNamed(r, first: first, last: surname, gender: gender, culture: culture, source: "newborn", religionId: religionId, identity: identity, random: random)
        child.familyId = k.id.clone(); child.originalFamilyId = k.id.clone(); child.stateId = k.stateId.clone(); child.fatherId = father.id.clone(); child.motherId = mother.id.clone()
        child.isAlive = JS(true); child.age = JS(0)
        let scale = f(random.floatRange(-0.2, 0.2) + 1), mean = f(f(charisma(father) + charisma(mother)) * f(0.5)), cha = f(scale * mean)
        child.base.charisma = JS(0 > cha ? 0 : cha > 100 ? 100 : cha)
        child.base.military = JS(random.floatRange(20, 80)); child.base.diplomatic = JS(random.floatRange(20, 80)); child.base.administrative = JS(random.floatRange(20, 80))
        inheritTraits(child, father, mother, random)
        father.childrenIds.push(child.id.clone()); mother.childrenIds.push(child.id.clone()); k.memberIds.push(child.id.clone())
        r.kin.persons[child.id.asInt.description] = child
        let lp = JS.object(); lp.source = JS("web-newborn"); lp.birthTime = child.birthTime.clone(); lp.age = JS(0); lp.initialAge = .null; lp.updatedMonth = r.kin.lastAgeMonth.clone()
        life.persons[child.id.asInt.description] = lp
        bump(r.people); bump(r.kin); bump(life)
        let b = JS.object(); b.personId = child.id.clone(); b.familyId = k.id.clone(); b.fatherId = father.id.clone(); b.motherId = mother.id.clone(); b.day = r.world.day.clone(); n.births.push(b)
        if importantBirth(noble, r.kin.families[k.id.asInt.description], child, father, mother, r) {
            People.recordHistory(r, kind: "family", text: "\(child.identity.name.asString)出生", reason: "\(k.surname.asString)家族的\(father.identity.name.asString)与\(mother.identity.name.asString)之子女出生。", nations: [k.nationId.asString], province: nil)
        }
    }
    static func inheritTraits(_ child: JS, _ father: JS, _ mother: JS, _ random: Random) {
        for parent in [father, mother] {
            for name in (parent.traits.isNull ? [] : parent.traits.asArray.map(\.asString)) {
                guard let t = trait(name), t.isCongenital.isTruthy, f(0.2) > random.value() else { continue }
                if child.traits.isNull { child.traits = .array() }
                let traits = child.traits.asArray.map(\.asString)
                if traits.contains(name) { continue }
                if traits.contains(where: { incompatible(t, $0) || (trait($0).map { incompatible($0, name) } ?? false) }) { continue }
                child.traits.push(JS(name))
            }
        }
    }
    static func importantBirth(_ fam: JS, _ k: JS, _ child: JS, _ father: JS, _ mother: JS, _ r: JS) -> Bool {
        if fam.isNull { return false }
        if fam.ruling.asBool || [k.headId.asInt, k.heirId.asInt].contains(where: { $0 == father.id.asInt || $0 == mother.id.asInt }) { return true }
        if fam.influence.asNumber > 500 && (father.childrenIds.length == 1 || mother.childrenIds.length == 1) { return true }
        if child.gender.asInt != 0 { return false }
        let otherSon = father.childrenIds.asArray.contains { $0.asInt != child.id.asInt && (People.person(r, $0.asInt).map { $0.isAlive.asBool && $0.gender.asInt == 0 } ?? false) }
        return !otherSon && fam.influence.asNumber > 200
    }

    // MARK: Marriages (civilization47-nobility-marriage)
    static func unmarried(_ r: JS, _ p: JS) -> Bool { p.spouseId.asInt == 0 || !alive(r, p.spouseId.asInt) }
    static func closeRelative(_ a: JS, _ b: JS) -> Bool {
        let ai = a.id.asInt, bi = b.id.asInt
        return a.childrenIds.asArray.contains { $0.asInt == bi } || b.childrenIds.asArray.contains { $0.asInt == ai } || a.fatherId.asInt == bi || a.motherId.asInt == bi || b.fatherId.asInt == ai || b.motherId.asInt == ai
            || a.fatherId.asInt > 0 && a.fatherId.asInt == b.fatherId.asInt || a.motherId.asInt > 0 && a.motherId.asInt == b.motherId.asInt
    }
    static func marriageScore(_ r: JS, _ n: JS, _ a: JS, _ b: JS) -> Double {
        let fa = r.kin.families[a.familyId.asInt.description], fb = r.kin.families[b.familyId.asInt.description]
        if fa.isNull || fb.isNull { return 0 }
        let influence = n.families[fb.id.asInt.description].influence.optionalNumber ?? 50
        var v = f(f(f(fa.stateId.asInt == fb.stateId.asInt ? 0.8 : 0.2) * 50) + f(f(influence / 10) + 0))
        if a.stateId.asInt != b.stateId.asInt { v = f(v + 20) }
        var c = f(f(f(1 - f(abs(f(charisma(a) - charisma(b))) / 100)) * f(0.3)) + f(0.5))
        c = f(c + f(a.cultureName.optionalString == b.cultureName.optionalString ? 0.4 : 0.1))
        if a.religionId.optionalString == b.religionId.optionalString { c = f(c + f(0.3)) }
        c = 0 > c ? 0 : c > 1 ? 1 : c
        return f(f(c * 50) + v)
    }
    static func isHead(_ k: JS, _ p: JS) -> Bool { !k.isNull && (k.headId.asInt == p.id.asInt || k.heirId.asInt == p.id.asInt) }
    static func needsMatrilineal(_ r: JS, _ p: JS, _ k: JS) -> Bool {
        if p.gender.asInt != 1 || k.isNull { return false }
        if isHead(k, p) { return true }
        if !k.allowFemaleInheritance.asBool { return false }
        guard let patriarch = People.person(r, k.headId.asInt) else { return false }
        return !patriarch.childrenIds.asArray.contains { alive(r, $0.asInt) && People.person(r, $0.asInt)!.gender.asInt == 0 }
    }
    static func canMarryInto(_ r: JS, _ p: JS, _ k: JS) -> Bool {
        if p.gender.asInt != 0 { return false }
        if k.isNull { return true }
        if isHead(k, p) { return false }
        guard let patriarch = People.person(r, k.headId.asInt) else { return true }
        var eldest: JS?
        for id in patriarch.childrenIds.asArray.map(\.asInt) {
            guard let c = People.person(r, id), c.isAlive.asBool, c.gender.asInt == 0 else { continue }
            if eldest == nil || c.age.asInt > eldest!.age.asInt { eldest = c }
        }
        return eldest == nil || eldest!.id.asInt != p.id.asInt
    }
    static func processMarriages(_ r: JS, _ n: JS, _ id: String) {
        let k = r.kin.families[id]
        let adults = k.memberIds.asArray.compactMap { People.person(r, $0.asInt) }.filter { $0.isAlive.asBool && $0.familyId.asInt == k.id.asInt && $0.age.asInt >= 18 && $0.age.asInt <= 45 && unmarried(r, $0) }
        for p in adults {
            if !unmarried(r, p) || !p.isAlive.asBool { continue }
            if p.spouseId.asInt != 0 && !alive(r, p.spouseId.asInt) { p.spouseId = JS(0) }
            let own = r.kin.families[p.familyId.asInt.description], head = !own.isNull && own.headId.asInt == p.id.asInt
            let candidates = r.kin.persons.objectValues.filter { c in
                c.isAlive.asBool && c.gender.asInt != p.gender.asInt && c.age.asInt >= 18 && c.age.asInt <= 45 && unmarried(r, c) && c.id.asInt != p.id.asInt && !closeRelative(p, c)
                    && (!head || r.kin.families[c.familyId.asInt.description].headId.optionalNumber.map { Int($0) } != c.id.asInt)
            }.enumerated().map { ($0.offset, $0.element, marriageScore(r, n, p, $0.element)) }.sorted { $0.2 != $1.2 ? $0.2 > $1.2 : $0.0 < $1.0 }.prefix(10)
            for (_, c, _) in candidates { if executeMarriage(r, n, p, c) { break } }
        }
    }
    static func executeMarriage(_ r: JS, _ n: JS, _ a: JS, _ b: JS) -> Bool {
        let fa = r.kin.families[a.familyId.asInt.description], fb = r.kin.families[b.familyId.asInt.description]
        var matrilineal = false
        if needsMatrilineal(r, a, fa) { matrilineal = b.gender.asInt == 0 && canMarryInto(r, b, fb) }
        else if needsMatrilineal(r, b, fb) { matrilineal = a.gender.asInt == 0 && canMarryInto(r, a, fa) }
        let mover = matrilineal ? (a.gender.asInt == 0 ? a : b) : (a.gender.asInt == 1 ? a : b), stay = mover === a ? b : a
        let from = r.kin.families[mover.familyId.asInt.description], to = r.kin.families[stay.familyId.asInt.description]
        let moves = !from.isNull && !to.isNull && from.id.asInt != to.id.asInt
        if moves && (from.headId.asInt == mover.id.asInt || r.people.persons[mover.id.asInt.description].alive.isTruthy) { return false }
        if a.spouseId.asInt != 0 && alive(r, a.spouseId.asInt) || b.spouseId.asInt != 0 && alive(r, b.spouseId.asInt) { return false }
        a.spouseId = b.id.clone(); b.spouseId = a.id.clone(); a.marriageType = JS(matrilineal ? 1 : 0); b.marriageType = JS(matrilineal ? 1 : 0)
        let birthKey = mover.originalFamilyId.asInt != 0 ? mover.originalFamilyId.asInt : mover.familyId.asInt, birthFamily = r.kin.families[birthKey.description]
        if moves {
            from.memberIds.asArray = from.memberIds.asArray.filter { $0.asInt != mover.id.asInt }
            from.collateralMemberIds.asArray = from.collateralMemberIds.asArray.filter { $0.asInt != mover.id.asInt }
            if from.heirId.asInt == mover.id.asInt { from.heirId = JS(0) }
            if mover.originalFamilyId.asInt == 0 { mover.originalFamilyId = from.id.clone() }
            mover.familyId = to.id.clone(); mover.stateId = to.stateId.clone(); to.memberIds.push(mover.id.clone())
            let culture = mover.cultureName.asString
            if cultures[culture].houses.asArray.contains(where: { $0.asString == to.surname.asString }) {
                mover.lastName = to.surname.clone(); mover.identity = personName(culture, given: mover.firstName.asString, house: to.surname.asString, gender: mover.gender.asInt)
            }
        }
        let m = JS.object()
        m.aId = a.id.clone(); m.bId = b.id.clone(); m.moverId = moves ? mover.id.clone() : JS(0); m.fromFamilyId = moves ? from.id.clone() : JS(0); m.toFamilyId = moves ? to.id.clone() : JS(0)
        m.matrilineal = JS(matrilineal); m.day = r.world.day.clone(); n.marriages.push(m)
        bump(r.kin)
        let nfa = fa.isNull ? JS.null : n.families[fa.id.asInt.description], nfb = fb.isNull ? JS.null : n.families[fb.id.asInt.description]
        let notable = nfa.ruling.isTruthy || nfb.ruling.isTruthy || isHead(fa, a) || isHead(fb, b) || (nfa.influence.optionalNumber ?? 0) > 300 || (nfb.influence.optionalNumber ?? 0) > 300
            || fa.stateId.optionalNumber != fb.stateId.optionalNumber || matrilineal
        if notable && !fa.isNull && !fb.isNull {
            let sa = mover === a ? (birthFamily.surname.optionalString ?? fa.surname.asString) : fa.surname.asString
            let sb = mover === b ? (birthFamily.surname.optionalString ?? fb.surname.asString) : fb.surname.asString
            var nations = [fa.nationId.asString]; if fb.nationId.asString != nations[0] { nations.append(fb.nationId.asString) }
            People.recordHistory(r, kind: "family", text: "\(sa)家族的\(a.identity.name.asString)与\(sb)家族的\(b.identity.name.asString)结婚（\(matrilineal ? "从妻居" : "从夫居")）", reason: "原作家族婚姻：按家族声望、同国、魅力、文化与宗教择偶。", nations: nations, province: nil)
        }
        return true
    }

    // MARK: Extinction (civilization47-nobility-succession checkFamilyExtinction47)
    static func checkExtinction(_ r: JS, _ n: JS, _ id: String) -> Bool {
        let k = r.kin.families[id], fam = n.families[id]
        if k.isNull || fam.isNull || !living(r, id).isEmpty { return false }
        var last: JS?
        var seen = Set<Int>()
        for pid in (k.memberIds.asArray + k.collateralMemberIds.asArray).map(\.asInt) where seen.insert(pid).inserted {
            guard let p = People.person(r, pid), !p.isAlive.asBool else { continue }
            if last == nil || p.deathTime.asNumber > last!.deathTime.asNumber { last = p }
        }
        People.recordHistory(r, kind: "family", text: "\(k.surname.asString)家族灭绝，最后成员\(last?.identity.name.asString ?? "未知")去世", reason: "家族已无在世成员，领地失去家族控制。", nations: [fam.nationId.asString], province: nil)
        retire(n, id, fam)
        return true
    }
    static func retire(_ n: JS, _ id: String, _ fam: JS) {
        n.families.delete(id); n.extinct.push(JS(Double(id)!))
        for c in n.warContributions.objectValues { c.delete(id) }
        n.monthFamilies.asArray = n.monthFamilies.asArray.filter { $0.asString != id }
        if !fam.isNull && n.rulingFamilies[fam.nationId.asString].optionalNumber == Double(id)! { n.rulingFamilies[fam.nationId.asString] = JS(0) }
    }

    // MARK: Fate (civilization47-nobility-fate)
    static func familiesOf(_ n: JS, _ nation: String) -> [String] { n.families.objectKeys.filter { n.families[$0].nationId.asString == nation } }
    static func leaderOf(_ r: JS, _ nation: String) -> JS? { let id = r.people.nations[nation].leaderId; return id.isNull ? nil : People.person(r, id.asInt) }
    struct Weights { var fealty = 30.0, restore = 20.0, dispossessed = 40.0, purge = Native.fr(17.2), exile = 25.0 }
    static func weights(_ r: JS, _ id: String, _ conqueror: String, _ war: Int?) -> Weights {
        let n = r.nobility, fam = n.families[id], k = r.kin.families[id]
        var w = Weights()
        if familiesOf(n, conqueror).count <= 3 { w.fealty += 40; w.restore += 80; w.dispossessed -= 20; w.purge = f(w.purge - 8); w.exile -= 15 }
        let leader = leaderOf(r, conqueror), patriarch = People.person(r, k.headId.asInt)
        if let leader, let patriarch {
            if leader.cultureName.optionalString != patriarch.cultureName.optionalString { w.dispossessed += 20; w.purge = f(w.purge + 10) } else { w.fealty += 40; w.restore += 20; w.purge = f(w.purge - 20) }
            let traits = leader.traits.isNull ? [] : leader.traits.asArray.map(\.asString)
            if traits.contains("Merciful") { w.restore += 50; w.fealty += 30; w.purge = f(w.purge - 30); w.dispossessed -= 15 }
            if traits.contains("Cruel") { w.purge = f(w.purge + 350); w.dispossessed += 5; w.restore -= 40; w.fealty -= 30 }
        }
        if let leader, let rel = n.relations[id][leader.familyId.asInt.description].optionalNumber {
            if rel > 50 { w.fealty += 30; w.restore += 20 } else if -50 > rel { w.purge = f(w.purge + 30); w.dispossessed += 10 }
        }
        let influence = fam.influence.asNumber
        if influence > 500 { w.fealty += 15; w.restore += 10; w.purge = f(w.purge + 20) } else if 200 > influence { w.dispossessed += 20 }
        switch war {
        case 0: w.fealty += 10; w.restore += 10; w.purge = f(w.purge + 1)
        case 2, 4: w.purge = f(w.purge + 49); w.dispossessed += 20
        case 5, 8: w.purge = f(w.purge + 66); w.fealty -= 25
        case 9: w.purge = f(w.purge + 59); w.fealty -= 20
        case 10: w.purge = f(w.purge + 42); w.dispossessed += 15
        case 11: w.purge = f(w.purge + 52); w.fealty -= 15
        default: break
        }
        if !fam.ruling.asBool {
            if let leader, let patriarch, leader.cultureName.optionalString != patriarch.cultureName.optionalString { w.exile += 20 }
            if influence > 500 { w.exile += 15 }
            if let war, [2, 4, 5, 8, 9, 10, 11].contains(war) { w.exile += 25 }
        } else {
            let home = fam.nationId.asString
            if stateAlive(r, home) && home != conqueror { w = Weights(fealty: 0, restore: 0, dispossessed: 0, purge: 0, exile: 100) }
            else { w = Weights(fealty: 50, restore: 0, dispossessed: 30, purge: 20, exile: 0) }
        }
        let claims = fam.historicalClaims.objectValues.reduce(0.0) { f($0 + $1.asNumber) }
        if claims > 20 { w.restore = f(f(claims * f(0.5)) + w.restore) }
        w.fealty = max(0, w.fealty); w.restore = max(0, w.restore); w.dispossessed = max(0, w.dispossessed); w.purge = max(0, w.purge); w.exile = max(0, w.exile)
        return w
    }
    static func decideFate(_ r: JS, _ id: String, _ conqueror: String, _ war: Int?) -> String {
        let n = r.nobility, fam = n.families[id]
        if fam.ruling.asBool && stateAlive(r, fam.nationId.asString) && fam.nationId.asString != conqueror { return "exile" }
        let w = weights(r, id, conqueror, war), total = f(f(f(f(w.restore + w.fealty) + w.dispossessed) + w.purge) + w.exile)
        let roll = Random(n: n).floatRange(0, total)
        var acc = f(w.fealty + 0); if acc > roll { return "fealty" }
        acc = f(acc + w.restore); if acc > roll { return "restore" }
        acc = f(acc + w.dispossessed); if acc > roll { return "dispossessed" }
        acc = f(acc + w.exile); if acc > roll { return "exile" }
        return "purge"
    }
    static func hasCourt(_ r: JS, _ id: String) -> Bool { let k = r.kin.families[id]; return (k.memberIds.asArray + k.collateralMemberIds.asArray).contains { r.people.persons.has($0.asInt.description) } }
    @discardableResult
    static func moveFamily(_ r: JS, _ id: String, _ nation: String) -> Bool {
        let n = r.nobility, fam = n.families[id], k = r.kin.families[id]
        if fam.nationId.asString == nation || hasCourt(r, id) { return false }
        let stateId = r.people.nations[nation].id.clone()
        fam.nationId = JS(nation); fam.ruling = JS(false); k.nationId = JS(nation); k.stateId = stateId.clone()
        for pid in (k.memberIds.asArray + k.collateralMemberIds.asArray).map(\.asInt) {
            guard let p = People.person(r, pid) else { continue }
            p.stateId = stateId.clone()
            for role in p.roles.asArray where role.nativeKind.optionalString == "spouse" { role.stateId = stateId.clone() }
        }
        n.monthFamilies.asArray = n.monthFamilies.asArray.filter { $0.asString != id }; bump(r.kin)
        return true
    }
    static func event(_ r: JS, _ text: String, _ reason: String, _ nations: [String]) {
        var unique = [String](); for v in nations where !unique.contains(v) { unique.append(v) }
        People.recordHistory(r, kind: "family", text: text, reason: reason, nations: unique.filter { r.people.nations.has($0) }, province: nil)
    }
    static func familyName(_ r: JS, _ id: String) -> String { "\(r.kin.families[id].surname.asString)家族" }
    static func stateName(_ r: JS, _ id: String) -> String { r.world.nations.asArray.first { $0.id.asString == id }?.name.asString ?? id }
    static func executeFate(_ r: JS, _ id: String, _ fate: String, _ conqueror: String) {
        let n = r.nobility, fam = n.families[id]
        if fam.isNull { return }
        let from = fam.nationId.asString, wasRuling = fam.ruling.asBool
        switch fate {
        case "fealty":
            fam.ruling = JS(false); fam.influence = JS(f(fam.influence.asNumber * f(wasRuling ? 0.7 : 0.5))); moveFamily(r, id, conqueror)
            event(r, "\(familyName(r, id))放弃抵抗向\(stateName(r, conqueror))宣誓效忠，影响力下降\(wasRuling ? 30 : 50)%", "失去全部领地后归附攻占方，影响力下降。", [from, conqueror])
        case "restore": partialRestore(r, id, conqueror, from)
        case "dispossessed": dispossessed(r, id, conqueror, from)
        case "purge":
            let k = r.kin.families[id]
            var killed = 0, seen = Set<Int>()
            for pid in (k.memberIds.asArray + k.collateralMemberIds.asArray).map(\.asInt) where seen.insert(pid).inserted {
                if let p = People.person(r, pid), p.isAlive.asBool { People.die(r, p); killed += 1 }
            }
            event(r, "\(familyName(r, id))被\(stateName(r, conqueror))彻底清洗，\(killed)名成员全部被处决", "\(stateName(r, conqueror))处死了家族全部在世成员，家族就此消亡。", [from, conqueror])
            retire(n, id, n.families[id])
        default: exile(r, id, conqueror, from)
        }
        if wasRuling && !n.families.objectValues.contains(where: { $0.nationId.asString == from && $0.ruling.asBool }) { n.rulingFamilies[from] = JS(0) }
        let after = n.families[id]
        if !after.isNull { after.totalEnemyDestroyed = JS(f(after.totalEnemyDestroyed.asNumber * f(1.0 / 3.0))) }
    }
    static func dispossessed(_ r: JS, _ id: String, _ conqueror: String, _ from: String) {
        let fam = r.nobility.families[id]
        fam.controlledProvinces = .array(); fam.influence = JS(f(fam.influence.asNumber * f(0.2))); fam.wealth = JS(f(fam.wealth.asNumber * f(0.5)).rounded(.towardZero)); fam.ruling = JS(false)
        if !stateAlive(r, from) { moveFamily(r, id, conqueror) }
        event(r, "\(familyName(r, id))被\(stateName(r, conqueror))剥夺全部封地，沦为无地贵族", "失去领地后影响力与财富大减。", [from, conqueror])
    }
    static func canReclaim(_ r: JS, _ province: String, _ id: String, _ nation: String) -> Bool {
        let n = r.nobility
        guard let holder = holder(n, province) else { return true }
        let h = n.families[holder]
        if h.controlledProvinces.length <= 1 { return false }
        let (m1, m2) = h.ruling.asBool ? (2.0, 3.0) : (1.5, 2.0), me = n.families[id]
        let landed = familiesOf(n, nation).filter { n.families[$0].controlledProvinces.length > 0 }
        let avg = landed.isEmpty ? 1 : f(Double(landed.reduce(0) { $0 + n.families[$1].controlledProvinces.length }) / Double(landed.count))
        return me.influence.asNumber > f(h.influence.asNumber * m1) || (me.historicalClaims[province].optionalNumber ?? 0) > f((h.historicalClaims[province].optionalNumber ?? 0) * m2) || Double(h.controlledProvinces.length) > f(avg * m2)
    }
    static func grant(_ r: JS, _ province: String, _ id: String) {
        let n = r.nobility
        if let holder = holder(n, province) {
            let h = n.families[holder]
            h.controlledProvinces.asArray = h.controlledProvinces.asArray.filter { $0.asString != province }
            h.influence = JS(min(1000, f(h.influence.asNumber + (h.ruling.asBool ? 100 : 50)))); h.wealth = JS(h.wealth.asNumber + (h.ruling.asBool ? 200 : 100))
        }
        let fam = n.families[id]
        if !fam.controlledProvinces.asArray.contains(where: { $0.asString == province }) { fam.controlledProvinces.push(JS(province)) }
    }
    static func partialRestore(_ r: JS, _ id: String, _ conqueror: String, _ from: String) {
        let n = r.nobility, fam = n.families[id]
        var lands = fam.historicalClaims.objectEntries.filter { p, claim in
            r.world.provinces.asArray.first { $0.id.asString == p }?.controller.optionalString == conqueror && claim.asNumber >= 5 && canReclaim(r, p, id, conqueror)
        }.enumerated().map { (i: $0.offset, p: $0.element.0, claim: $0.element.1.asNumber) }
        if lands.isEmpty { dispossessed(r, id, conqueror, from); return }
        lands.sort { $0.claim != $1.claim ? $0.claim > $1.claim : $0.i < $1.i }
        var ratio = fam.influence.asNumber > 500 ? f(0.8) : f(0.5)
        if lands.contains(where: { $0.p == fam.originalHomeProvinceId.optionalString }) { ratio = f(ratio + f(0.2)) }
        var count = Int((f(Double(lands.count) * ratio) + 0.5).rounded(.down)); count = min(lands.count, max(2, count))
        fam.ruling = JS(false); fam.influence = JS(f(fam.influence.asNumber * f(0.5)))
        if fam.nationId.asString != conqueror && !moveFamily(r, id, conqueror) { dispossessed(r, id, conqueror, from); return }
        for v in lands.prefix(count) { grant(r, v.p, id) }
        event(r, "\(familyName(r, id))在被\(stateName(r, conqueror))征服后获准恢复\(count)块历史领地（共\(lands.count)块）", "凭历史宣称部分恢复领地并归附攻占方。", [from, conqueror])
    }
    static func exile(_ r: JS, _ id: String, _ conqueror: String, _ from: String) {
        let n = r.nobility, fam = n.families[id], random = Random(n: n)
        fam.controlledProvinces = .array()
        var target: String?
        if fam.ruling.asBool && stateAlive(r, from) && from != conqueror { target = from }
        else {
            var valid = r.world.nations.asArray.map(\.id.asString).filter { $0 != conqueror && stateAlive(r, $0) }
            if stateAlive(r, from) && from != conqueror {
                let leader = leaderOf(r, from)
                if let leader, leader.familyId.asInt > 0, let rel = n.relations[id][leader.familyId.asInt.description].optionalNumber {
                    if rel > 0 { target = from } else if -30 > rel { valid = valid.filter { $0 != from } }
                }
            }
            if target == nil && !valid.isEmpty {
                if let patriarch = People.person(r, r.kin.families[id].headId.asInt) {
                    let liked = valid.filter { v in guard let l = leaderOf(r, v), l.familyId.asInt > 0 else { return false }; return (n.relations[id][l.familyId.asInt.description].optionalNumber ?? -.infinity) > 20 }
                    let same = valid.filter { leaderOf(r, $0)?.cultureName.optionalString == patriarch.cultureName.optionalString }
                    let pool = !liked.isEmpty ? liked : !same.isEmpty ? same : valid
                    target = pool[random.intRange(0, pool.count)]
                } else { target = valid[random.intRange(0, valid.count)] }
            }
        }
        guard let target else { dispossessed(r, id, conqueror, from); return }
        fam.influence = JS(f(fam.influence.asNumber * f(0.3))); fam.wealth = JS(f(fam.wealth.asNumber * f(0.5)).rounded(.towardZero)); fam.ruling = JS(false)
        if target != fam.nationId.asString { moveFamily(r, id, target) }
        let victor = leaderOf(r, conqueror), host = leaderOf(r, target)
        if n.relations[id].isNull { n.relations[id] = .object() }
        let rel = n.relations[id]
        if let victor, victor.familyId.asInt > 0, n.families.has(victor.familyId.asInt.description) { rel[victor.familyId.asInt.description] = JS(-15) }
        if let host, host.familyId.asInt > 0, n.families.has(host.familyId.asInt.description), host.familyId.asInt.description != id { rel[host.familyId.asInt.description] = JS(15) }
        event(r, "\(familyName(r, id))被\(stateName(r, conqueror))击败后流亡至\(stateName(r, target))", "失去领地后离开，投奔\(stateName(r, target))。", [from, conqueror, target])
    }
    static func familyLostProvince(_ r: JS, _ id: String, _ province: String, _ conqueror: String, _ war: Int?) {
        let fam = r.nobility.families[id]
        if fam.isNull { return }
        fam.controlledProvinces.asArray = fam.controlledProvinces.asArray.filter { $0.asString != province }
        if fam.controlledProvinces.length == 0 && conqueror != fam.nationId.asString { executeFate(r, id, decideFate(r, id, conqueror, war), conqueror) }
    }
}
