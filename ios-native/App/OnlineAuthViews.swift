import SwiftUI
import UIKit

// MARK: - 玩家专属篆刻御印组件（朱砂红 / 翡翠青 / 宫廷鎏金 三色印泥）

enum SealInkPalette {
    static let presetChars = ["龙", "帝", "汉", "唐", "秦", "明", "楚", "帅", "史", "墨"]
    static let styles: [(id: String, name: String, color: Color)] = [
        ("cinnabar", "皇家朱砂", Theme.seal),
        ("jade", "翡翠官青", Color(red: 0.18, green: 0.37, blue: 0.31)),
        ("gold", "宫廷鎏金", Color(red: 0.63, green: 0.46, blue: 0.19)),
    ]

    static func color(for style: String) -> Color {
        styles.first(where: { $0.id == style })?.color ?? Theme.seal
    }
}

struct PlayerSealBadge: View {
    let char: String
    var style: String = "cinnabar"
    var size: CGFloat = 36
    var filled: Bool = false

    var body: some View {
        let tint = SealInkPalette.color(for: style)
        let displayChar = char.trimmingCharacters(in: .whitespacesAndNewlines).prefix(1)
        ZStack {
            RoundedRectangle(cornerRadius: max(4, size * 0.14), style: .continuous)
                .fill(filled ? tint : Theme.paperLight.opacity(0.95))
            SealFace(
                text: displayChar.isEmpty ? "龙" : String(displayChar),
                size: size * 0.92,
                color: tint,
                filled: filled
            )
        }
        .frame(width: size, height: size)
        .overlay(
            RoundedRectangle(cornerRadius: max(4, size * 0.14), style: .continuous)
                .stroke(tint.opacity(0.28), lineWidth: 0.7)
        )
        .rotationEffect(.degrees(-3))
    }
}

// MARK: - 标题页右上角「御前网游名帖胶囊」与服务器状态入口

struct TitleOnlineHeader: View {
    @ObservedObject var platform: OnlinePlatform
    let onOpenHub: (String) -> Void
    let onOpenAuth: () -> Void
    let onOpenUpdate: () -> Void

    var body: some View {
        VStack(alignment: .trailing, spacing: 8) {
            Button {
                GameFeel.shared.tap()
                if platform.isLoggedIn {
                    onOpenHub("profile")
                } else {
                    onOpenAuth()
                }
            } label: {
                HStack(spacing: 9) {
                    if let u = platform.user, platform.isLoggedIn {
                        PlayerSealBadge(char: u.sealChar, style: u.sealStyle, size: 30, filled: true)
                        VStack(alignment: .leading, spacing: 1.5) {
                            HStack(spacing: 5) {
                                Text(u.nickname)
                                    .font(Theme.serif(14))
                                    .foregroundStyle(Theme.ink)
                                    .lineLimit(1)
                                if platform.hasPendingBadge {
                                    Circle().fill(Theme.seal).frame(width: 6, height: 6)
                                }
                            }
                            Text("\(u.rank.grade) · \(u.rank.title)")
                                .font(Theme.caption)
                                .foregroundStyle(Theme.ink2)
                                .lineLimit(1)
                        }
                    } else {
                        ZStack {
                            RoundedRectangle(cornerRadius: 6, style: .continuous)
                                .fill(Theme.seal.opacity(0.11))
                                .frame(width: 28, height: 28)
                            PhosphorIcon(glyph: .person, size: 15, weight: .light)
                                .foregroundStyle(Theme.seal)
                        }
                        VStack(alignment: .leading, spacing: 1) {
                            Text("登临云端")
                                .font(Theme.serif(14))
                                .foregroundStyle(Theme.ink)
                            Text("登录 · 同步存档")
                                .font(Theme.caption)
                                .foregroundStyle(Theme.ink2)
                        }
                    }
                    PhosphorIcon(glyph: .chevronRight, size: 11, weight: .light)
                        .foregroundStyle(Theme.ink2.opacity(0.7))
                }
                .padding(.leading, 8)
                .padding(.trailing, 11)
                .padding(.vertical, 6)
                .background(Theme.vellumGradient, in: Capsule())
                .overlay(Capsule().stroke(Theme.goldRim.opacity(0.65), lineWidth: 0.9))
                .shadow(color: Color.black.opacity(0.16), radius: 8, y: 3)
            }
            .buttonStyle(PressStyle())

            HStack(spacing: 6) {
                if platform.updateInfo?.hasAppUpdate == true {
                    Button {
                        GameFeel.shared.tap()
                        onOpenUpdate()
                    } label: {
                        HStack(spacing: 4) {
                            PhosphorIcon(glyph: .lightning, size: 11, weight: .fill)
                            Text("新版 v\(platform.updateInfo?.latestVersion ?? "")")
                                .font(Theme.caption)
                        }
                        .foregroundStyle(Theme.paperLight)
                        .padding(.horizontal, 9)
                        .padding(.vertical, 4.5)
                        .background(Theme.seal, in: Capsule())
                        .shadow(color: Theme.seal.opacity(0.28), radius: 5, y: 2)
                    }
                    .buttonStyle(PressStyle())
                }

                Button {
                    GameFeel.shared.tap()
                    onOpenHub("notices")
                } label: {
                    HStack(spacing: 5) {
                        Circle()
                            .fill(platform.server?.computeOnline == true ? Color(red: 0.22, green: 0.62, blue: 0.42) : Color.orange)
                            .frame(width: 6.5, height: 6.5)
                        Text(serverPillText)
                            .font(Theme.caption)
                            .foregroundStyle(Theme.ink)
                            .monospacedDigit()
                            .lineLimit(1)
                    }
                    .padding(.horizontal, 9)
                    .padding(.vertical, 4.5)
                    .background(Theme.paperLight.opacity(0.92), in: Capsule())
                    .overlay(Capsule().stroke(Theme.ink.opacity(0.14), lineWidth: 0.7))
                }
                .buttonStyle(PressStyle())
            }
        }
    }

