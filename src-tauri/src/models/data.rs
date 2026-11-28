use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FilterOperator {
    Eq,
    Neq,
    Gt,
    Gte,
    Lt,
    Lte,
    Contains,
    StartsWith,
    In,
    IsNull,
    IsNotNull,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FilterRule {
    pub field: String,
    pub operator: FilterOperator,
    pub value: String,
    pub enabled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SortRule {
    pub field: String,
    pub descending: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DataPageRequest {
    pub database: String,
    pub schema: Option<String>,
    pub container: String,
    #[serde(default)]
    pub filters: Vec<FilterRule>,
    pub raw_filter: Option<String>,
    #[serde(default)]
    pub sorts: Vec<SortRule>,
    pub page: u32,
    pub page_size: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ColumnMeta {
    pub name: String,
    pub data_type: String,
    pub is_primary_key: bool,
    pub is_nullable: bool,
    pub default_value: Option<String>,
    pub foreign_key_target: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DataPageResult {
    pub columns: Vec<ColumnMeta>,
    pub rows: Vec<Value>,
    pub primary_keys: Vec<String>,
    pub total_count: Option<u64>,
    pub page: u32,
    pub page_size: u32,
    pub execution_ms: u64,
    pub generated_query: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecordUpdate {
    /// Primary key column->value map for SQL, or `{"_id": ...}` for MongoDB
    pub identity: HashMap<String, Value>,
    /// Changed column/field -> new value
    pub changes: HashMap<String, Value>,
    /// Original column/field -> old value (for diff verification)
    #[serde(default)]
    pub original: HashMap<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StagedBatchRequest {
    pub database: String,
    pub schema: Option<String>,
    pub container: String,
    #[serde(default)]
    pub inserts: Vec<Value>,
    #[serde(default)]
    pub updates: Vec<RecordUpdate>,
    /// Each delete item is a map of primary key column->value (or `{"_id": ...}`)
    #[serde(default)]
    pub deletes: Vec<HashMap<String, Value>>,
    #[serde(default = "default_true")]
    pub atomic: bool,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MutationResult {
    pub inserted_count: u64,
    pub updated_count: u64,
    pub deleted_count: u64,
    pub execution_ms: u64,
    pub statements: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ContainerKind {
    Table,
    View,
    Collection,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContainerSummary {
    pub name: String,
    pub schema: Option<String>,
    pub kind: ContainerKind,
    pub estimated_rows: Option<u64>,
    /// True when `estimated_rows` is a capped exact count (real count is larger).
    #[serde(default)]
    pub row_count_capped: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexDefinition {
    pub name: String,
    pub columns: Vec<String>,
    pub is_unique: bool,
    pub is_primary: bool,
    pub index_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ForeignKeyEdge {
    pub constraint_name: String,
    pub source_schema: Option<String>,
    pub source_container: String,
    pub source_column: String,
    pub target_schema: Option<String>,
    pub target_container: String,
    pub target_column: String,
    pub on_delete: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContainerStructure {
    pub database: String,
    pub schema: Option<String>,
    pub name: String,
    pub kind: ContainerKind,
    pub columns: Vec<ColumnMeta>,
    pub indexes: Vec<IndexDefinition>,
    pub foreign_keys: Vec<ForeignKeyEdge>,
    pub ddl_statement: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SchemaOverview {
    pub database: String,
    pub schemas: Vec<String>,
    pub containers: Vec<ContainerSummary>,
    pub columns_by_container: HashMap<String, Vec<ColumnMeta>>,
    pub foreign_keys: Vec<ForeignKeyEdge>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryExecutionResult {
    pub columns: Vec<ColumnMeta>,
    pub rows: Vec<Value>,
    pub affected_rows: Option<u64>,
    pub execution_ms: u64,
    pub query: String,
    pub is_mutation: bool,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "action", rename_all = "snake_case")]
pub enum SchemaChangeAction {
    CreateContainer {
        columns: Vec<ColumnMeta>,
    },
    DropContainer,
    AddColumn {
        column: ColumnMeta,
    },
    DropColumn {
        column_name: String,
    },
    ModifyColumn {
        column: ColumnMeta,
    },
    CreateIndex {
        index_name: String,
        columns: Vec<String>,
        is_unique: bool,
    },
    DropIndex {
        index_name: String,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SchemaChangeRequest {
    pub database: String,
    pub schema: Option<String>,
    pub container: String,
    pub change: SchemaChangeAction,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DataFormat {
    Csv,
    Json,
    SqlInsert,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportRequest {
    pub database: String,
    pub schema: Option<String>,
    pub container: String,
    pub format: DataFormat,
    pub file_path: String,
    pub rows: Option<Vec<Value>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportSummary {
    pub file_path: String,
    pub exported_rows: u64,
    pub format: DataFormat,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportRequest {
    pub database: String,
    pub schema: Option<String>,
    pub container: String,
    pub format: DataFormat,
    pub file_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportSummary {
    pub imported_rows: u64,
    pub execution_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SavedQueryRecord {
    pub id: String,
    pub workspace_id: String,
    pub title: String,
    pub folder: Option<String>,
    pub database: String,
    pub query_text: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryHistoryRecord {
    pub id: String,
    pub workspace_id: String,
    pub database: String,
    pub query_text: String,
    pub status: String,
    pub execution_ms: u64,
    pub row_count: Option<u64>,
    pub executed_at: String,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_filter_operator_serde() {
        let operators = vec![
            (FilterOperator::Eq, "\"eq\""),
            (FilterOperator::Neq, "\"neq\""),
            (FilterOperator::Gt, "\"gt\""),
            (FilterOperator::Gte, "\"gte\""),
            (FilterOperator::Lt, "\"lt\""),
            (FilterOperator::Lte, "\"lte\""),
            (FilterOperator::Contains, "\"contains\""),
            (FilterOperator::StartsWith, "\"starts_with\""),
            (FilterOperator::In, "\"in\""),
            (FilterOperator::IsNull, "\"is_null\""),
            (FilterOperator::IsNotNull, "\"is_not_null\""),
        ];

        for (op, expected_json) in operators {
            let serialized = serde_json::to_string(&op).unwrap();
            assert_eq!(serialized, expected_json);
            let deserialized: FilterOperator = serde_json::from_str(expected_json).unwrap();
            // Verify roundtrip serialization matches
            assert_eq!(
                serde_json::to_string(&deserialized).unwrap(),
                expected_json
            );
        }
    }

    #[test]
    fn test_data_page_request_serde_defaults() {
        let raw = r#"{
            "database": "app_db",
            "container": "users",
            "page": 1,
            "pageSize": 50
        }"#;

        let req: DataPageRequest = serde_json::from_str(raw).expect("parse page request");
        assert_eq!(req.database, "app_db");
        assert_eq!(req.schema, None);
        assert_eq!(req.container, "users");
        assert!(req.filters.is_empty());
        assert!(req.sorts.is_empty());
        assert_eq!(req.page, 1);
        assert_eq!(req.page_size, 50);
    }

    #[test]
    fn test_staged_batch_request_serde() {
        let mut identity = HashMap::new();
        identity.insert("id".to_string(), json!(42));

        let mut changes = HashMap::new();
        changes.insert("email".to_string(), json!("updated@docpine.dev"));

        let update = RecordUpdate {
            identity: identity.clone(),
            changes,
            original: HashMap::new(),
        };

        let mut del = HashMap::new();
        del.insert("id".to_string(), json!(41));

        let batch = StagedBatchRequest {
            database: "test_db".to_string(),
            schema: Some("public".to_string()),
            container: "users".to_string(),
            inserts: vec![json!({"id": 43, "name": "Alice"})],
            updates: vec![update],
            deletes: vec![del],
            atomic: true,
        };

        let serialized = serde_json::to_string(&batch).expect("serialize batch");
        assert!(serialized.contains("\"atomic\":true"));
        assert!(serialized.contains("\"container\":\"users\""));

        let deserialized: StagedBatchRequest =
            serde_json::from_str(&serialized).expect("deserialize batch");
        assert_eq!(deserialized.inserts.len(), 1);
        assert_eq!(deserialized.updates.len(), 1);
        assert_eq!(deserialized.deletes.len(), 1);
        assert!(deserialized.atomic);
    }

    #[test]
    fn test_schema_change_actions_serde() {
        let add_col = SchemaChangeAction::AddColumn {
            column: ColumnMeta {
                name: "created_at".to_string(),
                data_type: "TIMESTAMPTZ".to_string(),
                is_primary_key: false,
                is_nullable: true,
                default_value: Some("CURRENT_TIMESTAMP".to_string()),
                foreign_key_target: None,
            },
        };

        let serialized = serde_json::to_string(&add_col).expect("serialize add_col");
        assert!(serialized.contains("\"action\":\"add_column\""));
        assert!(serialized.contains("\"isPrimaryKey\":false"));

        let deserialized: SchemaChangeAction =
            serde_json::from_str(&serialized).expect("deserialize add_col");
        match deserialized {
            SchemaChangeAction::AddColumn { column } => {
                assert_eq!(column.name, "created_at");
                assert_eq!(column.data_type, "TIMESTAMPTZ");
            }
            _ => panic!("Expected AddColumn variant"),
        }
    }
}
