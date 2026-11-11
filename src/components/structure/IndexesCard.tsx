import React, { useState } from "react";
import { Trash2, Plus } from "lucide-react";
import type { IndexDefinition } from "../../types/docpine";

interface IndexesCardProps {
  indexes: IndexDefinition[];
  isReadOnly: boolean;
  onDropIndex: (indexName: string) => Promise<void>;
  onCreateIndex: (
    indexName: string,
    columns: string[],
    isUnique: boolean
  ) => Promise<void>;
}

export function IndexesCard({
  indexes,
  isReadOnly,
  onDropIndex,
  onCreateIndex,
}: IndexesCardProps) {
  const [newIdxName, setNewIdxName] = useState("");
  const [newIdxCols, setNewIdxCols] = useState("");
  const [newIdxUnique, setNewIdxUnique] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newIdxName.trim() || !newIdxCols.trim() || isSubmitting) return;

    const cols = newIdxCols
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (cols.length === 0) return;

    setIsSubmitting(true);
    try {
      await onCreateIndex(newIdxName.trim(), cols, newIdxUnique);
      setNewIdxName("");
      setNewIdxCols("");
      setNewIdxUnique(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="rounded-2xl bg-zinc-900/60 border border-zinc-800 overflow-hidden">
      <div className="px-4 py-3 border-b border-zinc-800">
        <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-200">
          Indexes ({indexes.length})
        </h3>
      </div>

      <div className="divide-y divide-zinc-800/60 max-h-72 overflow-y-auto">
        {indexes.length === 0 ? (
          <div className="p-4 text-center text-xs text-zinc-500 font-sans">
            No indexes registered.
          </div>
        ) : (
          indexes.map((idx) => (
            <div
              key={idx.name}
              className="px-4 py-2.5 flex items-center justify-between gap-2 text-xs font-mono"
            >
              <div className="min-w-0">
                <div className="font-semibold text-zinc-100 truncate">
                  {idx.name}
                </div>
                <div className="text-[11px] text-zinc-400">
                  ({idx.columns.join(", ")}) {idx.isUnique ? "• UNIQUE" : ""}
                </div>
              </div>
              {!isReadOnly && !idx.isPrimary && (
                <button
                  onClick={() => void onDropIndex(idx.name)}
                  className="p-1 rounded hover:bg-rose-500/15 text-zinc-500 hover:text-rose-400 transition-colors"
                  title="Drop Index"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {!isReadOnly && (
        <form
          onSubmit={(e) => void handleSubmit(e)}
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
            className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-mono text-zinc-100 focus:outline-none focus:border-emerald-500/60"
          />
          <input
            type="text"
            value={newIdxCols}
            onChange={(e) => setNewIdxCols(e.target.value)}
            placeholder="Columns comma-separated (e.g. email, status)"
            className="w-full px-2.5 py-1.5 rounded-lg bg-zinc-900 border border-zinc-800 text-xs font-mono text-zinc-100 focus:outline-none focus:border-emerald-500/60"
          />
          <div className="flex items-center justify-between">
            <label className="flex items-center gap-1.5 text-xs text-zinc-400 cursor-pointer">
              <input
                type="checkbox"
                checked={newIdxUnique}
                onChange={(e) => setNewIdxUnique(e.target.checked)}
                className="accent-emerald-500 rounded"
              />
              Unique Index
            </label>
            <button
              type="submit"
              disabled={isSubmitting || !newIdxName.trim() || !newIdxCols.trim()}
              className="inline-flex items-center gap-1 px-3 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-zinc-950 font-semibold text-xs transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Create Index
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
