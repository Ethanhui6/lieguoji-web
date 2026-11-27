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

fileprivate struct GameShotFile: Identifiable {
    let url: URL
    var id: URL { url }
}

fileprivate struct GamePanelActions {
    let open: (Panel) -> Void
    let back: () -> Void
    let closePage: () -> Void
    let say: (String) -> Void
    let locateArmy: (Int) -> Void
    let orderMarch: (Int, Bool) -> Void
    let orderFleet: (Int) -> Void
    let paintNation: (Int) -> Void
    let placeArmy: (Int) -> Void
    let pickProvince: (Int, String, @escaping (Int) -> Void) -> Void
    let lowerSheet: () -> Void
    let requestReplay: (Int?) -> Void
    let enterWallpaper: () -> Void
    let mapShot: () -> Void
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
    /// 统一竖屏底部抽屉三档高度（低档 38% 观图 / 半屏 50% / 展开 89% 留足顶栏与灵动岛安全区，绝不贴顶遮挡状态栏）。
    fileprivate static let lowDetent = PresentationDetent.fraction(0.38)
    fileprivate static let midDetent = PresentationDetent.medium
    fileprivate static let highDetent = PresentationDetent.fraction(0.89)
    @State private var sheetDetent: PresentationDetent = .medium
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
    /// 手动「净图」模式：默认 false（HUD 稳定常驻）；仅点击顶栏眼睛钮手动切换净图。
    @State private var cleanMap = false
    /// 模块三双模 HUD 开关（设置 › 界面与净图）：默认 false（常驻 + 右上角净图钮）；开启后静置 6 秒自动淡隐，轻点地图或展开钮丝滑唤出。
    @AppStorage("hud.autoHide") private var hudAutoHide = false
    @State private var idleHidden = false
    @State private var idleSerial = 0
    /// 天时灾丰折叠清单展开态（绝不与日期栏抢占横向宽度）
    @State private var weatherDrawerOpen = false
    fileprivate static let hudSpring = Animation.spring(response: 0.34, dampingFraction: 0.88)
    @State private var shot: GameShotFile?
    @State private var shotTask: Task<Void, Never>?

    init(model: GameModel) {
        self.model = model
        _controller = ObservedObject(wrappedValue: model.controller)
    }

    private var chromeIn: Bool { controller.reveal >= 1 && entered }
    private var hudVisible: Bool { chromeIn && !cleanMap && !(hudAutoHide && idleHidden) }
    private var barHeight: CGFloat { landscape ? 38 : Theme.Control.topHeight }
    private var sideKey: String? { landscape ? panel?.id : nil }
    private var pageShown: Binding<Bool> {
        Binding(get: { panel != nil && !landscape }, set: { if !$0 && !landscape { panel = nil } })
    }

    fileprivate static func sidePanelWidth(for totalWidth: CGFloat, landscape: Bool, hasPanel: Bool) -> CGFloat {
        guard landscape, hasPanel else { return 0 }
        return min(430, max(320, totalWidth * 0.44))
    }

    private var panelActions: GamePanelActions {
        GamePanelActions(
            open: { open($0) },
            back: { back() },
            closePage: { closePage() },
            say: { say($0) },
            locateArmy: { locate(army: $0) },
            orderMarch: { army, retreat in
                let targetIdx = model.resolveArmy(id: controller.selectedArmyId, fallback: army)?.index ?? army
                marchRetreat = retreat
                controller.marchingArmy = targetIdx
                panel = nil
                say(retreat ? "点选撤退的目的地（途中不主动接战）" : "点选地图上的目的地")
            },
            orderFleet: { fleet in
                let targetIdx = model.resolveFleet(id: controller.selectedFleetId, fallback: fleet)?.index ?? fleet
                controller.marchingFleet = targetIdx
                panel = nil
                say("点选地图上本国的港口州郡")
            },
            paintNation: { n in
                controller.placingArmy = false
                controller.paintNation = n
                panel = nil
                let name = model.map.flatMap { $0.meta.nations.indices.contains(n) ? $0.meta.nations[n].name : nil } ?? ""
                say("绘制疆域：点选或用一指拖过州郡，划入\(name)；两指移动地图")
            },
            placeArmy: { n in
                controller.marchingArmy = nil
                controller.marchingFleet = nil
                controller.groupArmies = []
                controller.placingArmy = true
                controller.paintNation = n
                panel = nil
                controller.placeCount = 3
                say("拖动滑条选数量，点按或一指划过州郡放下军队；两指移动地图")
            },
            pickProvince: { n, prompt, done in
                // 地图点选: the page steps aside, the player taps the map, and the page comes back with the choice.
                controller.pickPrompt = prompt
                controller.onPick = { p in
                    controller.pickPrompt = nil
                    controller.onPick = nil
                    done(p)
                    open(.nation(n))
                }
                panel = nil
            },
            lowerSheet: { withAnimation(Motion.sheetSwap) { sheetDetent = Self.lowDetent } },
            requestReplay: { requestReplay(atDay: $0) },
            enterWallpaper: {
                panel = nil
                withAnimation(Motion.reveal) { wallpaper = true }
                controller.drifting = true
            },
            mapShot: { mapShot() }
        )
    }

    var body: some View {
        GeometryReader { geo in
            GameRootStage(
                model: model,
                controller: controller,
                size: geo.size,
                landscape: landscape,
                barHeight: barHeight,
                chromeIn: chromeIn,
                hudVisible: hudVisible,
                sideKey: sideKey,
                panel: $panel,
                trail: trail,
                backward: backward,
                viewsOpen: $viewsOpen,
                wallpaper: $wallpaper,
                cleanMap: $cleanMap,
                weatherDrawerOpen: $weatherDrawerOpen,
                marchRetreat: marchRetreat,
                rtsDefend: $rtsDefend,
                legendMenu: $legendMenu,
                ripple: ripple,
                toast: $toast,
                toastSerial: toastSerial,
                tabMarker: tabMarker,
                actions: panelActions,
                show: show,
                openAlliance: allianceMenu,
                onExpandCleanMap: exitCleanMap,
                onEntered: { entered = true },
                onTourShow: { p in
                    if case .people = p { sheetDetent = Self.highDetent }
                    if let p { show(p) } else { panel = nil }
                }
            )
        }
        .sheet(item: $shot) { ShareSheet(items: [$0.url]) }
        .sheet(isPresented: pageShown, onDismiss: handlePortraitSheetDismiss) {
            if let active = panel ?? lastPanel {
                GamePortraitSheetHost(
                    model: model,
                    controller: controller,
                    active: active,
                    lastTrail: trail.last,
                    backward: backward,
                    sheetDetent: $sheetDetent,
                    actions: panelActions
                )
            }
        }
        .modifier(GameLifecycleModifier(
            model: model,
            controller: controller,
            landscape: landscape,
            panel: $panel,
            lastPanel: $lastPanel,
            viewsOpen: $viewsOpen,
            weatherDrawerOpen: $weatherDrawerOpen,
            sheetDetent: $sheetDetent,
            pausedByPanel: $pausedByPanel,
            ripple: $ripple,
            marchRetreat: $marchRetreat,
            rtsDefend: $rtsDefend,
            show: show,
            say: say,
            exitCleanMap: exitCleanMap,
            syncSheetFocusInsets: syncSheetFocusInsets
        ))
        .task(id: toastSerial) {
            guard toastSerial > 0, toast != nil else { return }
            try? await Task.sleep(nanoseconds: 2_400_000_000)
            guard !Task.isCancelled else { return }
            toast = nil
        }
        .onDisappear {
            shotTask?.cancel()
            shotTask = nil
        }
        .task(id: "\(hudAutoHide)-\(idleSerial)-\(panel != nil)-\(viewsOpen)-\(cleanMap)-\(wallpaper)") {
            guard hudAutoHide, !ShotTour.on, panel == nil, !viewsOpen, !cleanMap, !wallpaper else {
                if idleHidden { withAnimation(Self.hudSpring) { idleHidden = false } }
                return
            }
            try? await Task.sleep(nanoseconds: 6_000_000_000)
            guard !Task.isCancelled, hudAutoHide, panel == nil, !viewsOpen, !cleanMap, !wallpaper else { return }
            withAnimation(Self.hudSpring) { idleHidden = true }
        }
        .modifier(GameSelectionModifier(
            model: model,
            controller: controller,
            panel: $panel,
            viewsOpen: $viewsOpen,
            show: show,
            say: say
        ))
    }

    private func handlePortraitSheetDismiss() {
        trail = []
        sheetDetent = Self.midDetent
        if panel == nil {
            controller.sheetOpen = false
            controller.sheetBottomFraction = 0
            controller.sheetTrailingFraction = 0
            controller.selectedProvince = nil
            controller.selectedFleet = nil
            controller.selectedFleetId = nil
            if controller.marchingArmy == nil {
                controller.selectedArmy = nil
                controller.selectedArmyId = nil
            }
        }
        if let pending = pendingReplayDay {
            pendingReplayDay = nil
            Task { await model.enterReplay(atDay: pending) }
        }
    }

    private func exitCleanMap() {
        idleSerial &+= 1
        if cleanMap || idleHidden {
            withAnimation(Self.hudSpring) { cleanMap = false; idleHidden = false }
        }
    }

    /// 底部主标签模态页（打开时占满高抽屉并立即置 `sheetBottomFraction = 0.89`，触发 Metal 0fps 零发热冻结）。
    private static func isModalFullTab(_ p: Panel) -> Bool {
        switch p {
        case .editor, .edicts, .statistics, .nations, .military, .diplomacy, .chronicle, .menu:
            return true
        case .quick, .province, .nation, .army, .fleet, .people, .nationWars, .nationTalks:
            return false
        }
    }

    private func syncSheetFocusInsets(for p: Panel?) {
        guard let p else {
            controller.sheetOpen = false
            controller.sheetBottomFraction = 0
            controller.sheetTrailingFraction = 0
            return
        }
        controller.sheetOpen = true
        if landscape {
            controller.sheetBottomFraction = 0
            controller.sheetTrailingFraction = 0.44
        } else {
            controller.sheetTrailingFraction = 0
            if Self.isModalFullTab(p) {
                controller.sheetBottomFraction = (sheetDetent == Self.lowDetent) ? 0.38 : 0.89
            } else if sheetDetent == Self.highDetent {
                controller.sheetBottomFraction = 0.89
            } else if sheetDetent == Self.lowDetent {
                controller.sheetBottomFraction = 0.38
            } else {
                controller.sheetBottomFraction = 0.48
            }
        }
    }

    /// Opens a page from inside the sheet: the current page goes on the trail.
    private func open(_ next: Panel) {
        guard next != panel else { return }
        GameFeel.shared.scrollOpen()
        backward = false
        withAnimation(Motion.sheetSwap) {
            if let panel { trail.append(panel); if trail.count > 8 { trail.removeFirst() } }
            if Self.isModalFullTab(next) { sheetDetent = Self.highDetent }
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
        GameFeel.shared.scrollOpen()
        backward = false
        let wantHigh: Bool = {
            if Self.isModalFullTab(next) { return true }
            if case .nation = next, NationSheet.tourTab != nil { return true }
            if case .menu = next, MenuSheet.tourWarRules { return true }
            if case .people = next, ShotTour.on { return true }
            return false
        }()
        if panel == nil {
            trail = []
            sheetDetent = wantHigh ? Self.highDetent : Self.midDetent
            panel = next
            return
        }
        withAnimation(Motion.sheetSwap) {
            trail = []
            if wantHigh { sheetDetent = Self.highDetent }
            else if sheetDetent == Self.lowDetent { sheetDetent = Self.midDetent }
            panel = next
        }
    }

    private func back() {
        guard let last = trail.last else { return }
        backward = true
        withAnimation(Motion.sheetSwap) { trail.removeLast(); panel = last }
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
        toastSerial &+= 1
        toast = text
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
        shotTask?.cancel()
        shotTask = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 600_000_000)
            guard !Task.isCancelled else {
                withAnimation(Motion.fade) { wallpaper = false }
                return
            }
            let window = UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.keyWindow }.first
            var url: URL?
            if let window {
                let image = UIGraphicsImageRenderer(bounds: window.bounds).image { _ in window.drawHierarchy(in: window.bounds, afterScreenUpdates: true) }
                let file = FileManager.default.temporaryDirectory.appendingPathComponent("列国纪地图.png")
                if (try? image.pngData()?.write(to: file)) != nil { url = file }
            }
            withAnimation(Motion.fade) { wallpaper = false }
            shot = url.map(GameShotFile.init)
        }
    }

    private func closePage() {
        withAnimation(Motion.panel) { panel = nil }
        trail = []
        controller.selectedProvince = nil
        controller.selectedFleet = nil
        controller.selectedFleetId = nil
        if controller.marchingArmy == nil {
            controller.selectedArmy = nil
            controller.selectedArmyId = nil
        }
    }
}

