import Foundation

/// 国家政务、大军统筹、批量外交、禅位择君与疆土总管（2.0 国家页面深度操控接口）。
/// 全部在玩家主动触发时执行，遵循引擎确定性与既有账本结构，不触碰网页逐字节对照测试。
extension NativeEngine {
    // MARK: 颁布国策政令（八大政令）

    /// 国家政令：休养生息、全国大征兵、犒赏三军、整顿吏治、加固边防、推行文教、统一国教、大赦安抚世家。
    public func nationDecree(_ index: Int, kind: String) -> (ok: Bool, reason: String) {
        let r = run, nations = r.world.nations.asArray
        guard nations.indices.contains(index) else { return (false, "国家不存在。") }
        let n = nations[index], id = n.id.asString, stateName = n.name.asString
        guard Vassals.alive(r, id) else { return (false, "该国已亡，无法施政。") }
        Regimes.enable(r)
        let provinces = r.world.provinces.asArray
        let ownedIndices = provinces.indices.filter { provinces[$0].controller.optionalString == id }
        guard !ownedIndices.isEmpty else { return (false, "该国已无实控州郡。") }
        let fin = r.finance.nations[id]
        let destinyRow = r.destiny.nations[id]

        switch kind {
        case "prosper":
            // 休养生息：小额拨款，全国实控州人口 +3%（不超上限）、存粮 +20%，国运 +5。
            let gold = fin.isNull ? 0 : (fin.gold.optionalNumber ?? 0)
            let cost = min(gold, min(250, (gold * 0.15).rounded()))
            if !fin.isNull, cost > 0 { fin.gold = JS(max(0, gold - cost)) }
            let ownedIds = Set(ownedIndices.map { provinces[$0].id.asString })
            var popAdded = 0
            for s in r.world.statecraft.provinces.asArray where ownedIds.contains(s.provinceId.asString) {
                let pid = s.provinceId.asString
                let curPop = s.population.optionalNumber ?? 0
                let cap = r.finance.provinces[pid].maxPopulation.optionalNumber ?? max(curPop * 1.25, 10_000)
                let gain = min(max(0, cap - curPop), max(50, (curPop * 0.03).rounded()))
                if gain > 0 { s.population = JS((curPop + gain).rounded()); popAdded += Int(gain) }
                let grain = s.grain.optionalNumber ?? 0
                s.grain = JS(min(50_000_000, max(grain + 1200, (grain * 1.2).rounded())))
            }
            if !destinyRow.isNull { destinyRow.destiny = JS(min(100, (destinyRow.destiny.optionalNumber ?? 50) + 5)) }
            People.announce(r, kind: "event", text: "\(stateName)颁布休养生息之诏",
                            reason: "轻徭薄赋、劝课农桑：全国 \(ownedIndices.count) 州增丁 \(popAdded) 人、存粮充盈，国运 +5。",
                            nations: [id], province: nil)
            return (true, "休养生息：全国增丁 \(popAdded) 人，存粮 +20%，国运 +5。")

        case "mobilize":
            // 全国大征兵：择都城及人口最盛的至多 3 个己方州郡各征新军 1 支，国运 -4。
            let capPid = Rebellion.capitalProvince(r, id)
            var popMap = [String: Double]()
            for s in r.world.statecraft.provinces.asArray { popMap[s.provinceId.asString] = s.population.optionalNumber ?? 0 }
            let sorted = ownedIndices.filter { Armies.homeCells[provinces[$0].id.asString] != nil }.sorted { a, b in
                let pa = provinces[a].id.asString, pb = provinces[b].id.asString
                if (pa == capPid) != (pb == capPid) { return pa == capPid }
                return (popMap[pa] ?? 0) > (popMap[pb] ?? 0)
            }
            let picks = Array(sorted.prefix(3))
            guard !picks.isEmpty else { return (false, "境内没有可征募驻军的州郡。") }
            for idx in picks { Armies.create(r, nation: id, home: provinces[idx].id.asString, kind: "emergency") }
            if !destinyRow.isNull { destinyRow.destiny = JS(max(0, (destinyRow.destiny.optionalNumber ?? 50) - 4)) }
            Daily.reconcileMilitaryClock(r)
            let names = picks.map { provinces[$0].name.asString }.joined(separator: "、")
            People.announce(r, kind: "event", text: "\(stateName)下诏全国大征兵",
                            reason: "于\(names)紧急编练新军 \(picks.count) 支以备战守。",
                            nations: [id], province: provinces[picks[0]].id.asString)
            return (true, "于\(names)新征 \(picks.count) 支军队。")

        case "rewardArmies":
            // 犒赏三军：全军士气 +35（上限 100）、军粮补满至 100。
            let armies = r.world.armies.asArray.filter { $0.nationId.optionalString == id && $0.troops.asNumber > 0 && $0.status.asString != "destroyed" }
            guard !armies.isEmpty else { return (false, "该国当前没有现役陆军。") }
            let gold = fin.isNull ? 0 : (fin.gold.optionalNumber ?? 0)
            let cost = min(gold, min(200, (gold * 0.12).rounded()))
            if !fin.isNull, cost > 0 { fin.gold = JS(max(0, gold - cost)) }
            for a in armies {
                a.morale = JS(min(100, (a.morale.optionalNumber ?? 50) + 35))
                a.supplies = JS(100)
            }
            People.recordHistory(r, kind: "event", text: "\(stateName)犒赏三军",
                                 reason: "拨金 \(Int(cost)) 劳军，\(armies.count) 支现役军队士气大振、补给充盈。",
                                 nations: [id], province: nil)
            return (true, "已犒赏 \(armies.count) 支军队，士气大振、补给满额。")

        case "antiCorruption":
            // 整顿吏治：腐化度直降 15，国运 +4，并解除过低的手动施政锁。
            let before = Finance.corruption(r, id)
            Finance.setCorruption(r, id, max(0, before - 15))
            let after = Finance.corruption(r, id)
            if !destinyRow.isNull { destinyRow.destiny = JS(min(100, (destinyRow.destiny.optionalNumber ?? 50) + 4)) }
            if !r.regimes.governance.isNull, let cur = r.regimes.governance[id].optionalNumber, cur < 0.7 {
                r.regimes.governance.delete(id)
            }
            People.announce(r, kind: "event", text: "\(stateName)下诏整顿吏治",
                            reason: "清查贪墨、肃清纲纪，腐化度由 \(Int(before)) 降至 \(Int(after))，国运 +4。",
                            nations: [id], province: nil)
            return (true, "吏治整顿完成：腐化度降至 \(Int(after))，国运 +4。")

        case "fortifyBorder":
            // 加固边防：对所有邻接他国（或全境若为海岛）的至多 12 个州郡提升城防 +1（上限 10）。
            var byId = [String: JS]()
            for p in provinces { byId[p.id.asString] = p }
            var border = ownedIndices.filter { idx in
                provinces[idx].neighbors.asArray.contains { nb in
                    if let c = byId[nb.asString]?.controller.optionalString, c != id { return true }
                    return false
                }
            }
            if border.isEmpty { border = ownedIndices }
            var upgraded = 0
            for idx in border.prefix(12) {
                let pid = provinces[idx].id.asString
                let d = r.upperCombat.provinces[pid]
                guard !d.isNull else { continue }
                let cur = Int((d.storedDefense.optionalNumber ?? 1).rounded())
                if cur < 10 {
                    d.storedDefense = JS(min(10, cur + 1))
                    if cur + 1 >= 3 { d.manualSet = JS(true); d.manualFortress = JS(true) }
                    upgraded += 1
                }
            }
            guard upgraded > 0 else { return (false, "边防诸州城防已全部达顶（10 级）。") }
            People.recordHistory(r, kind: "event", text: "\(stateName)加固边防工事",
                                 reason: "修缮边塞城池与关隘，共 \(upgraded) 座重镇城防提升。",
                                 nations: [id], province: nil)
            return (true, "已加固 \(upgraded) 座边防州郡城防（+1 级）。")

        case "assimilateCulture":
            // 推行文教：令全国所有实控州城池同化为本国主体文化。
            guard let culture = r.civilization.nations[id].cultureId.optionalString, !culture.isEmpty else {
                return (false, "该国尚未设定主体文化。")
            }
            let ownedIds = Set(ownedIndices.map { provinces[$0].id.asString })
            var changed = 0
            for city in r.world.cities.asArray where ownedIds.contains(city.provinceId.asString) {
                let c = r.civilization.cities[city.id.asString]
                guard !c.isNull else { continue }
                if c.cultureId.optionalString != culture {
                    c.cultureId = JS(culture)
                    changed += 1
                }
            }
            guard changed > 0 else { return (false, "境内各城均已归附本国文化。") }
            People.announce(r, kind: "event", text: "\(stateName)推行文教同化",
                            reason: "兴办官学、同文同轨，境内 \(changed) 座城池归入本国文化。",
                            nations: [id], province: nil)
            return (true, "文教推行完成：\(changed) 座城池已同化为本国文化。")

        case "convertFaith":
            // 统一国教：令全国所有实控州郡及本国世家归宗国教。
            guard let religion = r.civilization.nations[id].religionId.optionalString, !religion.isEmpty else {
                return (false, "该国尚未确立国教。")
            }
            if r.regimes.faith.isNull { r.regimes.faith = .object() }
            var changed = 0
            for idx in ownedIndices {
                let p = provinces[idx], pid = p.id.asString
                if Regimes.provinceFaith(r, p) != religion {
                    r.regimes.faith[pid] = JS(religion)
                    changed += 1
                }
            }
            Regimes.setHouses(r, id, religion)
            let faithName = Regimes.creeds[religion]?.name ?? religion
            if changed == 0 { return (true, "境内诸州与世家皆已尊奉\(faithName)。") }
            People.announce(r, kind: "event", text: "\(stateName)诏令统一国教",
                            reason: "宣谕四方、归宗\(faithName)，共 \(changed) 州改奉国教。",
                            nations: [id], province: nil)
            return (true, "已令 \(changed) 州归奉\(faithName)，异教民变风险清零。")

        case "amnesty":
            // 大赦安抚世家：宗室与本国所有其他世家关系 +20，缓解离心与谋逆。
            guard !r.nobility.isNull, !r.nobility.families.isNull else { return (false, "该世界未启用世家系统。") }
            let ruling = People.rulingFamilyId(r, id)
            let rulingKey = String(ruling)
            guard ruling > 0, r.nobility.families.has(rulingKey) else { return (false, "未找到本国宗室世家。") }
            var touched = 0
            for (k, fam) in r.nobility.families.objectEntries where fam.nationId.optionalString == id && k != rulingKey {
                FamilyPolitics.adjustRelation(r, k, rulingKey, delta: 20)
                touched += 1
            }
            guard touched > 0 else { return (false, "本国尚无其他门阀世家需要安抚。") }
            People.announce(r, kind: "family", text: "\(stateName)大赦天下、加恩诸世家",
                            reason: "朝廷赐爵安抚国内 \(touched) 家门阀，与宗室情谊各增 20。",
                            nations: [id], province: nil)
            return (true, "大赦安抚 \(touched) 家门阀，与宗室关系各 +20。")

        case "relief":
            // 开仓赈灾：平抑饥荒、全国存粮保底充盈、叛乱风险骤降、国运 +4。
            let gold = fin.isNull ? 0 : (fin.gold.optionalNumber ?? 0)
            let cost = min(gold, min(180, (gold * 0.1).rounded()))
            if !fin.isNull, cost > 0 { fin.gold = JS(max(0, gold - cost)) }
            let ownedIds = Set(ownedIndices.map { provinces[$0].id.asString })
            for s in r.world.statecraft.provinces.asArray where ownedIds.contains(s.provinceId.asString) {
                let g = s.grain.optionalNumber ?? 0
                s.grain = JS(min(50_000_000, max(g + 2500, (g * 1.3).rounded())))
            }
            if !destinyRow.isNull { destinyRow.destiny = JS(min(100, (destinyRow.destiny.optionalNumber ?? 50) + 4)) }
            People.announce(r, kind: "event", text: "\(stateName)开仓放粮赈济万民",
                            reason: "调拨官仓粮秣赈济饥民，全境存粮大增 30%，国运 +4。",
                            nations: [id], province: nil)
            return (true, "开仓赈灾完成：全国存粮 +30%，国运 +4。")

        case "landSurvey":
            // 清丈田亩：核实隐田、腐化 -10、即得一月半额外岁入。
            let before = Finance.corruption(r, id)
            Finance.setCorruption(r, id, max(0, before - 10))
            let gain = max(120, (fin.goldPerMonth.optionalNumber ?? 100) * 1.5).rounded()
            if !fin.isNull { fin.gold = JS((fin.gold.optionalNumber ?? 0) + gain) }
            People.announce(r, kind: "politics", text: "\(stateName)下诏清丈天下田亩",
                            reason: "清查豪强隐匿田产、均平税负：国库进项 +\(Int(gain)) 金，腐化 −10。",
                            nations: [id], province: nil)
            return (true, "清丈田亩完成：国库 +\(Int(gain)) 金，腐化 −10。")

        case "armsUpgrade":
            // 军械改良：为现役各军更新甲胄兵刃，士气 +20、补给补满、兵力小幅整补 +6%（不超满编）。
            let armies = r.world.armies.asArray.filter { $0.nationId.optionalString == id && $0.troops.asNumber > 0 && $0.status.asString != "destroyed" }
            guard !armies.isEmpty else { return (false, "该国暂无现役陆军。") }
            let gold = fin.isNull ? 0 : (fin.gold.optionalNumber ?? 0)
            let cost = min(gold, min(260, (gold * 0.14).rounded()))
            if !fin.isNull, cost > 0 { fin.gold = JS(max(0, gold - cost)) }
            for a in armies {
                let aid = a.id.asString
                let cur = a.troops.asNumber
                let full = max(cur, r.tactics.forces[aid].fullStrength.optionalNumber ?? cur)
                let next = min(full, (cur * 1.06).rounded())
                a.troops = JS(next)
                a.morale = JS(min(100, (a.morale.optionalNumber ?? 60) + 20))
                a.supplies = JS(100)
            }
            People.recordHistory(r, kind: "event", text: "\(stateName)颁行军械改良令",
                                 reason: "拨银 \(Int(cost)) 打造新式甲械，\(armies.count) 支军队兵员整补且士气 +20。",
                                 nations: [id], province: nil)
            return (true, "军械改良完成：\(armies.count) 支军队补给满额、士气 +20。")

        case "academy":
            // 兴办太学／国立学院：提升在位君主与核心大臣能力 +3，国运 +3，腐化 -4。
            let gold = fin.isNull ? 0 : (fin.gold.optionalNumber ?? 0)
            let cost = min(gold, min(200, (gold * 0.12).rounded()))
            if !fin.isNull, cost > 0 { fin.gold = JS(max(0, gold - cost)) }
            if let ldr = Regimes.ruler(r, id) {
                ldr.base.administrative = JS(min(100, (ldr.base.administrative.optionalNumber ?? 50) + 3))
                ldr.base.diplomatic = JS(min(100, (ldr.base.diplomatic.optionalNumber ?? 50) + 3))
            }
            if let prem = Regimes.premier(r, id) {
                prem.base.administrative = JS(min(100, (prem.base.administrative.optionalNumber ?? 50) + 4))
            }
            Finance.setCorruption(r, id, max(0, Finance.corruption(r, id) - 4))
            if !destinyRow.isNull { destinyRow.destiny = JS(min(100, (destinyRow.destiny.optionalNumber ?? 50) + 3)) }
            People.announce(r, kind: "culture", text: "\(stateName)兴办太学、广育英才",
                            reason: "开设国立学馆、举荐贤能：中枢政略与外交能力精进，腐化 −4，国运 +3。",
                            nations: [id], province: nil)
            return (true, "太学兴办完成：中枢能力精进，腐化 −4，国运 +3。")

        case "agenda_accountability":
            // 战后问责与整军复仇案：清除战败震荡，全军士气 +25，国运 +4
            if !r.regimes.defeatShock.isNull { r.regimes.defeatShock.delete(id) }
            let armies = r.world.armies.asArray.filter { $0.nationId.optionalString == id && $0.troops.asNumber > 0 && $0.status.asString != "destroyed" }
            for a in armies { a.morale = JS(min(100, (a.morale.optionalNumber ?? 50) + 25)) }
            if !destinyRow.isNull { destinyRow.destiny = JS(min(100, (destinyRow.destiny.optionalNumber ?? 50) + 4)) }
            People.announce(r, kind: "politics", text: "\(stateName)通过《战后问责与整军案》",
                            reason: "罢黜失律将校、重赏敢战之士，战败震荡平息，全军士气 +25，国运 +4。",
                            nations: [id], province: nil)
            return (true, "《战后问责与整军案》已颁行：战败震荡平息，全军士气 +25，国运 +4。")

        case "agenda_wartax":
            // 战时急征军饷与前线犒师案：国库 +450，全军补给满额、士气 +20
            if !fin.isNull { fin.gold = JS((fin.gold.optionalNumber ?? 0) + 450) }
            let armies = r.world.armies.asArray.filter { $0.nationId.optionalString == id && $0.troops.asNumber > 0 && $0.status.asString != "destroyed" }
            for a in armies {
                a.morale = JS(min(100, (a.morale.optionalNumber ?? 50) + 20))
                a.supplies = JS(100)
            }
            People.announce(r, kind: "politics", text: "\(stateName)通过《战时急征军饷与犒师案》",
                            reason: "开征战时特饷充盈军库（+450 金），前线三军粮草满额、士气 +20。",
                            nations: [id], province: nil)
            return (true, "《战时急征军饷案》已颁行：国库 +450 金，全军粮草满额、士气 +20。")

        case "agenda_curbhouses":
            // 清丈勋贵田庄与抑豪强案：非宗室世家势力 -35，国库 +380，腐化 -8
            let ruling = People.rulingFamilyId(r, id)
            if !r.nobility.isNull && !r.nobility.families.isNull {
                for (fid, fam) in r.nobility.families.objectEntries where fam.nationId.optionalString == id && Int(fid) != ruling {
                    fam.influence = JS(max(10, (fam.influence.optionalNumber ?? 60) - 35))
                }
            }
            if !fin.isNull { fin.gold = JS((fin.gold.optionalNumber ?? 0) + 380) }
            Finance.setCorruption(r, id, max(0, Finance.corruption(r, id) - 8))
            People.announce(r, kind: "reform", text: "\(stateName)御批《清丈勋贵田庄案》",
                            reason: "清查豪强隐田、收权归于中枢：门阀权势受抑，国库 +380 金，腐化 −8。",
                            nations: [id], province: nil)
            return (true, "《清丈勋贵田庄案》已颁行：门阀权势 −35，国库 +380 金，腐化 −8。")

        case "agenda_civil":
            // 开科取士与劝农兴学案：全境人口 +3%，腐化 -6，国运 +5
            let ownedIds = Set(ownedIndices.map { provinces[$0].id.asString })
            for s in r.world.statecraft.provinces.asArray where ownedIds.contains(s.provinceId.asString) {
                let curPop = s.population.optionalNumber ?? 0
                s.population = JS((curPop * 1.03).rounded())
            }
            Finance.setCorruption(r, id, max(0, Finance.corruption(r, id) - 6))
            if !destinyRow.isNull { destinyRow.destiny = JS(min(100, (destinyRow.destiny.optionalNumber ?? 50) + 5)) }
            People.announce(r, kind: "culture", text: "\(stateName)御批《开科取士与劝农案》",
                            reason: "广开科举、劝课农桑：全境人口 +3%，腐化 −6，国运 +5。",
                            nations: [id], province: nil)
            return (true, "《开科取士与劝农案》已颁行：全境人口 +3%，腐化 −6，国运 +5。")

        case let k where k.hasPrefix("balancePower:"):
            let target = String(k.dropFirst("balancePower:".count))
            r.regimes.nations[id].powerBias = JS(target)
            let label = target == "crown" ? "君主中枢" : target == "houses" ? "门阀世家" : target == "military" ? "军功将领" : "议会文官"
            People.recordHistory(r, kind: "politics", text: "\(stateName)扶植\(label)权势",
                                 reason: "中枢调整朝局倚重，\(label)在朝堂权力天平中的比重显著上升。",
                                 nations: [id], province: nil)
            return (true, "已扶植「\(label)」，朝堂权力天平已随之倾斜。")

        case let k where k.hasPrefix("emblem:"):
            let sym = String(k.dropFirst("emblem:".count))
            guard !sym.isEmpty else { return (false, "纹章字样不能为空。") }
            r.regimes.nations[id].emblem = JS(String(sym.prefix(2)))
            return (true, "\(stateName)旌旗纹章已更改为「\(String(sym.prefix(2)))」。")

        case "miracle:ruler":
            // 天命神迹：天降雄主（君主四维全满 96+、国运 95、清除战败震荡）
            let lid = r.people.nations[id].leaderId.optionalNumber.map(Int.init) ?? -1
            if lid > 0, let p = People.person(r, lid) {
                p.base.charisma = JS(96); p.base.military = JS(98); p.base.diplomatic = JS(95); p.base.administrative = JS(98)
                if p.age.optionalNumber ?? 30 < 18 { p.age = JS(24) }
            }
            if !destinyRow.isNull { destinyRow.destiny = JS(95) }
            if !r.regimes.defeatShock.isNull { r.regimes.defeatShock.delete(id) }
            People.announce(r, kind: "politics", text: "\(stateName)天降雄主，乾坤一振",
                            reason: "君主文治武功臻于化境（四维皆达 95+），国运飙升至 95！",
                            nations: [id], province: nil)
            return (true, "天命加护：\(stateName)君主四维已臻化境（95+），国运升至 95！")

        case "miracle:legions":
            // 天命神迹：天降神兵（在都城及重镇立刻编成 3 支满编禁军并补满全军士气粮草）
            let capPid = Rebellion.capitalProvince(r, id)
            let picks = Array(ownedIndices.filter { Armies.homeCells[provinces[$0].id.asString] != nil }.sorted { a, b in
                (provinces[a].id.asString == capPid) && (provinces[b].id.asString != capPid)
            }.prefix(3))
            guard !picks.isEmpty else { return (false, "境内没有可驻军的城池。") }
            for idx in picks { Armies.create(r, nation: id, home: provinces[idx].id.asString, kind: "regular") }
            Daily.reconcileMilitaryClock(r)
            for a in r.world.armies.asArray where a.nationId.optionalString == id && a.troops.asNumber > 0 {
                a.morale = JS(100); a.supplies = JS(100)
            }
            People.announce(r, kind: "war", text: "\(stateName)天降禁军精锐",
                            reason: "三支满编精锐禁军应诏集结，全国现役三军士气与粮草尽皆满额！",
                            nations: [id], province: provinces[picks[0]].id.asString)
            return (true, "天降神兵：已为\(stateName)新编 \(picks.count) 支精锐大军，全军士气与粮草补满！")

        case "miracle:treasury":
            // 天命神迹：天赐巨帑与丰年（国库 +5000 金、全境存粮 +50万、腐化清零）
            if !fin.isNull { fin.gold = JS((fin.gold.optionalNumber ?? 0) + 5000) }
            let ownedIds = Set(ownedIndices.map { provinces[$0].id.asString })
            for s in r.world.statecraft.provinces.asArray where ownedIds.contains(s.provinceId.asString) {
                s.grain = JS(min(50_000_000, (s.grain.optionalNumber ?? 0) + 500_000))
            }
            Finance.setCorruption(r, id, 0)
            People.announce(r, kind: "event", text: "\(stateName)连岁大稔、府库充溢",
                            reason: "天赐丰年：国库骤增 5000 金，全境仓廪充盈，贪墨弊政一扫而空。",
                            nations: [id], province: nil)
            return (true, "天赐巨帑：国库 +5000 金，全境各州存粮 +50 万，腐化清零！")

        case "miracle:personalUnion":
            // 联姻共主邦联：与有王室联姻或同阵营亲善邻国结为共主邦联（收为附庸并缔结共防铁盟）
            let candidates = nations.indices.filter { idx in
                let oid = nations[idx].id.asString
                return oid != id && Vassals.alive(r, oid) && !Regimes.isBlank(r, oid) && !Regimes.atWar(r, id, oid) && Vassals.overlord(r, oid) == nil
            }
            let best = candidates.max { a, b in
                let oa = nations[a].id.asString, ob = nations[b].id.asString
                let mA = DiplomacyDeep.hasTreaty(r, id, oa, kind: "marriage") ? 100 : 0
                let mB = DiplomacyDeep.hasTreaty(r, id, ob, kind: "marriage") ? 100 : 0
                return (mA + DiplomacyDeep.opinion(r, id, oa).score) < (mB + DiplomacyDeep.opinion(r, id, ob).score)
            }
            guard let targetIdx = best else { return (false, "当前没有可缔结共主邦联的独立和平国家。") }
            let tid = nations[targetIdx].id.asString, tName = nations[targetIdx].name.asString
            _ = makeVassal(targetIdx, of: index)
            DiplomacyDeep.upsertTreaty(r, a: id, b: tid, kind: "marriage", years: 20)
            DiplomacyDeep.upsertTreaty(r, a: id, b: tid, kind: "defense", years: 20)
            DiplomacyDeep.adjustOpinionMod(r, id, tid, delta: 45)
            People.announce(r, kind: "diplomacy", text: "\(stateName)与\(tName)缔结王室共主邦联",
                            reason: "两国借宗室联姻与王位宣称合为一脉，\(tName)奉\(stateName)君主为共主并缔结二十年攻守同盟。",
                            nations: [id, tid], province: nil)
            return (true, "已与\(tName)正式缔结「王室共主邦联」！")

        default:
            return (false, "未知政令：\(kind)。")
        }
    }

