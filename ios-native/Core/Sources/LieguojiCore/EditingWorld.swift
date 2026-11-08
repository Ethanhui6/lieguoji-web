import Foundation

/// 世界编辑 (the rest of the original's edit panel): blank lands, alliances, districts, family land, city
/// defence, isolated provinces, drawn rivers, renaming the land, pictures on the map, and packages.
extension Regimes {
    // MARK: 无主之地
    static func blank(_ r: JS, _ id: String) -> JS { r.regimes.isNull || r.regimes.blank.isNull ? .null : r.regimes.blank[id] }
    static func isBlank(_ r: JS, _ id: String) -> Bool { !blank(r, id).isNull }
    static func unconquerable(_ r: JS, _ id: String) -> Bool { blank(r, id).unconquerable.isTruthy }

    // MARK: 锁定人口、放弃飞地
    static func editsMonth(_ r: JS, _ key: Int) {
        if !r.regimes.popLock.isNull {
            var stock = [String: JS](); for s in r.world.statecraft.provinces.asArray { stock[s.provinceId.asString] = s }
            for (p, v) in r.regimes.popLock.objectEntries { stock[p]?.population = v.clone() }
        }
        guard r.regimes.world.abandon.isTruthy else { return }
        var byId = [String: JS](); for p in r.world.provinces.asArray { byId[p.id.asString] = p }
        for n in r.world.nations.asArray {
            let id = n.id.asString
            guard Vassals.alive(r, id), !isBlank(r, id) else { continue }
            let owned = r.world.provinces.asArray.filter { $0.controller.asString == id }
            guard owned.count >= 4, let capital = Rebellion.capitalProvince(r, id) else { continue }
            // The land joined to the capital.
            var joined: Set<String> = [capital], queue = [capital], i = 0
            while i < queue.count {
                for q in byId[queue[i]]?.neighbors.asArray.map(\.asString) ?? [] where !joined.contains(q) && byId[q]?.controller.asString == id { joined.insert(q); queue.append(q) }
                i += 1
            }
            for p in owned where !joined.contains(p.id.asString) && chance("\(p.id.asString)|\(key)|abandon") < 0.1 {
                var tally = [String: Int]()
                for q in p.neighbors.asArray.map(\.asString) { if let c = byId[q]?.controller.optionalString, c != id, !unconquerable(r, c) { tally[c, default: 0] += 1 } }
                guard let heir = tally.sorted(by: { $0.value != $1.value ? $0.value > $1.value : $0.key < $1.key }).first?.key else { continue }
                PeaceBridge.transferEconomy(r, p.id.asString, id, heir); p.controller = JS(heir); p.legalOwner = JS(heir)
                _ = People.announce(r, kind: "occupation", text: "\(n.name.asString)放弃飞地\(p.name.asString)", reason: "孤悬在外，鞭长莫及，由\(Vassals.name(r, heir))接管。", nations: [id, heir], province: p.id.optionalString)
            }
        }
    }
}

extension NativeEngine {
    private func at(_ index: Int) -> JS? { let l = run.world.provinces.asArray; return l.indices.contains(index) ? l[index] : nil }
    private func nid(_ index: Int) -> String? { let n = run.world.nations.asArray; return n.indices.contains(index) ? n[index].id.asString : nil }