// MARK: - Modular HUD Stage (each concrete struct keeps SwiftUI AttributeGraph stack frames shallow)

private struct GameRootStage: View {
    @ObservedObject var model: GameModel
    @ObservedObject var controller: MapController
    let size: CGSize
    let landscape: Bool
    let barHeight: CGFloat
    let chromeIn: Bool
    let hudVisible: Bool
    let sideKey: String?
    @Binding var panel: Panel?
    let trail: [Panel]
    let backward: Bool
    @Binding var viewsOpen: Bool
    @Binding var wallpaper: Bool
    @Binding var cleanMap: Bool
    @Binding var weatherDrawerOpen: Bool
    let marchRetreat: Bool
    @Binding var rtsDefend: Bool
    @Binding var legendMenu: PressMenu?
    let ripple: CGPoint?
    @Binding var toast: String?
    let toastSerial: Int
    let tabMarker: Namespace.ID
    let actions: GamePanelActions
    let show: (Panel) -> Void
    let openAlliance: (MapViewData.Entry) -> Void
    let onExpandCleanMap: () -> Void
    let onEntered: () -> Void
    let onTourShow: (Panel?) -> Void

    private var panelW: CGFloat {
        GameView.sidePanelWidth(for: size.width, landscape: landscape, hasPanel: panel != nil)
    }
    private var trailSafe: CGFloat { (landscape && panel != nil) ? (panelW + 20) : 12 }
    private var leadSafe: CGFloat { landscape ? 62 : 12 }
    private var hiddenByMode: Bool { wallpaper || model.replayActive }

    var body: some View {
        GameHudCanvas(
            model: model,
            controller: controller,
            size: size,
            landscape: landscape,
            barHeight: barHeight,
            chromeIn: chromeIn,
            hudVisible: hudVisible,
            leadSafe: leadSafe,
            trailSafe: trailSafe,
            hiddenByMode: hiddenByMode,
            panel: panel,
            viewsOpen: $viewsOpen,
            wallpaper: $wallpaper,
            cleanMap: $cleanMap,
            weatherDrawerOpen: $weatherDrawerOpen,
            marchRetreat: marchRetreat,
            rtsDefend: $rtsDefend,
            legendMenu: $legendMenu,
            tabMarker: tabMarker,
            show: show,
            say: actions.say,
            openAlliance: openAlliance,
            onExpandCleanMap: onExpandCleanMap,
            onEntered: onEntered,
            onTourShow: onTourShow
        )
        .overlay(alignment: .trailing) {
            GameSidePanelOverlay(
                model: model,
                controller: controller,
                landscape: landscape,
                panel: panel,
                panelWidth: panelW,
                lastTrail: trail.last,
                backward: backward,
                actions: actions
            )
        }
        .animation(Motion.panel, value: sideKey)
        .overlay {
            if let ripple {
                PressRipple().position(ripple).ignoresSafeArea()
            }
        }
        .overlay(alignment: .bottom) {
            GameToastOverlay(
                toast: toast,
                toastSerial: toastSerial,
                landscape: landscape,
                hasPanel: panel != nil,
                panelWidth: panelW,
                onDismiss: { toast = nil }
            )
        }
        .animation(Motion.panel, value: toastSerial)
        .animation(Motion.fade, value: toast)
    }
}

private struct GameHudCanvas: View {
    @ObservedObject var model: GameModel
    @ObservedObject var controller: MapController
    let size: CGSize
    let landscape: Bool
    let barHeight: CGFloat
    let chromeIn: Bool
    let hudVisible: Bool
    let leadSafe: CGFloat
    let trailSafe: CGFloat
    let hiddenByMode: Bool
    let panel: Panel?
    @Binding var viewsOpen: Bool
    @Binding var wallpaper: Bool
    @Binding var cleanMap: Bool
    @Binding var weatherDrawerOpen: Bool
    let marchRetreat: Bool
    @Binding var rtsDefend: Bool
    @Binding var legendMenu: PressMenu?
    let tabMarker: Namespace.ID
    let show: (Panel) -> Void
    let say: (String) -> Void
    let openAlliance: (MapViewData.Entry) -> Void
    let onExpandCleanMap: () -> Void
    let onEntered: () -> Void
    let onTourShow: (Panel?) -> Void

    var body: some View {
        Color.clear
            .statusBarHidden()
            .overlay {
                GameInkVignette(landscape: landscape, hidden: wallpaper || !hudVisible)
            }
            .task {
                guard ShotTour.on else { return }
                await ShotTour.play(model, show: onTourShow, views: { viewsOpen = $0 })
            }
            .overlay(alignment: .top) {
                GameTopChrome(
                    model: model,
                    controller: controller,
                    landscape: landscape,
                    barHeight: barHeight,
                    hudVisible: hudVisible,
                    hiddenByMode: hiddenByMode,
                    leadSafe: leadSafe,
                    trailSafe: trailSafe,
                    panel: panel,
                    viewsOpen: $viewsOpen,
                    cleanMap: $cleanMap,
                    weatherDrawerOpen: $weatherDrawerOpen,
                    marchRetreat: marchRetreat,
                    rtsDefend: $rtsDefend,
                    show: show,
                    say: say
                )
            }
            .overlay(alignment: .topTrailing) {
                GameCleanMapChip(
                    visible: chromeIn && !hudVisible && !hiddenByMode,
                    landscape: landscape,
                    onExpand: onExpandCleanMap
                )
            }
            .overlay(alignment: .bottom) {
                GameBottomChrome(
                    model: model,
                    landscape: landscape,
                    panel: panel,
                    hudVisible: hudVisible,
                    hiddenByMode: hiddenByMode,
                    totalWidth: size.width,
                    leadSafe: leadSafe,
                    trailSafe: trailSafe,
                    tabMarker: tabMarker,
                    show: show,
                    onEntered: onEntered
                )
            }
            .overlay(alignment: .leading) {
                if landscape {
                    GameLandscapeRail(
                        activeTab: panel?.tab,
                        hudVisible: hudVisible,
                        hiddenByMode: hiddenByMode,
                        show: show
                    )
                }
            }
            .overlay {
                if wallpaper {
                    GameWallpaperOverlay {
                        withAnimation(Motion.reveal) { wallpaper = false }
                        controller.drifting = false
                    }
                }
            }
            .overlay(alignment: .bottomLeading) {
                GameLegendOverlay(
                    model: model,
                    landscape: landscape,
                    leadSafe: leadSafe,
                    hudVisible: hudVisible,
                    hiddenByMode: hiddenByMode,
                    openAlliance: openAlliance
                )
            }
            .pressMenuHost($legendMenu)
            .overlay {
                GameViewSwitcherOverlay(
                    model: model,
                    viewsOpen: $viewsOpen,
                    landscape: landscape,
                    barHeight: barHeight,
                    trailSafe: trailSafe,
                    hideSwitcher: hiddenByMode || !hudVisible
                )
            }
            .opacity(controller.reveal >= 1 ? 1 : 0)
            .animation(Motion.panel, value: controller.reveal >= 1)
    }
}

private struct GameInkVignette: View {
    let landscape: Bool
    let hidden: Bool
    var body: some View {
        VStack(spacing: 0) {
            LinearGradient(
                colors: [Theme.ink.opacity(landscape ? 0.08 : 0.13), Theme.ink.opacity(0.02), .clear],
                startPoint: .top, endPoint: .bottom
            )
            .frame(height: landscape ? 56 : 108)
            Spacer()
            LinearGradient(
                colors: [.clear, Theme.ink.opacity(0.02), Theme.ink.opacity(landscape ? 0.07 : 0.11)],
                startPoint: .top, endPoint: .bottom
            )
            .frame(height: landscape ? 38 : 118)
        }
        .ignoresSafeArea()
        .allowsHitTesting(false)
        .opacity(hidden ? 0 : 1)
        .animation(GameView.hudSpring, value: hidden)
    }
}

