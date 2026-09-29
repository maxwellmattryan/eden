//! The domain document store: one JSON document per domain at `<app_data_dir>/domains/<id>.json`, behind
//! `@eden/shared/persistence`. It holds what stays on this device and out of every export: the Garden's feed until
//! signals exist, and Sky's mirror. The owner's data lives in the workspace database (docs/engineering/data-layer.md);
//! a domain that moved there has its old document imported once and removed. The frontend owns each document's
//! shape and version; this side reads and writes it whole, and writes atomically (to `<id>.json.tmp`, then a
//! rename) so a crash mid-write never leaves a truncated document behind.
use std::path::PathBuf;

use tauri::{AppHandle, Manager};

use crate::error::{EdenError, Result};

/// A plain domain id: lowercase ASCII letters, digits and hyphens, starting with a letter (`kitchen`, `toolbench`).
fn is_domain_id(domain: &str) -> bool {
    let mut chars = domain.chars();
    matches!(chars.next(), Some(first) if first.is_ascii_lowercase())
        && chars.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

fn document_path(app: &AppHandle, domain: &str) -> Result<PathBuf> {
    if !is_domain_id(domain) {
        return Err(EdenError::InvalidOperation(format!(
            "not a domain id: {domain:?}"
        )));
    }
    Ok(app
        .path()
        .app_data_dir()?
        .join("domains")
        .join(format!("{domain}.json")))
}

/// The domain's document, or `None` when it has never been saved.
#[tauri::command]
pub async fn load_domain_document(
    app: AppHandle,
    domain: String,
) -> Result<Option<serde_json::Value>> {
    let path = document_path(&app, &domain)?;
    match std::fs::read(&path) {
        Ok(bytes) => Ok(Some(serde_json::from_slice(&bytes)?)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.into()),
    }
}

/// Removes the domain's document, once its contents are in the workspace database. Removing one that is not there
/// changes nothing.
#[tauri::command]
pub async fn remove_domain_document(app: AppHandle, domain: String) -> Result<()> {
    match std::fs::remove_file(document_path(&app, &domain)?) {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.into()),
        _ => Ok(()),
    }
}

/// Replaces the domain's document, creating the `domains` directory on first use.
#[tauri::command]
pub async fn save_domain_document(
    app: AppHandle,
    domain: String,
    document: serde_json::Value,
) -> Result<()> {
    let path = document_path(&app, &domain)?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, serde_json::to_vec_pretty(&document)?)?;
    std::fs::rename(&tmp, &path)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::is_domain_id;

    #[test]
    fn accepts_plain_ids_only() {
        assert!(is_domain_id("kitchen"));
        assert!(is_domain_id("toolbench-2"));
        assert!(!is_domain_id(""));
        assert!(!is_domain_id("Kitchen"));
        assert!(!is_domain_id("../etc"));
        assert!(!is_domain_id("kitchen.json"));
    }
}
