import { RefreshCw, Wifi, WifiOff, Sun, Moon, Type } from "lucide-react";
import { useEffect, useState } from "react";
import { ollamaHealth } from "@/lib/tauri";
import { useTheme, FontSize } from "@/lib/theme";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

const FONT_SIZES: { label: string; value: FontSize }[] = [
  { label: "S", value: "small" },
  { label: "M", value: "medium" },
  { label: "L", value: "large" },
];

export function TopBar() {
  const [ollamaOk, setOllamaOk] = useState<boolean | null>(null);
  const { mode, setMode, fontSize, setFontSize } = useTheme();

  useEffect(() => {
    ollamaHealth().then(setOllamaOk).catch(() => setOllamaOk(false));
    const id = setInterval(() => {
      ollamaHealth().then(setOllamaOk).catch(() => setOllamaOk(false));
    }, 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="h-11 flex items-center justify-between px-4 border-b border-[var(--color-border-subtle)] bg-[var(--color-surface)] shrink-0">
      <span className="text-sm font-semibold text-[var(--color-text-primary)] tracking-wide">
        MdownManager
      </span>

      <div className="flex items-center gap-3">
        {/* Font size presets */}
        <div className="flex items-center gap-0.5 bg-[var(--color-surface-2)] rounded p-0.5">
          <Type size={11} className="text-[var(--color-text-muted)] mx-1" />
          {FONT_SIZES.map((s) => (
            <button
              key={s.value}
              onClick={() => setFontSize(s.value)}
              className={cn(
                "w-6 h-5 rounded text-xs font-medium transition-colors",
                fontSize === s.value
                  ? "bg-[var(--color-accent)] text-white"
                  : "text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
              )}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Light / dark toggle */}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setMode(mode === "dark" ? "light" : "dark")}
          title={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {mode === "dark" ? <Sun size={14} /> : <Moon size={14} />}
        </Button>

        {/* Ollama status */}
        <div className="flex items-center gap-1.5 text-xs">
          {ollamaOk === null ? (
            <RefreshCw size={12} className="animate-spin text-[var(--color-text-muted)]" />
          ) : ollamaOk ? (
            <Wifi size={12} className="text-[var(--color-accent)]" />
          ) : (
            <WifiOff size={12} className="text-[var(--color-text-muted)]" />
          )}
          <span className={ollamaOk ? "text-[var(--color-accent)]" : "text-[var(--color-text-muted)]"}>
            {ollamaOk === null ? "Checking…" : ollamaOk ? "Ollama" : "Ollama offline"}
          </span>
        </div>
      </div>
    </header>
  );
}
