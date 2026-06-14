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

      <div className="flex items-center justify-between">
        <button
          onClick={onPrev}
          disabled={isFirst}
          className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)] disabled:opacity-30 transition-colors"
        >
          ← Prev
        </button>

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
