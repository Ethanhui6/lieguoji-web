import SwiftUI
import CoreText
import UniformTypeIdentifiers
import LieguojiCore

enum Panel: Identifiable, Equatable {
    case editor, quick(Int), province(Int), army(Int), fleet(Int), nation(Int), people(Int), nationWars(Int), nationTalks(Int), nations, military, diplomacy, chronicle, menu, statistics, edicts
    var id: String {
        switch self {
        case .editor: return "editor"
        case .quick(let p): return "q\(p)"
        case .province(let p): return "p\(p)"
        case .army(let a): return "a\(a)"
        case .fleet(let f): return "f\(f)"
        case .nation(let n): return "n\(n)"
        case .people(let n): return "people\(n)"
        case .nationWars(let n): return "wars\(n)"
        case .nationTalks(let n): return "talks\(n)"
        case .statistics: return "statistics"
        case .edicts: return "edicts"
        case .nations: return "nations"
        case .military: return "military"
        case .diplomacy: return "diplomacy"
        case .chronicle: return "chronicle"
        case .menu: return "menu"
        }
    }
    /// The name on the back row (返回 …) of the page this panel was opened from.
    var title: String {
        switch self {
        case .editor: return "世界编辑"
        case .quick: return "快捷"
        case .province: return "州郡"
        case .army: return "军团"
        case .fleet: return "舰队"
        case .nation: return "国家"
        case .people: return "人物"
        case .nationWars: return "战争"
        case .nationTalks: return "外交"
        case .statistics: return "排行"
        case .edicts: return "诏令"
        case .nations: return "列国"
        case .military: return "军事"
        case .diplomacy: return "外交"
        case .chronicle: return "纪事"
        case .menu: return "菜单"
        }
    }
    /// The bottom tab this panel belongs to (highlighted while it is open).
    var tab: String? {
        switch self {
        case .nations, .nation, .people, .nationWars, .nationTalks: return "nations"
        case .military, .army, .fleet: return "military"
        case .diplomacy: return "diplomacy"
        case .chronicle: return "chronicle"
        case .statistics: return "statistics"
        default: return nil
        }
    }
}

struct GameView: View {
    @ObservedObject var model: GameModel
    @ObservedObject private var controller: MapController
    @State private var panel: Panel?
    /// 同盟图例点开的成员表。
    @State private var legendMenu: PressMenu?
    /// Pages the open sheet came from: one sheet stays up and its pages slide in place (返回 goes back).
    @State private var trail: [Panel] = []
    /// The last page shown, kept while the sheet slides away so it does not go blank.
    @State private var lastPanel: Panel?
    /// Going back slides the page in from the leading edge.
    @State private var backward = false
    @State private var toast: String?
    @State private var toastSerial = 0
    @State private var viewsOpen = false
    /// 壁纸模式: the controls hide and the map drifts; a tap anywhere returns.
    @State private var wallpaper = false
    /// The pending map pick is a retreat (原作防御模式) rather than a march.
    @State private var marchRetreat = false
    @State private var rtsDefend = false
    /// The unit sheets' height; opens at .medium so war/naval scroll stage, stats and commands are visible immediately.
    @State private var unitDetent: PresentationDetent = .medium
    /// Nation pages open at .medium so ruler, stats, tabs and dossier summary show clearly above the fold.
    @State private var nationDetent: PresentationDetent = .medium
    /// The world was paused by a big panel and resumes when it closes.
    @State private var pausedByPanel = false
    /// 等待竖屏原生 `.sheet` 完全收起后再进入山河回放，彻底消除 UIKit 转场竞态与残余遮罩。
    @State private var pendingReplayDay: Int?? = nil
    @Namespace private var tabMarker
    @Environment(\.verticalSizeClass) private var verticalClass
    /// 横屏 on a phone: its own layout (a rail down the left, pages beside the map).
    private var landscape: Bool { verticalClass == .compact }
    @State private var ripple: CGPoint?
    /// 入场: the controls settle in a moment after the map is whole.
    @State private var entered = false
    /// 手动「净图」模式：默认 false（HUD 稳定常驻，绝不自动乱藏）；仅玩家主动点击顶栏眼睛钮才进入纯赏画态。
    @State private var cleanMap = false
    /// 天时灾丰折叠清单展开态（绝不与日期栏抢占横向宽度）
    @State private var weatherDrawerOpen = false
    private var hudVisible: Bool { chromeIn && !cleanMap }
    private var chromeIn: Bool { controller.reveal >= 1 && entered }
    private var barHeight: CGFloat { landscape ? 36 : 38 }
    private static let hudSpring = Animation.spring(response: 0.34, dampingFraction: 0.88)
    private struct ShotFile: Identifiable { let url: URL; var id: URL { url } }
    @State private var shot: ShotFile?
    init(model: GameModel) { self.model = model; _controller = ObservedObject(wrappedValue: model.controller) }

    private func exitCleanMap() {
        if cleanMap {
            withAnimation(Self.hudSpring) { cleanMap = false }
        }
    }

    private func sidePanelWidth(for totalWidth: CGFloat) -> CGFloat {
        guard landscape, panel != nil else { return 0 }
        return min(430, max(320, totalWidth * 0.44))
    }

    /// 紧凑日期文案：竖屏有战事或横屏展开右侧面板时省略“公元”前缀（保留自定义年号），保证顶栏永不截断或挤撞。
    private var compactDateText: String {
        let raw = model.state?.dateText ?? ""
        let squeeze = (landscape && panel != nil) || (!landscape && (model.state?.wars.count ?? 0) > 0)
        if squeeze, raw.hasPrefix("公元") {
            return String(raw.dropFirst(2))
        }
        return raw
    }

