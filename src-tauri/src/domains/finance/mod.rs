//! Orchard on the Rust side (docs/product/domains/finance.md): the Plaid provider (§8, below the reader) and the
//! document reader (D-190). A letter, a statement or a
//! pay stub is read on this device. A PDF's text layer is read straight from the file on every platform; a photo or a
//! scanned PDF is recognised by the platform's own engine (Vision on macOS and iOS, ML Kit's bundled model on
//! Android), and where none exists it reads as `unavailable`. Account, policy and member numbers are masked here, so
//! the webview never holds them whole.
//!
//! The reader makes no network call, writes no file and logs none of the text: a failure is logged by its code only.
use std::collections::HashMap;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::State;

use crate::db::secret_store::SecretStore;
use crate::error::{EdenError, Result};
use crate::substrate::{egress, ids, usage, Workspace};
use plaid::{refused, Env, Keys, Mode, Plaid, Session, Transport};
use provider::{InvestmentsResult, LinkPoll, LinkStart, PlaidStatus, SyncResult};

pub mod plaid;
pub mod provider;

mod mask;
mod pdf_text;

#[cfg(any(target_os = "macos", target_os = "ios"))]
mod recognize_apple;
#[cfg(any(target_os = "macos", target_os = "ios"))]
use recognize_apple as native;

#[cfg(target_os = "android")]
mod recognize_android;
#[cfg(target_os = "android")]
use recognize_android as native;

// The stub is the native module where no recogniser exists, and the tests' stand-in for one everywhere.
#[cfg(any(
    test,
    not(any(target_os = "macos", target_os = "ios", target_os = "android"))
))]
mod recognize_stub;
#[cfg(not(any(target_os = "macos", target_os = "ios", target_os = "android")))]
use recognize_stub as native;

/// The largest PDF read, as `gardener/attachment-limits.ts` holds it.
pub const MAX_PDF_BYTES: usize = 10 * 1024 * 1024;
/// The largest photo read, as `gardener/attachment-limits.ts` holds it.
pub const MAX_IMAGE_BYTES: usize = 20 * 1024 * 1024;
/// The pages of a scanned PDF recognised at most; the read says how many of how many.
pub const MAX_RECOGNIZED_PAGES: u32 = 20;
/// Fewer letters than this in all and the read is `poor`.
pub const MIN_LETTERS: usize = 40;
/// A text layer averaging fewer letters a page than this counts as none, and the pages are recognised instead.
pub const MIN_LETTERS_PER_PAGE: usize = 20;
/// Recognised lines whose confidence, weighted by characters, averages under this make a `poor` read.
pub const MIN_CONFIDENCE: f32 = 0.6;
/// A text layer with more than this share of U+FFFD, control or private-use characters is `poor`.
pub const MAX_BAD_GLYPHS: f32 = 0.02;

/// The header that carries the file's MIME type; the body is its bytes.
const MIME_HEADER: &str = "x-eden-mime";

