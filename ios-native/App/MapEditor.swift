import SwiftUI
import LieguojiCore

/// 自绘地图 — the original's map editor on the device: paint the terrain of the original 20k grid
/// (sea, plains, hills, mountains, snow peaks; raise, lower, smooth), watch the climate turn it into
/// forests, grassland, deserts and ice, divide it into provinces and states, then found the world on
/// it. The heights are the world: the engine's own climate, rivers, settlement and opening run on them.
@MainActor final class MapEditor: ObservableObject {
    enum Tool: String, CaseIterable, Identifiable {
        case sea, plain, hill, mountain, peak, raise, lower, smooth
        var id: String { rawValue }
        var title: String { ["sea": "海洋", "plain": "平原", "hill": "丘陵", "mountain": "山地", "peak": "雪峰", "raise": "抬高", "lower": "压低", "smooth": "平滑"][rawValue]! }
        /// The height a shaping tool paints towards (nil: a relative tool).
        var target: Double? { ["sea": 8.0, "plain": 27.0, "hill": 44.0, "mountain": 66.0, "peak": 88.0][rawValue] }
        var glyph: InkGlyph {
            switch self {
            case .sea: return .sea
            case .plain: return .plain
            case .hill: return .views
            case .mountain, .peak: return .mountain
            case .raise: return .raise
            case .lower: return .lower
            case .smooth: return .smooth
            }
        }
        var swatch: Color {
            switch self {
            case .sea: return Color(red: 0.27, green: 0.43, blue: 0.67)
            case .plain: return Color(red: 0.78, green: 0.84, blue: 0.56)
            case .hill: return Color(red: 0.25, green: 0.61, blue: 0.26)
            case .mountain: return Color(red: 0.59, green: 0.47, blue: 0.29)
            case .peak: return Color(red: 0.84, green: 0.9, blue: 0.92)
            case .raise, .lower, .smooth: return Theme.ink2
            }
        }
    }
    enum Step { case terrain, provinces, nations }

    @Published var tool: Tool = .plain
    @Published var radius: Double = 34 { didSet { controller.brushRadius = radius } }
    @Published var strength = 1.0
    @Published var softness = 1.0
    @Published var protectCoast = false
    @Published var targetHeight = 27.0
    @Published var step: Step = .terrain
    @Published var provinces = 80
    @Published var nations = 8
    @Published private(set) var busy = false
    @Published private(set) var canUndo = false
    @Published private(set) var canRedo = false
    @Published private(set) var landShare = 0.0
    @Published var message = ""

    let inputs: PreviewWorld.Inputs
    let seed: String
    let template: String
    private(set) var heights: [UInt8]
    private(set) var map: WorldMap
    private let controller: MapController
    private var undo: [[UInt8]] = [], redo: [[UInt8]] = []
    private var strokeStart: [UInt8]?
    private var lastFlush = Date.distantPast
    private var dirty = Set<Int>()
    private let neighbors: [[Int]]
    /// Cells bucketed by 24-unit squares, so a stamp only looks at the cells around it.
    private let buckets: [Int64: [Int]]
    private let bucket: Float = 24

    init(inputs: PreviewWorld.Inputs, heights: [UInt8], seed: String, template: String, controller: MapController) {
        self.inputs = inputs; self.heights = heights; self.seed = seed; self.template = template; self.controller = controller
        map = PreviewWorld.terrain(inputs, heights: heights).map
        neighbors = inputs.grid.neighbors
        var b = [Int64: [Int]]()
        let n = min(heights.count, map.cellCount)
        for c in 0..<n {
            let x = map.sites[c * 2], y = map.sites[c * 2 + 1]
            b[Int64(floor(x / 24)) << 32 | (Int64(floor(y / 24)) & 0xFFFF_FFFF), default: []].append(c)
        }
        buckets = b
        controller.brushRadius = radius
        measureLand()
    }

    private func measureLand() {
        let land = heights.reduce(0) { $0 + ($1 >= 20 ? 1 : 0) }
        landShare = Double(land) / Double(max(1, heights.count))
    }

    // MARK: drawing

