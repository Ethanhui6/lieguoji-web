import SwiftUI
import Combine
import UIKit
import LieguojiCore

// MARK: - 「史官行宫」100% 极简 4.3 宣纸风网游云端中心（行宫 / 云档 / 更新 / 驿报 / 史榜 / 司礼监）

struct OnlineHubSheet: View {
    @ObservedObject var platform: OnlinePlatform
    @ObservedObject var hotPack = HotPackManager.shared
    @ObservedObject var model: GameModel
    var initialTab: String = "profile"
    var onOpenArchive: (() -> Void)? = nil
    @Environment(\.dismiss) private var dismiss

    @State private var tab: String = "profile"
    @State private var showAuth = false
    @State private var showBind = false
    @State private var showReleaseNotes = false
    @State private var showAppUpdate = false
    @State private var showHotUpdate = false
    @State private var toast: String?

    private var hasAnyUpdate: Bool {
        platform.updateInfo?.hasAppUpdate == true || hotPack.hasPendingUpdate
    }

    private var tabItems: [(String, String)] {
        var list: [(String, String)] = [
            ("profile", "行宫"),
            ("saves", "云档"),
            ("update", hasAnyUpdate ? "更新·新" : "更新"),
            ("notices", (platform.user?.unreadMailCount ?? 0) > 0 ? "驿报·新" : "驿报"),
            ("rank", "史榜")
        ]
        if platform.user?.isAdminAccount == true {
            list.append(("admin", "司礼监"))
        }
        return list
    }

    private var headerSeal: String {
        switch tab {
        case "admin": return "监"
        case "saves": return "卷"
        case "update": return "更"
        case "notices": return "报"
        case "rank": return "榜"
        default: return "宫"
        }
    }

    private var headerSubtitle: String {
        if let srv = platform.server {
            let rtt = platform.apiRTTMs.map { " · \($0)ms" } ?? ""
            return "\(srv.name) · \(srv.onlineCount) 人在线\(rtt)"
        }
        return "云端账号 · 云档同步 · 极速更新中心"
    }

    var body: some View {
        ViewBoundary {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    SheetHeader(
                        title: tab == "admin" ? "御前司礼监" : "史官行宫",
                        subtitle: headerSubtitle,
                        seal: headerSeal
                    )

                    ChipPicker(items: tabItems, selection: $tab)
                        .padding(.horizontal, Theme.Layout.pageInset)

                    if let toast {
                        HStack(spacing: 6) {
                            PhosphorIcon(glyph: .info, size: 13, weight: .light)
                                .foregroundStyle(Theme.seal)
                            Text(toast)
                                .font(Theme.label)
                                .foregroundStyle(Theme.ink)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Theme.paperLight, in: RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous).stroke(Theme.seal.opacity(0.28), lineWidth: 0.7))
                        .padding(.horizontal, Theme.Layout.pageInset)
                    }

                    switch tab {
                    case "saves":
                        HubSavesTabView(
                            platform: platform,
                            model: model,
                            onOpenAuth: { showAuth = true },
                            onOpenArchive: {
                                dismiss()
                                onOpenArchive?()
                            },
                            onDismiss: { dismiss() },
                            onToast: showToast
                        )
                    case "update":
                        HubUpdateTabView(
                            platform: platform,
                            hotPack: hotPack,
                            model: model,
                            onOpenAppUpdate: { showAppUpdate = true },
                            onOpenHotUpdate: { showHotUpdate = true },
                            onShowNotes: { showReleaseNotes = true },
                            onToast: showToast
                        )
                    case "notices":
                        HubNoticesTabView(
                            platform: platform,
                            onOpenAuth: { showAuth = true },
                            onToast: showToast
                        )
                    case "rank":
                        HubLeaderboardTabView(
                            platform: platform,
                            model: model,
                            onOpenAuth: { showAuth = true },
                            onToast: showToast
                        )
                    case "admin":
                        if platform.user?.isAdminAccount == true {
                            HubAdminTabView(platform: platform, hotPack: hotPack, onToast: showToast)
                        }
                    default:
                        HubProfileTabView(
                            platform: platform,
                            hotPack: hotPack,
                            model: model,
                            onOpenAuth: { showAuth = true },
                            onOpenBind: { showBind = true },
                            onOpenAdmin: { tab = "admin" },
                            onOpenSavesTab: { tab = "saves" },
                            onOpenAppUpdate: { showAppUpdate = true },
                            onOpenHotUpdate: { showHotUpdate = true },
                            onShowNotes: { showReleaseNotes = true },
                            onOpenArchive: {
                                dismiss()
                                onOpenArchive?()
                            },
                            onToast: showToast
                        )
                    }
                }
                .padding(.bottom, 28)
            }
            .scrollIndicators(.hidden)
            .background(MemorialPaper().ignoresSafeArea())
            .onAppear { tab = initialTab }
            .task {
                if platform.isLoggedIn { await platform.refreshInbox() }
                await platform.refreshLeaderboard()
            }
            .sheet(isPresented: $showAuth) {
                AuthPortalSheet(platform: platform)
                    .presentationDetents([.fraction(0.89)])
                    .presentationCornerRadius(Theme.Control.cornerSheet)
                    .presentationBackground { MemorialPaper() }
                    .presentationDragIndicator(.hidden)
            }
            .sheet(isPresented: $showBind) {
                BindGuestSheet(platform: platform)
                    .presentationDetents([.medium])
                    .presentationCornerRadius(Theme.Control.cornerSheet)
                    .presentationBackground { MemorialPaper() }
                    .presentationDragIndicator(.hidden)
            }
            .sheet(isPresented: $showReleaseNotes) {
                ReleaseNotesSheet()
                    .background(MemorialPaper().ignoresSafeArea())
                    .presentationDetents([.fraction(0.89)])
                    .presentationCornerRadius(Theme.Control.cornerSheet)
                    .presentationBackground { MemorialPaper() }
                    .presentationDragIndicator(.hidden)
            }
            .sheet(isPresented: $showAppUpdate) {
                HubAppUpdateSheetContainer(platform: platform)
                    .interactiveDismissDisabled(platform.updateInfo?.forceUpdate == true)
                    .presentationDetents([.fraction(0.88)])
                    .presentationCornerRadius(Theme.Control.cornerSheet)
                    .presentationBackground { MemorialPaper() }
                    .presentationDragIndicator(.hidden)
            }
            .sheet(isPresented: $showHotUpdate) {
                HotUpdateSheet(hotPack: hotPack) {
                    await model.applyCloud()
                }
                .presentationDetents([.fraction(0.86)])
                .presentationCornerRadius(Theme.Control.cornerSheet)
                .presentationBackground { MemorialPaper() }
                .presentationDragIndicator(.hidden)
            }
        }
    }

    private func showToast(_ msg: String) {
        toast = msg
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 3_000_000_000)
            if toast == msg { toast = nil }
        }
    }
}

// MARK: - 页内直弹客户端更新容器（确保 updateInfo 尚未就绪时亦永不白屏）

private struct HubAppUpdateSheetContainer: View {
    @ObservedObject var platform: OnlinePlatform
    @Environment(\.dismiss) private var dismiss
    @State private var fetching = false

