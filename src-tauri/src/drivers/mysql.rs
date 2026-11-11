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
use mysql_async::prelude::*;
use mysql_async::{Conn, OptsBuilder, Pool, Row, SslOpts, Value as MyValue};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::time::Instant;

pub struct MySqlDriver {
    default_database: String,
    pool: Pool,
}

impl MySqlDriver {
    pub async fn connect(
        host: String,
        port: u16,
        username: String,
        password: Option<String>,
        default_database: String,
        ssl: SslConfig,
    ) -> AppResult<Self> {
        let mut builder = OptsBuilder::default()
            .ip_or_hostname(host)
            .tcp_port(port)
            .user(Some(username))
            .pass(password);

        if !default_database.trim().is_empty() {
            builder = builder.db_name(Some(default_database.trim().to_string()));
        }

        if ssl.enabled {
            let mut ssl_opts = SslOpts::default();
            if !ssl.reject_unauthorized {
                ssl_opts = ssl_opts.with_danger_accept_invalid_certs(true);
            }
            builder = builder.ssl_opts(Some(ssl_opts));
        }

        let pool = Pool::new(builder);
        let driver = Self {
            default_database,
            pool,
        };
        let _ = driver.ping().await?;
        Ok(driver)
    }

    async fn get_conn(&self, database: &str) -> AppResult<Conn> {
        let mut conn = self
            .pool
            .get_conn()
            .await
            .map_err(|e| AppError::Connection(format!("MySQL connection error: {e}")))?;

        let db = if database.trim().is_empty() {
            self.default_database.trim()
        } else {
            database.trim()
        };

        if !db.is_empty() {
            let use_sql = format!("USE `{}`", db.replace('`', "``"));
            conn.query_drop(use_sql).await.map_err(|e| {
                AppError::Connection(format!("Failed to select MySQL database '{db}': {e}"))
            })?;
        }

        Ok(conn)
    }
}

pub fn mysql_value_to_json(val: MyValue) -> Value {
    match val {
        MyValue::NULL => Value::Null,
        MyValue::Bytes(bytes) => match String::from_utf8(bytes) {
            Ok(s) => {
                if (s.starts_with('{') && s.ends_with('}'))
                    || (s.starts_with('[') && s.ends_with(']'))
                {
                    serde_json::from_str(&s).unwrap_or(Value::String(s))
                } else {
                    Value::String(s)
                }
            }
            Err(err) => Value::String(format!("0x{}", hex_encode(err.as_bytes()))),
        },
        MyValue::Int(i) => json!(i),
        MyValue::UInt(u) => json!(u),
        MyValue::Float(f) => json!(f),
        MyValue::Double(d) => json!(d),
        MyValue::Date(year, month, day, hour, minute, second, micro) => {
            if hour == 0 && minute == 0 && second == 0 && micro == 0 {
                Value::String(format!("{year:04}-{month:02}-{day:02}"))
            } else {
                Value::String(format!(
                    "{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}"
                ))
            }
        }
        MyValue::Time(is_neg, days, hours, minutes, seconds, _micros) => {
            let sign = if is_neg { "-" } else { "" };
            let total_hours = days * 24 + (hours as u32);
            Value::String(format!("{sign}{total_hours:02}:{minutes:02}:{seconds:02}"))
        }
    }
}

fn hex_encode(bytes: &[u8]) -> String {
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        s.push_str(&format!("{b:02x}"));
    }
    s
}

fn row_to_json_object(mut row: Row) -> Value {
    let cols = row.columns_ref().to_vec();
    let mut map = serde_json::Map::with_capacity(cols.len());
    for (idx, col) in cols.iter().enumerate() {
        let name = col.name_str().into_owned();
        let val = row.take::<MyValue, _>(idx).unwrap_or(MyValue::NULL);
        map.insert(name, mysql_value_to_json(val));
    }
    Value::Object(map)
}

