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
  isLoading: boolean;
  hasOverview: boolean;
}

export function SidebarObjectsSection({
  workspace,
  activeDb,
  containers,
  isLoading,
  hasOverview,
}: SidebarObjectsSectionProps) {
  const { openTab, refreshSchema, setImportExportTarget, pushToast } =
    useWorkspaceStore();

  const [filter, setFilter] = useState("");
  const [creatingContainer, setCreatingContainer] = useState(false);
  const [newContainerName, setNewContainerName] = useState("");
  const [newSchemaName, setNewSchemaName] = useState("public");
  const [creatingBusy, setCreatingBusy] = useState(false);

  const filteredContainers = containers.filter((c) => {
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
          autoComplete="off"
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
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              className="w-full px-2.5 py-1 rounded-md bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-200 focus:outline-none focus:border-emerald-500/60"
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
            Create
          </button>
        </form>
      )}

      {/* Containers List */}
      <div className="flex-1 overflow-y-auto py-1.5 px-2 space-y-0.5">
        {isLoading && !hasOverview ? (
          <div className="py-12 flex flex-col items-center justify-center gap-2 text-zinc-500 text-xs">
            <Loader2 className="w-5 h-5 animate-spin text-emerald-400" />
            <span>Introspecting schema...</span>
          </div>
        ) : filteredContainers.length === 0 ? (
          <div className="py-10 px-4 text-center text-xs text-zinc-500">
            No {workspace.engine === "mongodb" ? "collections" : "tables"} found
            in <span className="font-mono">{activeDb}</span>.
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
