//! The database key, from the store each platform offers (docs/engineering/data-layer.md, "Storage and key").
//!
//! - **macOS, signed builds**: the Keychain, service `eden.sqlcipher`, account `db_key-<channel>`, so staging and
//!   production on one Mac keep separate keys. A `db.key` left by an earlier build moves into the Keychain on first
//!   launch (`migrate_into_slot`), and the file goes only once the Keychain hands the same key back.
//! - **Windows, Linux and macOS development builds**: a 64-character hex key in `db.key` beside the database, readable
//!   by the owner alone. An unsigned macOS binary loses its Keychain items on every rebuild, as the secret store notes.
//! - **iOS**: the Keychain, device-only and readable after the first unlock; never synced and never moved to a new
//!   device.
//! - **Android**: wrapped by a key the Android Keystore will not export, through `EdenDbKey` (`android/EdenDbKey.kt`).
//!
//! The provider follows `target_os` and not the `desktop` or `mobile` cargo feature, because the right store is a
//! matter of the system, and so a bare `cargo test` compiles with the file provider.
//!
//! One rule holds everywhere: a key that exists but cannot be read is an error. Generating a second key would not
//! match the database that the first one encrypted. And no key ever appears in an error message or a log line.

use std::path::Path;

use crate::error::{EdenError, Result};

/// Returns the stored key, or generates and stores one on first launch.
pub(crate) trait KeyProvider {
    fn get_or_create_key(&self) -> Result<String>;
}

/// One place a key can live outside a file: a Keychain item, or an in-memory fake in tests. `read` answers `None`
/// only when nothing is stored; a key that exists but cannot be read is an error.
#[cfg_attr(
    not(any(test, target_os = "macos", target_os = "ios")),
    allow(dead_code)
)]
pub(crate) trait KeySlot {
    fn read(&self) -> Result<Option<String>>;
    fn write(&self, key: &str) -> Result<()>;
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

#[cfg(target_os = "macos")]
pub(crate) fn for_platform(app_data_dir: &Path) -> Box<dyn KeyProvider> {
    let environment = crate::commands::app::environment();
    if environment == "development" {
        Box::new(FileKeyProvider {
            app_data_dir: app_data_dir.to_path_buf(),
        })
    } else {
        Box::new(MigratingKeychainProvider {
            file: app_data_dir.join("db.key"),
            slot: KeychainKeySlot {
                account: format!("db_key-{environment}"),
            },
        })
    }
}

#[cfg(not(any(target_os = "macos", target_os = "ios", target_os = "android")))]
pub(crate) fn for_platform(app_data_dir: &Path) -> Box<dyn KeyProvider> {
    Box::new(FileKeyProvider {
        app_data_dir: app_data_dir.to_path_buf(),
    })
}

#[cfg(target_os = "ios")]
pub(crate) fn for_platform(_app_data_dir: &Path) -> Box<dyn KeyProvider> {
    Box::new(KeychainKeyProvider {
        slot: KeychainKeySlot {
            account: KEYCHAIN_ACCOUNT_IOS.to_string(),
        },
    })
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

        if let Some(key) = read_key_file(&key_path)? {
            return Ok(key);
        }

        let key = generate_key();
        write_key_file(&key_path, &key)?;
        Ok(key)
    }
}

/// The key in `db.key`, or `None` when the file is missing or holds nothing.
#[cfg(not(any(target_os = "ios", target_os = "android")))]
fn read_key_file(path: &Path) -> Result<Option<String>> {
    if !path.exists() {
        return Ok(None);
    }
    let key = std::fs::read_to_string(path)
        .map_err(|e| EdenError::KeyStorage(format!("failed to read the key file: {e}")))?;
    let key = key.trim();
    Ok((!key.is_empty()).then(|| key.to_string()))
}

// macOS signed builds: the Keychain, with the move from `db.key`.

#[cfg(target_os = "macos")]
struct MigratingKeychainProvider {
    file: std::path::PathBuf,
    slot: KeychainKeySlot,
}

#[cfg(target_os = "macos")]
impl KeyProvider for MigratingKeychainProvider {
    fn get_or_create_key(&self) -> Result<String> {
        migrate_into_slot(&self.file, &self.slot)
    }
}