    var body: some View {
        Group {
            if platform.updateInfo != nil {
                CloudUpdateSheet(platform: platform)
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 16) {
                        SheetHeader(
                            title: "客户端版本检测",
                            subtitle: AppVersion.text,
                            seal: "新"
                        )
                        Group2 {
                            HStack(spacing: 10) {
                                if fetching || platform.checkingUpdate {
                                    InkBusy().frame(width: 24, height: 24)
                                    Text("正在获取云端最新版本信息…")
                                        .font(Theme.body)
                                        .foregroundStyle(Theme.ink2)
                                } else {
                                    PhosphorIcon(glyph: .warning, size: 17, weight: .light)
                                        .foregroundStyle(Theme.seal)
                                    Text("暂未获取到版本元数据，请检查网络后重新检测。")
                                        .font(Theme.body)
                                        .foregroundStyle(Theme.ink2)
                                        .fixedSize(horizontal: false, vertical: true)
                                }
                            }
                            .padding(.horizontal, 4)
                            .padding(.vertical, 14)
                        }
                        .padding(.horizontal, Theme.Layout.pageInset)

                        VStack(spacing: 10) {
                            SealButton(title: fetching ? "检测中…" : "重新检测云端版本", busy: fetching, disabled: fetching) {
                                Task {
                                    fetching = true
                                    _ = await platform.bootstrap(manual: true, autoPrompt: false)
                                    fetching = false
                                }
                            }
                            EditorialTactileButton(title: "关闭", compact: false, fullWidth: true) {
                                dismiss()
                            }
                        }
                        .padding(.horizontal, Theme.Layout.pageInset)
                    }
                    .padding(.bottom, 26)
                }
                .background(MemorialPaper().ignoresSafeArea())
                .task {
                    guard platform.updateInfo == nil else { return }
                    fetching = true
                    _ = await platform.bootstrap(manual: true, autoPrompt: false)
                    fetching = false
                }
            }
        }
        .onReceive(platform.$showUpdateSheet.dropFirst()) { shown in
            if !shown { dismiss() }
        }
    }
}

// MARK: - 页签一：史官行宫（名帖、快捷指令、算力引擎直控与实时遥测）

private struct HubProfileTabView: View {
    @ObservedObject var platform: OnlinePlatform
    @ObservedObject var hotPack: HotPackManager
    @ObservedObject var model: GameModel
    let onOpenAuth: () -> Void
    let onOpenBind: () -> Void
    let onOpenAdmin: () -> Void
    let onOpenSavesTab: () -> Void
    let onOpenAppUpdate: () -> Void
    let onOpenHotUpdate: () -> Void
    let onShowNotes: () -> Void
    let onOpenArchive: () -> Void
    let onToast: (String) -> Void

    @State private var editing = false
    @State private var editNick = ""
    @State private var editBio = ""
    @State private var editSealChar = "龙"
    @State private var editSealStyle = "cinnabar"
    @State private var savingProfile = false
    @State private var checkinBusy = false
    @State private var syncBusy = false
    @State private var probeBusy = false
    @State private var checkBusy = false
    @State private var confirmLogout = false

    private var engineStatusText: String {
        if model.remoteAddress != nil {
            let rtt = model.remoteRTTMs.map { " · \($0)ms" } ?? ""
            let kb = (model.remoteFrameKB ?? 0) > 0 ? String(format: " · %.1fKB/帧", model.remoteFrameKB ?? 0) : ""
            return "云推 v9 运行中\(rtt)\(kb)"
        }
        if model.remoteReconnecting {
            return "云推 v9 无感续连中…"
        }
        if !model.autoRemote {
            return "本机满帧直演 · 0ms 零延迟"
        }
        if model.state == nil {
            return platform.server?.computeOnline == true ? "云推 v9 就绪（进图自动接入）" : "本机待命（云服暂离线）"
        }
        return "本机运行中（可重连云推 v9）"
    }

    private var bestMirrorHint: String {
        if probeBusy || platform.probingMirrors { return "正在测速全网节点…" }
        if let best = platform.mirrorResults.first(where: { $0.ok }) {
            let lat = best.latencyMs.map { "\($0)ms" } ?? ""
            let spd = best.speedMBs.map { String(format: " · %.1fMB/s", $0) } ?? ""
            return "\(best.name) \(lat)\(spd)"
        }
        return "一键检测最快下载源"
    }

    private var updateTileHint: String {
        if checkBusy || platform.checkingUpdate { return "正在检测云端版本…" }
        if let upd = platform.updateInfo, upd.hasAppUpdate {
            return "发现 v\(upd.latestVersion) · 点击更新"
        }
        if hotPack.hasPendingUpdate {
            return "热更包 \(HotPackManager.formatBytes(hotPack.pendingBytes))"
        }
        return "当前 v\(OnlinePlatform.currentVersionString) · 点击检测"
    }

    var body: some View {
        ViewBoundary {
            VStack(alignment: .leading, spacing: 14) {
                profileCard
                quickActionGrid
                computeControlCard
                bottomBar
            }
            .confirmationDialog("退出当前云端账号？本地存档不受影响。", isPresented: $confirmLogout, titleVisibility: .visible) {
                Button("退出登临", role: .destructive) {
                    Task { await platform.logout(); onToast("已退出账号") }
                }
                Button("取消", role: .cancel) {}
            }
        }
    }

    @ViewBuilder private var profileCard: some View {
        if let user = platform.user, platform.isLoggedIn {
            Group2 {
                VStack(alignment: .leading, spacing: 12) {
                    HStack(alignment: .center, spacing: 12) {
                        PlayerSealBadge(char: user.sealChar, style: user.sealStyle, size: 48, filled: true)
                        VStack(alignment: .leading, spacing: 3) {
                            HStack(spacing: 6) {
                                Text(user.nickname).font(Theme.serif(19)).foregroundStyle(Theme.ink).lineLimit(1)
                                Text(user.isAdminAccount ? "管理员" : (user.isGuest ? "游客" : user.id))
                                    .font(Theme.caption)
                                    .foregroundStyle(user.isAdminAccount || user.isGuest ? Theme.seal : Theme.ink2)
                            }
                            Text(user.bio).font(Theme.caption).foregroundStyle(Theme.ink2).lineLimit(1)
                            Text("\(user.rank.grade) · \(user.rank.title) · 功勋 \(user.exp)")
                                .font(Theme.caption).foregroundStyle(Theme.seal).monospacedDigit()
                        }
                        Spacer(minLength: 4)
                        Button {
                            GameFeel.shared.tap()
                            editNick = user.nickname; editBio = user.bio
                            editSealChar = user.sealChar; editSealStyle = user.sealStyle
                            editing.toggle()
                        } label: {
                            PhosphorIcon(glyph: .edit, size: 16, weight: .light).foregroundStyle(Theme.ink2)
                                .frame(width: 32, height: 32)
                        }
                        .buttonStyle(.plain)
                    }

                    VStack(alignment: .leading, spacing: 4) {
                        HStack {
                            Text(user.rank.nextTitle.isEmpty ? "一代史圣 · 满秩" : "晋升「\(user.rank.nextTitle)」")
                                .font(Theme.caption).foregroundStyle(Theme.ink2)
                            Spacer()
                            Text(user.rank.nextTitle.isEmpty ? "满秩" : "\(user.exp) / \(user.rank.nextExp)")
                                .font(Theme.caption).foregroundStyle(Theme.ink2).monospacedDigit()
                        }
                        InkBar(fraction: user.rank.progress, color: Theme.seal, height: 3.5)
                    }

                    Divider2()

                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(user.checkedInToday ? "今日已临朝落印" : "每日临朝签到").font(Theme.body).foregroundStyle(Theme.ink)
                            Text("连签 \(user.checkinStreak) 日 · 累计 \(user.totalCheckins) 日")
                                .font(Theme.caption).foregroundStyle(Theme.ink2).monospacedDigit()
                        }
                        Spacer()
                        EditorialTactileButton(
                            title: checkinBusy ? "落印中…" : (user.checkedInToday ? "已落印" : "签到 +15"),
                            icon: user.checkedInToday ? .check : .stamp,
                            accent: user.checkedInToday,
                            solid: !user.checkedInToday,
                            compact: true,
                            disabled: checkinBusy || user.checkedInToday
                        ) {
                            Task {
                                checkinBusy = true
                                let res = await platform.dailyCheckin()
                                checkinBusy = false
                                GameFeel.shared.notify(res.ok ? .success : .warning)
                                onToast(res.message)
                            }
                        }
                    }
                }
                .padding(.horizontal, 4).padding(.vertical, 12)
            }
            .padding(.horizontal, Theme.Layout.pageInset)

