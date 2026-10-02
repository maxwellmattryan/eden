//! The IPC boundary of the scheduler, the signals and the inbox (docs/product/substrate/signals-notifications.md;
//! docs/engineering/signals.md): what the shell declares from the manifests when it starts, the one-shots a domain
//! sets, the take of what is due, the emit of a signal with the cards its rules ask for, the inbox behind the bell,
//! and the OS notification of a card. `@eden/shared/scheduler` and `@eden/shared/signals` wrap them.

use tauri::{AppHandle, State};
use tauri_plugin_notification::{NotificationExt, PermissionState};

use crate::error::Result;
use crate::substrate::scheduler::{self, Declared, Fired};
use crate::substrate::signals::{self, Emitted, InboxEntry, InboxQuery, SignalInput};
use crate::substrate::{hlc, Workspace};

fn now_ms() -> i64 {
    hlc::now_ms() as i64
}

#[tauri::command]
pub async fn declare_schedules(
    workspace: State<'_, Workspace>,
    schedules: Vec<Declared>,
) -> Result<()> {
    workspace.write(|ctx| scheduler::declare(ctx.conn, &schedules, now_ms()))
}

#[tauri::command]
pub async fn set_schedule(workspace: State<'_, Workspace>, name: String, at: i64) -> Result<()> {
    workspace.write(|ctx| scheduler::set(ctx.conn, &name, at))
}

#[tauri::command]
pub async fn cancel_schedule(workspace: State<'_, Workspace>, name: String) -> Result<bool> {
    workspace.write(|ctx| scheduler::cancel(ctx.conn, &name))
}

#[tauri::command]
pub async fn take_due_schedules(workspace: State<'_, Workspace>) -> Result<Vec<Fired>> {
    workspace.write(|ctx| scheduler::take_due(ctx.conn, now_ms()))
}

#[tauri::command]
pub async fn emit_signal(
    workspace: State<'_, Workspace>,
    input: SignalInput,
) -> Result<Option<Emitted>> {
    workspace.write(|ctx| signals::emit(ctx.conn, input))
}

#[tauri::command]
pub async fn query_inbox(
    workspace: State<'_, Workspace>,
    filter: InboxQuery,
) -> Result<Vec<InboxEntry>> {
    workspace.read(|conn| signals::query_inbox(conn, &filter))
}

#[tauri::command]
pub async fn mark_inbox_read(workspace: State<'_, Workspace>, ids: Vec<String>) -> Result<usize> {
    workspace.write(|ctx| signals::mark_read(ctx.conn, &ids))
}

#[tauri::command]
pub async fn withdraw_signal(
    workspace: State<'_, Workspace>,
    name: String,
    dedupe_key: String,
) -> Result<Vec<String>> {
    workspace.write(|ctx| signals::withdraw(ctx.conn, &name, &dedupe_key))
}

/// Shows an OS notification with the words the shell wrote for a card. Answers whether it was handed to the system:
/// not while the owner has the capability off on this device. The system itself reports nothing back.
#[tauri::command]
pub async fn show_notification(
    app: AppHandle,
    workspace: State<'_, Workspace>,
    title: String,
    body: String,
) -> Result<bool> {
    if !workspace.read(signals::may_notify)? {
        return Ok(false);
    }
    match app.notification().builder().title(title).body(body).show() {
        Ok(()) => Ok(true),
        Err(e) => {
            log::warn!("An OS notification could not be shown: {e}");
            Ok(false)
        }
    }
}

/// Asks the system whether Eden may show notifications, which on a phone (iOS, Android 13 and later) raises the
/// system's own prompt the first time. Answers whether it is allowed: desktop answers yes without a prompt. The shell
/// asks when the owner turns notifications on, before the capability grant is recorded (D-TBD(phone-chrome)).
#[tauri::command]
pub async fn request_notification_permission(app: AppHandle) -> Result<bool> {
    match app.notification().request_permission() {
        Ok(state) => Ok(state == PermissionState::Granted),
        Err(e) => {
            log::warn!("The notification permission could not be asked: {e}");
            Ok(false)
        }
    }
}
