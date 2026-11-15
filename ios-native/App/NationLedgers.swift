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
    @State private var failed = false
    @State private var attempt = 0
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
                PanelPending(failed: failed) { attempt += 1 }
            }
        }
        .padding(.horizontal, 16)
        .task(id: "\(nation)-\(day)-\(attempt)") { info = await model.tradeInfo(nation); failed = info == nil }
    }
}

/// 族谱: a house by generations — each member with spouse, the head marked, the dead in grey.
/// 数据与分代在 LieguojiCore.FamilyTree（宽容解码、去重、防环），此处只负责展示与操作。
struct FamilyTreeSheet: View {
    @ObservedObject var model: GameModel
    let family: String; let name: String
    /// 载入中 / 载入失败（可重试）/ 已载入。
    private enum Load { case loading, failed, loaded(FamilyTree) }
    @State private var load = Load.loading
    /// 每次请求的序号：只采用最后一次请求的结果，先发后到的旧结果不覆盖新结果。
    @State private var request = 0
    /// 正在执行的成员操作：执行期间不再接受新的操作，避免连点重复婚配、重复添丁。
    @State private var busy = false
    /// 族谱操作: the member whose actions are offered.
    @State private var pressMenu: PressMenu?
    @State private var flash: String?
    @State private var editing: NationInfo.Person?
    @State private var ageEdit: FamilyTree.Member?
    private var tree: FamilyTree? { if case .loaded(let t) = load { return t }; return nil }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                SheetHeader(title: name, subtitle: tree.map { "族谱 · \($0.members.count) 人" } ?? "族谱", seal: "谱")
                switch load {
                case .loading:
                    InkBusy(text: "载入……").frame(maxWidth: 200).frame(maxWidth: .infinity).padding(30)
                case .failed:
                    VStack(spacing: 12) {
                        Text("族谱未能载入：这一家族可能已不存在，或世界已切换。").font(Theme.kai(15)).foregroundStyle(Theme.ink2).multilineTextAlignment(.center)
                        Button { Task { await reload() } } label: {
                            Text("重试").font(Theme.kai(16)).foregroundStyle(Theme.seal).padding(.horizontal, 18).padding(.vertical, 8)
                                .overlay(Capsule().stroke(Theme.seal.opacity(0.6), lineWidth: 1))
                        }
                        .buttonStyle(PressStyle())
                    }
                    .frame(maxWidth: .infinity).padding(24)
                case .loaded(let tree) where tree.members.isEmpty:
                    Text("族中已无可考之人。").font(Theme.kai(15)).foregroundStyle(Theme.ink2).frame(maxWidth: .infinity).padding(24)
                case .loaded(let tree):
                    ForEach(tree.generations.indices, id: \.self) { g in
                        SectionLabel("第\(FamilyTree.numeral(g + 1))代")
                        Group2 {
                            ForEach(tree.generations[g]) { m in
                                row(m, tree)
                                if m.id != tree.generations[g].last?.id { Divider2() }
                            }
                        }
                        .padding(.horizontal, 16)
                    }
                }
            }
            .padding(.bottom, 24)
        }
        .task { await reload() }
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
            .presentationDetents([.large]).presentationBackground { MemorialPaper() }.presentationDragIndicator(.hidden).font(Theme.kai(17))
        }
        .sheet(item: $ageEdit) { m in
            NumberEditSheet(title: m.name + "的年龄", unit: "岁", value: m.age, range: 0...110) { v in
                ageEdit = nil
                let age = Int(v.rounded())
                perform { (await model.renamePerson(m.id, first: nil, last: nil, age: age), "\(m.name)已改为\(age)岁") }
            }
            .presentationDetents([.height(370)]).presentationBackground { MemorialPaper() }.presentationDragIndicator(.hidden).font(Theme.kai(17))
        }
    }
    private func row(_ m: FamilyTree.Member, _ tree: FamilyTree) -> some View {
        HStack(spacing: 8) {
            Text(m.name).font(Theme.kai(17)).foregroundStyle(m.alive ? Theme.ink : Theme.ink2.opacity(0.6)).lineLimit(1).layoutPriority(1)
            if m.id == tree.head { Text("家主").font(Theme.kai(11)).foregroundStyle(Theme.paper2).padding(.horizontal, 5).padding(.vertical, 1).background(Theme.seal, in: Capsule()) }
            if !m.title.isEmpty { Text(m.title).font(Theme.kai(12)).foregroundStyle(Theme.seal).lineLimit(1) }
            Spacer(minLength: 4)
            if let s = tree.spouse(of: m) { Text("配 \(s.name)").font(Theme.kai(13)).foregroundStyle(Theme.ink2).lineLimit(1) }
            Text(m.alive ? "\(m.female ? "女" : "男") · \(Int(m.age))" : "已故").font(Theme.kai(13)).foregroundStyle(Theme.ink2).fixedSize()
            if m.alive { Image(systemName: "ellipsis.circle").font(.system(size: 13)).foregroundStyle(Theme.seal.opacity(busy ? 0.3 : 0.7)) }
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
        let t = await model.familyTree(family)
        guard mine == request, !Task.isCancelled else { return }
        load = t.map { .loaded($0) } ?? .failed
    }
    /// 族谱操作 on a living member.
    private func actions(_ m: FamilyTree.Member, _ tree: FamilyTree) -> PressMenu {
        var items = [PressMenuItem(title: "修改能力与天赋", symbol: "slider.horizontal.3") {
            editing = NationInfo.Person(id: m.id, role: m.title.isEmpty ? (m.id == tree.head ? "家主" : "族人") : m.title, name: m.name, age: m.age, female: m.female, traits: m.traits, skills: m.skills)
        }, PressMenuItem(title: "设定年龄", symbol: "calendar") { ageEdit = m }]
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
