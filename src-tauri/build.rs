fn main() {
    // The channel a binary was built for is read at compile time (`option_env!("EDEN_ENV")` in commands/app.rs), so a
    // change of EDEN_ENV between `yarn dev` and `yarn build:staging` must rebuild the crate.
    println!("cargo:rerun-if-env-changed=EDEN_ENV");
    link_weatherkit();
    tauri_build::build()
}

/// Builds and links the Swift WeatherKit bridge (D-57) when the target is macOS or iOS. The minimum systems are
/// WeatherKit's own: macOS 13 and iOS 16. Every other target compiles the stub in `domains/weather` and links nothing.
#[cfg(target_vendor = "apple")]
fn link_weatherkit() {
    println!("cargo:rerun-if-changed=swift/EdenWeatherKit/Package.swift");
    println!("cargo:rerun-if-changed=swift/EdenWeatherKit/Sources");
    let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    if target_os != "macos" && target_os != "ios" {
        return;
    }
    swift_rs::SwiftLinker::new("13.0")
        .with_ios("16.0")
        .with_package("EdenWeatherKit", "./swift/EdenWeatherKit/")
        .link();
    println!("cargo:rustc-link-lib=framework=WeatherKit");
    println!("cargo:rustc-link-lib=framework=CoreLocation");
    // The Swift runtime ships with the system from macOS 12; the binary is told where, or it looks beside itself.
    if target_os == "macos" {
        println!("cargo:rustc-link-arg=-Wl,-rpath,/usr/lib/swift");
    }
}

#[cfg(not(target_vendor = "apple"))]
fn link_weatherkit() {}
