//! The IPC boundary of the scheduler (docs/product/substrate/signals-notifications.md; docs/engineering/signals.md):
//! what the shell declares from the manifests when it starts, the one-shots a domain sets, and the take of what is
//! due. `@eden/shared/scheduler` wraps them.

use tauri::State;

use crate::error::Result;
use crate::substrate::scheduler::{self, Declared, Fired};
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
