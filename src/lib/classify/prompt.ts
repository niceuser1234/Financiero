export const classificationSchema = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "merchant_clean", "category_slug", "is_subscription_hint", "confidence"],
        properties: {
          id: { type: "string" },
          merchant_clean: { type: "string" },
          category_slug: { type: "string" },
          is_subscription_hint: { type: "boolean" },
          confidence: { type: "number" },
        },
      },
    },
  },
} as const;

export interface FingerprintItem {
  id: string; // = fingerprint (dient als custom-id-Zuordnung im Item)
  counterparty: string | null;
  purpose: string | null;
  amountMagnitude: string; // grobe Größenordnung, z.B. "~10 EUR"
  accountType: string;
}

export interface ClassificationItem {
  id: string;
  merchant_clean: string;
  category_slug: string;
  is_subscription_hint: boolean;
  confidence: number;
}

/** Baut den deutschen System-Prompt inkl. Taxonomie-Liste. */
export function buildSystemPrompt(categories: { slug: string; name: string }[]): string {
  const list = categories.map((c) => `- ${c.slug}: ${c.name}`).join("\n");
  return `Du bist ein präziser Kategorisierer für deutsche Bankumsätze. Du ordnest jeder Buchung genau eine Kategorie aus der folgenden Taxonomie zu (nutze ausschließlich die slug-Werte):

${list}

Regeln:
- Erkenne den tatsächlichen Händler, auch wenn Zahlungsdienstleister-Rauschen (PayPal, Klarna, SEPA-Referenzen) im Text steht. Gib in "merchant_clean" den sauberen Händlernamen zurück (z.B. "Netflix", "REWE", "Deutsche Bahn").
- Setze "is_subscription_hint" auf true bei typischen Abo-/Vertragsanbietern (Streaming, Software, Versicherung, Mobilfunk, Strom, Fitnessstudio, Zeitung).
- Wähle die spezifischste passende Unterkategorie. Wenn unklar, nutze die passende Hauptkategorie.
- Wenn du den Händler nicht sinnvoll zuordnen kannst, nutze "sonstiges" mit niedriger confidence (< 0.5).
- "confidence" ist deine Sicherheit zwischen 0 und 1.
- Gib "id" exakt so zurück, wie sie im Input steht.
- Sparpläne und Broker-Einzahlungen (z.B. "Trade Republic", "Scalable", Verwendungszweck "Sparplan"/"Einzahlung" an ein eigenes Depot) gehören zu "sparen-investieren-sparen".
- Kartengebühren ("Kartenpreis", Entgelt) -> "gebuehren-zinsen". Bargeld ("Bargeldabhebung", "Cashback") -> "bargeld".
- Krankenkasse (z.B. VIACTIV) -> "versicherungen-kranken". Fitness (EGYM Wellpass, Fitness First) -> "gesundheit-fitness-fitnessstudio". KI-/Software-Abos (Anthropic, Claude, Cursor, Perplexity) -> "abos-software-cloud". Spotify -> "abos-streaming". Deutsche Bahn (DB Vertrieb) -> "mobilitaet-oepnv-bahn".`;
}

/** Baut den User-Turn (JSON-Liste der zu klassifizierenden Repräsentanten). */
export function buildUserContent(items: FingerprintItem[]): string {
  const payload = items.map((i) => ({
    id: i.id,
    counterparty: i.counterparty,
    purpose: i.purpose,
    amount: i.amountMagnitude,
    account_type: i.accountType,
  }));
  return `Klassifiziere diese Buchungen und gib für jede genau ein Objekt zurück:\n\n${JSON.stringify(payload, null, 2)}`;
}

/** Validiert einen Slug; unbekannt -> sonstiges mit gedeckelter confidence. */
export function normalizeClassification(
  item: ClassificationItem,
  validSlugs: Set<string>,
): { categorySlug: string; confidence: number; merchantClean: string; isSubscription: boolean } {
  const valid = validSlugs.has(item.category_slug);
  return {
    categorySlug: valid ? item.category_slug : "sonstiges",
    confidence: valid ? clamp(item.confidence) : Math.min(clamp(item.confidence), 0.3),
    merchantClean: item.merchant_clean?.trim() || item.id,
    isSubscription: !!item.is_subscription_hint,
  };
}

function clamp(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
