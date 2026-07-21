import { TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type KpiTone = "neutral" | "income" | "expense" | "accent";

const TONES: Record<KpiTone, { card: string; label: string; value: string; delta: string }> = {
  neutral: {
    card: "bg-surface border border-hairline shadow-ds-md",
    label: "text-ink-400",
    value: "text-ink-900",
    delta: "text-ink-500",
  },
  income: {
    card: "bg-income-soft border border-transparent",
    label: "text-income-mid",
    value: "text-income",
    delta: "text-income-mid",
  },
  expense: {
    card: "bg-expense-soft border border-transparent",
    label: "text-expense",
    value: "text-expense-strong",
    delta: "text-expense",
  },
  accent: {
    card: "bg-primary border border-transparent shadow-ds-accent",
    label: "text-white/75",
    value: "text-white",
    delta: "text-white/85",
  },
};

/**
 * KPI-Kachel — die Signaturkomponente des Design Systems.
 * Uppercase-Eyebrow, große Space-Grotesk-Zahl, optionale Delta-Zeile.
 */
export function KpiCard({
  label,
  value,
  sublabel,
  tone = "neutral",
  delta,
  deltaDir,
  icon: Icon,
}: {
  label: string;
  value: string;
  sublabel?: string;
  tone?: KpiTone;
  delta?: string;
  deltaDir?: "up" | "down";
  icon?: LucideIcon;
}) {
  const t = TONES[tone];
  const DeltaIcon = deltaDir === "up" ? TrendingUp : deltaDir === "down" ? TrendingDown : null;

  return (
    <div className={cn("rounded-lg px-[22px] py-5", t.card)}>
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "text-[11px] font-semibold tracking-[var(--tracking-label)] uppercase",
            t.label,
          )}
        >
          {label}
        </span>
        {Icon && <Icon className={cn("size-[17px]", t.label)} strokeWidth={1.75} />}
      </div>
      <div
        className={cn(
          "tabular font-display mt-3 text-[30px] leading-none font-bold tracking-[var(--tracking-tight)]",
          t.value,
        )}
      >
        {value}
      </div>
      {sublabel && (
        <div className={cn("mt-1.5 text-[11px] font-medium", t.label)}>{sublabel}</div>
      )}
      {delta && (
        <div className={cn("tabular mt-2 flex items-center gap-1.5 text-[13px] font-medium", t.delta)}>
          {DeltaIcon && <DeltaIcon className="size-[15px]" strokeWidth={2} />}
          {delta}
        </div>
      )}
    </div>
  );
}
