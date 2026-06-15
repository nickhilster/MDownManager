import { useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  File,
  Folder,
  FolderOpen,
  Layers,
} from "lucide-react";
import {
  FileRecord,
  VaultRecord,
  listFiles,
  listVaults,
} from "@/lib/tauri";
import { FileDetailPanel } from "@/components/vault/FileDetailPanel";
import { RiskBadge } from "@/components/vault/RiskBadge";
import { cn } from "@/lib/utils";

// ── Tree builder ──────────────────────────────────────────────────────────────

interface DirNode {
  type: "dir";
  name: string;
  fullPath: string;
  children: TreeNode[];
  fileCount: number; // total descendant files
}

interface FileNode {
  type: "file";
  name: string;
  file: FileRecord;
}

type TreeNode = DirNode | FileNode;

function buildTree(files: FileRecord[], vaultPath: string): DirNode {
  const root: DirNode = { type: "dir", name: "", fullPath: vaultPath, children: [], fileCount: 0 };

  for (const file of files) {
    // Normalize path separators and strip vault prefix
    const normalized = file.path.replace(/\\/g, "/");
    const base = vaultPath.replace(/\\/g, "/").replace(/\/$/, "");
    const rel = normalized.startsWith(base)
      ? normalized.slice(base.length).replace(/^\//, "")
      : normalized;

    const parts = rel.split("/").filter(Boolean);
    let cur = root;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      let dir = cur.children.find(
        (c): c is DirNode => c.type === "dir" && c.name === part
      );
      if (!dir) {
        dir = {
          type: "dir",
          name: part,
          fullPath: [base, ...parts.slice(0, i + 1)].join("/"),
          children: [],
          fileCount: 0,
        };
        cur.children.push(dir);
      }
      cur = dir;
    }

    const fileName = parts[parts.length - 1] ?? file.path;
    cur.children.push({ type: "file", name: file.title ?? fileName, file });
  }

  // Sort each level: dirs first, then files, both alphabetically
  function sort(node: DirNode) {
    node.children.sort((a, b) => {
      if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    let count = 0;
    for (const child of node.children) {
      if (child.type === "dir") {
        sort(child);
        count += child.fileCount;
      } else {
        count += 1;
      }
    }
    node.fileCount = count;
  }
  sort(root);

  return root;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export function ExplorerPage() {
  const [vaults, setVaults] = useState<VaultRecord[]>([]);
  const [activeVault, setActiveVault] = useState<VaultRecord | null>(null);
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<FileRecord | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    listVaults()
      .then((v) => {
        setVaults(v);
        if (v.length > 0) setActiveVault(v[0]);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!activeVault) return;
    setLoading(true);
    setSelected(null);
    listFiles(activeVault.id)
      .then((f) => {
        setFiles(f);
        // Auto-expand root's direct children on first load
        setExpanded(new Set(["__root__"]));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [activeVault]);

  const tree = activeVault ? buildTree(files, activeVault.path) : null;

  const toggleDir = (fullPath: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(fullPath)) next.delete(fullPath);
      else next.add(fullPath);
      return next;
    });
  };

  const handleFileSelect = (file: FileRecord) => {
    if (activeVault) file = { ...file, git_root_hint: activeVault.git_root ?? undefined } as FileRecord;
    setSelected(file);
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* Main tree area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3 border-b border-[var(--color-border-subtle)] shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers size={15} className="text-[var(--color-accent)]" />
            <span className="text-sm font-semibold text-[var(--color-text-primary)]">Explorer</span>
            {activeVault && (
              <span className="text-xs text-[var(--color-text-muted)]">
                {files.length} file{files.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>

          {/* Vault selector */}
          {vaults.length > 1 && (
            <select
              value={activeVault?.id ?? ""}
              onChange={(e) => {
                const v = vaults.find((v) => v.id === e.target.value);
                if (v) setActiveVault(v);
              }}
              className="text-xs bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)] rounded px-2 py-1 text-[var(--color-text-secondary)] outline-none"
            >
              {vaults.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          )}
        </div>

        {/* Tree */}
        <div className="flex-1 overflow-auto py-2">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-xs text-[var(--color-text-muted)]">
              Loading…
            </div>
          ) : !activeVault ? (
            <div className="flex items-center justify-center h-32 text-xs text-[var(--color-text-muted)]">
              No vault open
            </div>
          ) : !tree || tree.children.length === 0 ? (
            <div className="flex items-center justify-center h-32 text-xs text-[var(--color-text-muted)]">
              No files in vault
            </div>
          ) : (
            <TreeChildren
              nodes={tree.children}
              depth={0}
              expanded={expanded}
              selectedId={selected?.id ?? null}
              onToggleDir={toggleDir}
              onSelectFile={handleFileSelect}
            />
          )}
        </div>
      </div>

      {/* Detail panel */}
      {selected && (
        <FileDetailPanel
          file={selected}
          onClose={() => setSelected(null)}
          width={360}
        />
      )}
    </div>
  );
}

// ── Tree rendering ────────────────────────────────────────────────────────────

function TreeChildren({
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
          <DirRow
            key={node.fullPath}
            node={node}
            depth={depth}
            expanded={expanded}
            selectedId={selectedId}
            onToggleDir={onToggleDir}
            onSelectFile={onSelectFile}
          />
        ) : (
          <FileRow
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

function DirRow({
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
        className="w-full flex items-center gap-1.5 px-3 py-1 hover:bg-[var(--color-surface-2)] transition-colors text-left group"
        style={{ paddingLeft: `${12 + depth * 16}px` }}
      >
        <span className="text-[var(--color-text-muted)] shrink-0">
          {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        </span>
        <span className="text-[var(--color-text-muted)] shrink-0">
          {isOpen
            ? <FolderOpen size={13} className="text-[var(--color-accent)]" />
            : <Folder size={13} className="text-[var(--color-accent)]" />}
        </span>
        <span className="text-xs font-medium text-[var(--color-text-secondary)] truncate flex-1">
          {node.name}
        </span>
        <span className="text-[10px] text-[var(--color-text-muted)] shrink-0 opacity-0 group-hover:opacity-100 transition-opacity tabular-nums pr-2">
          {node.fileCount}
        </span>
      </button>

      {isOpen && (
        <TreeChildren
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

function FileRow({
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
      className={cn(
        "w-full flex items-center gap-1.5 px-3 py-1 transition-colors text-left",
        selected
          ? "bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
          : "hover:bg-[var(--color-surface-2)] text-[var(--color-text-secondary)]"
      )}
      style={{ paddingLeft: `${12 + depth * 16}px` }}
    >
      <span className="shrink-0 w-[13px]" />
      <File size={12} className="shrink-0 text-[var(--color-text-muted)]" />
      <span className="text-xs truncate flex-1">{node.name}</span>
      {node.file.risk_level && node.file.risk_level !== "clean" && (
        <span className="shrink-0 pr-2">
          <RiskBadge risk={node.file.risk_level} />
        </span>
      )}
    </button>
  );
}
