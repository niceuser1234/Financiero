// SEPA-/Karten-Boilerplate, die den Verwendungszweck verrauscht.
const BOILERPLATE = [
  /\b(EREF|MREF|KREF|CRED|SVWZ|ABWA|ABWE|DATUM|TAN|BIC|IBAN|GLÄUBIGER-ID|MANDAT)\+?:?\s*\S*/gi,
  /\bSEPA-?(LASTSCHRIFT|ÜBERWEISUNG|UEBERWEISUNG|GUTSCHRIFT|BASISLASTSCHRIFT)\b/gi,
  /\b\d{4}\*{2,}\d+\b/g, // maskierte Kartennummern
  /\bDE\d{2}[A-Z0-9]{2,}\b/g, // Gläubiger-IDs / IBANs im Fließtext
];

const IBAN_LENGTHS: Readonly<Record<string, number>> = {
  AT: 20,
  BE: 16,
  CH: 21,
  CZ: 24,
  DE: 22,
  DK: 18,
  ES: 24,
  FI: 18,
  FR: 27,
  GB: 22,
  GR: 27,
  IE: 22,
  IT: 27,
  LI: 21,
  LU: 20,
  NL: 18,
  NO: 15,
  PL: 28,
  PT: 25,
  SE: 24,
};

/** Entfernt eine von MT940 direkt vor den Namen gesetzte Gegenkonto-IBAN. */
export function stripLeadingIban(value: string | null): string | null {
  if (!value) return value;
  const compact = value.trim();
  const length = IBAN_LENGTHS[compact.slice(0, 2).toUpperCase()];
  if (!length || compact.length <= length) return compact;
  const candidate = compact.slice(0, length);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/i.test(candidate)) return compact;
  return compact.slice(length).trim() || null;
}

/** Retail/marketplace/cashflow noise — never a subscription/contract. */
export const NON_RECURRING_BRAND =
  /\b(rewe|aldi|lidl|edeka|rossmann|\bdm\b|konsum|amazon|vinted|kleiderkreisel|paypal|deutsche bahn|db vertrieb|getkong|playtomic|nextbike|studentenwerk|mc[ -]?(?:doener|döner)|doener|döner|einzahlung|kartenpreis|dkb)\b/i;

export function isNonRecurringBrand(text: string): boolean {
  return NON_RECURRING_BRAND.test(text ?? "");
}

/**
 * Bekannte Marken → kanonischer Fingerprint + Display-Name.
 * Wichtig: Anthropic/Claude und Spotifys diverse Kartentexte landen in EINEM Händler.
 */
