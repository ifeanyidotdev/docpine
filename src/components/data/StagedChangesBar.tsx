import React, { useEffect } from "react";
import {
  Check,
  RotateCcw,
  Loader2,
  GitCommitHorizontal,
} from "lucide-react";
import type { TabStagedState } from "../../types/docpine";

interface StagedChangesBarProps {
  workspaceId?: string;
  database?: string;
  schema?: string | null;
  container?: string;
  staged: TabStagedState;
  applying: boolean;
  /** When false (tab hidden), ⌘S is not captured by this bar. */
  shortcutsEnabled?: boolean;
  onApply: () => Promise<void>;
  onDiscard: () => void;
}

export function StagedChangesBar({
  staged,
  applying,
  shortcutsEnabled = true,
  onApply,
  onDiscard,
}: StagedChangesBarProps) {
  const insertCount = Object.keys(staged.inserts).length;
  const updateCount = Object.keys(staged.updates).length;
  const deleteCount = Object.keys(staged.deletes).length;
  const totalCount = insertCount + updateCount + deleteCount;

  // Keyboard shortcut Cmd+S / Ctrl+S to commit staged changes
  useEffect(() => {
    if (totalCount === 0 || !shortcutsEnabled) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void onApply();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [totalCount, onApply, shortcutsEnabled]);

  if (totalCount === 0) return null;

  return (
    <div className="border-t border-zinc-800 bg-zinc-900/95 backdrop-blur-md shadow-2xl z-20 shrink-0">
      {/* Action Bar */}
      <div className="px-4 py-2.5 flex items-center justify-between gap-4">
        {/* Left: Staged Counts */}
        <div className="flex items-center gap-3 text-xs">
          <div className="flex items-center gap-1.5 font-semibold text-zinc-100">
            <GitCommitHorizontal className="w-4 h-4 text-amber-400" />
            <span>{totalCount} Staged Change(s)</span>
          </div>

          <div className="flex items-center gap-1.5 font-mono text-[11px]">
            {insertCount > 0 && (
              <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                +{insertCount} insert{insertCount > 1 ? "s" : ""}
              </span>
            )}
            {updateCount > 0 && (
              <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30">
                ~{updateCount} update{updateCount > 1 ? "s" : ""}
              </span>
            )}
            {deleteCount > 0 && (
              <span className="px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 border border-rose-500/30">
                -{deleteCount} delete{deleteCount > 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>

        {/* Right: Only Discard and Apply Buttons */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={applying}
            onClick={onDiscard}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800/80 hover:bg-rose-500/15 text-xs font-medium text-zinc-300 hover:text-rose-300 border border-zinc-700/80 transition-colors cursor-pointer disabled:opacity-50"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Discard</span>
          </button>

          <button
            type="button"
            disabled={applying}
            onClick={() => void onApply()}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-semibold text-xs shadow-lg shadow-emerald-950/50 transition-all cursor-pointer disabled:opacity-50"
          >
            {applying ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Check className="w-3.5 h-3.5 stroke-[2.5]" />
            )}
            <span>Apply Changes (⌘S)</span>
          </button>
        </div>
      </div>
    </div>
  );
}