            if user.isAdminAccount {
                EditorialTactileButton(title: "进入御前司礼监 · 管理员控制台", icon: .crown, solid: true, fullWidth: true) {
                    onOpenAdmin()
                }
                .padding(.horizontal, Theme.Layout.pageInset)
            }

            if user.isGuest {
                Group2 {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("当前为游客身份").font(Theme.body).foregroundStyle(Theme.ink)
                            Text("立籍转正后跨设备同步 20 卷云档，立赠 +20 功勋").font(Theme.caption).foregroundStyle(Theme.ink2)
                        }
                        Spacer()
                        EditorialTactileButton(title: "立籍转正", solid: true, compact: true) { onOpenBind() }
                    }
                    .padding(.horizontal, 4).padding(.vertical, 11)
                }
                .padding(.horizontal, Theme.Layout.pageInset)
            }

            if editing {
                SectionLabel("修缮名帖与御印")
                Group2 {
                    VStack(spacing: 10) {
                        TextField("", text: $editNick, prompt: Text("雅号（最多16字）").foregroundColor(Theme.ink2.opacity(0.55))).paperField()
                        TextField("", text: $editBio, prompt: Text("志言（最多48字）").foregroundColor(Theme.ink2.opacity(0.55))).paperField()
                    }
                    .padding(.vertical, 10)
                }
                .padding(.horizontal, Theme.Layout.pageInset)
                SealCustomizerRow(sealChar: $editSealChar, sealStyle: $editSealStyle)
                    .padding(.horizontal, Theme.Layout.pageInset)
                HStack(spacing: 10) {
                    EditorialTactileButton(title: "收起", compact: true, fullWidth: true) { editing = false }
                    EditorialTactileButton(title: savingProfile ? "保存中…" : "落印保存", solid: true, compact: true, fullWidth: true, disabled: savingProfile) {
                        Task {
                            savingProfile = true
                            let err = await platform.updateProfile(nickname: editNick, bio: editBio, sealChar: editSealChar, sealStyle: editSealStyle)
                            savingProfile = false
                            if let err { onToast(err) } else { editing = false; onToast("名帖与御印已更新") }
                        }
                    }
                }
                .padding(.horizontal, Theme.Layout.pageInset)
            }
        } else {
            Group2 {
                VStack(alignment: .leading, spacing: 12) {
                    Text("登临云端行宫，解锁 20 卷专属高速云档、每日签到、定制御印与全服天下史榜。")
                        .font(Theme.body).foregroundStyle(Theme.ink2)
                    SealButton(title: "前往列国登临阁（登录 / 注册）") { onOpenAuth() }
                }
                .padding(.horizontal, 4).padding(.vertical, 12)
            }
            .padding(.horizontal, Theme.Layout.pageInset)
        }
    }

    private var quickActionGrid: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionLabel("行宫快捷指令")
            LazyVGrid(columns: [GridItem(.flexible(), spacing: 10), GridItem(.flexible(), spacing: 10)], spacing: 10) {
                quickTile(
                    title: syncBusy ? "正在同步…" : "立即同步云档",
                    detail: (model.state == nil && !model.hasSave) ? "前往查看已有云档" : "压缩上传当前世界",
                    icon: .save,
                    highlight: false,
                    disabled: syncBusy
                ) {
                    if model.state == nil && !model.hasSave {
                        onOpenSavesTab()
                        return
                    }
                    Task {
                        syncBusy = true
                        let res = await model.uploadCurrentToCloud()
                        syncBusy = false
                        switch res {
                        case .success(let card):
                            await platform.refreshUserProfile()
                            GameFeel.shared.notify(.success)
                            onToast("已同步云档「\(card.title)」（\(card.sizeText)）")
                        case .failure(let err):
                            GameFeel.shared.notify(.error)
                            onToast(err.localizedDescription)
                        }
                    }
                }

                quickTile(
                    title: (probeBusy || platform.probingMirrors) ? "全网测速中…" : "全网节点测速",
                    detail: bestMirrorHint,
                    icon: .speed,
                    highlight: false,
                    disabled: probeBusy || platform.probingMirrors
                ) {
                    Task {
                        probeBusy = true
                        let ms = await platform.pingServer()
                        await platform.probeDownloadMirrors()
                        probeBusy = false
                        let pingStr = ms.map { "平台 \($0)ms" } ?? "平台测速超时"
                        if let best = platform.mirrorResults.first(where: { $0.ok }) {
                            let lat = best.latencyMs.map { "\($0)ms" } ?? ""
                            let spd = best.speedMBs.map { String(format: " · %.1f MB/s", $0) } ?? ""
                            GameFeel.shared.notify(.success)
                            onToast("\(pingStr) · 最快下载源：\(best.name)（\(lat)\(spd)）")
                        } else {
                            onToast("\(pingStr) · 节点测速完成")
                        }
                    }
                }

                quickTile(
                    title: checkBusy ? "检测更新中…" : "检查版本更新",
                    detail: updateTileHint,
                    icon: .refresh,
                    highlight: platform.updateInfo?.hasAppUpdate == true || hotPack.hasPendingUpdate,
                    disabled: checkBusy || platform.checkingUpdate || hotPack.checking
                ) {
                    if platform.updateInfo?.hasAppUpdate == true {
                        onOpenAppUpdate()
                        return
                    }
                    if hotPack.hasPendingUpdate {
                        onOpenHotUpdate()
                        return
                    }
                    Task {
                        checkBusy = true
                        let cfgApplied = await platform.bootstrap(manual: true, autoPrompt: false)
                        if cfgApplied { await model.applyCloud() }
                        let hasPack = await hotPack.checkManifest(autoPrompt: false)
                        checkBusy = false
                        if platform.updateInfo?.hasAppUpdate == true {
                            onOpenAppUpdate()
                        } else if hasPack {
                            onOpenHotUpdate()
                        } else {
                            GameFeel.shared.notify(.success)
                            onToast("客户端 v\(OnlinePlatform.currentVersionString) 与热更资源均已是最新")
                        }
                    }
                }

                quickTile(
                    title: "历代更新志",
                    detail: "查看 v\(OnlinePlatform.currentVersionString) 及全量历史",
                    icon: .chronicle,
                    highlight: false,
                    disabled: false
                ) {
                    onShowNotes()
                }
            }
            .padding(.horizontal, Theme.Layout.pageInset)
        }
    }

    private func quickTile(title: String, detail: String, icon: PhosphorGlyph, highlight: Bool, disabled: Bool, action: @escaping () -> Void) -> some View {
        Button {
            GameFeel.shared.tap()
            action()
        } label: {
            VStack(alignment: .leading, spacing: 7) {
                HStack {
                    PhosphorIcon(glyph: icon, size: 17, weight: highlight ? .fill : .light)
                        .foregroundStyle(highlight ? Theme.seal : Theme.ink)
                    Spacer()
                    if highlight {
                        Circle().fill(Theme.seal).frame(width: 6, height: 6)
                    } else {
                        PhosphorIcon(glyph: .chevronRight, size: 11, weight: .light)
                            .foregroundStyle(Theme.ink2.opacity(0.6))
                    }
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(Theme.serif(15))
                        .foregroundStyle(highlight ? Theme.seal : Theme.ink)
                        .lineLimit(1)
                        .minimumScaleFactor(0.84)
                    Text(detail)
                        .font(Theme.caption)
                        .foregroundStyle(Theme.ink2)
                        .lineLimit(1)
                        .minimumScaleFactor(0.76)
                        .monospacedDigit()
                }
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(highlight ? Theme.seal.opacity(0.055) : Theme.paperLight, in: RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous)
                    .stroke(highlight ? Theme.seal.opacity(0.32) : Theme.hairline, lineWidth: 0.75)
            )
            .opacity(disabled ? 0.5 : 1.0)
            .contentShape(RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous))
        }
        .buttonStyle(PressStyle())
        .disabled(disabled)
    }

    private var computeControlCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionLabel("算力引擎与云服态势")
            Group2 {
                VStack(alignment: .leading, spacing: 8) {
                    HStack {
                        Text("演算引擎模式").font(Theme.body).foregroundStyle(Theme.ink)
                        Spacer()
                        Text(model.autoRemote ? "云推 v9 · 省电挂机" : "本机直演 · 0ms 延迟")
                            .font(Theme.caption)
                            .foregroundStyle(model.autoRemote ? Theme.jade : Theme.seal)
                    }
                    ChipPicker(
                        items: [(false, "本机满帧直演（推荐看海）"), (true, "云端推流 v9（省电挂机）")],
                        selection: Binding(
                            get: { model.autoRemote },
                            set: { useCloud in
                                model.objectWillChange.send()
                                model.autoRemote = useCloud
                                if !useCloud {
                                    if model.remoteAddress != nil {
                                        Task {
                                            await model.disconnectRemote()
                                            onToast("已切换至本机满帧直演（0ms 零延迟）")
                                        }
                                    } else {
                                        onToast("已切换至本机满帧直演（0ms 零延迟）")
                                    }
                                } else {
                                    if model.remoteAddress == nil && model.state != nil {
                                        Task {
                                            let ok = await model.findComputerNow()
                                            onToast(ok ? "已接入云端推流 v9（省电挂机）" : "已开启云端推流 v9，云服就绪后自动接入")
                                        }
                                    } else {
                                        onToast("已开启云端推流 v9（省电挂机模式）")
                                    }
                                }
                            }
                        )
                    )
                    Text("默认推荐「本机满帧直演」享 0ms 零延迟丝滑看海；长时间挂机或 280 州大图省电不发热，可一键切换「云端推流 v9」。")
                        .font(Theme.caption)
                        .foregroundStyle(Theme.ink2)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.horizontal, 4).padding(.vertical, 12)

                Divider2()
                Row(label: "当前引擎状态", value: engineStatusText)
                Divider2()
                Row(label: "平台响应延迟", value: platform.apiRTTMs.map { "\($0) ms" } ?? "未测速")
                Divider2()
                Row(label: "在线史官人数", value: platform.server.map { "\($0.onlineCount) 人在线" } ?? "—")
                Divider2()
                Row(
                    label: "已存云档数",
                    value: platform.user.map { "\($0.cloudSaveCount) / \($0.cloudSaveQuota) 卷" } ?? "登录后享 20 卷专属云库"
                )
            }
            .padding(.horizontal, Theme.Layout.pageInset)
        }
    }

    private var bottomBar: some View {
        HStack(spacing: 10) {
            EditorialTactileButton(title: "管理云端卷宗", icon: .archive, compact: true, fullWidth: true) {
                onOpenSavesTab()
            }
            EditorialTactileButton(title: "本机卷宗", icon: .chronicle, compact: true, fullWidth: true) {
                onOpenArchive()
            }
            if platform.isLoggedIn {
                EditorialTactileButton(title: "退出", icon: .close, accent: true, compact: true) {
                    confirmLogout = true
                }
            }
        }
        .padding(.horizontal, Theme.Layout.pageInset)
    }
}

