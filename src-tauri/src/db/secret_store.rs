//! The owner's secrets, in the store each platform offers (docs/engineering/gardener.md, D-76): the Gardener's
//! provider key and whatever else must never sit in a table, a bundle or a log.
//!
//! - **macOS and iOS**: the Keychain, device-only and readable after the first unlock; never synced and never moved
//!   to a new device. The item lands in the app's default access group.
//! - **Android**: wrapped by a key the Android Keystore will not export, through `EdenSecrets`
//!   (`android/EdenSecrets.kt`).
//! - **Other desktops**: one file a secret under `<app data dir>/secrets/`, readable by the owner alone.
//!
//! The store follows `target_os` and not the `desktop` or `mobile` cargo feature, because the right store is a matter
//! of the system, and so a bare `cargo test` compiles with the file store. macOS is the one exception: a development
//! build (`EDEN_ENV` unset, `yarn dev`) is unsigned, and the Keychain ties an item to the signature of the binary that
//! wrote it, so every rebuild would lose what the previous one stored. The development build on macOS uses the file
//! store; a signed build uses the Keychain.
//!
//! Two rules hold everywhere: a secret that exists but cannot be read is an error, never overwritten in silence, and
//! nothing here ever writes a secret's value into a message.

use std::path::Path;

use crate::error::{EdenError, Result};
use crate::substrate::ids;

/// A named secret the owner gave this device. Names are resource ids (`anthropic-api-key`); values are trimmed and
/// never empty.
pub trait SecretStore: Send + Sync {
    /// The value, or `None` when the device holds none by that name.
    fn get(&self, name: &str) -> Result<Option<String>>;
    /// Sets or replaces the value.
    fn set(&self, name: &str, value: &str) -> Result<()>;
    /// Removes the secret. Answers whether there was one.
    fn delete(&self, name: &str) -> Result<bool>;
}

fn refused(detail: impl std::fmt::Display) -> EdenError {
    EdenError::Refused(format!("secret:invalid: {detail}"))
}

fn check_name(name: &str) -> Result<()> {
    if ids::is_resource_id(name) {
        Ok(())
    } else {
        Err(refused(format!("not a secret name: {name:?}")))
    }
}

/// The value as it is kept: trimmed, and not nothing.
fn check_value(value: &str) -> Result<&str> {
    let value = value.trim();
    if value.is_empty() {
        return Err(refused("a secret is not empty"));
    }
    Ok(value)
}

#[cfg(target_os = "macos")]
pub(crate) fn for_platform(app_data_dir: &Path) -> Box<dyn SecretStore> {
    if crate::commands::app::environment() == "development" {
        Box::new(FileSecretStore::new(app_data_dir))
    } else {
        Box::new(KeychainSecretStore)
    }
}

#[cfg(not(any(target_os = "macos", target_os = "ios", target_os = "android")))]
pub(crate) fn for_platform(app_data_dir: &Path) -> Box<dyn SecretStore> {
    Box::new(FileSecretStore::new(app_data_dir))
}

#[cfg(target_os = "ios")]
pub(crate) fn for_platform(_app_data_dir: &Path) -> Box<dyn SecretStore> {
    Box::new(KeychainSecretStore)
}

#[cfg(target_os = "android")]
pub(crate) fn for_platform(_app_data_dir: &Path) -> Box<dyn SecretStore> {
    Box::new(AndroidKeystoreSecretStore)
}

// Desktop: a file a secret.

/// One file a secret under `secrets/`, mode 0600 in a 0700 directory where the system has modes.
#[cfg(not(any(target_os = "ios", target_os = "android")))]
pub(crate) struct FileSecretStore {
    dir: std::path::PathBuf,
}

#[cfg(not(any(target_os = "ios", target_os = "android")))]
impl FileSecretStore {
    pub(crate) fn new(app_data_dir: &Path) -> Self {
        Self {
            dir: app_data_dir.join("secrets"),
        }
    }

    fn path(&self, name: &str) -> Result<std::path::PathBuf> {
        check_name(name)?;
        Ok(self.dir.join(name))
    }

    fn ensure_dir(&self) -> Result<()> {
        let mut builder = std::fs::DirBuilder::new();
        builder.recursive(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::DirBuilderExt;
            builder.mode(0o700);
        }
        builder.create(&self.dir).map_err(|e| {
            EdenError::KeyStorage(format!("failed to create the secrets directory: {e}"))
        })
    }
}

