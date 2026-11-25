import React, { useEffect } from "react";
import {
  Activity,
  RefreshCw,
  AlertTriangle,
  Database,
  Gauge,
  HardDrive,
  Users,
  Zap,
  Clock,
  Pause,
} from "lucide-react";
import type {
  PollingIntervalMs,
  WorkspaceConfig,
  WorkspaceTab,
} from "../../types/docpine";
import {
  observabilityKey,
  useObservabilityStore,
} from "../../store/useObservabilityStore";
import { MetricSparklineChart } from "./MetricSparklineChart";
import { ActiveQueriesTable } from "./ActiveQueriesTable";
import { StorageBreakdownCard } from "./StorageBreakdownCard";
import { ClientTelemetryCard } from "./ClientTelemetryCard";
import {
  formatBytes,
  formatCompactNumber,
  formatDurationMs,
  formatUptime,
} from "./formatters";

interface ObservabilityTabProps {
  workspace: WorkspaceConfig;
  tab: WorkspaceTab;
  isActive: boolean;
}

const POLL_OPTIONS: Array<{ label: string; value: PollingIntervalMs }> = [
  { label: "2s", value: 2000 },
  { label: "5s", value: 5000 },
  { label: "15s", value: 15000 },
  { label: "Paused", value: 0 },
];

