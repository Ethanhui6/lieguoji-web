import Foundation

/// 国家历代君主 / 皇帝世系与在位国势详录（供国家页面「史册」页签使用）：
/// 汇总每任君主的姓名、尊号、氏族、在位起止年份、四维能力、特质、强势程度评级与分值、
/// 登基/巅峰/退位国土州数与附庸数、当朝都城定位索引，以及在位期间的关键国史大事（均可一键定位地图）。
extension NativeEngine {
    public func nationReigns(_ index: Int) -> Data? {
        let r = run, nations = r.world.nations.isArray ? r.world.nations.asArray : []
        guard nations.indices.contains(index) else { return nil }
        let n = nations[index]
        guard let id = n.id.optionalString, !id.isEmpty else { return nil }
        let civ = r.civilization.isNull || r.civilization.nations.isNull ? JS.null : r.civilization.nations[id]
        let culture = civ.cultureId.optionalString ?? ""
        let curPolity = civ.polity.optionalString ?? "Kingdom"
        let curReligion = civ.religionId.optionalString ?? ""
        let rawCurDay = r.world.day.optionalNumber ?? 0
        let curDay = rawCurDay.isFinite ? rawCurDay : 0

        // 计算游戏历法换算函数：day -> 公元/自定义纪年（全面防御 null / NaN，杜绝史册页闪退）
        let curDate = (r.life.isNull || r.life.currentDate.isNull) ? JS.null : r.life.currentDate
        let yearOffset = (!r.regimes.isNull && !r.regimes.calendar.isNull) ? (r.regimes.calendar.offset.optionalNumber.flatMap { $0.isFinite ? Int($0) : nil } ?? 0) : 0
        let eraName = (!r.regimes.isNull && !r.regimes.calendar.isNull) ? (r.regimes.calendar.era.optionalString ?? "") : ""
        let baseYear = curDate.year.optionalNumber.flatMap { $0.isFinite ? Int($0) : nil } ?? 1
        let baseMonth = curDate.month.optionalNumber.flatMap { $0.isFinite ? Int($0) : nil } ?? 1
        let baseDay = curDate.day.optionalNumber.flatMap { $0.isFinite ? Int($0) : nil } ?? 1
        let displayNowYear = baseYear + yearOffset
        let dayOfYear = Double(max(1, min(12, baseMonth)) - 1) * 30.44 + Double(max(1, min(31, baseDay)) - 1)
        func yearOf(_ day: Double) -> Int {
            guard day.isFinite && curDay.isFinite else { return displayNowYear }
            let delta = ((dayOfYear - (curDay - day)) / 365.25).rounded(.down)
            guard delta.isFinite && abs(delta) < 1e7 else { return displayNowYear }
            return displayNowYear + Int(delta)
        }

        // 州郡与城池映射，供定位都城与事件发生地
        let provinces = r.world.provinces.isArray ? r.world.provinces.asArray : []
        var pi = [String: Int]()
        for (i, p) in provinces.enumerated() {
            if let pid = p.id.optionalString { pi[pid] = i }
        }
        var cityToProv = [String: Int]()
        var provCityName = [Int: String]()
        let cities = r.world.cities.isArray ? r.world.cities.asArray : []
        for c in cities {
            if let pid = c.provinceId.optionalString, let idx = pi[pid] {
                if let cid = c.id.optionalString { cityToProv[cid] = idx }
                if provCityName[idx] == nil { provCityName[idx] = c.name.optionalString ?? (provinces[idx].name.optionalString ?? "") }
            }
        }
        let currentCapProv: Int = {
            if let cid = n.capitalId.optionalString, let idx = cityToProv[cid] { return idx }
            if let firstOwned = provinces.indices.first(where: { provinces[$0].controller.optionalString == id }) { return firstOwned }
            return -1
        }()
        let currentProvinces = provinces.reduce(0) { $1.controller.optionalString == id ? $0 + 1 : $0 }
        let vassalRecords = (r.vassals.isNull || r.vassals.records.isNull || !r.vassals.records.isArray) ? [] : r.vassals.records.asArray
        let currentVassals = vassalRecords.reduce(0) { ($1.overlordId.optionalString == id && $1.endedTick.isNull) ? $0 + 1 : $0 }
        let totalWorldProvinces = max(1, provinces.count)

        // 收集该国相关的大事记条目，按日期归属到每一任君主
        let allEntries = (r.chronicle.isNull || r.chronicle.entries.isNull || !r.chronicle.entries.isArray) ? [] : r.chronicle.entries.asArray
        let nationEntries = allEntries.filter { e in
            e.nationIds.isArray && e.nationIds.asArray.contains { $0.optionalString == id }
        }

        let leadersRaw = (r.chronicle.isNull || r.chronicle.leaders.isNull) ? JS.null : r.chronicle.leaders[id]
        let leaders = leadersRaw.isArray ? leadersRaw.asArray : []
        let outReigns = JS.array()
        var seenReignIds = Set<String>()
        var peakAcrossHistory = max(1, currentProvinces)
        var strongestOrder = 0
        var strongestScore = -1.0

        for (idx, reign) in leaders.enumerated() {
            let baseRid = reign.id.optionalString ?? "ruler-\(id)-\(idx + 1)"
            let rid = seenReignIds.insert(baseRid).inserted ? baseRid : "\(baseRid)#\(idx)"
            let order = max(1, reign.order.optionalNumber.flatMap { $0.isFinite ? Int($0) : nil } ?? (idx + 1))
            let active = reign.endedDay.isNull
            let rawStart = reign.ascendedDay.optionalNumber ?? 0
            let startDay = rawStart.isFinite ? rawStart : 0
            let rawEnd = active ? curDay : (reign.endedDay.optionalNumber ?? curDay)
            let endDay = rawEnd.isFinite ? rawEnd : curDay
            let reignYears = max(0.0, (endDay - startDay) / 365.25)

            // 关联真实人物档案（能力、特质、生死、年龄、家族）
            let pid = (r.sovereignty.isNull || r.sovereignty.reigns.isNull) ? -1 : (r.sovereignty.reigns[baseRid].optionalNumber.flatMap { $0.isFinite ? Int($0) : nil } ?? -1)
            let person = pid > 0 ? People.person(r, pid) : nil
            let rulerCard = (r.civilization.isNull || r.civilization.rulers.isNull) ? JS.null : r.civilization.rulers[baseRid]
            let isFemale = (person?.gender.optionalNumber ?? rulerCard.gender.optionalNumber ?? 0) == 1
            let alive = person?.isAlive.optionalBool ?? active

            let displayName: String = {
                if let p = person { return Self.displayPersonName(p) }
                if let nm = reign.name.optionalString, !nm.isEmpty { return nm }
                return rulerCard.name.optionalString ?? "无名"
            }()
            let houseRaw = person?.lastName.optionalString ?? reign.family.optionalString ?? rulerCard.house.optionalString ?? ""
            let house = NamingCatalog.cleanSurname(houseRaw)
            let familyId = person?.familyId.optionalNumber.flatMap { $0.isFinite ? Int($0) : nil } ?? -1

            // 尊号（依据在位时的政体/文化/性别）
            let row = r.reigns47.isNull ? JS.null : r.reigns47[baseRid]
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
                skillsArr = [
                    s.charisma.isFinite ? s.charisma.rounded() : 50,
                    s.military.isFinite ? s.military.rounded() : 50,
                    s.diplomatic.isFinite ? s.diplomatic.rounded() : 50,
                    s.administrative.isFinite ? s.administrative.rounded() : 50,
                ]
                if p.traits.isArray {
                    traitNames = p.traits.asArray.compactMap(\.optionalString).map { Self.traitLabels[$0] ?? $0 }
                }
            }
            let avgSkill = skillsArr.reduce(0, +) / 4.0

            // 疆域规模与巅峰
            let startArr = (row.isNull || !row.start.isArray) ? [] : row.start.asArray
            let endArr = (row.isNull || !row.end.isArray) ? [] : row.end.asArray
            let startProvs = startArr.first?.optionalNumber.flatMap { $0.isFinite ? Int($0) : nil } ?? (active ? currentProvinces : 0)
            let startVassals = (startArr.count > 1 ? startArr[1].optionalNumber.flatMap { $0.isFinite ? Int($0) : nil } : nil) ?? 0
            let endProvs = active ? currentProvinces : (endArr.first?.optionalNumber.flatMap { $0.isFinite ? Int($0) : nil } ?? startProvs)
            let endVassals = active ? currentVassals : ((endArr.count > 1 ? endArr[1].optionalNumber.flatMap { $0.isFinite ? Int($0) : nil } : nil) ?? startVassals)
            let recordedPeak = row.peak.optionalNumber.flatMap { $0.isFinite ? Int($0) : nil } ?? max(startProvs, endProvs)
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
                    return provCityName[capProv] ?? (provinces[capProv].name.optionalString ?? "")
                }
                return ""
            }()

            // 提炼本任期至多 8 条重要事件（优先战争/疆域/政变/制度/复国/迁都，均可定位）
            let keyEvents = reignEvents.reversed().prefix(8).map { e -> JS in
                let ev = JS.object()
                let evDay = e.day.optionalNumber ?? startDay
                ev.day = JS(evDay.isFinite ? Int(evDay) : Int(startDay))
                ev.year = JS(yearOf(evDay))
                ev.text = JS(e.text.optionalString ?? "")
                ev.kind = JS(e.kind.optionalString ?? "event")
                if let reason = e.reason.optionalString, !reason.isEmpty { ev.reason = JS(reason) }
                if let pStr = e.provinceId.optionalString, let pIdx = pi[pStr] { ev.province = JS(pIdx) }
                else if capProv >= 0 { ev.province = JS(capProv) }
                return ev
            }

            let honor = MonarchLore.honor(
                r, nationId: id, reignId: rid, order: order,
                culture: culture, polity: reignPolity, title: title,
                person: person, fallbackName: displayName,
                reignYears: reignYears, deltaProvs: deltaProvs, avgSkill: avgSkill, isActive: active
            )

            let item = JS.object()
            item.order = JS(order)
            item.id = JS(rid)
            item.name = JS(honor.cleanPersonalName)
            item.styledName = JS(honor.styledName.isEmpty ? honor.cleanPersonalName : honor.styledName)
            item.surnameLessImperial = JS(honor.surnameLessImperial)
            item.eraName = JS(honor.eraName)
            item.eraYearText = JS(honor.eraYearText)
            item.honorific = JS(honor.honorific)
            item.title = JS(title)
            item.house = JS(honor.surnameLessImperial ? "皇室" : (house.isEmpty ? "无" : NamingCatalog.houseLabel(house)))
            item.familyId = JS(familyId)
            item.personId = JS(pid)
            item.stateName = JS(row.stateName.optionalString ?? (n.name.optionalString ?? ""))
            item.polity = JS(Regimes.titles[reignPolity] ?? reignPolity)
            item.ascendedDay = JS(Int(startDay.isFinite ? startDay : 0))
            item.endedDay = active ? .null : JS(Int(endDay.isFinite ? endDay : 0))
            item.ascendedYear = JS(yearOf(startDay))
            item.endedYear = active ? .null : JS(yearOf(endDay))
            item.reignYears = JS(reignYears.isFinite ? (reignYears * 10).rounded() / 10 : 0)
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
        summary.nationName = JS(n.name.optionalString ?? "无名国")
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