    // MARK: 国家军事统筹

    /// 国家军事指令：全军回防都城（recall）、全军补员（reinforceAll）、全军交 AI（releaseAll）、船坞下水新舰队（launchFleet）。
    public func nationMilitaryOrder(_ index: Int, kind: String) -> (ok: Bool, reason: String) {
        let r = run, nations = r.world.nations.asArray
        guard nations.indices.contains(index) else { return (false, "国家不存在。") }
        let n = nations[index], id = n.id.asString, stateName = n.name.asString
        guard Vassals.alive(r, id) else { return (false, "该国已亡。") }
        let armies = r.world.armies.asArray.filter { $0.nationId.optionalString == id && $0.troops.asNumber > 0 && $0.status.asString != "destroyed" }

        switch kind {
        case "recall":
            guard !armies.isEmpty else { return (false, "该国没有现役陆军。") }
            let capPid = Rebellion.capitalProvince(r, id)
            let capIndex = capPid.flatMap { pid in r.world.provinces.asArray.firstIndex { $0.id.asString == pid } }
            var moved = 0
            for a in armies where a.status.asString != "fighting" {
                let aid = a.id.asString
                if let capIndex, order(armyId: aid, provinceIndex: capIndex).ok { moved += 1 }
                else if returnHome(aid).ok { moved += 1 }
            }
            guard moved > 0 else { return (false, "没有可回师的军队（或均在交战／已驻都城）。") }
            return (true, "已下令 \(moved) 支军队回防本土。")

        case "reinforceAll":
            guard !armies.isEmpty else { return (false, "该国没有现役陆军。") }
            var count = 0
            for a in armies where a.status.asString != "fighting" {
                if reinforceArmy(a.id.asString).ok { count += 1 }
            }
            guard count > 0 else { return (false, "全军兵员已满，或国库／驻地人口暂不足。") }
            return (true, "已为 \(count) 支缺编军队补充兵员。")

        case "releaseAll":
            let myArmyIds = Set(armies.map(\.id.asString))
            let manualArmies = r.voyages.manualArmies.asArray.map(\.asString).filter { myArmyIds.contains($0) }
            var releasedArmies = 0
            if !manualArmies.isEmpty {
                let res = releaseToAI(armyIds: manualArmies)
                if res.ok { releasedArmies = manualArmies.count }
            }
            let myFleetIds = Set(Naval.fleets(r).filter { $0.nationId.optionalString == id && $0.status.asString != "lost" }.map(\.id.asString))
            var releasedFleets = 0
            for fid in r.voyages.manualFleets.asArray.map(\.asString) where myFleetIds.contains(fid) {
                if setFleetManual(fid, manual: false).ok { releasedFleets += 1 }
            }
            guard releasedArmies > 0 || releasedFleets > 0 else { return (false, "该国目前全部海陆军均已由 AI 调度。") }
            return (true, "已将 \(releasedArmies) 支陆军、\(releasedFleets) 支舰队交还 AI 自主调度。")

        case "launchFleet":
            // 船坞下水新舰队：在己方实控港口编成一支 3 艘战船的新水师。
            guard let sea = Naval.sea, !sea.ports.isEmpty else { return (false, "当前世界没有可用海港。") }
            let liveFleets = Naval.fleets(r).filter { $0.status.asString != "lost" }
            let ownFleets = liveFleets.filter { $0.nationId.optionalString == id }
            guard liveFleets.count < 200 else { return (false, "天下舰队数量已达上限（200）。") }
            guard ownFleets.count < 12 else { return (false, "本国舰队数量已达上限（12 支）。") }
            var byId = [String: JS]()
            for p in r.world.provinces.asArray { byId[p.id.asString] = p }
            guard let port = sea.ports.first(where: { byId[$0.provinceId]?.controller.optionalString == id }) else {
                return (false, "该国没有实控海港，无法建造舰队。")
            }
            let ships = max(1, Tuning.current.openingShips)
            let crew = ships * 40, food = Double(ships * 2400)
            let fid = "fleet-\(Int(r.world.nextEventId.asNumber))-\(r.navy.fleets.length)"
            let cityName = r.world.cities.asArray.first { $0.provinceId.asString == port.provinceId }?.name.asString
                ?? byId[port.provinceId]?.name.asString ?? "海"
            let fleetName = "\(cityName)港第\(Regimes.chineseNumeral(ownFleets.count + 1))水师"
            let fl = JS.object()
            fl.id = JS(fid); fl.name = JS(fleetName); fl.nationId = JS(id)
            fl.ships = JS(ships); fl.crew = JS(crew); fl.food = JS(food)
            fl.node = JS(port.node); fl.route = .array(); fl.progress = JS(0)
            fl.dockId = JS(port.id); fl.targetId = .null; fl.patrol = JS(true); fl.status = JS("docked")
            if r.navy.isNull { r.navy = .object(); r.navy.version = JS(1); r.navy.fleets = .array() }
            r.navy.fleets.push(fl)
            // 舰队位置记录（与 CreationForces 保持完全一致结构：湿面 node → 2*node+1）。
            let rec = JS.object()
            rec.version = JS(1); rec.armyId = JS(fid)
            let origin = JS.object(); origin.x = JS(port.center.x); origin.y = JS(port.center.y)
            rec.origin = origin; rec.nodes = .array([JS(port.node * 2 + 1)])
            rec.leg = JS(0); rec.offset = JS(0); rec.crossed = JS(false); rec.status = JS("arrived")
            if !r.fleetPositions.isNull {
                if r.fleetPositions.records.isNull { r.fleetPositions.records = .object() }
                r.fleetPositions.records[fid] = rec
                Vassals.bump(r.fleetPositions)
            }
            if !r.maritime.isNull {
                if r.maritime.hulls.isNull { r.maritime.hulls = .object() }
                r.maritime.hulls[fid] = JS(Double(ships * 100))
            }
            if !r.portControl.isNull {
                if r.portControl.fleets.isNull { r.portControl.fleets = .object() }
                let pf = JS.object()
                pf.targetId = .null; pf.forwardBaseId = .null; pf.active = JS(false); pf.lastWar = JS(false); pf.nextTick = r.clock.tick.clone()
                r.portControl.fleets[fid] = pf
            }
            if !r.navalAutonomy.isNull {
                if r.navalAutonomy.fleets.isNull { r.navalAutonomy.fleets = .object() }
                let nf = JS.object()
                nf.homePortId = JS(port.id); nf.assignedPortId = .null; nf.nextTick = r.clock.tick.clone(); nf.issuedTick = .null
                nf.decision = JS("waiting"); nf.reason = JS("新舰下水，待命巡海。")
                r.navalAutonomy.fleets[fid] = nf
                Vassals.bump(r.navalAutonomy)
            }
            People.announce(r, kind: "event", text: "\(stateName)\(fleetName)下水成军",
                            reason: "于\(cityName)港新造战船 \(ships) 艘、编成水师投入巡防。",
                            nations: [id], province: port.provinceId)
            Daily.reconcileMilitaryClock(r)
            return (true, "\(fleetName)（\(ships) 船）已在\(cityName)港下水。")

        default:
            return (false, "未知军事指令：\(kind)。")
        }
    }

