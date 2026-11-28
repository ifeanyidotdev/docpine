use crate::error::{AppError, AppResult};
use crate::models::{
    ClientWorkspaceTelemetry, CommitMode, DatabaseEngine, EnvironmentTag, PoolStats,
    QueryHistoryRecord, QueryLatencyPoint, SafetyMode, SaveWorkspaceFolderInput,
    SaveWorkspaceInput, SavedQueryRecord, SshTunnelConfig, SslConfig, WorkspaceConfig,
    WorkspaceCredentials, WorkspaceFolder,
};
use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use std::path::PathBuf;
use std::sync::Mutex;
use uuid::Uuid;

pub struct LocalStore {
    conn: Mutex<Connection>,
    use_os_keychain: bool,
}

impl LocalStore {
    /// Opens or creates the local SQLite metadata store in the application data directory.
    pub fn new_default() -> AppResult<Self> {
        let base_dir = dirs::data_local_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("com.docpine.app");
        std::fs::create_dir_all(&base_dir)?;
        let db_path = base_dir.join("docpine_meta.db");
        let conn = Connection::open(db_path)?;
        let store = Self {
            conn: Mutex::new(conn),
            use_os_keychain: true,
        };
        store.init_schema()?;
        Ok(store)
    }

    /// Creates an in-memory store for fast, isolated unit tests.
    pub fn new_in_memory() -> AppResult<Self> {
        let conn = Connection::open_in_memory()?;
        let store = Self {
            conn: Mutex::new(conn),
            use_os_keychain: false,
        };
        store.init_schema()?;
        Ok(store)
    }

