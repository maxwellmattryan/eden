//! The desktop in the background (D-207; docs/engineering/app-scaffold.md, "In the background"): closing the window
//! hides it, Eden leaves the Dock while hidden on macOS, and a menu bar item opens the window again or quits. The
//! webview is never destroyed by a hide, so the stores, the scheduler's takers and the Gardener's handlers keep running.
//! The argument and label logic is pure and tested flagless; the window, Dock and tray work is desktop-only.

use std::ffi::{OsStr, OsString};

/// The argument a launch at login (and a relaunch from a hidden window) carries: start with the window hidden.
pub const HIDDEN_FLAG: &str = "--hidden";

/// Whether this process was launched to start hidden.
pub fn launched_hidden(args: &[OsString]) -> bool {
    args.iter().any(|arg| arg == OsStr::new(HIDDEN_FLAG))
}

/// The arguments to relaunch with: argv[0] and every other argument in order, any `--hidden` dropped, and one
/// `--hidden` appended only when the window is hidden now.
// Only the desktop relaunch calls it; the tests run flagless.
#[cfg_attr(not(feature = "desktop"), allow(dead_code))]
pub fn relaunch_args(args: &[OsString], hidden: bool) -> Vec<OsString> {
    let mut next: Vec<OsString> = args
        .iter()
        .enumerate()
        .filter(|(i, arg)| *i == 0 || arg.as_os_str() != OsStr::new(HIDDEN_FLAG))
        .map(|(_, arg)| arg.clone())
        .collect();
    if hidden {
        next.push(OsString::from(HIDDEN_FLAG));
    }
    next
}

/// The menu bar item's channel line: the window's title in a dev or staging build, nothing in production.
#[cfg_attr(not(feature = "desktop"), allow(dead_code))]
pub fn channel_label<'a>(environment: &str, title: &'a str) -> Option<&'a str> {
    match environment {
        "development" | "staging" => Some(title),
        _ => None,
    }
}

#[cfg(feature = "desktop")]
pub use runtime::{hide_main, install_tray, show_main, MAIN};

#[cfg(feature = "desktop")]
mod runtime {
    use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
    use tauri::tray::TrayIconBuilder;
    use tauri::{AppHandle, Manager, Runtime};

    use super::channel_label;

    /// The label of the one window, made explicit in every `tauri*.conf.json`.
    pub const MAIN: &str = "main";
    const OPEN: &str = "open";
    const QUIT: &str = "quit";

    /// Shows the window where window-state left it, unminimized and focused, and brings the Dock icon back first.
    pub fn show_main<R: Runtime>(app: &AppHandle<R>) {
        #[cfg(target_os = "macos")]
        if let Err(e) = app.set_activation_policy(tauri::ActivationPolicy::Regular) {
            log::warn!("background: the Dock icon did not come back: {e}");
        }
        let Some(window) = app.get_webview_window(MAIN) else {
            log::warn!("background: there is no main window to show");
            return;
        };
        for (step, result) in [
            ("show", window.show()),
            ("unminimize", window.unminimize()),
            ("focus", window.set_focus()),
        ] {
            if let Err(e) = result {
                log::warn!("background: the window did not {step}: {e}");
            }
        }
    }

    /// Hides the window, never closing its webview, then leaves the Dock on macOS.
    pub fn hide_main<R: Runtime>(app: &AppHandle<R>) {
        if let Some(window) = app.get_webview_window(MAIN) {
            if let Err(e) = window.hide() {
                log::warn!("background: the window did not hide: {e}");
            }
        }
        #[cfg(target_os = "macos")]
        if let Err(e) = app.set_activation_policy(tauri::ActivationPolicy::Accessory) {
            log::warn!("background: Eden did not leave the Dock: {e}");
        }
    }

    /// The menu bar item, present for as long as the app runs. Its menu, top to bottom: the channel line and a
    /// separator in a dev or staging build, Open Eden, a separator, Quit Eden. Items for #113 (the MCP server's state,
    /// Pause and Resume) go between Open Eden and the separator above Quit Eden.
    pub fn install_tray<R: Runtime>(app: &AppHandle<R>) {
        if let Err(e) = build_tray(app) {
            log::warn!("background: the menu bar item was not installed: {e}");
        }
    }

    fn build_tray<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
        let title = app
            .config()
            .app
            .windows
            .iter()
            .find(|window| window.label == MAIN)
            .map(|window| window.title.clone())
            .unwrap_or_else(|| "Eden".to_string());
        let channel = channel_label(crate::commands::app::environment(), &title);

        let menu = Menu::new(app)?;
        if let Some(label) = channel {
            menu.append(&MenuItem::new(app, label, false, None::<&str>)?)?;
            menu.append(&PredefinedMenuItem::separator(app)?)?;
        }
        menu.append(&MenuItem::with_id(
            app,
            OPEN,
            "Open Eden",
            true,
            None::<&str>,
        )?)?;
        menu.append(&PredefinedMenuItem::separator(app)?)?;
        menu.append(&MenuItem::with_id(
            app,
            QUIT,
            "Quit Eden",
            true,
            None::<&str>,
        )?)?;

        let mut tray = TrayIconBuilder::with_id(MAIN)
            .tooltip(channel.unwrap_or("Eden"))
            .menu(&menu)
            .on_menu_event(|app, event| match event.id().as_ref() {
                OPEN => show_main(app),
                QUIT => app.exit(0),
                _ => {}
            });
        if let Some(icon) = app.default_window_icon() {
            tray = tray.icon(icon.clone());
        }
        tray.build(app)?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn args(list: &[&str]) -> Vec<OsString> {
        list.iter().map(OsString::from).collect()
    }

    #[test]
    fn hidden_only_with_the_flag() {
        assert!(launched_hidden(&args(&[
            "/Applications/Eden.app/Contents/MacOS/Eden",
            "--hidden"
        ])));
        assert!(launched_hidden(&args(&[
            "eden",
            "--verbose",
            "--hidden",
            "x"
        ])));
        assert!(!launched_hidden(&args(&["eden"])));
        assert!(!launched_hidden(&args(&[])));
        assert!(!launched_hidden(&args(&[
            "eden",
            "--hiddenx",
            "-hidden",
            "hidden"
        ])));
    }

    #[test]
    fn relaunch_carries_hidden_only_when_hidden() {
        assert_eq!(
            relaunch_args(&args(&["eden", "a", "b"]), false),
            args(&["eden", "a", "b"])
        );
        assert_eq!(
            relaunch_args(&args(&["eden", "a", "b"]), true),
            args(&["eden", "a", "b", "--hidden"])
        );
        assert_eq!(
            relaunch_args(&args(&["eden", "--hidden", "a", "--hidden"]), false),
            args(&["eden", "a"])
        );
        assert_eq!(
            relaunch_args(&args(&["eden", "--hidden", "a"]), true),
            args(&["eden", "a", "--hidden"])
        );
        // argv[0] is the program, kept whatever it is.
        assert_eq!(
            relaunch_args(&args(&["--hidden"]), false),
            args(&["--hidden"])
        );
        assert_eq!(relaunch_args(&[], true), args(&["--hidden"]));
    }

    #[test]
    fn only_dev_and_staging_name_their_channel() {
        assert_eq!(
            channel_label("development", "Eden [DEV]"),
            Some("Eden [DEV]")
        );
        assert_eq!(
            channel_label("staging", "Eden [STAGING]"),
            Some("Eden [STAGING]")
        );
        assert_eq!(channel_label("production", "Eden"), None);
    }
}
