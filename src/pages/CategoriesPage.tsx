import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Pencil, Plus, Tag, Trash2, X } from "lucide-react";
import {
  CategoryRecord,
  FileRecord,
  createCategory,
  deleteCategory,
  listCategories,
  listFilesByCategory,
  listVaults,
  renameCategory,
} from "@/lib/tauri";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { cn, formatDate } from "@/lib/utils";

const SOURCE_LABEL: Record<string, string> = {
  manual:  "Manual",
  ai:      "AI",
  indexer: "Auto",
};

export function CategoriesPage() {
  const [vaultId, setVaultId] = useState<string | null>(null);
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [selected, setSelected] = useState<CategoryRecord | null>(null);
  const [files, setFiles] = useState<FileRecord[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameName, setRenameName] = useState("");
  const newInputRef = useRef<HTMLInputElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listVaults()
      .then((v) => { if (v.length > 0) setVaultId(v[0].id); })
      .catch(() => {});
  }, []);

  const loadCategories = useCallback(() => {
    if (!vaultId) return;
    listCategories(vaultId).then(setCategories).catch(() => {});
  }, [vaultId]);

  useEffect(() => { loadCategories(); }, [loadCategories]);

  useEffect(() => {
    if (creating) setTimeout(() => newInputRef.current?.focus(), 0);
  }, [creating]);

  useEffect(() => {
    if (renaming) setTimeout(() => renameInputRef.current?.focus(), 0);
  }, [renaming]);

  const handleSelect = async (cat: CategoryRecord) => {
    setSelected(cat);
    setLoadingFiles(true);
    try {
      const result = await listFilesByCategory(vaultId!, cat.id);
      setFiles(result);
    } catch {
      setFiles([]);
    } finally {
      setLoadingFiles(false);
    }
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name || !vaultId) return;
    try {
      await createCategory(vaultId, name);
      setNewName("");
      setCreating(false);
      loadCategories();
      toast(`Category "${name}" created`, "success");
    } catch (e) {
      toast(`Failed: ${e}`);
    }
  };

  const handleRename = async (id: string) => {
    const name = renameName.trim();
    if (!name) { setRenaming(null); return; }
    try {
      await renameCategory(id, name);
      setRenaming(null);
      loadCategories();
      if (selected?.id === id) setSelected((c) => c ? { ...c, name } : c);
    } catch (e) {
      toast(`Failed: ${e}`);
    }
  };

  const handleDelete = async (cat: CategoryRecord) => {
    try {
      await deleteCategory(cat.id);
      if (selected?.id === cat.id) { setSelected(null); setFiles([]); }
      loadCategories();
      toast(`"${cat.name}" deleted`);
    } catch (e) {
      toast(`Failed: ${e}`);
    }
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: category list */}
      <div className="w-64 shrink-0 flex flex-col border-r border-[var(--color-border-subtle)] bg-[var(--color-surface)]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border-subtle)]">
          <div className="flex items-center gap-2">
            <Tag size={15} className="text-[var(--color-accent)]" />
            <span className="text-sm font-semibold text-[var(--color-text-primary)]">Categories</span>
          </div>
          <Button
            size="sm"
            variant="ghost"
            title="New category"
            onClick={() => { setCreating(true); setNewName(""); }}
          >
            <Plus size={14} />
          </Button>
        </div>

        <div className="flex-1 overflow-auto py-1">
          {/* New category input */}
          {creating && (
            <div className="flex items-center gap-1 px-2 py-1">
              <input
                ref={newInputRef}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                  if (e.key === "Escape") setCreating(false);
                }}
                placeholder="Category name"
                className="flex-1 text-xs bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)] rounded px-2 py-1 text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]"
              />
              <button onClick={handleCreate} className="text-[var(--color-accent)] p-0.5">
                <Check size={13} />
              </button>
              <button onClick={() => setCreating(false)} className="text-[var(--color-text-muted)] p-0.5">
                <X size={13} />
              </button>
            </div>
          )}

          {categories.length === 0 && !creating && (
            <div className="px-4 py-8 text-center text-xs text-[var(--color-text-muted)]">
              No categories yet
            </div>
          )}

          {categories.map((cat) => (
            <div
              key={cat.id}
              className={cn(
                "group flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors",
                selected?.id === cat.id
                  ? "bg-[var(--color-accent)]/10 text-[var(--color-accent)]"
                  : "hover:bg-[var(--color-surface-2)] text-[var(--color-text-secondary)]"
              )}
              onClick={() => handleSelect(cat)}
            >
              {renaming === cat.id ? (
                <input
                  ref={renameInputRef}
                  value={renameName}
                  onChange={(e) => setRenameName(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.stopPropagation(); handleRename(cat.id); }
                    if (e.key === "Escape") { e.stopPropagation(); setRenaming(null); }
                  }}
                  className="flex-1 text-xs bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)] rounded px-1.5 py-0.5 text-[var(--color-text-primary)] outline-none focus:border-[var(--color-accent)]"
                />
              ) : (
                <span className="flex-1 text-xs font-medium truncate">{cat.name}</span>
              )}

              <span className="text-xs text-[var(--color-text-muted)] tabular-nums shrink-0">
                {cat.file_count}
              </span>

              {/* Source badge */}
              <span className="text-[10px] text-[var(--color-text-muted)] shrink-0 hidden group-hover:inline">
                {SOURCE_LABEL[cat.source] ?? cat.source}
              </span>

              {/* Actions — show on hover for manual/ai; indexer cats can't be renamed/deleted */}
              {cat.source !== "indexer" && (
                <div className="hidden group-hover:flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                  <button
                    title="Rename"
                    onClick={() => { setRenaming(cat.id); setRenameName(cat.name); }}
                    className="p-0.5 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
                  >
                    <Pencil size={11} />
                  </button>
                  <button
                    title="Delete"
                    onClick={() => handleDelete(cat)}
                    className="p-0.5 text-[var(--color-text-muted)] hover:text-red-400"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Right: file list for selected category */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {!selected ? (
          <div className="flex items-center justify-center h-full text-xs text-[var(--color-text-muted)]">
            Select a category to view its files
          </div>
        ) : (
          <>
            <div className="px-5 py-3 border-b border-[var(--color-border-subtle)] shrink-0">
              <div className="flex items-center gap-2">
                <Tag size={14} className="text-[var(--color-accent)]" />
                <span className="text-sm font-semibold text-[var(--color-text-primary)]">{selected.name}</span>
                <span className="text-xs text-[var(--color-text-muted)]">{files.length} file{files.length !== 1 ? "s" : ""}</span>
                <span className="text-xs text-[var(--color-text-muted)]">·</span>
                <span className="text-xs text-[var(--color-text-muted)]">{SOURCE_LABEL[selected.source] ?? selected.source}</span>
              </div>
            </div>

            <div className="flex-1 overflow-auto">
              {loadingFiles ? (
                <div className="flex items-center justify-center h-32 text-xs text-[var(--color-text-muted)]">Loading…</div>
              ) : files.length === 0 ? (
                <div className="flex items-center justify-center h-32 text-xs text-[var(--color-text-muted)]">
                  No files in this category
                </div>
              ) : (
                <table className="w-full border-collapse text-sm">
                  <thead className="sticky top-0 z-10 bg-[var(--color-surface)]">
                    <tr className="border-b border-[var(--color-border-subtle)]">
                      <th className="px-4 py-2 text-left text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider">File</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider w-32">Modified</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider w-24">Size</th>
                    </tr>
                  </thead>
                  <tbody>
                    {files.map((file) => {
                      const name = file.title ?? file.path.split(/[/\\]/).pop() ?? file.path;
                      return (
                        <tr
                          key={file.id}
                          className="border-b border-[var(--color-border-subtle)] hover:bg-[var(--color-surface-2)] transition-colors"
                        >
                          <td className="px-4 py-2">
                            <span className="text-xs font-medium text-[var(--color-text-primary)] truncate block max-w-lg">{name}</span>
                            <span className="text-xs text-[var(--color-text-muted)] truncate block max-w-lg">{file.path}</span>
                          </td>
                          <td className="px-4 py-2">
                            <span className="text-xs text-[var(--color-text-muted)]">{formatDate(file.modified_at)}</span>
                          </td>
                          <td className="px-4 py-2">
                            <span className="text-xs text-[var(--color-text-muted)]">
                              {(file.size_bytes / 1024).toFixed(1)} KB
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
