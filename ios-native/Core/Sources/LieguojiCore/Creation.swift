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
}
