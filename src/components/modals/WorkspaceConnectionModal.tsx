import React, { useEffect, useState } from "react";
import {
  X,
  Terminal,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Shield,
  ArrowLeft,
} from "lucide-react";
import { useWorkspaceStore } from "../../store/useWorkspaceStore";
import { ipc, parseAppError } from "../../lib/ipc";
import { engineFullName } from "../shell/WorkspaceRail";
import { ConnectionEngineStep } from "./connection/ConnectionEngineStep";
import {
  ConnectionGeneralTab,
  type ConnectionMethod,
} from "./connection/ConnectionGeneralTab";
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
    defaultFolderIdForNewWorkspace,
    folders,
    closeConnectionModal,
    saveWorkspace,
    selectWorkspace,
  } = useWorkspaceStore();

  const [step, setStep] = useState<"engine" | "configure">("engine");
  const [activeSection, setActiveSection] = useState<
    "connection" | "rules" | "security"
  >("connection");
  const [connectionMethod, setConnectionMethod] =
    useState<ConnectionMethod>("url");

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
  const [folderId, setFolderId] = useState<string>("");
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
  const [uriParseStatus, setUriParseStatus] = useState<{
    ok: boolean;
    message?: string;
  } | null>(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  useEffect(() => {
    if (!connectionModalOpen) return;
    setTestResult(null);
    setUriParseStatus(null);
    setActiveSection("connection");

    if (editingWorkspace) {
      setStep("configure");
      setConnectionMethod(editingWorkspace.connectionUri ? "url" : "manual");
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
      setFolderId(editingWorkspace.folderId || "");
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
      setStep("engine");
      setConnectionMethod("url");
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
      setFolderId(defaultFolderIdForNewWorkspace || "");
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
  }, [connectionModalOpen, editingWorkspace, defaultFolderIdForNewWorkspace]);

  // Live auto-parse when typing or pasting a Connection URL
  useEffect(() => {
    if (!connectionModalOpen || step !== "configure" || connectionMethod !== "url") {
      return;
    }
    const raw = uriInput.trim();
    if (!raw) {
      setUriParseStatus(null);
      setConnectionUri("");
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void ipc
        .parseUri(raw)
        .then((parsed) => {
          if (cancelled) return;
          setEngine(parsed.engine);
          setHost(parsed.host);
          setPort(parsed.port);
          setUsername(parsed.username);
          if (parsed.password) setPassword(parsed.password);
          setDefaultDatabase(parsed.database);
          setSslEnabled(parsed.sslEnabled);
          setConnectionUri(parsed.rawUri);
          setUriParseStatus({ ok: true });
        })
        .catch((err) => {
          if (cancelled) return;
          const parsedErr = parseAppError(err);
          setUriParseStatus({ ok: false, message: parsedErr.message });
        });
    }, 220);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [uriInput, connectionModalOpen, step, connectionMethod]);

  if (!connectionModalOpen) return null;

  const handleSelectEngine = (nextEngine: DatabaseEngine) => {
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
    setTestResult(null);
    setActiveSection("connection");
    setStep("configure");
  };

  const handleMethodChange = (nextMethod: ConnectionMethod) => {
    setConnectionMethod(nextMethod);
    setTestResult(null);
    if (nextMethod === "url" && !uriInput.trim() && host.trim()) {
      void ipc
        .buildUri({
          engine,
          host: host.trim(),
          port: Number(port) || 5432,
          username: username.trim(),
          password: password || null,
          database: defaultDatabase.trim(),
          sslEnabled,
        })
        .then((built) => setUriInput(built))
        .catch(() => {});
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
    connectionUri:
      connectionMethod === "url" && connectionUri.trim()
        ? connectionUri.trim()
        : null,
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
    folderId: folderId.trim() ? folderId.trim() : null,
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

  const securityActive = sslEnabled || sshEnabled;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={closeConnectionModal}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div
          className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between gap-3"
          style={{ borderTop: `3px solid ${accentColor}` }}
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {step === "configure" && !editingWorkspace && (
                <button
                  type="button"
                  onClick={() => setStep("engine")}
                  title="Change database engine"
                  className="p-1 -ml-1 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
              )}
              <h2 className="text-base font-bold text-zinc-100 truncate">
                {editingWorkspace
                  ? `Edit Workspace — ${editingWorkspace.name}`
                  : step === "engine"
                    ? "New Database Workspace"
                    : `Connect to ${engineFullName(engine)}`}
              </h2>
            </div>
            <p className="text-xs text-zinc-400 mt-0.5">
              {step === "engine"
                ? "Step 1 of 2 — Select your database engine"
                : editingWorkspace
                  ? "Update connection details, safety rules, or security."
                  : "Step 2 of 2 — Paste a connection URL or enter credentials"}
            </p>
          </div>
          <button
            type="button"
            onClick={closeConnectionModal}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Step 2 Compact Sub-Tabs */}
        {step === "configure" && (
          <div className="px-6 pt-3 border-b border-zinc-800 flex items-center gap-5 text-xs font-medium">
            {(
              [
                { id: "connection", label: "Connection", icon: Terminal },
                { id: "rules", label: "Safety & Rules", icon: Sparkles },
                { id: "security", label: "SSL & SSH", icon: Shield },
              ] as const
            ).map((tab) => {
              const Icon = tab.icon;
              const active = activeSection === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveSection(tab.id)}
                  className={`flex items-center gap-1.5 pb-2.5 border-b-2 transition-colors cursor-pointer ${
                    active
                      ? "border-emerald-400 text-emerald-300"
                      : "border-transparent text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                  {tab.id === "security" && securityActive && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1">
          {step === "engine" ? (
            <ConnectionEngineStep
              selectedEngine={engine}
              onSelectEngine={handleSelectEngine}
            />
          ) : (
            <>
              {activeSection === "connection" && (
                <ConnectionGeneralTab
                  engine={engine}
                  connectionMethod={connectionMethod}
                  setConnectionMethod={handleMethodChange}
                  uriInput={uriInput}
                  setUriInput={setUriInput}
                  uriParseStatus={uriParseStatus}
                  name={name}
                  host={host}
                  port={port}
                  username={username}
                  password={password}
                  defaultDatabase={defaultDatabase}
                  folderId={folderId}
                  folders={folders}
                  setName={setName}
                  setHost={setHost}
                  setPort={setPort}
                  setUsername={setUsername}
                  setPassword={setPassword}
                  setDefaultDatabase={setDefaultDatabase}
                  setFolderId={setFolderId}
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

              {activeSection === "security" && (
                <div className="space-y-6">
                  <ConnectionSslTab
                    sslEnabled={sslEnabled}
                    rejectUnauthorized={rejectUnauthorized}
                    caCertPath={caCertPath}
                    setSslEnabled={setSslEnabled}
                    setRejectUnauthorized={setRejectUnauthorized}
                    setCaCertPath={setCaCertPath}
                  />
                  <div className="border-t border-zinc-800/80 pt-5">
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
                  </div>
                </div>
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
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-zinc-950/90 border-t border-zinc-800 flex items-center justify-between gap-3">
          {step === "configure" ? (
            <>
              <button
                type="button"
                disabled={testing}
                onClick={() => void handleTestConnection()}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-200 transition-colors cursor-pointer disabled:opacity-50"
              >
                {testing && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Test Connection
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={closeConnectionModal}
                  className="px-3 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleSave(false)}
                  className="px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-semibold text-zinc-100 border border-zinc-700 transition-colors cursor-pointer disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => void handleSave(true)}
                  className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-xs font-semibold text-zinc-950 transition-colors cursor-pointer disabled:opacity-50"
                >
                  Save &amp; Connect
                </button>
              </div>
            </>
          ) : (
            <div className="w-full flex items-center justify-end">
              <button
                type="button"
                onClick={closeConnectionModal}
                className="px-3.5 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
