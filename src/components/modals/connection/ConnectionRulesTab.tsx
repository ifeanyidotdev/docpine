import React from "react";
import { Shield } from "lucide-react";
import type { CommitMode, EnvironmentTag, SafetyMode } from "../../../types/docpine";

export const ENV_PRESETS: Record<EnvironmentTag, { label: string; color: string }> = {
  production: { label: "Production", color: "#ef4444" },
  staging: { label: "Staging", color: "#f59e0b" },
  development: { label: "Development", color: "#10b981" },
  local: { label: "Local", color: "#6366f1" },
};

interface ConnectionRulesTabProps {
  environment: EnvironmentTag;
  accentColor: string;
  commitMode: CommitMode;
  safetyMode: SafetyMode;
  setEnvironment: (env: EnvironmentTag) => void;
  setAccentColor: (color: string) => void;
  setCommitMode: (mode: CommitMode) => void;
  setSafetyMode: (mode: SafetyMode) => void;
}

export function ConnectionRulesTab({
  environment,
  accentColor: _accentColor,
  commitMode,
  safetyMode,
  setEnvironment,
  setAccentColor,
  setCommitMode,
  setSafetyMode,
}: ConnectionRulesTabProps) {
  return (
    <div className="space-y-5">
      {/* Environment & Color Accent */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-zinc-300">
          Workspace Environment Tag &amp; Color Accent
        </label>
        <div className="grid grid-cols-4 gap-2.5">
          {(
            Object.keys(ENV_PRESETS) as Array<keyof typeof ENV_PRESETS>
          ).map((envKey) => {
            const preset = ENV_PRESETS[envKey];
            const selected = environment === envKey;
            return (
              <button
                key={envKey}
                type="button"
                onClick={() => {
                  setEnvironment(envKey);
                  setAccentColor(preset.color);
                  if (envKey === "production") {
                    setSafetyMode("safe");
                    setCommitMode("staged");
                  }
                }}
                className={`p-3 rounded-xl border text-left transition-all ${
                  selected
                    ? "bg-zinc-800 border-zinc-600 text-white"
                    : "bg-zinc-950/60 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: preset.color }}
                  />
                  <span className="text-xs font-semibold">{preset.label}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Commit Mode */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-zinc-300">
          Data Manipulation Commit Mode
        </label>
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setCommitMode("staged")}
            className={`p-3.5 rounded-xl border text-left transition-all ${
              commitMode === "staged"
                ? "bg-emerald-500/10 border-emerald-500/50 text-zinc-100"
                : "bg-zinc-950/60 border-zinc-800 text-zinc-400 hover:border-zinc-700"
            }`}
          >
            <div className="text-xs font-semibold">
              Staged Changes (Recommended)
            </div>
            <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">
              Inline edits, new rows/docs, and deletes are highlighted locally.
              Review generated SQL/MQL and press ⌘S to apply atomically.
            </p>
          </button>

          <button
            type="button"
            onClick={() => setCommitMode("immediate")}
            className={`p-3.5 rounded-xl border text-left transition-all ${
              commitMode === "immediate"
                ? "bg-amber-500/10 border-amber-500/50 text-zinc-100"
                : "bg-zinc-950/60 border-zinc-800 text-zinc-400 hover:border-zinc-700"
            }`}
          >
            <div className="text-xs font-semibold">Immediate Auto-Commit</div>
            <p className="text-[11px] text-zinc-400 mt-1 leading-relaxed">
              Every cell edit, document change, or deletion executes immediately
              against the live database without staging.
            </p>
          </button>
        </div>
      </div>

      {/* Safety Guardrail Mode */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5 text-emerald-400" />
          Safety Guardrail Level
        </label>
        <div className="grid grid-cols-3 gap-2.5">
          {(
            [
              {
                id: "safe",
                title: "Safe Mode",
                desc: "Warns before DROP, TRUNCATE, or unfiltered DELETE/UPDATE",
              },
              {
                id: "standard",
                title: "Standard",
                desc: "No extra confirmation prompts on destructive queries",
              },
              {
                id: "read_only",
                title: "Read-Only Lock",
                desc: "Blocks all mutations and DDL in both UI and Rust driver",
              },
            ] as const
          ).map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setSafetyMode(m.id)}
              className={`p-3 rounded-xl border text-left transition-all ${
                safetyMode === m.id
                  ? "bg-sky-500/10 border-sky-500/50 text-zinc-100"
                  : "bg-zinc-950/60 border-zinc-800 text-zinc-400 hover:border-zinc-700"
              }`}
            >
              <div className="text-xs font-semibold">{m.title}</div>
              <div className="text-[10px] text-zinc-400 mt-1">{m.desc}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
