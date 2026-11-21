import SwiftUI
import LieguojiCore

/// 生计 (the original's 民族特性): what each does to income and growth (Monthly factors).
enum Livelihood {
    static let all: [(key: String, name: String, note: String)] = [
        ("Agriculture", "农耕", "收入 +3%"), ("Nomadic", "游牧", "收入 +1%"), ("Maritime", "海洋", "收入 +4%，海战加成"),
        ("FishAndHunting", "渔猎", "收入 +2%"), ("Commercial", "商贸", "收入 +5%"), ("Other", "其他", "无加成"),
    ]
    static func name(_ key: String) -> String { all.first { $0.key == key }?.name ?? (key.isEmpty ? "—" : key) }
}

/// One state's treasury and ledger (engine financeInfo).
struct FinanceOverview: Decodable {
    let gold: Double; let net: Double; let taxes: Double; let hoard: Double; let army: Double; let battle: Double; let trade: Double
    let policy: String; let policyName: String; let record: [Double]
    var corruption: Double? = nil; var corruptionLevel: String? = nil
    var debt: Double? = nil; var interest: Double? = nil; var debtLevel: Int? = nil; var debtMonths: Double? = nil
}

/// 财政: the treasury with its two-year trend, where the month's money comes from and goes, how a
/// full or empty treasury weighs on battle, and the tax policy (a choice with real effects).
struct FinanceSection: View {
    @ObservedObject var model: GameModel
    let nation: Int; let day: Int
    var say: (String) -> Void = { _ in }
    @State private var info: FinanceOverview?
    @State private var failed = false
    @State private var attempt = 0
    var body: some View {
        Group2 {
            if let f = info {
                HStack(alignment: .center, spacing: 12) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("国库").font(Theme.label).foregroundStyle(Theme.ink2)
                        Text(Names.wan(Int(f.gold))).font(Theme.title).foregroundStyle(f.gold < 0 ? Theme.seal : Theme.ink)
                    }
                    Spacer()
                    Sparkline(values: f.record).frame(width: 120, height: 34)
                }
                .padding(.horizontal, 16).padding(.vertical, 10)
                Divider2()
                line("土地税收", "+\(Int(f.taxes))")
                if f.hoard < 0.999 { line("国库过盈（收入递减）", "×\(String(format: "%.2f", f.hoard))", warn: true) }
                line("贸易增收", "+\(Int(f.trade))")
                line("军费", "−\(Int(f.army))", warn: f.army > f.taxes)
                Divider2()
                line("每月净入", (f.net - f.army >= 0 ? "+" : "") + "\(Int(f.net - f.army))", strong: true)
                line("国库对战力", "×\(String(format: "%.2f", f.battle))", warn: f.battle < 1)
                Divider2()
                if let c = f.corruption {
                    // 腐化度: the original's four levels, its cost to the income, and the two orders.
                    VStack(alignment: .leading, spacing: 8) {
                        HStack {
                            Text("腐化度").font(Theme.label).foregroundStyle(Theme.ink2)
                            Spacer()
                            Text("\(f.corruptionLevel ?? "") · \(Int(c))").font(Theme.body).foregroundStyle(c >= 40 ? Theme.seal : Theme.ink)
                        }
                        GeometryReader { g in
                            ZStack(alignment: .leading) {
                                Capsule().fill(Theme.ink.opacity(0.1))
                                Capsule().fill(c >= 65 ? Theme.seal : c >= 40 ? Theme.seal.opacity(0.65) : Theme.jade).frame(width: g.size.width * CGFloat(min(100, c)) / 100)
                            }
                        }
                        .frame(height: 5).animation(Motion.panel, value: c)
                        Text(c > 15 ? "每月收入约 −\(Int(c / 2.5))%" + (c >= 65 ? "，国运逐月下降" : "") + "。国土越大、税越重、施政越差，腐化越深。" : "吏治清明，收入不受影响。")
                            .font(Theme.caption).foregroundStyle(Theme.ink2)
                        HStack(spacing: 10) {
                            Button { Task { await corruption(lower: true) } } label: { SecondaryLabel(title: "降低腐败", symbol: "checkmark.seal") }
                            Button { Task { await corruption(lower: false) } } label: { SecondaryLabel(title: "加深腐败", symbol: "exclamationmark.triangle") }
                        }
                        .buttonStyle(PressStyle())
                    }
                    .padding(.horizontal, 16).padding(.vertical, 10)
                    Divider2()
                }
                // 国债: what is owed, what it costs a month, how the lenders see it.
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 8) {
                        Image(systemName: "building.columns").font(.system(size: 14)).foregroundStyle(Theme.seal.opacity(0.8))
                        Text("国债").font(Theme.label).foregroundStyle(Theme.ink2)
                        PaperTag(text: ["信用良好", "负债尚可", "债务沉重", "濒临破产"][min(3, max(0, f.debtLevel ?? 0))], color: (f.debtLevel ?? 0) >= 2 ? Theme.seal : (f.debtLevel ?? 0) == 1 ? Theme.ink2 : Theme.jade)
                        Spacer()
                        Text(Names.wan(Int(f.debt ?? 0))).font(Theme.body).foregroundStyle(Theme.ink).monospacedDigit().contentTransition(.numericText())
                    }
                    if (f.debt ?? 0) > 0 { Text("每月利息 \(Int(f.interest ?? 0)) 金，相当于 \(Int(f.debtMonths ?? 0)) 个月收入；超过 48 个月将国家破产。").font(Theme.caption).foregroundStyle(Theme.ink2) }
                    HStack(spacing: 10) {
                        Button { Task { await debt(borrow: true) } } label: { SecondaryLabel(title: "举债一年岁入", symbol: "arrow.down.circle") }
                        Button { Task { await debt(borrow: false) } } label: { SecondaryLabel(title: "偿还国债", symbol: "arrow.up.circle") }
                    }
                    .buttonStyle(PressStyle())
                }
                .padding(.horizontal, 16).padding(.vertical, 10)
                Divider2()
                VStack(alignment: .leading, spacing: 8) {
                    Text("税制").font(Theme.label).foregroundStyle(Theme.ink2)
                    ChipPicker(items: Self.policies.map { ($0.0, $0.1) }, selection: Binding(get: { f.policy }, set: { v in choose(v) }))
                    Text(Self.policies.first { $0.0 == f.policy }?.2 ?? "").font(Theme.caption).foregroundStyle(Theme.ink2)
                }
                .padding(.horizontal, 16).padding(.vertical, 10)
            } else {
                PanelPending(failed: failed) { attempt += 1 }
            }
        }
        .padding(.horizontal, 16)
        .task(id: "\(nation)-\(day)-\(attempt)") { info = await model.financeInfo(nation); failed = info == nil }
    }
    @State private var note: String?
    private func corruption(lower: Bool) async {
        let before = Int(info?.corruption ?? 0), refused = await model.changeCorruption(nation, lower: lower)
        info = await model.financeInfo(nation)
        say(refused ?? (lower ? "整肃吏治：腐化度 \(before) → \(Int(info?.corruption ?? 0))" : "腐化度 \(before) → \(Int(info?.corruption ?? 0))"))
        GameFeel.shared.notify(refused == nil ? .success : .error)
    }
    private func debt(borrow: Bool) async {
        let before = Int(info?.debt ?? 0), refused = await model.changeDebt(nation, borrow: borrow)
        info = await model.financeInfo(nation)
        say(refused ?? "国债 \(Names.wan(before)) → \(Names.wan(Int(info?.debt ?? 0)))")
        GameFeel.shared.notify(refused == nil ? .success : .error)
    }
    /// Sets the tax policy, then reloads the ledger.
    private func choose(_ policy: String) {
        Task { await apply(policy) }
    }
    private func apply(_ policy: String) async {
        let refused = await model.setTax(nation, policy)
        info = await model.financeInfo(nation)
        say(refused ?? "税制改为\(Self.policies.first { $0.0 == policy }?.1 ?? "")")
        GameFeel.shared.notify(refused == nil ? .success : .error)
    }
    static let policies = [("light", "轻徭薄赋", "收入 −20%，国运每月 +0.1，人口增长加快"), ("normal", "常税", "按原作税收"), ("heavy", "重税", "收入 +30%，国运每月 −0.15，人口缓慢流失")]
    private func line(_ label: String, _ value: String, warn: Bool = false, strong: Bool = false) -> some View {
        HStack {
            Text(label).font(Theme.body).foregroundStyle(Theme.ink2)
            Spacer()
            Text(value).font((strong ? Theme.section : Theme.body)).foregroundStyle(warn ? Theme.seal : Theme.ink).monospacedDigit()
        }
        .padding(.horizontal, 16).padding(.vertical, 6)
    }
}

