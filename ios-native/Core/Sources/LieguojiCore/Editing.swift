import Foundation

/// 编辑 (the original's edit panel, military profile, official titles and custom labels): state traits one by
/// one, a state's arms and titles, cultures and faiths reworded, and free text on the map.
extension Regimes {
    /// The player's change to one kind of troop in one state (nil where it has none).
    static func unitEdit(_ r: JS, _ nation: String, _ unit: String) -> JS {
        r.regimes.isNull ? .null : r.regimes.nations[nation].units[unit]
    }
    static func unitPower(_ r: JS, _ nation: String, _ unit: String) -> Double { (unitEdit(r, nation, unit).power.optionalNumber ?? 100) / 100 }
    static func unitSpeed(_ r: JS, _ nation: String, _ unit: String) -> Double { (unitEdit(r, nation, unit).speed.optionalNumber ?? 100) / 100 }
    /// A new army's kind: the culture's roster with the state's own weights.
    static func pickUnit(_ r: JS, _ nation: String, id: String) -> UnitKinds.Kind {
        let culture = r.civilization.nations[nation].cultureId.optionalString ?? ""
        guard !r.regimes.isNull, !r.regimes.nations[nation].units.isNull else { return UnitKinds.pick(culture: culture, id: id) }
        var h: UInt32 = 2166136261
        for u in id.utf8 { h = (h ^ UInt32(u)) &* 16777619 }
        let roster = UnitKinds.roster(culture).map { ($0.0, Int(unitEdit(r, nation, $0.0).weight.optionalNumber ?? Double($0.1))) }.filter { $0.1 > 0 }
        let total = roster.reduce(0) { $0 + $1.1 }
        guard total > 0 else { return UnitKinds.pick(culture: culture, id: id) }
        var x = Int(h % UInt32(total))
        for (k, w) in roster { if x < w { return UnitKinds.byKey[k]! }; x -= w }
        return UnitKinds.pick(culture: culture, id: id)
    }
    static func unitName(_ r: JS, _ nation: String, _ kind: UnitKinds.Kind) -> String { unitEdit(r, nation, kind.key).name.optionalString ?? kind.name }
}

extension NativeEngine {
    private func nationId(_ index: Int) -> String? { let n = run.world.nations.asArray; return n.indices.contains(index) ? n[index].id.asString : nil }

    // MARK: 国家特性
    public func setStateTrait(_ index: Int, trait: String?, on: Bool) -> (ok: Bool, reason: String) {
        let r = run
        guard let id = nationId(index), !r.stateTraits47.isNull else { return (false, "这个世界没有国家特性。") }
        var held = r.stateTraits47[id].isNull ? [String]() : r.stateTraits47[id].asArray.map(\.asString)
        if let trait {
            guard Government.stateTraitText[trait] != nil else { return (false, "特性不存在。") }
            held.removeAll { $0 == trait }
            if on { held.append(trait) }
        } else { held = on ? Government.stateTraits : [] }
        r.stateTraits47[id] = .array(held.map { JS($0) })
        Government.recordStateTraits(r)
        return (true, on ? "特性已开启" : "特性已关闭")
    }
    func stateTraitRows(_ id: String) -> JS {
        let held = Set(Armies.stateTraits(run, id))
        return .array(Government.stateTraits.compactMap { k in
            guard let t = Government.stateTraitText[k] else { return nil }
            let o = JS.object(); o.key = JS(k); o.name = JS(t.0); o.text = JS(t.1); o.on = JS(held.contains(k)); return o
        })
    }

    // MARK: 官职称号
    public func setOfficeTitle(_ index: Int, office: String, title: String?) -> (ok: Bool, reason: String) {
        let r = run
        guard let id = nationId(index), !r.regimes.isNull else { return (false, "国家不存在。") }
        let b = Regimes.book(r, id)
        if b.titles.isNull { b.titles = .object() }
        if let title, !title.isEmpty { b.titles[office] = JS(title) } else { b.titles.delete(office) }
        return (true, "官职称号已修改")
    }

