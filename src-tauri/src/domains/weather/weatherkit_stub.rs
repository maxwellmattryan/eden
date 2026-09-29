//! Where WeatherKit does not exist (Windows, Linux, Android): the status reports it absent and the settings never
//! offer it (D-56), so this is reached only by a caller that did not ask first.
use crate::error::{EdenError, Result};

pub const COMPILED: bool = false;

pub fn forecast(_: f64, _: f64, _: u8, _: u8) -> Result<String> {
    Err(EdenError::InvalidOperation(
        "WeatherKit: not available on this platform".into(),
    ))
}
