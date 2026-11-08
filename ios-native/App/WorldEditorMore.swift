import SwiftUI
import PhotosUI
import LieguojiCore

/// 无主之地、行政区、家族封地、世界开关 — the rest of the world editor's land tools.
struct EditorLandTab: View {
    @ObservedObject var model: GameModel
    let begin: (String, @escaping (Int) async -> String?) -> Void
    let say: (String?, String) -> Void
    let close: () -> Void

    private struct Choice: Identifiable { let id = UUID(); let title: String; let items: [(String, () -> Void)] }
    @State private var blankName = "无主之地"
    @State private var unconquerable = true
    @State private var districtName = ""
    @State private var districts: [GameModel.DistrictRow] = []
    @State private var families: [GameModel.FamilyRow] = []
    @State private var choice: Choice?
    @State private var extras = GameModel.MapExtras()

    private func reload() async {
        districts = await model.districtList(); families = await model.familyList(); extras = await model.mapExtras()
    }
    var body: some View {
        VStack(spacing: 12) {
            quickSection("无主之地") {
                TextField("名称", text: $blankName).paperField()
                PaperSwitch(title: "不可征服（无人能入）", on: $unconquerable)
                quickGrid {
                    quickTile("点选一州划定", "square.dashed") {
                        let name = blankName, un = unconquerable, c = model.controller
                        c.pickPrompt = "点选要划为无主之地的州郡"
                        c.onPick = { p in
                            c.pickPrompt = nil; c.onPick = nil
                            Task { say(await model.edit("createBlankLand", ["province": p, "name": name, "unconquerable": un ? 1 : 0]), "\(name)已划定") }
                        }
                        close()
                    }
                }
                Text("划定后在「笔刷 · 绘制国家」里选它，可以继续向外扩张。").font(Theme.kai(12)).foregroundStyle(Theme.ink2).frame(maxWidth: .infinity, alignment: .leading)
            }
            quickSection("行政区") {
                TextField("新行政区名称", text: $districtName).paperField()
                quickGrid {
                    quickTile("新建并绘制", "plus.square.dashed") {
                        let name = districtName, c = model.controller
                        c.pickPrompt = "点选新行政区的中心州郡"
                        c.onPick = { p in
                            c.pickPrompt = nil; c.onPick = nil
                            Task {
                                say(await model.edit("setDistrict", ["province": p, "region": -1, "name": name]), "行政区已新建")
                                let list = await model.districtList()
                                if let d = list.max(by: { $0.id < $1.id }) { begin("绘制行政区：\(d.name)") { q in await model.edit("setDistrict", ["province": q, "region": d.id, "name": NSNull()]) } }
                            }
                        }
                        close()
                    }
                    quickTile("绘制已有", "paintbrush") {
                        choice = Choice(title: "绘制哪个行政区", items: districts.map { d in ("\(d.name) · \(d.provinces)州", { begin("绘制行政区：\(d.name)") { q in await model.edit("setDistrict", ["province": q, "region": d.id, "name": NSNull()]) } }) })
                    }
                    quickTile("删除", "trash", destructive: true) {
                        choice = Choice(title: "删除哪个行政区", items: districts.map { d in ("\(d.name) · \(d.provinces)州", { Task { say(await model.edit("deleteDistrict", ["region": d.id]), "行政区已删除"); await reload() } }) })
                    }
                    quickTile("重新生成", "arrow.triangle.2.circlepath") { Task { say(await model.edit("regenerateDistricts", [:]), "行政区已重新生成"); await reload() } }
                }
            }
            quickSection("家族封地") {
                quickGrid {
                    quickTile("绘制封地", "paintbrush.pointed") {
                        choice = Choice(title: "绘制哪个家族", items: families.map { f in ("\(f.name) · \(f.provinces)州", { begin("绘制封地：\(f.name)") { q in await model.edit("setFamilyLand", ["province": q, "family": f.id]) } }) })
                    }
                    quickTile("擦除封地", "eraser") { begin("擦除封地") { q in await model.edit("setFamilyLand", ["province": q, "family": NSNull()]) } }
                    quickTile("除爵", "person.fill.xmark", destructive: true) {
                        choice = Choice(title: "剥夺哪个家族的爵位与封地", items: families.map { f in (f.name, { Task { say(await model.edit("editFamily", ["family": f.id, "surname": NSNull(), "influence": NSNull(), "strip": 1]), "已除爵"); await reload() } }) })
                    }
                }
            }
            quickSection("世界开关") {
                PaperSwitch(title: "自动放弃孤立行省", on: Binding(get: { extras.abandon ?? false }, set: { v in extras.abandon = v; Task { say(await model.setWorld("abandon", v ? 1 : 0), v ? "已开启" : "已关闭") } }))
                PaperSwitch(title: "协助盟友占领土地", on: Binding(get: { !(extras.noAssist ?? false) }, set: { v in extras.noAssist = !v; Task { say(await model.setWorld("noAssist", v ? 0 : 1), v ? "已开启" : "已关闭") } }))
            }
        }
        .task { await reload() }
        .sheet(item: $choice) { c in EditorChoiceList(title: c.title, items: c.items) { choice = nil } }
    }
}