/// The key for a build that keeps it in `slot`, taking over the `file` an earlier build wrote. The cases, in order:
///
/// 1. only the file: the key is written to the slot and read back; the file goes only when the read-back matches;
/// 2. both, the same key: the leftover file goes (a crash between the write and the removal leaves this);
/// 3. both, different keys: an error, and nothing is removed or overwritten;
/// 4. only the slot: it is used and no file is written;
/// 5. neither (a fresh install): a key is generated straight into the slot.
///
/// Compiled on every desktop host so its tests run on any CI machine; only signed macOS builds call it.
#[cfg(not(any(target_os = "ios", target_os = "android")))]
#[cfg_attr(not(any(test, target_os = "macos")), allow(dead_code))]
fn migrate_into_slot(file: &Path, slot: &dyn KeySlot) -> Result<String> {
    let in_file = read_key_file(file)?;
    let in_slot = slot.read()?;

    match (in_file, in_slot) {
        (Some(key), None) => {
            slot.write(&key).map_err(|e| {
                EdenError::KeyStorage(format!(
                    "could not move the key file into the keychain, so the file stays: {e}"
                ))
            })?;
            let back = slot.read().map_err(|e| {
                EdenError::KeyStorage(format!(
                    "could not read the moved key back from the keychain, so the file stays: {e}"
                ))
            })?;
            if back.as_deref() != Some(key.as_str()) {
                return Err(EdenError::KeyStorage(
                    "the keychain did not hand back the key it was given, so the key file stays"
                        .to_string(),
                ));
            }
            remove_key_file(file);
            Ok(key)
        }
        (Some(key), Some(stored)) if key == stored => {
            remove_key_file(file);
            Ok(stored)
        }
        (Some(_), Some(_)) => Err(EdenError::KeyStorage(
            "the key file and the keychain hold different keys; neither was changed".to_string(),
        )),
        (None, Some(stored)) => Ok(stored),
        (None, None) => {
            let key = generate_key();
            slot.write(&key)?;
            Ok(key)
        }
    }
}

