import Foundation

/// 山河回放关键帧引擎（本作 App 规则专用，网页逐字节黄金测试不启用）：
/// 在世界推演过程中以极小内存（RLE 行程编码）记录关键历史时刻的版图归属、存国概况与重大事件，
/// 支持在「大事记 › 山河回放」中实现：正放、倒放、进度条自由拖动、逐节点跳转与焦点定位。
public enum ReplayEngine {
    static let maxFrames = 480
    static let periodicIntervalDays = 30
    static let eventMinGapDays = 5

    /// RLE 压缩州郡归属数组 `[owner0, owner1, ...]` -> `[count0, owner0, count1, owner1, ...]`。
    public static func encodeRLE(_ owners: [Int]) -> [Int] {
        guard let first = owners.first else { return [] }
        var out = [Int]()
        out.reserveCapacity(min(owners.count * 2, 160))
        var cur = first, run = 1
        for o in owners.dropFirst() {
            if o == cur {
                run += 1
            } else {
                out.append(run); out.append(cur)
                cur = o; run = 1
            }
        }
        out.append(run); out.append(cur)
        return out
    }

    /// 解码 RLE 行程编码回完整的州郡归属数组。
    public static func decodeRLE(_ rle: [Int], count: Int) -> [Int] {
        var out = [Int]()
        out.reserveCapacity(max(count, 0))
        var i = 0
        while i + 1 < rle.count {
            let run = max(0, rle[i]), owner = rle[i + 1]
            if run > 0 { out.append(contentsOf: repeatElement(owner, count: run)) }
            i += 2
        }
        if count > 0 && out.count < count {
            out.append(contentsOf: repeatElement(-1, count: count - out.count))
        }
        return count > 0 ? Array(out.prefix(count)) : out
    }

    /// 计算两次归属数组之间易主的州郡数。
    private static func diffCount(_ a: [Int], _ b: [Int]) -> Int {
        let n = min(a.count, b.count)
        var d = abs(a.count - b.count)
        for i in 0..<n where a[i] != b[i] { d += 1 }
        return d
    }

    /// 格式化当前日期文本（兼容自定义纪年）。
    private static func dateLabel(_ r: JS) -> (year: Int, text: String) {
        let d = r.life.currentDate
        let offset = (!r.regimes.isNull && !r.regimes.calendar.isNull) ? (r.regimes.calendar.offset.optionalNumber.map(Int.init) ?? 0) : 0
        let era = (!r.regimes.isNull && !r.regimes.calendar.isNull) ? (r.regimes.calendar.era.optionalString ?? "") : ""
        let y = d.year.asInt + offset
        let prefix = era.isEmpty ? "公元" : era
        let yearText = y > 0 ? "\(prefix)\(y)年" : "\(prefix)前\(1 - y)年"
        return (y, "\(yearText)\(d.month.asInt)月")
    }

