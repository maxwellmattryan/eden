//! The masking every read document passes through before its text leaves the crate (D-190): account, policy and member
//! numbers become `••••` plus their last four letters or digits, and the read counts how many were masked.
//!
//! Two rules, applied to the joined text:
//!
//! 1. **Labelled.** After one of `LABELS`, optionally followed by one of `SUFFIXES` and by `:` or `#`, the value is a
//!    run of letter-and-digit groups joined by single spaces or hyphens. It is masked when it holds at least
//!    `MIN_LABELLED` letters and digits. A value must hold a digit, so prose after a label (`card has been charged`)
//!    is never taken for one, and it may open with a short capital prefix (`HX-4429-8812`).
//! 2. **Unlabelled.** A run of digit groups joined by single spaces or hyphens, `MIN_UNLABELLED` digits or more, is
//!    masked unless a digit, `.`, `,`, `/` or `:` touches it (an amount, a date, a time), it is phone-shaped, or it is
//!    a ZIP+4.
//!
//! An issuer's own mask (`XXXX1234`, `****1234`) is left as it is.

use std::ops::Range;
use std::sync::LazyLock;

use regex::Regex;

/// What a masked run is shown as, before its last four letters or digits: four U+2022.
pub const MASK: &str = "••••";

/// The words a labelled number follows, case-insensitive and on a word boundary.
const LABELS: &str = "account|acct|a/c|policy|member|subscriber|customer|card|group|meter";
/// What may follow a label before its value: `Account number`, `Policy no.`, `Member ID`, `Acct #`.
const SUFFIXES: &str = r"number\b|num\b|no\.|no\b|identifier\b|id\b|#";
/// One group of a labelled value: letters and digits, at least one of them a digit.
const GROUP: &str = r"[A-Za-z0-9]*[0-9][A-Za-z0-9]*";
/// The letters and digits a labelled value needs before it is masked.
const MIN_LABELLED: usize = 5;
/// The digits an unlabelled run needs before it is masked.
const MIN_UNLABELLED: usize = 9;
/// The characters that, touching a digit run, make it an amount, a date or a time rather than a number to hide.
const NEIGHBOURS: &[char] = &['.', ',', '/', ':'];
/// How many letters or digits a mask keeps.
const KEEP: usize = 4;

static LABELLED: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(&format!(
        r"\b(?i:{LABELS})\b(?:[ \t]*(?i:{SUFFIXES}))?[ \t]*[:#]?[ \t]*(?P<value>(?:[A-Z]{{1,4}}[ -])?{GROUP}(?:[ -]{GROUP})*)"
    ))
    .expect("the labelled pattern compiles")
});

static RUN: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"[0-9]+(?:[ -][0-9]+)*").expect("the run pattern compiles"));

/// Phone shapes: `ddd-ddd-dddd`, `ddd.ddd.dddd` (stopped by its dots before it gets here), `ddd ddd dddd`, with an
/// optional `1 ` or `1-` in front (the `+` of `+1 ` sits outside the run). `(ddd) ddd-dddd` never makes nine digits.
static PHONE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^(?:1[ -])?[0-9]{3}[ -][0-9]{3}[ -][0-9]{4}$").expect("the phone pattern compiles")
});

static ZIP_PLUS_FOUR: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^[0-9]{5}-[0-9]{4}$").expect("the ZIP+4 pattern compiles"));

/// An issuer's own mask: `XXXX1234`, `xx-1234`.
static ISSUER_MASKED: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^[Xx]+[ -]?[0-9]{1,4}$").expect("the issuer pattern compiles"));

