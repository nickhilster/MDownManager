import { cn } from "@/lib/utils";
import { InputHTMLAttributes, forwardRef } from "react";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "h-8 w-full rounded bg-[var(--color-surface-2)] border border-[var(--color-border)]",
        "px-3 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]",
        "focus:outline-none focus:border-[var(--color-accent)] transition-colors",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";