    /// 在开局或每日/每月推进时按需捕获一帧山河快照。`force: true` 用于开局首帧。
    public static func capture(_ r: JS, force: Bool = false) {
        guard !r.regimes.isNull, r.regimes.enabled.isTruthy else { return }
        let day = Int(r.world.day.optionalNumber ?? 0)
        if r.regimes.replay.isNull {
            let box = JS.object()
            box.frames = .array()
            box.lastDay = JS(-9999)
            box.lastEntryCount = JS(0)
            r.regimes.replay = box
        }
        let box = r.regimes.replay
        let frames = box.frames.asArray
        let lastDay = box.lastDay.optionalNumber.map(Int.init) ?? -9999
        if !force && day == lastDay { return }

        let nations = r.world.nations.asArray
        let provinces = r.world.provinces.asArray
        guard !provinces.isEmpty else { return }
        var ni = [String: Int]()
        for (i, n) in nations.enumerated() where ni[n.id.asString] == nil { ni[n.id.asString] = i }
        var pi = [String: Int]()
        for (i, p) in provinces.enumerated() where pi[p.id.asString] == nil { pi[p.id.asString] = i }

        let owners = provinces.map { ni[$0.controller.asString] ?? -1 }

        // 检查自上一帧以来是否有重大事件或大规模疆域易主
        let entries = r.chronicle.entries.asArray
        let prevEntryCount = box.lastEntryCount.optionalNumber.map(Int.init) ?? 0
        let newEntries = prevEntryCount < entries.count ? Array(entries[prevEntryCount..<entries.count]) : []

        let majorKinds: Set<String> = ["extinction", "restoration", "uprising", "politics", "war", "peace", "capital"]
        let majorEvent = newEntries.reversed().first { majorKinds.contains($0.kind.optionalString ?? "") }

        let elapsed = day - lastDay
        var shouldRecord = force || frames.isEmpty || elapsed >= periodicIntervalDays
        var isMajor = force || frames.isEmpty

        if !shouldRecord && elapsed >= eventMinGapDays {
            if majorEvent != nil {
                shouldRecord = true
                isMajor = true
            } else if let lastFrame = frames.last, !lastFrame.rle.isNull {
                let prevOwners = decodeRLE(lastFrame.rle.asArray.map(\.asInt), count: owners.count)
                if diffCount(prevOwners, owners) >= 1 {
                    shouldRecord = true
                }
            }
        }
        guard shouldRecord else { return }

        // 统计存国数与大国疆域分布（前 4 强国用于回放大势占比条）
        var counts = [Int: Int]()
        for o in owners where o >= 0 { counts[o, default: 0] += 1 }
        let aliveCount = counts.count
        let rankedPowers = counts.sorted { a, b in a.value != b.value ? a.value > b.value : a.key < b.key }
        let top = rankedPowers.first
        let topNationIdx = top?.key ?? -1
        let topProvinces = top?.value ?? 0
        let topNationName = (topNationIdx >= 0 && nations.indices.contains(topNationIdx)) ? (nations[topNationIdx].name.optionalString ?? "") : ""
        let topPowers = JS.array()
        for entry in rankedPowers.prefix(4) {
            let item = JS.object()
            item.i = JS(entry.key)
            item.p = JS(entry.value)
            topPowers.push(item)
        }

        let dl = dateLabel(r)
        let headline: String
        let kind: String
        var focusProvince = -1
        if frames.isEmpty {
            headline = "天下初定 · \(aliveCount) 国并立"
            kind = "opening"
            if topNationIdx >= 0, let cid = nations[topNationIdx].capitalId.optionalString,
               let city = r.world.cities.asArray.first(where: { $0.id.optionalString == cid }) {
                focusProvince = pi[city.provinceId.asString] ?? -1
            }
        } else if let ev = majorEvent {
            headline = ev.text.optionalString ?? "\(dl.text) · 格局变动"
            kind = ev.kind.optionalString ?? "event"
            if let pid = ev.provinceId.optionalString, let idx = pi[pid] {
                focusProvince = idx
            } else if let nid = ev.nationIds.asArray.first?.optionalString, let nIdx = ni[nid],
                      let cid = nations[nIdx].capitalId.optionalString,
                      let city = r.world.cities.asArray.first(where: { $0.id.optionalString == cid }) {
                focusProvince = pi[city.provinceId.asString] ?? -1
            }
        } else {
            let latest = newEntries.last
            headline = latest?.text.optionalString ?? (topNationName.isEmpty ? "列国变迁" : "\(topNationName)雄踞 \(topProvinces) 州")
            kind = latest?.kind.optionalString ?? "periodic"
            if let pid = latest?.provinceId.optionalString, let idx = pi[pid] { focusProvince = idx }
        }

        // 记录国家名/色快照：仅当该国尚未登记或名称/颜色相对最近登记发生变化时追加少量增量条目
        if box.nations.isNull { box.nations = .array() }
        var knownNations = box.nations.asArray
        var nameUpdates = [JS]()
        for (i, n) in nations.enumerated() {
            let nm = n.name.optionalString ?? ""
            let col = n.color.optionalString ?? "#999999"
            if i >= knownNations.count {
                let rec = JS.object(); rec.name = JS(nm); rec.color = JS(col)
                knownNations.append(rec)
                let upd = JS.object(); upd.i = JS(i); upd.name = JS(nm); upd.color = JS(col)
                nameUpdates.append(upd)
            } else if knownNations[i].name.optionalString != nm || knownNations[i].color.optionalString != col {
                knownNations[i].name = JS(nm); knownNations[i].color = JS(col)
                let upd = JS.object(); upd.i = JS(i); upd.name = JS(nm); upd.color = JS(col)
                nameUpdates.append(upd)
            }
        }
        box.nations = .array(knownNations)

        let frame = JS.object()
        frame.day = JS(day)
        frame.year = JS(dl.year)
        frame.dateText = JS(dl.text)
        frame.rle = .array(encodeRLE(owners).map { JS($0) })
        frame.headline = JS(headline)
        frame.kind = JS(kind)
        frame.major = JS(isMajor)
        frame.province = JS(focusProvince)
        frame.aliveCount = JS(aliveCount)
        frame.topNation = JS(topNationIdx)
        frame.topName = JS(topNationName)
        frame.topProvinces = JS(topProvinces)
        frame.topPowers = topPowers
        if !nameUpdates.isEmpty { frame.updates = .array(nameUpdates) }

        box.frames.push(frame)
        box.lastDay = JS(day)
        box.lastEntryCount = JS(entries.count)

        // 控制帧数上限：保留首帧与近期帧，对中部非重大常规帧做隔帧抽稀（并将被删帧的 nameUpdates 合并到后一帧，确保国名演变不丢失）
        if box.frames.length > maxFrames {
            compact(box)
        }
    }

