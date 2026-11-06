//! A PDF's text layer, through `pdf-extract` over lopdf: pure Rust, so it reads the same on every target. A PDF that
//! needs a password is `Locked`; one the library cannot load, or that makes it panic, has no text layer.

use std::cell::Cell;
use std::panic::{catch_unwind, AssertUnwindSafe};

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

/// The text layer of `bytes`, page by page. Never panics.
pub fn text_layer(bytes: &[u8]) -> TextLayer {
    READING.with(|flag| flag.set(true));
    let layer = catch_unwind(AssertUnwindSafe(|| pages(bytes))).unwrap_or(TextLayer::Missing);
    READING.with(|flag| flag.set(false));
    layer
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
