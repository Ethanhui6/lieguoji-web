import Foundation

/// A drawable world built on the device from the ported generators, in a second or two: the same
/// heights, climate, provinces and capitals the web engine will create for this seed, laid onto the
/// original 20k grid geometry of a bundled map. It is shown while the engine builds the full world
/// (people, armies, history) and then replaced by that world.
public enum PreviewWorld {
    public struct Inputs: Sendable {
        public let base: WorldMap, grid: TerrainGraph, document: TerrainDocument
        public init(base: WorldMap, grid: TerrainGraph, document: TerrainDocument) { self.base = base; self.grid = grid; self.document = document }
    }
    /// settlement25-palette (the recovered c12 colours, then the web's additional shades).
    public static let palette = ["#80b1d3", "#fb8072", "#b3de69", "#bc80bd", "#ffed6f", "#8dd3c7", "#fdb462", "#eb8de7", "#a4c5ed", "#cfaf76", "#a8df9f", "#f0adc4",
                                 "#8ba7a1", "#df9875", "#c4bef0", "#d6d28e", "#a1ccd8", "#d98bb0", "#83c89d", "#bb935e", "#abc079", "#c99282", "#95a3dc", "#b2d1b7"]
    /// terrain13 FMS_BIOMES colours.
    static let biomeColors: [UInt32] = [0x466eab, 0xfbe79f, 0xb5b887, 0xd2d082, 0xc8d68f, 0xb6d95d, 0x29bc56, 0x7dcb35, 0x409c43, 0x4b6b32, 0x96784b, 0xd5e7eb, 0x0b9131]

    public static func build(_ input: Inputs, seed: String, template: String, nations: Int, cities: Int) -> WorldMap {
        build(input, heights: TerrainGenerator.generate(graph: input.grid, seed: seed, template: template), nations: nations, cities: cities)
    }

    /// Terrain only (自绘地图 while drawing): heights, the climate's biomes and the depth-shaded sea; no
    /// provinces or states.
    public static func terrain(_ input: Inputs, heights: [UInt8], sea withSea: Bool = true) -> (map: WorldMap, surface: Climate.Surface) {
        var m = input.base
        let elevations = heights.map(Int.init)
        let surface = Climate.surface(input.document, elevations: elevations)
        let n = min(m.cellCount, heights.count)
        m.elevation = (0..<m.cellCount).map { $0 < n ? Int16(heights[$0]) : 0 }
        m.biome = (0..<m.cellCount).map { $0 < n ? surface.ids[$0] : 0 }
        var rgb = [UInt8](repeating: 0, count: m.cellCount * 3)
        for c in 0..<n { let v = biomeColors[Int(min(12, surface.ids[c]))]; rgb[c * 3] = UInt8(v >> 16 & 255); rgb[c * 3 + 1] = UInt8(v >> 8 & 255); rgb[c * 3 + 2] = UInt8(v & 255) }
        m.biomeRGB = rgb
        m.coast = []; m.rivers = []
        // The bundled map's armies belong to its own land: on this one they would stand in the open sea.
        m.meta.economy = nil
        m.province = [Int32](repeating: -1, count: m.cellCount)
        m.meta.provinces = []; m.meta.nations = []; m.meta.cities = []; m.meta.labels = []
        if withSea { m.seaRGBA = sea(m) }
        return (m, surface)
    }

    /// The colour of a height before the climate is known (live feedback while a stroke is drawn).
    public static func quickColor(_ h: Int) -> (UInt8, UInt8, UInt8) {
        switch h {
        case ..<20: return (0x46, 0x6e, 0xab)
        case ..<30: return (0xc8, 0xd6, 0x8f)
        case ..<42: return (0x29, 0xbc, 0x56)
        case ..<55: return (0x40, 0x9c, 0x43)
        case ..<70: return (0x96, 0x78, 0x4b)
        default: return (0xd5, 0xe7, 0xeb)
        }
    }

