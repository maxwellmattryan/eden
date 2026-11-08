//! The one redaction every log line, diagnostics entry and crash-log line passes through (docs/engineering/data-layer.md,
//! "Logs and diagnostics"). It is a backstop, not a licence: domain code logs ids, codes and counts, never a row's
//! values.
//!
//! It replaces, in this order:
//!
//! 0. key material, wherever it stands (D-201): a PEM private-key block, a JWT, a Coinbase CDP key name, and a
//!    mainnet or testnet extended key, public or private: `[key]`;
//! 1. the value under a sensitive key (`amount`, `merchant`, `access_token`, …), quoted or not, after `:` or `=`, as in
//!    JSON, Rust `Debug` and `key=value`: the value becomes `"[redacted]"`;
//! 2. a bare Plaid token (`access-sandbox-…`, `public-production-…`, `link-sandbox-…`): `[token]`;
//! 3. an amount, a number beside a currency symbol or one of the listed currency codes: `[amount]`;
//! 4. an account-like number, a run of 8 or more digits: `[number]`.
//!
//! ISO dates and times, ULIDs, HLC stamps and version numbers are left alone: `regex` has no lookaround, so each
//! amount or number match is checked against the spans of those shapes before it is replaced. The output holds no
//! digit it put there, so a second pass changes nothing.

use std::borrow::Cow;
use std::sync::LazyLock;

use regex::{Captures, Regex};

const KEYS: &str = "amount|minor|balance|available|current|limit|merchant|merchant_name|merchantName|payee|\
                    counterparty|description|original_description|access_token|accessToken|public_token|secret|\
                    account_number|accountNumber|routing|link_token|linkToken|client_id|clientId";
const SYMBOLS: &str = "[$€£¥₹₩]";
const CODES: &str =
    "USD|EUR|GBP|JPY|CAD|AUD|CHF|CNY|INR|MXN|BRL|KRW|SEK|NOK|DKK|NZD|SGD|HKD|BTC|ETH|USDC";
/// A number with optional thousands separators and decimals: `4,217.00`, `1200`, `0.5`.
const NUMBER: &str = r"[0-9](?:[0-9,]*[0-9])?(?:\.[0-9]+)?";
/// A quoted string, a JSON string escaped inside another, `Some(…)` from `Debug`, a number, or a bare token.
const VALUE: &str = r#""(?:[^"\\]|\\.)*"|\\"(?:[^"\\]|\\[^"])*\\"|Some\((?:"(?:[^"\\]|\\.)*"|[^)]*)\)|[^\s,;&)}\]]+"#;

static KEYED: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(&format!(
        r#"(?P<key>"?\b(?i:{KEYS})\b\\?"?\s*[:=]\s*)(?:{VALUE})"#
    ))
    .expect("the keyed pattern compiles")
});

static AMOUNT: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(&format!(
        r"[-+]?{SYMBOLS}\s?[-+]?{NUMBER}|[-+]?\b{NUMBER}\s?{SYMBOLS}|\b(?:{CODES})\s?[-+]?{NUMBER}|[-+]?\b{NUMBER}\s?(?:{CODES})\b"
    ))
    .expect("the amount pattern compiles")
});

/// A bare Plaid token, under no key: `access-sandbox-…`, `public-production-…`, `link-sandbox-…`.
static TOKEN: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\b(?:access|public|link)-(?:sandbox|production)-[0-9a-f-]{8,}")
        .expect("the token pattern compiles")
});

/// Key material under no key: a PEM private-key block across lines, a JWT (`eyJ….….…`), a CDP key name, and an
/// extended key (`xpub`, `ypub`, `zpub`, `tpub`, `upub`, `vpub` and their `prv` twins).
static KEY_MATERIAL: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(concat!(
        r"(?s:-----BEGIN [A-Z ]*PRIVATE KEY-----.*?-----END [A-Z ]*PRIVATE KEY-----)",
        r"|\beyJ[\w-]+\.[\w-]+\.[\w-]+",
        r"|organizations/[0-9a-f-]{36}/apiKeys/[0-9a-f-]{36}",
        r"|\b[xyztuv](?:pub|prv)[1-9A-HJ-NP-Za-km-z]{100,112}\b",
    ))
    .expect("the key material pattern compiles")
});

