import SwiftUI
import CoreText
import UniformTypeIdentifiers
import LieguojiCore

struct MenuSheet: View {
    @ObservedObject var model: GameModel
    @ObservedObject var controller: MapController
    var openEdicts: () -> Void = {}
    var openEditor: () -> Void = {}
    var wallpaper: () -> Void = {}
    var say: (String) -> Void = { _ in }
    let close: () -> Void
    @State private var creating = false
    @State private var archive = false
    @State private var notes = false
    @State private var exported: ExportFile?
    @State private var importing = false
    /// 菜单 in three pages: the game (saves, worlds, edicts), the map's look, and the rest.
    @State private var page = "game"
    @State private var calendar = false
    @State private var eraText = ""
    @State private var yearText = ""
    var body: some View {
        ScrollView {
        VStack(alignment: .leading, spacing: 14) {
            SheetHeader(title: "菜单", subtitle: AppVersion.text)
            ChipPicker(items: [("game", "游戏"), ("map", "地图显示"), ("other", "声音与其他")], selection: $page).padding(.horizontal, 16)
            switch page {
            case "map":
                MapDisplaySettings(controller: controller)
            case "other":
                SectionLabel("声音与触感")
                FeelSettings()
                SectionLabel("远程计算")
                RemoteSettings(model: model)
                SectionLabel("推演与画面")
                Group2 {
                    PaperSwitch(title: "显示军队", on: $controller.play.showArmies)
                    Divider2()
                    PaperSwitch(title: "显示战争箭头", on: $controller.play.warArrows)
                    Divider2()
                    PaperSlider(title: "军队图标", value: $controller.play.iconScale, range: 0.6...1.6, step: 0.1) { String(format: "%.1f×", $0) }
                        .padding(.horizontal, 16).padding(.vertical, 10)
                    Divider2()
                    FrameSettings(play: $controller.play)
                    Divider2()
                    PaperSwitch(title: "进场镜头拉远", on: $controller.play.introCamera)
                    Divider2()
                    PaperSwitch(title: "动画先快后缓（关闭为匀速）", on: $controller.play.easeReveal)
                    Divider2()
                    PaperSwitch(title: "大事自动暂停（宣战、起义、亡国）", on: $controller.play.pauseOnNews)
                    Divider2()
                    VStack(alignment: .leading, spacing: 8) {
                        Text("自动存档").font(Theme.kai(16)).foregroundStyle(Theme.ink)
                        ChipPicker(items: [(60, "1分钟"), (120, "2分钟"), (300, "5分钟"), (0, "关闭")], selection: $controller.play.autosave)
                    }
                    .padding(.horizontal, 16).padding(.vertical, 10)
                }
                .padding(.horizontal, 16)
                SectionLabel("调试")
                Group2 {
                    PaperSwitch(title: "显示帧率与推演耗时", on: $controller.showMetrics)
                    Divider2()
                    ResetSettingsRow(controller: controller, say: say)
                }
                .padding(.horizontal, 16)
            default:
                SectionLabel("存档")
                Group2 {
                    Button {
                        Task { let ok = await model.saveNow(); GameFeel.shared.notify(ok ? .success : .error); say(ok ? "已保存" : "保存失败"); close() }
                    } label: { MenuRow(symbol: "square.and.arrow.down", title: "保存") }.buttonStyle(.plain)
                    Divider2()
                    Button { Task { exported = await model.exportCopy().map(ExportFile.init) } } label: { MenuRow(symbol: "square.and.arrow.up", title: "导出存档（备份）") }.buttonStyle(.plain)
                    Divider2()
                    Button { importing = true } label: { MenuRow(symbol: "tray.and.arrow.down", title: "导入存档") }.buttonStyle(.plain)
                    Divider2()
                    Button { archive = true } label: { MenuRow(symbol: "books.vertical", title: "世界卷宗") }.buttonStyle(.plain)
                }
                .padding(.horizontal, 16)
                SectionLabel("世界")
                Group2 {
                    Button { openEditor() } label: { MenuRow(symbol: "paintbrush.pointed.fill", title: "世界编辑") }.buttonStyle(.plain)
                    Divider2()
                    Button { openEdicts() } label: { MenuRow(symbol: "scroll.fill", title: "天下诏令与规则") }.buttonStyle(.plain)
                    Divider2()
                    Button { creating = true } label: { MenuRow(symbol: "globe.asia.australia", title: "新世界") }.buttonStyle(.plain)
                    Divider2()
                    Button { wallpaper() } label: { MenuRow(symbol: "photo.on.rectangle", title: "壁纸模式") }.buttonStyle(.plain)
                    Divider2()
                    Button { calendar = true } label: { MenuRow(symbol: "calendar", title: "纪年与日期") }.buttonStyle(.plain)
                    Divider2()
                    Button { close(); model.backToTitle() } label: { MenuRow(symbol: "house", title: "返回标题") }.buttonStyle(.plain)
                }
                .padding(.horizontal, 16)
                Group2 {
                    Button { notes = true } label: { MenuRow(symbol: "sparkles", title: "本版新增与更新内容") }.buttonStyle(.plain)
                }
                .padding(.horizontal, 16)
            }
        }
        .padding(.bottom, 24)
        .animation(Motion.fade, value: page)
        }
        .sheet(isPresented: $creating) {
            NewWorldSheet(start: { options in creating = false; close(); Task { await model.generate(options) } }, draw: { options in creating = false; close(); model.openEditor(options) }, inputs: model.previewInputs)
                .presentationDetents([.medium, .large]).presentationBackground { MemorialPaper() }.presentationDragIndicator(.hidden)
        }
        .sheet(isPresented: $archive) {
            WorldArchiveSheet(model: model) { world in archive = false; close(); Task { await model.openArchived(world) } }
                .presentationDetents([.medium, .large]).presentationBackground { MemorialPaper() }.presentationDragIndicator(.hidden)
        }
        .sheet(item: $exported) { file in ShareSheet(items: [file.url]) }
        .sheet(isPresented: $calendar) {
            VStack(alignment: .leading, spacing: 14) {
                SheetHeader(title: "纪年与日期", subtitle: model.state?.dateText ?? "", seal: "历")
                HStack { Text("年号").font(Theme.kai(16)).foregroundStyle(Theme.ink2).frame(width: 70, alignment: .leading); TextField("公元", text: $eraText).paperField() }.padding(.horizontal, 22)
                HStack { Text("今年为").font(Theme.kai(16)).foregroundStyle(Theme.ink2).frame(width: 70, alignment: .leading); TextField("\(model.state?.displayYear ?? 1)", text: $yearText).keyboardType(.numbersAndPunctuation).paperField(); Text("年").font(Theme.kai(16)).foregroundStyle(Theme.ink2) }.padding(.horizontal, 22)
                Text("只改纪年的显示（年号与年份），推演的时间不变；留空年号即用「公元」。").font(Theme.kai(12)).foregroundStyle(Theme.ink2).padding(.horizontal, 22)
                SealButton(title: "颁行", disabled: false) {
                    calendar = false
                    Task { if let e = await model.setCalendar(era: eraText, year: Int(yearText)) { say(e) } else { say("纪年已改") } }
                }
                .padding(.horizontal, 22)
            }
            .padding(.bottom, 16)
            .presentationDetents([.height(340)]).presentationBackground { MemorialPaper() }.presentationDragIndicator(.hidden)
        }
        .fileImporter(isPresented: $importing, allowedContentTypes: [.data, .item]) { result in
            if case .success(let url) = result { close(); Task { await model.importSave(from: url) } }
        }
        .sheet(isPresented: $notes) { ReleaseNotesSheet().presentationDetents([.large]).presentationBackground { MemorialPaper() }.presentationDragIndicator(.hidden) }
    }
}

