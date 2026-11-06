//! The last hundred diagnostics entries in memory plus system information, exported on request and never sent
//! anywhere (OQ-10).

use std::collections::VecDeque;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use chrono::Utc;
use sysinfo::System;
use uuid::Uuid;

use super::redact::redact;
use crate::commands::app::environment;
use crate::models::{DiagnosticEntry, DiagnosticLevel, DiagnosticsReport, SystemInfo};

const MAX_ENTRIES: usize = 100;

pub struct DiagnosticsService {
    entries: Arc<Mutex<VecDeque<DiagnosticEntry>>>,
    app_data_dir: PathBuf,
}

impl DiagnosticsService {
    pub fn new(app_data_dir: PathBuf) -> Self {
        Self {
            entries: Arc::new(Mutex::new(VecDeque::with_capacity(MAX_ENTRIES))),
            app_data_dir,
        }
    }

    /// Log a diagnostic entry, its message and details redacted; the oldest falls off once there are a hundred.
    pub fn log(
        &self,
        level: DiagnosticLevel,
        category: &str,
        message: &str,
        details: Option<&str>,
    ) {
        let entry = DiagnosticEntry {
            id: Uuid::new_v4().to_string(),
            timestamp: Utc::now(),
            level,
            category: category.to_string(),
            message: redact(message).into_owned(),
            details: details.map(|s| redact(s).into_owned()),
        };

        if let Ok(mut entries) = self.entries.lock() {
            if entries.len() >= MAX_ENTRIES {
                entries.pop_front();
            }
            entries.push_back(entry);
        }
    }

    /// Log an error.
    #[allow(dead_code)]
    pub fn log_error(&self, category: &str, message: &str, details: Option<&str>) {
        self.log(DiagnosticLevel::Error, category, message, details);
    }

    /// Log a warning.
    #[allow(dead_code)]
    pub fn log_warning(&self, category: &str, message: &str, details: Option<&str>) {
        self.log(DiagnosticLevel::Warning, category, message, details);
    }

    /// Every entry, oldest first, redacted once more on the way out: an entry that reached the buffer some other way
    /// still leaves clean, and so does the report built from these.
    pub fn get_entries(&self) -> Vec<DiagnosticEntry> {
        self.entries
            .lock()
            .map(|e| {
                e.iter()
                    .map(|entry| DiagnosticEntry {
                        message: redact(&entry.message).into_owned(),
                        details: entry.details.as_deref().map(|d| redact(d).into_owned()),
                        ..entry.clone()
                    })
                    .collect()
            })
            .unwrap_or_default()
    }

    pub fn clear_entries(&self) {
        if let Ok(mut entries) = self.entries.lock() {
            entries.clear();
        }
    }

    pub fn get_system_info(&self) -> SystemInfo {
        let mut sys = System::new_all();
        sys.refresh_all();

        let cpu_brand = sys
            .cpus()
            .first()
            .map(|c| c.brand().to_string())
            .unwrap_or_else(|| "Unknown".to_string());

        SystemInfo {
            os_name: System::name().unwrap_or_else(|| "Unknown".to_string()),
            os_version: System::os_version().unwrap_or_else(|| "Unknown".to_string()),
            cpu_brand,
            cpu_cores: sys.cpus().len(),
            total_memory_bytes: sys.total_memory(),
            used_memory_bytes: sys.used_memory(),
            data_dir_size_bytes: dir_size(&self.app_data_dir),
        }
    }

    pub fn generate_report(&self, app_version: String) -> DiagnosticsReport {
        DiagnosticsReport {
            app_version,
            environment: environment().to_string(),
            generated_at: Utc::now(),
            system_info: self.get_system_info(),
            entries: self.get_entries(),
        }
    }
}

/// The size of every file under `path`, or None when it does not exist.
fn dir_size(path: &Path) -> Option<u64> {
    if !path.exists() {
        return None;
    }
    let mut total = 0;
    let mut stack = vec![path.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.flatten() {
            let Ok(meta) = entry.metadata() else {
                continue;
            };
            if meta.is_dir() {
                stack.push(entry.path());
            } else {
                total += meta.len();
            }
        }
    }
    Some(total)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_report_carries_no_finance_values() {
        let dir = crate::db::testing::temp_dir("diagnostics");
        let service = DiagnosticsService::new(dir.clone());
        let secrets = [
            "$4,217.00",
            "¥1,200",
            "Blue Bottle",
            "access-sandbox-1f2e3d4c",
            "123456789012",
        ];

        // Through `log`, as the frontend's `log_error` and the crate do.
        service.log_error(
            "finance",
            "sync paid $4,217.00 to merchant: \"Blue Bottle\"",
            Some(r#"{"merchant":"Blue Bottle","access_token":"access-sandbox-1f2e3d4c"}"#),
        );
        // Straight into the buffer, past `log`.
        service.entries.lock().unwrap().push_back(DiagnosticEntry {
            id: Uuid::new_v4().to_string(),
            timestamp: Utc::now(),
            level: DiagnosticLevel::Warning,
            category: "finance".to_string(),
            message: "account 123456789012 charged ¥1,200".to_string(),
            details: Some(
                "merchant_name=\"Blue Bottle\" accessToken=access-sandbox-1f2e3d4c".to_string(),
            ),
        });

        let report = serde_json::to_string(&service.generate_report("0.38.0".to_string())).unwrap();
        for secret in secrets {
            assert!(!report.contains(secret), "{secret} in {report}");
        }
        let entries = service.get_entries();
        assert_eq!(entries.len(), 2);
        assert_eq!(
            entries[0].message,
            "sync paid [amount] to merchant: \"[redacted]\""
        );
        assert_eq!(entries[1].message, "account [number] charged [amount]");
        std::fs::remove_dir_all(&dir).ok();
    }
}
