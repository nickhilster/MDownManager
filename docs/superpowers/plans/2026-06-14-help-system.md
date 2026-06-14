# Help System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a guided tour overlay system (step-by-step tooltips on the live UI) and a bundled interactive HTML reference document, both accessible via a `?` icon in the sidebar.

**Architecture:** A `TourOverlay` component sits in `Shell` above all content. It reads `data-tour-target` attributes already placed on key UI elements to locate them via `getBoundingClientRect()`, then renders a positioned `TourTooltip` plus a translucent backdrop. Tour state (`seen`, `step`) is persisted in the SQLite `settings` table via two new Tauri commands. The Help page is a new `page` type in `App.tsx` that renders `src/assets/help.html` in a sandboxed `<iframe>`.

**Tech Stack:** React 19, TypeScript, Tauri v2, SQLite (`settings` table — existing), plain HTML/CSS for `help.html`

**Prerequisite:** The License & Branding plan (`2026-06-14-license-branding.md`) must be complete — this plan imports `useLicense` and expects `LicenseProvider` to already wrap the app.

---

## File Map

### New files
| File | Responsibility |
|---|---|
| `src-tauri/src/commands/help.rs` | `get_tour_state`, `set_tour_seen`, `set_tour_step` commands |
| `src/lib/help.ts` | TypeScript bindings for tour state commands |
| `src/hooks/useTour.ts` | Hook: loads/persists tour state, exposes step controls |
| `src/components/help/TourTooltip.tsx` | The tooltip card (title, body, prev/next, progress dots, skip) |
| `src/components/help/TourOverlay.tsx` | Backdrop + tooltip positioned over highlighted element |
| `src/pages/HelpPage.tsx` | Renders bundled `help.html` in an iframe |
| `src/assets/help.html` | Bundled interactive HTML reference document |

### Modified files
| File | Change |
|---|---|
| `src-tauri/src/commands/mod.rs` | Add `pub mod help` |
| `src-tauri/src/lib.rs` | Register 3 new help commands |
| `src/App.tsx` | Add `"help"` page type; route to `HelpPage` |
| `src/components/layout/Shell.tsx` | Mount `TourOverlay`; pass `onOpenHelp` down |
| `src/components/layout/Sidebar.tsx` | Add `?` icon above Settings gear |
| `src/components/layout/TopBar.tsx` | Add `data-tour-target="topbar"` |
| `src/pages/VaultPage.tsx` | Add `data-tour-target` on file table container and vault nav area |
| `src/pages/ScannerPage.tsx` | Add `data-tour-target="scanner-page"` |
| `src/pages/SettingsPage.tsx` | Add `data-tour-target` on Agent API section and AI keys section |

---

## Task 1: Tour state Rust commands

**Files:**
- Create: `src-tauri/src/commands/help.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Write the commands**

Create `src-tauri/src/commands/help.rs`:

```rust
use tauri::State;
use crate::commands::vault::DbState;
use crate::db::queries;

#[derive(serde::Serialize, serde::Deserialize)]
pub struct TourState {
    pub seen: bool,
    pub step: u8,
}

/// Returns the current tour state from settings.
#[tauri::command]
pub fn get_tour_state(state: State<DbState>) -> TourState {
    let conn = match state.0.lock() {
        Ok(c) => c,
        Err(_) => return TourState { seen: false, step: 0 },
    };
    let seen = queries::get_setting(&conn, "help_tour_seen")
        .ok()
        .flatten()
        .map(|v| v == "true")
        .unwrap_or(false);
    let step = queries::get_setting(&conn, "help_tour_step")
        .ok()
        .flatten()
        .and_then(|v| v.parse::<u8>().ok())
        .unwrap_or(0);
    TourState { seen, step }
}

/// Marks the tour as fully seen. Called when the user reaches the last step or clicks Skip.
#[tauri::command]
pub fn set_tour_seen(state: State<DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    queries::set_setting(&conn, "help_tour_seen", "true").map_err(|e| e.to_string())?;
    queries::set_setting(&conn, "help_tour_step", "0").map_err(|e| e.to_string())
}

