import Foundation

/// New-world creation, first phase (civilization47-world createCivilizationWorld47 up to attachFamilies47):
/// the world's provinces, cities and nations from the partition and opening layout; the statecraft
/// ledger with province population and grain by area and terrain (compat/v0_4 statecraft
/// initializeManagement); the founding rulers and chronicle (initialCivilizationChronicle47); the
/// founding people and life records (life22-people initialPeopleAndLife22). Families, origins,
/// nobility, government, forces and the rule actions are later phases, still created by the web.
public enum Creation {
    static let f = Native.fr

    static func object(_ pairs: [(String, JS)]) -> JS { let o = JS.object(); for (k, v) in pairs { o[k] = v }; return o }
    static func point(_ x: Double, _ y: Double, _ scale: Double) -> JS { object([("x", JS(x * scale)), ("y", JS(y * scale))]) }
    static func less(_ a: String, _ b: String) -> Bool { Array(a.utf16).lexicographicallyPrecedes(Array(b.utf16)) }

    /// statecraft area and capacity (shoelace on the scaled polygon, then the terrain factor).
    static func capacity(_ polygon: [(Double, Double)], terrain: String) -> Double {
        var sum = 0.0
        for (i, p) in polygon.enumerated() { let n = polygon[(i + 1) % polygon.count]; sum = sum + p.0 * n.1 - n.0 * p.1 }
        let area = abs(sum) / 2
        return max(100, (area * (terrain == "plain" ? 2.5 : terrain == "forest" ? 2 : 1.3)).rounded(.down))
    }

