use crate::models::DatabaseEngine;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PoolStats {
    pub active: u32,
    pub idle: u32,
    pub max: u32,
    pub tracked: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActiveQueryProcess {
    pub id: String,
    pub user: Option<String>,
    pub database: Option<String>,
    pub state: Option<String>,
    pub duration_ms: u64,
    pub query: String,
    pub wait_event: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContainerResourceStat {
    pub name: String,
    pub schema: Option<String>,
    pub total_size_bytes: u64,
    pub data_size_bytes: u64,
    pub index_size_bytes: u64,
    pub estimated_rows: Option<u64>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerResourceMetrics {
    pub version: Option<String>,
    pub uptime_seconds: Option<u64>,
    pub active_connections: Option<u64>,
    pub idle_connections: Option<u64>,
    pub max_connections: Option<u64>,
    pub cache_hit_ratio: Option<f64>,
    pub database_size_bytes: Option<u64>,
    pub memory_mb: Option<f64>,
    pub total_operations: Option<u64>,
    pub total_reads: Option<u64>,
    pub total_writes: Option<u64>,
    pub active_queries: Vec<ActiveQueryProcess>,
    pub top_containers: Vec<ContainerResourceStat>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryLatencyPoint {
    pub executed_at: String,
    pub execution_ms: u64,
    pub status: String,
    pub database: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientWorkspaceTelemetry {
    pub pool: PoolStats,
    pub ssh_tunnel_active: bool,
    pub ssh_local_port: Option<u16>,
    pub total_queries_executed: u64,
    pub failed_queries_count: u64,
    pub error_rate_pct: f64,
    pub avg_query_ms: f64,
    pub p95_query_ms: u64,
    pub recent_latencies: Vec<QueryLatencyPoint>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceObservabilitySnapshot {
    pub collected_at: String,
    pub engine: DatabaseEngine,
    pub database: String,
    pub ping_ms: u64,
    pub server: ServerResourceMetrics,
    pub client: ClientWorkspaceTelemetry,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_observability_snapshot_serialization_roundtrip() {
        let snap = WorkspaceObservabilitySnapshot {
            collected_at: "2026-11-25T19:00:00Z".into(),
            engine: DatabaseEngine::Postgres,
            database: "billing".into(),
            ping_ms: 12,
            server: ServerResourceMetrics {
                version: Some("PostgreSQL 16.4".into()),
                uptime_seconds: Some(86400),
                active_connections: Some(4),
                idle_connections: Some(10),
                max_connections: Some(100),
                cache_hit_ratio: Some(99.42),
                database_size_bytes: Some(104_857_600),
                memory_mb: Some(256.0),
                total_operations: Some(42000),
                total_reads: Some(30000),
                total_writes: Some(12000),
                active_queries: vec![ActiveQueryProcess {
                    id: "12345".into(),
                    user: Some("postgres".into()),
                    database: Some("billing".into()),
                    state: Some("active".into()),
                    duration_ms: 350,
                    query: "SELECT * FROM invoices".into(),
                    wait_event: None,
                }],
                top_containers: vec![ContainerResourceStat {
                    name: "invoices".into(),
                    schema: Some("public".into()),
                    total_size_bytes: 52_428_800,
                    data_size_bytes: 40_000_000,
                    index_size_bytes: 12_428_800,
                    estimated_rows: Some(150_000),
                }],
                warnings: vec![],
            },
            client: ClientWorkspaceTelemetry {
                pool: PoolStats {
                    active: 1,
                    idle: 2,
                    max: 8,
                    tracked: true,
                },
                ssh_tunnel_active: false,
                ssh_local_port: None,
                total_queries_executed: 50,
                failed_queries_count: 2,
                error_rate_pct: 4.0,
                avg_query_ms: 18.5,
                p95_query_ms: 65,
                recent_latencies: vec![QueryLatencyPoint {
                    executed_at: "2026-11-25T18:59:55Z".into(),
                    execution_ms: 14,
                    status: "success".into(),
                    database: "billing".into(),
                }],
            },
        };

        let json = serde_json::to_string(&snap).expect("should serialize snapshot");
        assert!(json.contains("\"pingMs\":12"));
        assert!(json.contains("\"cacheHitRatio\":99.42"));
        let decoded: WorkspaceObservabilitySnapshot =
            serde_json::from_str(&json).expect("should deserialize snapshot");
        assert_eq!(decoded.database, "billing");
        assert_eq!(decoded.server.top_containers.len(), 1);
        assert_eq!(decoded.client.p95_query_ms, 65);
    }
}
