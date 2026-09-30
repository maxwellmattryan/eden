use tauri::utils::config::PluginConfig;
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
        updater_endpoint: updater_endpoint(&app.config().plugins),
    })
}

/// The first updater endpoint of the build's config: the staging and production overlays set one, development none.
fn updater_endpoint(plugins: &PluginConfig) -> Option<String> {
    plugins
        .0
        .get("updater")?
        .get("endpoints")?
        .as_array()?
        .first()?
        .as_str()
        .map(str::to_string)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_updater_endpoint_is_read_from_the_config() {
        let mut plugins = PluginConfig::default();
        assert_eq!(updater_endpoint(&plugins), None);
        plugins.0.insert(
            "updater".into(),
            serde_json::json!({ "endpoints": ["https://storage.googleapis.com/eden-releases/staging/latest.json"] }),
        );
        assert_eq!(
            updater_endpoint(&plugins).as_deref(),
            Some("https://storage.googleapis.com/eden-releases/staging/latest.json")
        );
        plugins
            .0
            .insert("updater".into(), serde_json::json!({ "endpoints": [] }));
        assert_eq!(updater_endpoint(&plugins), None);
    }
}
