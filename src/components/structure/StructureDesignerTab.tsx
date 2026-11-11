import React, { useCallback, useEffect, useState } from "react";
import { RefreshCw, Loader2, Table2, Trash2 } from "lucide-react";
import { useWorkspaceStore } from "../../store/useWorkspaceStore";
import { ipc, parseAppError } from "../../lib/ipc";
import { ColumnsTable } from "./ColumnsTable";
import { IndexesCard } from "./IndexesCard";
import { ForeignKeysCard } from "./ForeignKeysCard";
import { DdlPreviewCard } from "./DdlPreviewCard";
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

  const handleAddColumn = async (
    name: string,
    dataType: string,
    isNullable: boolean,
    defaultValue: string
  ) => {
    if (!tab.container) return;
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
              name,
              dataType,
              isPrimaryKey: false,
              isNullable,
              defaultValue: defaultValue || null,
              foreignKeyTarget: null,
            },
          },
        },
        true
      );
      pushToast({
        kind: "success",
        title: `Added column ${name}`,
      });
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

  const handleCreateIndex = async (
    indexName: string,
    columns: string[],
    isUnique: boolean
  ) => {
    if (!tab.container) return;
    try {
      await ipc.applySchemaChange(
        workspace.id,
        {
          database: tab.database,
          schema: tab.schema ?? null,
          container: tab.container,
          change: {
            action: "create_index",
            index_name: indexName,
            columns,
            is_unique: isUnique,
          },
        },
        true
      );
      pushToast({
        kind: "success",
        title: `Created index ${indexName}`,
      });
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
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs text-emerald-300 font-medium transition-colors"
          >
            <Table2 className="w-3.5 h-3.5" />
            <span>Open Data Grid</span>
          </button>

          <button
            onClick={() => void loadStructure()}
            className="p-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 transition-colors"
            title="Refresh Structure"
          >
            <RefreshCw
              className={`w-4 h-4 ${loading ? "animate-spin text-emerald-400" : ""}`}
            />
          </button>

          {!isReadOnly && (
            <button
              onClick={() => void handleDropContainer()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-xs text-rose-300 font-medium transition-colors"
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
            {/* Columns Table & DDL Preview (2 cols wide) */}
            <div className="lg:col-span-2 space-y-4">
              <ColumnsTable
                columns={structure.columns}
                isMongo={isMongo}
                isReadOnly={isReadOnly}
                engine={workspace.engine}
                onDropColumn={handleDropColumn}
                onAddColumn={handleAddColumn}
              />

              {structure.ddlStatement && (
                <DdlPreviewCard ddlStatement={structure.ddlStatement} />
              )}
            </div>

            {/* Right Column: Indexes & Foreign Keys */}
            <div className="space-y-4">
              <IndexesCard
                indexes={structure.indexes}
                isReadOnly={isReadOnly}
                onDropIndex={handleDropIndex}
                onCreateIndex={handleCreateIndex}
              />

              <ForeignKeysCard foreignKeys={structure.foreignKeys} />
            </div>
          </div>
        )
      )}
    </div>
  );
}
