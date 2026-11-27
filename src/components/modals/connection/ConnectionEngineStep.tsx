import React from "react";
import { ArrowRight, Database, Layers, Server } from "lucide-react";
import type { DatabaseEngine } from "../../../types/docpine";

interface ConnectionEngineStepProps {
  selectedEngine: DatabaseEngine;
  onSelectEngine: (engine: DatabaseEngine) => void;
}

const ENGINES: Array<{
  id: DatabaseEngine;
  name: string;
  category: string;
  defaultPort: number;
  accentBg: string;
  accentBorder: string;
  accentText: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    id: "postgres",
    name: "PostgreSQL",
    category: "Relational SQL",
    defaultPort: 5432,
    accentBg: "bg-sky-500/12",
    accentBorder: "border-sky-500/30 hover:border-sky-400/70",
    accentText: "text-sky-400",
    icon: Database,
  },
  {
    id: "mysql",
    name: "MySQL / MariaDB",
    category: "Relational SQL",
    defaultPort: 3306,
    accentBg: "bg-orange-500/12",
    accentBorder: "border-orange-500/30 hover:border-orange-400/70",
    accentText: "text-orange-400",
    icon: Server,
  },
  {
    id: "mongodb",
    name: "MongoDB",
    category: "Document NoSQL",
    defaultPort: 27017,
    accentBg: "bg-emerald-500/12",
    accentBorder: "border-emerald-500/30 hover:border-emerald-400/70",
    accentText: "text-emerald-400",
    icon: Layers,
  },
];

export function ConnectionEngineStep({
  selectedEngine,
  onSelectEngine,
}: ConnectionEngineStepProps) {
  return (
    <div className="grid grid-cols-1 gap-2.5">
      {ENGINES.map((item) => {
        const Icon = item.icon;
        const isCurrent = selectedEngine === item.id;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelectEngine(item.id)}
            className={`group w-full px-4 py-3.5 rounded-2xl bg-zinc-950/70 hover:bg-zinc-950 border text-left transition-all flex items-center justify-between gap-4 cursor-pointer ${
              isCurrent
                ? item.accentBorder
                : "border-zinc-800 hover:border-zinc-700"
            }`}
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <div
                className={`w-10 h-10 rounded-xl ${item.accentBg} border border-white/5 flex items-center justify-center shrink-0`}
              >
                <Icon className={`w-5 h-5 ${item.accentText}`} />
              </div>
              <div className="flex items-center gap-2.5 flex-wrap min-w-0">
                <span className="text-sm font-semibold text-zinc-100 group-hover:text-white">
                  {item.name}
                </span>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-medium bg-zinc-900 border border-zinc-800 text-zinc-400">
                  {item.category}
                </span>
                <span className="text-[10px] font-mono text-zinc-500">
                  :{item.defaultPort}
                </span>
              </div>
            </div>

            <ArrowRight className="w-4 h-4 text-zinc-600 group-hover:text-zinc-200 group-hover:translate-x-0.5 transition-all shrink-0" />
          </button>
        );
      })}
    </div>
  );
}
