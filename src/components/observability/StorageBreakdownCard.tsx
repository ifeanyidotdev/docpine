import React from "react";
import { HardDrive, ArrowUpRight } from "lucide-react";
import type {
  ContainerResourceStat,
  WorkspaceConfig,
} from "../../types/docpine";
import { useWorkspaceStore } from "../../store/useWorkspaceStore";
import { formatBytes, formatCompactNumber } from "./formatters";

interface StorageBreakdownCardProps {
  workspace: WorkspaceConfig;
  activeDb: string;
  containers: ContainerResourceStat[];
}

export function StorageBreakdownCard({
  workspace,
  activeDb,
  containers,
}: StorageBreakdownCardProps) {
  const { openTab } = useWorkspaceStore();
  const maxBytes = Math.max(
    ...containers.map((c) => c.totalSizeBytes),
    1
  );

  const label = workspace.engine === "mongodb" ? "Collections" : "Tables";

  return (
    <div className="rounded-xl bg-zinc-900/60 border border-zinc-800/80 flex flex-col overflow-hidden">
      <div className="px-4 py-3 border-b border-zinc-800/80 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <HardDrive className="w-3.5 h-3.5 text-sky-400" />
          <div>
            <h4 className="text-xs font-semibold text-zinc-200">
              Top {label} by Storage
            </h4>
            <p className="text-[11px] text-zinc-500">
              Data + index footprint in{" "}
              <span className="font-mono text-zinc-400">{activeDb}</span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 text-[10px] text-zinc-400">
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500/80" />
            Data
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-sky-500/80" />
            Index
          </span>
        </div>
      </div>

      {containers.length === 0 ? (
        <div className="p-6 text-center text-xs text-zinc-500">
          No {label.toLowerCase()} storage stats available for this database.
        </div>
      ) : (
        <div className="p-3 space-y-2.5 max-h-72 overflow-y-auto">
          {containers.map((item) => {
            const totalPct = Math.max(
              (item.totalSizeBytes / maxBytes) * 100,
              2
            );
            const dataShare =
              item.totalSizeBytes > 0
                ? (item.dataSizeBytes / item.totalSizeBytes) * 100
                : 100;
            const indexShare = Math.max(0, 100 - dataShare);
            const fullName = item.schema
              ? `${item.schema}.${item.name}`
              : item.name;

            return (
              <div
                key={fullName}
                onClick={() =>
                  openTab(workspace.id, {
                    kind: "data",
                    title: item.name,
                    database: activeDb,
                    schema: item.schema ?? null,
                    container: item.name,
                    dataViewMode: "table",
                  })
                }
                className="group p-2 rounded-lg hover:bg-zinc-900 border border-transparent hover:border-zinc-800 cursor-pointer transition-colors space-y-1.5"
              >
                <div className="flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="font-mono text-zinc-200 truncate group-hover:text-emerald-300 transition-colors">
                      {fullName}
                    </span>
                    <ArrowUpRight className="w-3 h-3 text-zinc-600 group-hover:text-emerald-400 shrink-0" />
                  </div>
                  <div className="flex items-center gap-3 shrink-0 font-mono text-[11px]">
                    {item.estimatedRows != null && (
                      <span className="text-zinc-500">
                        ~{formatCompactNumber(item.estimatedRows)} rows
                      </span>
                    )}
                    <span className="text-zinc-200 font-semibold">
                      {formatBytes(item.totalSizeBytes)}
                    </span>
                  </div>
                </div>

                <div className="h-1.5 w-full rounded-full bg-zinc-950 overflow-hidden">
                  <div
                    className="h-full flex rounded-full overflow-hidden"
                    style={{ width: `${totalPct}%` }}
                  >
                    <div
                      className="h-full bg-emerald-500/80"
                      style={{ width: `${dataShare}%` }}
                      title={`Data: ${formatBytes(item.dataSizeBytes)}`}
                    />
                    <div
                      className="h-full bg-sky-500/80"
                      style={{ width: `${indexShare}%` }}
                      title={`Indexes: ${formatBytes(item.indexSizeBytes)}`}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