/// What a read gave: the masked text, or why there is none. A failure is data, never an error.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(
    tag = "outcome",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum DocumentOutcome {
    Read {
        text: String,
        /// How many runs were masked.
        masked: u32,
        source: Source,
        pages: u32,
        pages_read: u32,
        quality: Quality,
    },
    Failed {
        reason: Reason,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Source {
    TextLayer,
    Recognized,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Quality {
    Good,
    Poor,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Reason {
    /// Not a PDF, JPEG, PNG or WebP.
    Unsupported,
    /// Over `MAX_PDF_BYTES` or `MAX_IMAGE_BYTES`.
    TooLarge,
    /// A PDF that needs a password.
    Locked,
    /// Recognition found no characters at all.
    NoText,
    /// No recogniser on this platform.
    Unavailable,
}

impl Reason {
    fn code(self) -> &'static str {
        match self {
            Reason::Unsupported => "unsupported",
            Reason::TooLarge => "too-large",
            Reason::Locked => "locked",
            Reason::NoText => "no-text",
            Reason::Unavailable => "unavailable",
        }
    }
}

/// What a recogniser found: each line with its confidence, a page break as an empty line, and how many pages there
/// were and how many it read.
#[derive(Debug, Clone, Default, PartialEq)]
pub struct Recognized {
    pub lines: Vec<(String, f32)>,
    pub pages: u32,
    pub pages_read: u32,
}

/// A platform's recogniser, passed into `read` so a test can stand another in.
pub(crate) trait Recognizer {
    fn compiled(&self) -> bool;
    fn image(&self, bytes: &[u8]) -> Result<Recognized>;
    fn pdf_pages(&self, bytes: &[u8], max_pages: u32) -> Result<Recognized>;
}

/// This build's recogniser.
struct Native;

impl Recognizer for Native {
    fn compiled(&self) -> bool {
        native::COMPILED
    }
    fn image(&self, bytes: &[u8]) -> Result<Recognized> {
        native::image(bytes)
    }
    fn pdf_pages(&self, bytes: &[u8], max_pages: u32) -> Result<Recognized> {
        native::pdf_pages(bytes, max_pages)
    }
}

/// Whether the current thread is inside the PDF library, for the panic hook: a panic there names no detail.
pub fn reading_a_text_layer() -> bool {
    pdf_text::reading()
}

/// Reads one document given as the request's raw body, its type in the `x-eden-mime` header. It takes no state and
/// no path: the bytes arrive, the masked text leaves, and nothing else is touched.
#[tauri::command]
pub async fn read_document(request: tauri::ipc::Request<'_>) -> Result<DocumentOutcome> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err(EdenError::InvalidOperation(
            "read_document: the body is the file's bytes".into(),
        ));
    };
    let mime = request
        .headers()
        .get(MIME_HEADER)
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default()
        .to_string();
    let bytes = bytes.clone();
    let outcome =
        tauri::async_runtime::spawn_blocking(move || read(&bytes, &mime, &Native)).await?;
    if let DocumentOutcome::Failed { reason } = &outcome {
        log::info!("read_document: {}", reason.code());
    }
    Ok(outcome)
}

enum Kind {
    Pdf,
    Image,
}

impl Kind {
    /// PDF, JPEG, PNG and WebP. HEIC is refused, as on the composer.
    fn of(mime: &str) -> Option<Kind> {
        match mime {
            "application/pdf" => Some(Kind::Pdf),
            "image/jpeg" | "image/png" | "image/webp" => Some(Kind::Image),
            _ => None,
        }
    }

    fn max_bytes(&self) -> usize {
        match self {
            Kind::Pdf => MAX_PDF_BYTES,
            Kind::Image => MAX_IMAGE_BYTES,
        }
    }
}

/// The read itself, on any thread that may block.
pub(crate) fn read(bytes: &[u8], mime: &str, recognizer: &dyn Recognizer) -> DocumentOutcome {
    let Some(kind) = Kind::of(mime) else {
        return failed(Reason::Unsupported);
    };
    if bytes.len() > kind.max_bytes() {
        return failed(Reason::TooLarge);
    }
    match kind {
        Kind::Image => recognize(recognizer, || recognizer.image(bytes)),
        Kind::Pdf => match pdf_text::text_layer(bytes) {
            pdf_text::TextLayer::Locked => failed(Reason::Locked),
            pdf_text::TextLayer::Pages(pages) if usable(&pages) => from_layer(&pages),
            _ => recognize(recognizer, || {
                recognizer.pdf_pages(bytes, MAX_RECOGNIZED_PAGES)
            }),
        },
    }
}

fn failed(reason: Reason) -> DocumentOutcome {
    DocumentOutcome::Failed { reason }
}

fn letters(text: &str) -> usize {
    text.chars().filter(|c| c.is_alphabetic()).count()
}

/// A text layer averaging `MIN_LETTERS_PER_PAGE` letters a page or more.
fn usable(pages: &[String]) -> bool {
    !pages.is_empty()
        && pages.iter().map(|page| letters(page)).sum::<usize>()
            >= MIN_LETTERS_PER_PAGE * pages.len()
}

fn from_layer(pages: &[String]) -> DocumentOutcome {
    let text = pages
        .iter()
        .map(|page| page.trim())
        .filter(|page| !page.is_empty())
        .collect::<Vec<_>>()
        .join("\n\n");
    let poor = letters(&text) < MIN_LETTERS || bad_glyphs(&text) > MAX_BAD_GLYPHS;
    let pages = u32::try_from(pages.len()).unwrap_or(u32::MAX);
    finish(&text, Source::TextLayer, pages, pages, poor)
}

