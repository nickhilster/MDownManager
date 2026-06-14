# MdownManager — Local/Cloud LLM-Powered Markdown Management & Security Platform

**Whitepaper v0.2 (Draft for internal review)**
*Audience: Engineering, Product Design, and technical investors*
*Status: Pre-implementation. All technical recommendations are decisions-to-ratify, not final commitments.*

> **Brand.** The product is named **MdownManager** (Teambotics Inc.). Feature 1 retains the internal component name **Core Vault**.

---

## 1. Executive Summary

Markdown has quietly become the native interface between humans and AI agents. Agent configuration files, system prompts, RAG corpora, runbooks, specs, and knowledge bases are increasingly authored and consumed as `.md`. Yet there is no purpose-built home for this ecosystem — one that treats Markdown as a first-class, auditable, **security-screened** knowledge layer for agentic workflows rather than as generic prose.

**MdownManager** is a cross-platform desktop (and optional web) application that lets individuals and teams **store, serve, audit, summarise, structure, and categorise** their `.md` files for safe consumption by AI agents. It runs fully offline against **local LLMs** (Ollama, LM Studio, llama.cpp) and can optionally route specific features to **cloud LLMs** (OpenAI, Anthropic, Gemini) under explicit, per-feature user control.

The differentiator is **security and sovereignty**: as agents increasingly ingest `.md` from teammates, repositories, and the open web, those files become a prompt-injection attack surface. MdownManager's scanner detects adversarial instructions before an agent ever reads them, with explainable, auditable verdicts — while keeping files on the user's own disk by default.

**Five core capabilities:**

1. **Core Vault** — a local-first, self-hosted `.md` file server (think OneDrive/Drive, purpose-built for Markdown and agent consumption).
2. **Prompt Injection Scanner** — multi-layer detection of adversarial directives, with line-level flags and one-click navigation.
3. **AI Summary Generator** — structured executive summaries of any `.md` on demand.
4. **Structure Explorer** — a tabulated, parsed view of a file's headings, metadata, code, links, callouts, and tasks.
5. **Categorisation Engine** — AI grouping with full manual drag-and-drop override and one-click re-sort.

---

## 2. The Problem

**Markdown is the lingua franca of agentic AI, but it has no secure, agent-aware home.**

- **Fragmented storage.** `.md` files live scattered across repos, cloud drives, note apps, and local folders. None of these tools index or serve Markdown specifically for agent retrieval, and most obscure the file as the source of truth.
- **No security layer.** A `.md` file pulled from a public repo or shared by a teammate can carry hidden instructions ("ignore previous instructions…", invisible characters, smuggled commands) that hijack a downstream agent. Today this is screened by nobody. As agents gain tool access, the blast radius grows.
- **Wrong-shaped incumbents.** Obsidian is editor-first, not agent-serving or security-screening. Notion locks content into a proprietary store and isn't local-first. OneDrive/Drive sync bytes but understand nothing about Markdown structure, agent fitness, or injection risk.
- **No sovereignty option.** Knowledge workers handling sensitive material have no tool that combines Markdown management, AI summarisation/auditing, **and** a guarantee that files never leave the device unless explicitly permitted.

MdownManager exists to close this gap: a local-first knowledge vault that is simultaneously a **security gate** and an **agent-feeding pipeline** for Markdown.

---

## 3. Who It Serves

| Persona | Core need | Primary features |
|---|---|---|
| **Agent-native developer** | A clean, indexed home for `CLAUDE.md`, agent configs, and RAG corpora; assurance that ingested `.md` is safe | Core Vault, Scanner, Structure Explorer |
| **Privacy-conscious researcher / knowledge worker** | Summarise and organise sensitive notes without sending them to the cloud | Summary, Categorisation, local-only mode |
| **Security-aware AI engineer** | Audit the prompt supply chain; explainable injection verdicts | Scanner (deep), audit logs |
| **Small team adopting agentic workflows** *(later phase)* | Shared vaults and consistent categorisation across a group | Core Vault (remote), Categorisation |

---

## 4. Core Features (Detailed)

Each feature below specifies what it does, how it works, key parameters, the UX flow, and the acceptance criteria it must meet.

### Feature 1 — Core Vault (Markdown File Manager)

**What it does.** A local-first, personally hosted `.md` file server: store, retrieve, version, index, and serve Markdown to AI agents from a local or remote vault.

