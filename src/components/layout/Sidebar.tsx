import { LayoutDashboard, Settings, Shield, Layers, Tag, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Page } from "@/App";

const navItems: { icon: React.ElementType; label: string; id: string; page?: Page }[] = [
  { icon: LayoutDashboard, label: "Vault",      id: "vault",      page: "vault" },
  { icon: Shield,          label: "Scanner",    id: "scanner",    page: "scanner" },
  { icon: Tag,             label: "Categories", id: "categories", page: "categories" as const },
];

interface SidebarProps {
  activePage: Page;
  folderPanelOpen: boolean;
  onNavigate: (page: Page) => void;
  onOpenHelp: () => void;
  onToggleFolderPanel: () => void;
}

export function Sidebar({ activePage, folderPanelOpen, onNavigate, onOpenHelp, onToggleFolderPanel }: SidebarProps) {
  return (
    <aside className="w-14 flex flex-col items-center py-4 bg-[var(--color-surface)] border-r border-[var(--color-border-subtle)] shrink-0">
      {/* Logo mark */}
      <div data-tour-target="sidebar-logo" className="w-8 h-8 rounded overflow-hidden mb-4 shrink-0">
        <img src="/icon.png" alt="MDownManager" className="w-full h-full object-cover" />
      </div>

      {/* Main nav */}
      <div className="flex flex-col gap-1 flex-1">
        {navItems.map(({ icon: Icon, label, id, page }) => (
          <button
            key={id}
            data-tour-target={id === "scanner" ? "scanner-nav" : undefined}
            title={label}
            onClick={() => page && onNavigate(page)}
            className={cn(
              "w-9 h-9 rounded flex items-center justify-center transition-colors",
              activePage === id
                ? "bg-[var(--color-accent)]/15 text-[var(--color-accent)]"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)]"
            )}
          >
            <Icon size={16} />
          </button>
        ))}

        {/* Explorer — toggles the folder panel */}
        <button
          title={folderPanelOpen ? "Close Explorer" : "Explorer"}
          onClick={onToggleFolderPanel}
          className={cn(
            "w-9 h-9 rounded flex items-center justify-center transition-colors",
            folderPanelOpen
              ? "bg-[var(--color-accent)]/15 text-[var(--color-accent)]"
              : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)]"
          )}
        >
          <Layers size={16} />
        </button>
      </div>

      {/* Help and Settings pinned to bottom */}
      <button
        title="Help"
        onClick={onOpenHelp}
        className={cn(
          "w-9 h-9 rounded flex items-center justify-center transition-colors mt-2",
          activePage === "help"
            ? "bg-[var(--color-accent)]/15 text-[var(--color-accent)]"
            : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)]"
        )}
      >
        <HelpCircle size={16} />
      </button>
      <button
        title="Settings"
        onClick={() => onNavigate("settings")}
        className={cn(
          "w-9 h-9 rounded flex items-center justify-center transition-colors mt-2",
          activePage === "settings"
            ? "bg-[var(--color-accent)]/15 text-[var(--color-accent)]"
            : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)]"
        )}
      >
        <Settings size={16} />
      </button>
    </aside>
  );
}
