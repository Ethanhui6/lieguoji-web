import Foundation

/// The nation panel (original StateInfoUI, web CultureNationRelations47 / campaign-card47) and the
/// state-level diplomatic actions of the web's global orders (civilization47-global-orders).
extension NativeEngine {
    /// 统一的人物全名读取：优先已格式化的 identity.name，否则按文化命名规则拼合。
    static func displayPersonName(_ p: JS) -> String {
        if let name = p.identity.name.optionalString, !name.isEmpty { return name }
        let culture = p.cultureName.optionalString ?? ""
        let first = p.firstName.optionalString ?? "", last = p.lastName.optionalString ?? ""
        return NamingCatalog.formatPerson(culture: culture, given: first, house: last, gender: p.gender.asInt)
    }

    /// 朝堂 (state-offices47 + nobility47): governance, the central offices and their holders' fit,
    /// governors and war commanders, the noble houses by influence, held and occupied land.
    func court(_ id: String) -> JS {
        let r = run, c = JS.object(), sid = Offices.stateId(r, id)
        func name(_ p: JS) -> String { Self.displayPersonName(p) }
        c.governance = JS(Offices.governance(r, id))
        c.manual = JS(r.offices47.nations[id].manual.isTruthy)
        c.temper = JS(DeclarationEngine.temper?(id) ?? 1)
        // 国家特性: the original's state traits with their effect.
        var traitRows: [JS] = Armies.stateTraits(r, id).compactMap { k in
            guard let t = Government.stateTraitText[k] else { return nil }
            let o = JS.object(); o.name = JS(t.0); o.text = JS(t.1); return o
        }
        // 国家性格 first.
        if let p = Regimes.persona(r, id) { let o = JS.object(); o.name = JS("性格·" + p.name); o.text = JS(p.text); traitRows.insert(o, at: 0) }
        c.traits = .array(traitRows)
        c.rebellion = Rebellion.outlook(r, id)
        c.centralIncome = JS(Offices.centralIncome(r, id))
        c.offices = .array(Offices.central.map { office in
            let e = JS.object(); e.office = JS(office)
            if let p = Offices.holder(r, id, office, sid) { e.name = JS(name(p)); e.age = JS(p.age.optionalNumber ?? 0); e.fit = JS(Offices.suitability(r, id, office, sid)); e.person = JS(p.id.optionalNumber ?? -1) }
            else { e.name = JS(""); e.age = JS(0); e.fit = JS(0) }
            return e
        })
        let assignments = r.offices47.nations[id].assignments.isNull ? [] : r.offices47.nations[id].assignments.asArray
        let held = r.world.provinces.asArray.enumerated().filter { $0.element.controller.optionalString == id }
        c.provinces = JS(held.count)
        // De jure owner: legalOwner, else the controller (as the province panel reads it).
        func owner(_ p: JS) -> String? { p.legalOwner.optionalString ?? p.controller.optionalString }
        c.occupied = JS(held.filter { owner($0.element) != id }.count)
        c.lost = JS(r.world.provinces.asArray.filter { owner($0) == id && $0.controller.optionalString != id }.count)
        c.governors = JS(assignments.filter { $0.officeId.optionalString == "Governor" }.count)
        // 各州总督: each held province with its governor and how well he suits it.
        c.governorList = .array(held.map { i, p in
            let e = JS.object(); e.province = JS(i); e.name = JS(p.name.asString)
            if let h = Offices.holder(r, id, "Governor", i + 1) { e.holder = JS(name(h)); e.fit = JS(Offices.suitability(r, id, "Governor", i + 1)); e.person = JS(h.id.optionalNumber ?? -1) }
            return e
        })
        c.commanders = .array(assignments.filter { $0.officeId.optionalString == "WarCommander" }.compactMap { a -> JS? in
            guard let holder = a.holderId.optionalNumber, let p = People.person(r, Int(holder)) else { return nil }
            let e = JS.object(); e.name = JS(name(p)); e.age = JS(p.age.optionalNumber ?? 0)
            let enemy = r.people.nations.objectEntries.first { $0.1.id.optionalNumber.map { Int($0) } == a.scopeId.optionalNumber.map { Int($0) } }?.0
            e.enemy = JS(nationIndex(enemy)); e.person = JS(p.id.asInt); return e
        })
        // Noble houses of this state, by influence (0…1000).
        let ruling = People.rulingFamilyId(r, id)
        let prof = Regimes.styleProfile(r, id)
        let fiefAllowed = prof.fiefRule.allowsFiefs
        let govPerson = Regimes.governor(r, id)
        let govFamilyId = govPerson?.familyId.asInt ?? 0
        c.fiefRule = JS(prof.fiefRule.rawValue)
        c.allowsFiefs = JS(fiefAllowed)
        if let gp = govPerson {
            let ar = JS.object()
            ar.id = JS(gp.id.asInt)
            ar.name = JS(Self.displayPersonName(gp))
            ar.title = JS(Regimes.seats(r, id).premier ?? "掌权者")
            ar.houseId = JS(govFamilyId > 0 ? String(govFamilyId) : "")
            if govFamilyId > 0 {
                let s = NamingCatalog.cleanSurname(r.kin.families[String(govFamilyId)].surname.optionalString ?? "")
                ar.houseName = JS(NamingCatalog.houseLabel(s))
            }
            c.actualRuler = ar
        }
        // 统计每个世家在任官职人数，供朝政世家行摘要展示
        var officeCounts = [Int: Int]()
        for a in assignments {
            if let hid = a.holderId.optionalNumber, let p = People.person(r, Int(hid)), p.isAlive.asBool {
                officeCounts[p.familyId.asInt, default: 0] += 1
            }
        }
        let isJPImperialRuler: Bool = {
            let lid = r.people.nations[id].leaderId.optionalNumber.map(Int.init) ?? -1
            let pol = r.civilization.nations[id].polity.optionalString ?? ""
            let cult = r.civilization.nations[id].cultureId.optionalString ?? ""
            let stTitle = r.regimes.isNull ? "" : (Regimes.seats(r, id).head ?? Regimes.style(r, id).title ?? "")
            return lid > 0 && MonarchLore.isJapaneseEmperor(culture: cult, title: stTitle, polity: pol)
        }()
        let houses = r.nobility.isNull || r.nobility.families.isNull ? [] : r.nobility.families.objectEntries.filter { $0.1.nationId.optionalString == id }
        c.houses = .array(houses.sorted { ($0.1.influence.optionalNumber ?? 0) > ($1.1.influence.optionalNumber ?? 0) }.prefix(8).map { key, fam in
            let e = JS.object()
            let kFam = r.kin.families[key]
            let surname = NamingCatalog.cleanSurname(kFam.surname.optionalString ?? "")
            let fidInt = Int(key) ?? -1
            let isRuling = fidInt == ruling
            let imperialNoSurname = isRuling && isJPImperialRuler
            e.name = JS(imperialNoSurname ? "皇室（无姓）" : NamingCatalog.houseLabel(surname))
            e.surname = JS(imperialNoSurname ? "" : surname)
            e.id = JS(key)
            var headLabel = ""
            if let hid = kFam.headId.optionalNumber, hid > 0, let head = People.person(r, Int(hid)) {
                headLabel = imperialNoSurname ? (head.firstName.optionalString ?? Self.displayPersonName(head)) : Self.displayPersonName(head)
                e.headName = JS(headLabel)
            }
            var heirLabel = ""
            if let hid = kFam.heirId.optionalNumber, hid > 0, let heir = People.person(r, Int(hid)), heir.isAlive.asBool {
                heirLabel = imperialNoSurname ? (heir.firstName.optionalString ?? Self.displayPersonName(heir)) : Self.displayPersonName(heir)
            }
            let offCnt = officeCounts[fidInt] ?? 0
            var summaryParts = [String]()
            if !headLabel.isEmpty { summaryParts.append(imperialNoSurname ? "天皇 \(headLabel)" : "家主 \(headLabel)") }
            if !heirLabel.isEmpty { summaryParts.append(imperialNoSurname ? "皇储 \(heirLabel)" : "继承人 \(heirLabel)") }
            if offCnt > 0 { summaryParts.append("在任 \(offCnt) 官") }
            e.keyMembers = JS(summaryParts.joined(separator: " · "))
            e.allowFemale = JS(kFam.allowFemaleInheritance.isTruthy)
            e.influence = JS(fam.influence.optionalNumber ?? 0)
            e.provinces = JS(fam.controlledProvinces.isNull ? 0 : fam.controlledProvinces.length)
            let isGoverning = prof.fiefRule == .regent && govFamilyId > 0 && fidInt == govFamilyId
            e.ruling = JS(isRuling)
            e.governing = JS(isGoverning)
            e.nominalRoyal = JS(isRuling && prof.fiefRule == .regent && govFamilyId > 0 && govFamilyId != ruling)
            // 12 个月势力走势 + 封地冷却
            if !r.regimes.isNull, !r.regimes.houseHistory.isNull, !r.regimes.houseHistory[key].isNull {
                e.history = r.regimes.houseHistory[key]
            } else {
                e.history = .array([JS((fam.influence.optionalNumber ?? 0).rounded())])
            }
            let cd = (!r.regimes.isNull && !r.regimes.fiefCooldown.isNull) ? (r.regimes.fiefCooldown[key].optionalNumber.map(Int.init) ?? 0) : 0
            e.fiefCooldown = JS(cd)
            // 派系: loyal (≥ 20), neutral, estranged (< −20), plotting (≤ −50 with 200+ influence and land:
            // the original's family-rebellion threshold).
            var rel = 100.0
            if !isRuling && ruling != 0 && r.nobility.families.has(String(ruling)) { rel = Nobility.relation(r, key, String(ruling)) }
            let influence = fam.influence.optionalNumber ?? 0
            let landed = fiefAllowed && !fam.controlledProvinces.isNull && fam.controlledProvinces.length > 0
            var stance = "中立"
            if isGoverning && !isRuling { stance = "掌权" }
            else if isRuling { stance = (prof.fiefRule == .regent && govFamilyId > 0 && govFamilyId != ruling) ? "名义宗室" : "宗室" }
            else if rel <= -50 && influence >= 200 && landed { stance = "谋逆" }
            else if rel < -20 { stance = "离心" }
            else if rel >= 20 { stance = "拥戴" }
            e.relation = JS(rel); e.stance = JS(stance)
            e.members = JS(kFam.isNull ? 0 : Nobility.living(r, key).count)
            // 宿敌: the house it is on the worst terms with, if they are bad.
            let foes = houses.filter { $0.0 != key }.map { (k: $0.0, rel: r.nobility.relations[key][$0.0].optionalNumber ?? 0) }.filter { $0.rel <= -20 }
            if let foe = foes.min(by: { $0.rel < $1.rel }), let foeSurname = r.kin.families[foe.k].surname.optionalString { e.rival = JS(NamingCatalog.houseLabel(foeSurname)) }
            return e
        })
        return c
    }

