use docpine_lib::drivers::sql_helpers::{
    generate_ddl_statement, generate_mutation_statements,
};
use docpine_lib::error::AppError;
use docpine_lib::models::{
    ColumnMeta, CommitMode, DataFormat, DatabaseEngine, EnvironmentTag, RecordUpdate,
    SafetyMode, SaveWorkspaceInput, SchemaChangeAction, SchemaChangeRequest, SshTunnelConfig,
    SslConfig, StagedBatchRequest, WorkspaceCredentials,
};
use docpine_lib::services::io_service::{format_export_payload, parse_import_payload};
use docpine_lib::services::local_store::LocalStore;
use docpine_lib::services::safety_guard::inspect_query_safety;
use docpine_lib::services::uri_parser::parse_connection_uri;
use serde_json::json;
use std::collections::HashMap;

#[test]
fn test_workspace_full_lifecycle_flow() {
    // 1. Parse connection URI with encoded special characters
    let raw_uri = "postgresql://app_admin:s3cr3t%40pass@pg.internal.net:5432/production_billing?sslmode=require";
    let parsed = parse_connection_uri(raw_uri).expect("URI parse failed");

    assert_eq!(parsed.engine, DatabaseEngine::Postgres);
    assert_eq!(parsed.host, "pg.internal.net");
    assert_eq!(parsed.port, 5432);
    assert_eq!(parsed.username, "app_admin");
    assert_eq!(parsed.password.as_deref(), Some("s3cr3t@pass"));
    assert_eq!(parsed.database, "production_billing");
    assert!(parsed.ssl_enabled);

    // 2. Initialize in-memory SQLite store
    let store = LocalStore::new_in_memory().expect("failed to init local store");

    // 3. Save as new workspace
    let input = SaveWorkspaceInput {
        id: None,
        name: "Billing Production".to_string(),
        engine: parsed.engine,
        host: parsed.host.clone(),
        port: parsed.port,
        username: parsed.username.clone(),
        default_database: parsed.database.clone(),
        connection_uri: Some(parsed.raw_uri.clone()),
        environment: EnvironmentTag::Production,
        accent_color: "#ef4444".to_string(),
        safety_mode: SafetyMode::Safe,
        commit_mode: CommitMode::Staged,
        ssl: SslConfig {
            enabled: parsed.ssl_enabled,
            reject_unauthorized: true,
            ca_cert_path: None,
        },
        ssh: SshTunnelConfig::default(),
        credentials: WorkspaceCredentials {
            db_password: parsed.password.clone(),
            ssh_password: None,
            ssh_passphrase: None,
        },
    };

    let saved = store.save_workspace(input).expect("save workspace failed");
    assert_eq!(saved.name, "Billing Production");
    assert_eq!(saved.environment, EnvironmentTag::Production);
    assert_eq!(saved.default_database, "production_billing");

    // 4. Retrieve credentials
    let creds = store
        .get_credentials(&saved.id)
        .expect("get credentials failed");
    assert_eq!(creds.db_password.as_deref(), Some("s3cr3t@pass"));

    // 5. Update workspace modes
    let updated = store
        .update_workspace_modes(
            &saved.id,
            Some(CommitMode::Immediate),
            Some(SafetyMode::ReadOnly),
        )
        .expect("update modes failed");
    assert_eq!(updated.commit_mode, CommitMode::Immediate);
    assert_eq!(updated.safety_mode, SafetyMode::ReadOnly);

    // 6. Touch opened
    store.touch_workspace_opened(&saved.id).expect("touch failed");
    let touched = store.get_workspace(&saved.id).expect("get workspace failed");
    assert!(touched.last_opened_at.is_some());

    // 7. Verify list & delete
    let list = store.list_workspaces().expect("list failed");
    assert_eq!(list.len(), 1);

    store.delete_workspace(&saved.id).expect("delete failed");
    let after_delete = store.list_workspaces().expect("list failed");
    assert!(after_delete.is_empty());
}