/// The map switches. Same paper rows as the rest of the menus.
struct MapDisplaySettings: View {
    @ObservedObject var controller: MapController
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            SectionLabel("界线")
            Group2 {
                PaperSwitch(title: "国界", on: $controller.display.borders)
                Divider2()
                PaperSwitch(title: "行省边界", on: $controller.display.provinceLines)
                Divider2()
                PaperSwitch(title: "航线", on: $controller.display.seaRoutes)
                Divider2()
                PaperSwitch(title: "经纬线", on: Binding(get: { controller.display.gridLines == true }, set: { controller.display.gridLines = $0 }))
            }
            .padding(.horizontal, 16)
            SectionLabel("城市与地貌")
            Group2 {
                PaperSwitch(title: "城市名称", on: $controller.display.cityNames)
                Divider2()
                PaperSwitch(title: "城市图标", on: $controller.display.cityIcons)
                Divider2()
                PaperSwitch(title: "植被与地貌图标", on: $controller.display.vegetation)
            }
            .padding(.horizontal, 16)
            SectionLabel("国名")
            Group2 {
                PaperSwitch(title: "完整国名", on: $controller.display.fullNationNames)
                Divider2()
                PaperSlider(title: "大小", value: $controller.display.nationNameScale, range: 0.5...2, step: 0.05) { String(format: "%.2f", $0) }
                    .padding(.horizontal, 16).padding(.vertical, 10)
            }
            .padding(.horizontal, 16)
            SectionLabel("画面")
            Group2 {
                PaperSwitch(title: "羊皮纸", on: $controller.display.parchment)
                Divider2()
                PaperSwitch(title: "暗边", on: $controller.display.darkEdges)
                PaperSwitch(title: "舆图细节（水线、罗盘、田亩、道路）", on: Binding(get: { controller.display.mapDetail ?? true }, set: { controller.display.mapDetail = $0 }))
                Divider2()
                PaperSlider(title: "国色浓度", value: $controller.display.colorDensity, range: 0.2...1, step: 0.1) { "\(Int($0 * 100))%" }
                    .padding(.horizontal, 16).padding(.vertical, 10)
                Divider2()
                VStack(alignment: .leading, spacing: 8) {
                    Text("海色").font(Theme.kai(16)).foregroundStyle(Theme.ink)
                    ChipPicker(items: [("original", "原作海蓝"), ("warm", "暖纸海色")], selection: $controller.display.ocean)
                }
                .padding(.horizontal, 16).padding(.vertical, 10)
            }
            .padding(.horizontal, 16)
        }
    }
}

