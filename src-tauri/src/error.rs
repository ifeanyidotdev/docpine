use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Error, Serialize, Deserialize, Clone)]
#[serde(tag = "code", content = "message", rename_all = "snake_case")]
pub enum AppError {
    #[error("Connection error: {0}")]
    Connection(String),

    #[error("Query execution error: {0}")]
    Query(String),

    #[error("Validation error: {0}")]
    Validation(String),

    #[error("Safety guard blocked operation: {0}")]
    SafetyBlocked(String),

    #[error("Confirmation required: {0}")]
    ConfirmationRequired(String),

    #[error("Storage error: {0}")]
    Storage(String),

    #[error("SSH tunnel error: {0}")]
    SshTunnel(String),

    #[error("IO error: {0}")]
    Io(String),

    #[error("Workspace not found: {0}")]
    NotFound(String),
}

pub type AppResult<T> = Result<T, AppError>;

impl From<rusqlite::Error> for AppError {
    fn from(err: rusqlite::Error) -> Self {
        AppError::Storage(err.to_string())
    }
}

impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        AppError::Io(err.to_string())
    }
}

impl From<serde_json::Error> for AppError {
    fn from(err: serde_json::Error) -> Self {
        AppError::Validation(err.to_string())
    }
}
