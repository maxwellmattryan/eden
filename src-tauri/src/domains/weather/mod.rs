//! Sky on the Rust side (docs/product/domains/weather.md): the native WeatherKit provider (D-57). Every other source
//! is keyless and fetched by the frontend. The commands exist on every platform so the handler list is one list;
//! where WeatherKit cannot run, the status says so and the forecast command refuses.
use std::sync::atomic::{AtomicU8, Ordering};

use serde::{Deserialize, Serialize};

use crate::error::{EdenError, Result};

#[cfg(any(target_os = "macos", target_os = "ios"))]
mod weatherkit;
#[cfg(any(target_os = "macos", target_os = "ios"))]
use weatherkit as native;

#[cfg(not(any(target_os = "macos", target_os = "ios")))]
mod weatherkit_stub;
#[cfg(not(any(target_os = "macos", target_os = "ios")))]
use weatherkit_stub as native;

/// Whether WeatherKit has answered in this run: only a real request can tell, since a missing entitlement shows as a
/// refusal from the service and nowhere else.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Verified {
    Unknown,
    Ok,
    Failed,
}

static VERIFIED: AtomicU8 = AtomicU8::new(0);

fn verified() -> Verified {
    match VERIFIED.load(Ordering::Relaxed) {
        1 => Verified::Ok,
        2 => Verified::Failed,
        _ => Verified::Unknown,
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WeatherKitStatus {
    /// The bridge is in this build: macOS and iOS only.
    compiled: bool,
    verified: Verified,
}

/// A forecast as the bridge returns it: metric, times in milliseconds since the epoch. The frontend normalizes it
/// into its model (`@eden/shared/weather`); the shape is checked here so a malformed answer never crosses.
#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WeatherKitForecast {
    time_zone: String,
    current: Reading,
    hours: Vec<Hour>,
    days: Vec<Day>,
    attribution: Credit,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Reading {
    time: f64,
    temp: f64,
    feels_like: f64,
    condition: String,
    daylight: bool,
    humidity: f64,
    dew_point: f64,
    wind_speed: f64,
    wind_gust: Option<f64>,
    wind_direction: f64,
    pressure: f64,
    visibility: f64,
    cloud_cover: f64,
    precipitation: f64,
    uv: f64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Hour {
    time: f64,
    temp: f64,
    condition: String,
    daylight: bool,
    precip_chance: f64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Day {
    time: f64,
    condition: String,
    hi: f64,
    lo: f64,
    precip_chance: f64,
    precip_amount: f64,
    uv_max: f64,
    wind_max: Option<f64>,
    sunrise: Option<f64>,
    sunset: Option<f64>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Credit {
    name: String,
    mark_light: Option<String>,
    mark_dark: Option<String>,
    legal_url: String,
}

#[derive(Debug, Deserialize)]
struct Failure {
    error: String,
}

/// Two decimals, about one kilometre: what leaves the device (D-60), whatever the caller sent.
fn rounded(value: f64) -> f64 {
    (value * 100.0).round() / 100.0
}

/// The bridge's answer as a forecast, or its error.
fn parse(json: &str) -> Result<WeatherKitForecast> {
    if let Ok(failure) = serde_json::from_str::<Failure>(json) {
        return Err(EdenError::InvalidOperation(format!(
            "WeatherKit: {}",
            failure.error
        )));
    }
    Ok(serde_json::from_str(json)?)
}

#[tauri::command]
pub fn weatherkit_status() -> WeatherKitStatus {
    WeatherKitStatus {
        compiled: native::COMPILED,
        verified: verified(),
    }
}

#[tauri::command]
pub async fn weatherkit_forecast(
    latitude: f64,
    longitude: f64,
    past_days: u8,
    forecast_days: u8,
) -> Result<WeatherKitForecast> {
    if !latitude.is_finite() || !longitude.is_finite() {
        return Err(EdenError::InvalidOperation(
            "WeatherKit: the coordinates are not numbers".into(),
        ));
    }
    let (latitude, longitude) = (rounded(latitude), rounded(longitude));
    // The bridge blocks until WeatherKit answers, so it runs off the async runtime's threads and never on the main one.
    let answer = tauri::async_runtime::spawn_blocking(move || {
        native::forecast(
            latitude,
            longitude,
            past_days.min(9),
            forecast_days.clamp(1, 10),
        )
    })
    .await
    .map_err(EdenError::Tauri)?;
    let result = answer.and_then(|json| parse(&json));
    VERIFIED.store(if result.is_ok() { 1 } else { 2 }, Ordering::Relaxed);
    if let Err(error) = &result {
        log::warn!("{error}");
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_the_bridge_forecast() {
        let forecast = parse(include_str!(
            "../../../../packages/shared/src/weather/fixtures/weatherkit.json"
        ))
        .expect("the fixture parses");
        assert_eq!(forecast.time_zone, "America/Chicago");
        assert_eq!(forecast.days.len(), 13);
        assert_eq!(forecast.current.condition, "mostlyClear");
        assert!(forecast.current.wind_gust.is_some());
        assert_eq!(forecast.attribution.name, "Apple Weather");
    }

    #[test]
    fn reads_the_bridge_error() {
        let error = parse(r#"{"error":"WDSJWTAuthenticatorServiceListener.Errors error 2"}"#)
            .expect_err("an error document is an error");
        assert!(error.to_string().contains("WDSJWTAuthenticator"));
    }

    #[test]
    fn refuses_a_malformed_answer() {
        assert!(parse(r#"{"timeZone":"UTC"}"#).is_err());
    }

    /// Calls WeatherKit for real: `cargo test --features desktop live_bridge -- --ignored --nocapture`. A build without
    /// the entitlement gets the service's refusal as an error; a signed one gets a forecast. Either way the bridge
    /// answers and nothing hangs.
    #[cfg(any(target_os = "macos", target_os = "ios"))]
    #[test]
    #[ignore = "reaches Apple's WeatherKit"]
    fn live_bridge_answers() {
        let json = native::forecast(30.31, -97.74, 6, 7).expect("the bridge returns a document");
        match parse(&json) {
            Ok(forecast) => println!(
                "forecast: {} days in {}",
                forecast.days.len(),
                forecast.time_zone
            ),
            Err(error) => println!("refused: {error}"),
        }
    }

    #[test]
    fn rounds_coordinates_to_two_decimals() {
        assert_eq!(rounded(30.305), 30.31);
        assert_eq!(rounded(-97.7351), -97.74);
    }
}