    func nationIndex(_ id: String?) -> Int { id.flatMap { s in run.world.nations.asArray.firstIndex { $0.id.asString == s } } ?? -1 }

    /// Ruler, polity, culture, religion, treasury and destiny, relations (enemies, alliance,
    /// overlord, vassals), the nation's wars as cards, and its autonomy switch.
    public func nationInfo(_ index: Int) -> Data? {
        let r = run, nations = r.world.nations.asArray
        guard nations.indices.contains(index) else { return nil }
        let id = nations[index].id.asString, civ = r.civilization.nations[id]
        let o = JS.object()
        o.name = nations[index].name
        o.baseName = JS(NamingCatalog.cleanStateBase(civ.name.value.optionalString ?? MapLayers.stateLabel(nations[index].name.asString, full: false)))
        o.nameTemplate = r.regimes.isNull ? .null : r.regimes.nations[id].nameTemplate
        o.rulingSurname = JS(Regimes.rulingSurname(r, id))
        o.restorationOrdinal = JS(Regimes.restorationOrdinal(r, id))
        o.culture = civ.cultureId.isNull ? JS("") : civ.cultureId; o.religion = civ.religionId.isNull ? JS("") : civ.religionId; o.polity = civ.polity.isNull ? JS("") : civ.polity
        o.gold = JS(r.finance.nations[id].gold.optionalNumber ?? 0); o.goldPerMonth = JS(r.finance.nations[id].goldPerMonth.optionalNumber ?? 0)
        o.destiny = JS(r.destiny.nations[id].destiny.optionalNumber ?? 0)
        o.power = r.regimes.isNull || r.regimes.power.isNull || r.regimes.power[id].isNull ? .array() : r.regimes.power[id]
        o.livelihood = JS(r.economy.nations[id].ethnic.optionalString ?? "")
        o.alive = JS(Vassals.alive(r, id)); o.auto = JS(r.diplomacy.nations[id].optionalBool == true); o.worldAuto = JS(r.diplomacy.worldAuto.isTruthy)
        // Ruler.
        let leaderId = r.people.nations[id].leaderId
        if !leaderId.isNull, let p = People.person(r, leaderId.asInt) {
            let ruler = JS.object()
            ruler.name = JS(Self.displayPersonName(p))
            ruler.title = JS(People.rulerTitle(culture: civ.cultureId.optionalString ?? "", polity: civ.polity.optionalString ?? "", religion: civ.religionId.optionalString ?? "", gender: p.gender.optionalNumber.map { Int($0) } ?? 0))
            ruler.age = JS(p.age.optionalNumber ?? 0)
            ruler.female = JS(p.gender.optionalNumber == 1)
            // For the editor (tap the ruler): id, traits and base skills.
            ruler.id = JS(leaderId.asInt)
            ruler.traits = p.traits.isNull ? .array() : .array(p.traits.asArray.map { JS(Self.traitLabels[$0.asString] ?? $0.asString) })
            ruler.skills = .array(["charisma", "military", "diplomatic", "administrative"].map { JS((p.base[$0].optionalNumber ?? 0).rounded()) })
            if !r.regimes.isNull, let t = Regimes.style(r, id).title { ruler.title = JS(t) }
            // A woman on the throne takes the female form of the title (the original's 女酋长、女教皇…).
            if p.gender.optionalNumber == 1 { let t = ruler.title.asString; ruler.title = JS(Self.femaleTitles[t] ?? t) }
            // 元首与掌权者 (Heads.swift): the form of government may set the head of state's title.
            if !r.regimes.isNull, let t = Regimes.seats(r, id).head { ruler.title = JS(p.gender.optionalNumber == 1 ? (Self.femaleTitles[t] ?? t) : t) }
            // 真实历史年号、世数、尊号与无姓氏日本天皇展示 + 在位特质实际加成汇总
            if UnitKinds.enabled && !r.regimes.isNull && r.regimes.enabled.isTruthy {
                MonarchLore.ensurePersonalityTraits(r, person: p)
                ruler.traits = p.traits.isNull ? .array() : .array(p.traits.asArray.map { JS(Self.traitLabels[$0.asString] ?? $0.asString) })
                let latestReign = (r.chronicle.isNull || r.chronicle.leaders.isNull || r.chronicle.leaders[id].isNull) ? nil : r.chronicle.leaders[id].asArray.last
                let rid = latestReign?.id.optionalString ?? "ruler-\(id)-\(leaderId.asInt)"
                let order = latestReign?.order.optionalNumber.map(Int.init) ?? 1
                let startDay = latestReign?.ascendedDay.optionalNumber ?? r.world.day.asNumber
                let reignYears = max(0, (r.world.day.asNumber - startDay) / 365.25)
                let sk = People.skills(p)
                let avgSk = (sk.charisma + sk.military + sk.diplomatic + sk.administrative) / 4.0
                let row47 = r.reigns47.isNull ? JS.null : r.reigns47[rid]
                let curProvs = r.world.provinces.asArray.reduce(0) { $1.controller.optionalString == id ? $0 + 1 : $0 }
                let startArr = row47.isNull || row47.start.isNull ? [] : row47.start.asArray
                let startProvs = startArr.first?.optionalNumber.map(Int.init) ?? curProvs
                let honor = MonarchLore.honor(
                    r, nationId: id, reignId: rid, order: order,
                    culture: civ.cultureId.optionalString ?? "", polity: civ.polity.optionalString ?? "",
                    title: ruler.title.asString, person: p, fallbackName: ruler.name.asString,
                    reignYears: reignYears, deltaProvs: curProvs - startProvs, avgSkill: avgSk, isActive: true
                )
                ruler.name = JS(honor.cleanPersonalName)
                ruler.styledName = JS(honor.styledName)
                ruler.eraName = JS(honor.eraName)
                ruler.eraYearText = JS(honor.eraYearText)
                ruler.honorific = JS(honor.honorific)
                ruler.surnameLessImperial = JS(honor.surnameLessImperial)
                let activeRuler = Regimes.governor(r, id) ?? p
                let eff = MonarchLore.traitEffects(of: activeRuler)
                ruler.traitSummary = .array(eff.summary.map { JS($0) })
            }
            o.ruler = ruler
        } else { o.ruler = .null }
        if !r.regimes.isNull {
            let seat = Regimes.seats(r, id)
            if let title = seat.premier {
                let h = JS.object()
                h.premierTitle = JS(title); h.premierRules = JS(seat.premierRules); h.elected = JS(seat.elected)
                if let p = Regimes.premier(r, id) {
                    h.premierName = JS(Regimes.personName(p))
                    h.premierId = JS(p.id.asInt)
                    if p.familyId.asInt > 0 { h.premierHouseId = JS(String(p.familyId.asInt)) }
                }
                o.heads = h
            }
        }
        o.people = people(id)
        o.court = court(id)
        let st = Regimes.style(r, id)
        o.style = JS(st.id); o.styleLabel = JS(st.label)
        // 政体深度画像、政局安定／政变风险仪与可执行现实政体演变列表
        if !r.regimes.isNull, r.regimes.enabled.isTruthy {
            let prof = Regimes.styleProfile(r, id)
            let outlook = Regimes.coupOutlook(r, id)
            let pd = JS.object()
            pd.camp = JS(prof.camp.rawValue)
            pd.fiefRule = JS(prof.fiefRule.rawValue)
            pd.allowsFiefs = JS(prof.fiefRule.allowsFiefs)
            pd.summary = JS(prof.summary)
            pd.traitLine = JS(prof.traitLine)
            pd.stability = JS(outlook.stability)
            pd.coupRisk = JS(outlook.risk)
            pd.coupLevel = JS(outlook.level)
            pd.pressure = JS(outlook.pressure)
            pd.likelyPath = JS(outlook.likelyPath)
            pd.defeatShock = JS(Int((Regimes.defeatPenalty(r, id) * 100).rounded()))
            pd.mood = JS(Int((Regimes.mood(r, id) * 100).rounded()))
            pd.transitions = .array(Regimes.availableTransitions(r, id).map { tr in
                let x = JS.object()
                x.id = JS(tr.id); x.title = JS(tr.title); x.subtitle = JS(tr.subtitle)
                x.targetStyle = JS(tr.targetStyle); x.dramatic = JS(tr.dramatic)
                return x
            })
            o.polityDetail = pd
            // 王位宣称（来自跨国王室联姻）
            if !r.regimes.claims.isNull {
                let nowM = r.regimes.month.asInt
                let myClaims = r.regimes.claims.asArray.filter { $0.claimant.asString == id && $0.until.asInt > nowM }
                    .compactMap { row -> JS? in
                        let idx = nationIndex(row.target.asString)
                        guard idx >= 0 else { return nil }
                        let x = JS.object(); x.nation = JS(idx); x.years = JS(max(1, (row.until.asInt - nowM) / 12)); return x
                    }
                o.claims = .array(myClaims)
            }
            // 2.8.4 新增：① 朝堂四方权力天平（君主中枢 / 门阀世家 / 军功将领 / 议会文官） + 冲龄幼主摄政；② 当期朝堂大政议案与战后问责；③ 国家旌旗纹章印记
            let cp = JS.object()
            let ldrPerson = !leaderId.isNull ? People.person(r, leaderId.asInt) : nil
            let ldrAge = ldrPerson?.age.optionalNumber ?? 30
            let sk = ldrPerson.map(People.skills) ?? (50, 50, 50, 50)
            var rawCrown = 28.0 + (sk.administrative + sk.charisma) * 0.28 + (r.destiny.nations[id].destiny.optionalNumber ?? 50) * 0.22
            if ldrAge < 16 { rawCrown *= 0.42 }
            let allHouses = r.nobility.isNull || r.nobility.families.isNull ? [] : r.nobility.families.objectEntries.filter { $0.1.nationId.optionalString == id }
            let rulingFam = People.rulingFamilyId(r, id)
            let houseInf = allHouses.reduce(0.0) { sum, entry in
                let inf = entry.1.influence.optionalNumber ?? 0
                return (Int(entry.0) == rulingFam) ? sum + inf * 0.15 : sum + inf * 0.22
            }
            var rawHouses = (prof.fiefRule.allowsFiefs ? 18.0 : 8.0) + min(65.0, houseInf * 0.25)
            if prof.fiefRule == .regent || ldrAge < 16 { rawHouses += 24.0 }
            let activeArmies = r.world.armies.asArray.filter { $0.nationId.optionalString == id && $0.troops.asNumber > 0 && $0.status.asString != "destroyed" }.count
            let activeWars = r.world.campaigns.asArray.filter { $0.status.asString == "active" && ($0.attackerId.asString == id || $0.defenderId.asString == id) }.count
            var rawMilitary = 14.0 + Double(activeArmies) * 3.5 + Double(activeWars) * 14.0 + sk.military * 0.18
            if st.id == "junta" || st.id == "fascist" || st.id == "nazi" || st.id == "shogunate" { rawMilitary += 28.0 }
            let hasParties = !r.regimes.nations[id].parties.isNull && r.regimes.nations[id].parties.length > 0
            var rawCouncil = (hasParties ? 32.0 : 16.0) + Offices.governance(r, id) * 24.0 + sk.diplomatic * 0.15
            if prof.camp == .republic || prof.camp == .constitutional || prof.camp == .socialist { rawCouncil += 22.0 }
            // 玩家主动调衡偏移（r.regimes.nations[id].powerBias）
            let bias = r.regimes.nations[id].powerBias.optionalString ?? ""
            if bias == "crown" { rawCrown += 28 }
            else if bias == "houses" { rawHouses += 28 }
            else if bias == "military" { rawMilitary += 28 }
            else if bias == "council" { rawCouncil += 28 }
            let sumRaw = max(1.0, rawCrown + rawHouses + rawMilitary + rawCouncil)
            let pCrown = max(5, Int((rawCrown / sumRaw * 100).rounded()))
            let pHouses = max(5, Int((rawHouses / sumRaw * 100).rounded()))
            let pMilitary = max(5, Int((rawMilitary / sumRaw * 100).rounded()))
            let pCouncil = max(5, 100 - pCrown - pHouses - pMilitary)
            cp.crown = JS(pCrown); cp.houses = JS(pHouses); cp.military = JS(pMilitary); cp.council = JS(pCouncil)
            let rankedP: [(String, Int, String)] = [
                ("君主中枢", pCrown, "乾纲独断 · 政令通行、中枢岁入 +6%，世家难起异心"),
                ("门阀世家", pHouses, "门阀专政 · 世家把持朝政与封地，削藩易激起兵变"),
                ("军功将领", pMilitary, "将帅干政 · 全军攻势凌厉、好战高涨，战败易生兵变"),
                ("议会文官", pCouncil, "文官/议会主导 · 财政稳健、邦交审慎，战时动员偏缓"),
            ]
            let dom = rankedP.max(by: { $0.1 < $1.1 })!
            cp.dominant = JS(dom.0)
            cp.effect = JS(dom.2)
            if ldrAge < 16 {
                let regentName = Regimes.governor(r, id).map(Self.displayPersonName) ?? (o.heads.isNull ? "辅政大臣" : (o.heads.premierName.optionalString ?? "辅政王"))
                cp.regency = JS("冲龄幼主（\(Int(ldrAge))岁）· 由\(regentName)摄政辅国（满16岁行亲政大典或面临权臣博弈）")
            }
            o.courtPower = cp

            // 当期朝堂大政议案与战后问责
            let ag = JS.object()
            let shockPct = Int((Regimes.defeatPenalty(r, id) * 100).rounded())
            if shockPct >= 5 {
                ag.id = JS("agenda_accountability")
                ag.title = JS("《战后问责与整军复仇案》")
                ag.desc = JS("新败割地之后朝野震动（震荡 −\(shockPct)%），军方与言官联名奏请问责失利主帅、抚恤阵亡将士以重振军心。")
                ag.support = JS("军功将领 · 言官")
                ag.oppose = JS("主和派文官")
                ag.effect = JS("消除战败震荡 · 全军士气 +25 · 国运 +4")
            } else if activeWars > 0 {
                ag.id = JS("agenda_wartax")
                ag.title = JS("《战时急征军饷与前线犒师案》")
                ag.desc = JS("前线兵戈正急，兵部与户部奏请向豪强开征战时特饷，悉数充作前线将士粮饷。")
                ag.support = JS("军功将领 · 君主中枢")
                ag.oppose = JS("门阀世家")
                ag.effect = JS("国库 +450 金 · 全军补给满额 · 士气 +20")
            } else if pHouses >= 32 {
                ag.id = JS("agenda_curbhouses")
                ag.title = JS("《清丈勋贵田庄与抑豪强案》")
                ag.desc = JS("门阀世家权势日炽（占朝局 \(pHouses)%），御史台奏请清丈勋贵隐田、收权归于中枢。")
                ag.support = JS("君主中枢 · 寒门文官")
                ag.oppose = JS("门阀世家")
                ag.effect = JS("各世家权势 −35 · 国库 +380 金 · 腐化 −8")
            } else {
                ag.id = JS("agenda_civil")
                ag.title = JS("《开科取士与劝农兴学案》")
                ag.desc = JS("四境暂安，礼部与司农奏请广开太学、选拔寒门良才并劝课农桑以固国本。")
                ag.support = JS("议会文官 · 君主中枢")
                ag.oppose = JS("守旧门阀")
                ag.effect = JS("全境人口 +3% · 腐化 −6 · 国运 +5")
            }
            o.agenda = ag
        }
        // 国家旌旗纹章印记（支持自定义，默认按文化与政体自动匹配）
        let customEmblem = r.regimes.isNull ? nil : r.regimes.nations[id].emblem.optionalString
        let defaultEmblem: String = {
            let cult = civ.cultureId.optionalString ?? ""
            switch cult {
            case "chinese", "korean", "vietnamese": return "龙"
            case "japanese": return "樱"
            case "roman", "german", "russian", "slavic", "polish": return "鹰"
            case "arab", "turkic", "persian": return "月"
            case "indian", "tibetan": return "莲"
            case "mongol", "hungarian": return "狼"
            case "english", "french", "spanish", "portuguese": return "狮"
            case "norse": return "剑"
            case "aztec", "inca": return "日"
            default: return "鼎"
            }
        }()
        o.emblem = JS((customEmblem?.isEmpty == false) ? customEmblem! : defaultEmblem)
        // 宗教: the state faith's effect and the provinces by faith.
        o.creedEffect = JS(Regimes.stateCreed(r, id)?.text ?? "")
        // 编辑: every state trait, and the titles the player set.
        o.allTraits = stateTraitRows(id)
        o.customTitles = r.regimes.isNull || r.regimes.nations[id].titles.isNull ? .object() : r.regimes.nations[id].titles
        // 国势: what the ruler, fortune, corruption and institutions add up to; and the laws on the books.
        let sway = Regimes.leverage(r, id), held = Set(Regimes.heldReforms(r, id).map(\.id))
        func swayRow(_ name: String, _ value: String, _ text: String) -> JS { let x = JS.object(); x.name = JS(name); x.value = JS(value); x.text = JS(text); return x }
        func signed(_ v: Double) -> String { (v >= 0 ? "+" : "−") + "\(Int(abs(v).rounded()))%" }
        let calm = Int(sway.stability.rounded())
        o.sway = .array([
            swayRow("军略", signed(sway.attack), "全军进攻：君主军事、国运、腐化、制度"),
            swayRow("守御", signed(sway.defense), "全军防御：君主军事魅力、国运、制度"),
            swayRow("财政", signed(sway.income), "每月额外岁入：君主行政、腐化、制度"),
            swayRow("民生", signed(sway.growth), "年人口增长：君主行政魅力、制度"),
            swayRow("安定", "\(calm)", calm < 40 ? "民心离散，大叛乱随时爆发" : calm < 55 ? "暗流涌动，可能爆发大叛乱" : "民心安定，暂无大乱之虞"),
        ])
        o.reforms = .array(Regimes.reforms.map { f in let x = JS.object(); x.id = JS(f.id); x.name = JS(f.name); x.text = JS(f.text); x.on = JS(held.contains(f.id)); return x })
        o.faiths = faithShares(id)
        let book = r.regimes.isNull ? JS.null : r.regimes.nations[id]
        // Each party with its line and what that line does in government.
        o.parties = book.isNull || book.parties.isNull ? .array() : .array(book.parties.asArray.map { p in
            let x = p.clone(), line = Regimes.platform(p.name.asString); x.line = JS(line.name); x.effect = JS(line.text); x.policies = .array(line.policies.map { JS($0) }); return x
        })
        // 国家加成 (自定义) in percent, unset ones as 0.
        let bonus = JS.object()
        for k in Regimes.bonusKeys { bonus[k] = JS(Regimes.bonus(r, id, k) ?? 0) }
        o.bonus = bonus
        o.treaties = .array((r.regimes.isNull || r.regimes.pacts.isNull ? [] : r.regimes.pacts.asArray).filter { ($0.a.asString == id || $0.b.asString == id) && $0.until.asInt > r.regimes.month.asInt }.map { p in
            let e = JS.object(); let other = p.a.asString == id ? p.b.asString : p.a.asString
            e.nation = JS(nationIndex(other)); e.kind = p.kind; e.years = JS(max(0, (p.until.asInt - r.regimes.month.asInt) / 12)); return e
        })
        // Relations.
        o.enemies = .array(r.world.statecraft.relations.asArray.filter { $0.status.asString == "war" && ($0.a.asString == id || $0.b.asString == id) }.map { JS(nationIndex($0.a.asString == id ? $0.b.asString : $0.a.asString)) })
        if let alliance = Vassals.allianceOf(r, id) {
            let a = JS.object(); a.name = alliance.name; a.members = .array(alliance.members.asArray.map { JS(nationIndex($0.asString)) }); o.alliance = a
        } else { o.alliance = .null }
        o.overlord = JS(nationIndex(Vassals.overlord(r, id)))
        o.vassals = .array(r.vassals.records.asArray.filter { $0.endedTick.isNull && $0.overlordId.asString == id }.map { JS(nationIndex($0.vassalId.asString)) })
        // Wars (campaign-card47): sides, goals, losses, duration.
        let stateNation = Dictionary(uniqueKeysWithValues: r.nativeWars.nationIds.asArray.map { ($0[0].asInt, $0[1].asString) })
        // Truces still blocking a declaration (truce46), years left; for the 外交 section.
        let dw = DiplomacyBridge.world(r)
        o.truces = .array(nations.indices.compactMap { j -> JS? in
            guard j != index, Vassals.alive(r, nations[j].id.asString), !dw.atWar(index, j) else { return nil }
            let rel = dw.relations.first { $0.a == index && $0.b == j || $0.a == j && $0.b == index } ?? DiplomacyWorld.Relation(a: index, b: j, lastWar: -200, warCount: 0)
            let t = dw.truce(rel)
            guard t.blocked else { return nil }
            let e = JS.object(); e.nation = JS(j); e.years = JS(t.elapsed.map { t.required - $0 } ?? 0); e.required = JS(t.required)
            return e
        })
        let peaceWorld = PeaceBridge.world(r)
        o.wars = .array(r.nativeWars.campaigns.asArray.filter { $0.endedTick.isNull }.compactMap { c -> JS? in
            let all = c.participants.asArray + (c.destroyedParticipants.isNull ? [] : c.destroyedParticipants.asArray)
            guard all.contains(where: { stateNation[$0.stateId.asInt] == id }) else { return nil }
            let card = JS.object()
            card.id = c.id
            let d = r.nativeDiplomacy.declarations.asArray.first { $0.warId.asInt == c.id.asInt }
            card.casusBelli = JS(d.map { WarText.casusBelli($0.casusBelliId.asInt) } ?? "")
            card.goals = .array(c.goals.asArray.map { g in JS(WarText.goal(g.type.asInt, g.scope.isNull || g.scope.provinceIds.isNull ? 0 : g.scope.provinceIds.length)) })
            card.months = JS(((r.clock.tick.asNumber - c.openedTick.asNumber) / 120 / 30).rounded(.down))
            card.sides = .array([0, 1].map { side in
                let s = JS.object()
                s.nations = .array(c.participants.asArray.filter { $0.side.asInt == side }.map { JS(nationIndex(stateNation[$0.stateId.asInt])) })
                let members = Set(all.filter { $0.side.asInt == side }.map { $0.stateId.asInt })
                s.losses = JS((c.deaths.isNull ? [] : c.deaths.asArray).filter { members.contains($0[0].asInt) }.reduce(0.0) { $0 + $1[1].asNumber }.rounded())
                return s
            })
            let mine = c.participants.asArray.first { stateNation[$0.stateId.asInt] == id }
            card.side = JS(mine.map { $0.side.asInt } ?? -1)
            // peace47 war score, attacker's view, -100…100 (same score the peace AI uses).
            card.score = JS(PeaceAI(war: PeaceBridge.war(c), world: peaceWorld).score().score.rounded())
            return card
        })
        return Data(o.json.utf8)
    }

