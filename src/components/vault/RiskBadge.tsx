import { Badge } from "@/components/ui/Badge";

const riskVariant = {
  Low: "low",
  Medium: "medium",
  High: "high",
  Critical: "critical",
} as const;

export function RiskBadge({ risk }: { risk: string | null }) {
  if (!risk) return null;
  const variant = riskVariant[risk as keyof typeof riskVariant] ?? "default";
  return <Badge variant={variant}>{risk}</Badge>;
}
