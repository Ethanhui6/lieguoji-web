import SwiftUI
import UIKit

// MARK: - 标题页极简热更进度条（纯 4.3 宣纸细墨风格，无阴影无金框）

struct HotpatchSyncBanner: View {
    @ObservedObject var platform: OnlinePlatform
    @ObservedObject var hotPack: HotPackManager

    var body: some View {
        if hotPack.updating {
            VStack(spacing: 5) {
                HStack(spacing: 6) {
                    Text(hotPack.statusMessage.isEmpty ? "正在游戏内满速热更新…" : hotPack.statusMessage)
                        .font(Theme.caption)
                        .foregroundStyle(Theme.ink)
                        .lineLimit(1)
                        .monospacedDigit()
                    Spacer(minLength: 4)
                    if hotPack.speedBytesPerSec > 10_240 {
                        Text(String(format: "%.1f MB/s", hotPack.speedBytesPerSec / 1_048_576.0))
                            .font(Theme.caption)
                            .foregroundStyle(Theme.jade)
                            .monospacedDigit()
                    }
                    Text("\(Int(hotPack.progress * 100))%")
                        .font(Theme.caption)
                        .foregroundStyle(Theme.seal)
                        .monospacedDigit()
                }
                InkBar(fraction: hotPack.progress, color: Theme.seal, height: 3)
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
            .background(Theme.paperLight.opacity(0.95), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).stroke(Theme.hairline, lineWidth: 0.75))
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

// MARK: - 「游戏内免换包资源热更新」弹窗（12 路自适应边缘加速 · SHA256 精确差分 · 即时热加载生效）

struct HotUpdateSheet: View {
    @ObservedObject var hotPack: HotPackManager
    var onApplied: (() async -> Void)? = nil
    @Environment(\.dismiss) private var dismiss

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
                        Group2 {
                            Row(label: "本次更新体积", value: hotPack.hasPendingUpdate ? hotPack.pendingSummaryText : "已是最新")
                            Divider2()
                            Row(label: "热更完整包大小", value: "\(HotPackManager.formatBytes(m.totalBytes))（\(m.files.count) 项）")
                            Divider2()
                            Row(
                                label: "当前加速节点",
                                value: hotPack.activeCDNName.isEmpty ? "自动竞速择优（Cloudflare 边缘优先）" : hotPack.activeCDNName
                            )
                            Divider2()
                            Row(label: "更新方式", value: "12 路并发 SHA256 增量热更 · 无需换包")
                        }
                        .padding(.horizontal, Theme.Layout.pageInset)

                        if !m.summary.isEmpty {
                            Text(m.summary)
                                .font(Theme.body)
                                .foregroundStyle(Theme.ink2)
                                .padding(.horizontal, Theme.Layout.pageInset)
                        }

                        SectionLabel("本次包含内容模块")
                        Group2 {
                            ForEach(Array(m.modules.enumerated()), id: \.element.id) { idx, mod in
                                if idx > 0 { Divider2() }
                                HStack(alignment: .center, spacing: 10) {
                                    VStack(alignment: .leading, spacing: 3) {
                                        Text(mod.name).font(Theme.serif(15)).foregroundStyle(Theme.ink)
                                        Text(mod.detail).font(Theme.caption).foregroundStyle(Theme.ink2).lineLimit(2)
                                    }
                                    Spacer(minLength: 8)
                                    EditorialValueText(mod.sizeText, size: 15, color: Theme.ink)
                                }
                                .padding(.horizontal, 4)
                                .padding(.vertical, 11)
                            }
                        }
                        .padding(.horizontal, Theme.Layout.pageInset)
                    }

                    if hotPack.updating || !hotPack.statusMessage.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            HStack(spacing: 8) {
                                if !hotPack.activeCDNName.isEmpty {
                                    Text(hotPack.activeCDNName)
                                        .font(Theme.caption)
                                        .foregroundStyle(Theme.jade)
                                        .padding(.horizontal, 7)
                                        .padding(.vertical, 2)
                                        .background(Theme.jade.opacity(0.09), in: Capsule())
                                }
                                if hotPack.updating && hotPack.speedBytesPerSec > 1024 {
                                    Text(String(format: "%.1f MB/s", hotPack.speedBytesPerSec / 1_048_576.0))
                                        .font(Theme.caption)
                                        .foregroundStyle(Theme.seal)
                                        .monospacedDigit()
                                }
                                Spacer()
                                if hotPack.updating {
                                    Button("暂停") { hotPack.cancelHotUpdate() }
                                        .font(Theme.caption)
                                        .foregroundStyle(Theme.seal)
                                }
                            }
                            Text(hotPack.statusMessage)
                                .font(Theme.caption)
                                .foregroundStyle(Theme.ink)
                                .monospacedDigit()
                                .fixedSize(horizontal: false, vertical: true)
                            if hotPack.updating || hotPack.progress > 0 {
                                InkBar(fraction: hotPack.progress, color: hotPack.progress >= 1 ? Theme.jade : Theme.seal, height: 4)
                            }
                        }
                        .padding(.horizontal, Theme.Layout.pageInset)
                    }

