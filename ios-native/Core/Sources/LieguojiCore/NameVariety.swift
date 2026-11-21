import Foundation

/// 国名多样与人物/家族开局整理（本作 App 规则专用，新世界第 0 天执行一次；网页逐字节对照黄金测试不启用）：
/// 1. 历史模式与架空模式均采用 `NamingCatalog` 的纯净国名池，清洗误带后缀，杜绝「波兰王国王国」「安安」等拼接怪名；
/// 2. 按文化分配地道政体细分（苏丹国、公国、汗国、沙皇国、幕府、城邦、新朝等）并按统一规则拼合全称；
/// 3. 整理同国重姓世家、清洗开局人名与姓氏、为已婚配偶保留独立本姓（不再出现同姓成婚）。
enum NameVariety {
    /// 保留公开入口以兼容已有引用，数据统一归口到 `NamingCatalog.historicalExtraStates`。
    static var extraStates: [String: [String]] { NamingCatalog.historicalExtraStates }

    /// The forms each polity may take in a culture, with their weights (the polity's usual form fills the rest).
    static func forms(polity: String, culture: String, religion: String) -> [(style: String, weight: Double)] {
        switch polity {
        case "Kingdom":
            switch culture {
            case "chinese": return [("feudal", 0.50), ("absolute", 0.35), ("principality", 0.15)]
            case "korean", "vietnamese": return [("absolute", 0.55), ("feudal", 0.35), ("regency", 0.10)]
            case "japanese": return [("feudal", 0.45), ("shogunate", 0.0), ("absolute", 0.40), ("regency", 0.15)]
            case "arab", "persian", "turkic": return [("sultanate", 0.65), ("absolute", 0.25), ("feudal", 0.10)]
            case "german", "polish", "hungarian": return [("principality", 0.35), ("elective", 0.20), ("feudal", 0.25), ("absolute", 0.20)]
            case "french", "italian", "slavic": return [("principality", 0.30), ("feudal", 0.35), ("absolute", 0.35)]
            case "english", "dutch", "norse", "spanish", "portuguese": return [("constitutional", 0.25), ("feudal", 0.35), ("absolute", 0.40)]
            default: return [("feudal", 0.40), ("absolute", 0.45), ("regency", 0.15)]
            }
        case "Empire":
            switch culture {
            case "slavic": return [("tsardom", 0.65), ("empire", 0.35)]
            case "japanese": return [("shogunate", 0.45), ("empire", 0.55)]
            case "chinese": return [("dynasty", 0.80), ("empire", 0.15), ("despotism", 0.05)]
            case "vietnamese", "korean": return [("dynasty", 0.65), ("empire", 0.25), ("despotism", 0.10)]
            case "mongol", "turkic": return [("empire", 0.70), ("despotism", 0.30)]
            default: return [("empire", 0.75), ("despotism", 0.25)]
            }
        case "Tribal":
            switch culture {
            case "mongol", "turkic": return [("khanate", 0.75), ("tribal", 0.25)]
            default: return [("chiefdom", 0.35), ("tribal", 0.65)]
            }
        case "Republic":
            switch culture {
            case "italian", "greek": return [("citystate", 0.40), ("merchant", 0.25), ("oligarchic", 0.20), ("democratic", 0.15)]
            case "dutch": return [("merchant", 0.50), ("parliamentary", 0.25), ("democratic", 0.25)]
            case "roman": return [("oligarchic", 0.50), ("citystate", 0.20), ("democratic", 0.30)]
            default: return [("democratic", 0.45), ("parliamentary", 0.20), ("presidential", 0.20), ("oligarchic", 0.15)]
            }
        case "Federation": return [("federal", 0.55), ("confederation", 0.30), ("union", 0.15)]
        case "Theocracy":
            switch religion {
            case "islam": return [("caliphate", 1)]
            case "catholic": return [("papacy", 0.70), ("order", 0.30)]
            case "buddhism": return [("lamaism", 0.60), ("theocracy", 0.40)]
            default: return [("theocracy", 0.80), ("holy", 0.20)]
            }
        default: return []
        }
    }

    /// 0…1 from the seed and a key (FNV-1a, as Opening.hash).
    static func draw(_ seed: String, _ key: String) -> Double { Double(Opening.hash("\(seed)/\(key)") % 100_000) / 100_000 }

    /// 按文化、政体与宗教确定性挑选一个细分政体样式。
    static func pickStyle(seed: String, key: String, polity: String, culture: String, religion: String) -> Regimes.Style? {
        let options = forms(polity: polity, culture: culture, religion: religion)
        let total = options.reduce(0) { $0 + $1.weight }
        guard total > 0 else { return nil }
        var x = draw(seed, key) * total, chosen = options.last!.style
        for o in options { x -= o.weight; if x < 0 { chosen = o.style; break } }
        return Regimes.styles.first { $0.id == chosen && $0.base == polity }
    }

