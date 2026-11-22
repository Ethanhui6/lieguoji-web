import Foundation

/// The compact state the app's views read (src/native-bridge/engine.ts state()), from the Swift run.
extension NativeEngine {

    /// state-line fmsStateLineColor: AdjustColor(AdjustColor(colour, +0.1 s, −0.05 v), +0.2 s, −0.2 v).
    /// ColorUtils.AdjustColor (RGB → HSV, saturation + ds, value − dv, back), on 0…1 components.
    public static func adjustColor(_ c: (Double, Double, Double), _ ds: Double, _ dv: Double) -> (Double, Double, Double) {
        let (r, g, b) = c, mx = max(r, g, b), mn = min(r, g, b), d = mx - mn
        var h = 0.0
        if d > 0 { h = mx == r ? ((g - b) / d) / 6 : mx == g ? (2 + (b - r) / d) / 6 : (4 + (r - g) / d) / 6; if h < 0 { h += 1 } }
        let s = min(1, max(0, (mx > 0 ? d / mx : 0) + ds)), val = min(1, max(0, mx - dv))
        let sector = h * 6, i = Int(sector.rounded(.down)) % 6, f = sector - sector.rounded(.down)
        let p = val * (1 - s), q = val * (1 - s * f), t = val * (1 - s * (1 - f))
        return [(val, t, p), (q, val, p), (p, val, t), (p, q, val), (t, p, val), (val, p, q)][i]
    }
    public static func stateLineColor(_ css: String) -> String {
        let v = Int(css.dropFirst(), radix: 16) ?? 0x999999
        func adjust(_ c: (Double, Double, Double), _ ds: Double, _ dv: Double) -> (Double, Double, Double) {
            let (r, g, b) = c, mx = max(r, g, b), mn = min(r, g, b), d = mx - mn
            var h = 0.0
            if d > 0 { h = mx == r ? ((g - b) / d) / 6 : mx == g ? (2 + (b - r) / d) / 6 : (4 + (r - g) / d) / 6; if h < 0 { h += 1 } }
            let s = min(1, max(0, (mx > 0 ? d / mx : 0) + ds)), val = min(1, max(0, mx - dv))
            let sector = h * 6, i = Int(sector.rounded(.down)) % 6, f = sector - sector.rounded(.down)
            let p = val * (1 - s), q = val * (1 - s * f), t = val * (1 - s * (1 - f))
            return [(val, t, p), (q, val, p), (p, val, t), (p, q, val), (t, p, val), (val, p, q)][i]
        }
        let c = adjust(adjust((Double(v >> 16 & 255) / 255, Double(v >> 8 & 255) / 255, Double(v & 255) / 255), 0.1, 0.05), 0.2, 0.2)
        return String(format: "#%02x%02x%02x", Int((c.0 * 255).rounded()), Int((c.1 * 255).rounded()), Int((c.2 * 255).rounded()))
    }
    /// original-labels47 stateLabelBoxes47 over the label grid of the statics (cell → land province).
    /// `owners`：每州所属分组（国家图为国家序号；文化、家族等视图为图例序号）。`name` 给出分组名用于估算字数；
    /// 不给时按国家序号取国名（序号越界则按空名）。以前视图分组直接拿去取国家数组，分组多于国家时越界闪退。
    func labels(_ owners: [Int], name: ((Int) -> String)? = nil) -> JS {
        let grid = statics.labelGrid
        if grid.isNull { return .array() }
        // The label grid is fixed for a world: read into arrays once.
        if labelGridCache == nil { labelGridCache = (grid.points.asArray.map(\.asNumber), grid.cells.asArray.map(\.asInt)) }
        let cellsX = grid.cellsX.asInt, pts = labelGridCache!.points, cells = labelGridCache!.cells
        let n = cells.count, unit = 1600.0 / 240.0
        func group(_ c: Int) -> Int? { cells[c] >= 0 && owners[cells[c]] >= 0 ? owners[cells[c]] : nil }
        var order = [Int](), groups = [Int: [Int]]()
        for c in 0..<n { guard let k = group(c) else { continue }; if groups[k] == nil { order.append(k) }; groups[k, default: []].append(c) }
        var singles = [Int: Int](); for o in owners { singles[o, default: 0] += 1 }
        var out = [JS]()
        // 国名分块 (as the original labels a state): each connected piece of a state's land gets its own
        // name — a state with land in the east and the west is named in both, not once in the gap
        // between them over another state. Pieces under a quarter of the largest (and under forty grid
        // points) stay unnamed.
        var parts = [(Int, [Int])]()
        for k in order {
            let all = groups[k]!
            var seen = Set<Int>(), pieces = [[Int]]()
            for s in all where !seen.contains(s) {
                var piece = [Int](), stack = [s]
                seen.insert(s)
                while let c = stack.popLast() {
                    piece.append(c)
                    let x = c % cellsX
                    for d in [x > 0 ? c - 1 : -1, x < cellsX - 1 ? c + 1 : -1, c - cellsX, c + cellsX] where d >= 0 && d < n && !seen.contains(d) && group(d) == k {
                        seen.insert(d); stack.append(d)
                    }
                }
                pieces.append(piece.sorted())
            }
            let largest = pieces.map(\.count).max() ?? 0
            for piece in pieces where piece.count == largest || piece.count >= max(40, largest / 4) { parts.append((k, piece)) }
        }
        // 国名入境 (app worlds): the name stands on the deepest ground of its piece, along the longest straight
        // run of its own land through that point, sized to fit. On a tangled continent a centroid falls on a
        // neighbour's land and names pile up there.
        let fit = run.regimes.enabled.isTruthy
        let rows = n / max(1, cellsX), x0 = pts[0], y0 = pts[1]
        let dx = cellsX > 1 ? (pts[2 * (cellsX - 1)] - x0) / Double(cellsX - 1) : unit, dy = rows > 1 ? (pts[2 * (n - cellsX) + 1] - y0) / Double(rows - 1) : unit
        var depth = [Int32](repeating: -1, count: fit ? n : 0)
        // App 规则国家图预索引都城地图坐标，排布国名时避开本国都城印记
        var capitalPos = [Int: (Double, Double)]()
        if fit && name == nil {
            let sc = run.scale.asNumber
            let safeScale = sc.isFinite && sc > 1e-6 ? sc : 1.0
            var cityPosById = [String: (Double, Double)]()
            for c in run.world.cities.asArray {
                if let cid = c.id.optionalString, !c.position.isNull {
                    cityPosById[cid] = (c.position.x.asNumber / safeScale, c.position.y.asNumber / safeScale)
                }
            }
            for (i, nation) in run.world.nations.asArray.enumerated() {
                if let cid = nation.capitalId.optionalString, let pos = cityPosById[cid] {
                    capitalPos[i] = pos
                }
            }
        }
        func cell(_ x: Double, _ y: Double) -> Int? {
            let row = Int(((y - y0) / dy).rounded()), column = Int(((x - x0) / dx).rounded())
            return row >= 0 && row < rows && column >= 0 && column < cellsX ? row * cellsX + column : nil
        }
        func neighbour(_ c: Int, _ i: Int) -> Int {
            switch i {
            case 0: return c % cellsX > 0 ? c - 1 : -1
            case 1: return c % cellsX < cellsX - 1 ? c + 1 : -1
            case 2: return c - cellsX
            default: return c + cellsX < n ? c + cellsX : -1
            }
        }
        for (k, list) in parts {
            // 网页对照模式保留原过滤；App 规则下哪怕单州小国、海岛国也始终生成国名框，避免国名消失。
            if !fit && singles[k] == 1 && list.count < 30 { continue }
            guard !list.isEmpty else { continue }
            var cx = 0.0, cy = 0.0; for c in list { cx += pts[2 * c]; cy += pts[2 * c + 1] }; cx /= Double(list.count); cy /= Double(list.count)
            var pole = list[0], best = Double.infinity
            for c in list { let d = pow(pts[2 * c] - cx, 2) + pow(pts[2 * c + 1] - cy, 2); if d < best { best = d; pole = c } }
            var start = pole, end = pole
            while start % cellsX > 0 && group(start - 1) == k { start -= 1 }
            while (end + 1) % cellsX > 0 && end + 1 < n && group(end + 1) == k { end += 1 }
            // 国名随领土倾斜 (the original lays a state's name along its land): the long axis of the
            // state's points (their principal direction), tilted at most 35°, the name as long as the land
            // is along it (the middle 80%) and centred on it. Recomputed whenever the borders move.
            var sxx = 0.0, syy = 0.0, sxy = 0.0
            for c in list { let dx = pts[2 * c] - cx, dy = pts[2 * c + 1] - cy; sxx += dx * dx; syy += dy * dy; sxy += dx * dy }
            var theta = 0.5 * atan2(2 * sxy, sxx - syy)
            if theta > .pi / 2 { theta -= .pi } else if theta < -.pi / 2 { theta += .pi }
            theta = max(-0.61, min(0.61, theta))
            let ux = cos(theta), uy = sin(theta)
            let along = list.map { (pts[2 * $0] - cx) * ux + (pts[2 * $0 + 1] - cy) * uy }.sorted()
            let lo = along[along.count / 10], hi = along[min(along.count - 1, along.count * 9 / 10)]
            let rowLength = abs(pts[2 * end] - pts[2 * start]) / unit
            let length = max(rowLength, (hi - lo) / unit), width = length * 0.6, height = max(width / 3, 1.5)
            let scale = (Double(min(2400, max(500, list.count))) - 500) / 1900
            let o = JS.object()
            let mid = (lo + hi) / 2
            var labelX = cx + ux * mid, labelY = cy + uy * mid, labelAngle = theta, labelWidth = width, labelHeight = height, labelMin = 15.0
            if fit {
                var queue = [Int](); queue.reserveCapacity(list.count)
                for c in list {
                    var edge = false
                    for i in 0..<4 { let d = neighbour(c, i); if d < 0 || d >= n || group(d) != k { edge = true; break } }
                    if edge { depth[c] = 0; queue.append(c) }
                }
                var head = 0
                while head < queue.count {
                    let c = queue[head]; head += 1
                    for i in 0..<4 { let d = neighbour(c, i); if d >= 0 && d < n && depth[d] < 0 && group(d) == k { depth[d] = depth[c] + 1; queue.append(d) } }
                }
                // 国名居中（2.0.2 舆图视觉优化）：在领土腹地（距离边界 >= 55% 最大纵深）选取最多 16 个空间均衡锚点
                // （含最深点、质心最近点与四象限腹心），倾角收敛在 ±20° 内并优先水平排版，同时适度避让本国都城印记。
                var deepestDepth: Int32 = 0
                for c in list where depth[c] > deepestDepth { deepestDepth = depth[c] }
                let inner = list.filter { depth[$0] * 100 >= deepestDepth * 55 }.sorted { depth[$0] != depth[$1] ? depth[$0] > depth[$1] : $0 < $1 }
                var places = [Int]()
                var picked = Set<Int>()
                func addPlace(_ c: Int) { if picked.insert(c).inserted { places.append(c) } }
                if let first = inner.first { addPlace(first) }
                if !inner.isEmpty {
                    var nearCenter = inner[0], nearDist = Double.infinity
                    var quadBest = [Int](repeating: -1, count: 4)
                    for c in inner {
                        let px = pts[2 * c], py = pts[2 * c + 1]
                        let d2 = (px - cx) * (px - cx) + (py - cy) * (py - cy)
                        if d2 < nearDist { nearDist = d2; nearCenter = c }
                        let q = (px >= cx ? 1 : 0) + (py >= cy ? 2 : 0)
                        if quadBest[q] < 0 { quadBest[q] = c }
                    }
                    addPlace(nearCenter)
                    for q in quadBest where q >= 0 { addPlace(q) }
                    let stride = max(1, inner.count / 12)
                    for idx in Swift.stride(from: 0, to: inner.count, by: stride) where places.count < 16 {
                        addPlace(inner[idx])
                    }
                }
                let letters = Double(max(1, MapLayers.stateLabel(name?(k) ?? (k >= 0 && k < run.world.nations.length ? run.world.nations[k].name.optionalString ?? "" : ""), full: true).count))
                let step = min(dx, dy) * 0.6
                let calmTheta = max(-0.35, min(0.35, theta))
                let candidateAngles: [Double] = abs(calmTheta) < 0.08 ? [0] : [0, calmTheta * 0.5, calmTheta]
                let capPos = capitalPos[k]
                var bestScore = -Double.infinity
                for place in places {
                    let px = pts[2 * place], py = pts[2 * place + 1]
                    func reach(_ ax: Double, _ ay: Double) -> Double {
                        var t = 0.0, end = 0.0, misses = 0
                        while misses < 2 && t < 3000 {
                            t += step
                            if let c = cell(px + ax * t, py + ay * t), group(c) == k { end = t; misses = 0 } else { misses += 1 }
                        }
                        return end
                    }
                    for angle in candidateAngles {
                        let ax = cos(angle), ay = sin(angle), a = reach(ax, ay), b = reach(-ax, -ay)
                        guard a + b > 0 else { continue }
                        // The clearance along the middle 70 % of the run: the name's band must fit inside it.
                        let mid = (a - b) / 2, half = (a + b) / 2 * 0.7
                        var clear = depth[place]
                        for j in 0...6 {
                            let t = mid + half * (Double(j) / 3 - 1)
                            let d = cell(px + ax * t, py + ay * t).map { group($0) == k ? depth[$0] : 0 } ?? 0
                            clear = min(clear, max(0, d))
                        }
                        let width = (a + b) / unit * 0.78
                        let across = Double(clear + 1) * min(dx, dy) * 2 / unit
                        let height = min(max(width / 2.8, 1.6), max(1.1, across * 0.92))
                        let x = px + ax * mid, y = py + ay * mid
                        let away = ((x - cx) * (x - cx) + (y - cy) * (y - cy)).squareRoot() / unit
                        // 水平排版优先（+12% 清晰度加权），仅当狭长斜向领土显著更宽时才温和倾斜
                        let baseSize = min(width / letters, height)
                        let orientationBonus: Double = angle == 0 ? 1.12 : (abs(angle) < 0.22 ? 1.04 : 1.0)
                        var score = baseSize * orientationBonus - away * 0.006
                        if let cap = capPos {
                            let capDist = ((x - cap.0) * (x - cap.0) + (y - cap.1) * (y - cap.1)).squareRoot()
                            if capDist < 22 {
                                score -= (22 - capDist) / 22 * baseSize * 0.42
                            }
                        }
                        if score > bestScore {
                            bestScore = score
                            labelX = x; labelY = y; labelAngle = angle; labelWidth = width; labelHeight = height
                        }
                    }
                }
                labelMin = 6
            }
            o.nation = JS(k); o.x = JS(labelX); o.y = JS(labelY); o.angle = JS(labelAngle)
            o.width = JS(labelWidth); o.height = JS(labelHeight); o.fontMax = JS(25 + 15 * min(1, max(0, scale))); o.fontMin = JS(labelMin)
            out.append(o)
        }
        return .array(out)
    }

