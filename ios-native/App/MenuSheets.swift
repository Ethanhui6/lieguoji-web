import SwiftUI
import CoreText
import UniformTypeIdentifiers
import LieguojiCore

struct MenuSheet: View {
    @MainActor static var tourWarRules = false

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
    /// 菜单的游戏、画面、推演与战争四个分组。
    @State private var page = MenuSheet.tourWarRules ? "war" : "game"
    @State private var calendar = false
    @State private var eraText = ""
    @State private var yearText = ""
    var body: some View {
        ScrollView {
        VStack(alignment: .leading, spacing: 14) {
            SheetHeader(title: "菜单", subtitle: AppVersion.text, seal: "典")
            ChipPicker(items: [("game", "游戏"), ("map", "画面"), ("play", "推演"), ("war", "战争")], selection: $page).padding(.horizontal, Theme.Layout.pageInset)
            switch page {
            case "war":
                WarRuleSettings(model: model)
                Group2 {
                    Button { openEdicts() } label: { MenuRow(symbol: "scroll.fill", title: "外交、同盟、战争期限与停战") }
                        .buttonStyle(.plain)
                }
                .padding(.horizontal, Theme.Layout.pageInset)
            case "map":
                MapDisplaySettings(controller: controller)
                SectionLabel("性能与帧率")
                Group2 {
                    FrameSettings(controller: controller)
                }
                .padding(.horizontal, Theme.Layout.pageInset)
            case "play":
                SectionLabel("战场与推演")
                Group2 {
                    PaperSwitch(title: "显示战争箭头", on: $controller.play.warArrows)
                    Divider2()
                    PaperSwitch(title: "大事传报横幅", on: $controller.play.showHeralds)
                    Divider2()
                    PaperSwitch(title: "战况伤亡飘字", on: $controller.play.showBattleFloats)
                    Divider2()
                    PaperSwitch(title: "海面动态波浪", on: $controller.play.seaWaves)
                    Divider2()
                    PaperSwitch(title: "观战巡弋导演镜头", on: $controller.play.directorCruise)
                }
                .padding(.horizontal, Theme.Layout.pageInset)

                SectionLabel("节律与存档")
                Group2 {
                    PaperSwitch(title: "打开面板时自动暂停", on: $controller.play.pauseOnSheet)
                    Divider2()
                    PaperSwitch(title: "大事自动暂停（宣战、起义、亡国）", on: $controller.play.pauseOnNews)
                    Divider2()
                    PaperSwitch(title: "入场镜头缓动", on: $controller.play.introCamera)
                    Divider2()
                    VStack(alignment: .leading, spacing: 8) {
                        Text("自动存档间隔").font(Theme.body).foregroundStyle(Theme.ink)
                        ChipPicker(items: [(60, "1分钟"), (120, "2分钟"), (300, "5分钟"), (0, "关闭")], selection: $controller.play.autosave)
                    }
                    .padding(.horizontal, 16).padding(.vertical, 10)
                }
                .padding(.horizontal, Theme.Layout.pageInset)

                SectionLabel("声音与触感")
                FeelSettings()

                SectionLabel("远程计算")
                RemoteSettings(model: model)

                SectionLabel("调试与复位")
                Group2 {
                    PaperSwitch(title: "显示帧率与推演耗时", on: $controller.showMetrics)
                    Divider2()
                    Button {
                        if !PerfLog.isEmpty, let url = PerfLog.export() { exported = ExportFile(url: url) } else { say("还没有记录：先打开「显示帧率与推演耗时」玩一会儿") }
                    } label: { MenuRow(symbol: "waveform.path.ecg", title: "导出性能日志") }
                    .buttonStyle(PressStyle())
                    Divider2()
                    ResetSettingsRow(controller: controller, say: say)
                }
                .padding(.horizontal, Theme.Layout.pageInset)
            default:
                LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                    menuTile(title: "保存进度", note: "立存此世卷宗", symbol: "bookmark.fill", tint: Theme.jade) {
                        Task { let ok = await model.saveNow(); GameFeel.shared.notify(ok ? .success : .error); say(ok ? "已保存" : "保存失败"); close() }
                    }
                    menuTile(title: "世界卷宗", note: "切换或管理存档", symbol: "books.vertical", tint: Theme.jade) { archive = true }
                    menuTile(title: "世界编辑", note: "改绘山河与列国", symbol: "paintbrush.pointed.fill", tint: Theme.seal) { openEditor() }
                    menuTile(title: "开辟新世界", note: "重选地图与剧本", symbol: "globe.asia.australia", tint: Theme.seal) { creating = true }
                }
                .padding(.horizontal, Theme.Layout.pageInset)

                SectionLabel("世局工具")
                Group2 {
                    Button { openEdicts() } label: { MenuRow(symbol: "scroll.fill", title: "天下诏令与规则") }.buttonStyle(.plain)
                    Divider2()
                    Button { calendar = true } label: { MenuRow(symbol: "calendar", title: "纪年与日期") }.buttonStyle(.plain)
                    Divider2()
                    Button { wallpaper() } label: { MenuRow(symbol: "photo.on.rectangle", title: "壁纸观景模式") }.buttonStyle(.plain)
                    Divider2()
                    Button { Task { exported = await model.exportCopy().map(ExportFile.init) } } label: { MenuRow(symbol: "square.and.arrow.up", title: "导出存档备份") }.buttonStyle(.plain)
                    Divider2()
                    Button { importing = true } label: { MenuRow(symbol: "tray.and.arrow.down", title: "导入外部存档") }.buttonStyle(.plain)
                }
                .padding(.horizontal, Theme.Layout.pageInset)

                Group2 {
                    Button { notes = true } label: { MenuRow(symbol: "sparkles", title: "本版新增与更新内容") }.buttonStyle(.plain)
                    Divider2()
                    Button { close(); model.backToTitle() } label: { MenuRow(symbol: "house", title: "返回标题画面") }.buttonStyle(.plain)
                }
                .padding(.horizontal, Theme.Layout.pageInset)
            }
        }
        .padding(.bottom, 24)
        .animation(Motion.fade, value: page)
        }
        .sheet(isPresented: $creating) {
            NewWorldSheet(start: { options in creating = false; close(); Task { await model.generate(options) } }, draw: { options in creating = false; close(); model.openEditor(options) }, inputs: model.previewInputs)
                .presentationDetents([.medium, .large]).presentationCornerRadius(Theme.Control.cornerSheet).background(MemorialPaper().ignoresSafeArea()).presentationBackground(Theme.paper).presentationDragIndicator(.hidden)
        }
        .sheet(isPresented: $archive) {
            WorldArchiveSheet(model: model) { world in archive = false; close(); Task { await model.openArchived(world) } }
                .presentationDetents([.medium, .large]).presentationCornerRadius(Theme.Control.cornerSheet).background(MemorialPaper().ignoresSafeArea()).presentationBackground(Theme.paper).presentationDragIndicator(.hidden)
        }
        .sheet(item: $exported) { file in ShareSheet(items: [file.url]) }
        .sheet(isPresented: $calendar) {
            VStack(alignment: .leading, spacing: 14) {
                SheetHeader(title: "纪年与日期", subtitle: model.state?.dateText ?? "", seal: "历")
                HStack { Text("年号").font(Theme.body).foregroundStyle(Theme.ink2).frame(width: 70, alignment: .leading); TextField("公元", text: $eraText).paperField() }.padding(.horizontal, 22)
                HStack { Text("今年为").font(Theme.body).foregroundStyle(Theme.ink2).frame(width: 70, alignment: .leading); TextField("\(model.state?.displayYear ?? 1)", text: $yearText).keyboardType(.numbersAndPunctuation).paperField(); Text("年").font(Theme.body).foregroundStyle(Theme.ink2) }.padding(.horizontal, 22)
                Text("只改纪年的显示（年号与年份），推演的时间不变；留空年号即用「公元」。").font(Theme.caption).foregroundStyle(Theme.ink2).padding(.horizontal, 22)
                SealButton(title: "颁行", disabled: false) {
                    calendar = false
                    Task { if let e = await model.setCalendar(era: eraText, year: Int(yearText)) { say(e) } else { say("纪年已改") } }
                }
                .padding(.horizontal, 22)
            }
            .padding(.bottom, 16)
            .presentationDetents([.height(340)]).presentationCornerRadius(Theme.Control.cornerSheet).background(MemorialPaper().ignoresSafeArea()).presentationBackground(Theme.paper).presentationDragIndicator(.hidden)
        }
        .fileImporter(isPresented: $importing, allowedContentTypes: [.data, .item]) { result in
            if case .success(let url) = result { close(); Task { await model.importSave(from: url) } }
        }
        .sheet(isPresented: $notes) { ReleaseNotesSheet().presentationDetents([.large]).presentationCornerRadius(Theme.Control.cornerSheet).background(MemorialPaper().ignoresSafeArea()).presentationBackground(Theme.paper).presentationDragIndicator(.hidden) }
    }

    private func menuTile(title: String, note: String, symbol: String, tint: Color, action: @escaping () -> Void) -> some View {
        Button {
            GameFeel.shared.tap()
            action()
        } label: {
            VStack(alignment: .leading, spacing: 8) {
                Group {
                    if let g = GameActionLabel.glyph(for: symbol) {
                        InkIcon(glyph: g, size: 19, weight: 1.85, accent: tint.opacity(0.22))
                    } else {
                        Image(systemName: symbol).font(.system(size: 17, weight: .medium))
                    }
                }
                .foregroundStyle(tint)
                .frame(width: 34, height: 34)
                .background(tint.opacity(0.10), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(Theme.body).foregroundStyle(Theme.ink).lineLimit(1)
                    Text(note).font(Theme.caption).foregroundStyle(Theme.ink2).lineLimit(1)
                }
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .paperCard()
            .contentShape(RoundedRectangle(cornerRadius: Theme.Control.cornerCard, style: .continuous))
        }
        .buttonStyle(PressStyle())
    }
}

