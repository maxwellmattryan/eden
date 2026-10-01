//! The Eden shell: one crate for the desktop and mobile apps (D-51), selected by the `desktop` and `mobile` cargo
//! features. `run()` installs the crash log and the platform logger, registers the plugins each platform needs, manages
//! the diagnostics service, starts the scheduler's alarm and exposes the commands the frontends call.

mod commands;
mod db;
mod domains;
mod error;
mod gardener;
mod models;
mod services;
mod substrate;
// Updater acceptance rule: desktop-only at runtime, but its pure logic is unit-tested flagless.
#[cfg(any(feature = "desktop", test))]
mod updater;

use tauri::Manager;

use services::DiagnosticsService;
use substrate::Workspace;

/// Panics go to `eden-crash.log` in the temp dir and through `log`: on Windows a release build hides the console, and on
/// mobile the default hook's stderr is discarded, so without this a startup panic is invisible.
fn install_panic_hook() {
    let crash_log_path = std::env::temp_dir().join("eden-crash.log");
    let default_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let message = format!(
            "[{}] PANIC: {}\nLocation: {:?}\n\n",
            chrono::Utc::now().format("%Y-%m-%d %H:%M:%S UTC"),
            info,
            info.location(),
        );
        let _ = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&crash_log_path)
            .and_then(|mut f| std::io::Write::write_all(&mut f, message.as_bytes()));
        log::error!("PANIC: {info}");
        default_hook(info);
    }));
}

