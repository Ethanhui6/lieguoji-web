import SwiftUI
import LieguojiCore

/// 自绘地图 2.0 — 全功能手绘山川、手绘州郡与划定列国工坊：
/// 1. 「山川」：13 种手绘笔刷（含区域 BFS「填充笔」+ 深海/浅海/内湖/平原/丘陵/高原/山脉/雪峰/群岛/抬高/压低/平滑），
///    支持「纯白海洋」「纯陆平原」「单岛起步」与全部随机模板，一键「依陆生景」（保留手绘海岸自动生成山脉/丘陵/雪峰/内陆湖/河流）、
///    「生山脉」「生内湖」「清空成海」与镜像对称绘图；
/// 2. 「州郡」：支持「自动划州」（四档预设与滑条）与「手绘州郡」（涂画州界、填充州域、吸管取州、新建州、整理边界、完整撤销重做），
///    玩家手绘的州界直接进入实机推演；
/// 3. 「列国」：支持「涂疆土」「区域填国（BFS 一键填满整片领土）」「移都城」「点地建国」「单州/连片」「山河重分」「删国」与完整撤销重做。
@MainActor final class MapEditor: ObservableObject {
    enum MirrorMode: String, CaseIterable, Identifiable {
        case none = "自由"
        case horizontal = "左右对称"
        case quad = "四象对称"
        var id: String { rawValue }
    }
    enum BaseCanvas: String, CaseIterable, Identifiable {
        case blankOcean = "纯白海洋（100% 空白手绘）"
        case blankPlain = "纯陆平原（从零雕海生山）"
        case singleIsland = "空白海洋（中心一座小岛）"
        var id: String { rawValue }
    }
    enum Tool: String, CaseIterable, Identifiable {
        case plain, hill, mountain, peak, lake, sea, trench, plateau, island, fill, raise, lower, smooth
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
            case .fill: return "填充笔"
            case .raise: return "抬高"
            case .lower: return "压低"
            case .smooth: return "平滑"
            }
        }
        /// 塑形笔刷的目标海拔（nil 表示相对增减／滤镜／填充笔刷）。
        var target: Double? {
            switch self {
            case .trench: return 3.0
            case .sea: return 11.0
            case .lake: return 14.0
            case .plain: return 27.0
            case .hill: return 43.0
            case .plateau: return 55.0
            case .mountain: return 69.0
            case .peak: return 90.0
            case .island, .fill, .raise, .lower, .smooth: return nil
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
            case .fill: return .views
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
            case .fill: return Theme.seal
            case .raise, .lower, .smooth: return Theme.ink2
            }
        }
    }
    enum FillTarget: String, CaseIterable, Identifiable {
        case plain, hill, plateau, mountain, lake, sea, trench
        var id: String { rawValue }
        var title: String {
            switch self {
            case .plain: return "填平原"
            case .hill: return "填丘陵"
            case .plateau: return "填高原"
            case .mountain: return "填山脉"
            case .lake: return "填内湖"
            case .sea: return "填浅海"
            case .trench: return "填深海"
            }
        }
        var height: UInt8 {
            switch self {
            case .plain: return 27
            case .hill: return 43
            case .plateau: return 55
            case .mountain: return 70
            case .lake: return 14
            case .sea: return 11
            case .trench: return 4
            }
        }
    }
    enum Step { case terrain, provinces, nations }
    enum ProvinceMode: String, CaseIterable, Identifiable {
        case auto = "自动划州"
        case manual = "手绘州郡"
        var id: String { rawValue }
    }
    enum ProvinceTool: String, CaseIterable, Identifiable {
        case brush = "涂画州界"
        case fill = "填充州域"
        case pick = "吸管取州"
        var id: String { rawValue }
        var glyph: InkGlyph {
            switch self {
            case .brush: return .brush
            case .fill: return .views
            case .pick: return .locate
            }
        }
    }

    @Published var tool: Tool = .plain
    @Published var fillTarget: FillTarget = .plain
    @Published var mirror: MirrorMode = .none
    @Published var radius: Double = 34 { didSet { controller.brushRadius = radius } }
    @Published var strength = 1.0
    @Published var softness = 1.0
    @Published var protectCoast = false
    @Published var targetHeight = 27.0
    @Published var step: Step = .terrain
    @Published var provinces = 100
    @Published var nations = 8
    @Published var provinceMode: ProvinceMode = .auto
    @Published var provinceTool: ProvinceTool = .brush
    @Published var activeProvinceId: Int = 0
    @Published private(set) var provincePaletteIds: [Int] = []
    @Published private(set) var busy = false
    @Published private(set) var canUndo = false
    @Published private(set) var canRedo = false
    @Published private(set) var canUndoProvince = false
    @Published private(set) var canRedoProvince = false
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
    /// 玩家在 Step 2 手绘模式下定制的逐格州郡编号（-1 表示海洋/未涂）；自动划州模式时为 nil。
    private(set) var customProvinceCells: [Int]?
    private let controller: MapController
    private var undo: [[UInt8]] = [], redo: [[UInt8]] = []
    private var strokeStart: [UInt8]?
    private var provinceUndo: [[Int]] = [], provinceRedo: [[Int]] = []
    private var provinceStrokeStart: [Int]?
    private var lastFlush = Date.distantPast
    private var dirty = Set<Int>()
    private let neighbors: [[Int]]
    private let buckets: [Int64: [Int]]
    private let bucket: Float = 24
    private var sculptSerial = 0

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

    /// 查找距离世界坐标最近的 Voronoi 格编号（供填充笔与手绘州郡使用）。
    private func nearestCell(x px: Float, y py: Float) -> Int? {
        let bx0 = Int64(floor(px / bucket)), by0 = Int64(floor(py / bucket))
        var best = -1, bestD2: Float = .greatestFiniteMagnitude
        for dx in -2...2 {
            for dy in -2...2 {
                let key = (bx0 + Int64(dx)) << 32 | ((by0 + Int64(dy)) & 0xFFFF_FFFF)
                for c in buckets[key] ?? [] {
                    let rx = map.sites[c * 2] - px, ry = map.sites[c * 2 + 1] - py
                    let d2 = rx * rx + ry * ry
                    if d2 < bestD2 { bestD2 = d2; best = c }
                }
            }
        }
        return best >= 0 ? best : nil
    }

    // MARK: Step 1 山川绘制 & 区域填充笔

    private var strokeSerial = 0
    func stamp(x: Double, y: Double) {
        if step == .provinces && provinceMode == .manual {
            stampProvince(x: x, y: y)
            return
        }
        guard step == .terrain else { return }
        if tool == .fill {
            // 填充笔仅在落笔瞬间触发一次 BFS 区域填充（避免拖拽重复触发）
            guard strokeStart == nil else { return }
            strokeStart = heights
            floodFillTerrain(x: Float(x), y: Float(y))
            return
        }
        if strokeStart == nil { strokeStart = heights; strokeSerial &+= 1 }
        var centers: [(Float, Float)] = [(Float(x), Float(y))]
        let mw = map.width, mh = map.height
        if mirror == .horizontal || mirror == .quad { centers.append((mw - Float(x), Float(y))) }
        if mirror == .quad { centers.append((Float(x), mh - Float(y))); centers.append((mw - Float(x), mh - Float(y))) }
        let r = Float(radius)
        for (px, py) in centers { stampOne(px: px, py: py, r: r) }
        if Date().timeIntervalSince(lastFlush) > 0.045 { flushQuick() }
    }

    /// BFS 区域填充笔：点击任意海湾/大陆/内湖/地形区块，一键填满相连同域。
    private func floodFillTerrain(x px: Float, y py: Float) {
        guard let startCell = nearestCell(x: px, y: py), startCell < heights.count else { return }
        let startH = heights[startCell]
        let targetH = fillTarget.height
        func band(_ h: UInt8) -> Int {
            if h < 20 { return 0 } // 水域
            if h < 38 { return 1 } // 平原
            if h < 58 { return 2 } // 丘陵高原
            return 3               // 山脉雪峰
        }
        let startIsLand = startH >= 20
        let targetIsLand = targetH >= 20
        let startBand = band(startH)
        // 水→陆 或 陆→水 时按海陆整片连通域填充；陆→陆 时按同海拔地貌带填充
        let matchByLandOnly = (startIsLand != targetIsLand)
        var visited = [Bool](repeating: false, count: heights.count)
        var queue = [startCell]
        visited[startCell] = true
        var head = 0
        while head < queue.count {
            let cur = queue[head]; head += 1
            if heights[cur] != targetH {
                heights[cur] = targetH
                dirty.insert(cur)
            }
            guard cur < neighbors.count else { continue }
            for nb in neighbors[cur] where nb < heights.count && !visited[nb] {
                let nh = heights[nb]
                let matches = matchByLandOnly ? ((nh >= 20) == startIsLand) : ((nh >= 20) == startIsLand && band(nh) == startBand)
                if matches {
                    visited[nb] = true
                    queue.append(nb)
                }
            }
        }
        GameFeel.shared.notify(.success)
        flushQuick()
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
            if tool == .island {
                target = nil
                var hash = UInt32(truncatingIfNeeded: c) &* 2654435761 ^ UInt32(truncatingIfNeeded: strokeSerial) &* 40503
                hash ^= hash >> 13; hash = hash &* 0x5bd1e995; hash ^= hash >> 15
                let cellNoise = Double(hash & 0xFF) / 255.0
                let cluster = sin(Double(map.sites[c * 2]) * 0.14 + Double(strokeSerial)) * cos(Double(map.sites[c * 2 + 1]) * 0.14 - Double(strokeSerial) * 0.7)
                delta = (cluster + (cellNoise - 0.5) * 0.55 > 0.12) ? (5.5 + cellNoise * 6.5) : -1.5
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

    /// 依陆生景：保留手绘海岸轮廓，一键在已绘陆地上自动生成山脉、丘陵、雪峰、内陆淡水湖与河流气候！
    func autoSculpt(mode: PreviewWorld.AutoSculptMode) {
        guard landShare >= 0.01 else {
            message = "请先在海面上画出陆地轮廓，再使用「依陆生景」"
            GameFeel.shared.notify(.warning)
            return
        }
        pushTerrainUndo(heights)
        sculptSerial &+= 1
        let sculptSeed = "\(seed)|sculpt|\(sculptSerial)"
        heights = PreviewWorld.autoSculptTerrain(graph: inputs.grid, heights: heights, seed: sculptSeed, mode: mode)
        customProvinceCells = nil
        message = mode == .full ? "已依手绘海岸自动生成山脉、丘陵、雪峰与内陆湖" : (mode == .mountains ? "已在陆地腹地生成自然山脉脊线" : "已在内陆盆地雕琢淡水湖泊")
        GameFeel.shared.notify(.success)
        measureLand(); recompute()
    }

    /// 快捷雕琢：纵贯中央海峡或中央环陆内海。
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
        customProvinceCells = nil
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
        if step == .provinces && provinceMode == .manual {
            endProvinceStroke()
            return
        }
        guard let start = strokeStart else { return }
        strokeStart = nil
        flushQuick()
        if start != heights {
            pushTerrainUndo(start)
            customProvinceCells = nil
        }
        measureLand()
        recompute()
    }

    private func pushTerrainUndo(_ snapshot: [UInt8]) {
        undo.append(snapshot)
        if undo.count > 40 { undo.removeFirst() }
        redo.removeAll()
        canUndo = !undo.isEmpty; canRedo = false
    }

    func undoStroke() { guard let prev = undo.popLast() else { return }; redo.append(heights); heights = prev; customProvinceCells = nil; canUndo = !undo.isEmpty; canRedo = true; GameFeel.shared.tap(); measureLand(); recompute() }
    func redoStroke() { guard let next = redo.popLast() else { return }; undo.append(heights); heights = next; customProvinceCells = nil; canUndo = true; canRedo = !redo.isEmpty; GameFeel.shared.tap(); measureLand(); recompute() }

    // MARK: 一键地形与空白底图

    func shiftElevation(_ delta: Int) {
        pushTerrainUndo(heights)
        heights = heights.map { UInt8(max(2, min(98, Int($0) + delta))) }
        customProvinceCells = nil
        GameFeel.shared.tap()
        measureLand(); recompute()
    }

    func smoothWholeMap() {
        pushTerrainUndo(heights)
        var next = heights
        for c in 0..<min(heights.count, neighbors.count) {
            let ns = neighbors[c]; guard !ns.isEmpty else { continue }
            var sum = Int(heights[c]) * 2
            for nb in ns where nb < heights.count { sum += Int(heights[nb]) }
            next[c] = UInt8(max(0, min(100, sum / (ns.count + 2))))
        }
        heights = next; customProvinceCells = nil
        GameFeel.shared.tap()
        measureLand(); recompute()
    }

    func roughenCoasts() {
        pushTerrainUndo(heights)
        strokeSerial &+= 1
        var next = heights
        for c in 0..<heights.count {
            let h = Int(heights[c]); guard h >= 12 && h <= 82 else { continue }
            var hash = UInt32(truncatingIfNeeded: c) &* 2654435761 ^ UInt32(truncatingIfNeeded: strokeSerial) &* 40503
            hash ^= hash >> 13; hash = hash &* 0x5bd1e995; hash ^= hash >> 15
            next[c] = UInt8(max(2, min(98, h + Int(hash % 9) - 4)))
        }
        heights = next; customProvinceCells = nil
        GameFeel.shared.tap()
        measureLand(); recompute()
    }

    /// 切换空白底图（纯白海洋 / 纯陆平原 / 单岛起步）。
    func resetToBlank(_ canvas: BaseCanvas) {
        pushTerrainUndo(heights)
        let n = inputs.grid.points.count
        switch canvas {
        case .blankOcean:
            heights = [UInt8](repeating: 6, count: n)
            tool = .plain; targetHeight = 27
            message = "已铺开纯白海洋底图，可直接用「平原」或「群岛」绘制大陆"
        case .blankPlain:
            heights = [UInt8](repeating: 28, count: n)
            tool = .sea; targetHeight = 11
            message = "已铺开纯陆平原底图，可雕凿海域与内湖，或点「依陆生景」造山"
        case .singleIsland:
            heights = Self.island(inputs: inputs, map: map)
            tool = .plain; targetHeight = 27
            message = "已重置为中心单岛底图"
        }
        customProvinceCells = nil
        GameFeel.shared.tap()
        measureLand(); recompute()
    }

    func reset(template: String?, seed: String) {
        pushTerrainUndo(heights)
        if let template { heights = TerrainGenerator.generate(graph: inputs.grid, seed: seed, template: template) }
        else { heights = Self.island(inputs: inputs, map: map) }
        customProvinceCells = nil; message = ""
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

    // MARK: Step 2 手绘州郡（自由涂画州界 + 区域填充 + 吸管 + 新建州 + 撤销重做）

    func setProvinceMode(_ mode: ProvinceMode) {
        guard provinceMode != mode else { return }
        provinceMode = mode
        message = ""
        if mode == .manual {
            // 将当前预览图的州郡归属快照进可手绘格网
            if customProvinceCells == nil || customProvinceCells?.count != heights.count {
                var cells = [Int](repeating: -1, count: heights.count)
                let limit = min(heights.count, map.province.count)
                for c in 0..<limit where heights[c] >= 20 {
                    cells[c] = max(0, Int(map.province[c]))
                }
                customProvinceCells = cells
            }
            refreshProvincePalette()
            controller.terrainBrush = true
            controller.mode = .political
            applyManualProvinceColors()
        } else {
            controller.terrainBrush = false
            customProvinceCells = nil
            provinceUndo.removeAll(); provinceRedo.removeAll()
            canUndoProvince = false; canRedoProvince = false
            recompute()
        }
        GameFeel.shared.tap()
    }

    private func refreshProvincePalette() {
        guard let cells = customProvinceCells else { provincePaletteIds = []; return }
        var seen = Set<Int>()
        for v in cells where v >= 0 { seen.insert(v) }
        seen.insert(activeProvinceId)
        provincePaletteIds = seen.sorted()
        if !provincePaletteIds.contains(activeProvinceId), let first = provincePaletteIds.first { activeProvinceId = first }
    }

    func addNewManualProvince() {
        guard step == .provinces, provinceMode == .manual else { return }
        let nextId = (provincePaletteIds.max() ?? -1) + 1
        activeProvinceId = nextId
        provinceTool = .brush
        refreshProvincePalette()
        message = "已新建第 \(nextId + 1) 号州郡，可在陆地上直接涂画州界"
        GameFeel.shared.tap()
    }

    private func pushProvinceUndo(_ snap: [Int]) {
        provinceUndo.append(snap)
        if provinceUndo.count > 40 { provinceUndo.removeFirst() }
        provinceRedo.removeAll()
        canUndoProvince = !provinceUndo.isEmpty; canRedoProvince = false
    }

    func undoProvince() {
        guard let prev = provinceUndo.popLast(), let cur = customProvinceCells else { return }
        provinceRedo.append(cur)
        customProvinceCells = prev
        canUndoProvince = !provinceUndo.isEmpty; canRedoProvince = true
        refreshProvincePalette()
        rebuildManualProvinces()
        GameFeel.shared.tap()
    }

    func redoProvince() {
        guard let next = provinceRedo.popLast(), let cur = customProvinceCells else { return }
        provinceUndo.append(cur)
        customProvinceCells = next
        canUndoProvince = true; canRedoProvince = !provinceRedo.isEmpty
        refreshProvincePalette()
        rebuildManualProvinces()
        GameFeel.shared.tap()
    }

    private func stampProvince(x: Double, y: Double) {
        guard var cells = customProvinceCells else { return }
        let px = Float(x), py = Float(y)
        switch provinceTool {
        case .pick:
            guard let c = nearestCell(x: px, y: py), c < cells.count, heights[c] >= 20, cells[c] >= 0 else { return }
            if activeProvinceId != cells[c] {
                activeProvinceId = cells[c]
                message = "已取样第 \(activeProvinceId + 1) 号州郡"
                GameFeel.shared.tap()
            }
            provinceTool = .brush
            return
        case .fill:
            guard provinceStrokeStart == nil else { return }
            guard let start = nearestCell(x: px, y: py), start < cells.count, heights[start] >= 20 else { return }
            let orig = cells[start]
            guard orig != activeProvinceId else { return }
            provinceStrokeStart = cells
            var visited = [Bool](repeating: false, count: cells.count)
            var q = [start]; visited[start] = true; var head = 0
            while head < q.count {
                let cur = q[head]; head += 1
                cells[cur] = activeProvinceId
                guard cur < neighbors.count else { continue }
                for nb in neighbors[cur] where nb < cells.count && !visited[nb] && heights[nb] >= 20 && cells[nb] == orig {
                    visited[nb] = true; q.append(nb)
                }
            }
            customProvinceCells = cells
            GameFeel.shared.notify(.success)
            applyManualProvinceColors()
            return
        case .brush:
            if provinceStrokeStart == nil { provinceStrokeStart = cells }
            let r = Float(max(12, min(65, radius * 0.72)))
            let x0 = Int64(floor((px - r) / bucket)), x1 = Int64(floor((px + r) / bucket))
            let y0 = Int64(floor((py - r) / bucket)), y1 = Int64(floor((py + r) / bucket))
            var changed = false
            for bx in x0...x1 { for by in y0...y1 {
                for c in buckets[bx << 32 | (by & 0xFFFF_FFFF)] ?? [] where c < cells.count && heights[c] >= 20 {
                    let dx = map.sites[c * 2] - px, dy = map.sites[c * 2 + 1] - py
                    if dx * dx + dy * dy <= r * r && cells[c] != activeProvinceId {
                        cells[c] = activeProvinceId; changed = true
                    }
                }
            } }
            if changed {
                customProvinceCells = cells
                if Date().timeIntervalSince(lastFlush) > 0.05 { applyManualProvinceColors() }
            }
        }
    }

    private func endProvinceStroke() {
        guard let start = provinceStrokeStart, let cur = customProvinceCells else { return }
        provinceStrokeStart = nil
        if start != cur { pushProvinceUndo(start) }
        refreshProvincePalette()
        rebuildManualProvinces()
    }

    /// 实时刷新手绘州郡的屏幕配色（零卡顿即时反馈，每个州拥有清晰独立色块与州界线）。
    private func applyManualProvinceColors() {
        lastFlush = Date()
        guard let cells = customProvinceCells else { return }
        let limit = min(map.cellCount, cells.count)
        let palette = PreviewWorld.palette
        var maxPid = 0
        for c in 0..<limit {
            let pid = heights[c] >= 20 ? max(0, cells[c]) : -1
            map.province[c] = Int32(pid)
            if pid > maxPid { maxPid = pid }
        }
        let pCount = max(1, maxPid + 1)
        map.meta.provinces = (0..<pCount).map { i in
            WorldMeta.Province(id: "p-\(i)", name: "", x: 0, y: 0, nation: i % palette.count, terrain: "plain")
        }
        map.meta.nations = palette.indices.map { i in
            let hex = palette[i]
            return WorldMeta.Nation(id: "n-\(i)", name: "", color: hex, line: NativeEngine.stateLineColor(hex), capital: 0, culture: "", polity: "", religion: "")
        }
        show(map, sea: false)
    }

    /// 将手绘州郡格网后台规整为合法闭合多边形州郡，确保可无缝进入 Step 3「列国」与实机开局。
    func rebuildManualProvinces() {
        guard let cells = customProvinceCells else { return }
        computing += 1
        let ticket = computing, input = inputs, h = heights, n = nations
        busy = true
        Task.detached(priority: .userInitiated) {
            let built = PreviewWorld.buildCustomProvinces(input, heights: h, cellProvinces: cells, nations: n)
            await MainActor.run {
                guard ticket == self.computing else { return }
                self.busy = false
                if let built {
                    self.map = built
                    self.provinces = built.meta.provinces.count
                    self.message = ""
                    self.show(built, sea: false)
                } else {
                    self.message = "至少需手绘 2 个互异州郡区域"
                }
            }
        }
    }

    private var computing = 0
    /// 后台重算气候与州郡分区；在州郡步骤中同步应用自然山河分疆，呈现非方正的有机列国版图。
    func recompute() {
        if step == .provinces && provinceMode == .manual && customProvinceCells != nil {
            rebuildManualProvinces()
            return
        }
        computing += 1
        let ticket = computing, input = inputs, h = heights, step = step, n = nations, p = provinces, seedStr = seed
        busy = true
        Task.detached(priority: .userInitiated) {
            var built: WorldMap = step == .provinces ? PreviewWorld.build(input, heights: h, nations: n, cities: p) : PreviewWorld.terrain(input, heights: h).map
            if step == .provinces && !built.meta.provinces.isEmpty && !built.meta.cities.isEmpty {
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
                if step == .provinces && finalBuilt.meta.provinces.isEmpty { self.message = "陆地太少，无法划分州郡" } else if self.message == "陆地太少，无法划分州郡" { self.message = "" }
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
        controller.terrainBrush = (provinceMode == .manual)
        controller.mode = .political
        recompute()
    }
    func toTerrain() {
        releasePaint()
        step = .terrain
        provinceMode = .auto
        controller.terrainBrush = true
        controller.mode = .terrain
        recompute()
    }

    // MARK: Step 3 划定列国（逐州涂抹 / 连片画笔 / 区域填国 BFS / 移都 / 建国 / 自然重分 / 撤销重做）

    @Published private(set) var owners: [Int] = []
    @Published private(set) var seeds: [Int] = []
    @Published private(set) var nationHexes: [String] = []
    @Published var selected = 0
    @Published var paintCluster = false
    enum NationTool: String { case paint, fill, capital, found }
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
        controller.terrainBrush = (provinceMode == .manual)
        recompute()
    }

    private func pushNationUndo() {
        nationUndo.append((owners, seeds, selected))
        if nationUndo.count > 40 { nationUndo.removeFirst() }
        nationRedo.removeAll()
        canUndoNation = !nationUndo.isEmpty; canRedoNation = false
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

    func tap(_ p: Int) {
        guard step == .nations, owners.indices.contains(p) else { return }
        message = ""
        let capitalOf = seeds.firstIndex(of: p)
        switch nationTool {
        case .paint:
            if let cap = capitalOf {
                if cap != selected { select(cap); GameFeel.shared.tap() }
                return
            }
            guard seeds.indices.contains(selected) else { return }
            var targets = [p]
            if paintCluster && regionNeighbors.indices.contains(p) {
                for nb in regionNeighbors[p] where owners.indices.contains(nb) && !seeds.contains(nb) { targets.append(nb) }
            }
            let changing = targets.filter { owners[$0] != selected }
            guard !changing.isEmpty else { return }
            pushNationUndo()
            for t in changing { owners[t] = selected }
        case .fill:
            // 区域填国 BFS：点击某国一片连续领土，一键将相连同属非都城州全部划归所选国！
            guard seeds.indices.contains(selected) else { return }
            let origOwner = owners[p]
            guard origOwner != selected else { return }
            var visited = [Bool](repeating: false, count: owners.count)
            var q = [p]; visited[p] = true; var head = 0
            var targets = [Int]()
            while head < q.count {
                let cur = q[head]; head += 1
                if !seeds.contains(cur) { targets.append(cur) }
                guard regionNeighbors.indices.contains(cur) else { continue }
                for nb in regionNeighbors[cur] where owners.indices.contains(nb) && !visited[nb] && owners[nb] == origOwner {
                    visited[nb] = true; q.append(nb)
                }
            }
            guard !targets.isEmpty else { message = "此处仅为敌国都城，请改用「移都」或「删国」"; return }
            pushNationUndo()
            for t in targets { owners[t] = selected }
            GameFeel.shared.notify(.success)
            applyLayout()
            return
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
            if regionNeighbors.indices.contains(p) {
                for nb in regionNeighbors[p].prefix(2) where owners.indices.contains(nb) && !seeds.contains(nb) { owners[nb] = newIdx }
            }
            selected = newIdx; controller.paintNation = selected; nationTool = .paint
        }
        GameFeel.shared.tap()
        applyLayout()
    }

    func quickAddNation() {
        guard step == .nations, !owners.isEmpty else { return }
        guard seeds.count < 24 else { message = "最多设立 24 个国家"; GameFeel.shared.notify(.warning); return }
        let used = Set(seeds), provs = map.meta.provinces
        var best = -1, bestDist: Float = -1
        for i in provs.indices where !used.contains(i) {
            let d = seeds.map { s -> Float in let dx = provs[i].x - provs[s].x, dy = provs[i].y - provs[s].y; return dx * dx + dy * dy }.min() ?? 0
            if d > bestDist { bestDist = d; best = i }
        }
        guard best >= 0 else { message = "已无空闲州郡可供建国"; return }
        pushNationUndo()
        seeds.append(best)
        let newIdx = seeds.count - 1
        owners[best] = newIdx
        if regionNeighbors.indices.contains(best) {
            for nb in regionNeighbors[best].prefix(3) where owners.indices.contains(nb) && !seeds.contains(nb) { owners[nb] = newIdx }
        }
        selected = newIdx; controller.paintNation = selected; nationTool = .paint; message = ""
        GameFeel.shared.tap()
        applyLayout()
    }

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

    func select(_ n: Int) { selected = n; controller.paintNation = n; if nationTool != .fill { nationTool = .paint } }

    func nationHex(at index: Int) -> String {
        if nationHexes.indices.contains(index) { return nationHexes[index] }
        return PreviewWorld.palette[index % PreviewWorld.palette.count]
    }

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

// MARK: - 自绘地图 2.0 界面（零重叠疏朗古籍排版，拆分独立子视图保持低栈深）

struct EditorView: View {
    @ObservedObject var model: GameModel
    @ObservedObject var editor: MapEditor
    @Environment(\.verticalSizeClass) private var verticalClass
    private var landscape: Bool { verticalClass == .compact }
    @State private var leaving = false
    @State private var pickingBase = false
    enum DeckDetent: Int, CaseIterable { case collapsed = 0, compact = 1, standard = 2, expanded = 3 }
    @State private var deckDetent: DeckDetent = .standard
    @State private var showBrushDetail = false
    @GestureState private var deckDragY: CGFloat = 0
    private var collapsed: Bool { deckDetent == .collapsed }

    private var rubberBandDragY: CGFloat {
        let d = deckDragY
        if abs(d) <= 44 { return d * 0.58 }
        return (d >= 0 ? 1 : -1) * (44 * 0.58 + (abs(d) - 44) * 0.22)
    }

    private var deckDragGesture: some Gesture {
        DragGesture(minimumDistance: 8, coordinateSpace: .global)
            .updating($deckDragY) { val, state, _ in state = val.translation.height }
            .onEnded { val in
                let score = val.translation.height * 0.65 + val.predictedEndTranslation.height * 0.35
                guard abs(score) > 34 else { return }
                GameFeel.shared.tap()
                withAnimation(Motion.sheetSwap) {
                    if score > 0 {
                        switch deckDetent {
                        case .expanded: deckDetent = .standard; showBrushDetail = false
                        case .standard: deckDetent = .compact
                        case .compact, .collapsed: deckDetent = .collapsed
                        }
                    } else {
                        switch deckDetent {
                        case .collapsed: deckDetent = .compact
                        case .compact: deckDetent = .standard
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
            EditorTopBar(
                editor: editor,
                collapsed: collapsed,
                onLeave: { leaving = true },
                onToggleCollapse: {
                    GameFeel.shared.tap()
                    withAnimation(Motion.sheetSwap) { deckDetent = collapsed ? .standard : .collapsed }
                }
            )
            .padding(.horizontal, landscape ? 18 : 14)
            .padding(.top, landscape ? 2 : 4)

            if !editor.message.isEmpty {
                HStack(spacing: 6) {
                    InkIcon(glyph: .edict, size: 13).foregroundStyle(Theme.seal)
                    Text(editor.message).font(Theme.caption).foregroundStyle(Theme.ink).lineLimit(2)
                }
                .padding(.horizontal, 14).padding(.vertical, 6)
                .glass(Capsule())
                .padding(.top, 8)
                .padding(.horizontal, 16)
                .transition(.move(edge: .top).combined(with: .opacity))
            }

            Spacer(minLength: 8)

            if collapsed {
                Button {
                    GameFeel.shared.tap()
                    withAnimation(Motion.sheetSwap) { deckDetent = .standard }
                } label: {
                    HStack(spacing: 8) {
                        InkIcon(glyph: editor.step == .terrain ? editor.tool.glyph : (editor.step == .provinces ? .region : .nation), size: 15, crisp: editor.step == .terrain)
                            .foregroundStyle(Theme.seal)
                        Text(collapsedTitle)
                            .font(Theme.label).foregroundStyle(Theme.ink).lineLimit(1)
                    }
                    .padding(.horizontal, 18).padding(.vertical, 9)
                    .glass(Capsule())
                }
                .buttonStyle(PressStyle())
                .offset(y: max(-24, min(14, rubberBandDragY)))
                .gesture(deckDragGesture)
                .padding(.bottom, landscape ? 6 : 8)
                .transition(.move(edge: .bottom).combined(with: .opacity))
            } else {
                VStack(spacing: 0) {
                    deckGrabber
                    Group {
                        switch editor.step {
                        case .terrain:
                            EditorTerrainDeck(
                                editor: editor,
                                landscape: landscape,
                                isCompact: deckDetent == .compact,
                                showBrushDetail: $showBrushDetail,
                                onToggleDetail: {
                                    GameFeel.shared.tap()
                                    withAnimation(Motion.sheetSwap) {
                                        showBrushDetail.toggle()
                                        deckDetent = showBrushDetail ? .expanded : .standard
                                    }
                                },
                                onPickBase: { pickingBase = true }
                            )
                        case .provinces:
                            EditorProvinceDeck(
                                editor: editor,
                                onFound: { Task { await model.foundCustomWorld(editor) } }
                            )
                        case .nations:
                            EditorNationDeck(
                                editor: editor,
                                onFound: { Task { await model.foundCustomWorld(editor) } }
                            )
                        }
                    }
                    .padding(.horizontal, landscape ? 12 : 14)
                    .padding(.bottom, landscape ? 10 : 12)
                    .padding(.top, 2)
                }
                .frame(maxWidth: landscape ? 680 : .infinity)
                .glass(RoundedRectangle(cornerRadius: Theme.Control.cornerSheet, style: .continuous))
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
                SheetHeader(title: "放弃这幅地图？", subtitle: "尚未开辟的画稿不会保存", seal: "弃")
                SealButton(title: "放弃并返回标题") { leaving = false; model.closeEditor() }.padding(.horizontal, 22)
                Button { leaving = false } label: { SecondaryLabel(title: "继续绘制", symbol: "paintbrush.pointed") }.buttonStyle(PressStyle()).padding(.horizontal, 22)
            }
            .padding(.bottom, 24)
            .background(MemorialPaper().ignoresSafeArea())
            .presentationDetents([.height(300)])
            .presentationCornerRadius(Theme.Control.cornerSheet)
            .presentationBackground { MemorialPaper() }
            .presentationDragIndicator(.hidden)
            .font(Theme.section)
        }
        .sheet(isPresented: $pickingBase) {
            EditorBasePickerSheet(editor: editor, isPresented: $pickingBase)
        }
    }

    private var collapsedTitle: String {
        switch editor.step {
        case .terrain: return "绘制中：\(editor.tool.title)（点此展开画板）"
        case .provinces: return editor.provinceMode == .manual ? "手绘州郡：第 \(editor.activeProvinceId + 1) 州（展开）" : "州郡划分（点此展开画板）"
        case .nations: return "划定列国：\(editor.selected + 1) 号国（展开）"
        }
    }

    private var deckGrabber: some View {
        VStack(spacing: 0) {
            Capsule().fill(Theme.ink.opacity(0.24)).frame(width: 38, height: 4)
        }
        .frame(maxWidth: .infinity).frame(height: 22)
        .contentShape(Rectangle())
        .onTapGesture {
            GameFeel.shared.tap()
            withAnimation(Motion.sheetSwap) {
                if deckDetent == .compact { deckDetent = .standard }
                else { deckDetent = .compact; showBrushDetail = false }
            }
        }
        .gesture(deckDragGesture)
        .accessibilityLabel("调节画板高度")
    }
}

/// 精简无重叠顶栏：仅保留关闭、三步导航胶囊（单行绝不挤压副标题）、撤销/重做与全屏画图切换。
private struct EditorTopBar: View {
    @ObservedObject var editor: MapEditor
    let collapsed: Bool
    let onLeave: () -> Void
    let onToggleCollapse: () -> Void

    private var showUndoRedo: Bool {
        editor.step == .terrain || editor.step == .nations || (editor.step == .provinces && editor.provinceMode == .manual)
    }
    private var canUndoNow: Bool {
        switch editor.step {
        case .terrain: return editor.canUndo
        case .provinces: return editor.canUndoProvince
        case .nations: return editor.canUndoNation
        }
    }
    private var canRedoNow: Bool {
        switch editor.step {
        case .terrain: return editor.canRedo
        case .provinces: return editor.canRedoProvince
        case .nations: return editor.canRedoNation
        }
    }

    var body: some View {
        HStack(spacing: 6) {
            Button(action: onLeave) { CircleIcon(glyph: .close) }.buttonStyle(PressStyle())

            HStack(spacing: 6) {
                stepPill("1 山川", active: editor.step == .terrain) {
                    if editor.step != .terrain { editor.toTerrain() }
                }
                Text("›").font(Theme.caption).foregroundStyle(Theme.ink2.opacity(0.45))
                stepPill("2 州郡", active: editor.step == .provinces) {
                    if editor.step != .provinces && editor.landShare >= 0.03 {
                        if editor.step == .nations { editor.backToProvinces() } else { editor.toProvinces() }
                    }
                }
                Text("›").font(Theme.caption).foregroundStyle(Theme.ink2.opacity(0.45))
                stepPill("3 列国", active: editor.step == .nations) {
                    if editor.step == .provinces && !editor.busy && !editor.map.meta.provinces.isEmpty { editor.toNations() }
                }
            }
            .padding(.horizontal, 12).frame(height: Theme.Control.topHeight).glass(Capsule())
            .fixedSize(horizontal: true, vertical: false)

            Spacer(minLength: 2)

            if editor.busy { InkBusy().frame(width: 34) }

            if showUndoRedo {
                Button {
                    switch editor.step {
                    case .terrain: editor.undoStroke()
                    case .provinces: editor.undoProvince()
                    case .nations: editor.undoNation()
                    }
                } label: { CircleIcon(glyph: .retreat) }
                .buttonStyle(PressStyle())
                .disabled(!canUndoNow).opacity(canUndoNow ? 1 : 0.36)
                .accessibilityLabel("撤销")

                Button {
                    switch editor.step {
                    case .terrain: editor.redoStroke()
                    case .provinces: editor.redoProvince()
                    case .nations: editor.redoNation()
                    }
                } label: { CircleIcon(glyph: .stepForward) }
                .buttonStyle(PressStyle())
                .disabled(!canRedoNow).opacity(canRedoNow ? 1 : 0.36)
                .accessibilityLabel("重做")
            }

            Button(action: onToggleCollapse) { CircleIcon(glyph: collapsed ? .brush : .eye, active: collapsed) }
                .buttonStyle(PressStyle())
                .accessibilityLabel(collapsed ? "展开画板" : "全屏画图")
        }
    }

    private func stepPill(_ title: String, active: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(title)
                .font(Theme.label)
                .foregroundStyle(active ? Theme.seal : Theme.ink2)
                .lineLimit(1)
        }
        .buttonStyle(.plain)
    }
}

/// 更换底图弹窗：置顶「纯白海洋」「纯陆平原」「单岛起步」三种空白手绘起手式，下方接全部自然地貌模板。
private struct EditorBasePickerSheet: View {
    @ObservedObject var editor: MapEditor
    @Binding var isPresented: Bool

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                SheetHeader(title: "挑选底图", subtitle: "可选 100% 空白底图从零手绘，或以经典地貌起稿", seal: "底")
                SectionLabel("空白手绘底图")
                Group2 {
                    ForEach(Array(MapEditor.BaseCanvas.allCases.enumerated()), id: \.element.id) { idx, c in
                        Button {
                            isPresented = false
                            editor.resetToBlank(c)
                        } label: {
                            MenuRow(symbol: c == .blankOcean ? "water.waves" : (c == .blankPlain ? "square.grid.3x3" : "paintbrush.pointed"), title: c.rawValue)
                        }.buttonStyle(.plain)
                        if idx < MapEditor.BaseCanvas.allCases.count - 1 { Divider2() }
                    }
                }
                .padding(.horizontal, 16)

                SectionLabel("自然地貌随机模板")
                Group2 {
                    ForEach(Names.templates.indices, id: \.self) { i in
                        Button {
                            isPresented = false
                            editor.reset(template: Names.templates[i].id, seed: String(UInt32.random(in: 0...UInt32.max)))
                        } label: { MenuRow(symbol: "square.stack.3d.up", title: "随机" + Names.templates[i].name) }.buttonStyle(.plain)
                        if i < Names.templates.count - 1 { Divider2() }
                    }
                }
                .padding(.horizontal, 16)
            }
            .padding(.bottom, 24)
        }
        .background(MemorialPaper().ignoresSafeArea())
        .presentationDetents([.medium, .large])
        .presentationCornerRadius(Theme.Control.cornerSheet)
        .presentationBackground { MemorialPaper() }
        .presentationDragIndicator(.hidden)
        .font(Theme.section)
    }
}

/// Step 1 山川绘景画板：含填充笔、依陆生景、生山脉、生内湖、清空成海与全部 13 种笔刷。
private struct EditorTerrainDeck: View {
    @ObservedObject var editor: MapEditor
    let landscape: Bool
    let isCompact: Bool
    @Binding var showBrushDetail: Bool
    let onToggleDetail: () -> Void
    let onPickBase: () -> Void

    private struct BrushPreset: Identifiable { let id: String; let radius: Double; let label: String }
    private static let brushPresets: [BrushPreset] = [
        BrushPreset(id: "s", radius: 16, label: "细"),
        BrushPreset(id: "m", radius: 34, label: "中"),
        BrushPreset(id: "l", radius: 62, label: "阔"),
        BrushPreset(id: "xl", radius: 95, label: "巨"),
    ]

    var body: some View {
        VStack(spacing: landscape ? 7 : (isCompact ? 8 : 9)) {
            // 实时四色地貌占比仪表 + 当前模式状态（宽幅独行，绝不重叠）
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
                HStack(spacing: 9) {
                    Text("海 \(Int((1 - editor.landShare) * 100))%").foregroundStyle(Color(red: 0.22, green: 0.40, blue: 0.58))
                    Text("平 \(Int(editor.plainShare * 100))%").foregroundStyle(Theme.jade)
                    Text("丘 \(Int(editor.hillShare * 100))%").foregroundStyle(Theme.gold)
                    Text("山 \(Int(editor.mountainShare * 100))%").foregroundStyle(Theme.ink2)
                    Spacer(minLength: 4)
                    Text(editor.tool == .fill ? "点击填满整片域" : "单指画 · 双指缩放")
                        .foregroundStyle(editor.tool == .fill ? Theme.seal : Theme.ink2)
                        .lineLimit(1)
                }
                .font(Theme.caption).monospacedDigit()
            }

            if isCompact {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 5) {
                        ForEach(MapEditor.Tool.allCases) { t in brushTile(t, width: 52, height: 42) }
                    }
                }
                HStack(spacing: 6) {
                    ForEach(Self.brushPresets) { preset in sizePresetButton(preset) }
                    Spacer(minLength: 4)
                    Button { editor.toProvinces() } label: {
                        HStack(spacing: 5) {
                            InkIcon(glyph: .region, size: 13.5).foregroundStyle(Theme.paperLight)
                            Text("分州郡").font(Theme.label).foregroundStyle(Theme.paperLight)
                        }
                        .padding(.horizontal, 14).frame(height: 32)
                        .background(Theme.seal, in: Capsule())
                    }
                    .buttonStyle(PressStyle())
                    .disabled(editor.landShare < 0.03).opacity(editor.landShare < 0.03 ? 0.5 : 1)
                }
            } else {
                // 横向双排 / 网格：13 种笔刷全展示（含「填充笔」）
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 5) {
                        ForEach(MapEditor.Tool.allCases) { t in brushTile(t, width: landscape ? 50 : 54, height: landscape ? 42 : 46) }
                    }
                }

                // 填充笔目标地貌选择条（仅选中「填充笔」时展开）
                if editor.tool == .fill {
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 6) {
                            ForEach(MapEditor.FillTarget.allCases) { ft in
                                let on = editor.fillTarget == ft
                                Button {
                                    GameFeel.shared.tap()
                                    editor.fillTarget = ft
                                } label: {
                                    Text(ft.title)
                                        .font(Theme.caption)
                                        .foregroundStyle(on ? Theme.paperLight : Theme.ink)
                                        .padding(.horizontal, 10).frame(height: 28)
                                        .background(on ? Theme.seal : Theme.wash.opacity(0.6), in: Capsule())
                                        .overlay(Capsule().stroke(on ? Color.clear : Theme.hairline, lineWidth: 0.65))
                                }
                                .buttonStyle(PressStyle())
                            }
                        }
                    }
                } else {
                    HStack(spacing: 8) {
                        PaperSlider(title: "笔刷", value: $editor.radius, range: 8...110) { "\(Int($0))" }
                        HStack(spacing: 4) {
                            ForEach(Self.brushPresets) { preset in sizePresetButton(preset) }
                        }
                    }
                }

                // 智能造景与地形快捷条（置顶「依陆生景」「生山脉」「生内湖」「清空成海」）
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        quickChip("依陆生景", glyph: .mountain, highlight: true) { editor.autoSculpt(mode: .full) }
                        quickChip("生山脉", glyph: .peak) { editor.autoSculpt(mode: .mountains) }
                        quickChip("生内湖", glyph: .lake) { editor.autoSculpt(mode: .lakes) }
                        quickChip("清空成海", glyph: .sea) { editor.resetToBlank(.blankOcean) }
                        quickChip("对称：\(editor.mirror.rawValue)", glyph: .swap, active: editor.mirror != .none) {
                            GameFeel.shared.tap()
                            let all = MapEditor.MirrorMode.allCases
                            editor.mirror = all[((all.firstIndex(of: editor.mirror) ?? 0) + 1) % all.count]
                        }
                        quickChip("中央海峡", glyph: .trench) { editor.carveStrait(inlandSea: false) }
                        quickChip("环陆内海", glyph: .island) { editor.carveStrait(inlandSea: true) }
                        quickChip("抬海陆", glyph: .raise) { editor.shiftElevation(4) }
                        quickChip("降海面", glyph: .lower) { editor.shiftElevation(-4) }
                        quickChip("整图平滑", glyph: .smooth) { editor.smoothWholeMap() }
                        quickChip("海岸崎岖", glyph: .hill) { editor.roughenCoasts() }
                        quickChip("随机新图", glyph: .refresh) { editor.randomizeCurrentTemplate() }
                    }
                }

                if !landscape && editor.tool != .fill {
                    VStack(spacing: 6) {
                        Button(action: onToggleDetail) {
                            HStack(spacing: 8) {
                                SectionLabel("笔触细节与保护海岸", inset: false)
                                Spacer()
                                InkIcon(glyph: .chevronDown, size: 14, weight: 1.7)
                                    .foregroundStyle(Theme.ink2)
                                    .rotationEffect(.degrees(showBrushDetail ? 180 : 0))
                            }
                            .frame(height: 28).contentShape(Rectangle())
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
                    Button(action: onPickBase) { SecondaryLabel(title: "底图 / 空白", symbol: "square.stack.3d.up") }
                    Button { editor.toProvinces() } label: { PrimaryLabel(title: "下一步：分州郡", symbol: "square.grid.3x3") }
                        .disabled(editor.landShare < 0.03).opacity(editor.landShare < 0.03 ? 0.5 : 1)
                }
                .buttonStyle(PressStyle())
            }
        }
    }

    private func sizePresetButton(_ preset: BrushPreset) -> some View {
        let near = abs(editor.radius - preset.radius) <= 6
        return Button(preset.label) {
            GameFeel.shared.tap()
            withAnimation(Motion.tap) { editor.radius = preset.radius }
        }
        .font(Theme.caption)
        .foregroundStyle(near ? Theme.paperLight : Theme.ink)
        .frame(width: 28, height: 28)
        .background(near ? Theme.seal : Theme.paperLight, in: Circle())
        .overlay(Circle().stroke(near ? Color.clear : Theme.line))
        .buttonStyle(PressStyle())
    }

    private func brushTile(_ t: MapEditor.Tool, width: CGFloat, height: CGFloat) -> some View {
        let on = editor.tool == t
        return Button {
            withAnimation(Motion.tap) {
                editor.tool = t
                if let h = t.target { editor.targetHeight = h }
            }
            GameFeel.shared.tap()
        } label: {
            VStack(spacing: 3) {
                InkIcon(glyph: t.glyph, size: 17, weight: 1.55, crisp: t != .fill)
                    .foregroundStyle(on ? Theme.paperLight : (t == .fill ? Theme.seal : Theme.ink))
                    .frame(height: 18)
                Text(t.title)
                    .font(Theme.caption)
                    .foregroundStyle(on ? Theme.paperLight : Theme.ink)
                    .lineLimit(1).minimumScaleFactor(0.82)
            }
            .frame(width: width, height: height)
            .background(on ? Theme.seal : Theme.wash.opacity(0.55), in: RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous))
            .overlay(alignment: .topTrailing) {
                if t.target != nil || t == .island {
                    Circle().fill(on ? Theme.paperLight.opacity(0.85) : t.swatch)
                        .frame(width: 4.5, height: 4.5)
                        .padding(4)
                }
            }
            .overlay(RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous).stroke(on ? Color.clear : Theme.hairline, lineWidth: 0.65))
        }
        .buttonStyle(PressStyle())
    }

    private func quickChip(_ title: String, glyph: InkGlyph, active: Bool = false, highlight: Bool = false, action: @escaping () -> Void) -> some View {
        let solid = active || highlight
        return Button(action: action) {
            HStack(spacing: 4) {
                InkIcon(glyph: glyph, size: 13).foregroundStyle(solid ? Theme.paperLight : Theme.seal)
                Text(title).font(Theme.caption).foregroundStyle(solid ? Theme.paperLight : Theme.ink).lineLimit(1)
            }
            .padding(.horizontal, 10).frame(height: 30)
            .background(solid ? Theme.seal : Theme.wash.opacity(0.55), in: RoundedRectangle(cornerRadius: Theme.Control.cornerChip, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Theme.Control.cornerChip, style: .continuous).stroke(solid ? Theme.gold.opacity(0.45) : Theme.hairline, lineWidth: solid ? 0.9 : 0.65))
        }
        .buttonStyle(PressStyle())
    }
}

