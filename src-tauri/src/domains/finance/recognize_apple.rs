//! The call into the Swift bridge (`swift/EdenTextReader`): Vision's text recognition over a photo or a PDF's rendered
//! pages, macOS and iOS only.
use std::ffi::{c_char, CStr};

use super::{from_bridge, Recognized};
use crate::error::{EdenError, Result};

pub const COMPILED: bool = true;

extern "C" {
    fn eden_text_read_image(pointer: *const u8, length: usize) -> *mut c_char;
    fn eden_text_read_pdf(pointer: *const u8, length: usize, max_pages: u32) -> *mut c_char;
    fn eden_text_free(pointer: *mut c_char);
}

/// The text Vision recognises in a photo. Blocks while it works: call it from a blocking thread.
pub fn image(bytes: &[u8]) -> Result<Recognized> {
    // SAFETY: the bridge reads `length` bytes from `pointer`, which `bytes` keeps alive for the call.
    answer(unsafe { eden_text_read_image(bytes.as_ptr(), bytes.len()) })
}

/// The text Vision recognises on a PDF's first `max_pages` pages, rendered. Blocks while it works.
pub fn pdf_pages(bytes: &[u8], max_pages: u32) -> Result<Recognized> {
    // SAFETY: as for `image`.
    answer(unsafe { eden_text_read_pdf(bytes.as_ptr(), bytes.len(), max_pages) })
}

fn answer(pointer: *mut c_char) -> Result<Recognized> {
    if pointer.is_null() {
        return Err(EdenError::InvalidOperation(
            "text recognition: the bridge could not read the file".into(),
        ));
    }
    // SAFETY: a non-null answer is a NUL-terminated string the bridge allocated with `strdup`, valid until it is
    // handed back to `eden_text_free`; it is copied before that.
    let json = unsafe {
        let json = CStr::from_ptr(pointer).to_string_lossy().into_owned();
        eden_text_free(pointer);
        json
    };
    from_bridge(&json)
}