/// A plain page of choices, shared by the editor tabs.
struct EditorChoiceList: View {
    let title: String
    let items: [(String, () -> Void)]
    let dismiss: () -> Void
    var body: some View {
        ScrollView {
            VStack(spacing: 0) {
                SheetHeader(title: title, seal: "择")
                Group2 {
                    ForEach(Array(items.enumerated()), id: \.offset) { i, item in
                        if i > 0 { Divider2() }
                        Button { dismiss(); item.1() } label: {
                            HStack { Text(item.0).font(Theme.kai(17)).foregroundStyle(Theme.ink).lineLimit(1); Spacer() }.padding(.horizontal, 16).padding(.vertical, 12).contentShape(Rectangle())
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
}

/// 同盟编辑: name, colour, members, unbreakable.
struct EditorAllianceTab: View {
    @ObservedObject var model: GameModel
    let say: (String?, String) -> Void
    @State private var list: [GameModel.AllianceRow] = []
    @State private var open: Int?
    @State private var name = ""
    @State private var color = Color.gray
    @State private var picking = false
    @State private var target = -1
    private func reload() async { list = await model.allianceList() }
    var body: some View {
        VStack(spacing: 12) {
            if list.isEmpty { Text("天下暂无同盟").font(Theme.kai(15)).foregroundStyle(Theme.ink2).padding(30) }
            ForEach(list) { a in
                quickSection(a.name) {
                    if open == a.id, let map = model.map {
                        TextField("同盟名称", text: $name).paperField()
                        ColorPicker("同盟颜色", selection: $color, supportsOpacity: false).font(Theme.kai(15)).foregroundStyle(Theme.ink2)
                        ForEach(a.members, id: \.self) { n in
                            HStack {
                                Text(n < map.meta.nations.count ? map.meta.nations[n].name : "—").font(Theme.kai(16)).foregroundStyle(Theme.ink)
                                Spacer()
                                Button("逐出") { Task { say(await model.edit("allianceMember", ["i": a.id, "n": n, "join": 0]), "已逐出"); await reload() } }.font(Theme.kai(14)).foregroundStyle(Theme.seal)
                            }
                        }
                        quickGrid {
                            quickTile("保存", "checkmark.seal") {
                                let hex = NationSheet.hex(color), t = name
                                Task { say(await model.edit("editAlliance", ["i": a.id, "name": t, "color": hex, "unbreakable": NSNull()]), "同盟已修改"); await reload() }
                            }
                            quickTile("拉入成员", "person.badge.plus") { target = -1; picking = true }
                            quickTile(a.unbreakable ? "解除铁盟" : "设为铁盟", "lock") { Task { say(await model.edit("editAlliance", ["i": a.id, "name": NSNull(), "color": NSNull(), "unbreakable": a.unbreakable ? 0 : 1]), "同盟已修改"); await reload() } }
                            quickTile("解散", "xmark.octagon", destructive: true) { Task { say(await model.edit("disbandAlliance", ["i": a.id]), "同盟已解散"); open = nil; await reload() } }
                        }
                    } else {
                        Button { open = a.id; name = a.name; color = a.color.isEmpty ? .gray : Names.color(a.color) } label: {
                            HStack {
                                Text("\(a.members.count) 国\(a.unbreakable ? " · 铁盟" : "")").font(Theme.kai(15)).foregroundStyle(Theme.ink2)
                                Spacer()
                                Image(systemName: "chevron.down").font(.caption).foregroundStyle(Theme.ink2)
                            }
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
        .task { await reload() }
        .sheet(isPresented: $picking) {
            if let map = model.map, let state = model.state, let id = open, let a = list.first(where: { $0.id == id }) {
                ScrollView {
                    VStack(alignment: .leading, spacing: 14) {
                        SheetHeader(title: "拉入哪国", seal: "盟")
                        Group2 { NationGrid(map: map, nations: state.nations.indices.filter { state.nations[$0].alive && $0 < map.meta.nations.count && !a.members.contains($0) }, selection: $target) }.padding(.horizontal, 16)
                        SealButton(title: "加入同盟", disabled: target < 0) {
                            let t = target
                            picking = false
                            Task { say(await model.edit("allianceMember", ["i": id, "n": t, "join": 1]), "已加入"); await reload() }
                        }
                        .padding(.horizontal, 22)
                    }
                    .padding(.bottom, 20)
                }
                .presentationDetents([.medium, .large]).presentationBackground { MemorialPaper() }.presentationDragIndicator(.hidden)
            }
        }
    }
}

/// 河流、地名、地图图片.
struct EditorMapTab: View {
    @ObservedObject var model: GameModel
    let say: (String?, String) -> Void
    let close: () -> Void
    @State private var photo: PhotosPickerItem?
    @State private var imageId = -1
    @State private var imageName = ""
    @State private var imageData: String?
    @State private var width = 240.0
    @State private var angle = 0.0
    @State private var alpha = 1.0
    @State private var front = false
    @State private var visible = true
    @State private var imageX = 800.0
    @State private var imageY = 450.0
    @State private var climate = GameModel.ClimateSettings()
    @State private var busy = false

    private func drawRiver() {
        let c = model.controller
        var points = [Double]()
        c.terrainBrush = true
        c.pickPrompt = "一指画出河流，抬手完成"
        c.onTerrainStroke = { x, y in
            if points.count >= 2 { let dx = x - points[points.count - 2], dy = y - points[points.count - 1]; if dx * dx + dy * dy < 16 { return } }
            points += [x, y]
        }
        c.onTerrainStrokeEnd = {
            c.terrainBrush = false; c.pickPrompt = nil; c.onTerrainStroke = nil; c.onTerrainStrokeEnd = nil
            let line = points
            Task { if let e = await model.addRiver(line) { GameFeel.shared.notify(.error); print(e) } else { GameFeel.shared.tap() } }
        }
        close()
    }
    private func save(x: Double, y: Double) {
        let id = imageId, n = imageName.isEmpty ? "图片" : imageName, d = imageData, w = width, a = angle * .pi / 180, al = alpha, f = front, v = visible
        Task { say(await model.setMapImage(id: id, name: n, data: d, x: x, y: y, width: w, angle: a, alpha: al, front: f, visible: v), "图片已保存"); imageId = -1; imageData = nil; imageName = "" }
    }
    private func place() {
        guard imageData != nil || imageId >= 0 else { say("先选一张图片", ""); return }
        let c = model.controller
        c.pickPrompt = "点选图片的位置"
        c.onPick = { p in
            c.pickPrompt = nil; c.onPick = nil
            guard let m = model.map, m.meta.provinces.indices.contains(p) else { return }
            save(x: Double(m.meta.provinces[p].x), y: Double(m.meta.provinces[p].y))
        }
        close()
    }
    var body: some View {
        VStack(spacing: 12) {
            quickSection("气候与河流") {
                PaperStepper(title: "降水", value: $climate.rain, range: 10...200, unit: "%")
                PaperStepper(title: "气温修正", value: $climate.temperature, range: -30...30, unit: "°")
                PaperStepper(title: "北界纬度", value: $climate.north, range: -80...90, unit: "")
                PaperStepper(title: "南界纬度", value: $climate.south, range: -90...80, unit: "")
                SealButton(title: busy ? "推演中……" : "重算气候与河流", disabled: busy) {
                    busy = true
                    let c = climate
                    Task { let e = await model.reclimate(c); busy = false; say(e, "气候与河流已重算") }
                }
            }
            quickSection("河流") {
                quickGrid {
                    quickTile("手绘河流", "scribble") { drawRiver() }
                    quickTile("清除手绘", "eraser", destructive: true) { Task { let e = await model.edit("clearMapRivers", [:]); await model.refreshCustom(); say(e, "手绘河流已清除") } }
                }
            }
            quickSection("地名") {
                quickGrid {
                    quickTile("按文化重命名", "character.book.closed") { Task { let e = await model.edit("renameAllByCulture", [:]); await model.refreshCustom(); say(e, "全部城市已按文化重命名") } }
                    quickTile("随机一州", "dice") {
                        let c = model.controller
                        c.pickPrompt = "点选要随机改名的州郡"
                        c.onPick = { p in
                            c.pickPrompt = nil; c.onPick = nil
                            Task { let e = await model.edit("randomProvinceName", ["province": p]); await model.refreshCustom(); say(e, "地名已更改") }
                        }
                        close()
                    }
                }
            }
            quickSection(imageId >= 0 ? "修改图片" : "地图图片") {
                PhotosPicker(selection: $photo, matching: .images) {
                    HStack { Image(systemName: "photo"); Text(imageData == nil ? "从相册选图" : "已选图片，可更换"); Spacer() }.font(Theme.kai(16)).foregroundStyle(Theme.seal).contentShape(Rectangle())
                }
                TextField("名称", text: $imageName).paperField()
                quickSlider("宽度", value: $width, 20...1600, step: 10, text: "\(Int(width))")
                quickSlider("旋转", value: $angle, -180...180, text: "\(Int(angle))°")
                quickSlider("透明", value: $alpha, 0.05...1, step: 0.05, text: "\(Int(alpha * 100))%")
                PaperSwitch(title: "盖在地名之上", on: $front)
                PaperSwitch(title: "显示", on: $visible)
                quickGrid {
                    quickTile(imageId >= 0 ? "移到新位置" : "点地图放置", "mappin.and.ellipse") { place() }
                    if imageId >= 0 {
                        quickTile("保存修改", "checkmark.seal") { save(x: imageX, y: imageY) }
                        quickTile("删除", "trash", destructive: true) { let id = imageId; Task { let e = await model.edit("removeMapImage", ["id": id]); await model.refreshCustom(); say(e, "图片已删除"); imageId = -1 } }
                    }
                }
            }
            if !model.customImages.isEmpty {
                quickSection("已有图片（点选修改）") {
                    ForEach(model.customImages) { m in
                        Button {
                            imageId = m.id; imageName = m.name; imageData = nil; width = m.width; angle = m.angle * 180 / .pi; alpha = m.alpha; front = m.front; visible = m.visible; imageX = m.x; imageY = m.y
                        } label: {
                            HStack { Text(m.name).font(Theme.kai(16)).foregroundStyle(imageId == m.id ? Theme.seal : Theme.ink).lineLimit(1); Spacer(); Image(systemName: "chevron.right").font(.caption).foregroundStyle(Theme.ink2) }.contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
        .onChange(of: photo) { _, item in
            guard let item else { return }
            Task {
                guard let raw = try? await item.loadTransferable(type: Data.self), let source = UIImage(data: raw) else { say("读取图片失败", ""); return }
                // Kept in the save: never more than 900 points on a side.
                let k = min(1, 900 / max(source.size.width, source.size.height)), size = CGSize(width: source.size.width * k, height: source.size.height * k)
                let image = UIGraphicsImageRenderer(size: size).image { _ in source.draw(in: CGRect(origin: .zero, size: size)) }
                imageData = image.jpegData(compressionQuality: 0.72)?.base64EncodedString()
                photo = nil
            }
        }
    }
}
