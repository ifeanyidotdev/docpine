import React from "react";
import type { DatabaseEngine } from "../../../types/docpine";

interface ConnectionGeneralTabProps {
  engine: DatabaseEngine;
  name: string;
  host: string;
  port: number;
  username: string;
  password: string;
  defaultDatabase: string;
  onEngineSwitch: (engine: DatabaseEngine) => void;
  setName: (v: string) => void;
  setHost: (v: string) => void;
  setPort: (v: number) => void;
  setUsername: (v: string) => void;
  setPassword: (v: string) => void;
  setDefaultDatabase: (v: string) => void;
}

export function ConnectionGeneralTab({
  engine,
  name,
  host,
  port,
  username,
  password,
  defaultDatabase,
  onEngineSwitch,
  setName,
  setHost,
  setPort,
  setUsername,
  setPassword,
  setDefaultDatabase,
}: ConnectionGeneralTabProps) {
  return (
    <div className="space-y-4">
      {/* Engine Selector */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-zinc-300">
          Database Engine
        </label>
        <div className="grid grid-cols-3 gap-2.5">
          {(
            [
              {
                id: "postgres",
                title: "PostgreSQL",
                sub: "Relational SQL",
              },
              {
                id: "mysql",
                title: "MySQL / MariaDB",
                sub: "Relational SQL",
              },
              {
                id: "mongodb",
                title: "MongoDB",
                sub: "Document NoSQL",
              },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onEngineSwitch(item.id)}
              className={`p-3 rounded-xl border text-left transition-all ${
                engine === item.id
                  ? "bg-emerald-500/10 border-emerald-500/60 text-zinc-100"
                  : "bg-zinc-950/60 border-zinc-800 text-zinc-400 hover:border-zinc-700"
              }`}
            >
              <div className="text-xs font-semibold">{item.title}</div>
              <div className="text-[10px] text-zinc-500 mt-0.5">{item.sub}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Workspace Name */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-zinc-300">
          Workspace Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Core Billing Prod, Analytics Staging, Local Mongo..."
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-emerald-500/60"
        />
      </div>

      {/* Host & Port */}
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2 space-y-1.5">
          <label className="text-xs font-medium text-zinc-300">
            Host / Server Address
          </label>
          <input
            type="text"
            value={host}
            onChange={(e) => setHost(e.target.value)}
            placeholder="localhost or db.internal.net"
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-sm font-mono text-zinc-100 focus:outline-none focus:border-emerald-500/60"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-zinc-300">Port</label>
          <input
            type="number"
            value={port}
            onChange={(e) => setPort(Number(e.target.value))}
            autoComplete="off"
            className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-sm font-mono text-zinc-100 focus:outline-none focus:border-emerald-500/60"
          />
        </div>
      </div>

      {/* Username & Password */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-zinc-300">Username</label>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder={engine === "mongodb" ? "(optional)" : "root"}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-sm font-mono text-zinc-100 focus:outline-none focus:border-emerald-500/60"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-zinc-300">
            Password (stored in Keychain)
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="new-password"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-sm font-mono text-zinc-100 focus:outline-none focus:border-emerald-500/60"
          />
        </div>
      </div>

      {/* Default Database */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-zinc-300">
          Default Database
        </label>
        <input
          type="text"
          value={defaultDatabase}
          onChange={(e) => setDefaultDatabase(e.target.value)}
          placeholder={
            engine === "postgres"
              ? "postgres"
              : engine === "mongodb"
                ? "admin"
                : "my_app_db"
          }
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-sm font-mono text-zinc-100 focus:outline-none focus:border-emerald-500/60"
        />
      </div>
    </div>
  );
}
