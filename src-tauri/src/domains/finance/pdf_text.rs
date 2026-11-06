//! A PDF's text layer, through `pdf-extract` over lopdf: pure Rust, so it reads the same on every target. A PDF that
//! needs a password is `Locked`; one the library cannot load, or that makes it panic, has no text layer.

use std::cell::Cell;
use std::panic::{catch_unwind, AssertUnwindSafe};
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

use pdf_extract::{Document, PlainTextOutput};

/// What the text layer gave.
#[derive(Debug, PartialEq)]
pub enum TextLayer {
    /// Each page's text, in order; an empty page is an empty string.
    Pages(Vec<String>),
    /// The PDF needs a password.
    Locked,
    /// Not loadable, or the library panicked.
    Missing,
}

thread_local! {
    /// Set while this thread is inside the PDF library, so the crate's panic hook (`lib.rs`) names no detail of a
    /// panic there: its message could quote the document.
    static READING: Cell<bool> = const { Cell::new(false) };
}

/// Whether the current thread is reading a PDF's text layer.
pub fn reading() -> bool {
    READING.with(Cell::get)
}

/// How long the text layer may take before it counts as missing. A PDF whose streams inflate to gigabytes, or whose
/// object graph is a maze, is given up on here; the library has no cap of its own on decoded size.
const DEADLINE: Duration = Duration::from_secs(20);
/// The stack of the thread the library runs on: deeper than a blocking pool thread's, so a deeply nested document
/// is less likely to overflow it, and fixed, so the bound is known.
const STACK_BYTES: usize = 16 * 1024 * 1024;

/// The text layer of `bytes`, page by page, read on a thread of its own and given up after `DEADLINE`. Never panics.
/// A read given up on keeps its thread until the library returns, and its answer is dropped.
pub fn text_layer(bytes: &[u8]) -> TextLayer {
    let owned = bytes.to_vec();
    let (send, receive) = mpsc::channel();
    let spawned = thread::Builder::new()
        .name("eden-pdf-text".into())
        .stack_size(STACK_BYTES)
        .spawn(move || {
            READING.with(|flag| flag.set(true));
            let layer =
                catch_unwind(AssertUnwindSafe(|| pages(&owned))).unwrap_or(TextLayer::Missing);
            READING.with(|flag| flag.set(false));
            // The reader may have given up; nothing waits for this answer then.
            let _ = send.send(layer);
        });
    if spawned.is_err() {
        return TextLayer::Missing;
    }
    receive.recv_timeout(DEADLINE).unwrap_or(TextLayer::Missing)
}

fn pages(bytes: &[u8]) -> TextLayer {
    let mut document = match Document::load_mem(bytes) {
        Ok(document) => document,
        Err(pdf_extract::Error::Decryption(_)) => return TextLayer::Locked,
        Err(_) => return TextLayer::Missing,
    };
    // An encrypted PDF with an empty user password opens without asking; any other is locked.
    if document.is_encrypted() && document.decrypt("").is_err() {
        return TextLayer::Locked;
    }
    let numbers: Vec<u32> = document.get_pages().into_keys().collect();
    let mut texts = Vec::with_capacity(numbers.len());
    for number in numbers {
        let mut text = String::new();
        let drawn = {
            let mut output = PlainTextOutput::new(&mut text);
            pdf_extract::output_doc_page(&document, &mut output, number).is_ok()
        };
        // A page the library cannot draw reads as empty; the rest of the document still counts.
        texts.push(if drawn { tidy(&text) } else { String::new() });
    }
    TextLayer::Pages(texts)
}

/// Trailing spaces off every line, and no run of blank lines longer than one.
fn tidy(page: &str) -> String {
    let mut lines: Vec<&str> = Vec::new();
    for line in page.lines().map(str::trim_end) {
        if line.is_empty() && lines.last().is_none_or(|last| last.is_empty()) {
            continue;
        }
        lines.push(line);
    }
    while lines.last().is_some_and(|last| last.is_empty()) {
        lines.pop();
    }
    lines.join("\n")
}