struct ExportFile: Identifiable { let url: URL; var id: String { url.absoluteString } }

/// UIActivityViewController for exporting a save file.
struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]
    func makeUIViewController(context: Context) -> UIActivityViewController { UIActivityViewController(activityItems: items, applicationActivities: nil) }
    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}

struct MenuRow: View {
    let symbol: String; let title: String
    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: symbol).frame(width: 24).foregroundStyle(Theme.seal)
            Text(title).font(Theme.kai(18)).foregroundStyle(Theme.ink)
            Spacer()
            Image(systemName: "chevron.right").font(.caption).foregroundStyle(Theme.ink2)
        }
        .padding(.horizontal, 16).padding(.vertical, 13).contentShape(Rectangle())
    }
}

/// Pressed buttons sink slightly, like paper under a finger.
struct PressStyle: ButtonStyle {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.scaleEffect(configuration.isPressed && !reduceMotion ? 0.98 : 1).opacity(configuration.isPressed ? 0.86 : 1)
            .animation(reduceMotion ? nil : Motion.fade, value: configuration.isPressed)
    }
}

/// A row of paper chips (replaces the system segmented control).
/// 恢复默认设置: the map display and the 推演与画面 settings back to how a new install starts (the
/// worlds and saves are untouched). Every newer change in those settings can be undone this way.
struct ResetSettingsRow: View {
    @ObservedObject var controller: MapController
    let say: (String) -> Void
    @State private var asking = false
    var body: some View {
        Button { asking = true } label: {
            HStack {
                Text("恢复默认设置").font(Theme.kai(18)).foregroundStyle(Theme.seal)
                Spacer()
                Image(systemName: "arrow.counterclockwise").font(.system(size: 14, weight: .regular)).foregroundStyle(Theme.seal)
            }
            .padding(.horizontal, 16).padding(.vertical, 12).contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .confirmationDialog("恢复地图显示与推演画面的默认设置？", isPresented: $asking, titleVisibility: .visible) {
            Button("恢复默认", role: .destructive) {
                controller.play = PlaySettings(); controller.display = DisplaySettings()
                say("已恢复默认设置")
            }
        } message: { Text("世界与存档不受影响。") }
    }
}

/// 画面档位 and each frame rate, the map's sharpness and the simulation's share of the processor.
struct FrameSettings: View {
    @Binding var play: PlaySettings
    private func row<T: Hashable>(_ title: String, _ note: String, _ items: [(T, String)], _ value: Binding<T>) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Text(title).font(Theme.kai(16)).foregroundStyle(Theme.ink)
                Spacer()
                Text(note).font(Theme.kai(12)).foregroundStyle(Theme.ink2)
            }
            ChipPicker(items: items, selection: value)
        }
        .padding(.horizontal, 16).padding(.vertical, 9)
    }
    var body: some View {
        VStack(spacing: 0) {
            row("画面档位", play.preset == "custom" ? "自定" : "一键设定下面各项", PlaySettings.presets.map { ($0.key, $0.name) } + (play.preset == "custom" ? [("custom", "自定")] : []), $play.preset)
            Divider2()
            row("拖动地图帧率", "拖动、缩放时", [(30, "30"), (60, "60"), (120, "120")], $play.mapFPS)
            Divider2()
            row("行军帧率", "军队移动时", [(30, "30"), (60, "60"), (120, "120")], $play.marchFPS)
            Divider2()
            row("动画帧率", "海浪、战场、旗帜", [(15, "15"), (30, "30"), (60, "60")], $play.effectFPS)
            Divider2()
            row("地图清晰度", "越高越耗电", [(1.0, "低"), (1.5, "中"), (2.0, "高"), (3.0, "原生")], $play.renderScale)
            Divider2()
            row("推演占用", "越高越快、越热", [(50, "50%"), (65, "65%"), (80, "80%"), (100, "全速")], $play.simLoad)
            Divider2()
            PaperSwitch(title: "发热时自动降档", on: $play.autoCool)
            Text("手机变热或开启低电量模式时，帧率降到 30、推演多休息、暂停海浪和战场烟雾，降温后恢复。")
                .font(Theme.kai(12)).foregroundStyle(Theme.ink2).padding(.horizontal, 16).padding(.bottom, 9)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}
