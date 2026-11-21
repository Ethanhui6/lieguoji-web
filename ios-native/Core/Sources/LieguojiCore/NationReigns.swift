import Foundation

/// 国家历代君主 / 皇帝世系与在位国势详录（供国家页面「史册」页签使用）：
/// 汇总每任君主的姓名、尊号、氏族、在位起止年份、四维能力、特质、强势程度评级与分值、
/// 登基/巅峰/退位国土州数与附庸数、当朝都城定位索引，以及在位期间的关键国史大事（均可一键定位地图）。
extension NativeEngine {
    public func nationReigns(_ index: Int) -> Data? {
        let r = run, nations = r.world.nations.asArray
        guard nations.indices.contains(index) else { return nil }
        let n = nations[index], id = n.id.asString, civ = r.civilization.nations[id]
        let culture = civ.cultureId.optionalString ?? ""
        let curPolity = civ.polity.optionalString ?? "Kingdom"
        let curReligion = civ.religionId.optionalString ?? ""
        let curDay = r.world.day.asNumber

        // 计算游戏历法换算函数：day -> 公元/自定义纪年
        let curDate = r.life.currentDate
        let yearOffset = (!r.regimes.isNull && !r.regimes.calendar.isNull) ? (r.regimes.calendar.offset.optionalNumber.map(Int.init) ?? 0) : 0
        let eraName = (!r.regimes.isNull && !r.regimes.calendar.isNull) ? (r.regimes.calendar.era.optionalString ?? "") : ""
        let displayNowYear = curDate.year.asInt + yearOffset
        let dayOfYear = Double(max(1, curDate.month.asInt) - 1) * 30.44 + Double(max(1, curDate.day.asInt) - 1)
        func yearOf(_ day: Double) -> Int {
            displayNowYear + Int(((dayOfYear - (curDay - day)) / 365.25).rounded(.down))
        }

        // 州郡与城池映射，供定位都城与事件发生地
        let provinces = r.world.provinces.asArray
        var pi = [String: Int]()
        for (i, p) in provinces.enumerated() { pi[p.id.asString] = i }
        var cityToProv = [String: Int]()
        var provCityName = [Int: String]()
        for c in r.world.cities.asArray {
            if let pid = c.provinceId.optionalString, let idx = pi[pid] {
                if let cid = c.id.optionalString { cityToProv[cid] = idx }
                if provCityName[idx] == nil { provCityName[idx] = c.name.optionalString ?? provinces[idx].name.asString }
            }
        }
        let currentCapProv: Int = {
            if let cid = n.capitalId.optionalString, let idx = cityToProv[cid] { return idx }
            if let firstOwned = provinces.indices.first(where: { provinces[$0].controller.optionalString == id }) { return firstOwned }
            return -1
        }()
        let currentProvinces = provinces.reduce(0) { $1.controller.optionalString == id ? $0 + 1 : $0 }
        let currentVassals = r.vassals.records.asArray.reduce(0) { ($1.overlordId.optionalString == id && $1.endedTick.isNull) ? $0 + 1 : $0 }
        let totalWorldProvinces = max(1, provinces.count)

        // 收集该国相关的大事记条目，按日期归属到每一任君主
        let nationEntries = r.chronicle.entries.asArray.filter { e in
            !e.nationIds.isNull && e.nationIds.asArray.contains { $0.asString == id }
        }

        let leaders = r.chronicle.leaders[id].isNull ? [] : r.chronicle.leaders[id].asArray
        let outReigns = JS.array()
        var peakAcrossHistory = max(1, currentProvinces)
        var strongestOrder = 0
        var strongestScore = -1.0

        for (idx, reign) in leaders.enumerated() {
            let rid = reign.id.optionalString ?? "ruler-\(id)-\(idx + 1)"
            let order = reign.order.optionalNumber.map(Int.init) ?? (idx + 1)
            let active = reign.endedDay.isNull
            let startDay = reign.ascendedDay.optionalNumber ?? 0
            let endDay = active ? curDay : (reign.endedDay.optionalNumber ?? curDay)
            let reignYears = max(0.0, (endDay - startDay) / 365.25)

            // 关联真实人物档案（能力、特质、生死、年龄、家族）
            let pid = r.sovereignty.reigns[rid].optionalNumber.map(Int.init) ?? -1
            let person = pid > 0 ? People.person(r, pid) : nil
            let rulerCard = r.civilization.rulers[rid]
            let isFemale = (person?.gender.optionalNumber ?? rulerCard.gender.optionalNumber ?? 0) == 1
            let alive = person?.isAlive.asBool ?? active

            let displayName: String = {
                if let p = person { return Self.displayPersonName(p) }
                if let nm = reign.name.optionalString, !nm.isEmpty { return nm }
                return rulerCard.name.optionalString ?? "无名"
            }()
            let houseRaw = person?.lastName.optionalString ?? reign.family.optionalString ?? rulerCard.house.optionalString ?? ""
            let house = NamingCatalog.cleanSurname(houseRaw)
            let familyId = person?.familyId.optionalNumber.map(Int.init) ?? -1

            // 尊号（依据在位时的政体/文化/性别）
            let row = r.reigns47.isNull ? JS.null : r.reigns47[rid]
            let reignPolity = row.polity.optionalString ?? rulerCard.polityAtAccession.optionalString ?? curPolity
            let baseTitle: String = {
                if active, !r.regimes.isNull, let t = Regimes.seats(r, id).head ?? Regimes.style(r, id).title { return t }
                if let t = rulerCard.titleAtAccession.optionalString, !t.isEmpty { return t }
                return People.rulerTitle(culture: culture, polity: reignPolity, religion: curReligion, gender: isFemale ? 1 : 0)
            }()
            let title = isFemale ? (Self.femaleTitles[baseTitle] ?? baseTitle) : baseTitle

            // 能力与特质
            var skillsArr: [Double] = [50, 50, 50, 50]
            var traitNames: [String] = []
            if let p = person {
                let s = People.skills(p)
                skillsArr = [s.charisma.rounded(), s.military.rounded(), s.diplomatic.rounded(), s.administrative.rounded()]
                if !p.traits.isNull {
                    traitNames = p.traits.asArray.compactMap(\.optionalString).map { Self.traitLabels[$0] ?? $0 }
                }
            }
            let avgSkill = skillsArr.reduce(0, +) / 4.0

            // 疆域规模与巅峰
            let startProvs = row.start[0].optionalNumber.map(Int.init) ?? (active ? currentProvinces : 0)
            let startVassals = row.start[1].optionalNumber.map(Int.init) ?? 0
            let endProvs = active ? currentProvinces : (row.end[0].optionalNumber.map(Int.init) ?? startProvs)
            let endVassals = active ? currentVassals : (row.end[1].optionalNumber.map(Int.init) ?? startVassals)
            let recordedPeak = row.peak.optionalNumber.map(Int.init) ?? max(startProvs, endProvs)
            let peakProvs = max(recordedPeak, max(startProvs, endProvs))
            let deltaProvs = endProvs - startProvs
            peakAcrossHistory = max(peakAcrossHistory, peakProvs)

            // 强势程度综合评分（0…100）：能力(42%) + 疆域规模占比(28%) + 拓土功业(20%) + 附庸与在位稳固度(10%)
            let skillScore = min(42.0, max(0.0, avgSkill / 100.0 * 42.0))
            let realmShare = Double(peakProvs) / Double(totalWorldProvinces)
            let sizeScore = min(28.0, realmShare * 115.0 + min(12.0, Double(peakProvs) * 0.6))
            let expansionScore = min(20.0, max(-12.0, Double(deltaProvs) * 2.2 + Double(max(0, peakProvs - startProvs)) * 0.8))
            let reignScore = min(10.0, Double(max(endVassals, startVassals)) * 2.8 + min(6.0, reignYears * 0.25))
            let powerScore = min(100.0, max(5.0, (skillScore + sizeScore + max(0.0, 6.0 + expansionScore * 0.7) + reignScore).rounded()))

            let powerRank: String = {
                if powerScore >= 84 || (deltaProvs >= 6 && avgSkill >= 62) { return "盖世雄主" }
                if powerScore >= 72 || (deltaProvs >= 3 && avgSkill >= 55) { return "一代明君" }
                if deltaProvs >= 2 && startProvs <= 6 { return "中兴之主" }
                if powerScore >= 58 { return "守成之君" }
                if powerScore >= 42 { return "平庸之主" }
                return deltaProvs <= -3 ? "丧土之君" : "失政之君"
            }()

            let powerSummary: String = {
                var segs = [String]()
                if deltaProvs > 0 { segs.append("拓土 +\(deltaProvs) 州") }
                else if deltaProvs < 0 { segs.append("失地 \(deltaProvs) 州") }
                else { segs.append("守土 \(endProvs) 州") }
                if peakProvs > max(startProvs, endProvs) { segs.append("巅峰 \(peakProvs) 州") }
                if max(endVassals, startVassals) > 0 { segs.append("附庸 \(max(endVassals, startVassals)) 国") }
                if reignYears >= 1 { segs.append("在位 \(Int(reignYears.rounded())) 年") }
                else { segs.append("在位 \(max(1, Int((endDay - startDay) / 30))) 月") }
                return segs.joined(separator: " · ")
            }()

            if powerScore > strongestScore {
                strongestScore = powerScore
                strongestOrder = order
            }

            // 定位都城：优先该任记录的都城州，否则取在位大事发生州，最后回退当前都城
            var capProv = row.capital.optionalString.flatMap { pi[$0] } ?? -1
            let reignEvents = nationEntries.filter { e in
                let d = e.day.optionalNumber ?? 0
                return d >= startDay - 0.5 && (active || d <= endDay + 0.5)
            }
            if capProv < 0 {
                capProv = reignEvents.compactMap { $0.provinceId.optionalString.flatMap { pi[$0] } }.first ?? currentCapProv
            }
            let capName: String = {
                if capProv >= 0, provinces.indices.contains(capProv) {
                    return provCityName[capProv] ?? provinces[capProv].name.asString
                }
                return ""
            }()

            // 提炼本任期至多 8 条重要事件（优先战争/疆域/政变/制度/复国/迁都，均可定位）
            let keyEvents = reignEvents.reversed().prefix(8).map { e -> JS in
                let ev = JS.object()
                ev.day = e.day; ev.year = JS(yearOf(e.day.optionalNumber ?? startDay))
                ev.text = e.text; ev.kind = e.kind
                if let reason = e.reason.optionalString, !reason.isEmpty { ev.reason = JS(reason) }
                if let pStr = e.provinceId.optionalString, let pIdx = pi[pStr] { ev.province = JS(pIdx) }
                else if capProv >= 0 { ev.province = JS(capProv) }
                return ev
            }

            let item = JS.object()
            item.order = JS(order)
            item.id = JS(rid)
            item.name = JS(displayName)
            item.title = JS(title)
            item.house = JS(house.isEmpty ? "无" : NamingCatalog.houseLabel(house))
            item.familyId = JS(familyId)
            item.personId = JS(pid)
            item.stateName = JS(row.stateName.optionalString ?? n.name.asString)
            item.polity = JS(Regimes.titles[reignPolity] ?? reignPolity)
            item.ascendedDay = JS(Int(startDay))
            item.endedDay = active ? .null : JS(Int(endDay))
            item.ascendedYear = JS(yearOf(startDay))
            item.endedYear = active ? .null : JS(yearOf(endDay))
            item.reignYears = JS((reignYears * 10).rounded() / 10)
            item.active = JS(active)
            item.alive = JS(alive)
            item.female = JS(isFemale)
            item.startProvinces = JS(startProvs)
            item.endProvinces = JS(endProvs)
            item.peakProvinces = JS(peakProvs)
            item.deltaProvinces = JS(deltaProvs)
            item.startVassals = JS(startVassals)
            item.endVassals = JS(endVassals)
            item.skills = .array(skillsArr.map { JS($0) })
            item.traits = .array(traitNames.map { JS($0) })
            item.powerScore = JS(powerScore)
            item.powerRank = JS(powerRank)
            item.powerSummary = JS(powerSummary)
            item.capitalProvince = JS(capProv)
            item.capitalName = JS(capName)
            item.events = .array(Array(keyEvents))
            outReigns.push(item)
        }

        let summary = JS.object()
        summary.nationName = n.name
        summary.era = JS(eraName.isEmpty ? "公元" : eraName)
        summary.totalReigns = JS(leaders.count)
        summary.peakProvinces = JS(peakAcrossHistory)
        summary.currentProvinces = JS(currentProvinces)
        summary.strongestOrder = JS(strongestOrder)
        summary.capitalProvince = JS(currentCapProv)
        summary.reigns = outReigns
        return Data(summary.json.utf8)
    }
}
