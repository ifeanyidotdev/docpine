import React, { useState } from "react";
import {
  Search,
  Plus,
  X,
  Loader2,
  Table2,
  FileJson,
  Eye,
  SlidersHorizontal,
  Upload,
  Download,
} from "lucide-react";
import { useWorkspaceStore } from "../../../store/useWorkspaceStore";
import { ipc, parseAppError } from "../../../lib/ipc";
import type {
  ColumnMeta,
  ContainerSummary,
  WorkspaceConfig,
} from "../../../types/docpine";

interface SidebarObjectsSectionProps {
  workspace: WorkspaceConfig;
  activeDb: string;
  containers: ContainerSummary[];
  schemas?: string[];
  isLoading: boolean;
  hasOverview: boolean;
}

export function SidebarObjectsSection({
  workspace,
  activeDb,
  containers,
  schemas = [],
  isLoading,
  hasOverview,
}: SidebarObjectsSectionProps) {
  const { openTab, refreshSchema, createSchema, setImportExportTarget, pushToast } =
    useWorkspaceStore();

  const supportsSchemas = workspace.engine === "postgres";
  const [filter, setFilter] = useState("");
  const [selectedSchemaFilter, setSelectedSchemaFilter] = useState<string>("all");
  const [creatingContainer, setCreatingContainer] = useState(false);
  const [creationMode, setCreationMode] = useState<"table" | "schema">("table");
  const [newContainerName, setNewContainerName] = useState("");
  const [newSchemaName, setNewSchemaName] = useState("public");
  const [newCustomSchema, setNewCustomSchema] = useState("");
  const [creatingBusy, setCreatingBusy] = useState(false);
  const [creatingSchemaBusy, setCreatingSchemaBusy] = useState(false);

  const filteredContainers = containers.filter((c) => {
    if (
      supportsSchemas &&
      selectedSchemaFilter !== "all" &&
      (c.schema || "public") !== selectedSchemaFilter
    ) {
      return false;
    }
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
    if (!newContainerName.trim() || creatingBusy) return;
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
                    ? "BIGSERIAL"
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

  const handleCreateSchema = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newCustomSchema.trim();
    if (!name || creatingSchemaBusy) return;

    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
      pushToast({
        kind: "error",
        title: "Invalid schema name",
        message:
          "Schema name must start with a letter or underscore and contain only alphanumeric characters or underscores.",
      });
      return;
    }

    setCreatingSchemaBusy(true);
    try {
      await createSchema(workspace.id, activeDb, name);
      setCreatingContainer(false);
      setNewCustomSchema("");
      setSelectedSchemaFilter(name);
      setNewSchemaName(name);
    } catch {
      // Toast error handled in store
    } finally {
      setCreatingSchemaBusy(false);
    }
  };

  return (
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
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            className="w-full pl-8 pr-2 py-1 rounded-lg bg-zinc-900/70 border border-zinc-800 text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500/50"
          />
        </div>

        {workspace.safetyMode !== "read_only" && (
          <button
            onClick={() => setCreatingContainer((v) => !v)}
            title={
              workspace.engine === "mongodb"
                ? "Create New Collection"
                : supportsSchemas
                ? "Create New Table or Schema"
                : "Create New Table"
            }
            className="p-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 border border-emerald-500/30 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Schema Filter Bar (Only shown for engines supporting schemas when schemas exist) */}
      {supportsSchemas && schemas.length > 1 && (
        <div className="px-3 py-1.5 border-b border-zinc-800/40 flex items-center justify-between text-[11px] bg-zinc-950/40">
          <span className="text-zinc-500 font-medium">Schema:</span>
          <select
            value={selectedSchemaFilter}
            onChange={(e) => {
              const val = e.target.value;
              setSelectedSchemaFilter(val);
              if (val !== "all") {
                setNewSchemaName(val);
              }
            }}
            className="bg-zinc-900 border border-zinc-800 rounded px-2 py-0.5 text-zinc-300 text-xs font-mono focus:outline-none focus:border-emerald-500/50"
          >
            <option value="all">All Schemas ({containers.length})</option>
            {schemas.map((s) => {
              const count = containers.filter(
                (c) => (c.schema || "public") === s
              ).length;
              return (
                <option key={s} value={s}>
                  {s} ({count})
                </option>
              );
            })}
          </select>
        </div>
      )}

      {/* Inline Create Table / Schema Form */}
      {creatingContainer && (
        <div className="p-3 bg-zinc-900/90 border-b border-zinc-800 space-y-2">
          {/* Engine supporting schemas: show toggle tabs between Table and Schema */}
          {supportsSchemas && (
            <div className="flex items-center gap-1 p-0.5 rounded-lg bg-zinc-950 border border-zinc-800 text-[11px]">
              <button
                type="button"
                onClick={() => setCreationMode("table")}
                className={`flex-1 py-1 rounded-md font-medium transition-colors ${
                  creationMode === "table"
                    ? "bg-zinc-800 text-zinc-100 shadow-xs"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Table
              </button>
              <button
                type="button"
                onClick={() => setCreationMode("schema")}
                className={`flex-1 py-1 rounded-md font-medium transition-colors ${
                  creationMode === "schema"
                    ? "bg-zinc-800 text-zinc-100 shadow-xs"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Schema
              </button>
            </div>
          )}

          {/* Table / Collection Creation Mode */}
          {(!supportsSchemas || creationMode === "table") && (
            <form
              autoComplete="off"
              onSubmit={(e) => void handleCreateContainer(e)}
              className="space-y-2"
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

              {supportsSchemas && (
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-zinc-400">
                    <span>Target Schema</span>
                    <button
                      type="button"
                      onClick={() => setCreationMode("schema")}
                      className="text-emerald-400 hover:underline text-[10px]"
                    >
                      + New Schema
                    </button>
                  </div>
                  {schemas.length > 0 ? (
                    <select
                      value={newSchemaName}
                      onChange={(e) => setNewSchemaName(e.target.value)}
                      className="w-full px-2.5 py-1 rounded-md bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-200 focus:outline-none focus:border-emerald-500/60"
                    >
                      {schemas.map((s) => (
                        <option key={s} value={s}>
                          schema: {s}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={newSchemaName}
                      onChange={(e) => setNewSchemaName(e.target.value)}
                      placeholder="Schema (default: public)"
                      autoComplete="off"
                      className="w-full px-2.5 py-1 rounded-md bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-200 focus:outline-none focus:border-emerald-500/60"
                    />
                  )}
                </div>
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
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                className="w-full px-2.5 py-1 rounded-md bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-200 focus:outline-none focus:border-emerald-500/60"
              />
              <button
                type="submit"
                disabled={creatingBusy || !newContainerName.trim()}
                className="w-full py-1.5 rounded-md bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-zinc-950 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
              >
                {creatingBusy && <Loader2 className="w-3 h-3 animate-spin" />}
                Create Table
              </button>
            </form>
          )}

          {/* Schema Creation Mode (PostgreSQL only) */}
          {supportsSchemas && creationMode === "schema" && (
            <form
              autoComplete="off"
              onSubmit={(e) => void handleCreateSchema(e)}
              className="space-y-2"
            >
              <div className="flex items-center justify-between text-xs font-semibold text-zinc-200">
                <span>Create New Schema</span>
                <button
                  type="button"
                  onClick={() => setCreatingContainer(false)}
                  className="text-zinc-400 hover:text-zinc-200"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <p className="text-[11px] text-zinc-400">
                Create a schema namespace in <span className="font-mono text-zinc-200">{activeDb}</span>.
              </p>

              <input
                type="text"
                value={newCustomSchema}
                onChange={(e) => setNewCustomSchema(e.target.value)}
                placeholder="Schema name (e.g. analytics, billing, auth)"
                autoFocus
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                className="w-full px-2.5 py-1 rounded-md bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-200 focus:outline-none focus:border-emerald-500/60"
              />

              <button
                type="submit"
                disabled={creatingSchemaBusy || !newCustomSchema.trim()}
                className="w-full py-1.5 rounded-md bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-zinc-950 font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors"
              >
                {creatingSchemaBusy && <Loader2 className="w-3 h-3 animate-spin" />}
                Create Schema
              </button>
            </form>
          )}
        </div>
      )}

      {/* Containers List */}
      <div className="flex-1 overflow-y-auto py-1.5 px-2 space-y-0.5">
        {isLoading && !hasOverview ? (
          <div className="py-12 flex flex-col items-center justify-center gap-2 text-zinc-500 text-xs">
            <Loader2 className="w-5 h-5 animate-spin text-emerald-400" />
            <span>Introspecting schema...</span>
          </div>
        ) : filteredContainers.length === 0 ? (
          <div className="py-10 px-4 text-center text-xs text-zinc-500 space-y-2">
            <div>
              No {workspace.engine === "mongodb" ? "collections" : "tables"} found
              {selectedSchemaFilter !== "all" ? (
                <> in schema <span className="font-mono text-zinc-300">{selectedSchemaFilter}</span></>
              ) : (
                <> in <span className="font-mono text-zinc-300">{activeDb}</span></>
              )}.
            </div>
            {supportsSchemas && selectedSchemaFilter !== "all" && workspace.safetyMode !== "read_only" && (
              <button
                type="button"
                onClick={() => {
                  setNewSchemaName(selectedSchemaFilter);
                  setCreationMode("table");
                  setCreatingContainer(true);
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-zinc-900 hover:bg-zinc-800 text-emerald-400 border border-zinc-800 text-xs transition-colors"
              >
                <Plus className="w-3 h-3" />
                <span>Create table in {selectedSchemaFilter}</span>
              </button>
            )}
          </div>
        ) : (
          filteredContainers.map((item) => {
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
                    <Table2 className="w-3.5 h-3.5 text-zinc-400 group-hover:text-emerald-400 shrink-0 transition-colors" />
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
                      <span
                        title={
                          item.rowCountCapped
                            ? `Over ${item.estimatedRows.toLocaleString()} rows`
                            : `${item.estimatedRows.toLocaleString()} rows`
                        }
                        className="text-[10px] font-mono text-zinc-500 group-hover:hidden"
                      >
                        {item.estimatedRows.toLocaleString()}
                        {item.rowCountCapped ? "+" : ""}
                      </span>
                    )}

                  <button
                    onClick={() => handleOpenStructure(item)}
                    title="Inspect Structure, Columns & Indexes"
                    className="hidden group-hover:inline-flex p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-sky-300 transition-colors"
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
                    className="hidden group-hover:inline-flex p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-emerald-300 transition-colors"
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
                    className="hidden group-hover:inline-flex p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-amber-300 transition-colors"
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
  );
}
