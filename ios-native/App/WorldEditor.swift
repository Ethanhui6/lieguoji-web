import SwiftUI
import LieguojiCore
import UniformTypeIdentifiers

/// 世界编辑 (the original's edit panel): brushes over the map, free labels, cultures and faiths, exports.
struct WorldEditorSheet: View {
    @ObservedObject var model: GameModel
    var close: () -> Void = {}
    var takeShot: () -> Void = {}

    static var tourTab: Tab?
    enum Tab: String, CaseIterable { case brush = "笔刷", land = "疆土", pact = "同盟", map = "山河图", labels = "标注", culture = "文化宗教", output = "导出" }
    private struct Choice: Identifiable { let id = UUID(); let title: String; let items: [(String, () -> Void)] }

    @State private var tab = Tab.brush
    @State private var flash: String?
    @State private var choice: Choice?
    @State private var picking = false
    @State private var target = -1
    // 标注
    @State private var labelId = -1
    @State private var labelText = ""
    @State private var labelSize = 28.0
    @State private var labelAngle = 0.0
    @State private var labelColor = Color(red: 0.2, green: 0.12, blue: 0.08)
    // 文化宗教
    @State private var isFaith = false
    @State private var key = ""
    @State private var name = ""
    @State private var text = ""
    @State private var male = ""
    @State private var female = ""
    @State private var exported: URL?
    @State private var importing = false
    @State private var newName = ""
    @State private var rebelMode: String = "historical"
    @State private var rebelBusy = false
    private var baseCultures: [String] { Names.cultureIds.filter { !$0.hasPrefix("custom") } }

    private func report(_ e: String?, _ ok: String) { flash = e ?? ok; GameFeel.shared.notify(e == nil ? .success : .error) }

    /// Starts a brush: every province the finger touches gets `action`.
    private func brush(_ title: String, _ action: @escaping (Int) async -> String?) {
        let c = model.controller
        c.placingArmy = false
        c.brushName = title
        c.brushAction = { p in
            Task {
                if let e = await action(p) { GameFeel.shared.notify(.error); print(e) } else { GameFeel.shared.tap() }
            }
        }
        c.paintNation = 0
        close()
    }

    var body: some View {
        ScrollView {
            LazyVStack(spacing: 14) {
                SheetHeader(title: "世界编辑", subtitle: "笔刷、政区、标注、文化宗教与导出", seal: "编")
                ChipPicker(items: Tab.allCases.map { ($0, $0.rawValue) }, selection: $tab)
                    .padding(.horizontal, Theme.Layout.pageInset)
                switch tab {
                case .land: EditorLandTab(model: model, begin: { n, a in brush(n, a) }, say: { report($0, $1) }, close: close)
                case .pact: EditorAllianceTab(model: model, say: { report($0, $1) })
                case .map: EditorMapTab(model: model, say: { report($0, $1) }, close: close)
                case .brush: brushes
                case .labels: labels
                case .culture: cultures
                case .output: output
                }
            }
            .padding(.bottom, 28)
        }
        .paperToast($flash)
        .task {
            await model.refreshCustom()
            if let ws = await model.worldSettings() {
                if let m = ws.rebelMode, ["off", "historical", "classic"].contains(m) {
                    rebelMode = m
                } else if ws.rebellion == false {
                    rebelMode = "off"
                }
            }
        }
        .onAppear { if let t = Self.tourTab { tab = t } }
        .sheet(item: $choice) { c in
            ScrollView {
                LazyVStack(spacing: 0) {
                    SheetHeader(title: c.title, seal: "择")
                    Group2 {
                        ForEach(Array(c.items.enumerated()), id: \.offset) { i, item in
                            if i > 0 { Divider2() }
                            Button { choice = nil; item.1() } label: {
                                HStack { Text(item.0).font(Theme.body).foregroundStyle(Theme.ink).lineLimit(1); Spacer() }.padding(.horizontal, 14).frame(minHeight: 42).contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal, Theme.Layout.pageInset)
                }
                .padding(.bottom, 20)
            }
            .presentationDetents([.medium, .fraction(0.89)]).presentationCornerRadius(Theme.Control.cornerSheet).presentationBackground { MemorialPaper() }.presentationDragIndicator(.hidden)
        }
        .sheet(isPresented: $picking) {
            if let map = model.map, let state = model.state {
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 14) {
                        SheetHeader(title: "绘制哪国疆域", seal: "择")
                        Group2 { NationGrid(map: map, nations: state.nations.indices.filter { state.nations[$0].alive && $0 < map.meta.nations.count }, selection: $target).padding(12) }.padding(.horizontal, Theme.Layout.pageInset)
                        SealButton(title: "开始绘制", disabled: target < 0) {
                            let t = target
                            picking = false
                            let c = model.controller
                            c.brushName = nil; c.brushAction = nil; c.placingArmy = false; c.paintNation = t
                            close()
                        }
                        .padding(.horizontal, Theme.Layout.pageInset)
                    }
                    .padding(.bottom, 20)
                }
                .presentationDetents([.medium, .fraction(0.89)]).presentationCornerRadius(Theme.Control.cornerSheet).presentationBackground { MemorialPaper() }.presentationDragIndicator(.hidden)
            }
        }
        .sheet(item: Binding(get: { exported.map(Shared.init) }, set: { exported = $0?.url })) { ShareSheet(items: [$0.url]) }
        .fileImporter(isPresented: $importing, allowedContentTypes: [.json, .data]) { result in
            if case .success(let url) = result { Task { report(await model.importPackage(-1, from: url), "文化宗教已导入") } }
        }
    }
    private struct Shared: Identifiable { let url: URL; var id: URL { url } }