#[async_trait::async_trait]
impl WorkspaceDriver for MySqlDriver {
    async fn ping(&self) -> AppResult<u64> {
        let start = Instant::now();
        let mut conn = self.get_conn("").await?;
        conn.query_drop("SELECT 1")
            .await
            .map_err(|e| AppError::Connection(format!("MySQL ping failed: {e}")))?;
        Ok(start.elapsed().as_millis() as u64)
    }

    async fn list_databases(&self) -> AppResult<Vec<String>> {
        let mut conn = self.get_conn("").await?;
        let dbs: Vec<String> = conn
            .query("SHOW DATABASES")
            .await
            .map_err(|e| AppError::Query(format!("Failed to list MySQL databases: {e}")))?;

        Ok(dbs
            .into_iter()
            .filter(|d| {
                !matches!(
                    d.as_str(),
                    "information_schema" | "performance_schema" | "sys" | "mysql"
                )
            })
            .collect())
    }

    async fn get_schema_overview(&self, database: &str) -> AppResult<SchemaOverview> {
        let db = if database.trim().is_empty() {
            &self.default_database
        } else {
            database.trim()
        };
        let mut conn = self.get_conn(db).await?;

        let table_rows: Vec<(String, String, Option<u64>)> = conn
            .exec(
                r#"
                SELECT TABLE_NAME, TABLE_TYPE, TABLE_ROWS
                FROM information_schema.TABLES
                WHERE TABLE_SCHEMA = ?
                ORDER BY TABLE_NAME
                "#,
                (db,),
            )
            .await
            .map_err(|e| AppError::Query(format!("Failed to list MySQL tables: {e}")))?;

        let mut containers: Vec<ContainerSummary> = table_rows
            .into_iter()
            .map(|(name, ttype, est)| {
                let is_view = ttype.contains("VIEW");
                ContainerSummary {
                    name,
                    schema: None,
                    kind: if is_view {
                        ContainerKind::View
                    } else {
                        ContainerKind::Table
                    },
                    // InnoDB TABLE_ROWS is a cached estimate (often 0 for new or
                    // recently loaded tables), so treat 0 as "unknown".
                    estimated_rows: if is_view { None } else { est.filter(|v| *v > 0) },
                    row_count_capped: false,
                }
            })
            .collect();

        // Bounded exact count for tables with no usable estimate.
        for c in containers
            .iter_mut()
            .filter(|c| matches!(c.kind, ContainerKind::Table) && c.estimated_rows.is_none())
        {
            let sql = bounded_count_sql(DatabaseEngine::Mysql, None, &c.name);
            if let Ok(Some(n)) = conn.query_first::<u64, _>(sql).await {
                c.estimated_rows = Some(n.min(EXACT_COUNT_CAP));
                c.row_count_capped = n > EXACT_COUNT_CAP;
            }
        }

        let fk_rows: Vec<(String, String, String, String, String)> = conn
            .exec(
                r#"
                SELECT
                    CONSTRAINT_NAME,
                    TABLE_NAME,
                    COLUMN_NAME,
                    REFERENCED_TABLE_NAME,
                    REFERENCED_COLUMN_NAME
                FROM information_schema.KEY_COLUMN_USAGE
                WHERE TABLE_SCHEMA = ?
                  AND REFERENCED_TABLE_NAME IS NOT NULL
                ORDER BY TABLE_NAME
                "#,
                (db,),
            )
            .await
            .unwrap_or_default();

        let mut foreign_keys = Vec::new();
        let mut fk_lookup = HashMap::new();
        for (cname, src_table, src_col, tgt_table, tgt_col) in fk_rows {
            fk_lookup.insert(
                format!("{src_table}.{src_col}"),
                format!("{tgt_table}.{tgt_col}"),
            );
            foreign_keys.push(ForeignKeyEdge {
                constraint_name: cname,
                source_schema: None,
                source_container: src_table,
                source_column: src_col,
                target_schema: None,
                target_container: tgt_table,
                target_column: tgt_col,
                on_delete: None,
            });
        }

        let col_rows: Vec<(String, String, String, String, String, Option<String>)> = conn
            .exec(
                r#"
                SELECT
                    TABLE_NAME,
                    COLUMN_NAME,
                    COLUMN_TYPE,
                    IS_NULLABLE,
                    COLUMN_KEY,
                    COLUMN_DEFAULT
                FROM information_schema.COLUMNS
                WHERE TABLE_SCHEMA = ?
                ORDER BY TABLE_NAME, ORDINAL_POSITION
                "#,
                (db,),
            )
            .await
            .unwrap_or_default();

        let mut columns_by_container: HashMap<String, Vec<ColumnMeta>> = HashMap::new();
        for (tname, cname, ctype, is_null, ckey, cdef) in col_rows {
            let fk_key = format!("{tname}.{cname}");
            columns_by_container
                .entry(tname)
                .or_default()
                .push(ColumnMeta {
                    name: cname,
                    data_type: ctype,
                    is_primary_key: ckey.eq_ignore_ascii_case("PRI"),
                    is_nullable: is_null.eq_ignore_ascii_case("YES"),
                    default_value: cdef,
                    foreign_key_target: fk_lookup.get(&fk_key).cloned(),
                });
        }

        Ok(SchemaOverview {
            database: db.to_string(),
            schemas: vec![],
            containers,
            columns_by_container,
            foreign_keys,
        })
    }

