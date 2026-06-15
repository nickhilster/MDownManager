import { useCallback, useEffect, useState } from "react";
import { Shell } from "@/components/layout/Shell";
import { SplashScreen } from "@/components/layout/SplashScreen";
import { VaultPage } from "@/pages/VaultPage";
import { ScannerPage } from "@/pages/ScannerPage";
import { CategoriesPage } from "@/pages/CategoriesPage";
import { SettingsPage } from "@/pages/SettingsPage";
import { HelpPage } from "@/pages/HelpPage";
import { LicenseProvider, useLicense } from "@/lib/licenseContext";
import { splashStripLabel } from "@/lib/license";
import { useTour } from "@/hooks/useTour";
import { TourOverlay } from "@/components/help/TourOverlay";

export type Page = "vault" | "scanner" | "categories" | "settings" | "help";

function AppInner() {
  const [page, setPage] = useState<Page>("vault");
  const [showSplash, setShowSplash] = useState(true);
  const { license, loading } = useLicense();
  const [splashDone, setSplashDone] = useState(false);
  const handleSplashDone = useCallback(() => setSplashDone(true), []);

  const tour = useTour();

  // Navigate to the right page when the tour step requires it
  useEffect(() => {
    if (tour.active && tour.step) {
      setPage(tour.step.page);
    }
  }, [tour.active, tour.step]);

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
      <Shell
        page={page}
        onNavigate={setPage}
        onOpenHelp={() => setPage("help")}
      >
        {page === "vault" ? (
          <VaultPage />
        ) : page === "scanner" ? (
          <ScannerPage />
        ) : page === "categories" ? (
          <CategoriesPage />
        ) : page === "help" ? (
          <HelpPage onStartTour={() => { tour.start(); setPage("vault"); }} />
        ) : (
          <SettingsPage />
        )}
      </Shell>

      {tour.active && tour.step && (
        <TourOverlay
          step={tour.step}
          currentStep={tour.currentStep}
          totalSteps={tour.totalSteps}
          onNext={tour.next}
          onPrev={tour.prev}
          onSkip={tour.skip}
        />
      )}
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
