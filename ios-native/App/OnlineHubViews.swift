import SwiftUI
import UIKit
import LieguojiCore

// MARK: - 「史官行宫」全功能网游云端中心（名帖 / 云更 / 驿报 / 史榜）

struct OnlineHubSheet: View {
    @ObservedObject var platform: OnlinePlatform
    @ObservedObject var model: GameModel
    var initialTab: String = "profile"
    var onOpenArchive: (() -> Void)? = nil
    @Environment(\.dismiss) private var dismiss

    @State private var tab: String = "profile"
    @State private var showAuth = false
    @State private var showBind = false
    @State private var showReleaseNotes = false
    @State private var toast: String?

    var body: some View {
        ViewBoundary {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    SheetHeader(
                        title: "史官行宫",
                        subtitle: platform.server.map { "\($0.name) · \($0.onlineCount) 人在线" } ?? "列国纪云端行宫与热更中心",
                        seal: "宫"
                    )

                    ChipPicker(
                        items: [
                            ("profile", "名帖"),
                            ("update", platform.updateInfo?.hasAppUpdate == true ? "云更·新" : "云更"),
                            ("notices", (platform.user?.unreadMailCount ?? 0) > 0 ? "驿报·新" : "驿报"),
                            ("rank", "史榜")
                        ],
                        selection: $tab
                    )
                    .padding(.horizontal, Theme.Layout.pageInset)

                    if let toast {
                        HStack(spacing: 8) {
                            PhosphorIcon(glyph: .check, size: 14, weight: .fill).foregroundStyle(Theme.jade)
                            Text(toast).font(Theme.label).foregroundStyle(Theme.jade)
                        }
                        .padding(.horizontal, 14).padding(.vertical, 9)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Theme.jade.opacity(0.09), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                        .padding(.horizontal, Theme.Layout.pageInset)
                        .transition(.opacity)
                    }

                    switch tab {
                    case "update":
                        HubUpdateTabView(
                            platform: platform,
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
                    default:
                        HubProfileTabView(
                            platform: platform,
                            model: model,
                            onOpenAuth: { showAuth = true },
                            onOpenBind: { showBind = true },
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
                    .presentationDetents([.fraction(0.92)])
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
        withAnimation(Motion.fade) { toast = msg }
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 2_800_000_000)
            if toast == msg { withAnimation(Motion.fade) { toast = nil } }
        }
    }
}

// MARK: - 页签一：史官名帖、每日签到与专属云服仪表盘

private struct HubProfileTabView: View {
    @ObservedObject var platform: OnlinePlatform
    @ObservedObject var model: GameModel
    let onOpenAuth: () -> Void
    let onOpenBind: () -> Void
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
        VStack(alignment: .leading, spacing: 16) {
            if let user = platform.user, platform.isLoggedIn {
                callingCard(user)
                    .padding(.horizontal, Theme.Layout.pageInset)

                if user.isGuest {
                    guestUpgradeCard
                        .padding(.horizontal, Theme.Layout.pageInset)
                }

                if editing {
                    profileEditorCard
                        .padding(.horizontal, Theme.Layout.pageInset)
                }
            } else {
                notLoggedInCard
                    .padding(.horizontal, Theme.Layout.pageInset)
            }

            serverDashboardCard
                .padding(.horizontal, Theme.Layout.pageInset)
        }
        .confirmationDialog("确定退出当前云端账号？本地存档不受影响。", isPresented: $confirmLogout, titleVisibility: .visible) {
            Button("退出登临", role: .destructive) {
                Task {
                    await platform.logout()
                    onToast("已退出云端账号")
                }
            }
            Button("取消", role: .cancel) {}
        }
    }

    private func callingCard(_ u: OnlineUser) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top, spacing: 14) {
                PlayerSealBadge(char: u.sealChar, style: u.sealStyle, size: 54, filled: true)
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 7) {
                        Text(u.nickname)
                            .font(Theme.serif(21))
                            .foregroundStyle(Theme.ink)
                            .lineLimit(1)
                        Text(u.isGuest ? "游历游客" : u.id)
                            .font(Theme.caption)
                            .foregroundStyle(u.isGuest ? Theme.seal : Theme.ink2)
                            .padding(.horizontal, 7).padding(.vertical, 2)
                            .background((u.isGuest ? Theme.seal : Theme.ink).opacity(0.08), in: Capsule())
                    }
                    Text(u.bio)
                        .font(Theme.caption)
                        .foregroundStyle(Theme.ink2)
                        .lineLimit(2)
                    HStack(spacing: 6) {
                        Text("\(u.rank.grade) · \(u.rank.title)")
                            .font(Theme.label)
                            .foregroundStyle(Theme.seal)
                        Text("· 功勋 \(u.exp)")
                            .font(Theme.caption)
                            .foregroundStyle(Theme.ink2)
                            .monospacedDigit()
                    }
                    .padding(.top, 2)
                }
                Spacer(minLength: 4)
                Button {
                    GameFeel.shared.tap()
                    editNick = u.nickname
                    editBio = u.bio
                    editSealChar = u.sealChar
                    editSealStyle = u.sealStyle
                    withAnimation(Motion.panel) { editing.toggle() }
                } label: {
                    PhosphorIcon(glyph: .edit, size: 16, weight: .light)
                        .foregroundStyle(Theme.ink2)
                        .frame(width: 32, height: 32)
                        .background(Theme.wash.opacity(0.6), in: Circle())
                }
                .buttonStyle(PressStyle())
            }

            // 史官品秩晋升进度条
            VStack(alignment: .leading, spacing: 5) {
                HStack {
                    Text(u.rank.nextTitle.isEmpty ? "已臻极品 · 一代史圣" : "晋升「\(u.rank.nextTitle)」")
                        .font(Theme.caption).foregroundStyle(Theme.ink2)
                    Spacer()
                    Text(u.rank.nextTitle.isEmpty ? "满秩" : "\(u.exp) / \(u.rank.nextExp)")
                        .font(Theme.caption).foregroundStyle(Theme.ink2).monospacedDigit()
                }
                InkBar(fraction: u.rank.progress, color: Theme.seal, height: 4)
            }

            EditorialDivider()

            HStack(spacing: 10) {
                VStack(alignment: .leading, spacing: 2) {
                    Text(u.checkedInToday ? "今日已临朝落印" : "每日临朝签到")
                        .font(Theme.body).foregroundStyle(Theme.ink)
                    Text("已连签 \(u.checkinStreak) 日 · 累计 \(u.totalCheckins) 日")
                        .font(Theme.caption).foregroundStyle(Theme.ink2).monospacedDigit()
                }
                Spacer()
                EditorialTactileButton(
                    title: checkinBusy ? "落印中…" : (u.checkedInToday ? "已落印" : "临朝签到 +15"),
                    icon: u.checkedInToday ? .check : .stamp,
                    accent: u.checkedInToday,
                    solid: !u.checkedInToday,
                    compact: true,
                    disabled: checkinBusy || u.checkedInToday
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
        .padding(16)
        .background(Theme.vellumGradient, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(Theme.goldRim.opacity(0.75), lineWidth: 1)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 11, style: .continuous)
                .inset(by: 3.5)
                .stroke(Theme.goldRim.opacity(0.28), lineWidth: 0.6)
        )
    }

    private var guestUpgradeCard: some View {
        HStack(spacing: 12) {
            PhosphorIcon(glyph: .crown, size: 20, weight: .light).foregroundStyle(Theme.seal)
            VStack(alignment: .leading, spacing: 2) {
                Text("当前为游历游客身份").font(Theme.body).foregroundStyle(Theme.ink)
                Text("立籍绑定账号后可跨 iPhone / iPad 同步云存档，立赠 +20 功勋").font(Theme.caption).foregroundStyle(Theme.ink2)
            }
            Spacer(minLength: 6)
            EditorialTactileButton(title: "立籍转正", solid: true, compact: true) { onOpenBind() }
        }
        .padding(13)
        .background(Theme.seal.opacity(0.06), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(Theme.seal.opacity(0.28), lineWidth: 0.75))
    }

    private var profileEditorCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            EditorialSectionHeader(title: "修缮名帖", icon: .edit)
            TextField("", text: $editNick, prompt: Text("史官雅号（最多16字）").foregroundColor(Theme.ink2.opacity(0.6)))
                .paperField()
            TextField("", text: $editBio, prompt: Text("个人志言（最多48字）").foregroundColor(Theme.ink2.opacity(0.6)))
                .paperField()
            SealCustomizerCard(sealChar: $editSealChar, sealStyle: $editSealStyle)
            HStack(spacing: 10) {
                EditorialTactileButton(title: "收起", compact: true, fullWidth: true) {
                    withAnimation(Motion.panel) { editing = false }
                }
                EditorialTactileButton(title: savingProfile ? "保存中…" : "落印保存", solid: true, compact: true, fullWidth: true, disabled: savingProfile) {
                    Task {
                        savingProfile = true
                        let err = await platform.updateProfile(nickname: editNick, bio: editBio, sealChar: editSealChar, sealStyle: editSealStyle)
                        savingProfile = false
                        if let err {
                            GameFeel.shared.notify(.error)
                            onToast(err)
                        } else {
                            GameFeel.shared.notify(.success)
                            withAnimation(Motion.panel) { editing = false }
                            onToast("史官名帖与御印已更新")
                        }
                    }
                }
            }
        }
        .padding(14)
        .background(Theme.paperLight, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Theme.hairline, lineWidth: 0.8))
    }

    private var notLoggedInCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                PlayerSealBadge(char: "龙", style: "cinnabar", size: 46, filled: false)
                VStack(alignment: .leading, spacing: 3) {
                    Text("尚未登临云端行宫").font(Theme.serif(19)).foregroundStyle(Theme.ink)
                    Text("登录后解锁专属云端存档（国内极速直传）、定制篆刻御印、每日签到与天下史榜。").font(Theme.caption).foregroundStyle(Theme.ink2)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            SealButton(title: "前往列国登临阁（登录 / 注册）") { onOpenAuth() }
        }
        .padding(16)
        .background(Theme.vellumGradient, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Theme.goldRim.opacity(0.65), lineWidth: 0.9))
    }

    private var serverDashboardCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            EditorialSectionHeader(
                title: "专属云服务器态势",
                icon: .computer,
                trailing: platform.server?.region ?? "国内直连"
            )
            Group2 {
                Row(
                    label: "计算推流节点",
                    value: platform.server?.computeOnline == true ? "v6 主动推流在线" : "待机中"
                )
                Divider2()
                Row(
                    label: "网络往返延迟",
                    value: platform.apiRTTMs.map { "\($0) ms（极速直连）" } ?? "点击测速"
                )
                Divider2()
                Row(
                    label: "当前在线 / 累计史官",
                    value: platform.server.map { "\($0.onlineCount) 人在线 · 共 \($0.totalUsers) 位" } ?? "—"
                )
                Divider2()
                Row(
                    label: "服务器运行时长",
                    value: platform.server?.uptimeText ?? "—"
                )
                if let u = platform.user, platform.isLoggedIn {
                    Divider2()
                    Row(label: "账号云端卷宗", value: "\(u.cloudSaveCount) / \(u.cloudSaveQuota) 卷")
                }
            }

            HStack(spacing: 10) {
                EditorialTactileButton(title: pingBusy ? "测速中…" : "实时测速", icon: .speed, compact: true, fullWidth: true, disabled: pingBusy) {
                    Task {
                        pingBusy = true
                        let ms = await platform.pingServer()
                        pingBusy = false
                        onToast(ms.map { "云服实时响应 \($0) ms，链路畅通" } ?? "云服连接超时，请检查网络")
                    }
                }
                EditorialTactileButton(title: "云端卷宗", icon: .archive, compact: true, fullWidth: true) {
                    onOpenArchive()
                }
                if platform.isLoggedIn {
                    EditorialTactileButton(title: "退出", icon: .close, accent: true, compact: true) {
                        confirmLogout = true
                    }
                }
            }
        }
    }
}