private struct GameTopChrome: View {
    @ObservedObject var model: GameModel
    @ObservedObject var controller: MapController
    let landscape: Bool
    let barHeight: CGFloat
    let hudVisible: Bool
    let hiddenByMode: Bool
    let leadSafe: CGFloat
    let trailSafe: CGFloat
    let panel: Panel?
    @Binding var viewsOpen: Bool
    @Binding var cleanMap: Bool
    @Binding var weatherDrawerOpen: Bool
    let marchRetreat: Bool
    @Binding var rtsDefend: Bool
    let show: (Panel) -> Void
    let say: (String) -> Void

    private var hasWeather: Bool { !(model.state?.weatherZones?.isEmpty ?? true) }
    private var hasBanner: Bool {
        controller.marchingArmy != nil || controller.marchingFleet != nil ||
        controller.paintNation != nil || controller.pickPrompt != nil || !controller.groupArmies.isEmpty
    }
    private var showOnlineSignalPill: Bool {
        hudVisible && !viewsOpen
    }

    var body: some View {
        VStack(spacing: 6) {
            GameTopBar(
                model: model,
                controller: controller,
                landscape: landscape,
                panel: panel,
                barHeight: barHeight,
                trailInset: trailSafe,
                viewsOpen: $viewsOpen,
                weatherDrawerOpen: $weatherDrawerOpen,
                cleanMap: $cleanMap,
                show: show,
                say: say
            )
            .offset(y: hudVisible ? 0 : -72)
            .scaleEffect(hudVisible ? 1 : 0.96, anchor: .top)
            .opacity(hudVisible ? 1 : 0)
            .allowsHitTesting(hudVisible)
            .animation(GameView.hudSpring, value: hudVisible)

            // 真·网游非阻塞浮动自动重连横幅：紧贴顶栏下方轻盈呈现，绝不以系统弹窗锁死地图。
            if model.remoteReconnecting {
                GameReconnectBanner(
                    model: model,
                    leadInset: leadSafe,
                    trailInset: trailSafe,
                    say: say
                )
                .transition(.move(edge: .top).combined(with: .opacity))
            }

            if (hudVisible && hasWeather) || showOnlineSignalPill {
                HStack(alignment: .top, spacing: 8) {
                    if hudVisible && hasWeather {
                        GameWeatherOverflowBar(
                            model: model,
                            controller: controller,
                            weatherDrawerOpen: $weatherDrawerOpen,
                            say: say
                        )
                        .transition(.move(edge: .top).combined(with: .opacity))
                    }
                    Spacer(minLength: 4)
                    if showOnlineSignalPill {
                        GameOnlineSignalPill(model: model, say: say)
                            .transition(.scale(scale: 0.92, anchor: .topTrailing).combined(with: .opacity))
                    }
                }
                .padding(.leading, leadSafe)
                .padding(.trailing, trailSafe)
            }

            if hasBanner {
                GameActionBanners(
                    model: model,
                    controller: controller,
                    barHeight: barHeight,
                    leadInset: leadSafe,
                    trailInset: trailSafe,
                    marchRetreat: marchRetreat,
                    rtsDefend: $rtsDefend,
                    say: say
                )
            }

            GameHeraldHost(
                model: model,
                controller: controller,
                hudVisible: hudVisible,
                panelOpen: panel != nil,
                viewsOpen: viewsOpen,
                leadInset: leadSafe,
                trailInset: trailSafe
            )

            if let express = model.expressEventToast, model.pendingHistoricalModal == nil {
                VStack {
                    HistoricalExpressBanner(
                        modal: express,
                        onTapOpen: {
                            model.dismissExpressEventToast()
                        },
                        onDismiss: {
                            model.dismissExpressEventToast()
                        }
                    )
                    .padding(.top, barHeight + 10)
                    Spacer()
                }
                .transition(.move(edge: .top).combined(with: .opacity))
                .zIndex(88)
            }

            if let modal = model.pendingHistoricalModal {
                HistoricalEventModalOverlay(
                    modal: modal,
                    route: model.activeHistoricalRoute,
                    onChoose: { idx in
                        GameFeel.shared.tap()
                        Task { await model.resolveHistoricalEvent(choiceIndex: idx) }
                    }
                )
                .transition(.opacity.combined(with: .scale(scale: 0.97)))
                .zIndex(95)
            }
        }
        .animation(Motion.panel, value: panel?.id)
        .animation(GameView.hudSpring, value: model.remoteReconnecting)
        .animation(GameView.hudSpring, value: model.remoteOfflineManual)
        .animation(GameView.hudSpring, value: model.remoteAddress != nil)
        .opacity(hiddenByMode ? 0 : 1)
        .allowsHitTesting(!hiddenByMode)
    }
}

/// 严苛零碰撞顶部状态栏：竖屏 38pt 紧凑等高，横屏 36pt 等高。
private struct GameTopBar: View {
    @ObservedObject var model: GameModel
    @ObservedObject var controller: MapController
    let landscape: Bool
    let panel: Panel?
    let barHeight: CGFloat
    let trailInset: CGFloat
    @Binding var viewsOpen: Bool
    @Binding var weatherDrawerOpen: Bool
    @Binding var cleanMap: Bool
    let show: (Panel) -> Void
    let say: (String) -> Void

    private var compactDateText: String {
        model.state?.pureDateText ?? ""
    }

