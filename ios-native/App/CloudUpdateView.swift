import SwiftUI
import UIKit

// MARK: - 标题页启动自动热更进度丝带（静默拉取并应用云端热更包）

struct HotpatchSyncBanner: View {
    @ObservedObject var platform: OnlinePlatform

    var body: some View {
        if let text = platform.hotpatchBanner {
            VStack(spacing: 6) {
                HStack(spacing: 7) {
                    PhosphorIcon(glyph: platform.hotpatchProgress >= 1.0 ? .check : .refresh, size: 13, weight: .fill)
                        .foregroundStyle(platform.hotpatchProgress >= 1.0 ? Theme.jade : Theme.seal)
                    Text(text)
                        .font(Theme.kai(13))
                        .foregroundStyle(Theme.ink)
                        .lineLimit(1)
                    Spacer(minLength: 4)
                    Text("\(Int(platform.hotpatchProgress * 100))%")
                        .font(Theme.caption)
                        .foregroundStyle(Theme.ink2)
                        .monospacedDigit()
                }
                GeometryReader { geo in
                    ZStack(alignment: .leading) {
                        Capsule().fill(Theme.ink.opacity(0.10))
                        Capsule()
                            .fill(platform.hotpatchProgress >= 1.0 ? Theme.jade : Theme.seal)
                            .frame(width: max(6, geo.size.width * platform.hotpatchProgress))
                            .animation(Motion.panel, value: platform.hotpatchProgress)
                    }
                }
                .frame(height: 3.5)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 9)
            .background(Theme.paperLight.opacity(0.96), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(Theme.goldRim.opacity(0.65), lineWidth: 0.85))
            .transition(.move(edge: .top).combined(with: .opacity))
        }
    }
}

// MARK: - 「天诏 · 新版启卷」云端版本检测与一键更新弹窗

struct CloudUpdateSheet: View {
    @ObservedObject var platform: OnlinePlatform
    @Environment(\.openURL) private var openURL
    @State private var copiedLink = false

