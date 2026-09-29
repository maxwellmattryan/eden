//! The call into the Swift bridge (`swift/EdenWeatherKit`), macOS and iOS only.
use std::ffi::{c_char, CStr};

use crate::error::{EdenError, Result};

pub const COMPILED: bool = true;

extern "C" {
    fn eden_weatherkit_forecast(
        latitude: f64,
        longitude: f64,
        past_days: i32,
        forecast_days: i32,
    ) -> *mut c_char;
    fn eden_weatherkit_free(pointer: *mut c_char);
}

/// The bridge's JSON document. Blocks until WeatherKit answers: call it from a blocking thread.
pub fn forecast(latitude: f64, longitude: f64, past_days: u8, forecast_days: u8) -> Result<String> {
    // SAFETY: the bridge returns null or a NUL-terminated string it allocated with `strdup`, which stays valid until
    // it is handed back to `eden_weatherkit_free`; it is copied into a `String` before that.
    unsafe {
        let pointer = eden_weatherkit_forecast(
            latitude,
            longitude,
            i32::from(past_days),
            i32::from(forecast_days),
        );
        if pointer.is_null() {
            return Err(EdenError::InvalidOperation(
                "WeatherKit: the bridge returned nothing".into(),
            ));
        }
        let json = CStr::from_ptr(pointer).to_string_lossy().into_owned();
        eden_weatherkit_free(pointer);
        Ok(json)
    }
}
