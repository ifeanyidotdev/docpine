import React, { useEffect, useState } from "react";
import {
  X,
  Link2,
  Shield,
  Terminal,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Lock,
  KeyRound,
} from "lucide-react";
import { useWorkspaceStore } from "../../store/useWorkspaceStore";
import { ipc, parseAppError } from "../../lib/ipc";
import type {
  CommitMode,
  DatabaseEngine,
  EnvironmentTag,
  SafetyMode,
  SaveWorkspaceInput,
  SshAuthMethod,
} from "../../types/docpine";

const ENV_PRESETS: Record<EnvironmentTag, { label: string; color: string }> = {
  production: { label: "Production", color: "#ef4444" },
  staging: { label: "Staging", color: "#f59e0b" },
  development: { label: "Development", color: "#10b981" },
  local: { label: "Local", color: "#6366f1" },
};

export function WorkspaceConnectionModal() {
  const {
    connectionModalOpen,
    editingWorkspace,
    closeConnectionModal,
    saveWorkspace,
    selectWorkspace,
  } = useWorkspaceStore();

  const [activeSection, setActiveSection] = useState<
    "general" | "ssl" | "ssh" | "rules"
  >("general");

  const [name, setName] = useState("");
  const [engine, setEngine] = useState<DatabaseEngine>("postgres");
  const [host, setHost] = useState("localhost");
  const [port, setPort] = useState(5432);
  const [username, setUsername] = useState("postgres");
  const [password, setPassword] = useState("");
  const [defaultDatabase, setDefaultDatabase] = useState("postgres");
  const [connectionUri, setConnectionUri] = useState("");

  const [environment, setEnvironment] = useState<EnvironmentTag>("development");
  const [accentColor, setAccentColor] = useState("#10b981");
  const [commitMode, setCommitMode] = useState<CommitMode>("staged");
  const [safetyMode, setSafetyMode] = useState<SafetyMode>("safe");

  const [sslEnabled, setSslEnabled] = useState(false);
  const [rejectUnauthorized, setRejectUnauthorized] = useState(true);
  const [caCertPath, setCaCertPath] = useState("");

  const [sshEnabled, setSshEnabled] = useState(false);
  const [sshHost, setSshHost] = useState("");
  const [sshPort, setSshPort] = useState(22);
  const [sshUser, setSshUser] = useState("root");
  const [sshAuthMethod, setSshAuthMethod] = useState<SshAuthMethod>("password");
  const [sshPassword, setSshPassword] = useState("");
  const [sshKeyPath, setSshKeyPath] = useState("");
  const [sshPassphrase, setSshPassphrase] = useState("");

  const [uriInput, setUriInput] = useState("");
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (!connectionModalOpen) return;
    setTestResult(null);
    setActiveSection("general");

    if (editingWorkspace) {
      setName(editingWorkspace.name);
      setEngine(editingWorkspace.engine);
      setHost(editingWorkspace.host);
      setPort(editingWorkspace.port);
      setUsername(editingWorkspace.username);
      setDefaultDatabase(editingWorkspace.defaultDatabase);
      setConnectionUri(editingWorkspace.connectionUri || "");
      setUriInput(editingWorkspace.connectionUri || "");
      setEnvironment(editingWorkspace.environment);
      setAccentColor(editingWorkspace.accentColor);
      setCommitMode(editingWorkspace.commitMode);
      setSafetyMode(editingWorkspace.safetyMode);
      setSslEnabled(editingWorkspace.ssl.enabled);
      setRejectUnauthorized(editingWorkspace.ssl.rejectUnauthorized);
      setCaCertPath(editingWorkspace.ssl.caCertPath || "");
      setSshEnabled(editingWorkspace.ssh.enabled);
      setSshHost(editingWorkspace.ssh.host);
      setSshPort(editingWorkspace.ssh.port || 22);
      setSshUser(editingWorkspace.ssh.username);
      setSshAuthMethod(editingWorkspace.ssh.authMethod);
      setSshKeyPath(editingWorkspace.ssh.privateKeyPath || "");

      void ipc
        .getWorkspaceCredentials(editingWorkspace.id)
        .then((creds) => {
          setPassword(creds.dbPassword || "");
          setSshPassword(creds.sshPassword || "");
          setSshPassphrase(creds.sshPassphrase || "");
        })
        .catch(() => {});
    } else {
      setName("");
      setEngine("postgres");
      setHost("localhost");
      setPort(5432);
      setUsername("postgres");
      setPassword("");
      setDefaultDatabase("postgres");
      setConnectionUri("");
      setUriInput("");
      setEnvironment("development");
      setAccentColor("#10b981");
      setCommitMode("staged");
      setSafetyMode("safe");
      setSslEnabled(false);
      setRejectUnauthorized(true);
      setCaCertPath("");
      setSshEnabled(false);
      setSshHost("");
      setSshPort(22);
      setSshUser("ubuntu");
      setSshAuthMethod("password");
      setSshPassword("");
      setSshKeyPath("");
      setSshPassphrase("");
    }
  }, [connectionModalOpen, editingWorkspace]);

  if (!connectionModalOpen) return null;

  const handleEngineSwitch = (nextEngine: DatabaseEngine) => {
    setEngine(nextEngine);
    if (!editingWorkspace) {
      if (nextEngine === "postgres") {
        setPort(5432);
        setUsername("postgres");
        setDefaultDatabase("postgres");
      } else if (nextEngine === "mysql") {
        setPort(3306);
        setUsername("root");
        setDefaultDatabase("");
      } else {
        setPort(27017);
        setUsername("");
        setDefaultDatabase("admin");
      }
    }
  };

  const handleParseUri = async () => {
    if (!uriInput.trim()) return;
    try {
      const parsed = await ipc.parseUri(uriInput.trim());
      setEngine(parsed.engine);
      setHost(parsed.host);
      setPort(parsed.port);
      setUsername(parsed.username);
      if (parsed.password) setPassword(parsed.password);
      setDefaultDatabase(parsed.database);
      setSslEnabled(parsed.sslEnabled);
      setConnectionUri(parsed.rawUri);
      if (!name.trim()) {
        setName(`${parsed.database || parsed.host} (${parsed.engine})`);
      }
      setTestResult({
        ok: true,
        message: `Parsed ${parsed.engine.toUpperCase()} URI for ${parsed.host}:${parsed.port}`,
      });
    } catch (err) {
      const parsedErr = parseAppError(err);
      setTestResult({ ok: false, message: parsedErr.message });
    }
  };

  const buildInputPayload = (): SaveWorkspaceInput => ({
    id: editingWorkspace?.id ?? null,
    name: name.trim() || `${defaultDatabase || host} (${engine})`,
    engine,
    host: host.trim() || "localhost",
    port: Number(port) || 5432,
    username: username.trim(),
    defaultDatabase: defaultDatabase.trim(),
    connectionUri: connectionUri.trim() ? connectionUri.trim() : null,
    environment,
    accentColor,
    safetyMode,
    commitMode,
    ssl: {
      enabled: sslEnabled,
      rejectUnauthorized,
      caCertPath: caCertPath.trim() || null,
    },
    ssh: {
      enabled: sshEnabled,
      host: sshHost.trim(),
      port: Number(sshPort) || 22,
      username: sshUser.trim(),
      authMethod: sshAuthMethod,
      privateKeyPath: sshKeyPath.trim() || null,
    },
    credentials: {
      dbPassword: password || null,
      sshPassword: sshPassword || null,
      sshPassphrase: sshPassphrase || null,
    },
  });

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const latency = await ipc.testWorkspaceConnection(buildInputPayload());
      setTestResult({
        ok: true,
        message: `Connection verified in ${latency}ms`,
      });
    } catch (err) {
      const parsedErr = parseAppError(err);
      setTestResult({ ok: false, message: parsedErr.message });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async (connectImmediately: boolean) => {
    setSaving(true);
    setTestResult(null);
    try {
      const saved = await saveWorkspace(buildInputPayload());
      if (connectImmediately) {
        await selectWorkspace(saved.id);
      }
    } catch (err) {
      const parsedErr = parseAppError(err);
      setTestResult({ ok: false, message: parsedErr.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div
          className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between"
          style={{ borderTop: `3px solid ${accentColor}` }}
        >
          <div>
            <h2 className="text-base font-bold text-zinc-100">
              {editingWorkspace
                ? `Configure Workspace — ${editingWorkspace.name}`
                : "New Database Connection Workspace"}
            </h2>
            <p className="text-xs text-zinc-400">
              Configure credentials, URI, SSH tunnel, and workspace safety
              rules.
            </p>
          </div>
          <button
            onClick={closeConnectionModal}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* URI Quick-Parse Bar */}
        <div className="px-6 py-3 bg-zinc-950/70 border-b border-zinc-800/80 flex items-center gap-2">
          <Link2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <input
            type="text"
            value={uriInput}
            onChange={(e) => {
              setUriInput(e.target.value);
              if (e.target.value.startsWith("mongodb+srv://")) {
                setConnectionUri(e.target.value);
              }
            }}
            placeholder="Paste connection URI (postgres://, mysql://, mongodb://, mongodb+srv://)..."
            className="flex-1 bg-transparent text-xs font-mono text-zinc-200 placeholder:text-zinc-500 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => void handleParseUri()}
            className="px-3 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-emerald-300 border border-zinc-700 transition-colors"
          >
            Parse URI
          </button>
        </div>

        {/* Section Tabs */}
        <div className="px-6 pt-3 border-b border-zinc-800 flex items-center gap-4 text-xs font-medium">
          {(
            [
              { id: "general", label: "Connection & Engine", icon: Terminal },
              { id: "rules", label: "Workspace & Safety", icon: Sparkles },
              { id: "ssl", label: "SSL / TLS", icon: Lock },
              { id: "ssh", label: "SSH Tunnel", icon: KeyRound },
            ] as const
          ).map((tab) => {
            const Icon = tab.icon;
            const active = activeSection === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveSection(tab.id)}
                className={`flex items-center gap-1.5 pb-2.5 border-b-2 transition-colors ${
                  active
                    ? "border-emerald-400 text-emerald-300"
                    : "border-transparent text-zinc-400 hover:text-zinc-200"
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {activeSection === "general" && (
            <>
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
                      onClick={() => handleEngineSwitch(item.id)}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        engine === item.id
                          ? "bg-emerald-500/10 border-emerald-500/60 text-zinc-100"
                          : "bg-zinc-950/60 border-zinc-800 text-zinc-400 hover:border-zinc-700"
                      }`}
                    >
                      <div className="text-xs font-semibold">{item.title}</div>
                      <div className="text-[10px] text-zinc-500 mt-0.5">
                        {item.sub}
                      </div>
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
                    className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-sm font-mono text-zinc-100 focus:outline-none focus:border-emerald-500/60"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-300">
                    Port
                  </label>
                  <input
                    type="number"
                    value={port}
                    onChange={(e) => setPort(Number(e.target.value))}
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
                  className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-sm font-mono text-zinc-100 focus:outline-none focus:border-emerald-500/60"
                />
              </div>
            </>
          )}

          {activeSection === "rules" && (
            <>
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
                            : "bg-zinc-950/60 border-zinc-800 text-zinc-400"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: preset.color }}
                          />
                          <span className="text-xs font-semibold">
                            {preset.label}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Commit Mode */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-zinc-300">
                  Data Manipulation Commit Mode (toggleable anytime inside
                  workspace)
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setCommitMode("staged")}
                    className={`p-3.5 rounded-xl border text-left ${
                      commitMode === "staged"
                        ? "bg-emerald-500/10 border-emerald-500/50 text-zinc-100"
                        : "bg-zinc-950/60 border-zinc-800 text-zinc-400"
                    }`}
                  >
                    <div className="text-xs font-semibold">
                      Staged Changes (Recommended)
                    </div>
                    <p className="text-[11px] text-zinc-400 mt-1">
                      Inline edits, new rows/docs, and deletes are highlighted
                      locally. Review generated SQL/MQL and press ⌘S to apply
                      atomically.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCommitMode("immediate")}
                    className={`p-3.5 rounded-xl border text-left ${
                      commitMode === "immediate"
                        ? "bg-amber-500/10 border-amber-500/50 text-zinc-100"
                        : "bg-zinc-950/60 border-zinc-800 text-zinc-400"
                    }`}
                  >
                    <div className="text-xs font-semibold">
                      Immediate Auto-Commit
                    </div>
                    <p className="text-[11px] text-zinc-400 mt-1">
                      Every cell edit, document change, or deletion executes
                      immediately against the live database without staging.
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
                      className={`p-3 rounded-xl border text-left ${
                        safetyMode === m.id
                          ? "bg-sky-500/10 border-sky-500/50 text-zinc-100"
                          : "bg-zinc-950/60 border-zinc-800 text-zinc-400"
                      }`}
                    >
                      <div className="text-xs font-semibold">{m.title}</div>
                      <div className="text-[10px] text-zinc-400 mt-1">
                        {m.desc}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {activeSection === "ssl" && (
            <div className="space-y-4">
              <label className="flex items-center gap-2.5 cursor-pointer">
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
                  <label className="flex items-center gap-2.5 cursor-pointer">
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
                      className="w-full px-3.5 py-2 rounded-xl bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-200"
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {activeSection === "ssh" && (
            <div className="space-y-4">
              <label className="flex items-center gap-2.5 cursor-pointer">
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
                        className="w-full px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-100"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-zinc-400">SSH Port</label>
                      <input
                        type="number"
                        value={sshPort}
                        onChange={(e) => setSshPort(Number(e.target.value))}
                        className="w-full px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-100"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-xs text-zinc-400">
                        SSH Username
                      </label>
                      <input
                        type="text"
                        value={sshUser}
                        onChange={(e) => setSshUser(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-100"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-zinc-400">
                        Auth Method
                      </label>
                      <select
                        value={sshAuthMethod}
                        onChange={(e) =>
                          setSshAuthMethod(e.target.value as SshAuthMethod)
                        }
                        className="w-full px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs text-zinc-100"
                      >
                        <option value="password">Password</option>
                        <option value="private_key">Private Key File</option>
                      </select>
                    </div>
                  </div>

                  {sshAuthMethod === "password" ? (
                    <div className="space-y-1">
                      <label className="text-xs text-zinc-400">
                        SSH Password
                      </label>
                      <input
                        type="password"
                        value={sshPassword}
                        onChange={(e) => setSshPassword(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-100"
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
                          className="w-full px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-100"
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
                          className="w-full px-3 py-1.5 rounded-lg bg-zinc-950 border border-zinc-800 text-xs font-mono text-zinc-100"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Test Connection Banner */}
          {testResult && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                testResult.ok
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                  : "bg-rose-500/10 border-rose-500/30 text-rose-300"
              }`}
            >
              {testResult.ok ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span className="break-all">{testResult.message}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-zinc-950/90 border-t border-zinc-800 flex items-center justify-between gap-3">
          <button
            type="button"
            disabled={testing}
            onClick={() => void handleTestConnection()}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-200 transition-colors disabled:opacity-50"
          >
            {testing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Test Connection
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={closeConnectionModal}
              className="px-3.5 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:text-zinc-200"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSave(false)}
              className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-100 border border-zinc-700 transition-colors"
            >
              Save Workspace
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSave(true)}
              className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-xs font-semibold text-zinc-950 transition-colors"
            >
              Save &amp; Open Workspace
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