static DIGITS: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\b[0-9]{8,}\b").expect("the digits pattern compiles"));

/// The shapes left alone: an HLC stamp, a ULID, an ISO date or time, a version.
static PROTECTED: LazyLock<Vec<Regex>> = LazyLock::new(|| {
    [
        r"\b[0-9a-f]{16}-[0-9a-f]{8}-[0-9a-f]{8}\b",
        r"\b[0-9A-HJKMNP-TV-Z]{26}\b",
        r"\b[0-9]{4}-[0-9]{2}-[0-9]{2}(?:[T ][0-9]{2}:[0-9]{2}(?::[0-9]{2}(?:\.[0-9]+)?)?(?:Z|[+-][0-9]{2}:?[0-9]{2})?)?",
        r"\b[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]+)?\b",
        r"\bv?[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.]+)?\b",
    ]
    .into_iter()
    .map(|pattern| Regex::new(pattern).expect("a protected pattern compiles"))
    .collect()
});

/// `text` with the values of sensitive keys, amounts and account-like numbers replaced. Deterministic and idempotent.
pub fn redact(text: &str) -> Cow<'_, str> {
    let material = KEY_MATERIAL.replace_all(text, "[key]");
    let keyed = KEYED.replace_all(&material, "${key}\"[redacted]\"");
    let tokens = TOKEN.replace_all(&keyed, "[token]");
    let amounts = replace_unprotected(&tokens, &AMOUNT, "[amount]");
    let numbers = replace_unprotected(&amounts, &DIGITS, "[number]");
    if numbers == text {
        Cow::Borrowed(text)
    } else {
        Cow::Owned(numbers.into_owned())
    }
}

/// Replaces each match of `pattern` that does not overlap one of the protected shapes.
fn replace_unprotected<'a>(text: &'a str, pattern: &Regex, with: &str) -> Cow<'a, str> {
    if !pattern.is_match(text) {
        return Cow::Borrowed(text);
    }
    let protected: Vec<(usize, usize)> = PROTECTED
        .iter()
        .flat_map(|shape| shape.find_iter(text).map(|m| (m.start(), m.end())))
        .collect();
    pattern.replace_all(text, |caps: &Captures| {
        let found = caps.get(0).expect("the whole match");
        let overlaps = protected
            .iter()
            .any(|&(start, end)| found.start() < end && start < found.end());
        if overlaps {
            found.as_str().to_string()
        } else {
            with.to_string()
        }
    })
}

/// The crates whose records are dropped whole: the PDF libraries the document reader uses (`domains/finance`) log
/// glyph names, font dictionaries and stream contents taken from the document being read.
const SILENCED_TARGETS: &[&str] = &["pdf_extract", "lopdf"];

fn silenced(target: &str) -> bool {
    SILENCED_TARGETS.iter().any(|crate_name| {
        target
            .strip_prefix(crate_name)
            .is_some_and(|rest| rest.is_empty() || rest.starts_with("::"))
    })
}

/// A `log::Log` that redacts each record's message before it reaches the platform logger it wraps, and drops every
/// record from `SILENCED_TARGETS`.
pub struct RedactingLogger<L: log::Log>(pub L);

impl<L: log::Log> log::Log for RedactingLogger<L> {
    fn enabled(&self, metadata: &log::Metadata) -> bool {
        !silenced(metadata.target()) && self.0.enabled(metadata)
    }

    fn log(&self, record: &log::Record) {
        if !self.enabled(record.metadata()) {
            return;
        }
        let message = record.args().to_string();
        let clean = redact(&message);
        self.0.log(
            &log::Record::builder()
                .args(format_args!("{clean}"))
                .level(record.level())
                .target(record.target())
                .module_path(record.module_path())
                .file(record.file())
                .line(record.line())
                .build(),
        );
    }

