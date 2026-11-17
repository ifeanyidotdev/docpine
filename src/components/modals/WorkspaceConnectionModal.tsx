import React, { useEffect, useState } from "react";
import {
  X,
  Link2,
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
import { ConnectionGeneralTab } from "./connection/ConnectionGeneralTab";
import { ConnectionRulesTab } from "./connection/ConnectionRulesTab";
import { ConnectionSslTab } from "./connection/ConnectionSslTab";
import { ConnectionSshTab } from "./connection/ConnectionSshTab";
import type {
  CommitMode,
  DatabaseEngine,
  EnvironmentTag,
  SafetyMode,
  SaveWorkspaceInput,
  SshAuthMethod,
} from "../../types/docpine";

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
      await ipc.testWorkspaceConnection(buildInputPayload());
      setTestResult({
        ok: true,
        message: "Connection verified successfully",
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
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
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
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
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
        <div className="p-6 overflow-y-auto flex-1">
          {activeSection === "general" && (
            <ConnectionGeneralTab
              engine={engine}
              name={name}
              host={host}
              port={port}
              username={username}
              password={password}
              defaultDatabase={defaultDatabase}
              onEngineSwitch={handleEngineSwitch}
              setName={setName}
              setHost={setHost}
              setPort={setPort}
              setUsername={setUsername}
              setPassword={setPassword}
              setDefaultDatabase={setDefaultDatabase}
            />
          )}

          {activeSection === "rules" && (
            <ConnectionRulesTab
              environment={environment}
              accentColor={accentColor}
              commitMode={commitMode}
              safetyMode={safetyMode}
              setEnvironment={setEnvironment}
              setAccentColor={setAccentColor}
              setCommitMode={setCommitMode}
              setSafetyMode={setSafetyMode}
            />
          )}

          {activeSection === "ssl" && (
            <ConnectionSslTab
              sslEnabled={sslEnabled}
              rejectUnauthorized={rejectUnauthorized}
              caCertPath={caCertPath}
              setSslEnabled={setSslEnabled}
              setRejectUnauthorized={setRejectUnauthorized}
              setCaCertPath={setCaCertPath}
            />
          )}

          {activeSection === "ssh" && (
            <ConnectionSshTab
              sshEnabled={sshEnabled}
              sshHost={sshHost}
              sshPort={sshPort}
              sshUser={sshUser}
              sshAuthMethod={sshAuthMethod}
              sshPassword={sshPassword}
              sshKeyPath={sshKeyPath}
              sshPassphrase={sshPassphrase}
              setSshEnabled={setSshEnabled}
              setSshHost={setSshHost}
              setSshPort={setSshPort}
              setSshUser={setSshUser}
              setSshAuthMethod={setSshAuthMethod}
              setSshPassword={setSshPassword}
              setSshKeyPath={setSshKeyPath}
              setSshPassphrase={setSshPassphrase}
            />
          )}

          {/* Test Connection Banner */}
          {testResult && (
            <div
              className={`mt-4 p-3 rounded-xl border text-xs flex items-center gap-2 ${
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
              className="px-3.5 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
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
