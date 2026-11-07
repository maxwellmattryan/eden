//! Where no recogniser exists (Windows, Linux): a photo or a scanned PDF reads as `unavailable`, and only a PDF's text
//! layer is read. The reader asks `COMPILED` first, so these answers are reached only by a caller that did not.
use super::Recognized;
use crate::error::{EdenError, Result};

pub const COMPILED: bool = false;

pub fn image(_: &[u8]) -> Result<Recognized> {
    Err(unavailable())
}

pub fn pdf_pages(_: &[u8], _: u32) -> Result<Recognized> {
    Err(unavailable())
}

fn unavailable() -> EdenError {
    EdenError::InvalidOperation("text recognition: not available on this platform".into())
}