    var body: some View {
        let h = barHeight
        let tightLandscape = landscape && panel != nil
        let toolW: CGFloat = tightLandscape ? 30 : (landscape ? 34 : 36)
        let rtsActive = controller.boxSelecting || !controller.groupArmies.isEmpty

        HStack(spacing: tightLandscape ? 5 : 7) {
            GameTopDateCapsule(
                model: model,
                compactDateText: compactDateText,
                tightLandscape: tightLandscape,
                landscape: landscape,
                height: h,
                show: show
            )

            if landscape {
                GameTransportPill(model: model, landscape: true)
                    .padding(.horizontal, 4)
                    .frame(height: h)
                    .glass(Capsule())
            }

            Spacer(minLength: 4)

            HStack(spacing: 0) {
                GameTopToolButton(glyph: viewsOpen ? .close : .views, active: viewsOpen, landscape: landscape, width: toolW, height: h) {
                    withAnimation(Motion.panel) { viewsOpen.toggle(); weatherDrawerOpen = false }
                }
                GameToolDivider()
                GameTopToolButton(glyph: rtsActive ? .close : .command, active: rtsActive, landscape: landscape, width: toolW, height: h) {
                    if rtsActive {
                        controller.boxSelecting = false
                        controller.groupArmies = []
                        model.refreshArmies()
                    } else {
                        controller.boxSelecting = true
                        say("即时战略：在地图上拖出方框选择军队")
                    }
                }
                GameToolDivider()
                GameTopToolButton(glyph: .eye, active: false, landscape: landscape, width: toolW, height: h) {
                    withAnimation(GameView.hudSpring) { cleanMap = true; viewsOpen = false; weatherDrawerOpen = false }
                }
                GameToolDivider()
                GameTopToolButton(glyph: .menu, active: panel == .menu, landscape: landscape, width: toolW, height: h) {
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
}

private struct GameTopDateCapsule: View {
    @ObservedObject var model: GameModel
    let compactDateText: String
    let tightLandscape: Bool
    let landscape: Bool
    let height: CGFloat
    let show: (Panel) -> Void

    var body: some View {
        HStack(alignment: .center, spacing: tightLandscape ? 4 : 6) {
            Button {
                GameFeel.shared.tap()
                show(.chronicle)
            } label: {
                HStack(alignment: .center, spacing: tightLandscape ? 4 : 5) {
                    Circle()
                        .fill(model.playing ? Theme.seal : Theme.ink2.opacity(0.42))
                        .frame(width: 6, height: 6)
                        .animation(Motion.panel, value: model.playing)
                    Text(compactDateText)
                        .font(tightLandscape ? Theme.sans(12.5) : Theme.sans(13.5))
                        .foregroundStyle(Theme.ink)
                        .monospacedDigit()
                        .lineLimit(1)
                        .minimumScaleFactor(0.76)
                        .frame(maxWidth: tightLandscape ? 118 : 162, alignment: .leading)
                        .layoutPriority(1)
                    if let m = model.state?.date.month {
                        GameSeasonBadge(month: m, tight: tightLandscape)
                    }
                }
                .frame(height: height)
                .contentShape(Rectangle())
            }
            .buttonStyle(PressStyle())

            if let wars = model.state?.wars.count, wars > 0 {
                Rectangle().fill(Theme.ink.opacity(0.15)).frame(width: 0.75, height: 14)
                Button {
                    GameFeel.shared.tap()
                    MilitarySheet.openOn = "wars"
                    show(.military)
                } label: {
                    WarCount(count: wars, compact: true)
                        .fixedSize(horizontal: true, vertical: false)
                        .frame(height: height)
                        .contentShape(Rectangle())
                }
                .buttonStyle(PressStyle())
                .transition(.scale(scale: 0.86).combined(with: .opacity))
            }
        }
        .padding(.horizontal, tightLandscape ? 8 : 10)
        .frame(height: height)
        .glass(Capsule())
        .animation(Motion.panel, value: (model.state?.wars.count ?? 0) > 0)
    }
}

/// 宋版宣纸三格网游信号强度微标（纯矢量无离屏开销）。
private struct OnlineSignalBars: View {
    let bars: Int
    let activeColor: Color

    var body: some View {
        HStack(alignment: .bottom, spacing: 1.8) {
            ForEach(0..<3, id: \.self) { idx in
                let lit = idx < bars
                RoundedRectangle(cornerRadius: 1, style: .continuous)
                    .fill(lit ? activeColor : Theme.ink.opacity(0.18))
                    .frame(width: 2.3, height: CGFloat(4.5 + Double(idx) * 2.8))
            }
        }
        .frame(height: 11, alignment: .bottom)
        .accessibilityHidden(true)
    }
}

/// 战局内常驻云服信号与延迟胶囊：
/// - 在线态显示实时 `云服 XXms`，点按即刻全线路测速并打开「云服推流线路与延迟」面板；
/// - 重连态显示 `重连中…`，离线/未连接态显示 `未连接 · 点此秒连`，点按立即自动竞速重连最优线路并展开 5 线切换表。
private struct GameOnlineSignalPill: View {
    @ObservedObject var model: GameModel
    let say: (String) -> Void
    @State private var routeSheetOpen = false

    private var signalStrength: (bars: Int, color: Color) {
        guard model.remoteAddress != nil else {
            return model.remoteReconnecting ? (1, Theme.gold) : (3, Theme.jade)
        }
        guard let rtt = model.remoteRTTMs else { return (3, Theme.jade) }
        if rtt < 85 { return (3, Theme.jade) }
        if rtt < 180 { return (2, Theme.jade) }
        return (1, Theme.gold)
    }

    private var pillLabel: String {
        if model.remoteAddress != nil {
            if model.probingRoutes { return "测速…" }
            if let rtt = model.remoteRTTMs { return "云服 \(rtt)ms" }
            return "云服在线"
        }
        if model.remoteReconnecting {
            return "重连中…"
        }
        return "本机 0ms"
    }

    var body: some View {
        let connected = model.remoteAddress != nil
        let sig = signalStrength
        Button {
            GameFeel.shared.tap()
            routeSheetOpen = true
            Task { await model.probeAllRoutes() }
        } label: {
            HStack(spacing: 5) {
                Circle()
                    .fill(sig.color)
                    .frame(width: 5.5, height: 5.5)
                if connected {
                    OnlineSignalBars(bars: sig.bars, activeColor: sig.color)
                }
                Text(pillLabel)
                    .font(Theme.sans(11.5))
                    .foregroundStyle(Theme.ink)
                    .monospacedDigit()
                    .lineLimit(1)
                    .minimumScaleFactor(0.82)
                    .fixedSize()
            }
            .padding(.horizontal, 10)
            .frame(height: 26)
            .background(Theme.paperLight.opacity(0.95), in: Capsule())
            .overlay(Capsule().strokeBorder(sig.color.opacity(0.38), lineWidth: 0.75))
            .overlay(Capsule().inset(by: 2).strokeBorder(Theme.hairline, lineWidth: 0.45))
        }
        .buttonStyle(PressStyle())
        .sheet(isPresented: $routeSheetOpen) {
            ComputeRouteSheet(model: model, say: say, onClose: { routeSheetOpen = false })
                .presentationDetents([.medium, .fraction(0.82)])
                .presentationCornerRadius(Theme.Control.cornerSheet)
                .presentationBackground { MemorialPaper() }
                .presentationDragIndicator(.hidden)
                .font(Theme.section)
        }
    }
}

/// 轻量宋韵「算力引擎与推流线路」面板：默认本机 Apple Silicon 0ms 原生演算，支持 1 键无缝切换广州云服/局域网电脑。
private struct ComputeRouteSheet: View {
    @ObservedObject var model: GameModel
    let say: (String) -> Void
    let onClose: () -> Void
    @State private var switchingId: String? = nil

    private func rttStyle(_ ms: Int?) -> (text: String, color: Color, bars: Int) {
        guard let ms else {
            return (model.probingRoutes ? "测速中" : "超时", Theme.ink2, 0)
        }
        if ms < 85 { return ("\(ms)ms", Theme.jade, 3) }
        if ms < 180 { return ("\(ms)ms", Theme.gold, 2) }
        return ("\(ms)ms", Theme.seal, 1)
    }

    private var statusSubtitle: String {
        if model.remoteAddress != nil {
            let transport = model.remoteTransport.isEmpty ? "九州云服" : model.remoteTransport
            let rttPart = model.remoteRTTMs.map { " · \($0)ms" } ?? ""
            return "当前云端推流：\(transport)\(rttPart)"
        }
        if model.remoteReconnecting {
            return "正在尝试连接云服线路…"
        }
        return "当前：本机 Apple Silicon 0ms 推演（最流畅 · 零网络抖动）"
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 14) {
                SheetHeader(title: "算力引擎与推流线路", subtitle: statusSubtitle, seal: "算")

                // v10.0.0 本机 Apple Silicon 0ms 推荐卡（置于所有公网线路之上）
                Group2 {
                    HStack(alignment: .center, spacing: 10) {
                        OnlineSignalBars(bars: 3, activeColor: Theme.jade)
                            .frame(width: Theme.Layout.iconGutter, alignment: .center)
                        VStack(alignment: .leading, spacing: 3) {
                            HStack(spacing: 6) {
                                Text("本机 Apple Silicon 原生演算")
                                    .font(Theme.serif(14.5))
                                    .foregroundStyle(model.remoteAddress == nil ? Theme.jade : Theme.ink)
                                PaperTag(text: "0ms 推荐", color: Theme.jade, size: 10)
                            }
                            Text("纯本机零延迟 · 无 3Mbps 带宽瓶颈 · 滑屏推演最丝滑")
                                .font(Theme.sans(11.5))
                                .foregroundStyle(Theme.ink2)
                                .lineLimit(2)
                        }
                        Spacer(minLength: 6)
                        if model.remoteAddress == nil {
                            Text("当前引擎")
                                .font(Theme.caption)
                                .foregroundStyle(Theme.jade)
                                .frame(width: 68, height: 28)
                                .background(Theme.jade.opacity(0.10), in: RoundedRectangle(cornerRadius: 6, style: .continuous))
                                .overlay(RoundedRectangle(cornerRadius: 6, style: .continuous).stroke(Theme.jade.opacity(0.32), lineWidth: 0.7))
                        } else {
                            Button {
                                GameFeel.shared.tap()
                                model.switchToOfflineLocal()
                                say("已切回本机 Apple Silicon 0ms 原生演算")
                                onClose()
                            } label: {
                                Text("切回本机")
                                    .font(Theme.caption)
                                    .foregroundStyle(Theme.paperLight)
                                    .frame(width: 68, height: 28)
                                    .background(Theme.jade, in: RoundedRectangle(cornerRadius: 6, style: .continuous))
                            }
                            .buttonStyle(PressStyle())
                        }
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 12)
                }
                .padding(.horizontal, Theme.Layout.pageInset)

                // 顶部快捷竞速与云服切换指令
                HStack(spacing: 8) {
                    EditorialTactileButton(
                        title: model.probingRoutes ? "正在全线测速…" : "可选：测速并连最快云服",
                        icon: .lightning,
                        accent: true,
                        solid: false,
                        compact: true,
                        fullWidth: true,
                        disabled: model.probingRoutes
                    ) {
                        Task {
                            await model.probeAllRoutes()
                            model.reconnectFastestRoute()
                            say("已完成全线测速并尝试接入最优云服")
                        }
                    }
                }
                .padding(.horizontal, Theme.Layout.pageInset)

                HStack {
                    SectionLabel("全部推流专线（\(model.computeRoutes.count) 线）", inset: false)
                        .monospacedDigit()
                    Spacer()
                    if model.probingRoutes {
                        HStack(spacing: 5) {
                            InkBusy().frame(width: 32)
                            Text("测速中").font(Theme.caption).foregroundStyle(Theme.ink2)
                        }
                    }
                }
                .padding(.horizontal, Theme.Layout.sectionInset)

                Group2 {
                    if model.computeRoutes.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            InkBusy(text: "正在探测全部云服推流线路……")
                        }
                        .padding(14)
                    } else {
                        ForEach(Array(model.computeRoutes.enumerated()), id: \.element.id) { idx, route in
                            let st = rttStyle(route.rttMs)
                            let isCurrent = route.active && model.remoteAddress != nil
                            let isBusy = switchingId == route.id
                            HStack(alignment: .center, spacing: 10) {
                                VStack(spacing: 3) {
                                    OnlineSignalBars(bars: st.bars, activeColor: st.color)
                                }
                                .frame(width: Theme.Layout.iconGutter, alignment: .center)

                                VStack(alignment: .leading, spacing: 3) {
                                    HStack(spacing: 6) {
                                        Text(route.name)
                                            .font(Theme.serif(14.5))
                                            .foregroundStyle(isCurrent ? Theme.seal : Theme.ink)
                                            .lineLimit(1)
                                            .minimumScaleFactor(0.8)
                                        if !route.tag.isEmpty {
                                            PaperTag(text: route.tag, color: isCurrent ? Theme.seal : Theme.ink2, size: 10)
                                        }
                                    }
                                    Text(route.address)
                                        .font(Theme.sans(11.5))
                                        .foregroundStyle(Theme.ink2)
                                        .monospacedDigit()
                                        .lineLimit(1)
                                        .minimumScaleFactor(0.75)
                                }

                                Spacer(minLength: 6)

                                Text(st.text)
                                    .font(Theme.label)
                                    .foregroundStyle(st.color)
                                    .monospacedDigit()
                                    .lineLimit(1)
                                    .frame(minWidth: 46, alignment: .trailing)

                                if isCurrent {
                                    Text("当前线路")
                                        .font(Theme.caption)
                                        .foregroundStyle(Theme.jade)
                                        .lineLimit(1)
                                        .frame(width: 68, height: 28)
                                        .background(Theme.jade.opacity(0.10), in: RoundedRectangle(cornerRadius: 6, style: .continuous))
                                        .overlay(RoundedRectangle(cornerRadius: 6, style: .continuous).stroke(Theme.jade.opacity(0.32), lineWidth: 0.7))
                                } else {
                                    Button {
                                        guard switchingId == nil else { return }
                                        GameFeel.shared.tap()
                                        switchingId = route.id
                                        Task {
                                            await model.switchComputeRoute(route.id)
                                            switchingId = nil
                                            say("已切换至「\(route.name)」")
                                        }
                                    } label: {
                                        Text(isBusy ? "连接中" : "切换此线")
                                            .font(Theme.caption)
                                            .foregroundStyle(Theme.paperLight)
                                            .lineLimit(1)
                                            .frame(width: 68, height: 28)
                                            .background(Theme.seal.opacity(isBusy ? 0.6 : 1), in: RoundedRectangle(cornerRadius: 6, style: .continuous))
                                    }
                                    .buttonStyle(PressStyle())
                                    .disabled(switchingId != nil)
                                }
                            }
                            .padding(.horizontal, 14)
                            .padding(.vertical, 11)
                            if idx < model.computeRoutes.count - 1 { Divider2() }
                        }
                    }
                }
                .padding(.horizontal, Theme.Layout.pageInset)

                HStack(spacing: 10) {
                    if model.remoteAddress != nil {
                        EditorialTactileButton(title: "暂切离线单机", icon: .computer, compact: true, fullWidth: true) {
                            model.switchToOfflineLocal()
                            say("已暂切本机离线演算，随时可点顶栏重连")
                            onClose()
                        }
                    }
                    EditorialTactileButton(title: "关闭", icon: .close, compact: true, fullWidth: model.remoteAddress == nil) {
                        onClose()
                    }
                }
                .padding(.horizontal, Theme.Layout.pageInset)
            }
            .padding(.bottom, 26)
        }
        .task {
            if model.computeRoutes.isEmpty || model.computeRoutes.allSatisfy({ $0.rttMs == nil }) {
                await model.probeAllRoutes()
            }
        }
    }
}

