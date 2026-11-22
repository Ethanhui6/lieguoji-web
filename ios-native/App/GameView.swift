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
    /// The unit sheets' height; a pick from a list drops it low so the map shows the unit.
    @State private var unitDetent: PresentationDetent = .height(320)
    /// Nation pages stay under about 40% so the map keeps at least 60% of the screen.
    @State private var nationDetent: PresentationDetent = .fraction(0.38)
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
    private var chromeIn: Bool { controller.reveal >= 1 && entered }
    private struct ShotFile: Identifiable { let url: URL; var id: URL { url } }
    @State private var shot: ShotFile?
    init(model: GameModel) { self.model = model; _controller = ObservedObject(wrappedValue: model.controller) }

    // Split in three: as one expression the compiler cannot type-check it in reasonable time.
    private var backdrop: some View {
        ZStack {
            Color.clear
        }
        // A breath of ink at the screen's top and foot, so the floating controls settle into the map.
        .overlay {
            VStack(spacing: 0) {
                LinearGradient(colors: [Theme.ink.opacity(0.14), Theme.ink.opacity(0.05), .clear], startPoint: .top, endPoint: .bottom).frame(height: 140)
                Spacer()
                LinearGradient(colors: [.clear, Theme.ink.opacity(0.05), Theme.ink.opacity(0.13)], startPoint: .top, endPoint: .bottom).frame(height: landscape ? 60 : 150)
            }
            .ignoresSafeArea().allowsHitTesting(false).opacity(wallpaper ? 0 : 1)
        }
        .task {
            guard ShotTour.on else { return }
            await ShotTour.play(model, show: { p in
                if case .people = p { nationDetent = .large }
                if let p { show(p) } else { panel = nil }
            }, views: { viewsOpen = $0 })
        }
        .overlay(alignment: .top) {
            VStack(spacing: 8) {
                topBar
                if controller.marchingArmy != nil { marchBanner.transition(.move(edge: .top).combined(with: .opacity)) }
                if controller.marchingFleet != nil { fleetBanner.transition(.move(edge: .top).combined(with: .opacity)) }
                if controller.paintNation != nil { paintBanner.transition(.move(edge: .top).combined(with: .opacity)) }
                if let prompt = controller.pickPrompt {
                    HStack(spacing: 10) {
                        Image(systemName: "hand.tap").foregroundStyle(Theme.seal)
                        Text(prompt).font(Theme.body).foregroundStyle(Theme.ink).lineLimit(1).minimumScaleFactor(0.7)
                        Button("取消") { controller.pickPrompt = nil; controller.onPick = nil; if controller.onTerrainStrokeEnd != nil && controller.brushName == nil && model.controller.terrainBrush { controller.terrainBrush = false; controller.onTerrainStroke = nil; controller.onTerrainStrokeEnd = nil } }.font(Theme.body).foregroundStyle(Theme.seal)
                    }
                    .padding(.horizontal, 16).frame(height: Theme.Control.topHeight).glass(Capsule())
                    .transition(.move(edge: .top).combined(with: .opacity))
                }
                if !controller.groupArmies.isEmpty { rtsBanner.transition(.move(edge: .top).combined(with: .opacity)) }
                if controller.play.showHeralds, let h = model.herald, let map = model.map {
                    // Slides down and fades like the other top banners (调兵、绘制、即时战略)；轻点定位并收卷，上滑直接收卷，不强抢镜头。
                    HeraldBanner(herald: h, map: map, onTap: {
                        if let n = h.nations.first, map.meta.nations.indices.contains(n) {
                            let cap = map.meta.nations[n].capital
                            if map.meta.cities.indices.contains(cap) {
                                let c = map.meta.cities[cap]
                                controller.fly(x: Double(c.x), y: Double(c.y))
                            }
                        }
                        model.dismissHerald()
                    }, onDismiss: { model.dismissHerald() }).id(h.id)
                        .transition(.asymmetric(
                            insertion: .move(edge: .top).combined(with: .scale(scale: 0.94, anchor: .top)).combined(with: .opacity),
                            removal: .move(edge: .top).combined(with: .opacity)
                        ))
                }
            }
            .animation(Motion.panel, value: model.herald)
                .offset(y: chromeIn ? 0 : -90).opacity(chromeIn ? 1 : 0)
                .animation(Motion.drift, value: chromeIn)
                .opacity(wallpaper || model.replayActive ? 0 : 1).allowsHitTesting(!wallpaper && !model.replayActive)
                .animation(Motion.panel, value: controller.marchingArmy)
                .animation(Motion.panel, value: controller.marchingFleet)
                .animation(Motion.panel, value: controller.paintNation)
                .animation(Motion.panel, value: controller.pickPrompt)
                .animation(Motion.panel, value: controller.groupArmies.count)
        }
    }

    private var stage: some View {
        backdrop
        .statusBarHidden()
        .overlay(alignment: .bottom) {
            Group {
                if landscape {
                    EventTicker(latest: model.state?.events.last?.text) { show(.chronicle) }
                        .frame(maxWidth: 380).padding(.bottom, 6)
                        .opacity(panel == nil ? 1 : 0)
                        .allowsHitTesting(panel == nil)
                } else {
                    bottomBar
                }
            }
            .offset(y: chromeIn ? 0 : 130).opacity(chromeIn ? 1 : 0)
            .animation(Motion.drift.delay(0.12), value: chromeIn)
            .opacity(wallpaper || model.replayActive ? 0 : 1).allowsHitTesting(!wallpaper && !model.replayActive)
            .task { try? await Task.sleep(nanoseconds: 250_000_000); entered = true }
        }
        .overlay(alignment: .leading) {
            if landscape {
                landscapeRail
                    .offset(x: chromeIn ? 0 : -120)
                    .animation(Motion.drift, value: chromeIn)
                    .opacity(wallpaper || model.replayActive ? 0 : 1)
                    .allowsHitTesting(!wallpaper && !model.replayActive)
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
            if !model.viewLegend.isEmpty && !model.replayActive {
                MapViewLegend(mode: model.mapView, legend: model.viewLegend, open: { allianceMenu($0) })
                    .padding(.leading, landscape ? 80 : 16)
                    .padding(.bottom, landscape ? 44 : model.state?.events.isEmpty == false ? 120 : 80)
                    .transition(.asymmetric(insertion: .scale(scale: 0.4, anchor: .bottomLeading).combined(with: .opacity), removal: .opacity))
            }
        }
        .animation(Motion.panel, value: model.viewLegend)
        .pressMenuHost($legendMenu)
        .overlay(alignment: .topTrailing) {
            let hideSwitcher = model.replayActive || (landscape && panel != nil)
            MapViewSwitcher(mode: $model.mapView, open: $viewsOpen)
                .opacity(hideSwitcher ? 0 : 1)
                .allowsHitTesting(viewsOpen && !hideSwitcher)
                .padding(.top, 54).padding(.trailing, Theme.Control.screenInset)
        }
        .overlay {
            // 可隐藏的精致四角吸附局势浮印：收起为小巧印章，展开含战况/外交/回放/启停/倍速与一键隐藏。
            if controller.play.showTacticalPill && chromeIn && !ShotTour.on && !wallpaper && !model.replayActive && panel == nil
                && controller.paintNation == nil && controller.marchingArmy == nil
                && controller.marchingFleet == nil && controller.pickPrompt == nil && controller.groupArmies.isEmpty {
                FloatingTacticalPill(
                    model: model,
                    openWars: { MilitarySheet.openOn = "wars"; show(.military) },
                    openDiplomacy: { show(.diplomacy) },
                    openReplay: { requestReplay(atDay: nil) },
                    onHide: {
                        controller.play.showTacticalPill = false
                        say("已隐藏局势浮印，可在菜单 › 声音与其他重新开启")
                    },
                    landscape: landscape
                )
                .transition(.opacity.combined(with: .scale(scale: 0.85)))
            }
        }
        .opacity(controller.reveal >= 1 ? 1 : 0)
        .animation(Motion.panel, value: controller.reveal >= 1)
        .onAppear {
            controller.drifting = false
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
        stage
        .sheet(item: $shot) { ShareSheet(items: [$0.url]) }
        .onChange(of: panel == nil) { _, closed in model.pageOpen = !closed }
        .overlay(alignment: .trailing) { sidePage }
        .animation(Motion.panel, value: sideKey)
        .overlay { if let ripple { PressRipple().position(ripple).ignoresSafeArea() } }
        .overlay(alignment: .bottom) {
            // 提示条居于全层之上，轻点可立即收起。
            if let toast {
                HStack(spacing: 10) {
                    Seal(text: "令", size: 22)
                    Text(toast).font(Theme.body).foregroundStyle(Theme.ink).multilineTextAlignment(.leading).fixedSize(horizontal: false, vertical: true)
                }
                .padding(.leading, 10).padding(.trailing, 16).padding(.vertical, 10)
                .glass(RoundedRectangle(cornerRadius: Theme.Control.cornerCard, style: .continuous))
                .padding(.horizontal, 24).padding(.bottom, landscape ? 56 : 114)
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
                sheet(for: panel)
                    .id(panel.id)
                    .transition(.asymmetric(insertion: .move(edge: backward ? .leading : .trailing).combined(with: .opacity),
                                            removal: .move(edge: backward ? .trailing : .leading).combined(with: .opacity)))
                    .safeAreaInset(edge: .top, spacing: 0) { if let last = trail.last { backRow(last) } }
                    .presentationBackground { MemorialPaper() }.presentationDragIndicator(.hidden).presentationCornerRadius(Theme.Control.cornerSheet).font(Theme.section)
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
    private func backRow(_ last: Panel) -> some View {
        HStack {
            Button { back() } label: {
                HStack(spacing: 4) {
                    Image(systemName: "chevron.left").font(.system(size: 13, weight: .regular))
                    Text("返回" + last.title).font(Theme.body)
                }
                .foregroundStyle(Theme.seal).padding(.horizontal, 12).frame(height: 30)
                .background(Theme.seal.opacity(0.08), in: Capsule())
                .overlay(Capsule().stroke(Theme.seal.opacity(0.25), lineWidth: 0.8))
            }
            .buttonStyle(PressStyle())
            Spacer()
        }
        .padding(.horizontal, 18).padding(.top, 14)
    }

    @ViewBuilder private func sheet(for panel: Panel) -> some View {
        switch panel {
        case .editor:
            WorldEditorSheet(model: model, close: { closePage() }, takeShot: { mapShot() })
                .presentationDetents([.medium, .large])
        case .quick(let p):
            ProvinceQuickSheet(model: model, province: p, openProvince: { open(.province(p)) }, openNation: { n in nationDetent = .fraction(0.38); open(.nation(n)) }, openArmy: { a in unitDetent = .height(320); open(.army(a)) }, close: { closePage() })
                .presentationDetents([.medium, .large])
        case .province(let p):
            ProvinceSheet(model: model, province: p, openNation: { n in nationDetent = .fraction(0.38); open(.nation(n)) }, openArmy: { a in
                unitDetent = .height(320)
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
                controller.selectedArmyId = model.army(a)?.id
                controller.selectedArmy = a
                open(.army(a))
            }, openPeople: { nationDetent = .fraction(0.38); open(.people(n)) }, openWars: { nationDetent = .fraction(0.38); open(.nationWars(n)) }, openTalks: { nationDetent = .fraction(0.38); open(.nationTalks(n)) }, openReplay: {
                requestReplay(atDay: nil)
            })
                .presentationDetents([.fraction(0.38), .medium, .large], selection: $nationDetent).presentationBackgroundInteraction(.enabled(upThrough: .fraction(0.38)))
                .onAppear { if NationSheet.tourTab != nil { nationDetent = .large } }
        case .people(let n):
            NationSheet(model: model, nation: n, say: say, fly: { controller.fly(to: $0) }, focus: .people)
                .presentationDetents([.fraction(0.38), .medium, .large], selection: $nationDetent).presentationBackgroundInteraction(.enabled(upThrough: .fraction(0.38)))
        case .nationWars(let n):
            NationSheet(model: model, nation: n, say: say, fly: { controller.fly(to: $0) }, focus: .wars)
                .presentationDetents([.fraction(0.38), .medium, .large], selection: $nationDetent).presentationBackgroundInteraction(.enabled(upThrough: .fraction(0.38)))
        case .nationTalks(let n):
            NationSheet(model: model, nation: n, say: say, fly: { controller.fly(to: $0) }, focus: .talks)
                .presentationDetents([.fraction(0.38), .medium, .large], selection: $nationDetent).presentationBackgroundInteraction(.enabled(upThrough: .fraction(0.38)))
        case .edicts:
            EdictSheet(model: model, say: say).presentationDetents([.medium, .large])
        case .statistics:
            StatisticsSheet(model: model) { n in nationDetent = .fraction(0.38); open(.nation(n)) }.presentationDetents([.medium, .large]).presentationBackground(.clear)
        case .nations:
            NationsSheet(model: model) { n in nationDetent = .fraction(0.38); open(.nation(n)) }.presentationDetents([.medium, .large])
        case .military:
            MilitarySheet(model: model, select: { army in
                // The army's docket slides in over the roster (返回军事 goes back); the sheet drops low and
                // the camera flies to the army itself.
                unitDetent = .height(320)
                controller.selectedArmyId = model.army(army)?.id
                open(.army(army)); controller.selectedArmy = army
                locate(army: army)
            }, selectFleet: { fleet in
                unitDetent = .height(320)
                controller.selectedFleetId = model.fleet(fleet)?.id
                open(.fleet(fleet)); controller.selectedFleet = fleet
                if let f = model.fleet(fleet), f.x.isFinite, f.y.isFinite { controller.fly(x: Double(f.x), y: Double(f.y)) }
            }, flyTo: { x, y in if x.isFinite && y.isFinite { controller.fly(x: x, y: y) } }, openNation: { n in
                nationDetent = .fraction(0.38); open(.nation(n))
            }).presentationDetents([.medium, .large])
        case .diplomacy:
            DiplomacySheet(model: model, say: say, fly: { n in
                if let map = model.map, map.meta.nations.indices.contains(n), map.meta.cities.indices.contains(map.meta.nations[n].capital) {
                    let c = map.meta.cities[map.meta.nations[n].capital]
                    controller.showPlace(x: Double(c.x), y: Double(c.y))
                }
            }, openNation: { n in nationDetent = .fraction(0.38); open(.nation(n)) },
               openWars: { MilitarySheet.openOn = "wars"; open(.military) },
               openChronicle: { n in ChronicleSheet.openNation = n; open(.chronicle) }).presentationDetents([.medium, .large])
        case .chronicle:
            ChronicleSheet(model: model, fly: { controller.fly(to: $0) }, openReplay: { targetDay in
                requestReplay(atDay: targetDay)
            }).presentationDetents([.medium, .large])
        case .menu:
            MenuSheet(model: model, controller: controller, openEdicts: { open(.edicts) }, openEditor: { open(.editor) },
                      wallpaper: { self.panel = nil; withAnimation(Motion.reveal) { wallpaper = true }; controller.drifting = true }, say: say) { self.panel = nil }.presentationDetents([.medium, .large])
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

    private var topBar: some View {
        HStack(spacing: Theme.Control.gap) {
            HStack(spacing: landscape ? 8 : 6) {
                Button {
                    GameFeel.shared.tap()
                    show(.chronicle)
                } label: {
                    HStack(spacing: 5) {
                        Circle()
                            .fill(model.playing ? Theme.jade : Theme.ink2.opacity(0.42))
                            .frame(width: 6.5, height: 6.5)
                            .animation(Motion.panel, value: model.playing)
                        Text(model.state?.dateText ?? "").font(landscape ? Theme.section : Theme.body).foregroundStyle(Theme.ink).monospacedDigit()
                            .lineLimit(1).minimumScaleFactor(0.70).layoutPriority(1)
                            .contentTransition(.numericText()).animation(Motion.tap, value: model.state?.dateText)
                    }
                    .frame(height: Theme.Control.topHeight)
                    .contentShape(Rectangle())
                }
                .buttonStyle(PressStyle())
                if let wars = model.state?.wars.count, wars > 0 {
                    Rectangle().fill(Theme.ink.opacity(0.15)).frame(width: 0.8, height: 15)
                        .transition(.opacity)
                    Button {
                        GameFeel.shared.tap()
                        MilitarySheet.openOn = "wars"
                        show(.military)
                    } label: {
                        WarCount(count: wars, compact: !landscape)
                            .frame(height: Theme.Control.topHeight)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(PressStyle())
                    .transition(.scale(scale: 0.82).combined(with: .opacity))
                }
                // 远程计算: the computer simulates.
                if model.remoteAddress != nil {
                    Image(systemName: "desktopcomputer").font(.system(size: 12, weight: .regular)).foregroundStyle(Theme.jade)
                        .transition(.scale.combined(with: .opacity))
                }
            }
            .padding(.horizontal, landscape ? 14 : 11).frame(height: Theme.Control.topHeight).glass(Capsule())
            .animation(Motion.panel, value: (model.state?.wars.count ?? 0) > 0)
            if landscape { transport.padding(.horizontal, 5).frame(height: Theme.Control.topHeight).glass(Capsule()) }
            Spacer(minLength: 6)
            HStack(spacing: Theme.Control.gap) {
                Button { GameFeel.shared.tap(); withAnimation(Motion.panel) { viewsOpen.toggle() } } label: { CircleIcon(glyph: viewsOpen ? .close : .views, active: viewsOpen) }
                    .buttonStyle(InkPressStyle())
                Button {
                    GameFeel.shared.tap()
                    if controller.boxSelecting || !controller.groupArmies.isEmpty { controller.boxSelecting = false; controller.groupArmies = []; model.refreshArmies() }
                    else { controller.boxSelecting = true; say("即时战略：在地图上拖出方框选择军队") }
                } label: { CircleIcon(glyph: controller.boxSelecting || !controller.groupArmies.isEmpty ? .close : .command, active: controller.boxSelecting || !controller.groupArmies.isEmpty) }.buttonStyle(InkPressStyle())
                Button { GameFeel.shared.tap(); show(.menu) } label: { CircleIcon(glyph: .menu) }.buttonStyle(InkPressStyle())
            }
        }
        .padding(.horizontal, Theme.Control.screenInset).padding(.top, 4)
    }

    /// 即时战略 banner: the selected count, 进攻/防御 mode and cancel.
    private var rtsBanner: some View {
        HStack(spacing: 10) {
            Text("已选 \(controller.groupArmies.count) 支军团 · 点选目的地").font(Theme.body).foregroundStyle(Theme.ink)
            HStack(spacing: 0) {
                ForEach([false, true], id: \.self) { defend in
                    Button { withAnimation(Motion.tap) { rtsDefend = defend } } label: {
                        Text(defend ? "防御" : "进攻").font(Theme.label).foregroundStyle(rtsDefend == defend ? Theme.paper2 : Theme.ink)
                            .padding(.horizontal, 10).padding(.vertical, 5).background(rtsDefend == defend ? Theme.seal : Color.clear, in: Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
            .background(Theme.wash, in: Capsule())
            // 交 AI: the selected armies back to the war council.
            Button("交AI") {
                let armies = controller.groupArmies
                Task { let out = await model.releaseToAI(armies: armies); say(out.reason); if out.ok { controller.groupArmies = [] }; model.refreshArmies() }
            }.font(Theme.body).foregroundStyle(Theme.jade)
            Button("取消") { controller.groupArmies = []; model.refreshArmies() }.font(Theme.body).foregroundStyle(Theme.seal)
        }
        .padding(.horizontal, 14).frame(height: Theme.Control.topHeight).glass(Capsule())
    }

    private var paintBanner: some View {
        VStack(spacing: 6) {
            HStack(spacing: 10) {
                let n = controller.paintNation ?? -1, nation = model.map.flatMap { $0.meta.nations.indices.contains(n) ? $0.meta.nations[n] : nil }
                RoundedRectangle(cornerRadius: 4, style: .continuous).fill(nation.map { Names.color($0.color) } ?? Theme.ink2).frame(width: 14, height: 14)
                Text(controller.brushName ?? (controller.placingArmy ? "在地图上点按或划过州郡放置" : "绘制\(nation?.name ?? "")疆域")).font(Theme.body).foregroundStyle(Theme.ink).lineLimit(1)
                Button("完成") { controller.paintNation = nil; controller.placingArmy = false; controller.placeCount = 1; controller.brushName = nil; controller.brushAction = nil }.font(Theme.body).foregroundStyle(Theme.seal)
            }
            if controller.placingArmy {
                // 与全作统一的纸面滑轨：拖动选择一次放多少支军队。
                HStack(spacing: 10) {
                    InkIcon(glyph: .military, size: 16, weight: 1.75).foregroundStyle(Theme.seal)
                    PaperTrack(value: Binding(get: { Double(controller.placeCount) }, set: { v in
                        let k = Int(v.rounded()); if k != controller.placeCount { controller.placeCount = k; GameFeel.shared.tap() }
                    }), range: 1...30, step: 1, onEditingChanged: nil)
                    Text("\(controller.placeCount) 军").font(Theme.body).foregroundStyle(Theme.ink).monospacedDigit().frame(width: 48, alignment: .trailing).contentTransition(.numericText())
                }
                .frame(width: 270)
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 9).glass(RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    private var fleetBanner: some View {
        HStack(spacing: 10) {
            InkIcon(glyph: .anchor, size: 16, weight: 1.75).foregroundStyle(Theme.seal)
            Text("舰队：点选停留的港口").font(Theme.body).foregroundStyle(Theme.ink)
            Button("取消") { controller.marchingFleet = nil; model.refreshArmies() }.font(Theme.body).foregroundStyle(Theme.seal)
        }
        .padding(.horizontal, 16).frame(height: Theme.Control.topHeight).glass(Capsule())
    }

    private var marchBanner: some View {
        HStack(spacing: 10) {
            InkIcon(glyph: .march, size: 16, weight: 1.75).foregroundStyle(Theme.seal)
            Text(marchRetreat ? "撤退：点选目的地" : "调兵：点选目的地").font(Theme.body).foregroundStyle(Theme.ink)
            Button("取消") { controller.marchingArmy = nil; controller.selectedArmy = nil; model.refreshArmies() }.font(Theme.body).foregroundStyle(Theme.seal)
        }
        .padding(.horizontal, 16).frame(height: Theme.Control.topHeight).glass(Capsule())
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
        let sealSize: CGFloat = landscape ? 34 : Theme.Control.sealButtonSize
        return HStack(spacing: 4) {
            Button {
                GameFeel.shared.tap()
                model.cycleSpeed()
            } label: {
                Text("\(model.speed)×")
                    .font(Theme.body)
                    .foregroundStyle(model.speed > 1 ? Theme.seal : Theme.ink)
                    .monospacedDigit()
                    .frame(width: landscape ? 34 : 38, height: sealSize)
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
    /// 横屏左侧竖排导航坞：居中悬浮、紧凑 38pt 项高、苹果同心连续圆角（22pt），绝不挤压顶栏或底部安全区。
    private var landscapeRail: some View {
        VStack(spacing: 2) { mainTabs }
            .padding(.vertical, 6).padding(.horizontal, 4)
            .glass(RoundedRectangle(cornerRadius: 22, style: .continuous))
            .padding(.leading, 10)
            .padding(.top, 44)
            .animation(Motion.tap, value: panel?.tab)
    }
    /// 横屏右侧悬浮奏折面板：苹果悬浮卡片式圆角（24pt 连续曲率），精确适配容器宽度与安全区，不再使用硬编码屏幕宽度与负边距截断。
    @ViewBuilder private var sidePage: some View {
        if landscape, let panel {
            GeometryReader { geo in
                let panelW = min(460, max(330, geo.size.width * 0.48))
                let shape = RoundedRectangle(cornerRadius: 24, style: .continuous)
                HStack(spacing: 0) {
                    Spacer(minLength: 0)
                    sheet(for: panel)
                        .id(panel.id)
                        .safeAreaInset(edge: .top, spacing: 0) { if let last = trail.last { backRow(last) } }
                        .font(Theme.section)
                        .frame(width: panelW)
                        .frame(maxHeight: .infinity)
                        .background(MemorialPaper(rules: true, fullBleed: false))
                        .clipShape(shape)
                        .overlay(shape.stroke(Theme.ink.opacity(0.18), lineWidth: 0.9).allowsHitTesting(false))
                        .shadow(color: Color(red: 0.12, green: 0.09, blue: 0.05).opacity(0.24), radius: 18, x: -4, y: 4)
                        .overlay(alignment: .leading) {
                            Button { closePage() } label: {
                                Image(systemName: "chevron.right")
                                    .font(.system(size: 13, weight: .semibold))
                                    .foregroundStyle(Theme.ink)
                                    .frame(width: 34, height: 34)
                                    .glass(Circle())
                            }
                            .buttonStyle(PressStyle())
                            .offset(x: -17)
                        }
                        .simultaneousGesture(DragGesture(minimumDistance: 30).onEnded { if $0.translation.width > 90 && abs($0.translation.height) < 60 { closePage() } })
                        .padding(.trailing, 8).padding(.vertical, 8)
                }
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
        .padding(.horizontal, Theme.Control.screenInset).padding(.bottom, 6)
    }
}

/// 推演启停朱印钮：与 54pt 底栏绝对同心（44×44pt，四周留白 5pt）。
/// 彻底回归原本温润宣纸朱印风格：推演中为朱砂实印（宣纸暂停符），暂停时为宣纸底配朱砂双框印（朱砂播放符），彻底消除突兀黑圆块。
struct PlaySealButton: View {
    let playing: Bool
    var size: CGFloat = Theme.Control.sealButtonSize
    let action: () -> Void
    var body: some View {
        Button(action: action) {
            ZStack {
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
        }
        .buttonStyle(PressStyle())
    }
}
