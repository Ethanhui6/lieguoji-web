import SwiftUI
import UIKit

// MARK: - 玩家专属篆刻御印（纯 4.3 极简宣纸风：朱砂 / 青墨 / 古金，无厚重阴影）

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

// MARK: - 标题页右上角极简宣纸名帖胶囊（与游戏内顶栏 `.glass(Capsule())` 100% 同源）

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

// MARK: - 宋版宣纸礼仪御印抬头与悬浮纸笺输入卡（纯矢量双线，120fps 顺滑）

private struct AuthCeremonialHeader: View {
    let sealChar: String
    let sealStyle: String
    let motto: String
    let badges: [String]

    var body: some View {
        VStack(spacing: 12) {
            HStack(spacing: 14) {
                Rectangle()
                    .fill(Theme.hairline)
                    .frame(height: 0.75)
                ZStack {
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .fill(Theme.paper)
                        .frame(width: 62, height: 62)
                        .overlay(
                            RoundedRectangle(cornerRadius: 12, style: .continuous)
                                .strokeBorder(Theme.line, lineWidth: 0.8)
                        )
                        .overlay(
                            RoundedRectangle(cornerRadius: 9.5, style: .continuous)
                                .strokeBorder(Theme.seal.opacity(0.22), lineWidth: 0.55)
                                .padding(3)
                        )
                    PlayerSealBadge(char: sealChar, style: sealStyle, size: 42, filled: true)
                }
                Rectangle()
                    .fill(Theme.hairline)
                    .frame(height: 0.75)
            }

            Text(motto)
                .font(Theme.serif(14.5))
                .tracking(1.6)
                .foregroundStyle(Theme.ink)
                .multilineTextAlignment(.center)

            HStack(spacing: 8) {
                ForEach(badges, id: \.self) { badge in
                    Text(badge)
                        .font(Theme.caption)
                        .foregroundStyle(Theme.ink2)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(Theme.paper, in: Capsule())
                        .overlay(Capsule().strokeBorder(Theme.hairline, lineWidth: 0.7))
                }
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 16)
        .frame(maxWidth: .infinity)
        .background(Theme.paperLight, in: RoundedRectangle(cornerRadius: Theme.Control.cornerCard, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Control.cornerCard, style: .continuous)
                .strokeBorder(Theme.line, lineWidth: 0.75)
        )
        .overlay(
            RoundedRectangle(cornerRadius: Theme.Control.cornerCard - 2.5, style: .continuous)
                .strokeBorder(Theme.hairline, lineWidth: 0.5)
                .padding(2.5)
                .allowsHitTesting(false)
        )
    }
}

private struct FloatingPaperInputCard<Field: Hashable>: View {
    let icon: PhosphorGlyph
    let label: String
    let placeholder: String
    @Binding var text: String
    var secure: Bool = false
    var showEye: Bool = false
    @Binding var revealPassword: Bool
    var focusBinding: FocusState<Field?>.Binding
    let fieldValue: Field
    var submitLabel: SubmitLabel = .next
    var hint: String? = nil
    var hintIsWarning: Bool = false
    var onSubmit: () -> Void = {}

    private var isFocused: Bool { focusBinding.wrappedValue == fieldValue }

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack(spacing: 10) {
                PhosphorIcon(glyph: icon, size: 15, weight: isFocused ? .fill : .light)
                    .foregroundStyle(isFocused ? Theme.seal : Theme.ink2)
                    .frame(width: 20)

                Text(label)
                    .font(Theme.sans(13.5))
                    .foregroundStyle(isFocused ? Theme.seal : Theme.ink2)
                    .frame(width: 36, alignment: .leading)

                Rectangle()
                    .fill(isFocused ? Theme.seal.opacity(0.32) : Theme.hairline)
                    .frame(width: 0.75, height: 18)

                Group {
                    if secure && !revealPassword {
                        SecureField("", text: $text, prompt: Text(placeholder).foregroundColor(Theme.ink2.opacity(0.72)))
                    } else {
                        TextField("", text: $text, prompt: Text(placeholder).foregroundColor(Theme.ink2.opacity(0.72)))
                    }
                }
                .font(Theme.section)
                .foregroundStyle(Theme.ink)
                .tint(Theme.seal)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .submitLabel(submitLabel)
                .focused(focusBinding, equals: fieldValue)
                .onSubmit(onSubmit)

                if showEye {
                    Button {
                        GameFeel.shared.tap()
                        revealPassword.toggle()
                    } label: {
                        PhosphorIcon(glyph: revealPassword ? .eye : .eyeClosed, size: 16, weight: .light)
                            .foregroundStyle(isFocused ? Theme.seal : Theme.ink2)
                            .frame(width: 44, height: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 12)
            .frame(minHeight: 48)
            .background(
                isFocused ? Theme.paperLight : Theme.paperLight.opacity(0.88),
                in: RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous)
            )
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous)
                    .strokeBorder(
                        hintIsWarning ? Theme.seal.opacity(0.55) : (isFocused ? Theme.seal.opacity(0.68) : Theme.line),
                        lineWidth: isFocused ? 1.05 : 0.75
                    )
            )
            .animation(Motion.tap, value: isFocused)

