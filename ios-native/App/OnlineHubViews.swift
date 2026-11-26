import SwiftUI
import UIKit
import LieguojiCore

// MARK: - 「史官行宫」100% 极简 4.3 宣纸风网游云端中心（名帖 / 热更 / 驿报 / 史榜 / 司礼监）

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
    @State private var toast: String?

    private var tabItems: [(String, String)] {
        var list: [(String, String)] = [
            ("profile", "名帖"),
            ("update", hotPack.hasPendingUpdate ? "热更·新" : "热更"),
            ("notices", (platform.user?.unreadMailCount ?? 0) > 0 ? "驿报·新" : "驿报"),
            ("rank", "史榜")
        ]
        if platform.user?.isAdminAccount == true {
            list.append(("admin", "司礼监"))
        }
        return list
    }

    var body: some View {
        ViewBoundary {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    SheetHeader(
                        title: tab == "admin" ? "御前司礼监" : "史官行宫",
                        subtitle: platform.server.map { "\($0.name) · \($0.onlineCount) 人在线" } ?? "云端账号与免换包热更中心",
                        seal: tab == "admin" ? "监" : "宫"
                    )

                    ChipPicker(items: tabItems, selection: $tab)
                        .padding(.horizontal, Theme.Layout.pageInset)

                    if let toast {
                        Text(toast)
                            .font(Theme.label)
                            .foregroundStyle(Theme.jade)
                            .padding(.horizontal, Theme.Layout.pageInset)
                    }

                    switch tab {
                    case "update":
                        HubUpdateTabView(
                            platform: platform,
                            hotPack: hotPack,
                            model: model,
                            onShowNotes: { showReleaseNotes = true },
                            onToast: showToast
                        )
                    case "notices":
                        HubNoticesTabView(platform: platform, onOpenAuth: { showAuth = true })
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
                            model: model,
                            onOpenAuth: { showAuth = true },
                            onOpenBind: { showBind = true },
                            onOpenAdmin: { tab = "admin" },
                            onOpenArchive: {
                                dismiss()
                                onOpenArchive?()
                            },
                            onToast: showToast
                        )
                    }
                }
                .padding(.bottom, 26)
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
        }
    }

    private func showToast(_ msg: String) {
        toast = msg
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 2_800_000_000)
            if toast == msg { toast = nil }
        }
    }
}

// MARK: - 页签一：极简宣纸名帖、签到与云服状态

private struct HubProfileTabView: View {
    @ObservedObject var platform: OnlinePlatform
    @ObservedObject var model: GameModel
    let onOpenAuth: () -> Void
    let onOpenBind: () -> Void
    let onOpenAdmin: () -> Void
    let onOpenArchive: () -> Void
    let onToast: (String) -> Void

