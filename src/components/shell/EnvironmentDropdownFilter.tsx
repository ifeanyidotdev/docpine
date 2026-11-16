import React, { useEffect, useRef, useState } from "react";
import { Filter, ChevronDown, Check } from "lucide-react";
import type { EnvironmentTag } from "../../types/docpine";

interface EnvironmentDropdownFilterProps {
  value: EnvironmentTag | "all";
  onChange: (env: EnvironmentTag | "all") => void;
}

interface EnvOption {
  id: EnvironmentTag | "all";
  label: string;
  dotColor?: string;
}

const ENV_OPTIONS: EnvOption[] = [
  { id: "all", label: "All Environments" },
  { id: "production", label: "Production", dotColor: "bg-rose-500" },
  { id: "staging", label: "Staging", dotColor: "bg-amber-500" },
  { id: "development", label: "Development", dotColor: "bg-emerald-500" },
  { id: "local", label: "Local", dotColor: "bg-indigo-500" },
];

export function EnvironmentDropdownFilter({
  value,
  onChange,
}: EnvironmentDropdownFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected =
    ENV_OPTIONS.find((opt) => opt.id === value) || ENV_OPTIONS[0];

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleOutsideClick);
      document.addEventListener("keydown", handleKeyDown);
    }

    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div className="relative inline-block text-left" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
          value !== "all"
            ? "bg-zinc-800 text-zinc-100 border-zinc-600 shadow-xs"
            : "bg-zinc-900/60 text-zinc-300 border-zinc-800/80 hover:bg-zinc-900 hover:border-zinc-700"
        }`}
      >
        {selected.dotColor ? (
          <span className={`w-2 h-2 rounded-full shrink-0 ${selected.dotColor}`} />
        ) : (
          <Filter className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
        )}
        <span>{selected.label}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-zinc-400 shrink-0 transition-transform duration-150 ${
            isOpen ? "rotate-180" : ""
          }`}
        />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1.5 w-48 rounded-xl bg-zinc-900 border border-zinc-800 shadow-xl py-1 z-30 animate-in fade-in zoom-in-95 duration-100">
          <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
            Environment
          </div>
          {ENV_OPTIONS.map((opt) => {
            const isSelected = value === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  onChange(opt.id);
                  setIsOpen(false);
                }}
                className={`w-full px-3 py-1.5 text-left text-xs flex items-center justify-between transition-colors cursor-pointer ${
                  isSelected
                    ? "bg-emerald-500/10 text-emerald-300 font-semibold"
                    : "text-zinc-300 hover:bg-zinc-800/80 hover:text-zinc-100"
                }`}
              >
                <div className="flex items-center gap-2">
                  {opt.dotColor ? (
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${opt.dotColor}`}
                    />
                  ) : (
                    <span className="w-2 h-2 rounded-full shrink-0 bg-zinc-600" />
                  )}
                  <span>{opt.label}</span>
                </div>
                {isSelected && (
                  <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
