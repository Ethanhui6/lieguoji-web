import SwiftUI
import UIKit

/// 向下兼容别名：允许以 `AppUpdateSheet` 或 `CloudUpdateSheet` 唤起客户端版本更新卷轴。
typealias AppUpdateSheet = CloudUpdateSheet

// MARK: - 宋版朱砂丝带进度条与共享测速格式化器

private struct SongProgressRibbon: View {
    let progress: Double
    var completed: Bool { progress >= 0.999 }

    var body: some View {
        let clamped = min(1.0, max(0.0, progress.isFinite ? progress : 0))
        ZStack(alignment: .leading) {
            Capsule()
                .fill(Theme.wash)
            if clamped > 0.002 {
                Capsule()
                    .fill(
                        LinearGradient(
                            colors: completed
                                ? [Theme.jade.opacity(0.85), Theme.jade]
                                : [Theme.seal.opacity(0.82), Theme.seal],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )
                    .scaleEffect(x: max(0.02, clamped), y: 1, anchor: .leading)
                    .animation(Motion.panel, value: clamped)
            }
        }
        .frame(height: 5.5)
        .clipShape(Capsule())
        .overlay(Capsule().strokeBorder(Theme.hairline, lineWidth: 0.5))
    }
}

private enum UpdateSpeedFormat {
    static func liveBytesPerSec(_ bps: Double) -> String {
        guard bps.isFinite, bps > 1024 else { return "" }
        let mb = bps / 1_048_576.0
        if mb >= 1.0 { return String(format: "%.1f MB/s", mb) }
        return "\(max(1, Int((bps / 1024.0).rounded()))) KB/s"
    }
}

// MARK: - 标题页极简热更进度条（纯 4.3 宣纸细墨风格）

struct HotpatchSyncBanner: View {
    @ObservedObject var platform: OnlinePlatform
    @ObservedObject var hotPack: HotPackManager

    var body: some View {
        if hotPack.updating {
            let speedStr = UpdateSpeedFormat.liveBytesPerSec(hotPack.speedBytesPerSec)
            VStack(spacing: 6) {
                HStack(spacing: 6) {
                    Text(hotPack.statusMessage.isEmpty ? "正在游戏内满速热更新…" : hotPack.statusMessage)
                        .font(Theme.caption)
                        .foregroundStyle(Theme.ink)
                        .lineLimit(1)
                        .monospacedDigit()
                    Spacer(minLength: 4)
                    if !speedStr.isEmpty {
                        Text(speedStr)
                            .font(Theme.caption)
                            .foregroundStyle(Theme.jade)
                            .monospacedDigit()
                    }
                    Text("\(Int(hotPack.progress * 100))%")
                        .font(Theme.caption)
                        .foregroundStyle(Theme.seal)
                        .monospacedDigit()
                }
                SongProgressRibbon(progress: hotPack.progress)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(Theme.paperLight.opacity(0.96), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).stroke(Theme.line, lineWidth: 0.75))
        } else if let text = platform.hotpatchBanner {
            HStack(spacing: 6) {
                PhosphorIcon(glyph: .check, size: 12, weight: .fill).foregroundStyle(Theme.jade)
                Text(text).font(Theme.caption).foregroundStyle(Theme.ink).lineLimit(1)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 6)
            .background(Theme.paperLight.opacity(0.95), in: Capsule())
            .overlay(Capsule().stroke(Theme.hairline, lineWidth: 0.75))
        }
    }
}

// MARK: - 「游戏内免换包资源热更新」弹窗（多源并发加速 · SHA256 增量差分 · 即时热加载生效）

struct HotUpdateSheet: View {
    @ObservedObject var hotPack: HotPackManager
    var onApplied: (() async -> Void)? = nil
    @Environment(\.dismiss) private var dismiss

    private var speedText: String {
        UpdateSpeedFormat.liveBytesPerSec(hotPack.speedBytesPerSec)
    }

    private var progressBytesText: String {
        let total = max(hotPack.pendingBytes, hotPack.downloadedBytes)
        guard total > 0 else { return "" }
        return "\(HotPackManager.formatBytes(hotPack.downloadedBytes)) / \(HotPackManager.formatBytes(total))"
    }

