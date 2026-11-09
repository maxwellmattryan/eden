// Plaid's native Link sheet on iOS (docs/product/domains/finance.md §8, "Plaid on the phone", D-206). The crate's
// `link_sheet::present` calls `eden_plaid_link_open` with a link token it made for the sheet and its C callback; this
// presents LinkKit's sheet over the app and hands the outcome straight back to the crate as JSON, so the public token
// never reaches the webview. Compiled into the iOS app target by Xcode (gen/apple/project.yml), not by cargo: LinkKit
// is a binary framework only the app can embed.
//
// Nothing here prints or logs: no token, no outcome.

import LinkKit
import UIKit

private enum PlaidLinkBridge {
    /// The one handler presenting, kept until its outcome; a second open while it presents is ignored.
    static var handler: Handler?

    static func topViewController() -> UIViewController? {
        let windows = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
        guard var top = (windows.first { $0.isKeyWindow } ?? windows.first)?.rootViewController else { return nil }
        while let presented = top.presentedViewController, !presented.isBeingDismissed {
            top = presented
        }
        return top
    }

    static func send(_ outcome: [String: String], to done: @convention(c) (UnsafePointer<CChar>?) -> Void) {
        guard let data = try? JSONSerialization.data(withJSONObject: outcome),
            let json = String(data: data, encoding: .utf8)
        else { return }
        json.withCString { done($0) }
    }

    /// Presents the sheet; on the main thread. Answers 0 once presented or ignored, 1 when nothing can present it.
    static func open(token: String, done: @escaping @convention(c) (UnsafePointer<CChar>?) -> Void) -> Int32 {
        if handler != nil { return 0 }
        guard let top = topViewController() else { return 1 }
        var configuration = LinkTokenConfiguration(token: token) { success in
            handler = nil
            send(["linkToken": token, "outcome": "success", "publicToken": success.publicToken], to: done)
        }
        configuration.onExit = { exit in
            handler = nil
            var outcome = ["linkToken": token, "outcome": "exit"]
            if let code = exit.error?.errorCode.description, !code.isEmpty { outcome["errorCode"] = code }
            send(outcome, to: done)
        }
        switch Plaid.create(configuration) {
        case .failure:
            return 1
        case .success(let created):
            handler = created
            created.open(presentUsing: .viewController(top))
            return 0
        }
    }
}

/// The crate's entry (`link_sheet.rs`): the token is copied before this returns, and `done` is called once, on the main
/// thread, with the outcome's JSON.
@_cdecl("eden_plaid_link_open")
public func edenPlaidLinkOpen(
    _ token: UnsafePointer<CChar>,
    _ done: @escaping @convention(c) (UnsafePointer<CChar>?) -> Void
) -> Int32 {
    let token = String(cString: token)
    if Thread.isMainThread { return PlaidLinkBridge.open(token: token, done: done) }
    return DispatchQueue.main.sync { PlaidLinkBridge.open(token: token, done: done) }
}
