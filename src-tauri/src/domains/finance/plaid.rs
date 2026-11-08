//! The Plaid client (docs/product/domains/finance.md §8). Every call is a JSON `POST` with the device's client id and
//! secret in the body, over a `Transport`: `reqwest` in the app, a scripted fake in the tests. Only free calls are
//! made (D-183): never `/accounts/balance/get` and never a paid refresh. The products asked for are read-only (D-8).
//! The one exception is `/liabilities/get`, asked once a run and only of an item with a credit account, for its cards'
//! statements (#78): in production its first call starts that item's Liabilities billing (D-194).
//!
//! A failure is `EdenError::Refused("plaid:<code>: <Plaid's error code>")`, with the code one of `needs-reauth`,
//! `invalid-keys`, `rate-limited`, `institution-down`, `provider-down`, `network`, `other`, `no-keys`, `not-found` and
//! `production`. Logs carry the code and Plaid's `request_id`, never a body, a name, an amount or a token.

use std::future::Future;

use chrono::{DateTime, Utc};
use serde_json::{json, Value};

use super::provider::{
    CardStatement, Institution, LinkStart, NewLink, ProviderAccount, ProviderTransaction,
    SyncResult,
};
use crate::db::secret_store::SecretStore;
use crate::error::{EdenError, Result};

/// The egress ledger's destination for every request.
pub const DESTINATION: &str = "plaid";
/// The `redirect_uri` registered with Plaid: the static hand-back page, and the Universal Link the phone claims (#89).
pub const PLAID_REDIRECT_URI: &str = "https://eden.palekodama.studio/plaid/oauth";
pub const SANDBOX_URL: &str = "https://sandbox.plaid.com";
pub const PRODUCTION_URL: &str = "https://production.plaid.com";

pub const CLIENT_ID_SECRET: &str = "plaid-client-id";
pub const SANDBOX_SECRET: &str = "plaid-secret-sandbox";
pub const PRODUCTION_SECRET: &str = "plaid-secret-production";
/// The device's own `client_user_id`, made on first use.
pub const USER_ID_SECRET: &str = "plaid-user-id";

/// Transactions per `/transactions/sync` page, Plaid's most.
const PAGE: u32 = 500;
/// The history asked for on every link (D-187).
const DAYS_REQUESTED: u32 = 730;
/// The most restarts from the first cursor when the data moved under the pages.
const RESTARTS: u32 = 3;
/// How long a hosted Link page lives: the 30 minutes the sheet waits.
const URL_LIFESPAN_SECONDS: u32 = 1800;

const NEEDS_REAUTH: &[&str] = &[
    "ITEM_LOGIN_REQUIRED",
    "PENDING_DISCONNECT",
    "PENDING_EXPIRATION",
    "INVALID_ACCESS_TOKEN",
];
const MUTATION: &str = "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION";

/// The secret that holds a link's access token.
pub fn item_secret(link_id: &str) -> String {
    format!("plaid-item-{}", link_id.to_ascii_lowercase())
}

pub fn refused(code: &str, detail: impl std::fmt::Display) -> EdenError {
    EdenError::Refused(format!("plaid:{code}: {detail}"))
}

/// Plaid's environment, which follows the build and nothing else: production in a production build, Sandbox in every
/// other.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Env {
    Sandbox,
    Production,
}

impl Env {
    pub fn of(build: &str) -> Self {
        if build == "production" {
            Env::Production
        } else {
            Env::Sandbox
        }
    }

    pub fn current() -> Self {
        Self::of(crate::commands::app::environment())
    }

    pub fn base_url(self) -> &'static str {
        match self {
            Env::Sandbox => SANDBOX_URL,
            Env::Production => PRODUCTION_URL,
        }
    }

    pub fn name(self) -> &'static str {
        match self {
            Env::Sandbox => "sandbox",
            Env::Production => "production",
        }
    }

    /// The secret store's name for this environment's secret.
    pub fn secret_name(self) -> &'static str {
        match self {
            Env::Sandbox => SANDBOX_SECRET,
            Env::Production => PRODUCTION_SECRET,
        }
    }
}

/// One request to Plaid: the path, the JSON body, and the status with the JSON answer. A request that never got an
/// answer is `plaid:network`.
pub trait Transport: Send + Sync {
    fn post(&self, path: &str, body: Value) -> impl Future<Output = Result<(u16, Value)>> + Send;
}

/// What a link token is made for: a new Item, or the update mode of a link's own Item.
pub enum Mode<'a> {
    Link,
    Update { access_token: &'a str },
}

/// The `/link/token/create` body, without the keys (AC1): read products only, 24 months of history, Hosted Link with
/// the hand-back page. Update mode carries the link's own access token and no products, so Plaid keeps the same Item.
pub fn link_token_request(user_id: &str, mode: &Mode<'_>) -> Value {
    let mut body = json!({
        "client_name": "Eden",
        "language": "en",
        "country_codes": ["US"],
        "user": { "client_user_id": user_id },
        "hosted_link": {
            "completion_redirect_uri": PLAID_REDIRECT_URI,
            "url_lifespan_seconds": URL_LIFESPAN_SECONDS,
        },
    });
    match mode {
        Mode::Link => {
            body["products"] = json!(["transactions"]);
            body["additional_consented_products"] = json!(["liabilities", "investments"]);
            body["transactions"] = json!({ "days_requested": DAYS_REQUESTED });
        }
        Mode::Update { access_token } => body["access_token"] = json!(access_token),
    }
    body
}