    // Split in three: as one expression the compiler cannot type-check it in reasonable time.
    private func backdrop(size: CGSize) -> some View {
        let panelW = sidePanelWidth(for: size.width)
        let trailSafe: CGFloat = (landscape && panel != nil) ? (panelW + 20) : 12
        let leadSafe: CGFloat = landscape ? 62 : 12

        return ZStack {
            Color.clear
        }
        // A breath of ink at the screen's top and foot, so the floating controls settle into the map.
        .overlay {
            VStack(spacing: 0) {
                LinearGradient(colors: [Theme.ink.opacity(landscape ? 0.08 : 0.13), Theme.ink.opacity(0.02), .clear], startPoint: .top, endPoint: .bottom).frame(height: landscape ? 56 : 108)
                Spacer()
                LinearGradient(colors: [.clear, Theme.ink.opacity(0.02), Theme.ink.opacity(landscape ? 0.07 : 0.11)], startPoint: .top, endPoint: .bottom).frame(height: landscape ? 38 : 118)
            }
            .ignoresSafeArea().allowsHitTesting(false).opacity((wallpaper || !hudVisible) ? 0 : 1)
            .animation(Self.hudSpring, value: hudVisible)
        }
        .task {
            guard ShotTour.on else { return }
            await ShotTour.play(model, show: { p in
                if case .people = p { nationDetent = .large }
                if let p { show(p) } else { panel = nil }
            }, views: { viewsOpen = $0 })
        }
        .overlay(alignment: .top) {
            VStack(spacing: 6) {
                topBar(trailInset: trailSafe)
                    .offset(y: hudVisible ? 0 : -72)
                    .scaleEffect(hudVisible ? 1 : 0.96, anchor: .top)
                    .opacity(hudVisible ? 1 : 0)
                    .allowsHitTesting(hudVisible)
                    .animation(Self.hudSpring, value: hudVisible)
                if hudVisible && !weatherZonesSorted.isEmpty {
                    weatherOverflowBar(leadInset: leadSafe, trailInset: trailSafe)
                        .transition(.move(edge: .top).combined(with: .opacity))
                        .animation(Self.hudSpring, value: weatherDrawerOpen)
                }
                Group {
                    if controller.marchingArmy != nil { marchBanner.transition(.move(edge: .top).combined(with: .opacity)) }
                    if controller.marchingFleet != nil { fleetBanner.transition(.move(edge: .top).combined(with: .opacity)) }
                    if controller.paintNation != nil { paintBanner.transition(.move(edge: .top).combined(with: .opacity)) }
                    if let prompt = controller.pickPrompt {
                        HStack(spacing: 10) {
                            InkIcon(glyph: .locate, size: 15, weight: 1.8).foregroundStyle(Theme.seal)
                            Text(prompt).font(Theme.body).foregroundStyle(Theme.ink).lineLimit(1).minimumScaleFactor(0.72)
                            Button("取消") { controller.pickPrompt = nil; controller.onPick = nil; if controller.onTerrainStrokeEnd != nil && controller.brushName == nil && model.controller.terrainBrush { controller.terrainBrush = false; controller.onTerrainStroke = nil; controller.onTerrainStrokeEnd = nil } }.font(Theme.body).foregroundStyle(Theme.seal)
                        }
                        .padding(.horizontal, 14).frame(height: barHeight).glass(Capsule())
                        .transition(.move(edge: .top).combined(with: .opacity))
                    }
                    if !controller.groupArmies.isEmpty { rtsBanner.transition(.move(edge: .top).combined(with: .opacity)) }
                }
                .padding(.leading, leadSafe).padding(.trailing, trailSafe)

                VStack(spacing: 0) {
                    if hudVisible, controller.play.showHeralds, let h = model.herald, let map = model.map {
                        HeraldBanner(herald: h, map: map, onTap: {
                            guard model.herald?.id == h.id else { return }
                            if let map = model.map, let n = h.nations.first, map.meta.nations.indices.contains(n) {
                                let cap = map.meta.nations[n].capital
                                if map.meta.cities.indices.contains(cap) {
                                    let c = map.meta.cities[cap]
                                    controller.fly(x: Double(c.x), y: Double(c.y))
                                }
                            }
                            model.dismissHerald()
                        }, onDismiss: {
                            if model.herald?.id == h.id { model.dismissHerald() }
                        }).id(h.id)
                            .transition(.asymmetric(
                                insertion: .move(edge: .top).combined(with: .scale(scale: 0.94, anchor: .top)).combined(with: .opacity),
                                removal: .move(edge: .top).combined(with: .opacity)
                            ))
                    }
                }
                .padding(.leading, leadSafe).padding(.trailing, trailSafe)
                .animation(Motion.panel, value: model.herald?.id)
                .animation(Self.hudSpring, value: hudVisible)
            }
            .animation(Motion.panel, value: panel?.id)
            .opacity(wallpaper || model.replayActive ? 0 : 1).allowsHitTesting(!wallpaper && !model.replayActive)
            .animation(Motion.panel, value: controller.marchingArmy)
            .animation(Motion.panel, value: controller.marchingFleet)
            .animation(Motion.panel, value: controller.paintNation)
            .animation(Motion.panel, value: controller.pickPrompt)
            .animation(Motion.panel, value: controller.groupArmies.count)
        }
        // 收起界面后的极简唤醒微胶囊（干净清爽，零残留组件、零突兀边框，轻点即刻丝滑展开全部界面）
        .overlay(alignment: .topTrailing) {
            if chromeIn && cleanMap && !wallpaper && !model.replayActive {
                Button {
                    GameFeel.shared.tap()
                    exitCleanMap()
                } label: {
                    HStack(spacing: 5) {
                        InkIcon(glyph: .eye, size: 13.5, weight: 1.85).foregroundStyle(Theme.seal)
                        Text("展开").font(Theme.kai(12)).foregroundStyle(Theme.ink)
                    }
                    .padding(.horizontal, 11).frame(height: 32)
                    .glass(Capsule())
                }
                .buttonStyle(PressStyle())
                .padding(.trailing, 12)
                .padding(.top, landscape ? 4 : 6)
                .transition(.scale(scale: 0.88, anchor: .topTrailing).combined(with: .opacity))
            }
        }
        .animation(Self.hudSpring, value: cleanMap)
    }

