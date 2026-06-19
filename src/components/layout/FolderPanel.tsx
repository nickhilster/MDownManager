import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, File, Folder, FolderOpen, X } from "lucide-react";
import { FileRecord, VaultRecord, listFiles, listVaults } from "@/lib/tauri";
import { FileDetailPanel } from "@/components/vault/FileDetailPanel";
import { RiskBadge } from "@/components/vault/RiskBadge";
import { buildTree, DirNode, FileNode, TreeNode } from "@/lib/treeBuilder";
import { cn } from "@/lib/utils";

interface FolderPanelProps {
  onClose: () => void;
}

export function FolderPanel({ onClose }: FolderPanelProps) {
  const [vaults, setVaults] = useState<VaultRecord[]>([]);
  const [activeVault, setActiveVault] = useState<VaultRecord | null>(null);
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<FileRecord | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set(["__root__"]));

  useEffect(() => {
    listVaults().then((v) => {
      setVaults(v);
      if (v.length > 0) setActiveVault(v[0]);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!activeVault) return;
    setLoading(true);
    setSelected(null);
    listFiles(activeVault.id)
      .then((f) => { setFiles(f); setExpanded(new Set(["__root__"])); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [activeVault]);

  const tree = activeVault ? buildTree(files, activeVault.path) : null;

  const toggleDir = (fullPath: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(fullPath)) next.delete(fullPath);
      else next.add(fullPath);
      return next;
    });

  return (
    <>
      {/* Panel */}
      <div className="w-52 shrink-0 flex flex-col border-r border-[var(--color-border-subtle)] bg-[var(--color-surface)] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-border-subtle)] shrink-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
              Explorer
            </span>
            {activeVault && (
              <span className="text-[10px] text-[var(--color-text-muted)] tabular-nums">
                ({files.length})
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            title="Close panel"
            className="text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
          >
            <X size={13} />
          </button>
        </div>

        {/* Vault selector */}
        {vaults.length > 1 && (
          <div className="px-2 py-1.5 border-b border-[var(--color-border-subtle)] shrink-0">
            <select
              value={activeVault?.id ?? ""}
              onChange={(e) => {
                const v = vaults.find((v) => v.id === e.target.value);
                if (v) setActiveVault(v);
              }}
              className="w-full text-[11px] bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)] rounded px-1.5 py-1 text-[var(--color-text-secondary)] outline-none"
            >
              {vaults.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          </div>
        )}

        {/* Tree */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden py-1 min-h-0">
          {loading ? (
            <p className="px-3 py-4 text-[11px] text-[var(--color-text-muted)]">Loading…</p>
          ) : !activeVault ? (
            <p className="px-3 py-4 text-[11px] text-[var(--color-text-muted)]">No vault open</p>
          ) : !tree || tree.children.length === 0 ? (
            <p className="px-3 py-4 text-[11px] text-[var(--color-text-muted)]">No files</p>
          ) : (
            <PanelTreeChildren
              nodes={tree.children}
              depth={0}
              expanded={expanded}
              selectedId={selected?.id ?? null}
              onToggleDir={toggleDir}
              onSelectFile={(f) => {
                if (activeVault) f = { ...f, git_root_hint: activeVault.git_root ?? undefined } as FileRecord;
                setSelected(f);
              }}
            />
          )}
        </div>
      </div>

      {/* File detail — rendered as a right-edge drawer over main content */}
      {selected && (
        <FileDetailPanel
          file={selected}
          onClose={() => setSelected(null)}
          width={340}
        />
      )}
    </>
  );
}

// ── Tree rendering ─────────────────────────────────────────────────────────────

function PanelTreeChildren({
  nodes, depth, expanded, selectedId, onToggleDir, onSelectFile,
}: {
  nodes: TreeNode[];
  depth: number;
  expanded: Set<string>;
  selectedId: string | null;
  onToggleDir: (path: string) => void;
  onSelectFile: (file: FileRecord) => void;
}) {
  return (
    <>
      {nodes.map((node) =>
        node.type === "dir" ? (
          <PanelDirRow
            key={node.fullPath}
            node={node}
            depth={depth}
            expanded={expanded}
            selectedId={selectedId}
            onToggleDir={onToggleDir}
            onSelectFile={onSelectFile}
          />
        ) : (
          <PanelFileRow
            key={node.file.id}
            node={node}
            depth={depth}
            selected={selectedId === node.file.id}
            onSelect={onSelectFile}
          />
        )
      )}
    </>
  );
}

function PanelDirRow({
  node, depth, expanded, selectedId, onToggleDir, onSelectFile,
}: {
  node: DirNode;
  depth: number;
  expanded: Set<string>;
  selectedId: string | null;
  onToggleDir: (path: string) => void;
  onSelectFile: (file: FileRecord) => void;
}) {
  const isOpen = expanded.has(node.fullPath);
  return (
    <>
      <button
        onClick={() => onToggleDir(node.fullPath)}
        title={node.name}
        className="w-full flex items-center gap-1 py-[3px] hover:bg-[var(--color-surface-2)] transition-colors text-left group"
        style={{ paddingLeft: `${8 + depth * 12}px` }}
      >
        <span className="text-[var(--color-text-muted)] shrink-0">
          {isOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
        </span>
        <span className="shrink-0">
          {isOpen
            ? <FolderOpen size={11} className="text-[var(--color-accent)]" />
            : <Folder size={11} className="text-[var(--color-accent)]" />}
        </span>
        <span className="text-[11px] font-medium text-[var(--color-text-secondary)] truncate flex-1 ml-1">
          {node.name}
        </span>
        <span className="text-[10px] text-[var(--color-text-muted)] shrink-0 opacity-0 group-hover:opacity-100 transition-opacity tabular-nums pr-2">
          {node.fileCount}
        </span>
      </button>
      {isOpen && (
        <PanelTreeChildren
          nodes={node.children}
          depth={depth + 1}
          expanded={expanded}
          selectedId={selectedId}
          onToggleDir={onToggleDir}
          onSelectFile={onSelectFile}
        />
      )}
    </>
  );
}

function PanelFileRow({
  node, depth, selected, onSelect,
}: {
  node: FileNode;
  depth: number;
  selected: boolean;
  onSelect: (file: FileRecord) => void;
}) {
  return (
    <button
      onClick={() => onSelect(node.file)}
      title={node.name}
      className={cn(
        "w-full flex items-center gap-1 py-[3px] transition-colors text-left",
        selected
          ? "bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
          : "hover:bg-[var(--color-surface-2)] text-[var(--color-text-secondary)]"
      )}
      style={{ paddingLeft: `${8 + depth * 12 + 12}px` }}
    >
      <File size={11} className="shrink-0 text-[var(--color-text-muted)]" />
      <span className="text-[11px] truncate flex-1 ml-1">{node.name}</span>
      {node.file.risk_level && node.file.risk_level !== "clean" && (
        <span className="shrink-0 pr-2">
          <RiskBadge risk={node.file.risk_level} />
        </span>
      )}
    </button>
  );
}
