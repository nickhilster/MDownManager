# License & Branding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a three-tier license system (Free / Commercial / Non-profit) with RS256 JWT token verification in Rust, feature gating in React, a branded splash screen, and a license/branding block in Settings.

**Architecture:** License tokens are RS256-signed JWTs verified offline against a hardcoded public key in the Rust backend. A `get_license` Tauri command loads the active license from the SQLite `settings` table (key `"license_token"`) and returns an `ActiveLicense` struct. The React frontend reads this once on mount via a `LicenseContext`, gates locked features, and renders the tier-appropriate splash screen and Settings footer.

**Tech Stack:** Rust (`jsonwebtoken` v9 with `rsa` feature), React 19, TypeScript, Tauri v2, SQLite (existing `settings` table — no new migrations needed)

---

## File Map

### New files
| File | Responsibility |
|---|---|
| `src-tauri/src/license/mod.rs` | `verify_token`, `default_free_license`, public key constant |
| `src-tauri/src/license/types.rs` | `LicenseClaims`, `ActiveLicense`, `Tier`, `Feature`, `BrandingVariant` |
| `src-tauri/src/commands/license.rs` | Tauri commands: `get_license`, `activate_license`, `deactivate_license` |
| `src/lib/license.ts` | TypeScript types + `invoke` wrappers |
| `src/lib/licenseContext.tsx` | `LicenseContext`, `LicenseProvider`, `useGate` hook |
| `src/components/layout/SplashScreen.tsx` | Animated splash with tier branding strip |

### Modified files
| File | Change |
|---|---|
| `src-tauri/Cargo.toml` | Add `jsonwebtoken`, `rsa`, `rand` dev-dep |
| `src-tauri/src/commands/mod.rs` | Add `pub mod license` |
| `src-tauri/src/lib.rs` | `mod license`; register 3 new commands |
| `src/App.tsx` | Wrap with `LicenseProvider`; show `SplashScreen` on mount |
| `src/pages/SettingsPage.tsx` | Add License section + Teambotics footer |
| `src/components/layout/Sidebar.tsx` | (no change in this plan — ? icon is Plan 2) |

---

## Task 1: Add Cargo dependencies

**Files:**
- Modify: `src-tauri/Cargo.toml`

- [ ] **Step 1: Add dependencies**

Open `src-tauri/Cargo.toml` and add under `[dependencies]`:

```toml
# License token verification
jsonwebtoken = { version = "9", features = [] }
rsa = { version = "0.9", features = ["pem", "sha2"] }
```

And add a `[dev-dependencies]` section at the end of the file:

```toml
[dev-dependencies]
rand = "0.8"
```

- [ ] **Step 2: Verify it compiles**

```powershell
cd src-tauri && cargo check
```

Expected: no errors (warnings about unused deps are fine at this stage).

- [ ] **Step 3: Commit**

```bash
git add src-tauri/Cargo.toml
git commit -m "feat(license): add jsonwebtoken + rsa deps"
```

---

## Task 2: License types

**Files:**
- Create: `src-tauri/src/license/types.rs`

- [ ] **Step 1: Write the types**

Create `src-tauri/src/license/types.rs`:

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Tier {
    Free,
    Commercial,
    Nonprofit,
}

impl Default for Tier {
    fn default() -> Self {
        Tier::Free
    }
}

