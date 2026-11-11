export type DatabaseEngine = "postgres" | "mysql" | "mongodb";

export type EnvironmentTag = "production" | "staging" | "development" | "local";

export type SafetyMode = "standard" | "safe" | "read_only";

export type CommitMode = "staged" | "immediate";

export type SshAuthMethod = "password" | "private_key";

export interface SslConfig {
  enabled: boolean;
  rejectUnauthorized: boolean;
  caCertPath?: string | null;
}

export interface SshTunnelConfig {
  enabled: boolean;
  host: string;
  port: number;
  username: string;
  authMethod: SshAuthMethod;
  privateKeyPath?: string | null;
}

export interface WorkspaceCredentials {
  dbPassword?: string | null;
  sshPassword?: string | null;
  sshPassphrase?: string | null;
}

export interface WorkspaceConfig {
  id: string;
  name: string;
  engine: DatabaseEngine;
  host: string;
  port: number;
  username: string;
  defaultDatabase: string;
  connectionUri?: string | null;
  environment: EnvironmentTag;
  accentColor: string;
  safetyMode: SafetyMode;
  commitMode: CommitMode;
  ssl: SslConfig;
  ssh: SshTunnelConfig;
  createdAt: string;
  lastOpenedAt?: string | null;
}

export interface SaveWorkspaceInput {
  id?: string | null;
  name: string;
  engine: DatabaseEngine;
  host: string;
  port: number;
  username: string;
  defaultDatabase: string;
  connectionUri?: string | null;
  environment: EnvironmentTag;
  accentColor: string;
  safetyMode: SafetyMode;
  commitMode: CommitMode;
  ssl: SslConfig;
  ssh: SshTunnelConfig;
  credentials: WorkspaceCredentials;
}

export interface ParsedConnectionUri {
  engine: DatabaseEngine;
  host: string;
  port: number;
  username: string;
  password?: string | null;
  database: string;
  sslEnabled: boolean;
  rawUri: string;
}

export type FilterOperator =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "contains"
  | "starts_with"
  | "in"
  | "is_null"
  | "is_not_null";

export interface FilterRule {
  id: string;
  field: string;
  operator: FilterOperator;
  value: string;
  enabled: boolean;
}

export interface SortRule {
  field: string;
  descending: boolean;
}

export interface DataPageRequest {
  database: string;
  schema?: string | null;
  container: string;
  filters: Omit<FilterRule, "id">[];
  rawFilter?: string | null;
  sorts: SortRule[];
  page: number;
  pageSize: number;
}

export interface ColumnMeta {
  name: string;
  dataType: string;
  isPrimaryKey: boolean;
  isNullable: boolean;
  defaultValue?: string | null;
  foreignKeyTarget?: string | null;
}

export interface DataPageResult {
  columns: ColumnMeta[];
  rows: Record<string, any>[];
  primaryKeys: string[];
  totalCount?: number | null;
  page: number;
  pageSize: number;
  executionMs: number;
  generatedQuery: string;
}

export interface RecordUpdate {
  identity: Record<string, any>;
  changes: Record<string, any>;
  original: Record<string, any>;
}

export interface StagedBatchRequest {
  database: string;
  schema?: string | null;
  container: string;
  inserts: Record<string, any>[];
  updates: RecordUpdate[];
  deletes: Record<string, any>[];
  atomic: boolean;
}

export interface MutationResult {
  insertedCount: number;
  updatedCount: number;
  deletedCount: number;
  executionMs: number;
  statements: string[];
}

export type ContainerKind = "table" | "view" | "collection";

export interface ContainerSummary {
  name: string;
  schema?: string | null;
  kind: ContainerKind;
  estimatedRows?: number | null;
  rowCountCapped?: boolean;
}

export interface IndexDefinition {
  name: string;
  columns: string[];
  isUnique: boolean;
  isPrimary: boolean;
  indexType?: string | null;
}

export interface ForeignKeyEdge {
  constraintName: string;
  sourceSchema?: string | null;
  sourceContainer: string;
  sourceColumn: string;
  targetSchema?: string | null;
  targetContainer: string;
  targetColumn: string;
  onDelete?: string | null;
}

export interface ContainerStructure {
  database: string;
  schema?: string | null;
  name: string;
  kind: ContainerKind;
  columns: ColumnMeta[];
  indexes: IndexDefinition[];
  foreignKeys: ForeignKeyEdge[];
  ddlStatement?: string | null;
}

export interface SchemaOverview {
  database: string;
  schemas: string[];
  containers: ContainerSummary[];
  columnsByContainer: Record<string, ColumnMeta[]>;
  foreignKeys: ForeignKeyEdge[];
}

export interface QueryExecutionResult {
  columns: ColumnMeta[];
  rows: Record<string, any>[];
  affectedRows?: number | null;
  executionMs: number;
  query: string;
  isMutation: boolean;
  message?: string | null;
}

export type SchemaChangeAction =
  | { action: "create_container"; columns: ColumnMeta[] }
  | { action: "drop_container" }
  | { action: "add_column"; column: ColumnMeta }
  | { action: "drop_column"; column_name: string }
  | { action: "modify_column"; column: ColumnMeta }
  | {
      action: "create_index";
      index_name: string;
      columns: string[];
      is_unique: boolean;
    }
  | { action: "drop_index"; index_name: string };

export interface SchemaChangeRequest {
  database: string;
  schema?: string | null;
  container: string;
  change: SchemaChangeAction;
}

export type DataFormat = "csv" | "json" | "sql_insert";

export interface SavedQueryRecord {
  id: string;
  workspaceId: string;
  title: string;
  folder?: string | null;
  database: string;
  queryText: string;
  createdAt: string;
  updatedAt: string;
}

export interface QueryHistoryRecord {
  id: string;
  workspaceId: string;
  database: string;
  queryText: string;
  status: string;
  executionMs: number;
  rowCount?: number | null;
  executedAt: string;
}

export type WorkspaceTabKind = "data" | "query" | "structure" | "erd";

export type DataViewMode = "table" | "tree" | "json";

export interface WorkspaceTab {
  id: string;
  workspaceId: string;
  kind: WorkspaceTabKind;
  title: string;
  database: string;
  schema?: string | null;
  container?: string;
  queryText?: string;
  dataViewMode?: DataViewMode;
}

export interface TabStagedState {
  /** Keyed by temporary draft ID */
  inserts: Record<string, Record<string, any>>;
  /** Keyed by stable serialized row identity */
  updates: Record<string, RecordUpdate>;
  /** Keyed by stable serialized row identity */
  deletes: Record<string, Record<string, any>>;
}