    // MARK: 兵种档案
    public func unitProfile(_ index: Int) -> Data {
        let r = run
        guard let id = nationId(index) else { return Data("[]".utf8) }
        let culture = r.civilization.nations[id].cultureId.optionalString ?? ""
        return Data(JS.array(UnitKinds.roster(culture).compactMap { key, weight in
            guard let k = UnitKinds.byKey[key] else { return nil }
            let e = Regimes.unitEdit(r, id, key), o = JS.object()
            o.key = JS(key); o.base = JS(k.name); o.name = JS(e.name.optionalString ?? k.name); o.note = JS(k.note)
            o.power = JS(e.power.optionalNumber ?? 100); o.speed = JS(e.speed.optionalNumber ?? 100); o.weight = JS(e.weight.optionalNumber ?? Double(weight))
            return o
        }).json.utf8)
    }
    public func setUnitProfile(_ index: Int, unit: String, name: String?, power: Double?, speed: Double?, weight: Double?) -> (ok: Bool, reason: String) {
        let r = run
        guard let id = nationId(index), UnitKinds.byKey[unit] != nil, !r.regimes.isNull else { return (false, "兵种不存在。") }
        let b = Regimes.book(r, id)
        if b.units.isNull { b.units = .object() }
        if name == nil && power == nil && speed == nil && weight == nil { b.units.delete(unit); return (true, "已恢复默认") }
        let e = JS.object()
        if let name, !name.isEmpty { e.name = JS(name) }
        if let power { e.power = JS(max(10, min(500, power))) }
        if let speed { e.speed = JS(max(10, min(300, speed))) }
        if let weight { e.weight = JS(max(0, min(100, weight.rounded()))) }
        b.units[unit] = e
        return (true, "兵种档案已修改")
    }

    // MARK: 同盟
    public func leaveAllianceForced(_ index: Int) -> (ok: Bool, reason: String) {
        guard let id = nationId(index) else { return (false, "国家不存在。") }
        guard Vassals.leaveAlliance(run, id, force: true) else { return (false, "该国不在任何同盟中。") }
        afterGlobalOrder()
        return (true, "已退出同盟")
    }

    // MARK: 文化与宗教
    public func catalogEdits() -> Data {
        let r = run, o = JS.object()
        o.cultures = r.regimes.isNull || r.regimes.cultures.isNull ? .object() : r.regimes.cultures
        o.faiths = r.regimes.isNull || r.regimes.faithEdits.isNull ? .object() : r.regimes.faithEdits
        return Data(o.json.utf8)
    }
    public func setCultureEdit(_ culture: String, name: String?, text: String?, male: [String], female: [String]) -> (ok: Bool, reason: String) {
        let r = run
        guard !r.regimes.isNull else { return (false, "这个世界不能编辑文化。") }
        if r.regimes.cultures.isNull { r.regimes.cultures = .object() }
        let e = JS.object()
        if let name, !name.isEmpty { e.name = JS(name) }
        if let text, !text.isEmpty { e.text = JS(text) }
        e.male = .array(male.map { JS($0) }); e.female = .array(female.map { JS($0) })
        r.regimes.cultures[culture] = e
        return (true, "文化已修改")
    }
    public func setFaithEdit(_ faith: String, name: String?, text: String?) -> (ok: Bool, reason: String) {
        let r = run
        guard !r.regimes.isNull else { return (false, "这个世界不能编辑宗教。") }
        if r.regimes.faithEdits.isNull { r.regimes.faithEdits = .object() }
        let e = JS.object()
        if let name, !name.isEmpty { e.name = JS(name) }
        if let text, !text.isEmpty { e.text = JS(text) }
        r.regimes.faithEdits[faith] = e
        return (true, "宗教已修改")
    }

    // MARK: 地图标注
    public func mapLabels() -> Data { Data((run.regimes.isNull || run.regimes.labels.isNull ? JS.array([]) : run.regimes.labels).json.utf8) }
    /// Adds a label (id < 0) or rewrites one.
    public func setMapLabel(id: Int, text: String, x: Double, y: Double, size: Double, color: String, angle: Double) -> (ok: Bool, reason: String) {
        let r = run
        guard !r.regimes.isNull else { return (false, "这个世界不能添加标注。") }
        if r.regimes.labels.isNull { r.regimes.labels = .array([]) }
        var list = r.regimes.labels.asArray
        let e = JS.object()
        let next = (list.map(\.id.asInt).max() ?? 0) + 1
        e.id = JS(id >= 0 ? id : next); e.text = JS(text); e.x = JS(x); e.y = JS(y); e.size = JS(max(4, min(200, size))); e.color = JS(color); e.angle = JS(angle)
        if let i = list.firstIndex(where: { $0.id.asInt == id }) { list[i] = e } else { list.append(e) }
        r.regimes.labels = .array(list)
        return (true, "标注已保存")
    }
    public func removeMapLabel(id: Int) -> (ok: Bool, reason: String) {
        let r = run
        guard !r.regimes.isNull, !r.regimes.labels.isNull else { return (false, "没有标注。") }
        r.regimes.labels = .array(r.regimes.labels.asArray.filter { $0.id.asInt != id })
        return (true, "标注已删除")
    }
}