// MARK: - 页签二：云更新检测与热更配置详情

private struct HubUpdateTabView: View {
    @ObservedObject var platform: OnlinePlatform
    @ObservedObject var cloud = CloudConfig.shared
    let onShowNotes: () -> Void
    let onToast: (String) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    VStack(alignment: .leading, spacing: 3) {
                        Text("客户端版本").font(Theme.caption).foregroundStyle(Theme.ink2)
                        Text("v\(OnlinePlatform.currentVersionString)（构建 \(OnlinePlatform.currentBuildNumber)）")
                            .font(Theme.serif(18)).foregroundStyle(Theme.ink).monospacedDigit()
                    }
                    Spacer()
                    if let upd = platform.updateInfo {
                        Text(upd.hasAppUpdate ? "发现 v\(upd.latestVersion)" : "已是最新")
                            .font(Theme.label)
                            .foregroundStyle(upd.hasAppUpdate ? Theme.paperLight : Theme.jade)
                            .padding(.horizontal, 10).padding(.vertical, 5)
                            .background(upd.hasAppUpdate ? Theme.seal : Theme.jade.opacity(0.12), in: Capsule())
                    }
                }

                EditorialDivider()

                HStack {
                    VStack(alignment: .leading, spacing: 3) {
                        Text("云端热更包（免重装即时生效）").font(Theme.caption).foregroundStyle(Theme.ink2)
                        Text("热更 v\(max(platform.hotpatchVersion, cloud.version))" + (platform.hotpatchSHA.isEmpty ? "" : " · #\(platform.hotpatchSHA.prefix(8))"))
                            .font(Theme.body).foregroundStyle(Theme.ink).monospacedDigit()
                        if !platform.hotpatchSummary.isEmpty {
                            Text(platform.hotpatchSummary).font(Theme.caption).foregroundStyle(Theme.ink2)
                        }
                    }
                    Spacer()
                }

                HStack(spacing: 10) {
                    EditorialTactileButton(
                        title: platform.checkingUpdate ? "检测中…" : "立即检测云更新",
                        icon: .refresh,
                        solid: true,
                        compact: true,
                        fullWidth: true,
                        disabled: platform.checkingUpdate
                    ) {
                        Task {
                            let applied = await platform.bootstrap(manual: true)
                            if platform.updateInfo?.hasAppUpdate == true {
                                onToast("检测到新版本 v\(platform.updateInfo?.latestVersion ?? "")，已呈递天诏更新卷")
                            } else if applied {
                                onToast("已自动拉取并生效最新云端热更包 v\(platform.hotpatchVersion)")
                            } else {
                                onToast("已校验：当前客户端与云端热更均为最新")
                            }
                        }
                    }

                    if platform.updateInfo?.hasAppUpdate == true {
                        EditorialTactileButton(title: "前往更新", icon: .lightning, accent: true, compact: true) {
                            platform.showUpdateSheet = true
                        }
                    }
                }
            }
            .padding(16)
            .background(Theme.vellumGradient, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Theme.goldRim.opacity(0.65), lineWidth: 0.9))
            .padding(.horizontal, Theme.Layout.pageInset)

            if let t = cloud.tuning {
                VStack(alignment: .leading, spacing: 10) {
                    EditorialSectionHeader(title: "已生效云端平衡参数", icon: .sliders, trailing: "热更自动同步")
                    Group2 {
                        Row(label: "战损烈度 / 围城速率", value: String(format: "%.1f× / %.1f×", t.lethality, t.siege))
                        Divider2()
                        Row(label: "列国战意 / 军团上限", value: String(format: "%.1f / %d 支", t.warEagerness, t.armyCap))
                        Divider2()
                        Row(label: "新地绥靖 / 叛乱阈值", value: "\(t.calmMonths) 月 / \(t.rebelMinProvinces) 州")
                    }
                }
                .padding(.horizontal, Theme.Layout.pageInset)
            }

            EditorialTactileButton(title: "查阅历代版本更新志", icon: .chronicle, fullWidth: true) {
                onShowNotes()
            }
            .padding(.horizontal, Theme.Layout.pageInset)
        }
    }
}

