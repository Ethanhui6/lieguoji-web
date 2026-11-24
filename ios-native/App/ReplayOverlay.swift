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

    /// 预计算整条回放时间轴每帧的列国名号与配色表（一次 O(F) 扫描，后续任意切帧 O(1) 取用，彻底消除拖拽与播放时的重复循环）。
    private func buildReplayCaches(for timeline: ReplayTimelineData, baseWorld: WorldMap) {
        var majors = [Int]()
        var snapshots = [[WorldMeta.Nation]]()
        snapshots.reserveCapacity(timeline.frames.count)
        var current = baseWorld.meta.nations
        for (idx, stub) in timeline.nations.enumerated() {
            let line = NativeEngine.stateLineColor(stub.color)
            if idx < current.count {
                let old = current[idx]
                if old.name != stub.name || old.color != stub.color {
                    current[idx] = WorldMeta.Nation(id: old.id, name: stub.name, color: stub.color, line: line, capital: old.capital, culture: old.culture, polity: old.polity, religion: old.religion)
                }
            } else {
                current.append(WorldMeta.Nation(id: "r-\(idx)", name: stub.name, color: stub.color, line: line, capital: -1, culture: "", polity: "", religion: ""))
            }
        }
        for (fi, frame) in timeline.frames.enumerated() {
            if frame.major { majors.append(fi) }
            if let updates = frame.updates {
                for u in updates where u.i >= 0 {
                    while current.count <= u.i {
                        let k = current.count
                        current.append(WorldMeta.Nation(id: "r-\(k)", name: "", color: "#888888", line: "#666666", capital: -1, culture: "", polity: "", religion: ""))
                    }
                    let old = current[u.i]
                    if old.name != u.name || old.color != u.color {
                        current[u.i] = WorldMeta.Nation(id: old.id, name: u.name, color: u.color, line: NativeEngine.stateLineColor(u.color), capital: old.capital, culture: old.culture, polity: old.polity, religion: old.religion)
                    }
                }
            }
            snapshots.append(current)
        }
        cachedReplayMajorIndices = majors
        cachedReplayNations = snapshots
        cachedReplayLabelBoxes = [:]
        var startCounts = [Int: Int]()
        if let first = timeline.frames.first {
            let firstOwners = ReplayEngine.decodeRLE(first.rle, count: baseWorld.meta.provinces.count)
            for o in firstOwners where o >= 0 { startCounts[o, default: 0] += 1 }
            cachedReplayStartAlive = first.aliveCount
        } else {
            cachedReplayStartAlive = 0
        }
        cachedReplayStartCounts = startCounts
        cachedReplayCurrentCounts = startCounts
        cachedReplayTopPowers = startCounts
            .filter { $0.value > 0 }
            .sorted { $0.value != $1.value ? $0.value > $1.value : $0.key < $1.key }
            .prefix(8)
            .map { ($0.key, $0.value) }
        cachedReplayCurrentCentroids = [:]
        cachedReplayChangedProvinces = 0
        lastReplayScrubTime = 0
        replayFlipTimes = [:]
        replayFrameTick = 0
    }

    /// 进入「山河回放」模式：支持正放、倒放、进度条自由拖动与逐节点跳转。
    func enterReplay(atDay targetDay: Int? = nil) async {
        pause(saving: false)
        controller.interactive = true
        controller.sheetOpen = false
        controller.replayLocked = true
        controller.replayScrubbing = false
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
        if let base = savedLiveWorld ?? controller.world ?? map {
            buildReplayCaches(for: timeline, baseWorld: base)
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
        seekReplay(to: initialIdx, focusEvent: targetDay != nil, animated: false, scrubbing: false)
    }

    func exitReplay(restoreLive: Bool = true) {
        replayTimer?.cancel()
        replayTimer = nil
        replayPlaying = false
        replayReversing = false
        replayComparingOpening = false
        controller.replayLocked = false
        controller.replayAnimate = false
        controller.replayScrubbing = false
        lastReplayOwners = []
        cachedReplayNations = []
        cachedReplayMajorIndices = []
        cachedReplayLabelBoxes = [:]
        cachedReplayStartCounts = [:]
        cachedReplayCurrentCounts = [:]
        cachedReplayTopPowers = []
        cachedReplayCurrentCentroids = [:]
        cachedReplayChangedProvinces = 0
        replayFlipTimes = [:]
        replayFrameTick = 0
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

    func seekReplay(to index: Int, focusEvent: Bool = false, animated: Bool = true, scrubbing: Bool = false) {
        guard let timeline = replayTimelineData, !timeline.frames.isEmpty else { return }
        let clamped = max(0, min(timeline.frames.count - 1, index))
        replayIndex = clamped
        let now = CACurrentMediaTime()
        if scrubbing {
            // 拖拽滑轨期间以 35Hz 节流舆图填色并跳过重型国界/国名重算，滑珠本身保持 120Hz 零延迟跟手；松手时完整提交。
            guard now - lastReplayScrubTime >= 0.026 else { return }
            lastReplayScrubTime = now
            controller.replayScrubbing = true
            applyReplayFrame(at: clamped, in: timeline, animated: false, scrubbing: true)
            return
        }
        lastReplayScrubTime = now
        controller.replayScrubbing = false
        applyReplayFrame(at: clamped, in: timeline, animated: animated, scrubbing: false)
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
            notice = "当前仅录制 1 帧，返回推演满 30 天即可逐帧回放"
            GameFeel.shared.notify(.warning)
            return
        }
        stopReplayTimer()
        let next = max(0, min(timeline.frames.count - 1, replayIndex + delta))
        if next == replayIndex {
            notice = delta < 0 ? "已到达时间轴起点" : "已到达最新历史帧"
            return
        }
        seekReplay(to: next, focusEvent: true, animated: true, scrubbing: false)
        GameFeel.shared.tap()
    }

    /// 一键跳转至上一处或下一处重大历史节点（灭国、统一、建国、改朝换代、大叛乱）。
    func jumpReplayMajor(forward: Bool) {
        guard let timeline = replayTimelineData, timeline.frames.count > 1 else { return }
        stopReplayTimer()
        let majors = cachedReplayMajorIndices
        let target: Int?
        if forward {
            target = majors.first { $0 > replayIndex }
        } else {
            target = majors.last { $0 < replayIndex }
        }
        guard let idx = target else {
            notice = forward ? "之后已无更晚的重大史变节点" : "之前已无更早的重大史变节点"
            GameFeel.shared.notify(.warning)
            return
        }
        seekReplay(to: idx, focusEvent: true, animated: true, scrubbing: false)
        GameFeel.shared.tap()
    }

    func toggleReplayPlay(reverse: Bool) {
        guard let timeline = replayTimelineData, timeline.frames.count > 1 else {
            notice = "当前仅录制 1 帧，返回推演满 30 天即可播放"
            GameFeel.shared.notify(.warning)
            return
        }
        if replayPlaying && replayReversing == reverse {
            stopReplayTimer()
            return
        }
        if !reverse && replayIndex >= timeline.frames.count - 1 {
            seekReplay(to: 0, animated: false, scrubbing: false)
        } else if reverse && replayIndex <= 0 {
            seekReplay(to: timeline.frames.count - 1, animated: false, scrubbing: false)
        }
        replayReversing = reverse
        replayPlaying = true
        startReplayTimer()
    }

    var replaySpeedText: String {
        replaySpeed == 0 ? "0.5×" : "\(replaySpeed)×"
    }

    func cycleReplaySpeed() {
        switch replaySpeed {
        case 1: replaySpeed = 2
        case 2: replaySpeed = 4
        case 4: replaySpeed = 8
        case 8: replaySpeed = 16
        case 16: replaySpeed = 32
        case 32: replaySpeed = 0
        default: replaySpeed = 1
        }
        GameFeel.shared.tap()
    }

    /// 按住对比开局版图：按住时临时渲染第 0 帧疆域，松手即刻切回当前回放帧。
    func previewReplayOpening(_ holding: Bool) {
        guard let timeline = replayTimelineData, !timeline.frames.isEmpty else { return }
        if holding {
            guard !replayComparingOpening else { return }
            pauseReplay()
            replayComparingOpening = true
            applyReplayFrame(at: 0, in: timeline, animated: false, scrubbing: false)
            GameFeel.shared.tap()
        } else if replayComparingOpening {
            replayComparingOpening = false
            applyReplayFrame(at: replayIndex, in: timeline, animated: false, scrubbing: false)
            GameFeel.shared.tap()
        }
    }

    /// 飞往指定国家在当前回放帧的疆域重心。
    func focusReplayNation(_ nation: Int) {
        if let c = cachedReplayCurrentCentroids[nation] {
            controller.showPlace(x: Double(c.x), y: Double(c.y))
        } else if let m = controller.world ?? map, m.meta.nations.indices.contains(nation) {
            let cap = m.meta.nations[nation].capital
            if m.meta.cities.indices.contains(cap) {
                let city = m.meta.cities[cap]
                controller.showPlace(x: Double(city.x), y: Double(city.y))
            }
        }
    }

    private func stopReplayTimer() {
        replayTimer?.cancel()
        replayTimer = nil
        let wasPlaying = replayPlaying
        replayPlaying = false
        // 高速回放暂停时若当前处于国界/国名节流帧，立刻完整提交一次清晰国界与国名。
        if wasPlaying && controller.replayScrubbing, let timeline = replayTimelineData, timeline.frames.indices.contains(replayIndex) {
            controller.replayScrubbing = false
            applyReplayFrame(at: replayIndex, in: timeline, animated: false, scrubbing: false)
        }
    }

    private func startReplayTimer() {
        replayTimer?.cancel()
        replayTimer = Task { [weak self] in
            while let self, !Task.isCancelled, self.replayPlaying, let timeline = self.replayTimelineData {
                let baseMs: Double
                let strideCount: Int
                switch self.replaySpeed {
                case 32: baseMs = 46; strideCount = 2
                case 16: baseMs = 52; strideCount = 1
                case 8:  baseMs = 92; strideCount = 1
                case 4:  baseMs = 170; strideCount = 1
                case 2:  baseMs = 320; strideCount = 1
                case 0:  baseMs = 960; strideCount = 1
                default: baseMs = 600; strideCount = 1
                }
                try? await Task.sleep(nanoseconds: UInt64(baseMs * 1_000_000))
                guard !Task.isCancelled, self.replayPlaying else { break }
                let dir = self.replayReversing ? -1 : 1
                var next = self.replayIndex + dir * strideCount
                // 32× 跨步时若途经重大历史节点，优先停在节点帧上不错过大事。
                if strideCount > 1 {
                    let mid = self.replayIndex + dir
                    if timeline.frames.indices.contains(mid) && timeline.frames[mid].major {
                        next = mid
                    }
                }
                if next < 0 || next >= timeline.frames.count {
                    let edge = self.replayReversing ? 0 : (timeline.frames.count - 1)
                    if self.replayIndex != edge {
                        self.seekReplay(to: edge, focusEvent: false, animated: true, scrubbing: false)
                    }
                    if self.replayLoop && timeline.frames.count > 1 {
                        let wrap = self.replayReversing ? (timeline.frames.count - 1) : 0
                        self.seekReplay(to: wrap, focusEvent: false, animated: false, scrubbing: false)
                        continue
                    } else {
                        self.stopReplayTimer()
                        break
                    }
                }
                let shouldFocus = self.replayAutoFocus && self.replaySpeed <= 16 && timeline.frames[next].major && timeline.frames[next].province >= 0
                self.seekReplay(to: next, focusEvent: shouldFocus, animated: true, scrubbing: false)
            }
        }
    }

    /// 找出距离当前回放帧最近的可恢复推演节点（容差 1.5 游戏年）。
    func nearestCheckpoint(forDay day: Int) -> WorldCheckpoint? {
        checkpoints.min(by: { abs($0.day - day) < abs($1.day - day) }).flatMap { abs($0.day - day) <= 600 ? $0 : nil }
    }

    /// 将第 `index` 帧的 RLE 版图归属、历史国号与配色重建到 Metal 地图。
    private func applyReplayFrame(at index: Int, in timeline: ReplayTimelineData, animated: Bool, scrubbing: Bool) {
        guard var world = savedLiveWorld ?? controller.world ?? map else { return }
        let frame = timeline.frames[index]
        controller.seasonPhase = Float(max(0, frame.day % 360)) / 360.0
        let owners = ReplayEngine.decodeRLE(frame.rle, count: world.meta.provinces.count)
        let prevOwners = lastReplayOwners
        lastReplayOwners = owners

        // O(1) 读取预计算的当帧列国表
        if cachedReplayNations.indices.contains(index) {
            world.meta.nations = cachedReplayNations[index]
        }

        // 快速拖拽滑轨模式：仅更新各州归属色并立即返回，零国名框重算、零军团特效合成
        if scrubbing {
            for i in 0..<min(owners.count, world.meta.provinces.count) {
                world.meta.provinces[i].nation = owners[i]
            }
            controller.replayAnimate = false
            controller.world = world
            return
        }

        // 统计各国该帧州郡中心与包围盒，疆域未变的国家直接复用缓存 LabelBox
        var sumX = [Int: Float](), sumY = [Int: Float](), minX = [Int: Float](), maxX = [Int: Float](), minY = [Int: Float](), maxY = [Int: Float](), cnt = [Int: Int]()
        for i in 0..<min(owners.count, world.meta.provinces.count) {
            let o = owners[i]
            world.meta.provinces[i].nation = o
            guard o >= 0 else { continue }
            let p = world.meta.provinces[i]
            guard p.x.isFinite && p.y.isFinite else { continue }
            sumX[o, default: 0] += p.x; sumY[o, default: 0] += p.y; cnt[o, default: 0] += 1
            minX[o] = min(minX[o] ?? p.x, p.x); maxX[o] = max(maxX[o] ?? p.x, p.x)
            minY[o] = min(minY[o] ?? p.y, p.y); maxY[o] = max(maxY[o] ?? p.y, p.y)
        }
        var boxes = [WorldMeta.LabelBox]()
        boxes.reserveCapacity(cnt.count)
        var centroids = [Int: (x: Float, y: Float)]()
        for (n, c) in cnt where c > 0 && world.meta.nations.indices.contains(n) {
            let cx = sumX[n, default: 0] / Float(c)
            let cy = sumY[n, default: 0] / Float(c)
            centroids[n] = (cx, cy)
            if let hit = cachedReplayLabelBoxes[n], hit.count == c, abs(hit.cx - cx) < 0.05, abs(hit.cy - cy) < 0.05 {
                boxes.append(hit.box)
                continue
            }
            let bw = max(24, (maxX[n, default: cx] - minX[n, default: cx]) * 0.85 + 22)
            let bh = max(16, (maxY[n, default: cy] - minY[n, default: cy]) * 0.55 + 14)
            let fMax = min(46, max(12, sqrt(Float(c)) * 8.5))
            let fMin = min(fMax, max(7, fMax * 0.45))
            let box = WorldMeta.LabelBox(nation: n, x: cx, y: cy, width: bw, height: bh, fontMax: fMax, fontMin: fMin, angle: 0)
            cachedReplayLabelBoxes[n] = (c, cx, cy, box)
            boxes.append(box)
        }
        world.meta.labels = boxes
        cachedReplayCurrentCounts = cnt
        cachedReplayCurrentCentroids = centroids
        let sortedPowers = cnt
            .filter { $0.value > 0 }
            .sorted { $0.value != $1.value ? $0.value > $1.value : $0.key < $1.key }
            .prefix(8)
            .map { (nation: $0.key, count: $0.value) }
        cachedReplayTopPowers = sortedPowers
        if prevOwners.count == owners.count {
            var changed = 0
            for i in 0..<owners.count where owners[i] != prevOwners[i] { changed += 1 }
            cachedReplayChangedProvinces = changed
        } else if index > 0 {
            let prevStepOwners = ReplayEngine.decodeRLE(timeline.frames[index - 1].rle, count: world.meta.provinces.count)
            var changed = 0
            for i in 0..<min(owners.count, prevStepOwners.count) where owners[i] != prevStepOwners[i] { changed += 1 }
            cachedReplayChangedProvinces = changed
        } else {
            cachedReplayChangedProvinces = 0
        }

        replayFrameTick &+= 1
        let now = CACurrentMediaTime()
        let isFastPlay = animated && replayPlaying && replaySpeed >= 8
        let isUltraPlay = animated && replayPlaying && replaySpeed >= 16
        let fastThrottleOutlines = isFastPlay && !frame.major && (replayFrameTick % (isUltraPlay ? 4 : 3) != 0)
        controller.replayScrubbing = fastThrottleOutlines
        controller.replayAnimate = animated
        let stepTween: Double = {
            switch replaySpeed {
            case 32: return 0.06
            case 16: return 0.08
            case 8:  return 0.11
            case 4:  return 0.17
            case 2:  return 0.30
            case 0:  return 0.88
            default: return 0.56
            }
        }()
        var fx = MapEffects()
        var washInputs = [WashInput]()
        var enemiesMap = [Int: Set<Int>]()
        var ripples = Set<Int>()
        var sprites = [MapRenderer.ArmySprite]()

        // 前 8 大强国在国都／疆域重心处常驻王旗（超高速回放 16×/32× 时隐藏细碎军牌以保丝滑流畅）
        if !isUltraPlay {
            for (rank, item) in sortedPowers.enumerated() where world.meta.nations.indices.contains(item.nation) {
                let n = item.nation
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
        }

        if animated && prevOwners.count == owners.count {
            var prevByNation = [Int: [Int]]()
            if !isUltraPlay {
                for p in prevOwners.indices where prevOwners[p] >= 0 {
                    prevByNation[prevOwners[p], default: []].append(p)
                }
            }
            struct Conquest { let attacker: Int; let defender: Int; let from: Int; let to: Int; let dist: Float; let hotFlip: Bool }
            var conquests = [Conquest]()
            var gainedByNation = [Int: Int]()
            for p in owners.indices {
                let oldN = prevOwners[p], newN = owners[p]
                guard oldN != newN, newN >= 0, world.meta.provinces.indices.contains(p) else { continue }
                let tp = world.meta.provinces[p]
                guard tp.x.isFinite && tp.y.isFinite else { continue }
                // 拉锯战防闪烁判定：若同一州郡在 0.85 秒内反复易主，视为前线拉锯，跳过叠加扫色与特效，交由 GPU 顶点柔和渐变。
                let lastFlip = replayFlipTimes[p] ?? -10
                let hotFlip = (now - lastFlip) < 0.85
                replayFlipTimes[p] = now
                gainedByNation[newN, default: 0] += 1
                if oldN >= 0 { enemiesMap[newN, default: []].insert(oldN) }
                guard !isUltraPlay else { continue }
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
                // 仅在非高速且非反复拉锯的州郡上叠加水墨扫色，彻底杜绝同一地块的反复闪烁与重算掉帧。
                if !hotFlip && !isFastPlay {
                    washInputs.append(WashInput(province: p, attacker: newN, kind: .capture, progress: 1, day: frame.day, armies: [srcPt]))
                    if bestFrom != p && washInputs.count < 24 {
                        washInputs.append(WashInput(province: p, attacker: newN, kind: .march, progress: 0.85, day: frame.day, armies: [srcPt, dstPt], troops: 12000, key: "rm-\(newN)-\(p)"))
                    }
                }
                conquests.append(Conquest(attacker: newN, defender: oldN, from: bestFrom, to: p, dist: bestD.squareRoot(), hotFlip: hotFlip))
            }
            if !isFastPlay {
                for (n, g) in gainedByNation where g >= 3 { ripples.insert(n) }
                if ["politics", "restoration", "uprising", "capital"].contains(frame.kind), frame.topNation >= 0 {
                    ripples.insert(frame.topNation)
                }
            }

            // 重大历史事件落下一枚古朴朱墨事件印（替代杂乱插旗，16× 高速下仍清晰留印）
            if frame.major && replaySpeed <= 16 && frame.province >= 0 && world.meta.provinces.indices.contains(frame.province) {
                let mp = world.meta.provinces[frame.province]
                let mn = frame.topNation >= 0 && world.meta.nations.indices.contains(frame.topNation) ? world.meta.nations[frame.topNation] : nil
                let rgb = mn.flatMap { RGB(css: $0.color) } ?? RGB(0.72, 0.22, 0.16)
                let bKind: MapEffects.Burst.Kind = frame.kind == "uprising" ? .shock : frame.kind == "restoration" ? .founded : frame.kind == "politics" ? .regime : .coup
                fx.bursts.append(MapEffects.Burst(id: "rmaj-\(index)-\(frame.province)", x: Double(mp.x), y: Double(mp.y), kind: bKind, r: Double(rgb.r), g: Double(rgb.g), b: Double(rgb.b)))
            }

            var usedTargets = Set<Int>()
            var perAttacker = [Int: Int]()
            let unitPool = ["Cavalry", "HeavyCavalry", "Infantry", "Spear", "HorseArcher", "Elite"]
            let maxArrows = isFastPlay ? 6 : 12
            let maxRipples = isFastPlay ? 6 : 14
            for (ci, cq) in conquests.prefix(28).enumerated() {
                guard !cq.hotFlip, !usedTargets.contains(cq.to), perAttacker[cq.attacker, default: 0] < (isFastPlay ? 2 : 3) else { continue }
                usedTargets.insert(cq.to)
                let fp = world.meta.provinces[cq.from], tp = world.meta.provinces[cq.to]
                let rgb = world.meta.nations.indices.contains(cq.attacker) ? (RGB(css: world.meta.nations[cq.attacker].color) ?? RGB(0.7, 0.25, 0.18)) : RGB(0.7, 0.25, 0.18)
                // 图志水墨鎏金扩散晕环（atlasStyle: true），彻底替代回放中的插旗动画
                if fx.flashes.count < maxRipples {
                    fx.flashes.append(MapEffects.Flash(id: "rf-\(index)-\(cq.to)", x: Double(tp.x), y: Double(tp.y), r: Double(rgb.r), g: Double(rgb.g), b: Double(rgb.b), atlasStyle: true))
                }

                if cq.from != cq.to && cq.dist > 2 && fx.arrows.count < maxArrows {
                    perAttacker[cq.attacker, default: 0] += 1
                    let sx = Double(fp.x), sy = Double(fp.y), ex = Double(tp.x), ey = Double(tp.y)
                    let dx = ex - sx, dy = ey - sy
                    let len = max(1.0, hypot(dx, dy))
                    let curveSign: Double = (ci % 2 == 0) ? 1 : -1
                    let bend = min(30.0, len * 0.20) * curveSign
                    let cx = (sx + ex) * 0.5 - (dy / len) * bend
                    let cy = (sy + ey) * 0.5 + (dx / len) * bend
                    let shallow = (min(1, Double(rgb.r) * 0.65 + 0.35), min(1, Double(rgb.g) * 0.65 + 0.35), min(1, Double(rgb.b) * 0.65 + 0.35))
                    let deep = (Double(rgb.r) * 0.85, Double(rgb.g) * 0.85, Double(rgb.b) * 0.85)
                    fx.arrows.append(MapEffects.Arrow(key: "ra-\(index)-\(cq.attacker)-\(cq.to)", sx: sx, sy: sy, cx: cx, cy: cy, ex: ex, ey: ey, shallow: shallow, deep: deep))

                    if !isFastPlay {
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
                        if cq.defender >= 0 && fx.battles.count < 5 {
                            fx.battles.append(MapEffects.Battle(key: "rb-\(index)-\(cq.to)", x: Double(tp.x), y: Double(tp.y)))
                        }
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

// MARK: - 山河回放（重做版：与主界面 GameView 顶栏/底栏/原生奏折面板 1:1 统一，120Hz 零掉帧）

struct ReplayOverlay: View {
    @ObservedObject var model: GameModel
    @Environment(\.verticalSizeClass) private var verticalClass
    private var landscape: Bool { verticalClass == .compact }
    @State private var showNodes = false
    @State private var showDetails = false
    @State private var scrubIndex: Int? = nil
    @State private var confirmRollback: WorldCheckpoint? = nil
    @State private var localToast: String? = nil
    @State private var toastSerial = 0

    var body: some View {
        if let timeline = model.replayTimelineData, !timeline.frames.isEmpty {
            let shownIdx = max(0, min(timeline.frames.count - 1, scrubIndex ?? model.replayIndex))
            let frame = timeline.frames[shownIdx]
            let nearCP = model.nearestCheckpoint(forDay: frame.day)
            let multiFrame = timeline.frames.count > 1

            // 与 GameView 1:1 对齐的顶栏 + 底栏架构：中间整片舆图 100% 直通 Metal MapView
            Color.clear
                .allowsHitTesting(false)
                .overlay(alignment: .top) {
                    ViewBoundary { topBar(timeline: timeline, idx: shownIdx, frame: frame) }
                }
                .overlay(alignment: .topLeading) {
                    if showDetails {
                        ViewBoundary { frameDetailCard(timeline: timeline, idx: shownIdx, frame: frame) }
                            .padding(.top, Theme.Control.topHeight + 10)
                            .padding(.leading, Theme.Control.screenInset)
                            .transition(.opacity.combined(with: .move(edge: .top)).combined(with: .scale(scale: 0.96, anchor: .topLeading)))
                            .zIndex(18)
                    }
                }
                .overlay(alignment: .bottom) {
                    ViewBoundary { bottomBar(timeline: timeline, idx: shownIdx, frame: frame, nearCP: nearCP, multiFrame: multiFrame) }
                }
                .overlay {
                    if landscape && showNodes {
                        ViewBoundary { landscapeNodesPage(timeline: timeline) }
                            .zIndex(20)
                    }
                }
                .overlay {
                    if let cp = confirmRollback {
                        ViewBoundary { rollbackConfirmCard(cp) }
                            .transition(.opacity.combined(with: .scale(scale: 0.94)))
                            .zIndex(30)
                    }
                }
                .overlay(alignment: .bottom) {
                    if let localToast {
                        HStack(spacing: 10) {
                            ArtEmblem(image: BundleArt.heraldEdict, size: 22, fallback: .chronicle)
                            Text(localToast).font(Theme.body).foregroundStyle(Theme.ink)
                                .multilineTextAlignment(.leading).fixedSize(horizontal: false, vertical: true)
                        }
                        .padding(.leading, 10).padding(.trailing, 16).padding(.vertical, 10)
                        .glass(RoundedRectangle(cornerRadius: Theme.Control.cornerCard, style: .continuous))
                        .padding(.horizontal, 24)
                        .padding(.bottom, 112)
                        .onTapGesture { self.localToast = nil }
                        .transition(.asymmetric(
                            insertion: .move(edge: .bottom).combined(with: .opacity).combined(with: .scale(scale: 0.94, anchor: .bottom)),
                            removal: .opacity.combined(with: .offset(y: -10))
                        ))
                        .zIndex(40)
                    }
                }
                .sheet(isPresented: Binding(
                    get: { !landscape && showNodes },
                    set: { if !$0 { showNodes = false } }
                )) {
                    ReplayNodesSheet(model: model, timeline: timeline, onPickFrame: { i in
                        showNodes = false
                        model.seekReplay(to: i, focusEvent: true, animated: true, scrubbing: false)
                    }, onRollback: { cp in
                        showNodes = false
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) {
                            withAnimation(Motion.panel) { confirmRollback = cp }
                        }
                    })
                    .presentationDetents([.medium, .fraction(0.89)])
                    .presentationCornerRadius(Theme.Control.cornerSheet)
                    .background(MemorialPaper().ignoresSafeArea()).presentationBackground { MemorialPaper() }
                    .presentationDragIndicator(.hidden)
                    .font(Theme.section)
                }
                .statusBarHidden()
                .onAppear {
                    showDetails = model.controller.play.showReplayPlacard
                }
                .animation(Motion.panel, value: showNodes)
                .animation(Motion.panel, value: showDetails)
                .animation(Motion.panel, value: confirmRollback)
                .animation(Motion.tap, value: scrubIndex != nil)
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

    // MARK: - 顶栏（与 GameView.topBar 1:1 对齐：统一 38/36pt 紧凑防碰撞高度 + 整合右侧单胶囊工具条）

    private func topBar(timeline: ReplayTimelineData, idx: Int, frame: ReplayTimelineData.Frame) -> some View {
        let barH: CGFloat = landscape ? 36 : 38
        let btnW: CGFloat = landscape ? 34 : 36
        return HStack(spacing: 8) {
            Button {
                GameFeel.shared.tap()
                model.pauseReplay()
                showNodes.toggle()
            } label: {
                HStack(spacing: landscape ? 7 : 5) {
                    Circle()
                        .fill(model.replayPlaying ? (model.replayReversing ? Theme.jade : Theme.seal) : Theme.ink2.opacity(0.42))
                        .frame(width: 6, height: 6)
                        .animation(Motion.panel, value: model.replayPlaying)
                    Text(frame.dateText)
                        .font(landscape ? Theme.body : Theme.kai(13.5))
                        .foregroundStyle(Theme.ink)
                        .monospacedDigit()
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)
                        .layoutPriority(1)
                    Rectangle().fill(Theme.ink.opacity(0.15)).frame(width: 0.8, height: 13)
                    Text("\(frame.aliveCount)国")
                        .font(Theme.kai(12))
                        .foregroundStyle(Theme.ink2)
                        .monospacedDigit()
                        .lineLimit(1)
                        .fixedSize()
                    if landscape, !frame.topName.isEmpty {
                        let topColor: Color = {
                            let nations = model.controller.world?.meta.nations ?? model.map?.meta.nations ?? []
                            if nations.indices.contains(frame.topNation) { return Names.color(nations[frame.topNation].color) }
                            if timeline.nations.indices.contains(frame.topNation) { return Names.color(timeline.nations[frame.topNation].color) }
                            return Theme.seal
                        }()
                        Rectangle().fill(Theme.ink.opacity(0.15)).frame(width: 0.8, height: 13)
                        HStack(spacing: 4) {
                            Circle().fill(topColor).frame(width: 6.5, height: 6.5)
                            Text("\(MapLayers.stateLabel(frame.topName, full: false)) \(frame.topProvinces)州")
                                .font(Theme.caption)
                                .foregroundStyle(Theme.ink2)
                                .monospacedDigit()
                                .lineLimit(1)
                        }
                    }
                }
                .padding(.horizontal, landscape ? 12 : 10)
                .frame(height: barH)
                .glass(Capsule())
                .contentShape(Capsule())
            }
            .buttonStyle(PressStyle())

            Spacer(minLength: 6)

            // 右侧统一纸面单胶囊三键工具条：当帧大势 / 历史节点 / 返回当下（零挤压零越界）
            HStack(spacing: 0) {
                Button {
                    GameFeel.shared.tap()
                    showDetails.toggle()
                    model.controller.play.showReplayPlacard = showDetails
                } label: {
                    InkIcon(glyph: .ranking, size: 16, weight: showDetails ? 1.95 : 1.65, filled: showDetails)
                        .foregroundStyle(showDetails ? Theme.seal : Theme.ink)
                        .frame(width: btnW, height: barH).contentShape(Rectangle())
                }
                .buttonStyle(PressStyle()).accessibilityLabel("当帧天下大势")

                Rectangle().fill(Theme.ink.opacity(0.12)).frame(width: 0.7, height: 15)

                Button {
                    GameFeel.shared.tap()
                    model.pauseReplay()
                    showNodes.toggle()
                } label: {
                    InkIcon(glyph: .chronicle, size: 16, weight: showNodes ? 1.95 : 1.65, filled: showNodes)
                        .foregroundStyle(showNodes ? Theme.seal : Theme.ink)
                        .frame(width: btnW, height: barH).contentShape(Rectangle())
                }
                .buttonStyle(PressStyle()).accessibilityLabel("历史节点")

                Rectangle().fill(Theme.ink.opacity(0.12)).frame(width: 0.7, height: 15)

                Button {
                    GameFeel.shared.tap()
                    showNodes = false
                    showDetails = false
                    confirmRollback = nil
                    model.exitReplay()
                } label: {
                    InkIcon(glyph: .retreat, size: 16, weight: 1.85, accent: Theme.seal.opacity(0.28))
                        .foregroundStyle(Theme.seal)
                        .frame(width: btnW, height: barH).contentShape(Rectangle())
                }
                .buttonStyle(PressStyle()).accessibilityLabel("返回当下")
            }
            .padding(.horizontal, 4)
            .frame(height: barH)
            .glass(Capsule())
        }
        .padding(.horizontal, 12).padding(.top, landscape ? 3 : 4)
    }

    // MARK: - 底栏（与 GameView.bottomBar 1:1 统一：拖动时浮出纪年预览 + 34pt 大事横幅 + 双 54pt 胶囊坞）

    private func bottomBar(timeline: ReplayTimelineData, idx: Int, frame: ReplayTimelineData.Frame, nearCP: WorldCheckpoint?, multiFrame: Bool) -> some View {
        VStack(spacing: Theme.Control.gap) {
            // 拖动时间轴时的即时纪年预览浮签
            if scrubIndex != nil {
                HStack(spacing: 7) {
                    KindSeal(kind: .of(frame.kind), size: 18)
                    Text(frame.dateText).font(Theme.label).foregroundStyle(Theme.seal).monospacedDigit()
                    Text("· \(frame.headline)").font(Theme.caption).foregroundStyle(Theme.ink).lineLimit(1)
                }
                .padding(.horizontal, 12).frame(height: 30)
                .glass(Capsule())
                .transition(.opacity.combined(with: .scale(scale: 0.92, anchor: .bottom)))
            }

            // 快捷史变与回溯浮条（独立于大事横幅，确保竖屏大事文字始终完整清晰不挤压错乱）
            if scrubIndex == nil, (model.cachedReplayMajorIndices.count > 1 || nearCP != nil) {
                let hasPrevMajor = model.cachedReplayMajorIndices.contains { $0 < idx }
                let hasNextMajor = model.cachedReplayMajorIndices.contains { $0 > idx }
                HStack(spacing: Theme.Control.gap) {
                    if model.cachedReplayMajorIndices.count > 1 {
                        HStack(spacing: 4) {
                            Button { model.jumpReplayMajor(forward: false) } label: {
                                HStack(spacing: 3) {
                                    InkIcon(glyph: .stepBack, size: 11, weight: 1.8)
                                    Text("上一史变").font(Theme.caption)
                                }
                                .foregroundStyle(hasPrevMajor ? Theme.ink : Theme.ink2.opacity(0.36))
                                .padding(.horizontal, 9).frame(height: 28)
                                .contentShape(Capsule())
                            }
                            .buttonStyle(PressStyle()).disabled(!hasPrevMajor)

                            Rectangle().fill(Theme.ink.opacity(0.14)).frame(width: 0.8, height: 13)

                            Button { model.jumpReplayMajor(forward: true) } label: {
                                HStack(spacing: 3) {
                                    Text("下一史变").font(Theme.caption)
                                    InkIcon(glyph: .stepForward, size: 11, weight: 1.8)
                                }
                                .foregroundStyle(hasNextMajor ? Theme.ink : Theme.ink2.opacity(0.36))
                                .padding(.horizontal, 9).frame(height: 28)
                                .contentShape(Capsule())
                            }
                            .buttonStyle(PressStyle()).disabled(!hasNextMajor)
                        }
                        .glass(Capsule())
                    }

                    Spacer(minLength: 4)

                    if let nearCP {
                        Button {
                            GameFeel.shared.tap()
                            model.pauseReplay()
                            confirmRollback = nearCP
                        } label: {
                            HStack(spacing: 5) {
                                InkIcon(glyph: .replay, size: 12, weight: 1.8)
                                Text("回溯此年").font(Theme.caption)
                            }
                            .foregroundStyle(Theme.jade)
                            .padding(.horizontal, 11).frame(height: 28)
                            .glass(Capsule())
                            .overlay(Capsule().strokeBorder(Theme.jade.opacity(0.35), lineWidth: 0.8))
                        }
                        .buttonStyle(PressStyle())
                    }
                }
                .frame(maxWidth: landscape ? 560 : .infinity)
            }

            // 第一层：与主界面 EventTicker 1:1 等高（34pt）的纯净大事横幅胶囊（仅保留印章、完整标题、帧序与定位，绝不挤坏文字）
            HStack(spacing: 8) {
                Button {
                    GameFeel.shared.tap()
                    if frame.province >= 0, let m = model.map, m.meta.provinces.indices.contains(frame.province) {
                        let pr = m.meta.provinces[frame.province]
                        model.controller.showPlace(x: Double(pr.x), y: Double(pr.y))
                    } else {
                        model.pauseReplay()
                        showNodes = true
                    }
                } label: {
                    HStack(spacing: 8) {
                        KindSeal(kind: .of(frame.kind), size: 20)
                        Text(frame.headline)
                            .font(Theme.label)
                            .foregroundStyle(Theme.ink)
                            .lineLimit(1)
                            .truncationMode(.tail)
                            .layoutPriority(1)
                        Spacer(minLength: 4)
                        Text("\(idx + 1)/\(timeline.frames.count)")
                            .font(Theme.caption)
                            .foregroundStyle(Theme.ink2)
                            .monospacedDigit()
                            .fixedSize()
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(PressStyle())

                Button {
                    GameFeel.shared.tap()
                    if frame.province >= 0, let m = model.map, m.meta.provinces.indices.contains(frame.province) {
                        let pr = m.meta.provinces[frame.province]
                        model.controller.showPlace(x: Double(pr.x), y: Double(pr.y))
                    } else {
                        model.controller.unrollRequest = UUID()
                    }
                } label: {
                    InkIcon(glyph: .locate, size: 13, weight: 1.8)
                        .foregroundStyle(Theme.ink2)
                        .frame(width: 24, height: 24)
                        .background(Theme.ink.opacity(0.06), in: Circle())
                }
                .buttonStyle(PressStyle())
                .accessibilityLabel("定位大事发生地")
            }
            .padding(.leading, 8).padding(.trailing, 7).frame(height: 34)
            .frame(maxWidth: landscape ? 560 : .infinity)
            .glass(Capsule())

            // 第二层：与 GameView.bottomBar 完全同构的左右双 54pt 胶囊坞
            HStack(spacing: Theme.Control.gap) {
                // 左侧 54pt 进度与步进胶囊坞（对应主界面左侧五页签坞）
                HStack(spacing: 6) {
                    dockButton(active: false, enabled: multiFrame && idx > 0) {
                        model.stepReplay(-1)
                    } content: {
                        InkIcon(glyph: .stepBack, size: 15, weight: 1.8)
                    }
                    .accessibilityLabel("上一帧")

                    if multiFrame {
                        ReplayTimelineTrack(
                            frameCount: timeline.frames.count,
                            majorIndices: model.cachedReplayMajorIndices,
                            index: idx,
                            tint: model.replayReversing ? Theme.jade : Theme.seal,
                            onPause: { model.pauseReplay() },
                            onScrub: { target in
                                scrubIndex = target
                                model.seekReplay(to: target, animated: false, scrubbing: true)
                            },
                            onCommit: { target in
                                scrubIndex = nil
                                model.seekReplay(to: target, animated: false, scrubbing: false)
                            }
                        )
                    } else {
                        Button {
                            GameFeel.shared.tap()
                            model.exitReplay()
                            model.play()
                            model.notice = "已恢复推演，每 30 天及大事自动留存山河回放帧"
                        } label: {
                            HStack(spacing: 5) {
                                InkIcon(glyph: .play, size: 13, weight: 1.85)
                                Text("返回推演并自动录制历史帧").font(Theme.label).lineLimit(1)
                            }
                            .foregroundStyle(Theme.seal)
                            .frame(maxWidth: .infinity)
                            .frame(height: 36)
                            .background(Theme.seal.opacity(0.1), in: Capsule())
                        }
                        .buttonStyle(PressStyle())
                    }

                    dockButton(active: false, enabled: multiFrame && idx < timeline.frames.count - 1) {
                        model.stepReplay(1)
                    } content: {
                        InkIcon(glyph: .stepForward, size: 15, weight: 1.8)
                    }
                    .accessibilityLabel("下一帧")

                    let revActive = model.replayPlaying && model.replayReversing
                    dockButton(active: revActive, tint: Theme.jade, enabled: multiFrame) {
                        model.toggleReplayPlay(reverse: true)
                    } content: {
                        InkIcon(glyph: revActive ? .pause : .rewind, size: 14, weight: 1.8)
                    }
                    .accessibilityLabel("倒放")
                }
                .padding(.horizontal, 10)
                .frame(maxWidth: landscape ? 440 : .infinity)
                .frame(height: Theme.Control.dockHeight)
                .glass(Capsule())

                // 右侧 54pt 倍速与朱印播放坞（与 GameView.transport 100% 同构同尺寸）
                replayTransport(multiFrame: multiFrame)
                    .padding(.horizontal, 5)
                    .frame(height: Theme.Control.dockHeight)
                    .glass(Capsule())
            }
        }
        .padding(.horizontal, Theme.Control.screenInset).padding(.bottom, 6)
    }

    private func replayTransport(multiFrame: Bool) -> some View {
        let sealSize: CGFloat = Theme.Control.sealButtonSize
        return HStack(spacing: 4) {
            Button {
                model.cycleReplaySpeed()
            } label: {
                Text(model.replaySpeedText)
                    .font(Theme.body)
                    .foregroundStyle(model.replaySpeed != 1 ? Theme.seal : Theme.ink)
                    .monospacedDigit()
                    .lineLimit(1).minimumScaleFactor(0.8)
                    .frame(minWidth: 44, maxWidth: 48, minHeight: sealSize, maxHeight: sealSize)
                    .background(model.replaySpeed != 1 ? Theme.seal.opacity(0.1) : Color.clear, in: Capsule())
                    .contentShape(Capsule())
                    .contentTransition(.numericText())
                    .animation(Motion.tap, value: model.replaySpeed)
            }
            .buttonStyle(PressStyle())

            PlaySealButton(playing: model.replayPlaying && !model.replayReversing, size: sealSize) {
                GameFeel.shared.tap()
                model.toggleReplayPlay(reverse: false)
            }
            .opacity(multiFrame ? 1 : 0.55)
            .sensoryFeedback(.impact(weight: .light), trigger: model.replayPlaying)
        }
    }

    /// 当帧天下大势与列强兴衰对比悬浮小笺（点击任意列强飞往其当帧疆域重心，支持按住比对开局、大事追焦与循环回放）
    @ViewBuilder
    private func frameDetailCard(timeline: ReplayTimelineData, idx: Int, frame: ReplayTimelineData.Frame) -> some View {
        let nations = model.controller.world?.meta.nations ?? model.map?.meta.nations ?? []
        let totalProvinces = max(1, timeline.provinceCount)
        let powers: [(nation: Int, count: Int)] = {
            if !model.cachedReplayTopPowers.isEmpty {
                return Array(model.cachedReplayTopPowers.prefix(6))
            }
            if let slices = frame.topPowers, !slices.isEmpty {
                return slices.prefix(6).map { ($0.i, $0.p) }
            }
            return frame.topNation >= 0 ? [(frame.topNation, frame.topProvinces)] : []
        }()
        let maxCount = max(1, powers.first?.count ?? 1)
        let aliveDelta = frame.aliveCount - max(1, model.cachedReplayStartAlive)
        let aliveDeltaText = aliveDelta == 0 ? "与开局同" : (aliveDelta > 0 ? "较开局 +\(aliveDelta)国" : "较开局 \(aliveDelta)国")

        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                ArtEmblem(image: BundleArt.compassRose, size: 24, fallback: .views)
                VStack(alignment: .leading, spacing: 2) {
                    Text(model.replayComparingOpening ? "开局初年疆域对照" : "当帧天下大势")
                        .font(Theme.body).foregroundStyle(Theme.ink).lineLimit(1)
                    Text("存世 \(frame.aliveCount) 国（\(aliveDeltaText)）· 易主 \(model.cachedReplayChangedProvinces) 州")
                        .font(Theme.caption).foregroundStyle(Theme.ink2).monospacedDigit().lineLimit(1).minimumScaleFactor(0.84)
                }
                Spacer(minLength: 4)
                CardCloseButton {
                    showDetails = false
                    model.controller.play.showReplayPlacard = false
                }
            }

            // 统一同心圆角三等分工具槽（与全站 ChipPicker 同款外槽与 10pt 内圆角，严格齐平）
            let barOuter = RoundedRectangle(cornerRadius: 12, style: .continuous)
            let barInner = RoundedRectangle(cornerRadius: 9, style: .continuous)
            HStack(spacing: 4) {
                Text(model.replayComparingOpening ? "还原当帧" : "按住比初年")
                    .font(Theme.caption)
                    .foregroundStyle(model.replayComparingOpening ? Theme.paper2 : Theme.jade)
                    .lineLimit(1)
                    .frame(maxWidth: .infinity).frame(height: 28)
                    .background(model.replayComparingOpening ? Theme.jade : Theme.paper2.opacity(0.72), in: barInner)
                    .contentShape(barInner)
                    .gesture(
                        DragGesture(minimumDistance: 0)
                            .onChanged { _ in model.previewReplayOpening(true) }
                            .onEnded { _ in model.previewReplayOpening(false) }
                    )

                Button {
                    GameFeel.shared.tap()
                    model.replayAutoFocus.toggle()
                } label: {
                    HStack(spacing: 3) {
                        InkIcon(glyph: .locate, size: 11, weight: 1.8)
                        Text("追焦").font(Theme.caption).lineLimit(1)
                    }
                    .foregroundStyle(model.replayAutoFocus ? Theme.paper2 : Theme.ink)
                    .frame(maxWidth: .infinity).frame(height: 28)
                    .background(model.replayAutoFocus ? Theme.seal : Theme.paper2.opacity(0.72), in: barInner)
                    .contentShape(barInner)
                }
                .buttonStyle(.plain)

                Button {
                    GameFeel.shared.tap()
                    model.replayLoop.toggle()
                } label: {
                    HStack(spacing: 3) {
                        InkIcon(glyph: .refresh, size: 11, weight: 1.8)
                        Text("循环").font(Theme.caption).lineLimit(1)
                    }
                    .foregroundStyle(model.replayLoop ? Theme.paper2 : Theme.ink)
                    .frame(maxWidth: .infinity).frame(height: 28)
                    .background(model.replayLoop ? Theme.seal : Theme.paper2.opacity(0.72), in: barInner)
                    .contentShape(barInner)
                }
                .buttonStyle(.plain)
            }
            .padding(3)
            .background(Theme.wash.opacity(0.72), in: barOuter)
            .overlay(barOuter.stroke(Theme.ink.opacity(0.11), lineWidth: 0.8))

            // 列强版图全局占比演变色带（置于卡内与内容严格齐平，不干扰顶栏对称）
            if !powers.isEmpty {
                GeometryReader { g in
                    let w = max(1, g.size.width)
                    HStack(spacing: 1) {
                        ForEach(powers, id: \.nation) { item in
                            let share = CGFloat(min(totalProvinces, item.count)) / CGFloat(totalProvinces)
                            let c: Color = {
                                if nations.indices.contains(item.nation) { return Names.color(nations[item.nation].color) }
                                if timeline.nations.indices.contains(item.nation) { return Names.color(timeline.nations[item.nation].color) }
                                return Theme.seal
                            }()
                            Rectangle().fill(c).frame(width: max(3, w * share))
                        }
                        Spacer(minLength: 0)
                    }
                    .background(Theme.ink.opacity(0.09))
                    .clipShape(Capsule())
                }
                .frame(height: 5)
            }

            Divider2()

            VStack(spacing: 6) {
                ForEach(Array(powers.enumerated()), id: \.element.nation) { rank, item in
                    let n = item.nation
                    let count = item.count
                    let name: String = {
                        if nations.indices.contains(n), !nations[n].name.isEmpty { return nations[n].name }
                        if timeline.nations.indices.contains(n), !timeline.nations[n].name.isEmpty { return timeline.nations[n].name }
                        return "列国\(n + 1)"
                    }()
                    let color: Color = {
                        if nations.indices.contains(n) { return Names.color(nations[n].color) }
                        if timeline.nations.indices.contains(n) { return Names.color(timeline.nations[n].color) }
                        return Theme.seal
                    }()
                    let startCount = model.cachedReplayStartCounts[n] ?? 0
                    let delta = count - startCount
                    let share = Int((Double(count) / Double(totalProvinces) * 100).rounded())

                    Button {
                        GameFeel.shared.tap()
                        model.focusReplayNation(n)
                    } label: {
                        VStack(spacing: 3) {
                            HStack(spacing: 6) {
                                Text("\(rank + 1)")
                                    .font(Theme.caption).foregroundStyle(rank < 3 ? Theme.seal : Theme.ink2)
                                    .monospacedDigit()
                                    .frame(width: 14, alignment: .trailing)
                                Circle().fill(color).frame(width: 7.5, height: 7.5)
                                Text(MapLayers.stateLabel(name, full: false))
                                    .font(Theme.label).foregroundStyle(Theme.ink)
                                    .lineLimit(1)
                                    .truncationMode(.tail)
                                    .layoutPriority(1)
                                Spacer(minLength: 6)
                                if startCount == 0 && idx > 0 {
                                    Text("新+\(count)")
                                        .font(Theme.caption).foregroundStyle(Theme.jade).monospacedDigit().fixedSize()
                                } else if delta != 0 {
                                    Text(delta > 0 ? "+\(delta)" : "\(delta)")
                                        .font(Theme.caption).foregroundStyle(delta > 0 ? Theme.jade : Theme.seal).monospacedDigit().fixedSize()
                                }
                                Text("\(count)州 · \(share)%")
                                    .font(Theme.caption).foregroundStyle(Theme.ink2).monospacedDigit().fixedSize()
                            }
                            InkBar(fraction: Double(count) / Double(maxCount), color: color.opacity(0.84), height: 3.5)
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 12)
        .frame(width: min(324, UIScreen.main.bounds.width - Theme.Control.screenInset * 2))
        .glass(RoundedRectangle(cornerRadius: Theme.Control.cornerCard, style: .continuous))
    }

    private func dockButton(active: Bool, tint: Color = Theme.seal, enabled: Bool = true, action: @escaping () -> Void, @ViewBuilder content: () -> some View) -> some View {
        Button {
            GameFeel.shared.tap()
            action()
        } label: {
            content()
                .foregroundStyle(active ? Theme.paper2 : Theme.ink)
                .frame(width: 36, height: 36)
                .background(active ? tint : Theme.paper2.opacity(0.85), in: Circle())
                .overlay(Circle().strokeBorder(active ? Color.clear : Theme.ink.opacity(0.14), lineWidth: 0.8))
                .contentShape(Circle())
        }
        .buttonStyle(PressStyle())
        .opacity(enabled ? 1 : 0.42)
    }

    /// 横屏右侧悬浮奏折面板（内嵌顶部关闭栏，彻底告别悬空挂在边框外的丑陋圆钮）
    @ViewBuilder
    private func landscapeNodesPage(timeline: ReplayTimelineData) -> some View {
        GeometryReader { geo in
            let panelW = min(430, max(320, geo.size.width * 0.44))
            let shape = RoundedRectangle(cornerRadius: 22, style: .continuous)
            HStack(spacing: 0) {
                Spacer(minLength: 0)
                ReplayNodesSheet(model: model, timeline: timeline, onPickFrame: { i in
                    showNodes = false
                    model.seekReplay(to: i, focusEvent: true, animated: true, scrubbing: false)
                }, onRollback: { cp in
                    showNodes = false
                    withAnimation(Motion.panel) { confirmRollback = cp }
                })
                .environment(\.inSidePanel, true)
                .environment(\.hasBackBar, true)
                .safeAreaInset(edge: .top, spacing: 0) {
                    VStack(spacing: 0) {
                        HStack {
                            Text("历史节点").font(Theme.body).foregroundStyle(Theme.ink2)
                            Spacer()
                            CardCloseButton { withAnimation(Motion.panel) { showNodes = false } }
                        }
                        .padding(.horizontal, 14).frame(height: 40)
                        .background(Theme.paper.opacity(0.96))
                        Rectangle().fill(Theme.ink.opacity(0.10)).frame(height: 0.7)
                    }
                }
                .font(Theme.section)
                .frame(width: panelW)
                .frame(maxHeight: .infinity)
                .background(MemorialPaper(rules: true, fullBleed: false))
                .clipShape(shape)
                .overlay(shape.stroke(Theme.ink.opacity(0.18), lineWidth: 0.85).allowsHitTesting(false))
                .shadow(color: Color(red: 0.12, green: 0.09, blue: 0.05).opacity(0.22), radius: 16, x: -3, y: 3)
                .padding(.trailing, 8).padding(.vertical, 8)
            }
        }
        .transition(.move(edge: .trailing).combined(with: .opacity))
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
}

/// 单通 `Canvas` 高性能宣纸墨轨时间轴：零 `ForEach` 视图节点开销，120Hz 丝滑拖拽。
private struct ReplayTimelineTrack: View {
    let frameCount: Int
    let majorIndices: [Int]
    let index: Int
    let tint: Color
    let onPause: () -> Void
    let onScrub: (Int) -> Void
    let onCommit: (Int) -> Void
    @State private var dragging = false
    @State private var lastTarget = -1

    private var fraction: Double {
        let span = max(1, frameCount - 1)
        return min(1, max(0, Double(index) / Double(span)))
    }

    var body: some View {
        GeometryReader { g in
            let width = max(g.size.width, 1)
            let thumb: CGFloat = 16
            let trackH: CGFloat = dragging ? 6 : 4.5
            let span = CGFloat(max(1, frameCount - 1))
            let x = (width - thumb) * CGFloat(fraction)

            Canvas { ctx, size in
                let midY = size.height / 2
                let bgRect = CGRect(x: 0, y: midY - trackH / 2, width: size.width, height: trackH)
                ctx.fill(Path(roundedRect: bgRect, cornerRadius: trackH / 2), with: .color(Theme.ink.opacity(0.13)))

                let fillW = min(size.width, max(trackH, x + thumb / 2))
                let fgRect = CGRect(x: 0, y: midY - trackH / 2, width: fillW, height: trackH)
                ctx.fill(Path(roundedRect: fgRect, cornerRadius: trackH / 2), with: .color(tint))

                // 重大转折节点珠（单次 Canvas 批量绘制，零子视图开销）
                let maxDots = 36
                let step = max(1, majorIndices.count / maxDots)
                for k in stride(from: 0, to: majorIndices.count, by: step) {
                    let mi = majorIndices[k]
                    let dotX = (size.width - thumb) * (CGFloat(mi) / span) + thumb / 2
                    let dotRect = CGRect(x: dotX - 2.3, y: midY - 2.3, width: 4.6, height: 4.6)
                    let dotPath = Path(ellipseIn: dotRect)
                    ctx.fill(dotPath, with: .color(mi <= index ? Theme.paper2 : Theme.ink.opacity(0.36)))
                }

                // 滑珠光晕与本体
                let cx = x + thumb / 2
                if dragging {
                    let halo = CGRect(x: cx - 13, y: midY - 13, width: 26, height: 26)
                    ctx.fill(Path(ellipseIn: halo), with: .color(tint.opacity(0.22)))
                }
                let r: CGFloat = dragging ? 9.2 : 8.0
                let thumbRect = CGRect(x: cx - r, y: midY - r, width: r * 2, height: r * 2)
                let thumbPath = Path(ellipseIn: thumbRect)
                ctx.fill(thumbPath, with: .color(tint))
                ctx.stroke(thumbPath, with: .color(Theme.paper2), lineWidth: 2.0)
            }
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onChanged { drag in
                        if !dragging {
                            dragging = true
                            lastTarget = index
                            onPause()
                        }
                        let target = targetIndex(at: drag.location.x, width: width)
                        if target != lastTarget {
                            lastTarget = target
                            onScrub(target)
                        }
                    }
                    .onEnded { drag in
                        let target = targetIndex(at: drag.location.x, width: width)
                        dragging = false
                        lastTarget = -1
                        GameFeel.shared.tap()
                        onCommit(target)
                    }
            )
        }
        .frame(height: 36)
    }

    private func targetIndex(at locationX: CGFloat, width: CGFloat) -> Int {
        let maxIdx = max(0, frameCount - 1)
        guard width > 0, maxIdx > 0 else { return 0 }
        let t = min(1, max(0, Double(locationX / width)))
        return Int((t * Double(maxIdx)).rounded())
    }
}

/// 历史回放节点目录与可回溯存档列表（原生奏折面板）
private struct ReplayNodesSheet: View {
    @ObservedObject var model: GameModel
    let timeline: ReplayTimelineData
    let onPickFrame: (Int) -> Void
    let onRollback: (WorldCheckpoint) -> Void
    @State private var tab = "nodes"

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 12) {
                SheetHeader(title: "历史节点", subtitle: "共 \(timeline.frames.count) 帧版图记录 · \(model.checkpoints.count) 个可回溯节点", seal: "溯")
                ChipPicker(items: [
                    ("nodes", "全部"),
                    ("major", "转折"),
                    ("war", "兵戈"),
                    ("politics", "兴替"),
                    ("checkpoints", "续推")
                ], selection: $tab)
                    .padding(.horizontal, Theme.Layout.pageInset)

                if tab == "checkpoints" {
                    Group2 {
                        if model.checkpoints.isEmpty {
                            Row(label: "回溯节点", value: "推演满两年或开局后自动留存可续推节点")
                        }
                        ForEach(Array(model.checkpoints.reversed().enumerated()), id: \.element.id) { i, cp in
                            Button { onRollback(cp) } label: {
                                HStack(spacing: 10) {
                                    ArtEmblem(image: BundleArt.sealReplay, size: 28, fallback: .replay)
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(cp.dateText).font(Theme.section).foregroundStyle(Theme.ink)
                                        Text("存世 \(cp.aliveCount) 国 · 点击从此节点重新推演").font(Theme.caption).foregroundStyle(Theme.ink2)
                                    }
                                    Spacer()
                                    Text("回到此处").font(Theme.label).foregroundStyle(Theme.jade)
                                }
                                .padding(.horizontal, 16).padding(.vertical, 11).contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            if i < model.checkpoints.count - 1 { Divider2() }
                        }
                    }
                    .padding(.horizontal, 16)
                } else {
                    let list = Array(timeline.frames.indices.filter { idx in
                        let f = timeline.frames[idx]
                        switch tab {
                        case "major": return f.major
                        case "war": return ["war", "peace", "capture"].contains(f.kind)
                        case "politics": return ["politics", "uprising", "restoration", "extinction", "capital", "house", "marriage"].contains(f.kind)
                        default: return true
                        }
                    }.reversed())
                    Group2 {
                        if list.isEmpty {
                            Row(label: "筛选结果", value: "该类别下暂无历史节点")
                        }
                        ForEach(Array(list.enumerated()), id: \.element) { pos, i in
                            let f = timeline.frames[i]
                            let active = i == model.replayIndex
                            Button { onPickFrame(i) } label: {
                                HStack(alignment: .top, spacing: 10) {
                                    KindSeal(kind: .of(f.kind), size: 20).padding(.top, 2)
                                    VStack(alignment: .leading, spacing: 3) {
                                        HStack(spacing: 6) {
                                            Text(f.dateText).font(Theme.label).foregroundStyle(active ? Theme.seal : Theme.ink2).monospacedDigit()
                                            Text("· \(f.aliveCount) 国").font(Theme.caption).foregroundStyle(Theme.ink2)
                                            if !f.topName.isEmpty {
                                                Text("· 首强 \(MapLayers.stateLabel(f.topName, full: false)) \(f.topProvinces)州")
                                                    .font(Theme.caption).foregroundStyle(Theme.ink2).lineLimit(1)
                                            }
                                            if active { PaperTag(text: "当前", color: Theme.seal) }
                                        }
                                        Text(f.headline).font(Theme.body).foregroundStyle(Theme.ink).multilineTextAlignment(.leading).fixedSize(horizontal: false, vertical: true)
                                    }
                                    Spacer(minLength: 4)
                                    InkIcon(glyph: .chevronRight, size: 13, weight: 1.65).foregroundStyle(Theme.ink2)
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
