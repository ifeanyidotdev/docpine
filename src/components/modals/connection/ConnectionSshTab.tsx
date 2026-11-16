import React from "react";
import type { SshAuthMethod } from "../../../types/docpine";

interface ConnectionSshTabProps {
  sshEnabled: boolean;
  sshHost: string;
  sshPort: number;
  sshUser: string;
  sshAuthMethod: SshAuthMethod;
  sshPassword: string;
  sshKeyPath: string;
  sshPassphrase: string;
  setSshEnabled: (v: boolean) => void;
  setSshHost: (v: string) => void;
  setSshPort: (v: number) => void;
  setSshUser: (v: string) => void;
  setSshAuthMethod: (v: SshAuthMethod) => void;
  setSshPassword: (v: string) => void;
  setSshKeyPath: (v: string) => void;
  setSshPassphrase: (v: string) => void;
}

export function ConnectionSshTab({
  sshEnabled,
  sshHost,
  sshPort,
  sshUser,
  sshAuthMethod,
  sshPassword,
  sshKeyPath,
  sshPassphrase,
  setSshEnabled,
  setSshHost,
  setSshPort,
  setSshUser,
  setSshAuthMethod,
  setSshPassword,
  setSshKeyPath,
  setSshPassphrase,
}: ConnectionSshTabProps) {
  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2.5 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={sshEnabled}
          onChange={(e) => setSshEnabled(e.target.checked)}
          className="rounded border-zinc-700 bg-zinc-950 text-emerald-500"
        />
        <span className="text-sm font-medium text-zinc-200">
          Connect through SSH Bastion Tunnel
        </span>
      </label>

      {sshEnabled && (
        <div className="space-y-3.5 pl-6 border-l border-zinc-800">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1">
              <label className="text-xs text-zinc-400">SSH Host</label>
              <input
                type="text"
                value={sshHost}
                onChange={(e) => setSshHost(e.target.value)}
                placeholder="bastion.example.com"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                className="w-full px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-100 focus:outline-none focus:border-emerald-500/60"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-zinc-400">SSH Port</label>
              <input
                type="number"
                value={sshPort}
                onChange={(e) => setSshPort(Number(e.target.value))}
                autoComplete="off"
                className="w-full px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-100 focus:outline-none focus:border-emerald-500/60"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs text-zinc-400">SSH Username</label>
              <input
                type="text"
                value={sshUser}
                onChange={(e) => setSshUser(e.target.value)}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                className="w-full px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-100 focus:outline-none focus:border-emerald-500/60"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-zinc-400">Auth Method</label>
              <select
                value={sshAuthMethod}
                onChange={(e) =>
                  setSshAuthMethod(e.target.value as SshAuthMethod)
                }
                className="w-full px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-100 focus:outline-none focus:border-emerald-500/60"
              >
                <option value="password">Password</option>
                <option value="private_key">Private Key File</option>
              </select>
            </div>
          </div>

          {sshAuthMethod === "password" ? (
            <div className="space-y-1">
              <label className="text-xs text-zinc-400">SSH Password</label>
              <input
                type="password"
                value={sshPassword}
                onChange={(e) => setSshPassword(e.target.value)}
                autoComplete="new-password"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                className="w-full px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-100 focus:outline-none focus:border-emerald-500/60"
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-zinc-400">
                  Private Key Path
                </label>
                <input
                  type="text"
                  value={sshKeyPath}
                  onChange={(e) => setSshKeyPath(e.target.value)}
                  placeholder="~/.ssh/id_ed25519"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  className="w-full px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-100 focus:outline-none focus:border-emerald-500/60"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-zinc-400">
                  Key Passphrase (Optional)
                </label>
                <input
                  type="password"
                  value={sshPassphrase}
                  onChange={(e) => setSshPassphrase(e.target.value)}
                  autoComplete="new-password"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  className="w-full px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-100 focus:outline-none focus:border-emerald-500/60"
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
