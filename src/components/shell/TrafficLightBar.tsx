import React from "react";
import { RotateCw } from "lucide-react";
import { useUpdateStore } from "../../store/useUpdateStore";

export function TrafficLightBar() {
  const { status, updateVersion, relaunchApp } = useUpdateStore();

  return (
    <div
      data-tauri-drag-region
      className="h-8 w-full bg-zinc-950 border-b border-zinc-800/60 flex items-center justify-between px-3 select-none shrink-0 z-30"
    >
      {/* Left side: traffic light offset area + Restart to Update action */}
      <div className="flex items-center gap-2 pl-18" data-tauri-drag-region>
        {status === "ready" && (
          <button
            onClick={() => void relaunchApp()}
            title={`Docpine ${updateVersion || "update"} ready. Click to restart and apply.`}
            className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/50 text-emerald-300 font-medium text-[11px] shadow-sm shadow-emerald-950/40 transition-all animate-pulse pointer-events-auto"
          >
            <RotateCw className="w-3 h-3" />
            <span>Restart to Update</span>
          </button>
        )}
      </div>

      {/* Right drag spacer */}
      <div className="flex-1 h-full" data-tauri-drag-region />
    </div>
  );
}