/// The text with every number-like run masked, and how many runs were.
pub fn mask(text: &str) -> (String, u32) {
    let mut runs: Vec<Range<usize>> = LABELLED
        .captures_iter(text)
        .filter_map(|captures| captures.name("value"))
        .filter(|value| {
            let run = value.as_str();
            letters_and_digits(run) >= MIN_LABELLED && !ISSUER_MASKED.is_match(run)
        })
        .map(|value| value.range())
        .collect();

    let unlabelled: Vec<Range<usize>> = RUN
        .find_iter(text)
        .filter(|run| {
            let digits = run.as_str().chars().filter(char::is_ascii_digit).count();
            digits >= MIN_UNLABELLED
                && !touches(text, run.range())
                && !PHONE.is_match(run.as_str())
                && !ZIP_PLUS_FOUR.is_match(run.as_str())
        })
        .map(|run| run.range())
        .filter(|run| {
            !runs
                .iter()
                .any(|taken| taken.start < run.end && run.start < taken.end)
        })
        .collect();
    runs.extend(unlabelled);
    runs.sort_by_key(|run| run.start);

    let mut out = String::with_capacity(text.len());
    let mut at = 0;
    for run in &runs {
        out.push_str(&text[at..run.start]);
        out.push_str(MASK);
        out.push_str(&last_four(&text[run.clone()]));
        at = run.end;
    }
    out.push_str(&text[at..]);
    (out, u32::try_from(runs.len()).unwrap_or(u32::MAX))
}

fn letters_and_digits(run: &str) -> usize {
    run.chars().filter(char::is_ascii_alphanumeric).count()
}

fn last_four(run: &str) -> String {
    let kept: Vec<char> = run.chars().filter(char::is_ascii_alphanumeric).collect();
    kept[kept.len().saturating_sub(KEEP)..].iter().collect()
}

/// Whether a digit, `.`, `,`, `/` or `:` sits right before or right after the run.
fn touches(text: &str, run: Range<usize>) -> bool {
    let close = |c: char| c.is_ascii_digit() || NEIGHBOURS.contains(&c);
    text[..run.start].chars().next_back().is_some_and(close)
        || text[run.end..].chars().next().is_some_and(close)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn masks_runs_that_look_like_numbers() {
        let cases: &[(&str, &str, u32)] = &[
            // Masked to the last four.
            (
                "Account number: 1234 5678 7781",
                "Account number: ••••7781",
                1,
            ),
            ("Policy #: HX-4429-8812", "Policy #: ••••8812", 1),
            ("Member ID: XGP123456789", "Member ID: ••••6789", 1),
            ("Meter no. 88412093", "Meter no. ••••2093", 1),
            ("acct# 0099812 on file", "acct# ••••9812 on file", 1),
            ("Card 4111 1111 1111 1234", "Card ••••1234", 1),
            (
                "Reference 5551234567 on file",
                "Reference ••••4567 on file",
                1,
            ),
            ("SSN 123-45-6789", "SSN ••••6789", 1),
            (
                "Account 12345678 and member 99887766",
                "Account ••••5678 and member ••••7766",
                2,
            ),
            // Left alone.
            ("Call 555-010-4477", "Call 555-010-4477", 0),
            ("Call 555.010.4477", "Call 555.010.4477", 0),
            ("Call 555 010 4477", "Call 555 010 4477", 0),
            ("Call (555) 010-4477", "Call (555) 010-4477", 0),
            ("Call +1 555-010-4477", "Call +1 555-010-4477", 0),
            ("Call 1-555-010-4477", "Call 1-555-010-4477", 0),
            ("Austin, TX 78701-1234", "Austin, TX 78701-1234", 0),
            ("Total $1,234,567,890.00", "Total $1,234,567,890.00", 0),
            ("Amount 123456789.00 due", "Amount 123456789.00 due", 0),
            ("Due 10/14/2024 at 10:30", "Due 10/14/2024 at 10:30", 0),
            ("1200 Riverside Drive", "1200 Riverside Drive", 0),
            ("Card ending XXXX1234", "Card ending XXXX1234", 0),
            ("Card number: XXXX1234", "Card number: XXXX1234", 0),
            ("Card number: ****1234", "Card number: ****1234", 0),
            (
                "Group 7, member since 2019",
                "Group 7, member since 2019",
                0,
            ),
            (
                "Dear customer, your card has been charged",
                "Dear customer, your card has been charged",
                0,
            ),
        ];
        for (text, expected, count) in cases {
            let (masked, masked_count) = mask(text);
            assert_eq!(&masked, expected, "{text:?}");
            assert_eq!(masked_count, *count, "the count for {text:?}");
        }
    }

    #[test]
    fn a_second_pass_changes_nothing() {
        let (once, _) = mask("Account number: 1234 5678 7781\nSSN 123-45-6789");
        assert_eq!(mask(&once), (once.clone(), 0));
    }
}