// MARK: - 页签二：行宫内置「云档」云端卷宗库（配额 / 一键上传 / 展卷载入 / 删除）

private struct HubSavesTabView: View {
    @ObservedObject var platform: OnlinePlatform
    @ObservedObject var model: GameModel
    let onOpenAuth: () -> Void
    let onOpenArchive: () -> Void
    let onDismiss: () -> Void
    let onToast: (String) -> Void

    @State private var saves: [CloudSaveCard] = []
    @State private var loading = false
    @State private var uploading = false
    @State private var busyCardId: String?
    @State private var errorMessage: String?
    @State private var deletingCard: CloudSaveCard?
    @State private var loadedOnce = false

    private static func formatTimestamp(_ date: Date) -> String {
        let f = DateFormatter()
        f.dateFormat = "yyyy.MM.dd HH:mm"
        return f.string(from: date)
    }

    private var quotaTotal: Int {
        platform.user?.cloudSaveQuota ?? 20
    }

    private var usedCount: Int {
        if loadedOnce { return saves.count }
        return platform.user?.cloudSaveCount ?? saves.count
    }

    var body: some View {
        ViewBoundary {
            VStack(alignment: .leading, spacing: 14) {
                quotaHeaderCard

                if !platform.isLoggedIn {
                    Group2 {
                        HStack(spacing: 10) {
                            PhosphorIcon(glyph: .person, size: 16, weight: .light).foregroundStyle(Theme.seal)
                            Text("登临云端账号即可开启 20 卷专属国内专线云档库；当前暂用房间码 \(NativeHost.activeRoomCode) 云库。")
                                .font(Theme.caption)
                                .foregroundStyle(Theme.ink2)
                                .fixedSize(horizontal: false, vertical: true)
                            Spacer(minLength: 4)
                            EditorialTactileButton(title: "登录", solid: true, compact: true) { onOpenAuth() }
                        }
                        .padding(.horizontal, 4)
                        .padding(.vertical, 11)
                    }
                    .padding(.horizontal, Theme.Layout.pageInset)
                }

                SealButton(
                    title: uploading ? "正在压缩上传至云端…" : ((model.state == nil && !model.hasSave) ? "进入世界后即可上传云端" : "上传当前世界至云端"),
                    busy: uploading,
                    disabled: uploading || busyCardId != nil || (model.state == nil && !model.hasSave)
                ) {
                    Task { await uploadCurrent() }
                }
                .padding(.horizontal, Theme.Layout.pageInset)

                HStack {
                    SectionLabel("云端卷宗列表（\(saves.count)）", inset: false)
                    Spacer()
                    EditorialTactileButton(
                        title: loading ? "读取中…" : "刷新列表",
                        icon: .refresh,
                        compact: true,
                        disabled: loading || uploading || busyCardId != nil
                    ) {
                        Task { await refreshList(showResultToast: true) }
                    }
                }
                .padding(.horizontal, Theme.Layout.pageInset)

                if let err = errorMessage {
                    Text(err)
                        .font(Theme.label)
                        .foregroundStyle(Theme.seal)
                        .padding(.horizontal, Theme.Layout.pageInset)
                }

                if loading && saves.isEmpty {
                    Group2 {
                        HStack(spacing: 10) {
                            InkBusy().frame(width: 24, height: 24)
                            Text("正在读取云端卷宗…").font(Theme.label).foregroundStyle(Theme.ink2)
                        }
                        .padding(.horizontal, 4)
                        .padding(.vertical, 16)
                    }
                    .padding(.horizontal, Theme.Layout.pageInset)
                } else if saves.isEmpty {
                    Group2 {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("云端架上尚空")
                                .font(Theme.serif(16))
                                .foregroundStyle(Theme.ink)
                            Text("点击上方「上传当前世界至云端」，即可将当前山河以 zlib 压缩秒存云端，更换设备或重装后随时一键展卷续推。")
                                .font(Theme.caption)
                                .foregroundStyle(Theme.ink2)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .padding(.horizontal, 4)
                        .padding(.vertical, 14)
                    }
                    .padding(.horizontal, Theme.Layout.pageInset)
                } else {
                    Group2 {
                        ForEach(Array(saves.enumerated()), id: \.element.id) { idx, card in
                            if idx > 0 { Divider2() }
                            saveRow(card)
                        }
                    }
                    .padding(.horizontal, Theme.Layout.pageInset)
                }

                EditorialTactileButton(title: "查看本机历史卷宗", icon: .archive, compact: true, fullWidth: true) {
                    onOpenArchive()
                }
                .padding(.horizontal, Theme.Layout.pageInset)
            }
            .task {
                if !loadedOnce {
                    await refreshList(showResultToast: false)
                }
            }
            .confirmationDialog(
                "确认从云端删除「\(deletingCard?.title ?? "")」？删除后无法恢复。",
                isPresented: Binding(get: { deletingCard != nil }, set: { if !$0 { deletingCard = nil } }),
                titleVisibility: .visible
            ) {
                Button("确认删除", role: .destructive) {
                    guard let target = deletingCard else { return }
                    deletingCard = nil
                    Task { await deleteCard(target) }
                }
                Button("留着", role: .cancel) { deletingCard = nil }
            }
        }
    }