/// A small ink line of values (the treasury's last two years).
struct Sparkline: View {
    let values: [Double]
    var body: some View {
        GeometryReader { g in
            if values.count >= 2, let lo = values.min(), let hi = values.max() {
                let span = max(1, hi - lo)
                Path { p in
                    for (i, v) in values.enumerated() {
                        let pt = CGPoint(x: g.size.width * CGFloat(i) / CGFloat(values.count - 1), y: g.size.height * (1 - CGFloat((v - lo) / span)))
                        if i == 0 { p.move(to: pt) } else { p.addLine(to: pt) }
                    }
                }
                .stroke((values.last ?? 0) >= (values.first ?? 0) ? Theme.jade : Theme.seal, style: StrokeStyle(lineWidth: 1.6, lineCap: .round, lineJoin: .round))
            } else {
                Text("记录中").font(Theme.caption).foregroundStyle(Theme.ink2).frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
    }
}

/// One state's specialties and trade (engine tradeInfo).
struct TradeOverview: Decodable {
    struct Good: Decodable { let name: String; let provinces: Int }
    struct Partner: Decodable { let nation: Int; let goods: [String] }
    let goods: [Good]; let partners: [Partner]; let rate: Double; let income: Double
}

/// 特产与贸易: the kinds of goods the state yields, its partners at peace and what each sells it,
/// and what the trade adds to the monthly income.
struct TradeSection: View {
    @ObservedObject var model: GameModel
    let map: WorldMap; let nation: Int; let day: Int
    @State private var info: TradeOverview?
    @State private var failed = false
    @State private var attempt = 0
    var body: some View {
        Group2 {
            if let info {
                HStack {
                    Text("贸易增收").font(Theme.body).foregroundStyle(Theme.ink2)
                    Spacer()
                    Text("每月 +\(Int(info.income)) 金（+\(String(format: "%.1f", info.rate))%）").font(Theme.body).foregroundStyle(Theme.seal)
                }
                .padding(.horizontal, 16).padding(.vertical, 10)
                Divider2()
                VStack(alignment: .leading, spacing: 6) {
                    Text("本国特产").font(Theme.label).foregroundStyle(Theme.ink2)
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 5) {
                            ForEach(info.goods.indices, id: \.self) { i in
                                Text("\(info.goods[i].name) \(info.goods[i].provinces)").font(Theme.label).foregroundStyle(Theme.ink)
                                    .padding(.horizontal, 7).padding(.vertical, 2).background(Theme.paper2, in: Capsule()).overlay(Capsule().stroke(Theme.line))
                            }
                        }
                    }
                }
                .padding(.horizontal, 16).padding(.vertical, 10)
                if !info.partners.isEmpty {
                    Divider2()
                    ForEach(info.partners.indices, id: \.self) { i in
                        let p = info.partners[i]
                        HStack(alignment: .firstTextBaseline, spacing: 8) {
                            Text(p.nation >= 0 && p.nation < map.meta.nations.count ? map.meta.nations[p.nation].name : "").font(Theme.body).foregroundStyle(Theme.ink)
                            Spacer()
                            Text(p.goods.isEmpty ? "无新货" : p.goods.joined(separator: "、")).font(Theme.label).foregroundStyle(Theme.ink2).lineLimit(1)
                        }
                        .padding(.horizontal, 16).padding(.vertical, 7)
                    }
                }
            } else {
                PanelPending(failed: failed) { attempt += 1 }
            }
        }
        .padding(.horizontal, 16)
        .task(id: "\(nation)-\(day)-\(attempt)") { info = await model.tradeInfo(nation); failed = info == nil }
    }
}