    private var serverPillText: String {
        if let srv = platform.server {
            let ms = platform.apiRTTMs.map { " \($0)ms" } ?? ""
            return "九州服\(ms) · \(srv.onlineCount)人"
        }
        return platform.checkingUpdate ? "连接云服…" : "离线待命"
    }
}

// MARK: - 「列国登临阁」古典登录 / 注册 / 游客入世门扉

struct AuthPortalSheet: View {
    @ObservedObject var platform: OnlinePlatform
    var onAuthenticated: (() -> Void)? = nil
    @Environment(\.dismiss) private var dismiss

    @State private var mode = "login" // "login" | "register"
    @State private var username = ""
    @State private var password = ""
    @State private var nickname = ""
    @State private var sealChar = "龙"
    @State private var sealStyle = "cinnabar"
    @State private var showPassword = false
    @State private var busy = false
    @State private var errorMessage: String?

    var body: some View {
        ViewBoundary {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    portalHeader
                    ChipPicker(items: [("login", "凭帖登临"), ("register", "立籍封侯")], selection: $mode)
                        .padding(.horizontal, Theme.Layout.pageInset)

                    formFields
                        .padding(.horizontal, Theme.Layout.pageInset)

                    if mode == "register" {
                        SealCustomizerCard(sealChar: $sealChar, sealStyle: $sealStyle)
                            .padding(.horizontal, Theme.Layout.pageInset)
                    }

                    if let err = errorMessage {
                        HStack(spacing: 8) {
                            PhosphorIcon(glyph: .warning, size: 15, weight: .fill)
                                .foregroundStyle(Theme.seal)
                            Text(err)
                                .font(Theme.label)
                                .foregroundStyle(Theme.seal)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .padding(.horizontal, 14)
                        .padding(.vertical, 10)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Theme.seal.opacity(0.08), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                        .overlay(RoundedRectangle(cornerRadius: 8, style: .continuous).stroke(Theme.seal.opacity(0.25), lineWidth: 0.7))
                        .padding(.horizontal, Theme.Layout.pageInset)
                    }

                    VStack(spacing: 12) {
                        SealButton(
                            title: mode == "login" ? "落印登临" : "立籍封侯并登临",
                            busy: busy,
                            disabled: busy || username.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || password.isEmpty
                        ) {
                            Task { await submitForm() }
                        }

                        HStack(spacing: 12) {
                            Rectangle().fill(Theme.hairline).frame(height: 0.75)
                            Text("或免密先游").font(Theme.caption).foregroundStyle(Theme.ink2)
                            Rectangle().fill(Theme.hairline).frame(height: 0.75)
                        }
                        .padding(.vertical, 2)

                        EditorialTactileButton(
                            title: "游客一印入世（支持随时转正绑定）",
                            icon: .stamp,
                            accent: false,
                            solid: false,
                            compact: false,
                            fullWidth: true,
                            disabled: busy
                        ) {
                            Task { await enterAsGuest() }
                        }
                    }
                    .padding(.horizontal, Theme.Layout.pageInset)

                    serverTrustFooter
                        .padding(.horizontal, Theme.Layout.pageInset)
                }
                .padding(.bottom, 28)
            }
            .scrollIndicators(.hidden)
            .scrollDismissesKeyboard(.interactively)
            .background(MemorialPaper().ignoresSafeArea())
        }
    }

    private var portalHeader: some View {
        ZStack(alignment: .bottom) {
            // 宣纸远山书眉装饰画幅（纯矢量零卡顿）
            ZStack(alignment: .bottom) {
                LinearGradient(
                    colors: [Theme.wash.opacity(0.65), Theme.paper.opacity(0.15)],
                    startPoint: .top, endPoint: .bottom
                )
                InkHills(seed: 19)
                    .fill(Theme.ink.opacity(0.065))
                    .frame(height: 74)
                InkHills(seed: 7)
                    .fill(Theme.ink.opacity(0.095))
                    .frame(height: 44)
                RadialGradient(
                    colors: [Theme.seal.opacity(0.09), .clear],
                    center: .topTrailing, startRadius: 10, endRadius: 180
                )
            }
            .frame(height: 158)
            .clipped()

            VStack(spacing: 8) {
                SheetGrabber()
                HStack(alignment: .center, spacing: 14) {
                    PlayerSealBadge(
                        char: mode == "register" ? sealChar : "龙",
                        style: mode == "register" ? sealStyle : "cinnabar",
                        size: 46,
                        filled: true
                    )
                    VStack(alignment: .leading, spacing: 4) {
                        Text("列國登臨閣")
                            .font(Theme.serif(25))
                            .tracking(3.2)
                            .foregroundStyle(Theme.ink)
                        Text("云端一脉 · 跨端同卷 · 史册长存")
                            .font(Theme.caption)
                            .tracking(1.0)
                            .foregroundStyle(Theme.ink2)
                    }
                    Spacer()
                    CardCloseButton { dismiss() }
                }
                .padding(.horizontal, Theme.Layout.pageInset)
                .padding(.bottom, 16)
            }

            Rectangle().fill(Theme.goldRim.opacity(0.55)).frame(height: 1)
        }
    }

    private var formFields: some View {
        VStack(alignment: .leading, spacing: 12) {
            labeledInput(
                label: "史官账号",
                icon: .person,
                placeholder: "3–20位字母、数字或中文",
                text: $username,
                isSecure: false
            )

            labeledInput(
                label: "通行密令",
                icon: .edict,
                placeholder: "6位以上密码",
                text: $password,
                isSecure: !showPassword,
                trailing: AnyView(
                    Button { showPassword.toggle() } label: {
                        PhosphorIcon(glyph: showPassword ? .eye : .eyeClosed, size: 17, weight: .light)
                            .foregroundStyle(Theme.ink2)
                            .frame(width: 34, height: 34)
                    }
                    .buttonStyle(.plain)
                )
            )

            if mode == "register" {
                labeledInput(
                    label: "列国雅号",
                    icon: .crown,
                    placeholder: "展示于名帖与史榜（留空同账号）",
                    text: $nickname,
                    isSecure: false
                )
            }
        }
    }

    private func labeledInput(
        label: String,
        icon: PhosphorGlyph,
        placeholder: String,
        text: Binding<String>,
        isSecure: Bool,
        trailing: AnyView? = nil
    ) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 6) {
                PhosphorIcon(glyph: icon, size: 13.5, weight: .light).foregroundStyle(Theme.ink2)
                Text(label).font(Theme.label).foregroundStyle(Theme.ink2)
            }
            HStack(spacing: 8) {
                if isSecure {
                    SecureField("", text: text, prompt: Text(placeholder).foregroundColor(Theme.ink2.opacity(0.55)))
                        .font(Theme.section)
                        .foregroundStyle(Theme.ink)
                        .tint(Theme.seal)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                } else {
                    TextField("", text: text, prompt: Text(placeholder).foregroundColor(Theme.ink2.opacity(0.55)))
                        .font(Theme.section)
                        .foregroundStyle(Theme.ink)
                        .tint(Theme.seal)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                }
                if let trailing { trailing }
            }
            .padding(.horizontal, 14)
            .frame(height: 46)
            .background(Theme.paperLight, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(Theme.ink.opacity(0.16), lineWidth: 0.85))
        }
    }

    private var serverTrustFooter: some View {
        HStack(spacing: 10) {
            PhosphorIcon(glyph: .globe, size: 15, weight: .light).foregroundStyle(Theme.jade)
            VStack(alignment: .leading, spacing: 2) {
                Text(platform.server?.name ?? "九州一区 · 腾讯云专属服")
                    .font(Theme.label).foregroundStyle(Theme.ink)
                Text("账号数据加密存储于专属云服，换设备登录即刻同步全部云端卷宗与史官品秩。")
                    .font(Theme.caption).foregroundStyle(Theme.ink2)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(13)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Theme.wash.opacity(0.45), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 10, style: .continuous).stroke(Theme.hairline, lineWidth: 0.7))
    }

    private func submitForm() async {
        busy = true; errorMessage = nil
        let err: String?
        if mode == "login" {
            err = await platform.login(username: username, password: password)
        } else {
            err = await platform.register(username: username, password: password, nickname: nickname, sealChar: sealChar, sealStyle: sealStyle)
        }
        busy = false
        if let err {
            errorMessage = err
            GameFeel.shared.notify(.error)
        } else {
            GameFeel.shared.notify(.success)
            dismiss()
            onAuthenticated?()
        }
    }

    private func enterAsGuest() async {
        busy = true; errorMessage = nil
        let err = await platform.loginAsGuest()
        busy = false
        if let err {
            errorMessage = err
            GameFeel.shared.notify(.error)
        } else {
            GameFeel.shared.notify(.success)
            dismiss()
            onAuthenticated?()
        }
    }
}

