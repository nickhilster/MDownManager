# MDownManager — Freemium, Non-profit Tier & Help System Design

**Date:** 2026-06-14
**Status:** Approved

---

## Overview

MDownManager ships as a freemium Tauri desktop application with three tiers: Free, Commercial, and Non-profit. Tiers are enforced via signed offline license tokens verified by a hardcoded public key in the Rust backend. A guided tour overlay system and a bundled interactive HTML reference document form the in-app help system.

---

## 1. Tier Structure

| Capability | Free | Commercial | Non-profit |
|---|---|---|---|
| Price | $0 | Paid | $0 |
| Vault limit | 1 | Unlimited | Unlimited |
| File browser + manual scan | ✓ | ✓ | ✓ |
| BYO-key AI summarize | ✓ | ✓ | ✓ |
| Local Agent API (localhost:7734) | — | ✓ | ✓ |
| Auto / continuous scanning (filesystem watcher) | — | ✓ | ✓ |
| Semantic / embedding search | — | ✓ | ✓ |

**Gate logic:** Features are gated by the `features[]` array in the license token. With no token present, the app defaults to Free capabilities. Locked features are visible in the UI but display an "Upgrade" prompt on interaction — they are never hidden entirely. The filesystem watcher (`vault/watcher.rs`) is started on app launch only when the `auto_scan` feature is present in the token; Free tier users must trigger scans manually.

---

## 2. License Token System

### Token structure

A JWT-style signed token (RS256) with the following payload:

```json
{
  "tier": "free | commercial | nonprofit",
  "features": ["agent_api", "auto_scan", "semantic_search"],
  "branding_variant": "free | commercial | nonprofit",
  "org_name": "Greenpeace UK",
  "issued_at": 1718323200,
  "expires_at": 1749859200
}
```

### Verification

- The Tauri Rust backend embeds the Teambotics RSA **public key** as a compile-time constant
- On every app launch, the token (stored in the local SQLite DB) is verified against this key entirely offline
- Online re-validation against the Teambotics token API occurs at most once every 30 days, or when the user manually triggers "Check license" in Settings
- If offline and token is not expired, the app proceeds with the stored token — no network required
- If the token is expired and the app is offline, a grace period of 7 days after the expiry date applies before features are downgraded

### Issuance

- **Commercial:** User purchases via Lemon Squeezy → webhook calls Teambotics token API → signed token emailed to purchaser
- **Non-profit:** User submits verification form → manual review → token issued and emailed on approval
- **Free:** No token required; app operates in Free mode with no token present

### Backend

A Cloudflare Worker holds the RSA private key and exposes two endpoints:
- `POST /tokens/issue` — creates and signs a token (internal, called by webhook and admin)
- `POST /tokens/validate` — validates a token (called by client for 30-day re-validation)

The Worker is stateless; token records are stored in Cloudflare KV for audit purposes.

---

## 3. Non-profit Verification Flow

1. Applicant visits `teambotics.com/nonprofit` and submits a form with: org legal name, country, registration number / EIN, org website, contact name, work email (must match org domain)
2. Teambotics reviews within 1–2 business days: confirms registration via public records and domain ownership via DNS/WHOIS
3. On approval: token issued via the Cloudflare Worker, emailed to the contact address
4. User opens Settings → License → pastes token → app unlocks Commercial feature set with Non-profit branding variant
5. Token is valid for 12 months; renewal uses the same form (faster on second review as the record exists)

**Initial implementation:** Typeform (form) + Notion database (review queue) + manual token issuance via admin CLI. No custom form UI needed until volume warrants it.

---

## 4. Branding

Branding appears in exactly two places: the loading screen and the Settings page footer. It does not appear anywhere else in the UI for any tier.

### Loading screen

Displayed during app initialisation. Centred app logo + name; a slim bottom strip (separated by a hairline border) carries the tier-appropriate label. Disappears automatically when the app finishes loading — no dismiss button.