    /// state(): day, date, owners (and labels when they changed), nations, armies, wars, sieges, events — as JSON (远程计算与测试).
    public func state(includeLabels: Bool) -> Data {
        let s = gameState(includeLabels: includeLabels)
        return Profile.measure("s.json") { (try? JSONEncoder().encode(s)) ?? Data() }
    }

    /// 界面状态，直接构造结构体（本机推演不经 JSON；字段与 JSON 版一致）。
    public func gameState(includeLabels: Bool) -> GameState {
        let r = run, w = r.world, sc = r.scale.asNumber
        let nations = w.nations.asArray, provinces = w.provinces.asArray
        var ni = [String: Int](); for (i, n) in nations.enumerated() { ni[n.id.asString] = i }
        var pi = [String: Int](); for (i, p) in provinces.enumerated() { pi[p.id.asString] = i }
        let owners = provinces.map { ni[$0.controller.asString] ?? -1 }
        var stock = [String: JS](); for s in w.statecraft.provinces.asArray { stock[s.provinceId.asString] = s }
        let current = r.life.currentDate
        let date = GameState.Date(year: current.year.asInt, month: current.month.asInt, day: current.day.asInt)
        var era: String?, yearOffset: Int?
        if !r.regimes.isNull, !r.regimes.calendar.isNull { era = r.regimes.calendar.era.optionalString; yearOffset = r.regimes.calendar.offset.optionalNumber.map { Int($0) } }
        // 国名框只在归属变化时才有：由原有的计算得出，再转成结构体（不常发生）。
        let labelBoxes: [WorldMeta.LabelBox]? = includeLabels ? Profile.measure("s.labels") { (try? JSONDecoder().decode([WorldMeta.LabelBox].self, from: Data(labels(owners).json.utf8))) ?? [] } : nil
        // Per-state totals in one pass over provinces, cities, armies and relations (each state used
        // to filter all of them again, every step).
        let cities = w.cities.asArray
        var cityIndex = [String: Int](); for (i, c) in cities.enumerated() { if let cid = c.id.optionalString, cityIndex[cid] == nil { cityIndex[cid] = i } }
        var ownCount = [Int](repeating: 0, count: nations.count), cityCount = ownCount
        var population = [Double](repeating: 0, count: nations.count), grain = population, troops = population
        for (p, owner) in owners.enumerated() where owner >= 0 {
            ownCount[owner] += 1
            if let s = stock[provinces[p].id.asString] { population[owner] += s.population.optionalNumber ?? 0; grain[owner] += s.grain.optionalNumber ?? 0 }
        }
        for c in cities { if let p = pi[c.provinceId.asString], owners[p] >= 0 { cityCount[owners[p]] += 1 } }
        for a in w.armies.asArray where a.status.asString != "destroyed" && a.troops.asNumber > 0 {
            if let n = ni[a.nationId.asString], a.troops.asNumber.isFinite { troops[n] += max(0, a.troops.asNumber) }
        }
        var enemies = [[Int]](repeating: [], count: nations.count)
        for rel in w.statecraft.relations.asArray where rel.status.asString == "war" {
            if let x = ni[rel.a.asString], let y = ni[rel.b.asString], x != y { enemies[x].append(y); enemies[y].append(x) }
        }
        let nationRows = nations.enumerated().map { i, n -> GameState.Nation in
            let id = n.id.asString
            // Identity for the map legend: states founded during play are not in the opening map.
            let civ = r.civilization.nations[id], color = n.color.optionalString ?? "#999999"
            var x = GameState.Nation(provinces: ownCount[i], cities: cityCount[i], population: Int(population[i]), grain: grain[i], troops: Int(troops[i]),
                                     gold: r.finance.nations[id].gold.optionalNumber ?? 0, destiny: r.destiny.nations[id].destiny.optionalNumber ?? 0,
                                     enemies: Array(Set(enemies[i])).sorted(), alive: ownCount[i] > 0)
            x.id = id; x.name = n.name.optionalString; x.color = color; x.line = Self.stateLineColor(color)
            // A state with no land has no capital left to mark.
            x.capital = ownCount[i] > 0 ? n.capitalId.optionalString.flatMap { cityIndex[$0] } ?? -1 : -1
            x.culture = civ.cultureId.optionalString ?? ""; x.polity = civ.polity.optionalString ?? ""; x.religion = civ.religionId.optionalString ?? ""
            return x
        }
        let space = Armies.space(r), bridge = Armies.bridge
        // Two armies in contact share a province (the original's battle rule), possibly far apart:
        // each is drawn at the middle of its clashes, half an icon back towards its own side, so the
        // two icons meet where the battle plays. Presentation only.
        var clash = [String: (x: Double, y: Double, n: Double)]()
        let halfIcon = 2.4 * sc
        func aim(_ k: String, _ x: Double, _ y: Double) { let o = clash[k] ?? (0, 0, 0); clash[k] = (o.x + x, o.y + y, o.n + 1) }
        let pairs = r.forceContacts.pairs.asArray
        for c in pairs where !c.pointA.isNull && !c.pointB.isNull {
            let ax = c.pointA.x.asNumber, ay = c.pointA.y.asNumber, bx = c.pointB.x.asNumber, by = c.pointB.y.asNumber
            let d = ((ax - bx) * (ax - bx) + (ay - by) * (ay - by)).squareRoot()
            if d / sc > 26 {
                // A far pair (most of a province apart) each advance ten units towards the other instead
                // of one icon appearing deep in the next province.
                let ux = (bx - ax) / d, uy = (by - ay) / d, step = min(6 * sc, d / 2) + halfIcon
                aim(c.a.asString, ax + ux * step, ay + uy * step); aim(c.b.asString, bx - ux * step, by - uy * step)
                continue
            }
            let mx = (ax + bx) / 2, my = (ay + by) / 2
            aim(c.a.asString, mx, my); aim(c.b.asString, mx, my)
        }
        // 帅旗 (app rules): in a state at war its largest army carries the commander's banner — the war
        // commander or the marshal, or else the ruler in person (御驾亲征), the leader its battles use.
        var banners = [String: (kind: String, mark: String, name: String)]()
        if !r.regimes.isNull {
            func label(_ p: JS) -> (mark: String, name: String) {
                let first = p.firstName.optionalString ?? "", last = p.lastName.optionalString ?? "", culture = p.cultureName.optionalString ?? ""
                let familyFirst = Nobility.cultures[culture].familyFirst.optionalBool ?? (culture == "chinese" || culture == "japanese")
                return (String((last.isEmpty ? first : last).prefix(1)), familyFirst ? last + first : last.isEmpty ? first : first + "·" + last)
            }
            // 各国最大的一支军队：一次遍历得出（原先每国都把全部军队筛一遍）。
            var largest = [String: JS]()
            for a in w.armies.asArray where a.status.asString != "destroyed" {
                let n = a.nationId.asString
                if let b = largest[n], !(b.troops.asNumber < a.troops.asNumber) { continue }
                largest[n] = a
            }
            for n in nations {
                let id = n.id.asString, wars = Offices.wars(r, id)
                guard !wars.isEmpty, let lead = largest[id] else { continue }
                var general: JS?
                if !r.offices47.isNull {
                    general = Offices.holder(r, id, "WarCommander", wars[0].scopeId) ?? Offices.holder(r, id, "Marshal", Offices.stateId(r, id))
                }
                if let g = general { let l = label(g); banners[lead.id.asString] = ("general", l.mark, l.name) }
                else if !r.people.nations[id].leaderId.isNull, let p = People.person(r, r.people.nations[id].leaderId.asInt) { let l = label(p); banners[lead.id.asString] = ("ruler", l.mark, l.name) }
            }
        }
        let manualArmies = Set(r.voyages.manualArmies.asArray.map(\.asString))
        var missionOf = [String: String]()
        if !r.voyages.missions.isNull { for (_, m) in r.voyages.missions.objectEntries { if let a = m.armyId.optionalString, missionOf[a] == nil { missionOf[a] = m.phase.optionalString ?? "" } } }
        var armyPoint = [(Double, Double)]()
        armyPoint.reserveCapacity(space.count)
        let armyRows = space.map { v -> GameState.Army in
            let a = v.army, id = a.id.asString, moving = v.travel.status.asString == "moving"
            var at: (Double, Double)
            // Every army is drawn at its real point. A separate resting spot made an icon jump when the
            // army set out or met an enemy and jump back after the battle; stacked icons are spread
            // apart by the map instead.
            // 行军中的军队按路径弧长平滑后的位置显示（抹平之字形路线造成的左右摆动；推演位置不变）。
            if let bridge { let p = bridge.graph.displayPoint(bridge.travel(v.travel), window: 4 * sc); at = (p.x, p.y) } else { at = (0, 0) }
            if let m = clash[Daily.key("army", id)] {
                let cx = m.x / m.n, cy = m.y / m.n, dx = at.0 - cx, dy = at.1 - cy, d = (dx * dx + dy * dy).squareRoot()
                at = d > halfIcon ? (cx + dx / d * halfIcon, cy + dy / d * halfIcon) : at
            }
            let safeScale = sc.isFinite && sc > 1e-6 ? sc : 1.0
            let rx = (at.0 / safeScale).isFinite ? at.0 / safeScale : 0.0
            let ry = (at.1 / safeScale).isFinite ? at.1 / safeScale : 0.0
            armyPoint.append((rx, ry))
            // Destination province of a march (last travel node), for the army panel, plus O(1) fast terrain route & ETA.
            var dest = -1
            var routeNote: String?
            if moving, let bridge {
                let tr = bridge.travel(v.travel), g = bridge.graph
                if let last = tr.nodes.last, g.provinces.indices.contains(last) {
                    let q = Int(g.provinces[last]); if q >= 0 && q < provinces.count { dest = q }
                }
                let unitKey = r.units[id].optionalString ?? "Infantry"
                let baseSp = r.forceSpeed.armies[id].base.optionalNumber ?? 0
                let unitSp = CombatReader.unitSpeed(unitKey) * Regimes.unitSpeed(r, a.nationId.asString, unitKey) * Regimes.armySpeed(r, id) * (UnitKinds.enabled ? (1 + (Regimes.bonus(r, a.nationId.asString, "speed") ?? 0) / 100) * Regimes.rule(r, "march") * ForceMotion.appMarch : 1)
                let secPerTick = r.forceClock.secondsPerTick.optionalNumber ?? 0.05
                let curLeg = max(0, min(max(0, tr.nodes.count - 1), tr.leg))
                let remLegs = max(1, tr.nodes.count - 1 - curLeg)
                let curCell = tr.nodes.indices.contains(curLeg) ? tr.nodes[curLeg] : 0
                let endCell = tr.nodes.last ?? curCell
                let midCell = tr.nodes.indices.contains(curLeg + remLegs / 2) ? tr.nodes[curLeg + remLegs / 2] : curCell
                let sampleCells = [curCell, midCell, endCell]
                var seaHits = 0, mtnHits = 0, roughHits = 0
                var avgSpd = 0.0
                for c in sampleCells where g.provinces.indices.contains(c) {
                    let q = Int(g.provinces[c])
                    if q < 0 { seaHits += 1 }
                    else if g.mountain.indices.contains(q) && g.mountain[q] { mtnHits += 1 }
                    else if g.plateau.indices.contains(q) && g.plateau[q] { roughHits += 1 }
                    else if g.faces.indices.contains(c) {
                        let bi = g.faceBiomes.indices.contains(Int(g.faces[c])) ? Int(g.faceBiomes[Int(g.faces[c])]) : 4
                        if [1, 2, 10, 11, 12].contains(bi) { roughHits += 1 }
                    }
                    avgSpd += ForceMotion.armySpeed(base: baseSp, unitSpeed: unitSp, cell: c, graph: g, secondsPerTick: secPerTick)
                }
                avgSpd /= Double(max(1, sampleCells.count))
                let curPt = g.location(tr).point
                let dstPt = tr.destination ?? (g.centers.indices.contains(endCell) ? g.centers[endCell] : curPt)
                let directDist = jsHypot(dstPt.x - curPt.x, dstPt.y - curPt.y)
                let estDist = max(directDist * 1.15, Double(remLegs) * 4.2 * sc)
                let ticks = avgSpd > 1e-6 ? estDist / avgSpd : 120.0
                let rawDays = (ticks / 120.0).rounded(.up)
                let etaDays = rawDays.isFinite ? Int(max(1, min(9999, rawDays))) : 1
                if a.status.asString == "retreating" {
                    let prefix = seaHits > 0 ? "渡海撤回" : "撤退休整"
                    routeNote = "\(prefix) · 约 \(etaDays) 日\(seaHits > 0 ? "返港" : "抵达")"
                } else {
                    let prefix = seaHits > 0 ? "渡海航行" : mtnHits > 0 ? "翻越关山险隘" : roughHits > 0 ? "跋涉荒漠险途" : "沿平畴谷道行军"
                    routeNote = "\(prefix) · 约 \(etaDays) 日\(seaHits > 0 ? "登陆" : "抵达")"
                }
            } else if v.travel.status.asString == "blocked" {
                let why = r.armyAutonomy.armies[id].reason.optionalString ?? ""
                routeNote = why.isEmpty ? "前方受阻或无外交通行权，暂停待命" : "受阻停步 · \(why)"
            } else {
                let orderDec = r.armyAutonomy.armies[id].decision.optionalString ?? ""
                let why = r.armyAutonomy.armies[id].reason.optionalString ?? ""
                if orderDec == "staging" { routeNote = "边境集结待发，兵力齐备后出击" }
                else if orderDec == "no-route" { routeNote = why.isEmpty ? "暂缺符合通行权的路线，原地待命" : why }
                else if orderDec == "guarding", why.contains("都城") { routeNote = "都城告急，留守护卫都城" }
            }
            let safeTroops = a.troops.asNumber.isFinite ? max(0, Int(a.troops.asNumber.rounded())) : 0
            let safeSupplies = a.supplies.asNumber.isFinite ? min(100, max(0, Int(a.supplies.asNumber.rounded()))) : 100
            let safeMorale = a.morale.asNumber.isFinite ? min(100, max(0, Int(a.morale.asNumber.rounded()))) : 80
            var x = GameState.Army(id: id, name: a.name.asString, nation: ni[a.nationId.asString] ?? -1, troops: safeTroops, unit: r.units[id].optionalString ?? "Infantry",
                                   status: a.status.asString, travel: v.travel.status.asString, province: v.province.flatMap { pi[$0.id.asString] } ?? -1,
                                   supplies: safeSupplies, morale: safeMorale, x: Float(rx), y: Float(ry),
                                   manual: manualArmies.contains(id), destination: dest, mission: missionOf[id] ?? "")
            x.reorganizing = !r.reorganization.active[id].isNull
            let order = r.armyAutonomy.armies[id].decision.optionalString ?? ""
            if ["attacking", "supporting", "guarding", "staging"].contains(order) { x.duty = order }
            if let b = banners[id] { x.banner = b.kind; x.bannerMark = b.mark; x.commander = b.name }
            x.routeNote = routeNote
            let rawFull = r.tactics.forces[id].fullStrength.optionalNumber ?? Double(safeTroops)
            x.full = max(safeTroops, rawFull.isFinite ? Int(rawFull.rounded()) : safeTroops)
            return x
        }
        // Fleets at their actual sea points and the harbour ports (open-sea worlds; empty otherwise).
        var fleetRows = [GameState.Fleet](), fleetPoint = [(Double, Double)]()
        if let bridge, !r.navy.isNull, !r.navy.fleets.isNull {
            let manualFleets = Set(r.voyages.manualFleets.asArray.map(\.asString))
            let safeScale = sc.isFinite && sc > 1e-6 ? sc : 1.0
            for fl in r.navy.fleets.asArray where fl.status.asString != "lost" {
                let id = fl.id.asString, rec = r.fleetPositions.records[id]
                if rec.isNull { continue }
                let p = bridge.graph.location(bridge.travel(rec)).point, row = r.navalAutonomy.isNull ? JS.null : r.navalAutonomy.fleets[id]
                let port = row.isNull ? nil : row.assignedPortId.optionalString.flatMap { a in Naval.sea?.ports.first { $0.id == a } }
                var at = (p.x, p.y)
                let fleetClash = clash[Daily.key("fleet", id)]
                if let m = fleetClash {
                    let cx = m.x / m.n, cy = m.y / m.n, dx = at.0 - cx, dy = at.1 - cy, d = (dx * dx + dy * dy).squareRoot()
                    at = d > halfIcon ? (cx + dx / d * halfIcon, cy + dy / d * halfIcon) : at
                }
                let fx = (at.0 / safeScale).isFinite ? at.0 / safeScale : 0.0
                let fy = (at.1 / safeScale).isFinite ? at.1 / safeScale : 0.0
                fleetPoint.append((fx, fy))
                let rawDecision = row.isNull ? "" : row.decision.optionalString ?? ""
                let decision = fleetClash != nil ? "busy" : rawDecision
                fleetRows.append(GameState.Fleet(id: id, name: fl.name.asString, nation: ni[fl.nationId.asString] ?? -1, ships: Int(fl.ships.asNumber), crew: Int(fl.crew.asNumber), food: Int(fl.food.asNumber),
                                                 hull: fl.ships.asNumber > 0 ? (r.maritime.hulls[id].optionalNumber ?? 0) / (fl.ships.asNumber * 100) : 0,
                                                 status: fl.status.asString, travel: rec.status.asString, x: Float(fx), y: Float(fy),
                                                 decision: decision, reason: row.isNull ? "" : row.reason.optionalString ?? "",
                                                 port: port.flatMap { pi[$0.provinceId] } ?? -1, manual: manualFleets.contains(id), patrol: fl.patrol.optionalBool ?? false))
            }
        }
        // 造舰: sunk fleets their state is rebuilding, with the months left.
        var yards: [GameState.Yard]?
        if !r.navy.isNull, !r.navy.fleets.isNull {
            yards = r.navy.fleets.asArray.compactMap { fl in
                guard let left = Shipyards.remaining(r, fl) else { return nil }
                return GameState.Yard(name: fl.name.asString, nation: ni[fl.nationId.asString] ?? -1, months: left.rounded(.up))
            }
        }
        // 圣地: each faith's holy province.
        let holy = Regimes.holyProvinces(r).map { GameState.Holy(religion: $0.religion, province: $0.province) }
        // 要塞: provinces whose city defence is level three or more (a fortress mark on the map).
        let forts = provinces.enumerated().compactMap { i, p -> Int? in (r.upperCombat.provinces[p.id.asString].storedDefense.optionalNumber ?? 1) >= 3 ? i : nil }
        let ports = (Naval.sea?.ports ?? []).compactMap { port -> GameState.Port? in
            guard let q = pi[port.provinceId] else { return nil }
            let c = r.portControl.isNull ? JS.null : r.portControl.ports[port.provinceId]
            return GameState.Port(province: q, x: Float(port.center.x / sc), y: Float(port.center.y / sc), owner: c.isNull ? -1 : ni[c.landOwnerId.asString] ?? -1,
                                  occupier: c.isNull ? -1 : ni[c.occupierId.asString] ?? -1, value: c.isNull ? 100 : c.value.asNumber.rounded())
        }
        var armyIndex = [String: Int](); for (i, v) in space.enumerated() { armyIndex[Daily.key("army", v.army.id.asString)] = i }
        let contacts = pairs.compactMap { p -> [Int]? in
            guard let a = armyIndex[p.a.asString], let b = armyIndex[p.b.asString] else { return nil }
            return [a, b]
        }
        // 海上会战（含交锋双方国家、舰队战力与炮击位置，供渲染层绘制双国战力条、舷炮对射与海浪冲击环）。
        var forcePoint = [String: (Double, Double)](), forceNation = [String: Int](), forceStrength = [String: Int]()
        for (i, v) in space.enumerated() {
            let k = Daily.key("army", v.army.id.asString)
            forcePoint[k] = armyPoint[i]
            forceNation[k] = armyRows[i].nation
            forceStrength[k] = max(1, armyRows[i].troops)
        }
        for (i, f) in fleetRows.enumerated() {
            let k = Daily.key("fleet", f.id)
            forcePoint[k] = fleetPoint[i]
            forceNation[k] = f.nation
            let strength = (Double(max(1, f.ships)) * 200 * max(0.15, f.hull)).rounded()
            forceStrength[k] = max(50, Int(exactly: strength) ?? 50)
        }
        let seaBattles = pairs.compactMap { p -> [Double]? in
            let ka = p.a.asString, kb = p.b.asString
            guard ka.hasPrefix("[\"fleet") || kb.hasPrefix("[\"fleet"), let a = forcePoint[ka], let b = forcePoint[kb] else { return nil }
            let na = Double(forceNation[ka] ?? -1), nb = Double(forceNation[kb] ?? -1)
            let sa = Double(forceStrength[ka] ?? 100), sb = Double(forceStrength[kb] ?? 100)
            return [(a.0 + b.0) / 2, (a.1 + b.1) / 2, na, nb, sa, sb, a.0, a.1, b.0, b.1]
        }
        let stateNation = Dictionary(r.nativeWars.nationIds.asArray.map { ($0[0].asInt, $0[1].asString) },
                                     uniquingKeysWith: { first, _ in first })
        let wars = r.nativeWars.campaigns.asArray.filter { $0.endedTick.isNull }.map { c -> GameState.War in
            let d = r.nativeDiplomacy.declarations.asArray.first { $0.warId.asInt == c.id.asInt }, goal = d.flatMap { $0.goals.asArray.first }
            // War goals' claimed provinces with their claimant (WarClaimAnimationManager).
            let claims = c.goals.asArray.flatMap { g -> [GameState.Claim] in
                guard !g.scope.isNull, !g.scope.provinceIds.isNull else { return [] }
                let claimant = stateNation[g.beneficiary.optionalNumber.map { Int($0) } ?? -1].flatMap { ni[$0] } ?? -1
                return g.scope.provinceIds.asArray.compactMap { n -> GameState.Claim? in
                    let index = n.asInt - 1
                    guard provinces.indices.contains(index) else { return nil }
                    return GameState.Claim(province: index, nation: claimant)
                }
            }
            var x = GameState.War(id: c.id.asInt, attacker: c.attacker.optionalString.flatMap { ni[$0] } ?? -1, defender: c.defender.optionalString.flatMap { ni[$0] } ?? -1,
                                  casusBelli: d.map { DeclarationText.casusBelli($0.casusBelliId.asInt) } ?? "",
                                  goal: goal.map { g in DeclarationText.goal(g.type.asInt, g.scope.isNull || g.scope.provinceIds.isNull ? 0 : g.scope.provinceIds.length) } ?? "",
                                  startDay: Int((c.openedTick.asNumber / 120).rounded(.down)),
                                  participants: c.participants.asArray.map { p in GameState.Participant(nation: stateNation[p.stateId.asInt].flatMap { ni[$0] } ?? -1, side: p.side.asInt) })
            x.claims = claims
            return x
        }
        Profile.measure("s.arrows") { battleArrows.update(r, day: w.day.asInt) }
        let arrows = battleArrows.all.map { a in [Double(a.source), Double(a.target), Double(a.attacker), Double(a.defender), a.start.x / sc, a.start.y / sc, a.control.x / sc, a.control.y / sc, a.end.x / sc, a.end.y / sc] }
        let sieges = r.occupation.sieges.asArray.map { s in
            GameState.Siege(province: pi[s.provinceId.asString] ?? -1, nation: ni[s.controller.asString] ?? -1, progress: s.maximum.asNumber > 0 ? s.resistance.asNumber / s.maximum.asNumber : 0)
        }
        let events = r.chronicle.entries.asArray.suffix(30).map { e in
            GameState.Event(day: e.day.asInt, text: e.text.optionalString ?? "", kind: e.kind.optionalString ?? "", province: e.place.id.optionalString.flatMap { pi[$0] })
        }
        var out = GameState(day: w.day.asInt, date: date, owners: owners, labels: labelBoxes, nations: nationRows, armies: armyRows, wars: wars, sieges: sieges, events: events)
        out.fleets = fleetRows; out.yards = yards; out.ports = ports; out.forts = forts; out.holy = holy
        out.contacts = contacts; out.arrows = arrows; out.seaBattles = seaBattles; out.era = era; out.yearOffset = yearOffset
        return out
    }
}