    /// One stamp of the brush at a map point.
    func stamp(x: Double, y: Double) {
        guard step == .terrain else { return }
        if strokeStart == nil { strokeStart = heights }
        let r = Float(radius), px = Float(x), py = Float(y)
        let x0 = Int64(floor((px - r) / bucket)), x1 = Int64(floor((px + r) / bucket))
        let y0 = Int64(floor((py - r) / bucket)), y1 = Int64(floor((py + r) / bucket))
        var touched = [(Int, Float)]()
        for bx in x0...x1 { for by in y0...y1 {
            for c in buckets[bx << 32 | (by & 0xFFFF_FFFF)] ?? [] {
                let dx = map.sites[c * 2] - px, dy = map.sites[c * 2 + 1] - py, d2 = dx * dx + dy * dy
                if d2 <= r * r { touched.append((c, 1 - d2.squareRoot() / r)) }
            }
        } }
        for (c, falloff) in touched {
            let h = Double(heights[c])
            var target: Double? = tool.target == nil ? nil : targetHeight
            var delta = tool == .lower ? -3.5 : 3.5
            if tool == .smooth {
                let ns = neighbors.indices.contains(c) ? neighbors[c] : []
                target = nil
                delta = ns.isEmpty ? 0 : (ns.reduce(0.0) { $0 + Double(heights[$1]) } / Double(ns.count) - h) * 0.5
            }
            let v = TerrainBrush.height(current: h, target: target, delta: delta, falloff: Double(falloff),
                                        strength: strength, softness: softness, protectCoast: protectCoast)
            if v != heights[c] { heights[c] = v; dirty.insert(c) }
        }
        // Live feedback at ~12 frames a second: the new heights in quick colours.
        if Date().timeIntervalSince(lastFlush) > 0.08 { flushQuick() }
    }

    private func flushQuick() {
        lastFlush = Date()
        guard !dirty.isEmpty else { return }
        for c in dirty where c < map.cellCount {
            map.elevation[c] = Int16(heights[c])
            let q = PreviewWorld.quickColor(Int(heights[c]))
            map.biomeRGB[c * 3] = q.0; map.biomeRGB[c * 3 + 1] = q.1; map.biomeRGB[c * 3 + 2] = q.2
        }
        dirty.removeAll()
        show(map, sea: false)
    }

    /// The stroke ended: one undo step, then the climate recomputed on the new heights.
    func endStroke() {
        guard let start = strokeStart else { return }
        strokeStart = nil
        flushQuick()
        if start != heights { undo.append(start); if undo.count > 40 { undo.removeFirst() }; redo.removeAll() }
        canUndo = !undo.isEmpty; canRedo = !redo.isEmpty
        measureLand()
        recompute()
    }

    func undoStroke() { guard let prev = undo.popLast() else { return }; redo.append(heights); heights = prev; canUndo = !undo.isEmpty; canRedo = true; measureLand(); recompute() }
    func redoStroke() { guard let next = redo.popLast() else { return }; undo.append(heights); heights = next; canUndo = true; canRedo = !redo.isEmpty; measureLand(); recompute() }

    /// A new base: a terrain template, or open sea with one small island.
    func reset(template: String?, seed: String) {
        undo.append(heights); redo.removeAll(); canUndo = true; canRedo = false
        if let template { heights = TerrainGenerator.generate(graph: inputs.grid, seed: seed, template: template) }
        else { heights = Self.island(inputs: inputs, map: map) }
        measureLand(); recompute()
    }

    static func island(inputs: PreviewWorld.Inputs, map: WorldMap) -> [UInt8] {
        let n = inputs.grid.points.count, w = map.width, h = map.height
        return (0..<n).map { c in
            guard c < map.cellCount else { return 6 }
            let dx = (map.sites[c * 2] - w / 2) / (w * 0.12), dy = (map.sites[c * 2 + 1] - h / 2) / (h * 0.12), d = dx * dx + dy * dy
            return d < 1 ? UInt8(26 + 10 * (1 - d)) : 6
        }
    }

    private var computing = 0
    /// The climate (biomes, sea depth) — or, at the province step, the full opening — on a background thread.
    func recompute() {
        computing += 1
        let ticket = computing, input = inputs, h = heights, step = step, n = nations, p = provinces
        busy = true
        Task.detached(priority: .userInitiated) {
            let built: WorldMap = step == .provinces ? PreviewWorld.build(input, heights: h, nations: n, cities: p) : PreviewWorld.terrain(input, heights: h).map
            await MainActor.run {
                guard ticket == self.computing else { return }
                self.map = built; self.busy = false
                if step == .provinces && built.meta.provinces.isEmpty { self.message = "陆地太少，无法划分州郡" } else { self.message = "" }
                self.show(built, sea: true)
            }
        }
    }