    /// character-trait-labels.json (web).
    static let traitLabels: [String: String] = {
        var m = ["Genius": "天才", "Brave": "勇敢", "Charismatic": "魅力超凡", "Administrator": "行政天才", "Diplomatic": "外交家", "Just": "公正", "Strategist": "战略家", "Merciful": "仁慈", "Patient": "耐心", "Craven": "懦弱", "Cruel": "残暴", "Incompetent": "无能", "Greedy": "贪婪", "Paranoid": "偏执", "Wrathful": "易怒", "Ambitious": "雄心勃勃", "SocialButterfly": "长袖善舞", "Hawkish": "鹰派", "Dovish": "鸽派", "Unifier": "统一者", "BattleHardened": "越战越勇", "WarWeary": "厌战", "NavalMastery": "海军精通", "ShipMaster": "船舶大师", "Reformer": "改革家", "NaturalLeader": "天生领袖", "Unconvincing": "难以服众"]
        for ex in MonarchLore.extraTraits { m[ex.key] = ex.label }
        return m
    }()
    /// Female forms of the rulers' titles.
    static let femaleTitles = ["国王": "女王", "皇帝": "女皇", "酋长": "女酋长", "教宗": "女教宗", "教皇": "女教皇", "可汗": "可敦", "大汗": "女大汗", "汗": "女汗",
                                      "沙皇": "女沙皇", "天皇": "女天皇", "法老": "女法老", "苏丹": "苏丹娜", "雅尔": "女雅尔", "牧首": "女牧首", "法王": "女法王", "祭主": "女祭主"]
    /// OFFICE_LABELS47 (civilization47-offices).
    static let officeLabels = ["Chancellor": "行政首脑", "Steward": "财政主管", "Marshal": "常备军统帅", "Governor": "总督", "WarCommander": "战时统帅"]

