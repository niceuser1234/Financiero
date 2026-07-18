// SEPA-/Karten-Boilerplate, die den Verwendungszweck verrauscht.
const BOILERPLATE = [
  /\b(EREF|MREF|KREF|CRED|SVWZ|ABWA|ABWE|DATUM|TAN|BIC|IBAN|GLÄUBIGER-ID|MANDAT)\+?:?\s*\S*/gi,
  /\bSEPA-?(LASTSCHRIFT|ÜBERWEISUNG|UEBERWEISUNG|GUTSCHRIFT|BASISLASTSCHRIFT)\b/gi,
  /\b\d{4}\*{2,}\d+\b/g, // maskierte Kartennummern
  /\bDE\d{2}[A-Z0-9]{2,}\b/g, // Gläubiger-IDs / IBANs im Fließtext
];

/** Entfernt SEPA-Boilerplate aus dem Verwendungszweck. */
export function normalizePurpose(s: string | null): string {
  if (!s) return "";
  let out = s;
  for (const re of BOILERPLATE) out = out.replace(re, " ");
  return out.replace(/\s+/g, " ").trim();
}

/**
 * Erkennt PayPal-Buchungen und extrahiert den echten Händler aus dem
 * Verwendungszweck. Gibt null zurück, wenn es keine PayPal-Buchung ist.
 */
export function unwrapPaypal(
  counterparty: string | null,
  purpose: string | null,
): { merchant: string } | null {
  if (!counterparty || !/paypal/i.test(counterparty)) return null;
  const p = purpose ?? "";

  const patterns = [
    /ihr einkauf bei\s+([^,\n]{2,40})/i,
    /\bPP\s*\.?\s*([A-Z0-9][A-Z0-9 &._-]{1,40}?)\s*,/,
    /\.\s*([A-Z0-9][A-Z0-9 &._-]{1,40}?)\s*,/,
  ];
  for (const re of patterns) {
    const m = p.match(re);
    if (m?.[1]) {
      const merchant = m[1].trim().replace(/\s+/g, " ");
      if (merchant) return { merchant };
    }
  }
  return null;
}

/**
 * Stabiler Händler-Fingerprint: PayPal-Unwrap, dann lowercase, Ziffern raus,
 * nur [a-z ], kollabierte Spaces, max 40 Zeichen.
 */
export function fingerprintOf(counterparty: string | null, purpose: string | null): string {
  const unwrapped = unwrapPaypal(counterparty, purpose);
  const base = unwrapped
    ? unwrapped.merchant
    : counterparty && counterparty.trim()
      ? counterparty
      : normalizePurpose(purpose);

  return base
    .toLowerCase()
    .replace(/[0-9]/g, " ")
    .replace(/[^a-zäöüß ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40)
    .trim();
}
