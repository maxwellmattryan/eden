//! Plaid's native Link sheet on iOS (docs/product/domains/finance.md §8, "Plaid on the phone", D-206). The crate
//! presents LinkKit's sheet through the Swift bridge (`swift/EdenPlaidLink`), and the bridge hands the outcome straight
//! back through `on_outcome`, a C callback with no Tauri state, so the outcomes live here in a process-wide registry
//! keyed by link token. The webview's poll (`plaid_link_poll`) reads it, so a public token never reaches the webview,
//! and the entry is forgotten once the poll has its answer.
//!
//! Only a token this run made for the sheet can be presented. Nothing here logs a token or an outcome's body.

use std::collections::HashMap;
use std::ffi::{c_char, CStr};
use std::sync::{Mutex, MutexGuard, OnceLock};

use serde::Deserialize;

use super::plaid::{refused, Session};
use crate::error::Result;

/// Where one sheet is.
#[derive(Debug, Clone, PartialEq)]
enum SheetState {
    Open,
    Succeeded { public_token: String },
    Exited { reason: Option<String> },
}

/// What the bridge reports, as JSON.
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Outcome {
    link_token: String,
    outcome: String,
    public_token: Option<String>,
    error_code: Option<String>,
}

fn registry() -> MutexGuard<'static, HashMap<String, SheetState>> {
    static SHEETS: OnceLock<Mutex<HashMap<String, SheetState>>> = OnceLock::new();
    SHEETS
        .get_or_init(Mutex::default)
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

/// A link token made for the sheet: it may be presented, and it waits for an outcome.
pub fn begin(token: &str) {
    registry().insert(token.to_string(), SheetState::Open);
}

/// Whether the token was made for the sheet in this run and is still waiting for its outcome.
pub fn can_open(token: &str) -> bool {
    registry().get(token) == Some(&SheetState::Open)
}

/// Records the bridge's outcome for a sheet still open. An unreadable outcome, or one for a token never begun, changes
/// nothing.
pub fn record(json: &str) {
    let Ok(outcome) = serde_json::from_str::<Outcome>(json) else {
        log::warn!("finance:sheet-outcome-unreadable");
        return;
    };
    let state = match (outcome.outcome.as_str(), outcome.public_token) {
        ("success", Some(public_token)) if !public_token.is_empty() => {
            SheetState::Succeeded { public_token }
        }
        ("exit", _) => SheetState::Exited {
            reason: outcome.error_code.filter(|code| !code.is_empty()),
        },
        _ => {
            log::warn!("finance:sheet-outcome-unreadable");
            return;
        }
    };
    let mut sheets = registry();
    if let Some(entry) = sheets.get_mut(&outcome.link_token) {
        if *entry == SheetState::Open {
            *entry = state;
        }
    }
}

/// The sheet's session, when the token was made for the sheet.
pub fn session_of(token: &str) -> Option<Session> {
    registry().get(token).map(|state| match state {
        SheetState::Open => Session::Waiting,
        SheetState::Succeeded { public_token } => Session::Finished {
            public_token: Some(public_token.clone()),
        },
        SheetState::Exited { reason } => Session::Exited {
            reason: reason.clone(),
        },
    })
}

/// Lets the sheet go, and its public token with it.
pub fn forget(token: &str) {
    registry().remove(token);
}

/// The bridge's callback: one outcome as a NUL-terminated UTF-8 JSON string, read before this returns.
#[cfg_attr(not(target_os = "ios"), allow(dead_code))]
pub extern "C" fn on_outcome(json: *const c_char) {
    if json.is_null() {
        return;
    }
    // SAFETY: the bridge passes a valid NUL-terminated string that lives until this call returns.
    let json = unsafe { CStr::from_ptr(json) };
    match json.to_str() {
        Ok(json) => record(json),
        Err(_) => log::warn!("finance:sheet-outcome-unreadable"),
    }
}

#[cfg(target_os = "ios")]
extern "C" {
    /// Defined by `PlaidLinkBridge.swift` in the iOS app target (`@_cdecl`), resolved at the app's final link. Answers
    /// 0 once the sheet is presented (or a second present was ignored), non-zero when no window can present it.
    fn eden_plaid_link_open(token: *const c_char, done: extern "C" fn(*const c_char)) -> i32;
}

/// Presents Plaid's sheet on a token made for it. There is no Link sheet anywhere but iOS.
pub fn present(token: &str) -> Result<()> {
    if !can_open(token) {
        return Err(refused("other", "not a Link sheet of this run"));
    }
    present_sheet(token)
}

