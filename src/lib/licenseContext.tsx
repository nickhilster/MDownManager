import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  ReactNode,
} from "react";
import {
  ActiveLicense,
  Feature,
  FREE_LICENSE,
  getLicense,
  activateLicense,
  deactivateLicense,
  hasFeature,
} from "./license";

interface LicenseCtx {
  license: ActiveLicense;
  loading: boolean;
  gate: (feature: Feature) => boolean;
  activate: (token: string) => Promise<ActiveLicense>;
  deactivate: () => Promise<void>;
  refresh: () => Promise<void>;
}

const LicenseContext = createContext<LicenseCtx>({
  license: FREE_LICENSE,
  loading: true,
  gate: () => false,
  activate: async () => FREE_LICENSE,
  deactivate: async () => {},
  refresh: async () => {},
});

export function LicenseProvider({ children }: { children: ReactNode }) {
  const [license, setLicense] = useState<ActiveLicense>(FREE_LICENSE);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const active = await getLicense();
      setLicense(active);
    } catch {
      setLicense(FREE_LICENSE);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const activate = async (token: string) => {
    const active = await activateLicense(token);
    setLicense(active);
    return active;
  };

  const deactivate = async () => {
    await deactivateLicense();
    setLicense(FREE_LICENSE);
  };

  return (
    <LicenseContext.Provider
      value={{
        license,
        loading,
        gate: (f) => hasFeature(license, f),
        activate,
        deactivate,
        refresh: load,
      }}
    >
      {children}
    </LicenseContext.Provider>
  );
}

export const useLicense = () => useContext(LicenseContext);