            if let hint, !hint.isEmpty {
                HStack(spacing: 4) {
                    PhosphorIcon(glyph: hintIsWarning ? .warning : .info, size: 11.5, weight: .light)
                    Text(hint)
                        .font(Theme.caption)
                        .monospacedDigit()
                }
                .foregroundStyle(hintIsWarning ? Theme.seal : Theme.ink2)
                .padding(.leading, 6)
                .transition(.opacity)
            }
        }
    }
}

private struct AuthPrimaryCinnabarButton: View {
    let title: String
    let icon: PhosphorGlyph
    var busy: Bool = false
    var disabled: Bool = false
    let action: () -> Void

    var body: some View {
        Button {
            GameFeel.shared.tap()
            action()
        } label: {
            HStack(spacing: 8) {
                if busy {
                    InkBusy(tint: Theme.paperLight, track: Theme.paperLight.opacity(0.35)).frame(width: 40)
                } else {
                    PhosphorIcon(glyph: icon, size: 16, weight: .fill)
                }
                Text(title)
                    .font(Theme.serif(16))
                    .tracking(1.6)
            }
            .foregroundStyle(disabled ? Theme.ink2 : Theme.paperLight)
            .frame(maxWidth: .infinity)
            .frame(height: 48)
            .background(
                disabled ? Theme.wash : Theme.seal,
                in: RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous)
            )
            .overlay(
                RoundedRectangle(cornerRadius: Theme.Control.cornerControl - 2, style: .continuous)
                    .strokeBorder(disabled ? Theme.line : Theme.paperLight.opacity(0.24), lineWidth: 0.75)
                    .padding(disabled ? 0 : 2.5)
                    .allowsHitTesting(false)
            )
        }
        .buttonStyle(PressStyle())
        .disabled(disabled || busy)
    }
}

// MARK: - 「列国登临阁」宣纸礼仪登录 / 注册门扉（纯 4.3 宣纸细墨，120fps 顺滑）

struct AuthPortalSheet: View {
    @ObservedObject var platform: OnlinePlatform
    var onAuthenticated: (() -> Void)? = nil
    @Environment(\.dismiss) private var dismiss

    private enum Field: Hashable { case username, password, nickname }

    @State private var mode = "login"
    @State private var username = ""
    @State private var password = ""
    @State private var nickname = ""
    @State private var sealChar = "龙"
    @State private var sealStyle = "cinnabar"
    @State private var showPassword = false
    @State private var busy = false
    @State private var errorMessage: String?
    @FocusState private var focusedField: Field?

