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
        <img src="/icon.png" alt="MDownManager" className="w-12 h-12 rounded-xl" />
        <span className="text-lg font-semibold text-[var(--color-text-primary)] tracking-tight">
          MDownManager
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