// MARK: - 互动式「择定御印」定制卡（注册与名帖编辑共用）

struct SealCustomizerCard: View {
    @Binding var sealChar: String
    @Binding var sealStyle: String

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                PlayerSealBadge(char: sealChar, style: sealStyle, size: 48, filled: true)
                VStack(alignment: .leading, spacing: 4) {
                    Text("择定专属御印").font(Theme.serif(16)).foregroundStyle(Theme.ink)
                    Text("印于名帖、云端卷宗与天下史榜").font(Theme.caption).foregroundStyle(Theme.ink2)
                }
                Spacer()
                HStack(spacing: 8) {
                    ForEach(SealInkPalette.styles, id: \.id) { s in
                        let on = sealStyle == s.id
                        Button {
                            GameFeel.shared.tap()
                            withAnimation(Motion.tap) { sealStyle = s.id }
                        } label: {
                            Circle()
                                .fill(s.color)
                                .frame(width: 24, height: 24)
                                .overlay(Circle().stroke(Theme.paperLight, lineWidth: on ? 2 : 0))
                                .overlay(Circle().stroke(s.color, lineWidth: on ? 1.6 : 0).padding(-2.5))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }

            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 7), count: 5), spacing: 7) {
                ForEach(SealInkPalette.presetChars, id: \.self) { ch in
                    let on = sealChar == ch
                    let tint = SealInkPalette.color(for: sealStyle)
                    Button {
                        GameFeel.shared.tap()
                        withAnimation(Motion.tap) { sealChar = ch }
                    } label: {
                        Text(ch)
                            .font(Theme.serif(16))
                            .foregroundStyle(on ? Theme.paperLight : Theme.ink)
                            .frame(maxWidth: .infinity)
                            .frame(height: 36)
                            .background(on ? tint : Theme.paperLight, in: RoundedRectangle(cornerRadius: 7, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: 7, style: .continuous).stroke(on ? tint : Theme.hairline, lineWidth: 0.8))
                    }
                    .buttonStyle(PressStyle())
                }
            }
        }
        .padding(14)
        .background(Theme.paperLight.opacity(0.88), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Theme.goldRim.opacity(0.55), lineWidth: 0.85))
    }
}

