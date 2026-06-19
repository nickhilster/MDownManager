import { useState, useRef } from "react";
import { Play, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface HelpPageProps {
  onStartTour: () => void;
}

const SECTIONS = [
  { id: "vault",        label: "Vault" },
  { id: "scanner",      label: "Scanner" },
  { id: "agent-api",    label: "Agent API" },
  { id: "ai-summarize", label: "AI Summarize" },
  { id: "settings",     label: "Settings" },
  { id: "license",      label: "License" },
] as const;

type SectionId = (typeof SECTIONS)[number]["id"];

export function HelpPage({ onStartTour }: HelpPageProps) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<SectionId>("vault");
  const contentRef = useRef<HTMLDivElement>(null);

  const scrollTo = (id: SectionId) => {
    setActive(id);
    const el = contentRef.current?.querySelector(`#${id}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="flex h-full overflow-hidden bg-[var(--color-background)] text-[var(--color-text-secondary)]">

      {/* Left nav */}
      <nav className="w-44 shrink-0 border-r border-[var(--color-border-subtle)] bg-[var(--color-surface)] flex flex-col py-4 overflow-y-auto">
        <p className="px-4 mb-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">
          MDownManager
        </p>
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => scrollTo(s.id)}
            className={cn(
              "w-full text-left px-4 py-1.5 text-xs border-l-2 transition-colors",
              active === s.id
                ? "border-[var(--color-accent)] text-[var(--color-accent)] bg-[var(--color-accent)]/8"
                : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)]"
            )}
          >
            {s.label}
          </button>
        ))}
      </nav>

      {/* Content */}
      <div ref={contentRef} className="flex-1 overflow-y-auto px-10 py-8 max-w-3xl">
        <h1 className="text-lg font-semibold text-[var(--color-text-primary)] mb-1">
          MDownManager Help
        </h1>
        <p className="text-sm text-[var(--color-text-muted)] mb-5">
          Everything you need to use your safe Markdown vault.
        </p>

        {/* Search */}
        <input
          type="search"
          placeholder="Search help…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full mb-5 px-3 py-2 text-sm bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)] rounded-md text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] outline-none focus:border-[var(--color-accent)] transition-colors"
        />

        {/* Tour button */}
        <button
          onClick={onStartTour}
          className="inline-flex items-center gap-1.5 mb-8 px-3 py-1.5 text-xs font-medium rounded-md bg-[var(--color-accent)] text-white hover:opacity-90 transition-opacity"
        >
          <Play size={11} fill="currentColor" />
          Start guided tour
        </button>

        {/* ── Vault ── */}
        <Section id="vault" title="Vault" query={query} onVisible={() => setActive("vault")}>
          <p className="mb-3">
            The Vault is your library of Markdown files. MDownManager indexes every{" "}
            <Code>.md</Code> file in the folders you add and keeps them ready for AI agents to query.
          </p>
          <Sub>Risk badges</Sub>
          <p className="mb-2">Each file gets a risk badge after scanning:</p>
          <table className="w-full text-xs border-collapse mb-4">
            <thead>
              <tr>
                {["Badge", "Meaning", "Agent API access?"].map((h) => (
                  <th key={h} className="text-left text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] px-3 py-2 border border-[var(--color-border-subtle)]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="px-3 py-2 border border-[var(--color-border-subtle)]"><Badge color="green">Safe</Badge></td>
                <td className="px-3 py-2 border border-[var(--color-border-subtle)] text-[var(--color-text-muted)]">No secrets or PII detected</td>
                <td className="px-3 py-2 border border-[var(--color-border-subtle)] text-[var(--color-text-muted)]">Yes</td>
              </tr>
              <tr>
                <td className="px-3 py-2 border border-[var(--color-border-subtle)]"><Badge color="amber">Review</Badge></td>
                <td className="px-3 py-2 border border-[var(--color-border-subtle)] text-[var(--color-text-muted)]">Low-confidence finding, worth checking</td>
                <td className="px-3 py-2 border border-[var(--color-border-subtle)] text-[var(--color-text-muted)]">Yes (with warning)</td>
              </tr>
              <tr>
                <td className="px-3 py-2 border border-[var(--color-border-subtle)]"><Badge color="red">Blocked</Badge></td>
                <td className="px-3 py-2 border border-[var(--color-border-subtle)] text-[var(--color-text-muted)]">High-confidence secret or PII found</td>
                <td className="px-3 py-2 border border-[var(--color-border-subtle)] text-[var(--color-text-muted)]">No — excluded automatically</td>
              </tr>
            </tbody>
          </table>
          <Sub>Adding a folder</Sub>
          <p>Click <strong className="text-[var(--color-text-primary)]">Add Vault</strong> in the top bar and pick any folder. MDownManager scans all <Code>.md</Code> files recursively. Free tier supports one vault; paid tiers support unlimited vaults.</p>
          <Sub>Refreshing</Sub>
          <p>Click the refresh icon next to the vault name to re-index files added since the last scan.</p>
        </Section>

        {/* ── Scanner ── */}
        <Section id="scanner" title="Scanner" query={query} onVisible={() => setActive("scanner")}>
          <p className="mb-3">The Scanner inspects each Markdown file line-by-line against a library of regex rules looking for secrets, API keys, passwords, and PII.</p>
          <Sub>What gets flagged</Sub>
          <ul className="list-disc list-inside text-sm text-[var(--color-text-muted)] mb-3 space-y-1">
            {["API keys (AWS, Stripe, GitHub, Anthropic, OpenAI…)", "Private keys and certificates", "Connection strings with embedded passwords", "Email addresses in sensitive contexts", "Credit card and SSN patterns"].map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <Sub>Running a scan</Sub>
          <p>Open the Scanner tab and click <strong className="text-[var(--color-text-primary)]">Scan vault</strong>. Each file is checked against all enabled rules.</p>
          <Sub>Managing rules</Sub>
          <p>Toggle individual rules on or off in the Scanner rules list. Click <strong className="text-[var(--color-text-primary)]">Update rules</strong> to pull the latest rule set from the Teambotics CDN.</p>
        </Section>

        {/* ── Agent API ── */}
        <Section id="agent-api" title="Local Agent API" query={query} onVisible={() => setActive("agent-api")}>
          <p className="mb-3">
            MDownManager runs a local HTTP server at <Code>http://localhost:7734</Code>. IDE agents (Claude Code, Cursor, Copilot) can query it to read your safe, scanned Markdown files — blocked files are never served.
          </p>
          <InfoBox>
            Find your bearer token in <strong>Settings → Local Agent API</strong>.
          </InfoBox>
          <Sub>Endpoints</Sub>
          <Pre>{`GET /health                          — server status
GET /vaults                          — list vaults
GET /files?vault_id=<id>             — list safe files
GET /search?vault_id=<id>&q=<query>  — full-text search
GET /files/<id>/content              — raw Markdown`}</Pre>
          <Sub>Claude Code setup</Sub>
          <p className="mb-2">Add this to your <Code>CLAUDE.md</Code>:</p>
          <Pre>{`## MDownManager Vault
Safe Markdown is at http://localhost:7734.
Use: Authorization: Bearer <your-token>

GET /vaults             — list vaults
GET /files?vault_id=x   — list files
GET /search?vault_id=x&q=deployment  — search
GET /files/<id>/content — raw content`}</Pre>
        </Section>

        {/* ── AI Summarize ── */}
        <Section id="ai-summarize" title="AI Summarize" query={query} onVisible={() => setActive("ai-summarize")}>
          <p className="mb-3">Generate one-sentence summaries for each file using a cloud AI model. Summaries are stored locally and shown in the file detail panel.</p>
          <Sub>Setup</Sub>
          <p className="mb-2">Go to <strong className="text-[var(--color-text-primary)]">Settings → AI Provider Keys</strong> and add your API key for any supported provider:</p>
          <ul className="list-disc list-inside text-sm text-[var(--color-text-muted)] mb-3 space-y-1">
            {["Anthropic (Claude) — sk-ant-…", "OpenAI (GPT) — sk-…", "DeepSeek — sk-…", "Google (Gemini) — AIza…"].map((item) => (
              <li key={item}><Code>{item}</Code></li>
            ))}
          </ul>
          <p>Keys are stored in the local SQLite database. They are never sent to Teambotics.</p>
        </Section>

        {/* ── Settings ── */}
        <Section id="settings" title="Settings" query={query} onVisible={() => setActive("settings")}>
          <Sub>AI Provider Keys</Sub>
          <p>Paste your cloud AI key and click <strong className="text-[var(--color-text-primary)]">Save</strong>. Keys are masked after saving.</p>
          <Sub>Local Agent API</Sub>
          <p>Shows your bearer token and the local server endpoint.</p>
          <Sub>License</Sub>
          <p>Paste a license token here to activate Individual, Commercial, or Non-profit features.</p>
        </Section>

        {/* ── License ── */}
        <Section id="license" title="License" query={query} onVisible={() => setActive("license")}>
          <table className="w-full text-xs border-collapse mb-4">
            <thead>
              <tr>
                {["Tier", "Price", "Vaults", "Agent API", "Auto-scan"].map((h) => (
                  <th key={h} className="text-left text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] px-3 py-2 border border-[var(--color-border-subtle)]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[
                { tier: "Free",       price: "$0",        vaults: "1",         api: false, scan: false },
                { tier: "Individual", price: "$20 / yr",  vaults: "Unlimited", api: true,  scan: true },
                { tier: "Commercial", price: "$149 / yr", vaults: "Unlimited", api: true,  scan: true },
                { tier: "Non-profit", price: "$0",        vaults: "Unlimited", api: true,  scan: true },
              ].map((row) => (
                <tr key={row.tier}>
                  <td className="px-3 py-2 border border-[var(--color-border-subtle)] font-medium text-[var(--color-text-primary)]">{row.tier}</td>
                  <td className="px-3 py-2 border border-[var(--color-border-subtle)] text-[var(--color-text-muted)]">{row.price}</td>
                  <td className="px-3 py-2 border border-[var(--color-border-subtle)] text-[var(--color-text-muted)]">{row.vaults}</td>
                  <td className="px-3 py-2 border border-[var(--color-border-subtle)] text-[var(--color-text-muted)]">{row.api ? <Check size={12} className="text-green-400" /> : "—"}</td>
                  <td className="px-3 py-2 border border-[var(--color-border-subtle)] text-[var(--color-text-muted)]">{row.scan ? <Check size={12} className="text-green-400" /> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-sm text-[var(--color-text-muted)]">
            Non-profit applications: <a href="https://teambotics.app/nonprofit-application" target="_blank" rel="noopener noreferrer" className="text-[var(--color-accent)] hover:underline">teambotics.app/nonprofit-application</a>.
            Tokens are valid for 12 months.
          </p>
        </Section>
      </div>
    </div>
  );
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function Section({
  id, title, query, children, onVisible,
}: {
  id: string;
  title: string;
  query: string;
  children: React.ReactNode;
  onVisible: () => void;
}) {
  const hide = query.trim().length > 0 && !title.toLowerCase().includes(query.toLowerCase());
  if (hide) return null;
  return (
    <section
      id={id}
      className="pb-8 border-b border-[var(--color-border-subtle)] mb-8 last:border-0"
      ref={(el) => {
        if (!el) return;
        const observer = new IntersectionObserver(([e]) => { if (e.isIntersecting) onVisible(); }, { threshold: 0.4 });
        observer.observe(el);
        return () => observer.disconnect();
      }}
    >
      <h2 className="text-sm font-semibold text-[var(--color-text-primary)] mb-3 pb-2 border-b border-[var(--color-border-subtle)]">
        {title}
      </h2>
      <div className="text-sm leading-relaxed space-y-2">{children}</div>
    </section>
  );
}

function Sub({ children }: { children: React.ReactNode }) {
  return <h3 className="text-xs font-semibold text-[var(--color-accent)] mt-4 mb-1">{children}</h3>;
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="px-1.5 py-0.5 rounded text-[11px] font-mono bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)] text-[var(--color-text-primary)]">
      {children}
    </code>
  );
}

function Pre({ children }: { children: React.ReactNode }) {
  return (
    <pre className="my-2 p-3 rounded-md text-[11px] font-mono leading-5 overflow-x-auto bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)] text-[var(--color-text-primary)]">
      {children}
    </pre>
  );
}

function InfoBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="my-3 px-4 py-3 rounded-md bg-[var(--color-surface)] border border-[var(--color-border-subtle)] text-xs text-[var(--color-text-muted)]">
      {children}
    </div>
  );
}

function Badge({ color, children }: { color: "green" | "amber" | "red"; children: React.ReactNode }) {
  const cls = {
    green: "bg-green-500/15 text-green-400",
    amber: "bg-amber-500/15 text-amber-400",
    red:   "bg-red-500/15 text-red-400",
  }[color];
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium", cls)}>
      <span aria-hidden>●</span>{children}
    </span>
  );
}
