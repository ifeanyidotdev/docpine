import { invoke } from "@tauri-apps/api/core";
import type {
  CommitMode,
  ContainerStructure,
  DataFormat,
  DataPageRequest,
  DataPageResult,
  DatabaseEngine,
  MutationResult,
  ParsedConnectionUri,
  QueryExecutionResult,
  QueryHistoryRecord,
  SafetyMode,
  SaveWorkspaceInput,
  SavedQueryRecord,
  SchemaChangeRequest,
  SchemaOverview,
  StagedBatchRequest,
  WorkspaceConfig,
  WorkspaceCredentials,
} from "../types/docpine";

export interface FormattedAppError {
  code: string;
  message: string;
}

export function parseAppError(err: unknown): FormattedAppError {
  if (typeof err === "object" && err !== null) {
    const anyErr = err as Record<string, any>;
    if (typeof anyErr.code === "string" && typeof anyErr.message === "string") {
      return { code: anyErr.code, message: anyErr.message };
    }
  }
  if (typeof err === "string") {
    try {
      const parsed = JSON.parse(err);
      if (parsed && typeof parsed.code === "string") {
        return { code: parsed.code, message: String(parsed.message ?? err) };
      }
    } catch {
      // plain string
    }
    return { code: "unknown", message: err };
  }
  if (err instanceof Error) {
    return { code: "error", message: err.message };
  }
  return { code: "unknown", message: String(err) };
}

function isTauriRuntime(): boolean {
  return (
    typeof window !== "undefined" &&
    ("__TAURI_INTERNALS__" in window || "__TAURI__" in window)
  );
}

const BROWSER_STORAGE_KEY = "docpine.browser.workspaces";