    @State private var editing = false
    @State private var editNick = ""
    @State private var editBio = ""
    @State private var editSealChar = "龙"
    @State private var editSealStyle = "cinnabar"
    @State private var savingProfile = false
    @State private var checkinBusy = false
    @State private var pingBusy = false
    @State private var confirmLogout = false

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            if let user = platform.user, platform.isLoggedIn {
                Group2 {
                    VStack(alignment: .leading, spacing: 12) {
                        HStack(alignment: .center, spacing: 12) {
                            PlayerSealBadge(char: user.sealChar, style: user.sealStyle, size: 46, filled: true)
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
                                Text(user.rank.nextTitle.isEmpty ? "一代史圣 · 满秩" : "晋升「\(user.rank.nextTitle)」").font(Theme.caption).foregroundStyle(Theme.ink2)
                                Spacer()
                                Text(user.rank.nextTitle.isEmpty ? "满秩" : "\(user.exp) / \(user.rank.nextExp)").font(Theme.caption).foregroundStyle(Theme.ink2).monospacedDigit()
                            }
                            InkBar(fraction: user.rank.progress, color: Theme.seal, height: 3.5)
                        }

                        Divider2()

                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(user.checkedInToday ? "今日已临朝落印" : "每日临朝签到").font(Theme.body).foregroundStyle(Theme.ink)
                                Text("连签 \(user.checkinStreak) 日 · 累计 \(user.totalCheckins) 日").font(Theme.caption).foregroundStyle(Theme.ink2).monospacedDigit()
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
                                Text("立籍转正后跨设备同步云档，立赠 +20 功勋").font(Theme.caption).foregroundStyle(Theme.ink2)
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
                        Text("登临云端行宫，解锁账号云端卷宗、每日签到、定制御印与全服天下史榜。")
                            .font(Theme.body).foregroundStyle(Theme.ink2)
                        SealButton(title: "前往列国登临阁（登录 / 注册）") { onOpenAuth() }
                    }
                    .padding(.horizontal, 4).padding(.vertical, 12)
                }
                .padding(.horizontal, Theme.Layout.pageInset)
            }

            SectionLabel("云端计算与连接")
            Group2 {
                Row(
                    label: "本局推流状态",
                    value: model.remoteAddress != nil
                        ? "云推运行中\(model.remoteRTTMs.map { " · \($0)ms" } ?? "")"
                        : (model.state == nil ? (platform.server?.computeOnline == true ? "云服在线（进图自动接入）" : "离线") : "本机推演（可点下方直连）")
                )
                Divider2()
                Row(label: "平台响应延迟", value: platform.apiRTTMs.map { "\($0) ms" } ?? "未测速")
                Divider2()
                Row(label: "当前在线史官", value: platform.server.map { "\($0.onlineCount) 人在线" } ?? "—")
                if let u = platform.user, platform.isLoggedIn {
                    Divider2()
                    Row(label: "账号云端卷宗", value: "\(u.cloudSaveCount) / \(u.cloudSaveQuota) 卷")
                }
            }
            .padding(.horizontal, Theme.Layout.pageInset)

            HStack(spacing: 10) {
                EditorialTactileButton(title: pingBusy ? "测速中…" : "测速", icon: .speed, compact: true, fullWidth: true, disabled: pingBusy) {
                    Task {
                        pingBusy = true
                        let ms = await platform.pingServer()
                        if model.state != nil && model.remoteAddress == nil { _ = await model.findComputerNow() }
                        pingBusy = false
                        onToast(ms.map { "云服实时响应 \($0) ms" } ?? "测速超时")
                    }
                }
                EditorialTactileButton(title: "云端卷宗", icon: .archive, compact: true, fullWidth: true) { onOpenArchive() }
                if platform.isLoggedIn {
                    EditorialTactileButton(title: "退出", icon: .close, accent: true, compact: true) { confirmLogout = true }
                }
            }
            .padding(.horizontal, Theme.Layout.pageInset)
        }
        .confirmationDialog("退出当前云端账号？本地存档不受影响。", isPresented: $confirmLogout, titleVisibility: .visible) {
            Button("退出登临", role: .destructive) {
                Task { await platform.logout(); onToast("已退出账号") }
            }
            Button("取消", role: .cancel) {}
        }
    }
}

// MARK: - 页签二：游戏内免换包资源热更新中心（20MB+ 典藏扩展包）

private struct HubUpdateTabView: View {
    @ObservedObject var platform: OnlinePlatform
    @ObservedObject var hotPack: HotPackManager
    @ObservedObject var model: GameModel
    @ObservedObject var cloud = CloudConfig.shared
    let onShowNotes: () -> Void
    let onToast: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            SectionLabel("免换包游戏内热更新")
            Group2 {
                Row(
                    label: "资源热更状态",
                    value: hotPack.hasPendingUpdate
                        ? "可热更 \(HotPackManager.formatBytes(hotPack.pendingBytes))"
                        : (hotPack.installedVersion > 0 ? "已是最新（v\(hotPack.installedVersion)）" : "待检测")
                )
                Divider2()
                Row(
                    label: "本地已装热更内容",
                    value: hotPack.installedTotalBytes > 0
                        ? "\(HotPackManager.formatBytes(hotPack.installedTotalBytes)) · +\(hotPack.extraScenarios.count) 套扩展剧本"
                        : "尚未下载典藏热更包"
                )
                Divider2()
                Row(label: "客户端内核", value: "v\(OnlinePlatform.currentVersionString)（构建 \(OnlinePlatform.currentBuildNumber)）· 规则热更 v\(max(platform.hotpatchVersion, cloud.version))")
            }
            .padding(.horizontal, Theme.Layout.pageInset)