/// 精简清晰的地图显示设置：彻底去除重复开关与无关悬浮小笺，分为「地图元素」与「视觉装裱」两张清爽分组卡。
struct MapDisplaySettings: View {
    @ObservedObject var controller: MapController
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            SectionLabel("军队与舰队")
            Group2 {
                PaperSwitch(title: "显示军队与舰队", on: $controller.play.showArmies)
                Divider2()
                PaperSwitch(title: "放大时显示军队血条", on: $controller.play.showTroopBars)
                Divider2()
                PaperSlider(title: "图标大小", value: $controller.play.iconScale, range: 0.7...1.5, step: 0.1) { String(format: "%.1f×", $0) }
                    .padding(.horizontal, 16).padding(.vertical, 10)
            }
            .padding(.horizontal, Theme.Layout.pageInset)

            SectionLabel("地图元素")
            Group2 {
                PaperSwitch(title: "国界线", on: $controller.display.borders)
                Divider2()
                PaperSwitch(title: "行省边界", on: $controller.display.provinceLines)
                Divider2()
                PaperSwitch(title: "海上航线", on: $controller.display.seaRoutes)
                Divider2()
                PaperSwitch(title: "经纬线", on: Binding(get: { controller.display.gridLines == true }, set: { controller.display.gridLines = $0 }))
                Divider2()
                PaperSwitch(title: "城池名称", on: $controller.display.cityNames)
                Divider2()
                PaperSwitch(title: "城池图标", on: $controller.display.cityIcons)
                Divider2()
                PaperSwitch(title: "地貌与植被", on: $controller.display.vegetation)
            }
            .padding(.horizontal, Theme.Layout.pageInset)

