import SwiftUI
import LieguojiCore

/// 国家页顶部的五键快捷操控条：划疆、放兵、颁诏、疆土、看都城，让高频操控一触即达。
struct NationQuickBar: View {
    let onPaint: () -> Void
    let onPlaceArmy: () -> Void
    let onDecrees: () -> Void
    let onTerritory: () -> Void
    let onCapital: () -> Void
    var body: some View {
        HStack(spacing: 7) {
            quickButton(title: "划疆", glyph: .views, tint: Theme.ink, action: onPaint)
            quickButton(title: "放兵", glyph: .military, tint: Theme.seal, action: onPlaceArmy)
            quickButton(title: "颁诏", glyph: .edict, tint: Theme.seal, action: onDecrees)
            quickButton(title: "疆土", glyph: .region, tint: Theme.jade, action: onTerritory)
            quickButton(title: "都城", glyph: .crown, tint: Theme.ink, action: onCapital)
        }
        .padding(.horizontal, Theme.Layout.pageInset)
    }
    private func quickButton(title: String, glyph: InkGlyph, tint: Color, action: @escaping () -> Void) -> some View {
        Button {
            GameFeel.shared.tap()
            action()
        } label: {
            VStack(spacing: 3) {
                InkIcon(glyph: glyph, size: 17, weight: 1.75, accent: tint.opacity(0.24))
                    .foregroundStyle(tint)
                Text(title).font(Theme.caption).foregroundStyle(Theme.ink).lineLimit(1)
            }
            .frame(maxWidth: .infinity).frame(height: 48)
            .background(Theme.paper2.opacity(0.86), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(Theme.ink.opacity(0.16), lineWidth: 0.9))
        }
        .buttonStyle(PressStyle())
    }
}

/// 国家页「政令」标签：分类整洁排版（长期国策 + 内政民生 / 军事整备 / 文教宗教 12 项御批政令 + 禅位择君），告别满屏零乱按钮。
struct NationDecreesTab: View {
    @ObservedObject var model: GameModel
    let nation: Int
    let info: NationInfo
    let onToast: (String) -> Void
    let onReload: () async -> Void
    let onEnthrone: () -> Void
    @State private var busy = false
    @State private var category: Category = .reforms

    enum Category: String, CaseIterable {
        case reforms = "长期国策"
        case domestic = "内政民生"
        case military = "军事整备"
        case culture = "文教宗教"
    }

    struct DecreeItem: Identifiable {
        let id: String
        let category: Category
        let title: String
        let note: String
        let glyph: InkGlyph
        let tone: Color
    }

    static let decrees: [DecreeItem] = [
        // 内政民生
        DecreeItem(id: "prosper", category: .domestic, title: "休养生息", note: "全国增丁 3% · 存粮 +20% · 国运 +5", glyph: .goods, tone: Theme.jade),
        DecreeItem(id: "antiCorruption", category: .domestic, title: "整顿吏治", note: "腐化度 −15 · 国运 +4", glyph: .polity, tone: Theme.jade),
        DecreeItem(id: "relief", category: .domestic, title: "开仓赈灾", note: "斥资 200 金普赈诸州 · 存粮 +35% · 国运 +7", glyph: .economy, tone: Theme.jade),
        DecreeItem(id: "landSurvey", category: .domestic, title: "清丈田亩", note: "厘清税籍 · 即得半岁税收 · 腐化度 −8", glyph: .region, tone: Theme.ink),
        // 军事整备
        DecreeItem(id: "mobilize", category: .military, title: "全国大征兵", note: "择都城与大州急征至多 3 军 · 国运 −4", glyph: .military, tone: Theme.seal),
        DecreeItem(id: "rewardArmies", category: .military, title: "犒赏三军", note: "全军士气 +35 · 军粮补满", glyph: .command, tone: Theme.seal),
        DecreeItem(id: "fortifyBorder", category: .military, title: "加固边防", note: "边塞至多 12 州城防 +1 级", glyph: .nation, tone: Theme.ink),
        DecreeItem(id: "armsUpgrade", category: .military, title: "军械改良", note: "斥资 260 金焕新兵甲 · 全军士气 +25 · 补员", glyph: .war, tone: Theme.seal),
        // 文教宗教
        DecreeItem(id: "assimilateCulture", category: .culture, title: "推行文教", note: "境内城池归入本国主体文化", glyph: .culture, tone: Theme.ink),
        DecreeItem(id: "convertFaith", category: .culture, title: "统一国教", note: "境内诸州与世家归奉国教", glyph: .religion, tone: Theme.ink),
        DecreeItem(id: "amnesty", category: .culture, title: "大赦世家", note: "本国诸世家与宗室情谊各 +20", glyph: .house, tone: Theme.jade),
        DecreeItem(id: "academy", category: .culture, title: "兴办太学", note: "斥资 180 金兴建学宫 · 腐化度 −6 · 国运 +5", glyph: .chronicle, tone: Theme.jade),
    ]

