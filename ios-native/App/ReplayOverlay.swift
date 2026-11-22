import SwiftUI
import LieguojiCore

// MARK: - 山河回放数据模型

struct ReplayTimelineData: Decodable {
    struct NationStub: Decodable {
        let name: String
        let color: String
    }
    struct NationUpdate: Decodable {
        let i: Int
        let name: String
        let color: String
    }
    struct PowerSlice: Decodable, Identifiable {
        let i: Int
        let p: Int
        var id: Int { i }
    }
    struct Frame: Decodable, Identifiable {
        let day: Int
        let year: Int
        let dateText: String
        let rle: [Int]
        let headline: String
        let kind: String
        let major: Bool
        let province: Int
        let aliveCount: Int
        let topNation: Int
        let topName: String
        let topProvinces: Int
        var topPowers: [PowerSlice]? = nil
        var updates: [NationUpdate]? = nil
        var id: Int { day }
    }
    let provinceCount: Int
    let nations: [NationStub]
    let frames: [Frame]
}

/// 可恢复推演的历史存档节点（每逢重要年份自动留存，支持在山河回放中一键回到该节点继续推演）。
struct WorldCheckpoint: Codable, Identifiable, Equatable {
    let day: Int
    let dateText: String
    let aliveCount: Int
    let fileName: String
    let savedAt: Date
    var id: Int { day }
}

// MARK: - GameModel 扩展：史册查询、山河回放与历史节点回溯

extension GameModel {
    func nationReigns(_ index: Int) async -> NationReignsReport? {
        await query(NationReignsReport.self) { await native.nationReigns(index) }
    }

    func replayTimeline() async -> ReplayTimelineData? {
        await query(ReplayTimelineData.self) { await native.replayTimeline() }
    }