impl std::fmt::Display for Tier {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Tier::Free => write!(f, "free"),
            Tier::Commercial => write!(f, "commercial"),
            Tier::Nonprofit => write!(f, "nonprofit"),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Feature {
    AgentApi,
    AutoScan,
    SemanticSearch,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BrandingVariant {
    Free,
    Commercial,
    Nonprofit,
}

impl Default for BrandingVariant {
    fn default() -> Self {
        BrandingVariant::Free
    }
}

/// JWT payload — matches the token issued by the Teambotics backend.
#[derive(Debug, Serialize, Deserialize)]
pub struct LicenseClaims {
    /// "teambotics"
    pub iss: String,
    /// Unix timestamp
    pub iat: i64,
    /// Unix timestamp
    pub exp: i64,
    pub tier: Tier,
    pub features: Vec<Feature>,
    pub branding_variant: BrandingVariant,
    /// Only present for nonprofit tokens
    #[serde(skip_serializing_if = "Option::is_none")]
    pub org_name: Option<String>,
}

/// The resolved license the rest of the app works with.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActiveLicense {
    pub tier: Tier,
    pub features: Vec<Feature>,
    pub branding_variant: BrandingVariant,
    pub org_name: Option<String>,
    /// Seconds since epoch; None for the implicit free tier (no expiry)
    pub expires_at: Option<i64>,
}

impl ActiveLicense {
    pub fn has_feature(&self, feature: &Feature) -> bool {
        self.features.contains(feature)
    }

