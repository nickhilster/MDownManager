import { ReactNode } from "react";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { Toaster } from "@/components/ui/Toast";
import { Page } from "@/App";

interface ShellProps {
  children: ReactNode;
  page: Page;
  onNavigate: (page: Page) => void;
}

export function Shell({ children, page, onNavigate }: ShellProps) {
  return (
    <div className="flex h-full overflow-hidden bg-[var(--color-background)]">
      <Sidebar activePage={page} onNavigate={onNavigate} />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
      <Toaster />
    </div>
  );
}
