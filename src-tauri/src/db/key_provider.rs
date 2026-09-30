//! The database key, from the store each platform offers (docs/engineering/data-layer.md, "Storage and key").
//!
//! - **Desktop**: a 64-character hex key in `db.key` beside the database, readable by the owner alone.
//! - **iOS**: the Keychain, device-only and readable after the first unlock; never synced and never moved to a new
//!   device.
//! - **Android**: wrapped by a key the Android Keystore will not export, through `EdenDbKey` (`android/EdenDbKey.kt`).
//!
//! The provider follows `target_os` and not the `desktop` or `mobile` cargo feature, because the right store is a
//! matter of the system, and so a bare `cargo test` compiles with the file provider.
//!
//! One rule holds everywhere: a key that exists but cannot be read is an error. Generating a second key would not
//! match the database that the first one encrypted.

use std::path::Path;

use crate::error::{EdenError, Result};

/// Returns the stored key, or generates and stores one on first launch.
pub(crate) trait KeyProvider {
    fn get_or_create_key(&self) -> Result<String>;
}

/// A fresh 64-character hex key: two v4 UUIDs, from the system's random source. Android generates its own in Kotlin.
#[cfg(not(target_os = "android"))]
fn generate_key() -> String {
    format!(
        "{}{}",
        uuid::Uuid::new_v4().as_simple(),
        uuid::Uuid::new_v4().as_simple()
    )
}

#[cfg(not(any(target_os = "ios", target_os = "android")))]
pub(crate) fn for_platform(app_data_dir: &Path) -> Box<dyn KeyProvider> {
    Box::new(FileKeyProvider {
        app_data_dir: app_data_dir.to_path_buf(),
    })
}

#[cfg(target_os = "ios")]
pub(crate) fn for_platform(_app_data_dir: &Path) -> Box<dyn KeyProvider> {
    Box::new(KeychainKeyProvider)
}

#[cfg(target_os = "android")]
pub(crate) fn for_platform(_app_data_dir: &Path) -> Box<dyn KeyProvider> {
    Box::new(AndroidKeystoreKeyProvider)
}

// Desktop: a key file.

#[cfg(not(any(target_os = "ios", target_os = "android")))]
struct FileKeyProvider {
    app_data_dir: std::path::PathBuf,
}

#[cfg(not(any(target_os = "ios", target_os = "android")))]
impl KeyProvider for FileKeyProvider {
    fn get_or_create_key(&self) -> Result<String> {
        let key_path = self.app_data_dir.join("db.key");

        if key_path.exists() {
            let key = std::fs::read_to_string(&key_path)
                .map_err(|e| EdenError::KeyStorage(format!("failed to read the key file: {e}")))?;
            let key = key.trim().to_string();
            if !key.is_empty() {
                return Ok(key);
            }
        }

        let key = generate_key();
        write_key_file(&key_path, &key)?;
        Ok(key)
    }
}

#[cfg(not(any(target_os = "ios", target_os = "android")))]
fn write_key_file(path: &Path, key: &str) -> Result<()> {
    std::fs::write(path, key)
        .map_err(|e| EdenError::KeyStorage(format!("failed to write the key file: {e}")))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600)).map_err(|e| {
            EdenError::KeyStorage(format!("failed to set the key file's permissions: {e}"))
        })?;
    }

    Ok(())
}

// iOS: the Keychain.

#[cfg(target_os = "ios")]
struct KeychainKeyProvider;

/// Where the key sits in the Keychain. The service is deliberately not the app's identifier (D-69): a change of
/// identifier must not orphan the key. The item lands in the app's default access group, so no
/// `keychain-access-groups` entitlement is needed.
#[cfg(target_os = "ios")]
const KEYCHAIN_SERVICE: &str = "eden.sqlcipher";
#[cfg(target_os = "ios")]
const KEYCHAIN_ACCOUNT: &str = "db_key";

/// `errSecInteractionNotAllowed`: the item exists but the device has not been unlocked since it started.
/// `security-framework-sys` does not export the constant.
#[cfg(target_os = "ios")]
const ERR_SEC_INTERACTION_NOT_ALLOWED: i32 = -25308;