/// Route `log` output where each platform can see it: os_log on iOS (the app's identifier as subsystem), logcat on
/// Android, stderr with `RUST_LOG` on desktop.
fn init_logging(subsystem: &str) {
    #[cfg(target_os = "ios")]
    oslog::OsLogger::new(subsystem)
        .level_filter(log::LevelFilter::Info)
        .init()
        .ok();
    #[cfg(target_os = "android")]
    android_logger::init_once(
        android_logger::Config::default()
            .with_max_level(log::LevelFilter::Info)
            .with_tag(subsystem),
    );
    #[cfg(not(any(target_os = "ios", target_os = "android")))]
    {
        let _ = subsystem;
        env_logger::Builder::from_env(env_logger::Env::default().default_filter_or("info")).init();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let context = tauri::generate_context!();
    let identifier = context.config().identifier.clone();

    install_panic_hook();
    init_logging(&identifier);
    log::info!(
        "Eden {} ({}) starting",
        context.package_info().version,
        commands::app::environment()
    );

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_notification::init());

    // Desktop-only plugins: the updater (mobile updates through the stores), the process plugin for the relaunch
    // after an update, and window-state (there are no OS windows to persist on mobile).
    #[cfg(feature = "desktop")]
    let builder = builder
        .plugin(
            tauri_plugin_updater::Builder::default()
                .default_version_comparator(updater::version_comparator)
                .build(),
        )
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_window_state::Builder::default().build());

    // Mobile-only plugins: haptics (light impact feedback on tap).
    #[cfg(feature = "mobile")]
    let builder = builder.plugin(tauri_plugin_haptics::init());

    // If the OS kills the WKWebView content process (iOS jetsam under memory pressure: the screen goes white), reload
    // the webview so the UI recovers instead of staying blank until a relaunch. iOS/macOS only.
    #[cfg(any(target_os = "macos", target_os = "ios"))]
    let builder = builder.on_web_content_process_terminate(|webview| {
        log::warn!("Web content process terminated: reloading the webview");
        if let Err(e) = webview.reload() {
            log::error!("Failed to reload the webview after content process termination: {e}");
        }
    });

    builder
        .invoke_handler(tauri::generate_handler![
            commands::app::get_app_info,
            commands::diagnostics::get_diagnostic_entries,
            commands::diagnostics::get_system_info,
            commands::diagnostics::get_diagnostics_report,
            commands::diagnostics::clear_diagnostic_entries,
            commands::diagnostics::log_error,
            commands::data::create_entity,
            commands::data::update_entity,
            commands::data::query_entities,
            commands::data::delete_rows,
            commands::data::restore_rows,
            commands::data::apply_batch,
            commands::data::link,
            commands::data::unlink,
            commands::data::query_links,
            commands::data::get_row,
            commands::data::snapshot,
            commands::data::create_task,
            commands::data::create_event,
            commands::data::create_place,
            commands::data::attach,
            commands::data::attach_bytes,
            commands::data::read_attachment,
            commands::data::update_task,
            commands::data::update_event,
            commands::data::update_place,
            commands::data::update_attachment,
            commands::data::query_tasks,
            commands::data::query_events,
            commands::data::query_places,
            commands::data::query_attachments,
            commands::data::export_bundle,
            commands::data::inspect_bundle,
            commands::data::import_bundle,
            commands::privacy::grant,
            commands::privacy::revoke,
            commands::privacy::query_grants,
            commands::privacy::check_grant,
            commands::privacy::record_egress,
            commands::privacy::query_egress,
            commands::profile::assert_fact,
            commands::profile::update_fact,
            commands::profile::delete_fact,
            commands::profile::restore_fact,
            commands::profile::query_facts,
            commands::profile::query_fact_history,
            commands::signals::declare_schedules,
            commands::signals::set_schedule,
            commands::signals::cancel_schedule,
            commands::signals::take_due_schedules,
            commands::signals::emit_signal,
            commands::signals::query_inbox,
            commands::signals::mark_inbox_read,
            commands::signals::withdraw_signal,
            commands::signals::show_notification,
            commands::gardener::set_secret,
            commands::gardener::has_secret,
            commands::gardener::delete_secret,
            commands::gardener::gardener_send,
            commands::gardener::gardener_cancel,
            commands::gardener::record_audit,
            commands::gardener::query_audit,
            commands::gardener::audit_usage,
            commands::gardener::audit_spend,
            commands::gardener::create_thread,
            commands::gardener::update_thread,
            commands::gardener::delete_thread,
            commands::gardener::restore_thread,
            commands::gardener::query_threads,
            commands::gardener::append_message,
            commands::gardener::update_message,
            commands::gardener::delete_message,
            commands::gardener::query_messages,
            commands::gardener::get_policy,
            commands::gardener::set_policy,
            commands::web::fetch_page,
            commands::web::fetch_image,
            domains::documents::load_domain_document,
            domains::documents::save_domain_document,
            domains::documents::remove_domain_document,
            domains::weather::weatherkit_status,
            domains::weather::weatherkit_forecast,
        ])
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .map_err(|e| format!("Failed to get the app data directory: {e}"))?;
            std::fs::create_dir_all(&app_data_dir)?;
            log::info!("Data directory: {app_data_dir:?}");

            // Without its data the app is of no use, so a workspace that will not open stops the launch.
            let workspace = Workspace::open(&app_data_dir).map_err(|e| {
                log::error!("Fatal: failed to open the workspace: {e}");
                e
            })?;
            app.manage(workspace);
            // The owner's secrets live beside the workspace, in the store the platform offers, never in it.
            app.manage(db::secret_store::for_platform(&app_data_dir));
            // The Gardener's TLS: one crypto provider for the process, installed before anything builds a client.
            // The updater installs the same one if it gets there first, so a second install is nothing.
            let _ = rustls::crypto::ring::default_provider().install_default();
            app.manage(gardener::Inflight::default());
            app.manage(DiagnosticsService::new(app_data_dir));
            // The scheduler's tick: it reads the workspace, so it starts once that is managed.
            services::scheduler::start(app.handle().clone());
            Ok(())
        })
        .build(context)
        .unwrap_or_else(|e| {
            log::error!("Fatal: failed to run the Tauri application: {e}");
            std::process::exit(1);
        })
        .run(|handle, event| {
            if let tauri::RunEvent::Exit = event {
                if let Some(workspace) = handle.try_state::<Workspace>() {
                    workspace.close();
                }
            }
        });
}
