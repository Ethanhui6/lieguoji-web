// swift-tools-version: 5.9
import PackageDescription
let package = Package(
    name: "LieguojiCore",
    // The app targets iOS 17; the simulation uses Swift actors. Linux ignores platforms.
    platforms: [.iOS(.v17), .macOS(.v13)],
    products: [.library(name: "LieguojiCore", targets: ["LieguojiCore"])],
    targets: [.target(name: "LieguojiCore"), .testTarget(name: "LieguojiCoreTests", dependencies: ["LieguojiCore"])]
)