    // MARK: 国家批量外交与朝政补缺

    /// 国家批量外交／朝政指令：全面停战（peaceAll）、四面出击（warNeighbors）、补齐空缺总督（fillGovernors）。
    public func nationDiplomacyOrder(_ index: Int, kind: String) -> (ok: Bool, reason: String) {
        let r = run, nations = r.world.nations.asArray
        guard nations.indices.contains(index) else { return (false, "国家不存在。") }
        let n = nations[index], id = n.id.asString, stateName = n.name.asString
        guard Vassals.alive(r, id) else { return (false, "该国已亡。") }

        switch kind {
        case "peaceAll":
            let enemies = r.world.statecraft.relations.asArray
                .filter { $0.status.asString == "war" && ($0.a.asString == id || $0.b.asString == id) }
                .map { nationIndex($0.a.asString == id ? $0.b.asString : $0.a.asString) }
                .filter { $0 >= 0 }
            guard !enemies.isEmpty else { return (false, "该国当前没有进行中的对外战争。") }
            var ended = 0
            for e in enemies {
                if politics(declare: false, index, e).ok { ended += 1 }
            }
            afterGlobalOrder()
            guard ended > 0 else { return (false, "未能结束当前战事。") }
            return (true, "\(stateName)已与 \(ended) 个敌国全面停战。")

        case "warNeighbors":
            let provinces = r.world.provinces.asArray
            var byId = [String: JS]()
            for p in provinces { byId[p.id.asString] = p }
            var neighborIds = [String]()
            var seen = Set<String>()
            for p in provinces where p.controller.optionalString == id {
                for nb in p.neighbors.asArray {
                    if let c = byId[nb.asString]?.controller.optionalString, c != id, seen.insert(c).inserted {
                        neighborIds.append(c)
                    }
                }
            }
            var started = 0
            for otherId in neighborIds where started < 4 {
                let otherIdx = nationIndex(otherId)
                guard otherIdx >= 0, Vassals.alive(r, otherId) else { continue }
                if RunWindow.atWar(r, id, otherId) { continue }
                if Vassals.overlord(r, id) == otherId || Vassals.overlord(r, otherId) == id { continue }
                if let al = Vassals.allianceOf(r, id), al.members.asArray.contains(where: { $0.asString == otherId }) { continue }
                if politics(declare: true, index, otherIdx).ok { started += 1 }
            }
            guard started > 0 else { return (false, "周边暂无可宣战的邻国（或皆为盟友／停战期／已交战）。") }
            return (true, "\(stateName)向周边 \(started) 个邻国宣战。")

        case "fillGovernors":
            let provinces = r.world.provinces.asArray
            var ctx = Offices.context(r, id)
            var filled = 0
            for (i, p) in provinces.enumerated() where p.controller.optionalString == id {
                if Offices.holder(r, id, "Governor", i + 1) != nil { continue }
                if Offices.tryFill(&ctx, "Governor", 1, i + 1) { filled += 1 }
            }
            guard filled > 0 else { return (false, "各州总督已满员，或暂无符合资格的空闲宗亲大臣。") }
            return (true, "已为 \(filled) 个空缺州郡补齐总督。")

        default:
            return (false, "未知外交／朝政指令：\(kind)。")
        }
    }