    async fn inspect_container(
        &self,
        database: &str,
        _schema: Option<&str>,
        name: &str,
    ) -> AppResult<ContainerStructure> {
        let overview = self.get_schema_overview(database).await?;
        let columns = overview
            .columns_by_container
            .get(name)
            .cloned()
            .unwrap_or_default();
        let foreign_keys: Vec<ForeignKeyEdge> = overview
            .foreign_keys
            .into_iter()
            .filter(|fk| fk.source_container == name)
            .collect();

        let mut conn = self.get_conn(&overview.database).await?;
        let idx_rows: Vec<(String, u8, String, String)> = conn
            .exec(
                r#"
                SELECT INDEX_NAME, NON_UNIQUE, COLUMN_NAME, INDEX_TYPE
                FROM information_schema.STATISTICS
                WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
                ORDER BY INDEX_NAME, SEQ_IN_INDEX
                "#,
                (&overview.database, name),
            )
            .await
            .unwrap_or_default();

        let mut idx_map: HashMap<String, IndexDefinition> = HashMap::new();
        for (idx_name, non_unique, col_name, idx_type) in idx_rows {
            let entry = idx_map
                .entry(idx_name.clone())
                .or_insert_with(|| IndexDefinition {
                    is_primary: idx_name == "PRIMARY",
                    name: idx_name,
                    columns: Vec::new(),
                    is_unique: non_unique == 0,
                    index_type: Some(idx_type),
                });
            entry.columns.push(col_name);
        }

        let ddl_preview = generate_ddl_statement(
            DatabaseEngine::Mysql,
            &SchemaChangeRequest {
                database: overview.database.clone(),
                schema: None,
                container: name.to_string(),
                change: crate::models::SchemaChangeAction::CreateContainer {
                    columns: columns.clone(),
                },
            },
        )
        .ok();

        Ok(ContainerStructure {
            database: overview.database,
            schema: None,
            name: name.to_string(),
            kind: ContainerKind::Table,
            columns,
            indexes: idx_map.into_values().collect(),
            foreign_keys,
            ddl_statement: ddl_preview,
        })
    }

