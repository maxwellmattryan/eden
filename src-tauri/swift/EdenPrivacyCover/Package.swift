// swift-tools-version:5.9
// Eden's privacy cover for the iOS app switcher: one static library the crate links on iOS only through swift-rs's
// linker. It has no dependencies, so building it never reaches the network.
import PackageDescription

let package = Package(
    name: "EdenPrivacyCover",
    platforms: [.iOS(.v16)],
    products: [
        .library(name: "EdenPrivacyCover", type: .static, targets: ["EdenPrivacyCover"])
    ],
    targets: [
        .target(name: "EdenPrivacyCover", path: "Sources/EdenPrivacyCover")
    ]
)