            SectionLabel("视觉与装裱")
            Group2 {
                PaperSwitch(title: "羊皮纸底纹", on: $controller.display.parchment)
                Divider2()
                PaperSwitch(title: "卷轴装裱", on: Binding(
                    get: { controller.display.scrollMount ?? controller.display.darkEdges },
                    set: { controller.display.scrollMount = $0; controller.display.darkEdges = $0 }
                ))
                Divider2()
                PaperSwitch(title: "光影氛围", on: Binding(get: { controller.display.lighting ?? true }, set: { controller.display.lighting = $0 }))
                Divider2()
                PaperSwitch(title: "舆图细节（水线、罗盘与田亩）", on: Binding(get: { controller.display.mapDetail ?? true }, set: { controller.display.mapDetail = $0 }))
                Divider2()
                PaperSwitch(title: "战争晕染", on: Binding(get: { controller.display.battleGround ?? true }, set: { controller.display.battleGround = $0 }))
                Divider2()
                PaperSwitch(title: "显示完整国名", on: $controller.display.fullNationNames)
                Divider2()
                PaperSlider(title: "国名字号", value: $controller.display.nationNameScale, range: 0.5...2, step: 0.05) { String(format: "%.2f", $0) }
                    .padding(.horizontal, 16).padding(.vertical, 10)
                Divider2()
                PaperSlider(title: "国色浓度", value: $controller.display.colorDensity, range: 0.2...1, step: 0.1) { "\(Int($0 * 100))%" }
                    .padding(.horizontal, 16).padding(.vertical, 10)
                Divider2()
                VStack(alignment: .leading, spacing: 8) {
                    Text("海面色调").font(Theme.body).foregroundStyle(Theme.ink)
                    ChipPicker(items: [("original", "原作海蓝"), ("warm", "暖纸海色")], selection: $controller.display.ocean)
                }
                .padding(.horizontal, 16).padding(.vertical, 10)
            }
            .padding(.horizontal, Theme.Layout.pageInset)
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
            Group {
                if let g = GameActionLabel.glyph(for: symbol) {
                    InkIcon(glyph: g, size: 18, weight: 1.7, accent: Theme.seal.opacity(0.22))
                } else {
                    Glyph.icon(title, size: 15, fallback: .edict)
                }
            }
            .frame(width: 24).foregroundStyle(Theme.seal)
            Text(title).font(Theme.section).foregroundStyle(Theme.ink)
            Spacer()
            InkIcon(glyph: .chevronRight, size: 12, weight: 1.8).foregroundStyle(Theme.ink2)
        }
        .padding(.horizontal, 16).padding(.vertical, 13).contentShape(Rectangle())
    }
}