    // MARK: 笔刷
    private var brushes: some View {
        LazyVStack(spacing: 14) {
            quickSection("叛乱规则") {
                RebelModeSelector(selection: $rebelMode, compact: true, disabled: rebelBusy) { nextMode in
                    guard !rebelBusy else { return }
                    rebelBusy = true
                    Task {
                        let err = await model.setRebelMode(nextMode)
                        rebelBusy = false
                        if err == nil { rebelMode = nextMode }
                        let ok = nextMode == "off" ? "已关闭全局叛乱" : (nextMode == "historical" ? "已切为历史拟真叛乱" : "已切为经典乱世叛乱")
                        report(err, ok)
                    }
                }
                Text("可随时在局中实时切换「关闭叛乱 / 历史拟真 / 经典乱世」，即时生效。")
                    .font(Theme.caption)
                    .foregroundStyle(Theme.ink2)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            quickSection("归属与文化") {
                editorToolGrid(columns: 2) {
                    editorToolButton("绘制国家", glyph: .brush) { target = -1; picking = true }
                    editorToolButton("绘制文化", glyph: .culture) {
                        choice = Choice(title: "刷上哪种文化", items: Names.culture.keys.sorted().map { k in
                            (Names.culture[k] ?? k, { brush("绘制文化：\(Names.culture[k] ?? k)") { p in await model.setCityCulture(p, k) } })
                        })
                    }
                    editorToolButton("绘制信仰", glyph: .religion) {
                        choice = Choice(title: "刷上哪种信仰", items: Names.religion.keys.filter { $0 != "none" }.sorted().map { k in
                            (Names.religion[k] ?? k, { brush("绘制信仰：\(Names.religion[k] ?? k)") { p in await model.setProvinceFaith(p, religion: k) } })
                        })
                    }
                    editorToolButton("定为圣地", glyph: .crown) { brush("定圣地") { p in await model.setHolyProvince(p) } }
                }
            }
            quickSection("城防与民生") {
                editorToolGrid(columns: 2) {
                    editorToolButton("筑要塞", glyph: .fortress) { brush("筑要塞") { p in await model.editProvince(p, population: nil, fortress: true) } }
                    editorToolButton("拆要塞", glyph: .trash) { brush("拆要塞") { p in await model.editProvince(p, population: nil, fortress: false) } }
                    editorToolButton("人口倍增", glyph: .person) { brush("人口倍增") { p in await scale(p, 2) } }
                    editorToolButton("人口减半", glyph: .minus, destructive: true) { brush("人口减半") { p in await scale(p, 0.5) } }
                }
            }
            quickSection("天灾") {
                editorToolGrid(columns: 3) {
                    editorToolButton("降瘟疫", glyph: .fire, destructive: true) { brush("降瘟疫") { p in await model.provinceDisaster(p, kind: "plague") } }
                    editorToolButton("降饥荒", glyph: .fire, destructive: true) { brush("降饥荒") { p in await model.provinceDisaster(p, kind: "famine") } }
                    editorToolButton("平息灾情", glyph: .peace) { brush("平息灾情") { p in await model.provinceDisaster(p, kind: nil) } }
                }
            }
            Text("选好笔刷后，一指点按或划过州郡即可落笔，两指移动地图，点顶部「完成」结束。")
                .font(Theme.label).foregroundStyle(Theme.ink2)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, Theme.Layout.pageInset)
        }
    }
    private func scale(_ p: Int, _ k: Double) async -> String? {
        guard let info = await model.provinceInfo(p) else { return "州郡不存在" }
        return await model.editProvince(p, population: Double(info.population) * k, fortress: nil)
    }

