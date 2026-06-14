import { useCallback, useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  AlertTriangle, CheckCircle2, Download, RefreshCw,
  Shield, ShieldAlert, ShieldX, SlidersHorizontal, X,
} from "lucide-react";
import {
  FileRecord, Finding, ScanResult, ScannerRule, UpdateRulesResult,
  listFiles, listRules, listVaults, scanFile, scanVault, toggleRule, updateRules,
} from "@/lib/tauri";
import { Button } from "@/components/ui/Button";
import { RiskBadge } from "@/components/vault/RiskBadge";
import { toast } from "@/components/ui/Toast";
import { cn, formatDate } from "@/lib/utils";

type RiskFilter = "all" | "critical" | "high" | "medium" | "low" | "clean" | "unscanned";
type Panel = "findings" | "rules";

const SEVERITY_COLOR: Record<string, string> = {
  critical: "text-red-400",
  high:     "text-orange-400",
  medium:   "text-yellow-400",
  low:      "text-blue-400",
};

const SEVERITY_BG: Record<string, string> = {
  critical: "bg-red-900/30 border-red-800/50",
  high:     "bg-orange-900/30 border-orange-800/50",
  medium:   "bg-yellow-900/30 border-yellow-800/50",
  low:      "bg-blue-900/30 border-blue-800/50",
};