    private static func compact(_ box: JS) {
        let arr = box.frames.asArray
        guard arr.count > maxFrames else { return }
        let keepTail = 90
        var kept = [JS]()
        kept.reserveCapacity(maxFrames)
        var carriedUpdates = [JS]()
        for i in 0..<arr.count {
            let f = arr[i]
            let mustKeep = i == 0 || i >= arr.count - keepTail || f.major.isTruthy || i % 2 == 0
            if mustKeep {
                if !carriedUpdates.isEmpty {
                    let merged = carriedUpdates + (f.updates.isNull ? [] : f.updates.asArray)
                    f.updates = .array(merged)
                    carriedUpdates.removeAll()
                }
                kept.append(f)
            } else if !f.updates.isNull {
                carriedUpdates.append(contentsOf: f.updates.asArray)
            }
        }
        // 若重大帧过多仍超出上限，再对中段隔帧抽稀一次
        if kept.count > maxFrames {
            var slim = [JS]()
            slim.reserveCapacity(maxFrames)
            var carry = [JS]()
            for i in 0..<kept.count {
                let f = kept[i]
                let keep = i == 0 || i >= kept.count - keepTail || i % 2 == 0
                if keep {
                    if !carry.isEmpty {
                        f.updates = .array(carry + (f.updates.isNull ? [] : f.updates.asArray))
                        carry.removeAll()
                    }
                    slim.append(f)
                } else if !f.updates.isNull {
                    carry.append(contentsOf: f.updates.asArray)
                }
            }
            if !carry.isEmpty, let last = slim.last {
                last.updates = .array((last.updates.isNull ? [] : last.updates.asArray) + carry)
            }
            kept = slim
        }
        if !carriedUpdates.isEmpty, let last = kept.last {
            last.updates = .array((last.updates.isNull ? [] : last.updates.asArray) + carriedUpdates)
        }
        box.frames = .array(kept)
    }
}

extension NativeEngine {
    /// 导出当前世界的山河回放完整时间轴（若尚未采样过则即时补采一帧，确保任何时刻都可打开回放）。
    public func replayTimeline() -> Data? {
        let r = run
        if r.regimes.isNull { Regimes.enable(r) }
        if r.regimes.replay.isNull || r.regimes.replay.frames.length == 0 {
            ReplayEngine.capture(r, force: true)
        } else {
            // 若最新一天有变化但尚未记录，补记一帧“当下”
            let curDay = Int(r.world.day.optionalNumber ?? 0)
            let lastDay = r.regimes.replay.lastDay.optionalNumber.map(Int.init) ?? -1
            if curDay > lastDay { ReplayEngine.capture(r, force: true) }
        }
        let box = r.regimes.replay
        let out = JS.object()
        out.provinceCount = JS(r.world.provinces.length)
        // 提供当前全部国家初始色名清单，供前端重建历史时刻国名与配色
        let nations = JS.array()
        for n in r.world.nations.asArray {
            let o = JS.object()
            o.name = n.name; o.color = n.color
            nations.push(o)
        }
        out.nations = nations
        out.frames = box.frames
        return Data(out.json.utf8)
    }
}