    pub fn from_claims(claims: LicenseClaims) -> Self {
        Self {
            tier: claims.tier,
            features: claims.features,
            branding_variant: claims.branding_variant,
            org_name: claims.org_name,
            expires_at: Some(claims.exp),
        }
    }
}
```

- [ ] **Step 2: Commit**

```bash
git add src-tauri/src/license/types.rs
git commit -m "feat(license): add license types"
```

---

## Task 3: License verification

**Files:**
- Create: `src-tauri/src/license/mod.rs`

- [ ] **Step 1: Write the verification module with tests**

Create `src-tauri/src/license/mod.rs`:

```rust
pub mod types;

use anyhow::{anyhow, Result};
use jsonwebtoken::{decode, Algorithm, DecodingKey, Validation};
use types::{ActiveLicense, BrandingVariant, Feature, LicenseClaims, Tier};

/// RSA-2048 public key used to verify license tokens issued by teambotics.com.
/// Replace with the real production public key before shipping.
/// Generate a test pair: `openssl genrsa -out test.pem 2048 && openssl rsa -in test.pem -pubout -out test_pub.pem`
const PUBLIC_KEY_PEM: &str = "-----BEGIN PUBLIC KEY-----
REPLACE_WITH_REAL_PUBLIC_KEY_PEM
-----END PUBLIC KEY-----";

pub fn verify_token(token: &str) -> Result<ActiveLicense> {
    let key = DecodingKey::from_rsa_pem(PUBLIC_KEY_PEM.as_bytes())
        .map_err(|e| anyhow!("Invalid public key: {e}"))?;

    let mut validation = Validation::new(Algorithm::RS256);
    validation.set_issuer(&["teambotics"]);
    validation.validate_exp = true;

    let data = decode::<LicenseClaims>(token, &key, &validation)
        .map_err(|e| anyhow!("Token invalid: {e}"))?;

    Ok(ActiveLicense::from_claims(data.claims))
}

pub fn default_free_license() -> ActiveLicense {
    ActiveLicense {
        tier: Tier::Free,
        features: vec![],
        branding_variant: BrandingVariant::Free,
        org_name: None,
        expires_at: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use jsonwebtoken::{encode, Algorithm, EncodingKey, Header};
    use rsa::pkcs8::{EncodePrivateKey, EncodePublicKey, LineEnding};
    use rsa::RsaPrivateKey;
    use types::LicenseClaims;

    fn make_test_keypair() -> (String, String) {
        let mut rng = rand::thread_rng();
        let private_key = RsaPrivateKey::new(&mut rng, 2048).unwrap();
        let priv_pem = private_key
            .to_pkcs8_pem(LineEnding::LF)
            .unwrap()
            .to_string();
        let pub_pem = private_key
            .to_public_key()
            .to_public_key_pem(LineEnding::LF)
            .unwrap();
        (priv_pem, pub_pem)
    }

    fn sign_token(claims: &LicenseClaims, private_pem: &str) -> String {
        let key = EncodingKey::from_rsa_pem(private_pem.as_bytes()).unwrap();
        encode(&Header::new(Algorithm::RS256), claims, &key).unwrap()
    }

    fn commercial_claims(exp: i64) -> LicenseClaims {
        LicenseClaims {
            iss: "teambotics".to_string(),
            iat: 0,
            exp,
            tier: Tier::Commercial,
            features: vec![
                Feature::AgentApi,
                Feature::AutoScan,
                Feature::SemanticSearch,
            ],
            branding_variant: BrandingVariant::Commercial,
            org_name: None,
        }
    }

    /// Verify a valid commercial token is accepted and features parse correctly.
    #[test]
    fn test_valid_commercial_token() {
        let (priv_pem, pub_pem) = make_test_keypair();
        let future_exp = chrono::Utc::now().timestamp() + 86_400;
        let claims = commercial_claims(future_exp);
        let token = sign_token(&claims, &priv_pem);

        // Patch the module-level key for this test by calling the internal decoder directly
        let key = DecodingKey::from_rsa_pem(pub_pem.as_bytes()).unwrap();
        let mut validation = Validation::new(Algorithm::RS256);
        validation.set_issuer(&["teambotics"]);
        validation.validate_exp = true;

        let result = decode::<LicenseClaims>(&token, &key, &validation);
        assert!(result.is_ok());
        let active = ActiveLicense::from_claims(result.unwrap().claims);
        assert_eq!(active.tier, Tier::Commercial);
        assert!(active.has_feature(&Feature::AgentApi));
        assert!(active.has_feature(&Feature::AutoScan));
        assert!(active.has_feature(&Feature::SemanticSearch));
    }

    /// Expired tokens must be rejected.
    #[test]
    fn test_expired_token_rejected() {
        let (priv_pem, pub_pem) = make_test_keypair();
        let past_exp = chrono::Utc::now().timestamp() - 1;
        let claims = commercial_claims(past_exp);
        let token = sign_token(&claims, &priv_pem);

        let key = DecodingKey::from_rsa_pem(pub_pem.as_bytes()).unwrap();
        let mut validation = Validation::new(Algorithm::RS256);
        validation.set_issuer(&["teambotics"]);
        validation.validate_exp = true;

        let result = decode::<LicenseClaims>(&token, &key, &validation);
        assert!(result.is_err());
    }

    /// Wrong issuer must be rejected.
    #[test]
    fn test_wrong_issuer_rejected() {
        let (priv_pem, pub_pem) = make_test_keypair();
        let mut claims = commercial_claims(chrono::Utc::now().timestamp() + 86_400);
        claims.iss = "evil-corp".to_string();
        let token = sign_token(&claims, &priv_pem);

        let key = DecodingKey::from_rsa_pem(pub_pem.as_bytes()).unwrap();
        let mut validation = Validation::new(Algorithm::RS256);
        validation.set_issuer(&["teambotics"]);
        validation.validate_exp = true;

        let result = decode::<LicenseClaims>(&token, &key, &validation);
        assert!(result.is_err());
    }

    /// No token → free license defaults are correct.
    #[test]
    fn test_default_free_license() {
        let license = default_free_license();
        assert_eq!(license.tier, Tier::Free);
        assert!(!license.has_feature(&Feature::AgentApi));
        assert!(license.expires_at.is_none());
    }

    /// Nonprofit token includes org_name.
    #[test]
    fn test_nonprofit_token_includes_org_name() {
        let (priv_pem, pub_pem) = make_test_keypair();
        let claims = LicenseClaims {
            iss: "teambotics".to_string(),
            iat: 0,
            exp: chrono::Utc::now().timestamp() + 86_400,
            tier: Tier::Nonprofit,
            features: vec![Feature::AgentApi, Feature::AutoScan, Feature::SemanticSearch],
            branding_variant: BrandingVariant::Nonprofit,
            org_name: Some("Greenpeace UK".to_string()),
        };
        let token = sign_token(&claims, &priv_pem);

        let key = DecodingKey::from_rsa_pem(pub_pem.as_bytes()).unwrap();
        let mut validation = Validation::new(Algorithm::RS256);
        validation.set_issuer(&["teambotics"]);
        validation.validate_exp = true;

        let active = ActiveLicense::from_claims(
            decode::<LicenseClaims>(&token, &key, &validation)
                .unwrap()
                .claims,
        );
        assert_eq!(active.org_name.as_deref(), Some("Greenpeace UK"));
        assert_eq!(active.tier, Tier::Nonprofit);
    }
}
```

- [ ] **Step 2: Run tests**

```powershell
cd src-tauri && cargo test license
```

Expected output:
```
test license::tests::test_default_free_license ... ok
test license::tests::test_expired_token_rejected ... ok
test license::tests::test_nonprofit_token_includes_org_name ... ok
test license::tests::test_valid_commercial_token ... ok
test license::tests::test_wrong_issuer_rejected ... ok

test result: ok. 5 passed; 0 failed
```

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/license/
git commit -m "feat(license): add token verification with tests"
```

---

## Task 4: License Tauri commands

**Files:**
- Create: `src-tauri/src/commands/license.rs`
- Modify: `src-tauri/src/commands/mod.rs`

- [ ] **Step 1: Write the commands**

Create `src-tauri/src/commands/license.rs`:

```rust
use tauri::State;

use crate::db::queries;
use crate::license::{default_free_license, verify_token};
use crate::license::types::ActiveLicense;
use crate::commands::vault::DbState;

/// Returns the current active license. Falls back to Free if no token is stored
/// or if the stored token fails verification.
#[tauri::command]
pub fn get_license(state: State<DbState>) -> ActiveLicense {
    let conn = match state.0.lock() {
        Ok(c) => c,
        Err(_) => return default_free_license(),
    };

    let token = match queries::get_setting(&conn, "license_token") {
        Ok(Some(t)) => t,
        _ => return default_free_license(),
    };

    verify_token(&token).unwrap_or_else(|_| default_free_license())
}

/// Verifies and persists a new license token. Returns the resulting ActiveLicense
/// so the frontend can update immediately without a second call.
#[tauri::command]
pub fn activate_license(token: String, state: State<DbState>) -> Result<ActiveLicense, String> {
    let license = verify_token(&token).map_err(|e| e.to_string())?;

    let conn = state.0.lock().map_err(|e| e.to_string())?;
    queries::set_setting(&conn, "license_token", &token).map_err(|e| e.to_string())?;

    Ok(license)
}

/// Clears the stored token, reverting the app to Free tier.
#[tauri::command]
pub fn deactivate_license(state: State<DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    queries::set_setting(&conn, "license_token", "").map_err(|e| e.to_string())
}
```

- [ ] **Step 2: Register the module**

Edit `src-tauri/src/commands/mod.rs` — add one line:

```rust
pub mod ai;
pub mod embeddings;
pub mod git;
pub mod license;
pub mod scanner;
pub mod vault;
```

- [ ] **Step 3: Wire into lib.rs**

Edit `src-tauri/src/lib.rs`:

Add `mod license;` after the existing `mod` declarations:

```rust
mod api;
mod commands;
mod db;
mod embeddings;
mod git;
mod license;   // ← add this
mod scanner;
mod vault;
```

Add the three imports after the existing `use commands::{...}` block:

```rust
use commands::license::{activate_license, deactivate_license, get_license};
```

Add the three commands to `.invoke_handler`:

```rust
// license
get_license,
activate_license,
deactivate_license,
```

- [ ] **Step 4: Build check**

```powershell
cd src-tauri && cargo check
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands/license.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs
git commit -m "feat(license): add get_license, activate_license, deactivate_license commands"
```

---

## Task 5: TypeScript license bindings

**Files:**
- Create: `src/lib/license.ts`

- [ ] **Step 1: Write bindings**

Create `src/lib/license.ts`:

```typescript
import { invoke } from "@tauri-apps/api/core";

export type Tier = "free" | "commercial" | "nonprofit";

export type Feature = "agent_api" | "auto_scan" | "semantic_search";

export type BrandingVariant = "free" | "commercial" | "nonprofit";

export interface ActiveLicense {
  tier: Tier;
  features: Feature[];
  branding_variant: BrandingVariant;
  org_name: string | null;
  /** Unix timestamp seconds, or null for the implicit free tier */
  expires_at: number | null;
}

export const FREE_LICENSE: ActiveLicense = {
  tier: "free",
  features: [],
  branding_variant: "free",
  org_name: null,
  expires_at: null,
};

export function hasFeature(license: ActiveLicense, feature: Feature): boolean {
  return license.features.includes(feature);
}

export const getLicense = () => invoke<ActiveLicense>("get_license");

export const activateLicense = (token: string) =>
  invoke<ActiveLicense>("activate_license", { token });

export const deactivateLicense = () => invoke<void>("deactivate_license");

/** Maps a tier to the text shown in the splash screen branding strip. */
export function splashStripLabel(license: ActiveLicense): string {
  switch (license.tier) {
    case "nonprofit":
      return "Non-profit Edition · Powered by Teambotics";
    case "commercial":
      return "Powered by Teambotics";
    case "free":
    default:
      return "Free Edition";
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/license.ts
git commit -m "feat(license): add TypeScript bindings"
```

---

## Task 6: LicenseContext

**Files:**
- Create: `src/lib/licenseContext.tsx`

- [ ] **Step 1: Write the context**

Create `src/lib/licenseContext.tsx`:

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/licenseContext.tsx
git commit -m "feat(license): add LicenseContext and useLicense hook"
```

---

## Task 7: Splash screen component

**Files:**
- Create: `src/components/layout/SplashScreen.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/layout/SplashScreen.tsx`:

```typescript
import { useEffect, useState } from "react";

interface SplashScreenProps {
  brandingLabel: string;
  onDone: () => void;
  /** Minimum display time in ms. Default 1400. */
  minDuration?: number;
}

export function SplashScreen({
  brandingLabel,
  onDone,
  minDuration = 1400,
}: SplashScreenProps) {
  const [progress, setProgress] = useState(0);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    // Animate progress bar over minDuration
    const step = 100 / (minDuration / 30);
    const interval = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          clearInterval(interval);
          return 100;
        }
        return Math.min(p + step, 100);
      });
    }, 30);

    const timer = setTimeout(() => {
      setFadeOut(true);
      setTimeout(onDone, 300); // wait for fade-out transition
    }, minDuration);

    return () => {
      clearInterval(interval);
      clearTimeout(timer);
    };
  }, [minDuration, onDone]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-[var(--color-background)] transition-opacity duration-300"
      style={{ opacity: fadeOut ? 0 : 1 }}
    >
      {/* App logo + name */}
      <div className="flex flex-col items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-[var(--color-accent)] flex items-center justify-center">
          <span className="text-white font-bold text-xl">M</span>
        </div>
        <span className="text-lg font-semibold text-[var(--color-text-primary)] tracking-tight">
          MdownManager
        </span>

        {/* Progress bar */}
        <div className="w-20 h-0.5 bg-[var(--color-surface-2)] rounded-full overflow-hidden mt-2">
          <div
            className="h-full bg-[var(--color-accent)] rounded-full transition-all duration-75"
            style={{ width: `${progress}%`, opacity: 0.7 }}
          />
        </div>
      </div>

      {/* Branding strip pinned to bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-9 border-t border-[var(--color-border-subtle)] flex items-center justify-center gap-2">
        <div className="w-3.5 h-3.5 rounded-sm bg-[var(--color-surface-2)] flex items-center justify-center">
          <div className="w-2 h-2 rounded-[2px] bg-[var(--color-accent)] opacity-60" />
        </div>
        <span className="text-[10px] text-[var(--color-text-muted)] tracking-wide">
          {brandingLabel}
        </span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/layout/SplashScreen.tsx
git commit -m "feat(branding): add SplashScreen component"
```

---

## Task 8: Wire splash + LicenseProvider into App.tsx

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: Update App.tsx**

Replace the entire contents of `src/App.tsx` with:

```typescript
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

  // Keep splash up until license is loaded AND its minimum duration has elapsed.
  // splashDone flips when the animation timer fires; we only hide the splash
  // once both conditions are true.
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
```

- [ ] **Step 2: Run dev server and check splash renders**

```powershell
npm run tauri dev
```

Expected: splash screen appears for ~1.4 s with "Free Edition" branding strip, then fades into the main UI. No console errors.

- [ ] **Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat(branding): wire SplashScreen and LicenseProvider into App"
```

---

## Task 9: Settings — License section + Teambotics footer

**Files:**
- Modify: `src/pages/SettingsPage.tsx`

- [ ] **Step 1: Add imports to SettingsPage.tsx**

At the top of `src/pages/SettingsPage.tsx`, add after the existing imports:

```typescript
import { ExternalLink, BadgeCheck } from "lucide-react";
import { useLicense } from "@/lib/licenseContext";
import { activateLicense } from "@/lib/license";
```

- [ ] **Step 2: Add license state inside the SettingsPage function**

Inside `export function SettingsPage()`, after the existing state declarations, add:

```typescript
const { license, refresh } = useLicense();
const [licenseToken, setLicenseToken] = useState("");
const [activating, setActivating] = useState(false);
const [deactivating, setDeactivating] = useState(false);
```

- [ ] **Step 3: Add the activate handler inside SettingsPage**

After the `handleSaveCloudKey` function, add:

```typescript
const handleActivateLicense = async () => {
  if (!licenseToken.trim()) return;
  setActivating(true);
  try {
    await activateLicense(licenseToken.trim());
    await refresh();
    setLicenseToken("");
    toast("License activated", "success");
  } catch (e) {
    toast(`Invalid license token: ${e}`);
  } finally {
    setActivating(false);
  }
};

const handleDeactivateLicense = async () => {
  setDeactivating(true);
  try {
    const { deactivate } = useLicense(); // not valid — see note
    // Note: call deactivate directly via invoke instead
    const { deactivateLicense } = await import("@/lib/license");
    await deactivateLicense();
    await refresh();
    toast("License removed — reverted to Free", "success");
  } catch (e) {
    toast(`Failed to deactivate: ${e}`);
  } finally {
    setDeactivating(false);
  }
};
```

> **Note:** hooks can't be called conditionally. Replace the `handleDeactivateLicense` body with:

```typescript
const { deactivate } = useLicense();

const handleDeactivateLicense = async () => {
  setDeactivating(true);
  try {
    await deactivate();
    toast("License removed — reverted to Free", "success");
  } catch (e) {
    toast(`Failed to deactivate: ${e}`);
  } finally {
    setDeactivating(false);
  }
};
```

(Replace the earlier `const { license, refresh } = useLicense();` with `const { license, refresh, deactivate } = useLicense();` and remove the duplicate `deactivate` declaration.)

- [ ] **Step 4: Add License section JSX**

In the JSX return of `SettingsPage`, add this section before the final health check `<section>`:

```typescript
{/* License */}
<section className="space-y-4">
  <div className="flex items-center gap-2">
    <BadgeCheck size={15} className="text-[var(--color-accent)]" />
    <h2 className="text-sm font-semibold text-[var(--color-text-primary)] uppercase tracking-wider">
      License
    </h2>
  </div>

  {license.tier === "free" ? (
    <div className="space-y-3">
      <p className="text-sm text-[var(--color-text-muted)]">
        Running on the <strong className="text-[var(--color-text-secondary)]">Free</strong> tier.
        The Local Agent API and auto-scan require a Commercial or Non-profit license.
      </p>
      <p className="text-xs text-[var(--color-text-muted)]">
        Purchase at{" "}
        <a href="https://teambotics.com/mdownmanager" target="_blank" rel="noopener noreferrer"
          className="text-[var(--color-accent)] hover:underline">
          teambotics.com/mdownmanager
        </a>{" "}
        · Non-profits apply at{" "}
        <a href="https://teambotics.com/nonprofit" target="_blank" rel="noopener noreferrer"
          className="text-[var(--color-accent)] hover:underline">
          teambotics.com/nonprofit
        </a>
      </p>
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={licenseToken}
          placeholder="Paste license token…"
          onChange={(e) => setLicenseToken(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleActivateLicense()}
          className="flex-1 text-xs font-mono bg-[var(--color-surface-2)] border border-[var(--color-border-subtle)] rounded px-3 py-1.5 text-[var(--color-text-secondary)] focus:outline-none focus:border-[var(--color-accent)]"
        />
        <button
          onClick={handleActivateLicense}
          disabled={activating || !licenseToken.trim()}
          className="shrink-0 text-xs px-3 py-1.5 rounded bg-[var(--color-accent)] text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {activating ? "Activating…" : "Activate"}
        </button>
      </div>
    </div>
  ) : (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--color-accent)]/15 text-[var(--color-accent)] font-medium capitalize">
          {license.tier === "nonprofit" ? "Non-profit" : "Commercial"}
        </span>
        <span className="text-xs text-[var(--color-text-muted)]">license active</span>
      </div>
      {license.org_name && (
        <p className="text-xs text-[var(--color-text-muted)]">
          Licensed to: <span className="text-[var(--color-text-secondary)]">{license.org_name}</span>
        </p>
      )}
      {license.expires_at && (
        <p className="text-xs text-[var(--color-text-muted)]">
          Expires:{" "}
          <span className="text-[var(--color-text-secondary)]">
            {new Date(license.expires_at * 1000).toLocaleDateString()}
          </span>
        </p>
      )}
      <button
        onClick={handleDeactivateLicense}
        disabled={deactivating}
        className="text-xs text-[var(--color-text-muted)] hover:text-red-400 transition-colors disabled:opacity-50"
      >
        {deactivating ? "Removing…" : "Remove license"}
      </button>
    </div>
  )}
