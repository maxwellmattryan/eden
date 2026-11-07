// swift-tools-version:5.9
// Eden's on-device text reader (D-190): one static library the crate links on macOS and iOS through swift-rs's
// linker. Vision recognises the text, PDFKit renders a scanned PDF's pages. It has no dependencies, so building it never
// reaches the network.
import PackageDescription

let package = Package(
    name: "EdenTextReader",
    platforms: [.macOS(.v13), .iOS(.v16)],
    products: [
        .library(name: "EdenTextReader", type: .static, targets: ["EdenTextReader"])
    ],
    targets: [
        .target(name: "EdenTextReader", path: "Sources/EdenTextReader")
    ]
)
