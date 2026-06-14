import { useCallback, useEffect, useState } from "react";
import { Shell } from "@/components/layout/Shell";
import { SplashScreen } from "@/components/layout/SplashScreen";
import { VaultPage } from "@/pages/VaultPage";
import { ScannerPage } from "@/pages/ScannerPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { LicenseProvider, useLicense } from "@/lib/licenseContext";
import { splashStripLabel } from "@/lib/license";

export type Page = "vault" | "scanner" | "settings";

function AppInner() {
  const [page, setPage] = useState<Page>("vault");
  const [showSplash, setShowSplash] = useState(true);
  const { license, loading } = useLicense();

  const [splashDone, setSplashDone] = useState(false);

  const handleSplashDone = useCallback(() => setSplashDone(true), []);

  useEffect(() => {
    if (splashDone && !loading) setShowSplash(false);
  }, [splashDone, loading]);

  return (
    <>
      {showSplash && (
        <SplashScreen
          brandingLabel={splashStripLabel(license)}
          onDone={handleSplashDone}
        />
      )}
      <Shell page={page} onNavigate={setPage}>
        {page === "vault" ? (
          <VaultPage />
        ) : page === "scanner" ? (
          <ScannerPage />
        ) : (
          <SettingsPage />
        )}
      </Shell>
    </>
  );
}

export default function App() {
  return (
    <LicenseProvider>
      <AppInner />
    </LicenseProvider>
  );
}
