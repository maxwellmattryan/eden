//! The background desktop's commands (D-207; docs/engineering/app-scaffold.md, "In the background"): launch at login,
//! whose source of truth is the OS (the owner can remove the login item in System Settings), and the relaunch that
//! keeps a hidden window hidden. The autostart plugin is called from Rust, so the webview holds no permission for it.
//! The phone answers that launch at login is not available and refuses the rest.

use serde::Serialize;

#[cfg(not(feature = "desktop"))]
use crate::error::EdenError;
use crate::error::Result;

/// Whether this build can launch at login, and whether the OS has it on now.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LaunchAtLogin {
    pub available: bool,
    pub enabled: bool,
}

#[cfg(feature = "desktop")]
mod native {
    use tauri::{AppHandle, Manager, Runtime};
    use tauri_plugin_autostart::ManagerExt;

    use super::LaunchAtLogin;
    use crate::error::{EdenError, Result};
    use crate::services::background::{relaunch_args, MAIN};
    use crate::substrate::Workspace;

    pub fn status<R: Runtime>(app: &AppHandle<R>) -> Result<LaunchAtLogin> {
        let enabled = app
            .autolaunch()
            .is_enabled()
            .map_err(|e| EdenError::InvalidOperation(format!("launch at login status: {e}")))?;
        Ok(LaunchAtLogin {
            available: true,
            enabled,
        })
    }

    pub fn set<R: Runtime>(app: &AppHandle<R>, on: bool) -> Result<LaunchAtLogin> {
        let manager = app.autolaunch();
        let changed = if on {
            manager.enable()
        } else {
            manager.disable()
        };
        changed.map_err(|e| EdenError::InvalidOperation(format!("launch at login: {e}")))?;
        status(app)
    }

    /// Restarts the process with the window as it is now: a hidden window comes back hidden. The workspace closes
    /// first, as on exit, because a restart never reaches `RunEvent::Exit`.
    pub fn relaunch<R: Runtime>(app: &AppHandle<R>) -> Result<()> {
        let hidden = match app.get_webview_window(MAIN) {
            Some(window) => !window.is_visible().unwrap_or(true),
            None => false,
        };
        let mut env = app.env();
        env.args_os = relaunch_args(&env.args_os, hidden);
        log::info!(
            "background: relaunching {}",
            if hidden { "hidden" } else { "shown" }
        );
        if let Some(workspace) = app.try_state::<Workspace>() {
            workspace.close();
        }
        app.cleanup_before_exit();
        tauri::process::restart(&env)
    }
}

/// Whether this build can launch at login and whether it is on. The OS answers, never a setting.
#[tauri::command]
pub async fn launch_at_login_status<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
) -> Result<LaunchAtLogin> {
    #[cfg(feature = "desktop")]
    {
        native::status(&app)
    }
    #[cfg(not(feature = "desktop"))]
    {
        let _ = app;
        Ok(LaunchAtLogin {
            available: false,
            enabled: false,
        })
    }
}

/// Registers this build's launch agent (with `--hidden`) or removes it, then answers the status read again.
#[tauri::command]
pub async fn set_launch_at_login<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    on: bool,
) -> Result<LaunchAtLogin> {
    #[cfg(feature = "desktop")]
    {
        native::set(&app, on)
    }
    #[cfg(not(feature = "desktop"))]
    {
        let _ = (app, on);
        Err(EdenError::Refused(
            "launch at login is desktop-only".to_string(),
        ))
    }
}

/// Relaunches the app, hidden when the window is hidden now. Only returns when it is refused.
#[tauri::command]
pub fn relaunch_app<R: tauri::Runtime>(app: tauri::AppHandle<R>) -> Result<()> {
    #[cfg(feature = "desktop")]
    {
        native::relaunch(&app)
    }
    #[cfg(not(feature = "desktop"))]
    {
        let _ = app;
        Err(EdenError::Refused("relaunch is desktop-only".to_string()))
    }
}