/// Step 2 州郡划分画板：支持「自动划州」与「手绘州郡」（涂画州界、填充州域、吸管、新建州）无缝切换，绝不挤压底部按钮。
private struct EditorProvinceDeck: View {
    @ObservedObject var editor: MapEditor
    let onFound: () -> Void

    private struct ScalePreset: Identifiable { let id: String; let title: String; let provinces: Int; let nations: Int }
    private static let scalePresets: [ScalePreset] = [
        ScalePreset(id: "tiny", title: "袖珍", provinces: 60, nations: 6),
        ScalePreset(id: "std", title: "标准", provinces: 100, nations: 10),
        ScalePreset(id: "grand", title: "宏大", provinces: 180, nations: 14),
        ScalePreset(id: "epic", title: "史诗", provinces: 280, nations: 18),
    ]

    var body: some View {
        VStack(spacing: 10) {
            // 顶部模式切换 + 快捷开局（零拥挤、绝不与底部操作重叠）
            HStack(spacing: 8) {
                HStack(spacing: 4) {
                    ForEach(MapEditor.ProvinceMode.allCases) { m in
                        let on = editor.provinceMode == m
                        Button { editor.setProvinceMode(m) } label: {
                            Text(m.rawValue)
                                .font(Theme.label)
                                .foregroundStyle(on ? Theme.paperLight : Theme.ink)
                                .padding(.horizontal, 12).frame(height: 30)
                                .background(on ? Theme.seal : Color.clear, in: Capsule())
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(3)
                .background(Theme.wash.opacity(0.6), in: Capsule())
                .overlay(Capsule().stroke(Theme.hairline, lineWidth: 0.65))

                Spacer(minLength: 4)

                Text("\(editor.map.meta.provinces.count) 州")
                    .font(Theme.caption).foregroundStyle(Theme.ink2).monospacedDigit()

                Button(action: onFound) {
                    Text("直接开局")
                        .font(Theme.caption).foregroundStyle(Theme.seal)
                        .padding(.horizontal, 10).frame(height: 28)
                        .background(Theme.seal.opacity(0.10), in: Capsule())
                        .overlay(Capsule().stroke(Theme.seal.opacity(0.35), lineWidth: 0.7))
                }
                .buttonStyle(PressStyle())
                .disabled(editor.busy || editor.map.meta.provinces.isEmpty)
                .opacity(editor.busy || editor.map.meta.provinces.isEmpty ? 0.45 : 1)
            }

            if editor.provinceMode == .auto {
                HStack(spacing: 6) {
                    ForEach(Self.scalePresets) { p in
                        let active = editor.provinces == p.provinces && editor.nations == p.nations
                        Button {
                            GameFeel.shared.tap()
                            editor.provinces = p.provinces; editor.nations = p.nations
                            editor.recompute()
                        } label: {
                            VStack(spacing: 1) {
                                Text(p.title).font(Theme.label).foregroundStyle(active ? Theme.paperLight : Theme.ink)
                                Text("\(p.provinces)州·\(p.nations)国").font(Theme.caption).foregroundStyle(active ? Theme.paperLight.opacity(0.88) : Theme.ink2).lineLimit(1)
                            }
                            .frame(maxWidth: .infinity).frame(height: 42)
                            .background(active ? Theme.seal : Theme.wash.opacity(0.55), in: RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous).stroke(active ? Color.clear : Theme.hairline, lineWidth: 0.65))
                        }
                        .buttonStyle(PressStyle())
                    }
                }
                VStack(spacing: 8) {
                    PaperSlider(title: "州郡", value: Binding(get: { Double(editor.provinces) }, set: { editor.provinces = max(editor.nations, Int($0)) }), range: 10...480, step: 5, onEditingChanged: { if !$0 { editor.recompute() } }) { "\(Int($0))" }
                    PaperSlider(title: "国家", value: Binding(get: { Double(editor.nations) }, set: { editor.nations = Int($0); if editor.provinces < editor.nations { editor.provinces = editor.nations } }), range: 2...24, step: 1, onEditingChanged: { if !$0 { editor.recompute() } }) { "\(Int($0))" }
                }
            } else {
                // 手绘州郡工具条：新建州 + 州色板 + 涂画/填充/吸管 + 笔径
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        Button { editor.addNewManualProvince() } label: {
                            HStack(spacing: 4) {
                                InkIcon(glyph: .plus, size: 13).foregroundStyle(Theme.paperLight)
                                Text("新建州").font(Theme.label).foregroundStyle(Theme.paperLight)
                            }
                            .padding(.horizontal, 10).frame(height: 32)
                            .background(Theme.seal, in: RoundedRectangle(cornerRadius: Theme.Control.cornerChip, style: .continuous))
                        }
                        .buttonStyle(PressStyle())

                        ForEach(editor.provincePaletteIds.prefix(40), id: \.self) { pid in
                            let on = editor.activeProvinceId == pid
                            let hex = PreviewWorld.palette[pid % PreviewWorld.palette.count]
                            Button {
                                editor.activeProvinceId = pid
                                if editor.provinceTool == .pick { editor.provinceTool = .brush }
                                GameFeel.shared.tap()
                            } label: {
                                HStack(spacing: 5) {
                                    Circle().fill(Names.color(hex)).frame(width: 10, height: 10)
                                        .overlay(Circle().stroke(Theme.ink.opacity(0.22), lineWidth: 0.5))
                                    Text("州\(pid + 1)").font(Theme.caption).foregroundStyle(on ? Theme.seal : Theme.ink)
                                }
                                .padding(.horizontal, 9).frame(height: 32)
                                .background(on ? Theme.seal.opacity(0.10) : Theme.wash.opacity(0.55), in: RoundedRectangle(cornerRadius: Theme.Control.cornerChip, style: .continuous))
                                .overlay(RoundedRectangle(cornerRadius: Theme.Control.cornerChip, style: .continuous).stroke(on ? Theme.seal.opacity(0.65) : Theme.hairline, lineWidth: on ? 1.1 : 0.65))
                            }
                            .buttonStyle(PressStyle())
                        }
                    }
                }

                HStack(spacing: 6) {
                    ForEach(MapEditor.ProvinceTool.allCases) { pt in
                        let on = editor.provinceTool == pt
                        Button {
                            editor.provinceTool = pt; GameFeel.shared.tap()
                        } label: {
                            HStack(spacing: 4) {
                                InkIcon(glyph: pt.glyph, size: 14).foregroundStyle(on ? Theme.paperLight : Theme.ink)
                                Text(pt.rawValue).font(Theme.caption).foregroundStyle(on ? Theme.paperLight : Theme.ink).lineLimit(1)
                            }
                            .frame(maxWidth: .infinity).frame(height: 34)
                            .background(on ? Theme.seal : Theme.wash.opacity(0.55), in: RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous).stroke(on ? Color.clear : Theme.hairline, lineWidth: 0.65))
                        }
                        .buttonStyle(PressStyle())
                    }
                }

                if editor.provinceTool == .brush {
                    PaperSlider(title: "州界笔", value: $editor.radius, range: 12...80) { "\(Int($0))" }
                }
            }

            HStack(spacing: 10) {
                Button { editor.toTerrain() } label: { SecondaryLabel(title: "返回山川", symbol: "paintbrush.pointed") }
                Button { editor.toNations() } label: { PrimaryLabel(title: "下一步：划列国", symbol: "flag.2.crossed") }
                    .disabled(editor.busy || editor.map.meta.provinces.isEmpty).opacity(editor.busy || editor.map.meta.provinces.isEmpty ? 0.5 : 1)
            }
            .buttonStyle(PressStyle())
        }
    }
}