    /// 回溯节点存放目录（按当前世界种子与日期区分，互不干扰）。
    private var checkpointDirectory: URL? {
        guard let map else { return nil }
        let safeSeed = map.meta.seed.filter { $0.isLetter || $0.isNumber || $0 == "-" }
        let folder = safeSeed.isEmpty ? "world-\(map.meta.provinces.count)" : "world-\(safeSeed)-\(map.meta.provinces.count)"
        let dir = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("列国纪/回溯节点/\(folder)", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    func loadCheckpoints() {
        guard let dir = checkpointDirectory else { checkpoints = []; return }
        let indexURL = dir.appendingPathComponent("index.json")
        if let raw = try? Data(contentsOf: indexURL), let list = try? JSONDecoder().decode([WorldCheckpoint].self, from: raw) {
            let valid = list.filter { FileManager.default.fileExists(atPath: dir.appendingPathComponent($0.fileName).path) }
                .sorted { $0.day < $1.day }
            checkpoints = valid
            lastCheckpointDay = valid.last?.day ?? -9999
        } else {
            checkpoints = []
            lastCheckpointDay = -9999
        }
    }

    /// 推演每跨过约 2 游戏年（或开局首日）静默留存一份可继续推演的回溯节点，最多保留 14 份（始终保留最早节点）。
    func maybeRecordCheckpoint(_ next: GameState) {
        guard !replayActive, !checkpointBusy, let dir = checkpointDirectory else { return }
        let gap = next.day - lastCheckpointDay
        guard checkpoints.isEmpty || gap >= 730 else { return }
        lastCheckpointDay = next.day
        checkpointBusy = true
        let day = next.day, dateText = next.dateText, alive = next.nations.filter(\.alive).count
        let fileName = "day-\(day).lgj"
        Task { [weak self] in
            defer { Task { @MainActor in self?.checkpointBusy = false } }
            guard let self, let data = await self.native.save() else { return }
            var current = self.checkpoints.filter { $0.day != day }
            let cp = WorldCheckpoint(day: day, dateText: dateText, aliveCount: alive, fileName: fileName, savedAt: Date())
            current.append(cp)
            current.sort { $0.day < $1.day }
            var removed = [String]()
            while current.count > 14 {
                // 保留首帧（索引 0），优先淘汰次早节点
                let drop = current.remove(at: 1)
                removed.append(drop.fileName)
            }
            let updated = current
            let ok = await Task.detached(priority: .utility) { () -> Bool in
                let fileURL = dir.appendingPathComponent(fileName)
                guard (try? data.write(to: fileURL, options: .atomic)) != nil else { return false }
                for r in removed { try? FileManager.default.removeItem(at: dir.appendingPathComponent(r)) }
                if let raw = try? JSONEncoder().encode(updated) {
                    try? raw.write(to: dir.appendingPathComponent("index.json"), options: .atomic)
                }
                return true
            }.value
            if ok { self.checkpoints = updated }
        }
    }

    /// 回到某个已保存的历史回溯节点，直接从该节点继续推演！
    func rollbackToCheckpoint(_ cp: WorldCheckpoint) async {
        guard let dir = checkpointDirectory else { return }
        let fileURL = dir.appendingPathComponent(cp.fileName)
        guard let data = try? Data(contentsOf: fileURL) else {
            notice = "该历史节点文件已丢失"
            return
        }
        exitReplay(restoreLive: false)
        pause(saving: false)
        worldEpoch &+= 1
        let epoch = worldEpoch
        do {
            let opened = try await native.open(data, world: epoch)
            guard epoch == worldEpoch else { return }
            nativeRevision = opened.revision
            advanceOwnership = AdvanceOwnership()
            if let next = await Self.decode(GameState.self, from: opened.state) {
                controller.snapArmies = true
                apply(next)
                notice = "已回到 \(cp.dateText)，可从此处重新改写历史"
                GameFeel.shared.notify(.success)
            }
        } catch {
            notice = "回溯节点载入失败：\(error.localizedDescription)"
            GameFeel.shared.notify(.error)
        }
    }

    /// 进入「山河回放」模式：支持正放、倒放、进度条自由拖动与逐节点跳转。
    func enterReplay(atDay targetDay: Int? = nil) async {
        pause(saving: false)
        controller.interactive = true
        controller.sheetOpen = false
        controller.replayLocked = true
        loadCheckpoints()
        guard let timeline = await replayTimeline(), !timeline.frames.isEmpty else {
            controller.replayLocked = false
            notice = "尚未积累足够的历史记录，推演片刻后再试"
            return
        }
        if !replayActive {
            savedLiveWorld = controller.world ?? map
            savedLiveArmies = controller.armies
            savedLiveEffects = controller.effects
            savedLiveMapView = mapView
        }
        replayTimelineData = timeline
        replayPlaying = false
        replayReversing = false
        replaySpeed = 1
        lastReplayOwners = []
        controller.replayAnimate = false
        controller.washEpoch &+= 1
        controller.washes = .empty
        controller.armies = []
        controller.route = []
        controller.effects = MapEffects()
        controller.viewFills = nil
        controller.viewLabels = nil
        controller.relations = [:]
        controller.relationsNation = nil
        controller.selectedProvince = nil
        controller.selectedArmy = nil
        controller.selectedFleet = nil
        controller.mode = .political
        replayActive = true

        let initialIdx: Int
        if let targetDay {
            initialIdx = timeline.frames.indices.min(by: { abs(timeline.frames[$0].day - targetDay) < abs(timeline.frames[$1].day - targetDay) }) ?? (timeline.frames.count - 1)
        } else {
            initialIdx = max(0, timeline.frames.count - 1)
        }
        seekReplay(to: initialIdx, focusEvent: targetDay != nil, animated: false)
    }

    func exitReplay(restoreLive: Bool = true) {
        replayTimer?.cancel()
        replayTimer = nil
        replayPlaying = false
        replayReversing = false
        controller.replayLocked = false
        controller.replayAnimate = false
        lastReplayOwners = []
        guard replayActive else { return }
        replayActive = false
        if restoreLive {
            controller.washEpoch &+= 1
            controller.washes = .empty
            if let live = savedLiveWorld { controller.world = live }
            if let armies = savedLiveArmies { controller.snapArmies = true; controller.armies = armies }
            if let fx = savedLiveEffects { controller.effects = fx }
            mapView = savedLiveMapView
            refreshArmies()
        }
        savedLiveWorld = nil
        savedLiveArmies = nil
        savedLiveEffects = nil
        replayTimelineData = nil
    }

    func pauseReplay() {
        stopReplayTimer()
    }

    func seekReplay(to index: Int, focusEvent: Bool = false, animated: Bool = true) {
        guard let timeline = replayTimelineData, !timeline.frames.isEmpty else { return }
        let clamped = max(0, min(timeline.frames.count - 1, index))
        replayIndex = clamped
        applyReplayFrame(at: clamped, in: timeline, animated: animated)
        if focusEvent {
            let p = timeline.frames[clamped].province
            if p >= 0, let m = map, m.meta.provinces.indices.contains(p) {
                let pr = m.meta.provinces[p]
                controller.showPlace(x: Double(pr.x), y: Double(pr.y))
            }
        }
    }

    func stepReplay(_ delta: Int) {
        guard let timeline = replayTimelineData, timeline.frames.count > 1 else {
            notice = "当前仅录制 1 帧，点下方「返回推演并录制」满 30 天即可逐帧回放"
            GameFeel.shared.notify(.warning)
            return
        }
        stopReplayTimer()
        let next = max(0, min(timeline.frames.count - 1, replayIndex + delta))
        if next == replayIndex {
            notice = delta < 0 ? "已到达时间轴起点" : "已到达最新历史帧"
            return
        }
        seekReplay(to: next, focusEvent: true, animated: true)
        GameFeel.shared.tap()
    }

    func toggleReplayPlay(reverse: Bool) {
        guard let timeline = replayTimelineData, timeline.frames.count > 1 else {
            notice = "当前仅录制 1 帧，点下方「返回推演并录制」满 30 天即可播放"
            GameFeel.shared.notify(.warning)
            return
        }
        if replayPlaying && replayReversing == reverse {
            stopReplayTimer()
            return
        }
        // 若已在终点点正放则从头开始；若已在起点点倒放则从末尾倒回
        if !reverse && replayIndex >= timeline.frames.count - 1 {
            seekReplay(to: 0, animated: false)
        } else if reverse && replayIndex <= 0 {
            seekReplay(to: timeline.frames.count - 1, animated: false)
        }
        replayReversing = reverse
        replayPlaying = true
        startReplayTimer()
    }

    func cycleReplaySpeed() {
        replaySpeed = replaySpeed == 1 ? 2 : replaySpeed == 2 ? 4 : 1
        GameFeel.shared.tap()
    }

    private func stopReplayTimer() {
        replayTimer?.cancel()
        replayTimer = nil
        replayPlaying = false
    }

    private func startReplayTimer() {
        replayTimer?.cancel()
        replayTimer = Task { [weak self] in
            while let self, !Task.isCancelled, self.replayPlaying, let timeline = self.replayTimelineData {
                let baseMs: Double = self.replaySpeed == 4 ? 220 : self.replaySpeed == 2 ? 380 : 620
                try? await Task.sleep(nanoseconds: UInt64(baseMs * 1_000_000))
                guard !Task.isCancelled, self.replayPlaying else { break }
                let next = self.replayIndex + (self.replayReversing ? -1 : 1)
                if next < 0 || next >= timeline.frames.count {
                    self.replayPlaying = false
                    break
                }
                self.seekReplay(to: next, focusEvent: false, animated: true)
            }
        }
    }

    /// 找出距离当前回放帧最近的可恢复推演节点（容差 1.5 游戏年，或直接列出全部节点）。
    func nearestCheckpoint(forDay day: Int) -> WorldCheckpoint? {
        checkpoints.min(by: { abs($0.day - day) < abs($1.day - day) }).flatMap { abs($0.day - day) <= 600 ? $0 : nil }
    }

    /// 将第 `index` 帧的 RLE 版图归属、历史国号与配色重建到 Metal 地图，
    /// 并在单步／播放推进时自动合成：易主墨晕扫色（FlipSweep）、战役进军弧形箭头、交锋火花与行军先锋军团！
    private func applyReplayFrame(at index: Int, in timeline: ReplayTimelineData, animated: Bool) {
        guard var world = savedLiveWorld ?? controller.world ?? map else { return }
        let frame = timeline.frames[index]
        let owners = ReplayEngine.decodeRLE(frame.rle, count: world.meta.provinces.count)
        let prevOwners = lastReplayOwners
        lastReplayOwners = owners

        // 重建截至该帧的历史国号与配色
        var names = timeline.nations.map(\.name)
        var colors = timeline.nations.map(\.color)
        for i in 0...index {
            for u in timeline.frames[i].updates ?? [] {
                while names.count <= u.i { names.append(""); colors.append("#888888") }
                names[u.i] = u.name
                colors[u.i] = u.color
            }
        }
        while world.meta.nations.count < names.count {
            let idx = world.meta.nations.count
            world.meta.nations.append(WorldMeta.Nation(id: "r-\(idx)", name: names[idx], color: colors[idx], line: NativeEngine.stateLineColor(colors[idx]), capital: -1, culture: "", polity: "", religion: ""))
        }
        for i in 0..<names.count {
            let old = world.meta.nations[i]
            if old.name != names[i] || old.color != colors[i] {
                world.meta.nations[i] = WorldMeta.Nation(id: old.id, name: names[i], color: colors[i], line: NativeEngine.stateLineColor(colors[i]), capital: old.capital, culture: old.culture, polity: old.polity, religion: old.religion)
            }
        }

        // 统计各国该帧州郡中心与包围盒，实时生成清晰的历史国名标注
        var sumX = [Int: Float](), sumY = [Int: Float](), minX = [Int: Float](), maxX = [Int: Float](), minY = [Int: Float](), maxY = [Int: Float](), cnt = [Int: Int]()
        var nationProvs = [Int: [Int]]()
        for i in 0..<min(owners.count, world.meta.provinces.count) {
            let o = owners[i]
            world.meta.provinces[i].nation = o
            guard o >= 0 else { continue }
            let p = world.meta.provinces[i]
            guard p.x.isFinite && p.y.isFinite else { continue }
            sumX[o, default: 0] += p.x; sumY[o, default: 0] += p.y; cnt[o, default: 0] += 1
            minX[o] = min(minX[o] ?? p.x, p.x); maxX[o] = max(maxX[o] ?? p.x, p.x)
            minY[o] = min(minY[o] ?? p.y, p.y); maxY[o] = max(maxY[o] ?? p.y, p.y)
            nationProvs[o, default: []].append(i)
        }
        var boxes = [WorldMeta.LabelBox]()
        for (n, c) in cnt where c > 0 && world.meta.nations.indices.contains(n) {
            let cx = sumX[n, default: 0] / Float(c)
            let cy = sumY[n, default: 0] / Float(c)
            let bw = max(24, (maxX[n, default: cx] - minX[n, default: cx]) * 0.85 + 22)
            let bh = max(16, (maxY[n, default: cy] - minY[n, default: cy]) * 0.55 + 14)
            let fMax = min(46, max(12, sqrt(Float(c)) * 8.5))
            let fMin = min(fMax, max(7, fMax * 0.45))
            boxes.append(WorldMeta.LabelBox(nation: n, x: cx, y: cy, width: bw, height: bh, fontMax: fMax, fontMin: fMin, angle: 0))
        }
        world.meta.labels = boxes

        // 合成史诗级回放战局视觉：易主墨晕扫色 + 战役弧形进军箭头 + 攻占火花 + 先锋行军军团与国都守军
        controller.replayAnimate = animated
        let stepTween = replaySpeed == 4 ? 0.20 : replaySpeed == 2 ? 0.34 : 0.54
        var fx = MapEffects()
        var washInputs = [WashInput]()
        var enemiesMap = [Int: Set<Int>]()
        var ripples = Set<Int>()
        var sprites = [MapRenderer.ArmySprite]()

        // 预先登记前 6 大强国在国都／重心处的历史守军旗帜，令疆域版图富有生命力
        let majorNations = cnt.sorted { $0.value != $1.value ? $0.value > $1.value : $0.key < $1.key }.prefix(6).map(\.key)
        for n in majorNations where world.meta.nations.indices.contains(n) {
            let capIdx = world.meta.nations[n].capital
            let pt: (Float, Float)
            if world.meta.cities.indices.contains(capIdx) {
                let c = world.meta.cities[capIdx]; pt = (c.x, c.y)
            } else if let c = cnt[n], c > 0 {
                pt = (sumX[n, default: 0] / Float(c), sumY[n, default: 0] / Float(c))
            } else { continue }
            sprites.append(MapRenderer.ArmySprite(army: -(1000 + n), x: pt.0, y: pt.1, unit: "elite", nation: n, selected: false, key: "rg-\(n)", tier: 2))
        }

        if animated && prevOwners.count == owners.count {
            var prevByNation = [Int: [Int]]()
            for p in prevOwners.indices where prevOwners[p] >= 0 {
                prevByNation[prevOwners[p], default: []].append(p)
            }
            struct Conquest { let attacker: Int; let defender: Int; let from: Int; let to: Int; let dist: Float }
            var conquests = [Conquest]()
            var gainedByNation = [Int: Int]()
            for p in owners.indices {
                let oldN = prevOwners[p], newN = owners[p]
                guard oldN != newN, newN >= 0, world.meta.provinces.indices.contains(p) else { continue }
                let tp = world.meta.provinces[p]
                guard tp.x.isFinite && tp.y.isFinite else { continue }
                gainedByNation[newN, default: 0] += 1
                if oldN >= 0 { enemiesMap[newN, default: []].insert(oldN) }
                // 寻找进攻出发州：优先上一帧中距目标州最近的本国实控州
                var bestFrom = p, bestD: Float = 1e12
                if let ownedPrev = prevByNation[newN] {
                    for cand in ownedPrev where world.meta.provinces.indices.contains(cand) {
                        let cp = world.meta.provinces[cand]
                        let dx = cp.x - tp.x, dy = cp.y - tp.y
                        let d = dx * dx + dy * dy
                        if d < bestD { bestD = d; bestFrom = cand }
                    }
                }
                let srcPt: SIMD2<Float> = world.meta.provinces.indices.contains(bestFrom)
                    ? SIMD2(world.meta.provinces[bestFrom].x, world.meta.provinces[bestFrom].y)
                    : SIMD2(tp.x, tp.y)
                let dstPt = SIMD2(tp.x, tp.y)
                washInputs.append(WashInput(province: p, attacker: newN, kind: .capture, progress: 1, day: frame.day, armies: [srcPt]))
                if bestFrom != p {
                    washInputs.append(WashInput(province: p, attacker: newN, kind: .march, progress: 0.9, day: frame.day, armies: [srcPt, dstPt], troops: 9000, key: "rm-\(newN)-\(p)"))
                }
                conquests.append(Conquest(attacker: newN, defender: oldN, from: bestFrom, to: p, dist: bestD.squareRoot()))
            }
            for (n, g) in gainedByNation where g >= 3 { ripples.insert(n) }
            if ["politics", "restoration", "uprising", "capital"].contains(frame.kind), frame.topNation >= 0 {
                ripples.insert(frame.topNation)
            }

            // 为每个活跃战线生成至多 8 支弧形战役箭头、攻占闪光、前线交锋火花与行军先锋军团
            var usedTargets = Set<Int>()
            var perAttacker = [Int: Int]()
            let unitPool = ["cavalry", "infantry", "spear", "heavy"]
            for (ci, cq) in conquests.prefix(24).enumerated() {
                guard !usedTargets.contains(cq.to), perAttacker[cq.attacker, default: 0] < 2, fx.arrows.count < 8 else { continue }
                usedTargets.insert(cq.to)
                let fp = world.meta.provinces[cq.from], tp = world.meta.provinces[cq.to]
                let rgb = world.meta.nations.indices.contains(cq.attacker) ? (RGB(css: world.meta.nations[cq.attacker].color) ?? RGB(0.7, 0.25, 0.18)) : RGB(0.7, 0.25, 0.18)
                fx.flashes.append(MapEffects.Flash(id: "rf-\(index)-\(cq.to)", x: Double(tp.x), y: Double(tp.y), r: Double(rgb.r), g: Double(rgb.g), b: Double(rgb.b)))

                if cq.from != cq.to && cq.dist > 4 {
                    perAttacker[cq.attacker, default: 0] += 1
                    let sx = Double(fp.x), sy = Double(fp.y), ex = Double(tp.x), ey = Double(tp.y)
                    let dx = ex - sx, dy = ey - sy
                    let len = max(1.0, hypot(dx, dy))
                    let curveSign: Double = (ci % 2 == 0) ? 1 : -1
                    let bend = min(34.0, len * 0.24) * curveSign
                    let cx = (sx + ex) * 0.5 - (dy / len) * bend
                    let cy = (sy + ey) * 0.5 + (dx / len) * bend
                    let shallow = (min(1, Double(rgb.r) * 0.65 + 0.35), min(1, Double(rgb.g) * 0.65 + 0.35), min(1, Double(rgb.b) * 0.65 + 0.35))
                    let deep = (Double(rgb.r) * 0.85, Double(rgb.g) * 0.85, Double(rgb.b) * 0.85)
                    fx.arrows.append(MapEffects.Arrow(key: "ra-\(index)-\(cq.attacker)-\(cq.to)", sx: sx, sy: sy, cx: cx, cy: cy, ex: ex, ey: ey, shallow: shallow, deep: deep))

                    // 行军先锋军团：在目标州就位并配合战斗火花表现推进态势
                    let unitKind = unitPool[(cq.attacker + ci) % unitPool.count]
                    let mx = Float((sx + ex) * 0.5 + (ex - sx) * 0.32)
                    let my = Float((sy + ey) * 0.5 + (ey - sy) * 0.32)
                    sprites.append(MapRenderer.ArmySprite(army: 10000 + ci, x: mx, y: my, unit: unitKind, nation: cq.attacker, selected: false, key: "rv-\(cq.attacker)-\(perAttacker[cq.attacker, default: 1])", tier: 2, fighting: cq.defender >= 0))

                    if cq.defender >= 0 && fx.battles.count < 4 {
                        fx.battles.append(MapEffects.Battle(key: "rb-\(index)-\(cq.to)", x: Double(tp.x), y: Double(tp.y)))
                    }
                }
            }
        }

        controller.tween = stepTween
        controller.snapArmies = !animated
        controller.armies = sprites
        controller.effects = fx
        if animated && (!washInputs.isEmpty || !ripples.isEmpty) {
            let enemies = enemiesMap.mapValues { Array($0).sorted() }
            controller.washes = WashFrame(day: frame.day, inputs: washInputs, enemies: enemies, ripples: Array(ripples).sorted())
        } else if !animated {
            controller.washEpoch &+= 1
            controller.washes = .empty
        }
        controller.world = world
    }
}

// MARK: - 山河回放交互浮层（挂载在 RootView 最顶层，彻底隔绝 GameView 遮挡与多 sheet 冲突）

struct ReplayOverlay: View {
    @ObservedObject var model: GameModel
    @Environment(\.verticalSizeClass) private var verticalClass
    private var landscape: Bool { verticalClass == .compact }
    @State private var showNodes = false
    @State private var collapsed = false
    @State private var showBanner = true
    @State private var deckDragY: CGFloat = 0
    @State private var confirmRollback: WorldCheckpoint?
    @State private var localToast: String?
    @State private var toastSerial = 0

    private struct PowerDisplay: Identifiable {
        let id: Int
        let name: String
        let color: Color
        let provinces: Int
        let share: Double
    }

    private func powerBreakdown(for frame: ReplayTimelineData.Frame, in timeline: ReplayTimelineData) -> [PowerDisplay] {
        let total = max(1, timeline.provinceCount)
        let slices: [ReplayTimelineData.PowerSlice]
        if let explicit = frame.topPowers, !explicit.isEmpty {
            slices = explicit
        } else if frame.topNation >= 0 && frame.topProvinces > 0 {
            slices = [ReplayTimelineData.PowerSlice(i: frame.topNation, p: frame.topProvinces)]
        } else {
            return []
        }
        let worldNations = model.controller.world?.meta.nations ?? model.map?.meta.nations ?? []
        return slices.prefix(4).map { s in
            let nm: String
            let hex: String
            if worldNations.indices.contains(s.i) {
                nm = MapLayers.stateLabel(worldNations[s.i].name, full: false)
                hex = worldNations[s.i].color
            } else if timeline.nations.indices.contains(s.i) {
                nm = MapLayers.stateLabel(timeline.nations[s.i].name, full: false)
                hex = timeline.nations[s.i].color
            } else {
                nm = frame.topName
                hex = "#7E7568"
            }
            return PowerDisplay(id: s.i, name: nm, color: Names.color(hex), provinces: s.p, share: Double(s.p) / Double(total))
        }
    }

    var body: some View {
        if let timeline = model.replayTimelineData, !timeline.frames.isEmpty {
            let idx = max(0, min(timeline.frames.count - 1, model.replayIndex))
            let frame = timeline.frames[idx]
            let nearCP = model.nearestCheckpoint(forDay: frame.day)
            let powers = powerBreakdown(for: frame, in: timeline)
            let multiFrame = timeline.frames.count > 1

            // 关键：基底为透明且不拦触摸的 Color.clear，顶/底/右悬浮层各占各自极小区域，
            // 中间整片舆图 100% 直通 Metal MapView，双指缩放与单指拖拽零阻拦；
            // 且全部浮层采用纯宣纸 `.glass(...)`（不再用会越界吞触摸的 scaledToFill 底图）。
            Color.clear
                .allowsHitTesting(false)
                .overlay(alignment: .top) {
                    topHeader(timeline: timeline, idx: idx, frame: frame, powers: powers)
                }
                .overlay(alignment: .trailing) {
                    if !showNodes && confirmRollback == nil {
                        zoomRail
                            .padding(.trailing, Theme.Control.screenInset)
                            .transition(.opacity)
                    }
                }
                .overlay(alignment: .bottom) {
                    Group {
                        if collapsed {
                            compactDeck(timeline: timeline, idx: idx, frame: frame, multiFrame: multiFrame)
                                .transition(.move(edge: .bottom).combined(with: .opacity))
                        } else if landscape {
                            landscapeDeck(timeline: timeline, idx: idx, frame: frame, nearCP: nearCP, multiFrame: multiFrame)
                                .transition(.move(edge: .bottom).combined(with: .opacity))
                        } else {
                            fullDeck(timeline: timeline, idx: idx, frame: frame, nearCP: nearCP, multiFrame: multiFrame)
                                .offset(y: max(0, deckDragY))
                                .transition(.move(edge: .bottom).combined(with: .opacity))
                        }
                    }
                }
                .overlay {
                    if showNodes {
                        nodesDrawer(timeline: timeline)
                            .transition(.opacity)
                            .zIndex(20)
                    }
                }
                .overlay {
                    if let cp = confirmRollback {
                        rollbackConfirmCard(cp)
                            .transition(.opacity.combined(with: .scale(scale: 0.94)))
                            .zIndex(30)
                    }
                }
                .overlay(alignment: .bottom) {
                    if let localToast {
                        HStack(spacing: 8) {
                            Seal(text: "史", size: 20)
                            Text(localToast).font(Theme.body).foregroundStyle(Theme.ink)
                        }
                        .padding(.horizontal, 14).padding(.vertical, 9)
                        .glass(Capsule())
                        .padding(.bottom, collapsed ? 76 : (landscape ? 104 : 206))
                        .onTapGesture { self.localToast = nil }
                        .transition(.opacity)
                        .zIndex(40)
                    }
                }
                .statusBarHidden()
                .animation(Motion.panel, value: collapsed)
                .animation(Motion.panel, value: showBanner)
                .animation(Motion.panel, value: showNodes)
                .animation(Motion.panel, value: confirmRollback)
                .onChange(of: model.notice) { _, text in
                    guard let text else { return }
                    model.notice = nil
                    toastSerial += 1
                    let serial = toastSerial
                    localToast = text
                    Task { try? await Task.sleep(nanoseconds: 2_200_000_000); if toastSerial == serial { localToast = nil } }
                }
        }
    }

    /// 右侧单手缩放胶囊（与双指捏合缩放互补，随时放大看战线或一键展开全图）
    private var zoomRail: some View {
        VStack(spacing: 2) {
            zoomBtn(symbol: "plus", label: "放大") { model.controller.zoom(1.55) }
            Rectangle().fill(Theme.ink.opacity(0.12)).frame(width: 20, height: 0.8)
            zoomBtn(symbol: "minus", label: "缩小") { model.controller.zoom(0.65) }
            Rectangle().fill(Theme.ink.opacity(0.12)).frame(width: 20, height: 0.8)
            zoomBtn(symbol: "arrow.up.left.and.arrow.down.right", label: "全图") { model.controller.unrollRequest = UUID() }
        }
        .padding(.vertical, 4).padding(.horizontal, 2)
        .glass(Capsule())
    }

    private func zoomBtn(symbol: String, label: String, action: @escaping () -> Void) -> some View {
        Button {
            GameFeel.shared.tap()
            action()
        } label: {
            Image(systemName: symbol)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Theme.ink)
                .frame(width: 34, height: 32)
                .contentShape(Rectangle())
        }
        .buttonStyle(PressStyle())
        .accessibilityLabel(label)
    }

    @ViewBuilder
    private func topHeader(timeline: ReplayTimelineData, idx: Int, frame: ReplayTimelineData.Frame, powers: [PowerDisplay]) -> some View {
        VStack(spacing: Theme.Control.gap) {
            // 与主界面顶栏严守同一 44pt 高度与 16pt 边距，按钮独立 zIndex(2) 响应、零遮挡零挤压
            HStack(spacing: Theme.Control.gap) {
                Button {
                    GameFeel.shared.tap()
                    showNodes = false
                    confirmRollback = nil
                    model.exitReplay()
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "chevron.left").font(.system(size: 13, weight: .semibold))
                        Text("返回当下").font(Theme.body).lineLimit(1)
                    }
                    .foregroundStyle(Theme.seal)
                    .padding(.horizontal, 13)
                    .frame(height: Theme.Control.topHeight)
                    .glass(Capsule())
                    .contentShape(Capsule())
                }
                .buttonStyle(PressStyle())

                // 中央胶囊：横屏单行整合日期 + 大事简讯 + 定位钮（不占第二行，露出整片地图）；竖屏点按可收折下方大事卡
                HStack(spacing: 7) {
                    SealFace(text: model.replayReversing ? "倒" : "史", size: 22, color: model.replayReversing ? Theme.jade : Theme.seal)
                    Text(frame.dateText).font(Theme.section).foregroundStyle(Theme.ink).monospacedDigit()
                        .lineLimit(1).minimumScaleFactor(0.72)
                        .contentTransition(.numericText())
                    if landscape {
                        Rectangle().fill(Theme.ink.opacity(0.14)).frame(width: 0.8, height: 15)
                        Text(frame.headline).font(Theme.label).foregroundStyle(Theme.ink2).lineLimit(1)
                        Text("(\(idx + 1)/\(timeline.frames.count))").font(Theme.caption).foregroundStyle(Theme.ink2).monospacedDigit()
                        if frame.province >= 0, let m = model.map, m.meta.provinces.indices.contains(frame.province) {
                            Button {
                                GameFeel.shared.tap()
                                let pr = m.meta.provinces[frame.province]
                                model.controller.showPlace(x: Double(pr.x), y: Double(pr.y))
                            } label: {
                                InkIcon(glyph: .locate, size: 14, weight: 1.8, accent: Theme.seal.opacity(0.25))
                                    .foregroundStyle(Theme.seal)
                                    .frame(width: 28, height: 28).background(Theme.seal.opacity(0.1), in: Circle())
                                    .contentShape(Circle())
                            }
                            .buttonStyle(PressStyle())
                        }
                    } else {
                        Spacer(minLength: 0)
                        Button {
                            GameFeel.shared.tap()
                            withAnimation(Motion.panel) { showBanner.toggle() }
                        } label: {
                            Image(systemName: showBanner ? "chevron.up" : "chevron.down")
                                .font(.system(size: 11, weight: .semibold))
                                .foregroundStyle(Theme.ink2)
                                .frame(width: 26, height: 26)
                                .background(Theme.wash.opacity(0.8), in: Circle())
                                .contentShape(Circle())
                        }
                        .buttonStyle(PressStyle())
                    }
                }
                .padding(.horizontal, 12)
                .frame(maxWidth: .infinity)
                .frame(height: Theme.Control.topHeight)
                .glass(Capsule())

                Button {
                    GameFeel.shared.tap()
                    model.pauseReplay()
                    withAnimation(Motion.panel) { showNodes = true }
                } label: {
                    HStack(spacing: 4) {
                        InkIcon(glyph: .chronicle, size: 15, weight: 1.75)
                        Text("节点").font(Theme.body).lineLimit(1)
                    }
                    .foregroundStyle(Theme.ink)
                    .padding(.horizontal, 13)
                    .frame(height: Theme.Control.topHeight)
                    .glass(Capsule())
                    .contentShape(Capsule())
                }
                .buttonStyle(PressStyle())
            }
            .zIndex(2)

            // 竖屏当帧大事横幅 + 实时大国疆域占比条（可轻点顶栏折起以获更大地图视野）
            if !landscape && showBanner {
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 10) {
                        KindSeal(kind: .of(frame.kind), size: 22)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(frame.headline).font(Theme.body).foregroundStyle(Theme.ink).lineLimit(2)
                            Text("第 \(idx + 1)/\(timeline.frames.count) 帧 · 存世 \(frame.aliveCount) 国\(frame.topName.isEmpty ? "" : " · 最强：\(frame.topName)（\(frame.topProvinces)州）")")
                                .font(Theme.caption).foregroundStyle(Theme.ink2).monospacedDigit().lineLimit(1).minimumScaleFactor(0.75)
                        }
                        Spacer(minLength: 4)
                        if frame.province >= 0, let m = model.map, m.meta.provinces.indices.contains(frame.province) {
                            Button {
                                GameFeel.shared.tap()
                                let pr = m.meta.provinces[frame.province]
                                model.controller.showPlace(x: Double(pr.x), y: Double(pr.y))
                            } label: {
                                InkIcon(glyph: .locate, size: 16, weight: 1.75, accent: Theme.seal.opacity(0.25))
                                    .foregroundStyle(Theme.seal)
                                    .frame(width: 36, height: 36).background(Theme.seal.opacity(0.1), in: Circle())
                                    .contentShape(Circle())
                            }
                            .buttonStyle(PressStyle())
                        }
                    }

