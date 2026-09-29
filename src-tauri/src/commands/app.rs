use tauri::Manager;

use crate::models::AppInfo;

/// The channel this binary was built for: `EDEN_ENV` at compile time, development when unset (`yarn dev`).
pub fn environment() -> &'static str {
    option_env!("EDEN_ENV").unwrap_or("development")
}

#[tauri::command]
pub fn get_app_info(app: tauri::AppHandle) -> Result<AppInfo, String> {
    let environment = environment().to_string();
    let is_dev = environment == "development";

    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .to_string_lossy()
        .to_string();

    Ok(AppInfo {
        version: app.package_info().version.to_string(),
        environment,
        is_dev,
        data_dir,
    })
}
