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
        let civLoc = r.civilization.nations[id]
        let styleLoc = r.regimes.isNull ? nil : Regimes.style(r, id).id
        let lexLoc = LocalizationEngine.lexicon(culture: civLoc.cultureId.optionalString, polity: civLoc.polity.optionalString, style: styleLoc)
        let fiefAllowed = prof.fiefRule.allowsFiefs
        let govPerson = Regimes.governor(r, id)
        let govFamilyId = govPerson?.familyId.asInt ?? 0
        c.fiefRule = JS(lexLoc.fiefRuleLabel)
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
            let histLabel = (!r.regimes.isNull && !r.regimes.historicalScenarioId.isNull) ? (kFam.label.optionalString ?? "") : ""
            let fidInt = Int(key) ?? -1
            let isRuling = fidInt == ruling
            let imperialNoSurname = isRuling && isJPImperialRuler
            let displayHouseName: String = {
                if !histLabel.isEmpty { return histLabel }
                if imperialNoSurname { return "日本皇室" }
                return NamingCatalog.houseLabel(surname)
            }()
            e.name = JS(displayHouseName)
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
            if let foe = foes.min(by: { $0.rel < $1.rel }) {
                let foeFam = r.kin.families[foe.k]
                let foeLabel = (!r.regimes.isNull && !r.regimes.historicalScenarioId.isNull) ? (foeFam.label.optionalString ?? "") : ""
                if !foeLabel.isEmpty {
                    e.rival = JS(foeLabel)
                } else if let foeSurname = foeFam.surname.optionalString {
                    e.rival = JS(NamingCatalog.houseLabel(foeSurname))
                }
            }
            return e
        })
        c.aiAutoGovern = JS(Regimes.isAutoGoverned(r, id))
        c.aiProfile = SovereignAI.profileJS(r, nationId: id)
        c.aiCourtLog = SovereignAI.courtLogJS(r, nationId: id, limit: 16)
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
            // 真实历史年号、世数、尊号与无姓氏日本天皇展示 + 在位特质实际加成汇总（纯只读查询，绝不修改引擎存档状态）
            if UnitKinds.enabled && !r.regimes.isNull && r.regimes.enabled.isTruthy {
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
                var effectiveTitle = title
                if let p = Regimes.premier(r, id) {
                    if let ht = p.historicalTitle.optionalString, !ht.isEmpty, ht.count <= 10 {
                        effectiveTitle = ht
                    }
                    h.premierName = JS(Regimes.personName(p))
                    h.premierId = JS(p.id.asInt)
                    if p.familyId.asInt > 0 { h.premierHouseId = JS(String(p.familyId.asInt)) }
                }
                h.premierTitle = JS(effectiveTitle); h.premierRules = JS(seat.premierRules); h.elected = JS(seat.elected)
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
            let lex = LocalizationEngine.lexicon(culture: civ.cultureId.optionalString, polity: civ.polity.optionalString, style: st.id)
            let outlook = Regimes.coupOutlook(r, id)
            let pd = JS.object()
            pd.camp = JS(prof.camp.rawValue)
            pd.fiefRule = JS(lex.fiefRuleLabel)
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
            // v10.0.0：真实王权等级与主权形态标定（区隔虚君立宪、幕府/摄政架空、二元皇权、封建领主与集权君主）
            let royalInfo: (level: Int, label: String)? = {
                switch st.id {
                case "constitutional", "union":
                    return (22, "虚君立宪 · 象征王权")
                case "shogunate":
                    return (28, "天皇垂拱 · 幕府掌兵")
                case "regency":
                    return (34, "名义王室 · 摄政代治")
                case "elective":
                    return (52, "选侯王权 · 贵族制衡")
                case "feudal", "principality", "archduchy", "margraviate":
                    return (60, "封建领主王权")
                case "dualMonarchy":
                    return (70, "二元皇权 · 君相共治")
                case "absolute", "empire", "dynasty", "tsardom", "sultanate", "emirate", "pharaonic":
                    return (90, "集权君主王权")
                case "despotism":
                    return (96, "极权专制皇权")
                default:
                    return nil
                }
            }()
            if let ri = royalInfo {
                let stabAdj = max(-10, min(8, (outlook.stability - 55) / 5))
                pd.royalAuthority = JS(max(10, min(100, ri.level + stabAdj)))
                pd.royalAuthorityLabel = JS(ri.label)
            }
            pd.transitions = .array(Regimes.availableTransitions(r, id).map { tr in
                let x = JS.object()
                x.id = JS(tr.id); x.title = JS(tr.title); x.subtitle = JS(tr.subtitle)
                x.targetStyle = JS(tr.targetStyle); x.dramatic = JS(tr.dramatic)
                return x
            })
            o.polityDetail = pd
            // 当前国家智能战略预设与自动统筹开关（支持全图列国统一委托 + 单国手动接管）
            let nb = r.regimes.nations[id]
            o.strategy = (!nb.isNull ? nb.strategy.optionalString : nil).map { JS($0) } ?? JS("")
            o.autoStrategy = JS(Regimes.isAutoGoverned(r, id))
            o.globalAutoGovern = JS(Regimes.globalAutoGovern(r))
            let nowDayInfo = r.world.day.asInt
            let stratUntil = (!nb.isNull ? nb.strategyCooldownUntil.optionalNumber.map(Int.init) : nil) ?? 0
            o.strategyCooldown = JS(max(0, stratUntil - nowDayInfo))
            let qKeyInfo = nowDayInfo / 90
            let qUsedInfo = (!nb.isNull && nb.edictQuarterKey.optionalNumber.map(Int.init) == qKeyInfo)
                ? (nb.edictQuarterUsed.optionalNumber.map(Int.init) ?? 0) : 0
            o.edictQuotaUsed = JS(qUsedInfo)
            o.edictQuotaMax = JS(2)
            o.centralization = JS((!nb.isNull ? nb.centralization.optionalString : nil) ?? "balanced")
            let centUntil = (!nb.isNull ? nb.centralCooldownUntil.optionalNumber.map(Int.init) : nil) ?? 0
            o.centralCooldown = JS(max(0, centUntil - nowDayInfo))
            let refUntil = (!nb.isNull ? nb.reformCooldownUntil.optionalNumber.map(Int.init) : nil) ?? 0
            o.reformCooldown = JS(max(0, refUntil - nowDayInfo))
            o.autoDecide = JS((!nb.isNull && nb.autoDecideSet.isTruthy) ? nb.autoDecide.isTruthy : Regimes.isAutoGoverned(r, id))
            let cdMap = JS.object()
            if !nb.isNull, !nb.decreeCooldowns.isNull {
                for (k, v) in nb.decreeCooldowns.objectEntries {
                    let rem = max(0, Int((v.optionalNumber ?? 0).rounded()) - nowDayInfo)
                    if rem > 0 { cdMap[k] = JS(rem) }
                }
            }
            o.decreeCooldowns = cdMap
            o.taxPolicy = JS(Finance.policy(r, id).key)
            o.grand = GrandSystems.summary(r, nationId: id)
            let heldIndep = Regimes.heldReforms(r, id).filter { Regimes.independentReformIds.contains($0.id) }.count
            o.reformSlotsUsed = JS(heldIndep)
            o.reformSlotsMax = JS(Regimes.maxIndependentReforms(r, id))
            // 君主治乱评级与疆域行政负荷（供概览页直显明君/昏君与大国过扩/小邦精治实效）
            let rEval = Regimes.rulerAssessment(r, id)
            let rObj = JS.object()
            rObj.tier = JS(rEval.tier); rObj.label = JS(rEval.label); rObj.summary = JS(rEval.summary)
            o.rulerEval = rObj
            let strain = Regimes.realmStrain(r, id)
            let sObj = JS.object()
            sObj.level = JS(strain.level); sObj.label = JS(strain.label); sObj.summary = JS(strain.summary)
            o.realmStrain = sObj
            // v5.2.0 君主与将领军事谋略（实时影响军队 AI 智商）
            let iq = Regimes.tacticalIQ(r, nation: id)
            let iqObj = JS.object()
            iqObj.score = JS(iq.score); iqObj.tier = JS(iq.tier); iqObj.label = JS(iq.label)
            iqObj.summary = JS(iq.summary); iqObj.commanderName = JS(iq.commanderName)
            iqObj.commanderMilitary = JS(iq.commanderMilitary); iqObj.rulerMilitary = JS(iq.rulerMilitary)
            o.tacticalIQ = iqObj
            // 文明文化学说与圣地实效
            let doc = CultureDoctrines.of(civ.cultureId.optionalString)
            let docObj = JS.object()
            docObj.title = JS(doc.title)
            docObj.summary = JS(doc.summary)
            docObj.effectLine = JS(doc.effectLine)
            o.cultureDoctrine = docObj
            o.holdsHolySite = JS(Regimes.holdsHolySite(r, id))
            // 海运运力与制海权实时概览
            let stInfo = JS.object()
            let blk = Naval.blockade(r, id)
            let unblocked = MaritimeWarfare.unblockedFriendlyPortIndices(r, nation: id).count
            let seaCap = MaritimeWarfare.seaTransportCapacity(r, nation: id)
            let seaUsed = MaritimeWarfare.activeSeaTransports(r, nation: id)
            let seaCtrl = SeaDominion.seaControl(r, nation: id)
            stInfo.used = JS(seaUsed)
            stInfo.capacity = JS(seaCap)
            stInfo.totalPorts = JS(blk.ports)
            stInfo.blockadedPorts = JS(blk.held)
            stInfo.unblockedPorts = JS(unblocked)
            stInfo.controlScore = JS(seaCtrl.score)
            stInfo.controlLabel = JS(seaCtrl.label)
            stInfo.tradeBonusPct = JS(seaCtrl.tradeBonusPct)
            o.seaTransport = stInfo
            // v4.2.2 外交国际信誉度
            let repVal = WorldDepth.reputation(r, nation: id)
            let repObj = JS.object()
            repObj.score = JS(repVal)
            repObj.label = JS(WorldDepth.reputationLabel(repVal))
            repObj.opinionMod = JS(WorldDepth.reputationOpinionModifier(r, of: id))
            o.reputation = repObj
            // v4.2.2 四线时代科技演进
            o.tech = .array(WorldDepth.TechBranch.allCases.map { b in
                let lvl = WorldDepth.techLevel(r, nation: id, branch: b)
                let prog = WorldDepth.techProgress(r, nation: id, branch: b)
                let row = JS.object()
                row.id = JS(b.rawValue)
                row.label = JS(b.label)
                row.short = JS(b.short)
                row.level = JS(lvl)
                row.progress = JS(prog)
                row.tierName = JS(b.tierName(lvl))
                row.effect = JS(b.perLevelEffect)
                row.investCost = JS(150 + lvl * 70)
                return row
            })
            // v4.2.2 当前待裁决的多阶段因果事件链
            if let ch = WorldDepth.activeChain(r, nationId: id) {
                let cObj = JS.object()
                cObj.id = JS(ch.id); cObj.title = JS(ch.title); cObj.category = JS(ch.category); cObj.desc = JS(ch.desc)
                cObj.choices = .array(ch.choices.map { opt in
                    let co = JS.object()
                    co.id = JS(opt.id); co.label = JS(opt.label); co.tag = JS(opt.tag); co.detail = JS(opt.detail)
                    return co
                })
                o.activeChain = cObj
            }
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
            // ① 全政体动态四方权力天平（按文化 × 政体完全切换称谓，共和零帝制词汇）
            let cp = JS.object()
            let ldrPerson = !leaderId.isNull ? People.person(r, leaderId.asInt) : nil
            let ldrAge: Double = ldrPerson?.age.optionalNumber ?? 30
            let sk = ldrPerson.map(People.skills)
            let skAdmin: Double = sk?.administrative ?? 50
            let skCharisma: Double = sk?.charisma ?? 50
            let skMilitary: Double = sk?.military ?? 50
            let skDiplomatic: Double = sk?.diplomatic ?? 50
            let curDestiny: Double = r.destiny.nations[id].destiny.optionalNumber ?? 50
            var rawCrown: Double = 28.0 + (skAdmin + skCharisma) * 0.28 + curDestiny * 0.22
            if ldrAge < 16 && !lex.isRepublican { rawCrown *= 0.42 }
            let allHouses = r.nobility.isNull || r.nobility.families.isNull ? [] : r.nobility.families.objectEntries.filter { $0.1.nationId.optionalString == id }
            let rulingFam = People.rulingFamilyId(r, id)
            let houseInf: Double = allHouses.reduce(0.0) { sum, entry in
                let inf = entry.1.influence.optionalNumber ?? 0
                return (Int(entry.0) == rulingFam) ? sum + inf * 0.15 : sum + inf * 0.22
            }
            var rawHouses: Double = (prof.fiefRule.allowsFiefs ? 18.0 : 14.0) + min(65.0, houseInf * 0.25)
            if (prof.fiefRule == .regent || ldrAge < 16) && !lex.isRepublican { rawHouses += 24.0 }
            let activeArmies = r.world.armies.asArray.filter { $0.nationId.optionalString == id && $0.troops.asNumber > 0 && $0.status.asString != "destroyed" }.count
            let activeWars = Wars.activeCampaignCount(r, for: id)
            var rawMilitary: Double = 14.0 + Double(activeArmies) * 3.5 + Double(activeWars) * 14.0 + skMilitary * 0.18
            if st.id == "junta" || st.id == "fascist" || st.id == "nazi" || st.id == "shogunate" { rawMilitary += 28.0 }
            let hasParties = !r.regimes.nations[id].parties.isNull && r.regimes.nations[id].parties.length > 0
            var rawCouncil: Double = (hasParties ? 32.0 : 16.0) + Offices.governance(r, id) * 24.0 + skDiplomatic * 0.15
            if prof.camp == .republic || prof.camp == .constitutional || prof.camp == .socialist { rawCouncil += 22.0 }
            let bias = r.regimes.nations[id].powerBias.optionalString ?? ""
            if bias == "crown" { rawCrown += 26 }
            else if bias == "houses" { rawHouses += 26 }
            else if bias == "military" { rawMilitary += 26 }
            else if bias == "council" { rawCouncil += 26 }
            let sumRaw: Double = max(1.0, rawCrown + rawHouses + rawMilitary + rawCouncil)
            let pCrown = max(5, Int((rawCrown / sumRaw * 100.0).rounded()))
            let pHouses = max(5, Int((rawHouses / sumRaw * 100.0).rounded()))
            let pMilitary = max(5, Int((rawMilitary / sumRaw * 100.0).rounded()))
            let pCouncil = max(5, 100 - pCrown - pHouses - pMilitary)
            cp.crown = JS(pCrown); cp.houses = JS(pHouses); cp.military = JS(pMilitary); cp.council = JS(pCouncil)
            cp.title = JS(lex.powerBalanceTitle)
            cp.pillars = .array(lex.pillarShort.map { JS($0) })
            let pctArr = [pCrown, pHouses, pMilitary, pCouncil]
            var domIdx = 0
            for idx in 1..<4 { if pctArr[idx] > pctArr[domIdx] { domIdx = idx } }
            cp.dominant = JS(lex.pillarFull[domIdx])
            cp.effect = JS(lex.pillarEffects[domIdx])
            if pctArr[domIdx] >= 58 {
                cp.imbalance = JS("失衡预警：\(lex.pillarFull[domIdx])权重高达 \(pctArr[domIdx])%，持续放任可能触发派系危机或政体动荡。")
            }
            if ldrAge < 16 && !lex.isRepublican {
                let regentName = Regimes.governor(r, id).map(Self.displayPersonName) ?? (o.heads.isNull ? lex.deputyTitle : (o.heads.premierName.optionalString ?? lex.deputyTitle))
                cp.regency = JS("冲龄幼主（\(Int(ldrAge))岁）· 由\(regentName)摄政辅国（满16岁亲政或面临权臣博弈）")
            }
            o.courtPower = cp

            // ② 当期多分支政治议案（严格 180 日议期冷却防无限点击 + 按政体/战况/财税动态生成 4 条差异路线）
            let ag = JS.object()
            let nowDay = r.world.day.asInt
            let cdUntil = r.regimes.nations[id].agendaCooldownUntil.optionalNumber.map(Int.init) ?? 0
            let remDays = max(0, cdUntil - nowDay)
            let shockPct = Int((Regimes.defeatPenalty(r, id) * 100).rounded())
            let curGold = r.finance.nations[id].gold.optionalNumber ?? 0
            let curCorrupt = Finance.corruption(r, id)
            let isRep = lex.isRepublican
            let p0 = lex.pillarFull[0], p1 = lex.pillarFull[1], p2 = lex.pillarFull[2], p3 = lex.pillarFull[3]

            func makeChoice(_ cid: String, _ label: String, _ tag: String, _ detail: String, _ tone: String) -> JS {
                let x = JS.object()
                x.id = JS(cid); x.label = JS(label); x.tag = JS(tag); x.detail = JS(detail); x.tone = JS(tone)
                return x
            }

            let topic: String
            if shockPct >= 5 { topic = "accountability" }
            else if pctArr[domIdx] >= 55 { topic = "imbalance" }
            else if activeWars > 0 { topic = "wartax" }
            else if curCorrupt >= 32 || curGold < 260 { topic = "fiscal" }
            else if pHouses >= 32 { topic = "curbhouses" }
            else { topic = "civil" }

            ag.id = JS("agenda:\(topic):force")
            ag.tag = JS(lex.agendaTag)
            ag.cooldownDays = JS(remDays)
            if remDays > 0 {
                ag.resolvedTitle = JS(r.regimes.nations[id].agendaLastTitle.optionalString ?? "本期\(lex.agendaTag)")
                ag.resolvedOutcome = JS(r.regimes.nations[id].agendaLastOutcome.optionalString ?? "已完成表决，需待下届议期方可再议。")
            }

            switch topic {
            case "accountability":
                ag.title = JS(isRep ? "《国防听证与军备重整法案》" : "《战后问责与整军复仇案》")
                ag.desc = JS("新败割地之后朝野震动（震荡 −\(shockPct)%），\(p2)与各方呼吁彻查失利责任并抚恤重整防务。")
                ag.support = JS("\(p2) · \(p0)")
                ag.oppose = JS("\(p3)")
                ag.effect = JS("三线择一：强力整肃 / 妥协抚恤 / 军方让利")
                ag.choices = .array([
                    makeChoice("agenda:accountability:force", lex.forceActionLabel, "强硬追责", "立即平息战败震荡 · 全军士气 +25 · 耗 180 金 · 安定微降", "force"),
                    makeChoice("agenda:accountability:compromise", lex.compromiseActionLabel, "温和重整", "战败震荡减半 · 士气 +14 · 国运 +4 · 政局回稳", "compromise"),
                    makeChoice("agenda:accountability:bargain", "授军方扩编特权", "派系交换", "偏向\(p2) · 消除震荡且免费补充全军粮草 · 军权上升", "bargain"),
                    makeChoice("agenda:accountability:table", "暂缓休会", "冷静 90 日", "平息争端 · 腐化 −3 · 90 日后重开议期", "table"),
                ])
            case "imbalance":
                ag.title = JS(isRep ? "《宪政制衡与权力纠偏法案》" : "《整肃纲纪与制衡权势案》")
                ag.desc = JS("\(lex.pillarFull[domIdx])当前独占 \(pctArr[domIdx])% 权重，若放任失衡将危及国家稳定与既定国体。")
                ag.support = JS("\(p0) · \(p3)")
                ag.oppose = JS("\(lex.pillarFull[domIdx])")
                ag.effect = JS("回调权力天平 · 防止政变或寡头架空")
                ag.choices = .array([
                    makeChoice("agenda:imbalance:force", lex.forceActionLabel, "铁腕削权", "重置天平倾斜 · 腐化 −10 · 国运 +5 · 耗 220 金", "force"),
                    makeChoice("agenda:imbalance:compromise", lex.compromiseActionLabel, "分权协定", "温和调衡 · 安定度显著提升 · 国运 +4", "compromise"),
                    makeChoice("agenda:imbalance:bargain", "以财税换取退让", "利益赎买", "耗 320 金安抚强势派系 · 消除失衡风险且腐化 −5", "bargain"),
                    makeChoice("agenda:imbalance:table", "维持现状", "观望 90 日", "暂不干预 · 留存政费 +120 金", "table"),
                ])
            case "wartax":
                ag.title = JS(isRep ? "《战时国防特别预算与债券法案》" : "《战时急征军饷与前线犒师案》")
                ag.desc = JS(isRep ? "前线战事吃紧，内阁与国防部提请国会批准战时特别军费与债券筹款，保障三军补给。" : "前线兵戈正急，中枢提请开征战时特饷并调拨粮秣，充作前线将士军需。")
                ag.support = JS("\(p2) · \(p0)")
                ag.oppose = JS("\(p1)")
                ag.effect = JS("战时筹饷与后勤补给 · 每次议期仅可决断一次")
                ag.choices = .array([
                    makeChoice("agenda:wartax:force", lex.forceActionLabel, "全额特饷", "国库 +380 金 · 全军粮草补满 · 士气 +18 · 腐化 +4、国运 −2", "force"),
                    makeChoice("agenda:wartax:compromise", lex.compromiseActionLabel, "折中军债", "国库 +220 金 · 全军士气 +12 · 安定无损且国运 +2", "compromise"),
                    makeChoice("agenda:wartax:bargain", isRep ? "让渡商税换债券" : "赐爵换取豪门捐饷", "派系筹款", "偏向\(p1) · 国库 +520 金 · 军粮满额", "bargain"),
                    makeChoice("agenda:wartax:table", "严控军费休会", "节流 90 日", "不加新税 · 民心回升 · 腐化 −4 · 国运 +3", "table"),
                ])
            case "fiscal":
                ag.title = JS(isRep ? "《联邦审计反腐与税制改革法案》" : "《整顿盐铁与清查亏空案》")
                ag.desc = JS("当前财税承压或腐化偏高（腐化 \(Int(curCorrupt))），财政部门呼吁彻查漏税与冗余开支。")
                ag.support = JS("\(p3) · \(p0)")
                ag.oppose = JS("\(p1)")
                ag.effect = JS("开源节流 · 肃清贪墨与充实国库")
                ag.choices = .array([
                    makeChoice("agenda:fiscal:force", lex.forceActionLabel, "雷霆查账", "腐化 −14 · 国库 +320 金 · 国运 −1", "force"),
                    makeChoice("agenda:fiscal:compromise", lex.compromiseActionLabel, "渐进税改", "腐化 −8 · 国库 +180 金 · 国运 +3", "compromise"),
                    makeChoice("agenda:fiscal:bargain", "特许专卖筹款", "以权换钱", "偏向\(p1) · 国库 +460 金 · 腐化 +3", "bargain"),
                    makeChoice("agenda:fiscal:table", "延后审计", "休会 90 日", "避免剧烈震荡 · 安定度微升", "table"),
                ])
            case "curbhouses":
                ag.title = JS(isRep ? "《反垄断拆分财团与选举透明法案》" : "《清丈勋贵田庄与抑豪强案》")
                ag.desc = JS(isRep ? "\(p1)影响力膨胀（占天平 \(pHouses)%），议会呼吁推动反垄断法案与政治献金透明化。" : "\(p1)权势日炽（占天平 \(pHouses)%），中枢奏请清丈隐田、收权归公。")
                ag.support = JS("\(p0) · \(p3)")
                ag.oppose = JS("\(p1)")
                ag.effect = JS("遏制寡头门阀坐大 · 增加公库与清廉度")
                ag.choices = .array([
                    makeChoice("agenda:curbhouses:force", lex.forceActionLabel, "强力抑强", "\(lex.houseUnitLabel)权重 −30 · 国库 +340 金 · 腐化 −8", "force"),
                    makeChoice("agenda:curbhouses:compromise", lex.compromiseActionLabel, "协商纳税", "权重 −15 · 国库 +200 金 · 腐化 −5 · 国运 +3", "compromise"),
                    makeChoice("agenda:curbhouses:bargain", "纳入内阁共治", "招安合作", "偏向\(p1) · 消除离心危机 · 国运 +4", "bargain"),
                    makeChoice("agenda:curbhouses:table", "暂缓动议", "休会 90 日", "缓和内部对立 · 90 日后再议", "table"),
                ])
            default:
                ag.title = JS(isRep ? "《国民教育普及与基建振兴法案》" : "《开科取士与劝农兴学案》")
                ag.desc = JS(isRep ? "国内承平，内阁与议会提议加大公立教育与基础建设投入，培育人才并提振人口增长。" : "四境暂安，中枢提请广开官学、选拔良才并劝课农桑以固国本。")
                ag.support = JS("\(p3) · \(p0)")
                ag.oppose = JS("\(p1)")
                ag.effect = JS("全境增丁 · 降腐化 · 提升国运与长远国力")
                ag.choices = .array([
                    makeChoice("agenda:civil:force", lex.forceActionLabel, "全力兴办", "耗 160 金 · 全境人口 +3% · 腐化 −6 · 国运 +6", "force"),
                    makeChoice("agenda:civil:compromise", lex.compromiseActionLabel, "稳健推进", "全境人口 +2% · 腐化 −4 · 国运 +4", "compromise"),
                    makeChoice("agenda:civil:bargain", isRep ? "公私合营募资" : "令地方大族捐学", "筹资兴学", "偏向\(p1) · 免耗国库且人口 +2%、存粮 +15%", "bargain"),
                    makeChoice("agenda:civil:table", "留存国帑", "休会 90 日", "国库 +140 金 · 休养生息", "table"),
                ])
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
        let curEra = HistoricalEra.current(r)
        o.historicalEra = JS(curEra.rawValue)
        let eraReforms = Regimes.reforms(for: curEra)
        o.reforms = .array(eraReforms.map { f in let x = JS.object(); x.id = JS(f.id); x.name = JS(f.name); x.text = JS(f.text); x.on = JS(held.contains(f.id)); return x })
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
