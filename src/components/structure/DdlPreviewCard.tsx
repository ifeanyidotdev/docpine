import React from "react";
import { Code2 } from "lucide-react";

interface DdlPreviewCardProps {
  ddlStatement: string;
}

export function DdlPreviewCard({ ddlStatement }: DdlPreviewCardProps) {
  return (
    <div className="rounded-2xl bg-zinc-900/60 border border-zinc-800 p-4 space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-zinc-300">
        <Code2 className="w-4 h-4 text-emerald-400" />
        <span>DDL / Creation Blueprint</span>
      </div>
      <pre className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-mono text-emerald-200 overflow-x-auto whitespace-pre-wrap">
        {ddlStatement}
      </pre>
    </div>
  );
}