    /// The base run `{id, scale, world, clock, civilization, chronicle, people, life}`.
    /// `worldId` is the terrain document's world id (the naming and people seed); `runId` the new run's id (`fms-` + UUID).
    public static func base(regions: [Regions.Region], seeds: [Int], owners: [Int], width: Double, height: Double, worldId: String, runId: String,
                            relations: String, mode: String, enabled: [String], cultures: [Opening.Culture]) -> JS? {
        let count = seeds.count
        guard count >= 2, count <= 24, count <= regions.count, ["peace", "war"].contains(relations),
              let names = Opening.civilization(seed: worldId, count: count, owners: owners, mode: mode, enabled: enabled, cultures: cultures) else { return nil }
        let scale = 1000 / max(width, height)

        // civilization (initialCivilization47; rulers are added with the chronicle).
        let civ = object([("version", JS(1)), ("catalog", JS("real-cultures-zh-v2")), ("revision", JS(0)), ("mode", JS(mode)), ("peopleMode", JS("culture-generated")),
                          ("enabled", .array(enabled.map { JS($0) })), ("nations", .object()), ("cities", .object()), ("rulers", .object())])
        func cultural(_ value: String, _ key: String) -> JS { object([("value", JS(value)), ("mode", JS(mode)), ("sourceKey", JS(key)), ("custom", .null)]) }
        for (i, n) in names.nations.enumerated() {
            civ.nations["n-\(i)"] = object([("cultureId", JS(n.cultureId)), ("religionId", JS(n.religionId)), ("polity", JS(n.polity)), ("name", cultural(n.name, n.sourceKey)),
                                            ("origin", JS("new-world")), ("parentId", .null)])
        }
        for (i, c) in names.cities.enumerated() { civ.cities["c-\(i)"] = object([("cultureId", JS(c.culture)), ("name", cultural(c.name, c.sourceKey))]) }

        // world (createCivilizationWorld47 raw world).
        var capacities = [Double]()
        let provinces = JS.array(regions.enumerated().map { i, r in
            let terrain = r.height > 65 ? "mountain" : r.height > 45 ? "forest" : "plain"
            capacities.append(capacity(r.ring.map { ($0.x * scale, $0.y * scale) }, terrain: terrain))
            return object([("id", JS("p-\(i)")), ("name", JS(names.cities[i].name)), ("polygon", .array(r.ring.map { point($0.x, $0.y, scale) })),
                           ("center", point(r.center.0, r.center.1, scale)), ("label", point(r.center.0, r.center.1, scale)), ("terrain", JS(terrain)),
                           ("legalOwner", JS("n-\(owners[i])")), ("controller", JS("n-\(owners[i])")), ("neighbors", .array(r.neighbors.map { JS("p-\($0)") })), ("supply", JS(80))])
        })
        let cities = JS.array(regions.enumerated().map { i, r in
            object([("id", JS("c-\(i)")), ("name", JS(names.cities[i].name)), ("provinceId", JS("p-\(i)")), ("position", point(r.center.0, r.center.1, scale)),
                    ("label", point(r.center.0, r.center.1, scale)), ("fort", JS(seeds.contains(i) ? 2 : 0))])
        })
        let nations = JS.array(seeds.enumerated().map { i, s in
            object([("id", JS("n-\(i)")), ("name", JS(names.nations[i].full)), ("color", JS(PreviewWorld.palette[i])), ("capitalId", JS("c-\(s)")),
                    ("regimeId", JS("regime-\(i)")), ("dynastyId", JS("dynasty-\(i)"))])
        })
        let custom = object([("id", JS(runId)), ("name", JS("我的诸国世界")), ("seed", JS(worldId)), ("rivers", .array())])
        let world = object([("schemaVersion", JS(2)), ("rulesVersion", JS("0.2.0")), ("scenario", JS("custom-world")), ("custom", custom), ("mode", JS("sandbox")), ("day", JS(0)),
                            ("nations", nations), ("provinces", provinces), ("cities", cities), ("armies", .array()), ("events", .array()), ("nextEventId", JS(1))])

        // initializeManagement: population and grain by area and terrain, balanced policies, pairwise relations.
        let ids = nations.asArray.map(\.id.asString).sorted(by: less)
        var pairs = [JS]()
        for (k, a) in ids.enumerated() { for b in ids[(k + 1)...] { pairs.append(object([("a", JS(a)), ("b", JS(b)), ("status", JS(relations)), ("sinceDay", JS(0)), ("truceUntilDay", JS(0))])) } }
        world.statecraft = object([
            ("version", JS(1)),
            ("provinces", .array(provinces.asArray.enumerated().map { i, p in
                let population = max(100, (capacities[i] * 0.7).rounded(.down))
                return object([("provinceId", p.id.clone()), ("population", JS(population)), ("grain", JS(population * 20))])
            })),
            ("nations", .array(nations.asArray.map { object([("nationId", $0.id.clone()), ("priority", JS("balanced")), ("lastLedger", .null), ("lastDecision", .null)]) })),
            ("relations", .array(pairs)),
        ])
        world.events.push(object([("id", JS(1)), ("day", JS(0)), ("kind", JS("system")), ("text", JS("国家治理规则已初始化")),
                                  ("reason", JS("这是独立沙盒推演，初始关系为\(relations == "peace" ? "和平" : "战争")；人口与粮食是按面积和地形生成的模拟参数，不代表正式设定。地方粮库不跨海瞬移，国家数据按实控汇总。"))]))
        world.nextEventId = JS(2)

        // initialCivilizationChronicle47: the first ruler of each state (createRulerIdentity47).
        let chronicle = object([("version", JS(1)), ("originDay", JS(0)), ("nextEntryId", JS(1)), ("nextNationId", JS(1)), ("leaders", .object()), ("entries", .array()),
                                ("unrest", .object()), ("ended", .object())])
        for n in nations.asArray {
            let nid = n.id.asString, id = "ruler-\(nid)-1", identity = civ.nations[nid], cultureId = identity.cultureId.asString
            let gender = Int(Opening.hash("\(worldId)/\(id)") % 2), pool = Nobility.cultures[cultureId]
            let given = (gender == 0 ? pool.givenMale : pool.givenFemale), houses = pool.houses
            let person = Nobility.personName(cultureId, given: given[Int(Opening.hash("\(worldId)/\(id)/given") % UInt32(given.length))].asString,
                                             house: houses[Int(Opening.hash("\(worldId)/\(id)/house") % UInt32(houses.length))].asString, gender: gender)
            let v = Founding.rulerFrom(person, identity)
            civ.rulers[id] = v
            let ruler = object([("id", JS(id)), ("name", v.name.clone()), ("family", v.house.clone()), ("order", JS(1)), ("regnalName", v.given.clone()), ("regnalOrdinal", JS(1)),
                                ("ascendedDay", JS(0)), ("endedDay", .null), ("termEndDay", JS((12 + Int(Opening.hash(id) % 14)) * 365))])
            chronicle.leaders[nid] = .array([ruler])
            let entryId = chronicle.nextEntryId.asInt; chronicle.nextEntryId = JS(entryId + 1)
            let who = object([("id", JS(id)), ("name", v.name.clone()), ("order", JS(1)), ("regnalName", v.given.clone()), ("regnalOrdinal", JS(1))])
            chronicle.entries.push(object([("id", JS(entryId)), ("day", JS(0)), ("tick", JS(0)), ("kind", JS("accession")),
                                           ("text", JS("\(n.name.asString)：\(v.name.asString)就任\(v.titleAtAccession.asString)")),
                                           ("reason", JS("创建世界时依已选文化、宗教和政体建立首任领袖；人物按文化生成，国名和城名模式不改变亲属规则。")),
                                           ("nationIds", .array([JS(nid)])), ("place", .null), ("people", .array([who])), ("sourceEventId", .null)]))
        }
        for p in provinces.asArray {
            chronicle.unrest[p.id.asString] = object([("pressure", JS(0)), ("controller", p.controller.clone()), ("sinceDay", JS(0)), ("cooldownUntil", JS(0))])
        }

        // initialPeopleAndLife22: a generated founding ruler per state.
        let date = { object([("year", JS(1)), ("month", JS(1)), ("day", JS(1))]) }
        let secondsPerDay = f(0.1), gameTime = 0.0
        let people = object([("version", JS(1)), ("origin", JS("native-skills-web-ruler-observation-v1")), ("nextPersonId", JS(1)), ("nextStateId", JS(1)), ("revision", JS(0)),
                             ("persons", .object()), ("nations", .object())])
        let life = object([("version", JS(1)), ("schedule", JS("iso-age-web-ticks-v1")), ("revision", JS(0)), ("originDay", JS(0)), ("startDate", date()),
                           ("secondsPerDay", JS(secondsPerDay)), ("gameTime", JS(gameTime)), ("lastTick", JS(0)), ("currentDate", date()), ("lastAgeMonth", JS(12)), ("persons", .object())])
        for n in nations.asArray {
            let nid = n.id.asString, stateId = people.nextStateId.asInt; people.nextStateId = JS(stateId + 1)
            let book = object([("id", JS(stateId)), ("leaderId", .null), ("offices", object([("assignments", .array()), ("normalized", JS(true)), ("revision", JS(0))]))])
            people.nations[nid] = book
            let ruler = chronicle.leaders[nid][0], random = Founding.SeededRandom("\(worldId)/native-person/\(ruler.id.asString)")
            func draw() -> Double { min(100, max(0, random.floatRange(20, 80))) }
            let skills = object([("charisma", JS(draw())), ("military", JS(draw())), ("diplomatic", JS(draw())), ("administrative", JS(draw()))])
            let traits = Founding.traitsDrawn(random.intRange(1, 4), random)
            let id = people.nextPersonId.asInt; people.nextPersonId = JS(id + 1)
            let age = random.intRange(35, 55)
            let birthTime = f(f(f(gameTime) - f(f(f(Double(age)) * f(365.25)) * f(secondsPerDay))))
            people.persons[String(id)] = object([("id", JS(id)), ("stateId", JS(stateId)), ("nationId", JS(nid)), ("rulerId", ruler.id.clone()), ("name", ruler.name.clone()),
                                                 ("family", ruler.family.clone()), ("alive", JS(true)), ("recordedDay", JS(0)), ("base", skills), ("traits", .array(traits.map { JS($0) }))])
            book.leaderId = JS(id); people.revision = JS(people.revision.asInt + 1)
            life.persons[String(id)] = object([("source", JS("native-founding")), ("birthTime", JS(birthTime)), ("age", JS(age)), ("initialAge", JS(age)), ("updatedMonth", JS(12))])
            life.revision = JS(life.revision.asInt + 1)
        }
        return object([("id", JS(runId)), ("scale", JS(scale)), ("world", world), ("clock", object([("version", JS(1)), ("tick", JS(0))])),
                       ("civilization", civ), ("chronicle", chronicle), ("people", people), ("life", life)])
    }

