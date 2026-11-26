import SwiftUI
import UIKit

// MARK: - 玩家专属篆刻御印（纯 4.3 极简宣纸风：朱砂 / 青墨 / 古金，无阴影无多层重框）

enum SealInkPalette {
    static let presetChars = ["龙", "帝", "汉", "唐", "秦", "明", "楚", "帅", "史", "墨"]
    static let styles: [(id: String, name: String, color: Color)] = [
        ("cinnabar", "朱砂", Theme.seal),
        ("jade", "青墨", Theme.jade),
        ("gold", "古金", Theme.gold),
    ]

    static func color(for style: String) -> Color {
        styles.first(where: { $0.id == style })?.color ?? Theme.seal
    }
}

struct PlayerSealBadge: View {
    let char: String
    var style: String = "cinnabar"
    var size: CGFloat = 34
    var filled: Bool = false

    var body: some View {
        let tint = SealInkPalette.color(for: style)
        let ch = char.trimmingCharacters(in: .whitespacesAndNewlines).prefix(1)
        SealFace(
            text: ch.isEmpty ? "龙" : String(ch),
            size: size,
            color: tint,
            filled: filled
        )
        .rotationEffect(.degrees(-2.5))
    }
}

// MARK: - 标题页右上角极简宣纸名帖胶囊（与游戏内顶栏 `.glass(Capsule())` 100% 同源，零厚影零金框）

struct TitleOnlineHeader: View {
    @ObservedObject var platform: OnlinePlatform
    @ObservedObject var hotPack: HotPackManager
    let onOpenHub: (String) -> Void
    let onOpenAuth: () -> Void
    let onOpenHotUpdate: () -> Void

    var body: some View {
        VStack(alignment: .trailing, spacing: 6) {
            HStack(spacing: 6) {
                if platform.user?.isAdminAccount == true {
                    Button {
                        GameFeel.shared.tap()
                        onOpenHub("admin")
                    } label: {
                        Text("司礼监")
                            .font(Theme.caption)
                            .foregroundStyle(Theme.paperLight)
                            .padding(.horizontal, 9)
                            .frame(height: 34)
                            .background(Theme.seal, in: Capsule())
                    }
                    .buttonStyle(PressStyle())
                }

                Button {
                    GameFeel.shared.tap()
                    if platform.isLoggedIn { onOpenHub("profile") } else { onOpenAuth() }
                } label: {
                    HStack(spacing: 7) {
                        if let u = platform.user, platform.isLoggedIn {
                            PlayerSealBadge(char: u.sealChar, style: u.sealStyle, size: 22, filled: true)
                            Text(u.nickname)
                                .font(Theme.label)
                                .foregroundStyle(Theme.ink)
                                .lineLimit(1)
                            if platform.hasPendingBadge || hotPack.hasPendingUpdate {
                                Circle().fill(Theme.seal).frame(width: 5.5, height: 5.5)
                            }
                        } else {
                            PhosphorIcon(glyph: .person, size: 14, weight: .light)
                                .foregroundStyle(Theme.seal)
                            Text("登临云端")
                                .font(Theme.label)
                                .foregroundStyle(Theme.ink)
                        }
                    }
                    .padding(.horizontal, 11)
                    .frame(height: 34)
                    .glass(Capsule())
                }
                .buttonStyle(PressStyle())
            }

            HStack(spacing: 6) {
                if hotPack.hasPendingUpdate {
                    Button {
                        GameFeel.shared.tap()
                        onOpenHotUpdate()
                    } label: {
                        HStack(spacing: 4) {
                            PhosphorIcon(glyph: .refresh, size: 11, weight: .light)
                            Text("热更 \(HotPackManager.formatBytes(hotPack.pendingBytes))")
                                .font(Theme.caption)
                                .monospacedDigit()
                        }
                        .foregroundStyle(Theme.paperLight)
                        .padding(.horizontal, 9)
                        .frame(height: 26)
                        .background(Theme.seal, in: Capsule())
                    }
                    .buttonStyle(PressStyle())
                }

                Button {
                    GameFeel.shared.tap()
                    onOpenHub("notices")
                } label: {
                    HStack(spacing: 5) {
                        Circle()
                            .fill(platform.server?.computeOnline == true ? Theme.jade : Theme.ink2.opacity(0.45))
                            .frame(width: 5.5, height: 5.5)
                        Text(statusLabel)
                            .font(Theme.caption)
                            .foregroundStyle(Theme.ink2)
                            .monospacedDigit()
                            .lineLimit(1)
                    }
                    .padding(.horizontal, 9)
                    .frame(height: 26)
                    .glass(Capsule())
                }
                .buttonStyle(PressStyle())
            }
        }
    }