/// Persists the current step so a mid-tour close can resume where it left off.
#[tauri::command]
pub fn set_tour_step(step: u8, state: State<DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    queries::set_setting(&conn, "help_tour_step", &step.to_string()).map_err(|e| e.to_string())
}
```

- [ ] **Step 2: Write tests**

Add at the bottom of `src-tauri/src/commands/help.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;
    use tempfile::NamedTempFile;

    fn open_test_db() -> rusqlite::Connection {
        let conn = rusqlite::Connection::open_in_memory().unwrap();
        db::migrations::run(&conn).unwrap();
        conn
    }

    #[test]
    fn test_tour_state_defaults_to_unseen() {
        let conn = open_test_db();
        let seen = crate::db::queries::get_setting(&conn, "help_tour_seen")
            .unwrap()
            .is_none();
        assert!(seen, "no tour state in fresh DB");
    }

    #[test]
    fn test_set_and_get_tour_step() {
        let conn = open_test_db();
        crate::db::queries::set_setting(&conn, "help_tour_step", "3").unwrap();
        let step: u8 = crate::db::queries::get_setting(&conn, "help_tour_step")
            .unwrap()
            .unwrap()
            .parse()
            .unwrap();
        assert_eq!(step, 3);
    }
}
```

- [ ] **Step 3: Register**

Add to `src-tauri/src/commands/mod.rs`:

```rust
pub mod help;
```

Add to `src-tauri/src/lib.rs` imports:

```rust
use commands::help::{get_tour_state, set_tour_seen, set_tour_step};
```

Add to the `.invoke_handler` in `src-tauri/src/lib.rs`:

```rust
// help / tour
get_tour_state,
set_tour_seen,
set_tour_step,
```

- [ ] **Step 4: Run tests**

```powershell
cd src-tauri && cargo test help
```

Expected:
```
test commands::help::tests::test_set_and_get_tour_step ... ok
test commands::help::tests::test_tour_state_defaults_to_unseen ... ok

test result: ok. 2 passed; 0 failed
```

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands/help.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs
git commit -m "feat(help): add tour state Tauri commands"
```

---

## Task 2: TypeScript help bindings + useTour hook

**Files:**
- Create: `src/lib/help.ts`
- Create: `src/hooks/useTour.ts`

- [ ] **Step 1: Write bindings**

Create `src/lib/help.ts`:

```typescript
import { invoke } from "@tauri-apps/api/core";

export interface TourState {
  seen: boolean;
  step: number;
}

export const getTourState = () => invoke<TourState>("get_tour_state");
export const setTourSeen = () => invoke<void>("set_tour_seen");
export const setTourStep = (step: number) => invoke<void>("set_tour_step", { step });
```

- [ ] **Step 2: Define tour steps**

Add to `src/lib/help.ts` after the invoke wrappers:

```typescript
export interface TourStep {
  /** Matches a data-tour-target attribute on a DOM element */
  target: string;
  title: string;
  body: string;
  /** Which page must be active for this step's target to exist in the DOM */
  page: "vault" | "scanner" | "settings";
}

export const TOUR_STEPS: TourStep[] = [
  {
    target: "sidebar-logo",
    title: "Welcome to MdownManager",
    body: "MdownManager turns your Markdown files into a safe, scanned vault. Only clean files reach your AI coding agents — secrets and PII stay out.",
    page: "vault",
  },
  {
    target: "vault-file-table",
    title: "Your vault",
    body: "Browse and preview your Markdown files here. The coloured dot next to each file is its risk badge — green is safe, amber needs review, red is blocked from the Agent API.",
    page: "vault",
  },
  {
    target: "scanner-nav",
    title: "Scanner",
    body: "The scanner checks every file for secrets, API keys, and PII before they can reach an AI agent. Run it on demand or let it watch your vault automatically.",
    page: "vault",
  },
  {
    target: "settings-agent-api",
    title: "Local Agent API",
    body: "IDE agents like Claude Code and Cursor can query your vault at localhost:7734. Only files the scanner has cleared are served — your secrets never leave the machine.",
    page: "settings",
  },
  {
    target: "settings-ai-keys",
    title: "AI Provider Keys",
    body: "Add your own Anthropic, OpenAI, or other cloud API keys to unlock the Summarize feature. Keys are stored locally in the app database — never sent to Teambotics.",
    page: "settings",
  },
];
```

- [ ] **Step 3: Write useTour hook**

Create `src/hooks/useTour.ts`:

```typescript
import { useCallback, useEffect, useState } from "react";
import {
  getTourState,
  setTourSeen,
  setTourStep,
  TOUR_STEPS,
  TourStep,
} from "@/lib/help";

export interface UseTourReturn {
  active: boolean;
  currentStep: number;
  totalSteps: number;
  step: TourStep | null;
  start: () => void;
  next: () => Promise<void>;
  prev: () => Promise<void>;
  skip: () => Promise<void>;
}

export function useTour(): UseTourReturn {
  const [active, setActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const totalSteps = TOUR_STEPS.length;

  useEffect(() => {
    getTourState().then(({ seen, step }) => {
      if (!seen) {
        setCurrentStep(step);
        setActive(true);
      }
    });
  }, []);

  const start = useCallback(() => {
    setCurrentStep(0);
    setActive(true);
  }, []);

  const next = useCallback(async () => {
    const nextStep = currentStep + 1;
    if (nextStep >= totalSteps) {
      setActive(false);
      await setTourSeen();
    } else {
      setCurrentStep(nextStep);
      await setTourStep(nextStep);
    }
  }, [currentStep, totalSteps]);

  const prev = useCallback(async () => {
    const prevStep = Math.max(0, currentStep - 1);
    setCurrentStep(prevStep);
    await setTourStep(prevStep);
  }, [currentStep]);

  const skip = useCallback(async () => {
    setActive(false);
    await setTourSeen();
  }, []);

  return {
    active,
    currentStep,
    totalSteps,
    step: active ? TOUR_STEPS[currentStep] : null,
    start,
    next,
    prev,
    skip,
  };
}
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/help.ts src/hooks/useTour.ts
git commit -m "feat(help): add help bindings and useTour hook"
```