    var body: some View {
        LazyVStack(alignment: .leading, spacing: 12) {
            if !info.alive {
                Text("此国已亡，无法颁布政令。").font(Theme.body).foregroundStyle(Theme.ink2).padding(.horizontal, Theme.Layout.sectionInset)
            } else {
                // 禅位择君：紧凑顶部条目
                Group2 {
                    Button {
                        GameFeel.shared.tap()
                        onEnthrone()
                    } label: {
                        HStack(spacing: 10) {
                            InkIcon(glyph: .crown, size: 19, weight: 1.85, accent: Theme.seal.opacity(0.28))
                                .foregroundStyle(Theme.seal)
                                .frame(width: 30, height: 30)
                                .background(Theme.seal.opacity(0.09), in: Circle())
                            VStack(alignment: .leading, spacing: 1) {
                                Text("禅位择君").font(Theme.body).foregroundStyle(Theme.ink)
                                Text(info.ruler.map { "现任：\($0.styledName ?? ($0.title + $0.name))" } ?? "择本国在世贤能登基执政")
                                    .font(Theme.caption).foregroundStyle(Theme.ink2).lineLimit(1)
                            }
                            Spacer(minLength: 4)
                            Image(systemName: "chevron.right").font(.system(size: 11, weight: .semibold)).foregroundStyle(Theme.seal)
                        }
                        .padding(.horizontal, 14).padding(.vertical, 9).contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
                .padding(.horizontal, Theme.Layout.pageInset)

                // 分类筛选签：一屏只聚焦一类，清爽不杂乱
                ChipPicker(items: Category.allCases.map { ($0, $0.rawValue) }, selection: $category)
                    .padding(.horizontal, Theme.Layout.pageInset)

                if category == .reforms {
                    let list = info.reforms ?? []
                    let activeCount = list.filter(\.on).count
                    SectionLabel("长期国策（已行 \(activeCount)/\(list.count) 项）")
                    if list.isEmpty {
                        Group2 { Row(label: "国策", value: "暂无可选国策") }
                            .padding(.horizontal, Theme.Layout.pageInset)
                    } else {
                        Group2 {
                            LazyVStack(spacing: 0) {
                                ForEach(Array(list.enumerated()), id: \.element.id) { idx, r in
                                    Button { toggleReform(r) } label: {
                                        HStack(spacing: 10) {
                                            VStack(alignment: .leading, spacing: 2) {
                                                HStack(spacing: 6) {
                                                    Text(r.name).font(Theme.body).foregroundStyle(r.on ? Theme.seal : Theme.ink)
                                                    if r.on { PaperTag(text: "施行中", color: Theme.seal, size: 10) }
                                                }
                                                Text(r.text).font(Theme.caption).foregroundStyle(Theme.ink2)
                                                    .fixedSize(horizontal: false, vertical: true)
                                            }
                                            Spacer(minLength: 8)
                                            Image(systemName: r.on ? "checkmark.seal.fill" : "circle")
                                                .font(.system(size: 18))
                                                .foregroundStyle(r.on ? Theme.seal : Theme.ink2.opacity(0.45))
                                        }
                                        .padding(.horizontal, 14).padding(.vertical, 10)
                                        .contentShape(Rectangle())
                                    }
                                    .buttonStyle(.plain)
                                    .disabled(busy)
                                    if idx < list.count - 1 { Divider2() }
                                }
                            }
                        }
                        .padding(.horizontal, Theme.Layout.pageInset)
                        Text("长期国策持续影响全军战力、财政税负、人口与安定；互斥国策（如重农/重商、募兵/征兵）开启新项会自动替下旧项。")
                            .font(Theme.caption).foregroundStyle(Theme.ink2)
                            .padding(.horizontal, Theme.Layout.sectionInset)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                } else {
                    let items = Self.decrees.filter { $0.category == category }
                    SectionLabel("御批\(category.rawValue)（\(items.count) 项）")
                    Group2 {
                        ForEach(Array(items.enumerated()), id: \.element.id) { idx, item in
                            Button { issue(item) } label: {
                                HStack(spacing: 12) {
                                    InkIcon(glyph: item.glyph, size: 19, weight: 1.8, accent: item.tone.opacity(0.24))
                                        .foregroundStyle(item.tone)
                                        .frame(width: 32, height: 32)
                                        .background(item.tone.opacity(0.09), in: Circle())
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(item.title).font(Theme.section).foregroundStyle(Theme.ink)
                                        Text(item.note).font(Theme.caption).foregroundStyle(Theme.ink2)
                                            .fixedSize(horizontal: false, vertical: true)
                                    }
                                    Spacer(minLength: 6)
                                    Text("颁行").font(Theme.caption).foregroundStyle(item.tone)
                                        .padding(.horizontal, 10).frame(height: 28)
                                        .background(item.tone.opacity(0.09), in: Capsule())
                                        .overlay(Capsule().stroke(item.tone.opacity(0.32), lineWidth: 0.8))
                                }
                                .padding(.horizontal, 14).padding(.vertical, 10)
                                .contentShape(Rectangle())
                                .opacity(busy ? 0.55 : 1)
                            }
                            .buttonStyle(.plain)
                            .disabled(busy)
                            if idx < items.count - 1 { Divider2() }
                        }
                    }
                    .padding(.horizontal, Theme.Layout.pageInset)
                }
            }
        }
    }

    private func toggleReform(_ r: NationInfo.ReformRow) {
        guard !busy else { return }
        busy = true
        Task {
            let err = await model.setReform(nation, reform: r.id, on: !r.on)
            await onReload()
            if let err {
                onToast(err)
                GameFeel.shared.notify(.error)
            } else {
                onToast(r.on ? "已废止「\(r.name)」" : "已施行「\(r.name)」")
                GameFeel.shared.notify(.success)
            }
            busy = false
        }
    }

    private func issue(_ item: DecreeItem) {
        guard !busy else { return }
        busy = true
        Task {
            let err = await model.edit("nationDecree", ["n": nation, "kind": item.id])
            await onReload()
            if let err {
                onToast(err)
                GameFeel.shared.notify(.error)
            } else {
                onToast(model.state?.events.last?.text ?? "\(item.title)已颁行")
                GameFeel.shared.notify(.success)
            }
            busy = false
        }
    }
}

/// 国家页「疆土」总管标签：全境州郡搜索、排序、批量施政与逐州快捷操控。
struct NationTerritoryTab: View {
    @ObservedObject var model: GameModel
    let nation: Int
    let alive: Bool
    let day: Int
    let onFly: (Int) -> Void
    let onAppointGovernor: (Int) -> Void
    let onToast: (String) -> Void
    let onReload: () async -> Void
    let onPresentMenu: (PressMenu) -> Void

    enum SortMode: String, CaseIterable {
        case population = "按人口"
        case defense = "按城防"
        case name = "按州名"
    }

    @State private var rows: [GameModel.NationProvinceRow] = []
    @State private var loaded = false
    @State private var query = ""
    @State private var sort: SortMode = .population
    @State private var revision = 0
    @State private var busy = false

    private var filtered: [GameModel.NationProvinceRow] {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines)
        let list = q.isEmpty ? rows : rows.filter {
            $0.name.localizedCaseInsensitiveContains(q)
                || $0.specialty.localizedCaseInsensitiveContains(q)
                || ($0.governor ?? "").localizedCaseInsensitiveContains(q)
                || ($0.familyName ?? "").localizedCaseInsensitiveContains(q)
        }
        switch sort {
        case .population:
            return list.sorted { $0.capital != $1.capital ? $0.capital : $0.population > $1.population }
        case .defense:
            return list.sorted { $0.defense != $1.defense ? $0.defense > $1.defense : $0.population > $1.population }
        case .name:
            return list.sorted { $0.name < $1.name }
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if !alive {
                Text("此国已亡，已无实控疆土。").font(Theme.body).foregroundStyle(Theme.ink2).padding(.horizontal, Theme.Layout.sectionInset)
            } else {
                // 全境批量操控条
                HStack(spacing: 8) {
                    bulkChip("加固边防", glyph: .nation, tone: Theme.ink) { runBulk("nationDecree", ["n": nation, "kind": "fortifyBorder"], fallback: "边防已加固") }
                    bulkChip("补齐总督", glyph: .polity, tone: Theme.jade) { runBulk("nationDiplomacyOrder", ["n": nation, "kind": "fillGovernors"], fallback: "已补齐总督") }
                    bulkChip("同化文化", glyph: .culture, tone: Theme.ink) { runBulk("nationDecree", ["n": nation, "kind": "assimilateCulture"], fallback: "文化已同化") }
                    bulkChip("统一国教", glyph: .religion, tone: Theme.seal) { runBulk("nationDecree", ["n": nation, "kind": "convertFaith"], fallback: "国教已统一") }
                }
                .padding(.horizontal, Theme.Layout.pageInset)

                // 搜索与排序
                VStack(spacing: 8) {
                    HStack(spacing: 8) {
                        Image(systemName: "magnifyingglass").font(.system(size: 13)).foregroundStyle(Theme.ink2)
                        TextField("", text: $query, prompt: Text("搜州名、特产、总督或世家").foregroundColor(Theme.ink2.opacity(0.6)))
                        if !query.isEmpty {
                            Button { query = "" } label: { Image(systemName: "xmark.circle.fill").font(.system(size: 14)).foregroundStyle(Theme.ink2) }
                                .buttonStyle(.plain)
                        }
                    }
                    .paperField()
                    ChipPicker(items: SortMode.allCases.map { ($0, $0.rawValue) }, selection: $sort)
                }
                .padding(.horizontal, Theme.Layout.pageInset)

                let shown = filtered
                SectionLabel("实控州郡（\(shown.count)/\(rows.count)）")
                if !loaded {
                    InkBusy(text: "清点疆土……").frame(maxWidth: 200).frame(maxWidth: .infinity).padding(24)
                } else if shown.isEmpty {
                    Group2 {
                        Row(label: "州郡", value: query.isEmpty ? "暂无实控州郡" : "无匹配州郡")
                    }
                    .padding(.horizontal, Theme.Layout.pageInset)
                } else {
                    Group2 {
                        LazyVStack(spacing: 0) {
                            ForEach(Array(shown.enumerated()), id: \.element.id) { idx, row in
                                Button { openMenu(for: row) } label: {
                                    provinceRow(row)
                                }
                                .buttonStyle(.plain)
                                if idx < shown.count - 1 { Divider2() }
                            }
                        }
                    }
                    .padding(.horizontal, Theme.Layout.pageInset)
                }
            }
        }
        .task(id: "\(nation)-\(day)-\(revision)") {
            guard alive else { return }
            rows = await model.nationProvinces(nation)
            loaded = true
        }
    }

    private func bulkChip(_ title: String, glyph: InkGlyph, tone: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 3) {
                InkIcon(glyph: glyph, size: 15, weight: 1.75, accent: tone.opacity(0.24)).foregroundStyle(tone)
                Text(title).font(Theme.caption).foregroundStyle(Theme.ink).lineLimit(1).minimumScaleFactor(0.75)
            }
            .frame(maxWidth: .infinity).frame(height: 44)
            .background(Theme.paper2.opacity(0.88), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(Theme.ink.opacity(0.16), lineWidth: 0.9))
            .opacity(busy ? 0.55 : 1)
        }
        .buttonStyle(PressStyle())
        .disabled(busy)
    }

    private func provinceRow(_ row: GameModel.NationProvinceRow) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack(spacing: 6) {
                Text(row.name).font(Theme.section).foregroundStyle(Theme.ink).lineLimit(1)
                if row.capital { PaperTag(text: "都城", color: Theme.seal, size: 11) }
                if row.fortress { PaperTag(text: "要塞", color: Theme.ink, size: 11) }
                if row.port { PaperTag(text: "海港", color: Theme.jade, size: 11) }
                if row.armies > 0 { PaperTag(text: "\(row.armies)军", color: Theme.seal.opacity(0.85), size: 11) }
                Spacer(minLength: 4)
                Text(Names.wan(row.population) + "人").font(Theme.body).foregroundStyle(Theme.ink).monospacedDigit()
                Image(systemName: "ellipsis.circle").font(.system(size: 13)).foregroundStyle(Theme.seal.opacity(0.75))
            }
            HStack(spacing: 8) {
                Text("城防 \(row.defense) 级").font(Theme.caption).foregroundStyle(row.defense >= 3 ? Theme.jade : Theme.ink2)
                if !row.specialty.isEmpty { Text("· \(row.specialty)").font(Theme.caption).foregroundStyle(Theme.ink2) }
                if let g = row.governor {
                    Text("· 总督 \(g)").font(Theme.caption).foregroundStyle((row.governorFit ?? 0) >= 0.3 ? Theme.jade : Theme.ink2).lineLimit(1)
                } else {
                    Text("· 缺总督").font(Theme.caption).foregroundStyle(Theme.seal.opacity(0.85))
                }
                if let fam = row.familyName {
                    Spacer(minLength: 2)
                    Text(fam).font(Theme.caption).foregroundStyle(Theme.ink2).lineLimit(1)
                }
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 9).contentShape(Rectangle())
    }

    private func openMenu(for row: GameModel.NationProvinceRow) {
        var items: [PressMenuItem] = [
            PressMenuItem(title: "在舆图上查看\(row.name)", symbol: "map") { onFly(row.index) },
            PressMenuItem(title: row.governor == nil ? "委任本州总督" : "改任本州总督（现：\(row.governor!)）", symbol: "building.columns") { onAppointGovernor(row.index) },
            PressMenuItem(title: "在本州征募 1 支新军", symbol: "flag.2.crossed") {
                runAction("已在\(row.name)征募新军") { await model.addArmy(nation, province: row.index, count: 1) }
            },
            PressMenuItem(title: row.fortress ? "拆除要塞" : "修筑要塞（城防加强）", symbol: "building.2") {
                runAction(row.fortress ? "\(row.name)要塞已拆" : "\(row.name)已筑要塞") {
                    await model.editProvince(row.index, population: nil, fortress: !row.fortress)
                }
            },
            PressMenuItem(title: "提升城防至 \(min(10, row.defense + 1)) 级", symbol: "shield") {
                runAction("\(row.name)城防升至 \(min(10, row.defense + 1)) 级") {
                    await model.edit("setProvinceDefense", ["province": row.index, "level": min(10, row.defense + 1)])
                }
            },
        ]
        if !row.capital {
            items.append(PressMenuItem(title: "迁都至\(row.name)", symbol: "crown") {
                runAction("已迁都\(row.name)") { await model.setCapital(nation, province: row.index) }
            })
        }
        items.append(PressMenuItem(title: "定为本国国教圣地", symbol: "sun.max") {
            runAction("\(row.name)已定为圣地") { await model.setHolyProvince(row.index) }
        })
        onPresentMenu(PressMenu(title: row.name, subtitle: "人口 \(Names.wan(row.population)) · 城防 \(row.defense) 级 · \(row.specialty)", items: items))
    }

    private func runBulk(_ call: String, _ args: [String: Any], fallback: String) {
        guard !busy else { return }
        busy = true
        Task {
            let err = await model.edit(call, args)
            revision += 1
            await onReload()
            onToast(err ?? fallback)
            GameFeel.shared.notify(err == nil ? .success : .error)
            busy = false
        }
    }

    private func runAction(_ okText: String, _ op: @escaping () async -> String?) {
        Task {
            let err = await op()
            revision += 1
            await onReload()
            onToast(err ?? okText)
            GameFeel.shared.notify(err == nil ? .success : .error)
        }
    }
}

