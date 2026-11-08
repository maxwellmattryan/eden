//! The seam a bank provider answers through (docs/product/domains/finance.md §8): what a Link session is, what a new
//! link reads, and what a sync hands back. Plaid is the one provider; these shapes cross to `@eden/shared` as they
//! are, in camelCase. Amounts are decimal strings as the provider stated them, never a float, and TypeScript turns
//! them into Money; the crate holds no Money type.

use serde::{Deserialize, Serialize};

/// Where a Link session is, as the webview polls it.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "state", rename_all = "camelCase")]
pub enum LinkPoll {
    /// The owner is still on the provider's page.
    Waiting,
    /// The owner left the provider's flow; the reason is the provider's code, when it gave one.
    Exited { reason: Option<String> },
    /// A new link: its token is on this device under the link's id.
    Linked(NewLink),
    /// A stale link signed in again: the same item, the same row.
    Reconnected,
    /// The session's page expired before it finished.
    Expired,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NewLink {
    pub link_id: String,
    pub item_id: String,
    pub institution: Institution,
    pub consent_expires_at: Option<String>,
    pub accounts: Vec<ProviderAccount>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Institution {
    pub id: String,
    pub name: String,
    /// `#RRGGBB`.
    pub colour: Option<String>,
    /// A `data:image/png;base64,…` URL.
    pub logo: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderAccount {
    pub provider_account_id: String,
    pub name: String,
    pub mask: Option<String>,
    /// The provider's type (`depository`, `credit`, …); TypeScript maps it to an account kind.
    pub kind: String,
    pub subtype: Option<String>,
    /// ISO 4217, or nothing when the provider gave only an unofficial code.
    pub currency: Option<String>,
    pub current: Option<String>,
    pub available: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderTransaction {
    pub id: String,
    pub provider_account_id: String,
    /// As the provider states it: positive is money out of the account.
    pub amount: String,
    pub currency: Option<String>,
    /// `YYYY-MM-DD`.
    pub date: String,
    pub authorized_date: Option<String>,
    pub datetime: Option<String>,
    pub name: String,
    pub merchant_name: Option<String>,
    pub pending: bool,
    pub pending_transaction_id: Option<String>,
    pub category: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncResult {
    /// `ok`, or `needs-reauth` when the item wants the owner to sign in again (then nothing else is read).
    pub status: String,
    pub consent_expires_at: Option<String>,
    pub accounts: Vec<ProviderAccount>,
    pub added: Vec<ProviderTransaction>,
    pub modified: Vec<ProviderTransaction>,
    pub removed: Vec<String>,
    pub cursor: String,
}

/// One holding as the provider lists it: what an account holds of one security. Every number is a decimal string.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderHolding {
    pub provider_account_id: String,
    pub security_id: String,
    pub quantity: String,
    pub institution_price: Option<String>,
    /// `YYYY-MM-DD`.
    pub institution_price_as_of: Option<String>,
    pub institution_value: Option<String>,
    /// The total paid, not per share.
    pub cost_basis: Option<String>,
    /// ISO 4217, or nothing when the provider gave only an unofficial code.
    pub currency: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderSecurity {
    pub security_id: String,
    pub name: String,
    pub ticker: Option<String>,
    /// The provider's type (`equity`, `etf`, `mutual fund`, …); TypeScript maps it to a security type.
    pub kind: Option<String>,
    pub currency: Option<String>,
    pub close_price: Option<String>,
    /// `YYYY-MM-DD`.
    pub close_price_as_of: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderInvestmentTransaction {
    pub id: String,
    pub provider_account_id: String,
    pub security_id: Option<String>,
    /// `YYYY-MM-DD`.
    pub date: String,
    pub name: String,
    pub quantity: Option<String>,
    /// As the provider states it: positive is money out of the account.
    pub amount: String,
    pub price: Option<String>,
    /// The provider's type (`buy`, `sell`, `cash`, `fee`, `transfer`, `cancel`).
    pub kind: String,
    pub subtype: Option<String>,
    pub currency: Option<String>,
}

/// One investments read: the holdings, the securities with their closing prices, and the investment transactions.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InvestmentsResult {
    /// `ok`, or `none` when the item has no investments to read.
    pub status: String,
    pub accounts: Vec<ProviderAccount>,
    pub holdings: Vec<ProviderHolding>,
    pub securities: Vec<ProviderSecurity>,
    pub transactions: Vec<ProviderInvestmentTransaction>,
}

/// What a new Link session hands the webview: the token it polls with and the page to open.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkStart {
    pub link_token: String,
    pub url: String,
    pub expires_at: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaidStatus {
    /// `sandbox` or `production`, from the build.
    pub environment: &'static str,
    pub has_keys: bool,
}
