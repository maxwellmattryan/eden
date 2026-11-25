// The background desktop (D-207): desktop-only at runtime, but its pure logic is unit-tested flagless.
#[cfg(any(feature = "desktop", test))]
pub mod background;
pub mod diagnostics;
#[cfg(target_os = "ios")]
pub mod privacy_cover;
pub mod redact;
pub mod scheduler;

pub use diagnostics::DiagnosticsService;
