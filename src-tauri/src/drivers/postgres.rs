use crate::drivers::sql_helpers::{
    bounded_count_sql, build_select_page_queries, generate_ddl_statement,
    generate_mutation_statements, EXACT_COUNT_CAP,
};
use crate::drivers::WorkspaceDriver;
use crate::error::{AppError, AppResult};
use crate::models::{
    ColumnMeta, ContainerKind, ContainerStructure, ContainerSummary, DataPageRequest,
    DataPageResult, DatabaseEngine, ForeignKeyEdge, IndexDefinition, MutationResult,
    QueryExecutionResult, SchemaChangeRequest, SchemaOverview, SslConfig, StagedBatchRequest,
};
use deadpool_postgres::{Manager, ManagerConfig, Pool, RecyclingMethod, Runtime};
use native_tls::TlsConnector;
use postgres_native_tls::MakeTlsConnector;
use serde_json::Value;
use std::collections::HashMap;
use std::time::Instant;
use tokio::sync::RwLock;
use tokio_postgres::NoTls;

pub struct PostgresDriver {
    host: String,
    port: u16,
    username: String,
    password: Option<String>,
    default_database: String,
    ssl: SslConfig,
    pools: RwLock<HashMap<String, Pool>>,
}

impl PostgresDriver {
    pub async fn connect(
        host: String,
        port: u16,
        username: String,
        password: Option<String>,
        default_database: String,
        ssl: SslConfig,
    ) -> AppResult<Self> {
        let default_db = if default_database.trim().is_empty() {
            "postgres".to_string()
        } else {
            default_database.trim().to_string()
        };

        let driver = Self {
            host,
            port,
            username,
            password,
            default_database: default_db,
            ssl,
            pools: RwLock::new(HashMap::new()),
        };
        let _ = driver.ping().await?;
        Ok(driver)
    }

    async fn open_client(&self, database: &str) -> AppResult<deadpool_postgres::Client> {
        let db_name = if database.trim().is_empty() {
            &self.default_database
        } else {
            database.trim()
        };

        {
            let r = self.pools.read().await;
            if let Some(pool) = r.get(db_name) {
                let client = pool.get().await.map_err(|e| {
                    AppError::Connection(format!("PostgreSQL pool checkout failed: {e}"))
                })?;
                return Ok(client);
            }
        }

        let mut cfg = tokio_postgres::Config::new();
        cfg.host(&self.host);
        cfg.port(self.port);
        cfg.user(&self.username);
        if let Some(ref pw) = self.password {
            cfg.password(pw);
        }
        cfg.dbname(db_name);

        let mgr_config = ManagerConfig {
            recycling_method: RecyclingMethod::Fast,
        };

        let pool = if self.ssl.enabled {
            let mut builder = TlsConnector::builder();
            if !self.ssl.reject_unauthorized {
                builder.danger_accept_invalid_certs(true);
            }
            let connector = builder
                .build()
                .map_err(|e| AppError::Connection(format!("TLS initialization error: {e}")))?;
            let tls = MakeTlsConnector::new(connector);
            let mgr = Manager::from_config(cfg, tls, mgr_config);
            Pool::builder(mgr)
                .max_size(8)
                .runtime(Runtime::Tokio1)
                .build()
                .map_err(|e| AppError::Connection(format!("Failed to build Postgres pool: {e}")))?
        } else {
            let mgr = Manager::from_config(cfg, NoTls, mgr_config);
            Pool::builder(mgr)
                .max_size(8)
                .runtime(Runtime::Tokio1)
                .build()
                .map_err(|e| AppError::Connection(format!("Failed to build Postgres pool: {e}")))?
        };

        let client = pool.get().await.map_err(|e| {
            AppError::Connection(format!("PostgreSQL initial pool checkout failed: {e}"))
        })?;

        let mut w = self.pools.write().await;
        w.insert(db_name.to_string(), pool);
        Ok(client)
    }
}

#[async_trait::async_trait]
impl WorkspaceDriver for PostgresDriver {
    async fn ping(&self) -> AppResult<u64> {
        let start = Instant::now();
        let client = self.open_client(&self.default_database).await?;
        client
            .simple_query("SELECT 1;")
            .await
            .map_err(|e| AppError::Connection(format!("PostgreSQL ping failed: {e}")))?;
        Ok(start.elapsed().as_millis() as u64)
    }

