import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  useReactTable,
  SortingState,
} from "@tanstack/react-table";
import { useState } from "react";
import { ExternalLink, GitBranch, Trash2, ChevronUp, ChevronDown } from "lucide-react";
import { FileRecord } from "@/lib/tauri";
import { formatBytes, formatDate, relativePath } from "@/lib/utils";
import { RiskBadge } from "./RiskBadge";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

const col = createColumnHelper<FileRecord>();

interface FileTableProps {
  files: FileRecord[];
  vaultPath: string;
  globalFilter: string;
  onOpen: (file: FileRecord) => void;
  onSelect: (file: FileRecord) => void;
  onRemove: (file: FileRecord) => void;
  selectedId: string | null;
}

function SkillBadge({ frontmatter }: { frontmatter: string | null }) {
  const fm = frontmatter ?? "";
  const valid = /^name\s*:/m.test(fm) && /^description\s*:/m.test(fm);
  return (
    <Badge variant={valid ? "skill-valid" : "skill"} className="shrink-0 py-0 text-[10px]">
      {valid ? "✓ Skill" : "Skill"}
    </Badge>
  );
}

export function FileTable({
  files,
  vaultPath,
  globalFilter,
  onOpen,
  onSelect,
  onRemove,
  selectedId,
}: FileTableProps) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: "modified_at", desc: true },
  ]);

  const columns = [
    col.accessor("title", {
      header: "Title",
      cell: (info) => (
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            {info.row.original.category_id === "skill" && (
              <SkillBadge frontmatter={info.row.original.frontmatter} />
            )}
            <span className="font-medium text-[var(--color-text-primary)] truncate">
              {info.getValue() ?? info.row.original.path.split(/[/\\]/).pop()}
            </span>
          </div>
          {info.row.original.summary && (
            <span className="text-xs text-[var(--color-text-muted)] truncate block max-w-xs mt-0.5 leading-snug">
              {info.row.original.summary}
            </span>
          )}
        </div>
      ),
    }),
    col.accessor("path", {
      header: "Path",
      cell: (info) => (
        <span className="text-[var(--color-text-muted)] font-mono text-xs truncate block max-w-sm">
          {relativePath(info.getValue(), vaultPath)}
        </span>
      ),
    }),
    col.accessor("risk_level", {
      header: "Risk",
      cell: (info) => <RiskBadge risk={info.getValue()} />,
      size: 80,
    }),
    col.accessor("size_bytes", {
      header: "Size",
      cell: (info) => (
        <span className="text-[var(--color-text-muted)] text-xs tabular-nums">
          {formatBytes(info.getValue())}
        </span>
      ),
      size: 80,
    }),
    col.accessor("line_count", {
      header: "Lines",
      cell: (info) => (
        <span className="text-[var(--color-text-muted)] text-xs tabular-nums">
          {info.getValue().toLocaleString()}
        </span>
      ),
      size: 70,
    }),
    col.accessor("modified_at", {
      header: "Modified",
      cell: (info) => (
        <span className="text-[var(--color-text-muted)] text-xs tabular-nums whitespace-nowrap">
          {formatDate(info.getValue())}
        </span>
      ),
      size: 110,
    }),
    col.display({
      id: "actions",
      cell: ({ row }) => (
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            size="sm"
            variant="ghost"
            title="Open in editor"
            onClick={(e) => {
              e.stopPropagation();
              onOpen(row.original);
            }}
          >
            <ExternalLink size={13} />
          </Button>
          {row.original.git_root_hint && (
            <GitBranch size={13} className="text-[var(--color-text-muted)]" />
          )}
          <Button
            size="sm"
            variant="ghost"
            title="Remove from vault"
            onClick={(e) => {
              e.stopPropagation();
              onRemove(row.original);
            }}
            className="hover:text-red-400"
          >
            <Trash2 size={13} />
          </Button>
        </div>
      ),
      size: 70,
    }),
  ];

  const table = useReactTable({
    data: files,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  return (
    <div data-tour-target="vault-file-table" className="overflow-auto flex-1">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-10 bg-[var(--color-surface)]">
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id} className="border-b border-[var(--color-border-subtle)]">
              {hg.headers.map((header) => (
                <th
                  key={header.id}
                  onClick={header.column.getToggleSortingHandler()}
                  className={cn(
                    "px-3 py-2 text-left text-xs font-medium text-[var(--color-text-muted)] uppercase tracking-wider select-none",
                    header.column.getCanSort() &&
                      "cursor-pointer hover:text-[var(--color-text-secondary)]"
                  )}
                  style={{ width: header.getSize() }}
                >
                  <div className="flex items-center gap-1">
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {header.column.getIsSorted() === "asc" && <ChevronUp size={12} />}
                    {header.column.getIsSorted() === "desc" && <ChevronDown size={12} />}
                  </div>
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => (
            <tr
              key={row.id}
              onClick={() => onSelect(row.original)}
              className={cn(
                "group border-b border-[var(--color-border-subtle)] cursor-pointer transition-colors",
                row.original.id === selectedId
                  ? "bg-[var(--color-accent)]/10"
                  : "hover:bg-[var(--color-surface-2)]"
              )}
            >
              {row.getVisibleCells().map((cell) => (
                <td key={cell.id} className="px-3 py-2">
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
          {table.getRowModel().rows.length === 0 && (
            <tr>
              <td
                colSpan={columns.length}
                className="px-3 py-12 text-center text-[var(--color-text-muted)]"
              >
                No files found
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