    // MARK: 禅位择君（拥立指定人物为君主）

    /// 列出本国可供拥立登基的在世成年人物（继承人、家主与朝中能臣优先，最多 30 人）。
    public func throneCandidates(_ index: Int) -> Data? {
        let r = run, nations = r.world.nations.asArray
        guard nations.indices.contains(index) else { return nil }
        let id = nations[index].id.asString
        let sid = Offices.stateId(r, id)
        let currentLeader = r.people.nations[id].leaderId.optionalNumber.map { Int($0) } ?? -1
        let rulingFam = People.rulingFamilyId(r, id)
        let heirId = rulingFam > 0 ? (r.kin.families[String(rulingFam)].heirId.optionalNumber.map { Int($0) } ?? -1) : -1

        var rows = [(p: JS, priority: Int, score: Double, tag: String)]()
        for p in r.kin.persons.objectValues {
            guard case .object = p.storage, p.isAlive.optionalBool == true else { continue }
            guard p.stateId.asInt == sid, p.id.asInt != currentLeader else { continue }
            let age = p.age.optionalNumber ?? 0
            guard age >= 16 else { continue }
            let pid = p.id.asInt
            let famId = p.familyId.asInt
            let famSurname = famId > 0 ? NamingCatalog.cleanSurname(r.kin.families[String(famId)].surname.optionalString ?? "") : ""
            let isHead = famId > 0 && r.kin.families[String(famId)].headId.asInt == pid
            let s = People.skills(p)
            let total = s.charisma + s.military + s.diplomatic + s.administrative
            var pri = 10
            var tag = famSurname.isEmpty ? "本国士人" : NamingCatalog.houseLabel(famSurname)
            if pid == heirId { pri = 0; tag = "王储继承人" }
            else if famId == rulingFam && isHead { pri = 1; tag = "宗室家主" }
            else if famId == rulingFam { pri = 2; tag = "宗室成员" }
            else if isHead { pri = 3; tag = "\(NamingCatalog.houseLabel(famSurname))家主" }
            rows.append((p, pri, total, tag))
        }
        rows.sort { a, b in
            if a.priority != b.priority { return a.priority < b.priority }
            if a.score != b.score { return a.score > b.score }
            return a.p.id.asInt < b.p.id.asInt
        }
        let out = JS.array()
        for row in rows.prefix(30) {
            let v = personView(row.p, role: row.tag)
            v.score = JS(row.score.rounded())
            out.push(v)
        }
        return Data(out.json.utf8)
    }

