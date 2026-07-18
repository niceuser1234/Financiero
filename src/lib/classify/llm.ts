import Anthropic from "@anthropic-ai/sdk";
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

const MODEL = process.env.CLASSIFY_MODEL ?? "claude-opus-4-8";
const CHUNK_SIZE = 100;

/** Minimaler Batch-Client-Ausschnitt (real: Anthropic SDK; Tests: Fake). */
export interface BatchClient {
  messages: {
    batches: {
      create(body: {
        requests: Array<{ custom_id: string; params: Record<string, unknown> }>;
      }): Promise<{ id: string; processing_status: string }>;
      retrieve(id: string): Promise<{ processing_status: string }>;
      results(id: string): AsyncIterable<{
        custom_id: string;
        result:
          | { type: "succeeded"; message: { content: Array<{ type: string; text?: string }>; usage?: { input_tokens?: number; output_tokens?: number } } }
          | { type: "errored" | "canceled" | "expired" };
      }>;
    };
  };
}

function defaultClient(): BatchClient {
  return new Anthropic() as unknown as BatchClient;
}

export function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export function buildBatchRequests(
  items: FingerprintItem[],
  system: string,
  model = MODEL,
): Array<{ custom_id: string; params: Record<string, unknown> }> {
  return chunk(items, CHUNK_SIZE).map((group, i) => ({
    custom_id: `chunk-${i}`,
    params: {
      model,
      max_tokens: 16000,
      system,
      output_config: { format: { type: "json_schema", schema: classificationSchema } },
      messages: [{ role: "user", content: buildUserContent(group) }],
    },
  }));
}

function magnitude(cents: bigint): string {
  const eur = Math.abs(Number(cents)) / 100;
  return `~${Math.round(eur)} EUR`;
}

/** Sammelt unbekannte Händler-Fingerprints (je 1 Repräsentant) und startet einen Batch. */
export async function classifyUnknownFingerprints(
  client: BatchClient = defaultClient(),
): Promise<{ submitted: number; batchId: string | null }> {
  const knownMerchants = new Set((await db.select({ fp: merchants.fingerprint }).from(merchants)).map((m) => m.fp));

  const rows = await db
    .select({
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

  const byFp = new Map<string, FingerprintItem>();
  for (const r of rows) {
    const fp = fingerprintOf(r.counterpartyName, r.purpose);
    if (!fp || knownMerchants.has(fp) || byFp.has(fp)) continue;
    byFp.set(fp, {
      id: fp,
      counterparty: r.counterpartyName,
      purpose: r.purpose,
      amountMagnitude: magnitude(r.amountCents),
      accountType: r.accountType,
    });
  }

  const items = [...byFp.values()];
  if (items.length === 0) return { submitted: 0, batchId: null };

  const cats = await db.select({ slug: categories.slug, name: categories.name }).from(categories);
  const requests = buildBatchRequests(items, buildSystemPrompt(cats));

  const batch = await client.messages.batches.create({ requests });
  await db.insert(llmRuns).values({
    batchId: batch.id,
    model: MODEL,
    itemCount: items.length,
    status: "running",
  });

  return { submitted: items.length, batchId: batch.id };
}

/** Pollt laufende Batches, wendet fertige Ergebnisse an (Merchants + Transaktionen). */
export async function pollAndApplyBatches(
  client: BatchClient = defaultClient(),
): Promise<{ applied: number }> {
  const running = await db.select().from(llmRuns).where(eq(llmRuns.status, "running"));
  if (running.length === 0) return { applied: 0 };

  const cats = await db.select().from(categories);
  const slugToId = new Map(cats.map((c) => [c.slug, c.id]));
  const validSlugs = new Set(cats.map((c) => c.slug));
  const sonstigesId = slugToId.get("sonstiges")!;

  // Kandidaten-Transaktionen einmal laden und nach Fingerprint gruppieren.
  const candidates = await db
    .select({
      id: transactions.id,
      counterpartyName: transactions.counterpartyName,
      purpose: transactions.purpose,
    })
    .from(transactions)
    .where(
      and(
        isNull(transactions.merchantId),
        or(eq(transactions.categorizationSource, "none"), eq(transactions.categorizationSource, "import")),
      ),
    );
  const fpToTxIds = new Map<string, string[]>();
  for (const c of candidates) {
    const fp = fingerprintOf(c.counterpartyName, c.purpose);
    if (!fp) continue;
    const arr = fpToTxIds.get(fp) ?? [];
    arr.push(c.id);
    fpToTxIds.set(fp, arr);
  }

  let applied = 0;

  for (const run of running) {
    const status = await client.messages.batches.retrieve(run.batchId);
    if (status.processing_status !== "ended") continue;

    let inputTokens = 0;
    let outputTokens = 0;

    for await (const res of client.messages.batches.results(run.batchId)) {
      if (res.result.type !== "succeeded") continue;
      inputTokens += res.result.message.usage?.input_tokens ?? 0;
      outputTokens += res.result.message.usage?.output_tokens ?? 0;

      const text = res.result.message.content.find((b) => b.type === "text")?.text ?? "{}";
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
            .set({
              categoryId,
              merchantId: m.id,
              categorizationSource: "llm",
              confidence: norm.confidence,
            })
            .where(inArray(transactions.id, txIds));
          applied += txIds.length;
        }
      }
    }

    await db
      .update(llmRuns)
      .set({ status: "ok", inputTokens, outputTokens })
      .where(eq(llmRuns.id, run.id));
  }

  return { applied };
}