export function ObservabilityTab({
  workspace,
  tab,
  isActive,
}: ObservabilityTabProps) {
  const {
    samplesByKey,
    loadingByKey,
    errorByKey,
    pollingIntervalByWorkspace,
    pollNow,
    setPollingInterval,
  } = useObservabilityStore();

  const key = observabilityKey(workspace.id, tab.database);
  const samples = samplesByKey[key] || [];
  const isLoading = Boolean(loadingByKey[key]);
  const error = errorByKey[key] || null;
  const pollingMs: PollingIntervalMs =
    pollingIntervalByWorkspace[workspace.id] ?? 5000;

  // Poll immediately on activation, and keep polling only while this workspace & tab are visible
  useEffect(() => {
    if (!isActive) return;

    void pollNow(workspace.id, tab.database);

    if (pollingMs === 0) return;

    const timer = window.setInterval(() => {
      void pollNow(workspace.id, tab.database);
    }, pollingMs);

    return () => window.clearInterval(timer);
  }, [isActive, workspace.id, tab.database, pollingMs, pollNow]);

  const latestSample = samples[samples.length - 1] ?? null;
  const snap = latestSample?.snapshot ?? null;

  const activeConns = snap?.server.activeConnections ?? null;
  const idleConns = snap?.server.idleConnections ?? null;
  const totalConns =
    activeConns !== null || idleConns !== null
      ? (activeConns ?? 0) + (idleConns ?? 0)
      : null;
  const maxConns = snap?.server.maxConnections ?? null;
  const connUsagePct =
    totalConns !== null && maxConns && maxConns > 0
      ? Math.min(100, (totalConns / maxConns) * 100)
      : null;

  const pingSeries = samples.map((s) => ({
    timestampMs: s.timestampMs,
    value: s.snapshot.pingMs,
  }));

  const connSeries = samples.map((s) => ({
    timestampMs: s.timestampMs,
    value: s.snapshot.server.activeConnections ?? null,
  }));

  const opsSeries = samples.map((s) => ({
    timestampMs: s.timestampMs,
    value: s.opsPerSec,
  }));

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-zinc-950">
      {/* Control Header */}
      <div className="px-5 py-3 border-b border-zinc-800/80 flex flex-wrap items-center justify-between gap-3 shrink-0 bg-zinc-950/90">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                error
                  ? "bg-rose-500"
                  : pollingMs === 0
                    ? "bg-zinc-500"
                    : "bg-cyan-400 animate-pulse"
              }`}
            />
            <Activity className="w-4 h-4 text-cyan-400 shrink-0" />
            <h3 className="text-sm font-semibold text-zinc-100 truncate">
              Workspace Resource Monitor
            </h3>
          </div>

          {snap?.server.version && (
            <span className="hidden md:inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-mono bg-zinc-900 border border-zinc-800 text-zinc-400 truncate max-w-[240px]">
              {snap.server.version}
            </span>
          )}

          {snap?.server.uptimeSeconds != null && (
            <span className="hidden lg:inline-flex items-center gap-1 text-[11px] font-mono text-zinc-500">
              <Clock className="w-3 h-3" />
              Up {formatUptime(snap.server.uptimeSeconds)}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {snap && (
            <span className="text-[11px] font-mono text-zinc-500 mr-1">
              Updated {new Date(snap.collectedAt).toLocaleTimeString()}
            </span>
          )}

          {/* Polling Interval Selector */}
          <div className="inline-flex items-center p-0.5 rounded-lg bg-zinc-900 border border-zinc-800 text-[11px]">
            {POLL_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setPollingInterval(workspace.id, opt.value)}
                className={`px-2 py-1 rounded-md font-medium transition-colors flex items-center gap-1 cursor-pointer ${
                  pollingMs === opt.value
                    ? "bg-zinc-800 text-cyan-300 shadow-xs"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                {opt.value === 0 && <Pause className="w-2.5 h-2.5" />}
                {opt.label}
              </button>
            ))}
          </div>

          <button
            onClick={() => void pollNow(workspace.id, tab.database)}
            disabled={isLoading}
            title="Refresh metrics now"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-xs text-zinc-200 transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 text-cyan-400 ${isLoading ? "animate-spin" : ""}`}
            />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Main Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {error && (
          <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-2.5 text-xs text-rose-300">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold">Failed to collect telemetry</div>
              <div className="text-rose-200/80 mt-0.5 break-all">{error}</div>
            </div>
          </div>
        )}

        {snap && snap.server.warnings.length > 0 && (
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 flex items-start gap-2.5 text-xs text-amber-200">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <div className="font-semibold text-amber-300">
                Partial telemetry (database role limits)
              </div>
              {snap.server.warnings.map((w, idx) => (
                <div key={idx} className="text-[11px] text-amber-200/80">
                  • {w}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* KPI Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* Connections */}
          <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800/80 space-y-2">
            <div className="flex items-center justify-between text-[11px] text-zinc-400">
              <span>Server Connections</span>
              <Users className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-mono font-bold text-zinc-100">
                {totalConns !== null ? totalConns : "—"}
              </span>
              {maxConns !== null && (
                <span className="text-xs font-mono text-zinc-500">
                  / {maxConns} max
                </span>
              )}
            </div>
            <div className="text-[11px] font-mono text-zinc-500">
              {activeConns !== null ? `${activeConns} active` : "—"}
              {idleConns !== null ? ` • ${idleConns} idle` : ""}
            </div>
            {connUsagePct !== null && (
              <div className="h-1.5 rounded-full bg-zinc-950 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    connUsagePct >= 85
                      ? "bg-rose-500"
                      : connUsagePct >= 65
                        ? "bg-amber-400"
                        : "bg-emerald-400"
                  }`}
                  style={{ width: `${Math.max(connUsagePct, 2)}%` }}
                />
              </div>
            )}
          </div>

          {/* Ping RTT & Operations/sec */}
          <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800/80 space-y-2">
            <div className="flex items-center justify-between text-[11px] text-zinc-400">
              <span>Live Latency & Throughput</span>
              <Zap className="w-3.5 h-3.5 text-amber-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-mono font-bold text-zinc-100">
                {snap ? formatDurationMs(snap.pingMs) : "—"}
              </span>
              <span className="text-xs text-zinc-500">ping RTT</span>
            </div>
            <div className="text-[11px] font-mono text-zinc-500">
              {latestSample?.opsPerSec != null
                ? `${latestSample.opsPerSec.toFixed(1)} ops/sec`
                : snap?.server.totalOperations != null
                  ? `${formatCompactNumber(snap.server.totalOperations)} total ops`
                  : "Waiting for next sample"}
            </div>
          </div>

          {/* Cache Hit Ratio & Memory */}
          <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800/80 space-y-2">
            <div className="flex items-center justify-between text-[11px] text-zinc-400">
              <span>Cache & Memory</span>
              <Gauge className="w-3.5 h-3.5 text-cyan-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-mono font-bold text-zinc-100">
                {snap?.server.cacheHitRatio != null
                  ? `${snap.server.cacheHitRatio.toFixed(1)}%`
                  : "—"}
              </span>
              <span className="text-xs text-zinc-500">cache hit</span>
            </div>
            <div className="text-[11px] font-mono text-zinc-500">
              {snap?.server.memoryMb != null
                ? `Buffer / Resident: ${snap.server.memoryMb.toFixed(0)} MB`
                : "Memory metric unavailable"}
            </div>
          </div>

          {/* Database Size */}
          <div className="p-4 rounded-xl bg-zinc-900/60 border border-zinc-800/80 space-y-2">
            <div className="flex items-center justify-between text-[11px] text-zinc-400">
              <span>Database Storage</span>
              <HardDrive className="w-3.5 h-3.5 text-sky-400" />
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-mono font-bold text-zinc-100">
                {formatBytes(snap?.server.databaseSizeBytes)}
              </span>
            </div>
            <div className="text-[11px] font-mono text-zinc-500 truncate flex items-center gap-1">
              <Database className="w-3 h-3 shrink-0" />
              <span className="truncate">{tab.database}</span>
            </div>
          </div>
        </div>

        {/* Live Time-Series Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <MetricSparklineChart
            title="Active Server Connections"
            subtitle="Rolling session window (up to 60 polls)"
            points={connSeries}
            unit=""
            strokeColor="#34d399"
            formatValue={(v) => `${Math.round(v)}`}
          />
          <MetricSparklineChart
            title="Operations / sec"
            subtitle="Delta server ops between consecutive polls"
            points={opsSeries}
            unit=" ops/s"
            strokeColor="#fbbf24"
            emptyText="Needs 2 consecutive samples to compute ops/sec..."
          />
          <MetricSparklineChart
            title="Connection Ping RTT"
            subtitle="Round-trip latency from Docpine to database"
            points={pingSeries}
            unit=" ms"
            strokeColor="#22d3ee"
            formatValue={(v) => `${Math.round(v)} ms`}
          />
        </div>

        {/* Active Queries & Storage Breakdown */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <ActiveQueriesTable
            workspace={workspace}
            activeDb={tab.database}
            queries={snap?.server.activeQueries || []}
          />
          <StorageBreakdownCard
            workspace={workspace}
            activeDb={tab.database}
            containers={snap?.server.topContainers || []}
          />
        </div>

        {/* Docpine Client Telemetry */}
        {snap && <ClientTelemetryCard client={snap.client} />}
      </div>
    </div>
  );
}
