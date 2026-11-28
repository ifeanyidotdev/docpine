use crate::drivers::sql_helpers::generate_mutation_statements;
use crate::error::{AppError, AppResult};
use crate::models::{DataFormat, DatabaseEngine, StagedBatchRequest};
use serde_json::{Map, Value};
use std::collections::BTreeSet;

/// Serializes rows into CSV, JSON, or SQL INSERT statements.
pub fn format_export_payload(
    engine: DatabaseEngine,
    schema: Option<&str>,
    container: &str,
    format: &DataFormat,
    rows: &[Value],
) -> AppResult<String> {
    match format {
        DataFormat::Json => serde_json::to_string_pretty(rows)
            .map_err(|e| AppError::Io(format!("Failed to serialize JSON export: {e}"))),
        DataFormat::Csv => {
            let mut columns = BTreeSet::new();
            for row in rows {
                if let Some(obj) = row.as_object() {
                    for k in obj.keys() {
                        columns.insert(k.clone());
                    }
                }
            }
            let headers: Vec<String> = columns.into_iter().collect();
            let mut wtr = csv::Writer::from_writer( vec![]);
            if !headers.is_empty() {
                wtr.write_record(&headers)
                    .map_err(|e| AppError::Io(format!("Failed to write CSV header: {e}")))?;
            }
            for row in rows {
                if let Some(obj) = row.as_object() {
                    let record: Vec<String> = headers
                        .iter()
                        .map(|h| match obj.get(h) {
                            None | Some(Value::Null) => String::new(),
                            Some(Value::String(s)) => s.clone(),
                            Some(other) => other.to_string(),
                        })
                        .collect();
                    wtr.write_record(&record)
                        .map_err(|e| AppError::Io(format!("Failed to write CSV row: {e}")))?;
                }
            }
            let bytes = wtr
                .into_inner()
                .map_err(|e| AppError::Io(format!("Failed to flush CSV writer: {e}")))?;
            String::from_utf8(bytes)
                .map_err(|e| AppError::Io(format!("Invalid UTF-8 in CSV output: {e}")))
        }
        DataFormat::SqlInsert => {
            let sql_engine = if engine == DatabaseEngine::Mongodb {
                DatabaseEngine::Postgres
            } else {
                engine
            };
            let batch = StagedBatchRequest {
                database: String::new(),
                schema: schema.map(|s| s.to_string()),
                container: container.to_string(),
                inserts: rows.to_vec(),
                updates: vec![],
                deletes: vec![],
                atomic: true,
            };
            let stmts = generate_mutation_statements(sql_engine, &batch)?;
            Ok(stmts.join("\n"))
        }
    }
}

/// Parses raw CSV or JSON content into a vector of JSON objects ready for database insertion.
pub fn parse_import_payload(format: &DataFormat, raw_content: &str) -> AppResult<Vec<Value>> {
    let trimmed = raw_content.trim();
    if trimmed.is_empty() {
        return Ok(vec![]);
    }

    match format {
        DataFormat::Json => {
            if trimmed.starts_with('[') {
                let arr: Vec<Value> = serde_json::from_str(trimmed).map_err(|e| {
                    AppError::Validation(format!("Invalid JSON array for import: {e}"))
                })?;
                Ok(arr)
            } else {
                // Support NDJSON (one JSON object per line)
                let mut rows = Vec::new();
                for line in trimmed.lines() {
                    let l = line.trim();
                    if !l.is_empty() {
                        let val: Value = serde_json::from_str(l).map_err(|e| {
                            AppError::Validation(format!("Invalid NDJSON line: {e}"))
                        })?;
                        rows.push(val);
                    }
                }
                Ok(rows)
            }
        }
        DataFormat::Csv => {
            let mut rdr = csv::ReaderBuilder::new()
                .has_headers(true)
                .from_reader(trimmed.as_bytes());

            let headers: Vec<String> = rdr
                .headers()
                .map_err(|e| AppError::Validation(format!("Failed to read CSV headers: {e}")))?
                .iter()
                .map(|s| s.trim().to_string())
                .collect();

            let mut out = Vec::new();
            for result in rdr.records() {
                let record = result
                    .map_err(|e| AppError::Validation(format!("Invalid CSV record: {e}")))?;
                let mut obj = Map::with_capacity(headers.len());
                for (idx, header) in headers.iter().enumerate() {
                    let cell = record.get(idx).unwrap_or("");
                    obj.insert(header.clone(), parse_csv_cell(cell));
                }
                out.push(Value::Object(obj));
            }
            Ok(out)
        }
        DataFormat::SqlInsert => Err(AppError::Validation(
            "For SQL script files, run them directly in the Query Editor tab.".into(),
        )),
    }
}

