import SwiftUI
import UIKit
import LieguojiCore

// MARK: - 历史舆图微缩图离主线程缓存（120fps 顺滑滚动）

@MainActor
final class HistoricalThumbnailCache {
    static let shared = HistoricalThumbnailCache()
    private var cache: [String: UIImage] = [:]

    func image(for key: String) -> UIImage? {
        cache[key]
    }

    func store(_ image: UIImage, for key: String) {
        if cache.count > 64 { cache.removeAll() }
        cache[key] = image
    }

    nonisolated static func renderScenario(_ scenario: HistoricalScenario, inputs: PreviewWorld.Inputs) -> UIImage? {
        let heights: [UInt8]
        if let b64 = scenario.customHeightsBase64,
           let decoded = HistoricalScenarios.decodeHeights(b64, expectedCount: inputs.grid.points.count) {
            heights = decoded
        } else {
            heights = HistoricalBasemaps.generateHeights(region: scenario.region, graph: inputs.grid)
        }
        let nationCount = max(2, min(24, scenario.nations.count))
        let thumb = PreviewWorld.thumbnail(inputs, heights: heights, width: 400, nations: nationCount, seed: scenario.id)
        return makeUIImage(rgba: thumb.rgba, width: thumb.width, height: thumb.height)
    }

    nonisolated static func renderRegion(_ region: HistoricalRegion, inputs: PreviewWorld.Inputs) -> UIImage? {
        let heights = HistoricalBasemaps.generateHeights(region: region, graph: inputs.grid)
        let thumb = PreviewWorld.thumbnail(inputs, heights: heights, width: 320, nations: 0, seed: "region-\(region.rawValue)")
        return makeUIImage(rgba: thumb.rgba, width: thumb.width, height: thumb.height)
    }

    nonisolated private static func makeUIImage(rgba: [UInt8], width: Int, height: Int) -> UIImage? {
        guard width > 0, height > 0, rgba.count >= width * height * 4,
              let provider = CGDataProvider(data: Data(rgba) as CFData),
              let cg = CGImage(
                width: width,
                height: height,
                bitsPerComponent: 8,
                bitsPerPixel: 32,
                bytesPerRow: width * 4,
                space: CGColorSpaceCreateDeviceRGB(),
                bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.noneSkipLast.rawValue),
                provider: provider,
                decode: nil,
                shouldInterpolate: true,
                intent: .defaultIntent
              ) else { return nil }
        return UIImage(cgImage: cg)
    }
}

/// 离主线程渲染并缓存的真实地理微缩舆图。
private struct HistoricalScenarioThumb: View {
    let scenario: HistoricalScenario
    let inputs: PreviewWorld.Inputs?
    var height: CGFloat = 152

    @State private var image: UIImage?

    private var cacheKey: String {
        let customHash = scenario.customHeightsBase64?.count ?? 0
        return "\(scenario.id)|\(scenario.region.rawValue)|\(scenario.nations.count)|\(customHash)"
    }

    var body: some View {
        ZStack {
            Theme.paper2
            if let img = image ?? HistoricalThumbnailCache.shared.image(for: cacheKey) {
                Image(uiImage: img)
                    .resizable()
                    .interpolation(.high)
                    .scaledToFill()
            } else {
                VStack(spacing: 6) {
                    InkIcon(glyph: .region, size: 20, weight: 1.5).foregroundStyle(Theme.ink2.opacity(0.6))
                    Text("铺宣勘舆中……").font(Theme.caption).foregroundStyle(Theme.ink2)
                }
            }
        }
        .frame(maxWidth: .infinity)
        .frame(height: height)
        .clipped()
        .task(id: cacheKey) {
            if let hit = HistoricalThumbnailCache.shared.image(for: cacheKey) {
                image = hit
                return
            }
            guard let inputs else { return }
            let sc = scenario
            let rendered = await Task.detached(priority: .utility) {
                HistoricalThumbnailCache.renderScenario(sc, inputs: inputs)
            }.value
            guard !Task.isCancelled, let rendered else { return }
            HistoricalThumbnailCache.shared.store(rendered, for: cacheKey)
            image = rendered
        }
    }
}

/// 历史地域过滤选项（全部 / 中国 / 欧洲 / 东亚日本 / 世界）。
private enum AtlasRegionFilter: String, CaseIterable, Identifiable {
    case all = "all"
    case china = "china"
    case europe = "europe"
    case eastAsiaJapan = "east_asia_japan"
    case world = "world"

    var id: String { rawValue }
    var title: String {
        switch self {
        case .all: return "全部"
        case .china: return "中国"
        case .europe: return "欧洲"
        case .eastAsiaJapan: return "东亚日本"
        case .world: return "世界"
        }
    }

    func matches(_ region: HistoricalRegion) -> Bool {
        switch self {
        case .all: return true
        case .china: return region == .china
        case .europe: return region == .europe
        case .eastAsiaJapan: return region == .eastAsiaJapan
        case .world: return region == .world
        }
    }
}

/// 政体样式中文展示名（优先匹配细分样式，回退基础政体）。
private func historicalStyleLabel(style: String, polity: String) -> String {
    if let match = Regimes.styles.first(where: { $0.id == style }) {
        return match.label
    }
    return Names.polity[polity] ?? polity
}

private func historicalYearText(_ year: Int) -> String {
    year < 0 ? "公元前\(-year)年" : "公元\(year)年"
}

private func historicalRegionTitle(_ raw: String) -> String {
    HistoricalRegion(rawValue: raw)?.title ?? (raw == "all" ? "全部" : raw)
}

private func historicalRegionSeal(_ region: HistoricalRegion) -> String {
    switch region {
    case .china: return "夏"
    case .europe: return "欧"
    case .eastAsiaJapan: return "东"
    case .world: return "宇"
    case .custom: return "绘"
    }
}

// MARK: - 1. 官方历史舆图剧本浏览器

struct HistoricalAtlasBrowserView: View {
    let inputs: PreviewWorld.Inputs?
    let onPlayScenario: (HistoricalScenario) -> Void
    var onEditScenario: ((HistoricalScenario) -> Void)? = nil

    @State private var filter: AtlasRegionFilter = .all
    @State private var expandedId: String? = nil

    private var filteredScenarios: [HistoricalScenario] {
        HistoricalScenarios.officialScenarios.filter { filter.matches($0.region) }
    }

    var body: some View {
        LazyVStack(alignment: .leading, spacing: 14) {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(AtlasRegionFilter.allCases) { item in
                        let on = filter == item
                        Button {
                            GameFeel.shared.tap()
                            withAnimation(Motion.tap) { filter = item }
                        } label: {
                            Text(item.title)
                                .font(Theme.label)
                                .foregroundStyle(on ? Theme.paperLight : Theme.ink)
                                .padding(.horizontal, 13)
                                .frame(height: 32)
                                .background(on ? Theme.seal : Theme.wash.opacity(0.6), in: Capsule())
                                .overlay(Capsule().stroke(on ? Color.clear : Theme.hairline, lineWidth: 0.7))
                        }
                        .buttonStyle(PressStyle())
                    }
                }
                .padding(.horizontal, Theme.Layout.pageInset)
            }

            HStack {
                SectionLabel("官方真实历史剧本（\(filteredScenarios.count) 套）", inset: false)
                Spacer()
                Text("点击卡片预览列国与君主")
                    .font(Theme.caption)
                    .foregroundStyle(Theme.ink2)
            }
            .padding(.horizontal, Theme.Layout.sectionInset)

            ForEach(filteredScenarios) { sc in
                HistoricalScenarioCard(
                    scenario: sc,
                    inputs: inputs,
                    expanded: expandedId == sc.id,
                    onToggleExpand: {
                        GameFeel.shared.tap()
                        withAnimation(Motion.panel) {
                            expandedId = (expandedId == sc.id) ? nil : sc.id
                        }
                    },
                    onPlay: {
                        GameFeel.shared.tap()
                        onPlayScenario(sc)
                    },
                    onEdit: onEditScenario.map { edit in
                        {
                            GameFeel.shared.tap()
                            edit(sc)
                        }
                    }
                )
                .padding(.horizontal, Theme.Layout.pageInset)
            }
        }
    }
}

