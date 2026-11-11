import React from "react";
import { Database } from "lucide-react";

export default function App() {
  return (
    <div className="h-screen w-screen flex items-center justify-center bg-zinc-950 text-zinc-100">
      <div className="flex items-center gap-3 px-6 py-4 rounded-xl bg-zinc-900/80 border border-zinc-800 shadow-2xl">
        <div className="p-2.5 rounded-lg bg-emerald-500/15 text-emerald-400">
          <Database className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Docpine</h1>
          <p className="text-xs text-zinc-400">
            SQL &amp; NoSQL Workspace Database Manager
          </p>
        </div>
      </div>
    </div>
  );
}
