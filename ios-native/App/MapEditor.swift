import SwiftUI
import LieguojiCore

/// 自绘地图 — 完整的手绘地形与划定列国工坊：
/// 1. 「山川」：海洋、内湖、平原、丘陵、山地、雪峰、群岛、抬高、压低、平滑 10 种手绘笔刷，配海陆升降、整图平滑、地形崎岖化与一键随机新图；支持收起工具栏全屏畅绘与横屏适配。
/// 2. 「州郡」：一键规模预设（袖珍／标准／宏大／史诗）与州郡／国家细调，实时按自然地形与有机分疆预览。
/// 3. 「列国」：直觉化的划定列国——支持单州／连片双模式画笔、顶部「+ 新建国」一键加国、自然山河重分、迁都、删国、完整撤销／重做，以及与进局后完全一致的国色配色！
@MainActor final class MapEditor: ObservableObject {
    enum Tool: String, CaseIterable, Identifiable {
        case sea, lake, plain, hill, mountain, peak, island, raise, lower, smooth
        var id: String { rawValue }
        var title: String {
            switch self {
            case .sea: return "海洋"
            case .lake: return "内湖"
            case .plain: return "平原"
            case .hill: return "丘陵"
            case .mountain: return "山地"
            case .peak: return "雪峰"
            case .island: return "群岛"
            case .raise: return "抬高"
            case .lower: return "压低"
            case .smooth: return "平滑"
            }
        }
        /// 塑形笔刷的目标海拔（nil 表示相对增减／滤镜笔刷）。
        var target: Double? {
            switch self {
            case .sea: return 8.0
            case .lake: return 12.0
            case .plain: return 27.0
            case .hill: return 44.0
            case .mountain: return 66.0
            case .peak: return 88.0
            case .island, .raise, .lower, .smooth: return nil
            }
        }
        var glyph: InkGlyph {
            switch self {
            case .sea: return .sea
            case .lake: return .lake
            case .plain: return .plain
            case .hill: return .views
            case .mountain, .peak: return .mountain
            case .island: return .island
            case .raise: return .raise
            case .lower: return .lower
            case .smooth: return .smooth
            }
        }
        var swatch: Color {
            switch self {
            case .sea: return Color(red: 0.27, green: 0.43, blue: 0.67)
            case .lake: return Color(red: 0.34, green: 0.62, blue: 0.72)
            case .plain: return Color(red: 0.78, green: 0.84, blue: 0.56)
            case .hill: return Color(red: 0.25, green: 0.61, blue: 0.26)
            case .mountain: return Color(red: 0.59, green: 0.47, blue: 0.29)
            case .peak: return Color(red: 0.84, green: 0.90, blue: 0.92)
            case .island: return Color(red: 0.52, green: 0.72, blue: 0.54)
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
    @Published var provinces = 100
    @Published var nations = 8
    @Published private(set) var busy = false
    @Published private(set) var canUndo = false
    @Published private(set) var canRedo = false
    @Published private(set) var canUndoNation = false
    @Published private(set) var canRedoNation = false
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

    private var strokeSerial = 0
    func stamp(x: Double, y: Double) {
        guard step == .terrain else { return }
        if strokeStart == nil { strokeStart = heights; strokeSerial &+= 1 }
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
            // 群岛笔刷：基于位置与笔画序号撒出有机群岛，海面隆起错落岛礁，避免生硬圆饼
            if tool == .island {
                target = nil
                var hash = UInt32(truncatingIfNeeded: c) &* 2654435761 ^ UInt32(truncatingIfNeeded: strokeSerial) &* 40503
                hash ^= hash >> 13; hash = hash &* 0x5bd1e995; hash ^= hash >> 15
                let cellNoise = Double(hash & 0xFF) / 255.0
                let cluster = sin(Double(map.sites[c * 2]) * 0.14 + Double(strokeSerial)) * cos(Double(map.sites[c * 2 + 1]) * 0.14 - Double(strokeSerial) * 0.7)
                if cluster + (cellNoise - 0.5) * 0.55 > 0.12 {
                    delta = 5.5 + cellNoise * 6.5
                } else {
                    delta = -1.5
                }
            }
            if tool == .smooth {
                let ns = neighbors.indices.contains(c) ? neighbors[c] : []
                target = nil
                delta = ns.isEmpty ? 0 : (ns.reduce(0.0) { $0 + Double(heights[$1]) } / Double(ns.count) - h) * 0.5
            }
            let protect = tool == .lake ? false : protectCoast
            let v = TerrainBrush.height(current: h, target: target, delta: delta, falloff: Double(falloff),
                                        strength: strength, softness: softness, protectCoast: protect)
            if v != heights[c] { heights[c] = v; dirty.insert(c) }
        }
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

    func endStroke() {
        guard let start = strokeStart else { return }
        strokeStart = nil
        flushQuick()
        if start != heights { pushTerrainUndo(start) }
        measureLand()
        recompute()
    }

    private func pushTerrainUndo(_ snapshot: [UInt8]) {
        undo.append(snapshot)
        if undo.count > 40 { undo.removeFirst() }
        redo.removeAll()
        canUndo = !undo.isEmpty; canRedo = false
    }

    func undoStroke() { guard let prev = undo.popLast() else { return }; redo.append(heights); heights = prev; canUndo = !undo.isEmpty; canRedo = true; GameFeel.shared.tap(); measureLand(); recompute() }
    func redoStroke() { guard let next = redo.popLast() else { return }; undo.append(heights); heights = next; canUndo = true; canRedo = !redo.isEmpty; GameFeel.shared.tap(); measureLand(); recompute() }

    // MARK: 一键地形快捷操作

    /// 整体抬升或降低陆海海拔（快速调节陆地占比与海峡宽度）。
    func shiftElevation(_ delta: Int) {
        pushTerrainUndo(heights)
        heights = heights.map { h in
            let v = Int(h) + delta
            return UInt8(max(2, min(98, v)))
        }
        GameFeel.shared.tap()
        measureLand(); recompute()
    }

    /// 整图海岸与山脊柔化平滑。
    func smoothWholeMap() {
        pushTerrainUndo(heights)
        var next = heights
        for c in 0..<min(heights.count, neighbors.count) {
            let ns = neighbors[c]
            guard !ns.isEmpty else { continue }
            var sum = Int(heights[c]) * 2
            for nb in ns where nb < heights.count { sum += Int(heights[nb]) }
            next[c] = UInt8(max(0, min(100, sum / (ns.count + 2))))
        }
        heights = next
        GameFeel.shared.tap()
        measureLand(); recompute()
    }

    /// 整图海岸与山脉微崎岖化，让手绘海岸线条自然曲折。
    func roughenCoasts() {
        pushTerrainUndo(heights)
        strokeSerial &+= 1
        var next = heights
        for c in 0..<heights.count {
            let h = Int(heights[c])
            guard h >= 12 && h <= 82 else { continue }
            var hash = UInt32(truncatingIfNeeded: c) &* 2654435761 ^ UInt32(truncatingIfNeeded: strokeSerial) &* 40503
            hash ^= hash >> 13; hash = hash &* 0x5bd1e995; hash ^= hash >> 15
            let d = Int(hash % 9) - 4
            next[c] = UInt8(max(2, min(98, h + d)))
        }
        heights = next
        GameFeel.shared.tap()
        measureLand(); recompute()
    }

    /// 更换底图模板，或立即按当前模板随机一幅新地形。
    func reset(template: String?, seed: String) {
        pushTerrainUndo(heights)
        if let template { heights = TerrainGenerator.generate(graph: inputs.grid, seed: seed, template: template) }
        else { heights = Self.island(inputs: inputs, map: map) }
        GameFeel.shared.tap()
        measureLand(); recompute()
    }

    func randomizeCurrentTemplate() {
        reset(template: template, seed: String(UInt32.random(in: 0...UInt32.max)))
    }

    static func island(inputs: PreviewWorld.Inputs, map: WorldMap) -> [UInt8] {
        let n = inputs.grid.points.count, w = map.width, h = map.height
        return (0..<n).map { c in
            guard c < map.cellCount else { return 6 }
            let dx = (map.sites[c * 2] - w / 2) / (w * 0.16), dy = (map.sites[c * 2 + 1] - h / 2) / (h * 0.16), d = dx * dx + dy * dy
            return d < 1 ? UInt8(26 + 14 * (1 - d)) : 6
        }
    }

    private var computing = 0
    /// 后台重算气候与州郡分区；在州郡步骤中同步应用自然山河分疆，呈现非方正的有机列国版图。
    func recompute() {
        computing += 1
        let ticket = computing, input = inputs, h = heights, step = step, n = nations, p = provinces, seedStr = seed
        busy = true
        Task.detached(priority: .userInitiated) {
            var built: WorldMap = step == .provinces ? PreviewWorld.build(input, heights: h, nations: n, cities: p) : PreviewWorld.terrain(input, heights: h).map
            if step == .provinces && !built.meta.provinces.isEmpty && !built.meta.cities.isEmpty {
                // 使用与开局一致的自然山河阻力扩张，呈现有机的列国版图雏形
                let provCount = built.meta.provinces.count
                var touching = [Set<Int>](repeating: [], count: provCount)
                let cellCount = min(built.cellCount, input.grid.neighbors.count)
                for c in 0..<cellCount {
                    let a = Int(built.province[c]); guard a >= 0, a < provCount else { continue }
                    for d in input.grid.neighbors[c] where d < built.cellCount {
                        let b = Int(built.province[d])
                        if b >= 0 && b != a && b < provCount { touching[a].insert(b) }
                    }
                }
                let provNeighbors = touching.map { $0.sorted() }
                let centers = built.meta.provinces.map { ($0.x, $0.y) }
                let provHeights = built.meta.provinces.map { p -> Float in p.terrain == "mountain" ? 72 : (p.terrain == "forest" ? 48 : 28) }
                let seeds = built.meta.cities.map(\.province)
                let salt = max(1, abs(seedStr.hashValue) & 0x7FFF)
                let organic = Opening.organicAssign(centers: centers, heights: provHeights, neighbors: provNeighbors, seeds: seeds, salt: salt)
                for i in built.meta.provinces.indices where organic.indices.contains(i) {
                    built.meta.provinces[i].nation = organic[i]
                }
            }
            let finalBuilt = built
            await MainActor.run {
                guard ticket == self.computing else { return }
                self.map = finalBuilt; self.busy = false
                if step == .provinces && finalBuilt.meta.provinces.isEmpty { self.message = "陆地太少，无法划分州郡" } else { self.message = "" }
                self.show(finalBuilt, sea: true)
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
        releasePaint()
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

    // MARK: 划定列国（极简直觉交互 + 撤销重做 + 连片画笔 + 自然重分 + 实机同色）

    @Published private(set) var owners: [Int] = []
    @Published private(set) var seeds: [Int] = []
    @Published private(set) var nationHexes: [String] = []
    @Published var selected = 0
    @Published var paintCluster = false
    enum NationTool: String { case paint, capital, found }
    @Published var nationTool: NationTool = .paint
    private var regionNeighbors: [[Int]] = []
    private var regionHeights: [Float] = []
    private var rebalanceSalt = 1
    private var nationUndo: [(owners: [Int], seeds: [Int], selected: Int)] = []
    private var nationRedo: [(owners: [Int], seeds: [Int], selected: Int)] = []
    private var savedPaint: ((Int) -> Void)?

    func releasePaint() {
        controller.paintNation = nil
        if let s = savedPaint { controller.onPaint = s; savedPaint = nil }
    }

    func toNations() {
        guard !busy, !map.meta.provinces.isEmpty else { return }
        step = .nations
        controller.terrainBrush = false
        controller.mode = .political
        owners = map.meta.provinces.map(\.nation)
        seeds = map.meta.cities.map(\.province)
        nationUndo.removeAll(); nationRedo.removeAll()
        canUndoNation = false; canRedoNation = false
        var touching = [Set<Int>](repeating: [], count: owners.count)
        let n = min(map.cellCount, neighbors.count)
        for c in 0..<n {
            let a = Int(map.province[c]); guard a >= 0, a < owners.count else { continue }
            for d in neighbors[c] where d < map.cellCount {
                let b = Int(map.province[d])
                if b >= 0 && b != a && b < owners.count { touching[a].insert(b) }
            }
        }
        regionNeighbors = touching.map { $0.sorted() }
        regionHeights = map.meta.provinces.map { $0.terrain == "mountain" ? 72 : ($0.terrain == "forest" ? 48 : 28) }
        selected = 0; nationTool = .paint; message = ""
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

    private func pushNationUndo() {
        nationUndo.append((owners, seeds, selected))
        if nationUndo.count > 40 { nationUndo.removeFirst() }
        nationRedo.removeAll()
        canUndoNation = !nationUndo.isEmpty
        canRedoNation = false
    }

    func undoNation() {
        guard let prev = nationUndo.popLast() else { return }
        nationRedo.append((owners, seeds, selected))
        owners = prev.owners; seeds = prev.seeds
        selected = min(prev.selected, max(0, seeds.count - 1))
        controller.paintNation = selected
        canUndoNation = !nationUndo.isEmpty; canRedoNation = true
        GameFeel.shared.tap()
        applyLayout()
    }

    func redoNation() {
        guard let next = nationRedo.popLast() else { return }
        nationUndo.append((owners, seeds, selected))
        owners = next.owners; seeds = next.seeds
        selected = min(next.selected, max(0, seeds.count - 1))
        controller.paintNation = selected
        canUndoNation = true; canRedoNation = !nationRedo.isEmpty
        GameFeel.shared.tap()
        applyLayout()
    }

    /// 地图点选／拖拽州郡。
    func tap(_ p: Int) {
        guard step == .nations, owners.indices.contains(p) else { return }
        message = ""
        let capitalOf = seeds.firstIndex(of: p)
        switch nationTool {
        case .paint:
            // 点到别国都城时自动切选该国，顺手流畅；点普通州则按单州／连片涂抹疆土
            if let cap = capitalOf {
                if cap != selected { select(cap); GameFeel.shared.tap() }
                return
            }
            guard seeds.indices.contains(selected) else { return }
            var targets = [p]
            if paintCluster && regionNeighbors.indices.contains(p) {
                for nb in regionNeighbors[p] where owners.indices.contains(nb) && !seeds.contains(nb) {
                    targets.append(nb)
                }
            }
            let changing = targets.filter { owners[$0] != selected }
            guard !changing.isEmpty else { return }
            pushNationUndo()
            for t in changing { owners[t] = selected }
        case .capital:
            if let c = capitalOf { select(c); GameFeel.shared.tap(); return }
            pushNationUndo()
            owners[p] = selected; seeds[selected] = p
            nationTool = .paint
        case .found:
            guard capitalOf == nil else { message = "此处已是都城，请改点其他州郡"; return }
            guard seeds.count < 24 else { message = "最多设立 24 个国家"; return }
            pushNationUndo()
            seeds.append(p)
            let newIdx = seeds.count - 1
            owners[p] = newIdx
            // 同时给新国划入相邻 1~2 个非都城州，开局更有雏形
            if regionNeighbors.indices.contains(p) {
                for nb in regionNeighbors[p].prefix(2) where owners.indices.contains(nb) && !seeds.contains(nb) {
                    owners[nb] = newIdx
                }
            }
            selected = newIdx; controller.paintNation = selected
            nationTool = .paint
        }
        GameFeel.shared.tap()
        applyLayout()
    }

    /// 一键新建国：自动挑选离现有各国都城最远的空闲州郡建国，并立刻选中方便涂抹！
    func quickAddNation() {
        guard step == .nations, !owners.isEmpty else { return }
        guard seeds.count < 24 else { message = "最多设立 24 个国家"; GameFeel.shared.notify(.warning); return }
        let used = Set(seeds)
        let provs = map.meta.provinces
        var best = -1, bestDist: Float = -1
        for i in provs.indices where !used.contains(i) {
            let d = seeds.map { s -> Float in
                let dx = provs[i].x - provs[s].x, dy = provs[i].y - provs[s].y
                return dx * dx + dy * dy
            }.min() ?? 0
            if d > bestDist { bestDist = d; best = i }
        }
        guard best >= 0 else { message = "已无空闲州郡可供建国"; return }
        pushNationUndo()
        seeds.append(best)
        let newIdx = seeds.count - 1
        owners[best] = newIdx
        if regionNeighbors.indices.contains(best) {
            for nb in regionNeighbors[best].prefix(3) where owners.indices.contains(nb) && !seeds.contains(nb) {
                owners[nb] = newIdx
            }
        }
        selected = newIdx; controller.paintNation = selected; nationTool = .paint; message = ""
        GameFeel.shared.tap()
        applyLayout()
    }

    /// 自然重分：以当前各国都城为原点，沿山脉高差与河谷阻力一键重新自然划界！
    func rebalanceOrganically() {
        guard step == .nations, !seeds.isEmpty, !owners.isEmpty else { return }
        pushNationUndo()
        rebalanceSalt &+= 1
        let centers = map.meta.provinces.map { ($0.x, $0.y) }
        owners = Opening.organicAssign(centers: centers, heights: regionHeights, neighbors: regionNeighbors, seeds: seeds, salt: rebalanceSalt)
        message = ""
        GameFeel.shared.notify(.success)
        applyLayout()
    }

    /// 删除所选国家，其领土顺邻接自然并入周边列国。
    func removeSelected() {
        guard seeds.count > 2, seeds.indices.contains(selected) else { message = "至少保留两国"; return }
        pushNationUndo()
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
        GameFeel.shared.tap()
        applyLayout()
    }

    func select(_ n: Int) { selected = n; controller.paintNation = n; nationTool = .paint }

    func nationHex(at index: Int) -> String {
        if nationHexes.indices.contains(index) { return nationHexes[index] }
        return PreviewWorld.palette[index % PreviewWorld.palette.count]
    }

    /// 同步预览版图并采用与实机开局完全相同的 `NationColors.assign(capitals:)` 配色！
    private func applyLayout() {
        for i in map.meta.provinces.indices where owners.indices.contains(i) { map.meta.provinces[i].nation = owners[i] }
        let caps = seeds.map { s -> (x: Double, y: Double) in
            guard map.meta.provinces.indices.contains(s) else { return (0, 0) }
            return (Double(map.meta.provinces[s].x), Double(map.meta.provinces[s].y))
        }
        let colors = NationColors.assign(capitals: caps)
        nationHexes = colors
        map.meta.nations = seeds.indices.map { i in
            let hex = colors.indices.contains(i) ? colors[i] : PreviewWorld.palette[i % PreviewWorld.palette.count]
            return WorldMeta.Nation(id: "n-\(i)", name: "", color: hex, line: NativeEngine.stateLineColor(hex), capital: i, culture: "", polity: "", religion: "")
        }
        map.meta.cities = seeds.enumerated().map { _, s in
            WorldMeta.City(id: "c-\(s)", name: "", x: map.meta.provinces[s].x, y: map.meta.provinces[s].y, province: s)
        }
        nations = seeds.count
        show(map, sea: false)
    }

    var layout: [String: [Int]]? { step == .nations && !seeds.isEmpty ? ["seeds": seeds, "owners": owners] : nil }
}

/// 自绘地图与划定列国界面：顶部三步航标 + 撤销重做 + 收起展开；底部圆角温润宣纸卡片。
struct EditorView: View {
    @ObservedObject var model: GameModel
    @ObservedObject var editor: MapEditor
    @Environment(\.verticalSizeClass) private var verticalClass
    private var landscape: Bool { verticalClass == .compact }
    @State private var leaving = false
    @State private var pickingBase = false
    @State private var collapsed = false

    private var canUndoNow: Bool { editor.step == .terrain ? editor.canUndo : (editor.step == .nations ? editor.canUndoNation : false) }
    private var canRedoNow: Bool { editor.step == .terrain ? editor.canRedo : (editor.step == .nations ? editor.canRedoNation : false) }

    var body: some View {
        VStack(spacing: 0) {
            topBar
                .padding(.horizontal, landscape ? 18 : 14)
                .padding(.top, landscape ? 2 : 4)

            if !editor.message.isEmpty {
                HStack(spacing: 6) {
                    InkIcon(glyph: .edict, size: 14).foregroundStyle(Theme.seal)
                    Text(editor.message).font(Theme.label).foregroundStyle(Theme.seal)
                }
                .padding(.horizontal, 14).padding(.vertical, 6)
                .glass(Capsule())
                .padding(.top, 8)
                .transition(.move(edge: .top).combined(with: .opacity))
            }

            Spacer(minLength: 8)

            if collapsed {
                collapsedBar
                    .padding(.bottom, landscape ? 6 : 8)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            } else {
                bottomDeck
                    .padding(.horizontal, landscape ? 24 : 12)
                    .padding(.bottom, landscape ? 4 : 6)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(Motion.panel, value: editor.step)
        .animation(Motion.panel, value: collapsed)
        .sheet(isPresented: $leaving) {
            VStack(alignment: .leading, spacing: 14) {
                SheetHeader(title: "放弃这幅地图？", subtitle: "还没开辟的画稿不会保存", seal: "弃")
                SealButton(title: "放弃并返回标题") { leaving = false; model.closeEditor() }.padding(.horizontal, 22)
                Button { leaving = false } label: { SecondaryLabel(title: "继续绘制", symbol: "paintbrush.pointed") }.buttonStyle(PressStyle()).padding(.horizontal, 22)
            }
            .padding(.bottom, 24)
            .presentationDetents([.height(310)])
            .presentationCornerRadius(Theme.Control.cornerSheet)
            .presentationBackground { MemorialPaper() }
            .presentationDragIndicator(.hidden)
            .font(Theme.section)
        }
        .sheet(isPresented: $pickingBase) {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    SheetHeader(title: "换底图", subtitle: "挑选一幅新的地形模板作为起点", seal: "底")
                    Group2 {
                        ForEach(Names.templates.indices, id: \.self) { i in
                            Button {
                                pickingBase = false
                                editor.reset(template: Names.templates[i].id, seed: String(UInt32.random(in: 0...UInt32.max)))
                            } label: { MenuRow(symbol: "square.stack.3d.up", title: "随机" + Names.templates[i].name) }.buttonStyle(.plain)
                            if i < Names.templates.count - 1 { Divider2() }
                        }
                        Divider2()
                        Button { pickingBase = false; editor.reset(template: nil, seed: editor.seed) } label: { MenuRow(symbol: "water.waves", title: "空白海洋（中心一座小岛）") }.buttonStyle(.plain)
                    }
                    .padding(.horizontal, 16)
                }
                .padding(.bottom, 24)
            }
            .presentationDetents([.medium])
            .presentationCornerRadius(Theme.Control.cornerSheet)
            .presentationBackground { MemorialPaper() }
            .presentationDragIndicator(.hidden)
            .font(Theme.section)
        }
    }

    private var topBar: some View {
        HStack(spacing: 8) {
            Button { leaving = true } label: { CircleIcon(glyph: .close) }.buttonStyle(PressStyle())

            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    stepPill("1 山川", active: editor.step == .terrain) {
                        if editor.step != .terrain { editor.toTerrain() }
                    }
                    Text("›").font(Theme.caption).foregroundStyle(Theme.ink2.opacity(0.55))
                    stepPill("2 州郡", active: editor.step == .provinces) {
                        if editor.step != .provinces && editor.landShare >= 0.03 {
                            if editor.step == .nations { editor.backToProvinces() } else { editor.toProvinces() }
                        }
                    }
                    Text("›").font(Theme.caption).foregroundStyle(Theme.ink2.opacity(0.55))
                    stepPill("3 列国", active: editor.step == .nations) {
                        if editor.step == .provinces && !editor.busy && !editor.map.meta.provinces.isEmpty { editor.toNations() }
                    }
                }
                Text(subtitleText)
                    .font(Theme.caption).foregroundStyle(Theme.ink2).lineLimit(1)
            }
            .padding(.horizontal, 14).frame(height: Theme.Control.topHeight).glass(Capsule())

            Spacer(minLength: 6)

            if editor.busy { InkBusy().frame(width: 48) }

            if editor.step == .terrain || editor.step == .nations {
                Button {
                    if editor.step == .terrain { editor.undoStroke() } else { editor.undoNation() }
                } label: { CircleIcon(glyph: .retreat) }
                .buttonStyle(PressStyle())
                .disabled(!canUndoNow).opacity(canUndoNow ? 1 : 0.38)
                .accessibilityLabel("撤销")

                Button {
                    if editor.step == .terrain { editor.redoStroke() } else { editor.redoNation() }
                } label: { CircleIcon(glyph: .stepForward) }
                .buttonStyle(PressStyle())
                .disabled(!canRedoNow).opacity(canRedoNow ? 1 : 0.38)
                .accessibilityLabel("重做")
            }

            Button {
                GameFeel.shared.tap()
                withAnimation(Motion.panel) { collapsed.toggle() }
            } label: { CircleIcon(glyph: collapsed ? .brush : .eye, active: collapsed) }
            .buttonStyle(PressStyle())
            .accessibilityLabel(collapsed ? "展开画板" : "全屏画图")
        }
    }

    private var subtitleText: String {
        switch editor.step {
        case .terrain: return "单指绘制 · 双指缩放 · 陆地 \(Int(editor.landShare * 100))%"
        case .provinces: return "\(editor.provinces) 州郡 · \(editor.nations) 个国家"
        case .nations: return "单指\(editor.paintCluster ? "连片" : "逐州")涂抹 · \(editor.seeds.count) 国"
        }
    }

    private var collapsedBar: some View {
        Button {
            GameFeel.shared.tap()
            withAnimation(Motion.panel) { collapsed = false }
        } label: {
            HStack(spacing: 8) {
                InkIcon(glyph: editor.step == .terrain ? editor.tool.glyph : .nation, size: 17).foregroundStyle(Theme.seal)
                Text(editor.step == .terrain ? "正在绘制：\(editor.tool.title)（点此展开画板）" : "点此展开「划定列国」画板")
                    .font(Theme.label).foregroundStyle(Theme.ink)
            }
            .padding(.horizontal, 18).frame(height: 40).glass(Capsule())
        }
        .buttonStyle(PressStyle())
    }

    private var bottomDeck: some View {
        VStack(spacing: landscape ? 8 : 11) {
            switch editor.step {
            case .terrain: terrainTools
            case .provinces: provinceTools
            case .nations: nationTools
            }
        }
        .padding(landscape ? 11 : 14)
        .frame(maxWidth: landscape ? 660 : .infinity)
        .glass(RoundedRectangle(cornerRadius: Theme.Control.cornerSheet, style: .continuous))
    }

    private var terrainTools: some View {
        VStack(spacing: landscape ? 8 : 10) {
            // 10 种笔刷 5×2 严格对称排布
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: landscape ? 10 : 5), spacing: 6) {
                ForEach(MapEditor.Tool.allCases) { t in
                    let on = editor.tool == t
                    Button {
                        withAnimation(Motion.tap) {
                            editor.tool = t
                            if let h = t.target { editor.targetHeight = h }
                        }
                        GameFeel.shared.tap()
                    } label: {
                        VStack(spacing: 3) {
                            ZStack {
                                if !on && t.target != nil {
                                    Circle().fill(t.swatch.opacity(0.24)).frame(width: 24, height: 24)
                                }
                                InkIcon(glyph: t.glyph, size: 18).foregroundStyle(on ? Theme.paper2 : Theme.ink)
                            }
                            .frame(height: 22)
                            Text(t.title).font(Theme.caption).foregroundStyle(on ? Theme.paper2 : Theme.ink).lineLimit(1)
                        }
                        .frame(maxWidth: .infinity).frame(height: landscape ? 44 : 48)
                        .background(on ? Theme.seal : Theme.paper2, in: RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous).stroke(on ? Color.clear : Theme.line))
                    }
                    .buttonStyle(PressStyle())
                }
            }

            // 笔刷大小 + 四档圆标预设
            HStack(spacing: 8) {
                PaperSlider(title: "笔刷", value: $editor.radius, range: 8...110) { "\(Int($0))" }
                HStack(spacing: 4) {
                    ForEach(Self.brushPresets) { preset in
                        let near = abs(editor.radius - preset.radius) <= 6
                        Button(preset.label) {
                            GameFeel.shared.tap()
                            withAnimation(Motion.tap) { editor.radius = preset.radius }
                        }
                        .font(Theme.caption)
                        .foregroundStyle(near ? Theme.paper2 : Theme.ink)
                        .frame(width: 28, height: 28)
                        .background(near ? Theme.seal : Theme.paper2, in: Circle())
                        .overlay(Circle().stroke(near ? Color.clear : Theme.line))
                        .buttonStyle(PressStyle())
                    }
                }
            }

            // 一键地形快捷雕琢条
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    quickTerrainChip("抬海陆", glyph: .raise) { editor.shiftElevation(4) }
                    quickTerrainChip("降海面", glyph: .lower) { editor.shiftElevation(-4) }
                    quickTerrainChip("整图平滑", glyph: .smooth) { editor.smoothWholeMap() }
                    quickTerrainChip("海岸崎岖", glyph: .mountain) { editor.roughenCoasts() }
                    quickTerrainChip("随机新图", glyph: .refresh) { editor.randomizeCurrentTemplate() }
                    quickTerrainChip("换底图", glyph: .swap) { pickingBase = true }
                }
            }

            if !landscape {
                FoldSection("笔触细节与保护海岸", expanded: false) {
                    VStack(spacing: 8) {
                        PaperSlider(title: "强度", value: $editor.strength, range: 0.2...2) { String(format: "%.1f×", $0) }
                        PaperSlider(title: "柔和", value: $editor.softness, range: 0.3...2) { String(format: "%.1f×", $0) }
                        if editor.tool.target != nil {
                            PaperSlider(title: "目标高", value: $editor.targetHeight, range: (editor.tool == .sea || editor.tool == .lake) ? 0...19 : 20...100, step: 1) { "\(Int($0))" }
                        }
                        PaperSwitch(title: "保护现有海岸", on: $editor.protectCoast).padding(.horizontal, -16)
                    }
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

    private func quickTerrainChip(_ title: String, glyph: InkGlyph, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 4) {
                InkIcon(glyph: glyph, size: 13).foregroundStyle(Theme.seal)
                Text(title).font(Theme.caption).foregroundStyle(Theme.ink)
            }
            .padding(.horizontal, 10).frame(height: 30)
            .background(Theme.paper2, in: Capsule())
            .overlay(Capsule().stroke(Theme.line))
        }
        .buttonStyle(PressStyle())
    }

    private struct ScalePreset: Identifiable { let id: String; let title: String; let provinces: Int; let nations: Int }
    private static let scalePresets: [ScalePreset] = [
        ScalePreset(id: "tiny", title: "袖珍", provinces: 60, nations: 6),
        ScalePreset(id: "std", title: "标准", provinces: 100, nations: 10),
        ScalePreset(id: "grand", title: "宏大", provinces: 180, nations: 14),
        ScalePreset(id: "epic", title: "史诗", provinces: 280, nations: 18),
    ]

    private var provinceTools: some View {
        VStack(spacing: 10) {
            HStack(spacing: 6) {
                ForEach(Self.scalePresets) { p in
                    let active = editor.provinces == p.provinces && editor.nations == p.nations
                    Button {
                        GameFeel.shared.tap()
                        editor.provinces = p.provinces
                        editor.nations = p.nations
                        editor.recompute()
                    } label: {
                        VStack(spacing: 1) {
                            Text(p.title).font(Theme.label).foregroundStyle(active ? Theme.paper2 : Theme.ink)
                            Text("\(p.provinces)州 · \(p.nations)国").font(Theme.caption).foregroundStyle(active ? Theme.paper2.opacity(0.85) : Theme.ink2)
                        }
                        .frame(maxWidth: .infinity).frame(height: 40)
                        .background(active ? Theme.seal : Theme.paper2, in: RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous).stroke(active ? Color.clear : Theme.line))
                    }
                    .buttonStyle(PressStyle())
                }
            }
            VStack(spacing: 8) {
                PaperSlider(title: "州郡", value: Binding(get: { Double(editor.provinces) }, set: { editor.provinces = max(editor.nations, Int($0)) }), range: 10...480, step: 5, onEditingChanged: { editing in if !editing { editor.recompute() } }) { "\(Int($0))" }
                PaperSlider(title: "国家", value: Binding(get: { Double(editor.nations) }, set: { editor.nations = Int($0); if editor.provinces < editor.nations { editor.provinces = editor.nations } }), range: 2...24, step: 1, onEditingChanged: { editing in if !editing { editor.recompute() } }) { "\(Int($0))" }
            }
            HStack(spacing: 10) {
                Button { editor.toTerrain() } label: { SecondaryLabel(title: "改地形", symbol: "paintbrush.pointed") }
                Button { editor.toNations() } label: { SecondaryLabel(title: "划定列国", symbol: "flag.2.crossed") }
                    .disabled(editor.busy || editor.map.meta.provinces.isEmpty).opacity(editor.busy || editor.map.meta.provinces.isEmpty ? 0.5 : 1)
                Button { Task { await model.foundCustomWorld(editor) } } label: { PrimaryLabel(title: "开辟天下", symbol: "flag.fill") }
                    .disabled(editor.busy || editor.map.meta.provinces.isEmpty).opacity(editor.busy || editor.map.meta.provinces.isEmpty ? 0.5 : 1)
            }
            .buttonStyle(PressStyle())
        }
    }