#[cfg(not(any(target_os = "ios", target_os = "android")))]
impl SecretStore for FileSecretStore {
    fn get(&self, name: &str) -> Result<Option<String>> {
        let path = self.path(name)?;
        if !path.exists() {
            return Ok(None);
        }
        let value = std::fs::read_to_string(&path)
            .map_err(|e| EdenError::KeyStorage(format!("failed to read the secret {name}: {e}")))?;
        let value = value.trim();
        if value.is_empty() {
            return Err(EdenError::KeyStorage(format!(
                "the secret {name} exists but holds nothing"
            )));
        }
        Ok(Some(value.to_string()))
    }

    fn set(&self, name: &str, value: &str) -> Result<()> {
        let path = self.path(name)?;
        let value = check_value(value)?;
        self.ensure_dir()?;
        let mut options = std::fs::OpenOptions::new();
        options.write(true).create(true).truncate(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let wrap = |e| EdenError::KeyStorage(format!("failed to write the secret {name}: {e}"));
        let mut file = options.open(&path).map_err(wrap)?;
        std::io::Write::write_all(&mut file, value.as_bytes()).map_err(wrap)?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600)).map_err(
                |e| {
                    EdenError::KeyStorage(format!(
                        "failed to set the permissions of the secret {name}: {e}"
                    ))
                },
            )?;
        }
        Ok(())
    }

    fn delete(&self, name: &str) -> Result<bool> {
        let path = self.path(name)?;
        match std::fs::remove_file(&path) {
            Ok(()) => Ok(true),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(false),
            Err(e) => Err(EdenError::KeyStorage(format!(
                "failed to remove the secret {name}: {e}"
            ))),
        }
    }
}

// macOS and iOS: the Keychain.

#[cfg(any(target_os = "macos", target_os = "ios"))]
struct KeychainSecretStore;

/// Where the secrets sit in the Keychain: one generic password a secret, its name the account. The service is
/// deliberately not the app's identifier (D-69): a change of identifier must not orphan them.
#[cfg(any(target_os = "macos", target_os = "ios"))]
const KEYCHAIN_SERVICE: &str = "eden.secrets";

/// `errSecInteractionNotAllowed`: the item exists but the device has not been unlocked since it started.
/// `security-framework-sys` does not export the constant.
#[cfg(any(target_os = "macos", target_os = "ios"))]
const ERR_SEC_INTERACTION_NOT_ALLOWED: i32 = -25308;

#[cfg(any(target_os = "macos", target_os = "ios"))]
fn keychain_error(what: &str, e: security_framework::base::Error) -> EdenError {
    if e.code() == ERR_SEC_INTERACTION_NOT_ALLOWED {
        return EdenError::KeyStorage(
            "the keychain is locked (the device has not been unlocked since it started)"
                .to_string(),
        );
    }
    EdenError::KeyStorage(format!(
        "keychain {what} failed (OSStatus {}): {e}",
        e.code()
    ))
}

#[cfg(any(target_os = "macos", target_os = "ios"))]
impl SecretStore for KeychainSecretStore {
    fn get(&self, name: &str) -> Result<Option<String>> {
        use security_framework::passwords::get_generic_password;
        use security_framework_sys::base::errSecItemNotFound;

        check_name(name)?;
        match get_generic_password(KEYCHAIN_SERVICE, name) {
            Ok(bytes) => String::from_utf8(bytes).map(Some).map_err(|e| {
                EdenError::KeyStorage(format!(
                    "the keychain secret {name} is not valid UTF-8: {e}"
                ))
            }),
            Err(e) if e.code() == errSecItemNotFound => Ok(None),
            Err(e) => Err(keychain_error("read", e)),
        }
    }

    fn set(&self, name: &str, value: &str) -> Result<()> {
        use security_framework::access_control::{ProtectionMode, SecAccessControl};
        use security_framework::passwords::{set_generic_password_options, PasswordOptions};

        check_name(name)?;
        let value = check_value(value)?;
        let access_control = SecAccessControl::create_with_protection(
            Some(ProtectionMode::AccessibleAfterFirstUnlockThisDeviceOnly),
            0, // accessibility only: no biometry or passcode constraint
        )
        .map_err(|e| keychain_error("access control", e))?;
        let mut options = PasswordOptions::new_generic_password(KEYCHAIN_SERVICE, name);
        options.set_access_control(access_control);
        set_generic_password_options(value.as_bytes(), options)
            .map_err(|e| keychain_error("write", e))
    }