    async fn fetch_data_page(&self, req: &DataPageRequest) -> AppResult<DataPageResult> {
        let start = Instant::now();
        let mut norm_req = req.clone();
        norm_req.schema = None;

        let structure = self
            .inspect_container(&req.database, None, &req.container)
            .await?;

        let primary_keys: Vec<String> = structure
            .columns
            .iter()
            .filter(|c| c.is_primary_key)
            .map(|c| c.name.clone())
            .collect();

        let (select_sql, count_sql) = build_select_page_queries(DatabaseEngine::Mysql, &norm_req);

        let mut conn = self.get_conn(&req.database).await?;
        let raw_rows: Vec<Row> = conn
            .query(&select_sql)
            .await
            .map_err(|e| AppError::Query(format!("MySQL query failed: {e}")))?;

        let rows: Vec<Value> = raw_rows.into_iter().map(row_to_json_object).collect();
        let total_count: Option<u64> = conn.query_first(&count_sql).await.ok().flatten();

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
        norm_req.schema = None;
        generate_mutation_statements(DatabaseEngine::Mysql, &norm_req)
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

        let mut conn = self.get_conn(&req.database).await?;
        let mut tx = conn
            .start_transaction(mysql_async::TxOpts::default())
            .await
            .map_err(|e| AppError::Query(format!("Failed to start MySQL transaction: {e}")))?;

        for stmt in &statements {
            tx.query_drop(stmt).await.map_err(|e| {
                AppError::Query(format!("Failed executing MySQL statement `{stmt}`: {e}"))
            })?;
        }

        tx.commit()
            .await
            .map_err(|e| AppError::Query(format!("Failed to commit MySQL transaction: {e}")))?;

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
        norm.schema = None;
        generate_ddl_statement(DatabaseEngine::Mysql, &norm)
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
        let trimmed = query.trim();
        if trimmed.is_empty() {
            return Err(AppError::Validation("Query cannot be empty".into()));
        }

        let mut conn = self.get_conn(database).await?;
        let raw_rows: Vec<Row> = conn
            .query(trimmed)
            .await
            .map_err(|e| AppError::Query(format!("MySQL query execution failed: {e}")))?;

        let affected = conn.affected_rows();
        let mut columns = Vec::new();
        if let Some(first) = raw_rows.first() {
            columns = first
                .columns_ref()
                .iter()
                .map(|c| ColumnMeta {
                    name: c.name_str().into_owned(),
                    data_type: format!("{:?}", c.column_type()),
                    is_primary_key: false,
                    is_nullable: true,
                    default_value: None,
                    foreign_key_target: None,
                })
                .collect();
        }

        let rows: Vec<Value> = raw_rows.into_iter().map(row_to_json_object).collect();
        let first_word = trimmed
            .split_whitespace()
            .next()
            .unwrap_or("")
            .to_uppercase();
        let is_mutation = !matches!(
            first_word.as_str(),
            "SELECT" | "SHOW" | "DESCRIBE" | "EXPLAIN"
        );

        Ok(QueryExecutionResult {
            columns,
            rows: rows.clone(),
            affected_rows: Some(if rows.is_empty() {
                affected
            } else {
                rows.len() as u64
            }),
            execution_ms: start.elapsed().as_millis() as u64,
            query: query.to_string(),
            is_mutation,
            message: Some(if is_mutation {
                format!("Query executed ({affected} row(s) affected)")
            } else {
                format!("Returned {} row(s)", rows.len())
            }),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::RecordUpdate;

    #[test]
    fn test_mysql_value_conversions() {
        assert_eq!(mysql_value_to_json(MyValue::NULL), Value::Null);
        assert_eq!(mysql_value_to_json(MyValue::Int(-99)), json!(-99));
        assert_eq!(
            mysql_value_to_json(MyValue::Date(2026, 11, 11, 0, 0, 0, 0)),
            json!("2026-11-11")
        );
        assert_eq!(
            mysql_value_to_json(MyValue::Bytes(b"{\"role\":\"admin\"}".to_vec())),
            json!({"role": "admin"})
        );
    }

    #[test]
    fn test_mysql_mutation_preview_backticks() {
        let mut id = HashMap::new();
        id.insert("order_id".to_string(), json!(101));

        let mut changes = HashMap::new();
        changes.insert("status".to_string(), json!("shipped"));

        let req = StagedBatchRequest {
            database: "shop".into(),
            schema: None,
            container: "orders".into(),
            inserts: vec![],
            updates: vec![RecordUpdate {
                identity: id,
                changes,
                original: HashMap::new(),
            }],
            deletes: vec![],
            atomic: true,
        };

        let stmts = generate_mutation_statements(DatabaseEngine::Mysql, &req).unwrap();
        assert_eq!(
            stmts,
            vec!["UPDATE `orders` SET `status` = 'shipped' WHERE `order_id` = 101;"]
        );
    }
}