fn recognize(
    recognizer: &dyn Recognizer,
    run: impl FnOnce() -> Result<Recognized>,
) -> DocumentOutcome {
    if !recognizer.compiled() {
        return failed(Reason::Unavailable);
    }
    let Ok(found) = run() else {
        return failed(Reason::NoText);
    };
    let text = found
        .lines
        .iter()
        .map(|(line, _)| line.trim_end())
        .collect::<Vec<_>>()
        .join("\n");
    let text = text.trim();
    if text.is_empty() {
        return failed(Reason::NoText);
    }
    let poor = letters(text) < MIN_LETTERS || confidence(&found.lines) < MIN_CONFIDENCE;
    finish(
        text,
        Source::Recognized,
        found.pages,
        found.pages_read,
        poor,
    )
}

/// Masking runs last, on the joined text.
fn finish(text: &str, source: Source, pages: u32, pages_read: u32, poor: bool) -> DocumentOutcome {
    let (text, masked) = mask::mask(text);
    DocumentOutcome::Read {
        text,
        masked,
        source,
        pages,
        pages_read,
        quality: if poor { Quality::Poor } else { Quality::Good },
    }
}

/// The lines' confidence, weighted by their characters other than spaces; 1 when there are none.
fn confidence(lines: &[(String, f32)]) -> f32 {
    let (weighted, characters) =
        lines
            .iter()
            .fold((0.0_f32, 0_usize), |(sum, count), (line, conf)| {
                let n = line.chars().filter(|c| !c.is_whitespace()).count();
                (sum + conf.clamp(0.0, 1.0) * n as f32, count + n)
            });
    if characters == 0 {
        1.0
    } else {
        weighted / characters as f32
    }
}

/// The share of characters, spaces aside, that are U+FFFD, control or private-use: a font the layer could not map.
fn bad_glyphs(text: &str) -> f32 {
    let (bad, all) = text
        .chars()
        .filter(|c| !c.is_whitespace())
        .fold((0_usize, 0_usize), |(bad, all), c| {
            (bad + usize::from(is_bad_glyph(c)), all + 1)
        });
    if all == 0 {
        0.0
    } else {
        bad as f32 / all as f32
    }
}

fn is_bad_glyph(c: char) -> bool {
    c == char::REPLACEMENT_CHARACTER
        || c.is_control()
        || matches!(u32::from(c), 0xE000..=0xF8FF | 0xF_0000..=0xF_FFFD | 0x10_0000..=0x10_FFFD)
}

#[cfg(any(test, target_os = "macos", target_os = "ios", target_os = "android"))]
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct BridgeAnswer {
    lines: Vec<BridgeLine>,
    pages: u32,
    pages_read: u32,
}

#[cfg(any(test, target_os = "macos", target_os = "ios", target_os = "android"))]
#[derive(Deserialize)]
struct BridgeLine {
    text: String,
    confidence: f32,
    #[serde(default)]
    page: u32,
}

/// The JSON both bridges answer with, `{ "lines": [{ "text", "confidence", "page" }], "pages", "pagesRead" }`, as a
/// `Recognized` with an empty line wherever the page changes.
#[cfg(any(test, target_os = "macos", target_os = "ios", target_os = "android"))]
fn from_bridge(json: &str) -> Result<Recognized> {
    let answer: BridgeAnswer = serde_json::from_str(json)?;
    let mut lines = Vec::with_capacity(answer.lines.len());
    let mut page = answer.lines.first().map_or(0, |line| line.page);
    for line in answer.lines {
        if line.page != page {
            lines.push((String::new(), 1.0));
            page = line.page;
        }
        lines.push((line.text, line.confidence));
    }
    Ok(Recognized {
        lines,
        pages: answer.pages,
        pages_read: answer.pages_read,
    })
}

/// Each request's deadline.
const TIMEOUT: Duration = Duration::from_secs(30);

/// The real transport: `reqwest` over the crate's rustls, every request counted in the egress ledger under `plaid`.
pub struct Http<'a> {
    base: &'static str,
    client: reqwest::Client,
    workspace: &'a Workspace,
}

impl<'a> Http<'a> {
    fn new(env: Env, workspace: &'a Workspace) -> Result<Self> {
        let client = reqwest::Client::builder()
            .timeout(TIMEOUT)
            .https_only(true)
            .build()
            .map_err(|e| network(&e))?;
        Ok(Self {
            base: env.base_url(),
            client,
            workspace,
        })
    }
}

