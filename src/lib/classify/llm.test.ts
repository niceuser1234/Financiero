import { afterEach, describe, expect, it } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { bankAccounts, llmRuns, merchants, transactions } from "@/db/schema";
import { importHash } from "@/lib/import/hash";
import { fingerprintOf } from "./normalize";
import { chunk, classifyUnknownFingerprints, type ChatClient } from "./llm";

/** Fake-Client: liefert für jede angefragte id eine feste Klassifikation. */
function fakeClient(map: Record<string, { slug: string; name: string }>): ChatClient {
  return {
    chat: async ({ user }) => {
      const payload = JSON.parse(user.slice(user.indexOf("["))) as { id: string }[];
      const items = payload.map((p) => ({
        id: p.id,
        merchant_clean: map[p.id]?.name ?? "Unknown",
        category_slug: map[p.id]?.slug ?? "not_a_real_slug",
        is_subscription_hint: false,
        confidence: 0.95,
      }));
      return { text: JSON.stringify({ items }), inputTokens: 100, outputTokens: 20 };
    },
  };
}

const MARK = `__llmtest_${crypto.randomUUID()}__`;
let accountId: string;

async function ensureAccount() {
  if (accountId) return;
  const [a] = await db.insert(bankAccounts).values({ name: MARK, type: "checking", currency: "EUR" }).returning();
  accountId = a.id;
}

async function seedTx(cp: string, cents: bigint) {
  const [row] = await db.insert(transactions).values({
    accountId,
    bookingDate: "2026-07-01",
    amountCents: cents,
    currency: "EUR",
    counterpartyName: cp,
    categorizationSource: "none",
    importHash: importHash({ accountId, bookingDate: "2026-07-01", amountCents: cents, currency: "EUR", counterparty: cp, purpose: null }),
  }).returning({ id: transactions.id });
  return row.id;
}

describe("chunking", () => {
  it("splits 250 items into 3 chunks of 100/100/50", () => {
    expect(chunk(Array.from({ length: 250 }), 100)).toHaveLength(3);
  });
});

describe("classifyUnknownFingerprints (synchronous)", () => {
  afterEach(async () => {
    if (accountId) await db.delete(transactions).where(eq(transactions.accountId, accountId));
    await db.delete(merchants).where(inArray(merchants.fingerprint, [fingerprintOf("GLSHOP", null), fingerprintOf("WEIRDCO", null)]));
    await db.delete(llmRuns).where(eq(llmRuns.model, "google/gemini-2.5-flash"));
    if (accountId) {
      await db.delete(bankAccounts).where(eq(bankAccounts.id, accountId));
      accountId = "";
    }
  });

  it("applies results in one pass, learns merchants, caps invalid slug to sonstiges", async () => {
    await ensureAccount();
    const txIds = [
      await seedTx("GLSHOP", -1500n),
      await seedTx("GLSHOP", -1600n), // same fp -> one representative, both tx updated
      await seedTx("WEIRDCO", -4200n),
    ];

    const client = fakeClient({
      [fingerprintOf("GLSHOP", null)]: { slug: "lebensmittel-supermarkt", name: "GL Shop" },
      [fingerprintOf("WEIRDCO", null)]: { slug: "not_a_real_slug", name: "Weird Co" },
    });

    const out = await classifyUnknownFingerprints(client, txIds);
    expect(out.classified).toBe(3);

    const rows = await db.select().from(transactions).where(eq(transactions.accountId, accountId));
    const gl = rows.filter((r) => r.counterpartyName === "GLSHOP");
    const weird = rows.find((r) => r.counterpartyName === "WEIRDCO")!;
    expect(gl.every((r) => r.categorizationSource === "llm")).toBe(true);
    expect(gl[0].confidence).toBeCloseTo(0.95);
    expect(weird.confidence!).toBeLessThanOrEqual(0.3); // invalid slug capped
    expect(weird.merchantId).not.toBeNull();
  });
});
