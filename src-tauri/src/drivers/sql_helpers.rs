use crate::error::{AppError, AppResult};
use crate::models::{
    ColumnMeta, DataPageRequest, DatabaseEngine, FilterOperator, FilterRule, SchemaChangeAction,
    SchemaChangeRequest, SortRule, StagedBatchRequest,
};
use serde_json::Value;
use std::collections::HashMap;

/// Upper bound for exact row counts used when table statistics are unavailable.
/// Keeps sidebar introspection fast on very large, never-analyzed tables.
pub const EXACT_COUNT_CAP: u64 = 100_000;

/// Builds `SELECT COUNT(*)` over at most `EXACT_COUNT_CAP + 1` rows, so callers can
/// tell whether the true count exceeds the cap.
pub fn bounded_count_sql(engine: DatabaseEngine, schema: Option<&str>, table: &str) -> String {
    let table_ref = qualified_table(engine, schema, table);
    format!(
        "SELECT COUNT(*) FROM (SELECT 1 FROM {table_ref} LIMIT {}) AS _docpine_cnt",
        EXACT_COUNT_CAP + 1
    )
}

pub fn quote_ident(engine: DatabaseEngine, ident: &str) -> String {
    match engine {
        DatabaseEngine::Postgres => format!("\"{}\"", ident.replace('"', "\"\"")),
        DatabaseEngine::Mysql => format!("`{}`", ident.replace('`', "``")),
        DatabaseEngine::Mongodb => ident.to_string(),
    }
}

pub fn qualified_table(engine: DatabaseEngine, schema: Option<&str>, table: &str) -> String {
    match schema.filter(|s| !s.is_empty()) {
        Some(s) => format!(
            "{}.{}",
            quote_ident(engine, s),
            quote_ident(engine, table)
        ),
        None => quote_ident(engine, table),
    }
}

pub fn sql_literal(val: &Value) -> String {
    match val {
        Value::Null => "NULL".to_string(),
        Value::Bool(b) => {
            if *b {
                "TRUE".to_string()
            } else {
                "FALSE".to_string()
            }
        }
        Value::Number(n) => n.to_string(),
        Value::String(s) => format!("'{}'", s.replace('\'', "''")),
        Value::Array(_) | Value::Object(_) => {
            let json_str = serde_json::to_string(val).unwrap_or_else(|_| "{}".to_string());
            format!("'{}'", json_str.replace('\'', "''"))
        }
    }
}

pub fn sql_filter_literal(engine: DatabaseEngine, raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.eq_ignore_ascii_case("true") {
        return "TRUE".to_string();
    }
    if trimmed.eq_ignore_ascii_case("false") {
        return "FALSE".to_string();
    }
    if trimmed.eq_ignore_ascii_case("null") {
        return "NULL".to_string();
    }
    // Check if integer (e.g. 123, -45)
    if trimmed.parse::<i64>().is_ok() {
        return trimmed.to_string();
    }
    // Check if standard decimal number
    if !trimmed.contains(['e', 'E'])
        && trimmed
            .parse::<f64>()
            .map(|v| v.is_finite())
            .unwrap_or(false)
    {
        return trimmed.to_string();
    }
    // PostgreSQL UUID check
    if matches!(engine, DatabaseEngine::Postgres) && uuid::Uuid::parse_str(trimmed).is_ok() {
        return format!("'{}'::uuid", trimmed.replace('\'', "''"));
    }
    // Default safe string literal
    format!("'{}'", trimmed.replace('\'', "''"))
}