    var body: some View {
        ViewBoundary {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    SheetHeader(
                        title: "游戏内资源热更新",
                        subtitle: hotPack.manifest?.releaseTag ?? "免换包 · 下载完成即刻生效",
                        seal: "更"
                    )

                    if let m = hotPack.manifest {
                        // 宋版双线总览卷卡
                        VStack(alignment: .leading, spacing: 10) {
                            HStack(alignment: .center, spacing: 10) {
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(hotPack.hasPendingUpdate ? "待同步典藏资源包" : "本地典藏包已是最新")
                                        .font(Theme.serif(16.5))
                                        .foregroundStyle(Theme.ink)
                                    Text(hotPack.hasPendingUpdate ? hotPack.pendingSummaryText : "完整体积 \(HotPackManager.formatBytes(m.totalBytes))（\(m.files.count) 项）")
                                        .font(Theme.caption)
                                        .foregroundStyle(Theme.ink2)
                                        .monospacedDigit()
                                }
                                Spacer(minLength: 6)
                                PaperTag(
                                    text: hotPack.hasPendingUpdate ? "免换包热更" : "已同步",
                                    color: hotPack.hasPendingUpdate ? Theme.seal : Theme.jade,
                                    size: 11
                                )
                            }

                            Divider2()

                            HStack(spacing: 12) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text("加速线路")
                                        .font(Theme.caption)
                                        .foregroundStyle(Theme.ink2)
                                    Text(hotPack.activeCDNName.isEmpty ? "多源边缘自动择优" : hotPack.activeCDNName)
                                        .font(Theme.label)
                                        .foregroundStyle(Theme.jade)
                                        .lineLimit(1)
                                }
                                Spacer(minLength: 8)
                                VStack(alignment: .trailing, spacing: 2) {
                                    Text("校验方式")
                                        .font(Theme.caption)
                                        .foregroundStyle(Theme.ink2)
                                    Text("12 路并发 · SHA256 差分")
                                        .font(Theme.label)
                                        .foregroundStyle(Theme.ink)
                                        .lineLimit(1)
                                }
                            }

                            if !m.summary.isEmpty {
                                Divider2()
                                Text(m.summary)
                                    .font(Theme.label)
                                    .foregroundStyle(Theme.ink2)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                        }
                        .padding(14)
                        .background(Theme.paperLight, in: RoundedRectangle(cornerRadius: Theme.Control.cornerCard, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: Theme.Control.cornerCard, style: .continuous).strokeBorder(Theme.line, lineWidth: 0.75))
                        .overlay(
                            RoundedRectangle(cornerRadius: Theme.Control.cornerCard - 2.5, style: .continuous)
                                .strokeBorder(Theme.hairline, lineWidth: 0.5)
                                .padding(2.5)
                                .allowsHitTesting(false)
                        )
                        .padding(.horizontal, Theme.Layout.pageInset)

                        // 实时满速传输仪表卡
                        if hotPack.updating || hotPack.progress > 0 || !hotPack.statusMessage.isEmpty {
                            hotDownloadTelemetryCard
                                .padding(.horizontal, Theme.Layout.pageInset)
                        }

                        // 已生效资产实时自检面板（让每次 1GB+ 热更的 Metal GPU / 核心引擎 / 音画挂载状态清晰可见）
                        if !hotPack.activeAssetReport.isEmpty {
                            activeAssetSelfCheckSection
                                .padding(.horizontal, Theme.Layout.pageInset)
                        }

                        HStack {
                            SectionLabel("本次包含典藏模块（\(m.modules.count)）", inset: false)
                                .monospacedDigit()
                            Spacer()
                            if !hotPack.updating && m.modules.count > 1 && hotPack.selectedModuleIds.count < m.modules.count {
                                Button("全选模块") {
                                    GameFeel.shared.tap()
                                    hotPack.selectAllModules()
                                }
                                .font(Theme.caption)
                                .foregroundStyle(Theme.seal)
                            }
                        }
                        .padding(.horizontal, Theme.Layout.sectionInset)
                        Group2 {
                            ForEach(Array(m.modules.enumerated()), id: \.element.id) { idx, mod in
                                if idx > 0 { Divider2() }
                                let checked = hotPack.isModuleSelected(mod.id)
                                Button {
                                    guard !hotPack.updating else { return }
                                    GameFeel.shared.tap()
                                    hotPack.toggleModule(mod.id)
                                } label: {
                                    HStack(alignment: .center, spacing: 10) {
                                        RoundedRectangle(cornerRadius: 4, style: .continuous)
                                            .fill(checked ? Theme.seal : Color.clear)
                                            .frame(width: 18, height: 18)
                                            .overlay(
                                                RoundedRectangle(cornerRadius: 4, style: .continuous)
                                                    .stroke(checked ? Theme.seal : Theme.ink2.opacity(0.45), lineWidth: 1.2)
                                            )
                                            .overlay {
                                                if checked {
                                                    PhosphorIcon(glyph: .check, size: 10, weight: .fill)
                                                        .foregroundStyle(Theme.paperLight)
                                                }
                                            }
                                        VStack(alignment: .leading, spacing: 2.5) {
                                            Text(mod.name)
                                                .font(Theme.serif(15))
                                                .foregroundStyle(checked ? Theme.ink : Theme.ink2)
                                                .lineLimit(1)
                                                .minimumScaleFactor(0.82)
                                            Text(mod.detail)
                                                .font(Theme.caption)
                                                .foregroundStyle(Theme.ink2)
                                                .lineLimit(2)
                                        }
                                        Spacer(minLength: 8)
                                        EditorialValueText(mod.sizeText, size: 14.5, color: checked ? Theme.ink : Theme.ink2)
                                            .fixedSize(horizontal: true, vertical: false)
                                    }
                                    .padding(.horizontal, 4)
                                    .padding(.vertical, 10)
                                    .contentShape(Rectangle())
                                }
                                .buttonStyle(.plain)
                                .disabled(hotPack.updating)
                            }
                        }
                        .padding(.horizontal, Theme.Layout.pageInset)
                    } else if hotPack.updating || !hotPack.statusMessage.isEmpty {
                        hotDownloadTelemetryCard
                            .padding(.horizontal, Theme.Layout.pageInset)
                    }

