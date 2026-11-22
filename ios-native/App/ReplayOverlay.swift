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
                let baseMs: Double = self.replaySpeed == 4 ? 260 : self.replaySpeed == 2 ? 440 : 760
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

        // 合成史诗级回放战局视觉：丝滑逐帧变色 + 易主墨晕扫色 + 战役弧形进军箭头 + 交锋火花 + 真实行军先锋与国都御林军
        controller.replayAnimate = animated
        let stepTween = replaySpeed == 4 ? 0.24 : replaySpeed == 2 ? 0.41 : 0.72
        var fx = MapEffects()
        var washInputs = [WashInput]()
        var enemiesMap = [Int: Set<Int>]()
        var ripples = Set<Int>()
        var sprites = [MapRenderer.ArmySprite]()

        // 前 10 大强国在国都／疆域重心处常驻御林军与王旗（使用真实 UnitKinds 键值），无论暂停或播放均清晰可见
        let majorNations = cnt.sorted { $0.value != $1.value ? $0.value > $1.value : $0.key < $1.key }.prefix(10).map(\.key)
        for (rank, n) in majorNations.enumerated() where world.meta.nations.indices.contains(n) {
            let capIdx = world.meta.nations[n].capital
            let pt: (Float, Float)
            if world.meta.cities.indices.contains(capIdx) {
                let c = world.meta.cities[capIdx]; pt = (c.x, c.y)
            } else if let c = cnt[n], c > 0 {
                pt = (sumX[n, default: 0] / Float(c), sumY[n, default: 0] / Float(c))
            } else { continue }
            let guardUnit = rank < 3 ? "Elite" : (rank % 2 == 0 ? "HeavyCavalry" : "Infantry")
            sprites.append(MapRenderer.ArmySprite(army: 1000 + n, x: pt.0, y: pt.1, unit: guardUnit, nation: n, selected: false, key: "rg-\(n)", tier: rank < 3 ? 3 : 2, banner: 2))
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
                    washInputs.append(WashInput(province: p, attacker: newN, kind: .march, progress: 0.9, day: frame.day, armies: [srcPt, dstPt], troops: 12000, key: "rm-\(newN)-\(p)"))
                }
                conquests.append(Conquest(attacker: newN, defender: oldN, from: bestFrom, to: p, dist: bestD.squareRoot()))
            }
            for (n, g) in gainedByNation where g >= 3 { ripples.insert(n) }
            if ["politics", "restoration", "uprising", "capital"].contains(frame.kind), frame.topNation >= 0 {
                ripples.insert(frame.topNation)
            }

            // 为每个活跃战线生成至多 14 支弧形战役箭头、攻占闪光、交锋火花与沿战线真实行进的先锋军团
            var usedTargets = Set<Int>()
            var perAttacker = [Int: Int]()
            let unitPool = ["Cavalry", "HeavyCavalry", "Infantry", "Spear", "HorseArcher", "Elite"]
            for (ci, cq) in conquests.prefix(36).enumerated() {
                guard !usedTargets.contains(cq.to), perAttacker[cq.attacker, default: 0] < 3, fx.arrows.count < 14 else { continue }
                usedTargets.insert(cq.to)
                let fp = world.meta.provinces[cq.from], tp = world.meta.provinces[cq.to]
                let rgb = world.meta.nations.indices.contains(cq.attacker) ? (RGB(css: world.meta.nations[cq.attacker].color) ?? RGB(0.7, 0.25, 0.18)) : RGB(0.7, 0.25, 0.18)
                fx.flashes.append(MapEffects.Flash(id: "rf-\(index)-\(cq.to)", x: Double(tp.x), y: Double(tp.y), r: Double(rgb.r), g: Double(rgb.g), b: Double(rgb.b)))

                if cq.from != cq.to && cq.dist > 2 {
                    perAttacker[cq.attacker, default: 0] += 1
                    let sx = Double(fp.x), sy = Double(fp.y), ex = Double(tp.x), ey = Double(tp.y)
                    let dx = ex - sx, dy = ey - sy
                    let len = max(1.0, hypot(dx, dy))
                    let curveSign: Double = (ci % 2 == 0) ? 1 : -1
                    let bend = min(32.0, len * 0.22) * curveSign
                    let cx = (sx + ex) * 0.5 - (dy / len) * bend
                    let cy = (sy + ey) * 0.5 + (dx / len) * bend
                    let shallow = (min(1, Double(rgb.r) * 0.65 + 0.35), min(1, Double(rgb.g) * 0.65 + 0.35), min(1, Double(rgb.b) * 0.65 + 0.35))
                    let deep = (Double(rgb.r) * 0.85, Double(rgb.g) * 0.85, Double(rgb.b) * 0.85)
                    fx.arrows.append(MapEffects.Arrow(key: "ra-\(index)-\(cq.attacker)-\(cq.to)", sx: sx, sy: sy, cx: cx, cy: cy, ex: ex, ey: ey, shallow: shallow, deep: deep))

                    // 行军先锋军团：设置显式出发点 (fp.x, fp.y) -> 终点 (tp.x, tp.y)，由 GPU Hermite 插值丝滑跨界行军！
                    let unitKind = unitPool[(cq.attacker + ci) % unitPool.count]
                    sprites.append(MapRenderer.ArmySprite(
                        army: 10000 + ci,
                        x: tp.x, y: tp.y,
                        unit: unitKind,
                        nation: cq.attacker,
                        selected: false,
                        key: "rv-\(index)-\(cq.attacker)-\(cq.to)",
                        tier: 3,
                        banner: 1,
                        fighting: cq.defender >= 0,
                        startX: fp.x,
                        startY: fp.y
                    ))

                    if cq.defender >= 0 && fx.battles.count < 6 {
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
    @State private var nodesDragY: CGFloat = 0
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
                        HStack(spacing: 10) {
                            Seal(text: "史", size: 22)
                            Text(localToast).font(Theme.body).foregroundStyle(Theme.ink)
                                .multilineTextAlignment(.leading).fixedSize(horizontal: false, vertical: true)
                        }
                        .padding(.leading, 10).padding(.trailing, 16).padding(.vertical, 10)
                        .glass(RoundedRectangle(cornerRadius: Theme.Control.cornerCard, style: .continuous))
                        .padding(.horizontal, 24)
                        .padding(.bottom, collapsed ? 76 : (landscape ? 104 : 178))
                        .onTapGesture { self.localToast = nil }
                        .transition(.asymmetric(
                            insertion: .move(edge: .bottom).combined(with: .opacity).combined(with: .scale(scale: 0.94, anchor: .bottom)),
                            removal: .opacity.combined(with: .offset(y: -10))
                        ))
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

    /// 右侧单手缩放胶囊（全套手绘水墨图标，与双指捏合缩放互补，随时放大看战线或一键展开全图）
    private var zoomRail: some View {
        VStack(spacing: 2) {
            zoomBtn(glyph: .plus, label: "放大") { model.controller.zoom(1.55) }
            Rectangle().fill(Theme.ink.opacity(0.12)).frame(width: 22, height: 0.8)
            zoomBtn(glyph: .minus, label: "缩小") { model.controller.zoom(0.65) }
            Rectangle().fill(Theme.ink.opacity(0.12)).frame(width: 22, height: 0.8)
            zoomBtn(glyph: .locate, label: "全图") { model.controller.unrollRequest = UUID() }
        }
        .padding(.vertical, 5).padding(.horizontal, 3)
        .glass(Capsule())
    }

    private func zoomBtn(glyph: InkGlyph, label: String, action: @escaping () -> Void) -> some View {
        Button {
            GameFeel.shared.tap()
            action()
        } label: {
            InkIcon(glyph: glyph, size: 15, weight: 1.8, accent: Theme.seal.opacity(0.22))
                .foregroundStyle(Theme.ink)
                .frame(width: 36, height: 34)
                .contentShape(Rectangle())
        }
        .buttonStyle(InkPressStyle())
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
                    HStack(spacing: 5) {
                        InkIcon(glyph: .retreat, size: 15, weight: 1.8, accent: Theme.seal.opacity(0.26))
                        Text("返回当下").font(Theme.body).lineLimit(1)
                    }
                    .foregroundStyle(Theme.seal)
                    .padding(.horizontal, 14)
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
                    nodesDragY = 0
                    withAnimation(Motion.panel) { showNodes = true }
                } label: {
                    HStack(spacing: 5) {
                        InkIcon(glyph: .chronicle, size: 15, weight: 1.75, accent: Theme.seal.opacity(0.24))
                            .foregroundStyle(Theme.seal)
                        Text("节点(\(timeline.frames.count))").font(Theme.body).foregroundStyle(Theme.ink).lineLimit(1)
                            .monospacedDigit()
                    }
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
            Color.black.opacity(max(0.06, 0.34 * (1 - Double(min(1, max(0, nodesDragY) / 240)))))
                .ignoresSafeArea()
                .onTapGesture {
                    GameFeel.shared.tap()
                    withAnimation(Motion.panel) { showNodes = false; nodesDragY = 0 }
                }

            VStack(spacing: 0) {
                // 顶部可 1:1 下拉跟手收起手柄栏（与全作面板完全一致）
                ZStack(alignment: .trailing) {
                    SheetGrabber()
                        .padding(.vertical, 4)
                    Button {
                        GameFeel.shared.tap()
                        withAnimation(Motion.panel) { showNodes = false; nodesDragY = 0 }
                    } label: {
                        InkIcon(glyph: .close, size: 14, weight: 1.8)
                            .foregroundStyle(Theme.ink2)
                            .frame(width: 32, height: 32)
                            .background(Theme.wash, in: Circle())
                            .overlay(Circle().stroke(Theme.ink.opacity(0.12), lineWidth: 0.8))
                            .contentShape(Circle())
                    }
                    .buttonStyle(PressStyle())
                    .padding(.trailing, 18)
                    .padding(.top, 8)
                }
                .contentShape(Rectangle())
                .gesture(
                    DragGesture(minimumDistance: 6)
                        .onChanged { g in
                            let dy = g.translation.height
                            nodesDragY = dy >= 0 ? dy : -sqrt(abs(dy)) * 3.0
                        }
                        .onEnded { g in
                            if nodesDragY > 75 || g.predictedEndTranslation.height > 150 {
                                GameFeel.shared.tap()
                                withAnimation(Motion.panel) { showNodes = false; nodesDragY = 0 }
                            } else {
                                withAnimation(Motion.panel) { nodesDragY = 0 }
                            }
                        }
                )

                ReplayNodesSheet(model: model, timeline: timeline, onPickFrame: { i in
                    withAnimation(Motion.panel) { showNodes = false; nodesDragY = 0 }
                    model.seekReplay(to: i, focusEvent: true, animated: true)
                }, onRollback: { cp in
                    withAnimation(Motion.panel) {
                        showNodes = false
                        nodesDragY = 0
                        confirmRollback = cp
                    }
                })
            }
            .frame(maxWidth: landscape ? 560 : .infinity)
            .frame(maxHeight: landscape ? 310 : 560)
            .background(MemorialPaper(rules: true, fullBleed: false).clipShape(drawerShape).ignoresSafeArea(edges: .bottom))
            .overlay(drawerShape.stroke(Theme.ink.opacity(0.18), lineWidth: 0.9).allowsHitTesting(false))
            .shadow(color: .black.opacity(0.22), radius: 18, y: -4)
            .offset(y: max(0, nodesDragY))
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

            VStack(alignment: .leading, spacing: 14) {
                SheetHeader(
                    title: "回到 \(cp.dateText)",
                    subtitle: "存世 \(cp.aliveCount) 国 · 重新演绎此后天下大势",
                    seal: "溯",
                    showGrabber: false
                )
                Text("将把当前世界状态恢复至该历史节点，之后的战局与王朝走向均可重新演绎。")
                    .font(Theme.body).foregroundStyle(Theme.ink2)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.horizontal, Theme.Layout.sectionInset)
                HStack(spacing: 10) {
                    Button {
                        GameFeel.shared.tap()
                        withAnimation(Motion.panel) { confirmRollback = nil }
                    } label: {
                        SecondaryLabel(title: "取消", symbol: "xmark")
                    }
                    .buttonStyle(PressStyle())

                    Button {
                        GameFeel.shared.tap()
                        confirmRollback = nil
                        Task { await model.rollbackToCheckpoint(cp) }
                    } label: {
                        PrimaryLabel(title: "确定回溯", symbol: "clock.arrow.circlepath")
                    }
                    .buttonStyle(PressStyle())
                }
                .padding(.horizontal, Theme.Layout.sectionInset)
                .padding(.bottom, 18)
            }
            .frame(maxWidth: 380)
            .background(MemorialPaper(rules: false, fullBleed: false).clipShape(RoundedRectangle(cornerRadius: Theme.Control.cornerCard, style: .continuous)))
            .paperCard(tint: Theme.jade)
            .shadow(color: .black.opacity(0.24), radius: 20, y: 8)
            .padding(.horizontal, 28)
        }
    }

    /// 统一回放控制按钮（步退 / 步进 / 倒放 / 倍速）：与主界面 CircleIcon / PlaySealButton 同心宣纸朱线质感
    private func transportCircle(size: CGFloat, active: Bool = false, tint: Color = Theme.seal, action: @escaping () -> Void, @ViewBuilder content: () -> some View) -> some View {
        Button {
            GameFeel.shared.tap()
            action()
        } label: {
            content()
                .foregroundStyle(active ? Theme.paper2 : Theme.ink)
                .frame(width: size, height: size)
                .background(active ? tint : Theme.paper2, in: Circle())
                .overlay(Circle().stroke(active ? Color.clear : Theme.ink.opacity(0.15), lineWidth: 0.85))
                .overlay(Circle().stroke(active ? Theme.paper2.opacity(0.28) : Theme.seal.opacity(0.12), lineWidth: 0.55).padding(2.2))
                .contentShape(Circle())
        }
        .buttonStyle(PressStyle())
    }

    /// 横屏紧凑回放控制坞（单栏居中、高度精简，让出 >72% 舆图空间供双指缩放观看战局）
    @ViewBuilder
    private func landscapeDeck(timeline: ReplayTimelineData, idx: Int, frame: ReplayTimelineData.Frame, nearCP: WorldCheckpoint?, multiFrame: Bool) -> some View {
        VStack(spacing: 6) {
            if multiFrame {
                ReplayTimelineTrack(
                    frames: timeline.frames,
                    index: idx,
                    tint: model.replayReversing ? Theme.jade : Theme.seal,
                    onPause: { model.pauseReplay() },
                    onSeek: { target in model.seekReplay(to: target, animated: false) }
                )
            }
            HStack(spacing: 10) {
                transportCircle(size: 36, action: { model.stepReplay(-1) }) {
                    InkIcon(glyph: .stepBack, size: 15, weight: 1.75)
                }
                .opacity(multiFrame && idx > 0 ? 1 : 0.42)

                let activeRev = model.replayPlaying && model.replayReversing
                Button {
                    GameFeel.shared.tap()
                    model.toggleReplayPlay(reverse: true)
                } label: {
                    HStack(spacing: 4) {
                        InkIcon(glyph: activeRev ? .pause : .rewind, size: 13, weight: 1.8)
                        Text("倒放").font(Theme.label)
                    }
                    .foregroundStyle(activeRev ? Theme.paper2 : Theme.ink)
                    .padding(.horizontal, 12).frame(height: 36)
                    .background(activeRev ? Theme.jade : Theme.paper2, in: Capsule())
                    .overlay(Capsule().stroke(activeRev ? Color.clear : Theme.ink.opacity(0.15), lineWidth: 0.85))
                    .contentShape(Capsule())
                }
                .buttonStyle(PressStyle()).opacity(multiFrame ? 1 : 0.55)

                PlaySealButton(playing: model.replayPlaying && !model.replayReversing, size: 38) {
                    GameFeel.shared.tap()
                    model.toggleReplayPlay(reverse: false)
                }
                .opacity(multiFrame ? 1 : 0.55)

                transportCircle(size: 36, action: { model.stepReplay(1) }) {
                    InkIcon(glyph: .stepForward, size: 15, weight: 1.75)
                }
                .opacity(multiFrame && idx < timeline.frames.count - 1 ? 1 : 0.42)

                transportCircle(size: 36, action: { model.cycleReplaySpeed() }) {
                    Text("\(model.replaySpeed)×")
                        .font(Theme.body)
                        .foregroundStyle(model.replaySpeed > 1 ? Theme.seal : Theme.ink)
                        .monospacedDigit()
                        .contentTransition(.numericText())
                }

                if let nearCP {
                    Button {
                        GameFeel.shared.tap()
                        confirmRollback = nearCP
                    } label: {
                        HStack(spacing: 4) {
                            InkIcon(glyph: .replay, size: 13, weight: 1.75)
                            Text("回溯此年").font(Theme.label)
                        }
                        .foregroundStyle(Theme.jade)
                        .padding(.horizontal, 11).frame(height: 36)
                        .background(Theme.jade.opacity(0.11), in: Capsule())
                        .overlay(Capsule().stroke(Theme.jade.opacity(0.32), lineWidth: 0.8))
                        .contentShape(Capsule())
                    }
                    .buttonStyle(PressStyle())
                }

                Button {
                    GameFeel.shared.tap()
                    withAnimation(Motion.panel) { collapsed = true }
                } label: {
                    Image(systemName: "chevron.down").font(.system(size: 12, weight: .semibold)).foregroundStyle(Theme.ink2)
                        .frame(width: 32, height: 32).background(Theme.wash, in: Circle())
                        .contentShape(Circle())
                }
                .buttonStyle(PressStyle())
            }
        }
        .padding(.horizontal, 14).padding(.vertical, 8)
        .frame(maxWidth: 560)
        .glass(RoundedRectangle(cornerRadius: 22, style: .continuous))
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
                .padding(.horizontal, 11).frame(height: 38)
                .background(Theme.wash, in: Capsule())
                .contentShape(Capsule())
            }
            .buttonStyle(PressStyle())

            let activeRev = model.replayPlaying && model.replayReversing
            transportCircle(size: 38, active: activeRev, tint: Theme.jade, action: {
                model.toggleReplayPlay(reverse: true)
            }) {
                InkIcon(glyph: activeRev ? .pause : .rewind, size: 16, weight: 1.8)
            }

            PlaySealButton(playing: model.replayPlaying && !model.replayReversing, size: 42) {
                GameFeel.shared.tap()
                model.toggleReplayPlay(reverse: false)
            }

            Text("\(idx + 1)/\(timeline.frames.count)").font(Theme.label).foregroundStyle(Theme.ink2).monospacedDigit()

            transportCircle(size: 36, action: { model.cycleReplaySpeed() }) {
                Text("\(model.replaySpeed)×")
                    .font(Theme.label)
                    .foregroundStyle(model.replaySpeed > 1 ? Theme.seal : Theme.ink)
                    .monospacedDigit()
            }
        }
        .padding(.horizontal, 12).padding(.vertical, 7)
        .glass(Capsule())
        .padding(.bottom, 10)
    }

    @ViewBuilder
    private func fullDeck(timeline: ReplayTimelineData, idx: Int, frame: ReplayTimelineData.Frame, nearCP: WorldCheckpoint?, multiFrame: Bool) -> some View {
        VStack(spacing: 10) {
            // 顶部收起手柄与帧序指示（顶栏已有「返回当下」与「节点」，此处不再重复堆叠按钮）
            HStack {
                Text("史册进度").font(Theme.caption).foregroundStyle(Theme.ink2)
                Spacer()
                Button {
                    GameFeel.shared.tap()
                    withAnimation(Motion.panel) { collapsed = true }
                } label: {
                    Capsule().fill(Theme.ink.opacity(0.22)).frame(width: 38, height: 4)
                        .frame(width: 76, height: 22).contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .gesture(
                    DragGesture(minimumDistance: 8)
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
                Text("\(idx + 1) / \(timeline.frames.count) 帧")
                    .font(Theme.caption).foregroundStyle(Theme.ink2).monospacedDigit()
            }

            // 与全作 PaperTrack 严守同一视觉规范的宣纸墨轨 + 重大节点朱点 + 流体放大滑珠（彻底告别系统原生 Slider 与双层进度条）
            if multiFrame {
                ReplayTimelineTrack(
                    frames: timeline.frames,
                    index: idx,
                    tint: model.replayReversing ? Theme.jade : Theme.seal,
                    onPause: { model.pauseReplay() },
                    onSeek: { target in model.seekReplay(to: target, animated: false) }
                )
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

            // 播放 / 倒放 / 步进 / 倍速按钮排（与主界面底栏 PlaySealButton 同心朱印完全统一）
            HStack(spacing: 12) {
                transportCircle(size: 42, action: { model.stepReplay(-1) }) {
                    InkIcon(glyph: .stepBack, size: 17, weight: 1.75)
                }
                .opacity(multiFrame && idx > 0 ? 1 : 0.42)

                let activeRev = model.replayPlaying && model.replayReversing
                Button {
                    GameFeel.shared.tap()
                    model.toggleReplayPlay(reverse: true)
                } label: {
                    HStack(spacing: 5) {
                        InkIcon(glyph: activeRev ? .pause : .rewind, size: 14, weight: 1.8)
                        Text("倒放").font(Theme.body)
                    }
                    .foregroundStyle(activeRev ? Theme.paper2 : Theme.ink)
                    .padding(.horizontal, 14).frame(height: 42)
                    .background(activeRev ? Theme.jade : Theme.paper2, in: Capsule())
                    .overlay(Capsule().stroke(activeRev ? Color.clear : Theme.ink.opacity(0.15), lineWidth: 0.85))
                    .overlay(Capsule().stroke(activeRev ? Theme.paper2.opacity(0.28) : Theme.seal.opacity(0.12), lineWidth: 0.55).padding(2.2))
                    .contentShape(Capsule())
                }
                .buttonStyle(PressStyle()).opacity(multiFrame ? 1 : 0.55)

                PlaySealButton(playing: model.replayPlaying && !model.replayReversing, size: 46) {
                    GameFeel.shared.tap()
                    model.toggleReplayPlay(reverse: false)
                }
                .opacity(multiFrame ? 1 : 0.55)

                transportCircle(size: 42, action: { model.stepReplay(1) }) {
                    InkIcon(glyph: .stepForward, size: 17, weight: 1.75)
                }
                .opacity(multiFrame && idx < timeline.frames.count - 1 ? 1 : 0.42)

                transportCircle(size: 42, action: { model.cycleReplaySpeed() }) {
                    Text("\(model.replaySpeed)×")
                        .font(Theme.section)
                        .foregroundStyle(model.replaySpeed > 1 ? Theme.seal : Theme.ink)
                        .monospacedDigit()
                        .contentTransition(.numericText())
                }
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
                    .background(Theme.jade.opacity(0.1), in: RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous).stroke(Theme.jade.opacity(0.32), lineWidth: 0.8))
                    .contentShape(RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous))
                }
                .buttonStyle(PressStyle())
            }
        }
        .padding(.horizontal, Theme.Layout.pageInset).padding(.top, 8).padding(.bottom, 12)
        .glass(RoundedRectangle(cornerRadius: 24, style: .continuous))
        .padding(.horizontal, Theme.Layout.pageInset).padding(.bottom, 8)
    }
}

