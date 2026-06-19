import { ReactNode, useCallback, useState } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { FolderPanel } from "./FolderPanel";
import { FileDetailPanel } from "@/components/vault/FileDetailPanel";
import { Toaster } from "@/components/ui/Toast";
import { FileRecord } from "@/lib/tauri";
import { Page } from "@/App";

interface ShellProps {
  children: ReactNode;
  page: Page;
  showFolderPanel: boolean;
  onNavigate: (page: Page) => void;
  onOpenHelp: () => void;
  onToggleFolderPanel: () => void;
}

export function Shell({
  children,
  page,
  showFolderPanel,
  onNavigate,
  onOpenHelp,
  onToggleFolderPanel,
}: ShellProps) {
  const [panelWidth, setPanelWidth] = useState(208);
  const [folderFile, setFolderFile] = useState<FileRecord | null>(null);

  const handleResize = useCallback((w: number) => setPanelWidth(w), []);

  const handleOpenFullView = useCallback(() => {
    onNavigate("explorer");
    if (showFolderPanel) onToggleFolderPanel();
  }, [onNavigate, onToggleFolderPanel, showFolderPanel]);

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
        <FolderPanel
          width={panelWidth}
          selectedFileId={folderFile?.id ?? null}
          onClose={onToggleFolderPanel}
          onFileSelect={setFolderFile}
          onOpenFullView={handleOpenFullView}
          onResize={handleResize}
        />
      )}

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>

      {/* File detail from folder panel — rendered here so it appears on the right edge */}
      {folderFile && (
        <FileDetailPanel
          file={folderFile}
          onClose={() => setFolderFile(null)}
          width={360}
        />
      )}

      <Toaster />
    </div>
  );
}