                    if let err = hotPack.errorMessage {
                        HStack(spacing: 7) {
                            PhosphorIcon(glyph: .warning, size: 14, weight: .fill).foregroundStyle(Theme.seal)
                            Text(err).font(Theme.label).foregroundStyle(Theme.seal)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .padding(.horizontal, 12).padding(.vertical, 9)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Theme.seal.opacity(0.06), in: RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous).strokeBorder(Theme.seal.opacity(0.28), lineWidth: 0.7))
                        .padding(.horizontal, Theme.Layout.pageInset)
                    }

                    VStack(spacing: 10) {
                        if hotPack.hasPendingUpdate {
                            let targetBytes = hotPack.selectedPendingBytes > 0 ? hotPack.selectedPendingBytes : hotPack.pendingBytes
                            let noSelection = !hotPack.selectedModuleIds.isEmpty && hotPack.selectedPendingFiles.isEmpty
                            SealButton(
                                title: hotPack.updating
                                    ? (!speedText.isEmpty
                                       ? "满速更新中（\(Int(hotPack.progress * 100))% · \(speedText)）"
                                       : "正在测速并下载（\(Int(hotPack.progress * 100))%）…")
                                    : (noSelection ? "请至少勾选 1 个待同步模块" : "立即满速热更新（\(HotPackManager.formatBytes(targetBytes))）"),
                                busy: hotPack.updating,
                                disabled: hotPack.updating || noSelection
                            ) {
                                hotPack.startHotUpdate(onApplied: onApplied)
                            }
                        } else {
                            SealButton(title: "已全部生效 · 返回游戏") {
                                dismiss()
                            }
                        }

                        if hotPack.updating {
                            EditorialTactileButton(title: "转入后台高速下载 · 先进入游戏", icon: .play, compact: false, fullWidth: true) {
                                dismiss()
                            }
                        } else if hotPack.hasPendingUpdate {
                            Button {
                                hotPack.dismissPrompt()
                                dismiss()
                            } label: {
                                Text("稍后再更新")
                                    .font(Theme.label)
                                    .foregroundStyle(Theme.ink2)
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, 8)
                            }
                            .buttonStyle(.plain)
                        }
                    }
                    .padding(.horizontal, Theme.Layout.pageInset)
                }
                .padding(.bottom, 26)
            }
            .scrollIndicators(.hidden)
            .background(MemorialPaper().ignoresSafeArea())
        }
    }

    private var hotDownloadTelemetryCard: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                if hotPack.updating && !speedText.isEmpty {
                    Text(speedText)
                        .font(Theme.serif(19))
                        .foregroundStyle(Theme.seal)
                        .monospacedDigit()
                } else {
                    Text(hotPack.progress >= 1 ? "同步完成" : "\(Int(hotPack.progress * 100))%")
                        .font(Theme.serif(17))
                        .foregroundStyle(hotPack.progress >= 1 ? Theme.jade : Theme.ink)
                        .monospacedDigit()
                }
                if !progressBytesText.isEmpty {
                    Text(progressBytesText)
                        .font(Theme.caption)
                        .foregroundStyle(Theme.ink2)
                        .monospacedDigit()
                }
                Spacer(minLength: 6)
                if hotPack.updating {
                    Button {
                        GameFeel.shared.tap()
                        hotPack.cancelHotUpdate()
                    } label: {
                        Text("暂停")
                            .font(Theme.caption)
                            .foregroundStyle(Theme.seal)
                            .padding(.horizontal, 9).padding(.vertical, 3.5)
                            .background(Theme.seal.opacity(0.08), in: Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }

            SongProgressRibbon(progress: hotPack.progress)

            VStack(alignment: .leading, spacing: 5) {
                if !hotPack.activeCDNName.isEmpty {
                    HStack(spacing: 6) {
                        Text(hotPack.activeCDNName)
                            .font(Theme.caption)
                            .foregroundStyle(Theme.jade)
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 2.5)
                            .background(Theme.jade.opacity(0.09), in: Capsule())
                        Spacer(minLength: 4)
                        if hotPack.updating {
                            Text("\(Int(hotPack.progress * 100))%")
                                .font(Theme.caption)
                                .foregroundStyle(Theme.seal)
                                .monospacedDigit()
                                .fixedSize()
                        }
                    }
                }
                if !hotPack.statusMessage.isEmpty {
                    Text(hotPack.statusMessage)
                        .font(Theme.caption)
                        .foregroundStyle(Theme.ink2)
                        .monospacedDigit()
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
        .padding(13)
        .background(Theme.paperLight, in: RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous)
                .strokeBorder(hotPack.updating ? Theme.seal.opacity(0.32) : Theme.hairline, lineWidth: 0.75)
        )
    }

    private var activeAssetSelfCheckSection: some View {
        let activeCount = hotPack.activeAssetReport.filter(\.active).count
        let totalCount = hotPack.activeAssetReport.count
        return VStack(alignment: .leading, spacing: 8) {
            HStack {
                SectionLabel("已生效资产实时自检（\(activeCount)/\(totalCount)）", inset: false)
                    .monospacedDigit()
                Spacer()
                if hotPack.mountedActiveBytes > 0 {
                    Text("已挂载 \(HotPackManager.formatBytes(hotPack.mountedActiveBytes))")
                        .font(Theme.caption)
                        .foregroundStyle(Theme.jade)
                        .monospacedDigit()
                }
            }
            Group2 {
                ForEach(Array(hotPack.activeAssetReport.enumerated()), id: \.element.id) { idx, item in
                    if idx > 0 { Divider2() }
                    HStack(alignment: .top, spacing: 10) {
                        Circle()
                            .fill(item.active ? Theme.jade : Theme.ink2.opacity(0.30))
                            .frame(width: 8, height: 8)
                            .padding(.top, 5)
                        VStack(alignment: .leading, spacing: 2) {
                            HStack(spacing: 6) {
                                Text(item.title)
                                    .font(Theme.serif(14.5))
                                    .foregroundStyle(item.active ? Theme.ink : Theme.ink2)
                                Spacer(minLength: 4)
                                PaperTag(
                                    text: item.active ? (item.sizeBytes > 0 ? "已生效 · \(HotPackManager.formatBytes(item.sizeBytes))" : "已生效") : "待同步",
                                    color: item.active ? Theme.jade : Theme.ink2,
                                    size: 10
                                )
                            }
                            Text(item.detail)
                                .font(Theme.caption)
                                .foregroundStyle(Theme.ink2)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    .padding(.horizontal, 6)
                    .padding(.vertical, 8)
                }
            }
        }
        .onAppear { hotPack.refreshActiveAssetReport() }
    }
}

// MARK: - 客户端内核版本更新弹窗（多源并发满速分块下载 · 实时速率仪表 · 多版本更新志）

struct CloudUpdateSheet: View {
    @ObservedObject var platform: OnlinePlatform
    @Environment(\.openURL) private var openURL
    @Environment(\.dismiss) private var dismiss
    @State private var copiedLink = false
    @State private var copySerial = 0
    @State private var selectedMirrorURL: String? = nil
    @State private var expandedHistory = false

    private let mirrorColumns = [
        GridItem(.flexible(), spacing: 8),
        GridItem(.flexible(), spacing: 8)
    ]

    var body: some View {
        ViewBoundary {
            if let info = platform.updateInfo {
                let extraVersions = platform.cloudChangelog
                    .filter { $0.version != info.latestVersion && !$0.lines.isEmpty }
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        SheetHeader(
                            title: info.hasAppUpdate ? "发现新版客户端" : "客户端已是最新",
                            subtitle: "v\(info.currentVersion) → v\(info.latestVersion)（构建 \(info.latestBuild)）",
                            seal: info.hasAppUpdate ? "新" : "阅"
                        )

                        versionHeroCard(info)
                            .padding(.horizontal, Theme.Layout.pageInset)

                        // 实时多源并发下载仪表卡
                        if platform.downloadingIPA || !platform.downloadDetail.isEmpty {
                            downloadTelemetryCard(info)
                                .padding(.horizontal, Theme.Layout.pageInset)
                        }

                        // 多节点实时测速与一键切换矩阵
                        VStack(alignment: .leading, spacing: 10) {
                            HStack(alignment: .center) {
                                SectionLabel("加速下载线路", inset: false)
                                Spacer()
                                EditorialTactileButton(
                                    title: platform.probingMirrors ? "测速中…" : "重新测速",
                                    icon: .speed,
                                    accent: true,
                                    compact: true,
                                    disabled: platform.probingMirrors || platform.downloadingIPA
                                ) {
                                    Task { await platform.probeDownloadMirrors() }
                                }
                            }

                            if platform.probingMirrors && platform.mirrorResults.isEmpty {
                                HStack(spacing: 10) {
                                    InkBusy(tint: Theme.seal, track: Theme.hairline).frame(width: 44)
                                    Text("正在并发测试国内镜像、边缘节点与源站吞吐…")
                                        .font(Theme.caption)
                                        .foregroundStyle(Theme.ink2)
                                }
                                .padding(12)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .background(Theme.paperLight, in: RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous))
                                .overlay(RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous).strokeBorder(Theme.hairline, lineWidth: 0.7))
                            } else if !platform.mirrorResults.isEmpty {
                                LazyVGrid(columns: mirrorColumns, spacing: 8) {
                                    ForEach(Array(platform.mirrorResults.enumerated()), id: \.element.id) { idx, mirror in
                                        mirrorPill(mirror, isBest: idx == 0 && mirror.ok)
                                    }
                                }
                            }
                        }
                        .padding(.horizontal, Theme.Layout.pageInset)

                        // 多版本更新志卡片
                        if !info.releaseNotes.isEmpty || !extraVersions.isEmpty {
                            VStack(alignment: .leading, spacing: 10) {
                                SectionLabel("版本更新志", inset: false)

                                if !info.releaseNotes.isEmpty {
                                    changelogCard(
                                        version: info.latestVersion,
                                        date: info.releaseDate,
                                        tag: info.hasAppUpdate ? "新版" : "当前",
                                        lines: info.releaseNotes,
                                        accent: true
                                    )
                                }

                                if !extraVersions.isEmpty {
                                    let shownExtra = expandedHistory ? Array(extraVersions.prefix(4)) : Array(extraVersions.prefix(1))
                                    ForEach(shownExtra) { entry in
                                        changelogCard(
                                            version: entry.version,
                                            date: entry.date ?? "",
                                            tag: nil,
                                            lines: entry.lines,
                                            accent: false
                                        )
                                    }
                                    if extraVersions.count > 1 && !expandedHistory {
                                        Button {
                                            GameFeel.shared.tap()
                                            withAnimation(Motion.panel) { expandedHistory = true }
                                        } label: {
                                            HStack(spacing: 5) {
                                                Text("展开更多版本更新志（+\(min(3, extraVersions.count - 1)) 版）")
                                                    .font(Theme.caption)
                                                PhosphorIcon(glyph: .chevronDown, size: 11, weight: .light)
                                            }
                                            .foregroundStyle(Theme.ink2)
                                            .frame(maxWidth: .infinity)
                                            .padding(.vertical, 8)
                                            .background(Theme.paperLight.opacity(0.75), in: RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous))
                                            .overlay(RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous).strokeBorder(Theme.hairline, lineWidth: 0.7))
                                        }
                                        .buttonStyle(.plain)
                                    }
                                }
                            }
                            .padding(.horizontal, Theme.Layout.pageInset)
                        }

                        VStack(spacing: 10) {
                            SealButton(
                                title: platform.downloadingIPA
                                    ? (platform.downloadSpeedMBs > 0.05
                                       ? String(format: "满速下载中（%d%% · %.1f MB/s）", Int(platform.downloadProgress * 100), platform.downloadSpeedMBs)
                                       : "正在连接极速节点…")
                                    : "立即满速下载新版安装包",
                                busy: platform.downloadingIPA,
                                disabled: platform.downloadingIPA
                            ) {
                                platform.startIPADownload(preferredMirrorURL: selectedMirrorURL)
                            }

                            HStack(spacing: 10) {
                                if let web = info.preferredExternalURL {
                                    EditorialTactileButton(title: "浏览器下载", icon: .globe, compact: true, fullWidth: true) { openURL(web) }
                                }
                                EditorialTactileButton(
                                    title: copiedLink ? "已复制直链" : "复制直链",
                                    icon: copiedLink ? .check : .export,
                                    accent: copiedLink,
                                    compact: true,
                                    fullWidth: true
                                ) {
                                    let bestLink = bestCopyLink(for: info)
                                    UIPasteboard.general.string = bestLink
                                    copiedLink = true
                                    copySerial &+= 1
                                    GameFeel.shared.notify(.success)
                                }
                            }

                            if !info.forceUpdate {
                                Button {
                                    platform.dismissCurrentUpdatePrompt()
                                    dismiss()
                                } label: {
                                    Text("稍后再说")
                                        .font(Theme.label)
                                        .foregroundStyle(Theme.ink2)
                                        .frame(maxWidth: .infinity)
                                        .padding(.vertical, 8)
                                }
                                .buttonStyle(.plain)
                            }
                        }
                        .padding(.horizontal, Theme.Layout.pageInset)
                    }
                    .padding(.bottom, 26)
                }
                .scrollIndicators(.hidden)
                .background(MemorialPaper().ignoresSafeArea())
                .task {
                    if platform.mirrorResults.isEmpty && !platform.probingMirrors {
                        await platform.probeDownloadMirrors()
                    }
                    syncDefaultSelectedMirror()
                }
                .task(id: copySerial) {
                    guard copySerial > 0 else { return }
                    try? await Task.sleep(nanoseconds: 2_400_000_000)
                    guard !Task.isCancelled else { return }
                    copiedLink = false
                }
                .onChange(of: platform.mirrorResults) { _, _ in
                    syncDefaultSelectedMirror()
                }
                .sheet(item: Binding(
                    get: { platform.downloadedIPAURL.map(DownloadedIPAItem.init) },
                    set: { if $0 == nil { platform.downloadedIPAURL = nil } }
                )) { item in
                    ShareSheet(items: [item.url])
                }
            } else {
                VStack(spacing: 16) {
                    SheetHeader(
                        title: "检测云端版本",
                        subtitle: "v\(OnlinePlatform.currentVersionString)（构建 \(OnlinePlatform.currentBuildNumber)）",
                        seal: "更"
                    )
                    Text(platform.checkingUpdate ? "正在连接云端行宫同步版本信息…" : "尚未获取到最新版本信息，点击下方按钮立即检测并测速。")
                        .font(Theme.body)
                        .foregroundStyle(Theme.ink2)
                        .padding(.horizontal, Theme.Layout.pageInset)
                    SealButton(
                        title: platform.checkingUpdate ? "检测中…" : "立即检测并获取新版",
                        busy: platform.checkingUpdate,
                        disabled: platform.checkingUpdate
                    ) {
                        Task {
                            _ = await platform.bootstrap(manual: true, autoPrompt: false)
                            await platform.probeDownloadMirrors()
                        }
                    }
                    .padding(.horizontal, Theme.Layout.pageInset)
                    EditorialTactileButton(title: "关闭", compact: false, fullWidth: true) {
                        dismiss()
                    }
                    .padding(.horizontal, Theme.Layout.pageInset)
                    Spacer()
                }
                .background(MemorialPaper().ignoresSafeArea())
                .task {
                    _ = await platform.bootstrap(manual: true, autoPrompt: false)
                }
            }
        }
    }

    private func versionHeroCard(_ info: AppUpdateInfo) -> some View {
        VStack(alignment: .leading, spacing: 11) {
            HStack(alignment: .center, spacing: 10) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("当前版本").font(Theme.caption).foregroundStyle(Theme.ink2)
                    Text("v\(info.currentVersion)")
                        .font(Theme.serif(17))
                        .foregroundStyle(Theme.ink2)
                        .monospacedDigit()
                }
                PhosphorIcon(glyph: .chevronRight, size: 13, weight: .light)
                    .foregroundStyle(Theme.seal)
                VStack(alignment: .leading, spacing: 2) {
                    Text("云端新版").font(Theme.caption).foregroundStyle(Theme.seal)
                    Text("v\(info.latestVersion)")
                        .font(Theme.serif(19))
                        .foregroundStyle(Theme.seal)
                        .monospacedDigit()
                }
                Spacer(minLength: 6)
                VStack(alignment: .trailing, spacing: 3) {
                    PaperTag(text: "多源并发加速", color: Theme.jade, size: 10.5)
                    Text(String(format: "%.1f MB · Build %d", info.ipaSizeMB, info.latestBuild))
                        .font(Theme.caption)
                        .foregroundStyle(Theme.ink2)
                        .monospacedDigit()
                }
            }

            Divider2()

            HStack(spacing: 12) {
                HStack(spacing: 5) {
                    PhosphorIcon(glyph: .calendar, size: 12.5, weight: .light).foregroundStyle(Theme.ink2)
                    Text(info.releaseDate.isEmpty ? "正式版" : info.releaseDate)
                        .font(Theme.caption)
                        .foregroundStyle(Theme.ink2)
                        .monospacedDigit()
                }
                Spacer(minLength: 6)
                if !platform.activeDownloadNode.isEmpty {
                    HStack(spacing: 4) {
                        Circle().fill(Theme.jade).frame(width: 5.5, height: 5.5)
                        Text(platform.activeDownloadNode)
                            .font(Theme.caption)
                            .foregroundStyle(Theme.jade)
                            .lineLimit(1)
                    }
                } else if let best = platform.mirrorResults.first(where: { $0.ok }) {
                    HStack(spacing: 4) {
                        Circle().fill(Theme.jade).frame(width: 5.5, height: 5.5)
                        Text("优选：\(best.name)")
                            .font(Theme.caption)
                            .foregroundStyle(Theme.jade)
                            .lineLimit(1)
                    }
                }
            }
        }
        .padding(14)
        .background(Theme.paperLight, in: RoundedRectangle(cornerRadius: Theme.Control.cornerCard, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Theme.Control.cornerCard, style: .continuous).strokeBorder(Theme.line, lineWidth: 0.75))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Control.cornerCard - 2.5, style: .continuous)
                .strokeBorder(Theme.seal.opacity(0.18), lineWidth: 0.5)
                .padding(2.5)
                .allowsHitTesting(false)
        )
    }

    private func downloadTelemetryCard(_ info: AppUpdateInfo) -> some View {
        let downloadedMB = max(0.0, min(info.ipaSizeMB, info.ipaSizeMB * platform.downloadProgress))
        let pct = Int((min(1.0, max(0.0, platform.downloadProgress)) * 100.0).rounded())
        return VStack(alignment: .leading, spacing: 9) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                if platform.downloadingIPA && platform.downloadSpeedMBs > 0.01 {
                    Text(String(format: "%.1f MB/s", platform.downloadSpeedMBs))
                        .font(Theme.serif(20))
                        .foregroundStyle(Theme.seal)
                        .monospacedDigit()
                } else {
                    Text(platform.downloadProgress >= 1 ? "下载就绪" : "\(pct)%")
                        .font(Theme.serif(18))
                        .foregroundStyle(platform.downloadProgress >= 1 ? Theme.jade : Theme.ink)
                        .monospacedDigit()
                }
                Text(String(format: "%.1f / %.1f MB · %d%%", downloadedMB, info.ipaSizeMB, pct))
                    .font(Theme.caption)
                    .foregroundStyle(Theme.ink2)
                    .monospacedDigit()
                Spacer(minLength: 4)
                if platform.downloadingIPA {
                    Button {
                        GameFeel.shared.tap()
                        platform.cancelIPADownload()
                    } label: {
                        Text("取消")
                            .font(Theme.caption)
                            .foregroundStyle(Theme.seal)
                            .padding(.horizontal, 9).padding(.vertical, 3.5)
                            .background(Theme.seal.opacity(0.08), in: Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }

            SongProgressRibbon(progress: platform.downloadProgress)

            HStack(spacing: 6) {
                if !platform.activeDownloadNode.isEmpty {
                    Text(platform.activeDownloadNode)
                        .font(Theme.caption)
                        .foregroundStyle(Theme.jade)
                        .padding(.horizontal, 7).padding(.vertical, 2)
                        .background(Theme.jade.opacity(0.09), in: Capsule())
                }
                Text(platform.downloadDetail)
                    .font(Theme.caption)
                    .foregroundStyle(Theme.ink2)
                    .monospacedDigit()
                    .lineLimit(2)
            }
        }
        .padding(13)
        .background(Theme.paperLight, in: RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous)
                .strokeBorder(platform.downloadingIPA ? Theme.seal.opacity(0.35) : Theme.hairline, lineWidth: 0.75)
        )
    }

    private func changelogCard(version: String, date: String, tag: String?, lines: [String], accent: Bool) -> some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack(spacing: 7) {
                Text("v\(version)")
                    .font(Theme.serif(16.5))
                    .foregroundStyle(accent ? Theme.seal : Theme.ink)
                    .monospacedDigit()
                if let tag, !tag.isEmpty {
                    PaperTag(text: tag, color: accent ? Theme.seal : Theme.ink2, size: 10)
                }
                Spacer(minLength: 4)
                if !date.isEmpty {
                    Text(date)
                        .font(Theme.caption)
                        .foregroundStyle(Theme.ink2)
                        .monospacedDigit()
                }
            }

            Divider2()

            VStack(alignment: .leading, spacing: 7) {
                ForEach(Array(lines.enumerated()), id: \.offset) { idx, line in
                    HStack(alignment: .top, spacing: 7) {
                        Text("\(idx + 1).")
                            .font(Theme.caption)
                            .foregroundStyle(accent ? Theme.seal : Theme.ink2)
                            .monospacedDigit()
                            .frame(width: 16, alignment: .trailing)
                        Text(line)
                            .font(Theme.label)
                            .foregroundStyle(Theme.ink)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
        }
        .padding(13)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.paperLight.opacity(accent ? 0.96 : 0.78), in: RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous)
                .strokeBorder(accent ? Theme.seal.opacity(0.28) : Theme.hairline, lineWidth: 0.75)
        )
    }

    @ViewBuilder
    private func mirrorPill(_ mirror: MirrorProbeResult, isBest: Bool) -> some View {
        let isSelected = (selectedMirrorURL == mirror.url) || (selectedMirrorURL == nil && mirror.ok && platform.mirrorResults.first(where: { $0.ok })?.id == mirror.id)
        Button {
            guard mirror.ok, !platform.downloadingIPA else { return }
            GameFeel.shared.tap()
            selectedMirrorURL = mirror.url
            copiedLink = false
        } label: {
            VStack(alignment: .leading, spacing: 5) {
                HStack(spacing: 4) {
                    Circle()
                        .fill(mirror.ok ? (isBest ? Theme.jade : Theme.ink2.opacity(0.65)) : Theme.seal.opacity(0.45))
                        .frame(width: 5.5, height: 5.5)
                    Text(mirror.name)
                        .font(Theme.caption)
                        .foregroundStyle(mirror.ok ? (isSelected ? Theme.seal : Theme.ink) : Theme.ink2)
                        .lineLimit(1)
                        .minimumScaleFactor(0.78)
                    Spacer(minLength: 2)
                    if isSelected && mirror.ok {
                        PhosphorIcon(glyph: .check, size: 11, weight: .fill)
                            .foregroundStyle(Theme.seal)
                    } else if isBest {
                        Text("优")
                            .font(Theme.sans(10))
                            .foregroundStyle(Theme.jade)
                    }
                }
                if mirror.ok {
                    HStack(spacing: 5) {
                        Text(mirror.speedText)
                            .font(Theme.sans(11.5))
                            .foregroundStyle(Theme.jade)
                            .monospacedDigit()
                            .padding(.horizontal, 5.5).padding(.vertical, 1.5)
                            .background(Theme.jade.opacity(0.10), in: RoundedRectangle(cornerRadius: 4, style: .continuous))
                        if let ms = mirror.latencyMs {
                            Text("\(ms)ms")
                                .font(Theme.caption)
                                .foregroundStyle(Theme.ink2)
                                .monospacedDigit()
                        }
                    }
                } else {
                    Text(mirror.speedText)
                        .font(Theme.caption)
                        .foregroundStyle(Theme.ink2.opacity(0.65))
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 10)
            .padding(.vertical, 9)
            .background(
                isSelected && mirror.ok ? Theme.seal.opacity(0.065) : Theme.paperLight.opacity(0.9),
                in: RoundedRectangle(cornerRadius: 8, style: .continuous)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .stroke(isSelected && mirror.ok ? Theme.seal.opacity(0.48) : Theme.hairline, lineWidth: isSelected && mirror.ok ? 1.0 : 0.75)
            )
            .opacity(mirror.ok ? 1.0 : 0.55)
        }
        .buttonStyle(.plain)
        .disabled(!mirror.ok || platform.downloadingIPA)
    }

    private func syncDefaultSelectedMirror() {
        if let cur = selectedMirrorURL,
           platform.mirrorResults.contains(where: { $0.url == cur && $0.ok }) {
            return
        }
        selectedMirrorURL = platform.mirrorResults.first(where: { $0.ok })?.url
    }

    private func bestCopyLink(for info: AppUpdateInfo) -> String {
        if let chosen = selectedMirrorURL, !chosen.isEmpty { return chosen }
        if let fastest = platform.mirrorResults.first(where: { $0.ok })?.url, !fastest.isEmpty { return fastest }
        if let firstMirror = info.ipaMirrors?.first(where: { !$0.isEmpty }) { return firstMirror }
        if !info.directIpaUrl.isEmpty { return info.directIpaUrl }
        if !info.webDownloadUrl.isEmpty { return info.webDownloadUrl }
        return info.downloadUrl
    }

    private struct DownloadedIPAItem: Identifiable {
        let url: URL
        var id: URL { url }
    }
}