    var body: some View {
        ViewBoundary {
            if let info = platform.updateInfo {
                ScrollView {
                    VStack(alignment: .leading, spacing: 18) {
                        headerSection(info)
                        versionTransitionCard(info)
                            .padding(.horizontal, Theme.Layout.pageInset)

                        if !info.releaseNotes.isEmpty {
                            VStack(alignment: .leading, spacing: 10) {
                                EditorialSectionHeader(title: "天诏更新志", icon: .chronicle, trailing: info.releaseDate)
                                VStack(alignment: .leading, spacing: 10) {
                                    ForEach(Array(info.releaseNotes.enumerated()), id: \.offset) { idx, line in
                                        HStack(alignment: .top, spacing: 10) {
                                            Text("\(idx + 1)")
                                                .font(Theme.caption)
                                                .foregroundStyle(Theme.paperLight)
                                                .frame(width: 20, height: 20)
                                                .background(Theme.seal, in: Circle())
                                                .padding(.top, 2)
                                            Text(line)
                                                .font(Theme.body)
                                                .foregroundStyle(Theme.ink)
                                                .fixedSize(horizontal: false, vertical: true)
                                        }
                                    }
                                }
                                .padding(14)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .background(Theme.paperLight.opacity(0.85), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                                .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(Theme.hairline, lineWidth: 0.75))
                            }
                            .padding(.horizontal, Theme.Layout.pageInset)
                        }

                        if platform.downloadingIPA || !platform.downloadDetail.isEmpty {
                            downloadProgressCard
                                .padding(.horizontal, Theme.Layout.pageInset)
                        }

                        actionFooter(info)
                            .padding(.horizontal, Theme.Layout.pageInset)
                    }
                    .padding(.bottom, 28)
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

    private func headerSection(_ info: AppUpdateInfo) -> some View {
        ZStack(alignment: .bottom) {
            LinearGradient(
                colors: [Theme.seal.opacity(0.08), Theme.paper.opacity(0.0)],
                startPoint: .top, endPoint: .bottom
            )
            .frame(height: 118)
            VStack(spacing: 0) {
                SheetHeader(
                    title: info.hasAppUpdate ? "发现新版本" : "已是最新典藏版",
                    subtitle: info.hasAppUpdate ? "腾讯云专属节点检测到新版客户端" : "当前版本与云端热更均已同步至最新",
                    seal: info.hasAppUpdate ? "新" : "阅"
                )
            }
        }
    }

    private func versionTransitionCard(_ info: AppUpdateInfo) -> some View {
        VStack(spacing: 12) {
            HStack(spacing: 12) {
                VStack(spacing: 4) {
                    Text("当前版本").font(Theme.caption).foregroundStyle(Theme.ink2)
                    Text("v\(info.currentVersion)")
                        .font(Theme.serif(20)).foregroundStyle(Theme.ink).monospacedDigit()
                    Text("构建 \(info.currentBuild)").font(Theme.caption).foregroundStyle(Theme.ink2).monospacedDigit()
                }
                .frame(maxWidth: .infinity)

                PhosphorIcon(glyph: .chevronRight, size: 18, weight: .light)
                    .foregroundStyle(Theme.seal)

                VStack(spacing: 4) {
                    Text("云端最新").font(Theme.caption).foregroundStyle(Theme.seal)
                    Text("v\(info.latestVersion)")
                        .font(Theme.serif(22)).foregroundStyle(Theme.seal).monospacedDigit()
                    Text("构建 \(info.latestBuild)").font(Theme.caption).foregroundStyle(Theme.seal.opacity(0.8)).monospacedDigit()
                }
                .frame(maxWidth: .infinity)
            }

            EditorialDivider()

            HStack(spacing: 10) {
                LabelPill(
                    icon: .globe,
                    text: info.directIpaUrl.isEmpty ? "官方云端线路" : "腾讯云国内专线直连",
                    tint: Theme.jade
                )
                LabelPill(
                    icon: .archive,
                    text: String(format: "约 %.1f MB", info.ipaSizeMB),
                    tint: Theme.ink2
                )
                if info.forceUpdate {
                    LabelPill(icon: .warning, text: "重要必更", tint: Theme.seal)
                }
            }
        }
        .padding(16)
        .background(Theme.vellumGradient, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Theme.goldRim.opacity(0.68), lineWidth: 0.9))
    }

    private var downloadProgressCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(platform.downloadDetail)
                    .font(Theme.label)
                    .foregroundStyle(Theme.ink)
                    .monospacedDigit()
                Spacer()
                if platform.downloadingIPA {
                    Button("取消") { platform.cancelIPADownload() }
                        .font(Theme.caption).foregroundStyle(Theme.seal)
                }
            }
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule().fill(Theme.ink.opacity(0.10))
                    Capsule()
                        .fill(platform.downloadProgress >= 1.0 ? Theme.jade : Theme.seal)
                        .frame(width: max(8, geo.size.width * platform.downloadProgress))
                        .animation(Motion.panel, value: platform.downloadProgress)
                }
            }
            .frame(height: 6)
        }
        .padding(14)
        .background(Theme.paperLight, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(Theme.seal.opacity(0.28), lineWidth: 0.8))
    }

    private func actionFooter(_ info: AppUpdateInfo) -> some View {
        VStack(spacing: 10) {
            if !info.directIpaUrl.isEmpty {
                SealButton(
                    title: platform.downloadingIPA ? "国内专线极速下载中…" : "立即应用内极速更新（国内专线）",
                    busy: platform.downloadingIPA,
                    disabled: platform.downloadingIPA
                ) {
                    GameFeel.shared.tap()
                    platform.startIPADownload()
                }
            } else if let url = info.preferredExternalURL {
                SealButton(title: "前往云端下载最新安装包", busy: false, disabled: false) {
                    GameFeel.shared.tap()
                    openURL(url)
                }
            }

            HStack(spacing: 10) {
                if let web = info.preferredExternalURL {
                    EditorialTactileButton(title: "浏览器下载页", icon: .globe, compact: true, fullWidth: true) {
                        openURL(web)
                    }
                }
                EditorialTactileButton(
                    title: copiedLink ? "已复制直链" : "复制更新直链",
                    icon: copiedLink ? .check : .export,
                    accent: copiedLink,
                    compact: true,
                    fullWidth: true
                ) {
                    let link = !info.directIpaUrl.isEmpty ? info.directIpaUrl : (info.webDownloadUrl.isEmpty ? info.downloadUrl : info.webDownloadUrl)
                    UIPasteboard.general.string = link
                    copiedLink = true
                    GameFeel.shared.notify(.success)
                    Task { @MainActor in
                        try? await Task.sleep(nanoseconds: 2_000_000_000)
                        copiedLink = false
                    }
                }
            }

            if !info.forceUpdate {
                Button {
                    GameFeel.shared.tap()
                    platform.dismissCurrentUpdatePrompt()
                } label: {
                    Text("暂不更新，稍后再说")
                        .font(Theme.label)
                        .foregroundStyle(Theme.ink2)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 8)
                }
                .buttonStyle(.plain)
            }
        }
    }
}

private struct LabelPill: View {
    let icon: PhosphorGlyph
    let text: String
    let tint: Color

    var body: some View {
        HStack(spacing: 4) {
            PhosphorIcon(glyph: icon, size: 11.5, weight: .light)
            Text(text).font(Theme.caption).lineLimit(1)
        }
        .foregroundStyle(tint)
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(tint.opacity(0.09), in: Capsule())
    }
}