    private var quotaHeaderCard: some View {
        let ratio = min(1.0, Double(usedCount) / Double(max(1, quotaTotal)))
        let nearFull = usedCount >= quotaTotal
        return Group2 {
            VStack(alignment: .leading, spacing: 8) {
                HStack(alignment: .firstTextBaseline) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(platform.isLoggedIn ? "账号专属云档库" : "云端卷宗空间")
                            .font(Theme.serif(16))
                            .foregroundStyle(Theme.ink)
                        Text(platform.isLoggedIn ? "国内专线直传 · 跨设备随时同步" : "登录账号可获 20 卷独立配额")
                            .font(Theme.caption)
                            .foregroundStyle(Theme.ink2)
                    }
                    Spacer()
                    EditorialValueText("已用 \(usedCount) / \(quotaTotal) 卷", size: 15, color: nearFull ? Theme.seal : Theme.ink)
                }
                InkBar(fraction: ratio, color: nearFull ? Theme.seal : Theme.jade, height: 3.5)
            }
            .padding(.horizontal, 4)
            .padding(.vertical, 12)
        }
        .padding(.horizontal, Theme.Layout.pageInset)
    }

    private func saveRow(_ card: CloudSaveCard) -> some View {
        let isBusy = busyCardId == card.id
        return VStack(alignment: .leading, spacing: 9) {
            HStack(alignment: .top, spacing: 10) {
                Rectangle()
                    .fill(Theme.seal)
                    .frame(width: 2.5, height: 40)
                    .padding(.top, 2)
                VStack(alignment: .leading, spacing: 3) {
                    HStack(spacing: 6) {
                        Text(card.title)
                            .font(Theme.serif(16))
                            .foregroundStyle(Theme.ink)
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                        Spacer(minLength: 4)
                        Text(card.sizeText)
                            .font(Theme.caption)
                            .foregroundStyle(Theme.ink2)
                            .monospacedDigit()
                    }
                    Text(saveMetaLine(card))
                        .font(Theme.caption)
                        .foregroundStyle(Theme.ink2)
                        .lineLimit(1)
                        .monospacedDigit()
                    Text(saveDeviceLine(card))
                        .font(Theme.caption)
                        .foregroundStyle(Theme.ink2.opacity(0.82))
                        .lineLimit(1)
                        .monospacedDigit()
                }
            }

            HStack(spacing: 8) {
                EditorialTactileButton(
                    title: isBusy ? "展卷载入中…" : "展卷载入",
                    icon: .play,
                    solid: true,
                    compact: true,
                    fullWidth: true,
                    disabled: uploading || busyCardId != nil
                ) {
                    Task { await openCard(card) }
                }
                EditorialTactileButton(
                    title: "删除",
                    icon: .trash,
                    accent: true,
                    compact: true,
                    disabled: uploading || busyCardId != nil
                ) {
                    deletingCard = card
                }
            }
        }
        .padding(.horizontal, 4)
        .padding(.vertical, 12)
    }

    private func saveMetaLine(_ c: CloudSaveCard) -> String {
        var parts: [String] = []
        if !c.date.isEmpty { parts.append(c.date) }
        if c.nations > 0 { parts.append("\(c.nations) 国") }
        if c.provinces > 0 { parts.append("\(c.provinces) 州") }
        if parts.isEmpty { parts.append("第 \(max(1, c.day)) 日") }
        return parts.joined(separator: " · ")
    }

    private func saveDeviceLine(_ c: CloudSaveCard) -> String {
        let dev = c.device.trimmingCharacters(in: .whitespacesAndNewlines)
        let timeStr = Self.formatTimestamp(c.savedDate)
        return dev.isEmpty ? "存盘于 \(timeStr)" : "\(dev) · \(timeStr)"
    }

    @MainActor
    private func refreshList(showResultToast: Bool) async {
        loading = true
        errorMessage = nil
        do {
            saves = try await CloudSaveClient.list()
            loadedOnce = true
            if showResultToast {
                onToast("已刷新云端卷宗（共 \(saves.count) 卷）")
            }
        } catch {
            errorMessage = error.localizedDescription
        }
        loading = false
    }

    @MainActor
    private func uploadCurrent() async {
        uploading = true
        errorMessage = nil
        let res = await model.uploadCurrentToCloud()
        switch res {
        case .success(let card):
            saves.removeAll { $0.id == card.id }
            saves.insert(card, at: 0)
            loadedOnce = true
            await platform.refreshUserProfile()
            GameFeel.shared.notify(.success)
            onToast("已上传云档「\(card.title)」（\(card.sizeText)）")
        case .failure(let err):
            errorMessage = err.localizedDescription
            GameFeel.shared.notify(.error)
            onToast(err.localizedDescription)
        }
        uploading = false
    }

    @MainActor
    private func openCard(_ card: CloudSaveCard) async {
        busyCardId = card.id
        errorMessage = nil
        let err = await model.openCloudSave(card)
        busyCardId = nil
        if let err {
            errorMessage = err
            GameFeel.shared.notify(.error)
            onToast(err)
        } else {
            GameFeel.shared.notify(.success)
            onDismiss()
        }
    }

    @MainActor
    private func deleteCard(_ card: CloudSaveCard) async {
        busyCardId = card.id
        errorMessage = nil
        do {
            try await CloudSaveClient.delete(id: card.id)
            withAnimation(Motion.fade) { saves.removeAll { $0.id == card.id } }
            await platform.refreshUserProfile()
            GameFeel.shared.notify(.success)
            onToast("已删除云端卷宗「\(card.title)」")
        } catch {
            errorMessage = error.localizedDescription
            GameFeel.shared.notify(.error)
            onToast(error.localizedDescription)
        }
        busyCardId = nil
    }
}

// MARK: - 页签三：云更新与全网多源满速下载中枢（版本中心 / 热更 / 节点测速仪 / 典籍与平衡）

private struct HubUpdateTabView: View {
    @ObservedObject var platform: OnlinePlatform
    @ObservedObject var hotPack: HotPackManager
    @ObservedObject var model: GameModel
    @ObservedObject var cloud = CloudConfig.shared
    let onOpenAppUpdate: () -> Void
    let onOpenHotUpdate: () -> Void
    let onShowNotes: () -> Void
    let onToast: (String) -> Void

