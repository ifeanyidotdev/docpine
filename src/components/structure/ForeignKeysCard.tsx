import React from "react";
import type { ForeignKeyEdge } from "../../types/docpine";

interface ForeignKeysCardProps {
  foreignKeys: ForeignKeyEdge[];
}

export function ForeignKeysCard({ foreignKeys }: ForeignKeysCardProps) {
  return (
    <div className="rounded-2xl bg-zinc-900/60 border border-zinc-800 overflow-hidden">
      <div className="px-4 py-3 border-b border-zinc-800">
        <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-200">
          Foreign Keys &amp; References ({foreignKeys.length})
        </h3>
      </div>
      <div className="p-4 space-y-2 text-xs font-mono max-h-72 overflow-y-auto">
        {foreignKeys.length === 0 ? (
          <div className="text-zinc-500 font-sans text-xs">
            No foreign key constraints registered on this object.
          </div>
        ) : (
          foreignKeys.map((fk) => (
            <div
              key={fk.constraintName}
              className="p-2.5 rounded-xl bg-zinc-950 border border-zinc-800 space-y-1"
            >
              <div className="text-indigo-300 font-semibold truncate">
                {fk.constraintName}
              </div>
              <div className="text-zinc-300 text-[11px] truncate">
                {fk.sourceColumn} → {fk.targetContainer}.{fk.targetColumn}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