/// 族谱: a house by generations — header summary (ruling/influence/wealth/fiefs/inheritance/rename),
/// each member with head/heir/office/spouse/parent/traits, collateral branch, and full member actions.
/// 数据与分代在 LieguojiCore.FamilyTree（宽容解码、去重、防环），此处只负责展示与操作。
struct FamilyTreeSheet: View {
    @ObservedObject var model: GameModel
    let family: String; let name: String
    /// 载入中 / 载入失败（可重试）/ 已载入。
    private enum Load { case loading, failed, loaded(FamilyTree) }
    @State private var load = Load.loading
    /// 当前浏览中的家族（可从「世家往来」跳转至联姻或敌对世家并随时返回）。
    @State private var activeFamily: String
    @State private var activeName: String
    /// 每次请求的序号：只采用最后一次请求的结果，先发后到的旧结果不覆盖新结果。
    @State private var request = 0
    /// 正在执行的成员操作：执行期间不再接受新的操作，避免连点重复婚配、重复添丁。
    @State private var busy = false
    /// 族谱操作: the member or related house whose actions are offered.
    @State private var pressMenu: PressMenu?
    @State private var flash: String?
    @State private var editing: NationInfo.Person?
    @State private var ageEdit: FamilyTree.Member?
    @State private var renamingHouse = false
    @State private var newSurname = ""

