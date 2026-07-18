import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { bankAccounts, categories, transactions } from "@/db/schema";
import { importHash } from "@/lib/import/hash";
import { getDashboardData } from "./queries";

const MARK = `__antest_${crypto.randomUUID()}__`;
let accountId = "";
let foodId = "";

async function tx(date: string, cents: bigint, catId?: string, transfer = false) {
  await db.insert(transactions).values({
    accountId,
    bookingDate: date,
    amountCents: cents,
    currency: "EUR",
    counterpartyName: MARK,
    categoryId: catId,
    isTransfer: transfer,
    importHash: importHash({ accountId, bookingDate: date, amountCents: cents, currency: "EUR", counterparty: MARK, purpose: date + cents }),
  });
}

describe("getDashboardData", () => {
  beforeAll(async () => {
    const [a] = await db.insert(bankAccounts).values({ name: MARK, type: "checking", currency: "EUR", balanceCents: 123456n }).returning();
    accountId = a.id;
    const [food] = await db.select().from(categories).where(eq(categories.slug, "lebensmittel-supermarkt"));
    foodId = food.id;
    await tx("2026-07-05", -3000n, foodId);
    await tx("2026-07-10", -2000n, foodId);
    await tx("2026-07-15", 250000n);
    await tx("2026-07-20", -100000n, undefined, true); // Umbuchung -> ausgeschlossen
  });

  afterAll(async () => {
    await db.delete(transactions).where(eq(transactions.accountId, accountId));
    await db.delete(bankAccounts).where(eq(bankAccounts.id, accountId));
  });

  it("computes month income and expenses excluding transfers", async () => {
    const d = await getDashboardData(new Date("2026-07-25"));
    expect(d.incomeMonthCents).toBe(250000n);
    expect(d.expensesMonthCents).toBe(-5000n); // Umbuchung -100000 nicht enthalten
  });

  it("rolls expenses up to the top-level category", async () => {
    const d = await getDashboardData(new Date("2026-07-25"));
    const food = d.byCategory.find((c) => c.name === "Lebensmittel");
    expect(food?.sumCents).toBe(-5000n);
  });

  it("returns a 6-month trend ending in the current month", async () => {
    const d = await getDashboardData(new Date("2026-07-25"));
    expect(d.trend).toHaveLength(6);
    expect(d.trend[5].month).toBe("2026-07");
    expect(d.trend[5].incomeCents).toBe(250000n);
  });
});