/// 国家页「军事」顶部的全军统筹指令栏：全军补员、全军回防、全军交 AI、船坞下水新舰队、地图放兵。
struct NationMilitaryControlBar: View {
    @ObservedObject var model: GameModel
    let nation: Int
    let alive: Bool
    let onPlaceArmy: () -> Void
    let onToast: (String) -> Void
    let onReload: () async -> Void
    @State private var busy = false

    var body: some View {
        if alive {
            VStack(spacing: 8) {
                HStack(spacing: 8) {
                    orderBtn("全军补员", glyph: .military, tone: Theme.jade) { send("reinforceAll", ok: "已为缺编军队补员") }
                    orderBtn("回防都城", glyph: .command, tone: Theme.ink) { send("recall", ok: "已下令全军回防") }
                    orderBtn("全军交AI", glyph: .polity, tone: Theme.ink) { send("releaseAll", ok: "已全部交还 AI") }
                    orderBtn("下水新舰", glyph: .views, tone: Theme.seal) { send("launchFleet", ok: "新舰队已下水成军") }
                }
                Button {
                    GameFeel.shared.tap()
                    onPlaceArmy()
                } label: {
                    HStack(spacing: 6) {
                        InkIcon(glyph: .military, size: 16, weight: 1.85, accent: Theme.seal.opacity(0.28))
                        Text("在地图上点划放置新军").font(Theme.body)
                    }
                    .foregroundStyle(Theme.seal)
                    .frame(maxWidth: .infinity).frame(height: 40)
                    .background(Theme.seal.opacity(0.08), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(Theme.seal.opacity(0.32), lineWidth: 1))
                }
                .buttonStyle(PressStyle())
            }
            .padding(.horizontal, Theme.Layout.pageInset)
        }
    }