| Tier | Strip text |
|---|---|
| Free | `Free Edition` |
| Commercial | `Powered by Teambotics` |
| Non-profit | `Non-profit Edition · Powered by Teambotics` |

Visual reference: Style B from the brainstorm session (`.superpowers/brainstorm/`).

### Settings page footer

At the bottom of the Settings page, below all existing content sections, a license block shows:
- Small Teambotics icon mark + tier label (e.g. "Non-profit license" / "Commercial license" / "Free")
- "Powered by Teambotics · teambotics.com" as a clickable link
- For Non-profit tokens only: "Licensed to: {org_name}"
- For all tiers: app version number

---

## 5. Help System

### 5a. Guided tour overlays

A step-by-step tooltip tour that highlights real UI elements in the live app. No separate sandbox or demo mode — the user learns on the actual interface.

**Trigger:**
- **Automatic:** Fires on first launch after the app window opens. Stored in SQLite (`help_tour_seen: bool`).
- **Manual:** A `?` icon pinned at the bottom of the sidebar (above the Settings gear) relaunches the tour at any time.

**Tour steps (5):**

| Step | Element highlighted | Content |
|---|---|---|
| 1 | Sidebar logo / app shell | What MDownManager is: a privacy-first vault that lets AI agents read only your safe, scanned Markdown |
| 2 | Vault nav + file table | Browse your files; what the risk badge colours (green / amber / red) mean |
| 3 | Scanner nav item | How scanning works: what patterns are detected (secrets, PII, credentials) and what "blocked" means |
| 4 | Settings → Agent API section | How to connect Claude Code, Cursor, or Copilot via the local API and bearer token |
| 5 | Settings → AI Provider Keys | How to add BYO cloud keys to unlock summarize |

**Tooltip anatomy:**
- Accent-coloured step label: `Step 2 of 5 · Vault`
- Title (bold, ~5 words)
- Body (2–3 sentences)
- Progress dots (filled = current, empty = upcoming)
- `← Prev` / `Next →` buttons
- `✕ Skip tour` link (top-right corner)

The highlighted element receives a `ring` style (accent-colour border + subtle backdrop dim). The tooltip is positioned to avoid clipping outside the window bounds.

**State:** `help_tour_seen` and `help_tour_step` stored in SQLite so a user can close mid-tour and resume where they left off.

### 5b. Bundled interactive HTML reference

After the user has completed or skipped the tour, the `?` sidebar icon opens a dedicated **Help page** within the app. This page renders a bundled HTML asset (shipped with the app, no network required) styled to match the dark theme.

**Structure of the HTML reference:**
- Search field (client-side filter over all headings and body text)
- Collapsible sections per feature area: Vault, Scanner, Agent API, AI Summarize, Settings, License
- Each section contains: a short plain-English explanation, a labelled diagram or looping demo (inline SVG animation or short base64-encoded GIF), and relevant keyboard shortcuts or curl examples where applicable
- A "Start tour again" button at the top links back to the guided tour

The HTML file lives at `src/assets/help.html` and is loaded into a Tauri webview panel. It is maintained as a hand-authored file — updated alongside feature changes.

---

## 6. New UI Elements Required

| Element | Location | Notes |
|---|---|---|
| `?` help icon | Sidebar, pinned above Settings gear | Triggers tour or opens Help page depending on `help_tour_seen` |
| Tour tooltip component | Overlay layer (above all content) | Positioned relative to highlighted element |
| Loading/splash screen | App startup | Currently no splash exists; needs to be added |
| License section in Settings | Settings page, below existing sections | Shows tier, branding block, token paste field |
| Help page (webview) | New page type in `App.tsx` | Renders bundled `help.html` |
| Upgrade prompt | Shown on locked feature interaction | Inline, not modal — points to teambotics.com/upgrade |

---

## 7. Out of Scope

- Team / shared vaults (future Commercial+ feature)
- Cloud sync or hosted API
- In-app purchase flow (links out to Lemon Squeezy)
- Custom non-profit verification UI (Typeform to start)
- Localisation of the help content