/// 真·网游非阻塞浮动自动重连横幅（4.3 宋版双线宣纸卡片 + 脉动朱砂印点 + 立即重连 / 离线单机）。
private struct GameReconnectBanner: View {
    @ObservedObject var model: GameModel
    let leadInset: CGFloat
    let trailInset: CGFloat
    let say: (String) -> Void
    @State private var pulse = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var attemptNumber: Int { max(1, model.remoteReconnectAttempt) }

    var body: some View {
        HStack(spacing: 0) {
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .center, spacing: 10) {
                    statusHeader
                    Spacer(minLength: 8)
                    actionButtons
                }
                VStack(alignment: .leading, spacing: 8) {
                    statusHeader
                    HStack {
                        Spacer(minLength: 0)
                        actionButtons
                    }
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 9)
            .frame(maxWidth: 468, alignment: .leading)
            .background(Theme.paperLight.opacity(0.97), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .strokeBorder(Theme.seal.opacity(0.40), lineWidth: 0.85)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 9.5, style: .continuous)
                    .strokeBorder(Theme.seal.opacity(0.14), lineWidth: 0.5)
                    .padding(2.5)
                    .allowsHitTesting(false)
            )
            .shadow(color: Theme.ink.opacity(0.10), radius: 6, y: 2)
            Spacer(minLength: 0)
        }
        .padding(.leading, leadInset)
        .padding(.trailing, trailInset)
        .onAppear {
            guard !reduceMotion else { return }
            withAnimation(.easeInOut(duration: 1.15).repeatForever(autoreverses: true)) {
                pulse = true
            }
        }
        .onDisappear { pulse = false }
    }

    private var statusHeader: some View {
        HStack(alignment: .center, spacing: 9) {
            ZStack {
                Circle()
                    .fill(Theme.seal.opacity(pulse && !reduceMotion ? 0.14 : 0.30))
                    .frame(width: 14, height: 14)
                    .scaleEffect(pulse && !reduceMotion ? 1.38 : 0.88)
                Circle()
                    .fill(Theme.seal)
                    .frame(width: 6.5, height: 6.5)
            }
            .frame(width: 16, height: 16)
            .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 2) {
                Text("九州云服自动重连中 · 第 \(attemptNumber) 次")
                    .font(Theme.serif(13.5))
                    .foregroundStyle(Theme.ink)
                    .monospacedDigit()
                    .lineLimit(1)
                    .minimumScaleFactor(0.84)
                Text("世界进度已安全托管云端，切回即续推")
                    .font(Theme.sans(11))
                    .foregroundStyle(Theme.ink2)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
        }
    }

    private var actionButtons: some View {
        HStack(spacing: 6) {
            Button {
                GameFeel.shared.tap()
                model.reconnectCloudNow()
                say("正在立即重连九州云服…")
            } label: {
                Text("立即重连")
                    .font(Theme.sans(11.5))
                    .foregroundStyle(Theme.paperLight)
                    .padding(.horizontal, 10)
                    .frame(height: 27)
                    .background(Theme.seal, in: Capsule())
            }
            .buttonStyle(PressStyle())

            Button {
                GameFeel.shared.tap()
                model.switchToOfflineLocal()
                say("已暂切离线单机，可随时轻点上方重连云服")
            } label: {
                Text("离线单机")
                    .font(Theme.sans(11.5))
                    .foregroundStyle(Theme.ink2)
                    .padding(.horizontal, 9)
                    .frame(height: 27)
                    .background(Theme.wash.opacity(0.82), in: Capsule())
                    .overlay(Capsule().strokeBorder(Theme.line, lineWidth: 0.7))
            }
            .buttonStyle(PressStyle())
        }
        .fixedSize(horizontal: true, vertical: false)
    }
}

private struct GameSeasonBadge: View {
    let month: Int
    let tight: Bool
    var body: some View {
        let s = WorldSeason.of(month: month)
        Text(s.name)
            .font(Theme.sans(11))
            .foregroundStyle(Theme.ink2)
            .fixedSize(horizontal: true, vertical: false)
            .padding(.horizontal, tight ? 5 : 6).padding(.vertical, 1.5)
            .background(Theme.paper, in: RoundedRectangle(cornerRadius: 4, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 4, style: .continuous).stroke(Theme.hairline, lineWidth: 0.7))
            .animation(Motion.fade, value: s.rawValue)
    }
}

private struct GameToolDivider: View {
    var body: some View {
        Rectangle().fill(Theme.ink.opacity(0.11)).frame(width: 0.65, height: 14)
    }
}

private struct GameTopToolButton: View {
    let glyph: InkGlyph
    let active: Bool
    let landscape: Bool
    let width: CGFloat
    let height: CGFloat
    let action: () -> Void
    var body: some View {
        Button {
            GameFeel.shared.tap()
            action()
        } label: {
            InkIcon(glyph: glyph, size: landscape ? 16 : 17.5, weight: active ? 2.0 : 1.7, filled: active,
                    accent: active ? Theme.seal.opacity(0.28) : nil)
                .foregroundStyle(active ? Theme.seal : Theme.ink)
                .frame(width: width, height: height)
                .contentShape(Rectangle())
        }
        .buttonStyle(PressStyle())
    }
}

private struct GameWeatherOverflowBar: View {
    @ObservedObject var model: GameModel
    @ObservedObject var controller: MapController
    @Binding var weatherDrawerOpen: Bool
    let say: (String) -> Void

