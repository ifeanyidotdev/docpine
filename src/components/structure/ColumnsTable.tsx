import React, { useState } from "react";
import { KeyRound, Link2, Plus, Trash2 } from "lucide-react";
import type { ColumnMeta, DatabaseEngine } from "../../types/docpine";

interface ColumnsTableProps {
  columns: ColumnMeta[];
  isMongo: boolean;
  isReadOnly: boolean;
  engine: DatabaseEngine;
  onDropColumn: (columnName: string) => Promise<void>;
  onAddColumn: (
    name: string,
    dataType: string,
    isNullable: boolean,
    defaultValue: string
  ) => Promise<void>;
}

export function ColumnsTable({
  columns,
  isMongo,
  isReadOnly,
  engine,
  onDropColumn,
  onAddColumn,
}: ColumnsTableProps) {
  const [newColName, setNewColName] = useState("");
  const [newColType, setNewColType] = useState(
    engine === "postgres" ? "TEXT" : "VARCHAR(255)"
  );
  const [newColNullable, setNewColNullable] = useState(true);
  const [newColDefault, setNewColDefault] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newColName.trim() || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await onAddColumn(
        newColName.trim(),
        newColType.trim() || "TEXT",
        newColNullable,
        newColDefault.trim()
      );
      setNewColName("");
      setNewColDefault("");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="rounded-2xl bg-zinc-900/60 border border-zinc-800 overflow-hidden">
      <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-200">
          {isMongo
            ? `Inferred Document Fields (${columns.length})`
            : `Columns (${columns.length})`}
        </h3>
      </div>

      <div className="overflow-x-auto">
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
            {columns.map((col) => (
              <tr
                key={col.name}
                className="border-b border-zinc-800/60 hover:bg-zinc-900 transition-colors"
              >
                <td className="px-4 py-2.5 font-semibold text-zinc-100 flex items-center gap-1.5">
                  {col.isPrimaryKey && (
                    <KeyRound className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  )}
                  {col.foreignKeyTarget && (
                    <Link2 className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  )}
                  <span className="truncate">{col.name}</span>
                </td>
                <td className="px-4 py-2.5 text-emerald-300">{col.dataType}</td>
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
                        onClick={() => void onDropColumn(col.name)}
                        className="p-1 rounded hover:bg-rose-500/15 text-zinc-500 hover:text-rose-400 transition-colors"
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
      </div>

      {/* Add Column Form for SQL */}
      {!isReadOnly && !isMongo && (
        <form
          autoComplete="off"
          onSubmit={(e) => void handleSubmit(e)}
          className="p-3 bg-zinc-950/70 border-t border-zinc-800 flex flex-wrap items-center gap-2"
        >
          <input
            type="text"
            value={newColName}
            onChange={(e) => setNewColName(e.target.value)}
            placeholder="New column name..."
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            className="px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-mono text-zinc-100 focus:outline-none focus:border-emerald-500/60"
          />
          <input
            type="text"
            value={newColType}
            onChange={(e) => setNewColType(e.target.value)}
            placeholder="Data type (e.g. TEXT, INT, JSONB)"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            className="w-40 px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-mono text-emerald-300 focus:outline-none focus:border-emerald-500/60"
          />
          <input
            type="text"
            value={newColDefault}
            onChange={(e) => setNewColDefault(e.target.value)}
            placeholder="Default (optional)"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            className="w-36 px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-mono text-zinc-200 focus:outline-none focus:border-emerald-500/60"
          />
          <label className="flex items-center gap-1.5 text-xs text-zinc-400 px-1 cursor-pointer">
            <input
              type="checkbox"
              checked={newColNullable}
              onChange={(e) => setNewColNullable(e.target.checked)}
              className="accent-emerald-500 rounded"
            />
            Nullable
          </label>
          <button
            type="submit"
            disabled={isSubmitting || !newColName.trim()}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-zinc-950 font-semibold text-xs ml-auto transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Add Column
          </button>
        </form>
      )}
    </div>
  );
}
