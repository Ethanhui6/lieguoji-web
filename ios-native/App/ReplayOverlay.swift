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

    /// 推演每跨过约 5 游戏年（或开局首日）静默留存一份可继续推演的回溯节点，最多保留 12 份（始终保留最早节点）。
    func maybeRecordCheckpoint(_ next: GameState) {
        guard !replayActive, !checkpointBusy, let dir = checkpointDirectory else { return }
        let gap = next.day - lastCheckpointDay
        guard checkpoints.isEmpty || gap >= 1825 else { return }
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
            while current.count > 12 {
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
        replayActive = true
        // 清理前景特效与军队，专注展示疆域、国界与国号演变
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

        let initialIdx: Int
        if let targetDay {
            initialIdx = timeline.frames.indices.min(by: { abs(timeline.frames[$0].day - targetDay) < abs(timeline.frames[$1].day - targetDay) }) ?? (timeline.frames.count - 1)
        } else {
            initialIdx = max(0, timeline.frames.count - 1)
        }
        seekReplay(to: initialIdx, focusEvent: targetDay != nil)
    }

    func exitReplay(restoreLive: Bool = true) {
        replayTimer?.cancel()
        replayTimer = nil
        replayPlaying = false
        replayReversing = false
        controller.replayLocked = false
        guard replayActive else { return }
        replayActive = false
        if restoreLive {
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

    func seekReplay(to index: Int, focusEvent: Bool = false) {
        guard let timeline = replayTimelineData, !timeline.frames.isEmpty else { return }
        let clamped = max(0, min(timeline.frames.count - 1, index))
        replayIndex = clamped
        applyReplayFrame(at: clamped, in: timeline)
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
        seekReplay(to: next, focusEvent: true)
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
            seekReplay(to: 0)
        } else if reverse && replayIndex <= 0 {
            seekReplay(to: timeline.frames.count - 1)
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
                let baseMs: Double = self.replaySpeed == 4 ? 140 : self.replaySpeed == 2 ? 280 : 520
                try? await Task.sleep(nanoseconds: UInt64(baseMs * 1_000_000))
                guard !Task.isCancelled, self.replayPlaying else { break }
                let next = self.replayIndex + (self.replayReversing ? -1 : 1)
                if next < 0 || next >= timeline.frames.count {
                    self.replayPlaying = false
                    break
                }
                self.seekReplay(to: next, focusEvent: false)
            }
        }
    }

    /// 找出距离当前回放帧最近的可恢复推演节点（容差 1.5 游戏年，或直接列出全部节点）。
    func nearestCheckpoint(forDay day: Int) -> WorldCheckpoint? {
        checkpoints.min(by: { abs($0.day - day) < abs($1.day - day) }).flatMap { abs($0.day - day) <= 600 ? $0 : nil }
    }

    /// 将第 `index` 帧的 RLE 版图归属、历史国号与配色快速重建并渲染到 Metal 地图。
    private func applyReplayFrame(at index: Int, in timeline: ReplayTimelineData) {
        guard var world = savedLiveWorld ?? controller.world ?? map else { return }
        let frame = timeline.frames[index]
        let owners = ReplayEngine.decodeRLE(frame.rle, count: world.meta.provinces.count)

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
        controller.world = world
    }
}

// MARK: - 山河回放交互浮层（挂载在可自由拖拽缩放的舆图最顶层）

struct ReplayOverlay: View {
    @ObservedObject var model: GameModel
    @State private var showNodes = false
    @State private var collapsed = false
    @State private var deckDragY: CGFloat = 0
    @State private var confirmRollback: WorldCheckpoint?

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