// MARK: - 页签三：驿报公告与兰台信匣

private struct HubNoticesTabView: View {
    @ObservedObject var platform: OnlinePlatform
    let onOpenAuth: () -> Void
    @State private var expandedMailId: Int?

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 10) {
                EditorialSectionHeader(title: "太史院驿报公告", icon: .edict, trailing: "\(platform.announcements.count) 则")
                if platform.announcements.isEmpty {
                    Text("暂无最新公告").font(Theme.body).foregroundStyle(Theme.ink2)
                } else {
                    ForEach(platform.announcements) { item in
                        VStack(alignment: .leading, spacing: 8) {
                            HStack(spacing: 8) {
                                Text(item.badge)
                                    .font(Theme.caption)
                                    .foregroundStyle(item.pinned ? Theme.paperLight : Theme.seal)
                                    .padding(.horizontal, 7).padding(.vertical, 2)
                                    .background(item.pinned ? Theme.seal : Theme.seal.opacity(0.10), in: RoundedRectangle(cornerRadius: 4, style: .continuous))
                                Text(item.title)
                                    .font(Theme.serif(16))
                                    .foregroundStyle(Theme.ink)
                                    .lineLimit(2)
                                Spacer(minLength: 4)
                            }
                            Text(item.content)
                                .font(Theme.label)
                                .foregroundStyle(Theme.ink2)
                                .fixedSize(horizontal: false, vertical: true)
                            Text(item.dateText)
                                .font(Theme.caption)
                                .foregroundStyle(Theme.ink2.opacity(0.75))
                                .monospacedDigit()
                        }
                        .padding(14)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Theme.paperLight.opacity(0.92), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(item.pinned ? Theme.goldRim.opacity(0.7) : Theme.hairline, lineWidth: 0.8))
                    }
                }
            }
            .padding(.horizontal, Theme.Layout.pageInset)

            VStack(alignment: .leading, spacing: 10) {
                EditorialSectionHeader(title: "兰台信匣", icon: .diplomacy, trailing: platform.isLoggedIn ? "\(platform.inbox.count) 封" : "需登录")
                if !platform.isLoggedIn {
                    HStack {
                        Text("登临云端账号后可接收系统诏书与版本致谢信件。").font(Theme.label).foregroundStyle(Theme.ink2)
                        Spacer()
                        EditorialTactileButton(title: "登录", solid: true, compact: true) { onOpenAuth() }
                    }
                    .padding(14)
                    .background(Theme.paperLight, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(Theme.hairline, lineWidth: 0.7))
                } else if platform.inbox.isEmpty {
                    Text("信匣尚空").font(Theme.body).foregroundStyle(Theme.ink2)
                } else {
                    Group2 {
                        ForEach(Array(platform.inbox.enumerated()), id: \.element.id) { idx, mail in
                            if idx > 0 { Divider2() }
                            Button {
                                GameFeel.shared.tap()
                                withAnimation(Motion.panel) {
                                    expandedMailId = (expandedMailId == mail.id) ? nil : mail.id
                                }
                                if !mail.read { Task { await platform.markMailRead(mail) } }
                            } label: {
                                VStack(alignment: .leading, spacing: 6) {
                                    HStack(spacing: 8) {
                                        if !mail.read {
                                            Circle().fill(Theme.seal).frame(width: 7, height: 7)
                                        }
                                        Text(mail.title).font(Theme.serif(15.5)).foregroundStyle(Theme.ink)
                                        Spacer()
                                        Text(mail.dateText).font(Theme.caption).foregroundStyle(Theme.ink2).monospacedDigit()
                                    }
                                    Text("落款：\(mail.sender)").font(Theme.caption).foregroundStyle(Theme.ink2)
                                    if expandedMailId == mail.id {
                                        Text(mail.content)
                                            .font(Theme.body)
                                            .foregroundStyle(Theme.ink)
                                            .fixedSize(horizontal: false, vertical: true)
                                            .padding(.top, 4)
                                    }
                                }
                                .padding(.vertical, 12)
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
            .padding(.horizontal, Theme.Layout.pageInset)
        }
    }
}

// MARK: - 页签四：天下史榜（全服排行 & 一键铭刻史册）

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

            if platform.leaderboard.isEmpty {
                VStack(spacing: 10) {
                    PhosphorIcon(glyph: .trophy, size: 28, weight: .light).foregroundStyle(Theme.gold)
                    Text("史榜尚虚位以待").font(Theme.serif(17)).foregroundStyle(Theme.ink)
                    Text("开创新世界并推演后，点击下方「铭刻当前世界入榜」即可留名全服青史！").font(Theme.caption).foregroundStyle(Theme.ink2).multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 28)
                .padding(.horizontal, 24)
            } else {
                Group2 {
                    ForEach(Array(platform.leaderboard.enumerated()), id: \.element.id) { idx, entry in
                        if idx > 0 { Divider2() }
                        leaderboardRow(entry)
                    }
                }
                .padding(.horizontal, Theme.Layout.pageInset)
            }

            VStack(spacing: 8) {
                if platform.isLoggedIn {
                    SealButton(
                        title: reporting ? "铭刻中…" : (model.state == nil ? "进入一局世界即可铭刻入榜" : "铭刻当前世界入天下史榜"),
                        busy: reporting,
                        disabled: reporting || model.state == nil
                    ) {
                        Task { await engraveCurrentWorld() }
                    }
                } else {
                    EditorialTactileButton(title: "登临账号后铭刻青史", icon: .crown, solid: true, fullWidth: true) {
                        onOpenAuth()
                    }
                }
            }
            .padding(.horizontal, Theme.Layout.pageInset)
        }
    }

    private func leaderboardRow(_ e: LeaderboardEntry) -> some View {
        let medalText: String = {
            switch e.rank {
            case 1: return "甲"
            case 2: return "乙"
            case 3: return "丙"
            default: return "\(e.rank)"
            }
        }()
        let medalColor: Color = {
            switch e.rank {
            case 1: return Color(red: 0.72, green: 0.52, blue: 0.16)
            case 2: return Color(red: 0.45, green: 0.48, blue: 0.52)
            case 3: return Color(red: 0.62, green: 0.37, blue: 0.24)
            default: return Theme.ink2
            }
        }()
        let statText: String = {
            switch category {
            case "years": return "\(e.yearsElapsed) 载"
            case "exp": return "\(e.exp) 功勋"
            default: return "\(e.provincesHeld) 州"
            }
        }()

        return HStack(spacing: 11) {
            Text(medalText)
                .font(Theme.serif(e.rank <= 3 ? 15 : 13))
                .foregroundStyle(e.rank <= 3 ? Theme.paperLight : medalColor)
                .frame(width: 26, height: 26)
                .background(e.rank <= 3 ? medalColor : Theme.wash.opacity(0.7), in: RoundedRectangle(cornerRadius: 6, style: .continuous))

            PlayerSealBadge(char: e.sealChar, style: e.sealStyle, size: 34, filled: false)

            VStack(alignment: .leading, spacing: 2.5) {
                HStack(spacing: 6) {
                    Text(e.nickname).font(Theme.serif(15.5)).foregroundStyle(Theme.ink).lineLimit(1)
                    Text(e.rankTitle).font(Theme.caption).foregroundStyle(Theme.ink2)
                }
                if !e.worldTitle.isEmpty {
                    Text("\(e.worldTitle) · \(e.topNation)\(e.wondersCount > 0 ? " · \(e.wondersCount)奇观" : "")")
                        .font(Theme.caption).foregroundStyle(Theme.ink2).lineLimit(1)
                }
            }
            Spacer(minLength: 6)
            EditorialValueText(statText, size: 17, color: e.rank == 1 ? Theme.seal : Theme.ink)
        }
        .padding(.vertical, 11)
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
            worldTitle: title,
            topNation: topName,
            provincesHeld: topProvs,
            totalDays: s.day,
            nationsCount: held.count,
            warsCount: s.wars.count,
            wondersCount: s.wonders?.count ?? 0
        )
        reporting = false
        if let err {
            GameFeel.shared.notify(.error)
            onToast(err)
        } else {
            GameFeel.shared.notify(.success)
            onToast("「\(title)」已铭刻入全服天下史榜！")
        }
    }
}
