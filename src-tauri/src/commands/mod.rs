use crate::error::AppResult;
use crate::models::{
    CommitMode, ContainerStructure, DataFormat, DataPageRequest, DataPageResult, DatabaseEngine,
    MutationResult, ParsedConnectionUri, QueryExecutionResult, QueryHistoryRecord, SafetyMode,
    SaveWorkspaceFolderInput, SaveWorkspaceInput, SavedQueryRecord, SchemaChangeAction,
    SchemaChangeRequest, SchemaOverview, StagedBatchRequest, WorkspaceConfig, WorkspaceCredentials,
    WorkspaceFolder, WorkspaceObservabilitySnapshot,
};
use chrono::Utc;
use crate::services::{
    io_service::{format_export_payload, parse_import_payload},
    local_store::LocalStore,
    pool_manager::WorkspacePoolManager,
    safety_guard::{check_mutation_permission, inspect_query_safety},
    uri_parser::{build_connection_uri, parse_connection_uri},
};
use std::time::Instant;
use tauri::State;

pub struct AppState {
    pub store: LocalStore,
    pub pools: WorkspacePoolManager,
}

#[tauri::command]
pub fn parse_uri(uri: String) -> AppResult<ParsedConnectionUri> {
    parse_connection_uri(&uri)
}

#[tauri::command]
pub fn build_uri(
    engine: DatabaseEngine,
    host: String,
    port: u16,
    username: String,
    password: Option<String>,
    database: String,
    ssl_enabled: bool,
) -> String {
    build_connection_uri(
        engine,
        &host,
        port,
        &username,
        password.as_deref(),
        &database,
        ssl_enabled,
    )
}

#[tauri::command]
pub fn list_workspace_folders(state: State<'_, AppState>) -> AppResult<Vec<WorkspaceFolder>> {
    state.store.list_workspace_folders()
}

#[tauri::command]
pub fn save_workspace_folder(
    state: State<'_, AppState>,
    input: SaveWorkspaceFolderInput,
) -> AppResult<WorkspaceFolder> {
    state.store.save_workspace_folder(input)
}

#[tauri::command]
pub fn delete_workspace_folder(state: State<'_, AppState>, folder_id: String) -> AppResult<()> {
    state.store.delete_workspace_folder(&folder_id)
}

#[tauri::command]
pub fn move_workspace_to_folder(
    state: State<'_, AppState>,
    workspace_id: String,
    folder_id: Option<String>,
) -> AppResult<WorkspaceConfig> {
    state
        .store
        .move_workspace_to_folder(&workspace_id, folder_id)
}

#[tauri::command]
pub fn list_workspaces(state: State<'_, AppState>) -> AppResult<Vec<WorkspaceConfig>> {
    state.store.list_workspaces()
}

#[tauri::command]
pub fn save_workspace(
    state: State<'_, AppState>,
    input: SaveWorkspaceInput,
) -> AppResult<WorkspaceConfig> {
    state.store.save_workspace(input)
}

#[tauri::command]
pub fn get_workspace_credentials(
    state: State<'_, AppState>,
    workspace_id: String,
) -> AppResult<WorkspaceCredentials> {
    state.store.get_credentials(&workspace_id)
}

#[tauri::command]
pub fn update_workspace_modes(
    state: State<'_, AppState>,
    workspace_id: String,
    commit_mode: Option<CommitMode>,
    safety_mode: Option<SafetyMode>,
) -> AppResult<WorkspaceConfig> {
    state
        .store
        .update_workspace_modes(&workspace_id, commit_mode, safety_mode)
}

#[tauri::command]
pub async fn delete_workspace(
    state: State<'_, AppState>,
    workspace_id: String,
) -> AppResult<()> {
    state.pools.disconnect_workspace(&workspace_id).await;
    state.store.delete_workspace(&workspace_id)
}

