import React, { useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  KeyRound,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Trash2,
  RotateCcw,
  Eye,
  Link2,
} from "lucide-react";
import type {
  ColumnMeta,
  SortRule,
  TabStagedState,
} from "../../types/docpine";

interface DataTableGridProps {
  columns: ColumnMeta[];
  rows: Record<string, any>[];
  primaryKeys: string[];
  sorts: SortRule[];
  staged: TabStagedState;
  selectedRowKey: string | null;
  readOnly: boolean;
  onSelectRow: (rowKey: string, rowData: Record<string, any>) => void;
  onToggleSort: (field: string) => void;
  onCellCommit: (
    rowKey: string,
    identity: Record<string, any>,
    field: string,
    newValue: any,
    originalValue: any
  ) => void;
  onDraftCellChange: (draftId: string, field: string, value: any) => void;
  onRemoveDraftRow: (draftId: string) => void;
  onToggleDeleteRow: (rowKey: string, identity: Record<string, any>) => void;
}

export function buildRowIdentity(
  row: Record<string, any>,
  primaryKeys: string[],
  fallbackIndex: number
): { rowKey: string; identity: Record<string, any> } {
  const keys =
    primaryKeys.length > 0
      ? primaryKeys
      : "_id" in row
        ? ["_id"]
        : "id" in row
          ? ["id"]
          : Object.keys(row).slice(0, 2);

  const identity: Record<string, any> = {};
  for (const k of keys) {
    if (row[k] !== undefined) {
      identity[k] = row[k];
    }
  }
  const rowKey =
    Object.keys(identity).length > 0
      ? JSON.stringify(identity)
      : `row_${fallbackIndex}`;
  return { rowKey, identity };
}

export function parseEditedCellValue(raw: string, dataType: string): any {
  const trimmed = raw.trim();
  if (trimmed === "NULL") return null;
  const upperType = dataType.toUpperCase();
  if (
    upperType.includes("BOOL") &&
    (trimmed === "true" || trimmed === "false")
  ) {
    return trimmed === "true";
  }
  if (
    (upperType.includes("INT") ||
      upperType.includes("NUMERIC") ||
      upperType.includes("DECIMAL") ||
      upperType.includes("FLOAT") ||
      upperType.includes("DOUBLE")) &&
    trimmed !== "" &&
    !Number.isNaN(Number(trimmed))
  ) {
    return Number(trimmed);
  }
  if (
    (upperType.includes("JSON") ||
      upperType === "OBJECT" ||
      upperType === "ARRAY" ||
      trimmed.startsWith("{") ||
      trimmed.startsWith("[")) &&
    trimmed !== ""
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return raw;
    }
  }
  return raw;
}

