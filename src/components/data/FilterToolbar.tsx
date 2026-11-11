import React from "react";
import {
  Filter,
  Plus,
  RefreshCw,
  Table2,
  ListTree,
  Braces,
  ChevronLeft,
  ChevronRight,
  SlidersHorizontal,
  Download,
  Upload,
  X,
  Play,
} from "lucide-react";
import type {
  ColumnMeta,
  DataViewMode,
  DatabaseEngine,
  FilterOperator,
  FilterRule,
} from "../../types/docpine";

interface FilterToolbarProps {
  engine: DatabaseEngine;
  columns: ColumnMeta[];
  filters: FilterRule[];
  rawFilter: string;
  viewMode: DataViewMode;
  page: number;
  pageSize: number;
  totalCount?: number | null;
  executionMs?: number;
  loading: boolean;
  readOnly: boolean;
  onFiltersChange: (filters: FilterRule[]) => void;
  onRawFilterChange: (raw: string) => void;
  onApplyFilter: () => void;
  onViewModeChange: (mode: DataViewMode) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onAddRecord: () => void;
  onOpenStructure: () => void;
  onOpenExport: () => void;
  onOpenImport: () => void;
}

const OPERATORS: Array<{ value: FilterOperator; label: string }> = [
  { value: "eq", label: "=" },
  { value: "neq", label: "!=" },
  { value: "gt", label: ">" },
  { value: "gte", label: ">=" },
  { value: "lt", label: "<" },
  { value: "lte", label: "<=" },
  { value: "contains", label: "CONTAINS" },
  { value: "starts_with", label: "STARTS WITH" },
  { value: "in", label: "IN (a,b)" },
  { value: "is_null", label: "IS NULL" },
  { value: "is_not_null", label: "IS NOT NULL" },
];