    async fn list_databases(&self) -> AppResult<Vec<String>> {
        let client = self.open_client(&self.default_database).await?;
        let rows = client
            .query(
                "SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname;",
                &[],
            )
            .await
            .map_err(|e| AppError::Query(format!("Failed to list PostgreSQL databases: {e}")))?;

        Ok(rows.into_iter().map(|r| r.get::<_, String>(0)).collect())
    }

    async fn get_schema_overview(&self, database: &str) -> AppResult<SchemaOverview> {
        let client = self.open_client(database).await?;

        let schema_rows = client
            .query(
                r#"
                SELECT schema_name
                FROM information_schema.schemata
                WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
                  AND schema_name NOT LIKE 'pg_temp_%'
                  AND schema_name NOT LIKE 'pg_toast_temp_%'
                ORDER BY schema_name;
                "#,
                &[],
            )
            .await
            .map_err(|e| AppError::Query(format!("Failed to list schemas: {e}")))?;

        let schemas: Vec<String> = schema_rows.into_iter().map(|r| r.get(0)).collect();

        let table_rows = client
            .query(
                r#"
                SELECT
                    t.table_schema,
                    t.table_name,
                    t.table_type,
                    c.reltuples::bigint AS est_rows,
                    s.n_live_tup::bigint AS live_rows
                FROM information_schema.tables t
                LEFT JOIN pg_namespace n ON n.nspname = t.table_schema
                LEFT JOIN pg_class c ON c.relnamespace = n.oid AND c.relname = t.table_name
                LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
                WHERE t.table_schema NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
                ORDER BY t.table_schema, t.table_name;
                "#,
                &[],
            )
            .await
            .map_err(|e| AppError::Query(format!("Failed to list tables: {e}")))?;

        let mut containers = Vec::new();
        for row in table_rows {
            let schema_name: String = row.get(0);
            let table_name: String = row.get(1);
            let table_type: String = row.get(2);
            // `reltuples` is -1 (never analyzed, PG14+) or 0 until ANALYZE/autovacuum
            // runs, so fall back to live tuple stats when the estimate is unusable.
            let est_rows: Option<i64> = row.get(3);
            let live_rows: Option<i64> = row.get(4);
            let known = est_rows
                .filter(|v| *v > 0)
                .or(live_rows.filter(|v| *v > 0))
                .map(|v| v as u64);
            let kind = if table_type.contains("VIEW") {
                ContainerKind::View
            } else {
                ContainerKind::Table
            };
            containers.push(ContainerSummary {
                name: table_name,
                schema: Some(schema_name),
                kind,
                estimated_rows: known,
                row_count_capped: false,
            });
        }

        // For base tables with no usable statistics, run a bounded exact count
        // (pipelined concurrently on the same connection).
        let pending: Vec<usize> = containers
            .iter()
            .enumerate()
            .filter(|(_, c)| matches!(c.kind, ContainerKind::Table) && c.estimated_rows.is_none())
            .map(|(i, _)| i)
            .collect();

        let count_futures = pending.iter().map(|&i| {
            let c = &containers[i];
            let sql = bounded_count_sql(DatabaseEngine::Postgres, c.schema.as_deref(), &c.name);
            let client_ref = &client;
            async move {
                client_ref
                    .query_one(&sql, &[])
                    .await
                    .ok()
                    .map(|r| r.get::<_, i64>(0).max(0) as u64)
            }
        });
        let counts = futures::future::join_all(count_futures).await;
        for (&i, count) in pending.iter().zip(counts) {
            if let Some(n) = count {
                containers[i].estimated_rows = Some(n.min(EXACT_COUNT_CAP));
                containers[i].row_count_capped = n > EXACT_COUNT_CAP;
            }
        }

        let fk_rows = client
            .query(
                r#"
                SELECT
                    tc.constraint_name,
                    tc.table_schema AS source_schema,
                    tc.table_name AS source_table,
                    kcu.column_name AS source_column,
                    ccu.table_schema AS target_schema,
                    ccu.table_name AS target_table,
                    ccu.column_name AS target_column,
                    rc.delete_rule
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu
                  ON tc.constraint_name = kcu.constraint_name
                 AND tc.table_schema = kcu.table_schema
                JOIN information_schema.constraint_column_usage ccu
                  ON ccu.constraint_name = tc.constraint_name
                 AND ccu.table_schema = tc.table_schema
                LEFT JOIN information_schema.referential_constraints rc
                  ON rc.constraint_name = tc.constraint_name
                 AND rc.constraint_schema = tc.table_schema
                WHERE tc.constraint_type = 'FOREIGN KEY'
                ORDER BY tc.table_schema, tc.table_name;
                "#,
                &[],
            )
            .await
            .unwrap_or_default();

        let mut foreign_keys = Vec::new();
        let mut fk_lookup: HashMap<String, String> = HashMap::new();
        for r in fk_rows {
            let source_schema: String = r.get(1);
            let source_table: String = r.get(2);
            let source_column: String = r.get(3);
            let target_schema: String = r.get(4);
            let target_table: String = r.get(5);
            let target_column: String = r.get(6);

            fk_lookup.insert(
                format!("{source_schema}.{source_table}.{source_column}"),
                format!("{target_schema}.{target_table}.{target_column}"),
            );

            foreign_keys.push(ForeignKeyEdge {
                constraint_name: r.get(0),
                source_schema: Some(source_schema),
                source_container: source_table,
                source_column,
                target_schema: Some(target_schema),
                target_container: target_table,
                target_column,
                on_delete: r.get(7),
            });
        }

        let pk_rows = client
            .query(
                r#"
                SELECT tc.table_schema, tc.table_name, kcu.column_name
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu
                  ON tc.constraint_name = kcu.constraint_name
                 AND tc.table_schema = kcu.table_schema
                WHERE tc.constraint_type = 'PRIMARY KEY';
                "#,
                &[],
            )
            .await
            .unwrap_or_default();

        let mut pk_set = std::collections::HashSet::new();
        for r in pk_rows {
            let s: String = r.get(0);
            let t: String = r.get(1);
            let c: String = r.get(2);
            pk_set.insert(format!("{s}.{t}.{c}"));
        }

        let col_rows = client
            .query(
                r#"
                SELECT
                    table_schema,
                    table_name,
                    column_name,
                    udt_name,
                    is_nullable,
                    column_default
                FROM information_schema.columns
                WHERE table_schema NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
                ORDER BY table_schema, table_name, ordinal_position;
                "#,
                &[],
            )
            .await
            .unwrap_or_default();

        let mut columns_by_container: HashMap<String, Vec<ColumnMeta>> = HashMap::new();
        for r in col_rows {
            let s: String = r.get(0);
            let t: String = r.get(1);
            let col_name: String = r.get(2);
            let data_type: String = r.get(3);
            let nullable_str: String = r.get(4);
            let col_default: Option<String> = r.get(5);

            let full_col_key = format!("{s}.{t}.{col_name}");
            let container_key = format!("{s}.{t}");
            columns_by_container
                .entry(container_key)
                .or_default()
                .push(ColumnMeta {
                    name: col_name,
                    data_type,
                    is_primary_key: pk_set.contains(&full_col_key),
                    is_nullable: nullable_str.eq_ignore_ascii_case("YES"),
                    default_value: col_default,
                    foreign_key_target: fk_lookup.get(&full_col_key).cloned(),
                });
        }

        Ok(SchemaOverview {
            database: database.to_string(),
            schemas,
            containers,
            columns_by_container,
            foreign_keys,
        })
    }