#[tauri::command]
pub async fn test_workspace_connection(input: SaveWorkspaceInput) -> AppResult<u64> {
    let temp_config = WorkspaceConfig {
        id: "temp-test".into(),
        name: input.name,
        engine: input.engine,
        host: input.host,
        port: input.port,
        username: input.username,
        default_database: input.default_database,
        connection_uri: input.connection_uri,
        environment: input.environment,
        accent_color: input.accent_color,
        safety_mode: input.safety_mode,
        commit_mode: input.commit_mode,
        ssl: input.ssl,
        ssh: input.ssh,
        folder_id: input.folder_id,
        created_at: String::new(),
        last_opened_at: None,
    };
    WorkspacePoolManager::test_ephemeral_connection(&temp_config, &input.credentials).await
}

#[tauri::command]
pub async fn connect_workspace(
    state: State<'_, AppState>,
    workspace_id: String,
) -> AppResult<u64> {
    let config = state.store.get_workspace(&workspace_id)?;
    let creds = state.store.get_credentials(&workspace_id)?;
    let driver = state.pools.connect_workspace(&config, &creds).await?;
    let latency = driver.ping().await?;
    let _ = state.store.touch_workspace_opened(&workspace_id);
    Ok(latency)
}

#[tauri::command]
pub async fn disconnect_workspace(
    state: State<'_, AppState>,
    workspace_id: String,
) -> AppResult<()> {
    state.pools.disconnect_workspace(&workspace_id).await;
    Ok(())
}

#[tauri::command]
pub async fn list_databases(
    state: State<'_, AppState>,
    workspace_id: String,
) -> AppResult<Vec<String>> {
    let config = state.store.get_workspace(&workspace_id)?;
    let creds = state.store.get_credentials(&workspace_id)?;
    let driver = state.pools.get_or_connect(&config, &creds).await?;
    driver.list_databases().await
}

#[tauri::command]
pub async fn get_schema_overview(
    state: State<'_, AppState>,
    workspace_id: String,
    database: String,
) -> AppResult<SchemaOverview> {
    let config = state.store.get_workspace(&workspace_id)?;
    let creds = state.store.get_credentials(&workspace_id)?;
    let driver = state.pools.get_or_connect(&config, &creds).await?;
    driver.get_schema_overview(&database).await
}

#[tauri::command]
pub async fn inspect_container(
    state: State<'_, AppState>,
    workspace_id: String,
    database: String,
    schema: Option<String>,
    container: String,
) -> AppResult<ContainerStructure> {
    let config = state.store.get_workspace(&workspace_id)?;
    let creds = state.store.get_credentials(&workspace_id)?;
    let driver = state.pools.get_or_connect(&config, &creds).await?;
    driver
        .inspect_container(&database, schema.as_deref(), &container)
        .await
}

#[tauri::command]
pub async fn fetch_data_page(
    state: State<'_, AppState>,
    workspace_id: String,
    request: DataPageRequest,
) -> AppResult<DataPageResult> {
    let config = state.store.get_workspace(&workspace_id)?;
    let creds = state.store.get_credentials(&workspace_id)?;
    let driver = state.pools.get_or_connect(&config, &creds).await?;
    driver.fetch_data_page(&request).await
}

#[tauri::command]
pub async fn preview_mutations(
    state: State<'_, AppState>,
    workspace_id: String,
    request: StagedBatchRequest,
) -> AppResult<Vec<String>> {
    let config = state.store.get_workspace(&workspace_id)?;
    let creds = state.store.get_credentials(&workspace_id)?;
    let driver = state.pools.get_or_connect(&config, &creds).await?;
    driver.preview_mutations(&request).await
}

#[tauri::command]
pub async fn apply_mutations(
    state: State<'_, AppState>,
    workspace_id: String,
    request: StagedBatchRequest,
    confirmed: bool,
) -> AppResult<MutationResult> {
    let config = state.store.get_workspace(&workspace_id)?;
    let is_destructive = !request.deletes.is_empty();
    check_mutation_permission(
        config.safety_mode,
        false, // Row-level PK deletes in staged grid already have explicit user action, only ReadOnly blocks
        &format!("Delete {} record(s) from {}", request.deletes.len(), request.container),
        confirmed || !is_destructive,
    )?;

    let creds = state.store.get_credentials(&workspace_id)?;
    let driver = state.pools.get_or_connect(&config, &creds).await?;
    let result = driver.apply_mutations(&request).await?;

    if !result.statements.is_empty() {
        let _ = state.store.record_query_history(
            &workspace_id,
            &request.database,
            &result.statements.join("\n"),
            "success",
            result.execution_ms,
            Some(result.inserted_count + result.updated_count + result.deleted_count),
        );
    }

    Ok(result)
}