/// Step 3 划定列国画板：两排清晰疏朗工具栏（含「区域填国」BFS 填充），彻底告别 6 键挤成一团与文字折行重叠。
private struct EditorNationDeck: View {
    @ObservedObject var editor: MapEditor
    let onFound: () -> Void

    var body: some View {
        VStack(spacing: 9) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 7) {
                    Button { editor.quickAddNation() } label: {
                        HStack(spacing: 4) {
                            InkIcon(glyph: .plus, size: 13).foregroundStyle(Theme.paperLight)
                            Text("新建国").font(Theme.label).foregroundStyle(Theme.paperLight)
                        }
                        .padding(.horizontal, 11).frame(height: 34)
                        .background(Theme.seal, in: RoundedRectangle(cornerRadius: Theme.Control.cornerChip, style: .continuous))
                    }
                    .buttonStyle(PressStyle())
                    .disabled(editor.seeds.count >= 24).opacity(editor.seeds.count >= 24 ? 0.45 : 1)

                    ForEach(editor.seeds.indices, id: \.self) { i in
                        let count = editor.owners.filter { $0 == i }.count
                        let active = editor.selected == i
                        Button { editor.select(i); GameFeel.shared.tap() } label: {
                            HStack(spacing: 6) {
                                Circle().fill(Names.color(editor.nationHex(at: i))).frame(width: 11, height: 11)
                                    .overlay(Circle().stroke(Theme.ink.opacity(0.22), lineWidth: 0.6))
                                Text("\(i + 1)号 · \(count)州").font(Theme.label).foregroundStyle(active ? Theme.seal : Theme.ink)
                            }
                            .padding(.horizontal, 10).frame(height: 34)
                            .background(active ? Theme.seal.opacity(0.10) : Theme.wash.opacity(0.55), in: RoundedRectangle(cornerRadius: Theme.Control.cornerChip, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: Theme.Control.cornerChip, style: .continuous).stroke(active ? Theme.seal.opacity(0.65) : Theme.hairline, lineWidth: active ? 1.1 : 0.65))
                        }
                        .buttonStyle(PressStyle())
                    }
                }
            }

            // 第一行：四大清晰模式按钮（涂疆土 / 区域填国 / 移都城 / 点地建国）
            HStack(spacing: 6) {
                nationToolButton(.paint, title: "涂疆土", glyph: .brush)
                nationToolButton(.fill, title: "区域填国", glyph: .views)
                nationToolButton(.capital, title: "移都城", glyph: .nation)
                nationToolButton(.found, title: "点地建国", glyph: .plus)
            }

            // 第二行：辅助操控（单州/连片 + 山河重分 + 删此国）
            HStack(spacing: 6) {
                Button {
                    GameFeel.shared.tap()
                    withAnimation(Motion.tap) { editor.paintCluster.toggle() }
                } label: {
                    HStack(spacing: 4) {
                        InkIcon(glyph: .region, size: 14).foregroundStyle(editor.paintCluster ? Theme.paperLight : Theme.ink)
                        Text(editor.paintCluster ? "连片涂抹" : "单州涂抹").font(Theme.caption).foregroundStyle(editor.paintCluster ? Theme.paperLight : Theme.ink)
                    }
                    .frame(maxWidth: .infinity).frame(height: 32)
                    .background(editor.paintCluster ? Theme.seal : Theme.wash.opacity(0.55), in: RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous).stroke(editor.paintCluster ? Color.clear : Theme.hairline, lineWidth: 0.65))
                }
                .buttonStyle(PressStyle())

                Button { editor.rebalanceOrganically() } label: {
                    HStack(spacing: 4) {
                        InkIcon(glyph: .swap, size: 14).foregroundStyle(Theme.ink)
                        Text("山河重分").font(Theme.caption).foregroundStyle(Theme.ink)
                    }
                    .frame(maxWidth: .infinity).frame(height: 32)
                    .background(Theme.wash.opacity(0.55), in: RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous).stroke(Theme.hairline, lineWidth: 0.65))
                }
                .buttonStyle(PressStyle())

                Button { editor.removeSelected() } label: {
                    HStack(spacing: 4) {
                        InkIcon(glyph: .trash, size: 14).foregroundStyle(Theme.seal)
                        Text("删此国").font(Theme.caption).foregroundStyle(Theme.seal)
                    }
                    .frame(maxWidth: .infinity).frame(height: 32)
                    .background(Theme.wash.opacity(0.55), in: RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous).stroke(Theme.hairline, lineWidth: 0.65))
                }
                .buttonStyle(PressStyle())
                .disabled(editor.seeds.count <= 2).opacity(editor.seeds.count <= 2 ? 0.38 : 1)
            }

            Text(nationHint)
                .font(Theme.caption).foregroundStyle(Theme.ink2).frame(maxWidth: .infinity, alignment: .leading).lineLimit(2)

            HStack(spacing: 10) {
                Button { editor.backToProvinces() } label: { SecondaryLabel(title: "返回分州郡", symbol: "square.grid.3x3") }
                Button(action: onFound) { PrimaryLabel(title: "开辟天下", symbol: "flag.fill") }
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
                InkIcon(glyph: glyph, size: 14).foregroundStyle(on ? Theme.paperLight : Theme.ink)
                Text(title).font(Theme.caption).foregroundStyle(on ? Theme.paperLight : Theme.ink).lineLimit(1).minimumScaleFactor(0.85)
            }
            .padding(.horizontal, 6).frame(maxWidth: .infinity).frame(height: 34)
            .background(on ? Theme.seal : Theme.wash.opacity(0.55), in: RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous).stroke(on ? Color.clear : Theme.hairline, lineWidth: 0.65))
        }
        .buttonStyle(PressStyle())
    }

    private var nationHint: String {
        switch editor.nationTool {
        case .paint: return editor.paintCluster ? "连片画笔：点涂将一并划入周边邻州；点别国都城可直接切国。" : "逐州画笔：轻点或划过州郡划入所选国；支持顶部撤销与重做。"
        case .fill: return "区域填国：轻点某国一片连续领土，一键将相连非都城州全部划归所选国。"
        case .capital: return "移都模式：轻点任意州郡设为所选国家的新都城。"
        case .found: return "建国模式：轻点任意非都城州郡在此立国，或直接点「+ 新建国」。"
        }
    }
}
