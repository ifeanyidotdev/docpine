import React from "react";

interface ConnectionSslTabProps {
  sslEnabled: boolean;
  rejectUnauthorized: boolean;
  caCertPath: string;
  setSslEnabled: (v: boolean) => void;
  setRejectUnauthorized: (v: boolean) => void;
  setCaCertPath: (v: string) => void;
}

export function ConnectionSslTab({
  sslEnabled,
  rejectUnauthorized,
  caCertPath,
  setSslEnabled,
  setRejectUnauthorized,
  setCaCertPath,
}: ConnectionSslTabProps) {
  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2.5 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={sslEnabled}
          onChange={(e) => setSslEnabled(e.target.checked)}
          className="rounded border-zinc-700 bg-zinc-950 text-emerald-500"
        />
        <span className="text-sm font-medium text-zinc-200">
          Enable SSL / TLS Encrypted Connection
        </span>
      </label>

      {sslEnabled && (
        <div className="space-y-4 pl-6 border-l border-zinc-800">
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={rejectUnauthorized}
              onChange={(e) => setRejectUnauthorized(e.target.checked)}
              className="rounded border-zinc-700 bg-zinc-950 text-emerald-500"
            />
            <span className="text-xs text-zinc-300">
              Verify Server Certificate (uncheck for self-signed certs)
            </span>
          </label>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-zinc-400">
              CA Certificate File Path (Optional)
            </label>
            <input
              type="text"
              value={caCertPath}
              onChange={(e) => setCaCertPath(e.target.value)}
              placeholder="/path/to/root-ca.pem"
              className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-200 focus:outline-none focus:border-emerald-500/60"
            />
          </div>
        </div>
      )}
    </div>
  );
}
