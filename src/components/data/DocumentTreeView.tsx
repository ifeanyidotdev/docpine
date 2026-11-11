import React, { useState } from "react";
import {
  ChevronRight,
  ChevronDown,
  Trash2,
  RotateCcw,
  Plus,
  Eye,
  Braces,
} from "lucide-react";
import { buildRowIdentity, parseEditedCellValue } from "./DataTableGrid";
import type { TabStagedState } from "../../types/docpine";

interface DocumentTreeViewProps {
  rows: Record<string, any>[];
  primaryKeys: string[];
  staged: TabStagedState;
  selectedRowKey: string | null;
  readOnly: boolean;
  onSelectRow: (rowKey: string, rowData: Record<string, any>) => void;
  onCellCommit: (
    rowKey: string,
    identity: Record<string, any>,
    field: string,
    newValue: any,
    originalValue: any
  ) => void;
  onToggleDeleteRow: (rowKey: string, identity: Record<string, any>) => void;
}

function inferValueBadge(val: any): { label: string; color: string } {
  if (val === null || val === undefined)
    return { label: "null", color: "text-zinc-500" };
  if (Array.isArray(val))
    return { label: `Array(${val.length})`, color: "text-indigo-400" };
  if (typeof val === "object")
    return {
      label: `Object(${Object.keys(val).length})`,
      color: "text-emerald-400",
    };
  if (typeof val === "boolean")
    return { label: "bool", color: "text-amber-400" };
  if (typeof val === "number")
    return { label: "num", color: "text-sky-400" };
  if (typeof val === "string" && /^[a-f0-9]{24}$/i.test(val))
    return { label: "ObjectId", color: "text-orange-400" };
  return { label: "str", color: "text-zinc-400" };
}