    func personView(_ p: JS, role: String) -> JS {
        let v = JS.object()
        v.role = JS(role); v.id = JS(p.id.optionalNumber ?? -1)
        v.name = JS(Self.displayPersonName(p))
        let age = p.age.optionalNumber ?? 0
        v.age = JS(age.isFinite ? min(200, max(0, age)) : 0); v.female = JS(p.gender.optionalNumber == 1)
        // 容错：特质表只取字符串项，能力值只取有限数（异常存档不应让人物页、族谱闪退）。
        let traits: [JS] = { if case .array(let a) = p.traits.storage { return a }; return [] }()
        v.traits = .array(traits.compactMap(\.optionalString).map { JS(Self.traitLabels[$0] ?? $0) })
        let b = p.base
        v.skills = .array(["charisma", "military", "diplomatic", "administrative"].map { k in let s = b[k].optionalNumber ?? 0; return JS(s.isFinite ? s.rounded() : 0) })
        return v
    }
    /// The 人物 section: monarch, heir of the ruling family, office holders (offices47 assignments).
    func people(_ id: String) -> JS {
        let r = run, out = JS.array()
        let leaderId = r.people.nations[id].leaderId
        if !leaderId.isNull, let p = People.person(r, leaderId.asInt) { out.push(personView(p, role: "君主")) }
        let ruling = r.nobility.rulingFamilies[id].optionalNumber.map { String(Int($0)) } ?? r.people.nations[id].id.optionalNumber.map { String(Int($0)) }
        if let ruling, let heir = r.kin.families[ruling].heirId.optionalNumber, heir > 0, let p = People.person(r, Int(heir)), p.isAlive.asBool { out.push(personView(p, role: "继承人")) }
        let book = r.offices47.nations[id]
        for a in (book.isNull || book.assignments.isNull ? [] : book.assignments.asArray) {
            guard let p = People.person(r, a.holderId.asInt), p.isAlive.asBool else { continue }
            var role = Self.officeLabels[a.officeId.asString] ?? a.officeId.asString
            if a.officeId.asString == "Governor", r.world.provinces.asArray.indices.contains(a.scopeId.asInt - 1) { role += "·" + r.world.provinces[a.scopeId.asInt - 1].name.asString }
            out.push(personView(p, role: role))
        }
        return out
    }