export function formatCellDisplay(value: any): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export function DataTableGrid({
  columns,
  rows,
  primaryKeys,
  sorts,
  staged,
  selectedRowKey,
  readOnly,
  onSelectRow,
  onToggleSort,
  onCellCommit,
  onDraftCellChange,
  onRemoveDraftRow,
  onToggleDeleteRow,
}: DataTableGridProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [editingCell, setEditingCell] = useState<{
    rowKey: string;
    field: string;
    draftValue: string;
    isInsertDraft: boolean;
  } | null>(null);

  const draftEntries = Object.entries(staged.inserts);

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 34,
    overscan: 18,
  });

  const getSortDir = (field: string) => {
    const found = sorts.find((s) => s.field === field);
    if (!found) return null;
    return found.descending ? "desc" : "asc";
  };

  return (
    <div
      ref={parentRef}
      className="flex-1 h-full overflow-auto bg-zinc-950 select-text relative"
    >
      <table className="w-full border-collapse text-xs font-mono">
        {/* Sticky Column Headers */}
        <thead className="sticky top-0 z-10 bg-zinc-900 border-b border-zinc-800 text-zinc-300 select-none">
          <tr>
            <th className="w-16 px-2 py-2 text-left text-[10px] uppercase tracking-wider text-zinc-500 border-r border-zinc-800/80 bg-zinc-900">
              Actions
            </th>
            {columns.map((col) => {
              const sortDir = getSortDir(col.name);
              return (
                <th
                  key={col.name}
                  onClick={() => onToggleSort(col.name)}
                  className="min-w-[150px] max-w-[320px] px-3 py-2 text-left border-r border-zinc-800/80 hover:bg-zinc-800/80 cursor-pointer transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 truncate">
                      {col.isPrimaryKey && (
                        <KeyRound className="w-3 h-3 text-amber-400 shrink-0" />
                      )}
                      {col.foreignKeyTarget && (
                        <span title={`FK -> ${col.foreignKeyTarget}`}>
                          <Link2 className="w-3 h-3 text-indigo-400 shrink-0" />
                        </span>
                      )}
                      <span className="font-semibold text-zinc-100 truncate">
                        {col.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-[10px] text-zinc-500 font-normal">
                        {col.dataType}
                      </span>
                      {sortDir === "asc" ? (
                        <ArrowUp className="w-3 h-3 text-emerald-400" />
                      ) : sortDir === "desc" ? (
                        <ArrowDown className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <ArrowUpDown className="w-3 h-3 text-zinc-600 opacity-50" />
                      )}
                    </div>
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>

        <tbody>
          {/* Staged Draft Insert Rows at Top */}
          {draftEntries.map(([draftId, draftRow]) => (
            <tr
              key={draftId}
              className="bg-emerald-500/10 border-b border-emerald-500/30 hover:bg-emerald-500/15"
            >
              <td className="px-2 py-1.5 border-r border-emerald-500/20 text-center">
                <div className="flex items-center justify-center gap-1">
                  <span className="px-1 rounded text-[9px] font-sans font-bold bg-emerald-500/30 text-emerald-200">
                    NEW
                  </span>
                  <button
                    onClick={() => onRemoveDraftRow(draftId)}
                    title="Discard Draft Row"
                    className="p-0.5 rounded hover:bg-rose-500/20 text-zinc-400 hover:text-rose-300"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </td>

              {columns.map((col) => {
                const val = draftRow[col.name];
                return (
                  <td
                    key={col.name}
                    className="px-2 py-1 border-r border-emerald-500/20"
                  >
                    <input
                      type="text"
                      value={
                        val === undefined
                          ? ""
                          : val === null
                            ? "NULL"
                            : typeof val === "object"
                              ? JSON.stringify(val)
                              : String(val)
                      }
                      onChange={(e) =>
                        onDraftCellChange(
                          draftId,
                          col.name,
                          parseEditedCellValue(e.target.value, col.dataType)
                        )
                      }
                      placeholder={
                        col.defaultValue
                          ? `default: ${col.defaultValue}`
                          : col.isNullable
                            ? "NULL"
                            : `Enter ${col.name}...`
                      }
                      className="w-full px-1.5 py-0.5 rounded bg-zinc-950/90 border border-emerald-500/40 text-xs text-emerald-100 placeholder:text-zinc-500 focus:outline-none focus:border-emerald-400"
                    />
                  </td>
                );
              })}
            </tr>
          ))}

          {/* Top Padding for Virtualizer */}
          {rowVirtualizer.getVirtualItems().length > 0 &&
            rowVirtualizer.getVirtualItems()[0].start > 0 && (
              <tr>
                <td
                  colSpan={columns.length + 1}
                  style={{
                    height: `${rowVirtualizer.getVirtualItems()[0].start}px`,
                  }}
                />
              </tr>
            )}

          {/* Virtualized Existing Database Rows */}
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const row = rows[virtualRow.index];
            const { rowKey, identity } = buildRowIdentity(
              row,
              primaryKeys,
              virtualRow.index
            );
            const rowUpdates = staged.updates[rowKey]?.changes || {};
            const isMarkedDeleted = Boolean(staged.deletes[rowKey]);
            const isSelected = selectedRowKey === rowKey;

            return (
              <tr
                key={rowKey}
                onClick={() => onSelectRow(rowKey, { ...row, ...rowUpdates })}
                className={`border-b border-zinc-900 transition-colors ${
                  isMarkedDeleted
                    ? "bg-rose-500/15 text-rose-300/70 line-through"
                    : isSelected
                      ? "bg-emerald-500/10"
                      : Object.keys(rowUpdates).length > 0
                        ? "bg-amber-500/5 hover:bg-amber-500/10"
                        : "hover:bg-zinc-900/70"
                }`}
              >
                {/* Row Action Cell */}
                <td
                  className="px-2 py-1 border-r border-zinc-900 text-center select-none"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-center gap-1">
                    <button
                      onClick={() =>
                        onSelectRow(rowKey, { ...row, ...rowUpdates })
                      }
                      title="Inspect Row / Document"
                      className="p-0.5 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-200"
                    >
                      <Eye className="w-3 h-3" />
                    </button>
                    {!readOnly && (
                      <button
                        onClick={() => onToggleDeleteRow(rowKey, identity)}
                        title={
                          isMarkedDeleted
                            ? "Restore Row"
                            : "Mark Row for Deletion"
                        }
                        className={`p-0.5 rounded ${
                          isMarkedDeleted
                            ? "text-amber-400 hover:bg-amber-500/20"
                            : "text-zinc-500 hover:text-rose-400 hover:bg-rose-500/15"
                        }`}
                      >
                        {isMarkedDeleted ? (
                          <RotateCcw className="w-3 h-3" />
                        ) : (
                          <Trash2 className="w-3 h-3" />
                        )}
                      </button>
                    )}
                  </div>
                </td>

                {/* Data Cells */}
                {columns.map((col) => {
                  const hasStagedEdit = col.name in rowUpdates;
                  const effectiveValue = hasStagedEdit
                    ? rowUpdates[col.name]
                    : row[col.name];
                  const isEditingThis =
                    editingCell?.rowKey === rowKey &&
                    editingCell?.field === col.name;

                  return (
                    <td
                      key={col.name}
                      onDoubleClick={() => {
                        if (readOnly || isMarkedDeleted) return;
                        setEditingCell({
                          rowKey,
                          field: col.name,
                          draftValue:
                            effectiveValue === null ||
                            effectiveValue === undefined
                              ? ""
                              : typeof effectiveValue === "object"
                                ? JSON.stringify(effectiveValue)
                                : String(effectiveValue),
                          isInsertDraft: false,
                        });
                      }}
                      className={`max-w-[320px] px-3 py-1.5 border-r border-zinc-900 truncate ${
                        hasStagedEdit
                          ? "bg-amber-500/15 text-amber-200 font-medium"
                          : effectiveValue === null ||
                              effectiveValue === undefined
                            ? "text-zinc-600 italic"
                            : typeof effectiveValue === "object"
                              ? "text-emerald-300"
                              : "text-zinc-200"
                      }`}
                    >
                      {isEditingThis ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            autoFocus
                            value={editingCell.draftValue}
                            onChange={(e) =>
                              setEditingCell({
                                ...editingCell,
                                draftValue: e.target.value,
                              })
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                const parsed = parseEditedCellValue(
                                  editingCell.draftValue,
                                  col.dataType
                                );
                                onCellCommit(
                                  rowKey,
                                  identity,
                                  col.name,
                                  parsed,
                                  row[col.name]
                                );
                                setEditingCell(null);
                              } else if (e.key === "Escape") {
                                setEditingCell(null);
                              }
                            }}
                            onBlur={() => {
                              const parsed = parseEditedCellValue(
                                editingCell.draftValue,
                                col.dataType
                              );
                              onCellCommit(
                                rowKey,
                                identity,
                                col.name,
                                parsed,
                                row[col.name]
                              );
                              setEditingCell(null);
                            }}
                            className="w-full px-1.5 py-0.5 rounded bg-zinc-950 border border-emerald-500 text-xs text-zinc-100 focus:outline-none"
                          />
                          {col.isNullable && (
                            <button
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                onCellCommit(
                                  rowKey,
                                  identity,
                                  col.name,
                                  null,
                                  row[col.name]
                                );
                                setEditingCell(null);
                              }}
                              className="px-1 py-0.5 rounded bg-zinc-800 text-[9px] text-zinc-300 hover:bg-zinc-700"
                            >
                              NULL
                            </button>
                          )}
                        </div>
                      ) : (
                        formatCellDisplay(effectiveValue)
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}

          {/* Bottom Padding for Virtualizer */}
          {rowVirtualizer.getVirtualItems().length > 0 && (
            <tr>
              <td
                colSpan={columns.length + 1}
                style={{
                  height: `${
                    rowVirtualizer.getTotalSize() -
                    (rowVirtualizer.getVirtualItems().at(-1)?.end ?? 0)
                  }px`,
                }}
              />
            </tr>
          )}
        </tbody>
      </table>

      {rows.length === 0 && draftEntries.length === 0 && (
        <div className="py-16 text-center text-xs text-zinc-500">
          No records returned for the current filter.
        </div>
      )}
    </div>
  );
}