export function FilterToolbar({
  engine,
  columns,
  filters,
  rawFilter,
  viewMode,
  page,
  pageSize,
  totalCount,
  executionMs,
  loading,
  readOnly,
  onFiltersChange,
  onRawFilterChange,
  onApplyFilter,
  onViewModeChange,
  onPageChange,
  onPageSizeChange,
  onAddRecord,
  onOpenStructure,
  onOpenExport,
  onOpenImport,
}: FilterToolbarProps) {
  const addFilterRule = () => {
    const defaultField = columns[0]?.name || (engine === "mongodb" ? "_id" : "id");
    onFiltersChange([
      ...filters,
      {
        id: crypto.randomUUID(),
        field: defaultField,
        operator: "eq",
        value: "",
        enabled: true,
      },
    ]);
  };

  const updateRule = (id: string, patch: Partial<FilterRule>) => {
    onFiltersChange(
      filters.map((r) => (r.id === id ? { ...r, ...patch } : r))
    );
  };

  const removeRule = (id: string) => {
    onFiltersChange(filters.filter((r) => r.id !== id));
  };

  const totalPages =
    totalCount !== undefined && totalCount !== null
      ? Math.max(1, Math.ceil(totalCount / pageSize))
      : undefined;

  return (
    <div className="bg-zinc-950 border-b border-zinc-800/80 px-3 py-2 space-y-2 select-none shrink-0">
      {/* Top Action & Raw Filter Row */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Left: Add Row/Doc + Raw Filter Input + Add Visual Filter */}
        <div className="flex items-center gap-2 flex-1 min-w-[320px]">
          {!readOnly && (
            <button
              onClick={onAddRecord}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-xs transition-colors shrink-0"
            >
              <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
              <span>{engine === "mongodb" ? "Add Document" : "Add Row"}</span>
            </button>
          )}

          <button
            onClick={addFilterRule}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs text-zinc-300 shrink-0"
          >
            <Filter className="w-3.5 h-3.5 text-emerald-400" />
            <span>+ Filter</span>
          </button>

          {/* Raw WHERE / Mongo JSON Filter Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onApplyFilter();
            }}
            className="flex-1 flex items-center gap-1.5 bg-zinc-900/90 border border-zinc-800 rounded-lg px-2.5 py-1"
          >
            <span className="text-[10px] font-mono font-semibold uppercase text-emerald-400 shrink-0">
              {engine === "mongodb" ? "Filter JSON" : "WHERE"}
            </span>
            <input
              type="text"
              value={rawFilter}
              onChange={(e) => onRawFilterChange(e.target.value)}
              placeholder={
                engine === "mongodb"
                  ? '{"status": "active"}'
                  : "status = 'active' AND id > 10"
              }
              className="flex-1 bg-transparent text-xs font-mono text-zinc-100 placeholder:text-zinc-500 focus:outline-none"
            />
            <button
              type="submit"
              title="Run Filter"
              className="p-0.5 rounded hover:bg-zinc-800 text-emerald-400"
            >
              <Play className="w-3 h-3 fill-current" />
            </button>
          </form>
        </div>

        {/* Right: View Switcher (Table / Tree / JSON), Pagination & Tools */}
        <div className="flex items-center gap-2">
          {/* Triple-View Switcher */}
          <div className="inline-flex items-center p-0.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs">
            <button
              onClick={() => onViewModeChange("table")}
              title="Spreadsheet Table Grid View"
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-md font-medium transition-colors ${
                viewMode === "table"
                  ? "bg-zinc-800 text-zinc-100"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Table2 className="w-3.5 h-3.5" />
              <span>Grid</span>
            </button>
            <button
              onClick={() => onViewModeChange("tree")}
              title="Interactive Collapsible Tree View"
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-md font-medium transition-colors ${
                viewMode === "tree"
                  ? "bg-zinc-800 text-zinc-100"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <ListTree className="w-3.5 h-3.5" />
              <span>Tree</span>
            </button>
            <button
              onClick={() => onViewModeChange("json")}
              title="Monaco Raw JSON Editor View"
              className={`inline-flex items-center gap-1 px-2 py-1 rounded-md font-medium transition-colors ${
                viewMode === "json"
                  ? "bg-zinc-800 text-zinc-100"
                  : "text-zinc-400 hover:text-zinc-200"
              }`}
            >
              <Braces className="w-3.5 h-3.5" />
              <span>JSON</span>
            </button>
          </div>

          {/* Pagination */}
          <div className="flex items-center gap-1 text-xs bg-zinc-900 border border-zinc-800 rounded-lg px-2 py-1">
            <button
              disabled={page <= 1}
              onClick={() => onPageChange(Math.max(1, page - 1))}
              className="p-0.5 text-zinc-400 hover:text-zinc-100 disabled:opacity-30"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="font-mono text-[11px] text-zinc-300 px-1">
              {page}
              {totalPages ? `/${totalPages}` : ""}
            </span>
            <button
              disabled={totalPages !== undefined && page >= totalPages}
              onClick={() => onPageChange(page + 1)}
              className="p-0.5 text-zinc-400 hover:text-zinc-100 disabled:opacity-30"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="bg-transparent text-[11px] font-mono text-zinc-400 focus:outline-none ml-1"
            >
              <option value={50}>50/p</option>
              <option value={100}>100/p</option>
              <option value={250}>250/p</option>
              <option value={500}>500/p</option>
            </select>
          </div>

          {executionMs !== undefined && (
            <span className="hidden lg:inline text-[11px] font-mono text-zinc-500">
              {totalCount !== undefined && totalCount !== null
                ? `${totalCount.toLocaleString()} rows • `
                : ""}
              {executionMs}ms
            </span>
          )}

          {/* Structure, Import, Export, Refresh */}
          <button
            onClick={onOpenStructure}
            title="Inspect Table / Collection Structure"
            className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-sky-300"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
          </button>
          {!readOnly && (
            <button
              onClick={onOpenImport}
              title="Import CSV / JSON"
              className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-emerald-300"
            >
              <Upload className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={onOpenExport}
            title="Export CSV / JSON / SQL"
            className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-amber-300"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onApplyFilter}
            title="Refresh Data"
            className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-100"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${loading ? "animate-spin text-emerald-400" : ""}`}
            />
          </button>
        </div>
      </div>

      {/* Visual Filter Rule Pills Row */}
      {filters.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {filters.map((rule) => (
            <div
              key={rule.id}
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-zinc-900 border border-zinc-800 text-xs"
            >
              <input
                type="checkbox"
                checked={rule.enabled}
                onChange={(e) =>
                  updateRule(rule.id, { enabled: e.target.checked })
                }
                className="rounded border-zinc-700 bg-zinc-950 text-emerald-500"
              />
              {columns.length > 0 ? (
                <select
                  value={rule.field}
                  onChange={(e) =>
                    updateRule(rule.id, { field: e.target.value })
                  }
                  className="bg-zinc-950 px-1.5 py-0.5 rounded border border-zinc-800 font-mono text-xs text-zinc-200"
                >
                  {columns.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={rule.field}
                  onChange={(e) =>
                    updateRule(rule.id, { field: e.target.value })
                  }
                  placeholder="field"
                  className="w-24 bg-zinc-950 px-1.5 py-0.5 rounded border border-zinc-800 font-mono text-xs text-zinc-200"
                />
              )}

              <select
                value={rule.operator}
                onChange={(e) =>
                  updateRule(rule.id, {
                    operator: e.target.value as FilterOperator,
                  })
                }
                className="bg-zinc-950 px-1.5 py-0.5 rounded border border-zinc-800 font-mono text-[11px] text-emerald-400"
              >
                {OPERATORS.map((op) => (
                  <option key={op.value} value={op.value}>
                    {op.label}
                  </option>
                ))}
              </select>

              {rule.operator !== "is_null" &&
                rule.operator !== "is_not_null" && (
                  <input
                    type="text"
                    value={rule.value}
                    onChange={(e) =>
                      updateRule(rule.id, { value: e.target.value })
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") onApplyFilter();
                    }}
                    placeholder="value..."
                    className="w-28 bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800 font-mono text-xs text-zinc-100 focus:outline-none"
                  />
                )}

              <button
                onClick={() => removeRule(rule.id)}
                className="p-0.5 text-zinc-500 hover:text-rose-400"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}

          <button
            onClick={onApplyFilter}
            className="px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-xs font-medium"
          >
            Apply Filters
          </button>
        </div>
      )}
    </div>
  );
}
