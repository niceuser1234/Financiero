import { afterEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { bankAccounts, categories, merchants, recurringItems, transactions } from "@/db/schema";
import { importHash } from "@/lib/import/hash";
import { runRecurringDetection } from "./apply";

const MARK = `__rectest_${crypto.randomUUID()}__`;
let accountId = "";
let merchantId = "";

async function seedTx(date: string, cents: bigint) {
  await db.insert(transactions).values({
    accountId,
    bookingDate: date,
    amountCents: cents,
    currency: "EUR",
    counterpartyName: MARK,
    merchantId,
    categorizationSource: "llm",
    importHash: importHash({ accountId, bookingDate: date, amountCents: cents, currency: "EUR", counterparty: MARK, purpose: date }),
  });
}

describe("runRecurringDetection", () => {
  afterEach(async () => {
    // FK-Reihenfolge: transactions -> recurring_items -> merchants -> account.
    if (accountId) await db.delete(transactions).where(eq(transactions.accountId, accountId));
    if (merchantId) await db.delete(recurringItems).where(eq(recurringItems.merchantId, merchantId));
    if (merchantId) await db.delete(merchants).where(eq(merchants.id, merchantId));
    if (accountId) await db.delete(bankAccounts).where(eq(bankAccounts.id, accountId));
    accountId = "";
    merchantId = "";
  });

  it("creates a recurring item and links transactions", async () => {
    const [a] = await db.insert(bankAccounts).values({ name: MARK, type: "checking", currency: "EUR" }).returning();
    accountId = a.id;
    const [cat] = await db.select().from(categories).where(eq(categories.slug, "abos-streaming"));
    const [m] = await db
      .insert(merchants)
      .values({ fingerprint: MARK, nameClean: "Testflix", defaultCategoryId: cat.id, isSubscriptionHint: true })
      .returning();
    merchantId = m.id;

    await seedTx("2026-04-15", -999n);
    await seedTx("2026-05-15", -999n);
    await seedTx("2026-06-15", -999n);

    const res = await runRecurringDetection("2026-07-01");
    expect(res.items).toBeGreaterThanOrEqual(1);

    const items = await db.select().from(recurringItems).where(eq(recurringItems.merchantId, merchantId));
    expect(items).toHaveLength(1);
    expect(items[0].cadence).toBe("monthly");
    expect(items[0].monthlyEquivCents).toBe(-999n);

    const linked = await db.select().from(transactions).where(eq(transactions.recurringItemId, items[0].id));
    expect(linked).toHaveLength(3);
  });
});