    /// Global order follow-up (applyGlobalOrder47): vassals, alliances, continuity, diplomacy and
    /// attack clocks are reconciled after every state-level action.
    func afterGlobalOrder() {
        let r = run
        Vassals.reconcileVassals(r); Vassals.reconcileAlliances(r); Government.reconcileContinuity(r); DiplomacyBridge.reconcile(r)
        Daily.reconcileMilitaryClock(r)
    }

    /// 名将谱 (Annals.swift).
    public func generals() -> Data { Data(Regimes.generalsRoll(run).json.utf8) }

    /// Alliance (applyAllianceOwned47 unite / leave) between two states, or leaving (b < 0).
    public func alliance(_ a: Int, with b: Int) -> (ok: Bool, reason: String) {
        let r = run, nations = r.world.nations.asArray
        guard nations.indices.contains(a) else { return (false, "该国已不存在。") }
        let ida = nations[a].id.asString
        if !Vassals.alive(r, ida) { return (false, "该国已不存在。") }
        if b < 0 {
            if !Vassals.leaveAlliance(r, ida, force: true) { return (false, "该国当前没有联盟。") }
            afterGlobalOrder(); return (true, r.chronicle.entries.asArray.last?.text.optionalString ?? "已退出同盟。")
        }
        guard nations.indices.contains(b), a != b, Vassals.alive(r, nations[b].id.asString) else { return (false, "结盟对象无效。") }
        let idb = nations[b].id.asString
        let va = Vassals.allianceOf(r, ida), vb = Vassals.allianceOf(r, idb)
        if let va, let vb, va === vb { return (false, "两国已在同一联盟。") }
        // Native ForceAlliance ends every campaign opposing the pair (reason 8).
        for c in r.nativeWars.campaigns.asArray where c.endedTick.isNull && Wars.coversPair(c, r.nativeWars, ida, idb) { _ = PeaceBridge.settle(r, c, reason: 8) }
        War26.reconcileForces(r, []); DiplomacyBridge.reconcile(r)
        let now = JS(Native.fr(r.life.gameTime.asNumber))
        func notice(_ text: String, _ reason: String, _ ids: [String]) { People.announce(r, kind: "diplomacy", text: text, reason: reason, nations: ids, province: nil) }
        func join(_ v: JS, _ id: String, record: Bool = true) {
            v.members.push(JS(id)); v.joinedTime = now.clone(); Vassals.bump(r.alliances)
            if record { notice("\(Vassals.name(r, id))加入\(v.name.asString)", "今后的外部战争按当前盟约决定参战；不补入既有战争。", v.members.asArray.map(\.asString)) }
        }
        switch (va, vb) {
        case (nil, nil):
            let n = r.alliances.nextId.asNumber; r.alliances.nextId = JS(n + 1)
            let v = JS.object()
            v.id = JS(n); v.name = JS("\(Vassals.name(r, ida))-\(Vassals.name(r, idb))联盟"); v.founders = .array([JS(ida), JS(idb)]); v.members = .array([JS(ida), JS(idb)])
            v.startedTime = now.clone(); v.joinedTime = JS(-100); v.startedTick = r.clock.tick.clone(); v.endedTick = .null; v.unbreakable = JS(false)
            r.alliances.records.push(v); Vassals.bump(r.alliances)
            notice("\(Vassals.name(r, ida))与\(Vassals.name(r, idb))结成联盟", "双方将在今后的宣战中共同参战；联盟不转移领土。", [ida, idb])
        case (nil, let vb?): join(vb, ida)
        case (let va?, nil): join(va, idb)
        case (let va?, let vb?):
            let members = va.members.asArray.map(\.asString)
            _ = Vassals.dissolve(r, va, actor: ida, force: true)
            for m in members { join(vb, m, record: false) }
            notice("\(va.name.asString)并入\(vb.name.asString)", "合并盟约，保留目标联盟；取消所选两国相对参战的战争，其他战争保留。", vb.members.asArray.map(\.asString))
        }
        afterGlobalOrder()
        return (true, r.chronicle.entries.asArray.last?.text.optionalString ?? "已结盟。")
    }