---

## Task 3: TourTooltip component

**Files:**
- Create: `src/components/help/TourTooltip.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/help/TourTooltip.tsx`:

```typescript
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface TourTooltipProps {
  title: string;
  body: string;
  step: number;
  totalSteps: number;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
  /** px coordinates for top-left of the tooltip box */
  x: number;
  y: number;
}

export function TourTooltip({
  title,
  body,
  step,
  totalSteps,
  onNext,
  onPrev,
  onSkip,
  x,
  y,
}: TourTooltipProps) {
  const isFirst = step === 0;
  const isLast = step === totalSteps - 1;

  return (
    <div
      className="fixed z-[200] w-72 rounded-lg border border-[var(--color-accent)]/30 bg-[var(--color-surface)] shadow-2xl p-4"
      style={{ top: y, left: x }}
    >
      {/* Header row */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-semibold text-[var(--color-accent)] uppercase tracking-widest">
          Step {step + 1} of {totalSteps}
        </span>
        <button
          onClick={onSkip}
          className="text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
          title="Skip tour"
        >
          <X size={13} />
        </button>
      </div>

      <p className="text-sm font-semibold text-[var(--color-text-primary)] mb-1.5">{title}</p>
      <p className="text-xs text-[var(--color-text-muted)] leading-relaxed mb-4">{body}</p>

      {/* Progress dots + navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={onPrev}
          disabled={isFirst}
          className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] disabled:opacity-30 transition-colors"
        >
          ← Prev
        </button>

        {/* Dots */}
        <div className="flex gap-1.5 items-center">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className={cn(
                "w-1.5 h-1.5 rounded-full transition-colors",
                i === step
                  ? "bg-[var(--color-accent)]"
                  : "bg-[var(--color-surface-2)]"
              )}
            />
          ))}
        </div>

        <button
          onClick={onNext}
          className="text-xs text-[var(--color-accent)] hover:opacity-80 transition-opacity font-medium"
        >
          {isLast ? "Done" : "Next →"}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/help/TourTooltip.tsx
git commit -m "feat(help): add TourTooltip component"
```

---

## Task 4: TourOverlay component

**Files:**
- Create: `src/components/help/TourOverlay.tsx`

- [ ] **Step 1: Write the overlay**

Create `src/components/help/TourOverlay.tsx`:

```typescript
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { TourTooltip } from "./TourTooltip";
import { TourStep } from "@/lib/help";

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const TOOLTIP_WIDTH = 288; // w-72
const TOOLTIP_HEIGHT = 200; // approximate
const GAP = 12;

/** Choose tooltip position that keeps it on-screen. Prefer below-right of the target. */
function tooltipPosition(rect: Rect): { x: number; y: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let x = rect.left + rect.width + GAP;
  let y = rect.top;

  if (x + TOOLTIP_WIDTH > vw) x = rect.left - TOOLTIP_WIDTH - GAP;
  if (x < 8) x = 8;
  if (y + TOOLTIP_HEIGHT > vh) y = vh - TOOLTIP_HEIGHT - GAP;
  if (y < 8) y = 8;

  return { x, y };
}

interface TourOverlayProps {
  step: TourStep;
  currentStep: number;
  totalSteps: number;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
}

export function TourOverlay({
  step,
  currentStep,
  totalSteps,
  onNext,
  onPrev,
  onSkip,
}: TourOverlayProps) {
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const frameRef = useRef<number | null>(null);

  // Poll the target element's bounding rect — it may not exist immediately
  // if the page needs to navigate first.
  useLayoutEffect(() => {
    const measure = () => {
      const el = document.querySelector(
        `[data-tour-target="${step.target}"]`
      ) as HTMLElement | null;
      if (el) {
        const r = el.getBoundingClientRect();
        setTargetRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      } else {
        setTargetRect(null);
      }
    };

    measure();
    frameRef.current = window.setInterval(measure, 200);
    return () => {
      if (frameRef.current !== null) clearInterval(frameRef.current);
    };
  }, [step.target]);

  const pos = targetRect ? tooltipPosition(targetRect) : { x: 40, y: 40 };
  const PADDING = 6;

  return (
    <>
      {/* Translucent backdrop */}
      <div className="fixed inset-0 z-[190] pointer-events-none">
        {targetRect ? (
          <svg
            className="absolute inset-0 w-full h-full"
            style={{ mixBlendMode: "multiply" }}
          >
            <defs>
              <mask id="tour-mask">
                <rect width="100%" height="100%" fill="white" />
                <rect
                  x={targetRect.left - PADDING}
                  y={targetRect.top - PADDING}
                  width={targetRect.width + PADDING * 2}
                  height={targetRect.height + PADDING * 2}
                  rx="6"
                  fill="black"
                />
              </mask>
            </defs>
            <rect
              width="100%"
              height="100%"
              fill="rgba(0,0,0,0.55)"
              mask="url(#tour-mask)"
            />
          </svg>
        ) : (
          <div className="absolute inset-0 bg-black/55" />
        )}

        {/* Highlight ring around target */}
        {targetRect && (
          <div
            className="absolute rounded-md ring-2 ring-[var(--color-accent)] ring-offset-0 transition-all duration-200"
            style={{
              top: targetRect.top - PADDING,
              left: targetRect.left - PADDING,
              width: targetRect.width + PADDING * 2,
              height: targetRect.height + PADDING * 2,
            }}
          />
        )}
      </div>

      {/* Tooltip — pointer-events enabled */}
      <TourTooltip
        title={step.title}
        body={step.body}
        step={currentStep}
        totalSteps={totalSteps}
        onNext={onNext}
        onPrev={onPrev}
        onSkip={onSkip}
        x={pos.x}
        y={pos.y}
      />
    </>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/help/TourOverlay.tsx
git commit -m "feat(help): add TourOverlay with backdrop and highlight ring"
```