#[tauri::command]
pub async fn preview_schema_change(
    state: State<'_, AppState>,
    workspace_id: String,
    request: SchemaChangeRequest,
) -> AppResult<String> {
    let config = state.store.get_workspace(&workspace_id)?;
    let creds = state.store.get_credentials(&workspace_id)?;
    let driver = state.pools.get_or_connect(&config, &creds).await?;
    driver.preview_schema_change(&request).await
}

#[tauri::command]
pub async fn apply_schema_change(
    state: State<'_, AppState>,
    workspace_id: String,
    request: SchemaChangeRequest,
    confirmed: bool,
) -> AppResult<QueryExecutionResult> {
    let config = state.store.get_workspace(&workspace_id)?;
    let is_destructive = matches!(
        request.change,
        SchemaChangeAction::DropContainer | SchemaChangeAction::DropColumn { .. }
    );
    check_mutation_permission(
        config.safety_mode,
        is_destructive,
        &format!("Drop operation on {}", request.container),
        confirmed,
    )?;

    let creds = state.store.get_credentials(&workspace_id)?;
    let driver = state.pools.get_or_connect(&config, &creds).await?;
    driver.apply_schema_change(&request).await
}

#[tauri::command]
pub async fn create_schema(
    state: State<'_, AppState>,
    workspace_id: String,
    database: String,
    schema: String,
) -> AppResult<QueryExecutionResult> {
    let config = state.store.get_workspace(&workspace_id)?;
    check_mutation_permission(
        config.safety_mode,
        false,
        &format!("Create schema {}", schema),
        true,
    )?;

    let creds = state.store.get_credentials(&workspace_id)?;
    let driver = state.pools.get_or_connect(&config, &creds).await?;
    driver.create_schema(&database, &schema).await
}

#[tauri::command]
pub async fn execute_query(
    state: State<'_, AppState>,
    workspace_id: String,
    database: String,
    query: String,
    confirmed: bool,
) -> AppResult<QueryExecutionResult> {
    let config = state.store.get_workspace(&workspace_id)?;
    let _inspection = inspect_query_safety(config.engine, config.safety_mode, &query, confirmed)?;

    let creds = state.store.get_credentials(&workspace_id)?;
    let driver = state.pools.get_or_connect(&config, &creds).await?;

    let start = Instant::now();
    match driver.execute_raw_query(&database, &query).await {
        Ok(res) => {
            let _ = state.store.record_query_history(
                &workspace_id,
                &database,
                &query,
                "success",
                res.execution_ms,
                res.affected_rows,
            );
            Ok(res)
        }
        Err(err) => {
            let _ = state.store.record_query_history(
                &workspace_id,
                &database,
                &query,
                "error",
                start.elapsed().as_millis() as u64,
                None,
            );
            Err(err)
        }
    }
}

#[tauri::command]
pub fn list_saved_queries(
    state: State<'_, AppState>,
    workspace_id: String,
) -> AppResult<Vec<SavedQueryRecord>> {
    state.store.list_saved_queries(&workspace_id)
}

#[tauri::command]
pub fn save_workspace_query(
    state: State<'_, AppState>,
    id: Option<String>,
    workspace_id: String,
    title: String,
    folder: Option<String>,
    database: String,
    query_text: String,
) -> AppResult<SavedQueryRecord> {
    state
        .store
        .save_query(id, &workspace_id, &title, folder, &database, &query_text)
}

#[tauri::command]
pub fn delete_saved_query(state: State<'_, AppState>, query_id: String) -> AppResult<()> {
    state.store.delete_saved_query(&query_id)
}

