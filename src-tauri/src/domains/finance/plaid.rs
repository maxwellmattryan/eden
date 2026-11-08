//! The Plaid client (docs/product/domains/finance.md §8). Every call is a JSON `POST` with the device's client id and
//! secret in the body, over a `Transport`: `reqwest` in the app, a scripted fake in the tests. Only free calls are
//! made (D-183): never `/accounts/balance/get` and never a paid refresh. The products asked for are read-only (D-8).
//!
//! A failure is `EdenError::Refused("plaid:<code>: <Plaid's error code>")`, with the code one of `needs-reauth`,
//! `invalid-keys`, `rate-limited`, `institution-down`, `provider-down`, `network`, `other`, `no-keys`, `not-found` and
//! `production`. Logs carry the code and Plaid's `request_id`, never a body, a name, an amount or a token.

use std::future::Future;

use chrono::{DateTime, Utc};
use serde_json::{json, Value};

use super::provider::{
    Institution, InvestmentsResult, LinkStart, NewLink, ProviderAccount, ProviderHolding,
    ProviderInvestmentTransaction, ProviderSecurity, ProviderTransaction, SyncResult,
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
/// The codes that say the Item has no such product to read: an investments-only Item asked for transactions, or an
/// Item with no investment account asked for holdings. Neither is a failure.
const NOT_OFFERED: &[&str] = &[
    "PRODUCTS_NOT_SUPPORTED",
    "ADDITIONAL_CONSENT_REQUIRED",
    "INVALID_PRODUCT",
    "NO_ACCOUNTS",
    "NO_INVESTMENT_ACCOUNTS",
];
/// Investment transactions per `/investments/transactions/get` page, Plaid's most.
const INVESTMENT_PAGE: u64 = 500;
/// The most pages one read takes: 20,000 investment transactions.
const INVESTMENT_PAGES: u64 = 40;

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

/// What a link token is made for: a new Item (a bank, or a brokerage that may offer no transactions), or the update
/// mode of a link's own Item.
pub enum Mode<'a> {
    Link { brokerage: bool },
    Update { access_token: &'a str },
}

/// The `/link/token/create` body, without the keys (AC1): read products only, 24 months of history, Hosted Link with
/// the hand-back page. A brokerage asks for investments and takes transactions only where the institution has them,
/// so an investments-only institution can link (D-195). Update mode carries the link's own access token and no
/// products, so Plaid keeps the same Item.
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
        Mode::Link { brokerage: false } => {
            body["products"] = json!(["transactions"]);
            body["additional_consented_products"] = json!(["liabilities", "investments"]);
            body["transactions"] = json!({ "days_requested": DAYS_REQUESTED });
        }
        Mode::Link { brokerage: true } => {
            body["products"] = json!(["investments"]);
            body["required_if_supported_products"] = json!(["transactions"]);
            body["additional_consented_products"] = json!(["liabilities"]);
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

fn holding(value: &Value) -> ProviderHolding {
    ProviderHolding {
        provider_account_id: text(&value["account_id"]).unwrap_or_default(),
        security_id: text(&value["security_id"]).unwrap_or_default(),
        quantity: decimal(&value["quantity"]).unwrap_or_default(),
        institution_price: decimal(&value["institution_price"]),
        institution_price_as_of: text(&value["institution_price_as_of"]),
        institution_value: decimal(&value["institution_value"]),
        cost_basis: decimal(&value["cost_basis"]),
        currency: text(&value["iso_currency_code"]),
    }
}

fn security(value: &Value) -> ProviderSecurity {
    ProviderSecurity {
        security_id: text(&value["security_id"]).unwrap_or_default(),
        name: text(&value["name"]).unwrap_or_default(),
        ticker: text(&value["ticker_symbol"]),
        kind: text(&value["type"]),
        currency: text(&value["iso_currency_code"]),
        close_price: decimal(&value["close_price"]),
        close_price_as_of: text(&value["close_price_as_of"]),
    }
}

fn investment_transaction(value: &Value) -> ProviderInvestmentTransaction {
    ProviderInvestmentTransaction {
        id: text(&value["investment_transaction_id"]).unwrap_or_default(),
        provider_account_id: text(&value["account_id"]).unwrap_or_default(),
        security_id: text(&value["security_id"]),
        date: text(&value["date"]).unwrap_or_default(),
        name: text(&value["name"]).unwrap_or_default(),
        quantity: decimal(&value["quantity"]),
        amount: decimal(&value["amount"]).unwrap_or_default(),
        price: decimal(&value["price"]),
        kind: text(&value["type"]).unwrap_or_default(),
        subtype: text(&value["subtype"]),
        currency: text(&value["iso_currency_code"]),
    }
}

fn list<T>(answer: &Value, key: &str, read: impl Fn(&Value) -> T) -> Vec<T> {
    answer[key]
        .as_array()
        .map(|items| items.iter().map(read).collect())
        .unwrap_or_default()
}

/// Adds the securities of one answer to those already read, keeping the first of each `security_id`.
fn merge_securities(into: &mut Vec<ProviderSecurity>, answer: &Value) {
    for found in list(answer, "securities", security) {
        if !into.iter().any(|s| s.security_id == found.security_id) {
            into.push(found);
        }
    }
}

fn accounts(answer: &Value) -> Vec<ProviderAccount> {
    answer["accounts"]
        .as_array()
        .map(|list| list.iter().map(account).collect())
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
                    // An Item without the Transactions product: the accounts are the whole read (D-195).
                    Err(failure) if NOT_OFFERED.contains(&failure.error_code.as_str()) => {
                        return Ok(SyncResult {
                            status: "ok".to_string(),
                            consent_expires_at,
                            accounts: accounts(&read),
                            added: Vec::new(),
                            modified: Vec::new(),
                            removed: Vec::new(),
                            cursor: cursor.unwrap_or_default(),
                        });
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
            return Ok(SyncResult {
                status: "ok".to_string(),
                consent_expires_at,
                accounts: accounts(&read),
                added,
                modified,
                removed,
                cursor: next.unwrap_or_default(),
            });
        }
    }

    /// One investments read for one link (D-195): the holdings with their securities, then the investment
    /// transactions from `start` to `end` (`YYYY-MM-DD`, inclusive), `INVESTMENT_PAGE` at a time by offset, at most
    /// `INVESTMENT_PAGES` pages. The securities of both calls are merged by `security_id`. An Item with no investments
    /// answers `none` with nothing in it; an Item whose transactions aren't offered keeps its holdings. Only free calls:
    /// never `/investments/refresh` (D-183).
    pub async fn investments(
        &self,
        access_token: &str,
        start: &str,
        end: &str,
    ) -> Result<InvestmentsResult> {
        let held = match self
            .raw(
                "/investments/holdings/get",
                json!({ "access_token": access_token }),
            )
            .await?
        {
            Ok(answer) => answer,
            Err(failure) if NOT_OFFERED.contains(&failure.error_code.as_str()) => {
                return Ok(InvestmentsResult {
                    status: "none".to_string(),
                    accounts: Vec::new(),
                    holdings: Vec::new(),
                    securities: Vec::new(),
                    transactions: Vec::new(),
                });
            }
            Err(failure) => return Err(failure.into_error()),
        };
        let mut securities = Vec::new();
        merge_securities(&mut securities, &held);
        let mut transactions = Vec::new();
        for page in 0..INVESTMENT_PAGES {
            let body = json!({
                "access_token": access_token,
                "start_date": start,
                "end_date": end,
                "options": { "count": INVESTMENT_PAGE, "offset": page * INVESTMENT_PAGE },
            });
            let answer = match self.raw("/investments/transactions/get", body).await? {
                Ok(answer) => answer,
                Err(failure) if NOT_OFFERED.contains(&failure.error_code.as_str()) => break,
                Err(failure) => return Err(failure.into_error()),
            };
            merge_securities(&mut securities, &answer);
            let read = list(&answer, "investment_transactions", investment_transaction);
            let empty = read.is_empty();
            transactions.extend(read);
            let total = answer["total_investment_transactions"]
                .as_u64()
                .unwrap_or(0);
            if empty || transactions.len() as u64 >= total {
                break;
            }
        }
        Ok(InvestmentsResult {
            status: "ok".to_string(),
            accounts: accounts(&held),
            holdings: list(&held, "holdings", holding),
            securities,
            transactions,
        })
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
            "link_token_get_finished" => include_str!("fixtures/link_token_get_finished.json"),
            "link_token_get_exited" => include_str!("fixtures/link_token_get_exited.json"),
            "link_token_get_open" => include_str!("fixtures/link_token_get_open.json"),
            "investments_holdings_get" => include_str!("fixtures/investments_holdings_get.json"),
            "investments_transactions_get_1" => {
                include_str!("fixtures/investments_transactions_get_1.json")
            }
            "investments_transactions_get_2" => {
                include_str!("fixtures/investments_transactions_get_2.json")
            }
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
        let body = link_token_request("device-1", &Mode::Link { brokerage: false });
        assert!(body.get("required_if_supported_products").is_none());
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

    #[test]
    fn a_brokerage_link_token_asks_for_investments() {
        let body = link_token_request("device-1", &Mode::Link { brokerage: true });
        assert_eq!(body["products"], json!(["investments"]));
        assert_eq!(
            body["required_if_supported_products"],
            json!(["transactions"])
        );
        assert_eq!(
            body["additional_consented_products"],
            json!(["liabilities"])
        );
        assert_eq!(body["transactions"]["days_requested"], json!(730));
        assert_eq!(
            body["hosted_link"]["completion_redirect_uri"],
            json!("https://eden.palekodama.studio/plaid/oauth")
        );
        assert!(body.get("access_token").is_none());
        let text = body.to_string();
        for never in ["\"auth\"", "\"transfer\"", "\"identity\"", "\"signal\""] {
            assert!(!text.contains(never), "{never} is never asked for");
        }
    }

    #[tokio::test]
    async fn sync_without_the_transactions_product_reads_accounts() {
        for code in [
            "PRODUCTS_NOT_SUPPORTED",
            "ADDITIONAL_CONSENT_REQUIRED",
            "INVALID_PRODUCT",
            "NO_ACCOUNTS",
        ] {
            let script = Script::new(vec![
                ("/item/get", 200, fixture("item_get")),
                ("/accounts/get", 200, fixture("accounts_get")),
                ("/transactions/sync", 400, error("ITEM_ERROR", code)),
            ]);
            let result = plaid(Env::Sandbox, &script)
                .sync("access-sandbox-1", Some("c7".to_string()), now())
                .await
                .unwrap();
            assert_eq!(result.status, "ok", "{code}");
            assert_eq!(result.accounts.len(), 2, "{code}");
            assert!(result.added.is_empty() && result.modified.is_empty());
            assert!(result.removed.is_empty());
            assert_eq!(result.cursor, "c7", "{code}");
        }
        // Without a cursor yet, the cursor stays empty.
        let script = Script::new(vec![
            ("/item/get", 200, fixture("item_get")),
            ("/accounts/get", 200, fixture("accounts_get")),
            (
                "/transactions/sync",
                400,
                error("INVALID_INPUT", "INVALID_PRODUCT"),
            ),
        ]);
        let result = plaid(Env::Sandbox, &script)
            .sync("access-sandbox-1", None, now())
            .await
            .unwrap();
        assert_eq!(result.cursor, "");
        // Any other refusal is still a failure.
        let script = Script::new(vec![
            ("/item/get", 200, fixture("item_get")),
            ("/accounts/get", 200, fixture("accounts_get")),
            (
                "/transactions/sync",
                400,
                error("INVALID_REQUEST", "MISSING_FIELDS"),
            ),
        ]);
        let failed = plaid(Env::Sandbox, &script)
            .sync("access-sandbox-1", None, now())
            .await
            .unwrap_err();
        assert_eq!(code_of(failed), "other");
    }

    #[tokio::test]
    async fn investments_read_holdings_and_page_transactions() {
        let script = Script::new(vec![
            (
                "/investments/holdings/get",
                200,
                fixture("investments_holdings_get"),
            ),
            (
                "/investments/transactions/get",
                200,
                fixture("investments_transactions_get_1"),
            ),
            (
                "/investments/transactions/get",
                200,
                fixture("investments_transactions_get_2"),
            ),
        ]);
        let result = plaid(Env::Sandbox, &script)
            .investments("access-sandbox-1", "2024-11-06", "2026-11-06")
            .await
            .unwrap();
        assert_eq!(result.status, "ok");
        assert_eq!(result.accounts.len(), 1);
        assert_eq!(result.accounts[0].kind, "investment");
        assert_eq!(result.holdings.len(), 3);
        let vti = &result.holdings[0];
        assert_eq!(vti.provider_account_id, "acc-brokerage");
        assert_eq!(vti.security_id, "sec-vti");
        assert_eq!(vti.quantity, "21.4");
        assert_eq!(vti.institution_price.as_deref(), Some("286"));
        assert_eq!(vti.institution_price_as_of.as_deref(), Some("2026-11-05"));
        assert_eq!(vti.institution_value.as_deref(), Some("6120.35"));
        assert_eq!(vti.cost_basis.as_deref(), Some("5210"));
        assert_eq!(vti.currency.as_deref(), Some("USD"));
        assert_eq!(result.holdings[1].cost_basis, None);
        assert_eq!(result.holdings[2].quantity, "1110.09");

        // The securities of both calls, merged by id, the first of each kept.
        let ids: Vec<_> = result
            .securities
            .iter()
            .map(|s| s.security_id.as_str())
            .collect();
        assert_eq!(ids, ["sec-vti", "sec-schd", "sec-cash", "sec-gone"]);
        assert_eq!(result.securities[0].ticker.as_deref(), Some("VTI"));
        assert_eq!(result.securities[0].kind.as_deref(), Some("etf"));
        assert_eq!(result.securities[0].close_price.as_deref(), Some("286"));
        assert_eq!(result.securities[3].ticker, None);
        assert_eq!(result.securities[3].kind.as_deref(), Some("mutual fund"));
        assert_eq!(
            result.securities[3].close_price.as_deref(),
            Some("0.12345678")
        );

        let ids: Vec<_> = result.transactions.iter().map(|t| t.id.as_str()).collect();
        assert_eq!(ids, ["inv-t1", "inv-t2", "inv-t3"]);
        let buy = &result.transactions[0];
        assert_eq!(buy.amount, "572");
        assert_eq!(buy.kind, "buy");
        assert_eq!(buy.subtype.as_deref(), Some("buy"));
        assert_eq!(buy.quantity.as_deref(), Some("2"));
        assert_eq!(buy.security_id.as_deref(), Some("sec-vti"));
        assert_eq!(result.transactions[1].amount, "-18.42");
        assert_eq!(result.transactions[2].price.as_deref(), Some("12.345"));
        assert_eq!(result.transactions[2].quantity.as_deref(), Some("-100"));

        // Pages by offset, 500 at a time, over the asked window; no paid refresh.
        let sent = script.sent();
        let pages: Vec<_> = sent
            .iter()
            .filter(|(path, _)| path == "/investments/transactions/get")
            .map(|(_, body)| body.clone())
            .collect();
        assert_eq!(pages.len(), 2);
        assert_eq!(pages[0]["options"], json!({ "count": 500, "offset": 0 }));
        assert_eq!(pages[1]["options"], json!({ "count": 500, "offset": 500 }));
        assert_eq!(pages[0]["start_date"], json!("2024-11-06"));
        assert_eq!(pages[0]["end_date"], json!("2026-11-06"));
        assert!(sent.iter().all(|(path, _)| path != "/investments/refresh"));

        // A total that never arrives stops at 40 pages.
        let mut endless = fixture("investments_transactions_get_1");
        endless["total_investment_transactions"] = json!(1_000_000);
        let mut replies = vec![(
            "/investments/holdings/get",
            200,
            fixture("investments_holdings_get"),
        )];
        for _ in 0..40 {
            replies.push(("/investments/transactions/get", 200, endless.clone()));
        }
        let script = Script::new(replies);
        let result = plaid(Env::Sandbox, &script)
            .investments("access-sandbox-1", "2026-10-07", "2026-11-06")
            .await
            .unwrap();
        assert_eq!(result.transactions.len(), 80);
        assert_eq!(script.sent().len(), 41);
    }

    #[tokio::test]
    async fn investments_not_offered_answer_none() {
        for code in [
            "PRODUCTS_NOT_SUPPORTED",
            "NO_INVESTMENT_ACCOUNTS",
            "ADDITIONAL_CONSENT_REQUIRED",
            "INVALID_PRODUCT",
        ] {
            let script = Script::new(vec![(
                "/investments/holdings/get",
                400,
                error("ITEM_ERROR", code),
            )]);
            let result = plaid(Env::Sandbox, &script)
                .investments("access-sandbox-1", "2024-11-06", "2026-11-06")
                .await
                .unwrap();
            assert_eq!(result.status, "none", "{code}");
            assert!(result.accounts.is_empty() && result.holdings.is_empty());
            assert!(result.securities.is_empty() && result.transactions.is_empty());

            // The same code on the transactions call keeps the holdings.
            let script = Script::new(vec![
                (
                    "/investments/holdings/get",
                    200,
                    fixture("investments_holdings_get"),
                ),
                (
                    "/investments/transactions/get",
                    400,
                    error("ITEM_ERROR", code),
                ),
            ]);
            let result = plaid(Env::Sandbox, &script)
                .investments("access-sandbox-1", "2024-11-06", "2026-11-06")
                .await
                .unwrap();
            assert_eq!(result.status, "ok", "{code}");
            assert_eq!(result.holdings.len(), 3);
            assert_eq!(result.securities.len(), 3);
            assert!(result.transactions.is_empty());
        }

        // A sign-in wanted is a refusal, not an empty read.
        let script = Script::new(vec![(
            "/investments/holdings/get",
            400,
            error("ITEM_ERROR", "ITEM_LOGIN_REQUIRED"),
        )]);
        let failed = plaid(Env::Sandbox, &script)
            .investments("access-sandbox-1", "2024-11-06", "2026-11-06")
            .await
            .unwrap_err();
        assert_eq!(code_of(failed), "needs-reauth");

        // The command's arguments: a link's ULID and two days.
        assert!(super::super::investments_args(
            "01JC8Z4Q5W6E7R8T9Y0A1B2C3D",
            "2024-11-06",
            "2026-11-06"
        )
        .is_ok());
        for (link, start, end) in [
            ("../plaid-client-id", "2024-11-06", "2026-11-06"),
            ("01JC8Z4Q5W6E7R8T9Y0A1B2C3D", "2024-11-6", "2026-11-06"),
            ("01JC8Z4Q5W6E7R8T9Y0A1B2C3D", "2024-11-06", "2026-13-06"),
            ("01JC8Z4Q5W6E7R8T9Y0A1B2C3D", "2024-11-06", "today"),
        ] {
            let refused = super::super::investments_args(link, start, end).unwrap_err();
            assert_eq!(code_of(refused), "other", "{link} {start} {end}");
        }
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