    /// 禅位择君：让本国某位在世成年人物即位为君主／元首，同步更新宗室与朝堂。
    public func enthronePerson(_ index: Int, personId: Int) -> (ok: Bool, reason: String) {
        let r = run, nations = r.world.nations.asArray
        guard nations.indices.contains(index) else { return (false, "国家不存在。") }
        let id = nations[index].id.asString, sid = Offices.stateId(r, id)
        guard Vassals.alive(r, id) else { return (false, "该国已亡，无法即位。") }
        guard let target = People.person(r, personId), target.isAlive.optionalBool == true else { return (false, "所选人物不存在或已故。") }
        guard target.stateId.asInt == sid else { return (false, "只能拥立本国人物登基。") }
        guard (target.age.optionalNumber ?? 0) >= 16 else { return (false, "未满十六岁，暂不能登基。") }
        let curLeader = r.people.nations[id].leaderId.optionalNumber.map { Int($0) } ?? -1
        guard curLeader != personId else { return (false, "此人已是本国君主。") }

        // 安全关闭旧君主的 leader 角色（容错空 roles）。
        if curLeader > 0, let old = People.person(r, curLeader) {
            let roles = old.roles.isNull ? [] : old.roles.asArray.filter { $0.nativeKind.optionalString == "leader" && $0.stateId.asInt == old.stateId.asInt }
            if !roles.isEmpty {
                if old.pastRoles.isNull { old.pastRoles = .array() }
                old.pastRoles.push(People.pastRole(roles[0], time: r.life.gameTime.asNumber, reason: "abdication"))
                old.roles.asArray = old.roles.asArray.filter { role in !roles.contains { $0 === role } }
            }
        }
        _ = People.appointKnownPerson(r, id, target, cause: "abdication")
        Government.refreshLeaderCombat(r)
        afterGlobalOrder()
        return (true, "已拥立\(Self.displayPersonName(target))为\(nations[index].name.asString)新主。")
    }