---

## Task 5: Add data-tour-target attributes to UI elements

**Files:**
- Modify: `src/components/layout/Sidebar.tsx` (sidebar logo)
- Modify: `src/components/vault/FileTable.tsx` (vault file table)
- Modify: `src/components/layout/Sidebar.tsx` (scanner nav item)
- Modify: `src/pages/SettingsPage.tsx` (Agent API section, AI keys section)

- [ ] **Step 1: sidebar-logo target**

In `src/components/layout/Sidebar.tsx`, find the logo mark `<div>`:

```typescript
<div className="w-8 h-8 rounded bg-[var(--color-accent)] flex items-center justify-center mb-4">
  <span className="text-white font-bold text-xs">M</span>
</div>
```

Add `data-tour-target="sidebar-logo"`:

```typescript
<div
  data-tour-target="sidebar-logo"
  className="w-8 h-8 rounded bg-[var(--color-accent)] flex items-center justify-center mb-4"
>
  <span className="text-white font-bold text-xs">M</span>
</div>
```

- [ ] **Step 2: vault-file-table target**

In `src/components/vault/FileTable.tsx`, find the outermost wrapper element (likely a `<div>` or `ScrollArea`). Add `data-tour-target="vault-file-table"` to it.

```typescript
<div data-tour-target="vault-file-table" className="...existing classes...">
```

- [ ] **Step 3: scanner-nav target**

In `src/components/layout/Sidebar.tsx`, find the Scanner nav button:

```typescript
{ icon: Shield, label: "Scanner", id: "scanner", page: "scanner" },
```

The button is rendered by the `.map()`. Add `data-tour-target` conditionally:

```typescript
<button
  key={id}
  data-tour-target={id === "scanner" ? "scanner-nav" : undefined}
  title={page ? label : `${label} (coming soon)`}
  ...
>
```

- [ ] **Step 4: settings-agent-api and settings-ai-keys targets**

In `src/pages/SettingsPage.tsx`, add `data-tour-target` on the Agent API section opening tag:

```typescript
<section data-tour-target="settings-agent-api" className="space-y-4">
```

And on the AI Provider Keys section:

```typescript
<section data-tour-target="settings-ai-keys" className="space-y-4">
```

- [ ] **Step 5: Commit**

```bash
git add src/components/layout/Sidebar.tsx src/components/vault/FileTable.tsx src/pages/SettingsPage.tsx
git commit -m "feat(help): add data-tour-target attributes to UI elements"
```

---

## Task 6: Wire TourOverlay into Shell + add ? icon to Sidebar

**Files:**
- Modify: `src/components/layout/Shell.tsx`
- Modify: `src/components/layout/Sidebar.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Lift tour state to App.tsx**

The tour needs to navigate the app to the correct page for each step. The `useTour` hook must live where `page` state lives — in `App.tsx`.

Update `src/App.tsx` `AppInner` function to include:

```typescript
import { useTour } from "@/hooks/useTour";
import { TourOverlay } from "@/components/help/TourOverlay";
import { HelpPage } from "@/pages/HelpPage";
// ...

