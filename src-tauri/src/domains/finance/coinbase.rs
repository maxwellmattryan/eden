//! The Coinbase client (docs/product/domains/finance.md §8, D-204). One read-only CDP API key per device: an ECDSA
//! P-256 key whose name and private key are T3 in the secret store. Every signed request carries a fresh ES256 JWT
//! for its method and path; the price feed is public and carries none. The key is refused unless Coinbase reports
//! that it can view and can neither trade nor transfer (D-8). Nothing here can move money.
//!
//! A failure is `EdenError::Refused("coinbase:<code>: <detail>")`, with the code one of `invalid-key`, `refused`,
//! `not-read-only`, `needs-reauth`, `rate-limited`, `provider-down`, `network`, `no-key` and `other`. Coinbase's
//! error bodies are never logged; only the code is.

use std::sync::LazyLock;

use base64::engine::general_purpose::{STANDARD, URL_SAFE_NO_PAD};
use base64::Engine;
use p256::ecdsa::signature::Signer;
use p256::ecdsa::{Signature, SigningKey};
use p256::pkcs8::DecodePrivateKey;
use regex::Regex;
use serde::Serialize;
use serde_json::{json, Value};

use super::fetch::Fetch;
use crate::db::secret_store::SecretStore;
use crate::error::{EdenError, Result};

/// The egress ledger's destination for every request.
pub const DESTINATION: &str = "coinbase";
pub const BASE: &str = "https://api.coinbase.com";
/// The host the JWT's `uri` names.
const HOST: &str = "api.coinbase.com";
pub const KEY_NAME_SECRET: &str = "coinbase-key-name";
pub const KEY_SECRET: &str = "coinbase-key-secret";

/// Wallets per `/v2/accounts` page, Coinbase's most.
const PAGE: u32 = 100;
/// The most pages one read takes: 1,000 wallets.
const PAGES: u32 = 10;
/// The most coins one price read asks for.
const MAX_CODES: usize = 50;
/// How long a request's JWT lives, in seconds: Coinbase's two minutes.
const JWT_LIFESPAN: i64 = 120;

static KEY_NAME: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^organizations/[0-9a-f-]{36}/apiKeys/[0-9a-f-]{36}$")
        .expect("the key name pattern compiles")
});
static CODE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^[A-Z0-9]{2,10}$").expect("the code pattern compiles"));
static QUOTE: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^[A-Z]{3}$").expect("the quote pattern compiles"));
static DECIMAL: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^-?[0-9]+(?:\.[0-9]+)?$").expect("the decimal pattern compiles"));

pub fn refused(code: &str, detail: impl std::fmt::Display) -> EdenError {
    EdenError::Refused(format!("coinbase:{code}: {detail}"))
}

