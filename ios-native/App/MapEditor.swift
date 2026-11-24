import SwiftUI
import LieguojiCore

/// 自绘地图 — 完整的手绘地形与划定列国工坊：
/// 1. 「山川」：12 种手绘地形笔刷（深海/海洋/内湖/平原/丘陵/高原/山脉/雪峰/群岛/抬高/压低/平滑），支持左右/四象镜像对称绘图、四色地貌占比仪表、一键海峡/环海盆地/海陆升降/整图平滑/海岸崎岖化；
/// 2. 「州郡」：一键规模预设（袖珍／标准／宏大／史诗）与州郡／国家细调，实时按自然地形与有机分疆预览；
/// 3. 「列国」：直觉化的划定列国——支持单州／连片双模式画笔、一键加国、自然山河重分、迁都、删国、完整撤销／重做。
@MainActor final class MapEditor: ObservableObject {
    enum MirrorMode: String, CaseIterable, Identifiable {
        case none = "自由"
        case horizontal = "左右对称"
        case quad = "四象对称"
        var id: String { rawValue }
    }
    enum Tool: String, CaseIterable, Identifiable {
        case trench, sea, lake, plain, hill, plateau, mountain, peak, island, raise, lower, smooth
        var id: String { rawValue }
        var title: String {
            switch self {
            case .trench: return "深海"
            case .sea: return "浅海"
            case .lake: return "内湖"
            case .plain: return "平原"
            case .hill: return "丘陵"
            case .plateau: return "高原"
            case .mountain: return "山脉"
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
            case .trench: return 3.0
            case .sea: return 11.0
            case .lake: return 15.0
            case .plain: return 27.0
            case .hill: return 43.0
            case .plateau: return 55.0
            case .mountain: return 69.0
            case .peak: return 90.0
            case .island, .raise, .lower, .smooth: return nil
            }
        }
        var glyph: InkGlyph {
            switch self {
            case .trench: return .trench
            case .sea: return .sea
            case .lake: return .lake
            case .plain: return .plain
            case .hill: return .hill
            case .plateau: return .plateau
            case .mountain: return .mountain
            case .peak: return .peak
            case .island: return .island
            case .raise: return .raise
            case .lower: return .lower
            case .smooth: return .smooth
            }
        }
        var swatch: Color {
            switch self {
            case .trench: return Color(red: 0.16, green: 0.29, blue: 0.52)
            case .sea: return Color(red: 0.27, green: 0.48, blue: 0.69)
            case .lake: return Color(red: 0.34, green: 0.65, blue: 0.72)
            case .plain: return Color(red: 0.76, green: 0.83, blue: 0.54)
            case .hill: return Color(red: 0.42, green: 0.64, blue: 0.34)
            case .plateau: return Color(red: 0.74, green: 0.62, blue: 0.38)
            case .mountain: return Color(red: 0.56, green: 0.44, blue: 0.28)
            case .peak: return Color(red: 0.86, green: 0.90, blue: 0.92)
            case .island: return Color(red: 0.52, green: 0.72, blue: 0.54)
            case .raise, .lower, .smooth: return Theme.ink2
            }
        }
    }
    enum Step { case terrain, provinces, nations }

