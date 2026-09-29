//! The last hundred diagnostics entries in memory plus system information, exported on request and never sent
//! anywhere (OQ-10).

use std::collections::VecDeque;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use chrono::Utc;
use sysinfo::System;
use uuid::Uuid;

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

    /// Log a diagnostic entry; the oldest falls off once there are a hundred.
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
            message: message.to_string(),
            details: details.map(|s| s.to_string()),
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

    /// Every entry, oldest first.
    pub fn get_entries(&self) -> Vec<DiagnosticEntry> {
        self.entries
            .lock()
            .map(|e| e.iter().cloned().collect())
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