    private var trimmedUsername: String {
        username.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var usernameHint: (text: String?, warn: Bool) {
        guard !trimmedUsername.isEmpty else { return (nil, false) }
        if trimmedUsername.count < 3 {
            return ("账号至少需 3 位字符（当前 \(trimmedUsername.count)/3）", true)
        }
        if trimmedUsername.count > 20 {
            return ("账号请控制在 20 位字符以内（当前 \(trimmedUsername.count)/20）", true)
        }
        return (nil, false)
    }

    private var passwordHint: (text: String?, warn: Bool) {
        guard !password.isEmpty else { return (nil, false) }
        if password.count < 6 {
            return ("密令至少需 6 位以护卫云端卷宗（当前 \(password.count)/6）", true)
        }
        return (nil, false)
    }

    private var canSubmit: Bool {
        !busy && trimmedUsername.count >= 3 && trimmedUsername.count <= 20 && password.count >= 6
    }

    var body: some View {
        ViewBoundary {
            ScrollView {
                VStack(alignment: .leading, spacing: 15) {
                    SheetHeader(
                        title: "列国登临阁",
                        subtitle: mode == "login" ? "凭帖入世 · 跨端同步云端卷宗" : "立籍封侯 · 定制你的史官御印",
                        seal: mode == "login" ? "登" : "籍"
                    )

                    AuthCeremonialHeader(
                        sealChar: mode == "register" ? sealChar : (platform.user?.sealChar ?? "龙"),
                        sealStyle: mode == "register" ? sealStyle : (platform.user?.sealStyle ?? "cinnabar"),
                        motto: mode == "login" ? "墨印为凭 · 跨端续写九州山河" : "刻石立籍 · 永存二十卷云端史册",
                        badges: ["20 卷云档", "断链自动续连", "天下史榜"]
                    )
                    .padding(.horizontal, Theme.Layout.pageInset)

                    ChipPicker(items: [("login", "凭帖登临"), ("register", "立籍封侯")], selection: $mode)
                        .padding(.horizontal, Theme.Layout.pageInset)
                        .onChange(of: mode) { _, _ in
                            errorMessage = nil
                        }

                    VStack(spacing: 10) {
                        FloatingPaperInputCard(
                            icon: .person,
                            label: "账号",
                            placeholder: "3–20 位字母、数字或中文",
                            text: $username,
                            secure: false,
                            showEye: false,
                            revealPassword: .constant(true),
                            focusBinding: $focusedField,
                            fieldValue: .username,
                            submitLabel: .next,
                            hint: usernameHint.text,
                            hintIsWarning: usernameHint.warn
                        ) {
                            focusedField = .password
                        }

                        FloatingPaperInputCard(
                            icon: .stamp,
                            label: "密令",
                            placeholder: "6 位以上通行密令",
                            text: $password,
                            secure: true,
                            showEye: true,
                            revealPassword: $showPassword,
                            focusBinding: $focusedField,
                            fieldValue: .password,
                            submitLabel: mode == "register" ? .next : .go,
                            hint: passwordHint.text,
                            hintIsWarning: passwordHint.warn
                        ) {
                            if mode == "register" {
                                focusedField = .nickname
                            } else if canSubmit {
                                Task { await submitForm() }
                            }
                        }

                        if mode == "register" {
                            FloatingPaperInputCard(
                                icon: .edit,
                                label: "雅号",
                                placeholder: "展示名（留空默认同账号）",
                                text: $nickname,
                                secure: false,
                                showEye: false,
                                revealPassword: .constant(true),
                                focusBinding: $focusedField,
                                fieldValue: .nickname,
                                submitLabel: .done,
                                hint: nickname.count > 16 ? "雅号建议不超过 16 字" : nil,
                                hintIsWarning: nickname.count > 16
                            ) {
                                focusedField = nil
                            }
                        }
                    }
                    .padding(.horizontal, Theme.Layout.pageInset)
                    .onChange(of: username) { _, _ in if errorMessage != nil { errorMessage = nil } }
                    .onChange(of: password) { _, _ in if errorMessage != nil { errorMessage = nil } }

                    if mode == "register" {
                        SectionLabel("择定史官御印")
                        SealCustomizerRow(sealChar: $sealChar, sealStyle: $sealStyle)
                            .padding(.horizontal, Theme.Layout.pageInset)
                    }

                    if let err = errorMessage {
                        HStack(spacing: 7) {
                            PhosphorIcon(glyph: .warning, size: 14, weight: .fill)
                                .foregroundStyle(Theme.seal)
                            Text(err)
                                .font(Theme.label)
                                .foregroundStyle(Theme.seal)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 9)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Theme.seal.opacity(0.065), in: RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous))
                        .overlay(
                            RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous)
                                .strokeBorder(Theme.seal.opacity(0.28), lineWidth: 0.75)
                        )
                        .padding(.horizontal, Theme.Layout.pageInset)
                    }

                    VStack(spacing: 10) {
                        AuthPrimaryCinnabarButton(
                            title: mode == "login" ? "落印登临" : "立籍并登临",
                            icon: .stamp,
                            busy: busy,
                            disabled: !canSubmit
                        ) {
                            focusedField = nil
                            Task { await submitForm() }
                        }

                        EditorialTactileButton(
                            title: "游客先行入世（随时可转正绑定）",
                            icon: .person,
                            compact: false,
                            fullWidth: true,
                            disabled: busy
                        ) {
                            focusedField = nil
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

    private func submitForm() async {
        guard canSubmit else { return }
        busy = true
        errorMessage = nil
        let err: String?
        if mode == "login" {
            err = await platform.login(username: trimmedUsername, password: password)
        } else {
            err = await platform.register(
                username: trimmedUsername,
                password: password,
                nickname: nickname,
                sealChar: sealChar,
                sealStyle: sealStyle
            )
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
        guard !busy else { return }
        busy = true
        errorMessage = nil
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
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                ZStack {
                    RoundedRectangle(cornerRadius: 9, style: .continuous)
                        .fill(Theme.paper)
                        .frame(width: 50, height: 50)
                        .overlay(RoundedRectangle(cornerRadius: 9, style: .continuous).strokeBorder(Theme.hairline, lineWidth: 0.7))
                    PlayerSealBadge(char: sealChar, style: sealStyle, size: 38, filled: true)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text("印文与印泥").font(Theme.body).foregroundStyle(Theme.ink)
                    Text("用于史官名刺、云端卷宗与天下史榜").font(Theme.caption).foregroundStyle(Theme.ink2)
                }
                Spacer(minLength: 4)
                HStack(spacing: 6) {
                    ForEach(SealInkPalette.styles, id: \.id) { s in
                        let on = sealStyle == s.id
                        Button {
                            GameFeel.shared.tap()
                            withAnimation(Motion.tap) { sealStyle = s.id }
                        } label: {
                            Text(s.name)
                                .font(Theme.caption)
                                .foregroundStyle(on ? Theme.paperLight : s.color)
                                .padding(.horizontal, 8).padding(.vertical, 4.5)
                                .background(on ? s.color : s.color.opacity(0.08), in: RoundedRectangle(cornerRadius: 5, style: .continuous))
                                .overlay(
                                    RoundedRectangle(cornerRadius: 5, style: .continuous)
                                        .strokeBorder(on ? Color.clear : s.color.opacity(0.28), lineWidth: 0.65)
                                )
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
                        withAnimation(Motion.tap) { sealChar = ch }
                    } label: {
                        Text(ch)
                            .font(Theme.serif(15.5))
                            .foregroundStyle(on ? Theme.paperLight : Theme.ink)
                            .frame(maxWidth: .infinity)
                            .frame(height: 34)
                            .background(on ? tint : Theme.paper, in: RoundedRectangle(cornerRadius: 6, style: .continuous))
                            .overlay(RoundedRectangle(cornerRadius: 6, style: .continuous).stroke(on ? tint : Theme.hairline, lineWidth: 0.7))
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(12)
        .background(Theme.paperLight, in: RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous).strokeBorder(Theme.line, lineWidth: 0.75))
    }
}

// MARK: - 游客转正弹窗（立籍转正 · 悬浮纸笺输入与实时校验）

struct BindGuestSheet: View {
    @ObservedObject var platform: OnlinePlatform
    @Environment(\.dismiss) private var dismiss

    private enum Field: Hashable { case username, password, nickname }

    @State private var username = ""
    @State private var password = ""
    @State private var nickname = ""
    @State private var showPassword = false
    @State private var busy = false
    @State private var errorMessage: String?
    @FocusState private var focusedField: Field?

    private var trimmedUsername: String {
        username.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var usernameHint: (text: String?, warn: Bool) {
        guard !trimmedUsername.isEmpty else { return (nil, false) }
        if trimmedUsername.count < 3 {
            return ("登录账号至少需 3 位字符（当前 \(trimmedUsername.count)/3）", true)
        }
        if trimmedUsername.count > 20 {
            return ("登录账号请控制在 20 位字符以内", true)
        }
        return (nil, false)
    }

    private var passwordHint: (text: String?, warn: Bool) {
        guard !password.isEmpty else { return (nil, false) }
        if password.count < 6 {
            return ("通行密令至少需 6 位（当前 \(password.count)/6）", true)
        }
        return (nil, false)
    }

    private var canSubmit: Bool {
        !busy && trimmedUsername.count >= 3 && trimmedUsername.count <= 20 && password.count >= 6
    }

    var body: some View {
        ViewBoundary {
            ScrollView {
                VStack(alignment: .leading, spacing: 15) {
                    SheetHeader(title: "立籍转正", subtitle: "完整保留云存档与功勋 · 立赠 +20 功勋", seal: "籍")

                    AuthCeremonialHeader(
                        sealChar: platform.user?.sealChar ?? "龙",
                        sealStyle: platform.user?.sealStyle ?? "cinnabar",
                        motto: "载籍入册 · 跨设备永久保留云端卷宗",
                        badges: ["完整保留存档", "立赠 +20 功勋", "20 卷云库"]
                    )
                    .padding(.horizontal, Theme.Layout.pageInset)

                    VStack(spacing: 10) {
                        FloatingPaperInputCard(
                            icon: .person,
                            label: "账号",
                            placeholder: "登录账号（3–20 位）",
                            text: $username,
                            secure: false,
                            showEye: false,
                            revealPassword: .constant(true),
                            focusBinding: $focusedField,
                            fieldValue: .username,
                            submitLabel: .next,
                            hint: usernameHint.text,
                            hintIsWarning: usernameHint.warn
                        ) {
                            focusedField = .password
                        }

                        FloatingPaperInputCard(
                            icon: .stamp,
                            label: "密令",
                            placeholder: "通行密令（6 位以上）",
                            text: $password,
                            secure: true,
                            showEye: true,
                            revealPassword: $showPassword,
                            focusBinding: $focusedField,
                            fieldValue: .password,
                            submitLabel: .next,
                            hint: passwordHint.text,
                            hintIsWarning: passwordHint.warn
                        ) {
                            focusedField = .nickname
                        }

                        FloatingPaperInputCard(
                            icon: .edit,
                            label: "雅号",
                            placeholder: "展示名（留空保持当前雅号）",
                            text: $nickname,
                            secure: false,
                            showEye: false,
                            revealPassword: .constant(true),
                            focusBinding: $focusedField,
                            fieldValue: .nickname,
                            submitLabel: .go
                        ) {
                            focusedField = nil
                            if canSubmit { Task { await submitBind() } }
                        }
                    }
                    .padding(.horizontal, Theme.Layout.pageInset)
                    .onChange(of: username) { _, _ in if errorMessage != nil { errorMessage = nil } }
                    .onChange(of: password) { _, _ in if errorMessage != nil { errorMessage = nil } }

                    if let err = errorMessage {
                        HStack(spacing: 7) {
                            PhosphorIcon(glyph: .warning, size: 14, weight: .fill)
                                .foregroundStyle(Theme.seal)
                            Text(err)
                                .font(Theme.label)
                                .foregroundStyle(Theme.seal)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .padding(.horizontal, 12)
                        .padding(.vertical, 9)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Theme.seal.opacity(0.065), in: RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous))
                        .overlay(
                            RoundedRectangle(cornerRadius: Theme.Control.cornerControl, style: .continuous)
                                .strokeBorder(Theme.seal.opacity(0.28), lineWidth: 0.75)
                        )
                        .padding(.horizontal, Theme.Layout.pageInset)
                    }

                    AuthPrimaryCinnabarButton(
                        title: "确认立籍绑定",
                        icon: .check,
                        busy: busy,
                        disabled: !canSubmit
                    ) {
                        focusedField = nil
                        Task { await submitBind() }
                    }
                    .padding(.horizontal, Theme.Layout.pageInset)
                }
                .padding(.bottom, 24)
            }
            .scrollIndicators(.hidden)
            .scrollDismissesKeyboard(.interactively)
            .background(MemorialPaper().ignoresSafeArea())
        }
    }

    private func submitBind() async {
        guard canSubmit else { return }
        busy = true
        errorMessage = nil
        let err = await platform.bindGuest(username: trimmedUsername, password: password, nickname: nickname)
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