    /// 划定列国：一键加国、自然重分、单州／连片画笔，配色与实机开局严格一致。
    private var nationTools: some View {
        VStack(spacing: 10) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 7) {
                    Button { editor.quickAddNation() } label: {
                        HStack(spacing: 4) {
                            InkIcon(glyph: .plus, size: 14).foregroundStyle(Theme.paper2)
                            Text("新建国").font(Theme.label).foregroundStyle(Theme.paper2)
                        }
                        .padding(.horizontal, 11).frame(height: 34)
                        .background(Theme.seal, in: Capsule())
                    }
                    .buttonStyle(PressStyle())
                    .disabled(editor.seeds.count >= 24).opacity(editor.seeds.count >= 24 ? 0.45 : 1)

                    ForEach(editor.seeds.indices, id: \.self) { i in
                        let count = editor.owners.filter { $0 == i }.count
                        let active = editor.selected == i
                        Button { editor.select(i); GameFeel.shared.tap() } label: {
                            HStack(spacing: 6) {
                                Circle().fill(Names.color(editor.nationHex(at: i))).frame(width: 13, height: 13)
                                    .overlay(Circle().stroke(Theme.ink.opacity(0.25), lineWidth: 0.7))
                                Text("\(i + 1)号 · \(count)州").font(Theme.label).foregroundStyle(active ? Theme.seal : Theme.ink)
                            }
                            .padding(.horizontal, 10).frame(height: 34)
                            .background(active ? Theme.seal.opacity(0.14) : Theme.paper2, in: Capsule())
                            .overlay(Capsule().stroke(active ? Theme.seal : Theme.line, lineWidth: active ? 1.5 : 1))
                        }
                        .buttonStyle(PressStyle())
                    }
                }
            }

