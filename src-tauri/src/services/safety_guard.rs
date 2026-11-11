use crate::error::{AppError, AppResult};
use crate::models::{DatabaseEngine, SafetyMode};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SafetyInspection {
    pub allowed: bool,
    pub requires_confirmation: bool,
    pub is_mutation: bool,
    pub reason: Option<String>,
}

/// Evaluates whether a raw SQL or MongoDB MQL query/command is permitted under the
/// workspace's configured `SafetyMode`.
pub fn inspect_query_safety(
    engine: DatabaseEngine,
    safety_mode: SafetyMode,
    query: &str,
    confirmed_by_user: bool,
) -> AppResult<SafetyInspection> {
    let normalized = strip_comments_and_normalize(query);

    let (is_mutation, destructive_reason) = match engine {
        DatabaseEngine::Postgres | DatabaseEngine::Mysql => classify_sql_query(&normalized),
        DatabaseEngine::Mongodb => classify_mongo_query(&normalized),
    };

    if safety_mode == SafetyMode::ReadOnly && is_mutation {
        return Err(AppError::SafetyBlocked(
            "This workspace is in Read-Only mode. Write and schema-modifying operations are disabled."
                .to_string(),
        ));
    }

    if safety_mode == SafetyMode::Safe {
        if let Some(reason) = destructive_reason {
            if !confirmed_by_user {
                return Err(AppError::ConfirmationRequired(reason));
            }
            return Ok(SafetyInspection {
                allowed: true,
                requires_confirmation: true,
                is_mutation,
                reason: Some(reason),
            });
        }
    }

    Ok(SafetyInspection {
        allowed: true,
        requires_confirmation: false,
        is_mutation,
        reason: None,
    })
}

/// Verifies whether staged mutations or schema changes are allowed under the workspace's `SafetyMode`.
pub fn check_mutation_permission(
    safety_mode: SafetyMode,
    is_destructive: bool,
    description: &str,
    confirmed_by_user: bool,
) -> AppResult<()> {
    if safety_mode == SafetyMode::ReadOnly {
        return Err(AppError::SafetyBlocked(
            "Workspace is in Read-Only mode. Data modifications are blocked.".into(),
        ));
    }

    if safety_mode == SafetyMode::Safe && is_destructive && !confirmed_by_user {
        return Err(AppError::ConfirmationRequired(format!(
            "Safe Mode requires confirmation before executing destructive operation: {description}"
        )));
    }

    Ok(())
}

fn strip_comments_and_normalize(input: &str) -> String {
    let mut out = String::with_capacity(input.len());
    for line in input.lines() {
        let trimmed = line.trim();
        if !trimmed.starts_with("--") && !trimmed.starts_with("//") {
            out.push_str(trimmed);
            out.push(' ');
        }
    }
    out.trim().to_uppercase()
}

fn classify_sql_query(upper_sql: &str) -> (bool, Option<String>) {
    let first_token = upper_sql.split_whitespace().next().unwrap_or("");
    let is_mutation = matches!(
        first_token,
        "INSERT"
            | "UPDATE"
            | "DELETE"
            | "DROP"
            | "TRUNCATE"
            | "ALTER"
            | "CREATE"
            | "REPLACE"
            | "GRANT"
            | "REVOKE"
    );

    if first_token == "DROP" {
        return (
            true,
            Some("DROP statement detected — this will permanently remove database objects.".into()),
        );
    }

    if first_token == "TRUNCATE" {
        return (
            true,
            Some("TRUNCATE statement detected — this will remove all rows from the table.".into()),
        );
    }

    if first_token == "DELETE" && !upper_sql.contains(" WHERE ") {
        return (
            true,
            Some("DELETE statement without a WHERE clause will delete every row in the table.".into()),
        );
    }

    if first_token == "UPDATE" && !upper_sql.contains(" WHERE ") {
        return (
            true,
            Some("UPDATE statement without a WHERE clause will modify every row in the table.".into()),
        );
    }

    (is_mutation, None)
}

fn classify_mongo_query(upper_json: &str) -> (bool, Option<String>) {
    let is_mutation = upper_json.contains("\"INSERT")
        || upper_json.contains("\"UPDATE")
        || upper_json.contains("\"DELETE")
        || upper_json.contains("\"DROP")
        || upper_json.contains("\"FINDANDMODIFY")
        || upper_json.contains("INSERTONE")
        || upper_json.contains("INSERTMANY")
        || upper_json.contains("UPDATEONE")
        || upper_json.contains("UPDATEMANY")
        || upper_json.contains("DELETEONE")
        || upper_json.contains("DELETEMANY");

    if upper_json.contains("\"DROP\"") || upper_json.contains("DROPCOLLECTION") || upper_json.contains("DROPDATABASE") {
        return (
            true,
            Some("MongoDB drop operation detected — this will permanently remove the collection or database.".into()),
        );
    }

    if upper_json.contains("DELETEMANY") && (upper_json.contains("\"FILTER\":{}") || upper_json.contains("\"FILTER\": {}")) {
        return (
            true,
            Some("MongoDB deleteMany with an empty filter `{}` will delete all documents in the collection.".into()),
        );
    }

    (is_mutation, None)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_read_only_blocks_sql_mutations_but_allows_select() {
        let select_res = inspect_query_safety(
            DatabaseEngine::Postgres,
            SafetyMode::ReadOnly,
            "SELECT * FROM users WHERE id = 1;",
            false,
        );
        assert!(select_res.is_ok());
        assert!(!select_res.unwrap().is_mutation);

        let update_res = inspect_query_safety(
            DatabaseEngine::Postgres,
            SafetyMode::ReadOnly,
            "UPDATE users SET active = false WHERE id = 1;",
            false,
        );
        assert!(matches!(update_res, Err(AppError::SafetyBlocked(_))));
    }

    #[test]
    fn test_safe_mode_warns_on_unfiltered_delete_and_drop() {
        let unfiltered_delete = inspect_query_safety(
            DatabaseEngine::Mysql,
            SafetyMode::Safe,
            "DELETE FROM orders;",
            false,
        );
        assert!(matches!(
            unfiltered_delete,
            Err(AppError::ConfirmationRequired(_))
        ));

        // When confirmed_by_user = true, it is allowed
        let confirmed_delete = inspect_query_safety(
            DatabaseEngine::Mysql,
            SafetyMode::Safe,
            "DELETE FROM orders;",
            true,
        );
        assert!(confirmed_delete.is_ok());

        // Filtered delete does not require extra confirmation in Safe mode
        let filtered_delete = inspect_query_safety(
            DatabaseEngine::Mysql,
            SafetyMode::Safe,
            "DELETE FROM orders WHERE id = 42;",
            false,
        );
        assert!(filtered_delete.is_ok());
    }

    #[test]
    fn test_mongo_safety_inspection() {
        let drop_cmd = r#"{"action": "dropCollection", "collection": "logs"}"#;
        let res = inspect_query_safety(
            DatabaseEngine::Mongodb,
            SafetyMode::Safe,
            drop_cmd,
            false,
        );
        assert!(matches!(res, Err(AppError::ConfirmationRequired(_))));
    }
}
