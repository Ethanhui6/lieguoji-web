import SwiftUI
import UIKit

/// 打包在 `Resources/Art` 的工笔水墨手绘美术资源统一加载与内存缓存（只解码一次，零主线程重复 IO）。
enum BundleArt {
    static let compassRose: UIImage? = load("compass-rose")
    static let landmarkCapital: UIImage? = load("landmark-capital")
    static let landmarkFortress: UIImage? = load("landmark-fortress")
    static let landmarkPort: UIImage? = load("landmark-port")
    static let wargodCrest: UIImage? = load("wargod-crest")
    static let edictCrest: UIImage? = load("edict-crest")

    private static func load(_ name: String) -> UIImage? {
        if let url = Bundle.main.url(forResource: name, withExtension: "png", subdirectory: "Art"),
           let img = UIImage(contentsOfFile: url.path) {
            return img
        }
        if let url = Bundle.main.url(forResource: name, withExtension: "png"),
           let img = UIImage(contentsOfFile: url.path) {
            return img
        }
        return nil
    }
}

/// 在 SwiftUI 中以统一工笔质感呈现 `BundleArt` 透明手绘徽章。
struct ArtEmblem: View {
    let image: UIImage?
    var size: CGFloat = 32
    var fallback: InkGlyph = .crown
    var body: some View {
        if let image {
            Image(uiImage: image)
                .resizable()
                .interpolation(.high)
                .scaledToFit()
                .frame(width: size, height: size)
        } else {
            InkIcon(glyph: fallback, size: size * 0.72, weight: 1.75)
                .foregroundStyle(Theme.seal)
                .frame(width: size, height: size)
        }
    }
}
