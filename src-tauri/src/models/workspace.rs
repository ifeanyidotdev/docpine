use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DatabaseEngine {
    Postgres,
    Mysql,
    Mongodb,
}

impl DatabaseEngine {
    pub fn default_port(&self) -> u16 {
        match self {
            DatabaseEngine::Postgres => 5432,
            DatabaseEngine::Mysql => 3306,
            DatabaseEngine::Mongodb => 27017,
        }
    }

    pub fn is_nosql(&self) -> bool {
        matches!(self, DatabaseEngine::Mongodb)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EnvironmentTag {
    Production,
    Staging,
    Development,
    Local,
}

impl Default for EnvironmentTag {
    fn default() -> Self {
        EnvironmentTag::Development
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SafetyMode {
    Standard,
    Safe,
    ReadOnly,
}

impl Default for SafetyMode {
    fn default() -> Self {
        SafetyMode::Safe
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CommitMode {
    Staged,
    Immediate,
}

impl Default for CommitMode {
    fn default() -> Self {
        CommitMode::Staged
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SslConfig {
    pub enabled: bool,
    pub reject_unauthorized: bool,
    pub ca_cert_path: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SshAuthMethod {
    Password,
    PrivateKey,
}

impl Default for SshAuthMethod {
    fn default() -> Self {
        SshAuthMethod::Password
    }
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SshTunnelConfig {
    pub enabled: bool,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth_method: SshAuthMethod,
    pub private_key_path: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceCredentials {
    pub db_password: Option<String>,
    pub ssh_password: Option<String>,
    pub ssh_passphrase: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceFolder {
    pub id: String,
    pub name: String,
    pub color: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveWorkspaceFolderInput {
    pub id: Option<String>,
    pub name: String,
    pub color: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceConfig {
    pub id: String,
    pub name: String,
    pub engine: DatabaseEngine,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub default_database: String,
    pub connection_uri: Option<String>,
    pub environment: EnvironmentTag,
    pub accent_color: String,
    pub safety_mode: SafetyMode,
    pub commit_mode: CommitMode,
    pub ssl: SslConfig,
    pub ssh: SshTunnelConfig,
    #[serde(default)]
    pub folder_id: Option<String>,
    pub created_at: String,
    pub last_opened_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveWorkspaceInput {
    pub id: Option<String>,
    pub name: String,
    pub engine: DatabaseEngine,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub default_database: String,
    pub connection_uri: Option<String>,
    pub environment: EnvironmentTag,
    pub accent_color: String,
    pub safety_mode: SafetyMode,
    pub commit_mode: CommitMode,
    pub ssl: SslConfig,
    pub ssh: SshTunnelConfig,
    #[serde(default)]
    pub folder_id: Option<String>,
    pub credentials: WorkspaceCredentials,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedConnectionUri {
    pub engine: DatabaseEngine,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub password: Option<String>,
    pub database: String,
    pub ssl_enabled: bool,
    pub raw_uri: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_database_engine_default_ports_and_nosql() {
        assert_eq!(DatabaseEngine::Postgres.default_port(), 5432);
        assert_eq!(DatabaseEngine::Mysql.default_port(), 3306);
        assert_eq!(DatabaseEngine::Mongodb.default_port(), 27017);

        assert!(!DatabaseEngine::Postgres.is_nosql());
        assert!(!DatabaseEngine::Mysql.is_nosql());
        assert!(DatabaseEngine::Mongodb.is_nosql());
    }

    #[test]
    fn test_models_default_values() {
        assert_eq!(EnvironmentTag::default(), EnvironmentTag::Development);
        assert_eq!(SafetyMode::default(), SafetyMode::Safe);
        assert_eq!(CommitMode::default(), CommitMode::Staged);
        assert_eq!(SshAuthMethod::default(), SshAuthMethod::Password);
    }

    #[test]
    fn test_workspace_config_serde_roundtrip() {
        let ws = WorkspaceConfig {
            id: "ws-1".to_string(),
            name: "Production PG".to_string(),
            engine: DatabaseEngine::Postgres,
            host: "postgres.internal".to_string(),
            port: 5432,
            username: "app_user".to_string(),
            default_database: "billing".to_string(),
            connection_uri: Some("postgres://app_user@postgres.internal:5432/billing".to_string()),
            environment: EnvironmentTag::Production,
            accent_color: "#ef4444".to_string(),
            safety_mode: SafetyMode::ReadOnly,
            commit_mode: CommitMode::Staged,
            ssl: SslConfig {
                enabled: true,
                reject_unauthorized: true,
                ca_cert_path: Some("/etc/ssl/ca.pem".to_string()),
            },
            ssh: SshTunnelConfig {
                enabled: false,
                host: String::new(),
                port: 22,
                username: String::new(),
                auth_method: SshAuthMethod::Password,
                private_key_path: None,
            },
            folder_id: Some("folder-billing".to_string()),
            created_at: "2026-11-17T10:00:00Z".to_string(),
            last_opened_at: Some("2026-11-17T11:00:00Z".to_string()),
        };

        let json = serde_json::to_string(&ws).expect("serialize workspace config");
        assert!(json.contains("\"defaultDatabase\":\"billing\""));
        assert!(json.contains("\"safetyMode\":\"read_only\""));
        assert!(json.contains("\"commitMode\":\"staged\""));
        assert!(json.contains("\"environment\":\"production\""));

        let deserialized: WorkspaceConfig =
            serde_json::from_str(&json).expect("deserialize workspace config");
        assert_eq!(deserialized, ws);
    }

    #[test]
    fn test_save_workspace_input_serde() {
        let input_json = r##"{
            "id": null,
            "name": "Local Mongo",
            "engine": "mongodb",
            "host": "localhost",
            "port": 27017,
            "username": "root",
            "defaultDatabase": "analytics",
            "connectionUri": null,
            "environment": "local",
            "accentColor": "#10b981",
            "safetyMode": "standard",
            "commitMode": "immediate",
            "ssl": {
                "enabled": false,
                "rejectUnauthorized": false,
                "caCertPath": null
            },
            "ssh": {
                "enabled": false,
                "host": "",
                "port": 22,
                "username": "",
                "authMethod": "password",
                "privateKeyPath": null
            },
            "credentials": {
                "dbPassword": "secret_password",
                "sshPassword": null,
                "sshPassphrase": null
            }
        }"##;

        let parsed: SaveWorkspaceInput =
            serde_json::from_str(input_json).expect("deserialize SaveWorkspaceInput");
        assert_eq!(parsed.engine, DatabaseEngine::Mongodb);
        assert_eq!(parsed.safety_mode, SafetyMode::Standard);
        assert_eq!(parsed.commit_mode, CommitMode::Immediate);
        assert_eq!(
            parsed.credentials.db_password.as_deref(),
            Some("secret_password")
        );
    }
}