/// A request that got no answer. `without_url` keeps the address out; the keys are in the body, never in an error.
fn network(e: &reqwest::Error) -> crate::error::EdenError {
    let detail = if e.is_timeout() {
        "timed out".to_string()
    } else {
        "no answer".to_string()
    };
    refused("network", detail)
}

impl Transport for Http<'_> {
    async fn post(&self, path: &str, body: Value) -> Result<(u16, Value)> {
        let text = body.to_string();
        let bytes_out = (self.base.len() + path.len() + text.len()) as u64;
        if let Err(e) = self
            .workspace
            .write(|ctx| egress::record(ctx.conn, plaid::DESTINATION, bytes_out))
        {
            log::warn!("The egress ledger did not take a Plaid request: {e}");
        }
        let response = self
            .client
            .post(format!("{}{path}", self.base))
            .header("content-type", "application/json")
            .body(text)
            .send()
            .await
            .map_err(|e| network(&e))?;
        let status = response.status().as_u16();
        let answer = response.json::<Value>().await.unwrap_or(Value::Null);
        if (200..300).contains(&status) && !answer.is_object() {
            return Err(refused("provider-down", "an answer that is not JSON"));
        }
        Ok((status, answer))
    }
}

/// The finished Link sessions of this run, by link token, so a poll after the answer gets the same answer and a
/// public token is never exchanged twice. Held across a poll, so polls run one at a time. It only grows, one small
/// entry per finished session, and is cleared on restart; a few links a year never make that worth pruning.
#[derive(Default)]
pub struct Sessions(tokio::sync::Mutex<HashMap<String, LinkPoll>>);

fn keys(secrets: &dyn SecretStore, env: Env) -> Result<Option<Keys>> {
    let client_id = secrets.get(plaid::CLIENT_ID_SECRET)?;
    let secret = secrets.get(env.secret_name())?;
    Ok(client_id
        .zip(secret)
        .map(|(client_id, secret)| Keys { client_id, secret }))
}

fn client<'a>(workspace: &'a Workspace, secrets: &dyn SecretStore) -> Result<Plaid<Http<'a>>> {
    let env = Env::current();
    let keys =
        keys(secrets, env)?.ok_or_else(|| refused("no-keys", "no Plaid keys on this device"))?;
    Ok(Plaid::new(env, keys, Http::new(env, workspace)?))
}

/// A link's access token. The id must be a link's ULID, so it can only ever name a `plaid-item-` secret.
fn token(secrets: &dyn SecretStore, link_id: &str) -> Result<String> {
    if !ids::is_ulid(link_id) {
        return Err(refused("not-found", "not a link id"));
    }
    secrets
        .get(&plaid::item_secret(link_id))?
        .ok_or_else(|| refused("not-found", "no token for this link on this device"))
}

/// The device's `client_user_id`: random, made on first use, never the owner's name.
fn user_id(secrets: &dyn SecretStore) -> Result<String> {
    if let Some(id) = secrets.get(plaid::USER_ID_SECRET)? {
        return Ok(id);
    }
    let id = ids::new_id().to_ascii_lowercase();
    secrets.set(plaid::USER_ID_SECRET, &id)?;
    Ok(id)
}

#[tauri::command]
pub async fn plaid_status(secrets: State<'_, Box<dyn SecretStore>>) -> Result<PlaidStatus> {
    let env = Env::current();
    Ok(PlaidStatus {
        environment: env.name(),
        has_keys: keys(secrets.inner().as_ref(), env)?.is_some(),
    })
}

/// Stores the keys once Plaid has accepted them: `plaid:invalid-keys` when it refuses them, `plaid:network` when it
/// can't be reached, and nothing is stored either way.
#[tauri::command]
pub async fn plaid_set_keys(
    workspace: State<'_, Workspace>,
    secrets: State<'_, Box<dyn SecretStore>>,
    client_id: String,
    secret: String,
) -> Result<()> {
    let (client_id, secret) = (client_id.trim().to_string(), secret.trim().to_string());
    if client_id.is_empty() || secret.is_empty() {
        return Err(refused("invalid-keys", "both keys are needed"));
    }
    let env = Env::current();
    let trial = Plaid::new(
        env,
        Keys {
            client_id: client_id.clone(),
            secret: secret.clone(),
        },
        Http::new(env, &workspace)?,
    );
    trial.check_keys().await?;
    secrets.set(plaid::CLIENT_ID_SECRET, &client_id)?;
    secrets.set(env.secret_name(), &secret)
}