    // MARK: 标注
    private var labels: some View {
        VStack(spacing: 12) {
            quickSection(labelId >= 0 ? "修改标注" : "新建标注") {
                TextField("写在地图上的文字", text: $labelText).paperField()
                quickSlider("字号", value: $labelSize, 6...160, text: "\(Int(labelSize))")
                quickSlider("倾斜", value: $labelAngle, -60...60, text: "\(Int(labelAngle))°")
                ColorPicker("颜色", selection: $labelColor, supportsOpacity: false).font(Theme.body).foregroundStyle(Theme.ink2)
                quickGrid {
                    quickTile(labelId >= 0 ? "移到新位置" : "点地图放置", "mappin.and.ellipse") { place() }
                    if labelId >= 0 {
                        quickTile("保存修改", "checkmark.seal") {
                            guard let l = model.customLabels.first(where: { $0.id == labelId }) else { return }
                            save(x: l.x, y: l.y)
                        }
                        quickTile("删除", "trash", destructive: true) {
                            let id = labelId
                            Task { report(await model.removeMapLabel(id), "标注已删除"); labelId = -1; labelText = "" }
                        }
                    }
                }
            }
            if !model.customLabels.isEmpty {
                SectionLabel("已有标注（点选修改）")
                Group2 {
                    ForEach(Array(model.customLabels.enumerated()), id: \.element.id) { idx, l in
                        AlignedMetaRow(
                            label: l.text,
                            value: "\(Int(l.size))pt",
                            icon: .brush,
                            valueColor: labelId == l.id ? Theme.seal : Theme.ink2,
                            trailingGlyph: .chevronRight
                        ) {
                            labelId = l.id; labelText = l.text; labelSize = l.size; labelAngle = l.angle * 180 / .pi; labelColor = Names.color(l.color)
                        }
                        if idx < model.customLabels.count - 1 { Divider2() }
                    }
                }
                .padding(.horizontal, Theme.Layout.pageInset)
            }
        }
    }
    private func place() {
        guard !labelText.trimmingCharacters(in: .whitespaces).isEmpty else { report("先写下文字", ""); return }
        let c = model.controller
        c.pickPrompt = "点选标注的位置"
        c.onPick = { p in
            c.pickPrompt = nil; c.onPick = nil
            guard let m = model.map, m.meta.provinces.indices.contains(p) else { return }
            save(x: Double(m.meta.provinces[p].x), y: Double(m.meta.provinces[p].y))
        }
        close()
    }
    private func save(x: Double, y: Double) {
        let id = labelId, t = labelText, s = labelSize, a = labelAngle * .pi / 180, color = NationSheet.hex(labelColor)
        Task { report(await model.setMapLabel(id: id, text: t, x: x, y: y, size: s, color: color, angle: a), "标注已保存"); labelId = -1; labelText = "" }
    }