    // MARK: 无主之地
    /// A blank land on this province: no ruler, no armies, no diplomacy; more provinces join it with the country brush.
    public func createBlankLand(_ index: Int, name: String, unconquerable: Bool) -> (ok: Bool, reason: String) {
        let r = run
        guard let p = at(index), !r.foundings.isNull else { return (false, "这个世界不能新建无主之地。") }
        let pid = p.id.asString, owner = p.controller.asString
        guard r.world.cities.asArray.contains(where: { $0.provinceId.asString == pid }) else { return (false, "请选有城池的州郡。") }
        guard r.world.provinces.asArray.filter({ $0.controller.asString == owner }).count >= 2 else { return (false, "这是该国最后一州。") }
        RebelWar.destroyArmies(r, owner, pid)
        let id = Founding.foundState(r, parent: owner, provinces: [pid], reason: "世界编辑：划为无主之地。").nationId.asString
        if r.regimes.blank.isNull { r.regimes.blank = .object() }
        let e = JS.object(); e.unconquerable = JS(unconquerable); r.regimes.blank[id] = e
        let title = name.trimmingCharacters(in: .whitespaces).isEmpty ? "无主之地" : name
        r.civilization.nations[id].name.value = JS(title)
        if let n = r.world.nations.asArray.first(where: { $0.id.asString == id }) { n.name = JS(title); n.color = JS(unconquerable ? "#B8B0A0" : "#D4CBB8") }
        for a in r.world.armies.asArray where a.nationId.asString == id { a.troops = JS(0); a.status = JS("destroyed") }
        Wars.reconcileLosses(r); Vassals.reconcileAlliances(r); DiplomacyBridge.reconcile(r); Wars.reconcileIdentities(r)
        if let i = r.world.nations.asArray.firstIndex(where: { $0.id.asString == id }) { _ = setAutoDiplomacy(i, enabled: false) }
        afterGlobalOrder()
        return (true, "\(title)已划定")
    }

    // MARK: 同盟
    public func allianceList() -> Data {
        let r = run, nations = r.world.nations.asArray
        var index = [String: Int](); for (i, n) in nations.enumerated() { index[n.id.asString] = i }
        var out = [JS]()
        for (i, v) in r.alliances.records.asArray.enumerated() where v.endedTick.isNull && v.members.length > 0 {
            let o = JS.object(); o.id = JS(i); o.name = v.name.clone(); o.color = v.color.isNull ? JS("") : v.color.clone(); o.unbreakable = JS(v.unbreakable.isTruthy)
            o.members = .array(v.members.asArray.compactMap { index[$0.asString].map { JS($0) } })
            out.append(o)
        }
        return Data(JS.array(out).json.utf8)
    }
    private func league(_ i: Int) -> JS? { let l = run.alliances.records.asArray; return l.indices.contains(i) && l[i].endedTick.isNull ? l[i] : nil }
    public func editAlliance(_ i: Int, name: String?, color: String?, unbreakable: Bool?) -> (ok: Bool, reason: String) {
        guard let v = league(i) else { return (false, "同盟不存在。") }
        if let name, !name.isEmpty { v.name = JS(name) }
        if let color { v.color = JS(color) }
        if let unbreakable { v.unbreakable = JS(unbreakable) }
        Vassals.bump(run.alliances)
        return (true, "同盟已修改")
    }
    public func allianceMember(_ i: Int, nation: Int, join: Bool) -> (ok: Bool, reason: String) {
        let r = run
        guard let v = league(i), let id = nid(nation) else { return (false, "同盟不存在。") }
        if join {
            guard Vassals.alive(r, id) else { return (false, "此国已亡。") }
            if Vassals.allianceOf(r, id) != nil { Vassals.leaveAlliance(r, id, force: true) }
            guard v.endedTick.isNull else { return (false, "同盟已解散。") }
            v.members.push(JS(id)); Vassals.bump(r.alliances)
            _ = People.announce(r, kind: "diplomacy", text: "\(Vassals.name(r, id))加入\(v.name.asString)", reason: "世界编辑：缔盟。", nations: [id], province: nil)
        } else {
            guard v.members.asArray.contains(where: { $0.asString == id }) else { return (false, "该国不在此同盟。") }
            Vassals.leaveAlliance(r, id, force: true)
        }
        afterGlobalOrder()
        return (true, join ? "已加入同盟" : "已逐出同盟")
    }
    public func disbandAlliance(_ i: Int) -> (ok: Bool, reason: String) {
        guard let v = league(i), let actor = v.members.asArray.first?.asString else { return (false, "同盟不存在。") }
        _ = Vassals.dissolve(run, v, actor: actor, force: true)
        afterGlobalOrder()
        return (true, "同盟已解散")
    }

