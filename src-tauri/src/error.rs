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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_app_error_json_serialization() {
        let err = AppError::SafetyBlocked("DROP TABLE not permitted".to_string());
        let json = serde_json::to_string(&err).expect("serialize error");
        assert_eq!(
            json,
            r#"{"code":"safety_blocked","message":"DROP TABLE not permitted"}"#
        );

        let deserialized: AppError = serde_json::from_str(&json).expect("deserialize error");
        match deserialized {
            AppError::SafetyBlocked(msg) => assert_eq!(msg, "DROP TABLE not permitted"),
            _ => panic!("Expected SafetyBlocked variant"),
        }
    }

    #[test]
    fn test_app_error_display_formatting() {
        let err = AppError::Connection("Connection timed out".to_string());
        assert_eq!(format!("{err}"), "Connection error: Connection timed out");

        let err = AppError::NotFound("ws-123".to_string());
        assert_eq!(format!("{err}"), "Workspace not found: ws-123");

        let err = AppError::Validation("Port must be positive".to_string());
        assert_eq!(format!("{err}"), "Validation error: Port must be positive");
    }

    #[test]
    fn test_app_error_from_conversions() {
        let io_err = std::io::Error::new(std::io::ErrorKind::NotFound, "file not found");
        let app_err: AppError = io_err.into();
        match app_err {
            AppError::Io(msg) => assert!(msg.contains("file not found")),
            _ => panic!("Expected Io variant"),
        }

        let json_err = serde_json::from_str::<i32>("not_a_number").unwrap_err();
        let app_err: AppError = json_err.into();
        match app_err {
            AppError::Validation(msg) => assert!(!msg.is_empty()),
            _ => panic!("Expected Validation variant"),
        }
    }
}