export type Page = "vault" | "scanner" | "settings" | "help";

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
      <Shell page={page} onNavigate={setPage} onOpenHelp={() => {
        if (tour.step === null) {
          // Tour already seen — open the Help reference page
          setPage("help");
        } else {
          tour.start();
        }
      }}>
        {page === "vault" ? (
          <VaultPage />
        ) : page === "scanner" ? (
          <ScannerPage />
        ) : page === "help" ? (
          <HelpPage />
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
```

- [ ] **Step 2: Update Shell props**

Update `src/components/layout/Shell.tsx`:

```typescript
interface ShellProps {
  children: ReactNode;
  page: Page;
  onNavigate: (page: Page) => void;
  onOpenHelp: () => void;  // ← add
}

export function Shell({ children, page, onNavigate, onOpenHelp }: ShellProps) {
  return (
    <div className="flex h-full overflow-hidden bg-[var(--color-background)]">
      <Sidebar activePage={page} onNavigate={onNavigate} onOpenHelp={onOpenHelp} />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
      <Toaster />
    </div>
  );
}
```

- [ ] **Step 3: Add ? icon to Sidebar**

Update `src/components/layout/Sidebar.tsx` to accept and use `onOpenHelp`:

```typescript
import { LayoutDashboard, Settings, Shield, Layers, Tag, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Page } from "@/App";

interface SidebarProps {
  activePage: Page;
  onNavigate: (page: Page) => void;
  onOpenHelp: () => void;  // ← add
}

export function Sidebar({ activePage, onNavigate, onOpenHelp }: SidebarProps) {
  return (
    <aside className="w-14 flex flex-col items-center py-4 bg-[var(--color-surface)] border-r border-[var(--color-border-subtle)] shrink-0">
      {/* Logo mark */}
      <div
        data-tour-target="sidebar-logo"
        className="w-8 h-8 rounded bg-[var(--color-accent)] flex items-center justify-center mb-4"
      >
        <span className="text-white font-bold text-xs">M</span>
      </div>

      {/* Main nav */}
      <div className="flex flex-col gap-1 flex-1">
        {navItems.map(({ icon: Icon, label, id, page }) => (
          <button
            key={id}
            data-tour-target={id === "scanner" ? "scanner-nav" : undefined}
            title={page ? label : `${label} (coming soon)`}
            onClick={() => page && onNavigate(page)}
            className={cn(
              "w-9 h-9 rounded flex items-center justify-center transition-colors",
              !page && "opacity-40 cursor-not-allowed",
              activePage === id
                ? "bg-[var(--color-accent)]/15 text-[var(--color-accent)]"
                : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)]"
            )}
          >
            <Icon size={16} />
          </button>
        ))}
      </div>

      {/* Help icon — above Settings */}
      <button
        title="Help"
        onClick={onOpenHelp}
        className={cn(
          "w-9 h-9 rounded flex items-center justify-center transition-colors mb-1",
          activePage === "help"
            ? "bg-[var(--color-accent)]/15 text-[var(--color-accent)]"
            : "text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-2)]"
        )}
      >
        <HelpCircle size={16} />
      </button>

      {/* Settings pinned to bottom */}
      <button
        title="Settings"
        onClick={() => onNavigate("settings")}
        className={cn(
          "w-9 h-9 rounded flex items-center justify-center transition-colors mt-0",
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
```

- [ ] **Step 4: Run dev and verify tour fires on first launch**

```powershell
npm run tauri dev
```

Expected: After the splash fades, the tour tooltip appears on step 1, highlighting the sidebar logo mark. Clicking Next advances through steps. Skip closes the tour. After completing or skipping, the ? icon opens the Help page (placeholder until Task 7).

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/components/layout/Shell.tsx src/components/layout/Sidebar.tsx
git commit -m "feat(help): wire TourOverlay into App, add ? icon to Sidebar"
```

---

## Task 7: Help page + bundled HTML reference

**Files:**
- Create: `src/pages/HelpPage.tsx`
- Create: `src/assets/help.html`

- [ ] **Step 1: Create HelpPage.tsx**

Create `src/pages/HelpPage.tsx`:

```typescript
import helpHtml from "@/assets/help.html?raw";

export function HelpPage() {
  return (
    <div className="h-full w-full overflow-hidden">
      <iframe
        srcDoc={helpHtml}
        title="MdownManager Help"
        className="w-full h-full border-0"
        sandbox="allow-scripts allow-same-origin"
      />
    </div>
  );
}
```

- [ ] **Step 2: Create the bundled help.html**

Create `src/assets/help.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>MdownManager Help</title>
<style>
  :root {
    --bg: #0f1117;
    --surface: #141720;
    --surface2: #1a1d2e;
    --border: #1e2130;
    --accent: #6366f1;
    --text: #e5e7eb;
    --muted: #6b7280;
    --dim: #4b5563;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: var(--bg);
    color: var(--text);
    font-size: 13px;
    line-height: 1.6;
  }
  .layout { display: flex; height: 100vh; overflow: hidden; }
  .nav {
    width: 180px;
    background: var(--surface);
    border-right: 1px solid var(--border);
    padding: 16px 0;
    flex-shrink: 0;
    overflow-y: auto;
  }
  .nav-title {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    color: var(--muted);
    padding: 0 16px 8px;
  }
  .nav a {
    display: block;
    padding: 6px 16px;
    color: var(--dim);
    text-decoration: none;
    font-size: 12px;
    border-left: 2px solid transparent;
    transition: all 0.15s;
  }
  .nav a:hover, .nav a.active {
    color: var(--accent);
    border-left-color: var(--accent);
    background: rgba(99,102,241,0.06);
  }
  .content {
    flex: 1;
    overflow-y: auto;
    padding: 32px 40px;
    max-width: 700px;
  }
  h1 { font-size: 18px; font-weight: 600; margin-bottom: 4px; }
  h2 {
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
    margin: 32px 0 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--border);
    scroll-margin-top: 20px;
  }
  h3 { font-size: 12px; font-weight: 600; color: var(--accent); margin: 16px 0 6px; }
  p { color: var(--muted); margin-bottom: 10px; }
  code {
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 1px 5px;
    font-family: monospace;
    font-size: 11px;
    color: var(--text);
  }
  pre {
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 12px 14px;
    overflow-x: auto;
    margin: 10px 0;
    font-size: 11px;
    font-family: monospace;
    color: var(--text);
  }
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 10px;
    font-weight: 500;
    padding: 2px 8px;
    border-radius: 99px;
  }
  .badge-green { background: rgba(16,185,129,0.15); color: #10b981; }
  .badge-amber { background: rgba(245,158,11,0.15); color: #f59e0b; }
  .badge-red   { background: rgba(239,68,68,0.15);  color: #ef4444; }
  .badge-purple { background: rgba(99,102,241,0.15); color: var(--accent); }
  .risk-table { width: 100%; border-collapse: collapse; margin: 10px 0; }
  .risk-table td, .risk-table th {
    padding: 7px 10px;
    border: 1px solid var(--border);
    text-align: left;
    font-size: 12px;
    color: var(--muted);
  }
  .risk-table th { color: var(--dim); font-size: 10px; text-transform: uppercase; letter-spacing: 0.4px; }
  .demo-box {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 14px 16px;
    margin: 12px 0;
  }
  .search-box {
    width: 100%;
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: 5px;
    padding: 7px 12px;
    color: var(--text);
    font-size: 12px;
    outline: none;
    margin-bottom: 20px;
  }
  .search-box:focus { border-color: var(--accent); }
  .tour-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: var(--accent);
    color: white;
    border: none;
    border-radius: 5px;
    padding: 7px 14px;
    font-size: 12px;
    cursor: pointer;
    margin-bottom: 28px;
  }
  .tour-btn:hover { opacity: 0.88; }
  section { padding-bottom: 24px; }
  .shortcut {
    display: inline-block;
    background: var(--surface2);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 1px 6px;
    font-size: 10px;
    font-family: monospace;
    color: var(--dim);
  }
  .hidden { display: none !important; }
</style>
</head>
<body>
<div class="layout">

  <!-- Side nav -->
  <nav class="nav">
    <div class="nav-title">MdownManager</div>
    <a href="#vault" onclick="activate(this)">Vault</a>
    <a href="#scanner" onclick="activate(this)">Scanner</a>
    <a href="#agent-api" onclick="activate(this)">Agent API</a>
    <a href="#ai-summarize" onclick="activate(this)">AI Summarize</a>
    <a href="#settings" onclick="activate(this)">Settings</a>
    <a href="#license" onclick="activate(this)">License</a>
  </nav>

  <!-- Main content -->
  <div class="content">
    <h1>MdownManager Help</h1>
    <p style="color:var(--dim);margin-bottom:20px;">Everything you need to use your safe Markdown vault.</p>

    <input class="search-box" type="search" placeholder="Search help…" oninput="filterSections(this.value)" />

    <button class="tour-btn" onclick="window.parent.postMessage('start-tour','*')">
      ▶ Start guided tour
    </button>

    <!-- Vault -->
    <section id="vault">
      <h2>Vault</h2>
      <p>The Vault is your library of Markdown files. MdownManager indexes every <code>.md</code> file in the folders you add and keeps them ready for AI agents to query.</p>

      <h3>Risk badges</h3>
      <p>Each file gets a risk badge after scanning:</p>
      <table class="risk-table">
        <tr><th>Badge</th><th>Meaning</th><th>Agent API access?</th></tr>
        <tr><td><span class="badge badge-green">● Safe</span></td><td>No secrets or PII detected</td><td>Yes</td></tr>
        <tr><td><span class="badge badge-amber">● Review</span></td><td>Low-confidence finding, worth checking</td><td>Yes (with warning)</td></tr>
        <tr><td><span class="badge badge-red">● Blocked</span></td><td>High-confidence secret or PII found</td><td>No — excluded automatically</td></tr>
      </table>

      <h3>Adding a folder</h3>
      <p>Click <strong>Add Vault</strong> in the top bar and pick any folder. MdownManager scans all <code>.md</code> files recursively. Free tier supports one vault; Commercial and Non-profit support unlimited vaults.</p>

      <h3>Refreshing</h3>
      <p>Click the refresh icon next to the vault name to re-index files added since the last scan. The watcher (Commercial/Non-profit) does this automatically.</p>
    </section>

    <!-- Scanner -->
    <section id="scanner">
      <h2>Scanner</h2>
      <p>The Scanner inspects each Markdown file line-by-line against a library of regex rules looking for secrets, API keys, passwords, and PII.</p>

      <h3>What gets flagged</h3>
      <ul style="color:var(--muted);padding-left:18px;margin-bottom:10px;">
        <li>API keys (AWS, Stripe, GitHub, Anthropic, OpenAI…)</li>
        <li>Private keys and certificates</li>
        <li>Connection strings with embedded passwords</li>
        <li>Email addresses in potentially sensitive contexts</li>
        <li>Credit card and SSN patterns</li>
      </ul>

      <h3>Running a scan</h3>
      <p>Open the Scanner tab and click <strong>Scan vault</strong>. Each file is checked against all enabled rules. Findings appear in the file detail panel.</p>

      <h3>Managing rules</h3>
      <p>Toggle individual rules on or off in the Scanner rules list. Click <strong>Update rules</strong> to pull the latest Gitleaks rule set from the Teambotics CDN.</p>
    </section>

    <!-- Agent API -->
    <section id="agent-api">
      <h2>Local Agent API</h2>
      <p>MdownManager runs a local HTTP server at <code>http://localhost:7734</code>. IDE agents (Claude Code, Cursor, Copilot) can query it to read your <em>safe, scanned</em> Markdown files — blocked files are never served.</p>

      <div class="demo-box">
        <p style="color:var(--dim);font-size:11px;margin-bottom:8px;">Available on Commercial and Non-profit licenses.</p>
        <p style="color:var(--dim);font-size:11px;">Find your bearer token in <strong>Settings → Local Agent API</strong>.</p>
      </div>

      <h3>Endpoints</h3>
      <pre>GET /health                          — server status
GET /vaults                          — list vaults
GET /files?vault_id=&lt;id&gt;             — list safe files
GET /search?vault_id=&lt;id&gt;&amp;q=&lt;query&gt;  — full-text search
GET /files/&lt;id&gt;/content              — raw Markdown</pre>

      <h3>Claude Code setup</h3>
      <p>Add this to your <code>CLAUDE.md</code>:</p>
      <pre>## MdownManager Vault
Safe Markdown is at http://localhost:7734.
Use: Authorization: Bearer &lt;your-token&gt;

GET /vaults            — list vaults
GET /files?vault_id=x  — list files
GET /search?vault_id=x&amp;q=deployment  — search
GET /files/&lt;id&gt;/content — raw content</pre>
    </section>

    <!-- AI Summarize -->
    <section id="ai-summarize">
      <h2>AI Summarize</h2>
      <p>Generate one-sentence summaries for each file using a cloud AI model. Summaries are stored locally and shown in the file detail panel.</p>

      <h3>Setup</h3>
      <p>Go to <strong>Settings → AI Provider Keys</strong> and add your API key for any supported provider:</p>
      <ul style="color:var(--muted);padding-left:18px;margin-bottom:10px;">
        <li>Anthropic (Claude) — <code>sk-ant-…</code></li>
        <li>OpenAI (GPT) — <code>sk-…</code></li>
        <li>DeepSeek — <code>sk-…</code></li>
        <li>Google (Gemini) — <code>AIza…</code></li>
      </ul>
      <p>Keys are stored in the local SQLite database. They are never sent to Teambotics.</p>

      <h3>Summarising</h3>
      <p>Select a model in the Vault toolbar and click <strong>Summarise vault</strong> to process all unsummarised files, or open a file and click Summarise in the detail panel.</p>
    </section>

    <!-- Settings -->
    <section id="settings">
      <h2>Settings</h2>
      <h3>AI Provider Keys</h3>
      <p>Paste your cloud AI key and click <strong>Save</strong>. Keys are masked after saving. Click the eye icon to reveal.</p>

      <h3>Local Agent API</h3>
      <p>Shows your bearer token and the local server endpoint. Available on Commercial and Non-profit licenses. The token is auto-generated and stored locally — it never changes unless you re-install.</p>

      <h3>License</h3>
      <p>Paste a license token here to activate Commercial or Non-profit features. Tokens are issued by Teambotics after purchase or Non-profit approval.</p>
    </section>

    <!-- License -->
    <section id="license">
      <h2>License</h2>
      <table class="risk-table">
        <tr><th>Tier</th><th>Price</th><th>Vaults</th><th>Agent API</th><th>Auto-scan</th></tr>
        <tr><td><span class="badge badge-purple">Free</span></td><td>$0</td><td>1</td><td>—</td><td>—</td></tr>
        <tr><td><span class="badge badge-purple">Commercial</span></td><td>Paid</td><td>Unlimited</td><td>✓</td><td>✓</td></tr>
        <tr><td><span class="badge badge-purple">Non-profit</span></td><td>$0</td><td>Unlimited</td><td>✓</td><td>✓</td></tr>
      </table>
      <p style="margin-top:12px;">Non-profits apply at <strong>teambotics.com/nonprofit</strong>. Approval takes 1–2 business days. Tokens are valid for 12 months.</p>
    </section>

  </div>
</div>

<script>
  // Simple section filter
  function filterSections(query) {
    const q = query.toLowerCase().trim();
    document.querySelectorAll('section').forEach(sec => {
      sec.classList.toggle('hidden', q.length > 0 && !sec.textContent.toLowerCase().includes(q));
    });
  }

  // Nav highlight
  function activate(el) {
    document.querySelectorAll('.nav a').forEach(a => a.classList.remove('active'));
    el.classList.add('active');
  }

  // Highlight nav item based on scroll
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.id;
        document.querySelectorAll('.nav a').forEach(a => {
          a.classList.toggle('active', a.getAttribute('href') === '#' + id);
        });
      }
    });
  }, { threshold: 0.4 });
  document.querySelectorAll('section[id]').forEach(s => observer.observe(s));
</script>
</body>
</html>
```

- [ ] **Step 2: Wire the "Start guided tour" button**

The `help.html` posts a `start-tour` message to the parent window. Add a listener in `HelpPage.tsx`:

```typescript
import { useEffect } from "react";
import helpHtml from "@/assets/help.html?raw";

interface HelpPageProps {
  onStartTour: () => void;
}

export function HelpPage({ onStartTour }: HelpPageProps) {
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data === "start-tour") onStartTour();
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [onStartTour]);

  return (
    <div className="h-full w-full overflow-hidden">
      <iframe
        srcDoc={helpHtml}
        title="MdownManager Help"
        className="w-full h-full border-0"
        sandbox="allow-scripts allow-same-origin"
      />
    </div>
  );
}
```

Update `App.tsx` to pass `onStartTour` to `HelpPage` and `onOpenHelp` to route back to the tour:

```typescript
// In the page routing block:
page === "help" ? (
  <HelpPage onStartTour={() => { tour.start(); setPage("vault"); }} />
) :
```

Update `App.tsx` `onOpenHelp` logic:

```typescript
onOpenHelp={() => {
  // Tour already seen → open the reference page.
  // Tour not yet seen → start the tour instead.
  setPage("help");
}}
```

(The tour fires automatically on first launch, so `onOpenHelp` always opens the Help page. Re-launching the tour from the Help page uses the `onStartTour` prop.)

- [ ] **Step 3: Add `?raw` import type to vite-env.d.ts**

In `src/vite-env.d.ts`, add:

```typescript
declare module "*.html?raw" {
  const content: string;
  export default content;
}
```

- [ ] **Step 4: Run dev server and verify**

```powershell
npm run tauri dev
```

Expected:
- First launch: splash → tour fires on vault page.
- After tour, clicking `?` in sidebar opens the Help page with working nav, search, and "Start guided tour" button.
- "Start guided tour" button navigates back to vault and restarts the tour.

- [ ] **Step 5: Commit**

```bash
git add src/pages/HelpPage.tsx src/assets/help.html src/vite-env.d.ts src/App.tsx
git commit -m "feat(help): add bundled HTML reference and HelpPage"
```

---

## Self-Review Notes

- `TOUR_STEPS[3]` and `[4]` target `settings-agent-api` and `settings-ai-keys`. On a Free-tier install these sections may be replaced by the gate UI. The tour still navigates to Settings and the tooltip falls back to a centred position (`{ x: 40, y: 40 }`) if the target element is not found — acceptable behaviour.
- `TourOverlay` polls the DOM every 200 ms using `setInterval`. This is intentional: the target may not render immediately after a page navigation. The interval is cleared on unmount.
- The `?raw` Vite import for `help.html` bundles the entire HTML into the JS bundle. For v1 this is fine; for larger help content, a Tauri `asset://` URL would be more appropriate.
- The `start-tour` postMessage from the iframe is same-origin (since `srcDoc` is same-origin) and sandboxed with `allow-scripts allow-same-origin`. This is safe for a local bundled asset.