pub fn build_where_clause(
    engine: DatabaseEngine,
    filters: &[FilterRule],
    raw_filter: Option<&str>,
) -> String {
    let mut parts: Vec<String> = Vec::new();

    for rule in filters.iter().filter(|r| r.enabled && !r.field.trim().is_empty()) {
        let col = quote_ident(engine, rule.field.trim());
        let val = sql_filter_literal(engine, &rule.value);
        let escaped_val = rule.value.replace('\'', "''");
        let cond = match rule.operator {
            FilterOperator::Eq => {
                if val == "NULL" {
                    format!("{col} IS NULL")
                } else {
                    format!("{col} = {val}")
                }
            }
            FilterOperator::Neq => {
                if val == "NULL" {
                    format!("{col} IS NOT NULL")
                } else {
                    format!("{col} != {val}")
                }
            }
            FilterOperator::Gt => format!("{col} > {val}"),
            FilterOperator::Gte => format!("{col} >= {val}"),
            FilterOperator::Lt => format!("{col} < {val}"),
            FilterOperator::Lte => format!("{col} <= {val}"),
            FilterOperator::Contains => match engine {
                DatabaseEngine::Postgres => format!("{col}::text ILIKE '%{}%'", escaped_val),
                _ => format!("{col} LIKE '%{}%'", escaped_val),
            },
            FilterOperator::StartsWith => match engine {
                DatabaseEngine::Postgres => format!("{col}::text ILIKE '{}%'", escaped_val),
                _ => format!("{col} LIKE '{}%'", escaped_val),
            },
            FilterOperator::In => {
                let items: Vec<String> = rule
                    .value
                    .split(',')
                    .map(|item| sql_filter_literal(engine, item.trim()))
                    .collect();
                format!("{col} IN ({})", items.join(", "))
            }
            FilterOperator::IsNull => format!("{col} IS NULL"),
            FilterOperator::IsNotNull => format!("{col} IS NOT NULL"),
        };
        parts.push(cond);
    }

    if let Some(raw) = raw_filter.map(str::trim).filter(|s| !s.is_empty()) {
        let stripped = raw
            .strip_prefix("WHERE ")
            .or_else(|| raw.strip_prefix("where "))
            .unwrap_or(raw);
        parts.push(format!("({stripped})"));
    }

    if parts.is_empty() {
        String::new()
    } else {
        format!(" WHERE {}", parts.join(" AND "))
    }
}

pub fn build_order_by_clause(engine: DatabaseEngine, sorts: &[SortRule]) -> String {
    if sorts.is_empty() {
        return String::new();
    }
    let items: Vec<String> = sorts
        .iter()
        .filter(|s| !s.field.trim().is_empty())
        .map(|s| {
            let dir = if s.descending { "DESC" } else { "ASC" };
            format!("{} {dir}", quote_ident(engine, s.field.trim()))
        })
        .collect();
    if items.is_empty() {
        String::new()
    } else {
        format!(" ORDER BY {}", items.join(", "))
    }
}

pub fn build_select_page_queries(
    engine: DatabaseEngine,
    req: &DataPageRequest,
) -> (String, String) {
    let table_ref = qualified_table(engine, req.schema.as_deref(), &req.container);
    let where_clause = build_where_clause(engine, &req.filters, req.raw_filter.as_deref());
    let order_clause = build_order_by_clause(engine, &req.sorts);
    let page_size = req.page_size.clamp(1, 5000);
    let offset = req.page.saturating_sub(1) * page_size;

    let select_sql =
        format!("SELECT * FROM {table_ref}{where_clause}{order_clause} LIMIT {page_size} OFFSET {offset}");
    let count_sql = format!("SELECT COUNT(*) FROM {table_ref}{where_clause}");
    (select_sql, count_sql)
}

pub fn generate_mutation_statements(
    engine: DatabaseEngine,
    req: &StagedBatchRequest,
) -> AppResult<Vec<String>> {
    let table_ref = qualified_table(engine, req.schema.as_deref(), &req.container);
    let mut statements = Vec::new();

    for row in &req.inserts {
        let obj = row.as_object().ok_or_else(|| {
            AppError::Validation("Inserted SQL row must be a JSON object".into())
        })?;
        if obj.is_empty() {
            statements.push(format!("INSERT INTO {table_ref} DEFAULT VALUES;"));
            continue;
        }
        let mut cols = Vec::with_capacity(obj.len());
        let mut vals = Vec::with_capacity(obj.len());
        for (k, v) in obj {
            cols.push(quote_ident(engine, k));
            vals.push(sql_literal(v));
        }
        statements.push(format!(
            "INSERT INTO {table_ref} ({}) VALUES ({});",
            cols.join(", "),
            vals.join(", ")
        ));
    }

    for upd in &req.updates {
        if upd.changes.is_empty() {
            continue;
        }
        if upd.identity.is_empty() {
            return Err(AppError::Validation(
                "Cannot generate UPDATE statement without primary key / row identity".into(),
            ));
        }
        let set_parts: Vec<String> = upd
            .changes
            .iter()
            .map(|(col, val)| format!("{} = {}", quote_ident(engine, col), sql_literal(val)))
            .collect();
        let where_parts = build_identity_where(engine, &upd.identity);
        statements.push(format!(
            "UPDATE {table_ref} SET {} WHERE {};",
            set_parts.join(", "),
            where_parts
        ));
    }

    for del_id in &req.deletes {
        if del_id.is_empty() {
            return Err(AppError::Validation(
                "Cannot generate DELETE statement without primary key / row identity".into(),
            ));
        }
        let where_parts = build_identity_where(engine, del_id);
        statements.push(format!("DELETE FROM {table_ref} WHERE {};", where_parts));
    }

    Ok(statements)
}

