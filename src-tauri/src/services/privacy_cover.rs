//! The app switcher's privacy cover (`swift/EdenPrivacyCover`), iOS only: an opaque view in the launch screen's
//! colour lies over every window while the app is not active, so the system's snapshot never holds Eden's content.

extern "C" {
    fn eden_privacy_cover_install();
}

/// Registers the cover's observers. Calling it again does nothing.
pub fn install() {
    // SAFETY: the bridge takes no arguments and returns nothing; it only registers notification observers on the
    // main queue, guarded so a second call is a no-op.
    unsafe { eden_privacy_cover_install() }
}