/// One wallet as `coinbase_balances` answers it: the amount is Coinbase's exact decimal string.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Wallet {
    pub id: String,
    pub code: String,
    pub name: String,
    /// `crypto` or `fiat`.
    pub kind: &'static str,
    pub amount: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Balances {
    pub wallets: Vec<Wallet>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Price {
    pub code: String,
    pub price: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Prices {
    pub prices: Vec<Price>,
    pub missing: Vec<String>,
}

/// A device's key: its name and the P-256 signing key.
pub struct Key {
    pub name: String,
    signing: SigningKey,
}

/// The private key as PEM in one normal form: the armour kept (SEC1 `EC PRIVATE KEY` or PKCS#8 `PRIVATE KEY`), the
/// body re-wrapped at 64 columns. Accepts the key with line breaks, without them, or with literal `\n` sequences as a
/// JSON key file holds them. `None` when it is not a PEM private key.
pub fn normalise_pem(text: &str) -> Option<String> {
    let text = text.trim().replace("\\r", "").replace("\\n", "\n");
    let rest = text.strip_prefix("-----BEGIN ")?;
    let (label, rest) = rest.split_once("-----")?;
    if label != "EC PRIVATE KEY" && label != "PRIVATE KEY" {
        return None;
    }
    let (body, end) = rest.split_once("-----END ")?;
    if end.trim() != format!("{label}-----") {
        return None;
    }
    let body: String = body.chars().filter(|c| !c.is_whitespace()).collect();
    STANDARD.decode(&body).ok()?;
    let lines: Vec<&str> = body
        .as_bytes()
        .chunks(64)
        .map(|chunk| std::str::from_utf8(chunk).expect("base64 is ASCII"))
        .collect();
    Some(format!(
        "-----BEGIN {label}-----\n{}\n-----END {label}-----\n",
        lines.join("\n")
    ))
}

/// The device's key from its name and private key, or `coinbase:invalid-key`: a name not of Coinbase's shape, a key
/// that is not PEM, or one that is not P-256 (an Ed25519 key among them).
pub fn key(name: &str, private_key: &str) -> Result<Key> {
    let name = name.trim();
    if !KEY_NAME.is_match(name) {
        return Err(refused("invalid-key", "not a CDP key name"));
    }
    let pem = normalise_pem(private_key)
        .ok_or_else(|| refused("invalid-key", "not a PEM private key"))?;
    // Each parser checks the armour's label, so the first that takes the key is the right one.
    let secret = p256::SecretKey::from_sec1_pem(&pem)
        .or_else(|_| p256::SecretKey::from_pkcs8_pem(&pem))
        .map_err(|_| refused("invalid-key", "not a P-256 private key"))?;
    Ok(Key {
        name: name.to_string(),
        signing: SigningKey::from(&secret),
    })
}

/// The key stored on this device, or `coinbase:no-key`.
pub fn stored_key(secrets: &dyn SecretStore) -> Result<Key> {
    let name = secrets.get(KEY_NAME_SECRET)?;
    let secret = secrets.get(KEY_SECRET)?;
    match name.zip(secret) {
        Some((name, secret)) => key(&name, &secret),
        None => Err(refused("no-key", "no Coinbase key on this device")),
    }
}

fn base64url(bytes: &[u8]) -> String {
    URL_SAFE_NO_PAD.encode(bytes)
}

/// The request token: ES256 over the header and claims, signed with the key, for one method and path (the query is
/// not part of `uri`), valid from `now` for two minutes, with a fresh nonce.
pub fn jwt(key: &Key, method: &str, path: &str, now: i64) -> String {
    let path = path.split('?').next().unwrap_or(path);
    let nonce = uuid::Uuid::new_v4().simple().to_string();
    let header = json!({ "alg": "ES256", "kid": key.name, "nonce": nonce, "typ": "JWT" });
    let claims = json!({
        "sub": key.name,
        "iss": "cdp",
        "nbf": now,
        "exp": now + JWT_LIFESPAN,
        "uri": format!("{method} {HOST}{path}"),
    });
    let signing_input = format!(
        "{}.{}",
        base64url(header.to_string().as_bytes()),
        base64url(claims.to_string().as_bytes())
    );
    let signature: Signature = key.signing.sign(signing_input.as_bytes());
    format!("{signing_input}.{}", base64url(&signature.to_bytes()))
}

/// The code for a non-2xx answer to a signed read.
fn failure(status: u16) -> &'static str {
    match status {
        401 => "needs-reauth",
        429 => "rate-limited",
        500.. => "provider-down",
        _ => "other",
    }
}

/// One signed `GET`: the JSON answer, or the failure's code (logged by its code alone).
async fn signed<F: Fetch>(
    fetch: &F,
    key: &Key,
    path: &str,
    now: i64,
) -> Result<std::result::Result<Value, u16>> {
    let token = jwt(key, "GET", path, now);
    let (status, answer) = fetch.get(&format!("{BASE}{path}"), Some(&token)).await?;
    if !(200..300).contains(&status) {
        let path = path.split('?').next().unwrap_or(path);
        log::warn!("Coinbase {path} failed: {}", failure(status));
        return Ok(Err(status));
    }
    if !answer.is_object() {
        return Err(refused("provider-down", "an answer that is not JSON"));
    }
    Ok(Ok(answer))
}

/// Asks Coinbase what the key may do: `coinbase:refused` when it refuses the key, `coinbase:not-read-only` unless it
/// can view and can neither trade nor transfer.
pub async fn check_key<F: Fetch>(fetch: &F, key: &Key, now: i64) -> Result<()> {
    let answer = match signed(fetch, key, "/api/v3/brokerage/key_permissions", now).await? {
        Ok(answer) => answer,
        Err(401 | 403) => return Err(refused("refused", "Coinbase did not accept the key")),
        Err(status) => return Err(refused(failure(status), format!("HTTP {status}"))),
    };
    let flag = |name: &str| answer[name].as_bool();
    let read_only = flag("can_view") == Some(true)
        && flag("can_trade") == Some(false)
        && flag("can_transfer") == Some(false);
    if !read_only {
        return Err(refused(
            "not-read-only",
            "the key can trade or transfer, or cannot view",
        ));
    }
    Ok(())
}

/// Checks the key with Coinbase, then stores it. Nothing is stored on any failure.
pub async fn set_key<F: Fetch>(
    secrets: &dyn SecretStore,
    fetch: &F,
    name: &str,
    private_key: &str,
    now: i64,
) -> Result<()> {
    let key = key(name, private_key)?;
    check_key(fetch, &key, now).await?;
    let pem = normalise_pem(private_key).expect("a key that parsed is PEM");
    secrets.set(KEY_NAME_SECRET, &key.name)?;
    secrets.set(KEY_SECRET, &pem)
}

fn wallet(value: &Value) -> Option<Wallet> {
    let text = |value: &Value| value.as_str().map(str::to_string);
    let code = text(&value["currency"]["code"]).or_else(|| text(&value["balance"]["currency"]))?;
    let amount = text(&value["balance"]["amount"]).filter(|amount| DECIMAL.is_match(amount))?;
    let kind = if value["currency"]["type"].as_str() == Some("fiat")
        || value["type"].as_str() == Some("fiat")
    {
        "fiat"
    } else {
        "crypto"
    };
    Some(Wallet {
        id: text(&value["id"]).filter(|id| !id.is_empty())?,
        name: text(&value["currency"]["name"])
            .or_else(|| text(&value["name"]))
            .unwrap_or_else(|| code.clone()),
        code,
        kind,
        amount,
    })
}

/// Every wallet, a page of 100 at a time, following `next_starting_after` for at most 10 pages.
pub async fn balances<F: Fetch>(fetch: &F, key: &Key, now: i64) -> Result<Balances> {
    let mut wallets = Vec::new();
    let mut after: Option<String> = None;
    for _ in 0..PAGES {
        let path = match &after {
            Some(after) => format!("/v2/accounts?limit={PAGE}&starting_after={after}"),
            None => format!("/v2/accounts?limit={PAGE}"),
        };
        let answer = match signed(fetch, key, &path, now).await? {
            Ok(answer) => answer,
            Err(status) => return Err(refused(failure(status), format!("HTTP {status}"))),
        };
        wallets.extend(
            answer["data"]
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(wallet),
        );
        after = answer["pagination"]["next_starting_after"]
            .as_str()
            .filter(|next| {
                !next.is_empty() && next.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
            })
            .map(str::to_string);
        if after.is_none() {
            break;
        }
    }
    Ok(Balances { wallets })
}

/// One spot price per distinct coin in the quote currency, from Coinbase's public price feed (no key). A coin it has
/// no price for (404 or 400) is `missing`, not a failure.
pub async fn prices<F: Fetch>(fetch: &F, codes: &[String], quote: &str) -> Result<Prices> {
    if codes.len() > MAX_CODES {
        return Err(refused("other", "too many coins"));
    }
    if !QUOTE.is_match(quote) || codes.iter().any(|code| !CODE.is_match(code)) {
        return Err(refused("other", "not a coin or currency code"));
    }
    let mut distinct: Vec<&String> = Vec::new();
    for code in codes {
        if !distinct.contains(&code) {
            distinct.push(code);
        }
    }
    let mut answer = Prices {
        prices: Vec::new(),
        missing: Vec::new(),
    };
    for code in distinct {
        let (status, body) = fetch
            .get(&format!("{BASE}/v2/prices/{code}-{quote}/spot"), None)
            .await?;
        match status {
            200..=299 => match body["data"]["amount"]
                .as_str()
                .filter(|amount| DECIMAL.is_match(amount))
            {
                Some(price) => answer.prices.push(Price {
                    code: code.clone(),
                    price: price.to_string(),
                }),
                None => return Err(refused("provider-down", "a price that is not a decimal")),
            },
            400 | 404 => answer.missing.push(code.clone()),
            _ => {
                log::warn!("Coinbase price failed: {}", failure(status));
                return Err(refused(failure(status), format!("HTTP {status}")));
            }
        }
    }
    Ok(answer)
}

#[cfg(test)]
mod tests {
    use p256::ecdsa::signature::Verifier;
    use p256::ecdsa::VerifyingKey;
    use p256::pkcs8::{EncodePrivateKey, LineEnding};

    use super::super::fetch::tests::{Memory, Script};
    use super::*;

    /// A CDP key name made at run time from two fixed ids, so no key-shaped text sits in the source.
    static KEY_NAME_TEXT: LazyLock<String> = LazyLock::new(|| {
        format!(
            "organizations/{}/apiKeys/{}",
            uuid::Uuid::from_u128(0x0f1e2d3c_4b5a_6978_8a9b_0c1d2e3f4a5b).hyphenated(),
            uuid::Uuid::from_u128(0xa1b2c3d4_e5f6_4789_8abc_def012345678).hyphenated()
        )
    });

    fn name() -> &'static str {
        KEY_NAME_TEXT.as_str()
    }
    const NOW: i64 = 1_793_000_000;

    /// A P-256 key made at run time, so no key sits in the source.
    fn secret() -> p256::SecretKey {
        p256::SecretKey::from_slice(&[7u8; 32]).expect("a scalar")
    }

    fn sec1_pem() -> String {
        secret()
            .to_sec1_pem(LineEnding::LF)
            .expect("SEC1 PEM")
            .to_string()
    }

    fn pkcs8_pem() -> String {
        secret()
            .to_pkcs8_pem(LineEnding::LF)
            .expect("PKCS#8 PEM")
            .to_string()
    }

    /// An Ed25519 PKCS#8 key, as Coinbase also makes, built from its fixed DER prefix.
    fn ed25519_pem() -> String {
        let mut der = vec![
            0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22,
            0x04, 0x20,
        ];
        der.extend([9u8; 32]);
        format!(
            "-----BEGIN PRIVATE KEY-----\n{}\n-----END PRIVATE KEY-----\n",
            STANDARD.encode(der)
        )
    }

    fn code_of(error: EdenError) -> String {
        let message = error.to_string();
        let rest = message.split("coinbase:").nth(1).unwrap_or(&message);
        rest.split(':').next().unwrap_or(rest).to_string()
    }

    fn decode(part: &str) -> Value {
        serde_json::from_slice(&URL_SAFE_NO_PAD.decode(part).expect("base64url")).expect("JSON")
    }

    #[test]
    fn signs_a_request_jwt() {
        let key = key(name(), &sec1_pem()).unwrap();
        let token = jwt(&key, "GET", "/v2/accounts?limit=100", NOW);
        let parts: Vec<&str> = token.split('.').collect();
        assert_eq!(parts.len(), 3);
        assert!(parts.iter().all(|part| !part.contains('=')), "no padding");

        let header = decode(parts[0]);
        let nonce = header["nonce"].as_str().unwrap().to_string();
        assert_eq!(nonce.len(), 32);
        assert!(nonce.chars().all(|c| c.is_ascii_hexdigit()));
        assert_eq!(
            header,
            json!({ "alg": "ES256", "kid": name(), "nonce": nonce, "typ": "JWT" })
        );
        assert_eq!(
            decode(parts[1]),
            json!({
                "sub": name(),
                "iss": "cdp",
                "nbf": NOW,
                "exp": NOW + 120,
                "uri": "GET api.coinbase.com/v2/accounts",
            })
        );

        let signature = URL_SAFE_NO_PAD.decode(parts[2]).unwrap();
        assert_eq!(signature.len(), 64, "r‖s");
        let signature = Signature::from_slice(&signature).unwrap();
        let verifying = VerifyingKey::from(&SigningKey::from(&secret()));
        let signed = format!("{}.{}", parts[0], parts[1]);
        assert!(verifying.verify(signed.as_bytes(), &signature).is_ok());

        let again = jwt(&key, "GET", "/v2/accounts", NOW);
        assert_ne!(
            decode(again.split('.').next().unwrap())["nonce"],
            json!(nonce),
            "a fresh nonce"
        );
    }

    fn permissions(view: bool, trade: bool, transfer: bool) -> Value {
        json!({ "can_view": view, "can_trade": trade, "can_transfer": transfer, "portfolio_uuid": "p" })
    }

    const PERMISSIONS: &str = "https://api.coinbase.com/api/v3/brokerage/key_permissions";

    #[tokio::test]
    async fn checks_a_key_before_storing_it() {
        let sec1 = sec1_pem();
        let pkcs8 = pkcs8_pem();
        let one_line = sec1.replace('\n', "");
        let escaped = pkcs8.trim().replace('\n', "\\n");
        let good = || Some((200, permissions(true, false, false)));
        // (name, key, reply, expected code or "" for stored)
        type Case<'a> = (&'a str, String, Option<(u16, Value)>, &'a str);
        let cases: Vec<Case> = vec![
            (name(), sec1.clone(), good(), ""),
            (name(), pkcs8.clone(), good(), ""),
            (name(), one_line, good(), ""),
            (name(), escaped, good(), ""),
            (
                "organizations/x/apiKeys/y",
                sec1.clone(),
                None,
                "invalid-key",
            ),
            (name(), "not a key".to_string(), None, "invalid-key"),
            (name(), ed25519_pem(), None, "invalid-key"),
            (
                name(),
                sec1.replace("EC PRIVATE KEY", "PRIVATE KEY"),
                None,
                "invalid-key",
            ),
            (
                name(),
                sec1.clone(),
                Some((401, json!({ "error": "unauthorized" }))),
                "refused",
            ),
            (name(), sec1.clone(), Some((403, json!({}))), "refused"),
            (
                name(),
                sec1.clone(),
                Some((200, permissions(false, false, false))),
                "not-read-only",
            ),
            (
                name(),
                sec1.clone(),
                Some((200, permissions(true, true, false))),
                "not-read-only",
            ),
            (
                name(),
                sec1.clone(),
                Some((200, permissions(true, false, true))),
                "not-read-only",
            ),
            (
                name(),
                sec1.clone(),
                Some((200, json!({ "can_view": true }))),
                "not-read-only",
            ),
            (name(), sec1.clone(), Some((429, json!({}))), "rate-limited"),
            (
                name(),
                sec1.clone(),
                Some((503, Value::Null)),
                "provider-down",
            ),
            (
                name(),
                sec1.clone(),
                Some((200, Value::Null)),
                "provider-down",
            ),
            (name(), sec1.clone(), Some((0, Value::Null)), "network"),
        ];
        for (name, private_key, reply, expected) in cases {
            let replies = reply
                .map(|(status, answer)| vec![(PERMISSIONS, status, answer)])
                .unwrap_or_default();
            let script = Script::new("coinbase", replies);
            let secrets = Memory::default();
            let outcome = set_key(&secrets, &&script, name, &private_key, NOW).await;
            assert_eq!(script.left(), 0, "{private_key}");
            if expected.is_empty() {
                assert!(outcome.is_ok(), "{private_key}: {outcome:?}");
                assert_eq!(
                    secrets.get(KEY_NAME_SECRET).unwrap().as_deref(),
                    Some(self::name())
                );
                let stored = secrets.get(KEY_SECRET).unwrap().unwrap();
                assert_eq!(
                    Some(stored.clone()),
                    normalise_pem(&stored),
                    "stored normalised"
                );
                assert!(stored_key(&secrets).is_ok());
                let sent = script.sent();
                assert!(sent[0]
                    .1
                    .as_deref()
                    .is_some_and(|token| token.starts_with("eyJ")));
            } else {
                assert_eq!(
                    code_of(outcome.unwrap_err()),
                    expected,
                    "{name} {private_key}"
                );
                assert!(secrets.is_empty(), "nothing stored: {expected}");
            }
        }
    }

    fn page(wallets: Value, next: Option<&str>) -> Value {
        json!({ "pagination": { "next_starting_after": next, "limit": 100 }, "data": wallets })
    }

    fn account(id: &str, code: &str, name: &str, kind: &str, amount: &str) -> Value {
        json!({
            "id": id,
            "name": format!("{code} Wallet"),
            "type": if kind == "fiat" { "fiat" } else { "wallet" },
            "currency": { "code": code, "name": name, "type": kind },
            "balance": { "amount": amount, "currency": code },
        })
    }

    #[tokio::test]
    async fn reads_every_wallet_page() {
        let key = key(name(), &sec1_pem()).unwrap();
        let script = Script::new(
            "coinbase",
            vec![
                (
                    "https://api.coinbase.com/v2/accounts?limit=100",
                    200,
                    page(
                        json!([
                            account("w-1", "BTC", "Bitcoin", "crypto", "0.04120000"),
                            account("w-2", "USD", "US Dollar", "fiat", "12.50"),
                        ]),
                        Some("w-2"),
                    ),
                ),
                (
                    "https://api.coinbase.com/v2/accounts?limit=100&starting_after=w-2",
                    200,
                    page(
                        json!([account("w-3", "ETH", "Ethereum", "crypto", "0")]),
                        None,
                    ),
                ),
            ],
        );
        let answer = balances(&&script, &key, NOW).await.unwrap();
        assert_eq!(
            answer.wallets,
            vec![
                Wallet {
                    id: "w-1".into(),
                    code: "BTC".into(),
                    name: "Bitcoin".into(),
                    kind: "crypto",
                    amount: "0.04120000".into()
                },
                Wallet {
                    id: "w-2".into(),
                    code: "USD".into(),
                    name: "US Dollar".into(),
                    kind: "fiat",
                    amount: "12.50".into()
                },
                Wallet {
                    id: "w-3".into(),
                    code: "ETH".into(),
                    name: "Ethereum".into(),
                    kind: "crypto",
                    amount: "0".into()
                },
            ]
        );
        assert!(
            script.sent().iter().all(|(_, bearer)| bearer.is_some()),
            "every page signed"
        );

        // At most ten pages.
        let endless: Vec<(String, u16, Value)> = (0..10)
            .map(|n| {
                let url = if n == 0 {
                    "https://api.coinbase.com/v2/accounts?limit=100".to_string()
                } else {
                    format!(
                        "https://api.coinbase.com/v2/accounts?limit=100&starting_after=w-{}",
                        n - 1
                    )
                };
                let wallet = account(&format!("w-{n}"), "BTC", "Bitcoin", "crypto", "1");
                (url, 200, page(json!([wallet]), Some(&format!("w-{n}"))))
            })
            .collect();
        let script = Script::new(
            "coinbase",
            endless
                .iter()
                .map(|(url, status, answer)| (url.as_str(), *status, answer.clone()))
                .collect(),
        );
        assert_eq!(
            balances(&&script, &key, NOW).await.unwrap().wallets.len(),
            10
        );
        assert_eq!(script.left(), 0);

        for (status, answer, expected) in [
            (401, json!({}), "needs-reauth"),
            (429, json!({}), "rate-limited"),
            (500, json!({}), "provider-down"),
            (200, Value::Null, "provider-down"),
            (0, Value::Null, "network"),
        ] {
            let script = Script::new(
                "coinbase",
                vec![(
                    "https://api.coinbase.com/v2/accounts?limit=100",
                    status,
                    answer,
                )],
            );
            let error = balances(&&script, &key, NOW).await.unwrap_err();
            assert_eq!(code_of(error), expected, "{status}");
        }
        assert_eq!(
            code_of(stored_key(&Memory::default()).err().unwrap()),
            "no-key"
        );
    }

    #[tokio::test]
    async fn prices_each_coin_once() {
        let spot = |amount: &str| json!({ "data": { "amount": amount, "base": "BTC", "currency": "USD" } });
        let script = Script::new(
            "coinbase",
            vec![
                (
                    "https://api.coinbase.com/v2/prices/BTC-USD/spot",
                    200,
                    spot("63000.12"),
                ),
                (
                    "https://api.coinbase.com/v2/prices/FOO-USD/spot",
                    404,
                    json!({ "errors": [] }),
                ),
                (
                    "https://api.coinbase.com/v2/prices/ETH-USD/spot",
                    200,
                    spot("3100.5"),
                ),
                (
                    "https://api.coinbase.com/v2/prices/BAR-USD/spot",
                    400,
                    json!({}),
                ),
            ],
        );
        let codes: Vec<String> = ["BTC", "FOO", "BTC", "ETH", "BAR", "ETH"]
            .map(String::from)
            .to_vec();
        let answer = prices(&&script, &codes, "USD").await.unwrap();
        assert_eq!(
            answer,
            Prices {
                prices: vec![
                    Price {
                        code: "BTC".into(),
                        price: "63000.12".into()
                    },
                    Price {
                        code: "ETH".into(),
                        price: "3100.5".into()
                    },
                ],
                missing: vec!["FOO".into(), "BAR".into()],
            }
        );
        assert!(
            script.sent().iter().all(|(_, bearer)| bearer.is_none()),
            "public, no key"
        );

        let many: Vec<String> = (0..51).map(|n| format!("C{n}")).collect();
        for (codes, quote) in [
            (vec!["btc".to_string()], "USD"),
            (vec!["B".to_string()], "USD"),
            (vec!["BTC/../x".to_string()], "USD"),
            (vec!["BTC".to_string()], "usd"),
            (vec!["BTC".to_string()], "USDT"),
            (many, "USD"),
        ] {
            let script = Script::new("coinbase", vec![]);
            assert_eq!(
                code_of(prices(&&script, &codes, quote).await.unwrap_err()),
                "other"
            );
            assert!(script.sent().is_empty());
        }
    }
}