// MARK: - 游客无损转正立籍弹窗

struct BindGuestSheet: View {
    @ObservedObject var platform: OnlinePlatform
    @Environment(\.dismiss) private var dismiss
    @State private var username = ""
    @State private var password = ""
    @State private var nickname = ""
    @State private var busy = false
    @State private var errorMessage: String?

    var body: some View {
        ViewBoundary {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    SheetHeader(title: "立籍转正", subtitle: "升级正式账号 · 完整保留云存档与史官功勋（赠 +20 功勋）", seal: "籍")
                    VStack(alignment: .leading, spacing: 12) {
                        TextField("", text: $username, prompt: Text("设置登录账号（3–20位）").foregroundColor(Theme.ink2.opacity(0.6)))
                            .paperField().textInputAutocapitalization(.never).autocorrectionDisabled()
                        SecureField("", text: $password, prompt: Text("设置通行密令（6位以上）").foregroundColor(Theme.ink2.opacity(0.6)))
                            .paperField().textInputAutocapitalization(.never).autocorrectionDisabled()
                        TextField("", text: $nickname, prompt: Text("修改雅号（留空保持当前）").foregroundColor(Theme.ink2.opacity(0.6)))
                            .paperField()
                    }
                    .padding(.horizontal, Theme.Layout.pageInset)

                    if let err = errorMessage {
                        Text(err).font(Theme.label).foregroundStyle(Theme.seal)
                            .padding(.horizontal, Theme.Layout.pageInset)
                    }

                    SealButton(title: "确认立籍绑定", busy: busy, disabled: busy || username.isEmpty || password.isEmpty) {
                        Task {
                            busy = true; errorMessage = nil
                            let err = await platform.bindGuest(username: username, password: password, nickname: nickname)
                            busy = false
                            if let err {
                                errorMessage = err
                                GameFeel.shared.notify(.error)
                            } else {
                                GameFeel.shared.notify(.success)
                                dismiss()
                            }
                        }
                    }
                    .padding(.horizontal, Theme.Layout.pageInset)
                }
                .padding(.bottom, 24)
            }
            .background(MemorialPaper().ignoresSafeArea())
        }
    }
}