    /// releaseVassal47 (解除附庸).
    public func releaseVassal(_ index: Int) -> (ok: Bool, reason: String) {
        let r = run
        guard r.world.nations.asArray.indices.contains(index), Vassals.release(r, r.world.nations[index].id.asString) else { return (false, "该国不是附庸。") }
        afterGlobalOrder()
        return (true, r.chronicle.entries.asArray.last?.text.optionalString ?? "已解除附庸。")
    }

    /// makeVassal47 (收为附庸, nativeMakeVassalImmediate): the vassal leaves its alliance and wars
    /// and stops its own foreign wars; states and cities stay.
    public func makeVassal(_ vassal: Int, of overlord: Int) -> (ok: Bool, reason: String) {
        let r = run, nations = r.world.nations.asArray
        guard nations.indices.contains(vassal), nations.indices.contains(overlord) else { return (false, "附庸或宗主为空") }
        let v = nations[vassal].id.asString, o = nations[overlord].id.asString
        if v == o { return (false, "国家不能成为自己的附庸") }
        if !Vassals.alive(r, v) || !Vassals.alive(r, o) { return (false, "附庸或宗主已经灭亡") }
        if Vassals.overlord(r, v) != nil { return (false, "\(nations[vassal].name.asString) 已经是附庸") }
        if Vassals.overlord(r, o) != nil { return (false, "\(nations[overlord].name.asString) 自身是附庸，不能拥有附庸") }
        _ = Vassals.leaveAlliance(r, v, force: true)
        let time = Native.fr(r.life.gameTime.asNumber), day = 1 + Int((Diplomatic.random(r.nativeDiplomacy) * 27).rounded(.down))
        let rec = JS.object()
        rec.vassalId = JS(v); rec.overlordId = JS(o); rec.time = JS(time); rec.tick = r.clock.tick.clone(); rec.tributeRate = JS(Native.fr(0.3)); rec.armyCapMultiplier = JS(0.5)
        rec.updateDay = JS(day); rec.endedTick = .null; rec.endReason = .null
        r.vassals.records.push(rec); Vassals.bump(r.vassals)
        leaveWars(v)
        People.announce(r, kind: "diplomacy", text: "\(nations[vassal].name.asString)成为\(nations[overlord].name.asString)的傀儡国", reason: "附庸关系建立：退出联盟与已有战争，停止自主外战；国家与城市保留。", nations: [v, o], province: nil)
        afterGlobalOrder()
        return (true, r.chronicle.entries.asArray.last?.text.optionalString ?? "已收为附庸。")
    }
    /// leaveWars47: a primary's war ends; a member leaves (its side ends the war when left alone).
    func leaveWars(_ id: String) {
        let r = run, s = r.nativeWars, stateId = Wars.stateNumber(r, id), name = Vassals.name(r, id)
        for c in s.campaigns.asArray where c.endedTick.isNull {
            guard let member = c.participants.asArray.first(where: { $0.stateId.asInt == stateId }), member.side.asInt != 2 else { continue }
            let w = PeaceBridge.war(c)
            if stateId == w.primaryAttackerId || stateId == w.primaryDefenderId { _ = PeaceBridge.settle(r, c, reason: 2); continue }
            let alone = !c.participants.asArray.contains { $0.stateId.asInt != stateId && $0.side.asInt == member.side.asInt }
            let pairs = Wars.opposedPairs(s, c).filter { $0.0 == id || $0.1 == id }
            c.participants = .array(c.participants.asArray.filter { $0.stateId.asInt != stateId })
            let departure = member.clone(); departure.tick = r.clock.tick.clone(); c.coalition.departures.push(departure); Wars.revise(s)
            for (a, b) in pairs {
                if s.campaigns.asArray.contains(where: { $0.endedTick.isNull && Wars.coversPair($0, s, a, b) }) { continue }
                if let rel = r.world.statecraft.relations.asArray.first(where: { [$0.a.asString, $0.b.asString].contains(a) && [$0.a.asString, $0.b.asString].contains(b) }), rel.status.asString == "war" {
                    rel.status = JS("peace"); rel.sinceDay = r.world.day.clone(); rel.truceUntilDay = JS(r.world.day.asNumber + 10)
                }
            }
            Daily.event(r, "diplomacy", "\(name)退出战争", "宗属关系变更后退出参战；原阵营其余国家继续作战。")
            if alone { _ = PeaceBridge.settle(r, c, reason: 2) }
        }
        War26.reconcileForces(r, [])
    }