/// Plaid's error, by its type and code, as one of the codes the webview reads.
pub fn classify(status: u16, body: &Value) -> &'static str {
    let code = body["error_code"].as_str().unwrap_or_default();
    let kind = body["error_type"].as_str().unwrap_or_default();
    if NEEDS_REAUTH.contains(&code) {
        return "needs-reauth";
    }
    match code {
        "INVALID_API_KEYS" | "UNAUTHORIZED_ENVIRONMENT" => return "invalid-keys",
        "ITEM_NOT_FOUND" => return "not-found",
        "INSTITUTION_DOWN" | "INSTITUTION_NOT_RESPONDING" | "INSTITUTION_NOT_AVAILABLE" => {
            return "institution-down"
        }
        _ => {}
    }
    match kind {
        "RATE_LIMIT_EXCEEDED" => "rate-limited",
        "INSTITUTION_ERROR" => "institution-down",
        "API_ERROR" => "provider-down",
        _ if status == 429 => "rate-limited",
        _ if status >= 500 => "provider-down",
        _ => "other",
    }
}

/// A non-2xx answer, read.
#[derive(Debug)]
struct Failure {
    code: &'static str,
    error_code: String,
}

impl Failure {
    fn into_error(self) -> EdenError {
        refused(self.code, self.error_code)
    }
}

/// A Hosted Link session as `/link/token/get` reports it.
#[derive(Debug, PartialEq)]
pub enum Session {
    Waiting,
    Exited {
        reason: Option<String>,
    },
    /// Finished: a new Item's public token, or none in update mode.
    Finished {
        public_token: Option<String>,
    },
    Expired,
}

/// The device's Plaid keys.
pub struct Keys {
    pub client_id: String,
    pub secret: String,
}

pub struct Plaid<T> {
    env: Env,
    keys: Keys,
    transport: T,
}

/// A decimal as Plaid stated it: `12.3` stays `"12.3"`. Rust prints an `f64` in its shortest exact form and never
/// with an exponent.
pub fn decimal(value: &Value) -> Option<String> {
    value.as_f64().map(|number| format!("{number}"))
}

fn text(value: &Value) -> Option<String> {
    value.as_str().map(str::to_string)
}

fn account(value: &Value) -> ProviderAccount {
    let balances = &value["balances"];
    ProviderAccount {
        provider_account_id: text(&value["account_id"]).unwrap_or_default(),
        name: text(&value["name"]).unwrap_or_default(),
        mask: text(&value["mask"]),
        kind: text(&value["type"]).unwrap_or_default(),
        subtype: text(&value["subtype"]),
        currency: text(&balances["iso_currency_code"]),
        current: decimal(&balances["current"]),
        available: decimal(&balances["available"]),
    }
}

fn transaction(value: &Value) -> ProviderTransaction {
    ProviderTransaction {
        id: text(&value["transaction_id"]).unwrap_or_default(),
        provider_account_id: text(&value["account_id"]).unwrap_or_default(),
        amount: decimal(&value["amount"]).unwrap_or_default(),
        currency: text(&value["iso_currency_code"]),
        date: text(&value["date"]).unwrap_or_default(),
        authorized_date: text(&value["authorized_date"]),
        datetime: text(&value["datetime"]),
        name: text(&value["name"]).unwrap_or_default(),
        merchant_name: text(&value["merchant_name"]),
        pending: value["pending"].as_bool().unwrap_or(false),
        pending_transaction_id: text(&value["pending_transaction_id"]),
        category: text(&value["personal_finance_category"]["detailed"]),
    }
}

fn accounts(answer: &Value) -> Vec<ProviderAccount> {
    answer["accounts"]
        .as_array()
        .map(|list| list.iter().map(account).collect())
        .unwrap_or_default()
}