            HStack(spacing: 6) {
                nationToolButton(.paint, title: "涂疆土", glyph: .brush)
                nationToolButton(.capital, title: "移都城", glyph: .nation)
                nationToolButton(.found, title: "点地建国", glyph: .plus)

                Button {
                    GameFeel.shared.tap()
                    withAnimation(Motion.tap) { editor.paintCluster.toggle() }
                } label: {
                    HStack(spacing: 4) {
                        InkIcon(glyph: .region, size: 15).foregroundStyle(editor.paintCluster ? Theme.paper2 : Theme.ink)
                        Text(editor.paintCluster ? "连片" : "单州").font(Theme.caption).foregroundStyle(editor.paintCluster ? Theme.paper2 : Theme.ink)
                    }
                    .padding(.horizontal, 9).frame(height: 36)
                    .background(editor.paintCluster ? Theme.jade : Theme.paper2, in: RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous).stroke(editor.paintCluster ? Color.clear : Theme.line))
                }
                .buttonStyle(PressStyle())

                Button { editor.rebalanceOrganically() } label: {
                    InkIcon(glyph: .swap, size: 16).foregroundStyle(Theme.ink)
                        .frame(width: 38, height: 36)
                        .background(Theme.paper2, in: RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous).stroke(Theme.line))
                }
                .buttonStyle(PressStyle())
                .accessibilityLabel("自然重分疆域")

                Button { editor.removeSelected() } label: {
                    InkIcon(glyph: .trash, size: 16).foregroundStyle(Theme.seal)
                        .frame(width: 38, height: 36)
                        .background(Theme.paper2, in: RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous).stroke(Theme.line))
                }
                .buttonStyle(PressStyle())
                .disabled(editor.seeds.count <= 2).opacity(editor.seeds.count <= 2 ? 0.38 : 1)
                .accessibilityLabel("删除所选国家")
            }

            Text(nationHint)
                .font(Theme.caption).foregroundStyle(Theme.ink2).frame(maxWidth: .infinity, alignment: .leading).lineLimit(2)

            HStack(spacing: 10) {
                Button { editor.backToProvinces() } label: { SecondaryLabel(title: "返回分州郡", symbol: "square.grid.3x3") }
                Button { Task { await model.foundCustomWorld(editor) } } label: { PrimaryLabel(title: "开辟天下", symbol: "flag.fill") }
            }
            .buttonStyle(PressStyle())
        }
    }

    private func nationToolButton(_ tool: MapEditor.NationTool, title: String, glyph: InkGlyph) -> some View {
        let on = editor.nationTool == tool
        return Button {
            withAnimation(Motion.tap) { editor.nationTool = tool }
            GameFeel.shared.tap()
        } label: {
            HStack(spacing: 4) {
                InkIcon(glyph: glyph, size: 15).foregroundStyle(on ? Theme.paper2 : Theme.ink)
                Text(title).font(Theme.caption).foregroundStyle(on ? Theme.paper2 : Theme.ink).lineLimit(1)
            }
            .padding(.horizontal, 8).frame(maxWidth: .infinity).frame(height: 36)
            .background(on ? Theme.seal : Theme.paper2, in: RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous).stroke(on ? Color.clear : Theme.line))
        }
        .buttonStyle(PressStyle())
    }

    private var nationHint: String {
        switch editor.nationTool {
        case .paint: return editor.paintCluster ? "连片画笔：点涂将一并划入周边邻州；点选别国都城可直接切国。" : "逐州画笔：轻点或划过州郡划入所选国；点右上「⇄」可按山河自然重分。"
        case .capital: return "移都模式：轻点任意州郡设为所选国家的新都城。"
        case .found: return "建国模式：轻点任意非都城州郡在此立国，或直接点左侧「+ 新建国」。"
        }
    }

    private struct BrushPreset: Identifiable { let id: String; let radius: Double; let label: String }
    private static let brushPresets: [BrushPreset] = [
        BrushPreset(id: "s", radius: 16, label: "细"),
        BrushPreset(id: "m", radius: 34, label: "中"),
        BrushPreset(id: "l", radius: 62, label: "阔"),
        BrushPreset(id: "xl", radius: 95, label: "巨"),
    ]

    private func stepPill(_ title: String, active: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(Theme.caption)
                .foregroundStyle(active ? Theme.seal : Theme.ink2)
                .fontWeight(active ? .semibold : .regular)
        }
        .buttonStyle(.plain)
    }
}
