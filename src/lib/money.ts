/**
 * Geldbeträge werden intern immer als bigint Cents gehalten — niemals Float.
 */

const CURRENCY_FORMATTERS = new Map<string, Intl.NumberFormat>();

function formatterFor(currency: string): Intl.NumberFormat {
  let fmt = CURRENCY_FORMATTERS.get(currency);
  if (!fmt) {
    fmt = new Intl.NumberFormat("de-DE", { style: "currency", currency });
    CURRENCY_FORMATTERS.set(currency, fmt);
  }
  return fmt;
}

/** Formatiert Cents als deutschen Währungsstring, z.B. -123456n -> "-1.234,56 €". */
export function formatCents(cents: bigint, currency = "EUR"): string {
  const value = Number(cents) / 100;
  return formatterFor(currency).format(value);
}

/**
 * Parst einen Betrags-String zu Cents.
 * Erkennt deutsches Format (1.234,56) und englisches (-1234.56 / -9.99).
 * Wirft bei nicht parsebaren Eingaben.
 */
export function parseGermanAmount(input: string): bigint {
  const cleaned = input
    .replace(/[€$£\s]/g, "")
    .replace(/−/g, "-") // Unicode-Minus
    .trim();

  if (cleaned === "" || !/[0-9]/.test(cleaned)) {
    throw new Error(`Nicht parsebarer Betrag: "${input}"`);
  }

  const negative = cleaned.startsWith("-");
  const unsigned = cleaned.replace(/^[+-]/, "");

  let normalized: string;
  if (unsigned.includes(",")) {
    // Deutsches Format: Punkte sind Tausendertrenner, Komma ist Dezimal.
    normalized = unsigned.replace(/\./g, "").replace(",", ".");
  } else {
    // Englisches Format: letzter Punkt ist Dezimaltrenner, weitere Punkte = Tausender.
    const parts = unsigned.split(".");
    if (parts.length > 2) {
      const dec = parts.pop();
      normalized = parts.join("") + "." + dec;
    } else {
      normalized = unsigned;
    }
  }

  const num = Number(normalized);
  if (!Number.isFinite(num)) {
    throw new Error(`Nicht parsebarer Betrag: "${input}"`);
  }

  // Runde auf Cents, um Float-Rauschen zu vermeiden.
  const cents = BigInt(Math.round(num * 100));
  return negative ? -cents : cents;
}

/**
 * Parst einen dezimalen API-String (z.B. Enable Banking "amount": "-12.50")
 * exakt zu Cents ohne Float — via String-Split.
 */
export function decimalToCents(input: string): bigint {
  const s = input.replace(/−/g, "-").trim();
  const negative = s.startsWith("-");
  const unsigned = s.replace(/^[+-]/, "");
  const [intPart, fracRaw = ""] = unsigned.split(".");
  const frac = (fracRaw + "00").slice(0, 2);
  if (!/^\d+$/.test(intPart) || !/^\d{2}$/.test(frac)) {
    throw new Error(`Nicht parsebarer Dezimalbetrag: "${input}"`);
  }
  const cents = BigInt(intPart) * 100n + BigInt(frac);
  return negative ? -cents : cents;
}