    // MARK: 文化宗教
    private func load(_ faith: Bool, _ k: String) {
        isFaith = faith; key = k
        if faith { let e = model.catalog.faiths[k]; name = e?.name ?? Names.religion[k] ?? k; text = e?.text ?? ""; male = ""; female = "" }
        else { let e = model.catalog.cultures[k]; name = e?.name ?? Names.culture[k] ?? k; text = e?.text ?? ""; male = (e?.male ?? []).joined(separator: " "); female = (e?.female ?? []).joined(separator: " ") }
    }
    private var cultures: some View {
        VStack(spacing: 12) {
            quickSection("选择") {
                TextField("新文化或新宗教的名称", text: $newName).paperField()
                quickGrid {
                    quickTile("新建文化", "plus.circle") {
                        let n = newName
                        choice = Choice(title: "以哪种文化为底", items: baseCultures.map { k in (Names.culture[k] ?? k, later { let e = await model.edit("createCulture", ["base": k, "name": n]); await model.refreshCustom(); report(e, "\(n)文化已创立") }) })
                    }
                    quickTile("新建宗教", "plus.circle.fill") { let n = newName; Task { let e = await model.edit("createFaith", ["name": n]); await model.refreshCustom(); report(e, "\(n)已创立") } }
                    quickTile("选文化", "text.book.closed") { choice = Choice(title: "文化", items: Names.culture.keys.sorted().map { k in (Names.culture[k] ?? k, { load(false, k) }) }) }
                    quickTile("选宗教", "hands.sparkles") { choice = Choice(title: "宗教", items: Names.religion.keys.filter { $0 != "none" }.sorted().map { k in (Names.religion[k] ?? k, { load(true, k) }) }) }
                }
            }
            if !key.isEmpty {
                quickSection(isFaith ? "编辑宗教" : "编辑文化") {
                    TextField("名称", text: $name).paperField()
                    TextField(isFaith ? "教义与圣典" : "风俗描述", text: $text, axis: .vertical).lineLimit(2...5).paperField()
                    if !isFaith {
                        TextField("追加男子名（空格分隔）", text: $male, axis: .vertical).lineLimit(1...4).paperField()
                        TextField("追加女子名（空格分隔）", text: $female, axis: .vertical).lineLimit(1...4).paperField()
                    }
                    SealButton(title: "颁行") {
                        let k = key, n = name, t = text
                        let m = male.split(separator: " ").map(String.init), f = female.split(separator: " ").map(String.init)
                        Task {
                            if isFaith { report(await model.setFaithEdit(k, name: n, text: t), "宗教已修改") }
                            else { report(await model.setCultureEdit(k, name: n, text: t, male: m, female: f), "文化已修改") }
                        }
                    }
                }
            }
        }
    }

    // MARK: 导出
    private var output: some View {
        quickSection("导出与整理") {
            quickGrid {
                quickTile("导出地图截图", "camera") { takeShot() }
                quickTile("导出大事记", "doc.text") { Task { exported = await model.exportChronicle(); if exported == nil { report("暂无大事记", "") } } }
                quickTile("清空大事记", "trash", destructive: true) { Task { report(await model.setWorld("clearHistory", 1), "大事记已清空") } }
                quickTile("导出文化宗教", "square.and.arrow.up") { Task { exported = await model.exportPackage(-1, name: "列国纪文化宗教") } }
                quickTile("导入文化宗教", "square.and.arrow.down") { importing = true }
            }
        }
    }
}

/// 国家页自定义里的特性、官职称号、兵种档案与国名模板：每次只显示一类（自定义按分类分页）。
struct NationExtrasView: View {
    enum Part { case traits, titles, units, naming }
    @ObservedObject var model: GameModel
    let nation: Int
    let info: NationInfo
    let who: NationInfo?
    let part: Part
    let say: (String) -> Void
    let reload: () async -> Void