    /// The opening on given heights: terrain, provinces (the settlement partition) and the states'
    /// starting land and capitals, as the engine will found them.
    public static func build(_ input: Inputs, heights: [UInt8], nations: Int, cities: Int) -> WorldMap {
        let rawElev = heights.map(Int.init)
        let cleaned = Regions.cleanTinyIslets(input.document, elevations: rawElev, cities: cities)
        let effHeights = cleaned.map { UInt8(max(0, min(100, $0))) }
        let t = terrain(input, heights: effHeights, sea: false)
        var m = t.map
        let surface = t.surface, elevations = cleaned, n = min(m.cellCount, effHeights.count)
        // Provinces: each land cell joins the province of a clipped face it belongs to.
        var province = [Int32](repeating: -1, count: m.cellCount)
        var provinces = [WorldMeta.Province](), owners = [Int](), seeds = [Int]()
        // Too few provinces for this land: the same steps up as the engine, so the two still agree.
        var target = cities
        var found = Regions.partition(input.document, elevations: elevations, cities: target, surface: surface, balanceAreas: true)
        while found == nil && target < 480 {
            target = raisedCities(target)
            found = Regions.partition(input.document, elevations: elevations, cities: target, surface: surface, balanceAreas: true)
        }
        if let part = found {
            for (r, region) in part.regions.enumerated() { for f in region.members { for s in part.faces[f].source where s < n && effHeights[s] >= 20 && province[s] < 0 { province[s] = Int32(r) } } }
            let count = min(nations, part.regions.count)
            let layout = Opening.layout(part.regions, count: count)
            owners = layout.owners; seeds = layout.seeds
            provinces = part.regions.enumerated().map { i, r in
                WorldMeta.Province(id: "p-\(i)", name: "", x: Float(r.center.0), y: Float(r.center.1), nation: owners[i], terrain: r.height > 65 ? "mountain" : r.height > 45 ? "forest" : "plain")
            }
        }
        for c in 0..<n where effHeights[c] >= 20 && province[c] < 0 { province[c] = provinces.isEmpty ? -1 : 0 }
        m.province = province
        m.meta.provinces = provinces
        // 国色分明: the colours the finished world takes (NationColors.apply), so nothing changes at the hand-over.
        let colors = NationColors.assign(capitals: seeds.map { (x: Double(provinces[$0].x), y: Double(provinces[$0].y)) })
        m.meta.nations = seeds.indices.map { i in
            WorldMeta.Nation(id: "n-\(i)", name: "", color: colors[i], line: NativeEngine.stateLineColor(colors[i]), capital: i, culture: "", polity: "", religion: "")
        }
        m.meta.cities = seeds.enumerated().map { i, s in WorldMeta.City(id: "c-\(s)", name: "", x: provinces[s].x, y: provinces[s].y, province: s) }
        m.meta.labels = []
        m.seaRGBA = sea(m)
        return m
    }

    public enum AutoSculptMode: Sendable { case full, mountains, lakes }