    fn flush(&self) {
        self.0.flush()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    #[test]
    fn redacts_finance_values_and_leaves_the_rest() {
        let cases = [
            // Amounts, by symbol and by code, either side, signed, with separators.
            ("paid -$4,217.00 to the card", "paid [amount] to the card"),
            ("¥1,200 at the station", "[amount] at the station"),
            (
                "€12.50, £3 and ₹500 and ₩10,000",
                "[amount], [amount] and [amount] and [amount]",
            ),
            ("$ 18 tip", "[amount] tip"),
            ("12.50€ back", "[amount] back"),
            ("1,200 USD and USD 1,200", "[amount] and [amount]"),
            ("0.5 BTC, 40 EUR, 3 USDC", "[amount], [amount], [amount]"),
            // Values under sensitive keys: JSON, escaped JSON, Debug, key=value.
            (
                r#"{"amount":4217,"merchant":"Blue Bottle","id":"x"}"#,
                r#"{"amount":"[redacted]","merchant":"[redacted]","id":"x"}"#,
            ),
            (
                r#"body {\"merchantName\":\"Blue Bottle\"}"#,
                r#"body {\"merchantName\":"[redacted]"}"#,
            ),
            (
                r#"Txn { merchant_name: "Blue Bottle", balance: 12.5, payee: Some("Ana") }"#,
                r#"Txn { merchant_name: "[redacted]", balance: "[redacted]", payee: "[redacted]" }"#,
            ),
            (
                "exchange access_token=access-sandbox-1f2e public_token = pt-9",
                r#"exchange access_token="[redacted]" public_token = "[redacted]""#,
            ),
            (
                r#"{"Amount": "$4.00", "Description": "rent", "ROUTING": 11000000}"#,
                r#"{"Amount": "[redacted]", "Description": "[redacted]", "ROUTING": "[redacted]"}"#,
            ),
            // Plaid's keys and tokens: under a key, and bare.
            (
                r#"{"link_token":"link-sandbox-af1a0311-da53-4636-b754-dd15cc058176","client_id":"60f0c0ffee","linkToken":"x"}"#,
                r#"{"link_token":"[redacted]","client_id":"[redacted]","linkToken":"[redacted]"}"#,
            ),
            ("keys clientId=60f0c0ffee saved", r#"keys clientId="[redacted]" saved"#),
            (
                "item access-sandbox-de3ce8ef-33f8-452c-a685-8671031fc0f6 synced",
                "item [token] synced",
            ),
            (
                "got public-production-6e0a8a3c-1b2d-4e5f-9a8b-7c6d5e4f3a2b and link-sandbox-0123abcd-ef",
                "got [token] and [token]",
            ),
            // Account-like numbers.
            ("account 123456789012 linked", "account [number] linked"),
            ("card 12345678", "card [number]"),
            // Left alone.
            (
                "at 2026-11-06T10:15:00Z and 2026-11-06 10:15:00.123+09:00",
                "",
            ),
            ("row 01JC8Z4Q5W6E7R8T9Y0A1B2C3D written", ""),
            ("stamp 0000019345678901-00000001-0a1b2c3d", ""),
            ("Eden 0.38.0 (staging), v1.2.3-beta.1", ""),
            ("42 rows in 1234567 ms, total_amount 9", ""),
            ("", ""),
        ];
        // Key material (D-201), built at run time so no key-shaped text sits in the source.
        let body = format!("MHcCAQEEI{}\n{}==", "A".repeat(55), "B".repeat(40));
        let zpub = crate::domains::finance::xpub::vectors::zpub();
        let built = [
            (
                format!("key -----BEGIN EC PRIVATE KEY-----\n{body}\n-----END EC PRIVATE KEY-----\n refused"),
                "key [key]\n refused".to_string(),
            ),
            (
                format!("pkcs8 -----BEGIN PRIVATE KEY-----\\n{body}\\n-----END PRIVATE KEY----- read"),
                "pkcs8 [key] read".to_string(),
            ),
            (
                format!(
                    "bearer ey{}.ey{}.{} sent",
                    "JhbGciOiJFUzI1NiIsImtpZCI6Im9yZyJ9", "JzdWIiOiJvcmcifQ", "c2lnbmF0dXJlX2J5dGVz-_"
                ),
                "bearer [key] sent".to_string(),
            ),
            (
                "kid organizations/0f1e2d3c-4b5a-6978-8a9b-0c1d2e3f4a5b/apiKeys/a1b2c3d4-e5f6-4789-8abc-def012345678 used"
                    .to_string(),
                "kid [key] used".to_string(),
            ),
            (format!("watch {zpub} read"), "watch [key] read".to_string()),
            (
                format!("watch {} and {}", zpub.replacen("zpub", "xprv", 1), zpub.replacen("zpub", "tpub", 1)),
                "watch [key] and [key]".to_string(),
            ),
            (
                format!("{}, {}", zpub.replacen("zpub", "vprv", 1), zpub.replacen("zpub", "upub", 1)),
                "[key], [key]".to_string(),
            ),
            // Left alone: an address is not key material, and a short `xpub` word is not a key.
            ("to bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu".to_string(), String::new()),
            ("an xpub was refused".to_string(), String::new()),
        ];
        let cases = cases
            .iter()
            .map(|(input, expected)| (input.to_string(), expected.to_string()))
            .chain(built);
        for (input, expected) in cases {
            let expected = if expected.is_empty() {
                input.clone()
            } else {
                expected
            };
            let once = redact(&input);
            assert_eq!(once, expected, "{input}");
            assert_eq!(redact(&once), once, "twice: {input}");
        }
        assert!(matches!(redact("nothing to see"), Cow::Borrowed(_)));
    }

    /// An inner logger that keeps what it is handed.
    #[derive(Default)]
    struct Capture(Mutex<Vec<(log::Level, String, String, Option<u32>)>>);

    impl log::Log for Capture {
        fn enabled(&self, metadata: &log::Metadata) -> bool {
            metadata.level() <= log::Level::Info
        }

        fn log(&self, record: &log::Record) {
            self.0.lock().unwrap().push((
                record.level(),
                record.target().to_string(),
                record.args().to_string(),
                record.line(),
            ));
        }

        fn flush(&self) {}
    }

    #[test]
    fn the_redacting_logger_forwards_redacted_records() {
        use log::Log;

        let logger = RedactingLogger(Capture::default());
        let record = |level, message: std::fmt::Arguments<'_>| {
            logger.log(
                &log::Record::builder()
                    .args(message)
                    .level(level)
                    .target("eden::finance")
                    .line(Some(7))
                    .build(),
            )
        };
        record(
            log::Level::Warn,
            format_args!(
                "sync paid {} to {}",
                "$4,217.00", r#"{"merchant":"Blue Bottle"}"#
            ),
        );
        record(
            log::Level::Info,
            format_args!("account {}", 123456789012u64),
        );
        // Below the inner logger's level: dropped, as the inner logger would.
        record(log::Level::Debug, format_args!("debug $5"));
        // The PDF libraries: dropped at any level, since their records can quote the document.
        for target in ["lopdf::object", "pdf_extract", "pdf_extract::encodings"] {
            logger.log(
                &log::Record::builder()
                    .args(format_args!("font {}", "Account 1234 5678"))
                    .level(log::Level::Error)
                    .target(target)
                    .build(),
            );
        }
        assert!(!logger.enabled(
            &log::Metadata::builder()
                .level(log::Level::Error)
                .target("lopdf")
                .build()
        ));

        let seen = logger.0 .0.lock().unwrap().clone();
        assert_eq!(
            seen,
            vec![
                (
                    log::Level::Warn,
                    "eden::finance".to_string(),
                    r#"sync paid [amount] to {"merchant":"[redacted]"}"#.to_string(),
                    Some(7),
                ),
                (
                    log::Level::Info,
                    "eden::finance".to_string(),
                    "account [number]".to_string(),
                    Some(7),
                ),
            ]
        );
    }
}