    async fn inspect_container(
        &self,
        database: &str,
        schema: Option<&str>,
        name: &str,
    ) -> AppResult<ContainerStructure> {
        let overview = self.get_schema_overview(database).await?;
        let schema_name = schema.unwrap_or("public");
        let key = format!("{schema_name}.{name}");
        let columns = overview
            .columns_by_container
            .get(&key)
            .cloned()
            .unwrap_or_default();

        let foreign_keys: Vec<ForeignKeyEdge> = overview
            .foreign_keys
            .into_iter()
            .filter(|fk| {
                fk.source_schema.as_deref() == Some(schema_name) && fk.source_container == name
            })
            .collect();

        let client = self.open_client(database).await?;
        let idx_rows = client
            .query(
                r#"
                SELECT indexname, indexdef
                FROM pg_indexes
                WHERE schemaname = $1 AND tablename = $2
                ORDER BY indexname;
                "#,
                &[&schema_name, &name],
            )
            .await
            .unwrap_or_default();

        let indexes: Vec<IndexDefinition> = idx_rows
            .into_iter()
            .map(|r| {
                let idx_name: String = r.get(0);
                let idx_def: String = r.get(1);
                let is_unique = idx_def.to_uppercase().contains("UNIQUE INDEX");
                let is_primary = idx_name.ends_with("_pkey");
                let cols = idx_def
                    .split('(')
                    .nth(1)
                    .and_then(|s| s.split(')').next())
                    .map(|s| {
                        s.split(',')
                            .map(|c| c.trim().trim_matches('"').to_string())
                            .collect()
                    })
                    .unwrap_or_default();
                IndexDefinition {
                    name: idx_name,
                    columns: cols,
                    is_unique,
                    is_primary,
                    index_type: Some("btree".into()),
                }
            })
            .collect();

        let ddl_preview = generate_ddl_statement(
            DatabaseEngine::Postgres,
            &SchemaChangeRequest {
                database: database.to_string(),
                schema: Some(schema_name.to_string()),
                container: name.to_string(),
                change: crate::models::SchemaChangeAction::CreateContainer {
                    columns: columns.clone(),
                },
            },
        )
        .ok();

        Ok(ContainerStructure {
            database: database.to_string(),
            schema: Some(schema_name.to_string()),
            name: name.to_string(),
            kind: ContainerKind::Table,
            columns,
            indexes,
            foreign_keys,
            ddl_statement: ddl_preview,
        })
    }

