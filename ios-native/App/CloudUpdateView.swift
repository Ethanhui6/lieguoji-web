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
                    Text(hotPack.statusMessage.isEmpty ? "正在游戏内热更新…" : hotPack.statusMessage)
                        .font(Theme.caption)
                        .foregroundStyle(Theme.ink)
                        .lineLimit(1)
                        .monospacedDigit()
                    Spacer(minLength: 4)
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

// MARK: - 「游戏内免换包资源热更新」弹窗（20MB+ 典藏内容包 · SHA256 精确差分 · 即时热加载生效）

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
                            Row(label: "更新方式", value: "游戏内 SHA256 增量热更 · 无需换包")
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
                            HStack {
                                Text(hotPack.statusMessage)
                                    .font(Theme.caption)
                                    .foregroundStyle(Theme.ink)
                                    .monospacedDigit()
                                Spacer()
                                if hotPack.updating {
                                    Button("暂停") { hotPack.cancelHotUpdate() }
                                        .font(Theme.caption).foregroundStyle(Theme.seal)
                                }
                            }
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
                                title: hotPack.updating ? "正在下载并校验（\(Int(hotPack.progress * 100))%）…" : "立即游戏内热更新（\(HotPackManager.formatBytes(hotPack.pendingBytes))）",
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

// MARK: - 客户端内核版本更新弹窗（极简 4.3 宣纸风，仅在底层原生框架升级时呈现）

struct CloudUpdateSheet: View {
    @ObservedObject var platform: OnlinePlatform
    @Environment(\.openURL) private var openURL
    @State private var copiedLink = false

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
                            VStack(alignment: .leading, spacing: 6) {
                                HStack {
                                    Text(platform.downloadDetail).font(Theme.caption).foregroundStyle(Theme.ink).monospacedDigit()
                                    Spacer()
                                    if platform.downloadingIPA {
                                        Button("取消") { platform.cancelIPADownload() }.font(Theme.caption).foregroundStyle(Theme.seal)
                                    }
                                }
                                InkBar(fraction: platform.downloadProgress, color: platform.downloadProgress >= 1 ? Theme.jade : Theme.seal, height: 4)
                            }
                            .padding(.horizontal, Theme.Layout.pageInset)
                        }

                        VStack(spacing: 10) {
                            if !info.directIpaUrl.isEmpty {
                                SealButton(
                                    title: platform.downloadingIPA ? "下载中…" : "立即下载新版安装包",
                                    busy: platform.downloadingIPA,
                                    disabled: platform.downloadingIPA
                                ) {
                                    platform.startIPADownload()
                                }
                            } else if let url = info.preferredExternalURL {
                                SealButton(title: "前往下载新版安装包") { openURL(url) }
                            }

                            HStack(spacing: 10) {
                                if let web = info.preferredExternalURL {
                                    EditorialTactileButton(title: "浏览器下载", icon: .globe, compact: true, fullWidth: true) { openURL(web) }
                                }
                                EditorialTactileButton(
                                    title: copiedLink ? "已复制链接" : "复制直链",
                                    icon: copiedLink ? .check : .export,
                                    accent: copiedLink,
                                    compact: true,
                                    fullWidth: true
                                ) {
                                    let link = !info.directIpaUrl.isEmpty ? info.directIpaUrl : (info.webDownloadUrl.isEmpty ? info.downloadUrl : info.webDownloadUrl)
                                    UIPasteboard.general.string = link
                                    copiedLink = true
                                    GameFeel.shared.notify(.success)
                                }
                            }

                            if !info.forceUpdate {
                                Button {
                                    platform.dismissCurrentUpdatePrompt()
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
                .sheet(item: Binding(
                    get: { platform.downloadedIPAURL.map(DownloadedIPAItem.init) },
                    set: { if $0 == nil { platform.downloadedIPAURL = nil } }
                )) { item in
                    ShareSheet(items: [item.url])
                }
            }
        }
    }

    private struct DownloadedIPAItem: Identifiable {
        let url: URL
        var id: URL { url }
    }
}