/// 与全作 `PaperTrack` 严守同一宣纸墨轨规范的时间轴滑轨：内嵌重大转折节点珠，拖动时滑珠柔润放大并带朱砂/青玉微晕。
private struct ReplayTimelineTrack: View {
    let frames: [ReplayTimelineData.Frame]
    let index: Int
    let tint: Color
    let onPause: () -> Void
    let onSeek: (Int) -> Void
    @State private var dragging = false

    private var fraction: Double {
        let count = max(1, frames.count - 1)
        return min(1, max(0, Double(index) / Double(count)))
    }

    var body: some View {
        GeometryReader { g in
            let width = max(g.size.width, 1)
            let thumb: CGFloat = 16
            let x = (width - thumb) * CGFloat(fraction)
            let span = CGFloat(max(1, frames.count - 1))
            ZStack(alignment: .leading) {
                Capsule().fill(Theme.ink.opacity(0.12)).frame(height: dragging ? 6 : 4.5)
                Capsule().fill(tint).frame(width: x + thumb / 2, height: dragging ? 6 : 4.5)

                // 重大历史节点珠：直接镶嵌于同一条宣纸墨轨上，告别割裂的双进度条
                ForEach(Array(frames.enumerated()), id: \.offset) { i, f in
                    if f.major {
                        let dotX = (width - thumb) * (CGFloat(i) / span) + thumb / 2 - 2.5
                        Circle()
                            .fill(i <= index ? Theme.paper2 : Theme.ink.opacity(0.38))
                            .frame(width: 5, height: 5)
                            .overlay(Circle().stroke(i <= index ? tint : Theme.paper2.opacity(0.7), lineWidth: 0.8))
                            .offset(x: dotX)
                    }
                }

                ZStack {
                    Circle()
                        .fill(tint.opacity(dragging ? 0.24 : 0))
                        .frame(width: dragging ? 28 : thumb, height: dragging ? 28 : thumb)
                    Circle()
                        .fill(tint)
                        .frame(width: thumb, height: thumb)
                        .overlay(Circle().stroke(Theme.paper2, lineWidth: 2))
                        .shadow(color: tint.opacity(dragging ? 0.36 : 0.18), radius: dragging ? 4 : 2, y: 1)
                        .scaleEffect(dragging ? 1.18 : 1.0)
                }
                .frame(width: thumb, height: thumb)
                .offset(x: x)
            }
            .frame(maxHeight: .infinity)
            .animation(Motion.tap, value: dragging)
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { drag in
                        if !dragging {
                            dragging = true
                            onPause()
                        }
                        scrub(drag.location.x, width: width)
                    }
                    .onEnded { drag in
                        scrub(drag.location.x, width: width)
                        dragging = false
                    }
            )
        }
        .frame(height: 28)
    }

    private func scrub(_ location: CGFloat, width: CGFloat) {
        let maxIdx = max(0, frames.count - 1)
        guard width > 0, maxIdx > 0 else { return }
        let t = min(1, max(0, Double(location / width)))
        let target = Int((t * Double(maxIdx)).rounded())
        if target != index {
            GameFeel.shared.tap()
            onSeek(target)
        }
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
