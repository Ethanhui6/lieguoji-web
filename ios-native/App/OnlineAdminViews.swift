import SwiftUI

// MARK: - 「御前司礼监」管理员中枢（仅 ethanhui 管理员账号可见，全部操作经服务端 RBAC 强校验）

struct HubAdminTabView: View {
    @ObservedObject var platform: OnlinePlatform
    @ObservedObject var hotPack: HotPackManager
    let onToast: (String) -> Void

    @State private var subTab = "edict" // "edict" | "hot" | "users" | "monitor"
    @State private var overview: AdminOverview?
    @State private var users: [AdminUserRow] = []
    @State private var userQuery = ""
    @State private var busy = false

    // 政令字段
    @State private var noticeText = ""
    @State private var annBadge = "置顶"
    @State private var annTitle = ""
    @State private var annBody = ""
    @State private var annPinned = true
    @State private var mailTarget = "*"
    @State private var mailTitle = ""
    @State private var mailBody = ""
    @State private var maintenanceOn = false
    @State private var maintenanceMsg = ""

    // 热更字段
    @State private var lethality = 2.0
    @State private var siege = 6.0
    @State private var eagerness = 3.4
    @State private var armyCap = 900
    @State private var pace1 = 1
    @State private var pace4 = 2
    @State private var pace16 = 5
    @State private var relVersion = "5.7.0"
    @State private var relBuild = "187"
    @State private var relForce = false
    @State private var packTag = ""
    @State private var packSummary = ""

    var body: some View {
        ViewBoundary {
            VStack(alignment: .leading, spacing: 14) {
                ChipPicker(
                    items: [("edict", "政令"), ("hot", "热更"), ("users", "史官"), ("monitor", "机枢")],
                    selection: $subTab
                )
                .padding(.horizontal, Theme.Layout.pageInset)

                switch subTab {
                case "hot": hotSection
                case "users": usersSection
                case "monitor": monitorSection
                default: edictSection
                }
            }
            .task { await loadOverview() }
            .onChange(of: subTab) { _, next in
                if next == "users" && users.isEmpty { Task { users = await platform.fetchAdminUsers() } }
                if next == "monitor" { Task { await loadOverview() } }
            }
        }
    }

    private func loadOverview() async {
        guard let ov = await platform.fetchAdminOverview() else { return }
        overview = ov
        noticeText = ov.notice
        maintenanceOn = ov.maintenance
        maintenanceMsg = ov.maintenanceMessage
        relVersion = ov.latestVersion
        relBuild = "\(ov.latestBuild)"
        relForce = ov.forceUpdate
        if let t = ov.tuning {
            lethality = t["lethality"] ?? lethality
            siege = t["siege"] ?? siege
            eagerness = t["warEagerness"] ?? eagerness
            if let cap = t["armyCap"] { armyCap = Int(cap) }
        }
        if let p = ov.pace {
            pace1 = p["1"] ?? pace1
            pace4 = p["4"] ?? pace4
            pace16 = p["16"] ?? pace16
        }
    }

    // MARK: 1. 政令（跑马灯 / 公告 / 全服信匣 / 维护模式）

    private var edictSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            SectionLabel("标题页实时跑马灯")
            Group2 {
                VStack(alignment: .leading, spacing: 10) {
                    TextField("", text: $noticeText, prompt: Text("输入全服跑马灯内容（留空则隐藏）").foregroundColor(Theme.ink2.opacity(0.55)))
                        .paperField()
                    EditorialTactileButton(title: busy ? "颁行中…" : "立即更新跑马灯", icon: .edict, solid: true, compact: true, fullWidth: true, disabled: busy) {
                        Task {
                            busy = true
                            let err = await platform.adminPost("/api/v1/admin/notice", body: ["notice": noticeText])
                            if err == nil { _ = await platform.bootstrap(manual: true, autoPrompt: false) }
                            busy = false
                            onToast(err ?? "跑马灯已热更新至全服")
                        }
                    }
                }
                .padding(.vertical, 12)
            }
            .padding(.horizontal, Theme.Layout.pageInset)

