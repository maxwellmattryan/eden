//! The phone lock (docs/engineering/app-scaffold.md, "The phone lock"): whether this device can lock, and the one
//! system prompt that unlocks it. The lock is a gate on the UI only (`@eden/shared/shell/lock`): it never binds the
//! database key or the secret store to biometry and never reads the biometry domain state, so a new face, finger or
//! passcode never locks the owner out. The biometric plugin is called from Rust, so the webview holds no permission
//! for it. Desktop and every build without the `mobile` feature answer that the device is not lockable.

use serde::Serialize;

use crate::error::Result;

/// The kind of biometry the system prompt will offer, which names the Unlock button.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Biometry {
    Face,
    Touch,
    Fingerprint,
    None,
}

/// Whether the device can lock Eden: it can whenever a passcode is set, with or without biometry.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LockStatus {
    pub lockable: bool,
    pub biometry: Biometry,
}

/// How one system prompt ended.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum UnlockOutcome {
    Unlocked,
    Cancelled,
    Failed,
    NoPasscode,
}

/// The plugin's code for a device with no passcode, on iOS and Android alike.
const PASSCODE_NOT_SET: &str = "passcodeNotSet";

/// The plugin's status as Eden reads it. `kind` is `face`, `touch` or `fingerprint` (anything else is none), and
/// names the button only while biometry is available: when it is not (not enrolled, locked out, no hardware), the
/// passcode answers the prompt, so the button is plain Unlock. Only a missing passcode makes the device unlockable.
// Compiled on every target so the mapping is tested where the tests run; only the phone calls it.
#[cfg_attr(not(all(feature = "mobile", mobile)), allow(dead_code))]
pub fn status_from(available: bool, kind: &str, error_code: Option<&str>) -> LockStatus {
    if available {
        let biometry = match kind {
            "face" => Biometry::Face,
            "touch" => Biometry::Touch,
            "fingerprint" => Biometry::Fingerprint,
            _ => Biometry::None,
        };
        return LockStatus {
            lockable: true,
            biometry,
        };
    }
    LockStatus {
        lockable: error_code != Some(PASSCODE_NOT_SET),
        biometry: Biometry::None,
    }
}

/// The outcome of one prompt from the plugin's error code: `None` is no error at all. Any code that is not a cancel
/// or a missing passcode, an empty one included, is a failure, so nothing but a resolved prompt ever unlocks.
#[cfg_attr(not(all(feature = "mobile", mobile)), allow(dead_code))]
pub fn outcome_from(error_code: Option<&str>) -> UnlockOutcome {
    match error_code {
        None => UnlockOutcome::Unlocked,
        Some("userCancel" | "systemCancel" | "appCancel") => UnlockOutcome::Cancelled,
        Some(PASSCODE_NOT_SET) => UnlockOutcome::NoPasscode,
        Some(_) => UnlockOutcome::Failed,
    }
}

#[cfg(all(feature = "mobile", mobile))]
mod native {
    use tauri::plugin::mobile::PluginInvokeError;
    use tauri_plugin_biometric::{AuthOptions, BiometricExt, BiometryType, Error};

    use super::{outcome_from, status_from, LockStatus, UnlockOutcome};
    use crate::error::{EdenError, Result};

    /// The plugin's code on a rejected call. A rejection without one still reads as a failure, never a success.
    fn code_of(error: &Error) -> &str {
        match error {
            Error::PluginInvoke(PluginInvokeError::InvokeRejected(response)) => {
                response.code.as_deref().unwrap_or("unknown")
            }
            _ => "unknown",
        }
    }

    pub fn status<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> Result<LockStatus> {
        let status = app
            .biometric()
            .status()
            .map_err(|e| EdenError::InvalidOperation(format!("phone lock status: {e}")))?;
        // Android's face unlock is not Face ID, so only Apple's kinds name the button there.
        let kind = match (status.biometry_type, cfg!(target_os = "ios")) {
            (BiometryType::FaceID, true) => "face",
            (BiometryType::TouchID, true) => "touch",
            (BiometryType::TouchID, false) => "fingerprint",
            _ => "none",
        };
        Ok(status_from(
            status.is_available,
            kind,
            status.error_code.as_deref(),
        ))
    }

    pub fn unlock<R: tauri::Runtime>(app: &tauri::AppHandle<R>, reason: String) -> UnlockOutcome {
        let options = AuthOptions {
            allow_device_credential: true,
            ..AuthOptions::default()
        };
        match app.biometric().authenticate(reason, options) {
            Ok(()) => outcome_from(None),
            Err(error) => {
                log::info!("phone lock: the prompt did not unlock: {error}");
                outcome_from(Some(code_of(&error)))
            }
        }
    }
}