    private func show(_ m: WorldMap, sea: Bool) {
        controller.editorMap = m
        if sea { controller.editorSeaDirty = true }
        controller.editorRevision &+= 1
    }

    // MARK: steps

    func toProvinces() {
        step = .provinces
        controller.terrainBrush = false
        controller.mode = .political
        recompute()
    }
    func toTerrain() {
        releasePaint()
        step = .terrain
        controller.terrainBrush = true
        controller.mode = .terrain
        recompute()
    }
    // MARK: 划定列国 (the original's EditPanelUI DrawState / SetAsCapital / PlaceState)

    /// The states' opening: each province's state and each state's capital province (OpeningLayout47).
    @Published private(set) var owners: [Int] = []
    @Published private(set) var seeds: [Int] = []
    /// The state being painted, and what a tap does.
    @Published var selected = 0
    enum NationTool: String { case paint, capital, found }
    @Published var nationTool: NationTool = .paint
    private var regionNeighbors: [[Int]] = []
    /// The game's own paint handler, given back when the editor lets go of the map.
    private var savedPaint: ((Int) -> Void)?
    func releasePaint() {
        controller.paintNation = nil
        if let s = savedPaint { controller.onPaint = s; savedPaint = nil }
    }

    func toNations() {
        guard step == .provinces, !busy, !map.meta.provinces.isEmpty else { return }
        step = .nations
        owners = map.meta.provinces.map(\.nation)
        seeds = map.meta.cities.map(\.province)
        // Provinces touching across a cell edge (for regrowing a removed state's land).
        var touching = [Set<Int>](repeating: [], count: owners.count)
        let n = min(map.cellCount, neighbors.count)
        for c in 0..<n {
            let a = Int(map.province[c]); guard a >= 0, a < owners.count else { continue }
            for d in neighbors[c] where d < map.cellCount { let b = Int(map.province[d]); if b >= 0 && b != a && b < owners.count { touching[a].insert(b) } }
        }
        regionNeighbors = touching.map { $0.sorted() }
        selected = 0; nationTool = .paint
        controller.paintNation = 0
        if savedPaint == nil { savedPaint = controller.onPaint }
        controller.onPaint = { [weak self] p in self?.tap(p) }
        applyLayout()
    }
    func backToProvinces() {
        releasePaint()
        step = .provinces
        recompute()
    }
    /// A tap or drag over a province, by the chosen tool.
    func tap(_ p: Int) {
        guard step == .nations, owners.indices.contains(p) else { return }
        let capitalOf = seeds.firstIndex(of: p)
        switch nationTool {
        case .paint:
            // DrawState: a capital never changes hands.
            guard capitalOf == nil, owners[p] != selected, seeds.indices.contains(selected) else { return }
            owners[p] = selected
        case .capital:
            // SetAsCapital: a tap on a capital selects that state instead.
            if let c = capitalOf { select(c); return }
            owners[p] = selected; seeds[selected] = p
            nationTool = .paint
        case .found:
            // PlaceState: a new state on a province that is not a capital (twenty-four at most).
            guard capitalOf == nil else { return }
            guard seeds.count < 24 else { message = "最多 24 国"; return }
            seeds.append(p); owners[p] = seeds.count - 1
            selected = seeds.count - 1; controller.paintNation = selected
            nationTool = .paint
        }
        GameFeel.shared.tap()
        applyLayout()
    }
    /// Removes the selected state; its land regrows from its neighbours (removeNation47).
    func removeSelected() {
        guard seeds.count > 2, seeds.indices.contains(selected) else { message = "至少保留两国"; return }
        let gone = selected
        seeds.remove(at: gone)
        var next = owners.map { $0 == gone ? -1 : $0 > gone ? $0 - 1 : $0 }
        for (i, s) in seeds.enumerated() { next[s] = i }
        var queue = next.indices.filter { next[$0] >= 0 }, head = 0
        while head < queue.count {
            let a = queue[head]; head += 1
            for b in regionNeighbors[a] where next[b] < 0 { next[b] = next[a]; queue.append(b) }
        }
        let centers = map.meta.provinces.map { ($0.x, $0.y) }
        for i in next.indices where next[i] < 0 {
            func d(_ s: Int) -> Float { let dx = centers[i].0 - centers[s].0, dy = centers[i].1 - centers[s].1; return dx * dx + dy * dy }
            next[i] = seeds.indices.min { d(seeds[$0]) < d(seeds[$1]) } ?? 0
        }
        owners = next
        select(min(gone, seeds.count - 1))
        applyLayout()
    }
    func select(_ n: Int) { selected = n; controller.paintNation = n; nationTool = .paint }
    /// The layout on the preview map: province colours, the capitals' marks.
    private func applyLayout() {
        for i in map.meta.provinces.indices where owners.indices.contains(i) { map.meta.provinces[i].nation = owners[i] }
        map.meta.nations = seeds.indices.map { i in
            WorldMeta.Nation(id: "n-\(i)", name: "", color: PreviewWorld.palette[i % PreviewWorld.palette.count], line: "#1487ff", capital: i, culture: "", polity: "", religion: "")
        }
        map.meta.cities = seeds.enumerated().map { i, s in WorldMeta.City(id: "c-\(s)", name: "", x: map.meta.provinces[s].x, y: map.meta.provinces[s].y, province: s) }
        nations = seeds.count
        show(map, sea: false)
    }
    /// The layout for the engine's opening (nil: the automatic one).
    var layout: [String: [Int]]? { step == .nations && !seeds.isEmpty ? ["seeds": seeds, "owners": owners] : nil }
}