            SectionLabel("发布太史院公告")
            Group2 {
                VStack(alignment: .leading, spacing: 10) {
                    ChipPicker(items: [("置顶", "置顶"), ("更新", "更新"), ("公告", "公告"), ("维护", "维护")], selection: $annBadge)
                    TextField("", text: $annTitle, prompt: Text("公告标题").foregroundColor(Theme.ink2.opacity(0.55)))
                        .paperField()
                    TextField("", text: $annBody, prompt: Text("公告正文").foregroundColor(Theme.ink2.opacity(0.55)), axis: .vertical)
                        .lineLimit(3...6)
                        .font(Theme.body).foregroundStyle(Theme.ink).tint(Theme.seal)
                        .padding(10)
                        .background(Theme.paperLight, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).stroke(Theme.hairline, lineWidth: 0.75))
                    PaperSwitch(title: "置顶显示", on: $annPinned)
                    EditorialTactileButton(title: "颁布公告", icon: .stamp, solid: true, compact: true, fullWidth: true, disabled: busy || annTitle.isEmpty || annBody.isEmpty) {
                        Task {
                            busy = true
                            let err = await platform.adminPost("/api/v1/admin/announcement", body: [
                                "badge": annBadge, "title": annTitle, "content": annBody, "pinned": annPinned
                            ])
                            if err == nil {
                                annTitle = ""; annBody = ""
                                _ = await platform.bootstrap(manual: true, autoPrompt: false)
                            }
                            busy = false
                            onToast(err ?? "新公告已发布至全服")
                        }
                    }
                }
                .padding(.vertical, 12)
            }
            .padding(.horizontal, Theme.Layout.pageInset)

            if !platform.announcements.isEmpty {
                SectionLabel("管理现有公告")
                Group2 {
                    ForEach(Array(platform.announcements.enumerated()), id: \.element.id) { idx, item in
                        if idx > 0 { Divider2() }
                        HStack(spacing: 10) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text("[\(item.badge)] \(item.title)").font(Theme.body).foregroundStyle(Theme.ink).lineLimit(1)
                                Text(item.dateText).font(Theme.caption).foregroundStyle(Theme.ink2)
                            }
                            Spacer()
                            Button("撤下") {
                                Task {
                                    let err = await platform.adminDeleteAnnouncement(id: item.id)
                                    onToast(err ?? "已撤下该公告")
                                }
                            }
                            .font(Theme.caption).foregroundStyle(Theme.seal)
                        }
                        .padding(.horizontal, 4).padding(.vertical, 10)
                    }
                }
                .padding(.horizontal, Theme.Layout.pageInset)
            }

            SectionLabel("兰台诏书群发 / 私信")
            Group2 {
                VStack(alignment: .leading, spacing: 10) {
                    TextField("", text: $mailTarget, prompt: Text("收件人：* 为全服，或填账号名/UID").foregroundColor(Theme.ink2.opacity(0.55)))
                        .paperField().textInputAutocapitalization(.never)
                    TextField("", text: $mailTitle, prompt: Text("诏书标题").foregroundColor(Theme.ink2.opacity(0.55)))
                        .paperField()
                    TextField("", text: $mailBody, prompt: Text("诏书正文").foregroundColor(Theme.ink2.opacity(0.55)), axis: .vertical)
                        .lineLimit(2...5)
                        .font(Theme.body).foregroundStyle(Theme.ink).tint(Theme.seal)
                        .padding(10)
                        .background(Theme.paperLight, in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).stroke(Theme.hairline, lineWidth: 0.75))
                    EditorialTactileButton(title: "发送兰台诏书", icon: .diplomacy, solid: true, compact: true, fullWidth: true, disabled: busy || mailTitle.isEmpty || mailBody.isEmpty) {
                        Task {
                            busy = true
                            let err = await platform.adminPost("/api/v1/admin/mail", body: [
                                "target": mailTarget, "title": mailTitle, "content": mailBody
                            ])
                            if err == nil { mailTitle = ""; mailBody = ""; await platform.refreshInbox() }
                            busy = false
                            onToast(err ?? "兰台诏书已送达")
                        }
                    }
                }
                .padding(.vertical, 12)
            }
            .padding(.horizontal, Theme.Layout.pageInset)

            SectionLabel("全服维护开关")
            Group2 {
                VStack(alignment: .leading, spacing: 10) {
                    PaperSwitch(title: "开启维护模式（管理员不受限）", on: $maintenanceOn)
                    TextField("", text: $maintenanceMsg, prompt: Text("维护提示语").foregroundColor(Theme.ink2.opacity(0.55)))
                        .paperField()
                    EditorialTactileButton(title: "保存维护状态", compact: true, fullWidth: true, disabled: busy) {
                        Task {
                            busy = true
                            let err = await platform.adminPost("/api/v1/admin/release", body: [
                                "maintenance": maintenanceOn, "maintenanceMessage": maintenanceMsg
                            ])
                            busy = false
                            onToast(err ?? (maintenanceOn ? "已开启全服维护模式" : "已恢复正常开放"))
                        }
                    }
                }
                .padding(.vertical, 10)
            }
            .padding(.horizontal, Theme.Layout.pageInset)
        }
    }

    // MARK: 2. 热更（平衡数值 / 推演节拍 / 资源热更包版本 / 客户端版本）

    private var hotSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            SectionLabel("全服平衡与推演节拍热更（免换包立即生效）")
            Group2 {
                VStack(alignment: .leading, spacing: 10) {
                    PaperSlider(title: "战损烈度", value: $lethality, range: 0.5...5.0, step: 0.25) { String(format: "%.2f×", $0) }
                    PaperSlider(title: "围城速率", value: $siege, range: 1.0...12.0, step: 0.5) { String(format: "%.1f×", $0) }
                    PaperSlider(title: "列国战意", value: $eagerness, range: 0.5...5.0, step: 0.2) { String(format: "%.1f", $0) }
                    PaperStepper(title: "军团上限", value: $armyCap, range: 200...1600, unit: "支")
                    Divider2()
                    PaperStepper(title: "1× 倍速步进", value: $pace1, range: 1...10, unit: "日")
                    PaperStepper(title: "4× 倍速步进", value: $pace4, range: 1...24, unit: "日")
                    PaperStepper(title: "16× 倍速步进", value: $pace16, range: 2...56, unit: "日")
                    SealButton(title: busy ? "推送中…" : "推送全服平衡热更", busy: busy, disabled: busy) {
                        Task {
                            busy = true
                            let pace2 = max(pace1, (pace1 + pace4) / 2)
                            let pace8 = max(pace4, (pace4 + pace16) / 2)
                            let err = await platform.adminPost("/api/v1/admin/tuning", body: [
                                "tuning": ["lethality": lethality, "siege": siege, "warEagerness": eagerness, "armyCap": armyCap],
                                "pace": ["1": pace1, "2": pace2, "4": pace4, "8": pace8, "16": pace16]
                            ])
                            if err == nil { _ = await platform.bootstrap(manual: true, autoPrompt: false) }
                            busy = false
                            onToast(err ?? "平衡与推演节拍已热更推送全服")
                        }
                    }
                }
                .padding(.horizontal, 4).padding(.vertical, 12)
            }
            .padding(.horizontal, Theme.Layout.pageInset)

            SectionLabel("游戏内资源热更包发布（免换包）")
            Group2 {
                VStack(alignment: .leading, spacing: 10) {
                    Row(
                        label: "当前云端热更包",
                        value: overview.map { "v\($0.hotpackVersion) · \(HotPackManager.formatBytes($0.hotpackBytes))（\($0.hotpackFiles) 项）" } ?? "读取中"
                    )
                    TextField("", text: $packTag, prompt: Text("新热更包标题（如 v2026.12 · 剧本增补）").foregroundColor(Theme.ink2.opacity(0.55)))
                        .paperField()
                    TextField("", text: $packSummary, prompt: Text("热更说明摘要").foregroundColor(Theme.ink2.opacity(0.55)))
                        .paperField()
                    EditorialTactileButton(title: "重扫资源并发布新版热更包", icon: .refresh, solid: true, compact: true, fullWidth: true, disabled: busy) {
                        Task {
                            busy = true
                            let err = await platform.adminPost("/api/v1/admin/hotpack/bump", body: [
                                "releaseTag": packTag, "summary": packSummary
                            ])
                            if err == nil {
                                await loadOverview()
                                _ = await hotPack.checkManifest(autoPrompt: false)
                            }
                            busy = false
                            onToast(err ?? "热更资源清单已刷新并全服发布")
                        }
                    }
                }
                .padding(.vertical, 12)
            }
            .padding(.horizontal, Theme.Layout.pageInset)

            SectionLabel("客户端版本标定")
            Group2 {
                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 10) {
                        TextField("", text: $relVersion, prompt: Text("版本号").foregroundColor(Theme.ink2.opacity(0.55))).paperField()
                        TextField("", text: $relBuild, prompt: Text("构建号").foregroundColor(Theme.ink2.opacity(0.55))).paperField().keyboardType(.numberPad)
                    }
                    PaperSwitch(title: "强制要求升级客户端", on: $relForce)
                    EditorialTactileButton(title: "更新版本元数据", compact: true, fullWidth: true, disabled: busy) {
                        Task {
                            busy = true
                            let err = await platform.adminPost("/api/v1/admin/release", body: [
                                "latestVersion": relVersion,
                                "latestBuild": Int(relBuild) ?? 186,
                                "forceUpdate": relForce
                            ])
                            busy = false
                            onToast(err ?? "版本信息已保存")
                        }
                    }
                }
                .padding(.vertical, 12)
            }
            .padding(.horizontal, Theme.Layout.pageInset)
        }
    }

    // MARK: 3. 史官管理

    private var usersSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                TextField("", text: $userQuery, prompt: Text("搜索账号、雅号或 UID").foregroundColor(Theme.ink2.opacity(0.55)))
                    .paperField().textInputAutocapitalization(.never)
                EditorialTactileButton(title: "检索", icon: .search, solid: true, compact: true) {
                    Task { users = await platform.fetchAdminUsers(query: userQuery) }
                }
            }
            .padding(.horizontal, Theme.Layout.pageInset)

            Group2 {
                if users.isEmpty {
                    Text("暂无匹配的史官记录").font(Theme.body).foregroundStyle(Theme.ink2).padding(.vertical, 16)
                } else {
                    ForEach(Array(users.enumerated()), id: \.element.id) { idx, u in
                        if idx > 0 { Divider2() }
                        VStack(alignment: .leading, spacing: 8) {
                            HStack(spacing: 10) {
                                PlayerSealBadge(char: u.sealChar, style: u.sealStyle, size: 30, filled: u.role == "admin")
                                VStack(alignment: .leading, spacing: 2) {
                                    HStack(spacing: 6) {
                                        Text(u.nickname).font(Theme.serif(15)).foregroundStyle(Theme.ink)
                                        Text(u.role == "admin" ? "管理员" : (u.banned ? "已封禁" : u.id))
                                            .font(Theme.caption)
                                            .foregroundStyle(u.role == "admin" || u.banned ? Theme.seal : Theme.ink2)
                                    }
                                    Text("\(u.username.isEmpty ? "游客" : u.username) · \(u.rankTitle) · \(u.exp) 功勋 · \(u.cloudSaveCount) 卷存档")
                                        .font(Theme.caption).foregroundStyle(Theme.ink2).monospacedDigit()
                                }
                                Spacer()
                            }
                            HStack(spacing: 8) {
                                EditorialTactileButton(title: "+100 功勋", compact: true) {
                                    Task {
                                        let err = await platform.adminPost("/api/v1/admin/users/\(u.id)", body: ["expDelta": 100])
                                        users = await platform.fetchAdminUsers(query: userQuery)
                                        onToast(err ?? "已为 \(u.nickname) 赏赐 +100 功勋")
                                    }
                                }
                                EditorialTactileButton(title: "清榜", compact: true) {
                                    Task {
                                        let err = await platform.adminPost("/api/v1/admin/users/\(u.id)", body: ["clearLeaderboard": true])
                                        onToast(err ?? "已移除其史榜记录")
                                    }
                                }
                                if u.role != "admin" {
                                    EditorialTactileButton(title: u.banned ? "解封" : "封禁", accent: !u.banned, compact: true) {
                                        Task {
                                            let err = await platform.adminPost("/api/v1/admin/users/\(u.id)", body: ["banned": !u.banned])
                                            users = await platform.fetchAdminUsers(query: userQuery)
                                            onToast(err ?? (u.banned ? "已解封" : "已封禁该账号"))
                                        }
                                    }
                                }
                            }
                        }
                        .padding(.horizontal, 4).padding(.vertical, 10)
                    }
                }
            }
            .padding(.horizontal, Theme.Layout.pageInset)
        }
    }

    // MARK: 4. 机枢（仅管理员可见的真实服务器硬件、计算服 v9 与安全防护监控）

    private var monitorSection: some View {
        VStack(alignment: .leading, spacing: 14) {
            if let ov = overview {
                SectionLabel("计算引擎 v9 实时态势")
                Group2 {
                    Row(label: "计算服链路", value: ov.compute.online ? "在线（\(ov.compute.rttMs ?? 1) ms）" : "离线")
                    Divider2()
                    Row(label: "推演状态 / 地图规模", value: (ov.compute.playing ? "推流中" : "空闲") + " · \(ov.compute.provinces) 州 · \(ov.compute.clients) 连接")
                    Divider2()
                    Row(label: "平均单步耗时", value: ov.compute.stepMs > 0 ? "\(ov.compute.stepMs) ms/步" : "待测")
                }
                .padding(.horizontal, Theme.Layout.pageInset)

                SectionLabel("主机资源与用户统计")
                Group2 {
                    Row(label: "CPU 负载（1m）", value: String(format: "%.2f", ov.host.cpuLoad1m))
                    Divider2()
                    Row(label: "内存使用", value: "\(ov.host.memUsedMB) / \(ov.host.memTotalMB) MB")
                    Divider2()
                    Row(label: "磁盘余量", value: String(format: "%.1f / %.1f GB", ov.host.diskFreeGB, ov.host.diskTotalGB))
                    Divider2()
                    Row(label: "在线 / 累计史官", value: "\(ov.onlineCount) 人在线 · 共 \(ov.totalUsers) 位 · \(ov.totalSaves) 卷云档")
                }
                .padding(.horizontal, Theme.Layout.pageInset)

                SectionLabel("安全防护拦截统计")
                Group2 {
                    Row(label: "已拦截限流 / 恶意请求", value: "\(ov.security.blockedRequests) 次")
                    Divider2()
                    Row(label: "恶意路径扫描陷阱命中", value: "\(ov.security.scannerHits) 次")
                    Divider2()
                    Row(label: "失败登录 / 临时封锁 IP", value: "\(ov.security.loginFailures) 次 · \(ov.security.activeBlockedIPs) 个")
                }
                .padding(.horizontal, Theme.Layout.pageInset)
            } else {
                HStack(spacing: 8) {
                    InkBusy().frame(width: 24, height: 24)
                    Text("正在读取机枢遥测…").font(Theme.label).foregroundStyle(Theme.ink2)
                }
                .padding(.horizontal, Theme.Layout.pageInset)
            }

            EditorialTactileButton(title: "刷新监控数据", icon: .refresh, fullWidth: true) {
                Task { await loadOverview(); onToast("机枢数据已刷新") }
            }
            .padding(.horizontal, Theme.Layout.pageInset)
        }
    }
}