    @State private var checkingAll = false
    @State private var openingHot = false

    var body: some View {
        ViewBoundary {
            VStack(alignment: .leading, spacing: 14) {
                clientVersionCard
                hotPackCard
                mirrorProbeCard
                loreAndTuningCards
            }
        }
    }

    // Card 1: 客户端版本中心
    private var clientVersionCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionLabel("客户端版本中心")
            Group2 {
                Row(
                    label: "当前已装版本",
                    value: "v\(OnlinePlatform.currentVersionString)（构建 \(OnlinePlatform.currentBuildNumber)）"
                )
                Divider2()
                if let info = platform.updateInfo {
                    Row(
                        label: "云端最新版本",
                        value: "v\(info.latestVersion)（构建 \(info.latestBuild)）" + (info.hasAppUpdate ? " · 可更新" : " · 已最新")
                    )
                    Divider2()
                    Row(
                        label: "发布日期 / 体积",
                        value: String(format: "%@ · %.1f MB", info.releaseDate.isEmpty ? "正式版" : info.releaseDate, info.ipaSizeMB)
                    )
                    if !info.releaseNotes.isEmpty {
                        Divider2()
                        VStack(alignment: .leading, spacing: 6) {
                            Text("新版更新摘要")
                                .font(Theme.caption)
                                .foregroundStyle(Theme.seal)
                            ForEach(Array(info.releaseNotes.prefix(3).enumerated()), id: \.offset) { _, line in
                                HStack(alignment: .top, spacing: 6) {
                                    Text("·").font(Theme.label).foregroundStyle(Theme.seal)
                                    Text(line)
                                        .font(Theme.label)
                                        .foregroundStyle(Theme.ink)
                                        .fixedSize(horizontal: false, vertical: true)
                                }
                            }
                        }
                        .padding(.horizontal, 4)
                        .padding(.vertical, 10)
                    }
                } else {
                    Row(
                        label: "云端最新版本",
                        value: (platform.checkingUpdate || checkingAll) ? "正在连接云端…" : "未获取（点下方检测）"
                    )
                }

                if platform.downloadingIPA || !platform.downloadDetail.isEmpty {
                    Divider2()
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            let detail = platform.downloadDetail
                            let nodePrefix = (!platform.activeDownloadNode.isEmpty && !detail.contains(platform.activeDownloadNode)) ? "[\(platform.activeDownloadNode)] " : ""
                            let speedSuffix = (platform.downloadSpeedMBs > 0.01 && !detail.contains("MB/s")) ? String(format: " · %.1f MB/s", platform.downloadSpeedMBs) : ""
                            Text("\(nodePrefix)\(detail)\(speedSuffix)")
                                .font(Theme.caption)
                                .foregroundStyle(Theme.ink)
                                .monospacedDigit()
                            Spacer()
                            if platform.downloadingIPA {
                                Button("取消") { platform.cancelIPADownload() }
                                    .font(Theme.caption)
                                    .foregroundStyle(Theme.seal)
                            }
                        }
                        InkBar(fraction: platform.downloadProgress, color: platform.downloadProgress >= 1 ? Theme.jade : Theme.seal, height: 3.5)
                    }
                    .padding(.horizontal, 4)
                    .padding(.vertical, 10)
                }
            }
            .padding(.horizontal, Theme.Layout.pageInset)

            VStack(spacing: 9) {
                if let info = platform.updateInfo, info.hasAppUpdate {
                    SealButton(title: "立即满速更新至 v\(info.latestVersion)") {
                        onOpenAppUpdate()
                    }
                } else {
                    EditorialTactileButton(
                        title: "查看新版详情 / 手动重下安装包",
                        icon: .export,
                        compact: false,
                        fullWidth: true
                    ) {
                        onOpenAppUpdate()
                    }
                }

                HStack(spacing: 10) {
                    EditorialTactileButton(
                        title: (checkingAll || platform.checkingUpdate || hotPack.checking) ? "检测中…" : "检测云端更新",
                        icon: .refresh,
                        solid: platform.updateInfo?.hasAppUpdate != true,
                        compact: true,
                        fullWidth: true,
                        disabled: checkingAll || platform.checkingUpdate || hotPack.checking
                    ) {
                        Task {
                            checkingAll = true
                            let cfgApplied = await platform.bootstrap(manual: true, autoPrompt: false)
                            if cfgApplied { await model.applyCloud() }
                            let hasPack = await hotPack.checkManifest(autoPrompt: false)
                            checkingAll = false
                            if platform.updateInfo?.hasAppUpdate == true {
                                onOpenAppUpdate()
                            } else if hasPack {
                                onOpenHotUpdate()
                            } else {
                                GameFeel.shared.notify(.success)
                                onToast("客户端 v\(OnlinePlatform.currentVersionString) 与热更资源均已是最新")
                            }
                        }
                    }

                    EditorialTactileButton(title: "历代更新志", icon: .chronicle, compact: true, fullWidth: true) {
                        onShowNotes()
                    }
                }
            }
            .padding(.horizontal, Theme.Layout.pageInset)
        }
    }

    // Card 2: 游戏内免换包热更新（45.4 MB 典藏包）
    private var hotPackCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionLabel("游戏内免换包热更新（45.4 MB 典藏包）")
            Group2 {
                Row(
                    label: "资源热更状态",
                    value: hotPack.hasPendingUpdate
                        ? "待更新 \(HotPackManager.formatBytes(hotPack.pendingBytes))（\(hotPack.pendingFiles.count) 项）"
                        : (hotPack.installedVersion > 0 ? "已是最新（v\(hotPack.installedVersion)）" : "尚未下载完整包")
                )
                Divider2()
                Row(
                    label: "本地已装典藏包",
                    value: hotPack.installedTotalBytes > 0
                        ? "\(HotPackManager.formatBytes(hotPack.installedTotalBytes)) · +\(hotPack.extraScenarios.count) 套扩展剧本"
                        : "尚未下载（含配乐 / 长卷 / 扩展剧本）"
                )
                Divider2()
                Row(
                    label: "当前加速 CDN",
                    value: hotPack.activeCDNName.isEmpty ? "多源 CDN 自动择优" : hotPack.activeCDNName
                )
                if hotPack.updating || !hotPack.statusMessage.isEmpty {
                    Divider2()
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            Text(hotPack.statusMessage)
                                .font(Theme.caption)
                                .foregroundStyle(Theme.ink2)
                                .monospacedDigit()
                            Spacer()
                            if hotPack.updating {
                                Button("暂停") { hotPack.cancelHotUpdate() }
                                    .font(Theme.caption)
                                    .foregroundStyle(Theme.seal)
                            }
                        }
                        if hotPack.updating || hotPack.progress > 0 {
                            InkBar(fraction: hotPack.progress, color: hotPack.progress >= 1 ? Theme.jade : Theme.seal, height: 3.5)
                        }
                    }
                    .padding(.horizontal, 4)
                    .padding(.vertical, 10)
                }
            }
            .padding(.horizontal, Theme.Layout.pageInset)

            HStack(spacing: 10) {
                EditorialTactileButton(
                    title: hotPack.updating
                        ? "查看热更进度（\(Int(hotPack.progress * 100))%）"
                        : (openingHot ? "读取清单…" : (hotPack.hasPendingUpdate ? "立即免换包热更（\(HotPackManager.formatBytes(hotPack.pendingBytes))）" : "检查 / 打开热更新面板")),
                    icon: .lightning,
                    solid: hotPack.hasPendingUpdate,
                    compact: true,
                    fullWidth: true,
                    disabled: openingHot
                ) {
                    if hotPack.manifest != nil {
                        onOpenHotUpdate()
                    } else {
                        Task {
                            openingHot = true
                            _ = await hotPack.checkManifest(autoPrompt: false)
                            openingHot = false
                            if hotPack.manifest != nil {
                                onOpenHotUpdate()
                            } else {
                                onToast(hotPack.errorMessage ?? "热更清单获取失败，请检查网络")
                            }
                        }
                    }
                }

                if hotPack.installedTotalBytes > 0 {
                    EditorialTactileButton(title: "清理缓存", icon: .trash, compact: true) {
                        hotPack.clearCache()
                        onToast("已清理本地热更资源缓存")
                    }
                }
            }
            .padding(.horizontal, Theme.Layout.pageInset)
        }
    }

    // Card 3: 全网多源极速节点测速仪
    private var mirrorProbeCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            SectionLabel("全网多源极速节点测速仪")
            Group2 {
                if platform.mirrorResults.isEmpty {
                    VStack(alignment: .leading, spacing: 4) {
                        Text(platform.probingMirrors ? "正在并发探测全网加速节点延迟与吞吐…" : "尚未测速")
                            .font(Theme.body)
                            .foregroundStyle(Theme.ink)
                        Text("自动测速国内专线、Cloudflare 边缘与全球镜像源，下载客户端安装包时自动择优满速直下。")
                            .font(Theme.caption)
                            .foregroundStyle(Theme.ink2)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(.horizontal, 4)
                    .padding(.vertical, 12)
                } else {
                    ForEach(Array(platform.mirrorResults.enumerated()), id: \.element.id) { idx, node in
                        if idx > 0 { Divider2() }
                        HStack(spacing: 10) {
                            Circle()
                                .fill(node.ok ? (idx == 0 ? Theme.jade : Theme.ink2.opacity(0.65)) : Theme.seal.opacity(0.55))
                                .frame(width: 7, height: 7)
                            VStack(alignment: .leading, spacing: 2) {
                                HStack(spacing: 6) {
                                    Text(node.name)
                                        .font(Theme.serif(15))
                                        .foregroundStyle(Theme.ink)
                                        .lineLimit(1)
                                    if idx == 0 && node.ok {
                                        Text("最快")
                                            .font(Theme.caption)
                                            .foregroundStyle(Theme.jade)
                                    }
                                }
                                Text(mirrorTelemetryText(node))
                                    .font(Theme.caption)
                                    .foregroundStyle(node.ok ? Theme.ink2 : Theme.seal)
                                    .monospacedDigit()
                            }
                            Spacer(minLength: 6)
                            if node.ok && platform.updateInfo != nil {
                                EditorialTactileButton(title: "用此源", compact: true, disabled: platform.downloadingIPA) {
                                    platform.startIPADownload(preferredMirrorURL: node.url)
                                    onOpenAppUpdate()
                                }
                            }
                        }
                        .padding(.horizontal, 4)
                        .padding(.vertical, 10)
                    }
                }
            }
            .padding(.horizontal, Theme.Layout.pageInset)

            EditorialTactileButton(
                title: platform.probingMirrors ? "全网测速中…" : "一键测速全网加速节点",
                icon: .speed,
                solid: platform.mirrorResults.isEmpty,
                compact: true,
                fullWidth: true,
                disabled: platform.probingMirrors
            ) {
                Task {
                    await platform.probeDownloadMirrors()
                    if let best = platform.mirrorResults.first(where: { $0.ok }) {
                        let lat = best.latencyMs.map { "\($0)ms" } ?? ""
                        let spd = best.speedMBs.map { String(format: " · %.1f MB/s", $0) } ?? ""
                        GameFeel.shared.notify(.success)
                        onToast("测速完成 · 最优节点：\(best.name)（\(lat)\(spd)）")
                    } else {
                        onToast("全网节点测速完成，请检查网络连接")
                    }
                }
            }
            .padding(.horizontal, Theme.Layout.pageInset)
        }
    }

    private func mirrorTelemetryText(_ node: MirrorProbeResult) -> String {
        guard node.ok else { return "暂不可达或连接超时" }
        var parts: [String] = []
        if let ms = node.latencyMs { parts.append("延迟 \(ms) ms") }
        if let mb = node.speedMBs, mb > 0 { parts.append(String(format: "实测 %.1f MB/s", mb)) }
        return parts.isEmpty ? "连通正常" : parts.joined(separator: " · ")
    }

    // Card 4: 热更典籍 & 云端生效平衡参数
    @ViewBuilder private var loreAndTuningCards: some View {
        if !hotPack.loreEntries.isEmpty {
            SectionLabel("热更典籍 · 兵法与史话")
            Group2 {
                ForEach(Array(hotPack.loreEntries.enumerated()), id: \.element.id) { idx, item in
                    if idx > 0 { Divider2() }
                    VStack(alignment: .leading, spacing: 4) {
                        Text("【\(item.category)】\(item.title)").font(Theme.serif(15)).foregroundStyle(Theme.ink)
                        Text(item.body).font(Theme.caption).foregroundStyle(Theme.ink2).fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(.horizontal, 4).padding(.vertical, 10)
                }
            }
            .padding(.horizontal, Theme.Layout.pageInset)
        }

        if let t = cloud.tuning {
            SectionLabel("云端生效平衡参数")
            Group2 {
                Row(label: "规则热更版本", value: "v\(max(platform.hotpatchVersion, cloud.version))")
                Divider2()
                Row(label: "战损 / 围城倍率", value: String(format: "%.1f× / %.1f×", t.lethality, t.siege))
                Divider2()
                Row(label: "战意 / 军团上限", value: String(format: "%.1f / %d 支", t.warEagerness, t.armyCap))
            }
            .padding(.horizontal, Theme.Layout.pageInset)
        }
    }
}

