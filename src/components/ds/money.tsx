import { formatCents } from "@/lib/money";
import { toneForCents, type AmountTone } from "@/lib/ds/format";
import { cn } from "@/lib/utils";

const TONE_CLASS: Record<AmountTone, string> = {
  income: "text-income",
  neutral: "text-ink-900",
};

/**
 * Geldbetrag in DS-Optik: Display-Font, tabellarisch, rechtsbündig.
 * Einnahmen grün, Ausgaben neutral — Rot ist im DS keine Betragsfarbe.
 */
export function Money({
  cents,
  currency,
  className,
}: {
  cents: bigint;
  currency?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "tabular font-display text-[15px] font-semibold tracking-[-0.01em]",
        TONE_CLASS[toneForCents(cents)],
        className,
      )}
    >
      {formatCents(cents, currency)}
    </span>
  );
}

/** Variante für bereits formatierte Strings, wie sie die Analytics-DTOs liefern. */
function MoneyText({
  value,
  tone = "neutral",
  className,
}: {
  value: string;
  tone?: AmountTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "tabular font-display text-[15px] font-semibold tracking-[-0.01em]",
        TONE_CLASS[tone],
        className,
      )}
    >
      {value}
    </span>
  );
}

Money.Text = MoneyText;