    private struct Edit: Identifiable { let id: String; let label: String; var text: String }
    @State private var titleEdit: Edit?
    @State private var units: [GameModel.UnitRow] = []
    @State private var unitEdit: GameModel.UnitRow?
    @State private var extras: [GameModel.ExtraUnit] = []
    @State private var posts: [GameModel.PostInfo] = []
    @State private var addingUnit = false
    @State private var baseInput = ""
    @State private var template = ""
    @State private var templateLoaded = false
    @State private var exported: URL?
    @State private var importing = false
    private struct SharedFile: Identifiable { let url: URL; var id: URL { url } }

    private func run(_ ok: String, _ body: @escaping () async -> String?) {
        Task { let e = await body(); say(e ?? ok); GameFeel.shared.notify(e == nil ? .success : .error); await reload() }
    }
    var body: some View {
        VStack(spacing: 12) {
            switch part {
            case .traits:
            quickSection("国家特性") {
                HStack(spacing: 8) {
                    Button("全部开启") { run("特性已全部开启") { await model.setStateTrait(nation, trait: nil, on: true) } }.font(Theme.body).foregroundStyle(Theme.seal)
                    Spacer()
                    Button("全部关闭") { run("特性已全部关闭") { await model.setStateTrait(nation, trait: nil, on: false) } }.font(Theme.body).foregroundStyle(Theme.ink2)
                }
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
                    ForEach(info.allTraits ?? [], id: \.key) { t in
                        Button { GameFeel.shared.tap(); run(t.on ? "已关闭\(t.name)" : "已开启\(t.name)") { await model.setStateTrait(nation, trait: t.key, on: !t.on) } } label: {
                            VStack(alignment: .leading, spacing: 3) {
                                HStack(spacing: 5) {
                                    InkIcon(glyph: .edict, size: 13, weight: t.on ? 1.9 : 1.5, filled: t.on).foregroundStyle(t.on ? Theme.seal : Theme.ink2)
                                    Text(t.name).font(Theme.body).foregroundStyle(t.on ? Theme.seal : Theme.ink).lineLimit(1)
                                }
                                Text(t.text).font(Theme.caption).foregroundStyle(Theme.ink2).lineLimit(2).minimumScaleFactor(0.8).frame(maxWidth: .infinity, alignment: .leading)
                            }
                            .padding(9).frame(maxWidth: .infinity, minHeight: 62, alignment: .topLeading)
                            .background(t.on ? Theme.seal.opacity(0.08) : Theme.paper2, in: RoundedRectangle(cornerRadius: 11, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: 11, style: .continuous).stroke(t.on ? Theme.seal.opacity(0.4) : Theme.line))
                        }
                        .buttonStyle(PressStyle())
                    }
                }
            }
            case .titles:
            quickSection("官职称号") {
                ForEach(posts, id: \.id) { p in
                    Button { titleEdit = Edit(id: p.id, label: p.title, text: p.title) } label: {
                        HStack { Text(p.title).font(Theme.body).foregroundStyle(Theme.ink); Spacer(); InkIcon(glyph: .brush, size: 12, weight: 1.7).foregroundStyle(Theme.seal) }.contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
                ForEach(["Chancellor", "Steward", "Marshal"], id: \.self) { o in
                    Button { titleEdit = Edit(id: o, label: NationSheet.title(o, who), text: NationSheet.title(o, who)) } label: {
                        HStack {
                            Text(NationSheet.title(o, who)).font(Theme.body).foregroundStyle(Theme.ink)
                            Spacer()
                            InkIcon(glyph: .brush, size: 12, weight: 1.7).foregroundStyle(Theme.seal)
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
            case .units:
            quickSection("兵种档案") {
                ForEach(units) { u in
                    Button { unitEdit = u } label: {
                        HStack(spacing: 8) {
                            Text(u.name).font(Theme.body).foregroundStyle(u.weight > 0 ? Theme.ink : Theme.ink2).lineLimit(1)
                            Spacer()
                            Text("战力\(Int(u.power))% · 行速\(Int(u.speed))% · 征募\(Int(u.weight))").font(Theme.caption).foregroundStyle(Theme.ink2).monospacedDigit().lineLimit(1).minimumScaleFactor(0.7)
                            InkIcon(glyph: .chevronRight, size: 12, weight: 1.7).foregroundStyle(Theme.ink2)
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
            quickSection("新增兵种") {
                ForEach(Array(extras.enumerated()), id: \.offset) { i, e in
                    HStack {
                        Text("\(e.name)（基于\(UnitKinds.name(e.base))）").font(Theme.body).foregroundStyle(Theme.ink).lineLimit(1)
                        Spacer()
                        Button("删除") { run("兵种已删除") { let r = await model.edit("removeExtraUnit", ["n": nation, "i": i]); extras = await model.extraUnits(nation); return r } }.font(Theme.label).foregroundStyle(Theme.seal)
                    }
                }
                quickGrid {
                    quickTile("编入新兵种", "plus.circle") { addingUnit = true }
                    quickTile("导出档案", "square.and.arrow.up") { Task { exported = await model.exportPackage(nation, name: "列国纪军事档案") } }
                    quickTile("导入档案", "square.and.arrow.down") { importing = true }
                }
            }
            case .naming:
            namingSection()
            }
        }
        .task(id: part == .units ? 1 : part == .titles ? 2 : 0) {
            switch part {
            case .units: units = await model.unitProfile(nation); extras = await model.extraUnits(nation)
            case .titles: posts = await model.posts(nation)
            default: break
            }
        }
        .sheet(item: Binding(get: { exported.map(SharedFile.init) }, set: { exported = $0?.url })) { ShareSheet(items: [$0.url]) }
        .fileImporter(isPresented: $importing, allowedContentTypes: [.json, .data]) { result in
            if case .success(let url) = result { run("军事档案已导入") { let e = await model.importPackage(nation, from: url); units = await model.unitProfile(nation); extras = await model.extraUnits(nation); return e } }
        }
        .sheet(isPresented: $addingUnit) {
            NewUnitEditor { base, name, power, speed, weight in
                addingUnit = false
                run("\(name)已编入") { let r = await model.edit("addExtraUnit", ["n": nation, "base": base, "name": name, "power": Int(power), "speed": Int(speed), "weight": Int(weight)]); extras = await model.extraUnits(nation); return r }
            }
        }
        .sheet(item: $titleEdit) { e in
            TitleEditor(edit: e.text, label: e.label) { value in
                titleEdit = nil
                run("官职称号已修改") { let r = await model.setOfficeTitle(nation, office: e.id, title: value); posts = await model.posts(nation); return r }
            }
        }
        .sheet(item: $unitEdit) { u in
            UnitEditor(unit: u) { name, power, speed, weight, reset in
                unitEdit = nil
                Task {
                    let e = reset ? await model.setUnitProfile(nation, unit: u.key, name: nil, power: nil, speed: nil, weight: nil)
                                  : await model.setUnitProfile(nation, unit: u.key, name: name, power: power, speed: speed, weight: weight)
                    say(e ?? "兵种档案已修改")
                    units = await model.unitProfile(nation)
                }
            }
        }
    }

    @ViewBuilder private func namingSection() -> some View {
        let curBase = info.baseName ?? MapLayers.stateLabel(info.name, full: false)
        let curStyle = Regimes.styles.first(where: { $0.id == info.style }) ?? Regimes.styles[0]
        let trimmedBase = baseInput.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedTpl = template.trimmingCharacters(in: .whitespacesAndNewlines)
        let preview = NamingCatalog.formatStateTitle(
            base: trimmedBase.isEmpty ? curBase : trimmedBase,
            style: curStyle,
            religion: info.religion,
            culture: info.culture,
            ordinal: info.restorationOrdinal ?? "",
            rulingSurname: info.rulingSurname ?? "",
            template: trimmedTpl.isEmpty ? nil : trimmedTpl
        )
        quickSection("国名基名（{名}）") {
            HStack(spacing: 8) {
                TextField("基名：\(curBase)", text: $baseInput).paperField()
                Button {
                    let b = baseInput.trimmingCharacters(in: .whitespacesAndNewlines)
                    guard !b.isEmpty else { return }
                    run("基名已更改") { await model.edit("setBaseName", ["n": nation, "base": b]) }
                    baseInput = ""
                } label: {
                    Text("定基名").font(Theme.body).foregroundStyle(trimmedBase.isEmpty ? Theme.ink2 : Theme.seal).frame(width: 58, height: 40)
                }
                .buttonStyle(.plain).disabled(trimmedBase.isEmpty)
            }
            let houseNote = info.rulingSurname.flatMap { $0.isEmpty ? nil : " · 宗室：\(NamingCatalog.houseLabel($0))" } ?? ""
            Text("只改基名，自动保留政体与国名模板。现基名：\(curBase)\(houseNote)")
                .font(Theme.caption).foregroundStyle(Theme.ink2).frame(maxWidth: .infinity, alignment: .leading)
        }
        quickSection("国名模板与命名规则") {
            TextField("留空按政体默认；可用 {名} {号} {序} {姓}", text: $template).paperField()
            HStack(spacing: 6) {
                Text("预览").font(Theme.caption).foregroundStyle(Theme.ink2)
                Text(preview).font(Theme.section).foregroundStyle(Theme.seal).lineLimit(1)
                Spacer()
            }
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 84), spacing: 6)], spacing: 6) {
                ForEach(NamingCatalog.templatePresets) { preset in
                    let on = template == preset.template
                    Button {
                        GameFeel.shared.tap()
                        template = preset.template
                    } label: {
                        Text(preset.label).font(Theme.caption).foregroundStyle(on ? Theme.paper2 : Theme.ink).lineLimit(1).minimumScaleFactor(0.75)
                            .padding(.horizontal, 8).frame(maxWidth: .infinity, minHeight: 30)
                            .background(on ? Theme.seal : Theme.paper2, in: Capsule())
                            .overlay(Capsule().stroke(on ? Theme.seal : Theme.line))
                    }
                    .buttonStyle(PressStyle())
                }
            }
            quickGrid {
                quickTile("应用模板", "textformat") { let t = template; run("国名已更改") { await model.edit("setNameTemplate", ["n": nation, "template": t.isEmpty ? NSNull() as Any : t as Any]) } }
                quickTile("随机国名", "dice") { run("国名已更改") { await model.edit("randomNationName", ["n": nation]) } }
            }
            Text("占位符：{名}=基名，{号}=政体称谓，{序}=复国序号，{姓}=统治家族姓氏。政体更迭或换代时自动刷新。")
                .font(Theme.caption).foregroundStyle(Theme.ink2).frame(maxWidth: .infinity, alignment: .leading)
        }
        .onAppear {
            if !templateLoaded {
                template = info.nameTemplate ?? ""
                templateLoaded = true
            }
        }
    }
}

private struct NewUnitEditor: View {
    let done: (String, String, Double, Double, Double) -> Void
    @State private var base = "Infantry"
    @State private var name = ""
    @State private var power = 120.0
    @State private var speed = 100.0
    @State private var weight = 10.0
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                SheetHeader(title: "编入新兵种", subtitle: "以现有兵种为底", seal: "兵")
                VStack(spacing: 12) {
                    Group2 {
                        PaperMenu(title: "基础兵种", items: UnitKinds.kinds.map { ($0.key, $0.name) }, selection: $base)
                    }
                    TextField("新兵种名称", text: $name).paperField()
                    quickSlider("战力", value: $power, 10...500, step: 5, text: "\(Int(power))%")
                    quickSlider("行速", value: $speed, 10...300, step: 5, text: "\(Int(speed))%")
                    quickSlider("征募", value: $weight, 1...100, text: "\(Int(weight))")
                }
                .padding(.horizontal, 22)
                SealButton(title: "编入", disabled: name.trimmingCharacters(in: .whitespaces).isEmpty) { done(base, name, power, speed, weight) }.padding(.horizontal, 22)
            }
            .padding(.bottom, 16)
        }
        .presentationDetents([.medium, .fraction(0.89)]).presentationCornerRadius(Theme.Control.cornerSheet).presentationBackground { MemorialPaper() }.presentationDragIndicator(.hidden)
    }
}

private struct TitleEditor: View {
    @State var edit: String
    let label: String
    let done: (String?) -> Void
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            SheetHeader(title: "官职称号", subtitle: "现称 \(label)", seal: "官")
            TextField("新称号", text: $edit).paperField().padding(.horizontal, 22)
            SealButton(title: "颁行", disabled: edit.trimmingCharacters(in: .whitespaces).isEmpty) { done(edit) }.padding(.horizontal, 22)
            Button("恢复默认") { done(nil) }.font(Theme.body).foregroundStyle(Theme.ink2).frame(maxWidth: .infinity)
        }
        .padding(.bottom, 16)
        .presentationDetents([.height(320)]).presentationCornerRadius(Theme.Control.cornerSheet).presentationBackground { MemorialPaper() }.presentationDragIndicator(.hidden)
    }
}