    private func stage(size: CGSize) -> some View {
        let panelW = sidePanelWidth(for: size.width)
        let trailSafe: CGFloat = (landscape && panel != nil) ? (panelW + 20) : 12
        let leadSafe: CGFloat = landscape ? 62 : 12

        return backdrop(size: size)
        .statusBarHidden()
        .overlay(alignment: .bottom) {
            Group {
                if landscape {
                    HStack(spacing: 0) {
                        EventTicker(latest: model.state?.events.last?.text) { show(.chronicle) }
                            .frame(maxWidth: min(360, max(180, size.width - leadSafe - trailSafe - 16)))
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.leading, leadSafe)
                    .padding(.trailing, trailSafe)
                    .padding(.bottom, 4)
                    .opacity(panel == nil ? 0.94 : 0)
                    .allowsHitTesting(panel == nil)
                } else {
                    bottomBar
                }
            }
            .offset(y: hudVisible ? 0 : 96)
            .scaleEffect(hudVisible ? 1 : 0.96, anchor: .bottom)
            .opacity(hudVisible ? 1 : 0)
            .animation(Self.hudSpring, value: hudVisible)
            .opacity(wallpaper || model.replayActive ? 0 : 1).allowsHitTesting(hudVisible && !wallpaper && !model.replayActive)
            .task { try? await Task.sleep(nanoseconds: 60_000_000); entered = true }
        }
        .overlay(alignment: .leading) {
            if landscape {
                landscapeRail
                    .offset(x: hudVisible ? 0 : -76)
                    .scaleEffect(hudVisible ? 1 : 0.94, anchor: .leading)
                    .opacity(hudVisible ? 1 : 0)
                    .animation(Self.hudSpring, value: hudVisible)
                    .opacity(wallpaper || model.replayActive ? 0 : 1)
                    .allowsHitTesting(hudVisible && !wallpaper && !model.replayActive)
            }
        }
        .overlay {
            if wallpaper {
                Color.clear.contentShape(Rectangle()).ignoresSafeArea()
                    .onTapGesture { withAnimation(Motion.reveal) { wallpaper = false }; controller.drifting = false }
                    .overlay(alignment: .bottom) { Text("轻点返回").font(Theme.label).foregroundStyle(Theme.paper2.opacity(0.7)).padding(.bottom, 30) }
            }
        }
        .overlay(alignment: .bottomLeading) {
            if !model.viewLegend.isEmpty && !model.replayActive && !wallpaper {
                MapViewLegend(
                    mode: model.mapView,
                    legend: model.viewLegend,
                    spotlightColor: model.legendSpotlightColor,
                    onSpotlight: { model.toggleLegendSpotlight($0) },
                    open: { allianceMenu($0) }
                )
                    .padding(.leading, leadSafe)
                    .padding(.bottom, landscape ? 40 : (model.state?.events.isEmpty == false ? 118 : 76))
                    .offset(x: hudVisible ? 0 : -140)
                    .opacity(hudVisible ? 1 : 0)
                    .allowsHitTesting(hudVisible)
                    .animation(Self.hudSpring, value: hudVisible)
                    .transition(.asymmetric(insertion: .scale(scale: 0.72, anchor: .bottomLeading).combined(with: .opacity), removal: .opacity))
            }
        }
        .animation(Motion.panel, value: model.viewLegend)
        .pressMenuHost($legendMenu)
        // 地图视图切换弹出层：点空白区域即自动收起，严守顶栏下方与侧栏左侧边界，零碰撞零遮挡
        .overlay {
            if viewsOpen && hudVisible && !model.replayActive && !wallpaper {
                Color.black.opacity(0.001)
                    .ignoresSafeArea()
                    .onTapGesture { withAnimation(Motion.panel) { viewsOpen = false } }
            }
        }
        .overlay(alignment: .topTrailing) {
            let hideSwitcher = model.replayActive || !hudVisible || wallpaper
            MapViewSwitcher(mode: $model.mapView, open: $viewsOpen)
                .opacity(hideSwitcher ? 0 : 1)
                .allowsHitTesting(viewsOpen && !hideSwitcher)
                .padding(.top, barHeight + (landscape ? 10 : 12))
                .padding(.trailing, trailSafe)
                .animation(Motion.panel, value: trailSafe)
        }
        .opacity(controller.reveal >= 1 ? 1 : 0)
        .animation(Motion.panel, value: controller.reveal >= 1)
        .onAppear {
            controller.drifting = false
            controller.onMapBrowsing = nil
            controller.onMapTap = { _ in
                if weatherDrawerOpen { withAnimation(Motion.tap) { weatherDrawerOpen = false } }
            }
            controller.onGroupTarget = { province in
                let armies = controller.groupArmies, defend = rtsDefend
                Task {
                    let out = await model.rts(armies: armies, to: province, defend: defend)
                    say(out.reason)
                    if out.ok { controller.groupArmies = [] }
                    model.refreshArmies()
                }
            }
            controller.onLongPress = { province, point in
                ripple = point
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.26) { ripple = nil; show(.quick(province)) }
            }
            controller.onPaint = { province in
                if let brush = controller.brushAction { brush(province); return }
                guard let n = controller.paintNation, model.state?.owners.indices.contains(province) == true else { return }
                if controller.placingArmy {
                    // 一指划过：每过一州放下所选数量的军队，落点有动效。
                    let count = controller.placeCount
                    Task {
                        if let error = await model.addArmy(n, province: province, count: count) { say(error); GameFeel.shared.notify(.error) }
                        else { GameFeel.shared.tap(); model.playMuster(nation: n, province: province, count: count) }
                    }
                    return
                }
                guard model.state?.owners[province] != n else { return }
                Task { if let error = await model.grant(province: province, to: n) { say(error) } }
            }
            controller.onFleetTarget = { province in
                guard let index = controller.marchingFleet, let fleet = model.fleet(index) else { controller.marchingFleet = nil; return }
                Task {
                    let name = model.map?.meta.provinces.indices.contains(province) == true ? model.map!.meta.provinces[province].name : ""
                    if let error = await model.fleetOrder(id: fleet.id, province: province) { say(error) }
                    else { say("\(fleet.name)起航，前往\(name)港"); controller.marchingFleet = nil }
                    model.refreshArmies()
                }
            }
            controller.onMarchTarget = { province in
                guard let army = controller.marchingArmy else { return }
                Task {
                    let retreat = marchRetreat
                    let error: String?
                    if retreat { error = await model.retreat(army: army, to: province) } else { error = await model.order(army: army, to: province) }
                    if let error { say(error) }
                    else { say("\(model.army(army)?.name ?? "军队")\(retreat ? "撤往" : "前往")\(model.map?.meta.provinces[province].name ?? "")"); controller.marchingArmy = nil; marchRetreat = false }
                    model.refreshArmies()
                }
            }
        }
        .onChange(of: controller.groupArmies) { _, _ in model.refreshArmies() }
        .onChange(of: model.notice) { _, n in if let n { say(n); model.notice = nil } }
        .onChange(of: controller.marchingFleet) { _, _ in model.refreshArmies() }
        .onChange(of: model.mapView) { _, _ in
            // Choosing a view rolls the switcher back up a moment later.
            Task { try? await Task.sleep(nanoseconds: 280_000_000); withAnimation { viewsOpen = false } }
        }
        .sensoryFeedback(.selection, trigger: model.mapView)
        .onChange(of: panel) { old, p in
            if p != nil { exitCleanMap() }
            if let p { lastPanel = p }
            // All inspection pages share one pause policy, including map picks.
            // 山河回放开启期间关闭旧弹窗时，严禁恢复实时推演覆盖回放画面。
            controller.sheetOpen = p != nil
            if controller.play.pauseOnSheet {
                if p != nil, model.playing { pausedByPanel = true; model.pause(saving: false) }
                if p == nil, pausedByPanel {
                    pausedByPanel = false
                    if !model.replayActive { model.play() }
                }
            } else if p == nil {
                pausedByPanel = false
            }
            _ = old
        }
        .sensoryFeedback(.impact(weight: .light), trigger: panel?.id)
        .sensoryFeedback(.selection, trigger: controller.selectedProvince)
        .onChange(of: controller.selectedArmy) { _, army in
            guard !model.replayActive else { return }
            model.refreshArmies()
            if let army { show(.army(army)) } else if case .army = panel { panel = nil }
        }
        .onChange(of: controller.selectedFleet) { _, fleet in
            guard !model.replayActive else { return }
            model.refreshArmies()
            if let fleet { show(.fleet(fleet)) } else if case .fleet = panel { panel = nil }
        }
        .onChange(of: controller.selectedProvince) { _, province in
            guard !model.replayActive else { return }
            if province != nil { withAnimation(Motion.tap) { viewsOpen = false } }
            if let province { show(.province(province)) } else if case .province = panel { panel = nil }
        }
    }

    private var sideKey: String? { landscape ? panel?.id : nil }
    private var pageShown: Binding<Bool> { Binding(get: { panel != nil && !landscape }, set: { if !$0 && !landscape { panel = nil } }) }

    var body: some View {
        GeometryReader { geo in
            stage(size: geo.size)
            .sheet(item: $shot) { ShareSheet(items: [$0.url]) }
            .onChange(of: panel == nil) { _, closed in model.pageOpen = !closed }
            .overlay(alignment: .trailing) { sidePage(totalWidth: geo.size.width) }
            .animation(Motion.panel, value: sideKey)
            .overlay { if let ripple { PressRipple().position(ripple).ignoresSafeArea() } }
            .overlay(alignment: .bottom) {
                // 提示条居于全层之上，横屏自动避开右侧面板，轻点可立即收起。
                if let toast {
                    let panelW = sidePanelWidth(for: geo.size.width)
                    HStack(spacing: 10) {
                        ArtEmblem(image: BundleArt.heraldEdict, size: 20, fallback: .edict)
                        Text(toast).font(Theme.body).foregroundStyle(Theme.ink).multilineTextAlignment(.leading).fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(.leading, 10).padding(.trailing, 16).padding(.vertical, 9)
                    .glass(RoundedRectangle(cornerRadius: Theme.Control.cornerCard, style: .continuous))
                    .padding(.leading, landscape ? 64 : 20)
                    .padding(.trailing, landscape && panel != nil ? (panelW + 18) : 20)
                    .padding(.bottom, landscape ? 48 : 114)
                    .id(toastSerial)
                    .transition(.asymmetric(insertion: .move(edge: .bottom).combined(with: .opacity).combined(with: .scale(scale: 0.94, anchor: .bottom)), removal: .opacity.combined(with: .offset(y: -10))))
                    .onTapGesture { self.toast = nil }
                    .zIndex(120)
                }
            }
            .animation(Motion.panel, value: toastSerial)
            .animation(Motion.fade, value: toast)
            .sheet(isPresented: pageShown, onDismiss: {
                trail = []
                if panel == nil {
                    controller.selectedProvince = nil
                    controller.selectedFleet = nil; controller.selectedFleetId = nil
                    if controller.marchingArmy == nil { controller.selectedArmy = nil; controller.selectedArmyId = nil }
                }
                if let pending = pendingReplayDay {
                    pendingReplayDay = nil
                    Task { await model.enterReplay(atDay: pending) }
                }
            }) {
                if let panel = panel ?? lastPanel {
                    let hasBack = trail.last != nil
                    sheet(for: panel)
                        .id(panel.id)
                        .environment(\.inSidePanel, false)
                        .environment(\.hasBackBar, hasBack)
                        .transition(.asymmetric(insertion: .move(edge: backward ? .leading : .trailing).combined(with: .opacity),
                                                removal: .move(edge: backward ? .trailing : .leading).combined(with: .opacity)))
                        .clipped()
                        .safeAreaInset(edge: .top, spacing: 0) {
                            if let last = trail.last {
                                backRow(last, current: panel, isSidePanel: false)
                            }
                        }
                        .presentationBackground { MemorialPaper() }.presentationDragIndicator(.hidden).presentationCornerRadius(Theme.Control.cornerSheet).font(Theme.section)
                }
            }
        }
    }

    /// Opens a page from inside the sheet: the current page goes on the trail.
    private func open(_ next: Panel) {
        guard next != panel else { return }
        backward = false
        withAnimation(Motion.panel) {
            if let panel { trail.append(panel); if trail.count > 8 { trail.removeFirst() } }
            panel = next
        }
    }
    /// 同盟图例：列出同盟成员，点成员看其国家页，末项看外交总览。
    private func allianceMenu(_ e: MapViewData.Entry) {
        guard let members = e.members, let map = model.map else { return }
        var items = members.filter { map.meta.nations.indices.contains($0) }.map { n in
            PressMenuItem(title: map.meta.nations[n].name, symbol: "flag") { show(.nation(n)) }
        }
        items.append(PressMenuItem(title: "外交总览", symbol: "globe.asia.australia") { show(.diplomacy) })
        legendMenu = PressMenu(title: e.name, subtitle: "\(members.count) 国 · \(e.count) 州", items: items)
    }
    /// A map pick or a bottom tab starts a fresh docket (no trail); an open sheet slides to it.
    private func show(_ next: Panel) {
        guard next != panel else { return }
        backward = false
        if panel == nil { trail = []; panel = next; return }
        withAnimation(Motion.panel) { trail = []; panel = next }
    }
    private func back() {
        guard let last = trail.last else { return }
        backward = true
        withAnimation(Motion.panel) { trail.removeLast(); panel = last }
    }
    /// 统一二级页面实底宣纸导航栏：滚动内容从下方滑过绝不穿透重影，并整合横屏内嵌关闭钮。
    private func backRow(_ last: Panel?, current: Panel, isSidePanel: Bool) -> some View {
        VStack(spacing: 0) {
            if !isSidePanel {
                Capsule()
                    .fill(Theme.ink.opacity(0.22))
                    .frame(width: 38, height: 4)
                    .padding(.top, 8).padding(.bottom, 4)
                    .accessibilityHidden(true)
            }
            HStack(spacing: 8) {
                if let last {
                    Button {
                        GameFeel.shared.tap()
                        back()
                    } label: {
                        HStack(spacing: 4) {
                            InkIcon(glyph: .chevronRight, size: 11.5, weight: 1.9).rotationEffect(.degrees(180))
                            Text("返回" + last.title).font(Theme.kai(13.5)).lineLimit(1)
                        }
                        .foregroundStyle(Theme.seal)
                        .padding(.horizontal, 11).frame(height: 28)
                        .background(Theme.seal.opacity(0.09), in: Capsule())
                        .overlay(Capsule().stroke(Theme.seal.opacity(0.28), lineWidth: 0.75))
                    }
                    .buttonStyle(PressStyle())
                } else if isSidePanel {
                    Text(current.title).font(Theme.kai(13.5)).foregroundStyle(Theme.ink2)
                }
                Spacer(minLength: 6)
                if !isSidePanel, last != nil {
                    Text(current.title).font(Theme.caption).foregroundStyle(Theme.ink2)
                }
                if isSidePanel {
                    CardCloseButton { closePage() }
                }
            }
            .padding(.horizontal, 14)
            .frame(height: isSidePanel ? 42 : 36)
            .padding(.bottom, isSidePanel ? 0 : 4)
            Rectangle().fill(Theme.ink.opacity(0.11)).frame(height: 0.75)
        }
        .background(Theme.paper.opacity(0.96))
    }

    @ViewBuilder private func sheet(for panel: Panel) -> some View {
        switch panel {
        case .editor:
            WorldEditorSheet(model: model, close: { closePage() }, takeShot: { mapShot() })
                .presentationDetents([.medium, .large])
        case .quick(let p):
            ProvinceQuickSheet(model: model, province: p, openProvince: { open(.province(p)) }, openNation: { n in nationDetent = .medium; open(.nation(n)) }, openArmy: { a in unitDetent = .medium; open(.army(a)) }, close: { closePage() })
                .presentationDetents([.medium, .large])
        case .province(let p):
            ProvinceSheet(model: model, province: p, openNation: { n in nationDetent = .medium; open(.nation(n)) }, openArmy: { a in
                unitDetent = .medium
                controller.selectedArmyId = model.army(a)?.id
                controller.selectedArmy = a
                open(.army(a)); locate(army: a)
            }).presentationDetents([.height(300), .medium, .large]).presentationBackgroundInteraction(.enabled(upThrough: .medium))
        case .army(let a):
            ArmySheet(model: model, army: a, armyId: controller.selectedArmyId, say: say, locate: { locate(army: a) }, onMarch: {
                let targetIdx = model.resolveArmy(id: controller.selectedArmyId, fallback: a)?.index ?? a
                marchRetreat = false; controller.marchingArmy = targetIdx; self.panel = nil; say("点选地图上的目的地")
            }, onHalt: {
                let targetIdx = model.resolveArmy(id: controller.selectedArmyId, fallback: a)?.index ?? a
                Task { if let e = await model.order(army: targetIdx, to: nil) { say(e) } }
            }, onRetreat: {
                let targetIdx = model.resolveArmy(id: controller.selectedArmyId, fallback: a)?.index ?? a
                marchRetreat = true; controller.marchingArmy = targetIdx; self.panel = nil; say("点选撤退的目的地（途中不主动接战）")
            }, onClose: { closePage() })
            .presentationDetents([.height(320), .medium, .large], selection: $unitDetent).presentationBackgroundInteraction(.enabled(upThrough: .medium))
        case .fleet(let f):
            FleetSheet(model: model, fleet: f, fleetId: controller.selectedFleetId, pickOnMap: {
                let targetIdx = model.resolveFleet(id: controller.selectedFleetId, fallback: f)?.index ?? f
                controller.marchingFleet = targetIdx; self.panel = nil; say("点选地图上本国的港口州郡")
            }, onClose: { closePage() }).presentationDetents([.height(320), .medium, .large], selection: $unitDetent).presentationBackgroundInteraction(.enabled(upThrough: .medium))
        case .nation(let n):
            NationSheet(model: model, nation: n, say: say, fly: { controller.fly(to: $0) }, lower: { nationDetent = .fraction(0.38) }, paint: { n in
                controller.placingArmy = false; controller.paintNation = n; self.panel = nil
                say("绘制疆域：点选或用一指拖过州郡，划入\(model.map?.meta.nations.indices.contains(n) == true ? model.map!.meta.nations[n].name : "")；两指移动地图")
            }, placeArmy: { n in
                controller.marchingArmy = nil; controller.marchingFleet = nil; controller.groupArmies = []
                controller.placingArmy = true; controller.paintNation = n; self.panel = nil
                controller.placeCount = 3
                say("拖动滑条选数量，点按或一指划过州郡放下军队；两指移动地图")
            }, pickProvince: { prompt, done in
                // 地图点选: the page steps aside, the player taps the map, and the page comes back with the choice.
                controller.pickPrompt = prompt
                controller.onPick = { p in controller.pickPrompt = nil; controller.onPick = nil; done(p); nationDetent = .medium; open(.nation(n)) }
                self.panel = nil
            }, openArmy: { a in
                unitDetent = .medium
                controller.selectedArmyId = model.army(a)?.id
                controller.selectedArmy = a
                open(.army(a))
            }, openFleet: { fid in
                if let idx = model.state?.fleets?.firstIndex(where: { $0.id == fid }) {
                    unitDetent = .medium
                    controller.selectedFleetId = fid
                    controller.selectedFleet = idx
                    open(.fleet(idx))
                    if let fl = model.fleet(idx), fl.x.isFinite, fl.y.isFinite { controller.fly(x: Double(fl.x), y: Double(fl.y)) }
                }
            }, openPeople: { nationDetent = .medium; open(.people(n)) }, openWars: { nationDetent = .medium; open(.nationWars(n)) }, openTalks: { nationDetent = .medium; open(.nationTalks(n)) }, openReplay: {
                requestReplay(atDay: nil)
            })
                .presentationDetents([.fraction(0.38), .medium, .large], selection: $nationDetent).presentationBackgroundInteraction(.enabled(upThrough: .medium))
                .onAppear { nationDetent = NationSheet.tourTab != nil ? .large : .medium }
        case .people(let n):
            NationSheet(model: model, nation: n, say: say, fly: { controller.fly(to: $0) }, focus: .people)
                .presentationDetents([.fraction(0.38), .medium, .large], selection: $nationDetent).presentationBackgroundInteraction(.enabled(upThrough: .medium))
        case .nationWars(let n):
            NationSheet(model: model, nation: n, say: say, fly: { controller.fly(to: $0) }, focus: .wars)
                .presentationDetents([.fraction(0.38), .medium, .large], selection: $nationDetent).presentationBackgroundInteraction(.enabled(upThrough: .medium))
        case .nationTalks(let n):
            NationSheet(model: model, nation: n, say: say, fly: { controller.fly(to: $0) }, focus: .talks)
                .presentationDetents([.fraction(0.38), .medium, .large], selection: $nationDetent).presentationBackgroundInteraction(.enabled(upThrough: .medium))
        case .edicts:
            EdictSheet(model: model, say: say).presentationDetents([.medium, .large])
        case .statistics:
            StatisticsSheet(model: model) { n in nationDetent = .medium; open(.nation(n)) }.presentationDetents([.medium, .large])
        case .nations:
            NationsSheet(model: model) { n in nationDetent = .medium; open(.nation(n)) }.presentationDetents([.medium, .large])
        case .military:
            MilitarySheet(model: model, select: { army in
                // The army's docket slides in over the roster (返回军事 goes back); the camera flies to the army itself.
                unitDetent = .medium
                controller.selectedArmyId = model.army(army)?.id
                open(.army(army)); controller.selectedArmy = army
                locate(army: army)
            }, selectFleet: { fleet in
                unitDetent = .medium
                controller.selectedFleetId = model.fleet(fleet)?.id
                open(.fleet(fleet)); controller.selectedFleet = fleet
                if let f = model.fleet(fleet), f.x.isFinite, f.y.isFinite { controller.fly(x: Double(f.x), y: Double(f.y)) }
            }, flyTo: { x, y in if x.isFinite && y.isFinite { controller.fly(x: x, y: y) } }, openNation: { n in
                nationDetent = .medium; open(.nation(n))
            }).presentationDetents([.medium, .large])
        case .diplomacy:
            DiplomacySheet(model: model, say: say, fly: { n in
                if let map = model.map, map.meta.nations.indices.contains(n), map.meta.cities.indices.contains(map.meta.nations[n].capital) {
                    let c = map.meta.cities[map.meta.nations[n].capital]
                    controller.showPlace(x: Double(c.x), y: Double(c.y))
                }
            }, openNation: { n in nationDetent = .medium; open(.nation(n)) },
               openWars: { MilitarySheet.openOn = "wars"; open(.military) },
               openChronicle: { n in ChronicleSheet.openNation = n; open(.chronicle) }).presentationDetents([.medium, .large])
        case .chronicle:
            ChronicleSheet(model: model, fly: { controller.fly(to: $0) }, openReplay: { targetDay in
                requestReplay(atDay: targetDay)
            }).presentationDetents([.medium, .large])
        case .menu:
            MenuSheet(model: model, controller: controller, openEdicts: { open(.edicts) }, openEditor: { open(.editor) },
                      wallpaper: { self.panel = nil; withAnimation(Motion.reveal) { wallpaper = true }; controller.drifting = true }, say: say) { self.panel = nil }
                .presentationDetents(MenuSheet.tourWarRules ? [.large] : [.medium, .large])
        }
    }

    /// The camera to where the army is drawn now.
    private func locate(army: Int) {
        guard let a = model.resolveArmy(id: controller.selectedArmyId, fallback: army)?.army else { return }
        let drawn = controller.placed?(a.id)
        let x = drawn?.0 ?? Double(a.x)
        let y = drawn?.1 ?? Double(a.y)
        guard x.isFinite && y.isFinite else { return }
        controller.fly(x: x, y: y)
    }

    private func say(_ text: String) {
        toastSerial += 1
        let serial = toastSerial
        toast = text
        Task { try? await Task.sleep(nanoseconds: 2_400_000_000); if toastSerial == serial { toast = nil } }
    }

    // MARK: chrome

    private var weatherZonesSorted: [GameState.WeatherZone] {
        guard let zones = model.state?.weatherZones, !zones.isEmpty else { return [] }
        let prio: (String) -> Int = { $0 == "snow" ? 0 : ($0 == "drought" || $0 == "famine") ? 1 : $0 == "flood" ? 2 : $0 == "plague" ? 3 : 4 }
        return zones.sorted { a, b in
            let pa = prio(a.kind), pb = prio(b.kind)
            return pa != pb ? pa < pb : a.province < b.province
        }
    }

    private func weatherMeta(_ kind: String) -> (label: String, color: Color) {
        switch kind {
        case "snow": return ("暴雪", Color(red: 0.22, green: 0.44, blue: 0.68))
        case "drought", "famine": return ("大旱", Color(red: 0.78, green: 0.42, blue: 0.10))
        case "flood": return ("洪涝", Color(red: 0.16, green: 0.42, blue: 0.58))
        case "plague": return ("大疫", Color(red: 0.42, green: 0.48, blue: 0.18))
        default: return ("丰年", Color(red: 0.74, green: 0.54, blue: 0.10))
        }
    }

    /// 严苛零碰撞顶部状态栏：
    /// - 竖屏 38pt 紧凑等高：左侧状态胶囊（≤184pt）+ 右侧四键合一单胶囊工具条（146pt），在 375pt 窄屏亦余 25pt+ 呼吸空间；
    /// - 横屏 36pt 等高：右侧面板展开时自动收缩至左侧可见舆图区，绝不与侧栏或左侧导航坞碰撞。
    private func topBar(trailInset: CGFloat) -> some View {
        let h = barHeight
        let toolW: CGFloat = landscape ? 32 : 34
        let rtsActive = controller.boxSelecting || !controller.groupArmies.isEmpty

        return HStack(spacing: 6) {
            HStack(spacing: landscape ? 6 : 5) {
                Button {
                    GameFeel.shared.tap()
                    show(.chronicle)
                } label: {
                    HStack(spacing: 4.5) {
                        Circle()
                            .fill(model.playing ? Theme.jade : Theme.ink2.opacity(0.42))
                            .frame(width: 5.5, height: 5.5)
                            .animation(Motion.panel, value: model.playing)
                        Text(compactDateText)
                            .font(landscape ? Theme.kai(13.5) : Theme.kai(12.8))
                            .foregroundStyle(Theme.ink)
                            .monospacedDigit()
                            .lineLimit(1)
                            .minimumScaleFactor(0.76)
                            .layoutPriority(1)
                            .contentTransition(.numericText())
                            .animation(Motion.tap, value: compactDateText)
                        if let m = model.state?.date.month {
                            let s = WorldSeason.of(month: m)
                            let sColor: Color = s == .spring ? Color(red: 0.76, green: 0.32, blue: 0.44) : s == .summer ? Color(red: 0.20, green: 0.52, blue: 0.24) : s == .autumn ? Color(red: 0.76, green: 0.38, blue: 0.10) : Color(red: 0.22, green: 0.46, blue: 0.68)
                            HStack(spacing: 2.5) {
                                Circle().fill(sColor).frame(width: 4, height: 4)
                                Text(s.name).font(Theme.kai(10)).foregroundStyle(sColor)
                            }
                            .fixedSize(horizontal: true, vertical: false)
                            .padding(.horizontal, 5).padding(.vertical, 1.5)
                            .background(sColor.opacity(0.11), in: Capsule())
                            .overlay(Capsule().stroke(sColor.opacity(0.28), lineWidth: 0.55))
                            .animation(Motion.fade, value: s.rawValue)
                        }
                    }
                    .frame(height: h)
                    .contentShape(Rectangle())
                }
                .buttonStyle(PressStyle())

                if let wars = model.state?.wars.count, wars > 0 {
                    Rectangle().fill(Theme.ink.opacity(0.15)).frame(width: 0.75, height: 13)
                    Button {
                        GameFeel.shared.tap()
                        MilitarySheet.openOn = "wars"
                        show(.military)
                    } label: {
                        WarCount(count: wars, compact: true)
                            .fixedSize(horizontal: true, vertical: false)
                            .frame(height: h)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(PressStyle())
                    .transition(.scale(scale: 0.86).combined(with: .opacity))
                }

                if model.remoteAddress != nil {
                    InkIcon(glyph: .computer, size: 12, weight: 1.75).foregroundStyle(Theme.jade)
                }
            }
            .padding(.horizontal, landscape ? 10 : 9)
            .frame(height: h)
            .glass(Capsule())
            .animation(Motion.panel, value: (model.state?.wars.count ?? 0) > 0)

            if landscape {
                transport
                    .padding(.horizontal, 4)
                    .frame(height: h)
                    .glass(Capsule())
            }

            Spacer(minLength: 4)

            // 右侧四键合一单胶囊工具条（视图 / 框选 / 收起界面 / 菜单）：与左侧等高、极简紧致零碰撞
            HStack(spacing: 0) {
                topToolButton(glyph: viewsOpen ? .close : .views, active: viewsOpen, width: toolW, height: h) {
                    withAnimation(Motion.panel) { viewsOpen.toggle(); weatherDrawerOpen = false }
                }
                toolDivider
                topToolButton(glyph: rtsActive ? .close : .command, active: rtsActive, width: toolW, height: h) {
                    if rtsActive { controller.boxSelecting = false; controller.groupArmies = []; model.refreshArmies() }
                    else { controller.boxSelecting = true; say("即时战略：在地图上拖出方框选择军队") }
                }
                toolDivider
                topToolButton(glyph: .eye, active: false, width: toolW, height: h) {
                    withAnimation(Self.hudSpring) { cleanMap = true; viewsOpen = false; weatherDrawerOpen = false }
                }
                toolDivider
                topToolButton(glyph: .menu, active: panel == .menu, width: toolW, height: h) {
                    show(.menu)
                }
            }
            .padding(.horizontal, 4)
            .frame(height: h)
            .glass(Capsule())
        }
        .padding(.leading, 12)
        .padding(.trailing, trailInset)
        .padding(.top, landscape ? 3 : 4)
    }

    private var toolDivider: some View {
        Rectangle().fill(Theme.ink.opacity(0.11)).frame(width: 0.65, height: 14)
    }

    private func topToolButton(glyph: InkGlyph, active: Bool, width: CGFloat, height: CGFloat, action: @escaping () -> Void) -> some View {
        Button {
            GameFeel.shared.tap()
            action()
        } label: {
            InkIcon(glyph: glyph, size: landscape ? 15.5 : 16.5, weight: active ? 1.95 : 1.65, filled: active,
                    accent: active ? Theme.seal.opacity(0.28) : nil)
                .foregroundStyle(active ? Theme.seal : Theme.ink)
                .frame(width: width, height: height)
                .contentShape(Rectangle())
        }
        .buttonStyle(PressStyle())
    }

    /// 独立弹性天时灾丰胶囊与可展开多事件清折：横屏严格避让左侧导航坞与右侧悬浮面板，零重叠零遮挡。
    @ViewBuilder private func weatherOverflowBar(leadInset: CGFloat, trailInset: CGFloat) -> some View {
        let sorted = weatherZonesSorted
        if let top = sorted.first {
            let meta = weatherMeta(top.kind)
            VStack(alignment: .leading, spacing: 5) {
                HStack(spacing: 6) {
                    Button {
                        GameFeel.shared.tap()
                        if sorted.count == 1 {
                            controller.fly(to: top.province)
                            if let map = model.map, map.meta.provinces.indices.contains(top.province) {
                                say("\(map.meta.provinces[top.province].name)正逢\(meta.label)")
                            }
                        } else {
                            withAnimation(Motion.panel) { weatherDrawerOpen.toggle() }
                        }
                    } label: {
                        HStack(spacing: 5) {
                            Circle().fill(meta.color).frame(width: 6, height: 6)
                            Text(meta.label).font(Theme.kai(11.5)).foregroundStyle(meta.color)
                            if sorted.count > 1 {
                                Text("等\(sorted.count)处").font(Theme.kai(10.5)).foregroundStyle(Theme.ink2).monospacedDigit()
                                InkIcon(glyph: .chevronDown, size: 9, weight: 1.8)
                                    .foregroundStyle(Theme.ink2)
                                    .rotationEffect(.degrees(weatherDrawerOpen ? 180 : 0))
                            }
                        }
                        .fixedSize(horizontal: true, vertical: false)
                        .padding(.horizontal, 9).frame(height: 26)
                        .background(Theme.paper2.opacity(0.92), in: Capsule())
                        .overlay(Capsule().stroke(meta.color.opacity(0.35), lineWidth: 0.75))
                        .shadow(color: Theme.ink.opacity(0.10), radius: 4, y: 1.5)
                    }
                    .buttonStyle(PressStyle())
                    Spacer(minLength: 0)
                }

                if weatherDrawerOpen && sorted.count > 1 {
                    VStack(alignment: .leading, spacing: 4) {
                        ForEach(Array(sorted.prefix(6).enumerated()), id: \.offset) { _, z in
                            let zm = weatherMeta(z.kind)
                            let pname = (model.map?.meta.provinces.indices.contains(z.province) == true) ? model.map!.meta.provinces[z.province].name : "州郡"
                            Button {
                                GameFeel.shared.tap()
                                withAnimation(Motion.tap) { weatherDrawerOpen = false }
                                controller.fly(to: z.province)
                                say("\(pname)正逢\(zm.label)")
                            } label: {
                                HStack(spacing: 7) {
                                    Circle().fill(zm.color).frame(width: 6.5, height: 6.5)
                                    Text(pname).font(Theme.kai(12.5)).foregroundStyle(Theme.ink)
                                    Spacer(minLength: 10)
                                    Text(zm.label).font(Theme.kai(11)).foregroundStyle(zm.color)
                                    InkIcon(glyph: .locate, size: 11, weight: 1.7).foregroundStyle(Theme.ink2)
                                }
                                .padding(.horizontal, 10).padding(.vertical, 5)
                                .background(zm.color.opacity(0.08), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                            }
                            .buttonStyle(PressStyle())
                        }
                    }
                    .frame(maxWidth: 214)
                    .padding(7)
                    .glass(RoundedRectangle(cornerRadius: 14, style: .continuous))
                    .transition(.scale(scale: 0.92, anchor: .topLeading).combined(with: .opacity))
                }
            }
            .padding(.leading, leadInset)
            .padding(.trailing, trailInset)
        }
    }

    /// 即时战略 banner: the selected count, 进攻/防御 mode and cancel.
    private var rtsBanner: some View {
        HStack(spacing: 8) {
            Text("已选\(controller.groupArmies.count)军").font(Theme.kai(13)).foregroundStyle(Theme.ink).lineLimit(1).minimumScaleFactor(0.75)
            HStack(spacing: 0) {
                ForEach([false, true], id: \.self) { defend in
                    Button { withAnimation(Motion.tap) { rtsDefend = defend } } label: {
                        Text(defend ? "防御" : "进攻").font(Theme.caption).foregroundStyle(rtsDefend == defend ? Theme.paper2 : Theme.ink)
                            .padding(.horizontal, 8).padding(.vertical, 4).background(rtsDefend == defend ? Theme.seal : Color.clear, in: Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
            .background(Theme.wash, in: Capsule())
            Button("交AI") {
                let armies = controller.groupArmies
                Task { let out = await model.releaseToAI(armies: armies); say(out.reason); if out.ok { controller.groupArmies = [] }; model.refreshArmies() }
            }.font(Theme.kai(13)).foregroundStyle(Theme.jade).fixedSize()
            Button("取消") { controller.groupArmies = []; model.refreshArmies() }.font(Theme.kai(13)).foregroundStyle(Theme.seal).fixedSize()
        }
        .padding(.horizontal, 12).frame(height: barHeight).glass(Capsule())
    }

    private var paintBanner: some View {
        VStack(spacing: 6) {
            HStack(spacing: 8) {
                let n = controller.paintNation ?? -1, nation = model.map.flatMap { $0.meta.nations.indices.contains(n) ? $0.meta.nations[n] : nil }
                RoundedRectangle(cornerRadius: 4, style: .continuous).fill(nation.map { Names.color($0.color) } ?? Theme.ink2).frame(width: 13, height: 13)
                Text(controller.brushName ?? (controller.placingArmy ? "点按或划过州郡放置" : "绘制\(nation?.name ?? "")疆域")).font(Theme.kai(13.5)).foregroundStyle(Theme.ink).lineLimit(1).minimumScaleFactor(0.75)
                Button("完成") { controller.paintNation = nil; controller.placingArmy = false; controller.placeCount = 1; controller.brushName = nil; controller.brushAction = nil }.font(Theme.kai(13.5)).foregroundStyle(Theme.seal).fixedSize()
            }
            if controller.placingArmy {
                HStack(spacing: 8) {
                    InkIcon(glyph: .military, size: 15, weight: 1.75).foregroundStyle(Theme.seal)
                    PaperTrack(value: Binding(get: { Double(controller.placeCount) }, set: { v in
                        let k = Int(v.rounded()); if k != controller.placeCount { controller.placeCount = k; GameFeel.shared.tap() }
                    }), range: 1...30, step: 1, onEditingChanged: nil)
                    Text("\(controller.placeCount) 军").font(Theme.kai(13)).foregroundStyle(Theme.ink).monospacedDigit().frame(width: 44, alignment: .trailing).contentTransition(.numericText())
                }
                .frame(maxWidth: 260)
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 8).glass(RoundedRectangle(cornerRadius: 20, style: .continuous))
    }

    private var fleetBanner: some View {
        HStack(spacing: 8) {
            InkIcon(glyph: .anchor, size: 15, weight: 1.75).foregroundStyle(Theme.seal)
            Text("舰队：点选目标海港").font(Theme.kai(13.5)).foregroundStyle(Theme.ink).lineLimit(1)
            Button("取消") { controller.marchingFleet = nil; model.refreshArmies() }.font(Theme.kai(13.5)).foregroundStyle(Theme.seal).fixedSize()
        }
        .padding(.horizontal, 14).frame(height: barHeight).glass(Capsule())
    }

    private var marchBanner: some View {
        HStack(spacing: 8) {
            InkIcon(glyph: .march, size: 15, weight: 1.75).foregroundStyle(Theme.seal)
            Text(marchRetreat ? "撤退：点选目的地" : "调兵：点选目的地").font(Theme.kai(13.5)).foregroundStyle(Theme.ink).lineLimit(1)
            Button("取消") { controller.marchingArmy = nil; controller.selectedArmy = nil; model.refreshArmies() }.font(Theme.kai(13.5)).foregroundStyle(Theme.seal).fixedSize()
        }
        .padding(.horizontal, 14).frame(height: barHeight).glass(Capsule())
    }

    @ViewBuilder private var mainTabs: some View {
        let flex = !landscape
        TabButton(symbol: "building.columns", title: "国家", glyph: .nation, active: panel?.tab == "nations", marker: tabMarker, flexible: flex, compact: landscape) { show(.nations) }
        TabButton(symbol: "shield", title: "军事", glyph: .military, active: panel?.tab == "military", marker: tabMarker, flexible: flex, compact: landscape) { show(.military) }
        TabButton(symbol: "scroll", title: "外交", glyph: .diplomacy, active: panel?.tab == "diplomacy", marker: tabMarker, flexible: flex, compact: landscape) { show(.diplomacy) }
        TabButton(symbol: "book", title: "纪事", glyph: .chronicle, active: panel?.tab == "chronicle", marker: tabMarker, flexible: flex, compact: landscape) { show(.chronicle) }
        TabButton(symbol: "chart.bar.xaxis", title: "排行", glyph: .ranking, active: panel?.tab == "statistics", marker: tabMarker, flexible: flex, compact: landscape) { show(.statistics) }
    }
    private var transport: some View {
        let sealSize: CGFloat = landscape ? 28 : Theme.Control.sealButtonSize
        return HStack(spacing: 4) {
            Button {
                GameFeel.shared.tap()
                model.cycleSpeed()
            } label: {
                Text("\(model.speed)×")
                    .font(landscape ? Theme.label : Theme.body)
                    .foregroundStyle(model.speed > 1 ? Theme.seal : Theme.ink)
                    .monospacedDigit()
                    .frame(width: landscape ? 30 : 38, height: sealSize)
                    .background(model.speed > 1 ? Theme.seal.opacity(0.1) : Color.clear, in: Capsule())
                    .contentShape(Capsule())
                    .contentTransition(.numericText())
                    .animation(Motion.tap, value: model.speed)
            }
            .buttonStyle(PressStyle())
            PlaySealButton(playing: model.playing, size: sealSize) { model.togglePlay() }
                .sensoryFeedback(.impact(weight: .light), trigger: model.playing)
        }
    }
    /// 横屏左侧极简导航坞（严守顶栏下方安全区，垂直居中于左侧留白，绝不与日期栏或天时胶囊碰撞）。
    private var landscapeRail: some View {
        let items: [(id: String, glyph: InkGlyph, panel: Panel)] = [
            ("nations", .nation, .nations),
            ("military", .military, .military),
            ("diplomacy", .diplomacy, .diplomacy),
            ("chronicle", .chronicle, .chronicle),
            ("statistics", .ranking, .statistics)
        ]
        return VStack(spacing: 4) {
            ForEach(items, id: \.id) { item in
                let active = panel?.tab == item.id
                Button {
                    GameFeel.shared.tap()
                    show(item.panel)
                } label: {
                    InkIcon(glyph: item.glyph, size: 16.5, weight: active ? 2.0 : 1.65, filled: active,
                            accent: active ? Theme.seal.opacity(0.28) : Theme.seal.opacity(0.12))
                        .foregroundStyle(active ? Theme.seal : Theme.ink)
                        .frame(width: 34, height: 32)
                        .background(active ? Theme.seal.opacity(0.12) : Color.clear, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                        .contentShape(Rectangle())
                }
                .buttonStyle(PressStyle())
            }
        }
        .padding(.vertical, 5).padding(.horizontal, 4)
        .glass(Capsule())
        .padding(.leading, 10)
        .padding(.top, 44)
        .animation(Motion.tap, value: panel?.tab)
    }
    /// 横屏右侧悬浮奏折面板：整合内嵌顶部导航/关闭栏（彻底清除悬空外挂关闭钮），二级切换严格裁切在圆角边界内。
    @ViewBuilder private func sidePage(totalWidth: CGFloat) -> some View {
        if landscape, let panel {
            let panelW = sidePanelWidth(for: totalWidth)
            let shape = RoundedRectangle(cornerRadius: 22, style: .continuous)
            HStack(spacing: 0) {
                Spacer(minLength: 0)
                let hasBack = trail.last != nil
                sheet(for: panel)
                    .id(panel.id)
                    .environment(\.inSidePanel, true)
                    .environment(\.hasBackBar, hasBack)
                    .environment(\.sidePanelClose, { closePage() })
                    .transition(.asymmetric(
                        insertion: .move(edge: backward ? .leading : .trailing).combined(with: .opacity),
                        removal: .move(edge: backward ? .trailing : .leading).combined(with: .opacity)
                    ))
                    .clipped()
                    .safeAreaInset(edge: .top, spacing: 0) {
                        if let last = trail.last {
                            backRow(last, current: panel, isSidePanel: true)
                        }
                    }
                    .font(Theme.section)
                    .frame(width: panelW)
                    .frame(maxHeight: .infinity)
                    .background(MemorialPaper(rules: true, fullBleed: false))
                    .clipShape(shape)
                    .overlay(shape.stroke(Theme.ink.opacity(0.18), lineWidth: 0.85).allowsHitTesting(false))
                    .shadow(color: Color(red: 0.12, green: 0.09, blue: 0.05).opacity(0.22), radius: 16, x: -3, y: 3)
                    .padding(.trailing, 8).padding(.vertical, 8)
            }
            .transition(.move(edge: .trailing).combined(with: .opacity))
        }
    }
    /// 统一进入山河回放：竖屏有原生 sheet 时挂起待 onDismiss 彻底完成后再开回放；横屏或无 sheet 时直接进入。
    private func requestReplay(atDay targetDay: Int?) {
        pausedByPanel = false
        if !landscape && panel != nil {
            pendingReplayDay = .some(targetDay)
            closePage()
        } else {
            closePage()
            Task { await model.enterReplay(atDay: targetDay) }
        }
    }
    /// 导出地图截图: the controls step aside for a moment, the screen is drawn to an image and shared.
    private func mapShot() {
        closePage()
        withAnimation(Motion.fade) { wallpaper = true }
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 600_000_000)
            let window = UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.keyWindow }.first
            var url: URL?
            if let window {
                let image = UIGraphicsImageRenderer(bounds: window.bounds).image { _ in window.drawHierarchy(in: window.bounds, afterScreenUpdates: true) }
                let file = FileManager.default.temporaryDirectory.appendingPathComponent("列国纪地图.png")
                if (try? image.pngData()?.write(to: file)) != nil { url = file }
            }
            withAnimation(Motion.fade) { wallpaper = false }
            shot = url.map(ShotFile.init)
        }
    }
    private func closePage() {
        withAnimation(Motion.panel) { panel = nil }
        trail = []
        controller.selectedProvince = nil; controller.selectedFleet = nil; controller.selectedFleetId = nil
        if controller.marchingArmy == nil { controller.selectedArmy = nil; controller.selectedArmyId = nil }
    }

    private var bottomBar: some View {
        VStack(spacing: Theme.Control.gap) {
            EventTicker(latest: model.state?.events.last?.text) { show(.chronicle) }
            HStack(spacing: Theme.Control.gap) {
                HStack(spacing: 0) {
                    mainTabs
                }
                .animation(Motion.tap, value: panel?.tab)
                .padding(.horizontal, 6)
                .frame(maxWidth: .infinity)
                .frame(height: Theme.Control.dockHeight)
                .glass(Capsule())

                transport
                .padding(.horizontal, 5)
                .frame(height: Theme.Control.dockHeight)
                .glass(Capsule())
            }
        }
        .padding(.horizontal, 12).padding(.bottom, 6)
    }
}

/// 推演启停朱印钮：与 54pt 底栏绝对同心（44×44pt，四周留白 5pt）。
/// 彻底回归原本温润宣纸朱印风格：推演中为朱砂实印（宣纸暂停符），暂停时为宣纸底配朱砂双框印（朱砂播放符），彻底消除突兀黑圆块。
struct PlaySealButton: View {
    let playing: Bool
    var size: CGFloat = Theme.Control.sealButtonSize
    let action: () -> Void
    @State private var sealPulse = false
    var body: some View {
        Button(action: action) {
            ZStack {
                Circle()
                    .strokeBorder(Theme.seal.opacity(sealPulse ? 0 : 0.46), lineWidth: 1.4)
                    .frame(width: size, height: size)
                    .scaleEffect(sealPulse ? 1.38 : 0.96)
                    .allowsHitTesting(false)
                Circle()
                    .fill(playing ? Theme.seal : Theme.paper2)
                    .overlay(
                        Circle()
                            .strokeBorder(playing ? Theme.paper2.opacity(0.32) : Theme.seal.opacity(0.72), lineWidth: playing ? 0.9 : 1.35)
                            .padding(playing ? 2.5 : 0.8)
                    )
                    .overlay(
                        Circle()
                            .strokeBorder(playing ? Color.clear : Theme.seal.opacity(0.22), lineWidth: 0.6)
                            .padding(3.5)
                    )
                    .shadow(color: Theme.seal.opacity(playing ? 0.24 : 0.12), radius: 4, y: 1.5)
                    .frame(width: size, height: size)
                InkIcon(glyph: playing ? .pause : .play, size: size * 0.39, weight: 1.95,
                        accent: (playing ? Theme.paper2 : Theme.seal).opacity(0.88))
                    .foregroundStyle(playing ? Theme.paper2 : Theme.seal)
                    .offset(x: playing ? 0 : 1)
                    .id(playing)
                    .transition(.scale(scale: 0.76).combined(with: .opacity))
            }
            .contentShape(Circle())
            .animation(Motion.tap, value: playing)
            .onChange(of: playing) { _, _ in
                sealPulse = false
                withAnimation(.easeOut(duration: 0.42)) { sealPulse = true }
            }
        }
        .buttonStyle(PressStyle())
    }
}