                    if !powers.isEmpty {
                        VStack(alignment: .leading, spacing: 5) {
                            GeometryReader { g in
                                HStack(spacing: 1.5) {
                                    ForEach(powers) { pw in
                                        let w = max(6, g.size.width * CGFloat(pw.share))
                                        RoundedRectangle(cornerRadius: 3, style: .continuous)
                                            .fill(pw.color)
                                            .frame(width: w)
                                    }
                                    Rectangle().fill(Theme.ink.opacity(0.12))
                                }
                                .clipShape(Capsule())
                            }
                            .frame(height: 6)
                            .animation(Motion.drift, value: idx)

                            HStack(spacing: 10) {
                                ForEach(powers.prefix(3)) { pw in
                                    HStack(spacing: 4) {
                                        Circle().fill(pw.color).frame(width: 7, height: 7)
                                        Text("\(pw.name) \(Int((pw.share * 100).rounded()))%")
                                            .font(Theme.caption).foregroundStyle(Theme.ink2).monospacedDigit().lineLimit(1)
                                    }
                                }
                                Spacer(minLength: 0)
                            }
                        }
                    }
                }
                .padding(.horizontal, Theme.Layout.cardPadding).padding(.vertical, 10)
                .glass(RoundedRectangle(cornerRadius: Theme.Control.cornerCard, style: .continuous))
                .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
        .padding(.horizontal, Theme.Control.screenInset).padding(.top, 4)
    }

    @ViewBuilder
    private func nodesDrawer(timeline: ReplayTimelineData) -> some View {
        let drawerShape = UnevenRoundedRectangle(topLeadingRadius: Theme.Control.cornerSheet, bottomLeadingRadius: 0, bottomTrailingRadius: 0, topTrailingRadius: Theme.Control.cornerSheet, style: .continuous)
        ZStack(alignment: .bottom) {
            Color.black.opacity(0.32)
                .ignoresSafeArea()
                .onTapGesture {
                    GameFeel.shared.tap()
                    withAnimation(Motion.panel) { showNodes = false }
                }

            VStack(spacing: 0) {
                SheetGrabber()
                HStack {
                    Spacer()
                    Button {
                        GameFeel.shared.tap()
                        withAnimation(Motion.panel) { showNodes = false }
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "xmark").font(.system(size: 12, weight: .semibold))
                            Text("关闭").font(Theme.label)
                        }
                        .foregroundStyle(Theme.ink2)
                        .padding(.horizontal, 12).frame(height: 30)
                        .background(Theme.wash, in: Capsule())
                        .contentShape(Capsule())
                    }
                    .buttonStyle(PressStyle())
                }
                .padding(.horizontal, 16)

                ReplayNodesSheet(model: model, timeline: timeline, onPickFrame: { i in
                    withAnimation(Motion.panel) { showNodes = false }
                    model.seekReplay(to: i, focusEvent: true, animated: true)
                }, onRollback: { cp in
                    withAnimation(Motion.panel) {
                        showNodes = false
                        confirmRollback = cp
                    }
                })
            }
            .frame(maxWidth: landscape ? 560 : .infinity)
            .frame(maxHeight: landscape ? 310 : 560)
            .background(MemorialPaper(rules: true, fullBleed: false).clipShape(drawerShape).ignoresSafeArea(edges: .bottom))
            .overlay(drawerShape.stroke(Theme.ink.opacity(0.18), lineWidth: 0.9).allowsHitTesting(false))
            .shadow(color: .black.opacity(0.22), radius: 18, y: -4)
            .transition(.move(edge: .bottom))
        }
    }

    @ViewBuilder
    private func rollbackConfirmCard(_ cp: WorldCheckpoint) -> some View {
        ZStack {
            Color.black.opacity(0.36)
                .ignoresSafeArea()
                .onTapGesture {
                    withAnimation(Motion.panel) { confirmRollback = nil }
                }

            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 10) {
                    SealFace(text: "溯", size: 28, color: Theme.jade)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("回到 \(cp.dateText) 继续推演？").font(Theme.section).foregroundStyle(Theme.ink)
                        Text("存世 \(cp.aliveCount) 国").font(Theme.caption).foregroundStyle(Theme.ink2)
                    }
                }
                Text("将把当前世界状态恢复至该历史节点，之后的战局与王朝走向均可重新演绎。")
                    .font(Theme.body).foregroundStyle(Theme.ink2).fixedSize(horizontal: false, vertical: true)
                HStack(spacing: 10) {
                    Button {
                        GameFeel.shared.tap()
                        withAnimation(Motion.panel) { confirmRollback = nil }
                    } label: {
                        Text("取消").font(Theme.body).foregroundStyle(Theme.ink)
                            .frame(maxWidth: .infinity).frame(height: 40)
                            .background(Theme.paper2, in: RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous).stroke(Theme.line))
                    }
                    .buttonStyle(PressStyle())

                    Button {
                        GameFeel.shared.tap()
                        confirmRollback = nil
                        Task { await model.rollbackToCheckpoint(cp) }
                    } label: {
                        Text("确定回溯").font(Theme.body).foregroundStyle(Theme.paper2)
                            .frame(maxWidth: .infinity).frame(height: 40)
                            .background(Theme.seal, in: RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous))
                    }
                    .buttonStyle(PressStyle())
                }
            }
            .padding(18)
            .frame(maxWidth: 380)
            .glass(RoundedRectangle(cornerRadius: Theme.Control.cornerCard, style: .continuous))
            .padding(.horizontal, 28)
        }
    }

    /// 横屏紧凑回放控制坞（单栏居中、高度精简，让出 >72% 舆图空间供双指缩放观看战局）
    @ViewBuilder
    private func landscapeDeck(timeline: ReplayTimelineData, idx: Int, frame: ReplayTimelineData.Frame, nearCP: WorldCheckpoint?, multiFrame: Bool) -> some View {
        VStack(spacing: 6) {
            if multiFrame {
                Slider(
                    value: Binding(
                        get: { Double(model.replayIndex) },
                        set: { v in
                            let target = Int(v.rounded())
                            if target != model.replayIndex { model.seekReplay(to: target, animated: false) }
                        }
                    ),
                    in: 0...Double(timeline.frames.count - 1),
                    step: 1,
                    onEditingChanged: { editing in
                        if editing { model.pauseReplay() }
                    }
                )
                .tint(model.replayReversing ? Theme.jade : Theme.seal)
            }
            HStack(spacing: 10) {
                Button { model.stepReplay(-1) } label: {
                    InkIcon(glyph: .stepBack, size: 15, weight: 1.75).foregroundStyle(Theme.ink)
                        .frame(width: 34, height: 34).background(Theme.paper2, in: Circle()).overlay(Circle().stroke(Theme.line))
                }
                .buttonStyle(PressStyle()).opacity(multiFrame && idx > 0 ? 1 : 0.42)

                Button {
                    GameFeel.shared.tap()
                    model.toggleReplayPlay(reverse: true)
                } label: {
                    let activeRev = model.replayPlaying && model.replayReversing
                    HStack(spacing: 4) {
                        InkIcon(glyph: activeRev ? .pause : .rewind, size: 13, weight: 1.8)
                        Text("倒放").font(Theme.label)
                    }
                    .foregroundStyle(activeRev ? Theme.paper2 : Theme.ink)
                    .padding(.horizontal, 11).frame(height: 34)
                    .background(activeRev ? Theme.jade : Theme.paper2, in: Capsule())
                    .overlay(Capsule().stroke(activeRev ? Color.clear : Theme.line))
                }
                .buttonStyle(PressStyle()).opacity(multiFrame ? 1 : 0.55)

                Button {
                    GameFeel.shared.tap()
                    model.toggleReplayPlay(reverse: false)
                } label: {
                    let activeFwd = model.replayPlaying && !model.replayReversing
                    InkIcon(glyph: activeFwd ? .pause : .play, size: 16, weight: 1.95)
                        .foregroundStyle(Theme.paper2)
                        .frame(width: 38, height: 38)
                        .background(Theme.seal, in: Circle())
                }
                .buttonStyle(PressStyle()).opacity(multiFrame ? 1 : 0.55)

                Button { model.stepReplay(1) } label: {
                    InkIcon(glyph: .stepForward, size: 15, weight: 1.75).foregroundStyle(Theme.ink)
                        .frame(width: 34, height: 34).background(Theme.paper2, in: Circle()).overlay(Circle().stroke(Theme.line))
                }
                .buttonStyle(PressStyle()).opacity(multiFrame && idx < timeline.frames.count - 1 ? 1 : 0.42)

                Button { model.cycleReplaySpeed() } label: {
                    Text("\(model.replaySpeed)×").font(Theme.body).foregroundStyle(model.replaySpeed > 1 ? Theme.seal : Theme.ink)
                        .frame(width: 34, height: 34).background(Theme.paper2, in: Circle()).overlay(Circle().stroke(Theme.line))
                        .contentTransition(.numericText())
                }
                .buttonStyle(PressStyle())

                if let nearCP {
                    Button {
                        GameFeel.shared.tap()
                        confirmRollback = nearCP
                    } label: {
                        Text("回溯此年").font(Theme.label).foregroundStyle(Theme.jade)
                            .padding(.horizontal, 10).frame(height: 34)
                            .background(Theme.jade.opacity(0.1), in: Capsule())
                            .overlay(Capsule().stroke(Theme.jade.opacity(0.32), lineWidth: 0.8))
                    }
                    .buttonStyle(PressStyle())
                }

                Button {
                    GameFeel.shared.tap()
                    withAnimation(Motion.panel) { collapsed = true }
                } label: {
                    Image(systemName: "chevron.down").font(.system(size: 12, weight: .semibold)).foregroundStyle(Theme.ink2)
                        .frame(width: 30, height: 30).background(Theme.wash, in: Circle())
                }
                .buttonStyle(PressStyle())
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 8)
        .frame(maxWidth: 560)
        .glass(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .padding(.horizontal, Theme.Control.screenInset).padding(.bottom, 6)
    }

    @ViewBuilder
    private func compactDeck(timeline: ReplayTimelineData, idx: Int, frame: ReplayTimelineData.Frame, multiFrame: Bool) -> some View {
        HStack(spacing: 10) {
            Button {
                GameFeel.shared.tap()
                withAnimation(Motion.panel) { collapsed = false }
            } label: {
                HStack(spacing: 4) {
                    Image(systemName: "chevron.up").font(.system(size: 12, weight: .semibold))
                    Text("展开").font(Theme.label)
                }
                .foregroundStyle(Theme.ink2)
                .padding(.horizontal, 10).frame(height: 36)
                .background(Theme.wash, in: Capsule())
            }
            .buttonStyle(PressStyle())

            Button {
                GameFeel.shared.tap()
                model.toggleReplayPlay(reverse: true)
            } label: {
                let activeRev = model.replayPlaying && model.replayReversing
                InkIcon(glyph: activeRev ? .pause : .rewind, size: 16, weight: 1.8)
                    .foregroundStyle(activeRev ? Theme.paper2 : Theme.ink)
                    .frame(width: 38, height: 38)
                    .background(activeRev ? Theme.jade : Theme.paper2, in: Circle())
                    .overlay(Circle().stroke(activeRev ? Color.clear : Theme.line))
            }
            .buttonStyle(PressStyle())

            Button {
                GameFeel.shared.tap()
                model.toggleReplayPlay(reverse: false)
            } label: {
                let activeFwd = model.replayPlaying && !model.replayReversing
                InkIcon(glyph: activeFwd ? .pause : .play, size: 17, weight: 1.9)
                    .foregroundStyle(Theme.paper2)
                    .frame(width: 42, height: 42)
                    .background(Theme.seal, in: Circle())
            }
            .buttonStyle(PressStyle())

            Text("\(idx + 1)/\(timeline.frames.count)").font(Theme.label).foregroundStyle(Theme.ink2).monospacedDigit()

            Button { model.cycleReplaySpeed() } label: {
                Text("\(model.replaySpeed)×").font(Theme.label).foregroundStyle(model.replaySpeed > 1 ? Theme.seal : Theme.ink)
                    .frame(width: 34, height: 34).background(Theme.paper2, in: Circle()).overlay(Circle().stroke(Theme.line))
            }
            .buttonStyle(PressStyle())
        }
        .padding(.horizontal, 12).padding(.vertical, 8)
        .glass(Capsule())
        .padding(.bottom, 10)
    }

    @ViewBuilder
    private func fullDeck(timeline: ReplayTimelineData, idx: Int, frame: ReplayTimelineData.Frame, nearCP: WorldCheckpoint?, multiFrame: Bool) -> some View {
        VStack(spacing: 10) {
            // 仅在顶部收起手柄挂下拉手势，避免和滑条或舆图双指缩放抢占触控
            HStack(spacing: 8) {
                Button {
                    GameFeel.shared.tap()
                    showNodes = false
                    confirmRollback = nil
                    model.exitReplay()
                } label: {
                    Text("返回当下").font(Theme.caption).foregroundStyle(Theme.seal)
                        .padding(.horizontal, 10).frame(height: 28)
                        .background(Theme.seal.opacity(0.09), in: Capsule())
                        .contentShape(Capsule())
                }
                .buttonStyle(PressStyle())

                Spacer()
                Button {
                    GameFeel.shared.tap()
                    withAnimation(Motion.panel) { collapsed = true }
                } label: {
                    Capsule().fill(Theme.ink.opacity(0.22)).frame(width: 38, height: 4)
                        .frame(width: 68, height: 26).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .gesture(
                    DragGesture(minimumDistance: 10)
                        .onChanged { g in deckDragY = g.translation.height > 0 ? g.translation.height : 0 }
                        .onEnded { g in
                            if g.translation.height > 36 || g.predictedEndTranslation.height > 70 {
                                GameFeel.shared.tap()
                                withAnimation(Motion.panel) { collapsed = true; deckDragY = 0 }
                            } else {
                                withAnimation(Motion.panel) { deckDragY = 0 }
                            }
                        }
                )
                Spacer()

                Button {
                    GameFeel.shared.tap()
                    model.pauseReplay()
                    withAnimation(Motion.panel) { showNodes = true }
                } label: {
                    Text("节点(\(timeline.frames.count))").font(Theme.caption).foregroundStyle(Theme.ink)
                        .padding(.horizontal, 10).frame(height: 28)
                        .background(Theme.wash, in: Capsule())
                        .contentShape(Capsule())
                }
                .buttonStyle(PressStyle())
            }

            // 关键节点刻度条 + 交互进度滑条（拖动时自动暂停计时器，避免互相抢占；拖动无墨晕延迟，松手丝滑定格）
            if multiFrame {
                VStack(spacing: 4) {
                    GeometryReader { g in
                        ZStack(alignment: .leading) {
                            Capsule().fill(Theme.ink.opacity(0.1)).frame(height: 4)
                            let frac = CGFloat(idx) / CGFloat(max(1, timeline.frames.count - 1))
                            Capsule().fill(model.replayReversing ? Theme.jade : Theme.seal).frame(width: max(4, g.size.width * frac), height: 4)
                            ForEach(Array(timeline.frames.enumerated()), id: \.offset) { i, f in
                                if f.major {
                                    Circle()
                                        .fill(i == idx ? Theme.seal : Theme.ink.opacity(0.38))
                                        .frame(width: i == idx ? 7 : 4, height: i == idx ? 7 : 4)
                                        .offset(x: g.size.width * CGFloat(i) / CGFloat(max(1, timeline.frames.count - 1)) - 2)
                                }
                            }
                        }
                    }
                    .frame(height: 8)

                    Slider(
                        value: Binding(
                            get: { Double(model.replayIndex) },
                            set: { v in
                                let target = Int(v.rounded())
                                if target != model.replayIndex { model.seekReplay(to: target, animated: false) }
                            }
                        ),
                        in: 0...Double(timeline.frames.count - 1),
                        step: 1,
                        onEditingChanged: { editing in
                            if editing { model.pauseReplay() }
                        }
                    )
                    .tint(model.replayReversing ? Theme.jade : Theme.seal)
                }
            } else {
                VStack(spacing: 8) {
                    Text("目前仅有开局首帧，推演满 30 天或发生大事即自动录制历史帧。")
                        .font(Theme.caption).foregroundStyle(Theme.ink2).multilineTextAlignment(.center)
                    Button {
                        GameFeel.shared.tap()
                        model.exitReplay()
                        model.play()
                        model.notice = "已恢复推演，每 30 天及大事自动留存山河回放帧"
                    } label: {
                        HStack(spacing: 6) {
                            InkIcon(glyph: .play, size: 14, weight: 1.9)
                            Text("返回推演并自动录制").font(Theme.body)
                        }
                        .foregroundStyle(Theme.paper2)
                        .frame(maxWidth: .infinity).frame(height: 40)
                        .background(Theme.seal, in: RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous))
                    }
                    .buttonStyle(PressStyle())
                }
                .padding(.vertical, 2)
            }

            // 播放 / 倒放 / 步进 / 倍速按钮排
            HStack(spacing: 12) {
                Button { model.stepReplay(-1) } label: {
                    InkIcon(glyph: .stepBack, size: 17, weight: 1.75)
                        .foregroundStyle(Theme.ink)
                        .frame(width: 42, height: 42).background(Theme.paper2, in: Circle())
                        .overlay(Circle().stroke(Theme.line))
                }
                .buttonStyle(PressStyle()).opacity(multiFrame && idx > 0 ? 1 : 0.42)

                Button {
                    GameFeel.shared.tap()
                    model.toggleReplayPlay(reverse: true)
                } label: {
                    let activeRev = model.replayPlaying && model.replayReversing
                    HStack(spacing: 5) {
                        InkIcon(glyph: activeRev ? .pause : .rewind, size: 14, weight: 1.8)
                        Text("倒放").font(Theme.body)
                    }
                    .foregroundStyle(activeRev ? Theme.paper2 : Theme.ink)
                    .padding(.horizontal, 14).frame(height: 42)
                    .background(activeRev ? Theme.jade : Theme.paper2, in: Capsule())
                    .overlay(Capsule().stroke(activeRev ? Color.clear : Theme.line))
                }
                .buttonStyle(PressStyle()).opacity(multiFrame ? 1 : 0.55)

                Button {
                    GameFeel.shared.tap()
                    model.toggleReplayPlay(reverse: false)
                } label: {
                    let activeFwd = model.replayPlaying && !model.replayReversing
                    InkIcon(glyph: activeFwd ? .pause : .play, size: 20, weight: 1.95)
                        .foregroundStyle(Theme.paper2)
                        .frame(width: 50, height: 50)
                        .background(Theme.seal, in: Circle())
                        .shadow(color: Theme.seal.opacity(0.32), radius: 5, y: 2)
                }
                .buttonStyle(PressStyle()).opacity(multiFrame ? 1 : 0.55)

                Button { model.stepReplay(1) } label: {
                    InkIcon(glyph: .stepForward, size: 17, weight: 1.75)
                        .foregroundStyle(Theme.ink)
                        .frame(width: 42, height: 42).background(Theme.paper2, in: Circle())
                        .overlay(Circle().stroke(Theme.line))
                }
                .buttonStyle(PressStyle()).opacity(multiFrame && idx < timeline.frames.count - 1 ? 1 : 0.42)

                Button { model.cycleReplaySpeed() } label: {
                    Text("\(model.replaySpeed)×").font(Theme.section).foregroundStyle(model.replaySpeed > 1 ? Theme.seal : Theme.ink)
                        .frame(width: 42, height: 42).background(Theme.paper2, in: Circle())
                        .overlay(Circle().stroke(Theme.line))
                        .contentTransition(.numericText())
                }
                .buttonStyle(PressStyle())
            }

            if let nearCP {
                Button {
                    GameFeel.shared.tap()
                    confirmRollback = nearCP
                } label: {
                    HStack(spacing: 6) {
                        InkIcon(glyph: .replay, size: 15, weight: 1.75)
                        Text("回到 \(nearCP.dateText) 继续推演（改写历史）").font(Theme.label)
                    }
                    .foregroundStyle(Theme.jade)
                    .frame(maxWidth: .infinity).frame(height: 36)
                    .background(Theme.jade.opacity(0.1), in: RoundedRectangle(cornerRadius: Theme.Control.cornerChip, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: Theme.Control.cornerChip, style: .continuous).stroke(Theme.jade.opacity(0.32), lineWidth: 0.8))
                }
                .buttonStyle(PressStyle())
            }
        }
        .padding(.horizontal, Theme.Layout.pageInset).padding(.top, 6).padding(.bottom, 12)
        .glass(RoundedRectangle(cornerRadius: 22, style: .continuous))
        .padding(.horizontal, Theme.Layout.pageInset).padding(.bottom, 8)
    }
}

/// 历史回放节点目录与可回溯存档列表
private struct ReplayNodesSheet: View {
    @ObservedObject var model: GameModel
    let timeline: ReplayTimelineData
    let onPickFrame: (Int) -> Void
    let onRollback: (WorldCheckpoint) -> Void
    @State private var tab = "nodes"

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                SheetHeader(title: "历史节点", subtitle: "共 \(timeline.frames.count) 帧版图记录 · \(model.checkpoints.count) 个可回溯节点", seal: "溯", showGrabber: false)
                ChipPicker(items: [("nodes", "全部时间节点"), ("major", "重大转折"), ("checkpoints", "可续推节点（\(model.checkpoints.count)）")], selection: $tab)
                    .padding(.horizontal, 16)

                if tab == "checkpoints" {
                    Group2 {
                        if model.checkpoints.isEmpty {
                            Row(label: "回溯节点", value: "推演满五年或开局后自动留存可续推节点")
                        }
                        ForEach(Array(model.checkpoints.reversed().enumerated()), id: \.element.id) { i, cp in
                            Button { onRollback(cp) } label: {
                                HStack(spacing: 10) {
                                    SealFace(text: "溯", size: 24, color: Theme.jade)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(cp.dateText).font(Theme.section).foregroundStyle(Theme.ink)
                                        Text("存世 \(cp.aliveCount) 国 · 点击从此节点重新推演").font(Theme.caption).foregroundStyle(Theme.ink2)
                                    }
                                    Spacer()
                                    Text("回到此处").font(Theme.label).foregroundStyle(Theme.jade)
                                }
                                .padding(.horizontal, 14).padding(.vertical, 10).contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            if i < model.checkpoints.count - 1 { Divider2() }
                        }
                    }
                    .padding(.horizontal, 16)
                } else {
                    let list = Array(timeline.frames.indices.filter { tab == "nodes" || timeline.frames[$0].major }.reversed())
                    Group2 {
                        ForEach(Array(list.enumerated()), id: \.element) { pos, i in
                            let f = timeline.frames[i]
                            let active = i == model.replayIndex
                            Button { onPickFrame(i) } label: {
                                HStack(alignment: .top, spacing: 10) {
                                    KindSeal(kind: .of(f.kind), size: 20).padding(.top, 2)
                                    VStack(alignment: .leading, spacing: 2) {
                                        HStack(spacing: 6) {
                                            Text(f.dateText).font(Theme.label).foregroundStyle(active ? Theme.seal : Theme.ink2).monospacedDigit()
                                            Text("· \(f.aliveCount) 国").font(Theme.caption).foregroundStyle(Theme.ink2)
                                            if active { PaperTag(text: "当前", color: Theme.seal) }
                                        }
                                        Text(f.headline).font(Theme.body).foregroundStyle(Theme.ink).multilineTextAlignment(.leading).fixedSize(horizontal: false, vertical: true)
                                    }
                                    Spacer(minLength: 4)
                                    Image(systemName: "chevron.right").font(.system(size: 11)).foregroundStyle(Theme.ink2)
                                }
                                .padding(.horizontal, 14).padding(.vertical, 10)
                                .background(active ? Theme.seal.opacity(0.06) : Color.clear)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            if pos < list.count - 1 { Divider2() }
                        }
                    }
                    .padding(.horizontal, 16)
                }
            }
            .padding(.bottom, 24)
        }
    }
}