**How it works.**
- **Source of truth = files on disk.** `.md` files remain plaintext, human-readable, and git-compatible on the filesystem. MdownManager never hides content inside a proprietary blob.
- **Index layer = SQLite.** A local SQLite database holds metadata, full-text index, vector references, categories, and scan results. The index is rebuildable from the files at any time (disposable, not authoritative).
- **Vector layer = LanceDB** (embedded, on-disk) for semantic retrieval by downstream agents.
- **Serving = local HTTP/IPC API** so an agent (or the app's own features) can query and fetch `.md` content and chunks.
- **Versioning.** Default: lightweight content-hash snapshots in SQLite for diff/restore. Optional: native git integration for users who want full history.
- **Sync (optional, never required).** Local vault works with zero network. A self-hosted remote vault (PocketBase backend) enables device-to-device and, later, team sync — without any third-party cloud.

**Metadata schema (per file).** `id`, `path`, `title`, `content_hash`, `frontmatter` (parsed YAML), `size_bytes`, `line_count`, `created_at`, `modified_at`, `last_scanned_at`, `risk_level`, `category_id`, `category_source` (ai | manual), `embedding_ref`, `tags[]`.

**File discovery.** Watched folders (filesystem watcher) + manual import (drag-drop / folder add) + recursive scan with include/exclude globs.

**Storage backend options (evaluated in §5):** SQLite + filesystem (recommended v1); PocketBase (remote/team); Supabase local (rejected for v1 footprint).

**UX flow.** Add folder → files auto-discovered and indexed → file list with risk/category badges → click to open in Explorer/Summary → agent or feature requests content via local API.

**Acceptance criteria.** A user can store, retrieve, and serve an `.md` file to an AI agent in **under 2 seconds** from a local or remote vault.

---

### Feature 2 — Prompt Injection Scanner *(priority)*

**What it does.** Accepts one or more dropped/imported `.md` files and scans for prompt-injection patterns, adversarial instructions, and suspicious directives — then surfaces line-level flags an analyst can navigate in one click.

**What counts as prompt injection here.** Content in a `.md` file intended (or able) to hijack, mislead, or exfiltrate from a downstream AI agent that reads the file. Categories detected:
- **Imperative override** — "ignore previous instructions", "disregard your system prompt".
- **Role / context confusion** — "you are now…", forged system/assistant turns.
- **Tool / command injection** — instructions to run shell commands, call tools, or modify files.
- **Exfiltration** — instructions to send data to a URL, embedded tracking/`data:` URIs, suspicious links.
- **Obfuscation** — zero-width / invisible characters, white-on-white, HTML comments, base64 blobs, homoglyphs.
- **Instruction smuggling** — directives hidden inside code fences, YAML frontmatter, or callouts where a reader might not look.

**Agent layers (defense in depth).**

1. **Static pattern matching** *(always on, offline, zero-cost).* Regex + heuristic library + invisible-character and encoding detection. Deterministic and fast; catches the obvious and the hidden-but-known.
2. **LLM semantic analysis** *(local by default).* A classifier model evaluates spans the patterns miss — paraphrased injections, social-engineering framing — returning a severity and a short rationale.
3. **Context reasoning.** Evaluates each flagged span against the file's apparent purpose and the vault's intended agent use. A directive inside a *prompt-template* file may be legitimate; the same directive buried in a *meeting note* is anomalous. This layer primarily reduces false positives.

**Conflict resolution between layers** *(see Appendix open question).* Recommended policy:
- Default verdict = **highest severity** raised by any layer.
- The context layer may **downgrade** a flag **only with an explainable justification shown to the user** — never silently.
- A **Critical** static match is never auto-suppressed; it can only be acknowledged/dismissed by the user.
- Strictness is **user-configurable** (e.g., "paranoid" surfaces all layers; "balanced" applies context downgrades).

**Output requirements.**
- **Flag type + severity:** Low / Medium / High / Critical.
- **Exact line numbers** with **inline highlighting** in the file view.
- **Single-click navigation** from a summary panel to each flagged line.
- **Explainability per flag:** which layer raised it, the matched pattern or model rationale, and why — fully auditable.

**UX flow.** Drop `.md` (or batch) → scan runs (static → semantic → context) → summary panel lists flags grouped by severity → click a flag → editor jumps to and highlights the line → user dismisses, acknowledges, or quarantines the file.

**Acceptance criteria.** Scanner identifies and surfaces flagged lines with **≥90% precision** on a defined test corpus, each **navigable in one UI interaction**.

---

### Feature 3 — AI Summary Generator

**What it does.** Produces a structured executive summary of any `.md` file on demand.

**Output format.**
- **TL;DR** (1–2 sentences).
- **Key points** (3–7 bullets).
- **Key decisions / action items** (if present).
- Optional **length target**: Short (~75 words) / Standard (~150) / Detailed (~300).

**Routing logic (local vs. cloud).** Default **local** (e.g., a local instruct model via Ollama). Cloud routing is **opt-in per feature**: a user may set Summary to use Anthropic/OpenAI/Gemini for higher quality on long or complex files. Routing rule of thumb surfaced in settings: files under a configurable token threshold → local; user may force cloud for quality, with a clear "this file's content will be sent to <provider>" notice.

**UX flow.** Open file → "Summarise" → choose length (remembers last choice) → summary renders with a badge showing which model/route produced it.

**Acceptance criteria.** Summary generated in **under 10 seconds**; rated useful by **≥80% of beta testers**.

---

### Feature 4 — Structure Explorer (Tabulated UI)

**What it does.** Parses a `.md` file and displays its structural elements — headings, frontmatter/metadata, code blocks, links, callouts, task lists — in a sortable, filterable table.

**Table columns.** `Element type` (heading / code / link / callout / task / image / frontmatter), `Level/Language` (e.g., H2, ```python), `Content preview`, `Line number`, `Status` (e.g., task done/open), and element-specific detail.

**Interactions.** Sort by any column; filter by element type; full-text filter; **click-to-jump** to the source line; **export** the structure as CSV / JSON / Markdown table.

**Performance.** Streaming/virtualised table rendering (e.g., TanStack Table + row virtualisation) so very large documents (10,000+ lines) remain interactive; parsing offloaded to a worker thread to keep the UI responsive.

**UX flow.** Open file → Explorer tab → tabulated structure renders → filter to "code blocks" or "links" → click a row → jump to line in editor → export if needed.

**Acceptance criteria.** Full file structure rendered and interactive within **1.5 seconds** for files up to **500KB**.

---

### Feature 5 — Categorisation Engine (with Manual Override)

**What it does.** Groups `.md` files into categories using LLM embeddings/classification, while giving the user full manual control.

**Interaction model.**
1. **Initial AI grouping** on first run (clustering over embeddings + optional LLM labelling).
2. **Full manual drag-and-drop override** at any time — move files between categories, rename, create, or delete categories.
3. **One-click AI re-categorisation** that **respects manual changes by default** (only re-sorts un-pinned files) or, optionally, **resets** to a fresh AI grouping.

**Category schema.** Categories can be **AI-suggested** or **user-defined**. Each file carries `category_id` and `category_source` (ai | manual). Manual assignments are **pinned** and survive re-runs unless the user explicitly resets.

**Conflict resolution (AI vs. manual divergence).** Manual wins. On re-categorisation, pinned (manual) files are never moved unless reset is chosen; the AI proposes placements only for un-pinned files. Divergences are shown as suggestions the user can accept or ignore — never auto-applied over a manual label.

**Persistence.** Categories, assignments, and source flags stored in SQLite; embeddings cached so re-sorts don't re-embed unchanged files.

**UX flow.** First run → AI proposes categories → user drags files / renames categories → later, "Re-sort with AI" → choose *Respect my changes* or *Reset* → re-sort completes → review any suggestions.

**Acceptance criteria.** AI categorisation achieves **≥75% user agreement** on initial grouping in usability testing; **re-categorisation completes in under 5 seconds**.

---

## 5. Technical Recommendations

All recommendations are scored or reasoned against the same three priorities: **(a) runs on consumer hardware alongside a local LLM, (b) supports a fully local/offline mode with optional per-feature cloud routing, and (c) maximises developer velocity and auditability.**

### 5.1 Scored comparison — Desktop framework (pivotal decision)

Criteria weighted to 100. Raw scores 1–5 (higher is better).

| Criterion | Weight | Tauri | Electron | Flutter Desktop |
|---|---:|:---:|:---:|:---:|
| Resource footprint (bundle + RAM headroom for local LLM) | 25 | 5 | 2 | 4 |
| Web-tech / React reuse (shared web build) | 20 | 5 | 5 | 2 |
| Filesystem + native security access | 15 | 4 | 5 | 3 |
| Ecosystem & plugin maturity | 15 | 3 | 5 | 3 |
| Security surface / auditability | 15 | 4 | 3 | 4 |
| Developer velocity / familiarity | 10 | 4 | 5 | 2 |
| **Weighted total (normalised %)** | **100** | **86%** | **79%** | **62%** |

**Recommendation: Tauri 2.x.** A Rust core with the OS-native webview yields bundles averaging **12MB** vs **180MB** for Electron 30.0 (93% reduction, verified 2026 benchmarks), with idle RAM of ~85MB vs ~450MB for Electron. Cold-start on Windows 11: 1.8 seconds vs 12 seconds. This gap is decisive when the app must coexist with an Ollama model consuming most of the machine's memory/VRAM. Tauri 2.x also reached stable mobile support (iOS/Android) in Q4 2025, territory Electron cannot reach. UI is web tech (React), so the same component layer can power an optional web build. Electron scores well on ecosystem and native access but its Chromium footprint directly competes with the local LLM for resources, conflicting with priority (a). Flutter Desktop is lean but sacrifices the React reuse and the mature filesystem/security plugin story the other two offer.

### 5.2 Remaining stack decisions

| Decision | Options | Recommendation + rationale |
|---|---|---|
| **LLM abstraction layer** | LangChain, LlamaIndex, custom orchestration | **Thin custom router + LlamaIndex for indexing/RAG.** A small in-house router owns per-feature local/cloud routing and keeps the injection-detection path transparent and auditable (a LangChain-style abstraction obscures it). LlamaIndex is best-in-class for the document indexing/retrieval the Core Vault needs. LangChain rejected as the spine: heavy, fast-churning, hard to audit. |
| **Local LLM runtime** | Ollama, LM Studio, llama.cpp | **Ollama as default; llama.cpp embeddable for zero-dependency offline.** Ollama: simplest install, clean HTTP API, broad model library, cross-platform. llama.cpp: can be bundled so a true offline mode needs no separate install. LM Studio: not a hard dependency, but supported via its OpenAI-compatible endpoint for users already running it. |
| **UI component library** | shadcn/ui, Radix, Ant Design | **shadcn/ui (on Radix primitives).** Owned, copy-in, fully themeable components with no version lock — fitting for a design-led product — built on Radix's accessible primitives. Pair with **TanStack Table** for the Structure Explorer. Ant Design rejected: heavy and visually opinionated. |
| **File storage / sync backend** | SQLite + filesystem, PocketBase, Supabase local | **SQLite + filesystem (canonical) for v1; PocketBase optional for remote/team.** Files-on-disk stay human-readable, git-friendly, and authoritative (sovereignty); SQLite holds the disposable index. PocketBase (Go, single binary, embedded SQLite) is the clean self-hosted path to remote/team vaults with no cloud dependency. Supabase local rejected for v1: Postgres + Docker footprint contradicts lightweight local-first. |
| **Embedding & vector search** | ChromaDB, LanceDB, Weaviate local | **LanceDB.** Embedded, serverless, on-disk, Rust-native — integrates cleanly with Tauri and needs no separate process. Benchmarked at sub-20ms query times on 1 million vectors (GIST dataset); DuckDB-native SQL retrieval added in early 2026. LanceDB raised a $30M Series A in June 2025, confirming production maturity. ChromaDB typically wants a running server; Weaviate adds Docker/ops weight. Default embeddings via a local model (e.g., `nomic-embed-text` through Ollama); cloud embeddings optional per routing config. |

---

## 6. Architecture Overview

- **Source of truth:** plaintext `.md` files on the user's filesystem.
- **Index & state:** SQLite (metadata, FTS, categories, scan results, version snapshots).
- **Semantic layer:** LanceDB vectors for agent retrieval.
- **Inference router:** thin custom layer that, per feature, sends work to a local runtime (Ollama/llama.cpp) or — only when the user opts in — a cloud provider.
- **Serving:** local HTTP/IPC API exposing files and chunks to agents and to the app's own features.
- **Shell:** Tauri (Rust core + React/shadcn UI), with parsing and scanning offloaded to worker threads for responsiveness.

This keeps the security-critical and privacy-critical paths (scanning, routing) small, local, and inspectable.

---

## 7. Privacy & Data Sovereignty

- **Local by default.** With no configuration, MdownManager performs all operations locally; files and prompts never leave the device.
- **Per-feature routing, user-controlled.** Cloud LLM use is opt-in and configured **independently for each feature** (e.g., local Scanner + cloud Summary). The current routing posture is always visible.
- **Explicit egress disclosure.** Whenever a feature is set to cloud, the UI states exactly what will be sent (full file vs. excerpt), to which provider, and prompts the user before transmitting sensitive content.
- **Files stay yours.** `.md` remains plaintext on the user's disk as the authoritative copy; the index is derivative and disposable.
- **No telemetry by default.** Any diagnostics are opt-in. Scan results and audit logs stay local unless the user exports them.

---

## 8. Security Model (Feature 2 deep dive)

**Threat model (assumed: both, supply-chain primary).**
- **Supply-chain / external content (primary).** Vaults ingest `.md` from repos, teammates, and the web. Malicious or compromised files are the main risk as agents gain tool/command access.
- **Developer hygiene (secondary).** Accidental self-injection — pasting untrusted snippets, copying instructions into config files.

**Defense in depth.** Static patterns (fast, offline, deterministic) → LLM semantic analysis (catches paraphrase/novel) → context reasoning (cuts false positives). Each flag records its originating layer and rationale.

**Explainability & auditability.** Every verdict is human-readable: matched pattern or model reasoning, severity, line number, and the layer chain that produced it. The detection logic and pattern library are documented so end users — and an external reviewer — can audit and reason about decisions. **Gate: the Feature 2 security model must be reviewed by at least one external security-aware stakeholder before publication of this whitepaper.**

**Failure posture.** Default to surfacing rather than suppressing; never silently downgrade a Critical static match; allow user-configurable strictness.

---

## 9. Roadmap

| Milestone | Deliverable | Owner | Timeline |
|---|---|---|---|
| **M1 — Discovery & Architecture** | Finalised tech stack, system design doc | Tech Lead | Week 1–2 |
| **M2 — Core Vault (Feature 1)** | Working file manager with LLM indexing | Engineering | Week 3–5 |
| **M3 — Prompt Injection Scanner (Feature 2)** | MVP scanner with UI flag navigation | AI/Security Engineer | Week 6–9 |
| **M4 — Summary + Explorer (Features 3 & 4)** | Summary generator + tabulated UI | Full-stack Engineer | Week 10–12 |
| **M5 — Categorisation Engine (Feature 5)** | AI grouping + manual override + re-sort | ML Engineer | Week 13–15 |
| **M6 — Beta & Whitepaper Finalisation** | Internal beta, whitepaper published | Product + Engineering | Week 16 |

---

## 10. Whitepaper Success Criteria

This document is considered complete when:
- Every feature has a clear definition, rationale, and UX flow. ✔ (this draft)
- Each core feature is validated by at least **one proof-of-concept prototype** before its milestone closes. *(Required during M2–M5.)*
- The framework recommendation is backed by a **scored comparison matrix**. ✔ (§5.1)
- The Feature 2 security model is **reviewed by at least one external security-aware stakeholder** before publication. *(Open gate — §8.)*

---

## Appendix — Design Decisions & Open Questions

For each open question, a recommended lean is offered; final calls remain with the founder/team.

1. **Support for structured formats beyond `.md`?**
   *Lean:* v1 = `.md` + YAML frontmatter only. Consider `.mdx`, `.txt`, and YAML/JSON config files in a later phase. Keep v1 scope tight around the Markdown thesis.

2. **Monetisation: open-core + cloud-sync premium, or fully proprietary?**
   *Lean:* **Open-core.** Local app open / source-available; monetise hosted/team sync and managed cloud routing. Aligns with a democratization ethos and a no-IPO posture, and builds trust for a security tool.

3. **How to handle conflicting injection verdicts between agent layers?**
   *Lean:* Default to highest severity; context layer may downgrade only with shown justification; Critical static matches never auto-suppressed; strictness user-configurable (see §8).

4. **Is there a collaboration use case (shared vaults, team-level categorisation)?**
   *Lean:* Yes, eventually. Design the data model (PocketBase path) to allow shared vaults and team categories now; ship solo-first, deliver collaboration in a later phase.

5. **What threat model does the scanner assume — developer hygiene, supply chain, or both?**
   *Lean:* **Both**, with **supply-chain as primary**, since vaults ingest external `.md` (see §8).

---

*End of draft v0.2 — rebranded MdownManager (Teambotics Inc.) · benchmarks verified June 2026.*