function loadBrowserWorkspaces(): WorkspaceConfig[] {
  try {
    const raw = localStorage.getItem(BROWSER_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveBrowserWorkspaces(list: WorkspaceConfig[]) {
  try {
    localStorage.setItem(BROWSER_STORAGE_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
}

export const ipc = {
  async parseUri(uri: string): Promise<ParsedConnectionUri> {
    if (!isTauriRuntime()) {
      const url = new URL(uri);
      const scheme = url.protocol.replace(":", "").toLowerCase();
      const engine: DatabaseEngine = scheme.startsWith("mongo")
        ? "mongodb"
        : scheme.startsWith("mysql")
          ? "mysql"
          : "postgres";
      const defaultPort =
        engine === "postgres" ? 5432 : engine === "mysql" ? 3306 : 27017;
      return {
        engine,
        host: url.hostname || "localhost",
        port: url.port ? Number(url.port) : defaultPort,
        username: decodeURIComponent(url.username || ""),
        password: url.password ? decodeURIComponent(url.password) : null,
        database: url.pathname.replace(/^\//, "") || "postgres",
        sslEnabled:
          scheme === "mongodb+srv" ||
          url.searchParams.get("sslmode") === "require" ||
          url.searchParams.get("tls") === "true",
        rawUri: uri,
      };
    }
    return invoke<ParsedConnectionUri>("parse_uri", { uri });
  },

  async buildUri(params: {
    engine: DatabaseEngine;
    host: string;
    port: number;
    username: string;
    password?: string | null;
    database: string;
    sslEnabled: boolean;
  }): Promise<string> {
    if (!isTauriRuntime()) {
      const scheme =
        params.engine === "postgres"
          ? "postgresql"
          : params.engine === "mysql"
            ? "mysql"
            : "mongodb";
      const auth = params.username
        ? `${encodeURIComponent(params.username)}${params.password ? `:${encodeURIComponent(params.password)}` : ""}@`
        : "";
      return `${scheme}://${auth}${params.host}:${params.port}/${params.database}`;
    }
    return invoke<string>("build_uri", params);
  },

  async listWorkspaces(): Promise<WorkspaceConfig[]> {
    if (!isTauriRuntime()) {
      return loadBrowserWorkspaces();
    }
    return invoke<WorkspaceConfig[]>("list_workspaces");
  },

  async saveWorkspace(input: SaveWorkspaceInput): Promise<WorkspaceConfig> {
    if (!isTauriRuntime()) {
      const list = loadBrowserWorkspaces();
      const now = new Date().toISOString();
      const id = input.id || crypto.randomUUID();
      const ws: WorkspaceConfig = {
        id,
        name: input.name,
        engine: input.engine,
        host: input.host,
        port: input.port,
        username: input.username,
        defaultDatabase: input.defaultDatabase,
        connectionUri: input.connectionUri,
        environment: input.environment,
        accentColor: input.accentColor,
        safetyMode: input.safetyMode,
        commitMode: input.commitMode,
        ssl: input.ssl,
        ssh: input.ssh,
        createdAt: now,
        lastOpenedAt: now,
      };
      const next = [ws, ...list.filter((w) => w.id !== id)];
      saveBrowserWorkspaces(next);
      return ws;
    }
    return invoke<WorkspaceConfig>("save_workspace", { input });
  },

  async getWorkspaceCredentials(
    workspaceId: string
  ): Promise<WorkspaceCredentials> {
    if (!isTauriRuntime()) {
      return {};
    }
    return invoke<WorkspaceCredentials>("get_workspace_credentials", {
      workspaceId,
    });
  },

  async updateWorkspaceModes(
    workspaceId: string,
    commitMode?: CommitMode,
    safetyMode?: SafetyMode
  ): Promise<WorkspaceConfig> {
    if (!isTauriRuntime()) {
      const list = loadBrowserWorkspaces();
      const target = list.find((w) => w.id === workspaceId);
      if (!target) throw new Error("Workspace not found");
      if (commitMode) target.commitMode = commitMode;
      if (safetyMode) target.safetyMode = safetyMode;
      saveBrowserWorkspaces(list);
      return { ...target };
    }
    return invoke<WorkspaceConfig>("update_workspace_modes", {
      workspaceId,
      commitMode,
      safetyMode,
    });
  },

  async deleteWorkspace(workspaceId: string): Promise<void> {
    if (!isTauriRuntime()) {
      const list = loadBrowserWorkspaces().filter((w) => w.id !== workspaceId);
      saveBrowserWorkspaces(list);
      return;
    }
    return invoke<void>("delete_workspace", { workspaceId });
  },

  async testWorkspaceConnection(input: SaveWorkspaceInput): Promise<number> {
    return invoke<number>("test_workspace_connection", { input });
  },

  async connectWorkspace(workspaceId: string): Promise<number> {
    return invoke<number>("connect_workspace", { workspaceId });
  },

  async disconnectWorkspace(workspaceId: string): Promise<void> {
    if (!isTauriRuntime()) return;
    return invoke<void>("disconnect_workspace", { workspaceId });
  },

  async listDatabases(workspaceId: string): Promise<string[]> {
    return invoke<string[]>("list_databases", { workspaceId });
  },

  async getSchemaOverview(
    workspaceId: string,
    database: string
  ): Promise<SchemaOverview> {
    return invoke<SchemaOverview>("get_schema_overview", {
      workspaceId,
      database,
    });
  },

  async inspectContainer(
    workspaceId: string,
    database: string,
    schema: string | null | undefined,
    container: string
  ): Promise<ContainerStructure> {
    return invoke<ContainerStructure>("inspect_container", {
      workspaceId,
      database,
      schema: schema ?? null,
      container,
    });
  },

  async fetchDataPage(
    workspaceId: string,
    request: DataPageRequest
  ): Promise<DataPageResult> {
    return invoke<DataPageResult>("fetch_data_page", { workspaceId, request });
  },

  async previewMutations(
    workspaceId: string,
    request: StagedBatchRequest
  ): Promise<string[]> {
    return invoke<string[]>("preview_mutations", { workspaceId, request });
  },

  async applyMutations(
    workspaceId: string,
    request: StagedBatchRequest,
    confirmed = false
  ): Promise<MutationResult> {
    return invoke<MutationResult>("apply_mutations", {
      workspaceId,
      request,
      confirmed,
    });
  },

  async previewSchemaChange(
    workspaceId: string,
    request: SchemaChangeRequest
  ): Promise<string> {
    return invoke<string>("preview_schema_change", { workspaceId, request });
  },

  async applySchemaChange(
    workspaceId: string,
    request: SchemaChangeRequest,
    confirmed = false
  ): Promise<QueryExecutionResult> {
    return invoke<QueryExecutionResult>("apply_schema_change", {
      workspaceId,
      request,
      confirmed,
    });
  },

  async createSchema(
    workspaceId: string,
    database: string,
    schema: string
  ): Promise<QueryExecutionResult> {
    return invoke<QueryExecutionResult>("create_schema", {
      workspaceId,
      database,
      schema,
    });
  },

  async executeQuery(
    workspaceId: string,
    database: string,
    query: string,
    confirmed = false
  ): Promise<QueryExecutionResult> {
    return invoke<QueryExecutionResult>("execute_query", {
      workspaceId,
      database,
      query,
      confirmed,
    });
  },

  async listSavedQueries(workspaceId: string): Promise<SavedQueryRecord[]> {
    if (!isTauriRuntime()) return [];
    return invoke<SavedQueryRecord[]>("list_saved_queries", { workspaceId });
  },

  async saveWorkspaceQuery(params: {
    id?: string | null;
    workspaceId: string;
    title: string;
    folder?: string | null;
    database: string;
    queryText: string;
  }): Promise<SavedQueryRecord> {
    return invoke<SavedQueryRecord>("save_workspace_query", params);
  },

  async deleteSavedQuery(queryId: string): Promise<void> {
    return invoke<void>("delete_saved_query", { queryId });
  },

  async listQueryHistory(
    workspaceId: string,
    limit = 100
  ): Promise<QueryHistoryRecord[]> {
    if (!isTauriRuntime()) return [];
    return invoke<QueryHistoryRecord[]>("list_query_history", {
      workspaceId,
      limit,
    });
  },

  async saveWorkspaceTabs(
    workspaceId: string,
    tabsJson: string
  ): Promise<void> {
    if (!isTauriRuntime()) return;
    return invoke<void>("save_workspace_tabs", { workspaceId, tabsJson });
  },

  async getWorkspaceTabs(workspaceId: string): Promise<string | null> {
    if (!isTauriRuntime()) return null;
    return invoke<string | null>("get_workspace_tabs", { workspaceId });
  },

  async exportContainerData(params: {
    workspaceId: string;
    database: string;
    schema?: string | null;
    container: string;
    format: DataFormat;
    rows?: Record<string, any>[] | null;
    filePath?: string | null;
  }): Promise<string> {
    return invoke<string>("export_container_data", params);
  },

  async importContainerData(params: {
    workspaceId: string;
    database: string;
    schema?: string | null;
    container: string;
    format: DataFormat;
    rawContent: string;
  }): Promise<MutationResult> {
    return invoke<MutationResult>("import_container_data", params);
  },
};
