use thiserror::Error;

/// The crate's error type. Commands return `Result<T>`, and the error crosses the IPC boundary as its message.
#[derive(Error, Debug)]
pub enum EdenError {
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Tauri error: {0}")]
    Tauri(#[from] tauri::Error),

    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("Invalid operation: {0}")]
    InvalidOperation(String),

    #[allow(dead_code)]
    #[error("Internal lock error")]
    LockPoisoned,
}

impl serde::Serialize for EdenError {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub type Result<T> = std::result::Result<T, EdenError>;