    /// 依陆生景（v5.0 手绘工坊核心地形生成器）：
    /// 严格保留玩家手绘的海陆轮廓，在陆地内部自动雕刻自然造山带、起伏丘陵、高原雪峰与内陆淡水湖泊，同时平滑海架水深。
    public static func autoSculptTerrain(
        graph: TerrainGraph,
        heights: [UInt8],
        seed: String,
        mode: AutoSculptMode = .full
    ) -> [UInt8] {
        let n = min(heights.count, graph.points.count)
        guard n > 0 else { return heights }
        let isLand = (0..<n).map { heights[$0] >= 20 }
        // 1. 双向 BFS 计算每格到海岸线的步距（陆地深入腹地距离 & 海洋远离海岸距离）
        var landDist = [Int](repeating: -1, count: n)
        var seaDist = [Int](repeating: -1, count: n)
        var lq = [Int](), sq = [Int]()
        for c in 0..<n {
            let nbs = graph.neighbors[c]
            let touchesOther = nbs.contains { $0 < n && isLand[$0] != isLand[c] }
            if touchesOther {
                if isLand[c] { landDist[c] = 1; lq.append(c) }
                else { seaDist[c] = 1; sq.append(c) }
            }
        }
        // 纯陆图（无海岸）时用图边作边缘距离起点
        if lq.isEmpty && isLand.contains(true) {
            for c in 0..<n where isLand[c] {
                let pt = graph.points[c]
                if pt.0 < 36 || pt.1 < 36 || pt.0 > graph.width - 36 || pt.1 > graph.height - 36 {
                    landDist[c] = 1; lq.append(c)
                }
            }
        }
        var lh = 0
        while lh < lq.count {
            let cur = lq[lh]; lh += 1
            let d = landDist[cur]
            for nb in graph.neighbors[cur] where nb < n && isLand[nb] && landDist[nb] < 0 {
                landDist[nb] = d + 1; lq.append(nb)
            }
        }
        var sh = 0
        while sh < sq.count {
            let cur = sq[sh]; sh += 1
            let d = seaDist[cur]
            for nb in graph.neighbors[cur] where nb < n && !isLand[nb] && seaDist[nb] < 0 {
                seaDist[nb] = d + 1; sq.append(nb)
            }
        }

        // 2. 确定性多频构造场（山脉主脊 + 丘陵起伏 + 盆地洼地）
        var hSeed: UInt64 = 14695981039346656037
        for b in seed.utf8 { hSeed = (hSeed ^ UInt64(b)) &* 1099511628211 }
        let p1 = Double(hSeed & 0xFFFF) / 65535.0 * 6.28318
        let p2 = Double((hSeed >> 16) & 0xFFFF) / 65535.0 * 6.28318
        let p3 = Double((hSeed >> 32) & 0xFFFF) / 65535.0 * 6.28318
        let p4 = Double((hSeed >> 48) & 0xFFFF) / 65535.0 * 6.28318
        let invW = 1.0 / max(1.0, graph.width), invH = 1.0 / max(1.0, graph.height)
        func ridgeField(_ x: Double, _ y: Double) -> Double {
            let u = x * invW * 6.28318, v = y * invH * 6.28318
            let w1 = sin(u * 1.45 + v * 0.95 + p1) * 0.52 + cos(u * 0.85 - v * 1.75 + p2) * 0.48
            let w2 = sin(u * 3.1 - v * 2.4 + p3) * 0.55 + cos(u * 2.7 + v * 3.2 + p4) * 0.45
            let w3 = sin(u * 6.2 + v * 5.4 + p1 * 1.7) * 0.5 + cos(u * 5.8 - v * 6.5 + p2 * 1.3) * 0.5
            let ridge = 1.0 - abs(w1 * 0.72 + w2 * 0.28)
            return max(0, min(1, ridge * 0.72 + (w2 * 0.5 + 0.5) * 0.18 + (w3 * 0.5 + 0.5) * 0.10))
        }
        func basinField(_ x: Double, _ y: Double) -> Double {
            let u = x * invW * 6.28318, v = y * invH * 6.28318
            let b1 = sin(u * 2.35 - v * 1.85 + p2 * 1.9) * cos(u * 1.95 + v * 2.55 + p3 * 1.4)
            let b2 = sin(u * 4.7 + v * 4.1 + p4) * 0.35
            return b1 + b2
        }

        var out = heights
        for c in 0..<n {
            let pt = graph.points[c]
            if !isLand[c] {
                if mode == .full {
                    let sd = seaDist[c] > 0 ? seaDist[c] : 16
                    let shelf = max(3, min(18, Int((18.5 - Double(min(sd, 14)) * 1.05).rounded())))
                    out[c] = UInt8(shelf)
                }
                continue
            }
            let d = max(1, landDist[c] > 0 ? landDist[c] : 8)
            let interior = min(1.0, Double(d - 1) / 9.5)
            let r = ridgeField(pt.0, pt.1)
            let b = basinField(pt.0, pt.1)

            switch mode {
            case .lakes:
                // 仅在内陆腹地（离海岸 ≥ 5 格，绝不破开海岸）雕出清澈淡水内湖
                if d >= 5 && b < -0.58 && heights[c] < 54 {
                    out[c] = UInt8(max(12, min(16, Int((15.5 + (b + 0.58) * 6.0).rounded()))))
                }
            case .mountains:
                // 在既有陆地腹地叠加自然造山脉脊与雪峰，保留原本海岸与湖泊
                if d >= 2 && r > 0.60 {
                    let lift = (r - 0.60) / 0.40 * (38.0 + 26.0 * interior)
                    let target = max(Int(heights[c]), min(94, 34 + Int(lift.rounded())))
                    out[c] = UInt8(target)
                }
            case .full:
                // 依陆生景全套地形：近岸平原 → 起伏丘陵 → 腹地造山脊与雪峰 → 腹地天然内湖
                if d >= 5 && b < -0.62 {
                    out[c] = UInt8(max(12, min(16, Int((15.5 + (b + 0.62) * 6.0).rounded()))))
                } else {
                    let basePlain = 22.0 + interior * 11.0
                    let hillWave = max(0, r - 0.36) * 26.0 * (0.45 + 0.55 * interior)
                    let mountainSpine = r > 0.66 ? pow((r - 0.66) / 0.34, 1.35) * (34.0 + 22.0 * interior) : 0.0
                    let elev = basePlain + hillWave + mountainSpine
                    out[c] = UInt8(max(21, min(95, Int(elev.rounded()))))
                }
            }
        }
        // 保护内湖与海岸边界：若新雕内湖意外触碰外海邻格则还原为低地沼泽平原（绝不破坏玩家手绘海岸线）
        if mode == .full || mode == .lakes {
            for c in 0..<n where isLand[c] && out[c] < 20 {
                let touchesOriginalSea = graph.neighbors[c].contains { $0 < n && !isLand[$0] }
                if touchesOriginalSea { out[c] = 22 }
            }
        }
        return out
    }

