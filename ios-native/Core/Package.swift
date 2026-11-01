// swift-tools-version: 5.9
import PackageDescription
let package = Package(
    name: "LieguojiCore",
    // The app targets iOS 17; the simulation uses Swift actors. Linux ignores platforms.
    platforms: [.iOS(.v17), .macOS(.v13)],
    products: [.library(name: "LieguojiCore", targets: ["LieguojiCore"]), .executable(name: "LieguojiServer", targets: ["LieguojiServer"])],
    targets: [
        .target(name: "LieguojiCore"),
        // 远程计算: the simulation on a computer, the phone only draws (built for Windows by CI).
        .executableTarget(name: "LieguojiServer", dependencies: ["LieguojiCore"]),
        .testTarget(name: "LieguojiCoreTests", dependencies: ["LieguojiCore"]),
    ]
)
