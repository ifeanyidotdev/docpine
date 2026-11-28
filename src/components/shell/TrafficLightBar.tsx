import React from "react";
import { RotateCw, RefreshCw, Download } from "lucide-react";
import { useUpdateStore } from "../../store/useUpdateStore";

export function TrafficLightBar() {
  const {
    status,
    updateVersion,
    downloadProgress,
    checkForUpdates,
    relaunchApp,
  } = useUpdateStore();

  return (
    <div
      data-tauri-drag-region
      className="h-8 w-full bg-zinc-950 border-b border-zinc-800/60 flex items-center justify-between px-3 select-none shrink-0 z-30"
    >
      {/* Left side: traffic light offset area + live update status */}
      <div className="flex items-center gap-2 pl-18" data-tauri-drag-region>
        {status === "ready" && (
          <button
            type="button"
            onClick={() => void relaunchApp()}
            title={`Docpine ${updateVersion ? `v${updateVersion}` : "update"} ready. Click to restart and apply.`}
            className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/50 text-emerald-300 font-medium text-[11px] shadow-sm shadow-emerald-950/40 transition-all animate-pulse pointer-events-auto cursor-pointer"
          >
            <RotateCw className="w-3 h-3" />
            <span>
              Restart to Update{updateVersion ? ` (v${updateVersion})` : ""}
            </span>
          </button>
        )}

        {status === "downloading" && (
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-sky-500/10 border border-sky-500/30 text-sky-300 font-mono text-[10px]">
            <Download className="w-3 h-3 animate-bounce" />
            <span>
              Downloading{updateVersion ? ` v${updateVersion}` : ""}
              {downloadProgress !== null ? ` · ${downloadProgress}%` : "..."}
            </span>
          </span>
        )}
      </div>

      {/* Center drag spacer */}
      <div className="flex-1 h-full" data-tauri-drag-region />

      {/* Right side: subtle manual Check for Updates button */}
      <div className="flex items-center gap-2">
        {status !== "ready" && status !== "downloading" && (
          <button
            type="button"
            disabled={status === "checking"}
            onClick={() => void checkForUpdates({ manual: true })}
            title="Check for Updates"
            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-medium text-zinc-500 hover:text-zinc-200 hover:bg-zinc-900 transition-colors cursor-pointer disabled:opacity-60"
          >
            <RefreshCw
              className={`w-3 h-3 ${status === "checking" ? "animate-spin text-emerald-400" : ""}`}
            />
            <span>
              {status === "checking" ? "Checking..." : "Check Updates"}
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