private struct UnitEditor: View {
    let unit: GameModel.UnitRow
    let done: (String, Double, Double, Double, Bool) -> Void
    @State private var name = ""
    @State private var power = 100.0
    @State private var speed = 100.0
    @State private var weight = 10.0
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                SheetHeader(title: unit.base, subtitle: unit.note, seal: "兵")
                VStack(spacing: 12) {
                    TextField("名称", text: $name).paperField()
                    quickSlider("战力", value: $power, 10...500, step: 5, text: "\(Int(power))%")
                    quickSlider("行速", value: $speed, 10...300, step: 5, text: "\(Int(speed))%")
                    quickSlider("征募", value: $weight, 0...100, text: weight == 0 ? "不征" : "\(Int(weight))")
                }
                .padding(.horizontal, 22)
                SealButton(title: "颁行") { done(name, power, speed, weight, false) }.padding(.horizontal, 22)
                Button("恢复默认") { done("", 0, 0, 0, true) }.font(Theme.body).foregroundStyle(Theme.ink2).frame(maxWidth: .infinity)
            }
            .padding(.bottom, 16)
        }
        .onAppear { name = unit.name; power = unit.power; speed = unit.speed; weight = unit.weight }
        .presentationDetents([.medium, .fraction(0.89)]).presentationCornerRadius(Theme.Control.cornerSheet).presentationBackground { MemorialPaper() }.presentationDragIndicator(.hidden)
    }
}