                    if let err = hotPack.errorMessage {
                        Text(err).font(Theme.label).foregroundStyle(Theme.seal)
                            .padding(.horizontal, Theme.Layout.pageInset)
                    }

                    VStack(spacing: 10) {
                        if hotPack.hasPendingUpdate {
                            SealButton(
                                title: hotPack.updating
                                    ? (hotPack.speedBytesPerSec > 10_240
                                       ? String(format: "满速更新中（%d%% · %.1f MB/s）", Int(hotPack.progress * 100), hotPack.speedBytesPerSec / 1_048_576.0)
                                       : "正在测速并下载（\(Int(hotPack.progress * 100))%）…")
                                    : "立即满速热更新（\(HotPackManager.formatBytes(hotPack.pendingBytes))）",
                                busy: hotPack.updating,
                                disabled: hotPack.updating
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
}

// MARK: - 客户端内核版本更新弹窗（8 路并行分块满速下载 · 多节点实时测速择优）

struct CloudUpdateSheet: View {
    @ObservedObject var platform: OnlinePlatform
    @Environment(\.openURL) private var openURL
    @Environment(\.dismiss) private var dismiss
    @State private var copiedLink = false
    @State private var selectedMirrorURL: String? = nil

    private let mirrorColumns = [
        GridItem(.flexible(), spacing: 8),
        GridItem(.flexible(), spacing: 8)
    ]

    var body: some View {
        ViewBoundary {
            if let info = platform.updateInfo {
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        SheetHeader(
                            title: info.hasAppUpdate ? "发现新版客户端" : "客户端已是最新",
                            subtitle: "v\(info.currentVersion) → v\(info.latestVersion)（构建 \(info.latestBuild)）",
                            seal: info.hasAppUpdate ? "新" : "阅"
                        )

                        Group2 {
                            Row(label: "当前版本", value: "v\(info.currentVersion)（构建 \(info.currentBuild)）")
                            Divider2()
                            Row(label: "最新版本", value: "v\(info.latestVersion)（构建 \(info.latestBuild)）")
                            Divider2()
                            Row(label: "安装包大小", value: String(format: "%.1f MB · %@", info.ipaSizeMB, info.releaseDate))
                            if !platform.activeDownloadNode.isEmpty {
                                Divider2()
                                Row(label: "当前加速节点", value: platform.activeDownloadNode)
                            }
                        }
                        .padding(.horizontal, Theme.Layout.pageInset)

                        // 多节点实时测速与一键切换
                        VStack(alignment: .leading, spacing: 10) {
                            HStack(alignment: .center) {
                                Text("加速下载节点")
                                    .font(Theme.serif(15.5))
                                    .foregroundStyle(Theme.ink)
                                Spacer()
                                EditorialTactileButton(
                                    title: platform.probingMirrors ? "测速中…" : "测速择优节点",
                                    icon: .speed,
                                    accent: true,
                                    compact: true,
                                    disabled: platform.probingMirrors || platform.downloadingIPA
                                ) {
                                    Task { await platform.probeDownloadMirrors() }
                                }
                            }

                            if platform.probingMirrors && platform.mirrorResults.isEmpty {
                                HStack(spacing: 8) {
                                    InkBusy(tint: Theme.seal, track: Theme.hairline).frame(width: 44)
                                    Text("正在并发测试 Cloudflare 边缘与全球镜像延迟与吞吐…")
                                        .font(Theme.caption)
                                        .foregroundStyle(Theme.ink2)
                                }
                                .padding(.vertical, 6)
                            } else if !platform.mirrorResults.isEmpty {
                                LazyVGrid(columns: mirrorColumns, spacing: 8) {
                                    ForEach(platform.mirrorResults) { mirror in
                                        mirrorPill(mirror)
                                    }
                                }
                            }
                        }
                        .padding(.horizontal, Theme.Layout.pageInset)

                        if !info.releaseNotes.isEmpty {
                            SectionLabel("本版更新志")
                            Group2 {
                                VStack(alignment: .leading, spacing: 10) {
                                    ForEach(Array(info.releaseNotes.enumerated()), id: \.offset) { idx, line in
                                        Text("\(idx + 1). \(line)")
                                            .font(Theme.body)
                                            .foregroundStyle(Theme.ink)
                                            .fixedSize(horizontal: false, vertical: true)
                                    }
                                }
                                .padding(.horizontal, 4)
                                .padding(.vertical, 12)
                            }
                            .padding(.horizontal, Theme.Layout.pageInset)
                        }

                        if platform.downloadingIPA || !platform.downloadDetail.isEmpty {
                            VStack(alignment: .leading, spacing: 7) {
                                HStack(spacing: 8) {
                                    if !platform.activeDownloadNode.isEmpty {
                                        Text(platform.activeDownloadNode)
                                            .font(Theme.caption)
                                            .foregroundStyle(Theme.jade)
                                            .padding(.horizontal, 7)
                                            .padding(.vertical, 2)
                                            .background(Theme.jade.opacity(0.09), in: Capsule())
                                    }
                                    if platform.downloadingIPA && platform.downloadSpeedMBs > 0.01 {
                                        Text(String(format: "%.1f MB/s", platform.downloadSpeedMBs))
                                            .font(Theme.caption)
                                            .foregroundStyle(Theme.seal)
                                            .monospacedDigit()
                                    }
                                    Spacer()
                                    if platform.downloadingIPA {
                                        Button("取消") { platform.cancelIPADownload() }
                                            .font(Theme.caption)
                                            .foregroundStyle(Theme.seal)
                                    }
                                }
                                Text(platform.downloadDetail)
                                    .font(Theme.caption)
                                    .foregroundStyle(Theme.ink)
                                    .monospacedDigit()
                                    .fixedSize(horizontal: false, vertical: true)
                                InkBar(fraction: platform.downloadProgress, color: platform.downloadProgress >= 1 ? Theme.jade : Theme.seal, height: 4)
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
                                    GameFeel.shared.notify(.success)
                                }
                            }

                            if !info.forceUpdate {
                                Button {
                                    platform.dismissCurrentUpdatePrompt()
                                    dismiss()
                                } label: {
                                    Text("稍后再说").font(Theme.label).foregroundStyle(Theme.ink2).frame(maxWidth: .infinity).padding(.vertical, 8)
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

    @ViewBuilder
    private func mirrorPill(_ mirror: MirrorProbeResult) -> some View {
        let isSelected = (selectedMirrorURL == mirror.url) || (selectedMirrorURL == nil && mirror.ok && platform.mirrorResults.first(where: { $0.ok })?.id == mirror.id)
        Button {
            guard mirror.ok, !platform.downloadingIPA else { return }
            GameFeel.shared.tap()
            selectedMirrorURL = mirror.url
        } label: {
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 4) {
                    Text(mirror.name)
                        .font(Theme.caption)
                        .foregroundStyle(mirror.ok ? (isSelected ? Theme.seal : Theme.ink) : Theme.ink2)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                    Spacer(minLength: 2)
                    if isSelected && mirror.ok {
                        PhosphorIcon(glyph: .check, size: 11, weight: .fill)
                            .foregroundStyle(Theme.seal)
                    }
                }
                if mirror.ok {
                    HStack(spacing: 6) {
                        if let spd = mirror.speedMBs {
                            Text(String(format: "%.1f MB/s", spd))
                                .font(Theme.caption)
                                .foregroundStyle(Theme.jade)
                                .monospacedDigit()
                        }
                        if let ms = mirror.latencyMs {
                            Text("\(ms) ms")
                                .font(Theme.caption)
                                .foregroundStyle(Theme.ink2)
                                .monospacedDigit()
                        }
                    }
                } else {
                    Text("暂不可达")
                        .font(Theme.caption)
                        .foregroundStyle(Theme.ink2.opacity(0.65))
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.horizontal, 10)
            .padding(.vertical, 8)
            .background(
                isSelected && mirror.ok ? Theme.seal.opacity(0.07) : Theme.paperLight.opacity(0.86),
                in: RoundedRectangle(cornerRadius: 8, style: .continuous)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .stroke(isSelected && mirror.ok ? Theme.seal.opacity(0.45) : Theme.hairline, lineWidth: isSelected && mirror.ok ? 1.0 : 0.75)
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
