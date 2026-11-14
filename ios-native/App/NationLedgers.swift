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
    var body: some View {
        Group2 {
            if let f = info {
                HStack(alignment: .center, spacing: 12) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("国库").font(Theme.kai(14)).foregroundStyle(Theme.ink2)
                        Text(Names.wan(Int(f.gold))).font(Theme.kai(22)).foregroundStyle(f.gold < 0 ? Theme.seal : Theme.ink)
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
                            Text("腐化度").font(Theme.kai(14)).foregroundStyle(Theme.ink2)
                            Spacer()
                            Text("\(f.corruptionLevel ?? "") · \(Int(c))").font(Theme.kai(15)).foregroundStyle(c >= 40 ? Theme.seal : Theme.ink)
                        }
                        GeometryReader { g in
                            ZStack(alignment: .leading) {
                                Capsule().fill(Theme.ink.opacity(0.1))
                                Capsule().fill(c >= 65 ? Theme.seal : c >= 40 ? Theme.seal.opacity(0.65) : Theme.jade).frame(width: g.size.width * CGFloat(min(100, c)) / 100)
                            }
                        }
                        .frame(height: 5).animation(Motion.panel, value: c)
                        Text(c > 15 ? "每月收入约 −\(Int(c / 2.5))%" + (c >= 65 ? "，国运逐月下降" : "") + "。国土越大、税越重、施政越差，腐化越深。" : "吏治清明，收入不受影响。")
                            .font(Theme.kai(12)).foregroundStyle(Theme.ink2)
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
                        Text("国债").font(Theme.kai(14)).foregroundStyle(Theme.ink2)
                        PaperTag(text: ["信用良好", "负债尚可", "债务沉重", "濒临破产"][min(3, max(0, f.debtLevel ?? 0))], color: (f.debtLevel ?? 0) >= 2 ? Theme.seal : (f.debtLevel ?? 0) == 1 ? Theme.ink2 : Theme.jade)
                        Spacer()
                        Text(Names.wan(Int(f.debt ?? 0))).font(Theme.kai(15)).foregroundStyle(Theme.ink).monospacedDigit().contentTransition(.numericText())
                    }
                    if (f.debt ?? 0) > 0 { Text("每月利息 \(Int(f.interest ?? 0)) 金，相当于 \(Int(f.debtMonths ?? 0)) 个月收入；超过 48 个月将国家破产。").font(Theme.kai(12)).foregroundStyle(Theme.ink2) }
                    HStack(spacing: 10) {
                        Button { Task { await debt(borrow: true) } } label: { SecondaryLabel(title: "举债一年岁入", symbol: "arrow.down.circle") }
                        Button { Task { await debt(borrow: false) } } label: { SecondaryLabel(title: "偿还国债", symbol: "arrow.up.circle") }
                    }
                    .buttonStyle(PressStyle())
                }
                .padding(.horizontal, 16).padding(.vertical, 10)
                Divider2()
                VStack(alignment: .leading, spacing: 8) {
                    Text("税制").font(Theme.kai(14)).foregroundStyle(Theme.ink2)
                    ChipPicker(items: Self.policies.map { ($0.0, $0.1) }, selection: Binding(get: { f.policy }, set: { v in choose(v) }))
                    Text(Self.policies.first { $0.0 == f.policy }?.2 ?? "").font(Theme.kai(12)).foregroundStyle(Theme.ink2)
                }
                .padding(.horizontal, 16).padding(.vertical, 10)
            } else {
                Text("载入……").font(Theme.kai(15)).foregroundStyle(Theme.ink2).frame(maxWidth: .infinity).padding(.vertical, 14)
            }
        }
        .padding(.horizontal, 16)
        .task(id: "\(nation)-\(day)") { info = await model.financeInfo(nation) }
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
            Text(label).font(Theme.kai(15)).foregroundStyle(Theme.ink2)
            Spacer()
            Text(value).font(Theme.kai(strong ? 17 : 15)).foregroundStyle(warn ? Theme.seal : Theme.ink).monospacedDigit()
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
                Text("记录中").font(Theme.kai(12)).foregroundStyle(Theme.ink2).frame(maxWidth: .infinity, maxHeight: .infinity)
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
    var body: some View {
        Group2 {
            if let info {
                HStack {
                    Text("贸易增收").font(Theme.kai(16)).foregroundStyle(Theme.ink2)
                    Spacer()
                    Text("每月 +\(Int(info.income)) 金（+\(String(format: "%.1f", info.rate))%）").font(Theme.kai(16)).foregroundStyle(Theme.seal)
                }
                .padding(.horizontal, 16).padding(.vertical, 10)
                Divider2()
                VStack(alignment: .leading, spacing: 6) {
                    Text("本国特产").font(Theme.kai(14)).foregroundStyle(Theme.ink2)
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 5) {
                            ForEach(info.goods.indices, id: \.self) { i in
                                Text("\(info.goods[i].name) \(info.goods[i].provinces)").font(Theme.kai(13)).foregroundStyle(Theme.ink)
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
                            Text(p.nation >= 0 && p.nation < map.meta.nations.count ? map.meta.nations[p.nation].name : "").font(Theme.kai(15)).foregroundStyle(Theme.ink)
                            Spacer()
                            Text(p.goods.isEmpty ? "无新货" : p.goods.joined(separator: "、")).font(Theme.kai(13)).foregroundStyle(Theme.ink2).lineLimit(1)
                        }
                        .padding(.horizontal, 16).padding(.vertical, 7)
                    }
                }
            } else {
                Text("载入……").font(Theme.kai(15)).foregroundStyle(Theme.ink2).frame(maxWidth: .infinity).padding(.vertical, 14)
            }
        }
        .padding(.horizontal, 16)
        .task(id: "\(nation)-\(day)") { info = await model.tradeInfo(nation) }
    }
}