    /// attachFamilies47: the kin ledger with each founder and its ruling family (spouse, children,
    /// collateral households as at a founding), the life records of the generated members and the
    /// sovereignty ledger (map culture of each province, reigns, restorations). Mutates `r`.
    public static func attachFamilies(_ r: JS) {
        let seed = r.world.custom.seed.asString, life = r.life
        let lifecycle = object([("version", JS(1)), ("rule", JS("native-month-death-known-emergency-v1")), ("revision", JS(0)), ("lastMonth", JS(12)),
                                ("random", object([("state", JS(Double(People.nameSeed(seed + "/life47")))), ("draws", JS(0))])), ("stats", People.defaultStats()),
                                ("deaths", .array()), ("vacancies", .object())])
        let kin = object([("version", JS(1)), ("origin", JS("native-family-real-culture-v1")), ("revision", JS(0)), ("ageTime", JS(0)), ("lastAgeMonth", JS(12)),
                          ("persons", .object()), ("families", .object()), ("lifecycle", lifecycle)])
        let sovereignty = object([("version", JS(1)), ("revision", JS(0)), ("provinces", .object()), ("reigns", .object()), ("restorations", .object()), ("nativeRebels", .object())])
        for p in r.world.provinces.asArray {
            let city = r.world.cities.asArray.first { $0.provinceId.asString == p.id.asString }!
            sovereignty.provinces[p.id.asString] = object([("mapCultureId", r.civilization.cities[city.id.asString].cultureId.clone()), ("sourceCityId", city.id.clone()),
                                                           ("recordedDay", JS(0)), ("origin", JS("new-world"))])
        }
        r.kin = kin
        var registry = [JS](), nextId = r.people.nextPersonId.asInt
        for n in r.world.nations.asArray {
            let book = r.people.nations[n.id.asString], court = r.people.persons[String(book.leaderId.asInt)], identity = r.civilization.rulers[court.rulerId.asString]
            let birth = life.persons[String(court.id.asInt)], familyId = book.id.asInt
            let name = Nobility.personName(identity.cultureId.asString, given: identity.given.asString, house: identity.house.asString, gender: identity.gender.asInt)
            let p = Founding.person(r, id: court.id.asInt, first: name.given.asString, last: name.house.asString, gender: name.gender.asInt, culture: name.cultureId.asString,
                                    source: "founding", religionId: identity.religionId, identity: name, random: Founding.SeededRandom(""))
            p.age = birth.age.clone(); p.birthTime = birth.birthTime.clone(); p.familyId = JS(familyId); p.originalFamilyId = JS(familyId); p.stateId = court.stateId.clone()
            p.base = court.base.clone(); p.traits = court.traits.clone(); p.initialAge = birth.initialAge.clone()
            let role = object([("holderId", JS(0)), ("startTime", JS(0)), ("roleType", JS("NationalLeader")), ("title", .null), ("reignStartTime", JS(f(life.gameTime.asNumber))),
                               ("stateId", JS(0)), ("nativeKind", JS("leader"))])
            role.holderId = p.id.clone(); role.stateId = p.stateId.clone(); role.title = identity.titleAtAccession.clone()
            p.roles.push(role)
            registry.append(p); kin.persons[String(p.id.asInt)] = p
            kin.families[String(familyId)] = object([("id", JS(familyId)), ("surname", name.house.clone()), ("cultureName", name.cultureId.clone()), ("nationId", n.id.clone()),
                                                     ("stateId", court.stateId.clone()), ("headId", p.id.clone()), ("heirId", JS(0)), ("allowFemaleInheritance", JS(false)),
                                                     ("memberIds", .array([p.id.clone()])), ("collateralMemberIds", .array())])
            sovereignty.reigns[court.rulerId.asString] = court.id.clone(); sovereignty.restorations[n.id.asString] = JS(0)
        }
        for family in kin.families.objectValues {
            let leader = registry.first { $0.id.asInt == family.headId.asInt }!
            Founding.generateFamily(r, family, leader: leader, registry: &registry, nextId: &nextId)
        }
        for p in registry {
            p.identity = Nobility.personName(p.cultureName.asString, given: p.firstName.asString, house: p.lastName.asString, gender: p.gender.asInt)
            kin.persons[String(p.id.asInt)] = p
            if p.source.asString == "initial-family" {
                life.persons[String(p.id.asInt)] = object([("source", JS("native-family")), ("birthTime", p.birthTime.clone()), ("age", p.age.clone()), ("initialAge", .null), ("updatedMonth", JS(12))])
            }
        }
        r.people.nextPersonId = JS(nextId); r.people.revision = JS(r.people.revision.asInt + 1); kin.revision = JS(kin.revision.asInt + 1)
        r.sovereignty = sovereignty
    }