    /// annexOwned47 (吞并): every province of the target joins the annexer, legal and actual owner;
    /// the target's extinction entry carries the original Destroyed text.
    public func annex(_ target: Int, by annexer: Int) -> (ok: Bool, reason: String) {
        let r = run, nations = r.world.nations.asArray
        guard nations.indices.contains(target), nations.indices.contains(annexer) else { return (false, "选择的国家不存在。") }
        if target == annexer { return (false, "不能吞并自己。") }
        let t = nations[target].id.asString, a = nations[annexer].id.asString
        let changed = r.world.provinces.asArray.filter { $0.controller.asString == t }
        if changed.isEmpty { return (false, "该国已经没有领土。") }
        for p in changed {
            if p.controller.asString != a { PeaceBridge.transferEconomy(r, p.id.asString, p.controller.asString, a) }
            p.controller = JS(a); p.legalOwner = JS(a)
        }
        let moved = Set(changed.map(\.id.asString))
        r.occupation.sieges = .array(r.occupation.sieges.asArray.filter { !moved.contains($0.provinceId.asString) })
        Wars.reconcileCore(r); Naval.reconcileLandOwners(r)
        Government.reconcileContinuity(r)
        let targetName = nations[target].name.asString, annexerName = nations[annexer].name.asString
        if let entry = r.chronicle.entries.asArray.reversed().first(where: { $0.kind.asString == "extinction" && $0.tick.asNumber == r.clock.tick.asNumber && $0.nationIds.asArray.contains { $0.asString == t } }) {
            entry.text = JS("\(targetName)被\(annexerName)灭亡")
            entry.reason = JS("吞并：\(targetName)的\(changed.count)个行省全部并入\(annexerName)，法理与实控同时转移；结束当前任期，人物、家族、城市与历史保留。")
            if let event = r.world.events.asArray.first(where: { $0.id.optionalNumber == entry.sourceEventId.optionalNumber }) { event.text = entry.text.clone(); event.reason = entry.reason.clone() }
        }
        War26.reconcileForces(r, []); Session.finishPoliticalTick(r); Vassals.reconcileVassals(r); DiplomacyBridge.reconcile(r); Daily.reconcileMilitaryClock(r)
        afterGlobalOrder()
        return (true, "\(targetName)被\(annexerName)灭亡")
    }