export function DocumentTreeView({
  rows,
  primaryKeys,
  staged,
  selectedRowKey,
  readOnly,
  onSelectRow,
  onCellCommit,
  onToggleDeleteRow,
}: DocumentTreeViewProps) {
  const [collapsedDocs, setCollapsedDocs] = useState<Record<string, boolean>>(
    {}
  );
  const [editingField, setEditingField] = useState<{
    rowKey: string;
    field: string;
    value: string;
  } | null>(null);
  const [addingFieldTo, setAddingFieldTo] = useState<{
    rowKey: string;
    identity: Record<string, any>;
    newKey: string;
    newVal: string;
  } | null>(null);

  const toggleDoc = (rowKey: string) => {
    setCollapsedDocs((prev) => ({ ...prev, [rowKey]: !prev[rowKey] }));
  };

  return (
    <div className="flex-1 h-full overflow-y-auto bg-zinc-950 p-4 space-y-3 font-mono text-xs">
      {rows.map((row, idx) => {
        const { rowKey, identity } = buildRowIdentity(row, primaryKeys, idx);
        const updates = staged.updates[rowKey]?.changes || {};
        const merged = { ...row, ...updates };
        const isDeleted = Boolean(staged.deletes[rowKey]);
        const isCollapsed = Boolean(collapsedDocs[rowKey]);
        const isSelected = selectedRowKey === rowKey;
        const hasEdits = Object.keys(updates).length > 0;

        const idLabel =
          merged._id !== undefined
            ? `_id: "${merged._id}"`
            : merged.id !== undefined
              ? `id: ${merged.id}`
              : `Document #${idx + 1}`;

        return (
          <div
            key={rowKey}
            onClick={() => onSelectRow(rowKey, merged)}
            className={`rounded-xl border transition-all ${
              isDeleted
                ? "bg-rose-500/10 border-rose-500/30 opacity-70"
                : isSelected
                  ? "bg-zinc-900 border-emerald-500/50 shadow-lg"
                  : hasEdits
                    ? "bg-amber-500/5 border-amber-500/40"
                    : "bg-zinc-900/60 border-zinc-800/90 hover:border-zinc-700"
            }`}
          >
            {/* Document Card Header */}
            <div className="px-3.5 py-2 border-b border-zinc-800/80 flex items-center justify-between gap-2 select-none">
              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleDoc(rowKey);
                  }}
                  className="p-0.5 rounded hover:bg-zinc-800 text-zinc-400"
                >
                  {isCollapsed ? (
                    <ChevronRight className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                </button>
                <Braces className="w-3.5 h-3.5 text-emerald-400" />
                <span className="font-semibold text-zinc-100">{idLabel}</span>
                {hasEdits && (
                  <span className="px-1.5 py-0.2 rounded text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/40">
                    MODIFIED
                  </span>
                )}
                {isDeleted && (
                  <span className="px-1.5 py-0.2 rounded text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/40">
                    DELETED
                  </span>
                )}
              </div>

              <div
                className="flex items-center gap-1.5"
                onClick={(e) => e.stopPropagation()}
              >
                {!readOnly && !isDeleted && (
                  <button
                    onClick={() =>
                      setAddingFieldTo({
                        rowKey,
                        identity,
                        newKey: "",
                        newVal: "",
                      })
                    }
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-[11px] text-emerald-300"
                  >
                    <Plus className="w-3 h-3" />
                    Field
                  </button>
                )}
                <button
                  onClick={() => onSelectRow(rowKey, merged)}
                  className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100"
                  title="Open in Inspector"
                >
                  <Eye className="w-3.5 h-3.5" />
                </button>
                {!readOnly && (
                  <button
                    onClick={() => onToggleDeleteRow(rowKey, identity)}
                    className="p-1 rounded hover:bg-zinc-800 text-zinc-400 hover:text-rose-400"
                    title={isDeleted ? "Restore Document" : "Delete Document"}
                  >
                    {isDeleted ? (
                      <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* Document Tree Body */}
            {!isCollapsed && (
              <div className="p-3 space-y-1.5">
                {Object.entries(merged).map(([field, val]) => {
                  const badge = inferValueBadge(val);
                  const isFieldModified = field in updates;
                  const isEditingThis =
                    editingField?.rowKey === rowKey &&
                    editingField?.field === field;

                  return (
                    <div
                      key={field}
                      onDoubleClick={() => {
                        if (readOnly || isDeleted || field === "_id") return;
                        setEditingField({
                          rowKey,
                          field,
                          value:
                            val === null
                              ? "NULL"
                              : typeof val === "object"
                                ? JSON.stringify(val)
                                : String(val),
                        });
                      }}
                      className={`px-2.5 py-1 rounded-lg flex items-start justify-between gap-4 ${
                        isFieldModified
                          ? "bg-amber-500/15 text-amber-200"
                          : "hover:bg-zinc-800/50"
                      }`}
                    >
                      <div className="flex items-start gap-2 min-w-0 flex-1">
                        <span className="text-emerald-300 font-semibold shrink-0">
                          {field}:
                        </span>

                        {isEditingThis ? (
                          <input
                            type="text"
                            autoFocus
                            value={editingField.value}
                            onChange={(e) =>
                              setEditingField({
                                ...editingField,
                                value: e.target.value,
                              })
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                onCellCommit(
                                  rowKey,
                                  identity,
                                  field,
                                  parseEditedCellValue(
                                    editingField.value,
                                    "auto"
                                  ),
                                  row[field]
                                );
                                setEditingField(null);
                              } else if (e.key === "Escape") {
                                setEditingField(null);
                              }
                            }}
                            onBlur={() => {
                              onCellCommit(
                                rowKey,
                                identity,
                                field,
                                parseEditedCellValue(
                                  editingField.value,
                                  "auto"
                                ),
                                row[field]
                              );
                              setEditingField(null);
                            }}
                            className="flex-1 px-2 py-0.5 rounded bg-zinc-950 border border-emerald-500 text-zinc-100 focus:outline-none"
                          />
                        ) : (
                          <span className="text-zinc-200 break-all">
                            {val === null
                              ? "null"
                              : typeof val === "string"
                                ? `"${val}"`
                                : JSON.stringify(val)}
                          </span>
                        )}
                      </div>

                      <span
                        className={`text-[10px] font-medium shrink-0 ${badge.color}`}
                      >
                        {badge.label}
                      </span>
                    </div>
                  );
                })}

                {/* Inline Add New Field Row */}
                {addingFieldTo?.rowKey === rowKey && (
                  <div className="pt-2 flex items-center gap-2">
                    <input
                      type="text"
                      placeholder="field_name"
                      value={addingFieldTo.newKey}
                      onChange={(e) =>
                        setAddingFieldTo({
                          ...addingFieldTo,
                          newKey: e.target.value,
                        })
                      }
                      className="w-36 px-2 py-1 rounded bg-zinc-950 border border-zinc-700 text-xs text-zinc-100"
                    />
                    <input
                      type="text"
                      placeholder="value (JSON or string)"
                      value={addingFieldTo.newVal}
                      onChange={(e) =>
                        setAddingFieldTo({
                          ...addingFieldTo,
                          newVal: e.target.value,
                        })
                      }
                      className="flex-1 px-2 py-1 rounded bg-zinc-950 border border-zinc-700 text-xs text-zinc-100"
                    />
                    <button
                      onClick={() => {
                        if (addingFieldTo.newKey.trim()) {
                          onCellCommit(
                            rowKey,
                            identity,
                            addingFieldTo.newKey.trim(),
                            parseEditedCellValue(addingFieldTo.newVal, "auto"),
                            undefined
                          );
                        }
                        setAddingFieldTo(null);
                      }}
                      className="px-2.5 py-1 rounded bg-emerald-500 text-zinc-950 font-sans font-semibold text-xs"
                    >
                      Save Field
                    </button>
                    <button
                      onClick={() => setAddingFieldTo(null)}
                      className="px-2 py-1 rounded text-zinc-400 hover:text-zinc-200 font-sans text-xs"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
