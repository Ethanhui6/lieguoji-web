// swift-tools-version: 5.9
import PackageDescription
let package = Package(name: "LieguojiCore", products: [.library(name: "LieguojiCore", targets: ["LieguojiCore"])], targets: [.target(name: "LieguojiCore"), .testTarget(name: "LieguojiCoreTests", dependencies: ["LieguojiCore"])])
