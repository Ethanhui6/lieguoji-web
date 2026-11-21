import SwiftUI
import LieguojiCore

/// 国家历代君主世系与国势报告（由引擎 `nationReigns` 导出）。
struct NationReignsReport: Decodable {
    struct ReignEvent: Decodable, Identifiable {
        let day: Int
        let year: Int
        let text: String
        let kind: String
        var reason: String? = nil
        var province: Int? = nil
        var id: String { "\(day)-\(text)" }
    }
    struct Reign: Decodable, Identifiable {
        let order: Int
        let id: String
        let name: String
        let title: String
        let house: String
        let familyId: Int
        let personId: Int
        let stateName: String
        let polity: String
        let ascendedDay: Int
        var endedDay: Int? = nil
        let ascendedYear: Int
        var endedYear: Int? = nil
        let reignYears: Double
        let active: Bool
        let alive: Bool
        let female: Bool
        let startProvinces: Int
        let endProvinces: Int
        let peakProvinces: Int
        let deltaProvinces: Int
        let startVassals: Int
        let endVassals: Int
        let skills: [Double]
        let traits: [String]
        let powerScore: Double
        let powerRank: String
        let powerSummary: String
        let capitalProvince: Int
        let capitalName: String
        let events: [ReignEvent]
    }
    let nationName: String
    let era: String
    let totalReigns: Int
    let peakProvinces: Int
    let currentProvinces: Int
    let strongestOrder: Int
    let capitalProvince: Int
    let reigns: [Reign]
}

/// 国家页面「史册」页签：历代君主 / 皇帝详录（姓名、尊号、氏族、强势程度、国土兴衰、四维与在位大事，均可一键定位舆图）+ 完整国史编年 + 山河回放入口。
struct NationHistoryTab: View {
    @ObservedObject var model: GameModel
    let nation: Int
    let map: WorldMap
    let history: [GameState.Event]
    let fly: (Int) -> Void
    let lower: () -> Void
    var onOpenReplay: (() -> Void)? = nil

    @State private var report: NationReignsReport?
    @State private var loading = true
    @State private var newestFirst = true
    @State private var expandedReign: String?

    private func yearText(_ era: String, _ year: Int) -> String {
        year > 0 ? "\(era)\(year)年" : "\(era)前\(1 - year)年"
    }

    private func rankColor(_ rank: String) -> Color {
        switch rank {
        case "盖世雄主": return Theme.seal
        case "一代明君", "中兴之主": return Theme.jade
        case "守成之君": return Theme.ink
        case "丧土之君", "失政之君": return Color(red: 0.62, green: 0.16, blue: 0.12)
        default: return Theme.ink2
        }
    }