    /// Once per new world (before its first day): clean/varied state names, culture forms of government,
    /// deduplicated noble house surnames per state, clean person names, and distinct natal surnames for spouses.
    static func apply(_ r: JS) {
        guard !r.regimes.isNull, !r.regimes.namesVaried.isTruthy else { return }
        r.regimes.namesVaried = JS(true)
        // 已经开始推演的世界保留玩家熟悉的既有名称。
        guard r.clock.tick.asNumber == 0, !r.civilization.isNull else { return }
        let seed = r.world.custom.seed.asString, mode = r.civilization.mode.optionalString ?? "historical-names"
        let nations = r.world.nations.asArray
        var used = Set<String>()
        for n in nations {
            let id = n.id.asString, c = r.civilization.nations[id]
            guard !c.isNull, c.origin.optionalString ?? "new-world" == "new-world", c.name.custom.isNull else {
                if let existing = c.name.value.optionalString { used.insert(NamingCatalog.cleanStateBase(existing)) }
                continue
            }
            let culture = c.cultureId.optionalString ?? "", polity = c.polity.optionalString ?? "Kingdom"
            let religion = c.religionId.optionalString ?? ""
            if let s = pickStyle(seed: seed, key: "form/\(id)", polity: polity, culture: culture, religion: religion) {
                let b = Regimes.book(r, id); b.style = JS(s.id); b.parties = .null
            }
            let st = Regimes.style(r, id)
            if let pick = NamingCatalog.pickStateBase(culture: culture, mode: mode, seed: "\(seed)/variety/\(id)", used: used, styleId: st.id) {
                used.insert(pick)
                used.insert(NamingCatalog.canonicalStateKey(pick))
                c.name.value = JS(pick)
            } else if let raw = c.name.value.optionalString {
                let cleaned = NamingCatalog.cleanStateBase(raw)
                used.insert(cleaned)
                used.insert(NamingCatalog.canonicalStateKey(cleaned))
                c.name.value = JS(cleaned)
            }
            n.name = JS(Regimes.title(r, id, base: c.name.value.optionalString ?? MapLayers.stateLabel(n.name.asString, full: false), style: st))
        }
        polishHousesAndPeople(r, seed: seed)
        FamilyPolitics.seedOpeningRelations(r, seed: seed)
        // 同步开篇史册里的国名与开国君主名。
        refreshOpeningChronicle(r)
    }