/// Removes a key file whose key the slot already holds. A failure is not fatal: the next launch finds both, the same
/// key in each, and tries again.
#[cfg(not(any(target_os = "ios", target_os = "android")))]
#[cfg_attr(not(any(test, target_os = "macos")), allow(dead_code))]
fn remove_key_file(path: &Path) {
    if let Err(e) = std::fs::remove_file(path) {
        log::warn!("the key is in the keychain, but the old key file could not be removed: {e}");
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

// macOS and iOS: the Keychain slot.

/// Where the key sits in the Keychain. The service is deliberately not the app's identifier (D-69): a change of
/// identifier must not orphan the key. The account is `db_key` on iOS and `db_key-<channel>` on macOS, where staging
/// and production share one Keychain. The item lands in the app's default access group, so no
/// `keychain-access-groups` entitlement is needed.
#[cfg(any(target_os = "macos", target_os = "ios"))]
const KEYCHAIN_SERVICE: &str = "eden.sqlcipher";
#[cfg(target_os = "ios")]
const KEYCHAIN_ACCOUNT_IOS: &str = "db_key";

/// `errSecInteractionNotAllowed`: the item exists but the device has not been unlocked since it started.
/// `security-framework-sys` does not export the constant.
#[cfg(any(target_os = "macos", target_os = "ios"))]
const ERR_SEC_INTERACTION_NOT_ALLOWED: i32 = -25308;

/// One generic password under `KEYCHAIN_SERVICE`, readable after the first unlock and never leaving the device.
#[cfg(any(target_os = "macos", target_os = "ios"))]
struct KeychainKeySlot {
    account: String,
}

#[cfg(any(target_os = "macos", target_os = "ios"))]
impl KeySlot for KeychainKeySlot {
    fn read(&self) -> Result<Option<String>> {
        use security_framework::passwords::get_generic_password;
        use security_framework_sys::base::errSecItemNotFound;

        match get_generic_password(KEYCHAIN_SERVICE, &self.account) {
            Ok(bytes) => String::from_utf8(bytes).map(Some).map_err(|e| {
                EdenError::KeyStorage(format!("the keychain key is not valid UTF-8: {e}"))
            }),
            Err(e) if e.code() == errSecItemNotFound => Ok(None),
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

    fn write(&self, key: &str) -> Result<()> {
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

        let mut options = PasswordOptions::new_generic_password(KEYCHAIN_SERVICE, &self.account);
        options.set_access_control(access_control);

        set_generic_password_options(key.as_bytes(), options).map_err(|e| {
            EdenError::KeyStorage(format!(
                "keychain write failed (OSStatus {}): {e}",
                e.code()
            ))
        })
    }
}

// iOS: the Keychain slot alone.

#[cfg(target_os = "ios")]
struct KeychainKeyProvider {
    slot: KeychainKeySlot,
}

#[cfg(target_os = "ios")]
impl KeyProvider for KeychainKeyProvider {
    fn get_or_create_key(&self) -> Result<String> {
        if let Some(key) = self.slot.read()? {
            return Ok(key);
        }
        let key = generate_key();
        self.slot.write(&key)?;
        Ok(key)
    }
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

    use std::cell::RefCell;

    /// An in-memory slot. `fail_write` refuses every write; `lie_on_read` hands back another key after a write.
    #[derive(Default)]
    struct FakeSlot {
        key: RefCell<Option<String>>,
        fail_write: bool,
        lie_on_read: bool,
        wrote: RefCell<bool>,
    }

    impl FakeSlot {
        fn holding(key: &str) -> Self {
            Self {
                key: RefCell::new(Some(key.to_string())),
                ..Self::default()
            }
        }
    }

    impl KeySlot for FakeSlot {
        fn read(&self) -> Result<Option<String>> {
            if self.lie_on_read && *self.wrote.borrow() {
                return Ok(Some("0".repeat(64)));
            }
            Ok(self.key.borrow().clone())
        }

        fn write(&self, key: &str) -> Result<()> {
            if self.fail_write {
                return Err(EdenError::KeyStorage("keychain write failed".to_string()));
            }
            *self.key.borrow_mut() = Some(key.to_string());
            *self.wrote.borrow_mut() = true;
            Ok(())
        }
    }

    const FILE_KEY: &str = "a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1";
    const SLOT_KEY: &str = "b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2";

    fn with_key_file(name: &str, key: &str) -> (std::path::PathBuf, std::path::PathBuf) {
        let dir = temp_dir(name);
        let file = dir.join("db.key");
        write_key_file(&file, key).unwrap();
        (dir, file)
    }

    fn assert_names_no_key(error: &EdenError) {
        let text = error.to_string();
        assert!(matches!(error, EdenError::KeyStorage(_)), "{text}");
        assert!(!text.contains(FILE_KEY), "{text}");
        assert!(!text.contains(SLOT_KEY), "{text}");
    }

    #[test]
    fn a_file_key_moves_into_the_slot_and_the_file_goes() {
        let (dir, file) = with_key_file("key-move", FILE_KEY);
        let slot = FakeSlot::default();

        assert_eq!(migrate_into_slot(&file, &slot).unwrap(), FILE_KEY);
        assert_eq!(slot.key.borrow().as_deref(), Some(FILE_KEY));
        assert!(!file.exists());
        // The second launch reads the slot alone.
        assert_eq!(migrate_into_slot(&file, &slot).unwrap(), FILE_KEY);
        assert!(!file.exists());

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn a_slot_key_is_used_and_no_file_is_written() {
        let dir = temp_dir("key-slot");
        let file = dir.join("db.key");
        let slot = FakeSlot::holding(SLOT_KEY);

        assert_eq!(migrate_into_slot(&file, &slot).unwrap(), SLOT_KEY);
        assert!(!file.exists());

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn a_leftover_file_that_matches_is_removed() {
        let (dir, file) = with_key_file("key-leftover", SLOT_KEY);
        let slot = FakeSlot::holding(SLOT_KEY);

        assert_eq!(migrate_into_slot(&file, &slot).unwrap(), SLOT_KEY);
        assert!(!file.exists());
        assert_eq!(slot.key.borrow().as_deref(), Some(SLOT_KEY));

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn a_file_and_slot_that_differ_is_an_error_and_both_stay() {
        let (dir, file) = with_key_file("key-differ", FILE_KEY);
        let slot = FakeSlot::holding(SLOT_KEY);

        let error = migrate_into_slot(&file, &slot).unwrap_err();
        assert_names_no_key(&error);
        assert_eq!(std::fs::read_to_string(&file).unwrap(), FILE_KEY);
        assert_eq!(slot.key.borrow().as_deref(), Some(SLOT_KEY));

        std::fs::remove_dir_all(&dir).ok();
    }

    #[test]
    fn a_failed_slot_write_keeps_the_file() {
        for (case, slot) in [
            (
                "write fails",
                FakeSlot {
                    fail_write: true,
                    ..FakeSlot::default()
                },
            ),
            (
                "read-back differs",
                FakeSlot {
                    lie_on_read: true,
                    ..FakeSlot::default()
                },
            ),
        ] {
            let (dir, file) = with_key_file("key-fail", FILE_KEY);

            let error = migrate_into_slot(&file, &slot).unwrap_err();
            assert_names_no_key(&error);
            assert_eq!(std::fs::read_to_string(&file).unwrap(), FILE_KEY, "{case}");

            std::fs::remove_dir_all(&dir).ok();
        }
    }

    #[test]
    fn a_fresh_install_generates_into_the_slot() {
        let dir = temp_dir("key-fresh");
        let file = dir.join("db.key");
        let slot = FakeSlot::default();

        let key = migrate_into_slot(&file, &slot).unwrap();
        assert_eq!(key.len(), 64);
        assert!(key.chars().all(|c| c.is_ascii_hexdigit()));
        assert_eq!(slot.key.borrow().as_deref(), Some(key.as_str()));
        assert!(!file.exists());
        assert_eq!(migrate_into_slot(&file, &slot).unwrap(), key);

        std::fs::remove_dir_all(&dir).ok();
    }
}
