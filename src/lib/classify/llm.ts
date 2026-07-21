import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@/db";
import { bankAccounts, categories, llmRuns, merchants, transactions } from "@/db/schema";
import { fingerprintOf } from "./normalize";
import {
  buildSystemPrompt,
  buildUserContent,
  classificationSchema,
  normalizeClassification,
  type ClassificationItem,
  type FingerprintItem,
} from "./prompt";

const MODEL = process.env.CLASSIFY_MODEL ?? "google/gemini-2.5-flash";
const CHUNK_SIZE = 100;

/** Ein synchroner Chat-Aufruf. Real: OpenRouter; Tests: Fake. */
export interface ChatClient {
  chat(body: { model: string; system: string; user: string }): Promise<{
    text: string;
    inputTokens: number;
    outputTokens: number;
  }>;
}

/** Default: OpenRouter Chat Completions (OpenAI-kompatibel) via fetch. */
function defaultClient(): ChatClient {
  const base = process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";
  const key = process.env.OPENROUTER_API_KEY;
  return {
    async chat({ model, system, user }) {
      if (!key) throw new Error("OPENROUTER_API_KEY fehlt");
      const res = await fetch(`${base}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          response_format: {
            type: "json_schema",
            json_schema: { name: "classification", strict: true, schema: classificationSchema },
          },
        }),
      });
      if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${await res.text()}`);
      const json = (await res.json()) as {
        choices: { message: { content: string } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      return {
        text: json.choices[0]?.message?.content ?? "{}",
        inputTokens: json.usage?.prompt_tokens ?? 0,
        outputTokens: json.usage?.completion_tokens ?? 0,
      };
    },
  };
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function magnitude(cents: bigint): string {
  const eur = Math.abs(Number(cents)) / 100;
  return `~${Math.round(eur)} EUR`;
}

/**
 * Klassifiziert alle unbekannten Händler-Fingerprints synchron und wendet die
 * Ergebnisse direkt an (Merchants anlegen/aktualisieren + Transaktionen setzen).
 * Gibt die Anzahl aktualisierter Transaktionen zurück.
 */
export async function classifyUnknownFingerprints(
  client: ChatClient = defaultClient(),
): Promise<{ classified: number }> {
  const knownMerchants = new Set((await db.select({ fp: merchants.fingerprint }).from(merchants)).map((m) => m.fp));

  const rows = await db
    .select({
      id: transactions.id,
      counterpartyName: transactions.counterpartyName,
      purpose: transactions.purpose,
      amountCents: transactions.amountCents,
      accountType: bankAccounts.type,
    })
    .from(transactions)
    .innerJoin(bankAccounts, eq(transactions.accountId, bankAccounts.id))
    .where(
      and(
        eq(transactions.isTransfer, false),
        isNull(transactions.merchantId),
        or(eq(transactions.categorizationSource, "none"), eq(transactions.categorizationSource, "import")),
      ),
    );

  // Ein Repräsentant + alle Tx-IDs je Fingerprint.
  const byFp = new Map<string, FingerprintItem>();
  const fpToTxIds = new Map<string, string[]>();
  for (const r of rows) {
    const fp = fingerprintOf(r.counterpartyName, r.purpose);
    if (!fp || knownMerchants.has(fp)) continue;
    if (!byFp.has(fp)) {
      byFp.set(fp, {
        id: fp,
        counterparty: r.counterpartyName,
        purpose: r.purpose,
        amountMagnitude: magnitude(r.amountCents),
        accountType: r.accountType,
      });
    }
    (fpToTxIds.get(fp) ?? fpToTxIds.set(fp, []).get(fp)!).push(r.id);
  }

  const items = [...byFp.values()];
  if (items.length === 0) return { classified: 0 };

  const cats = await db.select().from(categories);
  const slugToId = new Map(cats.map((c) => [c.slug, c.id]));
  const validSlugs = new Set(cats.map((c) => c.slug));
  const sonstigesId = slugToId.get("sonstiges")!;
  const system = buildSystemPrompt(cats.map((c) => ({ slug: c.slug, name: c.name })));

  let classified = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  const batchId = crypto.randomUUID();
  await db.insert(llmRuns).values({ batchId, model: MODEL, itemCount: items.length, status: "running" });

  try {
    for (const group of chunk(items, CHUNK_SIZE)) {
      const { text, inputTokens: it, outputTokens: ot } = await client.chat({
        model: MODEL,
        system,
        user: buildUserContent(group),
      });
      inputTokens += it;
      outputTokens += ot;

      let parsed: { items?: ClassificationItem[] };
      try {
        parsed = JSON.parse(text);
      } catch {
        continue;
      }

      for (const item of parsed.items ?? []) {
        const norm = normalizeClassification(item, validSlugs);
        const categoryId = slugToId.get(norm.categorySlug) ?? sonstigesId;

        const [m] = await db
          .insert(merchants)
          .values({
            fingerprint: item.id,
            nameClean: norm.merchantClean,
            defaultCategoryId: categoryId,
            isSubscriptionHint: norm.isSubscription,
          })
          .onConflictDoUpdate({
            target: merchants.fingerprint,
            set: { nameClean: norm.merchantClean, defaultCategoryId: categoryId, isSubscriptionHint: norm.isSubscription },
          })
          .returning();

        const txIds = fpToTxIds.get(item.id) ?? [];
        if (txIds.length) {
          await db
            .update(transactions)
            .set({ categoryId, merchantId: m.id, categorizationSource: "llm", confidence: norm.confidence })
            .where(inArray(transactions.id, txIds));
          classified += txIds.length;
        }
      }
    }

    await db.update(llmRuns).set({ status: "ok", inputTokens, outputTokens }).where(eq(llmRuns.batchId, batchId));
  } catch (e) {
    await db.update(llmRuns).set({ status: "error", inputTokens, outputTokens }).where(eq(llmRuns.batchId, batchId));
    throw e;
  }

  return { classified };
}