            GeometryReader { geo in
                ZStack {
                    Color.clear.allowsHitTesting(false)
                }
                .overlay(alignment: .top) {
                    topHeader(timeline: timeline, idx: idx, frame: frame, powers: powers)
                }
                .overlay(alignment: .bottom) {
                    if collapsed {
                        compactDeck(timeline: timeline, idx: idx, frame: frame, multiFrame: multiFrame)
                            .transition(.move(edge: .bottom).combined(with: .opacity))
                    } else {
                        fullDeck(timeline: timeline, idx: idx, frame: frame, nearCP: nearCP, multiFrame: multiFrame)
                            .offset(y: max(0, deckDragY))
                            .gesture(
                                DragGesture(minimumDistance: 12)
                                    .onChanged { g in
                                        deckDragY = g.translation.height > 0 ? g.translation.height : g.translation.height * 0.2
                                    }
                                    .onEnded { g in
                                        if g.translation.height > 48 || g.predictedEndTranslation.height > 90 {
                                            GameFeel.shared.tap()
                                            withAnimation(Motion.panel) { collapsed = true; deckDragY = 0 }
                                        } else {
                                            withAnimation(Motion.panel) { deckDragY = 0 }
                                        }
                                    }
                            )
                            .transition(.move(edge: .bottom).combined(with: .opacity))
                    }
                }
                .overlay {
                    // 内置宣纸历史节点抽屉（不与 GameView 顶层 .sheet 冲突，点击「节点」必定秒开）
                    if showNodes {
                        nodesDrawer(timeline: timeline, maxDrawerHeight: max(360, geo.size.height * 0.78))
                            .transition(.opacity)
                            .zIndex(200)
                    }
                }
                .overlay {
                    // 内置回溯确认浮卡（不与父级 .confirmationDialog 冲突）
                    if let cp = confirmRollback {
                        rollbackConfirmCard(cp)
                            .transition(.opacity.combined(with: .scale(scale: 0.94)))
                            .zIndex(260)
                    }
                }
                .animation(Motion.panel, value: collapsed)
                .animation(Motion.panel, value: showNodes)
                .animation(Motion.panel, value: confirmRollback)
            }
        }
    }

    @ViewBuilder
    private func topHeader(timeline: ReplayTimelineData, idx: Int, frame: ReplayTimelineData.Frame, powers: [PowerDisplay]) -> some View {
        VStack(spacing: 8) {
            HStack(spacing: 8) {
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
                    .padding(.horizontal, 12).frame(minWidth: 88).frame(height: 42)
                    .glass(Capsule())
                    .contentShape(Capsule())
                }
                .buttonStyle(PressStyle())
                .fixedSize(horizontal: true, vertical: false)

                HStack(spacing: 6) {
                    SealFace(text: model.replayReversing ? "倒" : "史", size: 22, color: model.replayReversing ? Theme.jade : Theme.seal)
                    Text(frame.dateText).font(Theme.section).foregroundStyle(Theme.ink).monospacedDigit()
                        .lineLimit(1).minimumScaleFactor(0.68)
                        .contentTransition(.numericText())
                }
                .padding(.horizontal, 10).frame(height: 42)
                .frame(maxWidth: .infinity)
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
                    .padding(.horizontal, 12).frame(minWidth: 70).frame(height: 42)
                    .glass(Capsule())
                    .contentShape(Capsule())
                }
                .buttonStyle(PressStyle())
                .fixedSize(horizontal: true, vertical: false)
            }

            // 当帧大事横幅 + 实时大国疆域占比条（可一键定位舆图）
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
            .background(MemorialPaper(rules: false, fullBleed: false).clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous)))
            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Theme.ink.opacity(0.18), lineWidth: 0.9))
            .shadow(color: .black.opacity(0.14), radius: 8, y: 3)
        }
        .padding(.horizontal, Theme.Layout.pageInset).padding(.top, 10)
    }

    @ViewBuilder
    private func nodesDrawer(timeline: ReplayTimelineData, maxDrawerHeight: CGFloat) -> some View {
        let drawerShape = UnevenRoundedRectangle(topLeadingRadius: 24, bottomLeadingRadius: 0, bottomTrailingRadius: 0, topTrailingRadius: 24, style: .continuous)
        ZStack(alignment: .bottom) {
            Color.black.opacity(0.32)
                .ignoresSafeArea()
                .onTapGesture {
                    GameFeel.shared.tap()
                    withAnimation(Motion.panel) { showNodes = false }
                }

            VStack(spacing: 0) {
                HStack {
                    Spacer()
                    Capsule().fill(Theme.ink.opacity(0.24)).frame(width: 38, height: 4)
                    Spacer()
                }
                .padding(.top, 10).padding(.bottom, 4)

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
                    model.seekReplay(to: i, focusEvent: true)
                }, onRollback: { cp in
                    withAnimation(Motion.panel) {
                        showNodes = false
                        confirmRollback = cp
                    }
                })
            }
            .frame(maxHeight: maxDrawerHeight)
            .background(MemorialPaper(rules: true, fullBleed: false).clipShape(drawerShape).ignoresSafeArea(edges: .bottom))
            .overlay(drawerShape.stroke(Theme.ink.opacity(0.2), lineWidth: 1))
            .shadow(color: .black.opacity(0.24), radius: 18, y: -4)
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
                            .background(Theme.paper2, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(Theme.line))
                    }
                    .buttonStyle(PressStyle())

                    Button {
                        GameFeel.shared.tap()
                        confirmRollback = nil
                        Task { await model.rollbackToCheckpoint(cp) }
                    } label: {
                        Text("确定回溯").font(Theme.body).foregroundStyle(Theme.paper2)
                            .frame(maxWidth: .infinity).frame(height: 40)
                            .background(Theme.seal, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                    }
                    .buttonStyle(PressStyle())
                }
            }
            .padding(18)
            .background(MemorialPaper(rules: false, fullBleed: false).clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous)))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Theme.ink.opacity(0.22), lineWidth: 1))
            .shadow(color: .black.opacity(0.25), radius: 16, y: 6)
            .padding(.horizontal, 28)
        }
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
            // 顶部拖拽手柄：点击或下划收起为紧凑悬浮胶囊
            Button {
                GameFeel.shared.tap()
                withAnimation(Motion.panel) { collapsed = true }
            } label: {
                HStack(spacing: 6) {
                    Capsule().fill(Theme.ink.opacity(0.24)).frame(width: 36, height: 4)
                }
                .frame(maxWidth: .infinity).frame(height: 14).contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            // 关键节点刻度条 + 交互进度滑条（拖动时自动暂停计时器，避免互相抢占）
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
                                if target != model.replayIndex { model.seekReplay(to: target) }
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
                // 单帧空态清晰引导：绝不留无响应死按钮
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
                        .background(Theme.seal, in: RoundedRectangle(cornerRadius: 11, style: .continuous))
                    }
                    .buttonStyle(PressStyle())
                }
                .padding(.vertical, 2)
            }

            // 播放 / 倒放 / 步进 / 倍速按钮排（全部采用光学居中的手绘水墨图标）
            HStack(spacing: 12) {
                Button { model.stepReplay(-1) } label: {
                    InkIcon(glyph: .stepBack, size: 17, weight: 1.75)
                        .foregroundStyle(Theme.ink)
                        .frame(width: 42, height: 42).background(Theme.paper2, in: Circle())
                        .overlay(Circle().stroke(Theme.line))
                }
                .buttonStyle(PressStyle()).opacity(multiFrame && idx > 0 ? 1 : 0.42)

                // 倒放按钮
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

                // 主正放/暂停朱印钮
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

            // 若当前附近存在可恢复推演的历史快照，一键回到此节点改写历史
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
                    .background(Theme.jade.opacity(0.1), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(Theme.jade.opacity(0.32), lineWidth: 0.8))
                }
                .buttonStyle(PressStyle())
            }
        }
        .padding(.horizontal, Theme.Layout.pageInset).padding(.top, 6).padding(.bottom, 12)
        .background(MemorialPaper(rules: false, fullBleed: false).clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous)))
        .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(Theme.ink.opacity(0.18), lineWidth: 1))
        .shadow(color: Color(red: 0.12, green: 0.09, blue: 0.05).opacity(0.22), radius: 14, y: 5)
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