private struct HistoricalScenarioCard: View {
    let scenario: HistoricalScenario
    let inputs: PreviewWorld.Inputs?
    let expanded: Bool
    let onToggleExpand: () -> Void
    let onPlay: () -> Void
    let onEdit: (() -> Void)?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ZStack(alignment: .bottomLeading) {
                HistoricalScenarioThumb(scenario: scenario, inputs: inputs, height: 152)

                LinearGradient(
                    colors: [Color.black.opacity(0.0), Color.black.opacity(0.45)],
                    startPoint: .top,
                    endPoint: .bottom
                )
                .frame(height: 58)
                .allowsHitTesting(false)

                HStack(spacing: 6) {
                    Text(scenario.yearDisplayText)
                        .font(Theme.caption)
                        .monospacedDigit()
                        .foregroundStyle(Theme.paperLight)
                        .padding(.horizontal, 9)
                        .padding(.vertical, 4)
                        .background(Theme.seal.opacity(0.94), in: Capsule())

                    if !scenario.eraName.isEmpty {
                        Text(scenario.eraName)
                            .font(Theme.caption)
                            .foregroundStyle(Theme.ink)
                            .padding(.horizontal, 9)
                            .padding(.vertical, 4)
                            .background(Theme.paperLight.opacity(0.92), in: Capsule())
                    }
                    Spacer(minLength: 4)
                    if !scenario.openingWars.isEmpty {
                        HStack(spacing: 4) {
                            InkIcon(glyph: .war, size: 11, weight: 1.7).foregroundStyle(Theme.paperLight)
                            Text("开局 \(scenario.openingWars.count) 战")
                                .font(Theme.caption)
                                .monospacedDigit()
                                .foregroundStyle(Theme.paperLight)
                        }
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Theme.ink.opacity(0.76), in: Capsule())
                    }
                }
                .padding(10)
            }
            .overlay(alignment: .topTrailing) {
                HStack(spacing: 4) {
                    Text(scenario.region.badge)
                        .font(Theme.caption)
                        .foregroundStyle(Theme.seal)
                    Text("·")
                        .font(Theme.caption)
                        .foregroundStyle(Theme.ink2)
                    Text(scenario.region.title)
                        .font(Theme.caption)
                        .foregroundStyle(Theme.ink)
                }
                .padding(.horizontal, 9)
                .padding(.vertical, 4)
                .background(Theme.paperLight.opacity(0.94), in: Capsule())
                .overlay(Capsule().stroke(Theme.hairline, lineWidth: 0.65))
                .padding(10)
            }
            .contentShape(Rectangle())
            .onTapGesture(perform: onToggleExpand)

            VStack(alignment: .leading, spacing: 10) {
                Button(action: onToggleExpand) {
                    HStack(alignment: .top, spacing: 10) {
                        SealFace(text: historicalRegionSeal(scenario.region), size: 32, color: Theme.seal, filled: false)
                        VStack(alignment: .leading, spacing: 3) {
                            HStack(spacing: 6) {
                                Text(scenario.title)
                                    .font(Theme.serif(17))
                                    .foregroundStyle(Theme.ink)
                                    .lineLimit(1)
                                Spacer(minLength: 4)
                                InkIcon(glyph: .chevronDown, size: 14, weight: 1.7)
                                    .foregroundStyle(Theme.ink2)
                                    .rotationEffect(.degrees(expanded ? 180 : 0))
                            }
                            Text(scenario.subtitle)
                                .font(Theme.caption)
                                .foregroundStyle(Theme.ink2)
                                .lineLimit(2)
                        }
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)

                // 核心规模与格局标签条
                HStack(spacing: 6) {
                    scenarioChip("\(scenario.nations.count) 列国", tint: Theme.seal)
                    scenarioChip("\(scenario.provinceCount) 州郡", tint: Theme.ink)
                    if !scenario.openingAlliances.isEmpty {
                        scenarioChip("\(scenario.openingAlliances.count) 阵营同盟", tint: Theme.jade)
                    }
                    Spacer(minLength: 0)
                    Button(action: onToggleExpand) {
                        Text(expanded ? "收起列国" : "列国名录 ›")
                            .font(Theme.caption)
                            .foregroundStyle(Theme.seal)
                    }
                    .buttonStyle(.plain)
                }

                if !scenario.description.isEmpty {
                    Text(scenario.description)
                        .font(Theme.caption)
                        .foregroundStyle(Theme.ink2)
                        .lineSpacing(3)
                        .fixedSize(horizontal: false, vertical: true)
                }

                if expanded {
                    Divider2()
                    VStack(alignment: .leading, spacing: 8) {
                        Text("参战列国与史实领袖（\(scenario.nations.count) 国）")
                            .font(Theme.label)
                            .foregroundStyle(Theme.ink)

                        ForEach(scenario.nations) { n in
                            HStack(spacing: 8) {
                                Circle()
                                    .fill(Names.color(n.color))
                                    .frame(width: 10, height: 10)
                                    .overlay(Circle().stroke(Theme.ink.opacity(0.24), lineWidth: 0.6))

                                VStack(alignment: .leading, spacing: 2) {
                                    HStack(spacing: 6) {
                                        Text(n.name)
                                            .font(Theme.serif(14.5))
                                            .foregroundStyle(Theme.ink)
                                            .lineLimit(1)
                                        Text(historicalStyleLabel(style: n.style, polity: n.polity))
                                            .font(Theme.sans(11))
                                            .foregroundStyle(Theme.seal)
                                            .padding(.horizontal, 6)
                                            .padding(.vertical, 1.5)
                                            .background(Theme.seal.opacity(0.08), in: Capsule())
                                    }
                                    Text("\(n.rulerTitle) \(n.rulerName) · 都城：\(n.capitalName)")
                                        .font(Theme.caption)
                                        .foregroundStyle(Theme.ink2)
                                        .lineLimit(1)
                                }
                                Spacer(minLength: 4)
                                Text("武\(n.rulerMilitary) 政\(n.rulerAdmin)")
                                    .font(Theme.sans(11))
                                    .monospacedDigit()
                                    .foregroundStyle(Theme.ink2)
                            }
                            .padding(.vertical, 4)
                            if n.id != scenario.nations.last?.id {
                                Divider2()
                            }
                        }

                        if !scenario.openingWars.isEmpty {
                            let nameById = Dictionary(uniqueKeysWithValues: scenario.nations.map { ($0.id, $0.shortName.isEmpty ? $0.name : $0.shortName) })
                            VStack(alignment: .leading, spacing: 4) {
                                Text("开局既定战火")
                                    .font(Theme.caption)
                                    .foregroundStyle(Theme.seal)
                                ForEach(Array(scenario.openingWars.enumerated()), id: \.offset) { _, w in
                                    let atk = nameById[w.attackerId] ?? w.attackerId
                                    let def = nameById[w.defenderId] ?? w.defenderId
                                    Text("• \(atk) ⚔ \(def)（\(w.casusBelli)）")
                                        .font(Theme.caption)
                                        .foregroundStyle(Theme.ink)
                                }
                            }
                            .padding(10)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Theme.seal.opacity(0.06), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                        }

                        if !scenario.openingAlliances.isEmpty {
                            let nameById = Dictionary(uniqueKeysWithValues: scenario.nations.map { ($0.id, $0.shortName.isEmpty ? $0.name : $0.shortName) })
                            VStack(alignment: .leading, spacing: 4) {
                                Text("开局阵营同盟")
                                    .font(Theme.caption)
                                    .foregroundStyle(Theme.jade)
                                ForEach(Array(scenario.openingAlliances.enumerated()), id: \.offset) { _, al in
                                    let members = al.memberIds.map { nameById[$0] ?? $0 }.joined(separator: " · ")
                                    Text("• \(al.name)：\(members)")
                                        .font(Theme.caption)
                                        .foregroundStyle(Theme.ink)
                                }
                            }
                            .padding(10)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Theme.jade.opacity(0.07), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                        }
                    }
                    .transition(.opacity)
                }

                HStack(spacing: 8) {
                    Button(action: onPlay) {
                        HStack(spacing: 6) {
                            InkIcon(glyph: .play, size: 13, weight: 1.8).foregroundStyle(Theme.paperLight)
                            Text("开卷启世")
                                .font(Theme.serif(15))
                                .foregroundStyle(Theme.paperLight)
                        }
                        .frame(maxWidth: .infinity)
                        .frame(height: 42)
                        .background(Theme.seal, in: RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous))
                    }
                    .buttonStyle(PressStyle())

                    if let onEdit {
                        Button(action: onEdit) {
                            HStack(spacing: 5) {
                                InkIcon(glyph: .brush, size: 13, weight: 1.7).foregroundStyle(Theme.ink)
                                Text("载入编辑器微调")
                                    .font(Theme.label)
                                    .foregroundStyle(Theme.ink)
                                    .lineLimit(1)
                                    .minimumScaleFactor(0.84)
                            }
                            .padding(.horizontal, 12)
                            .frame(height: 42)
                            .background(Theme.wash.opacity(0.65), in: RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous).stroke(Theme.hairline, lineWidth: 0.7))
                        }
                        .buttonStyle(PressStyle())
                    }
                }
                .padding(.top, 2)
            }
            .padding(13)
            .background(Theme.paperLight)
        }
        .clipShape(RoundedRectangle(cornerRadius: Theme.Control.cornerCard, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Theme.Control.cornerCard, style: .continuous).stroke(Theme.hairline, lineWidth: 0.75))
    }

    private func scenarioChip(_ text: String, tint: Color) -> some View {
        Text(text)
            .font(Theme.sans(11.5))
            .monospacedDigit()
            .foregroundStyle(tint)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(tint.opacity(0.09), in: Capsule())
    }
}