    @Published var tool: Tool = .plain
    @Published var mirror: MirrorMode = .none
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
    @Published private(set) var plainShare = 0.0
    @Published private(set) var hillShare = 0.0
    @Published private(set) var mountainShare = 0.0
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
        var land = 0, plain = 0, hill = 0, mtn = 0
        for h in heights where h >= 20 {
            land += 1
            if h < 38 { plain += 1 }
            else if h < 60 { hill += 1 }
            else { mtn += 1 }
        }
        let total = Double(max(1, heights.count))
        landShare = Double(land) / total
        plainShare = Double(plain) / total
        hillShare = Double(hill) / total
        mountainShare = Double(mtn) / total
    }

    // MARK: drawing

    private var strokeSerial = 0
    func stamp(x: Double, y: Double) {
        guard step == .terrain else { return }
        if strokeStart == nil { strokeStart = heights; strokeSerial &+= 1 }
        var centers: [(Float, Float)] = [(Float(x), Float(y))]
        let mw = map.width, mh = map.height
        if mirror == .horizontal || mirror == .quad {
            centers.append((mw - Float(x), Float(y)))
        }
        if mirror == .quad {
            centers.append((Float(x), mh - Float(y)))
            centers.append((mw - Float(x), mh - Float(y)))
        }
        let r = Float(radius)
        for (px, py) in centers {
            stampOne(px: px, py: py, r: r)
        }
        if Date().timeIntervalSince(lastFlush) > 0.045 { flushQuick() }
    }

    private func stampOne(px: Float, py: Float, r: Float) {
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
            let protect = (tool == .lake || tool == .trench) ? false : protectCoast
            let v = TerrainBrush.height(current: h, target: target, delta: delta, falloff: Double(falloff),
                                        strength: strength, softness: softness, protectCoast: protect)
            if v != heights[c] { heights[c] = v; dirty.insert(c) }
        }
    }

    /// 快捷雕琢：纵贯中央海峡（构造双雄隔海对峙地势）或中央内海盆地（地中海式环陆内海）。
    func carveStrait(inlandSea: Bool) {
        pushTerrainUndo(heights)
        let w = map.width, h = map.height
        for c in 0..<min(heights.count, map.cellCount) {
            let x = map.sites[c * 2], y = map.sites[c * 2 + 1]
            if inlandSea {
                let nx = (x - w * 0.5) / (w * 0.25), ny = (y - h * 0.5) / (h * 0.23)
                let d = (nx * nx + ny * ny).squareRoot()
                if d < 0.92 { heights[c] = UInt8(max(4, min(16, Int(4 + d * 12)))) }
                else if d < 1.38 { heights[c] = max(heights[c], UInt8(min(54, Int(28 + (1.38 - d) * 36)))) }
            } else {
                let bend = sin(y / max(1, h) * .pi * 2.2) * w * 0.055
                let dist = abs(x - (w * 0.5 + bend))
                if dist < w * 0.055 { heights[c] = UInt8(max(4, Int(5 + dist / (w * 0.055) * 11))) }
            }
        }
        GameFeel.shared.tap()
        measureLand(); recompute()
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
    private enum DeckDetent: Int, CaseIterable { case collapsed = 0, compact = 1, standard = 2, expanded = 3 }
    @State private var deckDetent: DeckDetent = .standard
    @State private var showBrushDetail = false
    @GestureState private var deckDragY: CGFloat = 0
    private var collapsed: Bool { deckDetent == .collapsed }

    private var canUndoNow: Bool { editor.step == .terrain ? editor.canUndo : (editor.step == .nations ? editor.canUndoNation : false) }
    private var canRedoNow: Bool { editor.step == .terrain ? editor.canRedo : (editor.step == .nations ? editor.canRedoNation : false) }

    /// 橡皮筋跟手位移（拖拽顶部横条时实时给与柔顺物理反馈）。
    private var rubberBandDragY: CGFloat {
        let d = deckDragY
        if abs(d) <= 44 { return d * 0.58 }
        let extra = abs(d) - 44
        return (d >= 0 ? 1 : -1) * (44 * 0.58 + extra * 0.22)
    }

    private var deckDragGesture: some Gesture {
        DragGesture(minimumDistance: 8, coordinateSpace: .global)
            .updating($deckDragY) { val, state, _ in
                state = val.translation.height
            }
            .onEnded { val in
                let dy = val.translation.height
                let pred = val.predictedEndTranslation.height
                let score = dy * 0.65 + pred * 0.35
                guard abs(score) > 34 else { return }
                GameFeel.shared.tap()
                withAnimation(Motion.sheetSwap) {
                    if score > 0 {
                        // 下拉收窄/收起画板，释放更大地图绘制视野
                        switch deckDetent {
                        case .expanded:
                            deckDetent = .standard
                            showBrushDetail = false
                        case .standard:
                            deckDetent = .compact
                        case .compact, .collapsed:
                            deckDetent = .collapsed
                        }
                    } else {
                        // 上拉展开更多笔刷与细节控制
                        switch deckDetent {
                        case .collapsed:
                            deckDetent = .compact
                        case .compact:
                            deckDetent = .standard
                        case .standard, .expanded:
                            deckDetent = .expanded
                            if editor.step == .terrain { showBrushDetail = true }
                        }
                    }
                }
            }
    }

    var body: some View {
        VStack(spacing: 0) {
            ViewBoundary { topBar }
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
                ViewBoundary { collapsedBar }
                    .offset(y: max(-24, min(14, rubberBandDragY)))
                    .gesture(deckDragGesture)
                    .padding(.bottom, landscape ? 6 : 8)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            } else {
                ViewBoundary { bottomDeck }
                    .offset(y: max(-18, min(36, rubberBandDragY)))
                    .padding(.horizontal, landscape ? 24 : 12)
                    .padding(.bottom, landscape ? 4 : 6)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
            }
        }
        .animation(Motion.sheetSwap, value: editor.step)
        .animation(Motion.sheetSwap, value: deckDetent)
        .animation(Motion.sheetSwap, value: showBrushDetail)
        .sheet(isPresented: $leaving) {
            VStack(alignment: .leading, spacing: 14) {
                SheetHeader(title: "放弃这幅地图？", subtitle: "还没开辟的画稿不会保存", seal: "弃")
                SealButton(title: "放弃并返回标题") { leaving = false; model.closeEditor() }.padding(.horizontal, 22)
                Button { leaving = false } label: { SecondaryLabel(title: "继续绘制", symbol: "paintbrush.pointed") }.buttonStyle(PressStyle()).padding(.horizontal, 22)
            }
            .padding(.bottom, 24)
            .background(MemorialPaper().ignoresSafeArea())
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
            .background(MemorialPaper().ignoresSafeArea())
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
                withAnimation(Motion.sheetSwap) {
                    deckDetent = collapsed ? .standard : .collapsed
                }
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
            withAnimation(Motion.sheetSwap) { deckDetent = .standard }
        } label: {
            VStack(spacing: 3) {
                Capsule()
                    .fill(Theme.ink.opacity(0.24))
                    .frame(width: 32, height: 3.5)
                    .padding(.top, 4)
                HStack(spacing: 8) {
                    InkIcon(glyph: editor.step == .terrain ? editor.tool.glyph : .nation, size: 16, crisp: editor.step == .terrain).foregroundStyle(Theme.seal)
                    Text(editor.step == .terrain ? "正在绘制：\(editor.tool.title)（上滑或点此展开画板）" : "上滑或点此展开「划定列国」画板")
                        .font(Theme.label).foregroundStyle(Theme.ink)
                }
                .padding(.bottom, 6)
            }
            .padding(.horizontal, 18).glass(Capsule())
        }
        .buttonStyle(PressStyle())
    }

    /// 统一顶部拖拽指示条（样式与国家/州郡详情抽屉顶部灰色圆角横条一致，支持上下拖拽切换 收起 / 精简 / 标准 / 展开，轻点快速切换精简/标准）。
    private var deckGrabber: some View {
        VStack(spacing: 0) {
            Capsule()
                .fill(Theme.ink.opacity(0.24))
                .frame(width: 38, height: 4)
        }
        .frame(maxWidth: .infinity)
        .frame(height: 22)
        .contentShape(Rectangle())
        .onTapGesture {
            GameFeel.shared.tap()
            withAnimation(Motion.sheetSwap) {
                if deckDetent == .compact {
                    deckDetent = .standard
                } else {
                    deckDetent = .compact
                    showBrushDetail = false
                }
            }
        }
        .gesture(deckDragGesture)
        .accessibilityLabel("调节画板高度")
    }

    private var bottomDeck: some View {
        VStack(spacing: 0) {
            deckGrabber
            VStack(spacing: landscape ? 8 : 10) {
                switch editor.step {
                case .terrain: ViewBoundary { terrainTools }
                case .provinces: ViewBoundary { provinceTools }
                case .nations: ViewBoundary { nationTools }
                }
            }
            .padding(.horizontal, landscape ? 11 : 14)
            .padding(.bottom, landscape ? 10 : 13)
            .padding(.top, 2)
        }
        .frame(maxWidth: landscape ? 660 : .infinity)
        .glass(RoundedRectangle(cornerRadius: Theme.Control.cornerSheet, style: .continuous))
    }

    private var terrainTools: some View {
        let isCompact = deckDetent == .compact
        return VStack(spacing: landscape ? 8 : (isCompact ? 8 : 10)) {
            // 实时四色地貌占比仪表（海 / 平原 / 丘陵高原 / 山脉雪峰）
            VStack(spacing: 4) {
                GeometryReader { g in
                    let w = max(1, g.size.width)
                    let sea = max(0, 1 - editor.landShare)
                    HStack(spacing: 0) {
                        Rectangle().fill(Color(red: 0.27, green: 0.48, blue: 0.69)).frame(width: w * sea)
                        Rectangle().fill(Color(red: 0.64, green: 0.74, blue: 0.44)).frame(width: w * editor.plainShare)
                        Rectangle().fill(Color(red: 0.66, green: 0.56, blue: 0.34)).frame(width: w * editor.hillShare)
                        Rectangle().fill(Color(red: 0.46, green: 0.36, blue: 0.24)).frame(width: w * editor.mountainShare)
                    }
                    .clipShape(Capsule())
                }
                .frame(height: 5)
                HStack(spacing: 10) {
                    Text("海 \(Int((1 - editor.landShare) * 100))%").foregroundStyle(Color(red: 0.22, green: 0.40, blue: 0.58))
                    Text("平 \(Int(editor.plainShare * 100))%").foregroundStyle(Theme.jade)
                    Text("丘 \(Int(editor.hillShare * 100))%").foregroundStyle(Theme.gold)
                    Text("山 \(Int(editor.mountainShare * 100))%").foregroundStyle(Theme.ink2)
                    Spacer()
                    Text(isCompact ? "精简 · \(editor.mirror.rawValue)" : editor.mirror.rawValue)
                        .foregroundStyle(editor.mirror == .none ? Theme.ink2 : Theme.seal)
                }
                .font(Theme.caption).monospacedDigit()
            }

            if isCompact {
                // 精简态：单排横向 12 笔刷 + 快捷笔径与下一步，释放 ~45% 地图绘景视野
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 5) {
                        ForEach(MapEditor.Tool.allCases) { t in
                            brushTile(t, width: 52, height: 42)
                        }
                    }
                }
                HStack(spacing: 6) {
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
                    Spacer(minLength: 6)
                    Button { editor.toProvinces() } label: {
                        HStack(spacing: 5) {
                            InkIcon(glyph: .region, size: 13.5).foregroundStyle(Theme.paper2)
                            Text("下一步：分州郡").font(Theme.label).foregroundStyle(Theme.paper2)
                        }
                        .padding(.horizontal, 13).frame(height: 32)
                        .background(Theme.seal, in: Capsule())
                    }
                    .buttonStyle(PressStyle())
                    .disabled(editor.landShare < 0.03).opacity(editor.landShare < 0.03 ? 0.5 : 1)
                }
            } else {
                // 12 种笔刷 6×2（横屏 12×1）严格对齐排布
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 5), count: landscape ? 12 : 6), spacing: 5) {
                    ForEach(MapEditor.Tool.allCases) { t in
                        brushTile(t, width: nil, height: landscape ? 42 : 46)
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

                // 一键地形快捷雕琢条（含对称绘图切换、双陆海峡、环海盆地）
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        quickTerrainChip("对称：\(editor.mirror.rawValue)", glyph: .swap, active: editor.mirror != .none) {
                            GameFeel.shared.tap()
                            let all = MapEditor.MirrorMode.allCases
                            let idx = (all.firstIndex(of: editor.mirror) ?? 0) + 1
                            editor.mirror = all[idx % all.count]
                        }
                        quickTerrainChip("中央海峡", glyph: .sea) { editor.carveStrait(inlandSea: false) }
                        quickTerrainChip("环陆内海", glyph: .lake) { editor.carveStrait(inlandSea: true) }
                        quickTerrainChip("抬海陆", glyph: .raise) { editor.shiftElevation(4) }
                        quickTerrainChip("降海面", glyph: .lower) { editor.shiftElevation(-4) }
                        quickTerrainChip("整图平滑", glyph: .smooth) { editor.smoothWholeMap() }
                        quickTerrainChip("海岸崎岖", glyph: .mountain) { editor.roughenCoasts() }
                        quickTerrainChip("随机新图", glyph: .refresh) { editor.randomizeCurrentTemplate() }
                        quickTerrainChip("换底图", glyph: .views) { pickingBase = true }
                    }
                }

                if !landscape {
                    VStack(spacing: 6) {
                        Button {
                            GameFeel.shared.tap()
                            withAnimation(Motion.sheetSwap) {
                                showBrushDetail.toggle()
                                deckDetent = showBrushDetail ? .expanded : .standard
                            }
                        } label: {
                            HStack(spacing: 8) {
                                SectionLabel("笔触细节与保护海岸", inset: false)
                                Spacer()
                                InkIcon(glyph: .chevronDown, size: 14, weight: 1.7)
                                    .foregroundStyle(Theme.ink2)
                                    .rotationEffect(.degrees(showBrushDetail ? 180 : 0))
                            }
                            .frame(height: 30)
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)

                        if showBrushDetail {
                            VStack(spacing: 8) {
                                PaperSlider(title: "强度", value: $editor.strength, range: 0.2...2) { String(format: "%.1f×", $0) }
                                PaperSlider(title: "柔和", value: $editor.softness, range: 0.3...2) { String(format: "%.1f×", $0) }
                                if editor.tool.target != nil {
                                    PaperSlider(title: "目标高", value: $editor.targetHeight, range: (editor.tool == .trench || editor.tool == .sea || editor.tool == .lake) ? 0...19 : 20...100, step: 1) { "\(Int($0))" }
                                }
                                PaperSwitch(title: "保护现有海岸", on: $editor.protectCoast).padding(.horizontal, -16)
                            }
                            .transition(.opacity.combined(with: .move(edge: .top)))
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
    }

    private func brushTile(_ t: MapEditor.Tool, width: CGFloat?, height: CGFloat) -> some View {
        let on = editor.tool == t
        let accentColor: Color? = {
            if t.target == nil && t != .island { return nil }
            if on { return Theme.paper2.opacity(t == .peak ? 0.42 : 0.24) }
            return t.swatch.opacity(t == .peak ? 0.72 : 0.36)
        }()
        return Button {
            withAnimation(Motion.tap) {
                editor.tool = t
                if let h = t.target { editor.targetHeight = h }
            }
            GameFeel.shared.tap()
        } label: {
            VStack(spacing: 3) {
                InkIcon(glyph: t.glyph, size: 18, weight: 1.55, accent: accentColor, crisp: true)
                    .foregroundStyle(on ? Theme.paper2 : Theme.ink)
                    .frame(height: 19)
                Text(t.title)
                    .font(Theme.caption)
                    .foregroundStyle(on ? Theme.paper2 : Theme.ink)
                    .lineLimit(1)
                    .minimumScaleFactor(0.85)
            }
            .frame(width: width, height: height)
            .frame(maxWidth: width == nil ? .infinity : nil)
            .background(on ? Theme.seal : Theme.paper2, in: RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous))
            .overlay(alignment: .topTrailing) {
                if t.target != nil || t == .island {
                    Circle()
                        .fill(on ? Theme.paper2.opacity(0.82) : t.swatch)
                        .frame(width: 4.5, height: 4.5)
                        .overlay(Circle().stroke(on ? Theme.seal.opacity(0.35) : Theme.ink.opacity(0.18), lineWidth: 0.5))
                        .padding(4.5)
                }
            }
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous)
                    .stroke(on ? Theme.gold.opacity(0.42) : Theme.line, lineWidth: on ? 1 : 0.8)
            )
        }
        .buttonStyle(PressStyle())
    }

    private func quickTerrainChip(_ title: String, glyph: InkGlyph, active: Bool = false, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 4) {
                InkIcon(glyph: glyph, size: 13).foregroundStyle(active ? Theme.paper2 : Theme.seal)
                Text(title).font(Theme.caption).foregroundStyle(active ? Theme.paper2 : Theme.ink)
            }
            .padding(.horizontal, 10).frame(height: 30)
            .background(active ? Theme.seal : Theme.paper2, in: Capsule())
            .overlay(Capsule().stroke(active ? Color.clear : Theme.line))
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