    /// civilization47-origins attachOrigins47: generated founding and reign ages of the opening states and
    /// their accession entries (a web opening rule, not a simulated history). Mutates `r`.
    public static func attachOrigins(_ r: JS) {
        let seed = r.world.custom.seed.asString, nations = JS.object()
        for n in r.world.nations.asArray where r.civilization.nations[n.id.asString].origin.asString == "new-world" {
            let ruler = r.chronicle.leaders[n.id.asString][0], personId = r.sovereignty.reigns[ruler.id.asString].asInt, person = r.kin.persons[String(personId)]
            let key = "\(seed)/opening-facts/\(n.id.asString)"
            let founded = 365 * (2 + Int(People.nameSeed(key + "/state") % 219)) + Int(People.nameSeed(key + "/anniversary") % 365)
            let available = min(founded, (person.initialAge.asInt - 18) * 365)
            let reign = 1 + Int(People.nameSeed(key + "/reign") % UInt32(available))
            nations[n.id.asString] = object([("foundedBeforeDays", JS(founded)), ("rulerId", ruler.id.clone()), ("personId", JS(personId)), ("reignBeforeDays", JS(reign))])
        }
        let start: DiplomacyCalendar.D = (r.life.startDate.year.asInt, r.life.startDate.month.asInt, r.life.startDate.day.asInt)
        func before(_ days: Int) -> DiplomacyCalendar.D { DiplomacyCalendar.fromDayNumber(DiplomacyCalendar.dayNumber(start) - days) }
        for n in r.world.nations.asArray {
            let o = nations[n.id.asString], rulerId = o.rulerId.asString
            let entry = r.chronicle.entries.asArray.first { $0.kind.asString == "accession" && $0.people.asArray.contains { $0.id.asString == rulerId } }!
            let years = DiplomacyCalendar.wholeYears(before(o.foundedBeforeDays.asInt), start), reign = DiplomacyCalendar.wholeYears(before(o.reignBeforeDays.asInt), start)
            entry.text = JS("\(n.name.asString)开篇：建国已\(years)年，\(r.civilization.rulers[rulerId].name.asString)已在位\(reign > 0 ? "\(reign)年" : "\(o.reignBeforeDays.asInt)日")")
            entry.reason = JS("这是生成世界时的既有背景，并非今日建国或登基。现任人物及亲属具有真实登记的身份、年龄和关系；开篇以前的历代君主与战争未经模拟，不补造事件。")
        }
        r.origins = object([("version", JS(1)), ("rule", JS("generated-opening-facts-v1")), ("nations", nations)])
    }

