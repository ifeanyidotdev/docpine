import React, { useState } from "react";
import {
  Database,
  Table2,
  Eye,
  FileJson,
  RefreshCw,
  Search,
  Plus,
  SlidersHorizontal,
  Bookmark,
  History,
  Trash2,
  Upload,
  Download,
  Loader2,
  X,
} from "lucide-react";
import { useWorkspaceStore } from "../../store/useWorkspaceStore";
import { ipc, parseAppError } from "../../lib/ipc";
import type {
  ColumnMeta,
  ContainerSummary,
  WorkspaceConfig,
} from "../../types/docpine";

interface WorkspaceSidebarProps {
  workspace: WorkspaceConfig;
}

export function WorkspaceSidebar({ workspace }: WorkspaceSidebarProps) {
  const {
    databasesByWorkspace,
    activeDatabaseByWorkspace,
    schemaByWorkspaceDb,
    schemaLoading,
    savedQueriesByWorkspace,
    historyByWorkspace,
    switchDatabase,
    refreshSchema,
    openTab,
    deleteSavedQueryFromWorkspace,
    setImportExportTarget,
    pushToast,
  } = useWorkspaceStore();

  const [section, setSection] = useState<"schema" | "saved" | "history">(
    "schema"
  );
  const [filter, setFilter] = useState("");
  const [creatingContainer, setCreatingContainer] = useState(false);
  const [newContainerName, setNewContainerName] = useState("");
  const [newSchemaName, setNewSchemaName] = useState("public");
  const [creatingBusy, setCreatingBusy] = useState(false);

  const databases = databasesByWorkspace[workspace.id] || [];
  const activeDb =
    activeDatabaseByWorkspace[workspace.id] || workspace.defaultDatabase;
  const cacheKey = `${workspace.id}:${activeDb}`;
  const overview = schemaByWorkspaceDb[cacheKey];
  const isLoading = schemaLoading[cacheKey];

  const savedQueries = savedQueriesByWorkspace[workspace.id] || [];
  const historyList = historyByWorkspace[workspace.id] || [];

  const containers = (overview?.containers || []).filter((c) => {
    if (!filter.trim()) return true;
    const q = filter.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.schema || "").toLowerCase().includes(q)
    );
  });

  const handleOpenData = (c: ContainerSummary) => {
    openTab(workspace.id, {
      kind: "data",
      title: c.name,
      database: activeDb,
      schema: c.schema,
      container: c.name,
      dataViewMode: "table",
    });
  };

  const handleOpenStructure = (c: ContainerSummary) => {
    openTab(workspace.id, {
      kind: "structure",
      title: `${c.name} (Structure)`,
      database: activeDb,
      schema: c.schema,
      container: c.name,
    });
  };

  const handleCreateContainer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContainerName.trim()) return;
    setCreatingBusy(true);
    try {
      const defaultColumns: ColumnMeta[] =
        workspace.engine === "mongodb"
          ? []
          : [
              {
                name: "id",
                dataType:
                  workspace.engine === "postgres"
                    ? " BIGSERIAL"
                    : "BIGINT AUTO_INCREMENT",
                isPrimaryKey: true,
                isNullable: false,
                defaultValue: null,
                foreignKeyTarget: null,
              },
              {
                name: "created_at",
                dataType:
                  workspace.engine === "postgres" ? "TIMESTAMPTZ" : "DATETIME",
                isPrimaryKey: false,
                isNullable: true,
                defaultValue: "CURRENT_TIMESTAMP",
                foreignKeyTarget: null,
              },
            ];

      await ipc.applySchemaChange(
        workspace.id,
        {
          database: activeDb,
          schema:
            workspace.engine === "postgres"
              ? newSchemaName.trim() || "public"
              : null,
          container: newContainerName.trim(),
          change: {
            action: "create_container",
            columns: defaultColumns,
          },
        },
        true
      );

      pushToast({
        kind: "success",
        title:
          workspace.engine === "mongodb"
            ? "Collection created"
            : "Table created",
        message: newContainerName.trim(),
      });
      setCreatingContainer(false);
      setNewContainerName("");
      await refreshSchema(workspace.id, activeDb);
    } catch (err) {
      const parsed = parseAppError(err);
      pushToast({
        kind: "error",
        title: "Failed to create object",
        message: parsed.message,
      });
    } finally {
      setCreatingBusy(false);
    }
  };

  return (
    <aside className="w-68 h-full bg-zinc-950 border-r border-zinc-800/80 flex flex-col select-none shrink-0">
      {/* Database Switcher Header */}
      <div className="p-3 border-b border-zinc-800/80 space-y-2">
        <div className="flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
            <Database className="w-3.5 h-3.5 text-emerald-400" />
            <span>Database</span>
          </div>
          <button
            onClick={() => void refreshSchema(workspace.id, activeDb)}
            title="Refresh Schema"
            className="p-1 rounded-md hover:bg-zinc-900 text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-emerald-400" : ""}`}
            />
          </button>
        </div>

        <select
          value={activeDb}
          onChange={(e) => void switchDatabase(workspace.id, e.target.value)}
          className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-mono text-zinc-100 focus:outline-none focus:border-emerald-500/60"
        >
          {databases.length === 0 ? (
            <option value={activeDb}>{activeDb || "(default)"}</option>
          ) : (
            databases.map((db) => (
              <option key={db} value={db}>
                {db}
              </option>
            ))
          )}
        </select>

        {/* Sidebar Mode Switcher */}
        <div className="grid grid-cols-3 gap-1 p-0.5 rounded-lg bg-zinc-900/90 border border-zinc-800/80 text-[11px]">
          <button
            onClick={() => setSection("schema")}
            className={`py-1 rounded-md font-medium transition-colors ${
              section === "schema"
                ? "bg-zinc-800 text-zinc-100 shadow-xs"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            Objects ({overview?.containers.length ?? 0})
          </button>
          <button
            onClick={() => setSection("saved")}
            className={`py-1 rounded-md font-medium transition-colors flex items-center justify-center gap-1 ${
              section === "saved"
                ? "bg-zinc-800 text-zinc-100 shadow-xs"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Bookmark className="w-3 h-3" />
            Saved
          </button>
          <button
            onClick={() => setSection("history")}
            className={`py-1 rounded-md font-medium transition-colors flex items-center justify-center gap-1 ${
              section === "history"
                ? "bg-zinc-800 text-zinc-100 shadow-xs"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <History className="w-3 h-3" />
            Logs
          </button>
        </div>
      </div>

      {section === "schema" && (
        <>
          {/* Filter + New Table/Collection Bar */}
          <div className="px-3 py-2 border-b border-zinc-800/60 flex items-center gap-1.5">
            <div className="relative flex-1">
              <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder={
                  workspace.engine === "mongodb"
                    ? "Filter collections..."
                    : "Filter tables & views..."
                }
                className="w-full pl-8 pr-2 py-1 rounded-lg bg-zinc-900/70 border border-zinc-800 text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500/50"
              />
            </div>

            {workspace.safetyMode !== "read_only" && (
              <button
                onClick={() => setCreatingContainer((v) => !v)}
                title={
                  workspace.engine === "mongodb"
                    ? "Create New Collection"
                    : "Create New Table"
                }
                className="p-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Inline Create Table / Collection Form */}
          {creatingContainer && (
            <form
              onSubmit={(e) => void handleCreateContainer(e)}
              className="p-3 bg-zinc-900/90 border-b border-zinc-800 space-y-2"
            >
              <div className="flex items-center justify-between text-xs font-semibold text-zinc-200">
                <span>
                  {workspace.engine === "mongodb"
                    ? "New Collection"
                    : "Quick Create Table"}
                </span>
                <button
                  type="button"
                  onClick={() => setCreatingContainer(false)}
                  className="text-zinc-400 hover:text-zinc-200"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              {workspace.engine === "postgres" && (
                <input
                  type="text"
                  value={newSchemaName}
                  onChange={(e) => setNewSchemaName(e.target.value)}
                  placeholder="Schema (default: public)"
                  className="w-full px-2.5 py-1 rounded-md bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-200"
                />
              )}
              <input
                type="text"
                value={newContainerName}
                onChange={(e) => setNewContainerName(e.target.value)}
                placeholder={
                  workspace.engine === "mongodb"
                    ? "Collection name (e.g. events)"
                    : "Table name (e.g. customers)"
                }
                autoFocus
                className="w-full px-2.5 py-1 rounded-md bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-200"
              />
              <button
                type="submit"
                disabled={creatingBusy}
                className="w-full py-1.5 rounded-md bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-xs flex items-center justify-center gap-1.5"
              >
                {creatingBusy && <Loader2 className="w-3 h-3 animate-spin" />}
                Create
              </button>
            </form>
          )}

          {/* Containers List */}
          <div className="flex-1 overflow-y-auto py-1.5 px-2 space-y-0.5">
            {isLoading && !overview ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2 text-zinc-500 text-xs">
                <Loader2 className="w-5 h-5 animate-spin text-emerald-400" />
                <span>Introspecting schema...</span>
              </div>
            ) : containers.length === 0 ? (
              <div className="py-10 px-4 text-center text-xs text-zinc-500">
                No {workspace.engine === "mongodb" ? "collections" : "tables"}{" "}
                found in <span className="font-mono">{activeDb}</span>.
              </div>
            ) : (
              containers.map((item) => {
                const key = `${item.schema || ""}:${item.name}`;
                return (
                  <div
                    key={key}
                    onClick={() => handleOpenData(item)}
                    className="group px-2.5 py-1.5 rounded-lg hover:bg-zinc-900 flex items-center justify-between gap-2 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {item.kind === "collection" ? (
                        <FileJson className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      ) : item.kind === "view" ? (
                        <Eye className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                      ) : (
                        <Table2 className="w-3.5 h-3.5 text-zinc-400 group-hover:text-emerald-400 shrink-0" />
                      )}
                      <div className="truncate">
                        {item.schema && item.schema !== "public" && (
                          <span className="text-[10px] text-zinc-500 font-mono mr-1">
                            {item.schema}.
                          </span>
                        )}
                        <span className="text-xs text-zinc-200 font-medium">
                          {item.name}
                        </span>
                      </div>
                    </div>

                    <div
                      className="flex items-center gap-1 shrink-0"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {item.estimatedRows !== undefined &&
                        item.estimatedRows !== null && (
                          <span className="text-[10px] font-mono text-zinc-500 group-hover:hidden">
                            {item.estimatedRows}
                          </span>
                        )}

                      <button
                        onClick={() => handleOpenStructure(item)}
                        title="Inspect Structure, Columns & Indexes"
                        className="hidden group-hover:inline-flex p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-sky-300"
                      >
                        <SlidersHorizontal className="w-3 h-3" />
                      </button>

                      <button
                        onClick={() =>
                          setImportExportTarget({
                            mode: "import",
                            workspaceId: workspace.id,
                            database: activeDb,
                            schema: item.schema,
                            container: item.name,
                          })
                        }
                        title="Import CSV / JSON"
                        className="hidden group-hover:inline-flex p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-emerald-300"
                      >
                        <Upload className="w-3 h-3" />
                      </button>

                      <button
                        onClick={() =>
                          setImportExportTarget({
                            mode: "export",
                            workspaceId: workspace.id,
                            database: activeDb,
                            schema: item.schema,
                            container: item.name,
                          })
                        }
                        title="Export CSV / JSON / SQL"
                        className="hidden group-hover:inline-flex p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-amber-300"
                      >
                        <Download className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}

      {section === "saved" && (
        <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
          {savedQueries.length === 0 ? (
            <div className="py-10 px-4 text-center text-xs text-zinc-500">
              No saved queries in this workspace yet. Save any query from the
              Query Editor tab.
            </div>
          ) : (
            savedQueries.map((sq) => (
              <div
                key={sq.id}
                onClick={() =>
                  openTab(workspace.id, {
                    kind: "query",
                    title: sq.title,
                    database: sq.database || activeDb,
                    queryText: sq.queryText,
                  })
                }
                className="group p-2.5 rounded-xl bg-zinc-900/50 hover:bg-zinc-900 border border-zinc-800/70 cursor-pointer space-y-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-zinc-200 truncate">
                    {sq.title}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      void deleteSavedQueryFromWorkspace(workspace.id, sq.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-rose-500/15 text-zinc-400 hover:text-rose-400"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
                <pre className="text-[10px] font-mono text-zinc-400 truncate">
                  {sq.queryText}
                </pre>
              </div>
            ))
          )}
        </div>
      )}

      {section === "history" && (
        <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
          {historyList.length === 0 ? (
            <div className="py-10 px-4 text-center text-xs text-zinc-500">
              Query and mutation history for this workspace will appear here.
            </div>
          ) : (
            historyList.map((item) => (
              <div
                key={item.id}
                onClick={() =>
                  openTab(workspace.id, {
                    kind: "query",
                    title: "History Query",
                    database: item.database || activeDb,
                    queryText: item.queryText,
                  })
                }
                className="p-2.5 rounded-xl bg-zinc-900/40 hover:bg-zinc-900 border border-zinc-800/60 cursor-pointer space-y-1"
              >
                <div className="flex items-center justify-between text-[10px]">
                  <span
                    className={`font-semibold uppercase ${
                      item.status === "success"
                        ? "text-emerald-400"
                        : "text-rose-400"
                    }`}
                  >
                    {item.status} • {item.executionMs}ms
                  </span>
                  <span className="text-zinc-500 font-mono">
                    {new Date(item.executedAt).toLocaleTimeString()}
                  </span>
                </div>
                <pre className="text-[10px] font-mono text-zinc-300 line-clamp-2 whitespace-pre-wrap break-all">
                  {item.queryText}
                </pre>
              </div>
            ))
          )}
        </div>
      )}
    </aside>
  );
}