    fn init_schema(&self) -> AppResult<()> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| AppError::Storage("Failed to lock SQLite connection".into()))?;

        conn.execute_batch(
            r#"
            CREATE TABLE IF NOT EXISTS workspace_folders (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                color TEXT NOT NULL,
                created_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS workspaces (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                engine TEXT NOT NULL,
                host TEXT NOT NULL,
                port INTEGER NOT NULL,
                username TEXT NOT NULL,
                default_database TEXT NOT NULL,
                connection_uri TEXT,
                environment TEXT NOT NULL,
                accent_color TEXT NOT NULL,
                safety_mode TEXT NOT NULL,
                commit_mode TEXT NOT NULL,
                ssl_json TEXT NOT NULL,
                ssh_json TEXT NOT NULL,
                folder_id TEXT,
                created_at TEXT NOT NULL,
                last_opened_at TEXT
            );

            CREATE TABLE IF NOT EXISTS workspace_secrets (
                workspace_id TEXT PRIMARY KEY,
                credentials_json TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS saved_queries (
                id TEXT PRIMARY KEY,
                workspace_id TEXT NOT NULL,
                title TEXT NOT NULL,
                folder TEXT,
                database_name TEXT NOT NULL,
                query_text TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS query_history (
                id TEXT PRIMARY KEY,
                workspace_id TEXT NOT NULL,
                database_name TEXT NOT NULL,
                query_text TEXT NOT NULL,
                status TEXT NOT NULL,
                execution_ms INTEGER NOT NULL,
                row_count INTEGER,
                executed_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS workspace_ui_state (
                workspace_id TEXT PRIMARY KEY,
                tabs_json TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            "#,
        )?;

        // Idempotent migration for existing installations created before workspace folders existed
        let mut pragma_stmt = conn.prepare("PRAGMA table_info(workspaces)")?;
        let has_folder_id = pragma_stmt
            .query_map([], |row| row.get::<_, String>(1))?
            .filter_map(|r| r.ok())
            .any(|col| col == "folder_id");
        if !has_folder_id {
            conn.execute("ALTER TABLE workspaces ADD COLUMN folder_id TEXT", [])?;
        }

        Ok(())
    }

    pub fn list_workspaces(&self) -> AppResult<Vec<WorkspaceConfig>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| AppError::Storage("Failed to lock SQLite connection".into()))?;

        let mut stmt = conn.prepare(
            r#"
            SELECT id, name, engine, host, port, username, default_database, connection_uri,
                   environment, accent_color, safety_mode, commit_mode, ssl_json, ssh_json,
                   created_at, last_opened_at, folder_id
            FROM workspaces
            ORDER BY COALESCE(last_opened_at, created_at) DESC
            "#,
        )?;

        let rows = stmt.query_map([], Self::map_workspace_row)?;
        let mut list = Vec::new();
        for row in rows {
            list.push(row?);
        }
        Ok(list)
    }

    pub fn get_workspace(&self, id: &str) -> AppResult<WorkspaceConfig> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| AppError::Storage("Failed to lock SQLite connection".into()))?;

        let mut stmt = conn.prepare(
            r#"
            SELECT id, name, engine, host, port, username, default_database, connection_uri,
                   environment, accent_color, safety_mode, commit_mode, ssl_json, ssh_json,
                   created_at, last_opened_at, folder_id
            FROM workspaces
            WHERE id = ?1
            "#,
        )?;

        stmt.query_row(params![id], Self::map_workspace_row)
            .optional()?
            .ok_or_else(|| AppError::NotFound(format!("Workspace '{id}' not found")))
    }

    pub fn save_workspace(&self, input: SaveWorkspaceInput) -> AppResult<WorkspaceConfig> {
        let now = Utc::now().to_rfc3339();
        let existing = if let Some(ref existing_id) = input.id {
            self.get_workspace(existing_id).ok()
        } else {
            None
        };

        let id = existing
            .as_ref()
            .map(|w| w.id.clone())
            .or(input.id.clone())
            .unwrap_or_else(|| Uuid::new_v4().to_string());

        let created_at = existing
            .as_ref()
            .map(|w| w.created_at.clone())
            .unwrap_or_else(|| now.clone());

        let last_opened_at = existing.and_then(|w| w.last_opened_at);

        let engine_str = serde_json::to_string(&input.engine)?;
        let env_str = serde_json::to_string(&input.environment)?;
        let safety_str = serde_json::to_string(&input.safety_mode)?;
        let commit_str = serde_json::to_string(&input.commit_mode)?;
        let ssl_json = serde_json::to_string(&input.ssl)?;
        let ssh_json = serde_json::to_string(&input.ssh)?;

        {
            let conn = self
                .conn
                .lock()
                .map_err(|_| AppError::Storage("Failed to lock SQLite connection".into()))?;

            conn.execute(
                r#"
                INSERT INTO workspaces (
                    id, name, engine, host, port, username, default_database, connection_uri,
                    environment, accent_color, safety_mode, commit_mode, ssl_json, ssh_json,
                    folder_id, created_at, last_opened_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)
                ON CONFLICT(id) DO UPDATE SET
                    name = excluded.name,
                    engine = excluded.engine,
                    host = excluded.host,
                    port = excluded.port,
                    username = excluded.username,
                    default_database = excluded.default_database,
                    connection_uri = excluded.connection_uri,
                    environment = excluded.environment,
                    accent_color = excluded.accent_color,
                    safety_mode = excluded.safety_mode,
                    commit_mode = excluded.commit_mode,
                    ssl_json = excluded.ssl_json,
                    ssh_json = excluded.ssh_json,
                    folder_id = excluded.folder_id
                "#,
                params![
                    id,
                    input.name,
                    engine_str,
                    input.host,
                    input.port as i64,
                    input.username,
                    input.default_database,
                    input.connection_uri,
                    env_str,
                    input.accent_color,
                    safety_str,
                    commit_str,
                    ssl_json,
                    ssh_json,
                    input.folder_id,
                    created_at,
                    last_opened_at
                ],
            )?;
        }

        // Persist credentials if any field is provided or if creating a new workspace
        if input.credentials.db_password.is_some()
            || input.credentials.ssh_password.is_some()
            || input.credentials.ssh_passphrase.is_some()
            || input.id.is_none()
        {
            self.save_credentials(&id, &input.credentials)?;
        }

        self.get_workspace(&id)
    }

    pub fn update_workspace_modes(
        &self,
        workspace_id: &str,
        commit_mode: Option<CommitMode>,
        safety_mode: Option<SafetyMode>,
    ) -> AppResult<WorkspaceConfig> {
        let current = self.get_workspace(workspace_id)?;
        let new_commit = commit_mode.unwrap_or(current.commit_mode);
        let new_safety = safety_mode.unwrap_or(current.safety_mode);

        let commit_str = serde_json::to_string(&new_commit)?;
        let safety_str = serde_json::to_string(&new_safety)?;

        {
            let conn = self
                .conn
                .lock()
                .map_err(|_| AppError::Storage("Failed to lock SQLite connection".into()))?;
            conn.execute(
                "UPDATE workspaces SET commit_mode = ?1, safety_mode = ?2 WHERE id = ?3",
                params![commit_str, safety_str, workspace_id],
            )?;
        }

        self.get_workspace(workspace_id)
    }

    pub fn touch_workspace_opened(&self, workspace_id: &str) -> AppResult<()> {
        let now = Utc::now().to_rfc3339();
        let conn = self
            .conn
            .lock()
            .map_err(|_| AppError::Storage("Failed to lock SQLite connection".into()))?;
        conn.execute(
            "UPDATE workspaces SET last_opened_at = ?1 WHERE id = ?2",
            params![now, workspace_id],
        )?;
        Ok(())
    }

    pub fn delete_workspace(&self, workspace_id: &str) -> AppResult<()> {
        {
            let conn = self
                .conn
                .lock()
                .map_err(|_| AppError::Storage("Failed to lock SQLite connection".into()))?;
            conn.execute("DELETE FROM workspaces WHERE id = ?1", params![workspace_id])?;
            conn.execute(
                "DELETE FROM workspace_secrets WHERE workspace_id = ?1",
                params![workspace_id],
            )?;
            conn.execute(
                "DELETE FROM saved_queries WHERE workspace_id = ?1",
                params![workspace_id],
            )?;
            conn.execute(
                "DELETE FROM query_history WHERE workspace_id = ?1",
                params![workspace_id],
            )?;
            conn.execute(
                "DELETE FROM workspace_ui_state WHERE workspace_id = ?1",
                params![workspace_id],
            )?;
        }

        if self.use_os_keychain {
            if let Ok(entry) = keyring::Entry::new("com.docpine.app", workspace_id) {
                let _ = entry.delete_credential();
            }
        }

        Ok(())
    }

    pub fn save_credentials(
        &self,
        workspace_id: &str,
        creds: &WorkspaceCredentials,
    ) -> AppResult<()> {
        let serialized = serde_json::to_string(creds)?;

        if self.use_os_keychain {
            if let Ok(entry) = keyring::Entry::new("com.docpine.app", workspace_id) {
                let _ = entry.set_password(&serialized);
            }
        }

        let conn = self
            .conn
            .lock()
            .map_err(|_| AppError::Storage("Failed to lock SQLite connection".into()))?;
        conn.execute(
            r#"
            INSERT INTO workspace_secrets (workspace_id, credentials_json)
            VALUES (?1, ?2)
            ON CONFLICT(workspace_id) DO UPDATE SET credentials_json = excluded.credentials_json
            "#,
            params![workspace_id, serialized],
        )?;
        Ok(())
    }

    pub fn get_credentials(&self, workspace_id: &str) -> AppResult<WorkspaceCredentials> {
        if self.use_os_keychain {
            if let Ok(entry) = keyring::Entry::new("com.docpine.app", workspace_id) {
                if let Ok(secret) = entry.get_password() {
                    if let Ok(creds) = serde_json::from_str::<WorkspaceCredentials>(&secret) {
                        return Ok(creds);
                    }
                }
            }
        }

        let conn = self
            .conn
            .lock()
            .map_err(|_| AppError::Storage("Failed to lock SQLite connection".into()))?;
        let raw: Option<String> = conn
            .query_row(
                "SELECT credentials_json FROM workspace_secrets WHERE workspace_id = ?1",
                params![workspace_id],
                |row| row.get(0),
            )
            .optional()?;

        match raw {
            Some(json) => Ok(serde_json::from_str(&json)?),
            None => Ok(WorkspaceCredentials::default()),
        }
    }

    pub fn list_saved_queries(&self, workspace_id: &str) -> AppResult<Vec<SavedQueryRecord>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| AppError::Storage("Failed to lock SQLite connection".into()))?;

        let mut stmt = conn.prepare(
            r#"
            SELECT id, workspace_id, title, folder, database_name, query_text, created_at, updated_at
            FROM saved_queries
            WHERE workspace_id = ?1
            ORDER BY updated_at DESC
            "#,
        )?;

        let rows = stmt.query_map(params![workspace_id], |row| {
            Ok(SavedQueryRecord {
                id: row.get(0)?,
                workspace_id: row.get(1)?,
                title: row.get(2)?,
                folder: row.get(3)?,
                database: row.get(4)?,
                query_text: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        })?;

        let mut out = Vec::new();
        for r in rows {
            out.push(r?);
        }
        Ok(out)
    }

    pub fn save_query(
        &self,
        id: Option<String>,
        workspace_id: &str,
        title: &str,
        folder: Option<String>,
        database: &str,
        query_text: &str,
    ) -> AppResult<SavedQueryRecord> {
        let now = Utc::now().to_rfc3339();
        let query_id = id.unwrap_or_else(|| Uuid::new_v4().to_string());

        let conn = self
            .conn
            .lock()
            .map_err(|_| AppError::Storage("Failed to lock SQLite connection".into()))?;

        conn.execute(
            r#"
            INSERT INTO saved_queries (id, workspace_id, title, folder, database_name, query_text, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
            ON CONFLICT(id) DO UPDATE SET
                title = excluded.title,
                folder = excluded.folder,
                database_name = excluded.database_name,
                query_text = excluded.query_text,
                updated_at = excluded.updated_at
            "#,
            params![query_id, workspace_id, title, folder, database, query_text, now, now],
        )?;

        Ok(SavedQueryRecord {
            id: query_id,
            workspace_id: workspace_id.to_string(),
            title: title.to_string(),
            folder,
            database: database.to_string(),
            query_text: query_text.to_string(),
            created_at: now.clone(),
            updated_at: now,
        })
    }

    pub fn delete_saved_query(&self, query_id: &str) -> AppResult<()> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| AppError::Storage("Failed to lock SQLite connection".into()))?;
        conn.execute("DELETE FROM saved_queries WHERE id = ?1", params![query_id])?;
        Ok(())
    }

    pub fn record_query_history(
        &self,
        workspace_id: &str,
        database: &str,
        query_text: &str,
        status: &str,
        execution_ms: u64,
        row_count: Option<u64>,
    ) -> AppResult<QueryHistoryRecord> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();

        let conn = self
            .conn
            .lock()
            .map_err(|_| AppError::Storage("Failed to lock SQLite connection".into()))?;

        conn.execute(
            r#"
            INSERT INTO query_history (id, workspace_id, database_name, query_text, status, execution_ms, row_count, executed_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
            "#,
            params![
                id,
                workspace_id,
                database,
                query_text,
                status,
                execution_ms as i64,
                row_count.map(|c| c as i64),
                now
            ],
        )?;

        Ok(QueryHistoryRecord {
            id,
            workspace_id: workspace_id.to_string(),
            database: database.to_string(),
            query_text: query_text.to_string(),
            status: status.to_string(),
            execution_ms,
            row_count,
            executed_at: now,
        })
    }

    pub fn list_query_history(
        &self,
        workspace_id: &str,
        limit: u32,
    ) -> AppResult<Vec<QueryHistoryRecord>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| AppError::Storage("Failed to lock SQLite connection".into()))?;

        let mut stmt = conn.prepare(
            r#"
            SELECT id, workspace_id, database_name, query_text, status, execution_ms, row_count, executed_at
            FROM query_history
            WHERE workspace_id = ?1
            ORDER BY executed_at DESC
            LIMIT ?2
            "#,
        )?;

        let rows = stmt.query_map(params![workspace_id, limit], |row| {
            let ms: i64 = row.get(5)?;
            let count: Option<i64> = row.get(6)?;
            Ok(QueryHistoryRecord {
                id: row.get(0)?,
                workspace_id: row.get(1)?,
                database: row.get(2)?,
                query_text: row.get(3)?,
                status: row.get(4)?,
                execution_ms: ms.max(0) as u64,
                row_count: count.map(|c| c.max(0) as u64),
                executed_at: row.get(7)?,
            })
        })?;

        let mut out = Vec::new();
        for r in rows {
            out.push(r?);
        }
        Ok(out)
    }

    pub fn save_workspace_tabs_json(&self, workspace_id: &str, tabs_json: &str) -> AppResult<()> {
        let now = Utc::now().to_rfc3339();
        let conn = self
            .conn
            .lock()
            .map_err(|_| AppError::Storage("Failed to lock SQLite connection".into()))?;
        conn.execute(
            r#"
            INSERT INTO workspace_ui_state (workspace_id, tabs_json, updated_at)
            VALUES (?1, ?2, ?3)
            ON CONFLICT(workspace_id) DO UPDATE SET
                tabs_json = excluded.tabs_json,
                updated_at = excluded.updated_at
            "#,
            params![workspace_id, tabs_json, now],
        )?;
        Ok(())
    }

    pub fn get_workspace_tabs_json(&self, workspace_id: &str) -> AppResult<Option<String>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| AppError::Storage("Failed to lock SQLite connection".into()))?;
        let tabs: Option<String> = conn
            .query_row(
                "SELECT tabs_json FROM workspace_ui_state WHERE workspace_id = ?1",
                params![workspace_id],
                |row| row.get(0),
            )
            .optional()?;
        Ok(tabs)
    }

    pub fn get_workspace_query_telemetry(
        &self,
        workspace_id: &str,
        recent_limit: u32,
    ) -> AppResult<ClientWorkspaceTelemetry> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| AppError::Storage("Failed to lock SQLite connection".into()))?;

        let (total_count, failed_count, avg_ms): (i64, i64, f64) = conn.query_row(
            r#"
            SELECT
                COUNT(*),
                COALESCE(SUM(CASE WHEN status <> 'success' THEN 1 ELSE 0 END), 0),
                COALESCE(AVG(CAST(execution_ms AS REAL)), 0.0)
            FROM query_history
            WHERE workspace_id = ?1
            "#,
            params![workspace_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )?;

        let mut stmt = conn.prepare(
            r#"
            SELECT executed_at, execution_ms, status, database_name
            FROM query_history
            WHERE workspace_id = ?1
            ORDER BY executed_at DESC
            LIMIT ?2
            "#,
        )?;

        let rows = stmt.query_map(params![workspace_id, recent_limit], |row| {
            let ms: i64 = row.get(1)?;
            Ok(QueryLatencyPoint {
                executed_at: row.get(0)?,
                execution_ms: ms.max(0) as u64,
                status: row.get(2)?,
                database: row.get(3)?,
            })
        })?;

        let mut recent_latencies = Vec::new();
        for r in rows {
            recent_latencies.push(r?);
        }
        // Chronological order (oldest -> newest) for charts
        recent_latencies.reverse();

        // Compute P95 over recent window (up to 200 most recent executions)
        let mut p95_stmt = conn.prepare(
            r#"
            SELECT execution_ms
            FROM query_history
            WHERE workspace_id = ?1
            ORDER BY executed_at DESC
            LIMIT 200
            "#,
        )?;
        let mut latencies: Vec<u64> = p95_stmt
            .query_map(params![workspace_id], |row| {
                let ms: i64 = row.get(0)?;
                Ok(ms.max(0) as u64)
            })?
            .filter_map(|r| r.ok())
            .collect();
        latencies.sort_unstable();
        let p95_query_ms = if latencies.is_empty() {
            0
        } else {
            let idx = ((latencies.len() as f64) * 0.95).ceil() as usize;
            latencies[idx.saturating_sub(1).min(latencies.len() - 1)]
        };

        let total_u64 = total_count.max(0) as u64;
        let failed_u64 = failed_count.max(0) as u64;
        let error_rate_pct = if total_u64 > 0 {
            (failed_u64 as f64 / total_u64 as f64) * 100.0
        } else {
            0.0
        };

        Ok(ClientWorkspaceTelemetry {
            pool: PoolStats::default(),
            ssh_tunnel_active: false,
            ssh_local_port: None,
            total_queries_executed: total_u64,
            failed_queries_count: failed_u64,
            error_rate_pct,
            avg_query_ms: avg_ms,
            p95_query_ms,
            recent_latencies,
        })
    }

    fn map_workspace_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<WorkspaceConfig> {
        let engine_str: String = row.get(2)?;
        let port_i64: i64 = row.get(4)?;
        let env_str: String = row.get(8)?;
        let safety_str: String = row.get(10)?;
        let commit_str: String = row.get(11)?;
        let ssl_json: String = row.get(12)?;
        let ssh_json: String = row.get(13)?;

        let engine: DatabaseEngine =
            serde_json::from_str(&engine_str).unwrap_or(DatabaseEngine::Postgres);
        let environment: EnvironmentTag =
            serde_json::from_str(&env_str).unwrap_or(EnvironmentTag::Development);
        let safety_mode: SafetyMode =
            serde_json::from_str(&safety_str).unwrap_or(SafetyMode::Safe);
        let commit_mode: CommitMode =
            serde_json::from_str(&commit_str).unwrap_or(CommitMode::Staged);
        let ssl: SslConfig = serde_json::from_str(&ssl_json).unwrap_or_default();
        let ssh: SshTunnelConfig = serde_json::from_str(&ssh_json).unwrap_or_default();

        Ok(WorkspaceConfig {
            id: row.get(0)?,
            name: row.get(1)?,
            engine,
            host: row.get(3)?,
            port: port_i64 as u16,
            username: row.get(5)?,
            default_database: row.get(6)?,
            connection_uri: row.get(7)?,
            environment,
            accent_color: row.get(9)?,
            safety_mode,
            commit_mode,
            ssl,
            ssh,
            folder_id: row.get(16)?,
            created_at: row.get(14)?,
            last_opened_at: row.get(15)?,
        })
    }

    pub fn list_workspace_folders(&self) -> AppResult<Vec<WorkspaceFolder>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| AppError::Storage("Failed to lock SQLite connection".into()))?;
        let mut stmt = conn.prepare(
            r#"
            SELECT id, name, color, created_at
            FROM workspace_folders
            ORDER BY name COLLATE NOCASE ASC
            "#,
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(WorkspaceFolder {
                id: row.get(0)?,
                name: row.get(1)?,
                color: row.get(2)?,
                created_at: row.get(3)?,
            })
        })?;
        let mut out = Vec::new();
        for r in rows {
            out.push(r?);
        }
        Ok(out)
    }

    pub fn save_workspace_folder(
        &self,
        input: SaveWorkspaceFolderInput,
    ) -> AppResult<WorkspaceFolder> {
        let name = input.name.trim();
        if name.is_empty() {
            return Err(AppError::Validation("Folder name cannot be empty".into()));
        }
        let now = Utc::now().to_rfc3339();
        let id = input
            .id
            .filter(|s| !s.trim().is_empty())
            .unwrap_or_else(|| Uuid::new_v4().to_string());
        let color = if input.color.trim().is_empty() {
            "#6366f1".to_string()
        } else {
            input.color.trim().to_string()
        };

        let conn = self
            .conn
            .lock()
            .map_err(|_| AppError::Storage("Failed to lock SQLite connection".into()))?;

        let existing_created: Option<String> = conn
            .query_row(
                "SELECT created_at FROM workspace_folders WHERE id = ?1",
                params![id],
                |row| row.get(0),
            )
            .optional()?;
        let created_at = existing_created.unwrap_or(now);

        conn.execute(
            r#"
            INSERT INTO workspace_folders (id, name, color, created_at)
            VALUES (?1, ?2, ?3, ?4)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                color = excluded.color
            "#,
            params![id, name, color, created_at],
        )?;

        Ok(WorkspaceFolder {
            id,
            name: name.to_string(),
            color,
            created_at,
        })
    }

    pub fn delete_workspace_folder(&self, folder_id: &str) -> AppResult<()> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| AppError::Storage("Failed to lock SQLite connection".into()))?;
        conn.execute(
            "UPDATE workspaces SET folder_id = NULL WHERE folder_id = ?1",
            params![folder_id],
        )?;
        conn.execute(
            "DELETE FROM workspace_folders WHERE id = ?1",
            params![folder_id],
        )?;
        Ok(())
    }

    pub fn move_workspace_to_folder(
        &self,
        workspace_id: &str,
        folder_id: Option<String>,
    ) -> AppResult<WorkspaceConfig> {
        let normalized = folder_id.filter(|s| !s.trim().is_empty());
        {
            let conn = self
                .conn
                .lock()
                .map_err(|_| AppError::Storage("Failed to lock SQLite connection".into()))?;
            conn.execute(
                "UPDATE workspaces SET folder_id = ?1 WHERE id = ?2",
                params![normalized, workspace_id],
            )?;
        }
        self.get_workspace(workspace_id)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_workspace_crud_and_credentials() {
        let store = LocalStore::new_in_memory().expect("in-memory store should initialize");

        let saved = store
            .save_workspace(SaveWorkspaceInput {
                id: None,
                name: "Prod Billing Postgres".into(),
                engine: DatabaseEngine::Postgres,
                host: "db.internal".into(),
                port: 5432,
                username: "billing_admin".into(),
                default_database: "billing".into(),
                connection_uri: None,
                environment: EnvironmentTag::Production,
                accent_color: "#ef4444".into(),
                safety_mode: SafetyMode::Safe,
                commit_mode: CommitMode::Staged,
                ssl: SslConfig {
                    enabled: true,
                    reject_unauthorized: true,
                    ca_cert_path: None,
                },
                ssh: SshTunnelConfig::default(),
                folder_id: None,
                credentials: WorkspaceCredentials {
                    db_password: Some("super_secret_pw".into()),
                    ssh_password: None,
                    ssh_passphrase: None,
                },
            })
            .expect("should save workspace");

        assert_eq!(saved.name, "Prod Billing Postgres");
        assert_eq!(saved.environment, EnvironmentTag::Production);

        let creds = store
            .get_credentials(&saved.id)
            .expect("should retrieve credentials");
        assert_eq!(creds.db_password.as_deref(), Some("super_secret_pw"));

        let updated = store
            .update_workspace_modes(
                &saved.id,
                Some(CommitMode::Immediate),
                Some(SafetyMode::ReadOnly),
            )
            .expect("should update workspace modes");
        assert_eq!(updated.commit_mode, CommitMode::Immediate);
        assert_eq!(updated.safety_mode, SafetyMode::ReadOnly);

        let all = store.list_workspaces().unwrap();
        assert_eq!(all.len(), 1);

        store.delete_workspace(&saved.id).unwrap();
        assert!(store.list_workspaces().unwrap().is_empty());
    }

    #[test]
    fn test_saved_queries_and_history_persistence() {
        let store = LocalStore::new_in_memory().unwrap();
        let ws_id = "ws-test-1";

        let q = store
            .save_query(
                None,
                ws_id,
                "Active Customers",
                Some("Analytics".into()),
                "crm",
                "SELECT * FROM customers WHERE active = true;",
            )
            .unwrap();

        let queries = store.list_saved_queries(ws_id).unwrap();
        assert_eq!(queries.len(), 1);
        assert_eq!(queries[0].id, q.id);

        store
            .record_query_history(
                ws_id,
                "crm",
                "SELECT count(*) FROM customers;",
                "success",
                14,
                Some(1),
            )
            .unwrap();

        let history = store.list_query_history(ws_id, 50).unwrap();
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].execution_ms, 14);
    }

    #[test]
    fn test_touch_workspace_opened() {
        let store = LocalStore::new_in_memory().unwrap();
        let ws = store
            .save_workspace(SaveWorkspaceInput {
                id: None,
                name: "Test WS".into(),
                engine: DatabaseEngine::Postgres,
                host: "localhost".into(),
                port: 5432,
                username: "user".into(),
                default_database: "db".into(),
                connection_uri: None,
                environment: EnvironmentTag::Local,
                accent_color: "#10b981".into(),
                safety_mode: SafetyMode::Standard,
                commit_mode: CommitMode::Immediate,
                ssl: SslConfig::default(),
                ssh: SshTunnelConfig::default(),
                folder_id: None,
                credentials: WorkspaceCredentials::default(),
            })
            .unwrap();

        assert_eq!(ws.last_opened_at, None);

        store.touch_workspace_opened(&ws.id).unwrap();

        let touched = store.get_workspace(&ws.id).unwrap();
        assert!(touched.last_opened_at.is_some());
    }

    #[test]
    fn test_update_saved_query_and_delete() {
        let store = LocalStore::new_in_memory().unwrap();
        let ws_id = "ws-query-test";

        let created = store
            .save_query(
                None,
                ws_id,
                "Old Title",
                None,
                "main",
                "SELECT 1;",
            )
            .unwrap();

        let updated = store
            .save_query(
                Some(created.id.clone()),
                ws_id,
                "New Title",
                Some("Reports".into()),
                "main",
                "SELECT 100;",
            )
            .unwrap();

        assert_eq!(updated.id, created.id);
        assert_eq!(updated.title, "New Title");
        assert_eq!(updated.query_text, "SELECT 100;");

        store.delete_saved_query(&created.id).unwrap();
        let remaining = store.list_saved_queries(ws_id).unwrap();
        assert!(remaining.is_empty());
    }

    #[test]
    fn test_workspace_query_telemetry_isolation_and_stats() {
        let store = LocalStore::new_in_memory().unwrap();

        // Empty workspace returns zeroes
        let empty = store.get_workspace_query_telemetry("ws-empty", 30).unwrap();
        assert_eq!(empty.total_queries_executed, 0);
        assert_eq!(empty.failed_queries_count, 0);
        assert_eq!(empty.p95_query_ms, 0);
        assert!(empty.recent_latencies.is_empty());

        // Populate ws-a with 4 queries (1 error) and ws-b with 1 huge latency query
        store
            .record_query_history("ws-a", "app", "SELECT 1", "success", 10, Some(1))
            .unwrap();
        store
            .record_query_history("ws-a", "app", "SELECT 2", "success", 20, Some(1))
            .unwrap();
        store
            .record_query_history("ws-a", "app", "SELECT 3", "success", 30, Some(1))
            .unwrap();
        store
            .record_query_history("ws-a", "app", "BAD SQL", "error", 100, None)
            .unwrap();
        store
            .record_query_history("ws-b", "other", "SELECT 9", "success", 9999, Some(1))
            .unwrap();

        let telemetry_a = store.get_workspace_query_telemetry("ws-a", 30).unwrap();
        assert_eq!(telemetry_a.total_queries_executed, 4);
        assert_eq!(telemetry_a.failed_queries_count, 1);
        assert!((telemetry_a.error_rate_pct - 25.0).abs() < 0.01);
        assert!((telemetry_a.avg_query_ms - 40.0).abs() < 0.01);
        assert_eq!(telemetry_a.p95_query_ms, 100);
        assert_eq!(telemetry_a.recent_latencies.len(), 4);

        // Verify workspace B is isolated
        let telemetry_b = store.get_workspace_query_telemetry("ws-b", 30).unwrap();
        assert_eq!(telemetry_b.total_queries_executed, 1);
        assert_eq!(telemetry_b.p95_query_ms, 9999);
    }

    #[test]
    fn test_workspace_folders_crud_and_safe_ungrouping() {
        let store = LocalStore::new_in_memory().unwrap();

        let folder = store
            .save_workspace_folder(SaveWorkspaceFolderInput {
                id: None,
                name: "Acme Payments".into(),
                color: "#6366f1".into(),
            })
            .unwrap();
        assert_eq!(folder.name, "Acme Payments");

        let ws = store
            .save_workspace(SaveWorkspaceInput {
                id: None,
                name: "Payments Prod".into(),
                engine: DatabaseEngine::Postgres,
                host: "db.acme.io".into(),
                port: 5432,
                username: "admin".into(),
                default_database: "payments".into(),
                connection_uri: None,
                environment: EnvironmentTag::Production,
                accent_color: "#ef4444".into(),
                safety_mode: SafetyMode::Safe,
                commit_mode: CommitMode::Staged,
                ssl: SslConfig::default(),
                ssh: SshTunnelConfig::default(),
                folder_id: Some(folder.id.clone()),
                credentials: WorkspaceCredentials::default(),
            })
            .unwrap();
        assert_eq!(ws.folder_id.as_deref(), Some(folder.id.as_str()));

        // Rename folder
        let renamed = store
            .save_workspace_folder(SaveWorkspaceFolderInput {
                id: Some(folder.id.clone()),
                name: "Acme Core".into(),
                color: "#10b981".into(),
            })
            .unwrap();
        assert_eq!(renamed.id, folder.id);
        assert_eq!(renamed.name, "Acme Core");
        assert_eq!(store.list_workspace_folders().unwrap().len(), 1);

        // Deleting folder ungroups workspace without deleting it
        store.delete_workspace_folder(&folder.id).unwrap();
        assert!(store.list_workspace_folders().unwrap().is_empty());

        let ungrouped = store.get_workspace(&ws.id).unwrap();
        assert_eq!(ungrouped.folder_id, None);

        // Move workspace into a newly created folder
        let folder2 = store
            .save_workspace_folder(SaveWorkspaceFolderInput {
                id: None,
                name: "Analytics".into(),
                color: "#0ea5e9".into(),
            })
            .unwrap();
        let moved = store
            .move_workspace_to_folder(&ws.id, Some(folder2.id.clone()))
            .unwrap();
        assert_eq!(moved.folder_id.as_deref(), Some(folder2.id.as_str()));
    }
}