#[cfg(target_os = "ios")]
fn present_sheet(token: &str) -> Result<()> {
    let token = std::ffi::CString::new(token).map_err(|_| refused("other", "not a link token"))?;
    // SAFETY: the bridge copies the token before it returns, and `on_outcome` is a plain C function that lives for the
    // whole process.
    let presented = unsafe { eden_plaid_link_open(token.as_ptr(), on_outcome) };
    if presented != 0 {
        return Err(refused("other", "no window for Plaid's sheet"));
    }
    Ok(())
}

#[cfg(not(target_os = "ios"))]
fn present_sheet(_token: &str) -> Result<()> {
    Err(refused("other", "no Link sheet on this device"))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn outcome(token: &str, body: &str) -> String {
        format!(r#"{{"linkToken":"{token}",{body}}}"#)
    }

    #[test]
    fn an_open_sheet_waits() {
        begin("link-sheet-wait");
        assert_eq!(session_of("link-sheet-wait"), Some(Session::Waiting));
        forget("link-sheet-wait");
        assert_eq!(session_of("link-sheet-wait"), None);
    }

    #[test]
    fn a_success_finishes_with_its_public_token() {
        begin("link-sheet-success");
        record(&outcome(
            "link-sheet-success",
            r#""outcome":"success","publicToken":"public-sandbox-1""#,
        ));
        assert_eq!(
            session_of("link-sheet-success"),
            Some(Session::Finished {
                public_token: Some("public-sandbox-1".to_string())
            })
        );
        // A later outcome does not replace the first.
        record(&outcome("link-sheet-success", r#""outcome":"exit""#));
        assert!(matches!(
            session_of("link-sheet-success"),
            Some(Session::Finished { .. })
        ));
        assert!(!can_open("link-sheet-success"));
        forget("link-sheet-success");
        assert_eq!(session_of("link-sheet-success"), None);
    }

    #[test]
    fn an_exit_carries_its_code() {
        begin("link-sheet-exit-code");
        record(&outcome(
            "link-sheet-exit-code",
            r#""outcome":"exit","errorCode":"INSTITUTION_NOT_RESPONDING""#,
        ));
        assert_eq!(
            session_of("link-sheet-exit-code"),
            Some(Session::Exited {
                reason: Some("INSTITUTION_NOT_RESPONDING".to_string())
            })
        );
        begin("link-sheet-exit");
        record(&outcome("link-sheet-exit", r#""outcome":"exit""#));
        assert_eq!(
            session_of("link-sheet-exit"),
            Some(Session::Exited { reason: None })
        );
        forget("link-sheet-exit-code");
        forget("link-sheet-exit");
    }

    #[test]
    fn unknown_or_malformed_outcomes_are_ignored() {
        begin("link-sheet-ignored");
        for json in [
            "not json",
            "{}",
            r#"{"linkToken":"link-sheet-ignored"}"#,
            &outcome("link-sheet-ignored", r#""outcome":"success""#),
            &outcome("link-sheet-ignored", r#""outcome":"maybe""#),
        ] {
            record(json);
            assert_eq!(
                session_of("link-sheet-ignored"),
                Some(Session::Waiting),
                "{json}"
            );
        }
        record(&outcome(
            "link-sheet-never-begun",
            r#""outcome":"success","publicToken":"public-sandbox-2""#,
        ));
        assert_eq!(session_of("link-sheet-never-begun"), None);
        assert!(!can_open("link-sheet-never-begun"));
        on_outcome(std::ptr::null());
        let json = std::ffi::CString::new(outcome(
            "link-sheet-ignored",
            r#""outcome":"exit","errorCode":"USER_EXIT""#,
        ))
        .unwrap();
        on_outcome(json.as_ptr());
        assert_eq!(
            session_of("link-sheet-ignored"),
            Some(Session::Exited {
                reason: Some("USER_EXIT".to_string())
            })
        );
        forget("link-sheet-ignored");
    }

    #[test]
    fn only_begun_tokens_open() {
        assert!(!can_open("link-sheet-open"));
        begin("link-sheet-open");
        assert!(can_open("link-sheet-open"));
        forget("link-sheet-open");
        assert!(!can_open("link-sheet-open"));
        // Off iOS there is no sheet to present, begun or not.
        #[cfg(not(target_os = "ios"))]
        {
            begin("link-sheet-open");
            assert!(present("link-sheet-open").is_err());
            forget("link-sheet-open");
        }
    }
}
