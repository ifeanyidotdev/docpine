pub mod mongodb;
pub mod mysql;
pub mod postgres;
pub mod sql_helpers;

use crate::error::AppResult;
use crate::models::{
    ContainerStructure, DataPageRequest, DataPageResult, MutationResult, PoolStats,
    QueryExecutionResult, SchemaChangeRequest, SchemaOverview, ServerResourceMetrics,
    StagedBatchRequest,
};

#[async_trait::async_trait]
pub trait WorkspaceDriver: Send + Sync {
    async fn ping(&self) -> AppResult<u64>;
    async fn list_databases(&self) -> AppResult<Vec<String>>;
    async fn get_schema_overview(&self, database: &str) -> AppResult<SchemaOverview>;
    async fn inspect_container(
        &self,
        database: &str,
        schema: Option<&str>,
        name: &str,
    ) -> AppResult<ContainerStructure>;
    async fn fetch_data_page(&self, req: &DataPageRequest) -> AppResult<DataPageResult>;
    async fn preview_mutations(&self, req: &StagedBatchRequest) -> AppResult<Vec<String>>;
    async fn apply_mutations(&self, req: &StagedBatchRequest) -> AppResult<MutationResult>;
    async fn preview_schema_change(&self, change: &SchemaChangeRequest) -> AppResult<String>;
    async fn apply_schema_change(
        &self,
        change: &SchemaChangeRequest,
    ) -> AppResult<QueryExecutionResult>;
    async fn create_schema(
        &self,
        database: &str,
        schema: &str,
    ) -> AppResult<QueryExecutionResult>;
    async fn execute_raw_query(
        &self,
        database: &str,
        query: &str,
    ) -> AppResult<QueryExecutionResult>;
    async fn collect_metrics(&self, database: &str) -> AppResult<ServerResourceMetrics>;
    async fn pool_stats(&self) -> PoolStats;
}
