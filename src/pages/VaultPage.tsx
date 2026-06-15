import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { FolderPlus, Globe, RefreshCw, Search, Sparkles, Upload, X } from "lucide-react";
import {
  FileRecord,
  VaultRecord,
  addVault,
  importFiles,
  importGithubRepo,
  listAllModels,
  listFiles,
  listVaults,
  openFileInEditor,
  refreshVault,
  removeFile,
  removeVault,
  searchFiles,
  summarizeVault,
} from "@/lib/tauri";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { FileTable } from "@/components/vault/FileTable";
import { FileDetailPanel } from "@/components/vault/FileDetailPanel";
import { toast } from "@/components/ui/Toast";
import { useResizable } from "@/hooks/useResizable";
import { cn } from "@/lib/utils";
import { useLicense } from "@/lib/licenseContext";

interface SummarizeProgress {
  done: number;
  total: number;
}

export function VaultPage() {
  const [vaults, setVaults] = useState<VaultRecord[]>([]);
  const [activeVault, setActiveVault] = useState<VaultRecord | null>(null);
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [selectedFile, setSelectedFile] = useState<FileRecord | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>(() => localStorage.getItem("ai_model") ?? "");
  const [summarizing, setSummarizing] = useState<SummarizeProgress | null>(null);
  const [githubUrl, setGithubUrl] = useState("");
  const [showGithubDialog, setShowGithubDialog] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);
  const { width: panelWidth, onMouseDown: onResizeStart } = useResizable(380, 240, 700);
  const { license } = useLicense();

  // Initial load
  useEffect(() => {
    listVaults()
      .then((v) => {
        setVaults(v);
        if (v.length > 0) setActiveVault(v[0]);
      })
      .catch((e) => toast(`Failed to load vaults: ${e}`));

    listAllModels()
      .then((m) => {
        setModels(m);
        if (m.length > 0 && !localStorage.getItem("ai_model")) {
          setSelectedModel(m[0]);
        }
      })
      .catch(() => {}); // Ollama might be offline — silently ignore
  }, []);

  // Load files when vault changes
  useEffect(() => {
    if (!activeVault) return;
    setLoading(true);
    loadFiles(activeVault.id).finally(() => setLoading(false));
  }, [activeVault?.id]);

  const loadFiles = async (vaultId: string) => {
    try {
      const f = await listFiles(vaultId);
      setFiles(f);
    } catch (e) {
      toast(`Failed to load files: ${e}`);
    }
  };

  // ── Vault actions ────────────────────────────────────────────────────────

  const handleAddVault = async () => {
    if (license.tier === "free" && vaults.length >= 1) {
      toast("Free tier supports one vault. Upgrade to add more.");
      return;
    }
    try {
      const selected = await openDialog({ directory: true, multiple: false });
      if (!selected || typeof selected !== "string") return;
      const name = selected.split(/[/\\]/).pop() ?? "Vault";
      setLoading(true);
      const vault = await addVault(selected, name);
      const [updated, f] = await Promise.all([listVaults(), listFiles(vault.id)]);
      setVaults(updated);
      setFiles(f);
      setActiveVault(vault);
      toast(`Vault "${name}" added — ${f.length} file${f.length !== 1 ? "s" : ""} indexed`, "success");
    } catch (e) {
      toast(`Could not add vault: ${e}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveVault = async (vault: VaultRecord) => {
    if (!confirm(`Remove vault "${vault.name}"? Files on disk are NOT deleted.`)) return;
    try {
      await removeVault(vault.id);
      const updated = await listVaults();
      setVaults(updated);
      setActiveVault(updated[0] ?? null);
      setFiles([]);
      setSelectedFile(null);
      toast(`Vault "${vault.name}" removed`, "success");
    } catch (e) {
      toast(`Could not remove vault: ${e}`);
    }
  };

  const handleRemoveFile = async (file: FileRecord) => {
    try {
      await removeFile(file.id);
      setFiles((prev) => prev.filter((f) => f.id !== file.id));
      if (selectedFile?.id === file.id) setSelectedFile(null);
      toast("File removed from vault", "success");
    } catch (e) {
      toast(`Could not remove file: ${e}`);
    }
  };

  const handleRefresh = async () => {
    if (!activeVault) return;
    setLoading(true);
    try {
      const f = await refreshVault(activeVault.id, activeVault.path);
      setFiles(f);
      toast("Vault refreshed", "success");
    } catch (e) {
      toast(`Refresh failed: ${e}`);
    } finally {
      setLoading(false);
    }
  };

  const handleImportFiles = async () => {
    if (!activeVault) return;
    try {
      const selected = await openDialog({
        multiple: true,
        filters: [{ name: "Markdown", extensions: ["md"] }],
      });
      if (!selected) return;
      const paths = Array.isArray(selected) ? selected : [selected];
      setLoading(true);
      const added = await importFiles(activeVault.id, paths);
      await loadFiles(activeVault.id);
      toast(`Imported ${added.length} file${added.length !== 1 ? "s" : ""}`, "success");
    } catch (e) {
      toast(`Import failed: ${e}`);
    } finally {
      setLoading(false);
    }
  };

  const handleImportGithub = async () => {
    const url = githubUrl.trim();
    if (!url) return;
    setShowGithubDialog(false);
    setGithubUrl("");
    if (license.tier === "free" && vaults.length >= 1) {
      toast("Free tier supports one vault. Upgrade to add more.");
      return;
    }
    setLoading(true);
    try {
      const vault = await importGithubRepo(url);
      const [updated, f] = await Promise.all([listVaults(), listFiles(vault.id)]);
      setVaults(updated);
      setFiles(f);
      setActiveVault(vault);
      toast(`"${vault.name}" cloned — ${f.length} file${f.length !== 1 ? "s" : ""} indexed`, "success");
    } catch (e) {
      toast(`GitHub import failed: ${e}`);
    } finally {
      setLoading(false);
    }
  };

  // ── AI Summarize ─────────────────────────────────────────────────────────

  const handleSummarize = async () => {
    if (!activeVault || !selectedModel) {
      toast("Select an Ollama model first");
      return;
    }
    setSummarizing({ done: 0, total: 0 });

    const unlisten = await listen<{ done: number; total: number }>(
      "summarize-progress",
      (e) => setSummarizing({ done: e.payload.done, total: e.payload.total })
    );

    try {
      const count = await summarizeVault(activeVault.id, selectedModel);
      const f = await listFiles(activeVault.id);
      setFiles(f);
      // Update selected file if it's open
      if (selectedFile) {
        const updated = f.find((x) => x.id === selectedFile.id);
        if (updated) setSelectedFile({ ...updated, git_root_hint: activeVault.git_root });
      }
      toast(`${count} file${count !== 1 ? "s" : ""} newly summarized`, "success");
    } catch (e) {
      toast(`Summarization failed: ${e}`);
    } finally {
      unlisten();
      setSummarizing(null);
    }
  };

  // ── Search ───────────────────────────────────────────────────────────────

  const handleSearch = useCallback(
    async (q: string) => {
      if (!activeVault) return;
      try {
        if (!q.trim()) {
          await loadFiles(activeVault.id);
        } else {
          const results = await searchFiles(activeVault.id, q);
          setFiles(results);
        }
      } catch (e) {
        toast(`Search failed: ${e}`);
      }
    },
    [activeVault]
  );

  useEffect(() => {
    const t = setTimeout(() => handleSearch(search), 250);
    return () => clearTimeout(t);
  }, [search, handleSearch]);

  // ── Drag & drop ──────────────────────────────────────────────────────────

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true); };
  const handleDragLeave = () => setIsDragOver(false);
  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (!activeVault) return;
    const paths = Array.from(e.dataTransfer.files).map((f) => (f as any).path ?? f.name);
    if (!paths.length) return;
    setLoading(true);
    try {
      const added = await importFiles(activeVault.id, paths);
      await loadFiles(activeVault.id);
      toast(`Imported ${added.length} file${added.length !== 1 ? "s" : ""}`, "success");
    } catch (e) {
      toast(`Drop import failed: ${e}`);
    } finally {
      setLoading(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div
      ref={dropRef}
      className={cn(
        "flex flex-col h-full relative overflow-hidden",
        isDragOver && "ring-2 ring-inset ring-[var(--color-accent)]"
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface)] shrink-0">
        {/* Vault tabs */}
        <div className="flex items-center gap-1 mr-2">
          {vaults.map((v) => (
            <div key={v.id} className="flex items-center group">
              <button
                onClick={() => setActiveVault(v)}
                className={cn(
                  "px-2.5 py-1 rounded-l text-xs font-medium transition-colors",
                  activeVault?.id === v.id
                    ? "bg-[var(--color-accent-bg)] text-[var(--color-accent)]"
                    : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]"
                )}
              >
                {v.name}
              </button>
              <button
                onClick={() => handleRemoveVault(v)}
                title="Remove vault"
                className="h-5 w-4 flex items-center justify-center rounded-r text-[var(--color-text-muted)] opacity-0 group-hover:opacity-100 hover:text-red-400 hover:bg-red-900/30 transition-all"
              >
                <X size={10} />
              </button>
            </div>
          ))}
        </div>

        <Button size="sm" variant="ghost" onClick={handleAddVault}>
          <FolderPlus size={14} />
          Add Folder
        </Button>

        <Button size="sm" variant="ghost" onClick={handleImportFiles} disabled={!activeVault}>
          <Upload size={14} />
          Import
        </Button>

        <div className="relative">
          <Button size="sm" variant="ghost" onClick={() => setShowGithubDialog((v) => !v)}>
            <Globe size={14} />
            GitHub
          </Button>
          {showGithubDialog && (
            <div className="absolute left-0 top-full mt-1 z-50 w-72 bg-[var(--color-surface)] border border-[var(--color-border-subtle)] rounded-lg shadow-xl p-3 flex flex-col gap-2">
              <p className="text-xs font-medium text-[var(--color-text-secondary)]">Clone a GitHub repo as vault</p>
              <Input
                autoFocus
                placeholder="https://github.com/owner/repo"
                value={githubUrl}
                onChange={(e) => setGithubUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleImportGithub();
                  if (e.key === "Escape") { setShowGithubDialog(false); setGithubUrl(""); }
                }}
              />
              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="ghost" onClick={() => { setShowGithubDialog(false); setGithubUrl(""); }}>
                  Cancel
                </Button>
                <Button size="sm" variant="primary" onClick={handleImportGithub} disabled={!githubUrl.trim()}>
                  Clone
                </Button>
              </div>
            </div>
          )}
        </div>

        <div className="flex-1" />

        {/* AI Summarize */}
        {models.length > 0 && (
          <div className="flex items-center gap-1.5">
            <ModelSelect
              models={models}
              value={selectedModel}
              onChange={(v) => {
                setSelectedModel(v);
                localStorage.setItem("ai_model", v);
              }}
            />
            <Button
              size="sm"
              variant="ghost"
              onClick={handleSummarize}
              disabled={!activeVault || !!summarizing}
              title="Generate AI summaries for unsummarized files"
            >
              <Sparkles size={13} className={summarizing ? "animate-pulse text-[var(--color-accent)]" : ""} />
              {summarizing
                ? summarizing.total > 0
                  ? `${summarizing.done}/${summarizing.total}`
                  : "Starting…"
                : "Summarize"}
            </Button>
          </div>
        )}

        <div className="relative w-52">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] pointer-events-none" />
          <Input
            className="pl-8"
            placeholder="Search files…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <Button
          size="sm"
          variant="ghost"
          onClick={handleRefresh}
          disabled={!activeVault || loading}
          title="Re-index vault"
        >
          <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
        </Button>
      </div>

      {/* Progress bar */}
      {summarizing && summarizing.total > 0 && (
        <div className="h-0.5 bg-[var(--color-surface-2)] shrink-0">
          <div
            className="h-full bg-[var(--color-accent)] transition-all duration-300"
            style={{ width: `${(summarizing.done / summarizing.total) * 100}%` }}
          />
        </div>
      )}

      {/* File count */}
      {activeVault && (
        <div className="px-4 py-1 text-xs text-[var(--color-text-muted)] border-b border-[var(--color-border-subtle)] bg-[var(--color-surface)] shrink-0">
          {files.length.toLocaleString()} file{files.length !== 1 ? "s" : ""}
          {activeVault.git_root && (
            <span className="ml-3">git: {activeVault.git_root.split(/[/\\]/).pop()}</span>
          )}
        </div>
      )}

      {/* Main content */}
      {!activeVault ? (
        <EmptyState onAdd={handleAddVault} />
      ) : (
        <div className="flex flex-1 min-h-0 overflow-hidden">
          <FileTable
            files={files}
            vaultPath={activeVault.path}
            globalFilter={search}
            onOpen={(f) => openFileInEditor(f.path).catch((e) => toast(`${e}`))}
            onSelect={setSelectedFile}
            onRemove={handleRemoveFile}
            selectedId={selectedFile?.id ?? null}
          />

          {selectedFile && (
            <>
              {/* Resize handle */}
              <div
                className="w-2 shrink-0 cursor-col-resize group flex items-center justify-center"
                onMouseDown={onResizeStart}
              >
                <div className="w-px h-full bg-[var(--color-border-subtle)] group-hover:bg-[var(--color-accent)] transition-colors" />
              </div>
              <FileDetailPanel
                file={{ ...selectedFile, git_root_hint: activeVault.git_root }}
                width={panelWidth}
                onClose={() => setSelectedFile(null)}
                onRemove={handleRemoveFile}
              />
            </>
          )}
        </div>
      )}

      {isDragOver && (
        <div className="absolute inset-0 bg-[var(--color-accent)]/5 border-2 border-dashed border-[var(--color-accent)] pointer-events-none flex items-center justify-center">
          <span className="text-[var(--color-accent)] font-medium text-sm">Drop .md files to import</span>
        </div>
      )}
    </div>
  );
}

const PROVIDER_LABELS: Record<string, string> = {
  ollama: "Ollama (local)",
  anthropic: "Anthropic",
  openai: "OpenAI",
  deepseek: "DeepSeek",
  google: "Google",
};

function modelLabel(id: string): string {
  const name = id.includes("/") ? id.split("/")[1] : id;
  // Trim ":latest" suffix that Ollama appends
  return name.replace(/:latest$/, "");
}

function ModelSelect({
  models,
  value,
  onChange,
}: {
  models: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  // Group by provider prefix
  const groups: Record<string, string[]> = {};
  for (const m of models) {
    const provider = m.includes("/") ? m.split("/")[0] : "ollama";
    (groups[provider] ??= []).push(m);
  }

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="text-xs bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)] rounded px-2 py-1 text-[var(--color-text-secondary)] cursor-pointer max-w-[160px] truncate"
    >
      {Object.entries(groups).map(([provider, ids]) => (
        <optgroup key={provider} label={PROVIDER_LABELS[provider] ?? provider}>
          {ids.map((id) => (
            <option key={id} value={id}>
              {modelLabel(id)}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center p-8">
      <div className="w-16 h-16 rounded-full bg-[var(--color-surface-2)] flex items-center justify-center">
        <FolderPlus size={28} className="text-[var(--color-text-muted)]" />
      </div>
      <div>
        <p className="text-base font-semibold text-[var(--color-text-primary)] mb-1">No vault yet</p>
        <p className="text-sm text-[var(--color-text-muted)] max-w-xs">
          Add a folder containing your Markdown files to get started, or drag and drop files here.
        </p>
      </div>
      <Button variant="primary" onClick={onAdd}>
        <FolderPlus size={14} />
        Add Folder
      </Button>
    </div>
  );
}