export const BRAND_ALIASES: ReadonlyArray<{
  test: RegExp;
  fingerprint: string;
  name: string;
  subscription: boolean;
  domain?: string;
}> = [
  { test: /\bspotify\b/i, fingerprint: "spotify", name: "Spotify", subscription: true, domain: "spotify.com" },
  { test: /\b(anthropic|claude\.?\s*ai|claude)\b/i, fingerprint: "anthropic claude", name: "Claude AI", subscription: true, domain: "claude.ai" },
  { test: /\bnetflix\b/i, fingerprint: "netflix", name: "Netflix", subscription: true, domain: "netflix.com" },
  { test: /\bdisney\s*\+?\b|\bdisneyplus\b/i, fingerprint: "disney plus", name: "Disney+", subscription: true, domain: "disneyplus.com" },
  { test: /\byoutube\s*premium\b|\byg\s*\*\s*music\b/i, fingerprint: "youtube premium", name: "YouTube Premium", subscription: true, domain: "youtube.com" },
  { test: /\bapple\s*(services|com\/?bill)?\b|\bitunes\.com\b/i, fingerprint: "apple services", name: "Apple", subscription: true, domain: "apple.com" },
  { test: /\bgoogle\s*one\b|\bgoogle\s*\*\s*google one\b/i, fingerprint: "google one", name: "Google One", subscription: true, domain: "one.google.com" },
  { test: /\bcursor\b/i, fingerprint: "cursor", name: "Cursor", subscription: true, domain: "cursor.com" },
  { test: /\bperplexity\b/i, fingerprint: "perplexity", name: "Perplexity", subscription: true, domain: "perplexity.ai" },
  { test: /\bopenai\b|\bchatgpt\b/i, fingerprint: "openai", name: "OpenAI", subscription: true, domain: "openai.com" },
  { test: /\begym\b|\bwellpass\b/i, fingerprint: "egym wellpass", name: "EGYM Wellpass", subscription: true, domain: "egym.com" },
  { test: /\bviactiv\b/i, fingerprint: "viactiv", name: "VIACTIV", subscription: true, domain: "viactiv.de" },
  { test: /\bnextbike\b/i, fingerprint: "nextbike", name: "nextbike", subscription: true, domain: "nextbike.de" },
  { test: /\brewe\b/i, fingerprint: "rewe", name: "REWE", subscription: false, domain: "rewe.de" },
  { test: /\baldi\b/i, fingerprint: "aldi", name: "Aldi", subscription: false, domain: "aldi-nord.de" },
  { test: /\blidl\b/i, fingerprint: "lidl", name: "Lidl", subscription: false, domain: "lidl.de" },
  { test: /\bdm[\s-]?drogerie\b|\bdm\b(?=.*droger)/i, fingerprint: "dm", name: "dm", subscription: false, domain: "dm.de" },
  { test: /\brossmann\b/i, fingerprint: "rossmann", name: "Rossmann", subscription: false, domain: "rossmann.de" },
  { test: /\bamazon\b/i, fingerprint: "amazon", name: "Amazon", subscription: false, domain: "amazon.de" },
  { test: /\bdeutsche\s*bahn\b|\bdb\s*vertrieb\b|\bdb\s*fernverkehr\b/i, fingerprint: "deutsche bahn", name: "Deutsche Bahn", subscription: false, domain: "bahn.de" },
  { test: /\bvinted\b|\bkleiderkreisel\b/i, fingerprint: "vinted", name: "Vinted", subscription: false, domain: "vinted.de" },
];

export function matchBrand(
  ...parts: Array<string | null | undefined>
): (typeof BRAND_ALIASES)[number] | null {
  const hay = parts.filter(Boolean).join(" ");
  if (!hay) return null;
  for (const b of BRAND_ALIASES) {
    // Blocklistete Marken (Retail/Marketplace/Cashflow) sind nie ein Abo-Hinweis.
    if (b.test.test(hay)) return { ...b, subscription: b.subscription && !isNonRecurringBrand(b.name) };
  }
  return null;
}

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
  const cleanCounterparty = stripLeadingIban(counterparty);
  if (!cleanCounterparty || !/paypal/i.test(cleanCounterparty)) return null;
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

function rawBase(counterparty: string | null, purpose: string | null): string {
  const unwrapped = unwrapPaypal(counterparty, purpose);
  if (unwrapped) return unwrapped.merchant;
  const cleanCounterparty = stripLeadingIban(counterparty);
  if (cleanCounterparty) return cleanCounterparty;
  return normalizePurpose(purpose);
}

function squash(s: string): string {
  return s
    .toLowerCase()
    .replace(/[0-9]/g, " ")
    .replace(/[^a-zäöüß ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 40)
    .trim();
}

/**
 * Stabiler Händler-Fingerprint: Brand-Alias > PayPal-Unwrap > Counterparty > Purpose.
 * Brand-Aliase führen diverse Kartentexte (z.B. CLAUDE.AI / ANTHROPIC*CLAUDE) zusammen.
 */
export function fingerprintOf(counterparty: string | null, purpose: string | null): string {
  const base = rawBase(counterparty, purpose);
  const brand = matchBrand(base, counterparty, purpose);
  if (brand) return brand.fingerprint;
  return squash(base);
}

/** Optionaler Display-Name aus Brand-Tabelle. */
export function brandNameOf(counterparty: string | null, purpose: string | null): string | null {
  return matchBrand(rawBase(counterparty, purpose), counterparty, purpose)?.name ?? null;
}

/** Brand-Key aus einem bereits gespeicherten Fingerprint/Namen (für Merge in Recurring). */
export function brandKeyOf(fingerprintOrName: string): string {
  const brand = matchBrand(fingerprintOrName);
  return brand?.fingerprint ?? squash(fingerprintOrName);
}