    // MARK: Original families (civilization47-nobility attachNobility47, native-economy/noble-families)
    static let polities = ["Kingdom", "Empire", "Federation", "Republic", "Tribal", "Theocracy"]
    static let floatMax = 3.4028234663852886e38
    final class View { let id: Int; var familyId = 0; let neighbors: Set<Int>; init(_ id: Int, _ n: Set<Int>) { self.id = id; neighbors = n } }
    final class Holding { let id: Int; let home: Int; var provinces: [Int]; init(_ id: Int, _ home: Int, _ p: [Int]) { self.id = id; self.home = home; provinces = p } }
    static func control(_ fam: Holding, _ p: View) { if !fam.provinces.contains(p.id) { fam.provinces.append(p.id) }; p.familyId = fam.id }
    static func roundInt(_ x: Double) -> Int { let low = x.rounded(.down), part = x - low; return Int(part < 0.5 ? low : part > 0.5 ? low + 1 : (low.truncatingRemainder(dividingBy: 2) == 0 ? low : low + 1)) }
    static func rulingRatio(_ p: String) -> Double { f([0.35, 0.4, 0.2, 0.15, 0.4, 0.35][polities.firstIndex(of: p)!]) }
    static func maxRatio(_ p: String) -> Double { f([0.4, 0.5, 0.25, 0.2, 0.45, 0.45][polities.firstIndex(of: p)!]) }
    static func familyCap(_ p: String) -> Int { [5, 6, 8, 6, 4, 4][polities.firstIndex(of: p)!] }
    /// Stable ascending order by key, ties by original index (the web sorts with an index tiebreak).
    static func ordered<T>(_ items: [T], _ key: (T) -> Double, descending: Bool = false) -> [T] {
        let keyed: [(index: Int, item: T, key: Double)] = items.enumerated().map { (index: $0.offset, item: $0.element, key: key($0.element)) }
        func before(_ a: (index: Int, item: T, key: Double), _ b: (index: Int, item: T, key: Double)) -> Bool {
            if a.key != b.key { return descending ? a.key > b.key : a.key < b.key }
            return a.index < b.index
        }
        return keyed.sorted(by: before).map { $0.item }
    }
    /// AllocateRulingFamilyTerritories / SelectRulingFamilyProvinces.
    static func allocateRuling(_ fam: Holding, _ views: [View], _ polity: String, _ distance: (Int, Int) -> Double) {
        var count = max(1, roundInt(f(Double(views.count) * rulingRatio(polity))))
        let cap = Int(f(Double(views.count) * maxRatio(polity)).rounded(.down)); if count >= cap { count = cap }
        guard let home = views.first(where: { $0.id == fam.home }) else { return }
        var out = [home]
        if count > 1 {
            let candidates = ordered(views.filter { $0.id != fam.home && $0.familyId == 0 }) { distance(home.id, $0.id) }
            let near = Array(candidates.filter { home.neighbors.contains($0.id) }.prefix(count - 1)); out += near
            let rest = count - out.count
            if rest > 0 { out += candidates.filter { c in !near.contains { $0 === c } }.prefix(rest) }
        }
        for p in out { control(fam, p) }
    }
    /// GenerateNobleFamiliesWithTerritories: how many noble families to found.
    static func familyCount(_ unowned: Int, _ polity: String, _ random: Founding.SeededRandom) -> Int {
        let top = max(1, min(unowned, familyCap(polity)))
        if unowned <= 2 { return 1 }
        if unowned <= 4 { return random.intRange(1, 3) }
        if unowned <= 8 { return random.intRange(2, min(top + 1, 4)) }
        return random.intRange(3, top + 1)
    }
    /// SelectOptimalFamilyOrigins: a random first origin, then farthest-point sampling.
    static func selectOrigins(_ candidates: [View], _ count: Int, _ distance: (Int, Int) -> Double, _ random: Founding.SeededRandom) -> [View] {
        if candidates.count <= count { return candidates }
        var remaining = candidates
        let first = remaining.remove(at: random.intRange(0, remaining.count))
        var selected = [first]
        var n = 1
        while n < count && !remaining.isEmpty {
            var best: Int? = nil, bestDistance = 0.0
            for (k, p) in remaining.enumerated() {
                var nearest = f(floatMax)
                for q in selected { let d = distance(p.id, q.id); if !(d > nearest) { nearest = d } }
                if nearest > bestDistance { bestDistance = nearest; best = k }
            }
            if let best { selected.append(remaining.remove(at: best)) }
            n += 1
        }
        return selected
    }
    /// AssignRemainingProvincesToNearestFamilies.
    static func assignRemaining(_ remaining: [View], _ families: [Holding], _ distance: (Int, Int) -> Double) {
        for p in remaining {
            var best: Holding? = nil, nearest = f(floatMax)
            for fam in families where fam.home > 0 { let d = distance(p.id, fam.home); if nearest > d { nearest = d; best = fam } }
            if let best { control(best, p) }
        }
    }
    /// ValidateAndAdjustInitialDistribution + RedistributeProvincesToUnderCapacityFamilies.
    static func validate(_ families: [Holding], _ views: [View], _ polity: String, _ distance: (Int, Int) -> Double) {
        if families.isEmpty { return }
        let top = Int(f(Double(views.count) * maxRatio(polity)).rounded(.down))
        let byId = Dictionary(uniqueKeysWithValues: views.map { ($0.id, $0) })
        let over = ordered(families.filter { $0.provinces.count > top }, { Double($0.provinces.count) }, descending: true)
        var freed = [View]()
        for fam in over {
            let excess = fam.provinces.count - top
            let owned = ordered(fam.provinces.compactMap { byId[$0] }.filter { $0.id != fam.home }, { distance(fam.home, $0.id) }, descending: true).prefix(excess)
            for p in owned { fam.provinces.remove(at: fam.provinces.firstIndex(of: p.id)!); p.familyId = 0; freed.append(p) }
        }
        if freed.isEmpty { return }
        let under = ordered(families.filter { $0.provinces.count < top }) { Double($0.provinces.count) }
        for p in freed {
            var best: Holding? = nil, score = -floatMax
            for fam in under where fam.provinces.count < top {
                let d = distance(fam.home, p.id), sc = f(f(f(1 - f(Double(fam.provinces.count) / Double(top))) * 10) - f(d * f(0.1)))
                if sc > score { score = sc; best = fam }
            }
            if let best { control(best, p) }
        }
    }
    static func nobleRecord(_ nationId: String, ruling: Bool, _ fam: Holding, religionId: JS) -> JS {
        let key = { (n: Int) in JS("p-\(n - 1)") }
        return object([("nationId", JS(nationId)), ("ruling", JS(ruling)), ("homeProvinceId", key(fam.home)), ("originalHomeProvinceId", key(fam.home)),
                       ("controlledProvinces", .array(fam.provinces.map(key))), ("influence", JS(50)), ("wealth", JS(100)), ("extendedMembers", JS(50)),
                       ("religionId", religionId.clone()), ("foundingTime", JS(0)), ("updateDay", JS(1)), ("totalEnemyDestroyed", JS(0)), ("totalProvincesConquered", JS(0)),
                       ("rallyCooldown", JS(0)), ("historicalClaims", .object()), ("historicalStateIds", .array()), ("lastRulingTime", .object()), ("rulingDuration", .object()),
                       ("stateResidenceMonths", .object())])
    }