    /// 整理开局全部世家与人物：同国世家不撞姓、清洗脏姓氏与脏人名、已婚配偶保留独立本姓、统一全名格式。
    static func polishHousesAndPeople(_ r: JS, seed: String) {
        guard !r.kin.isNull, !r.kin.families.isNull, !r.kin.persons.isNull else { return }
        // 1. 按国家分组为世家去重姓氏（宗室优先保留，其余世家撞姓或带“家/人/氏”尾缀时从本文化纯净姓氏池改选）。
        var usedByNation = [String: Set<String>]()
        let familyKeys = r.kin.families.objectKeys.sorted { (Int($0) ?? 0) < (Int($1) ?? 0) }
        for key in familyKeys {
            let fam = r.kin.families[key]
            guard case .object = fam.storage else { continue }
            let nationId = fam.nationId.optionalString ?? ""
            let culture = fam.cultureName.optionalString ?? ""
            let pool = NamingCatalog.houseNames(culture: culture)
            var surname = NamingCatalog.cleanSurname(fam.surname.optionalString ?? "")
            var used = usedByNation[nationId] ?? []
            if surname.isEmpty || used.contains(surname) || (!pool.isEmpty && !pool.contains(surname)) {
                if !pool.isEmpty {
                    let start = Int(Opening.hash("\(seed)/house-dedup/\(nationId)/\(key)") % UInt32(pool.count))
                    if let pick = (0..<pool.count).lazy.map({ pool[(start + $0) % pool.count] }).first(where: { !used.contains($0) }) {
                        surname = pick
                    } else {
                        surname = pool[start]
                    }
                }
            }
            if !surname.isEmpty {
                used.insert(surname)
                usedByNation[nationId] = used
                fam.surname = JS(surname)
            }
        }

        // 2. 识别每个家族的“外娶/外嫁配偶”（无本族父母、非家主、且与同族另一成员互为配偶），为其分配独立本姓。
        var spouseIds = Set<Int>()
        for key in familyKeys {
            let fam = r.kin.families[key]
            guard case .object = fam.storage else { continue }
            let headId = fam.headId.asInt
            let members = (fam.memberIds.isNull ? [] : fam.memberIds.asArray).map(\.asInt)
            let memberSet = Set(members)
            for pid in members {
                guard pid != headId, !spouseIds.contains(pid), let p = People.person(r, pid) else { continue }
                let sid = p.spouseId.asInt
                guard sid > 0, memberSet.contains(sid), p.fatherId.asInt == 0, p.motherId.asInt == 0 else { continue }
                // 夫妇二人若都无本族父母：家主或编号较小者视为本家血脉，另一位视为外姓配偶。
                if sid == headId || (sid < pid && !spouseIds.contains(sid)) {
                    spouseIds.insert(pid)
                }
            }
        }

        // 3. 逐人清洗名、姓、全名，并同步到 people.persons / civilization.rulers / chronicle.leaders。
        for pidKey in r.kin.persons.objectKeys.sorted(by: { (Int($0) ?? 0) < (Int($1) ?? 0) }) {
            let p = r.kin.persons[pidKey]
            guard case .object = p.storage else { continue }
            let pid = p.id.asInt
            let culture = p.cultureName.optionalString ?? ""
            let gender = p.gender.asInt
            let givenPool = NamingCatalog.givenNames(r, culture: culture, gender: gender)
            let housePool = NamingCatalog.houseNames(culture: culture)
            var given = p.firstName.optionalString ?? ""
            if !givenPool.isEmpty && !givenPool.contains(given) {
                let idx = Int(Opening.hash("\(seed)/given-clean/\(pid)") % UInt32(givenPool.count))
                given = givenPool[idx]
            }
            let fam = r.kin.families[p.familyId.asInt.description]
            let famSurname = NamingCatalog.cleanSurname(fam.surname.optionalString ?? p.lastName.optionalString ?? "")
            let house: String
            if spouseIds.contains(pid) {
                let current = NamingCatalog.cleanSurname(p.lastName.optionalString ?? "")
                if !current.isEmpty && current != famSurname && (housePool.isEmpty || housePool.contains(current)) {
                    house = current
                } else if !housePool.isEmpty {
                    let start = Int(Opening.hash("\(seed)/spouse-house/\(pid)") % UInt32(housePool.count))
                    house = (0..<housePool.count).lazy.map { housePool[(start + $0) % housePool.count] }.first { $0 != famSurname } ?? housePool[start]
                } else {
                    house = famSurname
                }
                p.natalSurname = JS(house)
            } else {
                house = famSurname.isEmpty ? NamingCatalog.cleanSurname(p.lastName.optionalString ?? "") : famSurname
            }
            let formatted = NamingCatalog.formatPerson(culture: culture, given: given, house: house, gender: gender)
            p.firstName = JS(given)
            p.lastName = JS(house)
            if case .object = p.identity.storage {
                p.identity.given = JS(given)
                p.identity.house = JS(house)
                p.identity.name = JS(formatted)
            } else {
                p.identity = Nobility.personName(culture, given: given, house: house, gender: gender)
            }
            let court = r.people.persons[pidKey]
            if case .object = court.storage {
                court.name = JS(formatted)
                court.family = JS(house)
                if let rulerId = court.rulerId.optionalString {
                    let rc = r.civilization.rulers[rulerId]
                    if case .object = rc.storage {
                        rc.given = JS(given); rc.house = JS(house); rc.name = JS(formatted); rc.regnalName = JS(given)
                    }
                    if let nid = court.nationId.optionalString, !r.chronicle.leaders[nid].isNull {
                        for reign in r.chronicle.leaders[nid].asArray where reign.id.optionalString == rulerId {
                            reign.name = JS(formatted); reign.family = JS(house); reign.regnalName = JS(given)
                        }
                    }
                }
            }
        }
    }

    /// 刷新第 0 天开篇纪事中的国名与君主姓名，避免史册里仍留着清洗前的旧称。
    static func refreshOpeningChronicle(_ r: JS) {
        guard !r.origins.isNull, !r.chronicle.isNull else { return }
        let start: DiplomacyCalendar.D = (r.life.startDate.year.asInt, r.life.startDate.month.asInt, r.life.startDate.day.asInt)
        func before(_ days: Int) -> DiplomacyCalendar.D { DiplomacyCalendar.fromDayNumber(DiplomacyCalendar.dayNumber(start) - days) }
        for n in r.world.nations.asArray {
            let nid = n.id.asString, o = r.origins.nations[nid]
            guard !o.isNull, let rulerId = o.rulerId.optionalString else { continue }
            guard let entry = r.chronicle.entries.asArray.first(where: { $0.kind.optionalString == "accession" && $0.people.asArray.contains { $0.id.optionalString == rulerId } }) else { continue }
            let years = DiplomacyCalendar.wholeYears(before(o.foundedBeforeDays.asInt), start)
            let reign = DiplomacyCalendar.wholeYears(before(o.reignBeforeDays.asInt), start)
            let rulerName = r.civilization.rulers[rulerId].name.optionalString ?? ""
            entry.text = JS("\(n.name.asString)开篇：建国已\(years)年，\(rulerName)已在位\(reign > 0 ? "\(reign)年" : "\(o.reignBeforeDays.asInt)日")")
            for p in entry.people.asArray where p.id.optionalString == rulerId {
                p.name = JS(rulerName)
                if let regnal = r.civilization.rulers[rulerId].regnalName.optionalString { p.regnalName = JS(regnal) }
            }
        }
    }
}