// MARK: - 2. 玩家舆图工坊浏览器（本机自绘 + 云端工坊）

struct PlayerWorkshopBrowserView: View {
    let inputs: PreviewWorld.Inputs?
    let onPlayScenario: (HistoricalScenario) -> Void
    let onOpenEditor: () -> Void
    var onEditScenario: ((HistoricalScenario) -> Void)? = nil

    @ObservedObject private var platform = OnlinePlatform.shared
    @State private var localScenarios: [HistoricalScenario] = []
    @State private var searchText = ""
    @State private var selectedRegion = "all"
    @State private var downloadingId: String? = nil
    @State private var likedIds: Set<String> = []
    @State private var statusBanner: String? = nil
    @State private var refreshNonce = 0

    private static let regionPills: [(id: String, title: String)] = [
        ("all", "全部"),
        ("china", "中国"),
        ("europe", "欧洲"),
        ("east_asia_japan", "东亚日本"),
        ("world", "世界"),
        ("custom", "自绘"),
    ]

    private var filteredLocal: [HistoricalScenario] {
        let q = searchText.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        return localScenarios.filter { sc in
            if selectedRegion != "all" && sc.region.rawValue != selectedRegion { return false }
            if q.isEmpty { return true }
            return sc.title.lowercased().contains(q)
                || sc.subtitle.lowercased().contains(q)
                || sc.eraName.lowercased().contains(q)
                || sc.author.lowercased().contains(q)
        }
    }