fn build_identity_where(engine: DatabaseEngine, identity: &HashMap<String, Value>) -> String {
    let mut keys: Vec<&String> = identity.keys().collect();
    keys.sort();
    keys.into_iter()
        .map(|k| {
            let v = &identity[k];
            let col = quote_ident(engine, k);
            if v.is_null() {
                format!("{col} IS NULL")
            } else {
                format!("{col} = {}", sql_literal(v))
            }
        })
        .collect::<Vec<_>>()
        .join(" AND ")
}

pub fn generate_ddl_statement(
    engine: DatabaseEngine,
    req: &SchemaChangeRequest,
) -> AppResult<String> {
    let table_ref = qualified_table(engine, req.schema.as_deref(), &req.container);

    match &req.change {
        SchemaChangeAction::CreateContainer { columns } => {
            if columns.is_empty() {
                return Err(AppError::Validation(
                    "CREATE TABLE requires at least one column definition".into(),
                ));
            }
            let mut col_defs = Vec::new();
            let mut pks = Vec::new();
            for col in columns {
                col_defs.push(format_column_def(engine, col));
                if col.is_primary_key {
                    pks.push(quote_ident(engine, &col.name));
                }
            }
            if !pks.is_empty() {
                col_defs.push(format!("PRIMARY KEY ({})", pks.join(", ")));
            }
            Ok(format!(
                "CREATE TABLE {table_ref} (\n  {}\n);",
                col_defs.join(",\n  ")
            ))
        }
        SchemaChangeAction::DropContainer => Ok(format!("DROP TABLE {table_ref};")),
        SchemaChangeAction::AddColumn { column } => Ok(format!(
            "ALTER TABLE {table_ref} ADD COLUMN {};",
            format_column_def(engine, column)
        )),
        SchemaChangeAction::DropColumn { column_name } => Ok(format!(
            "ALTER TABLE {table_ref} DROP COLUMN {};",
            quote_ident(engine, column_name)
        )),
        SchemaChangeAction::ModifyColumn { column } => match engine {
            DatabaseEngine::Postgres => Ok(format!(
                "ALTER TABLE {table_ref} ALTER COLUMN {} TYPE {};",
                quote_ident(engine, &column.name),
                column.data_type
            )),
            _ => Ok(format!(
                "ALTER TABLE {table_ref} MODIFY COLUMN {};",
                format_column_def(engine, column)
            )),
        },
        SchemaChangeAction::CreateIndex {
            index_name,
            columns,
            is_unique,
        } => {
            let unique_kw = if *is_unique { "UNIQUE " } else { "" };
            let cols: Vec<String> = columns.iter().map(|c| quote_ident(engine, c)).collect();
            Ok(format!(
                "CREATE {unique_kw}INDEX {} ON {table_ref} ({});",
                quote_ident(engine, index_name),
                cols.join(", ")
            ))
        }
        SchemaChangeAction::DropIndex { index_name } => match engine {
            DatabaseEngine::Postgres => {
                let idx_ref = qualified_table(engine, req.schema.as_deref(), index_name);
                Ok(format!("DROP INDEX {idx_ref};"))
            }
            _ => Ok(format!(
                "DROP INDEX {} ON {table_ref};",
                quote_ident(engine, index_name)
            )),
        },
    }
}