    // MARK: 行政区
    public func districtList() -> Data {
        let r = run
        Districts.ensure(r)
        var count = [Int: Int](); for v in r.regimes.regions.of.objectValues { if let n = v.optionalNumber { count[Int(n), default: 0] += 1 } }
        return Data(JS.array(r.regimes.regions.list.asArray.compactMap { g in
            guard let n = count[g.id.asInt], n > 0 else { return nil }
            let o = JS.object(); o.id = g.id.clone(); o.name = g.name.clone(); o.provinces = JS(n); return o
        }).json.utf8)
    }
    /// Puts a province in a region, or in a new one named `name` when `region` is negative.
    public func setDistrict(_ index: Int, region: Int, name: String?) -> (ok: Bool, reason: String) {
        let r = run
        guard let p = at(index) else { return (false, "州郡不存在。") }
        Districts.ensure(r)
        var id = region
        if id < 0 {
            id = r.regimes.regions.list.length
            let row = JS.object(); row.id = JS(id); row.center = p.id.clone(); row.name = JS(name?.isEmpty == false ? name! : p.name.asString + "道")
            r.regimes.regions.list.push(row)
        }
        r.regimes.regions.of[p.id.asString] = JS(id)
        return (true, "已划入行政区")
    }
    public func deleteDistrict(_ region: Int) -> (ok: Bool, reason: String) {
        let r = run
        Districts.ensure(r)
        for (k, v) in r.regimes.regions.of.objectEntries where v.optionalNumber.map({ Int($0) }) == region { r.regimes.regions.of.delete(k) }
        return (true, "行政区已删除")
    }
    public func regenerateDistricts() -> (ok: Bool, reason: String) {
        run.regimes.regions = .null
        Districts.ensure(run)
        return (true, "行政区已重新生成")
    }

    // MARK: 家族封地
    public func familyList() -> Data {
        let r = run
        guard !r.nobility.isNull else { return Data("[]".utf8) }
        var out = [JS]()
        for (id, f) in r.nobility.families.objectEntries {
            guard let nation = f.nationId.optionalString, Vassals.alive(r, nation) else { continue }
            let o = JS.object(); o.id = JS(id); o.name = JS((r.kin.families[id].surname.optionalString ?? "") + "氏 · " + Vassals.name(r, nation))
            o.provinces = JS(f.controlledProvinces.isNull ? 0 : f.controlledProvinces.length); o.influence = JS((f.influence.optionalNumber ?? 0).rounded())
            out.append(o)
        }
        return Data(JS.array(out.sorted { $0.name.asString < $1.name.asString }).json.utf8)
    }
    public func setFamilyLand(_ index: Int, family: String?) -> (ok: Bool, reason: String) {
        let r = run
        guard let p = at(index), !r.nobility.isNull else { return (false, "州郡不存在。") }
        let pid = p.id.asString
        for f in r.nobility.families.objectValues where !f.controlledProvinces.isNull { f.controlledProvinces = .array(f.controlledProvinces.asArray.filter { $0.asString != pid }) }
        if let family { guard !r.nobility.families[family].isNull else { return (false, "家族不存在。") }; r.nobility.families[family].controlledProvinces.push(JS(pid)) }
        return (true, "封地已修改")
    }
    public func editFamily(_ family: String, surname: String?, influence: Double?, strip: Bool) -> (ok: Bool, reason: String) {
        let r = run
        guard !r.nobility.families[family].isNull else { return (false, "家族不存在。") }
        if let surname, !surname.isEmpty { r.kin.families[family].surname = JS(surname) }
        if let influence { r.nobility.families[family].influence = JS(max(0, influence)) }
        if strip { r.nobility.families[family].controlledProvinces = .array([]); r.nobility.families[family].influence = JS(0) }
        return (true, strip ? "已除爵" : "家族已修改")
    }

