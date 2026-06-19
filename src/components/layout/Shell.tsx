import { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { FolderPanel } from "./FolderPanel";
import { Toaster } from "@/components/ui/Toast";
import { Page } from "@/App";

interface ShellProps {
  children: ReactNode;
  page: Page;
  showFolderPanel: boolean;
  onNavigate: (page: Page) => void;
  onOpenHelp: () => void;
  onToggleFolderPanel: () => void;
}

export function Shell({ children, page, showFolderPanel, onNavigate, onOpenHelp, onToggleFolderPanel }: ShellProps) {
  return (
    <div className="flex h-full overflow-hidden bg-[var(--color-background)]">
      <Sidebar
        activePage={page}
        folderPanelOpen={showFolderPanel}
        onNavigate={onNavigate}
        onOpenHelp={onOpenHelp}
        onToggleFolderPanel={onToggleFolderPanel}
      />
      {showFolderPanel && (
        <FolderPanel onClose={onToggleFolderPanel} />
      )}
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
      <Toaster />
    </div>
  );
}