    /// 根据玩家手绘的州郡格网 `cellProvinces` 构建可交互的州郡/列国预览图（Step 2 手绘州郡 → Step 3 划定列国）。
    public static func buildCustomProvinces(_ input: Inputs, heights: [UInt8], cellProvinces: [Int], nations: Int) -> WorldMap? {
        let elevations = heights.map(Int.init)
        let t = terrain(input, heights: heights, sea: false)
        var m = t.map
        guard let part = Regions.fromCellAssignment(input.document, elevations: elevations, cellProvinces: cellProvinces, surface: t.surface) else { return nil }
        let n = min(m.cellCount, heights.count)
        var province = [Int32](repeating: -1, count: m.cellCount)
        for (r, region) in part.regions.enumerated() {
            for f in region.members {
                for s in part.faces[f].source where s < n && heights[s] >= 20 && province[s] < 0 { province[s] = Int32(r) }
            }
        }
        for c in 0..<n where heights[c] >= 20 && province[c] < 0 { province[c] = part.regions.isEmpty ? -1 : 0 }
        let count = max(2, min(nations, part.regions.count))
        let layout = Opening.layout(part.regions, count: count)
        let provinces = part.regions.enumerated().map { i, r in
            WorldMeta.Province(id: "p-\(i)", name: "", x: Float(r.center.0), y: Float(r.center.1), nation: layout.owners[i], terrain: r.height > 65 ? "mountain" : r.height > 45 ? "forest" : "plain")
        }
        m.province = province
        m.meta.provinces = provinces
        let colors = NationColors.assign(capitals: layout.seeds.map { (x: Double(provinces[$0].x), y: Double(provinces[$0].y)) })
        m.meta.nations = layout.seeds.indices.map { i in
            WorldMeta.Nation(id: "n-\(i)", name: "", color: colors[i], line: NativeEngine.stateLineColor(colors[i]), capital: i, culture: "", polity: "", religion: "")
        }
        m.meta.cities = layout.seeds.enumerated().map { _, s in WorldMeta.City(id: "c-\(s)", name: "", x: provinces[s].x, y: provinces[s].y, province: s) }
        m.meta.labels = []
        m.seaRGBA = sea(m)
        return m
    }

    /// engine.ts raisedCities.
    static func raisedCities(_ n: Int) -> Int { min(480, max(n + 1, Int((Double(n) * 1.15).rounded(.up)))) }

    /// 新世界地形预览统计（用于开局选图页实时展示陆地占比、山地比例与海岸形态）。
    public struct ThumbnailStats: Sendable {
        public let landPercent: Int
        public let mountainPercent: Int
        public let forestPercent: Int
        public let coastKind: String
    }