    fn delete(&self, name: &str) -> Result<bool> {
        use security_framework::passwords::delete_generic_password;
        use security_framework_sys::base::errSecItemNotFound;

        check_name(name)?;
        match delete_generic_password(KEYCHAIN_SERVICE, name) {
            Ok(()) => Ok(true),
            Err(e) if e.code() == errSecItemNotFound => Ok(false),
            Err(e) => Err(keychain_error("delete", e)),
        }
    }
}

// Android: the Keystore, through Kotlin.

/// The JNI name of the Kotlin helper. It follows the Android namespace, which follows the app's identifier (D-69):
/// this constant and the `package` line of `gen/android/app/src/main/java/com/palekodama/eden/EdenSecrets.kt` change
/// together, never alone.
#[cfg(target_os = "android")]
const SECRETS_CLASS: &str = "com/palekodama/eden/EdenSecrets";

#[cfg(target_os = "android")]
struct AndroidKeystoreSecretStore;

#[cfg(target_os = "android")]
impl AndroidKeystoreSecretStore {
    /// Runs `f` with a JNI environment attached to this thread and the app's Context. Kotlin owns the wrapping;
    /// whatever it throws (a locked Keystore, a blob that will not decrypt) arrives here as a `KeyStorage` error.
    fn with_env<T>(
        &self,
        f: impl FnOnce(&mut jni::JNIEnv<'_>, &jni::objects::JObject<'_>) -> Result<T>,
    ) -> Result<T> {
        use jni::objects::JObject;
        use jni::JavaVM;

        let wrap = |message: String| EdenError::KeyStorage(format!("android keystore: {message}"));

        // The Tauri runtime fills `ndk_context` when the Activity is created, before `setup` runs.
        let ctx = ndk_context::android_context();
        // SAFETY: `vm()` and `context()` are handles the runtime owns for the life of the process.
        let vm = unsafe { JavaVM::from_raw(ctx.vm().cast()) }
            .map_err(|e| wrap(format!("JavaVM: {e}")))?;
        let mut env = vm
            .attach_current_thread()
            .map_err(|e| wrap(format!("attach: {e}")))?;
        let context = unsafe { JObject::from_raw(ctx.context().cast()) };

        let result = f(&mut env, &context);

        // A Java exception left pending would abort the next JNI call; describe it to logcat and clear it.
        if result.is_err() && env.exception_check().unwrap_or(false) {
            let _ = env.exception_describe();
            let _ = env.exception_clear();
        }
        result
    }
}

#[cfg(target_os = "android")]
impl SecretStore for AndroidKeystoreSecretStore {
    fn get(&self, name: &str) -> Result<Option<String>> {
        use jni::objects::{JString, JValue};

        check_name(name)?;
        self.with_env(|env, context| {
            let wrap =
                |message: String| EdenError::KeyStorage(format!("android keystore: {message}"));
            let name = env
                .new_string(name)
                .map_err(|e| wrap(format!("name: {e}")))?;
            let value = env
                .call_static_method(
                    SECRETS_CLASS,
                    "get",
                    "(Landroid/content/Context;Ljava/lang/String;)Ljava/lang/String;",
                    &[JValue::Object(context), JValue::Object(&name)],
                )
                .map_err(|e| wrap(format!("EdenSecrets.get failed: {e}")))?;
            let object = value.l().map_err(|e| wrap(format!("value object: {e}")))?;
            if object.is_null() {
                return Ok(None);
            }
            let value: String = env
                .get_string(&JString::from(object))
                .map_err(|e| wrap(format!("value decode: {e}")))?
                .into();
            Ok(Some(value))
        })
    }

    fn set(&self, name: &str, value: &str) -> Result<()> {
        use jni::objects::JValue;

        check_name(name)?;
        let value = check_value(value)?;
        self.with_env(|env, context| {
            let wrap =
                |message: String| EdenError::KeyStorage(format!("android keystore: {message}"));
            let name = env
                .new_string(name)
                .map_err(|e| wrap(format!("name: {e}")))?;
            let value = env
                .new_string(value)
                .map_err(|e| wrap(format!("value: {e}")))?;
            env.call_static_method(
                SECRETS_CLASS,
                "set",
                "(Landroid/content/Context;Ljava/lang/String;Ljava/lang/String;)V",
                &[
                    JValue::Object(context),
                    JValue::Object(&name),
                    JValue::Object(&value),
                ],
            )
            .map_err(|e| wrap(format!("EdenSecrets.set failed: {e}")))?;
            Ok(())
        })
    }