#[cfg(target_os = "ios")]
impl KeyProvider for KeychainKeyProvider {
    fn get_or_create_key(&self) -> Result<String> {
        use security_framework::passwords::get_generic_password;
        use security_framework_sys::base::errSecItemNotFound;

        match get_generic_password(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT) {
            Ok(bytes) => String::from_utf8(bytes).map_err(|e| {
                EdenError::KeyStorage(format!("the keychain key is not valid UTF-8: {e}"))
            }),
            Err(e) if e.code() == errSecItemNotFound => {
                let key = generate_key();
                store_key(&key)?;
                Ok(key)
            }
            Err(e) if e.code() == ERR_SEC_INTERACTION_NOT_ALLOWED => Err(EdenError::KeyStorage(
                "the keychain is locked (the device has not been unlocked since it started)"
                    .to_string(),
            )),
            Err(e) => Err(EdenError::KeyStorage(format!(
                "keychain read failed (OSStatus {}): {e}",
                e.code()
            ))),
        }
    }
}

#[cfg(target_os = "ios")]
fn store_key(key: &str) -> Result<()> {
    use security_framework::access_control::{ProtectionMode, SecAccessControl};
    use security_framework::passwords::{set_generic_password_options, PasswordOptions};

    let access_control = SecAccessControl::create_with_protection(
        Some(ProtectionMode::AccessibleAfterFirstUnlockThisDeviceOnly),
        0, // accessibility only: no biometry or passcode constraint
    )
    .map_err(|e| {
        EdenError::KeyStorage(format!(
            "failed to create the keychain access control (OSStatus {}): {e}",
            e.code()
        ))
    })?;

    let mut options = PasswordOptions::new_generic_password(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);
    options.set_access_control(access_control);

    set_generic_password_options(key.as_bytes(), options).map_err(|e| {
        EdenError::KeyStorage(format!(
            "keychain write failed (OSStatus {}): {e}",
            e.code()
        ))
    })
}

// Android: the Keystore, through Kotlin.

/// The JNI name of the Kotlin helper. It follows the Android namespace, which follows the app's identifier (D-69):
/// this constant and the `package` line of `gen/android/app/src/main/java/com/palekodama/eden/EdenDbKey.kt` change
/// together, never alone.
#[cfg(target_os = "android")]
const DB_KEY_CLASS: &str = "com/palekodama/eden/EdenDbKey";

#[cfg(target_os = "android")]
struct AndroidKeystoreKeyProvider;

#[cfg(target_os = "android")]
impl KeyProvider for AndroidKeystoreKeyProvider {
    /// Calls `EdenDbKey.getOrCreateKey(context)`. Kotlin owns the generation and the wrapping; whatever it throws
    /// (a locked Keystore, a blob that will not decrypt) arrives here as a `KeyStorage` error.
    fn get_or_create_key(&self) -> Result<String> {
        use jni::objects::{JObject, JString, JValue};
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

        let result = (|| -> Result<String> {
            let value = env
                .call_static_method(
                    DB_KEY_CLASS,
                    "getOrCreateKey",
                    "(Landroid/content/Context;)Ljava/lang/String;",
                    &[JValue::Object(&context)],
                )
                .map_err(|e| wrap(format!("EdenDbKey.getOrCreateKey failed: {e}")))?;
            let object = value.l().map_err(|e| wrap(format!("key object: {e}")))?;
            let key: String = env
                .get_string(&JString::from(object))
                .map_err(|e| wrap(format!("key decode: {e}")))?
                .into();
            if key.is_empty() {
                return Err(wrap("returned an empty key".to_string()));
            }
            Ok(key)
        })();

        // A Java exception left pending would abort the next JNI call; describe it to logcat and clear it.
        if result.is_err() && env.exception_check().unwrap_or(false) {
            let _ = env.exception_describe();
            let _ = env.exception_clear();
        }
        result
    }
}

// The file provider is the only one a desktop or CI host can run.
#[cfg(all(test, not(any(target_os = "ios", target_os = "android"))))]
mod tests {
    use super::*;
    use crate::db::testing::temp_dir;

    #[test]
    fn the_file_provider_generates_a_key_once_and_reuses_it() {
        let dir = temp_dir("key");
        let provider = for_platform(&dir);

        let first = provider.get_or_create_key().unwrap();
        assert_eq!(first.len(), 64);
        assert!(first.chars().all(|c| c.is_ascii_hexdigit()));
        assert_eq!(provider.get_or_create_key().unwrap(), first);

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = std::fs::metadata(dir.join("db.key"))
                .unwrap()
                .permissions()
                .mode();
            assert_eq!(mode & 0o777, 0o600);
        }

        std::fs::remove_dir_all(&dir).ok();
    }
}