    async fn fetch_data_page(&self, req: &DataPageRequest) -> AppResult<DataPageResult> {
        let start = Instant::now();
        let schema_name = req.schema.as_deref().unwrap_or("public");
        let mut norm_req = req.clone();
        norm_req.schema = Some(schema_name.to_string());

        let structure = self
            .inspect_container(&req.database, Some(schema_name), &req.container)
            .await?;

        let primary_keys: Vec<String> = structure
            .columns
            .iter()
            .filter(|c| c.is_primary_key)
            .map(|c| c.name.clone())
            .collect();

        let (select_sql, count_sql) =
            build_select_page_queries(DatabaseEngine::Postgres, &norm_req);

        let client = self.open_client(&req.database).await?;
        let wrapped_sql = format!(
            "SELECT row_to_json(_docpine_row)::text FROM ({select_sql}) _docpine_row;"
        );

        let data_rows = client
            .query(&wrapped_sql, &[])
            .await
            .map_err(|e| AppError::Query(format!("Failed to fetch table rows: {e}")))?;

        let mut rows = Vec::with_capacity(data_rows.len());
        for r in data_rows {
            let json_str: String = r.get(0);
            if let Ok(val) = serde_json::from_str::<Value>(&json_str) {
                rows.push(val);
            }
        }

        let total_count = client
            .query_one(&count_sql, &[])
            .await
            .ok()
            .map(|r| r.get::<_, i64>(0).max(0) as u64);

        Ok(DataPageResult {
            columns: structure.columns,
            rows,
            primary_keys,
            total_count,
            page: req.page,
            page_size: req.page_size,
            execution_ms: start.elapsed().as_millis() as u64,
            generated_query: format!("{select_sql};"),
        })
    }

    async fn preview_mutations(&self, req: &StagedBatchRequest) -> AppResult<Vec<String>> {
        let mut norm_req = req.clone();
        if norm_req.schema.is_none() {
            norm_req.schema = Some("public".into());
        }
        generate_mutation_statements(DatabaseEngine::Postgres, &norm_req)
    }

    async fn apply_mutations(&self, req: &StagedBatchRequest) -> AppResult<MutationResult> {
        let start = Instant::now();
        let statements = self.preview_mutations(req).await?;
        if statements.is_empty() {
            return Ok(MutationResult {
                inserted_count: 0,
                updated_count: 0,
                deleted_count: 0,
                execution_ms: 0,
                statements,
            });
        }

        let mut client = self.open_client(&req.database).await?;
        let tx = client
            .transaction()
            .await
            .map_err(|e| AppError::Query(format!("Failed to begin transaction: {e}")))?;

        for stmt in &statements {
            tx.batch_execute(stmt).await.map_err(|e| {
                AppError::Query(format!("Failed executing `{stmt}`: {e}"))
            })?;
        }

        tx.commit()
            .await
            .map_err(|e| AppError::Query(format!("Failed to commit transaction: {e}")))?;

        Ok(MutationResult {
            inserted_count: req.inserts.len() as u64,
            updated_count: req.updates.len() as u64,
            deleted_count: req.deletes.len() as u64,
            execution_ms: start.elapsed().as_millis() as u64,
            statements,
        })
    }

