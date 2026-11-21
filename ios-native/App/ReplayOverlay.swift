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
        loadCheckpoints()
        guard let timeline = await replayTimeline(), !timeline.frames.isEmpty else {
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
        stopReplayTimer()
        seekReplay(to: replayIndex + delta, focusEvent: true)
        GameFeel.shared.tap()
    }

    func toggleReplayPlay(reverse: Bool) {
        guard let timeline = replayTimelineData, timeline.frames.count > 1 else { return }
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

// MARK: - 山河回放交互浮层（挂载在可自由拖拽缩放的舆图之上）

struct ReplayOverlay: View {
    @ObservedObject var model: GameModel
    @State private var showNodes = false
    @State private var confirmRollback: WorldCheckpoint?

    var body: some View {
        if let timeline = model.replayTimelineData, !timeline.frames.isEmpty {
            let idx = max(0, min(timeline.frames.count - 1, model.replayIndex))
            let frame = timeline.frames[idx]
            let nearCP = model.nearestCheckpoint(forDay: frame.day)

            VStack(spacing: 0) {
                // 顶部时间与事件播报条
                VStack(spacing: 8) {
                    HStack(spacing: 10) {
                        Button {
                            GameFeel.shared.tap()
                            model.exitReplay()
                        } label: {
                            HStack(spacing: 5) {
                                Image(systemName: "chevron.left").font(.system(size: 13, weight: .semibold))
                                Text("返回当下").font(Theme.body)
                            }
                            .foregroundStyle(Theme.seal)
                            .padding(.horizontal, 13).frame(height: 38)
                            .glass(Capsule())
                        }
                        .buttonStyle(PressStyle())

                        HStack(spacing: 7) {
                            SealFace(text: model.replayReversing ? "倒" : "史", size: 22, color: model.replayReversing ? Theme.jade : Theme.seal)
                            Text(frame.dateText).font(Theme.section).foregroundStyle(Theme.ink).monospacedDigit().contentTransition(.numericText())
                            Text("· \(frame.aliveCount) 国").font(Theme.caption).foregroundStyle(Theme.ink2).monospacedDigit()
                        }
                        .padding(.horizontal, 13).frame(height: 38)
                        .glass(Capsule())

                        Spacer()

                        Button {
                            GameFeel.shared.tap()
                            showNodes = true
                        } label: {
                            HStack(spacing: 4) {
                                Image(systemName: "list.bullet.rectangle").font(.system(size: 13))
                                Text("节点").font(Theme.label)
                            }
                            .foregroundStyle(Theme.ink)
                            .padding(.horizontal, 12).frame(height: 38)
                            .glass(Capsule())
                        }
                        .buttonStyle(PressStyle())
                    }

                    // 当帧大事横幅（可一键定位舆图）
                    HStack(spacing: 8) {
                        KindSeal(kind: .of(frame.kind), size: 20)
                        VStack(alignment: .leading, spacing: 1) {
                            Text(frame.headline).font(Theme.body).foregroundStyle(Theme.ink).lineLimit(2)
                            if !frame.topName.isEmpty {
                                Text("此时最强：\(frame.topName)（\(frame.topProvinces) 州） · 第 \(idx + 1)/\(timeline.frames.count) 帧")
                                    .font(Theme.caption).foregroundStyle(Theme.ink2).monospacedDigit()
                            }
                        }
                        Spacer(minLength: 4)
                        if frame.province >= 0, let m = model.map, m.meta.provinces.indices.contains(frame.province) {
                            Button {
                                GameFeel.shared.tap()
                                let pr = m.meta.provinces[frame.province]
                                model.controller.showPlace(x: Double(pr.x), y: Double(pr.y))
                            } label: {
                                Image(systemName: "scope").font(.system(size: 14)).foregroundStyle(Theme.seal)
                                    .frame(width: 30, height: 30).background(Theme.seal.opacity(0.1), in: Circle())
                            }
                            .buttonStyle(PressStyle())
                        }
                    }
                    .padding(.horizontal, 14).padding(.vertical, 9)
                    .background(MemorialPaper(rules: false, fullBleed: false).clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous)))
                    .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Theme.ink.opacity(0.18), lineWidth: 0.9))
                    .shadow(color: .black.opacity(0.14), radius: 8, y: 3)
                }
                .padding(.horizontal, 14).padding(.top, 6)

                Spacer()

                // 底部时间轴拖动与正放 / 倒放控制台
                VStack(spacing: 10) {
                    // 关键节点刻度条
                    if timeline.frames.count > 1 {
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
                            step: 1
                        )
                        .tint(model.replayReversing ? Theme.jade : Theme.seal)
                    }

                    // 播放 / 倒放 / 步进 / 倍速按钮排
                    HStack(spacing: 12) {
                        Button { model.stepReplay(-1) } label: {
                            Image(systemName: "backward.frame.fill").font(.system(size: 16)).foregroundStyle(Theme.ink)
                                .frame(width: 40, height: 40).background(Theme.paper2, in: Circle())
                                .overlay(Circle().stroke(Theme.line))
                        }
                        .buttonStyle(PressStyle()).disabled(idx <= 0).opacity(idx <= 0 ? 0.4 : 1)

                        // 倒放按钮
                        Button {
                            GameFeel.shared.tap()
                            model.toggleReplayPlay(reverse: true)
                        } label: {
                            let activeRev = model.replayPlaying && model.replayReversing
                            HStack(spacing: 4) {
                                Image(systemName: activeRev ? "pause.fill" : "backward.fill").font(.system(size: 13))
                                Text("倒放").font(Theme.body)
                            }
                            .foregroundStyle(activeRev ? Theme.paper2 : Theme.ink)
                            .padding(.horizontal, 14).frame(height: 40)
                            .background(activeRev ? Theme.jade : Theme.paper2, in: Capsule())
                            .overlay(Capsule().stroke(activeRev ? Color.clear : Theme.line))
                        }
                        .buttonStyle(PressStyle())

                        // 主正放/暂停朱印钮
                        Button {
                            GameFeel.shared.tap()
                            model.toggleReplayPlay(reverse: false)
                        } label: {
                            let activeFwd = model.replayPlaying && !model.replayReversing
                            Image(systemName: activeFwd ? "pause.fill" : "play.fill").font(.system(size: 18, weight: .semibold))
                                .foregroundStyle(Theme.paper2)
                                .frame(width: 48, height: 48)
                                .background(Theme.seal, in: Circle())
                                .shadow(color: Theme.seal.opacity(0.32), radius: 5, y: 2)
                        }
                        .buttonStyle(PressStyle())

                        Button { model.stepReplay(1) } label: {
                            Image(systemName: "forward.frame.fill").font(.system(size: 16)).foregroundStyle(Theme.ink)
                                .frame(width: 40, height: 40).background(Theme.paper2, in: Circle())
                                .overlay(Circle().stroke(Theme.line))
                        }
                        .buttonStyle(PressStyle()).disabled(idx >= timeline.frames.count - 1).opacity(idx >= timeline.frames.count - 1 ? 0.4 : 1)

                        Button { model.cycleReplaySpeed() } label: {
                            Text("\(model.replaySpeed)×").font(Theme.section).foregroundStyle(model.replaySpeed > 1 ? Theme.seal : Theme.ink)
                                .frame(width: 42, height: 40).background(Theme.paper2, in: Circle())
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
                                Image(systemName: "arrow.counterclockwise.circle.fill").font(.system(size: 14))
                                Text("回到 \(nearCP.dateText) 继续推演（改写历史）").font(Theme.label)
                            }
                            .foregroundStyle(Theme.jade)
                            .frame(maxWidth: .infinity).frame(height: 34)
                            .background(Theme.jade.opacity(0.1), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(Theme.jade.opacity(0.32), lineWidth: 0.8))
                        }
                        .buttonStyle(PressStyle())
                    }
                }
                .padding(.horizontal, 16).padding(.vertical, 12)
                .background(MemorialPaper(rules: false, fullBleed: false).clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous)))
                .overlay(RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(Theme.ink.opacity(0.18), lineWidth: 1))
                .shadow(color: Color(red: 0.12, green: 0.09, blue: 0.05).opacity(0.22), radius: 14, y: 5)
                .padding(.horizontal, 12).padding(.bottom, 8)
            }
            .sheet(isPresented: $showNodes) {
                ReplayNodesSheet(model: model, timeline: timeline, onPickFrame: { i in
                    showNodes = false
                    model.seekReplay(to: i, focusEvent: true)
                }, onRollback: { cp in
                    showNodes = false
                    confirmRollback = cp
                })
                .presentationDetents([.medium, .large]).presentationBackground { MemorialPaper() }.presentationDragIndicator(.hidden)
            }
            .confirmationDialog("回到 \(confirmRollback?.dateText ?? "") 继续推演？", isPresented: Binding(get: { confirmRollback != nil }, set: { if !$0 { confirmRollback = nil } }), titleVisibility: .visible) {
                Button("确定回溯并继续推演", role: .destructive) {
                    if let cp = confirmRollback { confirmRollback = nil; Task { await model.rollbackToCheckpoint(cp) } }
                }
                Button("取消", role: .cancel) { confirmRollback = nil }
            } message: {
                Text("将把当前世界状态恢复至该历史节点，之后的战局与王朝走向均可重新演绎。")
            }
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
                SheetHeader(title: "历史节点", subtitle: "共 \(timeline.frames.count) 帧版图记录 · \(model.checkpoints.count) 个可回溯节点", seal: "溯")
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