fn format_column_def(engine: DatabaseEngine, col: &ColumnMeta) -> String {
    let mut parts = vec![quote_ident(engine, &col.name), col.data_type.clone()];
    if !col.is_nullable {
        parts.push("NOT NULL".to_string());
    }
    if let Some(ref def_val) = col.default_value.as_ref().filter(|s| !s.trim().is_empty()) {
        parts.push(format!("DEFAULT {def_val}"));
    }
    parts.join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::RecordUpdate;
    use serde_json::json;

    #[test]
    fn test_generate_postgres_mutation_statements() {
        let mut identity = HashMap::new();
        identity.insert("id".to_string(), json!(42));

        let mut changes = HashMap::new();
        changes.insert("name".to_string(), json!("Alice O'Connor"));
        changes.insert("active".to_string(), json!(true));

        let batch = StagedBatchRequest {
            database: "app".into(),
            schema: Some("public".into()),
            container: "users".into(),
            inserts: vec![json!({"email": "new@docpine.dev"})],
            updates: vec![RecordUpdate {
                identity: identity.clone(),
                changes,
                original: HashMap::new(),
            }],
            deletes: vec![identity],
            atomic: true,
        };

        let stmts = generate_mutation_statements(DatabaseEngine::Postgres, &batch)
            .expect("should build SQL statements");

        assert_eq!(stmts.len(), 3);
        assert_eq!(
            stmts[0],
            r#"INSERT INTO "public"."users" ("email") VALUES ('new@docpine.dev');"#
        );
        assert!(stmts[1].starts_with(r#"UPDATE "public"."users" SET "#));
        assert!(stmts[1].contains(r#""name" = 'Alice O''Connor'"#));
        assert!(stmts[1].ends_with(r#"WHERE "id" = 42;"#));
        assert_eq!(stmts[2], r#"DELETE FROM "public"."users" WHERE "id" = 42;"#);
    }

    #[test]
    fn test_generate_ddl_create_table() {
        let req = SchemaChangeRequest {
            database: "app".into(),
            schema: Some("public".into()),
            container: "invoices".into(),
            change: SchemaChangeAction::CreateContainer {
                columns: vec![
                    ColumnMeta {
                        name: "id".into(),
                        data_type: "UUID".into(),
                        is_primary_key: true,
                        is_nullable: false,
                        default_value: Some("gen_random_uuid()".into()),
                        foreign_key_target: None,
                    },
                    ColumnMeta {
                        name: "amount_cents".into(),
                        data_type: "BIGINT".into(),
                        is_primary_key: false,
                        is_nullable: false,
                        default_value: Some("0".into()),
                        foreign_key_target: None,
                    },
                ],
            },
        };

        let ddl = generate_ddl_statement(DatabaseEngine::Postgres, &req).unwrap();
        assert!(ddl.contains(r#"CREATE TABLE "public"."invoices""#));
        assert!(ddl.contains(r#""id" UUID NOT NULL DEFAULT gen_random_uuid()"#));
        assert!(ddl.contains(r#"PRIMARY KEY ("id")"#));
    }

    #[test]
    fn test_generate_ddl_alter_column_actions() {
        // Add Column
        let add_req = SchemaChangeRequest {
            database: "app".into(),
            schema: Some("public".into()),
            container: "users".into(),
            change: SchemaChangeAction::AddColumn {
                column: ColumnMeta {
                    name: "status".into(),
                    data_type: "VARCHAR(50)".into(),
                    is_primary_key: false,
                    is_nullable: true,
                    default_value: Some("'active'".into()),
                    foreign_key_target: None,
                },
            },
        };
        let pg_ddl = generate_ddl_statement(DatabaseEngine::Postgres, &add_req).unwrap();
        assert_eq!(
            pg_ddl,
            r#"ALTER TABLE "public"."users" ADD COLUMN "status" VARCHAR(50) DEFAULT 'active';"#
        );

        let mysql_ddl = generate_ddl_statement(DatabaseEngine::Mysql, &add_req).unwrap();
        assert_eq!(
            mysql_ddl,
            r#"ALTER TABLE `public`.`users` ADD COLUMN `status` VARCHAR(50) DEFAULT 'active';"#
        );

        // Drop Column
        let drop_req = SchemaChangeRequest {
            database: "app".into(),
            schema: None,
            container: "users".into(),
            change: SchemaChangeAction::DropColumn {
                column_name: "status".into(),
            },
        };
        let pg_drop = generate_ddl_statement(DatabaseEngine::Postgres, &drop_req).unwrap();
        assert_eq!(pg_drop, r#"ALTER TABLE "users" DROP COLUMN "status";"#);

        let mysql_drop = generate_ddl_statement(DatabaseEngine::Mysql, &drop_req).unwrap();
        assert_eq!(mysql_drop, r#"ALTER TABLE `users` DROP COLUMN `status`;"#);
    }

    #[test]
    fn test_generate_ddl_create_and_drop_index() {
        let idx_req = SchemaChangeRequest {
            database: "app".into(),
            schema: Some("public".into()),
            container: "users".into(),
            change: SchemaChangeAction::CreateIndex {
                index_name: "idx_users_email_tenant".into(),
                columns: vec!["email".into(), "tenant_id".into()],
                is_unique: true,
            },
        };
        let pg_idx = generate_ddl_statement(DatabaseEngine::Postgres, &idx_req).unwrap();
        assert_eq!(
            pg_idx,
            r#"CREATE UNIQUE INDEX "idx_users_email_tenant" ON "public"."users" ("email", "tenant_id");"#
        );

        let mysql_idx = generate_ddl_statement(DatabaseEngine::Mysql, &idx_req).unwrap();
        assert_eq!(
            mysql_idx,
            r#"CREATE UNIQUE INDEX `idx_users_email_tenant` ON `public`.`users` (`email`, `tenant_id`);"#
        );

        // Drop Index
        let drop_idx_req = SchemaChangeRequest {
            database: "app".into(),
            schema: Some("public".into()),
            container: "users".into(),
            change: SchemaChangeAction::DropIndex {
                index_name: "idx_users_email_tenant".into(),
            },
        };
        let pg_drop = generate_ddl_statement(DatabaseEngine::Postgres, &drop_idx_req).unwrap();
        assert_eq!(pg_drop, r#"DROP INDEX "public"."idx_users_email_tenant";"#);

        let mysql_drop = generate_ddl_statement(DatabaseEngine::Mysql, &drop_idx_req).unwrap();
        assert_eq!(
            mysql_drop,
            r#"DROP INDEX `idx_users_email_tenant` ON `public`.`users`;"#
        );
    }

    #[test]
    fn test_sql_where_clause_operators() {
        let filters = vec![
            FilterRule {
                field: "name".into(),
                operator: FilterOperator::StartsWith,
                value: "Ada".into(),
                enabled: true,
            },
            FilterRule {
                field: "email".into(),
                operator: FilterOperator::Contains,
                value: "docpine".into(),
                enabled: true,
            },
            FilterRule {
                field: "deleted_at".into(),
                operator: FilterOperator::IsNull,
                value: String::new(),
                enabled: true,
            },
            FilterRule {
                field: "status".into(),
                operator: FilterOperator::In,
                value: "active, pending".into(),
                enabled: true,
            },
            FilterRule {
                field: "disabled".into(),
                operator: FilterOperator::Eq,
                value: "ignored".into(),
                enabled: false, // Disabled rule should be skipped
            },
        ];

        let where_clause = build_where_clause(DatabaseEngine::Postgres, &filters, None);
        assert!(where_clause.contains(r#""name"::text ILIKE 'Ada%'"#));
        assert!(where_clause.contains(r#""email"::text ILIKE '%docpine%'"#));
        assert!(where_clause.contains(r#""deleted_at" IS NULL"#));
        assert!(where_clause.contains(r#""status" IN ('active', 'pending')"#));
        assert!(!where_clause.contains("disabled"));
    }

    #[test]
    fn test_build_select_page_queries() {
        let req = DataPageRequest {
            database: "app".into(),
            schema: Some("public".into()),
            container: "orders".into(),
            filters: vec![FilterRule {
                field: "total".into(),
                operator: FilterOperator::Gt,
                value: "100".into(),
                enabled: true,
            }],
            raw_filter: None,
            sorts: vec![SortRule {
                field: "created_at".into(),
                descending: true,
            }],
            page: 2,
            page_size: 25,
        };

        let (select_sql, count_sql) = build_select_page_queries(DatabaseEngine::Postgres, &req);
        assert_eq!(
            select_sql,
            r#"SELECT * FROM "public"."orders" WHERE "total" > 100 ORDER BY "created_at" DESC LIMIT 25 OFFSET 25"#
        );
        assert_eq!(
            count_sql,
            r#"SELECT COUNT(*) FROM "public"."orders" WHERE "total" > 100"#
        );
    }
}
