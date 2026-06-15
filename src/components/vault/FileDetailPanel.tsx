import { useEffect, useState } from "react";
import {
  ExternalLink,
  GitBranch,
  Clock,
  X,
  Trash2,
  Sparkles,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { CategoryRecord, FileRecord, GitCommit, Snapshot } from "@/lib/tauri";
import {
  assignFileCategory,
  getFileContent,
  listCategories,
  listSnapshots,
  gitFileHistory,
  openFileInEditor,
} from "@/lib/tauri";
import { Button } from "@/components/ui/Button";
import { RiskBadge } from "./RiskBadge";
import { formatBytes, formatDate } from "@/lib/utils";

interface FileDetailPanelProps {
  file: FileRecord;
  onClose: () => void;
  onRemove?: (file: FileRecord) => void;
  onCategoryChange?: (fileId: string, categoryId: string | null) => void;
  width?: number;
}

export function FileDetailPanel({ file, onClose, onRemove, onCategoryChange, width }: FileDetailPanelProps) {
  const [content, setContent] = useState<string | null>(null);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [gitHistory, setGitHistory] = useState<GitCommit[]>([]);
  const [showGit, setShowGit] = useState(false);
  const [showSnapshots, setShowSnapshots] = useState(false);
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [assigningCategory, setAssigningCategory] = useState(false);

  useEffect(() => {
    setContent(null);
    setSnapshots([]);
    setGitHistory([]);
    setShowGit(false);
    getFileContent(file.path).then(setContent).catch(() => setContent(null));
    listSnapshots(file.id).then(setSnapshots).catch(() => setSnapshots([]));
  }, [file.id]);

  useEffect(() => {
    listCategories(file.vault_id).then(setCategories).catch(() => {});
  }, [file.vault_id]);

  const handleAssignCategory = async (categoryId: string | null) => {
    setAssigningCategory(true);
    try {
      await assignFileCategory(file.id, categoryId);
      onCategoryChange?.(file.id, categoryId);
    } catch {
      // silently ignore
    } finally {
      setAssigningCategory(false);
    }
  };

  const loadGitHistory = async () => {
    if (!file.git_root_hint) return;
    try {
      const history = await gitFileHistory(file.git_root_hint, file.path, 20);
      setGitHistory(history);
    } catch {
      setGitHistory([]);
    }
  };

  return (
    <div
      className="shrink-0 border-l border-[var(--color-border-subtle)] bg-[var(--color-surface)] flex flex-col overflow-hidden"
      style={{ width: width ?? 380 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border-subtle)]">
        <span className="text-sm font-semibold text-[var(--color-text-primary)] truncate flex-1">
          {file.title ?? file.path.split(/[/\\]/).pop()}
        </span>
        <div className="flex items-center gap-1 ml-2 shrink-0">
          <Button size="sm" variant="ghost" title="Open in editor" onClick={() => openFileInEditor(file.path)}>
            <ExternalLink size={13} />
          </Button>
          {onRemove && (
            <Button size="sm" variant="ghost" title="Remove from vault" onClick={() => onRemove(file)} className="hover:text-red-400">
              <Trash2 size={13} />
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onClose}>
            <X size={13} />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-auto px-4 py-3 space-y-4">
        {/* Meta */}
        <section className="space-y-2">
          <Row label="Risk">
            <RiskBadge risk={file.risk_level} />
            {!file.risk_level && <span className="text-xs text-[var(--color-text-muted)]">Not scanned</span>}
          </Row>
          <Row label="Category">
            <select
              value={file.category_id ?? ""}
              disabled={assigningCategory}
              onChange={(e) => handleAssignCategory(e.target.value || null)}
              className="text-xs bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)] rounded px-1.5 py-0.5 text-[var(--color-text-secondary)] outline-none focus:border-[var(--color-accent)] disabled:opacity-50"
            >
              <option value="">— none —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Row>
          <Row label="Size">
            <span className="text-xs text-[var(--color-text-secondary)]">
              {formatBytes(file.size_bytes)} · {file.line_count.toLocaleString()} lines
            </span>
          </Row>
          <Row label="Modified">
            <span className="text-xs text-[var(--color-text-secondary)]">{formatDate(file.modified_at)}</span>
          </Row>
          {file.frontmatter && (
            <Row label="Frontmatter">
              <span className="text-xs text-[var(--color-text-muted)] italic">present</span>
            </Row>
          )}
        </section>

        {/* AI Summary */}
        <section>
          <div className="flex items-center gap-1.5 mb-2">
            <Sparkles size={12} className="text-[var(--color-accent)]" />
            <span className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">
              AI Summary
            </span>
          </div>
          {file.summary ? (
            <div>
              <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                {file.summary}
              </p>
              {file.summary_model && (
                <span className="text-xs text-[var(--color-text-muted)] mt-1 block">
                  via {file.summary_model}
                </span>
              )}
            </div>
          ) : (
            <p className="text-xs text-[var(--color-text-muted)] italic">
              Not generated — click Summarize in the toolbar
            </p>
          )}
        </section>

        {/* Content preview */}
        {content && (
          <section>
            <SectionHeader label="Preview" />
            <pre className="text-xs text-[var(--color-text-secondary)] font-mono bg-[var(--color-surface-2)] rounded p-2 overflow-auto max-h-48 whitespace-pre-wrap break-words">
              {content.slice(0, 1200)}
              {content.length > 1200 && "\n…"}
            </pre>
          </section>
        )}

        {/* Snapshots */}
        <section>
          <button
            className="flex items-center gap-1 text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] w-full mb-2"
            onClick={() => setShowSnapshots((v) => !v)}
          >
            {showSnapshots ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            <Clock size={13} />
            Snapshots ({snapshots.length})
          </button>
          {showSnapshots && (
            <div className="space-y-1">
              {snapshots.slice(0, 10).map((s) => (
                <div key={s.id} className="flex items-center justify-between text-xs px-2 py-1 rounded bg-[var(--color-surface-2)]">
                  <span className="text-[var(--color-text-muted)] font-mono">{s.content_hash.slice(0, 8)}</span>
                  <span className="text-[var(--color-text-muted)]">{formatDate(s.created_at)}</span>
                </div>
              ))}
              {snapshots.length === 0 && (
                <span className="text-xs text-[var(--color-text-muted)]">No snapshots yet</span>
              )}
            </div>
          )}
        </section>

        {/* Git history */}
        {file.git_root_hint && (
          <section>
            <button
              className="flex items-center gap-1 text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] w-full mb-2"
              onClick={() => {
                setShowGit((v) => {
                  if (!v) loadGitHistory();
                  return !v;
                });
              }}
            >
              {showGit ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              <GitBranch size={13} />
              Git history
            </button>
            {showGit && (
              <div className="space-y-1">
                {gitHistory.map((c) => (
                  <div key={c.hash} className="text-xs px-2 py-1.5 rounded bg-[var(--color-surface-2)] space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[var(--color-accent)] shrink-0">{c.hash.slice(0, 7)}</span>
                      <span className="text-[var(--color-text-muted)] truncate">{c.author}</span>
                    </div>
                    <div className="text-[var(--color-text-secondary)] truncate">{c.message}</div>
                    <div className="text-[var(--color-text-muted)]">{formatDate(c.timestamp)}</div>
                  </div>
                ))}
                {gitHistory.length === 0 && (
                  <span className="text-xs text-[var(--color-text-muted)]">No commits found for this file</span>
                )}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-[var(--color-text-muted)] w-20 shrink-0">{label}</span>
      {children}
    </div>
  );
}

function SectionHeader({ label }: { label: string }) {
  return (
    <div className="text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider mb-2">
      {label}
    </div>
  );
}