    var body: some View {
        LazyVStack(alignment: .leading, spacing: 14) {
            // 顶部自绘与发布引导横幅
            Button {
                GameFeel.shared.tap()
                onOpenEditor()
            } label: {
                HStack(spacing: 12) {
                    SealFace(text: "绘", size: 34, color: Theme.paperLight, filled: false)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("去自绘历史舆图并上传")
                            .font(Theme.serif(16))
                            .foregroundStyle(Theme.paperLight)
                        Text("手绘山川或套用真实底图 · 划定列国与政体 · 分享给全网玩家")
                            .font(Theme.caption)
                            .foregroundStyle(Theme.paperLight.opacity(0.84))
                            .lineLimit(1)
                    }
                    Spacer(minLength: 4)
                    PhosphorIcon(glyph: .chevronRight, size: 13, weight: .light)
                        .foregroundStyle(Theme.paperLight.opacity(0.9))
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 12)
                .background(Theme.seal, in: RoundedRectangle(cornerRadius: Theme.Control.cornerCard, style: .continuous))
            }
            .buttonStyle(PressStyle())
            .padding(.horizontal, Theme.Layout.pageInset)

            // 搜寻栏 + 刷新钮
            HStack(spacing: 8) {
                HStack(spacing: 8) {
                    PhosphorIcon(glyph: .search, size: 14, weight: .light).foregroundStyle(Theme.ink2)
                    TextField("", text: $searchText, prompt: Text("搜寻舆图名称、时代或作者……").foregroundColor(Theme.ink2.opacity(0.6)))
                        .font(Theme.body)
                        .foregroundStyle(Theme.ink)
                        .tint(Theme.seal)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    if !searchText.isEmpty {
                        Button {
                            searchText = ""
                            refreshNonce &+= 1
                        } label: {
                            PhosphorIcon(glyph: .close, size: 12, weight: .light).foregroundStyle(Theme.ink2)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.horizontal, 12)
                .frame(height: 40)
                .background(Theme.paperLight, in: RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous).stroke(Theme.hairline, lineWidth: 0.75))

                Button {
                    GameFeel.shared.tap()
                    refreshNonce &+= 1
                } label: {
                    InkIcon(glyph: .refresh, size: 16, weight: 1.7)
                        .foregroundStyle(Theme.seal)
                        .frame(width: 40, height: 40)
                        .background(Theme.paperLight, in: RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous).stroke(Theme.hairline, lineWidth: 0.75))
                }
                .buttonStyle(PressStyle())
                .accessibilityLabel("刷新工坊")
            }
            .padding(.horizontal, Theme.Layout.pageInset)

            // 地域筛选胶囊
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 7) {
                    ForEach(Self.regionPills, id: \.id) { pill in
                        let on = selectedRegion == pill.id
                        Button {
                            GameFeel.shared.tap()
                            withAnimation(Motion.tap) { selectedRegion = pill.id }
                        } label: {
                            Text(pill.title)
                                .font(Theme.label)
                                .foregroundStyle(on ? Theme.paperLight : Theme.ink)
                                .padding(.horizontal, 12)
                                .frame(height: 30)
                                .background(on ? Theme.seal : Theme.wash.opacity(0.58), in: Capsule())
                                .overlay(Capsule().stroke(on ? Color.clear : Theme.hairline, lineWidth: 0.65))
                        }
                        .buttonStyle(PressStyle())
                    }
                }
                .padding(.horizontal, Theme.Layout.pageInset)
            }

            if let banner = statusBanner, !banner.isEmpty {
                HStack(spacing: 8) {
                    InkIcon(glyph: .edict, size: 14).foregroundStyle(Theme.seal)
                    Text(banner)
                        .font(Theme.caption)
                        .foregroundStyle(Theme.ink)
                    Spacer()
                    Button { statusBanner = nil } label: {
                        PhosphorIcon(glyph: .close, size: 11, weight: .light).foregroundStyle(Theme.ink2)
                    }
                    .buttonStyle(.plain)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 9)
                .background(Theme.seal.opacity(0.08), in: RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous).stroke(Theme.seal.opacity(0.28), lineWidth: 0.7))
                .padding(.horizontal, Theme.Layout.pageInset)
            }

            // 一、本机自绘
            SectionLabel("本机自绘（\(filteredLocal.count)）")
            if filteredLocal.isEmpty {
                Group2 {
                    VStack(alignment: .leading, spacing: 8) {
                        Text(localScenarios.isEmpty ? "本机尚无自绘历史剧本" : "当前筛选条件下无匹配本机自绘")
                            .font(Theme.body)
                            .foregroundStyle(Theme.ink)
                        Text("在「自绘地图」中完成山川与列国绘制后，点顶栏「上传工坊」即可保存至本机或发布到云端。")
                            .font(Theme.caption)
                            .foregroundStyle(Theme.ink2)
                    }
                    .padding(14)
                }
                .padding(.horizontal, Theme.Layout.pageInset)
            } else {
                ForEach(filteredLocal) { sc in
                    localScenarioCard(sc)
                        .padding(.horizontal, Theme.Layout.pageInset)
                }
            }

            // 二、云端工坊
            HStack {
                SectionLabel("云端工坊（\(platform.workshopMaps.count)）", inset: false)
                Spacer()
                if platform.workshopLoading {
                    HStack(spacing: 5) {
                        InkBusy()
                        Text("载入中").font(Theme.caption).foregroundStyle(Theme.ink2)
                    }
                }
            }
            .padding(.horizontal, Theme.Layout.sectionInset)

            if platform.workshopLoading && platform.workshopMaps.isEmpty {
                Group2 {
                    HStack(spacing: 10) {
                        InkBusy()
                        Text("正在从九州云端工坊获取玩家地图……")
                            .font(Theme.body)
                            .foregroundStyle(Theme.ink2)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(16)
                }
                .padding(.horizontal, Theme.Layout.pageInset)
            } else if platform.workshopMaps.isEmpty {
                Group2 {
                    VStack(alignment: .leading, spacing: 10) {
                        Text(platform.workshopError ?? "云端工坊暂未检索到对应地图")
                            .font(Theme.body)
                            .foregroundStyle(Theme.ink)
                        Text("离线状态仍可畅玩全部 8 套官方历史剧本与本机自绘；联网后即可下载或发布全网共享地图。")
                            .font(Theme.caption)
                            .foregroundStyle(Theme.ink2)
                            .lineSpacing(3)
                        HStack(spacing: 8) {
                            Button {
                                GameFeel.shared.tap()
                                refreshNonce &+= 1
                            } label: {
                                SecondaryLabel(title: "重新刷新", symbol: "arrow.clockwise")
                            }
                            .buttonStyle(PressStyle())

                            Button {
                                GameFeel.shared.tap()
                                onOpenEditor()
                            } label: {
                                PrimaryLabel(title: "自绘并上传", symbol: "paintbrush.pointed")
                            }
                            .buttonStyle(PressStyle())
                        }
                    }
                    .padding(14)
                }
                .padding(.horizontal, Theme.Layout.pageInset)
            } else {
                ForEach(platform.workshopMaps) { item in
                    cloudMapCard(item)
                        .padding(.horizontal, Theme.Layout.pageInset)
                }
            }
        }
        .task(id: "\(selectedRegion)|\(refreshNonce)") {
            localScenarios = LocalWorkshopStore.list()
            let _ = await platform.fetchWorkshopMaps(region: selectedRegion, query: searchText)
        }
        .task(id: searchText) {
            try? await Task.sleep(nanoseconds: 320_000_000)
            guard !Task.isCancelled else { return }
            let _ = await platform.fetchWorkshopMaps(region: selectedRegion, query: searchText)
        }
    }

    private func localScenarioCard(_ sc: HistoricalScenario) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            if inputs != nil {
                HistoricalScenarioThumb(scenario: sc, inputs: inputs, height: 118)
            }
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    Text(sc.yearDisplayText)
                        .font(Theme.caption)
                        .monospacedDigit()
                        .foregroundStyle(Theme.paperLight)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 2.5)
                        .background(Theme.seal, in: Capsule())
                    Text(sc.title)
                        .font(Theme.serif(16))
                        .foregroundStyle(Theme.ink)
                        .lineLimit(1)
                    Spacer(minLength: 4)
                    Text(sc.region.title)
                        .font(Theme.caption)
                        .foregroundStyle(Theme.ink2)
                }
                if !sc.subtitle.isEmpty {
                    Text(sc.subtitle)
                        .font(Theme.caption)
                        .foregroundStyle(Theme.ink2)
                        .lineLimit(2)
                }
                HStack(spacing: 8) {
                    Text("\(sc.nations.count) 国 · \(sc.provinceCount) 州")
                        .font(Theme.caption)
                        .monospacedDigit()
                        .foregroundStyle(Theme.ink2)
                    if !sc.author.isEmpty {
                        Text("· \(sc.author)")
                            .font(Theme.caption)
                            .foregroundStyle(Theme.ink2)
                            .lineLimit(1)
                    }
                    Spacer()
                }
                HStack(spacing: 8) {
                    Button {
                        GameFeel.shared.tap()
                        onPlayScenario(sc)
                    } label: {
                        HStack(spacing: 5) {
                            InkIcon(glyph: .play, size: 12.5, weight: 1.8).foregroundStyle(Theme.paperLight)
                            Text("开卷启世").font(Theme.label).foregroundStyle(Theme.paperLight)
                        }
                        .frame(maxWidth: .infinity)
                        .frame(height: 36)
                        .background(Theme.seal, in: RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous))
                    }
                    .buttonStyle(PressStyle())

                    if let onEditScenario {
                        Button {
                            GameFeel.shared.tap()
                            onEditScenario(sc)
                        } label: {
                            Text("微调")
                                .font(Theme.label)
                                .foregroundStyle(Theme.ink)
                                .padding(.horizontal, 12)
                                .frame(height: 36)
                                .background(Theme.wash.opacity(0.6), in: RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous))
                                .overlay(RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous).stroke(Theme.hairline, lineWidth: 0.7))
                        }
                        .buttonStyle(PressStyle())
                    }

                    Button {
                        GameFeel.shared.tap()
                        LocalWorkshopStore.delete(id: sc.id)
                        localScenarios = LocalWorkshopStore.list()
                        statusBanner = "已从本机移除「\(sc.title)」"
                    } label: {
                        InkIcon(glyph: .trash, size: 14, weight: 1.7)
                            .foregroundStyle(Theme.seal)
                            .frame(width: 36, height: 36)
                            .background(Theme.wash.opacity(0.55), in: RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous).stroke(Theme.hairline, lineWidth: 0.7))
                    }
                    .buttonStyle(PressStyle())
                    .accessibilityLabel("删除本机地图")
                }
            }
            .padding(12)
            .background(Theme.paperLight)
        }
        .clipShape(RoundedRectangle(cornerRadius: Theme.Control.cornerCard, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Theme.Control.cornerCard, style: .continuous).stroke(Theme.hairline, lineWidth: 0.75))
    }

    private func cloudMapCard(_ item: WorkshopMapSummary) -> some View {
        let isDownloading = downloadingId == item.id
        let isLiked = likedIds.contains(item.id)
        return VStack(alignment: .leading, spacing: 9) {
            HStack(alignment: .top, spacing: 10) {
                let reg = HistoricalRegion(rawValue: item.region) ?? .custom
                SealFace(text: historicalRegionSeal(reg), size: 32, color: Theme.seal, filled: false)
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 6) {
                        Text(item.title)
                            .font(Theme.serif(16))
                            .foregroundStyle(Theme.ink)
                            .lineLimit(1)
                        Spacer(minLength: 4)
                        Text(historicalRegionTitle(item.region))
                            .font(Theme.sans(11))
                            .foregroundStyle(Theme.seal)
                            .padding(.horizontal, 7)
                            .padding(.vertical, 2)
                            .background(Theme.seal.opacity(0.09), in: Capsule())
                    }
                    HStack(spacing: 6) {
                        Text(historicalYearText(item.eraYear))
                            .font(Theme.caption)
                            .monospacedDigit()
                            .foregroundStyle(Theme.seal)
                        if !item.eraName.isEmpty {
                            Text("· \(item.eraName)")
                                .font(Theme.caption)
                                .foregroundStyle(Theme.ink2)
                        }
                        Text("· 作者：\(item.authorName)")
                            .font(Theme.caption)
                            .foregroundStyle(Theme.ink2)
                            .lineLimit(1)
                    }
                }
            }

            if !item.subtitle.isEmpty || !item.description.isEmpty {
                Text(!item.description.isEmpty ? item.description : item.subtitle)
                    .font(Theme.caption)
                    .foregroundStyle(Theme.ink2)
                    .lineLimit(3)
                    .lineSpacing(2.5)
            }

            HStack(spacing: 10) {
                Text("\(item.nationCount) 国 · \(item.provinceCount) 州")
                    .font(Theme.caption)
                    .monospacedDigit()
                    .foregroundStyle(Theme.ink)
                Text("下载 \(item.downloads)")
                    .font(Theme.caption)
                    .monospacedDigit()
                    .foregroundStyle(Theme.ink2)
                Text("赞 \(item.likes)")
                    .font(Theme.caption)
                    .monospacedDigit()
                    .foregroundStyle(Theme.ink2)
                Spacer(minLength: 0)
            }

            if !item.tags.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 6) {
                        ForEach(item.tags.prefix(5), id: \.self) { tag in
                            Text("#\(tag)")
                                .font(Theme.sans(11))
                                .foregroundStyle(Theme.ink2)
                                .padding(.horizontal, 7)
                                .padding(.vertical, 2)
                                .background(Theme.wash.opacity(0.55), in: Capsule())
                        }
                    }
                }
            }

            HStack(spacing: 8) {
                Button {
                    guard downloadingId == nil else { return }
                    GameFeel.shared.tap()
                    downloadingId = item.id
                    statusBanner = nil
                    Task {
                        do {
                            let downloaded = try await platform.downloadWorkshopScenario(id: item.id)
                            try? LocalWorkshopStore.save(downloaded)
                            localScenarios = LocalWorkshopStore.list()
                            downloadingId = nil
                            onPlayScenario(downloaded)
                        } catch {
                            downloadingId = nil
                            statusBanner = "下载失败：\(error.localizedDescription)"
                            GameFeel.shared.notify(.error)
                        }
                    }
                } label: {
                    HStack(spacing: 6) {
                        if isDownloading {
                            InkBusy()
                        } else {
                            InkIcon(glyph: .play, size: 12.5, weight: 1.8).foregroundStyle(Theme.paperLight)
                        }
                        Text(isDownloading ? "正在下载舆图……" : "下载并启世")
                            .font(Theme.label)
                            .foregroundStyle(Theme.paperLight)
                    }
                    .frame(maxWidth: .infinity)
                    .frame(height: 38)
                    .background(Theme.seal.opacity(isDownloading ? 0.72 : 1), in: RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous))
                }
                .buttonStyle(PressStyle())
                .disabled(downloadingId != nil)

                Button {
                    GameFeel.shared.tap()
                    likedIds.insert(item.id)
                    Task {
                        let _ = await platform.likeWorkshopMap(id: item.id)
                    }
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: isLiked ? "heart.fill" : "heart")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(isLiked ? Theme.paperLight : Theme.seal)
                        Text("\(item.likes)")
                            .font(Theme.caption)
                            .monospacedDigit()
                            .foregroundStyle(isLiked ? Theme.paperLight : Theme.ink)
                    }
                    .padding(.horizontal, 12)
                    .frame(height: 38)
                    .background(isLiked ? Theme.seal : Theme.wash.opacity(0.6), in: RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous).stroke(isLiked ? Color.clear : Theme.hairline, lineWidth: 0.7))
                }
                .buttonStyle(PressStyle())
                .accessibilityLabel("点赞此舆图")
            }
        }
        .padding(13)
        .background(Theme.paperLight, in: RoundedRectangle(cornerRadius: Theme.Control.cornerCard, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Theme.Control.cornerCard, style: .continuous).stroke(Theme.hairline, lineWidth: 0.75))
    }
}