    /// A richly shaded antique-atlas preview chart of the land these heights make, for the new-world sheet.
    /// Supports both pure relief cartography and optional projected nation-influence preview (`nations > 0`).
    public static func thumbnail(
        _ input: Inputs,
        heights: [UInt8],
        width: Int,
        nations previewNations: Int = 0,
        seed: String = ""
    ) -> (rgba: [UInt8], width: Int, height: Int, stats: ThumbnailStats) {
        let map = input.base, picker = CellPicker(map: map)
        let w = max(2, width), h = max(2, Int(Float(w) * map.height / map.width))
        var field = [Float](repeating: 0, count: w * h)
        var landPixels = 0, mountainPixels = 0, forestPixels = 0, coastPixels = 0
        for y in 0..<h {
            for x in 0..<w {
                let px = (Float(x) + 0.5) * map.width / Float(w), py = (Float(y) + 0.5) * map.height / Float(h)
                if let c = picker.cell(atX: px, y: py), c < heights.count {
                    let v = Float(heights[c])
                    field[y * w + x] = v
                    if v >= 20 {
                        landPixels += 1
                        if v >= 62 { mountainPixels += 1 }
                        else if v >= 34 && v < 52 { forestPixels += 1 }
                    }
                }
            }
        }
        // 可选势力分布预演：基于当前种子与陆地采样点按 Voronoi 划分示意版图与都城星标
        var anchors: [(x: Float, y: Float, color: RGB)] = []
        if previewNations > 0 && landPixels > 0 {
            var rng: UInt64 = 14695981039346656037
            for b in seed.utf8 { rng = (rng ^ UInt64(b)) &* 1099511628211 }
            rng ^= UInt64(previewNations) &* 0x9E3779B97F4A7C15
            func nextRand() -> Float {
                rng ^= rng >> 12; rng ^= rng << 25; rng ^= rng >> 27
                let v = (rng &* 2685821657736338717) >> 40
                return Float(v) / Float(1 << 24)
            }
            var landCoords: [(Float, Float)] = []
            let step = max(2, min(w, h) / 40)
            for y in stride(from: step, to: h - step, by: step) {
                for x in stride(from: step, to: w - step, by: step) where field[y * w + x] >= 22 {
                    landCoords.append((Float(x), Float(y)))
                }
            }
            if !landCoords.isEmpty {
                let target = min(previewNations, min(palette.count, landCoords.count))
                let firstIdx = Int(nextRand() * Float(landCoords.count)) % landCoords.count
                var chosen = [landCoords[firstIdx]]
                while chosen.count < target {
                    var best = landCoords[0], bestDist: Float = -1
                    for _ in 0..<min(48, landCoords.count) {
                        let cand = landCoords[Int(nextRand() * Float(landCoords.count)) % landCoords.count]
                        var dMin: Float = 1e9
                        for s in chosen {
                            let dx = cand.0 - s.0, dy = cand.1 - s.1
                            dMin = min(dMin, dx * dx + dy * dy)
                        }
                        if dMin > bestDist { bestDist = dMin; best = cand }
                    }
                    chosen.append(best)
                }
                for (i, pt) in chosen.enumerated() {
                    let col = RGB(css: palette[i % palette.count]) ?? RGB(0.65, 0.58, 0.48)
                    anchors.append((pt.0, pt.1, col))
                }
            }
        }
        let deep = RGB(hex: 0x3D6472), midSea = RGB(hex: 0x5B8691), shallow = RGB(hex: 0x9AC0BE), ink = RGB(hex: 0x3B2E20), sand = RGB(hex: 0xEADAB2)
        let ramp: [(at: Float, color: RGB)] = [
            (20, RGB(hex: 0xDDD69E)),
            (32, RGB(hex: 0xB3C37D)),
            (46, RGB(hex: 0x99AD6A)),
            (60, RGB(hex: 0xBD9F6A)),
            (74, RGB(hex: 0x8F7550)),
            (86, RGB(hex: 0xF2ECE0)),
        ]
        func mix3(_ a: RGB, _ b: RGB, _ t: Float) -> (Float, Float, Float) {
            (a.r + (b.r - a.r) * t, a.g + (b.g - a.g) * t, a.b + (b.b - a.b) * t)
        }
        func land(_ v: Float) -> (Float, Float, Float) {
            for k in 1..<ramp.count where v < ramp[k].at {
                return mix3(ramp[k - 1].color, ramp[k].color, (v - ramp[k - 1].at) / (ramp[k].at - ramp[k - 1].at))
            }
            let top = ramp[ramp.count - 1].color
            return (top.r, top.g, top.b)
        }
        var ownerGrid = [Int](repeating: -1, count: anchors.isEmpty ? 0 : w * h)
        if !anchors.isEmpty {
            // 有机自然疆域划分：通过三频域扭曲噪声（Domain Warping）+ 山脊地形阻隔，
            // 令势力边界顺着山脉、河谷与自然地势蜿蜒舒展，彻底消除直来直去的正方几何切割。
            let seedPhase = Float(seed.utf8.reduce(UInt32(17)) { ($0 &* 31) &+ UInt32($1) } % 1000) * 0.013
            let scaleSpan = Float(min(w, h))
            let warpAmp = scaleSpan * 0.085
            let f1: Float = 6.28318 / max(28, scaleSpan * 0.28)
            let f2: Float = 6.28318 / max(14, scaleSpan * 0.13)
            let f3: Float = 6.28318 / max(8, scaleSpan * 0.065)
            // 各国轻微的自然扩张权重差异（模拟大国/小邦并存，而非完全均等方块）
            let weights: [Float] = anchors.indices.map { a in
                0.86 + Float((a * 37 + Int(seedPhase * 100)) % 29) / 100.0
            }
            for y in 0..<h {
                for x in 0..<w {
                    let i = y * w + x
                    let elev = field[i]
                    guard elev >= 20 else { continue }
                    let fx = Float(x), fy = Float(y)
                    let wx = fx + (sin(fy * f1 + seedPhase) * 0.55 + sin((fx + fy) * f2 + seedPhase * 1.7) * 0.30 + cos(fx * f3 - fy * f3) * 0.15) * warpAmp
                    let wy = fy + (cos(fx * f1 + seedPhase * 1.3) * 0.55 + cos((fx - fy) * f2 + seedPhase * 0.8) * 0.30 + sin(fx * f3 + fy * f3) * 0.15) * warpAmp
                    // 高山地带增强边疆阻隔，使国界天然倾向沿着山脉分水岭弯折
                    let ridgeBias: Float = elev >= 58 ? (elev - 58) * 0.35 : 0
                    var best = 0, bestD: Float = 1e12
                    for a in anchors.indices {
                        let dx = wx - anchors[a].x, dy = wy - anchors[a].y
                        let d = (dx * dx + dy * dy).squareRoot() * weights[a] + ridgeBias * (a % 2 == 0 ? 1 : -0.6)
                        if d < bestD { bestD = d; best = a }
                    }
                    ownerGrid[i] = best
                }
            }
        }
        var out = [UInt8](repeating: 255, count: w * h * 4)
        for y in 0..<h {
            for x in 0..<w {
                let i = y * w + x, v = field[i]
                let north = field[max(0, y - 1) * w + x]
                let south = field[min(h - 1, y + 1) * w + x]
                let west = field[y * w + max(0, x - 1)]
                let east = field[y * w + min(w - 1, x + 1)]
                let nw = field[max(0, y - 1) * w + max(0, x - 1)]
                // 细腻古纸纹理噪点（零开销纯整数哈希）
                let hBits = UInt32(truncatingIfNeeded: (x &* 374761393) ^ (y &* 668265263) ^ ((x + y) &* 1442695041))
                let grain = (Float((hBits ^ (hBits >> 13)) & 0xFF) / 255.0 - 0.5) * 0.042
                var c: (Float, Float, Float)
                if v < 20 {
                    let t = max(0, min(1, v / 20))
                    c = t < 0.65 ? mix3(deep, midSea, t / 0.65) : mix3(midSea, shallow, (t - 0.65) / 0.35)
                    // 浅海浪纹高光
                    if north >= 20 || west >= 20 || south >= 20 || east >= 20 {
                        c = (c.0 + (shallow.r - c.0) * 0.55, c.1 + (shallow.g - c.1) * 0.55, c.2 + (shallow.b - c.2) * 0.55)
                    }
                } else {
                    c = land(v)
                    if !anchors.isEmpty, ownerGrid[i] >= 0 {
                        let ac = anchors[ownerGrid[i]].color
                        c = (c.0 * 0.44 + ac.r * 0.56, c.1 * 0.44 + ac.g * 0.56, c.2 * 0.44 + ac.b * 0.56)
                    }
                    let slope = (v - nw) * 0.026 + (v - north) * 0.01 + (v - west) * 0.01
                    let light = max(0.76, min(1.22, 1 + slope))
                    // 暖阳高光 + 墨青暗部立体坡面
                    c = (c.0 * light + (light > 1 ? (light - 1) * 0.08 : 0),
                         c.1 * light + (light > 1 ? (light - 1) * 0.05 : 0),
                         c.2 * light + (light < 1 ? (1 - light) * 0.06 : 0))
                    let isCoast = north < 20 || west < 20 || south < 20 || east < 20
                    if isCoast {
                        coastPixels += 1
                        if north < 20 || west < 20 {
                            c = (c.0 + (ink.r - c.0) * 0.65, c.1 + (ink.g - c.1) * 0.65, c.2 + (ink.b - c.2) * 0.65)
                        } else {
                            c = (c.0 + (sand.r - c.0) * 0.38, c.1 + (sand.g - c.1) * 0.38, c.2 + (sand.b - c.2) * 0.38)
                        }
                    } else if !anchors.isEmpty {
                        let o = ownerGrid[i]
                        let oN = ownerGrid[max(0, y - 1) * w + x], oW = ownerGrid[y * w + max(0, x - 1)]
                        if (oN >= 0 && oN != o) || (oW >= 0 && oW != o) {
                            c = (c.0 * 0.58 + ink.r * 0.42, c.1 * 0.58 + ink.g * 0.42, c.2 * 0.58 + ink.b * 0.42)
                        }
                    }
                }
                // 柔和四角暗角烘托古图装裱质感
                let ux = Float(x) / Float(max(1, w - 1)) * 2 - 1, uy = Float(y) / Float(max(1, h - 1)) * 2 - 1
                let vig = 1 - min(0.14, (ux * ux + uy * uy) * 0.075)
                out[i * 4] = UInt8(max(0, min(1, (c.0 + grain) * vig)) * 255)
                out[i * 4 + 1] = UInt8(max(0, min(1, (c.1 + grain) * vig)) * 255)
                out[i * 4 + 2] = UInt8(max(0, min(1, (c.2 + grain) * vig)) * 255)
            }
        }
        // 在势力预览模式下点亮各拟建都城朱金星点
        for a in anchors {
            let cx = Int(a.x), cy = Int(a.y)
            for dy in -3...3 {
                for dx in -3...3 {
                    let px = cx + dx, py = cy + dy
                    guard px >= 0, px < w, py >= 0, py < h else { continue }
                    let d2 = dx * dx + dy * dy
                    guard d2 <= 9 else { continue }
                    let i = (py * w + px) * 4
                    if d2 <= 2 {
                        out[i] = 250; out[i + 1] = 238; out[i + 2] = 200
                    } else if d2 <= 5 {
                        out[i] = 186; out[i + 1] = 56; out[i + 2] = 40
                    } else {
                        out[i] = 52; out[i + 1] = 38; out[i + 2] = 26
                    }
                }
            }
        }
        let total = max(1, w * h)
        let landPct = Int((Float(landPixels) / Float(total) * 100).rounded())
        let mtnPct = landPixels > 0 ? Int((Float(mountainPixels) / Float(landPixels) * 100).rounded()) : 0
        let forPct = landPixels > 0 ? Int((Float(forestPixels) / Float(landPixels) * 100).rounded()) : 0
        let coastDensity = landPixels > 0 ? Float(coastPixels) / Float(landPixels) : 0
        let coastKind = coastDensity > 0.14 ? "岛屿曲折" : coastDensity > 0.085 ? "海湾错落" : "大陆广袤"
        return (out, w, h, ThumbnailStats(landPercent: landPct, mountainPercent: mtnPct, forestPercent: forPct, coastKind: coastKind))
    }

    /// A sea texture shaded by depth, authored in the warm-paper pair (deep 0x527c86 → shallow 0x8eafb1).
    /// The renderer recolours this onto the selected preset, so the coastal gradient stays put.
    static func sea(_ m: WorldMap) -> [UInt8] {
        let picker = CellPicker(map: m), w = m.seaWidth, h = m.seaHeight
        var out = [UInt8](repeating: 255, count: w * h * 4)
        let deep = MapPalette.Ocean.warmPaper.deep, shallow = MapPalette.Ocean.warmPaper.shallow
        for y in 0..<h { for x in 0..<w {
            let px = (Float(x) + 0.5) * m.width / Float(w), py = (Float(y) + 0.5) * m.height / Float(h)
            let e = picker.cell(atX: px, y: py).map { Float(min(20, max(0, Int(m.elevation[$0])))) / 20 } ?? 0
            let t = e * e, o = (y * w + x) * 4
            out[o] = UInt8((deep.r + (shallow.r - deep.r) * t) * 255); out[o + 1] = UInt8((deep.g + (shallow.g - deep.g) * t) * 255); out[o + 2] = UInt8((deep.b + (shallow.b - deep.b) * t) * 255)
        } }
        return out
    }
}
