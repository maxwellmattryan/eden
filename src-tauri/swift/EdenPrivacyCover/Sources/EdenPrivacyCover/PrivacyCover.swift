// The app switcher's privacy cover. Rust calls one C function, `eden_privacy_cover_install`, once at setup. When the
// app is about to resign active (the app switcher, Control Center, the notification pull-down, the Face ID sheet), an
// opaque view in `systemBackground`, the launch screen's colour, is added over every window of the app, before the
// system takes its snapshot. It is removed when the app is active again. The lock screen itself is the web layer's
// (`@eden/shared/shell/lock`); this only keeps the snapshot from holding Eden's content.
import Foundation
import UIKit

private let coverTag = 0x45_44_45_4E  // "EDEN"

private final class PrivacyCover {
    static let shared = PrivacyCover()

    private var installed = false

    func install() {
        guard !installed else { return }
        installed = true
        let center = NotificationCenter.default
        center.addObserver(
            forName: UIApplication.willResignActiveNotification, object: nil, queue: .main
        ) { _ in
            PrivacyCover.shared.cover()
        }
        center.addObserver(
            forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main
        ) { _ in
            PrivacyCover.shared.uncover()
        }
    }

    private var windows: [UIWindow] {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
    }

    private func cover() {
        for window in windows where window.viewWithTag(coverTag) == nil {
            let view = UIView(frame: window.bounds)
            view.tag = coverTag
            view.backgroundColor = .systemBackground
            view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            view.isUserInteractionEnabled = false
            window.addSubview(view)
        }
    }

    private func uncover() {
        for window in windows {
            window.viewWithTag(coverTag)?.removeFromSuperview()
        }
    }
}

@_cdecl("eden_privacy_cover_install")
public func edenPrivacyCoverInstall() {
    // The flag and the observers are touched on the main queue only, so two calls never race.
    if Thread.isMainThread {
        PrivacyCover.shared.install()
    } else {
        DispatchQueue.main.async { PrivacyCover.shared.install() }
    }
}
