//! The call into the staged Kotlin reader (`android/EdenTextReader.kt`): ML Kit's bundled Latin model over a photo or
//! a PDF's pages rendered with `PdfRenderer`. Compile-only until the Android project exists (docs/engineering/
//! data-layer.md, "The Android checklist").
use jni::objects::{JByteArray, JObject, JString, JValue};
use jni::JavaVM;

use super::{from_bridge, Recognized};
use crate::error::{EdenError, Result};

pub const COMPILED: bool = true;

/// The JNI name of the Kotlin reader. It follows the Android namespace, which follows the app's identifier (D-69):
/// this constant and the `package` line of `EdenTextReader.kt` change together, never alone.
const TEXT_READER_CLASS: &str = "com/palekodama/eden/EdenTextReader";

/// The text ML Kit recognises in a photo. Blocks while it works: call it from a blocking thread.
pub fn image(bytes: &[u8]) -> Result<Recognized> {
    call(
        "readImage",
        "(Landroid/content/Context;[B)Ljava/lang/String;",
        bytes,
        None,
    )
}

/// The text ML Kit recognises on a PDF's first `max_pages` pages, rendered. Blocks while it works.
pub fn pdf_pages(bytes: &[u8], max_pages: u32) -> Result<Recognized> {
    call(
        "readPdf",
        "(Landroid/content/Context;[BI)Ljava/lang/String;",
        bytes,
        Some(i32::try_from(max_pages).unwrap_or(i32::MAX)),
    )
}

fn call(method: &str, signature: &str, bytes: &[u8], max_pages: Option<i32>) -> Result<Recognized> {
    // The error names the step only, never the document.
    let wrap = |step: &str| EdenError::InvalidOperation(format!("text recognition: {step}"));

    // The Tauri runtime fills `ndk_context` when the Activity is created, before any command runs.
    let ctx = ndk_context::android_context();
    // SAFETY: `vm()` and `context()` are handles the runtime owns for the life of the process.
    let vm = unsafe { JavaVM::from_raw(ctx.vm().cast()) }.map_err(|_| wrap("JavaVM"))?;
    let mut env = vm.attach_current_thread().map_err(|_| wrap("attach"))?;
    let context = unsafe { JObject::from_raw(ctx.context().cast()) };

    let result = (|| -> Result<String> {
        let array: JByteArray = env
            .byte_array_from_slice(bytes)
            .map_err(|_| wrap("bytes"))?;
        let mut arguments = vec![JValue::Object(&context), JValue::Object(&array)];
        if let Some(pages) = max_pages {
            arguments.push(JValue::Int(pages));
        }
        let value = env
            .call_static_method(TEXT_READER_CLASS, method, signature, &arguments)
            .map_err(|_| wrap("EdenTextReader failed"))?;
        let object = value.l().map_err(|_| wrap("answer"))?;
        if object.is_null() {
            return Err(wrap("the reader could not read the file"));
        }
        let json: String = env
            .get_string(&JString::from(object))
            .map_err(|_| wrap("answer decode"))?
            .into();
        Ok(json)
    })();

    // A Java exception left pending would abort the next JNI call; clear it without describing it, since its message
    // could quote the document.
    if result.is_err() && env.exception_check().unwrap_or(false) {
        let _ = env.exception_clear();
    }
    from_bridge(&result?)
}
