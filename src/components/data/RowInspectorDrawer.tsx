import React, { useEffect, useState } from "react";
import { X, KeyRound, Braces, ListFilter, Check } from "lucide-react";
import { parseEditedCellValue } from "./DataTableGrid";
import type { ColumnMeta } from "../../types/docpine";

interface RowInspectorDrawerProps {
  rowKey: string | null;
  rowData: Record<string, any> | null;
  originalRowData: Record<string, any> | null;
  identity: Record<string, any>;
  columns: ColumnMeta[];
  readOnly: boolean;
  onClose: () => void;
  onFieldChange: (
    rowKey: string,
    identity: Record<string, any>,
    field: string,
    newValue: any,
    originalValue: any
  ) => void;
}

export function RowInspectorDrawer({
  rowKey,
  rowData,
  originalRowData,
  identity,
  columns,
  readOnly,
  onClose,
  onFieldChange,
}: RowInspectorDrawerProps) {
  const [tab, setTab] = useState<"form" | "json">("form");
  const [rawJson, setRawJson] = useState("");
  const [jsonErr, setJsonErr] = useState<string | null>(null);

  useEffect(() => {
    if (rowData) {
      setRawJson(JSON.stringify(rowData, null, 2));
      setJsonErr(null);
    }
  }, [rowData]);

  if (!rowKey || !rowData) return null;

  const fieldNames =
    columns.length > 0
      ? columns.map((c) => c.name)
      : Object.keys(rowData);

  const handleApplyRawJson = () => {
    try {
      const parsed = JSON.parse(rawJson);
      for (const [k, v] of Object.entries(parsed)) {
        const orig = originalRowData ? originalRowData[k] : rowData[k];
        if (JSON.stringify(v) !== JSON.stringify(orig)) {
          onFieldChange(rowKey, identity, k, v, orig);
        }
      }
      setJsonErr(null);
    } catch (e) {
      setJsonErr(e instanceof Error ? e.message : "Invalid JSON");
    }
  };

  return (
    <aside className="w-96 h-full bg-zinc-900 border-l border-zinc-800 flex flex-col shrink-0 z-20 shadow-2xl">
      {/* Drawer Header */}
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-200">
            Record Inspector
          </h3>
          <p className="text-[11px] font-mono text-zinc-400 truncate max-w-[260px]">
            {rowKey}
          </p>
        </div>

        <button
          onClick={onClose}
          className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Mode Switcher */}
      <div className="px-4 py-2 border-b border-zinc-800 flex items-center gap-2 text-xs">
        <button
          onClick={() => setTab("form")}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-medium ${
            tab === "form"
              ? "bg-zinc-800 text-zinc-100"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <ListFilter className="w-3.5 h-3.5" />
          Fields Form
        </button>
        <button
          onClick={() => setTab("json")}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg font-medium ${
            tab === "json"
              ? "bg-zinc-800 text-zinc-100"
              : "text-zinc-400 hover:text-zinc-200"
          }`}
        >
          <Braces className="w-3.5 h-3.5" />
          Raw JSON
        </button>
      </div>

      {/* Body */}
      {tab === "form" ? (
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {fieldNames.map((fname) => {
            const colMeta = columns.find((c) => c.name === fname);
            const val = rowData[fname];
            const origVal = originalRowData ? originalRowData[fname] : val;
            const isModified = JSON.stringify(val) !== JSON.stringify(origVal);

            return (
              <div key={fname} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono font-semibold text-zinc-200 flex items-center gap-1">
                    {colMeta?.isPrimaryKey && (
                      <KeyRound className="w-3 h-3 text-amber-400" />
                    )}
                    {fname}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono text-zinc-500">
                      {colMeta?.dataType || typeof val}
                    </span>
                    {!readOnly && colMeta?.isNullable !== false && (
                      <button
                        type="button"
                        onClick={() =>
                          onFieldChange(rowKey, identity, fname, null, origVal)
                        }
                        className="px-1.5 py-0.2 rounded bg-zinc-800 hover:bg-zinc-700 text-[9px] font-mono text-zinc-400"
                      >
                        NULL
                      </button>
                    )}
                  </div>
                </div>

                <textarea
                  rows={typeof val === "object" && val !== null ? 3 : 1}
                  disabled={readOnly}
                  value={
                    val === null || val === undefined
                      ? "NULL"
                      : typeof val === "object"
                        ? JSON.stringify(val, null, 2)
                        : String(val)
                  }
                  onChange={(e) => {
                    const parsed = parseEditedCellValue(
                      e.target.value,
                      colMeta?.dataType || "auto"
                    );
                    onFieldChange(rowKey, identity, fname, parsed, origVal);
                  }}
                  className={`w-full px-2.5 py-1.5 rounded-lg bg-zinc-950 border text-xs font-mono focus:outline-none ${
                    isModified
                      ? "border-amber-500/60 text-amber-200"
                      : "border-zinc-800 text-zinc-100 focus:border-emerald-500/60"
                  }`}
                />
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex-1 flex flex-col p-4 space-y-3">
          <textarea
            value={rawJson}
            disabled={readOnly}
            onChange={(e) => setRawJson(e.target.value)}
            className="flex-1 w-full p-3 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-100 focus:outline-none focus:border-emerald-500/60 resize-none"
          />
          {jsonErr && (
            <div className="text-xs text-rose-400 font-mono">{jsonErr}</div>
          )}
          {!readOnly && (
            <button
              onClick={handleApplyRawJson}
              className="w-full py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-xs flex items-center justify-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              Update Record from JSON
            </button>
          )}
        </div>
      )}
    </aside>
  );
}
