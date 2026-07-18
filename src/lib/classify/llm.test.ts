import { afterEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { bankAccounts, llmRuns, merchants, transactions } from "@/db/schema";
import { importHash } from "@/lib/import/hash";
import { fingerprintOf } from "./normalize";
import {
  buildBatchRequests,
  chunk,
  classifyUnknownFingerprints,
  pollAndApplyBatches,
  type BatchClient,
} from "./llm";
import type { FingerprintItem } from "./prompt";

type CreateBody = { requests: Array<{ custom_id: string; params: Record<string, unknown> }> };

function fakeClient(opts: {
  batchId?: string;
  captured?: CreateBody[];
  status?: string;
  results?: Array<{ custom_id: string; result: unknown }>;
}): BatchClient {
  return {
    messages: {
      batches: {
        create: async (body: CreateBody) => {
          opts.captured?.push(body);
          return { id: opts.batchId ?? "batch_x", processing_status: "in_progress" };
        },
        retrieve: async () => ({ processing_status: opts.status ?? "ended" }),
        results: async function* () {
          for (const r of opts.results ?? []) yield r as never;
        },
      },
    },
  } as BatchClient;
}

const MARK = `__llmtest_${crypto.randomUUID()}__`;
let accountId: string;

async function seedTx(cp: string, cents: bigint) {
  await db.insert(transactions).values({
    accountId,
    bookingDate: "2026-07-01",
    amountCents: cents,
    currency: "EUR",
    counterpartyName: cp,
    categorizationSource: "none",
    importHash: importHash({ accountId, bookingDate: "2026-07-01", amountCents: cents, currency: "EUR", counterparty: cp, purpose: null }),
  });
}

async function ensureAccount() {
  if (accountId) return;
  const [a] = await db.insert(bankAccounts).values({ name: MARK, type: "checking", currency: "EUR" }).returning();
  accountId = a.id;
}

describe("chunking", () => {
  it("splits 250 items into 3 requests of 100/100/50", () => {
    const items: FingerprintItem[] = Array.from({ length: 250 }, (_, i) => ({
      id: `fp${i}`,
      counterparty: `Shop ${i}`,
      purpose: null,
      amountMagnitude: "~10 EUR",
      accountType: "checking",
    }));
    expect(chunk(items, 100)).toHaveLength(3);
    const reqs = buildBatchRequests(items, "system");
    expect(reqs).toHaveLength(3);
    expect(reqs.map((r) => r.custom_id)).toEqual(["chunk-0", "chunk-1", "chunk-2"]);
  });
});

describe("classifyUnknownFingerprints", () => {
  afterEach(async () => {
    if (accountId) await db.delete(transactions).where(eq(transactions.accountId, accountId));
    await db.delete(merchants).where(inArray(merchants.fingerprint, ["glshop", "weirdco", "onlyfp"]));
    await db.delete(llmRuns).where(inArray(llmRuns.batchId, ["batch_classify", "batch_poll"]));
    if (accountId) {
      await db.delete(bankAccounts).where(eq(bankAccounts.id, accountId));
      accountId = "";
    }
  });

  it("submits one representative per unknown fingerprint", async () => {
    await ensureAccount();
    await seedTx("ONLYFP", -1000n);
    await seedTx("ONLYFP", -2000n); // same fingerprint -> one representative
    const captured: CreateBody[] = [];
    const res = await classifyUnknownFingerprints(fakeClient({ batchId: "batch_classify", captured }));
    expect(res.submitted).toBe(1);
    expect(res.batchId).toBe("batch_classify");
    expect(captured[0].requests).toHaveLength(1);
    const runs = await db.select().from(llmRuns).where(eq(llmRuns.batchId, "batch_classify"));
    expect(runs).toHaveLength(1);
  });
});

describe("pollAndApplyBatches", () => {
  afterEach(async () => {
    if (accountId) await db.delete(transactions).where(eq(transactions.accountId, accountId));
    await db.delete(merchants).where(inArray(merchants.fingerprint, ["glshop", "weirdco"]));
    await db.delete(llmRuns).where(eq(llmRuns.batchId, "batch_poll"));
    if (accountId) {
      await db.delete(bankAccounts).where(eq(bankAccounts.id, accountId));
      accountId = "";
    }
  });

  it("applies results, learns merchants, caps invalid slug to sonstiges", async () => {
    await ensureAccount();
    await seedTx("GLSHOP", -1500n);
    await seedTx("WEIRDCO", -4200n);
    await db.insert(llmRuns).values({ batchId: "batch_poll", model: "test", itemCount: 2, status: "running" });

    const results = [
      {
        custom_id: "chunk-0",
        result: {
          type: "succeeded",
          message: {
            usage: { input_tokens: 100, output_tokens: 20 },
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  items: [
                    { id: fingerprintOf("GLSHOP", null), merchant_clean: "GL Shop", category_slug: "lebensmittel-supermarkt", is_subscription_hint: false, confidence: 0.95 },
                    { id: fingerprintOf("WEIRDCO", null), merchant_clean: "Weird Co", category_slug: "not_a_real_slug", is_subscription_hint: false, confidence: 0.9 },
                  ],
                }),
              },
            ],
          },
        },
      },
      { custom_id: "chunk-1", result: { type: "errored" } },
    ];

    const out = await pollAndApplyBatches(fakeClient({ status: "ended", results }));
    expect(out.applied).toBe(2);

    const rows = await db.select().from(transactions).where(eq(transactions.accountId, accountId));
    const gl = rows.find((r) => r.counterpartyName === "GLSHOP")!;
    const weird = rows.find((r) => r.counterpartyName === "WEIRDCO")!;
    expect(gl.categorizationSource).toBe("llm");
    expect(gl.confidence).toBeCloseTo(0.95);
    expect(weird.confidence!).toBeLessThanOrEqual(0.3); // invalid slug capped
    expect(weird.merchantId).not.toBeNull();

    const run = await db.select().from(llmRuns).where(eq(llmRuns.batchId, "batch_poll"));
    expect(run[0].status).toBe("ok");
    expect(run[0].inputTokens).toBe(100);
  });
});
