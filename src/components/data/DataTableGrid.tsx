import React, { useCallback, useEffect, useRef, useState } from "react";
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
  ExternalLink,
  Loader2,
  X,
  Copy,
  Check,
} from "lucide-react";
import { ipc } from "../../lib/ipc";
import type {
  ColumnMeta,
  SortRule,
  TabStagedState,
} from "../../types/docpine";

interface DataTableGridProps {
  workspaceId?: string;
  database?: string;
  schema?: string | null;
  container?: string;
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
  onFollowForeignKey?: (
    targetContainer: string,
    targetColumn: string,
    value: any,
    targetSchema?: string | null
  ) => void;
  onCopyNotification?: (cellCount: number) => void;
}

export function parseForeignKeyTarget(raw?: string | null): {
  schema?: string;
  container: string;
  column: string;
} | null {
  if (!raw) return null;
  const clean = raw.trim();
  const parenStart = clean.indexOf("(");
  const parenEnd = clean.indexOf(")");
  if (parenStart === -1 || parenEnd === -1 || parenEnd <= parenStart) return null;
  const col = clean.substring(parenStart + 1, parenEnd).trim();
  const left = clean.substring(0, parenStart).trim();
  if (left.includes(".")) {
    const parts = left.split(".");
    return { schema: parts[0].trim(), container: parts[1].trim(), column: col };
  }
  return { container: left, column: col };
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

interface CellCoord {
  rowIndex: number;
  colIndex: number;
}

interface SelectionBox {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

interface FkPeekState {
  isOpen: boolean;
  x: number;
  y: number;
  targetContainer: string;
  targetColumn: string;
  targetSchema?: string | null;
  value: any;
  loading: boolean;
  record?: Record<string, any> | null;
  error?: string | null;
}

export function DataTableGrid({
  workspaceId,
  database,
  schema,
  container,
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
  onFollowForeignKey,
  onCopyNotification,
}: DataTableGridProps) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [editingCell, setEditingCell] = useState<{
    rowKey: string;
    field: string;
    draftValue: string;
    isInsertDraft: boolean;
  } | null>(null);

  // Column Resizing with LocalStorage persistence
  const storageKey =
    workspaceId && database && container
      ? `docpine:col_widths:${workspaceId}:${database}:${schema || "default"}:${container}`
      : null;

  const [colWidths, setColWidths] = useState<Record<string, number>>({});
  const resizingRef = useRef<{ col: string; startX: number; startWidth: number } | null>(null);

  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) setColWidths(JSON.parse(raw));
    } catch {}
  }, [storageKey]);

  const handleStartResize = (e: React.MouseEvent, colName: string) => {
    e.preventDefault();
    e.stopPropagation();
    const currentWidth = colWidths[colName] || 180;
    resizingRef.current = { col: colName, startX: e.clientX, startWidth: currentWidth };

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!resizingRef.current) return;
      const diff = moveEvent.clientX - resizingRef.current.startX;
      const nextWidth = Math.max(80, Math.min(800, resizingRef.current.startWidth + diff));
      setColWidths((prev) => {
        const updated = { ...prev, [colName]: nextWidth };
        if (storageKey) {
          try {
            localStorage.setItem(storageKey, JSON.stringify(updated));
          } catch {}
        }
        return updated;
      });
    };

    const onMouseUp = () => {
      resizingRef.current = null;
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const handleResetWidth = (e: React.MouseEvent, colName: string) => {
    e.preventDefault();
    e.stopPropagation();
    setColWidths((prev) => {
      const next = { ...prev };
      delete next[colName];
      if (storageKey) {
        try {
          localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {}
      }
      return next;
    });
  };

  // Multi-cell Range Selection
  const [selection, setSelection] = useState<SelectionBox | null>(null);
  const isMouseDownRef = useRef(false);

  const isCellSelected = useCallback(
    (rowIndex: number, colIndex: number) => {
      if (!selection) return false;
      const minR = Math.min(selection.startRow, selection.endRow);
      const maxR = Math.max(selection.startRow, selection.endRow);
      const minC = Math.min(selection.startCol, selection.endCol);
      const maxC = Math.max(selection.startCol, selection.endCol);
      return rowIndex >= minR && rowIndex <= maxR && colIndex >= minC && colIndex <= maxC;
    },
    [selection]
  );

  const handleCellMouseDown = (
    e: React.MouseEvent,
    rowIndex: number,
    colIndex: number
  ) => {
    if (e.button !== 0) return; // Only left-click
    if (e.shiftKey && selection) {
      setSelection({
        ...selection,
        endRow: rowIndex,
        endCol: colIndex,
      });
    } else {
      isMouseDownRef.current = true;
      setSelection({
        startRow: rowIndex,
        startCol: colIndex,
        endRow: rowIndex,
        endCol: colIndex,
      });
    }
  };

  const handleCellMouseEnter = (rowIndex: number, colIndex: number) => {
    if (isMouseDownRef.current && selection) {
      setSelection((prev) => (prev ? { ...prev, endRow: rowIndex, endCol: colIndex } : null));
    }
  };

  useEffect(() => {
    const handleMouseUp = () => {
      isMouseDownRef.current = false;
    };
    window.addEventListener("mouseup", handleMouseUp);
    return () => window.removeEventListener("mouseup", handleMouseUp);
  }, []);

  // Copy selection as TSV
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "c" && selection && !editingCell) {
        const minR = Math.min(selection.startRow, selection.endRow);
        const maxR = Math.max(selection.startRow, selection.endRow);
        const minC = Math.min(selection.startCol, selection.endCol);
        const maxC = Math.max(selection.startCol, selection.endCol);

        const lines: string[] = [];
        let count = 0;
        for (let r = minR; r <= maxR; r++) {
          const row = rows[r];
          if (!row) continue;
          const cells: string[] = [];
          for (let c = minC; c <= maxC; c++) {
            const col = columns[c];
            if (!col) continue;
            const val = row[col.name];
            cells.push(val === null || val === undefined ? "" : typeof val === "object" ? JSON.stringify(val) : String(val));
            count++;
          }
          lines.push(cells.join("\t"));
        }
        if (lines.length > 0) {
          const tsv = lines.join("\n");
          void navigator.clipboard.writeText(tsv);
          onCopyNotification?.(count);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selection, rows, columns, editingCell, onCopyNotification]);

  // Foreign Key Peek Popover
  const [fkPeek, setFkPeek] = useState<FkPeekState | null>(null);

  const handleOpenFkPeek = async (
    e: React.MouseEvent,
    targetInfo: { schema?: string; container: string; column: string },
    val: any
  ) => {
    e.stopPropagation();
    e.preventDefault();

    if (e.metaKey || e.ctrlKey) {
      onFollowForeignKey?.(
        targetInfo.container,
        targetInfo.column,
        val,
        targetInfo.schema
      );
      return;
    }

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setFkPeek({
      isOpen: true,
      x: Math.min(window.innerWidth - 320, rect.left),
      y: Math.min(window.innerHeight - 240, rect.bottom + 6),
      targetContainer: targetInfo.container,
      targetColumn: targetInfo.column,
      targetSchema: targetInfo.schema,
      value: val,
      loading: true,
      record: null,
      error: null,
    });

    if (!workspaceId || !database) {
      setFkPeek((curr) => (curr ? { ...curr, loading: false, error: "No active workspace" } : null));
      return;
    }

    try {
      const res = await ipc.fetchDataPage(workspaceId, {
        database,
        schema: targetInfo.schema ?? null,
        container: targetInfo.container,
        filters: [
          {
            field: targetInfo.column,
            operator: "eq",
            value: String(val),
            enabled: true,
          },
        ],
        rawFilter: null,
        sorts: [],
        page: 1,
        pageSize: 1,
      });

      setFkPeek((curr) => {
        if (!curr) return null;
        return {
          ...curr,
          loading: false,
          record: res.rows && res.rows.length > 0 ? res.rows[0] : null,
        };
      });
    } catch (err: any) {
      setFkPeek((curr) => {
        if (!curr) return null;
        return {
          ...curr,
          loading: false,
          error: err?.message || "Failed to inspect foreign record",
        };
      });
    }
  };

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
      onClick={() => {
        if (fkPeek) setFkPeek(null);
      }}
    >
      <table className="border-collapse text-xs font-mono table-fixed">
        {/* Sticky Column Headers */}
        <thead className="sticky top-0 z-10 bg-zinc-900 border-b border-zinc-800 text-zinc-300 select-none">
          <tr>
            <th className="w-16 px-2 py-2 text-left text-[10px] uppercase tracking-wider text-zinc-500 border-r border-zinc-800/80 bg-zinc-900">
              Actions
            </th>
            {columns.map((col) => {
              const sortDir = getSortDir(col.name);
              const width = colWidths[col.name] || 180;
              return (
                <th
                  key={col.name}
                  style={{ width: `${width}px`, minWidth: "80px" }}
                  className="relative px-3 py-2 text-left border-r border-zinc-800/80 hover:bg-zinc-800/80 cursor-pointer transition-colors group"
                  onClick={() => onToggleSort(col.name)}
                >
                  <div className="flex items-center justify-between gap-2 overflow-hidden">
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

                  {/* Resizable handle */}
                  <div
                    onMouseDown={(e) => handleStartResize(e, col.name)}
                    onDoubleClick={(e) => handleResetWidth(e, col.name)}
                    title="Drag to resize, double-click to reset"
                    className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-emerald-500/50 group-hover:bg-zinc-700/60 z-20"
                  />
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
              <td className="w-16 px-2 py-1.5 border-r border-emerald-500/20 text-center">
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
                const width = colWidths[col.name] || 180;
                return (
                  <td
                    key={col.name}
                    style={{ width: `${width}px` }}
                    className="px-2 py-1 border-r border-emerald-500/20 truncate"
                  >
                    <input
                      type="text"
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="off"
                      spellCheck={false}
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
            const rowIndex = virtualRow.index;
            const row = rows[rowIndex];
            const { rowKey, identity } = buildRowIdentity(
              row,
              primaryKeys,
              rowIndex
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
                  className="w-16 px-2 py-1 border-r border-zinc-900 text-center select-none"
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
                {columns.map((col, colIndex) => {
                  const hasStagedEdit = col.name in rowUpdates;
                  const effectiveValue = hasStagedEdit
                    ? rowUpdates[col.name]
                    : row[col.name];
                  const isEditingThis =
                    editingCell?.rowKey === rowKey &&
                    editingCell?.field === col.name;
                  const width = colWidths[col.name] || 180;
                  const isSelectedCell = isCellSelected(rowIndex, colIndex);
                  const parsedFk = parseForeignKeyTarget(col.foreignKeyTarget);

                  return (
                    <td
                      key={col.name}
                      style={{ width: `${width}px` }}
                      onMouseDown={(e) => handleCellMouseDown(e, rowIndex, colIndex)}
                      onMouseEnter={() => handleCellMouseEnter(rowIndex, colIndex)}
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
                      className={`relative px-3 py-1.5 border-r border-zinc-900 truncate select-none ${
                        isSelectedCell
                          ? "bg-emerald-500/20 ring-1 ring-inset ring-emerald-400/50"
                          : hasStagedEdit
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
                        <div
                          className="flex items-center gap-1"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <input
                            type="text"
                            autoFocus
                            autoComplete="off"
                            autoCorrect="off"
                            autoCapitalize="off"
                            spellCheck={false}
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
                              if (parsed !== row[col.name]) {
                                onCellCommit(
                                  rowKey,
                                  identity,
                                  col.name,
                                  parsed,
                                  row[col.name]
                                );
                              }
                              setEditingCell(null);
                            }}
                            className="w-full px-1 py-0.5 rounded bg-zinc-900 border border-emerald-500 text-xs text-zinc-100 focus:outline-none"
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
                              className="px-1 py-0.5 rounded bg-zinc-800 text-[9px] text-zinc-300 hover:bg-zinc-700 shrink-0"
                            >
                              NULL
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center justify-between gap-1 group/cell">
                          <span className="truncate">{formatCellDisplay(effectiveValue)}</span>
                          {parsedFk && effectiveValue !== null && effectiveValue !== undefined && (
                            <button
                              onClick={(e) => handleOpenFkPeek(e, parsedFk, effectiveValue)}
                              title={`Inspect FK -> ${col.foreignKeyTarget} (⌘+Click to open in new tab)`}
                              className="opacity-0 group-hover/cell:opacity-100 p-0.5 rounded hover:bg-zinc-800 text-indigo-400 hover:text-indigo-300 shrink-0 transition-opacity"
                            >
                              <Link2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
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

      {/* Foreign Key Peek Popover */}
      {fkPeek && fkPeek.isOpen && (
        <div
          style={{ top: `${fkPeek.y}px`, left: `${fkPeek.x}px` }}
          onClick={(e) => e.stopPropagation()}
          className="fixed z-50 w-80 bg-zinc-900 border border-zinc-700 shadow-2xl rounded-xl p-3 text-xs font-mono"
        >
          <div className="flex items-center justify-between border-b border-zinc-800 pb-2 mb-2">
            <div className="flex items-center gap-1.5 truncate">
              <Link2 className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span className="font-bold text-zinc-100 truncate">
                {fkPeek.targetSchema ? `${fkPeek.targetSchema}.${fkPeek.targetContainer}` : fkPeek.targetContainer}
              </span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  onFollowForeignKey?.(
                    fkPeek.targetContainer,
                    fkPeek.targetColumn,
                    fkPeek.value,
                    fkPeek.targetSchema
                  );
                  setFkPeek(null);
                }}
                title="Open in Full Tab (⌘+Click shortcut)"
                className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 text-[10px]"
              >
                <span>Tab</span>
                <ExternalLink className="w-2.5 h-2.5" />
              </button>
              <button
                onClick={() => setFkPeek(null)}
                className="p-1 text-zinc-400 hover:text-zinc-200 rounded hover:bg-zinc-800"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="text-[11px] text-zinc-400 mb-2">
            WHERE <span className="text-zinc-200 font-bold">{fkPeek.targetColumn}</span> ={" "}
            <span className="text-emerald-400">{String(fkPeek.value)}</span>
          </div>

          {fkPeek.loading && (
            <div className="py-4 flex items-center justify-center gap-2 text-zinc-400">
              <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
              <span>Fetching referenced record...</span>
            </div>
          )}

          {fkPeek.error && (
            <div className="p-2 rounded bg-rose-500/10 border border-rose-500/30 text-rose-300 text-[11px]">
              {fkPeek.error}
            </div>
          )}

          {!fkPeek.loading && !fkPeek.error && !fkPeek.record && (
            <div className="py-3 text-center text-zinc-500 text-[11px]">
              No matching record found in target table.
            </div>
          )}

          {!fkPeek.loading && fkPeek.record && (
            <div className="max-h-48 overflow-y-auto space-y-1 divide-y divide-zinc-800/60 pr-1">
              {Object.entries(fkPeek.record).map(([k, v]) => (
                <div key={k} className="pt-1 flex items-start justify-between gap-2">
                  <span className="text-zinc-400 text-[10px] shrink-0">{k}:</span>
                  <span className="text-zinc-200 text-right truncate">
                    {v === null ? "NULL" : typeof v === "object" ? JSON.stringify(v) : String(v)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