/// One house's members (engine familyTree).
struct FamilyTree: Decodable {
    struct Member: Decodable, Identifiable { let id: Int; let name: String; let female: Bool; let age: Double; let alive: Bool; let father: Int; let mother: Int; let spouse: Int; let title: String; var traits: [String]? = nil; var skills: [Double]? = nil }
    let surname: String; let head: Int; let members: [Member]
}

/// 族谱: a house by generations — each member with spouse, the head marked, the dead in grey.
struct FamilyTreeSheet: View {
    @ObservedObject var model: GameModel
    let family: String; let name: String
    @State private var tree: FamilyTree?
    /// 族谱操作: the member whose actions are offered.
    @State private var pressMenu: PressMenu?
    @State private var flash: String?
    @State private var editing: NationInfo.Person?
    @State private var ageEdit: FamilyTree.Member?
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                SheetHeader(title: name, subtitle: tree.map { "族谱 · \($0.members.count) 人" } ?? "族谱", seal: "谱")
                if let tree {
                    let byId = Dictionary(tree.members.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
                    let generations = Self.generations(tree.members, byId)
                    ForEach(generations.indices, id: \.self) { g in
                        SectionLabel("第\(Self.numeral(g + 1))代")
                        Group2 {
                            ForEach(generations[g].indices, id: \.self) { i in
                                let m = generations[g][i]
                                HStack(spacing: 8) {
                                    Text(m.name).font(Theme.kai(17)).foregroundStyle(m.alive ? Theme.ink : Theme.ink2.opacity(0.6))
                                    if m.id == tree.head { Text("家主").font(Theme.kai(11)).foregroundStyle(Theme.paper2).padding(.horizontal, 5).padding(.vertical, 1).background(Theme.seal, in: Capsule()) }
                                    if !m.title.isEmpty { Text(m.title).font(Theme.kai(12)).foregroundStyle(Theme.seal) }
                                    Spacer()
                                    if m.spouse > 0, let s = byId[m.spouse] { Text("配 \(s.name)").font(Theme.kai(13)).foregroundStyle(Theme.ink2) }
                                    Text(m.alive ? "\(m.female ? "女" : "男") · \(Int(m.age))" : "已故").font(Theme.kai(13)).foregroundStyle(Theme.ink2)
                                    if m.alive { Image(systemName: "ellipsis.circle").font(.system(size: 13)).foregroundStyle(Theme.seal.opacity(0.7)) }
                                }
                                .padding(.horizontal, 16).padding(.vertical, 8)
                                .contentShape(Rectangle())
                                .onTapGesture { if m.alive { pressMenu = actions(m) } }
                                if i < generations[g].count - 1 { Divider2() }
                            }
                        }
                        .padding(.horizontal, 16)
                    }
                } else {
                    InkBusy(text: "载入……").frame(maxWidth: 200).frame(maxWidth: .infinity).padding(30)
                }
            }
            .padding(.bottom, 24)
        }
        .task { tree = await model.familyTree(family) }
        .pressMenuHost($pressMenu)
        .paperToast($flash)
        .sheet(item: $editing) { p in
            PersonEditor(person: p) { skills, traits, first, last, age in
                editing = nil
                Task {
                    let e = await model.renamePerson(p.key, first: first, last: last, age: age)
                    let e2 = e == nil ? await model.editPerson(p.key, skills: skills, traits: traits) : e
                    flash = e2 ?? "\(p.name)已修改"; GameFeel.shared.notify(e2 == nil ? .success : .error)
                    tree = await model.familyTree(family)
                }
            }
            .presentationDetents([.large]).presentationBackground { MemorialPaper() }.presentationDragIndicator(.hidden).font(Theme.kai(17))
        }
        .sheet(item: $ageEdit) { m in
            NumberEditSheet(title: m.name + "的年龄", unit: "岁", value: m.age) { v in
                ageEdit = nil
                Task {
                    let e = await model.renamePerson(m.id, first: nil, last: nil, age: Int(v))
                    flash = e ?? "\(m.name)已改为\(Int(v))岁"; GameFeel.shared.notify(e == nil ? .success : .error)
                    tree = await model.familyTree(family)
                }
            }
            .presentationDetents([.height(370)]).presentationBackground { MemorialPaper() }.presentationDragIndicator(.hidden).font(Theme.kai(17))
        }
    }
    /// 族谱操作 on a living member.
    private func actions(_ m: FamilyTree.Member) -> PressMenu {
        var items = [PressMenuItem(title: "修改能力与天赋", symbol: "slider.horizontal.3") {
            editing = NationInfo.Person(id: m.id, role: m.title.isEmpty ? (m.id == tree?.head ? "家主" : "族人") : m.title, name: m.name, age: m.age, female: m.female, traits: m.traits ?? [], skills: m.skills ?? [50, 50, 50, 50])
        }, PressMenuItem(title: "设定年龄", symbol: "calendar") { ageEdit = m }]
        if m.spouse == 0 || tree?.members.first(where: { $0.id == m.spouse })?.alive != true { items.append(PressMenuItem(title: "为其婚配", symbol: "heart") { act(m, "spouse", "婚配已成") }) }
        else { items.append(PressMenuItem(title: "添一子女", symbol: "figure.and.child.holdinghands") { act(m, "child", "家添新丁") }) }
        items.append(PressMenuItem(title: "处死", symbol: "xmark.seal", destructive: true) { act(m, "kill", "\(m.name)已被处死") })
        return PressMenu(title: m.name, subtitle: "\(m.female ? "女" : "男") · \(Int(m.age)) 岁", items: items)
    }
    private func act(_ m: FamilyTree.Member, _ action: String, _ success: String) {
        Task {
            let e = await model.familyAction(m.id, action: action)
            flash = e ?? success; GameFeel.shared.notify(e == nil ? .success : .error)
            tree = await model.familyTree(family)
        }
    }
    /// Generations by descent inside the house: those with no parent in it first, then their children.
    static func generations(_ members: [FamilyTree.Member], _ byId: [Int: FamilyTree.Member]) -> [[FamilyTree.Member]] {
        var depth = [Int: Int]()
        func level(_ m: FamilyTree.Member, _ guardDepth: Int = 0) -> Int {
            if let d = depth[m.id] { return d }
            if guardDepth > 30 { return 0 }
            let parent = byId[m.father] ?? byId[m.mother]
            let d = parent.map { level($0, guardDepth + 1) + 1 } ?? 0
            depth[m.id] = d; return d
        }
        var out = [[FamilyTree.Member]]()
        for m in members.sorted(by: { $0.age > $1.age }) {
            let d = level(m)
            while out.count <= d { out.append([]) }
            out[d].append(m)
        }
        return out.filter { !$0.isEmpty }
    }
    static func numeral(_ n: Int) -> String { let d = Array("零一二三四五六七八九"); return n < 10 ? String(d[n]) : n < 20 ? "十" + (n % 10 == 0 ? "" : String(d[n % 10])) : String(n) }
}
