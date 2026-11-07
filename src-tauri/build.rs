fn main() {
    // The channel a binary was built for is read at compile time (`option_env!("EDEN_ENV")` in commands/app.rs), so a
    // change of EDEN_ENV between `yarn dev` and `yarn build:staging` must rebuild the crate.
    println!("cargo:rerun-if-env-changed=EDEN_ENV");
    link_weatherkit();
    link_text_reader();
    link_privacy_cover();
    tauri_build::build()
}

/// Builds and links the app switcher's privacy cover (`swift/EdenPrivacyCover`) when the target is iOS. macOS has no
/// app switcher snapshot, and every other target links nothing.
#[cfg(target_vendor = "apple")]
fn link_privacy_cover() {
    println!("cargo:rerun-if-changed=swift/EdenPrivacyCover/Package.swift");
    println!("cargo:rerun-if-changed=swift/EdenPrivacyCover/Sources");
    if std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default() != "ios" {
        return;
    }
    // The same SDKROOT handling as `link_weatherkit`: SwiftPM compiles Package.swift for the host.
    let sdk_root = std::env::var_os("SDKROOT");
    std::env::remove_var("SDKROOT");
    swift_rs::SwiftLinker::new("13.0")
        .with_ios("16.0")
        .with_package("EdenPrivacyCover", "./swift/EdenPrivacyCover/")
        .link();
    if let Some(root) = sdk_root {
        std::env::set_var("SDKROOT", root);
    }
    println!("cargo:rustc-link-lib=framework=UIKit");
}

#[cfg(not(target_vendor = "apple"))]
fn link_privacy_cover() {}

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
    // Xcode exports SDKROOT as the iOS SDK when it runs cargo, and SwiftPM would compile Package.swift, a host program,
    // against it. Tauri clears it the same way for its own Swift plugins (tauri-utils `link_swift_library`).
    let sdk_root = std::env::var_os("SDKROOT");
    std::env::remove_var("SDKROOT");
    swift_rs::SwiftLinker::new("13.0")
        .with_ios("16.0")
        .with_package("EdenWeatherKit", "./swift/EdenWeatherKit/")
        .link();
    if let Some(root) = sdk_root {
        std::env::set_var("SDKROOT", root);
    }
    println!("cargo:rustc-link-lib=framework=WeatherKit");
    println!("cargo:rustc-link-lib=framework=CoreLocation");
    // The Swift runtime ships with the system from macOS 12; the binary is told where, or it looks beside itself.
    if target_os == "macos" {
        println!("cargo:rustc-link-arg=-Wl,-rpath,/usr/lib/swift");
    }
}

#[cfg(not(target_vendor = "apple"))]
fn link_weatherkit() {}

/// Builds and links the document reader's Swift bridge (`swift/EdenTextReader`, D-190) when the target is macOS or iOS:
/// Vision recognises the text and PDFKit renders a scanned PDF's pages, both shipped with the system. Every other
/// target compiles its own recogniser or the stub in `domains/finance` and links nothing here.
#[cfg(target_vendor = "apple")]
fn link_text_reader() {
    println!("cargo:rerun-if-changed=swift/EdenTextReader/Package.swift");
    println!("cargo:rerun-if-changed=swift/EdenTextReader/Sources");
    let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
    if target_os != "macos" && target_os != "ios" {
        return;
    }
    // The same SDKROOT handling as `link_weatherkit`: SwiftPM compiles Package.swift for the host.
    let sdk_root = std::env::var_os("SDKROOT");
    std::env::remove_var("SDKROOT");
    swift_rs::SwiftLinker::new("13.0")
        .with_ios("16.0")
        .with_package("EdenTextReader", "./swift/EdenTextReader/")
        .link();
    if let Some(root) = sdk_root {
        std::env::set_var("SDKROOT", root);
    }
    for framework in ["Vision", "PDFKit", "CoreGraphics", "ImageIO"] {
        println!("cargo:rustc-link-lib=framework={framework}");
    }
    if target_os == "macos" {
        println!("cargo:rustc-link-arg=-Wl,-rpath,/usr/lib/swift");
    }
}

#[cfg(not(target_vendor = "apple"))]
fn link_text_reader() {}