    private func locateProvince(_ province: Int) {
        guard province >= 0, map.meta.provinces.indices.contains(province) else { return }
        GameFeel.shared.tap()
        lower()
        let p = map.meta.provinces[province]
        if let city = map.meta.cities.first(where: { $0.province == province }) {
            model.controller.showPlace(x: Double(city.x), y: Double(city.y))
        } else {
            model.controller.showPlace(x: Double(p.x), y: Double(p.y))
        }
        fly(province)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            if let report {
                // 史册总览卡
                summaryCard(report)

                // 历代疆域起伏图（至少两代君主时呈现）
                if report.reigns.count >= 2 {
                    reignTerritoryChart(report)
                }

                // 排序与标题栏
                HStack(spacing: 10) {
                    SectionLabel("历代君主（\(report.reigns.count) 世）", inset: false)
                    Spacer()
                    Button {
                        GameFeel.shared.tap()
                        withAnimation(Motion.tap) { newestFirst.toggle() }
                    } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "arrow.up.arrow.down").font(.system(size: 11))
                            Text(newestFirst ? "近世在前" : "开国在前").font(Theme.caption)
                        }
                        .foregroundStyle(Theme.seal)
                        .padding(.horizontal, 10).frame(height: 28)
                        .background(Theme.seal.opacity(0.08), in: Capsule())
                        .overlay(Capsule().stroke(Theme.seal.opacity(0.28), lineWidth: 0.8))
                    }
                    .buttonStyle(PressStyle())
                }
                .padding(.horizontal, Theme.Layout.sectionInset)

                if report.reigns.isEmpty {
                    Group2 {
                        Row(label: "世系", value: "尚无君主在位记载")
                    }
                    .padding(.horizontal, Theme.Layout.pageInset)
                } else {
                    let ordered = newestFirst ? Array(report.reigns.reversed()) : report.reigns
                    VStack(spacing: 10) {
                        ForEach(ordered) { reign in
                            reignCard(reign, era: report.era, strongest: reign.order == report.strongestOrder && report.reigns.count > 1)
                        }
                    }
                    .padding(.horizontal, Theme.Layout.pageInset)
                }
            } else if loading {
                PanelPending(failed: false, busy: true) {}
            } else {
                Group2 {
                    Row(label: "史册", value: "暂未能读取该国世系档案")
                }
                .padding(.horizontal, Theme.Layout.pageInset)
            }

            // 本国完整编年（每一条均可直接定位发生州郡）
            FoldSection("国史编年（\(history.count)）", expanded: true, summary: history.first.map { "第\($0.day + 1)日 · " + $0.text } ?? "尚无记载") {
                Group2 {
                    if history.isEmpty {
                        Row(label: "国史", value: "尚无记载")
                    }
                    ForEach(Array(history.prefix(40).enumerated()), id: \.offset) { i, e in
                        HStack(alignment: .top, spacing: 10) {
                            KindSeal(kind: .of(e.kind), size: 20).padding(.top, 2)
                            VStack(alignment: .leading, spacing: 3) {
                                Text("第 \(e.day + 1) 日").font(Theme.caption).foregroundStyle(Theme.ink2).monospacedDigit()
                                Text(e.text).font(Theme.body).foregroundStyle(Theme.ink).fixedSize(horizontal: false, vertical: true)
                            }
                            Spacer(minLength: 6)
                            if let p = e.province, map.meta.provinces.indices.contains(p) {
                                Button { locateProvince(p) } label: {
                                    HStack(spacing: 3) {
                                        Image(systemName: "scope").font(.system(size: 11))
                                        Text("定位").font(Theme.caption)
                                    }
                                    .foregroundStyle(Theme.seal)
                                    .padding(.horizontal, 8).frame(height: 26)
                                    .background(Theme.seal.opacity(0.08), in: Capsule())
                                }
                                .buttonStyle(PressStyle())
                            }
                        }
                        .padding(.horizontal, 14).padding(.vertical, 9)
                        if i < min(history.count, 40) - 1 { Divider2() }
                    }
                }
                .padding(.horizontal, Theme.Layout.pageInset)
            }
        }
        .task(id: "\(nation)-\((model.state?.day ?? 0) / 30)") {
            loading = report == nil
            report = await model.nationReigns(nation)
            loading = false
            if expandedReign == nil, let latest = report?.reigns.last {
                expandedReign = latest.id
            }
        }
    }

    private func summaryCard(_ report: NationReignsReport) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                SealFace(text: "史", size: 30)
                VStack(alignment: .leading, spacing: 2) {
                    Text("\(report.nationName) · 本纪").font(Theme.section).foregroundStyle(Theme.ink).lineLimit(1)
                    Text("凡传 \(max(1, report.totalReigns)) 世 · 历史极盛 \(report.peakProvinces) 州 · 现领 \(report.currentProvinces) 州")
                        .font(Theme.caption).foregroundStyle(Theme.ink2).monospacedDigit()
                }
                Spacer(minLength: 4)
                if report.capitalProvince >= 0 {
                    Button { locateProvince(report.capitalProvince) } label: {
                        HStack(spacing: 4) {
                            Image(systemName: "scope").font(.system(size: 12))
                            Text("定位都城").font(Theme.caption)
                        }
                        .foregroundStyle(Theme.seal)
                        .padding(.horizontal, 10).frame(height: 30)
                        .background(Theme.seal.opacity(0.09), in: Capsule())
                        .overlay(Capsule().stroke(Theme.seal.opacity(0.3), lineWidth: 0.8))
                    }
                    .buttonStyle(PressStyle())
                }
            }
            if let onOpenReplay {
                Button {
                    GameFeel.shared.tap()
                    onOpenReplay()
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "clock.arrow.circlepath").font(.system(size: 14, weight: .medium))
                        Text("开启山河回放 · 追溯历代疆域演变").font(Theme.label)
                        Spacer()
                        Image(systemName: "chevron.right").font(.system(size: 11))
                    }
                    .foregroundStyle(Theme.paper2)
                    .padding(.horizontal, 12).frame(height: 36)
                    .background(Theme.seal, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                }
                .buttonStyle(PressStyle())
            }
        }
        .padding(14)
        .paperCard()
        .padding(.horizontal, Theme.Layout.pageInset)
    }

    private func reignTerritoryChart(_ report: NationReignsReport) -> some View {
        let shown = Array(report.reigns.suffix(12))
        let maxPeak = max(1, shown.map(\.peakProvinces).max() ?? 1)
        return VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("历代疆域规模").font(Theme.section).foregroundStyle(Theme.ink)
                Spacer()
                Text("峰值 \(report.peakProvinces) 州（点击柱条定位）").font(Theme.caption).foregroundStyle(Theme.ink2)
            }
            HStack(alignment: .bottom, spacing: 5) {
                ForEach(shown) { r in
                    let h = max(8, CGFloat(r.peakProvinces) / CGFloat(maxPeak) * 58)
                    let isStrong = r.order == report.strongestOrder
                    Button {
                        withAnimation(Motion.fade) { expandedReign = r.id }
                        if r.capitalProvince >= 0 { locateProvince(r.capitalProvince) }
                    } label: {
                        VStack(spacing: 3) {
                            Text("\(r.peakProvinces)").font(Theme.caption).foregroundStyle(isStrong ? Theme.seal : Theme.ink2).monospacedDigit().lineLimit(1).minimumScaleFactor(0.6)
                            RoundedRectangle(cornerRadius: 3, style: .continuous)
                                .fill(r.active ? Theme.seal : isStrong ? Theme.jade : Theme.ink.opacity(0.45))
                                .frame(maxWidth: 20).frame(height: h)
                            Text("第\(r.order)世").font(.system(size: 9)).foregroundStyle(r.active ? Theme.seal : Theme.ink2).lineLimit(1).minimumScaleFactor(0.6)
                        }
                        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
                    }
                    .buttonStyle(.plain)
                }
            }
            .frame(height: 92)
        }
        .padding(14)
        .paperCard()
        .padding(.horizontal, Theme.Layout.pageInset)
    }

    private func reignCard(_ reign: NationReignsReport.Reign, era: String, strongest: Bool) -> some View {
        let isOpen = expandedReign == reign.id
        let rColor = rankColor(reign.powerRank)
        let span: String = {
            let start = yearText(era, reign.ascendedYear)
            if reign.active { return "\(start) — 至今" }
            let end = yearText(era, reign.endedYear ?? reign.ascendedYear)
            return "\(start) — \(end)"
        }()
        let deltaText = reign.deltaProvinces > 0 ? "+\(reign.deltaProvinces) 州" : reign.deltaProvinces < 0 ? "\(reign.deltaProvinces) 州" : "持平"
        let deltaColor: Color = reign.deltaProvinces > 0 ? Theme.jade : reign.deltaProvinces < 0 ? Theme.seal : Theme.ink2

        return VStack(alignment: .leading, spacing: 0) {
            // 卡片头部：世次、尊号、姓名、强势等级、一键定位
            Button {
                GameFeel.shared.tap()
                withAnimation(Motion.fade) { expandedReign = isOpen ? nil : reign.id }
            } label: {
                VStack(alignment: .leading, spacing: 8) {
                    HStack(alignment: .top, spacing: 10) {
                        SealFace(text: reign.order <= 99 ? String(ChineseNumeral.of(reign.order).prefix(2)) : "\(reign.order)", size: 28, color: reign.active ? Theme.seal : Theme.ink.opacity(0.75))
                        VStack(alignment: .leading, spacing: 3) {
                            HStack(spacing: 6) {
                                Text("\(reign.title) · \(reign.name)").font(Theme.section).foregroundStyle(Theme.ink).lineLimit(1).minimumScaleFactor(0.75)
                                if reign.active {
                                    PaperTag(text: "在位", color: Theme.seal)
                                } else if strongest {
                                    PaperTag(text: "极盛", color: Theme.jade)
                                }
                            }
                            HStack(spacing: 6) {
                                Text("第 \(reign.order) 世 · \(reign.house)").font(Theme.caption).foregroundStyle(Theme.ink2)
                                Text("·").foregroundStyle(Theme.ink2.opacity(0.5))
                                Text(span).font(Theme.caption).foregroundStyle(Theme.ink2).monospacedDigit().lineLimit(1)
                            }
                        }
                        Spacer(minLength: 4)
                        VStack(alignment: .trailing, spacing: 3) {
                            Text(reign.powerRank)
                                .font(Theme.caption).foregroundStyle(Theme.paper2)
                                .padding(.horizontal, 8).padding(.vertical, 2)
                                .background(rColor, in: Capsule())
                            Text("强势 \(Int(reign.powerScore))").font(Theme.caption).foregroundStyle(rColor).monospacedDigit()
                        }
                    }

                    // 强势进度条 + 疆域规模速览
                    VStack(alignment: .leading, spacing: 5) {
                        InkBar(fraction: min(1, max(0.05, reign.powerScore / 100.0)), color: rColor, track: Theme.ink.opacity(0.08), height: 5)
                        HStack(spacing: 8) {
                            Text("国土：\(reign.startProvinces) → 峰 \(reign.peakProvinces) → \(reign.endProvinces) 州")
                                .font(Theme.caption).foregroundStyle(Theme.ink).monospacedDigit()
                            Text(deltaText).font(Theme.caption).foregroundStyle(deltaColor).monospacedDigit()
                            Spacer()
                            Image(systemName: isOpen ? "chevron.up" : "chevron.down").font(.system(size: 11)).foregroundStyle(Theme.ink2)
                        }
                    }
                }
                .padding(13)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            if isOpen {
                Divider2()
                VStack(alignment: .leading, spacing: 10) {
                    // 政体、国号、功业总结与定位按钮
                    HStack(spacing: 8) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("\(reign.stateName) · \(reign.polity)").font(Theme.label).foregroundStyle(Theme.ink)
                            Text(reign.powerSummary).font(Theme.caption).foregroundStyle(Theme.ink2)
                        }
                        Spacer(minLength: 6)
                        if reign.capitalProvince >= 0 {
                            Button { locateProvince(reign.capitalProvince) } label: {
                                HStack(spacing: 4) {
                                    Image(systemName: "scope").font(.system(size: 11))
                                    Text(reign.capitalName.isEmpty ? "定位都城" : "定位·\(reign.capitalName)").font(Theme.caption).lineLimit(1)
                                }
                                .foregroundStyle(Theme.seal)
                                .padding(.horizontal, 9).frame(height: 28)
                                .background(Theme.seal.opacity(0.09), in: Capsule())
                                .overlay(Capsule().stroke(Theme.seal.opacity(0.3), lineWidth: 0.8))
                            }
                            .buttonStyle(PressStyle())
                        }
                    }

                    // 四维能力条
                    if reign.skills.count == 4 {
                        HStack(spacing: 8) {
                            skillBadge("魅力", reign.skills[0])
                            skillBadge("军事", reign.skills[1])
                            skillBadge("外交", reign.skills[2])
                            skillBadge("行政", reign.skills[3])
                        }
                    }

                    // 君主特质
                    if !reign.traits.isEmpty {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 6) {
                                ForEach(reign.traits, id: \.self) { t in
                                    Text(t).font(Theme.caption).foregroundStyle(Theme.ink)
                                        .padding(.horizontal, 8).padding(.vertical, 3)
                                        .background(Theme.paper, in: Capsule())
                                        .overlay(Capsule().stroke(Theme.line, lineWidth: 0.8))
                                }
                            }
                        }
                    }

                    // 在位大事（均可定位地图）
                    if !reign.events.isEmpty {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("在位纪要").font(Theme.caption).foregroundStyle(Theme.seal)
                            ForEach(reign.events) { ev in
                                HStack(alignment: .top, spacing: 8) {
                                    Text(yearText(era, ev.year)).font(Theme.caption).foregroundStyle(Theme.ink2).monospacedDigit().frame(width: 68, alignment: .leading)
                                    Text(ev.text).font(Theme.caption).foregroundStyle(Theme.ink).fixedSize(horizontal: false, vertical: true)
                                    Spacer(minLength: 4)
                                    if let p = ev.province, map.meta.provinces.indices.contains(p) {
                                        Button { locateProvince(p) } label: {
                                            Image(systemName: "scope").font(.system(size: 12)).foregroundStyle(Theme.seal)
                                                .frame(width: 24, height: 24)
                                                .background(Theme.seal.opacity(0.08), in: Circle())
                                        }
                                        .buttonStyle(PressStyle())
                                    }
                                }
                            }
                        }
                        .padding(10)
                        .background(Theme.paper.opacity(0.65), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                    }
                }
                .padding(.horizontal, 13).padding(.vertical, 11)
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
        .paperCard(tint: reign.active ? Theme.seal : nil)
    }

    private func skillBadge(_ label: String, _ value: Double) -> some View {
        let v = Int(value.rounded())
        let c: Color = v >= 75 ? Theme.jade : v <= 35 ? Theme.seal : Theme.ink
        return VStack(spacing: 2) {
            Text("\(v)").font(Theme.body).foregroundStyle(c).monospacedDigit()
            Text(label).font(.system(size: 10)).foregroundStyle(Theme.ink2)
        }
        .frame(maxWidth: .infinity).padding(.vertical, 5)
        .background(Theme.paper.opacity(0.7), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).stroke(Theme.line.opacity(0.7), lineWidth: 0.7))
    }
}