#[test]
fn test_data_pipeline_mutation_safety_and_export_flow() {
    // 1. Prepare staged batch
    let mut identity = HashMap::new();
    identity.insert("user_id".to_string(), json!(1001));

    let mut changes = HashMap::new();
    changes.insert("status".to_string(), json!("verified"));

    let batch = StagedBatchRequest {
        database: "users_db".to_string(),
        schema: Some("public".to_string()),
        container: "profiles".to_string(),
        inserts: vec![json!({"user_id": 1002, "status": "pending", "email": "bob@docpine.dev"})],
        updates: vec![RecordUpdate {
            identity,
            changes,
            original: HashMap::new(),
        }],
        deletes: vec![{
            let mut del = HashMap::new();
            del.insert("user_id".to_string(), json!(999));
            del
        }],
        atomic: true,
    };

    // 2. Generate SQL mutation statements
    let stmts = generate_mutation_statements(DatabaseEngine::Postgres, &batch)
        .expect("mutation statement generation failed");
    assert_eq!(stmts.len(), 3);
    assert!(stmts[0].starts_with(r#"INSERT INTO "public"."profiles""#));
    assert!(stmts[1].starts_with(r#"UPDATE "public"."profiles""#));
    assert!(stmts[2].starts_with(r#"DELETE FROM "public"."profiles""#));

    // 3. Validate safety inspection on the generated statements
    for stmt in &stmts {
        let inspect = inspect_query_safety(
            DatabaseEngine::Postgres,
            SafetyMode::Safe,
            stmt,
            false,
        )
        .expect("safety inspection should pass on filtered mutations");
        assert!(inspect.is_mutation);
    }

    // 4. Export simulated result rows to CSV and JSON
    let sample_rows = vec![
        json!({"user_id": 1001, "status": "verified", "email": "alice@docpine.dev"}),
        json!({"user_id": 1002, "status": "pending", "email": "bob@docpine.dev"}),
    ];

    let csv_exported = format_export_payload(
        DatabaseEngine::Postgres,
        Some("public"),
        "profiles",
        &DataFormat::Csv,
        &sample_rows,
    )
    .expect("CSV export failed");

    let parsed_csv = parse_import_payload(&DataFormat::Csv, &csv_exported)
        .expect("CSV import failed");
    assert_eq!(parsed_csv.len(), 2);
    assert_eq!(parsed_csv[0]["email"], json!("alice@docpine.dev"));

    let json_exported = format_export_payload(
        DatabaseEngine::Postgres,
        Some("public"),
        "profiles",
        &DataFormat::Json,
        &sample_rows,
    )
    .expect("JSON export failed");

    let parsed_json = parse_import_payload(&DataFormat::Json, &json_exported)
        .expect("JSON import failed");
    assert_eq!(parsed_json.len(), 2);
    assert_eq!(parsed_json[1]["user_id"], json!(1002));
}

#[test]
fn test_schema_change_ddl_and_safety_flow() {
    let create_table = SchemaChangeRequest {
        database: "ecom".to_string(),
        schema: Some("public".to_string()),
        container: "products".to_string(),
        change: SchemaChangeAction::CreateContainer {
            columns: vec![
                ColumnMeta {
                    name: "id".to_string(),
                    data_type: "BIGSERIAL".to_string(),
                    is_primary_key: true,
                    is_nullable: false,
                    default_value: None,
                    foreign_key_target: None,
                },
                ColumnMeta {
                    name: "sku".to_string(),
                    data_type: "VARCHAR(64)".to_string(),
                    is_primary_key: false,
                    is_nullable: false,
                    default_value: None,
                    foreign_key_target: None,
                },
            ],
        },
    };

    // Postgres DDL
    let pg_ddl = generate_ddl_statement(DatabaseEngine::Postgres, &create_table)
        .expect("Postgres DDL failed");
    assert!(pg_ddl.contains(r#"CREATE TABLE "public"."products""#));
    assert!(pg_ddl.contains(r#"PRIMARY KEY ("id")"#));

    // MySQL DDL
    let mysql_ddl = generate_ddl_statement(DatabaseEngine::Mysql, &create_table)
        .expect("MySQL DDL failed");
    assert!(mysql_ddl.contains(r#"CREATE TABLE `public`.`products`"#));
    assert!(mysql_ddl.contains(r#"PRIMARY KEY (`id`)"#));

    // Safety checks on DDL in Read-Only mode should be rejected
    let ro_check = inspect_query_safety(
        DatabaseEngine::Postgres,
        SafetyMode::ReadOnly,
        &pg_ddl,
        false,
    );
    assert!(matches!(ro_check, Err(AppError::SafetyBlocked(_))));

    // Safety checks on DDL in Safe mode should pass
    let safe_check = inspect_query_safety(
        DatabaseEngine::Postgres,
        SafetyMode::Safe,
        &pg_ddl,
        false,
    );
    assert!(safe_check.is_ok());
    assert!(safe_check.unwrap().is_mutation);
}
