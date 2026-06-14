import { useState } from "react";
import { Shell } from "@/components/layout/Shell";
import { VaultPage } from "@/pages/VaultPage";
import { ScannerPage } from "@/pages/ScannerPage";
import { SettingsPage } from "@/pages/SettingsPage";

export type Page = "vault" | "scanner" | "settings";

export default function App() {
  const [page, setPage] = useState<Page>("vault");

  return (
    <Shell page={page} onNavigate={setPage}>
      {page === "vault" ? (
        <VaultPage />
      ) : page === "scanner" ? (
        <ScannerPage />
      ) : (
        <SettingsPage />
      )}
    </Shell>
  );
}