    fn delete(&self, name: &str) -> Result<bool> {
        use jni::objects::JValue;

        check_name(name)?;
        self.with_env(|env, context| {
            let wrap =
                |message: String| EdenError::KeyStorage(format!("android keystore: {message}"));
            let name = env
                .new_string(name)
                .map_err(|e| wrap(format!("name: {e}")))?;
            let value = env
                .call_static_method(
                    SECRETS_CLASS,
                    "delete",
                    "(Landroid/content/Context;Ljava/lang/String;)Z",
                    &[JValue::Object(context), JValue::Object(&name)],
                )
                .map_err(|e| wrap(format!("EdenSecrets.delete failed: {e}")))?;
            value.z().map_err(|e| wrap(format!("delete answer: {e}")))
        })
    }
}

// The file store is the only one a desktop or CI host can run.
#[cfg(all(test, not(any(target_os = "ios", target_os = "android"))))]
mod tests {
    use super::*;
    use crate::db::testing::temp_dir;

    #[test]
    fn a_secret_is_set_read_and_deleted() {
        let dir = temp_dir("secrets");
        let store = FileSecretStore::new(&dir);

        assert_eq!(store.get("anthropic-api-key").unwrap(), None);
        store.set("anthropic-api-key", "  sk-ant-test-1  ").unwrap();
        assert_eq!(
            store.get("anthropic-api-key").unwrap().as_deref(),
            Some("sk-ant-test-1")
        );
        store.set("anthropic-api-key", "sk-ant-test-2").unwrap();
        assert_eq!(
            store.get("anthropic-api-key").unwrap().as_deref(),
            Some("sk-ant-test-2")
        );

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = |path: &Path| std::fs::metadata(path).unwrap().permissions().mode() & 0o777;
            assert_eq!(mode(&dir.join("secrets").join("anthropic-api-key")), 0o600);
            assert_eq!(mode(&dir.join("secrets")), 0o700);
        }

        assert!(store.delete("anthropic-api-key").unwrap());
        assert!(!store.delete("anthropic-api-key").unwrap());
        assert_eq!(store.get("anthropic-api-key").unwrap(), None);

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn an_invalid_name_or_an_empty_value_is_refused() {
        let dir = temp_dir("secrets-refused");
        let store = FileSecretStore::new(&dir);
        for bad in ["", "Anthropic", "../db.key", "a.b", "key_1"] {
            for result in [
                store.get(bad).map(|_| ()),
                store.set(bad, "x"),
                store.delete(bad).map(|_| ()),
            ] {
                let message = result.expect_err(bad).to_string();
                assert!(message.starts_with("secret:invalid: "), "{message}");
            }
        }
        let message = store
            .set("anthropic-api-key", "   ")
            .expect_err("empty")
            .to_string();
        assert!(message.starts_with("secret:invalid: "));
        assert!(!dir.join("secrets").exists());
        std::fs::remove_dir_all(&dir).ok();
    }

    /// A file that is there and will not open is an error, not a missing secret: nothing overwrites it.
    #[cfg(unix)]
    #[test]
    fn a_secret_that_cannot_be_read_is_an_error() {
        use std::os::unix::fs::PermissionsExt;

        if unsafe { libc_geteuid() } == 0 {
            // Root reads anything; there is nothing to check.
            return;
        }
        let dir = temp_dir("secrets-unreadable");
        let store = FileSecretStore::new(&dir);
        store.set("anthropic-api-key", "sk-ant-test").unwrap();
        let path = dir.join("secrets").join("anthropic-api-key");
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o000)).unwrap();

        assert!(matches!(
            store.get("anthropic-api-key"),
            Err(EdenError::KeyStorage(_))
        ));
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600)).unwrap();
        assert_eq!(
            store.get("anthropic-api-key").unwrap().as_deref(),
            Some("sk-ant-test")
        );
        std::fs::remove_dir_all(&dir).ok();
    }

    #[cfg(unix)]
    extern "C" {
        #[link_name = "geteuid"]
        fn libc_geteuid() -> u32;
    }
}
