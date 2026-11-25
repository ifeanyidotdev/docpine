import React from "react";
import { Cpu, ShieldCheck, AlertTriangle } from "lucide-react";
import type { ClientWorkspaceTelemetry } from "../../types/docpine";
import { formatDurationMs } from "./formatters";

interface ClientTelemetryCardProps {
  client: ClientWorkspaceTelemetry;
}

export function ClientTelemetryCard({ client }: ClientTelemetryCardProps) {
  const maxLatency = Math.max(
    ...client.recentLatencies.map((p) => p.executionMs),
    1
  );

  return (
    <div className="rounded-xl bg-zinc-900/60 border border-zinc-800/80 p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Cpu className="w-4 h-4 text-cyan-400" />
          <h4 className="text-xs font-semibold text-zinc-200">Telemetry</h4>
        </div>

        <div className="flex items-center gap-2">
          {client.sshTunnelActive && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-mono bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
              <ShieldCheck className="w-3.5 h-3.5" />
              SSH Tunnel 127.0.0.1:{client.sshLocalPort}
            </span>
          )}
          <span className="px-2.5 py-1 rounded-lg text-[11px] font-mono bg-zinc-950 border border-zinc-800 text-zinc-300">
            Pool:{" "}
            {client.pool.tracked
              ? `${client.pool.active} active / ${client.pool.idle} idle (max ${client.pool.max})`
              : `Managed (max ${client.pool.max})`}
          </span>
        </div>
      </div>

      {/* Summary metrics strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 rounded-lg bg-zinc-950/70 border border-zinc-800/70">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">
            Queries Run
          </div>
          <div className="text-base font-mono font-bold text-zinc-100 mt-0.5">
            {client.totalQueriesExecuted.toLocaleString()}
          </div>
        </div>
        <div className="p-3 rounded-lg bg-zinc-950/70 border border-zinc-800/70">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">
            Avg Latency
          </div>
          <div className="text-base font-mono font-bold text-emerald-400 mt-0.5">
            {client.totalQueriesExecuted > 0
              ? formatDurationMs(client.avgQueryMs)
              : "—"}
          </div>
        </div>
        <div className="p-3 rounded-lg bg-zinc-950/70 border border-zinc-800/70">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500">
            P95 Latency
          </div>
          <div className="text-base font-mono font-bold text-amber-400 mt-0.5">
            {client.totalQueriesExecuted > 0
              ? formatDurationMs(client.p95QueryMs)
              : "—"}
          </div>
        </div>
        <div className="p-3 rounded-lg bg-zinc-950/70 border border-zinc-800/70">
          <div className="text-[10px] uppercase tracking-wider text-zinc-500 flex items-center gap-1">
            Error Rate
            {client.failedQueriesCount > 0 && (
              <AlertTriangle className="w-3 h-3 text-rose-400" />
            )}
          </div>
          <div
            className={`text-base font-mono font-bold mt-0.5 ${
              client.errorRatePct > 10
                ? "text-rose-400"
                : client.errorRatePct > 0
                  ? "text-amber-300"
                  : "text-emerald-400"
            }`}
          >
            {client.errorRatePct.toFixed(1)}%
            <span className="text-[10px] font-normal text-zinc-500 ml-1.5">
              ({client.failedQueriesCount} failed)
            </span>
          </div>
        </div>
      </div>

      {/* Recent query latency bar strip */}
      <div>
        <div className="flex items-center justify-between text-[10px] text-zinc-500 mb-1.5">
          <span>Recent Query Latencies (last {client.recentLatencies.length})</span>
          <span className="font-mono">peak {formatDurationMs(maxLatency)}</span>
        </div>

        {client.recentLatencies.length === 0 ? (
          <div className="h-14 rounded-lg bg-zinc-950/60 border border-zinc-800/60 flex items-center justify-center text-[11px] text-zinc-500">
            Execute queries in this workspace to populate client latency telemetry.
          </div>
        ) : (
          <div className="h-14 px-2 py-1.5 rounded-lg bg-zinc-950/60 border border-zinc-800/60 flex items-end gap-1">
            {client.recentLatencies.map((pt, idx) => {
              const heightPct = Math.max((pt.executionMs / maxLatency) * 100, 10);
              const isErr = pt.status !== "success";
              return (
                <div
                  key={`${pt.executedAt}-${idx}`}
                  title={`${new Date(pt.executedAt).toLocaleTimeString()} • ${pt.database} • ${formatDurationMs(pt.executionMs)} (${pt.status})`}
                  className="flex-1 h-full flex items-end"
                >
                  <div
                    className={`w-full rounded-t-xs transition-all ${
                      isErr
                        ? "bg-rose-500/80 hover:bg-rose-400"
                        : "bg-cyan-500/75 hover:bg-cyan-400"
                    }`}
                    style={{ height: `${heightPct}%` }}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