/// 等高对齐的编辑工具宫格（2 列或 3 列，严格 44pt 按钮高度，杜绝文字裁剪与参差错位）。
func editorToolGrid<C: View>(columns: Int = 2, @ViewBuilder _ content: () -> C) -> some View {
    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: max(1, columns)), spacing: 8) {
        content()
    }
}

func editorToolButton(_ title: String, glyph: InkGlyph, destructive: Bool = false, action: @escaping () -> Void) -> some View {
    Button {
        GameFeel.shared.tap()
        action()
    } label: {
        HStack(spacing: 7) {
            InkIcon(glyph: glyph, size: 15, weight: 1.7)
                .frame(width: 18, height: 18)
            Text(title)
                .font(Theme.body)
                .lineLimit(1)
                .minimumScaleFactor(0.76)
        }
        .foregroundStyle(destructive ? Theme.seal : Theme.ink)
        .padding(.horizontal, 10)
        .frame(maxWidth: .infinity)
        .frame(height: 44)
        .background(
            destructive ? Theme.seal.opacity(0.06) : Theme.paperLight.opacity(0.92),
            in: RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous)
        )
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous)
                .stroke(destructive ? Theme.seal.opacity(0.32) : Theme.hairline, lineWidth: 0.75)
        )
        .contentShape(RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous))
    }
    .buttonStyle(PressStyle())
}
