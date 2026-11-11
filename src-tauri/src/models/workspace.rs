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
