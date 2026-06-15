import { cn } from "@/lib/utils";

type Variant = "default" | "low" | "medium" | "high" | "critical" | "ai" | "manual" | "skill" | "skill-valid";

const variants: Record<Variant, string> = {
  default: "bg-[var(--color-surface-2)] text-[var(--color-text-secondary)]",
  low: "bg-green-900/40 text-green-400 border border-green-800/50",
  medium: "bg-yellow-900/40 text-yellow-400 border border-yellow-800/50",
  high: "bg-red-900/40 text-red-400 border border-red-800/50",
  critical: "bg-red-700/50 text-red-200 border border-red-600/70 font-semibold",
  ai: "bg-blue-900/40 text-blue-400 border border-blue-800/50",
  manual: "bg-purple-900/40 text-purple-400 border border-purple-800/50",
  skill: "bg-[var(--color-surface-2)] text-[var(--color-text-muted)] border border-[var(--color-border-subtle)]",
  "skill-valid": "bg-emerald-900/40 text-emerald-400 border border-emerald-800/50",
};

interface BadgeProps {
  variant?: Variant;
  children: React.ReactNode;
  className?: string;
}

export function Badge({ variant = "default", children, className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium",
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