    private var statusLabel: String {
        if let srv = platform.server {
            let ms = platform.apiRTTMs.map { " \($0)ms" } ?? ""
            return "\(srv.name)\(ms)"
        }
        return platform.checkingUpdate ? "连服中…" : "离线"
    }
}

// MARK: - 「列国登临阁」极简宣纸登录 / 注册门扉（纯 4.3 留白风格，120fps 顺滑）

struct AuthPortalSheet: View {
    @ObservedObject var platform: OnlinePlatform
    var onAuthenticated: (() -> Void)? = nil
    @Environment(\.dismiss) private var dismiss

    @State private var mode = "login"
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
                VStack(alignment: .leading, spacing: 16) {
                    SheetHeader(
                        title: "列国登临阁",
                        subtitle: mode == "login" ? "凭帖入世 · 跨端同步云端卷宗" : "立籍封侯 · 定制你的史官御印",
                        seal: mode == "login" ? "登" : "籍"
                    )

                    ChipPicker(items: [("login", "凭帖登临"), ("register", "立籍封侯")], selection: $mode)
                        .padding(.horizontal, Theme.Layout.pageInset)

                    Group2 {
                        fieldRow(label: "账号", placeholder: "3–20位字母、数字或中文", text: $username, secure: false)
                        Divider2()
                        fieldRow(label: "密令", placeholder: "6位以上密码", text: $password, secure: !showPassword, showEye: true)
                        if mode == "register" {
                            Divider2()
                            fieldRow(label: "雅号", placeholder: "展示名（留空同账号）", text: $nickname, secure: false)
                        }
                    }
                    .padding(.horizontal, Theme.Layout.pageInset)

                    if mode == "register" {
                        SectionLabel("择定御印")
                        SealCustomizerRow(sealChar: $sealChar, sealStyle: $sealStyle)
                            .padding(.horizontal, Theme.Layout.pageInset)
                    }

                    if let err = errorMessage {
                        Text(err)
                            .font(Theme.label)
                            .foregroundStyle(Theme.seal)
                            .padding(.horizontal, Theme.Layout.pageInset)
                    }

                    VStack(spacing: 10) {
                        SealButton(
                            title: mode == "login" ? "落印登临" : "立籍并登临",
                            busy: busy,
                            disabled: busy || username.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || password.isEmpty
                        ) {
                            Task { await submitForm() }
                        }

                        EditorialTactileButton(
                            title: "游客先行入世（随时可转正绑定）",
                            icon: .stamp,
                            compact: false,
                            fullWidth: true,
                            disabled: busy
                        ) {
                            Task { await enterAsGuest() }
                        }
                    }
                    .padding(.horizontal, Theme.Layout.pageInset)
                }
                .padding(.bottom, 28)
            }
            .scrollIndicators(.hidden)
            .scrollDismissesKeyboard(.interactively)
            .background(MemorialPaper().ignoresSafeArea())
        }
    }

    private func fieldRow(label: String, placeholder: String, text: Binding<String>, secure: Bool, showEye: Bool = false) -> some View {
        HStack(spacing: 12) {
            Text(label)
                .font(Theme.sans(14))
                .foregroundStyle(Theme.ink2)
                .frame(width: 44, alignment: .leading)
            if secure {
                SecureField("", text: text, prompt: Text(placeholder).foregroundColor(Theme.ink2.opacity(0.5)))
                    .font(Theme.section)
                    .foregroundStyle(Theme.ink)
                    .tint(Theme.seal)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
            } else {
                TextField("", text: text, prompt: Text(placeholder).foregroundColor(Theme.ink2.opacity(0.5)))
                    .font(Theme.section)
                    .foregroundStyle(Theme.ink)
                    .tint(Theme.seal)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
            }
            if showEye {
                Button { showPassword.toggle() } label: {
                    PhosphorIcon(glyph: showPassword ? .eye : .eyeClosed, size: 16, weight: .light)
                        .foregroundStyle(Theme.ink2)
                        .frame(width: 30, height: 30)
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 4)
        .padding(.vertical, 12)
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

// MARK: - 极简平铺式御印选择器（零卡盒嵌套）

struct SealCustomizerRow: View {
    @Binding var sealChar: String
    @Binding var sealStyle: String

    var body: some View {
        Group2 {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 12) {
                    PlayerSealBadge(char: sealChar, style: sealStyle, size: 42, filled: true)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("印文与印泥").font(Theme.body).foregroundStyle(Theme.ink)
                        Text("用于名帖、云端卷宗与天下史榜").font(Theme.caption).foregroundStyle(Theme.ink2)
                    }
                    Spacer()
                    HStack(spacing: 10) {
                        ForEach(SealInkPalette.styles, id: \.id) { s in
                            let on = sealStyle == s.id
                            Button {
                                GameFeel.shared.tap()
                                sealStyle = s.id
                            } label: {
                                Text(s.name)
                                    .font(Theme.caption)
                                    .foregroundStyle(on ? Theme.paperLight : s.color)
                                    .padding(.horizontal, 8).padding(.vertical, 4)
                                    .background(on ? s.color : s.color.opacity(0.08), in: RoundedRectangle(cornerRadius: 5, style: .continuous))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }

                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 6), count: 5), spacing: 6) {
                    ForEach(SealInkPalette.presetChars, id: \.self) { ch in
                        let on = sealChar == ch
                        let tint = SealInkPalette.color(for: sealStyle)
                        Button {
                            GameFeel.shared.tap()
                            sealChar = ch
                        } label: {
                            Text(ch)
                                .font(Theme.serif(15.5))
                                .foregroundStyle(on ? Theme.paperLight : Theme.ink)
                                .frame(maxWidth: .infinity)
                                .frame(height: 34)
                                .background(on ? tint : Theme.paperLight, in: RoundedRectangle(cornerRadius: 6, style: .continuous))
                                .overlay(RoundedRectangle(cornerRadius: 6, style: .continuous).stroke(on ? tint : Theme.hairline, lineWidth: 0.7))
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
            .padding(.horizontal, 4)
            .padding(.vertical, 12)
        }
    }
}

// MARK: - 游客转正弹窗

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
                    SheetHeader(title: "立籍转正", subtitle: "完整保留云存档与功勋 · 立赠 +20 功勋", seal: "籍")
                    Group2 {
                        VStack(spacing: 10) {
                            TextField("", text: $username, prompt: Text("登录账号（3–20位）").foregroundColor(Theme.ink2.opacity(0.55)))
                                .paperField().textInputAutocapitalization(.never).autocorrectionDisabled()
                            SecureField("", text: $password, prompt: Text("通行密令（6位以上）").foregroundColor(Theme.ink2.opacity(0.55)))
                                .paperField().textInputAutocapitalization(.never).autocorrectionDisabled()
                            TextField("", text: $nickname, prompt: Text("雅号（留空保持当前）").foregroundColor(Theme.ink2.opacity(0.55)))
                                .paperField()
                        }
                        .padding(.vertical, 12)
                    }
                    .padding(.horizontal, Theme.Layout.pageInset)

                    if let err = errorMessage {
                        Text(err).font(Theme.label).foregroundStyle(Theme.seal).padding(.horizontal, Theme.Layout.pageInset)
                    }

                    SealButton(title: "确认立籍绑定", busy: busy, disabled: busy || username.isEmpty || password.isEmpty) {
                        Task {
                            busy = true; errorMessage = nil
                            let err = await platform.bindGuest(username: username, password: password, nickname: nickname)
                            busy = false
                            if let err { errorMessage = err; GameFeel.shared.notify(.error) }
                            else { GameFeel.shared.notify(.success); dismiss() }
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