            if hotPack.updating || !hotPack.statusMessage.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    Text(hotPack.statusMessage).font(Theme.caption).foregroundStyle(Theme.ink2).monospacedDigit()
                    if hotPack.updating {
                        InkBar(fraction: hotPack.progress, color: Theme.seal, height: 3.5)
                    }
                }
                .padding(.horizontal, Theme.Layout.pageInset)
            }

            HStack(spacing: 10) {
                EditorialTactileButton(
                    title: hotPack.checking || platform.checkingUpdate ? "检测中…" : "检测云端更新",
                    icon: .refresh,
                    solid: !hotPack.hasPendingUpdate,
                    compact: true,
                    fullWidth: true,
                    disabled: hotPack.checking || hotPack.updating || platform.checkingUpdate
                ) {
                    Task {
                        let cfgApplied = await platform.bootstrap(manual: true)
                        if cfgApplied { await model.applyCloud() }
                        let hasPack = await hotPack.checkManifest(autoPrompt: false)
                        if hasPack {
                            hotPack.showHotUpdateSheet = true
                        } else if platform.updateInfo?.hasAppUpdate == true {
                            platform.showUpdateSheet = true
                        } else {
                            onToast("全部游戏资源、剧本与平衡规则均已是最新")
                        }
                    }
                }

                if hotPack.hasPendingUpdate {
                    EditorialTactileButton(
                        title: hotPack.updating ? "更新中…" : "立即热更",
                        icon: .lightning,
                        solid: true,
                        compact: true,
                        fullWidth: true,
                        disabled: hotPack.updating
                    ) {
                        hotPack.showHotUpdateSheet = true
                    }
                }
            }
            .padding(.horizontal, Theme.Layout.pageInset)

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
                    Row(label: "战损 / 围城倍率", value: String(format: "%.1f× / %.1f×", t.lethality, t.siege))
                    Divider2()
                    Row(label: "战意 / 军团上限", value: String(format: "%.1f / %d 支", t.warEagerness, t.armyCap))
                }
                .padding(.horizontal, Theme.Layout.pageInset)
            }

            HStack(spacing: 10) {
                EditorialTactileButton(title: "历代更新志", icon: .chronicle, compact: true, fullWidth: true) { onShowNotes() }
                if hotPack.installedTotalBytes > 0 {
                    EditorialTactileButton(title: "清理热更缓存", icon: .trash, compact: true) {
                        hotPack.clearCache()
                        onToast("已清理本地热更缓存")
                    }
                }
            }
            .padding(.horizontal, Theme.Layout.pageInset)
        }
    }
}

// MARK: - 页签三：极简宣纸驿报与信匣

private struct HubNoticesTabView: View {
    @ObservedObject var platform: OnlinePlatform
    let onOpenAuth: () -> Void
    @State private var expandedMailId: Int?

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            SectionLabel("太史院公告")
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

// MARK: - 页签四：天下史榜

private struct HubLeaderboardTabView: View {
    @ObservedObject var platform: OnlinePlatform
    @ObservedObject var model: GameModel
    let onOpenAuth: () -> Void
    let onToast: (String) -> Void

    @State private var category = "provinces"
    @State private var reporting = false

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            ChipPicker(
                items: [("provinces", "疆域霸业"), ("years", "历世长存"), ("exp", "史官品秩")],
                selection: $category
            )
            .padding(.horizontal, Theme.Layout.pageInset)
            .onChange(of: category) { _, next in
                Task { await platform.refreshLeaderboard(category: next) }
            }

            Group2 {
                if platform.leaderboard.isEmpty {
                    Text("史榜虚位以待，进入一局世界即可点击下方「铭刻入榜」。")
                        .font(Theme.body).foregroundStyle(Theme.ink2).padding(.vertical, 18)
                } else {
                    ForEach(Array(platform.leaderboard.enumerated()), id: \.element.id) { idx, e in
                        if idx > 0 { Divider2() }
                        HStack(spacing: 10) {
                            Text(e.rank == 1 ? "甲" : e.rank == 2 ? "乙" : e.rank == 3 ? "丙" : "\(e.rank)")
                                .font(Theme.serif(14))
                                .foregroundStyle(e.rank <= 3 ? Theme.seal : Theme.ink2)
                                .frame(width: 24)
                            PlayerSealBadge(char: e.sealChar, style: e.sealStyle, size: 30, filled: false)
                            VStack(alignment: .leading, spacing: 2) {
                                HStack(spacing: 6) {
                                    Text(e.nickname).font(Theme.serif(15)).foregroundStyle(Theme.ink).lineLimit(1)
                                    Text(e.rankTitle).font(Theme.caption).foregroundStyle(Theme.ink2)
                                }
                                if !e.worldTitle.isEmpty {
                                    Text("\(e.worldTitle) · \(e.topNation)").font(Theme.caption).foregroundStyle(Theme.ink2).lineLimit(1)
                                }
                            }
                            Spacer(minLength: 6)
                            EditorialValueText(
                                category == "years" ? "\(e.yearsElapsed) 载" : (category == "exp" ? "\(e.exp) 功勋" : "\(e.provincesHeld) 州"),
                                size: 16,
                                color: e.rank == 1 ? Theme.seal : Theme.ink
                            )
                        }
                        .padding(.horizontal, 4).padding(.vertical, 10)
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