    /// Original map editor 绘制国家 / 点击扩张 (applyTerritoryEdit47): the provinces go to one state,
    /// legal and actual owner, with the same economy, core, port, siege, capital and extinction
    /// reconciliation as a real occupation.
    public func territoryEdit(_ provinceIndices: [Int], to nation: Int) -> (ok: Bool, reason: String) {
        let r = run, nations = r.world.nations.asArray, provinces = r.world.provinces.asArray
        guard nations.indices.contains(nation) else { return (false, "选择的国家不存在。") }
        guard !provinceIndices.isEmpty, provinceIndices.allSatisfy({ provinces.indices.contains($0) }) else { return (false, "选择的行省不存在。") }
        let id = nations[nation].id.asString
        let changed = provinceIndices.map { provinces[$0] }.filter { $0.controller.asString != id || $0.legalOwner.optionalString != id }
        if changed.isEmpty { return (false, "这些行省已经属于该国。") }
        var losers = [String](); for p in changed where p.controller.asString != id && !losers.contains(p.controller.asString) { losers.append(p.controller.asString) }
        for p in changed {
            if p.controller.asString != id { PeaceBridge.transferEconomy(r, p.id.asString, p.controller.asString, id) }
            p.controller = JS(id); p.legalOwner = JS(id)
        }
        let moved = Set(changed.map(\.id.asString))
        r.occupation.sieges = .array(r.occupation.sieges.asArray.filter { !moved.contains($0.provinceId.asString) })
        Wars.reconcileCore(r); Naval.reconcileLandOwners(r)
        let names = changed.prefix(6).map(\.name.asString).joined(separator: "、") + (changed.count > 6 ? "等" : "")
        People.announce(r, kind: "occupation", text: "地图编辑：\(nations[nation].name.asString)获得\(changed.count)个行省",
                        reason: "暂停时在编辑国家中重新分配领土，法理与实控同时转移；\(names)。", nations: [id] + losers, province: changed[0].id.asString)
        Government.reconcileContinuity(r)
        War26.reconcileForces(r, []); Session.finishPoliticalTick(r); Vassals.reconcileVassals(r); DiplomacyBridge.reconcile(r); Daily.reconcileMilitaryClock(r)
        return (true, "\(changed.count)个行省划入\(nations[nation].name.asString)。")
    }

    /// applyDiplomacy (nation scope): the state's own diplomacy on or off.
    public func setAutoDiplomacy(_ index: Int, enabled: Bool) -> (ok: Bool, reason: String) {
        let r = run, nations = r.world.nations.asArray
        guard nations.indices.contains(index) else { return (false, "国家不存在。") }
        let n = nations[index], id = n.id.asString
        if r.diplomacy.nations[id].optionalBool == enabled { return (false, "该国自动外交没有变化。") }
        let reason = "\(enabled ? "允许" : "禁止")\(n.name.asString)自主外交。"
        var details = ["关闭后该国不自主宣战，但仍会防御，也仍可能被其他国家宣战。", "普通自动议和至少需要一名存活参战国开启自主外交；世界战争期限另行约束。"]
        if !r.diplomacy.worldAuto.isTruthy { details.append("世界自动外交当前关闭，本国开关将在世界开关开启后生效。") }
        Vassals.bump(r.diplomacy)
        r.diplomacy.nations[id] = JS(enabled)
        Daily.event(r, "system", reason, details.joined(separator: " "))
        afterGlobalOrder()
        return (true, reason)
    }
}