    // MARK: 疆土总管（本国全部实控州郡清单）

    /// 返回某国全部实控州郡的精简清单，用于国家页「疆土」总管标签的筛选、排序与批量／单州管理。
    public func nationProvinces(_ index: Int) -> Data? {
        let r = run, nations = r.world.nations.asArray
        guard nations.indices.contains(index) else { return nil }
        let n = nations[index], id = n.id.asString
        let provinces = r.world.provinces.asArray
        let capPid = Rebellion.capitalProvince(r, id)

        var stockByPid = [String: JS]()
        for s in r.world.statecraft.provinces.asArray { stockByPid[s.provinceId.asString] = s }
        var cityByPid = [String: JS]()
        for c in r.world.cities.asArray { cityByPid[c.provinceId.asString] = c }
        let portPids = Set((Naval.sea?.ports ?? []).map(\.provinceId))

        var armyCountByPid = [String: Int]()
        for loc in Armies.space(r) where loc.army.nationId.optionalString == id && loc.army.troops.asNumber > 0 {
            if let pid = loc.province?.id.asString { armyCountByPid[pid, default: 0] += 1 }
        }

        let out = JS.array()
        for (i, p) in provinces.enumerated() where p.controller.optionalString == id {
            let pid = p.id.asString
            let row = JS.object()
            row.index = JS(i)
            row.name = p.name.clone()
            let s = stockByPid[pid]
            row.population = JS(Int((s?.population.optionalNumber ?? 0).rounded()))
            row.capacity = JS(Int((r.finance.provinces[pid].maxPopulation.optionalNumber ?? 0).rounded()))
            let d = r.upperCombat.provinces[pid]
            let def = d.isNull ? 1 : min(10, max(1, Int((d.storedDefense.optionalNumber ?? 1).rounded())))
            row.defense = JS(def)
            row.fortress = JS(def >= 3 || d.manualFortress.isTruthy)
            row.capital = JS(pid == capPid)
            row.port = JS(portPids.contains(pid))
            let good = Trade.of(r, pid)
            row.specialty = JS(Trade.goods[good])
            if let city = cityByPid[pid], let cult = r.civilization.cities[city.id.asString].cultureId.optionalString {
                row.culture = JS(cult)
            } else {
                row.culture = JS("")
            }
            row.religion = JS(Regimes.provinceFaith(r, p) ?? "")
            if let g = Offices.holder(r, id, "Governor", i + 1) {
                row.governor = JS(Self.displayPersonName(g))
                row.governorFit = JS(Offices.suitability(r, id, "Governor", i + 1))
            }
            if !r.nobility.isNull, let famId = Nobility.holder(r.nobility, pid) {
                let surname = NamingCatalog.cleanSurname(r.kin.families[famId].surname.optionalString ?? "")
                row.familyId = JS(famId)
                row.familyName = JS(NamingCatalog.houseLabel(surname))
            }
            row.armies = JS(armyCountByPid[pid] ?? 0)
            out.push(row)
        }
        return Data(out.json.utf8)
    }
}