fn parse_csv_cell(cell: &str) -> Value {
    let trimmed = cell.trim();
    if trimmed.is_empty() || trimmed.eq_ignore_ascii_case("NULL") {
        return Value::Null;
    }
    if trimmed.eq_ignore_ascii_case("true") {
        return Value::Bool(true);
    }
    if trimmed.eq_ignore_ascii_case("false") {
        return Value::Bool(false);
    }
    if let Ok(i) = trimmed.parse::<i64>() {
        return Value::Number(i.into());
    }
    if let Ok(f) = trimmed.parse::<f64>() {
        if let Some(num) = serde_json::Number::from_f64(f) {
            return Value::Number(num);
        }
    }
    Value::String(cell.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_csv_and_sql_export_and_import() {
        let rows = vec![
            json!({"id": 1, "name": "Ada", "active": true}),
            json!({"id": 2, "name": "Grace", "active": false}),
        ];

        let csv_out = format_export_payload(
            DatabaseEngine::Postgres,
            Some("public"),
            "engineers",
            &DataFormat::Csv,
            &rows,
        )
        .unwrap();
        assert!(csv_out.contains("active,id,name"));
        assert!(csv_out.contains("true,1,Ada"));

        let imported = parse_import_payload(&DataFormat::Csv, &csv_out).unwrap();
        assert_eq!(imported.len(), 2);
        assert_eq!(imported[0]["name"], json!("Ada"));
        assert_eq!(imported[0]["id"], json!(1));
        assert_eq!(imported[0]["active"], json!(true));
    }

    #[test]
    fn test_json_export_and_import() {
        let rows = vec![
            json!({"id": 101, "item": "Laptop", "price": 1299.99, "tags": ["hardware", "work"], "notes": null}),
            json!({"id": 102, "item": "Mouse", "price": 49.50, "tags": ["accessory"], "notes": "ergonomic"}),
        ];

        let json_out = format_export_payload(
            DatabaseEngine::Postgres,
            Some("public"),
            "inventory",
            &DataFormat::Json,
            &rows,
        )
        .expect("should export JSON");

        let imported = parse_import_payload(&DataFormat::Json, &json_out)
            .expect("should parse JSON payload");

        assert_eq!(imported.len(), 2);
        assert_eq!(imported[0]["item"], json!("Laptop"));
        assert_eq!(imported[0]["price"], json!(1299.99));
        assert_eq!(imported[0]["notes"], json!(null));
        assert_eq!(imported[1]["tags"][0], json!("accessory"));
    }

    #[test]
    fn test_ndjson_import() {
        let ndjson = r#"{"id": 1, "status": "active"}
{"id": 2, "status": "pending"}
{"id": 3, "status": "suspended"}"#;

        let imported = parse_import_payload(&DataFormat::Json, ndjson)
            .expect("should parse NDJSON payload");

        assert_eq!(imported.len(), 3);
        assert_eq!(imported[0]["status"], json!("active"));
        assert_eq!(imported[1]["id"], json!(2));
        assert_eq!(imported[2]["status"], json!("suspended"));
    }

    #[test]
    fn test_sql_insert_export_dialect_escaping() {
        let rows = vec![
            json!({"id": 1, "author": "Liam O'Connor", "bio": "Writer, Developer"}),
        ];

        // PostgreSQL dialect (double-quoted table identifiers, single-quoted string escapes)
        let pg_sql = format_export_payload(
            DatabaseEngine::Postgres,
            Some("public"),
            "authors",
            &DataFormat::SqlInsert,
            &rows,
        )
        .expect("export Postgres SQL insert");

        assert!(pg_sql.contains(r#"INSERT INTO "public"."authors""#));
        assert!(pg_sql.contains(r#"'Liam O''Connor'"#));

        // MySQL dialect (backticked table identifiers)
        let mysql_sql = format_export_payload(
            DatabaseEngine::Mysql,
            None,
            "authors",
            &DataFormat::SqlInsert,
            &rows,
        )
        .expect("export MySQL SQL insert");

        assert!(mysql_sql.contains(r#"INSERT INTO `authors`"#));
        assert!(mysql_sql.contains(r#"'Liam O''Connor'"#));
    }

    #[test]
    fn test_csv_special_characters_quotes_and_commas() {
        let rows = vec![
            json!({"id": 1, "title": "Docpine, Inc.", "description": "Fast & \"modern\" DB tool"}),
        ];

        let csv_out = format_export_payload(
            DatabaseEngine::Postgres,
            None,
            "companies",
            &DataFormat::Csv,
            &rows,
        )
        .unwrap();

        let imported = parse_import_payload(&DataFormat::Csv, &csv_out).unwrap();
        assert_eq!(imported.len(), 1);
        assert_eq!(imported[0]["title"], json!("Docpine, Inc."));
        assert_eq!(imported[0]["description"], json!("Fast & \"modern\" DB tool"));
    }
}