    async fn preview_schema_change(&self, change: &SchemaChangeRequest) -> AppResult<String> {
        let mut norm = change.clone();
        if norm.schema.is_none() {
            norm.schema = Some("public".into());
        }
        generate_ddl_statement(DatabaseEngine::Postgres, &norm)
    }

    async fn apply_schema_change(
        &self,
        change: &SchemaChangeRequest,
    ) -> AppResult<QueryExecutionResult> {
        let ddl = self.preview_schema_change(change).await?;
        self.execute_raw_query(&change.database, &ddl).await
    }

    async fn execute_raw_query(
        &self,
        database: &str,
        query: &str,
    ) -> AppResult<QueryExecutionResult> {
        let start = Instant::now();
        let trimmed = query.trim().trim_end_matches(';').trim();
        if trimmed.is_empty() {
            return Err(AppError::Validation("Query cannot be empty".into()));
        }

        let client = self.open_client(database).await?;
        let first_word = trimmed
            .split_whitespace()
            .next()
            .unwrap_or("")
            .to_uppercase();

        let is_row_returning = matches!(first_word.as_str(), "SELECT" | "WITH" | "SHOW" | "EXPLAIN" | "VALUES")
            || trimmed.to_uppercase().contains(" RETURNING ");

        if is_row_returning && (first_word == "SELECT" || first_word == "WITH") {
            let wrapped = format!(
                "SELECT row_to_json(_q)::text FROM ({trimmed}) _q;"
            );
            match client.query(&wrapped, &[]).await {
                Ok(raw_rows) => {
                    let mut rows = Vec::with_capacity(raw_rows.len());
                    let mut columns = Vec::new();
                    for (idx, r) in raw_rows.into_iter().enumerate() {
                        let json_str: String = r.get(0);
                        if let Ok(val) = serde_json::from_str::<Value>(&json_str) {
                            if idx == 0 {
                                if let Some(obj) = val.as_object() {
                                    columns = obj
                                        .keys()
                                        .map(|k| ColumnMeta {
                                            name: k.clone(),
                                            data_type: "auto".into(),
                                            is_primary_key: false,
                                            is_nullable: true,
                                            default_value: None,
                                            foreign_key_target: None,
                                        })
                                        .collect();
                                }
                            }
                            rows.push(val);
                        }
                    }
                    let count = rows.len() as u64;
                    return Ok(QueryExecutionResult {
                        columns,
                        rows,
                        affected_rows: Some(count),
                        execution_ms: start.elapsed().as_millis() as u64,
                        query: query.to_string(),
                        is_mutation: false,
                        message: Some(format!("Returned {count} row(s)")),
                    });
                }
                Err(_) => {
                    // Fall through to simple_query if row_to_json wrapping doesn't apply
                }
            }
        }

        let messages = client
            .simple_query(query)
            .await
            .map_err(|e| AppError::Query(format!("PostgreSQL query error: {e}")))?;

        let mut columns = Vec::new();
        let mut rows = Vec::new();
        let mut affected = 0u64;

        for msg in messages {
            match msg {
                tokio_postgres::SimpleQueryMessage::Row(row) => {
                    if columns.is_empty() {
                        columns = row
                            .columns()
                            .iter()
                            .map(|c| ColumnMeta {
                                name: c.name().to_string(),
                                data_type: "text".to_string(),
                                is_primary_key: false,
                                is_nullable: true,
                                default_value: None,
                                foreign_key_target: None,
                            })
                            .collect();
                    }
                    let mut obj = serde_json::Map::new();
                    for (i, col) in row.columns().iter().enumerate() {
                        let v = row
                            .get(i)
                            .map(|s| Value::String(s.to_string()))
                            .unwrap_or(Value::Null);
                        obj.insert(col.name().to_string(), v);
                    }
                    rows.push(Value::Object(obj));
                }
                tokio_postgres::SimpleQueryMessage::CommandComplete(cnt) => {
                    affected += cnt;
                }
                _ => {}
            }
        }

        let is_mutation = !matches!(first_word.as_str(), "SELECT" | "SHOW" | "EXPLAIN");
        Ok(QueryExecutionResult {
            columns,
            rows,
            affected_rows: Some(affected),
            execution_ms: start.elapsed().as_millis() as u64,
            query: query.to_string(),
            is_mutation,
            message: Some(format!("Command completed ({affected} row(s) affected)")),
        })
    }
}