    private var sortedZones: [GameState.WeatherZone] {
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

    var body: some View {
        let sorted = sortedZones
        if let top = sorted.first {
            let meta = weatherMeta(top.kind)
            VStack(alignment: .leading, spacing: 5) {
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

                if weatherDrawerOpen && sorted.count > 1 {
                    VStack(alignment: .leading, spacing: 4) {
                        ForEach(Array(sorted.prefix(6).enumerated()), id: \.offset) { _, z in
                            let zm = weatherMeta(z.kind)
                            let pname = model.map.flatMap { $0.meta.provinces.indices.contains(z.province) ? $0.meta.provinces[z.province].name : nil } ?? "州郡"
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
            .animation(GameView.hudSpring, value: weatherDrawerOpen)
        }
    }
}

private struct GameActionBanners: View {
    @ObservedObject var model: GameModel
    @ObservedObject var controller: MapController
    let barHeight: CGFloat
    let leadInset: CGFloat
    let trailInset: CGFloat
    let marchRetreat: Bool
    @Binding var rtsDefend: Bool
    let say: (String) -> Void

    var body: some View {
        VStack(spacing: 6) {
            if controller.marchingArmy != nil {
                GameMarchBanner(model: model, controller: controller, barHeight: barHeight, retreat: marchRetreat)
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
            if controller.marchingFleet != nil {
                GameFleetBanner(model: model, controller: controller, barHeight: barHeight)
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
            if controller.paintNation != nil {
                GamePaintBanner(model: model, controller: controller)
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
            if let prompt = controller.pickPrompt {
                GamePickPromptBanner(controller: controller, prompt: prompt, barHeight: barHeight)
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
            if !controller.groupArmies.isEmpty {
                GameRtsBanner(model: model, controller: controller, barHeight: barHeight, rtsDefend: $rtsDefend, say: say)
                    .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .padding(.leading, leadInset)
        .padding(.trailing, trailInset)
        .animation(Motion.panel, value: controller.marchingArmy)
        .animation(Motion.panel, value: controller.marchingFleet)
        .animation(Motion.panel, value: controller.paintNation)
        .animation(Motion.panel, value: controller.pickPrompt)
        .animation(Motion.panel, value: controller.groupArmies.count)
    }
}

private struct GameMarchBanner: View {
    @ObservedObject var model: GameModel
    @ObservedObject var controller: MapController
    let barHeight: CGFloat
    let retreat: Bool
    var body: some View {
        HStack(spacing: 8) {
            InkIcon(glyph: .march, size: 15, weight: 1.75).foregroundStyle(Theme.seal)
            Text(retreat ? "撤退：点选目的地" : "调兵：点选目的地").font(Theme.kai(13.5)).foregroundStyle(Theme.ink).lineLimit(1)
            Button("取消") {
                controller.marchingArmy = nil
                controller.selectedArmy = nil
                model.refreshArmies()
            }
            .font(Theme.kai(13.5)).foregroundStyle(Theme.seal).fixedSize()
        }
        .padding(.horizontal, 14).frame(height: barHeight).glass(Capsule())
    }
}

private struct GameFleetBanner: View {
    @ObservedObject var model: GameModel
    @ObservedObject var controller: MapController
    let barHeight: CGFloat
    var body: some View {
        HStack(spacing: 8) {
            InkIcon(glyph: .anchor, size: 15, weight: 1.75).foregroundStyle(Theme.seal)
            Text("舰队：点选目标海港").font(Theme.kai(13.5)).foregroundStyle(Theme.ink).lineLimit(1)
            Button("取消") {
                controller.marchingFleet = nil
                model.refreshArmies()
            }
            .font(Theme.kai(13.5)).foregroundStyle(Theme.seal).fixedSize()
        }
        .padding(.horizontal, 14).frame(height: barHeight).glass(Capsule())
    }
}

private struct GamePaintBanner: View {
    @ObservedObject var model: GameModel
    @ObservedObject var controller: MapController
    var body: some View {
        let n = controller.paintNation ?? -1
        let nation = model.map.flatMap { $0.meta.nations.indices.contains(n) ? $0.meta.nations[n] : nil }
        VStack(spacing: 6) {
            HStack(spacing: 8) {
                RoundedRectangle(cornerRadius: 4, style: .continuous)
                    .fill(nation.map { Names.color($0.color) } ?? Theme.ink2)
                    .frame(width: 13, height: 13)
                Text(controller.brushName ?? (controller.placingArmy ? "点按或划过州郡放置" : "绘制\(nation?.name ?? "")疆域"))
                    .font(Theme.kai(13.5)).foregroundStyle(Theme.ink).lineLimit(1).minimumScaleFactor(0.75)
                Button("完成") {
                    controller.paintNation = nil
                    controller.placingArmy = false
                    controller.placeCount = 1
                    controller.brushName = nil
                    controller.brushAction = nil
                }
                .font(Theme.kai(13.5)).foregroundStyle(Theme.seal).fixedSize()
            }
            if controller.placingArmy {
                HStack(spacing: 8) {
                    InkIcon(glyph: .military, size: 15, weight: 1.75).foregroundStyle(Theme.seal)
                    PaperTrack(value: Binding(get: { Double(controller.placeCount) }, set: { v in
                        let k = Int(v.rounded())
                        if k != controller.placeCount { controller.placeCount = k; GameFeel.shared.tap() }
                    }), range: 1...30, step: 1, onEditingChanged: nil)
                    Text("\(controller.placeCount) 军")
                        .font(Theme.kai(13)).foregroundStyle(Theme.ink).monospacedDigit()
                        .frame(width: 44, alignment: .trailing).contentTransition(.numericText())
                }
                .frame(maxWidth: 260)
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 8).glass(RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}

private struct GamePickPromptBanner: View {
    @ObservedObject var controller: MapController
    let prompt: String
    let barHeight: CGFloat
    var body: some View {
        HStack(spacing: 10) {
            InkIcon(glyph: .locate, size: 15, weight: 1.8).foregroundStyle(Theme.seal)
            Text(prompt).font(Theme.body).foregroundStyle(Theme.ink).lineLimit(1).minimumScaleFactor(0.72)
            Button("取消") {
                controller.pickPrompt = nil
                controller.onPick = nil
                if controller.onTerrainStrokeEnd != nil && controller.brushName == nil && controller.terrainBrush {
                    controller.terrainBrush = false
                    controller.onTerrainStroke = nil
                    controller.onTerrainStrokeEnd = nil
                }
            }
            .font(Theme.body).foregroundStyle(Theme.seal)
        }
        .padding(.horizontal, 14).frame(height: barHeight).glass(Capsule())
    }
}

private struct GameRtsBanner: View {
    @ObservedObject var model: GameModel
    @ObservedObject var controller: MapController
    let barHeight: CGFloat
    @Binding var rtsDefend: Bool
    let say: (String) -> Void
    var body: some View {
        HStack(spacing: 8) {
            Text("已选\(controller.groupArmies.count)军").font(Theme.kai(13)).foregroundStyle(Theme.ink).monospacedDigit().lineLimit(1).minimumScaleFactor(0.75)
            HStack(spacing: 0) {
                ForEach([false, true], id: \.self) { defend in
                    Button { withAnimation(Motion.tap) { rtsDefend = defend } } label: {
                        Text(defend ? "防御" : "进攻")
                            .font(Theme.caption)
                            .foregroundStyle(rtsDefend == defend ? Theme.paper2 : Theme.ink)
                            .padding(.horizontal, 8).padding(.vertical, 4)
                            .background(rtsDefend == defend ? Theme.seal : Color.clear, in: Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
            .background(Theme.wash, in: Capsule())
            Button("交AI") {
                let armies = controller.groupArmies
                Task {
                    let out = await model.releaseToAI(armies: armies)
                    say(out.reason)
                    if out.ok { controller.groupArmies = [] }
                    model.refreshArmies()
                }
            }
            .font(Theme.kai(13)).foregroundStyle(Theme.jade).fixedSize()
            Button("取消") {
                controller.groupArmies = []
                model.refreshArmies()
            }
            .font(Theme.kai(13)).foregroundStyle(Theme.seal).fixedSize()
        }
        .padding(.horizontal, 12).frame(height: barHeight).glass(Capsule())
    }
}

private struct GameHeraldHost: View {
    @ObservedObject var model: GameModel
    @ObservedObject var controller: MapController
    let hudVisible: Bool
    let panelOpen: Bool
    let viewsOpen: Bool
    let leadInset: CGFloat
    let trailInset: CGFloat

    var body: some View {
        ZStack(alignment: .top) {
            if hudVisible, !panelOpen, !model.pageOpen, !viewsOpen, controller.play.showHeralds, let h = model.herald, let map = model.map {
                HeraldBanner(herald: h, map: map, playVideo: false, onTap: {
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
                })
                .id(h.id)
                .transition(.opacity.combined(with: .scale(scale: 0.95, anchor: .top)))
            }
        }
        .frame(maxWidth: .infinity, alignment: .top)
        .clipped()
        .padding(.leading, leadInset).padding(.trailing, trailInset)
        .animation(Motion.panel, value: model.herald?.id)
        .animation(GameView.hudSpring, value: hudVisible)
    }
}

private struct GameCleanMapChip: View {
    let visible: Bool
    let landscape: Bool
    let onExpand: () -> Void
    var body: some View {
        Group {
            if visible {
                Button {
                    GameFeel.shared.tap()
                    onExpand()
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
        .animation(GameView.hudSpring, value: visible)
    }
}

private struct GameTransportPill: View {
    @ObservedObject var model: GameModel
    let landscape: Bool
    private static let speedSteps = [1, 2, 4, 8, 16, 32]
    var body: some View {
        let sealSize: CGFloat = landscape ? 28 : Theme.Control.sealButtonSize
        let isUltra = model.speed >= 32
        HStack(spacing: 4) {
            Button {
                GameFeel.shared.tap()
                model.cycleSpeed()
            } label: {
                Text("\(model.speed)×")
                    .font(landscape ? Theme.kai(12.5) : Theme.kai(13.5))
                    .foregroundStyle(isUltra ? Theme.paperLight : (model.speed > 1 ? Theme.seal : Theme.ink))
                    .monospacedDigit()
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                    .frame(width: landscape ? 36 : 42, height: sealSize)
                    .background(
                        isUltra ? Theme.seal : (model.speed > 1 ? Theme.seal.opacity(0.11) : Color.clear),
                        in: Capsule()
                    )
                    .contentShape(Capsule())
                    .contentTransition(.numericText())
                    .animation(Motion.tap, value: model.speed)
            }
            .buttonStyle(PressStyle())
            .contextMenu {
                ForEach(Self.speedSteps, id: \.self) { step in
                    Button {
                        GameFeel.shared.tap()
                        model.speed = step
                    } label: {
                        Text(step == 32 ? "\(step)× 极速看海" : "\(step)× 倍速")
                    }
                }
            }
            PlaySealButton(playing: model.playing, size: sealSize) { model.togglePlay() }
                .sensoryFeedback(.impact(weight: .light), trigger: model.playing)
        }
    }
}

private struct GameBottomChrome: View {
    @ObservedObject var model: GameModel
    let landscape: Bool
    let panel: Panel?
    let hudVisible: Bool
    let hiddenByMode: Bool
    let totalWidth: CGFloat
    let leadSafe: CGFloat
    let trailSafe: CGFloat
    let tabMarker: Namespace.ID
    let show: (Panel) -> Void
    let onEntered: () -> Void

    var body: some View {
        Group {
            if landscape {
                HStack(spacing: 0) {
                    EventTicker(latest: model.state?.events.last?.text) { show(.chronicle) }
                        .frame(maxWidth: min(360, max(180, totalWidth - leadSafe - trailSafe - 16)))
                }
                .frame(maxWidth: .infinity)
                .padding(.leading, leadSafe)
                .padding(.trailing, trailSafe)
                .padding(.bottom, 4)
                .opacity(panel == nil ? 0.94 : 0)
                .allowsHitTesting(panel == nil)
            } else {
                GamePortraitBottomBar(model: model, activeTab: panel?.tab, tabMarker: tabMarker, show: show)
            }
        }
        .offset(y: hudVisible ? 0 : 96)
        .scaleEffect(hudVisible ? 1 : 0.96, anchor: .bottom)
        .opacity(hudVisible ? 1 : 0)
        .animation(GameView.hudSpring, value: hudVisible)
        .opacity(hiddenByMode ? 0 : 1)
        .allowsHitTesting(hudVisible && !hiddenByMode)
        .task {
            try? await Task.sleep(nanoseconds: 60_000_000)
            onEntered()
        }
    }
}

private struct GamePortraitBottomBar: View {
    @ObservedObject var model: GameModel
    let activeTab: String?
    let tabMarker: Namespace.ID
    let show: (Panel) -> Void

    var body: some View {
        VStack(spacing: Theme.Control.gap) {
            EventTicker(latest: model.state?.events.last?.text) { show(.chronicle) }
            HStack(spacing: Theme.Control.gap) {
                HStack(spacing: 0) {
                    TabButton(symbol: "building.columns", title: "国家", glyph: .nation, active: activeTab == "nations", marker: tabMarker, flexible: true, compact: false) { show(.nations) }
                    TabButton(symbol: "shield", title: "军事", glyph: .military, active: activeTab == "military", marker: tabMarker, flexible: true, compact: false) { show(.military) }
                    TabButton(symbol: "scroll", title: "外交", glyph: .diplomacy, active: activeTab == "diplomacy", marker: tabMarker, flexible: true, compact: false) { show(.diplomacy) }
                    TabButton(symbol: "book", title: "纪事", glyph: .chronicle, active: activeTab == "chronicle", marker: tabMarker, flexible: true, compact: false) { show(.chronicle) }
                    TabButton(symbol: "chart.bar.xaxis", title: "排行", glyph: .ranking, active: activeTab == "statistics", marker: tabMarker, flexible: true, compact: false) { show(.statistics) }
                }
                .animation(Motion.tap, value: activeTab)
                .padding(.horizontal, 6)
                .frame(maxWidth: .infinity)
                .frame(height: Theme.Control.dockHeight)
                .glass(Capsule())

                GameTransportPill(model: model, landscape: false)
                    .padding(.horizontal, 5)
                    .frame(height: Theme.Control.dockHeight)
                    .glass(Capsule())
            }
        }
        .padding(.horizontal, 12).padding(.bottom, 6)
    }
}

private struct GameLandscapeRail: View {
    let activeTab: String?
    let hudVisible: Bool
    let hiddenByMode: Bool
    let show: (Panel) -> Void

    private static let items: [(id: String, glyph: InkGlyph, panel: Panel)] = [
        ("nations", .nation, .nations),
        ("military", .military, .military),
        ("diplomacy", .diplomacy, .diplomacy),
        ("chronicle", .chronicle, .chronicle),
        ("statistics", .ranking, .statistics)
    ]

    var body: some View {
        VStack(spacing: 4) {
            ForEach(Self.items, id: \.id) { item in
                let active = activeTab == item.id
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
        .animation(Motion.tap, value: activeTab)
        .offset(x: hudVisible ? 0 : -76)
        .scaleEffect(hudVisible ? 1 : 0.94, anchor: .leading)
        .opacity(hudVisible ? 1 : 0)
        .animation(GameView.hudSpring, value: hudVisible)
        .opacity(hiddenByMode ? 0 : 1)
        .allowsHitTesting(hudVisible && !hiddenByMode)
    }
}

private struct GameWallpaperOverlay: View {
    let onDismiss: () -> Void
    var body: some View {
        Color.clear.contentShape(Rectangle()).ignoresSafeArea()
            .onTapGesture { onDismiss() }
            .overlay(alignment: .bottom) {
                Text("轻点返回").font(Theme.label).foregroundStyle(Theme.paper2.opacity(0.7)).padding(.bottom, 30)
            }
    }
}

private struct GameLegendOverlay: View {
    @ObservedObject var model: GameModel
    let landscape: Bool
    let leadSafe: CGFloat
    let hudVisible: Bool
    let hiddenByMode: Bool
    let openAlliance: (MapViewData.Entry) -> Void

    var body: some View {
        Group {
            if !model.viewLegend.isEmpty && !hiddenByMode {
                MapViewLegend(
                    mode: model.mapView,
                    legend: model.viewLegend,
                    spotlightColor: model.legendSpotlightColor,
                    onSpotlight: { model.toggleLegendSpotlight($0) },
                    open: openAlliance
                )
                .padding(.leading, leadSafe)
                .padding(.bottom, landscape ? 40 : (model.state?.events.isEmpty == false ? 118 : 76))
                .offset(x: hudVisible ? 0 : -140)
                .opacity(hudVisible ? 1 : 0)
                .allowsHitTesting(hudVisible)
                .animation(GameView.hudSpring, value: hudVisible)
                .transition(.asymmetric(insertion: .scale(scale: 0.72, anchor: .bottomLeading).combined(with: .opacity), removal: .opacity))
            }
        }
        .animation(Motion.panel, value: model.viewLegend)
    }
}

private struct GameViewSwitcherOverlay: View {
    @ObservedObject var model: GameModel
    @Binding var viewsOpen: Bool
    let landscape: Bool
    let barHeight: CGFloat
    let trailSafe: CGFloat
    let hideSwitcher: Bool

    var body: some View {
        ZStack(alignment: .topTrailing) {
            if viewsOpen && !hideSwitcher {
                Color.black.opacity(0.001)
                    .ignoresSafeArea()
                    .onTapGesture { withAnimation(Motion.panel) { viewsOpen = false } }
            }
            MapViewSwitcher(mode: $model.mapView, open: $viewsOpen)
                .opacity(hideSwitcher ? 0 : 1)
                .allowsHitTesting(viewsOpen && !hideSwitcher)
                .padding(.top, barHeight + (landscape ? 10 : 12))
                .padding(.trailing, trailSafe)
                .animation(Motion.panel, value: trailSafe)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topTrailing)
    }
}

private struct GameToastOverlay: View {
    let toast: String?
    let toastSerial: Int
    let landscape: Bool
    let hasPanel: Bool
    let panelWidth: CGFloat
    let onDismiss: () -> Void

    var body: some View {
        if let toast {
            HStack(spacing: 10) {
                ArtEmblem(image: BundleArt.heraldEdict, size: 20, fallback: .edict)
                Text(toast)
                    .font(Theme.body)
                    .foregroundStyle(Theme.ink)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.leading, 10).padding(.trailing, 16).padding(.vertical, 9)
            .glass(RoundedRectangle(cornerRadius: Theme.Control.cornerCard, style: .continuous))
            .padding(.leading, landscape ? 64 : 20)
            .padding(.trailing, landscape && hasPanel ? (panelWidth + 18) : 20)
            .padding(.bottom, landscape ? 48 : 114)
            .id(toastSerial)
            .transition(.asymmetric(
                insertion: .move(edge: .bottom).combined(with: .opacity).combined(with: .scale(scale: 0.94, anchor: .bottom)),
                removal: .opacity.combined(with: .offset(y: -10))
            ))
            .onTapGesture { onDismiss() }
            .zIndex(120)
        }
    }
}

// MARK: - Modular Panel Hosting & Routing

private struct GamePanelBackRow: View {
    let last: Panel?
    let current: Panel
    let isSidePanel: Bool
    let onBack: () -> Void
    let onClose: () -> Void

    var body: some View {
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
                        onBack()
                    } label: {
                        HStack(spacing: 4) {
                            PhosphorIcon(glyph: .chevronLeft, size: 12, weight: .light)
                            Text("返回" + last.title).font(Theme.sans(13.5)).lineLimit(1)
                        }
                        .foregroundStyle(Theme.ink)
                        .padding(.horizontal, 11).frame(height: 30)
                        .background(Theme.paperLight, in: RoundedRectangle(cornerRadius: 6, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 6, style: .continuous).stroke(Theme.line, lineWidth: 0.9))
                        .shadow(color: Theme.ink.opacity(0.06), radius: 0, y: 1)
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
                    CardCloseButton { onClose() }
                }
            }
            .padding(.horizontal, 14)
            .frame(height: isSidePanel ? 42 : 36)
            .padding(.bottom, isSidePanel ? 0 : 4)
            Rectangle().fill(Theme.ink.opacity(0.11)).frame(height: 0.75)
        }
    }
}

private struct GameSidePanelOverlay: View {
    @ObservedObject var model: GameModel
    @ObservedObject var controller: MapController
    let landscape: Bool
    let panel: Panel?
    let panelWidth: CGFloat
    let lastTrail: Panel?
    let backward: Bool
    let actions: GamePanelActions

    var body: some View {
        if landscape, let panel {
            let shape = RoundedRectangle(cornerRadius: 22, style: .continuous)
            let hasBack = lastTrail != nil
            HStack(spacing: 0) {
                Spacer(minLength: 0)
                VStack(spacing: 0) {
                    if let lastTrail {
                        GamePanelBackRow(last: lastTrail, current: panel, isSidePanel: true, onBack: actions.back, onClose: actions.closePage)
                    }
                    ZStack(alignment: .top) {
                        GamePanelRouter(model: model, controller: controller, panel: panel, actions: actions)
                            .id(panel.id)
                            .environment(\.inSidePanel, true)
                            .environment(\.hasBackBar, hasBack)
                            .environment(\.sidePanelClose, actions.closePage)
                            .transition(.asymmetric(
                                insertion: .move(edge: backward ? .leading : .trailing).combined(with: .opacity),
                                removal: .move(edge: backward ? .trailing : .leading).combined(with: .opacity)
                            ))
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
                    .clipped()
                }
                .font(Theme.section)
                .frame(width: panelWidth)
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
}

private struct GamePortraitSheetHost: View {
    @ObservedObject var model: GameModel
    @ObservedObject var controller: MapController
    let active: Panel
    let lastTrail: Panel?
    let backward: Bool
    @Binding var sheetDetent: PresentationDetent
    let actions: GamePanelActions

    var body: some View {
        let hasBack = lastTrail != nil
        VStack(spacing: 0) {
            SheetTopSafeClearance()
            if let lastTrail {
                GamePanelBackRow(last: lastTrail, current: active, isSidePanel: false, onBack: actions.back, onClose: actions.closePage)
            }
            ZStack(alignment: .top) {
                GamePanelRouter(model: model, controller: controller, panel: active, actions: actions)
                    .id(active.id)
                    .environment(\.inSidePanel, false)
                    .environment(\.hasBackBar, hasBack)
                    .transition(.asymmetric(
                        insertion: .opacity.combined(with: .offset(x: backward ? -24 : 24)),
                        removal: .opacity.combined(with: .offset(x: backward ? 24 : -24))
                    ))
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
            .clipped()
        }
        .animation(Motion.sheetSwap, value: active.id)
        .simultaneousGesture(
            DragGesture(minimumDistance: 28)
                .onEnded { v in
                    if hasBack && v.startLocation.x < 44 && v.translation.width > 72 && abs(v.translation.height) < 70 {
                        GameFeel.shared.scrollOpen()
                        actions.back()
                    }
                }
        )
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .presentationDetents([GameView.lowDetent, GameView.midDetent, GameView.highDetent], selection: $sheetDetent)
        .presentationBackgroundInteraction(.enabled(upThrough: GameView.midDetent))
        .presentationBackground { MemorialPaper() }
        .presentationDragIndicator(.hidden)
        .presentationCornerRadius(Theme.Control.cornerSheet)
        .font(Theme.section)
    }
}

private struct GamePanelRouter: View {
    @ObservedObject var model: GameModel
    @ObservedObject var controller: MapController
    let panel: Panel
    let actions: GamePanelActions

    var body: some View {
        switch panel {
        case .quick, .province, .army, .fleet, .nation, .people, .nationWars, .nationTalks:
            GameEntityPanelRouter(model: model, controller: controller, panel: panel, actions: actions)
        case .editor, .edicts, .statistics, .nations, .military, .diplomacy, .chronicle, .menu:
            GameWorldPanelRouter(model: model, controller: controller, panel: panel, actions: actions)
        }
    }
}

private struct GameEntityPanelRouter: View {
    @ObservedObject var model: GameModel
    @ObservedObject var controller: MapController
    let panel: Panel
    let actions: GamePanelActions

    var body: some View {
        switch panel {
        case .quick(let p):
            ProvinceQuickSheet(
                model: model,
                province: p,
                openProvince: { actions.open(.province(p)) },
                openNation: { n in actions.open(.nation(n)) },
                openArmy: { a in actions.open(.army(a)) },
                close: actions.closePage
            )
        case .province(let p):
            ProvinceSheet(
                model: model,
                province: p,
                openNation: { n in actions.open(.nation(n)) },
                openArmy: { a in
                    controller.selectedArmyId = model.army(a)?.id
                    controller.selectedArmy = a
                    actions.open(.army(a))
                    actions.locateArmy(a)
                }
            )
        case .army(let a):
            ArmySheet(
                model: model,
                army: a,
                armyId: controller.selectedArmyId,
                say: actions.say,
                locate: { actions.locateArmy(a) },
                onMarch: { actions.orderMarch(a, false) },
                onHalt: {
                    let targetIdx = model.resolveArmy(id: controller.selectedArmyId, fallback: a)?.index ?? a
                    Task { if let e = await model.order(army: targetIdx, to: nil) { actions.say(e) } }
                },
                onRetreat: { actions.orderMarch(a, true) },
                onClose: actions.closePage
            )
        case .fleet(let f):
            FleetSheet(
                model: model,
                fleet: f,
                fleetId: controller.selectedFleetId,
                pickOnMap: { actions.orderFleet(f) },
                onClose: actions.closePage
            )
        case .nation(let n):
            NationSheet(
                model: model,
                nation: n,
                say: actions.say,
                fly: { controller.fly(to: $0) },
                flyNation: { controller.fly(toNation: $0) },
                lower: actions.lowerSheet,
                paint: actions.paintNation,
                placeArmy: actions.placeArmy,
                pickProvince: { prompt, done in actions.pickProvince(n, prompt, done) },
                openArmy: { a in
                    controller.selectedArmyId = model.army(a)?.id
                    controller.selectedArmy = a
                    actions.open(.army(a))
                },
                openFleet: { fid in
                    if let idx = model.state?.fleets?.firstIndex(where: { $0.id == fid }) {
                        controller.selectedFleetId = fid
                        controller.selectedFleet = idx
                        actions.open(.fleet(idx))
                        if let fl = model.fleet(idx), fl.x.isFinite, fl.y.isFinite {
                            controller.fly(x: Double(fl.x), y: Double(fl.y))
                        }
                    }
                },
                openPeople: { actions.open(.people(n)) },
                openWars: { actions.open(.nationWars(n)) },
                openTalks: { actions.open(.nationTalks(n)) },
                openReplay: { actions.requestReplay(nil) }
            )
        case .people(let n):
            NationSheet(model: model, nation: n, say: actions.say, fly: { controller.fly(to: $0) }, focus: .people)
        case .nationWars(let n):
            NationSheet(model: model, nation: n, say: actions.say, fly: { controller.fly(to: $0) }, focus: .wars)
        case .nationTalks(let n):
            NationSheet(model: model, nation: n, say: actions.say, fly: { controller.fly(to: $0) }, focus: .talks)
        default:
            EmptyView()
        }
    }
}

private struct GameWorldPanelRouter: View {
    @ObservedObject var model: GameModel
    @ObservedObject var controller: MapController
    let panel: Panel
    let actions: GamePanelActions

    var body: some View {
        switch panel {
        case .editor:
            WorldEditorSheet(model: model, close: actions.closePage, takeShot: actions.mapShot)
        case .edicts:
            EdictSheet(model: model, say: actions.say)
        case .statistics:
            StatisticsSheet(model: model) { n in actions.open(.nation(n)) }
        case .nations:
            NationsSheet(model: model) { n in actions.open(.nation(n)) }
        case .military:
            MilitarySheet(
                model: model,
                select: { army in
                    controller.selectedArmyId = model.army(army)?.id
                    actions.open(.army(army))
                    controller.selectedArmy = army
                    actions.locateArmy(army)
                },
                selectFleet: { fleet in
                    controller.selectedFleetId = model.fleet(fleet)?.id
                    actions.open(.fleet(fleet))
                    controller.selectedFleet = fleet
                    if let f = model.fleet(fleet), f.x.isFinite, f.y.isFinite {
                        controller.fly(x: Double(f.x), y: Double(f.y))
                    }
                },
                flyTo: { x, y in if x.isFinite && y.isFinite { controller.fly(x: x, y: y) } },
                openNation: { n in actions.open(.nation(n)) }
            )
        case .diplomacy:
            DiplomacySheet(
                model: model,
                say: actions.say,
                fly: { n in
                    if let map = model.map, map.meta.nations.indices.contains(n),
                       map.meta.cities.indices.contains(map.meta.nations[n].capital) {
                        let c = map.meta.cities[map.meta.nations[n].capital]
                        controller.showPlace(x: Double(c.x), y: Double(c.y))
                    }
                },
                openNation: { n in actions.open(.nation(n)) },
                openWars: { MilitarySheet.openOn = "wars"; actions.open(.military) },
                openChronicle: { n in ChronicleSheet.openNation = n; actions.open(.chronicle) }
            )
        case .chronicle:
            ChronicleSheet(model: model, fly: { controller.fly(to: $0) }, openReplay: { targetDay in
                actions.requestReplay(targetDay)
            })
        case .menu:
            MenuSheet(
                model: model,
                controller: controller,
                openEdicts: { actions.open(.edicts) },
                openEditor: { actions.open(.editor) },
                wallpaper: actions.enterWallpaper,
                say: actions.say,
                close: actions.closePage
            )
        default:
            EmptyView()
        }
    }
}

// MARK: - Split Lifecycle & Selection Modifiers (keeps GameView.Body shallow)

private struct GameLifecycleModifier: ViewModifier {
    @ObservedObject var model: GameModel
    @ObservedObject var controller: MapController
    let landscape: Bool
    @Binding var panel: Panel?
    @Binding var lastPanel: Panel?
    @Binding var viewsOpen: Bool
    @Binding var weatherDrawerOpen: Bool
    @Binding var sheetDetent: PresentationDetent
    @Binding var pausedByPanel: Bool
    @Binding var ripple: CGPoint?
    @Binding var marchRetreat: Bool
    @Binding var rtsDefend: Bool
    let show: (Panel) -> Void
    let say: (String) -> Void
    let exitCleanMap: () -> Void
    let syncSheetFocusInsets: (Panel?) -> Void

    @State private var rippleTask: Task<Void, Never>?

    func body(content: Content) -> some View {
        content
            .onAppear { installMapHandlers() }
            .onDisappear { teardownMapHandlers() }
            .onChange(of: panel) { _, p in handlePanelChange(p) }
            .onChange(of: sheetDetent) { _, _ in syncSheetFocusInsets(panel) }
            .onChange(of: landscape) { _, _ in syncSheetFocusInsets(panel) }
            .onChange(of: viewsOpen) { _, open in if open { model.dismissHerald() } }
            .onChange(of: weatherDrawerOpen) { _, open in if open { model.dismissHerald() } }
            .onChange(of: model.replayActive) { _, active in if active { model.dismissHerald() } }
            .sensoryFeedback(.impact(weight: .light), trigger: panel?.id)
    }

    private func teardownMapHandlers() {
        rippleTask?.cancel()
        rippleTask = nil
        controller.sheetOpen = false
        controller.sheetBottomFraction = 0
        controller.sheetTrailingFraction = 0
        controller.onMapTap = nil
        controller.onGroupTarget = nil
        controller.onLongPress = nil
        controller.onPaint = nil
        controller.onFleetTarget = nil
        controller.onMarchTarget = nil
    }

    private func handlePanelChange(_ p: Panel?) {
        if p != nil { exitCleanMap() }
        if let p { lastPanel = p }
        // 打开任意页面立即同步标记 pageOpen（即时止停后台传报与视频解码），不再等下一轮视图刷新。
        model.pageOpen = (p != nil)
        controller.sheetOpen = p != nil
        syncSheetFocusInsets(p)
        if controller.play.pauseOnSheet {
            if p != nil, model.playing { pausedByPanel = true; model.pause(saving: false) }
            if p == nil, pausedByPanel {
                pausedByPanel = false
                if !model.replayActive { model.play() }
            }
        } else if p == nil {
            pausedByPanel = false
        }
    }

    private func installMapHandlers() {
        CrashBreadcrumb.mark("play.hudReady")
        controller.drifting = false
        controller.onMapBrowsing = nil
        controller.onMapTap = { _ in
            if weatherDrawerOpen { withAnimation(Motion.tap) { weatherDrawerOpen = false } }
        }
        controller.onWastelandTap = {
            say("无人之地 · 剧本疆域外不可通行与占领")
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
            rippleTask?.cancel()
            rippleTask = Task { @MainActor in
                try? await Task.sleep(nanoseconds: 260_000_000)
                guard !Task.isCancelled else { return }
                ripple = nil
                show(.quick(province))
            }
        }
        controller.onPaint = { province in
            if let brush = controller.brushAction { brush(province); return }
            guard let n = controller.paintNation, model.state?.owners.indices.contains(province) == true else { return }
            if controller.placingArmy {
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
                let name = model.map.flatMap { $0.meta.provinces.indices.contains(province) ? $0.meta.provinces[province].name : nil } ?? ""
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
                else {
                    let pname = model.map.flatMap { $0.meta.provinces.indices.contains(province) ? $0.meta.provinces[province].name : nil } ?? ""
                    say("\(model.army(army)?.name ?? "军队")\(retreat ? "撤往" : "前往")\(pname)")
                    controller.marchingArmy = nil
                    marchRetreat = false
                }
                model.refreshArmies()
            }
        }
    }
}

private struct GameSelectionModifier: ViewModifier {
    @ObservedObject var model: GameModel
    @ObservedObject var controller: MapController
    @Binding var panel: Panel?
    @Binding var viewsOpen: Bool
    let show: (Panel) -> Void
    let say: (String) -> Void

    @State private var closeViewsTask: Task<Void, Never>?
    @State private var panProvinceTask: Task<Void, Never>?

    func body(content: Content) -> some View {
        content
            .onDisappear {
                closeViewsTask?.cancel()
                closeViewsTask = nil
                panProvinceTask?.cancel()
                panProvinceTask = nil
            }
            .onChange(of: controller.groupArmies) { _, _ in model.refreshArmies() }
            .onChange(of: model.notice) { _, n in if let n { say(n); model.notice = nil } }
            .onChange(of: controller.marchingFleet) { _, _ in model.refreshArmies() }
            .onChange(of: model.mapView) { _, _ in
                closeViewsTask?.cancel()
                closeViewsTask = Task { @MainActor in
                    try? await Task.sleep(nanoseconds: 280_000_000)
                    guard !Task.isCancelled else { return }
                    withAnimation { viewsOpen = false }
                }
            }
            .sensoryFeedback(.selection, trigger: model.mapView)
            .sensoryFeedback(.selection, trigger: controller.selectedProvince)
            .onChange(of: controller.selectedArmy) { _, army in
                guard !model.replayActive else { return }
                if let army {
                    if viewsOpen { viewsOpen = false }
                    show(.army(army))
                    Task { @MainActor in model.refreshArmies() }
                } else if case .army = panel {
                    panel = nil
                    Task { @MainActor in model.refreshArmies() }
                }
            }
            .onChange(of: controller.selectedFleet) { _, fleet in
                guard !model.replayActive else { return }
                if let fleet {
                    if viewsOpen { viewsOpen = false }
                    show(.fleet(fleet))
                    Task { @MainActor in model.refreshArmies() }
                } else if case .fleet = panel {
                    panel = nil
                    Task { @MainActor in model.refreshArmies() }
                }
            }
            .onChange(of: controller.selectedProvince) { _, province in
                guard !model.replayActive else { return }
                if province != nil && viewsOpen { viewsOpen = false }
                panProvinceTask?.cancel()
                panProvinceTask = nil
                if let province {
                    show(.province(province))
                    panProvinceTask = Task { @MainActor in
                        try? await Task.sleep(nanoseconds: 80_000_000)
                        guard !Task.isCancelled, controller.selectedProvince == province else { return }
                        controller.panAboveSheetIfNeeded(province: province)
                    }
                } else if case .province = panel {
                    panel = nil
                }
            }
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