/// Removes this build's keys from the device. The links' tokens stay: entering keys again brings them back.
#[tauri::command]
pub async fn plaid_clear_keys(secrets: State<'_, Box<dyn SecretStore>>) -> Result<()> {
    secrets.delete(plaid::CLIENT_ID_SECRET)?;
    secrets.delete(Env::current().secret_name())?;
    Ok(())
}

/// A hosted Link session: a new Item (a brokerage's with `brokerage`), or with `link_id` the update mode of that
/// link's own Item.
#[tauri::command]
pub async fn plaid_link_start(
    workspace: State<'_, Workspace>,
    secrets: State<'_, Box<dyn SecretStore>>,
    link_id: Option<String>,
    brokerage: Option<bool>,
) -> Result<LinkStart> {
    let secrets = secrets.inner().as_ref();
    let plaid = client(&workspace, secrets)?;
    let user = user_id(secrets)?;
    match link_id {
        Some(link_id) => {
            let access_token = token(secrets, &link_id)?;
            plaid
                .start_link(
                    &user,
                    &Mode::Update {
                        access_token: &access_token,
                    },
                )
                .await
        }
        None => {
            let mode = Mode::Link {
                brokerage: brokerage.unwrap_or(false),
            };
            plaid.start_link(&user, &mode).await
        }
    }
}

/// Where a session is. A finished new one exchanges its public token here, stores the access token under a new link
/// id and reads the institution, the item and the accounts; the public token never leaves the crate.
#[tauri::command]
pub async fn plaid_link_poll(
    workspace: State<'_, Workspace>,
    secrets: State<'_, Box<dyn SecretStore>>,
    sessions: State<'_, Sessions>,
    link_token: String,
    link_id: Option<String>,
) -> Result<LinkPoll> {
    let mut done = sessions.0.lock().await;
    if let Some(answer) = done.get(&link_token) {
        return Ok(answer.clone());
    }
    let secrets = secrets.inner().as_ref();
    let plaid = client(&workspace, secrets)?;
    let answer = match plaid.poll_link(&link_token, chrono::Utc::now()).await? {
        Session::Waiting => return Ok(LinkPoll::Waiting),
        Session::Expired => LinkPoll::Expired,
        Session::Exited { reason } => LinkPoll::Exited { reason },
        Session::Finished { .. } if link_id.is_some() => LinkPoll::Reconnected,
        Session::Finished {
            public_token: Some(public_token),
        } => LinkPoll::Linked(
            plaid
                .exchange_and_read(secrets, &public_token, &ids::new_id())
                .await?,
        ),
        Session::Finished { public_token: None } => {
            return Err(refused("other", "a finished session with no public token"))
        }
    };
    done.insert(link_token, answer.clone());
    Ok(answer)
}

/// One sync run for one link, from its cursor.
#[tauri::command]
pub async fn plaid_sync(
    workspace: State<'_, Workspace>,
    secrets: State<'_, Box<dyn SecretStore>>,
    link_id: String,
    cursor: Option<String>,
) -> Result<SyncResult> {
    let secrets = secrets.inner().as_ref();
    let plaid = client(&workspace, secrets)?;
    let access_token = token(secrets, &link_id)?;
    plaid.sync(&access_token, cursor, chrono::Utc::now()).await
}

/// The investments read's arguments: a link's ULID and two `YYYY-MM-DD` days, or `plaid:other`.
pub(crate) fn investments_args(link_id: &str, start_day: &str, end_day: &str) -> Result<()> {
    if !ids::is_ulid(link_id) {
        return Err(refused("other", "not a link id"));
    }
    if !usage::is_day(start_day) || !usage::is_day(end_day) {
        return Err(refused("other", "not a day"));
    }
    Ok(())
}

/// One investments read for one link (D-195): holdings, securities with their closing prices, and the investment
/// transactions from `start_day` to `end_day`.
#[tauri::command]
pub async fn plaid_investments(
    workspace: State<'_, Workspace>,
    secrets: State<'_, Box<dyn SecretStore>>,
    link_id: String,
    start_day: String,
    end_day: String,
) -> Result<InvestmentsResult> {
    investments_args(&link_id, &start_day, &end_day)?;
    let secrets = secrets.inner().as_ref();
    let plaid = client(&workspace, secrets)?;
    let access_token = token(secrets, &link_id)?;
    plaid.investments(&access_token, &start_day, &end_day).await
}

