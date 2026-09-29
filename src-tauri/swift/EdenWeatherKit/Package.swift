// swift-tools-version:5.9
// Eden's bridge to Apple's WeatherKit (D-57): one static library the crate links on macOS and iOS through swift-rs's
// linker. It has no dependencies, so building it never reaches the network.
import PackageDescription

let package = Package(
    name: "EdenWeatherKit",
    platforms: [.macOS(.v13), .iOS(.v16)],
    products: [
        .library(name: "EdenWeatherKit", type: .static, targets: ["EdenWeatherKit"])
    ],
    targets: [
        .target(name: "EdenWeatherKit", path: "Sources/EdenWeatherKit")
    ]
)