/// Whether this device can lock Eden, and which biometry its prompt offers.
#[tauri::command]
pub async fn phone_lock_status<R: tauri::Runtime>(app: tauri::AppHandle<R>) -> Result<LockStatus> {
    #[cfg(all(feature = "mobile", mobile))]
    {
        native::status(&app)
    }
    #[cfg(not(all(feature = "mobile", mobile)))]
    {
        let _ = app;
        Ok(not_lockable())
    }
}

/// The answer of desktop and of every build without the phone's plugin: Eden never locks there.
#[cfg_attr(all(feature = "mobile", mobile), allow(dead_code))]
fn not_lockable() -> LockStatus {
    LockStatus {
        lockable: false,
        biometry: Biometry::None,
    }
}

/// Asks the system once: biometry, falling back to the device passcode. `reason` is the prompt's line.
#[tauri::command]
pub async fn phone_lock_unlock<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    reason: String,
) -> Result<UnlockOutcome> {
    #[cfg(all(feature = "mobile", mobile))]
    {
        // The prompt blocks until the owner answers, so it runs off the async runtime's threads.
        tauri::async_runtime::spawn_blocking(move || native::unlock(&app, reason))
            .await
            .map_err(crate::error::EdenError::Tauri)
    }
    #[cfg(not(all(feature = "mobile", mobile)))]
    {
        let _ = (app, reason);
        Ok(UnlockOutcome::Unlocked)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_maps_the_plugin_answer() {
        let rows: &[(bool, &str, Option<&str>, bool, Biometry)] = &[
            (true, "face", None, true, Biometry::Face),
            (true, "touch", None, true, Biometry::Touch),
            (true, "fingerprint", None, true, Biometry::Fingerprint),
            (true, "none", None, true, Biometry::None),
            (false, "none", Some("passcodeNotSet"), false, Biometry::None),
            (false, "face", Some("passcodeNotSet"), false, Biometry::None),
            (
                false,
                "face",
                Some("biometryNotEnrolled"),
                true,
                Biometry::None,
            ),
            (
                false,
                "none",
                Some("biometryNotAvailable"),
                true,
                Biometry::None,
            ),
            (false, "face", Some("biometryLockout"), true, Biometry::None),
            (false, "none", Some(""), true, Biometry::None),
            (false, "none", None, true, Biometry::None),
        ];
        for (available, kind, code, lockable, biometry) in rows {
            assert_eq!(
                status_from(*available, kind, *code),
                LockStatus {
                    lockable: *lockable,
                    biometry: *biometry
                },
                "{available} {kind} {code:?}"
            );
        }
    }

    #[test]
    fn outcome_maps_the_plugin_answer() {
        let rows: &[(Option<&str>, UnlockOutcome)] = &[
            (None, UnlockOutcome::Unlocked),
            (Some("userCancel"), UnlockOutcome::Cancelled),
            (Some("systemCancel"), UnlockOutcome::Cancelled),
            (Some("appCancel"), UnlockOutcome::Cancelled),
            (Some("passcodeNotSet"), UnlockOutcome::NoPasscode),
            (Some("authenticationFailed"), UnlockOutcome::Failed),
            (Some("biometryLockout"), UnlockOutcome::Failed),
            (Some("userFallback"), UnlockOutcome::Failed),
            (Some(""), UnlockOutcome::Failed),
            (Some("unknown"), UnlockOutcome::Failed),
        ];
        for (code, outcome) in rows {
            assert_eq!(outcome_from(*code), *outcome, "{code:?}");
        }
    }

    #[test]
    fn the_answers_cross_the_boundary_in_the_shapes_the_frontend_reads() {
        let status = serde_json::to_value(LockStatus {
            lockable: true,
            biometry: Biometry::Face,
        })
        .unwrap();
        assert_eq!(
            status,
            serde_json::json!({ "lockable": true, "biometry": "face" })
        );
        assert_eq!(
            serde_json::to_value(UnlockOutcome::NoPasscode).unwrap(),
            serde_json::json!("no-passcode")
        );
    }

    #[test]
    fn desktop_is_never_lockable() {
        assert_eq!(
            not_lockable(),
            LockStatus {
                lockable: false,
                biometry: Biometry::None
            }
        );
    }
}