    // MARK: 城防与人口锁定
    /// A province's defence (1…10), held by hand until `level` is nil.
    public func setProvinceDefense(_ index: Int, level: Int?) -> (ok: Bool, reason: String) {
        guard let p = at(index) else { return (false, "州郡不存在。") }
        let d = run.upperCombat.provinces[p.id.asString]
        guard !d.isNull else { return (false, "此州没有城防数据。") }
        if let level { d.storedDefense = JS(max(1, min(10, level))); d.locked = JS(true); d.manualSet = JS(false) } else { d.locked = JS(false) }
        return (true, level == nil ? "城防已恢复自动" : "城防已锁定")
    }
    public func lockPopulation(_ index: Int, lock: Bool) -> (ok: Bool, reason: String) {
        let r = run
        guard let p = at(index), !r.regimes.isNull, let s = r.world.statecraft.provinces.asArray.first(where: { $0.provinceId.asString == p.id.asString }) else { return (false, "州郡不存在。") }
        if r.regimes.popLock.isNull { r.regimes.popLock = .object() }
        if lock { r.regimes.popLock[p.id.asString] = s.population.clone() } else { r.regimes.popLock.delete(p.id.asString) }
        return (true, lock ? "人口已锁定" : "人口已解锁")
    }

    // MARK: 地名
    public func placeNames() -> Data {
        let r = run, o = JS.object()
        o.cities = .array(r.world.cities.asArray.map { $0.name.clone() }); o.provinces = .array(r.world.provinces.asArray.map { $0.name.clone() })
        return Data(o.json.utf8)
    }
    private func freshPlace(_ culture: String, _ seed: String, _ used: Set<String>) -> String? {
        guard let profile = Founding.cultures.first(where: { $0.id == culture }) else { return nil }
        return Opening.freshName(profile, run.civilization.mode.asString, "city", seed, used)?.value
    }
    /// 按文化重命名: every city but the capitals takes a name of its own culture.
    public func renameAllByCulture() -> (ok: Bool, reason: String) {
        let r = run
        var used = Set(r.world.cities.asArray.map(\.name.asString)), done = 0
        let capitals = Set(r.world.nations.asArray.compactMap { $0.capitalId.optionalString }), stamp = Int(r.clock.tick.asNumber)
        var byId = [String: JS](); for p in r.world.provinces.asArray { byId[p.id.asString] = p }
        for c in r.world.cities.asArray where !capitals.contains(c.id.asString) {
            let civ = r.civilization.cities[c.id.asString]
            guard let culture = civ.cultureId.optionalString, let next = freshPlace(culture, "\(c.id.asString)/\(stamp)", used) else { continue }
            let old = c.name.asString
            used.remove(old); used.insert(next)
            if let p = byId[c.provinceId.asString], p.name.asString == old { p.name = JS(next) }
            c.name = JS(next); civ.name.value = JS(next); done += 1
        }
        return (true, "\(done) 座城市已按文化重命名")
    }
    public func randomProvinceName(_ index: Int) -> (ok: Bool, reason: String) {
        let r = run
        guard let p = at(index), let c = r.world.cities.asArray.first(where: { $0.provinceId.asString == p.id.asString }) else { return (false, "此州没有城池。") }
        let civ = r.civilization.cities[c.id.asString]
        guard let culture = civ.cultureId.optionalString, let next = freshPlace(culture, "\(c.id.asString)/\(Int(r.clock.tick.asNumber))/r", Set(r.world.cities.asArray.map(\.name.asString))) else { return (false, "没有可用的地名。") }
        if p.name.asString == c.name.asString { p.name = JS(next) }
        c.name = JS(next); civ.name.value = JS(next)
        return (true, "改名\(next)")
    }
    public func randomNationName(_ index: Int) -> (ok: Bool, reason: String) {
        let r = run
        guard let id = nid(index), let n = r.world.nations.asArray.first(where: { $0.id.asString == id }), let profile = Founding.cultures.first(where: { $0.id == r.civilization.nations[id].cultureId.optionalString }) else { return (false, "国家不存在。") }
        let used = Set(r.civilization.nations.objectValues.compactMap { $0.name.value.optionalString })
        guard let fresh = Opening.freshName(profile, r.civilization.mode.asString, "state", "\(id)/\(Int(r.clock.tick.asNumber))/r", used) else { return (false, "没有可用的国名。") }
        r.civilization.nations[id].name.value = JS(fresh.value)
        n.name = JS(Regimes.title(r, id, base: fresh.value, style: Regimes.style(r, id)))
        return (true, "改称\(n.name.asString)")
    }
    /// 国名模板: {名} is the state's name, {号} its form of state. Nil goes back to the normal title.
    public func setNameTemplate(_ index: Int, template: String?) -> (ok: Bool, reason: String) {
        let r = run
        guard let id = nid(index), let n = r.world.nations.asArray.first(where: { $0.id.asString == id }), !r.regimes.isNull else { return (false, "国家不存在。") }
        let b = Regimes.book(r, id)
        b.nameTemplate = template?.isEmpty == false ? JS(template!) : .null
        n.name = JS(Regimes.title(r, id, base: r.civilization.nations[id].name.value.asString, style: Regimes.style(r, id)))
        return (true, "改称\(n.name.asString)")
    }

