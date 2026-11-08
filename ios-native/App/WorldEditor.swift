import SwiftUI
import LieguojiCore
import UniformTypeIdentifiers

/// 世界编辑 (the original's edit panel): brushes over the map, free labels, cultures and faiths, exports.
struct WorldEditorSheet: View {
    @ObservedObject var model: GameModel
    var close: () -> Void = {}
    var takeShot: () -> Void = {}

    private enum Tab: String, CaseIterable { case brush = "笔刷", land = "疆土", pact = "同盟", map = "山河图", labels = "标注", culture = "文化宗教", output = "导出" }
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
            VStack(spacing: 12) {
                SheetHeader(title: "世界编辑", subtitle: "笔刷、标注、文化宗教与导出", seal: "编")
                ScrollView(.horizontal, showsIndicators: false) { HStack(spacing: 8) {
                    ForEach(Tab.allCases, id: \.self) { t in
                        Button { withAnimation(.spring(response: 0.3, dampingFraction: 0.85)) { tab = t } } label: {
                            Text(t.rawValue).font(Theme.kai(15)).foregroundStyle(tab == t ? Theme.paper2 : Theme.ink)
                                .padding(.horizontal, 14).frame(height: 38)
                                .background(tab == t ? Theme.seal : Theme.paper2, in: RoundedRectangle(cornerRadius: 11, style: .continuous))
                                .overlay(RoundedRectangle(cornerRadius: 11, style: .continuous).stroke(tab == t ? Color.clear : Theme.line))
                        }
                        .buttonStyle(PressStyle())
                    }
                }
                .padding(.horizontal, 14) }
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
            .padding(.bottom, 24)
        }
        .paperToast($flash)
        .task { await model.refreshCustom() }
        .sheet(item: $choice) { c in
            ScrollView {
                VStack(spacing: 0) {
                    SheetHeader(title: c.title, seal: "择")
                    Group2 {
                        ForEach(Array(c.items.enumerated()), id: \.offset) { i, item in
                            if i > 0 { Divider2() }
                            Button { choice = nil; item.1() } label: {
                                HStack { Text(item.0).font(Theme.kai(17)).foregroundStyle(Theme.ink); Spacer() }.padding(.horizontal, 16).padding(.vertical, 12).contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal, 16)
                }
                .padding(.bottom, 20)
            }
            .presentationDetents([.medium, .large]).presentationBackground { MemorialPaper() }.presentationDragIndicator(.hidden)
        }
        .sheet(isPresented: $picking) {
            if let map = model.map, let state = model.state {
                ScrollView {
                    VStack(alignment: .leading, spacing: 14) {
                        SheetHeader(title: "绘制哪国疆域", seal: "择")
                        Group2 { NationGrid(map: map, nations: state.nations.indices.filter { state.nations[$0].alive && $0 < map.meta.nations.count }, selection: $target) }.padding(.horizontal, 16)
                        SealButton(title: "开始绘制", disabled: target < 0) {
                            let t = target
                            picking = false
                            let c = model.controller
                            c.brushName = nil; c.brushAction = nil; c.placingArmy = false; c.paintNation = t
                            close()
                        }
                        .padding(.horizontal, 22)
                    }
                    .padding(.bottom, 20)
                }
                .presentationDetents([.medium, .large]).presentationBackground { MemorialPaper() }.presentationDragIndicator(.hidden)
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
        VStack(spacing: 12) {
            quickSection("归属与文化") {
                quickGrid {
                    quickTile("绘制国家", "paintbrush.pointed") { target = -1; picking = true }
                    quickTile("绘制文化", "text.book.closed") {
                        choice = Choice(title: "刷上哪种文化", items: Names.culture.keys.sorted().map { k in
                            (Names.culture[k] ?? k, { brush("绘制文化：\(Names.culture[k] ?? k)") { p in await model.setCityCulture(p, k) } })
                        })
                    }
                    quickTile("绘制信仰", "hands.sparkles") {
                        choice = Choice(title: "刷上哪种信仰", items: Names.religion.keys.filter { $0 != "none" }.sorted().map { k in
                            (Names.religion[k] ?? k, { brush("绘制信仰：\(Names.religion[k] ?? k)") { p in await model.setProvinceFaith(p, religion: k) } })
                        })
                    }
                    quickTile("定圣地", "sparkles") { brush("定圣地") { p in await model.setHolyProvince(p) } }
                }
            }
            quickSection("城防与民生") {
                quickGrid {
                    quickTile("筑要塞", "building.columns") { brush("筑要塞") { p in await model.editProvince(p, population: nil, fortress: true) } }
                    quickTile("拆要塞", "hammer") { brush("拆要塞") { p in await model.editProvince(p, population: nil, fortress: false) } }
                    quickTile("人口倍增", "person.3") { brush("人口倍增") { p in await scale(p, 2) } }
                    quickTile("人口减半", "person.2.slash", destructive: true) { brush("人口减半") { p in await scale(p, 0.5) } }
                }
            }
            quickSection("天灾") {
                quickGrid {
                    quickTile("瘟疫", "allergens", destructive: true) { brush("降瘟疫") { p in await model.provinceDisaster(p, kind: "plague") } }
                    quickTile("饥荒", "drop.degreesign.slash", destructive: true) { brush("降饥荒") { p in await model.provinceDisaster(p, kind: "famine") } }
                    quickTile("平息", "cross.case") { brush("平息灾情") { p in await model.provinceDisaster(p, kind: nil) } }
                }
            }
            Text("选好笔刷后，一指点按或划过州郡即可落笔，两指移动地图，点顶部「完成」结束。").font(Theme.kai(13)).foregroundStyle(Theme.ink2).padding(.horizontal, 22)
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
                ColorPicker("颜色", selection: $labelColor, supportsOpacity: false).font(Theme.kai(15)).foregroundStyle(Theme.ink2)
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
                quickSection("已有标注（点选修改）") {
                    ForEach(model.customLabels) { l in
                        Button {
                            labelId = l.id; labelText = l.text; labelSize = l.size; labelAngle = l.angle * 180 / .pi; labelColor = Names.color(l.color)
                        } label: {
                            HStack {
                                Circle().fill(Names.color(l.color)).frame(width: 12, height: 12)
                                Text(l.text).font(Theme.kai(16)).foregroundStyle(labelId == l.id ? Theme.seal : Theme.ink).lineLimit(1)
                                Spacer()
                                Image(systemName: "chevron.right").font(.caption).foregroundStyle(Theme.ink2)
                            }
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
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
                quickGrid {
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

/// 特性、官职称号与兵种档案, in the nation page's custom tab.
struct NationExtrasView: View {
    @ObservedObject var model: GameModel
    let nation: Int
    let info: NationInfo
    let who: NationInfo?
    let say: (String) -> Void
    let reload: () async -> Void

    private struct Edit: Identifiable { let id: String; let label: String; var text: String }
    @State private var titleEdit: Edit?
    @State private var units: [GameModel.UnitRow] = []
    @State private var unitEdit: GameModel.UnitRow?
    @State private var extras: [GameModel.ExtraUnit] = []
    @State private var addingUnit = false
    @State private var template = ""
    @State private var exported: URL?
    @State private var importing = false
    private struct SharedFile: Identifiable { let url: URL; var id: URL { url } }

    private func run(_ ok: String, _ body: @escaping () async -> String?) {
        Task { let e = await body(); say(e ?? ok); GameFeel.shared.notify(e == nil ? .success : .error); await reload() }
    }
    var body: some View {
        VStack(spacing: 12) {
            quickSection("国家特性") {
                HStack(spacing: 8) {
                    Button("全部开启") { run("特性已全部开启") { await model.setStateTrait(nation, trait: nil, on: true) } }.font(Theme.kai(15)).foregroundStyle(Theme.seal)
                    Spacer()
                    Button("全部关闭") { run("特性已全部关闭") { await model.setStateTrait(nation, trait: nil, on: false) } }.font(Theme.kai(15)).foregroundStyle(Theme.ink2)
                }
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)], spacing: 8) {
                    ForEach(info.allTraits ?? [], id: \.key) { t in
                        Button { GameFeel.shared.tap(); run(t.on ? "已关闭\(t.name)" : "已开启\(t.name)") { await model.setStateTrait(nation, trait: t.key, on: !t.on) } } label: {
                            VStack(alignment: .leading, spacing: 3) {
                                HStack(spacing: 5) {
                                    Image(systemName: t.on ? "checkmark.seal.fill" : "seal").font(.system(size: 13)).foregroundStyle(t.on ? Theme.seal : Theme.ink2)
                                    Text(t.name).font(Theme.kai(15)).foregroundStyle(t.on ? Theme.seal : Theme.ink).lineLimit(1)
                                }
                                Text(t.text).font(Theme.kai(11)).foregroundStyle(Theme.ink2).lineLimit(2).minimumScaleFactor(0.8).frame(maxWidth: .infinity, alignment: .leading)
                            }
                            .padding(9).frame(maxWidth: .infinity, minHeight: 62, alignment: .topLeading)
                            .background(t.on ? Theme.seal.opacity(0.08) : Theme.paper2, in: RoundedRectangle(cornerRadius: 11, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: 11, style: .continuous).stroke(t.on ? Theme.seal.opacity(0.4) : Theme.line))
                        }
                        .buttonStyle(PressStyle())
                    }
                }
            }
            quickSection("官职称号") {
                ForEach(["Chancellor", "Steward", "Marshal"], id: \.self) { o in
                    Button { titleEdit = Edit(id: o, label: NationSheet.title(o, who), text: NationSheet.title(o, who)) } label: {
                        HStack {
                            Text(NationSheet.title(o, who)).font(Theme.kai(16)).foregroundStyle(Theme.ink)
                            Spacer()
                            Image(systemName: "pencil").font(.system(size: 12)).foregroundStyle(Theme.seal)
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
            quickSection("兵种档案") {
                ForEach(units) { u in
                    Button { unitEdit = u } label: {
                        HStack(spacing: 8) {
                            Text(u.name).font(Theme.kai(16)).foregroundStyle(u.weight > 0 ? Theme.ink : Theme.ink2).lineLimit(1)
                            Spacer()
                            Text("战力\(Int(u.power))% · 行速\(Int(u.speed))% · 征募\(Int(u.weight))").font(Theme.kai(12)).foregroundStyle(Theme.ink2).monospacedDigit().lineLimit(1).minimumScaleFactor(0.7)
                            Image(systemName: "chevron.right").font(.caption).foregroundStyle(Theme.ink2)
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
            quickSection("新增兵种") {
                ForEach(Array(extras.enumerated()), id: \.offset) { i, e in
                    HStack {
                        Text("\(e.name)（基于\(UnitKinds.name(e.base))）").font(Theme.kai(15)).foregroundStyle(Theme.ink).lineLimit(1)
                        Spacer()
                        Button("删除") { run("兵种已删除") { let r = await model.edit("removeExtraUnit", ["n": nation, "i": i]); extras = await model.extraUnits(nation); return r } }.font(Theme.kai(14)).foregroundStyle(Theme.seal)
                    }
                }
                quickGrid {
                    quickTile("编入新兵种", "plus.circle") { addingUnit = true }
                    quickTile("导出档案", "square.and.arrow.up") { Task { exported = await model.exportPackage(nation, name: "列国纪军事档案") } }
                    quickTile("导入档案", "square.and.arrow.down") { importing = true }
                }
            }
            quickSection("国名") {
                TextField("模板：用 {名} 和 {号}，留空恢复", text: $template).paperField()
                quickGrid {
                    quickTile("应用模板", "textformat") { let t = template; run("国名已更改") { await model.edit("setNameTemplate", ["n": nation, "template": t.isEmpty ? NSNull() as Any : t as Any]) } }
                    quickTile("随机国名", "dice") { run("国名已更改") { await model.edit("randomNationName", ["n": nation]) } }
                }
            }
            quickSection("同盟") {
                quickGrid { quickTile("强制退出同盟", "person.2.slash", destructive: true) { run("已退出同盟") { await model.leaveAlliance(nation) } } }
            }
        }
        .task { units = await model.unitProfile(nation); extras = await model.extraUnits(nation) }
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
                run("官职称号已修改") { await model.setOfficeTitle(nation, office: e.id, title: value) }
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
                    Picker("基础兵种", selection: $base) { ForEach(UnitKinds.kinds, id: \.key) { k in Text(k.name).tag(k.key) } }.pickerStyle(.menu).tint(Theme.seal).frame(maxWidth: .infinity, alignment: .leading)
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
        .presentationDetents([.medium, .large]).presentationBackground { MemorialPaper() }.presentationDragIndicator(.hidden)
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
            Button("恢复默认") { done(nil) }.font(Theme.kai(15)).foregroundStyle(Theme.ink2).frame(maxWidth: .infinity)
        }
        .padding(.bottom, 16)
        .presentationDetents([.height(320)]).presentationBackground { MemorialPaper() }.presentationDragIndicator(.hidden)
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
                Button("恢复默认") { done("", 0, 0, 0, true) }.font(Theme.kai(15)).foregroundStyle(Theme.ink2).frame(maxWidth: .infinity)
            }
            .padding(.bottom, 16)
        }
        .onAppear { name = unit.name; power = unit.power; speed = unit.speed; weight = unit.weight }
        .presentationDetents([.medium, .large]).presentationBackground { MemorialPaper() }.presentationDragIndicator(.hidden)
    }
}