/// 苹果质感微弹按压反馈：按下时自然微缩（0.965），松开时由 `.snappy` 流体弹簧回弹。
struct PressStyle: ButtonStyle {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed && !reduceMotion ? 0.965 : 1)
            .opacity(configuration.isPressed ? 0.88 : 1)
            .animation(reduceMotion ? nil : .snappy(duration: 0.18, extraBounce: 0.04), value: configuration.isPressed)
    }
}

/// 恢复默认设置（统一使用手绘刷新图标）。
struct ResetSettingsRow: View {
    @ObservedObject var controller: MapController
    let say: (String) -> Void
    @State private var asking = false
    var body: some View {
        Button { asking = true } label: {
            HStack {
                Text("恢复默认设置").font(Theme.section).foregroundStyle(Theme.seal)
                Spacer()
                InkIcon(glyph: .refresh, size: 15, weight: 1.75).foregroundStyle(Theme.seal)
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

/// 画面性能档位：默认只展示清晰的一键档位与智能降温，将 5 项高阶帧率滑档收纳进折叠栏，界面告别杂乱。
struct FrameSettings: View {
    @ObservedObject var controller: MapController
    @State private var showAdvanced = false
    private func row<T: Hashable>(_ title: String, _ note: String, _ items: [(T, String)], _ value: Binding<T>) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Text(title).font(Theme.body).foregroundStyle(Theme.ink)
                Spacer()
                Text(note).font(Theme.caption).foregroundStyle(Theme.ink2)
            }
            ChipPicker(items: items, selection: value)
        }
        .padding(.horizontal, 16).padding(.vertical, 9)
    }
    var body: some View {
        let play = controller.play
        VStack(spacing: 0) {
            row("性能档位", play.preset == "custom" ? "已自定微调" : "一键平衡流畅与续航", PlaySettings.presets.map { ($0.key, $0.name) } + (play.preset == "custom" ? [("custom", "自定")] : []), $controller.play.preset)
            Divider2()
            PaperSwitch(title: "发热时自动降档", on: $controller.play.autoCool)
            Divider2()
            Button {
                GameFeel.shared.tap()
                withAnimation(Motion.panel) { showAdvanced.toggle() }
            } label: {
                HStack(spacing: 8) {
                    Text("高级帧率与负载微调").font(Theme.body).foregroundStyle(Theme.ink2)
                    Spacer()
                    Text("\(play.mapFPS)帧 · \(Int(play.renderScale * 100 / 2))%清晰").font(Theme.caption).foregroundStyle(Theme.ink2).monospacedDigit()
                    InkIcon(glyph: .chevronDown, size: 14, weight: 1.7).foregroundStyle(Theme.ink2).rotationEffect(.degrees(showAdvanced ? 180 : 0))
                }
                .padding(.horizontal, 16).padding(.vertical, 11).contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            if showAdvanced {
                Divider2()
                row("拖动地图帧率", "拖拽缩放时", [(30, "30"), (60, "60"), (120, "120")], $controller.play.mapFPS)
                Divider2()
                row("行军帧率", "军队移动时", [(15, "15"), (24, "24"), (30, "30"), (60, "60")], $controller.play.marchFPS)
                Divider2()
                row("动画帧率", "海浪与战场特效", [(12, "12"), (15, "15"), (20, "20"), (30, "30")], $controller.play.effectFPS)
                Divider2()
                row("地图清晰度", "越高越耗电", [(1.0, "低"), (1.5, "中"), (2.0, "高"), (3.0, "原生")], $controller.play.renderScale)
                Divider2()
                row("推演算力占比", "越高越快越热", [(40, "40%"), (55, "55%"), (75, "75%"), (100, "全速")], $controller.play.simLoad)
            }
        }
    }
}
