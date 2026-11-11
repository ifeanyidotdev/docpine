use crate::error::{AppError, AppResult};
use crate::models::{DatabaseEngine, ParsedConnectionUri};
use url::Url;

/// Parses a connection URI (`postgres://`, `postgresql://`, `mysql://`, `mongodb://`, `mongodb+srv://`)
/// into structured workspace connection fields.
pub fn parse_connection_uri(uri_str: &str) -> AppResult<ParsedConnectionUri> {
    let trimmed = uri_str.trim();
    if trimmed.is_empty() {
        return Err(AppError::Validation("Connection URI cannot be empty".into()));
    }

    let parsed = Url::parse(trimmed)
        .map_err(|e| AppError::Validation(format!("Invalid connection URI: {e}")))?;

    let scheme = parsed.scheme().to_lowercase();
    let (engine, is_srv) = match scheme.as_str() {
        "postgres" | "postgresql" => (DatabaseEngine::Postgres, false),
        "mysql" | "mariadb" => (DatabaseEngine::Mysql, false),
        "mongodb" => (DatabaseEngine::Mongodb, false),
        "mongodb+srv" => (DatabaseEngine::Mongodb, true),
        other => {
            return Err(AppError::Validation(format!(
                "Unsupported URI scheme '{other}'. Expected postgres://, mysql://, mongodb://, or mongodb+srv://"
            )))
        }
    };

    let host = parsed
        .host_str()
        .ok_or_else(|| AppError::Validation("Connection URI is missing host".into()))?
        .to_string();

    let port = parsed.port().unwrap_or_else(|| engine.default_port());

    let username = urlencoding::decode(parsed.username())
        .map(|s| s.into_owned())
        .unwrap_or_else(|_| parsed.username().to_string());

    let password = parsed.password().map(|p| {
        urlencoding::decode(p)
            .map(|s| s.into_owned())
            .unwrap_or_else(|_| p.to_string())
    });

    let raw_path = parsed.path().trim_start_matches('/');
    let database = if raw_path.is_empty() {
        match engine {
            DatabaseEngine::Postgres => "postgres".to_string(),
            DatabaseEngine::Mysql => "".to_string(),
            DatabaseEngine::Mongodb => "admin".to_string(),
        }
    } else {
        urlencoding::decode(raw_path)
            .map(|s| s.into_owned())
            .unwrap_or_else(|_| raw_path.to_string())
    };

    let mut ssl_enabled = is_srv;
    for (k, v) in parsed.query_pairs() {
        let key = k.to_lowercase();
        let val = v.to_lowercase();
        if (key == "sslmode" && val != "disable")
            || ((key == "ssl" || key == "tls") && (val == "true" || val == "1" || val == "required"))
        {
            ssl_enabled = true;
        }
    }

    Ok(ParsedConnectionUri {
        engine,
        host,
        port,
        username,
        password,
        database,
        ssl_enabled,
        raw_uri: trimmed.to_string(),
    })
}

/// Builds a connection URI from structured fields.
pub fn build_connection_uri(
    engine: DatabaseEngine,
    host: &str,
    port: u16,
    username: &str,
    password: Option<&str>,
    database: &str,
    ssl_enabled: bool,
) -> String {
    let scheme = match engine {
        DatabaseEngine::Postgres => "postgresql",
        DatabaseEngine::Mysql => "mysql",
        DatabaseEngine::Mongodb => "mongodb",
    };

    let auth = if !username.is_empty() {
        let enc_user = urlencoding::encode(username);
        if let Some(pw) = password.filter(|s| !s.is_empty()) {
            format!("{enc_user}:{}@", urlencoding::encode(pw))
        } else {
            format!("{enc_user}@")
        }
    } else {
        String::new()
    };

    let db_segment = if database.is_empty() {
        String::new()
    } else {
        format!("/{}", urlencoding::encode(database))
    };

    let query = if ssl_enabled {
        match engine {
            DatabaseEngine::Postgres => "?sslmode=require",
            DatabaseEngine::Mysql => "?ssl-mode=REQUIRED",
            DatabaseEngine::Mongodb => "?tls=true",
        }
    } else {
        ""
    };

    format!("{scheme}://{auth}{host}:{port}{db_segment}{query}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_postgres_uri() {
        let parsed = parse_connection_uri(
            "postgresql://admin:s3cr3t%21@db.example.com:5433/analytics?sslmode=require",
        )
        .expect("should parse postgres URI");

        assert_eq!(parsed.engine, DatabaseEngine::Postgres);
        assert_eq!(parsed.host, "db.example.com");
        assert_eq!(parsed.port, 5433);
        assert_eq!(parsed.username, "admin");
        assert_eq!(parsed.password.as_deref(), Some("s3cr3t!"));
        assert_eq!(parsed.database, "analytics");
        assert!(parsed.ssl_enabled);
    }

    #[test]
    fn test_parse_mysql_uri_defaults() {
        let parsed = parse_connection_uri("mysql://root@127.0.0.1/shop_prod")
            .expect("should parse mysql URI");

        assert_eq!(parsed.engine, DatabaseEngine::Mysql);
        assert_eq!(parsed.host, "127.0.0.1");
        assert_eq!(parsed.port, 3306);
        assert_eq!(parsed.username, "root");
        assert_eq!(parsed.password, None);
        assert_eq!(parsed.database, "shop_prod");
        assert!(!parsed.ssl_enabled);
    }

    #[test]
    fn test_parse_mongodb_srv_uri() {
        let parsed = parse_connection_uri(
            "mongodb+srv://cluster_user:pass123@cluster0.abcd.mongodb.net/catalog?retryWrites=true",
        )
        .expect("should parse mongodb+srv URI");

        assert_eq!(parsed.engine, DatabaseEngine::Mongodb);
        assert_eq!(parsed.host, "cluster0.abcd.mongodb.net");
        assert_eq!(parsed.port, 27017);
        assert_eq!(parsed.username, "cluster_user");
        assert_eq!(parsed.password.as_deref(), Some("pass123"));
        assert_eq!(parsed.database, "catalog");
        assert!(parsed.ssl_enabled);
    }

    #[test]
    fn test_build_and_roundtrip_uri() {
        let uri = build_connection_uri(
            DatabaseEngine::Postgres,
            "localhost",
            5432,
            "postgres",
            Some("my_pass"),
            "docpine_dev",
            true,
        );
        assert_eq!(
            uri,
            "postgresql://postgres:my_pass@localhost:5432/docpine_dev?sslmode=require"
        );
        let parsed = parse_connection_uri(&uri).unwrap();
        assert_eq!(parsed.database, "docpine_dev");
        assert!(parsed.ssl_enabled);
    }
}
