import React, { useCallback, useEffect, useState } from "react";
import { FilterToolbar } from "./FilterToolbar";
import { DataTableGrid, buildRowIdentity } from "./DataTableGrid";
import { DocumentTreeView } from "./DocumentTreeView";
import { DocumentJsonView } from "./DocumentJsonView";
import { RowInspectorDrawer } from "./RowInspectorDrawer";
import { StagedChangesBar } from "./StagedChangesBar";
import { useWorkspaceStore } from "../../store/useWorkspaceStore";
import { ipc, parseAppError } from "../../lib/ipc";
import type {
  DataPageResult,
  DataViewMode,
  FilterRule,
  SortRule,
  TabStagedState,
  WorkspaceConfig,
  WorkspaceTab,
} from "../../types/docpine";

interface DataExplorerTabProps {
  workspace: WorkspaceConfig;
  tab: WorkspaceTab;
  /** Only the visible tab should respond to global shortcuts like ⌘S. */
  isActive?: boolean;
}

const EMPTY_STAGED: TabStagedState = {
  inserts: {},
  updates: {},
  deletes: {},
};

export function DataExplorerTab({
  workspace,
  tab,
  isActive = true,
}: DataExplorerTabProps) {
  const {
    stagedByTab,
    refreshTokenByTab,
    setTabViewMode,
    stageInsertRow,
    updateStagedInsertRow,
    removeStagedInsertRow,
    stageRecordCellUpdate,
    stageFullRecordUpdate,
    toggleStageDeleteRecord,
    discardTabStagedChanges,
    openTab,
    setImportExportTarget,
    loadSavedQueriesAndHistory,
    updateContainerRowCount,
    pushToast,
  } = useWorkspaceStore();

  const [filters, setFilters] = useState<FilterRule[]>([]);
  const [rawFilter, setRawFilter] = useState("");
  const [sorts, setSorts] = useState<SortRule[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);

  const [dataPage, setDataPage] = useState<DataPageResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);

  const [selectedRowKey, setSelectedRowKey] = useState<string | null>(null);

  const staged = stagedByTab[tab.id] || EMPTY_STAGED;
  const refreshToken = refreshTokenByTab[tab.id] || 0;
  const viewMode: DataViewMode = tab.dataViewMode || "table";
  const isReadOnly = workspace.safetyMode === "read_only";
  const isImmediateMode = workspace.commitMode === "immediate";

  const fetchPage = useCallback(async () => {
    if (!tab.container) return;
    setLoading(true);
    try {
      const res = await ipc.fetchDataPage(workspace.id, {
        database: tab.database,
        schema: tab.schema ?? null,
        container: tab.container,
        filters: filters.map(({ id: _id, ...rest }) => rest),
        rawFilter: rawFilter.trim() ? rawFilter.trim() : null,
        sorts,
        page,
        pageSize,
      });
      setDataPage(res);
      if (
        res.totalCount !== undefined &&
        res.totalCount !== null &&
        filters.length === 0 &&
        !rawFilter.trim()
      ) {
        updateContainerRowCount(
          workspace.id,
          tab.database,
          tab.container,
          tab.schema,
          res.totalCount
        );
      }
    } catch (err) {
      const parsed = parseAppError(err);
      pushToast({
        kind: "error",
        title: `Failed to fetch ${tab.container}`,
        message: parsed.message,
      });
    } finally {
      setLoading(false);
    }
  }, [
    workspace.id,
    tab.database,
    tab.schema,
    tab.container,
    filters,
    rawFilter,
    sorts,
    page,
    pageSize,
    pushToast,
  ]);

  useEffect(() => {
    void fetchPage();
  }, [fetchPage, refreshToken]);

  const handleToggleSort = (field: string) => {
    setSorts((prev) => {
      const existing = prev.find((s) => s.field === field);
      if (!existing) return [{ field, descending: false }];
      if (!existing.descending) return [{ field, descending: true }];
      return [];
    });
  };

  const handleAddRecord = () => {
    if (isReadOnly) return;
    const initial: Record<string, any> = {};
    if (workspace.engine === "mongodb") {
      initial.created_at = new Date().toISOString();
    }
    stageInsertRow(tab.id, initial);
    if (viewMode !== "table") {
      setTabViewMode(workspace.id, tab.id, "table");
    }
  };

  const handleCellCommit = async (
    rowKey: string,
    identity: Record<string, any>,
    field: string,
    newValue: any,
    originalValue: any
  ) => {
    if (isReadOnly || !tab.container) return;
    if (JSON.stringify(newValue) === JSON.stringify(originalValue)) return;

    if (isImmediateMode) {
      try {
        await ipc.applyMutations(
          workspace.id,
          {
            database: tab.database,
            schema: tab.schema ?? null,
            container: tab.container,
            inserts: [],
            updates: [
              {
                identity,
                changes: { [field]: newValue },
                original: { [field]: originalValue },
              },
            ],
            deletes: [],
            atomic: true,
          },
          true
        );
        pushToast({
          kind: "success",
          title: "Immediate edit committed",
          message: `Updated ${field} on ${tab.container}`,
        });
        await fetchPage();
        void loadSavedQueriesAndHistory(workspace.id);
      } catch (err) {
        const parsed = parseAppError(err);
        pushToast({
          kind: "error",
          title: "Immediate update failed",
          message: parsed.message,
        });
      }
    } else {
      stageRecordCellUpdate(
        tab.id,
        rowKey,
        identity,
        field,
        newValue,
        originalValue
      );
    }
  };

  const handleFullDocumentReplace = async (
    rowKey: string,
    identity: Record<string, any>,
    changes: Record<string, any>,
    original: Record<string, any>
  ) => {
    if (isReadOnly || !tab.container) return;
    if (Object.keys(changes).length === 0) return;

    if (isImmediateMode) {
      try {
        await ipc.applyMutations(
          workspace.id,
          {
            database: tab.database,
            schema: tab.schema ?? null,
            container: tab.container,
            inserts: [],
            updates: [{ identity, changes, original }],
            deletes: [],
            atomic: true,
          },
          true
        );
        pushToast({
          kind: "success",
          title: "Document updated immediately",
        });
        await fetchPage();
      } catch (err) {
        const parsed = parseAppError(err);
        pushToast({
          kind: "error",
          title: "Update failed",
          message: parsed.message,
        });
      }
    } else {
      stageFullRecordUpdate(tab.id, rowKey, identity, changes, original);
      pushToast({
        kind: "info",
        title: "Document changes staged",
        message: "Press ⌘S or click Apply Changes to commit.",
      });
    }
  };

  const handleToggleDeleteRow = async (
    rowKey: string,
    identity: Record<string, any>
  ) => {
    if (isReadOnly || !tab.container) return;

    if (isImmediateMode) {
      try {
        await ipc.applyMutations(
          workspace.id,
          {
            database: tab.database,
            schema: tab.schema ?? null,
            container: tab.container,
            inserts: [],
            updates: [],
            deletes: [identity],
            atomic: true,
          },
          true
        );
        pushToast({
          kind: "info",
          title: "Record deleted immediately",
        });
        await fetchPage();
      } catch (err) {
        const parsed = parseAppError(err);
        pushToast({
          kind: "error",
          title: "Delete failed",
          message: parsed.message,
        });
      }
    } else {
      toggleStageDeleteRecord(tab.id, rowKey, identity);
    }
  };

  const handleApplyStagedChanges = async () => {
    if (!tab.container) return;
    setApplying(true);
    try {
      const res = await ipc.applyMutations(
        workspace.id,
        {
          database: tab.database,
          schema: tab.schema ?? null,
          container: tab.container,
          inserts: Object.values(staged.inserts),
          updates: Object.values(staged.updates),
          deletes: Object.values(staged.deletes),
          atomic: true,
        },
        true
      );

      discardTabStagedChanges(tab.id);
      pushToast({
        kind: "success",
        title: "Changes committed",
        message: `+${res.insertedCount} inserted, ~${res.updatedCount} updated, -${res.deletedCount} deleted (${res.executionMs}ms)`,
      });
      await fetchPage();
      void loadSavedQueriesAndHistory(workspace.id);
    } catch (err) {
      const parsed = parseAppError(err);
      pushToast({
        kind: "error",
        title: "Failed to commit staged changes",
        message: parsed.message,
      });
    } finally {
      setApplying(false);
    }
  };

  // Resolve selected row data for the right-side Inspector Drawer
  const rows = dataPage?.rows || [];
  const columns = dataPage?.columns || [];
  const primaryKeys = dataPage?.primaryKeys || [];

  let inspectedOriginal: Record<string, any> | null = null;
  let inspectedMerged: Record<string, any> | null = null;
  let inspectedIdentity: Record<string, any> = {};

  if (selectedRowKey) {
    rows.forEach((r, idx) => {
      const { rowKey, identity } = buildRowIdentity(r, primaryKeys, idx);
      if (rowKey === selectedRowKey) {
        inspectedOriginal = r;
        const rowChanges = staged.updates[rowKey]?.changes || {};
        inspectedMerged = { ...r, ...rowChanges };
        inspectedIdentity = identity;
      }
    });
  }

  return (
    <div className="flex-1 h-full flex flex-col overflow-hidden bg-zinc-950">
      {/* Top Filter, View Mode & Pagination Toolbar */}
      <FilterToolbar
        engine={workspace.engine}
        columns={columns}
        filters={filters}
        rawFilter={rawFilter}
        viewMode={viewMode}
        page={page}
        pageSize={pageSize}
        totalCount={dataPage?.totalCount}
        executionMs={dataPage?.executionMs}
        loading={loading}
        readOnly={isReadOnly}
        onFiltersChange={setFilters}
        onRawFilterChange={setRawFilter}
        onApplyFilter={() => void fetchPage()}
        onViewModeChange={(mode) => setTabViewMode(workspace.id, tab.id, mode)}
        onPageChange={setPage}
        onPageSizeChange={(sz) => {
          setPageSize(sz);
          setPage(1);
        }}
        onAddRecord={handleAddRecord}
        onOpenStructure={() =>
          openTab(workspace.id, {
            kind: "structure",
            title: `${tab.container} (Structure)`,
            database: tab.database,
            schema: tab.schema,
            container: tab.container,
          })
        }
        onOpenExport={() =>
          setImportExportTarget({
            mode: "export",
            workspaceId: workspace.id,
            database: tab.database,
            schema: tab.schema,
            container: tab.container || "",
            rows,
          })
        }
        onOpenImport={() =>
          setImportExportTarget({
            mode: "import",
            workspaceId: workspace.id,
            database: tab.database,
            schema: tab.schema,
            container: tab.container || "",
          })
        }
      />

      {/* Main Content + Right Inspector Drawer */}
      <div className="flex-1 flex overflow-hidden relative">
        {viewMode === "table" && (
          <DataTableGrid
            columns={columns}
            rows={rows}
            primaryKeys={primaryKeys}
            sorts={sorts}
            staged={staged}
            selectedRowKey={selectedRowKey}
            readOnly={isReadOnly}
            onSelectRow={(rowKey) =>
              setSelectedRowKey((curr) => (curr === rowKey ? null : rowKey))
            }
            onToggleSort={handleToggleSort}
            onCellCommit={(rk, id, f, nv, ov) =>
              void handleCellCommit(rk, id, f, nv, ov)
            }
            onDraftCellChange={(draftId, field, value) => {
              const currDraft = staged.inserts[draftId] || {};
              updateStagedInsertRow(tab.id, draftId, {
                ...currDraft,
                [field]: value,
              });
            }}
            onRemoveDraftRow={(draftId) => removeStagedInsertRow(tab.id, draftId)}
            onToggleDeleteRow={(rk, id) => void handleToggleDeleteRow(rk, id)}
          />
        )}

        {viewMode === "tree" && (
          <DocumentTreeView
            rows={rows}
            primaryKeys={primaryKeys}
            staged={staged}
            selectedRowKey={selectedRowKey}
            readOnly={isReadOnly}
            onSelectRow={(rowKey) => setSelectedRowKey(rowKey)}
            onCellCommit={(rk, id, f, nv, ov) =>
              void handleCellCommit(rk, id, f, nv, ov)
            }
            onToggleDeleteRow={(rk, id) => void handleToggleDeleteRow(rk, id)}
          />
        )}

        {viewMode === "json" && (
          <DocumentJsonView
            rows={rows}
            primaryKeys={primaryKeys}
            readOnly={isReadOnly}
            onStageFullDocumentReplace={(rk, id, ch, orig) =>
              void handleFullDocumentReplace(rk, id, ch, orig)
            }
          />
        )}

        {/* Right-Side Row / Document Inspector Drawer */}
        <RowInspectorDrawer
          rowKey={selectedRowKey}
          rowData={inspectedMerged}
          originalRowData={inspectedOriginal}
          identity={inspectedIdentity}
          columns={columns}
          readOnly={isReadOnly}
          onClose={() => setSelectedRowKey(null)}
          onFieldChange={(rk, id, f, nv, ov) =>
            void handleCellCommit(rk, id, f, nv, ov)
          }
        />
      </div>

      {/* Staged Changes Action & Diff Preview Bar */}
      <StagedChangesBar
        workspaceId={workspace.id}
        database={tab.database}
        schema={tab.schema}
        container={tab.container || ""}
        staged={staged}
        applying={applying}
        shortcutsEnabled={isActive}
        onApply={handleApplyStagedChanges}
        onDiscard={() => discardTabStagedChanges(tab.id)}
      />

      {/* Footer Status & Generated Query Preview */}
      <div className="h-7 px-3 bg-zinc-950 border-t border-zinc-800/80 flex items-center justify-between text-[11px] font-mono text-zinc-500 select-none shrink-0">
        <span className="truncate max-w-3xl">
          {dataPage?.generatedQuery || `${tab.database}.${tab.container}`}
        </span>
        <span className="shrink-0">
          {isReadOnly
            ? "READ-ONLY LOCKED"
            : isImmediateMode
              ? "IMMEDIATE AUTO-COMMIT"
              : "STAGED DIFF MODE (Double-click cell to edit)"}
        </span>
      </div>
    </div>
  );
}