/// The editor screen: map in the middle, tools on a paper strip below, steps on top.
struct EditorView: View {
    @ObservedObject var model: GameModel
    @ObservedObject var editor: MapEditor
    @State private var leaving = false
    @State private var pickingBase = false
    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 10) {
                Button { leaving = true } label: { CircleIcon(glyph: .close) }.buttonStyle(PressStyle())
                VStack(alignment: .leading, spacing: 2) {
                    Text(editor.step == .terrain ? "绘制山川" : editor.step == .provinces ? "划分州郡" : "划定列国").font(Theme.kai(18)).foregroundStyle(Theme.ink)
                    Text(editor.step == .terrain ? "单指绘制 · 双指移动缩放 · 陆地 \(Int(editor.landShare * 100))%" : editor.step == .provinces ? "\(editor.provinces) 州 · \(editor.nations) 国" : "单指涂抹州郡 · 双指移动缩放 · \(editor.seeds.count) 国").font(Theme.kai(12)).foregroundStyle(Theme.ink2)
                }
                .padding(.horizontal, 14).frame(height: 42).glass(Capsule())
                Spacer()
                if editor.busy { InkBusy().frame(width: 56) }
                if editor.step == .terrain {
                    Button { editor.undoStroke() } label: { CircleIcon(symbol: "arrow.uturn.backward") }.buttonStyle(PressStyle()).disabled(!editor.canUndo).opacity(editor.canUndo ? 1 : 0.4)
                    Button { editor.redoStroke() } label: { CircleIcon(symbol: "arrow.uturn.forward") }.buttonStyle(PressStyle()).disabled(!editor.canRedo).opacity(editor.canRedo ? 1 : 0.4)
                }
            }
            .padding(.horizontal, 14).padding(.top, 4)
            if !editor.message.isEmpty {
                Text(editor.message).font(Theme.kai(14)).foregroundStyle(Theme.seal).padding(.horizontal, 14).padding(.vertical, 6).glass(Capsule()).padding(.top, 8)
            }
            Spacer()
            VStack(spacing: 12) {
                switch editor.step { case .terrain: terrainTools; case .provinces: provinceTools; case .nations: nationTools }
            }
            .padding(14)
            .background(MemorialPaper(rules: false, fullBleed: false).clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous)))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(Theme.ink.opacity(0.18), lineWidth: 1))
            .shadow(color: Color(red: 0.12, green: 0.09, blue: 0.05).opacity(0.2), radius: 14, y: 5)
            .padding(.horizontal, 12).padding(.bottom, 6)
        }
        .animation(.spring(response: 0.4, dampingFraction: 0.85), value: editor.step)
        .sheet(isPresented: $leaving) {
            VStack(alignment: .leading, spacing: 14) {
                SheetHeader(title: "放弃这幅地图？", subtitle: "还没开辟的画稿不会保存", seal: "弃")
                SealButton(title: "放弃并返回标题") { leaving = false; model.closeEditor() }.padding(.horizontal, 22)
                Button { leaving = false } label: { SecondaryLabel(title: "继续绘制", symbol: "paintbrush.pointed") }.buttonStyle(PressStyle()).padding(.horizontal, 22)
            }
            .padding(.bottom, 24)
            .presentationDetents([.height(320)]).presentationBackground { MemorialPaper() }.presentationDragIndicator(.hidden).font(Theme.kai(17))
        }
        .sheet(isPresented: $pickingBase) {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    SheetHeader(title: "换底图", subtitle: "当前画稿会被换掉", seal: "底")
                    Group2 {
                        ForEach(Names.templates.indices, id: \.self) { i in
                            Button {
                                pickingBase = false
                                editor.reset(template: Names.templates[i].id, seed: String(UInt32.random(in: 0...UInt32.max)))
                            } label: { MenuRow(symbol: "square.stack.3d.up", title: "随机" + Names.templates[i].name) }.buttonStyle(.plain)
                            if i < Names.templates.count - 1 { Divider2() }
                        }
                        Divider2()
                        Button { pickingBase = false; editor.reset(template: nil, seed: editor.seed) } label: { MenuRow(symbol: "water.waves", title: "空白海洋（一座小岛）") }.buttonStyle(.plain)
                    }
                    .padding(.horizontal, 16)
                }
                .padding(.bottom, 24)
            }
            .presentationDetents([.medium]).presentationBackground { MemorialPaper() }.presentationDragIndicator(.hidden).font(Theme.kai(17))
        }
    }

    private var terrainTools: some View {
        VStack(spacing: 12) {
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 4), spacing: 8) {
                ForEach(MapEditor.Tool.allCases) { t in
                    let on = editor.tool == t
                    Button { withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) { editor.tool = t; if let h = t.target { editor.targetHeight = h } }; GameFeel.shared.tap() } label: {
                        VStack(spacing: 4) {
                            InkIcon(glyph: t.glyph, size: 20).foregroundStyle(on ? Theme.paper2 : Theme.ink)
                                .frame(height: 22)
                            Text(t.title).font(Theme.kai(14)).foregroundStyle(on ? Theme.paper2 : Theme.ink)
                        }
                        .frame(maxWidth: .infinity).frame(height: 50)
                        .background(on ? Theme.seal : Theme.paper2, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(on ? Color.clear : Theme.line))
                    }
                    .buttonStyle(PressStyle())
                }
            }
            PaperSlider(title: "笔刷", value: $editor.radius, range: 8...110) { "\(Int($0))" }
            FoldSection("笔触与地貌", expanded: false) {
                VStack(spacing: 8) {
                    PaperSlider(title: "强度", value: $editor.strength, range: 0.2...2) { String(format: "%.1f×", $0) }
                    PaperSlider(title: "柔和", value: $editor.softness, range: 0.3...2) { String(format: "%.1f", $0) }
                    if editor.tool.target != nil {
                        PaperSlider(title: "目标高", value: $editor.targetHeight, range: editor.tool == .sea ? 0...19 : 20...100, step: 1) { "\(Int($0))" }
                    }
                    PaperSwitch(title: "保护现有海岸", on: $editor.protectCoast).padding(.horizontal, -16)
                    Text("保护海岸时，陆地不会沉入海中，海洋不会升成陆地。").font(Theme.kai(12)).foregroundStyle(Theme.ink2).frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            HStack(spacing: 10) {
                Button { pickingBase = true } label: { SecondaryLabel(title: "换底图", symbol: "square.stack.3d.up") }
                Button { editor.toProvinces() } label: { PrimaryLabel(title: "下一步：分州郡", symbol: "square.grid.3x3") }
                    .disabled(editor.landShare < 0.03).opacity(editor.landShare < 0.03 ? 0.5 : 1)
            }
            .buttonStyle(PressStyle())
        }
    }

    private var provinceTools: some View {
        VStack(spacing: 12) {
            VStack(spacing: 8) {
                PaperSlider(title: "州郡", value: Binding(get: { Double(editor.provinces) }, set: { editor.provinces = max(editor.nations, Int($0)) }), range: 10...480, step: 5, onEditingChanged: { editing in if !editing { editor.recompute() } }) { "\(Int($0))" }
                PaperSlider(title: "国家", value: Binding(get: { Double(editor.nations) }, set: { editor.nations = Int($0); if editor.provinces < editor.nations { editor.provinces = editor.nations } }), range: 2...24, step: 1, onEditingChanged: { editing in if !editing { editor.recompute() } }) { "\(Int($0))" }
            }
            Text("州郡按原作的定居分区算法划分：平原州小而密，山地、荒原州大而疏；各国从相隔最远的都城起家。").font(Theme.kai(12)).foregroundStyle(Theme.ink2).fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 10) {
                Button { editor.toTerrain() } label: { SecondaryLabel(title: "返回改地形", symbol: "paintbrush.pointed") }
                Button { editor.toNations() } label: { SecondaryLabel(title: "划定列国", symbol: "flag.2.crossed") }
                    .disabled(editor.busy || editor.map.meta.provinces.isEmpty).opacity(editor.busy || editor.map.meta.provinces.isEmpty ? 0.5 : 1)
                Button { Task { await model.foundCustomWorld(editor) } } label: { PrimaryLabel(title: "开辟天下", symbol: "flag.fill") }
                    .disabled(editor.busy || editor.map.meta.provinces.isEmpty).opacity(editor.busy || editor.map.meta.provinces.isEmpty ? 0.5 : 1)
            }
            .buttonStyle(PressStyle())
        }
    }
    /// 划定列国: pick a state, then paint its land, move its capital, found or remove states.
    private var nationTools: some View {
        VStack(spacing: 12) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(editor.seeds.indices, id: \.self) { i in
                        let count = editor.owners.filter { $0 == i }.count
                        Button { editor.select(i) } label: {
                            HStack(spacing: 5) {
                                Circle().fill(Names.color(PreviewWorld.palette[i % PreviewWorld.palette.count])).frame(width: 14, height: 14)
                                Text("\(i + 1)号国 · \(count)州").font(Theme.kai(14)).foregroundStyle(Theme.ink)
                            }
                            .padding(.horizontal, 10).frame(height: 32)
                            .background(editor.selected == i ? Theme.seal.opacity(0.14) : Theme.paper2, in: Capsule())
                            .overlay(Capsule().stroke(editor.selected == i ? Theme.seal : Theme.line, lineWidth: editor.selected == i ? 1.5 : 1))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            HStack(spacing: 8) {
                ForEach([(MapEditor.NationTool.paint, "涂抹领土", "paintbrush.pointed"), (.capital, "移都城", "building.columns"), (.found, "新建国家", "plus.circle")], id: \.0) { t in
                    Button { editor.nationTool = t.0 } label: {
                        Label(t.1, systemImage: t.2).font(Theme.kai(14)).foregroundStyle(editor.nationTool == t.0 ? Theme.paper2 : Theme.ink)
                            .padding(.horizontal, 8).frame(height: 34).frame(maxWidth: .infinity)
                            .background(editor.nationTool == t.0 ? Theme.seal : Theme.paper2, in: RoundedRectangle(cornerRadius: 9))
                    }
                    .buttonStyle(.plain)
                }
                Button { editor.removeSelected() } label: { Image(systemName: "trash").font(.system(size: 15)).foregroundStyle(Theme.seal).frame(width: 40, height: 34).background(Theme.paper2, in: RoundedRectangle(cornerRadius: 9)) }
                    .buttonStyle(.plain).disabled(editor.seeds.count <= 2).opacity(editor.seeds.count <= 2 ? 0.4 : 1)
            }
            Text(editor.nationTool == .paint ? "选一国，在地图上涂抹州郡划入该国；都城不可涂走。" : editor.nationTool == .capital ? "点一个州郡，设为所选国家的都城。" : "点一个州郡，在此建立新国家（最多 24 国）。")
                .font(Theme.kai(12)).foregroundStyle(Theme.ink2).fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 10) {
                Button { editor.backToProvinces() } label: { SecondaryLabel(title: "返回分州郡", symbol: "square.grid.3x3") }
                Button { Task { await model.foundCustomWorld(editor) } } label: { PrimaryLabel(title: "开辟天下", symbol: "flag.fill") }
            }
            .buttonStyle(PressStyle())
        }
    }

}
