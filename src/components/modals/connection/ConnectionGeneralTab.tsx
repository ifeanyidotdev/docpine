import React, { useEffect, useRef, useState } from "react";
import {
  Link2,
  SlidersHorizontal,
  AlertCircle,
  ChevronDown,
  Check,
  Folder,
} from "lucide-react";
import type { DatabaseEngine, WorkspaceFolder } from "../../../types/docpine";

export type ConnectionMethod = "url" | "manual";

interface ConnectionGeneralTabProps {
  engine: DatabaseEngine;
  connectionMethod: ConnectionMethod;
  setConnectionMethod: (method: ConnectionMethod) => void;
  uriInput: string;
  setUriInput: (v: string) => void;
  uriParseStatus: { ok: boolean; message?: string } | null;
  name: string;
  host: string;
  port: number;
  username: string;
  password: string;
  defaultDatabase: string;
  folderId: string;
  folders: WorkspaceFolder[];
  setName: (v: string) => void;
  setHost: (v: string) => void;
  setPort: (v: number) => void;
  setUsername: (v: string) => void;
  setPassword: (v: string) => void;
  setDefaultDatabase: (v: string) => void;
  setFolderId: (v: string) => void;
}

function urlPlaceholderFor(engine: DatabaseEngine): string {
  switch (engine) {
    case "postgres":
      return "postgresql://user:password@localhost:5432/mydb?sslmode=require";
    case "mysql":
      return "mysql://root:password@localhost:3306/mydb";
    case "mongodb":
      return "mongodb+srv://user:password@cluster.mongodb.net/mydb";
  }
}

export function ConnectionGeneralTab({
  engine,
  connectionMethod,
  setConnectionMethod,
  uriInput,
  setUriInput,
  uriParseStatus,
  name,
  host,
  port,
  username,
  password,
  defaultDatabase,
  folderId,
  folders,
  setName,
  setHost,
  setPort,
  setUsername,
  setPassword,
  setDefaultDatabase,
  setFolderId,
}: ConnectionGeneralTabProps) {
  const [folderMenuOpen, setFolderMenuOpen] = useState(false);
  const folderMenuRef = useRef<HTMLDivElement>(null);

  const selectedFolder = folders.find((f) => f.id === folderId) || null;

  useEffect(() => {
    if (!folderMenuOpen) return;
    const handleOutsideClick = (e: MouseEvent) => {
      if (
        folderMenuRef.current &&
        !folderMenuRef.current.contains(e.target as Node)
      ) {
        setFolderMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setFolderMenuOpen(false);
    };
    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [folderMenuOpen]);

  return (
    <div className="space-y-5">
      {/* Workspace Name & Optional Folder */}
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2 space-y-1.5">
          <label className="text-xs font-medium text-zinc-300">
            Workspace Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Core Billing Prod, Local Dev..."
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-emerald-500/60"
          />
        </div>
        <div className="space-y-1.5" ref={folderMenuRef}>
          <label className="text-xs font-medium text-zinc-300">
            Folder (Optional)
          </label>
          <div className="relative">
            <button
              type="button"
              onClick={() => setFolderMenuOpen((prev) => !prev)}
              className={`w-full px-3 py-2 rounded-xl bg-zinc-950 border text-sm flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                folderMenuOpen
                  ? "border-emerald-500/60 text-zinc-100"
                  : "border-zinc-800 hover:border-zinc-700 text-zinc-100"
              }`}
            >
              <span className="flex items-center gap-2 min-w-0">
                {selectedFolder ? (
                  <>
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: selectedFolder.color }}
                    />
                    <span className="truncate text-zinc-100">
                      {selectedFolder.name}
                    </span>
                  </>
                ) : (
                  <>
                    <Folder className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                    <span className="truncate text-zinc-400">No Folder</span>
                  </>
                )}
              </span>
              <ChevronDown
                className={`w-3.5 h-3.5 text-zinc-500 shrink-0 transition-transform duration-150 ${
                  folderMenuOpen ? "rotate-180 text-zinc-300" : ""
                }`}
              />
            </button>

            {folderMenuOpen && (
              <div className="absolute right-0 mt-1.5 w-full min-w-[180px] max-h-52 overflow-y-auto rounded-xl bg-zinc-900 border border-zinc-800 shadow-2xl py-1 z-40">
                <button
                  type="button"
                  onClick={() => {
                    setFolderId("");
                    setFolderMenuOpen(false);
                  }}
                  className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                    !selectedFolder
                      ? "bg-emerald-500/10 text-emerald-300 font-medium"
                      : "text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-200"
                  }`}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <Folder className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                    <span className="truncate">No Folder</span>
                  </span>
                  {!selectedFolder && (
                    <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  )}
                </button>

                {folders.length > 0 && (
                  <div className="my-1 border-t border-zinc-800/80" />
                )}

                {folders.map((f) => {
                  const isSelected = folderId === f.id;
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => {
                        setFolderId(f.id);
                        setFolderMenuOpen(false);
                      }}
                      className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                        isSelected
                          ? "bg-emerald-500/10 text-emerald-300 font-medium"
                          : "text-zinc-200 hover:bg-zinc-800/80 hover:text-white"
                      }`}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: f.color }}
                        />
                        <span className="truncate">{f.name}</span>
                      </span>
                      {isSelected && (
                        <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Connection Method Segmented Toggle */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-zinc-300">
          Connection Method
        </label>
        <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-zinc-950 border border-zinc-800">
          <button
            type="button"
            onClick={() => setConnectionMethod("url")}
            className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              connectionMethod === "url"
                ? "bg-zinc-800 text-zinc-100 shadow-xs"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <Link2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>Connection URL</span>
          </button>

          <button
            type="button"
            onClick={() => setConnectionMethod("manual")}
            className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-medium transition-all cursor-pointer ${
              connectionMethod === "manual"
                ? "bg-zinc-800 text-zinc-100 shadow-xs"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-sky-400" />
            <span>Manual Credentials</span>
          </button>
        </div>
      </div>

      {/* Method Body */}
      {connectionMethod === "url" ? (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-300">
              Connection URL
            </label>
            <textarea
              rows={3}
              value={uriInput}
              onChange={(e) => setUriInput(e.target.value)}
              placeholder={urlPlaceholderFor(engine)}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              className="w-full px-3.5 py-2.5 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:border-emerald-500/60 resize-none leading-relaxed"
            />
          </div>

          {/* Inline Error only if URL is invalid */}
          {uriInput.trim() && uriParseStatus && !uriParseStatus.ok && (
            <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span className="break-all">
                {uriParseStatus.message || "Invalid connection URL"}
              </span>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
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
              <label className="text-xs font-medium text-zinc-300">
                Username
              </label>
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
                Password (Keychain)
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
      )}
    </div>
  );
}
