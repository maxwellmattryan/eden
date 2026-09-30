//! The scheduler's alarm (docs/engineering/signals.md, "The alarm"; D-73). A timer in the webview is slowed or stopped
//! while the window is hidden, so the tick lives here: a thread that looks at the earliest schedule every half
//! minute and, when one is due, tells the shell (`scheduler-due`). It changes nothing itself. The shell takes what is
//! due (`take_due_schedules`), and until it does the alarm rings again at every look, so a webview that was reloading
//! or not yet listening misses nothing.

use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager};

use crate::substrate::{hlc, scheduler, Workspace};

/// The event the shell listens for. A Tauri event's name has no dot, so it is not a signal's name.
pub const DUE_EVENT: &str = "scheduler-due";
/// How often the alarm looks: what is due is told at most this late.
const LOOK: Duration = Duration::from_secs(30);

/// Starts the alarm for the life of the app. The workspace must be managed before.
pub fn start(app: AppHandle) {
    let spawned = std::thread::Builder::new()
        .name("scheduler-alarm".into())
        .spawn(move || loop {
            std::thread::sleep(LOOK);
            let Some(workspace) = app.try_state::<Workspace>() else {
                continue;
            };
            match workspace.read(scheduler::next_due) {
                Ok(Some(next_at)) if next_at <= hlc::now_ms() as i64 => {
                    log::debug!("scheduler: something is due");
                    if let Err(e) = app.emit(DUE_EVENT, ()) {
                        log::warn!("scheduler: could not tell the shell: {e}");
                    }
                }
                Ok(_) => {}
                Err(e) => log::warn!("scheduler: could not read the schedules: {e}"),
            }
        });
    if let Err(e) = spawned {
        log::error!("scheduler: the alarm did not start: {e}");
    }
}
