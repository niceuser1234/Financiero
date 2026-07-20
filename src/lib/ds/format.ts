/**
 * Pure Helfer für die Design-System-Komponenten.
 * Bewusst frei von React, damit sie im node-Environment testbar bleiben.
 */

/** Initiale für den Merchant-Avatar. Das DS holt keine Logos — nur den ersten Buchstaben. */
export function initialFor(name: string | null | undefined): string {
  const first = (name ?? "").trim().charAt(0);
  return first === "" ? "?" : first.toUpperCase();
}

export type AmountTone = "income" | "neutral";

/**
 * Betragsfarbe laut DS: Einnahmen grün, Ausgaben neutral (--ink-900).
 * Rot ist im DS ausschließlich Label- und Tint-Farbe, nie die Farbe eines Betrags.
 */
export function toneForCents(cents: bigint): AmountTone {
  return cents > 0n ? "income" : "neutral";
}

/** Chart-Palette des DS: 8 harmonisierte Farben, kein Lila, kein Mint. */
export const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
  "var(--chart-7)",
  "var(--chart-8)",
] as const;

/** Farbe für den n-ten Datenpunkt; rotiert über das Palettenende hinaus. */
export function chartColorAt(index: number): string {
  return CHART_COLORS[index % CHART_COLORS.length];
}