// MARK: - 页签四：极简宣纸驿报与信匣

private struct HubNoticesTabView: View {
    @ObservedObject var platform: OnlinePlatform
    let onOpenAuth: () -> Void
    let onToast: (String) -> Void
    @State private var expandedMailId: Int?
    @State private var refreshing = false

    var body: some View {
        ViewBoundary {
            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    SectionLabel("太史院公告", inset: false)
                    Spacer()
                    EditorialTactileButton(
                        title: refreshing ? "刷新中…" : "刷新驿报",
                        icon: .refresh,
                        compact: true,
                        disabled: refreshing
                    ) {
                        Task {
                            refreshing = true
                            _ = await platform.bootstrap(manual: true, autoPrompt: false)
                            if platform.isLoggedIn { await platform.refreshInbox() }
                            refreshing = false
                            onToast("驿报与兰台信匣已刷新")
                        }
                    }
                }
                .padding(.horizontal, Theme.Layout.pageInset)

                Group2 {
                    if platform.announcements.isEmpty {
                        Text("暂无最新公告").font(Theme.body).foregroundStyle(Theme.ink2).padding(.vertical, 12)
                    } else {
                        ForEach(Array(platform.announcements.enumerated()), id: \.element.id) { idx, item in
                            if idx > 0 { Divider2() }
                            VStack(alignment: .leading, spacing: 6) {
                                HStack(spacing: 6) {
                                    Text("[\(item.badge)]")
                                        .font(Theme.caption)
                                        .foregroundStyle(item.pinned ? Theme.seal : Theme.ink2)
                                    Text(item.title).font(Theme.serif(15.5)).foregroundStyle(Theme.ink)
                                    Spacer(minLength: 4)
                                    Text(item.dateText).font(Theme.caption).foregroundStyle(Theme.ink2).monospacedDigit()
                                }
                                Text(item.content).font(Theme.label).foregroundStyle(Theme.ink2).fixedSize(horizontal: false, vertical: true)
                            }
                            .padding(.horizontal, 4).padding(.vertical, 12)
                        }
                    }
                }
                .padding(.horizontal, Theme.Layout.pageInset)

                SectionLabel("兰台信匣")
                Group2 {
                    if !platform.isLoggedIn {
                        HStack {
                            Text("登录账号后可接收系统诏书与通知。").font(Theme.label).foregroundStyle(Theme.ink2)
                            Spacer()
                            EditorialTactileButton(title: "登录", solid: true, compact: true) { onOpenAuth() }
                        }
                        .padding(.horizontal, 4).padding(.vertical, 12)
                    } else if platform.inbox.isEmpty {
                        Text("信匣尚空").font(Theme.body).foregroundStyle(Theme.ink2).padding(.vertical, 12)
                    } else {
                        ForEach(Array(platform.inbox.enumerated()), id: \.element.id) { idx, mail in
                            if idx > 0 { Divider2() }
                            Button {
                                GameFeel.shared.tap()
                                expandedMailId = (expandedMailId == mail.id) ? nil : mail.id
                                if !mail.read { Task { await platform.markMailRead(mail) } }
                            } label: {
                                VStack(alignment: .leading, spacing: 5) {
                                    HStack(spacing: 6) {
                                        if !mail.read { Circle().fill(Theme.seal).frame(width: 6, height: 6) }
                                        Text(mail.title).font(Theme.serif(15)).foregroundStyle(Theme.ink)
                                        Spacer()
                                        Text(mail.dateText).font(Theme.caption).foregroundStyle(Theme.ink2).monospacedDigit()
                                    }
                                    Text("落款：\(mail.sender)").font(Theme.caption).foregroundStyle(Theme.ink2)
                                    if expandedMailId == mail.id {
                                        Text(mail.content).font(Theme.body).foregroundStyle(Theme.ink).fixedSize(horizontal: false, vertical: true).padding(.top, 3)
                                    }
                                }
                                .padding(.horizontal, 4).padding(.vertical, 11)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                .padding(.horizontal, Theme.Layout.pageInset)
            }
        }
    }
}

// MARK: - 页签五：天下史榜（甲乙丙前三甲醒目标注 + 一键铭刻）

private struct HubLeaderboardTabView: View {
    @ObservedObject var platform: OnlinePlatform
    @ObservedObject var model: GameModel
    let onOpenAuth: () -> Void
    let onToast: (String) -> Void

    @State private var category = "provinces"
    @State private var reporting = false
    @State private var refreshing = false

    var body: some View {
        ViewBoundary {
            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 10) {
                    ChipPicker(
                        items: [("provinces", "疆域霸业"), ("years", "历世长存"), ("exp", "史官品秩")],
                        selection: $category
                    )
                    EditorialTactileButton(title: refreshing ? "…" : "刷新", icon: .refresh, compact: true, disabled: refreshing) {
                        Task {
                            refreshing = true
                            await platform.refreshLeaderboard(category: category)
                            refreshing = false
                            onToast("天下史榜已刷新")
                        }
                    }
                }
                .padding(.horizontal, Theme.Layout.pageInset)
                .onChange(of: category) { _, next in
                    Task { await platform.refreshLeaderboard(category: next) }
                }

                Group2 {
                    if platform.leaderboard.isEmpty {
                        Text("史榜虚位以待，进入一局世界即可点击下方「铭刻当前世界入天下史榜」。")
                            .font(Theme.body).foregroundStyle(Theme.ink2).padding(.vertical, 18)
                    } else {
                        ForEach(Array(platform.leaderboard.enumerated()), id: \.element.id) { idx, e in
                            if idx > 0 { Divider2() }
                            let isTop3 = e.rank <= 3
                            HStack(spacing: 10) {
                                if isTop3 {
                                    Rectangle()
                                        .fill(e.rank == 1 ? Theme.seal : Theme.seal.opacity(0.55))
                                        .frame(width: 2.5, height: 32)
                                }
                                Text(e.rank == 1 ? "甲" : e.rank == 2 ? "乙" : e.rank == 3 ? "丙" : "\(e.rank)")
                                    .font(Theme.serif(isTop3 ? 16 : 14))
                                    .foregroundStyle(isTop3 ? Theme.seal : Theme.ink2)
                                    .frame(width: 24)
                                PlayerSealBadge(char: e.sealChar, style: e.sealStyle, size: isTop3 ? 32 : 28, filled: e.rank == 1)
                                VStack(alignment: .leading, spacing: 2) {
                                    HStack(spacing: 6) {
                                        Text(e.nickname)
                                            .font(Theme.serif(isTop3 ? 15.5 : 15))
                                            .foregroundStyle(Theme.ink)
                                            .lineLimit(1)
                                        Text(e.rankTitle)
                                            .font(Theme.caption)
                                            .foregroundStyle(isTop3 ? Theme.seal : Theme.ink2)
                                    }
                                    if !e.worldTitle.isEmpty {
                                        Text("\(e.worldTitle) · \(e.topNation)")
                                            .font(Theme.caption)
                                            .foregroundStyle(Theme.ink2)
                                            .lineLimit(1)
                                    }
                                }
                                Spacer(minLength: 6)
                                EditorialValueText(
                                    category == "years" ? "\(e.yearsElapsed) 载" : (category == "exp" ? "\(e.exp) 功勋" : "\(e.provincesHeld) 州"),
                                    size: isTop3 ? 17 : 15.5,
                                    color: isTop3 ? Theme.seal : Theme.ink
                                )
                            }
                            .padding(.horizontal, 6)
                            .padding(.vertical, isTop3 ? 11 : 9.5)
                            .background(e.rank == 1 ? Theme.seal.opacity(0.05) : (isTop3 ? Theme.seal.opacity(0.025) : Color.clear))
                        }
                    }
                }
                .padding(.horizontal, Theme.Layout.pageInset)

                VStack {
                    if platform.isLoggedIn {
                        SealButton(
                            title: reporting ? "铭刻中…" : (model.state == nil ? "进入世界后即可铭刻入榜" : "铭刻当前世界入天下史榜"),
                            busy: reporting,
                            disabled: reporting || model.state == nil
                        ) {
                            Task { await engraveCurrentWorld() }
                        }
                    } else {
                        EditorialTactileButton(title: "登临账号后铭刻青史", icon: .crown, solid: true, fullWidth: true) { onOpenAuth() }
                    }
                }
                .padding(.horizontal, Theme.Layout.pageInset)
            }
        }
    }

    @MainActor
    private func engraveCurrentWorld() async {
        guard let s = model.state, let map = model.map else { return }
        reporting = true
        var held = [Int: Int]()
        for o in s.owners where o >= 0 { held[o, default: 0] += 1 }
        let topPair = held.max { $0.value != $1.value ? $0.value < $1.value : $0.key > $1.key }
        let topIdx = topPair?.key ?? -1
        let topProvs = topPair?.value ?? 0
        let topName = (topIdx >= 0 && map.meta.nations.indices.contains(topIdx)) ? map.meta.nations[topIdx].name : "无名"
        let title = "\(topName)之世"
        let err = await platform.reportWorldStats(
            worldTitle: title, topNation: topName, provincesHeld: topProvs,
            totalDays: s.day, nationsCount: held.count, warsCount: s.wars.count,
            wondersCount: s.wonders?.count ?? 0
        )
        reporting = false
        if let err { GameFeel.shared.notify(.error); onToast(err) }
        else { GameFeel.shared.notify(.success); onToast("「\(title)」已铭刻入天下史榜") }
    }
}