export function ScannerPage() {
  const [vaultId, setVaultId] = useState<string | null>(null);
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [selected, setSelected] = useState<FileRecord | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [filter, setFilter] = useState<RiskFilter>("all");
  const [scanning, setScanning] = useState<{ done: number; total: number } | null>(null);
  const [scanningFileId, setScanningFileId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [panel, setPanel] = useState<Panel>("findings");
  const [rules, setRules] = useState<ScannerRule[]>([]);
  const [updatingRules, setUpdatingRules] = useState(false);

  useEffect(() => {
    listVaults().then((v) => { if (v.length > 0) setVaultId(v[0].id); }).catch(() => {});
    loadRules();
  }, []);

  useEffect(() => {
    if (!vaultId) return;
    setLoading(true);
    listFiles(vaultId).then(setFiles).catch(() => {}).finally(() => setLoading(false));
  }, [vaultId]);

  useEffect(() => {
    if (!selected?.scan_findings) { setFindings([]); return; }
    try { setFindings(JSON.parse(selected.scan_findings)); } catch { setFindings([]); }
  }, [selected?.id, selected?.scan_findings]);

  const loadRules = () => listRules().then(setRules).catch(() => {});

  const stats = {
    critical:  files.filter((f) => f.risk_level === "critical").length,
    high:      files.filter((f) => f.risk_level === "high").length,
    medium:    files.filter((f) => f.risk_level === "medium").length,
    low:       files.filter((f) => f.risk_level === "low").length,
    clean:     files.filter((f) => f.risk_level === "clean").length,
    unscanned: files.filter((f) => !f.last_scanned_at).length,
  };

  const filtered = files.filter((f) => {
    if (filter === "all") return true;
    if (filter === "unscanned") return !f.last_scanned_at;
    return f.risk_level === filter;
  });

  const handleScanVault = useCallback(async (rescan = false) => {
    if (!vaultId) return;
    setScanning({ done: 0, total: 0 });
    const unlisten = await listen<{ done: number; total: number; file_id: string }>(
      "scan-progress",
      (e) => setScanning({ done: e.payload.done, total: e.payload.total })
    );
    try {
      const count = await scanVault(vaultId, rescan);
      const updated = await listFiles(vaultId);
      setFiles(updated);
      if (selected) {
        const refreshed = updated.find((f) => f.id === selected.id);
        if (refreshed) setSelected(refreshed);
      }
      toast(`${count} file${count !== 1 ? "s" : ""} scanned`, "success");
    } catch (e) {
      toast(`Scan failed: ${e}`);
    } finally {
      unlisten();
      setScanning(null);
    }
  }, [vaultId, selected]);

  const handleScanFile = async (file: FileRecord) => {
    setScanningFileId(file.id);
    try {
      const result: ScanResult = await scanFile(file.id);
      const updated = await listFiles(vaultId!);
      setFiles(updated);
      const refreshed = updated.find((f) => f.id === file.id);
      if (refreshed) setSelected(refreshed);
      toast(
        result.risk_level === "clean"
          ? "File is clean"
          : `${result.findings.length} finding${result.findings.length !== 1 ? "s" : ""} — ${result.risk_level}`,
        result.risk_level === "clean" ? "success" : undefined
      );
    } catch (e) {
      toast(`Scan failed: ${e}`);
    } finally {
      setScanningFileId(null);
    }
  };

  const handleUpdateRules = async () => {
    setUpdatingRules(true);
    try {
      const result: UpdateRulesResult = await updateRules();
      await loadRules();
      toast(
        `Rules updated — ${result.added} new, ${result.updated} updated, ${result.total} total`,
        "success"
      );
    } catch (e) {
      toast(`Failed to update rules: ${e}`);
    } finally {
      setUpdatingRules(false);
    }
  };

  const handleToggleRule = async (rule: ScannerRule) => {
    try {
      await toggleRule(rule.id, !rule.enabled);
      setRules((prev) => prev.map((r) => r.id === rule.id ? { ...r, enabled: !r.enabled } : r));
    } catch (e) {
      toast(`Failed to toggle rule: ${e}`);
    }
  };

  const enabledCount = rules.filter((r) => r.enabled).length;
  const gitleaksCount = rules.filter((r) => r.source === "gitleaks").length;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface)] shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Shield size={18} className="text-[var(--color-accent)]" />
            <h1 className="text-base font-semibold text-[var(--color-text-primary)]">Scanner</h1>
            <span className="text-xs text-[var(--color-text-muted)]">
              {enabledCount} rules active
              {gitleaksCount > 0 && (
                <span className="ml-1 text-[var(--color-accent)]">· {gitleaksCount} from Gitleaks</span>
              )}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={handleUpdateRules}
              disabled={updatingRules}
              title="Fetch latest detection rules from Gitleaks on GitHub"
            >
              <Download size={13} className={updatingRules ? "animate-bounce" : ""} />
              {updatingRules ? "Updating…" : "Update Rules"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => { setPanel("rules"); setSelected(null); }}
              title="Manage detection rules"
              className={panel === "rules" ? "text-[var(--color-accent)]" : ""}
            >
              <SlidersHorizontal size={13} />
              Rules
            </Button>
            <div className="w-px h-4 bg-[var(--color-border-subtle)]" />
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleScanVault(false)}
              disabled={!!scanning || !vaultId}
            >
              <Shield size={13} className={scanning ? "animate-pulse text-[var(--color-accent)]" : ""} />
              {scanning
                ? scanning.total > 0 ? `${scanning.done}/${scanning.total}` : "Starting…"
                : "Scan New"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => handleScanVault(true)}
              disabled={!!scanning || !vaultId}
            >
              <RefreshCw size={13} />
              Rescan All
            </Button>
          </div>
        </div>

        {scanning && scanning.total > 0 && (
          <div className="h-0.5 bg-[var(--color-surface-2)] mb-3 rounded-full overflow-hidden">
            <div
              className="h-full bg-[var(--color-accent)] transition-all duration-200"
              style={{ width: `${(scanning.done / scanning.total) * 100}%` }}
            />
          </div>
        )}

        <div className="flex items-center gap-2 flex-wrap">
          <StatChip label="All"       count={files.length}    active={filter === "all"}       onClick={() => setFilter("all")} />
          <StatChip label="Critical"  count={stats.critical}  active={filter === "critical"}  onClick={() => setFilter("critical")} color="text-red-400" />
          <StatChip label="High"      count={stats.high}      active={filter === "high"}      onClick={() => setFilter("high")}     color="text-orange-400" />
          <StatChip label="Medium"    count={stats.medium}    active={filter === "medium"}    onClick={() => setFilter("medium")}   color="text-yellow-400" />
          <StatChip label="Low"       count={stats.low}       active={filter === "low"}       onClick={() => setFilter("low")}      color="text-blue-400" />
          <StatChip label="Clean"     count={stats.clean}     active={filter === "clean"}     onClick={() => setFilter("clean")}    color="text-green-400" />
          {stats.unscanned > 0 && (
            <StatChip label="Unscanned" count={stats.unscanned} active={filter === "unscanned"} onClick={() => setFilter("unscanned")} />
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* File list */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-xs text-[var(--color-text-muted)]">Loading…</div>
          ) : filtered.length === 0 ? (
            <EmptyFilter filter={filter} onReset={() => setFilter("all")} />
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-[var(--color-surface)]">
                <tr className="border-b border-[var(--color-border-subtle)]">
                  <th className="px-4 py-2 text-left text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">File</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider w-24">Risk</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider w-32">Scanned</th>
                  <th className="px-4 py-2 w-16" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((file) => {
                  const name = file.title ?? file.path.split(/[/\\]/).pop() ?? file.path;
                  const isScanning = scanningFileId === file.id;
                  return (
                    <tr
                      key={file.id}
                      onClick={() => { setSelected(file); setPanel("findings"); }}
                      className={cn(
                        "group border-b border-[var(--color-border-subtle)] cursor-pointer transition-colors",
                        selected?.id === file.id && panel === "findings"
                          ? "bg-[var(--color-accent)]/10"
                          : "hover:bg-[var(--color-surface-2)]"
                      )}
                    >
                      <td className="px-4 py-2">
                        <span className="text-xs font-medium text-[var(--color-text-primary)] truncate block max-w-sm">{name}</span>
                      </td>
                      <td className="px-4 py-2">
                        {file.last_scanned_at
                          ? <RiskBadge risk={file.risk_level} />
                          : <span className="text-xs text-[var(--color-text-muted)] italic">—</span>}
                      </td>
                      <td className="px-4 py-2">
                        <span className="text-xs text-[var(--color-text-muted)]">
                          {file.last_scanned_at ? formatDate(file.last_scanned_at) : "Never"}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={isScanning}
                          onClick={(e) => { e.stopPropagation(); handleScanFile(file); }}
                        >
                          <Shield size={12} className={isScanning ? "animate-pulse text-[var(--color-accent)]" : ""} />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Right panel — Findings or Rules */}
        {panel === "findings" && selected && (
          <FindingsPanel
            file={selected}
            findings={findings}
            onClose={() => setSelected(null)}
            onRescan={() => handleScanFile(selected)}
            isScanning={scanningFileId === selected.id}
          />
        )}
        {panel === "rules" && (
          <RulesPanel
            rules={rules}
            onToggle={handleToggleRule}
            onClose={() => setPanel("findings")}
            onUpdate={handleUpdateRules}
            updating={updatingRules}
          />
        )}
      </div>
    </div>
  );
}

// ── Findings panel ────────────────────────────────────────────────────────────

function FindingsPanel({
  file, findings, onClose, onRescan, isScanning,
}: {
  file: FileRecord; findings: Finding[]; onClose: () => void;
  onRescan: () => void; isScanning: boolean;
}) {
  const name = file.title ?? file.path.split(/[/\\]/).pop() ?? file.path;
  return (
    <div className="w-80 shrink-0 border-l border-[var(--color-border-subtle)] bg-[var(--color-surface)] flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border-subtle)]">
        <span className="text-xs font-semibold text-[var(--color-text-primary)] truncate flex-1">{name}</span>
        <div className="flex items-center gap-1 ml-2 shrink-0">
          <Button size="sm" variant="ghost" onClick={onRescan} disabled={isScanning}>
            <RefreshCw size={12} className={isScanning ? "animate-spin" : ""} />
          </Button>
          <button onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] p-1">
            <X size={13} />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto px-4 py-3 space-y-4">
        <div className="flex items-center gap-2">
          <RiskIcon risk={file.risk_level} />
          <div>
            <div className="text-xs font-semibold text-[var(--color-text-primary)] capitalize">
              {file.risk_level ?? "Not scanned"}
            </div>
            <div className="text-xs text-[var(--color-text-muted)]">
              {findings.length} finding{findings.length !== 1 ? "s" : ""}
              {file.last_scanned_at && ` · ${formatDate(file.last_scanned_at)}`}
            </div>
          </div>
        </div>
        {findings.length === 0 && file.last_scanned_at && (
          <div className="flex items-center gap-2 text-xs text-green-400">
            <CheckCircle2 size={14} /> No sensitive content detected
          </div>
        )}
        {!file.last_scanned_at && (
          <p className="text-xs text-[var(--color-text-muted)] italic">Not scanned yet</p>
        )}
        {findings.map((f, i) => (
          <div key={i} className={cn("rounded border px-3 py-2 space-y-1", SEVERITY_BG[f.severity] ?? "bg-[var(--color-surface-2)] border-[var(--color-border-subtle)]")}>
            <div className="flex items-center justify-between">
              <span className={cn("text-xs font-semibold capitalize", SEVERITY_COLOR[f.severity])}>{f.severity}</span>
              <span className="text-xs text-[var(--color-text-muted)] tabular-nums">line {f.line}</span>
            </div>
            <div className="text-xs text-[var(--color-text-secondary)]">{f.description}</div>
            <div className="text-xs font-mono text-[var(--color-text-muted)] bg-black/20 px-2 py-0.5 rounded">{f.snippet}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Rules panel ───────────────────────────────────────────────────────────────

const SEVERITY_ORDER = ["critical", "high", "medium", "low"];

function RulesPanel({
  rules, onToggle, onClose, onUpdate, updating,
}: {
  rules: ScannerRule[]; onToggle: (r: ScannerRule) => void;
  onClose: () => void; onUpdate: () => void; updating: boolean;
}) {
  const [severityFilter, setSeverityFilter] = useState<string>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");

  const filtered = rules.filter((r) => {
    if (severityFilter !== "all" && r.severity !== severityFilter) return false;
    if (sourceFilter !== "all" && r.source !== sourceFilter) return false;
    return true;
  });

  const bySource = { builtin: rules.filter((r) => r.source === "builtin").length, gitleaks: rules.filter((r) => r.source === "gitleaks").length };

  return (
    <div className="w-96 shrink-0 border-l border-[var(--color-border-subtle)] bg-[var(--color-surface)] flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border-subtle)]">
        <div>
          <span className="text-xs font-semibold text-[var(--color-text-primary)]">Detection Rules</span>
          <span className="ml-2 text-xs text-[var(--color-text-muted)]">{rules.filter((r) => r.enabled).length}/{rules.length} enabled</span>
        </div>
        <div className="flex items-center gap-1">
          <Button size="sm" variant="ghost" onClick={onUpdate} disabled={updating} title="Fetch latest rules from Gitleaks">
            <Download size={12} className={updating ? "animate-bounce" : ""} />
          </Button>
          <button onClick={onClose} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] p-1">
            <X size={13} />
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="px-4 py-2 border-b border-[var(--color-border-subtle)] flex items-center gap-2 flex-wrap shrink-0">
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className="text-xs bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)] rounded px-2 py-0.5 text-[var(--color-text-secondary)]"
        >
          <option value="all">All severities</option>
          {SEVERITY_ORDER.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          className="text-xs bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)] rounded px-2 py-0.5 text-[var(--color-text-secondary)]"
        >
          <option value="all">All sources</option>
          <option value="builtin">Builtin ({bySource.builtin})</option>
          <option value="gitleaks">Gitleaks ({bySource.gitleaks})</option>
        </select>
        <span className="text-xs text-[var(--color-text-muted)]">{filtered.length} shown</span>
      </div>

      {/* Rule list */}
      <div className="flex-1 overflow-auto divide-y divide-[var(--color-border-subtle)]">
        {filtered.map((rule) => (
          <div
            key={rule.id}
            className={cn(
              "px-4 py-2.5 flex items-start gap-3 transition-opacity",
              !rule.enabled && "opacity-40"
            )}
          >
            <button
              onClick={() => onToggle(rule)}
              className={cn(
                "mt-0.5 w-8 h-4 rounded-full shrink-0 transition-colors relative",
                rule.enabled ? "bg-[var(--color-accent)]" : "bg-[var(--color-surface-2)]"
              )}
              title={rule.enabled ? "Disable rule" : "Enable rule"}
            >
              <span
                className={cn(
                  "absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform",
                  rule.enabled ? "left-4 translate-x-0" : "left-0.5"
                )}
              />
            </button>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className={cn("text-xs font-medium", SEVERITY_COLOR[rule.severity] ?? "text-[var(--color-text-muted)]")}>
                  {rule.severity}
                </span>
                <span className="text-xs text-[var(--color-text-muted)]">·</span>
                <span className="text-xs text-[var(--color-text-muted)]">{rule.source}</span>
              </div>
              <div className="text-xs text-[var(--color-text-secondary)] mt-0.5">{rule.description}</div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="px-4 py-8 text-center text-xs text-[var(--color-text-muted)]">No rules match</div>
        )}
      </div>

      {/* Footer — Gitleaks attribution */}
      <div className="px-4 py-2 border-t border-[var(--color-border-subtle)] shrink-0">
        <p className="text-xs text-[var(--color-text-muted)]">
          Gitleaks rules sourced from{" "}
          <span className="text-[var(--color-accent)]">github.com/gitleaks/gitleaks</span>
        </p>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function StatChip({ label, count, active, onClick, color }: {
  label: string; count: number; active: boolean; onClick: () => void; color?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors",
        active
          ? "bg-[var(--color-accent)]/15 text-[var(--color-accent)]"
          : "bg-[var(--color-surface-2)] text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
      )}
    >
      <span className={active ? "" : (color ?? "")}>{label}</span>
      <span className={cn("tabular-nums", active ? "text-[var(--color-accent)]" : "text-[var(--color-text-muted)]")}>{count}</span>
    </button>
  );
}

function RiskIcon({ risk }: { risk: string | null }) {
  if (!risk || risk === "clean") return <CheckCircle2 size={20} className="text-green-400 shrink-0" />;
  if (risk === "critical") return <ShieldX size={20} className="text-red-400 shrink-0" />;
  if (risk === "high") return <ShieldAlert size={20} className="text-orange-400 shrink-0" />;
  return <AlertTriangle size={20} className="text-yellow-400 shrink-0" />;
}

function EmptyFilter({ filter, onReset }: { filter: RiskFilter; onReset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-48 gap-2 text-center">
      <CheckCircle2 size={28} className="text-green-400" />
      <p className="text-sm text-[var(--color-text-secondary)]">
        No files with <span className="font-medium capitalize">{filter}</span> risk
      </p>
      <button onClick={onReset} className="text-xs text-[var(--color-accent)] hover:underline">Show all files</button>
    </div>
  );
}
