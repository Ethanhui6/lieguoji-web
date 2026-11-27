import SwiftUI
import UIKit
import LieguojiCore

/// v8.0.0 真实历史大事件报刊/诏令弹窗：展示史实日期、战史画卷插图（HotPack v7 EventScrolls/）、
/// 历史背景与真实引擎机械效果（吞并/割地/宣战/结盟/学说闪电加成），支持史实/架空交互抉择。
struct HistoricalEventModalOverlay: View {
    let modal: HistoricalEvents.PendingModal
    let route: String
    let onChoose: (Int) -> Void

    private var illustrationImage: UIImage? {
        guard !modal.illustration.isEmpty else { return nil }
        for ext in ["png", "jpg", "webp"] {
            if let url = HotPackManager.resourceURL(name: modal.illustration, ext: ext, subdirectory: "EventScrolls"),
               let data = try? Data(contentsOf: url),
               let img = UIImage(data: data) {
                return img
            }
        }
        return nil
    }

    var body: some View {
        ZStack {
            Color.black.opacity(0.46)
                .ignoresSafeArea()

            VStack(alignment: .leading, spacing: 0) {
                // 报刊/诏令页眉
                HStack(spacing: 8) {
                    PaperTag(text: route == "sandbox" ? "架空分支" : "史实大事记", color: Theme.seal, size: 11)
                    Text(modal.dateLabel)
                        .font(Theme.caption)
                        .monospacedDigit()
                        .foregroundStyle(Theme.ink2)
                    Spacer()
                    InkIcon(glyph: .chronicle, size: 16, weight: 1.7)
                        .foregroundStyle(Theme.seal)
                }
                .padding(.horizontal, 18)
                .padding(.top, 16)
                .padding(.bottom, 10)

                // 战史卷轴插图（来自 HotPack v7 EventScrolls/）
                if let img = illustrationImage {
                    Image(uiImage: img)
                        .resizable()
                        .scaledToFill()
                        .frame(maxWidth: .infinity)
                        .frame(height: 132)
                        .clipped()
                        .overlay(
                            LinearGradient(
                                colors: [.clear, Theme.paperLight.opacity(0.85)],
                                startPoint: .center,
                                endPoint: .bottom
                            )
                        )
                }

                VStack(alignment: .leading, spacing: 10) {
                    Text(modal.title)
                        .font(Theme.kai(23))
                        .foregroundStyle(Theme.ink)
                        .fixedSize(horizontal: false, vertical: true)

                    if !modal.headline.isEmpty {
                        Text(modal.headline)
                            .font(Theme.serif(14.5))
                            .foregroundStyle(Theme.seal)
                            .fixedSize(horizontal: false, vertical: true)
                    }

                    Text(modal.body)
                        .font(Theme.body)
                        .foregroundStyle(Theme.ink.opacity(0.88))
                        .lineSpacing(4)
                        .fixedSize(horizontal: false, vertical: true)

                    if !modal.effectSummary.isEmpty {
                        Text("战局实效：\(modal.effectSummary)")
                            .font(Theme.caption)
                            .foregroundStyle(Theme.ink2)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 7)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Theme.wash.opacity(0.55), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
                    }

                    Divider2()
                        .padding(.vertical, 4)

                    VStack(spacing: 9) {
                        ForEach(Array(modal.choices.enumerated()), id: \.offset) { idx, ch in
                            let primary = (idx == 0)
                            Button {
                                onChoose(idx)
                            } label: {
                                VStack(alignment: .leading, spacing: 3) {
                                    HStack {
                                        Text(ch.title)
                                            .font(Theme.serif(15))
                                            .foregroundStyle(primary ? Theme.paperLight : Theme.ink)
                                        Spacer()
                                        if ch.isHistorical {
                                            Text("史实走向")
                                                .font(Theme.sans(10))
                                                .foregroundStyle(primary ? Theme.paperLight.opacity(0.9) : Theme.seal)
                                                .padding(.horizontal, 6)
                                                .padding(.vertical, 2)
                                                .background((primary ? Color.white.opacity(0.18) : Theme.seal.opacity(0.12)), in: Capsule())
                                        }
                                    }
                                    if !ch.subtitle.isEmpty {
                                        Text(ch.subtitle)
                                            .font(Theme.caption)
                                            .foregroundStyle(primary ? Theme.paperLight.opacity(0.88) : Theme.ink2)
                                            .fixedSize(horizontal: false, vertical: true)
                                    }
                                }
                                .padding(.horizontal, 14)
                                .padding(.vertical, 11)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .background(
                                    primary ? Theme.seal : Theme.wash.opacity(0.55),
                                    in: RoundedRectangle(cornerRadius: 10, style: .continuous)
                                )
                                .overlay(
                                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                                        .stroke(primary ? Color.clear : Theme.hairline, lineWidth: 0.75)
                                )
                            }
                            .buttonStyle(PressStyle())
                        }
                    }
                }
                .padding(.horizontal, 18)
                .padding(.top, 12)
                .padding(.bottom, 18)
            }
            .frame(maxWidth: 420)
            .background(Theme.paperLight, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(Theme.seal.opacity(0.45), lineWidth: 1.2))
            .shadow(color: Color.black.opacity(0.28), radius: 22, y: 10)
            .padding(.horizontal, 20)
        }
    }
}
