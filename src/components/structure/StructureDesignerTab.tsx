import React, { useCallback, useEffect, useState } from "react";
import {
  KeyRound,
  Link2,
  Plus,
  Trash2,
  RefreshCw,
  Code2,
  Loader2,
  Table2,
} from "lucide-react";
import { useWorkspaceStore } from "../../store/useWorkspaceStore";
import { ipc, parseAppError } from "../../lib/ipc";
import type {
  ContainerStructure,
  WorkspaceConfig,
  WorkspaceTab,
} from "../../types/docpine";

interface StructureDesignerTabProps {
  workspace: WorkspaceConfig;
  tab: WorkspaceTab;
}

export function StructureDesignerTab({
  workspace,
  tab,
}: StructureDesignerTabProps) {
  const { refreshSchema, openTab, closeTab, pushToast } = useWorkspaceStore();

  const [structure, setStructure] = useState<ContainerStructure | null>(null);
  const [loading, setLoading] = useState(false);

  // Add Column Form State
  const [newColName, setNewColName] = useState("");
  const [newColType, setNewColType] = useState(
    workspace.engine === "postgres" ? "TEXT" : "VARCHAR(255)"
  );
  const [newColNullable, setNewColNullable] = useState(true);
  const [newColDefault, setNewColDefault] = useState("");

  // Create Index Form State
  const [newIdxName, setNewIdxName] = useState("");
  const [newIdxCols, setNewIdxCols] = useState("");
  const [newIdxUnique, setNewIdxUnique] = useState(false);

  const isReadOnly = workspace.safetyMode === "read_only";
  const isMongo = workspace.engine === "mongodb";

  const loadStructure = useCallback(async () => {
    if (!tab.container) return;
    setLoading(true);
    try {
      const res = await ipc.inspectContainer(
        workspace.id,
        tab.database,
        tab.schema,
        tab.container
      );
      setStructure(res);
    } catch (err) {
      const parsed = parseAppError(err);
      pushToast({
        kind: "error",
        title: "Structure inspection failed",
        message: parsed.message,
      });
    } finally {
      setLoading(false);
    }
  }, [workspace.id, tab.database, tab.schema, tab.container, pushToast]);

  useEffect(() => {
    void loadStructure();
  }, [loadStructure]);

  const handleAddColumn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newColName.trim() || !tab.container) return;
    try {
      await ipc.applySchemaChange(
        workspace.id,
        {
          database: tab.database,
          schema: tab.schema ?? null,
          container: tab.container,
          change: {
            action: "add_column",
            column: {
              name: newColName.trim(),
              dataType: newColType.trim() || "TEXT",
              isPrimaryKey: false,
              isNullable: newColNullable,
              defaultValue: newColDefault.trim() || null,
              foreignKeyTarget: null,
            },
          },
        },
        true
      );
      pushToast({
        kind: "success",
        title: `Added column ${newColName.trim()}`,
      });
      setNewColName("");
      setNewColDefault("");
      await loadStructure();
      await refreshSchema(workspace.id, tab.database);
    } catch (err) {
      const parsed = parseAppError(err);
      pushToast({
        kind: "error",
        title: "Failed to add column",
        message: parsed.message,
      });
    }
  };

  const handleDropColumn = async (columnName: string) => {
    if (!tab.container) return;
    try {
      await ipc.applySchemaChange(
        workspace.id,
        {
          database: tab.database,
          schema: tab.schema ?? null,
          container: tab.container,
          change: {
            action: "drop_column",
            column_name: columnName,
          },
        },
        true
      );
      pushToast({
        kind: "info",
        title: `Dropped column ${columnName}`,
      });
      await loadStructure();
      await refreshSchema(workspace.id, tab.database);
    } catch (err) {
      const parsed = parseAppError(err);
      pushToast({
        kind: "error",
        title: "Drop column failed",
        message: parsed.message,
      });
    }
  };

  const handleCreateIndex = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newIdxName.trim() || !newIdxCols.trim() || !tab.container) return;
    const cols = newIdxCols
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (cols.length === 0) return;

    try {
      await ipc.applySchemaChange(
        workspace.id,
        {
          database: tab.database,
          schema: tab.schema ?? null,
          container: tab.container,
          change: {
            action: "create_index",
            index_name: newIdxName.trim(),
            columns: cols,
            is_unique: newIdxUnique,
          },
        },
        true
      );
      pushToast({
        kind: "success",
        title: `Created index ${newIdxName.trim()}`,
      });
      setNewIdxName("");
      setNewIdxCols("");
      setNewIdxUnique(false);
      await loadStructure();
    } catch (err) {
      const parsed = parseAppError(err);
      pushToast({
        kind: "error",
        title: "Create index failed",
        message: parsed.message,
      });
    }
  };

  const handleDropIndex = async (indexName: string) => {
    if (!tab.container) return;
    try {
      await ipc.applySchemaChange(
        workspace.id,
        {
          database: tab.database,
          schema: tab.schema ?? null,
          container: tab.container,
          change: {
            action: "drop_index",
            index_name: indexName,
          },
        },
        true
      );
      pushToast({
        kind: "info",
        title: `Dropped index ${indexName}`,
      });
      await loadStructure();
    } catch (err) {
      const parsed = parseAppError(err);
      pushToast({
        kind: "error",
        title: "Drop index failed",
        message: parsed.message,
      });
    }
  };

  const handleDropContainer = async () => {
    if (!tab.container) return;
    try {
      await ipc.applySchemaChange(
        workspace.id,
        {
          database: tab.database,
          schema: tab.schema ?? null,
          container: tab.container,
          change: {
            action: "drop_container",
          },
        },
        true
      );
      pushToast({
        kind: "info",
        title: `Dropped ${tab.container}`,
      });
      await refreshSchema(workspace.id, tab.database);
      closeTab(workspace.id, tab.id);
    } catch (err) {
      const parsed = parseAppError(err);
      pushToast({
        kind: "error",
        title: "Drop failed",
        message: parsed.message,
      });
    }
  };

  return (
    <div className="flex-1 h-full overflow-y-auto bg-zinc-950 p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-sky-500/15 text-sky-300 border border-sky-500/30">
              {isMongo ? "Collection Structure" : "Table Structure"}
            </span>
            <h2 className="text-lg font-bold text-zinc-100 font-mono">
              {tab.schema ? `${tab.schema}.` : ""}
              {tab.container}
            </h2>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            {isMongo
              ? "Inspect inferred BSON document fields and manage MongoDB collection indexes."
              : "Inspect and alter columns, primary keys, foreign keys, and indexes."}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() =>
              openTab(workspace.id, {
                kind: "data",
                title: tab.container || "Data",
                database: tab.database,
                schema: tab.schema,
                container: tab.container,
                dataViewMode: "table",
              })
            }
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs text-emerald-300 font-medium"
          >
            <Table2 className="w-3.5 h-3.5" />
            <span>Open Data Grid</span>
          </button>

          <button
            onClick={() => void loadStructure()}
            className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300"
          >
            <RefreshCw
              className={`w-4 h-4 ${loading ? "animate-spin text-emerald-400" : ""}`}
            />
          </button>

          {!isReadOnly && (
            <button
              onClick={() => void handleDropContainer()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-xs text-rose-300 font-medium"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Drop {isMongo ? "Collection" : "Table"}</span>
            </button>
          )}
        </div>
      </div>

      {loading && !structure ? (
        <div className="py-16 flex items-center justify-center gap-2 text-zinc-400 text-xs">
          <Loader2 className="w-5 h-5 animate-spin text-emerald-400" />
          <span>Loading structure metadata...</span>
        </div>
      ) : (
        structure && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Columns / Fields Table (2 cols wide) */}
            <div className="lg:col-span-2 space-y-4">
              <div className="rounded-2xl bg-zinc-900/60 border border-zinc-800 overflow-hidden">
                <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-200">
                    {isMongo
                      ? `Inferred Document Fields (${structure.columns.length})`
                      : `Columns (${structure.columns.length})`}
                  </h3>
                </div>

                <table className="w-full text-xs font-mono border-collapse">
                  <thead className="bg-zinc-900/90 text-zinc-400 border-b border-zinc-800">
                    <tr>
                      <th className="px-4 py-2 text-left">Field / Column</th>
                      <th className="px-4 py-2 text-left">Data Type</th>
                      <th className="px-4 py-2 text-left">Nullable</th>
                      <th className="px-4 py-2 text-left">Default / Ref</th>
                      {!isReadOnly && !isMongo && (
                        <th className="px-4 py-2 text-right">Action</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {structure.columns.map((col) => (
                      <tr
                        key={col.name}
                        className="border-b border-zinc-800/60 hover:bg-zinc-900"
                      >
                        <td className="px-4 py-2.5 font-semibold text-zinc-100 flex items-center gap-1.5">
                          {col.isPrimaryKey && (
                            <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                          )}
                          {col.foreignKeyTarget && (
                            <Link2 className="w-3.5 h-3.5 text-indigo-400" />
                          )}
                          {col.name}
                        </td>
                        <td className="px-4 py-2.5 text-emerald-300">
                          {col.dataType}
                        </td>
                        <td className="px-4 py-2.5 text-zinc-400">
                          {col.isNullable ? "YES" : "NOT NULL"}
                        </td>
                        <td className="px-4 py-2.5 text-zinc-400 truncate max-w-[200px]">
                          {col.foreignKeyTarget
                            ? `-> ${col.foreignKeyTarget}`
                            : col.defaultValue || "—"}
                        </td>
                        {!isReadOnly && !isMongo && (
                          <td className="px-4 py-2.5 text-right">
                            {!col.isPrimaryKey && (
                              <button
                                onClick={() => void handleDropColumn(col.name)}
                                className="p-1 rounded hover:bg-rose-500/15 text-zinc-500 hover:text-rose-400"
                                title="Drop Column"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Add Column Form for SQL */}
                {!isReadOnly && !isMongo && (
                  <form
                    onSubmit={(e) => void handleAddColumn(e)}
                    className="p-3 bg-zinc-950/70 border-t border-zinc-800 flex flex-wrap items-center gap-2"
                  >
                    <input
                      type="text"
                      value={newColName}
                      onChange={(e) => setNewColName(e.target.value)}
                      placeholder="New column name..."
                      className="px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-mono text-zinc-100"
                    />
                    <input
                      type="text"
                      value={newColType}
                      onChange={(e) => setNewColType(e.target.value)}
                      placeholder="Data type (e.g. TEXT, INT, JSONB)"
                      className="w-40 px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-mono text-emerald-300"
                    />
                    <input
                      type="text"
                      value={newColDefault}
                      onChange={(e) => setNewColDefault(e.target.value)}
                      placeholder="Default (optional)"
                      className="w-36 px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-mono text-zinc-200"
                    />
                    <label className="flex items-center gap-1.5 text-xs text-zinc-400 px-1">
                      <input
                        type="checkbox"
                        checked={newColNullable}
                        onChange={(e) => setNewColNullable(e.target.checked)}
                      />
                      Nullable
                    </label>
                    <button
                      type="submit"
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-xs ml-auto"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add Column
                    </button>
                  </form>
                )}
              </div>

              {/* DDL / Statement Preview */}
              {structure.ddlStatement && (
                <div className="rounded-2xl bg-zinc-900/60 border border-zinc-800 p-4 space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-zinc-300">
                    <Code2 className="w-4 h-4 text-emerald-400" />
                    <span>DDL / Creation Blueprint</span>
                  </div>
                  <pre className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-mono text-emerald-200 overflow-x-auto">
                    {structure.ddlStatement}
                  </pre>
                </div>
              )}
            </div>

            {/* Right Column: Indexes & Foreign Keys */}
            <div className="space-y-4">
              {/* Indexes Card */}
              <div className="rounded-2xl bg-zinc-900/60 border border-zinc-800 overflow-hidden">
                <div className="px-4 py-3 border-b border-zinc-800">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-200">
                    Indexes ({structure.indexes.length})
                  </h3>
                </div>

                <div className="divide-y divide-zinc-800/60">
                  {structure.indexes.map((idx) => (
                    <div
                      key={idx.name}
                      className="px-4 py-2.5 flex items-center justify-between gap-2 text-xs font-mono"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-zinc-100 truncate">
                          {idx.name}
                        </div>
                        <div className="text-[11px] text-zinc-400">
                          ({idx.columns.join(", ")}){" "}
                          {idx.isUnique ? "• UNIQUE" : ""}
                        </div>
                      </div>
                      {!isReadOnly && !idx.isPrimary && (
                        <button
                          onClick={() => void handleDropIndex(idx.name)}
                          className="p-1 rounded hover:bg-rose-500/15 text-zinc-500 hover:text-rose-400"
                          title="Drop Index"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {!isReadOnly && (
                  <form
                    onSubmit={(e) => void handleCreateIndex(e)}
                    className="p-3 bg-zinc-950/70 border-t border-zinc-800 space-y-2"
                  >
                    <div className="text-[11px] font-semibold text-zinc-400">
                      Create New Index
                    </div>
                    <input
                      type="text"
                      value={newIdxName}
                      onChange={(e) => setNewIdxName(e.target.value)}
                      placeholder="Index name (e.g. idx_users_email)"
                      className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-mono text-zinc-100"
                    />
                    <input
                      type="text"
                      value={newIdxCols}
                      onChange={(e) => setNewIdxCols(e.target.value)}
                      placeholder="Columns comma-separated (e.g. email, status)"
                      className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-mono text-zinc-100"
                    />
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-1.5 text-xs text-zinc-400">
                        <input
                          type="checkbox"
                          checked={newIdxUnique}
                          onChange={(e) => setNewIdxUnique(e.target.checked)}
                        />
                        Unique Index
                      </label>
                      <button
                        type="submit"
                        className="px-3 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-xs"
                      >
                        + Create Index
                      </button>
                    </div>
                  </form>
                )}
              </div>

              {/* Foreign Keys / References Card */}
              <div className="rounded-2xl bg-zinc-900/60 border border-zinc-800 overflow-hidden">
                <div className="px-4 py-3 border-b border-zinc-800">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-200">
                    Foreign Keys &amp; References ({structure.foreignKeys.length})
                  </h3>
                </div>
                <div className="p-4 space-y-2 text-xs font-mono">
                  {structure.foreignKeys.length === 0 ? (
                    <div className="text-zinc-500 font-sans">
                      No foreign key constraints registered on this object.
                    </div>
                  ) : (
                    structure.foreignKeys.map((fk) => (
                      <div
                        key={fk.constraintName}
                        className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1"
                      >
                        <div className="text-indigo-300 font-semibold">
                          {fk.constraintName}
                        </div>
                        <div className="text-zinc-300 text-[11px]">
                          {fk.sourceColumn} → {fk.targetContainer}.
                          {fk.targetColumn}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      )}
    </div>
  );
}