#[tauri::command]
pub fn list_query_history(
    state: State<'_, AppState>,
    workspace_id: String,
    limit: Option<u32>,
) -> AppResult<Vec<QueryHistoryRecord>> {
    state
        .store
        .list_query_history(&workspace_id, limit.unwrap_or(100))
}

#[tauri::command]
pub fn save_workspace_tabs(
    state: State<'_, AppState>,
    workspace_id: String,
    tabs_json: String,
) -> AppResult<()> {
    state.store.save_workspace_tabs_json(&workspace_id, &tabs_json)
}

#[tauri::command]
pub fn get_workspace_tabs(
    state: State<'_, AppState>,
    workspace_id: String,
) -> AppResult<Option<String>> {
    state.store.get_workspace_tabs_json(&workspace_id)
}

#[tauri::command]
pub async fn export_container_data(
    state: State<'_, AppState>,
    workspace_id: String,
    database: String,
    schema: Option<String>,
    container: String,
    format: DataFormat,
    rows: Option<Vec<serde_json::Value>>,
    file_path: Option<String>,
) -> AppResult<String> {
    let config = state.store.get_workspace(&workspace_id)?;
    let export_rows = if let Some(provided) = rows {
        provided
    } else {
        let creds = state.store.get_credentials(&workspace_id)?;
        let driver = state.pools.get_or_connect(&config, &creds).await?;
        let page = driver
            .fetch_data_page(&DataPageRequest {
                database,
                schema: schema.clone(),
                container: container.clone(),
                filters: vec![],
                raw_filter: None,
                sorts: vec![],
                page: 1,
                page_size: 5000,
            })
            .await?;
        page.rows
    };

    let content = format_export_payload(
        config.engine,
        schema.as_deref(),
        &container,
        &format,
        &export_rows,
    )?;

    if let Some(path) = file_path.filter(|p| !p.trim().is_empty()) {
        std::fs::write(&path, &content)?;
    }

    Ok(content)
}

#[tauri::command]
pub async fn import_container_data(
    state: State<'_, AppState>,
    workspace_id: String,
    database: String,
    schema: Option<String>,
    container: String,
    format: DataFormat,
    raw_content: String,
) -> AppResult<MutationResult> {
    let start = Instant::now();
    let config = state.store.get_workspace(&workspace_id)?;
    check_mutation_permission(config.safety_mode, false, "Import data", true)?;

    let rows = parse_import_payload(&format, &raw_content)?;
    let creds = state.store.get_credentials(&workspace_id)?;
    let driver = state.pools.get_or_connect(&config, &creds).await?;

    let mut res = driver
        .apply_mutations(&StagedBatchRequest {
            database,
            schema,
            container,
            inserts: rows,
            updates: vec![],
            deletes: vec![],
            atomic: true,
        })
        .await?;
    res.execution_ms = start.elapsed().as_millis() as u64;
    Ok(res)
}

#[tauri::command]
pub async fn get_workspace_observability(
    state: State<'_, AppState>,
    workspace_id: String,
    database: String,
) -> AppResult<WorkspaceObservabilitySnapshot> {
    let config = state.store.get_workspace(&workspace_id)?;
    let creds = state.store.get_credentials(&workspace_id)?;
    let driver = state.pools.get_or_connect(&config, &creds).await?;

    let target_db = if database.trim().is_empty() {
        config.default_database.clone()
    } else {
        database
    };

    let ping_ms = driver.ping().await?;
    let server = driver.collect_metrics(&target_db).await?;
    let pool = driver.pool_stats().await;
    let (ssh_tunnel_active, ssh_local_port) = state.pools.get_ssh_tunnel_info(&workspace_id).await;

    let mut client = state
        .store
        .get_workspace_query_telemetry(&workspace_id, 30)?;
    client.pool = pool;
    client.ssh_tunnel_active = ssh_tunnel_active;
    client.ssh_local_port = ssh_local_port;

    Ok(WorkspaceObservabilitySnapshot {
        collected_at: Utc::now().to_rfc3339(),
        engine: config.engine,
        database: target_db,
        ping_ms,
        server,
        client,
    })
}