/// Removes a tombstoned link's Item at Plaid and its token here. Answers whether there was a token.
#[tauri::command]
pub async fn plaid_revoke(
    workspace: State<'_, Workspace>,
    secrets: State<'_, Box<dyn SecretStore>>,
    link_id: String,
) -> Result<bool> {
    let secrets = secrets.inner().as_ref();
    if !ids::is_ulid(&link_id) || secrets.get(&plaid::item_secret(&link_id))?.is_none() {
        return Ok(false);
    }
    client(&workspace, secrets)?.revoke(secrets, &link_id).await
}

/// Sandbox only: the link asks the owner to sign in again.
#[tauri::command]
pub async fn plaid_sandbox_reset_login(
    workspace: State<'_, Workspace>,
    secrets: State<'_, Box<dyn SecretStore>>,
    link_id: String,
) -> Result<()> {
    let secrets = secrets.inner().as_ref();
    let plaid = client(&workspace, secrets)?;
    plaid.sandbox_reset_login(&token(secrets, &link_id)?).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use pdf_extract::{
        Dictionary, Document, EncryptionState, EncryptionVersion, Object, Permissions, Stream,
    };

    const LETTER_PDF: &[u8] = include_bytes!("fixtures/letter.pdf");
    const LETTER_PNG: &[u8] = include_bytes!("fixtures/letter.png");
    const SCANNED_PDF: &[u8] = include_bytes!("fixtures/scanned.pdf");

    /// The stub as a recogniser: what Windows and Linux have.
    struct Stub;

    impl Recognizer for Stub {
        fn compiled(&self) -> bool {
            recognize_stub::COMPILED
        }
        fn image(&self, bytes: &[u8]) -> Result<Recognized> {
            recognize_stub::image(bytes)
        }
        fn pdf_pages(&self, bytes: &[u8], max_pages: u32) -> Result<Recognized> {
            recognize_stub::pdf_pages(bytes, max_pages)
        }
    }

    /// A recogniser that finds the given lines on any file.
    struct Fake(Recognized);

    impl Recognizer for Fake {
        fn compiled(&self) -> bool {
            true
        }
        fn image(&self, _: &[u8]) -> Result<Recognized> {
            Ok(self.0.clone())
        }
        fn pdf_pages(&self, _: &[u8], max_pages: u32) -> Result<Recognized> {
            let mut found = self.0.clone();
            found.pages_read = found.pages_read.min(max_pages);
            Ok(found)
        }
    }

    fn fake(lines: &[(&str, f32)], pages: u32, pages_read: u32) -> Fake {
        Fake(Recognized {
            lines: lines
                .iter()
                .map(|(text, conf)| ((*text).to_string(), *conf))
                .collect(),
            pages,
            pages_read,
        })
    }

    const WELL_READ: &[(&str, f32)] = &[
        ("Riverside Power and Light", 0.95),
        ("Thank you for being with us this September.", 0.9),
        ("Account number: 1234 5678 7781", 0.9),
    ];

    /// A PDF whose pages draw the given content streams in Courier.
    fn pdf(contents: &[&str]) -> Document {
        let mut document = Document::with_version("1.5");
        let pages_id = document.new_object_id();
        let mut font = Dictionary::new();
        font.set("Type", "Font");
        font.set("Subtype", "Type1");
        font.set("BaseFont", "Courier");
        let font_id = document.add_object(font);
        let mut fonts = Dictionary::new();
        fonts.set("F1", font_id);
        let mut resources = Dictionary::new();
        resources.set("Font", fonts);
        let resources_id = document.add_object(resources);
        let kids: Vec<Object> = contents
            .iter()
            .map(|content| {
                let content_id = document
                    .add_object(Stream::new(Dictionary::new(), content.as_bytes().to_vec()));
                let mut page = Dictionary::new();
                page.set("Type", "Page");
                page.set("Parent", pages_id);
                page.set("Contents", content_id);
                document.add_object(page).into()
            })
            .collect();
        let mut pages = Dictionary::new();
        pages.set("Type", "Pages");
        pages.set("Count", i64::try_from(kids.len()).unwrap());
        pages.set("Kids", kids);
        pages.set("Resources", resources_id);
        pages.set("MediaBox", vec![0.into(), 0.into(), 612.into(), 792.into()]);
        document.objects.insert(pages_id, Object::Dictionary(pages));
        let mut catalog = Dictionary::new();
        catalog.set("Type", "Catalog");
        catalog.set("Pages", pages_id);
        let catalog_id = document.add_object(catalog);
        document.trailer.set("Root", catalog_id);
        document
    }

    fn text(line: &str) -> String {
        format!("BT /F1 12 Tf 72 720 Td ({line}) Tj ET")
    }

    fn bytes(mut document: Document) -> Vec<u8> {
        let mut out = Vec::new();
        document.save_to(&mut out).expect("the PDF saves");
        out
    }

    fn locked_pdf() -> Vec<u8> {
        let mut document = pdf(&[&text(
            "A letter behind a password, with enough words to count as text.",
        )]);
        let id = Object::string_literal(b"0123456789abcdef".to_vec());
        document.trailer.set("ID", vec![id.clone(), id]);
        let state = EncryptionState::try_from(EncryptionVersion::V2 {
            document: &document,
            owner_password: "owner",
            user_password: "user",
            key_length: 128,
            permissions: Permissions::PRINTABLE,
        })
        .expect("an encryption state");
        document.encrypt(&state).expect("the PDF encrypts");
        bytes(document)
    }

    fn read_text(outcome: &DocumentOutcome) -> &str {
        match outcome {
            DocumentOutcome::Read { text, .. } => text,
            other => panic!("expected a read, got {other:?}"),
        }
    }

    fn assert_letter(outcome: &DocumentOutcome, expected: Source) {
        let text = read_text(outcome);
        for word in ["Riverside", "September", "Account"] {
            assert!(text.contains(word), "{word:?} is in the read");
        }
        assert!(text.contains("••••7781"), "the account number is masked");
        assert!(
            !text.contains("5678"),
            "no unmasked digits of the account number remain"
        );
        let DocumentOutcome::Read {
            source,
            masked,
            quality,
            ..
        } = outcome
        else {
            unreachable!()
        };
        assert_eq!(*source, expected);
        assert!(*masked >= 1);
        assert_eq!(*quality, Quality::Good);
    }

    #[test]
    fn reads_a_text_layer_and_masks_it() {
        let outcome = read(LETTER_PDF, "application/pdf", &Native);
        assert_letter(&outcome, Source::TextLayer);
        let DocumentOutcome::Read {
            masked,
            pages,
            pages_read,
            ..
        } = &outcome
        else {
            unreachable!()
        };
        assert_eq!((*masked, *pages, *pages_read), (1, 1, 1));
        assert!(read_text(&outcome).contains("Account number: ••••7781"));
        assert!(
            read_text(&outcome).contains("555-010-4477"),
            "the phone number is left alone"
        );
        let json = serde_json::to_value(&outcome).unwrap();
        assert_eq!(json["outcome"], "read");
        assert_eq!(json["source"], "text-layer");
        assert_eq!(json["pagesRead"], 1);
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn recognizes_a_photo_and_a_scan() {
        assert_letter(&read(LETTER_PNG, "image/png", &Native), Source::Recognized);
        let scan = read(SCANNED_PDF, "application/pdf", &Native);
        assert_letter(&scan, Source::Recognized);
        let DocumentOutcome::Read {
            pages, pages_read, ..
        } = scan
        else {
            unreachable!()
        };
        assert_eq!((pages, pages_read), (1, 1));
    }

    #[test]
    fn no_recognizer_reads_only_text_layers() {
        let unavailable = failed(Reason::Unavailable);
        assert_eq!(read(LETTER_PNG, "image/png", &Stub), unavailable);
        assert_eq!(read(SCANNED_PDF, "application/pdf", &Stub), unavailable);
        assert_letter(
            &read(LETTER_PDF, "application/pdf", &Stub),
            Source::TextLayer,
        );
        let json = serde_json::to_value(&unavailable).unwrap();
        assert_eq!(
            json,
            serde_json::json!({ "outcome": "failed", "reason": "unavailable" })
        );
    }

    #[test]
    fn grades_and_refuses_documents() {
        let quality = |outcome: &DocumentOutcome| match outcome {
            DocumentOutcome::Read { quality, .. } => *quality,
            other => panic!("expected a read, got {other:?}"),
        };
        let png = "image/png";
        let pdf_mime = "application/pdf";

        // Good lines read well; few letters or low confidence read poorly.
        assert_eq!(
            quality(&read(LETTER_PNG, png, &fake(WELL_READ, 1, 1))),
            Quality::Good
        );
        assert_eq!(
            quality(&read(
                LETTER_PNG,
                png,
                &fake(&[("Total 84.20", 0.99)], 1, 1)
            )),
            Quality::Poor
        );
        let unsure: Vec<(&str, f32)> = WELL_READ.iter().map(|(line, _)| (*line, 0.4)).collect();
        assert_eq!(
            quality(&read(LETTER_PNG, png, &fake(&unsure, 1, 1))),
            Quality::Poor
        );

        // A text layer that is mostly U+FFFD reads poorly; a clean one well.
        // The letters stay above `MIN_LETTERS`, so only the glyph rule can make these poor.
        let clean = "Riverside Power and Light, your statement for September is ready.";
        assert_eq!(quality(&from_layer(&[clean.to_string()])), Quality::Good);
        let garbled = format!("{clean} {}", "\u{FFFD}".repeat(120));
        assert_eq!(quality(&from_layer(&[garbled])), Quality::Poor);
        let private = format!("{clean} {}", "\u{E000}".repeat(5));
        assert_eq!(quality(&from_layer(&[private])), Quality::Poor);

        // A sparse text layer falls through to recognition; without a recogniser it is unavailable.
        let sparse = bytes(pdf(&[&text("Page 1"), &text("Page 2")]));
        let outcome = read(&sparse, pdf_mime, &fake(WELL_READ, 2, 2));
        let DocumentOutcome::Read { source, pages, .. } = &outcome else {
            panic!("expected a read, got {outcome:?}")
        };
        assert_eq!((*source, *pages), (Source::Recognized, 2));
        assert_eq!(read(&sparse, pdf_mime, &Stub), failed(Reason::Unavailable));

        // A long scan is cut at the cap and says so.
        let outcome = read(&sparse, pdf_mime, &fake(WELL_READ, 34, 34));
        let DocumentOutcome::Read {
            pages, pages_read, ..
        } = outcome
        else {
            panic!("expected a read")
        };
        assert_eq!((pages, pages_read), (34, MAX_RECOGNIZED_PAGES));

        // Recognition that finds nothing.
        assert_eq!(
            read(LETTER_PNG, png, &fake(&[], 1, 1)),
            failed(Reason::NoText)
        );
        assert_eq!(
            read(LETTER_PNG, png, &fake(&[("  ", 0.9)], 1, 1)),
            failed(Reason::NoText)
        );

        // Wrong types, HEIC among them.
        for mime in ["image/heic", "image/gif", "text/plain", ""] {
            assert_eq!(
                read(LETTER_PNG, mime, &Native),
                failed(Reason::Unsupported),
                "{mime:?}"
            );
        }

        // Over the caps.
        assert_eq!(
            read(&vec![0; MAX_PDF_BYTES + 1], pdf_mime, &Native),
            failed(Reason::TooLarge)
        );
        assert_eq!(
            read(&vec![0; MAX_IMAGE_BYTES + 1], "image/jpeg", &Native),
            failed(Reason::TooLarge)
        );

        // A PDF behind a password.
        assert_eq!(read(&locked_pdf(), pdf_mime, &Stub), failed(Reason::Locked));

        // A PDF the library panics on (`Tj` with a number) is caught and counts as no text layer.
        let panics = bytes(pdf(&["BT /F1 12 Tf 72 720 Td 42 Tj ET"]));
        assert_eq!(pdf_text::text_layer(&panics), pdf_text::TextLayer::Missing);
        assert!(!pdf_text::reading(), "the flag is cleared after a panic");
        assert_eq!(read(&panics, pdf_mime, &Stub), failed(Reason::Unavailable));
        assert_eq!(
            quality(&read(&panics, pdf_mime, &fake(WELL_READ, 1, 1))),
            Quality::Good
        );
    }

    #[test]
    fn a_bridge_answer_breaks_lines_by_page() {
        let found = from_bridge(
            r#"{"lines":[{"text":"one","confidence":0.9,"page":0},{"text":"two","confidence":0.8,"page":1}],"pages":3,"pagesRead":2}"#,
        )
        .unwrap();
        assert_eq!(
            found.lines,
            vec![
                ("one".into(), 0.9),
                (String::new(), 1.0),
                ("two".into(), 0.8)
            ]
        );
        assert_eq!((found.pages, found.pages_read), (3, 2));
    }
}