    /// attachNobility47 (State.InitializeCharactersAndFamilies after the ruling family): the ruling family's
    /// territories, noble families with territories and members, the remaining provinces and the initial
    /// distribution check, state by state in nation order. Mutates `r`.
    public static func attachNobility(_ r: JS) {
        let seed = r.world.custom.seed.asString, life = r.life, kin = r.kin, current = life.currentDate
        let alive = r.world.nations.asArray.filter { n in r.world.provinces.asArray.contains { $0.controller.asString == n.id.asString } }.map { $0.id.clone() }
        let nobility = object([("version", JS(1)), ("rule", JS("original-families-v1")), ("families", .object()), ("month", JS(current.year.asInt * 12 + current.month.asInt - 1)),
                               ("year", current.year.clone()), ("monthFamilies", .array()), ("random", object([("state", JS(Double(People.nameSeed(seed + "/nobility47")))), ("draws", JS(0))])),
                               ("collaterals", .array()), ("detached", .array()), ("redistribution", .object()), ("warContributions", .object()), ("births", .array()), ("marriages", .array()),
                               ("rulingFamilies", .object()), ("extinct", .array()), ("relations", .object()), ("armies", .object()), ("aliveStates", .array(alive)),
                               ("settings", object([("allowFamilyRebellion", JS(true)), ("familyRebelMinMonths", JS(18)), ("allowCivilWar", JS(true)), ("civilWarMinMonths", JS(36))])),
                               ("lastFamilyRebellion", .object()), ("lastCivilWar", .object()), ("civilWars", .object())])
        r.nobility = nobility
        let scale = r.world.provinces.length > 0 ? r.scale.asNumber : 1
        let number = { (id: String) in Int(id.dropFirst(2))! + 1 }
        var centers = [Int: (Double, Double)]()
        for p in r.world.provinces.asArray { centers[number(p.id.asString)] = (p.center.x.asNumber / scale, p.center.y.asNumber / scale) }
        func distance(_ a: Int, _ b: Int) -> Double { if let p = centers[a], let q = centers[b] { return f(jsHypot(p.0 - q.0, p.1 - q.1)) }; return f(floatMax) }
        var nextFamilyId = kin.families.objectValues.map(\.id.asInt).max()! + 1
        var registry = [JS](), nextId = r.people.nextPersonId.asInt
        for n in r.world.nations.asArray {
            let nid = n.id.asString, identity = r.civilization.nations[nid], polity = identity.polity.asString, stateId = r.people.nations[nid].id.asInt
            let k = FamilyMembersRef.make(r, seed: "\(seed)/nobility/\(nid)", religionId: identity.religionId, registry: registry, nextId: nextId)
            defer { registry = k.registry; nextId = k.nextId }
            let random = k.random
            let views = r.world.provinces.asArray.filter { $0.controller.asString == nid }.map { View(number($0.id.asString), Set($0.neighbors.asArray.map { number($0.asString) })) }
            if views.isEmpty { continue }
            let rulingKin = kin.families[String(stateId)]
            let capital = r.world.cities.asArray.first { $0.id.asString == n.capitalId.asString }!.provinceId.asString
            rulingKin.allowFemaleInheritance = JS(random.value() < f(0.2))
            let ruling = Holding(rulingKin.id.asInt, number(capital), [])
            let home = views.first { $0.id == ruling.home }!; ruling.provinces.append(home.id); home.familyId = ruling.id
            allocateRuling(ruling, views, polity, distance)
            nobility.families[String(ruling.id)] = nobleRecord(nid, ruling: true, ruling, religionId: identity.religionId)
            let unowned = views.filter { $0.familyId == 0 }
            var families = [Holding]()
            if !unowned.isEmpty {
                let origins = selectOrigins(unowned, familyCount(unowned.count, polity, random), distance, random)
                for origin in origins {
                    families.append(createNobleFamily(r, k, nid, stateId, identity.cultureId.asString, nextFamilyId, origin)); nextFamilyId += 1
                }
                assignRemaining(unowned.filter { u in !origins.contains { $0 === u } }, families, distance)
            }
            validate([ruling] + families, views, polity, distance)
            nobility.families[String(ruling.id)].controlledProvinces = .array(ruling.provinces.map { JS("p-\($0 - 1)") })
            for fam in families { nobility.families[String(fam.id)] = nobleRecord(nid, ruling: false, fam, religionId: identity.religionId) }
        }
        for p in registry {
            p.identity = Nobility.personName(p.cultureName.asString, given: p.firstName.asString, house: p.lastName.asString, gender: p.gender.asInt)
            kin.persons[String(p.id.asInt)] = p
            life.persons[String(p.id.asInt)] = object([("source", JS("native-family")), ("birthTime", p.birthTime.clone()), ("age", p.age.clone()), ("initialAge", .null), ("updatedMonth", JS(12))])
        }
        r.people.nextPersonId = JS(nextId); r.people.nextStateId = JS(max(r.people.nextStateId.asInt, nextFamilyId))
        r.people.revision = JS(r.people.revision.asInt + 1); kin.revision = JS(kin.revision.asInt + 1); life.revision = JS(life.revision.asInt + 1)
    }
    enum FamilyMembersRef {
        static func make(_ r: JS, seed: String, religionId: JS, registry: [JS], nextId: Int) -> Founding.FamilyMembers {
            Founding.FamilyMembers(r, random: Founding.SeededRandom(seed), religionId: religionId, registry: registry, nextId: nextId, kinLookup: true)
        }
    }
    /// CreateNobleFamilyWithTerritory + FamilyManager.CreateFamily + GenerateNobleFamilyMembers.
    static func createNobleFamily(_ r: JS, _ k: Founding.FamilyMembers, _ nationId: String, _ stateId: Int, _ cultureId: String, _ familyId: Int, _ origin: View) -> Holding {
        let random = k.random, kin = r.kin
        // Patriarch: male, 25–60, historically important.
        let head = k.generateInit(cultureId, 0, nil)
        k.setBirth(head, Double(random.intRange(25, 61)))
        head.familyId = JS(familyId); head.stateId = JS(stateId); head.isHistoricallyImportant = JS(true)
        let family = object([("id", JS(familyId)), ("surname", head.lastName.clone()), ("cultureName", JS(cultureId)), ("nationId", JS(nationId)), ("stateId", JS(stateId)),
                             ("headId", head.id.clone()), ("heirId", JS(0)), ("allowFemaleInheritance", JS(random.value() < f(0.3))), ("memberIds", .array([head.id.clone()])),
                             ("collateralMemberIds", .array())])
        kin.families[String(familyId)] = family
        let territory = Holding(familyId, origin.id, [origin.id]); origin.familyId = familyId
        // GenerateNobleFamilyMembers (initial generation).
        let spouse = k.generateInit(cultureId, head.gender.asInt == 0 ? 1 : 0, nil)
        var age = f(f(head.age.asNumber) + random.floatRange(-10, 10)); if age < 16 { age = random.floatRange(16, 20) }
        k.setBirth(spouse, age)
        spouse.stateId = JS(stateId); head.marriageType = JS(0); spouse.marriageType = JS(0); spouse.familyId = family.id.clone(); spouse.lastName = JS(k.lastName(head))
        head.spouseId = spouse.id.clone(); spouse.spouseId = head.id.clone(); family.memberIds.push(spouse.id.clone())
        let count = random.intRange(0, 4)
        for _ in 0..<count {
            let gender = k.childGender(head), father = head.gender.asInt == 0 ? head : spouse, mother = head.gender.asInt == 1 ? head : spouse
            let child = k.generateInit(family.cultureName.asString, gender, father)
            child.familyId = family.id.clone(); child.stateId = JS(stateId); child.fatherId = father.id.clone(); child.motherId = mother.id.clone()
            var childAge = f(f(head.age.asNumber) - random.floatRange(18, 35)); if 0 > childAge { childAge = f(Double(random.intRange(0, 10))) }
            k.setBirth(child, childAge); k.appendChild(family, child, father, mother)
        }
        k.collateral(family, head)
        for id in family.memberIds.asArray { if let p = k.registry.first(where: { $0.id.asInt == id.asInt }) { p.familyId = JS(familyId); p.stateId = JS(stateId) } }
        return territory
    }
}