    // MARK: 河流与图片（只存放，不影响推演）
    public func mapExtras() -> Data {
        let r = run, o = JS.object()
        o.rivers = r.regimes.isNull || r.regimes.rivers.isNull ? .array([]) : r.regimes.rivers
        o.images = r.regimes.isNull || r.regimes.images.isNull ? .array([]) : r.regimes.images
        o.abandon = JS(!r.regimes.isNull && r.regimes.world.abandon.isTruthy); o.noAssist = JS(!r.regimes.isNull && r.regimes.world.noAssist.isTruthy)
        return Data(o.json.utf8)
    }
    public func addMapRiver(points: [Double]) -> (ok: Bool, reason: String) {
        let r = run
        guard !r.regimes.isNull, points.count >= 4 else { return (false, "河流太短。") }
        if r.regimes.rivers.isNull { r.regimes.rivers = .array([]) }
        r.regimes.rivers.push(.array(points.map { JS($0.rounded()) }))
        return (true, "河流已绘制")
    }
    public func clearMapRivers() -> (ok: Bool, reason: String) {
        guard !run.regimes.isNull else { return (false, "没有河流。") }
        run.regimes.rivers = .array([])
        return (true, "手绘河流已清除")
    }
    /// Adds a picture (id < 0) or rewrites one; a nil `data` keeps the picture it has.
    public func setMapImage(id: Int, name: String, data: String?, x: Double, y: Double, width: Double, angle: Double, alpha: Double, front: Bool, visible: Bool) -> (ok: Bool, reason: String) {
        let r = run
        guard !r.regimes.isNull else { return (false, "这个世界不能添加图片。") }
        if r.regimes.images.isNull { r.regimes.images = .array([]) }
        var list = r.regimes.images.asArray
        let old = list.first { $0.id.asInt == id }
        guard let bytes = data ?? old?.data.optionalString else { return (false, "没有图片。") }
        let e = JS.object()
        e.id = JS(id >= 0 ? id : (list.map(\.id.asInt).max() ?? 0) + 1); e.name = JS(name); e.data = JS(bytes); e.x = JS(x); e.y = JS(y); e.width = JS(max(10, min(4000, width)))
        e.angle = JS(angle); e.alpha = JS(max(0.05, min(1, alpha))); e.front = JS(front); e.visible = JS(visible)
        if let i = list.firstIndex(where: { $0.id.asInt == id }) { list[i] = e } else { list.append(e) }
        r.regimes.images = .array(list)
        return (true, "图片已保存")
    }
    public func removeMapImage(id: Int) -> (ok: Bool, reason: String) {
        guard !run.regimes.isNull, !run.regimes.images.isNull else { return (false, "没有图片。") }
        run.regimes.images = .array(run.regimes.images.asArray.filter { $0.id.asInt != id })
        return (true, "图片已删除")
    }