</section>
```

- [ ] **Step 5: Add Teambotics footer block**

Add this as the very last element inside the outermost `<div>` of the SettingsPage return, after the health check section:

```typescript
{/* Teambotics credit footer */}
<div className="border-t border-[var(--color-border-subtle)] pt-6 flex items-center gap-3">
  <div className="w-6 h-6 rounded bg-[var(--color-surface-2)] flex items-center justify-center shrink-0">
    <div className="w-3 h-3 rounded-[3px] bg-[var(--color-accent)] opacity-60" />
  </div>
  <div>
    <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
      {license.tier === "nonprofit"
        ? `Non-profit license${license.org_name ? ` · Licensed to ${license.org_name}` : ""}`
        : license.tier === "commercial"
        ? "Commercial license"
        : "Free"}{" "}
      · Powered by{" "}
      <a
        href="https://teambotics.com"
        target="_blank"
        rel="noopener noreferrer"
        className="text-[var(--color-accent)] hover:underline inline-flex items-center gap-0.5"
      >
        Teambotics
        <ExternalLink size={10} className="inline" />
      </a>
    </p>
    <p className="text-[10px] text-[var(--color-text-muted)] opacity-50 mt-0.5">
      MdownManager v{__APP_VERSION__}
    </p>
  </div>
</div>
```

> **Note:** `__APP_VERSION__` requires a Vite define. Add to `vite.config.ts` (create if not present, or add to the existing config):
> ```typescript
> define: {
>   __APP_VERSION__: JSON.stringify(process.env.npm_package_version ?? "0.1.0"),
> }
> ```
> And add `declare const __APP_VERSION__: string;` to `src/vite-env.d.ts`.

- [ ] **Step 6: Run dev server and verify**

```powershell
npm run tauri dev
```

Expected: Settings page shows a "License" section with token paste field (Free tier), and a Teambotics footer credit block at the bottom.

- [ ] **Step 7: Commit**

```bash
git add src/pages/SettingsPage.tsx src/vite-env.d.ts vite.config.ts
git commit -m "feat(branding): add license section and Teambotics footer to Settings"
```

---

## Task 10: Gate the Agent API section behind the license

**Files:**
- Modify: `src/pages/SettingsPage.tsx`

- [ ] **Step 1: Import `gate` from context**

The `gate` function is already available from `useLicense()`. Destructure it:

```typescript
const { license, refresh, deactivate, gate } = useLicense();
```

- [ ] **Step 2: Wrap the Agent API section with a gate check**

In the Agent API `<section>` in `SettingsPage.tsx`, wrap the inner content (below the heading and description paragraph) with:

```typescript
{gate("agent_api") ? (
  /* existing API key display, endpoint fields, example requests, Claude Code snippet */
  <>
    {/* ... existing Field label="Endpoint" ... */}
    {/* ... existing Field label="API Key" ... */}
  </>
) : (
  <div className="rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-2)] px-4 py-3">
    <p className="text-sm text-[var(--color-text-muted)]">
      The Local Agent API is available on <strong className="text-[var(--color-text-secondary)]">Commercial</strong> and <strong className="text-[var(--color-text-secondary)]">Non-profit</strong> licenses.
    </p>
    <a
      href="https://teambotics.com/mdownmanager"
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 inline-block text-xs text-[var(--color-accent)] hover:underline"
    >
      Upgrade →
    </a>
  </div>
)}
```

Do the same for the **Example Requests** and **Claude Code Integration** sections — wrap both in `{gate("agent_api") && ( ... )}` since they only make sense when the API is accessible.

- [ ] **Step 3: Verify in dev server**

```powershell
npm run tauri dev
```

Expected (Free tier): Agent API section shows upgrade prompt instead of the bearer token fields. Settings still loads without errors.

- [ ] **Step 4: Commit**

```bash
git add src/pages/SettingsPage.tsx
git commit -m "feat(license): gate Agent API UI behind license feature flag"
```

---

## Task 11: Gate vault count on Free tier

**Files:**
- Modify: `src/pages/VaultPage.tsx`

- [ ] **Step 1: Import useLicense in VaultPage**

Add at the top of `src/pages/VaultPage.tsx`:

```typescript
import { useLicense } from "@/lib/licenseContext";
```

- [ ] **Step 2: Destructure gate inside VaultPage**

Inside the `VaultPage` function body, add:

```typescript
const { gate, license } = useLicense();
```

- [ ] **Step 3: Block second vault add on Free tier**

Find the `addVault` call handler (the function that calls `addVault(path, name)`). Before executing it, add:

```typescript
if (license.tier === "free" && vaults.length >= 1) {
  toast("Free tier supports one vault. Upgrade to add more.");
  return;
}
```

- [ ] **Step 4: Verify**

```powershell
npm run tauri dev
```

Expected: On Free tier, attempting to add a second vault shows the toast and does not open the folder picker.

- [ ] **Step 5: Commit**

```bash
git add src/pages/VaultPage.tsx
git commit -m "feat(license): limit Free tier to one vault"
```

---

## Self-Review Notes

- `verify_token` uses the `PUBLIC_KEY_PEM` constant. Before shipping, replace the placeholder with the real Teambotics production RSA-2048 public key PEM.
- `__APP_VERSION__` requires the `vite.config.ts` `define` addition (covered in Task 9 Step 5).
- The 7-day grace period for offline expired tokens is **not implemented** in this plan — it is a v2 enhancement. Currently an expired token immediately falls back to Free.
- Watcher gating (`auto_scan` feature flag → start `VaultWatcher`) is deferred: the watcher struct exists but nothing starts it today, so no functionality regresses on Free tier. A future task should start the watcher in `lib.rs` only when `license.has_feature(&Feature::AutoScan)`.

---

## Next Plan

See `docs/superpowers/plans/2026-06-14-help-system.md` for the guided tour overlay + bundled HTML reference implementation.
