import { invoke } from "@tauri-apps/api/core";

export interface VaultRecord {
  id: string;
  name: string;
  path: string;
  created_at: string;
  git_root: string | null;
}

export interface FileRecord {
  // Runtime-only field set by the UI layer
  git_root_hint?: string | null;
  id: string;
  vault_id: string;
  path: string;
  title: string | null;
  content_hash: string;
  frontmatter: string | null;
  size_bytes: number;
  line_count: number;
  created_at: string;
  modified_at: string;
  last_scanned_at: string | null;
  risk_level: string | null;
  category_id: string | null;
  category_source: "ai" | "manual" | null;
  embedding_ref: string | null;
  tags: string | null;
  summary: string | null;
  summary_model: string | null;
  scan_findings: string | null; // JSON: Finding[]
}

export interface Snapshot {
  id: string;
  content_hash: string;
  created_at: string;
}

export interface GitCommit {
  hash: string;
  message: string;
  author: string;
  timestamp: string;
}

// ── Vault commands ────────────────────────────────────────────────────────────

export const addVault = (path: string, name: string) =>
  invoke<VaultRecord>("add_vault", { path, name });

export const listVaults = () => invoke<VaultRecord[]>("list_vaults");

export const listFiles = (vaultId: string) =>
  invoke<FileRecord[]>("list_files", { vaultId });

export const searchFiles = (vaultId: string, query: string) =>
  invoke<FileRecord[]>("search_files", { vaultId, query });

export const importFiles = (vaultId: string, paths: string[]) =>
  invoke<FileRecord[]>("import_files", { vaultId, paths });

export const getFileContent = (path: string) =>
  invoke<string>("get_file_content", { path });

export const openFileInEditor = (path: string) =>
  invoke<void>("open_file_in_editor", { path });

export const refreshVault = (vaultId: string, vaultPath: string) =>
  invoke<FileRecord[]>("refresh_vault", { vaultId, vaultPath });

export const removeVault = (vaultId: string) =>
  invoke<void>("remove_vault", { vaultId });

export const removeFile = (fileId: string) =>
  invoke<void>("remove_file", { fileId });

// ── Snapshot commands ─────────────────────────────────────────────────────────

export const listSnapshots = (fileId: string) =>
  invoke<Snapshot[]>("list_snapshots", { fileId });

export const getSnapshotContent = (snapshotId: string) =>
  invoke<string>("get_snapshot_content", { snapshotId });

// ── Git commands ──────────────────────────────────────────────────────────────

export const gitFileHistory = (gitRoot: string, filePath: string, limit = 20) =>
  invoke<GitCommit[]>("git_file_history", { gitRoot, filePath, limit });

export const gitFileAtCommit = (gitRoot: string, filePath: string, commitHash: string) =>
  invoke<string>("git_file_at_commit", { gitRoot, filePath, commitHash });

export const gitFindRoot = (path: string) =>
  invoke<string | null>("git_find_root", { path });

// ── Ollama / AI commands ──────────────────────────────────────────────────────

export const ollamaHealth = () => invoke<boolean>("ollama_health");

/** Returns all available model IDs: "ollama/llama3.2", "anthropic/claude-haiku-4-5-20251001", etc. */
export const listAllModels = () => invoke<string[]>("list_all_models");

export const summarizeFile = (fileId: string, model: string) =>
  invoke<string>("summarize_file", { fileId, model });

export const summarizeVault = (vaultId: string, model: string) =>
  invoke<number>("summarize_vault", { vaultId, model });

// ── Settings ──────────────────────────────────────────────────────────────────

export const getApiKey = () => invoke<string>("get_api_key");

// ── Scanner ───────────────────────────────────────────────────────────────────

export interface Finding {
  rule: string;
  description: string;
  severity: "critical" | "high" | "medium" | "low";
  line: number;
  snippet: string;
}

export interface ScanResult {
  file_id: string;
  risk_level: "critical" | "high" | "medium" | "low" | "clean";
  findings: Finding[];
}

export const scanFile = (fileId: string) =>
  invoke<ScanResult>("scan_file", { fileId });

export const scanVault = (vaultId: string, rescan = false) =>
  invoke<number>("scan_vault", { vaultId, rescan });

export interface ScannerRule {
  id: string;
  description: string;
  severity: "critical" | "high" | "medium" | "low";
  pattern: string;
  tags: string | null;       // JSON array
  source: "builtin" | "gitleaks";
  enabled: boolean;
  updated_at: string;
}

export interface UpdateRulesResult {
  added: number;
  updated: number;
  skipped_invalid: number;
  total: number;
}

export const listRules = () => invoke<ScannerRule[]>("list_rules");

export const toggleRule = (ruleId: string, enabled: boolean) =>
  invoke<void>("toggle_rule", { ruleId, enabled });

export const updateRules = () => invoke<UpdateRulesResult>("update_rules");

export type CloudProvider = "anthropic" | "openai" | "deepseek" | "google";

export const getCloudApiKey = (provider: CloudProvider) =>
  invoke<string | null>("get_cloud_api_key", { provider });

export const setCloudApiKey = (provider: CloudProvider, key: string) =>
  invoke<void>("set_cloud_api_key", { provider, key });