    // MARK: 新增兵种与档案包
    public func addExtraUnit(_ index: Int, base: String, name: String, power: Double, speed: Double, weight: Double) -> (ok: Bool, reason: String) {
        let r = run
        guard let id = nid(index), UnitKinds.byKey[base] != nil, !name.isEmpty, !r.regimes.isNull else { return (false, "兵种无效。") }
        let b = Regimes.book(r, id)
        if b.extraUnits.isNull { b.extraUnits = .array([]) }
        let e = JS.object(); e.base = JS(base); e.name = JS(name); e.power = JS(max(10, min(500, power))); e.speed = JS(max(10, min(300, speed))); e.weight = JS(max(1, min(100, weight.rounded())))
        b.extraUnits.push(e)
        return (true, "\(name)已编入")
    }
    public func extraUnits(_ index: Int) -> Data {
        guard let id = nid(index), !run.regimes.isNull, !run.regimes.nations[id].extraUnits.isNull else { return Data("[]".utf8) }
        return Data(run.regimes.nations[id].extraUnits.json.utf8)
    }
    public func removeExtraUnit(_ index: Int, at i: Int) -> (ok: Bool, reason: String) {
        guard let id = nid(index), !run.regimes.isNull, !run.regimes.nations[id].extraUnits.isNull else { return (false, "没有此兵种。") }
        var list = run.regimes.nations[id].extraUnits.asArray
        guard list.indices.contains(i) else { return (false, "没有此兵种。") }
        list.remove(at: i)
        run.regimes.nations[id].extraUnits = .array(list)
        return (true, "兵种已删除")
    }
    /// A package: one state's arms and titles (index ≥ 0), or the cultures and faiths (index < 0).
    public func exportPackage(_ index: Int) -> Data {
        let r = run, o = JS.object()
        o.format = JS("lieguoji-package-1")
        if let id = nid(index), !r.regimes.isNull {
            let b = r.regimes.nations[id]
            o.units = b.units.isNull ? .object() : b.units; o.extraUnits = b.extraUnits.isNull ? .array([]) : b.extraUnits; o.titles = b.titles.isNull ? .object() : b.titles
        } else {
            o.cultures = r.regimes.isNull || r.regimes.cultures.isNull ? .object() : r.regimes.cultures
            o.faithEdits = r.regimes.isNull || r.regimes.faithEdits.isNull ? .object() : r.regimes.faithEdits
        }
        return Data(o.json.utf8)
    }
    public func importPackage(_ index: Int, text: String) -> (ok: Bool, reason: String) {
        let r = run
        guard !r.regimes.isNull, let p = try? JS.parse(Data(text.utf8)), p.format.optionalString == "lieguoji-package-1" else { return (false, "不是列国纪的档案包。") }
        if let id = nid(index), !p.units.isNull {
            let b = Regimes.book(r, id)
            b.units = p.units; if !p.extraUnits.isNull { b.extraUnits = p.extraUnits }; if !p.titles.isNull { b.titles = p.titles }
            return (true, "军事档案已导入")
        }
        if !p.cultures.isNull { r.regimes.cultures = p.cultures; if !p.faithEdits.isNull { r.regimes.faithEdits = p.faithEdits }; Regimes.registerCustomCultures(r); return (true, "文化宗教已导入") }
        return (false, "档案包内容与所选对象不符。")
    }
}