    init(model: GameModel, family: String, name: String) {
        self.model = model
        self.family = family
        self.name = name
        _activeFamily = State(initialValue: family)
        _activeName = State(initialValue: name)
    }

    private var tree: FamilyTree? { if case .loaded(let t) = load { return t }; return nil }
    private var displayTitle: String {
        if let s = tree?.surname, !s.isEmpty { return NamingCatalog.houseLabel(s) }
        return activeName
    }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                if activeFamily != family {
                    Button {
                        GameFeel.shared.tap()
                        switchFamily(to: family, name: name)
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "chevron.left").font(.system(size: 12, weight: .semibold))
                            Text("返回\(name)").font(Theme.label)
                        }
                        .foregroundStyle(Theme.seal)
                        .padding(.horizontal, 12).padding(.vertical, 5)
                        .background(Theme.seal.opacity(0.08), in: Capsule())
                        .overlay(Capsule().stroke(Theme.seal.opacity(0.25), lineWidth: 0.8))
                    }
                    .buttonStyle(PressStyle())
                    .padding(.horizontal, 22).padding(.top, 12)
                }
                SheetHeader(
                    title: displayTitle,
                    subtitle: tree.map { t in
                        let total = t.members.count + t.collaterals.count
                        let realm = t.nationName.isEmpty ? "" : "\(t.nationName) · "
                        return "\(realm)本支 \(t.members.count) 人" + (t.collaterals.isEmpty ? "" : " · 旁系 \(t.collaterals.count) 人（共 \(total) 人）")
                    } ?? "族谱",
                    seal: "谱"
                )
                switch load {
                case .loading:
                    InkBusy(text: "载入……").frame(maxWidth: 200).frame(maxWidth: .infinity).padding(30)
                case .failed:
                    VStack(spacing: 12) {
                        Text("族谱未能载入：这一家族可能已不存在，或世界已切换。").font(Theme.body).foregroundStyle(Theme.ink2).multilineTextAlignment(.center)
                        Button { Task { await reload() } } label: {
                            Text("重试").font(Theme.body).foregroundStyle(Theme.seal).padding(.horizontal, 18).padding(.vertical, 8)
                                .overlay(Capsule().stroke(Theme.seal.opacity(0.6), lineWidth: 1))
                        }
                        .buttonStyle(PressStyle())
                    }
                    .frame(maxWidth: .infinity).padding(24)
                case .loaded(let tree) where tree.members.isEmpty && tree.collaterals.isEmpty:
                    Text("族中已无可考之人。").font(Theme.body).foregroundStyle(Theme.ink2).frame(maxWidth: .infinity).padding(24)
                case .loaded(let tree):
                    houseSummary(tree)
                    if !tree.relations.isEmpty {
                        relationsSection(tree)
                    }
                    ForEach(tree.generations.indices, id: \.self) { g in
                        SectionLabel("第\(FamilyTree.numeral(g + 1))代")
                        Group2 {
                            ForEach(tree.generations[g]) { m in
                                row(m, tree, showParent: g > 0)
                                if m.id != tree.generations[g].last?.id { Divider2() }
                            }
                        }
                        .padding(.horizontal, 16)
                    }
                    if !tree.collaterals.isEmpty {
                        SectionLabel("旁系宗亲")
                        Group2 {
                            ForEach(tree.collaterals) { m in
                                row(m, tree, showParent: false)
                                if m.id != tree.collaterals.last?.id { Divider2() }
                            }
                        }
                        .padding(.horizontal, 16)
                    }
                    if !tree.events.isEmpty {
                        SectionLabel("本族纪事")
                        Group2 {
                            ForEach(Array(tree.events.prefix(8).enumerated()), id: \.offset) { idx, e in
                                VStack(alignment: .leading, spacing: 2) {
                                    Text("第 \(e.day + 1) 日").font(Theme.caption).foregroundStyle(Theme.ink2)
                                    Text(e.text).font(Theme.body).foregroundStyle(Theme.ink).fixedSize(horizontal: false, vertical: true)
                                }
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .padding(.horizontal, 16).padding(.vertical, 8)
                                if idx < min(tree.events.count, 8) - 1 { Divider2() }
                            }
                        }
                        .padding(.horizontal, 16)
                    }
                }
            }
            .padding(.bottom, 24)
        }
        .task(id: activeFamily) { await reload() }
        .pressMenuHost($pressMenu)
        .paperToast($flash)
        .sheet(item: $editing) { p in
            PersonEditor(person: p) { skills, traits, first, last, age in
                editing = nil
                perform {
                    let e = await model.renamePerson(p.key, first: first, last: last, age: age)
                    return (e == nil ? await model.editPerson(p.key, skills: skills, traits: traits) : e, "\(p.name)已修改")
                }
            }
            .presentationDetents([.large]).presentationBackground { MemorialPaper() }.presentationDragIndicator(.hidden).font(Theme.section)
        }
        .sheet(item: $ageEdit) { m in
            NumberEditSheet(title: m.name + "的年龄", unit: "岁", value: m.age, range: 0...110) { v in
                ageEdit = nil
                let age = Int(v.rounded())
                perform { (await model.renamePerson(m.id, first: nil, last: nil, age: age), "\(m.name)已改为\(age)岁") }
            }
            .presentationDetents([.height(370)]).presentationBackground { MemorialPaper() }.presentationDragIndicator(.hidden).font(Theme.section)
        }
        .sheet(isPresented: $renamingHouse) {
            VStack(alignment: .leading, spacing: 14) {
                SheetHeader(title: "修改族姓", subtitle: "本家成员姓氏随之更易", seal: "姓")
                TextField("", text: $newSurname, prompt: Text(tree?.surname ?? "族姓").foregroundColor(Theme.ink2.opacity(0.6))).paperField().padding(.horizontal, 22)
                SealButton(title: "颁行", disabled: newSurname.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty) {
                    let s = newSurname.trimmingCharacters(in: .whitespacesAndNewlines)
                    renamingHouse = false
                    perform { (await model.edit("editFamily", ["family": activeFamily, "surname": s, "influence": NSNull(), "strip": 0]), "族姓已改为\(s)") }
                }
                .padding(.horizontal, 22)
            }
            .padding(.bottom, 20)
            .presentationDetents([.height(270)]).presentationBackground { MemorialPaper() }.presentationDragIndicator(.hidden).font(Theme.section)
        }
    }
    private func switchFamily(to id: String, name: String) {
        activeFamily = id
        activeName = name
        load = .loading
    }
    /// 家族概览卡：宗室/世家地位、势力与财富、封地、朝廷恩威、女性继承开关与改族姓。
    private func houseSummary(_ tree: FamilyTree) -> some View {
        Group2 {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 8) {
                    PaperTag(text: tree.ruling ? "宗室" : "世家", color: tree.ruling ? Theme.seal : Theme.ink)
                    if let h = tree.headMember { Text("家主 \(h.name)").font(Theme.label).foregroundStyle(Theme.ink).lineLimit(1) }
                    Spacer()
                    Button {
                        newSurname = tree.surname
                        renamingHouse = true
                    } label: {
                        HStack(spacing: 3) {
                            Image(systemName: "pencil").font(.system(size: 11))
                            Text("改族姓").font(Theme.label)
                        }
                        .foregroundStyle(Theme.seal)
                        .padding(.horizontal, 10).padding(.vertical, 4)
                        .background(Theme.seal.opacity(0.08), in: Capsule())
                    }
                    .buttonStyle(PressStyle()).disabled(busy)
                }
                HStack(spacing: 14) {
                    Text("势力 \(Int(tree.influence))").font(Theme.label).foregroundStyle(Theme.ink2).monospacedDigit()
                    Text("财富 \(Int(tree.wealth))").font(Theme.label).foregroundStyle(Theme.ink2).monospacedDigit()
                    Text("封地 \(tree.provinces.count) 州").font(Theme.label).foregroundStyle(Theme.ink2).monospacedDigit()
                }
                if !tree.provinces.isEmpty {
                    Text("所领：\(tree.provinces.prefix(6).joined(separator: "、"))\(tree.provinces.count > 6 ? "等" : "")")
                        .font(Theme.caption).foregroundStyle(Theme.ink2).lineLimit(2)
                }
                if !tree.ruling {
                    HStack(spacing: 8) {
                        Button {
                            GameFeel.shared.tap()
                            perform { (await model.edit("houseDiplomacy", ["a": activeFamily, "b": NSNull(), "kind": "favor"]), "已赏赐安抚（势力 +40，关系 +20）") }
                        } label: {
                            HStack(spacing: 4) {
                                InkIcon(glyph: .edict, size: 13, weight: 1.8)
                                Text("赏赐安抚").font(Theme.label)
                            }
                            .foregroundStyle(Theme.jade)
                            .frame(maxWidth: .infinity).frame(height: 32)
                            .background(Theme.jade.opacity(0.09), in: Capsule())
                            .overlay(Capsule().stroke(Theme.jade.opacity(0.3)))
                        }
                        .buttonStyle(PressStyle()).disabled(busy)
                        Button {
                            GameFeel.shared.tap()
                            perform { (await model.edit("houseDiplomacy", ["a": activeFamily, "b": NSNull(), "kind": "suppress"]), "已削夺权柄（势力 −60，关系 −25）") }
                        } label: {
                            HStack(spacing: 4) {
                                InkIcon(glyph: .war, size: 13, weight: 1.8)
                                Text("削夺权柄").font(Theme.label)
                            }
                            .foregroundStyle(Theme.seal)
                            .frame(maxWidth: .infinity).frame(height: 32)
                            .background(Theme.seal.opacity(0.09), in: Capsule())
                            .overlay(Capsule().stroke(Theme.seal.opacity(0.3)))
                        }
                        .buttonStyle(PressStyle()).disabled(busy)
                    }
                }
                Divider2()
                PaperSwitch(title: "允许女性继承（家主与王位）", on: Binding(
                    get: { tree.allowFemale },
                    set: { v in
                        perform { (await model.edit("editFamily", ["family": activeFamily, "surname": NSNull(), "influence": NSNull(), "strip": 0, "allowFemale": v ? 1 : 0]), v ? "已允许女性继承" : "已改为男系优先继承") }
                    }
                ))
            }
            .padding(14)
        }
        .padding(.horizontal, 16)
    }
    /// 世家往来：同国各世家与外邦姻亲的关系网，点任一家可撮合联姻、斡旋结好、挑拨离间或查看其族谱。
    @ViewBuilder private func relationsSection(_ tree: FamilyTree) -> some View {
        SectionLabel("世家往来")
        Group2 {
            ForEach(Array(tree.relations.enumerated()), id: \.element.id) { idx, rel in
                HStack(spacing: 8) {
                    Text(rel.name).font(Theme.body).foregroundStyle(Theme.ink).lineLimit(1)
                    if rel.ruling { PaperTag(text: "宗室", color: Theme.seal, size: 11) }
                    if !rel.nation.isEmpty { Text(rel.nation).font(Theme.caption).foregroundStyle(Theme.ink2).lineLimit(1) }
                    Spacer(minLength: 4)
                    PaperTag(text: rel.label, color: Self.relationColor(rel), size: 11)
                    Text("\(rel.score > 0 ? "+" : "")\(Int(rel.score))").font(Theme.label)
                        .foregroundStyle(rel.score >= 20 ? Theme.jade : rel.score <= -20 ? Theme.seal : Theme.ink2)
                        .monospacedDigit().frame(minWidth: 30, alignment: .trailing)
                    Image(systemName: "ellipsis.circle").font(.system(size: 13)).foregroundStyle(Theme.seal.opacity(busy ? 0.3 : 0.7))
                }
                .padding(.horizontal, 16).padding(.vertical, 9)
                .contentShape(Rectangle())
                .onTapGesture {
                    guard !busy else { return }
                    pressMenu = PressMenu(
                        title: "\(displayTitle) × \(rel.name)",
                        subtitle: "\(rel.label) · 关系 \(rel.score > 0 ? "+" : "")\(Int(rel.score))\(rel.nation.isEmpty ? "" : " · \(rel.nation)")",
                        items: [
                            PressMenuItem(title: "撮合两家联姻（关系 +25）", symbol: "heart.circle") {
                                perform { (await model.edit("marryHouses", ["a": activeFamily, "b": rel.id]), "\(displayTitle)与\(rel.name)喜结秦晋之好") }
                            },
                            PressMenuItem(title: "斡旋修好（关系 +25）", symbol: "person.2.fill") {
                                perform { (await model.edit("houseDiplomacy", ["a": activeFamily, "b": rel.id, "kind": "befriend"]), "两家关系 +25") }
                            },
                            PressMenuItem(title: "挑拨离间（关系 −30）", symbol: "flame", destructive: true) {
                                perform { (await model.edit("houseDiplomacy", ["a": activeFamily, "b": rel.id, "kind": "estrange"]), "两家关系 −30") }
                            },
                            PressMenuItem(title: "查看\(rel.name)族谱", symbol: "person.3") {
                                switchFamily(to: rel.id, name: rel.name)
                            },
                        ]
                    )
                }
                if idx < tree.relations.count - 1 { Divider2() }
            }
        }
        .padding(.horizontal, 16)
    }
    private static func relationColor(_ rel: FamilyTree.Relation) -> Color {
        if rel.married && rel.score >= 15 { return Theme.jade }
        if rel.score >= 55 { return Theme.jade }
        if rel.score >= 20 { return Color(red: 0.22, green: 0.48, blue: 0.38) }
        if rel.score <= -55 { return Color(red: 0.48, green: 0.1, blue: 0.1) }
        if rel.score <= -20 { return Theme.seal }
        return rel.married ? Color(red: 0.65, green: 0.34, blue: 0.46) : Theme.ink2
    }
    private func row(_ m: FamilyTree.Member, _ tree: FamilyTree, showParent: Bool) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack(spacing: 6) {
                Text(m.name).font(Theme.section).foregroundStyle(m.alive ? Theme.ink : Theme.ink2.opacity(0.6)).lineLimit(1).layoutPriority(1)
                if m.id == tree.head {
                    Text("家主").font(Theme.caption).foregroundStyle(Theme.paper2).padding(.horizontal, 5).padding(.vertical, 1).background(Theme.seal, in: Capsule())
                } else if m.id == tree.heir {
                    Text("继承人").font(Theme.caption).foregroundStyle(Theme.paper2).padding(.horizontal, 5).padding(.vertical, 1).background(Theme.jade, in: Capsule())
                }
                if m.collateral {
                    Text("旁系").font(Theme.caption).foregroundStyle(Theme.ink2).padding(.horizontal, 5).padding(.vertical, 1).overlay(Capsule().stroke(Theme.line))
                }
                if !m.title.isEmpty { Text(m.title).font(Theme.caption).foregroundStyle(Theme.seal).lineLimit(1) }
                Spacer(minLength: 4)
                if let s = tree.spouse(of: m) { Text("配 \(s.name)").font(Theme.label).foregroundStyle(Theme.ink2).lineLimit(1) }
                Text(m.alive ? "\(m.female ? "女" : "男") · \(Int(m.age))" : "已故").font(Theme.label).foregroundStyle(Theme.ink2).fixedSize()
                if m.alive { Image(systemName: "ellipsis.circle").font(.system(size: 13)).foregroundStyle(Theme.seal.opacity(busy ? 0.3 : 0.7)) }
            }
            let parentNote: String? = showParent ? tree.parent(of: m).map { "\($0.female ? "母" : "父") \($0.name)" } : nil
            let natalNote: String? = m.natalHouse.isEmpty ? nil : "出身 \(NamingCatalog.houseLabel(m.natalHouse))"
            let traitsNote: String? = m.traits.isEmpty ? nil : m.traits.prefix(3).joined(separator: "·")
            let parts = [parentNote, natalNote, traitsNote].compactMap { $0 }
            if !parts.isEmpty {
                Text(parts.joined(separator: "  ·  ")).font(Theme.caption).foregroundStyle(Theme.ink2).lineLimit(1)
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 8)
        .contentShape(Rectangle())
        .onTapGesture { if m.alive && !busy { pressMenu = actions(m, tree) } }
    }
    /// 重新读取族谱；只有最后一次请求的结果会被采用。
    private func reload() async {
        request &+= 1
        let mine = request
        if tree == nil { load = .loading }
        let t = await model.familyTree(activeFamily)
        guard mine == request, !Task.isCancelled else { return }
        load = t.map { .loaded($0) } ?? .failed
    }
    /// 族谱操作 on a living member.
    private func actions(_ m: FamilyTree.Member, _ tree: FamilyTree) -> PressMenu {
        var items = [PressMenuItem(title: "修改姓名、能力与天赋", symbol: "slider.horizontal.3") {
            editing = NationInfo.Person(id: m.id, role: m.title.isEmpty ? (m.id == tree.head ? "家主" : m.id == tree.heir ? "继承人" : "族人") : m.title, name: m.name, age: m.age, female: m.female, traits: m.traits, skills: m.skills)
        }, PressMenuItem(title: "设定年龄", symbol: "calendar") { ageEdit = m }]
        if !m.collateral && m.id != tree.head {
            items.append(PressMenuItem(title: "立为家主", symbol: "crown") { act(m, "promoteHead", "\(m.name)已立为家主") })
            if m.id != tree.heir {
                items.append(PressMenuItem(title: "指定为继承人", symbol: "person.badge.key") { act(m, "setHeir", "已指定\(m.name)为继承人") })
            }
        }
        // 配偶不在族谱里（外嫁、记录缺失）时，交给引擎判定能否添丁。
        if m.spouse == 0 || tree.spouse(of: m)?.alive == false { items.append(PressMenuItem(title: "为其婚配", symbol: "heart") { act(m, "spouse", "婚配已成") }) }
        else { items.append(PressMenuItem(title: "添一子女", symbol: "figure.and.child.holdinghands") { act(m, "child", "家添新丁") }) }
        items.append(PressMenuItem(title: "处死", symbol: "xmark.seal", destructive: true) { act(m, "kill", "\(m.name)已被处死") })
        return PressMenu(title: m.name, subtitle: "\(m.female ? "女" : "男") · \(Int(m.age)) 岁", items: items)
    }
    private func act(_ m: FamilyTree.Member, _ action: String, _ success: String) {
        perform { (await model.familyAction(m.id, action: action), success) }
    }
    /// 执行一项操作：返回（错误原因或 nil，成功提示），结束后重读族谱。
    private func perform(_ op: @escaping @MainActor () async -> (String?, String)) {
        guard !busy else { return }
        busy = true
        Task { @MainActor in
            let (e, success) = await op()
            flash = e ?? success; GameFeel.shared.notify(e == nil ? .success : .error)
            await reload()
            busy = false
        }
    }
}