    private func orderBtn(_ title: String, glyph: InkGlyph, tone: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 3) {
                InkIcon(glyph: glyph, size: 15, weight: 1.75, accent: tone.opacity(0.24)).foregroundStyle(tone)
                Text(title).font(Theme.caption).foregroundStyle(Theme.ink).lineLimit(1).minimumScaleFactor(0.75)
            }
            .frame(maxWidth: .infinity).frame(height: 44)
            .background(Theme.paper2.opacity(0.88), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(Theme.ink.opacity(0.16), lineWidth: 0.9))
            .opacity(busy ? 0.55 : 1)
        }
        .buttonStyle(PressStyle())
        .disabled(busy)
    }

    private func send(_ kind: String, ok: String) {
        guard !busy else { return }
        busy = true
        Task {
            let err = await model.edit("nationMilitaryOrder", ["n": nation, "kind": kind])
            await onReload()
            onToast(err ?? ok)
            GameFeel.shared.notify(err == nil ? .success : .error)
            busy = false
        }
    }
}

/// 禅位择君弹窗：列出本国在世成年宗室、家主与大臣，点选即刻拥立登基。
struct EnthroneSheet: View {
    @ObservedObject var model: GameModel
    let nation: Int
    let stateName: String
    let onPicked: (Int, String) -> Void
    @State private var candidates: [NationInfo.Person] = []
    @State private var loaded = false
    @State private var confirm: NationInfo.Person?

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 14) {
                SheetHeader(title: "禅位择君", subtitle: "\(stateName) · 择一在世成年之人登基执政", seal: "禅")
                Group2 {
                    if !loaded {
                        InkBusy(text: "遴选人选……").frame(maxWidth: 200).frame(maxWidth: .infinity).padding(24)
                    } else if candidates.isEmpty {
                        Row(label: "人选", value: "本国暂无其他年满十六岁的在世人选")
                    } else {
                        ForEach(Array(candidates.enumerated()), id: \.offset) { idx, p in
                            Button { confirm = p } label: {
                                HStack(spacing: 10) {
                                    Text(ChineseNumeral.of(idx + 1)).font(Theme.label).foregroundStyle(Theme.seal).frame(width: 22)
                                    VStack(alignment: .leading, spacing: 3) {
                                        HStack(spacing: 6) {
                                            Text(p.name).font(Theme.section).foregroundStyle(Theme.ink).lineLimit(1)
                                            PaperTag(text: p.role, color: idx == 0 ? Theme.seal : Theme.ink2, size: 11)
                                            Text("\(p.female ? "女" : "男") · \(Int(p.age))岁").font(Theme.caption).foregroundStyle(Theme.ink2)
                                        }
                                        if p.skills.count == 4 {
                                            Text("魅\(Int(p.skills[0])) · 军\(Int(p.skills[1])) · 外\(Int(p.skills[2])) · 政\(Int(p.skills[3]))")
                                                .font(Theme.caption).foregroundStyle(Theme.ink2).monospacedDigit()
                                        }
                                    }
                                    Spacer(minLength: 4)
                                    Image(systemName: "crown").font(.system(size: 14)).foregroundStyle(Theme.seal)
                                }
                                .padding(.horizontal, 14).padding(.vertical, 9).contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            if idx < candidates.count - 1 { Divider2() }
                        }
                    }
                }
                .padding(.horizontal, Theme.Layout.pageInset)
            }
            .padding(.bottom, 24)
        }
        .task {
            candidates = await model.throneCandidates(nation)
            loaded = true
        }
        .confirmationDialog(confirm.map { "拥立\($0.name)登基？" } ?? "", isPresented: Binding(get: { confirm != nil }, set: { if !$0 { confirm = nil } }), titleVisibility: .visible) {
            if let p = confirm, let id = p.id {
                Button("即刻禅位登基", role: .destructive) {
                    confirm = nil
                    onPicked(id, p.name)
                }
            }
            Button("取消", role: .cancel) { confirm = nil }
        } message: {
            Text("原君主将和平卸任，所选人物成为新任君主／元首，其家族随之成为宗室。")
        }
    }
}