// MARK: - 3. 自绘历史剧本打包与云端发布表

struct HistoricalScenarioPublishSheet: View {
    @ObservedObject var editor: MapEditor
    let onPlayScenario: (HistoricalScenario) -> Void
    let onDismiss: () -> Void

    struct NationDraft: Identifiable {
        let id: String
        var name: String
        var shortName: String
        var color: String
        var culture: String
        var religion: String
        var styleId: String
        var capitalLon: Double
        var capitalLat: Double
        var capitalName: String
        var anchors: [HistoricalAnchor]
        var rulerName: String
        var rulerTitle: String
    }

    private struct EraPreset: Identifiable {
        let id: String
        let label: String
        let year: Int
        let eraName: String
    }

    private static let eraPresets: [EraPreset] = [
        EraPreset(id: "warring", label: "战国 -260", year: -260, eraName: "战国七雄"),
        EraPreset(id: "threekingdoms", label: "三国 208", year: 208, eraName: "建安十三年"),
        EraPreset(id: "tang", label: "盛唐 755", year: 755, eraName: "天宝十四载"),
        EraPreset(id: "sengoku", label: "战国 1560", year: 1560, eraName: "永禄三年"),
        EraPreset(id: "napoleon", label: "拿破仑 1812", year: 1812, eraName: "法兰西第一帝国"),
        EraPreset(id: "ww1", label: "一战 1914", year: 1914, eraName: "欧陆大战"),
        EraPreset(id: "ww2", label: "二战 1939", year: 1939, eraName: "欧陆风云"),
        EraPreset(id: "modern", label: "现代 2026", year: 2026, eraName: "现代格局"),
    ]

    /// 精选常用历史政体样式（涵盖帝制/王国/共和/立宪/议会/总统/社会主义/共产主义/法西斯/纳粹/幕府/军政府/神权）。
    private static let featuredStyleIds: [String] = [
        "empire", "absolute", "constitutional", "feudal", "tsardom",
        "democratic", "parliamentary", "presidential", "federal",
        "socialist", "communist", "fascist", "nazi",
        "shogunate", "junta", "theocracy", "khanate", "caliphate",
    ]

    private static let colorPalette: [String] = [
        "#B93A32", "#2F5E8E", "#3B7A57", "#B88428", "#6B4C8A",
        "#C46334", "#2E7B7F", "#8A3F5B", "#5A6E3A", "#4F5D75",
        "#9A5833", "#3E4E88",
    ]

    @State private var title: String = ""
    @State private var subtitle: String = ""
    @State private var authorName: String = ""
    @State private var region: HistoricalRegion = .custom
    @State private var yearText: String = "1939"
    @State private var eraName: String = ""
    @State private var descriptionText: String = ""
    @State private var drafts: [NationDraft] = []
    @State private var warPairs: Set<String> = []
    @State private var expandedNationId: String? = nil
    @State private var initialized = false
    @State private var uploading = false
    @State private var feedback: String? = nil
    @State private var feedbackSuccess = false

    private var parsedYear: Int {
        Int(yearText.trimmingCharacters(in: .whitespacesAndNewlines)) ?? 1
    }

    private var availableStyles: [Regimes.Style] {
        let featured = Self.featuredStyleIds.compactMap { sid in Regimes.styles.first(where: { $0.id == sid }) }
        let featuredSet = Set(featured.map(\.id))
        let rest = Regimes.styles.filter { !featuredSet.contains($0.id) }
        return featured + rest
    }

    private func pairKey(_ a: String, _ b: String) -> String {
        a < b ? "\(a)|\(b)" : "\(b)|\(a)"
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 14) {
                SheetHeader(title: "发布历史舆图", subtitle: "打包地形、列国、政体与开局战火，保存本机或分享云端工坊", seal: "坊")

                if let feedback {
                    HStack(spacing: 8) {
                        InkIcon(glyph: feedbackSuccess ? .trophy : .edict, size: 15)
                            .foregroundStyle(feedbackSuccess ? Theme.jade : Theme.seal)
                        Text(feedback)
                            .font(Theme.caption)
                            .foregroundStyle(Theme.ink)
                            .fixedSize(horizontal: false, vertical: true)
                        Spacer(minLength: 0)
                    }
                    .padding(.horizontal, 13)
                    .padding(.vertical, 10)
                    .background((feedbackSuccess ? Theme.jade : Theme.seal).opacity(0.09), in: RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous).stroke((feedbackSuccess ? Theme.jade : Theme.seal).opacity(0.32), lineWidth: 0.7))
                    .padding(.horizontal, Theme.Layout.pageInset)
                }

                // 一、基础卷首信息
                SectionLabel("舆图卷首")
                Group2 {
                    VStack(spacing: 10) {
                        labeledField("地图名称", placeholder: "例：1939 欧陆风云 / 我的架空战国", text: $title)
                        Divider2()
                        labeledField("副题简语", placeholder: "一句话概括格局亮点", text: $subtitle)
                        Divider2()
                        labeledField("作者署名", placeholder: "列国制图师", text: $authorName)
                        Divider2()
                        HStack(spacing: 10) {
                            Text("地理分区").font(Theme.body).foregroundStyle(Theme.ink2)
                            Spacer()
                            Menu {
                                ForEach(HistoricalRegion.allCases) { r in
                                    Button(r.title) { region = r }
                                }
                            } label: {
                                HStack(spacing: 4) {
                                    Text(region.title).font(Theme.body).foregroundStyle(Theme.ink)
                                    InkIcon(glyph: .chevronDown, size: 12).foregroundStyle(Theme.ink2)
                                }
                                .padding(.horizontal, 10)
                                .frame(height: 32)
                                .background(Theme.wash.opacity(0.55), in: RoundedRectangle(cornerRadius: 7, style: .continuous))
                            }
                        }
                    }
                    .padding(14)
                }
                .padding(.horizontal, Theme.Layout.pageInset)