/// The credit cards' statements in a `/liabilities/get` answer, each in its account's currency.
fn card_statements(answer: &Value, accounts: &[ProviderAccount]) -> Vec<CardStatement> {
    answer["liabilities"]["credit"]
        .as_array()
        .map(|list| {
            list.iter()
                .filter_map(|card| {
                    let id = text(&card["account_id"])?;
                    let currency = accounts
                        .iter()
                        .find(|account| account.provider_account_id == id)
                        .and_then(|account| account.currency.clone());
                    Some(CardStatement {
                        provider_account_id: id,
                        statement_balance: decimal(&card["last_statement_balance"]),
                        minimum: decimal(&card["minimum_payment_amount"]),
                        due_date: text(&card["next_payment_due_date"]),
                        statement_date: text(&card["last_statement_issue_date"]),
                        currency,
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

/// Whether the item wants the owner to sign in again: its error says so, or its consent has ended.
fn item_needs_reauth(item: &Value, now: DateTime<Utc>) -> bool {
    let error = item["error"]["error_code"].as_str().unwrap_or_default();
    let ended = item["consent_expiration_time"]
        .as_str()
        .and_then(|at| DateTime::parse_from_rfc3339(at).ok())
        .is_some_and(|at| at <= now);
    NEEDS_REAUTH.contains(&error) || ended
}

impl<T: Transport> Plaid<T> {
    pub fn new(env: Env, keys: Keys, transport: T) -> Self {
        Self {
            env,
            keys,
            transport,
        }
    }

    /// One call, with the keys added; a non-2xx answer is a `Failure`, logged by its code and request id.
    async fn raw(
        &self,
        path: &str,
        mut body: Value,
    ) -> Result<std::result::Result<Value, Failure>> {
        body["client_id"] = json!(self.keys.client_id);
        body["secret"] = json!(self.keys.secret);
        let (status, answer) = self.transport.post(path, body).await?;
        if (200..300).contains(&status) {
            return Ok(Ok(answer));
        }
        let code = classify(status, &answer);
        let error_code = answer["error_code"]
            .as_str()
            .map(str::to_string)
            .unwrap_or_else(|| format!("HTTP {status}"));
        log::warn!(
            "Plaid {path} failed: {code} {error_code}, request {}",
            answer["request_id"].as_str().unwrap_or("-")
        );
        Ok(Err(Failure { code, error_code }))
    }

    async fn call(&self, path: &str, body: Value) -> Result<Value> {
        self.raw(path, body).await?.map_err(Failure::into_error)
    }

    /// Tries the keys (`/institutions/get`, one row): `plaid:invalid-keys` when Plaid refuses them.
    pub async fn check_keys(&self) -> Result<()> {
        self.call(
            "/institutions/get",
            json!({ "count": 1, "offset": 0, "country_codes": ["US"] }),
        )
        .await
        .map(|_| ())
    }

    /// A link token and its hosted page.
    pub async fn start_link(&self, user_id: &str, mode: &Mode<'_>) -> Result<LinkStart> {
        let answer = self
            .call("/link/token/create", link_token_request(user_id, mode))
            .await?;
        let (Some(link_token), Some(url)) = (
            text(&answer["link_token"]),
            text(&answer["hosted_link_url"]),
        ) else {
            return Err(refused("other", "no hosted link in the answer"));
        };
        Ok(LinkStart {
            link_token,
            url,
            expires_at: text(&answer["expiration"]),
        })
    }

    /// Where the session of a link token is: a success wins, then a session still open, then an exit.
    pub async fn poll_link(&self, link_token: &str, now: DateTime<Utc>) -> Result<Session> {
        let answer = self
            .call("/link/token/get", json!({ "link_token": link_token }))
            .await?;
        let empty = Vec::new();
        let sessions = answer["link_sessions"].as_array().unwrap_or(&empty);
        let exited = |session: &Value| {
            [&session["exit"], &session["on_exit"]]
                .into_iter()
                .find(|exit| exit.is_object())
                .cloned()
        };
        for session in sessions {
            let token = session["results"]["item_add_results"]
                .as_array()
                .and_then(|results| results.iter().find_map(|r| text(&r["public_token"])))
                .or_else(|| text(&session["on_success"]["public_token"]));
            if let Some(public_token) = token {
                return Ok(Session::Finished {
                    public_token: Some(public_token),
                });
            }
        }
        let open = sessions
            .iter()
            .any(|session| session["finished_at"].is_null() && exited(session).is_none());
        if sessions.is_empty() || open {
            let expired = text(&answer["expiration"])
                .and_then(|at| DateTime::parse_from_rfc3339(&at).ok())
                .is_some_and(|at| at <= now);
            return Ok(if expired {
                Session::Expired
            } else {
                Session::Waiting
            });
        }
        if let Some(exit) = sessions.iter().find_map(exited) {
            return Ok(Session::Exited {
                reason: text(&exit["error"]["error_code"]),
            });
        }
        Ok(Session::Finished { public_token: None })
    }

    /// A finished session's public token for the Item's access token, which goes into the secret store under the new
    /// link's id at once; then the item, its institution with the logo, and the accounts are read. If a read fails the
    /// Item is removed again, so no Item is left without a link.
    pub async fn exchange_and_read(
        &self,
        secrets: &dyn SecretStore,
        public_token: &str,
        link_id: &str,
    ) -> Result<NewLink> {
        let exchanged = self
            .call(
                "/item/public_token/exchange",
                json!({ "public_token": public_token }),
            )
            .await?;
        let Some(access_token) = text(&exchanged["access_token"]) else {
            return Err(refused("other", "no access token in the answer"));
        };
        if let Err(e) = secrets.set(&item_secret(link_id), &access_token) {
            // no token stored means no later revoke could find it: remove the Item with the token in hand
            let removed = self
                .raw("/item/remove", json!({ "access_token": access_token }))
                .await;
            if !matches!(removed, Ok(Ok(_))) {
                log::warn!(
                    "Plaid: a new Item whose token could not be stored could not be removed"
                );
            }
            return Err(e);
        }
        match self.read_link(&access_token, link_id).await {
            Ok(link) => Ok(link),
            Err(e) => {
                if self.revoke(secrets, link_id).await.is_err() {
                    log::warn!("Plaid: a new Item whose reads failed could not be removed");
                }
                Err(e)
            }
        }
    }

    async fn read_link(&self, access_token: &str, link_id: &str) -> Result<NewLink> {
        let got = self
            .call("/item/get", json!({ "access_token": access_token }))
            .await?;
        let item = &got["item"];
        let institution_id = text(&item["institution_id"]).unwrap_or_default();
        let institution = if institution_id.is_empty() {
            Institution {
                id: String::new(),
                name: text(&item["institution_name"]).unwrap_or_default(),
                colour: None,
                logo: None,
            }
        } else {
            let answer = self
                .call(
                    "/institutions/get_by_id",
                    json!({
                        "institution_id": institution_id,
                        "country_codes": ["US"],
                        "options": { "include_optional_metadata": true },
                    }),
                )
                .await?;
            let found = &answer["institution"];
            Institution {
                id: institution_id,
                name: text(&found["name"]).unwrap_or_default(),
                colour: text(&found["primary_color"]),
                logo: text(&found["logo"]).map(|logo| format!("data:image/png;base64,{logo}")),
            }
        };
        let read = self
            .call("/accounts/get", json!({ "access_token": access_token }))
            .await?;
        Ok(NewLink {
            link_id: link_id.to_string(),
            item_id: text(&item["item_id"]).unwrap_or_default(),
            institution,
            consent_expires_at: text(&item["consent_expiration_time"]),
            accounts: accounts(&read),
        })
    }

    /// One run for one link: the item's status and consent, the accounts with their cached balances, and every
    /// transaction since the cursor, page by page. When the data moves under the pages the run starts again from its
    /// first cursor, at most `RESTARTS` times. An item that wants the owner to sign in again answers `needs-reauth`
    /// and reads nothing more.
    pub async fn sync(
        &self,
        access_token: &str,
        cursor: Option<String>,
        now: DateTime<Utc>,
    ) -> Result<SyncResult> {
        let got = self
            .call("/item/get", json!({ "access_token": access_token }))
            .await?;
        let consent_expires_at = text(&got["item"]["consent_expiration_time"]);
        if item_needs_reauth(&got["item"], now) {
            return Ok(SyncResult {
                status: "needs-reauth".to_string(),
                consent_expires_at,
                accounts: Vec::new(),
                added: Vec::new(),
                modified: Vec::new(),
                removed: Vec::new(),
                cursor: cursor.unwrap_or_default(),
                statements: Vec::new(),
            });
        }
        let read = self
            .call("/accounts/get", json!({ "access_token": access_token }))
            .await?;

        let mut restarts = 0;
        'run: loop {
            let mut added = Vec::new();
            let mut modified = Vec::new();
            let mut removed = Vec::new();
            let mut next = cursor.clone();
            loop {
                let mut body = json!({ "access_token": access_token, "count": PAGE });
                if let Some(at) = next.as_ref().filter(|at| !at.is_empty()) {
                    body["cursor"] = json!(at);
                }
                let page = match self.raw("/transactions/sync", body).await? {
                    Ok(page) => page,
                    Err(failure) if failure.error_code == MUTATION && restarts < RESTARTS => {
                        restarts += 1;
                        continue 'run;
                    }
                    Err(failure) => return Err(failure.into_error()),
                };
                let list = |key: &str| page[key].as_array().cloned().unwrap_or_default();
                added.extend(list("added").iter().map(transaction));
                modified.extend(list("modified").iter().map(transaction));
                removed.extend(
                    list("removed")
                        .iter()
                        .filter_map(|r| text(&r["transaction_id"])),
                );
                next = text(&page["next_cursor"]);
                if !page["has_more"].as_bool().unwrap_or(false) {
                    break;
                }
            }
            let accounts = accounts(&read);
            let statements = self.statements(access_token, &accounts).await;
            return Ok(SyncResult {
                status: "ok".to_string(),
                consent_expires_at,
                accounts,
                added,
                modified,
                removed,
                cursor: next.unwrap_or_default(),
                statements,
            });
        }
    }

    /// Each credit card's latest statement, from `/liabilities/get`, once, and only for an item with a credit account
    /// (in production the first call starts the item's Liabilities billing). Whatever goes wrong (a product the item
    /// lacks, a consent it never gave, a 500, no answer) leaves the statements out and never fails the run; it is
    /// logged by its code alone.
    async fn statements(
        &self,
        access_token: &str,
        accounts: &[ProviderAccount],
    ) -> Vec<CardStatement> {
        if !accounts.iter().any(|account| account.kind == "credit") {
            return Vec::new();
        }
        match self
            .raw("/liabilities/get", json!({ "access_token": access_token }))
            .await
        {
            Ok(Ok(answer)) => card_statements(&answer, accounts),
            // `raw` logged the code
            Ok(Err(_)) => Vec::new(),
            Err(_) => {
                log::warn!("Plaid /liabilities/get failed: network");
                Vec::new()
            }
        }
    }

    /// Removes the link's Item at Plaid, then its token from the device. `ITEM_NOT_FOUND` counts as done; any other
    /// failure keeps the token for the next run. Answers whether there was a token.
    pub async fn revoke(&self, secrets: &dyn SecretStore, link_id: &str) -> Result<bool> {
        let name = item_secret(link_id);
        let Some(access_token) = secrets.get(&name)? else {
            return Ok(false);
        };
        match self
            .raw("/item/remove", json!({ "access_token": access_token }))
            .await?
        {
            Ok(_) => {}
            Err(failure) if failure.code == "not-found" => {}
            Err(failure) => return Err(failure.into_error()),
        }
        secrets.delete(&name)?;
        Ok(true)
    }

    /// Sandbox only: makes the Item ask the owner to sign in again, which proves the reconnect path.
    pub async fn sandbox_reset_login(&self, access_token: &str) -> Result<()> {
        if self.env == Env::Production {
            return Err(refused(
                "production",
                "reset_login is a Sandbox call; this is a production build",
            ));
        }
        self.call(
            "/sandbox/item/reset_login",
            json!({ "access_token": access_token }),
        )
        .await
        .map(|_| ())
    }
}

#[cfg(test)]
mod tests {
    use std::collections::{HashMap, VecDeque};
    use std::sync::Mutex;

    use super::*;

    /// A fake Plaid: answers each request in turn from its script, and keeps what it was sent. Status 0 is a request
    /// that never got an answer.
    #[derive(Default)]
    struct Script {
        replies: Mutex<VecDeque<(&'static str, u16, Value)>>,
        sent: Mutex<Vec<(String, Value)>>,
    }

    impl Script {
        fn new(replies: Vec<(&'static str, u16, Value)>) -> Self {
            Self {
                replies: Mutex::new(replies.into()),
                sent: Mutex::default(),
            }
        }

        fn sent(&self) -> Vec<(String, Value)> {
            self.sent.lock().unwrap().clone()
        }
    }

    impl Transport for &Script {
        async fn post(&self, path: &str, body: Value) -> Result<(u16, Value)> {
            self.sent.lock().unwrap().push((path.to_string(), body));
            let (expected, status, answer) = self
                .replies
                .lock()
                .unwrap()
                .pop_front()
                .expect("a scripted reply");
            assert_eq!(path, expected, "the next request");
            if status == 0 {
                return Err(refused("network", "offline"));
            }
            Ok((status, answer))
        }
    }

    fn fixture(name: &str) -> Value {
        let text = match name {
            "item_get" => include_str!("fixtures/item_get.json"),
            "accounts_get" => include_str!("fixtures/accounts_get.json"),
            "sync_page_1" => include_str!("fixtures/sync_page_1.json"),
            "sync_page_2" => include_str!("fixtures/sync_page_2.json"),
            "liabilities_get" => include_str!("fixtures/liabilities_get.json"),
            "link_token_get_finished" => include_str!("fixtures/link_token_get_finished.json"),
            "link_token_get_exited" => include_str!("fixtures/link_token_get_exited.json"),
            "link_token_get_open" => include_str!("fixtures/link_token_get_open.json"),
            other => panic!("no fixture {other}"),
        };
        serde_json::from_str(text).expect("a JSON fixture")
    }

    fn error(error_type: &str, error_code: &str) -> Value {
        json!({ "error_type": error_type, "error_code": error_code, "error_message": "…", "request_id": "req-1" })
    }

    fn plaid(env: Env, script: &Script) -> Plaid<&Script> {
        Plaid::new(
            env,
            Keys {
                client_id: "client".to_string(),
                secret: "shh".to_string(),
            },
            script,
        )
    }

    fn code_of(error: EdenError) -> String {
        let message = error.to_string();
        message
            .strip_prefix("plaid:")
            .and_then(|rest| rest.split(':').next())
            .unwrap_or(&message)
            .to_string()
    }

    fn now() -> DateTime<Utc> {
        DateTime::parse_from_rfc3339("2026-11-06T12:00:00Z")
            .unwrap()
            .with_timezone(&Utc)
    }

    /// The device's secrets, in memory.
    #[derive(Default)]
    struct Memory(Mutex<HashMap<String, String>>);

    impl SecretStore for Memory {
        fn get(&self, name: &str) -> Result<Option<String>> {
            Ok(self.0.lock().unwrap().get(name).cloned())
        }
        fn set(&self, name: &str, value: &str) -> Result<()> {
            self.0
                .lock()
                .unwrap()
                .insert(name.to_string(), value.to_string());
            Ok(())
        }
        fn delete(&self, name: &str) -> Result<bool> {
            Ok(self.0.lock().unwrap().remove(name).is_some())
        }
    }

    /// A store that refuses every write, as a locked keychain does.
    struct Locked;

    impl SecretStore for Locked {
        fn get(&self, _: &str) -> Result<Option<String>> {
            Ok(None)
        }
        fn set(&self, _: &str, _: &str) -> Result<()> {
            Err(EdenError::Refused("locked".into()))
        }
        fn delete(&self, _: &str) -> Result<bool> {
            Ok(false)
        }
    }

    #[test]
    fn a_link_token_asks_for_read_products_and_24_months() {
        let body = link_token_request("device-1", &Mode::Link);
        assert_eq!(body["products"], json!(["transactions"]));
        assert_eq!(
            body["additional_consented_products"],
            json!(["liabilities", "investments"])
        );
        assert_eq!(body["transactions"]["days_requested"], json!(730));
        assert_eq!(body["country_codes"], json!(["US"]));
        assert_eq!(body["user"]["client_user_id"], json!("device-1"));
        assert_eq!(
            body["hosted_link"]["completion_redirect_uri"],
            json!("https://eden.palekodama.studio/plaid/oauth")
        );
        assert!(body.get("redirect_uri").is_none());
        assert!(body.get("access_token").is_none());
        let text = body.to_string();
        for never in ["\"auth\"", "\"transfer\"", "\"identity\"", "\"signal\""] {
            assert!(!text.contains(never), "{never} is never asked for");
        }

        let update = link_token_request(
            "device-1",
            &Mode::Update {
                access_token: "access-sandbox-1",
            },
        );
        assert_eq!(update["access_token"], json!("access-sandbox-1"));
        assert!(update.get("products").is_none());
        assert!(update.get("additional_consented_products").is_none());
        assert!(update["hosted_link"].is_object());

        assert_eq!(
            Env::of("development").base_url(),
            "https://sandbox.plaid.com"
        );
        assert_eq!(Env::of("staging").base_url(), "https://sandbox.plaid.com");
        assert_eq!(
            Env::of("production").base_url(),
            "https://production.plaid.com"
        );
        assert_eq!(Env::of("staging").secret_name(), "plaid-secret-sandbox");
        assert_eq!(
            Env::of("production").secret_name(),
            "plaid-secret-production"
        );
    }

    #[tokio::test]
    async fn sync_pages_until_done_and_restarts_on_mutation() {
        let script = Script::new(vec![
            ("/item/get", 200, fixture("item_get")),
            ("/accounts/get", 200, fixture("accounts_get")),
            ("/transactions/sync", 200, fixture("sync_page_1")),
            (
                "/transactions/sync",
                400,
                error("TRANSACTIONS_ERROR", MUTATION),
            ),
            ("/transactions/sync", 200, fixture("sync_page_1")),
            ("/transactions/sync", 200, fixture("sync_page_2")),
            // the item has a credit account: its statements follow the pages (#78)
            ("/liabilities/get", 200, fixture("liabilities_get")),
        ]);
        let result = plaid(Env::Sandbox, &script)
            .sync("access-sandbox-1", Some("c0".to_string()), now())
            .await
            .unwrap();
        assert_eq!(result.status, "ok");
        assert_eq!(result.cursor, "c2");
        assert_eq!(
            result.consent_expires_at.as_deref(),
            Some("2027-05-01T00:00:00Z")
        );
        assert_eq!(result.accounts.len(), 2);
        assert_eq!(result.accounts[0].currency.as_deref(), Some("USD"));
        assert_eq!(result.accounts[0].current.as_deref(), Some("1204.5"));
        // The pages of the restarted run only, never the first try's.
        let ids =
            |list: &[ProviderTransaction]| list.iter().map(|t| t.id.clone()).collect::<Vec<_>>();
        assert_eq!(ids(&result.added), ["t1", "t2", "t3"]);
        assert_eq!(ids(&result.modified), ["t0"]);
        assert_eq!(result.removed, ["t-old"]);
        assert_eq!(
            result.added[2].pending_transaction_id.as_deref(),
            Some("t1")
        );
        assert_eq!(
            result.added[0].category.as_deref(),
            Some("FOOD_AND_DRINK_COFFEE")
        );

        let sent = script.sent();
        let cursors: Vec<Value> = sent
            .iter()
            .filter(|(path, _)| path == "/transactions/sync")
            .map(|(_, body)| body["cursor"].clone())
            .collect();
        assert_eq!(
            cursors,
            [json!("c0"), json!("c1"), json!("c0"), json!("c1")]
        );
        assert!(sent.iter().all(|(_, body)| body["client_id"] == "client"));
        assert!(sent.iter().all(|(path, _)| path != "/accounts/balance/get"));

        // A fourth mutation in one run is a failure.
        let mut replies = vec![
            ("/item/get", 200, fixture("item_get")),
            ("/accounts/get", 200, fixture("accounts_get")),
        ];
        for _ in 0..4 {
            replies.push((
                "/transactions/sync",
                400,
                error("TRANSACTIONS_ERROR", MUTATION),
            ));
        }
        let script = Script::new(replies);
        let failed = plaid(Env::Sandbox, &script)
            .sync("access-sandbox-1", None, now())
            .await
            .unwrap_err();
        assert_eq!(code_of(failed), "other");

        // An item that wants a sign-in reads nothing more.
        let mut item = fixture("item_get");
        item["item"]["error"] = error("ITEM_ERROR", "ITEM_LOGIN_REQUIRED");
        let script = Script::new(vec![("/item/get", 200, item)]);
        let result = plaid(Env::Sandbox, &script)
            .sync("access-sandbox-1", Some("c0".to_string()), now())
            .await
            .unwrap();
        assert_eq!(result.status, "needs-reauth");
        assert_eq!(result.cursor, "c0");
        assert!(result.added.is_empty());
        assert!(result.statements.is_empty());
    }

    #[tokio::test]
    async fn sync_reads_card_statements_for_credit_items() {
        let script = Script::new(vec![
            ("/item/get", 200, fixture("item_get")),
            ("/accounts/get", 200, fixture("accounts_get")),
            ("/transactions/sync", 200, fixture("sync_page_2")),
            ("/liabilities/get", 200, fixture("liabilities_get")),
        ]);
        let result = plaid(Env::Sandbox, &script)
            .sync("access-sandbox-1", Some("c1".to_string()), now())
            .await
            .unwrap();
        assert_eq!(
            result.statements,
            [CardStatement {
                provider_account_id: "acc-credit".to_string(),
                statement_balance: Some("1204.18".to_string()),
                minimum: Some("35".to_string()),
                due_date: Some("2026-10-12".to_string()),
                statement_date: Some("2026-09-14".to_string()),
                currency: Some("USD".to_string()),
            }]
        );
        let sent = script.sent();
        let liabilities: Vec<_> = sent
            .iter()
            .filter(|(path, _)| path == "/liabilities/get")
            .collect();
        assert_eq!(liabilities.len(), 1, "asked once a run");
        assert_eq!(liabilities[0].1["access_token"], json!("access-sandbox-1"));
        assert_eq!(liabilities[0].1["client_id"], json!("client"));

        // an item with no credit account is never asked
        let mut depository = fixture("accounts_get");
        depository["accounts"]
            .as_array_mut()
            .unwrap()
            .retain(|account| account["type"] != "credit");
        let script = Script::new(vec![
            ("/item/get", 200, fixture("item_get")),
            ("/accounts/get", 200, depository),
            ("/transactions/sync", 200, fixture("sync_page_2")),
        ]);
        let result = plaid(Env::Sandbox, &script)
            .sync("access-sandbox-1", Some("c1".to_string()), now())
            .await
            .unwrap();
        assert!(result.statements.is_empty());
        assert!(script
            .sent()
            .iter()
            .all(|(path, _)| path != "/liabilities/get"));
    }

    #[tokio::test]
    async fn sync_goes_on_when_liabilities_fail() {
        for (status, answer) in [
            (400, error("INVALID_PRODUCT", "PRODUCTS_NOT_SUPPORTED")),
            (400, error("ITEM_ERROR", "ADDITIONAL_CONSENT_REQUIRED")),
            (500, error("API_ERROR", "INTERNAL_SERVER_ERROR")),
            (0, json!({})),
        ] {
            let script = Script::new(vec![
                ("/item/get", 200, fixture("item_get")),
                ("/accounts/get", 200, fixture("accounts_get")),
                ("/transactions/sync", 200, fixture("sync_page_2")),
                ("/liabilities/get", status, answer),
            ]);
            let result = plaid(Env::Sandbox, &script)
                .sync("access-sandbox-1", Some("c1".to_string()), now())
                .await
                .unwrap();
            assert_eq!(result.status, "ok", "{status}");
            assert!(result.statements.is_empty(), "{status}");
            assert_eq!(result.cursor, "c2", "{status}");
            assert!(
                !result.added.is_empty()
                    || !result.modified.is_empty()
                    || !result.removed.is_empty()
            );
        }
    }

    #[test]
    fn plaid_errors_map_to_codes() {
        let cases = [
            (
                400,
                error("ITEM_ERROR", "ITEM_LOGIN_REQUIRED"),
                "needs-reauth",
            ),
            (
                400,
                error("ITEM_ERROR", "PENDING_DISCONNECT"),
                "needs-reauth",
            ),
            (
                400,
                error("ITEM_ERROR", "PENDING_EXPIRATION"),
                "needs-reauth",
            ),
            (
                400,
                error("INVALID_INPUT", "INVALID_ACCESS_TOKEN"),
                "needs-reauth",
            ),
            (
                400,
                error("INVALID_INPUT", "INVALID_API_KEYS"),
                "invalid-keys",
            ),
            (
                400,
                error("INVALID_INPUT", "UNAUTHORIZED_ENVIRONMENT"),
                "invalid-keys",
            ),
            (
                429,
                error("RATE_LIMIT_EXCEEDED", "RATE_LIMIT"),
                "rate-limited",
            ),
            (429, Value::Null, "rate-limited"),
            (
                400,
                error("INSTITUTION_ERROR", "INSTITUTION_DOWN"),
                "institution-down",
            ),
            (
                400,
                error("INSTITUTION_ERROR", "INSTITUTION_NOT_RESPONDING"),
                "institution-down",
            ),
            (
                500,
                error("API_ERROR", "INTERNAL_SERVER_ERROR"),
                "provider-down",
            ),
            (503, Value::Null, "provider-down"),
            (400, error("ITEM_ERROR", "ITEM_NOT_FOUND"), "not-found"),
            (400, error("INVALID_REQUEST", "MISSING_FIELDS"), "other"),
            (400, error("TRANSACTIONS_ERROR", MUTATION), "other"),
        ];
        for (status, body, code) in cases {
            assert_eq!(classify(status, &body), code, "{status} {body}");
        }
    }

    #[tokio::test]
    async fn a_request_that_never_got_an_answer_is_network() {
        let script = Script::new(vec![("/institutions/get", 0, Value::Null)]);
        let failed = plaid(Env::Sandbox, &script).check_keys().await.unwrap_err();
        assert_eq!(code_of(failed), "network");
        let script = Script::new(vec![(
            "/institutions/get",
            400,
            error("INVALID_INPUT", "INVALID_API_KEYS"),
        )]);
        let failed = plaid(Env::Sandbox, &script).check_keys().await.unwrap_err();
        // No refusal carries what the request held.
        assert!(!failed.to_string().contains("shh"));
        assert_eq!(code_of(failed), "invalid-keys");
    }

    #[test]
    fn amounts_cross_as_exact_decimals() {
        for (json, text) in [
            ("12.3", "12.3"),
            ("-0.05", "-0.05"),
            ("84000", "84000"),
            ("4217", "4217"),
            ("0.1", "0.1"),
            ("1234567.89", "1234567.89"),
            ("-12.34", "-12.34"),
        ] {
            let value: Value = serde_json::from_str(json).unwrap();
            assert_eq!(decimal(&value).as_deref(), Some(text), "{json}");
        }
        assert_eq!(decimal(&Value::Null), None);
        let crossed =
            transaction(&json!({ "transaction_id": "t", "amount": 12.3, "date": "2026-11-01" }));
        assert_eq!(crossed.amount, "12.3");
    }

    #[tokio::test]
    async fn a_finished_session_yields_its_public_token() {
        let poll = |name: &'static str| async move {
            let script = Script::new(vec![("/link/token/get", 200, fixture(name))]);
            plaid(Env::Sandbox, &script)
                .poll_link("link-sandbox-1", now())
                .await
                .unwrap()
        };
        assert_eq!(
            poll("link_token_get_finished").await,
            Session::Finished {
                public_token: Some(
                    "public-sandbox-5c224a01-8314-4491-a06f-39e193d5cddc".to_string()
                )
            }
        );
        assert_eq!(
            poll("link_token_get_exited").await,
            Session::Exited {
                reason: Some("INSTITUTION_NOT_RESPONDING".to_string())
            }
        );
        assert_eq!(poll("link_token_get_open").await, Session::Waiting);

        // An open session past its expiration has expired; a finished one in update mode has no public token.
        let mut late = fixture("link_token_get_open");
        late["expiration"] = json!("2026-11-06T11:00:00Z");
        let script = Script::new(vec![("/link/token/get", 200, late)]);
        assert_eq!(
            plaid(Env::Sandbox, &script)
                .poll_link("link-sandbox-1", now())
                .await
                .unwrap(),
            Session::Expired
        );
        let mut update = fixture("link_token_get_open");
        update["link_sessions"][0]["finished_at"] = json!("2026-11-06T11:59:00Z");
        let script = Script::new(vec![("/link/token/get", 200, update)]);
        assert_eq!(
            plaid(Env::Sandbox, &script)
                .poll_link("link-sandbox-1", now())
                .await
                .unwrap(),
            Session::Finished { public_token: None }
        );

        // The exchange stores the token under the link at once, then reads the institution with its logo.
        let script = Script::new(vec![
            (
                "/item/public_token/exchange",
                200,
                json!({ "access_token": "access-sandbox-9", "item_id": "item-1", "request_id": "r" }),
            ),
            ("/item/get", 200, fixture("item_get")),
            (
                "/institutions/get_by_id",
                200,
                json!({ "institution": { "institution_id": "ins_56", "name": "Chase", "primary_color": "#117ACA", "logo": "iVBORw0KGgo=" } }),
            ),
            ("/accounts/get", 200, fixture("accounts_get")),
        ]);
        let secrets = Memory::default();
        let link = plaid(Env::Sandbox, &script)
            .exchange_and_read(
                &secrets,
                "public-sandbox-5c22",
                "01JC8Z4Q5W6E7R8T9Y0A1B2C3D",
            )
            .await
            .unwrap();
        assert_eq!(
            secrets
                .get("plaid-item-01jc8z4q5w6e7r8t9y0a1b2c3d")
                .unwrap()
                .as_deref(),
            Some("access-sandbox-9")
        );
        assert_eq!(link.item_id, "item-1");
        assert_eq!(link.institution.name, "Chase");
        assert_eq!(link.institution.colour.as_deref(), Some("#117ACA"));
        assert_eq!(
            link.institution.logo.as_deref(),
            Some("data:image/png;base64,iVBORw0KGgo=")
        );
        assert_eq!(link.accounts.len(), 2);
        assert_eq!(link.accounts[1].mask.as_deref(), Some("4417"));
        let sent = script.sent();
        assert_eq!(
            sent[2].1["options"]["include_optional_metadata"],
            json!(true)
        );

        // A token that can't be stored: the Item is removed at once with it, and nothing is read.
        let script = Script::new(vec![
            (
                "/item/public_token/exchange",
                200,
                json!({ "access_token": "access-sandbox-7", "item_id": "item-2", "request_id": "r" }),
            ),
            ("/item/remove", 200, json!({ "request_id": "r" })),
        ]);
        assert!(plaid(Env::Sandbox, &script)
            .exchange_and_read(&Locked, "public-sandbox-5c23", "01JC8Z4Q5W6E7R8T9Y0A1B2C3E")
            .await
            .is_err());
        let sent = script.sent();
        assert_eq!(sent.len(), 2);
        assert_eq!(sent[1].0, "/item/remove");
        assert_eq!(sent[1].1["access_token"], "access-sandbox-7");
    }

    #[tokio::test]
    async fn revoke_removes_the_item_then_the_token() {
        let link = "01JC8Z4Q5W6E7R8T9Y0A1B2C3D";
        let name = item_secret(link);
        let secrets = Memory::default();

        // Plaid can't be reached: the token stays for the next run.
        secrets.set(&name, "access-sandbox-1").unwrap();
        let script = Script::new(vec![("/item/remove", 0, Value::Null)]);
        let failed = plaid(Env::Sandbox, &script)
            .revoke(&secrets, link)
            .await
            .unwrap_err();
        assert_eq!(code_of(failed), "network");
        assert!(secrets.get(&name).unwrap().is_some());

        // Removed at Plaid, then here.
        let script = Script::new(vec![("/item/remove", 200, json!({ "request_id": "r" }))]);
        assert!(plaid(Env::Sandbox, &script)
            .revoke(&secrets, link)
            .await
            .unwrap());
        assert_eq!(script.sent()[0].1["access_token"], "access-sandbox-1");
        assert!(secrets.get(&name).unwrap().is_none());

        // Gone at Plaid already counts as done; no token is nothing to do.
        secrets.set(&name, "access-sandbox-1").unwrap();
        let script = Script::new(vec![(
            "/item/remove",
            400,
            error("ITEM_ERROR", "ITEM_NOT_FOUND"),
        )]);
        assert!(plaid(Env::Sandbox, &script)
            .revoke(&secrets, link)
            .await
            .unwrap());
        assert!(secrets.get(&name).unwrap().is_none());
        let script = Script::new(vec![]);
        assert!(!plaid(Env::Sandbox, &script)
            .revoke(&secrets, link)
            .await
            .unwrap());

        // The Sandbox reset is refused in a production build, before any request.
        let script = Script::new(vec![]);
        let failed = plaid(Env::Production, &script)
            .sandbox_reset_login("access-production-1")
            .await
            .unwrap_err();
        assert_eq!(code_of(failed), "production");
        let script = Script::new(vec![("/sandbox/item/reset_login", 200, json!({}))]);
        plaid(Env::Sandbox, &script)
            .sandbox_reset_login("access-sandbox-1")
            .await
            .unwrap();
    }
}
