import { invoke } from "@tauri-apps/api/core";

export interface TourState {
  seen: boolean;
  step: number;
}

export const getTourState = () => invoke<TourState>("get_tour_state");
export const setTourSeen = () => invoke<void>("set_tour_seen");
export const setTourStep = (step: number) => invoke<void>("set_tour_step", { step });

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