                // 二、历史年份与纪年
                SectionLabel("历史年份与纪年（公元前填负数）")
                Group2 {
                    VStack(alignment: .leading, spacing: 10) {
                        HStack(spacing: 10) {
                            Text("开局年份").font(Theme.body).foregroundStyle(Theme.ink2)
                            Text(historicalYearText(parsedYear))
                                .font(Theme.caption)
                                .monospacedDigit()
                                .foregroundStyle(Theme.seal)
                            Spacer()
                            TextField("", text: $yearText, prompt: Text("-260 或 1939").foregroundColor(Theme.ink2.opacity(0.6)))
                                .paperField(width: 118)
                                .keyboardType(.numbersAndPunctuation)
                                .multilineTextAlignment(.trailing)
                        }
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 6) {
                                ForEach(Self.eraPresets) { ep in
                                    let on = parsedYear == ep.year
                                    Button {
                                        GameFeel.shared.tap()
                                        yearText = String(ep.year)
                                        if eraName.isEmpty || Self.eraPresets.contains(where: { $0.eraName == eraName }) {
                                            eraName = ep.eraName
                                        }
                                    } label: {
                                        Text(ep.label)
                                            .font(Theme.caption)
                                            .monospacedDigit()
                                            .foregroundStyle(on ? Theme.paperLight : Theme.ink)
                                            .padding(.horizontal, 9)
                                            .frame(height: 28)
                                            .background(on ? Theme.seal : Theme.wash.opacity(0.55), in: Capsule())
                                            .overlay(Capsule().stroke(on ? Color.clear : Theme.hairline, lineWidth: 0.65))
                                    }
                                    .buttonStyle(PressStyle())
                                }
                            }
                        }
                        Divider2()
                        labeledField("纪年称号", placeholder: "例：天宝十四载 / 战国七雄", text: $eraName)
                        Divider2()
                        VStack(alignment: .leading, spacing: 6) {
                            Text("历史简介").font(Theme.body).foregroundStyle(Theme.ink2)
                            TextField("", text: $descriptionText, prompt: Text("描述本图的世界背景、强权博弈或特色玩法……").foregroundColor(Theme.ink2.opacity(0.6)), axis: .vertical)
                                .font(Theme.body)
                                .foregroundStyle(Theme.ink)
                                .tint(Theme.seal)
                                .lineLimit(2...5)
                                .padding(10)
                                .background(Theme.paper2.opacity(0.65), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                                .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).stroke(Theme.hairline, lineWidth: 0.7))
                        }
                    }
                    .padding(14)
                }
                .padding(.horizontal, Theme.Layout.pageInset)

                // 三、各国名号、政体与领袖配置
                HStack {
                    SectionLabel("列国设定（\(drafts.count) 国）", inset: false)
                    Spacer()
                    if drafts.count < 24 {
                        Button {
                            GameFeel.shared.tap()
                            addDraftNation()
                        } label: {
                            HStack(spacing: 4) {
                                InkIcon(glyph: .plus, size: 12).foregroundStyle(Theme.paperLight)
                                Text("增设一国").font(Theme.caption).foregroundStyle(Theme.paperLight)
                            }
                            .padding(.horizontal, 10)
                            .frame(height: 28)
                            .background(Theme.seal, in: Capsule())
                        }
                        .buttonStyle(PressStyle())
                    }
                }
                .padding(.horizontal, Theme.Layout.sectionInset)

                ForEach($drafts) { $draft in
                    nationDraftCard($draft)
                        .padding(.horizontal, Theme.Layout.pageInset)
                }

                // 四、开局战事开关
                if drafts.count >= 2 {
                    SectionLabel("开局既定战火（轻点切换交战国对）")
                    Group2 {
                        VStack(alignment: .leading, spacing: 8) {
                            let pairs = allNationPairs()
                            ForEach(Array(pairs.prefix(18).enumerated()), id: \.offset) { idx, pair in
                                let key = pairKey(pair.0.id, pair.1.id)
                                let atWar = warPairs.contains(key)
                                Button {
                                    GameFeel.shared.tap()
                                    if atWar { warPairs.remove(key) } else { warPairs.insert(key) }
                                } label: {
                                    HStack(spacing: 8) {
                                        Circle().fill(Names.color(pair.0.color)).frame(width: 9, height: 9)
                                        Text(pair.0.name).font(Theme.body).foregroundStyle(Theme.ink).lineLimit(1)
                                        Text("⚔").font(Theme.caption).foregroundStyle(atWar ? Theme.seal : Theme.ink2)
                                        Circle().fill(Names.color(pair.1.color)).frame(width: 9, height: 9)
                                        Text(pair.1.name).font(Theme.body).foregroundStyle(Theme.ink).lineLimit(1)
                                        Spacer(minLength: 4)
                                        Text(atWar ? "开局交战" : "和平")
                                            .font(Theme.caption)
                                            .foregroundStyle(atWar ? Theme.paperLight : Theme.ink2)
                                            .padding(.horizontal, 9)
                                            .padding(.vertical, 3)
                                            .background(atWar ? Theme.seal : Theme.wash.opacity(0.6), in: Capsule())
                                    }
                                    .frame(minHeight: 38)
                                    .contentShape(Rectangle())
                                }
                                .buttonStyle(.plain)
                                if idx < min(pairs.count, 18) - 1 { Divider2() }
                            }
                        }
                        .padding(.horizontal, 14)
                        .padding(.vertical, 8)
                    }
                    .padding(.horizontal, Theme.Layout.pageInset)
                }

                // 五、保存与上传操作
                VStack(spacing: 10) {
                    Button {
                        saveLocallyAndPlay()
                    } label: {
                        PrimaryLabel(title: "保存至本机并直接开玩", symbol: "play.fill")
                    }
                    .buttonStyle(PressStyle())
                    .disabled(uploading || drafts.count < 2)

                    Button {
                        uploadToCloud()
                    } label: {
                        HStack(spacing: 8) {
                            if uploading { InkBusy() }
                            else { InkIcon(glyph: .export, size: 16, weight: 1.7).foregroundStyle(Theme.seal) }
                            Text(uploading ? "正在上传至云端工坊……" : "上传至云端工坊（所有玩家可见）")
                                .font(Theme.serif(15.5))
                                .foregroundStyle(Theme.seal)
                        }
                        .frame(maxWidth: .infinity)
                        .frame(height: 48)
                        .background(Theme.paperLight, in: RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous).stroke(Theme.seal.opacity(0.55), lineWidth: 1.0))
                    }
                    .buttonStyle(PressStyle())
                    .disabled(uploading || drafts.count < 2)
                    .opacity((uploading || drafts.count < 2) ? 0.55 : 1)

                    Button(action: onDismiss) {
                        Text("返回继续绘制")
                            .font(Theme.label)
                            .foregroundStyle(Theme.ink2)
                            .frame(maxWidth: .infinity)
                            .frame(height: 36)
                    }
                    .buttonStyle(.plain)
                }
                .padding(.horizontal, Theme.Layout.pageInset)
                .padding(.top, 4)
            }
            .padding(.bottom, 28)
        }
        .scrollIndicators(.hidden)
        .onAppear {
            guard !initialized else { return }
            initialized = true
            populateFromEditor()
        }
    }

    private func labeledField(_ label: String, placeholder: String, text: Binding<String>) -> some View {
        HStack(spacing: 10) {
            Text(label)
                .font(Theme.body)
                .foregroundStyle(Theme.ink2)
                .frame(width: 68, alignment: .leading)
            TextField("", text: text, prompt: Text(placeholder).foregroundColor(Theme.ink2.opacity(0.55)))
                .font(Theme.body)
                .foregroundStyle(Theme.ink)
                .tint(Theme.seal)
                .multilineTextAlignment(.trailing)
        }
    }

    private func nationDraftCard(_ draft: Binding<NationDraft>) -> some View {
        let d = draft.wrappedValue
        let isOpen = expandedNationId == d.id
        let styleLabel = Regimes.styles.first(where: { $0.id == d.styleId })?.label ?? d.styleId
        let cultureLabel = Names.culture[d.culture] ?? d.culture

        return VStack(alignment: .leading, spacing: 0) {
            Button {
                GameFeel.shared.tap()
                withAnimation(Motion.panel) {
                    expandedNationId = isOpen ? nil : d.id
                }
            } label: {
                HStack(spacing: 10) {
                    Circle()
                        .fill(Names.color(d.color))
                        .frame(width: 14, height: 14)
                        .overlay(Circle().stroke(Theme.ink.opacity(0.25), lineWidth: 0.7))
                    VStack(alignment: .leading, spacing: 2) {
                        Text(d.name.isEmpty ? "未命名国家" : d.name)
                            .font(Theme.serif(15))
                            .foregroundStyle(Theme.ink)
                        Text("\(styleLabel) · \(cultureLabel) · \(d.rulerTitle) \(d.rulerName)")
                            .font(Theme.caption)
                            .foregroundStyle(Theme.ink2)
                            .lineLimit(1)
                    }
                    Spacer(minLength: 4)
                    InkIcon(glyph: .chevronDown, size: 13, weight: 1.7)
                        .foregroundStyle(Theme.ink2)
                        .rotationEffect(.degrees(isOpen ? 180 : 0))
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 11)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)

            if isOpen {
                Divider2()
                VStack(alignment: .leading, spacing: 10) {
                    labeledField("国家全名", placeholder: "如：秦 / 德意志第三帝国", text: draft.name)
                    Divider2()
                    labeledField("都城名称", placeholder: "如：咸阳 / 柏林", text: draft.capitalName)
                    Divider2()
                    labeledField("执政称谓", placeholder: "皇帝 / 总统 / 首相 / 元首", text: draft.rulerTitle)
                    Divider2()
                    labeledField("领袖姓名", placeholder: "开局执政者姓名", text: draft.rulerName)
                    Divider2()

                    HStack(spacing: 10) {
                        Text("政体样式").font(Theme.body).foregroundStyle(Theme.ink2)
                        Spacer()
                        Menu {
                            ForEach(availableStyles, id: \.id) { st in
                                Button("\(st.label)（\(Names.polity[st.base] ?? st.base)）") {
                                    draft.styleId.wrappedValue = st.id
                                    if let t = st.title, !t.isEmpty {
                                        draft.rulerTitle.wrappedValue = t
                                    }
                                }
                            }
                        } label: {
                            HStack(spacing: 4) {
                                Text(styleLabel).font(Theme.body).foregroundStyle(Theme.seal)
                                InkIcon(glyph: .chevronDown, size: 12).foregroundStyle(Theme.ink2)
                            }
                            .padding(.horizontal, 10)
                            .frame(height: 30)
                            .background(Theme.seal.opacity(0.08), in: RoundedRectangle(cornerRadius: 6, style: .continuous))
                        }
                    }

                    HStack(spacing: 10) {
                        Text("文化体系").font(Theme.body).foregroundStyle(Theme.ink2)
                        Spacer()
                        Menu {
                            ForEach(Names.cultureIds, id: \.self) { cid in
                                Button(Names.culture[cid] ?? cid) {
                                    draft.culture.wrappedValue = cid
                                }
                            }
                        } label: {
                            HStack(spacing: 4) {
                                Text(cultureLabel).font(Theme.body).foregroundStyle(Theme.ink)
                                InkIcon(glyph: .chevronDown, size: 12).foregroundStyle(Theme.ink2)
                            }
                            .padding(.horizontal, 10)
                            .frame(height: 30)
                            .background(Theme.wash.opacity(0.55), in: RoundedRectangle(cornerRadius: 6, style: .continuous))
                        }
                    }

                    // 旗色快捷选色
                    HStack(spacing: 6) {
                        Text("旗色").font(Theme.caption).foregroundStyle(Theme.ink2)
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 6) {
                                ForEach(Self.colorPalette, id: \.self) { hex in
                                    let on = d.color.uppercased() == hex.uppercased()
                                    Button {
                                        draft.color.wrappedValue = hex
                                    } label: {
                                        Circle()
                                            .fill(Names.color(hex))
                                            .frame(width: 22, height: 22)
                                            .overlay(Circle().stroke(on ? Theme.ink : Color.clear, lineWidth: 2))
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                        }
                    }

                    if drafts.count > 2 {
                        Button {
                            GameFeel.shared.tap()
                            drafts.removeAll { $0.id == d.id }
                            warPairs = warPairs.filter { !$0.contains(d.id) }
                        } label: {
                            HStack(spacing: 4) {
                                InkIcon(glyph: .trash, size: 12.5).foregroundStyle(Theme.seal)
                                Text("移除此国").font(Theme.caption).foregroundStyle(Theme.seal)
                            }
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(14)
            }
        }
        .background(Theme.paperLight, in: RoundedRectangle(cornerRadius: Theme.Control.cornerCard, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Theme.Control.cornerCard, style: .continuous).stroke(Theme.hairline, lineWidth: 0.75))
    }

    private func allNationPairs() -> [(NationDraft, NationDraft)] {
        var out: [(NationDraft, NationDraft)] = []
        guard drafts.count >= 2 else { return out }
        for i in 0..<(drafts.count - 1) {
            for j in (i + 1)..<drafts.count {
                out.append((drafts[i], drafts[j]))
            }
        }
        return out
    }

    private func addDraftNation() {
        let idx = drafts.count
        let hex = Self.colorPalette[idx % Self.colorPalette.count]
        let midLon = (region.lonMin + region.lonMax) * 0.5 + Double((idx % 5) - 2) * (region.lonMax - region.lonMin) * 0.12
        let midLat = (region.latMin + region.latMax) * 0.5 + Double(((idx / 5) % 3) - 1) * (region.latMax - region.latMin) * 0.14
        let id = "n_\(idx + 1)"
        drafts.append(NationDraft(
            id: id,
            name: "第\(idx + 1)国",
            shortName: "第\(idx + 1)",
            color: hex,
            culture: defaultCulture(for: region),
            religion: defaultReligion(for: region),
            styleId: "empire",
            capitalLon: midLon,
            capitalLat: midLat,
            capitalName: "京畿\(idx + 1)",
            anchors: [],
            rulerName: "太祖",
            rulerTitle: "皇帝"
        ))
        expandedNationId = id
    }

    private func populateFromEditor() {
        let user = OnlinePlatform.shared.user
        let nick = user?.nickname.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let uname = user?.username.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        authorName = !nick.isEmpty ? nick : (!uname.isEmpty ? uname : "列国制图师")
        region = editor.historicalRegion

        if let base = editor.activeHistoricalScenario, editor.seeds.isEmpty {
            title = base.title + "（改编）"
            subtitle = base.subtitle
            yearText = String(base.year)
            eraName = base.eraName
            descriptionText = base.description
            drafts = base.nations.map { n in
                NationDraft(
                    id: n.id,
                    name: n.name,
                    shortName: n.shortName,
                    color: n.color,
                    culture: n.culture,
                    religion: n.religion,
                    styleId: n.style,
                    capitalLon: n.capitalLon,
                    capitalLat: n.capitalLat,
                    capitalName: n.capitalName,
                    anchors: n.anchors,
                    rulerName: n.rulerName,
                    rulerTitle: n.rulerTitle
                )
            }
            warPairs = Set(base.openingWars.map { pairKey($0.attackerId, $0.defenderId) })
            expandedNationId = drafts.first?.id
            return
        }

        title = region == .custom ? "我的自绘山河" : "\(region.title) · 自绘剧本"
        subtitle = "由 \(authorName) 亲绘山川与列国格局"
        yearText = "1939"
        eraName = "列国纪元"
        descriptionText = "基于「\(region.title)」精绘地形与自定义列国版图。"

        let provs = editor.map.meta.provinces
        let w = Double(max(1, editor.map.width))
        let h = Double(max(1, editor.map.height))
        var built: [NationDraft] = []

        if !editor.seeds.isEmpty {
            for (i, seedProv) in editor.seeds.enumerated() {
                let capGeo: (lon: Double, lat: Double)
                if provs.indices.contains(seedProv) {
                    capGeo = HistoricalBasemaps.unproject(x: Double(provs[seedProv].x), y: Double(provs[seedProv].y), region: region, width: w, height: h)
                } else {
                    capGeo = ((region.lonMin + region.lonMax) * 0.5, (region.latMin + region.latMax) * 0.5)
                }
                let ownedProvs = editor.owners.indices.filter { editor.owners[$0] == i && $0 != seedProv && provs.indices.contains($0) }
                let step = max(1, ownedProvs.count / 8)
                var anchors: [HistoricalAnchor] = []
                for idx in stride(from: 0, to: ownedProvs.count, by: step).prefix(8) {
                    let pIdx = ownedProvs[idx]
                    let pt = HistoricalBasemaps.unproject(x: Double(provs[pIdx].x), y: Double(provs[pIdx].y), region: region, width: w, height: h)
                    anchors.append(HistoricalAnchor(lon: pt.lon, lat: pt.lat, provinceName: "第\(pIdx + 1)州", weight: 1.0))
                }
                let hex = editor.nationHex(at: i)
                built.append(NationDraft(
                    id: "custom_\(i + 1)",
                    name: "第\(i + 1)势力",
                    shortName: "势\(i + 1)",
                    color: hex,
                    culture: defaultCulture(for: region),
                    religion: defaultReligion(for: region),
                    styleId: "empire",
                    capitalLon: capGeo.lon,
                    capitalLat: capGeo.lat,
                    capitalName: "王都\(i + 1)",
                    anchors: anchors,
                    rulerName: "执政\(i + 1)",
                    rulerTitle: "君主"
                ))
            }
        } else {
            let targetCount = max(2, min(12, editor.nations))
            for i in 0..<targetCount {
                let angle = Double(i) / Double(targetCount) * Double.pi * 2.0
                let cx = w * (0.5 + cos(angle) * 0.28)
                let cy = h * (0.5 + sin(angle) * 0.26)
                let geo = HistoricalBasemaps.unproject(x: cx, y: cy, region: region, width: w, height: h)
                built.append(NationDraft(
                    id: "custom_\(i + 1)",
                    name: "第\(i + 1)势力",
                    shortName: "势\(i + 1)",
                    color: Self.colorPalette[i % Self.colorPalette.count],
                    culture: defaultCulture(for: region),
                    religion: defaultReligion(for: region),
                    styleId: "empire",
                    capitalLon: geo.lon,
                    capitalLat: geo.lat,
                    capitalName: "京城\(i + 1)",
                    anchors: [],
                    rulerName: "开国之君",
                    rulerTitle: "皇帝"
                ))
            }
        }
        drafts = built
        expandedNationId = built.first?.id
    }

    private func defaultCulture(for region: HistoricalRegion) -> String {
        switch region {
        case .china: return "chinese"
        case .europe: return "french"
        case .eastAsiaJapan: return "japanese"
        case .world, .custom: return "chinese"
        }
    }

    private func defaultReligion(for region: HistoricalRegion) -> String {
        switch region {
        case .china: return "confucian"
        case .europe: return "catholic"
        case .eastAsiaJapan: return "shinto"
        case .world, .custom: return "chineseFolk"
        }
    }

    private func buildScenario() -> HistoricalScenario {
        let cleanTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let finalTitle = cleanTitle.isEmpty ? "自绘历史舆图" : String(cleanTitle.prefix(56))
        let cleanAuthor = authorName.trimmingCharacters(in: .whitespacesAndNewlines)
        let finalAuthor = cleanAuthor.isEmpty ? "列国制图师" : String(cleanAuthor.prefix(24))
        let cleanSub = subtitle.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanEra = eraName.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanDesc = descriptionText.trimmingCharacters(in: .whitespacesAndNewlines)

        let nationSpecs: [HistoricalNationSpec] = drafts.enumerated().map { idx, d in
            let st = Regimes.styles.first(where: { $0.id == d.styleId })
            let nName = d.name.trimmingCharacters(in: .whitespacesAndNewlines)
            let safeName = nName.isEmpty ? "第\(idx + 1)国" : nName
            let short = d.shortName.trimmingCharacters(in: .whitespacesAndNewlines)
            let safeShort = short.isEmpty ? String(safeName.prefix(2)) : short
            let cap = d.capitalName.trimmingCharacters(in: .whitespacesAndNewlines)
            let rName = d.rulerName.trimmingCharacters(in: .whitespacesAndNewlines)
            let rTitle = d.rulerTitle.trimmingCharacters(in: .whitespacesAndNewlines)
            return HistoricalNationSpec(
                id: d.id,
                name: safeName,
                shortName: safeShort,
                color: d.color,
                culture: d.culture,
                religion: d.religion,
                polity: st?.base ?? "Empire",
                style: st?.id ?? "empire",
                capitalLon: d.capitalLon,
                capitalLat: d.capitalLat,
                capitalName: cap.isEmpty ? "\(safeShort)都" : cap,
                anchors: d.anchors,
                rulerName: rName.isEmpty ? "开国之君" : rName,
                rulerTitle: rTitle.isEmpty ? (st?.title ?? "皇帝") : rTitle,
                rulerMilitary: 72,
                rulerAdmin: 72,
                rulerDiplo: 68,
                rulerCharisma: 72,
                rulerTraits: ["Ambitious"]
            )
        }

        var wars: [HistoricalWarSpec] = []
        for pair in allNationPairs() {
            if warPairs.contains(pairKey(pair.0.id, pair.1.id)) {
                wars.append(HistoricalWarSpec(attackerId: pair.0.id, defenderId: pair.1.id, casusBelli: "霸业争雄"))
            }
        }

        let encodedHeights = HistoricalScenarios.encodeHeights(editor.heights)
        let scenarioId = "local_\(Int(Date().timeIntervalSince1970))_\(UInt16.random(in: 1000...9999))"
        return HistoricalScenario(
            id: scenarioId,
            title: finalTitle,
            subtitle: cleanSub.isEmpty ? "\(region.title) · \(nationSpecs.count)国争霸" : cleanSub,
            region: region,
            year: parsedYear,
            eraName: cleanEra.isEmpty ? historicalYearText(parsedYear) : cleanEra,
            description: cleanDesc.isEmpty ? "玩家「\(finalAuthor)」自绘的历史舆图剧本。" : cleanDesc,
            author: finalAuthor,
            isOfficial: false,
            provinceCount: max(nationSpecs.count, min(480, editor.provinces)),
            customHeightsBase64: encodedHeights,
            customProvinceCells: editor.customProvinceCells,
            nations: nationSpecs,
            openingWars: wars,
            openingAlliances: [],
            tags: [region.badge, cleanEra.isEmpty ? "自绘" : cleanEra]
        )
    }

    private func saveLocallyAndPlay() {
        guard drafts.count >= 2 else {
            feedbackSuccess = false
            feedback = "请至少保留 2 个国家后再开玩"
            return
        }
        let sc = buildScenario()
        do {
            try LocalWorkshopStore.save(sc)
            GameFeel.shared.notify(.success)
            onPlayScenario(sc)
        } catch {
            feedbackSuccess = false
            feedback = "保存至本机失败：\(error.localizedDescription)"
            GameFeel.shared.notify(.error)
        }
    }

    private func uploadToCloud() {
        guard drafts.count >= 2 else {
            feedbackSuccess = false
            feedback = "请至少保留 2 个国家后再上传工坊"
            return
        }
        uploading = true
        feedback = nil
        let sc = buildScenario()
        let author = authorName.trimmingCharacters(in: .whitespacesAndNewlines)
        Task {
            try? LocalWorkshopStore.save(sc)
            do {
                let uploaded = try await OnlinePlatform.shared.uploadWorkshopScenario(sc, authorName: author.isEmpty ? nil : author)
                uploading = false
                feedbackSuccess = true
                feedback = "已发布至云端工坊「\(uploaded.title)」！所有玩家均可在「新世界 → 玩家工坊」中下载游玩。"
                GameFeel.shared.notify(.success)
            } catch {
                uploading = false
                feedbackSuccess = false
                feedback = "云端上传失败（已同步备份至本机自绘）：\(error.localizedDescription)"
                GameFeel.shared.notify(.error)
            }
        }
    }
}
