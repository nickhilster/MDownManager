import { useEffect, useState } from "react";
import { BadgeCheck, Check, Copy, ExternalLink, Eye, EyeOff, KeyRound, Terminal, Zap } from "lucide-react";
import { CloudProvider, getApiKey, getCloudApiKey, setCloudApiKey } from "@/lib/tauri";
import { toast } from "@/components/ui/Toast";
import { useLicense } from "@/lib/licenseContext";

const API_BASE = "http://localhost:7734";

interface CloudProviderDef {
  id: CloudProvider;
  label: string;
  placeholder: string;
  docsUrl: string;
}

const CLOUD_PROVIDERS: CloudProviderDef[] = [
  { id: "anthropic", label: "Anthropic (Claude)", placeholder: "sk-ant-…", docsUrl: "https://console.anthropic.com/keys" },
  { id: "openai",    label: "OpenAI (GPT)",       placeholder: "sk-…",     docsUrl: "https://platform.openai.com/api-keys" },
  { id: "deepseek",  label: "DeepSeek",           placeholder: "sk-…",     docsUrl: "https://platform.deepseek.com/api_keys" },
  { id: "google",    label: "Google (Gemini)",    placeholder: "AIza…",    docsUrl: "https://aistudio.google.com/app/apikey" },
];

export function SettingsPage() {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [cloudKeys, setCloudKeys] = useState<Partial<Record<CloudProvider, string>>>({});
  const [saving, setSaving] = useState<CloudProvider | null>(null);
  const [showKey, setShowKey] = useState<Partial<Record<CloudProvider, boolean>>>({});

  const { license, refresh, deactivate, activate, gate } = useLicense();
  const [licenseToken, setLicenseToken] = useState("");
  const [activating, setActivating] = useState(false);
  const [deactivating, setDeactivating] = useState(false);

  useEffect(() => {
    getApiKey().then(setApiKey).catch(() => setApiKey(null));
    // Load existing cloud keys (masked — just check if set)
    CLOUD_PROVIDERS.forEach(({ id }) => {
      getCloudApiKey(id).then((k) => {
        if (k) setCloudKeys((prev) => ({ ...prev, [id]: k }));
      }).catch(() => {});
    });
  }, []);

  const handleSaveCloudKey = async (provider: CloudProvider) => {
    setSaving(provider);
    try {
      await setCloudApiKey(provider, cloudKeys[provider] ?? "");
      toast(`${CLOUD_PROVIDERS.find(p => p.id === provider)?.label} key saved`, "success");
    } catch (e) {
      toast(`Failed to save key: ${e}`);
    } finally {
      setSaving(null);
    }
  };

  const handleActivateLicense = async () => {
    if (!licenseToken.trim()) return;
    setActivating(true);
    try {
      await activate(licenseToken.trim());
      await refresh();
      setLicenseToken("");
      toast("License activated", "success");
    } catch (e) {
      toast(`Invalid license token: ${e}`);
    } finally {
      setActivating(false);
    }
  };

  const handleDeactivateLicense = async () => {
    setDeactivating(true);
    try {
      await deactivate();
      toast("License removed — reverted to Free", "success");
    } catch (e) {
      toast(`Failed to deactivate: ${e}`);
    } finally {
      setDeactivating(false);
    }
  };

  const copy = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const CopyButton = ({ text, id }: { text: string; id: string }) => (
    <button
      onClick={() => copy(text, id)}
      className="shrink-0 p-1 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)] transition-colors"
      title="Copy"
    >
      {copied === id ? <Check size={13} className="text-green-400" /> : <Copy size={13} />}
    </button>
  );

  const curlHeaders = apiKey ? `-H "Authorization: Bearer ${apiKey}"` : `-H "Authorization: Bearer <key>"`;

  const examples = [
    {
      label: "List vaults",
      cmd: `curl ${curlHeaders} ${API_BASE}/vaults`,
    },
    {
      label: "List files in a vault",
      cmd: `curl ${curlHeaders} "${API_BASE}/files?vault_id=<vault_id>"`,
    },
    {
      label: "Search across a vault",
      cmd: `curl ${curlHeaders} "${API_BASE}/search?vault_id=<vault_id>&q=deployment+guide"`,
    },
    {
      label: "Get file content",
      cmd: `curl ${curlHeaders} ${API_BASE}/files/<file_id>/content`,
    },
  ];

  return (
    <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">
      <div>
        <h1 className="text-lg font-semibold text-[var(--color-text-primary)] mb-1">Settings</h1>
        <p className="text-sm text-[var(--color-text-muted)]">
          Configure MDownManager and connect IDE agents via the local HTTP API.
        </p>
      </div>

      {/* Cloud API Keys */}
      <section data-tour-target="settings-ai-keys" className="space-y-4">
        <div className="flex items-center gap-2">
          <KeyRound size={15} className="text-[var(--color-accent)]" />
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)] uppercase tracking-wider">
            AI Provider Keys
          </h2>
        </div>
        <p className="text-sm text-[var(--color-text-muted)]">
          Add keys to unlock cloud models in the Summarize toolbar. Keys are stored locally in the app database.
        </p>
        <div className="space-y-3">
          {CLOUD_PROVIDERS.map(({ id, label, placeholder }) => (
            <div key={id} className="space-y-1">
              <label className="text-xs text-[var(--color-text-muted)]">{label}</label>
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type={showKey[id] ? "text" : "password"}
                    value={cloudKeys[id] ?? ""}
                    placeholder={placeholder}
                    onChange={(e) => setCloudKeys((prev) => ({ ...prev, [id]: e.target.value }))}
                    onKeyDown={(e) => e.key === "Enter" && handleSaveCloudKey(id)}
                    className="w-full text-xs font-mono bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)] rounded px-3 py-1.5 text-[var(--color-text-secondary)] pr-8 focus:outline-none focus:border-[var(--color-accent)]"
                  />
                  <button
                    onClick={() => setShowKey((prev) => ({ ...prev, [id]: !prev[id] }))}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
                    tabIndex={-1}
                  >
                    {showKey[id] ? <EyeOff size={12} /> : <Eye size={12} />}
                  </button>
                </div>
                <button
                  onClick={() => handleSaveCloudKey(id)}
                  disabled={saving === id}
                  className="shrink-0 text-xs px-3 py-1.5 rounded bg-[var(--color-accent)] text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {saving === id ? "Saving…" : "Save"}
                </button>
                {cloudKeys[id] && (
                  <button
                    onClick={() => {
                      setCloudKeys((prev) => ({ ...prev, [id]: "" }));
                      setCloudApiKey(id, "").catch(() => {});
                    }}
                    className="shrink-0 text-xs text-[var(--color-text-muted)] hover:text-red-400 transition-colors"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* API Access */}
      <section data-tour-target="settings-agent-api" className="space-y-4">
        <div className="flex items-center gap-2">
          <Zap size={15} className="text-[var(--color-accent)]" />
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)] uppercase tracking-wider">
            Local Agent API
          </h2>
        </div>
        <p className="text-sm text-[var(--color-text-muted)]">
          MDownManager runs a local HTTP server that IDE agents (Claude Code, Cursor, Copilot, etc.)
          can query to access your safe, scanned Markdown files.
        </p>

        {gate("agent_api") ? (
          <>
            <div className="space-y-3">
              <Field label="Endpoint">
                <div className="flex items-center gap-2 flex-1">
                  <code className="flex-1 text-xs font-mono text-[var(--color-text-secondary)] bg-[var(--color-surface-2)] px-3 py-1.5 rounded border border-[var(--color-border-subtle)]">
                    {API_BASE}
                  </code>
                  <CopyButton text={API_BASE} id="endpoint" />
                </div>
              </Field>

              <Field label="API Key">
                {apiKey ? (
                  <div className="flex items-center gap-2 flex-1">
                    <code className="flex-1 text-xs font-mono text-[var(--color-text-secondary)] bg-[var(--color-surface-2)] px-3 py-1.5 rounded border border-[var(--color-border-subtle)] truncate">
                      {apiKey}
                    </code>
                    <CopyButton text={apiKey} id="apikey" />
                  </div>
                ) : (
                  <span className="text-xs text-[var(--color-text-muted)] italic">Loading…</span>
                )}
              </Field>
            </div>
          </>
        ) : (
          <div className="rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-2)] px-4 py-3">
            <p className="text-sm text-[var(--color-text-muted)]">
              The Local Agent API is available on <strong className="text-[var(--color-text-secondary)]">Commercial</strong> and <strong className="text-[var(--color-text-secondary)]">Non-profit</strong> licenses.
            </p>
            <a
              href="https://teambotics.com/mdownmanager"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-block text-xs text-[var(--color-accent)] hover:underline"
            >
              Upgrade →
            </a>
          </div>
        )}
      </section>

      {/* Example usage */}
      {gate("agent_api") && (
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Terminal size={15} className="text-[var(--color-accent)]" />
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)] uppercase tracking-wider">
              Example Requests
            </h2>
          </div>

          <div className="space-y-3">
            {examples.map((ex) => (
              <div key={ex.label}>
                <div className="text-xs text-[var(--color-text-muted)] mb-1">{ex.label}</div>
                <div className="flex items-start gap-2">
                  <pre className="flex-1 text-xs font-mono text-[var(--color-text-secondary)] bg-[var(--color-surface-2)] px-3 py-2 rounded border border-[var(--color-border-subtle)] overflow-auto whitespace-pre-wrap break-all">
                    {ex.cmd}
                  </pre>
                  <CopyButton text={ex.cmd} id={ex.label} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Claude Code snippet */}
      {gate("agent_api") && (
        <section className="space-y-4">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)] uppercase tracking-wider">
            Claude Code Integration
          </h2>
          <p className="text-sm text-[var(--color-text-muted)]">
            Add this to your <code className="text-xs bg-[var(--color-surface-2)] px-1 py-0.5 rounded">CLAUDE.md</code> or paste
            it into a Claude Code conversation:
          </p>
          <div className="flex items-start gap-2">
            <pre className="flex-1 text-xs font-mono text-[var(--color-text-secondary)] bg-[var(--color-surface-2)] px-3 py-3 rounded border border-[var(--color-border-subtle)] whitespace-pre-wrap">
{`# MDownManager Vault
Safe Markdown files are available at http://localhost:7734.
Use Authorization: Bearer ${apiKey ?? "<api-key>"} on every request.

GET /vaults                      — list vaults
GET /files?vault_id=<id>         — list files
GET /search?vault_id=<id>&q=...  — FTS search
GET /files/<id>/content          — raw Markdown`}
            </pre>
            <CopyButton
              text={`# MDownManager Vault\nSafe Markdown files are available at http://localhost:7734.\nUse Authorization: Bearer ${apiKey ?? "<api-key>"} on every request.\n\nGET /vaults                      — list vaults\nGET /files?vault_id=<id>         — list files\nGET /search?vault_id=<id>&q=...  — FTS search\nGET /files/<id>/content          — raw Markdown`}
              id="claude-md"
            />
          </div>
        </section>
      )}

      {/* License */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <BadgeCheck size={15} className="text-[var(--color-accent)]" />
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)] uppercase tracking-wider">
            License
          </h2>
        </div>

        {license.tier === "free" ? (
          <div className="space-y-3">
            <p className="text-sm text-[var(--color-text-muted)]">
              Running on the <strong className="text-[var(--color-text-secondary)]">Free</strong> tier — limited to 1 vault.
              Upgrade for unlimited vaults and priority support.
            </p>
            <div className="flex flex-col gap-1.5">
              <a href="https://teambotics.lemonsqueezy.com/buy/individual" target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-accent)] hover:underline">
                Individual — $20 / year (unlimited vaults)
              </a>
              <a href="https://teambotics.lemonsqueezy.com/buy/commercial" target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--color-accent)] hover:underline">
                Commercial — $149 / year (up to 10 seats)
              </a>
              <a href="https://teambotics.app/nonprofit-application" target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-xs text-[var(--color-text-muted)] hover:underline">
                Non-profit? Apply for free access →
              </a>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={licenseToken}
                placeholder="Paste license token…"
                onChange={(e) => setLicenseToken(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleActivateLicense()}
                className="flex-1 text-xs font-mono bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)] rounded px-3 py-1.5 text-[var(--color-text-secondary)] focus:outline-none focus:border-[var(--color-accent)]"
              />
              <button
                onClick={handleActivateLicense}
                disabled={activating || !licenseToken.trim()}
                className="shrink-0 text-xs px-3 py-1.5 rounded bg-[var(--color-accent)] text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {activating ? "Activating…" : "Activate"}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--color-accent)]/15 text-[var(--color-accent)] font-medium capitalize">
                {license.tier === "nonprofit" ? "Non-profit" : "Commercial"}
              </span>
              <span className="text-xs text-[var(--color-text-muted)]">license active</span>
            </div>
            {license.org_name && (
              <p className="text-xs text-[var(--color-text-muted)]">
                Licensed to: <span className="text-[var(--color-text-secondary)]">{license.org_name}</span>
              </p>
            )}
            {license.expires_at && (
              <p className="text-xs text-[var(--color-text-muted)]">
                Expires:{" "}
                <span className="text-[var(--color-text-secondary)]">
                  {new Date(license.expires_at * 1000).toLocaleDateString()}
                </span>
              </p>
            )}
            <button
              onClick={handleDeactivateLicense}
              disabled={deactivating}
              className="text-xs text-[var(--color-text-muted)] hover:text-red-400 transition-colors disabled:opacity-50"
            >
              {deactivating ? "Removing…" : "Remove license"}
            </button>
          </div>
        )}
      </section>

      {/* Health check */}
      <section>
        <p className="text-xs text-[var(--color-text-muted)]">
          Check server: <code className="bg-[var(--color-surface-2)] px-1 py-0.5 rounded">curl {API_BASE}/health</code>
        </p>
      </section>

      {/* Teambotics credit footer */}
      <div className="border-t border-[var(--color-border-subtle)] pt-6 flex items-center gap-3">
        <div className="w-6 h-6 rounded bg-[var(--color-surface-2)] flex items-center justify-center shrink-0">
          <div className="w-3 h-3 rounded-[3px] bg-[var(--color-accent)] opacity-60" />
        </div>
        <div>
          <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
            {license.tier === "nonprofit"
              ? `Non-profit license${license.org_name ? ` · Licensed to ${license.org_name}` : ""}`
              : license.tier === "commercial"
              ? "Commercial license"
              : "Free"}{" "}
            · Powered by{" "}
            <a
              href="https://teambotics.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[var(--color-accent)] hover:underline inline-flex items-center gap-0.5"
            >
              Teambotics
              <ExternalLink size={10} className="inline" />
            </a>
          </p>
          <p className="text-[10px] text-[var(--color-text-muted)] opacity-50 mt-0.5">
            MDownManager v{__APP_VERSION__}
          </p>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-[var(--color-text-muted)] w-16 shrink-0">{label}</span>
      <div className="flex items-center gap-2 flex-1 min-w-0">{children}</div>
    </div>
  );
}
